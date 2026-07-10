import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildScheduledOpsContinuityCsv,
  buildScheduledOpsContinuityReview,
  type ScheduledOpsDrillReceiptInput
} from './scheduled_ops_continuity.ts';

const generatedAt = new Date('2026-06-23T12:00:00.000Z');

function receipt(checkedAt: string, overrides: Partial<ScheduledOpsDrillReceiptInput> = {}): ScheduledOpsDrillReceiptInput {
  return {
    type: 'scheduled-ops-drill-receipt',
    checkedAt,
    schedulerName: 'yakureki-nightly',
    status: 'pass',
    backupState: {
      statePath: '/Users/store-a/secret/backup_external_transfer_schedule_state.json',
      receiptPath: '/Users/store-a/secret/backup_receipt.json'
    },
    auditState: {
      statePath: '/Users/store-a/secret/audit_log_s3_worm_retention_schedule_state.json',
      receiptPath: '/Users/store-a/secret/audit_receipt.json'
    },
    schedulerEvidence: [{
      fileName: 'yakureki-nightly.launchd.plist',
      path: '/Users/store-a/Library/LaunchAgents/yakureki-nightly.launchd.plist',
      sha256: 'a'.repeat(64)
    }],
    webhook: {
      delivered: true,
      dryRun: false
    },
    checks: [
      { id: 'scheduler-evidence', status: 'pass' },
      { id: 'backup-state', status: 'pass' },
      { id: 'audit-state', status: 'pass' }
    ],
    ...overrides
  };
}

test('buildScheduledOpsContinuityReview passes with multiple current receipts and recovered failures', () => {
  const review = buildScheduledOpsContinuityReview({
    generatedAt,
    receipts: [
      receipt('2026-06-15T21:00:00.000Z'),
      receipt('2026-06-22T21:00:00.000Z')
    ],
    failureNotices: [{
      type: 'backup-external-transfer-failure-notice',
      failedAt: '2026-06-14T21:00:00.000Z',
      status: 'failed',
      statusLabel: '外部保存ジョブ失敗',
      requiredActions: ['secret retry note']
    }]
  });

  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.receiptCount, 2);
  assert.strictEqual(review.passReceiptCount, 2);
  assert.strictEqual(review.latestReceiptAt, '2026-06-22T21:00:00.000Z');
  assert.strictEqual(review.failureNoticeCount, 1);
  assert.strictEqual(review.recoveredAfterLatestFailure, true);
  assert.ok(review.checks.every((check) => check.status === 'pass'));
});

test('buildScheduledOpsContinuityReview blocks when a failure is newer than the latest receipt', () => {
  const review = buildScheduledOpsContinuityReview({
    generatedAt,
    receipts: [
      receipt('2026-06-15T21:00:00.000Z'),
      receipt('2026-06-20T21:00:00.000Z')
    ],
    failureNotices: [{
      type: 'audit-log-s3-worm-retention-failure-notice',
      failedAt: '2026-06-22T21:00:00.000Z',
      status: 'failed',
      statusLabel: '監査ログWORM保全失敗',
      requiredActions: ['secret audit retry note']
    }]
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.recoveredAfterLatestFailure, false);
  assert.ok(review.checks.some((check) => check.id === 'failure_recovery' && check.status === 'blocked'));
});

test('buildScheduledOpsContinuityReview calls out missing scheduler evidence and dry-run webhooks', () => {
  const review = buildScheduledOpsContinuityReview({
    generatedAt,
    receipts: [
      receipt('2026-06-22T21:00:00.000Z', {
        schedulerEvidence: [],
        webhook: { delivered: false, dryRun: true },
        checks: [
          { id: 'scheduler-evidence', status: 'missing' },
          { id: 'backup-state', status: 'pass' },
          { id: 'audit-state', status: 'pass' }
        ]
      })
    ]
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.receiptCount, 1);
  assert.strictEqual(review.webhookDryRunReceiptCount, 1);
  assert.ok(review.checks.some((check) => check.id === 'scheduler_registration_evidence' && check.status === 'blocked'));
  assert.ok(review.checks.some((check) => check.id === 'webhook_delivery_drill' && check.status === 'attention'));
});

test('buildScheduledOpsContinuityCsv omits paths, webhook URLs, bearer tokens, and error messages', () => {
  const review = buildScheduledOpsContinuityReview({
    generatedAt,
    receipts: [
      receipt('2026-06-15T21:00:00.000Z'),
      receipt('2026-06-22T21:00:00.000Z')
    ],
    failureNotices: [{
      type: 'backup-external-transfer-failure-notice',
      failedAt: '2026-06-14T21:00:00.000Z',
      status: 'failed',
      statusLabel: '外部保存ジョブ失敗',
      requiredActions: ['Bearer secret-token / /Users/store-a/secret / https://monitor.example.test/hook / =retry']
    }]
  });
  const csv = buildScheduledOpsContinuityCsv(review);

  assert.match(csv, /定期運用証跡OK/);
  assert.match(csv, /患者情報なし/);
  assert.doesNotMatch(csv, /secret-token|\/Users\/store-a|monitor\.example|Bearer|=retry/);
});
