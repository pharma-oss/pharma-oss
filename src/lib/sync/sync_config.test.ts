import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { isAllowedHubEndpoint, resolvePharmacySyncConfig } from './sync_config.ts';

const VALID_KEY_HEX = randomBytes(32).toString('hex');

test('defaults to standalone when PHARMACY_SYNC_ROLE is unset', () => {
  const result = resolvePharmacySyncConfig({});
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.config.role, 'standalone');
});

test('rejects an unknown role', () => {
  const result = resolvePharmacySyncConfig({ PHARMACY_SYNC_ROLE: 'nonsense' });
  assert.equal(result.ok, false);
});

test('hub role requires a 32-byte hex encryption key', () => {
  const missing = resolvePharmacySyncConfig({ PHARMACY_SYNC_ROLE: 'hub' });
  assert.equal(missing.ok, false);

  const tooShort = resolvePharmacySyncConfig({
    PHARMACY_SYNC_ROLE: 'hub',
    PHARMACY_SYNC_HUB_ENCRYPTION_KEY: 'abcd'
  });
  assert.equal(tooShort.ok, false);

  const valid = resolvePharmacySyncConfig({
    PHARMACY_SYNC_ROLE: 'hub',
    PHARMACY_SYNC_HUB_ENCRYPTION_KEY: VALID_KEY_HEX
  });
  assert.equal(valid.ok, true);
  assert.ok(valid.ok && valid.config.role === 'hub' && valid.config.encryptionKey.length === 32);
});

test('hub role falls back to the default db path when unset', () => {
  const result = resolvePharmacySyncConfig({
    PHARMACY_SYNC_ROLE: 'hub',
    PHARMACY_SYNC_HUB_ENCRYPTION_KEY: VALID_KEY_HEX
  });
  assert.ok(result.ok && result.config.role === 'hub' && result.config.dbPath.length > 0);
});

test('hub role honors a custom db path', () => {
  const result = resolvePharmacySyncConfig({
    PHARMACY_SYNC_ROLE: 'hub',
    PHARMACY_SYNC_HUB_ENCRYPTION_KEY: VALID_KEY_HEX,
    PHARMACY_SYNC_HUB_DB_PATH: '/data/custom.sqlite'
  });
  assert.ok(result.ok && result.config.role === 'hub' && result.config.dbPath === '/data/custom.sqlite');
});

test('satellite role requires terminal id and token', () => {
  const missingId = resolvePharmacySyncConfig({
    PHARMACY_SYNC_ROLE: 'satellite',
    PHARMACY_SYNC_HUB_ENDPOINT: 'http://localhost:3000',
    PHARMACY_SYNC_TERMINAL_TOKEN: 'token'
  });
  assert.equal(missingId.ok, false);

  const missingToken = resolvePharmacySyncConfig({
    PHARMACY_SYNC_ROLE: 'satellite',
    PHARMACY_SYNC_HUB_ENDPOINT: 'http://localhost:3000',
    PHARMACY_SYNC_TERMINAL_ID: 'satellite-1'
  });
  assert.equal(missingToken.ok, false);
});

test('satellite role allows a loopback endpoint over plain HTTP', () => {
  const result = resolvePharmacySyncConfig({
    PHARMACY_SYNC_ROLE: 'satellite',
    PHARMACY_SYNC_HUB_ENDPOINT: 'http://127.0.0.1:3000',
    PHARMACY_SYNC_TERMINAL_ID: 'satellite-1',
    PHARMACY_SYNC_TERMINAL_TOKEN: 'token'
  });
  assert.equal(result.ok, true);
});

test('satellite role rejects a LAN endpoint over plain HTTP without transport encryption', () => {
  const result = resolvePharmacySyncConfig({
    PHARMACY_SYNC_ROLE: 'satellite',
    PHARMACY_SYNC_HUB_ENDPOINT: 'http://192.168.1.10:3000',
    PHARMACY_SYNC_TERMINAL_ID: 'satellite-1',
    PHARMACY_SYNC_TERMINAL_TOKEN: 'token'
  });
  assert.equal(result.ok, false);
});

test('satellite role accepts a LAN endpoint over HTTPS', () => {
  const result = resolvePharmacySyncConfig({
    PHARMACY_SYNC_ROLE: 'satellite',
    PHARMACY_SYNC_HUB_ENDPOINT: 'https://192.168.1.10:3000',
    PHARMACY_SYNC_TERMINAL_ID: 'satellite-1',
    PHARMACY_SYNC_TERMINAL_TOKEN: 'token'
  });
  assert.equal(result.ok, true);
});

test('satellite role accepts a LAN endpoint over HTTP when transport encryption key is configured', () => {
  const result = resolvePharmacySyncConfig({
    PHARMACY_SYNC_ROLE: 'satellite',
    PHARMACY_SYNC_HUB_ENDPOINT: 'http://192.168.1.10:3000',
    PHARMACY_SYNC_TERMINAL_ID: 'satellite-1',
    PHARMACY_SYNC_TERMINAL_TOKEN: 'token',
    PHARMACY_SYNC_TRANSPORT_ENCRYPTION: 'aes-gcm',
    PHARMACY_SYNC_TRANSPORT_KEY: VALID_KEY_HEX
  });
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.config.role === 'satellite' && result.config.transportKey?.length === 32);
});

test('satellite role rejects aes-gcm transport encryption without a valid key', () => {
  const result = resolvePharmacySyncConfig({
    PHARMACY_SYNC_ROLE: 'satellite',
    PHARMACY_SYNC_HUB_ENDPOINT: 'http://192.168.1.10:3000',
    PHARMACY_SYNC_TERMINAL_ID: 'satellite-1',
    PHARMACY_SYNC_TERMINAL_TOKEN: 'token',
    PHARMACY_SYNC_TRANSPORT_ENCRYPTION: 'aes-gcm'
  });
  assert.equal(result.ok, false);
});

test('isAllowedHubEndpoint rejects non-http(s) protocols', () => {
  assert.equal(isAllowedHubEndpoint('ftp://localhost:3000', 'none'), false);
  assert.equal(isAllowedHubEndpoint('not-a-url', 'none'), false);
});
