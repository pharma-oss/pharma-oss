import {
  buildEvidenceIntegrityReview,
  type EvidenceIntegrityReview
} from './evidence_integrity.ts';
import type { OfficialDrugLabelQueueEntry } from './official_drug_label_queue_review.ts';

export type OfficialDrugLabelNoCandidateReviewStatus = 'pass' | 'attention' | 'blocked';

export interface OfficialDrugLabelNoCandidateEvidenceInput {
  capturedAt?: string;
  operatorReviewId?: string;
  sourceArtifactSha256?: string;
  noPatientDataConfirmed?: boolean;
  officialProcedureConfirmed?: boolean;
  pmdaGeneralListRechecked?: boolean;
  localMasterCandidatesReviewed?: boolean;
  alternativeSourceSearchCompleted?: boolean;
  noOfficialLabelFoundClosureApproved?: boolean;
  ownerReviewCompleted?: boolean;
}

export interface OfficialDrugLabelNoCandidateSample {
  ingredient: string;
  productCount: number;
  representativeDrugName: string;
  representativeDocumentUrlRecorded: boolean;
  lastAttemptAt?: string;
}

export interface OfficialDrugLabelNoCandidateGate {
  id:
    | 'no_candidate_scope'
    | 'evidence_integrity'
    | 'pmda_search_recheck'
    | 'local_candidate_review'
    | 'closure_approval'
    | 'owner_review';
  title: string;
  status: OfficialDrugLabelNoCandidateReviewStatus;
  statusLabel: string;
  target: string;
  actual: string;
  nextAction: string;
}

export interface OfficialDrugLabelNoCandidateReview {
  type: 'yakureki-official-drug-label-no-candidate-review';
  schemaVersion: 1;
  generatedAt: string;
  status: OfficialDrugLabelNoCandidateReviewStatus;
  statusLabel: string;
  actionLabel: string;
  readyForNoOfficialLabelFoundClosure: boolean;
  candidateCount: number;
  totalProductCount: number;
  highProductCountCandidateCount: number;
  missingRepresentativeDocumentUrlCount: number;
  latestAttemptAt?: string;
  oldestAttemptAt?: string;
  samples: OfficialDrugLabelNoCandidateSample[];
  evidence: {
    capturedAt: string;
    operatorReviewId: string;
    sourceArtifactSha256: string;
    noPatientDataConfirmed: boolean;
    officialProcedureConfirmed: boolean;
    pmdaGeneralListRechecked: boolean;
    localMasterCandidatesReviewed: boolean;
    alternativeSourceSearchCompleted: boolean;
    noOfficialLabelFoundClosureApproved: boolean;
    ownerReviewCompleted: boolean;
  };
  evidenceIntegrity: EvidenceIntegrityReview;
  privacy: {
    containsPatientData: false;
    containsRawPmdaHtml: false;
    containsLocalPath: false;
    containsCredential: false;
  };
  gates: OfficialDrugLabelNoCandidateGate[];
  passedGateCount: number;
  attentionGateCount: number;
  blockedGateCount: number;
  nextActions: string[];
}

export interface OfficialDrugLabelNoCandidateEvidenceTemplate {
  type: 'yakureki-official-drug-label-no-candidate-evidence-template';
  schemaVersion: 1;
  generatedAt: string;
  guidance: string;
  capturedAt: string;
  operatorReviewId: string;
  sourceArtifactSha256: string;
  noPatientDataConfirmed: false;
  officialProcedureConfirmed: false;
  pmdaGeneralListRechecked: false;
  localMasterCandidatesReviewed: false;
  alternativeSourceSearchCompleted: false;
  noOfficialLabelFoundClosureApproved: false;
  ownerReviewCompleted: false;
}

const PRIVACY_FLAGS = {
  containsPatientData: false,
  containsRawPmdaHtml: false,
  containsLocalPath: false,
  containsCredential: false
} as const;

function bool(value: boolean | undefined): boolean {
  return value === true;
}

function statusLabel(status: OfficialDrugLabelNoCandidateReviewStatus): string {
  if (status === 'pass') return 'PMDA候補なし確認OK';
  if (status === 'attention') return 'PMDA候補なしを確認';
  return 'PMDA候補なし確認を保留';
}

function actionLabel(status: OfficialDrugLabelNoCandidateReviewStatus): string {
  if (status === 'pass') return 'no_official_label_foundとして閉じる候補にできる';
  if (status === 'attention') return '確認記録を補って閉じる判断';
  return '候補なし確認と責任者承認が完了するまで閉じない';
}

function gate(options: {
  id: OfficialDrugLabelNoCandidateGate['id'];
  title: string;
  status: OfficialDrugLabelNoCandidateReviewStatus;
  target: string;
  actual: string;
  nextAction: string;
}): OfficialDrugLabelNoCandidateGate {
  return {
    ...options,
    statusLabel: statusLabel(options.status)
  };
}

function summarizeStatus(gates: OfficialDrugLabelNoCandidateGate[]): OfficialDrugLabelNoCandidateReviewStatus {
  if (gates.some((item) => item.status === 'blocked')) return 'blocked';
  if (gates.some((item) => item.status === 'attention')) return 'attention';
  return 'pass';
}

function uniqueActions(gates: OfficialDrugLabelNoCandidateGate[]): string[] {
  return Array.from(new Set(
    gates
      .filter((item) => item.status !== 'pass')
      .map((item) => item.nextAction)
      .filter(Boolean)
  ));
}

function isNoCandidateError(error: unknown): boolean {
  return String(error || '').includes('添付文書候補が見つかりません');
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function latestIso(values: string[]): string | undefined {
  const sorted = values
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return sorted[0];
}

function oldestIso(values: string[]): string | undefined {
  const sorted = values
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return sorted[0];
}

export function collectOfficialDrugLabelNoCandidateEntries(
  queueEntries: OfficialDrugLabelQueueEntry[]
): OfficialDrugLabelQueueEntry[] {
  return queueEntries.filter((entry) => entry.status === 'fetch_error' && isNoCandidateError(entry.error));
}

function sampleNoCandidateEntries(entries: OfficialDrugLabelQueueEntry[]): OfficialDrugLabelNoCandidateSample[] {
  return [...entries]
    .sort((a, b) => (b.productCount || 0) - (a.productCount || 0) || a.ingredient.localeCompare(b.ingredient))
    .slice(0, 12)
    .map((entry) => ({
      ingredient: entry.ingredient,
      productCount: entry.productCount || 0,
      representativeDrugName: normalizeText((entry as { representativeDrugName?: string }).representativeDrugName),
      representativeDocumentUrlRecorded: Boolean(normalizeText((entry as { representativeDocumentUrl?: string }).representativeDocumentUrl)),
      ...(normalizeText((entry as { lastAttemptAt?: string }).lastAttemptAt)
        ? { lastAttemptAt: normalizeText((entry as { lastAttemptAt?: string }).lastAttemptAt) }
        : {})
    }));
}

export function buildOfficialDrugLabelNoCandidateReview(input: {
  generatedAt?: Date;
  noCandidateEntries: OfficialDrugLabelQueueEntry[];
  evidence?: OfficialDrugLabelNoCandidateEvidenceInput;
}): OfficialDrugLabelNoCandidateReview {
  const generatedAt = input.generatedAt ?? new Date();
  const evidence = input.evidence ?? {};
  const noCandidateEntries = input.noCandidateEntries;
  const candidateCount = noCandidateEntries.length;
  const productCounts = noCandidateEntries.map((entry) => entry.productCount || 0);
  const totalProductCount = productCounts.reduce((sum, count) => sum + count, 0);
  const highProductCountCandidateCount = noCandidateEntries.filter((entry) => (entry.productCount || 0) >= 5).length;
  const missingRepresentativeDocumentUrlCount = noCandidateEntries
    .filter((entry) => !normalizeText((entry as { representativeDocumentUrl?: string }).representativeDocumentUrl))
    .length;
  const attemptTimes = noCandidateEntries
    .map((entry) => normalizeText((entry as { lastAttemptAt?: string }).lastAttemptAt))
    .filter(Boolean);
  const normalizedEvidence = {
    capturedAt: normalizeText(evidence.capturedAt),
    operatorReviewId: normalizeText(evidence.operatorReviewId),
    sourceArtifactSha256: normalizeText(evidence.sourceArtifactSha256),
    noPatientDataConfirmed: bool(evidence.noPatientDataConfirmed),
    officialProcedureConfirmed: bool(evidence.officialProcedureConfirmed),
    pmdaGeneralListRechecked: bool(evidence.pmdaGeneralListRechecked),
    localMasterCandidatesReviewed: bool(evidence.localMasterCandidatesReviewed),
    alternativeSourceSearchCompleted: bool(evidence.alternativeSourceSearchCompleted),
    noOfficialLabelFoundClosureApproved: bool(evidence.noOfficialLabelFoundClosureApproved),
    ownerReviewCompleted: bool(evidence.ownerReviewCompleted)
  };
  const evidenceIntegrity = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: normalizedEvidence.operatorReviewId || 'official-drug-label-no-candidate-review',
    claimKind: 'official_drug_label_no_candidate_review',
    evidence: normalizedEvidence,
    noPatientDataExpected: true,
    realWorldEvidenceRequired: candidateCount > 0
  });

  const noCandidateScopePass = candidateCount === 0 || missingRepresentativeDocumentUrlCount === 0;
  const gates: OfficialDrugLabelNoCandidateGate[] = [
    gate({
      id: 'no_candidate_scope',
      title: '候補なし対象',
      status: noCandidateScopePass ? 'pass' : 'blocked',
      target: 'PMDA候補なし対象の代表文書URLと対象件数を確認できる',
      actual: `${candidateCount}件 / 対象品目${totalProductCount}件 / 代表文書URL不足${missingRepresentativeDocumentUrlCount}件`,
      nextAction: noCandidateScopePass
        ? '対応不要'
        : '代表文書URLがない候補なしエントリをキュー生成元から確認する'
    }),
    gate({
      id: 'evidence_integrity',
      title: '証跡の出所と安全性',
      status: candidateCount === 0 ? 'pass' : evidenceIntegrity.status,
      target: '確認日時、匿名確認ID、元資料SHA-256、患者情報なし確認を揃える',
      actual: candidateCount === 0 ? '対象なし' : `${evidenceIntegrity.statusLabel} / 指摘${evidenceIntegrity.issues.length}件`,
      nextAction: candidateCount === 0 ? '対応不要' : evidenceIntegrity.requiredActions.join(' / ') || '対応不要'
    }),
    gate({
      id: 'pmda_search_recheck',
      title: 'PMDA検索の再確認',
      status: candidateCount === 0 || normalizedEvidence.pmdaGeneralListRechecked ? 'pass' : 'blocked',
      target: 'PMDA GeneralListと添付文書候補なしを人が再確認する',
      actual: normalizedEvidence.pmdaGeneralListRechecked ? '確認済み' : '未確認',
      nextAction: normalizedEvidence.pmdaGeneralListRechecked
        ? '対応不要'
        : 'PMDA GeneralListの候補なしを人が再確認し、確認IDを残す'
    }),
    gate({
      id: 'local_candidate_review',
      title: '代替候補の確認',
      status: candidateCount === 0 || (
        normalizedEvidence.localMasterCandidatesReviewed
        && normalizedEvidence.alternativeSourceSearchCompleted
      ) ? 'pass' : 'blocked',
      target: 'ローカル医薬品マスター候補と代替PMDA検索候補を確認する',
      actual: `ローカル候補 ${normalizedEvidence.localMasterCandidatesReviewed ? '確認済み' : '未確認'} / 代替検索 ${normalizedEvidence.alternativeSourceSearchCompleted ? '確認済み' : '未確認'}`,
      nextAction: normalizedEvidence.localMasterCandidatesReviewed && normalizedEvidence.alternativeSourceSearchCompleted
        ? '対応不要'
        : '代表品目名、一般名、YJコードから代替PMDA候補がないか確認する'
    }),
    gate({
      id: 'closure_approval',
      title: '候補なしとして閉じる承認',
      status: candidateCount === 0 || normalizedEvidence.noOfficialLabelFoundClosureApproved ? 'pass' : 'blocked',
      target: 'doneではなくno_official_label_foundとして閉じる判断を明示する',
      actual: normalizedEvidence.noOfficialLabelFoundClosureApproved ? '承認済み' : '未承認',
      nextAction: normalizedEvidence.noOfficialLabelFoundClosureApproved
        ? '対応不要'
        : 'PMDA候補なしのまま閉じてよいかを承認する'
    }),
    gate({
      id: 'owner_review',
      title: '責任者レビュー',
      status: candidateCount === 0 || normalizedEvidence.ownerReviewCompleted ? 'pass' : 'blocked',
      target: '薬剤安全・マスター更新責任者が候補なし判断を確認する',
      actual: normalizedEvidence.ownerReviewCompleted ? '確認済み' : '未確認',
      nextAction: normalizedEvidence.ownerReviewCompleted
        ? '対応不要'
        : '責任者が候補なし判断と次回再確認タイミングを確認する'
    })
  ];
  const status = summarizeStatus(gates);
  const nextActions = uniqueActions(gates);

  return {
    type: 'yakureki-official-drug-label-no-candidate-review',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    status,
    statusLabel: statusLabel(status),
    actionLabel: actionLabel(status),
    readyForNoOfficialLabelFoundClosure: status === 'pass',
    candidateCount,
    totalProductCount,
    highProductCountCandidateCount,
    missingRepresentativeDocumentUrlCount,
    ...(latestIso(attemptTimes) ? { latestAttemptAt: latestIso(attemptTimes) } : {}),
    ...(oldestIso(attemptTimes) ? { oldestAttemptAt: oldestIso(attemptTimes) } : {}),
    samples: sampleNoCandidateEntries(noCandidateEntries),
    evidence: normalizedEvidence,
    evidenceIntegrity,
    privacy: PRIVACY_FLAGS,
    gates,
    passedGateCount: gates.filter((item) => item.status === 'pass').length,
    attentionGateCount: gates.filter((item) => item.status === 'attention').length,
    blockedGateCount: gates.filter((item) => item.status === 'blocked').length,
    nextActions: nextActions.length > 0 ? nextActions : ['対応不要']
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildOfficialDrugLabelNoCandidateReviewCsv(review: OfficialDrugLabelNoCandidateReview): string {
  const rows = [
    ['区分', '判定', '項目', '実績', '次の対応'],
    [
      '総括',
      review.statusLabel,
      'PMDA候補なしレビュー',
      `${review.actionLabel} / 候補なし${review.candidateCount}件 / 対象品目${review.totalProductCount}件 / 影響大${review.highProductCountCandidateCount}件`,
      review.nextActions[0] ?? '対応不要'
    ],
    ...review.gates.map((gateItem) => [
      'ゲート',
      gateItem.statusLabel,
      gateItem.title,
      gateItem.actual,
      gateItem.nextAction
    ]),
    ...review.samples.map((sample) => [
      'サンプル',
      review.statusLabel,
      sample.ingredient,
      `品目${sample.productCount}件 / 代表 ${sample.representativeDrugName || '未記録'} / URL ${sample.representativeDocumentUrlRecorded ? 'あり' : 'なし'}`,
      'PMDA候補なしの人確認対象'
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildOfficialDrugLabelNoCandidateChecklist(review: OfficialDrugLabelNoCandidateReview): string {
  return [
    '# PMDA検索候補なしレビュー',
    '',
    `- 判定: ${review.statusLabel}`,
    `- no_official_label_found閉じ候補: ${review.readyForNoOfficialLabelFoundClosure ? 'OK' : '保留'}`,
    `- 候補なし: ${review.candidateCount}件 / 対象品目 ${review.totalProductCount}件 / 5品目以上 ${review.highProductCountCandidateCount}件`,
    `- 代表文書URL不足: ${review.missingRepresentativeDocumentUrlCount}件`,
    `- 試行期間: ${review.oldestAttemptAt || '未記録'} - ${review.latestAttemptAt || '未記録'}`,
    '',
    '## ゲート',
    ...review.gates.map((gateItem) => `- [${gateItem.status === 'pass' ? 'x' : ' '}] ${gateItem.title}: ${gateItem.actual}`),
    '',
    '## 上位サンプル',
    ...review.samples.map((sample) => `- ${sample.ingredient}: ${sample.productCount}品目 / 代表 ${sample.representativeDrugName || '未記録'} / URL ${sample.representativeDocumentUrlRecorded ? 'あり' : 'なし'}`),
    '',
    '## 次の対応',
    ...review.nextActions.map((action) => `- ${action}`),
    '',
    '## 成果物に入れないもの',
    '- 患者名、患者ID、生年月日、保険番号',
    '- PMDA HTML本文',
    '- ローカル絶対パス',
    '- 認証情報やトークン'
  ].join('\n');
}

export function buildOfficialDrugLabelNoCandidateEvidenceTemplate(input: {
  generatedAt?: Date;
} = {}): OfficialDrugLabelNoCandidateEvidenceTemplate {
  const generatedAt = input.generatedAt ?? new Date();
  return {
    type: 'yakureki-official-drug-label-no-candidate-evidence-template',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    guidance: 'PMDA候補なし160件などを、doneではなくno_official_label_foundとして閉じてよいか確認するための患者情報なし証跡です。PMDA HTML本文、ローカルパス、患者情報、認証情報は入れないでください。',
    capturedAt: '',
    operatorReviewId: '',
    sourceArtifactSha256: '',
    noPatientDataConfirmed: false,
    officialProcedureConfirmed: false,
    pmdaGeneralListRechecked: false,
    localMasterCandidatesReviewed: false,
    alternativeSourceSearchCompleted: false,
    noOfficialLabelFoundClosureApproved: false,
    ownerReviewCompleted: false
  };
}
