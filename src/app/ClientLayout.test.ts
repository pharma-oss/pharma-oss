import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAFF_LOAD_TIMEOUT_MS,
  PRE_LOGIN_TOUR_STORAGE_KEY,
  STAFF_NO_USERS_ERROR_MESSAGE,
  getPatientSearchResultViewState,
  getStaffAuthGateViewState
} from './ClientLayout';
import type { Patient } from '@/db/types';
import {
  SESSION_LOCK_TIMEOUT_MS,
  SESSION_ACTIVITY_EVENTS
} from '@/hooks/useSessionLock';

describe('ClientLayout and session lock contracts', () => {
  it('defines valid staff load timeout and pre-login tour storage key', () => {
    assert.equal(STAFF_LOAD_TIMEOUT_MS, 8000);
    assert.equal(PRE_LOGIN_TOUR_STORAGE_KEY, 'yakureki:pre-login-tour:v1');
  });

  it('defines 15-minute inactivity session lock timeout and standard activity events', () => {
    assert.equal(SESSION_LOCK_TIMEOUT_MS, 15 * 60 * 1000);
    assert.ok(SESSION_ACTIVITY_EVENTS.includes('pointerdown'));
    assert.ok(SESSION_ACTIVITY_EVENTS.includes('keydown'));
    assert.ok(SESSION_ACTIVITY_EVENTS.includes('touchstart'));
    assert.ok(SESSION_ACTIVITY_EVENTS.includes('focus'));
  });
});

describe('getPatientSearchResultViewState', () => {
  const dummyPatients: Patient[] = [
    {
      patientId: 'p1',
      name: '佐藤 花子',
      kana: 'サトウ ハナコ',
      birthDate: '1980-05-12',
      gender: 'female'
    }
  ];

  it('returns error view state when hasSearchError is true with empty patients', () => {
    const state = getPatientSearchResultViewState([], true);
    assert.deepEqual(state, {
      status: 'error',
      message: '患者の検索に失敗しました'
    });
  });

  it('prioritizes error view state when hasSearchError is true even if patients are present', () => {
    const state = getPatientSearchResultViewState(dummyPatients, true);
    assert.deepEqual(state, {
      status: 'error',
      message: '患者の検索に失敗しました'
    });
  });

  it('returns empty view state when hasSearchError is false and patients array is empty', () => {
    const state = getPatientSearchResultViewState([], false);
    assert.deepEqual(state, {
      status: 'empty',
      message: '一致する患者がいません'
    });
  });

  it('returns results view state when hasSearchError is false and patients array is non-empty', () => {
    const state = getPatientSearchResultViewState(dummyPatients, false);
    assert.equal(state.status, 'results');
    if (state.status === 'results') {
      assert.equal(state.patients.length, 1);
      assert.equal(state.patients[0].name, '佐藤 花子');
    }
  });
});

describe('getStaffAuthGateViewState', () => {
  it('prioritizes terminal revocation over all other states', () => {
    const state = getStaffAuthGateViewState({
      isTerminalRevoked: true,
      staffLoadError: '何らかのエラー',
      hasLoadedUsers: false,
      usersCount: 0
    });
    assert.deepEqual(state, {
      isRevoked: true,
      hasError: false,
      errorMessage: '',
      isLoading: false
    });
  });

  it('prioritizes explicit staffLoadError when terminal is not revoked', () => {
    const state = getStaffAuthGateViewState({
      isTerminalRevoked: false,
      staffLoadError: 'データベース接続エラー',
      hasLoadedUsers: true,
      usersCount: 0
    });
    assert.deepEqual(state, {
      isRevoked: false,
      hasError: true,
      errorMessage: 'データベース接続エラー',
      isLoading: false
    });
  });

  it('returns loading state when hasLoadedUsers is false and no error exists', () => {
    const state = getStaffAuthGateViewState({
      isTerminalRevoked: false,
      staffLoadError: '',
      hasLoadedUsers: false,
      usersCount: 0
    });
    assert.deepEqual(state, {
      isRevoked: false,
      hasError: false,
      errorMessage: '',
      isLoading: true
    });
  });

  it('returns error status with reload guidance when usersCount is 0 after loading completed', () => {
    const state = getStaffAuthGateViewState({
      isTerminalRevoked: false,
      staffLoadError: '',
      hasLoadedUsers: true,
      usersCount: 0
    });
    assert.deepEqual(state, {
      isRevoked: false,
      hasError: true,
      errorMessage: STAFF_NO_USERS_ERROR_MESSAGE,
      isLoading: false
    });
    assert.ok(state.errorMessage.includes('再読み込み'));
    assert.ok(state.errorMessage.includes('管理者に連絡'));
  });

  it('returns ready status when loading succeeded and usersCount is greater than 0', () => {
    const state = getStaffAuthGateViewState({
      isTerminalRevoked: false,
      staffLoadError: '',
      hasLoadedUsers: true,
      usersCount: 2
    });
    assert.deepEqual(state, {
      isRevoked: false,
      hasError: false,
      errorMessage: '',
      isLoading: false
    });
  });
});

