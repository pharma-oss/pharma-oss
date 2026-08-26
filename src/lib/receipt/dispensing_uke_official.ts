import encoding from 'encoding-japanese';
import {
  DISPENSING_UKE_OFFICIAL_RECORD_SPEC,
  buildDispensingUkeOfficialSubmissionGate,
  validateDispensingUkeRecords,
  type DispensingUkeOfficialSubmissionGate
} from './dispensing_uke_validation';
import type { UkeRecord } from './uke_generator';

export const DISPENSING_UKE_OFFICIAL_FILE_NAME = 'RECEIPTY.CYO';

const OFFICIAL_CLAIM_BODY_RECORD_TYPES = new Set([
  'SN',
  'JD',
  'MF',
  'SH',
  'CZ',
  'IY',
  'TO',
  'CO',
  'TK',
  'KI',
  'ST'
]);

import {
  DISPENSING_UKE_COPAYMENT_CATEGORY_CODES,
  DISPENSING_UKE_REDUCTION_CODES,
  buildSpecialNoteField,
  findDispensingUkeCodeTableEntry
} from './dispensing_uke_code_tables';

export interface DispensingUkeOfficialHeaderInput {
  payerOrganizationCode: '1' | '2';
  prefectureCode: string;
  pharmacyCode: string;
  pharmacyName: string;
  claimMonth: string;
  volumeId?: string;
  phone?: string;
}

export interface DispensingUkeOfficialClaimCommonInput {
  claimNumber: number;
  claimTypeCode: string;
  dispensingMonth: string;
  patientName: string;
  genderCode: '1' | '2';
  birthDate: string;
  /** 給付割合。国民健康保険の場合に百分率(%)で記録する (RE 第7項目) */
  benefitRatio?: number;
  /** 別表7 レセプト特記事項コード。最大5つ (RE 第8項目) */
  specialNoteCodes?: string[];
  /**
   * 別表8 一部負担金区分コード (RE 第40項目)。
   * 限度額適用・標準負担額減額認定証等が提示され、高額療養費が現物給付された場合のみ。
   */
  copaymentCategoryCode?: string;
}

/** 別表10 減免区分と、その減額内容 (HO 第11〜13項目) */
export interface DispensingUkeOfficialCopaymentReductionInput {
  code: string;
  /** 「割」単位で減額される場合の減額割合。百分率(%) */
  ratioPercent?: number;
  /** 「円」単位で減額される場合の減額金額 */
  reducedYen?: number;
}

export interface DispensingUkeOfficialInsuranceInput {
  insurerNumber: string;
  symbol?: string;
  number?: string;
  prescriptionCount: number;
  totalPoints: number;
  /** 国民健康保険の一部負担金減額・免除・徴収猶予証明書の証明書番号 (HO 第8項目) */
  certificateNumber?: string;
  /** 一部負担金が必要な場合の当該金額 (HO 第9項目) */
  copaymentYen?: number;
  /** 一部負担金の減免 (HO 第11〜13項目) */
  copaymentReduction?: DispensingUkeOfficialCopaymentReductionInput;
}

export interface DispensingUkeOfficialPublicExpenseInput {
  payerNumber: string;
  recipientNumber: string;
  optionalBenefitCode?: string;
  prescriptionCount: number;
  totalPoints: number;
  /** 公費負担医療に係る患者の一部負担金額 (KO 第7項目) */
  copaymentYen?: number;
  /** 公費給付対象一部負担金 (KO 第9項目) */
  publicBenefitCopaymentYen?: number;
}

export interface DispensingUkeOfficialClaimInput {
  common: DispensingUkeOfficialClaimCommonInput;
  insurances?: DispensingUkeOfficialInsuranceInput[];
  publicExpenses?: DispensingUkeOfficialPublicExpenseInput[];
  bodyRecords: UkeRecord[];
  totalPoints: number;
}

export interface DispensingUkeOfficialFileInput {
  header: DispensingUkeOfficialHeaderInput;
  claims: DispensingUkeOfficialClaimInput[];
}

export interface DispensingUkeOfficialFile {
  fileName: typeof DISPENSING_UKE_OFFICIAL_FILE_NAME;
  records: UkeRecord[];
  totalClaims: number;
  totalPoints: number;
  gate: DispensingUkeOfficialSubmissionGate;
}

function parseCalendarDate(value: string, label: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`${label}はYYYY-MM-DD形式で入力してください。`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error(`${label}に実在する日付を入力してください。`);
  }
  return { year, month, day };
}

export function formatDispensingUkeGregorianDate(value: string, label = '日付'): string {
  const { year, month, day } = parseCalendarDate(value, label);
  return `${String(year).padStart(4, '0')}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

export function formatDispensingUkeGregorianMonth(value: string, label = '年月'): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`${label}はYYYY-MM形式で入力してください。`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`${label}に1から12の月を入力してください。`);
  }

  return `${String(year).padStart(4, '0')}${String(month).padStart(2, '0')}`;
}

function assertDigits(value: string, label: string, lengths?: number[]): void {
  if (!/^\d+$/.test(value) || (lengths && !lengths.includes(value.length))) {
    const suffix = lengths ? `（${lengths.join('桁または')}桁）` : '';
    throw new Error(`${label}は数字${suffix}で入力してください。`);
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label}は0以上の整数で入力してください。`);
  }
}

function assertOfficialField(value: string, label: string): void {
  if (/[",\r\n]/.test(value)) {
    throw new Error(`${label}にはカンマ、引用符、改行を使用できません。`);
  }
}

/**
 * 必須項目だけの配列に、任意項目を項番指定で差し込む。
 *
 * UKE は CSV の位置で項目が決まるので、後ろの任意項目を記録するときは
 * 間の項目を空文字で埋める必要がある。任意項目が何も無ければ配列は伸ばさない
 * (末尾の空項目は省略できるため、既存の出力と1バイトも変わらない)。
 */
function withOptionalFields(
  base: string[],
  optional: Array<{ index: number; value?: string }>
): string[] {
  const populated = optional.filter((item) => item.value !== undefined && item.value !== '');
  if (populated.length === 0) return base;
  const size = Math.max(base.length, ...populated.map((item) => item.index + 1));
  const fields = Array.from({ length: size }, (_, index) => base[index] ?? '');
  for (const item of populated) {
    fields[item.index] = item.value as string;
  }
  return fields;
}

function assertOptionalDigits(value: number | undefined, label: string, maxDigits: number): string | undefined {
  if (value === undefined) return undefined;
  assertNonNegativeInteger(value, label);
  const text = String(value);
  if (text.length > maxDigits) {
    throw new Error(`${label}は${maxDigits}桁以内で入力してください。`);
  }
  return text;
}

function assertRecordFields(record: UkeRecord, label: string): void {
  assertOfficialField(record.type, `${label}のレコード種別`);
  record.fields.forEach((field, index) => assertOfficialField(field, `${label}の第${index + 1}項目`));
}

function buildHeaderRecord(input: DispensingUkeOfficialHeaderInput): UkeRecord {
  assertDigits(input.prefectureCode, '都道府県コード', [2]);
  const prefecture = Number(input.prefectureCode);
  if (prefecture < 1 || prefecture > 47) {
    throw new Error('都道府県コードは01から47で入力してください。');
  }
  assertDigits(input.pharmacyCode, '保険薬局コード', [7]);
  if (!input.pharmacyName.trim()) {
    throw new Error('保険薬局名を入力してください。');
  }
  const volumeId = input.volumeId ?? '00';
  assertDigits(volumeId, 'マルチボリューム識別情報', [2]);

  const record: UkeRecord = {
    type: 'YK',
    fields: [
      input.payerOrganizationCode,
      input.prefectureCode,
      '4',
      input.pharmacyCode,
      input.pharmacyName,
      formatDispensingUkeGregorianMonth(input.claimMonth, '請求年月'),
      volumeId,
      input.phone ?? ''
    ]
  };
  assertRecordFields(record, 'YKレコード');
  return record;
}

function buildClaimCommonRecord(input: DispensingUkeOfficialClaimCommonInput): UkeRecord {
  assertNonNegativeInteger(input.claimNumber, 'レセプト番号');
  if (input.claimNumber < 1) {
    throw new Error('レセプト番号は1以上で入力してください。');
  }
  assertDigits(input.claimTypeCode, 'レセプト種別コード', [4]);
  if (!input.patientName.trim()) {
    throw new Error('患者氏名を入力してください。');
  }

  const benefitRatio = assertOptionalDigits(input.benefitRatio, '給付割合', 3);

  const specialNote = buildSpecialNoteField(input.specialNoteCodes || []);
  if (!specialNote.ok) {
    throw new Error(specialNote.reason);
  }

  let copaymentCategoryCode: string | undefined;
  if (input.copaymentCategoryCode !== undefined && input.copaymentCategoryCode !== '') {
    if (!findDispensingUkeCodeTableEntry(DISPENSING_UKE_COPAYMENT_CATEGORY_CODES, input.copaymentCategoryCode)) {
      throw new Error(`別表8にない一部負担金区分コードです: ${input.copaymentCategoryCode}`);
    }
    copaymentCategoryCode = input.copaymentCategoryCode;
  }

  const record: UkeRecord = {
    type: 'RE',
    fields: withOptionalFields(
      [
        String(input.claimNumber),
        input.claimTypeCode,
        formatDispensingUkeGregorianMonth(input.dispensingMonth, '調剤年月'),
        input.patientName,
        input.genderCode,
        formatDispensingUkeGregorianDate(input.birthDate, '生年月日')
      ],
      [
        { index: 6, value: benefitRatio },
        { index: 7, value: specialNote.value },
        { index: 39, value: copaymentCategoryCode }
      ]
    )
  };
  assertRecordFields(record, `レセプト${input.claimNumber}のREレコード`);
  return record;
}

function buildInsuranceRecord(input: DispensingUkeOfficialInsuranceInput, claimNumber: number): UkeRecord {
  assertDigits(input.insurerNumber, '保険者番号', [6, 8]);
  assertNonNegativeInteger(input.prescriptionCount, '処方箋受付回数');
  assertNonNegativeInteger(input.totalPoints, '保険総点数');
  if (input.certificateNumber !== undefined && input.certificateNumber !== '') {
    assertDigits(input.certificateNumber, '証明書番号', [3]);
  }
  const copaymentYen = assertOptionalDigits(input.copaymentYen, '一部負担金', 8);

  let reductionCode: string | undefined;
  let reductionRatio: string | undefined;
  let reductionYen: string | undefined;
  if (input.copaymentReduction) {
    const reduction = input.copaymentReduction;
    if (!findDispensingUkeCodeTableEntry(DISPENSING_UKE_REDUCTION_CODES, reduction.code)) {
      throw new Error(`別表10にない減免区分コードです: ${reduction.code}`);
    }
    reductionCode = reduction.code;
    reductionRatio = assertOptionalDigits(reduction.ratioPercent, '減額割合', 3);
    if (reductionRatio !== undefined && Number(reductionRatio) > 100) {
      throw new Error('減額割合は百分率(%)で100以下で入力してください。');
    }
    reductionYen = assertOptionalDigits(reduction.reducedYen, '減額金額', 6);
  }

  const record: UkeRecord = {
    type: 'HO',
    fields: withOptionalFields(
      [
        input.insurerNumber,
        input.symbol ?? '',
        input.number ?? '',
        String(input.prescriptionCount),
        String(input.totalPoints)
      ],
      [
        { index: 7, value: input.certificateNumber },
        { index: 8, value: copaymentYen },
        { index: 10, value: reductionCode },
        { index: 11, value: reductionRatio },
        { index: 12, value: reductionYen }
      ]
    )
  };
  assertRecordFields(record, `レセプト${claimNumber}のHOレコード`);
  return record;
}

function buildPublicExpenseRecord(input: DispensingUkeOfficialPublicExpenseInput, claimNumber: number): UkeRecord {
  assertDigits(input.payerNumber, '公費負担者番号', [8]);
  assertDigits(input.recipientNumber, '公費受給者番号', [7]);
  assertNonNegativeInteger(input.prescriptionCount, '公費処方箋受付回数');
  assertNonNegativeInteger(input.totalPoints, '公費総点数');
  const publicCopaymentYen = assertOptionalDigits(input.copaymentYen, '公費の一部負担金額', 8);
  const publicBenefitCopaymentYen = assertOptionalDigits(
    input.publicBenefitCopaymentYen,
    '公費給付対象一部負担金',
    8
  );

  const record: UkeRecord = {
    type: 'KO',
    fields: withOptionalFields(
      [
        input.payerNumber,
        input.recipientNumber,
        input.optionalBenefitCode ?? '',
        String(input.prescriptionCount),
        String(input.totalPoints)
      ],
      [
        { index: 6, value: publicCopaymentYen },
        { index: 8, value: publicBenefitCopaymentYen }
      ]
    )
  };
  assertRecordFields(record, `レセプト${claimNumber}のKOレコード`);
  return record;
}

function validateClaimBody(records: UkeRecord[], claimNumber: number): void {
  if (!records.some((record) => record.type === 'SH' || record.type === 'KI')) {
    throw new Error(`レセプト${claimNumber}にはSHまたはKIレコードが必要です。`);
  }
  for (const record of records) {
    if (!OFFICIAL_CLAIM_BODY_RECORD_TYPES.has(record.type)) {
      throw new Error(`レセプト${claimNumber}に公式提出本文では使用できない${record.type || '空'}レコードがあります。`);
    }
    assertRecordFields(record, `レセプト${claimNumber}の${record.type}レコード`);
  }
}

export function buildDispensingUkeOfficialFile(
  input: DispensingUkeOfficialFileInput
): DispensingUkeOfficialFile {
  if (input.claims.length === 0) {
    throw new Error('公式提出ファイルには1件以上のレセプトが必要です。');
  }

  const records: UkeRecord[] = [buildHeaderRecord(input.header)];
  let totalPoints = 0;
  const claimNumbers = new Set<number>();

  for (const claim of input.claims) {
    const claimNumber = claim.common.claimNumber;
    if (claimNumbers.has(claimNumber)) {
      throw new Error(`レセプト番号${claimNumber}が重複しています。`);
    }
    claimNumbers.add(claimNumber);
    assertNonNegativeInteger(claim.totalPoints, `レセプト${claimNumber}の合計点数`);
    validateClaimBody(claim.bodyRecords, claimNumber);

    records.push(buildClaimCommonRecord(claim.common));
    for (const insurance of claim.insurances ?? []) {
      records.push(buildInsuranceRecord(insurance, claimNumber));
    }
    for (const publicExpense of claim.publicExpenses ?? []) {
      records.push(buildPublicExpenseRecord(publicExpense, claimNumber));
    }
    records.push(...claim.bodyRecords);
    totalPoints += claim.totalPoints;
  }

  records.push({
    type: 'GO',
    fields: [String(input.claims.length), String(totalPoints), '99']
  });

  const gate = buildDispensingUkeOfficialSubmissionGate(records);
  if (!gate.ok) {
    throw new Error(gate.issues.map((issue) => issue.message).join(' '));
  }
  const validationErrors = validateDispensingUkeRecords(records, {
    context: 'official_submission',
    officialSubmission: true,
    recordSpecs: DISPENSING_UKE_OFFICIAL_RECORD_SPEC
  }).filter((issue) => issue.severity === 'error');
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.map((issue) => issue.message).join(' '));
  }

  return {
    fileName: DISPENSING_UKE_OFFICIAL_FILE_NAME,
    records,
    totalClaims: input.claims.length,
    totalPoints,
    gate
  };
}

export function generateDispensingUkeOfficialContent(records: UkeRecord[]): Uint8Array {
  if (records.length === 0) {
    throw new Error('公式提出ファイルには1件以上のレコードが必要です。');
  }
  for (const record of records) {
    assertRecordFields(record, `${record.type || '空'}レコード`);
  }

  const gate = buildDispensingUkeOfficialSubmissionGate(records);
  if (!gate.ok) {
    throw new Error(gate.issues.map((issue) => issue.message).join(' '));
  }

  const content = `${records.map((record) => [record.type, ...record.fields].join(',')).join('\r\n')}\r\n`;
  const unicodeArray = encoding.stringToCode(content);
  const sjisArray = encoding.convert(unicodeArray, {
    to: 'SJIS',
    from: 'UNICODE'
  });
  const roundTrip = encoding.codeToString(encoding.convert(sjisArray, {
    to: 'UNICODE',
    from: 'SJIS'
  }));
  if (roundTrip !== content) {
    throw new Error('Shift-JISで表現できない文字が含まれているため、公式提出ファイルを作成できません。');
  }
  return new Uint8Array([...sjisArray, 0x1a]);
}
