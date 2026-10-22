import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNumericInput, stepNumericText } from './number_stepper';

describe('number stepper', () => {
  it('normalizes full-width digits and periods typed through an IME', () => {
    assert.equal(normalizeNumericInput('１４'), '14');
    assert.equal(normalizeNumericInput('０．５'), '0.5');
    assert.equal(normalizeNumericInput(' 3 '), '3');
    assert.equal(normalizeNumericInput('abc'), 'abc');
  });

  it('starts from zero when the field is empty or unreadable', () => {
    assert.equal(stepNumericText('', 1), '1');
    assert.equal(stepNumericText('abc', 1), '1');
    assert.equal(stepNumericText('', -1), '0');
  });

  it('adds and subtracts without floating point noise', () => {
    assert.equal(stepNumericText('0.1', 0.2), '0.3');
    assert.equal(stepNumericText('1.5', 0.5), '2');
    assert.equal(stepNumericText('３', 1), '4');
  });

  it('clamps to the range', () => {
    assert.equal(stepNumericText('0', -1), '0');
    assert.equal(stepNumericText('364', 1, { max: 365 }), '365');
    assert.equal(stepNumericText('365', 1, { max: 365 }), '365');
    assert.equal(stepNumericText('2', -5, { min: 1 }), '1');
  });

  it('keeps the original text when the result would not fit maxLength', () => {
    assert.equal(stepNumericText('999', 1, { maxLength: 3 }), '999');
    assert.equal(stepNumericText('99', 1, { maxLength: 3 }), '100');
  });
});
