import { test } from 'node:test';
import assert from 'node:assert';
import {
  EMPTY_BUSINESS_HOURS_DRAFT,
  parseBusinessHoursDraft,
  toBusinessHoursDraft,
  type BusinessHoursDraft
} from './business_hours_input.ts';
import { judgeAfterHoursCategory } from './claim_conditions.ts';

const draft = (overrides: Partial<BusinessHoursDraft>): BusinessHoursDraft => ({ ...EMPTY_BUSINESS_HOURS_DRAFT, ...overrides });

test('an empty form means no business hours at all', () => {
  assert.deepStrictEqual(parseBusinessHoursDraft(EMPTY_BUSINESS_HOURS_DRAFT), { hours: undefined, issues: [] });
});

test('a filled form becomes business hours with zero-padded times and sorted, de-duplicated holidays', () => {
  const result = parseBusinessHoursDraft(draft({
    weekdayOpen: '9:00',
    weekdayClose: '18:30',
    saturdayOpen: '09:00',
    saturdayClose: '13:00',
    lateNightStart: '22:00',
    lateNightEnd: '6:00',
    holidayDatesText: '2026-12-30\n2026/11/3, 2026-12-30  2026-01-01'
  }));
  assert.deepStrictEqual(result.issues, []);
  assert.deepStrictEqual(result.hours, {
    weekday: { open: '09:00', close: '18:30' },
    saturday: { open: '09:00', close: '13:00' },
    holidayDates: ['2026-01-01', '2026-11-03', '2026-12-30'],
    lateNightStart: '22:00',
    lateNightEnd: '06:00'
  });
});

test('the form round-trips through the stored value', () => {
  const stored = {
    weekday: { open: '09:00', close: '18:00' },
    holidayDates: ['2026-11-03', '2026-12-30'],
    lateNightStart: '22:00',
    lateNightEnd: '06:00'
  };
  const parsed = parseBusinessHoursDraft(toBusinessHoursDraft(stored));
  assert.deepStrictEqual(parsed, { hours: stored, issues: [] });
});

test('a half-filled pair is reported and left out, so nothing half-valid is saved', () => {
  const result = parseBusinessHoursDraft(draft({ weekdayOpen: '09:00', lateNightEnd: '06:00' }));
  assert.strictEqual(result.hours, undefined);
  assert.deepStrictEqual(result.issues.map((issue) => issue.field), ['weekdayClose', 'lateNightStart']);
});

test('an unreadable time, a reversed range and equal late-night times are reported', () => {
  const bad = parseBusinessHoursDraft(draft({
    weekdayOpen: '25:00',
    weekdayClose: '18:00',
    saturdayOpen: '13:00',
    saturdayClose: '09:00',
    lateNightStart: '22:00',
    lateNightEnd: '22:00'
  }));
  assert.strictEqual(bad.hours, undefined);
  assert.deepStrictEqual(bad.issues.map((issue) => issue.field), ['weekdayOpen', 'saturdayClose', 'lateNightEnd']);
});

test('an impossible date is reported instead of rolling over into another day', () => {
  const result = parseBusinessHoursDraft(draft({ holidayDatesText: '2026-02-30\n2026-11-03\nabc' }));
  assert.deepStrictEqual(result.hours, { holidayDates: ['2026-11-03'] });
  assert.deepStrictEqual(result.issues.map((issue) => issue.message), [
    '休日の日付「2026-02-30」が正しくありません（例: 2026-12-29）。',
    '休日の日付「abc」が正しくありません（例: 2026-12-29）。'
  ]);
});

test('hours typed in the form drive the judgement, not only the stored shape', () => {
  const { hours } = parseBusinessHoursDraft(draft({ weekdayOpen: '9:00', weekdayClose: '18:00', saturdayOpen: '9:00', saturdayClose: '13:00' }));
  const wednesdayEvening = new Date(2026, 9, 28, 19, 0).toISOString();
  const result = judgeAfterHoursCategory(wednesdayEvening, hours);
  assert.strictEqual(result.status === 'judged' ? result.category : undefined, 'after_hours');
});

test('opening and closing at the same minute is not a range', () => {
  const result = parseBusinessHoursDraft(draft({ weekdayOpen: '09:00', weekdayClose: '09:00' }));
  assert.strictEqual(result.hours, undefined);
  assert.deepStrictEqual(result.issues.map((issue) => issue.field), ['weekdayClose']);
});
