import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '../db/types.ts';
import {
  INITIAL_ADMIN_USER,
  REMOVED_DEMO_STAFF_USER_IDS,
  hasLoginCredential,
  isInitialAdminUser,
  isRemovedDemoStaffUserId
} from './initial_staff.ts';

function user(overrides: Partial<User> = {}): User {
  return { userId: 'u1', name: 'テスト', role: 'pharmacist', ...overrides };
}

test('isRemovedDemoStaffUserId matches exactly the removed demo accounts and nothing else', () => {
  assert.deepEqual([...REMOVED_DEMO_STAFF_USER_IDS], ['default_pharmacist', 'clerk_sato', 'admin_suzuki']);
  for (const id of REMOVED_DEMO_STAFF_USER_IDS) {
    assert.equal(isRemovedDemoStaffUserId(id), true, id);
  }
  assert.equal(isRemovedDemoStaffUserId(INITIAL_ADMIN_USER.userId), false, 'the real initial admin must never be treated as a removed demo account');
  assert.equal(isRemovedDemoStaffUserId('default_pharmacist_2'), false, 'no prefix matching');
  assert.equal(isRemovedDemoStaffUserId('Default_Pharmacist'), false, 'case-sensitive');
  assert.equal(isRemovedDemoStaffUserId(''), false);
});

test('the initial admin is an admin and is recognised only by its fixed userId', () => {
  assert.equal(INITIAL_ADMIN_USER.role, 'admin');
  assert.equal(isInitialAdminUser(INITIAL_ADMIN_USER), true);
  assert.equal(isInitialAdminUser(user({ userId: 'initial_admin', role: 'clerk' })), true, 'identity is the userId, not the role');
  assert.equal(isInitialAdminUser(user({ userId: 'admin_suzuki', role: 'admin' })), false, 'another admin is not the initial admin');
});

test('the initial admin ships without any credential so the first login must set one', () => {
  assert.equal(hasLoginCredential(INITIAL_ADMIN_USER), false);
  assert.equal(INITIAL_ADMIN_USER.passwordHash, undefined);
  assert.equal(INITIAL_ADMIN_USER.salt, undefined);
  assert.equal(INITIAL_ADMIN_USER.passkeyCredentialId, undefined);
});

test('hasLoginCredential requires a passkey, or a password hash together with its salt', () => {
  assert.equal(hasLoginCredential(user({ passkeyCredentialId: 'cred-abc' })), true);
  assert.equal(hasLoginCredential(user({ passwordHash: 'hash', salt: 'salt' })), true);

  assert.equal(hasLoginCredential(user({ passwordHash: 'hash' })), false, 'a hash without a salt cannot be verified');
  assert.equal(hasLoginCredential(user({ salt: 'salt' })), false, 'a salt without a hash is not a credential');
  assert.equal(hasLoginCredential(user({ passkeyPublicKey: 'pub' })), false, 'a public key alone cannot identify the credential');
  assert.equal(hasLoginCredential(user()), false);
  assert.equal(hasLoginCredential(user({ passkeyCredentialId: '', passwordHash: '', salt: '' })), false, 'empty strings are not credentials');
});
