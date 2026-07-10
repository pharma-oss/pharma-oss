export interface ReceiptRemarkCode {
  code: string;
  label: string;
  category: string;
}

export const COMMON_RECEIPT_REMARKS: ReceiptRemarkCode[] = [
  { code: '820100411', label: '嚥下困難', category: '一包化' },
  { code: '820100412', label: '認知症', category: '一包化' },
  { code: '820100413', label: 'その他', category: '一包化' },
  { code: '820100868', label: '自家製剤加算（嚥下困難）', category: '自家製剤' },
  { code: '820100826', label: '自家製剤加算（その他）', category: '自家製剤' },
  { code: '820100234', label: '保険医療機関への情報提供', category: '服薬情報等提供料' },
  { code: '820100650', label: '服薬情報等提供料の算定理由', category: '服薬情報等提供料' },
  { code: '820100344', label: '処方医の指示', category: '全般' },
  { code: '820100346', label: '併用禁忌・相互作用等', category: '重複投薬・相互作用等防止加算' },
  { code: '820100742', label: '残薬調整によるもの', category: '重複投薬・相互作用等防止加算' },
  { code: '820100150', label: '長期投薬（14日超）', category: '長期投薬' },
  { code: '820100311', label: '在宅患者訪問薬剤管理指導', category: '在宅' }
];
