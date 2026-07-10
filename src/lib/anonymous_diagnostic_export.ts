import type { AuditLog, FacilitySettings, User } from '../db/types.ts';
import type { AuditIntegrityReport, AuditLogRetentionMonthlyReview } from './audit_integrity.ts';
import type { AiSuggestionFeedbackMonthlyReview } from './ai_suggestion_feedback.ts';
import type { BackupGenerationReview, BackupScheduleReview } from './backup.ts';
import type { ExternalConnectorReadinessReport } from './external_connector_readiness.ts';
import type { MigrationTrialAcceptanceReview } from './migration_trial_acceptance.ts';
import type { MigrationPackageReadinessReview } from './migration_csv.ts';
import type { OnlineEligibilityFieldReadinessReport } from './online_eligibility_field_readiness.ts';
import type { InitialSetupChecklist } from './onboarding.ts';
import type { OfficialAuditSummary } from './official_audit.ts';
import type { OperationalClosingMonthlyReview } from './operational_closing_review.ts';
import type { PilotKpiReview } from './pilot_kpi_review.ts';
import type { PrintMediaFieldVerificationReview } from './print_media_field_verification.ts';
import type { ReleaseOpsAcceptanceReview } from './release_ops_acceptance.ts';
import type { ScheduledOpsContinuityReview } from './scheduled_ops_continuity.ts';
import type {
  StaffAccessRecoveryMonthlyReview,
  StaffAccessRecoveryReview
} from './staff_access_recovery_review.ts';
import { normalizeAiAssistMode } from './ai_assist_policy.ts';

export type AnonymousDiagnosticCollectionCounts = Record<string, number>;

export interface AnonymousDiagnosticExportInput {
  generatedAt?: Date;
  settings: FacilitySettings;
  staff: User[];
  auditLogs: AuditLog[];
  collectionCounts: AnonymousDiagnosticCollectionCounts;
  auditIntegrity: AuditIntegrityReport;
  auditRetentionReview: AuditLogRetentionMonthlyReview;
  initialSetupChecklist: InitialSetupChecklist;
  backupGenerationReview: BackupGenerationReview;
  backupScheduleReview: BackupScheduleReview;
  officialAuditSummary: OfficialAuditSummary;
  officialAuditBlockerCount: number;
  dailyClosingReview: OperationalClosingMonthlyReview;
  aiSuggestionFeedbackReview: AiSuggestionFeedbackMonthlyReview;
  externalConnectorReadiness?: ExternalConnectorReadinessReport;
  onlineEligibilityFieldReadiness?: OnlineEligibilityFieldReadinessReport;
  scheduledOpsContinuityReview?: ScheduledOpsContinuityReview;
  printMediaFieldVerificationReview?: PrintMediaFieldVerificationReview;
  migrationPackageReadinessReview?: MigrationPackageReadinessReview;
  migrationTrialAcceptanceReview?: MigrationTrialAcceptanceReview;
  staffAccessRecoveryReview?: StaffAccessRecoveryReview;
  staffAccessRecoveryMonthlyReview?: StaffAccessRecoveryMonthlyReview;
  pilotKpiReview?: PilotKpiReview;
  releaseOpsAcceptanceReview?: ReleaseOpsAcceptanceReview;
}

export interface AnonymousDiagnosticExport {
  type: 'yakureki-support-diagnostic';
  schemaVersion: 2;
  generatedAt: string;
  privacy: {
    containsPatientIdentifiers: false;
    containsStaffNames: false;
    containsFacilityName: false;
    containsRawAuditLogDetails: false;
    omittedData: string[];
  };
  facility: {
    hasPharmacyName: boolean;
    hasPharmacyCode: boolean;
    hasPostalCode: boolean;
    hasAddress: boolean;
    hasPhone: boolean;
    hasDefaultPharmacistName: boolean;
    baseFeeCategory: FacilitySettings['baseFeeCategory'];
    regionalSupportAddition: FacilitySettings['regionalSupportAddition'];
    medicalDxAddition: boolean;
    postGenericAddition?: FacilitySettings['postGenericAddition'];
    genericDispensingReduction?: boolean;
    aiAssistMode: NonNullable<FacilitySettings['aiAssistMode']>;
    officialFeeCodeOverrideCount: number;
  };
  collections: Record<string, { rowCount: number }>;
  staff: {
    total: number;
    byRole: Record<User['role'], number>;
    credentialedCount: number;
    passwordCredentialCount: number;
    passkeyCredentialCount: number;
  };
  audit: {
    total: number;
    latestLogAt?: string;
    actionCounts: Record<string, number>;
    integrity: {
      signed: number;
      unsigned: number;
      invalid: number;
      isValid: boolean;
      latestHashAvailable: boolean;
      firstSignedAt?: string;
      lastSignedAt?: string;
    };
  };
  workflows: {
    initialSetup: {
      status: InitialSetupChecklist['status'];
      statusLabel: string;
      completionRate: number;
      completedCount: number;
      attentionCount: number;
      blockedCount: number;
      nextStepId?: string;
      unresolvedStepCount: number;
      totalRequiredActionCount: number;
      steps: {
        id: InitialSetupChecklist['steps'][number]['id'];
        status: InitialSetupChecklist['steps'][number]['status'];
        requiredActionCount: number;
      }[];
    };
    migrationPackageReadiness?: {
      status: MigrationPackageReadinessReview['status'];
      statusLabel: string;
      actionLabel: string;
      readyForOneDayTrial: boolean;
      requiredSourceCount: number;
      providedSourceCount: number;
      passedSourceCount: number;
      attentionSourceCount: number;
      blockedSourceCount: number;
      totalRowCount: number;
      totalIssueCount: number;
      referenceIssueCount: number;
      sources: {
        kind: MigrationPackageReadinessReview['sources'][number]['kind'];
        status: MigrationPackageReadinessReview['sources'][number]['status'];
        provided: boolean;
        rowCount: number;
        issueCount: number;
        nextActionPresent: boolean;
      }[];
      references: {
        id: MigrationPackageReadinessReview['references'][number]['id'];
        status: MigrationPackageReadinessReview['references'][number]['status'];
        checkedRowCount: number;
        issueCount: number;
        nextActionPresent: boolean;
      }[];
    };
    migrationTrialAcceptance?: {
      status: MigrationTrialAcceptanceReview['status'];
      statusLabel: string;
      actionLabel: string;
      readyForOneDayTrial: boolean;
      patientRows: number;
      visitRows: number;
      drugStockRows: number;
      soapRows: number;
      totalRowCount: number;
      totalIssueCount: number;
      referenceIssueCount: number;
      blockedSourceCount: number;
      attentionSourceCount: number;
      operationalCoverageStatus: MigrationTrialAcceptanceReview['operationalCoverage']['status'];
      operationalCoverageStatusLabel: string;
      patientReceptionReady: boolean;
      inventoryReady: boolean;
      medicationHistoryReady: boolean;
      readyWorkflowCount: number;
      totalWorkflowCount: number;
      evidenceIntegrityStatus: MigrationTrialAcceptanceReview['evidenceIntegrity']['status'];
      evidenceIntegrityIssueCount: number;
      realDataEquivalentConfirmed: boolean;
      sourceSystemExportedByCustomerConfirmed: boolean;
      fieldMappingReviewed: boolean;
      restorePreviewCompleted: boolean;
      firstDayTrialPlanReady: boolean;
      ownerReviewCompleted: boolean;
      passedGateCount: number;
      attentionGateCount: number;
      blockedGateCount: number;
      requiredActionCount: number;
    };
    backupGeneration: {
      status: BackupGenerationReview['status'];
      statusLabel: string;
      generationCount: number;
      encryptedGenerationCount: number;
      requiredGenerationCount: number;
      retentionDays: number;
      latestBackupRecorded: boolean;
      latestBackupRowCount?: number;
      latestDrillRecorded: boolean;
      drillAgeDays?: number;
      externalStorageStatus: BackupGenerationReview['externalStorageStatus'];
      externalStorageAgeDays?: number;
      requiredActionCount: number;
    };
    backupSchedule: {
      isEnabled: boolean;
      scheduledTime: string;
      isDue: boolean;
      status: BackupScheduleReview['status'];
      statusLabel: string;
      latestBackupRecorded: boolean;
      latestExternalStorageRecorded: boolean;
      requiredActionCount: number;
    };
    scheduledOpsContinuity?: {
      status: ScheduledOpsContinuityReview['status'];
      statusLabel: string;
      receiptCount: number;
      passReceiptCount: number;
      requiredReceiptCount: number;
      latestReceiptRecorded: boolean;
      latestReceiptAgeDays?: number;
      schedulerEvidenceReceiptCount: number;
      backupStateReceiptCount: number;
      auditStateReceiptCount: number;
      webhookDeliveredReceiptCount: number;
      webhookDryRunReceiptCount: number;
      failureNoticeCount: number;
      latestFailureRecorded: boolean;
      recoveredAfterLatestFailure: boolean;
      checkCount: number;
      blockedCheckCount: number;
      attentionCheckCount: number;
    };
    staffAccessRecovery?: {
      status: StaffAccessRecoveryReview['status'];
      statusLabel: string;
      readyForStaffAccessChange: boolean;
      caseCount: number;
      passCaseCount: number;
      attentionCaseCount: number;
      blockedCaseCount: number;
      missingReasonCount: number;
      reasonCounts: StaffAccessRecoveryReview['reasonCounts'];
      evidenceIntegrityStatus: StaffAccessRecoveryReview['evidenceIntegrity']['status'];
      evidenceIntegrityIssueCount: number;
      gates: {
        id: StaffAccessRecoveryReview['gates'][number]['id'];
        status: StaffAccessRecoveryReview['gates'][number]['status'];
        nextActionPresent: boolean;
      }[];
      cases: {
        reason: StaffAccessRecoveryReview['cases'][number]['reason'];
        targetRole: StaffAccessRecoveryReview['cases'][number]['targetRole'];
        status: StaffAccessRecoveryReview['cases'][number]['status'];
        blockedCheckCount: number;
        attentionCheckCount: number;
        nextActionPresent: boolean;
      }[];
    };
    staffAccessRecoveryMonthly?: {
      monthKey: string;
      monthLabel: string;
      status: StaffAccessRecoveryMonthlyReview['status'];
      statusLabel: string;
      actionLabel: string;
      readyForMonthlyClose: boolean;
      eventCaseCount: number;
      staffCredentialRecoveryLogCount: number;
      staffDeleteLogCount: number;
      passCaseCount: number;
      attentionCaseCount: number;
      blockedCaseCount: number;
      missingReasonCount: number;
      readinessScenarioComplete: boolean;
      evidenceIntegrityStatus?: StaffAccessRecoveryMonthlyReview['evidenceIntegrityStatus'];
      evidenceIntegrityIssueCount: number;
      requiredActionCount: number;
      latestEventRecorded: boolean;
      reasonCounts: StaffAccessRecoveryMonthlyReview['reasonCounts'];
    };
    pilotKpi?: {
      status: PilotKpiReview['status'];
      statusLabel: string;
      storeCount: number;
      weekCount: number;
      snapshotCount: number;
      missingMetricCount: number;
      claimReturnRatePercent: number;
      averageHandlingMinutes: number;
      closingRemainingTasksPerDay: number;
      stockoutsPer100Prescriptions: number;
      followUpOnTimeRatePercent: number;
      criticalIncidentCount: number;
      unrecoveredIncidentCount: number;
      supportCasesPer100Prescriptions: number;
      trendStatus: PilotKpiReview['trend']['status'];
      trendStatusLabel: string;
      worseningStoreCount: number;
      insufficientTrendStoreCount: number;
      evidenceIntegrityStatus: PilotKpiReview['evidenceIntegrity']['status'];
      evidenceIntegrityIssueCount: number;
      passedGateCount: number;
      attentionGateCount: number;
      blockedGateCount: number;
      requiredActionCount: number;
      readyForPilotExpansion: boolean;
    };
    releaseOpsAcceptance?: {
      status: ReleaseOpsAcceptanceReview['status'];
      statusLabel: string;
      readinessReviewAttached: boolean;
      releasePostReviewAttached: boolean;
      slaReviewAttached: boolean;
      supportDrillReviewAttached: boolean;
      attachedReviewCount: number;
      totalBlockedCount: number;
      totalAttentionCount: number;
      supportCaseCount: number;
      maxSupportCaseCount: number;
      errorCount: number;
      maxErrorCount: number;
      downtimeMinutes: number;
      maxDowntimeMinutes: number;
      rollbackTargetRecorded: boolean;
      recoveryMinutesRecorded: boolean;
      releaseIdsMatch: boolean;
      focusAreasLinked: boolean;
      linkageStatus: ReleaseOpsAcceptanceReview['linkage']['status'];
      linkageStatusLabel: string;
      linkedFocusAreaCount: number;
      missingLinkageActionCount: number;
      evidenceIntegrityStatus: ReleaseOpsAcceptanceReview['evidenceIntegrity']['status'];
      evidenceIntegrityIssueCount: number;
      realInquiryOrUpdateFailureDrillConfirmed: boolean;
      ownerApproved: boolean;
      handoffChecklistStored: boolean;
      nextBusinessDayReviewScheduled: boolean;
      passedGateCount: number;
      attentionGateCount: number;
      blockedGateCount: number;
      requiredActionCount: number;
      readyForReleaseExpansion: boolean;
    };
    auditRetention: {
      monthKey: string;
      status: AuditLogRetentionMonthlyReview['status'];
      statusLabel: string;
      auditJsonExportCount: number;
      retentionLedgerExportCount: number;
      returnReasonCount: number;
      requiredActionCount: number;
    };
    officialAudit: OfficialAuditSummary & {
      blockerItemCount: number;
    };
    dailyClosing: {
      monthKey: string;
      approvalCount: number;
      approvedDayCount: number;
      reviewerCount: number;
      averageCompletionRate?: number;
      daysWithBlockers: number;
      totalClosingBlockers: number;
      storeCount: number;
      previousMonthStatus: string;
    };
    aiSuggestionFeedback: {
      monthKey: string;
      totalCount: number;
      acceptedCount: number;
      modifiedCount: number;
      rejectedCount: number;
      feedbackCount: number;
      averageConfidence?: number;
      acceptanceRate: number;
      correctionRate: number;
      status: AiSuggestionFeedbackMonthlyReview['status'];
      statusLabel: string;
      storeCount: number;
      domainSummaryCount: number;
      soapDraftStatus: string;
      qualityGateStatus: AiSuggestionFeedbackMonthlyReview['qualityGate']['status'];
      qualityGateRecommendedMode: AiSuggestionFeedbackMonthlyReview['qualityGate']['recommendedMode'];
      qualityGateModeAlignment: AiSuggestionFeedbackMonthlyReview['qualityGate']['modeAlignment'];
      highConfidenceRejectedCount: number;
      rejectionRate: number;
      missingFeedbackCount: number;
    };
    printMediaFieldVerification?: {
      status: PrintMediaFieldVerificationReview['status'];
      statusLabel: string;
      requiredDocumentCount: number;
      screenshotDocumentCount: number;
      fieldEvidenceDocumentCount: number;
      passedDocumentCount: number;
      attentionDocumentCount: number;
      blockedDocumentCount: number;
      dimensionToleranceMm: number;
      evidenceIntegrityStatus?: NonNullable<PrintMediaFieldVerificationReview['evidenceIntegrity']>['status'];
      evidenceIntegrityIssueCount: number;
      printerCheckedCount: number;
      paperMatchedCount: number;
      noClippingCount: number;
      textReadableCount: number;
      marginWithinToleranceCount: number;
      sizeWithinToleranceCount: number;
      documents: {
        documentId: PrintMediaFieldVerificationReview['documents'][number]['documentId'];
        status: PrintMediaFieldVerificationReview['documents'][number]['status'];
        screenshotCaptured: boolean;
        fieldEvidenceRecorded: boolean;
        printerChecked: boolean;
        paperMatched: boolean;
        noClipping: boolean;
        textReadable: boolean;
        marginWithinTolerance: boolean;
        sizeWithinTolerance?: boolean;
        nextActionPresent: boolean;
      }[];
    };
  };
  externalConnectors?: {
    overallStatus: ExternalConnectorReadinessReport['overallStatus'];
    generatedAt: string;
    fieldReadiness?: {
      status: OnlineEligibilityFieldReadinessReport['status'];
      statusLabel: string;
      gateCount: number;
      passedGateCount: number;
      attentionGateCount: number;
      blockedGateCount: number;
      canRunFieldSuccessTrial: boolean;
      canAcceptOfficialResponseSample: boolean;
      evidenceIntegrityStatus: OnlineEligibilityFieldReadinessReport['evidenceIntegrity']['status'];
      evidenceIntegrityIssueCount: number;
      gates: {
        id: OnlineEligibilityFieldReadinessReport['gates'][number]['id'];
        status: OnlineEligibilityFieldReadinessReport['gates'][number]['status'];
        nextActionPresent: boolean;
      }[];
    };
    checks: {
      id: ExternalConnectorReadinessReport['checks'][number]['id'];
      status: ExternalConnectorReadinessReport['checks'][number]['status'];
      mode: string;
      mockFallbackAllowed: boolean;
      endpointConfigured: boolean;
      endpointProtocol?: 'http' | 'https';
      endpointHostKind: ExternalConnectorReadinessReport['checks'][number]['config']['endpointHostKind'];
      bearerTokenConfigured?: boolean;
      timeoutMs: number;
      timeoutValid: boolean;
      lastAttemptOutcome: ExternalConnectorReadinessReport['checks'][number]['lastAttempt']['outcome'];
      lastAttemptRecorded: boolean;
      lastAttemptStatusCodeClass?: ExternalConnectorReadinessReport['checks'][number]['lastAttempt']['statusCodeClass'];
      lastAttemptDurationStatus: ExternalConnectorReadinessReport['checks'][number]['lastAttempt']['durationStatus'];
      lastAttemptResponseShape: ExternalConnectorReadinessReport['checks'][number]['lastAttempt']['responseShape'];
      requiredActionCount: number;
    }[];
  };
}

function formatDateTimeStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function hasText(value: unknown): boolean {
  return String(value ?? '').trim().length > 0;
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function countAuditActions(auditLogs: AuditLog[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const log of auditLogs) {
    counts[log.actionType] = (counts[log.actionType] ?? 0) + 1;
  }
  return sortRecord(counts);
}

function latestAuditTimestamp(auditLogs: AuditLog[]): string | undefined {
  return auditLogs
    .map((log) => log.timestamp)
    .filter(Boolean)
    .sort()
    .at(-1);
}

function buildCollectionSummary(collectionCounts: AnonymousDiagnosticCollectionCounts): Record<string, { rowCount: number }> {
  const summary: Record<string, { rowCount: number }> = {};
  for (const [name, count] of Object.entries(collectionCounts).sort(([left], [right]) => left.localeCompare(right))) {
    summary[name] = { rowCount: Math.max(0, Math.trunc(Number(count) || 0)) };
  }
  return summary;
}

function countCredentialedStaff(staff: User[]) {
  return staff.reduce(
    (summary, user) => {
      const hasPassword = hasText(user.passwordHash) && hasText(user.salt);
      const hasPasskey = hasText(user.passkeyCredentialId) && hasText(user.passkeyPublicKey);
      summary.byRole[user.role] += 1;
      if (hasPassword) summary.passwordCredentialCount += 1;
      if (hasPasskey) summary.passkeyCredentialCount += 1;
      if (hasPassword || hasPasskey) summary.credentialedCount += 1;
      return summary;
    },
    {
      byRole: { admin: 0, pharmacist: 0, clerk: 0 } as Record<User['role'], number>,
      credentialedCount: 0,
      passwordCredentialCount: 0,
      passkeyCredentialCount: 0
    }
  );
}

export function makeAnonymousDiagnosticExportFileName(date = new Date()): string {
  return `yakureki_support_diagnostic_${formatDateTimeStamp(date)}.json`;
}

export function buildAnonymousDiagnosticExport(input: AnonymousDiagnosticExportInput): AnonymousDiagnosticExport {
  const generatedAt = input.generatedAt ?? new Date();
  const staffSummary = countCredentialedStaff(input.staff);

  return {
    type: 'yakureki-support-diagnostic',
    schemaVersion: 2,
    generatedAt: generatedAt.toISOString(),
    privacy: {
      containsPatientIdentifiers: false,
      containsStaffNames: false,
      containsFacilityName: false,
      containsRawAuditLogDetails: false,
      omittedData: [
        '患者名、かな、生年月日、保険番号、公費番号',
        '薬局名、住所、電話番号、FAX、開設者名、管理者名、薬剤師名',
        'スタッフ名、ユーザーID、パスワードハッシュ、ソルト、パスキー情報',
        '監査ログの詳細本文、患者ID、患者名、ログID',
        '薬品名、処方内容、SOAP本文、疑義照会メモ、バックアップ本文',
        '外部連携サービスの完全なURL、Bearerトークン、APIキー',
        '移行元CSVの原文、移行元ID、ファイル名、ローカルパス',
        '移行受入ID、移行元製品名、移行責任者名、復旧前プレビューの元資料',
        'パイロットID、店舗ID、店舗名、週次KPIの元資料',
        'リリースID、障害ID、問い合わせ本文、告知本文、更新証跡の元資料'
      ]
    },
    facility: {
      hasPharmacyName: hasText(input.settings.pharmacyName),
      hasPharmacyCode: hasText(input.settings.pharmacyCode),
      hasPostalCode: hasText(input.settings.pharmacyPostalCode),
      hasAddress: hasText(input.settings.pharmacyAddress),
      hasPhone: hasText(input.settings.pharmacyPhone),
      hasDefaultPharmacistName: hasText(input.settings.defaultPharmacistName),
      baseFeeCategory: input.settings.baseFeeCategory,
      regionalSupportAddition: input.settings.regionalSupportAddition,
      medicalDxAddition: input.settings.medicalDxAddition,
      postGenericAddition: input.settings.postGenericAddition,
      genericDispensingReduction: input.settings.genericDispensingReduction,
      aiAssistMode: normalizeAiAssistMode(input.settings.aiAssistMode),
      officialFeeCodeOverrideCount: Object.values(input.settings.officialFeeCodeOverrides || {})
        .filter((value) => /^\d{9}$/.test(String(value || '').trim())).length
    },
    collections: buildCollectionSummary(input.collectionCounts),
    staff: {
      total: input.staff.length,
      ...staffSummary
    },
    audit: {
      total: input.auditLogs.length,
      latestLogAt: latestAuditTimestamp(input.auditLogs),
      actionCounts: countAuditActions(input.auditLogs),
      integrity: {
        signed: input.auditIntegrity.signed,
        unsigned: input.auditIntegrity.unsigned,
        invalid: input.auditIntegrity.invalid,
        isValid: input.auditIntegrity.isValid,
        latestHashAvailable: hasText(input.auditIntegrity.latestHash),
        firstSignedAt: input.auditIntegrity.firstSignedAt,
        lastSignedAt: input.auditIntegrity.lastSignedAt
      }
    },
    workflows: {
      initialSetup: {
        status: input.initialSetupChecklist.status,
        statusLabel: input.initialSetupChecklist.statusLabel,
        completionRate: input.initialSetupChecklist.completionRate,
        completedCount: input.initialSetupChecklist.completedCount,
        attentionCount: input.initialSetupChecklist.attentionCount,
        blockedCount: input.initialSetupChecklist.blockedCount,
        nextStepId: input.initialSetupChecklist.nextStep?.id,
        unresolvedStepCount: input.initialSetupChecklist.steps.filter((step) => step.status !== 'complete').length,
        totalRequiredActionCount: input.initialSetupChecklist.steps
          .filter((step) => step.status !== 'complete')
          .reduce((sum, step) => sum + step.requiredActions.length, 0),
        steps: input.initialSetupChecklist.steps.map((step) => ({
          id: step.id,
          status: step.status,
          requiredActionCount: step.status === 'complete' ? 0 : step.requiredActions.length
        }))
      },
      ...(input.migrationPackageReadinessReview ? {
        migrationPackageReadiness: {
          status: input.migrationPackageReadinessReview.status,
          statusLabel: input.migrationPackageReadinessReview.statusLabel,
          actionLabel: input.migrationPackageReadinessReview.actionLabel,
          readyForOneDayTrial: input.migrationPackageReadinessReview.readyForOneDayTrial,
          requiredSourceCount: input.migrationPackageReadinessReview.requiredSourceCount,
          providedSourceCount: input.migrationPackageReadinessReview.providedSourceCount,
          passedSourceCount: input.migrationPackageReadinessReview.passedSourceCount,
          attentionSourceCount: input.migrationPackageReadinessReview.attentionSourceCount,
          blockedSourceCount: input.migrationPackageReadinessReview.blockedSourceCount,
          totalRowCount: input.migrationPackageReadinessReview.totalRowCount,
          totalIssueCount: input.migrationPackageReadinessReview.totalIssueCount,
          referenceIssueCount: input.migrationPackageReadinessReview.referenceIssueCount,
          sources: input.migrationPackageReadinessReview.sources.map((source) => ({
            kind: source.kind,
            status: source.status,
            provided: source.provided,
            rowCount: source.rowCount,
            issueCount: source.issueCount,
            nextActionPresent: source.nextAction.length > 0 && source.nextAction !== '対応不要'
          })),
          references: input.migrationPackageReadinessReview.references.map((reference) => ({
            id: reference.id,
            status: reference.status,
            checkedRowCount: reference.checkedRowCount,
            issueCount: reference.issueCount,
            nextActionPresent: reference.nextAction.length > 0 && reference.nextAction !== '対応不要'
          }))
        }
      } : {}),
      ...(input.migrationTrialAcceptanceReview ? {
        migrationTrialAcceptance: {
          status: input.migrationTrialAcceptanceReview.status,
          statusLabel: input.migrationTrialAcceptanceReview.statusLabel,
          actionLabel: input.migrationTrialAcceptanceReview.actionLabel,
          readyForOneDayTrial: input.migrationTrialAcceptanceReview.readyForOneDayTrial,
          patientRows: input.migrationTrialAcceptanceReview.metrics.patientRows,
          visitRows: input.migrationTrialAcceptanceReview.metrics.visitRows,
          drugStockRows: input.migrationTrialAcceptanceReview.metrics.drugStockRows,
          soapRows: input.migrationTrialAcceptanceReview.metrics.soapRows,
          totalRowCount: input.migrationTrialAcceptanceReview.metrics.totalRowCount,
          totalIssueCount: input.migrationTrialAcceptanceReview.metrics.totalIssueCount,
          referenceIssueCount: input.migrationTrialAcceptanceReview.metrics.referenceIssueCount,
          blockedSourceCount: input.migrationTrialAcceptanceReview.metrics.blockedSourceCount,
          attentionSourceCount: input.migrationTrialAcceptanceReview.metrics.attentionSourceCount,
          operationalCoverageStatus: input.migrationTrialAcceptanceReview.operationalCoverage.status,
          operationalCoverageStatusLabel: input.migrationTrialAcceptanceReview.operationalCoverage.statusLabel,
          patientReceptionReady: input.migrationTrialAcceptanceReview.operationalCoverage.patientReceptionReady,
          inventoryReady: input.migrationTrialAcceptanceReview.operationalCoverage.inventoryReady,
          medicationHistoryReady: input.migrationTrialAcceptanceReview.operationalCoverage.medicationHistoryReady,
          readyWorkflowCount: input.migrationTrialAcceptanceReview.operationalCoverage.readyWorkflowCount,
          totalWorkflowCount: input.migrationTrialAcceptanceReview.operationalCoverage.totalWorkflowCount,
          evidenceIntegrityStatus: input.migrationTrialAcceptanceReview.evidenceIntegrity.status,
          evidenceIntegrityIssueCount: input.migrationTrialAcceptanceReview.evidenceIntegrity.issues.length,
          realDataEquivalentConfirmed: input.migrationTrialAcceptanceReview.evidence.realDataEquivalentConfirmed,
          sourceSystemExportedByCustomerConfirmed: input.migrationTrialAcceptanceReview.evidence.sourceSystemExportedByCustomerConfirmed,
          fieldMappingReviewed: input.migrationTrialAcceptanceReview.evidence.fieldMappingReviewed,
          restorePreviewCompleted: input.migrationTrialAcceptanceReview.evidence.restorePreviewCompleted,
          firstDayTrialPlanReady: input.migrationTrialAcceptanceReview.evidence.firstDayTrialPlanReady,
          ownerReviewCompleted: input.migrationTrialAcceptanceReview.evidence.ownerReviewCompleted,
          passedGateCount: input.migrationTrialAcceptanceReview.passedGateCount,
          attentionGateCount: input.migrationTrialAcceptanceReview.attentionGateCount,
          blockedGateCount: input.migrationTrialAcceptanceReview.blockedGateCount,
          requiredActionCount: input.migrationTrialAcceptanceReview.nextActions.length
        }
      } : {}),
      backupGeneration: {
        status: input.backupGenerationReview.status,
        statusLabel: input.backupGenerationReview.statusLabel,
        generationCount: input.backupGenerationReview.generationCount,
        encryptedGenerationCount: input.backupGenerationReview.encryptedGenerationCount,
        requiredGenerationCount: input.backupGenerationReview.requiredGenerationCount,
        retentionDays: input.backupGenerationReview.retentionDays,
        latestBackupRecorded: Boolean(input.backupGenerationReview.latestBackup),
        latestBackupRowCount: input.backupGenerationReview.latestBackup?.rowCount,
        latestDrillRecorded: Boolean(input.backupGenerationReview.latestDrillAt),
        drillAgeDays: input.backupGenerationReview.drillAgeDays,
        externalStorageStatus: input.backupGenerationReview.externalStorageStatus,
        externalStorageAgeDays: input.backupGenerationReview.externalStorageAgeDays,
        requiredActionCount: input.backupGenerationReview.requiredActions.length
      },
      backupSchedule: {
        isEnabled: input.backupScheduleReview.isEnabled,
        scheduledTime: input.backupScheduleReview.scheduledTime,
        isDue: input.backupScheduleReview.isDue,
        status: input.backupScheduleReview.status,
        statusLabel: input.backupScheduleReview.statusLabel,
        latestBackupRecorded: Boolean(input.backupScheduleReview.latestBackup),
        latestExternalStorageRecorded: Boolean(input.backupScheduleReview.latestExternalStorage),
        requiredActionCount: input.backupScheduleReview.requiredActions.length
      },
      ...(input.scheduledOpsContinuityReview ? {
        scheduledOpsContinuity: {
          status: input.scheduledOpsContinuityReview.status,
          statusLabel: input.scheduledOpsContinuityReview.statusLabel,
          receiptCount: input.scheduledOpsContinuityReview.receiptCount,
          passReceiptCount: input.scheduledOpsContinuityReview.passReceiptCount,
          requiredReceiptCount: input.scheduledOpsContinuityReview.requiredReceiptCount,
          latestReceiptRecorded: Boolean(input.scheduledOpsContinuityReview.latestReceiptAt),
          latestReceiptAgeDays: input.scheduledOpsContinuityReview.latestReceiptAgeDays,
          schedulerEvidenceReceiptCount: input.scheduledOpsContinuityReview.schedulerEvidenceReceiptCount,
          backupStateReceiptCount: input.scheduledOpsContinuityReview.backupStateReceiptCount,
          auditStateReceiptCount: input.scheduledOpsContinuityReview.auditStateReceiptCount,
          webhookDeliveredReceiptCount: input.scheduledOpsContinuityReview.webhookDeliveredReceiptCount,
          webhookDryRunReceiptCount: input.scheduledOpsContinuityReview.webhookDryRunReceiptCount,
          failureNoticeCount: input.scheduledOpsContinuityReview.failureNoticeCount,
          latestFailureRecorded: Boolean(input.scheduledOpsContinuityReview.latestFailureAt),
          recoveredAfterLatestFailure: input.scheduledOpsContinuityReview.recoveredAfterLatestFailure,
          checkCount: input.scheduledOpsContinuityReview.checks.length,
          blockedCheckCount: input.scheduledOpsContinuityReview.checks.filter((check) => check.status === 'blocked').length,
          attentionCheckCount: input.scheduledOpsContinuityReview.checks.filter((check) => check.status === 'attention').length
        }
      } : {}),
      ...(input.staffAccessRecoveryReview ? {
        staffAccessRecovery: {
          status: input.staffAccessRecoveryReview.status,
          statusLabel: input.staffAccessRecoveryReview.statusLabel,
          readyForStaffAccessChange: input.staffAccessRecoveryReview.readyForStaffAccessChange,
          caseCount: input.staffAccessRecoveryReview.caseCount,
          passCaseCount: input.staffAccessRecoveryReview.passCaseCount,
          attentionCaseCount: input.staffAccessRecoveryReview.attentionCaseCount,
          blockedCaseCount: input.staffAccessRecoveryReview.blockedCaseCount,
          missingReasonCount: input.staffAccessRecoveryReview.missingReasonCount,
          reasonCounts: input.staffAccessRecoveryReview.reasonCounts,
          evidenceIntegrityStatus: input.staffAccessRecoveryReview.evidenceIntegrity.status,
          evidenceIntegrityIssueCount: input.staffAccessRecoveryReview.evidenceIntegrity.issues.length,
          gates: input.staffAccessRecoveryReview.gates.map((gate) => ({
            id: gate.id,
            status: gate.status,
            nextActionPresent: gate.nextAction.length > 0 && gate.nextAction !== '対応不要'
          })),
          cases: input.staffAccessRecoveryReview.cases.map((caseReview) => ({
            reason: caseReview.reason,
            targetRole: caseReview.targetRole,
            status: caseReview.status,
            blockedCheckCount: caseReview.blockedCheckCount,
            attentionCheckCount: caseReview.attentionCheckCount,
            nextActionPresent: caseReview.nextActions.length > 0
          }))
        }
      } : {}),
      ...(input.staffAccessRecoveryMonthlyReview ? {
        staffAccessRecoveryMonthly: {
          monthKey: input.staffAccessRecoveryMonthlyReview.monthKey,
          monthLabel: input.staffAccessRecoveryMonthlyReview.monthLabel,
          status: input.staffAccessRecoveryMonthlyReview.status,
          statusLabel: input.staffAccessRecoveryMonthlyReview.statusLabel,
          actionLabel: input.staffAccessRecoveryMonthlyReview.actionLabel,
          readyForMonthlyClose: input.staffAccessRecoveryMonthlyReview.readyForMonthlyClose,
          eventCaseCount: input.staffAccessRecoveryMonthlyReview.eventCaseCount,
          staffCredentialRecoveryLogCount: input.staffAccessRecoveryMonthlyReview.staffCredentialRecoveryLogCount,
          staffDeleteLogCount: input.staffAccessRecoveryMonthlyReview.staffDeleteLogCount,
          passCaseCount: input.staffAccessRecoveryMonthlyReview.passCaseCount,
          attentionCaseCount: input.staffAccessRecoveryMonthlyReview.attentionCaseCount,
          blockedCaseCount: input.staffAccessRecoveryMonthlyReview.blockedCaseCount,
          missingReasonCount: input.staffAccessRecoveryMonthlyReview.missingReasonCount,
          readinessScenarioComplete: input.staffAccessRecoveryMonthlyReview.readinessScenarioComplete,
          evidenceIntegrityStatus: input.staffAccessRecoveryMonthlyReview.evidenceIntegrityStatus,
          evidenceIntegrityIssueCount: input.staffAccessRecoveryMonthlyReview.evidenceIntegrityIssueCount,
          requiredActionCount: input.staffAccessRecoveryMonthlyReview.requiredActions.length,
          latestEventRecorded: Boolean(input.staffAccessRecoveryMonthlyReview.latestEventAt),
          reasonCounts: input.staffAccessRecoveryMonthlyReview.reasonCounts
        }
      } : {}),
      ...(input.pilotKpiReview ? {
        pilotKpi: {
          status: input.pilotKpiReview.status,
          statusLabel: input.pilotKpiReview.statusLabel,
          storeCount: input.pilotKpiReview.coverage.storeCount,
          weekCount: input.pilotKpiReview.coverage.weekCount,
          snapshotCount: input.pilotKpiReview.coverage.snapshotCount,
          missingMetricCount: input.pilotKpiReview.coverage.missingMetricCount,
          claimReturnRatePercent: input.pilotKpiReview.summary.claimReturnRatePercent,
          averageHandlingMinutes: input.pilotKpiReview.summary.averageHandlingMinutes,
          closingRemainingTasksPerDay: input.pilotKpiReview.summary.closingRemainingTasksPerDay,
          stockoutsPer100Prescriptions: input.pilotKpiReview.summary.stockoutsPer100Prescriptions,
          followUpOnTimeRatePercent: input.pilotKpiReview.summary.followUpOnTimeRatePercent,
          criticalIncidentCount: input.pilotKpiReview.summary.criticalIncidentCount,
          unrecoveredIncidentCount: input.pilotKpiReview.summary.unrecoveredIncidentCount,
          supportCasesPer100Prescriptions: input.pilotKpiReview.summary.supportCasesPer100Prescriptions,
          trendStatus: input.pilotKpiReview.trend.status,
          trendStatusLabel: input.pilotKpiReview.trend.statusLabel,
          worseningStoreCount: input.pilotKpiReview.trend.worseningStoreCount,
          insufficientTrendStoreCount: input.pilotKpiReview.trend.insufficientStoreCount,
          evidenceIntegrityStatus: input.pilotKpiReview.evidenceIntegrity.status,
          evidenceIntegrityIssueCount: input.pilotKpiReview.evidenceIntegrity.issues.length,
          passedGateCount: input.pilotKpiReview.passedGateCount,
          attentionGateCount: input.pilotKpiReview.attentionGateCount,
          blockedGateCount: input.pilotKpiReview.blockedGateCount,
          requiredActionCount: input.pilotKpiReview.nextActions.length,
          readyForPilotExpansion: input.pilotKpiReview.status === 'pass'
        }
      } : {}),
      ...(input.releaseOpsAcceptanceReview ? {
        releaseOpsAcceptance: {
          status: input.releaseOpsAcceptanceReview.status,
          statusLabel: input.releaseOpsAcceptanceReview.statusLabel,
          readinessReviewAttached: input.releaseOpsAcceptanceReview.sources.readinessReviewAttached,
          releasePostReviewAttached: input.releaseOpsAcceptanceReview.sources.releasePostReviewAttached,
          slaReviewAttached: input.releaseOpsAcceptanceReview.sources.slaReviewAttached,
          supportDrillReviewAttached: input.releaseOpsAcceptanceReview.sources.supportDrillReviewAttached,
          attachedReviewCount: [
            input.releaseOpsAcceptanceReview.sources.readinessReviewAttached,
            input.releaseOpsAcceptanceReview.sources.releasePostReviewAttached,
            input.releaseOpsAcceptanceReview.sources.slaReviewAttached,
            input.releaseOpsAcceptanceReview.sources.supportDrillReviewAttached
          ].filter(Boolean).length,
          totalBlockedCount: input.releaseOpsAcceptanceReview.metrics.totalBlockedCount,
          totalAttentionCount: input.releaseOpsAcceptanceReview.metrics.totalAttentionCount,
          supportCaseCount: input.releaseOpsAcceptanceReview.metrics.supportCaseCount,
          maxSupportCaseCount: input.releaseOpsAcceptanceReview.metrics.maxSupportCaseCount,
          errorCount: input.releaseOpsAcceptanceReview.metrics.errorCount,
          maxErrorCount: input.releaseOpsAcceptanceReview.metrics.maxErrorCount,
          downtimeMinutes: input.releaseOpsAcceptanceReview.metrics.downtimeMinutes,
          maxDowntimeMinutes: input.releaseOpsAcceptanceReview.metrics.maxDowntimeMinutes,
          rollbackTargetRecorded: input.releaseOpsAcceptanceReview.metrics.rollbackTargetMinutes !== undefined,
          recoveryMinutesRecorded: input.releaseOpsAcceptanceReview.metrics.recoveryMinutes !== undefined,
          releaseIdsMatch: input.releaseOpsAcceptanceReview.linkage.releaseIdsMatch,
          focusAreasLinked: input.releaseOpsAcceptanceReview.linkage.focusAreasLinked,
          linkageStatus: input.releaseOpsAcceptanceReview.linkage.status,
          linkageStatusLabel: input.releaseOpsAcceptanceReview.linkage.statusLabel,
          linkedFocusAreaCount: input.releaseOpsAcceptanceReview.linkage.sharedFocusAreaIds.length,
          missingLinkageActionCount: input.releaseOpsAcceptanceReview.linkage.requiredActions
            .filter((action) => action !== '対応不要').length,
          evidenceIntegrityStatus: input.releaseOpsAcceptanceReview.evidenceIntegrity.status,
          evidenceIntegrityIssueCount: input.releaseOpsAcceptanceReview.evidenceIntegrity.issues.length,
          realInquiryOrUpdateFailureDrillConfirmed: input.releaseOpsAcceptanceReview.evidence.realInquiryOrUpdateFailureDrillConfirmed,
          ownerApproved: input.releaseOpsAcceptanceReview.evidence.ownerApproved,
          handoffChecklistStored: input.releaseOpsAcceptanceReview.evidence.handoffChecklistStored,
          nextBusinessDayReviewScheduled: input.releaseOpsAcceptanceReview.evidence.nextBusinessDayReviewScheduled,
          passedGateCount: input.releaseOpsAcceptanceReview.passedGateCount,
          attentionGateCount: input.releaseOpsAcceptanceReview.attentionGateCount,
          blockedGateCount: input.releaseOpsAcceptanceReview.blockedGateCount,
          requiredActionCount: input.releaseOpsAcceptanceReview.nextActions.length,
          readyForReleaseExpansion: input.releaseOpsAcceptanceReview.status === 'pass'
        }
      } : {}),
      auditRetention: {
        monthKey: input.auditRetentionReview.monthKey,
        status: input.auditRetentionReview.status,
        statusLabel: input.auditRetentionReview.statusLabel,
        auditJsonExportCount: input.auditRetentionReview.auditJsonExportCount,
        retentionLedgerExportCount: input.auditRetentionReview.retentionLedgerExportCount,
        returnReasonCount: input.auditRetentionReview.returnReasons.length,
        requiredActionCount: input.auditRetentionReview.requiredActions.length
      },
      officialAudit: {
        ...input.officialAuditSummary,
        blockerItemCount: input.officialAuditBlockerCount
      },
      dailyClosing: {
        monthKey: input.dailyClosingReview.monthKey,
        approvalCount: input.dailyClosingReview.approvalCount,
        approvedDayCount: input.dailyClosingReview.approvedDayCount,
        reviewerCount: input.dailyClosingReview.reviewerCount,
        averageCompletionRate: input.dailyClosingReview.averageCompletionRate,
        daysWithBlockers: input.dailyClosingReview.daysWithBlockers,
        totalClosingBlockers: input.dailyClosingReview.totalClosingBlockers,
        storeCount: input.dailyClosingReview.storeBenchmark.storeCount,
        previousMonthStatus: input.dailyClosingReview.previousMonthComparison.status
      },
      aiSuggestionFeedback: {
        monthKey: input.aiSuggestionFeedbackReview.monthKey,
        totalCount: input.aiSuggestionFeedbackReview.totalCount,
        acceptedCount: input.aiSuggestionFeedbackReview.acceptedCount,
        modifiedCount: input.aiSuggestionFeedbackReview.modifiedCount,
        rejectedCount: input.aiSuggestionFeedbackReview.rejectedCount,
        feedbackCount: input.aiSuggestionFeedbackReview.feedbackCount,
        averageConfidence: input.aiSuggestionFeedbackReview.averageConfidence,
        acceptanceRate: input.aiSuggestionFeedbackReview.acceptanceRate,
        correctionRate: input.aiSuggestionFeedbackReview.correctionRate,
        status: input.aiSuggestionFeedbackReview.status,
        statusLabel: input.aiSuggestionFeedbackReview.statusLabel,
        storeCount: input.aiSuggestionFeedbackReview.storeComparison.storeCount,
        domainSummaryCount: input.aiSuggestionFeedbackReview.domainSummaries.length,
        soapDraftStatus: input.aiSuggestionFeedbackReview.soapDraftSummary.status,
        qualityGateStatus: input.aiSuggestionFeedbackReview.qualityGate.status,
        qualityGateRecommendedMode: input.aiSuggestionFeedbackReview.qualityGate.recommendedMode,
        qualityGateModeAlignment: input.aiSuggestionFeedbackReview.qualityGate.modeAlignment,
        highConfidenceRejectedCount: input.aiSuggestionFeedbackReview.qualityGate.highConfidenceRejectedCount,
        rejectionRate: input.aiSuggestionFeedbackReview.qualityGate.rejectionRate,
        missingFeedbackCount: input.aiSuggestionFeedbackReview.qualityGate.missingFeedbackCount
      },
      ...(input.printMediaFieldVerificationReview ? {
        printMediaFieldVerification: {
          status: input.printMediaFieldVerificationReview.status,
          statusLabel: input.printMediaFieldVerificationReview.statusLabel,
          requiredDocumentCount: input.printMediaFieldVerificationReview.requiredDocumentCount,
          screenshotDocumentCount: input.printMediaFieldVerificationReview.screenshotDocumentCount,
          fieldEvidenceDocumentCount: input.printMediaFieldVerificationReview.fieldEvidenceDocumentCount,
          passedDocumentCount: input.printMediaFieldVerificationReview.passedDocumentCount,
          attentionDocumentCount: input.printMediaFieldVerificationReview.attentionDocumentCount,
          blockedDocumentCount: input.printMediaFieldVerificationReview.blockedDocumentCount,
          dimensionToleranceMm: input.printMediaFieldVerificationReview.dimensionToleranceMm,
          evidenceIntegrityStatus: input.printMediaFieldVerificationReview.evidenceIntegrity?.status,
          evidenceIntegrityIssueCount: input.printMediaFieldVerificationReview.evidenceIntegrity?.issues.length ?? 0,
          printerCheckedCount: input.printMediaFieldVerificationReview.documents.filter((document) => document.printerChecked).length,
          paperMatchedCount: input.printMediaFieldVerificationReview.documents.filter((document) => document.paperMatched).length,
          noClippingCount: input.printMediaFieldVerificationReview.documents.filter((document) => document.noClipping).length,
          textReadableCount: input.printMediaFieldVerificationReview.documents.filter((document) => document.textReadable).length,
          marginWithinToleranceCount: input.printMediaFieldVerificationReview.documents.filter((document) => document.marginWithinTolerance).length,
          sizeWithinToleranceCount: input.printMediaFieldVerificationReview.documents.filter((document) => document.sizeWithinTolerance === true).length,
          documents: input.printMediaFieldVerificationReview.documents.map((document) => ({
            documentId: document.documentId,
            status: document.status,
            screenshotCaptured: document.screenshotCaptured,
            fieldEvidenceRecorded: document.fieldEvidenceRecorded,
            printerChecked: document.printerChecked,
            paperMatched: document.paperMatched,
            noClipping: document.noClipping,
            textReadable: document.textReadable,
            marginWithinTolerance: document.marginWithinTolerance,
            sizeWithinTolerance: document.sizeWithinTolerance,
            nextActionPresent: document.nextAction.length > 0 && document.nextAction !== '対応不要'
          }))
        }
      } : {})
    },
    ...(input.externalConnectorReadiness ? {
      externalConnectors: {
        overallStatus: input.externalConnectorReadiness.overallStatus,
        generatedAt: input.externalConnectorReadiness.generatedAt,
        ...(input.onlineEligibilityFieldReadiness ? {
          fieldReadiness: {
            status: input.onlineEligibilityFieldReadiness.status,
            statusLabel: input.onlineEligibilityFieldReadiness.statusLabel,
            gateCount: input.onlineEligibilityFieldReadiness.gateCount,
            passedGateCount: input.onlineEligibilityFieldReadiness.passedGateCount,
            attentionGateCount: input.onlineEligibilityFieldReadiness.attentionGateCount,
            blockedGateCount: input.onlineEligibilityFieldReadiness.blockedGateCount,
            canRunFieldSuccessTrial: input.onlineEligibilityFieldReadiness.canRunFieldSuccessTrial,
            canAcceptOfficialResponseSample: input.onlineEligibilityFieldReadiness.canAcceptOfficialResponseSample,
            evidenceIntegrityStatus: input.onlineEligibilityFieldReadiness.evidenceIntegrity.status,
            evidenceIntegrityIssueCount: input.onlineEligibilityFieldReadiness.evidenceIntegrity.issues.length,
            gates: input.onlineEligibilityFieldReadiness.gates.map((gate) => ({
              id: gate.id,
              status: gate.status,
              nextActionPresent: gate.nextAction.length > 0 && gate.nextAction !== '対応不要'
            }))
          }
        } : {}),
        checks: input.externalConnectorReadiness.checks.map((check) => ({
          id: check.id,
          status: check.status,
          mode: check.config.mode,
          mockFallbackAllowed: check.config.mockFallbackAllowed,
          endpointConfigured: check.config.endpointConfigured,
          endpointProtocol: check.config.endpointProtocol,
          endpointHostKind: check.config.endpointHostKind,
          bearerTokenConfigured: check.config.bearerTokenConfigured,
          timeoutMs: check.config.timeoutMs,
          timeoutValid: check.config.timeoutValid,
          lastAttemptOutcome: check.lastAttempt.outcome,
          lastAttemptRecorded: check.lastAttempt.attemptRecorded,
          lastAttemptStatusCodeClass: check.lastAttempt.statusCodeClass,
          lastAttemptDurationStatus: check.lastAttempt.durationStatus,
          lastAttemptResponseShape: check.lastAttempt.responseShape,
          requiredActionCount: check.requiredActions.length
        }))
      }
    } : {})
  };
}

export function buildAnonymousDiagnosticExportJson(input: AnonymousDiagnosticExportInput): string {
  return JSON.stringify(buildAnonymousDiagnosticExport(input), null, 2);
}
