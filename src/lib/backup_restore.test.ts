import { test } from 'node:test';
import assert from 'node:assert';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { DRUG_SCHEMA } from '../db/schema.ts';
import {
  BACKUP_APP_ID,
  BACKUP_FORMAT_VERSION,
  BackupRestoreError,
  importDatabaseBackup,
  type YakurekiBackup
} from './backup.ts';
import { ROLLBACK_ALSO_FAILED_NOTE } from './audit_guard.ts';

// 実際の RxDB(メモリ)で、バックアップの復旧が「全部書けたときだけ反映される」ことを確かめる。
async function createDb() {
  const db: any = await createRxDatabase({ name: `restore${Date.now()}${Math.random().toString(36).slice(2, 8)}`, storage: getRxStorageMemory() });
  const schema = (title: string, primaryKey: string, extra: Record<string, unknown> = {}) => ({
    title, version: 0, primaryKey, type: 'object',
    properties: { [primaryKey]: { type: 'string', maxLength: 100 }, ...extra }, required: [primaryKey]
  });
  await db.addCollections({
    patients: { schema: schema('patient', 'patientId', { name: { type: 'string' }, note: { type: 'string' } }) },
    visits: { schema: schema('visit', 'visitId', { patientId: { type: 'string' }, status: { type: 'string' } }) },
    drugs: { schema: { ...DRUG_SCHEMA, version: 0 } }
  } as any);
  return db;
}

const rowsOf = async (collection: any) => (await collection.find().exec()).map((doc: any) => doc.toJSON()).sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

function backupOf(collections: YakurekiBackup['collections'], localSettings?: Record<string, unknown>): YakurekiBackup {
  return { app: BACKUP_APP_ID, formatVersion: BACKUP_FORMAT_VERSION, createdAt: '2026-10-01T00:00:00.000Z', collections, ...(localSettings ? { localSettings } : {}) };
}

const DRUG = {
  code: 'D1', name: 'アムロジピン錠', isGeneric: true, price: 10, stockQuantity: 5, reorderPoint: 30
};

async function seed(db: any) {
  await db.patients.bulkInsert([{ patientId: 'p1', name: '現在の山田', note: '現在のメモ' }, { patientId: 'p9', name: '触らない患者' }]);
  await db.visits.insert({ visitId: 'v1', patientId: 'p1', status: 'completed' });
  await db.drugs.insert(DRUG);
}

test('importDatabaseBackup updates the rows in the backup, adds new ones, and leaves other rows alone', async () => {
  const db = await createDb();
  try {
    await seed(db);
    const backup = backupOf({
      patients: [{ patientId: 'p1', name: 'バックアップの山田' }, { patientId: 'p2', name: '新しい患者' }],
      drugs: [{ ...DRUG, price: 9, stockQuantity: 50 }]
    });

    const result = await importDatabaseBackup(db, backup);

    assert.strictEqual(result.totalRows, 3);
    assert.deepStrictEqual(await rowsOf(db.patients), [
      { patientId: 'p1', name: 'バックアップの山田' }, // 行ごと置き換わる(バックアップに無い項目 note は消える)
      { patientId: 'p2', name: '新しい患者' },
      { patientId: 'p9', name: '触らない患者' }
    ].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    assert.strictEqual((await db.drugs.findOne('D1').exec()).price, 9);
  } finally { await db.close(); }
});

// visits の書き込みだけ「1行書けて、その後エラー」にする(途中まで書けた状態を作る)
function failingVisits(db: any) {
  const real = db.visits;
  let calls = 0;
  return {
    patients: db.patients, drugs: db.drugs,
    visits: {
      findByIds: (ids: string[]) => real.findByIds(ids),
      bulkRemove: (ids: string[]) => real.bulkRemove(ids),
      // 最初の書き込み(復旧)だけ失敗する。取り消しの書き込み(2回目以降)は通る
      bulkUpsert: async (rows: any[]) => {
        calls += 1;
        if (calls > 1) return real.bulkUpsert(rows);
        await real.bulkUpsert(rows.slice(0, 1));
        return { error: [new Error('write failed')] };
      }
    }
  };
}

test('importDatabaseBackup puts every collection back to its pre-restore state when a later collection fails', async () => {
  const db = await createDb();
  try {
    await seed(db);
    const before = { patients: await rowsOf(db.patients), visits: await rowsOf(db.visits), drugs: await rowsOf(db.drugs) };
    const backup = backupOf({
      patients: [{ patientId: 'p1', name: 'バックアップの山田' }, { patientId: 'p2', name: '新しい患者' }],
      visits: [{ visitId: 'v1', patientId: 'p1', status: 'processing' }, { visitId: 'v2', patientId: 'p2', status: 'processing' }],
      drugs: [{ ...DRUG, price: 9 }]
    });

    await assert.rejects(
      () => importDatabaseBackup(failingVisits(db) as any, backup),
      (error: unknown) => error instanceof BackupRestoreError && error.rollbackFailed === false
        && /visits の復旧で 1件の書き込みに失敗しました。 復旧前の状態へ戻しました。$/.test(error.message)
    );

    assert.deepStrictEqual({ patients: await rowsOf(db.patients), visits: await rowsOf(db.visits), drugs: await rowsOf(db.drugs) }, before,
      'patients (updated and added), the partly written visits and nothing else are as they were');
  } finally { await db.close(); }
});

test('importDatabaseBackup says so when the pre-restore state cannot be brought back', async () => {
  const db = await createDb();
  try {
    await seed(db);
    const broken = failingVisits(db);
    const patients = { ...db.patients, findByIds: (ids: string[]) => db.patients.findByIds(ids), bulkUpsert: (rows: any[]) => db.patients.bulkUpsert(rows),
      bulkRemove: async () => { throw new Error('storage unavailable'); } };

    await assert.rejects(
      () => importDatabaseBackup({ ...broken, patients } as any, backupOf({
        patients: [{ patientId: 'p2', name: '新しい患者' }],
        visits: [{ visitId: 'v2', patientId: 'p2', status: 'processing' }]
      })),
      (error: unknown) => error instanceof BackupRestoreError && error.rollbackFailed === true && error.message.endsWith(ROLLBACK_ALSO_FAILED_NOTE)
    );

    assert.strictEqual((await db.visits.findOne('v2').exec()), null, 'the other steps were still undone');
  } finally { await db.close(); }
});

test('importDatabaseBackup applies the local settings only after every collection was restored', async () => {
  const store: Record<string, string> = { yakureki_backup_schedule_policy: 'before' };
  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = { localStorage: {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; }
  } };
  const db = await createDb();
  try {
    await seed(db);
    const backup = backupOf({ visits: [{ visitId: 'v2', patientId: 'p1', status: 'x' }] }, { yakureki_backup_schedule_policy: 'from-backup' });

    await assert.rejects(() => importDatabaseBackup(failingVisits(db) as any, backup), BackupRestoreError);
    assert.strictEqual(store.yakureki_backup_schedule_policy, 'before', 'a failed restore leaves the settings of this browser alone');

    await importDatabaseBackup(db, backup);
    assert.strictEqual(store.yakureki_backup_schedule_policy, 'from-backup');
  } finally {
    (globalThis as any).window = previousWindow;
    await db.close();
  }
});

test('importDatabaseBackup detects bulkRemove error during rollback and marks rollbackFailed true', async () => {
  const db = await createDb();
  try {
    await seed(db);

    // ストレージ層の bulkWrite を差し替え、rx-collection-bulk-remove 時に 409 エラーを返させて取り消し失敗を再現する
    const storage = db.patients.storageInstance;
    const origBulkWrite = storage.bulkWrite.bind(storage);
    storage.bulkWrite = async (rows: any[], context: string) =>
      context === 'rx-collection-bulk-remove'
        ? { error: rows.map((r: any) => ({ status: 409, isError: true, documentId: r.document.patientId, writeRow: r, documentInDb: r.previous })) }
        : origBulkWrite(rows, context);

    // patients に新規患者 p2 を追加し、後続の visits で書き込み失敗を発生させる
    const broken = failingVisits(db);
    const backup = backupOf({
      patients: [{ patientId: 'p2', name: '新しい患者' }],
      visits: [{ visitId: 'v2', patientId: 'p2', status: 'processing' }]
    });

    await assert.rejects(
      () => importDatabaseBackup({ ...broken, patients: db.patients } as any, backup),
      (error: unknown) => error instanceof BackupRestoreError && error.rollbackFailed === true && error.message.endsWith(ROLLBACK_ALSO_FAILED_NOTE)
    );

    // bulkRemove が失敗したため、新規追加された p2 は削除されずに DB に残存する
    const patient2 = await db.patients.findOne('p2').exec();
    assert.notStrictEqual(patient2, null, 'new patient remains when bulkRemove rollback fails');
  } finally {
    await db.close();
  }
});

