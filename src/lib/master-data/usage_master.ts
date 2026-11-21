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

let usageByLabelCache: Map<string, ElectronicUsageOption> | null = null;
let usageByPrescriptionCodeCache: Map<string, ElectronicUsageOption> | null = null;

function ensureUsageLookupCaches(): void {
  if (usageByLabelCache && usageByPrescriptionCodeCache) return;
  usageByLabelCache = new Map<string, ElectronicUsageOption>();
  usageByPrescriptionCodeCache = new Map<string, ElectronicUsageOption>();
  for (const option of ELECTRONIC_USAGE_OPTIONS) {
    usageByLabelCache.set(option.label, option);
    if (option.prescriptionCode) {
      usageByPrescriptionCodeCache.set(option.prescriptionCode, option);
    }
  }
}

/**
 * 厚労省電子処方箋用法マスタ（1,775件・label 一意）から用法名称の完全一致で候補を引く。
 * 未一致時は推定・捏造せず undefined を返す（金科玉条 第三条・第四条）。
 */
export function findElectronicUsageOptionByLabel(label?: string): ElectronicUsageOption | undefined {
  const trimmed = (label || '').trim();
  if (!trimmed) return undefined;
  ensureUsageLookupCaches();
  return usageByLabelCache!.get(trimmed);
}

/**
 * 16桁の電子処方箋用法コード（項番1）から公式マスタ候補を引く。
 */
export function findElectronicUsageOptionByPrescriptionCode(
  prescriptionCode?: string
): ElectronicUsageOption | undefined {
  const trimmed = (prescriptionCode || '').trim();
  if (!trimmed) return undefined;
  ensureUsageLookupCaches();
  return usageByPrescriptionCodeCache!.get(trimmed);
}

/**
 * 処方明細から公式の調剤レセプト用法コード（項番19 / 別表12・3桁）を解決する。
 * 1. electronicUsageCode（16桁）が公式マスタに存在すればその3桁コードを採用。
 * 2. 未設定時は usage（用法名称）の公式マスタ完全一致から3桁コードを採用。
 * 3. いずれも一致しない自由記載・旧形式は捏造せず undefined を返す。
 */
export function resolveReceiptUsageCodeForItem(item: {
  electronicUsageCode?: string;
  usage?: string;
}): string | undefined {
  const byCode = findElectronicUsageOptionByPrescriptionCode(item.electronicUsageCode);
  if (byCode && /^\d{3}$/.test(byCode.code)) {
    return byCode.code;
  }
  const byLabel = findElectronicUsageOptionByLabel(item.usage);
  if (byLabel && /^\d{3}$/.test(byLabel.code)) {
    return byLabel.code;
  }
  return undefined;
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
