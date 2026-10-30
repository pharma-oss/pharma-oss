// Code 128 (コードセットB) のエンコーダ。外部ライブラリを使わず、印刷用の SVG を描くための
// 「バーの位置と幅(モジュール単位)」を返す。ASCII 32〜126 の文字だけを扱う。
//
// 領収証の照合バーコード用。数字だけの列を詰めて短くするコードセットCは使わず、B だけにして
// 実装と検証を単純にしている(領収証の符号化文字列は 30 文字に満たず、幅に余裕がある)。

// 各シンボルの「バー・スペース・バー・スペース・バー・スペース」の幅(合計 11 モジュール)。
// 添字がシンボル値。103〜105 はスタート A/B/C。
const SYMBOL_WIDTHS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232'
] as const;

// 終端は 13 モジュール。バー2・スペース3・バー3・スペース1・バー1・スペース1・バー2 の並び。
const STOP_WIDTHS = '2331112';

const START_CODE_B = 104;
const FIRST_PRINTABLE = 32;
const LAST_PRINTABLE = 126;

/** 左右の余白(クワイエットゾーン)。規格は読み取り幅の 10 モジュール以上。 */
export const CODE128_QUIET_ZONE_MODULES = 10;

export interface Code128Bar {
  /** 左端(余白を含まない)からの位置。モジュール単位 */
  x: number;
  width: number;
}

export interface Code128Layout {
  bars: Code128Bar[];
  /** 余白を含まない全幅。モジュール単位 */
  modules: number;
}

export function isCode128Printable(text: string): boolean {
  if (!text) return false;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < FIRST_PRINTABLE || code > LAST_PRINTABLE) return false;
  }
  return true;
}

/** スタート・データ・チェックサム・ストップ手前までのシンボル値(ストップは含まない)。 */
export function encodeCode128BSymbols(text: string): number[] {
  if (!isCode128Printable(text)) {
    throw new Error('Code128 can only encode printable ASCII (32-126) and not an empty string.');
  }
  const symbols = [START_CODE_B];
  let checksum = START_CODE_B;
  for (let i = 0; i < text.length; i++) {
    const value = text.charCodeAt(i) - FIRST_PRINTABLE;
    symbols.push(value);
    checksum += value * (i + 1);
  }
  symbols.push(checksum % 103);
  return symbols;
}

export function layoutCode128B(text: string): Code128Layout {
  const symbols = encodeCode128BSymbols(text);
  const widthStrings: string[] = symbols.map((symbol) => SYMBOL_WIDTHS[symbol]);
  widthStrings.push(STOP_WIDTHS);

  const bars: Code128Bar[] = [];
  let x = 0;
  for (const widths of widthStrings) {
    for (let i = 0; i < widths.length; i++) {
      const width = Number(widths[i]);
      // 偶数番目がバー、奇数番目がスペース
      if (i % 2 === 0) bars.push({ x, width });
      x += width;
    }
  }
  return { bars, modules: x };
}
