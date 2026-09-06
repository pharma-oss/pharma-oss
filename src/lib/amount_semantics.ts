// 印字用の数量セマンティクス判定。剤形判定は算定側と同じ resolveDosageCategory を使う。
// 「1日量か全量か」の軸のみがここの責務で、算定上の剤形区分そのものは dosage_category.ts が正本。

import type { PrescriptionItem } from '@/db/types';
import { resolveDosageCategory } from './dosage_category.ts';

export type AmountSemanticsItem = Partial<Pick<
  PrescriptionItem,
  'amount' | 'days' | 'usage' | 'dosageCategory' | 'dosageCategorySource' | 'dispensedDrug'
>> & {
  drugName?: string;
};

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

  const cat = resolveDosageCategory(item);
  if (
    cat === 'external' ||
    cat === 'injection' ||
    cat === 'as_needed' ||
    cat === 'internal_drop'
  ) {
    return false;
  }

  return true;
}
