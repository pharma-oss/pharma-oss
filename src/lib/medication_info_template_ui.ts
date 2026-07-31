import { PatientMedicationInfoTemplate, PatientMedicationInfoTemplateStatus } from '@/db/types';

export type MedicationInfoSourceType = NonNullable<PatientMedicationInfoTemplate['sourceType']>;
export type MedicationInfoTemplateStatusFilter = 'all' | PatientMedicationInfoTemplateStatus;
export type MedicationInfoTemplateReadinessFilter = 'all' | 'ready' | 'missing';

export type MedicationInfoCsvImportSummary = {
  fileName: string;
  importedCount: number;
  readyForApprovalCount: number;
  warningCount: number;
  importedAt: string;
};

export type MedicationInfoTemplateForm = {
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

export const MEDICATION_INFO_TEMPLATE_STATUS_LABELS: Record<PatientMedicationInfoTemplateStatus, string> = {
  draft: '下書き',
  approved: '承認済み',
  needs_review: '要再確認',
  retired: '廃止'
};

export const MEDICATION_INFO_SOURCE_TYPE_LABELS: Record<MedicationInfoSourceType, string> = {
  pmda_insert: 'PMDA 添付文書',
  pmda_patient_guide: 'PMDA 患者向医薬品ガイド',
  pharmacy_authored: '薬局作成',
  licensed: '許諾済み資料',
  other: 'その他'
};

export const MEDICATION_INFO_TEMPLATE_READINESS_LABELS: Record<MedicationInfoTemplateReadinessFilter, string> = {
  all: 'すべて',
  ready: '承認準備OK',
  missing: '不足あり'
};

export const createEmptyMedicationInfoTemplateForm = (): MedicationInfoTemplateForm => ({
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
