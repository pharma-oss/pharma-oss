import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  AES_GCM_KEY_BYTES,
  decryptAesGcm,
  encryptAesGcm,
  isValidAesGcmKey,
  parseHexKey
} from './sync_crypto.ts';

const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const HEX_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

function newKey(): Buffer {
  return randomBytes(AES_GCM_KEY_BYTES);
}

function flipBit(buf: Buffer, index: number): Buffer {
  const copy = Buffer.from(buf);
  copy[index] ^= 0x01;
  return copy;
}

test('parseHexKey accepts exactly 64 hex characters, trims surrounding whitespace, and ignores case', () => {
  const key = parseHexKey(HEX_KEY);
  assert.ok(key);
  assert.equal(key.length, AES_GCM_KEY_BYTES);
  assert.deepEqual(key, Buffer.from(HEX_KEY, 'hex'));

  assert.deepEqual(parseHexKey(`  \n${HEX_KEY}\t\n`), key);
  assert.deepEqual(parseHexKey(HEX_KEY.toUpperCase()), key);
});

test('parseHexKey rejects missing, wrong-length, non-hex and prefixed input instead of guessing a key', () => {
  assert.equal(parseHexKey(undefined), null);
  assert.equal(parseHexKey(''), null);
  assert.equal(parseHexKey('   '), null);
  assert.equal(parseHexKey(HEX_KEY.slice(0, 63)), null, '63 chars');
  assert.equal(parseHexKey(`${HEX_KEY}0`), null, '65 chars');
  assert.equal(parseHexKey(`${HEX_KEY.slice(0, 63)}g`), null, 'non-hex character');
  assert.equal(parseHexKey(`0x${HEX_KEY.slice(2)}`), null, '0x prefix');
  assert.equal(parseHexKey(`${HEX_KEY.slice(0, 32)} ${HEX_KEY.slice(32)}`), null, 'inner whitespace');
});

test('isValidAesGcmKey accepts only 32-byte keys', () => {
  assert.equal(isValidAesGcmKey(randomBytes(32)), true);
  assert.equal(isValidAesGcmKey(randomBytes(16)), false);
  assert.equal(isValidAesGcmKey(randomBytes(31)), false);
  assert.equal(isValidAesGcmKey(randomBytes(33)), false);
  assert.equal(isValidAesGcmKey(Buffer.alloc(0)), false);
});

test('encryptAesGcm/decryptAesGcm round-trips ASCII, Japanese, emoji and empty plaintext', () => {
  const key = newKey();
  for (const plaintext of ['', 'hello', '患者: 山田 太郎 / 処方: アムロジピン錠5mg', '💊 mixed ascii と 日本語', 'x'.repeat(100_000)]) {
    assert.equal(decryptAesGcm(encryptAesGcm(plaintext, key), key), plaintext);
  }
});

test('encryptAesGcm output layout is iv(12) + authTag(16) + ciphertext(utf8 byte length)', () => {
  const key = newKey();
  const plaintext = '調剤録';
  const encrypted = encryptAesGcm(plaintext, key);
  assert.equal(encrypted.length, IV_BYTES + AUTH_TAG_BYTES + Buffer.byteLength(plaintext, 'utf8'));
  assert.equal(encryptAesGcm('', key).length, IV_BYTES + AUTH_TAG_BYTES);
});

test('encryptAesGcm uses a fresh random IV so identical plaintext never yields identical ciphertext', () => {
  const key = newKey();
  const a = encryptAesGcm('same plaintext', key);
  const b = encryptAesGcm('same plaintext', key);
  assert.notDeepEqual(a.subarray(0, IV_BYTES), b.subarray(0, IV_BYTES));
  assert.notDeepEqual(a, b);
});

test('encryptAesGcm does not leave the plaintext readable in the stored bytes', () => {
  const key = newKey();
  const plaintext = 'SENSITIVE-PATIENT-NAME-山田太郎';
  const encrypted = encryptAesGcm(plaintext, key);
  assert.equal(encrypted.includes(Buffer.from(plaintext, 'utf8')), false);
  assert.equal(encrypted.toString('latin1').includes('SENSITIVE'), false);
});

test('decryptAesGcm rejects the wrong key', () => {
  const encrypted = encryptAesGcm('secret', newKey());
  assert.throws(() => decryptAesGcm(encrypted, newKey()));
});

test('decryptAesGcm rejects a single flipped bit in the IV, the auth tag, or the ciphertext (tamper detection)', () => {
  const key = newKey();
  const encrypted = encryptAesGcm('tamper-evident hub store record', key);
  assert.equal(decryptAesGcm(encrypted, key), 'tamper-evident hub store record');

  assert.throws(() => decryptAesGcm(flipBit(encrypted, 0), key), 'IV');
  assert.throws(() => decryptAesGcm(flipBit(encrypted, IV_BYTES), key), 'auth tag');
  assert.throws(() => decryptAesGcm(flipBit(encrypted, IV_BYTES + AUTH_TAG_BYTES), key), 'ciphertext first byte');
  assert.throws(() => decryptAesGcm(flipBit(encrypted, encrypted.length - 1), key), 'ciphertext last byte');
});

test('decryptAesGcm rejects truncated and appended data', () => {
  const key = newKey();
  const encrypted = encryptAesGcm('length matters', key);
  assert.throws(() => decryptAesGcm(encrypted.subarray(0, encrypted.length - 1), key), 'truncated');
  assert.throws(() => decryptAesGcm(Buffer.concat([encrypted, Buffer.from([0])]), key), 'appended');
  assert.throws(() => decryptAesGcm(Buffer.alloc(0), key), 'empty');
});
