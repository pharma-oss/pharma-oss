import type { DrugStock, Patient, SoapEntry, SoapRecord, Visit } from '@/db/types';
import {
  BACKUP_APP_ID,
  BACKUP_FORMAT_VERSION,
  buildBackupMigrationDiagnosticReport,
  type BackupMigrationDiagnosticReport,
  type YakurekiBackup
} from '@/lib/backup';

export type PatientCsvMigrationIssueSeverity = 'error' | 'warning';

export interface PatientCsvMigrationIssue {
  severity: PatientCsvMigrationIssueSeverity;
  code: string;
  title: string;
  message: string;
  line?: number;
}

export interface PatientCsvMigrationSourceFormat {
  delimiter: 'comma' | 'tab';
  headerLine: number;
  recognizedColumns: Partial<Record<PatientCsvMigrationField, string>>;
}

export interface PatientCsvMigrationRow {
  line: number;
  patient: Patient;
}

export interface PatientCsvMigrationPreview {
  backup: YakurekiBackup;
  rows: PatientCsvMigrationRow[];
  issues: PatientCsvMigrationIssue[];
  sourceFormat?: PatientCsvMigrationSourceFormat;
  diagnostic: BackupMigrationDiagnosticReport;
  status: 'pass' | 'attention' | 'blocked';
  statusLabel: string;
}

export interface VisitCsvMigrationSourceFormat {
  delimiter: 'comma' | 'tab';
  headerLine: number;
  recognizedColumns: Partial<Record<VisitCsvMigrationField, string>>;
}

export interface VisitCsvMigrationRow {
  line: number;
  visit: Visit;
}

export interface VisitCsvMigrationPreview {
  backup: YakurekiBackup;
  rows: VisitCsvMigrationRow[];
  issues: PatientCsvMigrationIssue[];
  sourceFormat?: VisitCsvMigrationSourceFormat;
  diagnostic: BackupMigrationDiagnosticReport;
  status: 'pass' | 'attention' | 'blocked';
  statusLabel: string;
}

export interface DrugStockCsvMigrationSourceFormat {
  delimiter: 'comma' | 'tab';
  headerLine: number;
  recognizedColumns: Partial<Record<DrugStockCsvMigrationField, string>>;
}

export interface DrugStockCsvMigrationRow {
  line: number;
  stock: DrugStock;
}

export interface DrugStockCsvMigrationPreview {
  backup: YakurekiBackup;
  rows: DrugStockCsvMigrationRow[];
  issues: PatientCsvMigrationIssue[];
  sourceFormat?: DrugStockCsvMigrationSourceFormat;
  diagnostic: BackupMigrationDiagnosticReport;
  status: 'pass' | 'attention' | 'blocked';
  statusLabel: string;
}

export interface SoapCsvMigrationSourceFormat {
  delimiter: 'comma' | 'tab';
  headerLine: number;
  recognizedColumns: Partial<Record<SoapCsvMigrationField, string>>;
}

export interface SoapCsvMigrationRow {
  line: number;
  soapRecord: SoapRecord;
}

export interface SoapCsvMigrationPreview {
  backup: YakurekiBackup;
  rows: SoapCsvMigrationRow[];
  issues: PatientCsvMigrationIssue[];
  sourceFormat?: SoapCsvMigrationSourceFormat;
  diagnostic: BackupMigrationDiagnosticReport;
  status: 'pass' | 'attention' | 'blocked';
  statusLabel: string;
}

export type MigrationPackageSourceKind = 'patients' | 'visits' | 'drug_stocks' | 'soap_records';
export type MigrationPackageReadinessStatus = 'pass' | 'attention' | 'blocked';

export interface MigrationPackageSourceReview {
  kind: MigrationPackageSourceKind;
  title: string;
  required: boolean;
  provided: boolean;
  status: MigrationPackageReadinessStatus;
  statusLabel: string;
  rowCount: number;
  issueCount: number;
  errorIssueCount: number;
  warningIssueCount: number;
  recognizedColumnCount: number;
  missingPrimaryKeyCount: number;
  duplicatePrimaryKeyCount: number;
  mojibakeSuspectCount: number;
  nextAction: string;
}

export interface MigrationPackageReferenceReview {
  id: 'visit_patient_reference' | 'soap_visit_reference';
  title: string;
  status: MigrationPackageReadinessStatus;
  statusLabel: string;
  checkedRowCount: number;
  issueCount: number;
  nextAction: string;
}

export interface MigrationPackageReadinessReview {
  type: 'yakureki-migration-package-readiness-review';
  schemaVersion: 1;
  generatedAt: string;
  status: MigrationPackageReadinessStatus;
  statusLabel: string;
  actionLabel: string;
  readyForOneDayTrial: boolean;
  requiredSourceCount: number;
  providedSourceCount: number;
  passedSourceCount: number;
  attentionSourceCount: number;
  blockedSourceCount: number;
  totalRowCount: number;
  totalIssueCount: number;
  referenceIssueCount: number;
  privacy: {
    containsPatientData: false;
    containsRawRows: false;
    containsLocalPath: false;
    containsFileName: false;
    containsSourcePrimaryKeys: false;
  };
  sources: MigrationPackageSourceReview[];
  references: MigrationPackageReferenceReview[];
}

export interface BuildMigrationPackageReadinessReviewInput {
  generatedAt?: Date;
  patients?: PatientCsvMigrationPreview;
  visits?: VisitCsvMigrationPreview;
  drugStocks?: DrugStockCsvMigrationPreview;
  soapRecords?: SoapCsvMigrationPreview;
  requiredSourceKinds?: MigrationPackageSourceKind[];
  recommendedSourceKinds?: MigrationPackageSourceKind[];
}

type PatientCsvMigrationField =
  | 'patientId'
  | 'name'
  | 'kana'
  | 'birthDate'
  | 'gender'
  | 'insuranceProvider'
  | 'insuranceNumber'
  | 'insuranceBurdenRatio'
  | 'insuranceType'
  | 'insuranceRelationship'
  | 'insuranceValidFrom'
  | 'insuranceValidTo';

type HeaderKey = PatientCsvMigrationField;

type VisitCsvMigrationField =
  | 'visitId'
  | 'patientId'
  | 'issueDate'
  | 'status'
  | 'prescriptionDate'
  | 'dispensingDate'
  | 'institutionCode'
  | 'institutionName'
  | 'departmentName'
  | 'doctorName';

type VisitHeaderKey = VisitCsvMigrationField;

type DrugStockCsvMigrationField =
  | 'id'
  | 'drugCode'
  | 'janCode'
  | 'lotNumber'
  | 'expirationDate'
  | 'quantity'
  | 'arrivalDate'
  | 'supplier';

type DrugStockHeaderKey = DrugStockCsvMigrationField;

type SoapCsvMigrationField =
  | 'soapId'
  | 'visitId'
  | 'authorId'
  | 'updatedAt'
  | 'problemId'
  | 'problemTitle'
  | 'sText'
  | 'oText'
  | 'aText'
  | 'pText'
  | 'freeText';

type SoapHeaderKey = SoapCsvMigrationField;

interface HeaderCandidate {
  index: number;
  delimiter: ',' | '\t';
  headers: string[];
}

const HEADER_ALIASES: Record<HeaderKey, string[]> = {
  patientId: ['患者ID', '患者id', '患者番号', '患者No', '患者NO', '患者コード', 'カルテ番号', '顧客番号', 'ID'],
  name: ['患者名', '氏名', '漢字氏名', '名前', '患者氏名', '姓名'],
  kana: ['カナ', 'フリガナ', '氏名カナ', '患者カナ', '患者氏名カナ', 'かな'],
  birthDate: ['生年月日', '誕生日', '生年月', 'birthDate', 'birthday'],
  gender: ['性別', '男女', 'gender'],
  insuranceProvider: ['保険者番号', '保険者No', '保険者NO', '保険者コード'],
  insuranceNumber: ['記号番号', '被保険者証記号番号', '保険証番号', '保険番号', '証番号'],
  insuranceBurdenRatio: ['負担割合', '一部負担割合', '負担率', '患者負担'],
  insuranceType: ['保険種別', '保険区分', '種別'],
  insuranceRelationship: ['本人家族', '本人・家族', '続柄', '区分'],
  insuranceValidFrom: ['保険開始日', '資格取得日', '有効開始日', '保険有効開始日'],
  insuranceValidTo: ['保険終了日', '資格喪失日', '有効期限', '保険有効期限']
};

const REQUIRED_HEADERS: PatientCsvMigrationField[] = ['patientId', 'name', 'birthDate'];

const VISIT_HEADER_ALIASES: Record<VisitHeaderKey, string[]> = {
  visitId: ['受付ID', '受付id', '来局ID', '来局番号', '受付番号', 'visitId', 'visit_id', 'レセプトID', '請求ID'],
  patientId: ['患者ID', '患者id', '患者番号', '患者No', '患者NO', '患者コード', 'カルテ番号', '顧客番号'],
  issueDate: ['来局日', '受付日', '受付日時', '調剤日', '交付日', '処理日', 'issueDate'],
  status: ['状態', '受付状態', 'ステータス', '進捗', 'status'],
  prescriptionDate: ['処方日', '処方箋発行日', 'prescriptionDate'],
  dispensingDate: ['調剤日', '投薬日', '交付日', 'dispensingDate'],
  institutionCode: ['医療機関コード', '医療機関番号', '医療機関ID', '病院コード'],
  institutionName: ['医療機関名', '病院名', '医院名', 'クリニック名'],
  departmentName: ['診療科', '診療科名', '科名'],
  doctorName: ['医師名', '処方医', '担当医']
};

const REQUIRED_VISIT_HEADERS: VisitCsvMigrationField[] = ['visitId', 'patientId', 'issueDate'];

const DRUG_STOCK_HEADER_ALIASES: Record<DrugStockHeaderKey, string[]> = {
  id: ['在庫ID', '在庫id', '在庫番号', 'stockId', 'stock_id', 'ID'],
  drugCode: ['薬品コード', '医薬品コード', 'レセ電コード', 'YJコード', 'ＹＪコード', 'drugCode', 'drug_code'],
  janCode: ['JANコード', 'JAN', 'janCode', 'jan_code'],
  lotNumber: ['ロット', 'ロット番号', 'Lot', 'lotNumber', 'lot_number'],
  expirationDate: ['使用期限', '有効期限', '期限', 'expirationDate', 'expiration_date'],
  quantity: ['在庫数', '数量', '現在庫', '残数', '棚卸数', 'quantity'],
  arrivalDate: ['入庫日', '納品日', '入荷日', 'arrivalDate', 'arrival_date'],
  supplier: ['仕入先', '納入業者', '卸', 'supplier']
};

const REQUIRED_DRUG_STOCK_HEADERS: DrugStockCsvMigrationField[] = ['drugCode', 'quantity'];

const SOAP_HEADER_ALIASES: Record<SoapHeaderKey, string[]> = {
  soapId: ['薬歴ID', '薬歴id', 'SOAPID', 'soapId', 'soap_id', '記録ID', '記録番号'],
  visitId: ['受付ID', '受付id', '来局ID', '来局番号', '受付番号', 'visitId', 'visit_id'],
  authorId: ['記録者ID', '薬剤師ID', 'スタッフID', 'authorId', 'author_id', '入力者ID'],
  updatedAt: ['記録日時', '更新日時', '薬歴日時', '記録日', '入力日', 'updatedAt', 'updated_at'],
  problemId: ['問題ID', 'プロブレムID', 'problemId', 'problem_id'],
  problemTitle: ['問題名', 'プロブレム', '疾患名', 'タイトル', 'problemTitle', 'problem_title'],
  sText: ['S', 'SOAP S', 'S情報', '主観', '主観的情報', '患者訴え'],
  oText: ['O', 'SOAP O', 'O情報', '客観', '客観的情報', '検査値'],
  aText: ['A', 'SOAP A', 'A情報', '評価', 'アセスメント'],
  pText: ['P', 'SOAP P', 'P情報', '計画', 'プラン', '指導計画'],
  freeText: ['薬歴本文', '指導内容', '服薬指導', '本文', 'メモ', '記録内容']
};

function normalizeFullWidth(value: string): string {
  return value.normalize('NFKC').replace(/\u3000/g, ' ');
}

function normalizeHeader(value: string): string {
  return normalizeFullWidth(value)
    .trim()
    .replace(/[\s_\-‐-‒–—―・:：()（）\[\]［］]/g, '')
    .toLowerCase();
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  fields.push(current.trim());
  return fields;
}

function detectDelimiter(line: string): ',' | '\t' | null {
  if (line.includes('\t')) return '\t';
  if (line.includes(',')) return ',';
  return null;
}

function findHeaderIndex(headers: string[], field: HeaderKey): number {
  const aliases = HEADER_ALIASES[field].map(normalizeHeader);
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function findVisitHeaderIndex(headers: string[], field: VisitHeaderKey): number {
  const aliases = VISIT_HEADER_ALIASES[field].map(normalizeHeader);
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function findDrugStockHeaderIndex(headers: string[], field: DrugStockHeaderKey): number {
  const aliases = DRUG_STOCK_HEADER_ALIASES[field].map(normalizeHeader);
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function findSoapHeaderIndex(headers: string[], field: SoapHeaderKey): number {
  const aliases = SOAP_HEADER_ALIASES[field].map(normalizeHeader);
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function countRecognizedHeaders(headers: string[]): number {
  return (Object.keys(HEADER_ALIASES) as HeaderKey[])
    .filter((field) => findHeaderIndex(headers, field) >= 0)
    .length;
}

function countVisitRecognizedHeaders(headers: string[]): number {
  return (Object.keys(VISIT_HEADER_ALIASES) as VisitHeaderKey[])
    .filter((field) => findVisitHeaderIndex(headers, field) >= 0)
    .length;
}

function countDrugStockRecognizedHeaders(headers: string[]): number {
  return (Object.keys(DRUG_STOCK_HEADER_ALIASES) as DrugStockHeaderKey[])
    .filter((field) => findDrugStockHeaderIndex(headers, field) >= 0)
    .length;
}

function countSoapRecognizedHeaders(headers: string[]): number {
  return (Object.keys(SOAP_HEADER_ALIASES) as SoapHeaderKey[])
    .filter((field) => findSoapHeaderIndex(headers, field) >= 0)
    .length;
}

function findHeaderCandidate(lines: string[]): HeaderCandidate | null {
  for (let index = 0; index < lines.length; index++) {
    const delimiter = detectDelimiter(lines[index]);
    if (!delimiter) continue;
    const headers = parseDelimitedLine(lines[index], delimiter);
    if (countRecognizedHeaders(headers) >= 2 && findHeaderIndex(headers, 'name') >= 0) {
      return { index, delimiter, headers };
    }
  }
  return null;
}

function findVisitHeaderCandidate(lines: string[]): HeaderCandidate | null {
  for (let index = 0; index < lines.length; index++) {
    const delimiter = detectDelimiter(lines[index]);
    if (!delimiter) continue;
    const headers = parseDelimitedLine(lines[index], delimiter);
    if (countVisitRecognizedHeaders(headers) >= 2 && findVisitHeaderIndex(headers, 'patientId') >= 0) {
      return { index, delimiter, headers };
    }
  }
  return null;
}

function findDrugStockHeaderCandidate(lines: string[]): HeaderCandidate | null {
  for (let index = 0; index < lines.length; index++) {
    const delimiter = detectDelimiter(lines[index]);
    if (!delimiter) continue;
    const headers = parseDelimitedLine(lines[index], delimiter);
    if (countDrugStockRecognizedHeaders(headers) >= 2 && findDrugStockHeaderIndex(headers, 'drugCode') >= 0) {
      return { index, delimiter, headers };
    }
  }
  return null;
}

function hasSoapTextColumn(headers: string[]): boolean {
  return (['sText', 'oText', 'aText', 'pText', 'freeText'] as SoapHeaderKey[])
    .some((field) => findSoapHeaderIndex(headers, field) >= 0);
}

function findSoapHeaderCandidate(lines: string[]): HeaderCandidate | null {
  for (let index = 0; index < lines.length; index++) {
    const delimiter = detectDelimiter(lines[index]);
    if (!delimiter) continue;
    const headers = parseDelimitedLine(lines[index], delimiter);
    if (countSoapRecognizedHeaders(headers) >= 2 && findSoapHeaderIndex(headers, 'visitId') >= 0 && hasSoapTextColumn(headers)) {
      return { index, delimiter, headers };
    }
  }
  return null;
}

function clean(value: string | undefined): string {
  return normalizeFullWidth(value || '').trim();
}

function normalizeDate(value: string): string {
  const text = normalizeFullWidth(value).trim();
  if (!text) return '';
  const digits = text.replace(/[^\d]/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  const match = text.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if (!match) return text;
  return [
    match[1],
    match[2].padStart(2, '0'),
    match[3].padStart(2, '0')
  ].join('-');
}

function normalizeGender(value: string): Patient['gender'] | undefined {
  const text = normalizeHeader(value);
  if (!text) return undefined;
  if (['男', '男性', 'm', 'male', '1'].includes(text)) return 'male';
  if (['女', '女性', 'f', 'female', '2'].includes(text)) return 'female';
  return 'other';
}

function parseBurdenRatio(value: string): number | undefined {
  const text = normalizeFullWidth(value).replace(/[,\s%％割]/g, '').trim();
  if (!text) return undefined;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed <= 10 ? parsed * 10 : parsed;
}

function getOptional(fields: string[], indexes: Record<HeaderKey, number>, field: HeaderKey): string {
  const index = indexes[field];
  return index >= 0 ? clean(fields[index]) : '';
}

function getOptionalVisit(fields: string[], indexes: Record<VisitHeaderKey, number>, field: VisitHeaderKey): string {
  const index = indexes[field];
  return index >= 0 ? clean(fields[index]) : '';
}

function getOptionalDrugStock(fields: string[], indexes: Record<DrugStockHeaderKey, number>, field: DrugStockHeaderKey): string {
  const index = indexes[field];
  return index >= 0 ? clean(fields[index]) : '';
}

function getOptionalSoap(fields: string[], indexes: Record<SoapHeaderKey, number>, field: SoapHeaderKey): string {
  const index = indexes[field];
  return index >= 0 ? clean(fields[index]) : '';
}

function buildRecognizedColumns(
  headers: string[],
  indexes: Record<HeaderKey, number>
): PatientCsvMigrationSourceFormat['recognizedColumns'] {
  const recognizedColumns: PatientCsvMigrationSourceFormat['recognizedColumns'] = {};
  (Object.keys(indexes) as HeaderKey[]).forEach((field) => {
    const index = indexes[field];
    if (index >= 0) {
      recognizedColumns[field] = headers[index];
    }
  });
  return recognizedColumns;
}

function buildVisitRecognizedColumns(
  headers: string[],
  indexes: Record<VisitHeaderKey, number>
): VisitCsvMigrationSourceFormat['recognizedColumns'] {
  const recognizedColumns: VisitCsvMigrationSourceFormat['recognizedColumns'] = {};
  (Object.keys(indexes) as VisitHeaderKey[]).forEach((field) => {
    const index = indexes[field];
    if (index >= 0) {
      recognizedColumns[field] = headers[index];
    }
  });
  return recognizedColumns;
}

function buildDrugStockRecognizedColumns(
  headers: string[],
  indexes: Record<DrugStockHeaderKey, number>
): DrugStockCsvMigrationSourceFormat['recognizedColumns'] {
  const recognizedColumns: DrugStockCsvMigrationSourceFormat['recognizedColumns'] = {};
  (Object.keys(indexes) as DrugStockHeaderKey[]).forEach((field) => {
    const index = indexes[field];
    if (index >= 0) {
      recognizedColumns[field] = headers[index];
    }
  });
  return recognizedColumns;
}

function buildSoapRecognizedColumns(
  headers: string[],
  indexes: Record<SoapHeaderKey, number>
): SoapCsvMigrationSourceFormat['recognizedColumns'] {
  const recognizedColumns: SoapCsvMigrationSourceFormat['recognizedColumns'] = {};
  (Object.keys(indexes) as SoapHeaderKey[]).forEach((field) => {
    const index = indexes[field];
    if (index >= 0) {
      recognizedColumns[field] = headers[index];
    }
  });
  return recognizedColumns;
}

function patientToBackupRow(patient: Patient): Record<string, unknown> {
  return { ...patient };
}

function visitToBackupRow(visit: Visit): Record<string, unknown> {
  return { ...visit };
}

function drugStockToBackupRow(stock: DrugStock): Record<string, unknown> {
  return { ...stock };
}

function soapRecordToBackupRow(soapRecord: SoapRecord): Record<string, unknown> {
  return { ...soapRecord };
}

function statusLabel(status: PatientCsvMigrationPreview['status']): string {
  if (status === 'pass') return 'CSV移行OK';
  if (status === 'attention') return 'CSV要確認';
  return 'CSV修正必要';
}

function normalizeVisitStatus(value: string): Visit['status'] {
  const text = normalizeHeader(value);
  if (!text) return 'completed';
  if (['待ち', '受付', '受付中', '未処理', 'waiting', 'wait', '0'].includes(text)) return 'waiting';
  if (['処理中', '調剤中', '薬歴中', '監査中', 'processing', 'process', '1'].includes(text)) return 'processing';
  if (['完了', '済', '会計済', '投薬済', '調剤済', 'completed', 'complete', 'done', '2'].includes(text)) return 'completed';
  if (['取消', '取り消し', 'キャンセル', '中止', 'cancelled', 'canceled', 'cancel', '9'].includes(text)) return 'cancelled';
  if (/取消|キャンセル|中止|cancel/.test(text)) return 'cancelled';
  if (/処理中|調剤中|監査中|薬歴中|processing/.test(text)) return 'processing';
  if (/待ち|受付|waiting/.test(text)) return 'waiting';
  return 'completed';
}

function parseQuantity(value: string): number | undefined {
  const text = normalizeFullWidth(value).replace(/[,\s錠包本枚個箱瓶gｍmLml]/g, '').trim();
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stockIdPart(value: string, fallback: string): string {
  const normalized = normalizeFullWidth(value).trim() || fallback;
  return normalized.replace(/[^A-Za-z0-9ぁ-んァ-ン一-龥]+/g, '_').replace(/^_+|_+$/g, '') || fallback;
}

function buildGeneratedDrugStockId(stock: Pick<DrugStock, 'drugCode'> & Partial<Pick<DrugStock, 'lotNumber' | 'expirationDate'>>): string {
  return [
    'stock',
    stockIdPart(stock.drugCode, 'drug'),
    stockIdPart(stock.lotNumber || '', 'lotなし'),
    stockIdPart(stock.expirationDate || '', '期限なし')
  ].join('_');
}

function normalizeDateTime(value: string): string {
  const text = normalizeFullWidth(value).trim();
  if (!text) return '';
  const digits = text.replace(/[^\d]/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T00:00:00.000Z`;
  }
  if (digits.length === 12 || digits.length === 14) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14) || '00'}.000Z`;
  }
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  const normalizedDate = normalizeDate(text);
  return normalizedDate ? `${normalizedDate}T00:00:00.000Z` : '';
}

function buildGeneratedSoapId(visitId: string, updatedAt: string, line: number): string {
  return [
    'soap',
    stockIdPart(visitId, 'visit'),
    stockIdPart(updatedAt || String(line), `line_${line}`)
  ].join('_');
}

function buildSoapEntries({
  sText,
  oText,
  aText,
  pText,
  freeText
}: {
  sText: string;
  oText: string;
  aText: string;
  pText: string;
  freeText: string;
}): SoapEntry[] {
  const entries: SoapEntry[] = [];
  if (sText) entries.push({ type: 'S', text: sText });
  if (oText) entries.push({ type: 'O', text: oText });
  if (aText) entries.push({ type: 'A', text: aText });
  if (pText) entries.push({ type: 'P', text: pText });
  if (freeText && entries.length === 0) {
    entries.push({ type: 'S', text: freeText });
  }
  return entries;
}

export function buildPatientCsvMigrationPreview(
  content: string,
  options: { generatedAt?: Date } = {}
): PatientCsvMigrationPreview {
  const generatedAt = options.generatedAt || new Date();
  const normalizedContent = content.replace(/^\ufeff/, '');
  const lines = normalizedContent.split(/\r?\n/).filter((line) => line.trim() !== '');
  const issues: PatientCsvMigrationIssue[] = [];
  const rows: PatientCsvMigrationRow[] = [];

  const emptyBackup: YakurekiBackup = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: generatedAt.toISOString(),
    collections: { patients: [] }
  };

  if (lines.length === 0) {
    const diagnostic = buildBackupMigrationDiagnosticReport(emptyBackup, generatedAt, { requiredCollections: [] });
    return {
      backup: emptyBackup,
      rows,
      issues: [{
        severity: 'error',
        code: 'patient_migration_csv_empty',
        title: '患者CSVが空です',
        message: '既存薬局ソフトから出力した患者CSVまたはTSVを選択してください。'
      }],
      diagnostic,
      status: 'blocked',
      statusLabel: statusLabel('blocked')
    };
  }

  const headerCandidate = findHeaderCandidate(lines);
  if (!headerCandidate) {
    const diagnostic = buildBackupMigrationDiagnosticReport(emptyBackup, generatedAt, { requiredCollections: [] });
    return {
      backup: emptyBackup,
      rows,
      issues: [{
        severity: 'error',
        code: 'patient_migration_csv_header_missing',
        title: '患者CSVの見出しを確認できません',
        message: '患者ID、患者名、生年月日を含むCSV/TSVを選択してください。'
      }],
      diagnostic,
      status: 'blocked',
      statusLabel: statusLabel('blocked')
    };
  }

  const indexes = (Object.keys(HEADER_ALIASES) as HeaderKey[]).reduce((acc, field) => {
    acc[field] = findHeaderIndex(headerCandidate.headers, field);
    return acc;
  }, {} as Record<HeaderKey, number>);

  for (const field of REQUIRED_HEADERS) {
    if (indexes[field] < 0) {
      issues.push({
        severity: 'error',
        code: `patient_migration_csv_${field}_column_missing`,
        title: '患者CSVの必須列が不足しています',
        message: `${HEADER_ALIASES[field][0]} の列を確認できません。列名を確認してください。`,
        line: headerCandidate.index + 1
      });
    }
  }

  if (issues.some((issue) => issue.severity === 'error')) {
    const diagnostic = buildBackupMigrationDiagnosticReport(emptyBackup, generatedAt, { requiredCollections: [] });
    return {
      backup: emptyBackup,
      rows,
      issues,
      sourceFormat: {
        delimiter: headerCandidate.delimiter === '\t' ? 'tab' : 'comma',
        headerLine: headerCandidate.index + 1,
        recognizedColumns: buildRecognizedColumns(headerCandidate.headers, indexes)
      },
      diagnostic,
      status: 'blocked',
      statusLabel: statusLabel('blocked')
    };
  }

  for (let i = headerCandidate.index + 1; i < lines.length; i++) {
    const fields = parseDelimitedLine(lines[i], headerCandidate.delimiter);
    const line = i + 1;
    const patientId = getOptional(fields, indexes, 'patientId');
    const name = getOptional(fields, indexes, 'name');
    const birthDate = normalizeDate(getOptional(fields, indexes, 'birthDate'));
    const kana = getOptional(fields, indexes, 'kana');
    const gender = normalizeGender(getOptional(fields, indexes, 'gender'));
    const insuranceProvider = getOptional(fields, indexes, 'insuranceProvider');
    const insuranceNumber = getOptional(fields, indexes, 'insuranceNumber');
    const insuranceBurdenRatio = parseBurdenRatio(getOptional(fields, indexes, 'insuranceBurdenRatio'));
    const insuranceType = getOptional(fields, indexes, 'insuranceType');
    const insuranceRelationship = getOptional(fields, indexes, 'insuranceRelationship');
    const insuranceValidFrom = normalizeDate(getOptional(fields, indexes, 'insuranceValidFrom'));
    const insuranceValidTo = normalizeDate(getOptional(fields, indexes, 'insuranceValidTo'));

    if (!patientId) {
      issues.push({
        severity: 'error',
        code: 'patient_migration_csv_patient_id_missing',
        title: '患者IDが空です',
        message: `${line}行目の患者IDを確認してください。`,
        line
      });
    }
    if (!name || !birthDate) {
      issues.push({
        severity: 'error',
        code: 'patient_migration_csv_required_value_missing',
        title: '患者名または生年月日が空です',
        message: `${line}行目の患者名と生年月日を確認してください。`,
        line
      });
      continue;
    }

    rows.push({
      line,
      patient: {
        patientId,
        name,
        kana,
        birthDate,
        ...(gender ? { gender } : {}),
        ...((insuranceProvider || insuranceNumber || insuranceBurdenRatio !== undefined || insuranceType || insuranceRelationship || insuranceValidFrom || insuranceValidTo) ? {
          insuranceInfo: {
            ...(insuranceProvider ? { provider: insuranceProvider } : {}),
            ...(insuranceNumber ? { number: insuranceNumber } : {}),
            ...(insuranceBurdenRatio !== undefined ? { burdenRatio: insuranceBurdenRatio } : {}),
            ...(insuranceType ? { insuranceType } : {}),
            ...(insuranceRelationship ? { relationship: insuranceRelationship } : {}),
            ...(insuranceValidFrom ? { validFrom: insuranceValidFrom } : {}),
            ...(insuranceValidTo ? { validTo: insuranceValidTo } : {})
          }
        } : {})
      }
    });
  }

  if (rows.length === 0) {
    issues.push({
      severity: 'error',
      code: 'patient_migration_csv_no_valid_rows',
      title: '取り込める患者行がありません',
      message: '患者名と生年月日が入った行を確認してください。'
    });
  }

  const backup: YakurekiBackup = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: generatedAt.toISOString(),
    collections: {
      patients: rows.map((row) => patientToBackupRow(row.patient))
    }
  };
  const diagnostic = buildBackupMigrationDiagnosticReport(backup, generatedAt, { requiredCollections: [] });
  const hasErrors = issues.some((issue) => issue.severity === 'error');
  const status = hasErrors || diagnostic.status === 'blocked'
    ? 'blocked'
    : issues.length > 0 || diagnostic.status === 'attention'
      ? 'attention'
      : 'pass';

  return {
    backup,
    rows,
    issues,
    sourceFormat: {
      delimiter: headerCandidate.delimiter === '\t' ? 'tab' : 'comma',
      headerLine: headerCandidate.index + 1,
      recognizedColumns: buildRecognizedColumns(headerCandidate.headers, indexes)
    },
    diagnostic,
    status,
    statusLabel: statusLabel(status)
  };
}

export function buildVisitCsvMigrationPreview(
  content: string,
  options: { generatedAt?: Date } = {}
): VisitCsvMigrationPreview {
  const generatedAt = options.generatedAt || new Date();
  const normalizedContent = content.replace(/^\ufeff/, '');
  const lines = normalizedContent.split(/\r?\n/).filter((line) => line.trim() !== '');
  const issues: PatientCsvMigrationIssue[] = [];
  const rows: VisitCsvMigrationRow[] = [];

  const emptyBackup: YakurekiBackup = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: generatedAt.toISOString(),
    collections: { visits: [] }
  };

  if (lines.length === 0) {
    const diagnostic = buildBackupMigrationDiagnosticReport(emptyBackup, generatedAt, { requiredCollections: [] });
    return {
      backup: emptyBackup,
      rows,
      issues: [{
        severity: 'error',
        code: 'visit_migration_csv_empty',
        title: '受付CSVが空です',
        message: '既存薬局ソフトから出力した受付CSVまたはTSVを選択してください。'
      }],
      diagnostic,
      status: 'blocked',
      statusLabel: statusLabel('blocked')
    };
  }

  const headerCandidate = findVisitHeaderCandidate(lines);
  if (!headerCandidate) {
    const diagnostic = buildBackupMigrationDiagnosticReport(emptyBackup, generatedAt, { requiredCollections: [] });
    return {
      backup: emptyBackup,
      rows,
      issues: [{
        severity: 'error',
        code: 'visit_migration_csv_header_missing',
        title: '受付CSVの見出しを確認できません',
        message: '受付ID、患者ID、来局日を含むCSV/TSVを選択してください。'
      }],
      diagnostic,
      status: 'blocked',
      statusLabel: statusLabel('blocked')
    };
  }

  const indexes = (Object.keys(VISIT_HEADER_ALIASES) as VisitHeaderKey[]).reduce((acc, field) => {
    acc[field] = findVisitHeaderIndex(headerCandidate.headers, field);
    return acc;
  }, {} as Record<VisitHeaderKey, number>);

  for (const field of REQUIRED_VISIT_HEADERS) {
    if (indexes[field] < 0) {
      issues.push({
        severity: 'error',
        code: `visit_migration_csv_${field}_column_missing`,
        title: '受付CSVの必須列が不足しています',
        message: `${VISIT_HEADER_ALIASES[field][0]} の列を確認できません。列名を確認してください。`,
        line: headerCandidate.index + 1
      });
    }
  }

  if (issues.some((issue) => issue.severity === 'error')) {
    const diagnostic = buildBackupMigrationDiagnosticReport(emptyBackup, generatedAt, { requiredCollections: [] });
    return {
      backup: emptyBackup,
      rows,
      issues,
      sourceFormat: {
        delimiter: headerCandidate.delimiter === '\t' ? 'tab' : 'comma',
        headerLine: headerCandidate.index + 1,
        recognizedColumns: buildVisitRecognizedColumns(headerCandidate.headers, indexes)
      },
      diagnostic,
      status: 'blocked',
      statusLabel: statusLabel('blocked')
    };
  }

  for (let i = headerCandidate.index + 1; i < lines.length; i++) {
    const fields = parseDelimitedLine(lines[i], headerCandidate.delimiter);
    const line = i + 1;
    const visitId = getOptionalVisit(fields, indexes, 'visitId');
    const patientId = getOptionalVisit(fields, indexes, 'patientId');
    const issueDate = normalizeDate(getOptionalVisit(fields, indexes, 'issueDate'));
    const prescriptionDate = normalizeDate(getOptionalVisit(fields, indexes, 'prescriptionDate'));
    const dispensingDate = normalizeDate(getOptionalVisit(fields, indexes, 'dispensingDate'));
    const institutionCode = getOptionalVisit(fields, indexes, 'institutionCode');
    const institutionName = getOptionalVisit(fields, indexes, 'institutionName');
    const departmentName = getOptionalVisit(fields, indexes, 'departmentName');
    const doctorName = getOptionalVisit(fields, indexes, 'doctorName');

    if (!visitId) {
      issues.push({
        severity: 'error',
        code: 'visit_migration_csv_visit_id_missing',
        title: '受付IDが空です',
        message: `${line}行目の受付IDを確認してください。`,
        line
      });
    }
    if (!patientId || !issueDate) {
      issues.push({
        severity: 'error',
        code: 'visit_migration_csv_required_value_missing',
        title: '患者IDまたは来局日が空です',
        message: `${line}行目の患者IDと来局日を確認してください。`,
        line
      });
      continue;
    }

    rows.push({
      line,
      visit: {
        visitId,
        patientId,
        issueDate,
        status: normalizeVisitStatus(getOptionalVisit(fields, indexes, 'status')),
        ...(prescriptionDate ? { prescriptionDate } : {}),
        ...(dispensingDate ? { dispensingDate } : {}),
        ...(institutionCode ? { institutionCode } : {}),
        ...(institutionName ? { institutionName } : {}),
        ...(departmentName ? { departmentName } : {}),
        ...(doctorName ? { doctorName } : {})
      }
    });
  }

  if (rows.length === 0) {
    issues.push({
      severity: 'error',
      code: 'visit_migration_csv_no_valid_rows',
      title: '取り込める受付行がありません',
      message: '患者IDと来局日が入った行を確認してください。'
    });
  }

  const backup: YakurekiBackup = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: generatedAt.toISOString(),
    collections: {
      visits: rows.map((row) => visitToBackupRow(row.visit))
    }
  };
  const diagnostic = buildBackupMigrationDiagnosticReport(backup, generatedAt, { requiredCollections: [] });
  const hasErrors = issues.some((issue) => issue.severity === 'error');
  const status = hasErrors || diagnostic.status === 'blocked'
    ? 'blocked'
    : issues.length > 0 || diagnostic.status === 'attention'
      ? 'attention'
      : 'pass';

  return {
    backup,
    rows,
    issues,
    sourceFormat: {
      delimiter: headerCandidate.delimiter === '\t' ? 'tab' : 'comma',
      headerLine: headerCandidate.index + 1,
      recognizedColumns: buildVisitRecognizedColumns(headerCandidate.headers, indexes)
    },
    diagnostic,
    status,
    statusLabel: statusLabel(status)
  };
}

export function buildDrugStockCsvMigrationPreview(
  content: string,
  options: { generatedAt?: Date } = {}
): DrugStockCsvMigrationPreview {
  const generatedAt = options.generatedAt || new Date();
  const normalizedContent = content.replace(/^\ufeff/, '');
  const lines = normalizedContent.split(/\r?\n/).filter((line) => line.trim() !== '');
  const issues: PatientCsvMigrationIssue[] = [];
  const rows: DrugStockCsvMigrationRow[] = [];

  const emptyBackup: YakurekiBackup = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: generatedAt.toISOString(),
    collections: { drug_stocks: [] }
  };

  if (lines.length === 0) {
    const diagnostic = buildBackupMigrationDiagnosticReport(emptyBackup, generatedAt, { requiredCollections: [] });
    return {
      backup: emptyBackup,
      rows,
      issues: [{
        severity: 'error',
        code: 'drug_stock_migration_csv_empty',
        title: '在庫CSVが空です',
        message: '既存薬局ソフトから出力した在庫CSVまたはTSVを選択してください。'
      }],
      diagnostic,
      status: 'blocked',
      statusLabel: statusLabel('blocked')
    };
  }

  const headerCandidate = findDrugStockHeaderCandidate(lines);
  if (!headerCandidate) {
    const diagnostic = buildBackupMigrationDiagnosticReport(emptyBackup, generatedAt, { requiredCollections: [] });
    return {
      backup: emptyBackup,
      rows,
      issues: [{
        severity: 'error',
        code: 'drug_stock_migration_csv_header_missing',
        title: '在庫CSVの見出しを確認できません',
        message: '薬品コードと在庫数を含むCSV/TSVを選択してください。'
      }],
      diagnostic,
      status: 'blocked',
      statusLabel: statusLabel('blocked')
    };
  }

  const indexes = (Object.keys(DRUG_STOCK_HEADER_ALIASES) as DrugStockHeaderKey[]).reduce((acc, field) => {
    acc[field] = findDrugStockHeaderIndex(headerCandidate.headers, field);
    return acc;
  }, {} as Record<DrugStockHeaderKey, number>);

  for (const field of REQUIRED_DRUG_STOCK_HEADERS) {
    if (indexes[field] < 0) {
      issues.push({
        severity: 'error',
        code: `drug_stock_migration_csv_${field}_column_missing`,
        title: '在庫CSVの必須列が不足しています',
        message: `${DRUG_STOCK_HEADER_ALIASES[field][0]} の列を確認できません。列名を確認してください。`,
        line: headerCandidate.index + 1
      });
    }
  }

  if (issues.some((issue) => issue.severity === 'error')) {
    const diagnostic = buildBackupMigrationDiagnosticReport(emptyBackup, generatedAt, { requiredCollections: [] });
    return {
      backup: emptyBackup,
      rows,
      issues,
      sourceFormat: {
        delimiter: headerCandidate.delimiter === '\t' ? 'tab' : 'comma',
        headerLine: headerCandidate.index + 1,
        recognizedColumns: buildDrugStockRecognizedColumns(headerCandidate.headers, indexes)
      },
      diagnostic,
      status: 'blocked',
      statusLabel: statusLabel('blocked')
    };
  }

  for (let i = headerCandidate.index + 1; i < lines.length; i++) {
    const fields = parseDelimitedLine(lines[i], headerCandidate.delimiter);
    const line = i + 1;
    const drugCode = getOptionalDrugStock(fields, indexes, 'drugCode');
    const quantity = parseQuantity(getOptionalDrugStock(fields, indexes, 'quantity'));
    const janCode = getOptionalDrugStock(fields, indexes, 'janCode');
    const lotNumber = getOptionalDrugStock(fields, indexes, 'lotNumber');
    const expirationDate = normalizeDate(getOptionalDrugStock(fields, indexes, 'expirationDate'));
    const arrivalDate = normalizeDate(getOptionalDrugStock(fields, indexes, 'arrivalDate'));
    const supplier = getOptionalDrugStock(fields, indexes, 'supplier');
    const explicitId = getOptionalDrugStock(fields, indexes, 'id');

    if (!drugCode || quantity === undefined) {
      issues.push({
        severity: 'error',
        code: 'drug_stock_migration_csv_required_value_missing',
        title: '薬品コードまたは在庫数が空です',
        message: `${line}行目の薬品コードと在庫数を確認してください。`,
        line
      });
      continue;
    }

    const generatedId = buildGeneratedDrugStockId({ drugCode, lotNumber, expirationDate });
    if (!explicitId) {
      issues.push({
        severity: 'warning',
        code: 'drug_stock_migration_csv_id_generated',
        title: '在庫IDを自動採番しました',
        message: `${line}行目は薬品コード、ロット、使用期限から移行用IDを作成しました。重複がないか確認してください。`,
        line
      });
    }

    rows.push({
      line,
      stock: {
        id: explicitId || generatedId,
        drugCode,
        quantity,
        ...(janCode ? { janCode } : {}),
        ...(lotNumber ? { lotNumber } : {}),
        ...(expirationDate ? { expirationDate } : {}),
        ...(arrivalDate ? { arrivalDate } : {}),
        ...(supplier ? { supplier } : {})
      }
    });
  }

  if (rows.length === 0) {
    issues.push({
      severity: 'error',
      code: 'drug_stock_migration_csv_no_valid_rows',
      title: '取り込める在庫行がありません',
      message: '薬品コードと在庫数が入った行を確認してください。'
    });
  }

  const backup: YakurekiBackup = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: generatedAt.toISOString(),
    collections: {
      drug_stocks: rows.map((row) => drugStockToBackupRow(row.stock))
    }
  };
  const diagnostic = buildBackupMigrationDiagnosticReport(backup, generatedAt, { requiredCollections: [] });
  const hasErrors = issues.some((issue) => issue.severity === 'error');
  const status = hasErrors || diagnostic.status === 'blocked'
    ? 'blocked'
    : issues.length > 0 || diagnostic.status === 'attention'
      ? 'attention'
      : 'pass';

  return {
    backup,
    rows,
    issues,
    sourceFormat: {
      delimiter: headerCandidate.delimiter === '\t' ? 'tab' : 'comma',
      headerLine: headerCandidate.index + 1,
      recognizedColumns: buildDrugStockRecognizedColumns(headerCandidate.headers, indexes)
    },
    diagnostic,
    status,
    statusLabel: statusLabel(status)
  };
}

export function buildSoapCsvMigrationPreview(
  content: string,
  options: { generatedAt?: Date } = {}
): SoapCsvMigrationPreview {
  const generatedAt = options.generatedAt || new Date();
  const normalizedContent = content.replace(/^\ufeff/, '');
  const lines = normalizedContent.split(/\r?\n/).filter((line) => line.trim() !== '');
  const issues: PatientCsvMigrationIssue[] = [];
  const rows: SoapCsvMigrationRow[] = [];

  const emptyBackup: YakurekiBackup = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: generatedAt.toISOString(),
    collections: { soap_records: [] }
  };

  if (lines.length === 0) {
    const diagnostic = buildBackupMigrationDiagnosticReport(emptyBackup, generatedAt, { requiredCollections: [] });
    return {
      backup: emptyBackup,
      rows,
      issues: [{
        severity: 'error',
        code: 'soap_migration_csv_empty',
        title: '薬歴CSVが空です',
        message: '既存薬局ソフトから出力した薬歴CSVまたはTSVを選択してください。'
      }],
      diagnostic,
      status: 'blocked',
      statusLabel: statusLabel('blocked')
    };
  }

  const headerCandidate = findSoapHeaderCandidate(lines);
  if (!headerCandidate) {
    const diagnostic = buildBackupMigrationDiagnosticReport(emptyBackup, generatedAt, { requiredCollections: [] });
    return {
      backup: emptyBackup,
      rows,
      issues: [{
        severity: 'error',
        code: 'soap_migration_csv_header_missing',
        title: '薬歴CSVの見出しを確認できません',
        message: '受付IDとS/O/A/Pまたは薬歴本文を含むCSV/TSVを選択してください。'
      }],
      diagnostic,
      status: 'blocked',
      statusLabel: statusLabel('blocked')
    };
  }

  const indexes = (Object.keys(SOAP_HEADER_ALIASES) as SoapHeaderKey[]).reduce((acc, field) => {
    acc[field] = findSoapHeaderIndex(headerCandidate.headers, field);
    return acc;
  }, {} as Record<SoapHeaderKey, number>);

  if (indexes.visitId < 0 || !hasSoapTextColumn(headerCandidate.headers)) {
    issues.push({
      severity: 'error',
      code: 'soap_migration_csv_required_column_missing',
      title: '薬歴CSVの必須列が不足しています',
      message: '受付IDとS/O/A/Pまたは薬歴本文の列を確認してください。',
      line: headerCandidate.index + 1
    });
  }

  if (issues.some((issue) => issue.severity === 'error')) {
    const diagnostic = buildBackupMigrationDiagnosticReport(emptyBackup, generatedAt, { requiredCollections: [] });
    return {
      backup: emptyBackup,
      rows,
      issues,
      sourceFormat: {
        delimiter: headerCandidate.delimiter === '\t' ? 'tab' : 'comma',
        headerLine: headerCandidate.index + 1,
        recognizedColumns: buildSoapRecognizedColumns(headerCandidate.headers, indexes)
      },
      diagnostic,
      status: 'blocked',
      statusLabel: statusLabel('blocked')
    };
  }

  for (let i = headerCandidate.index + 1; i < lines.length; i++) {
    const fields = parseDelimitedLine(lines[i], headerCandidate.delimiter);
    const line = i + 1;
    const visitId = getOptionalSoap(fields, indexes, 'visitId');
    const authorId = getOptionalSoap(fields, indexes, 'authorId') || 'migration';
    const updatedAt = normalizeDateTime(getOptionalSoap(fields, indexes, 'updatedAt'));
    const problemId = getOptionalSoap(fields, indexes, 'problemId') || 'migration_problem';
    const problemTitle = getOptionalSoap(fields, indexes, 'problemTitle') || '移行薬歴';
    const entries = buildSoapEntries({
      sText: getOptionalSoap(fields, indexes, 'sText'),
      oText: getOptionalSoap(fields, indexes, 'oText'),
      aText: getOptionalSoap(fields, indexes, 'aText'),
      pText: getOptionalSoap(fields, indexes, 'pText'),
      freeText: getOptionalSoap(fields, indexes, 'freeText')
    });

    if (!visitId) {
      issues.push({
        severity: 'error',
        code: 'soap_migration_csv_visit_id_missing',
        title: '受付IDが空です',
        message: `${line}行目の受付IDを確認してください。`,
        line
      });
    }
    if (entries.length === 0) {
      issues.push({
        severity: 'error',
        code: 'soap_migration_csv_text_missing',
        title: '薬歴本文が空です',
        message: `${line}行目のS/O/A/Pまたは薬歴本文を確認してください。`,
        line
      });
      continue;
    }
    if (!visitId) continue;

    const explicitSoapId = getOptionalSoap(fields, indexes, 'soapId');
    const soapId = explicitSoapId || buildGeneratedSoapId(visitId, updatedAt, line);
    if (!explicitSoapId) {
      issues.push({
        severity: 'warning',
        code: 'soap_migration_csv_id_generated',
        title: '薬歴IDを自動採番しました',
        message: `${line}行目は受付IDと記録日時から移行用薬歴IDを作成しました。重複がないか確認してください。`,
        line
      });
    }

    rows.push({
      line,
      soapRecord: {
        soapId,
        visitId,
        authorId,
        problems: [{
          id: problemId,
          title: problemTitle,
          entries
        }],
        ...(updatedAt ? { updatedAt } : {})
      }
    });
  }

  if (rows.length === 0) {
    issues.push({
      severity: 'error',
      code: 'soap_migration_csv_no_valid_rows',
      title: '取り込める薬歴行がありません',
      message: '受付IDと薬歴本文が入った行を確認してください。'
    });
  }

  const backup: YakurekiBackup = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: generatedAt.toISOString(),
    collections: {
      soap_records: rows.map((row) => soapRecordToBackupRow(row.soapRecord))
    }
  };
  const diagnostic = buildBackupMigrationDiagnosticReport(backup, generatedAt, { requiredCollections: [] });
  const hasErrors = issues.some((issue) => issue.severity === 'error');
  const status = hasErrors || diagnostic.status === 'blocked'
    ? 'blocked'
    : issues.length > 0 || diagnostic.status === 'attention'
      ? 'attention'
      : 'pass';

  return {
    backup,
    rows,
    issues,
    sourceFormat: {
      delimiter: headerCandidate.delimiter === '\t' ? 'tab' : 'comma',
      headerLine: headerCandidate.index + 1,
      recognizedColumns: buildSoapRecognizedColumns(headerCandidate.headers, indexes)
    },
    diagnostic,
    status,
    statusLabel: statusLabel(status)
  };
}

const MIGRATION_SOURCE_TITLES: Record<MigrationPackageSourceKind, string> = {
  patients: '患者',
  visits: '受付',
  drug_stocks: '在庫',
  soap_records: '薬歴'
};

const DEFAULT_REQUIRED_MIGRATION_SOURCES: MigrationPackageSourceKind[] = ['patients', 'visits'];
const DEFAULT_RECOMMENDED_MIGRATION_SOURCES: MigrationPackageSourceKind[] = [
  'patients',
  'visits',
  'drug_stocks',
  'soap_records'
];

type AnyMigrationPreview =
  | PatientCsvMigrationPreview
  | VisitCsvMigrationPreview
  | DrugStockCsvMigrationPreview
  | SoapCsvMigrationPreview;

function migrationReadinessStatusLabel(status: MigrationPackageReadinessStatus): string {
  if (status === 'pass') return '導入移行OK';
  if (status === 'attention') return '導入移行を確認';
  return '導入移行不可';
}

function migrationActionLabel(status: MigrationPackageReadinessStatus): string {
  if (status === 'pass') return '1日テスト開始OK';
  if (status === 'attention') return '責任者確認';
  return '修正必須';
}

function uniqueMigrationSourceKinds(value: MigrationPackageSourceKind[] | undefined, fallback: MigrationPackageSourceKind[]): MigrationPackageSourceKind[] {
  const kinds = Array.isArray(value) && value.length > 0 ? value : fallback;
  return [...new Set(kinds)];
}

function previewStatusToReadinessStatus(status: AnyMigrationPreview['status']): MigrationPackageReadinessStatus {
  return status;
}

function sourcePreviewFromInput(
  input: BuildMigrationPackageReadinessReviewInput,
  kind: MigrationPackageSourceKind
): AnyMigrationPreview | undefined {
  if (kind === 'patients') return input.patients;
  if (kind === 'visits') return input.visits;
  if (kind === 'drug_stocks') return input.drugStocks;
  return input.soapRecords;
}

function rowCountForPreview(preview: AnyMigrationPreview | undefined): number {
  return preview?.rows.length ?? 0;
}

function recognizedColumnCount(preview: AnyMigrationPreview | undefined): number {
  return Object.values(preview?.sourceFormat?.recognizedColumns ?? {}).filter(Boolean).length;
}

function sourceNextAction(options: {
  kind: MigrationPackageSourceKind;
  required: boolean;
  preview?: AnyMigrationPreview;
  status: MigrationPackageReadinessStatus;
}): string {
  if (!options.preview) {
    return options.required
      ? `${MIGRATION_SOURCE_TITLES[options.kind]}CSV/TSVを出力して移行プレビューにかける`
      : `${MIGRATION_SOURCE_TITLES[options.kind]}CSV/TSVも可能なら出力して移行プレビューにかける`;
  }
  if (options.status === 'pass') return '対応不要';
  if (options.status === 'blocked') {
    return '必須列、ID欠落、同一ID重複を修正してから再プレビューする';
  }
  return '文字化け疑い、自動採番、列認識、必須領域不足を責任者が確認する';
}

function buildMigrationPackageSourceReview(options: {
  kind: MigrationPackageSourceKind;
  required: boolean;
  preview?: AnyMigrationPreview;
}): MigrationPackageSourceReview {
  const status: MigrationPackageReadinessStatus = options.preview
    ? previewStatusToReadinessStatus(options.preview.status)
    : options.required
      ? 'blocked'
      : 'attention';
  const errorIssueCount = options.preview?.issues.filter((issue) => issue.severity === 'error').length ?? 0;
  const warningIssueCount = options.preview?.issues.filter((issue) => issue.severity === 'warning').length ?? 0;

  return {
    kind: options.kind,
    title: MIGRATION_SOURCE_TITLES[options.kind],
    required: options.required,
    provided: Boolean(options.preview),
    status,
    statusLabel: migrationReadinessStatusLabel(status),
    rowCount: rowCountForPreview(options.preview),
    issueCount: options.preview?.issues.length ?? 0,
    errorIssueCount,
    warningIssueCount,
    recognizedColumnCount: recognizedColumnCount(options.preview),
    missingPrimaryKeyCount: options.preview?.diagnostic.missingPrimaryKeyCount ?? 0,
    duplicatePrimaryKeyCount: options.preview?.diagnostic.duplicatePrimaryKeyCount ?? 0,
    mojibakeSuspectCount: options.preview?.diagnostic.mojibakeSuspectCount ?? 0,
    nextAction: sourceNextAction({ ...options, status })
  };
}

function buildVisitPatientReferenceReview(
  patients: PatientCsvMigrationPreview | undefined,
  visits: VisitCsvMigrationPreview | undefined
): MigrationPackageReferenceReview {
  if (!patients || !visits || patients.status === 'blocked' || visits.status === 'blocked') {
    return {
      id: 'visit_patient_reference',
      title: '受付と患者の対応',
      status: 'attention',
      statusLabel: migrationReadinessStatusLabel('attention'),
      checkedRowCount: 0,
      issueCount: 0,
      nextAction: '患者CSVと受付CSVをそろえてから対応関係を確認する'
    };
  }

  const patientIds = new Set(patients.rows.map((row) => row.patient.patientId).filter(Boolean));
  const missingReferenceCount = visits.rows.filter((row) => !patientIds.has(row.visit.patientId)).length;
  const status: MigrationPackageReadinessStatus = missingReferenceCount > 0 ? 'blocked' : 'pass';
  return {
    id: 'visit_patient_reference',
    title: '受付と患者の対応',
    status,
    statusLabel: migrationReadinessStatusLabel(status),
    checkedRowCount: visits.rows.length,
    issueCount: missingReferenceCount,
    nextAction: missingReferenceCount > 0
      ? '受付CSVの患者IDが患者CSVに存在するか確認する'
      : '対応不要'
  };
}

function buildSoapVisitReferenceReview(
  visits: VisitCsvMigrationPreview | undefined,
  soapRecords: SoapCsvMigrationPreview | undefined
): MigrationPackageReferenceReview {
  if (!visits || !soapRecords || visits.status === 'blocked' || soapRecords.status === 'blocked') {
    return {
      id: 'soap_visit_reference',
      title: '薬歴と受付の対応',
      status: 'attention',
      statusLabel: migrationReadinessStatusLabel('attention'),
      checkedRowCount: 0,
      issueCount: 0,
      nextAction: '受付CSVと薬歴CSVをそろえてから対応関係を確認する'
    };
  }

  const visitIds = new Set(visits.rows.map((row) => row.visit.visitId).filter(Boolean));
  const missingReferenceCount = soapRecords.rows.filter((row) => !visitIds.has(row.soapRecord.visitId)).length;
  const status: MigrationPackageReadinessStatus = missingReferenceCount > 0 ? 'blocked' : 'pass';
  return {
    id: 'soap_visit_reference',
    title: '薬歴と受付の対応',
    status,
    statusLabel: migrationReadinessStatusLabel(status),
    checkedRowCount: soapRecords.rows.length,
    issueCount: missingReferenceCount,
    nextAction: missingReferenceCount > 0
      ? '薬歴CSVの受付IDが受付CSVに存在するか確認する'
      : '対応不要'
  };
}

function summarizeMigrationPackageStatus(
  sources: MigrationPackageSourceReview[],
  references: MigrationPackageReferenceReview[]
): MigrationPackageReadinessStatus {
  if (sources.some((source) => source.status === 'blocked') || references.some((reference) => reference.status === 'blocked')) {
    return 'blocked';
  }
  if (sources.some((source) => source.status === 'attention') || references.some((reference) => reference.status === 'attention')) {
    return 'attention';
  }
  return 'pass';
}

export function buildMigrationPackageReadinessReview(
  input: BuildMigrationPackageReadinessReviewInput = {}
): MigrationPackageReadinessReview {
  const generatedAt = input.generatedAt ?? new Date();
  const requiredSourceKinds = uniqueMigrationSourceKinds(input.requiredSourceKinds, DEFAULT_REQUIRED_MIGRATION_SOURCES);
  const recommendedSourceKinds = uniqueMigrationSourceKinds(input.recommendedSourceKinds, DEFAULT_RECOMMENDED_MIGRATION_SOURCES);
  const sourceKinds = uniqueMigrationSourceKinds([...requiredSourceKinds, ...recommendedSourceKinds], DEFAULT_RECOMMENDED_MIGRATION_SOURCES);
  const requiredSet = new Set(requiredSourceKinds);

  const sources = sourceKinds.map((kind) => buildMigrationPackageSourceReview({
    kind,
    required: requiredSet.has(kind),
    preview: sourcePreviewFromInput(input, kind)
  }));
  const references = [
    buildVisitPatientReferenceReview(input.patients, input.visits),
    buildSoapVisitReferenceReview(input.visits, input.soapRecords)
  ];
  const status = summarizeMigrationPackageStatus(sources, references);
  const totalRowCount = sources.reduce((sum, source) => sum + source.rowCount, 0);
  const totalIssueCount = sources.reduce((sum, source) => sum + source.issueCount, 0);
  const referenceIssueCount = references.reduce((sum, reference) => sum + reference.issueCount, 0);
  const readyForOneDayTrial = status === 'pass'
    && (sources.find((source) => source.kind === 'patients')?.rowCount ?? 0) > 0
    && (sources.find((source) => source.kind === 'visits')?.rowCount ?? 0) > 0;

  return {
    type: 'yakureki-migration-package-readiness-review',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    status,
    statusLabel: migrationReadinessStatusLabel(status),
    actionLabel: readyForOneDayTrial ? '1日テスト開始OK' : migrationActionLabel(status),
    readyForOneDayTrial,
    requiredSourceCount: requiredSourceKinds.length,
    providedSourceCount: sources.filter((source) => source.provided).length,
    passedSourceCount: sources.filter((source) => source.status === 'pass').length,
    attentionSourceCount: sources.filter((source) => source.status === 'attention').length,
    blockedSourceCount: sources.filter((source) => source.status === 'blocked').length,
    totalRowCount,
    totalIssueCount,
    referenceIssueCount,
    privacy: {
      containsPatientData: false,
      containsRawRows: false,
      containsLocalPath: false,
      containsFileName: false,
      containsSourcePrimaryKeys: false
    },
    sources,
    references
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildMigrationPackageReadinessCsv(review: MigrationPackageReadinessReview): string {
  const rows = [
    ['区分', '判定', '対象', '件数', '指摘', '列認識', '次の対応'],
    [
      '総括',
      review.statusLabel,
      review.actionLabel,
      `${review.totalRowCount}件`,
      `CSV指摘${review.totalIssueCount}件 / 参照不整合${review.referenceIssueCount}件`,
      '患者情報なし / 原文行なし / ローカルパスなし / ファイル名なし / 元IDなし',
      review.readyForOneDayTrial ? '導入初日のテストを開始できる' : '未完了または要確認のCSVを修正する'
    ],
    ...review.sources.map((source) => [
      '移行CSV',
      source.statusLabel,
      source.title,
      `${source.rowCount}件`,
      `エラー${source.errorIssueCount}件 / 確認${source.warningIssueCount}件 / ID欠落${source.missingPrimaryKeyCount}件 / 重複${source.duplicatePrimaryKeyCount}件 / 文字化け疑い${source.mojibakeSuspectCount}件`,
      `${source.recognizedColumnCount}列`,
      source.nextAction
    ]),
    ...review.references.map((reference) => [
      '対応関係',
      reference.statusLabel,
      reference.title,
      `${reference.checkedRowCount}件確認`,
      `${reference.issueCount}件`,
      '',
      reference.nextAction
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildMigrationPackageReadinessAuditDetail(review: MigrationPackageReadinessReview): string {
  const rowCount = (kind: MigrationPackageSourceKind) => review.sources.find((source) => source.kind === kind)?.rowCount ?? 0;
  return [
    `導入移行レビュー ${review.statusLabel}`,
    `患者${rowCount('patients')}件・受付${rowCount('visits')}件・在庫${rowCount('drug_stocks')}件・薬歴${rowCount('soap_records')}件`,
    `CSV指摘${review.totalIssueCount}件・参照不整合${review.referenceIssueCount}件`,
    `1日テスト ${review.readyForOneDayTrial ? '開始OK' : '要確認'}`,
    '患者情報なし'
  ].join(' / ');
}
