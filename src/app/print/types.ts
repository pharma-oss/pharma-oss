import type {
  FacilitySettings,
  PatientMedicationInfoTemplate,
  PrescriptionItem,
  VisitElectronicPrescription,
  VisitElectronicPrescriptionHpkiVerification,
  VisitPharmacyDeviceHandoff
} from '@/db/types';
import type { FeeCode } from '@/lib/calculator';
import type { ClaimItemPricing } from '@/lib/claim_item_pricing';
import type { ElectronicPrescriptionOperationKind } from '@/lib/electronic_prescription';
import type { PrintDocumentType, PrintPreset } from '@/lib/print_presets';

export type {
  FacilitySettings,
  PatientMedicationInfoTemplate,
  PrescriptionItem,
  VisitElectronicPrescription,
  VisitElectronicPrescriptionHpkiVerification,
  VisitPharmacyDeviceHandoff,
  PrintDocumentType,
  PrintPreset
};

export type PrintPrescriptionItem = PrescriptionItem & ClaimItemPricing & {
  drugName: string;
  genericName: string;
  dispensedGenericName: string;
};


export type PatientIdentityMark = {
  label: string;
  className: string;
};

export const PATIENT_IDENTITY_MARKS: readonly PatientIdentityMark[] = [
  { label: 'A', className: 'mark-sakura' },
  { label: 'B', className: 'mark-aoba' },
  { label: 'C', className: 'mark-tsubaki' },
  { label: 'D', className: 'mark-sumire' },
  { label: 'E', className: 'mark-kohaku' },
  { label: 'F', className: 'mark-shizuku' }
] as const;

export const FEE_TOGGLES: { code: FeeCode; label: string }[] = [
  { code: 'base_fee', label: '調剤基本料' },
  { code: 'base_additions', label: '施設基準加算/減算' },
  { code: 'drug_preparation', label: '薬剤調製料' },
  { code: 'dispensing_management', label: '調剤管理料' },
  { code: 'medication_guidance', label: '服薬管理指導料' },
  { code: 'special_management', label: '特薬管' },
  { code: 'ippoka', label: '外来服薬支援料2' },
  { code: 'mixing', label: '自家製剤/計量混合' },
  { code: 'drug_fee', label: '薬剤料' }
];

export const CLAIM_ISSUE_LABELS = {
  error: '要修正',
  warning: '要確認',
  info: '情報'
} as const;

export const AI_SUGGESTION_SEVERITY_LABELS = {
  critical: '要修正',
  warning: '要確認',
  info: '情報'
} as const;

export const ELECTRONIC_PRESCRIPTION_OPERATION_LABELS: Record<ElectronicPrescriptionOperationKind, string> = {
  duplicate_check: '重複投薬等チェック',
  reception_cancel: '受付取消',
  dispensing_result_register: '調剤結果登録',
  dispensing_result_search: '調剤結果ID検索',
  dispensing_result_cancel: '調剤結果取消',
  dispensing_result_change: '調剤結果変更'
};

export const ELECTRONIC_PRESCRIPTION_RECEPTION_STATUS_LABELS: Record<VisitElectronicPrescription['receptionStatus'], string> = {
  accepted: '受付済み',
  cancel_pending: '取消確認中',
  cancelled: '取消済み'
};

export const ELECTRONIC_PRESCRIPTION_DISPENSING_STATUS_LABELS: Record<VisitElectronicPrescription['dispensingResultStatus'], string> = {
  pending: '未登録',
  submitted: '送信済み',
  registered: '登録済み',
  failed: '登録失敗',
  cancelled: '取消済み'
};

export const ELECTRONIC_PRESCRIPTION_DOCUMENT_KIND_LABELS: Record<VisitElectronicPrescription['documentKind'], string> = {
  electronic_prescription: '電子処方箋',
  prescription_information: '処方箋情報提供ファイル'
};

export const ELECTRONIC_PRESCRIPTION_SIGNATURE_STATUS_LABELS: Record<VisitElectronicPrescription['signatureStatus'], string> = {
  valid: '署名確認済み',
  invalid: '署名不正',
  not_checked: '署名未確認',
  not_applicable: '対象外'
};

export const ELECTRONIC_PRESCRIPTION_DUPLICATE_CHECK_STATUS_LABELS: Record<VisitElectronicPrescription['duplicateCheckStatus'], string> = {
  not_checked: '未実施',
  passed: '問題なし',
  warning: '確認あり',
  blocked: '停止'
};

export const ELECTRONIC_PRESCRIPTION_FILE_SIGNATURE_STATUS_LABELS: Record<NonNullable<VisitElectronicPrescription['dispensingInformationFile']>['signatureStatus'], string> = {
  valid: '電子署名検証済み',
  invalid: '電子署名不正',
  present: '電子署名あり',
  unsigned: '電子署名なし',
  not_checked: '未確認'
};

export const ELECTRONIC_PRESCRIPTION_HPKI_STATUS_LABELS: Record<VisitElectronicPrescriptionHpkiVerification['status'], string> = {
  valid: 'HPKI確認済み',
  invalid: 'HPKI不正',
  expired: 'HPKI期限切れ',
  revoked: 'HPKI失効',
  not_checked: 'HPKI未確認',
  not_applicable: 'HPKI対象外'
};

export const PHARMACY_DEVICE_HANDOFF_STATUS_LABELS: Record<VisitPharmacyDeviceHandoff['status'], string> = {
  accepted: '受付済み',
  duplicate: '送信済み',
  cancelled: '取消済み'
};

export type PharmacyInfo = {
  name: string;
  code: string;
  postalCode: string;
  address: string;
  phone: string;
  registrationNumber: string;
  pharmacistName: string;
};

export type PendingReceiptRemarkSave = {
  rpNumber: number;
  code: string;
  name: string;
  type: string;
  recordedAt: string;
  commentText: string;
};
