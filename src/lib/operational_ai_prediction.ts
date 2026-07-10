import { AI_SUGGESTION_GUARDRAIL } from './ai_suggestion.ts';

export type OperationalAiPredictionDomain = 'claim_return' | 'inventory_shortage' | 'follow_up';
export type OperationalAiPredictionSeverity = 'critical' | 'warning' | 'info';

export interface OperationalAiPredictionEvidence {
  label: string;
  detail: string;
  source: string;
}

export interface OperationalAiPrediction {
  predictionId: string;
  domain: OperationalAiPredictionDomain;
  severity: OperationalAiPredictionSeverity;
  title: string;
  message: string;
  score: number;
  confidence: number;
  suggestedAction: string;
  evidence: OperationalAiPredictionEvidence[];
  requiresHumanReview: true;
  guardrail: string;
  targetId?: string;
}

export interface OperationalAiPredictionSummary {
  totalCount: number;
  criticalCount: number;
  warningCount: number;
  maxScore: number;
  averageConfidence: number;
  topPrediction?: OperationalAiPrediction;
}

export interface OperationalAiPredictionClaimRisk {
  visitId: string;
  name: string;
  prescriptionCount: number;
  totalPoints: number;
  errorCount: number;
  warningCount: number;
  priority: 'high' | 'medium';
  riskScore: number;
  topIssueTitles: string[];
  actionLabel: string;
}

export interface OperationalAiPredictionInventoryRisk {
  drugId: string;
  drugName: string;
  location: string;
  supplierName: string;
  requiredAmount: number;
  availableAmount: number;
  shortageAmount: number;
  affectedVisitCount: number;
  priority: 'high' | 'medium';
  actionLabel: string;
}

export interface OperationalAiPredictionFollowUpCandidate {
  visitId: string;
  name: string;
  prescriptionCount: number;
  priority: 'high' | 'medium';
  reasonFlags: string[];
  dueLabel: string;
  suggestedAction: string;
  riskScore: number;
  attemptCount: number;
  lastContactLabel?: string;
  isOverdue: boolean;
}

export interface BuildOperationalAiPredictionsInput {
  claimRisks?: readonly OperationalAiPredictionClaimRisk[];
  inventoryRisks?: readonly OperationalAiPredictionInventoryRisk[];
  followUpCandidates?: readonly OperationalAiPredictionFollowUpCandidate[];
}

const MAX_PREDICTIONS = 8;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sanitizePredictionId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'prediction';
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('ja-JP') : '0';
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? `${value.toLocaleString('ja-JP')}` : `${value.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}`;
}

function topIssueSummary(topIssueTitles: string[]): string {
  return topIssueTitles.length > 0
    ? topIssueTitles.slice(0, 3).join(' / ')
    : '請求前チェックを確認';
}

function buildClaimPrediction(risk: OperationalAiPredictionClaimRisk): OperationalAiPrediction {
  const score = clampScore(risk.riskScore);
  const confidence = clampScore(68 + risk.errorCount * 8 + risk.warningCount * 3 + (risk.priority === 'high' ? 4 : 0));
  const issueSummary = topIssueSummary(risk.topIssueTitles);

  return {
    predictionId: sanitizePredictionId(`operational-claim-${risk.visitId}`),
    domain: 'claim_return',
    severity: risk.priority === 'high' || score >= 80 ? 'critical' : 'warning',
    title: `返戻リスク予測: ${risk.name}`,
    message: `${issueSummary}。請求前に${risk.actionLabel}`,
    score,
    confidence,
    suggestedAction: risk.actionLabel,
    evidence: [
      {
        label: '請求前チェック',
        detail: `要修正 ${risk.errorCount}件 / 確認 ${risk.warningCount}件`,
        source: '請求前チェック'
      },
      {
        label: '主な検出理由',
        detail: issueSummary,
        source: '請求前チェック'
      },
      {
        label: '点数・処方数',
        detail: `${formatNumber(risk.totalPoints)}点 / ${risk.prescriptionCount}薬`,
        source: '受付・算定情報'
      }
    ],
    requiresHumanReview: true,
    guardrail: AI_SUGGESTION_GUARDRAIL,
    targetId: risk.visitId
  };
}

function buildInventoryPrediction(risk: OperationalAiPredictionInventoryRisk): OperationalAiPrediction {
  const shortageRatio = risk.requiredAmount > 0
    ? (Math.max(0, risk.shortageAmount) / risk.requiredAmount) * 100
    : risk.shortageAmount > 0
      ? 100
      : 0;
  const score = clampScore(60 + shortageRatio * 0.4 + risk.affectedVisitCount * 8 + (risk.priority === 'high' ? 20 : 0));
  const confidence = clampScore(70 + risk.affectedVisitCount * 4 + (risk.priority === 'high' ? 8 : 0) + (risk.shortageAmount > 0 ? 4 : 0));

  return {
    predictionId: sanitizePredictionId(`operational-inventory-${risk.drugId}`),
    domain: 'inventory_shortage',
    severity: risk.priority === 'high' || score >= 85 ? 'critical' : 'warning',
    title: `在庫欠品予測: ${risk.drugName}`,
    message: `${risk.affectedVisitCount}件の受付に影響する可能性があります。${risk.actionLabel}`,
    score,
    confidence,
    suggestedAction: risk.actionLabel,
    evidence: [
      {
        label: '不足見込み',
        detail: `必要 ${formatAmount(risk.requiredAmount)} / 在庫 ${formatAmount(risk.availableAmount)} / 不足 ${formatAmount(risk.shortageAmount)}`,
        source: '在庫予定計算'
      },
      {
        label: '影響受付',
        detail: `${risk.affectedVisitCount}件`,
        source: '受付中処方'
      },
      {
        label: '仕入先候補',
        detail: `${risk.supplierName} / ${risk.location}`,
        source: '在庫マスター'
      }
    ],
    requiresHumanReview: true,
    guardrail: AI_SUGGESTION_GUARDRAIL,
    targetId: risk.drugId
  };
}

function buildFollowUpPrediction(candidate: OperationalAiPredictionFollowUpCandidate): OperationalAiPrediction {
  const score = clampScore(candidate.riskScore + (candidate.isOverdue ? 20 : 0) + candidate.attemptCount * 6);
  const confidence = clampScore(65 + candidate.reasonFlags.length * 5 + (candidate.isOverdue ? 10 : 0) + candidate.attemptCount * 3);
  const reasonSummary = candidate.reasonFlags.length > 0
    ? candidate.reasonFlags.slice(0, 4).join(' / ')
    : 'フォロー候補';

  return {
    predictionId: sanitizePredictionId(`operational-follow-up-${candidate.visitId}`),
    domain: 'follow_up',
    severity: (candidate.priority === 'high' && candidate.isOverdue) || score >= 85 ? 'critical' : 'warning',
    title: `服薬フォロー予測: ${candidate.name}`,
    message: `${candidate.isOverdue ? '期限超過' : candidate.dueLabel}の候補です。${candidate.suggestedAction}`,
    score,
    confidence,
    suggestedAction: candidate.suggestedAction,
    evidence: [
      {
        label: 'フォロー理由',
        detail: reasonSummary,
        source: '服薬フォロー候補'
      },
      {
        label: '確認期限',
        detail: candidate.isOverdue ? `期限超過 / ${candidate.dueLabel}` : candidate.dueLabel,
        source: '服薬フォロー候補'
      },
      {
        label: '接触履歴',
        detail: `${candidate.attemptCount}回${candidate.lastContactLabel ? ` / ${candidate.lastContactLabel}` : ''}`,
        source: '服薬フォロー記録'
      }
    ],
    requiresHumanReview: true,
    guardrail: AI_SUGGESTION_GUARDRAIL,
    targetId: candidate.visitId
  };
}

export function buildOperationalAiPredictions(input: BuildOperationalAiPredictionsInput): OperationalAiPrediction[] {
  const predictions = [
    ...(input.claimRisks || []).map(buildClaimPrediction),
    ...(input.inventoryRisks || []).map(buildInventoryPrediction),
    ...(input.followUpCandidates || []).map(buildFollowUpPrediction)
  ];

  return predictions
    .sort((left, right) => right.score - left.score || right.confidence - left.confidence || left.title.localeCompare(right.title, 'ja'))
    .slice(0, MAX_PREDICTIONS);
}

export function summarizeOperationalAiPredictions(
  predictions: readonly OperationalAiPrediction[]
): OperationalAiPredictionSummary {
  if (predictions.length === 0) {
    return {
      totalCount: 0,
      criticalCount: 0,
      warningCount: 0,
      maxScore: 0,
      averageConfidence: 0
    };
  }

  const totalConfidence = predictions.reduce((sum, prediction) => sum + prediction.confidence, 0);
  return {
    totalCount: predictions.length,
    criticalCount: predictions.filter((prediction) => prediction.severity === 'critical').length,
    warningCount: predictions.filter((prediction) => prediction.severity === 'warning').length,
    maxScore: Math.max(...predictions.map((prediction) => prediction.score)),
    averageConfidence: clampScore(totalConfidence / predictions.length),
    topPrediction: predictions[0]
  };
}
