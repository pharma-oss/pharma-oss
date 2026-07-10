import encoding from 'encoding-japanese';
import { formatDispensingUkeGregorianDate } from './dispensing_uke_official';
import type { UkeRecord } from './uke_generator';

export type DispensingUkeOfficialDecimal = string | number;

export interface DispensingUkeOfficialPrescriptionBasicInput {
  dosageFormCode: string;
  usageCode?: string;
  specialInstruction?: string;
  unitDrugPoints: number;
  publicUnitDrugPoints?: Array<number | undefined>;
}

export interface DispensingUkeOfficialDispensingAdditionInput {
  burdenCategory: string;
  code: string;
  points: number;
}

export interface DispensingUkeOfficialDoctorDirectedSplitInput {
  code: string;
  splitCategory: number;
  targetQuantity: number;
  targetIppokaDays?: number;
}

export interface DispensingUkeOfficialDispensingManagementInput {
  burdenCategory: string;
  calculationCategory: string;
  calculationDestinationNumber: number;
  code: string;
  points: number;
}

export interface DispensingUkeOfficialDrugFeeReductionInput {
  reductionCategory: string;
  totalPoints?: number;
  publicPoints?: Array<number | undefined>;
}

export interface DispensingUkeOfficialDispensingInput {
  doctorNumber?: number;
  prescriptionDate: string;
  dispensingDate: string;
  receptionCount: number;
  quantity: number;
  burdenCategory: string;
  calculationCategory: string;
  calculationDestinationNumber: number;
  dispensingFeeCode: string;
  dispensingFeePoints: number;
  splitCategory?: number;
  previousQuantity?: number;
  drugPoints: number;
  additions?: DispensingUkeOfficialDispensingAdditionInput[];
  ippokaDays?: number;
  splitDispensingType?: string;
  previousIppokaDays?: number;
  doctorDirectedSplit?: DispensingUkeOfficialDoctorDirectedSplitInput;
  inclusiveManagementCode?: string;
  otherInstitutionVisitCode?: string;
  outpatientMedicationSupport2?: DispensingUkeOfficialCodePointInput;
  dispensingManagement?: DispensingUkeOfficialDispensingManagementInput;
  dispensingManagementAfterHoursAddition?: DispensingUkeOfficialCodePointInput;
  drugFeeReduction?: DispensingUkeOfficialDrugFeeReductionInput;
}

export interface DispensingUkeOfficialDrugInput {
  burdenCategory: string;
  receiptDrugCode: string;
  amount?: DispensingUkeOfficialDecimal;
  mixingCategoryCode?: string;
  mixingBranchNumber?: string;
  incompatibilityGroup?: string;
  singleDose?: DispensingUkeOfficialDecimal;
}

export interface DispensingUkeOfficialMaterialInput {
  burdenCategory: string;
  materialCode: string;
  amount: DispensingUkeOfficialDecimal;
  unitCode?: string;
  unitPrice?: DispensingUkeOfficialDecimal;
  materialName?: string;
}

export interface DispensingUkeOfficialCommentInput {
  code: string;
  text?: string;
}

export interface DispensingUkeOfficialDispensingGroupInput {
  dispensing: DispensingUkeOfficialDispensingInput;
  drugs?: DispensingUkeOfficialDrugInput[];
  materials?: DispensingUkeOfficialMaterialInput[];
  comments?: DispensingUkeOfficialCommentInput[];
}

export interface DispensingUkeOfficialPrescriptionInput {
  basic: DispensingUkeOfficialPrescriptionBasicInput;
  dispensingGroups: DispensingUkeOfficialDispensingGroupInput[];
}

export interface DispensingUkeOfficialCodePointInput {
  burdenCategory: string;
  code: string;
  points: number;
}

export interface DispensingUkeOfficialCodeCountPointInput extends DispensingUkeOfficialCodePointInput {
  count: number;
}

export interface DispensingUkeOfficialManagementInput {
  calculationDate: string;
  dispensingMonth?: string;
  receptionCount: number;
  baseFee?: DispensingUkeOfficialCodePointInput;
  managementFees?: DispensingUkeOfficialCodeCountPointInput[];
  summaryManagementFees?: DispensingUkeOfficialCodeCountPointInput[];
  previousDispensingDate?: string;
  previousDispensingQuantity?: number;
  baseFeeAdditions?: DispensingUkeOfficialCodeCountPointInput[];
  inclusiveManagementCode?: string;
  otherInstitutionVisitCode?: string;
  doctorDirectedSplitBaseFeeCode?: string;
  doctorDirectedSplitManagementFeeCode?: string;
  doctorDirectedSplitSummaryManagementFeeCode?: string;
}

export interface DispensingUkeOfficialClaimBodyInput {
  prescriptions: DispensingUkeOfficialPrescriptionInput[];
  summaryComments?: DispensingUkeOfficialCommentInput[];
  managementFeeRecords?: DispensingUkeOfficialManagementInput[];
  managementRecords?: UkeRecord[];
}

const KI_MANAGEMENT_FEE_SLOT_COUNT = 12;
const KI_SUMMARY_MANAGEMENT_FEE_SLOT_COUNT = 3;
const KI_BASE_FEE_ADDITION_SLOT_COUNT = 10;
const INCLUSIVE_MANAGEMENT_OMIT_MONTH = '2026-06';

function assertInteger(value: number, label: string, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label}は${min}から${max}の整数で入力してください。`);
  }
}

function assertDigits(value: string, label: string, minLength: number, maxLength = minLength): void {
  if (!/^\d+$/.test(value) || value.length < minLength || value.length > maxLength) {
    const length = minLength === maxLength ? `${minLength}桁` : `${minLength}〜${maxLength}桁`;
    throw new Error(`${label}は${length}の数字で入力してください。`);
  }
}

function assertBurdenCategory(value: string, label: string): void {
  if (!/^[0-9A-Za-z]$/.test(value)) {
    throw new Error(`${label}は1桁の英数字で入力してください。`);
  }
}

function assertOfficialText(value: string, label: string, maxBytes: number): void {
  if (/[",\r\n]/.test(value)) {
    throw new Error(`${label}にはカンマ、引用符、改行を使用できません。`);
  }
  const unicode = encoding.stringToCode(value);
  const sjis = encoding.convert(unicode, { to: 'SJIS', from: 'UNICODE' });
  const roundTrip = encoding.codeToString(encoding.convert(sjis, { to: 'UNICODE', from: 'SJIS' }));
  if (roundTrip !== value) {
    throw new Error(`${label}にShift-JISで表現できない文字が含まれています。`);
  }
  if (sjis.length > maxBytes) {
    throw new Error(`${label}はShift-JISで${maxBytes}バイト以内にしてください。`);
  }
}

function formatDecimal(
  value: DispensingUkeOfficialDecimal | undefined,
  label: string,
  integerDigits: number,
  fractionDigits: number,
  required: boolean
): string {
  if (value === undefined || value === '') {
    if (required) throw new Error(`${label}を入力してください。`);
    return '';
  }
  const text = typeof value === 'number' ? String(value) : value;
  const pattern = new RegExp(`^\\d{1,${integerDigits}}(?:\\.\\d{1,${fractionDigits}})?$`);
  if (!pattern.test(text)) {
    throw new Error(`${label}は整数部${integerDigits}桁、小数部${fractionDigits}桁以内の数字で入力してください。`);
  }
  return text.replace(/\.0+$/, '');
}

function trimTrailingEmptyFields(fields: string[]): string[] {
  let last = fields.length - 1;
  while (last >= 0 && fields[last] === '') last -= 1;
  return fields.slice(0, last + 1);
}

function formatGregorianDateDigits(value: string, label: string): string {
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
  return `${match[1]}${match[2]}${match[3]}`;
}

function normalizeGregorianMonth(value: string, label: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`${label}はYYYY-MM形式で入力してください。`);
  }
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`${label}に1から12の月を入力してください。`);
  }
  return value;
}

function monthFromGregorianDateDigits(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}`;
}

function monthFromCalendarDate(value: string, label: string): string {
  return monthFromGregorianDateDigits(formatGregorianDateDigits(value, label));
}

function buildPrescriptionBasicRecord(
  input: DispensingUkeOfficialPrescriptionBasicInput,
  prescriptionNumber: number
): UkeRecord {
  assertDigits(input.dosageFormCode, '剤形コード', 1);
  if (input.usageCode) assertDigits(input.usageCode, '用法コード', 1, 3);
  if (input.specialInstruction) assertOfficialText(input.specialInstruction, '特別指示', 80);
  assertInteger(input.unitDrugPoints, '単位薬剤料', 0, 9_999_999);
  const publicPoints = input.publicUnitDrugPoints ?? [];
  if (publicPoints.length > 4) {
    throw new Error('公費単位薬剤料は第四公費まで入力できます。');
  }
  for (let index = 0; index < publicPoints.length; index += 1) {
    const points = publicPoints[index];
    if (points !== undefined) assertInteger(points, `第${index + 1}公費単位薬剤料`, 0, 9_999_999);
  }

  return {
    type: 'SH',
    fields: trimTrailingEmptyFields([
      String(prescriptionNumber).padStart(2, '0'),
      input.dosageFormCode,
      input.usageCode ?? '',
      input.specialInstruction ?? '',
      String(input.unitDrugPoints),
      ...Array.from({ length: 4 }, (_, index) => {
        const points = publicPoints[index];
        return points === undefined ? '' : String(points);
      })
    ])
  };
}

function validateCodePoint(input: DispensingUkeOfficialCodePointInput, label: string): void {
  assertBurdenCategory(input.burdenCategory, `${label}の負担区分`);
  assertDigits(input.code, `${label}コード`, 9);
  assertInteger(input.points, `${label}点数`, 0, 9_999);
}

function buildOptionalCodePointFields(
  input: DispensingUkeOfficialCodePointInput | undefined,
  label: string
): string[] {
  if (!input) return ['', '', ''];
  validateCodePoint(input, label);
  return [input.burdenCategory, input.code, String(input.points)];
}

function buildDrugFeeReductionFields(input: DispensingUkeOfficialDrugFeeReductionInput | undefined): string[] {
  if (!input) return ['', '', '', '', '', ''];

  assertDigits(input.reductionCategory, '薬剤料減算の減算区分', 1, 2);
  if (input.totalPoints !== undefined) {
    assertInteger(input.totalPoints, '薬剤料減算の合計点数', 0, 9_999_999);
  }
  const publicPoints = input.publicPoints ?? [];
  if (publicPoints.length > 4) {
    throw new Error('薬剤料減算の公費点数は第四公費まで入力できます。');
  }
  for (let index = 0; index < publicPoints.length; index += 1) {
    const points = publicPoints[index];
    if (points !== undefined) {
      assertInteger(points, `薬剤料減算の第${index + 1}公費点数`, 0, 9_999_999);
    }
  }

  return [
    input.reductionCategory,
    input.totalPoints === undefined ? '' : String(input.totalPoints),
    ...Array.from({ length: 4 }, (_, index) => {
      const points = publicPoints[index];
      return points === undefined ? '' : String(points);
    })
  ];
}

function buildDispensingRecord(input: DispensingUkeOfficialDispensingInput): UkeRecord {
  if (input.doctorNumber !== undefined) assertInteger(input.doctorNumber, '医師番号', 1, 99);
  assertInteger(input.receptionCount, '処方箋受付回', 0, 99);
  assertInteger(input.quantity, '調剤数量', 1, 999);
  assertBurdenCategory(input.burdenCategory, '調剤料の負担区分');
  assertDigits(input.calculationCategory, '算定区分', 1);
  assertInteger(input.calculationDestinationNumber, '算定先No', 0, 99);
  assertDigits(input.dispensingFeeCode, '調剤料コード', 9);
  assertInteger(input.dispensingFeePoints, '調剤料点数', 0, 9_999);
  if (input.splitCategory !== undefined) assertInteger(input.splitCategory, '分割区分', 1, 9);
  if (input.previousQuantity !== undefined) assertInteger(input.previousQuantity, '前回までの数量', 1, 999);
  assertInteger(input.drugPoints, '薬剤料点数', 0, 9_999_999);

  const additions = input.additions ?? [];
  if (additions.length > 10) {
    throw new Error('調剤料加算は10種類まで入力できます。');
  }
  for (const addition of additions) {
    assertBurdenCategory(addition.burdenCategory, '調剤料加算の負担区分');
    assertDigits(addition.code, '調剤料加算コード', 9);
    assertInteger(addition.points, '調剤料加算点数', 0, 9_999);
  }
  if (input.ippokaDays !== undefined) assertInteger(input.ippokaDays, '一包化日数', 1, 999);
  if (input.splitDispensingType) assertDigits(input.splitDispensingType, '分割調剤種類', 1);
  if (input.previousIppokaDays !== undefined) assertInteger(input.previousIppokaDays, '前回までの一包化日数', 1, 999);
  const dispensingMonth = monthFromCalendarDate(input.dispensingDate, '調剤月日');

  if (input.doctorDirectedSplit) {
    assertDigits(input.doctorDirectedSplit.code, '医師指示分割調剤コード', 9);
    assertInteger(input.doctorDirectedSplit.splitCategory, '医師指示分割調剤の分割区分', 1, 99);
    assertInteger(input.doctorDirectedSplit.targetQuantity, '医師指示分割調剤の分割対象調剤数量', 1, 999);
    if (input.doctorDirectedSplit.targetIppokaDays !== undefined) {
      assertInteger(input.doctorDirectedSplit.targetIppokaDays, '医師指示分割調剤の分割対象一包化日数', 1, 999);
    }
  }
  if (input.inclusiveManagementCode) {
    if (dispensingMonth >= INCLUSIVE_MANAGEMENT_OMIT_MONTH) {
      throw new Error('包括管理料等は令和8年6月調剤以降分では記録を省略してください。');
    }
    assertDigits(input.inclusiveManagementCode, '包括管理料等コード', 1, 2);
  }
  if (input.otherInstitutionVisitCode) {
    assertDigits(input.otherInstitutionVisitCode, '他医療機関受診コード', 1, 2);
  }
  if (input.outpatientMedicationSupport2) validateCodePoint(input.outpatientMedicationSupport2, '外来服薬支援料2');
  if (input.dispensingManagement) {
    assertBurdenCategory(input.dispensingManagement.burdenCategory, '調剤管理料の負担区分');
    assertDigits(input.dispensingManagement.calculationCategory, '調剤管理料の算定区分', 1);
    assertInteger(input.dispensingManagement.calculationDestinationNumber, '調剤管理料の算定先No', 0, 99);
    assertDigits(input.dispensingManagement.code, '調剤管理料コード', 9);
    assertInteger(input.dispensingManagement.points, '調剤管理料点数', 0, 9_999);
  }
  if (input.dispensingManagementAfterHoursAddition) {
    validateCodePoint(input.dispensingManagementAfterHoursAddition, '調剤管理料時間外等加算');
  }

  const additionFields = Array.from({ length: 10 }, (_, index) => {
    const addition = additions[index];
    return addition
      ? [addition.burdenCategory, addition.code, String(addition.points)]
      : ['', '', ''];
  }).flat();
  const doctorDirectedSplitFields = input.doctorDirectedSplit
    ? [
        input.doctorDirectedSplit.code,
        String(input.doctorDirectedSplit.splitCategory),
        String(input.doctorDirectedSplit.targetQuantity),
        input.doctorDirectedSplit.targetIppokaDays === undefined
          ? ''
          : String(input.doctorDirectedSplit.targetIppokaDays)
      ]
    : ['', '', '', ''];
  const dispensingManagementFields = input.dispensingManagement
    ? [
        input.dispensingManagement.burdenCategory,
        input.dispensingManagement.calculationCategory,
        String(input.dispensingManagement.calculationDestinationNumber).padStart(2, '0'),
        input.dispensingManagement.code,
        String(input.dispensingManagement.points)
      ]
    : ['', '', '', '', ''];

  return {
    type: 'CZ',
    fields: trimTrailingEmptyFields([
      input.doctorNumber === undefined ? '' : String(input.doctorNumber),
      formatDispensingUkeGregorianDate(input.prescriptionDate, '処方箋交付年月日'),
      formatDispensingUkeGregorianDate(input.dispensingDate, '調剤年月日'),
      String(input.receptionCount),
      String(input.quantity),
      input.burdenCategory,
      input.calculationCategory,
      String(input.calculationDestinationNumber).padStart(2, '0'),
      input.dispensingFeeCode,
      String(input.dispensingFeePoints),
      input.splitCategory === undefined ? '' : String(input.splitCategory),
      input.previousQuantity === undefined ? '' : String(input.previousQuantity),
      String(input.drugPoints),
      '',
      ...additionFields,
      input.ippokaDays === undefined ? '' : String(input.ippokaDays),
      input.splitDispensingType ?? '',
      input.previousIppokaDays === undefined ? '' : String(input.previousIppokaDays),
      ...doctorDirectedSplitFields,
      input.inclusiveManagementCode ?? '',
      input.otherInstitutionVisitCode ?? '',
      ...buildOptionalCodePointFields(input.outpatientMedicationSupport2, '外来服薬支援料2'),
      ...dispensingManagementFields,
      ...buildOptionalCodePointFields(input.dispensingManagementAfterHoursAddition, '調剤管理料時間外等加算'),
      ...buildDrugFeeReductionFields(input.drugFeeReduction)
    ])
  };
}

function buildDrugRecord(input: DispensingUkeOfficialDrugInput): UkeRecord {
  assertBurdenCategory(input.burdenCategory, '医薬品の負担区分');
  assertDigits(input.receiptDrugCode, 'レセ電医薬品コード', 9);
  if (input.mixingCategoryCode) assertDigits(input.mixingCategoryCode, '混合区分コード', 1);
  if (input.mixingBranchNumber) assertDigits(input.mixingBranchNumber, '混合区分枝番', 1);
  if (input.incompatibilityGroup) assertDigits(input.incompatibilityGroup, '配合不適区分', 1);

  return {
    type: 'IY',
    fields: trimTrailingEmptyFields([
      input.burdenCategory,
      input.receiptDrugCode,
      formatDecimal(input.amount, '医薬品使用量', 5, 5, false),
      '',
      '',
      input.mixingCategoryCode ?? '',
      input.mixingBranchNumber ?? '',
      input.incompatibilityGroup ?? '',
      formatDecimal(input.singleDose, '医薬品1回用量', 5, 5, false)
    ])
  };
}

function buildMaterialRecord(input: DispensingUkeOfficialMaterialInput): UkeRecord {
  assertBurdenCategory(input.burdenCategory, '特定器材の負担区分');
  assertDigits(input.materialCode, '特定器材コード', 9);
  if (input.unitCode) assertDigits(input.unitCode, '特定器材単位コード', 1, 3);
  if (input.materialName) assertOfficialText(input.materialName, '特定器材名称', 40);

  return {
    type: 'TO',
    fields: trimTrailingEmptyFields([
      input.burdenCategory,
      input.materialCode,
      formatDecimal(input.amount, '特定器材使用量', 5, 3, true),
      input.unitCode ?? '',
      formatDecimal(input.unitPrice, '特定器材単価', 8, 2, false),
      input.materialName ?? ''
    ])
  };
}

function buildCommentRecord(type: 'CO' | 'TK', input: DispensingUkeOfficialCommentInput): UkeRecord {
  assertDigits(input.code, `${type}コメントコード`, 9);
  if (input.text) assertOfficialText(input.text, `${type}文字データ`, 76);
  return { type, fields: trimTrailingEmptyFields([input.code, input.text ?? '']) };
}

function buildCodeCountPointFields(
  items: DispensingUkeOfficialCodeCountPointInput[] | undefined,
  slotCount: number,
  label: string
): string[] {
  const values = items ?? [];
  if (values.length > slotCount) {
    throw new Error(`${label}は${slotCount}種類まで入力できます。`);
  }

  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    const itemLabel = `${label}${index + 1}`;
    assertBurdenCategory(item.burdenCategory, `${itemLabel}の負担区分`);
    assertDigits(item.code, `${itemLabel}のコード`, 9);
    assertInteger(item.count, `${itemLabel}の回数`, 1, 999);
    assertInteger(item.points, `${itemLabel}の点数`, 0, 9_999);
  }

  return Array.from({ length: slotCount }, (_, index) => {
    const item = values[index];
    return item
      ? [item.burdenCategory, item.code, String(item.count), String(item.points)]
      : ['', '', '', ''];
  }).flat();
}

function hasManagementFeeContent(input: DispensingUkeOfficialManagementInput): boolean {
  return Boolean(
    input.baseFee
    || (input.managementFees?.length ?? 0) > 0
    || (input.summaryManagementFees?.length ?? 0) > 0
    || (input.baseFeeAdditions?.length ?? 0) > 0
    || input.inclusiveManagementCode
    || input.otherInstitutionVisitCode
    || input.doctorDirectedSplitBaseFeeCode
    || input.doctorDirectedSplitManagementFeeCode
    || input.doctorDirectedSplitSummaryManagementFeeCode
  );
}

function buildManagementFeeRecord(input: DispensingUkeOfficialManagementInput): UkeRecord {
  const calculationDate = formatGregorianDateDigits(input.calculationDate, 'KI算定日');
  const dispensingMonth = input.dispensingMonth
    ? normalizeGregorianMonth(input.dispensingMonth, 'KI調剤年月')
    : monthFromGregorianDateDigits(calculationDate);

  assertInteger(input.receptionCount, 'KI処方箋受付回', 0, 99);
  if (!hasManagementFeeContent(input)) {
    throw new Error('KIレコードには調剤基本料、薬学管理料、加算など少なくとも1つの算定内容が必要です。');
  }

  const baseFee = input.baseFee;
  if (baseFee) {
    assertBurdenCategory(baseFee.burdenCategory, '調剤基本料の負担区分');
    assertDigits(baseFee.code, '調剤基本料コード', 9);
    assertInteger(baseFee.points, '調剤基本料点数', 0, 9_999);
  }

  const previousDispensingDate = input.previousDispensingDate
    ? formatGregorianDateDigits(input.previousDispensingDate, '前回調剤年月日')
    : '';
  if (input.previousDispensingQuantity !== undefined) {
    assertInteger(input.previousDispensingQuantity, '前回調剤数量', 1, 999);
  }

  if (input.inclusiveManagementCode) {
    if (dispensingMonth >= INCLUSIVE_MANAGEMENT_OMIT_MONTH) {
      throw new Error('包括管理料等は令和8年6月調剤以降分では記録を省略してください。');
    }
    assertDigits(input.inclusiveManagementCode, '包括管理料等コード', 1, 2);
  }
  if (input.otherInstitutionVisitCode) {
    assertDigits(input.otherInstitutionVisitCode, '他医療機関受診コード', 1, 2);
  }
  if (input.doctorDirectedSplitBaseFeeCode) {
    assertDigits(input.doctorDirectedSplitBaseFeeCode, '医師指示分割調剤の調剤基本料コード', 9);
  }
  if (input.doctorDirectedSplitManagementFeeCode) {
    assertDigits(input.doctorDirectedSplitManagementFeeCode, '医師指示分割調剤の薬学管理料コード', 9);
  }
  if (input.doctorDirectedSplitSummaryManagementFeeCode) {
    assertDigits(input.doctorDirectedSplitSummaryManagementFeeCode, '医師指示分割調剤の摘要薬学管理料コード', 9);
  }

  return {
    type: 'KI',
    fields: trimTrailingEmptyFields([
      calculationDate,
      String(input.receptionCount),
      ...(baseFee ? [baseFee.burdenCategory, baseFee.code, String(baseFee.points), ''] : ['', '', '', '']),
      ...buildCodeCountPointFields(input.managementFees, KI_MANAGEMENT_FEE_SLOT_COUNT, '薬学管理料'),
      ...buildCodeCountPointFields(input.summaryManagementFees, KI_SUMMARY_MANAGEMENT_FEE_SLOT_COUNT, '摘要薬学管理料'),
      previousDispensingDate,
      input.previousDispensingQuantity === undefined ? '' : String(input.previousDispensingQuantity),
      ...buildCodeCountPointFields(input.baseFeeAdditions, KI_BASE_FEE_ADDITION_SLOT_COUNT, '調剤基本料加算'),
      input.inclusiveManagementCode ?? '',
      input.otherInstitutionVisitCode ?? '',
      input.doctorDirectedSplitBaseFeeCode ?? '',
      input.doctorDirectedSplitManagementFeeCode ?? '',
      input.doctorDirectedSplitSummaryManagementFeeCode ?? ''
    ])
  };
}

function validateManagementRecord(record: UkeRecord): void {
  if (record.type !== 'KI') {
    throw new Error(`基本料・薬学管理料情報にはKIレコードだけを指定できます（${record.type || '空'}）。`);
  }
  if (record.fields.length > 113) {
    throw new Error('KIレコードは113項目以内で入力してください。');
  }
  for (let index = 0; index < record.fields.length; index += 1) {
    assertOfficialText(record.fields[index], `KI第${index + 1}項目`, 2_000);
  }
}

export function buildDispensingUkeOfficialClaimBody(
  input: DispensingUkeOfficialClaimBodyInput
): UkeRecord[] {
  if (
    input.prescriptions.length === 0
    && (input.managementFeeRecords?.length ?? 0) === 0
    && (input.managementRecords?.length ?? 0) === 0
  ) {
    throw new Error('公式提出用の請求本文には処方情報またはKIレコードが必要です。');
  }

  const records: UkeRecord[] = [];
  for (let prescriptionIndex = 0; prescriptionIndex < input.prescriptions.length; prescriptionIndex += 1) {
    const prescription = input.prescriptions[prescriptionIndex];
    const prescriptionNumber = prescriptionIndex + 1;
    if (prescriptionNumber > 99) {
      throw new Error('処方情報は99件まで生成できます。');
    }
    if (prescription.dispensingGroups.length === 0) {
      throw new Error(`処方${prescriptionNumber}に調剤情報がありません。`);
    }

    records.push(buildPrescriptionBasicRecord(prescription.basic, prescriptionNumber));
    for (const group of prescription.dispensingGroups) {
      records.push(buildDispensingRecord(group.dispensing));
      for (const drug of group.drugs ?? []) records.push(buildDrugRecord(drug));
      for (const material of group.materials ?? []) records.push(buildMaterialRecord(material));
      for (const comment of group.comments ?? []) records.push(buildCommentRecord('CO', comment));
    }
  }

  for (const comment of input.summaryComments ?? []) records.push(buildCommentRecord('TK', comment));
  for (const managementFee of input.managementFeeRecords ?? []) records.push(buildManagementFeeRecord(managementFee));
  for (const record of input.managementRecords ?? []) {
    validateManagementRecord(record);
    records.push(record);
  }
  return records;
}
