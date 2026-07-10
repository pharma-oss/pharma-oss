import type { SupportCaseFocusArea, SupportCasePriority, SupportCaseTriage } from './support_case_triage.ts';
import { buildEvidenceIntegrityReview, type EvidenceIntegrityReview } from './evidence_integrity.ts';

export type SupportIncidentSlaStatus = 'pass' | 'attention' | 'blocked';
export type SupportIncidentSeverity = 'critical' | 'major' | 'standard' | 'watch';

export interface SupportIncidentSlaPolicy {
  severity: SupportIncidentSeverity;
  severityLabel: string;
  acknowledgeTargetMinutes: number;
  firstNoticeTargetMinutes: number;
  updateIntervalMinutes: number;
  recoveryTargetMinutes: number;
  rollbackDecisionTargetMinutes: number;
  closeReviewTargetHours: number;
}

export interface SupportIncidentSlaEvidenceInput {
  incidentId?: string;
  capturedAt?: string;
  operatorReviewId?: string;
  sourceArtifactSha256?: string;
  occurredAt?: string;
  acknowledgedAt?: string;
  firstNoticeAt?: string;
  lastStatusUpdateAt?: string;
  rollbackDecisionAt?: string;
  recoveredAt?: string;
  closedAt?: string;
  noPatientDataConfirmed?: boolean;
  responseOwnerRecordedOutsideJson?: boolean;
  noticeChannelRecorded?: boolean;
  userNoticePrepared?: boolean;
  updateCadenceConfirmed?: boolean;
  recoveryRunbookLinked?: boolean;
  rollbackOrWorkaroundConfirmed?: boolean;
  updateFailureDrill?: boolean;
  preUpdateBackupConfirmed?: boolean;
  dataMigrationImpactChecked?: boolean;
  releasePausedUntilFixed?: boolean;
  followUpReviewScheduled?: boolean;
  affectedFocusAreaIds?: string[];
}

export interface SupportIncidentSlaGateReview {
  id: string;
  title: string;
  status: SupportIncidentSlaStatus;
  statusLabel: string;
  target: string;
  actual: string;
  nextAction: string;
}

export interface SupportIncidentAffectedArea {
  id: string;
  title: string;
  priority: SupportCasePriority;
  priorityLabel: string;
  supportOwner: SupportCaseFocusArea['supportOwner'];
  nextAction: string;
}

export interface SupportIncidentSlaReview {
  type: 'yakureki-support-incident-sla-review';
  schemaVersion: 2;
  generatedAt: string;
  incidentId: string;
  triageGeneratedAt: string;
  priority: SupportCasePriority;
  priorityLabel: string;
  severity: SupportIncidentSeverity;
  severityLabel: string;
  status: SupportIncidentSlaStatus;
  statusLabel: string;
  policy: SupportIncidentSlaPolicy;
  elapsed: {
    acknowledgeMinutes?: number;
    firstNoticeMinutes?: number;
    lastStatusUpdateMinutes?: number;
    rollbackDecisionMinutes?: number;
    recoveryMinutes?: number;
    closeReviewHours?: number;
  };
  evidence: {
    capturedAt: string;
    operatorReviewId: string;
    sourceArtifactSha256: string;
    noPatientDataConfirmed: boolean;
    responseOwnerRecordedOutsideJson: boolean;
    noticeChannelRecorded: boolean;
    userNoticePrepared: boolean;
    updateCadenceConfirmed: boolean;
    recoveryRunbookLinked: boolean;
    rollbackOrWorkaroundConfirmed: boolean;
    updateFailureDrill: boolean;
    preUpdateBackupConfirmed: boolean;
    dataMigrationImpactChecked: boolean;
    releasePausedUntilFixed: boolean;
    followUpReviewScheduled: boolean;
  };
  evidenceIntegrity: EvidenceIntegrityReview;
  privacy: {
    containsPatientData: false;
    containsStaffNames: false;
    containsFacilityName: false;
    containsRawAuditDetails: false;
    containsLocalPath: false;
    containsExternalSecrets: false;
    containsRawNoticeText: false;
    containsRawNotes: false;
  };
  affectedAreas: SupportIncidentAffectedArea[];
  gates: SupportIncidentSlaGateReview[];
  passedGateCount: number;
  attentionGateCount: number;
  blockedGateCount: number;
  nextActions: string[];
}

export interface SupportIncidentSlaEvidenceTemplate {
  type: 'yakureki-support-incident-sla-evidence-template';
  schemaVersion: 2;
  generatedAt: string;
  incidentId: string;
  guidance: string;
  capturedAt: string;
  operatorReviewId: string;
  sourceArtifactSha256: string;
  occurredAt: string;
  acknowledgedAt: string;
  firstNoticeAt: string;
  lastStatusUpdateAt: string;
  rollbackDecisionAt: string;
  recoveredAt: string;
  closedAt: string;
  noPatientDataConfirmed: false;
  responseOwnerRecordedOutsideJson: false;
  noticeChannelRecorded: false;
  userNoticePrepared: false;
  updateCadenceConfirmed: false;
  recoveryRunbookLinked: false;
  rollbackOrWorkaroundConfirmed: false;
  updateFailureDrill: false;
  preUpdateBackupConfirmed: false;
  dataMigrationImpactChecked: false;
  releasePausedUntilFixed: false;
  followUpReviewScheduled: false;
  affectedFocusAreaIds: string[];
  privacy: SupportIncidentSlaReview['privacy'];
  policy: SupportIncidentSlaPolicy;
  focusAreas: {
    id: string;
    title: string;
    priorityLabel: string;
    supportOwner: SupportCaseFocusArea['supportOwner'];
  }[];
}

export interface SupportIncidentSlaCheckRequestItem {
  id: string;
  title: string;
  required: boolean;
  neededFields: string[];
  purpose: string;
  storeOnly: string;
  supportShare: string;
}

export interface SupportIncidentSlaCheckRequest {
  type: 'yakureki-support-incident-sla-check-request';
  schemaVersion: 1;
  generatedAt: string;
  incidentId: string;
  guidance: string;
  severity: SupportIncidentSeverity;
  severityLabel: string;
  policy: SupportIncidentSlaPolicy;
  items: SupportIncidentSlaCheckRequestItem[];
  operatorChecks: string[];
  privacyRules: string[];
  commandEnvironment: {
    triageJson: 'YAKUREKI_SUPPORT_TRIAGE_JSON';
    evidenceJson: 'YAKUREKI_SUPPORT_SLA_EVIDENCE';
    outputDir: 'YAKUREKI_SUPPORT_SLA_OUTPUT_DIR';
    incidentId: 'YAKUREKI_SUPPORT_INCIDENT_ID';
  };
}

const DEFAULT_POLICY_BY_SEVERITY: Record<SupportIncidentSeverity, SupportIncidentSlaPolicy> = {
  critical: {
    severity: 'critical',
    severityLabel: '重大',
    acknowledgeTargetMinutes: 15,
    firstNoticeTargetMinutes: 30,
    updateIntervalMinutes: 30,
    recoveryTargetMinutes: 120,
    rollbackDecisionTargetMinutes: 45,
    closeReviewTargetHours: 24
  },
  major: {
    severity: 'major',
    severityLabel: '高',
    acknowledgeTargetMinutes: 30,
    firstNoticeTargetMinutes: 60,
    updateIntervalMinutes: 60,
    recoveryTargetMinutes: 240,
    rollbackDecisionTargetMinutes: 90,
    closeReviewTargetHours: 48
  },
  standard: {
    severity: 'standard',
    severityLabel: '通常',
    acknowledgeTargetMinutes: 60,
    firstNoticeTargetMinutes: 120,
    updateIntervalMinutes: 120,
    recoveryTargetMinutes: 480,
    rollbackDecisionTargetMinutes: 180,
    closeReviewTargetHours: 72
  },
  watch: {
    severity: 'watch',
    severityLabel: '経過観察',
    acknowledgeTargetMinutes: 120,
    firstNoticeTargetMinutes: 240,
    updateIntervalMinutes: 240,
    recoveryTargetMinutes: 1440,
    rollbackDecisionTargetMinutes: 480,
    closeReviewTargetHours: 120
  }
};

function severityFromPriority(priority: SupportCasePriority): SupportIncidentSeverity {
  if (priority === 'urgent') return 'critical';
  if (priority === 'high') return 'major';
  if (priority === 'normal') return 'standard';
  return 'watch';
}

function statusLabel(status: SupportIncidentSlaStatus): string {
  if (status === 'pass') return '障害対応OK';
  if (status === 'attention') return '障害対応を確認';
  return '障害対応未完了';
}

function bool(value: boolean | undefined): boolean {
  return value === true;
}

function normalizeIdSet(ids: string[] | undefined): Set<string> {
  return new Set((ids ?? []).map((id) => String(id).trim()).filter(Boolean));
}

function elapsedMinutes(start: string | undefined, end: string | undefined): number | undefined {
  const startTime = Date.parse(start || '');
  const endTime = Date.parse(end || '');
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    return undefined;
  }
  return Math.round(((endTime - startTime) / 60_000) * 10) / 10;
}

function elapsedHours(start: string | undefined, end: string | undefined): number | undefined {
  const minutes = elapsedMinutes(start, end);
  return minutes === undefined ? undefined : Math.round((minutes / 60) * 10) / 10;
}

function passGate(id: string, title: string, target: string, actual: string): SupportIncidentSlaGateReview {
  return {
    id,
    title,
    status: 'pass',
    statusLabel: statusLabel('pass'),
    target,
    actual,
    nextAction: '対応不要'
  };
}

function attentionGate(id: string, title: string, target: string, actual: string, nextAction: string): SupportIncidentSlaGateReview {
  return {
    id,
    title,
    status: 'attention',
    statusLabel: statusLabel('attention'),
    target,
    actual,
    nextAction
  };
}

function blockedGate(id: string, title: string, target: string, actual: string, nextAction: string): SupportIncidentSlaGateReview {
  return {
    id,
    title,
    status: 'blocked',
    statusLabel: statusLabel('blocked'),
    target,
    actual,
    nextAction
  };
}

function elapsedGate(options: {
  id: string;
  title: string;
  elapsed?: number;
  target: number;
  unit: '分' | '時間';
  missingAction: string;
  lateAction: string;
}): SupportIncidentSlaGateReview {
  const target = `${options.target}${options.unit}以内`;
  if (options.elapsed === undefined) {
    return attentionGate(options.id, options.title, target, '未記録', options.missingAction);
  }
  const actual = `${options.elapsed}${options.unit}`;
  if (options.elapsed > options.target) {
    return attentionGate(options.id, options.title, target, actual, options.lateAction);
  }
  return passGate(options.id, options.title, target, actual);
}

function booleanGate(options: {
  id: string;
  title: string;
  ok: boolean;
  target: string;
  blocked?: boolean;
  missingAction: string;
}): SupportIncidentSlaGateReview {
  if (options.ok) {
    return passGate(options.id, options.title, options.target, 'OK');
  }
  if (options.blocked) {
    return blockedGate(options.id, options.title, options.target, '未記録', options.missingAction);
  }
  return attentionGate(options.id, options.title, options.target, '未記録', options.missingAction);
}

function buildAffectedAreas(triage: SupportCaseTriage, affectedIds: string[] | undefined): SupportIncidentAffectedArea[] {
  const idSet = normalizeIdSet(affectedIds);
  const source = idSet.size === 0
    ? triage.focusAreas
    : triage.focusAreas.filter((area) => idSet.has(area.id));
  return source.map((area) => ({
    id: area.id,
    title: area.title,
    priority: area.priority,
    priorityLabel: area.priorityLabel,
    supportOwner: area.supportOwner,
    nextAction: area.nextAction
  }));
}

function incidentStatus(gates: SupportIncidentSlaGateReview[]): SupportIncidentSlaStatus {
  if (gates.some((gate) => gate.status === 'blocked')) return 'blocked';
  if (gates.some((gate) => gate.status === 'attention')) return 'attention';
  return 'pass';
}

function uniqueActions(gates: SupportIncidentSlaGateReview[]): string[] {
  return Array.from(new Set(
    gates
      .filter((gate) => gate.status !== 'pass')
      .map((gate) => gate.nextAction)
      .filter(Boolean)
  ));
}

export function buildSupportIncidentSlaReview(input: {
  generatedAt?: Date;
  triage: SupportCaseTriage;
  evidence?: SupportIncidentSlaEvidenceInput;
}): SupportIncidentSlaReview {
  const generatedAt = input.generatedAt ?? new Date();
  const evidence = input.evidence ?? {};
  const severity = severityFromPriority(input.triage.priority);
  const policy = DEFAULT_POLICY_BY_SEVERITY[severity];
  const incidentId = String(evidence.incidentId || 'support-incident-sla').trim();
  const elapsed = {
    acknowledgeMinutes: elapsedMinutes(evidence.occurredAt, evidence.acknowledgedAt),
    firstNoticeMinutes: elapsedMinutes(evidence.occurredAt, evidence.firstNoticeAt),
    lastStatusUpdateMinutes: elapsedMinutes(evidence.firstNoticeAt || evidence.acknowledgedAt, evidence.lastStatusUpdateAt),
    rollbackDecisionMinutes: elapsedMinutes(evidence.occurredAt, evidence.rollbackDecisionAt),
    recoveryMinutes: elapsedMinutes(evidence.occurredAt, evidence.recoveredAt),
    closeReviewHours: elapsedHours(evidence.recoveredAt, evidence.closedAt)
  };
  const highImpact = severity === 'critical' || severity === 'major';
  const updateFailureDrill = bool(evidence.updateFailureDrill);
  const evidenceIntegrity = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: String(evidence.incidentId || evidence.operatorReviewId || 'support-incident-sla').trim(),
    claimKind: 'support_incident_sla',
    evidence: {
      incidentId,
      capturedAt: evidence.capturedAt,
      operatorReviewId: evidence.operatorReviewId,
      sourceArtifactSha256: evidence.sourceArtifactSha256,
      noPatientDataConfirmed: bool(evidence.noPatientDataConfirmed),
      evidenceKind: updateFailureDrill
        ? 'actual support incident update failure drill review'
        : 'actual support incident SLA review',
      severity,
      priority: input.triage.priority,
      occurredAt: evidence.occurredAt,
      acknowledgedAt: evidence.acknowledgedAt,
      firstNoticeAt: evidence.firstNoticeAt,
      recoveredAt: evidence.recoveredAt,
      closedAt: evidence.closedAt,
      responseOwnerRecordedOutsideJson: bool(evidence.responseOwnerRecordedOutsideJson),
      noticeChannelRecorded: bool(evidence.noticeChannelRecorded),
      userNoticePrepared: bool(evidence.userNoticePrepared),
      updateCadenceConfirmed: bool(evidence.updateCadenceConfirmed),
      recoveryRunbookLinked: bool(evidence.recoveryRunbookLinked),
      rollbackOrWorkaroundConfirmed: bool(evidence.rollbackOrWorkaroundConfirmed),
      updateFailureDrill,
      preUpdateBackupConfirmed: bool(evidence.preUpdateBackupConfirmed),
      dataMigrationImpactChecked: bool(evidence.dataMigrationImpactChecked),
      releasePausedUntilFixed: bool(evidence.releasePausedUntilFixed),
      followUpReviewScheduled: bool(evidence.followUpReviewScheduled),
      affectedFocusAreaCount: buildAffectedAreas(input.triage, evidence.affectedFocusAreaIds).length
    },
    noPatientDataExpected: true,
    realWorldEvidenceRequired: true
  });

  const gates: SupportIncidentSlaGateReview[] = [
    booleanGate({
      id: 'privacy',
      title: '患者情報なし確認',
      ok: bool(evidence.noPatientDataConfirmed),
      target: '患者名、スタッフ名、薬局名、URL、トークン、自由記述メモを含めない',
      blocked: true,
      missingAction: '共有前に個人情報なし診断・トリアージ・SLA証跡だけを添付しているか確認する'
    }),
    {
      id: 'evidence_integrity',
      title: '証跡の出所と安全性',
      status: evidenceIntegrity.status,
      statusLabel: statusLabel(evidenceIntegrity.status),
      target: '取得日時、匿名確認ID、元資料SHA-256、患者情報なし確認を揃え、ダミー値を使わない',
      actual: `${evidenceIntegrity.statusLabel} / 指摘${evidenceIntegrity.issues.length}件`,
      nextAction: evidenceIntegrity.requiredActions.join(' / ') || '対応不要'
    },
    booleanGate({
      id: 'response_owner',
      title: '対応責任者の別記録',
      ok: bool(evidence.responseOwnerRecordedOutsideJson),
      target: '担当者名はこのJSONへ書かず、院内または社内の別記録で管理する',
      blocked: true,
      missingAction: '対応責任者と引き継ぎ先を別記録へ残す'
    }),
    elapsedGate({
      id: 'acknowledge',
      title: '受付・一次応答',
      elapsed: elapsed.acknowledgeMinutes,
      target: policy.acknowledgeTargetMinutes,
      unit: '分',
      missingAction: '問い合わせ受付時刻と一次応答時刻を記録する',
      lateAction: '一次応答が目標を超えた理由を事後レビューへ回す'
    }),
    booleanGate({
      id: 'notice_channel',
      title: '告知先の確認',
      ok: bool(evidence.noticeChannelRecorded),
      target: '電話、メール、管理画面など告知先の種類だけを記録する',
      blocked: highImpact,
      missingAction: '個人名や宛先を書かず、告知先の種類だけを記録する'
    }),
    booleanGate({
      id: 'user_notice',
      title: '初回告知の準備',
      ok: bool(evidence.userNoticePrepared),
      target: '影響範囲、回避策、次回更新予定を含む告知文を別管理で準備する',
      blocked: highImpact,
      missingAction: '患者名や薬局名を含めない形で初回告知の要点を準備する'
    }),
    elapsedGate({
      id: 'first_notice',
      title: '初回告知までの時間',
      elapsed: elapsed.firstNoticeMinutes,
      target: policy.firstNoticeTargetMinutes,
      unit: '分',
      missingAction: '初回告知の時刻を記録する',
      lateAction: '初回告知が目標を超えた理由を事後レビューへ回す'
    }),
    booleanGate({
      id: 'update_cadence',
      title: '続報間隔',
      ok: bool(evidence.updateCadenceConfirmed),
      target: `${policy.updateIntervalMinutes}分ごとに続報または次回更新予定を出せる`,
      blocked: false,
      missingAction: '復旧までの続報間隔と次回更新予定を確認する'
    }),
    booleanGate({
      id: 'recovery_runbook',
      title: '復旧手順',
      ok: bool(evidence.recoveryRunbookLinked),
      target: '手順本文やローカルパスは書かず、復旧手順の存在だけを確認する',
      blocked: true,
      missingAction: '復旧手順の保管場所を別記録へ残し、SLA証跡には存在確認だけを入れる'
    }),
    elapsedGate({
      id: 'recovery',
      title: '復旧までの時間',
      elapsed: elapsed.recoveryMinutes,
      target: policy.recoveryTargetMinutes,
      unit: '分',
      missingAction: '復旧または暫定回避の時刻を記録する',
      lateAction: '復旧目標を超えた理由と再発防止を事後レビューへ回す'
    }),
    elapsedGate({
      id: 'close_review',
      title: '事後レビュー',
      elapsed: elapsed.closeReviewHours,
      target: policy.closeReviewTargetHours,
      unit: '時間',
      missingAction: '復旧後レビューの実施予定または完了時刻を記録する',
      lateAction: '事後レビュー遅延の理由と再期限を確認する'
    }),
    booleanGate({
      id: 'follow_up_review',
      title: '再発防止レビュー',
      ok: bool(evidence.followUpReviewScheduled),
      target: '再発防止の確認日を別記録で管理する',
      blocked: false,
      missingAction: '再発防止レビューの予定を登録する'
    })
  ];

  if (updateFailureDrill) {
    gates.push(
      booleanGate({
        id: 'pre_update_backup',
        title: '更新前バックアップ',
        ok: bool(evidence.preUpdateBackupConfirmed),
        target: '更新前バックアップまたは戻し先を確認済みにする',
        blocked: true,
        missingAction: '更新失敗時に戻せるバックアップまたは戻し先を確認する'
      }),
      elapsedGate({
        id: 'rollback_decision',
        title: '切り戻し判断',
        elapsed: elapsed.rollbackDecisionMinutes,
        target: policy.rollbackDecisionTargetMinutes,
        unit: '分',
        missingAction: '更新継続、切り戻し、暫定回避の判断時刻を記録する',
        lateAction: '切り戻し判断が遅れた理由を事後レビューへ回す'
      }),
      booleanGate({
        id: 'rollback_or_workaround',
        title: '切り戻しまたは暫定回避',
        ok: bool(evidence.rollbackOrWorkaroundConfirmed),
        target: '更新失敗時に業務を止めない回避策を確認する',
        blocked: highImpact,
        missingAction: '切り戻しまたは暫定回避の可否を確認する'
      }),
      booleanGate({
        id: 'data_migration_impact',
        title: 'データ影響確認',
        ok: bool(evidence.dataMigrationImpactChecked),
        target: 'データ移行やDB更新の影響有無を確認する',
        blocked: false,
        missingAction: '更新失敗がデータへ影響したか確認する'
      }),
      booleanGate({
        id: 'release_pause',
        title: '再配信停止',
        ok: bool(evidence.releasePausedUntilFixed),
        target: '原因確認まで同じ更新を再配信しない',
        blocked: false,
        missingAction: '原因確認まで同じ更新を止める判断を記録する'
      })
    );
  }

  const status = incidentStatus(gates);

  return {
    type: 'yakureki-support-incident-sla-review',
    schemaVersion: 2,
    generatedAt: generatedAt.toISOString(),
    incidentId,
    triageGeneratedAt: input.triage.generatedAt,
    priority: input.triage.priority,
    priorityLabel: input.triage.priorityLabel,
    severity,
    severityLabel: policy.severityLabel,
    status,
    statusLabel: statusLabel(status),
    policy,
    elapsed,
    evidence: {
      capturedAt: String(evidence.capturedAt || '').trim(),
      operatorReviewId: String(evidence.operatorReviewId || '').trim(),
      sourceArtifactSha256: String(evidence.sourceArtifactSha256 || '').trim(),
      noPatientDataConfirmed: bool(evidence.noPatientDataConfirmed),
      responseOwnerRecordedOutsideJson: bool(evidence.responseOwnerRecordedOutsideJson),
      noticeChannelRecorded: bool(evidence.noticeChannelRecorded),
      userNoticePrepared: bool(evidence.userNoticePrepared),
      updateCadenceConfirmed: bool(evidence.updateCadenceConfirmed),
      recoveryRunbookLinked: bool(evidence.recoveryRunbookLinked),
      rollbackOrWorkaroundConfirmed: bool(evidence.rollbackOrWorkaroundConfirmed),
      updateFailureDrill,
      preUpdateBackupConfirmed: bool(evidence.preUpdateBackupConfirmed),
      dataMigrationImpactChecked: bool(evidence.dataMigrationImpactChecked),
      releasePausedUntilFixed: bool(evidence.releasePausedUntilFixed),
      followUpReviewScheduled: bool(evidence.followUpReviewScheduled)
    },
    evidenceIntegrity,
    privacy: {
      containsPatientData: false,
      containsStaffNames: false,
      containsFacilityName: false,
      containsRawAuditDetails: false,
      containsLocalPath: false,
      containsExternalSecrets: false,
      containsRawNoticeText: false,
      containsRawNotes: false
    },
    affectedAreas: buildAffectedAreas(input.triage, evidence.affectedFocusAreaIds),
    gates,
    passedGateCount: gates.filter((gate) => gate.status === 'pass').length,
    attentionGateCount: gates.filter((gate) => gate.status === 'attention').length,
    blockedGateCount: gates.filter((gate) => gate.status === 'blocked').length,
    nextActions: uniqueActions(gates)
  };
}

export function buildSupportIncidentSlaEvidenceTemplate(input: {
  generatedAt?: Date;
  triage: SupportCaseTriage;
  incidentId?: string;
}): SupportIncidentSlaEvidenceTemplate {
  const generatedAt = input.generatedAt ?? new Date();
  const severity = severityFromPriority(input.triage.priority);
  return {
    type: 'yakureki-support-incident-sla-evidence-template',
    schemaVersion: 2,
    generatedAt: generatedAt.toISOString(),
    incidentId: input.incidentId || 'support-incident-sla',
    guidance: '患者名、スタッフ名、薬局名、電話番号、メールアドレス、URL、トークン、ローカルパス、告知本文、自由記述メモはこのJSONに書かず、院内または社内の別記録へ残す',
    capturedAt: '',
    operatorReviewId: '',
    sourceArtifactSha256: '',
    occurredAt: '',
    acknowledgedAt: '',
    firstNoticeAt: '',
    lastStatusUpdateAt: '',
    rollbackDecisionAt: '',
    recoveredAt: '',
    closedAt: '',
    noPatientDataConfirmed: false,
    responseOwnerRecordedOutsideJson: false,
    noticeChannelRecorded: false,
    userNoticePrepared: false,
    updateCadenceConfirmed: false,
    recoveryRunbookLinked: false,
    rollbackOrWorkaroundConfirmed: false,
    updateFailureDrill: false,
    preUpdateBackupConfirmed: false,
    dataMigrationImpactChecked: false,
    releasePausedUntilFixed: false,
    followUpReviewScheduled: false,
    affectedFocusAreaIds: [],
    privacy: {
      containsPatientData: false,
      containsStaffNames: false,
      containsFacilityName: false,
      containsRawAuditDetails: false,
      containsLocalPath: false,
      containsExternalSecrets: false,
      containsRawNoticeText: false,
      containsRawNotes: false
    },
    policy: DEFAULT_POLICY_BY_SEVERITY[severity],
    focusAreas: input.triage.focusAreas.map((area) => ({
      id: area.id,
      title: area.title,
      priorityLabel: area.priorityLabel,
      supportOwner: area.supportOwner
    }))
  };
}

export function buildSupportIncidentSlaCheckRequest(input: {
  generatedAt?: Date;
  triage: SupportCaseTriage;
  incidentId?: string;
}): SupportIncidentSlaCheckRequest {
  const generatedAt = input.generatedAt ?? new Date();
  const severity = severityFromPriority(input.triage.priority);
  const policy = DEFAULT_POLICY_BY_SEVERITY[severity];
  return {
    type: 'yakureki-support-incident-sla-check-request',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    incidentId: input.incidentId || 'support-incident-sla',
    guidance: '実際の障害対応、または意図した更新失敗訓練の実施記録から、日時と確認済みフラグだけをJSONへ残します。告知本文や自由記述メモ、責任者名は院内・社内の別記録に置いてください。',
    severity,
    severityLabel: policy.severityLabel,
    policy,
    items: [
      {
        id: 'incident_timeline',
        title: '対応タイムライン',
        required: true,
        neededFields: [
          '発生日時(occurredAt)',
          '検知・確認日時(acknowledgedAt)',
          '利用者への第一報日時(firstNoticeAt)',
          '直近の状況更新日時(lastStatusUpdateAt)',
          '切り戻し判断日時(rollbackDecisionAt、該当時のみ)',
          '復旧日時(recoveredAt)',
          'クローズ日時(closedAt)'
        ],
        purpose: `検知${policy.acknowledgeTargetMinutes}分以内、第一報${policy.firstNoticeTargetMinutes}分以内、復旧${policy.recoveryTargetMinutes}分以内などのSLA目標を実測値で確認する`,
        storeOnly: '障害内容の詳細、影響患者数、告知本文などの自由記述は院内・社内だけで扱う',
        supportShare: '各区間の経過時間と目標達成有無だけを共有する'
      },
      {
        id: 'response_confirmation',
        title: '対応体制の確認',
        required: true,
        neededFields: [
          '責任者記録の有無(氏名は院内記録、JSONにはtrue/falseだけ)',
          '利用者通知チャネルの記録有無',
          '利用者向け告知文の準備有無',
          '更新頻度の遵守確認',
          '復旧手順書へのリンク確認',
          '切り戻しまたは回避策の確認'
        ],
        purpose: '対応中に必要な体制と手順が実際に機能したかを確認する',
        storeOnly: '通知チャネルの宛先、告知文の本文、手順書のURLは院内・社内だけで扱う',
        supportShare: '各項目の確認済み・未確認だけを共有する'
      },
      {
        id: 'update_failure_drill',
        title: '更新失敗訓練の記録(実施時のみ)',
        required: false,
        neededFields: [
          '更新失敗訓練の実施有無',
          '更新前バックアップ確認',
          'データ移行影響確認',
          '解決までリリース一時停止確認',
          'フォローアップレビュー予定確認'
        ],
        purpose: '実際の障害が起きていない期間でも、意図した更新失敗訓練でSLA運用を検証できるようにする',
        storeOnly: '訓練シナリオの詳細、参加者名は院内・社内だけで扱う',
        supportShare: '訓練実施有無と各確認項目の確認済み・未確認だけを共有する'
      }
    ],
    operatorChecks: [
      '実際の障害対応、または意図した更新失敗訓練のいずれかである',
      'タイムラインの日時はダミーや概算ではなく記録に基づく実測値である',
      '対応体制の確認項目は実際に確認した結果である',
      '患者名、スタッフ名、告知本文などの自由記述をJSONに含めていない'
    ],
    privacyRules: [
      '患者名、スタッフ名、薬局名、電話番号、メールアドレス、URL、トークンをJSONへ入れない',
      '告知本文、対応メモなどの自由記述をJSONへ入れない',
      'ダミーや訓練していない想定シナリオを実施済みの更新失敗訓練として扱わない'
    ],
    commandEnvironment: {
      triageJson: 'YAKUREKI_SUPPORT_TRIAGE_JSON',
      evidenceJson: 'YAKUREKI_SUPPORT_SLA_EVIDENCE',
      outputDir: 'YAKUREKI_SUPPORT_SLA_OUTPUT_DIR',
      incidentId: 'YAKUREKI_SUPPORT_INCIDENT_ID'
    }
  };
}

export function buildSupportIncidentSlaCheckRequestChecklist(request: SupportIncidentSlaCheckRequest): string {
  return [
    '障害対応・更新失敗訓練 証跡提出依頼',
    `対象: ${request.incidentId} (重大度: ${request.severityLabel})`,
    '目的: 実際の障害対応、または更新失敗訓練から、患者情報・自由記述を含まない確認済みフラグと経過時間だけを残す',
    '',
    '提出してほしいもの:',
    ...request.items.map((item) => [
      `- ${item.title}: ${item.required ? '必須' : '任意（実施時のみ）'}`,
      `  必要な項目: ${item.neededFields.join('、')}`,
      `  目的: ${item.purpose}`,
      `  院内・社内だけで扱うもの: ${item.storeOnly}`,
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
    `- サポートトリアージJSON: ${request.commandEnvironment.triageJson}`,
    `- 障害対応証跡JSON: ${request.commandEnvironment.evidenceJson}`,
    `- 出力先: ${request.commandEnvironment.outputDir}`,
    `- インシデントID: ${request.commandEnvironment.incidentId}`
  ].join('\n');
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function yesNo(value: boolean | undefined): string {
  if (value === undefined) return '未記録';
  return value ? 'OK' : '要確認';
}

export function buildSupportIncidentSlaCsv(review: SupportIncidentSlaReview): string {
  const rows = [
    ['区分', '判定', '対象', '目標', '実績', '次の対応'],
    [
      '総括',
      review.statusLabel,
      `${review.severityLabel} / ${review.priorityLabel}`,
      `受付 ${review.policy.acknowledgeTargetMinutes}分、告知 ${review.policy.firstNoticeTargetMinutes}分、復旧 ${review.policy.recoveryTargetMinutes}分`,
      `OK ${review.passedGateCount} / 確認 ${review.attentionGateCount} / 未完了 ${review.blockedGateCount}`,
      review.nextActions[0] ?? '対応不要'
    ],
    [
      '証跡品質',
      review.evidenceIntegrity.statusLabel,
      '出所・患者情報なし・ダミー混入',
      '取得日時、匿名確認ID、元資料SHA-256、患者情報なし確認',
      `指摘 ${review.evidenceIntegrity.issues.length}件`,
      review.evidenceIntegrity.requiredActions.join(' / ') || '対応不要'
    ],
    ...review.gates.map((gate) => [
      '確認ゲート',
      gate.statusLabel,
      gate.title,
      gate.target,
      gate.actual,
      gate.nextAction
    ]),
    ...review.affectedAreas.map((area) => [
      '影響領域',
      area.priorityLabel,
      area.title,
      area.supportOwner,
      area.id,
      area.nextAction
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildSupportIncidentNoticeChecklist(review: SupportIncidentSlaReview): string {
  return [
    `障害対応・告知チェック ${review.statusLabel}`,
    `重大度: ${review.severityLabel}`,
    `初回告知目標: ${review.policy.firstNoticeTargetMinutes}分以内`,
    `続報間隔: ${review.policy.updateIntervalMinutes}分ごと`,
    `復旧目標: ${review.policy.recoveryTargetMinutes}分以内`,
    '',
    '告知に入れる要点:',
    '- 影響している機能の種類',
    '- 現場で使える回避策',
    '- 次回更新予定',
    '- 復旧または暫定回避の時刻',
    '',
    'このチェックリストに入れないもの:',
    '- 患者名、スタッフ名、薬局名',
    '- 電話番号、メールアドレス、URL、トークン',
    '- 告知本文そのもの、自由記述メモ、ローカルパス',
    '',
    '未完了の次対応:',
    ...(review.nextActions.length > 0 ? review.nextActions.map((action) => `- ${action}`) : ['- 対応不要'])
  ].join('\n');
}

export function buildSupportIncidentSlaAuditDetail(review: SupportIncidentSlaReview): string {
  return [
    `障害対応・SLA ${review.statusLabel}`,
    `重大度 ${review.severityLabel}`,
    `受付 ${review.elapsed.acknowledgeMinutes ?? '未記録'}分`,
    `初回告知 ${review.elapsed.firstNoticeMinutes ?? '未記録'}分`,
    `復旧 ${review.elapsed.recoveryMinutes ?? '未記録'}分`,
    `未完了 ${review.blockedGateCount}件`
  ].join(' / ');
}
