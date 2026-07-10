export type ScheduledOpsContinuityStatus = 'pass' | 'attention' | 'blocked';

export interface ScheduledOpsDrillReceiptInput {
  type: 'scheduled-ops-drill-receipt';
  checkedAt: string;
  schedulerName?: string;
  status?: string;
  statusLabel?: string;
  backupState?: unknown;
  auditState?: unknown;
  schedulerEvidence?: unknown[];
  webhook?: {
    delivered?: boolean;
    dryRun?: boolean;
  } | null;
  checks?: {
    id?: string;
    status?: string;
  }[];
}

export interface ScheduledOpsFailureNoticeInput {
  type: 'backup-external-transfer-failure-notice' | 'audit-log-s3-worm-retention-failure-notice';
  failedAt: string;
  status?: string;
  statusLabel?: string;
  requiredActions?: string[];
}

export interface BuildScheduledOpsContinuityReviewInput {
  generatedAt?: Date;
  receipts: ScheduledOpsDrillReceiptInput[];
  failureNotices?: ScheduledOpsFailureNoticeInput[];
  requiredReceiptCount?: number;
  maxLatestReceiptAgeDays?: number;
}

export interface ScheduledOpsContinuityCheck {
  id:
    | 'receipt_generation'
    | 'latest_receipt_freshness'
    | 'scheduler_registration_evidence'
    | 'backup_and_audit_state_evidence'
    | 'webhook_delivery_drill'
    | 'failure_recovery';
  status: ScheduledOpsContinuityStatus;
  statusLabel: string;
  title: string;
  detail: string;
  nextAction: string;
}

export interface ScheduledOpsContinuityReview {
  type: 'yakureki-scheduled-ops-continuity-review';
  schemaVersion: 1;
  generatedAt: string;
  status: ScheduledOpsContinuityStatus;
  statusLabel: string;
  receiptCount: number;
  passReceiptCount: number;
  requiredReceiptCount: number;
  latestReceiptAt?: string;
  latestReceiptAgeDays?: number;
  maxLatestReceiptAgeDays: number;
  schedulerEvidenceReceiptCount: number;
  backupStateReceiptCount: number;
  auditStateReceiptCount: number;
  webhookDeliveredReceiptCount: number;
  webhookDryRunReceiptCount: number;
  failureNoticeCount: number;
  latestFailureAt?: string;
  recoveredAfterLatestFailure: boolean;
  privacy: {
    containsPatientData: false;
    containsAuditLogBody: false;
    containsBackupBody: false;
    containsLocalPath: false;
    containsWebhookUrl: false;
    containsBearerToken: false;
    containsErrorMessage: false;
  };
  checks: ScheduledOpsContinuityCheck[];
}

const STATUS_LABELS: Record<ScheduledOpsContinuityStatus, string> = {
  pass: 'OK',
  attention: '要確認',
  blocked: '未完了'
};

function statusLabel(status: ScheduledOpsContinuityStatus): string {
  return STATUS_LABELS[status];
}

function validIsoDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

function daysBetween(later: Date, earlierIso: string): number {
  const diffMs = later.getTime() - Date.parse(earlierIso);
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

function latestIso(values: (string | undefined)[]): string | undefined {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

function normalizeRequiredCount(value: unknown): number {
  const count = Math.trunc(Number(value));
  return Number.isFinite(count) && count > 0 ? count : 2;
}

function normalizeMaxAgeDays(value: unknown): number {
  const days = Math.trunc(Number(value));
  return Number.isFinite(days) && days > 0 ? days : 35;
}

function hasPassingCheck(receipt: ScheduledOpsDrillReceiptInput, id: string): boolean {
  return Array.isArray(receipt.checks)
    && receipt.checks.some((check) => check.id === id && check.status === 'pass');
}

function summarizeStatus(checks: ScheduledOpsContinuityCheck[]): ScheduledOpsContinuityStatus {
  if (checks.some((check) => check.status === 'blocked')) return 'blocked';
  if (checks.some((check) => check.status === 'attention')) return 'attention';
  return 'pass';
}

function buildCheck(
  id: ScheduledOpsContinuityCheck['id'],
  status: ScheduledOpsContinuityStatus,
  title: string,
  detail: string,
  nextAction: string
): ScheduledOpsContinuityCheck {
  return {
    id,
    status,
    statusLabel: statusLabel(status),
    title,
    detail,
    nextAction
  };
}

export function buildScheduledOpsContinuityReview(
  input: BuildScheduledOpsContinuityReviewInput
): ScheduledOpsContinuityReview {
  const generatedAt = input.generatedAt ?? new Date();
  const requiredReceiptCount = normalizeRequiredCount(input.requiredReceiptCount);
  const maxLatestReceiptAgeDays = normalizeMaxAgeDays(input.maxLatestReceiptAgeDays);
  const receipts = input.receipts.filter((receipt) => validIsoDate(receipt.checkedAt));
  const failureNotices = (input.failureNotices ?? []).filter((notice) => validIsoDate(notice.failedAt));
  const passReceiptCount = receipts.filter((receipt) => receipt.status === 'pass').length;
  const latestReceiptAt = latestIso(receipts.map((receipt) => validIsoDate(receipt.checkedAt)));
  const latestReceiptAgeDays = latestReceiptAt ? daysBetween(generatedAt, latestReceiptAt) : undefined;
  const latestFailureAt = latestIso(failureNotices.map((notice) => validIsoDate(notice.failedAt)));
  const schedulerEvidenceReceiptCount = receipts.filter((receipt) => (
    Array.isArray(receipt.schedulerEvidence)
    && receipt.schedulerEvidence.length > 0
    && hasPassingCheck(receipt, 'scheduler-evidence')
  )).length;
  const backupStateReceiptCount = receipts.filter((receipt) => Boolean(receipt.backupState)).length;
  const auditStateReceiptCount = receipts.filter((receipt) => Boolean(receipt.auditState)).length;
  const webhookDeliveredReceiptCount = receipts.filter((receipt) => receipt.webhook?.delivered === true).length;
  const webhookDryRunReceiptCount = receipts.filter((receipt) => receipt.webhook?.dryRun === true).length;
  const recoveredAfterLatestFailure = latestFailureAt
    ? Boolean(latestReceiptAt && Date.parse(latestReceiptAt) > Date.parse(latestFailureAt))
    : true;

  const receiptStatus: ScheduledOpsContinuityStatus = receipts.length >= requiredReceiptCount
    && passReceiptCount >= requiredReceiptCount
    ? 'pass'
    : receipts.length > 0
      ? 'attention'
      : 'blocked';
  const freshnessStatus: ScheduledOpsContinuityStatus = latestReceiptAt
    ? latestReceiptAgeDays !== undefined && latestReceiptAgeDays <= maxLatestReceiptAgeDays
      ? 'pass'
      : 'attention'
    : 'blocked';
  const schedulerEvidenceStatus: ScheduledOpsContinuityStatus = schedulerEvidenceReceiptCount >= requiredReceiptCount
    ? 'pass'
    : schedulerEvidenceReceiptCount > 0
      ? 'attention'
      : 'blocked';
  const backupAuditStatus: ScheduledOpsContinuityStatus = backupStateReceiptCount >= requiredReceiptCount
    && auditStateReceiptCount >= requiredReceiptCount
    ? 'pass'
    : backupStateReceiptCount > 0 && auditStateReceiptCount > 0
      ? 'attention'
      : 'blocked';
  const webhookStatus: ScheduledOpsContinuityStatus = webhookDeliveredReceiptCount > 0
    ? 'pass'
    : webhookDryRunReceiptCount > 0
      ? 'attention'
      : 'blocked';
  const failureStatus: ScheduledOpsContinuityStatus = failureNotices.length === 0
    ? 'pass'
    : recoveredAfterLatestFailure
      ? 'pass'
      : 'blocked';

  const checks = [
    buildCheck(
      'receipt_generation',
      receiptStatus,
      '点検受領書を複数世代で残す',
      `受領書 ${receipts.length}件 / OK ${passReceiptCount}件 / 必要 ${requiredReceiptCount}件`,
      receiptStatus === 'pass' ? '対応不要' : '定期ジョブ点検を複数回実行し、受領書JSONを保管する'
    ),
    buildCheck(
      'latest_receipt_freshness',
      freshnessStatus,
      '最新の点検受領書が古すぎない',
      latestReceiptAt ? `最新 ${latestReceiptAt} / ${latestReceiptAgeDays}日前` : '最新受領書なし',
      freshnessStatus === 'pass' ? '対応不要' : `${maxLatestReceiptAgeDays}日以内の点検受領書を作成する`
    ),
    buildCheck(
      'scheduler_registration_evidence',
      schedulerEvidenceStatus,
      'OSスケジューラ登録証跡を残す',
      `登録証跡あり ${schedulerEvidenceReceiptCount}件 / 必要 ${requiredReceiptCount}件`,
      schedulerEvidenceStatus === 'pass' ? '対応不要' : 'cron、launchd、タスクスケジューラ等の登録ファイルや画面出力を証跡として添付する'
    ),
    buildCheck(
      'backup_and_audit_state_evidence',
      backupAuditStatus,
      'バックアップと監査ログWORMの状態を両方確認する',
      `バックアップ状態 ${backupStateReceiptCount}件 / 監査ログ状態 ${auditStateReceiptCount}件`,
      backupAuditStatus === 'pass' ? '対応不要' : 'バックアップ定期外部保存と監査ログWORM保全の状態JSONを両方添付する'
    ),
    buildCheck(
      'webhook_delivery_drill',
      webhookStatus,
      '失敗通知の到達訓練を実施する',
      `Webhook到達 ${webhookDeliveredReceiptCount}件 / ドライラン ${webhookDryRunReceiptCount}件`,
      webhookStatus === 'pass' ? '対応不要' : '監視Webhookへ患者情報なしの到達訓練イベントを送る'
    ),
    buildCheck(
      'failure_recovery',
      failureStatus,
      '失敗後に復旧点検が走っている',
      latestFailureAt ? `失敗通知 ${failureNotices.length}件 / 最新失敗 ${latestFailureAt}` : '失敗通知なし',
      failureStatus === 'pass' ? '対応不要' : '失敗原因を解消し、同じジョブを再実行して点検受領書を残す'
    )
  ];
  const status = summarizeStatus(checks);

  return {
    type: 'yakureki-scheduled-ops-continuity-review',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    status,
    statusLabel: status === 'pass' ? '定期運用証跡OK' : status === 'attention' ? '定期運用証跡を確認' : '定期運用証跡が未完了',
    receiptCount: receipts.length,
    passReceiptCount,
    requiredReceiptCount,
    latestReceiptAt,
    latestReceiptAgeDays,
    maxLatestReceiptAgeDays,
    schedulerEvidenceReceiptCount,
    backupStateReceiptCount,
    auditStateReceiptCount,
    webhookDeliveredReceiptCount,
    webhookDryRunReceiptCount,
    failureNoticeCount: failureNotices.length,
    latestFailureAt,
    recoveredAfterLatestFailure,
    privacy: {
      containsPatientData: false,
      containsAuditLogBody: false,
      containsBackupBody: false,
      containsLocalPath: false,
      containsWebhookUrl: false,
      containsBearerToken: false,
      containsErrorMessage: false
    },
    checks
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildScheduledOpsContinuityCsv(review: ScheduledOpsContinuityReview): string {
  const rows = [
    ['区分', '判定', '確認項目', '状況', '次の対応'],
    [
      '総括',
      review.statusLabel,
      `受領書 ${review.receiptCount}件 / 失敗通知 ${review.failureNoticeCount}件`,
      `患者情報なし / 監査ログ本文なし / バックアップ本文なし / ローカルパスなし / Webhook URLなし / エラー本文なし`,
      review.status === 'pass' ? '対応不要' : '未完了または要確認の項目を埋める'
    ],
    ...review.checks.map((check) => [
      '確認項目',
      check.statusLabel,
      check.title,
      check.detail,
      check.nextAction
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}
