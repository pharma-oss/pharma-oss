import { test } from 'node:test';
import assert from 'node:assert';
import {
  aggregateStockRequirements,
  calculateRequiredStockAmount,
  compareStockLotsByExpiration,
  findMatchingStockLotForGs1Barcode,
  findStockShortages,
  matchGs1BarcodeToStockTarget,
  parseGs1Barcode,
  getStockDrugId,
  getTotalStock
} from './stock.ts';

test('calculateRequiredStockAmount uses amount times days for internal medicine', () => {
  assert.strictEqual(calculateRequiredStockAmount({ drugId: 'd1', amount: 3, days: 7 }), 21);
});

test('calculateRequiredStockAmount uses amount as total when days is zero or missing', () => {
  assert.strictEqual(calculateRequiredStockAmount({ drugId: 'd1', amount: 10, days: 0 }), 10);
  assert.strictEqual(calculateRequiredStockAmount({ drugId: 'd1', amount: 5 }), 5);
});

test('aggregateStockRequirements sums repeated drugs and ignores invalid quantities', () => {
  const requirements = aggregateStockRequirements([
    { drugId: 'd1', amount: 2, days: 7 },
    { drugId: 'd1', amount: 10, days: 0 },
    { drugId: 'd2', amount: -1, days: 7 },
    { drugId: '', amount: 1, days: 1 }
  ]);

  assert.strictEqual(requirements.get('d1'), 24);
  assert.strictEqual(requirements.has('d2'), false);
  assert.strictEqual(requirements.size, 1);
});

test('aggregateStockRequirements uses dispensed drug code when present', () => {
  const requirements = aggregateStockRequirements([
    { drugId: 'general_amlodipine', dispensedDrugCode: '2171022F4010', amount: 1, days: 14 },
    { drugId: 'general_amlodipine', dispensedDrugCode: '2171022F4010', amount: 2, days: 7 },
    { drugId: 'general_amlodipine', amount: 1, days: 7 }
  ]);

  assert.strictEqual(getStockDrugId({ drugId: 'general_amlodipine', dispensedDrugCode: '2171022F4010', amount: 1 }), '2171022F4010');
  assert.strictEqual(requirements.get('2171022F4010'), 28);
  assert.strictEqual(requirements.get('general_amlodipine'), 7);
});

test('parseGs1Barcode extracts GTIN, expiration date, and lot number', () => {
  const parsed = parseGs1Barcode('(01)04912345678904(17)260630(10)LOT-A');

  assert.strictEqual(parsed.gtin, '04912345678904');
  assert.strictEqual(parsed.expirationDate, '2026-06-30');
  assert.strictEqual(parsed.lotNumber, 'LOT-A');
  assert.ok(parsed.candidates.includes('04912345678904'));
  assert.ok(parsed.candidates.includes('4912345678904'));
});

test('matchGs1BarcodeToStockTarget matches a GS1 GTIN against a stock lot JAN code', () => {
  const result = matchGs1BarcodeToStockTarget('01049123456789041726063010LOT-A', {
    stockDrugId: '2171022F4010',
    yjCode: '2171022F4010',
    janCodes: ['4912345678904']
  });

  assert.strictEqual(result.matched, true);
  assert.strictEqual(result.parsed.gtin, '04912345678904');
  assert.strictEqual(result.parsed.lotNumber, 'LOT-A');
});

test('matchGs1BarcodeToStockTarget rejects a different GTIN', () => {
  const result = matchGs1BarcodeToStockTarget('(01)04999999999999(17)260630(10)LOT-A', {
    stockDrugId: '2171022F4010',
    janCodes: ['4912345678904']
  });

  assert.strictEqual(result.matched, false);
});

test('findMatchingStockLotForGs1Barcode links a scanned GS1 lot to a stock lot', () => {
  const parsed = parseGs1Barcode('(01)04912345678904(17)260630(10)LOT-A');
  const stockLot = findMatchingStockLotForGs1Barcode(parsed, [
    {
      id: 'stock-later',
      janCode: '4912345678904',
      lotNumber: 'LOT-B',
      expirationDate: '2026-06-30',
      quantity: 10
    },
    {
      id: 'stock-picked',
      janCode: '4912345678904',
      lotNumber: 'LOT-A',
      expirationDate: '2026-06-30',
      quantity: 10
    }
  ]);

  assert.strictEqual(stockLot?.id, 'stock-picked');
});

test('findMatchingStockLotForGs1Barcode avoids ambiguous lot linkage', () => {
  const parsed = parseGs1Barcode('(01)04912345678904(17)260630');
  const stockLot = findMatchingStockLotForGs1Barcode(parsed, [
    {
      id: 'stock-a',
      janCode: '4912345678904',
      lotNumber: 'LOT-A',
      expirationDate: '2026-06-30',
      quantity: 10
    },
    {
      id: 'stock-b',
      janCode: '4912345678904',
      lotNumber: 'LOT-B',
      expirationDate: '2026-06-30',
      quantity: 10
    }
  ]);

  assert.strictEqual(stockLot, undefined);
});

test('compareStockLotsByExpiration orders fallback deductions by expiration date', () => {
  const sorted = [
    { id: 'arrived-first-but-later-expiration', expirationDate: '2026-12-31', arrivalDate: '2026-01-01', quantity: 10 },
    { id: 'expires-first', expirationDate: '2026-06-30', arrivalDate: '2026-05-01', quantity: 10 },
    { id: 'no-expiration', arrivalDate: '2025-01-01', quantity: 10 }
  ].sort(compareStockLotsByExpiration);

  assert.deepStrictEqual(sorted.map((stockLot) => stockLot.id), [
    'expires-first',
    'arrived-first-but-later-expiration',
    'no-expiration'
  ]);
});

test('getTotalStock and findStockShortages detect insufficient stock', () => {
  const requirements = new Map([
    ['d1', 12],
    ['d2', 5]
  ]);
  const available = new Map([
    ['d1', getTotalStock([{ quantity: 3 }, { quantity: 4 }])],
    ['d2', getTotalStock([{ quantity: 5 }, { quantity: -2 }])]
  ]);

  const shortages = findStockShortages(requirements, available);

  assert.deepStrictEqual(shortages, [
    {
      drugId: 'd1',
      requiredAmount: 12,
      availableAmount: 7,
      shortageAmount: 5
    }
  ]);
});
