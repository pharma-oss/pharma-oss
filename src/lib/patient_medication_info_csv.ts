import type { PatientMedicationInfoTemplate } from '../db/types.ts';
import { getPatientMedicationInfoApprovalReadinessIssues } from './patient_medication_info.ts';

export type PatientMedicationInfoCsvIssueSeverity = 'error' | 'warning';

export interface PatientMedicationInfoCsvIssue {
  severity: PatientMedicationInfoCsvIssueSeverity;
  code: string;
  message: string;
  rowNumber?: number;
}

export interface PatientMedicationInfoCsvDraft {
  rowNumber: number;
  drugCode: string;
  drugName: string;
  genericName?: string;
  counselingText?: string;
  sideEffectText?: string;
  sourceType: NonNullable<PatientMedicationInfoTemplate['sourceType']>;
  sourceUrl?: string;
  sourceRevisionDate?: string;
  sourceHash?: string;
  readyForApproval: boolean;
}

export interface PatientMedicationInfoCsvParseResult {
  drafts: PatientMedicationInfoCsvDraft[];
  issues: PatientMedicationInfoCsvIssue[];
  readyForApprovalCount: number;
}

type CsvField =
  | 'drugCode'
  | 'drugName'
  | 'genericName'
  | 'counselingText'
  | 'sideEffectText'
  | 'sourceType'
  | 'sourceUrl'
  | 'sourceRevisionDate'
  | 'sourceHash';

const CSV_COLUMNS: Array<{ field: CsvField; label: string; aliases: string[] }> = [
  { field: 'drugCode', label: '薬品コード', aliases: ['drugCode', '医薬品コード', 'YJコード'] },
  { field: 'drugName', label: '薬品名', aliases: ['drugName', '医薬品名', '販売名'] },
  { field: 'genericName', label: '一般名・成分名', aliases: ['genericName', '一般名', '成分名'] },
  { field: 'sideEffectText', label: '副作用・相談目安', aliases: ['sideEffectText', '副作用'] },
  { field: 'counselingText', label: '使用上の注意', aliases: ['counselingText', '服薬指導', '使い方'] },
  { field: 'sourceType', label: '参照元区分', aliases: ['sourceType'] },
  { field: 'sourceUrl', label: '参照元URL', aliases: ['sourceUrl'] },
  { field: 'sourceRevisionDate', label: '参照元版日', aliases: ['sourceRevisionDate', '版日'] },
  { field: 'sourceHash', label: '参照元ハッシュ・管理番号', aliases: ['sourceHash', '管理番号'] }
];

const SOURCE_TYPES = new Set<NonNullable<PatientMedicationInfoTemplate['sourceType']>>([
  'pmda_insert',
  'pmda_patient_guide',
  'pharmacy_authored',
  'licensed',
  'other'
]);
const SOURCE_TYPE_EXPORT_LABELS: Record<NonNullable<PatientMedicationInfoTemplate['sourceType']>, string> = {
  pmda_insert: 'PMDA 添付文書',
  pmda_patient_guide: 'PMDA 患者向医薬品ガイド',
  pharmacy_authored: '薬局作成',
  licensed: '許諾済み資料',
  other: 'その他'
};
const SOURCE_TYPE_ALIASES = new Map<string, NonNullable<PatientMedicationInfoTemplate['sourceType']>>([
  ['pmda_insert', 'pmda_insert'],
  ['pmda添付文書', 'pmda_insert'],
  ['pmda_添付文書', 'pmda_insert'],
  ['添付文書', 'pmda_insert'],
  ['pmda_patient_guide', 'pmda_patient_guide'],
  ['pmda患者向医薬品ガイド', 'pmda_patient_guide'],
  ['患者向医薬品ガイド', 'pmda_patient_guide'],
  ['患者向け医薬品ガイド', 'pmda_patient_guide'],
  ['pharmacy_authored', 'pharmacy_authored'],
  ['薬局作成', 'pharmacy_authored'],
  ['自店作成', 'pharmacy_authored'],
  ['licensed', 'licensed'],
  ['許諾済み資料', 'licensed'],
  ['ライセンス資料', 'licensed'],
  ['other', 'other'],
  ['その他', 'other']
]);

const MAX_CSV_ROWS = 25_000;

const normalizeHeader = (value: string): string => value
  .replace(/^\ufeff/, '')
  .normalize('NFKC')
  .replace(/[\s_＿・･()（）［\]\[\]／/\-‐‑‒–—―]/g, '')
  .toLowerCase();

const trimOrUndefined = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

function parseCsvRecords(csvText: string): { rows: string[][]; rowNumbers: number[]; unterminatedQuote: boolean } {
  const text = csvText.replace(/^\ufeff/, '');
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let lineNumber = 1;
  let rowStartLine = 1;

  const pushRow = () => {
    row.push(field);
    if (row.some((value) => value.trim())) {
      rows.push(row);
      rowNumbers.push(rowStartLine);
    }
    row = [];
    field = '';
  };

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      pushRow();
      lineNumber++;
      rowStartLine = lineNumber;
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      field += '\n';
      lineNumber++;
      continue;
    }
    field += char;
  }

  if (row.length > 0 || field.length > 0) pushRow();
  return { rows, rowNumbers, unterminatedQuote: inQuotes };
}

function escapeCsvValue(value: string): string {
  const spreadsheetSafe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${spreadsheetSafe.replace(/"/g, '""')}"`;
}

function restoreSpreadsheetSafeValue(value: string): string {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

function normalizeSourceTypeValue(value: string): NonNullable<PatientMedicationInfoTemplate['sourceType']> | null {
  const normalized = value
    .normalize('NFKC')
    .replace(/[\s・･()（）［\]\[\]／/\-‐‑‒–—―]/g, '')
    .toLowerCase();
  return SOURCE_TYPE_ALIASES.get(normalized) || null;
}

export function buildPatientMedicationInfoTemplateCsv(
  templates: PatientMedicationInfoTemplate[]
): string {
  const header = CSV_COLUMNS.map((column) => escapeCsvValue(column.label)).join(',');
  const rows = templates.map((template) => CSV_COLUMNS.map(({ field }) => {
    const value = template[field];
    if (field === 'sourceType' && typeof value === 'string' && SOURCE_TYPES.has(value as NonNullable<PatientMedicationInfoTemplate['sourceType']>)) {
      return escapeCsvValue(SOURCE_TYPE_EXPORT_LABELS[value as NonNullable<PatientMedicationInfoTemplate['sourceType']>]);
    }
    return escapeCsvValue(typeof value === 'string' ? value : '');
  }).join(','));
  return [header, ...rows].join('\r\n');
}

export function makePatientMedicationInfoCsvFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `yakureki_medication_info_drafts_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.csv`;
}

export function parsePatientMedicationInfoTemplateCsv(csvText: string): PatientMedicationInfoCsvParseResult {
  const issues: PatientMedicationInfoCsvIssue[] = [];
  const parsed = parseCsvRecords(csvText);
  if (parsed.unterminatedQuote) {
    return {
      drafts: [],
      issues: [{ severity: 'error', code: 'unterminated_quote', message: 'CSVの引用符が閉じていません。' }],
      readyForApprovalCount: 0
    };
  }
  if (parsed.rows.length === 0) {
    return {
      drafts: [],
      issues: [{ severity: 'error', code: 'empty_csv', message: 'CSVに見出し行がありません。' }],
      readyForApprovalCount: 0
    };
  }

  const normalizedHeaders = parsed.rows[0].map(normalizeHeader);
  const columnIndexes = new Map<CsvField, number>();
  for (const column of CSV_COLUMNS) {
    const aliases = [column.label, ...column.aliases].map(normalizeHeader);
    const index = normalizedHeaders.findIndex((header) => aliases.includes(header));
    if (index < 0) {
      issues.push({
        severity: 'error',
        code: 'missing_column',
        message: `必須列「${column.label}」がありません。`,
        rowNumber: parsed.rowNumbers[0]
      });
    } else {
      columnIndexes.set(column.field, index);
    }
  }
  if (issues.some((issue) => issue.severity === 'error')) {
    return { drafts: [], issues, readyForApprovalCount: 0 };
  }

  if (parsed.rows.length - 1 > MAX_CSV_ROWS) {
    return {
      drafts: [],
      issues: [{
        severity: 'error',
        code: 'too_many_rows',
        message: `CSVは${MAX_CSV_ROWS.toLocaleString()}件以下に分割してください。`
      }],
      readyForApprovalCount: 0
    };
  }

  const drafts: PatientMedicationInfoCsvDraft[] = [];
  const seenDrugCodes = new Map<string, number>();
  const getValue = (row: string[], field: CsvField): string => {
    const index = columnIndexes.get(field);
    return restoreSpreadsheetSafeValue(index === undefined ? '' : row[index] || '').trim();
  };

  for (let index = 1; index < parsed.rows.length; index++) {
    const row = parsed.rows[index];
    const rowNumber = parsed.rowNumbers[index];
    const drugCode = getValue(row, 'drugCode');
    const drugName = getValue(row, 'drugName');
    if (!drugCode) {
      issues.push({ severity: 'error', code: 'missing_drug_code', message: '薬品コードがありません。', rowNumber });
    }
    if (!drugName) {
      issues.push({ severity: 'error', code: 'missing_drug_name', message: '薬品名がありません。', rowNumber });
    }
    const duplicateRow = drugCode ? seenDrugCodes.get(drugCode) : undefined;
    if (duplicateRow !== undefined) {
      issues.push({
        severity: 'error',
        code: 'duplicate_drug_code',
        message: `薬品コード ${drugCode} が${duplicateRow}行目と重複しています。`,
        rowNumber
      });
    } else if (drugCode) {
      seenDrugCodes.set(drugCode, rowNumber);
    }

    const sourceTypeValue = getValue(row, 'sourceType') || 'pharmacy_authored';
    const normalizedSourceType = normalizeSourceTypeValue(sourceTypeValue);
    if (!normalizedSourceType || !SOURCE_TYPES.has(normalizedSourceType)) {
      issues.push({
        severity: 'error',
        code: 'invalid_source_type',
        message: `参照元区分「${sourceTypeValue}」は使用できません。`,
        rowNumber
      });
    }

    const draft: PatientMedicationInfoCsvDraft = {
      rowNumber,
      drugCode,
      drugName,
      genericName: trimOrUndefined(getValue(row, 'genericName')),
      counselingText: trimOrUndefined(getValue(row, 'counselingText')),
      sideEffectText: trimOrUndefined(getValue(row, 'sideEffectText')),
      sourceType: normalizedSourceType || 'pharmacy_authored',
      sourceUrl: trimOrUndefined(getValue(row, 'sourceUrl')),
      sourceRevisionDate: trimOrUndefined(getValue(row, 'sourceRevisionDate')),
      sourceHash: trimOrUndefined(getValue(row, 'sourceHash')),
      readyForApproval: false
    };
    const readinessProbe: PatientMedicationInfoTemplate = {
      ...draft,
      templateId: `csv_probe_${index}`,
      status: 'draft'
    };
    const readinessIssues = getPatientMedicationInfoApprovalReadinessIssues(readinessProbe);
    draft.readyForApproval = readinessIssues.length === 0;
    if (readinessIssues.length > 0 && drugCode && drugName) {
      issues.push({
        severity: 'warning',
        code: 'approval_requirements_incomplete',
        message: `承認前の不足: ${readinessIssues.map((issue) => issue.message).join('、')}。下書きとして取り込めます。`,
        rowNumber
      });
    }
    drafts.push(draft);
  }

  return {
    drafts,
    issues,
    readyForApprovalCount: drafts.filter((draft) => draft.readyForApproval).length
  };
}
