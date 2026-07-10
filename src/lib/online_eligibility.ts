import type { InsuranceEligibilityStatus, Patient, PublicInsurance } from '@/db/types';

export type OnlineEligibilityUiStatus = 'confirmed' | 'warning' | 'unavailable';

export interface NormalizedOnlineEligibilityResult {
  uiStatus: OnlineEligibilityUiStatus;
  patientStatus: InsuranceEligibilityStatus;
  checkedAt?: string;
  message: string;
  insuranceInfoPatch: NonNullable<Patient['insuranceInfo']>;
  publicInsurances?: PublicInsurance[];
  rawStatus: string;
  fieldMapping: OnlineEligibilityFieldMappingReport;
}

type UnknownRecord = Record<string, unknown>;
export type OnlineEligibilityFieldKey =
  | 'status'
  | 'checkedAt'
  | 'message'
  | 'insurerNumber'
  | 'insuredNumber'
  | 'burdenRatio'
  | 'validFrom'
  | 'validTo';

export interface OnlineEligibilityFieldMappingReport {
  recognized: Partial<Record<OnlineEligibilityFieldKey, string>>;
  missing: OnlineEligibilityFieldKey[];
}

export const ONLINE_ELIGIBILITY_FIELD_ALIASES: Record<OnlineEligibilityFieldKey, string[]> = {
  status: [
    'qualificationStatus',
    'qualificationResult',
    'status',
    'resultCode',
    'statusCode',
    'result.status',
    'result.statusCode',
    'qualification.status',
    'qualification.resultCode',
    '資格確認結果',
    '資格確認結果コード',
    '資格有効性',
    '資格情報.資格確認結果',
    '資格情報.資格状態',
    '資格情報.資格確認結果コード'
  ],
  checkedAt: [
    'checkedAt',
    'resultDateTime',
    'referenceDate',
    'qualification.checkedAt',
    'qualification.confirmedAt',
    'qualification.referenceDate',
    '確認日時',
    '照会日',
    '資格情報.確認日時',
    '資格情報.照会日時',
    '資格情報.照会日'
  ],
  message: [
    'message',
    'resultMessage',
    'result.message',
    'result.statusMessage',
    'qualification.message',
    '結果メッセージ',
    '結果内容',
    '資格情報.メッセージ'
  ],
  insurerNumber: [
    'insurerNumber',
    'insuranceProviderNumber',
    'insurerNo',
    'insurance.insurerNumber',
    'insurance.insurerNo',
    'qualification.insurerNumber',
    'qualification.insurerNo',
    'qualification.insurance.insurerNumber',
    'qualification.insurance.insurerNo',
    'qualification.insuranceInfo.insurerNumber',
    '保険者番号',
    '保険情報.保険者番号',
    '資格情報.保険者番号',
    '資格情報.保険者No',
    '資格情報.保険情報.保険者番号',
    '資格情報.保険情報.保険者No'
  ],
  insuredNumber: [
    'insuredNumber',
    'insuredPersonNumber',
    'certificateNumber',
    'insuredCardNumber',
    'insurance.insuredNumber',
    'insurance.certificateNumber',
    'qualification.insuredNumber',
    'qualification.certificateNumber',
    'qualification.insurance.insuredNumber',
    'qualification.insurance.certificateNumber',
    'qualification.insuranceInfo.insuredNumber',
    '記号番号',
    '被保険者証番号',
    '保険証記号番号',
    '保険情報.記号番号',
    '被保険者証記号番号',
    '資格情報.記号番号',
    '資格情報.被保険者証記号番号',
    '資格情報.保険情報.記号番号',
    '資格情報.保険情報.被保険者証記号番号'
  ],
  burdenRatio: [
    'burdenRatio',
    'copaymentRate',
    'copaymentRatio',
    'insurance.burdenRatio',
    'insurance.copaymentRatio',
    'qualification.burdenRatio',
    'qualification.copaymentRate',
    'qualification.copaymentRatio',
    'qualification.insurance.burdenRatio',
    'qualification.insurance.copaymentRatio',
    'qualification.insuranceInfo.burdenRatio',
    '負担割合',
    '負担区分',
    '一部負担金割合',
    '保険情報.負担割合',
    '資格情報.負担割合',
    '資格情報.一部負担金割合',
    '資格情報.保険情報.負担割合',
    '資格情報.保険情報.一部負担金割合'
  ],
  validFrom: [
    'validFrom',
    'certificateValidFrom',
    'certificateStartDate',
    'insurance.validFrom',
    'insurance.certificateValidFrom',
    'qualification.validFrom',
    'qualification.certificateValidFrom',
    'qualification.certificateStartDate',
    'qualification.insurance.validFrom',
    'qualification.insurance.certificateValidFrom',
    'qualification.insuranceInfo.validFrom',
    '有効開始日',
    '有効開始年月日',
    '資格取得年月日',
    '保険情報.有効開始日',
    '資格情報.有効開始日',
    '資格情報.資格取得年月日',
    '資格情報.保険情報.有効開始日',
    '資格情報.保険情報.資格取得年月日'
  ],
  validTo: [
    'validTo',
    'certificateValidTo',
    'certificateExpiredDate',
    'insurance.validTo',
    'insurance.certificateValidTo',
    'qualification.validTo',
    'qualification.certificateValidTo',
    'qualification.certificateExpiredDate',
    'qualification.insurance.validTo',
    'qualification.insurance.certificateValidTo',
    'qualification.insuranceInfo.validTo',
    '有効終了日',
    '有効終了年月日',
    '有効期限',
    '保険情報.有効終了日',
    '資格情報.有効終了日',
    '資格情報.有効期限',
    '資格情報.保険情報.有効終了日',
    '資格情報.保険情報.有効期限'
  ]
};

const INSURED_SYMBOL_ALIASES = [
  'insuredSymbol',
  'certificateSymbol',
  'insurance.symbol',
  'qualification.insuredSymbol',
  'qualification.certificateSymbol',
  'qualification.insurance.insuredSymbol',
  'qualification.insurance.certificateSymbol',
  '被保険者証記号',
  '記号',
  '保険情報.記号',
  '資格情報.被保険者証記号',
  '資格情報.保険情報.記号',
  '資格情報.保険情報.被保険者証記号'
];

const INSURED_NUMBER_ALIASES = [
  'insuredNumberOnly',
  'certificateNumberOnly',
  'insurance.number',
  'qualification.insuredNumberOnly',
  'qualification.certificateNumberOnly',
  'qualification.insurance.number',
  'qualification.insurance.insuredNumberOnly',
  '被保険者証番号',
  '番号',
  '保険情報.番号',
  '資格情報.被保険者証番号',
  '資格情報.保険情報.番号',
  '資格情報.保険情報.被保険者証番号'
];

const ONLINE_ELIGIBILITY_FIELD_LABELS: Record<OnlineEligibilityFieldKey, string> = {
  status: '資格確認結果',
  checkedAt: '確認日時',
  message: '結果メッセージ',
  insurerNumber: '保険者番号',
  insuredNumber: '記号番号',
  burdenRatio: '負担割合',
  validFrom: '有効開始日',
  validTo: '有効終了日'
};

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readPath(source: unknown, path: string): unknown {
  if (!isRecord(source)) return undefined;
  let current: unknown = source;
  for (const part of path.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function firstText(source: unknown, paths: string[]): string | undefined {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return undefined;
}

function firstTextWithPath(source: unknown, paths: string[]): { value?: string; path?: string } {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return { value: text, path };
  }
  return {};
}

function firstNumber(source: unknown, paths: string[]): number | undefined {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value === undefined || value === null || value === '') continue;
    const numberValue = Number(normalizeNumericText(value));
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return undefined;
}

function normalizeNumericText(value: unknown): string {
  return String(value).normalize('NFKC').replace(/[,\s円％%]/g, '').trim();
}

function normalizeIdentifierText(value?: string): string | undefined {
  const text = String(value ?? '').normalize('NFKC').trim();
  return text || undefined;
}

function normalizeCodeText(value?: string): string | undefined {
  const text = normalizeIdentifierText(value)?.replace(/\s/g, '');
  return text || undefined;
}

function parseBurdenRatio(value: unknown): number | undefined {
  const text = String(value ?? '').normalize('NFKC').trim();
  if (!text) return undefined;
  const wariMatch = text.match(/([0-9.]+)\s*割/);
  if (wariMatch) {
    const wari = Number(wariMatch[1]);
    return Number.isFinite(wari) ? wari * 10 : undefined;
  }
  const numberValue = Number(normalizeNumericText(text));
  if (!Number.isFinite(numberValue)) return undefined;
  if (numberValue > 0 && numberValue <= 1 && normalizeNumericText(text).includes('.')) {
    return Math.round(numberValue * 1000) / 10;
  }
  return numberValue;
}

function firstBurdenRatioWithPath(source: unknown, paths: string[]): { value?: number; path?: string } {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value === undefined || value === null || value === '') continue;
    const numberValue = parseBurdenRatio(value);
    if (numberValue !== undefined) return { value: numberValue, path };
  }
  return {};
}

function normalizeDateText(value?: string): string | undefined {
  const text = String(value ?? '').normalize('NFKC').trim();
  if (!text) return undefined;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = text.match(/^(\d{4})[\/.年](\d{1,2})[\/.月](\d{1,2})日?/);
  if (slash) return `${slash[1]}-${slash[2].padStart(2, '0')}-${slash[3].padStart(2, '0')}`;
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const era = text.match(/^(令和|平成|昭和)(元|\d+)年(\d{1,2})月(\d{1,2})日?$/);
  if (era) {
    const baseYear = era[1] === '令和' ? 2018 : era[1] === '平成' ? 1988 : 1925;
    const eraYear = era[2] === '元' ? 1 : Number(era[2]);
    if (Number.isFinite(eraYear)) {
      return `${baseYear + eraYear}-${era[3].padStart(2, '0')}-${era[4].padStart(2, '0')}`;
    }
  }
  return text;
}

function firstDateWithPath(source: unknown, paths: string[]): { value?: string; path?: string } {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value === undefined || value === null || value === '') continue;
    const text = normalizeDateText(String(value));
    if (text) return { value: text, path };
  }
  return {};
}

function buildInsuredNumberWithPath(source: unknown): { value?: string; path?: string } {
  const combined = firstTextWithPath(source, ONLINE_ELIGIBILITY_FIELD_ALIASES.insuredNumber);
  if (combined.value) {
    return {
      value: normalizeIdentifierText(combined.value),
      path: combined.path
    };
  }
  const symbol = firstTextWithPath(source, INSURED_SYMBOL_ALIASES);
  const number = firstTextWithPath(source, INSURED_NUMBER_ALIASES);
  const value = [symbol.value, number.value].map(normalizeIdentifierText).filter(Boolean).join(' ');
  if (!value) return {};
  return {
    value,
    path: [symbol.path, number.path].filter(Boolean).join('+')
  };
}

function buildFieldMappingReport(
  recognized: Partial<Record<OnlineEligibilityFieldKey, string>>
): OnlineEligibilityFieldMappingReport {
  const expectedFields = Object.keys(ONLINE_ELIGIBILITY_FIELD_ALIASES) as OnlineEligibilityFieldKey[];
  return {
    recognized,
    missing: expectedFields.filter((field) => !recognized[field])
  };
}

function normalizeStatus(value?: string): {
  rawStatus: string;
  patientStatus: InsuranceEligibilityStatus;
  uiStatus: OnlineEligibilityUiStatus;
} {
  const rawStatus = (value || 'unchecked').trim();
  const status = rawStatus.normalize('NFKC').replace(/\s/g, '').toLowerCase();

  if (['confirmed', 'valid', 'available', 'ok', '00', '有効', '資格有効', '資格あり', '該当', '確認済み'].includes(status)) {
    return { rawStatus, patientStatus: 'valid', uiStatus: 'confirmed' };
  }
  if (['invalid', 'expired', 'not_found', 'ng', '01', '無効', '資格無効', '資格喪失', '資格なし', '該当なし', '不存在', '不一致'].includes(status)) {
    return { rawStatus, patientStatus: 'invalid', uiStatus: 'warning' };
  }
  if (['unavailable', 'timeout', 'system_error', 'maintenance', '通信不能', '照会不能', 'システムエラー'].includes(status)) {
    return { rawStatus, patientStatus: 'unavailable', uiStatus: 'unavailable' };
  }
  if (['warning', 'need_confirm', 'caution', '02', '要確認', '要確認あり', '一部不一致'].includes(status)) {
    return { rawStatus, patientStatus: 'warning', uiStatus: 'warning' };
  }
  return { rawStatus, patientStatus: 'warning', uiStatus: 'warning' };
}

function normalizePublicExpenses(source: unknown): PublicInsurance[] {
  const expenses = readPath(source, 'publicExpenses')
    || readPath(source, 'publicExpenseInfoList')
    || readPath(source, 'qualification.publicExpenses')
    || readPath(source, 'qualification.publicInsurances')
    || readPath(source, 'qualification.publicExpenseInfoList')
    || readPath(source, 'publicInsurances')
    || readPath(source, '公費情報')
    || readPath(source, '公費情報一覧')
    || readPath(source, '資格情報.公費情報')
    || readPath(source, '資格情報.公費情報一覧');
  if (!Array.isArray(expenses)) return [];

  return expenses
    .filter(isRecord)
    .map((expense) => ({
      provider: normalizeCodeText(firstText(expense, ['payerNumber', 'provider', 'publicExpensePayerNumber', '公費負担者番号', '負担者番号'])) || '',
      recipient: normalizeCodeText(firstText(expense, ['recipientNumber', 'recipient', 'publicExpenseRecipientNumber', '公費受給者番号', '受給者番号'])) || '',
      burdenRatio: firstBurdenRatioWithPath(expense, ['burdenRatio', 'copaymentRate', 'copaymentRatio', '負担割合', '自己負担割合']).value,
      startDate: normalizeDateText(firstText(expense, ['validFrom', 'startDate', 'certificateValidFrom', '有効開始日', '有効開始年月日', '公費開始日'])),
      endDate: normalizeDateText(firstText(expense, ['validTo', 'endDate', 'certificateValidTo', '有効終了日', '有効終了年月日', '公費有効期限'])),
      monthlyLimitYen: firstNumber(expense, ['monthlyLimitYen', 'selfPaymentLimitYen', 'copaymentLimitYen', 'monthlyLimitAmount', '月額負担上限', '自己負担上限額', '月額上限額'])
    }))
    .filter((expense) => expense.provider && expense.recipient);
}

export function normalizeOnlineEligibilityResponse(response: unknown): NormalizedOnlineEligibilityResult {
  const recognized: Partial<Record<OnlineEligibilityFieldKey, string>> = {};
  const statusField = firstTextWithPath(response, ONLINE_ELIGIBILITY_FIELD_ALIASES.status);
  if (statusField.path) recognized.status = statusField.path;
  const status = normalizeStatus(statusField.value);
  const checkedAtField = firstTextWithPath(response, ONLINE_ELIGIBILITY_FIELD_ALIASES.checkedAt);
  if (checkedAtField.path) recognized.checkedAt = checkedAtField.path;
  const checkedAt = checkedAtField.value;
  const insurerNumber = firstTextWithPath(response, ONLINE_ELIGIBILITY_FIELD_ALIASES.insurerNumber);
  if (insurerNumber.path) recognized.insurerNumber = insurerNumber.path;
  const insuredNumber = buildInsuredNumberWithPath(response);
  if (insuredNumber.path) recognized.insuredNumber = insuredNumber.path;
  const burdenRatio = firstBurdenRatioWithPath(response, ONLINE_ELIGIBILITY_FIELD_ALIASES.burdenRatio);
  if (burdenRatio.path) recognized.burdenRatio = burdenRatio.path;
  const validFrom = firstDateWithPath(response, ONLINE_ELIGIBILITY_FIELD_ALIASES.validFrom);
  if (validFrom.path) recognized.validFrom = validFrom.path;
  const validTo = firstDateWithPath(response, ONLINE_ELIGIBILITY_FIELD_ALIASES.validTo);
  if (validTo.path) recognized.validTo = validTo.path;
  const message = firstTextWithPath(response, ONLINE_ELIGIBILITY_FIELD_ALIASES.message);
  if (message.path) recognized.message = message.path;

  const insuranceInfoPatch: NonNullable<Patient['insuranceInfo']> = {
    provider: normalizeCodeText(insurerNumber.value),
    number: insuredNumber.value,
    burdenRatio: burdenRatio.value,
    validFrom: validFrom.value,
    validTo: validTo.value,
    eligibilityCheckedAt: checkedAt,
    eligibilityStatus: status.patientStatus
  };

  return {
    ...status,
    checkedAt,
    message: message.value || (
      status.patientStatus === 'valid'
        ? '資格有効として確認しました。'
        : '資格確認結果に確認事項があります。'
    ),
    insuranceInfoPatch,
    publicInsurances: normalizePublicExpenses(response),
    fieldMapping: buildFieldMappingReport(recognized)
  };
}

export function buildMockOnlineEligibilityResponse({
  insuranceNumber,
  insuredNumber,
  burdenRatio,
  checkedAt = new Date().toISOString()
}: {
  insuranceNumber: string;
  insuredNumber?: string;
  burdenRatio?: number;
  checkedAt?: string;
}) {
  const checkedDate = new Date(checkedAt);
  const year = Number.isFinite(checkedDate.getTime()) ? checkedDate.getFullYear() : new Date().getFullYear();

  return {
    status: 'confirmed',
    resultCode: '00',
    qualificationStatus: 'valid',
    checkedAt,
    resultMessage: '資格有効として確認しました。',
    insurerNumber: insuranceNumber,
    insuredNumber: insuredNumber || insuranceNumber,
    burdenRatio: burdenRatio ?? 30,
    validFrom: `${year}-01-01`,
    validTo: `${year}-12-31`,
    publicExpenses: []
  };
}

export function formatOnlineEligibilityFieldMappingReport(report: OnlineEligibilityFieldMappingReport): string {
  const recognized = (Object.entries(report.recognized) as Array<[OnlineEligibilityFieldKey, string]>)
    .map(([field, path]) => `${ONLINE_ELIGIBILITY_FIELD_LABELS[field]}=${path}`)
    .join('、');
  const missing = report.missing
    .map((field) => ONLINE_ELIGIBILITY_FIELD_LABELS[field])
    .join('、') || 'なし';
  return `認識項目: ${recognized || 'なし'} / 未認識項目: ${missing}`;
}
