import { test } from 'node:test';
import assert from 'node:assert';
import { buildDeadStockCsv, buildDeadStockReport } from './dead_stock.ts';

const NOW = new Date('2026-07-06T09:00:00');

const baseInput = {
  drugs: [
    { code: 'D-001', name: '動いている錠剤', location: 'A-01', price: 10, stockQuantity: 50 },
    { code: 'D-002', name: '不動の軟膏', location: 'B-02', price: 120, stockQuantity: 5 },
    { code: 'D-003', name: '記録なしシロップ', location: '', price: 40, stockQuantity: 2 },
    { code: 'D-004', name: '在庫ゼロ錠', location: 'C-03', price: 99, stockQuantity: 0 }
  ],
  stockLots: [
    { drugCode: 'D-001', arrivalDate: '2026-06-25', expirationDate: '2028-01-31', quantity: 50 },
    { drugCode: 'D-002', arrivalDate: '2026-01-10', expirationDate: '2026-09-30', quantity: 5 }
  ],
  prescriptionItems: [
    { visitId: 'v1', drugId: 'D-001' },
    { visitId: 'v0', drugId: 'D-002' }
  ],
  visits: [
    { visitId: 'v1', issueDate: '2026-07-01T10:00:00.000Z', status: 'completed' },
    { visitId: 'v0', issueDate: '2026-02-01T10:00:00.000Z', status: 'completed' }
  ],
  thresholdDays: 90,
  now: NOW
};

test('buildDeadStockReport flags idle drugs and keeps moving stock out', () => {
  const entries = buildDeadStockReport(baseInput);
  const codes = entries.map((entry) => entry.drugCode);

  assert.ok(!codes.includes('D-001'), 'recently dispensed drug is not dead stock');
  assert.ok(!codes.includes('D-004'), 'zero-stock drugs are excluded');
  assert.ok(codes.includes('D-002'));
  assert.ok(codes.includes('D-003'));

  const ointment = entries.find((entry) => entry.drugCode === 'D-002')!;
  assert.strictEqual(ointment.lastDispensedAt, '2026-02-01');
  assert.strictEqual(ointment.lastArrivalAt, '2026-01-10');
  assert.strictEqual(ointment.lastMovementAt, '2026-02-01');
  assert.strictEqual(ointment.idleDays, 155);
  assert.strictEqual(ointment.stockValue, 600);
  assert.strictEqual(ointment.nearestExpiry, '2026-09-30');
  assert.strictEqual(ointment.isExpiringSoon, true, 'expiry within 180 days is flagged');
});

test('buildDeadStockReport puts never-moved stock on top', () => {
  const entries = buildDeadStockReport(baseInput);
  assert.strictEqual(entries[0].drugCode, 'D-003');
  assert.strictEqual(entries[0].idleDays, null);
  assert.strictEqual(entries[0].location, '棚位置未設定');
});

test('buildDeadStockReport respects the threshold', () => {
  const entries = buildDeadStockReport({ ...baseInput, thresholdDays: 200 });
  const codes = entries.map((entry) => entry.drugCode);
  assert.ok(!codes.includes('D-002'), '155 idle days is below a 200-day threshold');
  assert.ok(codes.includes('D-003'), 'never-moved stock always shows');
});

test('buildDeadStockReport uses dispensedDrugCode over drugId for tracking', () => {
  const entries = buildDeadStockReport({
    ...baseInput,
    prescriptionItems: [{ visitId: 'v1', drugId: 'GENERAL-ZZZ', dispensedDrugCode: 'D-002' }]
  });
  assert.ok(!entries.some((entry) => entry.drugCode === 'D-002'), 'dispensed code marks the brand as moving');
});

test('buildDeadStockCsv exports idle stock with expiry attention flags', () => {
  const csv = buildDeadStockCsv(buildDeadStockReport(baseInput));
  assert.match(csv, /^"薬品コード","薬品名","棚位置","在庫数","在庫金額\(薬価\)"/);
  assert.match(csv, /"不動の軟膏","B-02","5","600","2026-02-01","2026-01-10","155","2026-09-30","要確認"/);
  assert.match(csv, /"記録なしシロップ","棚位置未設定","2","80","","","記録なし","",""/);
});
