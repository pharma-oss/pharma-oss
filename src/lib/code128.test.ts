import { test } from 'node:test';
import assert from 'node:assert';
import zxing from '@zxing/library';
import {
  CODE128_QUIET_ZONE_MODULES,
  encodeCode128BSymbols,
  isCode128Printable,
  layoutCode128B
} from './code128.ts';

// @zxing/library は CommonJS で、名前付きの import が Node の ESM から見えないため default 経由で取る。
const { BinaryBitmap, Code128Reader, DecodeHintType, HybridBinarizer, RGBLuminanceSource } = zxing;

// 独立した実装 (@zxing/library) で読み戻して、自前のシンボル表と並びが正しいことを確かめる。
// 描画した画像を読ませるのと同じ経路にするため、モジュールを画素の列にして渡す。
function decodeLayout(text: string, pixelsPerModule = 3): string {
  const { bars, modules } = layoutCode128B(text);
  const quiet = CODE128_QUIET_ZONE_MODULES * pixelsPerModule;
  const width = modules * pixelsPerModule + quiet * 2;
  const height = 24;
  const row = new Uint8ClampedArray(width).fill(255);
  for (const bar of bars) {
    const start = quiet + bar.x * pixelsPerModule;
    row.fill(0, start, start + bar.width * pixelsPerModule);
  }
  const luminances = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) luminances.set(row, y * width);

  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new Code128Reader();
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminances, width, height)));
  return reader.decode(bitmap, hints).getText();
}

test('Code128 symbols for a known string carry the start code B, the data and the modulo-103 check symbol', () => {
  // 'PJJ123C' は Code128B の定番の例。チェック値は (104 + 48*1 + 42*2 + 42*3 + 17*4 + 18*5 + 19*6 + 35*7) % 103 = 879 % 103 = 55
  assert.deepStrictEqual(encodeCode128BSymbols('PJJ123C'), [104, 48, 42, 42, 17, 18, 19, 35, 55]);
});

test('Code128 layout starts with a bar, ends with the 13-module stop, and every symbol is 11 modules wide', () => {
  const { bars, modules } = layoutCode128B('A');
  // スタート(11) + 'A'(11) + チェック(11) + ストップ(13)
  assert.strictEqual(modules, 11 * 3 + 13);
  assert.strictEqual(bars[0].x, 0);
  const last = bars[bars.length - 1];
  assert.strictEqual(last.x + last.width, modules, 'the last bar ends exactly at the right edge');
  for (let i = 1; i < bars.length; i++) {
    assert.ok(bars[i].x > bars[i - 1].x + bars[i - 1].width - 1, 'bars never overlap');
  }
});

test('Code128 layout round-trips through an independent decoder', () => {
  for (const text of [
    'A',
    'PJJ123C',
    '3f2a9c1e7b4d/20261030/750',
    'demo_abc123/20261030/0',
    'v_AbC-xyZ 09~',
    '0123456789'.repeat(3)
  ]) {
    assert.strictEqual(decodeLayout(text), text, `decoded ${text}`);
  }
});

test('Code128 layout still decodes at a thin print resolution (2 pixels per module)', () => {
  assert.strictEqual(decodeLayout('3f2a9c1e7b4d/20261030/750', 2), '3f2a9c1e7b4d/20261030/750');
});

test('Code128 rejects empty strings and characters outside printable ASCII', () => {
  assert.strictEqual(isCode128Printable(''), false);
  assert.strictEqual(isCode128Printable('abc'), true);
  assert.strictEqual(isCode128Printable('領収'), false);
  assert.strictEqual(isCode128Printable('a\nb'), false);
  assert.throws(() => layoutCode128B(''));
  assert.throws(() => layoutCode128B('¥750'));
});

test('every printable character and every check symbol value decodes through the independent decoder', () => {
  // データ側の 95 シンボル (値 0〜94) をすべて通す
  const allPrintable = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
  assert.strictEqual(decodeLayout(allPrintable), allPrintable);

  // チェック値 0〜102 は、95〜102 (データには現れない並び) も含めてすべて出し分けて通す
  const seenChecks = new Set<number>();
  for (let first = 0; first < 95 && seenChecks.size < 103; first++) {
    for (let second = 0; second < 95 && seenChecks.size < 103; second++) {
      const text = String.fromCharCode(32 + first) + String.fromCharCode(32 + second);
      const symbols = encodeCode128BSymbols(text);
      const check = symbols[symbols.length - 1];
      if (seenChecks.has(check)) continue;
      seenChecks.add(check);
      assert.strictEqual(decodeLayout(text), text, `check symbol ${check} for ${JSON.stringify(text)}`);
    }
  }
  assert.strictEqual(seenChecks.size, 103, 'all 103 check symbol values were exercised');
});
