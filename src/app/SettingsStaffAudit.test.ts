import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const settingsSource = readFileSync(new URL('./settings/page.tsx', import.meta.url), 'utf8');

function section(start: string, end: string): string {
  const startIndex = settingsSource.indexOf(start);
  const endIndex = settingsSource.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing section start: ${start}`);
  assert.ok(endIndex > startIndex, `Missing section end: ${end}`);
  return settingsSource.slice(startIndex, endIndex);
}

test('staff creation rolls back the inserted staff record when audit logging fails', () => {
  const body = section('const handleAddStaff = async', 'const handleRegisterPasskey = async');

  assert.match(body, /const auditOk = await logAuditAction\(/);
  assert.match(body, /if \(!auditOk\)/);
  assert.match(body, /const insertedDoc = await db\.users\.findOne\(userId\)\.exec\(\)/);
  assert.match(body, /await insertedDoc\.remove\(\)/);
  assert.match(body, /スタッフ追加の監査ログ記録に失敗したため、追加を取り消しました。/);
});

test('passkey registration restores previous credential fields when audit logging fails', () => {
  const body = section('const handleRegisterPasskey = async', 'const handleDeleteStaff = async');

  assert.match(body, /const previousCredentialId = staff\.passkeyCredentialId \|\| ''/);
  assert.match(body, /const previousPublicKey = staff\.passkeyPublicKey \|\| ''/);
  assert.match(body, /const auditOk = await logAuditAction\(/);
  assert.match(body, /if \(!auditOk\)/);
  assert.match(body, /passkeyCredentialId: previousCredentialId/);
  assert.match(body, /passkeyPublicKey: previousPublicKey/);
  assert.match(body, /パスキー登録の監査ログ記録に失敗したため、登録を取り消しました。/);
});

test('staff deletion restores the removed staff record when audit logging fails', () => {
  const body = section('const handleDeleteStaff = async', 'const handleSettingsChange =');

  assert.match(body, /const auditOk = await logAuditAction\(/);
  assert.match(body, /if \(!auditOk\)/);
  assert.match(body, /await db\.users\.insert\(\{/);
  assert.match(body, /userId: staff\.userId/);
  assert.match(body, /passkeyPublicKey: staff\.passkeyPublicKey \|\| ''/);
  assert.match(body, /スタッフ削除の監査ログ記録に失敗したため、削除を取り消しました。/);
  assert.match(body, /toast\.error\(`スタッフの削除に失敗しました: \$\{err\.message \|\| err\}`\)/);
});

test('staff deletion blocks removing the last credentialed admin', () => {
  const body = section('const handleDeleteStaff = async', 'const handleResetStaffRecoveryPassword = async');

  assert.match(body, /staff\.role === 'admin' && hasLoginCredential\(staff\) && credentialedAdminCount <= 1/);
  assert.match(body, /最後の認証済み管理者は削除できません/);
});

test('staff password recovery rolls back when audit logging fails', () => {
  const body = section('const handleResetStaffRecoveryPassword = async', 'const handleClearStaffRecoveryPasskey = async');

  assert.match(body, /const previousSalt = staffRecoveryTarget\.salt \|\| ''/);
  assert.match(body, /const previousPasswordHash = staffRecoveryTarget\.passwordHash \|\| ''/);
  assert.match(body, /'staff_credential_recovery'/);
  assert.match(body, /buildStaffCredentialRecoveryAuditDetail/);
  assert.match(body, /if \(!auditOk\)/);
  assert.match(body, /await doc\.patch\(\{ salt: previousSalt, passwordHash: previousPasswordHash \}\)/);
  assert.match(body, /パスワード再設定の監査ログ記録に失敗したため、変更を取り消しました。/);
});

test('staff passkey recovery rolls back when audit logging fails', () => {
  const body = section('const handleClearStaffRecoveryPasskey = async', 'const handleRecordStaffRetirementCheck = async');

  assert.match(body, /const previousCredentialId = staffRecoveryTarget\.passkeyCredentialId \|\| ''/);
  assert.match(body, /const previousPublicKey = staffRecoveryTarget\.passkeyPublicKey \|\| ''/);
  assert.match(body, /'staff_credential_recovery'/);
  assert.match(body, /action: 'passkey_clear'/);
  assert.match(body, /if \(!auditOk\)/);
  assert.match(body, /passkeyCredentialId: previousCredentialId/);
  assert.match(body, /passkeyPublicKey: previousPublicKey/);
  assert.match(body, /パスキー解除の監査ログ記録に失敗したため、変更を取り消しました。/);
});

test('staff tab renders recovery controls for retirement and lost passkeys', () => {
  const body = section('data-testid="staff-recovery-panel"', '{/* Staff List Table */}');

  assert.match(body, /復旧・退職対応/);
  assert.match(body, /STAFF_RECOVERY_REASON_LABELS/);
  assert.match(body, /handleResetStaffRecoveryPassword/);
  assert.match(body, /handleClearStaffRecoveryPasskey/);
  assert.match(body, /退職前チェックを記録/);
  assert.match(body, /handleExportStaffAccessRecoveryMonthlyReviewCsv/);
  assert.match(body, /data-testid="staff-access-recovery-monthly-review-csv"/);
  assert.match(body, /月次棚卸CSV/);
  assert.match(body, /staffRecoveryChecklist\.steps\.map/);
});

test('role permission policy saves with audit logging and rolls back on audit failure', () => {
  const body = section('const handleSaveRolePermissionPolicy = async', 'const handleResetRolePermissionPolicy = async');

  assert.match(body, /const previousPolicy = readRolePermissionPolicy\(\)/);
  assert.match(body, /const savedPolicy = writeRolePermissionPolicy\(rolePermissionPolicy\)/);
  assert.match(body, /buildRolePermissionPolicyAuditDetail\(savedPolicy\)/);
  assert.match(body, /if \(!auditOk\)/);
  assert.match(body, /writeRolePermissionPolicy\(previousPolicy\)/);
  assert.match(body, /setRolePermissionPolicy\(previousPolicy\)/);
  assert.match(body, /権限ロール設定の監査ログ記録に失敗したため、保存を取り消しました。/);
});

test('role permission policy reset also records an audit log and restores on failure', () => {
  const body = section('const handleResetRolePermissionPolicy = async', 'const handleSettingsChange =');

  assert.match(body, /const previousPolicy = readRolePermissionPolicy\(\)/);
  assert.match(body, /const resetPolicy = resetRolePermissionPolicy\(\)/);
  assert.match(body, /buildRolePermissionPolicyAuditDetail\(resetPolicy\)/);
  assert.match(body, /標準設定へ戻しました/);
  assert.match(body, /writeRolePermissionPolicy\(previousPolicy\)/);
  assert.match(body, /権限ロール設定リセットの監査ログ記録に失敗したため、変更を取り消しました。/);
});

test('staff tab renders role permission policy controls', () => {
  const body = section('data-testid="role-permission-policy-panel"', '{/* Staff List Table */}');

  assert.match(body, /権限ロール設定/);
  assert.match(body, /ROLE_PERMISSION_SETTING_ROLES\.map/);
  assert.match(body, /ALL_PERMISSION_ACTIONS\.map/);
  assert.match(body, /getPermissionLabel\(action\)/);
  assert.match(body, /handleRolePermissionToggle\(role, action\)/);
  assert.match(body, /role === 'admin'/);
});
