import { test } from 'node:test';
import assert from 'node:assert';
import {
  createDbKeyEscrow,
  restoreDbKeyFromEscrow,
  computeKeyFingerprint,
  formatEscrowKeySheetText,
  parseEscrowKeySheetText,
  saveRestoredDbPassword,
  LOCAL_DB_PASSWORD_KEY,
  LOCAL_DB_PASSWORD_SAVE_FAILED_REASON
} from './db_key_escrow.ts';

test('createDbKeyEscrow & restoreDbKeyFromEscrow performs successful encryption and decryption roundtrip', async () => {
  const originalDbKey = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
  const adminPassword = 'AdminSecurePassword2026!';

  const escrow = await createDbKeyEscrow(originalDbKey, adminPassword);

  assert.strictEqual(escrow.version, 1);
  assert.strictEqual(escrow.algorithm, 'PBKDF2-AES-GCM-256');
  assert.strictEqual(escrow.issuerRole, 'admin');
  assert.ok(escrow.saltHex.length === 32); // 16 bytes hex
  assert.ok(escrow.ivHex.length === 24);   // 12 bytes hex
  assert.ok(escrow.ciphertextHex.length > 0);
  assert.ok(escrow.checksumSha256.length === 64);
  assert.ok(escrow.keyFingerprint.length === 12);

  const result = await restoreDbKeyFromEscrow(escrow, adminPassword);
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.dbPassword, originalDbKey);
    assert.strictEqual(result.keyFingerprint, escrow.keyFingerprint);
  }
});

test('restoreDbKeyFromEscrow rejects incorrect admin password', async () => {
  const originalDbKey = 'test-random-generated-local-key-12345';
  const adminPassword = 'CorrectPassword999';
  const wrongPassword = 'WrongPassword000';

  const escrow = await createDbKeyEscrow(originalDbKey, adminPassword);

  const result = await restoreDbKeyFromEscrow(escrow, wrongPassword);
  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /管理者パスワードが正しくない/);
  }
});

test('restoreDbKeyFromEscrow detects tampered ciphertext and rejects restore', async () => {
  const originalDbKey = 'tamper-test-key-54321';
  const adminPassword = 'AdminPassword123!';

  const escrow = await createDbKeyEscrow(originalDbKey, adminPassword);

  // 暗号文の1文字を改ざん
  const tamperedHex = escrow.ciphertextHex.substring(0, escrow.ciphertextHex.length - 2) + '00';
  const tamperedEscrow = {
    ...escrow,
    ciphertextHex: tamperedHex
  };

  const result = await restoreDbKeyFromEscrow(tamperedEscrow, adminPassword);
  assert.strictEqual(result.ok, false);
});

test('restoreDbKeyFromEscrow detects corrupted checksum when ciphertext is altered', async () => {
  const originalDbKey = 'valid-key-abcde';
  const adminPassword = 'ValidPassword888!';

  const escrow = await createDbKeyEscrow(originalDbKey, adminPassword);

  // チェックサムを不正な値に改ざん
  const invalidChecksumEscrow = {
    ...escrow,
    checksumSha256: '0000000000000000000000000000000000000000000000000000000000000000'
  };

  const result = await restoreDbKeyFromEscrow(invalidChecksumEscrow, adminPassword);
  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /チェックサムが一致しません|復号に失敗/);
  }
});

test('formatEscrowKeySheetText and parseEscrowKeySheetText roundtrip correctly', async () => {
  const originalDbKey = 'emergency-recovery-key-999';
  const adminPassword = 'MasterPassword456!';

  const escrow = await createDbKeyEscrow(originalDbKey, adminPassword);
  const formattedText = formatEscrowKeySheetText(escrow, '青空薬局 導入確認店');

  assert.match(formattedText, /PHARMA-OSS 緊急復旧用 暗号鍵エスクローシート/);
  assert.match(formattedText, /青空薬局 導入確認店/);
  assert.match(formattedText, /鍵識別子/);

  const parsed = parseEscrowKeySheetText(formattedText);
  assert.ok(parsed !== null);
  assert.strictEqual(parsed?.ciphertextHex, escrow.ciphertextHex);
  assert.strictEqual(parsed?.checksumSha256, escrow.checksumSha256);
  assert.strictEqual(parsed?.keyFingerprint, escrow.keyFingerprint);

  const restoreResult = await restoreDbKeyFromEscrow(parsed, adminPassword);
  assert.strictEqual(restoreResult.ok, true);
  if (restoreResult.ok) {
    assert.strictEqual(restoreResult.dbPassword, originalDbKey);
  }
});

test('computeKeyFingerprint produces consistent 12-char fingerprint', async () => {
  const fp1 = await computeKeyFingerprint('sample-key-1');
  const fp2 = await computeKeyFingerprint('sample-key-1');
  const fp3 = await computeKeyFingerprint('sample-key-2');

  assert.strictEqual(fp1, fp2);
  assert.strictEqual(fp1.length, 12);
  assert.notStrictEqual(fp1, fp3);
});

function withMockWindow<T>(localStorage: unknown, run: () => T): T {
  const originalWindow = (global as any).window;
  try {
    (global as any).window = localStorage === undefined ? undefined : { localStorage };
    return run();
  } finally {
    (global as any).window = originalWindow;
  }
}

const RESTORED_OK = { ok: true as const, dbPassword: 'restored-db-key-123', keyFingerprint: 'abcdef123456' };

test('saveRestoredDbPassword stores the restored DB key in this browser and returns the success result unchanged', () => {
  const storage = new Map<string, string>();
  const result = withMockWindow(
    { setItem: (key: string, value: string) => storage.set(key, value) },
    () => saveRestoredDbPassword(RESTORED_OK)
  );

  assert.deepStrictEqual(result, RESTORED_OK);
  assert.strictEqual(storage.get(LOCAL_DB_PASSWORD_KEY), 'restored-db-key-123');
});

test('saveRestoredDbPassword does not report success when the browser storage write throws', () => {
  const storage = new Map<string, string>();
  const result = withMockWindow(
    { setItem: () => { throw new Error('QuotaExceededError'); } },
    () => saveRestoredDbPassword(RESTORED_OK)
  );

  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.strictEqual(result.reason, LOCAL_DB_PASSWORD_SAVE_FAILED_REASON);
    // 何が起きたか(復元はできたが保存できなかった)と、次にすること(もう一度お試し)が書かれている
    assert.match(result.reason, /復元できましたが.*保存できませんでした/);
    assert.match(result.reason, /もう一度/);
  }
  assert.strictEqual(storage.size, 0);
});

test('saveRestoredDbPassword does not report success when there is no browser storage at all', () => {
  const result = withMockWindow(undefined, () => saveRestoredDbPassword(RESTORED_OK));
  assert.strictEqual(result.ok, false);
});

test('saveRestoredDbPassword passes a failed restore through and never touches the storage', () => {
  let writes = 0;
  const failed = { ok: false as const, reason: '管理者パスワードが正しくありません。' };
  const result = withMockWindow(
    { setItem: () => { writes += 1; } },
    () => saveRestoredDbPassword(failed)
  );

  assert.deepStrictEqual(result, failed);
  assert.strictEqual(writes, 0);
});
