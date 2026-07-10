import type { ReleasePostReview } from './release_post_review.ts';
import type { ReleaseUpdateReadinessReview } from './release_update_readiness.ts';
import {
  buildEvidenceIntegrityReview,
  type EvidenceIntegrityReview
} from './evidence_integrity.ts';
import type { SupportCaseDrillReview } from './support_case_drill.ts';
import type { SupportIncidentSlaReview } from './support_incident_sla.ts';

export type ReleaseOpsAcceptanceStatus = 'pass' | 'attention' | 'blocked';

export interface ReleaseOpsAcceptanceEvidenceInput {
  acceptanceId?: string;
  capturedAt?: string;
  operatorReviewId?: string;
  sourceArtifactSha256?: string;
  noPatientDataConfirmed?: boolean;
  realInquiryOrUpdateFailureDrillConfirmed?: boolean;
  ownerApproved?: boolean;
  handoffChecklistStored?: boolean;
  nextBusinessDayReviewScheduled?: boolean;
  readinessReview?: ReleaseUpdateReadinessReview;
  releasePostReview?: ReleasePostReview;
  slaReview?: SupportIncidentSlaReview;
  supportDrillReview?: SupportCaseDrillReview;
}

export interface ReleaseOpsAcceptanceGate {
  id: string;
  title: string;
  status: ReleaseOpsAcceptanceStatus;
  statusLabel: string;
  target: string;
  actual: string;
  nextAction: string;
}

export interface ReleaseOpsAcceptanceReview {
  type: 'yakureki-release-ops-acceptance';
  schemaVersion: 3;
  generatedAt: string;
  acceptanceId: string;
  status: ReleaseOpsAcceptanceStatus;
  statusLabel: string;
  sources: {
    readinessReviewAttached: boolean;
    releasePostReviewAttached: boolean;
    slaReviewAttached: boolean;
    supportDrillReviewAttached: boolean;
    readinessStatusLabel?: string;
    releasePostStatusLabel?: string;
    slaStatusLabel?: string;
    supportDrillStatusLabel?: string;
    releaseId?: string;
    incidentId?: string;
    scenarioId?: string;
  };
  evidence: {
    capturedAt: string;
    operatorReviewId: string;
    sourceArtifactSha256: string;
    noPatientDataConfirmed: boolean;
    realInquiryOrUpdateFailureDrillConfirmed: boolean;
    ownerApproved: boolean;
    handoffChecklistStored: boolean;
    nextBusinessDayReviewScheduled: boolean;
  };
  metrics: {
    totalBlockedCount: number;
    totalAttentionCount: number;
    supportCaseCount: number;
    maxSupportCaseCount: number;
    errorCount: number;
    maxErrorCount: number;
    downtimeMinutes: number;
    maxDowntimeMinutes: number;
    rollbackTargetMinutes?: number;
    recoveryMinutes?: number;
  };
  privacy: {
    containsPatientData: false;
    containsStaffNames: false;
    containsFacilityName: false;
    containsRawAuditDetails: false;
    containsLocalPath: false;
    containsExternalSecrets: false;
    containsRawNoticeText: false;
    containsRawSupportText: false;
    containsRawNotes: false;
  };
  evidenceIntegrity: EvidenceIntegrityReview;
  linkage: {
    readinessReleaseId?: string;
    releasePostReleaseId?: string;
    releaseIdsMatch: boolean;
    slaAffectedFocusAreaIds: string[];
    drillConfirmedFocusAreaIds: string[];
    sharedFocusAreaIds: string[];
    focusAreasLinked: boolean;
    status: ReleaseOpsAcceptanceStatus;
    statusLabel: string;
    requiredActions: string[];
  };
  gates: ReleaseOpsAcceptanceGate[];
  passedGateCount: number;
  attentionGateCount: number;
  blockedGateCount: number;
  nextActions: string[];
}

export interface ReleaseOpsAcceptanceEvidenceTemplate {
  type: 'yakureki-release-ops-acceptance-evidence-template';
  schemaVersion: 3;
  generatedAt: string;
  acceptanceId: string;
  guidance: string;
  capturedAt: string;
  operatorReviewId: string;
  sourceArtifactSha256: string;
  noPatientDataConfirmed: false;
  realInquiryOrUpdateFailureDrillConfirmed: false;
  ownerApproved: false;
  handoffChecklistStored: false;
  nextBusinessDayReviewScheduled: false;
  reviewJsonPaths: {
    readinessReviewJson: '';
    releasePostReviewJson: '';
    slaReviewJson: '';
    supportDrillReviewJson: '';
  };
  privacy: ReleaseOpsAcceptanceReview['privacy'];
}

const PRIVACY_FLAGS = {
  containsPatientData: false,
  containsStaffNames: false,
  containsFacilityName: false,
  containsRawAuditDetails: false,
  containsLocalPath: false,
  containsExternalSecrets: false,
  containsRawNoticeText: false,
  containsRawSupportText: false,
  containsRawNotes: false
} as const;

function statusLabel(status: ReleaseOpsAcceptanceStatus): string {
  if (status === 'pass') return '運用受入OK';
  if (status === 'attention') return '運用受入を確認';
  return '運用拡大を保留';
}

function bool(value: boolean | undefined): boolean {
  return value === true;
}

function gate(options: {
  id: string;
  title: string;
  status: ReleaseOpsAcceptanceStatus;
  target: string;
  actual: string;
  nextAction: string;
}): ReleaseOpsAcceptanceGate {
  return {
    ...options,
    statusLabel: statusLabel(options.status)
  };
}

function passGate(id: string, title: string, target: string, actual: string): ReleaseOpsAcceptanceGate {
  return gate({
    id,
    title,
    status: 'pass',
    target,
    actual,
    nextAction: '対応不要'
  });
}

function reviewStatus(status: string | undefined): ReleaseOpsAcceptanceStatus {
  if (status === 'pass') return 'pass';
  if (status === 'attention') return 'attention';
  return 'blocked';
}

function gateStatusFromReviews(statuses: ReleaseOpsAcceptanceStatus[]): ReleaseOpsAcceptanceStatus {
  if (statuses.some((status) => status === 'blocked')) return 'blocked';
  if (statuses.some((status) => status === 'attention')) return 'attention';
  return 'pass';
}

function subreviewPrivacySafe(review: unknown): boolean {
  const privacy = (review as { privacy?: Record<string, unknown> } | undefined)?.privacy;
  if (!privacy || typeof privacy !== 'object') return false;
  return Object.values(privacy).every((value) => value === false);
}

function findGateStatus(
  review: { gates?: { id: string; status: string }[] } | undefined,
  id: string
): ReleaseOpsAcceptanceStatus {
  const found = review?.gates?.find((item) => item.id === id);
  return reviewStatus(found?.status);
}

function allGatePass(review: { gates?: { id: string; status: string }[] } | undefined, ids: string[]): boolean {
  return ids.every((id) => findGateStatus(review, id) === 'pass');
}

function summarizeStatus(gates: ReleaseOpsAcceptanceGate[]): ReleaseOpsAcceptanceStatus {
  if (gates.some((item) => item.status === 'blocked')) return 'blocked';
  if (gates.some((item) => item.status === 'attention')) return 'attention';
  return 'pass';
}

function uniqueActions(gates: ReleaseOpsAcceptanceGate[]): string[] {
  return Array.from(new Set(
    gates
      .filter((item) => item.status !== 'pass')
      .map((item) => item.nextAction)
      .filter(Boolean)
  ));
}

function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function sourceLabel(attached: boolean, statusLabelValue: string | undefined): string {
  if (!attached) return '未添付';
  return statusLabelValue || '判定不明';
}

function totalBlocked(evidence: ReleaseOpsAcceptanceEvidenceInput): number {
  let total = 0;
  for (const value of [
    evidence.readinessReview?.blockedGateCount,
    evidence.releasePostReview?.blockedGateCount,
    evidence.slaReview?.blockedGateCount,
    evidence.supportDrillReview?.blockedFocusAreaCount
  ]) {
    total += Number.isFinite(value) ? Number(value) : 0;
  }
  return total;
}

function totalAttention(evidence: ReleaseOpsAcceptanceEvidenceInput): number {
  let total = 0;
  for (const value of [
    evidence.readinessReview?.attentionGateCount,
    evidence.releasePostReview?.attentionGateCount,
    evidence.slaReview?.attentionGateCount,
    evidence.supportDrillReview?.attentionFocusAreaCount
  ]) {
    total += Number.isFinite(value) ? Number(value) : 0;
  }
  return total;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function sharedStrings(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return uniqueStrings(left.filter((value) => rightSet.has(value)));
}

function linkageStatusLabel(status: ReleaseOpsAcceptanceStatus): string {
  if (status === 'pass') return 'レビューひも付けOK';
  if (status === 'attention') return 'レビューひも付けを確認';
  return 'レビューひも付け不足';
}

function buildOpsLinkage(
  readiness: ReleaseUpdateReadinessReview | undefined,
  post: ReleasePostReview | undefined,
  sla: SupportIncidentSlaReview | undefined,
  drill: SupportCaseDrillReview | undefined
): ReleaseOpsAcceptanceReview['linkage'] {
  const readinessReleaseId = readiness?.releaseId?.trim() || undefined;
  const releasePostReleaseId = post?.releaseId?.trim() || undefined;
  const releaseIdsMatch = !!readinessReleaseId && !!releasePostReleaseId && readinessReleaseId === releasePostReleaseId;
  const slaAffectedFocusAreaIds = uniqueStrings((sla?.affectedAreas ?? []).map((area) => area.id));
  const drillConfirmedFocusAreaIds = uniqueStrings((drill?.focusAreas ?? [])
    .filter((area) => area.status === 'pass' && area.reproduced)
    .map((area) => area.id));
  const sharedFocusAreaIds = sharedStrings(slaAffectedFocusAreaIds, drillConfirmedFocusAreaIds);
  const focusAreasLinked = slaAffectedFocusAreaIds.length > 0
    && sharedFocusAreaIds.length === slaAffectedFocusAreaIds.length;
  const requiredActions = [
    ...(!releaseIdsMatch ? ['更新準備レビューと更新後レビューを同じreleaseIdで作り直す'] : []),
    ...(slaAffectedFocusAreaIds.length === 0 ? ['SLAレビューに影響領域を1件以上ひも付ける'] : []),
    ...(slaAffectedFocusAreaIds.length > 0 && !focusAreasLinked ? ['SLAの影響領域を問い合わせ訓練でも薬局・サポート確認済み、かつ再現済みにする'] : [])
  ];
  const status: ReleaseOpsAcceptanceStatus = requiredActions.length === 0
    ? 'pass'
    : !readiness || !post || !sla || !drill || !releaseIdsMatch || sharedFocusAreaIds.length === 0
      ? 'blocked'
      : 'attention';

  return {
    readinessReleaseId,
    releasePostReleaseId,
    releaseIdsMatch,
    slaAffectedFocusAreaIds,
    drillConfirmedFocusAreaIds,
    sharedFocusAreaIds,
    focusAreasLinked,
    status,
    statusLabel: linkageStatusLabel(status),
    requiredActions: requiredActions.length > 0 ? requiredActions : ['対応不要']
  };
}

export function buildReleaseOpsAcceptanceReview(input: {
  generatedAt?: Date;
  evidence?: ReleaseOpsAcceptanceEvidenceInput;
} = {}): ReleaseOpsAcceptanceReview {
  const generatedAt = input.generatedAt ?? new Date();
  const evidence = input.evidence ?? {};
  const readiness = evidence.readinessReview;
  const post = evidence.releasePostReview;
  const sla = evidence.slaReview;
  const drill = evidence.supportDrillReview;
  const attached = {
    readiness: Boolean(readiness),
    post: Boolean(post),
    sla: Boolean(sla),
    drill: Boolean(drill)
  };

  const requiredStatuses = [
    attached.readiness ? reviewStatus(readiness?.status) : 'blocked',
    attached.post ? reviewStatus(post?.status) : 'blocked',
    attached.sla ? reviewStatus(sla?.status) : 'blocked',
    attached.drill ? reviewStatus(drill?.status) : 'blocked'
  ];
  const allAttached = Object.values(attached).every(Boolean);
  const allPrivacySafe = [
    readiness,
    post,
    sla,
    drill
  ].filter(Boolean).every(subreviewPrivacySafe);
  const hasRealDrill = bool(evidence.realInquiryOrUpdateFailureDrillConfirmed)
    && (sla?.evidence.updateFailureDrill === true || drill?.status === 'pass');
  const rollbackReady = allGatePass(readiness, ['rollback_package', 'rollback_test', 'pause_switch'])
    && allGatePass(sla, ['rollback_decision', 'rollback_or_workaround', 'release_pause']);
  const monitoringReady = allGatePass(readiness, ['monitoring', 'support_staffing', 'post_release_review'])
    && allGatePass(post, ['monitoring', 'post_release_review'])
    && allGatePass(sla, ['update_cadence', 'follow_up_review']);
  const handoffReady = bool(evidence.ownerApproved)
    && bool(evidence.handoffChecklistStored)
    && bool(evidence.nextBusinessDayReviewScheduled);
  const linkage = buildOpsLinkage(readiness, post, sla, drill);
  const evidenceIntegrity = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: String(evidence.acceptanceId || evidence.operatorReviewId || 'release-ops-acceptance').trim(),
    claimKind: 'release_ops_acceptance',
    evidence: {
      acceptanceId: evidence.acceptanceId,
      capturedAt: evidence.capturedAt,
      operatorReviewId: evidence.operatorReviewId,
      sourceArtifactSha256: evidence.sourceArtifactSha256,
      noPatientDataConfirmed: bool(evidence.noPatientDataConfirmed),
      evidenceKind: hasRealDrill ? 'actual update failure drill confirmed' : 'not confirmed',
      realInquiryOrUpdateFailureDrillConfirmed: bool(evidence.realInquiryOrUpdateFailureDrillConfirmed),
      ownerApproved: bool(evidence.ownerApproved),
      handoffChecklistStored: bool(evidence.handoffChecklistStored),
      nextBusinessDayReviewScheduled: bool(evidence.nextBusinessDayReviewScheduled),
      readinessStatus: readiness?.status,
      releasePostStatus: post?.status,
      slaStatus: sla?.status,
      supportDrillStatus: drill?.status,
      releaseId: readiness?.releaseId ?? post?.releaseId,
      incidentId: sla?.incidentId,
      scenarioId: drill?.scenarioId
    },
    noPatientDataExpected: true,
    realWorldEvidenceRequired: true
  });

  const gates: ReleaseOpsAcceptanceGate[] = [
    allAttached
      ? passGate('required_reviews', '必要レビュー添付', '更新準備、更新後、SLA、問い合わせ訓練レビューを添付', '4件添付')
      : gate({
        id: 'required_reviews',
        title: '必要レビュー添付',
        status: 'blocked',
        target: '更新準備、更新後、SLA、問い合わせ訓練レビューを添付',
        actual: [
          `更新準備 ${attached.readiness ? 'あり' : 'なし'}`,
          `更新後 ${attached.post ? 'あり' : 'なし'}`,
          `SLA ${attached.sla ? 'あり' : 'なし'}`,
          `問い合わせ訓練 ${attached.drill ? 'あり' : 'なし'}`
        ].join(' / '),
        nextAction: '4種類のレビューJSONをそろえてから運用受入を判定する'
      }),
    bool(evidence.noPatientDataConfirmed) && allPrivacySafe
      ? passGate('privacy', '個人情報なし', '患者名、スタッフ名、薬局名、本文、URL、トークン、ローカルパスを含めない', '確認済み')
      : gate({
        id: 'privacy',
        title: '個人情報なし',
        status: 'blocked',
        target: '患者名、スタッフ名、薬局名、本文、URL、トークン、ローカルパスを含めない',
        actual: bool(evidence.noPatientDataConfirmed) ? '親レビュー確認済み / 添付レビュー未確認' : '未確認',
        nextAction: '個人情報なしのレビューJSONへ作り直し、本文や実名は別管理にする'
      }),
    gate({
      id: 'evidence_integrity',
      title: '証跡の出所と安全性',
      status: evidenceIntegrity.status,
      target: '取得日時、匿名確認ID、元資料SHA-256、患者情報なし確認を揃え、ダミー値を使わない',
      actual: `${evidenceIntegrity.statusLabel} / 指摘${evidenceIntegrity.issues.length}件`,
      nextAction: evidenceIntegrity.requiredActions.join(' / ') || '対応不要'
    }),
    gate({
      id: 'cross_review_linkage',
      title: 'レビュー同士のひも付け',
      status: linkage.status,
      target: '更新準備と更新後は同じreleaseId、SLA影響領域は問い合わせ訓練でも確認済み',
      actual: [
        `releaseId ${linkage.readinessReleaseId || '-'} -> ${linkage.releasePostReleaseId || '-'}`,
        `影響領域 ${linkage.slaAffectedFocusAreaIds.join(' / ') || 'なし'}`,
        `訓練確認 ${linkage.drillConfirmedFocusAreaIds.join(' / ') || 'なし'}`,
        `一致 ${linkage.sharedFocusAreaIds.join(' / ') || 'なし'}`
      ].join(' / '),
      nextAction: linkage.requiredActions.join(' / ')
    }),
    gate({
      id: 'source_review_status',
      title: '個別レビュー判定',
      status: gateStatusFromReviews(requiredStatuses),
      target: '4種類の個別レビューがすべてOK',
      actual: [
        `更新準備 ${sourceLabel(attached.readiness, readiness?.statusLabel)}`,
        `更新後 ${sourceLabel(attached.post, post?.statusLabel)}`,
        `SLA ${sourceLabel(attached.sla, sla?.statusLabel)}`,
        `訓練 ${sourceLabel(attached.drill, drill?.statusLabel)}`
      ].join(' / '),
      nextAction: gateStatusFromReviews(requiredStatuses) === 'blocked'
        ? '未完了またはブロック中の個別レビューを先に完了する'
        : '確認中の個別レビューをOKまで進める'
    }),
    hasRealDrill
      ? passGate('real_inquiry_or_update_failure_drill', '実問い合わせ・更新失敗訓練', '実問い合わせまたは更新失敗訓練をSLAとひも付ける', '確認済み')
      : gate({
        id: 'real_inquiry_or_update_failure_drill',
        title: '実問い合わせ・更新失敗訓練',
        status: 'blocked',
        target: '実問い合わせまたは更新失敗訓練をSLAとひも付ける',
        actual: [
          bool(evidence.realInquiryOrUpdateFailureDrillConfirmed) ? '実証跡あり' : '実証跡未確認',
          sla?.evidence.updateFailureDrill ? 'SLA更新失敗訓練あり' : 'SLA更新失敗訓練なし',
          drill?.status === 'pass' ? '問い合わせ訓練OK' : '問い合わせ訓練未OK'
        ].join(' / '),
        nextAction: '実問い合わせまたは更新失敗訓練を1件選び、SLAレビューと問い合わせ訓練レビューへ結び付ける'
      }),
    rollbackReady
      ? passGate('rollback_control', '戻し・配信停止判断', '戻し手順、戻し訓練、配信停止判断、回避策がOK', '確認済み')
      : gate({
        id: 'rollback_control',
        title: '戻し・配信停止判断',
        status: 'blocked',
        target: '戻し手順、戻し訓練、配信停止判断、回避策がOK',
        actual: [
          `戻しパッケージ ${findGateStatus(readiness, 'rollback_package')}`,
          `戻し訓練 ${findGateStatus(readiness, 'rollback_test')}`,
          `停止スイッチ ${findGateStatus(readiness, 'pause_switch')}`,
          `戻し判断 ${findGateStatus(sla, 'rollback_decision')}`,
          `回避策 ${findGateStatus(sla, 'rollback_or_workaround')}`
        ].join(' / '),
        nextAction: '更新失敗時に何分で戻すか、誰が止めるか、どの回避策を出すかをレビューへ追記する'
      }),
    monitoringReady
      ? passGate('monitoring_and_follow_up', '監視・翌営業日レビュー', '更新前監視、更新後監視、続報間隔、翌営業日レビューを確認', '確認済み')
      : gate({
        id: 'monitoring_and_follow_up',
        title: '監視・翌営業日レビュー',
        status: 'attention',
        target: '更新前監視、更新後監視、続報間隔、翌営業日レビューを確認',
        actual: [
          `更新前監視 ${findGateStatus(readiness, 'monitoring')}`,
          `サポート待機 ${findGateStatus(readiness, 'support_staffing')}`,
          `更新後監視 ${findGateStatus(post, 'monitoring')}`,
          `続報間隔 ${findGateStatus(sla, 'update_cadence')}`,
          `後追い ${findGateStatus(sla, 'follow_up_review')}`
        ].join(' / '),
        nextAction: '更新後の監視担当、続報間隔、翌営業日の再確認を運用表へ登録する'
      }),
    handoffReady
      ? passGate('owner_handoff', '責任者引き継ぎ', '責任者承認、引き継ぎチェックリスト、翌営業日レビュー予定を残す', '確認済み')
      : gate({
        id: 'owner_handoff',
        title: '責任者引き継ぎ',
        status: 'attention',
        target: '責任者承認、引き継ぎチェックリスト、翌営業日レビュー予定を残す',
        actual: [
          bool(evidence.ownerApproved) ? '承認あり' : '承認なし',
          bool(evidence.handoffChecklistStored) ? '引き継ぎあり' : '引き継ぎなし',
          bool(evidence.nextBusinessDayReviewScheduled) ? '翌営業日レビューあり' : '翌営業日レビューなし'
        ].join(' / '),
        nextAction: '責任者の受入承認と翌営業日の再確認予定を残す'
      })
  ];
  const status = summarizeStatus(gates);

  return {
    type: 'yakureki-release-ops-acceptance',
    schemaVersion: 3,
    generatedAt: generatedAt.toISOString(),
    acceptanceId: String(evidence.acceptanceId || 'release-ops-acceptance').trim(),
    status,
    statusLabel: statusLabel(status),
    sources: {
      readinessReviewAttached: attached.readiness,
      releasePostReviewAttached: attached.post,
      slaReviewAttached: attached.sla,
      supportDrillReviewAttached: attached.drill,
      readinessStatusLabel: readiness?.statusLabel,
      releasePostStatusLabel: post?.statusLabel,
      slaStatusLabel: sla?.statusLabel,
      supportDrillStatusLabel: drill?.statusLabel,
      releaseId: readiness?.releaseId ?? post?.releaseId,
      incidentId: sla?.incidentId,
      scenarioId: drill?.scenarioId
    },
    evidence: {
      capturedAt: String(evidence.capturedAt || '').trim(),
      operatorReviewId: String(evidence.operatorReviewId || '').trim(),
      sourceArtifactSha256: String(evidence.sourceArtifactSha256 || '').trim(),
      noPatientDataConfirmed: bool(evidence.noPatientDataConfirmed),
      realInquiryOrUpdateFailureDrillConfirmed: bool(evidence.realInquiryOrUpdateFailureDrillConfirmed),
      ownerApproved: bool(evidence.ownerApproved),
      handoffChecklistStored: bool(evidence.handoffChecklistStored),
      nextBusinessDayReviewScheduled: bool(evidence.nextBusinessDayReviewScheduled)
    },
    metrics: {
      totalBlockedCount: totalBlocked(evidence),
      totalAttentionCount: totalAttention(evidence),
      supportCaseCount: post?.metrics.supportCaseCount ?? 0,
      maxSupportCaseCount: post?.metrics.maxSupportCaseCount ?? 0,
      errorCount: post?.metrics.errorCount ?? 0,
      maxErrorCount: post?.metrics.maxErrorCount ?? 0,
      downtimeMinutes: post?.metrics.downtimeMinutes ?? 0,
      maxDowntimeMinutes: post?.metrics.maxDowntimeMinutes ?? 0,
      rollbackTargetMinutes: readiness?.rollbackTargetMinutes,
      recoveryMinutes: sla?.elapsed.recoveryMinutes
    },
    privacy: PRIVACY_FLAGS,
    evidenceIntegrity,
    linkage,
    gates,
    passedGateCount: gates.filter((item) => item.status === 'pass').length,
    attentionGateCount: gates.filter((item) => item.status === 'attention').length,
    blockedGateCount: gates.filter((item) => item.status === 'blocked').length,
    nextActions: uniqueActions(gates)
  };
}

export function buildReleaseOpsAcceptanceEvidenceTemplate(input: {
  generatedAt?: Date;
  acceptanceId?: string;
} = {}): ReleaseOpsAcceptanceEvidenceTemplate {
  const generatedAt = input.generatedAt ?? new Date();
  return {
    type: 'yakureki-release-ops-acceptance-evidence-template',
    schemaVersion: 3,
    generatedAt: generatedAt.toISOString(),
    acceptanceId: input.acceptanceId || 'release-ops-acceptance',
    guidance: '患者名、スタッフ名、薬局名、電話番号、メールアドレス、URL、トークン、ローカルパス、問い合わせ本文、告知本文、自由記述メモはこのJSONに書かず、個別レビューJSONのパスも成果物には保存しない',
    capturedAt: '',
    operatorReviewId: '',
    sourceArtifactSha256: '',
    noPatientDataConfirmed: false,
    realInquiryOrUpdateFailureDrillConfirmed: false,
    ownerApproved: false,
    handoffChecklistStored: false,
    nextBusinessDayReviewScheduled: false,
    reviewJsonPaths: {
      readinessReviewJson: '',
      releasePostReviewJson: '',
      slaReviewJson: '',
      supportDrillReviewJson: ''
    },
    privacy: PRIVACY_FLAGS
  };
}

export function buildReleaseOpsAcceptanceCsv(review: ReleaseOpsAcceptanceReview): string {
  const rows = [
    ['区分', '判定', '対象', '目標', '実績', '次の対応'],
    [
      '総括',
      review.statusLabel,
      review.acceptanceId,
      'P6-05 実問い合わせ・更新失敗訓練の運用受入',
      `停止 ${review.blockedGateCount} / 確認 ${review.attentionGateCount} / OK ${review.passedGateCount}`,
      review.nextActions[0] ?? '対応不要'
    ],
    [
      '指標',
      review.statusLabel,
      review.sources.releaseId || 'release',
      `問い合わせ ${review.metrics.maxSupportCaseCount}件以下 / エラー ${review.metrics.maxErrorCount}件以下 / 停止 ${review.metrics.maxDowntimeMinutes}分以下`,
      `問い合わせ ${review.metrics.supportCaseCount}件 / エラー ${review.metrics.errorCount}件 / 停止 ${review.metrics.downtimeMinutes}分`,
      ''
    ],
    [
      'ひも付け',
      review.linkage.statusLabel,
      review.sources.releaseId || 'release',
      '同じreleaseId、SLA影響領域と問い合わせ訓練の一致',
      `releaseId一致 ${review.linkage.releaseIdsMatch ? 'OK' : 'NG'} / 領域一致 ${review.linkage.sharedFocusAreaIds.join(' / ') || 'なし'}`,
      review.linkage.requiredActions.join(' / ')
    ],
    ...review.gates.map((item) => [
      '確認ゲート',
      item.statusLabel,
      item.title,
      item.target,
      item.actual,
      item.nextAction
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildReleaseOpsAcceptanceChecklist(review: ReleaseOpsAcceptanceReview): string {
  return [
    `リリース運用受入 ${review.statusLabel}`,
    `対象: ${review.acceptanceId}`,
    `更新: ${review.sources.releaseId || '未記録'}`,
    `障害/SLA: ${review.sources.incidentId || '未記録'}`,
    `問い合わせ訓練: ${review.sources.scenarioId || '未記録'}`,
    '',
    '受入前に見るもの:',
    '- 更新準備レビューがOKか',
    '- 更新準備レビューと更新後レビューが同じreleaseIdか',
    '- SLAレビューで初回告知、続報、戻し判断、復旧、後追いがOKか',
    '- 問い合わせ訓練で薬局側とサポート側が同じ再現手順を確認済みか',
    '- SLAの影響領域が問い合わせ訓練でも確認・再現されているか',
    '- 更新後レビューで問い合わせ、エラー、停止時間が目標内か',
    '- 実問い合わせまたは更新失敗訓練の証跡があるか',
    '- 責任者承認と翌営業日レビュー予定があるか',
    '',
    'このチェックリストに入れないもの:',
    '- 患者名、スタッフ名、薬局名',
    '- 電話番号、メールアドレス、URL、トークン',
    '- 問い合わせ本文、告知本文、自由記述メモ、ローカルパス',
    '',
    '未完了の次対応:',
    ...(review.nextActions.length > 0 ? review.nextActions.map((action) => `- ${action}`) : ['- 対応不要'])
  ].join('\n');
}

export function buildReleaseOpsAcceptanceAuditDetail(review: ReleaseOpsAcceptanceReview): string {
  const nextActionText = review.nextActions.length > 0 ? ` / 次対応: ${review.nextActions.join('、')}` : '';
  return `リリース運用受入 ${review.statusLabel} / 更新 ${review.sources.releaseId || '未記録'} / SLA ${review.sources.slaStatusLabel || '未添付'} / ひも付け ${review.linkage.statusLabel} / 問い合わせ ${review.metrics.supportCaseCount}件 / エラー ${review.metrics.errorCount}件 / 停止 ${review.blockedGateCount}件${nextActionText}`;
}
