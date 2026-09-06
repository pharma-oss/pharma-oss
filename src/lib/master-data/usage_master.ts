import { getMasterDataSeedPayload } from './sqlite_seed';
import { canUseSQLiteMasterDataStore, getSeededSQLiteMasterDataStore } from './sqlite_master_store';
import { ELECTRONIC_USAGE_OPTIONS } from './usage_options';
import type { ElectronicUsageOption } from './types';
import type { DosageCategory } from '@/lib/dosage_category';

export { ELECTRONIC_USAGE_OPTIONS };
export type { ElectronicUsageOption };

export function formatElectronicUsage(option: ElectronicUsageOption): string {
  return `${option.code} ${option.label}`;
}

/**
 * 内滴（内用滴剤）で選べる用法。
 * 用法マスタに内滴の基本用法区分が無く、実務で使う用法も限られるため、
 * 利用者判断により次の 3 件に限定する（表示順もこの順）。
 */
export const INTERNAL_DROP_USAGE_PRESCRIPTION_CODES = [
  '1011100000000000', // １日１回就寝前　服用
  '1050W20000000000', // 適宜　服用
  '1050410000000000', // 便秘時　服用
] as const;

/** 指定した剤形で選べる用法候補。category 未設定の候補（未コード化用法など）は常に含める。 */
export function filterUsageOptionsByCategory(
  options: ElectronicUsageOption[],
  category: DosageCategory
): ElectronicUsageOption[] {
  if (category === 'internal_drop') {
    const map = new Map<string, ElectronicUsageOption>();
    for (const option of options) {
      if (option.prescriptionCode) {
        map.set(option.prescriptionCode, option);
      }
    }
    const results: ElectronicUsageOption[] = [];
    for (const code of INTERNAL_DROP_USAGE_PRESCRIPTION_CODES) {
      const option = map.get(code);
      if (option) {
        results.push(option);
      }
    }
    return results;
  }

  return options.filter((option) => !option.category || option.category === category);
}

async function getSeededUsageStore() {
  if (!canUseSQLiteMasterDataStore()) return null;
  return getSeededSQLiteMasterDataStore(await getMasterDataSeedPayload());
}

export async function getElectronicUsageOptions(): Promise<ElectronicUsageOption[]> {
  const sqliteStore = await getSeededUsageStore();
  if (sqliteStore) {
    try {
      return await sqliteStore.getUsageOptions();
    } catch (error) {
      console.warn('[UsageMaster] SQLite getUsageOptions failed; using static fallback.', error);
    }
  }
  return ELECTRONIC_USAGE_OPTIONS;
}

export async function searchElectronicUsageOptions(query: string, limit = 50): Promise<ElectronicUsageOption[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return ELECTRONIC_USAGE_OPTIONS.slice(0, limit);

  const sqliteStore = await getSeededUsageStore();
  if (sqliteStore) {
    try {
      return await sqliteStore.searchUsageOptions(normalizedQuery, limit);
    } catch (error) {
      console.warn('[UsageMaster] SQLite search failed; using static fallback.', error);
    }
  }

  const results: ElectronicUsageOption[] = [];
  for (const option of ELECTRONIC_USAGE_OPTIONS) {
    if (option.code.includes(normalizedQuery) || option.label.toLowerCase().includes(normalizedQuery)) {
      results.push(option);
      if (results.length >= limit) break;
    }
  }
  return results;
}
