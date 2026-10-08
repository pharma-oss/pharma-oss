import { test } from 'node:test';
import assert from 'node:assert';
import { toLocalDateKey, toLocalDateKeyFromValue } from './local_date.ts';

test('toLocalDateKey uses the calendar day of the device, not the UTC day', () => {
  // ローカル時刻で組み立てるので、どのタイムゾーンで実行しても同じ結果になる
  assert.strictEqual(toLocalDateKey(new Date(2026, 9, 8, 0, 30)), '2026-10-08', 'just after midnight');
  assert.strictEqual(toLocalDateKey(new Date(2026, 9, 8, 8, 59)), '2026-10-08', 'before 9:00 in Japan, when the UTC day is still the previous one');
  assert.strictEqual(toLocalDateKey(new Date(2026, 9, 8, 23, 59, 59)), '2026-10-08', 'end of the day');
});

test('toLocalDateKey pads single-digit months and days, and handles month and year ends', () => {
  assert.strictEqual(toLocalDateKey(new Date(2026, 0, 5, 12)), '2026-01-05');
  assert.strictEqual(toLocalDateKey(new Date(2026, 11, 31, 23, 30)), '2026-12-31');
  assert.strictEqual(toLocalDateKey(new Date(2027, 0, 1, 0, 0)), '2027-01-01');
});

test('toLocalDateKey defaults to now', () => {
  const before = toLocalDateKey(new Date());
  const result = toLocalDateKey();
  const after = toLocalDateKey(new Date());
  assert.ok(result === before || result === after);
});

test('toLocalDateKeyFromValue keeps a plain date and converts a timestamp to the device calendar day', () => {
  assert.strictEqual(toLocalDateKeyFromValue('2026-10-08'), '2026-10-08');
  // 受付日時は toISOString() で保存される。ローカルの朝8:30に受け付けた分は、その日の日付になる
  const registeredAtMorning = new Date(2026, 9, 8, 8, 30).toISOString();
  assert.strictEqual(toLocalDateKeyFromValue(registeredAtMorning), '2026-10-08');
  assert.strictEqual(toLocalDateKeyFromValue(new Date(2026, 9, 8, 23, 45).toISOString()), '2026-10-08');
});

test('toLocalDateKeyFromValue returns null for values that are not dates', () => {
  assert.strictEqual(toLocalDateKeyFromValue(undefined), null);
  assert.strictEqual(toLocalDateKeyFromValue(null), null);
  assert.strictEqual(toLocalDateKeyFromValue(''), null);
  assert.strictEqual(toLocalDateKeyFromValue('not a date'), null);
});
