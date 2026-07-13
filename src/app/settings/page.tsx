'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useDatabase } from '@/db/DatabaseProvider';
import { UploadCloud, Building2, CheckCircle, AlertTriangle, Loader2, Save, FileText, History, Search, Fingerprint, KeyRound, Plus, Trash2, ShieldCheck, Database, Download, CalendarClock, Network, RefreshCw } from 'lucide-react';
import encoding from 'encoding-japanese';
import { toast } from 'sonner';
import { FacilitySettings, AuditLog, Drug, Patient, User, PatientMedicationInfoTemplate, PatientMedicationInfoTemplateStatus } from '@/db/types';
import {
  buildPatientMergeExecutionPlan,
  buildPatientMergePlan,
  type PatientMergeExecutionPlan,
  type PatientMergePlan
} from '@/lib/patient_merge';
import {
  applyPatientMergeExecutionPlan,
  applyPatientMergeOperation,
  createRxdbPatientMergeExecutionStore,
  PatientMergeExecutionError
} from '@/lib/patient_merge_execution';
import {
  buildPatientDuplicateScanAuditDetail,
  findDuplicatePatientGroups,
  type PatientDuplicateGroup,
  type PatientDuplicateScanReport
} from '@/lib/patient_duplicate_review';
import {
  buildDrugDuplicateScanAuditDetail,
  buildDrugUsageStats,
  findDuplicateDrugGroups,
  type DrugDuplicateGroup,
  type DrugDuplicateScanReport
} from '@/lib/drug_duplicate_review';
import {
  buildDrugMergeExecutionPlan,
  buildDrugMergePlan,
  type DrugMergeExecutionPlan,
  type DrugMergeItemRef,
  type DrugMergePlan
} from '@/lib/drug_merge';
import {
  applyDrugMergeExecutionPlan,
  applyDrugMergeOperation,
  createRxdbDrugMergeExecutionStore,
  DrugMergeExecutionError
} from '@/lib/drug_merge_execution';
import {
  DISPENSING_OFFICIAL_FEE_CODE_OVERRIDE_ITEMS,
  type OfficialFeeCodeOverrideKey
} from '@/lib/calculator';
import {
  buildOfficialFeeCodeMasterProposalFromCsv,
  buildOfficialFeeCodeMasterProposalReviewCsv,
  buildOfficialFeeCodeOverrideTemplateCsv,
  makeOfficialFeeCodeMasterProposalReviewCsvFileName,
  makeOfficialFeeCodeOverrideCsvFileName,
  parseOfficialFeeCodeOverrideCsv,
  type OfficialFeeCodeMasterProposal
} from '@/lib/official_fee_code_overrides';
import {
  ALL_PERMISSION_ACTIONS,
  DEFAULT_ROLE_PERMISSION_POLICY,
  buildRolePermissionPolicyAuditDetail,
  canUserPerform,
  getCurrentUser,
  getPermissionDeniedMessage,
  getPermissionLabel,
  getRoleLabel,
  logAuditAction,
  normalizeRolePermissionPolicy,
  readRolePermissionPolicy,
  resetRolePermissionPolicy,
  UNAUTHENTICATED_USER,
  writeRolePermissionPolicy,
  type PermissionAction,
  type RolePermissionPolicy
} from '@/lib/audit';
import { hasLoginCredential, isInitialAdminUser } from '@/lib/initial_staff';
import TerminalSyncPanel from '@/components/TerminalSyncPanel';
import {
  buildAuditLogExportJson,
  buildAuditLogRetentionLedgerCsv,
  buildAuditLogRetentionManagerReviewAuditDetail,
  buildAuditLogRetentionMonthlyReview,
  buildAuditLogRetentionMonthlyReviewCsv,
  verifyAuditLogIntegrity,
  type AuditIntegrityReport
} from '@/lib/audit_integrity';
import {
  buildOperationalClosingMonthlyReview,
  buildOperationalClosingMonthlyReviewCsv,
  buildOperationalClosingStoreBenchmarkActionAuditDetail,
  buildOperationalClosingStoreBenchmarkActionPostponementAuditDetail,
  buildOperationalClosingStoreBenchmarkBiExport,
  type OperationalClosingStoreBenchmarkActionTemplate
} from '@/lib/operational_closing_review';
import {
  buildAiSuggestionFeedbackBiExport,
  buildAiSuggestionFeedbackMonthlyReview,
  buildAiSuggestionFeedbackMonthlyReviewCsv
} from '@/lib/ai_suggestion_feedback';
import {
  AI_ASSIST_MODE_DESCRIPTIONS,
  AI_ASSIST_MODE_LABELS,
  normalizeAiAssistMode
} from '@/lib/ai_assist_policy';
import {
  buildDatabaseBackup,
  countBackupRows,
  importDatabaseBackup,
  makeBackupFileName,
  validateBackupPayload,
  isEncryptedBackup,
  encryptBackupPayload,
  decryptBackupPayload,
  calculateBackupDiff,
  buildBackupRestoreDrillReport,
  buildBackupRestoreDrillAuditDetail,
  buildBackupGenerationReview,
  buildBackupGenerationReviewCsv,
  buildBackupExternalStorageEvidence,
  buildBackupExternalStorageAuditDetail,
  buildBackupExternalStorageEvidenceFromTransferReceipt,
  buildBackupExternalTransferManifest,
  buildBackupExternalTransferManifestAuditDetail,
  buildBackupExternalTransferManifestJson,
  buildBackupScheduleReview,
  buildBackupSchedulePolicyAuditDetail,
  DEFAULT_BACKUP_SCHEDULE_POLICY,
  makeBackupExternalTransferManifestFileName,
  validateBackupExternalTransferReceipt,
  type BackupSchedulePolicy,
  type BackupCollectionName,
  type CollectionDiff,
  type BackupRestoreDrillReport,
  type YakurekiBackup
} from '@/lib/backup';
import {
  buildDrugStockCsvMigrationPreview,
  buildPatientCsvMigrationPreview,
  buildSoapCsvMigrationPreview,
  buildVisitCsvMigrationPreview,
  type DrugStockCsvMigrationPreview,
  type PatientCsvMigrationPreview,
  type SoapCsvMigrationPreview,
  type VisitCsvMigrationPreview
} from '@/lib/migration_csv';
import {
  readBackupSchedulePolicy,
  writeBackupSchedulePolicy
} from '@/lib/backup_schedule_storage';
import {
  buildInitialSetupChecklist,
  buildInitialSetupChecklistCsv,
  buildInitialSetupHandoffMemo,
  type InitialSetupStep,
  type InitialSetupTab
} from '@/lib/onboarding';
import {
  buildDrugMasterDiffCsv,
  buildDrugMasterUpdateArtifacts,
  makeDrugMasterDiffCsvFileName,
  makeDrugMasterRollbackFileName,
  validateDrugMasterRollbackPayload
} from '@/lib/drug_master_version';
import {
  DRUG_MASTER_SPECIFICATION_SOURCE,
  buildDrugMasterColumnDefinitionReview,
  buildDrugMasterSpecificationRevisionReview,
  formatDrugMasterColumnDefinitionReview,
  formatDrugMasterCsvLayoutLabel,
  formatDrugMasterSpecificationRevisionReview,
  parseDrugMasterUpdateCsv
} from '@/lib/drug_master_csv';
import {
  buildDrugMasterSpecificationPdfDiffReview,
  formatDrugMasterSpecificationPdfDiffReview,
  type DrugMasterSpecificationPdfDiffReview
} from '@/lib/drug_master_spec_pdf';
import type { DrugMasterOfficialSpecPdfFetchResult } from '@/lib/drug_master_official_spec_pdf';
import {
  extractDrugMasterCsvFromZip,
  isDrugMasterZipUpload
} from '@/lib/drug_master_zip';
import {
  buildDrugMasterSourceEvidence,
  extractSskDrugMasterDownloadCandidates,
  formatDrugMasterSourceUrlReview,
  normalizeDrugMasterSourceUrl,
  reviewDrugMasterSourceUrl,
  type DrugMasterOfficialDownloadCandidate
} from '@/lib/drug_master_provenance';
import type { DrugMasterOfficialPageFetchResult } from '@/lib/drug_master_official_page';
import { OFFICIAL_AUDIT_ITEMS, getOfficialAuditBlockers, getOfficialAuditSummary, type OfficialAuditStatus } from '@/lib/official_audit';
import {
  buildDispensingUkeSpecificationPdfAllFieldImplementationPack,
  buildDispensingUkeSpecificationPdfAllFieldImplementationPackText,
  buildDispensingUkeSpecificationPdfAllFieldCompletionGate,
  buildDispensingUkeSpecificationPdfAllFieldCompletionGateCsv,
  buildDispensingUkeSpecificationPdfFieldDefinitionReview,
  formatDispensingUkeSpecificationPdfAllFieldCompletionGate,
  parseDispensingUkeSpecificationPdfText,
  type DispensingUkeSpecificationPdfAllFieldCompletionGate,
  type DispensingUkeSpecificationPdfFieldDefinitionImplementationConfirmation
} from '@/lib/receipt/dispensing_uke_spec_pdf';
import type { DispensingUkeOfficialSpecPdfFetchResult } from '@/lib/receipt/dispensing_uke_official_spec_pdf';
import {
  DISPENSING_UKE_RECORD_SPEC_SOURCE,
  buildDispensingUkeOfficialAllFieldDefinitionGate,
  buildDispensingUkeOfficialAllFieldDefinitionGateCsv,
  formatDispensingUkeOfficialAllFieldDefinitionGate
} from '@/lib/receipt/dispensing_uke_validation';
import {
  buildAnonymousDiagnosticExportJson,
  makeAnonymousDiagnosticExportFileName
} from '@/lib/anonymous_diagnostic_export';
import type { ExternalConnectorReadinessReport } from '@/lib/external_connector_readiness';
import { buildOnlineEligibilityFieldReadinessReport } from '@/lib/online_eligibility_field_readiness';
import { buildOnlineEligibilityResponseDiffReport } from '@/lib/online_eligibility_response_diff';
import {
  buildStaffCredentialRecoveryAuditDetail,
  buildStaffRecoveryChecklist,
  STAFF_RECOVERY_REASON_LABELS,
  type StaffRecoveryReason,
  type StaffRecoveryStepStatus
} from '@/lib/staff_recovery';
import {
  buildStaffAccessRecoveryMonthlyReview,
  buildStaffAccessRecoveryMonthlyReviewCsv,
  buildStaffAccessRecoveryReviewFromAuditLogs
} from '@/lib/staff_access_recovery_review';
import {
  buildPatientMedicationInfoApprovalWriteSet,
  buildPmdaMedicationSearchUrl,
  getPatientMedicationInfoApprovalIssues,
  getPatientMedicationInfoApprovalReadinessIssues,
  hasPatientMedicationInfoTemplateContentChanges,
  isApprovedPatientMedicationInfoTemplate,
  shouldForkPatientMedicationInfoTemplate
} from '@/lib/patient_medication_info';
import {
  buildPatientMedicationInfoTemplateCsv,
  makePatientMedicationInfoCsvFileName,
  parsePatientMedicationInfoTemplateCsv
} from '@/lib/patient_medication_info_csv';
import {
  buildPatientMedicationInfoSafetyDraft,
  buildPatientMedicationInfoSafetyDraftTemplate,
  extractDrugCodeFromDrugInfoId,
  makePatientMedicationInfoSafetyDraftCsvFileName
} from '@/lib/patient_medication_info_safety_draft';
import {
  findDrugInfosByDrugNames,
  getDrugInfoReferenceCount,
  loadDrugInfoReferenceData
} from '@/lib/drug_info_reference';

type SettingsTab = 'facility' | 'external' | 'master' | 'medicationInfo' | 'backup' | 'officialAudit' | 'audit' | 'staff' | 'terminalSync';
type MedicationInfoSourceType = NonNullable<PatientMedicationInfoTemplate['sourceType']>;
type MedicationInfoTemplateStatusFilter = 'all' | PatientMedicationInfoTemplateStatus;
type MedicationInfoTemplateReadinessFilter = 'all' | 'ready' | 'missing';

type MedicationInfoCsvImportSummary = {
  fileName: string;
  importedCount: number;
  readyForApprovalCount: number;
  warningCount: number;
  importedAt: string;
};

type MedicationInfoTemplateForm = {
  templateId: string;
  drugCode: string;
  drugName: string;
  genericName: string;
  status: PatientMedicationInfoTemplateStatus;
  sideEffectText: string;
  counselingText: string;
  sourceType: MedicationInfoSourceType;
  sourceUrl: string;
  sourceRevisionDate: string;
  sourceHash: string;
  needsReviewReason: string;
};

const MEDICATION_INFO_TEMPLATE_STATUS_LABELS: Record<PatientMedicationInfoTemplateStatus, string> = {
  draft: '下書き',
  approved: '承認済み',
  needs_review: '要再確認',
  retired: '廃止'
};

const MEDICATION_INFO_SOURCE_TYPE_LABELS: Record<MedicationInfoSourceType, string> = {
  pmda_insert: 'PMDA 添付文書',
  pmda_patient_guide: 'PMDA 患者向医薬品ガイド',
  pharmacy_authored: '薬局作成',
  licensed: '許諾済み資料',
  other: 'その他'
};

const MEDICATION_INFO_TEMPLATE_READINESS_LABELS: Record<MedicationInfoTemplateReadinessFilter, string> = {
  all: 'すべて',
  ready: '承認準備OK',
  missing: '不足あり'
};

const createEmptyMedicationInfoTemplateForm = (): MedicationInfoTemplateForm => ({
  templateId: '',
  drugCode: '',
  drugName: '',
  genericName: '',
  status: 'draft',
  sideEffectText: '',
  counselingText: '',
  sourceType: 'pharmacy_authored',
  sourceUrl: '',
  sourceRevisionDate: '',
  sourceHash: '',
  needsReviewReason: ''
});

const trimOrUndefined = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const makeMedicationInfoTemplateId = (drugCode: string, date = new Date()): string => {
  const normalizedDrugCode = drugCode.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'drug';
  return `pmit_${normalizedDrugCode}_${date.getTime()}`;
};

const medicationInfoTemplateToForm = (template: PatientMedicationInfoTemplate): MedicationInfoTemplateForm => ({
  templateId: template.templateId,
  drugCode: template.drugCode,
  drugName: template.drugName,
  genericName: template.genericName || '',
  status: template.status,
  sideEffectText: template.sideEffectText || '',
  counselingText: template.counselingText || '',
  sourceType: template.sourceType || 'pharmacy_authored',
  sourceUrl: template.sourceUrl || '',
  sourceRevisionDate: template.sourceRevisionDate || '',
  sourceHash: template.sourceHash || '',
  needsReviewReason: template.needsReviewReason || ''
});

const sortMedicationInfoTemplates = (templates: PatientMedicationInfoTemplate[]): PatientMedicationInfoTemplate[] => (
  [...templates].sort((a, b) => {
    const aTimestamp = a.updatedAt || a.approvedAt || a.createdAt || '';
    const bTimestamp = b.updatedAt || b.approvedAt || b.createdAt || '';
    return bTimestamp.localeCompare(aTimestamp) || a.drugName.localeCompare(b.drugName, 'ja');
  })
);

interface DrugMasterImportSource {
  sourceFileName: string;
  sourceBuffer: ArrayBuffer;
  sourceSizeBytes: number;
  sourceUrl?: string;
}

const INITIAL_SETUP_TAB_PERMISSIONS: Record<InitialSetupTab, PermissionAction> = {
  facility: 'manage_facility_settings',
  master: 'update_drug_master',
  backup: 'manage_backups',
  audit: 'view_audit_logs',
  staff: 'manage_staff'
};

const ROLE_PERMISSION_SETTING_ROLES: User['role'][] = ['admin', 'pharmacist', 'clerk'];

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

function makeAuditLogExportFileName(date = new Date()): string {
  return `yakureki_audit_logs_${formatDateTimeStamp(date)}.json`;
}

function makeAuditLogRetentionLedgerCsvFileName(date = new Date()): string {
  return `yakureki_audit_retention_ledger_${formatDateTimeStamp(date)}.csv`;
}

function makeAuditLogRetentionMonthlyReviewCsvFileName(monthKey: string): string {
  return `yakureki_audit_retention_monthly_review_${monthKey.replace('-', '')}.csv`;
}

function makeDailyClosingReviewCsvFileName(monthKey: string): string {
  return `yakureki_daily_closing_review_${monthKey.replace('-', '')}.csv`;
}

function makeDailyClosingStoreBenchmarkBiExportFileName(monthKey: string): string {
  return `yakureki_daily_closing_store_benchmark_${monthKey.replace('-', '')}.json`;
}

function makeAiSuggestionFeedbackReviewCsvFileName(monthKey: string): string {
  return `yakureki_ai_feedback_review_${monthKey.replace('-', '')}.csv`;
}

function makeStaffAccessRecoveryMonthlyReviewCsvFileName(monthKey: string): string {
  return `yakureki_staff_access_recovery_monthly_review_${monthKey.replace('-', '')}.csv`;
}

function makeAiSuggestionFeedbackBiExportFileName(monthKey: string): string {
  return `yakureki_ai_feedback_bi_${monthKey.replace('-', '')}.json`;
}

function makeBackupGenerationReviewCsvFileName(date = new Date()): string {
  return `yakureki_backup_generation_review_${formatDateTimeStamp(date)}.csv`;
}

function makeInitialSetupChecklistCsvFileName(date = new Date()): string {
  return `yakureki_initial_setup_checklist_${formatDateTimeStamp(date)}.csv`;
}

function makeDispensingUkeSpecReviewCsvFileName(date = new Date()): string {
  return `yakureki_uke_spec_all_fields_${formatDateTimeStamp(date)}.csv`;
}

function makeDispensingUkeOfficialAllFieldsGateCsvFileName(date = new Date()): string {
  return `yakureki_official_uke_all_fields_gate_${formatDateTimeStamp(date)}.csv`;
}

function makeDispensingUkeSpecImplementationPackFileName(date = new Date()): string {
  return `yakureki_uke_spec_implementation_pack_${formatDateTimeStamp(date)}.txt`;
}

const dispensingUkeSpecConfirmationStatusByLabel: Record<string, DispensingUkeSpecificationPdfFieldDefinitionImplementationConfirmation['status']> = {
  checking: 'checking',
  '確認中': 'checking',
  ready_to_define: 'ready_to_define',
  '定義追加準備': 'ready_to_define',
  implemented: 'implemented',
  '実装済み': 'implemented',
  blocked: 'blocked',
  '保留': 'blocked'
};

function parseDispensingUkeSpecConfirmationText(
  value: string,
  fallbackReviewedAt = new Date()
): DispensingUkeSpecificationPdfFieldDefinitionImplementationConfirmation[] {
  const fallbackDateText = fallbackReviewedAt.toISOString().slice(0, 10);
  return value
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => line && !line.startsWith('#'))
    .map(({ line, lineNumber }) => {
      const parts = line.split(/[,\t|]/).map((part) => part.trim());
      const [taskId, statusLabel, evidenceLabel, owner, reviewedAt, ...noteParts] = parts;
      const status = dispensingUkeSpecConfirmationStatusByLabel[statusLabel || ''];
      if (!taskId || !status || !evidenceLabel) {
        throw new Error(`${lineNumber}行目の確認メモは「タスクID, 状態, 根拠」の形で入力してください。`);
      }

      return {
        taskId,
        status,
        evidenceLabel,
        owner: owner || undefined,
        reviewedAt: reviewedAt || fallbackDateText,
        note: noteParts.filter(Boolean).join(' / ') || undefined
      };
    });
}

const drugMasterCandidateKindLabel: Record<DrugMasterOfficialDownloadCandidate['kind'], string> = {
  full_master: '全件',
  revision_master: '改定分',
  revision_notice: '改定内容',
  long_listed_drug: '長期収載',
  abolition_period: '経過措置',
  other: 'その他'
};

const drugMasterSpecPdfDiffFieldLabel = {
  label: '項目名',
  mode: 'モード',
  digits: '桁数',
  bytes: 'バイト数'
} as const;

export default function SettingsPage() {
  const db = useDatabase();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isImportingDrugMasterFromUrl, setIsImportingDrugMasterFromUrl] = useState(false);
  const [drugMasterSourceUrl, setDrugMasterSourceUrl] = useState('');
  const [drugMasterOfficialPageHtml, setDrugMasterOfficialPageHtml] = useState('');
  const [drugMasterCandidates, setDrugMasterCandidates] = useState<DrugMasterOfficialDownloadCandidate[]>([]);
  const [drugMasterCandidateMessage, setDrugMasterCandidateMessage] = useState('');
  const [drugMasterSpecPdfText, setDrugMasterSpecPdfText] = useState('');
  const [drugMasterSpecPdfReview, setDrugMasterSpecPdfReview] = useState<DrugMasterSpecificationPdfDiffReview | null>(null);
  const [drugMasterSpecPdfReviewLabel, setDrugMasterSpecPdfReviewLabel] = useState('');
  const [isFetchingDrugMasterSpecPdf, setIsFetchingDrugMasterSpecPdf] = useState(false);
  const [isFetchingDrugMasterOfficialPage, setIsFetchingDrugMasterOfficialPage] = useState(false);
  const [dispensingUkeSpecPdfText, setDispensingUkeSpecPdfText] = useState('');
  const [dispensingUkeSpecConfirmationText, setDispensingUkeSpecConfirmationText] = useState('');
  const [dispensingUkeSpecCompletionGate, setDispensingUkeSpecCompletionGate] = useState<DispensingUkeSpecificationPdfAllFieldCompletionGate | null>(null);
  const [dispensingUkeSpecCompletionLabel, setDispensingUkeSpecCompletionLabel] = useState('');
  const [isFetchingDispensingUkeSpecPdf, setIsFetchingDispensingUkeSpecPdf] = useState(false);
  const [isExportingDispensingUkeSpecReview, setIsExportingDispensingUkeSpecReview] = useState(false);
  const [isExportingDispensingUkeOfficialAllFieldsGate, setIsExportingDispensingUkeOfficialAllFieldsGate] = useState(false);
  const [isExportingDispensingUkeSpecImplementationPack, setIsExportingDispensingUkeSpecImplementationPack] = useState(false);
  const [rollbackFile, setRollbackFile] = useState<File | null>(null);
  const [isRollingBackDrugMaster, setIsRollingBackDrugMaster] = useState(false);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [migrationCsvKind, setMigrationCsvKind] = useState<'patients' | 'visits' | 'drug_stocks' | 'soap_records'>('patients');
  const [migrationCsvFile, setMigrationCsvFile] = useState<File | null>(null);
  const [migrationCsvPreview, setMigrationCsvPreview] = useState<PatientCsvMigrationPreview | VisitCsvMigrationPreview | DrugStockCsvMigrationPreview | SoapCsvMigrationPreview | null>(null);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isExportingBackupGenerationReview, setIsExportingBackupGenerationReview] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [isAnalyzingMigrationCsv, setIsAnalyzingMigrationCsv] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('facility');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditIntegrity, setAuditIntegrity] = useState<AuditIntegrityReport | null>(null);
  const [isCheckingAuditIntegrity, setIsCheckingAuditIntegrity] = useState(false);
  const [isExportingAuditLogs, setIsExportingAuditLogs] = useState(false);
  const [isExportingAnonymousDiagnostic, setIsExportingAnonymousDiagnostic] = useState(false);
  const [externalConnectorReadiness, setExternalConnectorReadiness] = useState<ExternalConnectorReadinessReport | null>(null);
  const [isLoadingExternalConnectorReadiness, setIsLoadingExternalConnectorReadiness] = useState(false);
  const [isExportingAuditRetentionLedger, setIsExportingAuditRetentionLedger] = useState(false);
  const [isExportingAuditRetentionReview, setIsExportingAuditRetentionReview] = useState(false);
  const [isRecordingAuditRetentionManagerReview, setIsRecordingAuditRetentionManagerReview] = useState(false);
  const [isExportingDailyClosingReview, setIsExportingDailyClosingReview] = useState(false);
  const [isExportingDailyClosingStoreBenchmark, setIsExportingDailyClosingStoreBenchmark] = useState(false);
  const [recordingDailyClosingKpiActionId, setRecordingDailyClosingKpiActionId] = useState<string | null>(null);
  const [postponingDailyClosingKpiActionId, setPostponingDailyClosingKpiActionId] = useState<string | null>(null);
  const [isExportingAiSuggestionFeedbackReview, setIsExportingAiSuggestionFeedbackReview] = useState(false);
  const [isExportingAiSuggestionFeedbackBi, setIsExportingAiSuggestionFeedbackBi] = useState(false);
  const [isExportingStaffAccessRecoveryMonthlyReview, setIsExportingStaffAccessRecoveryMonthlyReview] = useState(false);
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [currentUser, setCurrentUser] = useState<User>(UNAUTHENTICATED_USER);
  const [medicationInfoTemplates, setMedicationInfoTemplates] = useState<PatientMedicationInfoTemplate[]>([]);
  const [medicationInfoTemplateForm, setMedicationInfoTemplateForm] = useState<MedicationInfoTemplateForm>(() => createEmptyMedicationInfoTemplateForm());
  const [medicationInfoTemplateSearch, setMedicationInfoTemplateSearch] = useState('');
  const [medicationInfoTemplateStatusFilter, setMedicationInfoTemplateStatusFilter] = useState<MedicationInfoTemplateStatusFilter>('all');
  const [medicationInfoTemplateReadinessFilter, setMedicationInfoTemplateReadinessFilter] = useState<MedicationInfoTemplateReadinessFilter>('all');
  const [medicationInfoCsvImportSummary, setMedicationInfoCsvImportSummary] = useState<MedicationInfoCsvImportSummary | null>(null);
  const [selectedMedicationInfoTemplateId, setSelectedMedicationInfoTemplateId] = useState('');
  const [isLoadingMedicationInfoTemplates, setIsLoadingMedicationInfoTemplates] = useState(false);
  const [isSavingMedicationInfoTemplate, setIsSavingMedicationInfoTemplate] = useState(false);
  const [isImportingMedicationInfoCsv, setIsImportingMedicationInfoCsv] = useState(false);
  const [isBuildingMedicationInfoSafetyDraft, setIsBuildingMedicationInfoSafetyDraft] = useState(false);
  const [isExportingMedicationInfoSafetyDraftCsv, setIsExportingMedicationInfoSafetyDraftCsv] = useState(false);
  const canManageFacility = canUserPerform(currentUser, 'manage_facility_settings');
  const canUpdateDrugMaster = canUserPerform(currentUser, 'update_drug_master');
  const canViewOfficialAudit = canUserPerform(currentUser, 'view_official_audit');
  const canViewAuditLogs = canUserPerform(currentUser, 'view_audit_logs');
  const canApproveDailyClosing = canUserPerform(currentUser, 'approve_daily_closing');
  const canManageBackups = canUserPerform(currentUser, 'manage_backups');
  const canManageStaff = canUserPerform(currentUser, 'manage_staff');
  const canImportDrugMasterFromSourceUrl = /\.(csv|zip)(?:$|\?)/i.test(drugMasterSourceUrl.trim());
  const officialAuditSummary = getOfficialAuditSummary();
  const officialAuditBlockers = getOfficialAuditBlockers();
  const dispensingUkeOfficialAllFieldsGate = buildDispensingUkeOfficialAllFieldDefinitionGate();
  const dispensingUkeOfficialAllFieldsGateLabel = formatDispensingUkeOfficialAllFieldDefinitionGate(dispensingUkeOfficialAllFieldsGate);
  const normalizedMedicationInfoTemplateSearch = medicationInfoTemplateSearch.trim().toLowerCase();
  const medicationInfoTemplateReadinessIssuesById = new Map(
    medicationInfoTemplates.map((template) => [
      template.templateId,
      getPatientMedicationInfoApprovalReadinessIssues(template)
    ] as const)
  );
  const getMedicationInfoTemplateReadinessIssues = (template: PatientMedicationInfoTemplate) => (
    medicationInfoTemplateReadinessIssuesById.get(template.templateId) || []
  );
  const filteredMedicationInfoTemplates = medicationInfoTemplates.filter((template) => {
    if (medicationInfoTemplateStatusFilter !== 'all' && template.status !== medicationInfoTemplateStatusFilter) {
      return false;
    }
    const readinessIssues = getMedicationInfoTemplateReadinessIssues(template);
    if (medicationInfoTemplateReadinessFilter === 'ready' && readinessIssues.length > 0) {
      return false;
    }
    if (medicationInfoTemplateReadinessFilter === 'missing' && readinessIssues.length === 0) {
      return false;
    }
    if (!normalizedMedicationInfoTemplateSearch) return true;
    const haystack = [
      template.drugCode,
      template.drugName,
      template.genericName || '',
      template.status,
      MEDICATION_INFO_TEMPLATE_STATUS_LABELS[template.status],
      readinessIssues.length === 0 ? '承認準備OK' : '不足あり',
      template.sourceUrl || ''
    ].join(' ').toLowerCase();
    return haystack.includes(normalizedMedicationInfoTemplateSearch);
  });
  const medicationInfoTemplateStatusCounts = medicationInfoTemplates.reduce<Record<PatientMedicationInfoTemplateStatus, number>>((counts, template) => {
    counts[template.status] += 1;
    return counts;
  }, {
    draft: 0,
    approved: 0,
    needs_review: 0,
    retired: 0
  });
  const medicationInfoTemplateReadinessCounts = medicationInfoTemplates.reduce<Record<MedicationInfoTemplateReadinessFilter, number>>((counts, template) => {
    counts.all += 1;
    if (getMedicationInfoTemplateReadinessIssues(template).length === 0) {
      counts.ready += 1;
    } else {
      counts.missing += 1;
    }
    return counts;
  }, {
    all: 0,
    ready: 0,
    missing: 0
  });
  const invalidApprovedMedicationInfoTemplates = medicationInfoTemplates.filter((template) => (
    template.status === 'approved' && !isApprovedPatientMedicationInfoTemplate(template)
  ));
  const selectedMedicationInfoTemplate = selectedMedicationInfoTemplateId
    ? medicationInfoTemplates.find((template) => template.templateId === selectedMedicationInfoTemplateId)
    : undefined;

  const [useEncryption, setUseEncryption] = useState(true);
  const [exportPassword, setExportPassword] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);

  const [importPassword, setImportPassword] = useState('');
  const [showImportPasswordInput, setShowImportPasswordInput] = useState(false);
  const [pendingEncryptedPayload, setPendingEncryptedPayload] = useState<any>(null);

  const [pendingBackupPayload, setPendingBackupPayload] = useState<YakurekiBackup | null>(null);
  const [backupRestoreSourceName, setBackupRestoreSourceName] = useState('バックアップファイル');
  const [backupRestoreSourceEncrypted, setBackupRestoreSourceEncrypted] = useState(false);
  const [backupDiffs, setBackupDiffs] = useState<CollectionDiff[] | null>(null);
  const [backupDrillReport, setBackupDrillReport] = useState<BackupRestoreDrillReport | null>(null);
  const [isAnalyzingDiff, setIsAnalyzingDiff] = useState(false);
  const [externalBackupFileName, setExternalBackupFileName] = useState('');
  const [externalBackupDestinationName, setExternalBackupDestinationName] = useState('');
  const [externalBackupDestinationPath, setExternalBackupDestinationPath] = useState('');
  const [externalBackupVerifierName, setExternalBackupVerifierName] = useState('');
  const [externalBackupNotes, setExternalBackupNotes] = useState('');
  const [externalBackupReadBackVerified, setExternalBackupReadBackVerified] = useState(false);
  const [externalBackupImmutableVerified, setExternalBackupImmutableVerified] = useState(false);
  const [exportBackupExternalTransferManifest, setExportBackupExternalTransferManifest] = useState(false);
  const [externalBackupRetentionDays, setExternalBackupRetentionDays] = useState(30);
  const [externalBackupReceiptFile, setExternalBackupReceiptFile] = useState<File | null>(null);
  const [isRecordingExternalBackupStorage, setIsRecordingExternalBackupStorage] = useState(false);
  const [isRecordingExternalBackupReceipt, setIsRecordingExternalBackupReceipt] = useState(false);
  const [backupSchedulePolicy, setBackupSchedulePolicy] = useState<BackupSchedulePolicy>(DEFAULT_BACKUP_SCHEDULE_POLICY);
  // 患者重複点検(名寄せ): スキャン結果、グループごとの残す患者、統合レビュー
  const [patientDuplicateReport, setPatientDuplicateReport] = useState<PatientDuplicateScanReport | null>(null);
  const [isScanningPatientDuplicates, setIsScanningPatientDuplicates] = useState(false);
  const [patientDuplicateMessage, setPatientDuplicateMessage] = useState('');
  const [duplicateMergeTargets, setDuplicateMergeTargets] = useState<Record<string, string>>({});
  const [duplicateMergeReview, setDuplicateMergeReview] = useState<{
    groupId: string;
    sourcePatientId: string;
    plan: PatientMergePlan;
    executionPlan: PatientMergeExecutionPlan;
  } | null>(null);
  const [isApplyingDuplicateMerge, setIsApplyingDuplicateMerge] = useState(false);
  // 薬品重複点検(マスタ統合): スキャン結果、グループごとの残す薬品、統合レビュー
  const [drugDuplicateReport, setDrugDuplicateReport] = useState<DrugDuplicateScanReport | null>(null);
  const [isScanningDrugDuplicates, setIsScanningDrugDuplicates] = useState(false);
  const [drugDuplicateMessage, setDrugDuplicateMessage] = useState('');
  const [drugMergeTargets, setDrugMergeTargets] = useState<Record<string, string>>({});
  const [drugMergeReview, setDrugMergeReview] = useState<{
    groupId: string;
    sourceCode: string;
    plan: DrugMergePlan;
    executionPlan: DrugMergeExecutionPlan;
  } | null>(null);
  const [isApplyingDrugMerge, setIsApplyingDrugMerge] = useState(false);
  const [isSavingBackupSchedule, setIsSavingBackupSchedule] = useState(false);

  // --- Staff Management State ---
  const [staffList, setStaffList] = useState<User[]>([]);
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'pharmacist' | 'clerk' | 'admin'>('pharmacist');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false);
  const [isOnboardingStaffSetup, setIsOnboardingStaffSetup] = useState(false);
  const [rolePermissionPolicy, setRolePermissionPolicy] = useState<RolePermissionPolicy>(DEFAULT_ROLE_PERMISSION_POLICY);
  const [isSavingRolePermissionPolicy, setIsSavingRolePermissionPolicy] = useState(false);
  const [staffRecoveryReason, setStaffRecoveryReason] = useState<StaffRecoveryReason>('passkey_lost');
  const [staffRecoveryTargetUserId, setStaffRecoveryTargetUserId] = useState('');
  const [staffRecoveryPassword, setStaffRecoveryPassword] = useState('');
  const [staffRecoveryNote, setStaffRecoveryNote] = useState('');
  const [isHandlingStaffRecovery, setIsHandlingStaffRecovery] = useState(false);
  const currentStaffRecord = staffList.find((staff) => staff.userId === currentUser.userId);
  const staffRecoveryTarget = staffList.find((staff) => staff.userId === staffRecoveryTargetUserId) || null;
  const staffRecoveryChecklist = buildStaffRecoveryChecklist({
    reason: staffRecoveryReason,
    targetStaff: staffRecoveryTarget,
    staff: staffList,
    auditLogs
  });
  const credentialedAdminCount = staffList.filter((staff) => staff.role === 'admin' && hasLoginCredential(staff)).length;
  const shouldPromptCurrentStaffPasskey = isOnboardingStaffSetup
    && !!currentStaffRecord
    && !currentStaffRecord.passkeyCredentialId;

  const refreshExternalConnectorReadiness = useCallback(async () => {
    setIsLoadingExternalConnectorReadiness(true);
    try {
      const response = await fetch('/api/system/connector-readiness');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setExternalConnectorReadiness(await response.json());
    } catch (error) {
      console.error('Failed to load external connector readiness:', error);
      setExternalConnectorReadiness(null);
      toast.error('外部連携の接続準備を確認できませんでした。');
    } finally {
      setIsLoadingExternalConnectorReadiness(false);
    }
  }, []);

  const refreshMedicationInfoTemplates = useCallback(async () => {
    if (!db) {
      setMedicationInfoTemplates([]);
      return [];
    }

    setIsLoadingMedicationInfoTemplates(true);
    try {
      const docs = await db.patient_medication_info_templates.find().exec();
      const templates = sortMedicationInfoTemplates(
        docs.map((doc) => doc.toJSON() as PatientMedicationInfoTemplate)
      );
      setMedicationInfoTemplates(templates);
      return templates;
    } catch (error) {
      console.error('Failed to load patient medication info templates:', error);
      toast.error('薬情テンプレを読み込めませんでした。');
      return [];
    } finally {
      setIsLoadingMedicationInfoTemplates(false);
    }
  }, [db]);

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  useEffect(() => {
    setBackupSchedulePolicy(readBackupSchedulePolicy());
  }, []);

  useEffect(() => {
    setRolePermissionPolicy(readRolePermissionPolicy());
  }, []);

  useEffect(() => {
    if (staffRecoveryTargetUserId || staffList.length === 0) return;
    const currentStaff = staffList.find((staff) => staff.userId === currentUser.userId);
    setStaffRecoveryTargetUserId((currentStaff || staffList[0]).userId);
  }, [currentUser.userId, staffList, staffRecoveryTargetUserId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'facility' || tab === 'external' || tab === 'master' || tab === 'medicationInfo' || tab === 'backup' || tab === 'officialAudit' || tab === 'audit' || tab === 'staff' || tab === 'terminalSync') {
      setActiveTab(tab);
    }
    if (params.get('onboarding') === '1') {
      setActiveTab('staff');
      setIsOnboardingStaffSetup(true);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'external' || !canManageFacility) return;
    void refreshExternalConnectorReadiness();
  }, [activeTab, canManageFacility, refreshExternalConnectorReadiness]);

  useEffect(() => {
    if (!canManageFacility) {
      setMedicationInfoTemplates([]);
      setIsLoadingMedicationInfoTemplates(false);
      return;
    }
    void refreshMedicationInfoTemplates();
  }, [canManageFacility, refreshMedicationInfoTemplates]);

  const tabButtonStyle = (isActive: boolean) => ({
    flex: '0 0 auto',
    minHeight: '44px',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '0.4rem',
    padding: '0.55rem 0.9rem',
    background: isActive ? 'var(--primary)' : 'white',
    color: isActive ? 'white' : 'var(--text-main)',
    border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
    borderRadius: '8px',
    fontWeight: 600,
    fontSize: '0.86rem',
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    outline: 'none'
  });

  const auditStatusLabel = (status: OfficialAuditStatus) => {
    switch (status) {
      case 'verified':
        return '点検済み';
      case 'implemented':
        return '実装済み';
      case 'partial':
        return '部分対応';
      case 'open':
        return '未対応';
      default:
        return status;
    }
  };

  const auditStatusStyle = (status: OfficialAuditStatus) => {
    const styles = {
      verified: { background: '#dcfce7', color: '#166534', border: '#86efac' },
      implemented: { background: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
      partial: { background: '#fef3c7', color: '#92400e', border: '#fcd34d' },
      open: { background: '#fee2e2', color: '#991b1b', border: '#fca5a5' }
    }[status];

    return {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: '999px',
      border: `1px solid ${styles.border}`,
      padding: '0.15rem 0.55rem',
      fontSize: '0.76rem',
      fontWeight: 700,
      background: styles.background,
      color: styles.color,
      whiteSpace: 'nowrap' as const
    };
  };

  const auditPriorityStyle = (priority: 'critical' | 'high' | 'medium') => {
    const styles = {
      critical: { label: '最重要', color: '#b91c1c', background: '#fef2f2' },
      high: { label: '高', color: '#b45309', background: '#fffbeb' },
      medium: { label: '中', color: '#475569', background: '#f8fafc' }
    }[priority];

    return {
      ...styles,
      style: {
        display: 'inline-flex',
        borderRadius: '6px',
        padding: '0.12rem 0.45rem',
        fontSize: '0.72rem',
        fontWeight: 700,
        color: styles.color,
        background: styles.background,
        border: '1px solid rgba(148, 163, 184, 0.35)'
      }
    };
  };

  const backupDrillStatusStyle = (status: BackupRestoreDrillReport['status']) => {
    const styles = {
      pass: { color: '#15803d', background: '#f0fdf4', border: '#86efac' },
      attention: { color: '#b45309', background: '#fffbeb', border: '#fcd34d' },
      blocked: { color: '#b91c1c', background: '#fef2f2', border: '#fca5a5' }
    }[status];

    return {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: '999px',
      border: `1px solid ${styles.border}`,
      padding: '0.16rem 0.6rem',
      fontSize: '0.76rem',
      fontWeight: 800,
      color: styles.color,
      background: styles.background,
      whiteSpace: 'nowrap' as const
    };
  };

  const staffRecoveryStatusStyle = (status: StaffRecoveryStepStatus) => {
    const styles = {
      complete: { color: '#15803d', background: '#f0fdf4', border: '#86efac' },
      attention: { color: '#b45309', background: '#fffbeb', border: '#fcd34d' },
      blocked: { color: '#b91c1c', background: '#fef2f2', border: '#fca5a5' }
    }[status];

    return {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: '999px',
      border: `1px solid ${styles.border}`,
      padding: '0.14rem 0.55rem',
      fontSize: '0.74rem',
      fontWeight: 800,
      color: styles.color,
      background: styles.background,
      whiteSpace: 'nowrap' as const
    };
  };

  const initialSetupStatusStyle = (status: InitialSetupStep['status']) => {
    const styles = {
      complete: { color: '#15803d', background: '#f0fdf4', border: '#86efac' },
      attention: { color: '#b45309', background: '#fffbeb', border: '#fcd34d' },
      blocked: { color: '#b91c1c', background: '#fef2f2', border: '#fca5a5' }
    }[status];

    return {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: '999px',
      border: `1px solid ${styles.border}`,
      padding: '0.16rem 0.6rem',
      fontSize: '0.74rem',
      fontWeight: 800,
      color: styles.color,
      background: styles.background,
      whiteSpace: 'nowrap' as const
    };
  };

  const auditActionLabel = (actionType: AuditLog['actionType']) => {
    const labels: Record<AuditLog['actionType'], string> = {
      login: 'ログイン',
      prescription_ocr: '処方箋OCR読込',
      prescription_edit: '薬歴完了・変更',
      billing_toggle: '点数算定切替',
      claim_lifecycle: '請求状態変更',
      daily_closing_approval: '日次締め承認',
      daily_closing_kpi_action: 'KPI改善アクション',
      session_lock: 'セッションロック',
      print: '印刷実行',
      uke_export: 'レセプト出力',
      stock_update: '在庫更新',
      user_switch: '操作者切替',
      facility_settings_update: '施設基準設定変更',
      drug_master_update: '医薬品マスタ更新',
      patient_medication_info_template: '薬情テンプレ承認',
      follow_up_record: '服薬フォロー記録',
      ai_suggestion_review: 'AI補助提案確認',
      electronic_prescription: '電子処方箋受付',
      external_device_handoff: '調剤機器連携',
      staff_create: 'スタッフ追加',
      staff_delete: 'スタッフ削除',
      staff_credential_recovery: 'スタッフ認証復旧',
      passkey_register: 'パスキー登録',
      audit_export: '監査ログ書出',
      audit_retention_approval: '監査ログ保全確認',
      backup_export: 'バックアップ書出',
      backup_schedule_update: 'バックアップ予定変更',
      backup_external_storage: '外部保存確認',
      backup_external_transfer_manifest: '外部保存連携JSON',
      backup_drill: '復旧テスト',
      backup_import: 'バックアップ復旧',
      official_spec_review: '公式仕様点検'
    };
    return labels[actionType] || actionType;
  };

  const ensurePermission = (action: PermissionAction) => {
    if (canUserPerform(getCurrentUser(), action)) return true;
    toast.error(getPermissionDeniedMessage(getCurrentUser(), action));
    return false;
  };

  const openTab = (tab: SettingsTab, action: PermissionAction) => {
    if (ensurePermission(action)) {
      setActiveTab(tab);
    }
  };

  const handleOpenInitialSetupStep = (step: InitialSetupStep) => {
    openTab(step.tab, INITIAL_SETUP_TAB_PERMISSIONS[step.tab]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const applyDrugMasterCandidatesFromHtml = (html: string, emptyMessage: string, successPrefix: string) => {
    const trimmedHtml = html.trim();
    if (!trimmedHtml) {
      setDrugMasterCandidates([]);
      setDrugMasterCandidateMessage(emptyMessage);
      return [];
    }

    const candidates = extractSskDrugMasterDownloadCandidates(trimmedHtml);
    setDrugMasterCandidates(candidates);
    setDrugMasterCandidateMessage(
      candidates.length > 0
        ? `${successPrefix}更新候補 ${candidates.length}件を抽出しました。`
        : '更新候補を抽出できませんでした。掲載ページHTMLを確認してください。'
    );
    return candidates;
  };

  const handleExtractDrugMasterCandidates = () => {
    applyDrugMasterCandidatesFromHtml(
      drugMasterOfficialPageHtml,
      '支払基金ページHTMLを貼り付けてください。',
      ''
    );
  };

  const handleFetchDrugMasterOfficialPage = async () => {
    setIsFetchingDrugMasterOfficialPage(true);
    setDrugMasterCandidateMessage('支払基金の公式ページを取得しています。');
    try {
      const response = await fetch('/api/drug-master/official-page', { method: 'GET' });
      const payload = await response.json().catch(() => ({})) as Partial<DrugMasterOfficialPageFetchResult> & { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || '公式ページを取得できませんでした。');
      }

      const html = String(payload.html || '');
      const candidates = Array.isArray(payload.candidates)
        ? payload.candidates as DrugMasterOfficialDownloadCandidate[]
        : extractSskDrugMasterDownloadCandidates(html);
      setDrugMasterOfficialPageHtml(html);
      setDrugMasterCandidates(candidates);
      setDrugMasterCandidateMessage(
        candidates.length > 0
          ? `公式ページを取得し、更新候補 ${candidates.length}件を抽出しました。`
          : '公式ページを取得しましたが、更新候補を抽出できませんでした。'
      );
      toast.success('公式ページを取得しました。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '公式ページを取得できませんでした。';
      setDrugMasterCandidateMessage(message);
      toast.error(message);
    } finally {
      setIsFetchingDrugMasterOfficialPage(false);
    }
  };

  const handleReviewDrugMasterSpecPdfText = () => {
    const trimmedText = drugMasterSpecPdfText.trim();
    if (!trimmedText) {
      setDrugMasterSpecPdfReview(null);
      setDrugMasterSpecPdfReviewLabel('仕様PDF本文を貼り付けてください。');
      toast.error('仕様PDF本文を貼り付けてください。');
      return;
    }

    const review = buildDrugMasterSpecificationPdfDiffReview(trimmedText);
    const label = formatDrugMasterSpecificationPdfDiffReview(review);
    setDrugMasterSpecPdfReview(review);
    setDrugMasterSpecPdfReviewLabel(label);
    if (review.ok) {
      toast.success('仕様PDF本文の42項目と現在の列定義が一致しました。');
    } else {
      toast.warning('仕様PDF本文と現在の列定義に確認事項があります。');
    }
  };

  const handleFetchDrugMasterSpecPdf = async () => {
    setIsFetchingDrugMasterSpecPdf(true);
    setDrugMasterSpecPdfReviewLabel('支払基金の仕様PDFを取得しています。');
    try {
      const response = await fetch(`/api/drug-master/official-spec-pdf?url=${encodeURIComponent(DRUG_MASTER_SPECIFICATION_SOURCE.url)}`, { method: 'GET' });
      const payload = await response.json().catch(() => ({})) as Partial<DrugMasterOfficialSpecPdfFetchResult> & { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || '仕様PDFを取得できませんでした。');
      }

      const text = String(payload.text || '');
      setDrugMasterSpecPdfText(text);
      if (payload.review && payload.reviewLabel) {
        setDrugMasterSpecPdfReview(payload.review);
        setDrugMasterSpecPdfReviewLabel(payload.reviewLabel);
        if (payload.review.ok) {
          toast.success('公式仕様PDFを取得し、42項目の一致を確認しました。');
        } else {
          toast.warning('公式仕様PDFを取得しました。差分候補を確認してください。');
        }
      } else {
        const review = buildDrugMasterSpecificationPdfDiffReview(text);
        const label = formatDrugMasterSpecificationPdfDiffReview(review);
        setDrugMasterSpecPdfReview(review);
        setDrugMasterSpecPdfReviewLabel(label);
        toast.success('公式仕様PDFを取得しました。');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '仕様PDFを取得できませんでした。';
      setDrugMasterSpecPdfReviewLabel(message);
      toast.error(message);
    } finally {
      setIsFetchingDrugMasterSpecPdf(false);
    }
  };

  const applyDispensingUkeSpecPdfReview = (text: string) => {
    const parseResult = parseDispensingUkeSpecificationPdfText(text);
    const definitionReview = buildDispensingUkeSpecificationPdfFieldDefinitionReview(parseResult);
    const gate = buildDispensingUkeSpecificationPdfAllFieldCompletionGate(parseResult, definitionReview);
    setDispensingUkeSpecCompletionGate(gate);
    setDispensingUkeSpecCompletionLabel(formatDispensingUkeSpecificationPdfAllFieldCompletionGate(gate));
    return gate;
  };

  const recordDispensingUkeSpecReview = async (
    gate: DispensingUkeSpecificationPdfAllFieldCompletionGate,
    sourceLabel: string
  ) => {
    if (!db) return;
    await logAuditAction(
      db,
      'official_spec_review',
      `UKE仕様PDF全項目突合: ${sourceLabel} / 判定 ${gate.statusLabel} / レコード ${gate.parsedRecordTypeCount}/${gate.expectedRecordTypeCount} / 抽出 ${gate.parsedFieldCount}項目 / 定義済み ${gate.definedFieldCount}項目 / 残 ${gate.remainingFieldCount}項目 / 停止理由 ${gate.blockerCount}件`
    );
  };

  const handleReviewDispensingUkeSpecPdfText = async () => {
    if (!ensurePermission('view_official_audit')) return;
    const trimmedText = dispensingUkeSpecPdfText.trim();
    if (!trimmedText) {
      setDispensingUkeSpecCompletionGate(null);
      setDispensingUkeSpecCompletionLabel('仕様PDF本文を貼り付けてください。');
      toast.error('仕様PDF本文を貼り付けてください。');
      return;
    }

    const gate = applyDispensingUkeSpecPdfReview(trimmedText);
    await recordDispensingUkeSpecReview(gate, '貼り付け本文');
    if (gate.ok) {
      toast.success('UKE仕様PDFの全項目確認が完了しました。');
    } else {
      toast.warning(`UKE仕様PDFに残作業が${gate.blockerCount}件あります。`);
    }
  };

  const handleFetchDispensingUkeSpecPdf = async () => {
    if (!ensurePermission('view_official_audit')) return;
    setIsFetchingDispensingUkeSpecPdf(true);
    setDispensingUkeSpecCompletionLabel('厚労省の調剤UKE仕様PDFを取得しています。');
    try {
      const response = await fetch(
        `/api/receipt/official-spec-pdf?url=${encodeURIComponent(DISPENSING_UKE_RECORD_SPEC_SOURCE.url)}`,
        { method: 'GET' }
      );
      const payload = await response.json().catch(() => ({})) as Partial<DispensingUkeOfficialSpecPdfFetchResult> & { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || '調剤UKE仕様PDFを取得できませんでした。');
      }

      const text = String(payload.text || '');
      setDispensingUkeSpecPdfText(text);
      const gate = payload.completionGate ?? applyDispensingUkeSpecPdfReview(text);
      setDispensingUkeSpecCompletionGate(gate);
      setDispensingUkeSpecCompletionLabel(
        payload.completionGateLabel || formatDispensingUkeSpecificationPdfAllFieldCompletionGate(gate)
      );
      await recordDispensingUkeSpecReview(gate, `公式PDF ${payload.fileName || DISPENSING_UKE_RECORD_SPEC_SOURCE.fileName || 'iryokikan_in_07.pdf'}`);
      if (gate.ok) {
        toast.success('公式PDFを取得し、UKE全項目の一致を確認しました。');
      } else {
        toast.warning('公式PDFを取得しました。残作業を確認してください。');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '調剤UKE仕様PDFを取得できませんでした。';
      setDispensingUkeSpecCompletionLabel(message);
      toast.error(message);
    } finally {
      setIsFetchingDispensingUkeSpecPdf(false);
    }
  };

  const handleSelectDrugMasterCandidate = (candidate: DrugMasterOfficialDownloadCandidate) => {
    setDrugMasterSourceUrl(candidate.url);
    setDrugMasterCandidateMessage(`${drugMasterCandidateKindLabel[candidate.kind]}候補を更新元URLへ反映しました。`);
    toast.success('更新元URLへ反映しました。');
  };

  const handleDrugMasterRollbackFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setRollbackFile(e.target.files[0]);
    }
  };

  const handleBackupFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setBackupFile(e.target.files[0]);
      setBackupRestoreSourceName(e.target.files[0].name);
      setPendingBackupPayload(null);
      setBackupDiffs(null);
      setBackupDrillReport(null);
      setMigrationCsvPreview(null);
      setBackupRestoreSourceEncrypted(false);
    }
  };

  const handleExternalBackupReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setExternalBackupReceiptFile(e.target.files[0]);
    }
  };

  const handleMigrationCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setMigrationCsvFile(e.target.files[0]);
      setMigrationCsvPreview(null);
    }
  };

  const handleMigrationCsvKindChange = (kind: 'patients' | 'visits' | 'drug_stocks' | 'soap_records') => {
    setMigrationCsvKind(kind);
    setMigrationCsvPreview(null);
    setMigrationCsvFile(null);
  };

  const downloadTextFile = (fileName: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportDispensingUkeSpecReviewCsv = async () => {
    if (!ensurePermission('view_official_audit')) return;
    if (!dispensingUkeSpecCompletionGate) {
      toast.info('先にUKE仕様PDFの全項目確認を実行してください。');
      return;
    }

    setIsExportingDispensingUkeSpecReview(true);
    try {
      const fileName = makeDispensingUkeSpecReviewCsvFileName();
      const csv = buildDispensingUkeSpecificationPdfAllFieldCompletionGateCsv(dispensingUkeSpecCompletionGate);
      downloadTextFile(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8');
      if (db) {
        await logAuditAction(
          db,
          'official_spec_review',
          `UKE仕様PDF全項目突合CSV書出: ${fileName} / 判定 ${dispensingUkeSpecCompletionGate.statusLabel} / 残 ${dispensingUkeSpecCompletionGate.remainingFieldCount}項目 / 停止理由 ${dispensingUkeSpecCompletionGate.blockerCount}件`
        );
      }
      toast.success('UKE仕様PDFの確認結果CSVを書き出しました。');
    } finally {
      setIsExportingDispensingUkeSpecReview(false);
    }
  };

  const handleExportDispensingUkeOfficialAllFieldsGateCsv = async () => {
    if (!ensurePermission('view_official_audit')) return;

    setIsExportingDispensingUkeOfficialAllFieldsGate(true);
    try {
      const fileName = makeDispensingUkeOfficialAllFieldsGateCsvFileName();
      const csv = buildDispensingUkeOfficialAllFieldDefinitionGateCsv(dispensingUkeOfficialAllFieldsGate);
      downloadTextFile(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8');
      if (db) {
        await logAuditAction(
          db,
          'official_spec_review',
          `公式提出UKE allFields完了ゲートCSV書出: ${fileName} / 判定 ${dispensingUkeOfficialAllFieldsGate.statusLabel} / レコード ${dispensingUkeOfficialAllFieldsGate.completedRecordTypeCount}/${dispensingUkeOfficialAllFieldsGate.expectedRecordTypes.length} / 定義 ${dispensingUkeOfficialAllFieldsGate.definedFieldCount}/${dispensingUkeOfficialAllFieldsGate.expectedFieldCount} / 指摘 ${dispensingUkeOfficialAllFieldsGate.issueCount}件`
        );
      }
      toast.success('公式提出UKE allFields完了ゲートCSVを書き出しました。');
    } finally {
      setIsExportingDispensingUkeOfficialAllFieldsGate(false);
    }
  };

  const handleExportDispensingUkeSpecImplementationPack = async () => {
    if (!ensurePermission('view_official_audit')) return;
    const trimmedText = dispensingUkeSpecPdfText.trim();
    if (!trimmedText) {
      toast.info('先にPDFから取り出した文字を貼り付けて確認してください。');
      return;
    }

    setIsExportingDispensingUkeSpecImplementationPack(true);
    try {
      const confirmations = parseDispensingUkeSpecConfirmationText(dispensingUkeSpecConfirmationText);
      const pack = buildDispensingUkeSpecificationPdfAllFieldImplementationPack(trimmedText, confirmations);
      setDispensingUkeSpecCompletionGate(pack.completionGate);
      setDispensingUkeSpecCompletionLabel(formatDispensingUkeSpecificationPdfAllFieldCompletionGate(pack.completionGate));

      const fileName = makeDispensingUkeSpecImplementationPackFileName();
      downloadTextFile(
        fileName,
        buildDispensingUkeSpecificationPdfAllFieldImplementationPackText(pack),
        'text/plain;charset=utf-8'
      );
      if (db) {
        await logAuditAction(
          db,
          'official_spec_review',
          `UKE仕様PDF実装パック書出: ${fileName} / 判定 ${pack.completionGate.statusLabel} / 実装タスク ${pack.implementationPlan.taskCount}件 / 定義追加準備 ${pack.progressReview.readyToDefineCount}件 / 追加候補 ${pack.candidateReport.candidateCount}件 / 残 ${pack.remainingActionReport.remainingFieldCount}項目`
        );
      }
      toast.success('UKE仕様PDFの実装パックを書き出しました。');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UKE仕様PDFの実装パックを書き出せませんでした。';
      toast.error(message);
    } finally {
      setIsExportingDispensingUkeSpecImplementationPack(false);
    }
  };

  const handleExportBackup = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    if (useEncryption && !exportPassword.trim()) {
      toast.error('暗号化用パスワードを入力してください。');
      return;
    }

    if (!useEncryption) {
      const confirmed = window.confirm(
        'バックアップには患者情報、薬歴、スタッフ情報、監査ログが含まれます。\n\n' +
        '暗号化せずに平文JSONとして書き出しますか？'
      );
      if (!confirmed) {
        return;
      }
    }

    setIsExportingBackup(true);
    try {
      const backup = await buildDatabaseBackup(db);
      const fileName = makeBackupFileName(new Date(backup.createdAt));
      let payloadToSave: any = backup;
      let auditDetail = `バックアップ書き出し: ${fileName} に ${countBackupRows(backup)}件のローカルデータを書き出しました。`;

      if (useEncryption) {
        payloadToSave = encryptBackupPayload(backup, exportPassword.trim());
        auditDetail += '（パスワード暗号化保護）';
      }

      const rowCount = countBackupRows(backup);
      const payloadContent = JSON.stringify(payloadToSave, null, 2);
      const manifestGeneratedAt = new Date();
      let externalTransferManifestFileName = '';
      let externalTransferManifestContent = '';
      let externalTransferManifestAuditDetail = '';

      if (exportBackupExternalTransferManifest) {
        const manifest = buildBackupExternalTransferManifest({
          fileName,
          fileContent: payloadContent,
          payload: payloadToSave,
          destinationName: externalBackupDestinationName,
          destinationPathOrUrl: externalBackupDestinationPath,
          retentionDays: externalBackupRetentionDays,
          generatedAt: manifestGeneratedAt,
          notes: externalBackupNotes
        });

        if (manifest.status === 'blocked') {
          toast.error(manifest.requiredActions[0] || '外部保存連携JSONの入力内容を確認してください。');
          return;
        }

        externalTransferManifestFileName = makeBackupExternalTransferManifestFileName(fileName, manifestGeneratedAt);
        externalTransferManifestContent = buildBackupExternalTransferManifestJson(manifest);
        externalTransferManifestAuditDetail = buildBackupExternalTransferManifestAuditDetail(
          manifest,
          externalTransferManifestFileName
        );
      }

      const auditOk = await logAuditAction(db, 'backup_export', auditDetail);
      if (!auditOk) {
        throw new Error('バックアップ書き出しの監査ログ記録に失敗しました。');
      }

      if (externalTransferManifestContent) {
        const manifestAuditOk = await logAuditAction(
          db,
          'backup_external_transfer_manifest',
          externalTransferManifestAuditDetail
        );
        if (!manifestAuditOk) {
          throw new Error('外部保存連携JSONの監査ログ記録に失敗しました。');
        }
      }

      const blob = new Blob([payloadContent], {
        type: 'application/json;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      if (externalTransferManifestContent) {
        downloadTextFile(
          externalTransferManifestFileName,
          externalTransferManifestContent,
          'application/json;charset=utf-8'
        );
      }

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      setExternalBackupFileName(fileName);
      setExternalBackupReadBackVerified(false);
      setExternalBackupImmutableVerified(false);
      toast.success(`バックアップを書き出しました（${rowCount}件）。${useEncryption ? '暗号化済み。' : ''}${externalTransferManifestContent ? '外部保存連携JSONも出力しました。' : ''}`);
      setExportPassword('');
    } catch (error: any) {
      console.error('Failed to export backup:', error);
      toast.error(`バックアップの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleRecordBackupExternalStorage = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    const latestReview = buildBackupGenerationReview(auditLogs);
    const evidence = buildBackupExternalStorageEvidence({
      fileName: externalBackupFileName || latestReview.latestBackup?.fileName || '',
      destinationName: externalBackupDestinationName,
      destinationPathOrUrl: externalBackupDestinationPath,
      verifierName: externalBackupVerifierName,
      readBackVerified: externalBackupReadBackVerified,
      immutableStorageVerified: externalBackupImmutableVerified,
      notes: externalBackupNotes
    });

    if (evidence.status === 'blocked') {
      toast.error(evidence.requiredActions[0] || '外部保存確認の入力内容を確認してください。');
      return;
    }

    setIsRecordingExternalBackupStorage(true);
    try {
      const auditOk = await logAuditAction(
        db,
        'backup_external_storage',
        buildBackupExternalStorageAuditDetail(evidence)
      );
      if (!auditOk) {
        throw new Error('外部保存確認の監査ログ記録に失敗しました。');
      }
      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      if (evidence.status === 'pass') {
        toast.success('バックアップの外部保存確認を監査ログに記録しました。');
      } else {
        toast.warning(`外部保存確認を記録しました（${evidence.statusLabel}）。`);
      }
    } catch (error: any) {
      console.error('Failed to record backup external storage:', error);
      toast.error(`外部保存確認の記録に失敗しました: ${error.message || error}`);
    } finally {
      setIsRecordingExternalBackupStorage(false);
    }
  };

  const handleRecordBackupExternalTransferReceipt = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    if (!externalBackupReceiptFile) {
      toast.error('外部保存ジョブ受領書JSONを選択してください。');
      return;
    }

    setIsRecordingExternalBackupReceipt(true);
    try {
      const parsed = JSON.parse(await externalBackupReceiptFile.text());
      const validation = validateBackupExternalTransferReceipt(parsed);
      if (!validation.ok) {
        toast.error(validation.reason);
        return;
      }

      const evidence = buildBackupExternalStorageEvidenceFromTransferReceipt(
        validation.receipt,
        currentUser.name || '外部保存ジョブ'
      );
      if (evidence.status === 'blocked') {
        toast.error(evidence.requiredActions[0] || '外部保存ジョブ受領書の内容を確認してください。');
        return;
      }

      const auditOk = await logAuditAction(
        db,
        'backup_external_storage',
        buildBackupExternalStorageAuditDetail(evidence)
      );
      if (!auditOk) {
        throw new Error('外部保存ジョブ受領書の監査ログ記録に失敗しました。');
      }

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      setExternalBackupFileName(evidence.fileName);
      setExternalBackupDestinationName(evidence.destinationName);
      setExternalBackupDestinationPath(evidence.destinationPathOrUrl);
      setExternalBackupVerifierName(evidence.verifierName);
      setExternalBackupReadBackVerified(evidence.readBackVerified);
      setExternalBackupImmutableVerified(evidence.immutableStorageVerified);
      setExternalBackupNotes(evidence.notes || '');
      setExternalBackupReceiptFile(null);

      if (evidence.status === 'pass') {
        toast.success('外部保存ジョブ受領書を監査ログに記録しました。');
      } else {
        toast.warning(`外部保存ジョブ受領書を記録しました（${evidence.statusLabel}）。`);
      }
    } catch (error: any) {
      console.error('Failed to record backup external transfer receipt:', error);
      toast.error(`外部保存ジョブ受領書の記録に失敗しました: ${error.message || error}`);
    } finally {
      setIsRecordingExternalBackupReceipt(false);
    }
  };

  const handleBackupSchedulePolicyChange = (patch: Partial<BackupSchedulePolicy>) => {
    setBackupSchedulePolicy((current) => ({
      ...current,
      ...patch
    }));
  };

  const handleSaveBackupSchedulePolicy = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsSavingBackupSchedule(true);
    try {
      const previousPolicy = readBackupSchedulePolicy();
      const normalizedPolicy = writeBackupSchedulePolicy(backupSchedulePolicy);
      setBackupSchedulePolicy(normalizedPolicy);

      const auditOk = await logAuditAction(
        db,
        'backup_schedule_update',
        buildBackupSchedulePolicyAuditDetail(normalizedPolicy)
      );
      if (!auditOk) {
        const restoredPolicy = writeBackupSchedulePolicy(previousPolicy);
        setBackupSchedulePolicy(restoredPolicy);
        throw new Error('閉店時バックアップ予定の監査ログ記録に失敗したため、変更を元に戻しました。');
      }

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));

      toast.success('閉店時バックアップ予定を保存しました。');
    } catch (error: any) {
      console.error('Failed to save backup schedule policy:', error);
      toast.error(`閉店時バックアップ予定の保存に失敗しました: ${error.message || error}`);
    } finally {
      setIsSavingBackupSchedule(false);
    }
  };

  // 患者マスタ全体から同姓同名・同カナ×同生年月日の重複候補を洗い出す
  const handleScanPatientDuplicates = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsScanningPatientDuplicates(true);
    setPatientDuplicateMessage('');
    setDuplicateMergeReview(null);
    try {
      const [patientDocs, visitDocs] = await Promise.all([
        db.patients.find().exec(),
        db.visits.find().exec()
      ]);
      const patients = patientDocs.map((doc) => doc.toJSON() as Patient);
      const visits = visitDocs.map((doc) => ({
        patientId: doc.get('patientId') as string,
        issueDate: doc.get('issueDate') as string
      }));
      const report = findDuplicatePatientGroups(patients, visits);
      setPatientDuplicateReport(report);
      setDuplicateMergeTargets(Object.fromEntries(
        report.groups.map((group) => [group.groupId, group.suggestedTargetPatientId])
      ));
      setPatientDuplicateMessage(report.groups.length === 0
        ? `重複候補はありません（対象 ${report.scannedPatientCount}名）。`
        : `重複候補 ${report.groups.length}グループ・${report.duplicatePatientCount}名が見つかりました。残す患者を選び、統合確認へ進んでください。`);
      await logAuditAction(db, 'prescription_edit', buildPatientDuplicateScanAuditDetail(report));
    } catch (error) {
      console.error('Failed to scan duplicate patients:', error);
      setPatientDuplicateReport(null);
      toast.error('患者重複点検に失敗しました。');
    } finally {
      setIsScanningPatientDuplicates(false);
    }
  };

  const openDuplicateMergeReview = async (group: PatientDuplicateGroup, sourcePatientId: string) => {
    if (!db) return;
    const targetPatientId = duplicateMergeTargets[group.groupId] || group.suggestedTargetPatientId;
    if (targetPatientId === sourcePatientId) {
      setPatientDuplicateMessage('残す患者と統合元が同じです。残す患者を選び直してください。');
      return;
    }

    try {
      const [targetDoc, sourceDoc, sourceVisitDocs, sourceAlertDocs] = await Promise.all([
        db.patients.findOne(targetPatientId).exec(),
        db.patients.findOne(sourcePatientId).exec(),
        db.visits.find({ selector: { patientId: sourcePatientId } }).exec(),
        db.alerts.find({ selector: { patientId: sourcePatientId } }).exec()
      ]);
      if (!targetDoc || !sourceDoc) {
        setPatientDuplicateMessage('対象患者を読み込めませんでした。もう一度「重複候補を確認」を実行してください。');
        return;
      }
      const plan = buildPatientMergePlan({
        targetPatient: targetDoc.toJSON() as Patient,
        sourcePatient: sourceDoc.toJSON() as Patient,
        sourceVisits: sourceVisitDocs.map((visitDoc) => ({ visitId: visitDoc.get('visitId') as string })),
        sourceAlerts: sourceAlertDocs.map((alertDoc) => ({ alertId: alertDoc.get('alertId') as string }))
      });
      setDuplicateMergeReview({
        groupId: group.groupId,
        sourcePatientId,
        plan,
        executionPlan: buildPatientMergeExecutionPlan(plan)
      });
      setPatientDuplicateMessage('');
    } catch (error) {
      console.error('Failed to build duplicate merge review:', error);
      setDuplicateMergeReview(null);
      setPatientDuplicateMessage('統合確認を作れませんでした。候補を選び直してください。');
    }
  };

  // 薬品マスタ全体からYJコード一致・薬品名一致の重複候補を洗い出す。
  // 店舗で使っている薬品(在庫・処方参照・棚番地あり)が絡むグループだけを表示する。
  const handleScanDrugDuplicates = async () => {
    if (!ensurePermission('update_drug_master')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsScanningDrugDuplicates(true);
    setDrugDuplicateMessage('');
    setDrugMergeReview(null);
    try {
      const [drugDocs, stockDocs, itemDocs] = await Promise.all([
        db.drugs.find().exec(),
        db.drug_stocks.find().exec(),
        db.prescription_items.find().exec()
      ]);
      // 医薬品マスタは約2万件のため、判定に使う項目だけ取り出す
      const drugs = drugDocs.map((doc) => ({
        code: doc.get('code') as string,
        name: doc.get('name') as string,
        yjCode: doc.get('yjCode') as string | undefined,
        isGeneric: !!doc.get('isGeneric'),
        genericName: doc.get('genericName') as string | undefined,
        isAbolished: doc.get('isAbolished') as boolean | undefined,
        price: doc.get('price') as number | undefined,
        stockQuantity: doc.get('stockQuantity') as number | undefined,
        location: doc.get('location') as string | undefined
      } as Drug));
      const usage = buildDrugUsageStats({
        stocks: stockDocs.map((doc) => ({ drugCode: doc.get('drugCode') as string })),
        prescriptionItems: itemDocs.map((doc) => ({
          drugId: doc.get('drugId') as string,
          dispensedDrugCode: doc.get('dispensedDrugCode') as string | undefined
        }))
      });
      const report = findDuplicateDrugGroups(drugs, usage);
      setDrugDuplicateReport(report);
      setDrugMergeTargets(Object.fromEntries(
        report.groups.map((group) => [group.groupId, group.suggestedTargetCode])
      ));
      setDrugDuplicateMessage(report.groups.length === 0
        ? `統合が必要な重複候補はありません（対象 ${report.scannedDrugCount.toLocaleString('ja-JP')}件。店舗未使用のマスタ由来重複 ${report.inactiveGroupCount}グループは対象外）。`
        : `統合候補 ${report.groups.length}グループ・${report.duplicateDrugCount}件が見つかりました。残す薬品を選び、統合確認へ進んでください。`);
      await logAuditAction(db, 'drug_master_update', buildDrugDuplicateScanAuditDetail(report));
    } catch (error) {
      console.error('Failed to scan duplicate drugs:', error);
      setDrugDuplicateReport(null);
      toast.error('薬品重複点検に失敗しました。');
    } finally {
      setIsScanningDrugDuplicates(false);
    }
  };

  const openDrugMergeReview = async (group: DrugDuplicateGroup, sourceCode: string) => {
    if (!db) return;
    const targetCode = drugMergeTargets[group.groupId] || group.suggestedTargetCode;
    if (targetCode === sourceCode) {
      setDrugDuplicateMessage('残す薬品と統合元が同じです。残す薬品を選び直してください。');
      return;
    }

    try {
      const [targetDoc, sourceDoc, prescribedItemDocs, dispensedItemDocs, sourceStockDocs, templateDocs, guidanceDocs] = await Promise.all([
        db.drugs.findOne(targetCode).exec(),
        db.drugs.findOne(sourceCode).exec(),
        db.prescription_items.find({ selector: { drugId: sourceCode } }).exec(),
        db.prescription_items.find({ selector: { dispensedDrugCode: sourceCode } }).exec(),
        db.drug_stocks.find({ selector: { drugCode: sourceCode } }).exec(),
        db.patient_medication_info_templates.find({ selector: { drugCode: sourceCode } }).exec(),
        db.medication_guidances.find({ selector: { drugCode: sourceCode } }).exec()
      ]);
      if (!targetDoc || !sourceDoc) {
        setDrugDuplicateMessage('対象薬品を読み込めませんでした。もう一度「重複候補を確認」を実行してください。');
        return;
      }
      const sourceItemRefs: DrugMergeItemRef[] = [
        ...prescribedItemDocs.map((doc) => ({ itemId: doc.get('itemId') as string, field: 'drugId' as const })),
        ...dispensedItemDocs.map((doc) => ({ itemId: doc.get('itemId') as string, field: 'dispensedDrugCode' as const }))
      ];
      const plan = buildDrugMergePlan({
        targetDrug: targetDoc.toJSON() as Drug,
        sourceDrug: sourceDoc.toJSON() as Drug,
        sourceItemRefs,
        sourceStockIds: sourceStockDocs.map((doc) => doc.get('id') as string),
        sourceTemplateCount: templateDocs.length,
        sourceGuidanceCount: guidanceDocs.length
      });
      setDrugMergeReview({
        groupId: group.groupId,
        sourceCode,
        plan,
        executionPlan: buildDrugMergeExecutionPlan(plan)
      });
      setDrugDuplicateMessage('');
    } catch (error) {
      console.error('Failed to build drug merge review:', error);
      setDrugMergeReview(null);
      setDrugDuplicateMessage('統合確認を作れませんでした。候補を選び直してください。');
    }
  };

  const handleApplyDrugMerge = async () => {
    if (!ensurePermission('update_drug_master')) return;
    if (!db || !drugMergeReview) return;
    const { plan, executionPlan } = drugMergeReview;
    if (!executionPlan.canApply) {
      setDrugDuplicateMessage('統合前の確認事項を見直してください。');
      return;
    }
    if (!window.confirm('統合元薬品を削除し、在庫ロットと処方参照を残す薬品へ付け替えます。実行しますか？')) {
      return;
    }

    const store = createRxdbDrugMergeExecutionStore(db);
    setIsApplyingDrugMerge(true);
    try {
      const result = await applyDrugMergeExecutionPlan(store, executionPlan);
      await logAuditAction(
        db,
        'drug_master_update',
        `薬品統合実行: ${plan.summary}。${result.auditDetail}`
      );
      setDrugMergeReview(null);
      toast.success('薬品統合を実行しました。');
      await handleScanDrugDuplicates();
    } catch (error) {
      console.error('Failed to apply drug merge:', error);
      if (error instanceof DrugMergeExecutionError && error.rollbackOperations.length > 0) {
        try {
          for (const operation of error.rollbackOperations) {
            await applyDrugMergeOperation(store, operation);
          }
          setDrugDuplicateMessage('薬品統合に失敗したため、適用済みの操作を取り消しました。候補を確認し直してください。');
        } catch (rollbackError) {
          console.error('Failed to rollback drug merge:', rollbackError);
          setDrugDuplicateMessage('薬品統合に失敗し、取り消しにも失敗しました。監査ログと薬品マスタを確認してください。');
        }
      } else {
        setDrugDuplicateMessage('薬品統合を実行できませんでした。候補を確認し直してください。');
      }
      toast.error('薬品統合に失敗しました。');
    } finally {
      setIsApplyingDrugMerge(false);
    }
  };

  const handleApplyDuplicateMerge = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!db || !duplicateMergeReview) return;
    const { plan, executionPlan } = duplicateMergeReview;
    if (!executionPlan.canApply) {
      setPatientDuplicateMessage('統合前の確認事項を見直してください。');
      return;
    }
    if (!window.confirm('統合元患者を削除し、受付とアラートを残す患者へ付け替えます。実行しますか？')) {
      return;
    }

    const store = createRxdbPatientMergeExecutionStore(db);
    setIsApplyingDuplicateMerge(true);
    try {
      const result = await applyPatientMergeExecutionPlan(store, executionPlan);
      await logAuditAction(
        db,
        'prescription_edit',
        `患者統合実行: ${plan.summary}。${result.auditDetail}`,
        plan.targetPatientId,
        plan.mergedPatient.name
      );
      setDuplicateMergeReview(null);
      toast.success('患者統合を実行しました。');
      await handleScanPatientDuplicates();
    } catch (error) {
      console.error('Failed to apply duplicate merge:', error);
      if (error instanceof PatientMergeExecutionError && error.rollbackOperations.length > 0) {
        try {
          for (const operation of error.rollbackOperations) {
            await applyPatientMergeOperation(store, operation);
          }
          setPatientDuplicateMessage('患者統合に失敗したため、適用済みの操作を取り消しました。候補を確認し直してください。');
        } catch (rollbackError) {
          console.error('Failed to rollback duplicate merge:', rollbackError);
          setPatientDuplicateMessage('患者統合に失敗し、取り消しにも失敗しました。監査ログと患者データを確認してください。');
        }
      } else {
        setPatientDuplicateMessage('患者統合を実行できませんでした。候補を確認し直してください。');
      }
      toast.error('患者統合に失敗しました。');
    } finally {
      setIsApplyingDuplicateMerge(false);
    }
  };

  const handleExportBackupGenerationReviewCsv = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsExportingBackupGenerationReview(true);
    try {
      const generatedAt = new Date();
      const review = buildBackupGenerationReview(auditLogs, generatedAt);
      const fileName = makeBackupGenerationReviewCsvFileName(generatedAt);
      const auditOk = await logAuditAction(
        db,
        'audit_export',
        `バックアップ世代管理CSVエクスポート: ${fileName} を書き出しました（${review.retentionDays}日以内 ${review.generationCount}/${review.requiredGenerationCount}世代, 判定: ${review.statusLabel}）。`
      );
      if (!auditOk) {
        throw new Error('バックアップ世代管理CSV出力の監査ログ記録に失敗しました。');
      }

      const blob = new Blob([`\ufeff${buildBackupGenerationReviewCsv(review)}`], {
        type: 'text/csv;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`バックアップ世代管理CSVを書き出しました（${review.statusLabel}）。`);
    } catch (error: any) {
      console.error('Failed to export backup generation review CSV:', error);
      toast.error(`バックアップ世代管理CSVの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingBackupGenerationReview(false);
    }
  };

  const analyzeBackupPayload = async (
    backup: YakurekiBackup,
    options: { migrationRequiredCollections?: readonly BackupCollectionName[] } = {}
  ) => {
    if (!db) return;
    setIsAnalyzingDiff(true);
    try {
      const diffs = await calculateBackupDiff(db, backup);
      setBackupDiffs(diffs);
      setBackupDrillReport(buildBackupRestoreDrillReport(backup, diffs, new Date(), {
        migrationRequiredCollections: options.migrationRequiredCollections
      }));
      setPendingBackupPayload(backup);
    } catch (error: any) {
      console.error('Failed to analyze backup diff:', error);
      toast.error(`バックアップ差分の解析に失敗しました: ${error.message || error}`);
    } finally {
      setIsAnalyzingDiff(false);
    }
  };

  const handleDecryptAndAnalyze = () => {
    if (!pendingEncryptedPayload) return;
    if (!importPassword.trim()) {
      toast.error('復号用パスワードを入力してください。');
      return;
    }

    try {
      const decryptedBackup = decryptBackupPayload(pendingEncryptedPayload, importPassword.trim());
      const validation = validateBackupPayload(decryptedBackup);
      if (!validation.ok) {
        toast.error(validation.reason);
        return;
      }

      setShowImportPasswordInput(false);
      setPendingEncryptedPayload(null);
      setImportPassword('');

      analyzeBackupPayload(validation.backup);
      toast.success('バックアップの復号に成功しました。');
    } catch (error: any) {
      toast.error(error.message || '復号に失敗しました。パスワードを確認してください。');
    }
  };

  const handleConfirmRestore = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!pendingBackupPayload || !db) return;
    if (backupDrillReport?.status === 'blocked') {
      toast.error('復旧前診断が「復旧不可」です。ID欠落や重複を修正してから復旧してください。');
      return;
    }

    setIsImportingBackup(true);
    try {
      const result = await importDatabaseBackup(db, pendingBackupPayload);
      const auditOk = await logAuditAction(
        db,
        'backup_import',
        `バックアップ復旧: ${backupRestoreSourceName || backupFile?.name || 'ファイル'} から ${result.totalRows}件のローカルデータを復旧しました。${backupRestoreSourceEncrypted ? '（復号後反映）' : ''}`
      );
      if (!auditOk) {
        throw new Error('バックアップ復旧の監査ログ記録に失敗しました。復旧後のデータと監査ログを確認してください。');
      }
      toast.success(`バックアップを復旧しました（${result.totalRows}件）。`);
      
      setPendingBackupPayload(null);
      setBackupDiffs(null);
      setBackupDrillReport(null);
      setBackupFile(null);
      setMigrationCsvPreview(null);
      setBackupRestoreSourceEncrypted(false);
    } catch (error: any) {
      console.error('Failed to import backup:', error);
      toast.error(`バックアップの復旧に失敗しました: ${error.message || error}`);
    } finally {
      setIsImportingBackup(false);
    }
  };

  const handleRecordBackupDrill = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!db || !backupDrillReport) return;

    try {
      const auditOk = await logAuditAction(
        db,
        'backup_drill',
        buildBackupRestoreDrillAuditDetail(backupDrillReport, backupRestoreSourceName || backupFile?.name || 'バックアップファイル')
      );
      if (!auditOk) {
        throw new Error('復旧テスト結果の監査ログ記録に失敗しました。');
      }
      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`復旧テスト結果を監査ログに記録しました（${backupDrillReport.statusLabel}）。`);
    } catch (error: any) {
      console.error('Failed to record backup drill:', error);
      toast.error(`復旧テスト結果の記録に失敗しました: ${error.message || error}`);
    }
  };

  const handleCancelRestore = () => {
    setPendingBackupPayload(null);
    setBackupDiffs(null);
    setBackupDrillReport(null);
    setBackupFile(null);
    setMigrationCsvPreview(null);
    setImportPassword('');
    setShowImportPasswordInput(false);
    setPendingEncryptedPayload(null);
    setBackupRestoreSourceEncrypted(false);
    toast.info('復旧処理を取り消しました。');
  };

  const handleAnalyzeMigrationCsv = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!migrationCsvFile) {
      toast.error('移行プレビューするCSVを選択してください。');
      return;
    }
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsAnalyzingMigrationCsv(true);
    try {
      const buffer = await migrationCsvFile.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      const detectedEncoding = encoding.detect(uint8Array);
      const unicodeArray = encoding.convert(uint8Array, {
        to: 'UNICODE',
        from: typeof detectedEncoding === 'string' ? detectedEncoding : 'SJIS'
      });
      const csvText = encoding.codeToString(unicodeArray as number[]);
      const generatedAt = new Date();
      const preview = migrationCsvKind === 'patients'
        ? buildPatientCsvMigrationPreview(csvText, { generatedAt })
        : migrationCsvKind === 'visits'
          ? buildVisitCsvMigrationPreview(csvText, { generatedAt })
          : migrationCsvKind === 'drug_stocks'
            ? buildDrugStockCsvMigrationPreview(csvText, { generatedAt })
            : buildSoapCsvMigrationPreview(csvText, { generatedAt });
      const migrationLabel = migrationCsvKind === 'patients'
        ? '患者CSV'
        : migrationCsvKind === 'visits'
          ? '受付CSV'
          : migrationCsvKind === 'drug_stocks'
            ? '在庫CSV'
            : '薬歴CSV';
      setMigrationCsvPreview(preview);
      setBackupFile(null);
      setBackupRestoreSourceName(migrationCsvFile.name);
      setBackupRestoreSourceEncrypted(false);
      setShowImportPasswordInput(false);
      setPendingEncryptedPayload(null);
      setImportPassword('');
      await analyzeBackupPayload(preview.backup, { migrationRequiredCollections: [] });

      if (preview.status === 'blocked') {
        toast.error(`${migrationLabel}の移行プレビューを作成しました（${preview.statusLabel}）。指摘を修正してください。`);
      } else if (preview.status === 'attention') {
        toast.warning(`${migrationLabel}の移行プレビューを作成しました（${preview.statusLabel}）。`);
      } else {
        toast.success(`${migrationLabel}の移行プレビューを作成しました（${preview.rows.length}件）。`);
      }
    } catch (error: any) {
      console.error('Failed to analyze migration CSV:', error);
      toast.error(`CSVの移行プレビューに失敗しました: ${error.message || error}`);
    } finally {
      setIsAnalyzingMigrationCsv(false);
    }
  };

  const handleImportBackup = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!backupFile) {
      toast.error('復旧するバックアップJSONを選択してください。');
      return;
    }
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await backupFile.text());
    } catch (error) {
      toast.error('バックアップJSONを読み取れませんでした。');
      return;
    }

    if (isEncryptedBackup(parsed)) {
      setPendingEncryptedPayload(parsed);
      setShowImportPasswordInput(true);
      setBackupRestoreSourceEncrypted(true);
      return;
    }

    const validation = validateBackupPayload(parsed);
    if (!validation.ok) {
      toast.error(validation.reason);
      return;
    }

    analyzeBackupPayload(validation.backup);
    setBackupRestoreSourceEncrypted(false);
  };

  // --- Facility Settings State ---
  const [settings, setSettings] = useState<FacilitySettings>({
    id: 'default',
    pharmacyName: 'Next-Gen 薬局',
    pharmacyKana: '',
    pharmacyCode: '',
    pharmacyPostalCode: '123-4567',
    pharmacyAddress: '東京都渋谷区桜丘町26-1',
    pharmacyPhone: '03-1234-5678',
    pharmacyFax: '',
    registrationNumber: 'T1234567890123',
    ownerName: '',
    managerName: '',
    defaultPharmacistName: '山田',
    baseFeeCategory: '1',
    regionalSupportAddition: 'none',
    medicalDxAddition: false,
    postGenericAddition: 'none',
    genericDispensingReduction: false,
    aiAssistMode: 'limited',
    officialFeeCodeOverrides: {}
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isApplyingAiQualityMode, setIsApplyingAiQualityMode] = useState(false);
  const [isImportingOfficialFeeCodeCsv, setIsImportingOfficialFeeCodeCsv] = useState(false);
  const [isReviewingOfficialFeeCodeMasterCsv, setIsReviewingOfficialFeeCodeMasterCsv] = useState(false);
  const [officialFeeCodeMasterProposal, setOfficialFeeCodeMasterProposal] = useState<OfficialFeeCodeMasterProposal | null>(null);
  const [officialFeeCodeMasterFileName, setOfficialFeeCodeMasterFileName] = useState('');

  useEffect(() => {
    async function loadSettings() {
      if (!db) return;
      try {
        const doc = await db.facility_settings.findOne('default').exec();
        if (doc) {
          const saved = doc.toJSON();
          setSettings({
            id: 'default',
            pharmacyName: saved.pharmacyName || 'Next-Gen 薬局',
            pharmacyKana: saved.pharmacyKana || '',
            pharmacyCode: saved.pharmacyCode || '',
            pharmacyPostalCode: saved.pharmacyPostalCode || '123-4567',
            pharmacyAddress: saved.pharmacyAddress || '東京都渋谷区桜丘町26-1',
            pharmacyPhone: saved.pharmacyPhone || '03-1234-5678',
            pharmacyFax: saved.pharmacyFax || '',
            registrationNumber: saved.registrationNumber || 'T1234567890123',
            ownerName: saved.ownerName || '',
            managerName: saved.managerName || '',
            defaultPharmacistName: saved.defaultPharmacistName || '山田',
            baseFeeCategory: saved.baseFeeCategory || '1',
            regionalSupportAddition: saved.regionalSupportAddition || 'none',
            medicalDxAddition: !!saved.medicalDxAddition,
            postGenericAddition: saved.postGenericAddition || 'none',
            genericDispensingReduction: !!saved.genericDispensingReduction,
            aiAssistMode: normalizeAiAssistMode(saved.aiAssistMode),
            officialFeeCodeOverrides: saved.officialFeeCodeOverrides || {}
          });
        }
      } catch (error) {
        console.error('Failed to load facility settings securely:', error);
      }
    }
    loadSettings();
  }, [db]);

  useEffect(() => {
    async function fetchAuditLogs() {
      if (!db || (!canViewAuditLogs && !canManageBackups)) return;
      setIsCheckingAuditIntegrity(true);
      try {
        const list = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
        const rows = list.map(d => d.toJSON());
        setAuditLogs(rows);
        setAuditIntegrity(await verifyAuditLogIntegrity(rows));
      } catch (err) {
        console.error('Failed to load audit logs:', err);
        setAuditIntegrity(null);
      } finally {
        setIsCheckingAuditIntegrity(false);
      }
    }
    fetchAuditLogs();
  }, [db, canManageBackups, canViewAuditLogs]);

  const handleExportAuditLogs = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    if (auditLogs.length === 0) {
      toast.info('エクスポートできる監査ログがありません。');
      return;
    }

    setIsExportingAuditLogs(true);
    try {
      const report = auditIntegrity ?? await verifyAuditLogIntegrity(auditLogs);
      const exportedAt = new Date();
      const fileName = makeAuditLogExportFileName(exportedAt);
      const blob = new Blob([buildAuditLogExportJson(auditLogs, report, exportedAt)], {
        type: 'application/json;charset=utf-8'
      });

      const auditOk = await logAuditAction(
        db,
        'audit_export',
        `監査ログJSONエクスポート: ${fileName} に ${auditLogs.length}件を書き出しました（署名済み: ${report.signed}件, 未署名: ${report.unsigned}件, 異常: ${report.invalid}件、責任者保全欄付き）。`
      );
      if (!auditOk) {
        throw new Error('監査ログJSONエクスポートの監査ログ記録に失敗したため、書き出しを中止しました。');
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`監査ログJSONを書き出しました（${auditLogs.length}件、責任者保全欄付き）。`);
    } catch (error: any) {
      console.error('Failed to export audit logs:', error);
      toast.error(`監査ログJSONの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingAuditLogs(false);
    }
  };

  const handleExportAnonymousDiagnostic = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsExportingAnonymousDiagnostic(true);
    try {
      const generatedAt = new Date();
      const [
        patientCount,
        visitCount,
        prescriptionItemCount,
        soapRecordCount,
        userCount,
        alertCount,
        interventionCount,
        drugCount,
        drugStockCount,
        facilitySettingsCount,
        locationCount,
        drugInfoCount,
        medicationGuidanceCount,
        patientMedicationInfoTemplateCount,
        auditLogCount
      ] = await Promise.all([
        db.patients.count().exec(),
        db.visits.count().exec(),
        db.prescription_items.count().exec(),
        db.soap_records.count().exec(),
        db.users.count().exec(),
        db.alerts.count().exec(),
        db.interventions.count().exec(),
        db.drugs.count().exec(),
        db.drug_stocks.count().exec(),
        db.facility_settings.count().exec(),
        db.locations.count().exec(),
        getDrugInfoReferenceCount(),
        db.medication_guidances.count().exec(),
        db.patient_medication_info_templates.count().exec(),
        db.audit_logs.count().exec()
      ]);
      let externalConnectorReadiness: ExternalConnectorReadinessReport | undefined;
      try {
        const readinessResponse = await fetch('/api/system/connector-readiness');
        if (readinessResponse.ok) {
          externalConnectorReadiness = await readinessResponse.json();
        }
      } catch (readinessError) {
        console.warn('Failed to fetch external connector readiness:', readinessError);
      }
      const onlineEligibilityFieldReadiness = externalConnectorReadiness
        ? buildOnlineEligibilityFieldReadinessReport({
          generatedAt,
          connectorReadiness: externalConnectorReadiness,
          responseDiff: buildOnlineEligibilityResponseDiffReport([])
        })
        : undefined;
      const staffForDiagnostic = (await db.users.find().exec()).map(doc => doc.toJSON());
      const report = auditIntegrity ?? await verifyAuditLogIntegrity(auditLogs);
      const staffAccessRecoveryReview = buildStaffAccessRecoveryReviewFromAuditLogs({
        generatedAt,
        auditLogs,
        sourceArtifactSha256: report.latestHash
      });
      const staffAccessRecoveryMonthlyReview = buildStaffAccessRecoveryMonthlyReview(auditLogs, generatedAt, {
        sourceArtifactSha256: report.latestHash
      });
      const fileName = makeAnonymousDiagnosticExportFileName(generatedAt);
      const content = buildAnonymousDiagnosticExportJson({
        generatedAt,
        settings,
        staff: staffForDiagnostic,
        auditLogs,
        collectionCounts: {
          patients: patientCount,
          visits: visitCount,
          prescription_items: prescriptionItemCount,
          soap_records: soapRecordCount,
          users: userCount,
          alerts: alertCount,
          interventions: interventionCount,
          drugs: drugCount,
          drug_stocks: drugStockCount,
          facility_settings: facilitySettingsCount,
          locations: locationCount,
          drug_infos: drugInfoCount,
          medication_guidances: medicationGuidanceCount,
          patient_medication_info_templates: patientMedicationInfoTemplateCount,
          audit_logs: auditLogCount
        },
        auditIntegrity: report,
        auditRetentionReview: buildAuditLogRetentionMonthlyReview(auditLogs, report, generatedAt),
        initialSetupChecklist: buildInitialSetupChecklist({
          settings,
          staff: staffForDiagnostic,
          auditLogs,
          generatedAt
        }),
        backupGenerationReview: buildBackupGenerationReview(auditLogs, generatedAt),
        backupScheduleReview: buildBackupScheduleReview(auditLogs, backupSchedulePolicy, generatedAt),
        officialAuditSummary,
        officialAuditBlockerCount: officialAuditBlockers.length,
        dailyClosingReview: buildOperationalClosingMonthlyReview(auditLogs, generatedAt, {
          currentStoreName: settings.pharmacyName || '自店',
          currentStoreCode: settings.pharmacyCode || undefined
        }),
        aiSuggestionFeedbackReview: buildAiSuggestionFeedbackMonthlyReview(auditLogs, generatedAt, {
          currentStoreName: settings.pharmacyName || '自店',
          currentStoreCode: settings.pharmacyCode || undefined,
          currentAiAssistMode: normalizeAiAssistMode(settings.aiAssistMode)
        }),
        externalConnectorReadiness,
        onlineEligibilityFieldReadiness,
        staffAccessRecoveryReview,
        staffAccessRecoveryMonthlyReview
      });

      const auditOk = await logAuditAction(
        db,
        'audit_export',
        `個人情報なし診断JSONエクスポート: ${fileName} に患者情報なしのサポート診断サマリを書き出しました（監査ログ ${auditLogs.length}件、DB集計 14領域）。`
      );
      if (!auditOk) {
        throw new Error('個人情報なし診断JSONエクスポートの監査ログ記録に失敗したため、書き出しを中止しました。');
      }

      downloadTextFile(fileName, content, 'application/json;charset=utf-8');

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success('個人情報なし診断JSONを書き出しました。');
    } catch (error: any) {
      console.error('Failed to export support diagnostic JSON:', error);
      toast.error(`個人情報なし診断JSONの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingAnonymousDiagnostic(false);
    }
  };

  const handleExportAuditRetentionLedgerCsv = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    if (auditLogs.length === 0) {
      toast.info('保全台帳を作成できる監査ログがありません。');
      return;
    }

    setIsExportingAuditRetentionLedger(true);
    try {
      const report = auditIntegrity ?? await verifyAuditLogIntegrity(auditLogs);
      const exportedAt = new Date();
      const auditLogFileName = makeAuditLogExportFileName(exportedAt);
      const fileName = makeAuditLogRetentionLedgerCsvFileName(exportedAt);
      const blob = new Blob([`\ufeff${buildAuditLogRetentionLedgerCsv(report, auditLogFileName, exportedAt)}`], {
        type: 'text/csv;charset=utf-8'
      });

      const auditOk = await logAuditAction(
        db,
        'audit_export',
        `監査ログ保全台帳CSVエクスポート: ${fileName} に最新ハッシュ ${report.latestHash || '未署名'} の外部WORM保存確認欄を書き出しました。`
      );
      if (!auditOk) {
        throw new Error('監査ログ保全台帳CSVエクスポートの監査ログ記録に失敗したため、書き出しを中止しました。');
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success('監査ログ保全台帳CSVを書き出しました（外部WORM保存確認欄付き）。');
    } catch (error: any) {
      console.error('Failed to export audit retention ledger CSV:', error);
      toast.error(`監査ログ保全台帳CSVの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingAuditRetentionLedger(false);
    }
  };

  const handleExportAuditRetentionMonthlyReviewCsv = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    if (auditLogs.length === 0) {
      toast.info('棚卸CSVを作成できる監査ログがありません。');
      return;
    }

    setIsExportingAuditRetentionReview(true);
    try {
      const report = auditIntegrity ?? await verifyAuditLogIntegrity(auditLogs);
      const review = buildAuditLogRetentionMonthlyReview(auditLogs, report);
      const fileName = makeAuditLogRetentionMonthlyReviewCsvFileName(review.monthKey);
      const blob = new Blob([`\ufeff${buildAuditLogRetentionMonthlyReviewCsv(review)}`], {
        type: 'text/csv;charset=utf-8'
      });

      const auditOk = await logAuditAction(
        db,
        'audit_export',
        `監査ログ保全月次棚卸CSVエクスポート: ${fileName} を書き出しました（${review.monthLabel}, 判定: ${review.statusLabel}, 差し戻し: ${review.returnReasons.length}件）。`
      );
      if (!auditOk) {
        throw new Error('監査ログ保全月次棚卸CSVエクスポートの監査ログ記録に失敗したため、書き出しを中止しました。');
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`監査ログ保全月次棚卸CSVを書き出しました（${review.statusLabel}）。`);
    } catch (error: any) {
      console.error('Failed to export audit retention monthly review CSV:', error);
      toast.error(`監査ログ保全月次棚卸CSVの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingAuditRetentionReview(false);
    }
  };

  const handleRecordAuditRetentionManagerReview = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    if (auditLogs.length === 0) {
      toast.info('責任者確認を記録できる監査ログがありません。');
      return;
    }

    setIsRecordingAuditRetentionManagerReview(true);
    try {
      const report = auditIntegrity ?? await verifyAuditLogIntegrity(auditLogs);
      const review = buildAuditLogRetentionMonthlyReview(auditLogs, report);
      const auditOk = await logAuditAction(
        db,
        'audit_retention_approval',
        buildAuditLogRetentionManagerReviewAuditDetail(
          review,
          currentUser.name || '責任者'
        )
      );
      if (!auditOk) {
        throw new Error('監査ログ保全の責任者確認記録に失敗しました。');
      }

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      if (review.status === 'complete' && review.returnReasons.length === 0) {
        toast.success('監査ログ保全の責任者承認を記録しました。');
      } else {
        toast.warning('監査ログ保全の差し戻し記録を残しました。');
      }
    } catch (error: any) {
      console.error('Failed to record audit retention manager review:', error);
      toast.error(`責任者確認の記録に失敗しました: ${error.message || error}`);
    } finally {
      setIsRecordingAuditRetentionManagerReview(false);
    }
  };

  const handleExportDailyClosingReviewCsv = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsExportingDailyClosingReview(true);
    try {
      const review = buildOperationalClosingMonthlyReview(auditLogs, new Date(), {
        currentStoreName: settings.pharmacyName || '自店',
        currentStoreCode: settings.pharmacyCode || undefined
      });
      const fileName = makeDailyClosingReviewCsvFileName(review.monthKey);
      const blob = new Blob([`\ufeff${buildOperationalClosingMonthlyReviewCsv(review)}`], {
        type: 'text/csv;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      await logAuditAction(
        db,
        'audit_export',
        `日次締め月次レビューCSVエクスポート: ${fileName} に ${review.approvalCount}件の承認ログサマリを書き出しました。`
      );

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`日次締め月次レビューCSVを書き出しました（${review.approvalCount}件）。`);
    } catch (error: any) {
      console.error('Failed to export daily closing review CSV:', error);
      toast.error(`日次締め月次レビューCSVの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingDailyClosingReview(false);
    }
  };

  const handleExportDailyClosingStoreBenchmarkJson = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsExportingDailyClosingStoreBenchmark(true);
    try {
      const review = buildOperationalClosingMonthlyReview(auditLogs, new Date(), {
        currentStoreName: settings.pharmacyName || '自店',
        currentStoreCode: settings.pharmacyCode || undefined
      });
      const fileName = makeDailyClosingStoreBenchmarkBiExportFileName(review.monthKey);
      const blob = new Blob([buildOperationalClosingStoreBenchmarkBiExport(review)], {
        type: 'application/json;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      await logAuditAction(
        db,
        'audit_export',
        `店舗別KPIベンチマークJSONエクスポート: ${fileName} に ${review.storeBenchmark.storeCount}件の店舗別KPIサマリを書き出しました（患者情報なし、外部BI連携用）。`
      );

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`店舗別KPIベンチマークJSONを書き出しました（${review.storeBenchmark.storeCount}店舗）。`);
    } catch (error: any) {
      console.error('Failed to export daily closing store benchmark JSON:', error);
      toast.error(`店舗別KPIベンチマークJSONの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingDailyClosingStoreBenchmark(false);
    }
  };

  const handleRecordDailyClosingKpiAction = async (template: OperationalClosingStoreBenchmarkActionTemplate) => {
    if (!ensurePermission('approve_daily_closing')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setRecordingDailyClosingKpiActionId(template.id);
    try {
      const review = buildOperationalClosingMonthlyReview(auditLogs, new Date(), {
        currentStoreName: settings.pharmacyName || '自店',
        currentStoreCode: settings.pharmacyCode || undefined
      });
      const latestTemplate = review.storeBenchmark.actionTemplates.find((candidate) => candidate.id === template.id) || template;
      await logAuditAction(
        db,
        'daily_closing_kpi_action',
        buildOperationalClosingStoreBenchmarkActionAuditDetail(latestTemplate, review)
      );

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`店舗別KPI改善アクションを記録しました（${latestTemplate.title}）。`);
    } catch (error: any) {
      console.error('Failed to record daily closing KPI action:', error);
      toast.error(`店舗別KPI改善アクションの記録に失敗しました: ${error.message || error}`);
    } finally {
      setRecordingDailyClosingKpiActionId(null);
    }
  };

  const handlePostponeDailyClosingKpiAction = async (template: OperationalClosingStoreBenchmarkActionTemplate) => {
    if (!ensurePermission('approve_daily_closing')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    const reason = window.prompt('延期理由を入力してください', '対象店舗との確認待ち');
    if (!reason?.trim()) return;
    const daysText = window.prompt('再期限までの日数を入力してください', '7');
    const postponeDays = Math.round(Number(daysText));
    if (!Number.isFinite(postponeDays) || postponeDays < 1 || postponeDays > 60) {
      toast.error('再期限までの日数は1日から60日の範囲で入力してください。');
      return;
    }

    setPostponingDailyClosingKpiActionId(template.id);
    try {
      const review = buildOperationalClosingMonthlyReview(auditLogs, new Date(), {
        currentStoreName: settings.pharmacyName || '自店',
        currentStoreCode: settings.pharmacyCode || undefined
      });
      const latestTemplate = review.storeBenchmark.actionTemplates.find((candidate) => candidate.id === template.id) || template;
      const newDueDate = new Date();
      newDueDate.setDate(newDueDate.getDate() + postponeDays);
      await logAuditAction(
        db,
        'daily_closing_kpi_action',
        buildOperationalClosingStoreBenchmarkActionPostponementAuditDetail(latestTemplate, review, reason, newDueDate)
      );

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`店舗別KPI改善アクションを延期しました（${latestTemplate.title} / ${postponeDays}日後）。`);
    } catch (error: any) {
      console.error('Failed to postpone daily closing KPI action:', error);
      toast.error(`店舗別KPI改善アクションの延期記録に失敗しました: ${error.message || error}`);
    } finally {
      setPostponingDailyClosingKpiActionId(null);
    }
  };

  const handleExportAiSuggestionFeedbackReviewCsv = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsExportingAiSuggestionFeedbackReview(true);
    try {
      const review = buildAiSuggestionFeedbackMonthlyReview(auditLogs, new Date(), {
        currentStoreName: settings.pharmacyName || '自店',
        currentStoreCode: settings.pharmacyCode || undefined,
        currentAiAssistMode: normalizeAiAssistMode(settings.aiAssistMode)
      });
      const fileName = makeAiSuggestionFeedbackReviewCsvFileName(review.monthKey);
      const blob = new Blob([`\ufeff${buildAiSuggestionFeedbackMonthlyReviewCsv(review)}`], {
        type: 'text/csv;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      await logAuditAction(
        db,
        'audit_export',
        `AI補助フィードバック月次レビューCSVエクスポート: ${fileName} に ${review.totalCount}件の採否ログと ${review.storeComparison.storeCount}件の店舗別サマリを書き出しました。`
      );

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`AI補助フィードバックCSVを書き出しました（${review.totalCount}件）。`);
    } catch (error: any) {
      console.error('Failed to export AI suggestion feedback review CSV:', error);
      toast.error(`AI補助フィードバックCSVの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingAiSuggestionFeedbackReview(false);
    }
  };

  const handleExportAiSuggestionFeedbackBiJson = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsExportingAiSuggestionFeedbackBi(true);
    try {
      const generatedAt = new Date();
      const review = buildAiSuggestionFeedbackMonthlyReview(auditLogs, generatedAt, {
        currentStoreName: settings.pharmacyName || '自店',
        currentStoreCode: settings.pharmacyCode || undefined,
        currentAiAssistMode: normalizeAiAssistMode(settings.aiAssistMode)
      });
      const fileName = makeAiSuggestionFeedbackBiExportFileName(review.monthKey);
      const blob = new Blob([buildAiSuggestionFeedbackBiExport(review, generatedAt)], {
        type: 'application/json;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      await logAuditAction(
        db,
        'audit_export',
        `AI補助フィードバックBI JSONエクスポート: ${fileName} に ${review.totalCount}件の採否ログと ${review.storeComparison.storeCount}件の店舗別フィードバック比較を書き出しました（患者情報なし）。`
      );

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`AI補助フィードバックBI JSONを書き出しました（${review.storeComparison.storeCount}店舗）。`);
    } catch (error: any) {
      console.error('Failed to export AI suggestion feedback BI JSON:', error);
      toast.error(`AI補助フィードバックBI JSONの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingAiSuggestionFeedbackBi(false);
    }
  };

  // --- Staff Management Hook & Handlers ---
  useEffect(() => {
    if (!db || !canManageStaff) return;
    const sub = db.users.find().$.subscribe((list) => {
      if (list) {
        setStaffList(list.map(d => ({
          userId: d.userId,
          name: d.name,
          role: d.role,
          passwordHash: d.passwordHash,
          salt: d.salt,
          passkeyCredentialId: d.passkeyCredentialId,
          passkeyPublicKey: d.passkeyPublicKey
        })));
      }
    });
    return () => {
      if (sub) sub.unsubscribe();
    };
  }, [db, canManageStaff]);

  useEffect(() => {
    if (!isOnboardingStaffSetup || activeTab !== 'staff') return;
    const currentStaff = staffList.find((staff) => staff.userId === currentUser.userId);
    if (currentStaff?.passkeyCredentialId) {
      setIsAddStaffOpen(true);
    }
  }, [activeTab, currentUser.userId, isOnboardingStaffSetup, staffList]);

  const refreshAuditEvidence = async () => {
    if (!db || (!canViewAuditLogs && !canManageBackups && !canManageStaff)) return;
    const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
    const refreshedRows = refreshed.map(d => d.toJSON());
    setAuditLogs(refreshedRows);
    setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ensurePermission('manage_staff')) return;
    if (!db || !newStaffName.trim()) {
      toast.error('スタッフ名を入力してください。');
      return;
    }
    if (newStaffPassword.trim() && newStaffPassword.trim().length < 8) {
      toast.error('ログインパスワードは8文字以上にしてください。');
      return;
    }
    setIsSubmittingStaff(true);
    try {
      const { generateSalt, hashPassword } = await import('@/lib/auth');
      const userId = 'staff_' + Date.now();
      const staffName = newStaffName.trim();
      
      let salt = '';
      let passwordHash = '';
      if (newStaffPassword.trim()) {
        salt = generateSalt();
        passwordHash = await hashPassword(newStaffPassword, salt);
      }
      
      await db.users.insert({
        userId,
        name: staffName,
        role: newStaffRole,
        salt,
        passwordHash
      });

      const auditOk = await logAuditAction(
        db,
        'staff_create',
        `スタッフ追加: 新しいスタッフ「${staffName} (${newStaffRole})」を追加しました。`
      );
      if (!auditOk) {
        const insertedDoc = await db.users.findOne(userId).exec();
        if (insertedDoc) {
          await insertedDoc.remove();
        }
        throw new Error('スタッフ追加の監査ログ記録に失敗したため、追加を取り消しました。');
      }

      toast.success(`スタッフ「${staffName}」を追加しました。`);
      setIsAddStaffOpen(false);
      setNewStaffName('');
      setNewStaffPassword('');
    } catch (err: any) {
      console.error('Failed to add staff:', err);
      toast.error(`スタッフの追加に失敗しました: ${err.message || err}`);
    } finally {
      setIsSubmittingStaff(false);
    }
  };

  const handleRegisterPasskey = async (staff: User) => {
    if (!ensurePermission('manage_staff')) return;
    if (!db) return;
    try {
      toast.info(`スタッフ「${staff.name}」のデバイス認証登録を開始します。ブラウザの指示に従ってください...`);
      const { registerPasskey } = await import('@/lib/auth');
      const creds = await registerPasskey(staff);
      
      const doc = await db.users.findOne(staff.userId).exec();
      if (doc) {
        const previousCredentialId = staff.passkeyCredentialId || '';
        const previousPublicKey = staff.passkeyPublicKey || '';
        await doc.patch({
          passkeyCredentialId: creds.credentialId,
          passkeyPublicKey: creds.publicKey
        });
        
        const auditOk = await logAuditAction(
          db,
          'passkey_register',
          `パスキー登録: スタッフ「${staff.name}」のパスキー認証デバイスを登録しました。`
        );
        if (!auditOk) {
          await doc.patch({
            passkeyCredentialId: previousCredentialId,
            passkeyPublicKey: previousPublicKey
          });
          throw new Error('パスキー登録の監査ログ記録に失敗したため、登録を取り消しました。');
        }
        
        toast.success(`スタッフ「${staff.name}」のパスキーを登録しました！`);
        if (isOnboardingStaffSetup && staff.userId === currentUser.userId) {
          setIsAddStaffOpen(true);
        }
      }
    } catch (err: any) {
      console.error('Failed to register passkey:', err);
      toast.error(err.message || 'パスキーの登録に失敗しました。');
    }
  };

  const handleDeleteStaff = async (staff: User) => {
    if (!ensurePermission('manage_staff')) return;
    if (!db) return;
    if (staff.role === 'admin' && hasLoginCredential(staff) && credentialedAdminCount <= 1) {
      toast.error('最後の認証済み管理者は削除できません。先に別の管理者を追加し、認証情報を登録してください。');
      return;
    }
    if (!window.confirm(`本当にスタッフ「${staff.name}」を削除しますか？`)) return;
    
    try {
      const doc = await db.users.findOne(staff.userId).exec();
      if (doc) {
        await doc.remove();
        
        const auditOk = await logAuditAction(
          db,
          'staff_delete',
          `スタッフ削除: スタッフ「${staff.name} (${staff.role})」を削除しました。`
        );
        if (!auditOk) {
          await db.users.insert({
            userId: staff.userId,
            name: staff.name,
            role: staff.role,
            salt: staff.salt || '',
            passwordHash: staff.passwordHash || '',
            passkeyCredentialId: staff.passkeyCredentialId || '',
            passkeyPublicKey: staff.passkeyPublicKey || ''
          });
          throw new Error('スタッフ削除の監査ログ記録に失敗したため、削除を取り消しました。');
        }
        
        toast.success(`スタッフ「${staff.name}」を削除しました。`);
      }
    } catch (err: any) {
      console.error('Failed to delete staff:', err);
      toast.error(`スタッフの削除に失敗しました: ${err.message || err}`);
    }
  };

  const handleResetStaffRecoveryPassword = async () => {
    if (!ensurePermission('manage_staff')) return;
    if (!db || !staffRecoveryTarget) {
      toast.error('復旧対象のスタッフを選択してください。');
      return;
    }
    const password = staffRecoveryPassword.trim();
    if (password.length < 8) {
      toast.error('再設定するパスワードは8文字以上にしてください。');
      return;
    }

    setIsHandlingStaffRecovery(true);
    try {
      const { generateSalt, hashPassword } = await import('@/lib/auth');
      const doc = await db.users.findOne(staffRecoveryTarget.userId).exec();
      if (!doc) {
        throw new Error('対象スタッフが見つかりません。');
      }

      const previousSalt = staffRecoveryTarget.salt || '';
      const previousPasswordHash = staffRecoveryTarget.passwordHash || '';
      const salt = generateSalt();
      const passwordHash = await hashPassword(password, salt);
      await doc.patch({ salt, passwordHash });

      const auditOk = await logAuditAction(
        db,
        'staff_credential_recovery',
        buildStaffCredentialRecoveryAuditDetail({
          reason: staffRecoveryReason,
          action: 'password_reset',
          targetStaff: staffRecoveryTarget,
          operatorName: currentUser.name || '管理者',
          checklist: staffRecoveryChecklist,
          note: staffRecoveryNote
        })
      );
      if (!auditOk) {
        await doc.patch({ salt: previousSalt, passwordHash: previousPasswordHash });
        throw new Error('パスワード再設定の監査ログ記録に失敗したため、変更を取り消しました。');
      }

      setStaffRecoveryPassword('');
      await refreshAuditEvidence();
      toast.success(`スタッフ「${staffRecoveryTarget.name}」のパスワードを再設定しました。`);
    } catch (err: any) {
      console.error('Failed to reset staff password:', err);
      toast.error(`パスワード再設定に失敗しました: ${err.message || err}`);
    } finally {
      setIsHandlingStaffRecovery(false);
    }
  };

  const handleClearStaffRecoveryPasskey = async () => {
    if (!ensurePermission('manage_staff')) return;
    if (!db || !staffRecoveryTarget) {
      toast.error('復旧対象のスタッフを選択してください。');
      return;
    }
    if (!staffRecoveryTarget.passkeyCredentialId) {
      toast.info('このスタッフには解除するパスキーがありません。');
      return;
    }
    if (!window.confirm(`スタッフ「${staffRecoveryTarget.name}」の登録済みパスキーを解除しますか？`)) return;

    setIsHandlingStaffRecovery(true);
    try {
      const doc = await db.users.findOne(staffRecoveryTarget.userId).exec();
      if (!doc) {
        throw new Error('対象スタッフが見つかりません。');
      }

      const previousCredentialId = staffRecoveryTarget.passkeyCredentialId || '';
      const previousPublicKey = staffRecoveryTarget.passkeyPublicKey || '';
      await doc.patch({
        passkeyCredentialId: '',
        passkeyPublicKey: ''
      });

      const auditOk = await logAuditAction(
        db,
        'staff_credential_recovery',
        buildStaffCredentialRecoveryAuditDetail({
          reason: staffRecoveryReason,
          action: 'passkey_clear',
          targetStaff: staffRecoveryTarget,
          operatorName: currentUser.name || '管理者',
          checklist: staffRecoveryChecklist,
          note: staffRecoveryNote
        })
      );
      if (!auditOk) {
        await doc.patch({
          passkeyCredentialId: previousCredentialId,
          passkeyPublicKey: previousPublicKey
        });
        throw new Error('パスキー解除の監査ログ記録に失敗したため、変更を取り消しました。');
      }

      await refreshAuditEvidence();
      toast.success(`スタッフ「${staffRecoveryTarget.name}」のパスキーを解除しました。`);
    } catch (err: any) {
      console.error('Failed to clear staff passkey:', err);
      toast.error(`パスキー解除に失敗しました: ${err.message || err}`);
    } finally {
      setIsHandlingStaffRecovery(false);
    }
  };

  const handleRecordStaffRetirementCheck = async () => {
    if (!ensurePermission('manage_staff')) return;
    if (!db || !staffRecoveryTarget) {
      toast.error('復旧対象のスタッフを選択してください。');
      return;
    }
    if (staffRecoveryTarget.role === 'admin' && hasLoginCredential(staffRecoveryTarget) && credentialedAdminCount <= 1) {
      toast.error('最後の認証済み管理者は退職対応に進めません。先に別の管理者を追加し、認証情報を登録してください。');
      return;
    }

    setIsHandlingStaffRecovery(true);
    try {
      const auditOk = await logAuditAction(
        db,
        'staff_credential_recovery',
        buildStaffCredentialRecoveryAuditDetail({
          reason: staffRecoveryReason,
          action: 'retirement_check_record',
          targetStaff: staffRecoveryTarget,
          operatorName: currentUser.name || '管理者',
          checklist: staffRecoveryChecklist,
          note: staffRecoveryNote
        })
      );
      if (!auditOk) {
        throw new Error('退職前チェックの監査ログ記録に失敗しました。');
      }

      await refreshAuditEvidence();
      toast.success(`スタッフ「${staffRecoveryTarget.name}」の退職前チェックを記録しました。`);
    } catch (err: any) {
      console.error('Failed to record staff retirement check:', err);
      toast.error(`退職前チェックの記録に失敗しました: ${err.message || err}`);
    } finally {
      setIsHandlingStaffRecovery(false);
    }
  };

  const handleRolePermissionToggle = (role: User['role'], action: PermissionAction) => {
    if (!canManageStaff || role === 'admin') return;
    setRolePermissionPolicy(prev => {
      const current = prev[role] || [];
      const nextActions = current.includes(action)
        ? current.filter(permission => permission !== action)
        : [...current, action];
      return normalizeRolePermissionPolicy({
        ...prev,
        [role]: nextActions
      });
    });
  };

  const handleExportStaffAccessRecoveryMonthlyReviewCsv = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsExportingStaffAccessRecoveryMonthlyReview(true);
    try {
      const generatedAt = new Date();
      const report = auditIntegrity ?? await verifyAuditLogIntegrity(auditLogs);
      const review = buildStaffAccessRecoveryMonthlyReview(auditLogs, generatedAt, {
        sourceArtifactSha256: report.latestHash
      });
      const fileName = makeStaffAccessRecoveryMonthlyReviewCsvFileName(review.monthKey);
      const blob = new Blob([`\ufeff${buildStaffAccessRecoveryMonthlyReviewCsv(review)}`], {
        type: 'text/csv;charset=utf-8'
      });

      const auditOk = await logAuditAction(
        db,
        'audit_export',
        `スタッフ復旧・退職対応月次棚卸CSVエクスポート: ${fileName} を書き出しました（${review.monthLabel}, 判定: ${review.statusLabel}, 対象操作: ${review.eventCaseCount}件, 保留: ${review.blockedCaseCount}件）。`
      );
      if (!auditOk) {
        throw new Error('スタッフ復旧・退職対応月次棚卸CSVエクスポートの監査ログ記録に失敗したため、書き出しを中止しました。');
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`スタッフ復旧・退職対応月次棚卸CSVを書き出しました（${review.statusLabel}）。`);
    } catch (error: any) {
      console.error('Failed to export staff access recovery monthly review CSV:', error);
      toast.error(`スタッフ復旧・退職対応月次棚卸CSVの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingStaffAccessRecoveryMonthlyReview(false);
    }
  };

  const handleSaveRolePermissionPolicy = async () => {
    if (!ensurePermission('manage_staff')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsSavingRolePermissionPolicy(true);
    const previousPolicy = readRolePermissionPolicy();
    try {
      const savedPolicy = writeRolePermissionPolicy(rolePermissionPolicy);
      setRolePermissionPolicy(savedPolicy);

      const auditOk = await logAuditAction(
        db,
        'facility_settings_update',
        buildRolePermissionPolicyAuditDetail(savedPolicy)
      );
      if (!auditOk) {
        writeRolePermissionPolicy(previousPolicy);
        setRolePermissionPolicy(previousPolicy);
        throw new Error('権限ロール設定の監査ログ記録に失敗したため、保存を取り消しました。');
      }

      toast.success('権限ロール設定を保存しました。');
    } catch (err: any) {
      console.error('Failed to save role permission policy:', err);
      toast.error(`権限ロール設定の保存に失敗しました: ${err.message || err}`);
    } finally {
      setIsSavingRolePermissionPolicy(false);
    }
  };

  const handleResetRolePermissionPolicy = async () => {
    if (!ensurePermission('manage_staff')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    if (!window.confirm('権限ロール設定を標準に戻しますか？')) return;

    setIsSavingRolePermissionPolicy(true);
    const previousPolicy = readRolePermissionPolicy();
    try {
      const resetPolicy = resetRolePermissionPolicy();
      setRolePermissionPolicy(resetPolicy);

      const auditOk = await logAuditAction(
        db,
        'facility_settings_update',
        `${buildRolePermissionPolicyAuditDetail(resetPolicy)} 標準設定へ戻しました。`
      );
      if (!auditOk) {
        writeRolePermissionPolicy(previousPolicy);
        setRolePermissionPolicy(previousPolicy);
        throw new Error('権限ロール設定リセットの監査ログ記録に失敗したため、変更を取り消しました。');
      }

      toast.success('権限ロール設定を標準に戻しました。');
    } catch (err: any) {
      console.error('Failed to reset role permission policy:', err);
      toast.error(`権限ロール設定のリセットに失敗しました: ${err.message || err}`);
    } finally {
      setIsSavingRolePermissionPolicy(false);
    }
  };

  const handleMedicationInfoTemplateFormChange = <K extends keyof MedicationInfoTemplateForm>(
    field: K,
    value: MedicationInfoTemplateForm[K]
  ) => {
    const startsNewRevision = !!selectedMedicationInfoTemplate
      && selectedMedicationInfoTemplate.status !== 'draft'
      && field !== 'status'
      && field !== 'needsReviewReason';
    setMedicationInfoTemplateForm((prev) => ({
      ...prev,
      [field]: value,
      ...(startsNewRevision ? { status: 'draft' as const } : {})
    }));
  };

  const handleNewMedicationInfoTemplate = () => {
    setSelectedMedicationInfoTemplateId('');
    setMedicationInfoTemplateForm(createEmptyMedicationInfoTemplateForm());
  };

  const handleSelectMedicationInfoTemplate = (template: PatientMedicationInfoTemplate) => {
    setSelectedMedicationInfoTemplateId(template.templateId);
    setMedicationInfoTemplateForm(medicationInfoTemplateToForm(template));
  };

  const buildMedicationInfoTemplatePayload = (
    statusOverride?: PatientMedicationInfoTemplateStatus
  ): PatientMedicationInfoTemplate => {
    const now = new Date().toISOString();
    const existingTemplate = selectedMedicationInfoTemplate;
    const status = statusOverride || medicationInfoTemplateForm.status;
    const drugCode = medicationInfoTemplateForm.drugCode.trim();
    const shouldFork = shouldForkPatientMedicationInfoTemplate(existingTemplate, status);
    const templateId = shouldFork
      ? makeMedicationInfoTemplateId(drugCode)
      : medicationInfoTemplateForm.templateId.trim() || makeMedicationInfoTemplateId(drugCode);
    const payload: PatientMedicationInfoTemplate = {
      templateId,
      drugCode,
      drugName: medicationInfoTemplateForm.drugName.trim(),
      status,
      createdAt: shouldFork ? now : existingTemplate?.createdAt || now,
      updatedAt: now
    };

    const genericName = trimOrUndefined(medicationInfoTemplateForm.genericName);
    const sideEffectText = trimOrUndefined(medicationInfoTemplateForm.sideEffectText);
    const counselingText = trimOrUndefined(medicationInfoTemplateForm.counselingText);
    const sourceUrl = trimOrUndefined(medicationInfoTemplateForm.sourceUrl);
    const sourceRevisionDate = trimOrUndefined(medicationInfoTemplateForm.sourceRevisionDate);
    const sourceHash = trimOrUndefined(medicationInfoTemplateForm.sourceHash);
    const needsReviewReason = trimOrUndefined(medicationInfoTemplateForm.needsReviewReason);

    if (genericName) payload.genericName = genericName;
    if (sideEffectText) payload.sideEffectText = sideEffectText;
    if (counselingText) payload.counselingText = counselingText;
    payload.sourceType = medicationInfoTemplateForm.sourceType;
    if (sourceUrl) payload.sourceUrl = sourceUrl;
    if (sourceRevisionDate) payload.sourceRevisionDate = sourceRevisionDate;
    if (sourceHash) payload.sourceHash = sourceHash;
    if (needsReviewReason) payload.needsReviewReason = needsReviewReason;
    if (status === 'approved') {
      payload.reviewerId = currentUser.userId;
      payload.approvedAt = now;
    }

    return payload;
  };

  const currentMedicationInfoApprovalIssues = getPatientMedicationInfoApprovalIssues(
    buildMedicationInfoTemplatePayload('approved')
  );
  const currentMedicationInfoTemplateHasContentChanges = !!selectedMedicationInfoTemplate
    && hasPatientMedicationInfoTemplateContentChanges(
      selectedMedicationInfoTemplate,
      buildMedicationInfoTemplatePayload()
    );
  const isEditingImmutableMedicationInfoRevision = !!selectedMedicationInfoTemplate
    && selectedMedicationInfoTemplate.status !== 'draft'
    && currentMedicationInfoTemplateHasContentChanges;

  const validateMedicationInfoTemplateForStatus = (status: PatientMedicationInfoTemplateStatus): boolean => {
    if (!medicationInfoTemplateForm.drugCode.trim()) {
      toast.error('薬品コードを入力してください。');
      return false;
    }
    if (!medicationInfoTemplateForm.drugName.trim()) {
      toast.error('薬品名を入力してください。');
      return false;
    }
    if (status === 'needs_review' && !medicationInfoTemplateForm.needsReviewReason.trim()) {
      toast.error('要再確認にする理由を入力してください。');
      return false;
    }
    if ((status === 'needs_review' || status === 'retired') && isEditingImmutableMedicationInfoRevision) {
      toast.error('承認済み・要再確認・廃止版の本文や参照元を変更したまま状態だけを更新できません。新版として下書き保存してください。');
      return false;
    }
    if (status === 'approved') {
      if (currentMedicationInfoApprovalIssues.length > 0) {
        toast.error(`承認できません: ${currentMedicationInfoApprovalIssues.map((issue) => issue.message).join('、')}`);
        return false;
      }
    }
    return true;
  };

  const handleSaveMedicationInfoTemplate = async (statusOverride?: PatientMedicationInfoTemplateStatus) => {
    if (!ensurePermission('manage_facility_settings')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    const targetStatus = statusOverride || medicationInfoTemplateForm.status;
    if (!validateMedicationInfoTemplateForStatus(targetStatus)) return;

    setIsSavingMedicationInfoTemplate(true);
    let previousTemplatesById: Map<string, PatientMedicationInfoTemplate | undefined> | null = null;
    let attemptedWriteTemplateIds: string[] = [];
    try {
      const payload = buildMedicationInfoTemplatePayload(targetStatus);
      const approvalWriteSet = targetStatus === 'approved'
        ? buildPatientMedicationInfoApprovalWriteSet(payload, medicationInfoTemplates, payload.updatedAt)
        : { writes: [payload], supersededTemplateIds: [] };
      attemptedWriteTemplateIds = approvalWriteSet.writes.map((template) => template.templateId);
      const previousEntries = await Promise.all(approvalWriteSet.writes.map(async (template) => {
        const previousDoc = await db.patient_medication_info_templates.findOne(template.templateId).exec();
        return [
          template.templateId,
          previousDoc?.toJSON() as PatientMedicationInfoTemplate | undefined
        ] as const;
      }));
      previousTemplatesById = new Map(previousEntries);

      const upsertResult = await db.patient_medication_info_templates.bulkUpsert(approvalWriteSet.writes);
      if (upsertResult.error.length > 0) {
        throw new Error(`${upsertResult.error.length}件の薬情テンプレ保存に失敗しました。`);
      }

      const auditOk = await logAuditAction(
        db,
        'patient_medication_info_template',
        `薬情テンプレ${MEDICATION_INFO_TEMPLATE_STATUS_LABELS[targetStatus]}: ${payload.drugName} (${payload.drugCode}) / テンプレ ${payload.templateId} / 状態 ${MEDICATION_INFO_TEMPLATE_STATUS_LABELS[targetStatus]} / 参照元 ${MEDICATION_INFO_SOURCE_TYPE_LABELS[payload.sourceType || 'pharmacy_authored']} / 版日 ${payload.sourceRevisionDate || '未入力'} / 旧承認版廃止 ${approvalWriteSet.supersededTemplateIds.length}件`
      );
      if (!auditOk) {
        throw new Error('薬情テンプレ保存の監査ログ記録に失敗したため、保存を取り消しました。');
      }

      const templates = await refreshMedicationInfoTemplates();
      const savedTemplate = templates.find((template) => template.templateId === payload.templateId) || payload;
      setSelectedMedicationInfoTemplateId(savedTemplate.templateId);
      setMedicationInfoTemplateForm(medicationInfoTemplateToForm(savedTemplate));
      await refreshAuditEvidence();
      toast.success(`薬情テンプレを${MEDICATION_INFO_TEMPLATE_STATUS_LABELS[targetStatus]}で保存しました。`);
    } catch (err: any) {
      if (previousTemplatesById) {
        try {
          const previousTemplates = Array.from(previousTemplatesById.values()).filter(
            (template): template is PatientMedicationInfoTemplate => !!template
          );
          if (previousTemplates.length > 0) {
            await db.patient_medication_info_templates.bulkUpsert(previousTemplates);
          }
          const newTemplateIds = attemptedWriteTemplateIds.filter((templateId) => !previousTemplatesById?.get(templateId));
          for (const templateId of newTemplateIds) {
            const savedDoc = await db.patient_medication_info_templates.findOne(templateId).exec();
            if (savedDoc) await savedDoc.remove();
          }
        } catch (rollbackError) {
          console.error('Failed to roll back patient medication info template writes:', rollbackError);
        }
      }
      console.error('Failed to save patient medication info template:', err);
      toast.error(`薬情テンプレを保存できませんでした: ${err.message || err}`);
    } finally {
      setIsSavingMedicationInfoTemplate(false);
    }
  };

  const handleUsePmdaMedicationInfoSearchUrl = () => {
    const drugName = medicationInfoTemplateForm.drugName.trim() || medicationInfoTemplateForm.genericName.trim();
    if (!drugName) {
      toast.info('先に薬品名を入力してください。');
      return;
    }
    handleMedicationInfoTemplateFormChange('sourceUrl', buildPmdaMedicationSearchUrl(drugName));
    if (medicationInfoTemplateForm.sourceType === 'pharmacy_authored') {
      handleMedicationInfoTemplateFormChange('sourceType', 'pmda_insert');
    }
  };

  const handleApplyMedicationInfoSafetyDraft = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    const drugCode = medicationInfoTemplateForm.drugCode.trim();
    const drugName = medicationInfoTemplateForm.drugName.trim();
    const genericName = medicationInfoTemplateForm.genericName.trim();
    if (!drugCode || !drugName) {
      toast.info('先に薬品コードと薬品名を入力してください。');
      return;
    }

    const hasExistingSafetyText = [
      medicationInfoTemplateForm.sideEffectText,
      medicationInfoTemplateForm.counselingText
    ].some((value) => value.trim());
    if (hasExistingSafetyText && !window.confirm('副作用・使用上の注意の入力済み内容を下書き案で上書きしますか？')) {
      return;
    }

    setIsBuildingMedicationInfoSafetyDraft(true);
    try {
      const searchNames = [drugName, genericName].filter(Boolean);
      const matchesByName = await findDrugInfosByDrugNames(searchNames);
      const matchedDrugInfo = searchNames
        .flatMap((name) => matchesByName.get(name) || [])
        .find((info) => extractDrugCodeFromDrugInfoId(info.id) === drugCode)
        || searchNames.flatMap((name) => matchesByName.get(name) || [])[0]
        || null;
      const draft = buildPatientMedicationInfoSafetyDraft({
        drugCode,
        drugName,
        genericName,
        drugInfo: matchedDrugInfo
      });
      setMedicationInfoTemplateForm((prev) => ({
        ...prev,
        status: prev.status === 'approved' ? 'draft' : prev.status,
        sideEffectText: draft.sideEffectText,
        counselingText: draft.usageCautionText,
        sourceType: draft.sourceType,
        sourceHash: draft.sourceHash,
        needsReviewReason: draft.needsReviewReason
      }));
      toast.success(matchedDrugInfo
        ? '副作用・使用上の注意の下書き案を反映しました。'
        : '一致する参照データがないため、汎用の副作用・使用上の注意案を反映しました。');
    } catch (error) {
      console.error('Failed to build medication info safety draft:', error);
      toast.error('副作用・使用上の注意案を作成できませんでした。');
    } finally {
      setIsBuildingMedicationInfoSafetyDraft(false);
    }
  };

  const handleExportMedicationInfoSafetyDraftCsv = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    setIsExportingMedicationInfoSafetyDraftCsv(true);
    try {
      const generatedAt = new Date();
      const drugInfos = await loadDrugInfoReferenceData();
      const templates = drugInfos.map((drugInfo) => buildPatientMedicationInfoSafetyDraftTemplate({
        drugCode: extractDrugCodeFromDrugInfoId(drugInfo.id),
        drugName: drugInfo.drugName,
        genericName: drugInfo.genericName,
        drugInfo,
        generatedAt
      }));
      const fileName = makePatientMedicationInfoSafetyDraftCsvFileName(generatedAt);
      const csv = buildPatientMedicationInfoTemplateCsv(templates);
      downloadTextFile(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8');
      if (db) {
        await logAuditAction(
          db,
          'patient_medication_info_template',
          `薬情テンプレ副作用・使用上注意案CSV書出: ${fileName} / ${templates.length}件 / 承認情報なし`
        );
      }
      toast.success(`副作用・使用上の注意案CSVを${templates.length.toLocaleString()}件書き出しました。`);
    } catch (error: any) {
      console.error('Failed to export medication info safety draft CSV:', error);
      toast.error(`副作用・使用上の注意案CSVを書き出せませんでした: ${error.message || error}`);
    } finally {
      setIsExportingMedicationInfoSafetyDraftCsv(false);
    }
  };

  const handleExportMedicationInfoCsv = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    const latestTemplatesByDrugCode = new Map<string, PatientMedicationInfoTemplate>();
    for (const template of sortMedicationInfoTemplates(medicationInfoTemplates)) {
      if (template.status === 'retired' || latestTemplatesByDrugCode.has(template.drugCode)) continue;
      latestTemplatesByDrugCode.set(template.drugCode, template);
    }
    const templates = Array.from(latestTemplatesByDrugCode.values());
    const fileName = makePatientMedicationInfoCsvFileName();
    const csv = buildPatientMedicationInfoTemplateCsv(templates);
    downloadTextFile(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8');
    if (db) {
      await logAuditAction(
        db,
        'patient_medication_info_template',
        `薬情テンプレCSV書出: ${fileName} / ${templates.length}件 / 承認情報を除外`
      );
    }
    toast.success(`薬情テンプレCSVを${templates.length}件書き出しました。`);
  };

  const handleImportMedicationInfoCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    if (!selectedFile) return;
    if (!ensurePermission('manage_facility_settings')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsImportingMedicationInfoCsv(true);
    setMedicationInfoCsvImportSummary(null);
    let previousTemplatesById: Map<string, PatientMedicationInfoTemplate | undefined> | null = null;
    let attemptedTemplateIds: string[] = [];
    try {
      const parsed = parsePatientMedicationInfoTemplateCsv(await selectedFile.text());
      const errors = parsed.issues.filter((issue) => issue.severity === 'error');
      if (errors.length > 0) {
        const summary = errors.slice(0, 3).map((issue) => (
          `${issue.rowNumber ? `${issue.rowNumber}行目: ` : ''}${issue.message}`
        )).join(' / ');
        throw new Error(`${summary}${errors.length > 3 ? ` / ほか${errors.length - 3}件` : ''}`);
      }
      if (parsed.drafts.length === 0) {
        throw new Error('取り込める薬情テンプレがありません。');
      }
      if (!window.confirm(`${parsed.drafts.length}件を下書きとして取り込みます。承認済み版は変更しません。`)) {
        return;
      }

      const currentTemplates = await refreshMedicationInfoTemplates();
      const editableDraftByDrugCode = new Map<string, PatientMedicationInfoTemplate>();
      for (const template of currentTemplates) {
        if (template.status === 'draft' && !editableDraftByDrugCode.has(template.drugCode)) {
          editableDraftByDrugCode.set(template.drugCode, template);
        }
      }
      const existingIds = new Set(currentTemplates.map((template) => template.templateId));
      const importStartedAt = Date.now();
      const now = new Date(importStartedAt).toISOString();
      const writes = parsed.drafts.map((draft, index): PatientMedicationInfoTemplate => {
        const existingDraft = editableDraftByDrugCode.get(draft.drugCode);
        let templateId = existingDraft?.templateId;
        let idOffset = index;
        while (!templateId) {
          const candidate = makeMedicationInfoTemplateId(draft.drugCode, new Date(importStartedAt + idOffset));
          if (!existingIds.has(candidate)) {
            templateId = candidate;
            existingIds.add(candidate);
          }
          idOffset += parsed.drafts.length;
        }
        const template: PatientMedicationInfoTemplate = {
          templateId,
          drugCode: draft.drugCode,
          drugName: draft.drugName,
          status: 'draft',
          sourceType: draft.sourceType,
          createdAt: existingDraft?.createdAt || now,
          updatedAt: now
        };
        if (draft.genericName) template.genericName = draft.genericName;
        if (draft.counselingText) template.counselingText = draft.counselingText;
        if (draft.sideEffectText) template.sideEffectText = draft.sideEffectText;
        if (draft.sourceUrl) template.sourceUrl = draft.sourceUrl;
        if (draft.sourceRevisionDate) template.sourceRevisionDate = draft.sourceRevisionDate;
        if (draft.sourceHash) template.sourceHash = draft.sourceHash;
        return template;
      });

      attemptedTemplateIds = writes.map((template) => template.templateId);
      const currentTemplatesById = new Map(currentTemplates.map((template) => [template.templateId, template]));
      previousTemplatesById = new Map(writes.map((template) => [
        template.templateId,
        currentTemplatesById.get(template.templateId)
      ]));

      for (let start = 0; start < writes.length; start += 500) {
        const result = await db.patient_medication_info_templates.bulkUpsert(writes.slice(start, start + 500));
        if (result.error.length > 0) {
          throw new Error(`${result.error.length}件の書き込みに失敗しました。`);
        }
      }
      const auditOk = await logAuditAction(
        db,
        'patient_medication_info_template',
        `薬情テンプレCSV下書き取込: ${selectedFile.name} / ${writes.length}件 / 承認準備完了 ${parsed.readyForApprovalCount}件 / 警告 ${parsed.issues.filter((issue) => issue.severity === 'warning').length}件 / 承認情報なし`
      );
      if (!auditOk) {
        throw new Error('監査ログ記録に失敗したため、取り込みを取り消しました。');
      }

      const templates = await refreshMedicationInfoTemplates();
      const firstImportedTemplate = templates.find((template) => template.templateId === writes[0]?.templateId);
      if (firstImportedTemplate) handleSelectMedicationInfoTemplate(firstImportedTemplate);
      setMedicationInfoCsvImportSummary({
        fileName: selectedFile.name,
        importedCount: writes.length,
        readyForApprovalCount: parsed.readyForApprovalCount,
        warningCount: parsed.issues.filter((issue) => issue.severity === 'warning').length,
        importedAt: new Date().toISOString()
      });
      await refreshAuditEvidence();
      toast.success(`${writes.length}件を下書きとして取り込みました。承認準備完了は${parsed.readyForApprovalCount}件です。`);
    } catch (error: any) {
      if (previousTemplatesById) {
        try {
          const previousTemplates = Array.from(previousTemplatesById.values()).filter(
            (template): template is PatientMedicationInfoTemplate => !!template
          );
          for (let start = 0; start < previousTemplates.length; start += 500) {
            await db.patient_medication_info_templates.bulkUpsert(previousTemplates.slice(start, start + 500));
          }
          const newTemplateIds = attemptedTemplateIds.filter((templateId) => !previousTemplatesById?.get(templateId));
          for (const templateId of newTemplateIds) {
            const savedDoc = await db.patient_medication_info_templates.findOne(templateId).exec();
            if (savedDoc) await savedDoc.remove();
          }
        } catch (rollbackError) {
          console.error('Failed to roll back medication info CSV import:', rollbackError);
        }
      }
      console.error('Failed to import medication info CSV:', error);
      toast.error(`薬情テンプレCSVを取り込めませんでした: ${error.message || error}`);
    } finally {
      setIsImportingMedicationInfoCsv(false);
    }
  };

  const handleSettingsChange = <K extends keyof FacilitySettings>(field: K, value: FacilitySettings[K]) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleApplyAiQualityRecommendation = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    const review = buildAiSuggestionFeedbackMonthlyReview(auditLogs, new Date(), {
      currentStoreName: settings.pharmacyName || '自店',
      currentStoreCode: settings.pharmacyCode || undefined,
      currentAiAssistMode: normalizeAiAssistMode(settings.aiAssistMode)
    });
    const previousMode = normalizeAiAssistMode(settings.aiAssistMode);
    const recommendedMode = review.qualityGate.recommendedMode;
    if (review.qualityGate.modeAlignment !== 'change_required') {
      toast.info('現在のAI補助モードは品質ゲートの推奨以上に安全です。');
      return;
    }

    setIsApplyingAiQualityMode(true);
    try {
      const doc = await db.facility_settings.findOne('default').exec();
      if (!doc) {
        throw new Error('施設設定が見つかりません。');
      }
      await doc.patch({ aiAssistMode: recommendedMode });
      const auditOk = await logAuditAction(
        db,
        'facility_settings_update',
        `AI補助品質ゲート反映: 「${AI_ASSIST_MODE_LABELS[previousMode]}」から「${AI_ASSIST_MODE_LABELS[recommendedMode]}」へ変更 / 判定 ${review.qualityGate.statusLabel} / 高信頼度却下 ${review.qualityGate.highConfidenceRejectedCount}件 / 却下率 ${review.qualityGate.rejectionRate}%`
      );
      if (!auditOk) {
        await doc.patch({ aiAssistMode: previousMode });
        throw new Error('監査ログ記録に失敗したため、AI補助モードを元に戻しました。');
      }

      setSettings((previous) => ({ ...previous, aiAssistMode: recommendedMode }));
      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map((item) => item.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`AI補助を「${AI_ASSIST_MODE_LABELS[recommendedMode]}」へ変更しました。`);
    } catch (error: any) {
      console.error('Failed to apply AI quality gate recommendation:', error);
      toast.error(`AI補助モードを変更できませんでした: ${error.message || error}`);
    } finally {
      setIsApplyingAiQualityMode(false);
    }
  };

  const handleOfficialFeeCodeChange = (key: OfficialFeeCodeOverrideKey, value: string) => {
    const normalized = value.replace(/\D/g, '').slice(0, 9);
    setSettings(prev => ({
      ...prev,
      officialFeeCodeOverrides: {
        ...(prev.officialFeeCodeOverrides || {}),
        [key]: normalized
      }
    }));
  };

  const handleExportOfficialFeeCodeCsv = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    const fileName = makeOfficialFeeCodeOverrideCsvFileName();
    const csv = buildOfficialFeeCodeOverrideTemplateCsv(settings.officialFeeCodeOverrides || {});
    downloadTextFile(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8');
    const configuredCount = Object.values(settings.officialFeeCodeOverrides || {})
      .filter((value) => /^\d{9}$/.test(String(value || '').trim()))
      .length;
    if (db) {
      await logAuditAction(
        db,
        'facility_settings_update',
        `公式算定コードCSVひな形書出: ${fileName} / 設定済み ${configuredCount}件`
      );
    }
    toast.success('公式算定コードCSVを書き出しました。');
  };

  const handleImportOfficialFeeCodeCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    if (!selectedFile) return;
    if (!ensurePermission('manage_facility_settings')) return;

    setIsImportingOfficialFeeCodeCsv(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const unicodeArray = encoding.convert(new Uint8Array(buffer), { to: 'UNICODE', from: 'AUTO' });
      const csvText = encoding.codeToString(unicodeArray as number[]);
      const parsed = parseOfficialFeeCodeOverrideCsv(csvText);
      const errors = parsed.issues.filter((issue) => issue.severity === 'error');
      if (errors.length > 0) {
        toast.error(`公式算定コードCSVを確認してください（エラー${errors.length}件）。${errors[0].message}`);
        return;
      }

      setSettings(prev => ({
        ...prev,
        officialFeeCodeOverrides: {
          ...(prev.officialFeeCodeOverrides || {}),
          ...parsed.overrides
        }
      }));
      const warningSuffix = parsed.skippedCount > 0 ? ` / 読み飛ばし ${parsed.skippedCount}行` : '';
      toast.success(`公式算定コードCSVを反映しました（設定 ${parsed.importedCount}件、空欄 ${parsed.clearedCount}件${warningSuffix}）。`);
    } catch (error: any) {
      console.error('Failed to import official fee code CSV:', error);
      toast.error(`公式算定コードCSVを読み込めませんでした: ${error.message || error}`);
    } finally {
      setIsImportingOfficialFeeCodeCsv(false);
    }
  };

  const handleReviewOfficialFeeCodeMasterCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    if (!selectedFile) return;
    if (!ensurePermission('manage_facility_settings')) return;

    setIsReviewingOfficialFeeCodeMasterCsv(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const unicodeArray = encoding.convert(new Uint8Array(buffer), { to: 'UNICODE', from: 'AUTO' });
      const csvText = encoding.codeToString(unicodeArray as number[]);
      const proposal = buildOfficialFeeCodeMasterProposalFromCsv(csvText);
      const errors = proposal.issues.filter((issue) => issue.severity === 'error');
      if (errors.length > 0) {
        setOfficialFeeCodeMasterProposal(null);
        setOfficialFeeCodeMasterFileName('');
        toast.error(`公式表CSVを確認してください。${errors[0].message}`);
        return;
      }

      setOfficialFeeCodeMasterProposal(proposal);
      setOfficialFeeCodeMasterFileName(selectedFile.name);
      if (proposal.matchedCount > 0) {
        toast.success(`公式表CSVから候補を作成しました（候補 ${proposal.matchedCount}件、未一致 ${proposal.unresolvedCount}件）。`);
      } else {
        toast.warning('公式表CSVから反映できる候補が見つかりませんでした。');
      }
    } catch (error: any) {
      console.error('Failed to review official fee code master CSV:', error);
      toast.error(`公式表CSVを読み込めませんでした: ${error.message || error}`);
    } finally {
      setIsReviewingOfficialFeeCodeMasterCsv(false);
    }
  };

  const handleApplyOfficialFeeCodeMasterProposal = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    if (!officialFeeCodeMasterProposal || officialFeeCodeMasterProposal.matchedCount === 0) {
      toast.info('反映できる公式算定コード候補がありません。');
      return;
    }

    setSettings(prev => ({
      ...prev,
      officialFeeCodeOverrides: {
        ...(prev.officialFeeCodeOverrides || {}),
        ...officialFeeCodeMasterProposal.overrides
      }
    }));
    if (db) {
      await logAuditAction(
        db,
        'facility_settings_update',
        `公式算定コード公式表CSV候補反映: ${officialFeeCodeMasterFileName || 'ファイル名未取得'} / 候補 ${officialFeeCodeMasterProposal.matchedCount}件 / 未一致 ${officialFeeCodeMasterProposal.unresolvedCount}件 / 重複 ${officialFeeCodeMasterProposal.duplicateCount}件`
      );
    }
    toast.success(`公式算定コード候補を${officialFeeCodeMasterProposal.matchedCount}件反映しました。保存すると設定に残ります。`);
  };

  const handleExportOfficialFeeCodeMasterProposalReviewCsv = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    if (!officialFeeCodeMasterProposal) {
      toast.info('先に公式表CSVを照合してください。');
      return;
    }

    const fileName = makeOfficialFeeCodeMasterProposalReviewCsvFileName();
    const csv = buildOfficialFeeCodeMasterProposalReviewCsv(
      officialFeeCodeMasterProposal,
      officialFeeCodeMasterFileName || '公式表CSV'
    );
    downloadTextFile(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8');
    if (db) {
      await logAuditAction(
        db,
        'facility_settings_update',
        `公式算定コード照合結果CSV書出: ${fileName} / 元ファイル ${officialFeeCodeMasterFileName || 'ファイル名未取得'} / 候補 ${officialFeeCodeMasterProposal.matchedCount}件 / 未一致 ${officialFeeCodeMasterProposal.unresolvedCount}件 / 重複 ${officialFeeCodeMasterProposal.duplicateCount}件`
      );
    }
    toast.success('公式算定コードの照合結果CSVを書き出しました。');
  };

  const handleExportInitialSetupChecklistCsv = async () => {
    const generatedAt = new Date();
    const checklist = buildInitialSetupChecklist({
      settings,
      staff: staffList,
      auditLogs,
      generatedAt
    });
    const fileName = makeInitialSetupChecklistCsvFileName(generatedAt);
    downloadTextFile(fileName, `\ufeff${buildInitialSetupChecklistCsv(checklist)}`, 'text/csv;charset=utf-8');

    if (db && canUserPerform(getCurrentUser(), 'view_audit_logs')) {
      try {
        await logAuditAction(
          db,
          'audit_export',
          `初回セットアップチェックリストCSVエクスポート: ${fileName} を書き出しました（判定: ${checklist.statusLabel}, 完了: ${checklist.completedCount}/${checklist.steps.length}）。`
        );
        const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
        const refreshedRows = refreshed.map(d => d.toJSON());
        setAuditLogs(refreshedRows);
        setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      } catch (error) {
        console.error('Failed to log initial setup checklist export:', error);
      }
    }

    toast.success(`初回セットアップチェックリストCSVを書き出しました（${checklist.statusLabel}）。`);
  };

  const handleCopyInitialSetupHandoffMemo = async () => {
    if (!navigator.clipboard?.writeText) {
      toast.error('このブラウザではクリップボードへコピーできません。チェックリストCSVを出力してください。');
      return;
    }

    const generatedAt = new Date();
    const checklist = buildInitialSetupChecklist({
      settings,
      staff: staffList,
      auditLogs,
      generatedAt
    });
    const memo = buildInitialSetupHandoffMemo(checklist);

    try {
      await navigator.clipboard.writeText(memo);
    } catch (error) {
      console.error('Failed to copy initial setup handoff memo:', error);
      toast.error('初回セットアップ引き継ぎメモのコピーに失敗しました。チェックリストCSVを出力してください。');
      return;
    }

    if (db && canUserPerform(getCurrentUser(), 'view_audit_logs')) {
      try {
        await logAuditAction(
          db,
          'audit_export',
          `初回セットアップ引き継ぎメモコピー: 判定 ${checklist.statusLabel}, 次作業 ${checklist.nextStep?.title || 'なし'}, 完了 ${checklist.completedCount}/${checklist.steps.length}。`
        );
        const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
        const refreshedRows = refreshed.map(d => d.toJSON());
        setAuditLogs(refreshedRows);
        setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      } catch (error) {
        console.error('Failed to log initial setup handoff memo copy:', error);
      }
    }

    toast.success(`初回セットアップ引き継ぎメモをコピーしました（${checklist.statusLabel}）。`);
  };

  const handleSaveSettings = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    if (!db) return;
    setIsSavingSettings(true);
    try {
      const doc = await db.facility_settings.findOne('default').exec();
      if (doc) {
        await doc.patch(settings);
      } else {
        await db.facility_settings.insert(settings);
      }
      const officialFeeCodeOverrideCount = Object.values(settings.officialFeeCodeOverrides || {})
        .filter((value) => /^\d{9}$/.test(String(value ?? '').trim()))
        .length;
      
      // 監査ログ
      await logAuditAction(
        db,
        'facility_settings_update',
        `施設基準設定変更: 薬局情報を「調剤基本料${settings.baseFeeCategory} 等、公式算定コード${officialFeeCodeOverrideCount}件、AI補助${AI_ASSIST_MODE_LABELS[normalizeAiAssistMode(settings.aiAssistMode)]}」に更新しました。`
      );

      toast.success('施設基準を保存しました。');
    } catch (error: any) {
      console.error('Failed to save facility settings securely:', error);
      toast.error('保存に失敗しました。');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const importDrugMasterFromSource = async (source: DrugMasterImportSource): Promise<boolean> => {
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return false;
    }

    try {
      let normalizedSourceUrl: string | undefined;
      try {
        normalizedSourceUrl = normalizeDrugMasterSourceUrl(source.sourceUrl ?? drugMasterSourceUrl);
      } catch (urlError: any) {
        toast.error(urlError.message || '更新元URLを確認してください。');
        return false;
      }
      const sourceUrlReview = reviewDrugMasterSourceUrl(normalizedSourceUrl);
      const sourceUrlReviewLabel = formatDrugMasterSourceUrlReview(sourceUrlReview);

      const sourceBytes = new Uint8Array(source.sourceBuffer);
      const zipExtraction = isDrugMasterZipUpload(source.sourceFileName, sourceBytes)
        ? await extractDrugMasterCsvFromZip(sourceBytes)
        : null;
      const csvBuffer = zipExtraction
        ? zipExtraction.csvBytes.buffer.slice(
          zipExtraction.csvBytes.byteOffset,
          zipExtraction.csvBytes.byteOffset + zipExtraction.csvBytes.byteLength
        ) as ArrayBuffer
        : source.sourceBuffer;
      const sourceFileType = zipExtraction ? 'zip' : 'csv';
      const sourceExtractionLabel = zipExtraction
        ? `ZIP展開 ${zipExtraction.csvFileName}（CSV候補 ${zipExtraction.csvEntryCount}件 / ZIP内 ${zipExtraction.entryCount}ファイル）`
        : 'CSV直接';
      const uint8Array = new Uint8Array(csvBuffer);

      const unicodeArray = encoding.convert(uint8Array, {
        to: 'UNICODE',
        from: 'SJIS'
      });

      const csvText = encoding.codeToString(unicodeArray as number[]);
      const parsedMasterCsv = parseDrugMasterUpdateCsv(csvText, { today: new Date() });
      const parseError = parsedMasterCsv.issues.find((issue) => issue.severity === 'error');
      if (parseError) {
        toast.error(parseError.message);
        return false;
      }
      if (parsedMasterCsv.rows.length === 0) {
        toast.error('医薬品マスターCSVに取り込める薬品行がありません。');
        return false;
      }

      let updatedCount = 0;
      let newCount = 0;
      let abolishedCount = 0;

      const layoutLabel = formatDrugMasterCsvLayoutLabel(parsedMasterCsv.layout);
      const columnDefinitionReview = buildDrugMasterColumnDefinitionReview(parsedMasterCsv.layout, parsedMasterCsv.maxColumnCount);
      const columnDefinitionReviewLabel = formatDrugMasterColumnDefinitionReview(columnDefinitionReview);
      if (!columnDefinitionReview.ok) {
        toast.error(`医薬品マスターCSVの列定義を確認できません。${columnDefinitionReviewLabel}`);
        return false;
      }
      const specificationRevisionReview = buildDrugMasterSpecificationRevisionReview();
      const specificationRevisionReviewLabel = formatDrugMasterSpecificationRevisionReview(specificationRevisionReview);
      if (!specificationRevisionReview.ok) {
        toast.error(`医薬品マスターの仕様PDF版チェックを確認できません。${specificationRevisionReviewLabel}`);
        return false;
      }
      const warningIssues = parsedMasterCsv.issues.filter((issue) => issue.severity === 'warning');
      if (warningIssues.length > 0) {
        toast.warning(`医薬品マスターCSVの一部行を確認してください（${warningIssues.length}件）。${warningIssues[0].message}`);
      }
      const sourceEvidence = await buildDrugMasterSourceEvidence({
        sourceFileName: source.sourceFileName,
        sourceFileType,
        extractedCsvFileName: zipExtraction?.csvFileName,
        archiveEntryCount: zipExtraction?.entryCount,
        csvEntryCount: zipExtraction?.csvEntryCount,
        sourceUrl: normalizedSourceUrl,
        fileSizeBytes: source.sourceSizeBytes,
        arrayBuffer: source.sourceBuffer,
        capturedAt: new Date(),
        layoutLabel,
        rowCount: parsedMasterCsv.rows.length,
        skippedRowCount: parsedMasterCsv.skippedRowCount,
        sourceUrlReviewLabel,
        specificationRevisionLabel: specificationRevisionReviewLabel,
        specificationSourceUrl: DRUG_MASTER_SPECIFICATION_SOURCE.url
      });
      const codes = new Set(parsedMasterCsv.rows.map((row) => row.code));

      // ⚡ Bolt: Fetch all existing drugs in a single query to avoid N+1 problem
      // RxQuery objects require .exec() to execute and return the Promise<Map> result
      const existingDrugsMap = await db.drugs.findByIds(Array.from(codes)).exec();
      const beforeRows: Partial<Drug>[] = Array.from(existingDrugsMap.values()).map((existingDrugDoc) => ({
        code: existingDrugDoc.code,
        name: existingDrugDoc.name,
        yjCode: existingDrugDoc.yjCode,
        isGeneric: existingDrugDoc.isGeneric,
        genericName: existingDrugDoc.genericName,
        isAbolished: existingDrugDoc.isAbolished,
        price: existingDrugDoc.price,
        stockQuantity: existingDrugDoc.stockQuantity,
        location: existingDrugDoc.location,
        isNarcotic: existingDrugDoc.isNarcotic,
        isPsychotropic: existingDrugDoc.isPsychotropic,
        isPoisonous: existingDrugDoc.isPoisonous,
        isHighRisk: existingDrugDoc.isHighRisk,
        documentUrl: existingDrugDoc.documentUrl
      }));

      const bulkUpsertMap = new Map<string, Drug>();
      const genericMakers = ['東和', '日医工', '沢井', 'サワイ', 'トーワ', 'タイヨー', '武田テバ', 'サンド', 'マイラン', 'あすか', '杏林', '高田', 'タカタ', 'ファイファイ', '明治', 'アメル', '大興', 'ケミファ', 'JG'];

      for (let i = 0; i < parsedMasterCsv.rows.length; i++) {
        const { code, name, price, yjCode, isAbolished } = parsedMasterCsv.rows[i];

        let targetDoc: Drug | null;
        if (bulkUpsertMap.has(code)) {
            // Already processed this code in the current batch, use the updated state
            targetDoc = bulkUpsertMap.get(code) || null;
        } else {
            const existingDrugDoc = existingDrugsMap.get(code);
            // ⚡ Bolt: Manually map primitive properties to avoid .toJSON() deep clone overhead in large loops
            targetDoc = existingDrugDoc ? {
                code: existingDrugDoc.code,
                name: existingDrugDoc.name,
                yjCode: existingDrugDoc.yjCode,
                isGeneric: existingDrugDoc.isGeneric,
                genericName: existingDrugDoc.genericName,
                isAbolished: existingDrugDoc.isAbolished,
                price: existingDrugDoc.price,
                stockQuantity: existingDrugDoc.stockQuantity,
                location: existingDrugDoc.location,
                isNarcotic: existingDrugDoc.isNarcotic,
                isPsychotropic: existingDrugDoc.isPsychotropic,
                isPoisonous: existingDrugDoc.isPoisonous,
                isHighRisk: existingDrugDoc.isHighRisk,
                documentUrl: existingDrugDoc.documentUrl
            } : null;
        }

        if (targetDoc) {
          bulkUpsertMap.set(code, {
            ...targetDoc,
            name: name || targetDoc.name,
            yjCode: yjCode || targetDoc.yjCode,
            isAbolished: isAbolished,
            price: price ?? targetDoc.price
          });
        } else {
          const isGeneric = name.includes('【般】') || name.startsWith('般）') || name.startsWith('【般】') || Boolean(yjCode && yjCode.length >= 12 && (yjCode.charAt(11) === '2' || yjCode.charAt(11) === '3' || yjCode.charAt(11) === '4')) || genericMakers.some(maker => name.includes(`「${maker}」`) || name.includes(`(${maker})`));
          const genericName = name.replace(/「.*?」|（.*?）/g, '').replace(/【般】/g, '').trim();

          bulkUpsertMap.set(code, {
            code,
            name: name || '不明な薬品',
            yjCode: yjCode || '',
            isGeneric: isGeneric,
            genericName: genericName || name || '',
            isAbolished: isAbolished,
            price: price
          });
        }
      }

      const afterRows = Array.from(bulkUpsertMap.values());
      const artifacts = buildDrugMasterUpdateArtifacts({
        sourceFileName: source.sourceFileName,
        beforeRows,
        afterRows,
        createdAt: new Date(),
        sourceEvidence
      });
      newCount = artifacts.summary.newCount;
      updatedCount = artifacts.summary.updatedCount;
      abolishedCount = artifacts.summary.abolishedCount;

      // ⚡ Bolt: Perform bulk upsert in a single operation
      // ⚡ Bolt: Use bulkUpsert to commit all changes in a single transaction
      const upsertResult = await db.drugs.bulkUpsert(afterRows);
      if (upsertResult.error.length > 0) {
        console.error('Failed to upsert some drug master records:', upsertResult.error);
        throw new Error(`${upsertResult.error.length}件の薬品マスタ更新に失敗しました。`);
      }

      const diffCsvFileName = makeDrugMasterDiffCsvFileName(artifacts.versionId);
      const rollbackFileName = makeDrugMasterRollbackFileName(artifacts.versionId);
      downloadTextFile(diffCsvFileName, `\ufeff${buildDrugMasterDiffCsv(artifacts)}`, 'text/csv;charset=utf-8');
      downloadTextFile(rollbackFileName, JSON.stringify(artifacts.rollback, null, 2), 'application/json;charset=utf-8');

      // 監査ログ
      await logAuditAction(
        db,
        'drug_master_update',
        `支払基金マスタ同期: 支払基金の最新医薬品マスターCSVからマスタを更新しました（版: ${artifacts.versionId}, 入力: ${sourceExtractionLabel}, 列定義: ${layoutLabel}, 列定義照合: ${columnDefinitionReviewLabel}, 仕様PDF版: ${specificationRevisionReviewLabel}, 公式URL確認: ${sourceUrlReviewLabel}, 取込行: ${parsedMasterCsv.rows.length}件, スキップ: ${parsedMasterCsv.skippedRowCount}件, 新規: ${newCount}件, 更新: ${updatedCount}件, 廃止: ${abolishedCount}件, ファイルサイズ: ${sourceEvidence.fileSizeBytes} bytes, SHA-256: ${sourceEvidence.sha256}, 更新元URL: ${sourceEvidence.sourceUrl || '未入力'}）。差分CSV ${diffCsvFileName} とロールバックJSON ${rollbackFileName} を書き出しました。`
      );

      toast.success(`更新完了（版 ${artifacts.versionId} / ${sourceExtractionLabel} / ${layoutLabel} / 列定義照合OK / 仕様PDF版OK / SHA-256記録済み）: 新規 ${newCount}件, 更新 ${updatedCount}件, 廃止 ${abolishedCount}件`);
      return true;
    } catch (error: any) {
      console.error('Failed to upload drug master securely:', error);
      toast.error(error?.message || 'マスタの更新に失敗しました。');
      return false;
    }
  };

  const handleUpload = async () => {
    if (!ensurePermission('update_drug_master')) return;
    if (!file) return;

    setIsUploading(true);

    try {
      const sourceBuffer = await file.arrayBuffer();
      const ok = await importDrugMasterFromSource({
        sourceFileName: file.name,
        sourceBuffer,
        sourceSizeBytes: file.size,
        sourceUrl: drugMasterSourceUrl
      });
      if (!ok) return;
      setFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const decodeDrugMasterHeader = (value: string | null): string => {
    if (!value) return '';
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const handleImportDrugMasterFromSourceUrl = async () => {
    if (!ensurePermission('update_drug_master')) return;
    if (!drugMasterSourceUrl.trim()) {
      toast.error('更新元URLを入力するか、支払基金マスター更新候補を選択してください。');
      return;
    }
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsImportingDrugMasterFromUrl(true);
    try {
      const response = await fetch(`/api/drug-master/official-file?url=${encodeURIComponent(drugMasterSourceUrl.trim())}`, { method: 'GET' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(payload.message || '公式ファイルを取得できませんでした。');
      }

      const sourceBuffer = await response.arrayBuffer();
      const sourceUrl = decodeDrugMasterHeader(response.headers.get('x-yakureki-source-url')) || drugMasterSourceUrl.trim();
      const sourceFileName = decodeDrugMasterHeader(response.headers.get('x-yakureki-file-name'))
        || sourceUrl.split('/').pop()
        || 'drug_master.csv';
      const ok = await importDrugMasterFromSource({
        sourceFileName,
        sourceBuffer,
        sourceSizeBytes: sourceBuffer.byteLength,
        sourceUrl
      });
      if (ok) {
        setDrugMasterSourceUrl(sourceUrl);
      }
    } catch (error: any) {
      toast.error(error?.message || '公式ファイルを取得して更新できませんでした。');
    } finally {
      setIsImportingDrugMasterFromUrl(false);
    }
  };

  const handleApplyDrugMasterRollback = async () => {
    if (!ensurePermission('update_drug_master')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    if (!rollbackFile) {
      toast.error('ロールバックJSONを選択してください。');
      return;
    }

    setIsRollingBackDrugMaster(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await rollbackFile.text());
      } catch (error) {
        toast.error('ロールバックJSONを読み取れませんでした。');
        return;
      }

      const validation = validateDrugMasterRollbackPayload(parsed);
      if (!validation.ok) {
        toast.error(validation.reason);
        return;
      }

      const payload = validation.payload;
      const confirmed = window.confirm(
        `医薬品マスターを版 ${payload.versionId} の更新前へ戻します。\n復元: ${payload.restoreRows.length}件 / 追加分の削除: ${payload.deleteCodes.length}件\n実行しますか？`
      );
      if (!confirmed) return;

      if (payload.restoreRows.length > 0) {
        const restoreResult = await db.drugs.bulkUpsert(payload.restoreRows);
        if (restoreResult.error.length > 0) {
          console.error('Failed to restore some drug master rollback records:', restoreResult.error);
          throw new Error(`${restoreResult.error.length}件の薬品マスター復元に失敗しました。`);
        }
      }

      let deletedCount = 0;
      for (const code of payload.deleteCodes) {
        const doc = await db.drugs.findOne(code).exec();
        if (doc) {
          await doc.remove();
          deletedCount++;
        }
      }

      await logAuditAction(
        db,
        'drug_master_update',
        `医薬品マスターロールバック: 版 ${payload.versionId}（${payload.sourceFileName}）の更新前へ戻しました（復元: ${payload.restoreRows.length}件, 追加削除: ${deletedCount}件）。`
      );

      toast.success(`医薬品マスターを版 ${payload.versionId} の更新前へ戻しました。`);
      setRollbackFile(null);
    } catch (error: any) {
      console.error('Failed to rollback drug master securely:', error);
      toast.error(`医薬品マスターのロールバックに失敗しました: ${error.message || error}`);
    } finally {
      setIsRollingBackDrugMaster(false);
    }
  };

  const auditIntegrityStatus = isCheckingAuditIntegrity
    ? '検証中'
    : auditIntegrity?.invalid
      ? '要確認'
      : auditIntegrity?.unsigned
        ? '未署名あり'
        : auditIntegrity
          ? '正常'
          : '未検証';
  const auditIntegrityColor = auditIntegrity?.invalid
    ? '#b91c1c'
    : auditIntegrity?.unsigned
      ? '#b45309'
      : auditIntegrity
        ? '#15803d'
        : '#64748b';
  const latestAuditHashPreview = auditIntegrity?.latestHash
    ? `${auditIntegrity.latestHash.slice(0, 12)}...${auditIntegrity.latestHash.slice(-8)}`
    : '-';
  const auditRetentionReview = buildAuditLogRetentionMonthlyReview(
    auditLogs,
    auditIntegrity ?? {
      total: auditLogs.length,
      signed: 0,
      unsigned: auditLogs.length,
      invalid: 0,
      isValid: auditLogs.length === 0
    }
  );
  const auditRetentionReviewColor = auditRetentionReview.status === 'complete'
    ? '#15803d'
    : auditRetentionReview.status === 'rejected'
      ? '#b91c1c'
      : '#b45309';
  const auditRetentionReviewBackground = auditRetentionReview.status === 'complete'
    ? '#f0fdf4'
    : auditRetentionReview.status === 'rejected'
      ? '#fef2f2'
      : '#fffbeb';
  const auditRetentionManagerReviewColor = auditRetentionReview.managerReviewStatus === 'approved'
    ? '#15803d'
    : auditRetentionReview.managerReviewStatus === 'returned'
      ? '#b91c1c'
      : '#b45309';
  const auditRetentionManagerReviewBackground = auditRetentionReview.managerReviewStatus === 'approved'
    ? '#f0fdf4'
    : auditRetentionReview.managerReviewStatus === 'returned'
      ? '#fef2f2'
      : '#fffbeb';
  const auditRetentionManagerReviewButtonLabel = auditRetentionReview.status === 'complete' && auditRetentionReview.returnReasons.length === 0
    ? '責任者承認'
    : '差し戻し記録';
  const latestRetentionJsonLabel = auditRetentionReview.latestAuditJsonExport
    ? `${auditRetentionReview.latestAuditJsonExport.dateLabel} ${auditRetentionReview.latestAuditJsonExport.fileName || 'ファイル名未記録'}`
    : '未出力';
  const latestRetentionLedgerLabel = auditRetentionReview.latestRetentionLedgerExport
    ? `${auditRetentionReview.latestRetentionLedgerExport.dateLabel} ${auditRetentionReview.latestRetentionLedgerExport.fileName || 'ファイル名未記録'}`
    : '未出力';
  const backupGenerationReview = buildBackupGenerationReview(auditLogs);
  const backupGenerationReviewColor = backupGenerationReview.status === 'pass'
    ? '#15803d'
    : backupGenerationReview.status === 'attention'
      ? '#b45309'
      : '#b91c1c';
  const backupGenerationReviewBackground = backupGenerationReview.status === 'pass'
    ? '#f0fdf4'
    : backupGenerationReview.status === 'attention'
      ? '#fffbeb'
      : '#fef2f2';
  const latestBackupGenerationLabel = backupGenerationReview.latestBackup
    ? `${backupGenerationReview.latestBackup.dateLabel} ${backupGenerationReview.latestBackup.fileName || 'ファイル名未記録'}`
    : '未記録';
  const latestBackupDrillLabel = backupGenerationReview.latestDrillAt
    ? `${new Date(backupGenerationReview.latestDrillAt).toLocaleString('ja-JP')}（${backupGenerationReview.drillAgeDays}日前）`
    : '未記録';
  const latestBackupExternalStorageLabel = backupGenerationReview.latestExternalStorage
    ? `${backupGenerationReview.latestExternalStorage.dateLabel} ${backupGenerationReview.latestExternalStorage.destinationName || '保存先未記録'}（${backupGenerationReview.latestExternalStorage.statusLabel}）`
    : '未記録';
  const backupScheduleReview = buildBackupScheduleReview(auditLogs, backupSchedulePolicy);
  const backupScheduleReviewColor = backupScheduleReview.status === 'pass'
    ? '#15803d'
    : backupScheduleReview.status === 'attention'
      ? '#b45309'
      : '#b91c1c';
  const backupScheduleReviewBackground = backupScheduleReview.status === 'pass'
    ? '#f0fdf4'
    : backupScheduleReview.status === 'attention'
      ? '#fffbeb'
      : '#fef2f2';
  const initialSetupChecklist = buildInitialSetupChecklist({
    settings,
    staff: staffList,
    auditLogs
  });
  const initialSetupStatusColor = initialSetupChecklist.status === 'complete'
    ? '#15803d'
    : initialSetupChecklist.status === 'attention'
      ? '#b45309'
      : '#b91c1c';
  const initialSetupStatusBackground = initialSetupChecklist.status === 'complete'
    ? '#f0fdf4'
    : initialSetupChecklist.status === 'attention'
      ? '#fffbeb'
      : '#fef2f2';
  const dailyClosingReview = buildOperationalClosingMonthlyReview(auditLogs, new Date(), {
    currentStoreName: settings.pharmacyName || '自店',
    currentStoreCode: settings.pharmacyCode || undefined
  });
  const dailyClosingReviewStatus = dailyClosingReview.approvalCount === 0
    ? '未記録'
    : dailyClosingReview.daysWithBlockers > 0
      ? '要フォロー'
      : '良好';
  const dailyClosingReviewColor = dailyClosingReview.approvalCount === 0
    ? '#64748b'
    : dailyClosingReview.daysWithBlockers > 0
      ? '#b45309'
      : '#15803d';
  const latestClosingHashPreview = dailyClosingReview.latestApproval?.integrityHash
    ? `${dailyClosingReview.latestApproval.integrityHash.slice(0, 10)}...${dailyClosingReview.latestApproval.integrityHash.slice(-6)}`
    : '-';
  const dailyClosingComparison = dailyClosingReview.previousMonthComparison;
  const dailyClosingComparisonColor = dailyClosingComparison.status === 'improved'
    ? '#15803d'
    : dailyClosingComparison.status === 'attention'
      ? '#b45309'
      : dailyClosingComparison.status === 'flat'
        ? '#475569'
        : '#64748b';
  const dailyClosingComparisonBackground = dailyClosingComparison.status === 'improved'
    ? '#f0fdf4'
    : dailyClosingComparison.status === 'attention'
      ? '#fffbeb'
      : '#f8fafc';
  const dailyClosingStoreBenchmarkColor = dailyClosingReview.storeBenchmark.status === 'leading'
    ? '#15803d'
    : dailyClosingReview.storeBenchmark.status === 'needs_attention'
      ? '#b45309'
      : '#64748b';
  const dailyClosingStoreBenchmarkBackground = dailyClosingReview.storeBenchmark.status === 'leading'
    ? '#f0fdf4'
    : dailyClosingReview.storeBenchmark.status === 'needs_attention'
      ? '#fffbeb'
      : '#f8fafc';
  const aiSuggestionFeedbackReview = buildAiSuggestionFeedbackMonthlyReview(auditLogs, new Date(), {
    currentStoreName: settings.pharmacyName || '自店',
    currentStoreCode: settings.pharmacyCode || undefined,
    currentAiAssistMode: normalizeAiAssistMode(settings.aiAssistMode)
  });
  const aiSuggestionFeedbackColor = aiSuggestionFeedbackReview.status === 'ready'
    ? '#15803d'
    : aiSuggestionFeedbackReview.status === 'needs_feedback'
      ? '#b45309'
      : '#64748b';
  const aiSuggestionFeedbackBackground = aiSuggestionFeedbackReview.status === 'ready'
    ? '#f0fdf4'
    : aiSuggestionFeedbackReview.status === 'needs_feedback'
      ? '#fffbeb'
      : '#f8fafc';
  const aiSuggestionQualityGateColor = aiSuggestionFeedbackReview.qualityGate.status === 'continue'
    ? '#15803d'
    : aiSuggestionFeedbackReview.qualityGate.status === 'stop'
      ? '#b91c1c'
      : '#b45309';
  const aiSuggestionQualityGateBackground = aiSuggestionFeedbackReview.qualityGate.status === 'continue'
    ? '#f0fdf4'
    : aiSuggestionFeedbackReview.qualityGate.status === 'stop'
      ? '#fef2f2'
      : '#fffbeb';
  const soapDraftFeedbackColor = aiSuggestionFeedbackReview.soapDraftSummary.status === 'ready'
    ? '#15803d'
    : aiSuggestionFeedbackReview.soapDraftSummary.status === 'needs_review'
      ? '#b45309'
      : '#64748b';
  const soapDraftFeedbackBackground = aiSuggestionFeedbackReview.soapDraftSummary.status === 'ready'
    ? '#f0fdf4'
    : aiSuggestionFeedbackReview.soapDraftSummary.status === 'needs_review'
      ? '#fffbeb'
      : '#f8fafc';
  const storeFeedbackColor = aiSuggestionFeedbackReview.storeComparison.status === 'leading'
    ? '#15803d'
    : aiSuggestionFeedbackReview.storeComparison.status === 'needs_attention'
      ? '#b45309'
      : '#64748b';
  const storeFeedbackBackground = aiSuggestionFeedbackReview.storeComparison.status === 'leading'
    ? '#f0fdf4'
    : aiSuggestionFeedbackReview.storeComparison.status === 'needs_attention'
      ? '#fffbeb'
      : '#f8fafc';

  return (
    <div className="settings-container">
      <div className="page-header">
        <h1>Settings / 設定</h1>
        <p className="text-muted">システムの設定とマスタ管理</p>
      </div>

      <section className="initial-setup-panel" aria-label="初回セットアップウィザード" data-testid="initial-setup-panel">
        <div className="initial-setup-head">
          <div>
            <h2>初回セットアップ</h2>
            <p className="section-desc">新規店舗のテスト運用開始に必要な設定、移行、請求、印刷、バックアップ訓練を確認します。</p>
          </div>
          <div className="initial-setup-actions">
            <span
              className="initial-setup-status"
              style={{
                color: initialSetupStatusColor,
                background: initialSetupStatusBackground
              }}
            >
              {initialSetupChecklist.statusLabel}
            </span>
            {initialSetupChecklist.nextStep && (
              <button
                type="button"
                className="btn-primary flex-center gap-2"
                data-testid="initial-setup-next-step-button"
                onClick={() => handleOpenInitialSetupStep(initialSetupChecklist.nextStep!)}
                disabled={!canUserPerform(currentUser, INITIAL_SETUP_TAB_PERMISSIONS[initialSetupChecklist.nextStep.tab])}
                title={!canUserPerform(currentUser, INITIAL_SETUP_TAB_PERMISSIONS[initialSetupChecklist.nextStep.tab])
                  ? getPermissionDeniedMessage(currentUser, INITIAL_SETUP_TAB_PERMISSIONS[initialSetupChecklist.nextStep.tab])
                  : undefined}
              >
                <CheckCircle size={16} aria-hidden="true" />
                <span>{initialSetupChecklist.nextStep.actionLabel}</span>
              </button>
            )}
            <button
              type="button"
              className="btn-secondary flex-center gap-2"
              data-testid="initial-setup-checklist-csv-button"
              onClick={handleExportInitialSetupChecklistCsv}
            >
              <Download size={16} aria-hidden="true" />
              <span>チェックリストCSV</span>
            </button>
            <button
              type="button"
              className="btn-secondary flex-center gap-2"
              data-testid="initial-setup-handoff-memo-button"
              onClick={handleCopyInitialSetupHandoffMemo}
            >
              <FileText size={16} aria-hidden="true" />
              <span>引き継ぎメモ</span>
            </button>
          </div>
        </div>

        <div className="initial-setup-metrics">
          {[
            ['完了率', `${initialSetupChecklist.completionRate}%`],
            ['完了', `${initialSetupChecklist.completedCount}/${initialSetupChecklist.steps.length}`],
            ['要確認', `${initialSetupChecklist.attentionCount}件`],
            ['未完了', `${initialSetupChecklist.blockedCount}件`]
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        <div className="initial-setup-steps">
          {initialSetupChecklist.steps.map((step) => {
            const permission = INITIAL_SETUP_TAB_PERMISSIONS[step.tab];
            const canOpenStep = canUserPerform(currentUser, permission);
            return (
              <div key={step.id} className="initial-setup-step" data-testid={`initial-setup-step-${step.id}`}>
                <div className="initial-setup-step-main">
                  <span style={initialSetupStatusStyle(step.status)}>{step.statusLabel}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <span>{step.evidence}</span>
                    <div className="initial-setup-required-actions">
                      {step.requiredActions.slice(0, 2).map((action) => (
                        <span key={action}>{action}</span>
                      ))}
                      {step.requiredActions.length > 2 && (
                        <span>ほか{step.requiredActions.length - 2}件</span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleOpenInitialSetupStep(step)}
                  disabled={!canOpenStep}
                  title={!canOpenStep ? getPermissionDeniedMessage(currentUser, permission) : undefined}
                >
                  {step.actionLabel}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* タブ選択ナビゲーション */}
      <div className="section-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.65rem' }} role="tablist">
        <button
          className={`tab-pill ${activeTab === 'facility' ? 'active' : ''}`}
          onClick={() => openTab('facility', 'manage_facility_settings')}
          style={tabButtonStyle(activeTab === 'facility')}
          disabled={!canManageFacility}
          title={!canManageFacility ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings') : undefined}
        >
          <Building2 size={15} aria-hidden="true" />
          施設基準設定
        </button>
        <button
          className={`tab-pill ${activeTab === 'external' ? 'active' : ''}`}
          onClick={() => openTab('external', 'manage_facility_settings')}
          style={tabButtonStyle(activeTab === 'external')}
          disabled={!canManageFacility}
          title={!canManageFacility ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings') : undefined}
          data-testid="settings-tab-external-connectors"
        >
          <Network size={15} aria-hidden="true" />
          外部連携
        </button>
        <button
          className={`tab-pill ${activeTab === 'master' ? 'active' : ''}`}
          onClick={() => openTab('master', 'update_drug_master')}
          style={tabButtonStyle(activeTab === 'master')}
          disabled={!canUpdateDrugMaster}
          title={!canUpdateDrugMaster ? getPermissionDeniedMessage(currentUser, 'update_drug_master') : undefined}
        >
          <RefreshCw size={15} aria-hidden="true" />
          マスタ更新
        </button>
        <button
          className={`tab-pill ${activeTab === 'medicationInfo' ? 'active' : ''}`}
          onClick={() => openTab('medicationInfo', 'manage_facility_settings')}
          style={tabButtonStyle(activeTab === 'medicationInfo')}
          disabled={!canManageFacility}
          title={!canManageFacility ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings') : undefined}
          data-testid="settings-tab-medication-info"
        >
          <FileText size={15} aria-hidden="true" />
          薬情テンプレ
        </button>
        <button
          className={`tab-pill ${activeTab === 'backup' ? 'active' : ''}`}
          onClick={() => openTab('backup', 'manage_backups')}
          style={tabButtonStyle(activeTab === 'backup')}
          disabled={!canManageBackups}
          title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : undefined}
          data-testid="settings-tab-backup"
        >
          <Database size={15} aria-hidden="true" />
          バックアップ
        </button>
        <button
          className={`tab-pill ${activeTab === 'officialAudit' ? 'active' : ''}`}
          onClick={() => openTab('officialAudit', 'view_official_audit')}
          style={tabButtonStyle(activeTab === 'officialAudit')}
          disabled={!canViewOfficialAudit}
          title={!canViewOfficialAudit ? getPermissionDeniedMessage(currentUser, 'view_official_audit') : undefined}
        >
          <ShieldCheck size={15} aria-hidden="true" />
          公式仕様点検
        </button>
        <button
          className={`tab-pill ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => openTab('audit', 'view_audit_logs')}
          style={tabButtonStyle(activeTab === 'audit')}
          disabled={!canViewAuditLogs}
          title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
        >
          <History size={15} aria-hidden="true" />
          操作ログ（監査証跡）
        </button>
        <button
          className={`tab-pill ${activeTab === 'staff' ? 'active' : ''}`}
          onClick={() => openTab('staff', 'manage_staff')}
          style={tabButtonStyle(activeTab === 'staff')}
          disabled={!canManageStaff}
          title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : undefined}
        >
          <Fingerprint size={15} aria-hidden="true" />
          スタッフ管理（パスキー）
        </button>
        <button
          className={`tab-pill ${activeTab === 'terminalSync' ? 'active' : ''}`}
          onClick={() => openTab('terminalSync', 'manage_facility_settings')}
          style={tabButtonStyle(activeTab === 'terminalSync')}
          disabled={!canManageFacility}
          title={!canManageFacility ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings') : undefined}
        >
          <Network size={15} aria-hidden="true" />
          端末同期
        </button>
      </div>

      {activeTab === 'facility' && (
        <div className="settings-section glass">
          <h2>薬局・施設基準設定 (令和8年6月改定対応)</h2>
          <p className="section-desc">調剤基本料や加算の算定に用いる薬局の施設基準を設定します。<br />
          <strong style={{ color: 'var(--primary)' }}>令和8年6月1日施行の調剤報酬点数表に合わせた区分を選択できます。</strong></p>

          <h3 className="subsection-title">薬局基本情報</h3>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="pharmacyName">薬局名</label>
              <input
                id="pharmacyName"
                value={settings.pharmacyName || ''}
                onChange={(e) => handleSettingsChange('pharmacyName', e.target.value)}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="pharmacyCode">保険薬局コード</label>
              <input
                id="pharmacyCode"
                value={settings.pharmacyCode || ''}
                onChange={(e) => handleSettingsChange('pharmacyCode', e.target.value)}
                className="form-control"
                inputMode="numeric"
              />
            </div>

            <div className="form-group">
              <label htmlFor="pharmacyPostalCode">郵便番号</label>
              <input
                id="pharmacyPostalCode"
                value={settings.pharmacyPostalCode || ''}
                onChange={(e) => handleSettingsChange('pharmacyPostalCode', e.target.value)}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="pharmacyPhone">電話番号</label>
              <input
                id="pharmacyPhone"
                value={settings.pharmacyPhone || ''}
                onChange={(e) => handleSettingsChange('pharmacyPhone', e.target.value)}
                className="form-control"
              />
            </div>

            <div className="form-group form-grid-wide">
              <label htmlFor="pharmacyAddress">所在地</label>
              <input
                id="pharmacyAddress"
                value={settings.pharmacyAddress || ''}
                onChange={(e) => handleSettingsChange('pharmacyAddress', e.target.value)}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="registrationNumber">適格請求書登録番号</label>
              <input
                id="registrationNumber"
                value={settings.registrationNumber || ''}
                onChange={(e) => handleSettingsChange('registrationNumber', e.target.value)}
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="defaultPharmacistName">既定の担当薬剤師</label>
              <input
                id="defaultPharmacistName"
                value={settings.defaultPharmacistName || ''}
                onChange={(e) => handleSettingsChange('defaultPharmacistName', e.target.value)}
                className="form-control"
              />
            </div>
          </div>

          <h3 className="subsection-title">施設基準</h3>
          <div className="form-group">
            <label htmlFor="baseFeeCategory">調剤基本料の区分</label>
            <select
              id="baseFeeCategory"
              value={settings.baseFeeCategory}
              onChange={(e) => handleSettingsChange('baseFeeCategory', e.target.value as FacilitySettings['baseFeeCategory'])}
              className="form-control"
            >
              <option value="1">調剤基本料1 (47点)</option>
              <option value="2">調剤基本料2 (30点)</option>
              <option value="3_a">調剤基本料3(イ) (25点)</option>
              <option value="3_b">調剤基本料3(ロ) (20点)</option>
              <option value="3_ro">調剤基本料3(ハ) (37点)</option>
              <option value="special">特別調剤基本料A (5点)</option>
              <option value="special_b">特別調剤基本料B (3点)</option>
            </select>
            <small className="help-text">処方箋受付回数や特定の医療機関への集中率に応じて選択してください。</small>
          </div>

          <div className="form-group">
            <label htmlFor="regionalSupportAddition">地域支援・医薬品供給対応体制加算</label>
            <select
              id="regionalSupportAddition"
              value={settings.regionalSupportAddition}
              onChange={(e) => handleSettingsChange('regionalSupportAddition', e.target.value as FacilitySettings['regionalSupportAddition'])}
              className="form-control"
            >
              <option value="none">算定なし</option>
              <option value="1">加算1 (27点)</option>
              <option value="2">加算2 (59点)</option>
              <option value="3">加算3 (67点)</option>
              <option value="4">加算4 (37点)</option>
              <option value="5">加算5 (59点)</option>
            </select>
            <small className="help-text">地域の医薬品供給拠点としての体制を整備している場合</small>
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.medicalDxAddition}
                onChange={(e) => handleSettingsChange('medicalDxAddition', e.target.checked)}
              />
              <span>電子的調剤情報連携体制整備加算 (8点)</span>
            </label>
            <small className="help-text">医療DX推進体制の施設基準に適合する場合</small>
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.genericDispensingReduction || false}
                onChange={(e) => handleSettingsChange('genericDispensingReduction', e.target.checked)}
              />
              <span>後発医薬品減算 (-5点)</span>
            </label>
            <small className="help-text">該当する施設基準の場合のみ選択してください。</small>
          </div>

          <h3 className="subsection-title">AI補助運用</h3>
          <div className="form-group">
            <label htmlFor="aiAssistMode">候補の表示範囲</label>
            <select
              id="aiAssistMode"
              value={normalizeAiAssistMode(settings.aiAssistMode)}
              onChange={(event) => handleSettingsChange(
                'aiAssistMode',
                event.target.value as FacilitySettings['aiAssistMode']
              )}
              className="form-control"
              data-testid="ai-assist-mode-select"
            >
              <option value="enabled">標準: 根拠付き候補をすべて表示</option>
              <option value="limited">制限: 要修正の候補だけ表示</option>
              <option value="disabled">停止: AI補助候補を表示しない</option>
            </select>
            <small className="help-text">
              {AI_ASSIST_MODE_DESCRIPTIONS[normalizeAiAssistMode(settings.aiAssistMode)]}
            </small>
          </div>

          <h3 className="subsection-title">公式算定コード</h3>
          <div className="actions" style={{ marginTop: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
            <span
              className="btn-tooltip-wrapper"
              data-disabled={!canManageFacility}
              title={!canManageFacility ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings') : ''}
            >
              <button
                className="btn-secondary flex-center gap-2"
                type="button"
                onClick={handleExportOfficialFeeCodeCsv}
                disabled={!canManageFacility}
                data-testid="official-fee-code-csv-export"
              >
                <Download size={16} aria-hidden="true" />
                <span>CSVひな形</span>
              </button>
            </span>
            <span
              className="btn-tooltip-wrapper"
              data-disabled={isImportingOfficialFeeCodeCsv || !canManageFacility}
              title={!canManageFacility ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings') : isImportingOfficialFeeCodeCsv ? '読み込み中...' : ''}
            >
              <label
                className="btn-secondary flex-center gap-2"
                aria-disabled={isImportingOfficialFeeCodeCsv || !canManageFacility}
                style={{
                  cursor: isImportingOfficialFeeCodeCsv || !canManageFacility ? 'not-allowed' : 'pointer',
                  opacity: isImportingOfficialFeeCodeCsv || !canManageFacility ? 0.6 : 1
                }}
              >
                {isImportingOfficialFeeCodeCsv ? (
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                ) : (
                  <UploadCloud size={16} aria-hidden="true" />
                )}
                <span>{isImportingOfficialFeeCodeCsv ? '読み込み中...' : 'CSVを読み込む'}</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleImportOfficialFeeCodeCsv}
                  className="hidden-input"
                  disabled={isImportingOfficialFeeCodeCsv || !canManageFacility}
                  data-testid="official-fee-code-csv-input"
                  aria-label="公式算定コードCSVを読み込む"
                />
              </label>
            </span>
            <span
              className="btn-tooltip-wrapper"
              data-disabled={isReviewingOfficialFeeCodeMasterCsv || !canManageFacility}
              title={!canManageFacility ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings') : isReviewingOfficialFeeCodeMasterCsv ? '照合中...' : ''}
            >
              <label
                className="btn-secondary flex-center gap-2"
                aria-disabled={isReviewingOfficialFeeCodeMasterCsv || !canManageFacility}
                style={{
                  cursor: isReviewingOfficialFeeCodeMasterCsv || !canManageFacility ? 'not-allowed' : 'pointer',
                  opacity: isReviewingOfficialFeeCodeMasterCsv || !canManageFacility ? 0.6 : 1
                }}
              >
                {isReviewingOfficialFeeCodeMasterCsv ? (
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                ) : (
                  <Search size={16} aria-hidden="true" />
                )}
                <span>{isReviewingOfficialFeeCodeMasterCsv ? '照合中...' : '公式表CSVで候補'}</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleReviewOfficialFeeCodeMasterCsv}
                  className="hidden-input"
                  disabled={isReviewingOfficialFeeCodeMasterCsv || !canManageFacility}
                  data-testid="official-fee-code-master-csv-input"
                  aria-label="公式算定コードの公式表CSVを照合する"
                />
              </label>
            </span>
            <button
              className="btn-secondary flex-center gap-2"
              type="button"
              onClick={handleApplyOfficialFeeCodeMasterProposal}
              disabled={!officialFeeCodeMasterProposal || officialFeeCodeMasterProposal.matchedCount === 0 || !canManageFacility}
              data-testid="official-fee-code-master-apply"
            >
              <CheckCircle size={16} aria-hidden="true" />
              <span>候補を反映</span>
            </button>
            <button
              className="btn-secondary flex-center gap-2"
              type="button"
              onClick={handleExportOfficialFeeCodeMasterProposalReviewCsv}
              disabled={!officialFeeCodeMasterProposal || !canManageFacility}
              data-testid="official-fee-code-master-review-csv"
            >
              <FileText size={16} aria-hidden="true" />
              <span>照合結果CSV</span>
            </button>
          </div>
          {officialFeeCodeMasterProposal && (
            <>
              <div
                data-testid="official-fee-code-master-summary"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '0.5rem',
                  marginBottom: '0.75rem',
                  color: 'var(--text-muted)',
                  fontSize: '0.82rem'
                }}
              >
                <span>候補 {officialFeeCodeMasterProposal.matchedCount}件</span>
                <span>未一致 {officialFeeCodeMasterProposal.unresolvedCount}件</span>
                <span>重複 {officialFeeCodeMasterProposal.duplicateCount}件</span>
                <span>読み飛ばし {officialFeeCodeMasterProposal.skippedRowCount}行</span>
              </div>
              <div
                data-testid="official-fee-code-master-preview"
                style={{
                  display: 'grid',
                  gap: '0.5rem',
                  marginBottom: '0.85rem'
                }}
              >
                {officialFeeCodeMasterProposal.candidates.slice(0, 8).map((candidate) => (
                  <div
                    key={`${candidate.key}-${candidate.officialFeeCode}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1.3fr) minmax(86px, 0.6fr) minmax(0, 1.2fr) minmax(56px, 0.5fr)',
                      gap: '0.5rem',
                      alignItems: 'center',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      wordBreak: 'break-word'
                    }}
                  >
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{candidate.label}</span>
                    <code>{candidate.officialFeeCode}</code>
                    <span>{candidate.masterName}</span>
                    <span>{candidate.rowNumber}行目</span>
                  </div>
                ))}
                {officialFeeCodeMasterProposal.unresolvedItems.slice(0, 5).map((item) => (
                  <div
                    key={`${item.key}-${item.reason}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1.3fr) minmax(86px, 0.6fr) minmax(0, 1.2fr) minmax(56px, 0.5fr)',
                      gap: '0.5rem',
                      alignItems: 'center',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      wordBreak: 'break-word'
                    }}
                  >
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{item.label}</span>
                    <span>{item.reason === 'duplicate' ? '重複' : '未一致'}</span>
                    <span>{item.reason === 'duplicate' ? '複数候補あり' : '候補なし'}</span>
                    <span>-</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="form-grid" data-testid="official-fee-code-overrides">
            {DISPENSING_OFFICIAL_FEE_CODE_OVERRIDE_ITEMS.map((item) => (
              <div className="form-group" key={item.key}>
                <label htmlFor={`officialFeeCode-${item.key}`}>{item.label}</label>
                <input
                  id={`officialFeeCode-${item.key}`}
                  value={settings.officialFeeCodeOverrides?.[item.key] || ''}
                  onChange={(e) => handleOfficialFeeCodeChange(item.key, e.target.value)}
                  className="form-control"
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="9桁"
                />
              </div>
            ))}
          </div>

          <div className="actions">
            <span
              className="btn-tooltip-wrapper"
              data-disabled={isSavingSettings || !canManageFacility}
              title={!canManageFacility ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings') : isSavingSettings ? '保存中...' : ''}
            >
              <button
                className="btn-primary flex-center gap-2"
                onClick={handleSaveSettings}
                disabled={isSavingSettings || !canManageFacility}
              >
                {isSavingSettings ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
                {isSavingSettings ? '保存中...' : '設定を保存する'}
              </button>
            </span>
          </div>
        </div>
      )}

      {activeTab === 'external' && (
        <div className="settings-section glass" data-testid="external-connector-settings">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h2>外部連携</h2>
              <p className="section-desc">オンライン資格確認、電子処方箋、施設内の調剤機器・POSへの接続準備を確認します。</p>
            </div>
            <button
              type="button"
              className="btn-secondary flex-center gap-2"
              onClick={refreshExternalConnectorReadiness}
              disabled={isLoadingExternalConnectorReadiness}
              data-testid="external-connector-refresh"
            >
              {isLoadingExternalConnectorReadiness ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} aria-hidden="true" />}
              <span>{isLoadingExternalConnectorReadiness ? '確認中...' : '再確認'}</span>
            </button>
          </div>

          {!externalConnectorReadiness && (
            <div className="empty-state" style={{ marginTop: '1rem' }}>
              <Network size={32} aria-hidden="true" />
              <p>{isLoadingExternalConnectorReadiness ? '接続準備を確認しています。' : '外部連携の接続準備は未確認です。'}</p>
            </div>
          )}

          {externalConnectorReadiness && (
            <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                {[
                  ['総合判定', externalConnectorReadiness.overallStatus],
                  ['診断版', `v${externalConnectorReadiness.schemaVersion}`],
                  ['診断日時', new Date(externalConnectorReadiness.generatedAt).toLocaleString('ja-JP')],
                  ['秘密情報', externalConnectorReadiness.privacy.containsEndpointUrl || externalConnectorReadiness.privacy.containsBearerToken ? '要確認' : '非表示']
                ].map(([label, value]) => (
                  <div key={label} style={{ border: '1px solid var(--border)', borderRadius: '8px', background: '#fff', padding: '0.8rem' }}>
                    <div style={{ color: 'var(--text-ghost)', fontSize: '0.75rem', fontWeight: 800 }}>{label}</div>
                    <strong style={{ display: 'block', marginTop: '0.25rem', color: 'var(--text-main)' }}>{value}</strong>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {externalConnectorReadiness.checks.map((check) => (
                  <section
                    key={check.id}
                    data-testid={`external-connector-check-${check.id}`}
                    style={{ border: '1px solid var(--border)', borderRadius: '8px', background: '#fff', padding: '0.9rem', display: 'grid', gap: '0.75rem' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>{check.label}</h3>
                        <p className="help-text" style={{ margin: '0.2rem 0 0' }}>
                          モード {check.config.mode} / 接続先 {check.config.endpointConfigured ? '設定済み' : '未設定'} / 直近試行 {check.lastAttempt.outcomeLabel}
                        </p>
                      </div>
                      <span className={`status-chip ${check.status === 'ready' ? 'confirmed' : check.status === 'blocked' ? 'unavailable' : 'warning'}`}>
                        {check.statusLabel}
                      </span>
                    </div>

                    {check.id === 'electronic_prescription' && check.electronicPrescription && (
                      <div data-testid="electronic-prescription-connector-capabilities" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.55rem' }}>
                        <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem' }}>
                          <div style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', fontWeight: 800 }}>公式接続方式</div>
                          <strong>
                            {check.electronicPrescription.connectorKind === 'qualification_terminal'
                              ? '資格確認端末経由'
                              : check.electronicPrescription.connectorKind === 'web_api'
                                ? 'Web API'
                                : '未設定'}
                          </strong>
                        </div>
                        <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem' }}>
                          <div style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', fontWeight: 800 }}>必須機能</div>
                          <strong>
                            {check.electronicPrescription.configuredCapabilities.length}
                            /{check.electronicPrescription.configuredCapabilities.length + check.electronicPrescription.missingCapabilities.length}
                          </strong>
                        </div>
                        <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem' }}>
                          <div style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', fontWeight: 800 }}>未確認</div>
                          <strong>{check.electronicPrescription.missingCapabilities.length}件</strong>
                        </div>
                      </div>
                    )}

                    {check.id === 'pharmacy_device' && check.pharmacyDevice && (
                      <div data-testid="pharmacy-device-connector-capabilities" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.55rem' }}>
                        <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem' }}>
                          <div style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', fontWeight: 800 }}>接続方式</div>
                          <strong>
                            {check.pharmacyDevice.connectorKind === 'nsips_gateway'
                              ? '許諾済みNSIPSゲートウェイ'
                              : check.pharmacyDevice.connectorKind === 'vendor_api'
                                ? 'メーカーAPI'
                                : '未設定'}
                          </strong>
                        </div>
                        <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem' }}>
                          <div style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', fontWeight: 800 }}>連携仕様版</div>
                          <strong>{check.pharmacyDevice.interfaceVersion || '未設定'}</strong>
                        </div>
                        <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem' }}>
                          <div style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', fontWeight: 800 }}>必須機能</div>
                          <strong>
                            {check.pharmacyDevice.configuredCapabilities.length}
                            /{check.pharmacyDevice.configuredCapabilities.length + check.pharmacyDevice.missingCapabilities.length}
                          </strong>
                        </div>
                      </div>
                    )}

                    {check.evidence.length > 0 && (
                      <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                        {check.evidence.slice(0, 4).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                    {check.requiredActions.length > 0 && (
                      <div style={{ display: 'grid', gap: '0.35rem' }}>
                        <strong style={{ color: '#92400e', fontSize: '0.82rem' }}>残対応</strong>
                        <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#92400e', fontSize: '0.82rem', lineHeight: 1.55 }}>
                          {check.requiredActions.slice(0, 5).map((action) => (
                            <li key={action}>{action}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'medicationInfo' && (
        <div className="settings-section glass medication-info-template-section" data-testid="medication-info-template-section">
          <h2>薬情テンプレ承認</h2>
          <p className="section-desc">
            患者向け印刷に使う薬剤情報を、薬局で作成・確認したテンプレとして管理します。承認済みのテンプレだけが薬情印刷へ反映されます。
          </p>

          {invalidApprovedMedicationInfoTemplates.length > 0 && (
            <div
              role="alert"
              data-testid="medication-info-invalid-approved-alert"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.85rem',
                padding: '0.65rem 0.75rem',
                border: '1px solid #dc2626',
                borderRadius: '8px',
                color: '#991b1b',
                background: '#fef2f2',
                fontWeight: 700,
                fontSize: '0.84rem'
              }}
            >
              <AlertTriangle size={17} aria-hidden="true" />
              承認条件を満たさず印刷に使われないテンプレが{invalidApprovedMedicationInfoTemplates.length}件あります。
            </div>
          )}

          <div
            role="group"
            aria-label="薬情テンプレ状態絞り込み"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.65rem',
              marginBottom: '1rem'
            }}
          >
            {([
              ['all', 'すべて'],
              ...Object.entries(MEDICATION_INFO_TEMPLATE_STATUS_LABELS)
            ] as [MedicationInfoTemplateStatusFilter, string][]).map(([status, label]) => {
              const isActive = medicationInfoTemplateStatusFilter === status;
              const count = status === 'all'
                ? medicationInfoTemplates.length
                : medicationInfoTemplateStatusCounts[status];
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setMedicationInfoTemplateStatusFilter(status)}
                  aria-pressed={isActive}
                  data-testid={`medication-info-template-status-filter-${status}`}
                  style={{
                    border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '0.65rem 0.75rem',
                    background: isActive ? '#eff6ff' : 'white',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    {count}
                  </div>
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="薬情テンプレ承認準備絞り込み"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.45rem',
              marginBottom: '1rem'
            }}
          >
            {(['all', 'ready', 'missing'] as MedicationInfoTemplateReadinessFilter[]).map((readiness) => {
              const isActive = medicationInfoTemplateReadinessFilter === readiness;
              return (
                <button
                  key={readiness}
                  type="button"
                  onClick={() => setMedicationInfoTemplateReadinessFilter(readiness)}
                  aria-pressed={isActive}
                  data-testid={`medication-info-template-readiness-filter-${readiness}`}
                  style={{
                    border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '0.45rem 0.7rem',
                    background: isActive ? '#eff6ff' : 'white',
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 800
                  }}
                >
                  {MEDICATION_INFO_TEMPLATE_READINESS_LABELS[readiness]} {medicationInfoTemplateReadinessCounts[readiness]}
                </button>
              );
            })}
          </div>

          <div className="medication-info-template-layout">
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.85rem',
                background: 'white'
              }}
            >
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label htmlFor="medication-info-template-search">テンプレ検索</label>
                <input
                  id="medication-info-template-search"
                  className="form-control"
                  value={medicationInfoTemplateSearch}
                  onChange={(e) => setMedicationInfoTemplateSearch(e.target.value)}
                  placeholder="薬品名、コード、状態"
                  data-testid="medication-info-template-search"
                />
              </div>

              <div
                role="status"
                data-testid="medication-info-template-result-count"
                style={{ marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700 }}
              >
                {filteredMedicationInfoTemplates.length.toLocaleString()}件
                {filteredMedicationInfoTemplates.length > 80
                  ? '（先頭80件を表示）'
                  : 'を表示'}
              </div>

              <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '560px', overflowY: 'auto' }}>
                {isLoadingMedicationInfoTemplates ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem', padding: '0.75rem' }}>
                    読み込み中...
                  </div>
                ) : filteredMedicationInfoTemplates.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem', padding: '0.75rem' }}>
                    {medicationInfoTemplates.length === 0
                      ? 'テンプレはまだありません。'
                      : '条件に一致するテンプレはありません。'}
                  </div>
                ) : (
                  filteredMedicationInfoTemplates.slice(0, 80).map((template) => {
                    const isSelected = template.templateId === selectedMedicationInfoTemplateId;
                    const hasInvalidApproval = template.status === 'approved'
                      && !isApprovedPatientMedicationInfoTemplate(template);
                    const readinessIssues = getMedicationInfoTemplateReadinessIssues(template);
                    const isReadyForApproval = readinessIssues.length === 0;
                    const statusColor = hasInvalidApproval
                      ? '#dc2626'
                      : template.status === 'approved'
                      ? '#15803d'
                      : template.status === 'needs_review'
                        ? '#b45309'
                        : template.status === 'retired'
                          ? '#64748b'
                          : '#2563eb';
                    return (
                      <button
                        key={template.templateId}
                        type="button"
                        onClick={() => handleSelectMedicationInfoTemplate(template)}
                        style={{
                          textAlign: 'left',
                          border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                          borderRadius: '8px',
                          padding: '0.7rem',
                          background: isSelected ? '#eff6ff' : '#fff',
                          cursor: 'pointer',
                          display: 'grid',
                          gap: '0.3rem'
                        }}
                      >
                        <span style={{ fontWeight: 800, color: 'var(--text-main)', wordBreak: 'break-word' }}>
                          {template.drugName}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {template.drugCode}
                          {template.genericName ? ` / ${template.genericName}` : ''}
                        </span>
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          <span
                            style={{
                              width: 'fit-content',
                              borderRadius: '999px',
                              padding: '0.12rem 0.5rem',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              color: statusColor,
                              background: '#f8fafc',
                              border: `1px solid ${statusColor}`
                            }}
                          >
                            {hasInvalidApproval ? '承認不備' : MEDICATION_INFO_TEMPLATE_STATUS_LABELS[template.status]}
                          </span>
                          <span
                            title={isReadyForApproval
                              ? '承認に必要な本文と参照元が揃っています'
                              : readinessIssues.map((issue) => issue.message).join('、')}
                            style={{
                              width: 'fit-content',
                              borderRadius: '999px',
                              padding: '0.12rem 0.5rem',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              color: isReadyForApproval ? '#047857' : '#b45309',
                              background: isReadyForApproval ? '#ecfdf5' : '#fffbeb',
                              border: `1px solid ${isReadyForApproval ? '#10b981' : '#f59e0b'}`
                            }}
                          >
                            {isReadyForApproval ? '承認準備OK' : `不足 ${readinessIssues.length}`}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <div className="actions medication-info-template-actions">
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={handleNewMedicationInfoTemplate}
                  disabled={isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv}
                >
                  <Plus size={16} aria-hidden="true" />
                  <span>新規</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={() => void handleExportMedicationInfoCsv()}
                  disabled={isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv || !canManageFacility}
                  data-testid="medication-info-template-csv-export"
                >
                  <Download size={16} aria-hidden="true" />
                  <span>CSV書出</span>
                </button>
                <label
                  className="btn-secondary flex-center gap-2"
                  aria-disabled={isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv || !canManageFacility}
                  style={{
                    cursor: isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv || !canManageFacility ? 'not-allowed' : 'pointer',
                    opacity: isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv || !canManageFacility ? 0.6 : 1
                  }}
                >
                  {isImportingMedicationInfoCsv
                    ? <Loader2 size={16} className="spin" aria-hidden="true" />
                    : <UploadCloud size={16} aria-hidden="true" />}
                  <span>{isImportingMedicationInfoCsv ? '取込中...' : 'CSV下書き取込'}</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleImportMedicationInfoCsv}
                    className="hidden-input"
                    disabled={isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv || !canManageFacility}
                    data-testid="medication-info-template-csv-input"
                    aria-label="薬情テンプレCSVを下書きとして取り込む"
                  />
                </label>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={handleUsePmdaMedicationInfoSearchUrl}
                  disabled={isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv || isBuildingMedicationInfoSafetyDraft}
                >
                  <Search size={16} aria-hidden="true" />
                  <span>PMDA検索URL</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={() => void handleApplyMedicationInfoSafetyDraft()}
                  disabled={isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv || isBuildingMedicationInfoSafetyDraft || !canManageFacility}
                  data-testid="medication-info-template-safety-draft"
                >
                  {isBuildingMedicationInfoSafetyDraft
                    ? <Loader2 size={16} className="spin" aria-hidden="true" />
                    : <FileText size={16} aria-hidden="true" />}
                  <span>副作用/注意案</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={() => void handleExportMedicationInfoSafetyDraftCsv()}
                  disabled={isSavingMedicationInfoTemplate || isImportingMedicationInfoCsv || isExportingMedicationInfoSafetyDraftCsv || !canManageFacility}
                  data-testid="medication-info-template-safety-draft-csv-export"
                >
                  {isExportingMedicationInfoSafetyDraftCsv
                    ? <Loader2 size={16} className="spin" aria-hidden="true" />
                    : <Download size={16} aria-hidden="true" />}
                  <span>注意案CSV</span>
                </button>
                <span className="medication-info-template-draft-note">
                  副作用・使用上の注意案は下書きです。薬剤師確認後に承認してください。
                </span>
              </div>

              {medicationInfoCsvImportSummary && (
                <div
                  role="status"
                  data-testid="medication-info-template-csv-import-summary"
                  style={{
                    display: 'grid',
                    gap: '0.25rem',
                    marginBottom: '0.85rem',
                    padding: '0.65rem 0.75rem',
                    border: '1px solid #93c5fd',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    color: '#1e40af',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    lineHeight: 1.45
                  }}
                >
                  <span>
                    CSV下書き取込: {medicationInfoCsvImportSummary.fileName}
                  </span>
                  <span>
                    {medicationInfoCsvImportSummary.importedCount.toLocaleString()}件中、
                    承認準備OK {medicationInfoCsvImportSummary.readyForApprovalCount.toLocaleString()}件 /
                    不足・警告 {medicationInfoCsvImportSummary.warningCount.toLocaleString()}件
                  </span>
                  <span style={{ color: '#1d4ed8', fontSize: '0.76rem' }}>
                    取込日時 {new Date(medicationInfoCsvImportSummary.importedAt).toLocaleString('ja-JP')}
                  </span>
                </div>
              )}

              {selectedMedicationInfoTemplate && selectedMedicationInfoTemplate.status !== 'draft' && (
                <div
                  role={isEditingImmutableMedicationInfoRevision ? 'alert' : 'status'}
                  data-testid="medication-info-template-revision-notice"
                  style={{
                    marginBottom: '0.85rem',
                    padding: '0.7rem 0.8rem',
                    border: `1px solid ${isEditingImmutableMedicationInfoRevision ? '#f59e0b' : '#93c5fd'}`,
                    borderRadius: '8px',
                    background: isEditingImmutableMedicationInfoRevision ? '#fffbeb' : '#eff6ff',
                    color: isEditingImmutableMedicationInfoRevision ? '#92400e' : '#1e40af',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    lineHeight: 1.5
                  }}
                >
                  {isEditingImmutableMedicationInfoRevision
                    ? '保存前の版から本文または参照元が変更されています。下書き保存または承認保存では新しいテンプレIDへ分岐し、元の版の内容を保持します。'
                    : '確定済みの版を表示しています。本文または参照元を編集すると新版の下書きへ切り替わり、元の版は変更されません。'}
                </div>
              )}

              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="medication-info-template-drug-code">薬品コード</label>
                  <input
                    id="medication-info-template-drug-code"
                    className="form-control"
                    value={medicationInfoTemplateForm.drugCode}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('drugCode', e.target.value)}
                    data-testid="medication-info-template-drug-code"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="medication-info-template-drug-name">薬品名</label>
                  <input
                    id="medication-info-template-drug-name"
                    className="form-control"
                    value={medicationInfoTemplateForm.drugName}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('drugName', e.target.value)}
                    data-testid="medication-info-template-drug-name"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="medication-info-template-generic-name">一般名・成分名</label>
                  <input
                    id="medication-info-template-generic-name"
                    className="form-control"
                    value={medicationInfoTemplateForm.genericName}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('genericName', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="medication-info-template-status">状態</label>
                  <input
                    id="medication-info-template-status"
                    className="form-control"
                    value={MEDICATION_INFO_TEMPLATE_STATUS_LABELS[medicationInfoTemplateForm.status]}
                    readOnly
                    data-testid="medication-info-template-current-status"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="medication-info-template-source-type">参照元区分</label>
                  <select
                    id="medication-info-template-source-type"
                    className="form-control"
                    value={medicationInfoTemplateForm.sourceType}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('sourceType', e.target.value as MedicationInfoSourceType)}
                  >
                    {(Object.entries(MEDICATION_INFO_SOURCE_TYPE_LABELS) as [MedicationInfoSourceType, string][]).map(([sourceType, label]) => (
                      <option key={sourceType} value={sourceType}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="medication-info-template-source-revision-date">参照元版日</label>
                  <input
                    id="medication-info-template-source-revision-date"
                    type="date"
                    className="form-control"
                    value={medicationInfoTemplateForm.sourceRevisionDate}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('sourceRevisionDate', e.target.value)}
                  />
                </div>

                <div className="form-group form-grid-wide">
                  <label htmlFor="medication-info-template-source-url">参照元URL</label>
                  <input
                    id="medication-info-template-source-url"
                    type="url"
                    className="form-control"
                    value={medicationInfoTemplateForm.sourceUrl}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('sourceUrl', e.target.value)}
                    placeholder="https://www.pmda.go.jp/..."
                    data-testid="medication-info-template-source-url"
                  />
                </div>

                <div className="form-group form-grid-wide">
                  <label htmlFor="medication-info-template-source-hash">参照元ハッシュ・版管理メモ</label>
                  <input
                    id="medication-info-template-source-hash"
                    className="form-control"
                    value={medicationInfoTemplateForm.sourceHash}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('sourceHash', e.target.value)}
                    placeholder="SHA-256 または社内管理番号"
                  />
                </div>

                <div className="form-group form-grid-wide">
                  <label htmlFor="medication-info-template-side-effect">副作用・相談目安</label>
                  <textarea
                    id="medication-info-template-side-effect"
                    className="form-control"
                    rows={5}
                    value={medicationInfoTemplateForm.sideEffectText}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('sideEffectText', e.target.value)}
                    data-testid="medication-info-template-side-effect"
                  />
                </div>

                <div className="form-group form-grid-wide">
                  <label htmlFor="medication-info-template-usage-caution">使用上の注意</label>
                  <textarea
                    id="medication-info-template-usage-caution"
                    className="form-control"
                    rows={5}
                    value={medicationInfoTemplateForm.counselingText}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('counselingText', e.target.value)}
                    data-testid="medication-info-template-usage-caution"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="medication-info-template-review-reason">要再確認理由</label>
                  <textarea
                    id="medication-info-template-review-reason"
                    className="form-control"
                    rows={4}
                    value={medicationInfoTemplateForm.needsReviewReason}
                    onChange={(e) => handleMedicationInfoTemplateFormChange('needsReviewReason', e.target.value)}
                  />
                </div>

                {medicationInfoTemplateForm.templateId && (
                  <div className="form-group form-grid-wide">
                    <label htmlFor="medication-info-template-id">テンプレID</label>
                    <input
                      id="medication-info-template-id"
                      className="form-control"
                      value={medicationInfoTemplateForm.templateId}
                      readOnly
                    />
                  </div>
                )}
              </div>

              <div
                id="medication-info-template-approval-readiness"
                role="status"
                data-testid="medication-info-template-approval-readiness"
                style={{
                  display: 'grid',
                  gap: '0.4rem',
                  marginTop: '0.75rem',
                  padding: '0.7rem 0.8rem',
                  border: `1px solid ${currentMedicationInfoApprovalIssues.length > 0 ? '#f59e0b' : '#16a34a'}`,
                  borderRadius: '8px',
                  background: currentMedicationInfoApprovalIssues.length > 0 ? '#fffbeb' : '#f0fdf4',
                  color: currentMedicationInfoApprovalIssues.length > 0 ? '#92400e' : '#166534',
                  fontSize: '0.82rem',
                  fontWeight: 700
                }}
              >
                <span>
                  {currentMedicationInfoApprovalIssues.length > 0
                    ? '承認前に必要な項目があります。'
                    : '承認条件を満たしています。'}
                </span>
                {currentMedicationInfoApprovalIssues.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', fontWeight: 600, lineHeight: 1.45 }}>
                    {currentMedicationInfoApprovalIssues.map((issue) => (
                      <li key={issue.code}>{issue.message}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="actions" style={{ marginTop: '1rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={() => handleSaveMedicationInfoTemplate('draft')}
                  disabled={isSavingMedicationInfoTemplate}
                  data-testid="medication-info-template-save-draft"
                >
                  {isSavingMedicationInfoTemplate ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                  <span>下書き保存</span>
                </button>
                <button
                  type="button"
                  className="btn-primary flex-center gap-2"
                  onClick={() => handleSaveMedicationInfoTemplate('approved')}
                  disabled={isSavingMedicationInfoTemplate || currentMedicationInfoApprovalIssues.length > 0}
                  aria-describedby="medication-info-template-approval-readiness"
                  title={currentMedicationInfoApprovalIssues.length > 0
                    ? currentMedicationInfoApprovalIssues.map((issue) => issue.message).join('、')
                    : '承認条件を満たしています'}
                  data-testid="medication-info-template-approve"
                >
                  {isSavingMedicationInfoTemplate ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <CheckCircle size={16} aria-hidden="true" />}
                  <span>承認して保存</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={() => handleSaveMedicationInfoTemplate('needs_review')}
                  disabled={isSavingMedicationInfoTemplate || isEditingImmutableMedicationInfoRevision}
                  title={isEditingImmutableMedicationInfoRevision
                    ? '本文・参照元の変更は新版として下書き保存してください'
                    : undefined}
                  data-testid="medication-info-template-needs-review"
                >
                  <AlertTriangle size={16} aria-hidden="true" />
                  <span>要再確認</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={() => {
                    if (!selectedMedicationInfoTemplateId) {
                      toast.info('廃止するテンプレを選択してください。');
                      return;
                    }
                    if (window.confirm('この薬情テンプレを廃止しますか？')) {
                      void handleSaveMedicationInfoTemplate('retired');
                    }
                  }}
                  disabled={isSavingMedicationInfoTemplate || isEditingImmutableMedicationInfoRevision}
                  title={isEditingImmutableMedicationInfoRevision
                    ? '本文・参照元の変更は新版として下書き保存してください'
                    : undefined}
                  data-testid="medication-info-template-retire"
                >
                  <Trash2 size={16} aria-hidden="true" />
                  <span>廃止</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'master' && (
        <div className="settings-section glass">
          <h2>医薬品マスタ更新</h2>
          <p className="section-desc">支払基金からダウンロードした医薬品マスター（CSV・ZIP）をアップロードしてマスタを更新します。</p>

          <div className="upload-area">
            <label className="file-input-label">
              <UploadCloud size={24} className="upload-icon" aria-hidden="true" />
              <span>ファイルを選択 (CSV/ZIP)</span>
              <input
                type="file"
                accept=".csv,.zip"
                onChange={handleFileChange}
                className="hidden-input"
                aria-label="医薬品マスタCSVまたはZIPファイルをアップロード"
                disabled={isUploading || isImportingDrugMasterFromUrl}
              />
            </label>
            {file && (
              <div className="file-info">
                選択中のファイル: <strong>{file.name}</strong>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="drug-master-source-url">更新元URL（任意）</label>
            <input
              id="drug-master-source-url"
              type="url"
              value={drugMasterSourceUrl}
              onChange={(e) => setDrugMasterSourceUrl(e.target.value)}
              placeholder="https://www.ssk.or.jp/..."
              disabled={isUploading || isImportingDrugMasterFromUrl}
            />
            <small className="help-text">入力すると監査ログとロールバックJSONに更新元URL、ファイルサイズ、SHA-256を記録します。</small>
          </div>

          <section
            aria-label="支払基金マスター更新候補"
            style={{
              marginTop: '1rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border)'
            }}
          >
            <div className="form-group">
              <label htmlFor="drug-master-official-page-html">支払基金ページHTML</label>
              <div className="actions" style={{ margin: '0 0 0.5rem' }}>
                <button
                  className="btn-secondary flex-center gap-2"
                  onClick={handleFetchDrugMasterOfficialPage}
                  disabled={isUploading || isImportingDrugMasterFromUrl || isFetchingDrugMasterOfficialPage}
                  type="button"
                >
                  {isFetchingDrugMasterOfficialPage ? (
                    <Loader2 size={16} className="spin" aria-hidden="true" />
                  ) : (
                    <Download size={16} aria-hidden="true" />
                  )}
                  <span>{isFetchingDrugMasterOfficialPage ? '取得中...' : '公式ページを取得'}</span>
                </button>
              </div>
              <textarea
                id="drug-master-official-page-html"
                value={drugMasterOfficialPageHtml}
                onChange={(e) => setDrugMasterOfficialPageHtml(e.target.value)}
                rows={4}
                placeholder="<a href=&quot;...&quot;>全件ファイル...</a>"
                disabled={isUploading || isImportingDrugMasterFromUrl || isFetchingDrugMasterOfficialPage}
                style={{ resize: 'vertical', minHeight: '96px' }}
              />
            </div>
            <div className="actions" style={{ marginTop: '0.5rem' }}>
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleExtractDrugMasterCandidates}
                disabled={isUploading || isImportingDrugMasterFromUrl || isFetchingDrugMasterOfficialPage}
                type="button"
              >
                <Search size={16} aria-hidden="true" />
                <span>更新候補を抽出</span>
              </button>
              {drugMasterCandidateMessage && (
                <span className="help-text">{drugMasterCandidateMessage}</span>
              )}
            </div>
            {drugMasterCandidates.length > 0 && (
              <div
                aria-label="支払基金マスター更新候補一覧"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '0.65rem',
                  marginTop: '0.85rem'
                }}
              >
                {drugMasterCandidates.map((candidate) => (
                  <button
                    key={`${candidate.kind}-${candidate.url}`}
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleSelectDrugMasterCandidate(candidate)}
                    disabled={isUploading || isImportingDrugMasterFromUrl}
                    style={{
                      justifyContent: 'flex-start',
                      alignItems: 'flex-start',
                      textAlign: 'left',
                      padding: '0.7rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                      minHeight: '96px'
                    }}
                  >
                    <span style={{ fontWeight: 800, color: 'var(--text-main)' }}>
                      {drugMasterCandidateKindLabel[candidate.kind]} {candidate.fileType || ''}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: 1.4 }}>
                      {candidate.title}
                    </span>
                    <span style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', lineHeight: 1.35 }}>
                      {[candidate.updateDate, candidate.sizeLabel].filter(Boolean).join(' / ') || '日付・サイズ未記載'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section
            aria-label="医薬品マスター仕様PDF本文照合"
            style={{
              marginTop: '1rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border)'
            }}
          >
            <div className="form-group">
              <label htmlFor="drug-master-spec-pdf-text">仕様PDF本文</label>
              <textarea
                id="drug-master-spec-pdf-text"
                value={drugMasterSpecPdfText}
                onChange={(e) => {
                  setDrugMasterSpecPdfText(e.target.value);
                  setDrugMasterSpecPdfReview(null);
                  setDrugMasterSpecPdfReviewLabel('');
                }}
                rows={4}
                placeholder="〈医薬品マスター〉 項番 項目名 モード 桁数 バイト数..."
                disabled={isUploading || isImportingDrugMasterFromUrl || isFetchingDrugMasterSpecPdf}
                style={{ resize: 'vertical', minHeight: '96px' }}
              />
            </div>
            <div className="actions" style={{ marginTop: '0.5rem', alignItems: 'center' }}>
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleFetchDrugMasterSpecPdf}
                disabled={isUploading || isImportingDrugMasterFromUrl || isFetchingDrugMasterSpecPdf}
                type="button"
              >
                {isFetchingDrugMasterSpecPdf ? (
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                ) : (
                  <Download size={16} aria-hidden="true" />
                )}
                <span>{isFetchingDrugMasterSpecPdf ? '取得中...' : '公式PDFを取得して照合'}</span>
              </button>
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleReviewDrugMasterSpecPdfText}
                disabled={isUploading || isImportingDrugMasterFromUrl || isFetchingDrugMasterSpecPdf}
                type="button"
              >
                <Search size={16} aria-hidden="true" />
                <span>PDF本文を照合</span>
              </button>
              {drugMasterSpecPdfReviewLabel && (
                <span
                  className="help-text"
                  style={{
                    color: drugMasterSpecPdfReview?.ok ? 'var(--success)' : 'var(--warning)',
                    fontWeight: 700
                  }}
                >
                  {drugMasterSpecPdfReviewLabel}
                </span>
              )}
            </div>
            {drugMasterSpecPdfReview && !drugMasterSpecPdfReview.ok && (
              <div style={{
                display: 'grid',
                gap: '0.35rem',
                marginTop: '0.75rem',
                color: 'var(--text-muted)',
                fontSize: '0.78rem'
              }}>
                {drugMasterSpecPdfReview.parseIssues.slice(0, 3).map((issue) => (
                  <span key={issue}>読取確認: {issue}</span>
                ))}
                {drugMasterSpecPdfReview.differences.slice(0, 4).map((diff) => (
                  <span key={`${diff.itemNumber}-${diff.field}`}>
                    {diff.itemNumber}番 {drugMasterSpecPdfDiffFieldLabel[diff.field]}: 現在 {diff.expected} / PDF {diff.observed}
                  </span>
                ))}
              </div>
            )}
          </section>

          <div className="actions">
            <span
              className="btn-tooltip-wrapper"
              data-disabled={!canImportDrugMasterFromSourceUrl || isUploading || isImportingDrugMasterFromUrl || !canUpdateDrugMaster}
              title={
                !canUpdateDrugMaster
                  ? getPermissionDeniedMessage(currentUser, 'update_drug_master')
                  : !drugMasterSourceUrl.trim()
                    ? '更新元URLを入力するか支払基金のCSV/ZIP候補を選択してください'
                    : !canImportDrugMasterFromSourceUrl
                      ? 'URLから直接更新できるのはCSVまたはZIPです'
                      : ''
              }
            >
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleImportDrugMasterFromSourceUrl}
                disabled={!canImportDrugMasterFromSourceUrl || isUploading || isImportingDrugMasterFromUrl || !canUpdateDrugMaster}
                type="button"
              >
                {isImportingDrugMasterFromUrl ? (
                  <Loader2 size={18} className="spin" aria-hidden="true" />
                ) : (
                  <Download size={18} aria-hidden="true" />
                )}
                <span>{isImportingDrugMasterFromUrl ? '取得・更新中...' : '更新元URLから取得して更新'}</span>
              </button>
            </span>
            <span
              className="btn-tooltip-wrapper"
              data-disabled={!file || isUploading || isImportingDrugMasterFromUrl || !canUpdateDrugMaster}
              title={!canUpdateDrugMaster ? getPermissionDeniedMessage(currentUser, 'update_drug_master') : !file ? '更新を行うにはCSV/ZIPファイルを選択してください' : ''}
            >
              <button
                className="btn-primary"
                onClick={handleUpload}
                disabled={!file || isUploading || isImportingDrugMasterFromUrl || !canUpdateDrugMaster}
              >
                {isUploading ? (
                  <>
                    <Loader2 size={18} className="spin" aria-hidden="true" />
                    更新中...
                  </>
                ) : (
                  'マスタを更新する'
                )}
              </button>
            </span>
          </div>

          <p className="help-text">ヘッダー付きCSVは列名を確認し、ZIPは中のCSVを展開して取り込みます。更新後に差分CSVとロールバックJSONを自動で書き出します。</p>

          <section
            aria-label="医薬品マスターロールバック"
            style={{
              marginTop: '1.5rem',
              paddingTop: '1.25rem',
              borderTop: '1px solid var(--border)'
            }}
          >
            <h3 style={{ margin: '0 0 0.35rem', fontSize: '1rem' }}>医薬品マスターロールバック</h3>
            <p className="section-desc" style={{ marginBottom: '1rem' }}>
              更新時に出力されたロールバックJSONを選択すると、更新前の薬価・YJ・廃止状態へ戻せます。
            </p>

            <div className="upload-area">
              <label className="file-input-label">
                <FileText size={24} className="upload-icon" aria-hidden="true" />
                <span>ロールバックJSONを選択</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleDrugMasterRollbackFileChange}
                  className="hidden-input"
                  aria-label="医薬品マスターロールバックJSONをアップロード"
                />
              </label>
              {rollbackFile && (
                <div className="file-info">
                  選択中のロールバックJSON: <strong>{rollbackFile.name}</strong>
                </div>
              )}
            </div>

            <div className="actions">
              <span
                className="btn-tooltip-wrapper"
                data-disabled={!rollbackFile || isRollingBackDrugMaster || !canUpdateDrugMaster}
                title={!canUpdateDrugMaster ? getPermissionDeniedMessage(currentUser, 'update_drug_master') : !rollbackFile ? 'ロールバックJSONを選択してください' : ''}
              >
                <button
                  className="btn-secondary flex-center gap-2"
                  onClick={handleApplyDrugMasterRollback}
                  disabled={!rollbackFile || isRollingBackDrugMaster || !canUpdateDrugMaster}
                >
                  {isRollingBackDrugMaster ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <CheckCircle size={18} aria-hidden="true" />}
                  {isRollingBackDrugMaster ? 'ロールバック中...' : 'ロールバックを実行'}
                </button>
              </span>
            </div>
          </section>

          <section
            aria-label="薬品重複点検（マスタ統合）"
            data-testid="drug-duplicate-review-section"
            style={{ padding: '1.2rem 0 0', marginTop: '1.2rem', borderTop: '1px solid var(--border)' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
              <div>
                <h3>薬品重複点検（マスタ統合）</h3>
                <p className="help-text">
                  YJコードまたは薬品名が一致する薬品のうち、店舗で使用中（在庫・処方参照・棚番地あり）のものを洗い出します。統合すると在庫ロットと処方参照を「残す薬品」へ付け替え、在庫数を合算し、統合元を削除します（実行は監査ログに残ります）。一般名処方マスタ【般】行とデモ薬品は対象外です。過去に出力したUKE・請求スナップショットは変更しません。
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary flex-center gap-2"
                onClick={handleScanDrugDuplicates}
                disabled={!canUpdateDrugMaster || isScanningDrugDuplicates}
                title={!canUpdateDrugMaster ? getPermissionDeniedMessage(currentUser, 'update_drug_master') : undefined}
                data-testid="drug-duplicate-scan-button"
              >
                {isScanningDrugDuplicates ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
                <span>{isScanningDrugDuplicates ? '点検中...' : '重複候補を確認'}</span>
              </button>
            </div>
            {drugDuplicateMessage && <p className="help-text" role="status">{drugDuplicateMessage}</p>}
            {drugDuplicateReport && drugDuplicateReport.groups.length > 50 && (
              <p className="help-text">候補が多いため、使用量の多い先頭50グループのみ表示しています。統合後に再度点検してください。</p>
            )}
            {drugDuplicateReport && drugDuplicateReport.groups.length > 0 && (
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                {drugDuplicateReport.groups.slice(0, 50).map((group) => {
                  const targetCode = drugMergeTargets[group.groupId] || group.suggestedTargetCode;
                  return (
                    <div key={group.groupId} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                        <strong>{group.displayName}</strong>
                        <span className="help-text">{group.matchLabel} / {group.members.length}件</span>
                        {group.hasYjConflict && (
                          <span className="help-text" style={{ color: 'var(--danger)' }}>
                            YJコードが異なるため統合不可（別薬品の可能性）
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'grid', gap: '0.45rem' }}>
                        {group.members.map((member) => (
                          <div key={member.code} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                              <input
                                type="radio"
                                name={`drug-merge-target-${group.groupId}`}
                                checked={targetCode === member.code}
                                onChange={() => {
                                  setDrugMergeTargets((current) => ({ ...current, [group.groupId]: member.code }));
                                  setDrugMergeReview(null);
                                }}
                              />
                              <span>残す</span>
                            </label>
                            <span style={{ minWidth: '13rem' }}>{member.name}{member.isAbolished ? '（廃止）' : ''}</span>
                            <span className="help-text">コード {member.code}{member.yjCode ? ` / YJ ${member.yjCode}` : ''}</span>
                            <span className="help-text">在庫 {member.stockQuantity}（ロット{member.stockLotCount}件） / 処方参照 {member.prescriptionItemCount}件{member.location ? ` / 棚 ${member.location}` : ''}</span>
                            {member.code !== targetCode && (
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                                onClick={() => openDrugMergeReview(group, member.code)}
                                disabled={!canUpdateDrugMaster || isApplyingDrugMerge || group.hasYjConflict}
                                title={group.hasYjConflict ? 'YJコードが異なるため統合できません' : undefined}
                              >
                                統合確認
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {drugMergeReview?.groupId === group.groupId && (
                        <div style={{ marginTop: '0.7rem', padding: '0.7rem', borderRadius: '8px', background: 'var(--bg-subtle)' }} data-testid="drug-duplicate-merge-review">
                          <strong style={{ display: 'block', marginBottom: '0.35rem' }}>統合内容の確認</strong>
                          <p className="help-text">{drugMergeReview.plan.summary}</p>
                          {drugMergeReview.plan.issues.length > 0 && (
                            <ul className="help-text" style={{ margin: '0.35rem 0 0 1rem' }}>
                              {drugMergeReview.plan.issues.map((issue) => (
                                <li key={issue.code}>{issue.severity === 'error' ? '統合不可: ' : '確認: '}{issue.message}</li>
                              ))}
                            </ul>
                          )}
                          {drugMergeReview.plan.conflicts.length > 0 && (
                            <ul className="help-text" style={{ margin: '0.35rem 0 0 1rem' }}>
                              {drugMergeReview.plan.conflicts.map((conflict) => (
                                <li key={conflict.field}>{conflict.label}: 統合元「{conflict.sourceValue}」→ 残す値「{conflict.targetValue}」</li>
                              ))}
                            </ul>
                          )}
                          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.6rem' }}>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={handleApplyDrugMerge}
                              disabled={!drugMergeReview.executionPlan.canApply || isApplyingDrugMerge}
                              data-testid="drug-duplicate-merge-apply"
                            >
                              {isApplyingDrugMerge ? '統合中...' : '薬品統合を実行'}
                            </button>
                            <button type="button" className="btn-secondary" onClick={() => setDrugMergeReview(null)} disabled={isApplyingDrugMerge}>
                              閉じる
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="settings-section glass backup-section" data-testid="backup-section">
          <h2>バックアップ/復旧</h2>
          <p className="section-desc">この端末のローカルDBをJSONとして書き出し、選択したバックアップから同じIDのデータを復旧できます。</p>

          <div className="backup-alert" role="status">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>バックアップJSONには患者情報、薬歴、保険情報、操作ログが含まれます。店舗で定めた保管場所に保存し、不要な端末や共有フォルダへ置かないでください。</span>
          </div>

          <section className="backup-schedule-section" aria-label="閉店時バックアップ予定">
            <div className="backup-schedule-header">
              <div>
                <h3>閉店時バックアップ予定</h3>
                <p className="help-text">予定時刻を過ぎても今日の暗号化バックアップと外部保存確認が未完了なら、ダッシュボードと日次締めで要対応にします。</p>
              </div>
              <span
                className="backup-schedule-status"
                style={{
                  color: backupScheduleReviewColor,
                  background: backupScheduleReviewBackground
                }}
              >
                {backupScheduleReview.statusLabel}
              </span>
            </div>
            <div className="backup-schedule-summary">
              {[
                ['予定時刻', backupScheduleReview.scheduledTime],
                ['判定', backupScheduleReview.actionLabel],
                ['次の対応', backupScheduleReview.requiredActions.join(' / ')]
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <p className="help-text">{backupScheduleReview.detail}</p>
            <div className="backup-schedule-form">
              <label>
                <span>予定を有効にする</span>
                <input
                  type="checkbox"
                  checked={backupSchedulePolicy.enabled}
                  onChange={(e) => handleBackupSchedulePolicyChange({ enabled: e.target.checked })}
                />
              </label>
              <label>
                <span>予定時刻</span>
                <input
                  type="time"
                  className="form-control"
                  value={backupSchedulePolicy.scheduledTime}
                  onChange={(e) => handleBackupSchedulePolicyChange({ scheduledTime: e.target.value })}
                />
              </label>
              <label>
                <span>暗号化を必須にする</span>
                <input
                  type="checkbox"
                  checked={backupSchedulePolicy.requireEncrypted}
                  onChange={(e) => handleBackupSchedulePolicyChange({ requireEncrypted: e.target.checked })}
                />
              </label>
              <label>
                <span>外部保存確認を必須にする</span>
                <input
                  type="checkbox"
                  checked={backupSchedulePolicy.requireExternalStorage}
                  onChange={(e) => handleBackupSchedulePolicyChange({ requireExternalStorage: e.target.checked })}
                />
              </label>
              <button
                type="button"
                className="btn-secondary flex-center gap-2"
                onClick={handleSaveBackupSchedulePolicy}
                disabled={!canManageBackups || isSavingBackupSchedule}
                title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : undefined}
              >
                {isSavingBackupSchedule ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                <span>{isSavingBackupSchedule ? '保存中...' : '予定を保存'}</span>
              </button>
            </div>
          </section>

          <section
            aria-label="患者重複点検（名寄せ）"
            data-testid="patient-duplicate-review-section"
            style={{ padding: '0 0 1.2rem', marginBottom: '1.2rem', borderBottom: '1px solid var(--border)' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
              <div>
                <h3>患者重複点検（名寄せ）</h3>
                <p className="help-text">
                  氏名またはカナと生年月日が一致する患者を全件から洗い出します。統合すると受付とアラートを「残す患者」へ付け替え、統合元患者を削除します（実行は監査ログに残ります）。チュートリアルのデモ患者は対象外です。
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary flex-center gap-2"
                onClick={handleScanPatientDuplicates}
                disabled={!canManageBackups || isScanningPatientDuplicates}
                title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : undefined}
                data-testid="patient-duplicate-scan-button"
              >
                {isScanningPatientDuplicates ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
                <span>{isScanningPatientDuplicates ? '点検中...' : '重複候補を確認'}</span>
              </button>
            </div>
            {patientDuplicateMessage && <p className="help-text" role="status">{patientDuplicateMessage}</p>}
            {patientDuplicateReport && patientDuplicateReport.groups.length > 0 && (
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                {patientDuplicateReport.groups.map((group) => {
                  const targetPatientId = duplicateMergeTargets[group.groupId] || group.suggestedTargetPatientId;
                  return (
                    <div key={group.groupId} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                        <strong>{group.displayName}</strong>
                        <span className="help-text">{group.birthDate}</span>
                        <span className="help-text">{group.matchLabel} / {group.members.length}名</span>
                      </div>
                      <div style={{ display: 'grid', gap: '0.45rem' }}>
                        {group.members.map((member) => (
                          <div key={member.patientId} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                              <input
                                type="radio"
                                name={`duplicate-target-${group.groupId}`}
                                checked={targetPatientId === member.patientId}
                                onChange={() => {
                                  setDuplicateMergeTargets((current) => ({ ...current, [group.groupId]: member.patientId }));
                                  setDuplicateMergeReview(null);
                                }}
                              />
                              <span>残す</span>
                            </label>
                            <span style={{ minWidth: '9rem' }}>{member.name}{member.kana ? `（${member.kana}）` : ''}</span>
                            <span className="help-text">受付 {member.visitCount}件{member.latestVisitDate ? ` / 直近 ${member.latestVisitDate.slice(0, 10)}` : ''}</span>
                            <span className="help-text">保険者番号 {member.insuranceNumber || '未登録'}</span>
                            {member.patientId !== targetPatientId && (
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                                onClick={() => openDuplicateMergeReview(group, member.patientId)}
                                disabled={!canManageBackups || isApplyingDuplicateMerge}
                              >
                                統合確認
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {duplicateMergeReview?.groupId === group.groupId && (
                        <div style={{ marginTop: '0.7rem', padding: '0.7rem', borderRadius: '8px', background: 'var(--bg-subtle)' }} data-testid="patient-duplicate-merge-review">
                          <strong style={{ display: 'block', marginBottom: '0.35rem' }}>統合内容の確認</strong>
                          <p className="help-text">{duplicateMergeReview.plan.summary}</p>
                          {duplicateMergeReview.plan.issues.length > 0 && (
                            <ul className="help-text" style={{ margin: '0.35rem 0 0 1rem' }}>
                              {duplicateMergeReview.plan.issues.map((issue) => (
                                <li key={issue.code}>{issue.severity === 'error' ? '要修正: ' : '確認: '}{issue.message}</li>
                              ))}
                            </ul>
                          )}
                          {duplicateMergeReview.plan.conflicts.length > 0 && (
                            <ul className="help-text" style={{ margin: '0.35rem 0 0 1rem' }}>
                              {duplicateMergeReview.plan.conflicts.map((conflict) => (
                                <li key={conflict.field}>{conflict.label}: 統合元「{conflict.sourceValue}」→ 残す値「{conflict.targetValue}」</li>
                              ))}
                            </ul>
                          )}
                          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.6rem' }}>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={handleApplyDuplicateMerge}
                              disabled={!duplicateMergeReview.executionPlan.canApply || isApplyingDuplicateMerge}
                              data-testid="patient-duplicate-merge-apply"
                            >
                              {isApplyingDuplicateMerge ? '統合中...' : '患者統合を実行'}
                            </button>
                            <button type="button" className="btn-secondary" onClick={() => setDuplicateMergeReview(null)} disabled={isApplyingDuplicateMerge}>
                              閉じる
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section
            aria-label="バックアップ世代管理"
            style={{
              padding: '0 0 1.2rem',
              marginBottom: '1.2rem',
              borderBottom: '1px solid var(--border)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>バックアップ世代管理</h3>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                  直近{backupGenerationReview.retentionDays}日 / 必要 {backupGenerationReview.requiredGenerationCount}世代
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                <span style={{
                  color: backupGenerationReviewColor,
                  background: backupGenerationReviewBackground,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '999px',
                  padding: '0.18rem 0.65rem',
                  fontSize: '0.78rem',
                  fontWeight: 800
                }}>
                  {backupGenerationReview.statusLabel}
                </span>
                <button
                  className="btn-secondary flex-center gap-2"
                  style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
                  onClick={handleExportBackupGenerationReviewCsv}
                  disabled={!canManageBackups || isExportingBackupGenerationReview}
                  title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : undefined}
                >
                  {isExportingBackupGenerationReview ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>世代管理CSV</span>
                </button>
              </div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '0.75rem',
              marginBottom: '0.85rem'
            }}>
              {[
                ['保存世代', `${backupGenerationReview.generationCount}世代`],
                ['暗号化', `${backupGenerationReview.encryptedGenerationCount}世代`],
                ['復旧テスト', backupGenerationReview.drillAgeDays === undefined ? '未記録' : `${backupGenerationReview.drillAgeDays}日前`],
                ['外部保存', backupGenerationReview.externalStorageStatusLabel],
                ['対応', backupGenerationReview.actionLabel]
              ].map(([label, value]) => (
                <div key={label} style={{ borderLeft: '3px solid var(--primary)', padding: '0.2rem 0 0.2rem 0.65rem' }}>
                  <div style={{ color: 'var(--text-ghost)', fontSize: '0.74rem', fontWeight: 700 }}>{label}</div>
                  <div style={{ color: label === '保存世代' || label === '外部保存' ? backupGenerationReviewColor : 'var(--text-main)', fontSize: '1.02rem', fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.8rem',
              marginBottom: '0.85rem',
              color: 'var(--text-muted)',
              fontSize: '0.8rem'
            }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem', background: soapDraftFeedbackBackground }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.7rem' }}>
                  <div>
                    <div style={{ color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 800 }}>SOAP下書き品質レビュー</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 700 }}>
                      採否 {aiSuggestionFeedbackReview.soapDraftSummary.totalCount}件 / {aiSuggestionFeedbackReview.soapDraftSummary.actionLabel}
                    </div>
                  </div>
                  <span style={{
                    color: soapDraftFeedbackColor,
                    background: '#ffffff',
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    borderRadius: '999px',
                    padding: '0.16rem 0.55rem',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    whiteSpace: 'nowrap'
                  }}>
                    {aiSuggestionFeedbackReview.soapDraftSummary.statusLabel}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: '0.55rem', marginBottom: '0.65rem' }}>
                  {[
                    ['採用率', `${aiSuggestionFeedbackReview.soapDraftSummary.acceptanceRate}%`],
                    ['修正/却下率', `${aiSuggestionFeedbackReview.soapDraftSummary.correctionRate}%`],
                    ['平均信頼度', aiSuggestionFeedbackReview.soapDraftSummary.averageConfidence === undefined ? '-' : `${aiSuggestionFeedbackReview.soapDraftSummary.averageConfidence}%`],
                    ['S/O/A/P', `${aiSuggestionFeedbackReview.soapDraftSummary.typeCounts.S}/${aiSuggestionFeedbackReview.soapDraftSummary.typeCounts.O}/${aiSuggestionFeedbackReview.soapDraftSummary.typeCounts.A}/${aiSuggestionFeedbackReview.soapDraftSummary.typeCounts.P}`]
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ color: 'var(--text-ghost)', fontSize: '0.7rem', fontWeight: 800 }}>{label}</div>
                      <div style={{ color: 'var(--text-main)', fontSize: '0.94rem', fontWeight: 800 }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ color: soapDraftFeedbackColor, fontSize: '0.78rem', fontWeight: 700 }}>
                  {aiSuggestionFeedbackReview.soapDraftSummary.requiredActions.join(' / ')}
                </div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem', background: '#ffffff' }}>
                <div style={{ color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.7rem' }}>提案種別別</div>
                {aiSuggestionFeedbackReview.domainSummaries.length > 0 ? (
                  <div style={{ display: 'grid', gap: '0.55rem' }}>
                    {aiSuggestionFeedbackReview.domainSummaries.map((summary) => (
                      <div key={summary.domain} style={{ display: 'grid', gridTemplateColumns: 'minmax(86px, 1fr) auto auto auto', gap: '0.55rem', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-main)', fontWeight: 800 }}>{summary.domainLabel}</span>
                        <span>{summary.totalCount}件</span>
                        <span>採用 {summary.acceptanceRate}%</span>
                        <span>修正/却下 {summary.correctionRate}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontWeight: 700 }}>今月の提案種別ログは未記録です。</div>
                )}
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem', background: storeFeedbackBackground }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.7rem' }}>
                  <div>
                    <div style={{ color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 800 }}>店舗別フィードバック比較</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 700 }}>
                      {aiSuggestionFeedbackReview.storeComparison.currentStoreName} / 比較店舗 {aiSuggestionFeedbackReview.storeComparison.storeCount}件
                    </div>
                  </div>
                  <span style={{
                    color: storeFeedbackColor,
                    background: '#ffffff',
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    borderRadius: '999px',
                    padding: '0.16rem 0.55rem',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    whiteSpace: 'nowrap'
                  }}>
                    {aiSuggestionFeedbackReview.storeComparison.statusLabel}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(98px, 1fr))', gap: '0.55rem', marginBottom: '0.65rem' }}>
                  {[
                    ['自店採用率', aiSuggestionFeedbackReview.storeComparison.currentStore ? `${aiSuggestionFeedbackReview.storeComparison.currentStore.acceptanceRate}%` : '-'],
                    ['全体平均', `${aiSuggestionFeedbackReview.storeComparison.allStoreAverageAcceptanceRate}%`],
                    ['他店平均', aiSuggestionFeedbackReview.storeComparison.peerAverageAcceptanceRate === undefined ? '-' : `${aiSuggestionFeedbackReview.storeComparison.peerAverageAcceptanceRate}%`],
                    ['平均との差', aiSuggestionFeedbackReview.storeComparison.currentStore ? `${aiSuggestionFeedbackReview.storeComparison.currentStore.differenceFromAverage > 0 ? '+' : ''}${aiSuggestionFeedbackReview.storeComparison.currentStore.differenceFromAverage}pt` : '-']
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ color: 'var(--text-ghost)', fontSize: '0.7rem', fontWeight: 800 }}>{label}</div>
                      <div style={{ color: 'var(--text-main)', fontSize: '0.94rem', fontWeight: 800 }}>{value}</div>
                    </div>
                  ))}
                </div>
                {aiSuggestionFeedbackReview.storeComparison.storeSummaries.length > 0 && (
                  <div style={{ display: 'grid', gap: '0.4rem', marginBottom: '0.65rem' }}>
                    {aiSuggestionFeedbackReview.storeComparison.storeSummaries.slice(0, 3).map((summary) => (
                      <div key={summary.storeKey} style={{ display: 'grid', gridTemplateColumns: 'minmax(92px, 1fr) auto auto', gap: '0.55rem', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-main)', fontWeight: 800 }}>{summary.storeName}</span>
                        <span>{summary.totalCount}件</span>
                        <span>採用 {summary.acceptanceRate}%</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ color: storeFeedbackColor, fontSize: '0.78rem', fontWeight: 700 }}>
                  {aiSuggestionFeedbackReview.storeComparison.requiredActions.join(' / ')}
                </div>
              </div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.8rem',
              color: 'var(--text-muted)',
              fontSize: '0.8rem'
            }}>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>最新バックアップ</div>
                <div style={{ color: 'var(--text-main)', fontWeight: 700, wordBreak: 'break-all' }}>{latestBackupGenerationLabel}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>最新復旧テスト</div>
                <div style={{ color: 'var(--text-main)', fontWeight: 700 }}>{latestBackupDrillLabel}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>最新外部保存確認</div>
                <div style={{ color: 'var(--text-main)', fontWeight: 700, wordBreak: 'break-all' }}>{latestBackupExternalStorageLabel}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>必要な対応</div>
                <div style={{ color: backupGenerationReview.status === 'pass' ? 'var(--text-main)' : backupGenerationReviewColor, fontWeight: 700 }}>
                  {backupGenerationReview.requiredActions.join(' / ')}
                </div>
              </div>
            </div>
          </section>

          <div className="backup-workflow">
            <section className="backup-workflow-item">
              <div>
                <h3>バックアップを書き出す</h3>
                <p className="help-text">患者、受付、処方、薬歴、マスタ、設定、スタッフ、操作ログをまとめて保存します。</p>
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={useEncryption}
                      onChange={(e) => setUseEncryption(e.target.checked)}
                      style={{ width: '1rem', height: '1rem', accentColor: 'var(--primary)' }}
                      aria-label="バックアップファイルをパスワードで暗号化する"
                      data-testid="backup-export-encryption-checkbox"
                    />
                    <span>バックアップファイルをパスワードで暗号化する（推奨・既定）</span>
                  </label>
                  {!useEncryption && (
                    <div className="backup-plain-warning" role="alert">
                      暗号化しないバックアップには患者情報、薬歴、スタッフ情報、監査ログが平文で含まれます。移行や障害対応などの例外時だけ使用してください。
                    </div>
                  )}
                  {useEncryption && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', maxWidth: '300px' }}>
                      <input
                        type={showExportPassword ? 'text' : 'password'}
                        placeholder="暗号化パスワードを入力"
                        value={exportPassword}
                        onChange={(e) => setExportPassword(e.target.value)}
                        className="form-control"
                        style={{ margin: 0, padding: '0.4rem 0.6rem', fontSize: '0.88rem', flex: 1 }}
                        aria-label="暗号化パスワード"
                        data-testid="backup-export-password"
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '0.4rem 0.6rem', minHeight: 'auto', fontSize: '0.75rem' }}
                        onClick={() => setShowExportPassword(!showExportPassword)}
                      >
                        {showExportPassword ? '隠す' : '表示'}
                      </button>
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={exportBackupExternalTransferManifest}
                      onChange={(e) => setExportBackupExternalTransferManifest(e.target.checked)}
                      style={{ width: '1rem', height: '1rem', accentColor: 'var(--primary)' }}
                      aria-label="外部保存連携JSONも出力する"
                      data-testid="backup-export-transfer-manifest-checkbox"
                    />
                    <span>外部保存連携JSONも出力する</span>
                  </label>
                  {exportBackupExternalTransferManifest && (
                    <label style={{ display: 'grid', gap: '0.25rem', maxWidth: '160px', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                      <span>保存先保持日数</span>
                      <input
                        type="number"
                        min={1}
                        className="form-control"
                        value={externalBackupRetentionDays}
                        onChange={(e) => setExternalBackupRetentionDays(Number(e.target.value) || 1)}
                        style={{ margin: 0, padding: '0.4rem 0.6rem', fontSize: '0.88rem' }}
                        data-testid="backup-export-transfer-retention-days"
                      />
                    </label>
                  )}
                </div>
              </div>
              <button
                className="btn-primary flex-center gap-2"
                onClick={handleExportBackup}
                disabled={isExportingBackup || !canManageBackups}
                title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : undefined}
                data-testid="backup-export-button"
              >
                {isExportingBackup ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
                <span>{isExportingBackup ? '書き出し中...' : 'バックアップを書き出す'}</span>
              </button>
            </section>

            <section className="backup-workflow-item backup-external-item">
              <div>
                <h3>外部保存を確認する</h3>
                <p className="help-text">書き出したバックアップを店舗で定めた保存先へ置き、保存先から開けることと上書き・削除されにくい設定を確認します。</p>
              </div>
              <button
                className="btn-primary flex-center gap-2"
                onClick={handleRecordBackupExternalStorage}
                disabled={isRecordingExternalBackupStorage || !canManageBackups}
                title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : undefined}
              >
                {isRecordingExternalBackupStorage ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
                <span>{isRecordingExternalBackupStorage ? '記録中...' : '外部保存を記録'}</span>
              </button>
              <div className="backup-external-form">
                <label>
                  <span>バックアップファイル名</span>
                  <input
                    type="text"
                    className="form-control"
                    value={externalBackupFileName}
                    onChange={(e) => setExternalBackupFileName(e.target.value)}
                    placeholder={backupGenerationReview.latestBackup?.fileName || 'yakureki_backup_YYYYMMDD_HHMMSS.json'}
                  />
                </label>
                <label>
                  <span>保存先名</span>
                  <input
                    type="text"
                    className="form-control"
                    value={externalBackupDestinationName}
                    onChange={(e) => setExternalBackupDestinationName(e.target.value)}
                    placeholder="例: 店舗バックアップ保管庫"
                    data-testid="backup-external-destination-name"
                  />
                </label>
                <label>
                  <span>保存先パス/URL</span>
                  <input
                    type="text"
                    className="form-control"
                    value={externalBackupDestinationPath}
                    onChange={(e) => setExternalBackupDestinationPath(e.target.value)}
                    placeholder="例: s3://pharmacy-backup/yakureki/"
                    data-testid="backup-external-destination-path"
                  />
                </label>
                <label>
                  <span>確認者</span>
                  <input
                    type="text"
                    className="form-control"
                    value={externalBackupVerifierName}
                    onChange={(e) => setExternalBackupVerifierName(e.target.value)}
                    placeholder={currentUser.name || '管理者'}
                  />
                </label>
                <div className="backup-external-checks">
                  <label>
                    <input
                      type="checkbox"
                      checked={externalBackupReadBackVerified}
                      onChange={(e) => setExternalBackupReadBackVerified(e.target.checked)}
                    />
                    <span>保存先から開ける</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={externalBackupImmutableVerified}
                      onChange={(e) => setExternalBackupImmutableVerified(e.target.checked)}
                    />
                    <span>上書き・削除不可を確認</span>
                  </label>
                </div>
                <label className="backup-external-notes">
                  <span>備考</span>
                  <input
                    type="text"
                    className="form-control"
                    value={externalBackupNotes}
                    onChange={(e) => setExternalBackupNotes(e.target.value)}
                    placeholder="例: オブジェクトロック30日を確認"
                    data-testid="backup-external-notes"
                  />
                </label>
                <div className="backup-external-receipt">
                  <label className="file-input-label">
                    <FileText size={22} className="upload-icon" aria-hidden="true" />
                    <span>受領書JSONを選択</span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={handleExternalBackupReceiptFileChange}
                      className="hidden-input"
                      aria-label="外部保存ジョブ受領書JSONを選択"
                      disabled={isRecordingExternalBackupReceipt}
                    />
                  </label>
                  {externalBackupReceiptFile && (
                    <div className="file-info">
                      選択中の受領書: <strong>{externalBackupReceiptFile.name}</strong>
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn-secondary flex-center gap-2"
                    onClick={handleRecordBackupExternalTransferReceipt}
                    disabled={!canManageBackups || !externalBackupReceiptFile || isRecordingExternalBackupReceipt}
                    title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : !externalBackupReceiptFile ? '外部保存ジョブ受領書JSONを選択してください' : undefined}
                  >
                    {isRecordingExternalBackupReceipt ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
                    <span>{isRecordingExternalBackupReceipt ? '受領書を記録中...' : '受領書を監査ログへ記録'}</span>
                  </button>
                </div>
              </div>
            </section>

            <section className="backup-workflow-item">
              <div>
                <h3>移行CSVをプレビュー</h3>
                <p className="help-text">既存薬局ソフトから出力した患者CSV/TSV、受付CSV/TSV、在庫CSV/TSV、薬歴CSV/TSVを、復旧前プレビューで確認できる移行データに変換します。</p>
              </div>
              <div className="backup-import-controls">
                <div role="group" aria-label="移行CSV種別" style={{ display: 'inline-flex', gap: '0.35rem', padding: '0.2rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-subtle)' }}>
                  {[
                    ['patients', '患者'],
                    ['visits', '受付'],
                    ['drug_stocks', '在庫'],
                    ['soap_records', '薬歴']
                  ].map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      className={migrationCsvKind === kind ? 'btn-primary' : 'btn-secondary'}
                      onClick={() => handleMigrationCsvKindChange(kind as 'patients' | 'visits' | 'drug_stocks' | 'soap_records')}
                      disabled={isAnalyzingMigrationCsv || isAnalyzingDiff}
                      style={{ minHeight: 'auto', padding: '0.38rem 0.75rem', fontSize: '0.78rem', boxShadow: 'none' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="file-input-label">
                  <FileText size={24} className="upload-icon" aria-hidden="true" />
                  <span>CSV/TSVを選択</span>
                  <input
                    type="file"
                    accept=".csv,.tsv,text/csv,text/tab-separated-values"
                    onChange={handleMigrationCsvFileChange}
                    className="hidden-input"
                    aria-label="移行CSVファイルを選択"
                    disabled={isAnalyzingMigrationCsv || isAnalyzingDiff}
                  />
                </label>
                {migrationCsvFile && (
                  <div className="file-info">
                    選択中のファイル: <strong>{migrationCsvFile.name}</strong>
                  </div>
                )}
                <button
                  className="btn-primary flex-center gap-2"
                  onClick={handleAnalyzeMigrationCsv}
                  disabled={!migrationCsvFile || isAnalyzingMigrationCsv || isAnalyzingDiff || !canManageBackups}
                  title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : !migrationCsvFile ? 'CSV/TSVを選択してください' : undefined}
                >
                  {isAnalyzingMigrationCsv ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
                  <span>{isAnalyzingMigrationCsv ? '解析中...' : 'CSVを変換してプレビュー'}</span>
                </button>
              </div>

              {migrationCsvPreview && (
                <div
                  aria-label="移行CSVマッピング"
                  style={{
                    gridColumn: '1 / -1',
                    marginTop: '0.75rem',
                    borderTop: '1px solid rgba(148, 163, 184, 0.28)',
                    paddingTop: '0.85rem',
                    display: 'grid',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                      <strong style={{ color: 'var(--text-main)', fontSize: '0.88rem' }}>
                        {migrationCsvKind === 'patients'
                          ? '患者CSV移行マッピング'
                          : migrationCsvKind === 'visits'
                            ? '受付CSV移行マッピング'
                            : migrationCsvKind === 'drug_stocks'
                              ? '在庫CSV移行マッピング'
                              : '薬歴CSV移行マッピング'}
                      </strong>
                      <span style={backupDrillStatusStyle(migrationCsvPreview.status)}>
                        {migrationCsvPreview.statusLabel}
                      </span>
                    </div>
                    {migrationCsvPreview.sourceFormat && (
                      <span style={{ color: 'var(--text-ghost)', fontSize: '0.74rem', fontWeight: 700 }}>
                        {migrationCsvPreview.sourceFormat.delimiter === 'tab' ? 'TSV' : 'CSV'} / 見出し {migrationCsvPreview.sourceFormat.headerLine}行目
                      </span>
                    )}
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: '0.55rem'
                  }}>
                    {[
                      [migrationCsvKind === 'patients' ? '患者行' : migrationCsvKind === 'visits' ? '受付行' : migrationCsvKind === 'drug_stocks' ? '在庫行' : '薬歴行', `${migrationCsvPreview.rows.length}件`],
                      ['指摘', `${migrationCsvPreview.issues.length}件`],
                      ['ID欠落', `${migrationCsvPreview.diagnostic.missingPrimaryKeyCount}件`],
                      ['同一ID重複', `${migrationCsvPreview.diagnostic.duplicatePrimaryKeyCount}件`],
                      ['文字化け疑い', `${migrationCsvPreview.diagnostic.mojibakeSuspectCount}件`]
                    ].map(([label, value]) => (
                      <div key={label} style={{ borderLeft: '3px solid rgba(37, 99, 235, 0.35)', paddingLeft: '0.55rem' }}>
                        <div style={{ color: 'var(--text-ghost)', fontSize: '0.68rem', fontWeight: 800 }}>{label}</div>
                        <div style={{ color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 800 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {migrationCsvPreview.sourceFormat && Object.keys(migrationCsvPreview.sourceFormat.recognizedColumns).length > 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', fontWeight: 700 }}>
                      認識列: {Object.values(migrationCsvPreview.sourceFormat.recognizedColumns).filter(Boolean).join(' / ')}
                    </div>
                  )}
                  {migrationCsvPreview.issues.length > 0 && (
                    <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.74rem' }}>
                      {migrationCsvPreview.issues.slice(0, 4).map((issue) => (
                        <div key={`${issue.code}-${issue.line || 'file'}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(72px, 0.35fr) minmax(140px, 0.55fr) minmax(180px, 1fr)', gap: '0.45rem', alignItems: 'center' }}>
                          <span style={backupDrillStatusStyle(issue.severity === 'error' ? 'blocked' : 'attention')}>
                            {issue.severity === 'error' ? '修正' : '要確認'}
                          </span>
                          <span style={{ color: 'var(--text-main)', fontWeight: 800 }}>{issue.title}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{issue.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.45rem 0.9rem', minHeight: 'auto', fontSize: '0.78rem' }}
                      onClick={() => downloadTextFile(
                        `yakureki_${migrationCsvKind === 'patients' ? 'patient' : migrationCsvKind === 'visits' ? 'visit' : migrationCsvKind === 'drug_stocks' ? 'drug_stock' : 'soap'}_migration_${formatDateTimeStamp(new Date())}.json`,
                        JSON.stringify(migrationCsvPreview.backup, null, 2),
                        'application/json;charset=utf-8'
                      )}
                    >
                      変換JSONを保存
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="backup-workflow-item" style={{ borderBottom: pendingBackupPayload ? 'none' : '1px solid var(--border)' }}>
              <div>
                <h3>バックアップを復旧する</h3>
                <p className="help-text">バックアップ内にある既存IDのデータは更新され、未登録のデータは追加されます。</p>
              </div>
              <div className="backup-import-controls">
                <label className="file-input-label">
                  <UploadCloud size={24} className="upload-icon" aria-hidden="true" />
                  <span>JSONを選択</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleBackupFileChange}
                    className="hidden-input"
                    aria-label="バックアップJSONファイルを選択"
                    disabled={showImportPasswordInput || !!pendingBackupPayload}
                  />
                </label>
                {backupFile && (
                  <div className="file-info">
                    選択中のファイル: <strong>{backupFile.name}</strong>
                  </div>
                )}
                {!showImportPasswordInput && !pendingBackupPayload && (
                  <button
                    className="btn-primary flex-center gap-2"
                    onClick={handleImportBackup}
                    disabled={!backupFile || isImportingBackup || isAnalyzingDiff || !canManageBackups}
                    title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : !backupFile ? '復旧するJSONファイルを選択してください' : undefined}
                  >
                    {isAnalyzingDiff ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <UploadCloud size={18} aria-hidden="true" />}
                    <span>{isAnalyzingDiff ? '解析中...' : 'バックアップを復旧する'}</span>
                  </button>
                )}
              </div>

              {showImportPasswordInput && (
                <div style={{
                  gridColumn: '1 / -1',
                  marginTop: '1rem',
                  padding: '1.25rem',
                  background: '#fffbeb',
                  border: '1px solid #fcd34d',
                  borderRadius: '8px',
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>🔑 暗号化されたバックアップファイルです。復号用パスワードを入力してください。</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%', maxWidth: '500px' }}>
                    <input
                      type="password"
                      placeholder="復号用パスワードを入力"
                      value={importPassword}
                      onChange={(e) => setImportPassword(e.target.value)}
                      className="form-control"
                      style={{ margin: 0, padding: '0.5rem', fontSize: '0.9rem', flex: 1 }}
                      aria-label="復号用パスワード"
                    />
                    <button
                      className="btn-primary"
                      onClick={handleDecryptAndAnalyze}
                      style={{ minHeight: 'auto', padding: '0.5rem 1.25rem' }}
                    >
                      復号する
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={handleCancelRestore}
                      style={{ minHeight: 'auto', padding: '0.5rem 1.25rem' }}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}

              {backupDiffs && pendingBackupPayload && (
                <div style={{
                  gridColumn: '1 / -1',
                  marginTop: '1rem',
                  padding: '1.5rem',
                  border: '2px solid var(--primary)',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.98)',
                  boxShadow: 'var(--shadow-md)',
                  width: '100%'
                }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-dark)', fontSize: '1.1rem' }}>
                    <ShieldCheck size={20} className="text-success" />
                    <span>復旧前プレビュー（差分解析結果）</span>
                  </h3>
                  <p className="help-text" style={{ marginBottom: '1rem', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                    アップロードされたバックアップから差分を検出しました。内容を確認し、問題なければ「復旧を実行する」をクリックしてください。既存IDのデータは上書きされます。
                  </p>

                  {backupDrillReport && (
                    <div
                      aria-label="復旧テスト（訓練）レポート"
                      style={{
                        borderTop: '1px solid rgba(148, 163, 184, 0.28)',
                        borderBottom: '1px solid rgba(148, 163, 184, 0.28)',
                        padding: '0.85rem 0',
                        marginBottom: '1rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                          <strong style={{ color: 'var(--text-main)', fontSize: '0.92rem' }}>復旧テスト（訓練）</strong>
                          <span style={backupDrillStatusStyle(backupDrillReport.status)}>{backupDrillReport.statusLabel}</span>
                        </div>
                        <span style={{ color: 'var(--text-ghost)', fontSize: '0.74rem' }}>
                          バックアップ作成 {new Date(backupDrillReport.backupCreatedAt).toLocaleString('ja-JP')}
                        </span>
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                        gap: '0.6rem',
                        marginBottom: '0.75rem'
                      }}>
                        {[
                          ['対象件数', `${backupDrillReport.totalRows}件`],
                          ['対象区分', `${backupDrillReport.collectionCount}区分`],
                          ['新規追加', `${backupDrillReport.diffSummary.added}件`],
                          ['上書き更新', `${backupDrillReport.diffSummary.updated}件`],
                          ['変更なし', `${backupDrillReport.diffSummary.unchanged}件`]
                        ].map(([label, value]) => (
                          <div key={label} style={{ borderLeft: '3px solid rgba(37, 99, 235, 0.45)', paddingLeft: '0.55rem' }}>
                            <div style={{ color: 'var(--text-ghost)', fontSize: '0.7rem', fontWeight: 700 }}>{label}</div>
                            <div style={{ color: 'var(--text-main)', fontSize: '0.98rem', fontWeight: 800 }}>{value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'grid', gap: '0.35rem' }}>
                        {backupDrillReport.checks.map((check) => (
                          <div key={check.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 0.6fr) minmax(70px, 0.35fr) minmax(180px, 1fr)', gap: '0.5rem', alignItems: 'center', fontSize: '0.78rem' }}>
                            <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{check.label}</span>
                            <span style={backupDrillStatusStyle(check.status)}>
                              {check.status === 'pass' ? 'OK' : check.status === 'attention' ? '要確認' : '不可'}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>{check.detail}</span>
                          </div>
                        ))}
                      </div>
                      <div
                        aria-label="導入移行診断"
                        style={{
                          borderTop: '1px solid rgba(148, 163, 184, 0.28)',
                          marginTop: '0.85rem',
                          paddingTop: '0.85rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
                          <strong style={{ color: 'var(--text-main)', fontSize: '0.88rem' }}>導入移行診断</strong>
                          <span style={backupDrillStatusStyle(backupDrillReport.migrationDiagnostic.status)}>
                            {backupDrillReport.migrationDiagnostic.statusLabel}
                          </span>
                        </div>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                          gap: '0.55rem',
                          marginBottom: '0.65rem'
                        }}>
                          {[
                            ['ID欠落', `${backupDrillReport.migrationDiagnostic.missingPrimaryKeyCount}件`],
                            ['同一ID重複', `${backupDrillReport.migrationDiagnostic.duplicatePrimaryKeyCount}件`],
                            ['文字化け疑い', `${backupDrillReport.migrationDiagnostic.mojibakeSuspectCount}件`],
                            ['必須領域不足', `${backupDrillReport.migrationDiagnostic.missingRequiredCollectionCount}件`]
                          ].map(([label, value]) => (
                            <div key={label} style={{ borderLeft: '3px solid rgba(37, 99, 235, 0.35)', paddingLeft: '0.55rem' }}>
                              <div style={{ color: 'var(--text-ghost)', fontSize: '0.68rem', fontWeight: 800 }}>{label}</div>
                              <div style={{ color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 800 }}>{value}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ color: backupDrillReport.migrationDiagnostic.status === 'pass' ? 'var(--text-muted)' : 'var(--warning)', fontSize: '0.76rem', fontWeight: 750, marginBottom: backupDrillReport.migrationDiagnostic.issues.length > 0 ? '0.55rem' : 0 }}>
                          {backupDrillReport.migrationDiagnostic.requiredActions.join(' / ')}
                        </div>
                        {backupDrillReport.migrationDiagnostic.issues.length > 0 && (
                          <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.74rem' }}>
                            {backupDrillReport.migrationDiagnostic.issues.slice(0, 4).map((issue) => (
                              <div key={issue.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(72px, 0.35fr) minmax(96px, 0.4fr) minmax(180px, 1fr)', gap: '0.45rem', alignItems: 'center' }}>
                                <span style={backupDrillStatusStyle(issue.severity)}>{issue.severity === 'blocked' ? '不可' : '要確認'}</span>
                                <span style={{ color: 'var(--text-main)', fontWeight: 800 }}>{issue.label}</span>
                                <span style={{ color: 'var(--text-muted)' }}>{issue.detail}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div style={{
                    maxHeight: '260px',
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    marginBottom: '1.25rem'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '0.6rem 0.75rem', fontWeight: 600 }}>データ区分</th>
                          <th style={{ padding: '0.6rem 0.75rem', color: 'var(--success)', fontWeight: 600 }}>新規追加</th>
                          <th style={{ padding: '0.6rem 0.75rem', color: 'var(--warning)', fontWeight: 600 }}>上書き更新</th>
                          <th style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>変更なし</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backupDiffs.map((diff) => {
                          const collectionLabels: Record<string, string> = {
                            facility_settings: '施設基準設定',
                            patients: '患者情報',
                            visits: '受付・来局記録',
                            prescription_items: '処方データ',
                            soap_records: '薬歴（SOAP）',
                            alerts: 'アレルギー・疾患警告',
                            interventions: '疑義照会・介入記録',
                            drugs: '薬品マスタ',
                            drug_stocks: '薬品在庫',
                            locations: '配置棚位置',
                            drug_infos: '添付文書・相互作用マスタ',
                            medication_guidances: '服薬指導計画',
                            patient_medication_info_templates: '薬情テンプレ',
                            users: 'スタッフ情報',
                            audit_logs: '操作ログ（監査証跡）'
                          };
                          const label = collectionLabels[diff.collection] || diff.collection;

                          if (diff.added === 0 && diff.updated === 0 && diff.unchanged === 0) {
                            return null;
                          }

                          return (
                            <tr key={diff.collection} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--text-main)' }}>{label}</td>
                              <td style={{ padding: '0.5rem 0.75rem', color: diff.added > 0 ? 'var(--success)' : 'inherit', fontWeight: diff.added > 0 ? 600 : 'normal' }}>
                                {diff.added > 0 ? `+${diff.added} 件` : '0'}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', color: diff.updated > 0 ? 'var(--warning)' : 'inherit', fontWeight: diff.updated > 0 ? 600 : 'normal' }}>
                                {diff.updated > 0 ? `${diff.updated} 件` : '0'}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-ghost)' }}>
                                {diff.unchanged}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button
                      className="btn-secondary"
                      onClick={handleCancelRestore}
                      disabled={isImportingBackup}
                      style={{ padding: '0.5rem 1.25rem' }}
                    >
                      キャンセル
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={handleRecordBackupDrill}
                      disabled={isImportingBackup || !backupDrillReport}
                      style={{ padding: '0.5rem 1.25rem' }}
                    >
                      復旧テストを記録
                    </button>
                    <button
                      className="btn-primary"
                      onClick={handleConfirmRestore}
                      disabled={isImportingBackup || backupDrillReport?.status === 'blocked'}
                      title={backupDrillReport?.status === 'blocked' ? '復旧前診断が復旧不可です。ID欠落や重複を修正してください。' : undefined}
                      style={{ padding: '0.5rem 1.5rem', background: 'var(--success)', borderColor: 'var(--success)', boxShadow: 'none' }}
                    >
                      {isImportingBackup ? (
                        <>
                          <Loader2 size={16} className="spin" aria-hidden="true" />
                          <span>復旧を実行中...</span>
                        </>
                      ) : (
                        <span>復旧を実行する</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {activeTab === 'officialAudit' && (
        <div className="settings-section glass official-audit-section">
          <div className="official-audit-header">
            <div>
              <h2>公式仕様点検</h2>
              <p className="section-desc">厚労省・支払基金などの公開資料に照らした、請求仕様・帳票・保険・権限・運用の自己点検です。</p>
            </div>
            <div className="official-audit-score" aria-label={`公式仕様点検進捗 ${officialAuditSummary.completionRate}%`}>
              <ShieldCheck size={22} aria-hidden="true" />
              <span>{officialAuditSummary.completionRate}%</span>
            </div>
          </div>

          <div className="official-audit-metrics">
            <div>
              <span>総項目</span>
              <strong>{officialAuditSummary.total}</strong>
            </div>
            <div>
              <span>部分対応</span>
              <strong>{officialAuditSummary.partial}</strong>
            </div>
            <div>
              <span>未対応</span>
              <strong>{officialAuditSummary.open}</strong>
            </div>
            <div className={officialAuditSummary.blockers > 0 ? 'metric-danger' : ''}>
              <span>最重要未完</span>
              <strong>{officialAuditSummary.blockers}</strong>
            </div>
          </div>

          {officialAuditBlockers.length > 0 && (
            <div className="official-audit-alert" role="status">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>
                {officialAuditBlockers.length}件の最重要項目が点検未完了です。請求運用前に点数、UKE、保険・公費、バックアップを優先してください。
              </span>
            </div>
          )}

          <section
            className="official-audit-review-workspace"
            aria-labelledby="dispensing-uke-official-all-fields-gate-title"
            data-testid="dispensing-uke-official-all-fields-gate"
          >
            <div className="official-audit-review-header">
              <div>
                <h3 id="dispensing-uke-official-all-fields-gate-title">公式提出UKE allFields完了ゲート</h3>
                <a href={dispensingUkeOfficialAllFieldsGate.source.url} target="_blank" rel="noreferrer">
                  {dispensingUkeOfficialAllFieldsGate.source.fileName}
                </a>
              </div>
              <span
                className={dispensingUkeOfficialAllFieldsGate.ok ? 'review-status-ok' : 'review-status-pending'}
                data-testid="dispensing-uke-official-all-fields-gate-status"
              >
                {dispensingUkeOfficialAllFieldsGate.statusLabel}
              </span>
            </div>

            <p className="official-audit-review-label" role="status">
              {dispensingUkeOfficialAllFieldsGateLabel}
            </p>

            <div className="official-audit-review-metrics" aria-label="公式提出UKE allFields完了ゲート結果">
              <div>
                <span>レコード</span>
                <strong>{dispensingUkeOfficialAllFieldsGate.completedRecordTypeCount}/{dispensingUkeOfficialAllFieldsGate.expectedRecordTypes.length}</strong>
              </div>
              <div>
                <span>定義項目</span>
                <strong>{dispensingUkeOfficialAllFieldsGate.definedFieldCount}/{dispensingUkeOfficialAllFieldsGate.expectedFieldCount}</strong>
              </div>
              <div className={dispensingUkeOfficialAllFieldsGate.issueCount > 0 ? 'metric-danger' : ''}>
                <span>指摘</span>
                <strong>{dispensingUkeOfficialAllFieldsGate.issueCount}</strong>
              </div>
              <div>
                <span>次工程</span>
                <strong>P1-05</strong>
              </div>
            </div>

            {dispensingUkeOfficialAllFieldsGate.issues.length > 0 && (
              <div className="official-audit-review-blockers" data-testid="dispensing-uke-official-all-fields-gate-blockers">
                {dispensingUkeOfficialAllFieldsGate.issues.map((issue) => (
                  <div key={`${issue.recordType}-${issue.code}`}>
                    <AlertTriangle size={17} aria-hidden="true" />
                    <span><strong>{issue.recordType}</strong><br />{issue.message}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="actions official-audit-review-actions">
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleExportDispensingUkeOfficialAllFieldsGateCsv}
                disabled={isExportingDispensingUkeOfficialAllFieldsGate || !canViewOfficialAudit}
                type="button"
                data-testid="dispensing-uke-official-all-fields-gate-csv-button"
              >
                {isExportingDispensingUkeOfficialAllFieldsGate ? (
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                ) : (
                  <FileText size={16} aria-hidden="true" />
                )}
                <span>完了ゲートCSV</span>
              </button>
            </div>
          </section>

          <section
            className="official-audit-review-workspace"
            aria-labelledby="dispensing-uke-spec-review-title"
            data-testid="dispensing-uke-spec-review"
          >
            <div className="official-audit-review-header">
              <div>
                <h3 id="dispensing-uke-spec-review-title">UKE仕様PDF 全項目確認</h3>
                <a href={DISPENSING_UKE_RECORD_SPEC_SOURCE.url} target="_blank" rel="noreferrer">
                  厚労省 調剤記録条件（全体版）
                </a>
              </div>
              {dispensingUkeSpecCompletionGate && (
                <span
                  className={dispensingUkeSpecCompletionGate.ok ? 'review-status-ok' : 'review-status-pending'}
                  data-testid="dispensing-uke-spec-review-status"
                >
                  {dispensingUkeSpecCompletionGate.statusLabel}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="dispensing-uke-spec-pdf-text">PDFから取り出した文字</label>
              <textarea
                id="dispensing-uke-spec-pdf-text"
                value={dispensingUkeSpecPdfText}
                onChange={(event) => {
                  setDispensingUkeSpecPdfText(event.target.value);
                  setDispensingUkeSpecCompletionGate(null);
                  setDispensingUkeSpecCompletionLabel('');
                }}
                rows={5}
                placeholder="YK 薬局情報レコード&#10;1 保険薬局コード 数字 7 7 必須"
                disabled={isFetchingDispensingUkeSpecPdf}
                style={{ resize: 'vertical', minHeight: '120px' }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="dispensing-uke-spec-confirmation-text">実装確認メモ</label>
              <textarea
                id="dispensing-uke-spec-confirmation-text"
                value={dispensingUkeSpecConfirmationText}
                onChange={(event) => setDispensingUkeSpecConfirmationText(event.target.value)}
                rows={3}
                placeholder="YK-pdf-field-definition-implementation, 定義追加準備, 仕様PDF YK 第3項目, 請求担当, 2026-06-20"
                disabled={isFetchingDispensingUkeSpecPdf}
                style={{ resize: 'vertical', minHeight: '84px' }}
              />
            </div>

            <div className="actions official-audit-review-actions">
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleFetchDispensingUkeSpecPdf}
                disabled={isFetchingDispensingUkeSpecPdf || !canViewOfficialAudit}
                type="button"
                data-testid="dispensing-uke-spec-fetch-button"
              >
                {isFetchingDispensingUkeSpecPdf ? (
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                ) : (
                  <Download size={16} aria-hidden="true" />
                )}
                <span>{isFetchingDispensingUkeSpecPdf ? '取得中...' : '公式PDFを取得して確認'}</span>
              </button>
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleReviewDispensingUkeSpecPdfText}
                disabled={isFetchingDispensingUkeSpecPdf || !canViewOfficialAudit}
                type="button"
                data-testid="dispensing-uke-spec-review-button"
              >
                <Search size={16} aria-hidden="true" />
                <span>貼り付け本文を確認</span>
              </button>
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleExportDispensingUkeSpecReviewCsv}
                disabled={!dispensingUkeSpecCompletionGate || isExportingDispensingUkeSpecReview || !canViewOfficialAudit}
                type="button"
                data-testid="dispensing-uke-spec-review-csv-button"
              >
                {isExportingDispensingUkeSpecReview ? (
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                ) : (
                  <FileText size={16} aria-hidden="true" />
                )}
                <span>確認結果CSV</span>
              </button>
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleExportDispensingUkeSpecImplementationPack}
                disabled={!dispensingUkeSpecPdfText.trim() || isExportingDispensingUkeSpecImplementationPack || !canViewOfficialAudit}
                type="button"
                data-testid="dispensing-uke-spec-implementation-pack-button"
              >
                {isExportingDispensingUkeSpecImplementationPack ? (
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                ) : (
                  <FileText size={16} aria-hidden="true" />
                )}
                <span>実装パック</span>
              </button>
            </div>

            {dispensingUkeSpecCompletionLabel && (
              <p className="official-audit-review-label" role="status">
                {dispensingUkeSpecCompletionLabel}
              </p>
            )}

            {dispensingUkeSpecCompletionGate && (
              <>
                <div className="official-audit-review-metrics" aria-label="UKE仕様PDF全項目確認結果">
                  <div><span>レコード</span><strong>{dispensingUkeSpecCompletionGate.parsedRecordTypeCount}/{dispensingUkeSpecCompletionGate.expectedRecordTypeCount}</strong></div>
                  <div><span>抽出項目</span><strong>{dispensingUkeSpecCompletionGate.parsedFieldCount}</strong></div>
                  <div><span>定義済み</span><strong>{dispensingUkeSpecCompletionGate.definedFieldCount}</strong></div>
                  <div className={dispensingUkeSpecCompletionGate.remainingFieldCount > 0 ? 'metric-danger' : ''}>
                    <span>残項目</span><strong>{dispensingUkeSpecCompletionGate.remainingFieldCount}</strong>
                  </div>
                </div>
                {dispensingUkeSpecCompletionGate.blockers.length > 0 && (
                  <div className="official-audit-review-blockers" data-testid="dispensing-uke-spec-review-blockers">
                    {dispensingUkeSpecCompletionGate.blockers.map((blocker) => (
                      <div key={blocker.code}>
                        <AlertTriangle size={17} aria-hidden="true" />
                        <span><strong>{blocker.title}</strong><br />{blocker.nextAction}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <div className="official-audit-list">
            {OFFICIAL_AUDIT_ITEMS.map((item) => {
              const priority = auditPriorityStyle(item.priority);
              return (
                <section key={item.id} className="official-audit-row">
                  <div className="official-audit-row-main">
                    <div className="official-audit-titleline">
                      <h3>{item.title}</h3>
                      <span style={auditStatusStyle(item.status)}>{auditStatusLabel(item.status)}</span>
                      <span style={priority.style}>{priority.label}</span>
                    </div>
                    <p className="official-audit-basis">{item.officialBasis}</p>
                  </div>

                  <div className="official-audit-detail-grid">
                    <div>
                      <h4>実装済み</h4>
                      <ul>
                        {item.implementationEvidence.map((text) => (
                          <li key={text}>{text}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4>残作業</h4>
                      <ul>
                        {item.remainingWork.map((text) => (
                          <li key={text}>{text}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {item.sources.length > 0 && (
                    <div className="official-audit-sources">
                      {item.sources.map((source) => (
                        <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                          {source.label}
                        </a>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="settings-section glass">
          <h2>操作ログ・監査ログ（監査証跡）</h2>
          <p className="section-desc">薬局内の誰が、いつ、どのような重要操作を行ったかの履歴を監査用に出力・閲覧できます。</p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
              padding: '0.85rem 0',
              marginBottom: '1.2rem',
              borderTop: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  color: auditIntegrityColor,
                  fontWeight: 800,
                  fontSize: '0.92rem'
                }}
              >
                {isCheckingAuditIntegrity ? <Loader2 size={17} className="animate-spin" /> : auditIntegrity?.invalid ? <AlertTriangle size={17} /> : <CheckCircle size={17} />}
                監査ログ整合性: {auditIntegrityStatus}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                総数 {auditIntegrity?.total ?? auditLogs.length} / 署名済み {auditIntegrity?.signed ?? 0} / 未署名 {auditIntegrity?.unsigned ?? 0} / 異常 {auditIntegrity?.invalid ?? 0}
              </span>
              <span style={{ color: 'var(--text-ghost)', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                最新 {latestAuditHashPreview}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                JSONは責任者保全欄付き
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                className="btn-secondary flex-center gap-2"
                style={{ padding: '0.55rem 0.85rem', fontSize: '0.84rem' }}
                onClick={handleExportAuditLogs}
                disabled={!canViewAuditLogs || isExportingAuditLogs || auditLogs.length === 0}
                title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
              >
                {isExportingAuditLogs ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                <span>監査ログJSON</span>
              </button>
              <button
                className="btn-secondary flex-center gap-2"
                style={{ padding: '0.55rem 0.85rem', fontSize: '0.84rem' }}
                onClick={handleExportAnonymousDiagnostic}
                disabled={!canViewAuditLogs || isExportingAnonymousDiagnostic}
                title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : '患者情報などを含めないサポート用JSONを出力'}
                data-testid="anonymous-diagnostic-export-button"
              >
                {isExportingAnonymousDiagnostic ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                <span>個人情報なし診断JSON</span>
              </button>
              <button
                className="btn-secondary flex-center gap-2"
                style={{ padding: '0.55rem 0.85rem', fontSize: '0.84rem' }}
                onClick={handleExportAuditRetentionLedgerCsv}
                disabled={!canViewAuditLogs || isExportingAuditRetentionLedger || auditLogs.length === 0}
                title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
              >
                {isExportingAuditRetentionLedger ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                <span>保全台帳CSV</span>
              </button>
            </div>
          </div>

          <section
            aria-label="監査ログ保全月次棚卸"
            style={{
              padding: '0 0 1.2rem',
              marginBottom: '1.2rem',
              borderBottom: '1px solid var(--border)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>監査ログ保全月次棚卸</h3>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                  {auditRetentionReview.monthLabel} / 最新ハッシュ {latestAuditHashPreview}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                <span style={{
                  color: auditRetentionReviewColor,
                  background: auditRetentionReviewBackground,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '999px',
                  padding: '0.18rem 0.65rem',
                  fontSize: '0.78rem',
                  fontWeight: 800
                }}>
                  {auditRetentionReview.statusLabel}
                </span>
                <span style={{
                  color: auditRetentionManagerReviewColor,
                  background: auditRetentionManagerReviewBackground,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '999px',
                  padding: '0.18rem 0.65rem',
                  fontSize: '0.78rem',
                  fontWeight: 800
                }}>
                  {auditRetentionReview.managerReviewLabel}
                </span>
                <button
                  className="btn-secondary flex-center gap-2"
                  style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
                  onClick={handleRecordAuditRetentionManagerReview}
                  disabled={!canViewAuditLogs || isRecordingAuditRetentionManagerReview || auditLogs.length === 0}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : auditRetentionReview.managerReviewRequiredActions[0]}
                  data-testid="audit-retention-manager-review-button"
                >
                  {isRecordingAuditRetentionManagerReview ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                  <span>{auditRetentionManagerReviewButtonLabel}</span>
                </button>
                <button
                  className="btn-secondary flex-center gap-2"
                  style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
                  onClick={handleExportAuditRetentionMonthlyReviewCsv}
                  disabled={!canViewAuditLogs || isExportingAuditRetentionReview || auditLogs.length === 0}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
                >
                  {isExportingAuditRetentionReview ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>棚卸CSV</span>
                </button>
              </div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '0.75rem',
              marginBottom: '0.85rem'
            }}>
              {[
                ['監査ログJSON', `${auditRetentionReview.auditJsonExportCount}回`],
                ['保全台帳CSV', `${auditRetentionReview.retentionLedgerExportCount}回`],
                ['責任者確認', auditRetentionReview.managerReviewLabel],
                ['差し戻し', `${auditRetentionReview.returnReasons.length}件`],
                ['対応', auditRetentionReview.actionLabel]
              ].map(([label, value]) => (
                <div key={label} style={{ borderLeft: '3px solid var(--primary)', padding: '0.2rem 0 0.2rem 0.65rem' }}>
                  <div style={{ color: 'var(--text-ghost)', fontSize: '0.74rem', fontWeight: 700 }}>{label}</div>
                  <div style={{ color: label === '差し戻し' ? auditRetentionReviewColor : label === '責任者確認' ? auditRetentionManagerReviewColor : 'var(--text-main)', fontSize: '1.02rem', fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.8rem',
              color: 'var(--text-muted)',
              fontSize: '0.8rem'
            }}>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>最新JSON</div>
                <div style={{ color: 'var(--text-main)', fontWeight: 700, wordBreak: 'break-all' }}>{latestRetentionJsonLabel}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>最新保全台帳</div>
                <div style={{ color: 'var(--text-main)', fontWeight: 700, wordBreak: 'break-all' }}>{latestRetentionLedgerLabel}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>差し戻し理由</div>
                <div style={{ color: auditRetentionReview.returnReasons.length > 0 ? auditRetentionReviewColor : 'var(--text-main)', fontWeight: 700 }}>
                  {auditRetentionReview.returnReasons.length > 0 ? auditRetentionReview.returnReasons.join(' / ') : 'なし'}
                </div>
              </div>
            </div>
          </section>

          <section
            aria-label="AI補助フィードバック月次レビュー"
            style={{
              padding: '0 0 1.2rem',
              marginBottom: '1.2rem',
              borderBottom: '1px solid var(--border)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>AI補助フィードバック月次レビュー</h3>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                  {aiSuggestionFeedbackReview.monthLabel} / 採否ログ {aiSuggestionFeedbackReview.totalCount}件
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                <span style={{
                  color: aiSuggestionQualityGateColor,
                  background: aiSuggestionQualityGateBackground,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '8px',
                  padding: '0.18rem 0.65rem',
                  fontSize: '0.78rem',
                  fontWeight: 800
                }}>
                  品質ゲート: {aiSuggestionFeedbackReview.qualityGate.statusLabel}
                </span>
                <span style={{
                  color: aiSuggestionFeedbackColor,
                  background: aiSuggestionFeedbackBackground,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '8px',
                  padding: '0.18rem 0.65rem',
                  fontSize: '0.78rem',
                  fontWeight: 800
                }}>
                  {aiSuggestionFeedbackReview.statusLabel}
                </span>
                <button
                  className="btn-secondary flex-center gap-2"
                  style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
                  onClick={handleExportAiSuggestionFeedbackReviewCsv}
                  disabled={!canViewAuditLogs || isExportingAiSuggestionFeedbackReview || isExportingAiSuggestionFeedbackBi}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
                >
                  {isExportingAiSuggestionFeedbackReview ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>フィードバックCSV</span>
                </button>
                <button
                  className="btn-secondary flex-center gap-2"
                  style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
                  onClick={handleExportAiSuggestionFeedbackBiJson}
                  disabled={!canViewAuditLogs || isExportingAiSuggestionFeedbackReview || isExportingAiSuggestionFeedbackBi}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
                >
                  {isExportingAiSuggestionFeedbackBi ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>BI JSON</span>
                </button>
                <button
                  className="btn-secondary flex-center gap-2"
                  style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
                  onClick={handleApplyAiQualityRecommendation}
                  disabled={
                    !canManageFacility
                    || isApplyingAiQualityMode
                    || aiSuggestionFeedbackReview.qualityGate.modeAlignment !== 'change_required'
                  }
                  title={!canManageFacility
                    ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings')
                    : aiSuggestionFeedbackReview.qualityGate.modeAlignment === 'change_required'
                      ? `推奨の「${aiSuggestionFeedbackReview.qualityGate.recommendedModeLabel}」へ変更`
                      : aiSuggestionFeedbackReview.qualityGate.modeAlignmentLabel}
                  data-testid="ai-quality-gate-apply"
                >
                  {isApplyingAiQualityMode ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                  <span>推奨モードを反映</span>
                </button>
              </div>
            </div>
            <div
              data-testid="ai-quality-gate"
              style={{
                border: '1px solid var(--border)',
                borderLeft: `4px solid ${aiSuggestionQualityGateColor}`,
                borderRadius: '8px',
                padding: '0.85rem',
                marginBottom: '0.85rem',
                background: aiSuggestionQualityGateBackground
              }}
            >
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '0.7rem',
                marginBottom: '0.7rem'
              }}>
                {[
                  ['現在 / 推奨', `${aiSuggestionFeedbackReview.qualityGate.currentModeLabel} / ${aiSuggestionFeedbackReview.qualityGate.recommendedModeLabel}`],
                  ['評価件数', `${aiSuggestionFeedbackReview.qualityGate.sampleCount}/${aiSuggestionFeedbackReview.qualityGate.policy.minimumMonthlySamples}件`],
                  ['却下率', `${aiSuggestionFeedbackReview.qualityGate.rejectionRate}%`],
                  [`高信頼度${aiSuggestionFeedbackReview.qualityGate.policy.highConfidenceThreshold}%以上`, `却下 ${aiSuggestionFeedbackReview.qualityGate.highConfidenceRejectedCount}/${aiSuggestionFeedbackReview.qualityGate.highConfidenceCount}件`],
                  ['理由未記入', `${aiSuggestionFeedbackReview.qualityGate.missingFeedbackCount}件`],
                  ['モード確認', aiSuggestionFeedbackReview.qualityGate.modeAlignmentLabel]
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', fontWeight: 800 }}>{label}</div>
                    <div style={{ color: 'var(--text-main)', fontSize: '0.96rem', fontWeight: 800, overflowWrap: 'anywhere' }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ color: aiSuggestionQualityGateColor, fontSize: '0.8rem', fontWeight: 750, marginBottom: '0.45rem' }}>
                {aiSuggestionFeedbackReview.qualityGate.reasons.join(' / ')}
              </div>
              <div style={{ color: 'var(--text-main)', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.45rem' }}>
                {aiSuggestionFeedbackReview.qualityGate.requiredActions.join(' / ')}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 650 }}>
                {aiSuggestionFeedbackReview.qualityGate.evaluationNote}
              </div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '0.75rem',
              marginBottom: '0.85rem'
            }}>
              {[
                ['採用', `${aiSuggestionFeedbackReview.acceptedCount}件`],
                ['修正', `${aiSuggestionFeedbackReview.modifiedCount}件`],
                ['却下', `${aiSuggestionFeedbackReview.rejectedCount}件`],
                ['採用率', `${aiSuggestionFeedbackReview.acceptanceRate}%`],
                ['修正/却下率', `${aiSuggestionFeedbackReview.correctionRate}%`],
                ['平均信頼度', aiSuggestionFeedbackReview.averageConfidence === undefined ? '-' : `${aiSuggestionFeedbackReview.averageConfidence}%`],
                ['フィードバック', `${aiSuggestionFeedbackReview.feedbackCount}件`],
                ['対応', aiSuggestionFeedbackReview.actionLabel]
              ].map(([label, value]) => (
                <div key={label} style={{ borderLeft: '3px solid #7c3aed', padding: '0.2rem 0 0.2rem 0.65rem' }}>
                  <div style={{ color: 'var(--text-ghost)', fontSize: '0.74rem', fontWeight: 700 }}>{label}</div>
                  <div style={{ color: label === '対応' ? aiSuggestionFeedbackColor : 'var(--text-main)', fontSize: '1.02rem', fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.8rem',
              color: 'var(--text-muted)',
              fontSize: '0.8rem'
            }}>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>最新採否</div>
                <div style={{ color: 'var(--text-main)', fontWeight: 700 }}>
                  {aiSuggestionFeedbackReview.latestRecord
                    ? `${aiSuggestionFeedbackReview.latestRecord.dateLabel} ${aiSuggestionFeedbackReview.latestRecord.decisionLabel}`
                    : '未記録'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>最新提案</div>
                <div style={{ color: 'var(--text-main)', fontWeight: 700 }}>
                  {aiSuggestionFeedbackReview.latestRecord?.suggestionTitle || '未記録'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>次の対応</div>
                <div style={{ color: aiSuggestionFeedbackColor, fontWeight: 700 }}>
                  {aiSuggestionFeedbackReview.requiredActions.join(' / ')}
                </div>
              </div>
            </div>
          </section>

          <section
            aria-label="日次締め月次レビュー"
            style={{
              padding: '0 0 1.2rem',
              marginBottom: '1.2rem',
              borderBottom: '1px solid var(--border)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>日次締め月次レビュー</h3>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                  {dailyClosingReview.monthLabel} / 最新承認ハッシュ {latestClosingHashPreview}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                <span style={{
                  color: dailyClosingReviewColor,
                  background: dailyClosingReview.daysWithBlockers > 0 ? '#fffbeb' : dailyClosingReview.approvalCount > 0 ? '#f0fdf4' : '#f8fafc',
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '999px',
                  padding: '0.18rem 0.65rem',
                  fontSize: '0.78rem',
                  fontWeight: 800
                }}>
                  {dailyClosingReviewStatus}
                </span>
                <button
                  className="btn-secondary flex-center gap-2"
                  style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
                  onClick={handleExportDailyClosingReviewCsv}
                  disabled={!canViewAuditLogs || isExportingDailyClosingReview}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
                >
                  {isExportingDailyClosingReview ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>レビューCSV</span>
                </button>
              </div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '0.75rem',
              marginBottom: '0.85rem'
            }}>
              {[
                ['承認回数', `${dailyClosingReview.approvalCount}回`],
                ['承認日数', `${dailyClosingReview.approvedDayCount}日`],
                ['確認者数', `${dailyClosingReview.reviewerCount}名`],
                ['平均完了率', dailyClosingReview.averageCompletionRateLabel],
                ['残タスク日', `${dailyClosingReview.daysWithBlockers}日`],
                ['残タスク合計', `${dailyClosingReview.totalClosingBlockers}件`]
              ].map(([label, value]) => (
                <div key={label} style={{ borderLeft: '3px solid var(--primary)', padding: '0.2rem 0 0.2rem 0.65rem' }}>
                  <div style={{ color: 'var(--text-ghost)', fontSize: '0.74rem', fontWeight: 700 }}>{label}</div>
                  <div style={{ color: 'var(--text-main)', fontSize: '1.05rem', fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>
            <div
              aria-label="在庫・服薬フォロー月次KPI"
              data-testid="daily-closing-field-kpis"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '0.75rem',
                marginBottom: '0.85rem',
                padding: '0.75rem 0',
                borderTop: '1px solid rgba(148, 163, 184, 0.25)',
                borderBottom: '1px solid rgba(148, 163, 184, 0.25)'
              }}
            >
              {[
                ['在庫不足合計', `${dailyClosingReview.totalInventoryShortages}品目`, '#b45309'],
                ['入庫登録合計', `${dailyClosingReview.totalInventoryReceivings}件`, '#2563eb'],
                ['服薬フォロー合計', `${dailyClosingReview.totalFollowUpDueCount}件`, '#0f766e'],
                ['問い合わせ負荷合計', `${dailyClosingReview.totalSupportCaseCount}件`, '#7c3aed']
              ].map(([label, value, color]) => (
                <div key={label} style={{ borderLeft: `3px solid ${color}`, padding: '0.2rem 0 0.2rem 0.65rem', minWidth: 0 }}>
                  <div style={{ color: 'var(--text-ghost)', fontSize: '0.74rem', fontWeight: 700 }}>{label}</div>
                  <div style={{ color, fontSize: '1.05rem', fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>
            <div
              aria-label="店舗別KPIベンチマーク"
              style={{
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.85rem',
                background: dailyClosingStoreBenchmarkBackground,
                marginBottom: '0.85rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.7rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
                <div>
                  <div style={{ color: 'var(--text-main)', fontSize: '0.92rem', fontWeight: 850 }}>店舗別KPIベンチマーク</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 700 }}>
                    {dailyClosingReview.storeBenchmark.currentStoreName} / 比較店舗 {dailyClosingReview.storeBenchmark.storeCount}件
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <span style={{
                    color: dailyClosingStoreBenchmarkColor,
                    background: '#ffffff',
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    borderRadius: '999px',
                    padding: '0.16rem 0.55rem',
                    fontSize: '0.72rem',
                    fontWeight: 800
                  }}>
                    {dailyClosingReview.storeBenchmark.statusLabel}
                  </span>
                  <button
                    className="btn-secondary flex-center gap-2"
                    style={{ padding: '0.35rem 0.55rem', fontSize: '0.74rem' }}
                    onClick={handleExportDailyClosingStoreBenchmarkJson}
                    disabled={!canViewAuditLogs || isExportingDailyClosingStoreBenchmark}
                    title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : '患者情報なしの店舗別KPI JSONを書き出します'}
                  >
                    {isExportingDailyClosingStoreBenchmark ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    <span>BI JSON</span>
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(106px, 1fr))', gap: '0.65rem', marginBottom: '0.7rem' }}>
                {[
                  ['自店完了率', dailyClosingReview.storeBenchmark.currentStore?.averageCompletionRateLabel || '未集計'],
                  ['全店平均', dailyClosingReview.storeBenchmark.allStoreAverageCompletionRateLabel],
                  ['他店平均', dailyClosingReview.storeBenchmark.peerAverageCompletionRateLabel],
                  ['平均との差', dailyClosingReview.storeBenchmark.currentStore?.completionRateDifferenceFromAverage === undefined
                    ? '比較不可'
                    : `${dailyClosingReview.storeBenchmark.currentStore.completionRateDifferenceFromAverage > 0 ? '+' : ''}${dailyClosingReview.storeBenchmark.currentStore.completionRateDifferenceFromAverage}pt`],
                  ['残タスク差', dailyClosingReview.storeBenchmark.currentStore
                    ? `${dailyClosingReview.storeBenchmark.currentStore.blockerDifferenceFromAverage > 0 ? '+' : ''}${dailyClosingReview.storeBenchmark.currentStore.blockerDifferenceFromAverage}件`
                    : '比較不可']
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ color: 'var(--text-ghost)', fontSize: '0.7rem', fontWeight: 800 }}>{label}</div>
                    <div style={{ color: 'var(--text-main)', fontSize: '0.96rem', fontWeight: 850 }}>{value}</div>
                  </div>
                ))}
              </div>
              <div
                data-testid="store-field-kpi-benchmark"
                aria-label="在庫・服薬フォロー店舗比較"
                style={{
                  overflowX: 'auto',
                  marginBottom: '0.7rem',
                  padding: '0.55rem 0',
                  borderTop: '1px solid rgba(148, 163, 184, 0.28)',
                  borderBottom: '1px solid rgba(148, 163, 184, 0.28)'
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(126px, 1.2fr) repeat(3, minmax(92px, 1fr))', gap: '0.55rem', minWidth: '430px', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                  <strong style={{ color: 'var(--text-main)' }}>現場KPI（日平均）</strong>
                  <span>自店</span>
                  <span>全店</span>
                  <span>他店</span>
                  {[
                    ['在庫不足', dailyClosingReview.storeBenchmark.currentStore?.averageInventoryShortageLabel || '未集計', dailyClosingReview.storeBenchmark.allStoreAverageInventoryShortagesLabel, dailyClosingReview.storeBenchmark.peerAverageInventoryShortagesLabel],
                    ['入庫登録', dailyClosingReview.storeBenchmark.currentStore?.averageInventoryReceivingLabel || '未集計', dailyClosingReview.storeBenchmark.allStoreAverageInventoryReceivingsLabel, dailyClosingReview.storeBenchmark.peerAverageInventoryReceivingsLabel],
                    ['服薬フォロー', dailyClosingReview.storeBenchmark.currentStore?.averageFollowUpDueLabel || '未集計', dailyClosingReview.storeBenchmark.allStoreAverageFollowUpDueLabel, dailyClosingReview.storeBenchmark.peerAverageFollowUpDueLabel],
                    ['問い合わせ負荷', dailyClosingReview.storeBenchmark.currentStore?.averageSupportCaseLabel || '未集計', dailyClosingReview.storeBenchmark.allStoreAverageSupportCasesLabel, dailyClosingReview.storeBenchmark.peerAverageSupportCasesLabel]
                  ].flatMap(([label, current, allStores, peers]) => [
                    <strong key={`${label}-label`} style={{ color: 'var(--text-main)' }}>{label}</strong>,
                    <span key={`${label}-current`} style={{ color: 'var(--text-main)', fontWeight: 800 }}>{current}</span>,
                    <span key={`${label}-all`}>{allStores}</span>,
                    <span key={`${label}-peer`}>{peers}</span>
                  ])}
                </div>
              </div>
              {dailyClosingReview.storeBenchmark.storeSummaries.length > 0 && (
                <div style={{ display: 'grid', gap: '0.4rem', marginBottom: '0.65rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  {dailyClosingReview.storeBenchmark.storeSummaries.slice(0, 3).map((summary) => (
                    <div key={summary.storeKey} style={{ display: 'grid', gridTemplateColumns: 'minmax(94px, 1fr) auto auto auto', gap: '0.55rem', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-main)', fontWeight: 800 }}>{summary.storeName}</span>
                      <span>{summary.approvedDayCount}日</span>
                      <span>完了 {summary.averageCompletionRateLabel}</span>
                      <span>残 {summary.totalClosingBlockers}件</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ color: dailyClosingStoreBenchmarkColor, fontSize: '0.78rem', fontWeight: 750 }}>
                {dailyClosingReview.storeBenchmark.requiredActions.join(' / ')}
              </div>
              <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.28)', marginTop: '0.65rem', paddingTop: '0.65rem', display: 'grid', gap: '0.25rem' }}>
                <div style={{ color: 'var(--text-main)', fontSize: '0.78rem', fontWeight: 850 }}>
                  効果測定
                </div>
                <div style={{ color: dailyClosingStoreBenchmarkColor, fontSize: '0.74rem', fontWeight: 750 }}>
                  {dailyClosingReview.storeBenchmark.actionEffectSummary.statusLabel}
                  {dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution
                    ? ` / ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.title} / 実行後 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.measurementApprovedDayCount}/${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.measurementRequiredDayCount}日 / 完了率差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.completionRateDeltaLabel} / 残タスク平均差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.closingBlockerAverageDeltaLabel} / 在庫不足差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.inventoryShortageDeltaLabel} / 入庫差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.inventoryReceivingDeltaLabel} / フォロー差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.followUpDueDeltaLabel} / 問い合わせ差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.supportCaseDeltaLabel}`
                    : ' / 実行記録なし'}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.5 }}>
                  {dailyClosingReview.storeBenchmark.actionEffectSummary.requiredActions.join(' / ')}
                </div>
              </div>
              <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.28)', marginTop: '0.65rem', paddingTop: '0.65rem', display: 'grid', gap: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-main)', fontSize: '0.78rem', fontWeight: 850 }}>
                    未実施フォロー
                  </span>
                  <span style={{ color: dailyClosingStoreBenchmarkColor, fontSize: '0.72rem', fontWeight: 850 }}>
                    {dailyClosingReview.storeBenchmark.actionFollowUpSummary.statusLabel}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.5 }}>
                  未実施 {dailyClosingReview.storeBenchmark.actionFollowUpSummary.pendingCount}件 / 期限超過 {dailyClosingReview.storeBenchmark.actionFollowUpSummary.overdueCount}件 / 期限間近 {dailyClosingReview.storeBenchmark.actionFollowUpSummary.dueSoonCount}件
                  {dailyClosingReview.storeBenchmark.actionFollowUpSummary.nextDue
                    ? ` / 次期限 ${dailyClosingReview.storeBenchmark.actionFollowUpSummary.nextDue.dueDateLabel}`
                    : ''}
                </div>
                <div style={{ color: dailyClosingStoreBenchmarkColor, fontSize: '0.72rem', fontWeight: 750, lineHeight: 1.5 }}>
                  担当者・横断フォロー {dailyClosingReview.storeBenchmark.actionAssignmentSummary.statusLabel} / 未完了 {dailyClosingReview.storeBenchmark.actionAssignmentSummary.openAssignmentCount}件 / 店舗横断 {dailyClosingReview.storeBenchmark.actionAssignmentSummary.openCrossStoreFollowUpCount}件
                </div>
                <div style={{ color: dailyClosingStoreBenchmarkColor, fontSize: '0.7rem', fontWeight: 750, lineHeight: 1.5 }}>
                  エスカレーション {dailyClosingReview.storeBenchmark.actionAssignmentSummary.escalationLabel} / 延期中 {dailyClosingReview.storeBenchmark.actionAssignmentSummary.activePostponementCount}件
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', lineHeight: 1.5 }}>
                  担当 {dailyClosingReview.storeBenchmark.actionAssignmentSummary.assigneeLabels.join(' / ') || '未設定'}
                  {dailyClosingReview.storeBenchmark.actionAssignmentSummary.crossStoreTargetStoreNames.length > 0
                    ? ` / 横断先 ${dailyClosingReview.storeBenchmark.actionAssignmentSummary.crossStoreTargetStoreNames.join('、')}`
                    : ''}
                </div>
                <div style={{ display: 'grid', gap: '0.28rem' }}>
                  {dailyClosingReview.storeBenchmark.actionFollowUps.slice(0, 2).map((followUp) => (
                    <div key={followUp.templateId} style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                      <span style={{ color: 'var(--text-main)', fontWeight: 800 }}>{followUp.title}</span>
                      <span>{followUp.statusLabel}</span>
                      <span>担当 {followUp.assigneeLabel}</span>
                      <span>期限 {followUp.dueDateLabel}</span>
                      {followUp.status !== 'completed' && (
                        <span>{followUp.daysUntilDue < 0 ? `${Math.abs(followUp.daysUntilDue)}日超過` : `残り ${followUp.daysUntilDue}日`}</span>
                      )}
                      {followUp.crossStoreTargetStoreNames.length > 0 && (
                        <span>横断 {followUp.crossStoreTargetStoreNames.join('、')}</span>
                      )}
                      {followUp.postponed && (
                        <span>延期 {followUp.postponementReason || '理由未記入'}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {dailyClosingReview.storeBenchmark.actionTemplates.length > 0 && (
                <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.28)', marginTop: '0.65rem', paddingTop: '0.65rem' }}>
                  <div style={{ color: 'var(--text-main)', fontSize: '0.78rem', fontWeight: 850, marginBottom: '0.45rem' }}>
                    改善アクション
                  </div>
                  <div style={{ display: 'grid', gap: '0.55rem' }}>
                    {dailyClosingReview.storeBenchmark.actionTemplates.slice(0, 2).map((template) => {
                      const priorityColor = template.priority === 'high'
                        ? '#b91c1c'
                        : template.priority === 'medium'
                          ? '#b45309'
                          : '#15803d';
                      const priorityLabel = template.priority === 'high'
                        ? '高'
                        : template.priority === 'medium'
                          ? '中'
                          : '低';
                      const followUp = dailyClosingReview.storeBenchmark.actionFollowUps.find((candidate) => candidate.templateId === template.id);
                      return (
                        <div key={template.id} style={{ display: 'grid', gap: '0.28rem', borderLeft: `3px solid ${priorityColor}`, paddingLeft: '0.6rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-main)', fontSize: '0.8rem', fontWeight: 850 }}>
                              {template.title}
                            </span>
                            <span style={{ color: priorityColor, fontSize: '0.68rem', fontWeight: 850 }}>
                              優先度 {priorityLabel}
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', lineHeight: 1.55 }}>
                            {template.steps.join(' / ')}
                          </div>
                          <div style={{ color: dailyClosingStoreBenchmarkColor, fontSize: '0.72rem', fontWeight: 750 }}>
                            {template.expectedOutcome}
                          </div>
                          {followUp && (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 750 }}>
                              期限 {followUp.dueDateLabel} / {followUp.statusLabel} / 担当 {followUp.assigneeLabel}
                              {followUp.crossStoreTargetStoreNames.length > 0
                                ? ` / 横断 ${followUp.crossStoreTargetStoreNames.join('、')}`
                                : ''}
                              {followUp.postponed
                                ? ` / 延期 ${followUp.postponementReason || '理由未記入'}`
                                : ''}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <button
                              className="btn-secondary flex-center gap-2"
                              style={{ padding: '0.32rem 0.55rem', fontSize: '0.72rem' }}
                              onClick={() => handleRecordDailyClosingKpiAction(template)}
                              disabled={!canApproveDailyClosing || recordingDailyClosingKpiActionId === template.id}
                              title={!canApproveDailyClosing ? getPermissionDeniedMessage(currentUser, 'approve_daily_closing') : 'この改善アクションを監査ログに記録します'}
                            >
                              {recordingDailyClosingKpiActionId === template.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                              <span>実行記録</span>
                            </button>
                            <button
                              className="btn-secondary flex-center gap-2"
                              style={{ padding: '0.32rem 0.55rem', fontSize: '0.72rem' }}
                              onClick={() => handlePostponeDailyClosingKpiAction(template)}
                              disabled={!canApproveDailyClosing || followUp?.status === 'completed' || postponingDailyClosingKpiActionId === template.id}
                              title={!canApproveDailyClosing ? getPermissionDeniedMessage(currentUser, 'approve_daily_closing') : '延期理由と再期限を監査ログに記録します'}
                            >
                              {postponingDailyClosingKpiActionId === template.id ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />}
                              <span>延期記録</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div
              aria-label="日次締め前月比較"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(150px, 1.1fr) repeat(8, minmax(120px, 1fr))',
                gap: '0.6rem',
                alignItems: 'stretch',
                overflowX: 'auto',
                padding: '0.65rem 0',
                marginBottom: '0.85rem',
                borderTop: '1px solid rgba(148, 163, 184, 0.25)',
                borderBottom: '1px solid rgba(148, 163, 184, 0.25)'
              }}
            >
              <div style={{ minWidth: '150px' }}>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.74rem', fontWeight: 700 }}>前月比較</div>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: dailyClosingComparisonColor,
                  background: dailyClosingComparisonBackground,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '999px',
                  padding: '0.16rem 0.58rem',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  marginTop: '0.2rem'
                }}>
                  {dailyClosingComparison.statusLabel}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '0.25rem' }}>
                  {dailyClosingComparison.previousMonth.monthLabel}比
                </div>
              </div>
              {[
                ['承認日数', dailyClosingComparison.approvedDayDeltaLabel],
                ['平均完了率', dailyClosingComparison.averageCompletionRateDeltaLabel],
                ['残タスク日', dailyClosingComparison.daysWithBlockersDeltaLabel],
                ['残タスク合計', dailyClosingComparison.totalClosingBlockersDeltaLabel],
                ['在庫不足', dailyClosingComparison.inventoryShortageDeltaLabel],
                ['入庫登録', dailyClosingComparison.inventoryReceivingDeltaLabel],
                ['服薬フォロー', dailyClosingComparison.followUpDueDeltaLabel],
                ['問い合わせ負荷', dailyClosingComparison.supportCaseDeltaLabel]
              ].map(([label, value]) => (
                <div key={label} style={{ minWidth: '120px', borderLeft: '3px solid rgba(37, 99, 235, 0.45)', padding: '0.1rem 0 0.1rem 0.55rem' }}>
                  <div style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', fontWeight: 700 }}>{label}</div>
                  <div style={{ color: dailyClosingComparisonColor, fontSize: '0.98rem', fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: '0.95rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                <div style={{ color: 'var(--text-main)', fontSize: '0.84rem', fontWeight: 800 }}>複数月KPI比較</div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.75rem' }}>
                  直近{dailyClosingReview.monthlyKpiHistory.length}か月
                </div>
              </div>
              <div
                aria-label="日次締め複数月KPI比較"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, minmax(148px, 1fr))',
                  gap: '0.55rem',
                  overflowX: 'auto',
                  padding: '0.15rem 0.05rem 0.35rem'
                }}
              >
                {dailyClosingReview.monthlyKpiHistory.map((month) => {
                  const completion = month.averageCompletionRate ?? 0;
                  const blockerTone = month.totalClosingBlockers > 0
                    ? '#b45309'
                    : month.approvalCount > 0
                      ? '#15803d'
                      : '#64748b';
                  const barHeight = Math.max(6, Math.round(completion * 0.5));
                  return (
                    <div
                      key={month.monthKey}
                      style={{
                        minWidth: '148px',
                        border: '1px solid rgba(148, 163, 184, 0.32)',
                        borderRadius: '6px',
                        padding: '0.55rem',
                        background: month.approvalCount > 0 ? '#ffffff' : '#f8fafc'
                      }}
                    >
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 800 }}>{month.monthLabel}</div>
                      <div style={{ height: '58px', display: 'flex', alignItems: 'flex-end', gap: '0.45rem', marginTop: '0.35rem' }}>
                        <div style={{
                          width: '18px',
                          height: `${barHeight}px`,
                          borderRadius: '4px 4px 2px 2px',
                          background: blockerTone,
                          border: '1px solid rgba(15, 23, 42, 0.08)'
                        }} />
                        <div>
                          <div style={{ color: blockerTone, fontSize: '0.98rem', fontWeight: 850 }}>{month.averageCompletionRateLabel}</div>
                          <div style={{ color: 'var(--text-ghost)', fontSize: '0.68rem' }}>{month.approvedDayCount}日承認</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.45rem', marginTop: '0.4rem', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 700 }}>
                        <span>残日 {month.daysWithBlockers}</span>
                        <span>残 {month.totalClosingBlockers}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.25rem', marginTop: '0.35rem', color: 'var(--text-muted)', fontSize: '0.66rem', fontWeight: 700 }}>
                        <span title="在庫不足品目数">不足 {month.totalInventoryShortages}</span>
                        <span title="入庫登録件数">入庫 {month.totalInventoryReceivings}</span>
                        <span title="服薬フォロー候補数">フォロー {month.totalFollowUpDueCount}</span>
                        <span title="問い合わせ負荷件数">問合せ {month.totalSupportCaseCount}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {dailyClosingReview.allApprovals.length > 0 && (
              <div style={{ marginBottom: '0.95rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                  <div style={{ color: 'var(--text-main)', fontSize: '0.84rem', fontWeight: 800 }}>KPI推移</div>
                  <div style={{ color: 'var(--text-ghost)', fontSize: '0.75rem' }}>
                    完了率 {dailyClosingReview.completionTrendLabel} / 残タスク {dailyClosingReview.blockerTrendLabel}
                  </div>
                </div>
                <div
                  aria-label="日次締めKPI推移"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: '0.45rem',
                    overflowX: 'auto',
                    padding: '0.45rem 0.15rem 0.2rem'
                  }}
                >
                  {[...dailyClosingReview.allApprovals].reverse().map((approval) => {
                    const completion = approval.completionRate ?? 0;
                    const blockerCount = approval.closingBlockerCount ?? 0;
                    const barHeight = Math.max(6, Math.round(completion * 0.42));
                    return (
                      <div
                        key={`trend-${approval.logId}`}
                        title={`${approval.dateLabel} 完了率${approval.completionRate === undefined ? '-' : `${approval.completionRate}%`} 残タスク${approval.closingBlockerCount ?? '-'}件 在庫不足${approval.inventoryShortageCount ?? '-'}品目 入庫${approval.inventoryReceivingCount ?? '-'}件 フォロー${approval.followUpDueCount ?? '-'}件 問い合わせ${approval.supportCaseCount ?? '-'}件`}
                        style={{
                          flex: '0 0 42px',
                          minHeight: '74px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '0.25rem'
                        }}
                      >
                        <div style={{ height: '44px', display: 'flex', alignItems: 'flex-end' }}>
                          <div style={{
                            width: '16px',
                            height: `${barHeight}px`,
                            borderRadius: '4px 4px 2px 2px',
                            background: blockerCount > 0 ? '#f59e0b' : '#16a34a',
                            border: '1px solid rgba(15, 23, 42, 0.08)'
                          }} />
                        </div>
                        <span style={{ color: blockerCount > 0 ? '#b45309' : '#15803d', fontSize: '0.68rem', fontWeight: 800 }}>
                          {approval.completionRate === undefined ? '-' : `${approval.completionRate}%`}
                        </span>
                        <span style={{ color: 'var(--text-ghost)', fontSize: '0.66rem' }}>
                          {approval.dateKey.slice(-2)}日
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gap: '0.45rem' }}>
              {dailyClosingReview.recentApprovals.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>今月の日次締め承認は未記録です。</div>
              ) : (
                dailyClosingReview.recentApprovals.map((approval) => (
                  <div
                    key={approval.logId}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                      alignItems: 'center',
                      padding: '0.45rem 0',
                      borderTop: '1px solid rgba(148, 163, 184, 0.22)',
                      fontSize: '0.82rem'
                    }}
                  >
                    <span style={{ fontWeight: 700, color: 'var(--text-main)', minWidth: '7rem' }}>{approval.dateLabel}</span>
                    <span style={{ color: 'var(--text-muted)', flex: '1 1 9rem' }}>{approval.reviewerName}</span>
                    <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>完了 {approval.completionRate === undefined ? '-' : `${approval.completionRate}%`}</span>
                    <span style={{ color: (approval.closingBlockerCount ?? 0) > 0 ? '#b45309' : '#15803d', fontWeight: 700 }}>
                      残 {approval.closingBlockerCount ?? '-'}件
                    </span>
                    <span style={{ color: (approval.inventoryShortageCount ?? 0) > 0 ? '#b45309' : '#15803d', fontWeight: 700 }}>
                      不足 {approval.inventoryShortageCount ?? '-'}品目
                    </span>
                    <span style={{ color: (approval.inventoryReceivingCount ?? 0) > 0 ? '#2563eb' : 'var(--text-muted)', fontWeight: 700 }}>
                      入庫 {approval.inventoryReceivingCount ?? '-'}件
                    </span>
                    <span style={{ color: (approval.followUpDueCount ?? 0) > 0 ? '#b45309' : '#15803d', fontWeight: 700 }}>
                      フォロー {approval.followUpDueCount ?? '-'}件
                    </span>
                    <span style={{ color: (approval.supportCaseCount ?? 0) > 0 ? '#7c3aed' : 'var(--text-muted)', fontWeight: 700 }}>
                      問合せ {approval.supportCaseCount ?? '-'}件
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>操作ユーザーで絞り込み</label>
              <input
                type="text"
                placeholder="例: 山田"
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '200px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>操作種別</label>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'white', fontSize: '0.9rem' }}
              >
                <option value="">全種別</option>
                <option value="login">ログイン</option>
                <option value="prescription_ocr">処方箋OCR読込</option>
                <option value="prescription_edit">薬歴完了・変更</option>
                <option value="billing_toggle">点数算定切替</option>
                <option value="claim_lifecycle">請求状態変更</option>
                <option value="daily_closing_approval">日次締め承認</option>
                <option value="daily_closing_kpi_action">KPI改善アクション</option>
                <option value="session_lock">セッションロック</option>
                <option value="print">印刷実行</option>
                <option value="uke_export">レセプト出力</option>
                <option value="stock_update">在庫更新</option>
                <option value="user_switch">操作者切替</option>
                <option value="facility_settings_update">施設基準設定変更</option>
                <option value="drug_master_update">医薬品マスタ更新</option>
                <option value="patient_medication_info_template">薬情テンプレ承認</option>
                <option value="follow_up_record">服薬フォロー記録</option>
                <option value="ai_suggestion_review">AI補助提案確認</option>
                <option value="staff_create">スタッフ追加</option>
                <option value="staff_delete">スタッフ削除</option>
                <option value="staff_credential_recovery">スタッフ認証復旧</option>
                <option value="passkey_register">パスキー登録</option>
                <option value="audit_export">監査ログ書出</option>
                <option value="audit_retention_approval">監査ログ保全確認</option>
                <option value="backup_export">バックアップ書出</option>
                <option value="backup_schedule_update">バックアップ予定変更</option>
                <option value="backup_external_storage">外部保存確認</option>
                <option value="backup_external_transfer_manifest">外部保存連携JSON</option>
                <option value="backup_drill">復旧テスト</option>
                <option value="backup_import">バックアップ復旧</option>
                <option value="official_spec_review">公式仕様点検</option>
              </select>
            </div>
          </div>

          <div className="table-wrapper" style={{ maxHeight: '500px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)', background: 'var(--bg-muted)' }}>
                  <th style={{ padding: '0.75rem' }}>日時</th>
                  <th style={{ padding: '0.75rem' }}>操作者</th>
                  <th style={{ padding: '0.75rem' }}>種別</th>
                  <th style={{ padding: '0.75rem' }}>対象患者</th>
                  <th style={{ padding: '0.75rem' }}>操作詳細</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-ghost)' }}>
                      記録されている操作ログはありません。
                    </td>
                  </tr>
                ) : (
                  auditLogs
                    .filter((log) => {
                      const matchUser = !filterUser || log.userName.includes(filterUser);
                      const matchAction = !filterAction || log.actionType === filterAction;
                      return matchUser && matchAction;
                    })
                    .map((log) => {
                      let actionBadgeColor = 'gray';
                      if (log.actionType === 'prescription_ocr') actionBadgeColor = '#2563eb';
                      else if (log.actionType === 'prescription_edit') actionBadgeColor = '#16a34a';
                      else if (log.actionType === 'billing_toggle') actionBadgeColor = '#d97706';
                      else if (log.actionType === 'claim_lifecycle') actionBadgeColor = '#be123c';
                      else if (log.actionType === 'daily_closing_approval') actionBadgeColor = '#047857';
                      else if (log.actionType === 'daily_closing_kpi_action') actionBadgeColor = '#0f766e';
                      else if (log.actionType === 'session_lock') actionBadgeColor = '#475569';
                      else if (log.actionType === 'print') actionBadgeColor = '#7c3aed';
                      else if (log.actionType === 'uke_export') actionBadgeColor = '#db2777';
                      else if (log.actionType === 'stock_update') actionBadgeColor = '#0891b2';
                      else if (log.actionType === 'user_switch') actionBadgeColor = '#4b5563';
                      else if (log.actionType === 'facility_settings_update') actionBadgeColor = '#9333ea';
                      else if (log.actionType === 'drug_master_update') actionBadgeColor = '#0e7490';
                      else if (log.actionType === 'patient_medication_info_template') actionBadgeColor = '#047857';
                      else if (log.actionType === 'follow_up_record') actionBadgeColor = '#0f766e';
                      else if (log.actionType === 'ai_suggestion_review') actionBadgeColor = '#7c3aed';
                      else if (log.actionType === 'staff_create') actionBadgeColor = '#15803d';
                      else if (log.actionType === 'staff_delete') actionBadgeColor = '#b91c1c';
                      else if (log.actionType === 'staff_credential_recovery') actionBadgeColor = '#c2410c';
                      else if (log.actionType === 'passkey_register') actionBadgeColor = '#1d4ed8';
                      else if (log.actionType === 'audit_export') actionBadgeColor = '#0369a1';
                      else if (log.actionType === 'audit_retention_approval') actionBadgeColor = '#15803d';
                      else if (log.actionType === 'backup_export') actionBadgeColor = '#0f766e';
                      else if (log.actionType === 'backup_schedule_update') actionBadgeColor = '#4f46e5';
                      else if (log.actionType === 'backup_external_storage') actionBadgeColor = '#047857';
                      else if (log.actionType === 'backup_drill') actionBadgeColor = '#2563eb';
                      else if (log.actionType === 'backup_import') actionBadgeColor = '#b45309';
                      else if (log.actionType === 'official_spec_review') actionBadgeColor = '#0369a1';

                      return (
                        <tr key={log.logId} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem', whiteSpace: 'nowrap', color: 'var(--text-main)' }}>
                            {new Date(log.timestamp).toLocaleString('ja-JP')}
                          </td>
                          <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--text-main)' }}>
                            {log.userName}
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-ghost)', marginLeft: '0.25rem' }}>
                              ({log.userRole === 'pharmacist' ? '薬剤師' : log.userRole === 'clerk' ? '事務' : '管理'})
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              color: 'white',
                              fontSize: '0.75rem',
                              background: actionBadgeColor,
                              fontWeight: 600
                            }}>
                              {auditActionLabel(log.actionType)}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', fontWeight: 500, color: 'var(--text-main)' }}>
                            {log.patientName || '-'}
                          </td>
                          <td style={{ padding: '0.75rem', color: 'var(--text-main)' }}>
                            {log.details}
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'staff' && (
        <div className="settings-section glass">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h2>スタッフアカウント・パスキー管理</h2>
              <p className="section-desc" style={{ marginBottom: 0 }}>
                薬局の操作スタッフを管理し、パスワードとデバイス認証（パスキー）の登録・設定を行います。<br />
                <strong style={{ color: 'var(--primary)' }}>
                  🔑 パスワードはソルト付きPBKDF2-SHA-256でハッシュ化され、平文で保存されることはありません。
                </strong>
              </p>
            </div>
            <button
              className="btn-primary flex-center gap-2"
              style={{ padding: '0.6rem 1.2rem', fontSize: '0.88rem' }}
              onClick={() => setIsAddStaffOpen(true)}
              disabled={!canManageStaff}
              title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : undefined}
            >
              <Plus size={16} />
              <span>スタッフを追加</span>
            </button>
          </div>

          {isOnboardingStaffSetup && currentStaffRecord && (
            <div
              style={{
                border: '1px solid #bfdbfe',
                background: '#eff6ff',
                color: '#1e3a8a',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1.25rem',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem'
              }}
            >
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>
                  {shouldPromptCurrentStaffPasskey ? 'パスキーを登録しましょう' : '次にスタッフを追加しましょう'}
                </strong>
                <span style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
                  {shouldPromptCurrentStaffPasskey
                    ? 'パスワードでも使えますが、日々のログインはパスキーにすると速く安全です。'
                    : '管理者の認証設定は完了しています。受付や調剤で使うスタッフを追加できます。'}
                </span>
              </div>
              {shouldPromptCurrentStaffPasskey ? (
                <button
                  className="btn-primary flex-center gap-2"
                  onClick={() => handleRegisterPasskey(currentStaffRecord)}
                  disabled={!canManageStaff}
                  style={{ padding: '0.55rem 1rem' }}
                >
                  <Fingerprint size={16} />
                  <span>パスキーを登録</span>
                </button>
              ) : (
                <button
                  className="btn-primary flex-center gap-2"
                  onClick={() => setIsAddStaffOpen(true)}
                  disabled={!canManageStaff}
                  style={{ padding: '0.55rem 1rem' }}
                >
                  <Plus size={16} />
                  <span>スタッフを追加</span>
                </button>
              )}
            </div>
          )}

          {/* Add Staff Modal/Form */}
          {isAddStaffOpen && (
            <div 
              style={{
                background: 'rgba(255, 255, 255, 0.9)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.5rem',
                marginBottom: '2rem',
                boxShadow: 'var(--shadow-md)'
              }}
            >
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>スタッフの新規追加</h3>
              <form onSubmit={handleAddStaff} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="form-grid" style={{ gap: '1rem' }}>
                  <div className="form-group">
                    <label htmlFor="new-staff-name" style={{ fontWeight: 600, fontSize: '0.88rem' }}>スタッフ氏名</label>
                    <input
                      id="new-staff-name"
                      type="text"
                      className="form-control"
                      style={{ width: '100%', maxWidth: 'none' }}
                      placeholder="例: 佐藤 花子"
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="new-staff-role" style={{ fontWeight: 600, fontSize: '0.88rem' }}>職種・権限</label>
                    <select
                      id="new-staff-role"
                      className="form-control"
                      style={{ width: '100%', maxWidth: 'none', background: 'white' }}
                      value={newStaffRole}
                      onChange={(e) => setNewStaffRole(e.target.value as any)}
                    >
                      <option value="pharmacist">薬剤師</option>
                      <option value="clerk">事務</option>
                      <option value="admin">管理者</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor="new-staff-password" style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                      ログインパスワード（任意）
                    </label>
                    <input
                      id="new-staff-password"
                      type="password"
                      className="form-control"
                      style={{ width: '100%', maxWidth: 'none' }}
                      placeholder="8文字以上。未入力の場合はパスキー登録が必要です"
                      value={newStaffPassword}
                      onChange={(e) => setNewStaffPassword(e.target.value)}
                      minLength={8}
                    />
                    <span className="help-text">
                      ※パスワードはソルト付きハッシュで保存されます。未設定のスタッフは、管理者がパスキーを登録するまでログインできません。
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '0.5rem 1.25rem' }}
                    onClick={() => {
                      setIsAddStaffOpen(false);
                      setNewStaffName('');
                      setNewStaffPassword('');
                    }}
                    disabled={isSubmittingStaff || !canManageStaff}
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="btn-primary flex-center gap-2"
                    style={{ padding: '0.5rem 1.5rem' }}
                    disabled={isSubmittingStaff || !canManageStaff}
                  >
                    {isSubmittingStaff && <Loader2 size={16} className="animate-spin" />}
                    <span>スタッフを保存</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          <section
            data-testid="role-permission-policy-panel"
            aria-label="権限ロール設定"
            style={{
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
              background: '#f8fafc'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 700 }}>権限ロール設定</h3>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.86rem', lineHeight: 1.55 }}>
                  管理者は全権限固定。薬剤師・事務は店舗の運用に合わせて保存されます。
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
                  onClick={handleResetRolePermissionPolicy}
                  disabled={!canManageStaff || isSavingRolePermissionPolicy}
                  title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : undefined}
                >
                  標準に戻す
                </button>
                <button
                  type="button"
                  className="btn-primary flex-center gap-2"
                  style={{ padding: '0.45rem 0.95rem', fontSize: '0.82rem' }}
                  onClick={handleSaveRolePermissionPolicy}
                  disabled={!canManageStaff || isSavingRolePermissionPolicy}
                  title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : undefined}
                >
                  {isSavingRolePermissionPolicy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  <span>保存</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {ROLE_PERMISSION_SETTING_ROLES.map((role) => {
                const isAdminRole = role === 'admin';
                return (
                  <div
                    key={role}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      background: 'white',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        padding: '0.65rem 0.75rem',
                        borderBottom: '1px solid #e2e8f0',
                        background: isAdminRole ? '#faf5ff' : role === 'pharmacist' ? '#eff6ff' : '#f0fdf4',
                        color: isAdminRole ? '#6b21a8' : role === 'pharmacist' ? '#1d4ed8' : '#15803d',
                        fontWeight: 800,
                        fontSize: '0.88rem'
                      }}
                    >
                      <span>{getRoleLabel(role)}</span>
                      {isAdminRole && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#6b21a8' }}>
                          固定
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gap: '0.4rem', padding: '0.75rem' }}>
                      {ALL_PERMISSION_ACTIONS.map((action) => {
                        const checked = !!rolePermissionPolicy[role]?.includes(action);
                        const disabled = isAdminRole || !canManageStaff || isSavingRolePermissionPolicy;
                        return (
                          <label
                            key={`${role}-${action}`}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '18px 1fr',
                              alignItems: 'center',
                              gap: '0.45rem',
                              minHeight: '28px',
                              color: disabled && !checked ? 'var(--text-ghost)' : 'var(--text-main)',
                              fontSize: '0.82rem',
                              fontWeight: checked ? 700 : 500,
                              cursor: disabled ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => handleRolePermissionToggle(role, action)}
                              aria-label={`${getRoleLabel(role)}の${getPermissionLabel(action)}`}
                            />
                            <span>{getPermissionLabel(action)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section
            data-testid="staff-recovery-panel"
            aria-label="復旧・退職対応"
            style={{
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
              background: '#fff7ed'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 700 }}>復旧・退職対応</h3>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.86rem', lineHeight: 1.55 }}>
                  端末移行、退職、パスキー紛失時に、対象スタッフと確認事項をそろえてから認証情報を復旧します。
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  style={{ padding: '0.45rem 0.8rem' }}
                  onClick={handleExportStaffAccessRecoveryMonthlyReviewCsv}
                  disabled={!canViewAuditLogs || isExportingStaffAccessRecoveryMonthlyReview}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
                  data-testid="staff-access-recovery-monthly-review-csv"
                >
                  {isExportingStaffAccessRecoveryMonthlyReview ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>月次棚卸CSV</span>
                </button>
                <span style={staffRecoveryStatusStyle(staffRecoveryChecklist.status)}>
                  {staffRecoveryChecklist.statusLabel}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.9rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 700, fontSize: '0.84rem' }}>
                対象スタッフ
                <select
                  className="form-control"
                  style={{ width: '100%', maxWidth: 'none', background: 'white' }}
                  value={staffRecoveryTargetUserId}
                  onChange={(e) => setStaffRecoveryTargetUserId(e.target.value)}
                  disabled={!canManageStaff || isHandlingStaffRecovery}
                >
                  {staffList.length === 0 && <option value="">スタッフなし</option>}
                  {staffList.map((staff) => (
                    <option key={staff.userId} value={staff.userId}>
                      {staff.name}（{getRoleLabel(staff.role)}）
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 700, fontSize: '0.84rem' }}>
                理由
                <select
                  className="form-control"
                  style={{ width: '100%', maxWidth: 'none', background: 'white' }}
                  value={staffRecoveryReason}
                  onChange={(e) => setStaffRecoveryReason(e.target.value as StaffRecoveryReason)}
                  disabled={!canManageStaff || isHandlingStaffRecovery}
                >
                  {(Object.keys(STAFF_RECOVERY_REASON_LABELS) as StaffRecoveryReason[]).map((reason) => (
                    <option key={reason} value={reason}>{STAFF_RECOVERY_REASON_LABELS[reason]}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 700, fontSize: '0.84rem' }}>
                再設定パスワード
                <input
                  type="password"
                  className="form-control"
                  style={{ width: '100%', maxWidth: 'none' }}
                  value={staffRecoveryPassword}
                  onChange={(e) => setStaffRecoveryPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="8文字以上"
                  disabled={!canManageStaff || isHandlingStaffRecovery}
                />
              </label>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 700, fontSize: '0.84rem', marginBottom: '0.9rem' }}>
              対応メモ
              <textarea
                className="form-control"
                style={{ width: '100%', maxWidth: 'none', minHeight: '72px', resize: 'vertical' }}
                value={staffRecoveryNote}
                onChange={(e) => setStaffRecoveryNote(e.target.value)}
                placeholder="例: 本人確認済み、旧端末は回収済み"
                disabled={!canManageStaff || isHandlingStaffRecovery}
              />
            </label>

            <div style={{ display: 'grid', gap: '0.45rem', marginBottom: '1rem' }}>
              {staffRecoveryChecklist.steps.map((step) => (
                <div
                  key={step.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: '0.65rem',
                    alignItems: 'center',
                    padding: '0.55rem 0.65rem',
                    border: '1px solid #fed7aa',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.82)',
                    fontSize: '0.82rem'
                  }}
                >
                  <strong style={{ color: 'var(--text-main)' }}>{step.label}</strong>
                  <span style={staffRecoveryStatusStyle(step.status)}>
                    {step.status === 'complete' ? 'OK' : step.status === 'attention' ? '要確認' : '要対応'}
                  </span>
                  <span style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>{step.detail}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary flex-center gap-2"
                style={{ padding: '0.5rem 0.9rem' }}
                onClick={handleResetStaffRecoveryPassword}
                disabled={!canManageStaff || isHandlingStaffRecovery || !staffRecoveryTarget || staffRecoveryPassword.trim().length < 8}
                title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : staffRecoveryPassword.trim().length < 8 ? '8文字以上の新しいパスワードを入力してください' : undefined}
              >
                <KeyRound size={15} />
                <span>パスワード再設定</span>
              </button>
              <button
                type="button"
                className="btn-secondary flex-center gap-2"
                style={{ padding: '0.5rem 0.9rem' }}
                onClick={handleClearStaffRecoveryPasskey}
                disabled={!canManageStaff || isHandlingStaffRecovery || !staffRecoveryTarget?.passkeyCredentialId}
                title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : !staffRecoveryTarget?.passkeyCredentialId ? '解除するパスキーがありません' : undefined}
              >
                <Fingerprint size={15} />
                <span>パスキーを解除</span>
              </button>
              {staffRecoveryReason === 'staff_retirement' && (
                <button
                  type="button"
                  className="btn-primary flex-center gap-2"
                  style={{ padding: '0.5rem 0.95rem' }}
                  onClick={handleRecordStaffRetirementCheck}
                  disabled={!canManageStaff || isHandlingStaffRecovery || !staffRecoveryTarget}
                  title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : undefined}
                >
                  {isHandlingStaffRecovery ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                  <span>退職前チェックを記録</span>
                </button>
              )}
            </div>
          </section>

          {/* Staff List Table */}
          <div className="table-responsive" style={{ background: 'white', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table className="audit-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>氏名</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>職種・権限</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>パスワード</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>パスキーデバイス</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((staff) => {
                  const isLastCredentialedAdmin = staff.role === 'admin' && hasLoginCredential(staff) && credentialedAdminCount <= 1;
                  return (
                  <tr key={staff.userId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1rem', fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {staff.name}
                      {isInitialAdminUser(staff) && (
                        <span
                          style={{
                            marginLeft: '0.5rem',
                            padding: '0.12rem 0.4rem',
                            borderRadius: '4px',
                            background: '#fef3c7',
                            color: '#92400e',
                            fontSize: '0.72rem',
                            fontWeight: 700
                          }}
                        >
                          初期管理者
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.88rem' }}>
                      <span 
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          background: staff.role === 'pharmacist' ? '#eff6ff' : staff.role === 'clerk' ? '#f0fdf4' : '#faf5ff',
                          color: staff.role === 'pharmacist' ? '#1d4ed8' : staff.role === 'clerk' ? '#15803d' : '#6b21a8'
                        }}
                      >
                        {staff.role === 'pharmacist' ? '薬剤師' : staff.role === 'clerk' ? '事務' : '管理者'}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '1rem',
                        fontSize: '0.88rem',
                        color: staff.passwordHash && staff.salt ? '#16a34a' : 'var(--text-ghost)',
                        fontWeight: 500
                      }}
                    >
                      {staff.passwordHash && staff.salt ? '● 設定済み (PBKDF2-SHA-256)' : '未設定'}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.88rem' }}>
                      {staff.passkeyCredentialId ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#2563eb', fontWeight: 500 }}>
                          <Fingerprint size={14} />
                          <span>登録済み (WebAuthn)</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-ghost)', fontSize: '0.85rem' }}>未登録</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          className="btn-secondary flex-center gap-1"
                          style={{
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.8rem',
                            borderColor: staff.passkeyCredentialId ? '#d1d5db' : '#3b82f6',
                            color: staff.passkeyCredentialId ? 'var(--text-main)' : '#2563eb',
                            background: staff.passkeyCredentialId ? 'transparent' : 'rgba(37, 99, 235, 0.03)'
                          }}
                          onClick={() => handleRegisterPasskey(staff)}
                          title="生体認証（指紋・顔認証）デバイスをログインキーとして登録します"
                          disabled={!canManageStaff}
                        >
                          <Fingerprint size={13} />
                          <span>{staff.passkeyCredentialId ? '再登録' : 'パスキーを登録'}</span>
                        </button>
                        {!hasLoginCredential(staff) && (
                          <span style={{ color: '#b45309', fontSize: '0.78rem', fontWeight: 700 }}>
                            要登録
                          </span>
                        )}
                        <button
                          className="btn-trash flex-center"
                          style={{ padding: '0.4rem', color: '#ef4444' }}
                          onClick={() => handleDeleteStaff(staff)}
                          title={isLastCredentialedAdmin ? '最後の認証済み管理者は削除できません' : 'スタッフアカウントを削除'}
                          aria-label={`${staff.name}を削除`}
                          disabled={!canManageStaff || isLastCredentialedAdmin}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'terminalSync' && (
        <div className="settings-section glass">
          <h2>端末同期（メイン端末集約）</h2>
          <p className="section-desc">
            メイン端末(hub)に患者データを集約し、サテライト端末は患者データを保存しません。<br />
            サテライト端末の登録・失効と、同期競合のレビューを行います。
          </p>
          <TerminalSyncPanel />
        </div>
      )}

      <style jsx>{`
        .settings-container {
          max-width: 800px;
          margin: 0 auto;
        }
        .page-header {
          margin-bottom: 2rem;
        }
        .page-header h1 {
          font-size: 1.75rem;
          margin-bottom: 0.5rem;
        }
        .initial-setup-panel {
          border: 1px solid rgba(148, 163, 184, 0.45);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.86);
          padding: 1rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
        }
        .initial-setup-head {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 0.9rem;
        }
        .initial-setup-head > div:first-child {
          flex: 1 1 240px;
          min-width: min(240px, 100%);
        }
        .initial-setup-head h2 {
          margin: 0 0 0.25rem;
        }
        .initial-setup-head .section-desc {
          margin: 0;
        }
        .initial-setup-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 0.55rem;
          min-width: 220px;
        }
        .initial-setup-actions button,
        .initial-setup-step button {
          min-height: auto;
          padding: 0.45rem 0.7rem;
          font-size: 0.78rem;
          white-space: nowrap;
        }
        .initial-setup-status {
          display: inline-flex;
          align-items: center;
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 999px;
          padding: 0.18rem 0.7rem;
          font-size: 0.78rem;
          font-weight: 850;
          white-space: nowrap;
        }
        .initial-setup-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 0.8rem;
        }
        .initial-setup-metrics div {
          padding: 0.7rem 0.8rem;
          border-right: 1px solid var(--border);
          background: rgba(248, 250, 252, 0.78);
        }
        .initial-setup-metrics div:last-child {
          border-right: none;
        }
        .initial-setup-metrics span,
        .initial-setup-step-main span {
          display: block;
          color: var(--text-muted);
          font-size: 0.72rem;
          font-weight: 750;
        }
        .initial-setup-metrics strong {
          display: block;
          color: var(--text-main);
          font-size: 1.06rem;
          font-weight: 850;
          margin-top: 0.12rem;
        }
        .initial-setup-steps {
          display: grid;
          gap: 0.45rem;
        }
        .initial-setup-step {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 0.7rem;
          padding: 0.55rem 0;
          border-top: 1px solid rgba(148, 163, 184, 0.22);
        }
        .initial-setup-step-main {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: 0.65rem;
          min-width: 0;
        }
        .initial-setup-step-main strong {
          display: block;
          color: var(--text-main);
          font-size: 0.84rem;
          font-weight: 850;
          line-height: 1.35;
        }
        .initial-setup-step-main span {
          overflow-wrap: anywhere;
          line-height: 1.45;
        }
        .initial-setup-required-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          margin-top: 0.38rem;
        }
        .initial-setup-required-actions span {
          display: inline-flex;
          align-items: center;
          max-width: 100%;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 999px;
          padding: 0.12rem 0.5rem;
          background: rgba(248, 250, 252, 0.84);
          color: var(--text-muted);
          font-size: 0.7rem;
          font-weight: 750;
        }
        .settings-section {
          padding: 2rem;
          border-radius: var(--radius-lg);
          border: 1px solid var(--border);
        }
        .medication-info-template-layout {
          display: grid;
          grid-template-columns: minmax(260px, 0.9fr) minmax(0, 2fr);
          gap: 1rem;
          align-items: start;
        }
        .medication-info-template-actions {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0;
          margin-bottom: 0.75rem;
        }
        .medication-info-template-draft-note {
          flex: 1 1 220px;
          min-width: 0;
          color: var(--text-muted);
          font-size: 0.82rem;
          overflow-wrap: anywhere;
        }
        .form-group {
          margin-bottom: 1.5rem;
        }
        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0 1rem;
        }
        .form-grid-wide {
          grid-column: 1 / -1;
        }
        .form-group label {
          display: block;
          font-weight: 500;
          margin-bottom: 0.5rem;
        }
        .form-control {
          width: 100%;
          max-width: 400px;
          padding: 0.75rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: 1rem;
          background: var(--bg-card);
        }
        .checkbox-group {
          display: flex;
          flex-direction: column;
        }
        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          cursor: pointer;
        }
        .checkbox-label input[type="checkbox"] {
          width: 1.25rem;
          height: 1.25rem;
          accent-color: var(--primary);
        }
        .help-text {
          display: block;
          margin-top: 0.25rem;
          color: var(--text-muted);
          font-size: 0.85rem;
        }
        h2 {
          font-size: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .section-desc {
          color: var(--text-muted);
          margin-bottom: 1.5rem;
          font-size: 0.95rem;
        }
        .subsection-title {
          font-size: 1rem;
          margin: 1.5rem 0 1rem;
        }
        @media (max-width: 700px) {
          .initial-setup-head,
          .initial-setup-step {
            grid-template-columns: 1fr;
            flex-direction: column;
            align-items: stretch;
          }
          .initial-setup-actions {
            justify-content: flex-start;
            min-width: 0;
          }
          .initial-setup-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .initial-setup-metrics div:nth-child(2n) {
            border-right: none;
          }
          .initial-setup-metrics div:nth-child(-n + 2) {
            border-bottom: 1px solid var(--border);
          }
          .initial-setup-step button {
            justify-self: flex-start;
          }
          .form-grid {
            grid-template-columns: 1fr;
          }
          .medication-info-template-section {
            padding: 1rem;
          }
          .medication-info-template-layout {
            grid-template-columns: minmax(0, 1fr);
          }
          .medication-info-template-draft-note {
            flex-basis: 100%;
          }
        }
        .upload-area {
          margin-bottom: 1.5rem;
        }
        .file-input-label {
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
          border: 2px dashed var(--border);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--transition-fast);
          color: var(--primary);
          font-weight: 500;
        }
        .file-input-label:hover {
          border-color: var(--primary);
          background: rgba(37, 99, 235, 0.05);
        }
        .file-input-label:focus-within {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
          border-color: var(--primary);
        }
        .hidden-input {
          clip: rect(0 0 0 0);
          clip-path: inset(50%);
          height: 1px;
          overflow: hidden;
          position: absolute;
          white-space: nowrap;
          width: 1px;
        }
        .file-info {
          margin-top: 1rem;
          font-size: 0.9rem;
          color: var(--text-main);
        }
        .actions {
          margin-top: 2rem;
        }
        .backup-section {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .backup-alert {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          padding: 0.85rem 1rem;
          border: 1px solid #fcd34d;
          border-radius: 8px;
          background: #fffbeb;
          color: #92400e;
          font-size: 0.88rem;
          line-height: 1.55;
        }
        .backup-plain-warning {
          border: 1px solid #f59e0b;
          border-radius: 8px;
          background: #fffbeb;
          color: #92400e;
          padding: 0.65rem 0.8rem;
          font-size: 0.82rem;
          font-weight: 650;
          line-height: 1.55;
          max-width: 620px;
        }
        .backup-schedule-section {
          padding: 0 0 1.2rem;
          border-bottom: 1px solid var(--border);
        }
        .backup-schedule-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 0.85rem;
        }
        .backup-schedule-header h3 {
          margin: 0 0 0.25rem;
          font-size: 1rem;
          color: var(--text-main);
        }
        .backup-schedule-status {
          display: inline-flex;
          align-items: center;
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 999px;
          padding: 0.18rem 0.65rem;
          font-size: 0.78rem;
          font-weight: 800;
          white-space: nowrap;
        }
        .backup-schedule-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 0.75rem;
          margin-bottom: 0.65rem;
        }
        .backup-schedule-summary div {
          border-left: 3px solid var(--primary);
          padding: 0.2rem 0 0.2rem 0.65rem;
        }
        .backup-schedule-summary span {
          display: block;
          color: var(--text-ghost);
          font-size: 0.74rem;
          font-weight: 700;
        }
        .backup-schedule-summary strong {
          display: block;
          color: var(--text-main);
          font-size: 0.96rem;
          font-weight: 800;
          overflow-wrap: anywhere;
        }
        .backup-schedule-form {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.65rem 1rem;
          margin-top: 0.85rem;
        }
        .backup-schedule-form label {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          color: var(--text-main);
          font-size: 0.83rem;
          font-weight: 700;
        }
        .backup-schedule-form input[type="checkbox"] {
          width: 1rem;
          height: 1rem;
          accent-color: var(--primary);
        }
        .backup-schedule-form input[type="time"] {
          width: 7.5rem;
          margin: 0;
          padding: 0.42rem 0.55rem;
          font-size: 0.86rem;
        }
        .backup-workflow {
          display: flex;
          flex-direction: column;
          border-top: 1px solid var(--border);
        }
        .backup-workflow-item {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 1.25rem;
          padding: 1.25rem 0;
          border-bottom: 1px solid var(--border);
        }
        .backup-workflow-item h3 {
          margin: 0 0 0.25rem;
          font-size: 1rem;
          color: var(--text-main);
        }
        .backup-workflow-item .help-text {
          margin: 0;
          line-height: 1.55;
        }
        .backup-external-item {
          align-items: flex-start;
        }
        .backup-external-form {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.75rem;
          width: 100%;
        }
        .backup-external-form label {
          display: flex;
          flex-direction: column;
          gap: 0.32rem;
          color: var(--text-main);
          font-size: 0.82rem;
          font-weight: 700;
        }
        .backup-external-form input.form-control {
          margin: 0;
          padding: 0.55rem 0.65rem;
          font-size: 0.88rem;
        }
        .backup-external-checks {
          grid-column: 1 / -1;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem 1rem;
        }
        .backup-external-checks label {
          flex-direction: row;
          align-items: center;
          font-weight: 700;
        }
        .backup-external-checks input {
          width: 1rem;
          height: 1rem;
          accent-color: var(--primary);
        }
        .backup-external-notes {
          grid-column: 1 / -1;
        }
        .backup-external-receipt {
          grid-column: 1 / -1;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.65rem;
          padding-top: 0.25rem;
        }
        .backup-import-controls {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          align-items: center;
          gap: 0.75rem;
          max-width: 360px;
        }
        .status-message {
          margin-top: 1.5rem;
          padding: 1rem;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.95rem;
        }
        .status-message.success {
          background: #dcfce7;
          color: #166534;
          border: 1px solid #bbf7d0;
        }
        .status-message.error {
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }
        .tab-pill:disabled {
          opacity: 0.55;
          cursor: not-allowed !important;
        }
        .official-audit-section {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .official-audit-header {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
        }
        .official-audit-score {
          min-width: 92px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          padding: 0.65rem 0.8rem;
          border: 1px solid rgba(37, 99, 235, 0.22);
          border-radius: 8px;
          color: #1d4ed8;
          background: #eff6ff;
          font-weight: 800;
        }
        .official-audit-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.72);
        }
        .official-audit-metrics div {
          padding: 0.85rem;
          border-right: 1px solid var(--border);
        }
        .official-audit-metrics div:last-child {
          border-right: none;
        }
        .official-audit-metrics span {
          display: block;
          color: var(--text-muted);
          font-size: 0.76rem;
          font-weight: 700;
          margin-bottom: 0.2rem;
        }
        .official-audit-metrics strong {
          font-size: 1.25rem;
          color: var(--text-main);
        }
        .official-audit-metrics .metric-danger strong {
          color: #b91c1c;
        }
        .official-audit-alert {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          padding: 0.85rem 1rem;
          border: 1px solid #fca5a5;
          border-radius: 8px;
          background: #fef2f2;
          color: #991b1b;
          font-size: 0.88rem;
          line-height: 1.55;
        }
        .official-audit-review-workspace {
          padding: 1rem 0;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
        }
        .official-audit-review-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.85rem;
        }
        .official-audit-review-header h3 {
          margin: 0 0 0.25rem;
          color: var(--text-main);
          font-size: 1rem;
        }
        .official-audit-review-header a {
          color: var(--primary);
          font-size: 0.78rem;
          text-decoration: none;
        }
        .official-audit-review-header > span {
          flex: 0 0 auto;
          padding: 0.22rem 0.55rem;
          border: 1px solid currentColor;
          border-radius: 6px;
          font-size: 0.76rem;
          font-weight: 800;
        }
        .official-audit-review-header .review-status-ok {
          color: #166534;
          background: #f0fdf4;
        }
        .official-audit-review-header .review-status-pending {
          color: #9a3412;
          background: #fff7ed;
        }
        .official-audit-review-actions {
          margin-top: 0.65rem;
          align-items: center;
        }
        .official-audit-review-label {
          margin: 0.8rem 0 0;
          color: var(--text-muted);
          font-size: 0.8rem;
          line-height: 1.55;
          overflow-wrap: anywhere;
        }
        .official-audit-review-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          margin-top: 0.85rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.72);
        }
        .official-audit-review-metrics div {
          min-width: 0;
          padding: 0.7rem 0.8rem;
          border-right: 1px solid var(--border);
        }
        .official-audit-review-metrics div:last-child {
          border-right: none;
        }
        .official-audit-review-metrics span {
          display: block;
          margin-bottom: 0.15rem;
          color: var(--text-muted);
          font-size: 0.72rem;
          font-weight: 700;
        }
        .official-audit-review-metrics strong {
          color: var(--text-main);
          font-size: 1.05rem;
        }
        .official-audit-review-metrics .metric-danger strong {
          color: #b91c1c;
        }
        .official-audit-review-blockers {
          display: grid;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }
        .official-audit-review-blockers > div {
          display: flex;
          align-items: flex-start;
          gap: 0.55rem;
          padding: 0.65rem 0.75rem;
          border-left: 3px solid #ea580c;
          background: #fff7ed;
          color: #9a3412;
          font-size: 0.8rem;
          line-height: 1.5;
        }
        .official-audit-review-blockers svg {
          flex: 0 0 auto;
          margin-top: 0.1rem;
        }
        .official-audit-list {
          display: flex;
          flex-direction: column;
          border-top: 1px solid var(--border);
        }
        .official-audit-row {
          padding: 1.15rem 0;
          border-bottom: 1px solid var(--border);
        }
        .official-audit-row-main {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .official-audit-titleline {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
        }
        .official-audit-titleline h3 {
          margin: 0;
          font-size: 1rem;
          color: var(--text-main);
          line-height: 1.35;
        }
        .official-audit-basis {
          margin: 0;
          color: var(--text-muted);
          font-size: 0.86rem;
          line-height: 1.55;
        }
        .official-audit-detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
          margin-top: 0.85rem;
        }
        .official-audit-detail-grid h4 {
          margin: 0 0 0.35rem;
          font-size: 0.78rem;
          color: var(--text-muted);
        }
        .official-audit-detail-grid ul {
          margin: 0;
          padding-left: 1.15rem;
          color: var(--text-main);
          font-size: 0.86rem;
          line-height: 1.55;
        }
        .official-audit-sources {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          margin-top: 0.85rem;
        }
        .official-audit-sources a {
          display: inline-flex;
          align-items: center;
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 0.25rem 0.5rem;
          color: var(--primary);
          background: rgba(255, 255, 255, 0.7);
          font-size: 0.78rem;
          text-decoration: none;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @media (max-width: 700px) {
          .official-audit-header {
            flex-direction: column;
          }
          .backup-workflow-item {
            grid-template-columns: 1fr;
          }
          .backup-import-controls {
            justify-content: flex-start;
            max-width: none;
          }
          .official-audit-metrics,
          .official-audit-detail-grid,
          .official-audit-review-metrics {
            grid-template-columns: 1fr;
          }
          .official-audit-metrics div,
          .official-audit-review-metrics div {
            border-right: none;
            border-bottom: 1px solid var(--border);
          }
          .official-audit-metrics div:last-child,
          .official-audit-review-metrics div:last-child {
            border-bottom: none;
          }
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
