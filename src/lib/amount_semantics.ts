// 印字専用。calculator.ts の isInternalMedicine とは判定軸が異なります。
// テープ剤 days > 0 などの既知の乖離があり、算定側（calculator.ts）の剤形判定見直しは別宿題として扱います。

import type { PrescriptionItem } from '@/db/types';

export type AmountSemanticsItem = Partial<Pick<
  PrescriptionItem,
  'amount' | 'days' | 'usage' | 'dosageCategory'
>>;

/**
 * 印字用数量セマンティクス判定器
 * - true: 1日量（内服で正の日数 days > 0 が設定されている）
 * - false: 全量（外用・頓服・注射・内滴、または days <= 0 の総量入力）
 *   ※ days <= 0 はシステム規約通り「総量（全量）」として扱う（calculator.ts:575 と一致）
 */
export function isDailyAmountItem(item: AmountSemanticsItem): boolean {
  const days = typeof item.days === 'number' ? item.days : 0;
  if (days <= 0) return false;

  const usage = String(item.usage || '');
  if (
    usage.includes('頓服') ||
    usage.includes('内滴') ||
    usage.includes('内用滴剤') ||
    usage.includes('注射')
  ) {
    return false;
  }

  const cat = item.dosageCategory;
  if (
    cat === 'external' ||
    cat === 'injection' ||
    cat === 'as_needed' ||
    cat === 'internal_drop'
  ) {
    return false;
  }

  if (/外用|貼付|塗布|点眼|点鼻|点耳|吸入|坐剤|注入/.test(usage)) {
    return false;
  }

  return true;
}
