import { test } from 'node:test';
import assert from 'node:assert';
import {
  calculateDispensingFees,
  getTotalPoints,
  getUnsetPointFees,
  type CalculationResultItem,
  type ItemWithPrice
} from './calculator.ts';
import { calculateInsuranceAmounts } from './billing.ts';
import { DEFAULT_CONDITION_FEE_TABLE, type ConditionFeeTable } from './claim_conditions.ts';
import type { FacilitySettings, Patient } from '../db/types.ts';

const settings: FacilitySettings = {
  id: 'test-settings',
  baseFeeCategory: '1',
  regionalSupportAddition: 'none',
  medicalDxAddition: false,
  postGenericAddition: 'none',
  genericDispensingReduction: false,
  officialFeeCodeOverrides: {
    medication_guidance_1: '120002370',
    medication_guidance_no_notebook: '120002371',
    after_hours_addition: '120002380'
  }
};

const patient: Patient = {
  patientId: 'test-patient',
  name: 'テスト 患者',
  kana: 'テスト カンジャ',
  birthDate: '1980-01-01'
};

const baseItem: ItemWithPrice = {
  itemId: '1', visitId: 'v1', drugId: 'd1', amount: 3, days: 7, drugPrice: 25.1, usage: '食後'
};

// 表の値はこのテスト用の仮の数字。実際の点数ではない。
const filledTable: ConditionFeeTable = {
  medicationGuidance: {
    carried: DEFAULT_CONDITION_FEE_TABLE.medicationGuidance.carried,
    not_carried: { ...DEFAULT_CONDITION_FEE_TABLE.medicationGuidance.not_carried, points: 59 }
  },
  afterHours: {
    categories: {
      after_hours: { ...DEFAULT_CONDITION_FEE_TABLE.afterHours.categories.after_hours, ratePercent: 100 },
      holiday: { ...DEFAULT_CONDITION_FEE_TABLE.afterHours.categories.holiday, ratePercent: 140 },
      late_night: { ...DEFAULT_CONDITION_FEE_TABLE.afterHours.categories.late_night, ratePercent: 200 }
    },
    baseFeeCodes: ['base_fee', 'drug_preparation'],
    rounding: 'round',
    priority: DEFAULT_CONDITION_FEE_TABLE.afterHours.priority
  }
};

function calc(items: ItemWithPrice[], options?: Parameters<typeof calculateDispensingFees>[4]) {
  return calculateDispensingFees(settings, items, patient, '2026-10-30', options);
}

function find(results: CalculationResultItem[], code: string) {
  return results.filter((fee) => fee.code === code);
}

// ---- 既存の算定は変わらない ----

test('with no conditions the notebook guidance is the existing 45 points with the same result shape', () => {
  const results = calc([baseItem]);
  const guidance = find(results, 'medication_guidance');
  assert.deepStrictEqual(guidance, [{
    code: 'medication_guidance',
    receiptFeeCode: '120002370',
    name: '服薬管理指導料1',
    points: 45,
    rationale: '患者の服薬状況や副作用等を確認し、必要な薬学的管理と服薬指導を行ったため'
  }]);
  assert.deepStrictEqual(getUnsetPointFees(results), []);
  assert.strictEqual(find(results, 'after_hours').length, 0);
});

test('explicitly choosing the defaults gives the same fees as choosing nothing', () => {
  const plain = calc([baseItem]);
  const explicit = calc([baseItem], { medicationNotebook: 'carried', afterHoursCategory: 'none', tokkanOverride: undefined });
  assert.deepStrictEqual(explicit, plain);
});

// ---- お薬手帳 ----

test('no notebook with an unset table never invents an amount: the item is flagged and carries no points', () => {
  const carried = calc([baseItem]);
  const results = calc([baseItem], { medicationNotebook: 'not_carried' });
  const guidance = find(results, 'medication_guidance');
  assert.strictEqual(guidance.length, 1, 'the notebook-carried 45 points are not billed as well');
  assert.strictEqual(guidance[0].name, '服薬管理指導料(お薬手帳なし)');
  assert.strictEqual(guidance[0].points, 0);
  assert.strictEqual(guidance[0].pointsUnset, true);
  assert.strictEqual(guidance[0].feeKey, 'medication_guidance_no_notebook');
  assert.match(guidance[0].rationale, /未設定/);
  assert.deepStrictEqual(getUnsetPointFees(results), guidance);
  assert.strictEqual(getTotalPoints(results), getTotalPoints(carried) - 45, 'the rest of the claim is untouched');
});

test('no notebook with the table filled bills that table value and uses the matching official code', () => {
  const carried = calc([baseItem]);
  const results = calc([baseItem], { medicationNotebook: 'not_carried', conditionFeeTable: filledTable });
  const guidance = find(results, 'medication_guidance');
  assert.strictEqual(guidance.length, 1);
  assert.strictEqual(guidance[0].points, 59);
  assert.strictEqual(guidance[0].receiptFeeCode, '120002371');
  assert.strictEqual(guidance[0].pointsUnset, undefined);
  assert.deepStrictEqual(getUnsetPointFees(results), []);
  assert.strictEqual(getTotalPoints(results) - getTotalPoints(carried), 59 - 45);
});

test('the receipt amounts follow the same calculation: switching the notebook moves the copay by the table difference', () => {
  const options = { conditionFeeTable: filledTable } as const;
  const carried = calc([baseItem], options);
  const notCarried = calc([baseItem], { ...options, medicationNotebook: 'not_carried' });
  const before = calculateInsuranceAmounts(getTotalPoints(carried), 30);
  const after = calculateInsuranceAmounts(getTotalPoints(notCarried), 30);
  assert.strictEqual(after.totalPoints - before.totalPoints, 14);
  assert.strictEqual(after.totalCostYen - before.totalCostYen, 140);
  assert.notStrictEqual(after.patientCopayYen, before.patientCopayYen);
  assert.strictEqual(after.patientCopayYen + after.insurerBurdenYen, after.totalCostYen);
});

test('no guidance target means no guidance fee at all, whatever the notebook says', () => {
  const noManagement = { ...baseItem, claimManagement: false };
  assert.strictEqual(find(calc([noManagement], { medicationNotebook: 'not_carried' }), 'medication_guidance').length, 0);
});

test('turning the guidance fee off removes the notebook-less line too', () => {
  const results = calc([baseItem], { medicationNotebook: 'not_carried', disabledFeeCodes: ['medication_guidance'] });
  assert.strictEqual(find(results, 'medication_guidance').length, 0);
  assert.deepStrictEqual(getUnsetPointFees(results), []);
});

// ---- 特定薬剤管理指導加算 (トッカン) ----

test('the visit-level tokkan choice overrides the per-item setting in both directions', () => {
  const withItemTokkan = { ...baseItem, tokkanType: '1' as const };
  assert.strictEqual(find(calc([withItemTokkan]), 'special_management')[0].points, 10, 'per-item setting when nothing is chosen');
  assert.strictEqual(find(calc([withItemTokkan], { tokkanOverride: '3_i' }), 'special_management')[0].points, 5, 'overridden down');
  assert.strictEqual(find(calc([withItemTokkan], { tokkanOverride: 'none' }), 'special_management').length, 0, 'explicit none wins');
  assert.strictEqual(find(calc([baseItem], { tokkanOverride: '1' }), 'special_management')[0].points, 10, 'added when no item has it');
});

test('the visit-level tokkan choice still needs a guidance target and an enabled fee', () => {
  assert.strictEqual(find(calc([{ ...baseItem, claimManagement: false }], { tokkanOverride: '1' }), 'special_management').length, 0);
  assert.strictEqual(find(calc([baseItem], { tokkanOverride: '1', disabledFeeCodes: ['special_management'] }), 'special_management').length, 0);
});

// ---- 時間外・休日・深夜 ----

test('an after-hours category with an unset table adds a flagged item instead of an amount', () => {
  const normal = calc([baseItem]);
  for (const category of ['after_hours', 'holiday', 'late_night'] as const) {
    const results = calc([baseItem], { afterHoursCategory: category });
    const addition = find(results, 'after_hours');
    assert.strictEqual(addition.length, 1, category);
    assert.strictEqual(addition[0].points, 0);
    assert.strictEqual(addition[0].pointsUnset, true);
    assert.match(addition[0].rationale, /未設定/);
    assert.strictEqual(getTotalPoints(results), getTotalPoints(normal), `${category}: nothing is added to the total`);
    assert.deepStrictEqual(getUnsetPointFees(results), addition);
  }
});

test('an after-hours category with the table filled adds base amount times rate, using that category\'s name and code key', () => {
  const normal = calc([baseItem], { conditionFeeTable: filledTable });
  const base = find(normal, 'base_fee')[0].points + find(normal, 'drug_preparation')[0].points;

  const cases = [
    { category: 'after_hours', name: '時間外加算', feeKey: 'after_hours_addition', rate: 100 },
    { category: 'holiday', name: '休日加算', feeKey: 'holiday_addition', rate: 140 },
    { category: 'late_night', name: '深夜加算', feeKey: 'late_night_addition', rate: 200 }
  ] as const;
  for (const { category, name, feeKey, rate } of cases) {
    const results = calc([baseItem], { afterHoursCategory: category, conditionFeeTable: filledTable });
    const addition = find(results, 'after_hours');
    assert.strictEqual(addition.length, 1, category);
    assert.strictEqual(addition[0].name, name);
    assert.strictEqual(addition[0].feeKey, feeKey);
    assert.strictEqual(addition[0].points, Math.round((base * rate) / 100), category);
    assert.strictEqual(addition[0].pointsUnset, undefined);
    assert.strictEqual(getTotalPoints(results) - getTotalPoints(normal), addition[0].points);
  }
  // 公式コードは施設設定のキーから引く (時間外だけ設定してある)
  assert.strictEqual(find(calc([baseItem], { afterHoursCategory: 'after_hours', conditionFeeTable: filledTable }), 'after_hours')[0].receiptFeeCode, '120002380');
  assert.strictEqual(find(calc([baseItem], { afterHoursCategory: 'holiday', conditionFeeTable: filledTable }), 'after_hours')[0].receiptFeeCode, undefined);
});

test('the after-hours base follows the other switches: a fee turned off leaves the base', () => {
  const results = calc([baseItem], {
    afterHoursCategory: 'after_hours',
    conditionFeeTable: filledTable,
    disabledFeeCodes: ['drug_preparation']
  });
  const baseFee = find(results, 'base_fee')[0].points;
  assert.strictEqual(find(results, 'after_hours')[0].points, baseFee, 'only the basic fee is left in the base');
});

test('no after-hours addition for drug-fee-only claims, a disabled addition, or an empty prescription', () => {
  const options = { afterHoursCategory: 'holiday', conditionFeeTable: filledTable } as const;
  assert.strictEqual(find(calc([baseItem], { ...options, drugFeeOnly: true }), 'after_hours').length, 0);
  assert.strictEqual(find(calc([baseItem], { ...options, disabledFeeCodes: ['after_hours'] }), 'after_hours').length, 0);
  assert.strictEqual(find(calc([], options), 'after_hours').length, 0);
  assert.strictEqual(find(calc([baseItem], { afterHoursCategory: 'none', conditionFeeTable: filledTable }), 'after_hours').length, 0);
});

test('when the filled table gives zero points no empty line is added', () => {
  const zeroRate: ConditionFeeTable = {
    ...filledTable,
    afterHours: { ...filledTable.afterHours, baseFeeCodes: [] }
  };
  const results = calc([baseItem], { afterHoursCategory: 'holiday', conditionFeeTable: zeroRate });
  assert.strictEqual(find(results, 'after_hours').length, 0);
  assert.deepStrictEqual(getUnsetPointFees(results), []);
});

test('all three conditions together: each moves the total independently', () => {
  const table = filledTable;
  const plain = getTotalPoints(calc([baseItem], { conditionFeeTable: table }));
  const withNotebook = getTotalPoints(calc([baseItem], { conditionFeeTable: table, medicationNotebook: 'not_carried' }));
  const withAfterHours = getTotalPoints(calc([baseItem], { conditionFeeTable: table, afterHoursCategory: 'after_hours' }));
  const withTokkan = getTotalPoints(calc([baseItem], { conditionFeeTable: table, tokkanOverride: '1' }));
  const all = getTotalPoints(calc([baseItem], {
    conditionFeeTable: table,
    medicationNotebook: 'not_carried',
    afterHoursCategory: 'after_hours',
    tokkanOverride: '1'
  }));
  assert.strictEqual(all - plain, (withNotebook - plain) + (withAfterHours - plain) + (withTokkan - plain));
});
