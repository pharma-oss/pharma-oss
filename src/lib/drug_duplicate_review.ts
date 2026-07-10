// 薬品マスタの重複候補点検。
// 医薬品マスタにはYJコードを共有する正規の行(一般名収載行と銘柄行など)が大量にあるため、
// 「店舗で実際に使っている薬品(在庫・処方参照・棚番地あり)が絡むグループ」だけを
// 統合候補として提示する。統合の実行は drug_merge / drug_merge_execution が担う。
import type { Drug } from '../db/types.ts';
import { isDemoDrugCode } from './demo_data.ts';
import { normalizePatientName } from './patient_matching.ts';

export type DrugDuplicateMatchType = 'yj_code' | 'name';

export interface DrugDuplicateUsage {
  stockLotCount: number;
  prescriptionItemCount: number;
}

export interface DrugDuplicateMember {
  code: string;
  name: string;
  yjCode: string;
  price?: number;
  location: string;
  isAbolished: boolean;
  stockQuantity: number;
  stockLotCount: number;
  prescriptionItemCount: number;
}

export interface DrugDuplicateGroup {
  groupId: string;
  matchType: DrugDuplicateMatchType;
  matchLabel: string;
  displayName: string;
  // 名称一致グループで複数の異なるYJコードが混在する場合は別薬品の可能性があるため統合不可
  hasYjConflict: boolean;
  // 統合先の推奨(廃止でない→処方参照が多い→在庫が多い順)を先頭に並べる
  members: DrugDuplicateMember[];
  suggestedTargetCode: string;
}

export interface DrugDuplicateScanReport {
  scannedDrugCount: number;
  groups: DrugDuplicateGroup[];
  duplicateDrugCount: number;
  // 店舗で未使用のマスタ由来重複(一般名収載行と銘柄行の同居など)は表示しない
  inactiveGroupCount: number;
}

const MATCH_LABELS: Record<DrugDuplicateMatchType, string> = {
  yj_code: 'YJコードが一致',
  name: '薬品名が一致'
};

// 【般】一般名処方マスタ行(コード末尾ZZZ)は在庫・調剤の実体ではないため点検対象外。
// 判定は src/lib/master-data/drug_master.ts の isGeneralNameDrugRecord と同一。
// (同モジュールはSQLite seedへ依存するため、純関数のこのライブラリでは再定義する)
function isGeneralNameRow(drug: Pick<Drug, 'code' | 'name'>): boolean {
  return String(drug.code || '').toUpperCase().endsWith('ZZZ') || String(drug.name || '').includes('【般】');
}

function buildMember(drug: Drug, usage: Map<string, DrugDuplicateUsage>): DrugDuplicateMember {
  const stats = usage.get(drug.code);
  return {
    code: drug.code,
    name: drug.name || '',
    yjCode: drug.yjCode || '',
    price: drug.price,
    location: drug.location || '',
    isAbolished: !!drug.isAbolished,
    stockQuantity: drug.stockQuantity || 0,
    stockLotCount: stats?.stockLotCount || 0,
    prescriptionItemCount: stats?.prescriptionItemCount || 0
  };
}

// 店舗運用に関係する薬品か(在庫・処方参照・棚番地のいずれかがある)
function isStoreActive(member: DrugDuplicateMember): boolean {
  return member.stockLotCount > 0 ||
    member.stockQuantity > 0 ||
    member.prescriptionItemCount > 0 ||
    member.location !== '';
}

function sortMembers(members: DrugDuplicateMember[]): DrugDuplicateMember[] {
  return [...members].sort((left, right) => (
    Number(left.isAbolished) - Number(right.isAbolished) ||
    right.prescriptionItemCount - left.prescriptionItemCount ||
    right.stockLotCount - left.stockLotCount ||
    right.stockQuantity - left.stockQuantity ||
    left.code.localeCompare(right.code)
  ));
}

export function buildDrugUsageStats(input: {
  stocks: Array<{ drugCode?: string }>;
  prescriptionItems: Array<{ drugId?: string; dispensedDrugCode?: string }>;
}): Map<string, DrugDuplicateUsage> {
  const usage = new Map<string, DrugDuplicateUsage>();
  const entry = (code?: string) => {
    if (!code) return null;
    const existing = usage.get(code) || { stockLotCount: 0, prescriptionItemCount: 0 };
    usage.set(code, existing);
    return existing;
  };
  for (const stock of input.stocks) {
    const stats = entry(stock.drugCode);
    if (stats) stats.stockLotCount++;
  }
  for (const item of input.prescriptionItems) {
    const prescribed = entry(item.drugId);
    if (prescribed) prescribed.prescriptionItemCount++;
    if (item.dispensedDrugCode && item.dispensedDrugCode !== item.drugId) {
      const dispensed = entry(item.dispensedDrugCode);
      if (dispensed) dispensed.prescriptionItemCount++;
    }
  }
  return usage;
}

export function findDuplicateDrugGroups(
  drugs: Drug[],
  usage: Map<string, DrugDuplicateUsage> = new Map()
): DrugDuplicateScanReport {
  const targets = drugs.filter((drug) => !isDemoDrugCode(drug.code) && !isGeneralNameRow(drug));

  const byYj = new Map<string, Drug[]>();
  const byName = new Map<string, Drug[]>();
  for (const drug of targets) {
    const yjCode = String(drug.yjCode || '').trim();
    if (yjCode) byYj.set(yjCode, [...(byYj.get(yjCode) || []), drug]);
    const nameKey = normalizePatientName(drug.name || '');
    if (nameKey) byName.set(nameKey, [...(byName.get(nameKey) || []), drug]);
  }

  const groups: DrugDuplicateGroup[] = [];
  let inactiveGroupCount = 0;
  const groupedMemberSets: Set<string>[] = [];

  const addGroup = (matchType: DrugDuplicateMatchType, groupDrugs: Drug[]) => {
    const memberCodes = new Set(groupDrugs.map((drug) => drug.code));
    const alreadyCovered = groupedMemberSets.some((existing) => (
      memberCodes.size <= existing.size && [...memberCodes].every((code) => existing.has(code))
    ));
    if (alreadyCovered) return;

    const members = sortMembers(groupDrugs.map((drug) => buildMember(drug, usage)));
    if (!members.some(isStoreActive)) {
      inactiveGroupCount++;
      return;
    }
    groupedMemberSets.push(memberCodes);

    const yjCodes = new Set(members.map((member) => member.yjCode).filter(Boolean));
    groups.push({
      groupId: `drugdup_${matchType}_${members.map((member) => member.code).join('_')}`,
      matchType,
      matchLabel: MATCH_LABELS[matchType],
      displayName: members[0].name,
      hasYjConflict: yjCodes.size > 1,
      members,
      suggestedTargetCode: members[0].code
    });
  };

  for (const groupDrugs of byYj.values()) {
    if (groupDrugs.length >= 2) addGroup('yj_code', groupDrugs);
  }
  for (const groupDrugs of byName.values()) {
    if (groupDrugs.length >= 2) addGroup('name', groupDrugs);
  }

  groups.sort((left, right) => {
    const leftUsage = left.members.reduce((sum, member) => sum + member.prescriptionItemCount + member.stockLotCount, 0);
    const rightUsage = right.members.reduce((sum, member) => sum + member.prescriptionItemCount + member.stockLotCount, 0);
    return rightUsage - leftUsage || left.displayName.localeCompare(right.displayName, 'ja');
  });

  const duplicateDrugCodes = new Set<string>();
  for (const group of groups) {
    for (const member of group.members) duplicateDrugCodes.add(member.code);
  }

  return {
    scannedDrugCount: targets.length,
    groups,
    duplicateDrugCount: duplicateDrugCodes.size,
    inactiveGroupCount
  };
}

// 監査ログ用の要約。件数のみを記録する。
export function buildDrugDuplicateScanAuditDetail(report: DrugDuplicateScanReport): string {
  return `薬品重複点検: 対象${report.scannedDrugCount}件 / 統合候補${report.groups.length}グループ・${report.duplicateDrugCount}件 / 店舗未使用のマスタ由来重複${report.inactiveGroupCount}グループは対象外`;
}
