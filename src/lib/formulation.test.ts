import { test } from 'node:test';
import assert from 'node:assert';
import { getFormulationType } from './calculator.ts';

test('getFormulationType returns "other" for undefined, null, or short yjCode', () => {
  assert.strictEqual(getFormulationType(undefined), 'other');
  assert.strictEqual(getFormulationType(null as any), 'other');
  assert.strictEqual(getFormulationType(''), 'other');
  assert.strictEqual(getFormulationType('1234567'), 'other');
});

test('getFormulationType returns "powder" for characters B, C, D, M at 8th position', () => {
  assert.strictEqual(getFormulationType('1234567B'), 'powder');
  assert.strictEqual(getFormulationType('1234567C'), 'powder');
  assert.strictEqual(getFormulationType('1234567D'), 'powder');
  assert.strictEqual(getFormulationType('1234567M'), 'powder');
});

test('getFormulationType returns "liquid" for character A at 8th position', () => {
  assert.strictEqual(getFormulationType('1234567A'), 'liquid');
});

test('getFormulationType returns "tablet" for characters F, G, H at 8th position', () => {
  assert.strictEqual(getFormulationType('1234567F'), 'tablet');
  assert.strictEqual(getFormulationType('1234567G'), 'tablet');
  assert.strictEqual(getFormulationType('1234567H'), 'tablet');
});

test('getFormulationType returns "ointment" for characters Q, R, S, V, W at 8th position', () => {
  assert.strictEqual(getFormulationType('1234567Q'), 'ointment');
  assert.strictEqual(getFormulationType('1234567R'), 'ointment');
  assert.strictEqual(getFormulationType('1234567S'), 'ointment');
  assert.strictEqual(getFormulationType('1234567V'), 'ointment');
  assert.strictEqual(getFormulationType('1234567W'), 'ointment');
});

test('getFormulationType returns "other" for unknown characters at 8th position', () => {
  assert.strictEqual(getFormulationType('1234567X'), 'other');
  assert.strictEqual(getFormulationType('1234567Z'), 'other');
  assert.strictEqual(getFormulationType('12345671'), 'other');
});

test('getFormulationType is case-insensitive for the 8th character', () => {
  assert.strictEqual(getFormulationType('1234567b'), 'powder');
  assert.strictEqual(getFormulationType('1234567a'), 'liquid');
  assert.strictEqual(getFormulationType('1234567f'), 'tablet');
  assert.strictEqual(getFormulationType('1234567q'), 'ointment');
});
