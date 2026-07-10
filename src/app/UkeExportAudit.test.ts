import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const dashboardSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const printSource = readFileSync(new URL('./print/[visitId]/page.tsx', import.meta.url), 'utf8');

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing section start: ${start}`);
  assert.ok(endIndex > startIndex, `Missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('single-visit UKE export rolls back claim lifecycle when audit logging fails before download', () => {
  const persistBody = section(printSource, 'const persistClaimLifecycle = async', 'const handleDownloadUke = async');
  const downloadBody = section(printSource, 'const handleDownloadUke = async', 'const handleRegisterReturn = async');

  assert.match(persistBody, /const previousLifecycle = \(visitDoc\.toJSON\(\) as any\)\.claimLifecycle/);
  assert.match(persistBody, /const auditOk = await logAuditAction\(/);
  assert.match(persistBody, /if \(!auditOk\)/);
  assert.match(persistBody, /await visitDoc\.patch\(\{ claimLifecycle: rollbackLifecycle \}\)/);
  assert.match(persistBody, /請求状態変更の監査ログ記録に失敗したため、変更を取り消しました。/);

  assert.match(downloadBody, /if \(!db\) \{/);
  assert.match(downloadBody, /const auditOk = await logAuditAction\(/);
  assert.match(downloadBody, /UKE出力の監査ログ記録に失敗したため、出力を中止しました。/);
  const auditIndex = downloadBody.indexOf('const auditOk = await logAuditAction(');
  const blobIndex = downloadBody.indexOf('const blob = new Blob([ukeContent');
  assert.ok(auditIndex > -1);
  assert.ok(blobIndex > auditIndex);
});

test('monthly UKE export records audit logs before download and rolls back lifecycle changes on failure', () => {
  const body = section(dashboardSource, 'const handleDownloadClaimWorkbenchUke = useCallback', 'const handleImportClaimAcceptanceResults');

  assert.match(body, /const claimLifecycleRollbacks: Array<\{ visitDoc: any; previousLifecycle: any \}> = \[\]/);
  assert.match(body, /const lifecycleAuditOk = await logAuditAction\(/);
  assert.match(body, /if \(!lifecycleAuditOk\)/);
  assert.match(body, /const exportAuditOk = await logAuditAction\(/);
  assert.match(body, /if \(!exportAuditOk\)/);
  assert.match(body, /月次一括UKE出力の監査ログ記録に失敗したため、出力を中止しました。/);
  assert.match(body, /Failed to rollback monthly claim lifecycle changes/);
  assert.match(body, /await rollback\.visitDoc\.patch\(\{ claimLifecycle: rollback\.previousLifecycle \}\)/);

  const exportAuditIndex = body.indexOf('const exportAuditOk = await logAuditAction(');
  const blobIndex = body.indexOf('const blob = new Blob([bundle.content');
  assert.ok(exportAuditIndex > -1);
  assert.ok(blobIndex > exportAuditIndex);
});

test('monthly UKE allFields issue CSV is audit-logged before export', () => {
  const body = section(dashboardSource, 'if (preflightReport.errorResults.length > 0)', 'if (preflightReport.warningResults.length > 0)');

  const auditIndex = body.indexOf('const auditOk = await logAuditAction(');
  const downloadIndex = body.indexOf('downloadUtf8Csv(allFieldIssueFileName');
  assert.ok(auditIndex > -1);
  assert.ok(downloadIndex > auditIndex);
  assert.match(body, /月次一括UKE出力停止ログの監査ログ記録に失敗したため、確認CSVの出力を中止しました。/);
});

test('monthly official readiness CSV is audit-logged before export without lifecycle changes', () => {
  const body = section(dashboardSource, 'const handleDownloadClaimWorkbenchOfficialReadiness = useCallback', 'const handleDownloadClaimWorkbenchOfficialUke = useCallback');

  const auditIndex = body.indexOf('const auditOk = await logAuditAction(');
  const downloadIndex = body.indexOf('downloadUtf8Csv(fileName, preflightReport.officialReadinessReviewCsv)');
  assert.ok(auditIndex > -1);
  assert.ok(downloadIndex > auditIndex);
  assert.match(body, /月次一括UKE公式提出準備チェックの監査ログ記録に失敗したため、確認CSVの出力を中止しました。/);
  assert.doesNotMatch(body, /markClaimExported/);
  assert.doesNotMatch(body, /claimLifecycleRollbacks/);
});

test('monthly official UKE is audit-logged before download and rolls lifecycle changes back on failure', () => {
  const body = section(dashboardSource, 'const handleDownloadClaimWorkbenchOfficialUke = useCallback', 'const handleDownloadClaimWorkbenchUke = useCallback');

  assert.match(body, /buildMonthlyClaimOfficialUkeBundle\(cases, results\)/);
  assert.match(body, /const claimLifecycleRollbacks: Array<\{ visitDoc: any; previousLifecycle: any \}> = \[\]/);
  assert.match(body, /markClaimExported\(/);
  assert.match(body, /月次公式UKEの請求状態監査ログ記録に失敗しました/);
  assert.match(body, /月次公式UKE出力の監査ログ記録に失敗したため、出力を中止しました。/);
  assert.match(body, /集計突合OK/);
  assert.match(body, /reconciliation\.totalSupplementalRecordCount/);
  assert.match(body, /reconciliation\.totalPrescriptionRecordCount/);
  assert.match(body, /reconciliation\.totalSplitRecordCount/);
  assert.match(body, /reconciliation\.goTotalPoints/);
  assert.match(body, /Failed to rollback monthly official claim lifecycle changes/);
  assert.match(body, /await rollback\.visitDoc\.patch\(\{ claimLifecycle: rollback\.previousLifecycle \}\)/);

  const reviewAuditIndex = body.indexOf('月次公式UKE出力停止: 公式提出準備の要対応');
  const reviewDownloadIndex = body.indexOf('downloadUtf8Csv(reviewFileName, preflightReport.officialReadinessReviewCsv)');
  const exportAuditIndex = body.indexOf('const exportAuditOk = await logAuditAction(');
  const blobIndex = body.indexOf('const blob = new Blob([bundle.content');
  assert.ok(reviewAuditIndex > -1);
  assert.ok(reviewDownloadIndex > reviewAuditIndex);
  assert.ok(exportAuditIndex > -1);
  assert.ok(blobIndex > exportAuditIndex);
});

test('tutorial demo visits can never reach UKE output or external device handoff', () => {
  // 単票UKE: デモ受付はUKEファイルを出力しない
  const downloadBody = section(printSource, 'const handleDownloadUke = async', 'const handleRegisterReturn = async');
  assert.match(downloadBody, /isDemoVisit\(visitData\)/);
  assert.match(downloadBody, /チュートリアルのデモ受付のため、UKEファイルは出力できません/);
  const demoGuardIndex = downloadBody.indexOf('isDemoVisit(visitData)');
  const recordBuildIndex = downloadBody.indexOf('buildDispensingUkeRecords(');
  assert.ok(demoGuardIndex > -1 && demoGuardIndex < recordBuildIndex, 'demo guard must run before UKE records are built');

  // 外部調剤機器・POS: デモ受付は送信しない
  const deviceBody = section(printSource, 'const handlePharmacyDeviceOperation = async', 'const getElectronicPrescriptionDocumentKinds');
  assert.match(deviceBody, /isDemoVisit\(visitData\)/);
  assert.match(deviceBody, /チュートリアルのデモ受付のため、外部調剤機器・POSへは送信できません/);

  // 月次一括UKE: 対象受付の組み立て時点でデモ受付を除外する
  const casesBody = section(dashboardSource, 'const buildClaimWorkbenchUkeCases = useCallback', 'const handleDownloadClaimWorkbenchOfficialReadiness');
  assert.match(casesBody, /\.filter\(\(row\) => !isDemoVisit\(row\.visit\)\)/);
  assert.match(dashboardSource, /import \{ isDemoVisit \} from '@\/lib\/demo_data'/);
});
