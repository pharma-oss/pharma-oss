import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import type { RxCollection } from 'rxdb';
import type { PharmacyDatabase } from '@/db/types';
import { ALL_SYNC_COLLECTIONS, isPushOnlyFromSatelliteCollection, type SyncCollectionName } from './sync_collections';
import type { HubPullResult, HubPushRow } from './hub_store';

// db/index.ts が作った RxDB コレクション(hub側はDexie暗号化、satellite側はメモリ)を
// /api/sync/pull・/api/sync/push(自機サーバー、同一オリジン)へ繋ぐ。トークンはブラウザに
// 一切渡らない(サーバー側でsync_client.tsが付与する)。
// 参照: docs/satellite_terminal_sync_plan.md

export type SyncReplicationRole = 'hub' | 'satellite';

export interface StartReplicationOptions {
  role: SyncReplicationRole;
  fetchImpl?: typeof fetch;
  batchSize?: number;
  retryTimeMs?: number;
  /**
   * RxDBのlive replicationは pull.stream$ を渡さない限り、起動時・オンライン復帰時・
   * タブ可視化時にしか再pullしない(タブを開いたまま他端末の更新は届かない)。
   * このポーリング間隔で reSync() を呼び、他端末からの更新を定期的に取り込む。
   */
  pollIntervalMs?: number;
  collections?: readonly SyncCollectionName[];
}

export interface ReplicationHandle {
  states: Partial<Record<SyncCollectionName, RxReplicationState<unknown, unknown>>>;
  awaitInitialReplication(): Promise<void>;
  cancel(): Promise<void>;
}

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_RETRY_TIME_MS = 5000;
const DEFAULT_POLL_INTERVAL_MS = 5000;

function buildPullHandler(collectionName: SyncCollectionName, fetchImpl: typeof fetch, batchSize: number) {
  return async (lastCheckpoint: { seq: number } | undefined, requestedBatchSize: number) => {
    const params = new URLSearchParams({
      collection: collectionName,
      checkpoint: String(lastCheckpoint?.seq ?? 0),
      batchSize: String(requestedBatchSize || batchSize)
    });
    const response = await fetchImpl(`/api/sync/pull?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`同期pullに失敗しました(${collectionName}): HTTP ${response.status}`);
    }
    const body = await response.json() as HubPullResult;
    return { documents: body.documents, checkpoint: body.checkpoint };
  };
}

function buildPushHandler(collectionName: SyncCollectionName, primaryPath: string, fetchImpl: typeof fetch) {
  return async (rows: { newDocumentState: Record<string, unknown>; assumedMasterState?: Record<string, unknown> }[]) => {
    const pushRows: HubPushRow[] = rows.map((row) => ({
      docId: String(row.newDocumentState[primaryPath]),
      newDocumentState: row.newDocumentState,
      assumedMasterState: row.assumedMasterState ?? null
    }));
    const response = await fetchImpl('/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection: collectionName, rows: pushRows })
    });
    if (!response.ok) {
      throw new Error(`同期pushに失敗しました(${collectionName}): HTTP ${response.status}`);
    }
    const body = await response.json() as { conflicts: Record<string, unknown>[] };
    return body.conflicts;
  };
}

export function startReplication(db: PharmacyDatabase, options: StartReplicationOptions): ReplicationHandle {
  const fetchImpl = options.fetchImpl || fetch;
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
  const retryTime = options.retryTimeMs ?? DEFAULT_RETRY_TIME_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const targetCollections = options.collections ?? ALL_SYNC_COLLECTIONS;
  const states: Partial<Record<SyncCollectionName, RxReplicationState<unknown, unknown>>> = {};
  const pollTimers: ReturnType<typeof setInterval>[] = [];

  for (const collectionName of targetCollections) {
    const collection = (db as unknown as Record<SyncCollectionName, RxCollection>)[collectionName];
    const primaryPath = collection.schema.primaryPath;
    const pushOnly = options.role === 'satellite' && isPushOnlyFromSatelliteCollection(collectionName);

    const state = replicateRxCollection({
      replicationIdentifier: `yakureki-sync-${collectionName}`,
      collection,
      live: true,
      retryTime,
      // db/index.ts は RxDBLeaderElectionPlugin を読み込んでいないため、既定の
      // waitForLeadership:true のままだとリーダー確定を待ち続けて同期が始まらない。
      // 1端末1タブ運用が前提のため、タブ間の代表選出はせず全タブで同期する。
      waitForLeadership: false,
      push: {
        handler: buildPushHandler(collectionName, primaryPath, fetchImpl)
      },
      // audit_logs はサテライトからはpush専用(他端末分のログを保持しない)。
      ...(pushOnly ? {} : {
        pull: {
          handler: buildPullHandler(collectionName, fetchImpl, batchSize),
          batchSize
        }
      })
    }) as RxReplicationState<unknown, unknown>;
    states[collectionName] = state;

    if (!pushOnly) {
      pollTimers.push(setInterval(() => { state.reSync(); }, pollIntervalMs));
    }
  }

  return {
    states,
    async awaitInitialReplication() {
      await Promise.all(Object.values(states).map((state) => state.awaitInitialReplication()));
    },
    async cancel() {
      pollTimers.forEach((timer) => clearInterval(timer));
      await Promise.all(Object.values(states).map((state) => state.cancel()));
    }
  };
}
