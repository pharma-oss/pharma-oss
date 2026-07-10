import type { DrugMasterRecord, ElectronicUsageOption, MasterDataBackendStatus, MasterDataSeedPayload } from './types';

type SQLiteMasterRequestType =
  | 'init'
  | 'seed'
  | 'getDrugs'
  | 'searchDrugs'
  | 'findDrugsByYjPrefix'
  | 'getUsageOptions'
  | 'searchUsageOptions'
  | 'status';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type WorkerSuccess<T> = {
  id: number;
  ok: true;
  result: T;
};

type WorkerFailure = {
  id: number;
  ok: false;
  error: string;
};

type WorkerResponse<T> = WorkerSuccess<T> | WorkerFailure;

export type SQLiteMasterDataStoreOptions = {
  workerUrl?: string;
  sqliteModuleUrl?: string;
  sqliteScriptUrl?: string;
  sqliteWasmUrl?: string;
  dbName?: string;
};

const DEFAULT_WORKER_URL = '/sqlite-master-data.worker.js';
const DEFAULT_SQLITE_MODULE_URL = '/sqlite/index.mjs';
const DEFAULT_SQLITE_WASM_URL = '/sqlite/sqlite3.wasm';
const DEFAULT_DB_NAME = '/yakureki-master-data.sqlite3';
const DEFAULT_TIMEOUT_MS = 15000;
const SEED_TIMEOUT_MS = 120000;

let storePromise: Promise<SQLiteMasterDataStore | null> | null = null;

function getConfiguredSqliteModuleUrl() {
  return (
    process.env.NEXT_PUBLIC_SQLITE_WASM_MODULE_URL ||
    process.env.NEXT_PUBLIC_SQLITE_WASM_SCRIPT_URL ||
    DEFAULT_SQLITE_MODULE_URL
  );
}

function getConfiguredSqliteWasmUrl() {
  return process.env.NEXT_PUBLIC_SQLITE_WASM_BINARY_URL || DEFAULT_SQLITE_WASM_URL;
}

function getConfiguredWorkerUrl() {
  return process.env.NEXT_PUBLIC_SQLITE_MASTER_WORKER_URL || DEFAULT_WORKER_URL;
}

export function canUseSQLiteMasterDataStore() {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

export class SQLiteMasterDataStore {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly worker: Worker;

  constructor(options: SQLiteMasterDataStoreOptions = {}) {
    const workerUrl = options.workerUrl || getConfiguredWorkerUrl();
    this.worker = new Worker(workerUrl, { type: 'module' });
    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', this.handleError);
  }

  async init(options: SQLiteMasterDataStoreOptions = {}) {
    return this.request<MasterDataBackendStatus>('init', {
      dbName: options.dbName || DEFAULT_DB_NAME,
      sqliteModuleUrl: options.sqliteModuleUrl || options.sqliteScriptUrl || getConfiguredSqliteModuleUrl(),
      sqliteWasmUrl: options.sqliteWasmUrl || getConfiguredSqliteWasmUrl()
    });
  }

  async seed(payload: MasterDataSeedPayload) {
    return this.request<MasterDataBackendStatus>('seed', payload, SEED_TIMEOUT_MS);
  }

  async getStatus() {
    return this.request<MasterDataBackendStatus>('status');
  }

  async getDrugs() {
    return this.request<DrugMasterRecord[]>('getDrugs');
  }

  async searchDrugs(query: string, limit: number) {
    return this.request<DrugMasterRecord[]>('searchDrugs', { query, limit });
  }

  async findDrugsByYjPrefix(prefix: string) {
    return this.request<DrugMasterRecord[]>('findDrugsByYjPrefix', { prefix });
  }

  async getUsageOptions() {
    return this.request<ElectronicUsageOption[]>('getUsageOptions');
  }

  async searchUsageOptions(query: string, limit: number) {
    return this.request<ElectronicUsageOption[]>('searchUsageOptions', { query, limit });
  }

  dispose() {
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.removeEventListener('error', this.handleError);
    this.worker.terminate();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('SQLite master-data worker was disposed.'));
    }
    this.pending.clear();
  }

  private request<T>(type: SQLiteMasterRequestType, payload?: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`SQLite master-data worker request timed out: ${type}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer
      });
      this.worker.postMessage({ id, type, payload });
    });
  }

  private handleMessage = (event: MessageEvent<WorkerResponse<unknown>>) => {
    const response = event.data;
    const pending = this.pending.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(response.id);

    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error(response.error));
    }
  };

  private handleError = (event: ErrorEvent) => {
    const error = new Error(event.message || 'SQLite master-data worker failed.');
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  };
}

export async function getSQLiteMasterDataStore() {
  if (!canUseSQLiteMasterDataStore()) return null;
  if (!storePromise) {
    storePromise = (async () => {
      try {
        const store = new SQLiteMasterDataStore();
        await store.init();
        return store;
      } catch (error) {
        console.warn('[SQLite MasterData] Falling back to in-memory master data.', error);
        return null;
      }
    })();
  }
  return storePromise;
}

export async function getSeededSQLiteMasterDataStore(payload: MasterDataSeedPayload) {
  const store = await getSQLiteMasterDataStore();
  if (!store) return null;

  try {
    await store.seed(payload);
    return store;
  } catch (error) {
    console.warn('[SQLite MasterData] Failed to seed SQLite master data; using JSON fallback.', error);
    return null;
  }
}
