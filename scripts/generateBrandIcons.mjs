/**
 * ブランドアイコン一括生成スクリプト
 *
 *   npm run brand:icons
 *
 * scripts/brandMark.mjs の SVG を単一ソースとして、
 * favicon (SVG) と PWA / Apple 用の PNG を書き出す。
 *
 * 旧 public/icon-192.png · icon-512.png は、実体が 1024x1024 の JPEG を
 * .png 名で置いた 550KB のファイルで、manifest では image/png の 192/512 と
 * 宣言されていた（型・サイズとも不正）。このスクリプトで正しい PNG を生成する。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { renderBrandMark } from './brandMark.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const publicDir = path.join(repoRoot, 'public');
const appDir = path.join(repoRoot, 'src', 'app');

const roundedSvg = renderBrandMark({ shape: 'rounded' });
const maskableSvg = renderBrandMark({ shape: 'square' });

/** @param {string} svg @param {number} size @param {string} outPath */
async function rasterize(svg, size, outPath) {
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: false })
    .toFile(outPath);
  return outPath;
}

async function main() {
  await mkdir(publicDir, { recursive: true });

  // favicon (Next.js App Router のファイル規約: src/app/icon.svg)
  const faviconPath = path.join(appDir, 'icon.svg');
  await writeFile(faviconPath, roundedSvg, 'utf8');

  const outputs = [
    await rasterize(roundedSvg, 192, path.join(publicDir, 'icon-192.png')),
    await rasterize(roundedSvg, 512, path.join(publicDir, 'icon-512.png')),
    await rasterize(maskableSvg, 512, path.join(publicDir, 'icon-maskable-512.png')),
    // Apple のタッチアイコンは SVG 非対応かつ透過を黒く塗るため、角丸なしの全面塗りを使う
    await rasterize(maskableSvg, 180, path.join(publicDir, 'apple-icon.png')),
  ];

  console.log('Generated brand icons:');
  for (const file of [faviconPath, ...outputs]) {
    console.log(`  - ${path.relative(repoRoot, file)}`);
  }
}

main().catch((error) => {
  console.error('Failed to generate brand icons:', error);
  process.exitCode = 1;
});
