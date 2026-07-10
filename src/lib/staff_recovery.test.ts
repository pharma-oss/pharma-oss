import { test } from 'node:test';
import assert from 'node:assert';
import type { AuditLog, User } from '../db/types.ts';
import {
  buildStaffCredentialRecoveryAuditDetail,
  buildStaffRecoveryChecklist
} from './staff_recovery.ts';

const admin: User = {
  userId: 'admin_1',
  name: '管理者',
  role: 'admin',
  salt: 'salt',
  passwordHash: 'hash'
};

const pharmacist: User = {
  userId: 'pharmacist_1',
  name: '薬剤師',
  role: 'pharmacist',
  passkeyCredentialId: 'credential',
  passkeyPublicKey: 'public-key'
};

function audit(actionType: AuditLog['actionType'], details = 'test'): AuditLog {
  return {
    logId: `log_${actionType}`,
    timestamp: '2026-06-21T10:00:00.000Z',
    userId: 'admin_1',
    userName: '管理者',
    userRole: 'admin',
    actionType,
    details
  };
}

test('buildStaffRecoveryChecklist blocks stopping the only credentialed admin', () => {
  const checklist = buildStaffRecoveryChecklist({
    reason: 'staff_retirement',
    targetStaff: admin,
    staff: [admin, pharmacist],
    auditLogs: [audit('backup_export'), audit('backup_external_storage')]
  });

  assert.strictEqual(checklist.status, 'blocked');
  assert.ok(checklist.requiredActions.some((action) => action.includes('管理者が0名')));
});

test('buildStaffRecoveryChecklist passes when backup and another credentialed admin exist', () => {
  const secondAdmin: User = {
    userId: 'admin_2',
    name: '副管理者',
    role: 'admin',
    passkeyCredentialId: 'credential-2',
    passkeyPublicKey: 'public-key-2'
  };
  const checklist = buildStaffRecoveryChecklist({
    reason: 'device_migration',
    targetStaff: pharmacist,
    staff: [admin, secondAdmin, pharmacist],
    auditLogs: [audit('backup_export'), audit('backup_external_storage'), audit('backup_drill')]
  });

  assert.strictEqual(checklist.status, 'complete');
  assert.strictEqual(checklist.requiredActions.length, 0);
});

test('buildStaffCredentialRecoveryAuditDetail summarizes recovery without secrets', () => {
  const checklist = buildStaffRecoveryChecklist({
    reason: 'passkey_lost',
    targetStaff: pharmacist,
    staff: [admin, pharmacist],
    auditLogs: [audit('backup_export')]
  });

  const detail = buildStaffCredentialRecoveryAuditDetail({
    reason: 'passkey_lost',
    action: 'password_reset',
    targetStaff: pharmacist,
    operatorName: '管理者',
    checklist,
    note: '本人確認済み Password123!'
  });

  assert.match(detail, /スタッフ認証復旧/);
  assert.match(detail, /理由 パスキー紛失/);
  assert.match(detail, /操作 パスワード再設定/);
  assert.match(detail, /対象 薬剤師/);
  assert.match(detail, /メモあり/);
  assert.doesNotMatch(detail, /credential|public-key|hash|salt/);
  assert.doesNotMatch(detail, /Password123/);
});
