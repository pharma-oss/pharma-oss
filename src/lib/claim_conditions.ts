import type { PharmacyBusinessHours } from '@/db/types';
import type { FeeCode, OfficialFeeCodeOverrideKey } from './calculator.ts';
import { toLocalDateKey } from './local_date.ts';

// 来局ごとに金額を変える「算定の条件」。領収証の横で切り替えると、同じ計算関数
// (calculateDispensingFees) が条件つきで再計算するので、画面・領収証・明細書・UKE が
// 同じ金額になる。条件は visit.claimOptions に保存する。

/** お薬手帳。未設定は「持参あり」(これまでの 45点算定と同じ)。 */
export type MedicationNotebookCondition = 'carried' | 'not_carried';
/** 時間外・休日・深夜。未設定は通常 (加算なし)。 */
export type AfterHoursCategory = 'none' | 'after_hours' | 'holiday' | 'late_night';
/** 特定薬剤管理指導加算 (トッカン) を来局単位で決める。未設定は処方明細ごとの設定を使う。 */
export type TokkanOverride = 'none' | '1' | '3_i';

export interface ClaimConditionOptions {
  medicationNotebook?: MedicationNotebookCondition;
  afterHoursCategory?: AfterHoursCategory;
  tokkanOverride?: TokkanOverride;
}

export const MEDICATION_NOTEBOOK_LABELS: Record<MedicationNotebookCondition, string> = {
  carried: 'お薬手帳あり',
  not_carried: 'お薬手帳なし'
};

export const AFTER_HOURS_CATEGORY_LABELS: Record<AfterHoursCategory, string> = {
  none: '通常',
  after_hours: '時間外',
  holiday: '休日',
  late_night: '深夜'
};

export const TOKKAN_OVERRIDE_LABELS: Record<TokkanOverride, string> = {
  none: 'なし',
  '1': '特定薬剤管理指導加算1',
  '3_i': '特定薬剤管理指導加算3(イ)'
};

export function resolveMedicationNotebook(options?: ClaimConditionOptions): MedicationNotebookCondition {
  return options?.medicationNotebook === 'not_carried' ? 'not_carried' : 'carried';
}

export function resolveAfterHoursCategory(options?: ClaimConditionOptions): AfterHoursCategory {
  const value = options?.afterHoursCategory;
  return value === 'after_hours' || value === 'holiday' || value === 'late_night' ? value : 'none';
}

/** 来局単位の指定が無いとき (処方明細ごとの設定を使うとき) は undefined。 */
export function resolveTokkanOverride(options?: ClaimConditionOptions): TokkanOverride | undefined {
  const value = options?.tokkanOverride;
  return value === 'none' || value === '1' || value === '3_i' ? value : undefined;
}

// ---------------------------------------------------------------------------
// 点数表 (差し替え用)
//
// 値が null のものは「点数未設定」。計算は金額を出さず、画面・領収証に「点数未設定」と出して
// 印刷と請求を止める。令和8年6月施行の点数表で確認した値を、ここに入れるだけで有効になる。
// 推測では入れないこと。
// ---------------------------------------------------------------------------

export interface MedicationGuidanceFeeSpec {
  name: string;
  /** null = 点数未設定 */
  points: number | null;
  /** 結果に付ける feeKey。無ければ付けない */
  feeKey?: string;
  /** 公式算定コード (9桁) を施設設定の officialFeeCodeOverrides から引くときのキー */
  overrideKey: OfficialFeeCodeOverrideKey;
  rationale: string;
}

export type AfterHoursFeeCategory = Exclude<AfterHoursCategory, 'none'>;

export interface AfterHoursFeeSpec {
  name: string;
  /** 基礎額に対する割合 (%)。null = 未設定 */
  ratePercent: number | null;
  feeKey: string;
  overrideKey: OfficialFeeCodeOverrideKey;
  rationale: string;
}

export type AfterHoursRounding = 'round' | 'floor' | 'ceil';

export interface ConditionFeeTable {
  medicationGuidance: Record<MedicationNotebookCondition, MedicationGuidanceFeeSpec>;
  afterHours: {
    categories: Record<AfterHoursFeeCategory, AfterHoursFeeSpec>;
    /** 基礎額に含める算定項目。null = 未設定 (割合が入っていても点数は出さない) */
    baseFeeCodes: readonly FeeCode[] | null;
    /** 基礎額×割合の端数処理。公式の取り扱いは要確認 (暫定で四捨五入) */
    rounding: AfterHoursRounding;
    /**
     * 自動判定で複数の区分に当てはまるときの優先順位 (先頭が最優先)。
     * ここに無い区分は自動判定で選ばれない。公式の取り扱いが確認できたら、この並びを差し替える。
     */
    priority: readonly AfterHoursFeeCategory[];
  };
}

export const DEFAULT_CONDITION_FEE_TABLE: ConditionFeeTable = {
  medicationGuidance: {
    carried: {
      name: '服薬管理指導料1',
      points: 45,
      overrideKey: 'medication_guidance_1',
      rationale: '患者の服薬状況や副作用等を確認し、必要な薬学的管理と服薬指導を行ったため'
    },
    not_carried: {
      name: '服薬管理指導料(お薬手帳なし)',
      points: null,
      feeKey: 'medication_guidance_no_notebook',
      overrideKey: 'medication_guidance_no_notebook',
      rationale: 'お薬手帳を持参していない患者に、必要な薬学的管理と服薬指導を行ったため'
    }
  },
  afterHours: {
    categories: {
      after_hours: {
        name: '時間外加算',
        ratePercent: null,
        feeKey: 'after_hours_addition',
        overrideKey: 'after_hours_addition',
        rationale: '保険薬局が表示する開局時間外に調剤を行ったため'
      },
      holiday: {
        name: '休日加算',
        ratePercent: null,
        feeKey: 'holiday_addition',
        overrideKey: 'holiday_addition',
        rationale: '休日に調剤を行ったため'
      },
      late_night: {
        name: '深夜加算',
        ratePercent: null,
        feeKey: 'late_night_addition',
        overrideKey: 'late_night_addition',
        rationale: '深夜に調剤を行ったため'
      }
    },
    baseFeeCodes: null,
    rounding: 'round',
    // 暫定: 深夜 > 休日 > 時間外 (正式なルールは点数表と一緒に確認して差し替える)
    priority: ['late_night', 'holiday', 'after_hours']
  }
};

export type AfterHoursPointsResult =
  | { status: 'set'; points: number; baseAmount: number; ratePercent: number }
  | { status: 'unset'; missing: Array<'rate' | 'base_fee_codes'> };

function applyRounding(value: number, rounding: AfterHoursRounding): number {
  // 0.1 や 0.2 のような割合の浮動小数点誤差で .5 の境目が動かないよう、少し丸めてから端数を処理する
  const stable = Math.round(value * 1e6) / 1e6;
  if (rounding === 'floor') return Math.floor(stable);
  if (rounding === 'ceil') return Math.ceil(stable);
  return Math.round(stable);
}

/**
 * 時間外・休日・深夜の加算点数 = 基礎額 × 割合。基礎額は表で指定した算定項目の合計。
 * 割合か基礎額の項目が未設定のときは unset を返し、点数を作らない。
 */
export function calculateAfterHoursPoints(params: {
  category: AfterHoursFeeCategory;
  fees: ReadonlyArray<{ code?: FeeCode; points: number }>;
  table?: ConditionFeeTable;
}): AfterHoursPointsResult {
  const table = params.table ?? DEFAULT_CONDITION_FEE_TABLE;
  const spec = table.afterHours.categories[params.category];
  const baseFeeCodes = table.afterHours.baseFeeCodes;
  const missing: Array<'rate' | 'base_fee_codes'> = [];
  if (spec.ratePercent === null) missing.push('rate');
  if (baseFeeCodes === null) missing.push('base_fee_codes');
  if (missing.length > 0 || spec.ratePercent === null || baseFeeCodes === null) {
    return { status: 'unset', missing };
  }
  let baseAmount = 0;
  for (const fee of params.fees) {
    if (fee.code && baseFeeCodes.includes(fee.code)) baseAmount += fee.points;
  }
  return {
    status: 'set',
    points: applyRounding((baseAmount * spec.ratePercent) / 100, table.afterHours.rounding),
    baseAmount,
    ratePercent: spec.ratePercent
  };
}

// ---------------------------------------------------------------------------
// 時間外・休日・深夜の自動判定 (受付時刻と施設設定の開局時間から)
// ---------------------------------------------------------------------------

export type AfterHoursJudgement =
  | { status: 'judged'; category: AfterHoursCategory; reason: string }
  | { status: 'unavailable'; reason: 'no_reception_time' | 'hours_unconfigured'; message: string };

function parseClockMinutes(value: string | undefined): number | null {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) return null;
  return hours * 60 + minutes;
}

function isInsideRange(minutes: number, start: number, end: number): boolean {
  // 22:00〜06:00 のように日付をまたぐ範囲も扱う
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/**
 * 受付時刻から時間外・休日・深夜を判定する。当てはまる区分が複数あるときは priority の先頭を選ぶ
 * (既定は点数表の afterHours.priority = 深夜 > 休日 > 時間外)。どれにも当てはまらなければ通常。
 * 時刻と暦日は端末のタイムゾーン (薬局では日本時間) で見る。UTC の日付を切り出さない。
 * 開局時間が未設定のときは判定せず、unavailable を返す (通常扱いにはしない)。
 */
export function judgeAfterHoursCategory(
  receptionAt: string | undefined | null,
  hours: PharmacyBusinessHours | undefined | null,
  priority: readonly AfterHoursFeeCategory[] = DEFAULT_CONDITION_FEE_TABLE.afterHours.priority
): AfterHoursJudgement {
  const text = String(receptionAt ?? '').trim();
  const received = text ? new Date(text) : null;
  if (!received || Number.isNaN(received.getTime())) {
    return {
      status: 'unavailable',
      reason: 'no_reception_time',
      message: 'この受付には受付時刻が記録されていないため、自動判定できません。区分を手動で選んでください。'
    };
  }
  const weekdayRange = hours?.weekday;
  const saturdayRange = hours?.saturday;
  if (!hours || (!weekdayRange && !saturdayRange)) {
    return {
      status: 'unavailable',
      reason: 'hours_unconfigured',
      message: '開局時間が未設定のため自動判定できません。区分を手動で選んでください。'
    };
  }

  const minutes = received.getHours() * 60 + received.getMinutes();
  const weekday = received.getDay();
  const dateKey = toLocalDateKey(received);

  // 当てはまる区分と、その理由。どれを採るかは最後に priority で決める。
  const applicable = new Map<AfterHoursFeeCategory, string>();

  const lateStart = parseClockMinutes(hours.lateNightStart);
  const lateEnd = parseClockMinutes(hours.lateNightEnd);
  if (lateStart !== null && lateEnd !== null && isInsideRange(minutes, lateStart, lateEnd)) {
    applicable.set('late_night', `深夜の時間帯 (${hours.lateNightStart}〜${hours.lateNightEnd})`);
  }

  if (weekday === 0) {
    applicable.set('holiday', '日曜日');
  } else if ((hours.holidayDates || []).includes(dateKey)) {
    applicable.set('holiday', `登録された休日 (${dateKey})`);
  }

  // 日曜は開局時間を持たない (閉局扱い)。それ以外は曜日ごとの開局時間の外なら時間外。
  const range = weekday === 0 ? undefined : weekday === 6 ? saturdayRange : weekdayRange;
  const dayLabel = weekday === 0 ? '日曜' : weekday === 6 ? '土曜' : '平日';
  const open = parseClockMinutes(range?.open);
  const close = parseClockMinutes(range?.close);
  let insideHoursReason: string | null = null;
  if (open === null || close === null) {
    applicable.set('after_hours', `${dayLabel}は開局時間が登録されていない (閉局日)`);
  } else if (minutes < open || minutes >= close) {
    applicable.set('after_hours', `${dayLabel}の開局時間 ${range?.open}〜${range?.close} の外`);
  } else {
    insideHoursReason = `${dayLabel}の開局時間 ${range?.open}〜${range?.close} の内`;
  }

  for (const category of priority) {
    const reason = applicable.get(category);
    if (reason !== undefined) return { status: 'judged', category, reason };
  }
  return {
    status: 'judged',
    category: 'none',
    reason: insideHoursReason ?? '深夜・休日・時間外のいずれにも当てはまらない'
  };
}

/**
 * 受付時に visit へ入れる claimOptions。自動判定が時間外・休日・深夜になったときだけ区分を入れる。
 * 通常と判定された受付、判定できなかった受付 (受付時刻・開局時間なし) では何も入れず、
 * これまでの受付と同じ (claimOptions なし) にする。
 */
export function buildReceptionClaimOptions(
  judgement: AfterHoursJudgement
): { afterHoursCategory: AfterHoursCategory } | undefined {
  if (judgement.status !== 'judged' || judgement.category === 'none') return undefined;
  return { afterHoursCategory: judgement.category };
}

// ---------------------------------------------------------------------------
// 監査ログ用の文言
// ---------------------------------------------------------------------------

function describeTokkan(options: ClaimConditionOptions): string {
  const override = resolveTokkanOverride(options);
  return override === undefined ? '処方明細ごと' : TOKKAN_OVERRIDE_LABELS[override];
}

/**
 * 変わった条件だけを「項目 前 → 後」で並べる。変更が無ければ null。
 * 例: お薬手帳 お薬手帳あり → お薬手帳なし / 時間外等 通常 → 時間外
 */
export function buildClaimConditionChangeSummary(
  before: ClaimConditionOptions,
  after: ClaimConditionOptions
): string | null {
  const changes: string[] = [];
  const notebookBefore = resolveMedicationNotebook(before);
  const notebookAfter = resolveMedicationNotebook(after);
  if (notebookBefore !== notebookAfter) {
    changes.push(`お薬手帳 ${MEDICATION_NOTEBOOK_LABELS[notebookBefore]} → ${MEDICATION_NOTEBOOK_LABELS[notebookAfter]}`);
  }
  const afterHoursBefore = resolveAfterHoursCategory(before);
  const afterHoursAfter = resolveAfterHoursCategory(after);
  if (afterHoursBefore !== afterHoursAfter) {
    changes.push(`時間外等 ${AFTER_HOURS_CATEGORY_LABELS[afterHoursBefore]} → ${AFTER_HOURS_CATEGORY_LABELS[afterHoursAfter]}`);
  }
  if (resolveTokkanOverride(before) !== resolveTokkanOverride(after)) {
    changes.push(`特定薬剤管理指導加算 ${describeTokkan(before)} → ${describeTokkan(after)}`);
  }
  return changes.length > 0 ? changes.join(' / ') : null;
}

export function buildClaimConditionAuditDetail(
  before: ClaimConditionOptions,
  after: ClaimConditionOptions,
  amounts?: { before?: { totalPoints: number; copayYen: number }; after?: { totalPoints: number; copayYen: number } }
): string | null {
  const summary = buildClaimConditionChangeSummary(before, after);
  if (!summary) return null;
  const amountText = amounts?.before && amounts.after
    ? ` (${amounts.before.totalPoints}点・窓口負担¥${amounts.before.copayYen.toLocaleString('ja-JP')} → ${amounts.after.totalPoints}点・窓口負担¥${amounts.after.copayYen.toLocaleString('ja-JP')})`
    : '';
  return `算定条件変更: ${summary}${amountText}`;
}
