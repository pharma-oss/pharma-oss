import type { Visit, Patient } from '@/db/types';
import type { UkeRecord } from './uke_generator';

/**
 * 日付文字列から YYYYMMDD の西暦8桁数字文字列を取り出す
 */
function calendarDateDigits(value?: string, label = '日付'): string {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    throw new Error(`${label}をYYYY-MM-DD形式で確認してください。`);
  }
  return `${match[1]}${match[2]}${match[3]}`;
}

/**
 * 1日から31日までの日別記録フィールド（31項目）を生成する純粋関数
 */
export function buildOfficialDailyFields(
  values: Record<string, string | number> | undefined,
  padLength?: number
): string[] {
  return Array.from({ length: 31 }, (_, index) => {
    const day = index + 1;
    const value = values?.[String(day).padStart(2, '0')] ?? values?.[String(day)];
    if (value === undefined || value === '') return '';
    const text = String(value);
    return padLength && /^\d+$/.test(text) ? text.padStart(padLength, '0') : text;
  });
}

export interface BuildOfficialSupplementalRecordsInput {
  claimOptions?: Visit['claimOptions'];
  patientName: string;
  hasPayerRecord: boolean;
}

/**
 * 公式 SN（特別公費等補助情報）レコードを条件付きで生成する純粋関数
 * - 設定がない場合は空配列を返す。
 * - HO（主保険）または KO（公費）のいずれも存在しない場合は公式提出不可としてエラーを投げる。
 */
export function buildOfficialSupplementalRecords(
  input: BuildOfficialSupplementalRecordsInput
): UkeRecord[] {
  const records = input.claimOptions?.officialSupplementalRecords ?? [];
  if (records.length === 0) return [];
  if (!input.hasPayerRecord) {
    throw new Error(`${input.patientName} のSN補助情報はHOまたはKOがある受付でだけ公式提出できます。`);
  }

  return records.map((record) => ({
    type: 'SN',
    fields: [
      record.payerCategory,
      record.confirmationCategory,
      record.insurerNumber ?? '',
      record.symbol ?? '',
      record.number ?? '',
      record.branch ?? '',
      record.recipientNumber ?? '',
      record.reserve ?? ''
    ]
  }));
}

export interface BuildOfficialDispensingDateRecordsInput {
  claimOptions?: Visit['claimOptions'];
  patientName: string;
  hasPayerRecord: boolean;
}

/**
 * 公式 JD（日別調剤日情報）レコードを条件付きで生成する純粋関数
 * - 設定がない場合は空配列を返す。
 * - HOまたはKOのいずれも存在しない場合は公式提出不可としてエラーを投げる。
 */
export function buildOfficialDispensingDateRecords(
  input: BuildOfficialDispensingDateRecordsInput
): UkeRecord[] {
  const records = input.claimOptions?.officialDispensingDateRecords ?? [];
  if (records.length === 0) return [];
  if (!input.hasPayerRecord) {
    throw new Error(`${input.patientName} のJD調剤日情報はHOまたはKOがある受付でだけ公式提出できます。`);
  }

  return records.map((record) => ({
    type: 'JD',
    fields: [record.payerCategory, ...buildOfficialDailyFields(record.days)]
  }));
}

export interface BuildOfficialCopaymentRecordsInput {
  claimOptions?: Visit['claimOptions'];
  patientName: string;
  hasPayerRecord: boolean;
}

/**
 * 公式 MF（日別窓口負担額情報）レコードを条件付きで生成する純粋関数
 * - 設定がない場合は空配列を返す。
 * - HOまたはKOのいずれも存在しない場合は公式提出不可としてエラーを投げる。
 */
export function buildOfficialCopaymentRecords(
  input: BuildOfficialCopaymentRecordsInput
): UkeRecord[] {
  const records = input.claimOptions?.officialCopaymentRecords ?? [];
  if (records.length === 0) return [];
  if (!input.hasPayerRecord) {
    throw new Error(`${input.patientName} のMF窓口負担額情報はHOまたはKOがある受付でだけ公式提出できます。`);
  }

  return records.map((record) => ({
    type: 'MF',
    fields: [record.category, ...buildOfficialDailyFields(record.dailyAmounts, 9)]
  }));
}

export interface BuildOfficialSplitDispensingRecordsInput {
  claimOptions?: Visit['claimOptions'];
  defaultPrescriptionDate: string;
  defaultDispensingDate: string;
  defaultDoctorId?: string;
}

/**
 * 公式 ST（分割調剤指示情報）レコードを条件付きで生成する純粋関数
 * - 設定がない場合は空配列を返す。
 * - 医師指示分割調剤の指示内容、処方日、調剤日、分割回数、点数を記録する。
 */
export function buildOfficialSplitDispensingRecords(
  input: BuildOfficialSplitDispensingRecordsInput
): UkeRecord[] {
  return (input.claimOptions?.officialSplitDispensingRecords ?? []).map((record) => {
    const publicTargetPoints = record.publicTargetPoints ?? [];
    const publicAfterSplitPoints = record.publicAfterSplitPoints ?? [];
    const prescriptionDateDigits = calendarDateDigits(
      record.prescriptionDate || input.defaultPrescriptionDate,
      'ST処方月日'
    );
    const dispensingDateDigits = calendarDateDigits(
      record.dispensingDate || input.defaultDispensingDate,
      'ST調剤月日'
    );

    return {
      type: 'ST',
      fields: [
        record.doctorNumber ?? String(input.defaultDoctorId || '1'),
        prescriptionDateDigits,
        dispensingDateDigits,
        String(record.receptionCount ?? 1),
        String(record.splitCount),
        record.insuranceTargetPoints === undefined ? '' : String(record.insuranceTargetPoints),
        record.insuranceAfterSplitPoints === undefined ? '' : String(record.insuranceAfterSplitPoints),
        publicTargetPoints[0] === undefined ? '' : String(publicTargetPoints[0]),
        publicAfterSplitPoints[0] === undefined ? '' : String(publicAfterSplitPoints[0]),
        publicTargetPoints[1] === undefined ? '' : String(publicTargetPoints[1]),
        publicAfterSplitPoints[1] === undefined ? '' : String(publicAfterSplitPoints[1]),
        publicTargetPoints[2] === undefined ? '' : String(publicTargetPoints[2]),
        publicAfterSplitPoints[2] === undefined ? '' : String(publicAfterSplitPoints[2]),
        publicTargetPoints[3] === undefined ? '' : String(publicTargetPoints[3]),
        publicAfterSplitPoints[3] === undefined ? '' : String(publicAfterSplitPoints[3])
      ]
    };
  });
}
