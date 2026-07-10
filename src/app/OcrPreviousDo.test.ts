import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const ocrSource = readFileSync(new URL('./ocr/page.tsx', import.meta.url), 'utf8');

test('OCR受付 exposes previous prescription DO from the latest completed visit', () => {
  assert.match(ocrSource, /buildPreviousDoPrescriptions/);
  assert.match(ocrSource, /status === 'completed'/);
  assert.match(ocrSource, /前回DO/);
  assert.match(ocrSource, /直近完了受付の処方がありません/);
  assert.match(ocrSource, /tokkanType/);
});
