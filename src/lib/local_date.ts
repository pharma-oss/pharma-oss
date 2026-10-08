// 端末のタイムゾーン(薬局では日本時間)での暦日 YYYY-MM-DD。
//
// `date.toISOString().slice(0, 10)` はUTCの日付なので、日本時間の0時〜9時は前日になる。
// 「今日」を決める用途(使用期限の判定、入荷日・調剤日の既定値、ファイル名の日付など)には
// こちらを使う。UTCの日付が必要な往復検証(カレンダー上に実在する日付かの確認)は対象外。
export function toLocalDateKey(date: Date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 保存されている日付の値を、端末のタイムゾーンの暦日 YYYY-MM-DD にそろえる。
// 日付だけの文字列(YYYY-MM-DD)はそのまま、時刻つき(`new Date().toISOString()` で保存した受付日時など)は
// 端末のタイムゾーンへ直してから日付を取る。先頭10文字を切り出すとUTCの日付になり、日本時間の朝9時前に
// 受け付けた分が前日になる。読み取れない値は null。
export function toLocalDateKeyFromValue(value: string | undefined | null): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : toLocalDateKey(parsed);
}
