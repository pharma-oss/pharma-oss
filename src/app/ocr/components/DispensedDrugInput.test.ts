import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDispensedDrugCandidateViewState } from '../helpers';

test('getDispensedDrugCandidateViewState returns error status and error message when fetch error occurs with 0 candidates', () => {
  const state = getDispensedDrugCandidateViewState({
    candidateCount: 0,
    hasFetchError: true
  });

  assert.equal(state.status, 'error');
  assert.equal(state.hasError, true);
  assert.equal(
    state.errorMessage,
    '調剤薬品の候補を取得できませんでした。薬品検索を開くから選んでください。'
  );
  assert.equal(state.candidateCount, 0);
});

test('getDispensedDrugCandidateViewState prioritizes error when hasFetchError is true even if candidateCount is positive', () => {
  const state = getDispensedDrugCandidateViewState({
    candidateCount: 4,
    hasFetchError: true
  });

  assert.equal(state.status, 'error', '取得失敗時は前の候補を見せずエラー状態を最優先すること');
  assert.equal(state.hasError, true);
  assert.equal(
    state.errorMessage,
    '調剤薬品の候補を取得できませんでした。薬品検索を開くから選んでください。'
  );
  assert.equal(state.candidateCount, 0);
});

test('getDispensedDrugCandidateViewState returns candidates status when candidates exist without error', () => {
  const state = getDispensedDrugCandidateViewState({
    candidateCount: 3,
    hasFetchError: false
  });

  assert.equal(state.status, 'candidates');
  assert.equal(state.hasError, false);
  assert.equal(state.errorMessage, null);
  assert.equal(state.candidateCount, 3);
});

test('getDispensedDrugCandidateViewState returns empty status when candidates count is zero without error', () => {
  const state = getDispensedDrugCandidateViewState({
    candidateCount: 0,
    hasFetchError: false
  });

  assert.equal(state.status, 'empty');
  assert.equal(state.hasError, false);
  assert.equal(state.errorMessage, null);
  assert.equal(state.candidateCount, 0);
});
