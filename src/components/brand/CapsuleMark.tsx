'use client';

import { useId } from 'react';

/**
 * pharma-oss ブランドマーク（薬カプセル）
 *
 * 形状は scripts/brandMark.mjs（favicon / PWA アイコンの生成元）と同一の
 * ジオメトリを共有する。片方だけ変更するとアプリ内ロゴとファビコンが
 * 食い違うため、変更時は両方を必ず合わせること。
 */

const CANVAS = 512;
const CENTER = CANVAS / 2;
const CAPSULE_W = 322;
const CAPSULE_H = 142;
const CAPSULE_X = CENTER - CAPSULE_W / 2;
const CAPSULE_Y = CENTER - CAPSULE_H / 2;
const CAPSULE_R = CAPSULE_H / 2;
const SEAM = 6;
const HALF_W = CAPSULE_W / 2 - SEAM / 2;

// -45度回転後のカプセルの外接矩形。CapsuleGlyph はこの範囲を viewBox に使い、
// size がそのままカプセルの実寸になるようにする（lucide のアイコンと同じ感覚で
// 並べられる）。タイル全体の 512 viewBox のままだと余白込みで描かれてしまい、
// 指定より小さく見える。
const round2 = (value: number) => Math.round(value * 100) / 100;
const GLYPH_EXTENT = round2((CAPSULE_W + CAPSULE_H) / Math.SQRT2);
const GLYPH_ORIGIN = round2(CENTER - GLYPH_EXTENT / 2);

interface MarkProps {
  size?: number | string;
  className?: string;
}

/**
 * 背景を持たない素のカプセル。currentColor で塗るため、
 * 色付きタイルの上や本文中のインラインアイコンとして使える。
 */
export function CapsuleGlyph({ size = 22, className }: MarkProps) {
  const clipId = useId();

  return (
    <svg
      viewBox={`${GLYPH_ORIGIN} ${GLYPH_ORIGIN} ${GLYPH_EXTENT} ${GLYPH_EXTENT}`}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={CAPSULE_X} y={CAPSULE_Y} width={CAPSULE_W} height={CAPSULE_H} rx={CAPSULE_R} />
        </clipPath>
      </defs>
      <g transform={`rotate(-45 ${CENTER} ${CENTER})`} clipPath={`url(#${clipId})`} fill="currentColor">
        <rect x={CAPSULE_X} y={CAPSULE_Y} width={HALF_W} height={CAPSULE_H} />
        <rect x={CENTER + SEAM / 2} y={CAPSULE_Y} width={HALF_W} height={CAPSULE_H} fillOpacity={0.55} />
      </g>
    </svg>
  );
}

/**
 * グラデーションタイル入りの完全なアプリアイコン。
 * ファビコン / PWA アイコンと同じ見た目を画面内で使いたい場所向け。
 */
export function BrandTile({ size = 40, className }: MarkProps) {
  const uid = useId();
  const gradientId = `${uid}-tile`;
  const glossId = `${uid}-gloss`;
  const clipId = `${uid}-clip`;

  return (
    <svg
      viewBox={`0 0 ${CANVAS} ${CANVAS}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="pharma-oss"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2AD3BE" />
          <stop offset="0.55" stopColor="#0F766E" />
          <stop offset="1" stopColor="#0B5766" />
        </linearGradient>
        <radialGradient id={glossId} cx="0.28" cy="0.18" r="0.78">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={clipId}>
          <rect x={CAPSULE_X} y={CAPSULE_Y} width={CAPSULE_W} height={CAPSULE_H} rx={CAPSULE_R} />
        </clipPath>
      </defs>

      <rect width={CANVAS} height={CANVAS} rx={112} fill={`url(#${gradientId})`} />
      <rect width={CANVAS} height={CANVAS} rx={112} fill={`url(#${glossId})`} />

      <g transform={`rotate(-45 ${CENTER} ${CENTER})`}>
        <g clipPath={`url(#${clipId})`}>
          <rect x={CAPSULE_X} y={CAPSULE_Y} width={HALF_W} height={CAPSULE_H} fill="#ffffff" />
          <rect
            x={CENTER + SEAM / 2}
            y={CAPSULE_Y}
            width={HALF_W}
            height={CAPSULE_H}
            fill="#ffffff"
            fillOpacity={0.55}
          />
          <g fill="#ffffff" fillOpacity={0.95}>
            <circle cx={302} cy={232} r={9.5} />
            <circle cx={352} cy={256} r={9.5} />
            <circle cx={302} cy={280} r={9.5} />
          </g>
        </g>
      </g>
    </svg>
  );
}
