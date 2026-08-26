/**
 * CSV 数式インジェクション（CSV Formula Injection / DDE Injection）防止および
 * RFC 4180 準拠の CSV セル/行エスケープユーティリティ。
 *
 * Excel や Google Sheets 等の表計算ソフトで開いた際に、
 * セル先頭の `=`, `+`, `-`, `@`, `\t`, `\r` が数式やコマンドとして解釈される脆弱性を防ぎます。
 */

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }

  const str = String(value);

  // 数式インジェクション文字で始まる場合はシングルクォートを前置
  const formulaSafe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;

  // ダブルクォートを二重化して全体をダブルクォートで囲む
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

export function buildCsvRow(cells: readonly unknown[]): string {
  return cells.map(escapeCsvCell).join(',');
}

export function buildCsvDocument(rows: readonly (readonly unknown[])[]): string {
  return rows.map(buildCsvRow).join('\r\n');
}
