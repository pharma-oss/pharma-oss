import { test } from 'node:test';
import assert from 'node:assert';
import { toDateInputValue } from '../lib/emr_helpers';
import { formatPatientInsuranceInfo } from '../lib/myna_read_display';
import { PatientBanner } from './emr/components/PatientBanner';

test('toDateInputValue handles dates and timestamps correctly', () => {
  assert.strictEqual(toDateInputValue('2026-08-22T00:00:00.000Z'), '2026-08-22');
  assert.strictEqual(toDateInputValue('2026-08-22'), '2026-08-22');
  assert.strictEqual(toDateInputValue(''), '');
  assert.strictEqual(toDateInputValue(undefined), '');
});

test('formatPatientInsuranceInfo correctly formats insurance display', () => {
  const info = {
    provider: '06139999',
    number: '記号123 番号456',
    burdenRatio: 30,
    insuranceType: '社保',
    relationship: '本人'
  };
  const formatted = formatPatientInsuranceInfo(info as any);
  assert.ok(formatted.includes('社保'));
  assert.ok(formatted.includes('3割'));
});

test('PatientBanner component is properly exported as React component', () => {
  assert.strictEqual(typeof PatientBanner, 'object'); // React.memo
});

