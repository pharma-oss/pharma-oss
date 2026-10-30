import { test } from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_CONDITION_FEE_TABLE,
  buildClaimConditionAuditDetail,
  buildClaimConditionChangeSummary,
  calculateAfterHoursPoints,
  judgeAfterHoursCategory,
  resolveAfterHoursCategory,
  resolveMedicationNotebook,
  resolveTokkanOverride,
  type ConditionFeeTable
} from './claim_conditions.ts';
import type { PharmacyBusinessHours } from '../db/types.ts';

// ---- 条件の読み取り: 未設定・壊れた値は従来どおりの算定になる ----

test('unset or unknown conditions fall back to the existing billing (notebook carried, normal hours, per-item tokkan)', () => {
  assert.strictEqual(resolveMedicationNotebook(undefined), 'carried');
  assert.strictEqual(resolveMedicationNotebook({}), 'carried');
  assert.strictEqual(resolveMedicationNotebook({ medicationNotebook: 'not_carried' }), 'not_carried');
  assert.strictEqual(resolveMedicationNotebook({ medicationNotebook: 'bogus' as never }), 'carried');

  assert.strictEqual(resolveAfterHoursCategory(undefined), 'none');
  assert.strictEqual(resolveAfterHoursCategory({ afterHoursCategory: 'late_night' }), 'late_night');
  assert.strictEqual(resolveAfterHoursCategory({ afterHoursCategory: 'bogus' as never }), 'none');

  assert.strictEqual(resolveTokkanOverride(undefined), undefined);
  assert.strictEqual(resolveTokkanOverride({ tokkanOverride: 'none' }), 'none', "'none' is an explicit choice, not unset");
  assert.strictEqual(resolveTokkanOverride({ tokkanOverride: '3_i' }), '3_i');
  assert.strictEqual(resolveTokkanOverride({ tokkanOverride: 'bogus' as never }), undefined);
});

// ---- 点数表 ----

test('the default table keeps the existing 45 points for the notebook and leaves every unknown value unset', () => {
  const table = DEFAULT_CONDITION_FEE_TABLE;
  assert.strictEqual(table.medicationGuidance.carried.points, 45);
  assert.strictEqual(table.medicationGuidance.carried.name, '服薬管理指導料1');
  // 令和8年6月施行の値が確認されるまで、推測で数字を入れない
  assert.strictEqual(table.medicationGuidance.not_carried.points, null);
  for (const category of ['after_hours', 'holiday', 'late_night'] as const) {
    assert.strictEqual(table.afterHours.categories[category].ratePercent, null, category);
  }
  assert.strictEqual(table.afterHours.baseFeeCodes, null);
  // 優先順位は暫定 (正式なルールが確認できたらこの並びを差し替える)
  assert.deepStrictEqual(table.afterHours.priority, ['late_night', 'holiday', 'after_hours']);
});

const filledTable: ConditionFeeTable = {
  medicationGuidance: DEFAULT_CONDITION_FEE_TABLE.medicationGuidance,
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

const sampleFees = [
  { code: 'base_fee' as const, points: 47 },
  { code: 'drug_preparation' as const, points: 24 },
  { code: 'medication_guidance' as const, points: 45 },
  { code: 'drug_fee' as const, points: 56 }
];

test('after-hours points are the base amount times the rate, summed over the codes in the table only', () => {
  // 基礎額 = 47 + 24 = 71 (指導料と薬剤料は表に無いので含めない)
  assert.deepStrictEqual(
    calculateAfterHoursPoints({ category: 'after_hours', fees: sampleFees, table: filledTable }),
    { status: 'set', points: 71, baseAmount: 71, ratePercent: 100 }
  );
  assert.deepStrictEqual(
    calculateAfterHoursPoints({ category: 'holiday', fees: sampleFees, table: filledTable }),
    { status: 'set', points: 99, baseAmount: 71, ratePercent: 140 } // 71 * 1.4 = 99.4 -> 99
  );
  assert.deepStrictEqual(
    calculateAfterHoursPoints({ category: 'late_night', fees: sampleFees, table: filledTable }),
    { status: 'set', points: 142, baseAmount: 71, ratePercent: 200 }
  );
});

test('after-hours rounding follows the table (round, floor, ceil)', () => {
  const withRounding = (rounding: 'round' | 'floor' | 'ceil'): ConditionFeeTable => ({
    ...filledTable,
    afterHours: { ...filledTable.afterHours, rounding }
  });
  // 71 * 1.4 = 99.4
  assert.strictEqual((calculateAfterHoursPoints({ category: 'holiday', fees: sampleFees, table: withRounding('round') }) as { points: number }).points, 99);
  assert.strictEqual((calculateAfterHoursPoints({ category: 'holiday', fees: sampleFees, table: withRounding('floor') }) as { points: number }).points, 99);
  assert.strictEqual((calculateAfterHoursPoints({ category: 'holiday', fees: sampleFees, table: withRounding('ceil') }) as { points: number }).points, 100);
});

test('a result that lands exactly on .5 rounds up when the table says round', () => {
  // 25 × 14% = 3.5 ちょうど。四捨五入で 4、切り捨てなら 3
  const withRounding = (rounding: 'round' | 'floor'): ConditionFeeTable => ({
    ...filledTable,
    afterHours: {
      ...filledTable.afterHours,
      rounding,
      categories: {
        ...filledTable.afterHours.categories,
        after_hours: { ...filledTable.afterHours.categories.after_hours, ratePercent: 14 }
      }
    }
  });
  const fees = [{ code: 'base_fee' as const, points: 25 }];
  assert.deepStrictEqual(
    calculateAfterHoursPoints({ category: 'after_hours', fees, table: withRounding('round') }),
    { status: 'set', points: 4, baseAmount: 25, ratePercent: 14 }
  );
  assert.deepStrictEqual(
    calculateAfterHoursPoints({ category: 'after_hours', fees, table: withRounding('floor') }),
    { status: 'set', points: 3, baseAmount: 25, ratePercent: 14 }
  );
});

test('after-hours points stay unset when the rate or the base codes are missing, and say which', () => {
  assert.deepStrictEqual(
    calculateAfterHoursPoints({ category: 'holiday', fees: sampleFees }),
    { status: 'unset', missing: ['rate', 'base_fee_codes'] }
  );
  const rateOnly: ConditionFeeTable = {
    ...filledTable,
    afterHours: { ...filledTable.afterHours, baseFeeCodes: null }
  };
  assert.deepStrictEqual(
    calculateAfterHoursPoints({ category: 'holiday', fees: sampleFees, table: rateOnly }),
    { status: 'unset', missing: ['base_fee_codes'] }
  );
  const codesOnly: ConditionFeeTable = {
    ...filledTable,
    afterHours: {
      ...filledTable.afterHours,
      categories: {
        ...filledTable.afterHours.categories,
        holiday: { ...filledTable.afterHours.categories.holiday, ratePercent: null }
      }
    }
  };
  assert.deepStrictEqual(
    calculateAfterHoursPoints({ category: 'holiday', fees: sampleFees, table: codesOnly }),
    { status: 'unset', missing: ['rate'] }
  );
});

// ---- 自動判定 (受付時刻 × 開局時間) ----

const hours: PharmacyBusinessHours = {
  weekday: { open: '09:00', close: '18:00' },
  saturday: { open: '09:00', close: '13:00' },
  holidayDates: ['2026-11-03', '2026-12-30'],
  lateNightStart: '22:00',
  lateNightEnd: '06:00'
};

// ローカル時刻で組み立てる。UTC 表記の固定文字列は、実行環境のタイムゾーンで結果が変わる。
const at = (month: number, day: number, hour: number, minute = 0) =>
  new Date(2026, month - 1, day, hour, minute).toISOString();

function categoryOf(receptionAt: string, h: PharmacyBusinessHours | undefined = hours) {
  const result = judgeAfterHoursCategory(receptionAt, h);
  assert.strictEqual(result.status, 'judged', JSON.stringify(result));
  return result.status === 'judged' ? result.category : undefined;
}

test('a weekday reception inside opening hours is normal, including the opening minute and excluding the closing minute', () => {
  // 2026-10-28 は水曜日
  assert.strictEqual(categoryOf(at(10, 28, 9, 0)), 'none', 'opening minute');
  assert.strictEqual(categoryOf(at(10, 28, 12, 30)), 'none');
  assert.strictEqual(categoryOf(at(10, 28, 17, 59)), 'none', 'last minute');
  assert.strictEqual(categoryOf(at(10, 28, 18, 0)), 'after_hours', 'closing minute is already outside');
  assert.strictEqual(categoryOf(at(10, 28, 8, 59)), 'after_hours', 'one minute before opening');
});

test('late night wins over everything, including the part that crosses midnight', () => {
  assert.strictEqual(categoryOf(at(10, 28, 22, 0)), 'late_night');
  assert.strictEqual(categoryOf(at(10, 28, 23, 59)), 'late_night');
  assert.strictEqual(categoryOf(at(10, 29, 0, 30)), 'late_night');
  assert.strictEqual(categoryOf(at(10, 29, 5, 59)), 'late_night');
  assert.strictEqual(categoryOf(at(10, 29, 6, 0)), 'after_hours', '06:00 is no longer late night but is before opening');
  assert.strictEqual(categoryOf(at(11, 1, 23, 0)), 'late_night', 'a Sunday night is late night, not holiday');
});

test('Sundays and registered dates are holidays, and a registered date outranks the weekday hours', () => {
  assert.strictEqual(categoryOf(at(11, 1, 10, 0)), 'holiday', '2026-11-01 is a Sunday');
  assert.strictEqual(categoryOf(at(11, 3, 10, 0)), 'holiday', '2026-11-03 is registered (a Tuesday)');
  assert.strictEqual(categoryOf(at(12, 30, 11, 0)), 'holiday', 'year-end date registered');
  assert.strictEqual(categoryOf(at(11, 4, 10, 0)), 'none', 'the day after is a normal weekday');
});

test('Saturday uses the Saturday hours', () => {
  // 2026-10-31 は土曜日
  assert.strictEqual(categoryOf(at(10, 31, 12, 59)), 'none');
  assert.strictEqual(categoryOf(at(10, 31, 13, 0)), 'after_hours');
});

test('a Saturday with no registered hours counts as closed', () => {
  const noSaturday: PharmacyBusinessHours = { ...hours, saturday: undefined };
  assert.strictEqual(categoryOf(at(10, 31, 10, 0), noSaturday), 'after_hours');
});

test('without late-night times the late-night window is not judged', () => {
  const noLateNight: PharmacyBusinessHours = { weekday: hours.weekday, saturday: hours.saturday };
  assert.strictEqual(categoryOf(at(10, 28, 23, 0), noLateNight), 'after_hours');
  assert.strictEqual(categoryOf(at(10, 28, 12, 0), noLateNight), 'none');
});

test('the judgement uses the device calendar day, not the UTC day, in the early morning', () => {
  // 日本時間の朝8:30 (UTC では前日) でも、その日の暦日・曜日で判定する。2026-11-03 は登録済みの休日。
  assert.strictEqual(categoryOf(at(11, 3, 8, 30)), 'holiday');
  // 2026-11-04 (水) の朝 8:30 は、UTC だと 11-03 (休日) になってしまう時刻。休日ではなく時間外のはず
  assert.strictEqual(categoryOf(at(11, 4, 8, 30)), 'after_hours');
});

test('without reception time or opening hours nothing is judged, instead of falling back to normal', () => {
  assert.deepStrictEqual(
    judgeAfterHoursCategory(undefined, hours),
    {
      status: 'unavailable',
      reason: 'no_reception_time',
      message: 'この受付には受付時刻が記録されていないため、自動判定できません。区分を手動で選んでください。'
    }
  );
  assert.strictEqual(judgeAfterHoursCategory('not a date', hours).status, 'unavailable');
  const noHours = judgeAfterHoursCategory(at(10, 28, 12), undefined);
  assert.strictEqual(noHours.status, 'unavailable');
  assert.strictEqual(noHours.status === 'unavailable' ? noHours.reason : undefined, 'hours_unconfigured');
  assert.strictEqual(judgeAfterHoursCategory(at(10, 28, 12), {}).status, 'unavailable');
  assert.strictEqual(judgeAfterHoursCategory(at(10, 28, 12), { holidayDates: ['2026-10-28'] }).status, 'unavailable');
});

// ---- 監査ログの文言 ----

test('the change summary lists only what changed, in the order notebook, after-hours, tokkan', () => {
  assert.strictEqual(buildClaimConditionChangeSummary({}, {}), null);
  assert.strictEqual(
    buildClaimConditionChangeSummary({}, { medicationNotebook: 'not_carried' }),
    'お薬手帳 お薬手帳あり → お薬手帳なし'
  );
  assert.strictEqual(
    buildClaimConditionChangeSummary(
      { medicationNotebook: 'not_carried', afterHoursCategory: 'holiday', tokkanOverride: '1' },
      { medicationNotebook: 'carried', afterHoursCategory: 'late_night', tokkanOverride: undefined }
    ),
    'お薬手帳 お薬手帳なし → お薬手帳あり / 時間外等 休日 → 深夜 / 特定薬剤管理指導加算 特定薬剤管理指導加算1 → 処方明細ごと'
  );
});

test('setting a condition to its default value is not a change', () => {
  assert.strictEqual(buildClaimConditionChangeSummary({}, { medicationNotebook: 'carried', afterHoursCategory: 'none' }), null);
});

test('the audit detail carries the before/after amounts when both are known', () => {
  assert.strictEqual(
    buildClaimConditionAuditDetail({}, { afterHoursCategory: 'after_hours' }, {
      before: { totalPoints: 83, copayYen: 250 },
      after: { totalPoints: 154, copayYen: 460 }
    }),
    '算定条件変更: 時間外等 通常 → 時間外 (83点・窓口負担¥250 → 154点・窓口負担¥460)'
  );
  assert.strictEqual(
    buildClaimConditionAuditDetail({}, { afterHoursCategory: 'after_hours' }),
    '算定条件変更: 時間外等 通常 → 時間外'
  );
  assert.strictEqual(buildClaimConditionAuditDetail({}, {}), null);
});

// ---- 優先順位は点数表から差し替えられる ----

test('the priority list decides between categories that apply together, and the default is late night > holiday > after hours', () => {
  // 2026-11-01 (日) の 23:00 は、深夜でもあり日曜 (休日) でもあり、閉局中 (時間外) でもある
  const sundayNight = at(11, 1, 23, 0);
  const judged = (priority?: Parameters<typeof judgeAfterHoursCategory>[2]) => {
    const result = judgeAfterHoursCategory(sundayNight, hours, priority);
    assert.strictEqual(result.status, 'judged');
    return result.status === 'judged' ? result : undefined;
  };
  assert.strictEqual(judged()?.category, 'late_night', 'default order');
  assert.strictEqual(judged(['holiday', 'late_night', 'after_hours'])?.category, 'holiday');
  assert.strictEqual(judged(['after_hours', 'holiday', 'late_night'])?.category, 'after_hours');
  assert.match(judged(['holiday', 'late_night', 'after_hours'])?.reason ?? '', /日曜日/);
  assert.match(judged(['after_hours', 'holiday', 'late_night'])?.reason ?? '', /日曜は開局時間が登録されていない/);
});

test('a category left out of the priority list is never chosen, even when it applies', () => {
  const result = judgeAfterHoursCategory(at(11, 1, 10, 0), hours, ['late_night', 'after_hours']);
  // 日曜の昼は休日。休日を外すと、閉局中の時間外になる
  assert.strictEqual(result.status === 'judged' ? result.category : undefined, 'after_hours');
  const none = judgeAfterHoursCategory(at(11, 1, 10, 0), hours, ['late_night']);
  assert.strictEqual(none.status === 'judged' ? none.category : undefined, 'none');
});

test('the default priority is the one in the fee table', () => {
  const viaTable = judgeAfterHoursCategory(at(11, 1, 23, 0), hours, DEFAULT_CONDITION_FEE_TABLE.afterHours.priority);
  assert.deepStrictEqual(viaTable, judgeAfterHoursCategory(at(11, 1, 23, 0), hours));
});

test('the unconfigured message tells the user to choose the category by hand', () => {
  const result = judgeAfterHoursCategory(at(10, 28, 12), undefined);
  assert.strictEqual(
    result.status === 'unavailable' ? result.message : undefined,
    '開局時間が未設定のため自動判定できません。区分を手動で選んでください。'
  );
});
