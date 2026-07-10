import encoding from 'encoding-japanese';
import {
  buildDispensingUkeAllFieldValidationReport,
  DISPENSING_UKE_IMPLEMENTED_RECORD_SPEC,
  DISPENSING_UKE_KNOWN_RECORD_SPEC,
  DISPENSING_UKE_RECORD_SPEC_SOURCE,
  validateDispensingUkeRecords,
  type DispensingUkeAllFieldValidationReport,
  type DispensingUkeRecordSpec,
  type DispensingUkeValidationIssue
} from './dispensing_uke_validation';
import type { UkeRecord } from './uke_generator';

export interface DispensingUkeOfficialSampleZipEntry {
  fileName: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
}

export interface DispensingUkeOfficialSampleRecodeInfoFile {
  fileName: string;
  text: string;
  recordCount: number;
}

export interface DispensingUkeOfficialSampleValidationOptions {
  recordSpecs?: DispensingUkeRecordSpec[];
}

export interface DispensingUkeOfficialSampleRecord {
  sourceFileName: string;
  lineNumber: number;
  claimSerial: string;
  rowSerial: string;
  recordStatus: string;
  recordType: string;
  fields: string[];
  rawFields: string[];
}

export interface DispensingUkeOfficialSampleZipExtraction {
  entries: DispensingUkeOfficialSampleZipEntry[];
  recodeInfoFiles: DispensingUkeOfficialSampleRecodeInfoFile[];
  records: DispensingUkeOfficialSampleRecord[];
  issues: string[];
}

export interface DispensingUkeOfficialSampleReview {
  ok: boolean;
  sourceLabel: string;
  sourceUrl: string;
  zipEntryCount: number;
  recodeInfoFileCount: number;
  recordCount: number;
  claimCount: number;
  officialRecordTypes: string[];
  implementedRecordTypes: string[];
  knownRecordTypes: string[];
  supportedOfficialRecordTypes: string[];
  unsupportedOfficialRecordTypes: string[];
  validationOnlyOfficialRecordTypes: string[];
  implementedRecordTypesNotObserved: string[];
  requiredImplementedRecordTypesNotObserved: string[];
  validationIssueCount: number;
  validationErrorCount: number;
  validationWarningCount: number;
  allFieldValidationReport: DispensingUkeAllFieldValidationReport;
  parseIssues: string[];
}

export interface DispensingUkeOfficialSampleGenerationReadinessReason {
  recordType: string;
  reason: string;
}

export interface DispensingUkeOfficialSampleGenerationReadiness {
  ok: boolean;
  sourceLabel: string;
  sourceUrl: string;
  observedOfficialRecordTypes: string[];
  generatedRecordTypes: string[];
  validationOnlyRecordTypes: string[];
  generationReadyOfficialRecordTypes: string[];
  generationGapRecordTypes: string[];
  unsupportedOfficialRecordTypes: string[];
  unobservedGeneratedRecordTypes: string[];
  requiredGeneratedRecordTypesNotObserved: string[];
  validationIssueCount: number;
  validationErrorCount: number;
  validationWarningCount: number;
  parseIssueCount: number;
  blockingReasons: DispensingUkeOfficialSampleGenerationReadinessReason[];
}

export type DispensingUkeOfficialSampleUnobservedReasonStatus = 'reviewed' | 'needs_review';

export interface DispensingUkeOfficialSampleUnobservedGeneratedRecordReviewItem {
  recordType: string;
  recordLabel: string;
  implementationScope: DispensingUkeRecordSpec['implementationScope'];
  implementationScopeLabel: string;
  status: DispensingUkeOfficialSampleUnobservedReasonStatus;
  statusLabel: string;
  reason: string;
  nextAction: string;
  doneCriteria: string[];
}

export interface DispensingUkeOfficialSampleUnobservedGeneratedRecordReview {
  ok: boolean;
  sourceLabel: string;
  sourceUrl: string;
  totalCount: number;
  reviewedCount: number;
  needsReviewCount: number;
  recordTypes: string[];
  reviewedRecordTypes: string[];
  needsReviewRecordTypes: string[];
  items: DispensingUkeOfficialSampleUnobservedGeneratedRecordReviewItem[];
}

export interface DispensingUkeOfficialSampleFieldProfile {
  fieldNumber: number;
  observedCount: number;
  nonBlankCount: number;
  digitOnlyCount: number;
  monthLikeCount: number;
  dateLikeCount: number;
  timestampLikeCount: number;
  maxCharacterLength: number;
  maxShiftJisByteLength: number;
}

export interface DispensingUkeOfficialSampleRecordTypeProfile {
  recordType: string;
  recordCount: number;
  claimCount: number;
  sourceFileCount: number;
  minFieldCount: number;
  maxFieldCount: number;
  nonBlankFieldNumbers: number[];
  recordStatusCodes: string[];
  firstSeen: {
    sourceFileName: string;
    lineNumber: number;
  };
  fields: DispensingUkeOfficialSampleFieldProfile[];
}

export interface DispensingUkeOfficialSampleRecordProfileReport {
  sourceLabel: string;
  sourceUrl: string;
  recordCount: number;
  claimCount: number;
  recordTypeCount: number;
  maxFieldCount: number;
  recordTypeProfiles: DispensingUkeOfficialSampleRecordTypeProfile[];
}

export type DispensingUkeRecordProfileFieldCountStatus =
  | 'match'
  | 'generated_shorter'
  | 'generated_longer'
  | 'official_only'
  | 'generated_only';

export interface DispensingUkeRecordProfileComparisonItem {
  recordType: string;
  fieldCountStatus: DispensingUkeRecordProfileFieldCountStatus;
  officialRecordCount: number;
  generatedRecordCount: number;
  officialMinFieldCount?: number;
  officialMaxFieldCount?: number;
  generatedMinFieldCount?: number;
  generatedMaxFieldCount?: number;
  officialNonBlankFieldNumbers: number[];
  generatedNonBlankFieldNumbers: number[];
  missingGeneratedNonBlankFieldNumbers: number[];
  extraGeneratedNonBlankFieldNumbers: number[];
}

export interface DispensingUkeRecordProfileComparisonReport {
  ok: boolean;
  officialSourceLabel: string;
  generatedSourceLabel: string;
  comparedRecordTypes: string[];
  matchingRecordTypes: string[];
  officialOnlyRecordTypes: string[];
  generatedOnlyRecordTypes: string[];
  fieldCountMismatchRecordTypes: string[];
  nonBlankMismatchRecordTypes: string[];
  issueCount: number;
  items: DispensingUkeRecordProfileComparisonItem[];
}

export interface DispensingUkeOfficialSampleConditionalRecordAlignmentReview {
  ok: boolean;
  recordType: string;
  recordLabel: string;
  officialSourceLabel: string;
  generatedSourceLabel: string;
  statusLabel: string;
  officialRecordCount: number;
  generatedRecordCount: number;
  fieldCountStatus: DispensingUkeRecordProfileFieldCountStatus;
  officialMinFieldCount?: number;
  officialMaxFieldCount?: number;
  generatedMinFieldCount?: number;
  generatedMaxFieldCount?: number;
  officialNonBlankFieldNumbers: number[];
  generatedNonBlankFieldNumbers: number[];
  missingGeneratedNonBlankFieldNumbers: number[];
  extraGeneratedNonBlankFieldNumbers: number[];
  issues: string[];
}

export type DispensingUkeRecordProfileGapCategory =
  | 'official_only'
  | 'generated_only'
  | 'generated_shorter'
  | 'generated_extra_fields_need_spec_review'
  | 'generated_empty_tail_only'
  | 'non_blank_shape_mismatch';

export type DispensingUkeRecordProfileGapPriority = 'critical' | 'high' | 'medium' | 'low';

export interface DispensingUkeRecordProfileGapItem {
  recordType: string;
  category: DispensingUkeRecordProfileGapCategory;
  severity: 'blocker' | 'review';
  priority: DispensingUkeRecordProfileGapPriority;
  fieldNumbers: number[];
  message: string;
  nextAction: string;
}

export interface DispensingUkeRecordProfileGapReview {
  ok: boolean;
  blockerCount: number;
  reviewCount: number;
  criticalRecordTypes: string[];
  highRecordTypes: string[];
  mediumRecordTypes: string[];
  lowRecordTypes: string[];
  officialOnlyRecordTypes: string[];
  generatedOnlyRecordTypes: string[];
  generatedShorterRecordTypes: string[];
  generatedExtraNeedsSpecReviewRecordTypes: string[];
  generatedEmptyTailOnlyRecordTypes: string[];
  nonBlankMismatchRecordTypes: string[];
  items: DispensingUkeRecordProfileGapItem[];
}

export interface DispensingUkeRecordProfileGapChecklistItem {
  id: string;
  recordType: string;
  category: DispensingUkeRecordProfileGapCategory;
  categoryLabel: string;
  priority: DispensingUkeRecordProfileGapPriority;
  priorityLabel: string;
  fieldNumbers: number[];
  fieldLabel: string;
  checkTarget: string;
  reason: string;
  action: string;
  doneCriteria: string[];
}

export interface DispensingUkeRecordProfileGapChecklist {
  ok: boolean;
  totalCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  recordTypesByHighestPriority: Record<DispensingUkeRecordProfileGapPriority, string[]>;
  items: DispensingUkeRecordProfileGapChecklistItem[];
}

export type DispensingUkeRecordProfileGapProgressStatus =
  | 'unreviewed'
  | 'checking'
  | 'generation_rule_needed'
  | 'sample_variation'
  | 'no_change_needed';

export interface DispensingUkeRecordProfileGapConfirmation {
  checklistItemId: string;
  status: Exclude<DispensingUkeRecordProfileGapProgressStatus, 'unreviewed'>;
  evidenceLabel: string;
  reviewer?: string;
  reviewedAt?: string;
  note?: string;
}

export interface DispensingUkeRecordProfileGapProgressItem {
  id: string;
  recordType: string;
  categoryLabel: string;
  priority: DispensingUkeRecordProfileGapPriority;
  priorityLabel: string;
  fieldLabel: string;
  status: DispensingUkeRecordProfileGapProgressStatus;
  statusLabel: string;
  evidenceLabel: string;
  reviewer: string;
  reviewedAt: string;
  note: string;
  action: string;
  blocksCriticalPath: boolean;
  readyForImplementation: boolean;
}

export interface DispensingUkeRecordProfileGapProgressReview {
  ok: boolean;
  totalCount: number;
  decidedCount: number;
  unreviewedCount: number;
  checkingCount: number;
  readyForImplementationCount: number;
  blockedCriticalPathCount: number;
  criticalPathRecordTypes: string[];
  blockedCriticalPathRecordTypes: string[];
  readyForImplementationRecordTypes: string[];
  confirmationIssues: string[];
  items: DispensingUkeRecordProfileGapProgressItem[];
}

export interface DispensingUkeRecordProfileGapImplementationTask {
  id: string;
  recordType: string;
  priority: DispensingUkeRecordProfileGapPriority;
  priorityLabel: string;
  title: string;
  evidenceLabels: string[];
  sourceChecklistItemIds: string[];
  fieldLabels: string[];
  implementationScope: string;
  acceptanceCriteria: string[];
  testFocus: string[];
}

export interface DispensingUkeRecordProfileGapImplementationPlan {
  readyForImplementation: boolean;
  taskCount: number;
  blockedCriticalPathCount: number;
  taskRecordTypes: string[];
  blockedCriticalPathRecordTypes: string[];
  confirmationIssues: string[];
  tasks: DispensingUkeRecordProfileGapImplementationTask[];
  blockedItems: DispensingUkeRecordProfileGapProgressItem[];
}

interface RecordProfileInputRecord {
  recordType: string;
  fields: string[];
  claimSerial: string;
  recordStatus: string;
  sourceFileName: string;
  lineNumber: number;
}

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_FLAG_UTF8_NAMES = 0x0800;
const ZIP_METHOD_STORED = 0;
const ZIP_METHOD_DEFLATE = 8;
const MAX_EOCD_SEARCH_BYTES = 22 + 0xffff;

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function toUint8Array(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function decodeShiftJis(bytes: Uint8Array): string {
  return encoding.convert(Array.from(bytes), {
    from: 'SJIS',
    to: 'UNICODE',
    type: 'string'
  }) as string;
}

function decodeZipName(bytes: Uint8Array, flags: number): string {
  if ((flags & ZIP_FLAG_UTF8_NAMES) !== 0) {
    return new TextDecoder('utf-8').decode(bytes);
  }
  return decodeShiftJis(bytes);
}

function findEndOfCentralDirectory(view: DataView): number {
  const minOffset = Math.max(0, view.byteLength - MAX_EOCD_SEARCH_BYTES);
  for (let offset = view.byteLength - 22; offset >= minOffset; offset--) {
    if (readUint32(view, offset) === ZIP_EOCD_SIGNATURE) return offset;
  }
  return -1;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('この環境ではZIPのdeflate展開に対応していません。');
  }

  const source = new Response(toArrayBuffer(bytes)).body;
  if (!source) throw new Error('ZIP展開用ストリームを作成できません。');
  const inflated = source.pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(inflated).arrayBuffer());
}

async function extractZipEntryData(
  view: DataView,
  zipBytes: Uint8Array,
  entry: { localHeaderOffset: number; compressedSize: number; compressionMethod: number }
): Promise<Uint8Array> {
  const localOffset = entry.localHeaderOffset;
  if (readUint32(view, localOffset) !== ZIP_LOCAL_FILE_SIGNATURE) {
    throw new Error('ZIPローカルヘッダーを確認できません。');
  }

  const localFileNameLength = readUint16(view, localOffset + 26);
  const localExtraLength = readUint16(view, localOffset + 28);
  const dataStart = localOffset + 30 + localFileNameLength + localExtraLength;
  const compressed = zipBytes.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === ZIP_METHOD_STORED) return compressed;
  if (entry.compressionMethod === ZIP_METHOD_DEFLATE) return inflateRaw(compressed);
  throw new Error(`未対応のZIP圧縮方式です（method=${entry.compressionMethod}）。`);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }

  fields.push(field);
  return fields;
}

function parseRecodeInfoCsv(
  text: string,
  sourceFileName: string
): { records: DispensingUkeOfficialSampleRecord[]; issues: string[] } {
  const records: DispensingUkeOfficialSampleRecord[] = [];
  const issues: string[] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\x1a/g, '');
    if (!line.trim()) continue;
    const rawFields = parseCsvLine(line);
    const recordType = rawFields[3] || '';
    if (!/^[A-Z]{2}$/.test(recordType)) {
      issues.push(`${sourceFileName}:${i + 1} のレコード種別を確認できません。`);
      continue;
    }
    records.push({
      sourceFileName,
      lineNumber: i + 1,
      claimSerial: rawFields[0] || '',
      rowSerial: rawFields[1] || '',
      recordStatus: rawFields[2] || '',
      recordType,
      fields: rawFields.slice(4),
      rawFields
    });
  }

  return { records, issues };
}

function isRecodeInfoFile(fileName: string): boolean {
  return /(?:^|\/)14_RECODEINFO_PHA\.CSV$/i.test(fileName);
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

function shiftJisByteLength(value: string): number {
  const unicodeArray = encoding.stringToCode(value);
  return encoding.convert(unicodeArray, {
    from: 'UNICODE',
    to: 'SJIS'
  }).length;
}

export function convertOfficialSampleRecordsToUkeRecords(
  records: DispensingUkeOfficialSampleRecord[]
): UkeRecord[] {
  return records.map((record) => ({
    type: record.recordType,
    fields: [...record.fields]
  }));
}

function buildOfficialSampleValidationOptions(
  options: DispensingUkeOfficialSampleValidationOptions = {}
) {
  return {
    context: 'official_sample' as const,
    ...(options.recordSpecs ? { recordSpecs: options.recordSpecs } : {})
  };
}

export function validateDispensingUkeOfficialSampleRecords(
  records: DispensingUkeOfficialSampleRecord[],
  options: DispensingUkeOfficialSampleValidationOptions = {}
): DispensingUkeValidationIssue[] {
  return validateDispensingUkeRecords(
    convertOfficialSampleRecordsToUkeRecords(records),
    buildOfficialSampleValidationOptions(options)
  );
}

export function buildDispensingUkeOfficialSampleAllFieldValidationReport(
  records: DispensingUkeOfficialSampleRecord[],
  options: DispensingUkeOfficialSampleValidationOptions = {}
): DispensingUkeAllFieldValidationReport {
  return buildDispensingUkeAllFieldValidationReport(
    convertOfficialSampleRecordsToUkeRecords(records),
    buildOfficialSampleValidationOptions(options)
  );
}

export async function extractDispensingUkeOfficialSampleZip(
  zipData: ArrayBuffer | Uint8Array
): Promise<DispensingUkeOfficialSampleZipExtraction> {
  const zipBytes = toUint8Array(zipData);
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset < 0) {
    return {
      entries: [],
      recodeInfoFiles: [],
      records: [],
      issues: ['ZIP中央ディレクトリを確認できません。']
    };
  }

  const entryCount = readUint16(view, eocdOffset + 10);
  const centralDirectoryOffset = readUint32(view, eocdOffset + 16);
  const entries: DispensingUkeOfficialSampleZipEntry[] = [];
  const recodeInfoFiles: DispensingUkeOfficialSampleRecodeInfoFile[] = [];
  const records: DispensingUkeOfficialSampleRecord[] = [];
  const issues: string[] = [];
  let offset = centralDirectoryOffset;

  for (let i = 0; i < entryCount; i++) {
    if (readUint32(view, offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      issues.push(`ZIP中央ディレクトリの${i + 1}件目を確認できません。`);
      break;
    }

    const flags = readUint16(view, offset + 8);
    const compressionMethod = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const fileNameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localHeaderOffset = readUint32(view, offset + 42);
    const fileNameBytes = zipBytes.slice(offset + 46, offset + 46 + fileNameLength);
    const fileName = decodeZipName(fileNameBytes, flags);

    entries.push({
      fileName,
      compressedSize,
      uncompressedSize,
      compressionMethod
    });

    if (isRecodeInfoFile(fileName)) {
      try {
        const data = await extractZipEntryData(view, zipBytes, {
          localHeaderOffset,
          compressedSize,
          compressionMethod
        });
        const text = decodeShiftJis(data);
        const parsed = parseRecodeInfoCsv(text, fileName);
        records.push(...parsed.records);
        issues.push(...parsed.issues);
        recodeInfoFiles.push({
          fileName,
          text,
          recordCount: parsed.records.length
        });
      } catch (error) {
        issues.push(`${fileName} の展開に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  if (recodeInfoFiles.length === 0) {
    issues.push('14_RECODEINFO_PHA.CSV がZIP内に見つかりません。');
  }

  return {
    entries,
    recodeInfoFiles,
    records,
    issues
  };
}

export function parseDispensingUkeOfficialSampleRecodeInfoCsv(
  text: string,
  sourceFileName = '14_RECODEINFO_PHA.CSV'
): { records: DispensingUkeOfficialSampleRecord[]; issues: string[] } {
  return parseRecodeInfoCsv(text, sourceFileName);
}

function buildRecordProfileReport(
  records: RecordProfileInputRecord[],
  sourceLabel: string,
  sourceUrl: string
): DispensingUkeOfficialSampleRecordProfileReport {
  const recordTypes = sortedUnique(records.map((record) => record.recordType));
  const recordTypeProfiles = recordTypes.map((recordType) => {
    const typeRecords = records.filter((record) => record.recordType === recordType);
    const maxFieldCount = Math.max(...typeRecords.map((record) => record.fields.length), 0);
    const minFieldCount = Math.min(...typeRecords.map((record) => record.fields.length));
    const nonBlankFieldNumbers: number[] = [];
    const fields: DispensingUkeOfficialSampleFieldProfile[] = [];

    for (let fieldIndex = 0; fieldIndex < maxFieldCount; fieldIndex++) {
      let nonBlankCount = 0;
      let digitOnlyCount = 0;
      let monthLikeCount = 0;
      let dateLikeCount = 0;
      let timestampLikeCount = 0;
      let maxCharacterLength = 0;
      let maxShiftJisByteLength = 0;

      for (const record of typeRecords) {
        const value = record.fields[fieldIndex] ?? '';
        if (isBlank(value)) continue;
        const text = String(value).trim();
        nonBlankCount++;
        maxCharacterLength = Math.max(maxCharacterLength, text.length);
        maxShiftJisByteLength = Math.max(maxShiftJisByteLength, shiftJisByteLength(text));
        if (/^\d+$/.test(text)) digitOnlyCount++;
        if (/^\d{6}$/.test(text)) monthLikeCount++;
        if (/^\d{8}$/.test(text)) dateLikeCount++;
        if (/^(?:\d{12}|\d{14})$/.test(text)) timestampLikeCount++;
      }

      if (nonBlankCount > 0) nonBlankFieldNumbers.push(fieldIndex + 1);
      fields.push({
        fieldNumber: fieldIndex + 1,
        observedCount: typeRecords.length,
        nonBlankCount,
        digitOnlyCount,
        monthLikeCount,
        dateLikeCount,
        timestampLikeCount,
        maxCharacterLength,
        maxShiftJisByteLength
      });
    }

    return {
      recordType,
      recordCount: typeRecords.length,
      claimCount: new Set(typeRecords.map((record) => record.claimSerial).filter((value) => value.trim())).size,
      sourceFileCount: new Set(typeRecords.map((record) => record.sourceFileName)).size,
      minFieldCount,
      maxFieldCount,
      nonBlankFieldNumbers,
      recordStatusCodes: sortedUnique(typeRecords.map((record) => record.recordStatus).filter((value) => value.trim())),
      firstSeen: {
        sourceFileName: typeRecords[0].sourceFileName,
        lineNumber: typeRecords[0].lineNumber
      },
      fields
    };
  });

  return {
    sourceLabel,
    sourceUrl,
    recordCount: records.length,
    claimCount: new Set(records.map((record) => record.claimSerial).filter((value) => value.trim())).size,
    recordTypeCount: recordTypeProfiles.length,
    maxFieldCount: Math.max(...recordTypeProfiles.map((profile) => profile.maxFieldCount), 0),
    recordTypeProfiles
  };
}

export function buildDispensingUkeOfficialSampleRecordProfileReport(
  records: DispensingUkeOfficialSampleRecord[]
): DispensingUkeOfficialSampleRecordProfileReport {
  return buildRecordProfileReport(records, DISPENSING_UKE_RECORD_SPEC_SOURCE.label, DISPENSING_UKE_RECORD_SPEC_SOURCE.sampleDataUrl);
}

export function buildDispensingUkeGeneratedRecordProfileReport(
  records: UkeRecord[],
  sourceLabel = 'pharma-oss生成UKE'
): DispensingUkeOfficialSampleRecordProfileReport {
  return buildRecordProfileReport(
    records.map((record, index) => ({
      recordType: record.type,
      fields: [...record.fields],
      claimSerial: '',
      recordStatus: '',
      sourceFileName: 'generated',
      lineNumber: index + 1
    })),
    sourceLabel,
    ''
  );
}

function toRecordTypeProfileMap(
  report: DispensingUkeOfficialSampleRecordProfileReport
): Map<string, DispensingUkeOfficialSampleRecordTypeProfile> {
  return new Map(report.recordTypeProfiles.map((profile) => [profile.recordType, profile]));
}

function fieldCountStatus(
  officialProfile: DispensingUkeOfficialSampleRecordTypeProfile | undefined,
  generatedProfile: DispensingUkeOfficialSampleRecordTypeProfile | undefined
): DispensingUkeRecordProfileFieldCountStatus {
  if (!officialProfile) return 'generated_only';
  if (!generatedProfile) return 'official_only';
  if (generatedProfile.maxFieldCount < officialProfile.maxFieldCount) return 'generated_shorter';
  if (generatedProfile.maxFieldCount > officialProfile.maxFieldCount) return 'generated_longer';
  return 'match';
}

function numberArrayDiff(left: number[], right: number[]): number[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

export function compareDispensingUkeRecordProfiles(
  officialReport: DispensingUkeOfficialSampleRecordProfileReport,
  generatedReport: DispensingUkeOfficialSampleRecordProfileReport
): DispensingUkeRecordProfileComparisonReport {
  const officialMap = toRecordTypeProfileMap(officialReport);
  const generatedMap = toRecordTypeProfileMap(generatedReport);
  const comparedRecordTypes = sortedUnique([
    ...officialReport.recordTypeProfiles.map((profile) => profile.recordType),
    ...generatedReport.recordTypeProfiles.map((profile) => profile.recordType)
  ]);
  const items = comparedRecordTypes.map((recordType) => {
    const officialProfile = officialMap.get(recordType);
    const generatedProfile = generatedMap.get(recordType);
    const officialNonBlankFieldNumbers = officialProfile?.nonBlankFieldNumbers ?? [];
    const generatedNonBlankFieldNumbers = generatedProfile?.nonBlankFieldNumbers ?? [];

    return {
      recordType,
      fieldCountStatus: fieldCountStatus(officialProfile, generatedProfile),
      officialRecordCount: officialProfile?.recordCount ?? 0,
      generatedRecordCount: generatedProfile?.recordCount ?? 0,
      officialMinFieldCount: officialProfile?.minFieldCount,
      officialMaxFieldCount: officialProfile?.maxFieldCount,
      generatedMinFieldCount: generatedProfile?.minFieldCount,
      generatedMaxFieldCount: generatedProfile?.maxFieldCount,
      officialNonBlankFieldNumbers,
      generatedNonBlankFieldNumbers,
      missingGeneratedNonBlankFieldNumbers: numberArrayDiff(officialNonBlankFieldNumbers, generatedNonBlankFieldNumbers),
      extraGeneratedNonBlankFieldNumbers: numberArrayDiff(generatedNonBlankFieldNumbers, officialNonBlankFieldNumbers)
    };
  });
  const officialOnlyRecordTypes = items
    .filter((item) => item.fieldCountStatus === 'official_only')
    .map((item) => item.recordType);
  const generatedOnlyRecordTypes = items
    .filter((item) => item.fieldCountStatus === 'generated_only')
    .map((item) => item.recordType);
  const fieldCountMismatchRecordTypes = items
    .filter((item) => item.fieldCountStatus === 'generated_shorter' || item.fieldCountStatus === 'generated_longer')
    .map((item) => item.recordType);
  const nonBlankMismatchRecordTypes = items
    .filter((item) => item.fieldCountStatus !== 'official_only'
      && item.fieldCountStatus !== 'generated_only'
      && (item.missingGeneratedNonBlankFieldNumbers.length > 0 || item.extraGeneratedNonBlankFieldNumbers.length > 0))
    .map((item) => item.recordType);
  const matchingRecordTypes = items
    .filter((item) => item.fieldCountStatus === 'match'
      && item.missingGeneratedNonBlankFieldNumbers.length === 0
      && item.extraGeneratedNonBlankFieldNumbers.length === 0)
    .map((item) => item.recordType);
  const issueCount = officialOnlyRecordTypes.length
    + generatedOnlyRecordTypes.length
    + fieldCountMismatchRecordTypes.length
    + nonBlankMismatchRecordTypes.length;

  return {
    ok: issueCount === 0,
    officialSourceLabel: officialReport.sourceLabel,
    generatedSourceLabel: generatedReport.sourceLabel,
    comparedRecordTypes,
    matchingRecordTypes,
    officialOnlyRecordTypes,
    generatedOnlyRecordTypes,
    fieldCountMismatchRecordTypes,
    nonBlankMismatchRecordTypes,
    issueCount,
    items
  };
}

export function buildDispensingUkeOfficialSampleConditionalRecordAlignmentReview(
  comparison: DispensingUkeRecordProfileComparisonReport,
  recordType: string,
  recordSpecs: DispensingUkeRecordSpec[] = DISPENSING_UKE_KNOWN_RECORD_SPEC
): DispensingUkeOfficialSampleConditionalRecordAlignmentReview {
  const item = comparison.items.find((candidate) => candidate.recordType === recordType);
  const spec = recordSpecs.find((candidate) => candidate.type === recordType);
  const issues: string[] = [];

  if (!item || item.officialRecordCount === 0) {
    issues.push(`${recordType}が公式サンプルで観測されていません。`);
  }
  if (!item || item.generatedRecordCount === 0) {
    issues.push(`${recordType}が条件付き生成UKEにありません。`);
  }
  if (item && item.fieldCountStatus !== 'match') {
    issues.push(`${recordType}の項目数が公式サンプルと一致していません。`);
  }
  if (item && item.missingGeneratedNonBlankFieldNumbers.length > 0) {
    issues.push(`${recordType}の生成側で公式サンプルの非空欄項目 ${item.missingGeneratedNonBlankFieldNumbers.join('・')} が不足しています。`);
  }
  if (item && item.extraGeneratedNonBlankFieldNumbers.length > 0) {
    issues.push(`${recordType}の生成側に公式サンプルで未観測の非空欄項目 ${item.extraGeneratedNonBlankFieldNumbers.join('・')} があります。`);
  }

  return {
    ok: issues.length === 0,
    recordType,
    recordLabel: spec?.label || recordType,
    officialSourceLabel: comparison.officialSourceLabel,
    generatedSourceLabel: comparison.generatedSourceLabel,
    statusLabel: issues.length === 0 ? '形状一致' : '要確認',
    officialRecordCount: item?.officialRecordCount ?? 0,
    generatedRecordCount: item?.generatedRecordCount ?? 0,
    fieldCountStatus: item?.fieldCountStatus ?? 'official_only',
    officialMinFieldCount: item?.officialMinFieldCount,
    officialMaxFieldCount: item?.officialMaxFieldCount,
    generatedMinFieldCount: item?.generatedMinFieldCount,
    generatedMaxFieldCount: item?.generatedMaxFieldCount,
    officialNonBlankFieldNumbers: [...(item?.officialNonBlankFieldNumbers ?? [])],
    generatedNonBlankFieldNumbers: [...(item?.generatedNonBlankFieldNumbers ?? [])],
    missingGeneratedNonBlankFieldNumbers: [...(item?.missingGeneratedNonBlankFieldNumbers ?? [])],
    extraGeneratedNonBlankFieldNumbers: [...(item?.extraGeneratedNonBlankFieldNumbers ?? [])],
    issues
  };
}

export function buildDispensingUkeOfficialSampleConditionalRecordAlignmentReviewCsv(
  review: DispensingUkeOfficialSampleConditionalRecordAlignmentReview
): string {
  const rows = [
    ['公式出典', '生成元', 'レコード種別', 'レコード名', '判定', '公式件数', '生成件数', '公式項目数', '生成項目数', '公式非空欄項番', '生成非空欄項番', '生成不足項番', '生成追加項番', '確認事項'],
    [
      review.officialSourceLabel,
      review.generatedSourceLabel,
      review.recordType,
      review.recordLabel,
      review.statusLabel,
      review.officialRecordCount,
      review.generatedRecordCount,
      `${review.officialMinFieldCount ?? 0}-${review.officialMaxFieldCount ?? 0}`,
      `${review.generatedMinFieldCount ?? 0}-${review.generatedMaxFieldCount ?? 0}`,
      review.officialNonBlankFieldNumbers.join('・'),
      review.generatedNonBlankFieldNumbers.join('・'),
      review.missingGeneratedNonBlankFieldNumbers.join('・'),
      review.extraGeneratedNonBlankFieldNumbers.join('・'),
      review.issues.join(' / ')
    ]
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function formatDispensingUkeOfficialSampleConditionalRecordAlignmentReview(
  review: DispensingUkeOfficialSampleConditionalRecordAlignmentReview
): string {
  const issueText = review.issues.length > 0 ? ` / ${review.issues.join(' ')}` : '';
  return `${review.recordType}公式サンプル現物形状突合: ${review.statusLabel} / 公式 ${review.officialRecordCount}件 / 生成 ${review.generatedRecordCount}件 / 項目 ${review.generatedMinFieldCount ?? 0}-${review.generatedMaxFieldCount ?? 0} / 非空欄 ${review.generatedNonBlankFieldNumbers.join('・') || 'なし'}${issueText}`;
}

function rangeInclusive(start: number, end: number): number[] {
  const values: number[] = [];
  for (let value = start; value <= end; value++) {
    values.push(value);
  }
  return values;
}

const GAP_PRIORITY_ORDER: DispensingUkeRecordProfileGapPriority[] = ['critical', 'high', 'medium', 'low'];

const GAP_PRIORITY_LABELS: Record<DispensingUkeRecordProfileGapPriority, string> = {
  critical: '最優先',
  high: '高',
  medium: '中',
  low: '低'
};

const GAP_CATEGORY_LABELS: Record<DispensingUkeRecordProfileGapCategory, string> = {
  official_only: '未生成',
  generated_only: '公式サンプル未観測',
  generated_shorter: '項目不足',
  generated_extra_fields_need_spec_review: '追加項目要突合',
  generated_empty_tail_only: '末尾空欄確認',
  non_blank_shape_mismatch: '空欄差'
};

const GAP_PROGRESS_STATUS_LABELS: Record<DispensingUkeRecordProfileGapProgressStatus, string> = {
  unreviewed: '未確認',
  checking: '確認中',
  generation_rule_needed: '生成修正',
  sample_variation: '症例差',
  no_change_needed: '対応不要'
};

const GAP_CHECK_TARGETS: Record<DispensingUkeRecordProfileGapCategory, string> = {
  official_only: '生成ルール追加',
  generated_only: '出力条件確認',
  generated_shorter: '不足項目確認',
  generated_extra_fields_need_spec_review: '追加項目確認',
  generated_empty_tail_only: '末尾空欄確認',
  non_blank_shape_mismatch: '空欄位置確認'
};

const IMPLEMENTATION_SCOPE_LABELS: Record<DispensingUkeRecordSpec['implementationScope'], string> = {
  always: '常時生成',
  conditional: '条件付き生成',
  official_sample_validation: '公式サンプル検証'
};

function gapPriorityRank(priority: DispensingUkeRecordProfileGapPriority): number {
  return GAP_PRIORITY_ORDER.indexOf(priority);
}

function buildHighestPriorityRecordTypeBuckets(
  items: DispensingUkeRecordProfileGapItem[]
): Record<DispensingUkeRecordProfileGapPriority, string[]> {
  const highestByRecordType = new Map<string, DispensingUkeRecordProfileGapPriority>();

  for (const item of items) {
    const current = highestByRecordType.get(item.recordType);
    if (!current || gapPriorityRank(item.priority) < gapPriorityRank(current)) {
      highestByRecordType.set(item.recordType, item.priority);
    }
  }

  return GAP_PRIORITY_ORDER.reduce<Record<DispensingUkeRecordProfileGapPriority, string[]>>((result, priority) => {
    result[priority] = sortedUnique(
      Array.from(highestByRecordType.entries())
        .filter(([, highestPriority]) => highestPriority === priority)
        .map(([recordType]) => recordType)
    );
    return result;
  }, { critical: [], high: [], medium: [], low: [] });
}

function isConsecutive(values: number[]): boolean {
  return values.every((value, index) => index === 0 || value === values[index - 1] + 1);
}

function formatGapFieldLabel(fieldNumbers: number[]): string {
  if (fieldNumbers.length === 0) return 'レコード全体';
  const sortedFields = [...fieldNumbers].sort((a, b) => a - b);
  if (sortedFields.length >= 3 && isConsecutive(sortedFields)) {
    return `第${sortedFields[0]}〜${sortedFields[sortedFields.length - 1]}項目`;
  }
  if (sortedFields.length <= 6) {
    return sortedFields.map((fieldNumber) => `第${fieldNumber}項目`).join('・');
  }
  return `第${sortedFields[0]}項目ほか${sortedFields.length - 1}項目`;
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text.trimStart())) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function buildGapDoneCriteria(item: DispensingUkeRecordProfileGapItem): string[] {
  switch (item.category) {
    case 'official_only':
      return [
        `${item.recordType}の出力条件を仕様本文で確認した`,
        `${item.recordType}の必須項目と項目順を生成テストに追加した`,
        `${item.recordType}の未生成が差分レビューから消えた`
      ];
    case 'generated_only':
      return [
        `${item.recordType}が公式仕様に出る条件を確認した`,
        `${item.recordType}が公式サンプル未観測になる理由を監査メモに残した`
      ];
    case 'generated_shorter':
      return [
        `${item.recordType}の不足項目が空欄許容か値必須か確認した`,
        `${item.recordType}の項目数差が差分レビューから消えた`
      ];
    case 'generated_extra_fields_need_spec_review':
      return [
        `${item.recordType}の追加項目が公式項目かpharma-oss内の補助項目か確認した`,
        `${item.recordType}の項目数差を仕様本文に合わせて解消した`
      ];
    case 'generated_empty_tail_only':
      return [
        `${item.recordType}の末尾空欄が仕様上許容されるか確認した`,
        `${item.recordType}の空欄追加理由をテストに残した`
      ];
    case 'non_blank_shape_mismatch':
      return [
        `${item.recordType}の空欄差が症例差か項目割当差か確認した`,
        `${item.recordType}の空欄差理由を患者情報なしの証跡に残した`
      ];
  }
}

export function buildDispensingUkeRecordProfileGapChecklist(
  review: DispensingUkeRecordProfileGapReview
): DispensingUkeRecordProfileGapChecklist {
  const items = review.items
    .map<DispensingUkeRecordProfileGapChecklistItem>((item) => ({
      id: `${item.recordType}-${item.category}-${item.fieldNumbers.join('_') || 'record'}`,
      recordType: item.recordType,
      category: item.category,
      categoryLabel: GAP_CATEGORY_LABELS[item.category],
      priority: item.priority,
      priorityLabel: GAP_PRIORITY_LABELS[item.priority],
      fieldNumbers: [...item.fieldNumbers],
      fieldLabel: formatGapFieldLabel(item.fieldNumbers),
      checkTarget: GAP_CHECK_TARGETS[item.category],
      reason: item.message,
      action: item.nextAction,
      doneCriteria: buildGapDoneCriteria(item)
    }))
    .sort((left, right) => (
      gapPriorityRank(left.priority) - gapPriorityRank(right.priority)
      || left.recordType.localeCompare(right.recordType)
      || left.categoryLabel.localeCompare(right.categoryLabel)
    ));

  return {
    ok: items.length === 0,
    totalCount: items.length,
    criticalCount: items.filter((item) => item.priority === 'critical').length,
    highCount: items.filter((item) => item.priority === 'high').length,
    mediumCount: items.filter((item) => item.priority === 'medium').length,
    lowCount: items.filter((item) => item.priority === 'low').length,
    recordTypesByHighestPriority: buildHighestPriorityRecordTypeBuckets(review.items),
    items
  };
}

export function buildDispensingUkeRecordProfileGapChecklistCsv(
  checklist: DispensingUkeRecordProfileGapChecklist
): string {
  const rows = [
    ['ID', '優先度', 'レコード種別', '分類', '確認対象', '項目', '理由', '次の対応', '完了条件'],
    ...checklist.items.map((item) => [
      item.id,
      item.priorityLabel,
      item.recordType,
      item.categoryLabel,
      item.checkTarget,
      item.fieldLabel,
      item.reason,
      item.action,
      item.doneCriteria.join(' / ')
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function isCriticalPathPriority(priority: DispensingUkeRecordProfileGapPriority): boolean {
  return priority === 'critical' || priority === 'high';
}

function isPendingProgressStatus(status: DispensingUkeRecordProfileGapProgressStatus): boolean {
  return status === 'unreviewed' || status === 'checking';
}

export function buildDispensingUkeRecordProfileGapProgressReview(
  checklist: DispensingUkeRecordProfileGapChecklist,
  confirmations: DispensingUkeRecordProfileGapConfirmation[] = []
): DispensingUkeRecordProfileGapProgressReview {
  const checklistIds = new Set(checklist.items.map((item) => item.id));
  const confirmationById = new Map<string, DispensingUkeRecordProfileGapConfirmation>();
  const confirmationIssues: string[] = [];

  for (const confirmation of confirmations) {
    if (!checklistIds.has(confirmation.checklistItemId)) {
      confirmationIssues.push(`${confirmation.checklistItemId}は現在の確認リストにありません。`);
      continue;
    }
    if (confirmationById.has(confirmation.checklistItemId)) {
      confirmationIssues.push(`${confirmation.checklistItemId}の確認結果が重複しています。`);
    }
    confirmationById.set(confirmation.checklistItemId, confirmation);
  }

  const items = checklist.items.map<DispensingUkeRecordProfileGapProgressItem>((item) => {
    const confirmation = confirmationById.get(item.id);
    const evidenceLabel = confirmation?.evidenceLabel.trim() || '';
    const status: DispensingUkeRecordProfileGapProgressStatus = confirmation
      ? (evidenceLabel ? confirmation.status : 'checking')
      : 'unreviewed';
    if (confirmation && !evidenceLabel) {
      confirmationIssues.push(`${item.id}の根拠が未入力です。`);
    }
    const blocksCriticalPath = isCriticalPathPriority(item.priority) && isPendingProgressStatus(status);

    return {
      id: item.id,
      recordType: item.recordType,
      categoryLabel: item.categoryLabel,
      priority: item.priority,
      priorityLabel: item.priorityLabel,
      fieldLabel: item.fieldLabel,
      status,
      statusLabel: GAP_PROGRESS_STATUS_LABELS[status],
      evidenceLabel,
      reviewer: confirmation?.reviewer || '',
      reviewedAt: confirmation?.reviewedAt || '',
      note: confirmation?.note || '',
      action: item.action,
      blocksCriticalPath,
      readyForImplementation: status === 'generation_rule_needed'
    };
  });

  const blockedCriticalPathItems = items.filter((item) => item.blocksCriticalPath);
  const readyForImplementationItems = items.filter((item) => item.readyForImplementation);

  return {
    ok: blockedCriticalPathItems.length === 0 && confirmationIssues.length === 0,
    totalCount: items.length,
    decidedCount: items.filter((item) => !isPendingProgressStatus(item.status)).length,
    unreviewedCount: items.filter((item) => item.status === 'unreviewed').length,
    checkingCount: items.filter((item) => item.status === 'checking').length,
    readyForImplementationCount: readyForImplementationItems.length,
    blockedCriticalPathCount: blockedCriticalPathItems.length,
    criticalPathRecordTypes: sortedUnique(items.filter((item) => isCriticalPathPriority(item.priority)).map((item) => item.recordType)),
    blockedCriticalPathRecordTypes: sortedUnique(blockedCriticalPathItems.map((item) => item.recordType)),
    readyForImplementationRecordTypes: sortedUnique(readyForImplementationItems.map((item) => item.recordType)),
    confirmationIssues,
    items
  };
}

export function buildDispensingUkeRecordProfileGapProgressCsv(
  review: DispensingUkeRecordProfileGapProgressReview
): string {
  const rows = [
    ['ID', '優先度', 'レコード種別', '分類', '項目', '確認状態', '根拠', '担当', '確認日時', '次の対応', 'メモ'],
    ...review.items.map((item) => [
      item.id,
      item.priorityLabel,
      item.recordType,
      item.categoryLabel,
      item.fieldLabel,
      item.statusLabel,
      item.evidenceLabel,
      item.reviewer,
      item.reviewedAt,
      item.action,
      item.note
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function pickHighestPriority(
  priorities: DispensingUkeRecordProfileGapPriority[]
): DispensingUkeRecordProfileGapPriority {
  return [...priorities].sort((left, right) => gapPriorityRank(left) - gapPriorityRank(right))[0] ?? 'low';
}

function buildImplementationAcceptanceCriteria(
  recordType: string,
  items: DispensingUkeRecordProfileGapProgressItem[]
): string[] {
  return [
    `${recordType}の公式本文根拠をテストまたは監査証跡に残す`,
    `${recordType}の生成条件、出力順、必須項目を生成処理に反映する`,
    `${recordType}の${sortedUnique(items.map((item) => item.categoryLabel)).join('・')}が差分レビューから消える`,
    '患者名、薬局名、薬品名を含めない形状比較テストで確認する'
  ];
}

function buildImplementationTestFocus(
  recordType: string,
  items: DispensingUkeRecordProfileGapProgressItem[]
): string[] {
  return [
    `${recordType}の公式サンプル項目数と空欄位置`,
    `${recordType}の出力順`,
    ...items.map((item) => `${item.id}: ${item.fieldLabel}`)
  ];
}

export function buildDispensingUkeRecordProfileGapImplementationPlan(
  review: DispensingUkeRecordProfileGapProgressReview
): DispensingUkeRecordProfileGapImplementationPlan {
  const readyItems = review.items.filter((item) => item.readyForImplementation);
  const readyByRecordType = new Map<string, DispensingUkeRecordProfileGapProgressItem[]>();

  for (const item of readyItems) {
    const grouped = readyByRecordType.get(item.recordType) ?? [];
    grouped.push(item);
    readyByRecordType.set(item.recordType, grouped);
  }

  const tasks = Array.from(readyByRecordType.entries())
    .map<DispensingUkeRecordProfileGapImplementationTask>(([recordType, items]) => {
      const priority = pickHighestPriority(items.map((item) => item.priority));
      return {
        id: `${recordType}-generation-implementation`,
        recordType,
        priority,
        priorityLabel: GAP_PRIORITY_LABELS[priority],
        title: `${recordType}生成ルール追加`,
        evidenceLabels: sortedUnique(items.map((item) => item.evidenceLabel).filter(Boolean)),
        sourceChecklistItemIds: sortedUnique(items.map((item) => item.id)),
        fieldLabels: sortedUnique(items.map((item) => item.fieldLabel)),
        implementationScope: `${recordType}の公式確認済み差分を生成処理、検証、患者情報なし回帰テストへ反映する。`,
        acceptanceCriteria: buildImplementationAcceptanceCriteria(recordType, items),
        testFocus: buildImplementationTestFocus(recordType, items)
      };
    })
    .sort((left, right) => (
      gapPriorityRank(left.priority) - gapPriorityRank(right.priority)
      || left.recordType.localeCompare(right.recordType)
    ));

  const blockedItems = review.items.filter((item) => item.blocksCriticalPath);

  return {
    readyForImplementation: tasks.length > 0
      && review.blockedCriticalPathCount === 0
      && review.confirmationIssues.length === 0,
    taskCount: tasks.length,
    blockedCriticalPathCount: review.blockedCriticalPathCount,
    taskRecordTypes: tasks.map((task) => task.recordType),
    blockedCriticalPathRecordTypes: [...review.blockedCriticalPathRecordTypes],
    confirmationIssues: [...review.confirmationIssues],
    tasks,
    blockedItems
  };
}

export function buildDispensingUkeRecordProfileGapImplementationPlanCsv(
  plan: DispensingUkeRecordProfileGapImplementationPlan
): string {
  const rows = [
    ['ID', '優先度', 'レコード種別', '実装項目', '根拠', '対象項目', '実装範囲', '完了条件', 'テスト観点'],
    ...plan.tasks.map((task) => [
      task.id,
      task.priorityLabel,
      task.recordType,
      task.title,
      task.evidenceLabels.join(' / '),
      task.fieldLabels.join(' / '),
      task.implementationScope,
      task.acceptanceCriteria.join(' / '),
      task.testFocus.join(' / ')
    ]),
    ...plan.blockedItems.map((item) => [
      item.id,
      item.priorityLabel,
      item.recordType,
      '未確認のため保留',
      item.evidenceLabel,
      item.fieldLabel,
      item.action,
      '公式本文の根拠を入力して確認状態を更新する',
      item.categoryLabel
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildDispensingUkeRecordProfileGapReview(
  comparison: DispensingUkeRecordProfileComparisonReport
): DispensingUkeRecordProfileGapReview {
  const items: DispensingUkeRecordProfileGapItem[] = [];

  for (const item of comparison.items) {
    if (item.fieldCountStatus === 'official_only') {
      items.push({
        recordType: item.recordType,
        category: 'official_only',
        severity: 'blocker',
        priority: 'critical',
        fieldNumbers: [],
        message: `${item.recordType}は公式サンプルにありますが、pharma-oss生成UKEにはまだありません。`,
        nextAction: `${item.recordType}の生成条件、出力順、必須項目を仕様本文から確認して生成ルールを追加してください。`
      });
      continue;
    }

    if (item.fieldCountStatus === 'generated_only') {
      items.push({
        recordType: item.recordType,
        category: 'generated_only',
        severity: 'review',
        priority: 'medium',
        fieldNumbers: [],
        message: `${item.recordType}はpharma-oss生成UKEにありますが、比較中の公式サンプルでは未観測です。`,
        nextAction: `${item.recordType}が別条件の公式サンプルや仕様本文に出る種別か確認してください。`
      });
      continue;
    }

    if (item.fieldCountStatus === 'generated_shorter') {
      items.push({
        recordType: item.recordType,
        category: 'generated_shorter',
        severity: 'blocker',
        priority: 'critical',
        fieldNumbers: rangeInclusive((item.generatedMaxFieldCount ?? 0) + 1, item.officialMaxFieldCount ?? 0),
        message: `${item.recordType}は公式サンプルより生成項目数が少ないため、末尾空欄または生成項目の追加が必要です。`,
        nextAction: `${item.recordType}の不足項目を末尾空欄で満たせるか、値生成が必要かを仕様本文で確認してください。`
      });
    }

    if (item.fieldCountStatus === 'generated_longer') {
      const officialMax = item.officialMaxFieldCount ?? 0;
      const extraFieldNumbers = rangeInclusive(officialMax + 1, item.generatedMaxFieldCount ?? officialMax);
      const nonBlankExtraFieldNumbers = item.generatedNonBlankFieldNumbers.filter((fieldNumber) => fieldNumber > officialMax);
      const hasNonBlankExtra = nonBlankExtraFieldNumbers.length > 0;
      items.push({
        recordType: item.recordType,
        category: hasNonBlankExtra ? 'generated_extra_fields_need_spec_review' : 'generated_empty_tail_only',
        severity: 'review',
        priority: hasNonBlankExtra ? 'high' : 'low',
        fieldNumbers: hasNonBlankExtra ? nonBlankExtraFieldNumbers : extraFieldNumbers,
        message: hasNonBlankExtra
          ? `${item.recordType}は公式サンプルより生成項目数が多く、追加項目に値があります。削らずに仕様本文と突合してください。`
          : `${item.recordType}は公式サンプルより生成項目数が多いものの、追加項目は空欄です。`,
        nextAction: hasNonBlankExtra
          ? `${item.recordType}の追加項目がpharma-oss独自拡張ではなく公式項目か、仕様本文と別サンプルで突合してください。`
          : `${item.recordType}の空欄追加項目が許容されるか、仕様本文で確認してください。`
      });
    }

    if (item.missingGeneratedNonBlankFieldNumbers.length > 0 || item.extraGeneratedNonBlankFieldNumbers.length > 0) {
      items.push({
        recordType: item.recordType,
        category: 'non_blank_shape_mismatch',
        severity: 'review',
        priority: 'medium',
        fieldNumbers: [...item.missingGeneratedNonBlankFieldNumbers, ...item.extraGeneratedNonBlankFieldNumbers].sort((a, b) => a - b),
        message: `${item.recordType}は公式サンプルと生成UKEで空欄/非空欄の位置が異なります。`,
        nextAction: `${item.recordType}の空欄位置差が症例差か項目割当差か、公式サンプル追加投入で確認してください。`
      });
    }
  }

  const blockerCount = items.filter((item) => item.severity === 'blocker').length;
  const reviewCount = items.filter((item) => item.severity === 'review').length;

  return {
    ok: blockerCount === 0 && reviewCount === 0,
    blockerCount,
    reviewCount,
    criticalRecordTypes: items.filter((item) => item.priority === 'critical').map((item) => item.recordType),
    highRecordTypes: items.filter((item) => item.priority === 'high').map((item) => item.recordType),
    mediumRecordTypes: items.filter((item) => item.priority === 'medium').map((item) => item.recordType),
    lowRecordTypes: items.filter((item) => item.priority === 'low').map((item) => item.recordType),
    officialOnlyRecordTypes: items.filter((item) => item.category === 'official_only').map((item) => item.recordType),
    generatedOnlyRecordTypes: items.filter((item) => item.category === 'generated_only').map((item) => item.recordType),
    generatedShorterRecordTypes: items.filter((item) => item.category === 'generated_shorter').map((item) => item.recordType),
    generatedExtraNeedsSpecReviewRecordTypes: items.filter((item) => item.category === 'generated_extra_fields_need_spec_review').map((item) => item.recordType),
    generatedEmptyTailOnlyRecordTypes: items.filter((item) => item.category === 'generated_empty_tail_only').map((item) => item.recordType),
    nonBlankMismatchRecordTypes: items.filter((item) => item.category === 'non_blank_shape_mismatch').map((item) => item.recordType),
    items
  };
}

export function buildDispensingUkeOfficialSampleReview(
  extraction: Pick<DispensingUkeOfficialSampleZipExtraction, 'entries' | 'recodeInfoFiles' | 'records' | 'issues'>,
  options: DispensingUkeOfficialSampleValidationOptions = {}
): DispensingUkeOfficialSampleReview {
  const officialRecordTypes = sortedUnique(extraction.records.map((record) => record.recordType));
  const implementedRecordTypes = DISPENSING_UKE_IMPLEMENTED_RECORD_SPEC.map((spec) => spec.type);
  const knownRecordTypes = DISPENSING_UKE_KNOWN_RECORD_SPEC.map((spec) => spec.type);
  const implementedSet = new Set(implementedRecordTypes);
  const knownSet = new Set(knownRecordTypes);
  const officialSet = new Set(officialRecordTypes);
  const requiredImplementedRecordTypes = DISPENSING_UKE_IMPLEMENTED_RECORD_SPEC
    .filter((spec) => spec.required)
    .map((spec) => spec.type);
  const claimCount = new Set(
    extraction.records
      .map((record) => record.claimSerial)
      .filter((value) => value.trim())
  ).size;
  const unsupportedOfficialRecordTypes = officialRecordTypes.filter((type) => !knownSet.has(type));
  const validationOnlyOfficialRecordTypes = officialRecordTypes.filter((type) => knownSet.has(type) && !implementedSet.has(type));
  const implementedRecordTypesNotObserved = implementedRecordTypes.filter((type) => !officialSet.has(type));
  const requiredImplementedRecordTypesNotObserved = requiredImplementedRecordTypes.filter((type) => !officialSet.has(type));
  const ukeRecords = convertOfficialSampleRecordsToUkeRecords(extraction.records);
  const validationOptions = buildOfficialSampleValidationOptions(options);
  const validationIssues = validateDispensingUkeRecords(ukeRecords, validationOptions);
  const validationErrorCount = validationIssues.filter((issue) => issue.severity === 'error').length;
  const validationWarningCount = validationIssues.filter((issue) => issue.severity === 'warning').length;
  const allFieldValidationReport = buildDispensingUkeAllFieldValidationReport(ukeRecords, validationOptions);

  return {
    ok: extraction.issues.length === 0
      && extraction.recodeInfoFiles.length > 0
      && extraction.records.length > 0
      && unsupportedOfficialRecordTypes.length === 0
      && validationOnlyOfficialRecordTypes.length === 0
      && requiredImplementedRecordTypesNotObserved.length === 0
      && validationErrorCount === 0,
    sourceLabel: DISPENSING_UKE_RECORD_SPEC_SOURCE.label,
    sourceUrl: DISPENSING_UKE_RECORD_SPEC_SOURCE.sampleDataUrl,
    zipEntryCount: extraction.entries.length,
    recodeInfoFileCount: extraction.recodeInfoFiles.length,
    recordCount: extraction.records.length,
    claimCount,
    officialRecordTypes,
    implementedRecordTypes,
    knownRecordTypes,
    supportedOfficialRecordTypes: officialRecordTypes.filter((type) => knownSet.has(type)),
    unsupportedOfficialRecordTypes,
    validationOnlyOfficialRecordTypes,
    implementedRecordTypesNotObserved,
    requiredImplementedRecordTypesNotObserved,
    validationIssueCount: validationIssues.length,
    validationErrorCount,
    validationWarningCount,
    allFieldValidationReport,
    parseIssues: [...extraction.issues]
  };
}

export function buildDispensingUkeOfficialSampleGenerationReadiness(
  review: DispensingUkeOfficialSampleReview
): DispensingUkeOfficialSampleGenerationReadiness {
  const generatedRecordTypes = [...review.implementedRecordTypes];
  const generatedSet = new Set(generatedRecordTypes);
  const generationReadyOfficialRecordTypes = review.officialRecordTypes.filter((type) => generatedSet.has(type));
  const generationGapRecordTypes = [...review.validationOnlyOfficialRecordTypes];
  const blockingReasons: DispensingUkeOfficialSampleGenerationReadinessReason[] = [];

  if (review.recodeInfoFileCount === 0) {
    blockingReasons.push({
      recordType: 'RECODEINFO',
      reason: '14_RECODEINFO_PHA.CSVをまだ確認できていません。'
    });
  }

  if (review.recordCount === 0) {
    blockingReasons.push({
      recordType: 'RECODEINFO',
      reason: '公式サンプルのレコードをまだ確認できていません。'
    });
  }

  if (review.parseIssues.length > 0) {
    blockingReasons.push({
      recordType: 'RECODEINFO',
      reason: '公式サンプルの読み取り確認が残っています。'
    });
  }

  if (review.validationErrorCount > 0) {
    blockingReasons.push({
      recordType: 'RECODEINFO',
      reason: '公式サンプルの項目形式にエラーが残っています。'
    });
  }

  for (const type of review.unsupportedOfficialRecordTypes) {
    blockingReasons.push({
      recordType: type,
      reason: '仕様点検表にない公式レコード種別です。'
    });
  }

  for (const type of generationGapRecordTypes) {
    blockingReasons.push({
      recordType: type,
      reason: '今は読み取り確認までで、pharma-ossのUKE自動生成ルールが未実装です。'
    });
  }

  for (const type of review.requiredImplementedRecordTypesNotObserved) {
    blockingReasons.push({
      recordType: type,
      reason: 'pharma-oss生成UKEでは必須ですが、公式サンプルで未観測のため現物突合が不足しています。'
    });
  }

  return {
    ok: blockingReasons.length === 0,
    sourceLabel: review.sourceLabel,
    sourceUrl: review.sourceUrl,
    observedOfficialRecordTypes: [...review.officialRecordTypes],
    generatedRecordTypes,
    validationOnlyRecordTypes: [...review.validationOnlyOfficialRecordTypes],
    generationReadyOfficialRecordTypes,
    generationGapRecordTypes,
    unsupportedOfficialRecordTypes: [...review.unsupportedOfficialRecordTypes],
    unobservedGeneratedRecordTypes: [...review.implementedRecordTypesNotObserved],
    requiredGeneratedRecordTypesNotObserved: [...review.requiredImplementedRecordTypesNotObserved],
    validationIssueCount: review.validationIssueCount,
    validationErrorCount: review.validationErrorCount,
    validationWarningCount: review.validationWarningCount,
    parseIssueCount: review.parseIssues.length,
    blockingReasons
  };
}

function getUnobservedGeneratedRecordReason(
  recordType: string,
  spec?: DispensingUkeRecordSpec
): Pick<DispensingUkeOfficialSampleUnobservedGeneratedRecordReviewItem, 'status' | 'statusLabel' | 'reason' | 'nextAction' | 'doneCriteria'> {
  switch (recordType) {
    case 'KO':
      return {
        status: 'reviewed',
        statusLabel: '理由確認済み',
        reason: 'KOは公費併用の受付でだけ生成するため、読み込んだ公式サンプルに公費併用症例がない場合は未観測になります。',
        nextAction: '公費併用の公式サンプルまたは仕様本文で、KOの項目順と必須条件を追加確認してください。',
        doneCriteria: [
          '公費併用サンプルでKOが観測される',
          '公費なしサンプルではKOが出ない理由を監査メモに残す'
        ]
      };
    case 'KI':
      return {
        status: 'reviewed',
        statusLabel: '理由確認済み',
        reason: 'KIは加算・管理料がある受付でだけ生成するため、該当加算がない公式サンプルでは未観測になります。',
        nextAction: '加算・管理料を含む公式サンプルで、KIの項目形状と点数突合を確認してください。',
        doneCriteria: [
          '加算・管理料サンプルでKIが観測される',
          '加算なしサンプルではKIが出ない理由を監査メモに残す'
        ]
      };
    case 'MF':
      return {
        status: 'reviewed',
        statusLabel: '理由確認済み',
        reason: 'MFは窓口負担額情報を記録する条件に該当する受付でだけ生成するため、対象外の公式サンプルでは未観測になります。',
        nextAction: '窓口負担額情報を含む公式サンプルまたは仕様本文で、MFの生成条件、項目順、金額項目を確認してください。',
        doneCriteria: [
          '対象症例の公式サンプルでMFが観測される',
          '対象外サンプルではMFが出ない条件を監査メモに残す'
        ]
      };
    case 'TO':
      return {
        status: 'reviewed',
        statusLabel: '理由確認済み',
        reason: 'TOは薬剤料、算定除外理由、疑義照会・処方変更理由などの補足がある受付で生成するため、補足条件がない公式サンプルでは未観測になります。',
        nextAction: '薬剤料または摘要を含む公式サンプルで、TOの出力条件、項目順、摘要文字数を確認してください。',
        doneCriteria: [
          '薬剤料または摘要サンプルでTOが観測される',
          'TO未観測サンプルの条件差を患者情報なしで説明できる'
        ]
      };
    case 'ST':
      return {
        status: 'reviewed',
        statusLabel: '理由確認済み',
        reason: 'STはpharma-ossの出力ファイル終端として生成しています。公式サンプルの14_RECODEINFO_PHA.CSVでは終端レコードが別管理または省略される構成があり、出力単位の違いで未観測になります。',
        nextAction: '支払基金の記録条件仕様本文と複数の公式サンプルで、ST相当の終端情報の扱いを確認してください。',
        doneCriteria: [
          'ST相当の終端情報が公式仕様本文で確認できる',
          '公式サンプル未観測の理由を出力単位の差として監査メモに残す'
        ]
      };
    default:
      return {
        status: 'needs_review',
        statusLabel: '要確認',
        reason: `${recordType}はpharma-ossで${spec ? IMPLEMENTATION_SCOPE_LABELS[spec.implementationScope] : '生成対象'}ですが、読み込んだ公式サンプルでは未観測です。`,
        nextAction: `${recordType}の出力条件が症例差か実装過剰かを公式サンプル追加投入と仕様本文で確認してください。`,
        doneCriteria: [
          `${recordType}が公式サンプル未観測になる理由を監査メモに残す`,
          `${recordType}が不要な生成でないことをテストまたは仕様本文で確認する`
        ]
      };
  }
}

export function buildDispensingUkeOfficialSampleUnobservedGeneratedRecordReview(
  readiness: DispensingUkeOfficialSampleGenerationReadiness,
  recordSpecs: DispensingUkeRecordSpec[] = DISPENSING_UKE_IMPLEMENTED_RECORD_SPEC
): DispensingUkeOfficialSampleUnobservedGeneratedRecordReview {
  const specByType = new Map(recordSpecs.map((spec) => [spec.type, spec]));
  const items = readiness.unobservedGeneratedRecordTypes.map((recordType) => {
    const spec = specByType.get(recordType);
    const reason = getUnobservedGeneratedRecordReason(recordType, spec);

    return {
      recordType,
      recordLabel: spec?.label || recordType,
      implementationScope: spec?.implementationScope || 'conditional',
      implementationScopeLabel: spec ? IMPLEMENTATION_SCOPE_LABELS[spec.implementationScope] : '条件付き生成',
      ...reason
    };
  });
  const reviewedRecordTypes = items.filter((item) => item.status === 'reviewed').map((item) => item.recordType);
  const needsReviewRecordTypes = items.filter((item) => item.status === 'needs_review').map((item) => item.recordType);

  return {
    ok: needsReviewRecordTypes.length === 0,
    sourceLabel: readiness.sourceLabel,
    sourceUrl: readiness.sourceUrl,
    totalCount: items.length,
    reviewedCount: reviewedRecordTypes.length,
    needsReviewCount: needsReviewRecordTypes.length,
    recordTypes: items.map((item) => item.recordType),
    reviewedRecordTypes,
    needsReviewRecordTypes,
    items
  };
}

export function buildDispensingUkeOfficialSampleUnobservedGeneratedRecordReviewCsv(
  review: DispensingUkeOfficialSampleUnobservedGeneratedRecordReview
): string {
  const rows = [
    ['出典', 'レコード種別', 'レコード名', '実装範囲', '判定', '未観測理由', '次の対応', '完了条件'],
    ...review.items.map((item) => [
      review.sourceLabel,
      item.recordType,
      item.recordLabel,
      item.implementationScopeLabel,
      item.statusLabel,
      item.reason,
      item.nextAction,
      item.doneCriteria.join(' / ')
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function formatDispensingUkeOfficialSampleUnobservedGeneratedRecordReview(
  review: DispensingUkeOfficialSampleUnobservedGeneratedRecordReview
): string {
  const status = review.ok ? 'OK' : '要確認';
  const reviewedText = review.reviewedRecordTypes.length > 0
    ? ` / 理由確認済み ${review.reviewedRecordTypes.join('・')}`
    : '';
  const needsReviewText = review.needsReviewRecordTypes.length > 0
    ? ` / 要確認 ${review.needsReviewRecordTypes.join('・')}`
    : '';

  return `公式サンプル未観測理由レビュー: ${status} / 未観測 ${review.totalCount} / 確認済み ${review.reviewedCount}${reviewedText}${needsReviewText}`;
}

export function formatDispensingUkeOfficialSampleReview(
  review: DispensingUkeOfficialSampleReview
): string {
  const status = review.ok ? 'OK' : '要対応';
  const unsupportedText = review.unsupportedOfficialRecordTypes.length > 0
    ? ` / 未対応公式種別 ${review.unsupportedOfficialRecordTypes.join('・')}`
    : '';
  const readOnlyText = review.validationOnlyOfficialRecordTypes.length > 0
    ? ` / 読むだけ対応 ${review.validationOnlyOfficialRecordTypes.join('・')}`
    : '';
  const notObservedText = review.implementedRecordTypesNotObserved.length > 0
    ? ` / 未観測 ${review.implementedRecordTypesNotObserved.join('・')}`
    : '';
  const issueText = review.parseIssues.length > 0
    ? ` / 読取確認 ${review.parseIssues.slice(0, 3).join(' ')}${review.parseIssues.length > 3 ? ` ほか${review.parseIssues.length - 3}件` : ''}`
    : '';
  const validationText = review.validationIssueCount > 0
    ? ` / 検証 ${review.validationErrorCount}エラー ${review.validationWarningCount}確認`
    : '';
  const allFieldText = review.allFieldValidationReport.checkedFieldCount > 0
    ? ` / allFields 確認 ${review.allFieldValidationReport.checkedFieldCount} 指摘 ${review.allFieldValidationReport.issueFieldCount}`
    : '';

  return `${review.sourceLabel} 公式調剤サンプル: ${status} / ZIP ${review.zipEntryCount}件 / RECODEINFO ${review.recodeInfoFileCount}件 / レコード ${review.recordCount}件 / 請求 ${review.claimCount}件 / 公式種別 ${review.officialRecordTypes.length}${unsupportedText}${readOnlyText}${notObservedText}${validationText}${allFieldText}${issueText}`;
}

export function formatDispensingUkeOfficialSampleGenerationReadiness(
  readiness: DispensingUkeOfficialSampleGenerationReadiness
): string {
  const status = readiness.ok ? 'OK' : '要実装';
  const unsupportedText = readiness.unsupportedOfficialRecordTypes.length > 0
    ? ` / 未知の公式種別 ${readiness.unsupportedOfficialRecordTypes.join('・')}`
    : '';
  const gapText = readiness.generationGapRecordTypes.length > 0
    ? ` / 追加実装 ${readiness.generationGapRecordTypes.join('・')}`
    : '';
  const unobservedText = readiness.unobservedGeneratedRecordTypes.length > 0
    ? ` / 公式サンプル未観測 ${readiness.unobservedGeneratedRecordTypes.join('・')}`
    : '';
  const validationText = readiness.validationIssueCount > 0
    ? ` / 形式確認 ${readiness.validationErrorCount}エラー ${readiness.validationWarningCount}確認`
    : '';
  const parseText = readiness.parseIssueCount > 0
    ? ` / 読取確認 ${readiness.parseIssueCount}件`
    : '';

  return `${readiness.sourceLabel} 公式調剤サンプル自動生成準備: ${status} / 公式種別 ${readiness.observedOfficialRecordTypes.length} / 生成対応 ${readiness.generationReadyOfficialRecordTypes.length}/${readiness.observedOfficialRecordTypes.length}${gapText}${unsupportedText}${unobservedText}${validationText}${parseText}`;
}

export function formatDispensingUkeOfficialSampleRecordProfileReport(
  report: DispensingUkeOfficialSampleRecordProfileReport
): string {
  const topProfilesText = report.recordTypeProfiles
    .slice(0, 5)
    .map((profile) => {
      const nonBlankText = profile.nonBlankFieldNumbers.length > 0
        ? `非空欄 ${profile.nonBlankFieldNumbers.slice(0, 10).join('・')}${profile.nonBlankFieldNumbers.length > 10 ? '...' : ''}`
        : '非空欄なし';
      return `${profile.recordType} ${profile.recordCount}件 ${profile.minFieldCount}-${profile.maxFieldCount}項目 ${nonBlankText}`;
    })
    .join(' / ');
  const profileText = topProfilesText ? ` / ${topProfilesText}` : '';

  return `${report.sourceLabel} 公式調剤サンプル項目プロファイル: 種別 ${report.recordTypeCount} / レコード ${report.recordCount} / 請求 ${report.claimCount} / 最大項目 ${report.maxFieldCount}${profileText}`;
}

export function formatDispensingUkeRecordProfileComparisonReport(
  report: DispensingUkeRecordProfileComparisonReport
): string {
  const status = report.ok ? 'OK' : '要確認';
  const officialOnlyText = report.officialOnlyRecordTypes.length > 0
    ? ` / 公式だけ ${report.officialOnlyRecordTypes.join('・')}`
    : '';
  const generatedOnlyText = report.generatedOnlyRecordTypes.length > 0
    ? ` / 生成だけ ${report.generatedOnlyRecordTypes.join('・')}`
    : '';
  const fieldCountText = report.fieldCountMismatchRecordTypes.length > 0
    ? ` / 項目数差 ${report.fieldCountMismatchRecordTypes.join('・')}`
    : '';
  const nonBlankText = report.nonBlankMismatchRecordTypes.length > 0
    ? ` / 空欄差 ${report.nonBlankMismatchRecordTypes.join('・')}`
    : '';

  return `公式サンプル/生成UKE項目形状比較: ${status} / 比較種別 ${report.comparedRecordTypes.length} / 一致 ${report.matchingRecordTypes.length}${officialOnlyText}${generatedOnlyText}${fieldCountText}${nonBlankText}`;
}

export function formatDispensingUkeRecordProfileGapReview(
  review: DispensingUkeRecordProfileGapReview
): string {
  const status = review.ok ? 'OK' : '要確認';
  const officialOnlyText = review.officialOnlyRecordTypes.length > 0
    ? ` / 未生成 ${review.officialOnlyRecordTypes.join('・')}`
    : '';
  const generatedOnlyText = review.generatedOnlyRecordTypes.length > 0
    ? ` / 公式サンプル未観測 ${review.generatedOnlyRecordTypes.join('・')}`
    : '';
  const shorterText = review.generatedShorterRecordTypes.length > 0
    ? ` / 項目不足 ${review.generatedShorterRecordTypes.join('・')}`
    : '';
  const extraText = review.generatedExtraNeedsSpecReviewRecordTypes.length > 0
    ? ` / 追加項目要突合 ${review.generatedExtraNeedsSpecReviewRecordTypes.join('・')}`
    : '';
  const nonBlankText = review.nonBlankMismatchRecordTypes.length > 0
    ? ` / 空欄差 ${review.nonBlankMismatchRecordTypes.join('・')}`
    : '';
  const priorityText = review.criticalRecordTypes.length > 0 || review.highRecordTypes.length > 0
    ? ` / 優先 ${[
      review.criticalRecordTypes.length > 0 ? `最優先 ${review.criticalRecordTypes.join('・')}` : '',
      review.highRecordTypes.length > 0 ? `高 ${review.highRecordTypes.join('・')}` : ''
    ].filter(Boolean).join(' / ')}`
    : '';

  return `公式サンプル/生成UKE差分レビュー: ${status} / 要実装 ${review.blockerCount} / 要確認 ${review.reviewCount}${officialOnlyText}${generatedOnlyText}${shorterText}${extraText}${nonBlankText}${priorityText}`;
}

export function formatDispensingUkeRecordProfileGapChecklist(
  checklist: DispensingUkeRecordProfileGapChecklist
): string {
  const status = checklist.ok ? 'OK' : '要確認';
  const priorityText = checklist.recordTypesByHighestPriority.critical.length > 0
    || checklist.recordTypesByHighestPriority.high.length > 0
    ? ` / 優先 ${[
      checklist.recordTypesByHighestPriority.critical.length > 0
        ? `最優先 ${checklist.recordTypesByHighestPriority.critical.join('・')}`
        : '',
      checklist.recordTypesByHighestPriority.high.length > 0
        ? `高 ${checklist.recordTypesByHighestPriority.high.join('・')}`
        : ''
    ].filter(Boolean).join(' / ')}`
    : '';
  const firstItemsText = checklist.items.length > 0
    ? ` / 先頭 ${checklist.items.slice(0, 3).map((item) => `${item.recordType}: ${item.fieldLabel} ${item.checkTarget}`).join(' / ')}`
    : '';

  return `公式サンプル/生成UKE確認リスト: ${status} / 確認 ${checklist.totalCount}件 / 最優先 ${checklist.criticalCount} / 高 ${checklist.highCount}${priorityText}${firstItemsText}`;
}

export function formatDispensingUkeRecordProfileGapProgressReview(
  review: DispensingUkeRecordProfileGapProgressReview
): string {
  const status = review.ok ? 'OK' : '要確認';
  const blockedText = review.blockedCriticalPathRecordTypes.length > 0
    ? ` / 未確認の優先項目 ${review.blockedCriticalPathRecordTypes.join('・')}`
    : '';
  const readyText = review.readyForImplementationRecordTypes.length > 0
    ? ` / 生成修正 ${review.readyForImplementationRecordTypes.join('・')}`
    : '';
  const issueText = review.confirmationIssues.length > 0
    ? ` / 入力確認 ${review.confirmationIssues.slice(0, 2).join('・')}${review.confirmationIssues.length > 2 ? `ほか${review.confirmationIssues.length - 2}件` : ''}`
    : '';

  return `公式サンプル/生成UKE突合進捗: ${status} / 判断済み ${review.decidedCount}/${review.totalCount} / 未確認 ${review.unreviewedCount} / 確認中 ${review.checkingCount}${blockedText}${readyText}${issueText}`;
}

export function formatDispensingUkeRecordProfileGapImplementationPlan(
  plan: DispensingUkeRecordProfileGapImplementationPlan
): string {
  const status = plan.readyForImplementation ? '実装可能' : '要確認';
  const taskText = plan.taskRecordTypes.length > 0
    ? ` / 実装候補 ${plan.taskRecordTypes.join('・')}`
    : '';
  const blockedText = plan.blockedCriticalPathRecordTypes.length > 0
    ? ` / 未確認の優先項目 ${plan.blockedCriticalPathRecordTypes.join('・')}`
    : '';
  const issueText = plan.confirmationIssues.length > 0
    ? ` / 入力確認 ${plan.confirmationIssues.slice(0, 2).join('・')}${plan.confirmationIssues.length > 2 ? `ほか${plan.confirmationIssues.length - 2}件` : ''}`
    : '';

  return `公式サンプル/生成UKE実装計画: ${status} / タスク ${plan.taskCount}件${taskText}${blockedText}${issueText}`;
}
