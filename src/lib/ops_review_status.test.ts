import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPS_REVIEW_STATUSES,
  opsReviewStatusExitCode,
  isOpsReviewStatus
} from './ops_review_status.ts';

test('opsReviewStatusExitCode maps pass to 0, attention and blocked to 1', () => {
  assert.strictEqual(opsReviewStatusExitCode('pass'), 0);
  assert.strictEqual(opsReviewStatusExitCode('attention'), 1);
  assert.strictEqual(opsReviewStatusExitCode('blocked'), 1);
});

test('OPS_REVIEW_STATUSES includes exactly pass, attention, and blocked', () => {
  assert.deepStrictEqual([...OPS_REVIEW_STATUSES].sort(), ['attention', 'blocked', 'pass']);
});

test('isOpsReviewStatus validates 3 values and rejects invalid values', () => {
  assert.strictEqual(isOpsReviewStatus('pass'), true);
  assert.strictEqual(isOpsReviewStatus('attention'), true);
  assert.strictEqual(isOpsReviewStatus('blocked'), true);

  assert.strictEqual(isOpsReviewStatus('ok'), false);
  assert.strictEqual(isOpsReviewStatus('failed'), false);
  assert.strictEqual(isOpsReviewStatus(''), false);
  assert.strictEqual(isOpsReviewStatus(null), false);
  assert.strictEqual(isOpsReviewStatus(undefined), false);
  assert.strictEqual(isOpsReviewStatus(0), false);
  assert.strictEqual(isOpsReviewStatus({}), false);
});
