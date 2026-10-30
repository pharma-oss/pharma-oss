import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildReceiptBarcodePayload,
  formatReceiptBarcodeCaption,
  normalizeReceiptNumberForBarcode,
  parseReceiptBarcodePayload,
  readReceiptBarcodeFields
} from './receipt_barcode.ts';
import { isCode128Printable } from './code128.ts';

test('the payload joins the receipt number, the dispensing date and the copay in yen', () => {
  // 紙面の受付番号は visitId の先頭14文字で、uuid だと末尾にハイフンが付く
  assert.strictEqual(
    buildReceiptBarcodePayload({ receiptNumber: '3f2a9c1e-7b4d-', dispensingDate: '2026-10-30', copayYen: 750 }),
    '3f2a9c1e7b4d/20261030/750'
  );
});

test('the payload changes when the copay changes (a re-issued receipt is distinguishable)', () => {
  const base = { receiptNumber: '3f2a9c1e-7b4d-', dispensingDate: '2026-10-30' };
  const before = buildReceiptBarcodePayload({ ...base, copayYen: 750 });
  const after = buildReceiptBarcodePayload({ ...base, copayYen: 1130 });
  assert.notStrictEqual(before, after);
  assert.strictEqual(after, '3f2a9c1e7b4d/20261030/1130');
});

test('a zero copay is still encoded (no amount is not the same as zero yen)', () => {
  assert.strictEqual(
    buildReceiptBarcodePayload({ receiptNumber: 'abc123', dispensingDate: '2026-01-05', copayYen: 0 }),
    'abc123/20260105/0'
  );
});

test('the receipt number keeps letters, digits and underscores only, so the separator never appears inside it', () => {
  assert.strictEqual(normalizeReceiptNumberForBarcode('3f2a9c1e-7b4d-'), '3f2a9c1e7b4d');
  assert.strictEqual(normalizeReceiptNumberForBarcode('demo_abc123'), 'demo_abc123');
  assert.strictEqual(normalizeReceiptNumberForBarcode('A/B C\\D'), 'ABCD');
  assert.strictEqual(normalizeReceiptNumberForBarcode('受付-001'), '001');
});

test('a timestamp is turned into the device calendar day, not the UTC day', () => {
  // 日本時間の朝8:30 は UTC では前日。UTC の日付を切り出すと調剤日が1日ずれる
  const morning = new Date(2026, 9, 30, 8, 30).toISOString();
  assert.strictEqual(
    buildReceiptBarcodePayload({ receiptNumber: 'abc', dispensingDate: morning, copayYen: 100 }),
    'abc/20261030/100'
  );
});

test('no payload is built when a field is unusable', () => {
  const ok = { receiptNumber: 'abc', dispensingDate: '2026-10-30', copayYen: 100 };
  assert.ok(buildReceiptBarcodePayload(ok));
  assert.strictEqual(buildReceiptBarcodePayload({ ...ok, receiptNumber: '---' }), null, 'nothing left of the receipt number');
  assert.strictEqual(buildReceiptBarcodePayload({ ...ok, receiptNumber: '' }), null);
  assert.strictEqual(buildReceiptBarcodePayload({ ...ok, dispensingDate: undefined }), null);
  assert.strictEqual(buildReceiptBarcodePayload({ ...ok, dispensingDate: 'not a date' }), null);
  assert.strictEqual(buildReceiptBarcodePayload({ ...ok, copayYen: -10 }), null);
  assert.strictEqual(buildReceiptBarcodePayload({ ...ok, copayYen: 12.5 }), null);
  assert.strictEqual(buildReceiptBarcodePayload({ ...ok, copayYen: Number.NaN }), null);
  assert.strictEqual(buildReceiptBarcodePayload({ ...ok, copayYen: 100_000_000 }), null);
});

test('the payload is printable ASCII that fits Code128 and stays short enough for a 148 mm receipt', () => {
  // 紙面の受付番号は visitId の先頭14文字なので、最長でも14文字
  const payload = buildReceiptBarcodePayload({
    receiptNumber: 'abcdef1234567_',
    dispensingDate: '2026-12-31',
    copayYen: 99_999_999
  });
  assert.ok(payload);
  assert.ok(isCode128Printable(payload));
  assert.ok(payload.length <= 32, `payload length ${payload.length}`);
});

test('parsing returns exactly what was built', () => {
  const payload = buildReceiptBarcodePayload({ receiptNumber: '3f2a9c1e-7b4d-', dispensingDate: '2026-10-30', copayYen: 750 });
  assert.deepStrictEqual(parseReceiptBarcodePayload(payload!), {
    receiptNumber: '3f2a9c1e7b4d',
    dispensingDate: '2026-10-30',
    copayYen: 750
  });
});

test('parsing rejects values that cannot have come from this format', () => {
  for (const bad of [
    '',
    'abc',
    'abc/20261030',
    'abc/20261030/750/extra',
    '/20261030/750',
    'abc/2026-10-30/750',
    'abc/20261330/750',
    'abc/20260230/750',
    'abc/20261030/',
    'abc/20261030/-5',
    'abc/20261030/007',
    'abc/20261030/12.5',
    'a b/20261030/750'
  ]) {
    assert.strictEqual(parseReceiptBarcodePayload(bad), null, JSON.stringify(bad));
  }
});

test('the caption shows the same three values in a form a person can read', () => {
  assert.strictEqual(
    formatReceiptBarcodeCaption({ receiptNumber: '3f2a9c1e-7b4d-', dispensingDate: '2026-10-30', copayYen: 1130 }),
    '3f2a9c1e7b4d / 2026-10-30 / ¥1,130'
  );
  assert.strictEqual(
    formatReceiptBarcodeCaption({ receiptNumber: '', dispensingDate: '2026-10-30', copayYen: 1130 }),
    null
  );
});

test('readReceiptBarcodeFields exposes the normalized fields', () => {
  assert.deepStrictEqual(
    readReceiptBarcodeFields({ receiptNumber: 'a-b', dispensingDate: '2026-10-30', copayYen: 10 }),
    { receiptNumber: 'ab', dispensingDate: '2026-10-30', copayYen: 10 }
  );
});
