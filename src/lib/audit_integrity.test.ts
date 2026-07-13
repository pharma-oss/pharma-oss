import { test } from 'node:test';
import assert from 'node:assert';
import type { AuditLog } from '../db/types.ts';
import {
  buildAuditLogCustodyChecklist,
  buildAuditLogExportJson,
  buildAuditLogRetentionLedgerCsv,
  buildAuditLogRetentionManagerReviewAuditDetail,
  buildAuditLogRetentionMonthlyReview,
  buildAuditLogRetentionMonthlyReviewCsv,
  buildAuditLogSignature,
  hashAuditLog,
  verifyAuditLogIntegrity
} from './audit_integrity.ts';

function makeAuditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    logId: 'log_1',
    timestamp: '2026-06-14T10:00:00.000Z',
    userId: 'pharm_1',
    userName: '薬剤師 一郎',
    userRole: 'pharmacist',
    actionType: 'uke_export',
    details: 'UKE出力を実行しました。',
    ...overrides
  };
}

test('buildAuditLogSignature signs audit logs with the previous integrity hash', async () => {
  const first = makeAuditLog();
  const signature = await buildAuditLogSignature(first, 'previous-hash');

  assert.strictEqual(signature.previousHash, 'previous-hash');
  assert.strictEqual(signature.integrityHash, await hashAuditLog(first, 'previous-hash'));
});

test('verifyAuditLogIntegrity validates a signed hash chain and detects tampering', async () => {
  const first = makeAuditLog();
  const signedFirst = {
    ...first,
    ...await buildAuditLogSignature(first)
  };
  const second = makeAuditLog({
    logId: 'log_2',
    timestamp: '2026-06-14T10:01:00.000Z',
    actionType: 'billing_toggle',
    details: '算定を変更しました。'
  });
  const signedSecond = {
    ...second,
    ...await buildAuditLogSignature(second, signedFirst.integrityHash)
  };

  const validReport = await verifyAuditLogIntegrity([signedSecond, signedFirst]);
  assert.strictEqual(validReport.total, 2);
  assert.strictEqual(validReport.signed, 2);
  assert.strictEqual(validReport.unsigned, 0);
  assert.strictEqual(validReport.invalid, 0);
  assert.strictEqual(validReport.isValid, true);
  assert.strictEqual(validReport.latestHash, signedSecond.integrityHash);

  const tamperedReport = await verifyAuditLogIntegrity([
    signedFirst,
    { ...signedSecond, details: '算定を無断で変更しました。' }
  ]);
  assert.strictEqual(tamperedReport.isValid, false);
  assert.ok(tamperedReport.invalid >= 1);
});

test('verifyAuditLogIntegrity reports legacy unsigned rows without breaking signed rows', async () => {
  const legacyLog = makeAuditLog({
    logId: 'log_legacy',
    timestamp: '2026-06-14T09:59:00.000Z',
    actionType: 'login',
    details: 'ログインしました。'
  });
  const signedLog = makeAuditLog({
    logId: 'log_signed',
    timestamp: '2026-06-14T10:00:00.000Z'
  });
  const signedRow = {
    ...signedLog,
    ...await buildAuditLogSignature(signedLog)
  };

  const report = await verifyAuditLogIntegrity([signedRow, legacyLog]);
  assert.strictEqual(report.total, 2);
  assert.strictEqual(report.signed, 1);
  assert.strictEqual(report.unsigned, 1);
  assert.strictEqual(report.invalid, 0);
  assert.strictEqual(report.isValid, true);
});

test('verifyAuditLogIntegrity verifies interleaved per-terminal chains independently', async () => {
  // メイン端末('hub-local')とサテライト('satellite-1')のログが時系列で交互に並ぶ状況。
  // 単一チェーン前提の検証ではすべて不整合になるが、端末別チェーンでは正常。
  const hubFirst = makeAuditLog({ logId: 'hub_1', timestamp: '2026-07-12T09:00:00.000Z', terminalId: 'hub-local' });
  const signedHubFirst = { ...hubFirst, ...await buildAuditLogSignature(hubFirst) };
  const satFirst = makeAuditLog({ logId: 'sat_1', timestamp: '2026-07-12T09:00:30.000Z', terminalId: 'satellite-1' });
  const signedSatFirst = { ...satFirst, ...await buildAuditLogSignature(satFirst) };
  const hubSecond = makeAuditLog({ logId: 'hub_2', timestamp: '2026-07-12T09:01:00.000Z', terminalId: 'hub-local' });
  const signedHubSecond = { ...hubSecond, ...await buildAuditLogSignature(hubSecond, signedHubFirst.integrityHash) };
  const satSecond = makeAuditLog({ logId: 'sat_2', timestamp: '2026-07-12T09:01:30.000Z', terminalId: 'satellite-1' });
  const signedSatSecond = { ...satSecond, ...await buildAuditLogSignature(satSecond, signedSatFirst.integrityHash) };

  const report = await verifyAuditLogIntegrity([signedHubFirst, signedSatFirst, signedHubSecond, signedSatSecond]);
  assert.strictEqual(report.invalid, 0);
  assert.strictEqual(report.isValid, true);
  assert.strictEqual(report.chains?.length, 2);

  const hubChain = report.chains?.find((chain) => chain.terminalId === 'hub-local');
  const satChain = report.chains?.find((chain) => chain.terminalId === 'satellite-1');
  assert.strictEqual(hubChain?.signed, 2);
  assert.strictEqual(hubChain?.segments, 1);
  assert.strictEqual(hubChain?.latestHash, signedHubSecond.integrityHash);
  assert.strictEqual(satChain?.signed, 2);
  assert.strictEqual(satChain?.latestHash, signedSatSecond.integrityHash);
});

test('verifyAuditLogIntegrity detects tampering inside one terminal chain without flagging others', async () => {
  const hubLog = makeAuditLog({ logId: 'hub_1', timestamp: '2026-07-12T09:00:00.000Z', terminalId: 'hub-local' });
  const signedHubLog = { ...hubLog, ...await buildAuditLogSignature(hubLog) };
  const satLog = makeAuditLog({ logId: 'sat_1', timestamp: '2026-07-12T09:00:30.000Z', terminalId: 'satellite-1' });
  const signedSatLog = { ...satLog, ...await buildAuditLogSignature(satLog) };

  const report = await verifyAuditLogIntegrity([
    signedHubLog,
    { ...signedSatLog, details: '改ざんされた内容' }
  ]);
  assert.strictEqual(report.isValid, false);
  const hubChain = report.chains?.find((chain) => chain.terminalId === 'hub-local');
  const satChain = report.chains?.find((chain) => chain.terminalId === 'satellite-1');
  assert.strictEqual(hubChain?.invalid, 0);
  assert.ok((satChain?.invalid || 0) >= 1);
});

test('verifyAuditLogIntegrity allows satellite session restarts as chain segments but detects missing middle links', async () => {
  // セッション1: sat_1 → sat_2、セッション2(メモリDB再起動): sat_3 は previousHash 空で開始
  const first = makeAuditLog({ logId: 'sat_1', timestamp: '2026-07-12T09:00:00.000Z', terminalId: 'satellite-1' });
  const signedFirst = { ...first, ...await buildAuditLogSignature(first) };
  const second = makeAuditLog({ logId: 'sat_2', timestamp: '2026-07-12T09:01:00.000Z', terminalId: 'satellite-1' });
  const signedSecond = { ...second, ...await buildAuditLogSignature(second, signedFirst.integrityHash) };
  const third = makeAuditLog({ logId: 'sat_3', timestamp: '2026-07-12T13:00:00.000Z', terminalId: 'satellite-1' });
  const signedThird = { ...third, ...await buildAuditLogSignature(third) };

  const healthy = await verifyAuditLogIntegrity([signedFirst, signedSecond, signedThird]);
  assert.strictEqual(healthy.isValid, true);
  assert.strictEqual(healthy.chains?.[0]?.segments, 2);

  // sat_1 を削除すると sat_2 の previousHash が解決できず検出される
  const missingMiddle = await verifyAuditLogIntegrity([signedSecond, signedThird]);
  assert.strictEqual(missingMiddle.isValid, false);
});

test('verifyAuditLogIntegrity keeps legacy logs (no terminalId) verifying with their original hashes', async () => {
  // terminalId 追加前に署名された既存ログのペイロードは変わらないこと(後方互換)
  const legacy = makeAuditLog();
  const signedLegacy = { ...legacy, ...await buildAuditLogSignature(legacy) };
  const report = await verifyAuditLogIntegrity([signedLegacy]);
  assert.strictEqual(report.isValid, true);
  assert.strictEqual(report.chains?.[0]?.terminalId, 'legacy');
});

test('buildAuditLogExportJson creates a chronological audit export payload', async () => {
  const first = makeAuditLog();
  const signedFirst = {
    ...first,
    ...await buildAuditLogSignature(first)
  };
  const second = makeAuditLog({
    logId: 'log_2',
    timestamp: '2026-06-14T10:02:00.000Z',
    actionType: 'audit_export',
    details: '監査ログJSONを書き出しました。'
  });
  const signedSecond = {
    ...second,
    ...await buildAuditLogSignature(second, signedFirst.integrityHash)
  };
  const report = await verifyAuditLogIntegrity([signedSecond, signedFirst]);
  const payload = JSON.parse(buildAuditLogExportJson(
    [signedSecond, signedFirst],
    report,
    new Date('2026-06-14T11:00:00.000Z')
  ));

  assert.strictEqual(payload.app, 'yakureki');
  assert.strictEqual(payload.type, 'audit-log-export');
  assert.strictEqual(payload.version, 1);
  assert.strictEqual(payload.exportedAt, '2026-06-14T11:00:00.000Z');
  assert.strictEqual(payload.integrity.latestHash, signedSecond.integrityHash);
  assert.strictEqual(payload.custody.label, '責任者保全欄');
  assert.strictEqual(payload.custody.latestHash, signedSecond.integrityHash);
  assert.strictEqual(payload.custody.wormRetention.label, '外部WORM保存確認');
  assert.deepStrictEqual(payload.custody.wormRetention.confirmation, {
    storageName: '',
    retentionPeriod: '',
    fileName: '',
    retentionLockVerified: false,
    readbackVerified: false,
    latestHashMatched: false,
    note: ''
  });
  assert.deepStrictEqual(payload.custody.managerConfirmation, {
    confirmedBy: '',
    confirmedAt: '',
    storageLocation: '',
    latestHashCopied: false,
    externalStorageVerified: false,
    note: ''
  });
  assert.ok(payload.custody.requiredActions.some((action: string) => action.includes('外部保管場所')));
  assert.deepStrictEqual(payload.logs.map((log: AuditLog) => log.logId), ['log_1', 'log_2']);
});

test('buildAuditLogCustodyChecklist creates manager custody fields for external retention', async () => {
  const log = makeAuditLog();
  const signedLog = {
    ...log,
    ...await buildAuditLogSignature(log)
  };
  const report = await verifyAuditLogIntegrity([signedLog]);
  const custody = buildAuditLogCustodyChecklist(report);

  assert.strictEqual(custody.label, '責任者保全欄');
  assert.strictEqual(custody.latestHash, signedLog.integrityHash);
  assert.ok(custody.requiredActions.some((action) => action.includes('最新ハッシュ')));
  assert.strictEqual(custody.managerConfirmation.confirmedBy, '');
  assert.strictEqual(custody.managerConfirmation.latestHashCopied, false);
  assert.strictEqual(custody.managerConfirmation.externalStorageVerified, false);
  assert.ok(custody.wormRetention.requiredControls.some((control) => control.includes('上書き・削除')));
  assert.strictEqual(custody.wormRetention.confirmation.latestHashMatched, false);
});

test('buildAuditLogRetentionLedgerCsv creates a WORM retention ledger without patient details', async () => {
  const log = makeAuditLog({
    patientId: 'pt_1',
    patientName: '山田 太郎'
  });
  const signedLog = {
    ...log,
    ...await buildAuditLogSignature(log)
  };
  const report = await verifyAuditLogIntegrity([signedLog]);
  const csv = buildAuditLogRetentionLedgerCsv(
    report,
    'yakureki_audit_logs_20260614_110000.json',
    new Date('2026-06-14T11:05:00.000Z')
  );
  const latestHash = signedLog.integrityHash;
  assert.ok(latestHash);

  assert.match(csv, /^"区分","項目","値","補足"/);
  assert.match(csv, /"監査ログJSON","想定ファイル名","yakureki_audit_logs_20260614_110000\.json"/);
  assert.match(csv, /"外部WORM保存","上書き・削除不可確認","未確認"/);
  assert.match(csv, /"責任者確認","最新ハッシュ照合","未確認"/);
  assert.match(csv, new RegExp(latestHash));
  assert.doesNotMatch(csv, /山田|太郎|pt_1/);
});

test('buildAuditLogRetentionMonthlyReview marks the month complete when JSON and ledger are exported', async () => {
  const auditJson = makeAuditLog({
    logId: 'log_json',
    timestamp: '2026-06-14T11:00:00.000Z',
    actionType: 'audit_export',
    details: '監査ログJSONエクスポート: yakureki_audit_logs_20260614_110000.json に 3件を書き出しました。'
  });
  const signedJson = {
    ...auditJson,
    ...await buildAuditLogSignature(auditJson)
  };
  const jsonHash = signedJson.integrityHash;
  assert.ok(jsonHash);
  const ledger = makeAuditLog({
    logId: 'log_ledger',
    timestamp: '2026-06-14T11:05:00.000Z',
    actionType: 'audit_export',
    details: `監査ログ保全台帳CSVエクスポート: yakureki_audit_retention_ledger_20260614_110500.csv に最新ハッシュ ${jsonHash} の外部WORM保存確認欄を書き出しました。`
  });
  const signedLedger = {
    ...ledger,
    ...await buildAuditLogSignature(ledger, jsonHash)
  };
  const previousMonthLedger = makeAuditLog({
    logId: 'log_old_ledger',
    timestamp: '2026-05-31T11:05:00.000Z',
    actionType: 'audit_export',
    details: '監査ログ保全台帳CSVエクスポート: old.csv に最新ハッシュ old の外部WORM保存確認欄を書き出しました。'
  });
  const report = await verifyAuditLogIntegrity([signedJson, signedLedger]);
  const review = buildAuditLogRetentionMonthlyReview(
    [previousMonthLedger, signedLedger, signedJson],
    report,
    new Date('2026-06-30T12:00:00.000Z')
  );

  assert.strictEqual(review.monthKey, '2026-06');
  assert.strictEqual(review.status, 'complete');
  assert.strictEqual(review.statusLabel, '棚卸完了');
  assert.strictEqual(review.auditJsonExportCount, 1);
  assert.strictEqual(review.retentionLedgerExportCount, 1);
  assert.strictEqual(review.latestAuditJsonExport?.fileName, 'yakureki_audit_logs_20260614_110000.json');
  assert.strictEqual(review.latestRetentionLedgerExport?.fileName, 'yakureki_audit_retention_ledger_20260614_110500.csv');
  assert.strictEqual(review.managerReviewStatus, 'pending');
  assert.strictEqual(review.managerReviewLabel, '責任者未確認');
  assert.ok(review.managerReviewRequiredActions.some((action) => action.includes('承認')));
  assert.deepStrictEqual(review.returnReasons, []);
});

test('buildAuditLogRetentionMonthlyReview tracks manager approval after the latest evidence', async () => {
  const auditJson = makeAuditLog({
    logId: 'log_json',
    timestamp: '2026-06-14T11:00:00.000Z',
    actionType: 'audit_export',
    details: '監査ログJSONエクスポート: yakureki_audit_logs_20260614_110000.json に 3件を書き出しました。'
  });
  const signedJson = {
    ...auditJson,
    ...await buildAuditLogSignature(auditJson)
  };
  const jsonHash = signedJson.integrityHash;
  assert.ok(jsonHash);
  const ledger = makeAuditLog({
    logId: 'log_ledger',
    timestamp: '2026-06-14T11:05:00.000Z',
    actionType: 'audit_export',
    details: `監査ログ保全台帳CSVエクスポート: yakureki_audit_retention_ledger_20260614_110500.csv に最新ハッシュ ${jsonHash} の外部WORM保存確認欄を書き出しました。`
  });
  const signedLedger = {
    ...ledger,
    ...await buildAuditLogSignature(ledger, jsonHash)
  };
  const baseReport = await verifyAuditLogIntegrity([signedJson, signedLedger]);
  const baseReview = buildAuditLogRetentionMonthlyReview(
    [signedLedger, signedJson],
    baseReport,
    new Date('2026-06-30T12:00:00.000Z')
  );
  const detail = buildAuditLogRetentionManagerReviewAuditDetail(baseReview, '管理者');
  const approval = makeAuditLog({
    logId: 'log_approval',
    timestamp: '2026-06-14T11:10:00.000Z',
    actionType: 'audit_retention_approval',
    userName: '管理者',
    userRole: 'admin',
    details: detail
  });
  const signedApproval = {
    ...approval,
    ...await buildAuditLogSignature(approval, signedLedger.integrityHash)
  };
  const report = await verifyAuditLogIntegrity([signedJson, signedLedger, signedApproval]);
  const review = buildAuditLogRetentionMonthlyReview(
    [signedApproval, signedLedger, signedJson],
    report,
    new Date('2026-06-30T12:00:00.000Z')
  );
  const csv = buildAuditLogRetentionMonthlyReviewCsv(review);

  assert.match(detail, /^監査ログ保全責任者承認: 2026年06月/);
  assert.match(detail, /確認者 管理者/);
  assert.strictEqual(review.managerReviewStatus, 'approved');
  assert.strictEqual(review.managerReviewLabel, '責任者承認済み');
  assert.strictEqual(review.latestManagerReview?.decision, 'approved');
  assert.strictEqual(review.latestManagerReview?.reviewerName, '管理者');
  assert.match(csv, /"責任者確認","状態","責任者承認済み"/);
});

test('buildAuditLogRetentionMonthlyReview asks for return when the latest JSON has no ledger', async () => {
  const ledger = makeAuditLog({
    logId: 'log_ledger',
    timestamp: '2026-06-14T11:05:00.000Z',
    actionType: 'audit_export',
    details: '監査ログ保全台帳CSVエクスポート: yakureki_audit_retention_ledger_20260614_110500.csv に最新ハッシュ oldhash の外部WORM保存確認欄を書き出しました。'
  });
  const auditJson = makeAuditLog({
    logId: 'log_json',
    timestamp: '2026-06-14T12:00:00.000Z',
    actionType: 'audit_export',
    details: '監査ログJSONエクスポート: yakureki_audit_logs_20260614_120000.json に 4件を書き出しました。',
    patientId: 'pt_1',
    patientName: '山田 太郎'
  });
  const signedLedger = {
    ...ledger,
    ...await buildAuditLogSignature(ledger)
  };
  const ledgerHash = signedLedger.integrityHash;
  assert.ok(ledgerHash);
  const signedJson = {
    ...auditJson,
    ...await buildAuditLogSignature(auditJson, ledgerHash)
  };
  const report = await verifyAuditLogIntegrity([signedLedger, signedJson]);
  const review = buildAuditLogRetentionMonthlyReview(
    [signedJson, signedLedger],
    report,
    new Date('2026-06-30T12:00:00.000Z')
  );
  const csv = buildAuditLogRetentionMonthlyReviewCsv(review);

  assert.strictEqual(review.status, 'needs_review');
  assert.strictEqual(review.managerReviewStatus, 'pending');
  assert.ok(review.returnReasons.some((reason) => reason.includes('最新の監査ログJSON後')));
  assert.ok(review.requiredActions.some((action) => action.includes('保全台帳CSV')));
  assert.match(buildAuditLogRetentionManagerReviewAuditDetail(review, '管理者'), /^監査ログ保全責任者差し戻し: 2026年06月/);
  assert.match(csv, /"月次棚卸","判定","責任者確認待ち","責任者へ差し戻し"/);
  assert.match(csv, /"差し戻し","理由"/);
  assert.doesNotMatch(csv, /山田|太郎|pt_1/);
});
