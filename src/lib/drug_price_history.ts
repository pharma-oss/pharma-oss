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
  /** 薬剤師が版を選び直した */
  | 'override'
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
  /** source が 'override' のとき、上書きしなければこうなっていたという解決結果 */
  autoResolved?: DrugPriceResolution;
}

/** 処方薬ごとに薬剤師が選び直した薬価の版 */
export interface DrugPriceOverride {
  /** 選んだ版の適用開始日 */
  effectiveFrom: string;
  /** 選んだ版の薬価。履歴が後から訂正されても、適用した額が分かるように持つ */
  price: number;
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
 * - 直後の版が同じ薬価なら、その版を畳んで追加する版に含める
 *   （遡り取込で「実はもっと前から同じ薬価だった」と分かる場合）
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
  const before = current.filter((item) => item.effectiveFrom < effectiveFrom);
  const after = current.filter((item) => item.effectiveFrom > effectiveFrom);

  const priceBefore = before[before.length - 1];
  if (priceBefore && priceBefore.price === revision.price) {
    return current;
  }

  // 直後の版が同じ薬価なら、薬価が変わっていない版になるので畳む。
  // 残すと選択 UI に同額の版が並び、どちらを選んでも同じという状態になる。
  const kept = after[0] && after[0].price === revision.price ? after.slice(1) : after;

  return [...before, { price: revision.price, effectiveFrom }, ...kept];
}

/**
 * マスター取込で薬価が変わったかどうか。
 * 変わっていないなら履歴を触らない。
 *
 * 比較できるのは「その日の薬価として記録されている値」だけ。
 * 'unknown'（薬価が分からない）と 'earliest_known'（履歴より前の日付なので
 * 最古版で代用した推定値）は記録ではないので、一致しても
 * 「変わっていない」の根拠にならない。遡り取込ではこちらに入る。
 */
export function isDrugPriceRevisionNeeded(
  drug: DrugPriceSource,
  nextPrice: number | undefined,
  effectiveFrom: string
): boolean {
  if (!Number.isFinite(nextPrice as number)) return false;
  const resolved = resolveDrugPrice(drug, effectiveFrom);
  if (resolved.source === 'unknown' || resolved.source === 'earliest_known') return true;
  return resolved.price !== nextPrice;
}

/**
 * 薬価の版の選択肢。調剤日時点で自動解決される版には isAutoSelected を立てる。
 * 画面の選択 UI と、選び直したときの警告表示に使う。
 */
export interface DrugPriceRevisionChoice {
  effectiveFrom: string;
  price: number;
  isAutoSelected: boolean;
}

export function listDrugPriceRevisionChoices(
  drug: DrugPriceSource,
  dispensingDate: string
): DrugPriceRevisionChoice[] {
  const history = sortedHistory(drug?.priceHistory);
  if (history.length === 0) return [];
  const auto = resolveDrugPrice(drug, dispensingDate);
  return history
    .map((revision) => ({
      effectiveFrom: revision.effectiveFrom,
      price: revision.price,
      isAutoSelected: auto.effectiveFrom === revision.effectiveFrom
    }))
    .reverse();
}

/**
 * 薬剤師が選び直した版があればそれを使い、無ければ調剤日で解決する。
 *
 * 選び直した版が調剤日時点の版と同じなら、上書きとしては扱わない
 * (同じ結論に警告を出しても意味がない)。
 */
export function resolveDrugPriceWithOverride(
  drug: DrugPriceSource,
  dispensingDate: string,
  override?: DrugPriceOverride | null
): DrugPriceResolution {
  const auto = resolveDrugPrice(drug, dispensingDate);
  const effectiveFrom = toDateOnly(override?.effectiveFrom || '');
  if (!override || !effectiveFrom || !Number.isFinite(override.price)) {
    return auto;
  }
  if (auto.effectiveFrom === effectiveFrom && auto.price === override.price) {
    return auto;
  }
  return {
    price: override.price,
    source: 'override',
    effectiveFrom,
    autoResolved: auto
  };
}

/** 調剤日時点の版と違う版が選ばれているか */
export function isDrugPriceOverridden(resolution: DrugPriceResolution): boolean {
  return resolution.source === 'override';
}

/** 画面と監査ログで同じ文言を使う */
export function formatDrugPriceOverrideWarning(
  resolution: DrugPriceResolution,
  dispensingDate: string
): string {
  if (resolution.source !== 'override') return '';
  const auto = resolution.autoResolved;
  const autoPart = auto?.price === undefined
    ? '調剤日時点の薬価が特定できません'
    : `調剤日時点は ${auto.price}円（適用 ${auto.effectiveFrom || '不明'}）`;
  return `調剤日 ${toDateOnly(dispensingDate) || '不明'} と異なる薬価の版を適用しています: ${resolution.price}円（適用 ${resolution.effectiveFrom}） / ${autoPart}`;
}
