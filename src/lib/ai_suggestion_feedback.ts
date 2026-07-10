import type { AiAssistMode, AuditLog } from '@/db/types';
import type { AiSuggestionDecision } from './ai_suggestion.ts';
import {
  AI_ASSIST_MODE_LABELS,
  compareAiAssistModeStrictness,
  normalizeAiAssistMode
} from './ai_assist_policy.ts';

export interface AiSuggestionFeedbackRecord {
  logId: string;
  timestamp: string;
  dateLabel: string;
  reviewerName: string;
  decision: AiSuggestionDecision;
  decisionLabel: string;
  suggestionId: string;
  suggestionTitle: string;
  domain: AiSuggestionFeedbackDomain;
  domainLabel: string;
  storeName: string;
  storeCode?: string;
  soapType?: SoapDraftFeedbackType;
  confidence?: number;
  modifiedAction?: string;
  feedback?: string;
}

export type AiSuggestionFeedbackDomain = 'soap_draft' | 'prescription_audit' | 'other';
export type SoapDraftFeedbackType = 'S' | 'O' | 'A' | 'P';

export interface AiSuggestionFeedbackDomainSummary {
  domain: AiSuggestionFeedbackDomain;
  domainLabel: string;
  totalCount: number;
  acceptedCount: number;
  modifiedCount: number;
  rejectedCount: number;
  feedbackCount: number;
  averageConfidence?: number;
  acceptanceRate: number;
  correctionRate: number;
  rejectionRate: number;
}

export interface SoapDraftFeedbackSummary {
  totalCount: number;
  acceptedCount: number;
  modifiedCount: number;
  rejectedCount: number;
  feedbackCount: number;
  averageConfidence?: number;
  acceptanceRate: number;
  correctionRate: number;
  typeCounts: Record<SoapDraftFeedbackType, number>;
  status: 'empty' | 'needs_review' | 'ready';
  statusLabel: string;
  actionLabel: string;
  requiredActions: string[];
}

export interface AiSuggestionFeedbackStoreSummary {
  storeKey: string;
  storeName: string;
  storeCode?: string;
  totalCount: number;
  acceptedCount: number;
  modifiedCount: number;
  rejectedCount: number;
  feedbackCount: number;
  averageConfidence?: number;
  acceptanceRate: number;
  correctionRate: number;
  differenceFromAverage: number;
}

export interface AiSuggestionFeedbackStoreComparison {
  status: 'single_store' | 'leading' | 'balanced' | 'needs_attention';
  statusLabel: string;
  actionLabel: string;
  currentStoreName: string;
  currentStore?: AiSuggestionFeedbackStoreSummary;
  storeCount: number;
  allStoreAverageAcceptanceRate: number;
  peerAverageAcceptanceRate?: number;
  requiredActions: string[];
  storeSummaries: AiSuggestionFeedbackStoreSummary[];
}

export interface AiSuggestionFeedbackReviewOptions {
  currentStoreName?: string;
  currentStoreCode?: string;
  currentAiAssistMode?: AiAssistMode;
}

export interface AiSuggestionQualityPolicy {
  minimumMonthlySamples: number;
  minimumRateSamples: number;
  highConfidenceThreshold: number;
  stopHighConfidenceRejectedCount: number;
  stopRejectionRate: number;
  restrictRejectionRate: number;
  restrictCorrectionRate: number;
  domainMinimumSamples: number;
  restrictDomainCorrectionRate: number;
  storeMinimumSamples: number;
  restrictStoreDifferencePoints: number;
}

export type AiSuggestionQualityGateStatus =
  | 'insufficient_data'
  | 'continue'
  | 'restrict'
  | 'stop';

export interface AiSuggestionQualityGate {
  status: AiSuggestionQualityGateStatus;
  statusLabel: string;
  actionLabel: string;
  sampleCount: number;
  remainingSampleCount: number;
  rejectionRate: number;
  highConfidenceCount: number;
  highConfidenceRejectedCount: number;
  highConfidenceRejectedRate: number;
  missingFeedbackCount: number;
  riskyDomainLabels: string[];
  currentMode: AiAssistMode;
  currentModeLabel: string;
  recommendedMode: AiAssistMode;
  recommendedModeLabel: string;
  modeAlignment: 'aligned' | 'stricter' | 'change_required';
  modeAlignmentLabel: string;
  reasons: string[];
  requiredActions: string[];
  policy: AiSuggestionQualityPolicy;
  evaluationNote: string;
}

export interface AiSuggestionFeedbackMonthlyReview {
  monthKey: string;
  monthLabel: string;
  generatedAt: string;
  totalCount: number;
  acceptedCount: number;
  modifiedCount: number;
  rejectedCount: number;
  feedbackCount: number;
  averageConfidence?: number;
  acceptanceRate: number;
  correctionRate: number;
  status: 'empty' | 'needs_feedback' | 'ready';
  statusLabel: string;
  actionLabel: string;
  requiredActions: string[];
  domainSummaries: AiSuggestionFeedbackDomainSummary[];
  soapDraftSummary: SoapDraftFeedbackSummary;
  storeComparison: AiSuggestionFeedbackStoreComparison;
  qualityGate: AiSuggestionQualityGate;
  latestRecord?: AiSuggestionFeedbackRecord;
  records: AiSuggestionFeedbackRecord[];
}

export interface AiSuggestionFeedbackBiExport {
  type: 'ai-suggestion-feedback-monthly-review';
  schemaVersion: 2;
  generatedAt: string;
  monthKey: string;
  monthLabel: string;
  summary: {
    totalCount: number;
    acceptedCount: number;
    modifiedCount: number;
    rejectedCount: number;
    feedbackCount: number;
    averageConfidence?: number;
    acceptanceRate: number;
    correctionRate: number;
    rejectionRate: number;
    status: AiSuggestionFeedbackMonthlyReview['status'];
    statusLabel: string;
    actionLabel: string;
  };
  requiredActions: string[];
  storeComparison: AiSuggestionFeedbackStoreComparison;
  domainSummaries: AiSuggestionFeedbackDomainSummary[];
  soapDraftSummary: SoapDraftFeedbackSummary;
  qualityGate: AiSuggestionQualityGate;
  records: AiSuggestionFeedbackRecord[];
  privacy: {
    patientFieldsIncluded: false;
    containsPatientIdentifiers: false;
    sourceLogDetailsIncluded: false;
  };
}

const DECISION_BY_LABEL: Record<string, AiSuggestionDecision> = {
  '採用': 'accepted',
  '修正': 'modified',
  '却下': 'rejected'
};

const DECISION_LABELS: Record<AiSuggestionDecision, string> = {
  accepted: '採用',
  modified: '修正',
  rejected: '却下'
};

const DOMAIN_LABELS: Record<AiSuggestionFeedbackDomain, string> = {
  soap_draft: 'SOAP下書き',
  prescription_audit: '処方監査',
  other: 'その他'
};

const DEFAULT_STORE_NAME = '自店';

export const DEFAULT_AI_SUGGESTION_QUALITY_POLICY: AiSuggestionQualityPolicy = {
  minimumMonthlySamples: 20,
  minimumRateSamples: 10,
  highConfidenceThreshold: 80,
  stopHighConfidenceRejectedCount: 2,
  stopRejectionRate: 25,
  restrictRejectionRate: 10,
  restrictCorrectionRate: 35,
  domainMinimumSamples: 5,
  restrictDomainCorrectionRate: 50,
  storeMinimumSamples: 5,
  restrictStoreDifferencePoints: -15
};

const QUALITY_GATE_EVALUATION_NOTE =
  'この判定は採否ログに基づく運用上の安全ゲートです。臨床的な正確性の証明には、実店舗での症例レビューが別途必要です。';

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseSegment(details: string, label: string): string | undefined {
  const prefix = `${label}: `;
  const segment = details
    .split(' / ')
    .find((part) => part.startsWith(prefix));
  return segment?.slice(prefix.length).trim() || undefined;
}

function parseConfidence(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value.replace('%', ''), 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.min(100, parsed));
}

function parseFirstSegment(details: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const value = parseSegment(details, label);
    if (value) return value;
  }
  return undefined;
}

function sameMonth(timestamp: string, monthKey: string): boolean {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;
  return formatMonthKey(date) === monthKey;
}

function detectSuggestionDomain(suggestionId: string, suggestionTitle: string): AiSuggestionFeedbackDomain {
  const normalizedTitle = suggestionTitle.toUpperCase();
  if (suggestionId.startsWith('soap-') || /SOAP\s+[SOAP]/.test(normalizedTitle)) {
    return 'soap_draft';
  }
  if (suggestionId.startsWith('prescription-audit-')) {
    return 'prescription_audit';
  }
  return 'other';
}

function detectSoapType(suggestionId: string, suggestionTitle: string): SoapDraftFeedbackType | undefined {
  const titleMatch = suggestionTitle.toUpperCase().match(/SOAP\s+([SOAP])/);
  if (titleMatch?.[1]) return titleMatch[1] as SoapDraftFeedbackType;

  const idMatch = suggestionId.match(/^soap-([soap])-/i);
  if (idMatch?.[1]) return idMatch[1].toUpperCase() as SoapDraftFeedbackType;

  return undefined;
}

function summarizeRecords(
  records: AiSuggestionFeedbackRecord[],
  domain: AiSuggestionFeedbackDomain
): AiSuggestionFeedbackDomainSummary {
  const acceptedCount = records.filter((record) => record.decision === 'accepted').length;
  const modifiedCount = records.filter((record) => record.decision === 'modified').length;
  const rejectedCount = records.filter((record) => record.decision === 'rejected').length;
  const feedbackCount = records.filter((record) => !!record.feedback || !!record.modifiedAction).length;
  const confidenceValues = records
    .map((record) => record.confidence)
    .filter((value): value is number => value !== undefined);
  const totalCount = records.length;
  const averageConfidence = confidenceValues.length > 0
    ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
    : undefined;

  return {
    domain,
    domainLabel: DOMAIN_LABELS[domain],
    totalCount,
    acceptedCount,
    modifiedCount,
    rejectedCount,
    feedbackCount,
    averageConfidence,
    acceptanceRate: totalCount > 0 ? Math.round((acceptedCount / totalCount) * 100) : 0,
    correctionRate: totalCount > 0 ? Math.round(((modifiedCount + rejectedCount) / totalCount) * 100) : 0,
    rejectionRate: totalCount > 0 ? Math.round((rejectedCount / totalCount) * 100) : 0
  };
}

function buildDomainSummaries(records: AiSuggestionFeedbackRecord[]): AiSuggestionFeedbackDomainSummary[] {
  return (['soap_draft', 'prescription_audit', 'other'] as AiSuggestionFeedbackDomain[])
    .map((domain) => summarizeRecords(records.filter((record) => record.domain === domain), domain))
    .filter((summary) => summary.totalCount > 0);
}

function buildSoapDraftSummary(records: AiSuggestionFeedbackRecord[]): SoapDraftFeedbackSummary {
  const soapRecords = records.filter((record) => record.domain === 'soap_draft');
  const summary = summarizeRecords(soapRecords, 'soap_draft');
  const typeCounts: Record<SoapDraftFeedbackType, number> = { S: 0, O: 0, A: 0, P: 0 };
  for (const record of soapRecords) {
    if (record.soapType) typeCounts[record.soapType] += 1;
  }

  const missingFeedbackCount = soapRecords.filter((record) => (
    record.decision !== 'accepted' && !record.feedback && !record.modifiedAction
  )).length;
  const requiredActions = summary.totalCount === 0
    ? ['SOAP下書きの採否ログを蓄積してください。']
    : summary.correctionRate >= 50
      ? ['SOAP下書きの修正・却下率が高いため、根拠リンクと下書き文面を見直してください。']
      : missingFeedbackCount > 0
        ? [`SOAP下書きの修正・却下理由 ${missingFeedbackCount}件を追記してください。`]
        : ['SOAP下書きの採否傾向を月次レビューへ反映できます。'];
  const status = summary.totalCount === 0
    ? 'empty'
    : summary.correctionRate >= 50 || missingFeedbackCount > 0
      ? 'needs_review'
      : 'ready';
  const statusLabel = status === 'ready'
    ? '品質安定'
    : status === 'needs_review'
      ? '要見直し'
      : '未記録';
  const actionLabel = status === 'ready'
    ? '月次反映'
    : status === 'needs_review'
      ? '文面見直し'
      : '採否記録';

  return {
    totalCount: summary.totalCount,
    acceptedCount: summary.acceptedCount,
    modifiedCount: summary.modifiedCount,
    rejectedCount: summary.rejectedCount,
    feedbackCount: summary.feedbackCount,
    averageConfidence: summary.averageConfidence,
    acceptanceRate: summary.acceptanceRate,
    correctionRate: summary.correctionRate,
    typeCounts,
    status,
    statusLabel,
    actionLabel,
    requiredActions
  };
}

function storeKeyFor(record: Pick<AiSuggestionFeedbackRecord, 'storeName' | 'storeCode'>): string {
  return record.storeCode ? `code:${record.storeCode}` : `name:${record.storeName}`;
}

function summarizeStoreRecords(
  records: AiSuggestionFeedbackRecord[],
  storeName: string,
  storeCode: string | undefined,
  allStoreAverageAcceptanceRate: number
): AiSuggestionFeedbackStoreSummary {
  const acceptedCount = records.filter((record) => record.decision === 'accepted').length;
  const modifiedCount = records.filter((record) => record.decision === 'modified').length;
  const rejectedCount = records.filter((record) => record.decision === 'rejected').length;
  const feedbackCount = records.filter((record) => !!record.feedback || !!record.modifiedAction).length;
  const confidenceValues = records
    .map((record) => record.confidence)
    .filter((value): value is number => value !== undefined);
  const totalCount = records.length;
  const acceptanceRate = totalCount > 0 ? Math.round((acceptedCount / totalCount) * 100) : 0;

  return {
    storeKey: storeCode ? `code:${storeCode}` : `name:${storeName}`,
    storeName,
    storeCode,
    totalCount,
    acceptedCount,
    modifiedCount,
    rejectedCount,
    feedbackCount,
    averageConfidence: confidenceValues.length > 0
      ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
      : undefined,
    acceptanceRate,
    correctionRate: totalCount > 0 ? Math.round(((modifiedCount + rejectedCount) / totalCount) * 100) : 0,
    differenceFromAverage: acceptanceRate - allStoreAverageAcceptanceRate
  };
}

function buildStoreComparison(
  records: AiSuggestionFeedbackRecord[],
  options: AiSuggestionFeedbackReviewOptions
): AiSuggestionFeedbackStoreComparison {
  const currentStoreName = options.currentStoreName?.trim() || DEFAULT_STORE_NAME;
  const currentStoreCode = options.currentStoreCode?.trim() || undefined;
  const currentStoreKey = currentStoreCode ? `code:${currentStoreCode}` : `name:${currentStoreName}`;
  const normalizedRecords = records.map((record) => {
    if (record.storeName !== DEFAULT_STORE_NAME || !options.currentStoreName) return record;
    return {
      ...record,
      storeName: currentStoreName,
      storeCode: currentStoreCode
    };
  });
  const totalCount = normalizedRecords.length;
  const allAcceptedCount = normalizedRecords.filter((record) => record.decision === 'accepted').length;
  const allStoreAverageAcceptanceRate = totalCount > 0
    ? Math.round((allAcceptedCount / totalCount) * 100)
    : 0;
  const grouped = new Map<string, AiSuggestionFeedbackRecord[]>();
  for (const record of normalizedRecords) {
    const key = storeKeyFor(record);
    grouped.set(key, [...(grouped.get(key) || []), record]);
  }
  const storeSummaries = [...grouped.values()]
    .map((storeRecords) => summarizeStoreRecords(
      storeRecords,
      storeRecords[0]?.storeName || DEFAULT_STORE_NAME,
      storeRecords[0]?.storeCode,
      allStoreAverageAcceptanceRate
    ))
    .sort((a, b) => b.acceptanceRate - a.acceptanceRate || b.totalCount - a.totalCount || a.storeName.localeCompare(b.storeName, 'ja'));
  const currentStore = storeSummaries.find((summary) => summary.storeKey === currentStoreKey) || storeSummaries[0];
  const peerRecords = normalizedRecords.filter((record) => storeKeyFor(record) !== currentStore?.storeKey);
  const peerAcceptedCount = peerRecords.filter((record) => record.decision === 'accepted').length;
  const peerAverageAcceptanceRate = peerRecords.length > 0
    ? Math.round((peerAcceptedCount / peerRecords.length) * 100)
    : undefined;
  const storeCount = storeSummaries.length;
  const difference = currentStore ? currentStore.differenceFromAverage : 0;
  const status = storeCount <= 1
    ? 'single_store'
    : difference >= 10
      ? 'leading'
      : difference <= -10
        ? 'needs_attention'
        : 'balanced';
  const statusLabel = status === 'leading'
    ? '自店リード'
    : status === 'needs_attention'
      ? '要改善'
      : status === 'balanced'
        ? '平均との差小'
        : '比較待ち';
  const actionLabel = status === 'leading'
    ? '好事例共有'
    : status === 'needs_attention'
      ? '改善確認'
      : status === 'balanced'
        ? '継続監視'
        : '他店舗ログ取込';
  const requiredActions = totalCount === 0
    ? ['AI補助提案の採否ログを蓄積してください。']
    : storeCount <= 1
      ? ['店舗別比較のため、他店舗または過去店舗の採否ログを取り込んでください。']
      : status === 'needs_attention'
        ? ['自店の採用率が平均との差で低いため、修正・却下理由と提案種別別の差を確認してください。']
        : status === 'leading'
          ? ['採用率が平均を上回る店舗の運用を、他店舗の教育材料として共有できます。']
          : ['店舗間の採用率差は小さいため、提案種別別の改善を継続確認してください。'];

  return {
    status,
    statusLabel,
    actionLabel,
    currentStoreName,
    currentStore,
    storeCount,
    allStoreAverageAcceptanceRate,
    peerAverageAcceptanceRate,
    requiredActions,
    storeSummaries
  };
}

function buildAiSuggestionQualityGate(
  records: AiSuggestionFeedbackRecord[],
  domainSummaries: AiSuggestionFeedbackDomainSummary[],
  storeComparison: AiSuggestionFeedbackStoreComparison,
  options: AiSuggestionFeedbackReviewOptions,
  policy: AiSuggestionQualityPolicy = DEFAULT_AI_SUGGESTION_QUALITY_POLICY
): AiSuggestionQualityGate {
  const sampleCount = records.length;
  const rejectedCount = records.filter((record) => record.decision === 'rejected').length;
  const modifiedCount = records.filter((record) => record.decision === 'modified').length;
  const highConfidenceRecords = records.filter((record) => (
    record.confidence !== undefined && record.confidence >= policy.highConfidenceThreshold
  ));
  const highConfidenceRejectedCount = highConfidenceRecords.filter((record) => (
    record.decision === 'rejected'
  )).length;
  const missingFeedbackCount = records.filter((record) => (
    record.decision !== 'accepted' && !record.feedback && !record.modifiedAction
  )).length;
  const rejectionRate = sampleCount > 0 ? Math.round((rejectedCount / sampleCount) * 100) : 0;
  const correctionRate = sampleCount > 0
    ? Math.round(((modifiedCount + rejectedCount) / sampleCount) * 100)
    : 0;
  const highConfidenceRejectedRate = highConfidenceRecords.length > 0
    ? Math.round((highConfidenceRejectedCount / highConfidenceRecords.length) * 100)
    : 0;
  const riskyDomainLabels = domainSummaries
    .filter((summary) => (
      summary.totalCount >= policy.domainMinimumSamples
      && summary.correctionRate >= policy.restrictDomainCorrectionRate
    ))
    .map((summary) => summary.domainLabel);
  const storeDifferenceRequiresRestriction = Boolean(
    storeComparison.currentStore
    && storeComparison.storeCount > 1
    && storeComparison.currentStore.totalCount >= policy.storeMinimumSamples
    && storeComparison.currentStore.differenceFromAverage <= policy.restrictStoreDifferencePoints
  );
  const stopForHighConfidenceRejections = (
    highConfidenceRejectedCount >= policy.stopHighConfidenceRejectedCount
  );
  const stopForRejectionRate = (
    sampleCount >= policy.minimumRateSamples
    && rejectionRate >= policy.stopRejectionRate
  );
  const restrictForRates = (
    sampleCount >= policy.minimumRateSamples
    && (
      rejectionRate >= policy.restrictRejectionRate
      || correctionRate >= policy.restrictCorrectionRate
    )
  );
  const shouldStop = stopForHighConfidenceRejections || stopForRejectionRate;
  const hasEnoughSamples = sampleCount >= policy.minimumMonthlySamples;
  const shouldRestrict = (
    restrictForRates
    || missingFeedbackCount > 0
    || riskyDomainLabels.length > 0
    || storeDifferenceRequiresRestriction
  );
  const status: AiSuggestionQualityGateStatus = shouldStop
    ? 'stop'
    : !hasEnoughSamples
      ? 'insufficient_data'
      : shouldRestrict
        ? 'restrict'
        : 'continue';
  const recommendedMode: AiAssistMode = status === 'stop'
    ? 'disabled'
    : status === 'continue'
      ? 'enabled'
      : 'limited';
  const currentMode = normalizeAiAssistMode(options.currentAiAssistMode);
  const modeAlignment = compareAiAssistModeStrictness(currentMode, recommendedMode);

  const reasons: string[] = [];
  if (stopForHighConfidenceRejections) {
    reasons.push(`信頼度${policy.highConfidenceThreshold}%以上の候補が${highConfidenceRejectedCount}件却下されています。`);
  }
  if (stopForRejectionRate) {
    reasons.push(`却下率${rejectionRate}%が停止基準${policy.stopRejectionRate}%以上です。`);
  } else if (restrictForRates && rejectionRate >= policy.restrictRejectionRate) {
    reasons.push(`却下率${rejectionRate}%が制限基準${policy.restrictRejectionRate}%以上です。`);
  }
  if (!shouldStop && restrictForRates && correctionRate >= policy.restrictCorrectionRate) {
    reasons.push(`修正・却下率${correctionRate}%が制限基準${policy.restrictCorrectionRate}%以上です。`);
  }
  if (missingFeedbackCount > 0) {
    reasons.push(`修正・却下理由が未記入の採否ログが${missingFeedbackCount}件あります。`);
  }
  if (riskyDomainLabels.length > 0) {
    reasons.push(`${riskyDomainLabels.join('、')}で修正・却下が集中しています。`);
  }
  if (storeDifferenceRequiresRestriction && storeComparison.currentStore) {
    reasons.push(`自店採用率が全体平均を${Math.abs(storeComparison.currentStore.differenceFromAverage)}ポイント下回っています。`);
  }
  if (!hasEnoughSamples && !shouldStop) {
    reasons.push(`月次判定に必要な${policy.minimumMonthlySamples}件まで、あと${policy.minimumMonthlySamples - sampleCount}件です。`);
  }
  if (reasons.length === 0) {
    reasons.push('停止・制限基準に該当する品質警告はありません。');
  }

  const requiredActions = status === 'stop'
    ? [
        'AI補助を「停止」に切り替え、責任者レビューが終わるまで候補表示を止めてください。',
        '高信頼度で却下された候補の根拠、ルール、対象症例を確認してください。'
      ]
    : status === 'insufficient_data'
      ? [
          '評価件数がそろうまでは「制限」で重大な候補だけを表示してください。',
          `採用・修正・却下をあと${Math.max(0, policy.minimumMonthlySamples - sampleCount)}件記録してください。`
        ]
      : status === 'restrict'
        ? [
            'AI補助を「制限」にし、修正・却下が集中する提案種別を見直してください。',
            '修正・却下には理由または修正後対応を必ず記録してください。'
          ]
        : [
            'AI補助は「標準」で継続できます。',
            '月次レビューと高信頼度候補の却下監視を継続してください。'
          ];
  if (modeAlignment === 'change_required') {
    requiredActions.unshift(
      `現在の「${AI_ASSIST_MODE_LABELS[currentMode]}」から推奨の「${AI_ASSIST_MODE_LABELS[recommendedMode]}」へ変更してください。`
    );
  }

  return {
    status,
    statusLabel: status === 'stop'
      ? '停止基準に該当'
      : status === 'restrict'
        ? '制限が必要'
        : status === 'continue'
          ? '継続可'
          : '評価件数不足',
    actionLabel: status === 'stop'
      ? '表示停止'
      : status === 'restrict'
        ? '重大候補のみ'
        : status === 'continue'
          ? '標準継続'
          : '制限しながら評価',
    sampleCount,
    remainingSampleCount: Math.max(0, policy.minimumMonthlySamples - sampleCount),
    rejectionRate,
    highConfidenceCount: highConfidenceRecords.length,
    highConfidenceRejectedCount,
    highConfidenceRejectedRate,
    missingFeedbackCount,
    riskyDomainLabels,
    currentMode,
    currentModeLabel: AI_ASSIST_MODE_LABELS[currentMode],
    recommendedMode,
    recommendedModeLabel: AI_ASSIST_MODE_LABELS[recommendedMode],
    modeAlignment,
    modeAlignmentLabel: modeAlignment === 'aligned'
      ? '推奨どおり'
      : modeAlignment === 'stricter'
        ? '推奨より厳格'
        : '変更が必要',
    reasons,
    requiredActions,
    policy,
    evaluationNote: QUALITY_GATE_EVALUATION_NOTE
  };
}

export function parseAiSuggestionFeedbackRecord(log: AuditLog): AiSuggestionFeedbackRecord | undefined {
  if (log.actionType !== 'ai_suggestion_review') return undefined;

  const decisionLabel = parseSegment(log.details, 'AI提案採否');
  const decision = decisionLabel ? DECISION_BY_LABEL[decisionLabel] : undefined;
  if (!decision) return undefined;

  const timestampDate = new Date(log.timestamp);
  const confidence = parseConfidence(parseSegment(log.details, '信頼度'));
  const suggestionId = parseSegment(log.details, '提案ID') || '';
  const suggestionTitle = parseSegment(log.details, '提案') || 'AI補助提案';
  const domain = detectSuggestionDomain(suggestionId, suggestionTitle);
  const storeName = parseFirstSegment(log.details, ['店舗名', '店舗', '薬局名', '薬局']) || DEFAULT_STORE_NAME;
  const storeCode = parseFirstSegment(log.details, ['店舗コード', '保険薬局コード']);
  return {
    logId: log.logId,
    timestamp: log.timestamp,
    dateLabel: Number.isNaN(timestampDate.getTime())
      ? log.timestamp
      : timestampDate.toLocaleString('ja-JP'),
    reviewerName: parseSegment(log.details, '確認者') || log.userName,
    decision,
    decisionLabel: DECISION_LABELS[decision],
    suggestionId,
    suggestionTitle,
    domain,
    domainLabel: DOMAIN_LABELS[domain],
    storeName,
    storeCode,
    soapType: domain === 'soap_draft' ? detectSoapType(suggestionId, suggestionTitle) : undefined,
    confidence,
    modifiedAction: parseSegment(log.details, '修正後対応'),
    feedback: parseSegment(log.details, 'フィードバック')
  };
}

export function buildAiSuggestionFeedbackMonthlyReview(
  logs: AuditLog[],
  basisDate: Date = new Date(),
  options: AiSuggestionFeedbackReviewOptions = {}
): AiSuggestionFeedbackMonthlyReview {
  const monthKey = formatMonthKey(basisDate);
  const monthLabel = `${basisDate.getFullYear()}年${basisDate.getMonth() + 1}月`;
  const records = logs
    .filter((log) => sameMonth(log.timestamp, monthKey))
    .map(parseAiSuggestionFeedbackRecord)
    .filter((record): record is AiSuggestionFeedbackRecord => !!record)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const acceptedCount = records.filter((record) => record.decision === 'accepted').length;
  const modifiedCount = records.filter((record) => record.decision === 'modified').length;
  const rejectedCount = records.filter((record) => record.decision === 'rejected').length;
  const confidenceValues = records
    .map((record) => record.confidence)
    .filter((value): value is number => value !== undefined);
  const feedbackCount = records.filter((record) => !!record.feedback || !!record.modifiedAction).length;
  const missingFeedbackCount = records.filter((record) => (
    record.decision !== 'accepted' && !record.feedback && !record.modifiedAction
  )).length;
  const totalCount = records.length;
  const averageConfidence = confidenceValues.length > 0
    ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
    : undefined;
  const acceptanceRate = totalCount > 0 ? Math.round((acceptedCount / totalCount) * 100) : 0;
  const correctionRate = totalCount > 0 ? Math.round(((modifiedCount + rejectedCount) / totalCount) * 100) : 0;
  const domainSummaries = buildDomainSummaries(records);
  const soapDraftSummary = buildSoapDraftSummary(records);
  const storeComparison = buildStoreComparison(records, options);
  const qualityGate = buildAiSuggestionQualityGate(records, domainSummaries, storeComparison, options);

  const requiredActions = totalCount === 0
    ? ['今月のAI補助提案の採否ログを蓄積してください。']
    : missingFeedbackCount > 0
      ? [`修正・却下ログ ${missingFeedbackCount}件に理由または修正後対応を追記してください。`]
      : ['採否ログとフィードバックを月次レビューへ反映できます。'];
  const status = totalCount === 0
    ? 'empty'
    : missingFeedbackCount > 0
      ? 'needs_feedback'
      : 'ready';
  const statusLabel = status === 'ready'
    ? '記録あり'
    : status === 'needs_feedback'
      ? '要フィードバック'
      : '未記録';
  const actionLabel = status === 'ready'
    ? '月次レビュー可'
    : status === 'needs_feedback'
      ? '理由追記'
      : '採否記録';

  return {
    monthKey,
    monthLabel,
    generatedAt: new Date().toISOString(),
    totalCount,
    acceptedCount,
    modifiedCount,
    rejectedCount,
    feedbackCount,
    averageConfidence,
    acceptanceRate,
    correctionRate,
    status,
    statusLabel,
    actionLabel,
    requiredActions,
    domainSummaries,
    soapDraftSummary,
    storeComparison,
    qualityGate,
    latestRecord: records[records.length - 1],
    records
  };
}

export function buildAiSuggestionFeedbackMonthlyReviewCsv(review: AiSuggestionFeedbackMonthlyReview): string {
  const rows: unknown[][] = [
    ['区分', '項目', '値', '補足'],
    ['月次サマリー', '対象月', review.monthLabel, review.monthKey],
    ['月次サマリー', '作成日時', review.generatedAt, 'AI補助フィードバック月次レビューCSV'],
    ['月次サマリー', '採否ログ', `${review.totalCount}件`, '患者情報なし'],
    ['月次サマリー', '採用率', `${review.acceptanceRate}%`, `採用 ${review.acceptedCount}件`],
    ['月次サマリー', '修正/却下率', `${review.correctionRate}%`, `修正 ${review.modifiedCount}件 / 却下 ${review.rejectedCount}件`],
    ['月次サマリー', '却下率', `${review.qualityGate.rejectionRate}%`, '誤提案率の代理指標'],
    ['月次サマリー', '平均信頼度', review.averageConfidence === undefined ? '-' : `${review.averageConfidence}%`, `フィードバック ${review.feedbackCount}件`],
    ['月次サマリー', '判定', review.statusLabel, review.requiredActions.join(' / ')],
    ['品質ゲート', '判定', review.qualityGate.statusLabel, review.qualityGate.actionLabel],
    ['品質ゲート', '現在/推奨モード', `${review.qualityGate.currentModeLabel}/${review.qualityGate.recommendedModeLabel}`, review.qualityGate.modeAlignmentLabel],
    ['品質ゲート', '高信頼度候補', `${review.qualityGate.highConfidenceCount}件`, `却下 ${review.qualityGate.highConfidenceRejectedCount}件 / ${review.qualityGate.highConfidenceRejectedRate}%`],
    ['品質ゲート', '評価件数', `${review.qualityGate.sampleCount}/${review.qualityGate.policy.minimumMonthlySamples}件`, `残り ${review.qualityGate.remainingSampleCount}件`],
    ['品質ゲート', '判定理由', review.qualityGate.reasons.join(' / '), review.qualityGate.evaluationNote],
    ['品質ゲート', '必要対応', review.qualityGate.requiredActions.join(' / '), '責任者レビュー対象'],
    ['店舗別比較', '比較店舗数', `${review.storeComparison.storeCount}件`, review.storeComparison.statusLabel],
    ['店舗別比較', '自店採用率', review.storeComparison.currentStore ? `${review.storeComparison.currentStore.acceptanceRate}%` : '-', review.storeComparison.currentStoreName],
    ['店舗別比較', '全体平均', `${review.storeComparison.allStoreAverageAcceptanceRate}%`, '全店舗採否ログ平均'],
    ['店舗別比較', '他店平均', review.storeComparison.peerAverageAcceptanceRate === undefined ? '-' : `${review.storeComparison.peerAverageAcceptanceRate}%`, review.storeComparison.actionLabel],
    ['店舗別比較', '次の対応', review.storeComparison.requiredActions.join(' / '), '外部分析連携用'],
    ['SOAP下書き', '採用率', `${review.soapDraftSummary.acceptanceRate}%`, `採否 ${review.soapDraftSummary.totalCount}件`],
    ['SOAP下書き', '修正/却下率', `${review.soapDraftSummary.correctionRate}%`, review.soapDraftSummary.statusLabel],
    ['SOAP下書き', 'S/O/A/P', `${review.soapDraftSummary.typeCounts.S}/${review.soapDraftSummary.typeCounts.O}/${review.soapDraftSummary.typeCounts.A}/${review.soapDraftSummary.typeCounts.P}`, review.soapDraftSummary.requiredActions.join(' / ')]
  ];

  for (const summary of review.storeComparison.storeSummaries) {
    rows.push([
      '店舗別',
      summary.storeName,
      `${summary.acceptanceRate}%`,
      `店舗コード ${summary.storeCode || '-'} / 採否 ${summary.totalCount}件 / 修正却下 ${summary.correctionRate}% / 平均差 ${summary.differenceFromAverage > 0 ? '+' : ''}${summary.differenceFromAverage}pt`
    ]);
  }

  for (const summary of review.domainSummaries) {
    rows.push([
      '提案種別別',
      summary.domainLabel,
      `${summary.acceptanceRate}%`,
      `採否 ${summary.totalCount}件 / 修正却下 ${summary.correctionRate}% / 平均信頼度 ${summary.averageConfidence === undefined ? '-' : `${summary.averageConfidence}%`}`
    ]);
  }

  rows.push(['明細', '日時', '店舗', '提案/採否/信頼度/フィードバック']);
  for (const record of review.records) {
    rows.push([
      '明細',
      record.timestamp,
      record.storeName,
      `${record.domainLabel} / ${record.suggestionTitle} / ${record.decisionLabel} / ${record.confidence === undefined ? '-' : `${record.confidence}%`} / ${record.feedback || record.modifiedAction || '-'}`
    ]);
  }

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildAiSuggestionFeedbackBiExport(
  review: AiSuggestionFeedbackMonthlyReview,
  generatedAt = new Date()
): string {
  const payload: AiSuggestionFeedbackBiExport = {
    type: 'ai-suggestion-feedback-monthly-review',
    schemaVersion: 2,
    generatedAt: generatedAt.toISOString(),
    monthKey: review.monthKey,
    monthLabel: review.monthLabel,
    summary: {
      totalCount: review.totalCount,
      acceptedCount: review.acceptedCount,
      modifiedCount: review.modifiedCount,
      rejectedCount: review.rejectedCount,
      feedbackCount: review.feedbackCount,
      averageConfidence: review.averageConfidence,
      acceptanceRate: review.acceptanceRate,
      correctionRate: review.correctionRate,
      rejectionRate: review.qualityGate.rejectionRate,
      status: review.status,
      statusLabel: review.statusLabel,
      actionLabel: review.actionLabel
    },
    requiredActions: review.requiredActions,
    storeComparison: review.storeComparison,
    domainSummaries: review.domainSummaries,
    soapDraftSummary: review.soapDraftSummary,
    qualityGate: review.qualityGate,
    records: review.records,
    privacy: {
      patientFieldsIncluded: false,
      containsPatientIdentifiers: false,
      sourceLogDetailsIncluded: false
    }
  };

  return JSON.stringify(payload, null, 2);
}
