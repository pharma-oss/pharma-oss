import {
  buildEvidenceIntegrityReview,
  type EvidenceIntegrityReview
} from './evidence_integrity.ts';

export type ReleaseUpdateReadinessStatus = 'pass' | 'attention' | 'blocked';
export type ReleaseUpdateRisk = 'critical' | 'high' | 'normal' | 'low';
export type ReleaseUpdateKind = 'hotfix' | 'minor' | 'major' | 'maintenance';

export interface ReleaseUpdateEvidenceInput {
  releaseId?: string;
  capturedAt?: string;
  operatorReviewId?: string;
  sourceArtifactSha256?: string;
  kind?: ReleaseUpdateKind;
  risk?: ReleaseUpdateRisk;
  plannedAt?: string;
  noPatientDataConfirmed?: boolean;
  releaseNotePrepared?: boolean;
  userNoticePrepared?: boolean;
  maintenanceWindowConfirmed?: boolean;
  buildVerified?: boolean;
  versionTagged?: boolean;
  migrationReviewed?: boolean;
  preUpdateBackupConfirmed?: boolean;
  rollbackPackageVerified?: boolean;
  rollbackTested?: boolean;
  rollbackTargetMinutes?: number;
  expectedDowntimeMinutes?: number;
  smokeTestPlanReady?: boolean;
  canaryOrPhasedRollout?: boolean;
  pauseSwitchConfirmed?: boolean;
  monitoringPrepared?: boolean;
  supportStaffingConfirmed?: boolean;
  slaReviewAttached?: boolean;
  dataMigrationImpactChecked?: boolean;
  postReleaseReviewScheduled?: boolean;
}

export interface ReleaseUpdateGateReview {
  id: string;
  title: string;
  status: ReleaseUpdateReadinessStatus;
  statusLabel: string;
  target: string;
  actual: string;
  nextAction: string;
}

export interface ReleaseUpdateReadinessReview {
  type: 'yakureki-release-update-readiness-review';
  schemaVersion: 2;
  generatedAt: string;
  releaseId: string;
  kind: ReleaseUpdateKind;
  kindLabel: string;
  risk: ReleaseUpdateRisk;
  riskLabel: string;
  plannedAt?: string;
  status: ReleaseUpdateReadinessStatus;
  statusLabel: string;
  gateCount: number;
  passedGateCount: number;
  attentionGateCount: number;
  blockedGateCount: number;
  rollbackTargetMinutes: number;
  expectedDowntimeMinutes: number;
  privacy: {
    containsPatientData: false;
    containsStaffNames: false;
    containsFacilityName: false;
    containsRawAuditDetails: false;
    containsLocalPath: false;
    containsExternalSecrets: false;
    containsRawNoticeText: false;
    containsRawReleaseNotes: false;
  };
  evidence: {
    capturedAt: string;
    operatorReviewId: string;
    sourceArtifactSha256: string;
    noPatientDataConfirmed: boolean;
  };
  evidenceIntegrity: EvidenceIntegrityReview;
  gates: ReleaseUpdateGateReview[];
  nextActions: string[];
}

export interface ReleaseUpdateEvidenceTemplate {
  type: 'yakureki-release-update-readiness-evidence-template';
  schemaVersion: 2;
  generatedAt: string;
  releaseId: string;
  guidance: string;
  capturedAt: string;
  operatorReviewId: string;
  sourceArtifactSha256: string;
  kind: ReleaseUpdateKind;
  risk: ReleaseUpdateRisk;
  plannedAt: string;
  noPatientDataConfirmed: false;
  releaseNotePrepared: false;
  userNoticePrepared: false;
  maintenanceWindowConfirmed: false;
  buildVerified: false;
  versionTagged: false;
  migrationReviewed: false;
  preUpdateBackupConfirmed: false;
  rollbackPackageVerified: false;
  rollbackTested: false;
  rollbackTargetMinutes: number;
  expectedDowntimeMinutes: number;
  smokeTestPlanReady: false;
  canaryOrPhasedRollout: false;
  pauseSwitchConfirmed: false;
  monitoringPrepared: false;
  supportStaffingConfirmed: false;
  slaReviewAttached: false;
  dataMigrationImpactChecked: false;
  postReleaseReviewScheduled: false;
  privacy: ReleaseUpdateReadinessReview['privacy'];
}

const KIND_LABELS: Record<ReleaseUpdateKind, string> = {
  hotfix: '緊急修正',
  minor: '通常更新',
  major: '大型更新',
  maintenance: '保守更新'
};

const RISK_LABELS: Record<ReleaseUpdateRisk, string> = {
  critical: '重大',
  high: '高',
  normal: '通常',
  low: '低'
};

function statusLabel(status: ReleaseUpdateReadinessStatus): string {
  if (status === 'pass') return '更新準備OK';
  if (status === 'attention') return '更新準備を確認';
  return '更新停止';
}

function bool(value: boolean | undefined): boolean {
  return value === true;
}

function finitePositive(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : undefined;
}

function normalizeKind(value: string | undefined): ReleaseUpdateKind {
  if (value === 'hotfix' || value === 'major' || value === 'maintenance') return value;
  return 'minor';
}

function normalizeRisk(value: string | undefined, kind: ReleaseUpdateKind): ReleaseUpdateRisk {
  if (value === 'critical' || value === 'high' || value === 'normal' || value === 'low') return value;
  if (kind === 'hotfix') return 'high';
  if (kind === 'major') return 'critical';
  if (kind === 'maintenance') return 'low';
  return 'normal';
}

function highRisk(risk: ReleaseUpdateRisk): boolean {
  return risk === 'critical' || risk === 'high';
}

function gate(options: {
  id: string;
  title: string;
  ok: boolean;
  target: string;
  actual?: string;
  blocked?: boolean;
  nextAction: string;
}): ReleaseUpdateGateReview {
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
  const status: ReleaseUpdateReadinessStatus = options.blocked ? 'blocked' : 'attention';
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

function timeGate(options: {
  id: string;
  title: string;
  value: number;
  target: number;
  unit: string;
  blocked?: boolean;
  nextAction: string;
}): ReleaseUpdateGateReview {
  return gate({
    id: options.id,
    title: options.title,
    ok: options.value <= options.target,
    target: `${options.target}${options.unit}以内`,
    actual: `${options.value}${options.unit}`,
    blocked: options.blocked,
    nextAction: options.nextAction
  });
}

function summarizeStatus(gates: ReleaseUpdateGateReview[]): ReleaseUpdateReadinessStatus {
  if (gates.some((item) => item.status === 'blocked')) return 'blocked';
  if (gates.some((item) => item.status === 'attention')) return 'attention';
  return 'pass';
}

function uniqueActions(gates: ReleaseUpdateGateReview[]): string[] {
  return Array.from(new Set(
    gates
      .filter((gateReview) => gateReview.status !== 'pass')
      .map((gateReview) => gateReview.nextAction)
      .filter(Boolean)
  ));
}

export function buildReleaseUpdateReadinessReview(input: {
  generatedAt?: Date;
  evidence?: ReleaseUpdateEvidenceInput;
} = {}): ReleaseUpdateReadinessReview {
  const generatedAt = input.generatedAt ?? new Date();
  const evidence = input.evidence ?? {};
  const kind = normalizeKind(evidence.kind);
  const risk = normalizeRisk(evidence.risk, kind);
  const isHighRisk = highRisk(risk);
  const rollbackTargetMinutes = finitePositive(evidence.rollbackTargetMinutes) ?? (isHighRisk ? 30 : 60);
  const expectedDowntimeMinutes = finitePositive(evidence.expectedDowntimeMinutes) ?? 0;
  const releaseId = String(evidence.releaseId || 'release-update-readiness').trim();
  const evidenceIntegrity = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: String(evidence.releaseId || evidence.operatorReviewId || 'release-update-readiness').trim(),
    claimKind: 'release_update_readiness',
    evidence: {
      releaseId,
      capturedAt: evidence.capturedAt,
      operatorReviewId: evidence.operatorReviewId,
      sourceArtifactSha256: evidence.sourceArtifactSha256,
      noPatientDataConfirmed: bool(evidence.noPatientDataConfirmed),
      evidenceKind: 'actual release update readiness review',
      kind,
      risk,
      plannedAt: evidence.plannedAt,
      releaseNotePrepared: bool(evidence.releaseNotePrepared),
      userNoticePrepared: bool(evidence.userNoticePrepared),
      maintenanceWindowConfirmed: bool(evidence.maintenanceWindowConfirmed),
      buildVerified: bool(evidence.buildVerified),
      versionTagged: bool(evidence.versionTagged),
      migrationReviewed: bool(evidence.migrationReviewed),
      preUpdateBackupConfirmed: bool(evidence.preUpdateBackupConfirmed),
      rollbackPackageVerified: bool(evidence.rollbackPackageVerified),
      rollbackTested: bool(evidence.rollbackTested),
      smokeTestPlanReady: bool(evidence.smokeTestPlanReady),
      canaryOrPhasedRollout: bool(evidence.canaryOrPhasedRollout),
      pauseSwitchConfirmed: bool(evidence.pauseSwitchConfirmed),
      monitoringPrepared: bool(evidence.monitoringPrepared),
      supportStaffingConfirmed: bool(evidence.supportStaffingConfirmed),
      slaReviewAttached: bool(evidence.slaReviewAttached),
      dataMigrationImpactChecked: bool(evidence.dataMigrationImpactChecked),
      postReleaseReviewScheduled: bool(evidence.postReleaseReviewScheduled)
    },
    noPatientDataExpected: true,
    realWorldEvidenceRequired: true
  });

  const gates: ReleaseUpdateGateReview[] = [
    gate({
      id: 'privacy',
      title: '患者情報なし確認',
      ok: bool(evidence.noPatientDataConfirmed),
      target: '患者名、スタッフ名、薬局名、URL、トークン、告知本文、リリースノート本文を含めない',
      blocked: true,
      nextAction: '更新準備レビューへ個人情報や秘密情報を含めず、本文は別管理にする'
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
      id: 'version_tag',
      title: 'バージョン固定',
      ok: bool(evidence.versionTagged),
      target: '配信する版、戻す版、対象環境を別記録で固定する',
      blocked: true,
      nextAction: '配信版と戻し先を確定してから更新を出す'
    }),
    gate({
      id: 'build_verified',
      title: 'ビルド確認',
      ok: bool(evidence.buildVerified),
      target: 'production build と対象テストが通っている',
      blocked: true,
      nextAction: 'production build と対象テストを通してから更新を出す'
    }),
    gate({
      id: 'release_note',
      title: '更新内容の要点',
      ok: bool(evidence.releaseNotePrepared),
      target: '更新内容、影響範囲、戻し方の要点を別管理で準備する',
      blocked: isHighRisk,
      nextAction: 'リリースノート本文は別管理にし、レビューには準備済みかだけ残す'
    }),
    gate({
      id: 'user_notice',
      title: '利用者への告知',
      ok: bool(evidence.userNoticePrepared),
      target: '停止予定、回避策、問い合わせ先の種類を告知できる',
      blocked: isHighRisk || expectedDowntimeMinutes > 0,
      nextAction: '告知本文や宛先は別管理にし、告知準備済みかだけ残す'
    }),
    gate({
      id: 'maintenance_window',
      title: '更新時間帯',
      ok: bool(evidence.maintenanceWindowConfirmed) || expectedDowntimeMinutes === 0,
      target: '業務影響の少ない時間帯または無停止更新であることを確認する',
      blocked: expectedDowntimeMinutes > 0,
      nextAction: '停止または操作制限が出る場合は更新時間帯を確定する'
    }),
    gate({
      id: 'migration_review',
      title: 'データ変更の確認',
      ok: bool(evidence.migrationReviewed),
      target: 'DB変更、移行、設定変更の有無を確認する',
      blocked: kind === 'major' || isHighRisk,
      nextAction: 'データ変更の有無と戻し方を確認する'
    }),
    gate({
      id: 'pre_update_backup',
      title: '更新前バックアップ',
      ok: bool(evidence.preUpdateBackupConfirmed),
      target: '更新前に戻せるバックアップまたはスナップショットを確認する',
      blocked: true,
      nextAction: '更新前バックアップまたは戻し先を確認する'
    }),
    gate({
      id: 'rollback_package',
      title: '戻し手段',
      ok: bool(evidence.rollbackPackageVerified),
      target: '前版へ戻す手順またはパッケージを確認する',
      blocked: true,
      nextAction: '更新失敗時に戻せる手順またはパッケージを確認する'
    }),
    gate({
      id: 'rollback_test',
      title: '戻し訓練',
      ok: bool(evidence.rollbackTested),
      target: '戻し手順を事前に試している',
      blocked: isHighRisk,
      nextAction: '高リスク更新では戻し訓練を先に実施する'
    }),
    timeGate({
      id: 'rollback_time',
      title: '戻し目標時間',
      value: rollbackTargetMinutes,
      target: isHighRisk ? 30 : 60,
      unit: '分',
      blocked: isHighRisk,
      nextAction: '戻しにかかる見込み時間を短くするか、告知と暫定回避を準備する'
    }),
    gate({
      id: 'smoke_test',
      title: '更新後確認',
      ok: bool(evidence.smokeTestPlanReady),
      target: '更新後に受付、薬歴、印刷、請求などの最小確認を実施できる',
      blocked: true,
      nextAction: '更新後に確認する画面と操作を固定する'
    }),
    gate({
      id: 'phased_rollout',
      title: '段階配信',
      ok: bool(evidence.canaryOrPhasedRollout) || risk === 'low',
      target: '高リスク更新は一斉配信せず段階的に広げる',
      blocked: false,
      nextAction: '対象店舗や端末を絞って配信し、問題がなければ広げる'
    }),
    gate({
      id: 'pause_switch',
      title: '配信停止判断',
      ok: bool(evidence.pauseSwitchConfirmed),
      target: '異常時に同じ更新を止める判断基準を持つ',
      blocked: isHighRisk,
      nextAction: '異常時に配信を止める基準と担当を別記録へ残す'
    }),
    gate({
      id: 'monitoring',
      title: '監視と初動',
      ok: bool(evidence.monitoringPrepared),
      target: '更新後のエラー、問い合わせ、主要KPIを確認できる',
      blocked: true,
      nextAction: '更新後に見る指標と確認時刻を固定する'
    }),
    gate({
      id: 'support_staffing',
      title: 'サポート待機',
      ok: bool(evidence.supportStaffingConfirmed),
      target: '更新直後の問い合わせを受ける体制を別記録で確認する',
      blocked: isHighRisk,
      nextAction: '更新直後の問い合わせ担当と引き継ぎ先を別記録へ残す'
    }),
    gate({
      id: 'sla_review',
      title: '障害対応レビュー連携',
      ok: bool(evidence.slaReviewAttached),
      target: '障害対応・告知レビューとつながっている',
      blocked: isHighRisk,
      nextAction: '障害対応・SLAレビューJSONを作り、更新準備レビューと一緒に保管する'
    }),
    gate({
      id: 'data_migration_impact',
      title: 'データ影響',
      ok: bool(evidence.dataMigrationImpactChecked),
      target: 'データ移行やDB更新の影響有無を確認する',
      blocked: kind === 'major',
      nextAction: 'データ変更がある更新では影響範囲と戻し方を確認する'
    }),
    gate({
      id: 'post_release_review',
      title: '更新後レビュー',
      ok: bool(evidence.postReleaseReviewScheduled),
      target: '更新後の問い合わせ、エラー、KPIを振り返る予定がある',
      blocked: false,
      nextAction: '更新後レビューの予定を登録する'
    })
  ];
  const status = summarizeStatus(gates);

  return {
    type: 'yakureki-release-update-readiness-review',
    schemaVersion: 2,
    generatedAt: generatedAt.toISOString(),
    releaseId,
    kind,
    kindLabel: KIND_LABELS[kind],
    risk,
    riskLabel: RISK_LABELS[risk],
    plannedAt: evidence.plannedAt,
    status,
    statusLabel: statusLabel(status),
    gateCount: gates.length,
    passedGateCount: gates.filter((gateReview) => gateReview.status === 'pass').length,
    attentionGateCount: gates.filter((gateReview) => gateReview.status === 'attention').length,
    blockedGateCount: gates.filter((gateReview) => gateReview.status === 'blocked').length,
    rollbackTargetMinutes,
    expectedDowntimeMinutes,
    privacy: {
      containsPatientData: false,
      containsStaffNames: false,
      containsFacilityName: false,
      containsRawAuditDetails: false,
      containsLocalPath: false,
      containsExternalSecrets: false,
      containsRawNoticeText: false,
      containsRawReleaseNotes: false
    },
    evidence: {
      capturedAt: String(evidence.capturedAt || '').trim(),
      operatorReviewId: String(evidence.operatorReviewId || '').trim(),
      sourceArtifactSha256: String(evidence.sourceArtifactSha256 || '').trim(),
      noPatientDataConfirmed: bool(evidence.noPatientDataConfirmed)
    },
    evidenceIntegrity,
    gates,
    nextActions: uniqueActions(gates)
  };
}

export function buildReleaseUpdateEvidenceTemplate(input: {
  generatedAt?: Date;
  releaseId?: string;
  kind?: ReleaseUpdateKind;
  risk?: ReleaseUpdateRisk;
} = {}): ReleaseUpdateEvidenceTemplate {
  const generatedAt = input.generatedAt ?? new Date();
  const kind = normalizeKind(input.kind);
  const risk = normalizeRisk(input.risk, kind);
  const isHighRisk = highRisk(risk);
  return {
    type: 'yakureki-release-update-readiness-evidence-template',
    schemaVersion: 2,
    generatedAt: generatedAt.toISOString(),
    releaseId: input.releaseId || 'release-update-readiness',
    guidance: '患者名、スタッフ名、薬局名、電話番号、メールアドレス、URL、トークン、ローカルパス、告知本文、リリースノート本文、自由記述メモはこのJSONに書かず、院内または社内の別記録へ残す',
    capturedAt: '',
    operatorReviewId: '',
    sourceArtifactSha256: '',
    kind,
    risk,
    plannedAt: '',
    noPatientDataConfirmed: false,
    releaseNotePrepared: false,
    userNoticePrepared: false,
    maintenanceWindowConfirmed: false,
    buildVerified: false,
    versionTagged: false,
    migrationReviewed: false,
    preUpdateBackupConfirmed: false,
    rollbackPackageVerified: false,
    rollbackTested: false,
    rollbackTargetMinutes: isHighRisk ? 30 : 60,
    expectedDowntimeMinutes: 0,
    smokeTestPlanReady: false,
    canaryOrPhasedRollout: false,
    pauseSwitchConfirmed: false,
    monitoringPrepared: false,
    supportStaffingConfirmed: false,
    slaReviewAttached: false,
    dataMigrationImpactChecked: false,
    postReleaseReviewScheduled: false,
    privacy: {
      containsPatientData: false,
      containsStaffNames: false,
      containsFacilityName: false,
      containsRawAuditDetails: false,
      containsLocalPath: false,
      containsExternalSecrets: false,
      containsRawNoticeText: false,
      containsRawReleaseNotes: false
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

export function buildReleaseUpdateReadinessCsv(review: ReleaseUpdateReadinessReview): string {
  const rows = [
    ['区分', '判定', '対象', '目標', '実績', '次の対応'],
    [
      '総括',
      review.statusLabel,
      `${review.releaseId} / ${review.kindLabel} / ${review.riskLabel}`,
      `戻し ${review.rollbackTargetMinutes}分 / 停止見込み ${review.expectedDowntimeMinutes}分`,
      `OK ${review.passedGateCount} / 確認 ${review.attentionGateCount} / 停止 ${review.blockedGateCount}`,
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

export function buildReleaseUpdateChecklist(review: ReleaseUpdateReadinessReview): string {
  return [
    `リリース・更新準備チェック ${review.statusLabel}`,
    `更新種別: ${review.kindLabel}`,
    `リスク: ${review.riskLabel}`,
    `戻し目標: ${review.rollbackTargetMinutes}分`,
    `停止見込み: ${review.expectedDowntimeMinutes}分`,
    '',
    '更新前に見るもの:',
    '- production build と対象テスト',
    '- 更新前バックアップまたは戻し先',
    '- 戻し手順または戻しパッケージ',
    '- 利用者への告知準備',
    '- 更新後の最小確認と監視',
    '- サポート待機と配信停止判断',
    '',
    'このチェックリストに入れないもの:',
    '- 患者名、スタッフ名、薬局名',
    '- 電話番号、メールアドレス、URL、トークン',
    '- 告知本文、リリースノート本文、自由記述メモ、ローカルパス',
    '',
    '未完了の次対応:',
    ...(review.nextActions.length > 0 ? review.nextActions.map((action) => `- ${action}`) : ['- 対応不要'])
  ].join('\n');
}

export function buildReleaseUpdateReadinessAuditDetail(review: ReleaseUpdateReadinessReview): string {
  return [
    `更新準備 ${review.statusLabel}`,
    `種別 ${review.kindLabel}`,
    `リスク ${review.riskLabel}`,
    `戻し ${review.rollbackTargetMinutes}分`,
    `停止見込み ${review.expectedDowntimeMinutes}分`,
    `停止ゲート ${review.blockedGateCount}件`
  ].join(' / ');
}
