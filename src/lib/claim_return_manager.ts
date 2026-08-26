export interface ClaimReturnReason {
  code: string;
  category: 'insurance' | 'public_insurance' | 'calculation' | 'prescription' | 'other';
  title: string;
  description: string;
  suggestedAction: string;
  recommendedMemo: string;
  /** オンライン請求受付結果など、外部の自由記述からこの理由へ寄せるための語 */
  matchKeywords: string[];
}

export const OFFICIAL_CLAIM_RETURN_REASONS: ClaimReturnReason[] = [
  {
    code: 'R01',
    category: 'insurance',
    title: '保険資格失効・変更',
    description: '調剤日時点で資格が失効しているか、保険者番号が変更されています。',
    suggestedAction: '患者のマイナ保険証または資格確認書で調剤当日の資格を再確認し、保険者番号・記号番号を更新してください。',
    recommendedMemo: '調剤当日保険資格再確認済。最新保険者番号に修正して再請求。',
    matchKeywords: ['資格', '失効', '保険者番号', '保険証', '喪失']
  },
  {
    code: 'R02',
    category: 'insurance',
    title: '被保険者記号・番号誤り',
    description: '記号・番号の桁数や英数字の誤入力、または枝番の未入力です。',
    suggestedAction: '券面記号番号と枝番（2桁）を突合し、誤字・脱字を修正してください。',
    recommendedMemo: '記号番号・枝番の誤記を修正。',
    matchKeywords: ['記号', '枝番', '被保険者番号', '被保険者記号']
  },
  {
    code: 'R03',
    category: 'public_insurance',
    title: '公費負担者・受給者番号不一致',
    description: '公費負担者番号（8桁）または受給者番号（7桁）が適用資格と一致しません。',
    suggestedAction: '公費受給者証の有効期限・適用区分・単独/併用区分を確認し、番号を修正してください。',
    recommendedMemo: '公費受給者証確認済。負担者・受給者番号を修正。',
    matchKeywords: ['公費', '受給者', '負担者番号']
  },
  {
    code: 'R04',
    category: 'calculation',
    title: '調剤報酬算定要件不備',
    description: '特定薬剤管理指導加算、外来服薬支援料、自家製剤加算等の要件記載が不足しています。',
    suggestedAction: '薬歴の構造化チェック・摘要欄コメントに必要な要件理由が記載されているか確認してください。',
    recommendedMemo: '算定要件（薬歴指導内容・摘要理由）を補記のうえ再算定。',
    matchKeywords: ['算定', '要件', '加算', '指導料', '管理料', '点数']
  },
  {
    code: 'R05',
    category: 'prescription',
    title: '処方箋指示と請求内容不一致',
    description: '医薬品コード、数量、用法、または一般名処方加算のコードが処方原本と異なります。',
    suggestedAction: '処方原本の薬品名・分量・用法コードおよび変更不可署名の有無を再点検してください。',
    recommendedMemo: '処方原本と突合確認。調剤薬品・用法コードを修正。',
    matchKeywords: ['処方', '用法', '医薬品コード', '数量', '分量', '一般名']
  },
  {
    code: 'R99',
    category: 'other',
    title: 'その他（審査機関照会）',
    description: '審査支払機関からの個別の照会事項または重複請求等です。',
    suggestedAction: '審査結果通知書の理由詳細を確認し、必要に応じて摘要欄に状況を記載してください。',
    recommendedMemo: '審査結果通知に基づき確認・修正。',
    matchKeywords: []
  }
];

export const DEFAULT_CLAIM_RETURN_REASON_CODE = 'R99';

// 語の包含関係があるので、判定順を固定する。
// 「公費負担者番号」は「負担者番号」より先に、
// 「被保険者番号」は「保険者番号」より先に判定しないと取り違える。
const CLAIM_RETURN_REASON_MATCH_ORDER = ['R03', 'R02', 'R01', 'R05', 'R04'] as const;

export function getClaimReturnReasonByCode(code: string): ClaimReturnReason | undefined {
  return OFFICIAL_CLAIM_RETURN_REASONS.find((reason) => reason.code === code);
}

/**
 * オンライン請求受付結果など、外部から来る自由記述の返戻事由を返戻理由コードへ寄せる。
 * どれにも当たらなければ R99（その他）。取り違えるより「その他」に落とす。
 */
export function inferClaimReturnReasonCode(text?: string): string {
  const normalized = String(text || '').trim();
  if (!normalized) return DEFAULT_CLAIM_RETURN_REASON_CODE;

  for (const code of CLAIM_RETURN_REASON_MATCH_ORDER) {
    const reason = getClaimReturnReasonByCode(code);
    if (reason?.matchKeywords.some((keyword) => normalized.includes(keyword))) {
      return code;
    }
  }
  return DEFAULT_CLAIM_RETURN_REASON_CODE;
}

/** 「R01 保険資格失効・変更」の形。画面と監査ログで同じ見出しを使う。 */
export function formatClaimReturnReasonLabel(code: string): string {
  const reason = getClaimReturnReasonByCode(code);
  return reason ? `${reason.code} ${reason.title}` : code;
}

export function buildReturnCorrectionSummary({
  reasonCode,
  customNote,
  operatorName
}: {
  reasonCode: string;
  customNote?: string;
  operatorName: string;
}): {
  reason: ClaimReturnReason;
  formattedMemo: string;
  auditDetails: string;
} {
  const reason = getClaimReturnReasonByCode(reasonCode) || OFFICIAL_CLAIM_RETURN_REASONS[OFFICIAL_CLAIM_RETURN_REASONS.length - 1];
  const notePart = customNote ? ` / メモ: ${customNote}` : '';
  const formattedMemo = `【返戻修正 [${reason.code}: ${reason.title}]】${reason.recommendedMemo}${notePart}`;
  const auditDetails = `レセプト返戻処理: [${reason.code}] ${reason.title} (対応者: ${operatorName}${notePart})`;

  return {
    reason,
    formattedMemo,
    auditDetails
  };
}
