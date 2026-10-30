import { test } from 'node:test';
import assert from 'node:assert';
import { calculateDispensingFees, getTotalPoints, type ItemWithPrice } from './calculator.ts';
import { calculateInsuranceAmounts } from './billing.ts';
import { DEFAULT_CONDITION_FEE_TABLE, type ConditionFeeTable } from './claim_conditions.ts';
import { previewClaimOptions, previewConditionChoices } from './claim_condition_previews.ts';
import type { FacilitySettings, Patient } from '../db/types.ts';

const settings: FacilitySettings = {
  id: 'preview-settings',
  baseFeeCategory: '1',
  regionalSupportAddition: 'none',
  medicalDxAddition: false
};
const patient: Patient = { patientId: 'p', name: 'テスト 患者', kana: 'テスト', birthDate: '1980-01-01' };
const items: ItemWithPrice[] = [
  { itemId: '1', visitId: 'v1', drugId: 'd1', amount: 3, days: 7, drugPrice: 25.1, usage: '食後', tokkanType: '3_i' }
];

// 仮の数字。実際の点数ではない
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

const calculate = (table?: ConditionFeeTable) => (options: Parameters<typeof calculateDispensingFees>[4]) =>
  calculateDispensingFees(settings, items, patient, '2026-10-30', { ...options, conditionFeeTable: table });

test('every preview equals what the screen would show after choosing that value', () => {
  const calc = calculate(filledTable);
  const previews = previewConditionChoices({ calculate: calc, options: {}, burdenRatio: 30 });

  for (const value of ['carried', 'not_carried'] as const) {
    const fees = calc({ medicationNotebook: value });
    assert.strictEqual(previews.medicationNotebook[value].totalPoints, getTotalPoints(fees), value);
    assert.strictEqual(
      previews.medicationNotebook[value].copayYen,
      calculateInsuranceAmounts(getTotalPoints(fees), 30).patientCopayYen,
      value
    );
  }
  for (const value of ['none', 'after_hours', 'holiday', 'late_night'] as const) {
    assert.strictEqual(previews.afterHoursCategory[value].totalPoints, getTotalPoints(calc({ afterHoursCategory: value })), value);
  }
  assert.strictEqual(previews.tokkanOverride.item.totalPoints, getTotalPoints(calc({})), 'per-item tokkan (3_i)');
  assert.strictEqual(previews.tokkanOverride['1'].totalPoints - previews.tokkanOverride.item.totalPoints, 10 - 5);
  assert.strictEqual(previews.tokkanOverride.none.totalPoints - previews.tokkanOverride.item.totalPoints, -5);
});

test('a preview starts from the current options, so the other conditions stay as chosen', () => {
  const calc = calculate(filledTable);
  const holidayNow = previewConditionChoices({
    calculate: calc,
    options: { afterHoursCategory: 'holiday' },
    burdenRatio: 30
  });
  // 休日のままお薬手帳なしにした場合 = 休日加算つきの手帳なし
  assert.strictEqual(
    holidayNow.medicationNotebook.not_carried.totalPoints,
    getTotalPoints(calc({ afterHoursCategory: 'holiday', medicationNotebook: 'not_carried' }))
  );
});

test('with the default table the unset choices say so and show no amount', () => {
  const previews = previewConditionChoices({ calculate: calculate(undefined), options: {}, burdenRatio: 30 });
  assert.strictEqual(previews.medicationNotebook.carried.copayYen !== null, true);
  assert.deepStrictEqual(previews.medicationNotebook.not_carried.unsetFeeNames, ['服薬管理指導料(お薬手帳なし)']);
  assert.strictEqual(previews.medicationNotebook.not_carried.copayYen, null);
  assert.deepStrictEqual(previews.afterHoursCategory.holiday.unsetFeeNames, ['休日加算']);
  assert.strictEqual(previews.afterHoursCategory.holiday.copayYen, null);
  assert.deepStrictEqual(previews.afterHoursCategory.none.unsetFeeNames, []);
});

test('previewClaimOptions uses the burden ratio of the patient', () => {
  const calc = calculate(filledTable);
  const at30 = previewClaimOptions(calc, {}, 30);
  const at10 = previewClaimOptions(calc, {}, 10);
  assert.strictEqual(at30.totalPoints, at10.totalPoints);
  assert.ok(at10.copayYen! < at30.copayYen!);
});
