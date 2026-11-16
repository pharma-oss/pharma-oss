import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import BusinessHoursSettingsSection from './BusinessHoursSettingsSection';
import type { PharmacyBusinessHours } from '@/db/types';
import { EMPTY_BUSINESS_HOURS_DRAFT } from '@/lib/business_hours_input';
import { renderWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';

const VALID_HOURS: PharmacyBusinessHours = {
  weekday: { open: '09:00', close: '18:30' },
  saturday: { open: '09:00', close: '13:00' },
  lateNightStart: '22:00',
  lateNightEnd: '06:00',
  holidayDates: ['2026-11-03', '2026-12-29']
};

test('BusinessHoursSettingsSection renders initial configured values, enabled inputs, and priority documentation without validation alerts', () => {
  const { html, callCount } = renderWithReactUseStateMock(
    () =>
      React.createElement(BusinessHoursSettingsSection, {
        businessHours: VALID_HOURS,
        disabled: false,
        onChange: () => {}
      }),
    {
      componentName: 'BusinessHoursSettingsSection',
      expectedCalls: 1,
      overrides: {
        0: {
          assertInitial: (initialState) => {
            assert.strictEqual(typeof initialState, 'function');
          }
        }
      }
    }
  );

  assert.strictEqual(callCount, 1);
  assert.ok(html.includes('開局時間・休日（時間外・休日・深夜の自動判定）'));
  assert.ok(html.includes('深夜 → 休日 → 時間外 → 通常'));
  assert.ok(html.includes('data-testid="business-hours-settings"'));
  assert.match(html, /<input\b[^>]*id="businessHoursWeekdayOpen"[^>]*type="time"[^>]*value="09:00"/);
  assert.match(html, /<input\b[^>]*id="businessHoursWeekdayClose"[^>]*type="time"[^>]*value="18:30"/);
  assert.match(html, /<input\b[^>]*id="businessHoursSaturdayOpen"[^>]*type="time"[^>]*value="09:00"/);
  assert.match(html, /<input\b[^>]*id="businessHoursSaturdayClose"[^>]*type="time"[^>]*value="13:00"/);
  assert.match(html, /<input\b[^>]*id="businessHoursLateNightStart"[^>]*type="time"[^>]*value="22:00"/);
  assert.match(html, /<input\b[^>]*id="businessHoursLateNightEnd"[^>]*type="time"[^>]*value="06:00"/);
  assert.match(html, /<textarea\b[^>]*id="businessHoursHolidayDates"[^>]*>2026-11-03\n2026-12-29<\/textarea>/);
  assert.ok(!html.includes('role="alert"'));
  assert.ok(!html.includes('aria-invalid="true"'));
  assert.doesNotMatch(html, /\sdisabled=""(?=[\s/>]|$)/);
});

test('BusinessHoursSettingsSection disables all inputs and holiday textarea when disabled=true', () => {
  const { html } = renderWithReactUseStateMock(
    () =>
      React.createElement(BusinessHoursSettingsSection, {
        businessHours: undefined,
        disabled: true,
        onChange: () => {}
      }),
    {
      componentName: 'BusinessHoursSettingsSection',
      expectedCalls: 1
    }
  );

  const expectedIds = [
    'businessHoursWeekdayOpen',
    'businessHoursWeekdayClose',
    'businessHoursSaturdayOpen',
    'businessHoursSaturdayClose',
    'businessHoursLateNightStart',
    'businessHoursLateNightEnd'
  ];
  for (const id of expectedIds) {
    assert.match(
      html,
      new RegExp(`<input\\b[^>]*id="${id}"[^>]*\\sdisabled=""(?=[\\s/>]|$)`),
      `Expected input #${id} to be disabled`
    );
  }
  assert.match(
    html,
    /<textarea\b[^>]*id="businessHoursHolidayDates"[^>]*\sdisabled=""(?=[\s/>]|$)/
  );
});

test('BusinessHoursSettingsSection renders inline role="alert" messages and aria-invalid="true" for invalid time ranges and partial input', () => {
  const { html } = renderWithReactUseStateMock(
    () =>
      React.createElement(BusinessHoursSettingsSection, {
        businessHours: undefined,
        disabled: false,
        onChange: () => {}
      }),
    {
      componentName: 'BusinessHoursSettingsSection',
      expectedCalls: 1,
      overrides: {
        0: {
          value: {
            ...EMPTY_BUSINESS_HOURS_DRAFT,
            weekdayOpen: '18:00',
            weekdayClose: '09:00',
            saturdayOpen: '09:00',
            saturdayClose: ''
          }
        }
      }
    }
  );

  assert.match(html, /<input\b[^>]*id="businessHoursWeekdayClose"[^>]*aria-invalid="true"/);
  assert.match(html, /<input\b[^>]*id="businessHoursSaturdayClose"[^>]*aria-invalid="true"/);
  assert.doesNotMatch(html, /<input\b[^>]*id="businessHoursWeekdayOpen"[^>]*aria-invalid="true"/);
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('閉局を開局より後にしてください'));
  assert.ok(html.includes('開局と閉局の両方を入れてください'));
});
