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
import { MedicalInstitutionMasterSyncModal } from '@/components/MedicalInstitutionMasterSyncModal';
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
import FacilitySettingsTab from '@/components/settings/FacilitySettingsTab';
import ExternalConnectorSettingsTab from '@/components/settings/ExternalConnectorSettingsTab';
import MedicationInfoTemplateSettingsTab from '@/components/settings/MedicationInfoTemplateSettingsTab';
import { drugMasterCandidateKindLabel } from '@/lib/drug_master_update_ui';
import DrugMasterSettingsTab from '@/components/settings/DrugMasterSettingsTab';
import BackupSettingsTab from '@/components/settings/BackupSettingsTab';
import OfficialAuditSettingsTab from '@/components/settings/OfficialAuditSettingsTab';
import AuditSettingsTab from '@/components/settings/AuditSettingsTab';
import StaffSettingsTab from '@/components/settings/StaffSettingsTab';
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
import {
  MEDICATION_INFO_SOURCE_TYPE_LABELS,
  MEDICATION_INFO_TEMPLATE_READINESS_LABELS,
  MEDICATION_INFO_TEMPLATE_STATUS_LABELS,
  createEmptyMedicationInfoTemplateForm,
  type MedicationInfoCsvImportSummary,
  type MedicationInfoSourceType,
  type MedicationInfoTemplateForm,
  type MedicationInfoTemplateReadinessFilter,
  type MedicationInfoTemplateStatusFilter
} from '@/lib/medication_info_template_ui';

type SettingsTab = 'facility' | 'external' | 'master' | 'medicationInfo' | 'backup' | 'officialAudit' | 'audit' | 'staff' | 'terminalSync';

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
  const [isMedicalInstSyncOpen, setIsMedicalInstSyncOpen] = useState(false);
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
        <FacilitySettingsTab
          settings={settings}
          currentUser={currentUser}
          canManageFacility={canManageFacility}
          isSavingSettings={isSavingSettings}
          isImportingOfficialFeeCodeCsv={isImportingOfficialFeeCodeCsv}
          isReviewingOfficialFeeCodeMasterCsv={isReviewingOfficialFeeCodeMasterCsv}
          officialFeeCodeMasterProposal={officialFeeCodeMasterProposal}
          handleSettingsChange={handleSettingsChange}
          handleExportOfficialFeeCodeCsv={handleExportOfficialFeeCodeCsv}
          handleImportOfficialFeeCodeCsv={handleImportOfficialFeeCodeCsv}
          handleReviewOfficialFeeCodeMasterCsv={handleReviewOfficialFeeCodeMasterCsv}
          handleApplyOfficialFeeCodeMasterProposal={handleApplyOfficialFeeCodeMasterProposal}
          handleExportOfficialFeeCodeMasterProposalReviewCsv={handleExportOfficialFeeCodeMasterProposalReviewCsv}
          handleOfficialFeeCodeChange={handleOfficialFeeCodeChange}
          handleSaveSettings={handleSaveSettings}
        />
      )}

      {activeTab === 'external' && (
        <ExternalConnectorSettingsTab
          externalConnectorReadiness={externalConnectorReadiness}
          isLoadingExternalConnectorReadiness={isLoadingExternalConnectorReadiness}
          refreshExternalConnectorReadiness={refreshExternalConnectorReadiness}
        />
      )}

      {activeTab === 'medicationInfo' && (
        <MedicationInfoTemplateSettingsTab
          invalidApprovedMedicationInfoTemplates={invalidApprovedMedicationInfoTemplates}
          medicationInfoTemplateStatusFilter={medicationInfoTemplateStatusFilter}
          setMedicationInfoTemplateStatusFilter={setMedicationInfoTemplateStatusFilter}
          medicationInfoTemplates={medicationInfoTemplates}
          medicationInfoTemplateStatusCounts={medicationInfoTemplateStatusCounts}
          medicationInfoTemplateReadinessFilter={medicationInfoTemplateReadinessFilter}
          setMedicationInfoTemplateReadinessFilter={setMedicationInfoTemplateReadinessFilter}
          medicationInfoTemplateReadinessCounts={medicationInfoTemplateReadinessCounts}
          medicationInfoTemplateSearch={medicationInfoTemplateSearch}
          setMedicationInfoTemplateSearch={setMedicationInfoTemplateSearch}
          filteredMedicationInfoTemplates={filteredMedicationInfoTemplates}
          isLoadingMedicationInfoTemplates={isLoadingMedicationInfoTemplates}
          selectedMedicationInfoTemplateId={selectedMedicationInfoTemplateId}
          handleSelectMedicationInfoTemplate={handleSelectMedicationInfoTemplate}
          getMedicationInfoTemplateReadinessIssues={getMedicationInfoTemplateReadinessIssues}
          handleNewMedicationInfoTemplate={handleNewMedicationInfoTemplate}
          isSavingMedicationInfoTemplate={isSavingMedicationInfoTemplate}
          isImportingMedicationInfoCsv={isImportingMedicationInfoCsv}
          handleExportMedicationInfoCsv={handleExportMedicationInfoCsv}
          canManageFacility={canManageFacility}
          handleImportMedicationInfoCsv={handleImportMedicationInfoCsv}
          handleUsePmdaMedicationInfoSearchUrl={handleUsePmdaMedicationInfoSearchUrl}
          isBuildingMedicationInfoSafetyDraft={isBuildingMedicationInfoSafetyDraft}
          handleApplyMedicationInfoSafetyDraft={handleApplyMedicationInfoSafetyDraft}
          handleExportMedicationInfoSafetyDraftCsv={handleExportMedicationInfoSafetyDraftCsv}
          isExportingMedicationInfoSafetyDraftCsv={isExportingMedicationInfoSafetyDraftCsv}
          medicationInfoCsvImportSummary={medicationInfoCsvImportSummary}
          selectedMedicationInfoTemplate={selectedMedicationInfoTemplate}
          isEditingImmutableMedicationInfoRevision={isEditingImmutableMedicationInfoRevision}
          medicationInfoTemplateForm={medicationInfoTemplateForm}
          handleMedicationInfoTemplateFormChange={handleMedicationInfoTemplateFormChange}
          currentMedicationInfoApprovalIssues={currentMedicationInfoApprovalIssues}
          handleSaveMedicationInfoTemplate={handleSaveMedicationInfoTemplate}
        />
      )}

      {activeTab === 'master' && (
        <DrugMasterSettingsTab
          currentUser={currentUser}
          canUpdateDrugMaster={canUpdateDrugMaster}
          isMedicalInstSyncOpen={isMedicalInstSyncOpen}
          setIsMedicalInstSyncOpen={setIsMedicalInstSyncOpen}
          handleFileChange={handleFileChange}
          isUploading={isUploading}
          isImportingDrugMasterFromUrl={isImportingDrugMasterFromUrl}
          file={file}
          drugMasterSourceUrl={drugMasterSourceUrl}
          setDrugMasterSourceUrl={setDrugMasterSourceUrl}
          handleFetchDrugMasterOfficialPage={handleFetchDrugMasterOfficialPage}
          isFetchingDrugMasterOfficialPage={isFetchingDrugMasterOfficialPage}
          drugMasterOfficialPageHtml={drugMasterOfficialPageHtml}
          setDrugMasterOfficialPageHtml={setDrugMasterOfficialPageHtml}
          handleExtractDrugMasterCandidates={handleExtractDrugMasterCandidates}
          drugMasterCandidateMessage={drugMasterCandidateMessage}
          drugMasterCandidates={drugMasterCandidates}
          handleSelectDrugMasterCandidate={handleSelectDrugMasterCandidate}
          drugMasterSpecPdfText={drugMasterSpecPdfText}
          setDrugMasterSpecPdfText={setDrugMasterSpecPdfText}
          setDrugMasterSpecPdfReview={setDrugMasterSpecPdfReview}
          setDrugMasterSpecPdfReviewLabel={setDrugMasterSpecPdfReviewLabel}
          isFetchingDrugMasterSpecPdf={isFetchingDrugMasterSpecPdf}
          handleFetchDrugMasterSpecPdf={handleFetchDrugMasterSpecPdf}
          handleReviewDrugMasterSpecPdfText={handleReviewDrugMasterSpecPdfText}
          drugMasterSpecPdfReviewLabel={drugMasterSpecPdfReviewLabel}
          drugMasterSpecPdfReview={drugMasterSpecPdfReview}
          canImportDrugMasterFromSourceUrl={canImportDrugMasterFromSourceUrl}
          handleImportDrugMasterFromSourceUrl={handleImportDrugMasterFromSourceUrl}
          handleUpload={handleUpload}
          rollbackFile={rollbackFile}
          handleDrugMasterRollbackFileChange={handleDrugMasterRollbackFileChange}
          isRollingBackDrugMaster={isRollingBackDrugMaster}
          handleApplyDrugMasterRollback={handleApplyDrugMasterRollback}
          handleScanDrugDuplicates={handleScanDrugDuplicates}
          isScanningDrugDuplicates={isScanningDrugDuplicates}
          drugDuplicateMessage={drugDuplicateMessage}
          drugDuplicateReport={drugDuplicateReport}
          drugMergeTargets={drugMergeTargets}
          setDrugMergeTargets={setDrugMergeTargets}
          setDrugMergeReview={setDrugMergeReview}
          openDrugMergeReview={openDrugMergeReview}
          isApplyingDrugMerge={isApplyingDrugMerge}
          drugMergeReview={drugMergeReview}
          handleApplyDrugMerge={handleApplyDrugMerge}
        />
      )}

      {activeTab === 'backup' && (
        <BackupSettingsTab
          currentUser={currentUser}
          canManageBackups={canManageBackups}
          downloadTextFile={downloadTextFile}
          formatDateTimeStamp={formatDateTimeStamp}
          backupScheduleReview={backupScheduleReview}
          backupScheduleReviewColor={backupScheduleReviewColor}
          backupScheduleReviewBackground={backupScheduleReviewBackground}
          backupSchedulePolicy={backupSchedulePolicy}
          handleBackupSchedulePolicyChange={handleBackupSchedulePolicyChange}
          isSavingBackupSchedule={isSavingBackupSchedule}
          handleSaveBackupSchedulePolicy={handleSaveBackupSchedulePolicy}
          handleScanPatientDuplicates={handleScanPatientDuplicates}
          isScanningPatientDuplicates={isScanningPatientDuplicates}
          patientDuplicateMessage={patientDuplicateMessage}
          patientDuplicateReport={patientDuplicateReport}
          duplicateMergeTargets={duplicateMergeTargets}
          setDuplicateMergeTargets={setDuplicateMergeTargets}
          setDuplicateMergeReview={setDuplicateMergeReview}
          openDuplicateMergeReview={openDuplicateMergeReview}
          isApplyingDuplicateMerge={isApplyingDuplicateMerge}
          duplicateMergeReview={duplicateMergeReview}
          handleApplyDuplicateMerge={handleApplyDuplicateMerge}
          backupGenerationReview={backupGenerationReview}
          backupGenerationReviewColor={backupGenerationReviewColor}
          backupGenerationReviewBackground={backupGenerationReviewBackground}
          handleExportBackupGenerationReviewCsv={handleExportBackupGenerationReviewCsv}
          isExportingBackupGenerationReview={isExportingBackupGenerationReview}
          soapDraftFeedbackBackground={soapDraftFeedbackBackground}
          soapDraftFeedbackColor={soapDraftFeedbackColor}
          aiSuggestionFeedbackReview={aiSuggestionFeedbackReview}
          storeFeedbackBackground={storeFeedbackBackground}
          storeFeedbackColor={storeFeedbackColor}
          latestBackupGenerationLabel={latestBackupGenerationLabel}
          latestBackupDrillLabel={latestBackupDrillLabel}
          latestBackupExternalStorageLabel={latestBackupExternalStorageLabel}
          useEncryption={useEncryption}
          setUseEncryption={setUseEncryption}
          showExportPassword={showExportPassword}
          setShowExportPassword={setShowExportPassword}
          exportPassword={exportPassword}
          setExportPassword={setExportPassword}
          exportBackupExternalTransferManifest={exportBackupExternalTransferManifest}
          setExportBackupExternalTransferManifest={setExportBackupExternalTransferManifest}
          externalBackupRetentionDays={externalBackupRetentionDays}
          setExternalBackupRetentionDays={setExternalBackupRetentionDays}
          handleExportBackup={handleExportBackup}
          isExportingBackup={isExportingBackup}
          handleRecordBackupExternalStorage={handleRecordBackupExternalStorage}
          isRecordingExternalBackupStorage={isRecordingExternalBackupStorage}
          externalBackupFileName={externalBackupFileName}
          setExternalBackupFileName={setExternalBackupFileName}
          externalBackupDestinationName={externalBackupDestinationName}
          setExternalBackupDestinationName={setExternalBackupDestinationName}
          externalBackupDestinationPath={externalBackupDestinationPath}
          setExternalBackupDestinationPath={setExternalBackupDestinationPath}
          externalBackupVerifierName={externalBackupVerifierName}
          setExternalBackupVerifierName={setExternalBackupVerifierName}
          externalBackupReadBackVerified={externalBackupReadBackVerified}
          setExternalBackupReadBackVerified={setExternalBackupReadBackVerified}
          externalBackupImmutableVerified={externalBackupImmutableVerified}
          setExternalBackupImmutableVerified={setExternalBackupImmutableVerified}
          externalBackupNotes={externalBackupNotes}
          setExternalBackupNotes={setExternalBackupNotes}
          handleExternalBackupReceiptFileChange={handleExternalBackupReceiptFileChange}
          externalBackupReceiptFile={externalBackupReceiptFile}
          isRecordingExternalBackupReceipt={isRecordingExternalBackupReceipt}
          handleRecordBackupExternalTransferReceipt={handleRecordBackupExternalTransferReceipt}
          migrationCsvKind={migrationCsvKind}
          handleMigrationCsvKindChange={handleMigrationCsvKindChange}
          isAnalyzingMigrationCsv={isAnalyzingMigrationCsv}
          isAnalyzingDiff={isAnalyzingDiff}
          handleMigrationCsvFileChange={handleMigrationCsvFileChange}
          migrationCsvFile={migrationCsvFile}
          handleAnalyzeMigrationCsv={handleAnalyzeMigrationCsv}
          migrationCsvPreview={migrationCsvPreview}
          pendingBackupPayload={pendingBackupPayload}
          handleBackupFileChange={handleBackupFileChange}
          showImportPasswordInput={showImportPasswordInput}
          backupFile={backupFile}
          handleImportBackup={handleImportBackup}
          isImportingBackup={isImportingBackup}
          importPassword={importPassword}
          setImportPassword={setImportPassword}
          handleDecryptAndAnalyze={handleDecryptAndAnalyze}
          handleCancelRestore={handleCancelRestore}
          backupDiffs={backupDiffs}
          backupDrillReport={backupDrillReport}
          handleRecordBackupDrill={handleRecordBackupDrill}
          handleConfirmRestore={handleConfirmRestore}
        />
      )}

      {activeTab === 'officialAudit' && (
        <OfficialAuditSettingsTab
          canViewOfficialAudit={canViewOfficialAudit}
          dispensingUkeSpecPdfText={dispensingUkeSpecPdfText}
          setDispensingUkeSpecPdfText={setDispensingUkeSpecPdfText}
          setDispensingUkeSpecCompletionGate={setDispensingUkeSpecCompletionGate}
          setDispensingUkeSpecCompletionLabel={setDispensingUkeSpecCompletionLabel}
          dispensingUkeSpecConfirmationText={dispensingUkeSpecConfirmationText}
          setDispensingUkeSpecConfirmationText={setDispensingUkeSpecConfirmationText}
          isFetchingDispensingUkeSpecPdf={isFetchingDispensingUkeSpecPdf}
          handleFetchDispensingUkeSpecPdf={handleFetchDispensingUkeSpecPdf}
          handleReviewDispensingUkeSpecPdfText={handleReviewDispensingUkeSpecPdfText}
          dispensingUkeSpecCompletionGate={dispensingUkeSpecCompletionGate}
          isExportingDispensingUkeSpecReview={isExportingDispensingUkeSpecReview}
          handleExportDispensingUkeSpecReviewCsv={handleExportDispensingUkeSpecReviewCsv}
          isExportingDispensingUkeSpecImplementationPack={isExportingDispensingUkeSpecImplementationPack}
          handleExportDispensingUkeSpecImplementationPack={handleExportDispensingUkeSpecImplementationPack}
          dispensingUkeSpecCompletionLabel={dispensingUkeSpecCompletionLabel}
          isExportingDispensingUkeOfficialAllFieldsGate={isExportingDispensingUkeOfficialAllFieldsGate}
          handleExportDispensingUkeOfficialAllFieldsGateCsv={handleExportDispensingUkeOfficialAllFieldsGateCsv}
        />
      )}

      {activeTab === 'audit' && (
        <AuditSettingsTab
          currentUser={currentUser}
          canViewAuditLogs={canViewAuditLogs}
          canManageFacility={canManageFacility}
          canApproveDailyClosing={canApproveDailyClosing}
          auditLogs={auditLogs}
          auditIntegrity={auditIntegrity}
          isCheckingAuditIntegrity={isCheckingAuditIntegrity}
          auditIntegrityStatus={auditIntegrityStatus}
          auditIntegrityColor={auditIntegrityColor}
          latestAuditHashPreview={latestAuditHashPreview}
          handleExportAuditLogs={handleExportAuditLogs}
          isExportingAuditLogs={isExportingAuditLogs}
          handleExportAnonymousDiagnostic={handleExportAnonymousDiagnostic}
          isExportingAnonymousDiagnostic={isExportingAnonymousDiagnostic}
          handleExportAuditRetentionLedgerCsv={handleExportAuditRetentionLedgerCsv}
          isExportingAuditRetentionLedger={isExportingAuditRetentionLedger}
          auditRetentionReview={auditRetentionReview}
          auditRetentionReviewColor={auditRetentionReviewColor}
          auditRetentionReviewBackground={auditRetentionReviewBackground}
          auditRetentionManagerReviewColor={auditRetentionManagerReviewColor}
          auditRetentionManagerReviewBackground={auditRetentionManagerReviewBackground}
          handleRecordAuditRetentionManagerReview={handleRecordAuditRetentionManagerReview}
          isRecordingAuditRetentionManagerReview={isRecordingAuditRetentionManagerReview}
          auditRetentionManagerReviewButtonLabel={auditRetentionManagerReviewButtonLabel}
          handleExportAuditRetentionMonthlyReviewCsv={handleExportAuditRetentionMonthlyReviewCsv}
          isExportingAuditRetentionReview={isExportingAuditRetentionReview}
          latestRetentionJsonLabel={latestRetentionJsonLabel}
          latestRetentionLedgerLabel={latestRetentionLedgerLabel}
          aiSuggestionFeedbackReview={aiSuggestionFeedbackReview}
          aiSuggestionQualityGateColor={aiSuggestionQualityGateColor}
          aiSuggestionQualityGateBackground={aiSuggestionQualityGateBackground}
          aiSuggestionFeedbackColor={aiSuggestionFeedbackColor}
          aiSuggestionFeedbackBackground={aiSuggestionFeedbackBackground}
          handleExportAiSuggestionFeedbackReviewCsv={handleExportAiSuggestionFeedbackReviewCsv}
          isExportingAiSuggestionFeedbackReview={isExportingAiSuggestionFeedbackReview}
          handleExportAiSuggestionFeedbackBiJson={handleExportAiSuggestionFeedbackBiJson}
          isExportingAiSuggestionFeedbackBi={isExportingAiSuggestionFeedbackBi}
          handleApplyAiQualityRecommendation={handleApplyAiQualityRecommendation}
          isApplyingAiQualityMode={isApplyingAiQualityMode}
          dailyClosingReview={dailyClosingReview}
          latestClosingHashPreview={latestClosingHashPreview}
          dailyClosingReviewColor={dailyClosingReviewColor}
          dailyClosingReviewStatus={dailyClosingReviewStatus}
          handleExportDailyClosingReviewCsv={handleExportDailyClosingReviewCsv}
          isExportingDailyClosingReview={isExportingDailyClosingReview}
          dailyClosingStoreBenchmarkBackground={dailyClosingStoreBenchmarkBackground}
          dailyClosingStoreBenchmarkColor={dailyClosingStoreBenchmarkColor}
          handleExportDailyClosingStoreBenchmarkJson={handleExportDailyClosingStoreBenchmarkJson}
          isExportingDailyClosingStoreBenchmark={isExportingDailyClosingStoreBenchmark}
          recordingDailyClosingKpiActionId={recordingDailyClosingKpiActionId}
          handleRecordDailyClosingKpiAction={handleRecordDailyClosingKpiAction}
          postponingDailyClosingKpiActionId={postponingDailyClosingKpiActionId}
          handlePostponeDailyClosingKpiAction={handlePostponeDailyClosingKpiAction}
          dailyClosingComparisonColor={dailyClosingComparisonColor}
          dailyClosingComparisonBackground={dailyClosingComparisonBackground}
          dailyClosingComparison={dailyClosingComparison}
          filterUser={filterUser}
          setFilterUser={setFilterUser}
          filterAction={filterAction}
          setFilterAction={setFilterAction}
        />
      )}

      {activeTab === 'staff' && (
        <StaffSettingsTab
          currentUser={currentUser}
          canManageStaff={canManageStaff}
          canViewAuditLogs={canViewAuditLogs}
          setIsAddStaffOpen={setIsAddStaffOpen}
          isOnboardingStaffSetup={isOnboardingStaffSetup}
          currentStaffRecord={currentStaffRecord}
          shouldPromptCurrentStaffPasskey={shouldPromptCurrentStaffPasskey}
          handleRegisterPasskey={handleRegisterPasskey}
          isAddStaffOpen={isAddStaffOpen}
          handleAddStaff={handleAddStaff}
          newStaffName={newStaffName}
          setNewStaffName={setNewStaffName}
          newStaffRole={newStaffRole}
          setNewStaffRole={setNewStaffRole}
          newStaffPassword={newStaffPassword}
          setNewStaffPassword={setNewStaffPassword}
          isSubmittingStaff={isSubmittingStaff}
          handleResetRolePermissionPolicy={handleResetRolePermissionPolicy}
          isSavingRolePermissionPolicy={isSavingRolePermissionPolicy}
          handleSaveRolePermissionPolicy={handleSaveRolePermissionPolicy}
          rolePermissionPolicy={rolePermissionPolicy}
          handleRolePermissionToggle={handleRolePermissionToggle}
          handleExportStaffAccessRecoveryMonthlyReviewCsv={handleExportStaffAccessRecoveryMonthlyReviewCsv}
          isExportingStaffAccessRecoveryMonthlyReview={isExportingStaffAccessRecoveryMonthlyReview}
          staffRecoveryChecklist={staffRecoveryChecklist}
          staffRecoveryTargetUserId={staffRecoveryTargetUserId}
          setStaffRecoveryTargetUserId={setStaffRecoveryTargetUserId}
          isHandlingStaffRecovery={isHandlingStaffRecovery}
          staffList={staffList}
          staffRecoveryReason={staffRecoveryReason}
          setStaffRecoveryReason={setStaffRecoveryReason}
          staffRecoveryPassword={staffRecoveryPassword}
          setStaffRecoveryPassword={setStaffRecoveryPassword}
          staffRecoveryNote={staffRecoveryNote}
          setStaffRecoveryNote={setStaffRecoveryNote}
          handleResetStaffRecoveryPassword={handleResetStaffRecoveryPassword}
          staffRecoveryTarget={staffRecoveryTarget}
          handleClearStaffRecoveryPasskey={handleClearStaffRecoveryPasskey}
          handleRecordStaffRetirementCheck={handleRecordStaffRetirementCheck}
          credentialedAdminCount={credentialedAdminCount}
          handleDeleteStaff={handleDeleteStaff}
        />
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
