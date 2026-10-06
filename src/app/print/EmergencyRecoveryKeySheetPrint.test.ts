import { test } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmergencyRecoveryKeySheetPrint } from './components/EmergencyRecoveryKeySheetPrint';
import type { DbKeyEscrowPayload } from '@/lib/db_key_escrow';

test('EmergencyRecoveryKeySheetPrint renders unissued warning when escrow is null', () => {
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

test('EmergencyRecoveryKeySheetPrint renders issued sheet with fingerprint, base64 payload, and pharmacy info', () => {
  const mockEscrow: DbKeyEscrowPayload = {
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

  const html = renderToStaticMarkup(
    React.createElement(EmergencyRecoveryKeySheetPrint, {
      escrow: mockEscrow,
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
