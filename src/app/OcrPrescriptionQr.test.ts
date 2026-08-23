import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJahisQr } from '@/lib/ocr/processor';
import { normalizeJahisDateInputValue } from '@/app/ocr/helpers';

test('JAHIS QRパーサーは患者・医療機関・処方箋レコードを正しく解析する', () => {
  const jahisQrSample = [
    'JAHIS7',
    '1,山田 太郎,1,1985-03-15',
    '51,テスト総合病院,,,1310123456',
    '55,テスト医師,内科',
    '201,1,アムロジピン錠5mg,1,錠,1,620000001',
    '301,1,1日1回朝食後,14'
  ].join('\n');

  const parsed = parseJahisQr(jahisQrSample);
  assert.strictEqual(parsed.patient.name, '山田 太郎');
  assert.strictEqual(parsed.provider.institutionName, 'テスト総合病院');
  assert.strictEqual(parsed.provider.doctorName, 'テスト医師');
  assert.strictEqual(parsed.items.length, 1);
  assert.strictEqual(parsed.items[0].drugName, 'アムロジピン錠5mg');
  assert.strictEqual(parsed.items[0].amount, '1');
});

test('JAHIS形式の和暦・西暦日付をYYYY-MM-DDへ正規化できる', () => {
  // 西暦8桁
  assert.strictEqual(normalizeJahisDateInputValue('19850315'), '1985-03-15');
  // 和暦 (H010101 -> 1989-01-01)
  assert.strictEqual(normalizeJahisDateInputValue('H010101'), '1989-01-01');
  // 和暦 (R020401 -> 2020-04-01)
  assert.strictEqual(normalizeJahisDateInputValue('R020401'), '2020-04-01');
  // YYYY-MM-DD
  assert.strictEqual(normalizeJahisDateInputValue('2026-07-01'), '2026-07-01');
});
