import { test } from 'node:test';
import assert from 'node:assert';
import { generateUUID } from './crypto.ts';

test('generateUUID should return a valid UUID v4', () => {
  const uuid = generateUUID();

  // Basic format check: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.match(uuid, uuidRegex);
});

test('generateUUID should generate unique IDs', () => {
  const uuids = new Set();
  for (let i = 0; i < 1000; i++) {
    const uuid = generateUUID();
    assert.strictEqual(uuids.has(uuid), false);
    uuids.add(uuid);
  }
  assert.strictEqual(uuids.size, 1000);
});

test('generateUUID should throw error when crypto API is not available', () => {
  const originalCrypto = global.crypto;
  try {
    Object.defineProperty(global, 'crypto', {
      value: undefined,
      configurable: true,
      writable: true
    });
    assert.throws(() => generateUUID(), /Crypto API is not available/);
  } finally {
    Object.defineProperty(global, 'crypto', {
      value: originalCrypto,
      configurable: true,
      writable: true
    });
  }
});

test('generateUUID should fall back to getRandomValues when randomUUID is not available', () => {
  const originalCrypto = global.crypto;
  const mockCrypto = {
    getRandomValues: (array: Uint8Array) => originalCrypto.getRandomValues(array),
    randomUUID: undefined
  };

  try {
    Object.defineProperty(global, 'crypto', {
      value: mockCrypto,
      configurable: true,
      writable: true
    });
    const uuid = generateUUID();
    // Basic format check: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    assert.match(uuid, uuidRegex);
  } finally {
    Object.defineProperty(global, 'crypto', {
      value: originalCrypto,
      configurable: true,
      writable: true
    });
  }
});
