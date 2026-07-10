import type { User } from '../db/types.ts';

export const REMOVED_DEMO_STAFF_USER_IDS = [
  'default_pharmacist',
  'clerk_sato',
  'admin_suzuki'
] as const;

export const INITIAL_ADMIN_USER: User = {
  userId: 'initial_admin',
  name: '管理者',
  role: 'admin'
};

export function isRemovedDemoStaffUserId(userId: string): boolean {
  return (REMOVED_DEMO_STAFF_USER_IDS as readonly string[]).includes(userId);
}

export function isInitialAdminUser(user: User): boolean {
  return user.userId === INITIAL_ADMIN_USER.userId;
}

export function hasLoginCredential(user: User): boolean {
  return !!user.passkeyCredentialId || !!(user.passwordHash && user.salt);
}
