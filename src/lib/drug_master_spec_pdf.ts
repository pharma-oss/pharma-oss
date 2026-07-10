import {
  DRUG_MASTER_SPECIFICATION_COLUMNS,
  DRUG_MASTER_SPECIFICATION_SOURCE,
  type DrugMasterSpecificationColumn,
  type DrugMasterSpecificationSource
} from './drug_master_csv.ts';

export type DrugMasterSpecificationPdfDiffField = 'label' | 'mode' | 'digits' | 'bytes';

export interface DrugMasterSpecificationPdfParseResult {
  columns: DrugMasterSpecificationColumn[];
  issues: string[];
}

export interface DrugMasterSpecificationPdfDifference {
  itemNumber: number;
  field: DrugMasterSpecificationPdfDiffField;
  expected: string | number;
  observed: string | number;
}

export interface DrugMasterSpecificationPdfDiffReview {
  ok: boolean;
  source: DrugMasterSpecificationSource;
  expectedColumnCount: number;
  parsedColumnCount: number;
  matchedColumnCount: number;
  missingItemNumbers: number[];
  extraItemNumbers: number[];
  differences: DrugMasterSpecificationPdfDifference[];
  parseIssues: string[];
}

const MODE_PATTERN = '(数字|英数カナ|英数|漢字)';

function normalizePdfText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/英数カナ/g, '英数カナ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function extractDrugMasterSection(value: string): string {
  const normalized = normalizePdfText(value);
  const start = normalized.indexOf('〈医薬品マスター〉');
  if (start < 0) return normalized;

  const section = normalized.slice(start);
  const nextMasterMatch = section.slice(1).match(/〈[^〉]+マスター〉/);
  if (!nextMasterMatch || nextMasterMatch.index === undefined) return section;
  return section.slice(0, nextMasterMatch.index + 1);
}

function compactLabel(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/英数カナ/g, '英数カナ');
}

function canonicalizePdfLabel(itemNumber: number, label: string): string {
  if (itemNumber === 8 && label === 'コード') return '単位コード';
  if (itemNumber === 9 && label === '漢字有効桁数') return '単位漢字有効桁数';
  if (itemNumber === 10 && label === '漢字名称') return '単位漢字名称';
  if (itemNumber === 14 && label === '麻薬・毒薬・覚醒剤原料・向精神') return '麻薬・毒薬・覚醒剤原料・向精神薬';
  if (itemNumber === 34 && label === '経過措置年月日又は商品名医薬') return '経過措置年月日又は商品名医薬品コード使用期限';
  return label;
}

function normalizeModeText(value: string): string {
  return value
    .replace(/英\s*数\s*カ\s*ナ/g, '英数カナ')
    .replace(/数\s*字/g, '数字')
    .replace(/英\s*数/g, '英数')
    .replace(/漢\s*字/g, '漢字');
}

function splitDigitsAndBytes(value: string, itemNumber: number): { digits: number; bytes: number } | null {
  const digitsOnly = value.normalize('NFKC').replace(/[^\d]/g, '');
  if (digitsOnly.length < 2) return null;
  const expected = DRUG_MASTER_SPECIFICATION_COLUMNS[itemNumber - 1];
  if (expected) {
    const expectedText = `${expected.digits}${expected.bytes}`;
    if (digitsOnly.startsWith(expectedText)) {
      return {
        digits: expected.digits,
        bytes: expected.bytes
      };
    }
  }

  const candidates: Array<{ digits: number; bytes: number; score: number }> = [];
  for (let split = 1; split < digitsOnly.length; split++) {
    const digits = Number.parseInt(digitsOnly.slice(0, split), 10);
    const bytes = Number.parseInt(digitsOnly.slice(split), 10);
    if (!Number.isFinite(digits) || !Number.isFinite(bytes) || digits <= 0 || bytes <= 0) continue;
    const relationshipScore = bytes === digits ? 0 : bytes === digits * 2 ? 1 : bytes >= digits ? 3 : 8;
    const expectedScore = expected ? Math.abs(expected.digits - digits) + Math.abs(expected.bytes - bytes) : 0;
    candidates.push({ digits, bytes, score: relationshipScore + expectedScore });
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0] || null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loosePrefixPattern(value: string): string {
  return compactLabel(value).slice(0, 4).split('').map(escapeRegExp).join('\\s*');
}

function expectedPdfLabelPrefix(itemNumber: number): string {
  if (itemNumber === 8) return 'コード';
  if (itemNumber === 9) return '漢字有効桁数';
  if (itemNumber === 10) return '漢字名称';
  if (itemNumber === 14) return '麻薬・毒薬・覚醒剤原料・向精神';
  if (itemNumber === 34) return '経過措置年月日又は商品名医薬';
  return DRUG_MASTER_SPECIFICATION_COLUMNS[itemNumber - 1]?.label || '';
}

function findItemStart(text: string, itemNumber: number, fromIndex: number): RegExpExecArray | null {
  const itemNumberPattern = String(itemNumber).split('').join('\\s*');
  const labelPrefix = expectedPdfLabelPrefix(itemNumber);
  if (labelPrefix) {
    const labeledRegex = new RegExp(`(?:^|\\s)${itemNumberPattern}\\s*(?=${loosePrefixPattern(labelPrefix)})`, 'g');
    labeledRegex.lastIndex = fromIndex;
    const labeledMatch = labeledRegex.exec(text);
    if (labeledMatch) return labeledMatch;
  }

  const genericRegex = new RegExp(`(?:^|\\s)${itemNumberPattern}\\s*`, 'g');
  genericRegex.lastIndex = fromIndex;
  return genericRegex.exec(text);
}

function findItemRow(text: string, itemNumber: number, fromIndex: number): { column: DrugMasterSpecificationColumn; rowEnd: number } | null {
  const current = findItemStart(text, itemNumber, fromIndex);
  if (!current) return null;
  const currentStart = current.index + current[0].length;
  const next = itemNumber < DRUG_MASTER_SPECIFICATION_SOURCE.expectedItemCount
    ? findItemStart(text, itemNumber + 1, currentStart)
    : null;
  const segment = normalizeModeText(text.slice(currentStart, next?.index ?? text.length).trim());
  const match = segment.match(new RegExp(`^(.*?)\\s*${MODE_PATTERN}\\s*([\\d０-９\\s]+)([\\s\\S]*)?$`));
  if (!match) return null;

  const label = canonicalizePdfLabel(itemNumber, compactLabel(match[1]));
  const mode = match[2] as DrugMasterSpecificationColumn['mode'];
  const lengthPair = splitDigitsAndBytes(match[3], itemNumber);
  if (!lengthPair) return null;

  return {
    column: {
      itemNumber,
      index: itemNumber - 1,
      label,
      mode,
      digits: lengthPair.digits,
      bytes: lengthPair.bytes
    },
    rowEnd: next?.index ?? currentStart + segment.length
  };
}

export function parseDrugMasterSpecificationPdfText(pdfText: string): DrugMasterSpecificationPdfParseResult {
  const section = extractDrugMasterSection(pdfText).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
  const columns: DrugMasterSpecificationColumn[] = [];
  const issues: string[] = [];
  let searchIndex = 0;

  for (let itemNumber = 1; itemNumber <= DRUG_MASTER_SPECIFICATION_SOURCE.expectedItemCount; itemNumber++) {
    const row = findItemRow(section, itemNumber, searchIndex);
    if (!row) {
      issues.push(`${itemNumber}番の項目をPDF本文から抽出できません。`);
      continue;
    }

    columns.push(row.column);
    searchIndex = row.rowEnd;
  }

  return { columns, issues };
}

function sameValue(expected: string | number, observed: string | number): boolean {
  if (typeof expected === 'string' && typeof observed === 'string') {
    return compactLabel(expected) === compactLabel(observed);
  }
  return expected === observed;
}

export function buildDrugMasterSpecificationPdfDiffReview(
  pdfText: string,
  expectedColumns: DrugMasterSpecificationColumn[] = DRUG_MASTER_SPECIFICATION_COLUMNS,
  source: DrugMasterSpecificationSource = DRUG_MASTER_SPECIFICATION_SOURCE
): DrugMasterSpecificationPdfDiffReview {
  const parseResult = parseDrugMasterSpecificationPdfText(pdfText);
  const observedByItemNumber = new Map(parseResult.columns.map((column) => [column.itemNumber, column]));
  const expectedByItemNumber = new Map(expectedColumns.map((column) => [column.itemNumber, column]));
  const differences: DrugMasterSpecificationPdfDifference[] = [];
  const missingItemNumbers: number[] = [];
  const extraItemNumbers: number[] = [];

  for (const expected of expectedColumns) {
    const observed = observedByItemNumber.get(expected.itemNumber);
    if (!observed) {
      missingItemNumbers.push(expected.itemNumber);
      continue;
    }

    (['label', 'mode', 'digits', 'bytes'] as const).forEach((field) => {
      if (!sameValue(expected[field], observed[field])) {
        differences.push({
          itemNumber: expected.itemNumber,
          field,
          expected: expected[field],
          observed: observed[field]
        });
      }
    });
  }

  for (const observed of parseResult.columns) {
    if (!expectedByItemNumber.has(observed.itemNumber)) {
      extraItemNumbers.push(observed.itemNumber);
    }
  }

  return {
    ok: parseResult.issues.length === 0
      && missingItemNumbers.length === 0
      && extraItemNumbers.length === 0
      && differences.length === 0,
    source,
    expectedColumnCount: expectedColumns.length,
    parsedColumnCount: parseResult.columns.length,
    matchedColumnCount: expectedColumns.length - missingItemNumbers.length - new Set(differences.map((diff) => diff.itemNumber)).size,
    missingItemNumbers,
    extraItemNumbers,
    differences,
    parseIssues: parseResult.issues
  };
}

export function formatDrugMasterSpecificationPdfDiffReview(
  review: DrugMasterSpecificationPdfDiffReview
): string {
  const issueText = review.parseIssues.length > 0
    ? ` / 読取確認 ${review.parseIssues.slice(0, 3).join('・')}${review.parseIssues.length > 3 ? `ほか${review.parseIssues.length - 3}件` : ''}`
    : '';
  const diffText = review.differences.length > 0
    ? ` / 差分 ${review.differences.slice(0, 4).map((diff) => `${diff.itemNumber}.${diff.field}:${diff.expected}->${diff.observed}`).join('・')}${review.differences.length > 4 ? `ほか${review.differences.length - 4}件` : ''}`
    : '';
  const missingText = review.missingItemNumbers.length > 0
    ? ` / 未抽出 ${review.missingItemNumbers.join('・')}`
    : '';

  return `${review.source.label}: ${review.ok ? 'OK' : '要確認'} / PDF本文項目 ${review.parsedColumnCount}/${review.expectedColumnCount} / 一致 ${review.matchedColumnCount}/${review.expectedColumnCount}${issueText}${diffText}${missingText}`;
}
