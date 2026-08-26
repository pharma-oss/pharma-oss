import CryptoJS from 'crypto-js';
import type { User } from '@/db/types';
import { verifyPassword } from '../auth';
import { isAllowedHubEndpoint } from './sync_config';

export const OFFLINE_AUTH_CACHE_KEY = 'yakureki_satellite_offline_auth_cache_v1';
export const OFFLINE_AUTH_CACHE_TTL_HOURS = 24;
export const REVOCATION_TOMBSTONE_KEY = 'yakureki_satellite_revocation_tombstone';
export const STANDBY_HUB_ALLOWLIST_KEY = 'yakureki_satellite_standby_hub_allowlist_v1';

export interface OfflineCachedUser {
  userId: string;
  name: string;
  role: 'admin' | 'pharmacist' | 'clerk';
  salt: string;
  passwordHash: string;
  cachedAt: string;
}

export interface StandbyHubEntry {
  endpoint: string;
  issuedAt: string;
  signature: string;
}

export type OfflineAuthCacheResult =
  | { ok: true; users: User[]; cachedAt: string; expiresAt: string }
  | { ok: false; reason: 'expired' | 'revoked' | 'empty' | 'corrupted' };

function getPersistentEncKey(): string {
  if (typeof window === 'undefined') return 'mock_satellite_key';
  try {
    return window.localStorage.getItem('yakureki_satellite_persistent_queue_enc_key') || 'yakureki_default_salt_key';
  } catch {
    return 'yakureki_default_salt_key';
  }
}

/**
 * 端末失効 (Tombstone) フラグを記録する
 */
export function recordSatelliteRevocationTombstone(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REVOCATION_TOMBSTONE_KEY, 'true');
  } catch (e) {
    console.error('[Satellite Auth] Failed to record revocation tombstone:', e);
  }
}

/**
 * 端末失効 (Tombstone) フラグが立っているか判定する
 */
export function isSatelliteRevokedTombstone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(REVOCATION_TOMBSTONE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * 端末失効検知時にサテライト端末内の全認証・キューキャッシュを抹消 (Zeroize) する
 */
export function purgeSatelliteAllCaches(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(OFFLINE_AUTH_CACHE_KEY);
    window.localStorage.removeItem('yakureki_satellite_unsent_queue_v1');
    window.localStorage.removeItem('yakureki_satellite_persistent_queue_enc_key');
    window.localStorage.removeItem(STANDBY_HUB_ALLOWLIST_KEY);
    window.sessionStorage.removeItem('pharmacy_os_current_user');
    recordSatelliteRevocationTombstone();
  } catch (e) {
    console.error('[Satellite Auth] Failed to purge all satellite caches:', e);
  }
}

/**
 * スタッフマスタをオフライン認証キャッシュへ暗号化保存する
 */
export function saveOfflineAuthCache(users: User[], encKey?: string, cachedAt: Date = new Date()): void {
  if (typeof window === 'undefined') return;
  if (isSatelliteRevokedTombstone()) {
    console.warn('[Satellite Auth] Cannot save offline auth cache: Terminal is revoked.');
    return;
  }

  const validUsers = users.filter(
    (u) =>
      u.userId !== 'unauthenticated' &&
      u.userId !== 'system' &&
      u.userId !== 'demo_guest_user' &&
      Boolean(u.passwordHash) &&
      Boolean(u.salt) &&
      (u.role === 'admin' || u.role === 'pharmacist' || u.role === 'clerk')
  );

  if (validUsers.length === 0) return;

  const key = encKey || getPersistentEncKey();
  const cachedAtIso = cachedAt.toISOString();

  const cachePayload: OfflineCachedUser[] = validUsers.map((u) => ({
    userId: u.userId,
    name: u.name,
    role: u.role as 'admin' | 'pharmacist' | 'clerk',
    salt: u.salt!,
    passwordHash: u.passwordHash!,
    cachedAt: cachedAtIso
  }));

  try {
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(cachePayload), key).toString();
    window.localStorage.setItem(OFFLINE_AUTH_CACHE_KEY, encrypted);
  } catch (e) {
    console.error('[Satellite Auth] Failed to save encrypted offline auth cache:', e);
  }
}

/**
 * オフライン認証キャッシュを復号・検証して取得する
 */
export function getOfflineAuthCache(encKey?: string, now: Date = new Date()): OfflineAuthCacheResult {
  if (typeof window === 'undefined') return { ok: false, reason: 'empty' };
  if (isSatelliteRevokedTombstone()) {
    return { ok: false, reason: 'revoked' };
  }

  let raw = '';
  try {
    raw = window.localStorage.getItem(OFFLINE_AUTH_CACHE_KEY) || '';
  } catch {
    return { ok: false, reason: 'corrupted' };
  }

  if (!raw.trim()) return { ok: false, reason: 'empty' };

  const key = encKey || getPersistentEncKey();
  let items: OfflineCachedUser[];
  try {
    const bytes = CryptoJS.AES.decrypt(raw, key);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) return { ok: false, reason: 'corrupted' };
    items = JSON.parse(decrypted);
  } catch {
    return { ok: false, reason: 'corrupted' };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  const firstCachedAt = new Date(items[0].cachedAt);
  if (isNaN(firstCachedAt.getTime())) {
    return { ok: false, reason: 'corrupted' };
  }

  const ageMs = now.getTime() - firstCachedAt.getTime();
  const maxAgeMs = OFFLINE_AUTH_CACHE_TTL_HOURS * 3600 * 1000;
  if (ageMs > maxAgeMs) {
    return { ok: false, reason: 'expired' };
  }

  const users: User[] = items.map((item) => ({
    userId: item.userId,
    name: item.name,
    role: item.role,
    salt: item.salt,
    passwordHash: item.passwordHash
  }));

  const expiresAt = new Date(firstCachedAt.getTime() + maxAgeMs).toISOString();

  return {
    ok: true,
    users,
    cachedAt: items[0].cachedAt,
    expiresAt
  };
}

/**
 * オフライン認証時のパスワード検証
 */
export async function verifyOfflinePassword(password: string, user: User): Promise<boolean> {
  return verifyPassword(password, user);
}

/**
 * 予備機エンドポイントの HMAC-SHA-256 署名を生成する (Hub/サーバー側)
 */
export function computeStandbyHubHmac(endpoint: string, issuedAt: string, terminalToken: string): string {
  const message = `${endpoint.trim().toLowerCase()}|${issuedAt.trim()}`;
  return CryptoJS.HmacSHA256(message, terminalToken).toString(CryptoJS.enc.Hex);
}

/**
 * 予備機エンドポイントの HMAC-SHA-256 署名を検証する (サーバー側)
 */
export function verifyStandbyHubHmac(entry: StandbyHubEntry, terminalToken: string): boolean {
  if (!entry?.endpoint || !entry?.issuedAt || !entry?.signature || !terminalToken) {
    return false;
  }
  const expected = computeStandbyHubHmac(entry.endpoint, entry.issuedAt, terminalToken);
  return expected === entry.signature;
}

/**
 * 予備機候補リストを localStorage から取得する
 */
export function getStandbyHubAllowlist(): StandbyHubEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STANDBY_HUB_ALLOWLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 予備機候補リストを localStorage に保存する
 */
export function saveStandbyHubAllowlist(entries: StandbyHubEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STANDBY_HUB_ALLOWLIST_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error('[Satellite Auth] Failed to save standby hub allowlist:', e);
  }
}

/**
 * ブラウザ側から自機 Next サーバー (127.0.0.1) の /api/sync/standby-hub/verify を叩いて署名を検証する
 */
export async function verifyStandbyHubEndpoint(
  entry: StandbyHubEntry,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; reason?: string }> {
  if (!entry || !entry.endpoint) {
    return { ok: false, reason: '予備機エンドポイントが指定されていません。' };
  }

  // URL 形式および LAN 暗号化ルールの検証
  if (!isAllowedHubEndpoint(entry.endpoint, 'none')) {
    // 転送暗号化 'none' の場合、LAN平文HTTPは拒否される
    return {
      ok: false,
      reason: '接続先 URL が許可されていません（LAN 経由の接続には HTTPS または転送暗号化 (aes-gcm) が必要です）。'
    };
  }

  try {
    const response = await fetchImpl('/api/sync/standby-hub/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: '署名検証に失敗しました。' }));
      return { ok: false, reason: body.message || '予備機の署名が無効または改ざんされています。' };
    }

    const body = await response.json();
    return { ok: Boolean(body.ok), reason: body.message };
  } catch (e) {
    return {
      ok: false,
      reason: `自機検証サーバーへの接続に失敗しました: ${e instanceof Error ? e.message : 'ネットワークエラー'}`
    };
  }
}
