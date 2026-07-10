import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const emrSource = readFileSync(new URL('./emr/page.tsx', import.meta.url), 'utf8');

test('emr insurance modal stores eligibility dates and public expense monthly limit', () => {
  assert.match(emrSource, /editEligibilityStatus/);
  assert.match(emrSource, /eligibilityCheckedAt/);
  assert.match(emrSource, /validFrom/);
  assert.match(emrSource, /validTo/);
  assert.match(emrSource, /monthlyLimitYen/);
  assert.match(emrSource, /資格確認・有効期間/);
  assert.match(emrSource, /公費有効期限/);
  assert.match(emrSource, /月額負担上限/);
  assert.match(emrSource, /toDateInputValue/);
});
