import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { openHubStore } from './hub_store.ts';
import { handleRemotePull, handleRemotePush } from './sync_remote.ts';
import { encodeTransportPayload } from './sync_http.ts';

function createTestStore() {
  const store = openHubStore({ dbPath: ':memory:', encryptionKey: randomBytes(32) });
  const { token } = store.registerTerminal('satellite-1', 'レジ横端末');
  return { store, token };
}

test('handleRemotePull rejects a missing Authorization header', () => {
  const { store } = createTestStore();
  try {
    const result = handleRemotePull({
      authorizationHeader: null,
      terminalId: 'satellite-1',
      store,
      collection: 'patients',
      checkpointSeq: 0,
      batchSize: 100,
      transportEncryption: 'none'
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.status, 401);
  } finally {
    store.close();
  }
});

test('handleRemotePull rejects an invalid token', () => {
  const { store } = createTestStore();
  try {
    const result = handleRemotePull({
      authorizationHeader: 'Bearer wrong-token',
      terminalId: 'satellite-1',
      store,
      collection: 'patients',
      checkpointSeq: 0,
      batchSize: 100,
      transportEncryption: 'none'
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.status, 401);
  } finally {
    store.close();
  }
});

test('handleRemotePull rejects an unknown collection name', () => {
  const { store, token } = createTestStore();
  try {
    const result = handleRemotePull({
      authorizationHeader: `Bearer ${token}`,
      terminalId: 'satellite-1',
      store,
      collection: 'not_a_real_collection',
      checkpointSeq: 0,
      batchSize: 100,
      transportEncryption: 'none'
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.status, 400);
  } finally {
    store.close();
  }
});

test('handleRemotePull returns pulled documents for a valid authenticated request', () => {
  const { store, token } = createTestStore();
  try {
    store.push('patients', 'satellite-1', [
      { docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } }
    ]);
    const result = handleRemotePull({
      authorizationHeader: `Bearer ${token}`,
      terminalId: 'satellite-1',
      store,
      collection: 'patients',
      checkpointSeq: 0,
      batchSize: 100,
      transportEncryption: 'none'
    });
    assert.equal(result.ok, true);
    const body = result.ok ? (result.body as { documents: unknown[] }) : { documents: [] };
    assert.equal(body.documents.length, 1);
  } finally {
    store.close();
  }
});

test('handleRemotePull encrypts the response body when transport encryption is aes-gcm', () => {
  const { store, token } = createTestStore();
  const transportKey = randomBytes(32);
  try {
    store.push('patients', 'satellite-1', [
      { docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } }
    ]);
    const result = handleRemotePull({
      authorizationHeader: `Bearer ${token}`,
      terminalId: 'satellite-1',
      store,
      collection: 'patients',
      checkpointSeq: 0,
      batchSize: 100,
      transportEncryption: 'aes-gcm',
      transportKey
    });
    assert.equal(result.ok, true);
    assert.ok(result.ok && typeof (result.body as { encrypted: string }).encrypted === 'string');
  } finally {
    store.close();
  }
});

test('handleRemotePush rejects an unauthenticated request', () => {
  const { store } = createTestStore();
  try {
    const result = handleRemotePush({
      authorizationHeader: null,
      terminalId: null,
      store,
      rawBody: { collection: 'patients', rows: [] },
      transportEncryption: 'none'
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.status, 401);
  } finally {
    store.close();
  }
});

test('handleRemotePush applies rows and reports terminalId as the pusher', () => {
  const { store, token } = createTestStore();
  try {
    const result = handleRemotePush({
      authorizationHeader: `Bearer ${token}`,
      terminalId: 'satellite-1',
      store,
      rawBody: {
        collection: 'patients',
        rows: [{ docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } }]
      },
      transportEncryption: 'none'
    });
    assert.equal(result.ok, true);
    const body = result.ok ? (result.body as { conflicts: unknown[] }) : { conflicts: [] };
    assert.deepEqual(body.conflicts, []);

    const [terminal] = store.listTerminals();
    assert.equal(terminal.lastPushedSeq !== undefined, true);
  } finally {
    store.close();
  }
});

test('handleRemotePush round-trips an aes-gcm encrypted request and response', () => {
  const { store, token } = createTestStore();
  const transportKey = randomBytes(32);
  try {
    const encryptedBody = encodeTransportPayload(
      { collection: 'patients', rows: [{ docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } }] },
      'aes-gcm',
      transportKey
    );
    const result = handleRemotePush({
      authorizationHeader: `Bearer ${token}`,
      terminalId: 'satellite-1',
      store,
      rawBody: encryptedBody,
      transportEncryption: 'aes-gcm',
      transportKey
    });
    assert.equal(result.ok, true);
    assert.ok(result.ok && typeof (result.body as { encrypted: string }).encrypted === 'string');

    const stored = store.pull('patients', 0, 10);
    assert.equal(stored.documents.length, 1);
  } finally {
    store.close();
  }
});

test('handleRemotePush returns a conflict when assumedMasterState is stale', () => {
  const { store, token } = createTestStore();
  try {
    store.push('patients', 'satellite-1', [
      { docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } }
    ]);
    const original = store.pull('patients', 0, 10).documents[0];
    store.push('patients', 'other-terminal', [{
      docId: 'p1',
      newDocumentState: { patientId: 'p1', name: 'B-won', _deleted: false },
      assumedMasterState: original
    }]);

    const result = handleRemotePush({
      authorizationHeader: `Bearer ${token}`,
      terminalId: 'satellite-1',
      store,
      rawBody: {
        collection: 'patients',
        rows: [{ docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A-lost', _deleted: false }, assumedMasterState: original }]
      },
      transportEncryption: 'none'
    });
    assert.equal(result.ok, true);
    const body = result.ok ? (result.body as { conflicts: Record<string, unknown>[] }) : { conflicts: [] };
    assert.equal(body.conflicts.length, 1);
  } finally {
    store.close();
  }
});
