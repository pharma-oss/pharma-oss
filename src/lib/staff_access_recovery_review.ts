import type { AuditLog, User } from '../db/types.ts';
import {
  buildEvidenceIntegrityReview,
  type EvidenceIntegrityReview
} from './evidence_integrity.ts';
import {
  STAFF_RECOVERY_REASON_LABELS,
  type StaffRecoveryAction,
  type StaffRecoveryReason
} from './staff_recovery.ts';

export type StaffAccessRecoveryReviewStatus = 'pass' | 'attention' | 'blocked';
export type StaffAccessRecoveryTargetRole = User['role'] | 'unknown';

export interface StaffAccessRecoveryCaseEvidence {
  caseId?: string;
  reason?: StaffRecoveryReason;
  targetRole?: User['role'];
  backupBeforeChangeConfirmed?: boolean;
  externalStorageConfirmed?: boolean;
  adminRemainsConfirmed?: boolean;
  restoreDrillConfirmed?: boolean;
  fallbackLoginConfirmed?: boolean;
  credentialResetOrRevokedConfirmed?: boolean;
  retirementRecordConfirmed?: boolean;
  auditLogRecorded?: boolean;
  ownerReviewCompleted?: boolean;
}

export interface StaffAccessRecoveryEvidenceInput {
  reviewId?: string;
  capturedAt?: string;
  operatorReviewId?: string;
  sourceArtifactSha256?: string;
  noPatientDataConfirmed?: boolean;
  noStaffNamesConfirmed?: boolean;
  noFacilityNameConfirmed?: boolean;
  noRawAuditDetailsConfirmed?: boolean;
  cases?: StaffAccessRecoveryCaseEvidence[];
}

export interface StaffAccessRecoveryCaseCheck {
  id:
    | 'case_id'
    | 'target_role'
    | 'admin_survives'
    | 'backup_before_change'
    | 'restore_drill'
    | 'fallback_login'
    | 'credential_reset_or_revoke'
    | 'retirement_record'
    | 'audit_log'
    | 'owner_review';
  title: string;
  status: StaffAccessRecoveryReviewStatus;
  statusLabel: string;
  actual: string;
  nextAction: string;
}

export interface StaffAccessRecoveryCaseReview {
  caseId: string;
  reason: StaffRecoveryReason | 'unknown';
  reasonLabel: string;
  targetRole: StaffAccessRecoveryTargetRole;
  targetRoleLabel: string;
  status: StaffAccessRecoveryReviewStatus;
  statusLabel: string;
  passedCheckCount: number;
  attentionCheckCount: number;
  blockedCheckCount: number;
  checks: StaffAccessRecoveryCaseCheck[];
  nextActions: string[];
}

export interface StaffAccessRecoveryGate {
  id:
    | 'privacy'
    | 'evidence_integrity'
    | 'scenario_coverage'
    | 'admin_survival'
    | 'backup_external_storage'
    | 'reason_specific_controls'
    | 'audit_log'
    | 'owner_review';
  title: string;
  status: StaffAccessRecoveryReviewStatus;
  statusLabel: string;
  target: string;
  actual: string;
  nextAction: string;
}

export interface StaffAccessRecoveryReview {
  type: 'yakureki-staff-access-recovery-review';
  schemaVersion: 1;
  generatedAt: string;
  reviewId: string;
  status: StaffAccessRecoveryReviewStatus;
  statusLabel: string;
  readyForStaffAccessChange: boolean;
  caseCount: number;
  passCaseCount: number;
  attentionCaseCount: number;
  blockedCaseCount: number;
  reasonCounts: Record<StaffRecoveryReason, number>;
  missingReasonCount: number;
  missingReasons: StaffRecoveryReason[];
  evidence: {
    capturedAt: string;
    operatorReviewId: string;
    sourceArtifactSha256: string;
    noPatientDataConfirmed: boolean;
    noStaffNamesConfirmed: boolean;
    noFacilityNameConfirmed: boolean;
    noRawAuditDetailsConfirmed: boolean;
  };
  evidenceIntegrity: EvidenceIntegrityReview;
  privacy: {
    containsPatientData: false;
    containsStaffNames: false;
    containsFacilityName: false;
    containsRawAuditDetails: false;
    containsLocalPath: false;
    containsExternalSecrets: false;
    containsCredentialSecret: false;
  };
  gates: StaffAccessRecoveryGate[];
  cases: StaffAccessRecoveryCaseReview[];
  passedGateCount: number;
  attentionGateCount: number;
  blockedGateCount: number;
  nextActions: string[];
}

export interface StaffAccessRecoveryEvidenceTemplate {
  type: 'yakureki-staff-access-recovery-evidence-template';
  schemaVersion: 1;
  generatedAt: string;
  reviewId: string;
  guidance: string;
  capturedAt: string;
  operatorReviewId: string;
  sourceArtifactSha256: string;
  noPatientDataConfirmed: false;
  noStaffNamesConfirmed: false;
  noFacilityNameConfirmed: false;
  noRawAuditDetailsConfirmed: false;
  cases: Required<Pick<StaffAccessRecoveryCaseEvidence,
    | 'caseId'
    | 'reason'
    | 'targetRole'
    | 'backupBeforeChangeConfirmed'
    | 'externalStorageConfirmed'
    | 'adminRemainsConfirmed'
    | 'restoreDrillConfirmed'
    | 'fallbackLoginConfirmed'
    | 'credentialResetOrRevokedConfirmed'
    | 'retirementRecordConfirmed'
    | 'auditLogRecorded'
    | 'ownerReviewCompleted'
  >>[];
  privacy: StaffAccessRecoveryReview['privacy'];
}

export interface BuildStaffAccessRecoveryReviewFromAuditLogsInput {
  generatedAt?: Date;
  auditLogs: AuditLog[];
  caseAuditLogs?: AuditLog[];
  reviewId?: string;
  sourceArtifactSha256?: string;
  maxCases?: number;
}

export interface StaffAccessRecoveryMonthlyReview {
  type: 'yakureki-staff-access-recovery-monthly-review';
  schemaVersion: 1;
  generatedAt: string;
  monthKey: string;
  monthLabel: string;
  status: StaffAccessRecoveryReviewStatus;
  statusLabel: string;
  actionLabel: string;
  readyForMonthlyClose: boolean;
  eventCaseCount: number;
  staffCredentialRecoveryLogCount: number;
  staffDeleteLogCount: number;
  passCaseCount: number;
  attentionCaseCount: number;
  blockedCaseCount: number;
  reasonCounts: Record<StaffRecoveryReason, number>;
  missingReasonCount: number;
  readinessScenarioComplete: boolean;
  latestEventAt?: string;
  evidenceIntegrityStatus?: EvidenceIntegrityReview['status'];
  evidenceIntegrityIssueCount: number;
  requiredActions: string[];
  privacy: StaffAccessRecoveryReview['privacy'];
  staffAccessRecoveryReview?: StaffAccessRecoveryReview;
}

const PRIVACY_FLAGS = {
  containsPatientData: false,
  containsStaffNames: false,
  containsFacilityName: false,
  containsRawAuditDetails: false,
  containsLocalPath: false,
  containsExternalSecrets: false,
  containsCredentialSecret: false
} as const;

const REASONS: StaffRecoveryReason[] = ['device_migration', 'staff_retirement', 'passkey_lost'];

function bool(value: boolean | undefined): boolean {
  return value === true;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSha256(value: unknown): string {
  const text = normalizeText(value);
  return /^[a-f0-9]{64}$/i.test(text) ? text : '';
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function isLogInMonth(log: AuditLog, targetMonthKey: string): boolean {
  const date = new Date(log.timestamp);
  return Number.isFinite(date.getTime()) && monthKey(date) === targetMonthKey;
}

function normalizeReason(value: unknown): StaffRecoveryReason | 'unknown' {
  if (value === 'device_migration' || value === 'staff_retirement' || value === 'passkey_lost') return value;
  return 'unknown';
}

function normalizeRole(value: unknown): StaffAccessRecoveryTargetRole {
  if (value === 'admin' || value === 'pharmacist' || value === 'clerk') return value;
  return 'unknown';
}

function roleLabel(role: StaffAccessRecoveryTargetRole): string {
  if (role === 'admin') return '管理者';
  if (role === 'pharmacist') return '薬剤師';
  if (role === 'clerk') return '事務';
  return '未記録';
}

function parseRecoveryReason(details: string, actionType: AuditLog['actionType']): StaffRecoveryReason | undefined {
  if (actionType === 'staff_delete') return 'staff_retirement';
  return REASONS.find((reason) => details.includes(`理由 ${STAFF_RECOVERY_REASON_LABELS[reason]}`));
}

function parseTargetRole(details: string): User['role'] | undefined {
  const match = details.match(/\((admin|pharmacist|clerk)\)/);
  return match?.[1] as User['role'] | undefined;
}

function parseRecoveryAction(details: string, actionType: AuditLog['actionType']): StaffRecoveryAction | 'staff_delete' | undefined {
  if (actionType === 'staff_delete') return 'staff_delete';
  if (details.includes('操作 パスワード再設定')) return 'password_reset';
  if (details.includes('操作 パスキー解除')) return 'passkey_clear';
  if (details.includes('操作 退職前チェック記録')) return 'retirement_check_record';
  return undefined;
}

function isChecklistBlocked(details: string): boolean {
  return details.includes('判定 実行前に対応が必要');
}

function isChecklistComplete(details: string): boolean {
  return details.includes('判定 対応準備OK');
}

function hasEarlierAuditAction(auditLogs: AuditLog[], actionType: AuditLog['actionType'], timestamp: string): boolean {
  const targetTime = Date.parse(timestamp);
  return auditLogs.some((log) => {
    if (log.actionType !== actionType) return false;
    const logTime = Date.parse(log.timestamp);
    return Number.isFinite(logTime) && Number.isFinite(targetTime) && logTime <= targetTime;
  });
}

export function buildStaffAccessRecoveryReviewFromAuditLogs(
  input: BuildStaffAccessRecoveryReviewFromAuditLogsInput
): StaffAccessRecoveryReview | undefined {
  const generatedAt = input.generatedAt ?? new Date();
  const maxCases = typeof input.maxCases === 'number' && Number.isFinite(input.maxCases)
    ? Math.max(1, Math.floor(input.maxCases))
    : 12;
  const caseAuditLogs = input.caseAuditLogs ?? input.auditLogs;
  const relevantLogs = caseAuditLogs
    .filter((log) => log.actionType === 'staff_credential_recovery' || log.actionType === 'staff_delete')
    .filter((log) => Number.isFinite(Date.parse(log.timestamp)))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(-maxCases);

  if (relevantLogs.length === 0) return undefined;

  const reviewId = normalizeText(input.reviewId) || 'staff-access-recovery-audit-log-review';
  const cases: StaffAccessRecoveryCaseEvidence[] = relevantLogs.map((log, index) => {
    const details = normalizeText(log.details);
    const reason = parseRecoveryReason(details, log.actionType);
    const targetRole = parseTargetRole(details);
    const action = parseRecoveryAction(details, log.actionType);
    const checklistComplete = isChecklistComplete(details);

    return {
      caseId: `audit-case-${index + 1}`,
      ...(reason ? { reason } : {}),
      ...(targetRole ? { targetRole } : {}),
      backupBeforeChangeConfirmed: hasEarlierAuditAction(input.auditLogs, 'backup_export', log.timestamp),
      externalStorageConfirmed: hasEarlierAuditAction(input.auditLogs, 'backup_external_storage', log.timestamp),
      adminRemainsConfirmed: log.actionType === 'staff_delete' ? true : !isChecklistBlocked(details),
      restoreDrillConfirmed: checklistComplete || hasEarlierAuditAction(input.auditLogs, 'backup_drill', log.timestamp),
      fallbackLoginConfirmed: action === 'password_reset' || (reason === 'passkey_lost' && checklistComplete),
      credentialResetOrRevokedConfirmed: action === 'password_reset' || action === 'passkey_clear' || action === 'staff_delete',
      retirementRecordConfirmed: action === 'retirement_check_record' || action === 'staff_delete',
      auditLogRecorded: true,
      ownerReviewCompleted: checklistComplete || log.actionType === 'staff_delete'
    };
  });

  return buildStaffAccessRecoveryReview({
    generatedAt,
    evidence: {
      reviewId,
      capturedAt: generatedAt.toISOString(),
      operatorReviewId: `${reviewId}-derived`,
      sourceArtifactSha256: normalizeSha256(input.sourceArtifactSha256),
      noPatientDataConfirmed: true,
      noStaffNamesConfirmed: true,
      noFacilityNameConfirmed: true,
      noRawAuditDetailsConfirmed: true,
      cases
    }
  });
}

export function buildStaffAccessRecoveryMonthlyReview(
  auditLogs: AuditLog[],
  generatedAt = new Date(),
  options: {
    reviewId?: string;
    sourceArtifactSha256?: string;
    maxCases?: number;
  } = {}
): StaffAccessRecoveryMonthlyReview {
  const targetMonthKey = monthKey(generatedAt);
  const targetMonthLabel = monthLabel(generatedAt);
  const monthLogs = auditLogs.filter((log) => isLogInMonth(log, targetMonthKey));
  const staffAccessLogs = monthLogs.filter((log) => (
    log.actionType === 'staff_credential_recovery' || log.actionType === 'staff_delete'
  ));
  const review = buildStaffAccessRecoveryReviewFromAuditLogs({
    generatedAt,
    auditLogs,
    caseAuditLogs: staffAccessLogs,
    reviewId: options.reviewId || `staff-access-recovery-monthly-${targetMonthKey}`,
    sourceArtifactSha256: options.sourceArtifactSha256,
    maxCases: options.maxCases
  });
  const latestEventAt = staffAccessLogs
    .map((log) => log.timestamp)
    .filter((timestamp) => Number.isFinite(Date.parse(timestamp)))
    .sort()
    .at(-1);

  if (!review) {
    return {
      type: 'yakureki-staff-access-recovery-monthly-review',
      schemaVersion: 1,
      generatedAt: generatedAt.toISOString(),
      monthKey: targetMonthKey,
      monthLabel: targetMonthLabel,
      status: 'pass',
      statusLabel: 'スタッフ復旧確認OK',
      actionLabel: '対象操作なし',
      readyForMonthlyClose: true,
      eventCaseCount: 0,
      staffCredentialRecoveryLogCount: 0,
      staffDeleteLogCount: 0,
      passCaseCount: 0,
      attentionCaseCount: 0,
      blockedCaseCount: 0,
      reasonCounts: { device_migration: 0, staff_retirement: 0, passkey_lost: 0 },
      missingReasonCount: REASONS.length,
      readinessScenarioComplete: false,
      evidenceIntegrityIssueCount: 0,
      requiredActions: [
        '対象月に認証復旧・退職対応はありません。発生した月は匿名ケースIDと対象ロールだけで棚卸してください',
        '導入前または年次訓練では、端末移行、スタッフ退職、パスキー紛失の3場面を匿名証跡で確認してください'
      ],
      privacy: PRIVACY_FLAGS
    };
  }

  const readinessScenarioComplete = review.missingReasonCount === 0;
  const requiredActions = review.nextActions.length > 0 && review.nextActions[0] !== '対応不要'
    ? review.nextActions
    : readinessScenarioComplete
      ? ['当月の認証復旧・退職対応は棚卸済みです']
      : ['実店舗または訓練で未確認場面の匿名ケースを追加してください'];

  return {
    type: 'yakureki-staff-access-recovery-monthly-review',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    monthKey: targetMonthKey,
    monthLabel: targetMonthLabel,
    status: review.status,
    statusLabel: review.statusLabel,
    actionLabel: review.status === 'pass'
      ? '月次棚卸OK'
      : review.status === 'attention'
        ? '責任者確認'
        : '月次棚卸を保留',
    readyForMonthlyClose: review.status !== 'blocked',
    eventCaseCount: review.caseCount,
    staffCredentialRecoveryLogCount: staffAccessLogs.filter((log) => log.actionType === 'staff_credential_recovery').length,
    staffDeleteLogCount: staffAccessLogs.filter((log) => log.actionType === 'staff_delete').length,
    passCaseCount: review.passCaseCount,
    attentionCaseCount: review.attentionCaseCount,
    blockedCaseCount: review.blockedCaseCount,
    reasonCounts: review.reasonCounts,
    missingReasonCount: review.missingReasonCount,
    readinessScenarioComplete,
    latestEventAt,
    evidenceIntegrityStatus: review.evidenceIntegrity.status,
    evidenceIntegrityIssueCount: review.evidenceIntegrity.issues.length,
    requiredActions,
    privacy: PRIVACY_FLAGS,
    staffAccessRecoveryReview: review
  };
}

function reasonLabel(reason: StaffRecoveryReason | 'unknown'): string {
  return reason === 'unknown' ? '理由未記録' : STAFF_RECOVERY_REASON_LABELS[reason];
}

function statusLabel(status: StaffAccessRecoveryReviewStatus): string {
  if (status === 'pass') return 'スタッフ復旧確認OK';
  if (status === 'attention') return 'スタッフ復旧確認を確認';
  return 'スタッフ復旧確認を保留';
}

function summarizeStatus(items: { status: StaffAccessRecoveryReviewStatus }[]): StaffAccessRecoveryReviewStatus {
  if (items.some((item) => item.status === 'blocked')) return 'blocked';
  if (items.some((item) => item.status === 'attention')) return 'attention';
  return 'pass';
}

function uniqueActions(items: { status: StaffAccessRecoveryReviewStatus; nextAction: string }[]): string[] {
  return Array.from(new Set(
    items
      .filter((item) => item.status !== 'pass')
      .map((item) => item.nextAction)
      .filter(Boolean)
  ));
}

function caseCheck(options: {
  id: StaffAccessRecoveryCaseCheck['id'];
  title: string;
  status: StaffAccessRecoveryReviewStatus;
  actual: string;
  nextAction: string;
}): StaffAccessRecoveryCaseCheck {
  return {
    ...options,
    statusLabel: statusLabel(options.status)
  };
}

function gate(options: {
  id: StaffAccessRecoveryGate['id'];
  title: string;
  status: StaffAccessRecoveryReviewStatus;
  target: string;
  actual: string;
  nextAction: string;
}): StaffAccessRecoveryGate {
  return {
    ...options,
    statusLabel: statusLabel(options.status)
  };
}

function buildCaseReview(item: StaffAccessRecoveryCaseEvidence, index: number): StaffAccessRecoveryCaseReview {
  const caseIdInput = normalizeText(item.caseId);
  const caseId = caseIdInput || `case-${index + 1}`;
  const reason = normalizeReason(item.reason);
  const targetRole = normalizeRole(item.targetRole);
  const backupStatus: StaffAccessRecoveryReviewStatus = bool(item.backupBeforeChangeConfirmed)
    ? bool(item.externalStorageConfirmed)
      ? 'pass'
      : 'attention'
    : 'blocked';
  const checks: StaffAccessRecoveryCaseCheck[] = [
    caseCheck({
      id: 'case_id',
      title: '匿名ケースID',
      status: caseIdInput ? 'pass' : 'attention',
      actual: caseIdInput ? '記録あり' : '自動補完',
      nextAction: '個人名ではない匿名ケースIDを証跡へ残す'
    }),
    caseCheck({
      id: 'target_role',
      title: '対象ロール',
      status: targetRole === 'unknown' ? 'attention' : 'pass',
      actual: roleLabel(targetRole),
      nextAction: '対象者名ではなく、管理者/薬剤師/事務の区分だけを残す'
    }),
    caseCheck({
      id: 'admin_survives',
      title: '管理者が残る',
      status: bool(item.adminRemainsConfirmed) ? 'pass' : 'blocked',
      actual: bool(item.adminRemainsConfirmed) ? '確認済み' : '未確認',
      nextAction: '操作後も認証済み管理者が残ることを確認する'
    }),
    caseCheck({
      id: 'backup_before_change',
      title: '変更前バックアップ',
      status: backupStatus,
      actual: `バックアップ ${bool(item.backupBeforeChangeConfirmed) ? 'あり' : 'なし'} / 外部保存 ${bool(item.externalStorageConfirmed) ? 'あり' : 'なし'}`,
      nextAction: backupStatus === 'blocked'
        ? 'スタッフ認証を変更する前に暗号化バックアップを残す'
        : '外部保存先で読み戻せることを確認する'
    })
  ];

  if (reason === 'device_migration') {
    checks.push(caseCheck({
      id: 'restore_drill',
      title: '端末移行の復旧テスト',
      status: bool(item.restoreDrillConfirmed) ? 'pass' : 'blocked',
      actual: bool(item.restoreDrillConfirmed) ? '確認済み' : '未確認',
      nextAction: '新端末または復旧テスト環境で、バックアップから起動確認まで実施する'
    }));
  }

  if (reason === 'passkey_lost') {
    checks.push(
      caseCheck({
        id: 'fallback_login',
        title: '代替ログイン手段',
        status: bool(item.fallbackLoginConfirmed) ? 'pass' : 'blocked',
        actual: bool(item.fallbackLoginConfirmed) ? '確認済み' : '未確認',
        nextAction: 'パスワード再設定または別認証手段で本人が戻れることを確認する'
      }),
      caseCheck({
        id: 'credential_reset_or_revoke',
        title: '失効/再設定の記録',
        status: bool(item.credentialResetOrRevokedConfirmed) ? 'pass' : 'blocked',
        actual: bool(item.credentialResetOrRevokedConfirmed) ? '確認済み' : '未確認',
        nextAction: '紛失したパスキーの解除または再設定記録を操作ログへ残す'
      })
    );
  }

  if (reason === 'staff_retirement') {
    checks.push(
      caseCheck({
        id: 'credential_reset_or_revoke',
        title: '認証情報の停止',
        status: bool(item.credentialResetOrRevokedConfirmed) ? 'pass' : 'blocked',
        actual: bool(item.credentialResetOrRevokedConfirmed) ? '確認済み' : '未確認',
        nextAction: '退職者の認証情報停止または削除記録を残す'
      }),
      caseCheck({
        id: 'retirement_record',
        title: '退職前確認',
        status: bool(item.retirementRecordConfirmed) ? 'pass' : 'blocked',
        actual: bool(item.retirementRecordConfirmed) ? '確認済み' : '未確認',
        nextAction: '貸与端末、認証情報、操作権限の退職前確認を残す'
      })
    );
  }

  if (reason === 'unknown') {
    checks.push(caseCheck({
      id: 'credential_reset_or_revoke',
      title: '理由別の確認',
      status: 'blocked',
      actual: '理由未記録',
      nextAction: '端末移行、スタッフ退職、パスキー紛失のどれかを記録する'
    }));
  }

  checks.push(
    caseCheck({
      id: 'audit_log',
      title: '操作ログ記録',
      status: bool(item.auditLogRecorded) ? 'pass' : 'blocked',
      actual: bool(item.auditLogRecorded) ? '記録済み' : '未記録',
      nextAction: '認証復旧または退職対応の操作ログを残す'
    }),
    caseCheck({
      id: 'owner_review',
      title: '責任者確認',
      status: bool(item.ownerReviewCompleted) ? 'pass' : 'blocked',
      actual: bool(item.ownerReviewCompleted) ? '確認済み' : '未確認',
      nextAction: '責任者が管理者残存、バックアップ、操作ログを確認する'
    })
  );

  const status = summarizeStatus(checks);
  return {
    caseId,
    reason,
    reasonLabel: reasonLabel(reason),
    targetRole,
    targetRoleLabel: roleLabel(targetRole),
    status,
    statusLabel: statusLabel(status),
    passedCheckCount: checks.filter((check) => check.status === 'pass').length,
    attentionCheckCount: checks.filter((check) => check.status === 'attention').length,
    blockedCheckCount: checks.filter((check) => check.status === 'blocked').length,
    checks,
    nextActions: uniqueActions(checks)
  };
}

function reasonCounts(cases: StaffAccessRecoveryCaseReview[]): Record<StaffRecoveryReason, number> {
  return {
    device_migration: cases.filter((item) => item.reason === 'device_migration').length,
    staff_retirement: cases.filter((item) => item.reason === 'staff_retirement').length,
    passkey_lost: cases.filter((item) => item.reason === 'passkey_lost').length
  };
}

function aggregateGateStatus(
  cases: StaffAccessRecoveryCaseReview[],
  checkIds: StaffAccessRecoveryCaseCheck['id'][]
): StaffAccessRecoveryReviewStatus {
  const checks = cases.flatMap((item) => item.checks.filter((check) => checkIds.includes(check.id)));
  if (cases.length === 0 || checks.some((check) => check.status === 'blocked')) return 'blocked';
  if (checks.length === 0 || checks.some((check) => check.status === 'attention')) return 'attention';
  return 'pass';
}

export function buildStaffAccessRecoveryReview(input: {
  generatedAt?: Date;
  evidence?: StaffAccessRecoveryEvidenceInput;
} = {}): StaffAccessRecoveryReview {
  const generatedAt = input.generatedAt ?? new Date();
  const evidence = input.evidence ?? {};
  const reviewId = normalizeText(evidence.reviewId) || 'staff-access-recovery-review';
  const cases = (Array.isArray(evidence.cases) ? evidence.cases : [])
    .map((item, index) => buildCaseReview(item, index));
  const counts = reasonCounts(cases);
  const missingReasons = REASONS.filter((reason) => counts[reason] === 0);
  const privacyClear = bool(evidence.noPatientDataConfirmed)
    && bool(evidence.noStaffNamesConfirmed)
    && bool(evidence.noFacilityNameConfirmed)
    && bool(evidence.noRawAuditDetailsConfirmed);
  const evidenceIntegrity = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: normalizeText(evidence.reviewId) || normalizeText(evidence.operatorReviewId) || 'staff-access-recovery-review',
    claimKind: 'staff_access_recovery_review',
    evidence: {
      reviewId,
      capturedAt: evidence.capturedAt,
      operatorReviewId: evidence.operatorReviewId,
      sourceArtifactSha256: evidence.sourceArtifactSha256,
      noPatientDataConfirmed: bool(evidence.noPatientDataConfirmed),
      evidenceKind: 'actual staff access recovery review',
      officialProcedureConfirmed: cases.length > 0 && cases.every((item) => item.status === 'pass'),
      credentialStorageConfirmed: cases.length > 0 && cases.every((item) => item.checks.some((check) => (
        check.id === 'credential_reset_or_revoke' && check.status === 'pass'
      )) || item.reason === 'device_migration'),
      operationalOwnerAssigned: cases.length > 0 && cases.every((item) => item.checks.some((check) => (
        check.id === 'owner_review' && check.status === 'pass'
      ))),
      noStaffNamesConfirmed: bool(evidence.noStaffNamesConfirmed),
      noFacilityNameConfirmed: bool(evidence.noFacilityNameConfirmed),
      noRawAuditDetailsConfirmed: bool(evidence.noRawAuditDetailsConfirmed),
      caseCount: cases.length,
      deviceMigrationCaseCount: counts.device_migration,
      staffRetirementCaseCount: counts.staff_retirement,
      passkeyLostCaseCount: counts.passkey_lost
    },
    noPatientDataExpected: true,
    realWorldEvidenceRequired: true
  });

  const scenarioCoverageStatus: StaffAccessRecoveryReviewStatus = cases.length === 0
    ? 'blocked'
    : missingReasons.length === 0
      ? 'pass'
      : 'attention';
  const backupStatus = aggregateGateStatus(cases, ['backup_before_change']);
  const reasonSpecificStatus = aggregateGateStatus(cases, [
    'restore_drill',
    'fallback_login',
    'credential_reset_or_revoke',
    'retirement_record'
  ]);
  const gates: StaffAccessRecoveryGate[] = [
    gate({
      id: 'privacy',
      title: '個人名を入れない',
      status: privacyClear ? 'pass' : 'blocked',
      target: '患者名、スタッフ名、薬局名、監査ログ本文を成果物に入れない',
      actual: `患者情報 ${bool(evidence.noPatientDataConfirmed) ? 'なし' : '未確認'} / スタッフ名 ${bool(evidence.noStaffNamesConfirmed) ? 'なし' : '未確認'} / 薬局名 ${bool(evidence.noFacilityNameConfirmed) ? 'なし' : '未確認'} / 監査ログ本文 ${bool(evidence.noRawAuditDetailsConfirmed) ? 'なし' : '未確認'}`,
      nextAction: '匿名ケースID、対象ロール、件数、判定だけを残し、氏名や本文は別管理にする'
    }),
    gate({
      id: 'evidence_integrity',
      title: '証跡の出所',
      status: evidenceIntegrity.status,
      target: '確認日時、匿名確認ID、元資料SHA-256、患者情報なし確認を揃える',
      actual: `${evidenceIntegrity.statusLabel} / 指摘${evidenceIntegrity.issues.length}件`,
      nextAction: evidenceIntegrity.requiredActions.join(' / ') || '対応不要'
    }),
    gate({
      id: 'scenario_coverage',
      title: '3つの場面を確認',
      status: scenarioCoverageStatus,
      target: '端末移行、スタッフ退職、パスキー紛失を少なくとも1件ずつ確認する',
      actual: `端末移行 ${counts.device_migration}件 / 退職 ${counts.staff_retirement}件 / パスキー紛失 ${counts.passkey_lost}件`,
      nextAction: missingReasons.length === 0
        ? '対応不要'
        : `${missingReasons.map((reason) => STAFF_RECOVERY_REASON_LABELS[reason]).join('、')}の匿名ケースを追加する`
    }),
    gate({
      id: 'admin_survival',
      title: '管理者喪失を防ぐ',
      status: aggregateGateStatus(cases, ['admin_survives']),
      target: 'すべてのケースで、操作後も認証済み管理者が残る',
      actual: `OK ${cases.filter((item) => item.checks.some((check) => check.id === 'admin_survives' && check.status === 'pass')).length}件 / 対象 ${cases.length}件`,
      nextAction: '管理者が0名になる操作は止め、先に別の管理者認証を登録する'
    }),
    gate({
      id: 'backup_external_storage',
      title: '変更前バックアップ',
      status: backupStatus,
      target: '変更前バックアップと外部保存確認を残す',
      actual: `OK ${cases.filter((item) => item.checks.some((check) => check.id === 'backup_before_change' && check.status === 'pass')).length}件 / 確認 ${cases.filter((item) => item.checks.some((check) => check.id === 'backup_before_change' && check.status === 'attention')).length}件 / 保留 ${cases.filter((item) => item.checks.some((check) => check.id === 'backup_before_change' && check.status === 'blocked')).length}件`,
      nextAction: backupStatus === 'blocked'
        ? '認証変更前に暗号化バックアップを残す'
        : '外部保存先で読み戻せることを確認する'
    }),
    gate({
      id: 'reason_specific_controls',
      title: '理由別の止めどころ',
      status: reasonSpecificStatus,
      target: '端末移行は復旧テスト、退職は認証停止と退職前確認、パスキー紛失は代替ログインと失効/再設定を確認する',
      actual: `OK ${cases.filter((item) => item.checks.some((check) => (
        ['restore_drill', 'fallback_login', 'credential_reset_or_revoke', 'retirement_record'].includes(check.id)
        && check.status === 'pass'
      ))).length}件 / 対象 ${cases.length}件`,
      nextAction: '理由ごとの確認が終わるまで、退職・認証復旧対応を閉じない'
    }),
    gate({
      id: 'audit_log',
      title: '操作ログ',
      status: aggregateGateStatus(cases, ['audit_log']),
      target: '認証復旧または退職対応の操作ログを残す',
      actual: `記録済み ${cases.filter((item) => item.checks.some((check) => check.id === 'audit_log' && check.status === 'pass')).length}件 / 対象 ${cases.length}件`,
      nextAction: 'スタッフ認証復旧または退職対応の操作ログを記録する'
    }),
    gate({
      id: 'owner_review',
      title: '責任者確認',
      status: aggregateGateStatus(cases, ['owner_review']),
      target: '責任者が管理者残存、バックアップ、操作ログ、理由別確認を見ている',
      actual: `確認済み ${cases.filter((item) => item.checks.some((check) => check.id === 'owner_review' && check.status === 'pass')).length}件 / 対象 ${cases.length}件`,
      nextAction: '責任者確認を完了し、匿名確認IDへ紐づける'
    })
  ];
  const status = summarizeStatus(gates);
  const nextActions = uniqueActions(gates);

  return {
    type: 'yakureki-staff-access-recovery-review',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    reviewId,
    status,
    statusLabel: statusLabel(status),
    readyForStaffAccessChange: status === 'pass',
    caseCount: cases.length,
    passCaseCount: cases.filter((item) => item.status === 'pass').length,
    attentionCaseCount: cases.filter((item) => item.status === 'attention').length,
    blockedCaseCount: cases.filter((item) => item.status === 'blocked').length,
    reasonCounts: counts,
    missingReasonCount: missingReasons.length,
    missingReasons,
    evidence: {
      capturedAt: normalizeText(evidence.capturedAt),
      operatorReviewId: normalizeText(evidence.operatorReviewId),
      sourceArtifactSha256: normalizeText(evidence.sourceArtifactSha256),
      noPatientDataConfirmed: bool(evidence.noPatientDataConfirmed),
      noStaffNamesConfirmed: bool(evidence.noStaffNamesConfirmed),
      noFacilityNameConfirmed: bool(evidence.noFacilityNameConfirmed),
      noRawAuditDetailsConfirmed: bool(evidence.noRawAuditDetailsConfirmed)
    },
    evidenceIntegrity,
    privacy: PRIVACY_FLAGS,
    gates,
    cases,
    passedGateCount: gates.filter((item) => item.status === 'pass').length,
    attentionGateCount: gates.filter((item) => item.status === 'attention').length,
    blockedGateCount: gates.filter((item) => item.status === 'blocked').length,
    nextActions: nextActions.length > 0 ? nextActions : ['対応不要']
  };
}

export function buildStaffAccessRecoveryEvidenceTemplate(input: {
  generatedAt?: Date;
  reviewId?: string;
} = {}): StaffAccessRecoveryEvidenceTemplate {
  const generatedAt = input.generatedAt ?? new Date();
  return {
    type: 'yakureki-staff-access-recovery-evidence-template',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    reviewId: input.reviewId || 'staff-access-recovery-review',
    guidance: '端末移行、スタッフ退職、パスキー紛失の確認を匿名ケースIDと対象ロールだけで残します。患者名、スタッフ名、薬局名、監査ログ本文、ローカルパス、URL、トークン、パスワード、パスキー情報は入れないでください。',
    capturedAt: '',
    operatorReviewId: '',
    sourceArtifactSha256: '',
    noPatientDataConfirmed: false,
    noStaffNamesConfirmed: false,
    noFacilityNameConfirmed: false,
    noRawAuditDetailsConfirmed: false,
    cases: REASONS.map((reason, index) => ({
      caseId: `access-case-${index + 1}`,
      reason,
      targetRole: reason === 'staff_retirement' ? 'pharmacist' : 'admin',
      backupBeforeChangeConfirmed: false,
      externalStorageConfirmed: false,
      adminRemainsConfirmed: false,
      restoreDrillConfirmed: false,
      fallbackLoginConfirmed: false,
      credentialResetOrRevokedConfirmed: false,
      retirementRecordConfirmed: false,
      auditLogRecorded: false,
      ownerReviewCompleted: false
    })),
    privacy: PRIVACY_FLAGS
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildStaffAccessRecoveryCsv(review: StaffAccessRecoveryReview): string {
  const rows = [
    ['区分', '判定', '対象', '目標', '実績', '次の対応'],
    [
      '総括',
      review.statusLabel,
      review.reviewId,
      '端末移行、スタッフ退職、パスキー紛失を匿名証跡で確認する',
      `ケース${review.caseCount}件 / OK ${review.passCaseCount} / 確認 ${review.attentionCaseCount} / 保留 ${review.blockedCaseCount}`,
      review.nextActions[0] ?? '対応不要'
    ],
    ...review.gates.map((gateItem) => [
      'ゲート',
      gateItem.statusLabel,
      gateItem.title,
      gateItem.target,
      gateItem.actual,
      gateItem.nextAction
    ]),
    ...review.cases.map((caseReview) => [
      'ケース',
      caseReview.statusLabel,
      `${caseReview.caseId} / ${caseReview.reasonLabel} / ${caseReview.targetRoleLabel}`,
      '管理者残存、変更前バックアップ、理由別確認、操作ログ、責任者確認',
      `OK ${caseReview.passedCheckCount} / 確認 ${caseReview.attentionCheckCount} / 保留 ${caseReview.blockedCheckCount}`,
      caseReview.nextActions[0] ?? '対応不要'
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildStaffAccessRecoveryMonthlyReviewCsv(review: StaffAccessRecoveryMonthlyReview): string {
  const rows = [
    ['区分', '項目', '値', '補足'],
    ['月次棚卸', '対象月', review.monthLabel, review.monthKey],
    ['月次棚卸', '作成日時', review.generatedAt, '患者情報・スタッフ名なしの棚卸作成日時'],
    ['月次棚卸', '判定', review.statusLabel, review.actionLabel],
    ['月次棚卸', '月次締め候補', review.readyForMonthlyClose ? 'OK' : '保留', '保留がある場合は責任者確認後に締める'],
    ['対象操作', '認証復旧', `${review.staffCredentialRecoveryLogCount}件`, 'パスワード再設定、パスキー解除、退職前チェック記録'],
    ['対象操作', 'スタッフ削除', `${review.staffDeleteLogCount}件`, '退職対応の削除記録'],
    ['ケース', '合計', `${review.eventCaseCount}件`, `OK ${review.passCaseCount} / 確認 ${review.attentionCaseCount} / 保留 ${review.blockedCaseCount}`],
    ['場面', '端末移行', `${review.reasonCounts.device_migration}件`, '新端末または復旧テスト確認'],
    ['場面', 'スタッフ退職', `${review.reasonCounts.staff_retirement}件`, '認証停止と退職前確認'],
    ['場面', 'パスキー紛失', `${review.reasonCounts.passkey_lost}件`, '代替ログインと失効/再設定'],
    ['場面', '3場面確認', review.readinessScenarioComplete ? 'OK' : '未完了', `未確認 ${review.missingReasonCount}件`],
    ['証跡', '最新対象操作', review.latestEventAt || '対象操作なし', '監査ログ本文、ログID、スタッフ名は出力しない'],
    ['証跡', '証跡品質', review.evidenceIntegrityStatus || '対象外', `指摘 ${review.evidenceIntegrityIssueCount}件`],
    ['次の対応', '対応', review.requiredActions.join(' / '), '月次棚卸または導入前訓練で使う']
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildStaffAccessRecoveryChecklist(review: StaffAccessRecoveryReview): string {
  return [
    '# スタッフ復旧・退職対応レビュー',
    '',
    `- 判定: ${review.statusLabel}`,
    `- 変更を閉じる候補: ${review.readyForStaffAccessChange ? 'OK' : '保留'}`,
    `- ケース: ${review.caseCount}件 / OK ${review.passCaseCount}件 / 確認 ${review.attentionCaseCount}件 / 保留 ${review.blockedCaseCount}件`,
    `- 網羅: 端末移行 ${review.reasonCounts.device_migration}件 / 退職 ${review.reasonCounts.staff_retirement}件 / パスキー紛失 ${review.reasonCounts.passkey_lost}件`,
    '',
    '## ゲート',
    ...review.gates.map((gateItem) => `- [${gateItem.status === 'pass' ? 'x' : ' '}] ${gateItem.title}: ${gateItem.actual}`),
    '',
    '## ケース',
    ...review.cases.map((caseReview) => `- ${caseReview.caseId}: ${caseReview.reasonLabel} / ${caseReview.targetRoleLabel} / ${caseReview.statusLabel}`),
    '',
    '## 次の対応',
    ...review.nextActions.map((action) => `- ${action}`),
    '',
    '## 成果物に入れないもの',
    '- 患者名、患者ID、生年月日、保険番号',
    '- スタッフ氏名、薬局名、電話番号、メールアドレス',
    '- 監査ログ本文、自由記述メモ、ローカル絶対パス',
    '- パスワード、パスキー、トークン、外部URL'
  ].join('\n');
}

export function buildStaffAccessRecoveryAuditDetail(review: StaffAccessRecoveryReview): string {
  return [
    `スタッフ復旧確認 ${review.statusLabel}`,
    `ケース ${review.caseCount}件`,
    `端末移行 ${review.reasonCounts.device_migration}件`,
    `退職 ${review.reasonCounts.staff_retirement}件`,
    `パスキー紛失 ${review.reasonCounts.passkey_lost}件`,
    `保留 ${review.blockedCaseCount}件`
  ].join(' / ');
}

export interface StaffAccessRecoveryCheckRequestItem {
  id: string;
  title: string;
  required: boolean;
  neededFields: string[];
  purpose: string;
  storeOnly: string;
  supportShare: string;
}

export interface StaffAccessRecoveryCheckRequest {
  type: 'yakureki-staff-access-recovery-check-request';
  schemaVersion: 1;
  generatedAt: string;
  reviewId: string;
  guidance: string;
  items: StaffAccessRecoveryCheckRequestItem[];
  operatorChecks: string[];
  privacyRules: string[];
  commandEnvironment: {
    evidenceJson: 'YAKUREKI_STAFF_ACCESS_RECOVERY_EVIDENCE';
    outputDir: 'YAKUREKI_STAFF_ACCESS_RECOVERY_OUTPUT_DIR';
    reviewId: 'YAKUREKI_STAFF_ACCESS_RECOVERY_REVIEW_ID';
  };
}

export function buildStaffAccessRecoveryCheckRequest(input: {
  generatedAt?: Date;
  reviewId?: string;
} = {}): StaffAccessRecoveryCheckRequest {
  const generatedAt = input.generatedAt ?? new Date();
  return {
    type: 'yakureki-staff-access-recovery-check-request',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    reviewId: input.reviewId || 'staff-access-recovery-review',
    guidance: 'スタッフ認証復旧・退職・端末移行対応の証跡を提出する前に、以下を院内で準備してください。患者氏名、スタッフ氏名、薬局名、監査ログ本文、パスワード・パスキー・トークン、ローカル絶対パス、外部URLは含めないでください。',
    items: [
      {
        id: 'privacy_confirmation',
        title: '個人名・監査ログ本文なしの確認',
        required: true,
        neededFields: ['noPatientDataConfirmed', 'noStaffNamesConfirmed', 'noFacilityNameConfirmed', 'noRawAuditDetailsConfirmed'],
        purpose: '患者情報、スタッフ氏名、薬局の正式名称、監査ログ本文を含まないことを確認する',
        storeOnly: '患者氏名、スタッフ氏名、薬局名、監査ログ本文',
        supportShare: '各項目の確認済み/未確認のみ'
      },
      {
        id: 'scenario_coverage',
        title: '端末移行・退職・パスキー紛失の3場面',
        required: true,
        neededFields: ['cases[].caseId', 'cases[].reason', 'cases[].targetRole'],
        purpose: '端末移行、スタッフ退職、パスキー紛失の3場面が少なくとも1件ずつ匿名ケースとして揃っているかを確認する',
        storeOnly: '実際のスタッフ氏名・端末情報',
        supportShare: '場面ごとの件数のみ'
      },
      {
        id: 'admin_survival_and_backup',
        title: '管理者残存と変更前バックアップ',
        required: true,
        neededFields: ['cases[].adminRemainsConfirmed', 'cases[].backupBeforeChangeConfirmed', 'cases[].externalStorageConfirmed'],
        purpose: '操作後も認証済み管理者が残ること、変更前バックアップと外部保存が確認されていることを確認する',
        storeOnly: 'バックアップの実ファイル、外部保存先の実URL',
        supportShare: '各確認項目の合否のみ'
      },
      {
        id: 'reason_specific_controls',
        title: '理由別の止めどころ確認',
        required: true,
        neededFields: ['cases[].restoreDrillConfirmed', 'cases[].fallbackLoginConfirmed', 'cases[].credentialResetOrRevokedConfirmed', 'cases[].retirementRecordConfirmed'],
        purpose: '端末移行は復旧テスト、退職は認証停止と退職前確認、パスキー紛失は代替ログインと失効/再設定が確認されているかを場面ごとに確認する',
        storeOnly: '復旧テストの実行内容、退職者の氏名',
        supportShare: '各確認項目の合否のみ'
      },
      {
        id: 'audit_and_owner_review',
        title: '操作ログと責任者確認',
        required: true,
        neededFields: ['cases[].auditLogRecorded', 'cases[].ownerReviewCompleted'],
        purpose: '操作ログが記録され、責任者が管理者残存・バックアップ・操作ログ・理由別確認を確認しているかを確認する',
        storeOnly: '監査ログ本文、責任者氏名',
        supportShare: '記録済み/確認済みの件数のみ'
      }
    ],
    operatorChecks: [
      '患者名、スタッフ氏名、薬局の正式名称、監査ログ本文を記録に残さない',
      'ケースは匿名ケースIDだけで管理する',
      '確認記録には取得日時、匿名の確認記録ID、元資料SHA-256を残す'
    ],
    privacyRules: [
      '店舗内だけで扱う: 監査ログ本文、スタッフ氏名、バックアップ実ファイル、責任者氏名',
      'サポートへ共有してよい: 各ゲートの合否、場面ごとの件数などの集計値'
    ],
    commandEnvironment: {
      evidenceJson: 'YAKUREKI_STAFF_ACCESS_RECOVERY_EVIDENCE',
      outputDir: 'YAKUREKI_STAFF_ACCESS_RECOVERY_OUTPUT_DIR',
      reviewId: 'YAKUREKI_STAFF_ACCESS_RECOVERY_REVIEW_ID'
    }
  };
}

export function buildStaffAccessRecoveryCheckRequestChecklist(request: StaffAccessRecoveryCheckRequest): string {
  const lines = [
    'スタッフ認証復旧・退職対応 証跡提出依頼',
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
