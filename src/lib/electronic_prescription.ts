export type ElectronicPrescriptionFetchKeyKind = 'exchange_number' | 'prescription_id';

export type ElectronicPrescriptionFetchMode = 'off' | 'connector' | 'demo';

export type ElectronicPrescriptionConnectorKind = 'qualification_terminal' | 'web_api';

export type ElectronicPrescriptionConnectorCapability =
  | 'prescription_fetch'
  | 'signature_verification'
  | 'hpki_verification'
  | 'duplicate_check'
  | 'reception_cancel'
  | 'dispensing_result'
  | 'dispensing_result_search'
  | 'dispensing_result_cancel'
  | 'dispensing_result_change'
  | 'refill_prescription'
  | 'paper_prescription';

export type ElectronicPrescriptionDocumentKind =
  | 'electronic_prescription'
  | 'prescription_information';

export type ElectronicPrescriptionSignatureStatus =
  | 'valid'
  | 'invalid'
  | 'not_checked'
  | 'not_applicable';

export type ElectronicPrescriptionFetchStatus =
  | 'success'
  | 'unconfigured'
  | 'not_found'
  | 'cancelled'
  | 'changed'
  | 'patient_mismatch'
  | 'invalid_payload'
  | 'error';

export type ElectronicPrescriptionDuplicateCheckStatus =
  | 'not_checked'
  | 'passed'
  | 'warning'
  | 'blocked';

export type ElectronicPrescriptionDispensingInformationSignatureStatus =
  | 'valid'
  | 'invalid'
  | 'present'
  | 'unsigned'
  | 'not_checked';

export type ElectronicPrescriptionHpkiVerificationStatus =
  | 'valid'
  | 'invalid'
  | 'expired'
  | 'revoked'
  | 'not_checked'
  | 'not_applicable';

export type ElectronicPrescriptionHpkiSignerRole =
  | 'doctor'
  | 'pharmacist'
  | 'unknown';

export interface ElectronicPrescriptionHpkiVerification {
  status: ElectronicPrescriptionHpkiVerificationStatus;
  signerRole?: ElectronicPrescriptionHpkiSignerRole;
  certificateSerialHash?: string;
  certificateIssuerHash?: string;
  certificateNotAfter?: string;
  revocationCheckedAt?: string;
  policyOid?: string;
}

export type ElectronicPrescriptionDrugCodeStatus =
  | 'active'
  | 'abolished'
  | 'unknown';

export type ElectronicPrescriptionDrugNameVerificationStatus =
  | 'matched'
  | 'mismatch'
  | 'not_checked';

export interface ElectronicPrescriptionUnitConversion {
  conversionFactor: string;
  masterUnitCode?: string;
  masterUnitText?: string;
  prescribedAmount: string;
  prescribedUnitCode?: string;
  prescribedUnitText: string;
}

export interface ElectronicPrescriptionLaboratoryResult {
  testName: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  measuredAt?: string;
  comment?: string;
}

export interface ElectronicPrescriptionNarcoticAdministration {
  isNarcoticPrescription: boolean;
  recordPresent: boolean;
  displayText?: string;
}

export interface ElectronicPrescriptionSupplementaryInformation {
  prescriptionComments: string[];
  laboratoryResults: ElectronicPrescriptionLaboratoryResult[];
  narcoticAdministration?: ElectronicPrescriptionNarcoticAdministration;
}

export interface ElectronicPrescriptionFetchInput {
  fetchKey: string;
  keyKind?: ElectronicPrescriptionFetchKeyKind;
  insuredNumber?: string;
  patientBirthDate?: string;
}

export interface ElectronicPrescriptionPatient {
  name?: string;
  kana?: string;
  birthDate?: string;
  insuranceNumber?: string;
  burdenRatio?: number;
}

export interface ElectronicPrescriptionProvider {
  institutionCode?: string;
  institutionName?: string;
  departmentName?: string;
  doctorName?: string;
}

export interface ElectronicPrescriptionItem {
  rpNumber?: number;
  drugCode?: string;
  receiptCode?: string;
  yjCode?: string;
  drugCodeStatus?: ElectronicPrescriptionDrugCodeStatus;
  drugCodeAbolishedAt?: string;
  drugName: string;
  sourceDrugName?: string;
  masterDrugName?: string;
  drugNameVerificationStatus?: ElectronicPrescriptionDrugNameVerificationStatus;
  drugNameVerificationCheckedAt?: string;
  amount: string;
  unitCode?: string;
  unitText?: string;
  unitConversion?: ElectronicPrescriptionUnitConversion;
  usageCode?: string;
  usage: string;
  usageFallbackText?: string;
  usageSupplementText?: string;
  days: string;
  rpComment?: string;
  selectionReason?: 'medical_necessity' | 'patient_preference';
}

export interface ElectronicPrescriptionPayload {
  prescriptionId?: string;
  exchangeNumber?: string;
  issuedAt?: string;
  prescriptionDate?: string;
  validUntil?: string;
  documentKind?: ElectronicPrescriptionDocumentKind;
  signatureVerification?: {
    status: ElectronicPrescriptionSignatureStatus;
    verifiedAt?: string;
    signerName?: string;
    hpkiVerification?: ElectronicPrescriptionHpkiVerification;
  };
  refill?: {
    totalCount: number;
    currentCount: number;
    previousDispensingDate?: string;
    nextDispensingDate?: string;
  };
  patient: ElectronicPrescriptionPatient;
  provider: ElectronicPrescriptionProvider;
  items: ElectronicPrescriptionItem[];
  supplementaryInformation?: ElectronicPrescriptionSupplementaryInformation;
}

export interface ElectronicPrescriptionDuplicateCheck {
  status: ElectronicPrescriptionDuplicateCheckStatus;
  messages: string[];
}

export interface ElectronicPrescriptionFetchResult {
  status: ElectronicPrescriptionFetchStatus;
  mode: ElectronicPrescriptionFetchMode;
  message: string;
  prescription?: ElectronicPrescriptionPayload;
  duplicateCheck?: ElectronicPrescriptionDuplicateCheck;
  warnings: string[];
  integrityHash?: string;
}

export type ElectronicPrescriptionApplyStatus = 'apply' | 'review' | 'blocked';

export type ElectronicPrescriptionOperationKind =
  | 'duplicate_check'
  | 'reception_cancel'
  | 'dispensing_result_register'
  | 'dispensing_result_search'
  | 'dispensing_result_cancel'
  | 'dispensing_result_change';

export type ElectronicPrescriptionOperationStatus =
  | 'success'
  | 'not_found'
  | 'unconfigured'
  | 'invalid_request'
  | 'rejected'
  | 'error';

export interface ElectronicPrescriptionOperationInput {
  operation?: string;
  prescriptionId?: string;
  prescriptionIds?: string[];
  dispensingResultId?: string;
  integrityHash?: string;
  reason?: string;
  signatureRequirement?: ElectronicPrescriptionDispensingSignatureRequirement;
  payload?: unknown;
}

export interface ElectronicPrescriptionDispensingSignatureRequirement {
  hpkiSignatureRequired: boolean;
  expectedSignerRole: 'pharmacist';
}

export interface ElectronicPrescriptionDispensingResultItem {
  itemId?: string;
  rpNumber: number;
  prescribedDrugCode?: string;
  dispensedDrugCode?: string;
  yjCode?: string;
  prescribedDrugCodeStatus?: ElectronicPrescriptionDrugCodeStatus;
  prescribedDrugCodeAbolishedAt?: string;
  sourceDrugName?: string;
  masterDrugName?: string;
  drugNameVerificationStatus?: ElectronicPrescriptionDrugNameVerificationStatus;
  drugNameVerificationCheckedAt?: string;
  amount: string;
  unitCode?: string;
  unitText?: string;
  unitConversion?: ElectronicPrescriptionUnitConversion;
  usageCode?: string;
  usage: string;
  usageFallbackText?: string;
  usageSupplementText?: string;
  days: string;
  changeReason?: string;
  isIppoka?: boolean;
  isCrushed?: boolean;
  isDiagnosticTest?: boolean;
}

export interface ElectronicPrescriptionDispensingResultPayload {
  type: 'yakureki-electronic-prescription-dispensing-result';
  schemaVersion: 1;
  prescriptionDate?: string;
  dispensingDate: string;
  totalPoints?: number;
  signatureRequirement?: ElectronicPrescriptionDispensingSignatureRequirement;
  items: ElectronicPrescriptionDispensingResultItem[];
}

export interface ValidElectronicPrescriptionOperationInput {
  operation: ElectronicPrescriptionOperationKind;
  prescriptionId: string;
  prescriptionIds?: string[];
  dispensingResultId?: string;
  integrityHash?: string;
  reason?: string;
  signatureRequirement?: ElectronicPrescriptionDispensingSignatureRequirement;
  payload?: ElectronicPrescriptionDispensingResultPayload;
}

export interface ElectronicPrescriptionLifecycleState {
  receptionStatus: 'accepted' | 'cancel_pending' | 'cancelled';
  dispensingResultStatus: 'pending' | 'submitted' | 'registered' | 'failed' | 'cancelled';
  dispensingResultId?: string;
  dispensingResultEverRegistered?: boolean;
}

export interface ElectronicPrescriptionLifecycleOperationDecision {
  allowed: boolean;
  message?: string;
}

export interface ElectronicPrescriptionOperationResult {
  status: ElectronicPrescriptionOperationStatus;
  mode: ElectronicPrescriptionFetchMode;
  operation?: ElectronicPrescriptionOperationKind;
  message: string;
  warnings: string[];
  operationId?: string;
  dispensingResultId?: string;
  registeredAt?: string;
  dispensingInformationFile?: {
    signatureStatus: ElectronicPrescriptionDispensingInformationSignatureStatus;
    signedAt?: string;
    fileHash?: string;
    hpkiVerification?: ElectronicPrescriptionHpkiVerification;
  };
  duplicateCheck?: ElectronicPrescriptionDuplicateCheck;
}

export interface ElectronicPrescriptionApplyDecision {
  status: ElectronicPrescriptionApplyStatus;
  canApply: boolean;
  statusLabel: string;
  message: string;
  requiredActions: string[];
}

export interface ElectronicPrescriptionPayloadIssue {
  field: string;
  message: string;
}

const MAX_FETCH_KEY_LENGTH = 80;
const PRESCRIPTION_ID_PATTERN = /^[A-Za-z0-9-]+$/;
const EXCHANGE_NUMBER_PATTERN = /^\d{6,16}$/;
const INSURED_NUMBER_PATTERN = /^[A-Z0-9.・･·\-‐‑‒–—―ー−]{1,40}$/u;
const INSURED_NUMBER_SEPARATOR_PATTERN = /[.・･·\-‐‑‒–—―ー−]/gu;
const INTEGRITY_HASH_PATTERN = /^[a-f0-9]{64}$/;
const INVALID_HPKI_POLICY_OID_MESSAGE = 'HPKI証明書のポリシーOID形式が不正です。';
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const ELECTRONIC_PRESCRIPTION_OPERATIONS: ElectronicPrescriptionOperationKind[] = [
  'duplicate_check',
  'reception_cancel',
  'dispensing_result_register',
  'dispensing_result_search',
  'dispensing_result_cancel',
  'dispensing_result_change'
];
const ELECTRONIC_PRESCRIPTION_OPERATION_LABELS: Record<ElectronicPrescriptionOperationKind, string> = {
  duplicate_check: '重複投薬等チェック',
  reception_cancel: '受付取消',
  dispensing_result_register: '調剤結果登録',
  dispensing_result_search: '調剤結果ID検索',
  dispensing_result_cancel: '調剤結果取消',
  dispensing_result_change: '調剤結果変更'
};
export const REQUIRED_ELECTRONIC_PRESCRIPTION_CAPABILITIES: ElectronicPrescriptionConnectorCapability[] = [
  'prescription_fetch',
  'signature_verification',
  'hpki_verification',
  'duplicate_check',
  'reception_cancel',
  'dispensing_result',
  'dispensing_result_search',
  'dispensing_result_cancel',
  'dispensing_result_change',
  'refill_prescription',
  'paper_prescription'
];
const OPERATION_REQUIRED_CAPABILITIES: Record<ElectronicPrescriptionOperationKind, ElectronicPrescriptionConnectorCapability[]> = {
  duplicate_check: ['duplicate_check'],
  reception_cancel: ['reception_cancel'],
  dispensing_result_register: ['dispensing_result'],
  dispensing_result_search: ['dispensing_result_search'],
  dispensing_result_cancel: ['dispensing_result_cancel'],
  dispensing_result_change: ['dispensing_result_change']
};

export function normalizeElectronicPrescriptionConnectorKind(value: unknown): ElectronicPrescriptionConnectorKind | null {
  const kind = String(value ?? '').trim().toLowerCase();
  return kind === 'qualification_terminal' || kind === 'web_api' ? kind : null;
}

export function normalizeElectronicPrescriptionConnectorCapabilities(
  value: string | string[] | undefined
): ElectronicPrescriptionConnectorCapability[] {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return Array.from(new Set(values
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is ElectronicPrescriptionConnectorCapability => (
      REQUIRED_ELECTRONIC_PRESCRIPTION_CAPABILITIES.includes(item as ElectronicPrescriptionConnectorCapability)
    ))));
}

export function findMissingElectronicPrescriptionConnectorCapabilities(
  value: string | string[] | undefined,
  required: ElectronicPrescriptionConnectorCapability[] = REQUIRED_ELECTRONIC_PRESCRIPTION_CAPABILITIES
): ElectronicPrescriptionConnectorCapability[] {
  const configured = normalizeElectronicPrescriptionConnectorCapabilities(value);
  return required.filter((capability) => !configured.includes(capability));
}

export function getRequiredElectronicPrescriptionCapabilitiesForOperation(
  operation: ElectronicPrescriptionOperationKind
): ElectronicPrescriptionConnectorCapability[] {
  return OPERATION_REQUIRED_CAPABILITIES[operation];
}

export function hasElectronicPrescriptionDispensingHistory(
  state: ElectronicPrescriptionLifecycleState
): boolean {
  return state.dispensingResultEverRegistered === true
    || state.dispensingResultStatus === 'registered'
    || !!state.dispensingResultId;
}

export function validateElectronicPrescriptionLifecycleOperation(
  operation: ElectronicPrescriptionOperationKind,
  state: ElectronicPrescriptionLifecycleState
): ElectronicPrescriptionLifecycleOperationDecision {
  if (state.receptionStatus === 'cancelled') {
    return { allowed: false, message: '受付取消済みの電子処方箋は操作できません。' };
  }
  const hasDispensingHistory = hasElectronicPrescriptionDispensingHistory(state);
  if (operation === 'reception_cancel' && hasDispensingHistory) {
    return {
      allowed: false,
      message: '一度調剤済みとなった処方箋は、調剤結果取消後も受付取消できません。'
    };
  }
  if (operation === 'dispensing_result_change' || operation === 'dispensing_result_cancel') {
    if (state.dispensingResultStatus !== 'registered' || !state.dispensingResultId) {
      return { allowed: false, message: '登録済みの調剤結果IDがないため、この操作は実行できません。' };
    }
  }
  if (operation === 'dispensing_result_register' && state.dispensingResultStatus === 'submitted') {
    return { allowed: false, message: '調剤結果を送信済みです。結果ID照会で登録状況を確認してください。' };
  }
  if (operation === 'dispensing_result_register' && state.dispensingResultStatus === 'registered') {
    return { allowed: false, message: '調剤結果登録済みです。変更機能を使用してください。' };
  }
  return { allowed: true };
}

export function requiresElectronicPrescriptionDispensingHpkiSignature(
  documentKinds: ElectronicPrescriptionDocumentKind[]
): boolean {
  return documentKinds.includes('electronic_prescription');
}

export function normalizeElectronicPrescriptionFetchKey(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/[\s　]/g, '')
    .toUpperCase()
    .slice(0, MAX_FETCH_KEY_LENGTH);
}

export function inferElectronicPrescriptionFetchKeyKind(
  fetchKey: string
): ElectronicPrescriptionFetchKeyKind {
  return /^\d{6,16}$/.test(fetchKey) ? 'exchange_number' : 'prescription_id';
}

export function normalizeElectronicPrescriptionInsuredNumber(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/[\s　]/g, '')
    .toUpperCase()
    .slice(0, 40);
}

export function canonicalizeElectronicPrescriptionInsuredNumber(value: string): string {
  return normalizeElectronicPrescriptionInsuredNumber(value)
    .replace(INSURED_NUMBER_SEPARATOR_PATTERN, '');
}

export function normalizeElectronicPrescriptionOperationKind(
  value: unknown
): ElectronicPrescriptionOperationKind | null {
  const operation = String(value ?? '').trim().toLowerCase();
  return ELECTRONIC_PRESCRIPTION_OPERATIONS.includes(operation as ElectronicPrescriptionOperationKind)
    ? operation as ElectronicPrescriptionOperationKind
    : null;
}

export function getElectronicPrescriptionOperationLabel(
  operation: ElectronicPrescriptionOperationKind
): string {
  return ELECTRONIC_PRESCRIPTION_OPERATION_LABELS[operation];
}

export function validateElectronicPrescriptionFetchInput(
  input: ElectronicPrescriptionFetchInput
): {
  ok: true;
  fetchKey: string;
  keyKind: ElectronicPrescriptionFetchKeyKind;
  insuredNumber?: string;
} | { ok: false; message: string } {
  const fetchKey = normalizeElectronicPrescriptionFetchKey(input.fetchKey || '');
  if (!fetchKey) {
    return { ok: false, message: '電子処方箋IDまたは引換番号を入力してください。' };
  }
  const keyKind = input.keyKind || inferElectronicPrescriptionFetchKeyKind(fetchKey);
  if (keyKind === 'exchange_number') {
    if (!EXCHANGE_NUMBER_PATTERN.test(fetchKey)) {
      return { ok: false, message: '引換番号は半角数字6桁から16桁で入力してください。' };
    }
    const insuredNumber = normalizeElectronicPrescriptionInsuredNumber(input.insuredNumber || '');
    if (!insuredNumber) {
      return { ok: false, message: '引換番号で取得する場合は被保険者番号を入力してください。' };
    }
    if (!INSURED_NUMBER_PATTERN.test(insuredNumber)) {
      return { ok: false, message: '被保険者番号は英数字と一般的な区切り記号で入力してください。' };
    }
    return {
      ok: true,
      fetchKey,
      keyKind,
      insuredNumber
    };
  }
  if (!PRESCRIPTION_ID_PATTERN.test(fetchKey)) {
    return { ok: false, message: '電子処方箋IDは英数字とハイフンで入力してください。' };
  }
  if (fetchKey.length < 4) {
    return { ok: false, message: '電子処方箋IDが短すぎます。' };
  }
  const insuredNumber = normalizeElectronicPrescriptionInsuredNumber(input.insuredNumber || '');
  if (insuredNumber && !INSURED_NUMBER_PATTERN.test(insuredNumber)) {
    return { ok: false, message: '被保険者番号は英数字と一般的な区切り記号で入力してください。' };
  }
  return {
    ok: true,
    fetchKey,
    keyKind,
    ...(insuredNumber ? { insuredNumber } : {})
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function limitedString(value: unknown, maxLength: number): string {
  return String(value ?? '').normalize('NFKC').trim().slice(0, maxLength);
}

export function normalizeElectronicPrescriptionUnitConversion(
  value: unknown
): ElectronicPrescriptionUnitConversion | undefined {
  if (!isPlainRecord(value)) return undefined;
  return {
    conversionFactor: limitedString(value.conversionFactor, 50),
    ...(limitedString(value.masterUnitCode, 50) ? { masterUnitCode: limitedString(value.masterUnitCode, 50) } : {}),
    ...(limitedString(value.masterUnitText, 50) ? { masterUnitText: limitedString(value.masterUnitText, 50) } : {}),
    prescribedAmount: limitedString(value.prescribedAmount, 80),
    ...(limitedString(value.prescribedUnitCode, 50) ? { prescribedUnitCode: limitedString(value.prescribedUnitCode, 50) } : {}),
    prescribedUnitText: limitedString(value.prescribedUnitText, 50)
  };
}

export function normalizeElectronicPrescriptionSupplementaryInformation(
  value: unknown
): ElectronicPrescriptionSupplementaryInformation | undefined {
  if (!isPlainRecord(value)) return undefined;
  const prescriptionComments = Array.isArray(value.prescriptionComments)
    ? value.prescriptionComments.map((comment) => limitedString(comment, 1000)).filter(Boolean).slice(0, 50)
    : [];
  const laboratoryResults = Array.isArray(value.laboratoryResults)
    ? value.laboratoryResults.flatMap((entry) => {
        if (!isPlainRecord(entry)) return [];
        return [{
          testName: limitedString(entry.testName, 200),
          value: limitedString(entry.value, 200),
          ...(limitedString(entry.unit, 50) ? { unit: limitedString(entry.unit, 50) } : {}),
          ...(limitedString(entry.referenceRange, 200) ? { referenceRange: limitedString(entry.referenceRange, 200) } : {}),
          ...(limitedString(entry.measuredAt, 50) ? { measuredAt: limitedString(entry.measuredAt, 50) } : {}),
          ...(limitedString(entry.comment, 500) ? { comment: limitedString(entry.comment, 500) } : {})
        }];
      }).slice(0, 100)
    : [];
  const rawNarcoticAdministration = isPlainRecord(value.narcoticAdministration)
    ? value.narcoticAdministration
    : undefined;
  const narcoticAdministration = rawNarcoticAdministration
    ? {
        isNarcoticPrescription: rawNarcoticAdministration.isNarcoticPrescription === true,
        recordPresent: rawNarcoticAdministration.recordPresent === true,
        ...(limitedString(rawNarcoticAdministration.displayText, 1000)
          ? { displayText: limitedString(rawNarcoticAdministration.displayText, 1000) }
          : {})
      }
    : undefined;
  if (prescriptionComments.length === 0 && laboratoryResults.length === 0 && !narcoticAdministration) return undefined;
  return {
    prescriptionComments,
    laboratoryResults,
    ...(narcoticAdministration ? { narcoticAdministration } : {})
  };
}

function normalizeDrugCodeStatus(value: unknown): ElectronicPrescriptionDrugCodeStatus | undefined {
  const status = String(value ?? '').normalize('NFKC').trim().toLowerCase();
  if (['active', 'valid', 'current', 'available'].includes(status)) return 'active';
  if (['abolished', 'expired', 'deprecated', 'discontinued', 'inactive'].includes(status)) return 'abolished';
  if (['unknown', 'not_checked', 'unchecked'].includes(status)) return 'unknown';
  return undefined;
}

function normalizeDrugNameVerificationStatus(value: unknown): ElectronicPrescriptionDrugNameVerificationStatus | undefined {
  const status = String(value ?? '').normalize('NFKC').trim().toLowerCase();
  if (['matched', 'match', 'verified', 'verified_match'].includes(status)) return 'matched';
  if (['mismatch', 'different', 'unmatched', 'not_matched'].includes(status)) return 'mismatch';
  if (['not_checked', 'unchecked', 'unknown'].includes(status)) return 'not_checked';
  return undefined;
}

function comparableDrugName(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').trim();
}

function normalizeHpkiVerificationStatus(value: unknown): ElectronicPrescriptionHpkiVerificationStatus | undefined {
  const status = String(value ?? '').normalize('NFKC').trim().toLowerCase();
  if (['valid', 'verified', 'verification_success'].includes(status)) return 'valid';
  if (['invalid', 'failed', 'verification_failed'].includes(status)) return 'invalid';
  if (['expired', 'certificate_expired'].includes(status)) return 'expired';
  if (['revoked', 'certificate_revoked'].includes(status)) return 'revoked';
  if (['not_checked', 'unchecked', 'unknown'].includes(status)) return 'not_checked';
  if (['not_applicable', 'n/a', 'none'].includes(status)) return 'not_applicable';
  return undefined;
}

function isValidObjectIdentifier(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!/^\d+(?:\.\d+)+$/.test(text)) return false;
  const arcs = text.split('.');
  if (arcs.some((arc) => arc.length > 1 && arc.startsWith('0'))) return false;
  const first = Number(arcs[0]);
  const second = Number(arcs[1]);
  if (!Number.isInteger(first) || first < 0 || first > 2) return false;
  if (!Number.isInteger(second) || second < 0) return false;
  if ((first === 0 || first === 1) && second > 39) return false;
  return true;
}

function parseIsoTimestamp(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!ISO_TIMESTAMP_PATTERN.test(text)) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseHpkiReferenceInstant(value: unknown): Date | undefined {
  const iso = parseIsoTimestamp(value);
  if (iso) return iso;
  if (typeof value !== 'string') return undefined;
  const dateOnly = normalizeDateOnly(value.slice(0, 10));
  return dateOnly ? new Date(`${dateOnly}T00:00:00.000Z`) : undefined;
}

function validateHpkiVerification(
  value: ElectronicPrescriptionHpkiVerification | undefined,
  expectedRole: ElectronicPrescriptionHpkiSignerRole,
  field: string,
  referenceDate?: string
): ElectronicPrescriptionPayloadIssue[] {
  const issues: ElectronicPrescriptionPayloadIssue[] = [];
  if (!value) {
    return [{ field, message: 'HPKI証明書の検証結果がありません。' }];
  }
  if (normalizeHpkiVerificationStatus(value.status) !== 'valid') {
    issues.push({ field: `${field}.status`, message: 'HPKI証明書の検証が有効ではありません。' });
  }
  if (!value.signerRole) {
    issues.push({ field: `${field}.signerRole`, message: 'HPKI証明書の資格種別がありません。' });
  } else if (value.signerRole !== expectedRole) {
    issues.push({ field: `${field}.signerRole`, message: 'HPKI証明書の資格種別が想定と一致しません。' });
  }
  for (const [key, hash] of Object.entries({
    certificateSerialHash: value.certificateSerialHash,
    certificateIssuerHash: value.certificateIssuerHash
  })) {
    if (!hash) {
      issues.push({ field: `${field}.${key}`, message: 'HPKI証明書の照合値がありません。' });
    } else if (!INTEGRITY_HASH_PATTERN.test(hash)) {
      issues.push({ field: `${field}.${key}`, message: 'HPKI証明書の照合値はSHA-256ハッシュで記録してください。' });
    }
  }
  const certificateNotAfter = normalizeDateOnly(value.certificateNotAfter);
  if (!value.certificateNotAfter) {
    issues.push({ field: `${field}.certificateNotAfter`, message: 'HPKI証明書の有効期限がありません。' });
  } else if (!certificateNotAfter) {
    issues.push({ field: `${field}.certificateNotAfter`, message: 'HPKI証明書の有効期限形式が不正です。' });
  } else {
    const normalizedReferenceDate = normalizeDateOnly(referenceDate?.slice(0, 10));
    if (normalizedReferenceDate && certificateNotAfter < normalizedReferenceDate) {
      issues.push({ field: `${field}.certificateNotAfter`, message: 'HPKI証明書は署名日時点で有効期限切れです。' });
    }
  }
  if (!value.revocationCheckedAt) {
    issues.push({ field: `${field}.revocationCheckedAt`, message: 'HPKI証明書の失効確認日時がありません。' });
  } else {
    const revocationCheckedAt = parseIsoTimestamp(value.revocationCheckedAt);
    if (!revocationCheckedAt) {
      issues.push({ field: `${field}.revocationCheckedAt`, message: 'HPKI証明書の失効確認日時はISO日時で記録してください。' });
    } else {
      const referenceInstant = parseHpkiReferenceInstant(referenceDate);
      if (referenceInstant && revocationCheckedAt.getTime() < referenceInstant.getTime()) {
        issues.push({ field: `${field}.revocationCheckedAt`, message: 'HPKI証明書の失効確認日時が署名検証日時より前です。' });
      }
    }
  }
  if (value.policyOid && !isValidObjectIdentifier(value.policyOid)) {
    issues.push({ field: `${field}.policyOid`, message: INVALID_HPKI_POLICY_OID_MESSAGE });
  }
  return issues;
}

function amountLooksUnitless(value: string): boolean {
  return /^[+-]?\d+(?:\.\d+)?$/.test(value.normalize('NFKC').trim());
}

const FORBIDDEN_DISPENSING_PAYLOAD_KEYS = new Set([
  'patient',
  'patientdata',
  'patientid',
  'patientname',
  'patientkana',
  'birthdate',
  'insurance',
  'insurancenumber',
  'insurednumber',
  'provider',
  'institution',
  'institutionname',
  'doctor',
  'doctorname',
  'endpoint',
  'url',
  'authorization',
  'bearertoken',
  'requestbody',
  'responsebody',
  'rawrequest',
  'rawresponse'
]);

function containsForbiddenDispensingPayloadKey(value: unknown, depth = 0): boolean {
  if (depth > 4 || value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some((child) => containsForbiddenDispensingPayloadKey(child, depth + 1));
  if (!isPlainRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => (
    FORBIDDEN_DISPENSING_PAYLOAD_KEYS.has(key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
    || containsForbiddenDispensingPayloadKey(child, depth + 1)
  ));
}

export function normalizeElectronicPrescriptionDispensingResultPayload(
  value: unknown
): { ok: true; payload: ElectronicPrescriptionDispensingResultPayload } | { ok: false; message: string } {
  if (!isPlainRecord(value)) {
    return { ok: false, message: '調剤結果の送信内容がJSONオブジェクトではありません。' };
  }
  if (containsForbiddenDispensingPayloadKey(value)) {
    return { ok: false, message: '調剤結果の送信内容に患者情報、接続情報、または通信本文らしい項目が含まれています。' };
  }

  const dispensingDate = normalizeDateOnly(limitedString(value.dispensingDate, 50));
  if (!dispensingDate) {
    return { ok: false, message: '調剤結果の調剤日がありません、または日付形式が不正です。' };
  }
  const prescriptionDate = normalizeDateOnly(limitedString(value.prescriptionDate, 50));
  const totalPoints = Number(value.totalPoints);
  if (value.totalPoints !== undefined && (!Number.isFinite(totalPoints) || totalPoints < 0)) {
    return { ok: false, message: '調剤結果の点数が不正です。' };
  }
  const signatureRequirement = normalizeElectronicPrescriptionDispensingSignatureRequirement(
    value.signatureRequirement
  );
  if (!Array.isArray(value.items) || value.items.length === 0) {
    return { ok: false, message: '調剤結果の薬剤明細がありません。' };
  }

  const items: ElectronicPrescriptionDispensingResultItem[] = [];
  for (let index = 0; index < value.items.length; index++) {
    const item = value.items[index];
    if (!isPlainRecord(item) || containsForbiddenDispensingPayloadKey(item)) {
      return { ok: false, message: `調剤結果の薬剤明細${index + 1}が不正です。` };
    }
    const rpNumber = Number(item.rpNumber || index + 1);
    if (!Number.isInteger(rpNumber) || rpNumber <= 0) {
      return { ok: false, message: `調剤結果の薬剤明細${index + 1}のRP番号が不正です。` };
    }
    const prescribedDrugCode = limitedString(item.prescribedDrugCode, 50);
    const dispensedDrugCode = limitedString(item.dispensedDrugCode, 50);
    const yjCode = limitedString(item.yjCode, 50);
    const prescribedDrugCodeStatus = normalizeDrugCodeStatus(item.prescribedDrugCodeStatus || item.drugCodeStatus);
    const prescribedDrugCodeAbolishedAt = normalizeDateOnly(limitedString(
      item.prescribedDrugCodeAbolishedAt || item.drugCodeAbolishedAt,
      50
    ));
    const sourceDrugName = limitedString(item.sourceDrugName, 200);
    const masterDrugName = limitedString(item.masterDrugName, 200);
    const drugNameVerificationStatus = normalizeDrugNameVerificationStatus(item.drugNameVerificationStatus);
    const drugNameVerificationCheckedAt = limitedString(item.drugNameVerificationCheckedAt, 50);
    const amount = limitedString(item.amount, 80);
    const unitCode = limitedString(item.unitCode, 50);
    const unitText = limitedString(item.unitText || item.unit, 50);
    const unitConversion = normalizeElectronicPrescriptionUnitConversion(item.unitConversion);
    const usageCode = limitedString(item.usageCode, 50);
    const usageFallbackText = limitedString(item.usageFallbackText, 200);
    const usageSupplementText = limitedString(item.usageSupplementText, 500);
    const usage = limitedString(item.usage, 200);
    const usageText = usage || usageFallbackText;
    const days = limitedString(item.days, 50);
    if (!prescribedDrugCode && !dispensedDrugCode && !yjCode) {
      return { ok: false, message: `調剤結果の薬剤明細${index + 1}の医薬品コードがありません。` };
    }
    if (
      prescribedDrugCodeStatus === 'abolished'
      && (!prescribedDrugCodeAbolishedAt || !prescriptionDate || prescribedDrugCodeAbolishedAt <= prescriptionDate)
    ) {
      return { ok: false, message: `調剤結果の薬剤明細${index + 1}の医薬品コードは処方日時点で廃止済みです。` };
    }
    if (!drugNameVerificationStatus) {
      return { ok: false, message: `調剤結果の薬剤明細${index + 1}の取得薬品名と薬局マスタ表示名の照合結果がありません。` };
    }
    if (drugNameVerificationStatus !== 'matched') {
      return { ok: false, message: `調剤結果の薬剤明細${index + 1}の取得薬品名と薬局マスタ表示名が一致していません。` };
    }
    if (!sourceDrugName || !masterDrugName) {
      return { ok: false, message: `調剤結果の薬剤明細${index + 1}の薬品名照合根拠が不足しています。` };
    }
    if (comparableDrugName(sourceDrugName) !== comparableDrugName(masterDrugName)) {
      return { ok: false, message: `調剤結果の薬剤明細${index + 1}の取得薬品名と薬局マスタ薬品名が一致していません。` };
    }
    if (drugNameVerificationCheckedAt && Number.isNaN(new Date(drugNameVerificationCheckedAt).getTime())) {
      return { ok: false, message: `調剤結果の薬剤明細${index + 1}の薬品名照合日時形式が不正です。` };
    }
    if (!amount || !usageText || !days) {
      return { ok: false, message: `調剤結果の薬剤明細${index + 1}の用量・用法・日数が不足しています。` };
    }
    if (!unitCode && !unitText && amountLooksUnitless(amount)) {
      return { ok: false, message: `調剤結果の薬剤明細${index + 1}の単位がありません。` };
    }
    if (!usageCode && !usageText) {
      return { ok: false, message: `調剤結果の薬剤明細${index + 1}の用法コードまたは用法テキストがありません。` };
    }

    items.push({
      ...(limitedString(item.itemId, 100) ? { itemId: limitedString(item.itemId, 100) } : {}),
      rpNumber,
      ...(prescribedDrugCode ? { prescribedDrugCode } : {}),
      ...(dispensedDrugCode ? { dispensedDrugCode } : {}),
      ...(yjCode ? { yjCode } : {}),
      ...(prescribedDrugCodeStatus ? { prescribedDrugCodeStatus } : {}),
      ...(prescribedDrugCodeAbolishedAt ? { prescribedDrugCodeAbolishedAt } : {}),
      sourceDrugName,
      masterDrugName,
      drugNameVerificationStatus,
      ...(drugNameVerificationCheckedAt ? { drugNameVerificationCheckedAt } : {}),
      amount,
      ...(unitCode ? { unitCode } : {}),
      ...(unitText ? { unitText } : {}),
      ...(unitConversion ? { unitConversion } : {}),
      ...(usageCode ? { usageCode } : {}),
      usage: usageText,
      ...(usageFallbackText ? { usageFallbackText } : {}),
      ...(usageSupplementText ? { usageSupplementText } : {}),
      days,
      ...(limitedString(item.changeReason, 200) ? { changeReason: limitedString(item.changeReason, 200) } : {}),
      ...(item.isIppoka === undefined ? {} : { isIppoka: item.isIppoka === true }),
      ...(item.isCrushed === undefined ? {} : { isCrushed: item.isCrushed === true }),
      ...(item.isDiagnosticTest === undefined ? {} : { isDiagnosticTest: item.isDiagnosticTest === true })
    });
  }

  return {
    ok: true,
    payload: {
      type: 'yakureki-electronic-prescription-dispensing-result',
      schemaVersion: 1,
      ...(prescriptionDate ? { prescriptionDate } : {}),
      dispensingDate,
      ...(value.totalPoints === undefined ? {} : { totalPoints }),
      ...(signatureRequirement ? { signatureRequirement } : {}),
      items
    }
  };
}

export function validateElectronicPrescriptionOperationInput(
  input: ElectronicPrescriptionOperationInput
): {
  ok: true;
  input: ValidElectronicPrescriptionOperationInput;
} | { ok: false; message: string } {
  const operation = normalizeElectronicPrescriptionOperationKind(input.operation);
  if (!operation) {
    return { ok: false, message: '電子処方箋の操作種別を選択してください。' };
  }

  const rawPrescriptionIds = [
    input.prescriptionId,
    ...(Array.isArray(input.prescriptionIds) ? input.prescriptionIds : [])
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if (rawPrescriptionIds.length === 0) {
    return { ok: false, message: '電子処方箋IDがありません。' };
  }
  const prescriptionIds = Array.from(new Set(
    rawPrescriptionIds.map((value) => normalizeElectronicPrescriptionFetchKey(value))
  ));
  if (prescriptionIds.length > 20) {
    return { ok: false, message: '一度に連携できる電子処方箋IDは20件までです。' };
  }
  if (prescriptionIds.some((prescriptionId) => (
    !PRESCRIPTION_ID_PATTERN.test(prescriptionId) || prescriptionId.length < 4
  ))) {
    return { ok: false, message: '電子処方箋IDの形式が不正です。' };
  }
  const prescriptionId = prescriptionIds[0];

  const dispensingResultId = normalizeElectronicPrescriptionFetchKey(input.dispensingResultId || '');
  if (
    (operation === 'dispensing_result_cancel' || operation === 'dispensing_result_change')
    && !dispensingResultId
  ) {
    return { ok: false, message: '調剤結果IDがありません。' };
  }

  const integrityHash = String(input.integrityHash || '').trim().toLowerCase();
  if (integrityHash && !INTEGRITY_HASH_PATTERN.test(integrityHash)) {
    return { ok: false, message: '取得内容SHA-256の形式が不正です。' };
  }

  if (
    (operation === 'dispensing_result_register' || operation === 'dispensing_result_change')
    && (input.payload === undefined || input.payload === null)
  ) {
    return { ok: false, message: '調剤結果の送信内容がありません。' };
  }
  const dispensingPayload = operation === 'dispensing_result_register' || operation === 'dispensing_result_change'
    ? normalizeElectronicPrescriptionDispensingResultPayload(input.payload)
    : undefined;
  if (dispensingPayload && !dispensingPayload.ok) {
    return { ok: false, message: dispensingPayload.message };
  }
  const signatureRequirement = normalizeElectronicPrescriptionDispensingSignatureRequirement(
    input.signatureRequirement
  )
    || (operation === 'dispensing_result_register' || operation === 'dispensing_result_change'
      ? { hpkiSignatureRequired: true, expectedSignerRole: 'pharmacist' as const }
      : undefined);
  if (
    dispensingPayload?.ok
    && signatureRequirement
    && dispensingPayload.payload.signatureRequirement
    && signatureRequirement.hpkiSignatureRequired !== dispensingPayload.payload.signatureRequirement.hpkiSignatureRequired
  ) {
    return { ok: false, message: '調剤情報提供ファイルの署名要否が操作情報と送信内容で一致していません。' };
  }

  return {
    ok: true,
    input: {
      operation,
      prescriptionId,
      ...(prescriptionIds.length > 1 ? { prescriptionIds } : {}),
      ...(dispensingResultId ? { dispensingResultId } : {}),
      ...(integrityHash ? { integrityHash } : {}),
      ...(typeof input.reason === 'string' && input.reason.trim() ? { reason: input.reason.trim().slice(0, 200) } : {}),
      ...(signatureRequirement ? { signatureRequirement } : {}),
      ...(dispensingPayload?.ok ? { payload: dispensingPayload.payload } : {})
    }
  };
}

function normalizeElectronicPrescriptionDispensingSignatureRequirement(
  value: unknown
): ElectronicPrescriptionDispensingSignatureRequirement | undefined {
  if (!isPlainRecord(value) || typeof value.hpkiSignatureRequired !== 'boolean') return undefined;
  return {
    hpkiSignatureRequired: value.hpkiSignatureRequired,
    expectedSignerRole: 'pharmacist'
  };
}

function normalizeDateOnly(value: string | undefined): string {
  if (!value) return '';
  const normalized = value.trim().replace(/\//g, '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '';
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10) === normalized ? normalized : '';
}

export function validateElectronicPrescriptionPayload(
  payload: ElectronicPrescriptionPayload
): ElectronicPrescriptionPayloadIssue[] {
  const issues: ElectronicPrescriptionPayloadIssue[] = [];
  if (!payload.prescriptionId?.trim()) {
    issues.push({ field: 'prescriptionId', message: '処方箋IDがありません。' });
  }
  if (!payload.patient.name?.trim()) {
    issues.push({ field: 'patient.name', message: '患者氏名がありません。' });
  }
  if (!normalizeDateOnly(payload.patient.birthDate)) {
    issues.push({ field: 'patient.birthDate', message: '患者生年月日がありません、または日付形式が不正です。' });
  }
  if (!normalizeDateOnly(payload.prescriptionDate)) {
    issues.push({ field: 'prescriptionDate', message: '処方日がありません、または日付形式が不正です。' });
  }
  if (!normalizeDateOnly(payload.validUntil)) {
    issues.push({ field: 'validUntil', message: '処方箋の有効期限がありません、または日付形式が不正です。' });
  }
  if (!payload.documentKind) {
    issues.push({ field: 'documentKind', message: '電子処方箋か処方箋情報提供ファイルかを判定できません。' });
  }
  if (!payload.signatureVerification?.status) {
    issues.push({ field: 'signatureVerification', message: '電子署名の検証結果がありません。' });
  }
  if (payload.documentKind === 'electronic_prescription') {
    issues.push(...validateHpkiVerification(
      payload.signatureVerification?.hpkiVerification,
      'doctor',
      'signatureVerification.hpkiVerification',
      payload.signatureVerification?.verifiedAt || payload.issuedAt || payload.prescriptionDate
    ));
  }
  if (!payload.provider.institutionName?.trim()) {
    issues.push({ field: 'provider.institutionName', message: '医療機関名がありません。' });
  }
  if (!payload.provider.doctorName?.trim()) {
    issues.push({ field: 'provider.doctorName', message: '処方医名がありません。' });
  }
  if (payload.items.length === 0) {
    issues.push({ field: 'items', message: '処方薬がありません。' });
  }
  payload.items.forEach((item, index) => {
    const itemLabel = `処方薬${index + 1}`;
    const drugCodeStatus = normalizeDrugCodeStatus(item.drugCodeStatus);
    const drugCodeAbolishedAt = normalizeDateOnly(item.drugCodeAbolishedAt);
    const sourceDrugName = item.sourceDrugName?.trim();
    const masterDrugName = item.masterDrugName?.trim();
    const drugNameVerificationStatus = normalizeDrugNameVerificationStatus(item.drugNameVerificationStatus);
    if (!item.drugCode?.trim() && !item.receiptCode?.trim() && !item.yjCode?.trim()) {
      issues.push({ field: `items.${index}.drugCode`, message: `${itemLabel}の医薬品コードがありません。` });
    }
    if (drugCodeStatus === 'abolished' && (!drugCodeAbolishedAt || !payload.prescriptionDate || drugCodeAbolishedAt <= normalizeDateOnly(payload.prescriptionDate))) {
      issues.push({ field: `items.${index}.drugCodeStatus`, message: `${itemLabel}の医薬品コードは処方日時点で廃止済みです。` });
    }
    if (!item.drugName.trim()) {
      issues.push({ field: `items.${index}.drugName`, message: `${itemLabel}の薬品名がありません。` });
    }
    if (!drugNameVerificationStatus) {
      issues.push({ field: `items.${index}.drugNameVerificationStatus`, message: `${itemLabel}の取得薬品名と薬局マスタ表示名の照合結果がありません。` });
    } else if (drugNameVerificationStatus !== 'matched') {
      issues.push({ field: `items.${index}.drugNameVerificationStatus`, message: `${itemLabel}の取得薬品名と薬局マスタ表示名が一致していません。` });
    } else if (!sourceDrugName || !masterDrugName) {
      issues.push({ field: `items.${index}.drugNameVerificationStatus`, message: `${itemLabel}の取得薬品名と薬局マスタ表示名の照合根拠が不足しています。` });
    }
    if (sourceDrugName && item.drugName.trim() && comparableDrugName(sourceDrugName) !== comparableDrugName(item.drugName)) {
      issues.push({ field: `items.${index}.drugName`, message: `${itemLabel}の取得薬品名と表示薬品名が一致していません。` });
    }
    if (sourceDrugName && masterDrugName && comparableDrugName(sourceDrugName) !== comparableDrugName(masterDrugName)) {
      issues.push({ field: `items.${index}.masterDrugName`, message: `${itemLabel}の取得薬品名と薬局マスタ薬品名が一致していません。` });
    }
    if (item.drugNameVerificationCheckedAt && Number.isNaN(new Date(item.drugNameVerificationCheckedAt).getTime())) {
      issues.push({ field: `items.${index}.drugNameVerificationCheckedAt`, message: `${itemLabel}の薬品名照合日時形式が不正です。` });
    }
    if (!item.amount.trim()) {
      issues.push({ field: `items.${index}.amount`, message: `${itemLabel}の用量がありません。` });
    }
    if (item.amount.trim() && !item.unitCode?.trim() && !item.unitText?.trim() && amountLooksUnitless(item.amount)) {
      issues.push({ field: `items.${index}.unit`, message: `${itemLabel}の単位がありません。` });
    }
    if (!item.usage.trim() && !item.usageFallbackText?.trim()) {
      issues.push({ field: `items.${index}.usage`, message: `${itemLabel}の用法がありません。` });
    }
    if (!item.usageCode?.trim() && !item.usage.trim() && !item.usageFallbackText?.trim()) {
      issues.push({ field: `items.${index}.usageFallbackText`, message: `${itemLabel}の用法コードまたは用法テキストがありません。` });
    }
    if (!item.days.trim()) {
      issues.push({ field: `items.${index}.days`, message: `${itemLabel}の日数・回数がありません。` });
    }
    if (item.unitConversion) {
      const factor = Number(item.unitConversion.conversionFactor);
      if (!Number.isFinite(factor) || factor <= 0) {
        issues.push({ field: `items.${index}.unitConversion.conversionFactor`, message: `${itemLabel}の単位変換係数が不正です。` });
      }
      if (!item.unitConversion.prescribedAmount.trim() || !item.unitConversion.prescribedUnitText.trim()) {
        issues.push({ field: `items.${index}.unitConversion`, message: `${itemLabel}の変換後用量・単位がありません。` });
      }
    }
  });
  payload.supplementaryInformation?.laboratoryResults.forEach((result, index) => {
    if (!result.testName.trim() || !result.value.trim()) {
      issues.push({ field: `supplementaryInformation.laboratoryResults.${index}`, message: '検査値情報の検査名または値がありません。' });
    }
    if (result.measuredAt && Number.isNaN(new Date(result.measuredAt).getTime())) {
      issues.push({ field: `supplementaryInformation.laboratoryResults.${index}.measuredAt`, message: '検査値情報の測定日時形式が不正です。' });
    }
  });
  const narcoticAdministration = payload.supplementaryInformation?.narcoticAdministration;
  if (
    narcoticAdministration?.isNarcoticPrescription
    && (!narcoticAdministration.recordPresent || !narcoticAdministration.displayText?.trim())
  ) {
    issues.push({
      field: 'supplementaryInformation.narcoticAdministration',
      message: '麻薬処方箋に必須の麻薬施用情報を表示できません。'
    });
  }
  return issues;
}

export function validateElectronicPrescriptionFetchMatch(
  input: {
    fetchKey: string;
    keyKind: ElectronicPrescriptionFetchKeyKind;
    insuredNumber?: string;
    patientBirthDate?: string;
  },
  payload: ElectronicPrescriptionPayload
): { ok: true } | { ok: false; status: 'patient_mismatch' | 'invalid_payload'; message: string } {
  const expectedKey = normalizeElectronicPrescriptionFetchKey(input.fetchKey);
  const returnedKey = normalizeElectronicPrescriptionFetchKey(
    input.keyKind === 'exchange_number'
      ? payload.exchangeNumber || ''
      : payload.prescriptionId || ''
  );
  if (!returnedKey || returnedKey !== expectedKey) {
    return {
      ok: false,
      status: 'invalid_payload',
      message: input.keyKind === 'exchange_number'
        ? '入力した引換番号と取得結果が一致しません。処方入力には反映していません。'
        : '入力した電子処方箋IDと取得結果が一致しません。処方入力には反映していません。'
    };
  }

  const expectedInsuredNumber = canonicalizeElectronicPrescriptionInsuredNumber(input.insuredNumber || '');
  if (expectedInsuredNumber) {
    const returnedInsuredNumber = canonicalizeElectronicPrescriptionInsuredNumber(payload.patient.insuranceNumber || '');
    if (!returnedInsuredNumber || returnedInsuredNumber !== expectedInsuredNumber) {
      return {
        ok: false,
        status: 'patient_mismatch',
        message: '入力した被保険者番号と電子処方箋が一致しません。別患者の可能性があるため反映していません。'
      };
    }
  }

  const expectedBirthDate = normalizeDateOnly(input.patientBirthDate);
  if (expectedBirthDate) {
    const returnedBirthDate = normalizeDateOnly(payload.patient.birthDate);
    if (!returnedBirthDate || returnedBirthDate !== expectedBirthDate) {
      return {
        ok: false,
        status: 'patient_mismatch',
        message: '受付中の患者生年月日と電子処方箋が一致しません。別患者の可能性があるため反映していません。'
      };
    }
  }
  return { ok: true };
}

export function buildElectronicPrescriptionApplyDecision(
  result: ElectronicPrescriptionFetchResult,
  options: {
    paperOriginalConfirmed?: boolean;
    now?: Date;
  } = {}
): ElectronicPrescriptionApplyDecision {
  if (result.status !== 'success' || !result.prescription) {
    return {
      status: 'blocked',
      canApply: false,
      statusLabel: '反映しない',
      message: result.message || '電子処方箋を取得できませんでした。',
      requiredActions: result.warnings
    };
  }
  if (result.mode === 'demo') {
    return {
      status: 'blocked',
      canApply: false,
      statusLabel: 'デモ表示のみ',
      message: 'デモデータは本番の受付へ反映しません。接続確認用の表示として確認してください。',
      requiredActions: ['本番受付ではpharma-ossの電子処方箋接続モジュールを使用する']
    };
  }

  const payloadIssues = validateElectronicPrescriptionPayload(result.prescription);
  if (payloadIssues.length > 0) {
    return {
      status: 'blocked',
      canApply: false,
      statusLabel: '内容不足',
      message: '取得内容に不足があるため、処方入力へ反映していません。',
      requiredActions: payloadIssues.map((issue) => issue.message)
    };
  }
  if (!INTEGRITY_HASH_PATTERN.test(result.integrityHash || '')) {
    return {
      status: 'blocked',
      canApply: false,
      statusLabel: '完全性未確認',
      message: '取得内容のSHA-256を確認できないため、処方入力へ反映していません。',
      requiredActions: ['接続モジュールの応答を正規化し、取得内容のSHA-256を記録する']
    };
  }

  const signatureStatus = result.prescription.signatureVerification?.status;
  if (result.prescription.documentKind === 'electronic_prescription' && signatureStatus !== 'valid') {
    return {
      status: 'blocked',
      canApply: false,
      statusLabel: signatureStatus === 'invalid' ? '署名不正' : '署名未確認',
      message: signatureStatus === 'invalid'
        ? '電子署名の検証に失敗したため、処方入力へ反映していません。'
        : '電子署名の検証が完了していないため、処方入力へ反映していません。',
      requiredActions: ['電子処方箋管理サービス記録条件仕様に沿って医師の電子署名を検証する']
    };
  }

  const validUntil = normalizeDateOnly(result.prescription.validUntil);
  const now = options.now ?? new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');
  if (validUntil && validUntil < today) {
    return {
      status: 'blocked',
      canApply: false,
      statusLabel: '期限切れ',
      message: '処方箋の有効期限が切れているため、処方入力へ反映していません。',
      requiredActions: ['処方医療機関へ有効な処方箋を確認する']
    };
  }

  if (
    result.prescription.documentKind === 'prescription_information'
    && !options.paperOriginalConfirmed
  ) {
    return {
      status: 'blocked',
      canApply: false,
      statusLabel: '原本待ち',
      message: '処方箋情報提供ファイルは処方箋原本ではありません。紙の処方箋原本を受領するまで反映しません。',
      requiredActions: ['紙の処方箋原本を受領し、原本と取得内容を照合する']
    };
  }

  const duplicateCheckStatus = result.duplicateCheck?.status || 'not_checked';
  if (duplicateCheckStatus === 'blocked') {
    return {
      status: 'blocked',
      canApply: false,
      statusLabel: '受付を止める',
      message: '重複投薬・併用禁忌の確認結果により、処方入力への反映を止めています。',
      requiredActions: result.duplicateCheck?.messages || ['重複投薬・併用禁忌の確認結果を処理する']
    };
  }
  if (duplicateCheckStatus === 'not_checked') {
    return {
      status: 'blocked',
      canApply: false,
      statusLabel: '確認未実施',
      message: '重複投薬・併用禁忌の確認が記録されていないため、処方入力へ反映していません。',
      requiredActions: ['電子処方箋管理サービスで重複投薬・併用禁忌を確認する']
    };
  }
  if (duplicateCheckStatus === 'warning') {
    return {
      status: 'review',
      canApply: true,
      statusLabel: '薬剤師確認',
      message: '処方入力へ反映します。重複投薬・併用禁忌の注意内容を薬剤師が確認してください。',
      requiredActions: result.duplicateCheck?.messages || ['重複投薬・併用禁忌の注意内容を確認する']
    };
  }
  return {
    status: 'apply',
    canApply: true,
    statusLabel: '反映OK',
    message: '取得内容と重複投薬・併用禁忌の確認結果を処方入力へ反映できます。',
    requiredActions: []
  };
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJsonValue(child)])
  );
}

export async function buildElectronicPrescriptionIntegrityHash(
  payload: ElectronicPrescriptionPayload
): Promise<string> {
  const canonicalPayload = JSON.stringify(sortJsonValue(payload));
  const bytes = new TextEncoder().encode(canonicalPayload);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function buildElectronicPrescriptionOperationIdempotencyKey(
  input: ValidElectronicPrescriptionOperationInput
): Promise<string> {
  const canonicalPayload = JSON.stringify(sortJsonValue(input));
  const bytes = new TextEncoder().encode(canonicalPayload);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function createDemoElectronicPrescription(
  input: { fetchKey: string; keyKind: ElectronicPrescriptionFetchKeyKind }
): ElectronicPrescriptionPayload {
  const today = new Date();
  const date = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-');
  const validUntilDate = new Date(today);
  validUntilDate.setDate(validUntilDate.getDate() + 3);
  const validUntil = [
    validUntilDate.getFullYear(),
    String(validUntilDate.getMonth() + 1).padStart(2, '0'),
    String(validUntilDate.getDate()).padStart(2, '0')
  ].join('-');

  return {
    prescriptionId: input.keyKind === 'prescription_id' ? input.fetchKey : `DEMO-${input.fetchKey}`,
    exchangeNumber: input.keyKind === 'exchange_number' ? input.fetchKey : undefined,
    issuedAt: new Date().toISOString(),
    prescriptionDate: date,
    validUntil,
    documentKind: 'electronic_prescription',
    signatureVerification: {
      status: 'not_checked'
    },
    patient: {
      name: '電子 処方',
      kana: 'デンシ ショホウ',
      birthDate: '1980-01-01',
      insuranceNumber: '06123456',
      burdenRatio: 30
    },
    provider: {
      institutionCode: '1310000000',
      institutionName: 'デモ医療機関',
      departmentName: '内科',
      doctorName: 'デモ 医師'
    },
    items: [{
      rpNumber: 1,
      drugCode: 'DEMO-DRUG-A',
      drugName: 'デモ薬A錠10mg',
      sourceDrugName: 'デモ薬A錠10mg',
      masterDrugName: 'デモ薬A錠10mg',
      drugNameVerificationStatus: 'not_checked',
      amount: '1錠',
      usage: '1日1回 朝食後',
      days: '7'
    }]
  };
}
