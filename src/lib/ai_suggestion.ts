import type {
  PrescriptionInputAuditIssue,
  PrescriptionInputAuditResult,
  PrescriptionInputAuditSeverity
} from './prescription_input_audit.ts';

export type AiSuggestionSource = 'rule_based';
export type AiSuggestionDomain = 'prescription_audit' | 'claim_risk' | 'inventory_risk' | 'follow_up' | 'soap_draft';
export type AiSuggestionSeverity = 'critical' | 'warning' | 'info';
export type AiSuggestionDecision = 'accepted' | 'modified' | 'rejected';

export interface AiSuggestionEvidence {
  label: string;
  detail: string;
  source?: string;
  issueCode?: string;
}

export interface AiAssistSuggestion {
  suggestionId: string;
  domain: AiSuggestionDomain;
  source: AiSuggestionSource;
  severity: AiSuggestionSeverity;
  title: string;
  message: string;
  suggestedAction: string;
  confidence: number;
  evidence: AiSuggestionEvidence[];
  requiresHumanReview: true;
  guardrail: string;
  relatedItemIds?: string[];
  rpId?: string;
}

export interface AiSuggestionDecisionAuditInput {
  suggestion: AiAssistSuggestion;
  decision: AiSuggestionDecision;
  reviewerName: string;
  feedback?: string;
  modifiedAction?: string;
  decidedAt?: Date;
}

export interface AiSuggestionSummary {
  totalCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  maxConfidence: number;
}

export const AI_SUGGESTION_GUARDRAIL =
  'AI補助は候補提示のみです。請求、調剤、服薬指導の確定は薬剤師が確認してください。';

const DECISION_LABELS: Record<AiSuggestionDecision, string> = {
  accepted: '採用',
  modified: '修正',
  rejected: '却下'
};

const SEVERITY_MAP: Record<PrescriptionInputAuditSeverity, AiSuggestionSeverity> = {
  error: 'critical',
  warning: 'warning',
  info: 'info'
};

const SEVERITY_CONFIDENCE: Record<PrescriptionInputAuditSeverity, number> = {
  error: 90,
  warning: 78,
  info: 62
};

const ISSUE_CONFIDENCE: Record<string, number> = {
  patient_allergy_match: 96,
  abolished_drug_selected: 95,
  amount_invalid: 92,
  usage_missing: 91,
  days_invalid: 91,
  drug_missing: 90,
  patient_side_effect_match: 84,
  high_risk_without_comment: 82,
  same_drug_duplicated: 82,
  similar_therapy_detected: 80,
  stock_empty: 76,
  stock_shortage: 74,
  long_days_without_comment: 66
};

const SUGGESTED_ACTIONS: Record<string, string> = {
  drug_missing: '薬品名を薬品マスタから選び、処方入力を確定してください。',
  drug_master_unselected: '薬品マスタを選択し、YJコード、薬価、在庫、監査判定の根拠をそろえてください。',
  amount_invalid: '1日量を処方箋原本または疑義照会結果に照らして修正してください。',
  usage_missing: 'Rp単位の用法を処方箋原本または疑義照会結果に照らして入力してください。',
  days_invalid: '投与日数を処方箋原本または疑義照会結果に照らして修正してください。',
  long_days_without_comment: '長期処方の意図や確認事項をRpコメントまたは薬歴へ残してください。',
  high_risk_without_comment: '指導、相互作用、副作用、検査値などの確認ポイントをRpコメントまたは薬歴へ残してください。',
  abolished_drug_selected: '現行マスターの薬品へ置換し、必要なら処方医へ確認してください。',
  substitution_reason_missing: '変更調剤の理由、患者同意、疑義照会結果を記録してください。',
  stock_empty: 'ピッキング前に在庫、入荷予定、代替候補、患者への連絡要否を確認してください。',
  stock_shortage: '不足見込み数量と入荷予定を確認し、必要なら代替候補や分納方針を記録してください。',
  special_preparation_without_note: '一包化、粉砕、レセ摘要の判断理由をRpコメントまたは摘要へ残してください。',
  same_drug_duplicated: '同一薬品の重複入力か、意図した別Rpかを処方箋原本で確認してください。',
  similar_therapy_detected: '同効薬の併用意図、副作用リスク、処方変更履歴を確認してください。',
  rp_fields_mismatch: '同一Rp内の用量、用法、日数の揺れを確認し、Rp単位で整えてください。',
  patient_allergy_match: '患者アレルギー情報と処方薬の一致を薬剤師が確認し、必要なら疑義照会してください。',
  patient_side_effect_match: '患者副作用歴と処方薬の関係を薬剤師が確認し、服薬指導と薬歴へ残してください。'
};

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sanitizeSuggestionId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'suggestion';
}

function confidenceForIssue(issue: PrescriptionInputAuditIssue): number {
  return clampConfidence(ISSUE_CONFIDENCE[issue.code] ?? SEVERITY_CONFIDENCE[issue.severity]);
}

function buildEvidence(issue: PrescriptionInputAuditIssue): AiSuggestionEvidence[] {
  const evidence: AiSuggestionEvidence[] = [
    {
      label: '監査項目',
      detail: issue.title,
      source: '処方入力監査',
      issueCode: issue.code
    },
    {
      label: '検出理由',
      detail: issue.message,
      source: '処方入力監査',
      issueCode: issue.code
    },
    {
      label: '検出コード',
      detail: issue.code,
      source: '処方入力監査',
      issueCode: issue.code
    }
  ];

  if (issue.itemIds?.length) {
    evidence.push({
      label: '対象薬品',
      detail: issue.itemIds.join(', '),
      source: '処方入力監査',
      issueCode: issue.code
    });
  }

  if (issue.rpId) {
    evidence.push({
      label: '対象Rp',
      detail: issue.rpId,
      source: '処方入力監査',
      issueCode: issue.code
    });
  }

  return evidence;
}

export function getAiSuggestionDecisionLabel(decision: AiSuggestionDecision): string {
  return DECISION_LABELS[decision];
}

export function buildAiSuggestionsFromPrescriptionAudit(
  audit: PrescriptionInputAuditResult
): AiAssistSuggestion[] {
  return audit.issues.map((issue, index) => {
    const suggestionId = sanitizeSuggestionId(`prescription-audit-${issue.code}-${index + 1}`);
    return {
      suggestionId,
      domain: 'prescription_audit',
      source: 'rule_based',
      severity: SEVERITY_MAP[issue.severity],
      title: issue.title,
      message: issue.message,
      suggestedAction: SUGGESTED_ACTIONS[issue.code] || issue.message,
      confidence: confidenceForIssue(issue),
      evidence: buildEvidence(issue),
      requiresHumanReview: true,
      guardrail: AI_SUGGESTION_GUARDRAIL,
      relatedItemIds: issue.itemIds,
      rpId: issue.rpId
    };
  });
}

export function summarizeAiSuggestions(suggestions: AiAssistSuggestion[]): AiSuggestionSummary {
  return suggestions.reduce<AiSuggestionSummary>((summary, suggestion) => ({
    totalCount: summary.totalCount + 1,
    criticalCount: summary.criticalCount + (suggestion.severity === 'critical' ? 1 : 0),
    warningCount: summary.warningCount + (suggestion.severity === 'warning' ? 1 : 0),
    infoCount: summary.infoCount + (suggestion.severity === 'info' ? 1 : 0),
    maxConfidence: Math.max(summary.maxConfidence, suggestion.confidence)
  }), {
    totalCount: 0,
    criticalCount: 0,
    warningCount: 0,
    infoCount: 0,
    maxConfidence: 0
  });
}

export function formatAiSuggestionConfidence(suggestion: Pick<AiAssistSuggestion, 'confidence'>): string {
  return `${clampConfidence(suggestion.confidence)}%`;
}

export function buildAiSuggestionDecisionAuditDetail(input: AiSuggestionDecisionAuditInput): string {
  const decidedAt = input.decidedAt ?? new Date();
  const evidence = input.suggestion.evidence
    .slice(0, 5)
    .map((item) => `${item.label}: ${item.detail}`)
    .join(' / ');
  const parts = [
    `AI提案採否: ${DECISION_LABELS[input.decision]}`,
    `確認者: ${input.reviewerName}`,
    `確認日時: ${decidedAt.toISOString()}`,
    `提案ID: ${input.suggestion.suggestionId}`,
    `提案: ${input.suggestion.title}`,
    `信頼度: ${formatAiSuggestionConfidence(input.suggestion)}`,
    `根拠: ${evidence || 'なし'}`,
    `推奨対応: ${input.suggestion.suggestedAction}`,
    `薬剤師確認必須: ${input.suggestion.requiresHumanReview ? 'はい' : 'いいえ'}`,
    `ガードレール: ${input.suggestion.guardrail}`
  ];

  if (input.modifiedAction?.trim()) {
    parts.push(`修正後対応: ${input.modifiedAction.trim()}`);
  }

  if (input.feedback?.trim()) {
    parts.push(`フィードバック: ${input.feedback.trim()}`);
  }

  return parts.join(' / ').slice(0, 1800);
}
