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

// 屯服: 用法の頓用表現から拾う(名称からは判定できない)
const AS_NEEDED_USAGE_PATTERN = /頓服|頓用|とん服|発作時|疼痛時|痛む時|痛い時|発熱時|不眠時|便秘時|嘔気時|悪心時|頭痛時|必要時|不安時|かゆみ時/;

export const inferDosageCategory = (drugName: string, usage?: string): DosageCategory => {
  const name = (drugName || '').trim();
  if (name) {
    if (EXTERNAL_NAME_PATTERN.test(name)) return 'external';
    if (INJECTION_NAME_PATTERN.test(name)) return 'injection';
    if (INTERNAL_DROP_NAME_PATTERN.test(name)) return 'internal_drop';
  }
  if (usage && AS_NEEDED_USAGE_PATTERN.test(usage)) return 'as_needed';
  return 'internal';
};
