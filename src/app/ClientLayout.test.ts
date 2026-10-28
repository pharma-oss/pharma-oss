import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAFF_LOAD_TIMEOUT_MS,
  STAFF_NO_USERS_ERROR_MESSAGE,
  getPatientSearchResultViewState,
  getStaffAuthGateViewState
} from './ClientLayout';
import type { Patient } from '@/db/types';
import {
  SESSION_LOCK_TIMEOUT_MS,
  SESSION_ACTIVITY_EVENTS
} from '@/hooks/useSessionLock';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import ClientLayout from './ClientLayout';
import { findOpeningTag } from '@/lib/test_support/html_disabled_tags';

const DISABLED_ATTRIBUTE_PATTERN = /\sdisabled=""(?=[\s/>]|$)/;

function renderClientLayoutWithSetupState(overrides: {
  isCreatingInitialAdmin?: boolean;
  isResumingGuestDemo?: boolean;
}): string {
  let callCount = 0;

  const mockRouter = {
    push: () => {},
    replace: () => {},
    refresh: () => {},
    back: () => {},
    forward: () => {},
    prefetch: () => {}
  };

  function Wrapper(): React.ReactNode {
    const internals = (React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
        H?: { useState?: (init: unknown) => [unknown, (v: unknown) => void] }
      }
    }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

    const dispatcher = internals?.H;
    if (dispatcher?.useState) {
      const origUseState = dispatcher.useState;
      dispatcher.useState = (initialState: unknown) => {
        const currentIndex = callCount++;
        if (currentIndex === 2) {
          return [[{ userId: 'initial_admin', name: '管理者', role: 'admin' }], () => {}];
        }
        if (currentIndex === 3) {
          return [true, () => {}];
        }
        if (currentIndex === 21 && overrides.isCreatingInitialAdmin !== undefined) {
          return [overrides.isCreatingInitialAdmin, () => {}];
        }
        if (currentIndex === 22) {
          dispatcher.useState = origUseState;
          if (overrides.isResumingGuestDemo !== undefined) {
            return [overrides.isResumingGuestDemo, () => {}];
          }
        }
        return origUseState(initialState);
      };
    }

    return React.createElement(
      AppRouterContext.Provider,
      { value: mockRouter as never },
      React.createElement(ClientLayout, null, 'child-content')
    );
  }

  return renderToStaticMarkup(React.createElement(Wrapper));
}

describe('ClientLayout and session lock contracts', () => {
  it('defines valid staff load timeout', () => {
    assert.equal(STAFF_LOAD_TIMEOUT_MS, 8000);
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

describe('ClientLayout initial admin setup disabled states contracts', () => {
  it('pins initial admin setup form buttons as disabled when isCreatingInitialAdmin is true', () => {
    const html = renderClientLayoutWithSetupState({
      isCreatingInitialAdmin: true,
      isResumingGuestDemo: false
    });

    const passwordBtnTag = findOpeningTag(html, 'パスワードを設定して開始', 'button');
    assert.ok(
      DISABLED_ATTRIBUTE_PATTERN.test(passwordBtnTag),
      'Password submit button must be disabled when isCreatingInitialAdmin is true'
    );

    const passkeyBtnTag = findOpeningTag(html, 'btn-passkey-setup', 'button');
    assert.ok(
      DISABLED_ATTRIBUTE_PATTERN.test(passkeyBtnTag),
      'Passkey register button must be disabled when isCreatingInitialAdmin is true'
    );

    const demoBtnTag = findOpeningTag(html, 'data-testid="guest-demo-start"', 'button');
    assert.ok(
      DISABLED_ATTRIBUTE_PATTERN.test(demoBtnTag),
      'Guest demo button must be disabled when isCreatingInitialAdmin is true'
    );
  });

  it('pins initial admin setup form buttons as enabled when idle', () => {
    const html = renderClientLayoutWithSetupState({
      isCreatingInitialAdmin: false,
      isResumingGuestDemo: false
    });

    const passwordBtnTag = findOpeningTag(html, 'パスワードを設定して開始', 'button');
    assert.ok(
      !DISABLED_ATTRIBUTE_PATTERN.test(passwordBtnTag),
      'Password submit button must be enabled when idle'
    );

    const passkeyBtnTag = findOpeningTag(html, 'btn-passkey-setup', 'button');
    assert.ok(
      !DISABLED_ATTRIBUTE_PATTERN.test(passkeyBtnTag),
      'Passkey register button must be enabled when idle'
    );

    const demoBtnTag = findOpeningTag(html, 'data-testid="guest-demo-start"', 'button');
    assert.ok(
      !DISABLED_ATTRIBUTE_PATTERN.test(demoBtnTag),
      'Guest demo button must be enabled when idle'
    );
  });

  it('pins guest demo button as disabled when isResumingGuestDemo is true even if not creating admin', () => {
    const html = renderClientLayoutWithSetupState({
      isCreatingInitialAdmin: false,
      isResumingGuestDemo: true
    });

    const passwordBtnTag = findOpeningTag(html, 'パスワードを設定して開始', 'button');
    assert.ok(
      !DISABLED_ATTRIBUTE_PATTERN.test(passwordBtnTag),
      'Password submit button must remain enabled when only resuming guest demo'
    );

    const passkeyBtnTag = findOpeningTag(html, 'btn-passkey-setup', 'button');
    assert.ok(
      !DISABLED_ATTRIBUTE_PATTERN.test(passkeyBtnTag),
      'Passkey register button must remain enabled when only resuming guest demo'
    );

    const demoBtnTag = findOpeningTag(html, 'data-testid="guest-demo-start"', 'button');
    assert.ok(
      DISABLED_ATTRIBUTE_PATTERN.test(demoBtnTag),
      'Guest demo button must be disabled when isResumingGuestDemo is true'
    );
  });
});

