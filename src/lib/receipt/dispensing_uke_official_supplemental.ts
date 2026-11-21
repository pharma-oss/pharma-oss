import encoding from 'encoding-japanese';
import type { Visit } from '@/db/types';
import {
  formatReceiptInterventionSummary,
  normalizeVisitInterventionEvents,
  type LegacyInterventionLike
} from '@/lib/prescription_intervention_support';
import type { DispensingUkeOfficialCommentInput } from './dispensing_uke_official_body';
import type { UkeRecord } from './uke_generator';

/** 支払基金 調剤レセプト電算処理システム 標準フリーコメントコード（CO / TK 共通） */
export const OFFICIAL_FREE_TEXT_COMMENT_CODE = '810000001';
/** 公式 CO / TK レコードの文字データ上限（Shift-JIS 76バイト = 全角38文字） */
export const OFFICIAL_COMMENT_MAX_SJIS_BYTES = 76;

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

function toOfficialShiftJisChar(char: string): { text: string; byteLength: number } {
  const unicode = encoding.stringToCode(char);
  const sjis = encoding.convert(unicode, { to: 'SJIS', from: 'UNICODE' });
  const roundTrip = encoding.codeToString(encoding.convert(sjis, { to: 'UNICODE', from: 'SJIS' }));
  if (roundTrip === char && sjis.length > 0) {
    return { text: char, byteLength: sjis.length };
  }
  return { text: '・', byteLength: 2 };
}

/**
 * 自由記載コメントを公式 UKE（CO / TK）の制約（カンマ・引用符・改行不可、Shift-JIS 表現可能、76バイト以内）
 * を満たすチャンク配列へ安全に整形・分割する純粋関数。
 */
export function sanitizeAndChunkOfficialCommentText(
  rawText: string,
  maxSjisBytes = OFFICIAL_COMMENT_MAX_SJIS_BYTES
): string[] {
  const normalized = (rawText || '')
    .replace(/,/g, '、')
    .replace(/"/g, '”')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const char of Array.from(normalized)) {
    const safe = toOfficialShiftJisChar(char);
    if (currentBytes + safe.byteLength > maxSjisBytes && current.length > 0) {
      const trimmed = current.trim();
      if (trimmed) chunks.push(trimmed);
      current = safe.text.trimStart();
      currentBytes = current ? safe.byteLength : 0;
    } else {
      current += safe.text;
      currentBytes += safe.byteLength;
    }
  }

  const tail = current.trim();
  if (tail) chunks.push(tail);
  return chunks;
}

export interface BuildOfficialInterventionCommentsInput {
  visit: Partial<Visit>;
  legacyInterventions?: LegacyInterventionLike[];
}

/**
 * トラック F-2: 構造化疑義照会・処方変更イベント（visit.interventionEvents / 互換レガシー配列）から
 * 公式 UKE の CO / TK コメント入力配列（810000001・Shift-JIS 76バイト分割・重複排除）を生成する純粋関数。
 */
export function buildOfficialInterventionComments(
  input: BuildOfficialInterventionCommentsInput
): DispensingUkeOfficialCommentInput[] {
  const events = normalizeVisitInterventionEvents(input.visit, input.legacyInterventions);
  if (events.length === 0) return [];

  const comments: DispensingUkeOfficialCommentInput[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    if (event.inquiryStatus === 'cancelled') continue;
    const summary = formatReceiptInterventionSummary(event);
    const chunks = sanitizeAndChunkOfficialCommentText(summary, OFFICIAL_COMMENT_MAX_SJIS_BYTES);
    for (const chunk of chunks) {
      const dedupeKey = `${OFFICIAL_FREE_TEXT_COMMENT_CODE}\0${chunk}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      comments.push({
        code: OFFICIAL_FREE_TEXT_COMMENT_CODE,
        text: chunk
      });
    }
  }

  return comments;
}
