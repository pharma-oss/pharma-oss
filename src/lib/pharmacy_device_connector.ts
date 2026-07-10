export type PharmacyDeviceConnectorKind = 'nsips_gateway' | 'vendor_api';
export type PharmacyDeviceOperation = 'submit' | 'replace' | 'cancel';
export type PharmacyDeviceTransferOutcome = 'accepted' | 'duplicate' | 'cancelled';
export const CURRENT_NSIPS_INTERFACE_VERSION = '1.07.01';

export interface PharmacyDevicePrescriptionItem {
  itemId: string;
  rpNumber: number;
  prescribedDrugCode: string;
  dispensedDrugCode: string;
  drugName: string;
  amount: number;
  usage: string;
  days: number;
  unit?: string;
}

export interface PharmacyDevicePrescriptionPayload {
  visitId: string;
  prescriptionDate: string;
  dispensingDate: string;
  patient: {
    patientId: string;
    name: string;
    kana?: string;
    birthDate: string;
    gender?: 'male' | 'female' | 'other';
  };
  provider: {
    institutionCode?: string;
    institutionName: string;
    departmentName?: string;
    doctorName?: string;
  };
  items: PharmacyDevicePrescriptionItem[];
}

export interface PharmacyDeviceOperationInput {
  operation?: string;
  previousTransferId?: string;
  reason?: string;
  payload?: PharmacyDevicePrescriptionPayload;
}

export interface ValidatedPharmacyDeviceOperationInput {
  operation: PharmacyDeviceOperation;
  previousTransferId?: string;
  reason?: string;
  payload?: PharmacyDevicePrescriptionPayload;
}

export interface PharmacyDeviceOperationResult {
  status: 'success' | 'unconfigured' | 'invalid_request' | 'rejected' | 'error';
  operation?: PharmacyDeviceOperation;
  message: string;
  outcome?: PharmacyDeviceTransferOutcome;
  transferId?: string;
  payloadHash?: string;
  connectorKind?: PharmacyDeviceConnectorKind;
  interfaceVersion?: string;
  receivedAt?: string;
}

export const REQUIRED_PHARMACY_DEVICE_CAPABILITIES = [
  'prescription_submit',
  'prescription_replace',
  'prescription_cancel',
  'idempotent_submission',
  'status_response'
] as const;

export type PharmacyDeviceConnectorCapability = typeof REQUIRED_PHARMACY_DEVICE_CAPABILITIES[number];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_ID_PATTERN = /^[^\u0000-\u001f\u007f]{1,100}$/;
const MAX_ITEMS = 100;

function hasText(value: unknown, maxLength = 200): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function isSafeId(value: unknown): value is string {
  return hasText(value, 100) && SAFE_ID_PATTERN.test(value.trim());
}

function isValidDate(value: unknown): value is string {
  if (!hasText(value, 10) || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validatePayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return '処方データがありません。';
  const candidate = payload as Partial<PharmacyDevicePrescriptionPayload>;
  if (!isSafeId(candidate.visitId)) return '受付IDを確認してください。';
  if (!isValidDate(candidate.prescriptionDate)) return '処方日を確認してください。';
  if (!isValidDate(candidate.dispensingDate)) return '調剤日を確認してください。';

  if (!candidate.patient || typeof candidate.patient !== 'object') return '患者情報がありません。';
  if (!isSafeId(candidate.patient.patientId)) return '患者IDを確認してください。';
  if (!hasText(candidate.patient.name, 100)) return '患者氏名を確認してください。';
  if (!isValidDate(candidate.patient.birthDate)) return '患者生年月日を確認してください。';
  if (candidate.patient.kana !== undefined && String(candidate.patient.kana).length > 100) {
    return '患者カナが長すぎます。';
  }
  if (candidate.patient.gender && !['male', 'female', 'other'].includes(candidate.patient.gender)) {
    return '患者性別を確認してください。';
  }

  if (!candidate.provider || typeof candidate.provider !== 'object') return '処方元情報がありません。';
  if (!hasText(candidate.provider.institutionName, 200)) return '医療機関名を確認してください。';
  if (!Array.isArray(candidate.items) || candidate.items.length === 0) return '処方薬がありません。';
  if (candidate.items.length > MAX_ITEMS) return `1回に送信できる処方薬は${MAX_ITEMS}件までです。`;

  for (let index = 0; index < candidate.items.length; index++) {
    const item = candidate.items[index];
    if (!item || typeof item !== 'object') return `${index + 1}番目の処方薬を確認してください。`;
    if (!isSafeId(item.itemId)) return `${index + 1}番目の処方薬IDを確認してください。`;
    if (!Number.isInteger(item.rpNumber) || item.rpNumber < 1 || item.rpNumber > 999) {
      return `${index + 1}番目の処方番号を確認してください。`;
    }
    if (!hasText(item.prescribedDrugCode, 100) || !hasText(item.dispensedDrugCode, 100)) {
      return `${index + 1}番目の医薬品コードを確認してください。`;
    }
    if (!hasText(item.drugName, 200)) return `${index + 1}番目の医薬品名を確認してください。`;
    if (!Number.isFinite(item.amount) || item.amount <= 0 || item.amount > 1_000_000) {
      return `${index + 1}番目の用量を確認してください。`;
    }
    if (!hasText(item.usage, 500)) return `${index + 1}番目の用法を確認してください。`;
    if (!Number.isInteger(item.days) || item.days < 0 || item.days > 9999) {
      return `${index + 1}番目の日数を確認してください。`;
    }
    if (item.unit !== undefined && String(item.unit).length > 50) {
      return `${index + 1}番目の単位が長すぎます。`;
    }
  }
  return null;
}

export function validatePharmacyDeviceOperationInput(
  input: PharmacyDeviceOperationInput
): { ok: true; input: ValidatedPharmacyDeviceOperationInput } | { ok: false; message: string } {
  const operation = String(input.operation || '').trim() as PharmacyDeviceOperation;
  if (!['submit', 'replace', 'cancel'].includes(operation)) {
    return { ok: false, message: '外部機器への操作を確認してください。' };
  }

  const previousTransferId = input.previousTransferId?.trim();
  if ((operation === 'replace' || operation === 'cancel') && !isSafeId(previousTransferId)) {
    return { ok: false, message: '差替または取消対象の連携IDがありません。' };
  }

  const reason = input.reason?.trim();
  if ((operation === 'replace' || operation === 'cancel') && !hasText(reason, 500)) {
    return { ok: false, message: '差替または取消の理由を入力してください。' };
  }

  if (operation !== 'cancel') {
    const payloadError = validatePayload(input.payload);
    if (payloadError) return { ok: false, message: payloadError };
  }

  return {
    ok: true,
    input: {
      operation,
      ...(previousTransferId ? { previousTransferId } : {}),
      ...(reason ? { reason } : {}),
      ...(operation !== 'cancel' ? { payload: input.payload as PharmacyDevicePrescriptionPayload } : {})
    }
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)])
  );
}

export async function buildPharmacyDeviceIdempotencyKey(
  input: ValidatedPharmacyDeviceOperationInput
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(input)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizePharmacyDeviceConnectorCapabilities(
  value: string | string[] | undefined
): PharmacyDeviceConnectorCapability[] {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return Array.from(new Set(values
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is PharmacyDeviceConnectorCapability => (
      REQUIRED_PHARMACY_DEVICE_CAPABILITIES.includes(item as PharmacyDeviceConnectorCapability)
    ))));
}
