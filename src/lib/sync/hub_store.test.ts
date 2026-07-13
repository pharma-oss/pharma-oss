import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { generateTerminalToken, HUB_LOCAL_TERMINAL_ID, isValidHubEncryptionKey, openHubStore } from './hub_store.ts';

function createTestStore() {
  return openHubStore({ dbPath: ':memory:', encryptionKey: randomBytes(32) });
}

test('isValidHubEncryptionKey requires exactly 32 bytes', () => {
  assert.equal(isValidHubEncryptionKey(randomBytes(32)), true);
  assert.equal(isValidHubEncryptionKey(randomBytes(16)), false);
  assert.equal(isValidHubEncryptionKey(randomBytes(64)), false);
});

test('openHubStore rejects an invalid encryption key length', () => {
  assert.throws(() => openHubStore({ dbPath: ':memory:', encryptionKey: randomBytes(16) }));
});

test('push then pull round-trips a new document', () => {
  const store = createTestStore();
  try {
    const conflicts = store.push('patients', HUB_LOCAL_TERMINAL_ID, [{
      docId: 'p1',
      newDocumentState: { patientId: 'p1', name: '山田太郎', _deleted: false }
    }]);
    assert.deepEqual(conflicts, []);

    const result = store.pull('patients', 0, 100);
    assert.equal(result.documents.length, 1);
    assert.deepEqual(result.documents[0], { patientId: 'p1', name: '山田太郎', _deleted: false });
    assert.ok(result.checkpoint.seq > 0);
  } finally {
    store.close();
  }
});

test('pull only returns documents newer than the given checkpoint', () => {
  const store = createTestStore();
  try {
    store.push('patients', HUB_LOCAL_TERMINAL_ID, [
      { docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } }
    ]);
    const firstPull = store.pull('patients', 0, 100);
    const checkpointAfterFirst = firstPull.checkpoint.seq;

    store.push('patients', HUB_LOCAL_TERMINAL_ID, [
      { docId: 'p2', newDocumentState: { patientId: 'p2', name: 'B', _deleted: false } }
    ]);

    const secondPull = store.pull('patients', checkpointAfterFirst, 100);
    assert.equal(secondPull.documents.length, 1);
    assert.equal(secondPull.documents[0].patientId, 'p2');
  } finally {
    store.close();
  }
});

test('pull respects the batch limit and reports the checkpoint of the last returned row', () => {
  const store = createTestStore();
  try {
    store.push('patients', HUB_LOCAL_TERMINAL_ID, [
      { docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } },
      { docId: 'p2', newDocumentState: { patientId: 'p2', name: 'B', _deleted: false } },
      { docId: 'p3', newDocumentState: { patientId: 'p3', name: 'C', _deleted: false } }
    ]);

    const firstBatch = store.pull('patients', 0, 2);
    assert.equal(firstBatch.documents.length, 2);

    const secondBatch = store.pull('patients', firstBatch.checkpoint.seq, 2);
    assert.equal(secondBatch.documents.length, 1);
    assert.equal(secondBatch.documents[0].patientId, 'p3');
  } finally {
    store.close();
  }
});

test('push accepts an update whose assumedMasterState matches the current master document', () => {
  const store = createTestStore();
  try {
    store.push('patients', HUB_LOCAL_TERMINAL_ID, [
      { docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } }
    ]);
    const afterInsert = store.pull('patients', 0, 100).documents[0];

    const conflicts = store.push('patients', HUB_LOCAL_TERMINAL_ID, [{
      docId: 'p1',
      newDocumentState: { patientId: 'p1', name: 'A-updated', _deleted: false },
      assumedMasterState: afterInsert
    }]);
    assert.deepEqual(conflicts, []);

    const result = store.pull('patients', 0, 100);
    assert.equal(result.documents[0].name, 'A-updated');
  } finally {
    store.close();
  }
});

test('push reports a conflict and preserves the master document when assumedMasterState is stale', () => {
  const store = createTestStore();
  try {
    store.push('patients', 'terminal-a', [
      { docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } }
    ]);
    const originalState = store.pull('patients', 0, 100).documents[0];

    // Another terminal updates the document first, moving the master state forward.
    store.push('patients', 'terminal-b', [{
      docId: 'p1',
      newDocumentState: { patientId: 'p1', name: 'B-won', _deleted: false },
      assumedMasterState: originalState
    }]);

    // terminal-a still assumes the original (now stale) state.
    const conflicts = store.push('patients', 'terminal-a', [{
      docId: 'p1',
      newDocumentState: { patientId: 'p1', name: 'A-lost', _deleted: false },
      assumedMasterState: originalState
    }]);

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].name, 'B-won');

    const master = store.pull('patients', 0, 100).documents[0];
    assert.equal(master.name, 'B-won', 'master document must not be overwritten by the losing push');

    const conflictLog = store.listConflicts({ collection: 'patients' });
    assert.equal(conflictLog.length, 1);
    assert.equal(conflictLog[0].terminalId, 'terminal-a');
    assert.equal(conflictLog[0].losingDocumentState.name, 'A-lost');
    assert.equal(conflictLog[0].resolvedAt, undefined);
  } finally {
    store.close();
  }
});

test('resolveConflict marks a conflict as resolved', () => {
  const store = createTestStore();
  try {
    store.push('patients', 'terminal-a', [
      { docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } }
    ]);
    const originalState = store.pull('patients', 0, 100).documents[0];
    store.push('patients', 'terminal-b', [{
      docId: 'p1',
      newDocumentState: { patientId: 'p1', name: 'B-won', _deleted: false },
      assumedMasterState: originalState
    }]);
    store.push('patients', 'terminal-a', [{
      docId: 'p1',
      newDocumentState: { patientId: 'p1', name: 'A-lost', _deleted: false },
      assumedMasterState: originalState
    }]);

    const [conflict] = store.listConflicts({ collection: 'patients', resolved: false });
    store.resolveConflict(conflict.id, '薬剤師A');

    const unresolved = store.listConflicts({ collection: 'patients', resolved: false });
    const resolved = store.listConflicts({ collection: 'patients', resolved: true });
    assert.equal(unresolved.length, 0);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].resolvedBy, '薬剤師A');
  } finally {
    store.close();
  }
});

test('a document deletion (_deleted: true) round-trips through push/pull', () => {
  const store = createTestStore();
  try {
    store.push('patients', HUB_LOCAL_TERMINAL_ID, [
      { docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } }
    ]);
    const afterInsert = store.pull('patients', 0, 100).documents[0];
    store.push('patients', HUB_LOCAL_TERMINAL_ID, [{
      docId: 'p1',
      newDocumentState: { patientId: 'p1', name: 'A', _deleted: true },
      assumedMasterState: afterInsert
    }]);

    const result = store.pull('patients', 0, 100);
    assert.equal(result.documents[0]._deleted, true);
  } finally {
    store.close();
  }
});

test('registerTerminal issues a token that verifyTerminal accepts, and rejects a wrong token', () => {
  const store = createTestStore();
  try {
    const { token } = store.registerTerminal('satellite-1', 'レジ横端末');
    assert.equal(store.verifyTerminal('satellite-1', token), true);
    assert.equal(store.verifyTerminal('satellite-1', 'wrong-token'), false);
    assert.equal(store.verifyTerminal('unknown-terminal', token), false);
  } finally {
    store.close();
  }
});

test('registerTerminal refuses to re-register an existing terminal id', () => {
  const store = createTestStore();
  try {
    store.registerTerminal('satellite-1', 'レジ横端末');
    assert.throws(() => store.registerTerminal('satellite-1', 'レジ横端末'));
  } finally {
    store.close();
  }
});

test('rotateTerminalToken invalidates the previous token and issues a working new one', () => {
  const store = createTestStore();
  try {
    const { token: firstToken } = store.registerTerminal('satellite-1', 'レジ横端末');
    const { token: secondToken } = store.rotateTerminalToken('satellite-1');
    assert.equal(store.verifyTerminal('satellite-1', firstToken), false);
    assert.equal(store.verifyTerminal('satellite-1', secondToken), true);
  } finally {
    store.close();
  }
});

test('rotateTerminalToken creates the terminal when it does not already exist', () => {
  const store = createTestStore();
  try {
    const { token } = store.rotateTerminalToken(HUB_LOCAL_TERMINAL_ID, 'ハブ本体');
    assert.equal(store.verifyTerminal(HUB_LOCAL_TERMINAL_ID, token), true);
  } finally {
    store.close();
  }
});

test('revokeTerminal blocks future verification', () => {
  const store = createTestStore();
  try {
    const { token } = store.registerTerminal('satellite-1', 'レジ横端末');
    store.revokeTerminal('satellite-1');
    assert.equal(store.verifyTerminal('satellite-1', token), false);
  } finally {
    store.close();
  }
});

test('listTerminals reports registration and push activity', () => {
  const store = createTestStore();
  try {
    store.registerTerminal('satellite-1', 'レジ横端末');
    store.push('patients', 'satellite-1', [
      { docId: 'p1', newDocumentState: { patientId: 'p1', name: 'A', _deleted: false } }
    ]);
    const [terminal] = store.listTerminals();
    assert.equal(terminal.terminalId, 'satellite-1');
    assert.equal(terminal.label, 'レジ横端末');
    assert.ok(terminal.lastSeenAt);
    assert.ok(typeof terminal.lastPushedSeq === 'number' && terminal.lastPushedSeq > 0);
    assert.equal(terminal.revokedAt, undefined);
  } finally {
    store.close();
  }
});

test('generateTerminalToken returns unique, sufficiently long tokens', () => {
  const a = generateTerminalToken();
  const b = generateTerminalToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 32);
});
