import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openHubStore, type HubStore } from './hub_store.ts';
import { resolvePharmacySyncConfig, type HubSyncConfig } from './sync_config.ts';

// このNext.jsサーバープロセス内で1つだけ開くハブストアのシングルトン。
// ルートハンドラから呼ばれる想定で、テストではこれを経由せず openHubStore() を
// 直接使う(sync_client.ts等はHubStoreをオプション注入で受け取る設計にしている)。

export class HubRoleUnavailableError extends Error {}

let cachedStore: HubStore | null = null;
let cachedDbPath: string | null = null;

export function getHubSyncConfigOrThrow(): HubSyncConfig {
  const result = resolvePharmacySyncConfig();
  if (!result.ok || result.config.role !== 'hub') {
    throw new HubRoleUnavailableError('このサーバーはメイン端末(hub)として設定されていません。');
  }
  return result.config;
}

export function getHubStoreSingleton(): HubStore {
  const config = getHubSyncConfigOrThrow();
  if (cachedStore && cachedDbPath === config.dbPath) return cachedStore;
  if (cachedStore) {
    cachedStore.close();
    cachedStore = null;
  }
  if (config.dbPath !== ':memory:') {
    mkdirSync(dirname(config.dbPath), { recursive: true });
  }
  cachedStore = openHubStore({ dbPath: config.dbPath, encryptionKey: config.encryptionKey });
  cachedDbPath = config.dbPath;
  return cachedStore;
}
