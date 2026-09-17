import type { DosageCategory } from './dosage_category.ts';
import {
  resolveCalculationDosageFlags,
  resolveEffectiveDosageCategory,
  type CalculationDosageFlags,
  DOSAGE_CATEGORY_LABELS
} from './dosage_category.ts';
import { buildCsvDocument } from './csv_escape.ts';

export interface DosageCategoryConflictInput {
  visitId: string;
  rpNumber?: number;
  itemId?: string;
  drugName?: string;
  dispensedDrug?: string;
  usage?: string;
  dosageCategory?: DosageCategory;
  dosageCategorySource?: 'auto' | 'manual';
}

export interface DosageCategoryConflictCase {
  visitId: string;
  rpNumber?: number;
  /** 算定側が現在どう扱っているか */
  calculationCategoryLabel: string;
  /** 帳票側（実効剤形）がどう扱っているか */
  printCategoryLabel: string;
}

/** 受付ごとの what-if 点数。画面が計算して渡す（DB・施設設定・患者が要るため純粋関数にできない） */
export interface DosageCategoryConflictPoints {
  visitId: string;
  /** 現行 ('legacy') で計算した点数 */
  legacyPoints: number;
  /** 手動指定尊重 ('respect_manual') で計算した点数 */
  respectManualPoints: number;
}

export interface DosageCategoryConflictReview {
  checkedItemCount: number;
  cases: DosageCategoryConflictCase[];
  /** 食い違った明細を含む受付の数 */
  affectedVisitCount: number;
  /** 点数が動く受付の数。points を渡さなかった場合は 0 */
  pointsChangedVisitCount: number;
  /** 増えた分と減った分を相殺した合計。points を渡さなかった場合は 0 */
  netDeltaPoints: number;
  /** 受付ID → 点数差（respectManual − legacy）。0 の受付は含めない */
  deltaPointsByVisitId: Record<string, number>;
}

export function getCalculationCategoryLabel(flags: CalculationDosageFlags): string {
  if (flags.isExternal) return '外用';
  if (flags.isTonpuku) return '頓服';
  if (flags.isNaiteki) return '内滴';
  if (flags.isInjection) return '注射';
  return '内服';
}

export function buildDosageCategoryConflictReview(
  inputs: DosageCategoryConflictInput[],
  points?: DosageCategoryConflictPoints[]
): DosageCategoryConflictReview {
  const cases: DosageCategoryConflictCase[] = [];

  for (const input of inputs) {
    const calcFlags = resolveCalculationDosageFlags(input, 'legacy');
    const calculationCategoryLabel = getCalculationCategoryLabel(calcFlags);

    const effectiveCategory = resolveEffectiveDosageCategory(input);
    const printCategoryLabel = DOSAGE_CATEGORY_LABELS[effectiveCategory] || effectiveCategory;

    if (calculationCategoryLabel !== printCategoryLabel) {
      cases.push({
        visitId: input.visitId,
        rpNumber: input.rpNumber,
        calculationCategoryLabel,
        printCategoryLabel
      });
    }
  }

  const affectedVisits = new Set(cases.map((c) => c.visitId));

  let pointsChangedVisitCount = 0;
  let netDeltaPoints = 0;
  const deltaPointsByVisitId: Record<string, number> = {};

  if (points && points.length > 0) {
    for (const p of points) {
      const delta = p.respectManualPoints - p.legacyPoints;
      if (delta !== 0) {
        pointsChangedVisitCount++;
        netDeltaPoints += delta;
        deltaPointsByVisitId[p.visitId] = delta;
      }
    }
  }

  return {
    checkedItemCount: inputs.length,
    cases,
    affectedVisitCount: affectedVisits.size,
    pointsChangedVisitCount,
    netDeltaPoints,
    deltaPointsByVisitId
  };
}

export function buildDosageCategoryConflictCsv(review: DosageCategoryConflictReview): string {
  const headers = ['受付ID', 'Rp番号', '現行算定判定', '実効剤形（帳票）', '増減', '点数差'];

  const rows = review.cases.map((c) => {
    const delta = review.deltaPointsByVisitId[c.visitId];
    let direction = '';
    let diff = '';

    if (delta !== undefined) {
      if (delta > 0) {
        direction = '増';
        diff = String(delta);
      } else if (delta < 0) {
        direction = '減';
        diff = String(Math.abs(delta));
      }
    }

    return [
      c.visitId,
      c.rpNumber !== undefined ? String(c.rpNumber) : '',
      c.calculationCategoryLabel,
      c.printCategoryLabel,
      direction,
      diff
    ];
  });

  return buildCsvDocument([headers, ...rows]);
}

export function makeDosageCategoryConflictCsvFileName(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `dosage_category_conflict_${now.getFullYear()}${pad(now.getMonth() + 1)}` +
    `${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}` +
    `${pad(now.getSeconds())}.csv`
  );
}

export function formatDosageCategoryConflictSummary(review: DosageCategoryConflictReview): string {
  if (review.checkedItemCount === 0) return '点検対象の処方明細がありません。';
  if (review.cases.length === 0) {
    return `処方明細 ${review.checkedItemCount}件を点検し、剤形判定の食い違いはありませんでした。`;
  }
  const parts = [
    `処方明細 ${review.checkedItemCount}件のうち ${review.cases.length}件（${review.affectedVisitCount}受付）で算定と帳票の剤形判定が食い違っています`
  ];
  if (review.pointsChangedVisitCount > 0) {
    parts.push(
      `点数変動 ${review.pointsChangedVisitCount}受付（差引 ${review.netDeltaPoints >= 0 ? '+' : ''}${review.netDeltaPoints}点）`
    );
  }
  return `${parts.join(' / ')}。`;
}
