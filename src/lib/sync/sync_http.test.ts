import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decodeTransportPayload, encodeTransportPayload, extractBearerToken } from './sync_http.ts';

const KEY = randomBytes(32);

test('extractBearerToken parses a well-formed header', () => {
  assert.equal(extractBearerToken('Bearer abc123'), 'abc123');
  assert.equal(extractBearerToken('bearer   abc123  '), 'abc123');
});

test('extractBearerToken returns null for missing or malformed headers', () => {
  assert.equal(extractBearerToken(null), null);
  assert.equal(extractBearerToken('Basic abc123'), null);
  assert.equal(extractBearerToken(''), null);
});

test('encodeTransportPayload/decodeTransportPayload round-trip in aes-gcm mode', () => {
  const original = { documents: [{ patientId: 'p1' }], checkpoint: { seq: 3 } };
  const encoded = encodeTransportPayload(original, 'aes-gcm', KEY);
  assert.notDeepEqual(encoded, original);
  const decoded = decodeTransportPayload<typeof original>(encoded, 'aes-gcm', KEY);
  assert.deepEqual(decoded, original);
});

test('encodeTransportPayload passes the value through unchanged in none mode', () => {
  const original = { documents: [], checkpoint: { seq: 0 } };
  const encoded = encodeTransportPayload(original, 'none');
  assert.deepEqual(encoded, original);
  const decoded = decodeTransportPayload<typeof original>(encoded, 'none');
  assert.deepEqual(decoded, original);
});

test('decodeTransportPayload rejects encrypted input when running in none mode', () => {
  const encoded = encodeTransportPayload({ a: 1 }, 'aes-gcm', KEY);
  assert.throws(() => decodeTransportPayload(encoded, 'none'));
});

test('decodeTransportPayload rejects plain input when aes-gcm mode is expected', () => {
  assert.throws(() => decodeTransportPayload({ a: 1 }, 'aes-gcm', KEY));
});

test('decodeTransportPayload fails with a different key than was used to encrypt', () => {
  const encoded = encodeTransportPayload({ a: 1 }, 'aes-gcm', KEY);
  assert.throws(() => decodeTransportPayload(encoded, 'aes-gcm', randomBytes(32)));
});
