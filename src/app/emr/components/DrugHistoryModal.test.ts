import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DRUG_HISTORY_EMPTY_MESSAGE,
  DRUG_HISTORY_LOAD_ERROR_MESSAGE,
  getDrugHistoryModalBodyState,
} from './DrugHistoryModal';

test('getDrugHistoryModalBodyState returns loading while loading is true regardless of error or drugCount', () => {
  assert.deepStrictEqual(getDrugHistoryModalBodyState(true, false, 0), {
    status: 'loading',
  });
  assert.deepStrictEqual(getDrugHistoryModalBodyState(true, true, 3), {
    status: 'loading',
  });
});

test('getDrugHistoryModalBodyState returns error message when loading failed instead of empty state', () => {
  assert.deepStrictEqual(getDrugHistoryModalBodyState(false, true, 0), {
    status: 'error',
    message: DRUG_HISTORY_LOAD_ERROR_MESSAGE,
  });
  assert.deepStrictEqual(getDrugHistoryModalBodyState(false, true, 2), {
    status: 'error',
    message: DRUG_HISTORY_LOAD_ERROR_MESSAGE,
  });
});

test('getDrugHistoryModalBodyState distinguishes empty history from ready state when load succeeded', () => {
  assert.deepStrictEqual(getDrugHistoryModalBodyState(false, false, 0), {
    status: 'empty',
    message: DRUG_HISTORY_EMPTY_MESSAGE,
  });
  assert.deepStrictEqual(getDrugHistoryModalBodyState(false, false, 1), {
    status: 'ready',
  });
});
