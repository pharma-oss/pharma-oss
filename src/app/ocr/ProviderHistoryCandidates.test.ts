import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getProviderHistoryCandidateViewState,
  PROVIDER_HISTORY_FETCH_ERROR_ALERT_MESSAGE,
  PROVIDER_HISTORY_FETCH_ERROR_TOAST_MESSAGE
} from './helpers';

test('getProviderHistoryCandidateViewState returns error status and alert message when fetch error occurs with 0 candidates', () => {
  const state = getProviderHistoryCandidateViewState({
    candidateCount: 0,
    hasFetchError: true
  });

  assert.equal(state.status, 'error');
  assert.equal(state.hasError, true);
  assert.equal(state.errorMessage, PROVIDER_HISTORY_FETCH_ERROR_ALERT_MESSAGE);
  assert.equal(state.candidateCount, 0);
});

test('getProviderHistoryCandidateViewState prioritizes error when hasFetchError is true even if candidateCount is positive', () => {
  const state = getProviderHistoryCandidateViewState({
    candidateCount: 5,
    hasFetchError: true
  });

  assert.equal(state.status, 'error', '取得失敗時は古い候補を見せずエラー状態を最優先すること');
  assert.equal(state.hasError, true);
  assert.equal(state.errorMessage, PROVIDER_HISTORY_FETCH_ERROR_ALERT_MESSAGE);
  assert.equal(state.candidateCount, 0);
});

test('getProviderHistoryCandidateViewState returns candidates status when candidateCount is positive without error', () => {
  const state = getProviderHistoryCandidateViewState({
    candidateCount: 3,
    hasFetchError: false
  });

  assert.equal(state.status, 'candidates');
  assert.equal(state.hasError, false);
  assert.equal(state.errorMessage, null);
  assert.equal(state.candidateCount, 3);
});

test('getProviderHistoryCandidateViewState returns empty status when candidateCount is zero without error', () => {
  const state = getProviderHistoryCandidateViewState({
    candidateCount: 0,
    hasFetchError: false
  });

  assert.equal(state.status, 'empty');
  assert.equal(state.hasError, false);
  assert.equal(state.errorMessage, null);
  assert.equal(state.candidateCount, 0);
});

test('PROVIDER_HISTORY_FETCH_ERROR constants define explicit non-empty Japanese guidance', () => {
  assert.equal(
    PROVIDER_HISTORY_FETCH_ERROR_TOAST_MESSAGE,
    '過去の医療機関の入力履歴を読み込めませんでした。'
  );
  assert.equal(
    PROVIDER_HISTORY_FETCH_ERROR_ALERT_MESSAGE,
    '過去の医療機関の入力履歴を読み込めなかったため、医療機関の候補を表示できません。医療機関コードと名前は手入力してください。'
  );
});
