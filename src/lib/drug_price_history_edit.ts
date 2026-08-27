// 薬価の版の訂正。
//
// 遡り取込や取込ミスで版が乱れたとき、薬剤師が画面から直せるようにする。
// 版を直すと過去の調剤の薬剤料が変わるので、
//
//   - 何件の調剤で薬価が変わるか
//   - そのうち提出済みのレセプトが何件か
//
// を必ず出したうえで適用する。ここは計画を組むだけで、書き込みはしない。

import {
  formatDrugPriceRevisionLabel,
  latestDatedDrugPrice,
  resolveDrugPriceWithOverride,
  type DrugPriceOverride,
  type DrugPriceRevision
} from './drug_price_history.ts';

/** 編集欄の1行。画面の入力をそのまま持つ */
export interface DrugPriceHistoryDraftRow {
  price: string;
  /** 空欄は「開始日不明の版」 */
  effectiveFrom: string;
}

export interface DrugPriceHistoryEditIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  /** 画面で行を指せるように。行に紐づかない指摘では省略 */
  rowIndex?: number;
}

/** 訂正の影響を測る対象。調剤日は来局側にしか無いので呼び出し側で組んで渡す */
export interface DrugPriceHistoryEditTarget {
  itemId: string;
  visitId: string;
  patientName?: string;
  dispensingDate: string;
  claimStatus?: string;
  drugPriceOverride?: DrugPriceOverride;
}

export interface DrugPriceHistoryEditImpactRow {
  itemId: string;
  visitId: string;
  patientName?: string;
  dispensingDate: string;
  claimStatus?: string;
  beforePrice?: number;
  afterPrice?: number;
  /** 提出済みのレセプトに含まれる調剤か */
  isSubmitted: boolean;
}

export interface DrugPriceHistoryEditPlan {
  drugCode: string;
  drugName: string;
  before: DrugPriceRevision[];
  after: DrugPriceRevision[];
  /** 訂正後に保存する現在薬価 */
  beforeCurrentPrice?: number;
  afterCurrentPrice?: number;
  issues: DrugPriceHistoryEditIssue[];
  changed: boolean;
  canApply: boolean;
  impact: DrugPriceHistoryEditImpactRow[];
  submittedCount: number;
  summary: string;
}

/** 下書きが空欄だけの行か */
function isBlankRow(row: DrugPriceHistoryDraftRow): boolean {
  return String(row?.price ?? '').trim() === '' && String(row?.effectiveFrom ?? '').trim() === '';
}

/** 暦として成立する YYYY-MM-DD か。2026-02-30 のような日付を弾く */
function isCalendarDate(text: string): boolean {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!matched) return false;
  const [year, month, day] = matched.slice(1).map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day;
}

/** 保存済みの版を編集欄へ読み込む */
export function toDrugPriceHistoryDraft(history?: DrugPriceRevision[]): DrugPriceHistoryDraftRow[] {
  return (history || []).map((revision) => ({
    price: String(revision.price),
    effectiveFrom: revision.effectiveFrom ?? ''
  }));
}

export interface DrugPriceHistoryDraftParseResult {
  revisions: DrugPriceRevision[];
  issues: DrugPriceHistoryEditIssue[];
}

/**
 * 編集欄を版の並びに直す。
 *
 * 空欄だけの行は「入力していない」として読み飛ばす。並びは
 * 開始日不明の版が先頭、以降は適用開始日の昇順。
 */
export function parseDrugPriceHistoryDraft(
  rows: DrugPriceHistoryDraftRow[]
): DrugPriceHistoryDraftParseResult {
  const issues: DrugPriceHistoryEditIssue[] = [];
  const parsed: { revision: DrugPriceRevision; rowIndex: number }[] = [];

  (rows || []).forEach((row, rowIndex) => {
    if (isBlankRow(row)) return;

    const priceText = String(row?.price ?? '').trim();
    const price = priceText === '' ? Number.NaN : Number(priceText);
    if (!Number.isFinite(price) || price <= 0) {
      issues.push({
        severity: 'error',
        code: 'price_invalid',
        message: `${rowIndex + 1}行目: 薬価には 0 より大きい数値を入れてください。`,
        rowIndex
      });
      return;
    }

    const dateText = String(row?.effectiveFrom ?? '').trim();
    if (dateText !== '' && !isCalendarDate(dateText)) {
      issues.push({
        severity: 'error',
        code: 'date_invalid',
        message: `${rowIndex + 1}行目: 適用開始日は YYYY-MM-DD で入れてください（空欄は「開始日不明」）。`,
        rowIndex
      });
      return;
    }

    parsed.push({
      revision: dateText === '' ? { price } : { price, effectiveFrom: dateText },
      rowIndex
    });
  });

  const unknownStarts = parsed.filter((entry) => entry.revision.effectiveFrom === undefined);
  if (unknownStarts.length > 1) {
    issues.push({
      severity: 'error',
      code: 'unknown_start_duplicated',
      message: '開始日不明の版は1つまでです。2つあると、どちらが古いか決められません。',
      rowIndex: unknownStarts[1].rowIndex
    });
  }

  const seenDates = new Set<string>();
  for (const entry of parsed) {
    const date = entry.revision.effectiveFrom;
    if (date === undefined) continue;
    if (seenDates.has(date)) {
      issues.push({
        severity: 'error',
        code: 'date_duplicated',
        message: `${entry.rowIndex + 1}行目: 適用開始日 ${date} の版が2つあります。`,
        rowIndex: entry.rowIndex
      });
    }
    seenDates.add(date);
  }

  const revisions = [
    ...unknownStarts.slice(0, 1).map((entry) => entry.revision),
    ...parsed
      .filter((entry) => entry.revision.effectiveFrom !== undefined)
      .map((entry) => entry.revision)
      .sort((a, b) => (a.effectiveFrom as string).localeCompare(b.effectiveFrom as string))
  ];

  revisions.forEach((revision, index) => {
    const previous = revisions[index - 1];
    if (previous && previous.price === revision.price) {
      issues.push({
        severity: 'warning',
        code: 'price_unchanged',
        message: `${revision.price}円（${formatDrugPriceRevisionLabel(revision.effectiveFrom)}）は直前の版と薬価が同じです。版として意味がありません。`
      });
    }
  });

  if (revisions.length > 0 && revisions.every((revision) => revision.effectiveFrom === undefined)) {
    issues.push({
      severity: 'warning',
      code: 'no_dated_revision',
      message: '日付の付いた版が1つもありません。この状態ではどの調剤日でも同じ薬価になります。'
    });
  }

  return { revisions, issues };
}

/** 提出済みのレセプトに含まれるか。下書き以外はすべて提出済みとして扱う */
export function isSubmittedClaimStatus(status?: string): boolean {
  return Boolean(status) && status !== 'draft';
}

function sameRevisions(left: DrugPriceRevision[], right: DrugPriceRevision[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((revision, index) =>
    revision.price === right[index].price
    && revision.effectiveFrom === right[index].effectiveFrom);
}

export interface DrugPriceHistoryEditInput {
  drug: { code: string; name?: string; price?: number; priceHistory?: DrugPriceRevision[] };
  draft: DrugPriceHistoryDraftRow[];
  targets: DrugPriceHistoryEditTarget[];
}

/**
 * 訂正の計画を組む。
 *
 * 薬価が変わる調剤を数え、提出済みのレセプトに含まれるものを分けて出す。
 * 誤りが1つでもあれば適用させない。警告は適用を止めない（訂正そのものが
 * 「意味の無い版を消す」目的のこともあるため）。
 */
export function buildDrugPriceHistoryEditPlan(
  input: DrugPriceHistoryEditInput
): DrugPriceHistoryEditPlan {
  const { drug, draft, targets } = input;
  const before = (drug?.priceHistory || []).map((revision) => ({ ...revision }));
  const { revisions: after, issues } = parseDrugPriceHistoryDraft(draft);

  const beforeCurrentPrice = drug?.price;
  const afterCurrentPrice = latestDatedDrugPrice(after) ?? drug?.price;

  const impact: DrugPriceHistoryEditImpactRow[] = [];
  for (const target of targets || []) {
    const beforeResolution = resolveDrugPriceWithOverride(
      { price: beforeCurrentPrice, priceHistory: before },
      target.dispensingDate,
      target.drugPriceOverride
    );
    const afterResolution = resolveDrugPriceWithOverride(
      { price: afterCurrentPrice, priceHistory: after },
      target.dispensingDate,
      target.drugPriceOverride
    );
    if (beforeResolution.price === afterResolution.price) continue;

    impact.push({
      itemId: target.itemId,
      visitId: target.visitId,
      patientName: target.patientName,
      dispensingDate: target.dispensingDate,
      claimStatus: target.claimStatus,
      beforePrice: beforeResolution.price,
      afterPrice: afterResolution.price,
      isSubmitted: isSubmittedClaimStatus(target.claimStatus)
    });
  }
  const submittedCount = impact.filter((row) => row.isSubmitted).length;

  if (submittedCount > 0) {
    issues.push({
      severity: 'warning',
      code: 'submitted_claim_affected',
      message: `提出済みのレセプトに含まれる調剤 ${submittedCount}件の薬価が変わります。返戻・再請求の要否を確認してください。`
    });
  }

  // 選び直した版が消えても、上書きは適用した額を持っているので点数は動かない。
  // ただし存在しない版を指したままになるので、画面に出す。
  const orphanedOverrides = (targets || []).filter((target) => {
    const override = target.drugPriceOverride;
    if (!override) return false;
    return !after.some((revision) => revision.effectiveFrom === (override.effectiveFrom ?? undefined));
  }).length;
  if (orphanedOverrides > 0) {
    issues.push({
      severity: 'warning',
      code: 'override_orphaned',
      message: `${orphanedOverrides}件の明細が、訂正後に存在しない版を選んだままになります（適用した薬価は変わりません）。`
    });
  }

  const changed = !sameRevisions(before, after) || beforeCurrentPrice !== afterCurrentPrice;
  const hasError = issues.some((issue) => issue.severity === 'error');

  return {
    drugCode: drug?.code ?? '',
    drugName: drug?.name ?? '',
    before,
    after,
    beforeCurrentPrice,
    afterCurrentPrice,
    issues,
    changed,
    canApply: !hasError && changed,
    impact,
    submittedCount,
    summary: `版 ${before.length}件 → ${after.length}件 / 薬価が変わる調剤 ${impact.length}件（うち提出済み ${submittedCount}件）`
  };
}

function formatRevisionList(revisions: DrugPriceRevision[]): string {
  if (revisions.length === 0) return 'なし';
  return revisions
    .map((revision) => `${revision.price}円（${formatDrugPriceRevisionLabel(revision.effectiveFrom)}）`)
    .join(' / ');
}

/** 画面と監査ログで同じ文言を使う */
export function buildDrugPriceHistoryEditAuditDetail(plan: DrugPriceHistoryEditPlan): string {
  return [
    `薬価の版の訂正: 薬品「${plan.drugName}」(${plan.drugCode})`,
    `訂正前: ${formatRevisionList(plan.before)}`,
    `訂正後: ${formatRevisionList(plan.after)}`,
    `現在薬価: ${plan.beforeCurrentPrice ?? '不明'}円 → ${plan.afterCurrentPrice ?? '不明'}円`,
    plan.summary
  ].join(' / ');
}
