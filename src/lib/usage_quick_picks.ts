// 処方入力の「よく使う用法」。電子処方箋用法マスタ(1,700件超)をモーダルで検索する前に、
// ワンタップで選べる候補を出すための純粋関数群。
// 並びは「最近使った用法 → 剤形ごとの定番」。定番は用法マスタの電子処方箋用法コードで固定する。
import type { DosageCategory } from '@/lib/dosage_category';
import type { ElectronicUsageOption } from '@/lib/master-data/types';
import { filterUsageOptionsByCategory } from '@/lib/master-data/usage_master';

export const USAGE_RECENTS_STORAGE_KEY = 'yakureki:usage-recents:v1';
export const USAGE_RECENTS_LIMIT = 6;
export const QUICK_USAGE_LIMIT = 8;

// 内服は「毎食後」に当たる朝昼夕食後を先頭に、頻度の高い順。
export const QUICK_USAGE_PRESCRIPTION_CODES: Partial<Record<DosageCategory, readonly string[]>> = {
  internal: [
    '1013044400000000', // １日３回朝昼夕食後
    '1011000400000000', // １日１回朝食後
    '1012040400000000', // １日２回朝夕食後
    '1011040000000000', // １日１回夕食後
    '1011100000000000', // １日１回就寝前
    '1013011100000000', // １日３回朝昼夕食前
    '1012004400000000' // １日２回朝昼食後
  ],
  as_needed: [
    '1050110000000000', // 疼痛時
    '1050710000000000', // 発熱時
    '1050W20000000000', // 適宜
    '1050B50000000000' // 就寝前
  ],
  external: [
    '2B72000000000000', // １日２回　塗布
    '2B71000000000000', // １日１回　塗布
    '2B73000000000000', // １日３回　塗布
    '2B62090900000000', // １日２回朝夕　塗布
    '2B50W20000000000', // 適宜　塗布
    '2H72000000000000', // １日２回　点眼
    '2H73000000000000', // １日３回　点眼
    '2H74000000000000', // １日４回　点眼
    '2H50B50000000000', // 就寝前　点眼
    '2A71000000000000', // １日１回　貼付
    '2L71000000000000' // １日１回　吸入
  ]
};

export interface QuickUsageParams {
  category: DosageCategory;
  options: ElectronicUsageOption[];
  /** 最近使った用法の名称(新しい順) */
  recentLabels?: readonly string[];
  limit?: number;
}

export function buildQuickUsageOptions({
  category,
  options,
  recentLabels = [],
  limit = QUICK_USAGE_LIMIT
}: QuickUsageParams): ElectronicUsageOption[] {
  const allowed = filterUsageOptionsByCategory(options, category);
  const byLabel = new Map<string, ElectronicUsageOption>();
  const byPrescriptionCode = new Map<string, ElectronicUsageOption>();
  for (const option of allowed) {
    if (!byLabel.has(option.label)) byLabel.set(option.label, option);
    if (option.prescriptionCode && !byPrescriptionCode.has(option.prescriptionCode)) {
      byPrescriptionCode.set(option.prescriptionCode, option);
    }
  }

  const picked: ElectronicUsageOption[] = [];
  const seen = new Set<string>();
  const push = (option: ElectronicUsageOption | undefined) => {
    if (!option || seen.has(option.label)) return;
    seen.add(option.label);
    picked.push(option);
  };

  for (const label of recentLabels) push(byLabel.get(label));
  // 内滴は用法そのものが3件に絞られているので、定番表なしで全件を出す。
  if (category === 'internal_drop') {
    for (const option of allowed) push(option);
  } else {
    for (const code of QUICK_USAGE_PRESCRIPTION_CODES[category] ?? []) push(byPrescriptionCode.get(code));
  }
  return picked.slice(0, limit);
}

// 「１日３回朝昼夕食後　服用」→「１日３回朝昼夕食後」。内服の末尾「服用」は全件共通なので省く。
// 外用は「塗布」「点眼」など投与経路が意味を持つため残し、全角空白は半角にして折り返しやすくする。
export function formatQuickUsageLabel(label: string): string {
  return label
    .replace(/　服用$/, '')
    .replace(/　/g, ' ')
    .trim();
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage) return storage;
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readUsageRecents(category: DosageCategory, storage?: StorageLike | null): string[] {
  const store = resolveStorage(storage);
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(USAGE_RECENTS_STORAGE_KEY) || '{}');
    const list = parsed?.[category];
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function pushUsageRecent(category: DosageCategory, label: string, storage?: StorageLike | null): string[] {
  const trimmed = label.trim();
  const current = readUsageRecents(category, storage);
  if (!trimmed) return current;
  const next = [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, USAGE_RECENTS_LIMIT);
  const store = resolveStorage(storage);
  if (!store) return next;
  try {
    const parsed = JSON.parse(store.getItem(USAGE_RECENTS_STORAGE_KEY) || '{}');
    const base = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    store.setItem(USAGE_RECENTS_STORAGE_KEY, JSON.stringify({ ...base, [category]: next }));
  } catch {
    // 保存できなくても入力は続けられる(最近使った用法が残らないだけ)
  }
  return next;
}

// 日数のワンタップ候補。調剤薬局で多い日数を昇順に並べる。
export const QUICK_DAYS = [3, 5, 7, 14, 28, 30, 90] as const;
