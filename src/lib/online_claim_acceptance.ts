import type { Visit } from '@/db/types';
import {
  getClaimLifecycleStatus,
  markClaimAccepted,
  markClaimReturned,
  type ClaimLifecycleState
} from '@/lib/claim_lifecycle';

export type OnlineClaimAcceptanceStatus = 'accepted' | 'returned';
export type OnlineClaimAcceptanceIssueSeverity = 'error' | 'warning';

export interface OnlineClaimAcceptanceIssue {
  severity: OnlineClaimAcceptanceIssueSeverity;
  code: string;
  title: string;
  message: string;
  line?: number;
  visitId?: string;
}

export interface OnlineClaimAcceptanceResultRow {
  visitId: string;
  status: OnlineClaimAcceptanceStatus;
  patientId?: string;
  patientName?: string;
  totalPoints?: number;
  receiptNumber?: string;
  fileName?: string;
  reason?: string;
  line: number;
}

export interface OnlineClaimAcceptanceSourceFormat {
  delimiter: 'comma' | 'tab' | 'fixed_width_text' | 'pdf_text';
  headerLine: number;
  recognizedColumns: Partial<Record<keyof Omit<OnlineClaimAcceptanceResultRow, 'line'>, string>>;
}

export interface OnlineClaimAcceptanceParseResult {
  rows: OnlineClaimAcceptanceResultRow[];
  issues: OnlineClaimAcceptanceIssue[];
  sourceFormat?: OnlineClaimAcceptanceSourceFormat;
}

export interface OnlineClaimAcceptanceReconciliationItem {
  row: OnlineClaimAcceptanceResultRow;
  visit?: Visit;
  nextLifecycle?: ClaimLifecycleState;
  issues: OnlineClaimAcceptanceIssue[];
}

export interface OnlineClaimAcceptanceReconciliation {
  items: OnlineClaimAcceptanceReconciliationItem[];
  issues: OnlineClaimAcceptanceIssue[];
  acceptedCount: number;
  returnedCount: number;
}

const HEADER_ALIASES = {
  visitId: ['受付ID', '受付id', 'visitId', 'visit_id', '来局ID', '来局番号', '受付管理ID', '請求受付ID', 'レセプトID', 'レセプト番号', 'レセプト管理番号', '請求管理番号', 'claimId', 'claim_id'],
  patientId: ['患者id', '患者ID', 'patientId', 'patient_id', '患者番号', '患者コード', 'カルテ番号', 'patientNo', 'patient_no'],
  patientName: ['患者名', '患者氏名', '氏名', '漢字氏名', 'カナ氏名', '被保険者氏名', 'patientName', 'patient_name'],
  status: ['結果', '受付結果', '請求結果', '処理結果', '受付状態', '請求状態', '状態', '審査結果', '受付区分', 'status', 'result'],
  totalPoints: ['点数', '合計点数', 'totalPoints', '請求点数', '総点数', 'レセプト点数', '請求合計点数'],
  receiptNumber: ['受付番号', '受付管理番号', '受理番号', '受付管理連番', 'receiptNumber', 'acceptanceReceiptNumber'],
  fileName: ['UKEファイル', 'ファイル名', '請求ファイル', '請求ファイル名', 'レセプトファイル', 'fileName'],
  reason: ['理由', '返戻理由', '返戻事由', 'エラー内容', 'エラー理由', '受付不能理由', 'メッセージ', 'message', '備考', '事由']
};

type HeaderKey = keyof typeof HEADER_ALIASES;
type ParsedPdfTextBlock = {
  fields: Partial<Record<HeaderKey, string>>;
  firstLine: number;
};
const CANONICAL_ACCEPTANCE_COLUMNS: Record<HeaderKey, string> = {
  visitId: '受付ID',
  patientId: '患者ID',
  patientName: '患者名',
  status: '受付結果',
  totalPoints: '点数',
  receiptNumber: '受付番号',
  fileName: 'ファイル名',
  reason: '理由'
};

interface HeaderCandidate {
  index: number;
  delimiter: ',' | '\t' | 'fixed_width_text';
  headers: string[];
  columnStarts?: number[];
}

function normalizeFullWidth(value: string): string {
  return value.normalize('NFKC').replace(/\u3000/g, ' ');
}

function normalizeHeader(value: string): string {
  return normalizeFullWidth(value)
    .trim()
    .replace(/[\s_\-‐-‒–—―・:：()（）\[\]［］]/g, '')
    .toLowerCase();
}

function findHeaderIndex(headers: string[], aliases: string[]): number {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.findIndex((header) => normalizedAliases.includes(normalizeHeader(header)));
}

function findHeaderKey(label: string): HeaderKey | null {
  const normalizedLabel = normalizeHeader(label);
  for (const key of Object.keys(HEADER_ALIASES) as HeaderKey[]) {
    if (HEADER_ALIASES[key].some((alias) => normalizeHeader(alias) === normalizedLabel)) {
      return key;
    }
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function acceptanceLabelAliases(): Array<{ alias: string; key: HeaderKey }> {
  return (Object.keys(HEADER_ALIASES) as HeaderKey[])
    .flatMap((key) => HEADER_ALIASES[key].map((alias) => ({ alias: normalizeFullWidth(alias), key })))
    .sort((left, right) => right.alias.length - left.alias.length);
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

function detectDelimitedDelimiter(line: string): ',' | '\t' | null {
  if (line.includes('\t')) return '\t';
  if (line.includes(',')) return ',';
  return null;
}

function normalizeStatus(value: string): OnlineClaimAcceptanceStatus | null {
  const text = normalizeHeader(value);
  if (!text) return null;
  if (['0', '00', '0000', '受付済', '受付済み', '受理', '受理済', '受付完了', '正常', '正常終了', '処理済', '審査済', 'accepted', 'accept', 'ok'].includes(text)) {
    return 'accepted';
  }
  if (['1', '01', '返戻', '返戻あり', '返戻対象', '返戻済', '要修正', 'エラー', 'エラーあり', '受付不能', '不受理', '不備', 'returned', 'rejected', 'reject', 'ng', 'error'].includes(text)) {
    return 'returned';
  }
  if (/返戻なし|エラーなし|正常|受付済|受付完了|受理|処理済|審査済/.test(text)) {
    return 'accepted';
  }
  if (/返戻|要修正|エラー|受付不能|不受理|不備|returned|rejected|reject|ng|error/.test(text)) {
    return 'returned';
  }
  return null;
}

function parsePoints(value: string): number | undefined {
  const text = normalizeFullWidth(value).replace(/[,\s点]/g, '').trim();
  if (!text) return undefined;
  const points = Number(text);
  return Number.isFinite(points) ? points : undefined;
}

function cleanOptionalField(value: string | undefined): string | undefined {
  const text = normalizeFullWidth(value || '').trim();
  return text || undefined;
}

function normalizePatientName(value: string): string {
  return normalizeFullWidth(value).replace(/\s/g, '').toLowerCase();
}

function findHeaderCandidate(lines: string[]): HeaderCandidate | null {
  for (let index = 0; index < lines.length; index++) {
    const delimiter = detectDelimitedDelimiter(lines[index]);
    if (delimiter) {
      const headers = parseDelimitedLine(lines[index], delimiter);
      if (isAcceptanceHeader(headers)) {
        return { index, delimiter, headers };
      }
    }

    const fixedWidthColumns = parseFixedWidthColumns(lines[index]);
    if (fixedWidthColumns.length >= 2) {
      const headers = fixedWidthColumns.map((column) => column.text);
      if (isAcceptanceHeader(headers)) {
        return {
          index,
          delimiter: 'fixed_width_text',
          headers,
          columnStarts: fixedWidthColumns.map((column) => column.start)
        };
      }
    }
  }
  return null;
}

function isAcceptanceHeader(headers: string[]): boolean {
  if (headers.length < 2) return false;
  const visitIdIndex = findHeaderIndex(headers, HEADER_ALIASES.visitId);
  const statusIndex = findHeaderIndex(headers, HEADER_ALIASES.status);
  return visitIdIndex >= 0 && statusIndex >= 0;
}

function parseFixedWidthColumns(line: string): Array<{ text: string; start: number }> {
  const normalized = normalizeFullWidth(line).replace(/\t/g, '  ');
  const columns: Array<{ text: string; start: number }> = [];
  const separator = / {2,}/g;
  let segmentStart = 0;
  let match: RegExpExecArray | null;

  while ((match = separator.exec(normalized)) !== null) {
    const segment = normalized.slice(segmentStart, match.index);
    const firstTextIndex = segment.search(/\S/);
    if (firstTextIndex >= 0) {
      columns.push({
        text: segment.trim(),
        start: segmentStart + firstTextIndex
      });
    }
    segmentStart = match.index + match[0].length;
  }

  const tail = normalized.slice(segmentStart);
  const firstTextIndex = tail.search(/\S/);
  if (firstTextIndex >= 0) {
    columns.push({
      text: tail.trim(),
      start: segmentStart + firstTextIndex
    });
  }
  return columns;
}

function parseFixedWidthLine(line: string, columnStarts: number[], expectedColumns: number): string[] {
  const normalized = normalizeFullWidth(line).replace(/\t/g, '  ');
  const fields: string[] = [];
  for (let i = 0; i < expectedColumns; i++) {
    const start = columnStarts[i] ?? 0;
    const end = columnStarts[i + 1] ?? normalized.length;
    fields.push(normalized.slice(start, end).trim());
  }
  return fields;
}

function parseAcceptanceFields(line: string, headerCandidate: HeaderCandidate): string[] {
  if (headerCandidate.delimiter === 'fixed_width_text') {
    const positionedFields = parseFixedWidthLine(
      line,
      headerCandidate.columnStarts || [],
      headerCandidate.headers.length
    );
    const splitFields = normalizeSparseFixedWidthFields(
      parseFixedWidthColumns(line).map((column) => column.text),
      headerCandidate.headers
    );
    const statusIndex = findHeaderIndex(headerCandidate.headers, HEADER_ALIASES.status);
    const positionedStatus = normalizeStatus(positionedFields[statusIndex] || '');
    const splitStatus = normalizeStatus(splitFields[statusIndex] || '');
    if (splitStatus && !positionedStatus) return splitFields;
    if (splitStatus && splitFields.filter(Boolean).length >= positionedFields.filter(Boolean).length) {
      return splitFields;
    }
    if (positionedFields.filter(Boolean).length >= 2) return positionedFields;
    return splitFields;
  }
  return parseDelimitedLine(line, headerCandidate.delimiter);
}

function normalizeSparseFixedWidthFields(fields: string[], headers: string[]): string[] {
  const normalized = [...fields];
  const receiptNumberIndex = findHeaderIndex(headers, HEADER_ALIASES.receiptNumber);
  const totalPointsIndex = findHeaderIndex(headers, HEADER_ALIASES.totalPoints);

  if (
    normalized.length === headers.length - 1 &&
    receiptNumberIndex >= 0 &&
    totalPointsIndex >= 0 &&
    parsePoints(normalized[receiptNumberIndex] || '') !== undefined &&
    parsePoints(normalized[totalPointsIndex] || '') === undefined
  ) {
    normalized.splice(receiptNumberIndex, 0, '');
  }

  while (normalized.length < headers.length) {
    normalized.push('');
  }
  return normalized.slice(0, headers.length);
}

function isSummaryRow(fields: string[]): boolean {
  const first = normalizeHeader(fields[0] || '');
  return ['合計', '小計', '総計', '件数', '出力日時', '作成日時'].some((label) => first.startsWith(label));
}

function isBlockSeparator(line: string): boolean {
  const text = normalizeFullWidth(line).trim();
  return /^[-=]{3,}$/.test(text) || /^[-= ]*次ページ[-= ]*$/.test(text) || /^ページ\s*\d+/.test(text);
}

function findLabelOccurrences(line: string, requireColon: boolean): Array<{ key: HeaderKey; label: string; start: number; end: number }> {
  const normalizedLine = normalizeFullWidth(line);
  const occurrences: Array<{ key: HeaderKey; label: string; start: number; end: number }> = [];

  for (const { alias, key } of acceptanceLabelAliases()) {
    const suffix = requireColon ? '\\s*[：:]' : '';
    const regex = new RegExp(`${escapeRegExp(alias)}${suffix}`, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(normalizedLine)) !== null) {
      occurrences.push({
        key,
        label: alias,
        start: match.index,
        end: match.index + match[0].length
      });
    }
  }

  return occurrences
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .filter((candidate, index, sorted) => {
      const previous = sorted[index - 1];
      return !previous || candidate.start >= previous.end;
    });
}

function parsePdfTextKeyValueLine(line: string): Partial<Record<HeaderKey, string>> {
  const normalizedLine = normalizeFullWidth(line).trim();
  const fields: Partial<Record<HeaderKey, string>> = {};
  if (!normalizedLine || isSummaryRow([normalizedLine]) || isBlockSeparator(normalizedLine)) {
    return fields;
  }

  const colonLabels = findLabelOccurrences(normalizedLine, true);
  if (colonLabels.length > 0) {
    for (let index = 0; index < colonLabels.length; index++) {
      const current = colonLabels[index];
      const next = colonLabels[index + 1];
      const value = normalizedLine.slice(current.end, next?.start ?? normalizedLine.length).trim();
      if (value) fields[current.key] = value;
    }
    return fields;
  }

  const looseLabels = findLabelOccurrences(normalizedLine, false);
  if (looseLabels.length >= 2) {
    for (let index = 0; index < looseLabels.length; index++) {
      const current = looseLabels[index];
      const next = looseLabels[index + 1];
      const value = normalizedLine.slice(current.end, next?.start ?? normalizedLine.length)
        .replace(/^[：:\s]+/, '')
        .trim();
      if (value) fields[current.key] = value;
    }
    return fields;
  }

  const fixedWidthColumns = parseFixedWidthColumns(normalizedLine).map((column) => column.text);
  if (fixedWidthColumns.length >= 2) {
    for (let index = 0; index < fixedWidthColumns.length - 1; index += 2) {
      const key = findHeaderKey(fixedWidthColumns[index]);
      if (key && fixedWidthColumns[index + 1]) {
        fields[key] = fixedWidthColumns[index + 1];
      }
    }
    if (Object.keys(fields).length > 0) return fields;
  }

  const pairMatch = normalizedLine.match(/^(.{2,24}?)[\s　]+(.+)$/);
  if (pairMatch) {
    const key = findHeaderKey(pairMatch[1]);
    if (key) fields[key] = pairMatch[2].trim();
  }
  if (Object.keys(fields).length === 0 && findHeaderKey(normalizedLine) === 'reason') {
    fields.reason = '';
  }
  return fields;
}

function parsePdfTextBlocks(lines: string[]): ParsedPdfTextBlock[] {
  const blocks: ParsedPdfTextBlock[] = [];
  let current: ParsedPdfTextBlock | null = null;

  const pushCurrent = () => {
    if (current && Object.keys(current.fields).length > 0) {
      blocks.push(current);
    }
    current = null;
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (isBlockSeparator(line)) {
      pushCurrent();
      continue;
    }

    const parsedFields = parsePdfTextKeyValueLine(line);
    const entries = Object.entries(parsedFields) as Array<[HeaderKey, string]>;
    if (entries.length === 0) {
      const continuation = normalizeFullWidth(line).trim();
      if (
        current &&
        current.fields.reason !== undefined &&
        continuation &&
        !isSummaryRow([continuation]) &&
        !isBlockSeparator(continuation)
      ) {
        current.fields.reason = [current.fields.reason, continuation].filter(Boolean).join(' ');
      }
      continue;
    }

    if (!current) {
      current = { fields: {}, firstLine: index + 1 };
    }
    if (parsedFields.visitId && current.fields.visitId && current.fields.visitId !== parsedFields.visitId) {
      pushCurrent();
      current = { fields: {}, firstLine: index + 1 };
    }
    for (const [key, value] of entries) {
      current.fields[key] = value;
    }
  }
  pushCurrent();
  return blocks;
}

function parsePdfTextAcceptanceResults(lines: string[]): OnlineClaimAcceptanceParseResult | null {
  const blocks = parsePdfTextBlocks(lines);
  if (blocks.length === 0) return null;

  const issues: OnlineClaimAcceptanceIssue[] = [];
  const rows: OnlineClaimAcceptanceResultRow[] = [];
  const seenVisitIds = new Set<string>();
  const recognizedColumns: OnlineClaimAcceptanceSourceFormat['recognizedColumns'] = {};

  for (const block of blocks) {
    for (const key of Object.keys(block.fields) as HeaderKey[]) {
      recognizedColumns[key] = CANONICAL_ACCEPTANCE_COLUMNS[key];
    }

    const visitId = cleanOptionalField(block.fields.visitId) || '';
    const status = normalizeStatus(block.fields.status || '');
    if (!visitId) {
      addIssue(issues, {
        severity: 'error',
        code: 'acceptance_visit_id_missing',
        title: '受付IDが空です',
        message: '帳票テキスト内の受付IDを確認してください。',
        line: block.firstLine
      });
      continue;
    }
    if (!status) {
      addIssue(issues, {
        severity: 'error',
        code: 'acceptance_status_unknown',
        title: '受付結果を判定できません',
        message: `${visitId} の受付結果は「受付済」または「返戻」として判定できる値にしてください。`,
        line: block.firstLine,
        visitId
      });
      continue;
    }
    if (seenVisitIds.has(visitId)) {
      addIssue(issues, {
        severity: 'error',
        code: 'acceptance_duplicate_visit',
        title: '受付結果ファイル内で受付IDが重複しています',
        message: `${visitId} が複数ブロックに含まれています。`,
        line: block.firstLine,
        visitId
      });
      continue;
    }
    seenVisitIds.add(visitId);

    rows.push({
      visitId,
      status,
      patientId: cleanOptionalField(block.fields.patientId),
      patientName: cleanOptionalField(block.fields.patientName),
      totalPoints: parsePoints(block.fields.totalPoints || ''),
      receiptNumber: cleanOptionalField(block.fields.receiptNumber),
      fileName: cleanOptionalField(block.fields.fileName),
      reason: cleanOptionalField(block.fields.reason),
      line: block.firstLine
    });
  }

  return {
    rows,
    issues,
    sourceFormat: {
      delimiter: 'pdf_text',
      headerLine: blocks[0]?.firstLine ?? 1,
      recognizedColumns
    }
  };
}

function buildRecognizedColumns(
  headers: string[],
  indexes: Record<HeaderKey, number>
): OnlineClaimAcceptanceSourceFormat['recognizedColumns'] {
  const recognizedColumns: OnlineClaimAcceptanceSourceFormat['recognizedColumns'] = {};
  (Object.keys(indexes) as HeaderKey[]).forEach((key) => {
    const index = indexes[key];
    if (index >= 0) {
      recognizedColumns[key] = headers[index];
    }
  });
  return recognizedColumns;
}

function addIssue(issues: OnlineClaimAcceptanceIssue[], issue: OnlineClaimAcceptanceIssue) {
  issues.push(issue);
}

export function parseOnlineClaimAcceptanceResults(content: string): OnlineClaimAcceptanceParseResult {
  const normalizedContent = content.replace(/^\ufeff/, '');
  const lines = normalizedContent.split(/\r?\n/).filter((line) => line.trim() !== '');
  const issues: OnlineClaimAcceptanceIssue[] = [];
  if (lines.length === 0) {
    return {
      rows: [],
      issues: [{
        severity: 'error',
        code: 'acceptance_empty',
        title: '受付結果ファイルが空です',
        message: 'オンライン請求の受付結果CSV/TSVまたは固定長風テキストを選択してください。'
      }]
    };
  }

  const headerCandidate = findHeaderCandidate(lines);
  if (!headerCandidate) {
    const hasDelimitedLine = lines.some((line) => detectDelimitedDelimiter(line));
    if (!hasDelimitedLine) {
      const pdfTextResult = parsePdfTextAcceptanceResults(lines);
      if (pdfTextResult) return pdfTextResult;
    }

    return {
      rows: [],
      issues: [{
        severity: 'error',
        code: 'acceptance_header_missing',
        title: '受付結果ファイルの見出しが不足しています',
        message: '受付IDと受付結果の列を含むCSV/TSVまたは固定長風テキストを選択してください。'
      }]
    };
  }

  const { delimiter, headers } = headerCandidate;
  const visitIdIndex = findHeaderIndex(headers, HEADER_ALIASES.visitId);
  const statusIndex = findHeaderIndex(headers, HEADER_ALIASES.status);
  const patientIdIndex = findHeaderIndex(headers, HEADER_ALIASES.patientId);
  const patientNameIndex = findHeaderIndex(headers, HEADER_ALIASES.patientName);
  const totalPointsIndex = findHeaderIndex(headers, HEADER_ALIASES.totalPoints);
  const receiptNumberIndex = findHeaderIndex(headers, HEADER_ALIASES.receiptNumber);
  const fileNameIndex = findHeaderIndex(headers, HEADER_ALIASES.fileName);
  const reasonIndex = findHeaderIndex(headers, HEADER_ALIASES.reason);
  const indexes: Record<HeaderKey, number> = {
    visitId: visitIdIndex,
    patientId: patientIdIndex,
    patientName: patientNameIndex,
    status: statusIndex,
    totalPoints: totalPointsIndex,
    receiptNumber: receiptNumberIndex,
    fileName: fileNameIndex,
    reason: reasonIndex
  };
  const rows: OnlineClaimAcceptanceResultRow[] = [];
  const seenVisitIds = new Set<string>();

  for (let i = headerCandidate.index + 1; i < lines.length; i++) {
    const fields = parseAcceptanceFields(lines[i], headerCandidate);
    const line = i + 1;
    if (isSummaryRow(fields)) continue;

    const visitId = cleanOptionalField(fields[visitIdIndex]) || '';
    const status = normalizeStatus(fields[statusIndex] || '');
    if (!visitId) {
      addIssue(issues, {
        severity: 'error',
        code: 'acceptance_visit_id_missing',
        title: '受付IDが空です',
        message: '受付結果ファイルの受付IDを確認してください。',
        line
      });
      continue;
    }
    if (!status) {
      addIssue(issues, {
        severity: 'error',
        code: 'acceptance_status_unknown',
        title: '受付結果を判定できません',
        message: `${visitId} の受付結果は「受付済」または「返戻」として判定できる値にしてください。`,
        line,
        visitId
      });
      continue;
    }
    if (seenVisitIds.has(visitId)) {
      addIssue(issues, {
        severity: 'error',
        code: 'acceptance_duplicate_visit',
        title: '受付結果ファイル内で受付IDが重複しています',
        message: `${visitId} が複数行に含まれています。`,
        line,
        visitId
      });
      continue;
    }
    seenVisitIds.add(visitId);

    rows.push({
      visitId,
      status,
      patientId: patientIdIndex >= 0 ? cleanOptionalField(fields[patientIdIndex]) : undefined,
      patientName: patientNameIndex >= 0 ? cleanOptionalField(fields[patientNameIndex]) : undefined,
      totalPoints: totalPointsIndex >= 0 ? parsePoints(fields[totalPointsIndex] || '') : undefined,
      receiptNumber: receiptNumberIndex >= 0 ? cleanOptionalField(fields[receiptNumberIndex]) : undefined,
      fileName: fileNameIndex >= 0 ? cleanOptionalField(fields[fileNameIndex]) : undefined,
      reason: reasonIndex >= 0 ? cleanOptionalField(fields[reasonIndex]) : undefined,
      line
    });
  }

  return {
    rows,
    issues,
    sourceFormat: {
      delimiter: delimiter === 'fixed_width_text' ? 'fixed_width_text' : delimiter === '\t' ? 'tab' : 'comma',
      headerLine: headerCandidate.index + 1,
      recognizedColumns: buildRecognizedColumns(headers, indexes)
    }
  };
}

function canApplyAcceptanceResult(status: ReturnType<typeof getClaimLifecycleStatus>, rowStatus: OnlineClaimAcceptanceStatus): boolean {
  if (status === 'closed') return false;
  if (rowStatus === 'accepted') {
    return status === 'exported' || status === 'accepted';
  }
  return status === 'exported' || status === 'accepted' || status === 'returned' || status === 'rebilling';
}

export function reconcileOnlineClaimAcceptanceResults({
  rows,
  visits,
  importedAt,
  importedBy
}: {
  rows: OnlineClaimAcceptanceResultRow[];
  visits: Visit[];
  importedAt: string;
  importedBy?: string;
}): OnlineClaimAcceptanceReconciliation {
  const visitMap = new Map(visits.map((visit) => [visit.visitId, visit]));
  const items: OnlineClaimAcceptanceReconciliationItem[] = [];
  const issues: OnlineClaimAcceptanceIssue[] = [];
  let acceptedCount = 0;
  let returnedCount = 0;

  for (const row of rows) {
    const itemIssues: OnlineClaimAcceptanceIssue[] = [];
    const visit = visitMap.get(row.visitId);
    if (!visit) {
      addIssue(itemIssues, {
        severity: 'error',
        code: 'acceptance_visit_not_found',
        title: '受付IDが見つかりません',
        message: `${row.visitId} はpharma-oss内の受付と照合できませんでした。`,
        line: row.line,
        visitId: row.visitId
      });
    }

    if (visit && row.patientId && row.patientId !== visit.patientId) {
      addIssue(itemIssues, {
        severity: 'error',
        code: 'acceptance_patient_mismatch',
        title: '患者IDが一致しません',
        message: `${row.visitId} の受付結果患者ID ${row.patientId} と受付の患者ID ${visit.patientId} が一致しません。`,
        line: row.line,
        visitId: row.visitId
      });
    }

    const exportedPatientName = visit?.claimLifecycle?.exportSnapshot?.patientName;
    if (
      visit &&
      row.patientName &&
      exportedPatientName &&
      normalizePatientName(row.patientName) !== normalizePatientName(exportedPatientName)
    ) {
      addIssue(itemIssues, {
        severity: 'warning',
        code: 'acceptance_patient_name_mismatch',
        title: '患者名が請求時点スナップショットと異なります',
        message: `${row.visitId} の受付結果患者名「${row.patientName}」と請求時点の患者名「${exportedPatientName}」が一致しません。患者IDと請求内容を確認してください。`,
        line: row.line,
        visitId: row.visitId
      });
    }

    const currentStatus = getClaimLifecycleStatus(visit?.claimLifecycle);
    if (visit && !canApplyAcceptanceResult(currentStatus, row.status)) {
      addIssue(itemIssues, {
        severity: 'error',
        code: 'acceptance_status_not_applicable',
        title: '現在の請求状態に受付結果を反映できません',
        message: `${row.visitId} は現在「${currentStatus}」のため、受付結果の取込対象外です。`,
        line: row.line,
        visitId: row.visitId
      });
    }

    if (visit && row.totalPoints !== undefined && visit.claimLifecycle?.totalPoints !== undefined && row.totalPoints !== visit.claimLifecycle.totalPoints) {
      addIssue(itemIssues, {
        severity: 'warning',
        code: 'acceptance_points_mismatch',
        title: '受付結果の点数が請求履歴と一致しません',
        message: `${row.visitId} の受付結果は${row.totalPoints}点、pharma-ossの請求履歴は${visit.claimLifecycle.totalPoints}点です。`,
        line: row.line,
        visitId: row.visitId
      });
    }

    let nextLifecycle: ClaimLifecycleState | undefined;
    if (visit && !itemIssues.some((issue) => issue.severity === 'error')) {
      if (row.status === 'accepted') {
        nextLifecycle = markClaimAccepted({
          current: visit.claimLifecycle,
          at: importedAt,
          by: importedBy,
          receiptNumber: row.receiptNumber,
          note: row.receiptNumber
            ? `オンライン請求受付結果を取り込みました（受付番号: ${row.receiptNumber}）。`
            : 'オンライン請求受付結果を取り込みました。'
        });
        acceptedCount++;
      } else {
        nextLifecycle = markClaimReturned({
          current: visit.claimLifecycle,
          at: importedAt,
          by: importedBy,
          reason: row.reason || 'オンライン請求受付結果で要修正として取り込みました。'
        });
        returnedCount++;
      }
    }

    issues.push(...itemIssues);
    items.push({
      row,
      visit,
      nextLifecycle,
      issues: itemIssues
    });
  }

  return { items, issues, acceptedCount, returnedCount };
}

export function formatOnlineClaimAcceptanceIssues(issues: OnlineClaimAcceptanceIssue[], limit = 8): string {
  const lines = issues.slice(0, limit).map((issue) => {
    const line = issue.line ? `${issue.line}行目: ` : '';
    return `${line}${issue.title}`;
  });
  if (issues.length > limit) {
    lines.push(`ほか${issues.length - limit}件`);
  }
  return lines.join('\n');
}

export function formatOnlineClaimAcceptanceSourceFormat(format?: OnlineClaimAcceptanceSourceFormat): string {
  if (!format) return '形式未判定';
  const delimiterLabel = format.delimiter === 'tab'
    ? 'TSV'
    : format.delimiter === 'fixed_width_text'
      ? '固定長風テキスト'
      : format.delimiter === 'pdf_text'
        ? 'PDF抽出テキスト'
      : 'CSV';
  const columns = Object.values(format.recognizedColumns).filter(Boolean).join('・') || '認識列なし';
  return `${delimiterLabel} / ヘッダー${format.headerLine}行目 / 認識列 ${columns}`;
}
