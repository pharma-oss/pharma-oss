// ピッキング結果のレジロール(レシート)印刷。
// 80mm幅のサーマルプリンタを想定したレイアウトで、専用ウィンドウを開いて印刷する。
// 58mm幅プリンタでもドライバ側の縮小で崩れにくいよう、単純な1カラム構成にしている。

export interface PickingReceiptItem {
  location?: string;
  drugName: string;
  totalQuantity: number | string;
  usage?: string;
  days?: number | string;
  isPicked: boolean;
  pickedLotNumber?: string;
  pickedExpirationDate?: string;
  shortageQuantity?: number;
  shortageNote?: string;
}

export interface PickingReceiptInput {
  pharmacyName?: string;
  patientName: string;
  dispensingDate?: string;
  operatorName?: string;
  printedAt?: Date;
  items: PickingReceiptItem[];
}

const escapeHtml = (value: string): string => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
);

const formatPrintedAt = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const buildPickingReceiptHtml = (input: PickingReceiptInput): string => {
  const printedAt = formatPrintedAt(input.printedAt || new Date());
  const pickedCount = input.items.filter((item) => item.isPicked).length;
  const shortageItems = input.items.filter((item) => (item.shortageQuantity || 0) > 0);

  const itemsHtml = input.items.map((item) => {
    const evidence = item.isPicked
      ? `✓照合済${item.pickedLotNumber ? ` Lot ${escapeHtml(item.pickedLotNumber)}` : ''}${item.pickedExpirationDate ? ` 期限 ${escapeHtml(item.pickedExpirationDate)}` : ''}`
      : '未照合';
    const shortage = (item.shortageQuantity || 0) > 0
      ? `<div class="shortage">★不足 ${escapeHtml(String(item.shortageQuantity))}${item.shortageNote ? `（${escapeHtml(item.shortageNote)}）` : ''}</div>`
      : '';
    return `
      <div class="item">
        <div class="item-head">
          <span class="loc">${escapeHtml(item.location || '棚未設定')}</span>
          <span class="qty">${escapeHtml(String(item.totalQuantity))}</span>
        </div>
        <div class="name">${escapeHtml(item.drugName)}</div>
        <div class="meta">${escapeHtml(item.usage || '用法未設定')}${item.days ? `（${escapeHtml(String(item.days))}日分）` : ''}</div>
        <div class="meta ${item.isPicked ? 'ok' : 'pending'}">${evidence}</div>
        ${shortage}
      </div>`;
  }).join('');

  const shortageSummary = shortageItems.length > 0
    ? `<div class="summary-line warn">不足 ${shortageItems.length}品目（要発注・融通確認）</div>`
    : '<div class="summary-line">不足なし</div>';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>ピッキングリスト</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 72mm;
    font-family: "Hiragino Sans", "Yu Gothic", "Meiryo", monospace, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    color: #000;
  }
  .center { text-align: center; }
  h1 { font-size: 12pt; text-align: center; letter-spacing: 0.2em; padding: 2mm 0 1mm; }
  .head-meta { font-size: 9pt; }
  .patient { font-size: 11.5pt; font-weight: bold; margin: 1mm 0; }
  hr { border: none; border-top: 1px dashed #000; margin: 1.5mm 0; }
  .item { padding: 1mm 0; border-bottom: 1px dashed #000; }
  .item-head { display: flex; justify-content: space-between; font-weight: bold; }
  .loc { font-size: 9.5pt; }
  .qty { font-size: 12pt; }
  .name { font-weight: bold; word-break: break-all; }
  .meta { font-size: 9pt; }
  .meta.ok { font-weight: bold; }
  .meta.pending { font-weight: bold; }
  .shortage { font-size: 10pt; font-weight: bold; padding-top: 0.5mm; }
  .summary { padding-top: 1.5mm; font-size: 10pt; }
  .summary-line { font-weight: bold; }
  .footer { font-size: 8.5pt; text-align: center; padding-top: 2mm; }
</style>
</head>
<body>
  ${input.pharmacyName ? `<div class="center head-meta">${escapeHtml(input.pharmacyName)}</div>` : ''}
  <h1>ピッキングリスト</h1>
  <div class="patient">${escapeHtml(input.patientName)} 様</div>
  <div class="head-meta">調剤日: ${escapeHtml(input.dispensingDate || printedAt.slice(0, 10))}${input.operatorName ? ` / 担当: ${escapeHtml(input.operatorName)}` : ''}</div>
  <div class="head-meta">印刷: ${printedAt}</div>
  <hr>
  ${itemsHtml}
  <div class="summary">
    <div class="summary-line">GS1照合 ${pickedCount} / ${input.items.length} 件</div>
    ${shortageSummary}
  </div>
  <div class="footer">現物と数量を確認のうえ監査へ回してください</div>
  <script>window.addEventListener('load', function () { window.print(); });</script>
</body>
</html>`;
};

export const openPickingReceiptPrintWindow = (input: PickingReceiptInput): boolean => {
  if (typeof window === 'undefined') return false;
  const printWindow = window.open('', '_blank', 'width=420,height=640');
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(buildPickingReceiptHtml(input));
  printWindow.document.close();
  return true;
};
