import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildRolePermissionPolicyAuditDetail,
  canUserPerform,
  DEFAULT_ROLE_PERMISSION_POLICY,
  FIRST_RUN_USER,
  getCurrentUser,
  getPermissionDeniedMessage,
  normalizeRolePermissionPolicy,
  readRolePermissionPolicy,
  resetRolePermissionPolicy,
  setCurrentUser,
  UNAUTHENTICATED_USER,
  writeRolePermissionPolicy,
  logAuditAction
} from './audit.ts';
import type { AuditLog, User } from '../db/types.ts';

const admin: User = { userId: 'u1', name: '管理者', role: 'admin' };
const pharmacist: User = { userId: 'u2', name: '薬剤師', role: 'pharmacist' };
const clerk: User = { userId: 'u3', name: '事務', role: 'clerk' };

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  };
}

test('canUserPerform allows admins to manage staff and export UKE', () => {
  assert.strictEqual(canUserPerform(admin, 'manage_staff'), true);
  assert.strictEqual(canUserPerform(admin, 'export_uke'), true);
  assert.strictEqual(canUserPerform(admin, 'approve_daily_closing'), true);
  assert.strictEqual(canUserPerform(admin, 'review_ai_suggestions'), true);
  assert.strictEqual(canUserPerform(admin, 'manage_backups'), true);
});

test('canUserPerform allows pharmacists to change billing but not manage staff', () => {
  assert.strictEqual(canUserPerform(pharmacist, 'change_billing'), true);
  assert.strictEqual(canUserPerform(pharmacist, 'view_official_audit'), true);
  assert.strictEqual(canUserPerform(pharmacist, 'approve_daily_closing'), true);
  assert.strictEqual(canUserPerform(pharmacist, 'review_ai_suggestions'), true);
  assert.strictEqual(canUserPerform(pharmacist, 'manage_backups'), true);
  assert.strictEqual(canUserPerform(pharmacist, 'manage_staff'), false);
});

test('canUserPerform limits clerks to reception and printing', () => {
  assert.strictEqual(canUserPerform(clerk, 'receive_prescription'), true);
  assert.strictEqual(canUserPerform(clerk, 'print_documents'), true);
  assert.strictEqual(canUserPerform(clerk, 'view_official_audit'), false);
  assert.strictEqual(canUserPerform(clerk, 'change_billing'), false);
  assert.strictEqual(canUserPerform(clerk, 'export_uke'), false);
  assert.strictEqual(canUserPerform(clerk, 'approve_daily_closing'), false);
  assert.strictEqual(canUserPerform(clerk, 'review_ai_suggestions'), false);
  assert.strictEqual(canUserPerform(clerk, 'manage_backups'), false);
});

test('role permission policy can customize pharmacist and clerk permissions', () => {
  const policy = normalizeRolePermissionPolicy({
    admin: [],
    pharmacist: ['receive_prescription', 'print_documents'],
    clerk: ['receive_prescription', 'print_documents', 'view_audit_logs', 'view_audit_logs', 'unknown_action']
  });

  assert.strictEqual(canUserPerform(admin, 'manage_staff', policy), true);
  assert.strictEqual(canUserPerform(pharmacist, 'change_billing', policy), false);
  assert.strictEqual(canUserPerform(pharmacist, 'print_documents', policy), true);
  assert.strictEqual(canUserPerform(clerk, 'view_audit_logs', policy), true);
  assert.deepStrictEqual(policy.clerk, ['receive_prescription', 'print_documents', 'view_audit_logs']);
});

test('role permission policy storage reads, writes, and resets normalized policy', () => {
  const previousWindow = (globalThis as any).window;
  const previousLocalStorage = (globalThis as any).localStorage;
  const localStorage = createStorage();

  (globalThis as any).window = {};
  (globalThis as any).localStorage = localStorage;

  try {
    const saved = writeRolePermissionPolicy({
      ...DEFAULT_ROLE_PERMISSION_POLICY,
      clerk: ['receive_prescription', 'view_audit_logs']
    });

    assert.deepStrictEqual(readRolePermissionPolicy(), saved);
    assert.strictEqual(readRolePermissionPolicy().clerk.includes('view_audit_logs'), true);

    const reset = resetRolePermissionPolicy();
    assert.deepStrictEqual(reset, DEFAULT_ROLE_PERMISSION_POLICY);
    assert.strictEqual(readRolePermissionPolicy().clerk.includes('view_audit_logs'), false);
  } finally {
    (globalThis as any).window = previousWindow;
    (globalThis as any).localStorage = previousLocalStorage;
  }
});

test('buildRolePermissionPolicyAuditDetail summarizes roles without staff or patient identifiers', () => {
  const detail = buildRolePermissionPolicyAuditDetail({
    pharmacist: ['receive_prescription', 'manage_backups'],
    clerk: []
  });

  assert.match(detail, /権限ロール設定変更/);
  assert.match(detail, /薬剤師=処方箋受付、バックアップ\/復旧/);
  assert.match(detail, /事務=権限なし/);
  assert.match(detail, /管理者は全権限固定/);
  assert.doesNotMatch(detail, /u1|u2|u3|患者/);
});

test('getPermissionDeniedMessage names the blocked action and current user', () => {
  const message = getPermissionDeniedMessage(clerk, 'export_uke');
  assert.match(message, /事務/);
  assert.match(message, /UKE出力/);
});

test('unauthenticated users cannot perform any permissioned action', () => {
  assert.strictEqual(canUserPerform(UNAUTHENTICATED_USER, 'receive_prescription'), false);
  assert.strictEqual(canUserPerform(UNAUTHENTICATED_USER, 'print_documents'), false);
  assert.match(getPermissionDeniedMessage(UNAUTHENTICATED_USER, 'receive_prescription'), /スタッフログイン/);
});

test('removed initial staff users cannot keep stale permissions', () => {
  const initialAdmin: User = { userId: 'admin_suzuki', name: '鈴木 一郎', role: 'admin' };
  assert.strictEqual(canUserPerform(initialAdmin, 'manage_staff'), false);
  assert.match(getPermissionDeniedMessage(initialAdmin, 'manage_staff'), /スタッフログイン/);
});

test('getCurrentUser clears removed initial staff sessions', () => {
  const previousWindow = (globalThis as any).window;
  const previousSessionStorage = (globalThis as any).sessionStorage;
  const previousLocalStorage = (globalThis as any).localStorage;
  const sessionStorage = createStorage();

  (globalThis as any).window = {};
  (globalThis as any).sessionStorage = sessionStorage;
  (globalThis as any).localStorage = createStorage();

  try {
    setCurrentUser({ userId: 'default_pharmacist', name: '山田 太郎', role: 'pharmacist' });
    assert.deepStrictEqual(getCurrentUser(), UNAUTHENTICATED_USER);
    assert.strictEqual(sessionStorage.getItem('pharmacy_os_current_user'), null);
  } finally {
    (globalThis as any).window = previousWindow;
    (globalThis as any).sessionStorage = previousSessionStorage;
    (globalThis as any).localStorage = previousLocalStorage;
  }
});

test('first-run setup bypass user cannot perform permissioned actions', () => {
  assert.strictEqual(canUserPerform(FIRST_RUN_USER, 'manage_staff'), false);
  assert.strictEqual(canUserPerform(FIRST_RUN_USER, 'manage_facility_settings'), false);
});

test('logAuditAction signs new audit logs against the latest signed row', async () => {
  const previousWindow = (globalThis as any).window;
  const previousSessionStorage = (globalThis as any).sessionStorage;
  const previousLocalStorage = (globalThis as any).localStorage;
  const insertedRows: AuditLog[] = [];
  const previousSignedLog: AuditLog = {
    logId: 'log_previous',
    timestamp: '2026-06-14T09:59:00.000Z',
    userId: 'admin_1',
    userName: '管理者',
    userRole: 'admin',
    actionType: 'login',
    details: 'ログインしました。',
    integrityHash: 'previous-integrity-hash'
  };
  const mockDb = {
    audit_logs: {
      find: () => ({
        exec: async () => [{ toJSON: () => previousSignedLog }]
      }),
      insert: async (row: AuditLog) => {
        insertedRows.push(row);
        return row;
      }
    }
  };

  (globalThis as any).window = {};
  (globalThis as any).sessionStorage = createStorage();
  (globalThis as any).localStorage = createStorage();

  try {
    setCurrentUser(admin);
    await logAuditAction(mockDb as any, 'audit_export', '監査ログJSONを書き出しました。');

    assert.strictEqual(insertedRows.length, 1);
    assert.strictEqual(insertedRows[0].userId, admin.userId);
    assert.strictEqual(insertedRows[0].actionType, 'audit_export');
    assert.strictEqual(insertedRows[0].previousHash, previousSignedLog.integrityHash);
    assert.match(insertedRows[0].integrityHash || '', /^(fallback-)?[a-f0-9]{8,64}$/);
  } finally {
    (globalThis as any).window = previousWindow;
    (globalThis as any).sessionStorage = previousSessionStorage;
    (globalThis as any).localStorage = previousLocalStorage;
  }
});
