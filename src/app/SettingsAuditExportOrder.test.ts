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

function assertAuditBeforeDownload(body: string, downloadNeedle: string) {
  const auditIndex = body.indexOf('const auditOk = await logAuditAction(');
  const guardIndex = body.indexOf('if (!auditOk)', auditIndex);
  const downloadIndex = body.indexOf(downloadNeedle);
  assert.ok(auditIndex >= 0, 'audit logging result is not checked');
  assert.ok(guardIndex > auditIndex, 'audit failure guard is missing');
  assert.ok(downloadIndex > guardIndex, 'download starts before audit logging succeeds');
}

test('audit log JSON export writes audit log before downloading the file', () => {
  const body = section('const handleExportAuditLogs = async', 'const handleExportAnonymousDiagnostic = async');

  assertAuditBeforeDownload(body, 'URL.createObjectURL(blob)');
  assert.match(body, /監査ログJSONエクスポートの監査ログ記録に失敗したため、書き出しを中止しました。/);
});

test('anonymous diagnostic export writes audit log before downloading the file', () => {
  const body = section('const handleExportAnonymousDiagnostic = async', 'const handleExportAuditRetentionLedgerCsv = async');

  assertAuditBeforeDownload(body, 'downloadTextFile(fileName, content');
  assert.match(body, /個人情報なし診断JSONエクスポートの監査ログ記録に失敗したため、書き出しを中止しました。/);
  assert.match(body, /buildOnlineEligibilityFieldReadinessReport/);
  assert.match(body, /buildOnlineEligibilityResponseDiffReport\(\[\]\)/);
  assert.match(body, /onlineEligibilityFieldReadiness/);
  assert.match(body, /buildStaffAccessRecoveryReviewFromAuditLogs/);
  assert.match(body, /buildStaffAccessRecoveryMonthlyReview/);
  assert.match(body, /sourceArtifactSha256: report\.latestHash/);
  assert.match(body, /staffAccessRecoveryReview/);
  assert.match(body, /staffAccessRecoveryMonthlyReview/);
});

test('audit retention ledger export writes audit log before downloading the file', () => {
  const body = section('const handleExportAuditRetentionLedgerCsv = async', 'const handleExportAuditRetentionMonthlyReviewCsv = async');

  assertAuditBeforeDownload(body, 'URL.createObjectURL(blob)');
  assert.match(body, /監査ログ保全台帳CSVエクスポートの監査ログ記録に失敗したため、書き出しを中止しました。/);
});

test('audit retention monthly review export writes audit log before downloading the file', () => {
  const body = section('const handleExportAuditRetentionMonthlyReviewCsv = async', 'const handleExportDailyClosingReviewCsv = async');

  assertAuditBeforeDownload(body, 'URL.createObjectURL(blob)');
  assert.match(body, /監査ログ保全月次棚卸CSVエクスポートの監査ログ記録に失敗したため、書き出しを中止しました。/);
});

test('staff access recovery monthly review export writes audit log before downloading the file', () => {
  const body = section('const handleExportStaffAccessRecoveryMonthlyReviewCsv = async', 'const handleSaveRolePermissionPolicy = async');

  assertAuditBeforeDownload(body, 'URL.createObjectURL(blob)');
  assert.match(body, /buildStaffAccessRecoveryMonthlyReview/);
  assert.match(body, /buildStaffAccessRecoveryMonthlyReviewCsv/);
  assert.match(body, /スタッフ復旧・退職対応月次棚卸CSVエクスポートの監査ログ記録に失敗したため、書き出しを中止しました。/);
});

test('facility settings exposes official fee code override inputs', () => {
  assert.match(settingsSource, /DISPENSING_OFFICIAL_FEE_CODE_OVERRIDE_ITEMS/);
  assert.match(settingsSource, /buildOfficialFeeCodeOverrideTemplateCsv/);
  assert.match(settingsSource, /buildOfficialFeeCodeMasterProposalFromCsv/);
  assert.match(settingsSource, /buildOfficialFeeCodeMasterProposalReviewCsv/);
  assert.match(settingsSource, /makeOfficialFeeCodeMasterProposalReviewCsvFileName/);
  assert.match(settingsSource, /parseOfficialFeeCodeOverrideCsv/);
  assert.match(settingsSource, /makeOfficialFeeCodeOverrideCsvFileName/);
  assert.match(settingsSource, /data-testid="official-fee-code-overrides"/);
  assert.match(settingsSource, /data-testid="official-fee-code-csv-export"/);
  assert.match(settingsSource, /data-testid="official-fee-code-csv-input"/);
  assert.match(settingsSource, /data-testid="official-fee-code-master-csv-input"/);
  assert.match(settingsSource, /data-testid="official-fee-code-master-apply"/);
  assert.match(settingsSource, /data-testid="official-fee-code-master-review-csv"/);
  assert.match(settingsSource, /data-testid="official-fee-code-master-summary"/);
  assert.match(settingsSource, /data-testid="official-fee-code-master-preview"/);
  assert.match(settingsSource, /handleOfficialFeeCodeChange/);
  assert.match(settingsSource, /handleExportOfficialFeeCodeCsv/);
  assert.match(settingsSource, /handleImportOfficialFeeCodeCsv/);
  assert.match(settingsSource, /handleReviewOfficialFeeCodeMasterCsv/);
  assert.match(settingsSource, /handleApplyOfficialFeeCodeMasterProposal/);
  assert.match(settingsSource, /handleExportOfficialFeeCodeMasterProposalReviewCsv/);
  assert.match(settingsSource, /replace\(\/\\D\/g, ''\)\.slice\(0, 9\)/);
  assert.match(settingsSource, /placeholder="9桁"/);
});

test('facility settings exposes an audited AI assist operating mode', () => {
  assert.match(settingsSource, /data-testid="ai-assist-mode-select"/);
  assert.match(settingsSource, /<option value="enabled">標準:/);
  assert.match(settingsSource, /<option value="limited">制限:/);
  assert.match(settingsSource, /<option value="disabled">停止:/);
  assert.match(settingsSource, /AI補助品質ゲート反映/);
  assert.match(settingsSource, /監査ログ記録に失敗したため、AI補助モードを元に戻しました/);
});
