import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmergencyRecoveryKeySheetPrint } from './components/EmergencyRecoveryKeySheetPrint';
import type { DbKeyEscrowPayload } from '@/lib/db_key_escrow';
import { findOpeningTag } from '@/lib/test_support/html_disabled_tags';

type EmergencyRecoveryKeySheetPrintProps = React.ComponentProps<typeof EmergencyRecoveryKeySheetPrint>;

const SAMPLE_ESCROW: DbKeyEscrowPayload = {
  version: 1,
  algorithm: 'PBKDF2-AES-GCM-256',
  saltHex: '0123456789abcdef0123456789abcdef',
  ivHex: 'abcdef0123456789abcdef01',
  ciphertextHex: '0123456789abcdef0123456789abcdef0123456789abcdef',
  checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  createdAt: '2026-10-06T10:00:00.000Z',
  issuerRole: 'admin',
  keyFingerprint: 'FP-9A8B7C6D'
};

function createMockEmergencyRecoveryKeySheetPrintProps(
  overrides: Partial<EmergencyRecoveryKeySheetPrintProps> = {}
): EmergencyRecoveryKeySheetPrintProps {
  return {
    escrow: null,
    facilityName: 'みらい調剤薬局 本店',
    facilityAddress: '東京都千代田区1-1-1',
    facilityPhone: '03-1234-5678',
    renderIdentityMark: () => null,
    isGenerating: false,
    errorMessage: null,
    isDemoOrSample: false,
    ...overrides
  };
}

function renderWithAdminPasswordInput(
  props: EmergencyRecoveryKeySheetPrintProps,
  passwordOverride: string = 'admin-password-123'
): string {
  let callCount = 0;
  function Wrapper(): React.ReactNode {
    const internals = (React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
        H?: { useState?: (init: unknown) => [unknown, (v: unknown) => void] }
      }
    }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

    if (internals?.H?.useState) {
      const origUseState = internals.H.useState;
      internals.H.useState = (initialState: unknown) => {
        const currentIndex = callCount++;
        if (currentIndex === 0) {
          assert.equal(
            initialState,
            '',
            `Expected EmergencyRecoveryKeySheetPrint useState call #0 initial value to be '', got ${String(initialState)}`
          );
          return [passwordOverride, () => {}];
        }
        return origUseState(initialState);
      };
    }
    return React.createElement(EmergencyRecoveryKeySheetPrint, props);
  }

  const html = renderToStaticMarkup(React.createElement(Wrapper));
  assert.equal(
    callCount,
    2,
    `Expected EmergencyRecoveryKeySheetPrint to call useState exactly 2 times, got ${callCount}`
  );
  return html;
}

describe('EmergencyRecoveryKeySheetPrint contracts', () => {
  it('renders unissued warning when escrow is null', () => {
    const html = renderToStaticMarkup(
      React.createElement(EmergencyRecoveryKeySheetPrint, {
        escrow: null,
        facilityName: 'みらい調剤薬局 本店',
        facilityAddress: '東京都千代田区1-1-1',
        facilityPhone: '03-1234-5678',
        renderIdentityMark: () => null
      })
    );

    // 1. ルート要素と未発行警告ブロック
    assert.ok(html.includes('data-testid="emergency-recovery-key-sheet-doc"'), 'エスクローシート要素が存在すること');
    assert.ok(html.includes('escrow-unissued-warning'), '未発行警告クラスが存在すること');
    assert.ok(html.includes('【未発行・認証前】緊急復旧用 暗号鍵エスクローシート'), '未発行タイトルが表示されること');
    assert.ok(html.includes('未認証状態での印刷・金庫保管厳禁'), '印刷・保管厳禁バッジが表示されること');
  });

  it('renders issued sheet with fingerprint, base64 payload, and pharmacy info', () => {
    const html = renderToStaticMarkup(
      React.createElement(EmergencyRecoveryKeySheetPrint, {
        escrow: SAMPLE_ESCROW,
        facilityName: 'みらい調剤薬局 本店',
        facilityAddress: '東京都千代田区1-1-1',
        facilityPhone: '03-1234-5678',
        renderIdentityMark: () => null,
        isDemoOrSample: false
      })
    );

    // 1. ルート要素とヘッダー
    assert.ok(html.includes('data-testid="emergency-recovery-key-sheet-doc"'), 'エスクローシート要素が存在すること');
    assert.ok(html.includes('極秘 / 管理者施錠保管'), '施錠保管バッジが表示されること');
    assert.ok(html.includes('FP-9A8B7C6D'), '鍵識別子Fingerprintが表示されること');

    // 2. メタブロック（発行薬局、暗号化方式、管理者PW必須）
    assert.ok(html.includes('みらい調剤薬局 本店'), '発行薬局名が表示されること');
    assert.ok(html.includes('東京都千代田区1-1-1'), '所在地が表示されること');
    assert.ok(html.includes('PBKDF2-AES-GCM-256'), '暗号化アルゴリズムが表示されること');
    assert.ok(html.includes('管理者パスワード必須'), '復号権限が表示されること');

    // 3. ペイロードとチェックサム
    assert.ok(html.includes('エスクロー暗号化ペイロード (Base64)'), 'ペイロード見出しが表示されること');
    assert.ok(html.includes('SHA-256: e3b0c44298fc1c14...'), 'チェックサムプレビューが表示されること');
    assert.ok(html.includes('payload-box'), 'ペイロード表示ボックスが存在すること');
  });

  it('pins password input and generate button disabled states when password is empty', () => {
    // Case 1: Idle state (isGenerating: false) - password input enabled, button disabled because password is empty
    const htmlIdle = renderToStaticMarkup(
      React.createElement(
        EmergencyRecoveryKeySheetPrint,
        createMockEmergencyRecoveryKeySheetPrintProps({ isGenerating: false })
      )
    );
    const inputTagIdle = findOpeningTag(htmlIdle, 'escrow-password-input', 'input');
    assert.ok(!inputTagIdle.includes('disabled'), `Password input must not be disabled when isGenerating is false: ${inputTagIdle}`);

    const btnTagIdle = findOpeningTag(htmlIdle, 'btn-generate-escrow', 'button');
    assert.ok(btnTagIdle.includes('disabled=""'), `Generate button must be disabled when admin password is empty: ${btnTagIdle}`);
    assert.ok(htmlIdle.includes('エスクローを発行して印字プレビュー生成'), 'Button label must indicate initial issue');

    // Case 2: In-flight state (isGenerating: true) - password input disabled, button disabled
    const htmlGenerating = renderToStaticMarkup(
      React.createElement(
        EmergencyRecoveryKeySheetPrint,
        createMockEmergencyRecoveryKeySheetPrintProps({ isGenerating: true })
      )
    );
    const inputTagGenerating = findOpeningTag(htmlGenerating, 'escrow-password-input', 'input');
    assert.ok(inputTagGenerating.includes('disabled=""'), `Password input must be disabled when isGenerating is true: ${inputTagGenerating}`);

    const btnTagGenerating = findOpeningTag(htmlGenerating, 'btn-generate-escrow', 'button');
    assert.ok(btnTagGenerating.includes('disabled=""'), `Generate button must be disabled when isGenerating is true: ${btnTagGenerating}`);
  });

  it('pins generate button as enabled when password is entered and disabled when generating', () => {
    // Case 1: Password entered and idle (isGenerating: false) - both input and button must be enabled
    const htmlIdleWithPassword = renderWithAdminPasswordInput(
      createMockEmergencyRecoveryKeySheetPrintProps({ isGenerating: false }),
      'AdminSecretPass123'
    );
    const inputTagIdle = findOpeningTag(htmlIdleWithPassword, 'escrow-password-input', 'input');
    assert.ok(!inputTagIdle.includes('disabled'), `Password input must be enabled when isGenerating is false: ${inputTagIdle}`);

    const btnTagIdle = findOpeningTag(htmlIdleWithPassword, 'btn-generate-escrow', 'button');
    assert.ok(!btnTagIdle.includes('disabled'), `Generate button must be enabled when password is entered and not generating: ${btnTagIdle}`);

    // Case 2: Password entered but generating in-flight (isGenerating: true) - both input and button must be disabled
    const htmlGeneratingWithPassword = renderWithAdminPasswordInput(
      createMockEmergencyRecoveryKeySheetPrintProps({ isGenerating: true }),
      'AdminSecretPass123'
    );
    const inputTagGenerating = findOpeningTag(htmlGeneratingWithPassword, 'escrow-password-input', 'input');
    assert.ok(inputTagGenerating.includes('disabled=""'), `Password input must be disabled when isGenerating is true: ${inputTagGenerating}`);

    const btnTagGenerating = findOpeningTag(htmlGeneratingWithPassword, 'btn-generate-escrow', 'button');
    assert.ok(btnTagGenerating.includes('disabled=""'), `Generate button must be disabled when isGenerating is true even if password is entered: ${btnTagGenerating}`);
  });

  it('pins reissue button label and disabled behavior when escrow is already issued', () => {
    // Case 1: Issued sheet, password empty (isGenerating: false) - button disabled with reissue label
    const htmlIssuedEmpty = renderToStaticMarkup(
      React.createElement(
        EmergencyRecoveryKeySheetPrint,
        createMockEmergencyRecoveryKeySheetPrintProps({ escrow: SAMPLE_ESCROW, isGenerating: false })
      )
    );
    const btnTagIssuedEmpty = findOpeningTag(htmlIssuedEmpty, 'btn-generate-escrow', 'button');
    assert.ok(btnTagIssuedEmpty.includes('disabled=""'), `Reissue button must be disabled when password is empty: ${btnTagIssuedEmpty}`);
    assert.ok(htmlIssuedEmpty.includes('新しいパスワードで再発行'), 'Button label must indicate reissue when escrow is present');

    // Case 2: Issued sheet, password entered (isGenerating: false) - button enabled with reissue label
    const htmlIssuedFilled = renderWithAdminPasswordInput(
      createMockEmergencyRecoveryKeySheetPrintProps({ escrow: SAMPLE_ESCROW, isGenerating: false }),
      'NewAdminSecretPass456'
    );
    const btnTagIssuedFilled = findOpeningTag(htmlIssuedFilled, 'btn-generate-escrow', 'button');
    assert.ok(!btnTagIssuedFilled.includes('disabled'), `Reissue button must be enabled when password is provided: ${btnTagIssuedFilled}`);
    assert.ok(htmlIssuedFilled.includes('新しいパスワードで再発行'), 'Button label must indicate reissue when escrow is present');
  });
});
