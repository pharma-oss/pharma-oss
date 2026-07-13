import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { openHubStore } from './hub_store.ts';
import { isValidTerminalId, listTerminals, registerTerminal, revokeTerminal, rotateTerminalToken } from './terminal_admin.ts';

function createTestStore() {
  return openHubStore({ dbPath: ':memory:', encryptionKey: randomBytes(32) });
}

test('isValidTerminalId accepts alnum/hyphen/underscore ids and rejects others', () => {
  assert.equal(isValidTerminalId('satellite-1'), true);
  assert.equal(isValidTerminalId('reg_2'), true);
  assert.equal(isValidTerminalId('a'), false);
  assert.equal(isValidTerminalId(''), false);
  assert.equal(isValidTerminalId('端末1'), false);
  assert.equal(isValidTerminalId('has space'), false);
});

test('registerTerminal validates id and label, then returns a usable token', () => {
  const store = createTestStore();
  try {
    const badId = registerTerminal(store, '!', 'レジ横');
    assert.equal(badId.ok, false);
    assert.equal(badId.ok === false && badId.status, 400);

    const badLabel = registerTerminal(store, 'satellite-1', '  ');
    assert.equal(badLabel.ok, false);

    const result = registerTerminal(store, 'satellite-1', 'レジ横端末');
    assert.equal(result.ok, true);
    assert.ok(result.ok && result.status === 201);
    assert.ok(result.ok && result.body.token.length > 0);
    assert.equal(store.verifyTerminal('satellite-1', result.ok ? result.body.token : ''), true);
  } finally {
    store.close();
  }
});

test('registerTerminal returns 409 for a duplicate terminal id', () => {
  const store = createTestStore();
  try {
    registerTerminal(store, 'satellite-1', 'レジ横端末');
    const duplicate = registerTerminal(store, 'satellite-1', '別のラベル');
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.ok === false && duplicate.status, 409);
  } finally {
    store.close();
  }
});

test('rotateTerminalToken invalidates the old token', () => {
  const store = createTestStore();
  try {
    const registered = registerTerminal(store, 'satellite-1', 'レジ横端末');
    const oldToken = registered.ok ? registered.body.token : '';
    const rotated = rotateTerminalToken(store, 'satellite-1');
    assert.equal(rotated.ok, true);
    const newToken = rotated.ok ? rotated.body.token : '';
    assert.notEqual(oldToken, newToken);
    assert.equal(store.verifyTerminal('satellite-1', oldToken), false);
    assert.equal(store.verifyTerminal('satellite-1', newToken), true);
  } finally {
    store.close();
  }
});

test('revokeTerminal blocks further verification and listTerminals reflects it', () => {
  const store = createTestStore();
  try {
    const registered = registerTerminal(store, 'satellite-1', 'レジ横端末');
    const token = registered.ok ? registered.body.token : '';
    const revoked = revokeTerminal(store, 'satellite-1');
    assert.equal(revoked.ok, true);
    assert.equal(store.verifyTerminal('satellite-1', token), false);

    const listed = listTerminals(store);
    assert.ok(listed.ok);
    const [terminal] = listed.ok ? listed.body.terminals : [];
    assert.ok(terminal.revokedAt);
  } finally {
    store.close();
  }
});
