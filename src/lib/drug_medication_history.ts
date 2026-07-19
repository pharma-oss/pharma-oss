// 薬剤起点の薬歴遡及: 特定の薬を条件に、過去のどの受付でその薬が
// どんな用法用量・日数で、どの医療機関・処方医から出たか、そしてその時の
// SOAP(薬歴)はどうだったかを時系列で辿るための純粋ロジック。

export type SoapEntryType = 'S' | 'O' | 'A' | 'P';

export interface MedHistoryVisit {
  visitId: string;
  patientId?: string;
  doctorName?: string;
  institutionName?: string;
  departmentName?: string;
  prescriptionDate?: string;
  dispensingDate?: string;
  issueDate?: string;
  status?: string;
}

export interface MedHistoryPrescriptionItem {
  visitId: string;
  drugId: string;
  drugName?: string;
  dispensedDrug?: string;
  dispensedDrugCode?: string;
  amount: number;
  usage?: string;
  days: number;
  rpComment?: string;
  changeReason?: string;
}

export interface MedHistorySoapEntry {
  type: SoapEntryType;
  text: string;
}

export interface MedHistorySoapProblem {
  id?: string;
  title: string;
  entries: MedHistorySoapEntry[];
}

export interface MedHistorySoapRecord {
  visitId: string;
  problems: MedHistorySoapProblem[];
  updatedAt?: string;
}

export interface DrugHistoryPrescription {
  drugId: string;
  drugLabel: string;
  amount: number;
  usage?: string;
  days: number;
  rpComment?: string;
  /** 変更調剤で実際に出した薬が処方薬と異なる場合の調剤薬名 */
  substitutedTo?: string;
  changeReason?: string;
}

export interface DrugHistoryVisitEntry {
  visitId: string;
  date?: string;
  doctorName?: string;
  institutionName?: string;
  departmentName?: string;
  prescriptions: DrugHistoryPrescription[];
  soap?: MedHistorySoapRecord;
  hasSoap: boolean;
}

export interface DrugMedicationHistory {
  anchorLabel: string;
  totalVisits: number;
  lastDispensedDate?: string;
  entries: DrugHistoryVisitEntry[];
}

export interface PatientPrescribedDrug {
  drugId: string;
  label: string;
  matchKeys: string[];
  matchNames: string[];
  occurrences: number;
  lastDate?: string;
}

export type MedHistoryDrugNameLookup = Map<string, string> | Record<string, string>;

function normalizeKey(value: string | undefined | null): string {
  return String(value ?? '').trim();
}

/** 全角半角ゆれを吸収した名前比較用の正規化。 */
function normalizeComparableName(value: string | undefined | null): string {
  return String(value ?? '').normalize('NFKC').trim();
}

function drugNameFromLookup(
  lookup: MedHistoryDrugNameLookup | undefined,
  drugId: string | undefined
): string | undefined {
  const key = normalizeKey(drugId);
  if (!lookup || !key) return undefined;
  if (lookup instanceof Map) return lookup.get(key);
  return lookup[key];
}

const NO_SUBSTITUTION_LABELS = ['変更なし', '変更調剤なし'];

// 受付保存時は変更なしでも dispensedDrug に処方薬名がそのまま入るため、
// 「値が入っている」だけでは変更調剤と判定できない。調剤コードがあれば
// コード同士、なければ処方薬名(マスター解決名 or 項目のdrugName)との
// 実質比較で判定する。
function isSubstitutedDispense(
  item: MedHistoryPrescriptionItem,
  prescribedLookupName: string | undefined
): boolean {
  const dispensed = normalizeKey(item.dispensedDrug);
  if (!dispensed || NO_SUBSTITUTION_LABELS.includes(dispensed)) return false;

  const dispensedCode = normalizeKey(item.dispensedDrugCode);
  const drugId = normalizeKey(item.drugId);
  if (dispensedCode && drugId) return dispensedCode !== drugId;

  const prescribedName = normalizeComparableName(prescribedLookupName || item.drugName);
  if (!prescribedName) return false;
  return normalizeComparableName(dispensed) !== prescribedName;
}

/** prescriptionDate を最優先に、その受付の代表日付を返す。 */
function bestVisitDate(visit: MedHistoryVisit | undefined): string | undefined {
  if (!visit) return undefined;
  return visit.prescriptionDate || visit.dispensingDate || visit.issueDate || undefined;
}

/** 日付文字列を比較可能な数値へ。パースできなければ -Infinity。 */
function dateValue(date: string | undefined): number {
  if (!date) return Number.NEGATIVE_INFINITY;
  const parsed = new Date(date.replace(/\//g, '-')).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

// 処方行の表示名。マスター解決名を最優先し、変更調剤の行では
// 調剤薬名(substitutedTo側で表示される)を処方名の代わりに使わない。
function itemDrugLabel(
  item: MedHistoryPrescriptionItem,
  prescribedLookupName: string | undefined,
  substituted: boolean
): string {
  return normalizeKey(prescribedLookupName)
    || normalizeKey(item.drugName)
    || (substituted ? '' : normalizeKey(item.dispensedDrug))
    || normalizeKey(item.drugId)
    || '薬剤';
}

function matchesItem(
  item: MedHistoryPrescriptionItem,
  keys: Set<string>,
  names: Set<string>
): boolean {
  const drugId = normalizeKey(item.drugId);
  const dispensedCode = normalizeKey(item.dispensedDrugCode);
  if (drugId && keys.has(drugId)) return true;
  if (dispensedCode && keys.has(dispensedCode)) return true;
  if (names.size > 0) {
    const drugName = normalizeKey(item.drugName);
    const dispensedDrug = normalizeKey(item.dispensedDrug);
    if (drugName && names.has(drugName)) return true;
    if (dispensedDrug && names.has(dispensedDrug)) return true;
  }
  return false;
}

/**
 * 特定の薬(matchKeys / matchNames で同定)が登場する過去受付を、
 * 新しい順に並べた薬歴履歴として組み立てる。
 */
export function buildDrugMedicationHistory(params: {
  anchorLabel: string;
  matchKeys: string[];
  matchNames?: string[];
  visits: MedHistoryVisit[];
  items: MedHistoryPrescriptionItem[];
  soapRecords?: MedHistorySoapRecord[];
  includeStatuses?: string[];
  excludeStatuses?: string[];
  /** drugId(レセ電コード)→薬品マスター名。処方名表示と変更調剤判定に使う。 */
  drugNamesById?: MedHistoryDrugNameLookup;
}): DrugMedicationHistory {
  const keys = new Set(params.matchKeys.map(normalizeKey).filter(Boolean));
  const names = new Set((params.matchNames ?? []).map(normalizeKey).filter(Boolean));
  const includeStatuses = params.includeStatuses
    ? new Set(params.includeStatuses)
    : null;
  const excludeStatuses = new Set(params.excludeStatuses ?? ['cancelled']);

  const visitMap = new Map<string, MedHistoryVisit>();
  for (const visit of params.visits) {
    visitMap.set(visit.visitId, visit);
  }
  const soapMap = new Map<string, MedHistorySoapRecord>();
  for (const soap of params.soapRecords ?? []) {
    soapMap.set(soap.visitId, soap);
  }

  const matchedByVisit = new Map<string, DrugHistoryPrescription[]>();
  for (const item of params.items) {
    if (!matchesItem(item, keys, names)) continue;
    const visit = visitMap.get(item.visitId);
    if (!visit) continue;
    const status = normalizeKey(visit.status);
    if (excludeStatuses.has(status)) continue;
    if (includeStatuses && !includeStatuses.has(status)) continue;

    const lookupName = drugNameFromLookup(params.drugNamesById, item.drugId);
    const substituted = isSubstitutedDispense(item, lookupName);
    const substitutedTo = substituted ? normalizeKey(item.dispensedDrug) : undefined;

    const list = matchedByVisit.get(item.visitId) ?? [];
    list.push({
      drugId: normalizeKey(item.drugId),
      drugLabel: itemDrugLabel(item, lookupName, substituted),
      amount: Number(item.amount) || 0,
      usage: item.usage,
      days: Number(item.days) || 0,
      rpComment: item.rpComment,
      substitutedTo,
      changeReason: item.changeReason
    });
    matchedByVisit.set(item.visitId, list);
  }

  const entries: DrugHistoryVisitEntry[] = [];
  for (const [visitId, prescriptions] of matchedByVisit.entries()) {
    const visit = visitMap.get(visitId);
    const soap = soapMap.get(visitId);
    const hasSoap = !!soap && soap.problems.some((problem) =>
      problem.entries.some((entry) => normalizeKey(entry.text).length > 0));
    entries.push({
      visitId,
      date: bestVisitDate(visit),
      doctorName: visit?.doctorName,
      institutionName: visit?.institutionName,
      departmentName: visit?.departmentName,
      prescriptions,
      soap: hasSoap ? soap : undefined,
      hasSoap
    });
  }

  entries.sort((a, b) => dateValue(b.date) - dateValue(a.date));

  return {
    anchorLabel: params.anchorLabel,
    totalVisits: entries.length,
    lastDispensedDate: entries[0]?.date,
    entries
  };
}

/**
 * 患者の処方履歴から、薬剤セレクタ用の一意な薬リストを作る。
 * 各薬には同定キー(drugId と調剤コード)と登場回数・最終処方日を付ける。
 */
export function listPatientPrescribedDrugs(
  items: MedHistoryPrescriptionItem[],
  visits: MedHistoryVisit[],
  options: { drugNamesById?: MedHistoryDrugNameLookup } = {}
): PatientPrescribedDrug[] {
  const visitDate = new Map<string, string | undefined>();
  for (const visit of visits) {
    visitDate.set(visit.visitId, bestVisitDate(visit));
  }

  const byDrug = new Map<string, PatientPrescribedDrug>();
  for (const item of items) {
    const drugId = normalizeKey(item.drugId);
    if (!drugId) continue;
    const label = normalizeKey(drugNameFromLookup(options.drugNamesById, drugId))
      || normalizeKey(item.drugName)
      || normalizeKey(item.dispensedDrug)
      || drugId;
    const date = visitDate.get(item.visitId);

    const existing = byDrug.get(drugId);
    if (existing) {
      existing.occurrences += 1;
      if (dateValue(date) > dateValue(existing.lastDate)) existing.lastDate = date;
      const dispensedCode = normalizeKey(item.dispensedDrugCode);
      if (dispensedCode && !existing.matchKeys.includes(dispensedCode)) existing.matchKeys.push(dispensedCode);
      const dispensedName = normalizeKey(item.dispensedDrug);
      if (dispensedName && !existing.matchNames.includes(dispensedName)) existing.matchNames.push(dispensedName);
    } else {
      const matchKeys = [drugId];
      const dispensedCode = normalizeKey(item.dispensedDrugCode);
      if (dispensedCode) matchKeys.push(dispensedCode);
      const matchNames: string[] = [];
      const drugName = normalizeKey(item.drugName);
      if (drugName) matchNames.push(drugName);
      const dispensedName = normalizeKey(item.dispensedDrug);
      if (dispensedName && dispensedName !== drugName) matchNames.push(dispensedName);
      byDrug.set(drugId, { drugId, label, matchKeys, matchNames, occurrences: 1, lastDate: date });
    }
  }

  return Array.from(byDrug.values()).sort((a, b) => dateValue(b.lastDate) - dateValue(a.lastDate));
}
