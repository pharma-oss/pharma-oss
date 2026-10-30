import type { BusinessHoursRange, PharmacyBusinessHours } from '@/db/types';

// 設定画面の「開局時間・休日」の入力欄と、保存する PharmacyBusinessHours の間の変換。
// 入力途中 (開局だけ入れて閉局がまだ、など) の文字を失わないよう、画面は文字列のままの
// 下書きを持ち、保存する値は完成した組だけから作る。

export interface BusinessHoursDraft {
  weekdayOpen: string;
  weekdayClose: string;
  saturdayOpen: string;
  saturdayClose: string;
  lateNightStart: string;
  lateNightEnd: string;
  /** 休日として扱う日付。1行に1つ (カンマ・空白区切りも可) */
  holidayDatesText: string;
}

export interface BusinessHoursIssue {
  field: keyof BusinessHoursDraft;
  message: string;
}

export const EMPTY_BUSINESS_HOURS_DRAFT: BusinessHoursDraft = {
  weekdayOpen: '',
  weekdayClose: '',
  saturdayOpen: '',
  saturdayClose: '',
  lateNightStart: '',
  lateNightEnd: '',
  holidayDatesText: ''
};

export function toBusinessHoursDraft(hours?: PharmacyBusinessHours | null): BusinessHoursDraft {
  return {
    weekdayOpen: hours?.weekday?.open ?? '',
    weekdayClose: hours?.weekday?.close ?? '',
    saturdayOpen: hours?.saturday?.open ?? '',
    saturdayClose: hours?.saturday?.close ?? '',
    lateNightStart: hours?.lateNightStart ?? '',
    lateNightEnd: hours?.lateNightEnd ?? '',
    holidayDatesText: (hours?.holidayDates ?? []).join('\n')
  };
}

function normalizeClock(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function clockMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function normalizeDate(value: string): string | null {
  const match = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // 2026-02-30 のような存在しない日付は、繰り上がって別の日になるので弾く
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseRange(
  label: string,
  openField: keyof BusinessHoursDraft,
  closeField: keyof BusinessHoursDraft,
  openText: string,
  closeText: string,
  issues: BusinessHoursIssue[]
): BusinessHoursRange | undefined {
  const hasOpen = openText.trim() !== '';
  const hasClose = closeText.trim() !== '';
  if (!hasOpen && !hasClose) return undefined;
  if (!hasOpen || !hasClose) {
    issues.push({
      field: hasOpen ? closeField : openField,
      message: `${label}は開局と閉局の両方を入れてください。片方だけでは保存されません。`
    });
    return undefined;
  }
  const open = normalizeClock(openText);
  const close = normalizeClock(closeText);
  if (!open) issues.push({ field: openField, message: `${label}の開局時間が正しくありません。` });
  if (!close) issues.push({ field: closeField, message: `${label}の閉局時間が正しくありません。` });
  if (!open || !close) return undefined;
  if (clockMinutes(open) >= clockMinutes(close)) {
    issues.push({ field: closeField, message: `${label}は閉局を開局より後にしてください（24時間営業・日付をまたぐ営業は未対応です）。` });
    return undefined;
  }
  return { open, close };
}

export function parseBusinessHoursDraft(draft: BusinessHoursDraft): {
  hours: PharmacyBusinessHours | undefined;
  issues: BusinessHoursIssue[];
} {
  const issues: BusinessHoursIssue[] = [];
  const weekday = parseRange('平日', 'weekdayOpen', 'weekdayClose', draft.weekdayOpen, draft.weekdayClose, issues);
  const saturday = parseRange('土曜', 'saturdayOpen', 'saturdayClose', draft.saturdayOpen, draft.saturdayClose, issues);

  let lateNightStart: string | undefined;
  let lateNightEnd: string | undefined;
  const hasStart = draft.lateNightStart.trim() !== '';
  const hasEnd = draft.lateNightEnd.trim() !== '';
  if (hasStart !== hasEnd) {
    issues.push({
      field: hasStart ? 'lateNightEnd' : 'lateNightStart',
      message: '深夜は開始と終了の両方を入れてください。片方だけでは保存されません。'
    });
  } else if (hasStart && hasEnd) {
    const start = normalizeClock(draft.lateNightStart);
    const end = normalizeClock(draft.lateNightEnd);
    if (!start) issues.push({ field: 'lateNightStart', message: '深夜の開始時間が正しくありません。' });
    if (!end) issues.push({ field: 'lateNightEnd', message: '深夜の終了時間が正しくありません。' });
    if (start && end) {
      if (start === end) {
        issues.push({ field: 'lateNightEnd', message: '深夜の開始と終了が同じです。' });
      } else {
        lateNightStart = start;
        lateNightEnd = end;
      }
    }
  }

  const holidayDates: string[] = [];
  for (const token of draft.holidayDatesText.split(/[\s,、]+/)) {
    if (!token) continue;
    const date = normalizeDate(token);
    if (!date) {
      issues.push({ field: 'holidayDatesText', message: `休日の日付「${token}」が正しくありません（例: 2026-12-29）。` });
      continue;
    }
    if (!holidayDates.includes(date)) holidayDates.push(date);
  }
  holidayDates.sort();

  const hours: PharmacyBusinessHours = {
    ...(weekday ? { weekday } : {}),
    ...(saturday ? { saturday } : {}),
    ...(holidayDates.length > 0 ? { holidayDates } : {}),
    ...(lateNightStart && lateNightEnd ? { lateNightStart, lateNightEnd } : {})
  };
  return { hours: Object.keys(hours).length > 0 ? hours : undefined, issues };
}
