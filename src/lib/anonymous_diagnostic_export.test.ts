import { test } from 'node:test';
import assert from 'node:assert';
import type { AuditLog, FacilitySettings, User } from '../db/types.ts';
import {
  buildAuditLogRetentionMonthlyReview,
  type AuditIntegrityReport
} from './audit_integrity.ts';
import {
  DEFAULT_BACKUP_SCHEDULE_POLICY,
  buildBackupGenerationReview,
  buildBackupScheduleReview
} from './backup.ts';
import { buildInitialSetupChecklist } from './onboarding.ts';
import { getOfficialAuditBlockers, getOfficialAuditSummary } from './official_audit.ts';
import { buildOperationalClosingMonthlyReview } from './operational_closing_review.ts';
import { buildAiSuggestionFeedbackMonthlyReview } from './ai_suggestion_feedback.ts';
import { buildExternalConnectorReadinessReport } from './external_connector_readiness.ts';
import {
  buildDrugStockCsvMigrationPreview,
  buildMigrationPackageReadinessReview,
  buildPatientCsvMigrationPreview,
  buildSoapCsvMigrationPreview,
  buildVisitCsvMigrationPreview
} from './migration_csv.ts';
import { buildMigrationTrialAcceptanceReview } from './migration_trial_acceptance.ts';
import { buildOnlineEligibilityFieldReadinessReport } from './online_eligibility_field_readiness.ts';
import {
  buildPilotKpiReview,
  type PilotKpiSnapshotInput
} from './pilot_kpi_review.ts';
import { buildPrintMediaFieldVerificationReview } from './print_media_field_verification.ts';
import { buildReleaseOpsAcceptanceReview } from './release_ops_acceptance.ts';
import { buildScheduledOpsContinuityReview } from './scheduled_ops_continuity.ts';
import {
  buildStaffAccessRecoveryMonthlyReview,
  buildStaffAccessRecoveryReview
} from './staff_access_recovery_review.ts';
import {
  buildAnonymousDiagnosticExport,
  buildAnonymousDiagnosticExportJson,
  makeAnonymousDiagnosticExportFileName
} from './anonymous_diagnostic_export.ts';

const generatedAt = new Date('2026-06-18T12:34:56.000Z');

const sensitiveSettings: FacilitySettings = {
  id: 'facility-secret',
  pharmacyName: '秘密薬局 渋谷店',
  pharmacyKana: 'ヒミツヤッキョク',
  pharmacyCode: '1312345',
  pharmacyPostalCode: '150-0000',
  pharmacyAddress: '東京都秘密区1-2-3',
  pharmacyPhone: '03-1111-2222',
  pharmacyFax: '03-3333-4444',
  registrationNumber: 'T9999999999999',
  ownerName: '開設者 秘密',
  managerName: '管理薬剤師 秘密',
  defaultPharmacistName: '薬剤師 花子',
  baseFeeCategory: '1',
  regionalSupportAddition: 'none',
  medicalDxAddition: true,
  postGenericAddition: '1',
  genericDispensingReduction: false,
  aiAssistMode: 'limited',
  officialFeeCodeOverrides: {
    base_fee_1: '999000001',
    medication_guidance_1: ''
  }
};

const staff: User[] = [
  {
    userId: 'staff-admin-secret',
    name: '管理者 太郎',
    role: 'admin',
    passwordHash: 'hash-secret',
    salt: 'salt-secret'
  },
  {
    userId: 'staff-pharmacist-secret',
    name: '薬剤師 花子',
    role: 'pharmacist',
    passkeyCredentialId: 'passkey-id-secret',
    passkeyPublicKey: 'passkey-public-key-secret'
  }
];

const auditLogs: AuditLog[] = [
  {
    logId: 'log-patient-secret',
    timestamp: '2026-06-18T08:00:00.000Z',
    userId: 'staff-admin-secret',
    userName: '管理者 太郎',
    userRole: 'admin',
    actionType: 'prescription_edit',
    patientId: 'P-SECRET-001',
    patientName: '患者 太郎',
    details: '患者 太郎 / 保険番号 INS-SECRET-999 / アムロジピンを変更'
  },
  {
    logId: 'log-backup-secret',
    timestamp: '2026-06-18T09:00:00.000Z',
    userId: 'staff-admin-secret',
    userName: '管理者 太郎',
    userRole: 'admin',
    actionType: 'backup_export',
    details: 'バックアップ書き出し: yakureki_backup_secret.json に10件のローカルデータを書き出しました。（パスワード暗号化保護）'
  },
  {
    logId: 'log-closing-secret',
    timestamp: '2026-06-18T10:00:00.000Z',
    userId: 'staff-pharmacist-secret',
    userName: '薬剤師 花子',
    userRole: 'pharmacist',
    actionType: 'daily_closing_approval',
    details: '日次締め承認: 秘密薬局 渋谷店 / 完了率 98% / 残タスク 0件 / 月次請求締め率 100%'
  },
  {
    logId: 'log-ai-secret',
    timestamp: '2026-06-18T11:00:00.000Z',
    userId: 'staff-pharmacist-secret',
    userName: '薬剤師 花子',
    userRole: 'pharmacist',
    actionType: 'ai_suggestion_review',
    details: 'AI補助提案確認: SOAP下書き / 採用 / 信頼度 0.82 / 店舗 秘密薬局 渋谷店 / 患者 太郎'
  }
];

const auditIntegrity: AuditIntegrityReport = {
  total: auditLogs.length,
  signed: 2,
  unsigned: 2,
  invalid: 0,
  isValid: true,
  latestHash: 'hash-derived-from-sensitive-source',
  firstSignedAt: '2026-06-18T09:00:00.000Z',
  lastSignedAt: '2026-06-18T11:00:00.000Z'
};

function pilotKpiSnapshots(): PilotKpiSnapshotInput[] {
  const weeks = [
    ['2026-06-01', '2026-06-07'],
    ['2026-06-08', '2026-06-14'],
    ['2026-06-15', '2026-06-21'],
    ['2026-06-22', '2026-06-28']
  ];
  const snapshots: PilotKpiSnapshotInput[] = [];
  for (const storeId of ['pilot-store-secret-1', 'pilot-store-secret-2']) {
    for (const [weekStart, weekEnd] of weeks) {
      const lateWeek = storeId === 'pilot-store-secret-1'
        && (weekStart === '2026-06-15' || weekStart === '2026-06-22');
      snapshots.push({
        storeId,
        weekStart,
        weekEnd,
        operatingDays: 6,
        prescriptionCount: 500,
        claimReturnCount: 2,
        averageHandlingMinutes: storeId === 'pilot-store-secret-1'
          ? lateWeek ? 17 : 13
          : 16,
        closingRemainingTaskCount: 6,
        stockoutCount: 3,
        followUpDueCount: 40,
        followUpOnTimeCount: 39,
        criticalIncidentCount: 0,
        unrecoveredIncidentCount: 0,
        supportCaseCount: storeId === 'pilot-store-secret-1'
          ? lateWeek ? 10 : 2
          : 5
      });
    }
  }
  return snapshots;
}

function buildInput() {
  const externalConnectorReadiness = buildExternalConnectorReadinessReport({
    generatedAt,
    mynaCardReader: {
      mode: 'bridge',
      endpoint: 'http://127.0.0.1:39100/secret-myna-reader',
      timeoutMs: 5000,
      lastAttempt: {
        outcome: 'success',
        statusCode: 200,
        durationMs: 120,
        responseShape: 'json_object'
      }
    },
    onlineEligibility: {
      mode: 'external',
      endpoint: 'https://secret-eligibility.example.test/check?tenant=secret',
      bearerToken: 'secret-bearer-token',
      timeoutMs: 7000,
      lastAttempt: {
        outcome: 'timeout',
        durationMs: 9000,
        responseShape: 'unknown',
        errorCode: 'secret-internal-error'
      }
    }
  });
  const migrationPackageReadinessReview = buildMigrationPackageReadinessReview({
    generatedAt,
    patients: buildPatientCsvMigrationPreview([
      '患者番号,氏名,生年月日',
      'P-MIGRATION-SECRET,移行 患者秘密,1980/4/3'
    ].join('\n'), { generatedAt }),
    visits: buildVisitCsvMigrationPreview([
      '受付番号,患者番号,来局日',
      'V-MIGRATION-SECRET,P-MIGRATION-SECRET,2026/6/18'
    ].join('\n'), { generatedAt }),
    drugStocks: buildDrugStockCsvMigrationPreview([
      '在庫ID,薬品コード,在庫数',
      'STOCK-MIGRATION-SECRET,620001234,10'
    ].join('\n'), { generatedAt }),
    soapRecords: buildSoapCsvMigrationPreview([
      '薬歴ID,受付ID,記録日,薬歴本文',
      'SOAP-MIGRATION-SECRET,V-MIGRATION-SECRET,20260618,移行薬歴の秘密本文'
    ].join('\n'), { generatedAt })
  });

  return {
    generatedAt,
    settings: sensitiveSettings,
    staff,
    auditLogs,
    collectionCounts: {
      patients: 12,
      visits: 34,
      prescription_items: 56,
      soap_records: 7,
      users: staff.length,
      audit_logs: auditLogs.length
    },
    auditIntegrity,
    auditRetentionReview: buildAuditLogRetentionMonthlyReview(auditLogs, auditIntegrity, generatedAt),
    initialSetupChecklist: buildInitialSetupChecklist({
      settings: sensitiveSettings,
      staff,
      auditLogs,
      generatedAt
    }),
    backupGenerationReview: buildBackupGenerationReview(auditLogs, generatedAt),
    backupScheduleReview: buildBackupScheduleReview(auditLogs, DEFAULT_BACKUP_SCHEDULE_POLICY, generatedAt),
    officialAuditSummary: getOfficialAuditSummary(),
    officialAuditBlockerCount: getOfficialAuditBlockers().length,
    dailyClosingReview: buildOperationalClosingMonthlyReview(auditLogs, generatedAt, {
      currentStoreName: sensitiveSettings.pharmacyName,
      currentStoreCode: sensitiveSettings.pharmacyCode
    }),
    aiSuggestionFeedbackReview: buildAiSuggestionFeedbackMonthlyReview(auditLogs, generatedAt, {
      currentStoreName: sensitiveSettings.pharmacyName,
      currentStoreCode: sensitiveSettings.pharmacyCode,
      currentAiAssistMode: sensitiveSettings.aiAssistMode
    }),
    externalConnectorReadiness,
    onlineEligibilityFieldReadiness: buildOnlineEligibilityFieldReadinessReport({
      generatedAt,
      connectorReadiness: externalConnectorReadiness,
      responseDiff: {
        status: 'pass',
        sampleCount: 1,
        failedSampleCount: 0,
        issueCount: 0,
        results: [],
        privacyIssueCount: 0,
        privacyIssues: []
      },
      authEvidence: {
        capturedAt: '2026-06-18T12:00:00.000Z',
        operatorReviewId: 'eligibility-review-001',
        sourceArtifactSha256: 'a'.repeat(64),
        noPatientDataConfirmed: true,
        officialProcedureConfirmed: true,
        authenticationMethodRecorded: true,
        credentialStorageConfirmed: true,
        operationalOwnerAssigned: true
      }
    }),
    scheduledOpsContinuityReview: buildScheduledOpsContinuityReview({
      generatedAt,
      receipts: [
        {
          type: 'scheduled-ops-drill-receipt',
          checkedAt: '2026-06-17T21:00:00.000Z',
          schedulerName: 'yakureki-nightly-secret',
          status: 'pass',
          backupState: { statePath: '/Users/secret/store/backup_state.json' },
          auditState: { statePath: '/Users/secret/store/audit_state.json' },
          schedulerEvidence: [{ fileName: 'yakureki-nightly.launchd.plist', path: '/Users/secret/yakureki-nightly.launchd.plist' }],
          webhook: { delivered: true, dryRun: false },
          checks: [{ id: 'scheduler-evidence', status: 'pass' }]
        },
        {
          type: 'scheduled-ops-drill-receipt',
          checkedAt: '2026-06-22T21:00:00.000Z',
          schedulerName: 'yakureki-nightly-secret',
          status: 'pass',
          backupState: { statePath: '/Users/secret/store/backup_state.json' },
          auditState: { statePath: '/Users/secret/store/audit_state.json' },
          schedulerEvidence: [{ fileName: 'yakureki-nightly.launchd.plist', path: '/Users/secret/yakureki-nightly.launchd.plist' }],
          webhook: { delivered: true, dryRun: false },
          checks: [{ id: 'scheduler-evidence', status: 'pass' }]
        }
      ],
      failureNotices: [{
        type: 'backup-external-transfer-failure-notice',
        failedAt: '2026-06-16T21:00:00.000Z',
        status: 'failed',
        statusLabel: '外部保存ジョブ失敗',
        requiredActions: ['secret failure action']
      }]
    }),
    migrationPackageReadinessReview,
    migrationTrialAcceptanceReview: buildMigrationTrialAcceptanceReview({
      generatedAt,
      evidence: {
        acceptanceId: 'migration-secret-acceptance',
        capturedAt: '2026-06-18T12:15:00.000Z',
        operatorReviewId: 'migration-review-001',
        sourceArtifactSha256: 'd'.repeat(64),
        noPatientDataInArtifactsConfirmed: true,
        realDataEquivalentConfirmed: true,
        sourceSystemExportedByCustomerConfirmed: true,
        fieldMappingReviewed: true,
        restorePreviewCompleted: true,
        firstDayTrialPlanReady: true,
        ownerReviewCompleted: true,
        packageReview: migrationPackageReadinessReview
      }
    }),
    printMediaFieldVerificationReview: buildPrintMediaFieldVerificationReview({
      generatedAt,
      layoutManifest: {
        ok: true,
        captures: [
          {
            label: 'dispensing-record',
            selector: '[data-testid="dispensing-record-doc"]',
            fileName: '/Users/secret/患者秘密/dispensing-record.png',
            width: 794,
            height: 1123,
            bytes: 12000
          },
          {
            label: 'receipt-statement',
            selector: '[data-testid="receipt-statement-doc"]',
            fileName: '/Users/secret/患者秘密/receipt-statement.png',
            width: 794,
            height: 1123,
            bytes: 12000
          }
        ]
      },
      fieldEvidence: [{
        documentId: 'dispensing_record',
        checkedAt: '2026-06-23T14:00:00.000Z',
        operatorReviewId: 'print-field-review-001',
        sourceArtifactSha256: 'e'.repeat(64),
        noPatientDataConfirmed: true,
        mediaType: 'a4',
        printerChecked: true,
        paperMatched: true,
        noClipping: true,
        textReadable: true,
        marginWithinTolerance: true,
        operatorRecorded: true,
        expectedWidthMm: 210,
        expectedHeightMm: 297,
        measuredWidthMm: 210,
        measuredHeightMm: 297
      }],
      requiredDocumentIds: ['dispensing_record', 'receipt_statement']
    }),
    staffAccessRecoveryReview: buildStaffAccessRecoveryReview({
      generatedAt,
      evidence: {
        reviewId: 'staff-access-secret-review',
        capturedAt: '2026-06-18T12:10:00.000Z',
        operatorReviewId: 'staff-access-review-001',
        sourceArtifactSha256: 'b'.repeat(64),
        noPatientDataConfirmed: true,
        noStaffNamesConfirmed: true,
        noFacilityNameConfirmed: true,
        noRawAuditDetailsConfirmed: true,
        cases: [{
          caseId: 'staff-access-case-secret',
          reason: 'device_migration',
          targetRole: 'admin',
          backupBeforeChangeConfirmed: true,
          externalStorageConfirmed: true,
          adminRemainsConfirmed: true,
          restoreDrillConfirmed: true,
          auditLogRecorded: true,
          ownerReviewCompleted: true
        }]
      }
    }),
    staffAccessRecoveryMonthlyReview: buildStaffAccessRecoveryMonthlyReview(auditLogs, generatedAt, {
      sourceArtifactSha256: 'b'.repeat(64)
    }),
    pilotKpiReview: buildPilotKpiReview({
      generatedAt,
      evidence: {
        pilotId: 'pilot-secret-review',
        capturedAt: '2026-06-18T12:20:00.000Z',
        operatorReviewId: 'pilot-review-001',
        sourceArtifactSha256: 'c'.repeat(64),
        noPatientDataConfirmed: true,
        anonymizedStoreIdsConfirmed: true,
        realPilotEvidenceConfirmed: true,
        releasePostReviewAttached: true,
        slaReviewAttached: true,
        supportTriageAttached: true,
        improvementActionsRegistered: true,
        ownerReviewCompleted: true,
        snapshots: pilotKpiSnapshots()
      }
    }),
    releaseOpsAcceptanceReview: buildReleaseOpsAcceptanceReview({
      generatedAt,
      evidence: {
        acceptanceId: 'release-ops-secret-acceptance',
        noPatientDataConfirmed: true
      }
    })
  };
}

test('buildAnonymousDiagnosticExport keeps operational counts without raw identifiers', () => {
  const diagnostic = buildAnonymousDiagnosticExport(buildInput());

  assert.strictEqual(diagnostic.type, 'yakureki-support-diagnostic');
  assert.strictEqual(diagnostic.schemaVersion, 2);
  assert.strictEqual(diagnostic.privacy.containsPatientIdentifiers, false);
  assert.strictEqual(diagnostic.privacy.containsStaffNames, false);
  assert.strictEqual(diagnostic.privacy.containsFacilityName, false);
  assert.strictEqual(diagnostic.collections.patients.rowCount, 12);
  assert.strictEqual(diagnostic.staff.total, 2);
  assert.strictEqual(diagnostic.staff.byRole.admin, 1);
  assert.strictEqual(diagnostic.staff.credentialedCount, 2);
  assert.strictEqual(diagnostic.audit.actionCounts.prescription_edit, 1);
  assert.strictEqual(diagnostic.audit.integrity.latestHashAvailable, true);
  assert.strictEqual(diagnostic.facility.officialFeeCodeOverrideCount, 1);
  assert.strictEqual(diagnostic.facility.aiAssistMode, 'limited');
  assert.strictEqual(diagnostic.workflows.aiSuggestionFeedback.qualityGateStatus, 'insufficient_data');
  assert.strictEqual(diagnostic.workflows.aiSuggestionFeedback.qualityGateRecommendedMode, 'limited');
  assert.strictEqual(diagnostic.workflows.aiSuggestionFeedback.qualityGateModeAlignment, 'aligned');
  assert.strictEqual(diagnostic.workflows.initialSetup.status, 'attention');
  assert.ok(diagnostic.workflows.initialSetup.unresolvedStepCount > 0);
  assert.ok(diagnostic.workflows.initialSetup.totalRequiredActionCount > 0);
  assert.ok(diagnostic.workflows.initialSetup.steps.some((step) => step.id === 'claim_test'));
  assert.ok(diagnostic.workflows.initialSetup.steps.every((step) => !('evidence' in step)));
  assert.ok(diagnostic.workflows.initialSetup.steps.every((step) => !('requiredActions' in step)));
  assert.strictEqual(diagnostic.workflows.officialAudit.total, getOfficialAuditSummary().total);
  assert.strictEqual(diagnostic.externalConnectors?.overallStatus, 'attention');
  assert.strictEqual(diagnostic.externalConnectors?.checks[0].endpointConfigured, true);
  assert.strictEqual(diagnostic.externalConnectors?.checks[0].mockFallbackAllowed, true);
  assert.strictEqual(diagnostic.externalConnectors?.checks[0].lastAttemptOutcome, 'success');
  assert.strictEqual(diagnostic.externalConnectors?.checks[0].lastAttemptStatusCodeClass, '2xx');
  assert.strictEqual(diagnostic.externalConnectors?.checks[1].bearerTokenConfigured, true);
  assert.strictEqual(diagnostic.externalConnectors?.checks[1].mockFallbackAllowed, true);
  assert.strictEqual(diagnostic.externalConnectors?.checks[1].lastAttemptOutcome, 'timeout');
  assert.strictEqual(diagnostic.externalConnectors?.checks[1].lastAttemptDurationStatus, 'slow');
  assert.strictEqual(diagnostic.externalConnectors?.fieldReadiness?.status, 'attention');
  assert.strictEqual(diagnostic.externalConnectors?.fieldReadiness?.gateCount, 6);
  assert.strictEqual(diagnostic.externalConnectors?.fieldReadiness?.canRunFieldSuccessTrial, false);
  assert.strictEqual(diagnostic.externalConnectors?.fieldReadiness?.evidenceIntegrityStatus, 'pass');
  assert.strictEqual(diagnostic.externalConnectors?.fieldReadiness?.evidenceIntegrityIssueCount, 0);
  assert.ok(diagnostic.externalConnectors?.fieldReadiness?.gates.some((gate) => (
    gate.id === 'online_eligibility_success'
    && gate.status === 'attention'
    && gate.nextActionPresent
  )));
  assert.strictEqual(diagnostic.workflows.scheduledOpsContinuity?.status, 'pass');
  assert.strictEqual(diagnostic.workflows.scheduledOpsContinuity?.receiptCount, 2);
  assert.strictEqual(diagnostic.workflows.scheduledOpsContinuity?.failureNoticeCount, 1);
  assert.strictEqual(diagnostic.workflows.scheduledOpsContinuity?.recoveredAfterLatestFailure, true);
  assert.strictEqual(diagnostic.workflows.scheduledOpsContinuity?.blockedCheckCount, 0);
  assert.strictEqual(diagnostic.workflows.migrationPackageReadiness?.status, 'pass');
  assert.strictEqual(diagnostic.workflows.migrationPackageReadiness?.readyForOneDayTrial, true);
  assert.strictEqual(diagnostic.workflows.migrationPackageReadiness?.providedSourceCount, 4);
  assert.strictEqual(diagnostic.workflows.migrationPackageReadiness?.totalRowCount, 4);
  assert.strictEqual(diagnostic.workflows.migrationPackageReadiness?.referenceIssueCount, 0);
  assert.ok(diagnostic.workflows.migrationPackageReadiness?.sources.every((source) => !source.nextActionPresent));
  assert.strictEqual(diagnostic.workflows.migrationTrialAcceptance?.status, 'attention');
  assert.strictEqual(diagnostic.workflows.migrationTrialAcceptance?.statusLabel, '移行受入を確認');
  assert.strictEqual(diagnostic.workflows.migrationTrialAcceptance?.readyForOneDayTrial, false);
  assert.strictEqual(diagnostic.workflows.migrationTrialAcceptance?.patientRows, 1);
  assert.strictEqual(diagnostic.workflows.migrationTrialAcceptance?.visitRows, 1);
  assert.strictEqual(diagnostic.workflows.migrationTrialAcceptance?.drugStockRows, 1);
  assert.strictEqual(diagnostic.workflows.migrationTrialAcceptance?.soapRows, 1);
  assert.strictEqual(diagnostic.workflows.migrationTrialAcceptance?.totalRowCount, 4);
  assert.strictEqual(diagnostic.workflows.migrationTrialAcceptance?.referenceIssueCount, 0);
  assert.strictEqual(diagnostic.workflows.migrationTrialAcceptance?.operationalCoverageStatus, 'attention');
  assert.strictEqual(diagnostic.workflows.migrationTrialAcceptance?.readyWorkflowCount, 2);
  assert.strictEqual(diagnostic.workflows.migrationTrialAcceptance?.realDataEquivalentConfirmed, true);
  assert.strictEqual(diagnostic.workflows.migrationTrialAcceptance?.fieldMappingReviewed, true);
  assert.strictEqual(diagnostic.workflows.migrationTrialAcceptance?.evidenceIntegrityStatus, 'pass');
  assert.ok((diagnostic.workflows.migrationTrialAcceptance?.attentionGateCount ?? 0) > 0);
  assert.strictEqual(diagnostic.workflows.printMediaFieldVerification?.status, 'attention');
  assert.strictEqual(diagnostic.workflows.printMediaFieldVerification?.requiredDocumentCount, 2);
  assert.strictEqual(diagnostic.workflows.printMediaFieldVerification?.screenshotDocumentCount, 2);
  assert.strictEqual(diagnostic.workflows.printMediaFieldVerification?.fieldEvidenceDocumentCount, 1);
  assert.strictEqual(diagnostic.workflows.printMediaFieldVerification?.evidenceIntegrityStatus, 'pass');
  assert.strictEqual(diagnostic.workflows.printMediaFieldVerification?.evidenceIntegrityIssueCount, 0);
  assert.strictEqual(diagnostic.workflows.printMediaFieldVerification?.printerCheckedCount, 1);
  assert.strictEqual(diagnostic.workflows.printMediaFieldVerification?.paperMatchedCount, 1);
  assert.strictEqual(diagnostic.workflows.printMediaFieldVerification?.noClippingCount, 1);
  assert.strictEqual(diagnostic.workflows.printMediaFieldVerification?.textReadableCount, 1);
  assert.strictEqual(diagnostic.workflows.printMediaFieldVerification?.marginWithinToleranceCount, 1);
  assert.strictEqual(diagnostic.workflows.printMediaFieldVerification?.sizeWithinToleranceCount, 1);
  assert.ok(diagnostic.workflows.printMediaFieldVerification?.documents.some((document) => (
    document.documentId === 'receipt_statement'
    && document.fieldEvidenceRecorded === false
    && document.printerChecked === false
    && document.nextActionPresent
  )));
  assert.strictEqual(diagnostic.workflows.staffAccessRecovery?.status, 'attention');
  assert.strictEqual(diagnostic.workflows.staffAccessRecovery?.caseCount, 1);
  assert.strictEqual(diagnostic.workflows.staffAccessRecovery?.reasonCounts.device_migration, 1);
  assert.strictEqual(diagnostic.workflows.staffAccessRecovery?.missingReasonCount, 2);
  assert.strictEqual(diagnostic.workflows.staffAccessRecovery?.evidenceIntegrityStatus, 'pass');
  assert.ok(diagnostic.workflows.staffAccessRecovery?.gates.some((gate) => (
    gate.id === 'scenario_coverage'
    && gate.status === 'attention'
    && gate.nextActionPresent
  )));
  assert.strictEqual(diagnostic.workflows.staffAccessRecoveryMonthly?.monthKey, '2026-06');
  assert.strictEqual(diagnostic.workflows.staffAccessRecoveryMonthly?.status, 'pass');
  assert.strictEqual(diagnostic.workflows.staffAccessRecoveryMonthly?.actionLabel, '対象操作なし');
  assert.strictEqual(diagnostic.workflows.staffAccessRecoveryMonthly?.eventCaseCount, 0);
  assert.strictEqual(diagnostic.workflows.staffAccessRecoveryMonthly?.readyForMonthlyClose, true);
  assert.strictEqual(diagnostic.workflows.staffAccessRecoveryMonthly?.readinessScenarioComplete, false);
  assert.strictEqual(diagnostic.workflows.staffAccessRecoveryMonthly?.requiredActionCount, 2);
  assert.strictEqual(diagnostic.workflows.pilotKpi?.status, 'attention');
  assert.strictEqual(diagnostic.workflows.pilotKpi?.statusLabel, 'パイロットKPIを確認');
  assert.strictEqual(diagnostic.workflows.pilotKpi?.storeCount, 2);
  assert.strictEqual(diagnostic.workflows.pilotKpi?.weekCount, 4);
  assert.strictEqual(diagnostic.workflows.pilotKpi?.snapshotCount, 8);
  assert.strictEqual(diagnostic.workflows.pilotKpi?.missingMetricCount, 0);
  assert.strictEqual(diagnostic.workflows.pilotKpi?.claimReturnRatePercent, 0.4);
  assert.strictEqual(diagnostic.workflows.pilotKpi?.followUpOnTimeRatePercent, 97.5);
  assert.strictEqual(diagnostic.workflows.pilotKpi?.trendStatus, 'attention');
  assert.strictEqual(diagnostic.workflows.pilotKpi?.trendStatusLabel, '後半悪化あり');
  assert.strictEqual(diagnostic.workflows.pilotKpi?.worseningStoreCount, 1);
  assert.strictEqual(diagnostic.workflows.pilotKpi?.evidenceIntegrityStatus, 'pass');
  assert.strictEqual(diagnostic.workflows.pilotKpi?.evidenceIntegrityIssueCount, 0);
  assert.strictEqual(diagnostic.workflows.pilotKpi?.readyForPilotExpansion, false);
  assert.strictEqual(diagnostic.workflows.releaseOpsAcceptance?.status, 'blocked');
  assert.strictEqual(diagnostic.workflows.releaseOpsAcceptance?.statusLabel, '運用拡大を保留');
  assert.strictEqual(diagnostic.workflows.releaseOpsAcceptance?.attachedReviewCount, 0);
  assert.strictEqual(diagnostic.workflows.releaseOpsAcceptance?.releaseIdsMatch, false);
  assert.strictEqual(diagnostic.workflows.releaseOpsAcceptance?.focusAreasLinked, false);
  assert.strictEqual(diagnostic.workflows.releaseOpsAcceptance?.realInquiryOrUpdateFailureDrillConfirmed, false);
  assert.strictEqual(diagnostic.workflows.releaseOpsAcceptance?.ownerApproved, false);
  assert.ok((diagnostic.workflows.releaseOpsAcceptance?.blockedGateCount ?? 0) > 0);
  assert.strictEqual(diagnostic.workflows.releaseOpsAcceptance?.evidenceIntegrityStatus, 'attention');
  assert.strictEqual(diagnostic.workflows.releaseOpsAcceptance?.readyForReleaseExpansion, false);
});

test('buildAnonymousDiagnosticExportJson omits patient, facility, staff, and raw audit details', () => {
  const json = buildAnonymousDiagnosticExportJson(buildInput());

  for (const sensitiveValue of [
    '秘密薬局',
    'ヒミツヤッキョク',
    '1312345',
    '150-0000',
    '東京都秘密区',
    '03-1111-2222',
    'T9999999999999',
    '開設者 秘密',
    '管理薬剤師 秘密',
    '薬剤師 花子',
    '管理者 太郎',
    'staff-admin-secret',
    'hash-secret',
    'salt-secret',
    'passkey-id-secret',
    'P-SECRET-001',
    '患者 太郎',
    'INS-SECRET-999',
    'アムロジピン',
    'yakureki_backup_secret.json',
    'hash-derived-from-sensitive-source',
    'log-patient-secret',
    'secret-myna-reader',
    'secret-eligibility.example.test',
    '999000001',
    'secret-bearer-token',
    'secret-internal-error',
    'yakureki-nightly-secret',
    '/Users/secret',
    'secret failure action',
    'P-MIGRATION-SECRET',
    'V-MIGRATION-SECRET',
    'STOCK-MIGRATION-SECRET',
    'SOAP-MIGRATION-SECRET',
    '移行 患者秘密',
    '移行薬歴の秘密本文',
    'migration-secret-acceptance',
    '患者秘密',
    'dispensing-record.png',
    'receipt-statement.png',
    'staff-access-secret-review',
    'staff-access-case-secret',
    'pilot-secret-review',
    'pilot-store-secret-1',
    'pilot-store-secret-2',
    'release-ops-secret-acceptance'
  ]) {
    assert.doesNotMatch(json, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(json, /"details"/);
  assert.doesNotMatch(json, /"evidence"/);
  assert.doesNotMatch(json, /"requiredActions"/);
  assert.doesNotMatch(json, /"patientName"/);
  assert.doesNotMatch(json, /"patientId"/);
  assert.doesNotMatch(json, /"userName"/);
  assert.match(json, /"prescription_edit": 1/);
});

test('makeAnonymousDiagnosticExportFileName uses a stable timestamped name', () => {
  assert.strictEqual(
    makeAnonymousDiagnosticExportFileName(new Date('2026-06-18T12:34:56')),
    'yakureki_support_diagnostic_20260618_123456.json'
  );
});
