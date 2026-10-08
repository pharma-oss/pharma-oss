import { test } from 'node:test';
import assert from 'node:assert';
import { PLACEHOLDER_REGISTRATION_NUMBER, hasRealRegistrationNumber } from './facility_placeholders.ts';

test('the placeholder registration number is the sample value shipped with fresh facility settings', () => {
  assert.strictEqual(PLACEHOLDER_REGISTRATION_NUMBER, 'T1234567890123');
});

test('hasRealRegistrationNumber accepts only a configured number', () => {
  assert.strictEqual(hasRealRegistrationNumber('T9876543210987'), true);
  assert.strictEqual(hasRealRegistrationNumber('  T9876543210987  '), true);

  assert.strictEqual(hasRealRegistrationNumber(PLACEHOLDER_REGISTRATION_NUMBER), false, 'the sample value');
  assert.strictEqual(hasRealRegistrationNumber(` ${PLACEHOLDER_REGISTRATION_NUMBER} `), false, 'the sample value with spaces');
  assert.strictEqual(hasRealRegistrationNumber(''), false);
  assert.strictEqual(hasRealRegistrationNumber('   '), false);
  assert.strictEqual(hasRealRegistrationNumber(undefined), false);
  assert.strictEqual(hasRealRegistrationNumber(null), false);
});
