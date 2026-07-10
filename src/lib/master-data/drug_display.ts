export function formatDrugDisplayName(value: string | undefined | null): string {
  if (!value) return '';

  return String(value)
    .replace(/^\s*(?:薬品名|商品名|成分名?|一般名)\s*[:：]\s*/u, '')
    .replace(/\s*[（(]\s*(?:成分名?|一般名)\s*[:：][^）)]*[）)]\s*/gu, '')
    .replace(/\s+(?:成分名?|一般名)\s*[:：]\s*/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
