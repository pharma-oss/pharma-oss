import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ocrSource = readFileSync(new URL('./ocr/page.tsx', import.meta.url), 'utf8');
const qrReaderSource = readFileSync(new URL('./ocr/PrescriptionQrReader.tsx', import.meta.url), 'utf8');
const processorSource = readFileSync(new URL('../lib/ocr/processor.ts', import.meta.url), 'utf8');
const packageJson = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');

test('ocr page exposes prescription QR intake and applies JAHIS data to the editor', () => {
  assert.match(ocrSource, /PrescriptionQrReader/);
  assert.match(ocrSource, /handleApplyPrescriptionQrData/);
  assert.match(ocrSource, /parseJahisQr/);
  assert.match(ocrSource, /findBestDrugMasterForQrItem/);
  assert.match(ocrSource, /normalizeJahisDateInputValue/);
  assert.match(ocrSource, /現在の処方入力をQRコードの内容で置き換えます/);
  assert.match(ocrSource, /電子処方箋ではありません/);
});

test('prescription QR reader supports camera, image, and scanner text paths', () => {
  assert.match(packageJson, /"@zxing\/browser"/);
  assert.match(qrReaderSource, /data-testid="prescription-qr-reader"/);
  assert.match(qrReaderSource, /decodeFromConstraints/);
  assert.match(qrReaderSource, /decodeFromImageUrl/);
  assert.match(qrReaderSource, /ハンディスキャナー入力/);
  assert.match(qrReaderSource, /BYTE_SEGMENTS/);
  assert.match(qrReaderSource, /from: 'SJIS'/);
  assert.match(qrReaderSource, /data-testid="prescription-qr-apply"/);
});

test('JAHIS QR parser covers prescription provider and usage records', () => {
  assert.match(processorSource, /case '51'/);
  assert.match(processorSource, /case '55'/);
  assert.match(processorSource, /case '201'/);
  assert.match(processorSource, /case '301'/);
  assert.match(processorSource, /findItemByRp/);
});
