import { HUB_LOCAL_TERMINAL_ID, type HubPullResult, type HubPushRow, type HubStore } from './hub_store.ts';
import { resolvePharmacySyncConfig, type PharmacySyncEnv } from './sync_config.ts';
import { decodeTransportPayload, encodeTransportPayload, TERMINAL_ID_HEADER } from './sync_http.ts';
import { isPushOnlyFromSatelliteCollection, isSyncCollectionName } from './sync_collections.ts';

// ブラウザから自機の /api/sync/* が呼ばれたときの役割分岐ロジック。
// role=hub ならハブストアを直接処理し、role=satellite なら PHARMACY_SYNC_HUB_ENDPOINT
// へ Bearer トークン付きで転送する。ルートハンドラはこの関数を呼ぶだけの薄い層にする。
// 参照: docs/satellite_terminal_sync_plan.md

export type SyncOperationResult<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number; body: { message: string } };

export interface SyncClientOptions {
  env?: PharmacySyncEnv;
  fetchImpl?: typeof fetch;
  getHubStore?: () => HubStore;
}

const DEFAULT_FETCH_TIMEOUT_MS = 8_000;
const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 500;

export function normalizeBatchSize(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value < 1) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.floor(value), MAX_BATCH_SIZE);
}

function notConfiguredResult<T>(): SyncOperationResult<T> {
  return { ok: false, status: 404, body: { message: '端末同期は無効です。' } };
}

function unknownCollectionResult<T>(): SyncOperationResult<T> {
  return { ok: false, status: 400, body: { message: '不明なコレクションです。' } };
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: abortController.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function performSyncPull(
  collection: string,
  checkpointSeq: number,
  batchSize: number,
  options: SyncClientOptions = {}
): Promise<SyncOperationResult<HubPullResult>> {
  const configResult = resolvePharmacySyncConfig(options.env);
  if (!configResult.ok) {
    return { ok: false, status: 500, body: { message: configResult.message } };
  }
  const config = configResult.config;
  if (config.role === 'standalone') return notConfiguredResult();
  if (!isSyncCollectionName(collection)) return unknownCollectionResult();
  const limit = normalizeBatchSize(batchSize);

  if (config.role === 'hub') {
    if (!options.getHubStore) {
      return { ok: false, status: 500, body: { message: 'ハブストアが初期化されていません。' } };
    }
    const result = options.getHubStore().pull(collection, checkpointSeq, limit);
    return { ok: true, status: 200, body: result };
  }

  // role === 'satellite'
  if (isPushOnlyFromSatelliteCollection(collection)) {
    return { ok: false, status: 403, body: { message: 'サテライト端末はこのコレクションを取得できません。' } };
  }

  const fetchImpl = options.fetchImpl || fetch;
  const url = new URL('/api/sync/remote/pull', config.hubEndpoint);
  url.searchParams.set('collection', collection);
  url.searchParams.set('checkpoint', String(checkpointSeq));
  url.searchParams.set('batchSize', String(limit));

  try {
    const response = await fetchWithTimeout(fetchImpl, url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.terminalToken}`,
        [TERMINAL_ID_HEADER]: config.terminalId
      }
    });
    if (!response.ok) {
      return { ok: false, status: response.status, body: { message: 'メイン端末が同期を拒否しました。' } };
    }
    const raw = await response.json();
    const body = decodeTransportPayload<HubPullResult>(raw, config.transportEncryption, config.transportKey);
    return { ok: true, status: 200, body };
  } catch {
    return { ok: false, status: 503, body: { message: 'メイン端末へ接続できません。' } };
  }
}

export async function performSyncPush(
  collection: string,
  rows: HubPushRow[],
  options: SyncClientOptions = {}
): Promise<SyncOperationResult<{ conflicts: Record<string, unknown>[] }>> {
  const configResult = resolvePharmacySyncConfig(options.env);
  if (!configResult.ok) {
    return { ok: false, status: 500, body: { message: configResult.message } };
  }
  const config = configResult.config;
  if (config.role === 'standalone') return notConfiguredResult();
  if (!isSyncCollectionName(collection)) return unknownCollectionResult();

  if (config.role === 'hub') {
    if (!options.getHubStore) {
      return { ok: false, status: 500, body: { message: 'ハブストアが初期化されていません。' } };
    }
    const conflicts = options.getHubStore().push(collection, HUB_LOCAL_TERMINAL_ID, rows);
    return { ok: true, status: 200, body: { conflicts } };
  }

  // role === 'satellite'
  const fetchImpl = options.fetchImpl || fetch;
  const url = new URL('/api/sync/remote/push', config.hubEndpoint);
  const requestBody = encodeTransportPayload({ collection, rows }, config.transportEncryption, config.transportKey);

  try {
    const response = await fetchWithTimeout(fetchImpl, url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.terminalToken}`,
        [TERMINAL_ID_HEADER]: config.terminalId
      },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      return { ok: false, status: response.status, body: { message: 'メイン端末が同期を拒否しました。' } };
    }
    const raw = await response.json();
    const body = decodeTransportPayload<{ conflicts: Record<string, unknown>[] }>(
      raw,
      config.transportEncryption,
      config.transportKey
    );
    return { ok: true, status: 200, body };
  } catch {
    return { ok: false, status: 503, body: { message: 'メイン端末へ接続できません。' } };
  }
}

export interface SyncStatus {
  role: 'hub' | 'satellite' | 'standalone';
  terminals?: ReturnType<HubStore['listTerminals']>;
  unresolvedConflictCount?: number;
  hubReachable?: boolean;
  hubLatencyMs?: number;
}

export async function getSyncStatus(options: SyncClientOptions = {}): Promise<SyncOperationResult<SyncStatus>> {
  const configResult = resolvePharmacySyncConfig(options.env);
  if (!configResult.ok) {
    return { ok: false, status: 500, body: { message: configResult.message } };
  }
  const config = configResult.config;
  if (config.role === 'standalone') {
    return { ok: true, status: 200, body: { role: 'standalone' } };
  }

  if (config.role === 'hub') {
    if (!options.getHubStore) {
      return { ok: false, status: 500, body: { message: 'ハブストアが初期化されていません。' } };
    }
    const store = options.getHubStore();
    return {
      ok: true,
      status: 200,
      body: {
        role: 'hub',
        terminals: store.listTerminals(),
        unresolvedConflictCount: store.listConflicts({ resolved: false }).length
      }
    };
  }

  // role === 'satellite': ハブへ軽量な疎通確認を行う
  const fetchImpl = options.fetchImpl || fetch;
  const url = new URL('/api/sync/remote/pull', config.hubEndpoint);
  url.searchParams.set('collection', 'facility_settings');
  url.searchParams.set('checkpoint', '2147483647');
  url.searchParams.set('batchSize', '1');
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(fetchImpl, url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.terminalToken}`,
        [TERMINAL_ID_HEADER]: config.terminalId
      }
    }, 4_000);
    return {
      ok: true,
      status: 200,
      body: { role: 'satellite', hubReachable: response.ok, hubLatencyMs: Date.now() - startedAt }
    };
  } catch {
    return { ok: true, status: 200, body: { role: 'satellite', hubReachable: false } };
  }
}
