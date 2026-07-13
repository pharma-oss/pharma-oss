import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { wrappedKeyEncryptionCryptoJsStorage } from 'rxdb/plugins/encryption-crypto-js';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { PATIENT_SCHEMA } from '@/db/schema';
import type { PharmacyDatabase } from '@/db/types';
import { openHubStore, type HubStore } from './hub_store.ts';
import { performSyncPull, performSyncPush } from './sync_client.ts';
import { startReplication } from './replication_client.ts';
import type { PharmacySyncEnv } from './sync_config.ts';

addRxPlugin(RxDBMigrationSchemaPlugin);
addRxPlugin(RxDBDevModePlugin);
const keepDocument = (oldDoc: unknown) => oldDoc;

async function createPatientsOnlyDatabase(): Promise<PharmacyDatabase> {
  const storageWithValidation = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
  const storageWithEncryption = wrappedKeyEncryptionCryptoJsStorage({ storage: storageWithValidation });
  const db = await createRxDatabase({
    name: `replication_test_${Date.now()}_${randomBytes(4).toString('hex')}`,
    password: randomBytes(32).toString('hex'),
    storage: storageWithEncryption,
    ignoreDuplicate: true
  });
  await db.addCollections({
    patients: {
      schema: PATIENT_SCHEMA,
      migrationStrategies: { 1: keepDocument, 2: keepDocument, 3: keepDocument }
    }
  });
  return db as unknown as PharmacyDatabase;
}

function buildHubBackedFetch(store: HubStore): typeof fetch {
  // hub roleはPHARMACY_SYNC_HUB_ENCRYPTION_KEYが無いと設定エラー(500)になり、
  // pullハンドラが例外→無限リトライでawaitInitialReplication()が永久に解決しない。
  const env: PharmacySyncEnv = {
    PHARMACY_SYNC_ROLE: 'hub',
    PHARMACY_SYNC_HUB_ENCRYPTION_KEY: randomBytes(32).toString('hex')
  };
  const getHubStore = () => store;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/sync/pull') {
      const result = await performSyncPull(
        url.searchParams.get('collection') || '',
        Number(url.searchParams.get('checkpoint') || '0'),
        Number(url.searchParams.get('batchSize') || '200'),
        { env, getHubStore }
      );
      return new Response(JSON.stringify(result.body), { status: result.status });
    }
    if (url.pathname === '/api/sync/push') {
      const parsedBody = JSON.parse(String(init?.body)) as { collection: string; rows: Parameters<typeof performSyncPush>[1] };
      const result = await performSyncPush(parsedBody.collection, parsedBody.rows, { env, getHubStore });
      return new Response(JSON.stringify(result.body), { status: result.status });
    }
    throw new Error(`unexpected fetch to ${url.pathname}`);
  };
}

async function waitUntil(predicate: () => Promise<boolean> | boolean, timeoutMs = 5000, intervalMs = 20): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('waitUntil timed out');
}

test('a local insert on the satellite replica propagates to the hub store', async () => {
  const store = openHubStore({ dbPath: ':memory:', encryptionKey: randomBytes(32) });
  const db = await createPatientsOnlyDatabase();
  const fetchImpl = buildHubBackedFetch(store);
  const handle = startReplication(db, { role: 'satellite', fetchImpl, collections: ['patients'], retryTimeMs: 200, pollIntervalMs: 100 });
  try {
    await handle.awaitInitialReplication();

    await db.patients.insert({ patientId: 'p1', name: '山田太郎', kana: 'ヤマダタロウ', birthDate: '1980-01-01' });

    await waitUntil(() => store.pull('patients', 0, 10).documents.length === 1);
    const [hubDoc] = store.pull('patients', 0, 10).documents;
    assert.equal(hubDoc.patientId, 'p1');
    assert.equal(hubDoc.name, '山田太郎');
  } finally {
    await handle.cancel();
    await db.close();
    store.close();
  }
});

test('a document pushed to the hub store by another terminal reaches the satellite replica via polling', async () => {
  const store = openHubStore({ dbPath: ':memory:', encryptionKey: randomBytes(32) });
  const db = await createPatientsOnlyDatabase();
  const fetchImpl = buildHubBackedFetch(store);
  const handle = startReplication(db, { role: 'satellite', fetchImpl, collections: ['patients'], retryTimeMs: 200, pollIntervalMs: 100 });
  try {
    await handle.awaitInitialReplication();

    store.push('patients', 'other-terminal', [{
      docId: 'p2',
      newDocumentState: { patientId: 'p2', name: '佐藤花子', kana: 'サトウハナコ', birthDate: '1990-05-05', _deleted: false }
    }]);

    await waitUntil(async () => {
      const doc = await db.patients.findOne('p2').exec();
      return doc !== null;
    });
    const doc = await db.patients.findOne('p2').exec();
    assert.equal(doc?.name, '佐藤花子');
  } finally {
    await handle.cancel();
    await db.close();
    store.close();
  }
});

test('two satellite replicas converge to the hub-assigned winner on a concurrent write conflict', async () => {
  const store = openHubStore({ dbPath: ':memory:', encryptionKey: randomBytes(32) });
  const dbA = await createPatientsOnlyDatabase();
  const dbB = await createPatientsOnlyDatabase();
  const fetchImpl = buildHubBackedFetch(store);
  const handleA = startReplication(dbA, { role: 'satellite', fetchImpl, collections: ['patients'], retryTimeMs: 200, pollIntervalMs: 100 });
  const handleB = startReplication(dbB, { role: 'satellite', fetchImpl, collections: ['patients'], retryTimeMs: 200, pollIntervalMs: 100 });
  try {
    await handleA.awaitInitialReplication();
    await handleB.awaitInitialReplication();

    await dbA.patients.insert({ patientId: 'p3', name: '初期値', kana: 'ショキチ', birthDate: '2000-01-01' });
    await waitUntil(() => store.pull('patients', 0, 10).documents.some((d) => d.patientId === 'p3'));
    await waitUntil(async () => (await dbB.patients.findOne('p3').exec()) !== null);

    const docInB = await dbB.patients.findOne('p3').exec();
    await docInB!.patch({ name: 'Bが更新' });

    await waitUntil(() => {
      const master = store.pull('patients', 0, 10).documents.find((d) => d.patientId === 'p3');
      return master?.name === 'Bが更新';
    });

    await waitUntil(async () => {
      const doc = await dbA.patients.findOne('p3').exec();
      return doc?.name === 'Bが更新';
    });

    const finalA = await dbA.patients.findOne('p3').exec();
    const finalMaster = store.pull('patients', 0, 10).documents.find((d) => d.patientId === 'p3');
    assert.equal(finalA?.name, 'Bが更新');
    assert.equal(finalMaster?.name, 'Bが更新');
  } finally {
    await handleA.cancel();
    await handleB.cancel();
    await dbA.close();
    await dbB.close();
    store.close();
  }
});
