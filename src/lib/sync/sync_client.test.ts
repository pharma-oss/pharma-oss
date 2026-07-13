import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { openHubStore } from './hub_store.ts';
import { getSyncStatus, performSyncPull, performSyncPush } from './sync_client.ts';
import type { PharmacySyncEnv } from './sync_config.ts';

const VALID_HUB_KEY = randomBytes(32).toString('hex');

function createTestStore() {
  return openHubStore({ dbPath: ':memory:', encryptionKey: randomBytes(32) });
}

test('performSyncPull returns 404 when role is standalone', async () => {
  const result = await performSyncPull('patients', 0, 100, { env: {} });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.status, 404);
});

test('performSyncPull returns 400 for an unknown collection', async () => {
  const env: PharmacySyncEnv = { PHARMACY_SYNC_ROLE: 'hub', PHARMACY_SYNC_HUB_ENCRYPTION_KEY: VALID_HUB_KEY };
  const store = createTestStore();
  try {
    const result = await performSyncPull('not_a_collection', 0, 100, { env, getHubStore: () => store });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.status, 400);
  } finally {
    store.close();
  }
});

test('performSyncPull (hub role) reads directly from the injected hub store', async () => {
  const env: PharmacySyncEnv = { PHARMACY_SYNC_ROLE: 'hub', PHARMACY_SYNC_HUB_ENCRYPTION_KEY: VALID_HUB_KEY };
  const store = createTestStore();
  try {
    store.push('patients', 'hub-local', [
      { docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } }
    ]);
    const result = await performSyncPull('patients', 0, 100, { env, getHubStore: () => store });
    assert.equal(result.ok, true);
    assert.ok(result.ok && result.body.documents.length === 1);
  } finally {
    store.close();
  }
});

function satelliteEnv(overrides: Partial<PharmacySyncEnv> = {}): PharmacySyncEnv {
  return {
    PHARMACY_SYNC_ROLE: 'satellite',
    PHARMACY_SYNC_HUB_ENDPOINT: 'http://127.0.0.1:3000',
    PHARMACY_SYNC_TERMINAL_ID: 'satellite-1',
    PHARMACY_SYNC_TERMINAL_TOKEN: 'secret-token',
    ...overrides
  };
}

test('performSyncPull (satellite role) forwards to the hub endpoint with Bearer auth', async () => {
  let capturedUrl: string | undefined;
  let capturedAuth: string | null | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedAuth = (init?.headers as Record<string, string>)?.Authorization;
    return new Response(JSON.stringify({ documents: [{ patientId: 'p1' }], checkpoint: { seq: 5 } }), { status: 200 });
  };

  const result = await performSyncPull('patients', 3, 50, { env: satelliteEnv(), fetchImpl });
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.body.checkpoint.seq === 5);
  assert.match(capturedUrl || '', /\/api\/sync\/remote\/pull\?/);
  assert.match(capturedUrl || '', /collection=patients/);
  assert.match(capturedUrl || '', /checkpoint=3/);
  assert.equal(capturedAuth, 'Bearer secret-token');
});

test('performSyncPull (satellite role) rejects pulling audit_logs (push-only from satellite)', async () => {
  const result = await performSyncPull('audit_logs', 0, 100, { env: satelliteEnv() });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.status, 403);
});

test('performSyncPull (satellite role) reports 503 when the hub is unreachable', async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error('network down');
  };
  const result = await performSyncPull('patients', 0, 100, { env: satelliteEnv(), fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.status, 503);
});

test('performSyncPull (satellite role) propagates a non-ok hub response as an error', async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ message: 'unauthorized' }), { status: 401 });
  const result = await performSyncPull('patients', 0, 100, { env: satelliteEnv(), fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.status, 401);
});

test('performSyncPull (satellite role) decrypts an aes-gcm encoded hub response', async () => {
  const transportKey = randomBytes(32).toString('hex');
  const { encodeTransportPayload } = await import('./sync_http.ts');
  const encoded = encodeTransportPayload(
    { documents: [{ patientId: 'p1' }], checkpoint: { seq: 9 } },
    'aes-gcm',
    Buffer.from(transportKey, 'hex')
  );
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify(encoded), { status: 200 });

  const result = await performSyncPull('patients', 0, 100, {
    env: satelliteEnv({ PHARMACY_SYNC_TRANSPORT_ENCRYPTION: 'aes-gcm', PHARMACY_SYNC_TRANSPORT_KEY: transportKey }),
    fetchImpl
  });
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.body.checkpoint.seq === 9);
});

test('performSyncPush (hub role) writes through the injected hub store', async () => {
  const env: PharmacySyncEnv = { PHARMACY_SYNC_ROLE: 'hub', PHARMACY_SYNC_HUB_ENCRYPTION_KEY: VALID_HUB_KEY };
  const store = createTestStore();
  try {
    const result = await performSyncPush('patients', [
      { docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } }
    ], { env, getHubStore: () => store });
    assert.equal(result.ok, true);
    assert.ok(result.ok && result.body.conflicts.length === 0);
    assert.equal(store.pull('patients', 0, 10).documents.length, 1);
  } finally {
    store.close();
  }
});

test('performSyncPush (satellite role) forwards the collection and rows to the hub', async () => {
  let capturedBody: unknown;
  const fetchImpl: typeof fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ conflicts: [] }), { status: 200 });
  };
  const result = await performSyncPush('patients', [
    { docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } }
  ], { env: satelliteEnv(), fetchImpl });
  assert.equal(result.ok, true);
  assert.deepEqual(capturedBody, {
    collection: 'patients',
    rows: [{ docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } }]
  });
});

test('getSyncStatus (standalone) reports the role with no extra fields', async () => {
  const result = await getSyncStatus({ env: {} });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.body, { role: 'standalone' });
});

test('getSyncStatus (hub) reports registered terminals and unresolved conflicts', async () => {
  const env: PharmacySyncEnv = { PHARMACY_SYNC_ROLE: 'hub', PHARMACY_SYNC_HUB_ENCRYPTION_KEY: VALID_HUB_KEY };
  const store = createTestStore();
  try {
    store.registerTerminal('satellite-1', 'レジ横端末');
    const result = await getSyncStatus({ env, getHubStore: () => store });
    assert.equal(result.ok, true);
    assert.ok(result.ok && result.body.role === 'hub' && result.body.terminals?.length === 1);
    assert.ok(result.ok && result.body.unresolvedConflictCount === 0);
  } finally {
    store.close();
  }
});

test('getSyncStatus (satellite) reports hub reachability', async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ documents: [], checkpoint: { seq: 0 } }), { status: 200 });
  const result = await getSyncStatus({ env: satelliteEnv(), fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.body.hubReachable, true);
});

test('getSyncStatus (satellite) reports unreachable when the hub cannot be contacted', async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error('network down');
  };
  const result = await getSyncStatus({ env: satelliteEnv(), fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.body.hubReachable, false);
});
