/**
 * サテライト端末未送信ローカルキュー (Satellite Unsent Local Queue)
 *
 * サテライト端末がメイン端末(Hub)と切断されている間に入力された
 * レコードを端末永続キーで暗号化して保存し、
 * タブ終了・スリープ・端末再起動・ブラウザクラッシュによるデータ喪失を保護します。
 *
 * Hub との疎通復帰時 (flushUnsentLocalQueue) に、Hub が要求する HubPushRow 形状
 * { docId, newDocumentState, assumedMasterState } で正確にリモート Push を実行し、
 * ACK (成功レスポンス) を受信したレコードのみをローカルキューから正しく消去します。
 */

import CryptoJS from 'crypto-js';
import type { HubPushRow } from './hub_store';

export interface UnsentLocalRecord {
  id: string;
  docId: string;
  collectionName: string;
  payload: Record<string, unknown>;
  assumedMasterState?: Record<string, unknown> | null;
  enqueuedAt: string;
  checksum: string;
}

export const SATELLITE_QUEUE_LIMITS = {
  WARN_RECORDS: 800,
  MAX_RECOMMENDED_RECORDS: 1000,
  EXPIRY_WARNING_HOURS: 24,
} as const;

export interface SatelliteQueueHealth {
  total: number;
  byCollection: Record<string, number>;
  expiredCount: number;
  hasExpired: boolean;
  isNearLimit: boolean;
  isLimitExceeded: boolean;
  oldestEnqueuedAt: string | null;
  newestEnqueuedAt: string | null;
}

const LOCAL_QUEUE_STORAGE_KEY = 'yakureki_satellite_unsent_queue_v1';
const PERSISTENT_QUEUE_KEY_STORAGE_KEY = 'yakureki_satellite_persistent_queue_enc_key';
let memoryQueue: UnsentLocalRecord[] = [];

/**
 * レコードが保持期限警告閾値(既定24時間)を超過しているか判定します。
 * (※重要: 期限超過であっても自動削除は絶対にせず、早期同期を促す警告表示にのみ用います)
 */
export function isRecordExpired(
  record: UnsentLocalRecord,
  now: Date = new Date(),
  expiryHours: number = SATELLITE_QUEUE_LIMITS.EXPIRY_WARNING_HOURS
): boolean {
  if (!record.enqueuedAt) return false;
  const enqueuedTime = new Date(record.enqueuedAt).getTime();
  if (Number.isNaN(enqueuedTime)) return false;
  const elapsedMs = now.getTime() - enqueuedTime;
  return elapsedMs >= expiryHours * 60 * 60 * 1000;
}

/**
 * 未送信ローカルキューの健康状態（件数、期限超過、上限接近/超過、コレクション別内訳）を返します。
 */
export function getSatelliteQueueHealth(now: Date = new Date()): SatelliteQueueHealth {
  const queue = getUnsentLocalQueue();
  const byCollection: Record<string, number> = {};
  let expiredCount = 0;
  let oldestTime: number | null = null;
  let newestTime: number | null = null;
  let oldestEnqueuedAt: string | null = null;
  let newestEnqueuedAt: string | null = null;

  for (const item of queue) {
    byCollection[item.collectionName] = (byCollection[item.collectionName] || 0) + 1;
    if (isRecordExpired(item, now)) {
      expiredCount++;
    }
    if (item.enqueuedAt) {
      const t = new Date(item.enqueuedAt).getTime();
      if (!Number.isNaN(t)) {
        if (oldestTime === null || t < oldestTime) {
          oldestTime = t;
          oldestEnqueuedAt = item.enqueuedAt;
        }
        if (newestTime === null || t > newestTime) {
          newestTime = t;
          newestEnqueuedAt = item.enqueuedAt;
        }
      }
    }
  }

  const total = queue.length;
  return {
    total,
    byCollection,
    expiredCount,
    hasExpired: expiredCount > 0,
    isNearLimit: total >= SATELLITE_QUEUE_LIMITS.WARN_RECORDS && total < SATELLITE_QUEUE_LIMITS.MAX_RECOMMENDED_RECORDS,
    isLimitExceeded: total >= SATELLITE_QUEUE_LIMITS.MAX_RECOMMENDED_RECORDS,
    oldestEnqueuedAt,
    newestEnqueuedAt,
  };
}

export function getUnsentQueueSummary(): { total: number; byCollection: Record<string, number> } {
  const health = getSatelliteQueueHealth();
  return {
    total: health.total,
    byCollection: health.byCollection,
  };
}

/**
 * 端末再起動・ブラウザクラッシュ後も生存する端末永続暗号鍵を取得します。
 * (sessionStorage ではなく localStorage 永続キーエスクローを採用)
 *
 * localStorage が使えない場合は、実行中のみ有効なランダム鍵にフォールバック
 * する(本リポジトリは公開OSSのため、固定文字列を鍵に使うと事実上無施錠になる)。
 */
let inMemoryFallbackKey: string | null = null;
function getVolatileFallbackKey(): string {
  if (!inMemoryFallbackKey) {
    inMemoryFallbackKey = CryptoJS.lib.WordArray.random(32).toString();
  }
  return inMemoryFallbackKey;
}

function getPersistentEncryptionKey(): string {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return getVolatileFallbackKey();
  }
  try {
    let key = window.localStorage.getItem(PERSISTENT_QUEUE_KEY_STORAGE_KEY);
    if (!key) {
      key = CryptoJS.lib.WordArray.random(32).toString();
      window.localStorage.setItem(PERSISTENT_QUEUE_KEY_STORAGE_KEY, key);
    }
    return key;
  } catch {
    return getVolatileFallbackKey();
  }
}

function isBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function getUnsentLocalQueue(): UnsentLocalRecord[] {
  if (!isBrowser()) {
    return [...memoryQueue];
  }
  try {
    const rawEncrypted = window.localStorage.getItem(LOCAL_QUEUE_STORAGE_KEY);
    if (!rawEncrypted) return [...memoryQueue];

    const bytes = CryptoJS.AES.decrypt(rawEncrypted, getPersistentEncryptionKey());
    const rawJson = bytes.toString(CryptoJS.enc.Utf8);
    if (!rawJson) {
      console.warn('[Satellite Local Queue] Warning: Could not decrypt queue payload with persistent key.');
      return [...memoryQueue];
    }
    const parsed = JSON.parse(rawJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[Satellite Local Queue] Failed to decrypt or parse local queue:', e);
    return [...memoryQueue];
  }
}

function saveQueueToStorage(queue: UnsentLocalRecord[]): void {
  memoryQueue = [...queue];
  if (!isBrowser()) return;
  try {
    const jsonStr = JSON.stringify(queue);
    const encrypted = CryptoJS.AES.encrypt(jsonStr, getPersistentEncryptionKey()).toString();
    window.localStorage.setItem(LOCAL_QUEUE_STORAGE_KEY, encrypted);
  } catch (e) {
    console.error('[Satellite Local Queue] Failed to persist encrypted queue:', e);
  }
}

export function enqueueUnsentRecord(
  collectionName: string,
  payload: Record<string, unknown>,
  primaryPath = 'id',
  assumedMasterState?: Record<string, unknown> | null
): UnsentLocalRecord {
  const queue = getUnsentLocalQueue();
  const docId = String(
    payload[primaryPath] ||
    payload.id ||
    payload.userId ||
    payload.patientId ||
    payload.visitId ||
    `doc_${Date.now()}_${Math.random()}`
  );
  const recordId = `${collectionName}:${docId}`;
  const enqueuedAt = new Date().toISOString();
  // 真正な SHA-256 チェックサム計算
  const checksum = CryptoJS.SHA256(JSON.stringify(payload)).toString();

  const record: UnsentLocalRecord = {
    id: recordId,
    docId,
    collectionName,
    payload,
    assumedMasterState: assumedMasterState ?? null,
    enqueuedAt,
    checksum,
  };

  const existingIndex = queue.findIndex((item) => item.id === recordId && item.collectionName === collectionName);
  if (existingIndex >= 0) {
    queue[existingIndex] = record;
  } else {
    queue.push(record);
  }

  saveQueueToStorage(queue);
  return record;
}

export function clearAckedRecord(id: string, collectionName: string): boolean {
  const queue = getUnsentLocalQueue();
  const nextQueue = queue.filter((item) => !(item.id === id && item.collectionName === collectionName));
  if (nextQueue.length === queue.length) return false;

  saveQueueToStorage(nextQueue);
  return true;
}

export function clearAllUnsentQueue(): void {
  memoryQueue = [];
  if (isBrowser()) {
    try {
      window.localStorage.removeItem(LOCAL_QUEUE_STORAGE_KEY);
    } catch (e) {
      console.error('[Satellite Local Queue] Failed to clear unsent queue:', e);
    }
  }
}

/**
 * Hub との接続復帰時にローカルキューの未送信データを Hub が受容する HubPushRow 形状
 * { docId, newDocumentState, assumedMasterState } にて送信し、
 * Hub から ACK を受け取ったレコードのみをローカルキューから正しく消去します。
 */
export async function flushUnsentLocalQueue(
  pushApiHandler?: (collectionName: string, pushRows: HubPushRow[]) => Promise<boolean>
): Promise<{ flushedCount: number; remainingCount: number }> {
  const queue = getUnsentLocalQueue();
  if (queue.length === 0) {
    return { flushedCount: 0, remainingCount: 0 };
  }

  let ackedCount = 0;
  const remainingRecords: UnsentLocalRecord[] = [];

  for (const item of queue) {
    let success = false;
    // Hub 側 (hub_store.ts / /api/sync/push) が受容する HubPushRow 構造を正確に生成
    const pushRow: HubPushRow = {
      docId: item.docId,
      newDocumentState: item.payload,
      assumedMasterState: item.assumedMasterState ?? null,
    };

    if (pushApiHandler) {
      try {
        success = await pushApiHandler(item.collectionName, [pushRow]);
      } catch (err) {
        console.error(`[Satellite Local Queue] Failed to push collection ${item.collectionName}:`, err);
        success = false;
      }
    } else if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      try {
        const response = await fetch('/api/sync/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            collection: item.collectionName,
            rows: [pushRow],
          }),
        });
        success = response.ok;
      } catch (err) {
        console.error('[Satellite Local Queue] Push request failed:', err);
        success = false;
      }
    }

    if (success) {
      ackedCount++;
    } else {
      remainingRecords.push(item);
    }
  }

  saveQueueToStorage(remainingRecords);
  return {
    flushedCount: ackedCount,
    remainingCount: remainingRecords.length,
  };
}
