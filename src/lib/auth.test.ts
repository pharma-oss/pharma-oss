import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSalt, hashPassword, verifyPassword } from './auth';

describe('Auth cryptographic functions and contracts', () => {
  it('generates random hex salts', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();

    assert.equal(salt1.length, 32);
    assert.equal(salt2.length, 32);
    assert.notEqual(salt1, salt2);
  });

  it('hashes passwords deterministically with salt', async () => {
    const salt = generateSalt();
    const hash1 = await hashPassword('secretPassword123', salt);
    const hash2 = await hashPassword('secretPassword123', salt);
    const hashOther = await hashPassword('differentPassword', salt);

    assert.equal(hash1, hash2);
    assert.notEqual(hash1, hashOther);
    assert.ok(hash1.length >= 64);
  });

  it('verifies valid passwords and rejects invalid passwords', async () => {
    const salt = generateSalt();
    const passwordHash = await hashPassword('correctHorseBatteryStaple', salt);

    const mockUser: any = {
      userId: 'u1',
      name: '管理者',
      role: 'admin',
      passwordHash,
      salt
    };

    const isMatch = await verifyPassword('correctHorseBatteryStaple', mockUser);
    assert.equal(isMatch, true);

    const isMismatch = await verifyPassword('wrongPassword', mockUser);
    assert.equal(isMismatch, false);
  });
});
