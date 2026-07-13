import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFlexibleDateInput } from './date_input.ts';

test('parseFlexibleDateInput accepts YYYY-MM-DD as-is', () => {
  assert.equal(parseFlexibleDateInput('2028-12-31'), '2028-12-31');
});

test('parseFlexibleDateInput normalizes slash and dot separators, padding single digits', () => {
  assert.equal(parseFlexibleDateInput('2028/1/5'), '2028-01-05');
  assert.equal(parseFlexibleDateInput('2028.1.5'), '2028-01-05');
});

test('parseFlexibleDateInput accepts continuous 8-digit YYYYMMDD', () => {
  assert.equal(parseFlexibleDateInput('19850315'), '1985-03-15');
  assert.equal(parseFlexibleDateInput('20281231'), '2028-12-31');
});

test('parseFlexibleDateInput rejects calendar-invalid dates even when well-formed', () => {
  assert.equal(parseFlexibleDateInput('20260230'), undefined);
  assert.equal(parseFlexibleDateInput('2026-02-30'), undefined);
  assert.equal(parseFlexibleDateInput('20261301'), undefined);
});

test('parseFlexibleDateInput rejects empty, partial, and garbage input', () => {
  assert.equal(parseFlexibleDateInput(''), undefined);
  assert.equal(parseFlexibleDateInput(undefined), undefined);
  assert.equal(parseFlexibleDateInput('1985031'), undefined);
  assert.equal(parseFlexibleDateInput('198503155'), undefined);
  assert.equal(parseFlexibleDateInput('abcdefgh'), undefined);
});
