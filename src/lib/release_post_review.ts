import {
  buildEvidenceIntegrityReview,
  type EvidenceIntegrityReview
} from './evidence_integrity.ts';

export type ReleasePostReviewStatus = 'pass' | 'attention' | 'blocked';
export type ReleasePostReviewRisk = 'critical' | 'high' | 'normal' | 'low';

export interface ReleasePostReviewEvidenceInput {
  releaseId?: string;
  capturedAt?: string;
  operatorReviewId?: string;
  sourceArtifactSha256?: string;
  risk?: ReleasePostReviewRisk;
  deployedAt?: string;
  observationClosedAt?: string;
  observationTargetHours?: number;
  noPatientDataConfirmed?: boolean;
  readinessReviewAttached?: boolean;
  slaReviewAttached?: boolean;
  smokeTestPassed?: boolean;
  monitoringReviewed?: boolean;
  supportCaseCount?: number;
  maxSupportCaseCount?: number;
  errorCount?: number;
  maxErrorCount?: number;
  downtimeMinutes?: number;
  maxDowntimeMinutes?: number;
  rollbackExecuted?: boolean;
  rollbackOutcomeConfirmed?: boolean;
  releasePausedUntilFixed?: boolean;
  userNoticeClosed?: boolean;
  followUpActionsRegistered?: boolean;
  postReleaseReviewCompleted?: boolean;
}

export interface ReleasePostReviewGate {
  id: string;
  title: string;
  status: ReleasePostReviewStatus;
  statusLabel: string;
  target: string;
  actual: string;
  nextAction: string;
}

export interface ReleasePostReview {
  type: 'yakureki-release-post-review';
  schemaVersion: 2;
  generatedAt: string;
  releaseId: string;
  risk: ReleasePostReviewRisk;
  riskLabel: string;
  status: ReleasePostReviewStatus;
  statusLabel: string;
  deployedAt?: string;
  observationClosedAt?: string;
  observationHours?: number;
  observationTargetHours: number;
  metrics: {
    supportCaseCount: number;
    maxSupportCaseCount: number;
    errorCount: number;
    maxErrorCount: number;
    downtimeMinutes: number;
    maxDowntimeMinutes: number;
  };
  evidence: {
    capturedAt: string;
    operatorReviewId: string;
    sourceArtifactSha256: string;
    noPatientDataConfirmed: boolean;
    readinessReviewAttached: boolean;
    slaReviewAttached: boolean;
    smokeTestPassed: boolean;
    monitoringReviewed: boolean;
    rollbackExecuted: boolean;
    rollbackOutcomeConfirmed: boolean;
    releasePausedUntilFixed: boolean;
    userNoticeClosed: boolean;
    followUpActionsRegistered: boolean;
    postReleaseReviewCompleted: boolean;
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
  };
  evidenceIntegrity: EvidenceIntegrityReview;
  gates: ReleasePostReviewGate[];
  passedGateCount: number;
  attentionGateCount: number;
  blockedGateCount: number;
  nextActions: string[];
}

export interface ReleasePostReviewEvidenceTemplate {
  type: 'yakureki-release-post-review-evidence-template';
  schemaVersion: 2;
  generatedAt: string;
  releaseId: string;
  guidance: string;
  capturedAt: string;
  operatorReviewId: string;
  sourceArtifactSha256: string;
  risk: ReleasePostReviewRisk;
  deployedAt: string;
  observationClosedAt: string;
  observationTargetHours: number;
  noPatientDataConfirmed: false;
  readinessReviewAttached: false;
  slaReviewAttached: false;
  smokeTestPassed: false;
  monitoringReviewed: false;
  supportCaseCount: number;
  maxSupportCaseCount: number;
  errorCount: number;
  maxErrorCount: number;
  downtimeMinutes: number;
  maxDowntimeMinutes: number;
  rollbackExecuted: false;
  rollbackOutcomeConfirmed: false;
  releasePausedUntilFixed: false;
  userNoticeClosed: false;
  followUpActionsRegistered: false;
  postReleaseReviewCompleted: false;
  privacy: ReleasePostReview['privacy'];
}

const RISK_LABELS: Record<ReleasePostReviewRisk, string> = {
  critical: '重大',
  high: '高',
  normal: '通常',
  low: '低'
};

function normalizeRisk(value: string | undefined): ReleasePostReviewRisk {
  if (value === 'critical' || value === 'high' || value === 'low') return value;
  return 'normal';
}

function statusLabel(status: ReleasePostReviewStatus): string {
  if (status === 'pass') return '更新後レビューOK';
  if (status === 'attention') return '更新後レビューを確認';
  return '更新後レビュー未完了';
}

function bool(value: boolean | undefined): boolean {
  return value === true;
}

function finiteNonNegative(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : undefined;
}

function elapsedHours(start: string | undefined, end: string | undefined): number | undefined {
  const startTime = Date.parse(start || '');
  const endTime = Date.parse(end || '');
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    return undefined;
  }
  return Math.round(((endTime - startTime) / 3_600_000) * 10) / 10;
}

function gate(options: {
  id: string;
  title: string;
  ok: boolean;
  target: string;
  actual?: string;
  blocked?: boolean;
  nextAction: string;
}): ReleasePostReviewGate {
  if (options.ok) {
    return {
      id: options.id,
      title: options.title,
      status: 'pass',
      statusLabel: statusLabel('pass'),
      target: options.target,
      actual: options.actual ?? 'OK',
      nextAction: '対応不要'
    };
  }
  const status: ReleasePostReviewStatus = options.blocked ? 'blocked' : 'attention';
  return {
    id: options.id,
    title: options.title,
    status,
    statusLabel: statusLabel(status),
    target: options.target,
    actual: options.actual ?? '未記録',
    nextAction: options.nextAction
  };
}

function metricGate(options: {
  id: string;
  title: string;
  value: number;
  max: number;
  unit: string;
  blocked?: boolean;
  nextAction: string;
}): ReleasePostReviewGate {
  return gate({
    id: options.id,
    title: options.title,
    ok: options.value <= options.max,
    target: `${options.max}${options.unit}以下`,
    actual: `${options.value}${options.unit}`,
    blocked: options.blocked,
    nextAction: options.nextAction
  });
}

function summarizeStatus(gates: ReleasePostReviewGate[]): ReleasePostReviewStatus {
  if (gates.some((item) => item.status === 'blocked')) return 'blocked';
  if (gates.some((item) => item.status === 'attention')) return 'attention';
  return 'pass';
}

function uniqueActions(gates: ReleasePostReviewGate[]): string[] {
  return Array.from(new Set(
    gates
      .filter((gateReview) => gateReview.status !== 'pass')
      .map((gateReview) => gateReview.nextAction)
      .filter(Boolean)
  ));
}

function highRisk(risk: ReleasePostReviewRisk): boolean {
  return risk === 'critical' || risk === 'high';
}

export function buildReleasePostReview(input: {
  generatedAt?: Date;
  evidence?: ReleasePostReviewEvidenceInput;
} = {}): ReleasePostReview {
  const generatedAt = input.generatedAt ?? new Date();
  const evidence = input.evidence ?? {};
  const risk = normalizeRisk(evidence.risk);
  const isHighRisk = highRisk(risk);
  const releaseId = String(evidence.releaseId || 'release-post-review').trim();
  const observationTargetHours = finiteNonNegative(evidence.observationTargetHours) ?? (isHighRisk ? 24 : 72);
  const supportCaseCount = finiteNonNegative(evidence.supportCaseCount) ?? 0;
  const maxSupportCaseCount = finiteNonNegative(evidence.maxSupportCaseCount) ?? (isHighRisk ? 1 : 5);
  const errorCount = finiteNonNegative(evidence.errorCount) ?? 0;
  const maxErrorCount = finiteNonNegative(evidence.maxErrorCount) ?? (isHighRisk ? 0 : 3);
  const downtimeMinutes = finiteNonNegative(evidence.downtimeMinutes) ?? 0;
  const maxDowntimeMinutes = finiteNonNegative(evidence.maxDowntimeMinutes) ?? (isHighRisk ? 5 : 15);
  const observationHours = elapsedHours(evidence.deployedAt, evidence.observationClosedAt);
  const rollbackExecuted = bool(evidence.rollbackExecuted);
  const evidenceIntegrity = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: String(evidence.releaseId || evidence.operatorReviewId || 'release-post-review').trim(),
    claimKind: 'release_post_review',
    evidence: {
      releaseId,
      capturedAt: evidence.capturedAt,
      operatorReviewId: evidence.operatorReviewId,
      sourceArtifactSha256: evidence.sourceArtifactSha256,
      noPatientDataConfirmed: bool(evidence.noPatientDataConfirmed),
      evidenceKind: 'actual release post review',
      risk,
      deployedAt: evidence.deployedAt,
      observationClosedAt: evidence.observationClosedAt,
      readinessReviewAttached: bool(evidence.readinessReviewAttached),
      slaReviewAttached: bool(evidence.slaReviewAttached),
      smokeTestPassed: bool(evidence.smokeTestPassed),
      monitoringReviewed: bool(evidence.monitoringReviewed),
      supportCaseCount,
      errorCount,
      downtimeMinutes,
      rollbackExecuted,
      rollbackOutcomeConfirmed: bool(evidence.rollbackOutcomeConfirmed),
      releasePausedUntilFixed: bool(evidence.releasePausedUntilFixed),
      userNoticeClosed: bool(evidence.userNoticeClosed),
      followUpActionsRegistered: bool(evidence.followUpActionsRegistered),
      postReleaseReviewCompleted: bool(evidence.postReleaseReviewCompleted)
    },
    noPatientDataExpected: true,
    realWorldEvidenceRequired: true
  });

  const gates: ReleasePostReviewGate[] = [
    gate({
      id: 'privacy',
      title: '患者情報なし確認',
      ok: bool(evidence.noPatientDataConfirmed),
      target: '患者名、スタッフ名、薬局名、URL、トークン、問い合わせ本文、告知本文を含めない',
      blocked: true,
      nextAction: '更新後レビューへ個人情報や秘密情報を含めず、本文は別管理にする'
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
    gate({
      id: 'readiness_review',
      title: '更新準備レビュー添付',
      ok: bool(evidence.readinessReviewAttached),
      target: '更新前の準備レビューJSONを一緒に保管する',
      blocked: true,
      nextAction: 'リリース・更新準備レビューJSONを添付する'
    }),
    gate({
      id: 'sla_review',
      title: '障害対応レビュー連携',
      ok: bool(evidence.slaReviewAttached),
      target: '障害対応・SLAレビューとつながっている',
      blocked: isHighRisk,
      nextAction: '障害対応・SLAレビューJSONを添付する'
    }),
    gate({
      id: 'smoke_test',
      title: '更新後の最小確認',
      ok: bool(evidence.smokeTestPassed),
      target: '受付、薬歴、印刷、請求などの最小確認が通っている',
      blocked: true,
      nextAction: '更新後の最小確認を実施し、失敗した画面を別記録へ残す'
    }),
    gate({
      id: 'monitoring',
      title: '監視確認',
      ok: bool(evidence.monitoringReviewed),
      target: '更新後のエラー、問い合わせ、主要KPIを確認した',
      blocked: true,
      nextAction: '更新後の監視時刻と確認結果を記録する'
    }),
    gate({
      id: 'observation_window',
      title: '観察時間',
      ok: observationHours !== undefined && observationHours >= observationTargetHours,
      target: `${observationTargetHours}時間以上`,
      actual: observationHours === undefined ? '未記録' : `${observationHours}時間`,
      blocked: isHighRisk,
      nextAction: '観察終了時刻を記録し、目標時間まで問い合わせとエラーを確認する'
    }),
    metricGate({
      id: 'support_cases',
      title: '更新後問い合わせ',
      value: supportCaseCount,
      max: maxSupportCaseCount,
      unit: '件',
      blocked: isHighRisk && supportCaseCount > maxSupportCaseCount,
      nextAction: '問い合わせ内容を分類し、再配信停止または追加告知が必要か確認する'
    }),
    metricGate({
      id: 'errors',
      title: '更新後エラー',
      value: errorCount,
      max: maxErrorCount,
      unit: '件',
      blocked: errorCount > maxErrorCount,
      nextAction: 'エラー件数が目標を超えたため、配信停止と戻し判断を確認する'
    }),
    metricGate({
      id: 'downtime',
      title: '停止時間',
      value: downtimeMinutes,
      max: maxDowntimeMinutes,
      unit: '分',
      blocked: downtimeMinutes > maxDowntimeMinutes,
      nextAction: '停止時間が目標を超えたため、利用者告知と復旧後レビューを確認する'
    }),
    gate({
      id: 'rollback_outcome',
      title: '戻し結果',
      ok: !rollbackExecuted || bool(evidence.rollbackOutcomeConfirmed),
      target: '戻しを実行した場合は結果を確認する',
      blocked: rollbackExecuted,
      nextAction: '戻し結果と復旧後の最小確認を記録する'
    }),
    gate({
      id: 'release_pause',
      title: '再配信停止',
      ok: !rollbackExecuted || bool(evidence.releasePausedUntilFixed),
      target: '戻しを実行した場合は原因確認まで再配信を止める',
      blocked: rollbackExecuted,
      nextAction: '原因確認まで同じ更新を再配信しない判断を記録する'
    }),
    gate({
      id: 'user_notice_close',
      title: '告知のクローズ',
      ok: bool(evidence.userNoticeClosed),
      target: '告知した場合は復旧または対応完了も案内できる',
      blocked: false,
      nextAction: '復旧または対応完了の告知を別管理で閉じる'
    }),
    gate({
      id: 'follow_up_actions',
      title: '残対応登録',
      ok: bool(evidence.followUpActionsRegistered),
      target: '未解決の問い合わせ、エラー、改善を次アクションへ登録する',
      blocked: false,
      nextAction: '残対応を次アクションへ登録する'
    }),
    gate({
      id: 'post_release_review',
      title: 'レビュー完了',
      ok: bool(evidence.postReleaseReviewCompleted),
      target: '更新後レビューを完了し、継続監視または完了を判断する',
      blocked: false,
      nextAction: '更新後レビューを完了する'
    })
  ];
  const status = summarizeStatus(gates);

  return {
    type: 'yakureki-release-post-review',
    schemaVersion: 2,
    generatedAt: generatedAt.toISOString(),
    releaseId,
    risk,
    riskLabel: RISK_LABELS[risk],
    status,
    statusLabel: statusLabel(status),
    deployedAt: evidence.deployedAt,
    observationClosedAt: evidence.observationClosedAt,
    observationHours,
    observationTargetHours,
    metrics: {
      supportCaseCount,
      maxSupportCaseCount,
      errorCount,
      maxErrorCount,
      downtimeMinutes,
      maxDowntimeMinutes
    },
    evidence: {
      capturedAt: String(evidence.capturedAt || '').trim(),
      operatorReviewId: String(evidence.operatorReviewId || '').trim(),
      sourceArtifactSha256: String(evidence.sourceArtifactSha256 || '').trim(),
      noPatientDataConfirmed: bool(evidence.noPatientDataConfirmed),
      readinessReviewAttached: bool(evidence.readinessReviewAttached),
      slaReviewAttached: bool(evidence.slaReviewAttached),
      smokeTestPassed: bool(evidence.smokeTestPassed),
      monitoringReviewed: bool(evidence.monitoringReviewed),
      rollbackExecuted,
      rollbackOutcomeConfirmed: bool(evidence.rollbackOutcomeConfirmed),
      releasePausedUntilFixed: bool(evidence.releasePausedUntilFixed),
      userNoticeClosed: bool(evidence.userNoticeClosed),
      followUpActionsRegistered: bool(evidence.followUpActionsRegistered),
      postReleaseReviewCompleted: bool(evidence.postReleaseReviewCompleted)
    },
    privacy: {
      containsPatientData: false,
      containsStaffNames: false,
      containsFacilityName: false,
      containsRawAuditDetails: false,
      containsLocalPath: false,
      containsExternalSecrets: false,
      containsRawNoticeText: false,
      containsRawSupportText: false
    },
    evidenceIntegrity,
    gates,
    passedGateCount: gates.filter((gateReview) => gateReview.status === 'pass').length,
    attentionGateCount: gates.filter((gateReview) => gateReview.status === 'attention').length,
    blockedGateCount: gates.filter((gateReview) => gateReview.status === 'blocked').length,
    nextActions: uniqueActions(gates)
  };
}

export function buildReleasePostReviewEvidenceTemplate(input: {
  generatedAt?: Date;
  releaseId?: string;
  risk?: ReleasePostReviewRisk;
} = {}): ReleasePostReviewEvidenceTemplate {
  const generatedAt = input.generatedAt ?? new Date();
  const risk = normalizeRisk(input.risk);
  const isHighRisk = highRisk(risk);
  return {
    type: 'yakureki-release-post-review-evidence-template',
    schemaVersion: 2,
    generatedAt: generatedAt.toISOString(),
    releaseId: input.releaseId || 'release-post-review',
    guidance: '患者名、スタッフ名、薬局名、電話番号、メールアドレス、URL、トークン、ローカルパス、問い合わせ本文、告知本文、自由記述メモはこのJSONに書かず、院内または社内の別記録へ残す',
    capturedAt: '',
    operatorReviewId: '',
    sourceArtifactSha256: '',
    risk,
    deployedAt: '',
    observationClosedAt: '',
    observationTargetHours: isHighRisk ? 24 : 72,
    noPatientDataConfirmed: false,
    readinessReviewAttached: false,
    slaReviewAttached: false,
    smokeTestPassed: false,
    monitoringReviewed: false,
    supportCaseCount: 0,
    maxSupportCaseCount: isHighRisk ? 1 : 5,
    errorCount: 0,
    maxErrorCount: isHighRisk ? 0 : 3,
    downtimeMinutes: 0,
    maxDowntimeMinutes: isHighRisk ? 5 : 15,
    rollbackExecuted: false,
    rollbackOutcomeConfirmed: false,
    releasePausedUntilFixed: false,
    userNoticeClosed: false,
    followUpActionsRegistered: false,
    postReleaseReviewCompleted: false,
    privacy: {
      containsPatientData: false,
      containsStaffNames: false,
      containsFacilityName: false,
      containsRawAuditDetails: false,
      containsLocalPath: false,
      containsExternalSecrets: false,
      containsRawNoticeText: false,
      containsRawSupportText: false
    }
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildReleasePostReviewCsv(review: ReleasePostReview): string {
  const rows = [
    ['区分', '判定', '対象', '目標', '実績', '次の対応'],
    [
      '総括',
      review.statusLabel,
      `${review.releaseId} / ${review.riskLabel}`,
      `観察 ${review.observationTargetHours}時間 / 問い合わせ ${review.metrics.maxSupportCaseCount}件 / エラー ${review.metrics.maxErrorCount}件`,
      `OK ${review.passedGateCount} / 確認 ${review.attentionGateCount} / 未完了 ${review.blockedGateCount}`,
      review.nextActions[0] ?? '対応不要'
    ],
    ...review.gates.map((gateReview) => [
      '確認ゲート',
      gateReview.statusLabel,
      gateReview.title,
      gateReview.target,
      gateReview.actual,
      gateReview.nextAction
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildReleasePostReviewChecklist(review: ReleasePostReview): string {
  return [
    `リリース後レビュー ${review.statusLabel}`,
    `リスク: ${review.riskLabel}`,
    `観察時間: ${review.observationHours ?? '未記録'} / 目標 ${review.observationTargetHours}時間`,
    `問い合わせ: ${review.metrics.supportCaseCount} / 目標 ${review.metrics.maxSupportCaseCount}件`,
    `エラー: ${review.metrics.errorCount} / 目標 ${review.metrics.maxErrorCount}件`,
    `停止時間: ${review.metrics.downtimeMinutes} / 目標 ${review.metrics.maxDowntimeMinutes}分`,
    '',
    '更新後に見るもの:',
    '- 更新準備レビューとSLAレビューが添付されているか',
    '- 更新後の最小確認が通ったか',
    '- エラー、問い合わせ、停止時間が目標内か',
    '- 戻しを実行した場合に結果と再配信停止を確認したか',
    '- 告知を閉じ、残対応を次アクションへ登録したか',
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

export function buildReleasePostReviewAuditDetail(review: ReleasePostReview): string {
  return [
    `リリース後レビュー ${review.statusLabel}`,
    `リスク ${review.riskLabel}`,
    `観察 ${review.observationHours ?? '未記録'}時間`,
    `問い合わせ ${review.metrics.supportCaseCount}件`,
    `エラー ${review.metrics.errorCount}件`,
    `未完了 ${review.blockedGateCount}件`
  ].join(' / ');
}
