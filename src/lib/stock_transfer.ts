// 薬局間分譲(医薬品の譲渡・譲受)の記録と在庫反映。
//
// RxDBコレクション数が無償版上限(14)に達しているため、専用コレクションは追加せず、
// 法定の譲渡・譲受記録(品名/数量/年月日/相手方の氏名・住所)は改ざん検知付きの
// 監査ログ(audit_logs, actionType: stock_update)へ構造化した1行で保存する。
// 在庫への反映はロット数量と薬品マスタの在庫数を同時に更新する。

import { logAuditAction } from '@/lib/audit';
import { compareStockLotsByExpiration } from '@/lib/stock';

export type StockTransferDirection = 'out' | 'in';

export interface StockTransferRecord {
  direction: StockTransferDirection;
  drugCode: string;
  drugName: string;
  quantity: number;
  lotNumber?: string;
  expirationDate?: string;
  partnerName: string;
  partnerAddress?: string;
  note?: string;
  transferredAt: string; // ISO date-time
  operatorName?: string;
}

export const TRANSFER_DIRECTION_LABELS: Record<StockTransferDirection, string> = {
  out: '分譲出庫',
  in: '分譲入庫'
};

const FIELD_SEPARATOR = ' / ';

// 監査ログのdetails(最大2000文字)に収まる、人にも読める構造化1行
export function buildTransferAuditDetail(record: StockTransferRecord): string {
  const parts = [
    `${TRANSFER_DIRECTION_LABELS[record.direction]}: 「${record.drugName}」(${record.drugCode}) 数量 ${record.quantity}`,
    `ロット ${record.lotNumber || '-'}`,
    `期限 ${record.expirationDate || '-'}`,
    `相手先 ${record.partnerName}`,
    `住所 ${record.partnerAddress || '-'}`,
    `備考 ${record.note || '-'}`
  ];
  return parts.join(FIELD_SEPARATOR).slice(0, 2000);
}

// 監査ログから分譲記録を復元する(履歴一覧・記録書再印刷用)
export function parseTransferAuditDetail(details: string): Omit<StockTransferRecord, 'transferredAt' | 'operatorName'> | null {
  const headMatch = details.match(/^(分譲出庫|分譲入庫): 「(.+?)」\((.+?)\) 数量 ([0-9.]+)/);
  if (!headMatch) return null;
  const pick = (label: string) => {
    const match = details.match(new RegExp(`${FIELD_SEPARATOR}${label} (.*?)(?=${FIELD_SEPARATOR}|$)`));
    const value = match ? match[1].trim() : '';
    return value === '-' ? '' : value;
  };
  return {
    direction: headMatch[1] === '分譲出庫' ? 'out' : 'in',
    drugName: headMatch[2],
    drugCode: headMatch[3],
    quantity: parseFloat(headMatch[4]),
    lotNumber: pick('ロット') || undefined,
    expirationDate: pick('期限') || undefined,
    partnerName: pick('相手先'),
    partnerAddress: pick('住所') || undefined,
    note: pick('備考') || undefined
  };
}

export function isTransferAuditDetail(details: string): boolean {
  return /^(分譲出庫|分譲入庫): /.test(details);
}

export interface StockTransferInput {
  drugCode: string;
  quantity: number;
  partnerName: string;
  partnerAddress?: string;
  note?: string;
  // 出庫時: 指定ロットID(未指定なら期限の近い順に引き落とす)
  lotId?: string;
  // 入庫時: 新規ロット情報
  lotNumber?: string;
  expirationDate?: string;
  janCode?: string;
}

const roundQuantity = (value: number): number => Math.round(value * 100) / 100;

// 分譲出庫: ロット在庫と薬品マスタ在庫数を引き落とし、監査ログへ記録する
export async function applyStockTransferOut(db: any, input: StockTransferInput): Promise<StockTransferRecord> {
  if (!db) throw new Error('データベースが未接続です。');
  if (!(input.quantity > 0)) throw new Error('数量は0より大きい値を入力してください。');
  if (!input.partnerName.trim()) throw new Error('分譲先(相手方の名称)を入力してください。');

  const drugDoc = await db.drugs.findOne(input.drugCode).exec();
  if (!drugDoc) throw new Error('薬品が見つかりません。');

  const lotDocs = await db.drug_stocks.find({ selector: { drugCode: input.drugCode } }).exec();
  const currentTotal = drugDoc.stockQuantity || 0;
  if (input.quantity > currentTotal) {
    throw new Error(`在庫が不足しています(現在庫 ${currentTotal})。`);
  }

  let lotNumber = '';
  let expirationDate = '';

  if (input.lotId) {
    const lotDoc = lotDocs.find((doc: any) => doc.id === input.lotId);
    if (!lotDoc) throw new Error('指定されたロットが見つかりません。');
    if (input.quantity > lotDoc.quantity) {
      throw new Error(`指定ロットの在庫が不足しています(ロット在庫 ${lotDoc.quantity})。`);
    }
    lotNumber = lotDoc.lotNumber || '';
    expirationDate = lotDoc.expirationDate || '';
    await lotDoc.patch({ quantity: roundQuantity(lotDoc.quantity - input.quantity) });
  } else if (lotDocs.length > 0) {
    // ロット未指定: 期限の近い順に引き落とす
    const sorted = lotDocs.slice().sort((a: any, b: any) => compareStockLotsByExpiration(a, b));
    let remaining = input.quantity;
    const usedLots: string[] = [];
    for (const lotDoc of sorted) {
      if (remaining <= 0) break;
      const take = Math.min(lotDoc.quantity, remaining);
      if (take <= 0) continue;
      await lotDoc.patch({ quantity: roundQuantity(lotDoc.quantity - take) });
      remaining = roundQuantity(remaining - take);
      if (lotDoc.lotNumber) usedLots.push(lotDoc.lotNumber);
      if (!expirationDate && lotDoc.expirationDate) expirationDate = lotDoc.expirationDate;
    }
    if (remaining > 0) {
      throw new Error('ロット在庫の合計が数量に足りません。棚卸で在庫を確認してください。');
    }
    lotNumber = usedLots.join(',');
  }

  await drugDoc.patch({ stockQuantity: roundQuantity(currentTotal - input.quantity) });

  const record: StockTransferRecord = {
    direction: 'out',
    drugCode: input.drugCode,
    drugName: drugDoc.name,
    quantity: input.quantity,
    lotNumber: lotNumber || undefined,
    expirationDate: expirationDate || undefined,
    partnerName: input.partnerName.trim(),
    partnerAddress: input.partnerAddress?.trim() || undefined,
    note: input.note?.trim() || undefined,
    transferredAt: new Date().toISOString()
  };
  await logAuditAction(db, 'stock_update', buildTransferAuditDetail(record));
  return record;
}

// 分譲入庫: 新規ロットを登録し、薬品マスタ在庫数へ加算、監査ログへ記録する
export async function applyStockTransferIn(db: any, input: StockTransferInput): Promise<StockTransferRecord> {
  if (!db) throw new Error('データベースが未接続です。');
  if (!(input.quantity > 0)) throw new Error('数量は0より大きい値を入力してください。');
  if (!input.partnerName.trim()) throw new Error('分譲元(相手方の名称)を入力してください。');

  const drugDoc = await db.drugs.findOne(input.drugCode).exec();
  if (!drugDoc) throw new Error('薬品が見つかりません。');

  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const arrivalDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  await db.drug_stocks.insert({
    id: `stock_transfer_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    drugCode: input.drugCode,
    janCode: input.janCode?.trim() || '',
    lotNumber: input.lotNumber?.trim() || '',
    expirationDate: input.expirationDate || '',
    quantity: input.quantity,
    arrivalDate,
    supplier: `分譲: ${input.partnerName.trim()}`
  });
  await drugDoc.patch({ stockQuantity: roundQuantity((drugDoc.stockQuantity || 0) + input.quantity) });

  const record: StockTransferRecord = {
    direction: 'in',
    drugCode: input.drugCode,
    drugName: drugDoc.name,
    quantity: input.quantity,
    lotNumber: input.lotNumber?.trim() || undefined,
    expirationDate: input.expirationDate || undefined,
    partnerName: input.partnerName.trim(),
    partnerAddress: input.partnerAddress?.trim() || undefined,
    note: input.note?.trim() || undefined,
    transferredAt: now.toISOString()
  };
  await logAuditAction(db, 'stock_update', buildTransferAuditDetail(record));
  return record;
}

const escapeHtml = (value: string): string => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
);

export interface TransferDocumentInput {
  record: StockTransferRecord;
  pharmacyName: string;
  pharmacyAddress?: string;
  pharmacyPhone?: string;
}

// 医薬品 譲渡(譲受)記録書。様式自由だが、品名・数量・年月日・相手方の氏名住所を必須記載とする。
export function buildTransferDocumentHtml({ record, pharmacyName, pharmacyAddress, pharmacyPhone }: TransferDocumentInput): string {
  const isOut = record.direction === 'out';
  const title = isOut ? '医薬品 譲渡記録書' : '医薬品 譲受記録書';
  const partnerLabel = isOut ? '譲渡先(譲受者)' : '譲渡元(譲渡者)';
  const selfLabel = isOut ? '譲渡者' : '譲受者';
  const dateLabel = record.transferredAt.slice(0, 10).replace(/-/g, '/');

  const row = (label: string, value: string) => `
      <tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || '-')}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A5; margin: 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif; font-size: 10.5pt; color: #000; line-height: 1.6; }
  h1 { font-size: 14pt; text-align: center; letter-spacing: 0.35em; margin-bottom: 6mm; }
  .date { text-align: right; margin-bottom: 4mm; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6mm; }
  th, td { border: 1px solid #000; padding: 2.2mm 3mm; text-align: left; vertical-align: top; }
  th { width: 34%; background: #f2f2f2; font-weight: 600; }
  .sign { margin-top: 8mm; display: flex; justify-content: flex-end; }
  .sign-box { width: 60%; }
  .footnote { margin-top: 6mm; font-size: 8.5pt; color: #333; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="date">記録日: ${escapeHtml(dateLabel)}</div>
  <table>
    ${row('品名', record.drugName)}
    ${row('薬品コード', record.drugCode)}
    ${row('数量', String(record.quantity))}
    ${row('ロット番号', record.lotNumber || '')}
    ${row('使用期限', record.expirationDate || '')}
    ${row(`${partnerLabel} 名称`, record.partnerName)}
    ${row(`${partnerLabel} 住所`, record.partnerAddress || '')}
    ${row('備考', record.note || '')}
  </table>
  <div class="sign">
    <table class="sign-box">
      ${row(`${selfLabel} 名称`, pharmacyName)}
      ${row(`${selfLabel} 住所`, pharmacyAddress || '')}
      ${row('電話番号', pharmacyPhone || '')}
      ${row('記録者', record.operatorName || '')}
    </table>
  </div>
  <div class="footnote">本記録は医薬品の譲渡・譲受の記録として3年間保存してください。</div>
  <script>window.addEventListener('load', function () { window.print(); });</script>
</body>
</html>`;
}

export function openTransferDocumentPrintWindow(input: TransferDocumentInput): boolean {
  if (typeof window === 'undefined') return false;
  const printWindow = window.open('', '_blank', 'width=640,height=840');
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(buildTransferDocumentHtml(input));
  printWindow.document.close();
  return true;
}
