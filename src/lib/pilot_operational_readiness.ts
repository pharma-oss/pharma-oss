import {
  buildEvidenceIntegrityReview,
  type EvidenceIntegrityReview
} from './evidence_integrity.ts';
import type { AiClinicalReview } from './ai_clinical_review.ts';
import type { ElectronicPrescriptionFieldReadinessReport } from './electronic_prescription_field_readiness.ts';
import type { MigrationTrialAcceptanceReview } from './migration_trial_acceptance.ts';
import type { OnlineEligibilityFieldReadinessReport } from './online_eligibility_field_readiness.ts';
import type { PilotKpiReview } from './pilot_kpi_review.ts';
import type { PrintMediaFieldVerificationReview } from './print_media_field_verification.ts';
import type { ReleaseOpsAcceptanceReview } from './release_ops_acceptance.ts';

export type PilotOperationalReadinessStatus = 'pass' | 'attention' | 'blocked';

export interface PilotOperationalReadinessTargets {
  minPilotStoreCount: number;
  minPilotWeekCount: number;
  requireMigrationAcceptance: boolean;
  requirePrintFieldVerification: boolean;
  requireAiClinicalReview: boolean;
  requireOnlineEligibilityReadiness: boolean;
  requireElectronicPrescriptionReadiness: boolean;
}

export interface PilotOperationalReadinessEvidenceInput {
  readinessId?: string;
  capturedAt?: string;
  operatorReviewId?: string;
  sourceArtifactSha256?: string;
  noPatientDataConfirmed?: boolean;
  realPilotDecisionConfirmed?: boolean;
  ownerReviewCompleted?: boolean;
  rolloutStopRuleConfirmed?: boolean;
  supportHandoffCompleted?: boolean;
  targets?: Partial<PilotOperationalReadinessTargets>;
  pilotKpiReview?: PilotKpiReview;
  releaseOpsAcceptance?: ReleaseOpsAcceptanceReview;
  migrationAcceptance?: MigrationTrialAcceptanceReview;
  printFieldVerification?: PrintMediaFieldVerificationReview;
  aiClinicalReview?: AiClinicalReview;
  onlineEligibilityFieldReadiness?: OnlineEligibilityFieldReadinessReport;
  electronicPrescriptionFieldReadiness?: ElectronicPrescriptionFieldReadinessReport;
}

export interface PilotOperationalReadinessGate {
  id: string;
  title: string;
  status: PilotOperationalReadinessStatus;
  statusLabel: string;
  target: string;
  actual: string;
  nextAction: string;
}

export interface PilotOperationalReadinessArtifactSummary {
  id: string;
  title: string;
  required: boolean;
  attached: boolean;
  status: PilotOperationalReadinessStatus;
  statusLabel: string;
  evidenceIntegrityStatus?: PilotOperationalReadinessStatus;
  evidenceIntegrityIssueCount?: number;
  blockedGateCount?: number;
  attentionGateCount?: number;
  privacyClear: boolean;
  nextAction: string;
}

export interface PilotOperationalReadinessReview {
  type: 'yakureki-pilot-operational-readiness';
  schemaVersion: 2;
  generatedAt: string;
  readinessId: string;
  status: PilotOperationalReadinessStatus;
  statusLabel: string;
  actionLabel: string;
  targets: PilotOperationalReadinessTargets;
  evidence: {
    noPatientDataConfirmed: boolean;
    realPilotDecisionConfirmed: boolean;
    ownerReviewCompleted: boolean;
    rolloutStopRuleConfirmed: boolean;
    supportHandoffCompleted: boolean;
  };
  pilot: {
    storeCount: number;
    weekCount: number;
    trendStatusLabel?: string;
    claimReturnRatePercent?: number;
    averageHandlingMinutes?: number;
    followUpOnTimeRatePercent?: number;
    criticalIncidentCount?: number;
    unrecoveredIncidentCount?: number;
  };
  privacy: {
    containsPatientData: false;
    containsStaffNames: false;
    containsFacilityName: false;
    containsRawAuditDetails: false;
    containsRawSupportText: false;
    containsLocalPath: false;
    containsExternalSecrets: false;
  };
  evidenceIntegrity: EvidenceIntegrityReview;
  artifacts: PilotOperationalReadinessArtifactSummary[];
  gates: PilotOperationalReadinessGate[];
  passedGateCount: number;
  attentionGateCount: number;
  blockedGateCount: number;
  nextActions: string[];
}

export interface PilotOperationalReadinessEvidenceTemplate {
  type: 'yakureki-pilot-operational-readiness-evidence-template';
  schemaVersion: 2;
  generatedAt: string;
  readinessId: string;
  guidance: string;
  capturedAt: string;
  operatorReviewId: string;
  sourceArtifactSha256: string;
  noPatientDataConfirmed: false;
  realPilotDecisionConfirmed: false;
  ownerReviewCompleted: false;
  rolloutStopRuleConfirmed: false;
  supportHandoffCompleted: false;
  targets: PilotOperationalReadinessTargets;
  artifactEnvironmentVariables: Record<string, string>;
  privacy: PilotOperationalReadinessReview['privacy'];
}

export interface PilotOperationalReadinessRequestItem {
  id:
    | 'pilot_kpi_review'
    | 'release_ops_acceptance'
    | 'migration_acceptance'
    | 'print_field_verification'
    | 'ai_clinical_review'
    | 'online_eligibility_field_readiness'
    | 'electronic_prescription_field_readiness'
    | 'owner_decision';
  title: string;
  required: boolean;
  environmentVariable?: string;
  sourceCommand: string;
  neededFields: string[];
  purpose: string;
  storeOnly: string;
  supportShare: string;
}

export interface PilotOperationalReadinessRequest {
  type: 'yakureki-pilot-operational-readiness-request';
  schemaVersion: 1;
  generatedAt: string;
  readinessId: string;
  guidance: string;
  targets: PilotOperationalReadinessTargets;
  items: PilotOperationalReadinessRequestItem[];
  operatorChecks: string[];
  privacyRules: string[];
  commandEnvironment: {
    evidenceJson: 'YAKUREKI_PILOT_OPERATIONAL_READINESS_EVIDENCE';
    outputDir: 'YAKUREKI_PILOT_OPERATIONAL_READINESS_OUTPUT_DIR';
    readinessId: 'YAKUREKI_PILOT_OPERATIONAL_READINESS_ID';
  };
}

const DEFAULT_TARGETS: PilotOperationalReadinessTargets = {
  minPilotStoreCount: 2,
  minPilotWeekCount: 4,
  requireMigrationAcceptance: true,
  requirePrintFieldVerification: true,
  requireAiClinicalReview: true,
  requireOnlineEligibilityReadiness: true,
  requireElectronicPrescriptionReadiness: true
};

const PRIVACY_FLAGS = {
  containsPatientData: false,
  containsStaffNames: false,
  containsFacilityName: false,
  containsRawAuditDetails: false,
  containsRawSupportText: false,
  containsLocalPath: false,
  containsExternalSecrets: false
} as const;

type ArtifactInput =
  | PilotKpiReview
  | ReleaseOpsAcceptanceReview
  | MigrationTrialAcceptanceReview
  | PrintMediaFieldVerificationReview
  | AiClinicalReview
  | OnlineEligibilityFieldReadinessReport
  | ElectronicPrescriptionFieldReadinessReport
  | undefined;

interface ArtifactLike {
  status?: string;
  statusLabel?: string;
  blockedGateCount?: number;
  attentionGateCount?: number;
  nextActions?: string[];
  privacy?: Record<string, unknown>;
  evidenceIntegrity?: {
    status?: string;
    statusLabel?: string;
    issues?: unknown[];
    requiredActions?: string[];
  };
}

function bool(value: boolean | undefined): boolean {
  return value === true;
}

function statusLabel(status: PilotOperationalReadinessStatus): string {
  if (status === 'pass') return '正式運用候補';
  if (status === 'attention') return '正式運用前に確認';
  return '正式運用を保留';
}

function actionLabel(status: PilotOperationalReadinessStatus): string {
  if (status === 'pass') return '正式運用へ進める候補';
  if (status === 'attention') return '制限付きで責任者確認';
  return '正式運用へ進めない';
}

function normalizeStatus(value: string | undefined): PilotOperationalReadinessStatus | undefined {
  if (value === 'pass' || value === 'ready' || value === 'complete') return 'pass';
  if (value === 'attention' || value === 'needs_review' || value === 'needs_feedback') return 'attention';
  if (value === 'blocked' || value === 'rejected' || value === 'open' || value === 'needs_support') return 'blocked';
  return undefined;
}

function finiteNonNegative(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : undefined;
}

function mergeTargets(input: Partial<PilotOperationalReadinessTargets> | undefined): PilotOperationalReadinessTargets {
  return {
    minPilotStoreCount: finiteNonNegative(input?.minPilotStoreCount) ?? DEFAULT_TARGETS.minPilotStoreCount,
    minPilotWeekCount: finiteNonNegative(input?.minPilotWeekCount) ?? DEFAULT_TARGETS.minPilotWeekCount,
    requireMigrationAcceptance: input?.requireMigrationAcceptance ?? DEFAULT_TARGETS.requireMigrationAcceptance,
    requirePrintFieldVerification: input?.requirePrintFieldVerification ?? DEFAULT_TARGETS.requirePrintFieldVerification,
    requireAiClinicalReview: input?.requireAiClinicalReview ?? DEFAULT_TARGETS.requireAiClinicalReview,
    requireOnlineEligibilityReadiness: input?.requireOnlineEligibilityReadiness ?? DEFAULT_TARGETS.requireOnlineEligibilityReadiness,
    requireElectronicPrescriptionReadiness: input?.requireElectronicPrescriptionReadiness ?? DEFAULT_TARGETS.requireElectronicPrescriptionReadiness
  };
}

function artifactLike(artifact: ArtifactInput): ArtifactLike | undefined {
  return artifact as ArtifactLike | undefined;
}

function privacyClear(artifact: ArtifactLike | undefined): boolean {
  if (!artifact?.privacy) return true;
  return Object.values(artifact.privacy).every((value) => value !== true);
}

function artifactNextAction(artifact: ArtifactLike | undefined, fallback: string): string {
  const evidenceAction = artifact?.evidenceIntegrity?.requiredActions?.find(Boolean);
  if (evidenceAction) return evidenceAction;
  const nextAction = artifact?.nextActions?.find(Boolean);
  if (nextAction) return nextAction;
  return fallback;
}

function summarizeArtifact(input: {
  id: string;
  title: string;
  required: boolean;
  artifact: ArtifactInput;
  missingAction: string;
}): PilotOperationalReadinessArtifactSummary {
  const artifact = artifactLike(input.artifact);
  if (!artifact) {
    return {
      id: input.id,
      title: input.title,
      required: input.required,
      attached: false,
      status: input.required ? 'blocked' : 'attention',
      statusLabel: input.required ? statusLabel('blocked') : '対象外または未添付',
      privacyClear: true,
      nextAction: input.required ? input.missingAction : '対象にする場合は証跡を添付する'
    };
  }

  const status = normalizeStatus(artifact.status) ?? 'attention';
  const evidenceIntegrityStatus = normalizeStatus(artifact.evidenceIntegrity?.status);
  const clear = privacyClear(artifact);
  const effectiveStatus: PilotOperationalReadinessStatus = !clear || status === 'blocked' || evidenceIntegrityStatus === 'blocked'
    ? 'blocked'
    : status === 'attention' || evidenceIntegrityStatus === 'attention'
      ? 'attention'
      : 'pass';

  return {
    id: input.id,
    title: input.title,
    required: input.required,
    attached: true,
    status: effectiveStatus,
    statusLabel: artifact.statusLabel || statusLabel(effectiveStatus),
    evidenceIntegrityStatus,
    evidenceIntegrityIssueCount: artifact.evidenceIntegrity?.issues?.length,
    blockedGateCount: artifact.blockedGateCount,
    attentionGateCount: artifact.attentionGateCount,
    privacyClear: clear,
    nextAction: artifactNextAction(artifact, effectiveStatus === 'pass' ? '対応不要' : `${input.title}の未完了ゲートを確認する`)
  };
}

function makeGate(input: {
  id: string;
  title: string;
  status: PilotOperationalReadinessStatus;
  target: string;
  actual: string;
  nextAction: string;
}): PilotOperationalReadinessGate {
  return {
    ...input,
    statusLabel: statusLabel(input.status),
    nextAction: input.status === 'pass' ? '対応不要' : input.nextAction
  };
}

function statusFromPass(ok: boolean, blocked = true): PilotOperationalReadinessStatus {
  if (ok) return 'pass';
  return blocked ? 'blocked' : 'attention';
}

function summarizeStatus(gates: PilotOperationalReadinessGate[]): PilotOperationalReadinessStatus {
  if (gates.some((gate) => gate.status === 'blocked')) return 'blocked';
  if (gates.some((gate) => gate.status === 'attention')) return 'attention';
  return 'pass';
}

function uniqueActions(gates: PilotOperationalReadinessGate[]): string[] {
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

function buildArtifacts(
  evidence: PilotOperationalReadinessEvidenceInput,
  targets: PilotOperationalReadinessTargets
): PilotOperationalReadinessArtifactSummary[] {
  return [
    summarizeArtifact({
      id: 'pilot_kpi',
      title: '4週間KPIレビュー',
      required: true,
      artifact: evidence.pilotKpiReview,
      missingAction: 'P6-04のパイロットKPIレビューJSONを添付する'
    }),
    summarizeArtifact({
      id: 'release_ops_acceptance',
      title: 'リリース運用受入',
      required: true,
      artifact: evidence.releaseOpsAcceptance,
      missingAction: 'P6-05のリリース運用受入JSONを添付する'
    }),
    summarizeArtifact({
      id: 'migration_acceptance',
      title: '移行受入',
      required: targets.requireMigrationAcceptance,
      artifact: evidence.migrationAcceptance,
      missingAction: 'P6-01の移行受入JSONを添付する'
    }),
    summarizeArtifact({
      id: 'print_field_verification',
      title: '帳票実紙検証',
      required: targets.requirePrintFieldVerification,
      artifact: evidence.printFieldVerification,
      missingAction: 'P6-02の帳票実紙検証JSONを添付する'
    }),
    summarizeArtifact({
      id: 'ai_clinical_review',
      title: 'AI症例レビュー',
      required: targets.requireAiClinicalReview,
      artifact: evidence.aiClinicalReview,
      missingAction: 'P5-04のAI症例レビューJSONを添付する'
    }),
    summarizeArtifact({
      id: 'online_eligibility_field_readiness',
      title: 'オンライン資格確認現地試験',
      required: targets.requireOnlineEligibilityReadiness,
      artifact: evidence.onlineEligibilityFieldReadiness,
      missingAction: 'P4-02のオンライン資格確認現地試験JSONを添付する'
    }),
    summarizeArtifact({
      id: 'electronic_prescription_field_readiness',
      title: '電子処方箋公式運用試験',
      required: targets.requireElectronicPrescriptionReadiness,
      artifact: evidence.electronicPrescriptionFieldReadiness,
      missingAction: 'P4-03の電子処方箋公式運用試験JSONを添付する'
    })
  ];
}

function summarizePilot(pilotKpiReview: PilotKpiReview | undefined, targets: PilotOperationalReadinessTargets) {
  return {
    storeCount: finiteNonNegative(pilotKpiReview?.coverage?.storeCount) ?? 0,
    weekCount: finiteNonNegative(pilotKpiReview?.coverage?.weekCount) ?? 0,
    trendStatusLabel: pilotKpiReview?.trend?.statusLabel,
    claimReturnRatePercent: pilotKpiReview?.summary?.claimReturnRatePercent,
    averageHandlingMinutes: pilotKpiReview?.summary?.averageHandlingMinutes,
    followUpOnTimeRatePercent: pilotKpiReview?.summary?.followUpOnTimeRatePercent,
    criticalIncidentCount: pilotKpiReview?.summary?.criticalIncidentCount,
    unrecoveredIncidentCount: pilotKpiReview?.summary?.unrecoveredIncidentCount,
    coverageOk: (finiteNonNegative(pilotKpiReview?.coverage?.storeCount) ?? 0) >= targets.minPilotStoreCount
      && (finiteNonNegative(pilotKpiReview?.coverage?.weekCount) ?? 0) >= targets.minPilotWeekCount
  };
}

export function buildPilotOperationalReadinessReview(input: {
  generatedAt?: Date;
  evidence?: PilotOperationalReadinessEvidenceInput;
} = {}): PilotOperationalReadinessReview {
  const generatedAt = input.generatedAt ?? new Date();
  const evidence = input.evidence ?? {};
  const targets = mergeTargets(evidence.targets);
  const readinessId = String(evidence.readinessId || 'pilot-operational-readiness').trim();
  const artifacts = buildArtifacts(evidence, targets);
  const pilot = summarizePilot(evidence.pilotKpiReview, targets);
  const allArtifactsClear = artifacts
    .filter((artifact) => artifact.required)
    .every((artifact) => artifact.status === 'pass');
  const privacyOk = bool(evidence.noPatientDataConfirmed) && artifacts.every((artifact) => artifact.privacyClear);
  const evidenceIntegrity = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: readinessId,
    claimKind: 'pilot_operational_readiness',
    evidence: {
      readinessId,
      capturedAt: evidence.capturedAt,
      operatorReviewId: evidence.operatorReviewId,
      sourceArtifactSha256: evidence.sourceArtifactSha256,
      noPatientDataConfirmed: evidence.noPatientDataConfirmed,
      realPilotDecisionConfirmed: evidence.realPilotDecisionConfirmed,
      ownerReviewCompleted: evidence.ownerReviewCompleted,
      rolloutStopRuleConfirmed: evidence.rolloutStopRuleConfirmed,
      supportHandoffCompleted: evidence.supportHandoffCompleted,
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        required: artifact.required,
        attached: artifact.attached,
        status: artifact.status,
        evidenceIntegrityStatus: artifact.evidenceIntegrityStatus,
        privacyClear: artifact.privacyClear
      }))
    },
    noPatientDataExpected: true,
    realWorldEvidenceRequired: bool(evidence.realPilotDecisionConfirmed)
  });

  const gates: PilotOperationalReadinessGate[] = [
    makeGate({
      id: 'privacy',
      title: '個人情報なし証跡',
      status: statusFromPass(privacyOk),
      target: '個人を特定できる内容、正式な店舗名、職員氏名、本文、URL、トークン、ローカルパスを含めない',
      actual: privacyOk ? '確認済み' : '未確認または添付証跡に要確認あり',
      nextAction: '匿名IDと集計値だけの正式運用判定証跡へ作り直す'
    }),
    makeGate({
      id: 'evidence_integrity',
      title: '証跡の出所',
      status: evidenceIntegrity.status,
      target: '取得日時、匿名確認ID、元資料SHA-256、個人情報なし確認を揃え、ダミー値を使わない',
      actual: `${evidenceIntegrity.statusLabel} / 指摘${evidenceIntegrity.issues.length}件`,
      nextAction: evidenceIntegrity.requiredActions.join(' / ') || '証跡の出所情報を確認する'
    }),
    makeGate({
      id: 'real_pilot_decision',
      title: '実店舗パイロット判定',
      status: statusFromPass(bool(evidence.realPilotDecisionConfirmed), false),
      target: '机上レビューではなく、実店舗または実データ相当パイロットの判定として扱う',
      actual: bool(evidence.realPilotDecisionConfirmed) ? '実パイロット判定' : '未確認または内部レビュー',
      nextAction: '実店舗または実データ相当のパイロット判定として責任者確認を残す'
    }),
    makeGate({
      id: 'pilot_kpi_coverage',
      title: '複数店舗・4週間KPI',
      status: statusFromPass(pilot.coverageOk),
      target: `${targets.minPilotStoreCount}店舗以上、${targets.minPilotWeekCount}週以上`,
      actual: `${pilot.storeCount}店舗 / ${pilot.weekCount}週`,
      nextAction: '複数店舗で4週間以上の匿名週次KPIをそろえる'
    }),
    makeGate({
      id: 'required_artifacts',
      title: '正式運用前の必須レビュー',
      status: allArtifactsClear ? 'pass' : artifacts.some((artifact) => artifact.required && artifact.status === 'blocked') ? 'blocked' : 'attention',
      target: 'KPI、更新運用、移行、帳票、AI、資格確認、電子処方箋の必須レビューが通っている',
      actual: artifacts.map((artifact) => `${artifact.title}:${artifact.attached ? artifact.statusLabel : '未添付'}`).join(' / '),
      nextAction: artifacts
        .filter((artifact) => artifact.required && artifact.status !== 'pass')
        .map((artifact) => artifact.nextAction)
        .join(' / ') || '必須レビューを確認する'
    }),
    makeGate({
      id: 'owner_signoff',
      title: '責任者判断と停止ルール',
      status: statusFromPass(
        bool(evidence.ownerReviewCompleted)
          && bool(evidence.rolloutStopRuleConfirmed)
          && bool(evidence.supportHandoffCompleted),
        false
      ),
      target: '責任者レビュー、正式運用停止ルール、サポート引き継ぎを完了',
      actual: [
        bool(evidence.ownerReviewCompleted) ? '責任者レビュー済み' : '責任者未確認',
        bool(evidence.rolloutStopRuleConfirmed) ? '停止ルールあり' : '停止ルール未確認',
        bool(evidence.supportHandoffCompleted) ? '引き継ぎ済み' : '引き継ぎ未完了'
      ].join(' / '),
      nextAction: '責任者、停止基準、サポート引き継ぎ先を正式運用前チェックリストへ残す'
    })
  ];
  const status = summarizeStatus(gates);

  return {
    type: 'yakureki-pilot-operational-readiness',
    schemaVersion: 2,
    generatedAt: generatedAt.toISOString(),
    readinessId,
    status,
    statusLabel: statusLabel(status),
    actionLabel: actionLabel(status),
    targets,
    evidence: {
      noPatientDataConfirmed: bool(evidence.noPatientDataConfirmed),
      realPilotDecisionConfirmed: bool(evidence.realPilotDecisionConfirmed),
      ownerReviewCompleted: bool(evidence.ownerReviewCompleted),
      rolloutStopRuleConfirmed: bool(evidence.rolloutStopRuleConfirmed),
      supportHandoffCompleted: bool(evidence.supportHandoffCompleted)
    },
    pilot: {
      storeCount: pilot.storeCount,
      weekCount: pilot.weekCount,
      trendStatusLabel: pilot.trendStatusLabel,
      claimReturnRatePercent: pilot.claimReturnRatePercent,
      averageHandlingMinutes: pilot.averageHandlingMinutes,
      followUpOnTimeRatePercent: pilot.followUpOnTimeRatePercent,
      criticalIncidentCount: pilot.criticalIncidentCount,
      unrecoveredIncidentCount: pilot.unrecoveredIncidentCount
    },
    privacy: PRIVACY_FLAGS,
    evidenceIntegrity,
    artifacts,
    gates,
    passedGateCount: gates.filter((gate) => gate.status === 'pass').length,
    attentionGateCount: gates.filter((gate) => gate.status === 'attention').length,
    blockedGateCount: gates.filter((gate) => gate.status === 'blocked').length,
    nextActions: uniqueActions(gates)
  };
}

export function buildPilotOperationalReadinessCsv(review: PilotOperationalReadinessReview): string {
  const rows = [
    csvLine(['section', 'scope', 'id', 'label', 'status', 'target', 'actual', 'nextAction']),
    csvLine(['summary', 'all', review.readinessId, '判定', review.statusLabel, `${review.targets.minPilotStoreCount}店舗/${review.targets.minPilotWeekCount}週`, `${review.pilot.storeCount}店舗/${review.pilot.weekCount}週`, review.nextActions.join(' / ') || '対応不要']),
    csvLine(['summary', 'all', 'kpi', 'パイロットKPI', review.statusLabel, '正式運用前KPI', `返戻率 ${review.pilot.claimReturnRatePercent ?? '-'}% / 平均処理 ${review.pilot.averageHandlingMinutes ?? '-'}分 / フォロー ${review.pilot.followUpOnTimeRatePercent ?? '-'}%`, '']),
    csvLine(['summary', 'all', 'incidents', '重大障害', review.statusLabel, '重大障害0件、未復旧0件', `重大 ${review.pilot.criticalIncidentCount ?? '-'} / 未復旧 ${review.pilot.unrecoveredIncidentCount ?? '-'}`, ''])
  ];
  for (const artifact of review.artifacts) {
    rows.push(csvLine([
      'artifact',
      artifact.id,
      artifact.required ? 'required' : 'optional',
      artifact.title,
      artifact.statusLabel,
      artifact.required ? '必須' : '任意',
      artifact.attached ? `添付あり / ${artifact.status}` : '未添付',
      artifact.status === 'pass' ? '対応不要' : artifact.nextAction
    ]));
  }
  for (const gate of review.gates) {
    rows.push(csvLine(['gate', 'all', gate.id, gate.title, gate.statusLabel, gate.target, gate.actual, gate.nextAction]));
  }
  return rows.join('\n');
}

export function buildPilotOperationalReadinessEvidenceTemplate(input: {
  generatedAt?: Date;
  readinessId?: string;
  targets?: Partial<PilotOperationalReadinessTargets>;
} = {}): PilotOperationalReadinessEvidenceTemplate {
  const generatedAt = input.generatedAt ?? new Date();
  return {
    type: 'yakureki-pilot-operational-readiness-evidence-template',
    schemaVersion: 2,
    generatedAt: generatedAt.toISOString(),
    readinessId: input.readinessId || 'pilot-operational-readiness',
    guidance: '個人を特定できる内容、正式な店舗名、職員氏名、症例本文、問い合わせ本文、監査ログ本文、URL、トークン、ローカルパスは入れず、各レビューの患者情報なしJSONだけを添付してください。取得日時、匿名確認ID、元資料SHA-256が揃わない場合は正式運用候補にしません。',
    capturedAt: '',
    operatorReviewId: '',
    sourceArtifactSha256: '',
    noPatientDataConfirmed: false,
    realPilotDecisionConfirmed: false,
    ownerReviewCompleted: false,
    rolloutStopRuleConfirmed: false,
    supportHandoffCompleted: false,
    targets: mergeTargets(input.targets),
    artifactEnvironmentVariables: {
      pilotKpiReview: 'YAKUREKI_PILOT_KPI_REVIEW_JSON',
      releaseOpsAcceptance: 'YAKUREKI_RELEASE_OPS_ACCEPTANCE_JSON',
      migrationAcceptance: 'YAKUREKI_MIGRATION_ACCEPTANCE_JSON',
      printFieldVerification: 'YAKUREKI_PRINT_FIELD_REVIEW_JSON',
      aiClinicalReview: 'YAKUREKI_AI_CLINICAL_REVIEW_JSON',
      onlineEligibilityFieldReadiness: 'YAKUREKI_ELIGIBILITY_FIELD_READINESS_JSON',
      electronicPrescriptionFieldReadiness: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_READINESS_JSON'
    },
    privacy: PRIVACY_FLAGS
  };
}

function readinessRequestItem(options: PilotOperationalReadinessRequestItem): PilotOperationalReadinessRequestItem {
  return options;
}

export function buildPilotOperationalReadinessRequest(input: {
  generatedAt?: Date;
  readinessId?: string;
  targets?: Partial<PilotOperationalReadinessTargets>;
} = {}): PilotOperationalReadinessRequest {
  const generatedAt = input.generatedAt ?? new Date();
  const targets = mergeTargets(input.targets);
  return {
    type: 'yakureki-pilot-operational-readiness-request',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    readinessId: input.readinessId || 'pilot-operational-readiness',
    guidance: '正式運用候補にする前に、4週間KPI、更新運用、移行、帳票、AI症例、外部接続、責任者判断を患者情報なしのJSONで束ねてください。患者名、店舗名、スタッフ名、症例本文、問い合わせ本文、URL、トークン、ローカルパスは共有成果物に入れません。',
    targets,
    items: [
      readinessRequestItem({
        id: 'pilot_kpi_review',
        title: '4週間KPIレビュー',
        required: true,
        environmentVariable: 'YAKUREKI_PILOT_KPI_REVIEW_JSON',
        sourceCommand: 'npm run pilot:kpi-review',
        neededFields: ['2店舗以上', '4週以上', '返戻率', '平均処理時間', '閉店前残タスク', '欠品', 'フォロー期限内率', '重大障害', '問い合わせ負荷', '4週間トレンド'],
        purpose: '正式運用へ広げても業務KPIが悪化していないか確認する',
        storeOnly: '匿名店舗IDと実店舗名の対応表、患者情報、スタッフ名は店舗内だけで扱う',
        supportShare: '店舗数、週数、KPI集計、後半悪化、重大障害、証跡品質だけを共有する'
      }),
      readinessRequestItem({
        id: 'release_ops_acceptance',
        title: 'リリース運用受入',
        required: true,
        environmentVariable: 'YAKUREKI_RELEASE_OPS_ACCEPTANCE_JSON',
        sourceCommand: 'npm run release:ops-acceptance',
        neededFields: ['更新準備レビュー', 'リリース後レビュー', 'SLAレビュー', '問い合わせ訓練レビュー', '実問い合わせまたは更新失敗訓練'],
        purpose: '更新後に問い合わせや停止が増えても戻せる運用になっているか確認する',
        storeOnly: '問い合わせ本文、告知本文、担当者名、個別端末名は店舗内だけで扱う',
        supportShare: '同じ更新ID、レビュー添付数、停止時間、問い合わせ件数、エラー件数、残対応だけを共有する'
      }),
      readinessRequestItem({
        id: 'migration_acceptance',
        title: '移行受入',
        required: targets.requireMigrationAcceptance,
        environmentVariable: 'YAKUREKI_MIGRATION_ACCEPTANCE_JSON',
        sourceCommand: 'npm run migration:trial-acceptance',
        neededFields: ['移行パックレビュー', '実データ相当確認', '列対応レビュー', '復旧前プレビュー', '導入1日テスト計画', '責任者レビュー'],
        purpose: '導入初日に患者、受付、在庫、薬歴がつながるか確認する',
        storeOnly: 'CSV原文、患者ID、移行元ID、ファイル名、ローカルパスは店舗内だけで扱う',
        supportShare: '件数、参照不整合数、初日業務判定、保留理由だけを共有する'
      }),
      readinessRequestItem({
        id: 'print_field_verification',
        title: '帳票実紙検証',
        required: targets.requirePrintFieldVerification,
        environmentVariable: 'YAKUREKI_PRINT_FIELD_REVIEW_JSON',
        sourceCommand: 'npm run print:field-verification',
        neededFields: ['調剤録', '明細書', '領収証', '薬剤情報', '薬袋', '手帳シール', '水剤ラベル', '軟膏ラベル', '実プリンタ確認', '紙種確認'],
        purpose: '患者さんへ渡す紙とラベルが切れず読めるか確認する',
        storeOnly: '患者名、薬品名入り原本、プリンタ名、確認者名、スクリーンショットファイル名は店舗内だけで扱う',
        supportShare: '帳票別の確認済み件数、紙種一致、切れなし、文字の読みやすさ、余白、寸法だけを共有する'
      }),
      readinessRequestItem({
        id: 'ai_clinical_review',
        title: 'AI症例レビュー',
        required: targets.requireAiClinicalReview,
        environmentVariable: 'YAKUREKI_AI_CLINICAL_REVIEW_JSON',
        sourceCommand: 'npm run ai:clinical-review',
        neededFields: ['匿名ケースID', '匿名店舗ID', '提案種別', '信頼度', '採否', '薬剤師判定', '誤提案', '安全影響'],
        purpose: 'AI補助を正式運用で広げても安全に制限できるか確認する',
        storeOnly: '症例本文、患者情報、薬剤師名、監査ログ本文は店舗内だけで扱う',
        supportShare: '採否、誤提案、安全影響、停止基準該当有無だけを共有する'
      }),
      readinessRequestItem({
        id: 'online_eligibility_field_readiness',
        title: 'オンライン資格確認現地試験',
        required: targets.requireOnlineEligibilityReadiness,
        environmentVariable: 'YAKUREKI_ELIGIBILITY_FIELD_READINESS_JSON',
        sourceCommand: 'npm run eligibility:field-readiness',
        neededFields: ['公式認証方式', '現地機器成功', '資格確認成功', '公式実レスポンス差分', '個人情報なし共有'],
        purpose: '本番機器と公式レスポンスで資格確認を運用できるか確認する',
        storeOnly: 'URL、トークン、リクエスト本文、レスポンス本文、患者情報は店舗内だけで扱う',
        supportShare: '成功可否、HTTPステータス帯、所要時間、差分件数、再実行アクションだけを共有する'
      }),
      readinessRequestItem({
        id: 'electronic_prescription_field_readiness',
        title: '電子処方箋公式運用試験',
        required: targets.requireElectronicPrescriptionReadiness,
        environmentVariable: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_READINESS_JSON',
        sourceCommand: 'npm run electronic-prescription:field-readiness',
        neededFields: ['本番接続モジュール', '受付内容照合', '引換番号', '重複投薬等チェック', '取消・変更', '調剤結果登録', '障害時手順'],
        purpose: '電子処方箋を公式運用の必須シナリオで扱えるか確認する',
        storeOnly: '処方内容、患者情報、医療機関名、接続URL、認証情報、通信本文は店舗内だけで扱う',
        supportShare: 'シナリオ別判定、未完了件数、停止理由、証跡品質だけを共有する'
      }),
      readinessRequestItem({
        id: 'owner_decision',
        title: '責任者判断・停止ルール・サポート引き継ぎ',
        required: true,
        sourceCommand: 'npm run pilot:operational-readiness',
        neededFields: ['匿名確認ID', '取得日時', '元資料SHA-256', '患者情報なし確認', '実パイロット判定', '責任者レビュー', '停止ルール', 'サポート引き継ぎ'],
        purpose: '正式運用へ進めるか、止める条件は何か、誰へ引き継ぐかを最後に確認する',
        storeOnly: '責任者名、担当者名、原本ファイル名、ローカルパスは店舗内だけで扱う',
        supportShare: '匿名確認ID、取得日時、元資料SHA-256、患者情報なし確認、判断結果、停止ルール有無だけを共有する'
      })
    ],
    operatorChecks: [
      'P6-04の4週間KPIレビューJSONが添付されている',
      'P6-05のリリース運用受入JSONが添付されている',
      '必須レビューのstatusがpassで、証跡品質がpassになっている',
      '責任者レビュー、正式運用停止ルール、サポート引き継ぎ先が残っている',
      '取得日時、匿名確認ID、元資料SHA-256、患者情報なし確認が揃っている'
    ],
    privacyRules: [
      '患者名、患者ID、生年月日、症例本文、問い合わせ本文を入れない',
      '店舗名、スタッフ名、責任者名を入れない',
      'URL、トークン、リクエスト本文、レスポンス本文、ローカルパス、原本ファイル名を入れない',
      'ダミー、モック、練習用データを正式運用判定の実証跡として扱わない'
    ],
    commandEnvironment: {
      evidenceJson: 'YAKUREKI_PILOT_OPERATIONAL_READINESS_EVIDENCE',
      outputDir: 'YAKUREKI_PILOT_OPERATIONAL_READINESS_OUTPUT_DIR',
      readinessId: 'YAKUREKI_PILOT_OPERATIONAL_READINESS_ID'
    }
  };
}

export function buildPilotOperationalReadinessRequestChecklist(request: PilotOperationalReadinessRequest): string {
  return [
    `パイロット正式運用判定 提出依頼 ${request.readinessId}`,
    '目的: KPIだけでなく、更新運用、移行、帳票、AI、外部接続、責任者判断まで揃えて正式運用候補にできるか確認する',
    '',
    '提出してほしいもの:',
    ...request.items.map((item) => [
      `- ${item.title}: ${item.required ? '必須' : '対象時のみ'}${item.environmentVariable ? ` / ${item.environmentVariable}` : ''}`,
      `  作成コマンド: ${item.sourceCommand}`,
      `  必要な項目: ${item.neededFields.join('、')}`,
      `  目的: ${item.purpose}`,
      `  店舗内だけで扱うもの: ${item.storeOnly}`,
      `  共有成果物に残すもの: ${item.supportShare}`
    ].join('\n')),
    '',
    '担当者確認:',
    ...request.operatorChecks.map((check) => `- ${check}`),
    '',
    '共有時のルール:',
    ...request.privacyRules.map((rule) => `- ${rule}`),
    '',
    'CLI入力環境変数:',
    `- 判定メタJSON: ${request.commandEnvironment.evidenceJson}`,
    `- 出力先: ${request.commandEnvironment.outputDir}`,
    `- 判定ID: ${request.commandEnvironment.readinessId}`
  ].join('\n');
}

export function buildPilotOperationalReadinessChecklist(review: PilotOperationalReadinessReview): string {
  return [
    `パイロット正式運用判定: ${review.statusLabel}`,
    `対象: ${review.readinessId}`,
    `範囲: ${review.pilot.storeCount}店舗 / ${review.pilot.weekCount}週`,
    '',
    '添付レビュー:',
    ...review.artifacts.map((artifact) => `- [${artifact.statusLabel}] ${artifact.title}: ${artifact.attached ? '添付あり' : '未添付'}`),
    '',
    '見るKPI:',
    `- 返戻率: ${review.pilot.claimReturnRatePercent ?? '-'}%`,
    `- 平均処理時間: ${review.pilot.averageHandlingMinutes ?? '-'}分`,
    `- フォロー期限内率: ${review.pilot.followUpOnTimeRatePercent ?? '-'}%`,
    `- 重大障害: ${review.pilot.criticalIncidentCount ?? '-'}件 / 未復旧: ${review.pilot.unrecoveredIncidentCount ?? '-'}件`,
    `- 4週間トレンド: ${review.pilot.trendStatusLabel ?? '未添付'}`,
    '',
    '次の対応:',
    ...(review.nextActions.length > 0 ? review.nextActions.map((action) => `- ${action}`) : ['- 対応不要']),
    '',
    'ゲート:',
    ...review.gates.map((gate) => `- [${gate.statusLabel}] ${gate.title}: ${gate.actual}`)
  ].join('\n');
}

export function buildPilotOperationalReadinessAuditDetail(review: PilotOperationalReadinessReview): string {
  const nextActionText = review.nextActions.length > 0 ? ` / 次対応 ${review.nextActions.join('、')}` : '';
  return `パイロット正式運用判定: ${review.statusLabel} / ${review.pilot.storeCount}店舗 ${review.pilot.weekCount}週 / KPI ${review.artifacts.find((artifact) => artifact.id === 'pilot_kpi')?.statusLabel || '未添付'} / 更新運用 ${review.artifacts.find((artifact) => artifact.id === 'release_ops_acceptance')?.statusLabel || '未添付'} / 停止 ${review.blockedGateCount}件${nextActionText}`;
}
