// 薬価改定をまたぐ調剤の点数計算のための、薬価の版管理。
//
// 薬価は改定告示で切り替わり、レセプトは「調剤日時点の薬価」で計算する。
// マスターの現在薬価だけを持っていると、改定後にマスターを取り込んだ時点で
// 過去の調剤分まで新薬価で再計算されてしまう（請求時点スナップショット差分にも
// 「点数だけが変わっている」として現れる）。
//
// ここでは薬価を「適用開始日つきの版」で保持し、調剤日で引けるようにする。

export interface DrugPriceRevision {
  price: number;
  /** この薬価が適用される最初の日 (YYYY-MM-DD)。改定日当日から新薬価になる */
  effectiveFrom: string;
}

export interface DrugPriceSource {
  price?: number;
  priceHistory?: DrugPriceRevision[];
}

export type DrugPriceResolutionSource =
  /** 調剤日に適用される版が履歴にあった */
  | 'history'
  /** 履歴が無いので現在薬価を使った（改定前から使っている薬品） */
  | 'current'
  /** 調剤日が履歴の最初の版より前。最も古い既知の薬価で代用している */
  | 'earliest_known'
  /** 薬価が分からない */
  | 'unknown';

export interface DrugPriceResolution {
  price?: number;
  source: DrugPriceResolutionSource;
  effectiveFrom?: string;
}

function toDateOnly(value: string): string {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  // 店舗ローカル(JST)で日付を決める。UTC へ寄せると改定日当日がずれる。
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sortedHistory(history?: DrugPriceRevision[]): DrugPriceRevision[] {
  return [...(history || [])]
    .filter((revision) => Number.isFinite(revision?.price) && toDateOnly(revision?.effectiveFrom) !== '')
    .map((revision) => ({ price: revision.price, effectiveFrom: toDateOnly(revision.effectiveFrom) }))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/**
 * 調剤日時点で適用される薬価を返す。
 * 「分からない」と「現在薬価で代用した」を区別できるよう、根拠も返す。
 */
export function resolveDrugPrice(drug: DrugPriceSource, dispensingDate: string): DrugPriceResolution {
  const history = sortedHistory(drug?.priceHistory);
  const date = toDateOnly(dispensingDate);

  if (history.length === 0) {
    return Number.isFinite(drug?.price as number)
      ? { price: drug.price, source: 'current' }
      : { source: 'unknown' };
  }

  if (!date) {
    // 調剤日が読み取れないときに最新版を当てると、改定後に過去分が動く。
    return { source: 'unknown' };
  }

  // 改定日当日から新薬価なので、effectiveFrom <= 調剤日 の最後の版を採る
  let applicable: DrugPriceRevision | undefined;
  for (const revision of history) {
    if (revision.effectiveFrom <= date) {
      applicable = revision;
    } else {
      break;
    }
  }

  if (applicable) {
    return { price: applicable.price, source: 'history', effectiveFrom: applicable.effectiveFrom };
  }

  // 調剤日が最初の版より前。最も古い既知の薬価で代用するが、根拠は残す。
  const earliest = history[0];
  return { price: earliest.price, source: 'earliest_known', effectiveFrom: earliest.effectiveFrom };
}

/** 数値だけ欲しい呼び出し向け。分からない場合は undefined */
export function resolveDrugPriceOn(drug: DrugPriceSource, dispensingDate: string): number | undefined {
  return resolveDrugPrice(drug, dispensingDate).price;
}

/**
 * 薬価の版を追加する。
 *
 * - 同じ適用開始日の版が既にあれば置き換える（取り込み直し）
 * - 直前の版と同じ薬価なら追加しない（マスターの再取込で履歴が膨らむのを防ぐ）
 * - 並びは適用開始日の昇順で保つ
 */
export function appendDrugPriceRevision(
  history: DrugPriceRevision[] | undefined,
  revision: DrugPriceRevision
): DrugPriceRevision[] {
  const effectiveFrom = toDateOnly(revision?.effectiveFrom);
  if (!effectiveFrom || !Number.isFinite(revision?.price)) {
    return sortedHistory(history);
  }

  const current = sortedHistory(history).filter((item) => item.effectiveFrom !== effectiveFrom);
  const priceBefore = [...current]
    .filter((item) => item.effectiveFrom < effectiveFrom)
    .pop();
  if (priceBefore && priceBefore.price === revision.price) {
    return current;
  }

  return [...current, { price: revision.price, effectiveFrom }]
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/**
 * マスター取込で薬価が変わったかどうか。
 * 変わっていないなら履歴を触らない。
 */
export function isDrugPriceRevisionNeeded(
  drug: DrugPriceSource,
  nextPrice: number | undefined,
  effectiveFrom: string
): boolean {
  if (!Number.isFinite(nextPrice as number)) return false;
  const resolved = resolveDrugPrice(drug, effectiveFrom);
  if (resolved.source === 'unknown') return true;
  return resolved.price !== nextPrice;
}
