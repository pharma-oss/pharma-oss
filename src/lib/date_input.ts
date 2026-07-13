// 生年月日など、日付を YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD / YYYYMMDD(8桁連続)の
// いずれで入力しても YYYY-MM-DD へそろえるための共通ユーティリティ。
// カレンダー上に実在する日付かどうかをUTC往復変換で検証し、2月30日のような
// 見た目だけ整った不正な日付は undefined を返す。
export function parseFlexibleDateInput(value?: string): string | undefined {
  const text = String(value || '').trim();
  if (!text) return undefined;
  const withDashes = text.replace(/[/.年月]/g, '-').replace(/日/g, '');
  let match = withDashes.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match && /^\d{8}$/.test(text)) {
    match = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  }
  if (!match) return undefined;
  const [, year, month, day] = match;
  const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) return undefined;
  return normalized;
}
