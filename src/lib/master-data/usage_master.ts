import { getMasterDataSeedPayload } from './sqlite_seed';
import { canUseSQLiteMasterDataStore, getSeededSQLiteMasterDataStore } from './sqlite_master_store';
import { ELECTRONIC_USAGE_OPTIONS } from './usage_options';
import type { ElectronicUsageOption } from './types';

export { ELECTRONIC_USAGE_OPTIONS };
export type { ElectronicUsageOption };

export function formatElectronicUsage(option: ElectronicUsageOption): string {
  return `${option.code} ${option.label}`;
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
