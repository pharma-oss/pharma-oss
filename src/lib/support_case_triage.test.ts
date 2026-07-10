import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import type { AnonymousDiagnosticExport } from './anonymous_diagnostic_export.ts';
import {
  buildSupportCaseReproductionMemo,
  buildSupportCaseTriage,
  buildSupportCaseTriageCsv
} from './support_case_triage.ts';

const generatedAt = new Date('2026-06-23T09:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const supportTriageScript = readFileSync(new URL('../../scripts/runSupportCaseTriage.ts', import.meta.url), 'utf8');

function baseDiagnostic(): AnonymousDiagnosticExport {
  return {
    type: 'yakureki-support-diagnostic',
    schemaVersion: 2,
    generatedAt: '2026-06-23T08:50:00.000Z',
    privacy: {
      containsPatientIdentifiers: false,
      containsStaffNames: false,
      containsFacilityName: false,
      containsRawAuditLogDetails: false,
      omittedData: []
    },
    facility: {
      hasPharmacyName: true,
      hasPharmacyCode: true,
      hasPostalCode: true,
      hasAddress: true,
      hasPhone: true,
      hasDefaultPharmacistName: true,
      baseFeeCategory: '1',
      regionalSupportAddition: 'none',
      medicalDxAddition: true,
      aiAssistMode: 'limited',
      officialFeeCodeOverrideCount: 2
    },
    collections: {
      patients: { rowCount: 12 },
      visits: { rowCount: 34 },
      audit_logs: { rowCount: 8 }
    },
    staff: {
      total: 3,
      byRole: { admin: 1, pharmacist: 1, clerk: 1 },
      credentialedCount: 3,
      passwordCredentialCount: 2,
      passkeyCredentialCount: 1
    },
    audit: {
      total: 8,
      latestLogAt: '2026-06-23T08:40:00.000Z',
      actionCounts: { backup_export: 1 },
      integrity: {
        signed: 7,
        unsigned: 1,
        invalid: 0,
        isValid: true,
        latestHashAvailable: true
      }
    },
    workflows: {
      initialSetup: {
        status: 'complete',
        statusLabel: '導入準備OK',
        completionRate: 100,
        completedCount: 7,
        attentionCount: 0,
        blockedCount: 0,
        unresolvedStepCount: 0,
        totalRequiredActionCount: 0,
        steps: []
      },
      backupGeneration: {
        status: 'pass',
        statusLabel: '良好',
        generationCount: 3,
        encryptedGenerationCount: 3,
        requiredGenerationCount: 2,
        retentionDays: 30,
        latestBackupRecorded: true,
        latestDrillRecorded: true,
        externalStorageStatus: 'pass',
        requiredActionCount: 0
      },
      backupSchedule: {
        isEnabled: true,
        scheduledTime: '21:00',
        isDue: false,
        status: 'pass',
        statusLabel: '良好',
        latestBackupRecorded: true,
        latestExternalStorageRecorded: true,
        requiredActionCount: 0
      },
      auditRetention: {
        monthKey: '2026-06',
        status: 'complete',
        statusLabel: '良好',
        auditJsonExportCount: 1,
        retentionLedgerExportCount: 1,
        returnReasonCount: 0,
        requiredActionCount: 0
      },
      officialAudit: {
        total: 8,
        verified: 0,
        implemented: 1,
        partial: 7,
        open: 0,
        blockers: 2,
        completionRate: 44,
        blockerItemCount: 0
      },
      dailyClosing: {
        monthKey: '2026-06',
        approvalCount: 10,
        approvedDayCount: 10,
        reviewerCount: 2,
        daysWithBlockers: 0,
        totalClosingBlockers: 0,
        storeCount: 1,
        previousMonthStatus: 'same'
      },
      aiSuggestionFeedback: {
        monthKey: '2026-06',
        totalCount: 12,
        acceptedCount: 7,
        modifiedCount: 3,
        rejectedCount: 2,
        feedbackCount: 4,
        acceptanceRate: 58,
        correctionRate: 25,
        status: 'ready',
        statusLabel: '良好',
        storeCount: 1,
        domainSummaryCount: 2,
        soapDraftStatus: 'ready',
        qualityGateStatus: 'continue',
        qualityGateRecommendedMode: 'limited',
        qualityGateModeAlignment: 'aligned',
        highConfidenceRejectedCount: 0,
        rejectionRate: 17,
        missingFeedbackCount: 0
      }
    }
  };
}

test('buildSupportCaseTriage prioritizes privacy-safe reproduction focus areas', () => {
  const diagnostic = baseDiagnostic();
  diagnostic.audit.integrity.invalid = 1;
  diagnostic.audit.integrity.isValid = false;
  diagnostic.workflows.officialAudit.blockerItemCount = 2;
  diagnostic.workflows.initialSetup = {
    ...diagnostic.workflows.initialSetup,
    status: 'blocked',
    statusLabel: '初期設定未完了',
    unresolvedStepCount: 2,
    nextStepId: 'staff'
  };
  diagnostic.workflows.migrationPackageReadiness = {
    status: 'blocked',
    statusLabel: '導入移行不可',
    actionLabel: '修正必須',
    readyForOneDayTrial: false,
    requiredSourceCount: 2,
    providedSourceCount: 2,
    passedSourceCount: 1,
    attentionSourceCount: 0,
    blockedSourceCount: 1,
    totalRowCount: 4,
    totalIssueCount: 1,
    referenceIssueCount: 1,
    sources: [{
      kind: 'visits',
      status: 'blocked',
      provided: true,
      rowCount: 2,
      issueCount: 1,
      nextActionPresent: true
    }],
    references: [{
      id: 'visit_patient_reference',
      status: 'blocked',
      checkedRowCount: 2,
      issueCount: 1,
      nextActionPresent: true
    }]
  };
  diagnostic.workflows.printMediaFieldVerification = {
    status: 'attention',
    statusLabel: '実紙検証を確認',
    requiredDocumentCount: 8,
    screenshotDocumentCount: 8,
    fieldEvidenceDocumentCount: 0,
    passedDocumentCount: 0,
    attentionDocumentCount: 8,
    blockedDocumentCount: 0,
    dimensionToleranceMm: 2,
    evidenceIntegrityStatus: 'pass',
    evidenceIntegrityIssueCount: 0,
    printerCheckedCount: 0,
    paperMatchedCount: 0,
    noClippingCount: 0,
    textReadableCount: 0,
    marginWithinToleranceCount: 0,
    sizeWithinToleranceCount: 0,
    documents: []
  };
  diagnostic.externalConnectors = {
    overallStatus: 'attention',
    generatedAt: '2026-06-23T08:45:00.000Z',
    fieldReadiness: {
      status: 'attention',
      statusLabel: '現地試験を確認',
      gateCount: 6,
      passedGateCount: 2,
      attentionGateCount: 4,
      blockedGateCount: 0,
      canRunFieldSuccessTrial: false,
      canAcceptOfficialResponseSample: true,
      evidenceIntegrityStatus: 'attention',
      evidenceIntegrityIssueCount: 1,
      gates: []
    },
    checks: [{
      id: 'online_eligibility',
      status: 'attention',
      mode: 'external',
      mockFallbackAllowed: false,
      endpointConfigured: true,
      endpointHostKind: 'external',
      bearerTokenConfigured: true,
      timeoutMs: 7000,
      timeoutValid: true,
      lastAttemptOutcome: 'timeout',
      lastAttemptRecorded: true,
      lastAttemptDurationStatus: 'slow',
      lastAttemptResponseShape: 'unknown',
      requiredActionCount: 1
    }]
  } as AnonymousDiagnosticExport['externalConnectors'];
  diagnostic.workflows.staffAccessRecovery = {
    status: 'blocked',
    statusLabel: 'スタッフ復旧確認を保留',
    readyForStaffAccessChange: false,
    caseCount: 1,
    passCaseCount: 0,
    attentionCaseCount: 0,
    blockedCaseCount: 1,
    missingReasonCount: 2,
    reasonCounts: {
      device_migration: 0,
      staff_retirement: 1,
      passkey_lost: 0
    },
    evidenceIntegrityStatus: 'attention',
    evidenceIntegrityIssueCount: 1,
    gates: [{
      id: 'admin_survival',
      status: 'blocked',
      nextActionPresent: true
    }],
    cases: [{
      reason: 'staff_retirement',
      targetRole: 'admin',
      status: 'blocked',
      blockedCheckCount: 3,
      attentionCheckCount: 0,
      nextActionPresent: true
    }]
  };
  (diagnostic as any).secretPayload = '秘密薬局 / 患者 太郎 / P-SECRET-001 / bearer-token-secret / /Users/secret';

  const triage = buildSupportCaseTriage(diagnostic, { generatedAt });
  const csv = buildSupportCaseTriageCsv(triage);
  const memo = buildSupportCaseReproductionMemo(triage);
  const combined = JSON.stringify(triage) + csv + memo;

  assert.strictEqual(triage.priority, 'urgent');
  assert.strictEqual(triage.status, 'needs_support');
  assert.strictEqual(triage.focusAreas[0].id, 'audit_integrity');
  assert.ok(triage.focusAreas.some((area) => area.id === 'migration_package'));
  assert.ok(triage.focusAreas.some((area) => (
    area.id === 'print_media'
    && area.nextAction.includes('実紙確認JSON')
    && area.reproduceSteps.some((step) => step.includes('帳票・実紙検証依頼書'))
  )));
  assert.ok(triage.focusAreas.some((area) => area.id === 'external_connector'));
  assert.ok(triage.focusAreas.some((area) => area.id === 'staff_access_recovery'));
  assert.match(memo, /再現確認/);
  assert.match(csv, /患者情報なし/);

  for (const sensitiveValue of ['秘密薬局', '患者 太郎', 'P-SECRET-001', 'bearer-token-secret', '/Users/secret']) {
    assert.doesNotMatch(combined, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('buildSupportCaseTriage returns a watch case when diagnostic has no active signals', () => {
  const triage = buildSupportCaseTriage(baseDiagnostic(), { generatedAt });

  assert.strictEqual(triage.priority, 'watch');
  assert.strictEqual(triage.status, 'ready_to_close');
  assert.strictEqual(triage.focusAreas.length, 1);
  assert.strictEqual(triage.focusAreas[0].id, 'general_health');
});

test('buildSupportCaseTriage flags monthly staff access recovery review without raw details', () => {
  const diagnostic = baseDiagnostic();
  diagnostic.workflows.staffAccessRecoveryMonthly = {
    monthKey: '2026-06',
    monthLabel: '2026年6月',
    status: 'attention',
    statusLabel: 'スタッフ復旧確認を確認',
    actionLabel: '責任者確認',
    readyForMonthlyClose: true,
    eventCaseCount: 1,
    staffCredentialRecoveryLogCount: 1,
    staffDeleteLogCount: 0,
    passCaseCount: 0,
    attentionCaseCount: 1,
    blockedCaseCount: 0,
    missingReasonCount: 2,
    readinessScenarioComplete: false,
    evidenceIntegrityStatus: 'pass',
    evidenceIntegrityIssueCount: 0,
    requiredActionCount: 1,
    latestEventRecorded: true,
    reasonCounts: {
      device_migration: 0,
      staff_retirement: 0,
      passkey_lost: 1
    }
  };

  const triage = buildSupportCaseTriage(diagnostic, { generatedAt });
  const area = triage.focusAreas.find((item) => item.id === 'staff_access_recovery');

  assert.ok(area);
  assert.strictEqual(triage.priority, 'normal');
  assert.strictEqual(area.priority, 'normal');
  assert.match(area.statusLabel, /月次棚卸/);
  assert.match(area.nextAction, /当月/);
  assert.ok(area.reproduceSteps.some((step) => step.includes('staffAccessRecoveryMonthly')));
});

test('buildSupportCaseTriage flags migration trial acceptance gaps from anonymous diagnostic summary', () => {
  const diagnostic = baseDiagnostic();
  diagnostic.workflows.migrationTrialAcceptance = {
    status: 'attention',
    statusLabel: '移行受入を確認',
    actionLabel: '確認後に1日テスト判断',
    readyForOneDayTrial: false,
    patientRows: 1,
    visitRows: 1,
    drugStockRows: 1,
    soapRows: 0,
    totalRowCount: 3,
    totalIssueCount: 0,
    referenceIssueCount: 0,
    blockedSourceCount: 0,
    attentionSourceCount: 1,
    operationalCoverageStatus: 'attention',
    operationalCoverageStatusLabel: '初日業務を確認',
    patientReceptionReady: true,
    inventoryReady: true,
    medicationHistoryReady: false,
    readyWorkflowCount: 2,
    totalWorkflowCount: 3,
    evidenceIntegrityStatus: 'pass',
    evidenceIntegrityIssueCount: 0,
    realDataEquivalentConfirmed: false,
    sourceSystemExportedByCustomerConfirmed: false,
    fieldMappingReviewed: true,
    restorePreviewCompleted: true,
    firstDayTrialPlanReady: false,
    ownerReviewCompleted: false,
    passedGateCount: 5,
    attentionGateCount: 4,
    blockedGateCount: 0,
    requiredActionCount: 3
  };

  const triage = buildSupportCaseTriage(diagnostic, { generatedAt });
  const area = triage.focusAreas.find((item) => item.id === 'migration_trial_acceptance');

  assert.ok(area);
  assert.strictEqual(triage.priority, 'normal');
  assert.strictEqual(area.priority, 'normal');
  assert.match(area.statusLabel, /初日業務を確認/);
  assert.match(area.nextAction, /実データ相当/);
  assert.ok(area.reproduceSteps.some((step) => step.includes('migrationTrialAcceptance')));
});

test('buildSupportCaseTriage flags pilot KPI deterioration from anonymous diagnostic summary', () => {
  const diagnostic = baseDiagnostic();
  diagnostic.workflows.pilotKpi = {
    status: 'attention',
    statusLabel: 'パイロットKPIを確認',
    storeCount: 2,
    weekCount: 4,
    snapshotCount: 8,
    missingMetricCount: 0,
    claimReturnRatePercent: 0.4,
    averageHandlingMinutes: 15.5,
    closingRemainingTasksPerDay: 1,
    stockoutsPer100Prescriptions: 0.6,
    followUpOnTimeRatePercent: 97.5,
    criticalIncidentCount: 0,
    unrecoveredIncidentCount: 0,
    supportCasesPer100Prescriptions: 1.1,
    trendStatus: 'attention',
    trendStatusLabel: '後半悪化あり',
    worseningStoreCount: 1,
    insufficientTrendStoreCount: 0,
    evidenceIntegrityStatus: 'pass',
    evidenceIntegrityIssueCount: 0,
    passedGateCount: 10,
    attentionGateCount: 1,
    blockedGateCount: 0,
    requiredActionCount: 1,
    readyForPilotExpansion: false
  };

  const triage = buildSupportCaseTriage(diagnostic, { generatedAt });
  const area = triage.focusAreas.find((item) => item.id === 'pilot_kpi');

  assert.ok(area);
  assert.strictEqual(triage.priority, 'normal');
  assert.strictEqual(area.priority, 'normal');
  assert.match(area.statusLabel, /後半悪化あり/);
  assert.match(area.nextAction, /後半悪化/);
  assert.ok(area.reproduceSteps.some((step) => step.includes('pilotKpi')));
});

test('buildSupportCaseTriage flags release ops acceptance gaps from anonymous diagnostic summary', () => {
  const diagnostic = baseDiagnostic();
  diagnostic.workflows.releaseOpsAcceptance = {
    status: 'blocked',
    statusLabel: '運用拡大を保留',
    readinessReviewAttached: true,
    releasePostReviewAttached: true,
    slaReviewAttached: true,
    supportDrillReviewAttached: false,
    attachedReviewCount: 3,
    totalBlockedCount: 1,
    totalAttentionCount: 2,
    supportCaseCount: 3,
    maxSupportCaseCount: 1,
    errorCount: 1,
    maxErrorCount: 0,
    downtimeMinutes: 12,
    maxDowntimeMinutes: 5,
    rollbackTargetRecorded: true,
    recoveryMinutesRecorded: false,
    releaseIdsMatch: false,
    focusAreasLinked: false,
    linkageStatus: 'blocked',
    linkageStatusLabel: 'レビューひも付け不足',
    linkedFocusAreaCount: 0,
    missingLinkageActionCount: 2,
    evidenceIntegrityStatus: 'attention',
    evidenceIntegrityIssueCount: 1,
    realInquiryOrUpdateFailureDrillConfirmed: false,
    ownerApproved: true,
    handoffChecklistStored: false,
    nextBusinessDayReviewScheduled: false,
    passedGateCount: 3,
    attentionGateCount: 2,
    blockedGateCount: 3,
    requiredActionCount: 4,
    readyForReleaseExpansion: false
  };

  const triage = buildSupportCaseTriage(diagnostic, { generatedAt });
  const area = triage.focusAreas.find((item) => item.id === 'release_ops_acceptance');

  assert.ok(area);
  assert.strictEqual(triage.priority, 'high');
  assert.strictEqual(area.priority, 'high');
  assert.match(area.statusLabel, /レビューひも付け不足/);
  assert.match(area.nextAction, /更新準備/);
  assert.ok(area.reproduceSteps.some((step) => step.includes('releaseOpsAcceptance')));
});

test('buildSupportCaseTriageCsv is formula-safe and support triage CLI is exposed', () => {
  const triage = buildSupportCaseTriage(baseDiagnostic(), { generatedAt });
  triage.focusAreas[0].title = '=危険';
  const csv = buildSupportCaseTriageCsv(triage);

  assert.match(csv, /"'=危険"/);
  assert.strictEqual(packageJson.scripts['support:triage'], 'tsx scripts/runSupportCaseTriage.ts');
  assert.match(supportTriageScript, /YAKUREKI_SUPPORT_DIAGNOSTIC_JSON/);
  assert.match(supportTriageScript, /support-case-triage\.json/);
  assert.match(supportTriageScript, /support-case-reproduction-memo\.txt/);
});
