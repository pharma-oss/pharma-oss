// HTML 文字列から、特定の属性を持つ要素の開始タグを抽出・検証するためのテスト補助関数。
//
// ページ全体に対する html.includes('disabled=""') は、無関係な要素が disabled を持っていても
// 通ってしまう（空虚なアサーション）。
// 本モジュールは、<style> を除外したうえで、対象要素の開始タグのうち disabled="" や
// data-disabled="true" を持つものを抽出し、権限あり・なしでの個数や属性の厳密な固定を支援する。

export function stripStyleBlocks(html: string): string {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

const FORM_CONTROL_TAGS_PATTERN = /<(?:button|input|select|textarea)\b[^>]*>/gi;
const ANY_TAG_PATTERN = /<[a-zA-Z0-9:-]+\b[^>]*>/g;

export function listDisabledOpeningTags(html: string): string[] {
  const stripped = stripStyleBlocks(html);
  const matches = stripped.match(FORM_CONTROL_TAGS_PATTERN) || [];
  return matches.filter((tag) => /\sdisabled=""(?=[\s/>]|$)/.test(tag));
}

export function listDataDisabledOpeningTags(html: string): string[] {
  const stripped = stripStyleBlocks(html);
  const matches = stripped.match(ANY_TAG_PATTERN) || [];
  return matches.filter((tag) => /\sdata-disabled="true"(?=[\s/>]|$)/.test(tag));
}
