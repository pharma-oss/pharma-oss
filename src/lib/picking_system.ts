// 既存(外部)ピッキングシステムとの連携。
// - 指示書き出し: 棚番地・JAN/GTIN・必要数量・在庫ロット候補を含むCSV/JSONを出力し、
//   フォルダ監視型・取込型の既存ピッキングシステムへ渡せるようにする。
// - 結果取込: ピッキングシステムが出力した結果CSV/TSVを読み取り、院内のGS1照合と
//   同じ形(isPicked/pickedLotNumber/不足記録)へ反映する計画を作る。
// 実DBへの反映は呼び出し側(EMRピッキング支援)が行い、このライブラリは純関数に保つ。
// 在庫の引き落としは行わない(完了操作時の既存フローに従う)。
import { csvCell } from './inventory_order.ts';

export const PICKING_INSTRUCTION_FORMAT_VERSION = '1';

export interface PickingInstructionStockLot {
  lotNumber?: string;
  expirationDate?: string;
  quantity?: number;
}

export interface PickingInstructionItemInput {
  itemId: string;
  rpNumber?: number;
  drugCode: string;
  yjCode?: string;
  janCodes?: string[];
  drugName: string;
  totalQuantity: number;
  usage?: string;
  days?: number;
  location?: string;
  isPicked?: boolean;
  stockLots?: PickingInstructionStockLot[];
}

export interface PickingInstructionInput {
  visitId: string;
  patientName: string;
  patientKana?: string;
  dispensingDate?: string;
  pharmacyName?: string;
  items: PickingInstructionItemInput[];
}

export interface PickingInstruction {
  formatVersion: string;
  createdAt: string;
  visitId: string;
  patientName: string;
  patientKana: string;
  dispensingDate: string;
  pharmacyName: string;
  items: Array<{
    itemId: string;
    rpNumber: number;
    drugCode: string;
    yjCode: string;
    janCodes: string[];
    drugName: string;
    totalQuantity: number;
    usage: string;
    days: number;
    location: string;
    stockLots: Array<{ lotNumber: string; expirationDate: string; quantity: number }>;
  }>;
}

export function buildPickingInstruction(input: PickingInstructionInput, createdAt = new Date()): PickingInstruction {
  return {
    formatVersion: PICKING_INSTRUCTION_FORMAT_VERSION,
    createdAt: createdAt.toISOString(),
    visitId: input.visitId,
    patientName: input.patientName || '',
    patientKana: input.patientKana || '',
    dispensingDate: input.dispensingDate || '',
    pharmacyName: input.pharmacyName || '',
    // 送信対象は未照合の薬だけにせず全明細を渡す(システム側で進捗突合できるようにする)
    items: input.items.map((item) => ({
      itemId: item.itemId,
      rpNumber: item.rpNumber || 0,
      drugCode: item.drugCode || '',
      yjCode: item.yjCode || '',
      janCodes: (item.janCodes || []).filter(Boolean),
      drugName: item.drugName || '',
      totalQuantity: item.totalQuantity || 0,
      usage: item.usage || '',
      days: item.days || 0,
      location: item.location || '',
      stockLots: (item.stockLots || [])
        .filter((lot) => lot.lotNumber || lot.expirationDate)
        .map((lot) => ({
          lotNumber: lot.lotNumber || '',
          expirationDate: lot.expirationDate || '',
          quantity: lot.quantity || 0
        }))
    }))
  };
}

// フォルダ取込型の既存システム向けCSV。1行=1明細。店舗内利用限定(患者名を含む)。
export function buildPickingInstructionCsv(instruction: PickingInstruction): string {
  const header = [
    '形式版',
    '受付ID',
    '患者名',
    '患者カナ',
    '調剤日',
    'Rp番号',
    '明細ID',
    '薬品コード',
    'YJコード',
    'JANコード',
    '薬品名',
    '必要数量',
    '用法',
    '日数',
    '棚番地',
    '在庫ロット候補'
  ];
  const rows = instruction.items.map((item) => [
    instruction.formatVersion,
    instruction.visitId,
    instruction.patientName,
    instruction.patientKana,
    instruction.dispensingDate,
    String(item.rpNumber || ''),
    item.itemId,
    item.drugCode,
    item.yjCode,
    item.janCodes.join(';'),
    item.drugName,
    String(item.totalQuantity),
    item.usage,
    String(item.days || ''),
    item.location,
    item.stockLots.map((lot) => `${lot.lotNumber}:${lot.expirationDate}:${lot.quantity}`).join(';')
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildPickingInstructionFileName(visitId: string, date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const safeVisitId = visitId.replace(/[^A-Za-z0-9_-]/g, '_');
  return `picking_instruction_${safeVisitId}_${stamp}.csv`;
}

// ---- 結果取込 ----

export type PickingResultRowStatus = 'picked' | 'shortage';

export interface PickingSystemResultRow {
  lineNumber: number;
  itemId?: string;
  visitId?: string;
  drugCode?: string;
  janCode?: string;
  status: PickingResultRowStatus;
  quantity?: number;
  shortageQuantity?: number;
  lotNumber?: string;
  expirationDate?: string;
  note?: string;
}

export interface PickingResultParseIssue {
  lineNumber: number;
  message: string;
}

export interface PickingResultParseOutcome {
  ok: boolean;
  message?: string;
  rows: PickingSystemResultRow[];
  issues: PickingResultParseIssue[];
}

const HEADER_ALIASES: Record<string, string[]> = {
  itemId: ['明細id', '処方明細id', '行id', 'itemid', 'item_id'],
  visitId: ['受付id', '受付番号', '伝票番号', '処方箋番号', 'visitid', 'visit_id'],
  drugCode: ['薬品コード', '医薬品コード', 'drugcode', 'drug_code'],
  janCode: ['jan', 'janコード', 'gtin', 'gtinコード', 'バーコード'],
  status: ['結果', '状態', 'ステータス', 'status'],
  quantity: ['数量', '払出数量', '払出数', 'quantity', 'qty'],
  shortageQuantity: ['不足数', '不足数量', '欠品数', 'shortage', 'shortage_quantity'],
  lotNumber: ['ロット', 'ロット番号', 'lot', 'lotno', 'lot_no'],
  expirationDate: ['使用期限', '有効期限', '期限', 'expiry', 'expiration', 'expirationdate'],
  note: ['備考', 'メモ', 'コメント', 'note', 'memo']
};

const PICKED_STATUS_WORDS = new Set(['完了', '済', '照合済', '照合済み', 'ピッキング済', 'ピッキング済み', '払出済', 'ok', 'picked', 'done', 'complete', 'completed', '1', 'true']);
const SHORTAGE_STATUS_WORDS = new Set(['不足', '欠品', '一部不足', 'shortage', 'short', 'missing']);

function normalizeHeaderCell(value: string): string {
  return value.trim().toLowerCase().replace(/[\s　"']/g, '');
}

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

// YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD / YYYYMMDD を受け付けて YYYY-MM-DD へそろえる
export function normalizePickingResultDate(value?: string): string | undefined {
  const text = String(value || '').trim();
  if (!text) return undefined;
  const digits = text.replace(/[/.年月]/g, '-').replace(/日/g, '');
  let match = digits.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match && /^\d{8}$/.test(text)) {
    match = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  }
  if (!match) return undefined;
  const [, year, month, day] = match;
  const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) return undefined;
  return normalized;
}

function parseNumberCell(value?: string): number | undefined {
  const text = String(value || '').trim().replace(/,/g, '');
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function parsePickingSystemResult(text: string): PickingResultParseOutcome {
  const lines = String(text || '')
    .replace(/^﻿/, '')
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return { ok: false, message: 'ヘッダー行とデータ行のある結果ファイルを選択してください。', rows: [], issues: [] };
  }

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headerCells = splitLine(lines[0], delimiter).map(normalizeHeaderCell);
  const columnIndex = new Map<string, number>();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = headerCells.findIndex((cell) => aliases.includes(cell));
    if (index >= 0) columnIndex.set(field, index);
  }

  if (!columnIndex.has('itemId') && !columnIndex.has('drugCode') && !columnIndex.has('janCode')) {
    return {
      ok: false,
      message: '明細ID・薬品コード・JANコードのいずれかの列が必要です。ヘッダー行の列名を確認してください。',
      rows: [],
      issues: []
    };
  }
  if (!columnIndex.has('status') && !columnIndex.has('shortageQuantity')) {
    return {
      ok: false,
      message: '結果(状態)列または不足数列が必要です。ヘッダー行の列名を確認してください。',
      rows: [],
      issues: []
    };
  }

  const rows: PickingSystemResultRow[] = [];
  const issues: PickingResultParseIssue[] = [];
  const cellAt = (cells: string[], field: string): string | undefined => {
    const index = columnIndex.get(field);
    if (index === undefined) return undefined;
    return cells[index]?.trim() || undefined;
  };

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const lineNumber = lineIndex + 1;
    const cells = splitLine(lines[lineIndex], delimiter);
    const statusText = (cellAt(cells, 'status') || '').toLowerCase();
    const shortageQuantity = parseNumberCell(cellAt(cells, 'shortageQuantity'));

    let status: PickingResultRowStatus | null = null;
    if (statusText) {
      if (PICKED_STATUS_WORDS.has(statusText)) status = 'picked';
      else if (SHORTAGE_STATUS_WORDS.has(statusText)) status = 'shortage';
      else {
        issues.push({ lineNumber, message: `結果「${cellAt(cells, 'status')}」を解釈できません（完了/不足 などを指定してください）。` });
        continue;
      }
    } else if (shortageQuantity !== undefined && shortageQuantity > 0) {
      status = 'shortage';
    } else {
      issues.push({ lineNumber, message: '結果(状態)が空です。' });
      continue;
    }

    const expirationRaw = cellAt(cells, 'expirationDate');
    const expirationDate = normalizePickingResultDate(expirationRaw);
    if (expirationRaw && !expirationDate) {
      issues.push({ lineNumber, message: `使用期限「${expirationRaw}」を日付として解釈できません。` });
      continue;
    }

    rows.push({
      lineNumber,
      itemId: cellAt(cells, 'itemId'),
      visitId: cellAt(cells, 'visitId'),
      drugCode: cellAt(cells, 'drugCode'),
      janCode: cellAt(cells, 'janCode'),
      status,
      quantity: parseNumberCell(cellAt(cells, 'quantity')),
      shortageQuantity,
      lotNumber: cellAt(cells, 'lotNumber'),
      expirationDate,
      note: cellAt(cells, 'note')
    });
  }

  if (rows.length === 0) {
    return { ok: false, message: '取り込める結果行がありません。', rows: [], issues };
  }
  return { ok: true, rows, issues };
}

// ---- 反映計画 ----

export interface PickingResultTargetItem {
  itemId: string;
  drugId?: string;
  stockDrugId?: string;
  yjCode?: string;
  janCodes?: string[];
  drugName: string;
  totalQuantity?: number;
  isPicked?: boolean;
}

export interface PickingResultItemUpdate {
  itemId: string;
  drugName: string;
  action: PickingResultRowStatus;
  lotNumber?: string;
  expirationDate?: string;
  shortageQuantity?: number;
  note?: string;
  warnings: string[];
}

export interface PickingResultApplyPlan {
  updates: PickingResultItemUpdate[];
  issues: PickingResultParseIssue[];
  skippedAlreadyPicked: number;
  pickedCount: number;
  shortageCount: number;
  canApply: boolean;
  summary: string;
}

// JAN(13桁)とGTIN(14桁・先頭0)を同一視して比較する
function normalizeJan(value?: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 14 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function matchTargetItem(row: PickingSystemResultRow, items: PickingResultTargetItem[]): PickingResultTargetItem[] {
  if (row.itemId) {
    return items.filter((item) => item.itemId === row.itemId);
  }
  const code = String(row.drugCode || '').trim();
  const jan = normalizeJan(row.janCode || (code && /^\d{13,14}$/.test(code) ? code : ''));
  return items.filter((item) => {
    if (code && (item.stockDrugId === code || item.drugId === code || item.yjCode === code)) return true;
    if (jan && (item.janCodes || []).some((candidate) => normalizeJan(candidate) === jan)) return true;
    return false;
  });
}

export function buildPickingResultApplyPlan(input: {
  visitId: string;
  items: PickingResultTargetItem[];
  rows: PickingSystemResultRow[];
}): PickingResultApplyPlan {
  const issues: PickingResultParseIssue[] = [];
  const updates: PickingResultItemUpdate[] = [];
  const usedItemIds = new Set<string>();
  let skippedAlreadyPicked = 0;

  for (const row of input.rows) {
    if (row.visitId && row.visitId !== input.visitId) {
      issues.push({ lineNumber: row.lineNumber, message: `受付ID「${row.visitId}」は表示中の受付と一致しません。` });
      continue;
    }

    const matches = matchTargetItem(row, input.items).filter((item) => !usedItemIds.has(item.itemId));
    if (matches.length === 0) {
      issues.push({ lineNumber: row.lineNumber, message: '一致する処方明細がありません（明細ID・薬品コード・JANを確認してください）。' });
      continue;
    }
    if (matches.length > 1) {
      issues.push({ lineNumber: row.lineNumber, message: `処方明細を特定できません（候補${matches.length}件）。明細ID列で指定してください。` });
      continue;
    }

    const item = matches[0];
    const warnings: string[] = [];

    if (row.status === 'picked') {
      // 院内のGS1照合済みは外部結果で上書きしない(現物照合を優先する)
      if (item.isPicked) {
        skippedAlreadyPicked++;
        continue;
      }
      if (row.quantity !== undefined && item.totalQuantity !== undefined && row.quantity !== item.totalQuantity) {
        warnings.push(`払出数量${row.quantity}が必要数量${item.totalQuantity}と異なります。`);
      }
      usedItemIds.add(item.itemId);
      updates.push({
        itemId: item.itemId,
        drugName: item.drugName,
        action: 'picked',
        lotNumber: row.lotNumber,
        expirationDate: row.expirationDate,
        note: row.note,
        warnings
      });
      continue;
    }

    const shortageQuantity = row.shortageQuantity ?? row.quantity;
    if (shortageQuantity === undefined || shortageQuantity <= 0) {
      issues.push({ lineNumber: row.lineNumber, message: '不足行に不足数がありません。' });
      continue;
    }
    usedItemIds.add(item.itemId);
    updates.push({
      itemId: item.itemId,
      drugName: item.drugName,
      action: 'shortage',
      shortageQuantity,
      note: row.note,
      warnings
    });
  }

  const pickedCount = updates.filter((update) => update.action === 'picked').length;
  const shortageCount = updates.filter((update) => update.action === 'shortage').length;
  const summaryParts = [
    `照合 ${pickedCount}件`,
    `不足 ${shortageCount}件`,
    skippedAlreadyPicked > 0 ? `照合済みスキップ ${skippedAlreadyPicked}件` : '',
    issues.length > 0 ? `取込不可 ${issues.length}行` : ''
  ].filter(Boolean);

  return {
    updates,
    issues,
    skippedAlreadyPicked,
    pickedCount,
    shortageCount,
    canApply: updates.length > 0,
    summary: summaryParts.join(' / ')
  };
}

// 監査ログ用の要約。件数のみで患者名を含めない。
export function buildPickingResultAuditDetail(plan: PickingResultApplyPlan): string {
  return `外部ピッキング結果取込: ${plan.summary}`;
}
