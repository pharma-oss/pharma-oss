import {
  DISPENSING_OFFICIAL_FEE_CODE_OVERRIDE_ITEMS,
  type OfficialFeeCodeOverrideKey
} from './calculator.ts';

export type OfficialFeeCodeOverrideCsvIssueSeverity = 'error' | 'warning';
export type OfficialFeeCodeOverrideCsvIssueCode =
  | 'missing_header'
  | 'unknown_key'
  | 'invalid_code'
  | 'missing_master_header'
  | 'missing_master_name'
  | 'duplicate_master_match';

export interface OfficialFeeCodeOverrideCsvIssue {
  severity: OfficialFeeCodeOverrideCsvIssueSeverity;
  code: OfficialFeeCodeOverrideCsvIssueCode;
  rowNumber: number;
  message: string;
}

export interface OfficialFeeCodeOverrideCsvParseResult {
  overrides: Partial<Record<OfficialFeeCodeOverrideKey, string>>;
  issues: OfficialFeeCodeOverrideCsvIssue[];
  importedCount: number;
  clearedCount: number;
  skippedCount: number;
}

export interface OfficialFeeCodeMasterProposalCandidate {
  key: OfficialFeeCodeOverrideKey;
  label: string;
  groupLabel: string;
  officialFeeCode: string;
  masterName: string;
  rowNumber: number;
  confidence: 'name_match';
}

export interface OfficialFeeCodeMasterUnresolvedItem {
  key: OfficialFeeCodeOverrideKey;
  label: string;
  groupLabel: string;
  reason: 'not_found' | 'duplicate';
}

export interface OfficialFeeCodeMasterProposal {
  overrides: Partial<Record<OfficialFeeCodeOverrideKey, string>>;
  candidates: OfficialFeeCodeMasterProposalCandidate[];
  unresolvedItems: OfficialFeeCodeMasterUnresolvedItem[];
  issues: OfficialFeeCodeOverrideCsvIssue[];
  matchedCount: number;
  unresolvedCount: number;
  duplicateCount: number;
  skippedRowCount: number;
}

interface OfficialFeeCodeMasterRow {
  officialFeeCode: string;
  name: string;
  rowNumber: number;
}

const GROUP_LABELS: Record<string, string> = {
  base: '基本料',
  addition: '加算・減算',
  preparation: '調製',
  management: '薬学管理'
};

const KNOWN_KEYS = new Set<OfficialFeeCodeOverrideKey>(
  DISPENSING_OFFICIAL_FEE_CODE_OVERRIDE_ITEMS.map((item) => item.key)
);

const HEADER_ALIASES = {
  key: ['項目キー', 'キー', 'key', 'item_key'],
  code: ['公式算定コード', '算定コード', 'コード', 'receiptFeeCode', 'officialFeeCode']
};

const MASTER_HEADER_ALIASES = {
  code: ['公式算定コード', '算定コード', 'コード', 'receiptFeeCode', 'officialFeeCode', 'code'],
  name: ['項目名', '算定項目名', '算定名称', '名称', '項目名称', 'name', 'feeName']
};

function formatDateTimeStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function escapeCsvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells;
}

function findHeaderIndex(headers: string[], aliases: string[]): number {
  const normalizedAliases = new Set(aliases.map((alias) => alias.toLowerCase()));
  return headers.findIndex((header) => normalizedAliases.has(header.trim().toLowerCase()));
}

function isOfficialFeeCode(value: string): boolean {
  return /^\d{9}$/.test(value);
}

function normalizeFeeName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[()\[\]{}（）［］｛｝【】「」『』・･\s　、,，.．]/g, '')
    .toLowerCase();
}

function getGroupLabel(group: string): string {
  return GROUP_LABELS[group] || group;
}

export function makeOfficialFeeCodeOverrideCsvFileName(date = new Date()): string {
  return `yakureki_official_fee_codes_${formatDateTimeStamp(date)}.csv`;
}

export function makeOfficialFeeCodeMasterProposalReviewCsvFileName(date = new Date()): string {
  return `yakureki_official_fee_code_master_review_${formatDateTimeStamp(date)}.csv`;
}

export function buildOfficialFeeCodeOverrideTemplateCsv(
  overrides: Record<string, string> = {}
): string {
  const rows = [
    ['項目キー', '項目名', '分類', '公式算定コード'],
    ...DISPENSING_OFFICIAL_FEE_CODE_OVERRIDE_ITEMS.map((item) => {
      const value = String(overrides[item.key] || '').trim();
      return [
        item.key,
        item.label,
        getGroupLabel(item.group),
        isOfficialFeeCode(value) ? value : ''
      ];
    })
  ];
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

export function parseOfficialFeeCodeOverrideCsv(
  csvText: string
): OfficialFeeCodeOverrideCsvParseResult {
  const issues: OfficialFeeCodeOverrideCsvIssue[] = [];
  const overrides: Partial<Record<OfficialFeeCodeOverrideKey, string>> = {};
  const lines = csvText
    .replace(/^\ufeff/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      overrides,
      issues: [{
        severity: 'error',
        code: 'missing_header',
        rowNumber: 1,
        message: 'CSVの見出し行がありません。'
      }],
      importedCount: 0,
      clearedCount: 0,
      skippedCount: 0
    };
  }

  const headers = parseCsvLine(lines[0]);
  const keyIndex = findHeaderIndex(headers, HEADER_ALIASES.key);
  const codeIndex = findHeaderIndex(headers, HEADER_ALIASES.code);
  if (keyIndex < 0 || codeIndex < 0) {
    return {
      overrides,
      issues: [{
        severity: 'error',
        code: 'missing_header',
        rowNumber: 1,
        message: 'CSVに「項目キー」と「公式算定コード」の列が必要です。'
      }],
      importedCount: 0,
      clearedCount: 0,
      skippedCount: Math.max(0, lines.length - 1)
    };
  }

  let importedCount = 0;
  let clearedCount = 0;
  let skippedCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1;
    const cols = parseCsvLine(lines[i]);
    const rawKey = String(cols[keyIndex] || '').trim();
    const rawCode = String(cols[codeIndex] || '').trim();

    if (!KNOWN_KEYS.has(rawKey as OfficialFeeCodeOverrideKey)) {
      skippedCount++;
      issues.push({
        severity: 'warning',
        code: 'unknown_key',
        rowNumber,
        message: `未対応の項目キー「${rawKey || '空欄'}」を読み飛ばしました。`
      });
      continue;
    }

    if (rawCode && !isOfficialFeeCode(rawCode)) {
      skippedCount++;
      issues.push({
        severity: 'error',
        code: 'invalid_code',
        rowNumber,
        message: `公式算定コードは9桁数字で入力してください（${rawKey}）。`
      });
      continue;
    }

    overrides[rawKey as OfficialFeeCodeOverrideKey] = rawCode;
    if (rawCode) {
      importedCount++;
    } else {
      clearedCount++;
    }
  }

  return {
    overrides,
    issues,
    importedCount,
    clearedCount,
    skippedCount
  };
}

export function buildOfficialFeeCodeMasterProposalFromCsv(
  csvText: string
): OfficialFeeCodeMasterProposal {
  const issues: OfficialFeeCodeOverrideCsvIssue[] = [];
  const rows: OfficialFeeCodeMasterRow[] = [];
  const lines = csvText
    .replace(/^\ufeff/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      overrides: {},
      candidates: [],
      unresolvedItems: DISPENSING_OFFICIAL_FEE_CODE_OVERRIDE_ITEMS.map((item) => ({
        key: item.key,
        label: item.label,
        groupLabel: getGroupLabel(item.group),
        reason: 'not_found'
      })),
      issues: [{
        severity: 'error',
        code: 'missing_master_header',
        rowNumber: 1,
        message: '公式マスターCSVの見出し行がありません。'
      }],
      matchedCount: 0,
      unresolvedCount: DISPENSING_OFFICIAL_FEE_CODE_OVERRIDE_ITEMS.length,
      duplicateCount: 0,
      skippedRowCount: 0
    };
  }

  const headers = parseCsvLine(lines[0]);
  const codeIndex = findHeaderIndex(headers, MASTER_HEADER_ALIASES.code);
  const nameIndex = findHeaderIndex(headers, MASTER_HEADER_ALIASES.name);
  if (codeIndex < 0 || nameIndex < 0) {
    return {
      overrides: {},
      candidates: [],
      unresolvedItems: DISPENSING_OFFICIAL_FEE_CODE_OVERRIDE_ITEMS.map((item) => ({
        key: item.key,
        label: item.label,
        groupLabel: getGroupLabel(item.group),
        reason: 'not_found'
      })),
      issues: [{
        severity: 'error',
        code: 'missing_master_header',
        rowNumber: 1,
        message: '公式マスターCSVに「算定コード」と「名称」の列が必要です。'
      }],
      matchedCount: 0,
      unresolvedCount: DISPENSING_OFFICIAL_FEE_CODE_OVERRIDE_ITEMS.length,
      duplicateCount: 0,
      skippedRowCount: Math.max(0, lines.length - 1)
    };
  }

  let skippedRowCount = 0;
  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1;
    const cols = parseCsvLine(lines[i]);
    const rawCode = String(cols[codeIndex] || '').trim();
    const name = String(cols[nameIndex] || '').trim();
    if (!rawCode && !name) continue;

    if (!name) {
      skippedRowCount++;
      issues.push({
        severity: 'warning',
        code: 'missing_master_name',
        rowNumber,
        message: `名称が空欄のため読み飛ばしました（${rawCode || 'コード空欄'}）。`
      });
      continue;
    }
    if (!isOfficialFeeCode(rawCode)) {
      skippedRowCount++;
      issues.push({
        severity: 'warning',
        code: 'invalid_code',
        rowNumber,
        message: `9桁数字ではない算定コードを読み飛ばしました（${name}）。`
      });
      continue;
    }

    rows.push({
      officialFeeCode: rawCode,
      name,
      rowNumber
    });
  }

  const rowsByName = new Map<string, OfficialFeeCodeMasterRow[]>();
  for (const row of rows) {
    const normalizedName = normalizeFeeName(row.name);
    rowsByName.set(normalizedName, [...(rowsByName.get(normalizedName) || []), row]);
  }

  const overrides: Partial<Record<OfficialFeeCodeOverrideKey, string>> = {};
  const candidates: OfficialFeeCodeMasterProposalCandidate[] = [];
  const unresolvedItems: OfficialFeeCodeMasterUnresolvedItem[] = [];
  let duplicateCount = 0;

  for (const item of DISPENSING_OFFICIAL_FEE_CODE_OVERRIDE_ITEMS) {
    const matches = rowsByName.get(normalizeFeeName(item.label)) || [];
    const groupLabel = getGroupLabel(item.group);
    if (matches.length === 1) {
      const match = matches[0];
      overrides[item.key] = match.officialFeeCode;
      candidates.push({
        key: item.key,
        label: item.label,
        groupLabel,
        officialFeeCode: match.officialFeeCode,
        masterName: match.name,
        rowNumber: match.rowNumber,
        confidence: 'name_match'
      });
      continue;
    }

    const reason = matches.length > 1 ? 'duplicate' : 'not_found';
    if (reason === 'duplicate') {
      duplicateCount++;
      issues.push({
        severity: 'warning',
        code: 'duplicate_master_match',
        rowNumber: matches[0].rowNumber,
        message: `${item.label} に複数の候補があるため自動反映しません。`
      });
    }
    unresolvedItems.push({
      key: item.key,
      label: item.label,
      groupLabel,
      reason
    });
  }

  return {
    overrides,
    candidates,
    unresolvedItems,
    issues,
    matchedCount: candidates.length,
    unresolvedCount: unresolvedItems.length,
    duplicateCount,
    skippedRowCount
  };
}

export function buildOfficialFeeCodeMasterProposalReviewCsv(
  proposal: OfficialFeeCodeMasterProposal,
  sourceFileName = ''
): string {
  const rows: unknown[][] = [
    ['区分', '元ファイル', '項目キー', '項目名', '分類', '公式算定コード', '公式表名称', '公式表行', '判定', 'メモ'],
    ...proposal.candidates.map((candidate) => [
      '候補',
      sourceFileName,
      candidate.key,
      candidate.label,
      candidate.groupLabel,
      candidate.officialFeeCode,
      candidate.masterName,
      candidate.rowNumber,
      '名称一致',
      ''
    ]),
    ...proposal.unresolvedItems.map((item) => [
      item.reason === 'duplicate' ? '重複' : '未一致',
      sourceFileName,
      item.key,
      item.label,
      item.groupLabel,
      '',
      '',
      '',
      item.reason === 'duplicate' ? '複数候補あり' : '候補なし',
      item.reason === 'duplicate' ? '画面または公式表で確認して手入力してください。' : '公式表の名称表記を確認してください。'
    ]),
    ...proposal.issues.map((issue) => [
      '確認事項',
      sourceFileName,
      '',
      '',
      '',
      '',
      '',
      issue.rowNumber,
      issue.severity === 'error' ? 'エラー' : '確認',
      issue.message
    ])
  ];
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}
