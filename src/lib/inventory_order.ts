export interface InventoryOrderRisk {
  drugId: string;
  drugName: string;
  location: string;
  supplierName: string;
  requiredAmount: number;
  availableAmount: number;
  shortageAmount: number;
  recommendedOrderAmount: number;
  affectedVisitCount: number;
  priority: 'high' | 'medium';
  actionLabel: string;
  /** ピッキング時に現場で記録された棚不足の合計。システム在庫より現物を優先するための情報。 */
  pickingShortageAmount?: number;
}

export interface InventoryStockLotLike {
  supplier?: string;
  quantity?: number;
}

export interface InventoryReceivingChecklistRow {
  statusLabel: string;
  priorityLabel: string;
  drugId: string;
  drugName: string;
  location: string;
  supplierName: string;
  recommendedOrderAmount: number;
  shortageAmount: number;
  affectedVisitCount: number;
}

export type InventoryOrderedDrugSelection = ReadonlySet<string> | readonly string[];

export function formatInventoryAmount(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatDateForFileName(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function choosePrimarySupplier(stocks: InventoryStockLotLike[]): string {
  const supplierScores = new Map<string, number>();
  for (let i = 0; i < stocks.length; i++) {
    const supplier = String(stocks[i].supplier || '').trim();
    if (!supplier) continue;
    const quantity = typeof stocks[i].quantity === 'number' && Number.isFinite(stocks[i].quantity)
      ? Math.max(1, stocks[i].quantity || 0)
      : 1;
    supplierScores.set(supplier, (supplierScores.get(supplier) || 0) + quantity);
  }

  let primarySupplier = '';
  let primaryScore = 0;
  for (const [supplier, score] of supplierScores.entries()) {
    if (score > primaryScore) {
      primarySupplier = supplier;
      primaryScore = score;
    }
  }

  return primarySupplier || '卸未設定';
}

export function getInventoryOrderPriority({
  availableAmount,
  isHighRiskMedication,
  affectedVisitCount,
  pickingShortageAmount
}: {
  availableAmount: number;
  isHighRiskMedication: boolean;
  affectedVisitCount: number;
  pickingShortageAmount?: number;
}): 'high' | 'medium' {
  return availableAmount <= 0 || isHighRiskMedication || affectedVisitCount >= 2 || (pickingShortageAmount || 0) > 0
    ? 'high'
    : 'medium';
}

export function getInventoryOrderActionLabel({
  availableAmount,
  isHighRiskMedication,
  pickingShortageAmount
}: {
  availableAmount: number;
  isHighRiskMedication: boolean;
  pickingShortageAmount?: number;
}): string {
  if ((pickingShortageAmount || 0) > 0) return '棚不足の報告あり・現物確認と至急手配';
  if (availableAmount <= 0) return '至急発注・融通確認';
  if (isHighRiskMedication) return '重点薬の代替可否を薬剤師確認';
  return '不足数を発注・代替候補を確認';
}

export function csvCell(value: string | number): string {
  const text = String(value ?? '');
  const safeText = /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function buildInventoryOrderCsv(risks: InventoryOrderRisk[]): string {
  const header = [
    '優先度',
    '薬品コード',
    '薬品名',
    '棚位置',
    '仕入先候補',
    '必要量',
    '在庫量',
    '不足量',
    '発注目安',
    '影響件数',
    '推奨アクション',
    '棚不足報告'
  ];
  const rows = risks.map((risk) => [
    risk.priority === 'high' ? '至急' : '注意',
    risk.drugId,
    risk.drugName,
    risk.location,
    risk.supplierName,
    formatInventoryAmount(risk.requiredAmount),
    formatInventoryAmount(risk.availableAmount),
    formatInventoryAmount(risk.shortageAmount),
    formatInventoryAmount(risk.recommendedOrderAmount),
    String(risk.affectedVisitCount),
    risk.actionLabel,
    (risk.pickingShortageAmount || 0) > 0 ? formatInventoryAmount(risk.pickingShortageAmount as number) : ''
  ]);

  return [header, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');
}

export function buildInventoryOrderMemo(risks: InventoryOrderRisk[]): string {
  const lines = [
    `在庫不足リスク ${risks.length}品目`,
    ...risks.map((risk) => (
      `${risk.priority === 'high' ? '至急' : '注意'}: ${risk.drugName} / 発注目安 ${formatInventoryAmount(risk.recommendedOrderAmount)} / 不足 ${formatInventoryAmount(risk.shortageAmount)} / 仕入先候補 ${risk.supplierName} / ${risk.actionLabel}${(risk.pickingShortageAmount || 0) > 0 ? ` / 棚不足報告 ${formatInventoryAmount(risk.pickingShortageAmount as number)}` : ''}`
    ))
  ];
  return lines.join('\n');
}

function hasOrderedDrug(selection: InventoryOrderedDrugSelection, drugId: string): boolean {
  return Array.isArray(selection)
    ? selection.includes(drugId)
    : (selection as ReadonlySet<string>).has(drugId);
}

export function buildInventoryReceivingChecklistRows(
  risks: InventoryOrderRisk[],
  orderedDrugIds: InventoryOrderedDrugSelection
): InventoryReceivingChecklistRow[] {
  return risks
    .filter((risk) => hasOrderedDrug(orderedDrugIds, risk.drugId))
    .map((risk) => ({
      statusLabel: '入庫待ち',
      priorityLabel: risk.priority === 'high' ? '至急' : '注意',
      drugId: risk.drugId,
      drugName: risk.drugName,
      location: risk.location,
      supplierName: risk.supplierName,
      recommendedOrderAmount: risk.recommendedOrderAmount,
      shortageAmount: risk.shortageAmount,
      affectedVisitCount: risk.affectedVisitCount
    }))
    .sort((a, b) => {
      if (a.priorityLabel !== b.priorityLabel) return a.priorityLabel === '至急' ? -1 : 1;
      return a.drugName.localeCompare(b.drugName, 'ja');
    });
}

export function buildInventoryReceivingChecklistCsv(
  risks: InventoryOrderRisk[],
  orderedDrugIds: InventoryOrderedDrugSelection
): string {
  const header = [
    '確認状態',
    '優先度',
    '薬品コード',
    '薬品名',
    '棚位置',
    '仕入先',
    '発注目安',
    '不足量',
    '影響件数',
    '納品数量',
    'ロット番号',
    '使用期限',
    '入庫日',
    '確認者',
    '確認メモ'
  ];
  const rows = buildInventoryReceivingChecklistRows(risks, orderedDrugIds).map((row) => [
    row.statusLabel,
    row.priorityLabel,
    row.drugId,
    row.drugName,
    row.location,
    row.supplierName,
    formatInventoryAmount(row.recommendedOrderAmount),
    formatInventoryAmount(row.shortageAmount),
    String(row.affectedVisitCount),
    '',
    '',
    '',
    '',
    '',
    ''
  ]);

  return [header, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');
}

export function buildInventoryReceivingChecklistMemo(
  risks: InventoryOrderRisk[],
  orderedDrugIds: InventoryOrderedDrugSelection
): string {
  const rows = buildInventoryReceivingChecklistRows(risks, orderedDrugIds);
  const lines = [
    `入庫確認 ${rows.length}品目`,
    ...rows.map((row) => (
      `${row.priorityLabel}: ${row.drugName} / 発注目安 ${formatInventoryAmount(row.recommendedOrderAmount)} / 仕入先 ${row.supplierName} / ロット・使用期限・納品数量確認`
    ))
  ];
  return lines.join('\n');
}
