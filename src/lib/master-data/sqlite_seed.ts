import { ELECTRONIC_USAGE_OPTIONS } from './usage_options';
import type { DrugMasterRecord, MasterDataSeedPayload } from './types';

let cachedDrugMaster: DrugMasterRecord[] | null = null;
let cachedSeedPayload: MasterDataSeedPayload | null = null;

export function normalizeDrugMasterRecord(rawDrug: any): DrugMasterRecord {
  const name = String(rawDrug.name || '');
  const genericName = rawDrug.genericName ? String(rawDrug.genericName) : undefined;

  return {
    code: String(rawDrug.code || ''),
    name,
    yjCode: rawDrug.yjCode ? String(rawDrug.yjCode) : undefined,
    isGeneric: !!rawDrug.isGeneric,
    genericName,
    isAbolished: !!rawDrug.isAbolished,
    price: Number(rawDrug.price || 0),
    documentUrl: rawDrug.documentUrl ? String(rawDrug.documentUrl) : undefined,
    stockQuantity: Number(rawDrug.stockQuantity || 0),
    location: rawDrug.location ? String(rawDrug.location) : undefined,
    isNarcotic: !!rawDrug.isNarcotic,
    isPsychotropic: !!rawDrug.isPsychotropic,
    isPoisonous: !!rawDrug.isPoisonous,
    isHighRisk: !!rawDrug.isHighRisk,
    searchNameLower: name.toLowerCase(),
    searchGenericLower: (genericName || '').toLowerCase()
  };
}

function inferDrugInfoGenericFlag(name: string, genericName?: string) {
  if (/「[^」]+」/.test(name)) return true;
  if (!genericName) return false;

  const ingredientStem = genericName.split(/[錠散細粒顆粒カプセル液注シロップクリーム軟膏テープパップ]/)[0];
  return ingredientStem.length >= 3 && name.startsWith(ingredientStem);
}

function normalizeDrugInfoMasterRecord(rawDrugInfo: any): DrugMasterRecord {
  const id = String(rawDrugInfo.id || '');
  const code = id.replace(/^drug_info_/, '');
  const name = String(rawDrugInfo.drugName || '');
  const genericName = rawDrugInfo.genericName ? String(rawDrugInfo.genericName) : undefined;

  return {
    code,
    name,
    yjCode: code,
    isGeneric: inferDrugInfoGenericFlag(name, genericName),
    genericName,
    isAbolished: false,
    price: 0,
    stockQuantity: 0,
    searchNameLower: name.toLowerCase(),
    searchGenericLower: (genericName || '').toLowerCase()
  };
}

export async function getDrugMasterRecordsFromJson(): Promise<DrugMasterRecord[]> {
  if (cachedDrugMaster) return cachedDrugMaster;

  const [{ default: rawDrugData }, { default: rawGeneralDrugData }, { default: rawDrugInfoData }] = await Promise.all([
    import('@/lib/data/drugs.json'),
    import('@/lib/data/general_drugs.json'),
    import('@/lib/data/drug_infos.json')
  ]);
  const byCode = new Map<string, DrugMasterRecord>();
  for (const rawDrug of [...(rawDrugData as any[]), ...(rawGeneralDrugData as any[])]) {
    const drug = normalizeDrugMasterRecord(rawDrug);
    if (!drug.code || !drug.name) continue;
    byCode.set(drug.code, drug);
  }

  // 添付文書由来レコードの code はYJコードで、薬価マスター側(レセ電コード)とは
  // コード体系が異なる。code だけで重複排除すると同じ薬が「薬価0円のYJコード行」
  // として二重に検索候補へ並び、誤選択すると請求コード・薬価が不正になるため、
  // 既存行とYJコードまたは薬品名が一致するものは追加しない。
  const knownYjCodes = new Set<string>();
  const knownNames = new Set<string>();
  for (const drug of byCode.values()) {
    if (drug.yjCode) knownYjCodes.add(drug.yjCode);
    knownNames.add(drug.name.normalize('NFKC'));
  }
  for (const rawDrugInfo of rawDrugInfoData as any[]) {
    const drug = normalizeDrugInfoMasterRecord(rawDrugInfo);
    if (!drug.code || !drug.name || byCode.has(drug.code)) continue;
    if (knownYjCodes.has(drug.code) || knownNames.has(drug.name.normalize('NFKC'))) continue;
    byCode.set(drug.code, drug);
  }

  cachedDrugMaster = Array.from(byCode.values());
  return cachedDrugMaster;
}

export async function getMasterDataSeedPayload(): Promise<MasterDataSeedPayload> {
  if (cachedSeedPayload) return cachedSeedPayload;

  const drugs = await getDrugMasterRecordsFromJson();
  cachedSeedPayload = {
    version: buildMasterDataVersion(drugs),
    drugs,
    usageOptions: ELECTRONIC_USAGE_OPTIONS
  };
  return cachedSeedPayload;
}

function buildMasterDataVersion(drugs: DrugMasterRecord[]) {
  let hash = 2166136261;

  const updateHash = (value: string | number | boolean | undefined) => {
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  };

  for (const drug of drugs) {
    updateHash(drug.code);
    updateHash(drug.name);
    updateHash(drug.yjCode);
    updateHash(drug.genericName);
    updateHash(drug.isGeneric);
    updateHash(drug.price);
  }
  for (const usage of ELECTRONIC_USAGE_OPTIONS) {
    updateHash(usage.code);
    updateHash(usage.label);
  }

  return `master-data-v1:${drugs.length}:${ELECTRONIC_USAGE_OPTIONS.length}:${(hash >>> 0).toString(16)}`;
}
