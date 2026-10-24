import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  saveOfflineAuthCache,
  getOfflineAuthCache,
  verifyOfflinePassword,
  recordSatelliteRevocationTombstone,
  isSatelliteRevokedTombstone,
  resetSatelliteRevocationTombstoneForTest,
  purgeSatelliteAllCaches,
  computeStandbyHubHmac,
  verifyStandbyHubHmac,
  resolveOfflineAuthStaffLoadOutcome,
  saveStandbyHubAllowlist,
  getStandbyHubAllowlist,
  resolveStandbyEndpointRegistrationOutcome,
  resolveOfflineAuthSaveWarningOutcome,
  resolveStandbyAllowlistViewState,
  OFFLINE_AUTH_CACHE_KEY,
  REVOCATION_TOMBSTONE_KEY,
  STANDBY_HUB_ALLOWLIST_KEY,
  type StandbyHubEntry,
  type StandbyHubAllowlistResult
} from './satellite_offline_auth';
import { hashPassword } from '../auth';
import type { User } from '@/db/types';
import { isAllowedHubEndpoint } from './sync_config';

function setupMockLocalStorage() {
  resetSatelliteRevocationTombstoneForTest();
  const store: Record<string, string> = {};
  (globalThis as any).window = {
    localStorage: {
      getItem(key: string) {
        return store[key] ?? null;
      },
      setItem(key: string, value: string) {
        store[key] = String(value);
      },
      removeItem(key: string) {
        delete store[key];
      },
      clear() {
        Object.keys(store).forEach((k) => delete store[k]);
      }
    },
    sessionStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    }
  };
  return store;
}

test('1. Staff info cache and PBKDF2 password verification (success and mismatch)', async () => {
  const store = setupMockLocalStorage();
  const salt = 'mock_salt_123';
  const password = 'CorrectPassword123!';
  const passwordHash = await hashPassword(password, salt);

  const adminUser: User = {
    userId: 'admin_1',
    name: '導入管理者',
    role: 'admin',
    salt,
    passwordHash
  };

  saveOfflineAuthCache([adminUser], 'test_enc_key_1');

  const cacheResult = getOfflineAuthCache('test_enc_key_1');
  assert.strictEqual(cacheResult.ok, true);
  if (cacheResult.ok) {
    assert.strictEqual(cacheResult.users.length, 1);
    assert.strictEqual(cacheResult.users[0].userId, 'admin_1');
    assert.strictEqual(cacheResult.users[0].name, '導入管理者');

    const valid = await verifyOfflinePassword('CorrectPassword123!', cacheResult.users[0]);
    assert.strictEqual(valid, true);

    const invalid = await verifyOfflinePassword('WrongPassword999', cacheResult.users[0]);
    assert.strictEqual(invalid, false);
  }
});

test('2. 24-hour TTL: Success within 24h, blocked after 24h (25h later)', async () => {
  const store = setupMockLocalStorage();
  const salt = 'salt_ttl';
  const passwordHash = await hashPassword('pass123', salt);
  const user: User = { userId: 'u1', name: '薬剤師A', role: 'pharmacist', salt, passwordHash };

  const cachedAt = new Date('2026-08-20T08:00:00.000Z');
  saveOfflineAuthCache([user], 'test_key', cachedAt);

  // 10 hours later -> within 24h
  const now10h = new Date('2026-08-20T18:00:00.000Z');
  const res10h = getOfflineAuthCache('test_key', now10h);
  assert.strictEqual(res10h.ok, true);

  // 25 hours later -> expired
  const now25h = new Date('2026-08-21T09:00:00.000Z');
  const res25h = getOfflineAuthCache('test_key', now25h);
  assert.strictEqual(res25h.ok, false);
  if (!res25h.ok) {
    assert.strictEqual(res25h.reason, 'expired');
  }
});

test('3. Plaintext password and Hub token are NEVER saved in offline cache', async () => {
  const store = setupMockLocalStorage();
  const salt = 'salt_clean';
  const password = 'SuperSecretPlainPassword123';
  const passwordHash = await hashPassword(password, salt);

  const user: User = {
    userId: 'u_audit',
    name: '事務員B',
    role: 'clerk',
    salt,
    passwordHash
  };

  saveOfflineAuthCache([user], 'test_enc_key');
  const rawStored = store[OFFLINE_AUTH_CACHE_KEY];
  assert.ok(rawStored, 'Raw stored string must exist in localStorage');

  // Ensure plain password is not anywhere in raw stored string
  assert.strictEqual(rawStored.includes(password), false);
  assert.strictEqual(rawStored.includes('PHARMACY_SYNC_TERMINAL_TOKEN'), false);
});

test('4. Terminal revocation triggers purgeSatelliteAllCaches and records revocation tombstone', () => {
  const store = setupMockLocalStorage();
  store[OFFLINE_AUTH_CACHE_KEY] = 'some_auth_data';
  store['yakureki_satellite_unsent_queue_v1'] = 'some_queue_data';
  store['yakureki_satellite_persistent_queue_enc_key'] = 'some_enc_key';
  store[STANDBY_HUB_ALLOWLIST_KEY] = 'some_allowlist';

  assert.strictEqual(isSatelliteRevokedTombstone(), false);

  purgeSatelliteAllCaches();

  assert.strictEqual(isSatelliteRevokedTombstone(), true);
  assert.strictEqual(store[OFFLINE_AUTH_CACHE_KEY], undefined);
  assert.strictEqual(store['yakureki_satellite_unsent_queue_v1'], undefined);
  assert.strictEqual(store['yakureki_satellite_persistent_queue_enc_key'], undefined);
  assert.strictEqual(store[STANDBY_HUB_ALLOWLIST_KEY], undefined);
});

test('5. Revoked terminal CANNOT break into offline login even after LAN cable is unplugged (offline)', async () => {
  const store = setupMockLocalStorage();
  const salt = 'salt_tomb';
  const passwordHash = await hashPassword('pass123', salt);
  const user: User = { userId: 'u_tomb', name: '管理者', role: 'admin', salt, passwordHash };

  saveOfflineAuthCache([user], 'test_key');
  // Simulate revocation occurred
  recordSatelliteRevocationTombstone();

  // Attempting offline auth cache retrieval must be rejected with 'revoked'
  const result = getOfflineAuthCache('test_key');
  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.strictEqual(result.reason, 'revoked');
  }
});

test('6. HMAC verification: Valid signed standby endpoint passes, tampered/DevTools entry rejected', async () => {
  const terminalToken = 'secret_terminal_token_777';
  const endpoint = 'https://standby-hub.local:3000';
  const issuedAt = '2026-08-24T00:00:00.000Z';

  // 1. Valid HMAC generated by Hub
  const signature = computeStandbyHubHmac(endpoint, issuedAt, terminalToken);
  const validEntry: StandbyHubEntry = { endpoint, issuedAt, signature };
  assert.strictEqual(verifyStandbyHubHmac(validEntry, terminalToken), true);

  // 2. Tampered entry (attacker changed endpoint via DevTools)
  const tamperedEntry: StandbyHubEntry = {
    endpoint: 'https://attacker-hub.example.com',
    issuedAt,
    signature
  };
  assert.strictEqual(verifyStandbyHubHmac(tamperedEntry, terminalToken), false);

  // 3. Forged signature (attacker guessed key or omitted signature)
  const forgedEntry: StandbyHubEntry = {
    endpoint: 'https://standby-hub.local:3000',
    issuedAt,
    signature: 'bad_signature_12345'
  };
  assert.strictEqual(verifyStandbyHubHmac(forgedEntry, terminalToken), false);
});

test('8. isAllowedHubEndpoint rejects plaintext HTTP for private LAN when transportEncryption is none', () => {
  // 1. Loopback localhost is always allowed even with HTTP
  assert.strictEqual(isAllowedHubEndpoint('http://localhost:3000', 'none'), true);
  assert.strictEqual(isAllowedHubEndpoint('http://127.0.0.1:3401', 'none'), true);

  // 2. HTTPS to private LAN is allowed
  assert.strictEqual(isAllowedHubEndpoint('https://192.168.1.50:3000', 'none'), true);
  assert.strictEqual(isAllowedHubEndpoint('https://standby-hub.local:3000', 'none'), true);

  // 3. Plaintext HTTP to private LAN without aes-gcm encryption is REJECTED
  assert.strictEqual(isAllowedHubEndpoint('http://192.168.1.50:3000', 'none'), false);
  assert.strictEqual(isAllowedHubEndpoint('http://standby.local:3000', 'none'), false);

  // 4. Plaintext HTTP to private LAN with aes-gcm encryption is ALLOWED
  assert.strictEqual(isAllowedHubEndpoint('http://192.168.1.50:3000', 'aes-gcm'), true);
});

test('9. resolveOfflineAuthStaffLoadOutcome correctly handles ok, corrupted, expired, and empty states', () => {
  const mockUser: User = {
    userId: 'u_1',
    name: 'テストスタッフ',
    role: 'pharmacist'
  };

  // 1. ok state
  const okOutcome = resolveOfflineAuthStaffLoadOutcome({
    ok: true,
    users: [mockUser],
    cachedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  });
  assert.strictEqual(okOutcome.users.length, 1);
  assert.strictEqual(okOutcome.isOffline, true);
  assert.strictEqual(okOutcome.errorMessage, null);

  // 2. corrupted state
  const corruptedOutcome = resolveOfflineAuthStaffLoadOutcome({
    ok: false,
    reason: 'corrupted'
  });
  assert.strictEqual(corruptedOutcome.users.length, 0);
  assert.strictEqual(corruptedOutcome.isOffline, false);
  assert.ok(corruptedOutcome.errorMessage?.includes('破損しています'));
  assert.ok(corruptedOutcome.errorMessage?.includes('再同期'));

  // 3. expired state
  const expiredOutcome = resolveOfflineAuthStaffLoadOutcome({
    ok: false,
    reason: 'expired'
  });
  assert.strictEqual(expiredOutcome.users.length, 0);
  assert.strictEqual(expiredOutcome.isOffline, false);
  assert.ok(expiredOutcome.errorMessage?.includes('有効期限が切れています'));
  assert.ok(expiredOutcome.errorMessage?.includes('更新'));

  // 4. empty state
  const emptyOutcome = resolveOfflineAuthStaffLoadOutcome({
    ok: false,
    reason: 'empty'
  });
  assert.strictEqual(emptyOutcome.users.length, 0);
  assert.strictEqual(emptyOutcome.isOffline, false);
  assert.strictEqual(emptyOutcome.errorMessage, null);

  // 5. revoked state
  const revokedOutcome = resolveOfflineAuthStaffLoadOutcome({
    ok: false,
    reason: 'revoked'
  });
  assert.strictEqual(revokedOutcome.users.length, 0);
  assert.strictEqual(revokedOutcome.isOffline, false);
  assert.strictEqual(revokedOutcome.errorMessage, null);
});

test('10. Revocation tombstone is preserved in memory even if localStorage.setItem throws (SW-C-30)', async () => {
  const store = setupMockLocalStorage();
  const salt = 'salt_tomb_err';
  const passwordHash = await hashPassword('pass123', salt);
  const user: User = { userId: 'u_tomb_err', name: '管理者', role: 'admin', salt, passwordHash };

  // First save cache successfully
  saveOfflineAuthCache([user], 'test_key');
  assert.strictEqual(isSatelliteRevokedTombstone(), false);

  // Now make localStorage.setItem throw QuotaExceededError or security exception
  (globalThis as any).window.localStorage.setItem = () => {
    throw new Error('QuotaExceededError: storage is full');
  };

  // Revoke terminal (calls purgeSatelliteAllCaches which calls recordSatelliteRevocationTombstone)
  purgeSatelliteAllCaches();

  // Tombstone must still be recognized as revoked via in-memory flag
  assert.strictEqual(isSatelliteRevokedTombstone(), true);

  // Attempting offline auth cache retrieval must be rejected with 'revoked'
  const result = getOfflineAuthCache('test_key');
  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.strictEqual(result.reason, 'revoked');
  }

  // Cleanup for other tests
  resetSatelliteRevocationTombstoneForTest();
});

test('11. Purge records the revocation tombstone even if removing a cache entry throws', () => {
  const store = setupMockLocalStorage();
  store[OFFLINE_AUTH_CACHE_KEY] = 'some_auth_data';
  (globalThis as any).window.localStorage.removeItem = () => {
    throw new Error('SecurityError: storage access denied');
  };

  purgeSatelliteAllCaches();

  // 失効の記録は、消去の失敗より前に残る(メモリにも localStorage にも)
  assert.strictEqual(isSatelliteRevokedTombstone(), true);
  assert.strictEqual(store[REVOCATION_TOMBSTONE_KEY], 'true');
  const result = getOfflineAuthCache('test_key');
  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.strictEqual(result.reason, 'revoked');
  }

  resetSatelliteRevocationTombstoneForTest();
});

test('12. Purge keeps removing the other cache entries when one removal throws', () => {
  const store = setupMockLocalStorage();
  store[OFFLINE_AUTH_CACHE_KEY] = 'some_auth_data';
  store['yakureki_satellite_unsent_queue_v1'] = 'some_queue_data';
  store['yakureki_satellite_persistent_queue_enc_key'] = 'some_enc_key';
  store[STANDBY_HUB_ALLOWLIST_KEY] = 'some_allowlist';
  const win = (globalThis as any).window;
  const originalRemove = win.localStorage.removeItem;
  win.localStorage.removeItem = (key: string) => {
    if (key === OFFLINE_AUTH_CACHE_KEY) throw new Error('SecurityError: cannot remove the auth cache');
    originalRemove(key);
  };
  const removedFromSession: string[] = [];
  win.sessionStorage.removeItem = (key: string) => { removedFromSession.push(key); };

  purgeSatelliteAllCaches();

  // 失敗した1件だけが残り、他の4件(localStorage 3件と sessionStorage 1件)は消える
  assert.strictEqual(store[OFFLINE_AUTH_CACHE_KEY], 'some_auth_data');
  assert.strictEqual(store['yakureki_satellite_unsent_queue_v1'], undefined);
  assert.strictEqual(store['yakureki_satellite_persistent_queue_enc_key'], undefined);
  assert.strictEqual(store[STANDBY_HUB_ALLOWLIST_KEY], undefined);
  assert.deepStrictEqual(removedFromSession, ['pharmacy_os_current_user']);
  assert.strictEqual(isSatelliteRevokedTombstone(), true);

  // sessionStorage の消去が失敗しても、localStorage の消去と墓石は行われる
  const store2 = setupMockLocalStorage();
  store2[OFFLINE_AUTH_CACHE_KEY] = 'some_auth_data';
  (globalThis as any).window.sessionStorage.removeItem = () => {
    throw new Error('SecurityError: session storage denied');
  };

  purgeSatelliteAllCaches();

  assert.strictEqual(store2[OFFLINE_AUTH_CACHE_KEY], undefined);
  assert.strictEqual(isSatelliteRevokedTombstone(), true);

  resetSatelliteRevocationTombstoneForTest();
});

test('13. saveStandbyHubAllowlist returns true on success, false on exception, and preserves existing items on failure', () => {
  const store = setupMockLocalStorage();
  const initialEntries: StandbyHubEntry[] = [
    { endpoint: 'https://standby1.local:3000', issuedAt: '2026-10-21T00:00:00.000Z', signature: 'sig1' }
  ];

  // 成功時: true を返し、値が保存される
  const saveSuccess = saveStandbyHubAllowlist(initialEntries);
  assert.strictEqual(saveSuccess, true);
  assert.deepStrictEqual(getStandbyHubAllowlist(), { ok: true, entries: initialEntries });

  // 失敗時: setItem が例外を投げた場合、false を返し既存の値が変わらない
  (globalThis as any).window.localStorage.setItem = () => {
    throw new Error('QuotaExceededError: localStorage full');
  };
  const newEntries: StandbyHubEntry[] = [
    ...initialEntries,
    { endpoint: 'https://standby2.local:3000', issuedAt: '2026-10-21T01:00:00.000Z', signature: 'sig2' }
  ];
  const saveFailure = saveStandbyHubAllowlist(newEntries);
  assert.strictEqual(saveFailure, false);
  assert.deepStrictEqual(getStandbyHubAllowlist(), { ok: true, entries: initialEntries });

  // window が無いときは false
  delete (globalThis as any).window;
  const noWindowResult = saveStandbyHubAllowlist(newEntries);
  assert.strictEqual(noWindowResult, false);
});

test('14. resolveStandbyEndpointRegistrationOutcome handles success and failure pure logic', () => {
  // 失敗時: ok=false、所定のエラーメッセージを返す
  const failure = resolveStandbyEndpointRegistrationOutcome(false);
  assert.strictEqual(failure.ok, false);
  assert.strictEqual(
    failure.errorMessage,
    '予備機エンドポイントを保存できませんでした。ブラウザの保存領域の空き容量やプライベートブラウズの設定を確認して、もう一度お試しください。'
  );

  // 成功時: ok=true、errorMessage は null
  const success = resolveStandbyEndpointRegistrationOutcome(true);
  assert.strictEqual(success.ok, true);
  assert.strictEqual(success.errorMessage, null);
});

test('15. saveOfflineAuthCache returns saved on success, failed on exception, and noop when revoked or zero valid users', async () => {
  const store = setupMockLocalStorage();
  const salt = 'salt_offline_15';
  const passwordHash = await hashPassword('Pass1234!', salt);
  const user: User = { userId: 'admin_15', name: '管理者15', role: 'admin', salt, passwordHash };

  // 1. 成功時: 'saved' を返し、キャッシュが保存される
  const saveResult = saveOfflineAuthCache([user], 'test_key_15');
  assert.strictEqual(saveResult, 'saved');
  const cacheResult = getOfflineAuthCache('test_key_15');
  assert.strictEqual(cacheResult.ok, true);

  // 2. setItem が例外のとき: 'failed' を返す
  (globalThis as any).window.localStorage.setItem = () => {
    throw new Error('QuotaExceededError: storage full');
  };
  const failResult = saveOfflineAuthCache([user], 'test_key_15');
  assert.strictEqual(failResult, 'failed');

  // 3. 失効済み端末: 'noop' を返す
  setupMockLocalStorage();
  recordSatelliteRevocationTombstone();
  const revokedResult = saveOfflineAuthCache([user], 'test_key_15');
  assert.strictEqual(revokedResult, 'noop');
  resetSatelliteRevocationTombstoneForTest();

  // 4. 保存対象 0 人: 'noop' を返す
  setupMockLocalStorage();
  const noCredUser: User = { userId: 'user_nocred', name: '認証なし', role: 'pharmacist' };
  const zeroResult = saveOfflineAuthCache([noCredUser], 'test_key_15');
  assert.strictEqual(zeroResult, 'noop');

  // 5. window が未定義のとき: 'noop' を返す
  delete (globalThis as any).window;
  const noWindowResult = saveOfflineAuthCache([user], 'test_key_15');
  assert.strictEqual(noWindowResult, 'noop');
});

test('16. resolveOfflineAuthSaveWarningOutcome notifies once on satellite failure and silences on hub, standalone, success, or repeated calls', () => {
  // 1. サテライト端末かつ保存失敗かつ未通知: 警告通知を出し、フラグを true に更新
  const warn = resolveOfflineAuthSaveWarningOutcome({
    saveResult: 'failed',
    role: 'satellite',
    alreadyWarned: false,
  });
  assert.strictEqual(warn.shouldWarn, true);
  assert.strictEqual(
    warn.warningMessage,
    'この端末のオフライン用スタッフ認証情報を保存できませんでした。メイン端末と通信できないとき、この端末ではログインできなくなります。ブラウザの保存領域の空き容量を確認して、再読み込みしてください。'
  );
  assert.strictEqual(warn.nextAlreadyWarned, true);

  // 2. 既に通知済みの場合: 二重通知しない
  const already = resolveOfflineAuthSaveWarningOutcome({
    saveResult: 'failed',
    role: 'satellite',
    alreadyWarned: true,
  });
  assert.strictEqual(already.shouldWarn, false);
  assert.strictEqual(already.warningMessage, null);
  assert.strictEqual(already.nextAlreadyWarned, true);

  // 3. ハブ端末またはスタンドアロン端末: 保存失敗でも通知しない（自機DBから読めるため）
  const hubResult = resolveOfflineAuthSaveWarningOutcome({
    saveResult: 'failed',
    role: 'hub',
    alreadyWarned: false,
  });
  assert.strictEqual(hubResult.shouldWarn, false);
  assert.strictEqual(hubResult.warningMessage, null);

  const standaloneResult = resolveOfflineAuthSaveWarningOutcome({
    saveResult: 'failed',
    role: 'standalone',
    alreadyWarned: false,
  });
  assert.strictEqual(standaloneResult.shouldWarn, false);
  assert.strictEqual(standaloneResult.warningMessage, null);

  // 4. 保存成功（saved）または何もしなかった（noop）: 通知しない
  const savedResult = resolveOfflineAuthSaveWarningOutcome({
    saveResult: 'saved',
    role: 'satellite',
    alreadyWarned: false,
  });
  assert.strictEqual(savedResult.shouldWarn, false);
  assert.strictEqual(savedResult.warningMessage, null);

  const noopResult = resolveOfflineAuthSaveWarningOutcome({
    saveResult: 'noop',
    role: 'satellite',
    alreadyWarned: false,
  });
  assert.strictEqual(noopResult.shouldWarn, false);
  assert.strictEqual(noopResult.warningMessage, null);
});

test('17. getStandbyHubAllowlist distinguishes valid, empty, unreadable, and corrupted states', () => {
  // 1. 値なし (null / 空文字): { ok: true, entries: [] }
  let store = setupMockLocalStorage();
  assert.deepStrictEqual(getStandbyHubAllowlist(), { ok: true, entries: [] });
  store[STANDBY_HUB_ALLOWLIST_KEY] = '   ';
  assert.deepStrictEqual(getStandbyHubAllowlist(), { ok: true, entries: [] });

  // 2. 有効な 1 件: { ok: true, entries: [...] }
  const validEntry: StandbyHubEntry = {
    endpoint: 'https://standby.local:3000',
    issuedAt: '2026-10-24T00:00:00.000Z',
    signature: 'valid_sig_123'
  };
  store[STANDBY_HUB_ALLOWLIST_KEY] = JSON.stringify([validEntry]);
  assert.deepStrictEqual(getStandbyHubAllowlist(), { ok: true, entries: [validEntry] });

  // 3. getItem が例外: { ok: false, reason: 'unreadable' }
  (globalThis as any).window.localStorage.getItem = () => {
    throw new Error('SecurityError: storage access denied');
  };
  assert.deepStrictEqual(getStandbyHubAllowlist(), { ok: false, reason: 'unreadable' });

  // 4. 壊れた JSON: { ok: false, reason: 'corrupted' }
  store = setupMockLocalStorage();
  store[STANDBY_HUB_ALLOWLIST_KEY] = '{"broken":invalid_json}';
  assert.deepStrictEqual(getStandbyHubAllowlist(), { ok: false, reason: 'corrupted' });

  // 5. 配列でない JSON: { ok: false, reason: 'corrupted' }
  store[STANDBY_HUB_ALLOWLIST_KEY] = '{"endpoint":"https://standby.local:3000"}';
  assert.deepStrictEqual(getStandbyHubAllowlist(), { ok: false, reason: 'corrupted' });
  store[STANDBY_HUB_ALLOWLIST_KEY] = '12345';
  assert.deepStrictEqual(getStandbyHubAllowlist(), { ok: false, reason: 'corrupted' });

  // 6. 要素が壊れた配列: { ok: false, reason: 'corrupted' }
  // 6a. 非オブジェクト要素
  store[STANDBY_HUB_ALLOWLIST_KEY] = JSON.stringify([null]);
  assert.deepStrictEqual(getStandbyHubAllowlist(), { ok: false, reason: 'corrupted' });
  store[STANDBY_HUB_ALLOWLIST_KEY] = JSON.stringify(['string-only']);
  assert.deepStrictEqual(getStandbyHubAllowlist(), { ok: false, reason: 'corrupted' });

  // 6b. endpoint が文字列でない
  store[STANDBY_HUB_ALLOWLIST_KEY] = JSON.stringify([
    { endpoint: 12345, issuedAt: '2026-10-24T00:00:00.000Z', signature: 'sig' }
  ]);
  assert.deepStrictEqual(getStandbyHubAllowlist(), { ok: false, reason: 'corrupted' });

  // 6c. issuedAt が文字列でない
  store[STANDBY_HUB_ALLOWLIST_KEY] = JSON.stringify([
    { endpoint: 'https://standby.local:3000', issuedAt: 12345, signature: 'sig' }
  ]);
  assert.deepStrictEqual(getStandbyHubAllowlist(), { ok: false, reason: 'corrupted' });

  // 6d. signature が文字列でない
  store[STANDBY_HUB_ALLOWLIST_KEY] = JSON.stringify([
    { endpoint: 'https://standby.local:3000', issuedAt: '2026-10-24T00:00:00.000Z', signature: null }
  ]);
  assert.deepStrictEqual(getStandbyHubAllowlist(), { ok: false, reason: 'corrupted' });

  // 7. window が未定義: { ok: true, entries: [] }
  delete (globalThis as any).window;
  assert.deepStrictEqual(getStandbyHubAllowlist(), { ok: true, entries: [] });
});

test('18. resolveStandbyAllowlistViewState determines entries, errorMessage, and registrationBlocked for all 3 states', () => {
  const validEntry: StandbyHubEntry = {
    endpoint: 'https://standby.local:3000',
    issuedAt: '2026-10-24T00:00:00.000Z',
    signature: 'valid_sig_123'
  };

  // 1. ok 状態
  const okResult: StandbyHubAllowlistResult = { ok: true, entries: [validEntry] };
  const okState = resolveStandbyAllowlistViewState(okResult);
  assert.deepStrictEqual(okState.entries, [validEntry]);
  assert.strictEqual(okState.errorMessage, null);
  assert.strictEqual(okState.registrationBlocked, false);

  // 2. unreadable 状態
  const unreadableResult: StandbyHubAllowlistResult = { ok: false, reason: 'unreadable' };
  const unreadableState = resolveStandbyAllowlistViewState(unreadableResult);
  assert.deepStrictEqual(unreadableState.entries, []);
  assert.strictEqual(unreadableState.registrationBlocked, true);
  assert.strictEqual(
    unreadableState.errorMessage,
    'この端末に保存された予備機リストを読み込めませんでした（ブラウザの保存領域にアクセスできません）。登録済みの予備機が消えたとは限らないため、新しい予備機の登録は止めています。ブラウザの保存領域（localStorage）の利用を許可して、ページを再読み込みしてください。'
  );

  // 3. corrupted 状態
  const corruptedResult: StandbyHubAllowlistResult = { ok: false, reason: 'corrupted' };
  const corruptedState = resolveStandbyAllowlistViewState(corruptedResult);
  assert.deepStrictEqual(corruptedState.entries, []);
  assert.strictEqual(corruptedState.registrationBlocked, false);
  assert.strictEqual(
    corruptedState.errorMessage,
    'この端末に保存された予備機リストが壊れていて、読み込めませんでした。メイン端末とオンラインで接続しているときに、予備機の URL を登録し直してください（登録し直すと、壊れたリストは新しい内容に置き換わります）。'
  );
});





