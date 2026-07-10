// 不動在庫(デッドストック)の検出。
// 在庫があるのに一定期間出庫(調剤)も入庫もない薬品を洗い出し、
// 期限リスクと金額を添えて分譲・返品・棚卸の判断材料にする。

export interface DeadStockDrugLike {
  code: string;
  name: string;
  location?: string;
  price?: number;
  stockQuantity?: number;
}

export interface DeadStockLotLike {
  drugCode: string;
  arrivalDate?: string;
  expirationDate?: string;
  quantity?: number;
}

export interface DeadStockItemLike {
  visitId: string;
  drugId: string;
  dispensedDrugCode?: string;
}

export interface DeadStockVisitLike {
  visitId: string;
  issueDate?: string;
  status?: string;
}

export interface DeadStockEntry {
  drugCode: string;
  drugName: string;
  location: string;
  stockQuantity: number;
  stockValue: number;
  lastDispensedAt: string | null;
  lastArrivalAt: string | null;
  lastMovementAt: string | null;
  idleDays: number | null; // null = 入出庫の記録が一度もない
  nearestExpiry: string | null;
  isExpiringSoon: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const EXPIRY_ATTENTION_DAYS = 180;

const toDateOnly = (value?: string): string | null => {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

const laterDate = (a: string | null, b: string | null): string | null => {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
};

export interface DeadStockReportInput {
  drugs: DeadStockDrugLike[];
  stockLots: DeadStockLotLike[];
  prescriptionItems: DeadStockItemLike[];
  visits: DeadStockVisitLike[];
  thresholdDays: number;
  now?: Date;
}

export function buildDeadStockReport({
  drugs,
  stockLots,
  prescriptionItems,
  visits,
  thresholdDays,
  now = new Date()
}: DeadStockReportInput): DeadStockEntry[] {
  const nowDateOnly = now.toISOString().slice(0, 10);

  const visitDateById = new Map<string, string>();
  for (const visit of visits) {
    const date = toDateOnly(visit.issueDate);
    if (date) visitDateById.set(visit.visitId, date);
  }

  // 調剤での最終出庫日: 処方明細の在庫追跡コード(調剤薬優先)で集計する
  const lastDispensedByDrug = new Map<string, string>();
  for (const item of prescriptionItems) {
    const stockDrugId = item.dispensedDrugCode || item.drugId;
    if (!stockDrugId) continue;
    const visitDate = visitDateById.get(item.visitId);
    if (!visitDate) continue;
    const current = lastDispensedByDrug.get(stockDrugId);
    if (!current || visitDate > current) lastDispensedByDrug.set(stockDrugId, visitDate);
  }

  const lastArrivalByDrug = new Map<string, string>();
  const nearestExpiryByDrug = new Map<string, string>();
  for (const lot of stockLots) {
    if ((lot.quantity || 0) > 0) {
      const expiry = toDateOnly(lot.expirationDate);
      if (expiry) {
        const currentExpiry = nearestExpiryByDrug.get(lot.drugCode);
        if (!currentExpiry || expiry < currentExpiry) nearestExpiryByDrug.set(lot.drugCode, expiry);
      }
    }
    const arrival = toDateOnly(lot.arrivalDate);
    if (arrival) {
      const currentArrival = lastArrivalByDrug.get(lot.drugCode);
      if (!currentArrival || arrival > currentArrival) lastArrivalByDrug.set(lot.drugCode, arrival);
    }
  }

  const entries: DeadStockEntry[] = [];
  for (const drug of drugs) {
    const stockQuantity = drug.stockQuantity || 0;
    if (stockQuantity <= 0) continue;

    const lastDispensedAt = lastDispensedByDrug.get(drug.code) || null;
    const lastArrivalAt = lastArrivalByDrug.get(drug.code) || null;
    const lastMovementAt = laterDate(lastDispensedAt, lastArrivalAt);
    const idleDays = lastMovementAt
      ? Math.floor((new Date(`${nowDateOnly}T00:00:00`).getTime() - new Date(`${lastMovementAt}T00:00:00`).getTime()) / DAY_MS)
      : null;

    // 記録なし(null)は動きが追えない在庫として不動扱いに含める
    if (idleDays !== null && idleDays < thresholdDays) continue;

    const nearestExpiry = nearestExpiryByDrug.get(drug.code) || null;
    const isExpiringSoon = !!nearestExpiry &&
      (new Date(`${nearestExpiry}T00:00:00`).getTime() - new Date(`${nowDateOnly}T00:00:00`).getTime()) / DAY_MS <= EXPIRY_ATTENTION_DAYS;

    entries.push({
      drugCode: drug.code,
      drugName: drug.name,
      location: drug.location || '棚位置未設定',
      stockQuantity,
      stockValue: Math.round(stockQuantity * (drug.price || 0) * 100) / 100,
      lastDispensedAt,
      lastArrivalAt,
      lastMovementAt,
      idleDays,
      nearestExpiry,
      isExpiringSoon
    });
  }

  entries.sort((a, b) => {
    // 記録なしを最上位、その後は滞留日数の長い順
    const aDays = a.idleDays === null ? Number.POSITIVE_INFINITY : a.idleDays;
    const bDays = b.idleDays === null ? Number.POSITIVE_INFINITY : b.idleDays;
    if (aDays !== bDays) return bDays - aDays;
    return b.stockValue - a.stockValue;
  });

  return entries;
}

const csvCell = (value: string | number): string => {
  const text = String(value ?? '');
  const safeText = /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
};

export function buildDeadStockCsv(entries: DeadStockEntry[]): string {
  const header = ['薬品コード', '薬品名', '棚位置', '在庫数', '在庫金額(薬価)', '最終調剤日', '最終入荷日', '滞留日数', '直近期限', '期限注意'];
  const rows = entries.map((entry) => [
    entry.drugCode,
    entry.drugName,
    entry.location,
    entry.stockQuantity,
    entry.stockValue,
    entry.lastDispensedAt || '',
    entry.lastArrivalAt || '',
    entry.idleDays === null ? '記録なし' : String(entry.idleDays),
    entry.nearestExpiry || '',
    entry.isExpiringSoon ? '要確認' : ''
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}
