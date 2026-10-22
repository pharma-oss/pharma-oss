// 1日量・日数のような「短い数値の文字列」を＋/−ボタンで増減するための純粋関数。
// 入力欄の値は string のまま(小数・単位違いの途中入力を壊さない)扱う。

const FULL_WIDTH_DIGITS = /[０-９]/g;

/** 全角数字・全角ピリオドを半角にし、空白を除く。スマホのIME入力で全角が混ざっても数値として扱えるようにする。 */
export function normalizeNumericInput(value: string): string {
  return value
    .replace(FULL_WIDTH_DIGITS, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, '.')
    .replace(/\s+/g, '');
}

export interface StepNumericOptions {
  min?: number;
  max?: number;
  /** 小数の桁数の上限。丸め誤差(0.1+0.2)を出さないために使う。 */
  decimals?: number;
  maxLength?: number;
}

/**
 * value に delta を足した結果を文字列で返す。数値として読めない/空のときは 0 を起点にする。
 * min/max で丸め、maxLength を超える結果は元の値を返す(欄の maxLength と食い違わないため)。
 */
export function stepNumericText(value: string, delta: number, options: StepNumericOptions = {}): string {
  const { min = 0, max = Number.POSITIVE_INFINITY, decimals = 3, maxLength } = options;
  const normalized = normalizeNumericInput(value);
  const parsed = normalized === '' ? 0 : Number(normalized);
  const current = Number.isFinite(parsed) ? parsed : 0;
  const stepped = Math.min(max, Math.max(min, current + delta));
  const text = String(Number(stepped.toFixed(decimals)));
  if (maxLength !== undefined && text.length > maxLength) return value;
  return text;
}
