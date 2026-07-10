import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  buildStaffAccessRecoveryAuditDetail,
  buildStaffAccessRecoveryCheckRequest,
  buildStaffAccessRecoveryCheckRequestChecklist,
  buildStaffAccessRecoveryChecklist,
  buildStaffAccessRecoveryCsv,
  buildStaffAccessRecoveryEvidenceTemplate,
  buildStaffAccessRecoveryMonthlyReview,
  buildStaffAccessRecoveryMonthlyReviewCsv,
  buildStaffAccessRecoveryReview,
  buildStaffAccessRecoveryReviewFromAuditLogs,
  type StaffAccessRecoveryEvidenceInput
} from './staff_access_recovery_review.ts';
import type { AuditLog } from '../db/types.ts';

const generatedAt = new Date('2026-07-07T11:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const reviewScript = readFileSync(new URL('../../scripts/runStaffAccessRecoveryReview.ts', import.meta.url), 'utf8');

function completeEvidence(overrides: Partial<StaffAccessRecoveryEvidenceInput> = {}): StaffAccessRecoveryEvidenceInput {
  return {
    reviewId: 'staff-access-review-001',
    capturedAt: '2026-07-07T10:00:00.000Z',
    operatorReviewId: 'staff-access-review-001',
    sourceArtifactSha256: 'c'.repeat(64),
    noPatientDataConfirmed: true,
    noStaffNamesConfirmed: true,
    noFacilityNameConfirmed: true,
    noRawAuditDetailsConfirmed: true,
    cases: [
      {
        caseId: 'case-device-001',
        reason: 'device_migration',
        targetRole: 'admin',
        backupBeforeChangeConfirmed: true,
        externalStorageConfirmed: true,
        adminRemainsConfirmed: true,
        restoreDrillConfirmed: true,
        auditLogRecorded: true,
        ownerReviewCompleted: true
      },
      {
        caseId: 'case-retire-001',
        reason: 'staff_retirement',
        targetRole: 'pharmacist',
        backupBeforeChangeConfirmed: true,
        externalStorageConfirmed: true,
        adminRemainsConfirmed: true,
        credentialResetOrRevokedConfirmed: true,
        retirementRecordConfirmed: true,
        auditLogRecorded: true,
        ownerReviewCompleted: true
      },
      {
        caseId: 'case-passkey-001',
        reason: 'passkey_lost',
        targetRole: 'clerk',
        backupBeforeChangeConfirmed: true,
        externalStorageConfirmed: true,
        adminRemainsConfirmed: true,
        fallbackLoginConfirmed: true,
        credentialResetOrRevokedConfirmed: true,
        auditLogRecorded: true,
        ownerReviewCompleted: true
      }
    ],
    ...overrides
  };
}

test('buildStaffAccessRecoveryReview passes with all three staff access scenarios and complete provenance', () => {
  const review = buildStaffAccessRecoveryReview({
    generatedAt,
    evidence: completeEvidence()
  });

  assert.strictEqual(review.type, 'yakureki-staff-access-recovery-review');
  assert.strictEqual(review.schemaVersion, 1);
  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.readyForStaffAccessChange, true);
  assert.strictEqual(review.caseCount, 3);
  assert.strictEqual(review.passCaseCount, 3);
  assert.strictEqual(review.reasonCounts.device_migration, 1);
  assert.strictEqual(review.reasonCounts.staff_retirement, 1);
  assert.strictEqual(review.reasonCounts.passkey_lost, 1);
  assert.strictEqual(review.evidenceIntegrity.status, 'pass');
  assert.ok(review.gates.every((gate) => gate.status === 'pass'));
});

test('buildStaffAccessRecoveryReview blocks when admin survival, backup, and reason-specific controls are missing', () => {
  const review = buildStaffAccessRecoveryReview({
    generatedAt,
    evidence: completeEvidence({
      cases: [{
        caseId: 'case-retire-001',
        reason: 'staff_retirement',
        targetRole: 'admin',
        adminRemainsConfirmed: false,
        backupBeforeChangeConfirmed: false,
        credentialResetOrRevokedConfirmed: false,
        retirementRecordConfirmed: false,
        auditLogRecorded: false,
        ownerReviewCompleted: false
      }]
    })
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.readyForStaffAccessChange, false);
  assert.strictEqual(review.blockedCaseCount, 1);
  assert.strictEqual(review.missingReasonCount, 2);
  assert.ok(review.gates.some((gate) => gate.id === 'admin_survival' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'scenario_coverage' && gate.status === 'attention'));
  assert.ok(review.nextActions.some((action) => action.includes('管理者')));
});

test('buildStaffAccessRecoveryReview keeps missing external storage as attention, not pass', () => {
  const review = buildStaffAccessRecoveryReview({
    generatedAt,
    evidence: completeEvidence({
      cases: [
        {
          ...completeEvidence().cases![0],
          externalStorageConfirmed: false
        },
        completeEvidence().cases![1],
        completeEvidence().cases![2]
      ]
    })
  });

  assert.strictEqual(review.status, 'attention');
  assert.strictEqual(review.readyForStaffAccessChange, false);
  assert.ok(review.gates.some((gate) => gate.id === 'backup_external_storage' && gate.status === 'attention'));
});

test('buildStaffAccessRecoveryReviewFromAuditLogs returns undefined without staff access events', () => {
  const review = buildStaffAccessRecoveryReviewFromAuditLogs({
    generatedAt,
    auditLogs: [{
      logId: 'audit-log-secret-001',
      timestamp: '2026-07-07T09:00:00.000Z',
      userId: 'admin-secret',
      userName: '管理者 太郎',
      userRole: 'admin',
      actionType: 'backup_export',
      details: 'バックアップを書き出しました。'
    }]
  });

  assert.strictEqual(review, undefined);
});

test('buildStaffAccessRecoveryReviewFromAuditLogs summarizes staff access logs without raw names or log ids', () => {
  const auditLogs: AuditLog[] = [
    {
      logId: 'backup-secret-001',
      timestamp: '2026-07-07T08:50:00.000Z',
      userId: 'admin-secret',
      userName: '管理者 太郎',
      userRole: 'admin',
      actionType: 'backup_export',
      details: '秘密薬局の暗号化バックアップを書き出しました。'
    },
    {
      logId: 'storage-secret-001',
      timestamp: '2026-07-07T08:55:00.000Z',
      userId: 'admin-secret',
      userName: '管理者 太郎',
      userRole: 'admin',
      actionType: 'backup_external_storage',
      details: '外部保存先 /Users/example/secret に保存しました。'
    },
    {
      logId: 'drill-secret-001',
      timestamp: '2026-07-07T09:00:00.000Z',
      userId: 'admin-secret',
      userName: '管理者 太郎',
      userRole: 'admin',
      actionType: 'backup_drill',
      details: '復旧テストを実施しました。'
    },
    {
      logId: 'access-secret-001',
      timestamp: '2026-07-07T10:00:00.000Z',
      userId: 'admin-secret',
      userName: '管理者 太郎',
      userRole: 'admin',
      actionType: 'staff_credential_recovery',
      details: 'スタッフ認証復旧 / 理由 パスキー紛失 / 操作 パスワード再設定 / 対象 薬剤師 花子 (pharmacist) / 確認者 管理者 太郎 / 判定 対応準備OK / 残対応 0件 / メモあり'
    },
    {
      logId: 'delete-secret-001',
      timestamp: '2026-07-07T11:00:00.000Z',
      userId: 'admin-secret',
      userName: '管理者 太郎',
      userRole: 'admin',
      actionType: 'staff_delete',
      details: 'スタッフ削除: スタッフ「退職 花子 (pharmacist)」を削除しました。'
    }
  ];

  const review = buildStaffAccessRecoveryReviewFromAuditLogs({
    generatedAt,
    auditLogs,
    sourceArtifactSha256: 'd'.repeat(64)
  });

  assert.ok(review);
  assert.strictEqual(review.type, 'yakureki-staff-access-recovery-review');
  assert.strictEqual(review.caseCount, 2);
  assert.strictEqual(review.reasonCounts.passkey_lost, 1);
  assert.strictEqual(review.reasonCounts.staff_retirement, 1);
  assert.strictEqual(review.cases[0].reason, 'passkey_lost');
  assert.strictEqual(review.cases[0].targetRole, 'pharmacist');
  assert.strictEqual(review.cases[0].blockedCheckCount, 0);
  assert.strictEqual(review.evidenceIntegrity.status, 'pass');
  assert.strictEqual(review.status, 'attention');
  assert.ok(review.gates.some((gate) => gate.id === 'scenario_coverage' && gate.status === 'attention'));
  assert.doesNotMatch(
    JSON.stringify(review),
    /薬剤師 花子|管理者 太郎|退職 花子|秘密薬局|access-secret-001|delete-secret-001|admin-secret|\/Users\/example\/secret/
  );
});

test('buildStaffAccessRecoveryMonthlyReview closes months with no staff access events while keeping training guidance', () => {
  const review = buildStaffAccessRecoveryMonthlyReview([
    {
      logId: 'backup-secret-001',
      timestamp: '2026-07-07T09:00:00.000Z',
      userId: 'admin-secret',
      userName: '管理者 太郎',
      userRole: 'admin',
      actionType: 'backup_export',
      details: 'バックアップを書き出しました。'
    }
  ], generatedAt);
  const csv = buildStaffAccessRecoveryMonthlyReviewCsv(review);

  assert.strictEqual(review.type, 'yakureki-staff-access-recovery-monthly-review');
  assert.strictEqual(review.monthKey, '2026-07');
  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.actionLabel, '対象操作なし');
  assert.strictEqual(review.readyForMonthlyClose, true);
  assert.strictEqual(review.eventCaseCount, 0);
  assert.strictEqual(review.readinessScenarioComplete, false);
  assert.match(csv, /対象操作なし/);
  assert.doesNotMatch(csv + JSON.stringify(review), /管理者 太郎|backup-secret-001|admin-secret/);
});

test('buildStaffAccessRecoveryMonthlyReview summarizes only the target month and keeps raw audit details out', () => {
  const auditLogs: AuditLog[] = [
    {
      logId: 'backup-secret-001',
      timestamp: '2026-06-30T23:50:00.000Z',
      userId: 'admin-secret',
      userName: '管理者 太郎',
      userRole: 'admin',
      actionType: 'backup_export',
      details: '秘密薬局の暗号化バックアップを書き出しました。'
    },
    {
      logId: 'storage-secret-001',
      timestamp: '2026-06-30T23:55:00.000Z',
      userId: 'admin-secret',
      userName: '管理者 太郎',
      userRole: 'admin',
      actionType: 'backup_external_storage',
      details: '外部保存先 /Users/example/secret に保存しました。'
    },
    {
      logId: 'old-access-secret-001',
      timestamp: '2026-06-29T10:00:00.000Z',
      userId: 'admin-secret',
      userName: '管理者 太郎',
      userRole: 'admin',
      actionType: 'staff_credential_recovery',
      details: 'スタッフ認証復旧 / 理由 端末移行 / 操作 退職前チェック記録 / 対象 薬剤師 前月 (pharmacist) / 確認者 管理者 太郎 / 判定 対応準備OK / 残対応 0件'
    },
    {
      logId: 'access-secret-001',
      timestamp: '2026-07-01T09:00:00.000Z',
      userId: 'admin-secret',
      userName: '管理者 太郎',
      userRole: 'admin',
      actionType: 'staff_credential_recovery',
      details: 'スタッフ認証復旧 / 理由 パスキー紛失 / 操作 パスキー解除 / 対象 事務 花子 (clerk) / 確認者 管理者 太郎 / 判定 対応準備OK / 残対応 0件'
    }
  ];

  const review = buildStaffAccessRecoveryMonthlyReview(auditLogs, generatedAt, {
    sourceArtifactSha256: 'e'.repeat(64)
  });
  const csv = buildStaffAccessRecoveryMonthlyReviewCsv(review);

  assert.strictEqual(review.monthKey, '2026-07');
  assert.strictEqual(review.status, 'attention');
  assert.strictEqual(review.readyForMonthlyClose, true);
  assert.strictEqual(review.eventCaseCount, 1);
  assert.strictEqual(review.staffCredentialRecoveryLogCount, 1);
  assert.strictEqual(review.staffDeleteLogCount, 0);
  assert.strictEqual(review.reasonCounts.passkey_lost, 1);
  assert.strictEqual(review.reasonCounts.device_migration, 0);
  assert.strictEqual(review.staffAccessRecoveryReview?.cases[0].targetRole, 'clerk');
  assert.strictEqual(review.staffAccessRecoveryReview?.cases[0].blockedCheckCount, 0);
  assert.strictEqual(review.evidenceIntegrityStatus, 'pass');
  assert.match(csv, /2026年7月/);
  assert.match(csv, /未確認 2件/);
  assert.doesNotMatch(
    csv + JSON.stringify(review),
    /事務 花子|管理者 太郎|薬剤師 前月|秘密薬局|access-secret-001|old-access-secret-001|admin-secret|\/Users\/example\/secret/
  );
});

test('staff access recovery review exports privacy-safe CSV, checklist, template, audit detail, and CLI contract', () => {
  const review = buildStaffAccessRecoveryReview({
    generatedAt,
    evidence: completeEvidence({
      reviewId: '=review',
      cases: [{
        ...completeEvidence().cases![0],
        caseId: '=case'
      }]
    })
  });
  const csv = buildStaffAccessRecoveryCsv(review);
  const checklist = buildStaffAccessRecoveryChecklist(review);
  const template = buildStaffAccessRecoveryEvidenceTemplate({ generatedAt, reviewId: '=review' });
  const auditDetail = buildStaffAccessRecoveryAuditDetail(review);

  assert.match(csv, /"'=review/);
  assert.match(csv, /"'=case/);
  assert.match(checklist, /スタッフ復旧・退職対応レビュー/);
  assert.match(checklist, /パスキー紛失/);
  assert.strictEqual(template.type, 'yakureki-staff-access-recovery-evidence-template');
  assert.strictEqual(template.cases.length, 3);
  assert.match(auditDetail, /スタッフ復旧確認/);
  assert.doesNotMatch(csv + checklist + JSON.stringify(template) + auditDetail, /山田太郎|薬局太郎|patient-001|credential-id-secret|public-key-secret|password-hash-secret|salt-secret|secret-token|\/Users/i);
  assert.strictEqual(
    packageJson.scripts['staff:access-recovery-review'],
    'tsx scripts/runStaffAccessRecoveryReview.ts'
  );
  assert.match(reviewScript, /YAKUREKI_STAFF_ACCESS_RECOVERY_EVIDENCE/);
  assert.match(reviewScript, /staff-access-recovery-review\.json/);
  assert.match(reviewScript, /staff-access-recovery-check-request\.json/);
  assert.match(reviewScript, /staff-access-recovery-check-request\.txt/);
  assert.match(reviewScript, /YAKUREKI_STAFF_ACCESS_RECOVERY_REQUEST_ONLY/);
});

test('staff access recovery check request lists privacy, scenario, admin and reason-specific evidence without free text', () => {
  const request = buildStaffAccessRecoveryCheckRequest({ generatedAt, reviewId: 'staff-access-recovery-202607' });

  assert.strictEqual(request.type, 'yakureki-staff-access-recovery-check-request');
  assert.strictEqual(request.reviewId, 'staff-access-recovery-202607');
  assert.strictEqual(request.items.length, 5);
  assert.ok(request.items.every((item) => item.required));
  const ids = request.items.map((item) => item.id);
  assert.deepStrictEqual(ids, [
    'privacy_confirmation',
    'scenario_coverage',
    'admin_survival_and_backup',
    'reason_specific_controls',
    'audit_and_owner_review'
  ]);

  const checklist = buildStaffAccessRecoveryCheckRequestChecklist(request);
  assert.match(checklist, /証跡提出依頼/);
  assert.match(checklist, /パスキー紛失/);
  assert.match(checklist, /責任者確認/);

  const serialized = JSON.stringify(request) + checklist;
  for (const sensitiveValue of ['山田太郎', '薬局太郎', 'patient-001', 'credential-id-secret', '/Users/secret']) {
    assert.doesNotMatch(serialized, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
