import type { PatientMedicationInfoTemplate, PatientMedicationInfoTemplateStatus } from '../db/types.ts';

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

export const trimOrUndefined = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export const makeMedicationInfoTemplateId = (drugCode: string, date = new Date()): string => {
  const normalizedDrugCode = drugCode.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'drug';
  return `pmit_${normalizedDrugCode}_${date.getTime()}`;
};

export const medicationInfoTemplateToForm = (template: PatientMedicationInfoTemplate): MedicationInfoTemplateForm => ({
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

export const sortMedicationInfoTemplates = (templates: PatientMedicationInfoTemplate[]): PatientMedicationInfoTemplate[] => (
  [...templates].sort((a, b) => {
    const aTimestamp = a.updatedAt || a.approvedAt || a.createdAt || '';
    const bTimestamp = b.updatedAt || b.approvedAt || b.createdAt || '';
    if (aTimestamp !== bTimestamp) {
      return bTimestamp.localeCompare(aTimestamp);
    }
    return a.drugCode.localeCompare(b.drugCode);
  })
);

