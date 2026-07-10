import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildAutomaticDisabledFeeRationales,
  calculateDispensingFees,
  getDispensingFeeOffReasons,
  getTotalPoints
} from './calculator.ts';
import type { CalculationResultItem, ItemWithPrice } from './calculator.ts';
import type { FacilitySettings, Patient } from '../db/types.ts';

test('getTotalPoints should return 0 for an empty array', () => {
  const results: CalculationResultItem[] = [];
  assert.strictEqual(getTotalPoints(results), 0);
});

test('getTotalPoints should return the points of a single item', () => {
  const results: CalculationResultItem[] = [
    { name: 'Test Fee', points: 45, rationale: 'Test' }
  ];
  assert.strictEqual(getTotalPoints(results), 45);
});

test('calculateDispensingFees should calculate drug preparation fee correctly', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: '1', amount: 3, days: 7, drugPrice: 25.1, usage: '食前' }, // internal 1 (24)
    { itemId: '2', visitId: '1', drugId: '2', amount: 3, days: 7, drugPrice: 25.1, usage: '食直前' }, // grouped with internal 1
    { itemId: '3', visitId: '1', drugId: '3', amount: 1, days: 14, drugPrice: 20, usage: '就寝前' }, // internal 2 (24)
    { itemId: '4', visitId: '1', drugId: '4', amount: 10, days: 0, drugPrice: 15.5, usage: '頭痛時　頓服' }, // tonpuku (21)
    { itemId: '5', visitId: '1', drugId: '5', amount: 10, days: 0, drugPrice: 20, usage: '外用1' }, // external 1 (10)
    { itemId: '6', visitId: '1', drugId: '6', amount: 1, days: 1, drugPrice: 100, usage: '静脈内注射' }, // injection (26)
    { itemId: '7', visitId: '1', drugId: '7', amount: 10, days: 7, drugPrice: 15.5, usage: '内滴' } // naiteki (10)
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const prepFeeResult = results.find(r => r.name === '薬剤調製料');

  assert.ok(prepFeeResult);
  // internal (2 agents) = 48, tonpuku = 21, external (1 agent) = 10, injection = 26, naiteki = 10
  // total = 48 + 21 + 10 + 26 + 10 = 115
  assert.strictEqual(prepFeeResult.points, 115);
});

test('calculateDispensingFees should cap internal and external preparation fees to 3 agents', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: '1', amount: 3, days: 7, drugPrice: 25.1, usage: '食前' }, // internal 1
    { itemId: '2', visitId: '1', drugId: '2', amount: 3, days: 7, drugPrice: 25.1, usage: '食後' }, // internal 2
    { itemId: '3', visitId: '1', drugId: '3', amount: 1, days: 14, drugPrice: 20, usage: '就寝前' }, // internal 3
    { itemId: '4', visitId: '1', drugId: '4', amount: 1, days: 14, drugPrice: 20, usage: '起床時' }, // internal 4 (should be capped)
    { itemId: '5', visitId: '1', drugId: '5', amount: 10, days: 0, drugPrice: 20, usage: '外用1' }, // external 1
    { itemId: '6', visitId: '1', drugId: '6', amount: 10, days: 0, drugPrice: 20, usage: '外用2' }, // external 2
    { itemId: '7', visitId: '1', drugId: '7', amount: 10, days: 0, drugPrice: 20, usage: '外用3' }, // external 3
    { itemId: '8', visitId: '1', drugId: '8', amount: 10, days: 0, drugPrice: 20, usage: '外用4' }, // external 4 (should be capped)
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const prepFeeResult = results.find(r => r.name === '薬剤調製料');

  assert.ok(prepFeeResult);
  // internal (capped to 3) = 72, external (capped to 3) = 30
  // total = 102
  assert.strictEqual(prepFeeResult.points, 102);
});

test('calculateDispensingFees should calculate Dispensing Management Fee (調剤管理料) correctly for internal medicine', () => {
  // Test Reiwa 8 criteria: <= 27 days: 10 pts, >= 28 days: 60 pts
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: '1', amount: 3, days: 5, drugPrice: 25.1, usage: '食前' }, // 5 days -> 10 pts
    { itemId: '2', visitId: '1', drugId: '2', amount: 1, days: 27, drugPrice: 20, usage: '就寝前' }, // 27 days -> 10 pts
    { itemId: '3', visitId: '1', drugId: '3', amount: 1, days: 28, drugPrice: 20, usage: '起床時' }, // 28 days -> 60 pts
    { itemId: '4', visitId: '1', drugId: '4', amount: 1, days: 30, drugPrice: 20, usage: '食間' }, // 30 days -> 60 pts
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const mgmtFeeResult = results.find(r => r.name === '調剤管理料');

  assert.ok(mgmtFeeResult);
  // Should calculate based on the top 3 items (descending points): 60 + 60 + 10 = 130 points
  assert.strictEqual(mgmtFeeResult.points, 130);
});

test('calculateDispensingFees should fallback to Dispensing Management Fee 2 (調剤管理料) if no internal medicine', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: '1', amount: 10, days: 0, drugPrice: 20, usage: '外用1' },
    { itemId: '2', visitId: '1', drugId: '2', amount: 10, days: 0, drugPrice: 15.5, usage: '頭痛時　頓服' },
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const mgmtFeeResult = results.find(r => r.name === '調剤管理料');

  assert.ok(mgmtFeeResult);
  // No internal medicine -> 10 points
  assert.strictEqual(mgmtFeeResult.points, 10);
});

test('calculateDispensingFees should count weekly methotrexate as internal medicine when actual dosing days are entered', () => {
  const items: ItemWithPrice[] = [
    {
      itemId: 'mtx-1',
      visitId: '1',
      drugId: '3999016F1014',
      drugName: 'メトトレキサート錠2mg',
      yjCode: '3999016F1014',
      amount: 2,
      days: 4,
      drugPrice: 10,
      usage: '毎週土曜朝食後 週1回服用'
    }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2026-06-01');
  const prepFeeResult = results.find(r => r.name === '薬剤調製料');
  const mgmtFeeResult = results.find(r => r.name === '調剤管理料');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(prepFeeResult);
  assert.strictEqual(prepFeeResult.points, 24);
  assert.ok(mgmtFeeResult);
  assert.strictEqual(mgmtFeeResult.points, 10);
  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 8);
});

test('calculateDispensingFees should separate weekly methotrexate from ordinary daily post-meal agents', () => {
  const items: ItemWithPrice[] = [
    {
      itemId: 'daily-1',
      visitId: '1',
      drugId: 'daily-drug',
      drugName: '朝食後の通常内服薬',
      amount: 1,
      days: 4,
      drugPrice: 15.1,
      usage: '1日1回朝食後'
    },
    {
      itemId: 'mtx-weekly',
      visitId: '1',
      drugId: '3999016F1014',
      drugName: 'メトトレキサート錠2mg',
      yjCode: '3999016F1014',
      amount: 1,
      days: 4,
      drugPrice: 15.1,
      usage: '週1回（土）朝食後服用'
    }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2026-06-01');
  const prepFeeResult = results.find(r => r.name === '薬剤調製料');
  const mgmtFeeResult = results.find(r => r.name === '調剤管理料');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(prepFeeResult);
  assert.strictEqual(prepFeeResult.points, 48);
  assert.ok(mgmtFeeResult);
  assert.strictEqual(mgmtFeeResult.points, 20);
  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 16);
});

test('calculateDispensingFees should separate different weekly administration days by default', () => {
  const items: ItemWithPrice[] = [
    {
      itemId: 'mtx-sat',
      visitId: '1',
      drugId: '3999016F1014',
      drugName: 'メトトレキサート錠2mg',
      yjCode: '3999016F1014',
      amount: 1,
      days: 4,
      drugPrice: 15.1,
      usage: '毎週土曜朝食後 週1回服用'
    },
    {
      itemId: 'mtx-sun',
      visitId: '1',
      drugId: '3999016F1030',
      drugName: 'メトトレキサート錠2mg「タナベ」',
      yjCode: '3999016F1030',
      amount: 1,
      days: 4,
      drugPrice: 15.1,
      usage: '毎週日曜朝食後 週1回服用'
    }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2026-06-01');
  const prepFeeResult = results.find(r => r.name === '薬剤調製料');
  const mgmtFeeResult = results.find(r => r.name === '調剤管理料');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(prepFeeResult);
  assert.strictEqual(prepFeeResult.points, 48);
  assert.ok(mgmtFeeResult);
  assert.strictEqual(mgmtFeeResult.points, 20);
  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 16);
});

test('calculateDispensingFees should allow manual agent grouping override for local review rules', () => {
  const items: ItemWithPrice[] = [
    {
      itemId: 'mtx-sat',
      visitId: '1',
      drugId: '3999016F1014',
      drugName: 'メトトレキサート錠2mg',
      yjCode: '3999016F1014',
      amount: 1,
      days: 4,
      drugPrice: 15.1,
      usage: '毎週土曜朝食後 週1回服用',
      billingAgentGroupKey: 'mtx-weekly'
    },
    {
      itemId: 'mtx-sun',
      visitId: '1',
      drugId: '3999016F1030',
      drugName: 'メトトレキサート錠2mg「タナベ」',
      yjCode: '3999016F1030',
      amount: 1,
      days: 4,
      drugPrice: 15.1,
      usage: '毎週日曜朝食後 週1回服用',
      billingAgentGroupKey: 'mtx-weekly'
    }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2026-06-01');
  const prepFeeResult = results.find(r => r.name === '薬剤調製料');
  const mgmtFeeResult = results.find(r => r.name === '調剤管理料');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(prepFeeResult);
  assert.strictEqual(prepFeeResult.points, 24);
  assert.ok(mgmtFeeResult);
  assert.strictEqual(mgmtFeeResult.points, 10);
  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 12);
});

const mockSettings: FacilitySettings = {
  id: 'test-settings',
  baseFeeCategory: '1',
  regionalSupportAddition: 'none',
  medicalDxAddition: false,
  postGenericAddition: 'none',
  genericDispensingReduction: false
};

const mockPatient: Patient = {
  patientId: 'test-patient',
  name: 'テスト 患者',
  kana: 'テスト カンジャ',
  birthDate: '1980-01-01'
};

test('calculateDispensingFees should calculate drug fee correctly for internal medicine', () => {
  // 内服薬のテスト: 薬価25.1円、1回1錠、1日3回 (amount = 3)、7日分
  // 1日分の金額 = 25.1 * 3 = 75.3円
  // 1日分の点数 = 75.3 / 10 = 7.53 -> 五捨五超入で 8点
  // 7日分の点数 = 8 * 7 = 56点
  const items: ItemWithPrice[] = [
    {
      itemId: 'item1',
      visitId: 'visit1',
      drugId: 'drug1',
      amount: 3,
      days: 7,
      drugPrice: 25.1
    }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 56);
});

test('calculateDispensingFees should handle 15 yen or less rule (1 point minimum) for internal medicine', () => {
  // 薬価5円、1日2錠 (amount = 2)、5日分
  // 1日分の金額 = 5 * 2 = 10円
  // 1日分の点数 = 10 / 10 = 1.0 -> 15円以下なので 1点
  // 5日分の点数 = 1 * 5 = 5点
  const items: ItemWithPrice[] = [
    {
      itemId: 'item1',
      visitId: 'visit1',
      drugId: 'drug1',
      amount: 2,
      days: 5,
      drugPrice: 5
    }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 5);
});

test('calculateDispensingFees should calculate drug fee correctly for external medicine (no days)', () => {
  // 外用薬のテスト: 薬価25.1円、10個 (amount = 10)、日数なし
  // 総額 = 25.1 * 10 = 251円
  // 点数 = 251 / 10 = 25.1 -> 五捨五超入で 25点
  const items: ItemWithPrice[] = [
    {
      itemId: 'item1',
      visitId: 'visit1',
      drugId: 'drug1',
      amount: 10,
      days: 0,
      drugPrice: 25.1
    }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 25);
});

test('calculateDispensingFees should apply goshagochonyu correctly', () => {
  // 五捨五超入のテスト
  // 15.1円 -> 2点
  // 25.0円 -> 2点
  // 25.1円 -> 3点
  // Because the usage isn't identical, they get calculated separately.
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: '1', amount: 1, days: 0, drugPrice: 15.1, usage: '外用1' },
    { itemId: '2', visitId: '1', drugId: '2', amount: 1, days: 0, drugPrice: 25.0, usage: '外用2' },
    { itemId: '3', visitId: '1', drugId: '3', amount: 1, days: 0, drugPrice: 25.1, usage: '外用3' }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 2 + 2 + 3); // 7点
});

test('calculateDispensingFees should group internal medicines with similar usage and sum them correctly', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: '1', amount: 2, days: 7, drugPrice: 10, usage: '食前', yjCode: '1111111F1011' },       // daily: 20
    { itemId: '2', visitId: '1', drugId: '2', amount: 3, days: 7, drugPrice: 15, usage: '食直前', yjCode: '2222222F2022' },     // daily: 45
    // Should be grouped together: total daily = 65.
    // Points = 65 / 10 = 6.5.
    // goshagochonyu: 0.5 is NOT > 0.5, so daily points = 6.
    // Total for this group = 6 * 7 days = 42.

    { itemId: '3', visitId: '1', drugId: '3', amount: 1, days: 14, drugPrice: 20, usage: '就寝前' }     // daily: 20
    // Points = 20 / 10 = 2 points.
    // Total for this group = 2 * 14 days = 28.
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 42 + 28);
});

test('calculateDispensingFees should calculate tonpuku appropriately by total amount instead of daily', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: '1', amount: 10, days: 0, drugPrice: 15.5, usage: '頭痛時　頓服' }
    // Total price = 155.
    // Points = 15.5 -> goshagochonyu: 15.5 <= 15.5 (wait, .5 is "go" -> integer is 15, wait, 15.5 is 15 + .5 -> if > 0.5 then +1, else no -> 15.
    // Let's verify our goshagochonyu logic for 15.5
    // raw = 15.5. integer = 15. fraction = 0.5. 0.5 is not > 0.5, so dailyPoints = 15.
  ];
  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 15);
});

test('calculateDispensingFees should separate Tonpuku medicines with same usage but different doses', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: '1', amount: 10, days: 0, drugPrice: 15.1, usage: '頭痛時 頓服' },
    { itemId: '2', visitId: '1', drugId: '2', amount: 5, days: 0, drugPrice: 15.1, usage: '頭痛時 頓服' }
  ];
  // 15.1 * 10 = 151 -> 15.1 -> 15 points
  // 15.1 * 5 = 75.5 -> 7.55 -> 8 points
  // Total = 23 points.
  // If grouped incorrectly, 15.1 * 15 = 226.5 -> 22.65 -> 23 points.
  // Wait, let's use prices that differentiate grouped vs separated.
  // Grouped: 5.6 * 15 = 84 -> 8 points.
  // Separated: 5.6 * 10 = 56 -> 6 points. 5.6 * 5 = 28 -> 3 points. Total = 9 points.

  const distinctItems: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: '1', amount: 10, days: 0, drugPrice: 5.6, usage: '頭痛時 頓服' },
    { itemId: '2', visitId: '1', drugId: '2', amount: 5, days: 0, drugPrice: 5.6, usage: '頭痛時 頓服' }
  ];
  const results = calculateDispensingFees(mockSettings, distinctItems, mockPatient, '2024-01-01');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 9);

  const prepFeeResult = results.find(r => r.name === '薬剤調製料');
  assert.ok(prepFeeResult);
  assert.strictEqual(prepFeeResult.points, 21); // Tonpuku prep is flat 21
});

test('calculateDispensingFees should NOT apply 90% reduction rule for internal medicine if >= 7 types of internal meds BUT baseFeeCategory is not special', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: 'd1', amount: 3, days: 7, drugPrice: 25.1, usage: '食前' },
    { itemId: '2', visitId: '1', drugId: 'd2', amount: 1, days: 7, drugPrice: 10.0, usage: '食前' },
    { itemId: '3', visitId: '1', drugId: 'd3', amount: 1, days: 7, drugPrice: 10.0, usage: '食前' },
    { itemId: '4', visitId: '1', drugId: 'd4', amount: 1, days: 7, drugPrice: 10.0, usage: '食前' },
    { itemId: '5', visitId: '1', drugId: 'd5', amount: 1, days: 7, drugPrice: 10.0, usage: '食前' },
    { itemId: '6', visitId: '1', drugId: 'd6', amount: 1, days: 7, drugPrice: 10.0, usage: '食前' },
    { itemId: '7', visitId: '1', drugId: 'd7', amount: 1, days: 7, drugPrice: 10.0, usage: '食前' },
    { itemId: '8', visitId: '1', drugId: 'd8', amount: 10, days: 0, drugPrice: 15.5, usage: '頭痛時　頓服' }
  ];
  // Internal points before reduction:
  // d1: 25.1 * 3 = 75.3
  // d2-d7: 10.0 * 1 = 10.0 each (60.0 total)
  // Total daily price = 135.3 -> 14 points * 7 days = 98 points.

  // Tonpuku points:
  // d8: 15.5 * 10 = 155 -> 15 points.

  // Total = 98 + 15 = 113 points.

  const settings: FacilitySettings = {
    ...mockSettings,
    baseFeeCategory: '1' // Normal
  };
  const results = calculateDispensingFees(settings, items, mockPatient, '2024-01-01');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 113);
  assert.ok(!drugFeeResult.rationale.includes('100分の90減算'));
});

test('calculateDispensingFees should NOT apply 90% reduction rule if baseFeeCategory is special but < 7 types of internal meds', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: '1', amount: 3, days: 7, drugPrice: 25.1, usage: '食前' },
    { itemId: '2', visitId: '1', drugId: '2', amount: 10, days: 0, drugPrice: 15.5, usage: '頭痛時　頓服' }
  ];
  // Internal: 25.1 * 3 = 75.3 -> 7.53 -> 8 points * 7 days = 56 points.
  // Tonpuku: 15.5 * 10 = 155 -> 15 points.
  // Total drug points = 56 + 15 = 71 points.
  const settings: FacilitySettings = {
    ...mockSettings,
    baseFeeCategory: 'special'
  };
  const results = calculateDispensingFees(settings, items, mockPatient, '2024-01-01');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 71);
  assert.ok(!drugFeeResult.rationale.includes('100分の90減算'));
});

test('calculateDispensingFees should apply 90% reduction rule only to internal meds if baseFeeCategory is special and >= 7 types of internal meds', () => {
  const items: ItemWithPrice[] = [
    // 205円以下ルール（1剤あたりの1日分薬価が205円以下の場合はまとめて1種類）を回避するため、各剤の1日分薬価を205円超えに設定する。
    // d1は1日分 25.1 * 3 = 75.3円。
    // d2〜d7について、単独で205円超えになるように設定するか、別々の用法にして1剤1種類としてカウントさせる。
    // ここでは用法を分けて7つの別々の剤（各1種類）として扱うようにする。
    { itemId: '1', visitId: '1', drugId: 'd1', amount: 3, days: 7, drugPrice: 25.1, usage: '食前' },
    { itemId: '2', visitId: '1', drugId: 'd2', amount: 1, days: 7, drugPrice: 10.0, usage: '食後' },
    { itemId: '3', visitId: '1', drugId: 'd3', amount: 1, days: 7, drugPrice: 10.0, usage: '就寝前' },
    { itemId: '4', visitId: '1', drugId: 'd4', amount: 1, days: 7, drugPrice: 10.0, usage: '起床時' },
    { itemId: '5', visitId: '1', drugId: 'd5', amount: 1, days: 7, drugPrice: 10.0, usage: '食間' },
    { itemId: '6', visitId: '1', drugId: 'd6', amount: 1, days: 7, drugPrice: 10.0, usage: '朝のみ' }, // Avoid normalization to 食前
    { itemId: '7', visitId: '1', drugId: 'd7', amount: 1, days: 7, drugPrice: 10.0, usage: '夕のみ' }, // Avoid normalization to 食後
    { itemId: '8', visitId: '1', drugId: 'd8', amount: 10, days: 0, drugPrice: 15.5, usage: '頭痛時　頓服' }
  ];
  // Internal points before reduction:
  // d1: 75.3 -> 8 points * 7 days = 56 points
  // d2-d7: each is 10.0 -> 1 point * 7 days = 7 points. 7 * 6 = 42 points.
  // Total internal = 56 + 42 = 98 points.
  // Polypharmacy reduction (because special & >= 7 types, correctly counted as 7 unique agents): 98 * 0.9 = 88.2 -> 88 points.

  // Tonpuku points (no reduction): 15 points.

  // Total = 88 + 15 = 103 points.

  const settings: FacilitySettings = {
    ...mockSettings,
    baseFeeCategory: 'special'
  };
  const results = calculateDispensingFees(settings, items, mockPatient, '2024-01-01');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 103);

  const prepFeeResult = results.find(r => r.name === '薬剤調製料');
  assert.ok(prepFeeResult);
  assert.strictEqual(prepFeeResult.points, 93); // 24 points * 3 agents (capped) + 21 points for Tonpuku = 72 + 21 = 93 points
});

test('calculateDispensingFees should NOT apply 90% reduction rule if >= 7 internal meds BUT they are grouped by 205 yen rule into < 7 types', () => {
  const items: ItemWithPrice[] = [
    // 7つの内服薬があるが、同じ用法（1剤）であり、その1日分薬価の合計が205円以下となるケース。
    // 1日分薬価: 10.0 * 7 = 70.0円 (<= 205円)。よって、これらはまとめて「1種類」としてカウントされる。
    { itemId: '1', visitId: '1', drugId: 'd1', amount: 1, days: 7, drugPrice: 10.0, usage: '食前' },
    { itemId: '2', visitId: '1', drugId: 'd2', amount: 1, days: 7, drugPrice: 10.0, usage: '食前' },
    { itemId: '3', visitId: '1', drugId: 'd3', amount: 1, days: 7, drugPrice: 10.0, usage: '食前' },
    { itemId: '4', visitId: '1', drugId: 'd4', amount: 1, days: 7, drugPrice: 10.0, usage: '食前' },
    { itemId: '5', visitId: '1', drugId: 'd5', amount: 1, days: 7, drugPrice: 10.0, usage: '食前' },
    { itemId: '6', visitId: '1', drugId: 'd6', amount: 1, days: 7, drugPrice: 10.0, usage: '食前' },
    { itemId: '7', visitId: '1', drugId: 'd7', amount: 1, days: 7, drugPrice: 10.0, usage: '食前' }
  ];
  // Internal points: 70.0 -> 7 points * 7 days = 49 points.
  // Because it's counted as 1 type, 90% reduction should NOT be applied even if baseFeeCategory is special.

  const settings: FacilitySettings = {
    ...mockSettings,
    baseFeeCategory: 'special'
  };
  const results = calculateDispensingFees(settings, items, mockPatient, '2024-01-01');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 49);
  assert.ok(!drugFeeResult.rationale.includes('100分の90減算'));
});

test('calculateDispensingFees should NOT apply any 90% reduction rule if baseFeeCategory is normal and < 7 types of internal meds', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: 'd1', amount: 3, days: 7, drugPrice: 25.1, usage: '食前' },
    { itemId: '8', visitId: '1', drugId: 'd8', amount: 10, days: 0, drugPrice: 15.5, usage: '頭痛時　頓服' }
  ];
  // Internal points = 56 points.
  // Tonpuku points = 15 points.
  // Total = 71 points.

  const settings: FacilitySettings = {
    ...mockSettings,
    baseFeeCategory: '1'
  };
  const results = calculateDispensingFees(settings, items, mockPatient, '2024-01-01');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 71);
  assert.ok(!drugFeeResult.rationale.includes('100分の90減算'));
});

test('calculateDispensingFees should calculate naiteki appropriately by total amount instead of daily, even if days is > 0', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: '1', amount: 10, days: 7, drugPrice: 15.5, usage: '食前 内滴' }
    // Total price = 155 (because it is treated like external medicine, total amount = amount * price, regardless of days).
    // Points = 15.5 -> goshagochonyu -> 15.
  ];
  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const drugFeeResult = results.find(r => r.name === '薬剤料');

  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 15);
});

test('getTotalPoints should return the sum of multiple items', () => {
  const results: CalculationResultItem[] = [
    { name: 'Fee 1', points: 45, rationale: 'Test 1' },
    { name: 'Fee 2', points: 40, rationale: 'Test 2' },
    { name: 'Fee 3', points: 4, rationale: 'Test 3' }
  ];
  assert.strictEqual(getTotalPoints(results), 89);
});

test('getTotalPoints should handle items with 0 points', () => {
  const results: CalculationResultItem[] = [
    { name: 'Fee 1', points: 45, rationale: 'Test 1' },
    { name: 'Fee 2', points: 0, rationale: 'Test 2' }
  ];
  assert.strictEqual(getTotalPoints(results), 45);
});

test('calculateDispensingFees should calculate Regional Support Addition correctly for Reiwa 8', () => {
  const items: ItemWithPrice[] = [];

  const testCases: { addition: FacilitySettings['regionalSupportAddition'], expectedPoints: number, expectedName: string }[] = [
    { addition: 'none', expectedPoints: 0, expectedName: '' },
    { addition: '1', expectedPoints: 27, expectedName: '地域支援・医薬品供給対応体制加算1' },
    { addition: '2', expectedPoints: 59, expectedName: '地域支援・医薬品供給対応体制加算2' },
    { addition: '3', expectedPoints: 67, expectedName: '地域支援・医薬品供給対応体制加算3' },
    { addition: '4', expectedPoints: 37, expectedName: '地域支援・医薬品供給対応体制加算4' },
    { addition: '5', expectedPoints: 59, expectedName: '地域支援・医薬品供給対応体制加算5' },
  ];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const settings: FacilitySettings = {
      ...mockSettings,
      regionalSupportAddition: testCase.addition
    };
    const results = calculateDispensingFees(settings, items, mockPatient, '2024-01-01');
    const rsResult = results.find(r => r.name.startsWith('地域支援・医薬品供給対応体制加算'));

    if (testCase.expectedPoints === 0) {
      assert.strictEqual(rsResult, undefined);
    } else {
      assert.ok(rsResult);
      assert.strictEqual(rsResult.points, testCase.expectedPoints);
      assert.strictEqual(rsResult.name, testCase.expectedName);
    }
  }
});

test('calculateDispensingFees should calculate Reiwa 8 base fee categories', () => {
  const testCases: { category: FacilitySettings['baseFeeCategory'], expectedPoints: number, expectedName: string }[] = [
    { category: '1', expectedPoints: 47, expectedName: '調剤基本料1' },
    { category: '2', expectedPoints: 30, expectedName: '調剤基本料2' },
    { category: '3_a', expectedPoints: 25, expectedName: '調剤基本料3(イ)' },
    { category: '3_b', expectedPoints: 20, expectedName: '調剤基本料3(ロ)' },
    { category: '3_ro', expectedPoints: 37, expectedName: '調剤基本料3(ハ)' },
    { category: 'special', expectedPoints: 5, expectedName: '特別調剤基本料Ａ' },
    { category: 'special_b', expectedPoints: 3, expectedName: '特別調剤基本料Ｂ' }
  ];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const settings: FacilitySettings = {
      ...mockSettings,
      baseFeeCategory: testCase.category
    };
    const results = calculateDispensingFees(settings, [], mockPatient, '2026-06-01');
    const baseFee = results.find(r => r.code === 'base_fee');
    assert.ok(baseFee);
    assert.strictEqual(baseFee.name, testCase.expectedName);
    assert.strictEqual(baseFee.points, testCase.expectedPoints);
  }
});

test('calculateDispensingFees should not add medical DX fee for special base fee B', () => {
  const settings: FacilitySettings = {
    ...mockSettings,
    baseFeeCategory: 'special_b',
    medicalDxAddition: true
  };

  const results = calculateDispensingFees(settings, [], mockPatient, '2026-06-01');

  assert.ok(results.some((result) => result.name === '特別調剤基本料Ｂ'));
  assert.ok(!results.some((result) => result.name === '電子的調剤情報連携体制整備加算'));
});

test('calculateDispensingFees should suppress same-patient same-month medical DX addition from history', () => {
  const settings: FacilitySettings = {
    ...mockSettings,
    medicalDxAddition: true
  };

  const results = calculateDispensingFees(settings, [], mockPatient, '2026-06-20', {
    currentVisitId: 'visit-current',
    monthlyFeeHistory: [
      {
        visitId: 'visit-previous',
        patientId: mockPatient.patientId,
        serviceDate: '2026-06-01',
        feeKey: 'medical_dx_addition',
        feeCode: 'base_additions',
        feeName: '電子的調剤情報連携体制整備加算',
        points: 8
      }
    ]
  });

  assert.ok(!results.some((result) => result.feeKey === 'medical_dx_addition'));
  assert.ok(results.some((result) => result.name === '調剤基本料1'));

  const rationales = buildAutomaticDisabledFeeRationales(settings, mockPatient, '2026-06-20', {
    currentVisitId: 'visit-current',
    monthlyFeeHistory: [
      {
        visitId: 'visit-previous',
        patientId: mockPatient.patientId,
        serviceDate: '2026-06-01',
        feeKey: 'medical_dx_addition',
        points: 8
      }
    ]
  });
  assert.match(rationales.medical_dx_addition, /2026-06内に同じ患者/);
  assert.match(rationales.medical_dx_addition, /visit-previous/);
});

test('calculateDispensingFees should ignore medical DX history from another patient, month, or same visit', () => {
  const settings: FacilitySettings = {
    ...mockSettings,
    medicalDxAddition: true
  };

  const results = calculateDispensingFees(settings, [], mockPatient, '2026-06-20', {
    currentVisitId: 'visit-current',
    monthlyFeeHistory: [
      {
        visitId: 'other-patient',
        patientId: 'another-patient',
        serviceDate: '2026-06-01',
        feeKey: 'medical_dx_addition',
        points: 8
      },
      {
        visitId: 'other-month',
        patientId: mockPatient.patientId,
        serviceDate: '2026-05-31',
        feeKey: 'medical_dx_addition',
        points: 8
      },
      {
        visitId: 'visit-current',
        patientId: mockPatient.patientId,
        serviceDate: '2026-06-01',
        feeKey: 'medical_dx_addition',
        points: 8
      }
    ]
  });

  const medicalDx = results.find((result) => result.feeKey === 'medical_dx_addition');
  assert.ok(medicalDx);
  assert.strictEqual(medicalDx.points, 8);
});

test('getDispensingFeeOffReasons should expose medical DX prohibited rationale for special base fee B', () => {
  const settings: FacilitySettings = {
    ...mockSettings,
    baseFeeCategory: 'special_b',
    medicalDxAddition: true
  };

  const reasons = getDispensingFeeOffReasons(settings, mockPatient, '2026-06-01');

  assert.strictEqual(reasons.length, 1);
  assert.strictEqual(reasons[0].feeKey, 'medical_dx_addition');
  assert.strictEqual(reasons[0].category, 'prohibited');
  assert.match(reasons[0].reason, /特別調剤基本料B/);
});

test('calculateDispensingFees should attach configured official receipt fee codes', () => {
  const settings: FacilitySettings = {
    ...mockSettings,
    baseFeeCategory: '2',
    regionalSupportAddition: '3',
    medicalDxAddition: true,
    officialFeeCodeOverrides: {
      base_fee_2: '999000001',
      regional_support_addition_3: '999000002',
      medical_dx_addition: '999000003',
      drug_preparation: '999000004',
      dispensing_management_internal: '999000005',
      medication_guidance_1: '999000006',
      special_management_1: '999000007'
    }
  };
  const items: ItemWithPrice[] = [{
    itemId: '1',
    visitId: 'visit_1',
    drugId: 'drug_1',
    amount: 1,
    days: 28,
    usage: '朝食後',
    drugPrice: 10,
    tokkanType: '1'
  }];

  const results = calculateDispensingFees(settings, items, mockPatient, '2026-06-01');

  assert.strictEqual(results.find((result) => result.name === '調剤基本料2')?.receiptFeeCode, '999000001');
  assert.strictEqual(
    results.find((result) => result.name === '地域支援・医薬品供給対応体制加算3')?.receiptFeeCode,
    '999000002'
  );
  assert.strictEqual(
    results.find((result) => result.name === '電子的調剤情報連携体制整備加算')?.receiptFeeCode,
    '999000003'
  );
  assert.strictEqual(results.find((result) => result.name === '薬剤調製料')?.receiptFeeCode, '999000004');
  assert.strictEqual(results.find((result) => result.name === '調剤管理料')?.receiptFeeCode, '999000005');
  assert.strictEqual(results.find((result) => result.name === '服薬管理指導料1')?.receiptFeeCode, '999000006');
  assert.strictEqual(results.find((result) => result.name === '特定薬剤管理指導加算1')?.receiptFeeCode, '999000007');
});

test('calculateDispensingFees should ignore incomplete official receipt fee codes', () => {
  const settings: FacilitySettings = {
    ...mockSettings,
    officialFeeCodeOverrides: {
      base_fee_1: '12345',
      drug_preparation: 'not-code'
    }
  };
  const items: ItemWithPrice[] = [{
    itemId: '1',
    visitId: 'visit_1',
    drugId: 'drug_1',
    amount: 1,
    days: 7,
    usage: '朝食後',
    drugPrice: 10
  }];

  const results = calculateDispensingFees(settings, items, mockPatient, '2026-06-01');

  assert.strictEqual(results.find((result) => result.name === '調剤基本料1')?.receiptFeeCode, undefined);
  assert.strictEqual(results.find((result) => result.name === '薬剤調製料')?.receiptFeeCode, undefined);
});

test('calculateDispensingFees should allow drug-fee-only calculation for diagnostic test prescriptions', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: 'test-kit', amount: 10, days: 0, drugPrice: 50, usage: '検査用' }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2026-06-01', {
    drugFeeOnly: true
  });

  assert.deepStrictEqual(results.map(r => r.code), ['drug_fee']);
  assert.strictEqual(results[0].points, 50);
});

test('calculateDispensingFees should allow individual preparation and management exclusions', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: 'd1', amount: 1, days: 14, drugPrice: 10, usage: '食後' },
    { itemId: '2', visitId: '1', drugId: 'd2', amount: 1, days: 14, drugPrice: 10, usage: '食前', claimPreparation: false, claimManagement: false }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2026-06-01');
  const prepFee = results.find(r => r.name === '薬剤調製料');
  const managementFee = results.find(r => r.name === '調剤管理料');

  assert.ok(prepFee);
  assert.strictEqual(prepFee.points, 24);
  assert.ok(managementFee);
  assert.strictEqual(managementFee.points, 10);
});

test('calculateDispensingFees should group same ingredient and same dosage form for preparation and management', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: 'd1', amount: 1, days: 14, drugPrice: 10, usage: '食後', yjCode: '1234567F0001' },
    { itemId: '2', visitId: '1', drugId: 'd2', amount: 1, days: 14, drugPrice: 10, usage: '食前', yjCode: '1234567F0002' }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2026-06-01');
  const prepFee = results.find(r => r.name === '薬剤調製料');
  const managementFee = results.find(r => r.name === '調剤管理料');

  assert.ok(prepFee);
  assert.strictEqual(prepFee.points, 24);
  assert.ok(managementFee);
  assert.strictEqual(managementFee.points, 10);
});

test('calculateDispensingFees should group external medicines by drugId, not usage, for prep and drug fees', () => {
  // If we have 2 external medicines with the SAME usage but DIFFERENT drugIds:
  // 薬剤調製料 (Drug Preparation Fee): They should count as 2 agents (20 points).
  // 薬剤料 (Drug Fee): They should be calculated separately.
  //   Drug 1: 60 yen -> 6 points
  //   Drug 2: 60 yen -> 6 points
  //   Total drug fee = 12 points
  // (If they were grouped together, total would be 120 yen -> 12 points anyway, but let's test prep fee mostly,
  // and maybe change drug fee test to hit goshagochonyu difference).
  //
  // Let's use 15.1 yen per drug.
  // If separated:
  // Drug 1: 15.1 yen -> 2 points
  // Drug 2: 15.1 yen -> 2 points
  // Separated total = 4 points.
  // If grouped:
  // 15.1 + 15.1 = 30.2 yen -> 3 points.
  // So separated = 4 points. Grouped = 3 points.

  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: 'd1', amount: 1, days: 0, drugPrice: 15.1, usage: '外用1' },
    { itemId: '2', visitId: '1', drugId: 'd2', amount: 1, days: 0, drugPrice: 15.1, usage: '外用1' } // same usage, different drug
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');

  const prepFeeResult = results.find(r => r.name === '薬剤調製料');
  assert.ok(prepFeeResult);
  assert.strictEqual(prepFeeResult.points, 20); // 10 points * 2 agents

  const drugFeeResult = results.find(r => r.name === '薬剤料');
  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 4); // 2 + 2 points
});

test('calculateDispensingFees should calculate 外来服薬支援料2 correctly for 2 agents with ippoka', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: 'drug1', amount: 1, usage: '食後', days: 14, isIppoka: true },
    { itemId: '2', visitId: '1', drugId: 'drug2', amount: 1, usage: '食後', days: 14, isIppoka: true }, // same agent
    { itemId: '3', visitId: '1', drugId: 'drug3', amount: 1, usage: '就寝前', days: 14, isIppoka: true } // 2nd agent
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const ippokaFee = results.find(r => r.name === '外来服薬支援料2');
  assert.strictEqual(ippokaFee?.points, 68); // 14 days => 2 weeks => 34 * 2 = 68
});

test('calculateDispensingFees should calculate 外来服薬支援料2 correctly for 1 agent with 3 drugs with ippoka', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: 'drug1', amount: 1, usage: '食後', days: 45, isIppoka: true },
    { itemId: '2', visitId: '1', drugId: 'drug2', amount: 1, usage: '食後', days: 45, isIppoka: true },
    { itemId: '3', visitId: '1', drugId: 'drug3', amount: 1, usage: '食後', days: 45, isIppoka: true }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const ippokaFee = results.find(r => r.name === '外来服薬支援料2');
  assert.strictEqual(ippokaFee?.points, 240); // 45 days => > 42 days => 240
});

test('calculateDispensingFees should not calculate 外来服薬支援料2 for 1 agent with 2 drugs with ippoka', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: 'drug1', amount: 1, usage: '食後', days: 14, isIppoka: true },
    { itemId: '2', visitId: '1', drugId: 'drug2', amount: 1, usage: '食後', days: 14, isIppoka: true }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const ippokaFee = results.find(r => r.name === '外来服薬支援料2');
  assert.strictEqual(ippokaFee, undefined);
});

test('calculateDispensingFees should not calculate 外来服薬支援料2 if isIppoka is false', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: 'drug1', amount: 1, usage: '食後', days: 14, isIppoka: false },
    { itemId: '2', visitId: '1', drugId: 'drug2', amount: 1, usage: '食後', days: 14, isIppoka: false },
    { itemId: '3', visitId: '1', drugId: 'drug3', amount: 1, usage: '食後', days: 14, isIppoka: false }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const ippokaFee = results.find(r => r.name === '外来服薬支援料2');
  assert.strictEqual(ippokaFee, undefined);
});

test('calculateDispensingFees should calculate overlapping days correctly for the same internal medicine agent', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: 'd1', amount: 3, days: 7, usage: '食前', drugPrice: 15.1 },
    { itemId: '2', visitId: '1', drugId: 'd2', amount: 3, days: 14, usage: '食前', drugPrice: 15.1 }
  ];
  // They have the same normalizedUsage ('食前'), so they belong to the same agent.
  // Days 1-7: d1 + d2 daily price = (15.1 * 3) + (15.1 * 3) = 45.3 + 45.3 = 90.6
  //   exact 9060. 9060 / 1000 = 9. Remainder 60. Not > 500. So 9 points.
  //   9 points * 7 days = 63 points.
  // Days 8-14: d2 daily price = 15.1 * 3 = 45.3
  //   exact 4530. 4530 / 1000 = 4. Remainder 530 > 500. So 5 points.
  //   5 points * 7 days = 35 points.
  // Total drug points = 63 + 35 = 98 points.

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const drugFeeResult = results.find(r => r.name === '薬剤料');
  assert.ok(drugFeeResult);
  assert.strictEqual(drugFeeResult.points, 98);
});

test('calculateDispensingFees should perfectly handle goshagochonyu without precision bugs', () => {
  const patient: Patient = {
    patientId: 'p1',
    name: '山田 太郎',
    kana: 'ヤマダ タロウ',
    birthDate: '1980-01-01',
    gender: 'male'
  };
  const settings: FacilitySettings = {
    id: '1',
    baseFeeCategory: '1',
    regionalSupportAddition: 'none',
    medicalDxAddition: false,
    postGenericAddition: 'none'
  };

  // 5.60 * 3 = 16.8. 16.8 / 10 = 1.68 -> remainder > 0.5 -> 2 points
  const items1: ItemWithPrice[] = [
    { itemId: 'i1', visitId: 'v1', drugId: 'd1', amount: 3, days: 1, usage: '食後', drugPrice: 5.60 }
  ];
  let res = calculateDispensingFees(settings, items1, patient, '2024-01-01');
  let drugFee = res.find(r => r.name === '薬剤料');
  assert.strictEqual(drugFee?.points, 2);

  // 5.05 * 3 = 15.15. 15.15 / 10 = 1.515. remainder 0.515 > 0.5 -> 2 points
  const items2: ItemWithPrice[] = [
    { itemId: 'i1', visitId: 'v1', drugId: 'd1', amount: 3, days: 1, usage: '食後', drugPrice: 5.05 }
  ];
  res = calculateDispensingFees(settings, items2, patient, '2024-01-01');
  drugFee = res.find(r => r.name === '薬剤料');
  assert.strictEqual(drugFee?.points, 2);

  // 5.50 * 3 = 16.50. 16.50 / 10 = 1.65. remainder 0.65 > 0.5 -> 2 points
  const items3: ItemWithPrice[] = [
    { itemId: 'i1', visitId: 'v1', drugId: 'd1', amount: 3, days: 1, usage: '食後', drugPrice: 5.50 }
  ];
  res = calculateDispensingFees(settings, items3, patient, '2024-01-01');
  drugFee = res.find(r => r.name === '薬剤料');
  assert.strictEqual(drugFee?.points, 2);
});

test('calculateDispensingFees should accurately calculate 5.05 * 10 without precision error', () => {
  const patient: Patient = {
    patientId: 'p1',
    name: '山田 太郎',
    kana: 'ヤマダ タロウ',
    birthDate: '1980-01-01',
    gender: 'male'
  };
  const settings: FacilitySettings = {
    id: '1',
    baseFeeCategory: '1',
    regionalSupportAddition: 'none',
    medicalDxAddition: false,
    postGenericAddition: 'none'
  };

  // 5.05 * 10 = 50.5. 50.5 / 10 = 5.05. Remainder is exactly 0.05, which means 50. NOT greater than 500. So it discards.
  // Wait, let's trace this: 5.05 * 10 = 50.5. Exact is 5050.
  // 5050 % 1000 = 50. 50 is NOT > 500. So integer part is 5.
  const items: ItemWithPrice[] = [
    { itemId: 'i1', visitId: 'v1', drugId: 'd1', amount: 10, days: 1, usage: '食後', drugPrice: 5.05 }
  ];
  const res = calculateDispensingFees(settings, items, patient, '2024-01-01');
  const drugFee = res.find(r => r.name === '薬剤料');
  assert.strictEqual(drugFee?.points, 5);
});

test('calculateDispensingFees should calculate 計量混合調剤加算 correctly for powders', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: 'd1', amount: 1, days: 7, usage: '食前', drugPrice: 10, yjCode: '1111111B1011' }, // Powder
    { itemId: '2', visitId: '1', drugId: 'd2', amount: 1, days: 7, usage: '食前', drugPrice: 10, yjCode: '2222222C2022' }  // Powder
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const mixingResult = results.find(r => r.name.includes('計量混合調剤加算(散剤・顆粒剤)'));
  assert.ok(mixingResult);
  assert.strictEqual(mixingResult.points, 45);
});

test('calculateDispensingFees should calculate 計量混合調剤加算 correctly for liquids', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: 'd1', amount: 1, days: 7, usage: '食前', drugPrice: 10, yjCode: '1111111A1011' }, // Liquid
    { itemId: '2', visitId: '1', drugId: 'd2', amount: 1, days: 7, usage: '食前', drugPrice: 10, yjCode: '2222222A2022' }  // Liquid
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const mixingResult = results.find(r => r.name.includes('計量混合調剤加算(液剤)'));
  assert.ok(mixingResult);
  assert.strictEqual(mixingResult.points, 35);
});

test('calculateDispensingFees should calculate 計量混合調剤加算 correctly for ointments', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: 'd1', amount: 1, days: 0, usage: '外用', drugPrice: 10, yjCode: '1111111Q1011' }, // Ointment
    { itemId: '2', visitId: '1', drugId: 'd2', amount: 1, days: 0, usage: '外用', drugPrice: 10, yjCode: '2222222R2022' }  // Ointment
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const mixingResult = results.find(r => r.name.includes('計量混合調剤加算(軟・硬膏剤)'));
  assert.ok(mixingResult);
  assert.strictEqual(mixingResult.points, 80);
});

test('calculateDispensingFees should calculate 計量混合調剤加算 correctly when mixing tablets with powder', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: 'd1', amount: 1, days: 14, usage: '食前', drugPrice: 10, yjCode: '1111111B1011' }, // Powder
    { itemId: '2', visitId: '1', drugId: 'd2', amount: 1, days: 14, usage: '食前', drugPrice: 10, yjCode: '2222222F2022' }  // Tablet
  ];

  // Because the tablet is NOT crushed, it's just mixing, so no mixing points apply for powder+tablet unless it's powder+powder.
  // Wait, the previous test expected 自家製剤加算 for this. Now we require isCrushed for 自家製剤加算.
  // So there should be no 自家製剤加算 or 計量混合調剤加算 (powderCount=1, tabletCount=1).
  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const prepResult = results.find(r => r.name === '自家製剤加算');
  assert.strictEqual(prepResult, undefined);
});

test('calculateDispensingFees should calculate 自家製剤加算 correctly when single tablet has isCrushed flag', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: 'd1', amount: 1, days: 14, usage: '食前', drugPrice: 10, yjCode: '2222222F2022', isCrushed: true }  // Tablet crushed
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const prepResult = results.find(r => r.name === '自家製剤加算');
  assert.ok(prepResult);
  assert.strictEqual(prepResult.points, 40); // 14 days / 7 = 2. 2 * 20 = 40
});

test('calculateDispensingFees should calculate flat 21 points for tonpuku preparation fee, regardless of multiple tonpuku groups', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: '1', amount: 1, days: 0, drugPrice: 10, usage: '頭痛時　頓服' },
    { itemId: '2', visitId: '1', drugId: '2', amount: 1, days: 0, drugPrice: 10, usage: '発熱時　頓服' }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const prepFeeResult = results.find(r => r.name === '薬剤調製料');

  assert.ok(prepFeeResult);
  assert.strictEqual(prepFeeResult.points, 21);
});

test('calculateDispensingFees should calculate 特定薬剤管理指導加算1 correctly', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: '1', amount: 1, days: 7, drugPrice: 10, usage: '食前', tokkanType: '1' }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const tokkanResult = results.find(r => r.name === '特定薬剤管理指導加算1');

  assert.ok(tokkanResult);
  assert.strictEqual(tokkanResult.points, 10);
});

test('calculateDispensingFees should calculate 特定薬剤管理指導加算3(イ) correctly', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: '1', amount: 1, days: 7, drugPrice: 10, usage: '食前', tokkanType: '3_i' }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');
  const tokkanResult = results.find(r => r.name === '特定薬剤管理指導加算3(イ)');

  assert.ok(tokkanResult);
  assert.strictEqual(tokkanResult.points, 5);
});

test('calculateDispensingFees should prefer 特定薬剤管理指導加算1 over 3(イ) if multiple items have different types', () => {
  const items: ItemWithPrice[] = [
    { itemId: '1', visitId: '1', drugId: '1', amount: 1, days: 7, drugPrice: 10, usage: '食前', tokkanType: '3_i' },
    { itemId: '2', visitId: '1', drugId: '2', amount: 1, days: 7, drugPrice: 10, usage: '食前', tokkanType: '1' }
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');

  const tokkan1Result = results.find(r => r.name === '特定薬剤管理指導加算1');
  const tokkan3Result = results.find(r => r.name === '特定薬剤管理指導加算3(イ)');

  assert.ok(tokkan1Result);
  assert.strictEqual(tokkan1Result.points, 10);
  assert.strictEqual(tokkan3Result, undefined); // Should not exist
});

test('calculateDispensingFees should not calculate both 計量混合調剤加算 and 自家製剤加算 for the same agent', () => {
  const items: ItemWithPrice[] = [
    // This setup has 2 powders (which triggers Mixing Points 45)
    // AND 1 tablet and 1 powder (which triggers Prep Points maxDays/7 * 20 -> 14/7 * 20 = 40)
    // Mixed Points (45) > Prep Points (40), so it should take Mixed Points.
    { itemId: '1', visitId: '1', drugId: 'd1', amount: 1, days: 14, usage: '食前', drugPrice: 10, yjCode: '1111111B1011' }, // Powder
    { itemId: '2', visitId: '1', drugId: 'd2', amount: 1, days: 14, usage: '食前', drugPrice: 10, yjCode: '2222222B2022' }, // Powder
    { itemId: '3', visitId: '1', drugId: 'd3', amount: 1, days: 14, usage: '食前', drugPrice: 10, yjCode: '3333333F3033' }  // Tablet
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');

  const mixingResult = results.find(r => r.name.includes('計量混合調剤加算'));
  const prepResult = results.find(r => r.name === '自家製剤加算');

  assert.ok(mixingResult);
  assert.strictEqual(mixingResult.points, 45); // Mixing takes precedence
  assert.strictEqual(prepResult, undefined); // Prep should not be calculated
});

test('calculateDispensingFees should prioritize 自家製剤加算 if it is higher than 計量混合調剤加算', () => {
  const items: ItemWithPrice[] = [
    // This setup has 2 powders (which triggers Mixing Points 45)
    // AND 1 tablet that is crushed (which triggers Prep Points maxDays/7 * 20 -> 21/7 * 20 = 60)
    // Prep Points (60) > Mixed Points (45), so it should take Prep Points.
    { itemId: '1', visitId: '1', drugId: 'd1', amount: 1, days: 21, usage: '食前', drugPrice: 10, yjCode: '1111111B1011' }, // Powder
    { itemId: '2', visitId: '1', drugId: 'd2', amount: 1, days: 21, usage: '食前', drugPrice: 10, yjCode: '2222222B2022' }, // Powder
    { itemId: '3', visitId: '1', drugId: 'd3', amount: 1, days: 21, usage: '食前', drugPrice: 10, yjCode: '3333333F3033', isCrushed: true }  // Tablet Crushed
  ];

  const results = calculateDispensingFees(mockSettings, items, mockPatient, '2024-01-01');

  const mixingResult = results.find(r => r.name.includes('計量混合調剤加算'));
  const prepResult = results.find(r => r.name === '自家製剤加算');

  assert.ok(prepResult);
  assert.strictEqual(prepResult.points, 60); // Prep takes precedence
  assert.strictEqual(mixingResult, undefined); // Mixing should not be calculated
});

test('calculateDispensingFees should perfectly handle 205 yen rule without floating point precision bugs', () => {
  const patient: Patient = {
    patientId: 'p1',
    name: '山田 太郎',
    kana: 'ヤマダ タロウ',
    birthDate: '1980-01-01',
    gender: 'male'
  };
  const settings: FacilitySettings = {
    id: '1',
    baseFeeCategory: 'special',
    regionalSupportAddition: 'none',
    medicalDxAddition: false,
    postGenericAddition: 'none'
  };

  const items: ItemWithPrice[] = [];
  for (let i = 1; i <= 5; i++) {
    items.push({
      itemId: `i${i}`,
      visitId: 'v1',
      drugId: `d${i}`,
      amount: 1,
      days: 10,
      drugPrice: 300,
      usage: `usage${i}`
    });
  }

  items.push({
    itemId: `i7_1`,
    visitId: 'v1',
    drugId: `d7_1`,
    amount: 5,
    days: 10,
    drugPrice: 28.52, // 142.6
    usage: `usage7`
  });
  items.push({
    itemId: `i7_2`,
    visitId: 'v1',
    drugId: `d7_2`,
    amount: 10,
    days: 10,
    drugPrice: 6.24, // 62.4.  142.6 + 62.4 = 205. BUT floating point is 205.00000000000003!
    usage: `usage7`
  });

  // With exactly 205 yen, it counts as 1 type, so 5 + 1 = 6 types. No reduction.
  const results = calculateDispensingFees(settings, items, patient, '2024-01-01');
  const drugFee = results.find(r => r.name === '薬剤料');
  assert.ok(drugFee);
  assert.strictEqual(drugFee.points, 1700);

  // But if it's > 205 yen, it counts as 2 types. 5 + 2 = 7 types. Reduction applied.
  const items2 = [...items];
  items2[6] = { ...items2[6], drugPrice: 6.25 }; // 142.6 + 62.5 = 205.1
  const results2 = calculateDispensingFees(settings, items2, patient, '2024-01-01');
  const drugFee2 = results2.find(r => r.name === '薬剤料');
  assert.ok(drugFee2);
  assert.strictEqual(drugFee2.points, 1539); // 1710 * 0.9 = 1539
});

test('Separates chewable tablet when 3 normal internal agents exist', () => {
  const patient = { id: 'p1', name: 'Test' } as any;
  const settings = { baseFeeCategory: '1', regionalSupportAddition: 'none', postGenericAddition: 'none' } as any;

  const items: any[] = [
    { usage: '食後', days: 14, drugPrice: 10, amount: 1 },
    { usage: '食前', days: 14, drugPrice: 10, amount: 1 },
    { usage: '就寝前', days: 14, drugPrice: 10, amount: 1 },
    { usage: '食間', days: 14, drugPrice: 10, amount: 1, drugName: 'なんとかチュアブル錠' }
  ];

  const results = calculateDispensingFees(settings, items, patient, '2024-01-01');


  const prep = results.find(r => r.name === '薬剤調製料');
  assert.strictEqual(prep?.points, 24 * 4, 'Prep fee should be for 4 agents (3 normal + 1 special)');

  const mgmt = results.find(r => r.name === '調剤管理料');
  assert.strictEqual(mgmt?.points, 10 * 4, 'Management fee should be for 4 agents');
  assert.ok(mgmt?.receiptRemarks, 'Should have receipt remarks');
  assert.strictEqual(mgmt.receiptRemarks![0].code, '820100369', 'Should have the correct receipt remark code');
});


test('Does not separate chewable tablet when only 2 normal internal agents exist', () => {
  const patient = { id: 'p1', name: 'Test' } as any;
  const settings = { baseFeeCategory: '1', regionalSupportAddition: 'none', postGenericAddition: 'none' } as any;

  const items: any[] = [
    { usage: '食後', days: 14, drugPrice: 10, amount: 1 },
    { usage: '食前', days: 14, drugPrice: 10, amount: 1 },
    { usage: '就寝前', days: 14, drugPrice: 10, amount: 1, drugName: 'なんとかチュアブル錠' }
  ];

  const results = calculateDispensingFees(settings, items, patient, '2024-01-01');

  const prep = results.find(r => r.name === '薬剤調製料');
  assert.strictEqual(prep?.points, 24 * 3, 'Prep fee should be for 3 agents');

  const mgmt = results.find(r => r.name === '調剤管理料');
  assert.strictEqual(mgmt?.points, 10 * 3, 'Management fee should be for 3 agents');
  assert.ok(!mgmt?.receiptRemarks, 'Should NOT have receipt remarks because it was not separated to exceed 3 agents');
});
