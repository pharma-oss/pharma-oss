import {
  buildEvidenceIntegrityReview,
  type EvidenceIntegrityReview
} from './evidence_integrity.ts';
import type { AiAssistMode } from '../db/types.ts';

export type AiClinicalReviewStatus = 'pass' | 'attention' | 'blocked';
export type AiClinicalReviewDomain =
  | 'soap_draft'
  | 'prescription_audit'
  | 'claim_risk'
  | 'inventory_risk'
  | 'follow_up'
  | 'other';
export type AiClinicalCaseDecision = 'accepted' | 'modified' | 'rejected';
export type AiClinicalCaseJudgement = 'useful' | 'partly_useful' | 'not_useful' | 'unsafe';
export type AiClinicalImpact = 'none' | 'near_miss' | 'harm';

export interface AiClinicalReviewCaseInput {
  caseId?: string;
  storeId?: string;
  reviewerId?: string;
  domain?: AiClinicalReviewDomain;
  confidence?: number;
  suggestionDecision?: AiClinicalCaseDecision;
  pharmacistJudgement?: AiClinicalCaseJudgement;
  falseSuggestion?: boolean;
  clinicalImpact?: AiClinicalImpact;
  workflowSavedMinutes?: number;
}

export interface AiClinicalReviewTargets {
  minStoreCount: number;
  minCaseCount: number;
  minReviewerCount: number;
  minDomainCount: number;
  minUsefulRatePercent: number;
  maxFalseSuggestionRatePercent: number;
  stopFalseSuggestionRatePercent: number;
  highConfidenceThreshold: number;
  stopHighConfidenceFalseCount: number;
  maxSafetyIssueCount: number;
}

export interface AiClinicalReviewEvidenceInput {
  reviewId?: string;
  capturedAt?: string;
  operatorReviewId?: string;
  sourceArtifactSha256?: string;
  noPatientDataConfirmed?: boolean;
  anonymizedStoreIdsConfirmed?: boolean;
  realClinicalReviewConfirmed?: boolean;
  pharmacistPanelReviewed?: boolean;
  managerReviewCompleted?: boolean;
  qualityGateAttached?: boolean;
  qualityGateModeApplied?: boolean;
  currentAiAssistMode?: AiAssistMode;
  recommendedAiAssistMode?: AiAssistMode;
  targets?: Partial<AiClinicalReviewTargets>;
  cases?: AiClinicalReviewCaseInput[];
}

export interface AiClinicalReviewGate {
  id: string;
  title: string;
  status: AiClinicalReviewStatus;
  statusLabel: string;
  target: string;
  actual: string;
  nextAction: string;
}

export interface AiClinicalDomainSummary {
  domain: AiClinicalReviewDomain;
  domainLabel: string;
  caseCount: number;
  usefulRatePercent: number;
  falseSuggestionRatePercent: number;
  highConfidenceFalseCount: number;
  safetyIssueCount: number;
}

export interface AiClinicalStoreSummary {
  storeId: string;
  caseCount: number;
  usefulRatePercent: number;
  falseSuggestionRatePercent: number;
  highConfidenceFalseCount: number;
  safetyIssueCount: number;
}

export interface AiClinicalReviewSummary {
  caseCount: number;
  storeCount: number;
  reviewerCount: number;
  domainCount: number;
  usefulCount: number;
  usefulRatePercent: number;
  falseSuggestionCount: number;
  falseSuggestionRatePercent: number;
  highConfidenceFalseCount: number;
  safetyIssueCount: number;
  acceptedCount: number;
  modifiedCount: number;
  rejectedCount: number;
  averageConfidence?: number;
  averageWorkflowSavedMinutes?: number;
  missingReviewFieldCount: number;
  missingReviewFieldSamples: string[];
}

export interface AiClinicalReview {
  type: 'yakureki-ai-clinical-review';
  schemaVersion: 1;
  generatedAt: string;
  reviewId: string;
  status: AiClinicalReviewStatus;
  statusLabel: string;
  actionLabel: string;
  targets: AiClinicalReviewTargets;
  summary: AiClinicalReviewSummary;
  stores: AiClinicalStoreSummary[];
  domains: AiClinicalDomainSummary[];
  evidence: {
    noPatientDataConfirmed: boolean;
    anonymizedStoreIdsConfirmed: boolean;
    realClinicalReviewConfirmed: boolean;
    pharmacistPanelReviewed: boolean;
    managerReviewCompleted: boolean;
    qualityGateAttached: boolean;
    qualityGateModeApplied: boolean;
    currentAiAssistMode?: AiAssistMode;
    recommendedAiAssistMode?: AiAssistMode;
  };
  privacy: {
    containsPatientData: false;
    containsStaffNames: false;
    containsFacilityName: false;
    containsRawCaseText: false;
    containsRawAuditDetails: false;
    containsLocalPath: false;
    containsExternalSecrets: false;
  };
  evidenceIntegrity: EvidenceIntegrityReview;
  gates: AiClinicalReviewGate[];
  passedGateCount: number;
  attentionGateCount: number;
  blockedGateCount: number;
  nextActions: string[];
}

export interface AiClinicalReviewEvidenceTemplate {
  type: 'yakureki-ai-clinical-review-evidence-template';
  schemaVersion: 1;
  generatedAt: string;
  reviewId: string;
  guidance: string;
  capturedAt: string;
  operatorReviewId: string;
  sourceArtifactSha256: string;
  noPatientDataConfirmed: false;
  anonymizedStoreIdsConfirmed: false;
  realClinicalReviewConfirmed: false;
  pharmacistPanelReviewed: false;
  managerReviewCompleted: false;
  qualityGateAttached: false;
  qualityGateModeApplied: false;
  currentAiAssistMode: AiAssistMode;
  recommendedAiAssistMode: AiAssistMode;
  targets: AiClinicalReviewTargets;
  cases: Required<AiClinicalReviewCaseInput>[];
  privacy: AiClinicalReview['privacy'];
}

const DEFAULT_TARGETS: AiClinicalReviewTargets = {
  minStoreCount: 2,
  minCaseCount: 30,
  minReviewerCount: 2,
  minDomainCount: 2,
  minUsefulRatePercent: 75,
  maxFalseSuggestionRatePercent: 5,
  stopFalseSuggestionRatePercent: 25,
  highConfidenceThreshold: 80,
  stopHighConfidenceFalseCount: 2,
  maxSafetyIssueCount: 0
};

const PRIVACY_FLAGS = {
  containsPatientData: false,
  containsStaffNames: false,
  containsFacilityName: false,
  containsRawCaseText: false,
  containsRawAuditDetails: false,
  containsLocalPath: false,
  containsExternalSecrets: false
} as const;

const DOMAIN_LABELS: Record<AiClinicalReviewDomain, string> = {
  soap_draft: 'SOAP下書き',
  prescription_audit: '処方監査',
  claim_risk: '返戻リスク',
  inventory_risk: '在庫欠品',
  follow_up: '服薬フォロー',
  other: 'その他'
};

function bool(value: boolean | undefined): boolean {
  return value === true;
}

function finiteNonNegative(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : undefined;
}

function clampPercent(value: unknown): number | undefined {
  const numberValue = finiteNonNegative(value);
  if (numberValue === undefined) return undefined;
  return Math.max(0, Math.min(100, Math.round(numberValue)));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return round1((numerator / denominator) * 100);
}

function statusLabel(status: AiClinicalReviewStatus): string {
  if (status === 'pass') return 'AI症例レビュー OK';
  if (status === 'attention') return 'AI症例レビューを確認';
  return 'AI拡大判断を保留';
}

function actionLabel(status: AiClinicalReviewStatus): string {
  if (status === 'pass') return '標準運用候補';
  if (status === 'attention') return '制限継続';
  return '停止または拡大保留';
}

function mergeTargets(input: Partial<AiClinicalReviewTargets> | undefined): AiClinicalReviewTargets {
  return {
    minStoreCount: finiteNonNegative(input?.minStoreCount) ?? DEFAULT_TARGETS.minStoreCount,
    minCaseCount: finiteNonNegative(input?.minCaseCount) ?? DEFAULT_TARGETS.minCaseCount,
    minReviewerCount: finiteNonNegative(input?.minReviewerCount) ?? DEFAULT_TARGETS.minReviewerCount,
    minDomainCount: finiteNonNegative(input?.minDomainCount) ?? DEFAULT_TARGETS.minDomainCount,
    minUsefulRatePercent: finiteNonNegative(input?.minUsefulRatePercent) ?? DEFAULT_TARGETS.minUsefulRatePercent,
    maxFalseSuggestionRatePercent: finiteNonNegative(input?.maxFalseSuggestionRatePercent) ?? DEFAULT_TARGETS.maxFalseSuggestionRatePercent,
    stopFalseSuggestionRatePercent: finiteNonNegative(input?.stopFalseSuggestionRatePercent) ?? DEFAULT_TARGETS.stopFalseSuggestionRatePercent,
    highConfidenceThreshold: finiteNonNegative(input?.highConfidenceThreshold) ?? DEFAULT_TARGETS.highConfidenceThreshold,
    stopHighConfidenceFalseCount: finiteNonNegative(input?.stopHighConfidenceFalseCount) ?? DEFAULT_TARGETS.stopHighConfidenceFalseCount,
    maxSafetyIssueCount: finiteNonNegative(input?.maxSafetyIssueCount) ?? DEFAULT_TARGETS.maxSafetyIssueCount
  };
}

function normalizeStoreId(value: string | undefined, index: number): string {
  const storeId = String(value || '').trim();
  return storeId || `store_${String(index + 1).padStart(3, '0')}`;
}

function normalizeReviewerId(value: string | undefined, index: number): string {
  const reviewerId = String(value || '').trim();
  return reviewerId || `reviewer_${String(index + 1).padStart(3, '0')}`;
}

function normalizeDomain(value: AiClinicalReviewDomain | undefined): AiClinicalReviewDomain {
  return value && DOMAIN_LABELS[value] ? value : 'other';
}

function isUseful(caseInput: AiClinicalReviewCaseInput): boolean {
  return caseInput.pharmacistJudgement === 'useful' || caseInput.pharmacistJudgement === 'partly_useful';
}

function isFalseSuggestion(caseInput: AiClinicalReviewCaseInput): boolean {
  return bool(caseInput.falseSuggestion) || caseInput.pharmacistJudgement === 'unsafe';
}

function hasSafetyIssue(caseInput: AiClinicalReviewCaseInput): boolean {
  return caseInput.pharmacistJudgement === 'unsafe'
    || caseInput.clinicalImpact === 'near_miss'
    || caseInput.clinicalImpact === 'harm';
}

function missingCaseFields(caseInput: AiClinicalReviewCaseInput): string[] {
  const missing: string[] = [];
  if (!String(caseInput.caseId || '').trim()) missing.push('匿名ケースID');
  if (!String(caseInput.storeId || '').trim()) missing.push('匿名店舗ID');
  if (!String(caseInput.reviewerId || '').trim()) missing.push('匿名レビュー者ID');
  if (!caseInput.domain) missing.push('提案種別');
  if (clampPercent(caseInput.confidence) === undefined) missing.push('信頼度');
  if (!caseInput.suggestionDecision) missing.push('採否');
  if (!caseInput.pharmacistJudgement) missing.push('薬剤師判定');
  if (typeof caseInput.falseSuggestion !== 'boolean') missing.push('誤提案フラグ');
  if (!caseInput.clinicalImpact) missing.push('安全影響');
  return missing;
}

function buildSummary(
  cases: AiClinicalReviewCaseInput[],
  targets: AiClinicalReviewTargets
): AiClinicalReviewSummary {
  const stores = new Set<string>();
  const reviewers = new Set<string>();
  const domains = new Set<AiClinicalReviewDomain>();
  let usefulCount = 0;
  let falseSuggestionCount = 0;
  let highConfidenceFalseCount = 0;
  let safetyIssueCount = 0;
  let acceptedCount = 0;
  let modifiedCount = 0;
  let rejectedCount = 0;
  let confidenceTotal = 0;
  let confidenceCount = 0;
  let savedMinutesTotal = 0;
  let savedMinutesCount = 0;
  let missingReviewFieldCount = 0;
  const missingReviewFieldSamples: string[] = [];

  cases.forEach((caseInput, index) => {
    const storeId = normalizeStoreId(caseInput.storeId, index);
    const reviewerId = normalizeReviewerId(caseInput.reviewerId, index);
    const domain = normalizeDomain(caseInput.domain);
    stores.add(storeId);
    reviewers.add(reviewerId);
    domains.add(domain);
    if (isUseful(caseInput)) usefulCount += 1;
    if (isFalseSuggestion(caseInput)) falseSuggestionCount += 1;
    const confidence = clampPercent(caseInput.confidence);
    if (confidence !== undefined) {
      confidenceTotal += confidence;
      confidenceCount += 1;
      if (confidence >= targets.highConfidenceThreshold && isFalseSuggestion(caseInput)) {
        highConfidenceFalseCount += 1;
      }
    }
    if (hasSafetyIssue(caseInput)) safetyIssueCount += 1;
    if (caseInput.suggestionDecision === 'accepted') acceptedCount += 1;
    if (caseInput.suggestionDecision === 'modified') modifiedCount += 1;
    if (caseInput.suggestionDecision === 'rejected') rejectedCount += 1;
    const savedMinutes = finiteNonNegative(caseInput.workflowSavedMinutes);
    if (savedMinutes !== undefined) {
      savedMinutesTotal += savedMinutes;
      savedMinutesCount += 1;
    }
    const missing = missingCaseFields(caseInput);
    if (missing.length > 0) {
      missingReviewFieldCount += missing.length;
      if (missingReviewFieldSamples.length < 8) {
        missingReviewFieldSamples.push(`${caseInput.caseId || `case_${index + 1}`}:${missing.join('・')}`);
      }
    }
  });

  return {
    caseCount: cases.length,
    storeCount: stores.size,
    reviewerCount: reviewers.size,
    domainCount: domains.size,
    usefulCount,
    usefulRatePercent: rate(usefulCount, cases.length),
    falseSuggestionCount,
    falseSuggestionRatePercent: rate(falseSuggestionCount, cases.length),
    highConfidenceFalseCount,
    safetyIssueCount,
    acceptedCount,
    modifiedCount,
    rejectedCount,
    averageConfidence: confidenceCount > 0 ? Math.round(confidenceTotal / confidenceCount) : undefined,
    averageWorkflowSavedMinutes: savedMinutesCount > 0 ? round1(savedMinutesTotal / savedMinutesCount) : undefined,
    missingReviewFieldCount,
    missingReviewFieldSamples
  };
}

function buildDomainSummaries(
  cases: AiClinicalReviewCaseInput[],
  targets: AiClinicalReviewTargets
): AiClinicalDomainSummary[] {
  const byDomain = new Map<AiClinicalReviewDomain, AiClinicalReviewCaseInput[]>();
  for (const caseInput of cases) {
    const domain = normalizeDomain(caseInput.domain);
    byDomain.set(domain, [...(byDomain.get(domain) || []), caseInput]);
  }
  return Array.from(byDomain.entries())
    .map(([domain, rows]) => ({
      domain,
      domainLabel: DOMAIN_LABELS[domain],
      caseCount: rows.length,
      usefulRatePercent: rate(rows.filter(isUseful).length, rows.length),
      falseSuggestionRatePercent: rate(rows.filter(isFalseSuggestion).length, rows.length),
      highConfidenceFalseCount: rows.filter((row) => (
        (clampPercent(row.confidence) ?? -1) >= targets.highConfidenceThreshold
        && isFalseSuggestion(row)
      )).length,
      safetyIssueCount: rows.filter(hasSafetyIssue).length
    }))
    .sort((a, b) => b.caseCount - a.caseCount || a.domainLabel.localeCompare(b.domainLabel, 'ja'));
}

function buildStoreSummaries(
  cases: AiClinicalReviewCaseInput[],
  targets: AiClinicalReviewTargets
): AiClinicalStoreSummary[] {
  const byStore = new Map<string, AiClinicalReviewCaseInput[]>();
  cases.forEach((caseInput, index) => {
    const storeId = normalizeStoreId(caseInput.storeId, index);
    byStore.set(storeId, [...(byStore.get(storeId) || []), caseInput]);
  });
  return Array.from(byStore.entries())
    .map(([storeId, rows]) => ({
      storeId,
      caseCount: rows.length,
      usefulRatePercent: rate(rows.filter(isUseful).length, rows.length),
      falseSuggestionRatePercent: rate(rows.filter(isFalseSuggestion).length, rows.length),
      highConfidenceFalseCount: rows.filter((row) => (
        (clampPercent(row.confidence) ?? -1) >= targets.highConfidenceThreshold
        && isFalseSuggestion(row)
      )).length,
      safetyIssueCount: rows.filter(hasSafetyIssue).length
    }))
    .sort((a, b) => a.storeId.localeCompare(b.storeId));
}

function makeGate(options: {
  id: string;
  title: string;
  ok: boolean;
  target: string;
  actual: string;
  blocked?: boolean;
  nextAction: string;
}): AiClinicalReviewGate {
  if (options.ok) {
    return {
      id: options.id,
      title: options.title,
      status: 'pass',
      statusLabel: statusLabel('pass'),
      target: options.target,
      actual: options.actual,
      nextAction: '対応不要'
    };
  }
  const status: AiClinicalReviewStatus = options.blocked ? 'blocked' : 'attention';
  return {
    id: options.id,
    title: options.title,
    status,
    statusLabel: statusLabel(status),
    target: options.target,
    actual: options.actual,
    nextAction: options.nextAction
  };
}

function summarizeStatus(gates: AiClinicalReviewGate[]): AiClinicalReviewStatus {
  if (gates.some((gate) => gate.status === 'blocked')) return 'blocked';
  if (gates.some((gate) => gate.status === 'attention')) return 'attention';
  return 'pass';
}

function uniqueActions(gates: AiClinicalReviewGate[]): string[] {
  return Array.from(new Set(
    gates
      .filter((gate) => gate.status !== 'pass')
      .map((gate) => gate.nextAction)
      .filter(Boolean)
  ));
}

function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvLine(values: unknown[]): string {
  return values.map(csvCell).join(',');
}

export function buildAiClinicalReview(input: {
  generatedAt?: Date;
  evidence?: AiClinicalReviewEvidenceInput;
} = {}): AiClinicalReview {
  const generatedAt = input.generatedAt ?? new Date();
  const evidence = input.evidence ?? {};
  const cases = evidence.cases ?? [];
  const targets = mergeTargets(evidence.targets);
  const summary = buildSummary(cases, targets);
  const stores = buildStoreSummaries(cases, targets);
  const domains = buildDomainSummaries(cases, targets);
  const reviewId = String(evidence.reviewId || 'ai-clinical-review').trim();
  const evidenceIntegrity = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: reviewId,
    claimKind: 'ai_clinical_review',
    evidence,
    noPatientDataExpected: true,
    realWorldEvidenceRequired: bool(evidence.realClinicalReviewConfirmed)
  });
  const falseRateBlocks = summary.falseSuggestionRatePercent >= targets.stopFalseSuggestionRatePercent
    && summary.caseCount >= Math.max(10, Math.floor(targets.minCaseCount / 3));
  const highConfidenceBlocks = summary.highConfidenceFalseCount >= targets.stopHighConfidenceFalseCount;
  const safetyBlocks = summary.safetyIssueCount > targets.maxSafetyIssueCount;

  const gates: AiClinicalReviewGate[] = [
    makeGate({
      id: 'privacy',
      title: '患者情報なし・匿名店舗ID',
      ok: bool(evidence.noPatientDataConfirmed) && bool(evidence.anonymizedStoreIdsConfirmed),
      target: '個人を特定できる氏名・ID、職員氏名、店舗の正式名称、症例本文、監査ログ詳細を含めない',
      actual: bool(evidence.noPatientDataConfirmed) && bool(evidence.anonymizedStoreIdsConfirmed) ? '確認済み' : '未確認',
      blocked: true,
      nextAction: '匿名ケースID、匿名店舗ID、集計値だけの症例レビュー証跡へ作り直す'
    }),
    makeGate({
      id: 'real_clinical_review',
      title: '実症例レビュー',
      ok: bool(evidence.realClinicalReviewConfirmed),
      target: 'テスト値ではなく、実店舗または実データ相当の匿名症例レビューを使う',
      actual: bool(evidence.realClinicalReviewConfirmed) ? '実症例レビュー' : '未確認またはテスト値',
      nextAction: '薬剤師が実症例に基づく匿名レビューを記録する'
    }),
    makeGate({
      id: 'evidence_integrity',
      title: '実証跡の出所と安全性',
      ok: evidenceIntegrity.status === 'pass',
      target: '取得日時、匿名の確認記録ID、元資料SHA-256、患者情報なし確認を揃え、ダミー値を使わない',
      actual: `${evidenceIntegrity.statusLabel} / 指摘${evidenceIntegrity.issues.length}件`,
      blocked: evidenceIntegrity.status === 'blocked',
      nextAction: evidenceIntegrity.requiredActions.join(' / ') || '実証跡の出所情報を確認する'
    }),
    makeGate({
      id: 'coverage',
      title: '症例数・店舗数',
      ok: summary.caseCount >= targets.minCaseCount
        && summary.storeCount >= targets.minStoreCount
        && summary.domainCount >= targets.minDomainCount,
      target: `${targets.minCaseCount}症例以上、${targets.minStoreCount}店舗以上、${targets.minDomainCount}種別以上`,
      actual: `${summary.caseCount}症例 / ${summary.storeCount}店舗 / ${summary.domainCount}種別`,
      blocked: true,
      nextAction: '複数店舗、複数提案種別の匿名症例レビューを追加する'
    }),
    makeGate({
      id: 'reviewer_coverage',
      title: '薬剤師レビュー者数',
      ok: summary.reviewerCount >= targets.minReviewerCount,
      target: `匿名レビュー者${targets.minReviewerCount}名以上`,
      actual: `${summary.reviewerCount}名`,
      blocked: true,
      nextAction: '複数の薬剤師で同じ基準の匿名症例レビューを実施する'
    }),
    makeGate({
      id: 'review_completeness',
      title: '症例レビュー項目',
      ok: summary.missingReviewFieldCount === 0,
      target: '匿名ケースID、店舗ID、レビュー者ID、提案種別、信頼度、採否、薬剤師判定、誤提案、安全影響を記録',
      actual: summary.missingReviewFieldCount === 0 ? '欠落なし' : `${summary.missingReviewFieldCount}項目欠落`,
      blocked: true,
      nextAction: `不足項目を補記してください: ${summary.missingReviewFieldSamples.join(' / ') || '症例レビュー項目'}`
    }),
    makeGate({
      id: 'false_suggestion_rate',
      title: '誤提案率',
      ok: summary.falseSuggestionRatePercent <= targets.maxFalseSuggestionRatePercent,
      target: `${targets.maxFalseSuggestionRatePercent}%以下、停止基準${targets.stopFalseSuggestionRatePercent}%未満`,
      actual: `${summary.falseSuggestionRatePercent}% / ${summary.falseSuggestionCount}件`,
      blocked: falseRateBlocks,
      nextAction: falseRateBlocks
        ? 'AI補助を停止し、誤提案の根拠ルールと対象症例を責任者レビューしてください。'
        : '誤提案が多い提案種別を制限し、根拠とルールを見直してください。'
    }),
    makeGate({
      id: 'high_confidence_false',
      title: '高信頼度の誤提案',
      ok: !highConfidenceBlocks,
      target: `信頼度${targets.highConfidenceThreshold}%以上の誤提案${targets.stopHighConfidenceFalseCount}件未満`,
      actual: `${summary.highConfidenceFalseCount}件`,
      blocked: highConfidenceBlocks,
      nextAction: 'AI補助を停止し、高信頼度で誤った候補の根拠と症例を確認してください。'
    }),
    makeGate({
      id: 'safety',
      title: '安全上の問題',
      ok: !safetyBlocks,
      target: `ヒヤリハット・害あり ${targets.maxSafetyIssueCount}件`,
      actual: `${summary.safetyIssueCount}件`,
      blocked: safetyBlocks,
      nextAction: '正式拡大を止め、安全影響のある症例を責任者と薬剤師で再点検してください。'
    }),
    makeGate({
      id: 'usefulness',
      title: '有用性',
      ok: summary.usefulRatePercent >= targets.minUsefulRatePercent,
      target: `${targets.minUsefulRatePercent}%以上が有用または一部有用`,
      actual: `${summary.usefulRatePercent}% / ${summary.usefulCount}件`,
      nextAction: '役に立たない候補の種別を制限し、候補文面と根拠リンクを見直してください。'
    }),
    makeGate({
      id: 'panel_review',
      title: '薬剤師会議・責任者確認',
      ok: bool(evidence.pharmacistPanelReviewed) && bool(evidence.managerReviewCompleted),
      target: '薬剤師会議と責任者レビューを完了',
      actual: [
        bool(evidence.pharmacistPanelReviewed) ? '薬剤師会議済み' : '薬剤師会議なし',
        bool(evidence.managerReviewCompleted) ? '責任者確認済み' : '責任者未確認'
      ].join(' / '),
      nextAction: '症例レビュー結果を薬剤師会議で確認し、責任者が標準・制限・停止を決める'
    }),
    makeGate({
      id: 'monthly_quality_gate',
      title: '月次品質ゲートとの接続',
      ok: bool(evidence.qualityGateAttached) && bool(evidence.qualityGateModeApplied),
      target: '月次品質ゲートを添付し、必要な標準・制限・停止モードを反映',
      actual: [
        bool(evidence.qualityGateAttached) ? '品質ゲートあり' : '品質ゲートなし',
        bool(evidence.qualityGateModeApplied) ? '推奨反映済み' : '推奨未反映',
        evidence.currentAiAssistMode ? `現在${evidence.currentAiAssistMode}` : '現在未記録',
        evidence.recommendedAiAssistMode ? `推奨${evidence.recommendedAiAssistMode}` : '推奨未記録'
      ].join(' / '),
      nextAction: '設定画面のAI補助フィードバック月次レビューと推奨モード反映記録を添付する'
    })
  ];
  const status = summarizeStatus(gates);

  return {
    type: 'yakureki-ai-clinical-review',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    reviewId,
    status,
    statusLabel: statusLabel(status),
    actionLabel: actionLabel(status),
    targets,
    summary,
    stores,
    domains,
    evidence: {
      noPatientDataConfirmed: bool(evidence.noPatientDataConfirmed),
      anonymizedStoreIdsConfirmed: bool(evidence.anonymizedStoreIdsConfirmed),
      realClinicalReviewConfirmed: bool(evidence.realClinicalReviewConfirmed),
      pharmacistPanelReviewed: bool(evidence.pharmacistPanelReviewed),
      managerReviewCompleted: bool(evidence.managerReviewCompleted),
      qualityGateAttached: bool(evidence.qualityGateAttached),
      qualityGateModeApplied: bool(evidence.qualityGateModeApplied),
      currentAiAssistMode: evidence.currentAiAssistMode,
      recommendedAiAssistMode: evidence.recommendedAiAssistMode
    },
    privacy: PRIVACY_FLAGS,
    evidenceIntegrity,
    gates,
    passedGateCount: gates.filter((gate) => gate.status === 'pass').length,
    attentionGateCount: gates.filter((gate) => gate.status === 'attention').length,
    blockedGateCount: gates.filter((gate) => gate.status === 'blocked').length,
    nextActions: uniqueActions(gates)
  };
}

export function buildAiClinicalReviewEvidenceTemplate(input: {
  generatedAt?: Date;
  reviewId?: string;
  targets?: Partial<AiClinicalReviewTargets>;
} = {}): AiClinicalReviewEvidenceTemplate {
  const generatedAt = input.generatedAt ?? new Date();
  const targets = mergeTargets(input.targets);
  return {
    type: 'yakureki-ai-clinical-review-evidence-template',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    reviewId: input.reviewId || 'ai-clinical-review',
    guidance: '個人を特定できる氏名・ID、店舗の正式名称、職員氏名、症例本文、監査ログ詳細、ローカルパス、URL、トークンは入れず、匿名ケースID、匿名店舗ID、匿名レビュー者ID、提案種別、信頼度、採否、薬剤師判定、誤提案、安全影響だけを記録してください。取得日時、匿名確認ID、元資料SHA-256が揃わない場合は実症例レビューとして合格しません。',
    capturedAt: '',
    operatorReviewId: '',
    sourceArtifactSha256: '',
    noPatientDataConfirmed: false,
    anonymizedStoreIdsConfirmed: false,
    realClinicalReviewConfirmed: false,
    pharmacistPanelReviewed: false,
    managerReviewCompleted: false,
    qualityGateAttached: false,
    qualityGateModeApplied: false,
    currentAiAssistMode: 'limited',
    recommendedAiAssistMode: 'limited',
    targets,
    cases: [
      {
        caseId: 'case_001',
        storeId: 'store_001',
        reviewerId: 'reviewer_001',
        domain: 'prescription_audit',
        confidence: 82,
        suggestionDecision: 'modified',
        pharmacistJudgement: 'partly_useful',
        falseSuggestion: false,
        clinicalImpact: 'none',
        workflowSavedMinutes: 1
      }
    ],
    privacy: PRIVACY_FLAGS
  };
}

export function buildAiClinicalReviewCsv(review: AiClinicalReview): string {
  const rows = [
    csvLine(['section', 'scope', 'id', 'label', 'status', 'target', 'actual', 'nextAction']),
    csvLine(['summary', 'all', review.reviewId, '判定', review.statusLabel, `${review.targets.minCaseCount}症例/${review.targets.minStoreCount}店舗`, `${review.summary.caseCount}症例/${review.summary.storeCount}店舗`, review.nextActions.join(' / ') || '対応不要']),
    csvLine(['summary', 'all', 'usefulness', '有用性', review.statusLabel, `${review.targets.minUsefulRatePercent}%以上`, `${review.summary.usefulRatePercent}%`, '']),
    csvLine(['summary', 'all', 'false_suggestion_rate', '誤提案率', review.statusLabel, `${review.targets.maxFalseSuggestionRatePercent}%以下`, `${review.summary.falseSuggestionRatePercent}%`, '']),
    csvLine(['summary', 'all', 'high_confidence_false', '高信頼度誤提案', review.statusLabel, `${review.targets.stopHighConfidenceFalseCount}件未満`, `${review.summary.highConfidenceFalseCount}件`, '']),
    csvLine(['summary', 'all', 'safety', '安全上の問題', review.statusLabel, `${review.targets.maxSafetyIssueCount}件`, `${review.summary.safetyIssueCount}件`, ''])
  ];

  for (const domain of review.domains) {
    rows.push(csvLine([
      'domain',
      domain.domain,
      'quality',
      domain.domainLabel,
      review.statusLabel,
      `${review.targets.maxFalseSuggestionRatePercent}%以下`,
      `${domain.caseCount}症例 / 有用${domain.usefulRatePercent}% / 誤提案${domain.falseSuggestionRatePercent}% / 高信頼度誤り${domain.highConfidenceFalseCount}件`,
      domain.safetyIssueCount > 0 ? '安全影響症例を責任者レビューへ回す' : ''
    ]));
  }

  for (const store of review.stores) {
    rows.push(csvLine([
      'store',
      store.storeId,
      'quality',
      '店舗別AI症例レビュー',
      review.statusLabel,
      `${review.targets.maxFalseSuggestionRatePercent}%以下`,
      `${store.caseCount}症例 / 有用${store.usefulRatePercent}% / 誤提案${store.falseSuggestionRatePercent}% / 高信頼度誤り${store.highConfidenceFalseCount}件`,
      store.safetyIssueCount > 0 ? '安全影響症例を責任者レビューへ回す' : ''
    ]));
  }

  for (const gate of review.gates) {
    rows.push(csvLine(['gate', 'all', gate.id, gate.title, gate.statusLabel, gate.target, gate.actual, gate.nextAction]));
  }

  return rows.join('\n');
}

export function buildAiClinicalReviewChecklist(review: AiClinicalReview): string {
  const lines = [
    `AI症例レビュー: ${review.statusLabel}`,
    `対象: ${review.reviewId}`,
    `範囲: ${review.summary.caseCount}症例 / ${review.summary.storeCount}店舗 / ${review.summary.reviewerCount}名 / ${review.summary.domainCount}種別`,
    '',
    '見る指標:',
    `- 有用性: ${review.summary.usefulRatePercent}% (${review.targets.minUsefulRatePercent}%以上)`,
    `- 誤提案率: ${review.summary.falseSuggestionRatePercent}% (${review.targets.maxFalseSuggestionRatePercent}%以下)`,
    `- 高信頼度の誤提案: ${review.summary.highConfidenceFalseCount}件 (${review.targets.stopHighConfidenceFalseCount}件未満)`,
    `- 安全上の問題: ${review.summary.safetyIssueCount}件 (${review.targets.maxSafetyIssueCount}件)`,
    `- 平均信頼度: ${review.summary.averageConfidence === undefined ? '-' : `${review.summary.averageConfidence}%`}`,
    '',
    '提案種別別:',
    ...(review.domains.length > 0
      ? review.domains.map((domain) => `- ${domain.domainLabel}: ${domain.caseCount}症例 / 有用${domain.usefulRatePercent}% / 誤提案${domain.falseSuggestionRatePercent}% / 安全${domain.safetyIssueCount}件`)
      : ['- 未記録']),
    '',
    '次の対応:',
    ...(review.nextActions.length > 0 ? review.nextActions.map((action) => `- ${action}`) : ['- 対応不要']),
    '',
    'ゲート:',
    ...review.gates.map((gate) => `- [${gate.statusLabel}] ${gate.title}: ${gate.actual}`)
  ];
  return lines.join('\n');
}

export function buildAiClinicalReviewAuditDetail(review: AiClinicalReview): string {
  return [
    `AI症例レビュー: ${review.reviewId}`,
    `判定 ${review.statusLabel}`,
    `症例 ${review.summary.caseCount}件`,
    `店舗 ${review.summary.storeCount}件`,
    `有用性 ${review.summary.usefulRatePercent}%`,
    `誤提案率 ${review.summary.falseSuggestionRatePercent}%`,
    `高信頼度誤提案 ${review.summary.highConfidenceFalseCount}件`,
    `安全上の問題 ${review.summary.safetyIssueCount}件`,
    `品質ゲート ${review.evidence.qualityGateAttached ? '添付あり' : '未添付'}`,
    `次対応 ${review.nextActions.slice(0, 3).join(' / ') || '対応不要'}`
  ].join(' / ');
}

export interface AiClinicalReviewCheckRequestItem {
  id: string;
  title: string;
  required: boolean;
  neededFields: string[];
  purpose: string;
  storeOnly: string;
  supportShare: string;
}

export interface AiClinicalReviewCheckRequest {
  type: 'yakureki-ai-clinical-review-check-request';
  schemaVersion: 1;
  generatedAt: string;
  reviewId: string;
  guidance: string;
  items: AiClinicalReviewCheckRequestItem[];
  operatorChecks: string[];
  privacyRules: string[];
  commandEnvironment: {
    evidenceJson: 'YAKUREKI_AI_CLINICAL_REVIEW_EVIDENCE';
    outputDir: 'YAKUREKI_AI_CLINICAL_REVIEW_OUTPUT_DIR';
    reviewId: 'YAKUREKI_AI_CLINICAL_REVIEW_ID';
  };
}

export function buildAiClinicalReviewCheckRequest(input: {
  generatedAt?: Date;
  reviewId?: string;
} = {}): AiClinicalReviewCheckRequest {
  const generatedAt = input.generatedAt ?? new Date();
  return {
    type: 'yakureki-ai-clinical-review-check-request',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    reviewId: input.reviewId || 'ai-clinical-review',
    guidance: 'AI症例レビューを提出する前に、以下を院内で準備してください。個人を特定できる氏名・ID、店舗の正式名称、職員氏名、症例本文、監査ログ詳細、ローカルパス、URL、トークンは含めないでください。',
    items: [
      {
        id: 'privacy_and_real_review',
        title: '匿名化と実症例レビューの確認',
        required: true,
        neededFields: ['noPatientDataConfirmed', 'anonymizedStoreIdsConfirmed', 'realClinicalReviewConfirmed'],
        purpose: '患者情報を含まないこと、店舗IDが匿名化されていること、テスト値ではなく実店舗または実データ相当のレビューであることを確認する',
        storeOnly: '患者氏名、店舗の正式名称、症例本文',
        supportShare: '各項目の確認済み/未確認のみ'
      },
      {
        id: 'case_coverage',
        title: '症例数・店舗数・レビュー者数と項目網羅',
        required: true,
        neededFields: ['cases[].caseId', 'cases[].storeId', 'cases[].reviewerId', 'cases[].domain', 'cases[].confidence', 'cases[].suggestionDecision', 'cases[].pharmacistJudgement', 'cases[].falseSuggestion', 'cases[].clinicalImpact', 'cases[].workflowSavedMinutes'],
        purpose: '複数店舗・複数レビュー者・複数提案種別にわたる匿名症例レビューが、欠落項目なく揃っているかを確認する',
        storeOnly: '症例本文、患者・処方内容',
        supportShare: '症例数、店舗数、レビュー者数、種別数の集計値のみ'
      },
      {
        id: 'safety_and_accuracy',
        title: '誤提案率・高信頼度誤り・安全上の問題・有用性',
        required: true,
        neededFields: ['cases[].falseSuggestion', 'cases[].confidence', 'cases[].clinicalImpact', 'cases[].pharmacistJudgement'],
        purpose: '誤提案率、高信頼度の誤提案件数、ヒヤリハット・害あり件数、有用と判定された割合を集計値として確認する',
        storeOnly: '個別症例の詳細内容',
        supportShare: '誤提案率、高信頼度誤り件数、安全上の問題件数、有用性割合の集計値のみ'
      },
      {
        id: 'governance_review',
        title: '薬剤師会議・責任者確認・月次品質ゲート',
        required: true,
        neededFields: ['pharmacistPanelReviewed', 'managerReviewCompleted', 'qualityGateAttached', 'qualityGateModeApplied', 'currentAiAssistMode', 'recommendedAiAssistMode'],
        purpose: '薬剤師会議と責任者レビューが完了し、月次品質ゲートの推奨モード（標準・制限・停止）が反映されているかを確認する',
        storeOnly: '会議議事録、責任者氏名',
        supportShare: '各確認項目の合否と現在/推奨のAI補助モードのみ'
      }
    ],
    operatorChecks: [
      '患者氏名、患者番号、症例本文、店舗の正式名称、職員氏名を記録に残さない',
      '症例は匿名ケースID、匿名店舗ID、匿名レビュー者IDだけで管理する',
      '確認記録には取得日時、匿名の確認記録ID、元資料SHA-256を残す'
    ],
    privacyRules: [
      '店舗内だけで扱う: 症例本文、患者・処方内容、会議議事録、責任者氏名',
      'サポートへ共有してよい: 各ゲートの合否、症例数・店舗数・誤提案率・安全上の問題件数などの集計値'
    ],
    commandEnvironment: {
      evidenceJson: 'YAKUREKI_AI_CLINICAL_REVIEW_EVIDENCE',
      outputDir: 'YAKUREKI_AI_CLINICAL_REVIEW_OUTPUT_DIR',
      reviewId: 'YAKUREKI_AI_CLINICAL_REVIEW_ID'
    }
  };
}

export function buildAiClinicalReviewCheckRequestChecklist(request: AiClinicalReviewCheckRequest): string {
  const lines = [
    'AI症例レビュー 証跡提出依頼',
    `対象: ${request.reviewId}`,
    `作成日時: ${request.generatedAt}`,
    '',
    request.guidance,
    ''
  ];
  for (const item of request.items) {
    lines.push(`[${item.required ? '必須' : '任意'}] ${item.title}`);
    lines.push(`  目的: ${item.purpose}`);
    lines.push(`  必要項目: ${item.neededFields.join(', ')}`);
    lines.push(`  院内だけで扱う: ${item.storeOnly}`);
    lines.push(`  サポートへ共有してよい: ${item.supportShare}`);
    lines.push('');
  }
  lines.push('確認事項:');
  for (const check of request.operatorChecks) lines.push(`  - ${check}`);
  lines.push('');
  lines.push('取扱いルール:');
  for (const rule of request.privacyRules) lines.push(`  - ${rule}`);
  return lines.join('\n');
}
