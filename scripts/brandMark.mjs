/**
 * pharma-oss ブランドマーク（薬カプセル）SVG ジェネレータ
 *
 * favicon / PWA アイコン / maskable アイコンはすべてこのモジュールが
 * 生成する SVG を単一ソースとして書き出す（scripts/generateBrandIcons.mjs）。
 * 手で SVG や PNG を編集せず、必ず `npm run brand:icons` で再生成すること。
 *
 * デザイン: 45度に傾けた 2 トーンのカプセル。
 * - 濃い半分（不透明の白）と薄い半分（半透明の白）を継ぎ目の隙間で分割する。
 * - 16px のファビコンでも「白い斜めのバー」として明確に読める形を優先し、
 *   文字要素は一切入れない（旧アイコンは "PHARMACY" の文字が潰れて判読不能だった）。
 */

// 512 基準のキャンバス上でのカプセル寸法
const CANVAS = 512;
const CENTER = CANVAS / 2;
const CAPSULE_W = 322;
const CAPSULE_H = 142;
const CAPSULE_X = CENTER - CAPSULE_W / 2; // 106
const CAPSULE_Y = CENTER - CAPSULE_H / 2; // 190
const CAPSULE_R = CAPSULE_H / 2; // 66
const SEAM = 6; // 継ぎ目の隙間（背景グラデーションが覗く）

const HALF_W = CAPSULE_W / 2 - SEAM / 2; // 147

/**
 * @param {object} options
 * @param {'rounded'|'square'} [options.shape] 'square' は maskable 用の全面塗り
 * @param {boolean} [options.withGranules] カプセル内の顆粒ディテール
 */
export function renderBrandMark({ shape = 'rounded', withGranules = true } = {}) {
  // maskable は OS 側でマスクされるため角丸を持たせない（角に透明が出ないようにする）
  const tileRadius = shape === 'square' ? 0 : 112;

  const granules = withGranules
    ? `
      <g fill="#ffffff" fill-opacity="0.95">
        <circle cx="302" cy="232" r="9.5" />
        <circle cx="352" cy="256" r="9.5" />
        <circle cx="302" cy="280" r="9.5" />
      </g>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}" role="img" aria-label="pharma-oss">
  <defs>
    <linearGradient id="tileGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2AD3BE" />
      <stop offset="0.55" stop-color="#0F766E" />
      <stop offset="1" stop-color="#0B5766" />
    </linearGradient>
    <radialGradient id="tileGloss" cx="0.28" cy="0.18" r="0.78">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.32" />
      <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
    <clipPath id="capsuleClip">
      <rect x="${CAPSULE_X}" y="${CAPSULE_Y}" width="${CAPSULE_W}" height="${CAPSULE_H}" rx="${CAPSULE_R}" />
    </clipPath>
  </defs>

  <rect width="${CANVAS}" height="${CANVAS}" rx="${tileRadius}" fill="url(#tileGradient)" />
  <rect width="${CANVAS}" height="${CANVAS}" rx="${tileRadius}" fill="url(#tileGloss)" />

  <g transform="rotate(-45 ${CENTER} ${CENTER})">
    <g clip-path="url(#capsuleClip)">
      <rect x="${CAPSULE_X}" y="${CAPSULE_Y}" width="${HALF_W}" height="${CAPSULE_H}" fill="#ffffff" />
      <rect x="${CENTER + SEAM / 2}" y="${CAPSULE_Y}" width="${HALF_W}" height="${CAPSULE_H}" fill="#ffffff" fill-opacity="0.55" />${granules}
    </g>
  </g>
</svg>
`;
}

/**
 * アプリ内 UI 用の「素の白いカプセル」。タイル背景を持たず currentColor を使う。
 */
export function renderCapsuleGlyph() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" role="img" aria-label="pharma-oss">
  <defs>
    <clipPath id="glyphClip">
      <rect x="${CAPSULE_X}" y="${CAPSULE_Y}" width="${CAPSULE_W}" height="${CAPSULE_H}" rx="${CAPSULE_R}" />
    </clipPath>
  </defs>
  <g transform="rotate(-45 ${CENTER} ${CENTER})" clip-path="url(#glyphClip)" fill="currentColor">
    <rect x="${CAPSULE_X}" y="${CAPSULE_Y}" width="${HALF_W}" height="${CAPSULE_H}" />
    <rect x="${CENTER + SEAM / 2}" y="${CAPSULE_Y}" width="${HALF_W}" height="${CAPSULE_H}" fill-opacity="0.55" />
  </g>
</svg>
`;
}
