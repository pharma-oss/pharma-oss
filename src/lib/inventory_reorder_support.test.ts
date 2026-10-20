import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateStockLotExpiry,
  calculateReorderAmounts,
  findInStockSubstitutes,
  buildEnhancedInventoryOrderRisk,
  buildEnhancedInventoryOrderCsv,
  buildEnhancedInventoryOrderMemo,
  type DrugRecordForSubstitute,
  type StockLotExpiryLike
} from './inventory_reorder_support.ts';

const FIXED_NOW = new Date('2026-10-01T00:00:00Z');

test('evaluateStockLotExpiry identifies expired, urgent (<=60d), and attention (<=180d) lots deterministically', () => {
  const lots: StockLotExpiryLike[] = [
    { lotNumber: 'L01', expirationDate: '2026-09-30', quantity: 20 }, // expired 1 day ago
    { lotNumber: 'L02', expirationDate: '2026-11-15', quantity: 50 }, // ~45 days (urgent <= 60d)
    { lotNumber: 'L03', expirationDate: '2027-01-20', quantity: 100 }, // ~111 days (attention <= 180d)
    { lotNumber: 'L04', expirationDate: '2027-10-01', quantity: 200 }  // ~365 days (safe)
  ];

  const result = evaluateStockLotExpiry(lots, FIXED_NOW);

  assert.strictEqual(result.hasExpired, true);
  assert.strictEqual(result.expiredQuantity, 20);
  assert.strictEqual(result.hasUrgentExpiring, true);
  assert.strictEqual(result.urgentExpiringQuantity, 50);
  assert.strictEqual(result.hasAttentionExpiring, true);
  assert.strictEqual(result.attentionExpiringQuantity, 100);
  assert.strictEqual(result.nearestExpirationDate, '2026-09-30');
  assert.strictEqual(result.daysToNearestExpiry, -1);
});

test('calculateReorderAmounts computes shortages and reorder points with target stock', () => {
  // Case 1: Prescription shortage with no reorder point
  const case1 = calculateReorderAmounts({
    effectiveAvailableAmount: 30,
    requiredAmount: 50
  });
  assert.strictEqual(case1.isShortage, true);
  assert.strictEqual(case1.shortageAmount, 20);
  assert.strictEqual(case1.isBelowReorderPoint, false);
  assert.strictEqual(case1.recommendedOrderAmount, 20);

  // Case 2: Below reorder point without current prescription shortage
  const case2 = calculateReorderAmounts({
    effectiveAvailableAmount: 40,
    requiredAmount: 10, // remaining = 30
    reorderPoint: 50
  });
  assert.strictEqual(case2.isShortage, false);
  assert.strictEqual(case2.shortageAmount, 0);
  assert.strictEqual(case2.isBelowReorderPoint, true);
  assert.strictEqual(case2.reorderPointShortage, 20); // 50 - 30 = 20
  assert.strictEqual(case2.recommendedOrderAmount, 20);

  // Case 3: Target stock defined (e.g. standard package box size)
  const case3 = calculateReorderAmounts({
    effectiveAvailableAmount: 40,
    requiredAmount: 10, // remaining = 30
    reorderPoint: 50,
    targetStock: 100
  });
  assert.strictEqual(case3.recommendedOrderAmount, 70); // 100 - 30 = 70
});

test('findInStockSubstitutes extracts matching YJ prefix (7 chars) and prioritizes in-stock items', () => {
  const target: DrugRecordForSubstitute = {
    code: 'D01',
    name: '先発アムロ錠5mg',
    yjCode: '2149005F1024',
    genericName: 'アムロジピンベシル酸塩錠'
  };

  const allDrugs: DrugRecordForSubstitute[] = [
    target,
    {
      code: 'D02',
      name: 'アムロジピン錠5mg「サワイ」',
      yjCode: '2149005F1199', // same 7 digits prefix: 2149005
      genericName: 'アムロジピンベシル酸塩錠',
      isGeneric: true,
      price: 15.2,
      stockQuantity: 120
    },
    {
      code: 'D03',
      name: 'アムロジピンOD錠5mg「日医工」',
      yjCode: '2149005F2047', // same 7 digits prefix: 2149005
      genericName: 'アムロジピンベシル酸塩錠',
      isGeneric: true,
      price: 15.2,
      stockQuantity: 0
    },
    {
      code: 'D04',
      name: 'ニフェジピンCR錠20mg',
      yjCode: '2171014F2021', // different prefix: 2171014
      stockQuantity: 500
    }
  ];

  const lotsMap = new Map<string, StockLotExpiryLike[]>([
    ['D02', [{ quantity: 120, expirationDate: '2027-06-30', supplier: 'メディセオ' }]],
    ['D03', [{ quantity: 0, expirationDate: '2027-06-30', supplier: '東邦薬品' }]]
  ]);

  const substitutes = findInStockSubstitutes(target, allDrugs, lotsMap);

  assert.strictEqual(substitutes.length, 2);
  // D02 has stock 120, so it must be top
  assert.strictEqual(substitutes[0].drugCode, 'D02');
  assert.strictEqual(substitutes[0].availableAmount, 120);
  assert.strictEqual(substitutes[0].isSameGenericName, true);
  assert.strictEqual(substitutes[0].supplierName, 'メディセオ');
  // D03 has stock 0
  assert.strictEqual(substitutes[1].drugCode, 'D03');
  assert.strictEqual(substitutes[1].availableAmount, 0);
  assert.strictEqual(substitutes[1].supplierName, '東邦薬品');
});

test('buildEnhancedInventoryOrderRisk constructs comprehensive risk excluding expired lots from available amount', () => {
  const target: DrugRecordForSubstitute = {
    code: 'D10',
    name: 'アテレック錠10 10mg',
    yjCode: '2149027F2026',
    reorderPoint: 100,
    targetStock: 300,
    leadTimeDays: 2,
    location: 'A-02-01'
  };

  const lots: StockLotExpiryLike[] = [
    { lotNumber: 'EXP1', expirationDate: '2026-09-01', quantity: 50, supplier: 'スズケン' }, // expired
    { lotNumber: 'VAL1', expirationDate: '2027-05-01', quantity: 60, supplier: 'スズケン' }  // valid
  ];

  const allDrugs: DrugRecordForSubstitute[] = [
    target,
    {
      code: 'D11',
      name: 'シルニジピン錠10mg「サワイ」',
      yjCode: '2149027F2034',
      genericName: 'シルニジピン錠',
      stockQuantity: 150
    }
  ];

  const risk = buildEnhancedInventoryOrderRisk({
    drug: target,
    lots,
    requiredAmount: 80,
    allDrugs,
    now: FIXED_NOW
  });

  assert.ok(risk !== null);
  assert.strictEqual(risk.availableAmount, 110); // raw total = 50 + 60
  assert.strictEqual(risk.effectiveAvailableAmount, 60); // 50 expired excluded!
  assert.strictEqual(risk.expiryRisk.hasExpired, true);
  assert.strictEqual(risk.expiryRisk.expiredQuantity, 50);
  assert.strictEqual(risk.shortageAmount, 20); // 80 - 60 = 20
  // projectedRemaining = 60 - 80 = -20. targetStock = 300 => 300 - (-20) = 320
  assert.strictEqual(risk.recommendedOrderAmount, 320);
  assert.strictEqual(risk.priority, 'high');
  assert.strictEqual(risk.substitutes.length, 1);
  assert.strictEqual(risk.substitutes[0].drugCode, 'D11');
});

test('buildEnhancedInventoryOrderCsv & Memo maintain STRICT ZERO PATIENT DATA policy', () => {
  const target: DrugRecordForSubstitute = {
    code: 'D20',
    name: 'メトグルコ錠500mg',
    yjCode: '3969007F2020',
    reorderPoint: 200,
    location: 'B-01-03'
  };

  const risk = buildEnhancedInventoryOrderRisk({
    drug: target,
    lots: [{ quantity: 150, expirationDate: '2027-08-01', supplier: 'アルフレッサ' }],
    requiredAmount: 0,
    affectedVisitCount: 0,
    now: FIXED_NOW
  });

  assert.ok(risk !== null);
  const csv = buildEnhancedInventoryOrderCsv([risk]);
  const memo = buildEnhancedInventoryOrderMemo([risk]);

  // CSV content validation
  assert.match(csv, /"優先度","発注理由","薬品コード","薬品名"/);
  assert.match(csv, /メトグルコ錠500mg/);
  assert.match(csv, /発注点割れ/);
  assert.match(csv, /アルフレッサ/);

  // Memo content validation
  assert.match(memo, /メトグルコ錠500mg/);
  assert.match(memo, /発注目安: 50/);

  // STRICT PRIVACY CHECK: ensure no patient identifiers, visit IDs, or prescription IDs leak
  const forbiddenPatterns = [
    /患者/i,
    /patient/i,
    /処方箋/i,
    /prescriptionId/i,
    /visitId/i,
    /カルテ/i,
    /保険者/i
  ];

  for (const pattern of forbiddenPatterns) {
    assert.strictEqual(pattern.test(csv), false, `CSV must not match ${pattern}`);
    assert.strictEqual(pattern.test(memo), false, `Memo must not match ${pattern}`);
  }
});

test('evaluateStockLotExpiry counts a lot that expires today as expired early in the morning', () => {
  // ローカル時刻の朝8:30。日本時間の9時前はUTCではまだ前日で、以前は期限切れ0・残り1日と判定された。
  const lots: StockLotExpiryLike[] = [{ quantity: 10, expirationDate: '2026-10-08' }];
  for (const now of [new Date(2026, 9, 8, 0, 30), new Date(2026, 9, 8, 8, 30), new Date(2026, 9, 8, 23, 59)]) {
    const risk = evaluateStockLotExpiry(lots, now);
    assert.equal(risk.expiredQuantity, 10, now.toString());
    assert.equal(risk.daysToNearestExpiry, 0, now.toString());
    assert.equal(risk.hasExpired, true);
  }
  const dayBefore = evaluateStockLotExpiry(lots, new Date(2026, 9, 7, 8, 30));
  assert.equal(dayBefore.expiredQuantity, 0);
  assert.equal(dayBefore.daysToNearestExpiry, 1);
});
