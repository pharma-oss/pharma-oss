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

test('settings backup export defaults to encrypted output and warns before plaintext export', () => {
  assert.match(settingsSource, /const \[useEncryption, setUseEncryption\] = useState\(true\)/);
  assert.match(settingsSource, /バックアップファイルをパスワードで暗号化する（推奨・既定）/);
  assert.match(settingsSource, /backup-plain-warning/);
  assert.match(settingsSource, /暗号化せずに平文JSONとして書き出しますか/);
  assert.match(settingsSource, /window\.confirm/);
});

test('settings backup export treats audit-log write failure as an export failure', () => {
  assert.match(settingsSource, /const auditOk = await logAuditAction\(db, 'backup_export', auditDetail\)/);
  assert.match(settingsSource, /バックアップ書き出しの監査ログ記録に失敗しました。/);

  const auditIndex = settingsSource.indexOf("const auditOk = await logAuditAction(db, 'backup_export', auditDetail)");
  const downloadIndex = settingsSource.indexOf('URL.createObjectURL(blob)', auditIndex);
  assert.ok(auditIndex > -1);
  assert.ok(downloadIndex > auditIndex);
});

test('settings backup export can write an external transfer manifest with audit evidence', () => {
  const body = section('const handleExportBackup = async', 'const handleRecordBackupExternalStorage = async');

  assert.match(settingsSource, /buildBackupExternalTransferManifest/);
  assert.match(settingsSource, /buildBackupExternalTransferManifestJson/);
  assert.match(settingsSource, /buildBackupExternalTransferManifestAuditDetail/);
  assert.match(settingsSource, /makeBackupExternalTransferManifestFileName/);
  assert.match(settingsSource, /const \[exportBackupExternalTransferManifest, setExportBackupExternalTransferManifest\] = useState\(false\)/);
  assert.match(settingsSource, /const \[externalBackupRetentionDays, setExternalBackupRetentionDays\] = useState\(30\)/);
  assert.match(settingsSource, /外部保存連携JSONも出力する/);
  assert.match(settingsSource, /保存先保持日数/);
  assert.match(body, /const manifest = buildBackupExternalTransferManifest/);
  assert.match(body, /payloadContent/);
  assert.match(body, /const manifestAuditOk = await logAuditAction\(\s*db,\s*'backup_external_transfer_manifest'/);
  assert.match(body, /外部保存連携JSONの監査ログ記録に失敗しました。/);
  assert.match(body, /downloadTextFile\(\s*externalTransferManifestFileName/);
});

test('settings backup restore treats audit-log write failure as a restore failure', () => {
  assert.match(settingsSource, /const result = await importDatabaseBackup\(db, pendingBackupPayload\)/);
  assert.match(settingsSource, /const auditOk = await logAuditAction\(\s*db,\s*'backup_import'/);
  assert.match(settingsSource, /バックアップ復旧の監査ログ記録に失敗しました。復旧後のデータと監査ログを確認してください。/);
});

test('settings backup operational records fail when audit-log writes fail', () => {
  const externalStorage = section(
    'const handleRecordBackupExternalStorage = async',
    'const handleRecordBackupExternalTransferReceipt = async'
  );
  assert.match(externalStorage, /const auditOk = await logAuditAction\(\s*db,\s*'backup_external_storage'/);
  assert.match(externalStorage, /if \(!auditOk\)/);
  assert.match(externalStorage, /外部保存確認の監査ログ記録に失敗しました。/);

  const receipt = section(
    'const handleRecordBackupExternalTransferReceipt = async',
    'const handleBackupSchedulePolicyChange ='
  );
  assert.match(receipt, /validateBackupExternalTransferReceipt/);
  assert.match(receipt, /buildBackupExternalStorageEvidenceFromTransferReceipt/);
  assert.match(receipt, /const auditOk = await logAuditAction\(\s*db,\s*'backup_external_storage'/);
  assert.match(receipt, /外部保存ジョブ受領書の監査ログ記録に失敗しました。/);
  assert.match(settingsSource, /受領書JSONを選択/);
  assert.match(settingsSource, /受領書を監査ログへ記録/);

  const drill = section('const handleRecordBackupDrill = async', 'const handleCancelRestore =');
  assert.match(drill, /const auditOk = await logAuditAction\(\s*db,\s*'backup_drill'/);
  assert.match(drill, /if \(!auditOk\)/);
  assert.match(drill, /復旧テスト結果の監査ログ記録に失敗しました。/);
});

test('settings backup schedule rolls back the saved policy when audit logging fails', () => {
  const body = section('const handleSaveBackupSchedulePolicy = async', 'const handleExportBackupGenerationReviewCsv = async');

  assert.match(body, /if \(!db\)/);
  assert.match(body, /const previousPolicy = readBackupSchedulePolicy\(\)/);
  assert.match(body, /const auditOk = await logAuditAction\(\s*db,\s*'backup_schedule_update'/);
  assert.match(body, /if \(!auditOk\)/);
  assert.match(body, /const restoredPolicy = writeBackupSchedulePolicy\(previousPolicy\)/);
  assert.match(body, /setBackupSchedulePolicy\(restoredPolicy\)/);
  assert.match(body, /閉店時バックアップ予定の監査ログ記録に失敗したため、変更を元に戻しました。/);
});

test('settings backup generation CSV audits successfully before download', () => {
  const body = section('const handleExportBackupGenerationReviewCsv = async', 'const analyzeBackupPayload = async');

  assert.match(body, /const auditOk = await logAuditAction\(\s*db,\s*'audit_export'/);
  assert.match(body, /バックアップ世代管理CSV出力の監査ログ記録に失敗しました。/);

  const auditIndex = body.indexOf("const auditOk = await logAuditAction(");
  const downloadIndex = body.indexOf('URL.createObjectURL(blob)');
  assert.ok(auditIndex > -1);
  assert.ok(downloadIndex > auditIndex);
});

test('バックアップタブは患者重複点検(名寄せ)から統合まで実行できる', () => {
  assert.match(settingsSource, /data-testid="patient-duplicate-review-section"/);
  assert.match(settingsSource, /data-testid="patient-duplicate-scan-button"/);
  assert.match(settingsSource, /重複候補を確認/);
  assert.match(settingsSource, /findDuplicatePatientGroups\(patients, visits\)/);
  assert.match(settingsSource, /buildPatientDuplicateScanAuditDetail/);

  const scanBody = section('const handleScanPatientDuplicates = async', 'const openDuplicateMergeReview = async');
  assert.match(scanBody, /ensurePermission\('manage_backups'\)/);

  // 統合は既存のpatient_merge実行系(計画→適用→失敗時ロールバック→監査ログ)を使う
  const applyBody = section('const handleApplyDuplicateMerge = async', 'const handleExportBackupGenerationReviewCsv');
  assert.match(applyBody, /window\.confirm\(/);
  assert.match(applyBody, /createRxdbPatientMergeExecutionStore\(db\)/);
  assert.match(applyBody, /applyPatientMergeExecutionPlan\(store, executionPlan\)/);
  assert.match(applyBody, /患者統合実行: \$\{plan\.summary\}/);
  assert.match(applyBody, /PatientMergeExecutionError/);
  assert.match(applyBody, /rollbackOperations/);
});
