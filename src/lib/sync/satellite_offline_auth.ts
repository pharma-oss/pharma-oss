import CryptoJS from 'crypto-js';
import type { User } from '@/db/types';
import { verifyPassword } from '../auth';

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

export type StandbyHubAllowlistResult =
  | { ok: true; entries: StandbyHubEntry[] }
  | { ok: false; reason: 'unreadable' | 'corrupted' };

export interface StandbyAllowlistViewState {
  entries: StandbyHubEntry[];
  errorMessage: string | null;
  registrationBlocked: boolean;
}

function getPersistentEncKey(): string {
  if (typeof window === 'undefined') return 'mock_satellite_key';
  try {
    return window.localStorage.getItem('yakureki_satellite_persistent_queue_enc_key') || 'yakureki_default_salt_key';
  } catch {
    return 'yakureki_default_salt_key';
  }
}

let memoryRevokedTombstone = false;

/**
 * テスト用にインメモリの失効墓石フラグをリセットする
 */
export function resetSatelliteRevocationTombstoneForTest(): void {
  memoryRevokedTombstone = false;
}

/**
 * 端末失効 (Tombstone) フラグを記録する
 */
export function recordSatelliteRevocationTombstone(): void {
  memoryRevokedTombstone = true;
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
  if (memoryRevokedTombstone) return true;
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
  // 失効の記録を最初に残す。以降の消去がどれか失敗しても、失効した端末として扱い続けるため。
  recordSatelliteRevocationTombstone();
  const removals: Array<() => void> = [
    () => window.localStorage.removeItem(OFFLINE_AUTH_CACHE_KEY),
    () => window.localStorage.removeItem('yakureki_satellite_unsent_queue_v1'),
    () => window.localStorage.removeItem('yakureki_satellite_persistent_queue_enc_key'),
    () => window.localStorage.removeItem(STANDBY_HUB_ALLOWLIST_KEY),
    () => window.sessionStorage.removeItem('pharmacy_os_current_user')
  ];
  // 1件の失敗で残りの消去を止めない
  for (const remove of removals) {
    try {
      remove();
    } catch (e) {
      console.error('[Satellite Auth] Failed to purge a satellite cache entry:', e);
    }
  }
}

export type SaveOfflineAuthCacheResult = 'saved' | 'noop' | 'failed';

/**
 * スタッフマスタをオフライン認証キャッシュへ暗号化保存する
 */
export function saveOfflineAuthCache(
  users: User[],
  encKey?: string,
  cachedAt: Date = new Date()
): SaveOfflineAuthCacheResult {
  if (typeof window === 'undefined') return 'noop';
  if (isSatelliteRevokedTombstone()) {
    console.warn('[Satellite Auth] Cannot save offline auth cache: Terminal is revoked.');
    return 'noop';
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

  if (validUsers.length === 0) return 'noop';

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
    return 'saved';
  } catch (e) {
    console.error('[Satellite Auth] Failed to save encrypted offline auth cache:', e);
    return 'failed';
  }
}

export interface OfflineAuthSaveWarningOutcome {
  shouldWarn: boolean;
  warningMessage: string | null;
  nextAlreadyWarned: boolean;
}

/**
 * オフライン認証キャッシュ保存結果・端末役割・通知済みフラグから
 * 画面寿命で1回だけの警告通知を出すかを判定する純粋関数
 */
export function resolveOfflineAuthSaveWarningOutcome(params: {
  saveResult: SaveOfflineAuthCacheResult;
  role: 'hub' | 'satellite' | 'standalone';
  alreadyWarned: boolean;
}): OfflineAuthSaveWarningOutcome {
  if (params.saveResult === 'failed' && params.role === 'satellite' && !params.alreadyWarned) {
    return {
      shouldWarn: true,
      warningMessage:
        'この端末のオフライン用スタッフ認証情報を保存できませんでした。メイン端末と通信できないとき、この端末ではログインできなくなります。ブラウザの保存領域の空き容量を確認して、再読み込みしてください。',
      nextAlreadyWarned: true,
    };
  }

  return {
    shouldWarn: false,
    warningMessage: null,
    nextAlreadyWarned: params.alreadyWarned,
  };
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
export function getStandbyHubAllowlist(): StandbyHubAllowlistResult {
  if (typeof window === 'undefined') return { ok: true, entries: [] };
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STANDBY_HUB_ALLOWLIST_KEY);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (!raw || !raw.trim()) return { ok: true, entries: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'corrupted' };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, reason: 'corrupted' };
  }

  for (const item of parsed) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof (item as Record<string, unknown>).endpoint !== 'string' ||
      typeof (item as Record<string, unknown>).issuedAt !== 'string' ||
      typeof (item as Record<string, unknown>).signature !== 'string'
    ) {
      return { ok: false, reason: 'corrupted' };
    }
  }

  return { ok: true, entries: parsed as StandbyHubEntry[] };
}

/**
 * 予備機候補リストの取得結果から画面表示状態を決定する純粋関数
 */
export function resolveStandbyAllowlistViewState(
  result: StandbyHubAllowlistResult
): StandbyAllowlistViewState {
  if (result.ok) {
    return {
      entries: result.entries,
      errorMessage: null,
      registrationBlocked: false
    };
  }

  if (result.reason === 'unreadable') {
    return {
      entries: [],
      errorMessage:
        'この端末に保存された予備機リストを読み込めませんでした（ブラウザの保存領域にアクセスできません）。登録済みの予備機が消えたとは限らないため、新しい予備機の登録は止めています。ブラウザの保存領域（localStorage）の利用を許可して、ページを再読み込みしてください。',
      registrationBlocked: true
    };
  }

  return {
    entries: [],
    errorMessage:
      'この端末に保存された予備機リストが壊れていて、読み込めませんでした。メイン端末とオンラインで接続しているときに、予備機の URL を登録し直してください（登録し直すと、壊れたリストは新しい内容に置き換わります）。',
    registrationBlocked: false
  };
}

/**
 * 予備機候補リストを localStorage に保存する（成功は true、失敗は false）
 */
export function saveStandbyHubAllowlist(entries: StandbyHubEntry[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STANDBY_HUB_ALLOWLIST_KEY, JSON.stringify(entries));
    return true;
  } catch (e) {
    console.error('[Satellite Auth] Failed to save standby hub allowlist:', e);
    return false;
  }
}

export interface StandbyEndpointRegistrationOutcome {
  ok: boolean;
  errorMessage: string | null;
}

/**
 * 予備機エンドポイント登録の保存成否からハンドラの挙動（エラー文言）を決定する純粋関数
 */
export function resolveStandbyEndpointRegistrationOutcome(
  saved: boolean
): StandbyEndpointRegistrationOutcome {
  if (!saved) {
    return {
      ok: false,
      errorMessage:
        '予備機エンドポイントを保存できませんでした。ブラウザの保存領域の空き容量やプライベートブラウズの設定を確認して、もう一度お試しください。',
    };
  }

  return {
    ok: true,
    errorMessage: null,
  };
}


export interface OfflineAuthStaffLoadOutcome {
  users: User[];
  isOffline: boolean;
  expiresAt: string;
  errorMessage: string | null;
}

/**
 * オフライン認証キャッシュの検証結果からログイン画面のスタッフ読み込み状態・エラー文言を決定する純粋関数
 */
export function resolveOfflineAuthStaffLoadOutcome(
  cacheResult: OfflineAuthCacheResult
): OfflineAuthStaffLoadOutcome {
  if (cacheResult.ok && cacheResult.users.length > 0) {
    return {
      users: cacheResult.users,
      isOffline: true,
      expiresAt: cacheResult.expiresAt,
      errorMessage: null,
    };
  }

  if (!cacheResult.ok) {
    if (cacheResult.reason === 'corrupted') {
      return {
        users: [],
        isOffline: false,
        expiresAt: '',
        errorMessage: '端末内のオフライン認証データが破損しています。メイン端末と接続して認証情報を再同期してください。',
      };
    }
    if (cacheResult.reason === 'expired') {
      return {
        users: [],
        isOffline: false,
        expiresAt: '',
        errorMessage: 'オフライン認証の有効期限が切れています。メイン端末と接続して認証情報を更新してください。',
      };
    }
  }

  return {
    users: [],
    isOffline: false,
    expiresAt: '',
    errorMessage: null,
  };
}
