// 支払基金「レセプト電算処理システム記録条件仕様（調剤用）」の別表のうち、
// 高額療養費・一部負担金・減免の記録に必要なものを写したもの。
//
// 出典: 令和8年6月版 記録条件仕様（調剤）
//   https://www.ssk.or.jp/seikyushiharai/iryokikan/download/index.files/iryokikan_in_07.pdf
//   (src/lib/official_audit.ts の OFFICIAL_AUDIT_SOURCES.mhlwReceiptRecordCondition)
//
// 仕様が改定されたら verifyDispensingUkeCodeTablesAgainstSpecText() に
// 取得し直した本文を渡して差分を確認すること。
// 本文の取得は fetchDispensingUkeOfficialSpecPdf() で行える。

export interface DispensingUkeCodeTableEntry {
  code: string;
  /** 別表の「名コード内容」列。レセプト上の表記そのまま */
  name: string;
}

/** 別表7 レセプト特記事項コード */
export const DISPENSING_UKE_SPECIAL_NOTE_CODES: DispensingUkeCodeTableEntry[] = [
  { code: '01', name: '公' },
  { code: '02', name: '長' },
  { code: '03', name: '長処' },
  { code: '04', name: '後保' },
  { code: '07', name: '老併' },
  { code: '08', name: '老健' },
  { code: '09', name: '施' },
  { code: '10', name: '第三' },
  { code: '11', name: '薬治' },
  { code: '12', name: '器治' },
  { code: '13', name: '先進' },
  { code: '14', name: '制超' },
  { code: '16', name: '長2' },
  { code: '21', name: '高半' },
  { code: '25', name: '出産' },
  { code: '26', name: '区ア' },
  { code: '27', name: '区イ' },
  { code: '28', name: '区ウ' },
  { code: '29', name: '区エ' },
  { code: '30', name: '区オ' },
  { code: '31', name: '多ア' },
  { code: '32', name: '多イ' },
  { code: '33', name: '多ウ' },
  { code: '34', name: '多エ' },
  { code: '35', name: '多オ' },
  { code: '36', name: '加治' },
  { code: '37', name: '申出' },
  { code: '38', name: '医併' },
  { code: '39', name: '医療' },
  { code: '41', name: '区カ' },
  { code: '42', name: '区キ' },
  { code: '43', name: '多カ' },
  { code: '44', name: '多キ' }
];

/**
 * 別表7 注2: コード 41〜44 は後期高齢者医療のみ記録する。
 * 令和4年9月調剤以前分は記録しない（令和4.3.25 保医0325第1号）。
 */
export const LATE_ELDERLY_ONLY_SPECIAL_NOTE_CODES = ['41', '42', '43', '44'] as const;
export const LATE_ELDERLY_SPECIAL_NOTE_FIRST_MONTH = '202210';

/**
 * 別表8 一部負担金区分コード。
 * 注: 高額療養費が現物給付された者に限り記録する。
 */
export const DISPENSING_UKE_COPAYMENT_CATEGORY_CODES: DispensingUkeCodeTableEntry[] = [
  { code: '1', name: '低所得者の一部負担金額世帯（70歳以上・適用区分II）' },
  { code: '3', name: '低所得者の一部負担金額世帯（70歳以上・適用区分I）' }
];

/** 別表10 減免区分コード */
export const DISPENSING_UKE_REDUCTION_CODES: DispensingUkeCodeTableEntry[] = [
  { code: '1', name: '減額' },
  { code: '2', name: '免除' },
  { code: '3', name: '支払猶予' }
];

/** 高額療養費の適用区分。レセプト上は「区ア」〜「区キ」で表す */
export type HighCostLimitCategory = 'ア' | 'イ' | 'ウ' | 'エ' | 'オ' | 'カ' | 'キ';

export const HIGH_COST_LIMIT_CATEGORIES: HighCostLimitCategory[] = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ'];

export function findDispensingUkeCodeTableEntry(
  table: DispensingUkeCodeTableEntry[],
  code: string
): DispensingUkeCodeTableEntry | undefined {
  return table.find((entry) => entry.code === code);
}

export type HighCostSpecialNoteResult =
  | { ok: true; code: string; name: string }
  | { ok: false; reason: string };

function normalizeDispensingMonth(value: string): string {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (digits.length >= 6) return digits.slice(0, 6);
  return '';
}

/**
 * 高額療養費の適用区分から、レセプト特記事項コードを決める。
 *
 * - 多数回該当なら「多○」、そうでなければ「区○」
 * - 区カ・区キ（多カ・多キ）は後期高齢者医療のみ、かつ令和4年10月調剤以降のみ
 *
 * 条件を満たさないときはコードを返さない。推測で記録すると、
 * 審査側で突合できない特記事項が残る。
 */
export function buildHighCostSpecialNoteCode(input: {
  category: HighCostLimitCategory;
  /** 多数回該当（直近12か月に3回以上該当した場合の4回目以降） */
  multipleOccurrence?: boolean;
  /** 調剤年月。YYYYMM でも ISO 文字列でもよい */
  dispensingMonth: string;
  /** 後期高齢者医療かどうか */
  lateElderly?: boolean;
}): HighCostSpecialNoteResult {
  const { category, multipleOccurrence = false, lateElderly = false } = input;
  const prefix = multipleOccurrence ? '多' : '区';
  const name = `${prefix}${category}`;
  const entry = DISPENSING_UKE_SPECIAL_NOTE_CODES.find((item) => item.name === name);
  if (!entry) {
    return { ok: false, reason: `別表7に「${name}」のコードがありません。` };
  }

  if ((LATE_ELDERLY_ONLY_SPECIAL_NOTE_CODES as readonly string[]).includes(entry.code)) {
    if (!lateElderly) {
      return { ok: false, reason: `「${name}」は後期高齢者医療のみ記録できます（別表7 注2）。` };
    }
    const month = normalizeDispensingMonth(input.dispensingMonth);
    if (!month) {
      return { ok: false, reason: '調剤年月が読み取れないため、後期高齢者医療の特記事項を判定できません。' };
    }
    if (month < LATE_ELDERLY_SPECIAL_NOTE_FIRST_MONTH) {
      return {
        ok: false,
        reason: `「${name}」は令和4年10月調剤以降のみ記録します（別表7 注2）。`
      };
    }
  }

  return { ok: true, code: entry.code, name: entry.name };
}

/**
 * RE レコードのレセプト特記事項欄 (英数10可変) を組み立てる。
 *
 * 記録条件仕様より:
 *   1 特記事項が必要な場合は、別表7レセプト特記事項コードを記録する。
 *     ただし、最大5つまでの記録とする。
 *   2 記録するバイト数は、2の倍数とする。
 *   3 その他の場合は、記録を省略する。
 *
 * 重複の排除は仕様の定めではなく、こちら側の防御。
 * 同じ特記事項を2回記録する意味は無く、呼び出し側の取り違えを見つけたい。
 */
export const SPECIAL_NOTE_FIELD_MAX_CODES = 5;

export type SpecialNoteFieldResult =
  | { ok: true; value: string }
  | { ok: false; reason: string };

export function buildSpecialNoteField(codes: string[]): SpecialNoteFieldResult {
  const list = (codes || []).map((code) => String(code || '').trim()).filter(Boolean);
  if (list.length === 0) {
    return { ok: true, value: '' };
  }
  if (list.length > SPECIAL_NOTE_FIELD_MAX_CODES) {
    return {
      ok: false,
      reason: `レセプト特記事項は最大${SPECIAL_NOTE_FIELD_MAX_CODES}つまでです（${list.length}件）。`
    };
  }
  const seen = new Set<string>();
  for (const code of list) {
    if (!findDispensingUkeCodeTableEntry(DISPENSING_UKE_SPECIAL_NOTE_CODES, code)) {
      return { ok: false, reason: `別表7にないレセプト特記事項コードです: ${code}` };
    }
    if (seen.has(code)) {
      return { ok: false, reason: `レセプト特記事項コードが重複しています: ${code}` };
    }
    seen.add(code);
  }
  const value = list.join('');
  if (value.length % 2 !== 0) {
    return { ok: false, reason: `レセプト特記事項は2の倍数バイトで記録します（${value.length}バイト）。` };
  }
  return { ok: true, value };
}

export interface DispensingUkeCodeTableIssue {
  table: string;
  code: string;
  message: string;
}

/**
 * 公式仕様PDFの本文と、この写しを突合する。
 * 改定時に写しが古いまま残るのを防ぐためのもの。
 */
export function verifyDispensingUkeCodeTablesAgainstSpecText(
  specText: string
): DispensingUkeCodeTableIssue[] {
  const issues: DispensingUkeCodeTableIssue[] = [];
  const normalized = String(specText || '').replace(/[ \t　]/g, '');

  for (const entry of DISPENSING_UKE_SPECIAL_NOTE_CODES) {
    // 別表7 は「26区ア」のようにコードと名称が続けて並ぶ
    if (!normalized.includes(`${entry.code}${entry.name}`)) {
      issues.push({
        table: '別表7 レセプト特記事項コード',
        code: entry.code,
        message: `仕様本文に「${entry.code}${entry.name}」が見つかりません。`
      });
    }
  }

  for (const entry of DISPENSING_UKE_REDUCTION_CODES) {
    if (!normalized.includes(`${entry.code}${entry.name}`)) {
      issues.push({
        table: '別表10 減免区分コード',
        code: entry.code,
        message: `仕様本文に「${entry.code}${entry.name}」が見つかりません。`
      });
    }
  }

  return issues;
}
