import { choosePrimarySupplier, csvCell, formatInventoryAmount } from './inventory_order.ts';
import { toLocalDateKey } from './local_date.ts';

export const EXPIRY_URGENT_DAYS = 60;
export const EXPIRY_ATTENTION_DAYS = 180;
export const DEFAULT_LEAD_TIME_DAYS = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StockLotExpiryLike {
  lotNumber?: string;
  expirationDate?: string;
  quantity?: number;
  supplier?: string;
}

export interface InventoryExpiryRisk {
  nearestExpirationDate: string | null;
  expiredQuantity: number;
  urgentExpiringQuantity: number;
  attentionExpiringQuantity: number;
  hasExpired: boolean;
  hasUrgentExpiring: boolean;
  hasAttentionExpiring: boolean;
  daysToNearestExpiry: number | null;
}

export interface InventorySubstituteCandidate {
  drugCode: string;
  drugName: string;
  yjCode: string;
  price?: number;
  isGeneric: boolean;
  availableAmount: number;
  location?: string;
  supplierName?: string;
  isSameGenericName: boolean;
}

export type OrderRiskReason = 'prescription_shortage' | 'below_reorder_point' | 'expiring_soon' | 'combined';

export interface EnhancedInventoryOrderRisk {
  drugId: string;
  drugName: string;
  location: string;
  supplierName: string;
  requiredAmount: number;
  availableAmount: number;
  effectiveAvailableAmount: number;
  reorderPoint: number;
  leadTimeDays: number;
  targetStock?: number;
  shortageAmount: number;
  reorderPointShortage: number;
  recommendedOrderAmount: number;
  affectedVisitCount: number;
  priority: 'high' | 'medium';
  riskReason: OrderRiskReason;
  actionLabel: string;
  pickingShortageAmount?: number;
  expiryRisk: InventoryExpiryRisk;
  substitutes: InventorySubstituteCandidate[];
}

export interface DrugRecordForSubstitute {
  code: string;
  name: string;
  yjCode?: string;
  genericName?: string;
  price?: number;
  isGeneric?: boolean;
  location?: string;
  stockQuantity?: number;
  reorderPoint?: number;
  leadTimeDays?: number;
  targetStock?: number;
  isHighRisk?: boolean;
  isNarcotic?: boolean;
  isPsychotropic?: boolean;
  isPoisonous?: boolean;
}

export function parseDateOnly(value?: string | null): string | null {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * ロット一覧の使用期限と数量を評価し、期限切れ・切迫ロット（60日/180日）を判定する。
 * 期限切れ（当日以前）のロットは有効在庫から除外すべきリスクとして集計する。
 */
export function evaluateStockLotExpiry(
  lots: readonly StockLotExpiryLike[],
  now: Date = new Date()
): InventoryExpiryRisk {
  const nowDateStr = toLocalDateKey(now);
  const nowTime = new Date(`${nowDateStr}T00:00:00Z`).getTime();

  let nearestExpirationDate: string | null = null;
  let nearestExpiryTime: number | null = null;
  let expiredQuantity = 0;
  let urgentExpiringQuantity = 0;
  let attentionExpiringQuantity = 0;

  for (const lot of lots) {
    const qty = typeof lot.quantity === 'number' && Number.isFinite(lot.quantity) ? Math.max(0, lot.quantity) : 0;
    if (qty <= 0) continue;

    const expiryDateStr = parseDateOnly(lot.expirationDate);
    if (!expiryDateStr) continue;

    const expiryTime = new Date(`${expiryDateStr}T00:00:00Z`).getTime();
    if (Number.isNaN(expiryTime)) continue;

    if (nearestExpiryTime === null || expiryTime < nearestExpiryTime) {
      nearestExpiryTime = expiryTime;
      nearestExpirationDate = expiryDateStr;
    }

    const diffDays = Math.floor((expiryTime - nowTime) / DAY_MS);

    if (diffDays <= 0) {
      expiredQuantity += qty;
    } else if (diffDays <= EXPIRY_URGENT_DAYS) {
      urgentExpiringQuantity += qty;
    } else if (diffDays <= EXPIRY_ATTENTION_DAYS) {
      attentionExpiringQuantity += qty;
    }
  }

  const daysToNearestExpiry = nearestExpiryTime !== null
    ? Math.floor((nearestExpiryTime - nowTime) / DAY_MS)
    : null;

  return {
    nearestExpirationDate,
    expiredQuantity,
    urgentExpiringQuantity,
    attentionExpiringQuantity,
    hasExpired: expiredQuantity > 0,
    hasUrgentExpiring: urgentExpiringQuantity > 0,
    hasAttentionExpiring: attentionExpiringQuantity > 0,
    daysToNearestExpiry
  };
}

/**
 * 処方中必要量、実質有効在庫、発注点、目標在庫から推奨発注量と不足額を算出する。
 */
export function calculateReorderAmounts({
  effectiveAvailableAmount,
  requiredAmount,
  reorderPoint = 0,
  targetStock
}: {
  effectiveAvailableAmount: number;
  requiredAmount: number;
  reorderPoint?: number;
  targetStock?: number;
}): {
  shortageAmount: number;
  reorderPointShortage: number;
  recommendedOrderAmount: number;
  isShortage: boolean;
  isBelowReorderPoint: boolean;
} {
  const shortageAmount = Math.max(0, requiredAmount - effectiveAvailableAmount);
  const isShortage = shortageAmount > 0;

  // 処方分を差し引いた後の見込み残在庫
  const projectedRemaining = effectiveAvailableAmount - requiredAmount;
  const safeReorderPoint = Math.max(0, reorderPoint);
  const reorderPointShortage = projectedRemaining <= safeReorderPoint
    ? Math.max(0, safeReorderPoint - projectedRemaining)
    : 0;
  const isBelowReorderPoint = safeReorderPoint > 0 && projectedRemaining <= safeReorderPoint;

  let recommendedOrderAmount = 0;
  if (typeof targetStock === 'number' && targetStock > 0) {
    // 目標在庫が設定されている場合は、見込み残在庫から目標在庫までの差分を発注
    recommendedOrderAmount = Math.max(0, targetStock - projectedRemaining);
  } else {
    // 目標在庫未設定時は、処方不足または発注点割れを満たす最大量を発注
    recommendedOrderAmount = Math.max(shortageAmount, reorderPointShortage);
  }

  return {
    shortageAmount,
    reorderPointShortage,
    recommendedOrderAmount,
    isShortage,
    isBelowReorderPoint
  };
}

/**
 * 同一成分・規格（YJコード上7桁一致）の院内代替薬候補を探索する。
 * 院内有効在庫（stockQuantity またはロット合計）がある候補を優先してソートする。
 */
export function findInStockSubstitutes(
  targetDrug: { code: string; yjCode?: string; genericName?: string },
  allDrugs: readonly DrugRecordForSubstitute[],
  stockLotsByDrugCode?: ReadonlyMap<string, readonly StockLotExpiryLike[]>
): InventorySubstituteCandidate[] {
  const targetYj = String(targetDrug.yjCode || '').trim();
  if (targetYj.length < 7) return [];

  const targetPrefix = targetYj.slice(0, 7);
  const targetCode = targetDrug.code;
  const targetGeneric = String(targetDrug.genericName || '').trim().toLowerCase();

  const candidates: InventorySubstituteCandidate[] = [];

  for (const drug of allDrugs) {
    if (drug.code === targetCode) continue;
    const drugYj = String(drug.yjCode || '').trim();
    if (!drugYj.startsWith(targetPrefix)) continue;

    const lots = stockLotsByDrugCode?.get(drug.code) || [];
    let availableAmount = drug.stockQuantity ?? 0;
    if (lots.length > 0) {
      const nowDateStr = toLocalDateKey();
      const nowTime = new Date(`${nowDateStr}T00:00:00Z`).getTime();
      availableAmount = lots.reduce((sum, lot) => {
        const qty = typeof lot.quantity === 'number' && Number.isFinite(lot.quantity) ? Math.max(0, lot.quantity) : 0;
        if (qty <= 0) return sum;
        if (lot.expirationDate) {
          const match = String(lot.expirationDate).match(/^(\d{4}-\d{2}-\d{2})/);
          const expDateStr = match ? match[1] : null;
          if (expDateStr) {
            const expTime = new Date(`${expDateStr}T00:00:00Z`).getTime();
            if (!Number.isNaN(expTime) && expTime <= nowTime) {
              return sum; // 期限切れロットは除外
            }
          }
        }
        return sum + qty;
      }, 0);
    }

    const candidateGeneric = String(drug.genericName || '').trim().toLowerCase();
    const isSameGenericName = Boolean(targetGeneric && candidateGeneric && targetGeneric === candidateGeneric);

    candidates.push({
      drugCode: drug.code,
      drugName: drug.name,
      yjCode: drugYj,
      price: drug.price,
      isGeneric: !!drug.isGeneric,
      availableAmount,
      location: drug.location || '棚位置未設定',
      supplierName: choosePrimarySupplier(lots),
      isSameGenericName
    });
  }

  // 在庫が多い順、次に同一般名、次に先発/後発、最後に薬品名順でソート
  return candidates.sort((a, b) => {
    if (a.availableAmount !== b.availableAmount) {
      return b.availableAmount - a.availableAmount;
    }
    if (a.isSameGenericName !== b.isSameGenericName) {
      return a.isSameGenericName ? -1 : 1;
    }
    return a.drugName.localeCompare(b.drugName, 'ja');
  });
}

/**
 * 統合リスク判定（処方不足、発注点割れ、期限切迫、代替薬候補）を行い、
 * 完全な EnhancedInventoryOrderRisk を構築する。
 */
export function buildEnhancedInventoryOrderRisk({
  drug,
  lots = [],
  requiredAmount = 0,
  affectedVisitCount = 1,
  pickingShortageAmount,
  allDrugs = [],
  stockLotsByDrugCode,
  now = new Date()
}: {
  drug: DrugRecordForSubstitute;
  lots?: readonly StockLotExpiryLike[];
  requiredAmount?: number;
  affectedVisitCount?: number;
  pickingShortageAmount?: number;
  allDrugs?: readonly DrugRecordForSubstitute[];
  stockLotsByDrugCode?: ReadonlyMap<string, readonly StockLotExpiryLike[]>;
  now?: Date;
}): EnhancedInventoryOrderRisk | null {
  const expiryRisk = evaluateStockLotExpiry(lots, now);

  const rawAvailable = lots.length > 0
    ? lots.reduce((sum, lot) => sum + (typeof lot.quantity === 'number' ? Math.max(0, lot.quantity) : 0), 0)
    : (drug.stockQuantity ?? 0);

  // 期限切れロットは実質利用可能在庫から除外（医療安全原則）
  const effectiveAvailableAmount = Math.max(0, rawAvailable - expiryRisk.expiredQuantity);

  const reorderPoint = typeof drug.reorderPoint === 'number' ? Math.max(0, drug.reorderPoint) : 0;
  const leadTimeDays = typeof drug.leadTimeDays === 'number' ? Math.max(0, drug.leadTimeDays) : DEFAULT_LEAD_TIME_DAYS;
  const targetStock = typeof drug.targetStock === 'number' ? Math.max(0, drug.targetStock) : undefined;

  const {
    shortageAmount,
    reorderPointShortage,
    recommendedOrderAmount,
    isShortage,
    isBelowReorderPoint
  } = calculateReorderAmounts({
    effectiveAvailableAmount,
    requiredAmount,
    reorderPoint,
    targetStock
  });

  // 発注対象となる条件:
  // 1. 処方不足がある (isShortage)
  // 2. 発注点を下回っている (isBelowReorderPoint)
  // 3. ピッキング棚不足が報告されている ((pickingShortageAmount || 0) > 0)
  // 4. 直近期限切れ・切迫ロットがあり残在庫が発注点を割り込む
  const hasPickingShortage = (pickingShortageAmount || 0) > 0;
  const hasActionableRisk = isShortage || isBelowReorderPoint || hasPickingShortage || (expiryRisk.hasExpired && effectiveAvailableAmount <= reorderPoint);

  if (!hasActionableRisk && recommendedOrderAmount <= 0) {
    return null;
  }

  // 理由判定
  let riskReason: OrderRiskReason = 'below_reorder_point';
  if (isShortage && isBelowReorderPoint) {
    riskReason = 'combined';
  } else if (isShortage || hasPickingShortage) {
    riskReason = 'prescription_shortage';
  } else if (expiryRisk.hasExpired || expiryRisk.hasUrgentExpiring) {
    riskReason = 'expiring_soon';
  }

  const isHighRiskMedication = !!(
    drug.isHighRisk ||
    drug.isNarcotic ||
    drug.isPsychotropic ||
    drug.isPoisonous
  );

  const priority: 'high' | 'medium' = (
    effectiveAvailableAmount <= 0 ||
    isShortage ||
    hasPickingShortage ||
    isHighRiskMedication ||
    affectedVisitCount >= 2 ||
    expiryRisk.hasExpired
  ) ? 'high' : 'medium';

  // 代替薬候補の探索
  const substitutes = findInStockSubstitutes(drug, allDrugs, stockLotsByDrugCode);
  const inStockSubstitutesCount = substitutes.filter((sub) => sub.availableAmount > 0).length;

  let actionLabel = '';
  if (hasPickingShortage) {
    actionLabel = '棚不足の報告あり・現物確認と至急手配';
  } else if (effectiveAvailableAmount <= 0 && isShortage) {
    actionLabel = inStockSubstitutesCount > 0
      ? `在庫ゼロ(処方不足)・院内代替薬${inStockSubstitutesCount}件あり・至急発注`
      : '在庫ゼロ(処方不足)・至急発注・分譲確認';
  } else if (isShortage) {
    actionLabel = inStockSubstitutesCount > 0
      ? `処方不足${formatInventoryAmount(shortageAmount)}・代替薬${inStockSubstitutesCount}件あり・発注手配`
      : `処方不足${formatInventoryAmount(shortageAmount)}を発注・手配確認`;
  } else if (expiryRisk.hasExpired) {
    actionLabel = `期限切れ${formatInventoryAmount(expiryRisk.expiredQuantity)}発生・廃棄/返品と補充発注`;
  } else if (isBelowReorderPoint) {
    actionLabel = `発注点割れ(残${formatInventoryAmount(effectiveAvailableAmount)}/点${formatInventoryAmount(reorderPoint)})・計画発注`;
  } else {
    actionLabel = '推奨数量を発注・在庫手配';
  }

  return {
    drugId: drug.code,
    drugName: drug.name,
    location: drug.location || '棚位置未設定',
    supplierName: choosePrimarySupplier(lots),
    requiredAmount,
    availableAmount: rawAvailable,
    effectiveAvailableAmount,
    reorderPoint,
    leadTimeDays,
    targetStock,
    shortageAmount,
    reorderPointShortage,
    recommendedOrderAmount: recommendedOrderAmount > 0 ? recommendedOrderAmount : shortageAmount,
    affectedVisitCount,
    priority,
    riskReason,
    actionLabel,
    pickingShortageAmount,
    expiryRisk,
    substitutes
  };
}

/**
 * 拡張発注 CSV を生成する。
 * 【患者名を含まない発注 CSV の規約を厳格に維持】
 * 薬品コード、薬品名、棚位置、仕入先、必要量、在庫量、有効在庫、発注点、発注目安、影響件数、期限切迫、代替薬候補数、推奨アクションのみで構成。
 */
export function buildEnhancedInventoryOrderCsv(risks: readonly EnhancedInventoryOrderRisk[]): string {
  const header = [
    '優先度',
    '発注理由',
    '薬品コード',
    '薬品名',
    '棚位置',
    '仕入先候補',
    '処方必要量',
    '総在庫量',
    '有効在庫量',
    '発注点',
    'リードタイム日数',
    '発注目安量',
    '影響処方件数',
    '使用期限リスク',
    '最短使用期限',
    '代替候補数',
    '主な院内代替薬',
    '推奨アクション',
    '棚不足報告'
  ];

  const rows = risks.map((risk) => {
    const reasonLabel = risk.riskReason === 'prescription_shortage'
      ? '処方不足'
      : risk.riskReason === 'below_reorder_point'
        ? '発注点割れ'
        : risk.riskReason === 'expiring_soon'
          ? '期限切迫'
          : '処方不足+発注点';

    const expiryLabel = risk.expiryRisk.hasExpired
      ? `期限切れ(${formatInventoryAmount(risk.expiryRisk.expiredQuantity)})`
      : risk.expiryRisk.hasUrgentExpiring
        ? `至急切迫(${formatInventoryAmount(risk.expiryRisk.urgentExpiringQuantity)})`
        : risk.expiryRisk.hasAttentionExpiring
          ? `注意切迫(${formatInventoryAmount(risk.expiryRisk.attentionExpiringQuantity)})`
          : '正常';

    const topSubstitute = risk.substitutes.find((s) => s.availableAmount > 0);
    const topSubstituteText = topSubstitute
      ? `${topSubstitute.drugName}(在庫:${formatInventoryAmount(topSubstitute.availableAmount)})`
      : risk.substitutes.length > 0
        ? `${risk.substitutes[0].drugName}(在庫0)`
        : 'なし';

    return [
      risk.priority === 'high' ? '至急' : '注意',
      reasonLabel,
      risk.drugId,
      risk.drugName,
      risk.location,
      risk.supplierName,
      formatInventoryAmount(risk.requiredAmount),
      formatInventoryAmount(risk.availableAmount),
      formatInventoryAmount(risk.effectiveAvailableAmount),
      risk.reorderPoint > 0 ? formatInventoryAmount(risk.reorderPoint) : '未設定',
      `${risk.leadTimeDays}日`,
      formatInventoryAmount(risk.recommendedOrderAmount),
      String(risk.affectedVisitCount),
      expiryLabel,
      risk.expiryRisk.nearestExpirationDate || '記録なし',
      String(risk.substitutes.length),
      topSubstituteText,
      risk.actionLabel,
      (risk.pickingShortageAmount || 0) > 0 ? formatInventoryAmount(risk.pickingShortageAmount as number) : ''
    ];
  });

  return [header, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');
}

/**
 * 拡張発注メモテキストを生成する（クリップボードコピー用）。
 * 患者情報を含まず、仕入先・発注目安・発注点・代替薬・期限情報を端潔にまとめる。
 */
export function buildEnhancedInventoryOrderMemo(risks: readonly EnhancedInventoryOrderRisk[]): string {
  const lines = [
    `在庫発注・補充候補 ${risks.length}品目`,
    ...risks.map((risk) => {
      const parts: string[] = [
        `${risk.priority === 'high' ? '【至急】' : '【注意】'}${risk.drugName}`,
        `発注目安: ${formatInventoryAmount(risk.recommendedOrderAmount)}`,
        `有効在庫: ${formatInventoryAmount(risk.effectiveAvailableAmount)}`
      ];

      if (risk.reorderPoint > 0) {
        parts.push(`発注点: ${formatInventoryAmount(risk.reorderPoint)}`);
      }
      if (risk.requiredAmount > 0) {
        parts.push(`処方必要: ${formatInventoryAmount(risk.requiredAmount)}`);
      }
      if (risk.expiryRisk.hasExpired || risk.expiryRisk.hasUrgentExpiring) {
        parts.push(`期限注意(${risk.expiryRisk.nearestExpirationDate || ''})`);
      }

      const inStockSub = risk.substitutes.find((s) => s.availableAmount > 0);
      if (inStockSub) {
        parts.push(`代替候補: ${inStockSub.drugName}(在庫:${formatInventoryAmount(inStockSub.availableAmount)})`);
      }

      parts.push(`仕入先: ${risk.supplierName}`);
      parts.push(risk.actionLabel);

      return parts.join(' / ');
    })
  ];

  return lines.join('\n');
}
