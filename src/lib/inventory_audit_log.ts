import type { AuditActionType, AuditLog, Drug, DrugStock, PrescriptionItem, Visit } from '../db/types.ts';
import { buildCsvDocument } from './csv_escape.ts';
import { isDemoVisit } from './demo_data.ts';
import { formatInventoryAmount } from './inventory_order.ts';
import { calculateRequiredStockAmount, getStockDrugId } from './stock.ts';

export const CONTROLLED_DRUG_LEDGER_DISCLAIMER =
  '法定帳簿の補助記録（麻薬・向精神薬受払補助簿）— 麻薬及び向精神薬取締法に基づく法定帳簿の記載・確認は必ず管理薬剤師が行ってください。';

export type InventoryStructuredEventKind =
  | 'cancel'
  | 'return'
  | 'disposal'
  | 'stocktake_variance';

export const INVENTORY_EVENT_META: Record<
  InventoryStructuredEventKind,
  { label: string; actionType: AuditActionType; defaultSign: 1 | -1 | 0 }
> = {
  cancel: { label: '調剤取消・在庫戻し', actionType: 'stock_cancel', defaultSign: 1 },
  return: { label: '卸返品', actionType: 'stock_return', defaultSign: -1 },
  disposal: { label: '破損・期限切れ廃棄', actionType: 'stock_disposal', defaultSign: -1 },
  stocktake_variance: { label: '棚卸差異調整', actionType: 'stock_take_variance', defaultSign: 0 }
};

export interface InventoryStructuredAuditInput {
  kind: InventoryStructuredEventKind;
  drugCode: string;
  drugName: string;
  /** 正の値は在庫増加（取消戻し・棚卸過剰）、負の値は在庫減少（返品・廃棄・棚卸不足） */
  quantityDelta: number;
  lotNumber?: string;
  expirationDate?: string;
  reason: string;
  note?: string;
}

export interface BuiltInventoryStructuredAudit {
  actionType: AuditActionType;
  detail: string;
}

export function buildInventoryStructuredAuditEntry(
  input: InventoryStructuredAuditInput
): BuiltInventoryStructuredAudit {
  const meta = INVENTORY_EVENT_META[input.kind];
  if (!Number.isFinite(input.quantityDelta) || input.quantityDelta === 0) {
    throw new Error('数量変動（quantityDelta）は 0 以外の有限数値で指定してください。');
  }
  const trimmedReason = input.reason.trim();
  if (!trimmedReason) {
    throw new Error('理由を入力してください。');
  }

  const signText = input.quantityDelta > 0
    ? `+${formatInventoryAmount(input.quantityDelta)}`
    : formatInventoryAmount(input.quantityDelta);
  const parts = [
    `[${meta.label}]`,
    `薬品=${input.drugName} (${input.drugCode})`,
    `数量変動=${signText}`,
    ...(input.lotNumber?.trim() ? [`ロット=${input.lotNumber.trim()}`] : []),
    ...(input.expirationDate?.trim() ? [`期限=${input.expirationDate.trim()}`] : []),
    `理由=${trimmedReason}`,
    ...(input.note?.trim() ? [`備考=${input.note.trim()}`] : [])
  ];

  const raw = parts.join(' / ');
  const detail = raw.length > 1990 ? `${raw.slice(0, 1989)}…` : raw;
  return {
    actionType: meta.actionType,
    detail
  };
}

export interface ControlledDrugLedgerRow {
  date: string;
  kind: '麻薬' | '向精神薬';
  drugCode: string;
  yjCode: string;
  drugName: string;
  eventType: '受入' | '調剤払出' | '取消戻し' | '返品' | '廃棄' | '棚卸差異' | '現在庫残高';
  lotNumber: string;
  expirationDate: string;
  receivedQuantity: number | null;
  dispensedQuantity: number | null;
  adjustedQuantity: number | null;
  balanceQuantity: number | null;
  note: string;
}

export interface ControlledDrugLedgerMeta {
  pharmacyName: string;
  generatedAt: string;
  periodLabel?: string;
}

function parseStructuredEventFromAuditLog(log: AuditLog): {
  drugCode: string;
  quantityDelta: number;
  lotNumber: string;
  expirationDate: string;
  note: string;
} | null {
  const segments = log.details.split(' / ').map((segment) => segment.trim());
  const drugSeg = segments.find((s) => s.startsWith('薬品='));
  const deltaSeg = segments.find((s) => s.startsWith('数量変動='));
  const codeMatch = drugSeg?.match(/\(([^)]+)\)\s*$/);
  const deltaMatch = deltaSeg?.match(/^数量変動=([+-]?\d+(?:\.\d+)?)$/);
  if (!codeMatch || !deltaMatch) return null;
  const quantityDelta = Number(deltaMatch[1]);
  if (!Number.isFinite(quantityDelta)) return null;
  const lotSeg = segments.find((s) => s.startsWith('ロット='));
  const expSeg = segments.find((s) => s.startsWith('期限='));
  const reasonSeg = segments.find((s) => s.startsWith('理由='));
  return {
    drugCode: codeMatch[1].trim(),
    quantityDelta,
    lotNumber: lotSeg ? lotSeg.slice('ロット='.length).trim() : '',
    expirationDate: expSeg ? expSeg.slice('期限='.length).trim() : '',
    note: reasonSeg ? reasonSeg.slice('理由='.length).trim() : ''
  };
}

/**
 * 麻薬・向精神薬の受払・残高補助帳簿データを組み立てる。
 * 金科玉条 第二条: 患者氏名・患者IDなどの患者個人情報は一切含めない（日付・品目単位の集計のみ）。
 */
export function buildControlledDrugAuxiliaryLedgerRows(params: {
  drugs: readonly Pick<Drug, 'code' | 'yjCode' | 'name' | 'stockQuantity' | 'isNarcotic' | 'isPsychotropic'>[];
  stockLots: readonly DrugStock[];
  visits: readonly Pick<Visit, 'visitId' | 'patientId' | 'dispensingDate' | 'issueDate' | 'status'>[];
  prescriptionItems: readonly Pick<PrescriptionItem, 'visitId' | 'drugId' | 'dispensedDrugCode' | 'amount' | 'days' | 'pickedLotNumber' | 'pickedExpirationDate'>[];
  auditLogs?: readonly AuditLog[];
  asOfDate?: string;
}): ControlledDrugLedgerRow[] {
  const controlledByCode = new Map<string, Pick<Drug, 'code' | 'yjCode' | 'name' | 'stockQuantity' | 'isNarcotic' | 'isPsychotropic'>>();
  for (const drug of params.drugs) {
    if (drug.isNarcotic || drug.isPsychotropic) {
      controlledByCode.set(drug.code, drug);
    }
  }
  if (controlledByCode.size === 0) return [];

  const rows: ControlledDrugLedgerRow[] = [];

  // 1. 受入（在庫ロットの入荷記録）
  for (const lot of params.stockLots) {
    const drug = controlledByCode.get(lot.drugCode);
    if (!drug) continue;
    rows.push({
      date: (lot.arrivalDate || '').slice(0, 10) || '日付未記録',
      kind: drug.isNarcotic ? '麻薬' : '向精神薬',
      drugCode: drug.code,
      yjCode: drug.yjCode || '',
      drugName: drug.name,
      eventType: '受入',
      lotNumber: lot.lotNumber || '',
      expirationDate: lot.expirationDate || '',
      receivedQuantity: lot.quantity,
      dispensedQuantity: null,
      adjustedQuantity: null,
      balanceQuantity: null,
      note: lot.supplier ? `仕入先: ${lot.supplier}` : '在庫ロット登録'
    });
  }

  // 2. 調剤払出（完了済み・非デモ受付を日付×薬品×ロット単位で集計。患者PIIは一切含めない）
  const completedVisitDate = new Map<string, string>();
  for (const visit of params.visits) {
    if (visit.status !== 'completed' || isDemoVisit(visit)) continue;
    const dateKey = (visit.dispensingDate || visit.issueDate || '').slice(0, 10) || '日付未記録';
    completedVisitDate.set(visit.visitId, dateKey);
  }

  const dispensingBuckets = new Map<string, {
    date: string;
    drug: Pick<Drug, 'code' | 'yjCode' | 'name' | 'stockQuantity' | 'isNarcotic' | 'isPsychotropic'>;
    lotNumber: string;
    expirationDate: string;
    quantity: number;
    visitCount: number;
  }>();

  for (const item of params.prescriptionItems) {
    const dateKey = completedVisitDate.get(item.visitId);
    if (!dateKey) continue;
    const stockCode = getStockDrugId(item);
    const drug = controlledByCode.get(stockCode);
    if (!drug) continue;
    const qty = calculateRequiredStockAmount(item);
    if (qty <= 0) continue;
    const lotNumber = item.pickedLotNumber || '';
    const expirationDate = item.pickedExpirationDate || '';
    const bucketKey = `${dateKey}|${drug.code}|${lotNumber}|${expirationDate}`;
    const existing = dispensingBuckets.get(bucketKey);
    if (existing) {
      existing.quantity += qty;
      existing.visitCount += 1;
    } else {
      dispensingBuckets.set(bucketKey, {
        date: dateKey,
        drug,
        lotNumber,
        expirationDate,
        quantity: qty,
        visitCount: 1
      });
    }
  }

  for (const bucket of dispensingBuckets.values()) {
    rows.push({
      date: bucket.date,
      kind: bucket.drug.isNarcotic ? '麻薬' : '向精神薬',
      drugCode: bucket.drug.code,
      yjCode: bucket.drug.yjCode || '',
      drugName: bucket.drug.name,
      eventType: '調剤払出',
      lotNumber: bucket.lotNumber,
      expirationDate: bucket.expirationDate,
      receivedQuantity: null,
      dispensedQuantity: bucket.quantity,
      adjustedQuantity: null,
      balanceQuantity: null,
      note: `調剤完了集計 (${bucket.visitCount}件・患者個人情報非出力)`
    });
  }

  // 3. 構造化監査ログ（取消戻し・返品・廃棄・棚卸差異）
  const eventTypeByAction: Partial<Record<AuditActionType, ControlledDrugLedgerRow['eventType']>> = {
    stock_cancel: '取消戻し',
    stock_return: '返品',
    stock_disposal: '廃棄',
    stock_take_variance: '棚卸差異'
  };

  for (const log of params.auditLogs || []) {
    const eventType = eventTypeByAction[log.actionType];
    if (!eventType) continue;
    const parsed = parseStructuredEventFromAuditLog(log);
    if (!parsed) continue;
    const drug = controlledByCode.get(parsed.drugCode);
    if (!drug) continue;
    rows.push({
      date: (log.timestamp || '').slice(0, 10) || '日付未記録',
      kind: drug.isNarcotic ? '麻薬' : '向精神薬',
      drugCode: drug.code,
      yjCode: drug.yjCode || '',
      drugName: drug.name,
      eventType,
      lotNumber: parsed.lotNumber,
      expirationDate: parsed.expirationDate,
      receivedQuantity: null,
      dispensedQuantity: null,
      adjustedQuantity: parsed.quantityDelta,
      balanceQuantity: null,
      note: parsed.note
    });
  }

  rows.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === '麻薬' ? -1 : 1;
    const nameOrder = a.drugName.localeCompare(b.drugName, 'ja');
    if (nameOrder !== 0) return nameOrder;
    return a.date.localeCompare(b.date);
  });

  // 4. 各品目の現在庫残高サマリー行を末尾へ付加
  const asOf = (params.asOfDate || new Date().toISOString()).slice(0, 10);
  const sortedDrugs = Array.from(controlledByCode.values()).sort((a, b) => {
    if (Boolean(a.isNarcotic) !== Boolean(b.isNarcotic)) return a.isNarcotic ? -1 : 1;
    return a.name.localeCompare(b.name, 'ja');
  });
  for (const drug of sortedDrugs) {
    rows.push({
      date: asOf,
      kind: drug.isNarcotic ? '麻薬' : '向精神薬',
      drugCode: drug.code,
      yjCode: drug.yjCode || '',
      drugName: drug.name,
      eventType: '現在庫残高',
      lotNumber: '',
      expirationDate: '',
      receivedQuantity: null,
      dispensedQuantity: null,
      adjustedQuantity: null,
      balanceQuantity: drug.stockQuantity ?? 0,
      note: 'システム現在庫（補助記録）'
    });
  }

  return rows;
}

export function buildControlledDrugAuxiliaryLedgerCsv(
  rows: readonly ControlledDrugLedgerRow[],
  meta: ControlledDrugLedgerMeta
): string {
  const disclaimerRow = [
    CONTROLLED_DRUG_LEDGER_DISCLAIMER,
    `薬局名: ${meta.pharmacyName || '未設定'}`,
    `出力日時: ${meta.generatedAt}`,
    meta.periodLabel ? `対象期間: ${meta.periodLabel}` : '対象期間: 全記録'
  ];
  const header = [
    '日付',
    '区分',
    '薬品コード',
    'YJコード',
    '医薬品名',
    '受払種別',
    'ロット番号',
    '使用期限',
    '受入数',
    '払出数',
    '調整数',
    '残高',
    '備考（患者個人情報なし）'
  ];
  const body = rows.map((row) => [
    row.date,
    row.kind,
    row.drugCode,
    row.yjCode,
    row.drugName,
    row.eventType,
    row.lotNumber,
    row.expirationDate,
    row.receivedQuantity !== null ? formatInventoryAmount(row.receivedQuantity) : '',
    row.dispensedQuantity !== null ? formatInventoryAmount(row.dispensedQuantity) : '',
    row.adjustedQuantity !== null
      ? (row.adjustedQuantity > 0 ? `+${formatInventoryAmount(row.adjustedQuantity)}` : formatInventoryAmount(row.adjustedQuantity))
      : '',
    row.balanceQuantity !== null ? formatInventoryAmount(row.balanceQuantity) : '',
    row.note
  ]);

  return buildCsvDocument([disclaimerRow, header, ...body]);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildControlledDrugAuxiliaryLedgerPrintHtml(
  rows: readonly ControlledDrugLedgerRow[],
  meta: ControlledDrugLedgerMeta
): string {
  const bodyHtml = rows.length === 0
    ? '<tr><td colspan="11">対象の麻薬・向精神薬記録はありません。</td></tr>'
    : rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.date)}</td>
        <td>${escapeHtml(row.kind)}</td>
        <td>${escapeHtml(row.drugName)}</td>
        <td>${escapeHtml(row.eventType)}</td>
        <td>${escapeHtml(row.lotNumber || '-')}</td>
        <td>${escapeHtml(row.expirationDate || '-')}</td>
        <td class="num">${row.receivedQuantity !== null ? escapeHtml(formatInventoryAmount(row.receivedQuantity)) : '-'}</td>
        <td class="num">${row.dispensedQuantity !== null ? escapeHtml(formatInventoryAmount(row.dispensedQuantity)) : '-'}</td>
        <td class="num">${row.adjustedQuantity !== null ? escapeHtml(row.adjustedQuantity > 0 ? `+${formatInventoryAmount(row.adjustedQuantity)}` : formatInventoryAmount(row.adjustedQuantity)) : '-'}</td>
        <td class="num">${row.balanceQuantity !== null ? escapeHtml(formatInventoryAmount(row.balanceQuantity)) : '-'}</td>
        <td>${escapeHtml(row.note)}</td>
      </tr>
    `).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>麻薬・向精神薬 受払補助簿（法定帳簿の補助記録）</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: "Hiragino Sans", "Yu Gothic", sans-serif; color: #111827; font-size: 11px; }
    h1 { font-size: 16px; margin: 0 0 6px; }
    .disclaimer { border: 1.5px solid #991b1b; background: #fef2f2; color: #7f1d1d; padding: 6px 10px; font-weight: 700; margin-bottom: 10px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #4b5563; padding: 4px 6px; text-align: left; }
    th { background: #f3f4f6; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .sign { margin-top: 16px; text-align: right; }
  </style>
</head>
<body>
  <h1>麻薬・向精神薬 受払・残高 補助帳簿</h1>
  <div class="disclaimer">${escapeHtml(CONTROLLED_DRUG_LEDGER_DISCLAIMER)}</div>
  <div class="meta">
    <span>薬局名: ${escapeHtml(meta.pharmacyName || '未設定')}</span>
    <span>出力日時: ${escapeHtml(meta.generatedAt)} / 患者個人情報非出力</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>日付</th>
        <th>区分</th>
        <th>医薬品名</th>
        <th>受払種別</th>
        <th>ロット</th>
        <th>使用期限</th>
        <th>受入</th>
        <th>払出</th>
        <th>調整</th>
        <th>残高</th>
        <th>備考</th>
      </tr>
    </thead>
    <tbody>${bodyHtml}</tbody>
  </table>
  <div class="sign">管理薬剤師確認印: ________________________　確認日: ____年__月__日</div>
</body>
</html>`;
}
