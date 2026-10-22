import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decodeTransportPayload, encodeTransportPayload, extractBearerToken, isSameOriginJsonRequest } from './sync_http.ts';

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

test('isSameOriginJsonRequest accepts same-origin JSON posts and requests without an Origin header', () => {
  const headers = (init: Record<string, string>) => new Headers(init);
  assert.equal(isSameOriginJsonRequest(headers({ 'content-type': 'application/json', origin: 'http://127.0.0.1:3402', host: '127.0.0.1:3402' })), true);
  assert.equal(isSameOriginJsonRequest(headers({ 'content-type': 'application/json; charset=utf-8', host: '127.0.0.1:3402' })), true);
});

test('isSameOriginJsonRequest rejects cross-site pages and non-JSON "simple" requests', () => {
  const headers = (init: Record<string, string>) => new Headers(init);
  assert.equal(isSameOriginJsonRequest(headers({ 'content-type': 'application/json', origin: 'https://evil.example', host: '127.0.0.1:3402' })), false);
  assert.equal(isSameOriginJsonRequest(headers({ 'content-type': 'application/json', origin: 'http://127.0.0.1:9999', host: '127.0.0.1:3402' })), false);
  assert.equal(isSameOriginJsonRequest(headers({ 'content-type': 'text/plain', origin: 'http://127.0.0.1:3402', host: '127.0.0.1:3402' })), false);
  assert.equal(isSameOriginJsonRequest(headers({ origin: 'http://127.0.0.1:3402', host: '127.0.0.1:3402' })), false);
  assert.equal(isSameOriginJsonRequest(headers({ 'content-type': 'application/json', origin: 'null', host: '127.0.0.1:3402' })), false);
});
