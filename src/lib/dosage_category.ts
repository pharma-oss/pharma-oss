// 調剤区分(剤形区分)の自動推定。
// レセプト上の調剤行為区分に合わせ、内服・屯服・外用・内滴・注射を扱う。
// 名称ベースのヒューリスティックなので、画面側で手動上書きできることが前提。

export type DosageCategory = 'internal' | 'as_needed' | 'external' | 'internal_drop' | 'injection';

export const DOSAGE_CATEGORIES: DosageCategory[] = ['internal', 'as_needed', 'external', 'internal_drop', 'injection'];

export const DOSAGE_CATEGORY_LABELS: Record<DosageCategory, string> = {
  internal: '内服',
  as_needed: '屯服',
  external: '外用',
  internal_drop: '内滴',
  injection: '注射'
};

// 外用: 剤形キーワード(点眼・貼付・軟膏など)を名称から拾う
const EXTERNAL_NAME_PATTERN = new RegExp(
  [
    '軟膏', 'クリーム', 'ローション', 'リニメント',
    'テープ', 'パップ', '貼付', 'ハップ',
    '点眼', '眼軟膏', '点鼻', '点耳',
    '吸入', 'エアゾール', 'インヘラー', 'エリプタ', 'タービュヘイラー', 'ディスカス', 'レスピマット',
    '坐剤', '坐薬', '座薬', 'トローチ',
    'うがい', '含嗽', '外用', '噴霧', 'スプレー',
    '浣腸', '消毒', 'シャンプー', '洗眼'
  ].join('|')
);

// 注射: 「〜注」系の名称・デバイス名
const INJECTION_NAME_PATTERN = new RegExp(
  [
    '注射', '静注', '皮下注', '筋注', '点滴',
    '注(?:[0-9０-９]|ミリオペン|フレックス|イノレット|ソロスター|シリンジ|キット|バイアル|カート|ペン)',
    '注$'
  ].join('|')
);

// 内滴: 滴下して服用する内用液(点眼などは外用判定が先に走る)。
// ピコスルファート(ラキソベロン)系は名称に「滴」を含まないため液剤のみ個別に拾う。
// 同成分でも錠・ドライシロップは内服のままにする。
const INTERNAL_DROP_NAME_PATTERN = /滴|(?:ピコスルファート|ラキソベロン|シンラック)(?:[^錠]*?)(?:内用液|液)/;

// 算定側 (calculator.ts) と印字側で同一の判定を使うための正本。
export const EXTERNAL_USAGE_PATTERN = /外用|貼付|塗布|点眼|点鼻|点耳|吸入|坐剤|注入/;

// 屯服: 用法の頓用表現から拾う(名称からは判定できない)
const AS_NEEDED_USAGE_PATTERN = /頓服|頓用|とん服|発作時|疼痛時|痛む時|痛い時|発熱時|不眠時|便秘時|嘔気時|悪心時|頭痛時|必要時|不安時|かゆみ時/;

export const inferDosageCategory = (drugName: string, usage?: string): DosageCategory => {
  const name = (drugName || '').trim();
  if (name) {
    if (EXTERNAL_NAME_PATTERN.test(name)) return 'external';
    if (INJECTION_NAME_PATTERN.test(name)) return 'injection';
    if (INTERNAL_DROP_NAME_PATTERN.test(name)) return 'internal_drop';
  }
  if (usage) {
    if (EXTERNAL_USAGE_PATTERN.test(usage)) return 'external';
    if (AS_NEEDED_USAGE_PATTERN.test(usage)) return 'as_needed';
  }
  return 'internal';
};

export function resolveDosageCategory(item: {
  drugName?: string;
  dispensedDrug?: string;
  usage?: string;
  dosageCategory?: DosageCategory;
  dosageCategorySource?: 'auto' | 'manual';
}): DosageCategory {
  if (item.dosageCategory) {
    return item.dosageCategory;
  }
  return inferDosageCategory(item.drugName || item.dispensedDrug || '', item.usage);
}

/**
 * 保存済み区分・用法・名称を突き合わせた実効剤形。
 * 手動指定 (dosageCategorySource === 'manual') は薬剤師の判断として最優先で尊重する。
 * それ以外では、用法の外用表現を保存済みの自動推定値より優先する
 * (保存値が PR-E1 以前の推定で 'internal' のまま残っている明細を救うため)。
 */
export function resolveEffectiveDosageCategory(item: {
  drugName?: string;
  dispensedDrug?: string;
  usage?: string;
  dosageCategory?: DosageCategory;
  dosageCategorySource?: 'auto' | 'manual';
}): DosageCategory {
  if (item.dosageCategorySource === 'manual' && item.dosageCategory) {
    return item.dosageCategory;
  }
  if (EXTERNAL_USAGE_PATTERN.test(item.usage || '')) {
    return 'external';
  }
  return resolveDosageCategory(item);
}

export type DosageCategorySourceItem = {
  drugName?: string;
  dispensedDrug?: string;
  usage?: string;
  dosageCategory?: DosageCategory;
  dosageCategorySource?: 'auto' | 'manual';
};

export type DosageCategoryResolution = 'legacy' | 'respect_manual';

export interface CalculationDosageFlags {
  isExternal: boolean;
  isTonpuku: boolean;
  isNaiteki: boolean;
  isInjection: boolean;
}

/**
 * 算定側の剤形フラグ。
 * 'legacy' は 2026-09-17 時点の calculator.ts の判定をそのまま保つ（既定）。
 * 'respect_manual' は手動指定を最優先する。帳票側 (resolveEffectiveDosageCategory) と同じ扱いになる。
 * 既定を 'respect_manual' に変えてはならない。点数が変わる（金科玉条 A-3 は要判断のまま）。
 */
export function resolveCalculationDosageFlags(
  item: DosageCategorySourceItem,
  resolution: DosageCategoryResolution = 'legacy'
): CalculationDosageFlags {
  const usage = item.usage || '';

  if (resolution === 'respect_manual' && item.dosageCategorySource === 'manual' && item.dosageCategory) {
    const cat = item.dosageCategory;
    return {
      isExternal: cat === 'external',
      isTonpuku: cat === 'as_needed',
      isNaiteki: cat === 'internal_drop',
      isInjection: cat === 'injection'
    };
  }

  const category = resolveDosageCategory(item);
  const isExternal = category === 'external' || EXTERNAL_USAGE_PATTERN.test(usage);
  const isTonpuku = !isExternal && (category === 'as_needed' || usage.includes('頓服'));
  const isNaiteki = !isExternal && (category === 'internal_drop' || usage.includes('内滴') || usage.includes('内用滴剤'));
  const isInjection = category === 'injection' || usage.includes('注射');

  return {
    isExternal,
    isTonpuku,
    isNaiteki,
    isInjection
  };
}

/**
 * 処方グループ内の複数明細から代表となる剤形区分を決定する。
 * 手動指定（manual）を最優先とし、自動判定時は external > injection > as_needed > internal_drop > internal の順で優先する。
 */
export function resolveGroupDosageCategory(items: DosageCategorySourceItem[]): DosageCategory {
  if (!items || items.length === 0) return 'internal';

  const manualItem = items.find((p) => p.dosageCategorySource === 'manual' && p.dosageCategory);
  if (manualItem?.dosageCategory) {
    return manualItem.dosageCategory;
  }

  const priority: Record<DosageCategory, number> = {
    external: 5,
    injection: 4,
    as_needed: 3,
    internal_drop: 2,
    internal: 1
  };

  let highestCategory: DosageCategory = 'internal';
  let highestPriority = 0;

  for (const item of items) {
    const cat = resolveEffectiveDosageCategory(item);
    const p = priority[cat] ?? 1;
    if (p > highestPriority) {
      highestPriority = p;
      highestCategory = cat;
    }
  }

  return highestCategory;
}

/**
 * 支払基金「レセプト電算処理システム記録条件仕様（調剤用）」別表11 剤形コード
 * 出典: 令和8年6月版 iryokikan_in_07.pdf 31ページ
 * 1: 内服
 * 2: 内滴
 * 3: 屯服
 * 4: 注射
 * 5: 外用
 * 6: 浸煎（本システム未対応・仕様未確認のため既存挙動を維持）
 * 7: 湯（本システム未対応・仕様未確認のため既存挙動を維持）
 * 9: 材料（本システム未対応・仕様未確認のため既存挙動を維持）
 */
export const OFFICIAL_DOSAGE_FORM_CODE_MAP: Record<DosageCategory, string> = {
  internal: '1',
  internal_drop: '2',
  as_needed: '3',
  injection: '4',
  external: '5'
};
