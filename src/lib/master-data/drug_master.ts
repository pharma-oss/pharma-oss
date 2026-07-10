import { getFormulationType } from '@/lib/calculator';
import { getDrugMasterRecordsFromJson, getMasterDataSeedPayload } from './sqlite_seed';
import { getSeededSQLiteMasterDataStore } from './sqlite_master_store';
import type { DrugMasterRecord } from './types';

export type { DrugMasterRecord };

async function getSeededStore() {
  return getSeededSQLiteMasterDataStore(await getMasterDataSeedPayload());
}

// 【般】一般名処方マスタ(一般名コード: 末尾ZZZ)は処方箋の記載用概念であり、
// 在庫・調剤・ピッキングの実体(銘柄)ではない。実体を扱う画面では除外する。
export function isGeneralNameDrugRecord(drug: { code?: string; name?: string }): boolean {
  return String(drug.code || '').toUpperCase().endsWith('ZZZ') || String(drug.name || '').includes('【般】');
}

export async function getDrugMasterRecords(): Promise<DrugMasterRecord[]> {
  const fallbackRecords = await getDrugMasterRecordsFromJson();
  const sqliteStore = await getSeededStore();
  if (!sqliteStore) return fallbackRecords;

  try {
    return await sqliteStore.getDrugs();
  } catch (error) {
    console.warn('[DrugMaster] SQLite getDrugs failed; using JSON fallback.', error);
    return fallbackRecords;
  }
}

export async function searchDrugMaster(query: string, limit = 100): Promise<DrugMasterRecord[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const sqliteStore = await getSeededStore();
  if (sqliteStore) {
    try {
      return await sqliteStore.searchDrugs(normalizedQuery, limit);
    } catch (error) {
      console.warn('[DrugMaster] SQLite search failed; using JSON fallback.', error);
    }
  }

  const results: DrugMasterRecord[] = [];
  const drugs = await getDrugMasterRecordsFromJson();
  for (let i = 0; i < drugs.length; i++) {
    const drug = drugs[i];
    if (drug.searchNameLower.includes(normalizedQuery) || drug.searchGenericLower.includes(normalizedQuery)) {
      results.push(drug);
      if (results.length >= limit) break;
    }
  }
  return results;
}

export async function findDrugMasterRecordByCode(code: string): Promise<DrugMasterRecord | undefined> {
  const normalizedCode = code.trim().toLowerCase();
  if (!normalizedCode) return undefined;

  const drugs = await getDrugMasterRecords();
  return drugs.find((drug) => (
    drug.code.toLowerCase() === normalizedCode ||
    (drug.yjCode || '').toLowerCase() === normalizedCode
  ));
}

export async function findSubstitutionCandidates(prescribedDrugCode: string): Promise<DrugMasterRecord[]> {
  if (!prescribedDrugCode || prescribedDrugCode.length < 7) return [];

  const prefix = prescribedDrugCode.substring(0, 7);
  const expectedFormulation = getFormulationType(prescribedDrugCode);
  const sqliteStore = await getSeededStore();

  if (sqliteStore) {
    try {
      const candidates = await sqliteStore.findDrugsByYjPrefix(prefix);
      return candidates.filter((drug) => drug.yjCode && getFormulationType(drug.yjCode) === expectedFormulation);
    } catch (error) {
      console.warn('[DrugMaster] SQLite substitution search failed; using JSON fallback.', error);
    }
  }

  const candidates: DrugMasterRecord[] = [];
  const drugs = await getDrugMasterRecordsFromJson();

  for (let i = 0; i < drugs.length; i++) {
    const drug = drugs[i];
    if (!drug.yjCode?.startsWith(prefix)) continue;
    if (getFormulationType(drug.yjCode) !== expectedFormulation) continue;
    candidates.push(drug);
  }

  return candidates;
}
