import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BACKUP_SCHEDULE_POLICY } from './backup.ts';
import {
  BACKUP_SCHEDULE_POLICY_STORAGE_KEY,
  readBackupSchedulePolicy,
  writeBackupSchedulePolicy
} from './backup_schedule_storage.ts';

type TestGlobal = { window?: unknown };

function createStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); }
  };
}

function withWindow<T>(localStorage: unknown, fn: () => T): T {
  const g = globalThis as TestGlobal;
  const previous = g.window;
  g.window = { localStorage };
  try {
    return fn();
  } finally {
    if (previous === undefined) delete g.window;
    else g.window = previous;
  }
}

function silenceWarn<T>(fn: () => T): { result: T; warnings: unknown[][] } {
  const warnings: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    return { result: fn(), warnings };
  } finally {
    console.warn = original;
  }
}

test('the storage key is pinned so a rename cannot silently orphan policies already saved on user devices', () => {
  assert.equal(BACKUP_SCHEDULE_POLICY_STORAGE_KEY, 'yakureki_backup_schedule_policy');
});

test('without a window (SSR) reading returns the defaults silently and writing only normalizes', () => {
  assert.equal(typeof window, 'undefined');
  const { result, warnings } = silenceWarn(() => readBackupSchedulePolicy());
  assert.deepEqual(result, DEFAULT_BACKUP_SCHEDULE_POLICY);
  assert.equal(warnings.length, 0, 'SSR is a normal path, not an error to warn about');

  const normalized = writeBackupSchedulePolicy({ ...DEFAULT_BACKUP_SCHEDULE_POLICY, scheduledTime: '7:5' });
  assert.equal(normalized.scheduledTime, DEFAULT_BACKUP_SCHEDULE_POLICY.scheduledTime);
});

test('reading with nothing stored returns the defaults', () => {
  const storage = createStorage();
  assert.deepEqual(withWindow(storage, () => readBackupSchedulePolicy()), DEFAULT_BACKUP_SCHEDULE_POLICY);
});

test('a written policy is stored under the documented key and read back unchanged', () => {
  const storage = createStorage();
  const policy = { enabled: false, scheduledTime: '03:30', requireEncrypted: false, requireExternalStorage: false };

  const written = withWindow(storage, () => writeBackupSchedulePolicy(policy));
  assert.deepEqual(written, policy);
  assert.deepEqual(JSON.parse(storage.store.get(BACKUP_SCHEDULE_POLICY_STORAGE_KEY)!), policy);
  assert.deepEqual(withWindow(storage, () => readBackupSchedulePolicy()), policy);
});

test('an invalid time is never persisted: it is normalized to the default before it reaches storage', () => {
  const storage = createStorage();
  const written = withWindow(storage, () =>
    writeBackupSchedulePolicy({ ...DEFAULT_BACKUP_SCHEDULE_POLICY, scheduledTime: '25:99' })
  );
  assert.equal(written.scheduledTime, DEFAULT_BACKUP_SCHEDULE_POLICY.scheduledTime);
  assert.equal(JSON.parse(storage.store.get(BACKUP_SCHEDULE_POLICY_STORAGE_KEY)!).scheduledTime, DEFAULT_BACKUP_SCHEDULE_POLICY.scheduledTime);
});

test('a stored policy with missing or malformed fields is repaired field by field on read', () => {
  const storage = createStorage({
    [BACKUP_SCHEDULE_POLICY_STORAGE_KEY]: JSON.stringify({ enabled: false, scheduledTime: 'noon', requireEncrypted: 'yes' })
  });
  const policy = withWindow(storage, () => readBackupSchedulePolicy());
  assert.equal(policy.enabled, false, 'valid field is kept');
  assert.equal(policy.scheduledTime, DEFAULT_BACKUP_SCHEDULE_POLICY.scheduledTime, 'malformed time falls back');
  assert.equal(policy.requireEncrypted, DEFAULT_BACKUP_SCHEDULE_POLICY.requireEncrypted, 'non-boolean falls back');
  assert.equal(policy.requireExternalStorage, DEFAULT_BACKUP_SCHEDULE_POLICY.requireExternalStorage, 'missing field falls back');
});

test('corrupt JSON in storage falls back to the defaults and logs a warning instead of throwing', () => {
  const storage = createStorage({ [BACKUP_SCHEDULE_POLICY_STORAGE_KEY]: '{not json' });
  const { result, warnings } = silenceWarn(() => withWindow(storage, () => readBackupSchedulePolicy()));
  assert.deepEqual(result, DEFAULT_BACKUP_SCHEDULE_POLICY);
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /Failed to read backup schedule policy/);
});

test('a storage that throws on read (blocked / private mode) falls back to the defaults', () => {
  const throwing = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('SecurityError'); }
  };
  const { result, warnings } = silenceWarn(() => withWindow(throwing, () => readBackupSchedulePolicy()));
  assert.deepEqual(result, DEFAULT_BACKUP_SCHEDULE_POLICY);
  assert.equal(warnings.length, 1);
});
