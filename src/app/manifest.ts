import { MetadataRoute } from 'next';

// テーマ色は globals.css の --primary / --bg-base と一致させる。
// (以前は theme_color=#3b82f6・background_color=#0b0f19 で、実際の
//  ティール基調・明色背景のアプリと splash が食い違っていた)
export const BRAND_THEME_COLOR = '#0f766e';
export const BRAND_BACKGROUND_COLOR = '#f3f7f6';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'pharma-oss 薬局業務支援',
    short_name: 'pharma-oss',
    description: '次世代 電子薬歴・薬局業務支援システム',
    start_url: '/',
    display: 'standalone',
    background_color: BRAND_BACKGROUND_COLOR,
    theme_color: BRAND_THEME_COLOR,
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // OS 側のマスク（円・スクワークル）に耐える全面塗りの版
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
