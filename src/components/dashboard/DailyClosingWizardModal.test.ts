import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getClosingCheckDisplayState,
  type ClosingCheckSummary,
} from './DailyClosingWizardModal';

test('getClosingCheckDisplayState returns checking status when isChecking is true', () => {
  const summary: ClosingCheckSummary = {
    todayVisitsCount: 10,
    uncompletedEmrCount: 1,
    unsentClaimCount: 0,
    canProceed: true,
  };
  assert.deepStrictEqual(getClosingCheckDisplayState(true, false, null), {
    status: 'checking',
  });
  assert.deepStrictEqual(getClosingCheckDisplayState(true, true, summary), {
    status: 'checking',
  });
});

test('getClosingCheckDisplayState returns error status with clear message when pre-check fails', () => {
  const state = getClosingCheckDisplayState(false, true, null);
  assert.strictEqual(state.status, 'error');
  if (state.status === 'error') {
    assert.strictEqual(
      state.message,
      '事前点検に失敗したため、本日の受付件数および薬歴未完了件数を確認できませんでした。'
    );
  }
});

test('getClosingCheckDisplayState prioritizes error status even if stale checkSummary is passed', () => {
  const staleSummary: ClosingCheckSummary = {
    todayVisitsCount: 0,
    uncompletedEmrCount: 0,
    unsentClaimCount: 0,
    canProceed: true,
  };
  const state = getClosingCheckDisplayState(false, true, staleSummary);
  assert.strictEqual(state.status, 'error');
  if (state.status === 'error') {
    assert.strictEqual(
      state.message,
      '事前点検に失敗したため、本日の受付件数および薬歴未完了件数を確認できませんでした。'
    );
  }
});

test('getClosingCheckDisplayState returns error status if checkSummary is missing when not checking', () => {
  const state = getClosingCheckDisplayState(false, false, null);
  assert.strictEqual(state.status, 'error');
});

test('getClosingCheckDisplayState returns ready status with counts when check completed successfully', () => {
  const summary: ClosingCheckSummary = {
    todayVisitsCount: 42,
    uncompletedEmrCount: 3,
    unsentClaimCount: 0,
    canProceed: true,
  };
  const state = getClosingCheckDisplayState(false, false, summary);
  assert.deepStrictEqual(state, {
    status: 'ready',
    todayVisitsCount: 42,
    uncompletedEmrCount: 3,
  });
});
