import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildBackupScheduleReviewState,
  getBackupGenerationReviewDisplay,
  getBackupScheduleReviewDisplay,
  getBackupDrillStatusStyle
} from './backup_settings_helpers.ts';
import {
  DEFAULT_BACKUP_SCHEDULE_POLICY,
  buildBackupGenerationReview,
  type BackupGenerationReview,
  type BackupSchedulePolicy,
  type BackupScheduleReview
} from './backup.ts';
import type { AuditLog } from '../db/types.ts';

test('getBackupGenerationReviewDisplay formats good, attention, and missing status with labels', () => {
  // 1. Pass status
  const goodReview: BackupGenerationReview = {
    monthKey: '2026-08',
    monthLabel: '2026年08月',
    generatedAt: '2026-08-22T00:00:00.000Z',
    status: 'pass',
    statusLabel: '正常',
    latestBackup: {
      dateLabel: '2026/08/20',
      fileName: 'backup_20260820.json'
    },
    latestDrillAt: '2026/08/15',
    latestExternalStorage: {
      dateLabel: '2026/08/21',
      destinationName: 'S3-WORM'
    }
  } as any;
  const goodDisplay = getBackupGenerationReviewDisplay(goodReview);
  assert.strictEqual(goodDisplay.color, '#15803d');
  assert.strictEqual(goodDisplay.background, '#f0fdf4');
  assert.strictEqual(goodDisplay.latestBackupGenerationLabel, '2026/08/20 backup_20260820.json');
  assert.strictEqual(goodDisplay.latestBackupDrillLabel, '2026/08/15 実施済み');
  assert.strictEqual(goodDisplay.latestBackupExternalStorageLabel, '2026/08/21 S3-WORM');

  // 2. Missing data / empty
  const emptyReview: BackupGenerationReview = {
    monthKey: '2026-08',
    monthLabel: '2026年08月',
    generatedAt: '2026-08-22T00:00:00.000Z',
    status: 'attention',
    statusLabel: '要確認'
  } as any;
  const emptyDisplay = getBackupGenerationReviewDisplay(emptyReview);
  assert.strictEqual(emptyDisplay.color, '#b45309');
  assert.strictEqual(emptyDisplay.background, '#fffbeb');
  assert.strictEqual(emptyDisplay.latestBackupGenerationLabel, '未出力');
  assert.strictEqual(emptyDisplay.latestBackupDrillLabel, '未実施');
  assert.strictEqual(emptyDisplay.latestBackupExternalStorageLabel, '未確認');
});

test('getBackupScheduleReviewDisplay returns colors for configured and unconfigured states', () => {
  const configuredReview: BackupScheduleReview = {
    status: 'pass',
    statusLabel: '設定済み'
  } as any;
  const configuredDisplay = getBackupScheduleReviewDisplay(configuredReview);
  assert.strictEqual(configuredDisplay.color, '#15803d');
  assert.strictEqual(configuredDisplay.background, '#f0fdf4');

  const attentionReview: BackupScheduleReview = {
    status: 'attention',
    statusLabel: '注意'
  } as any;
  const attentionDisplay = getBackupScheduleReviewDisplay(attentionReview);
  assert.strictEqual(attentionDisplay.color, '#b45309');
  assert.strictEqual(attentionDisplay.background, '#fffbeb');
});

test('getBackupDrillStatusStyle provides CSS badge styling for pass, attention, and blocked', () => {
  const passStyle = getBackupDrillStatusStyle('pass');
  assert.strictEqual(passStyle.color, '#15803d');
  assert.strictEqual(passStyle.background, '#f0fdf4');

  const attentionStyle = getBackupDrillStatusStyle('attention');
  assert.strictEqual(attentionStyle.color, '#b45309');
  assert.strictEqual(attentionStyle.background, '#fffbeb');

  const blockedStyle = getBackupDrillStatusStyle('blocked');
  assert.strictEqual(blockedStyle.color, '#b91c1c');
  assert.strictEqual(blockedStyle.background, '#fef2f2');
});

// ---- buildBackupScheduleReviewState: 設定画面「閉店時バックアップ予定」の点検 ----
// 過去にフックが「世代管理の点検」を as any で流用し、予定時刻・詳細文が空になっていた。
// 本物のビルダーを通して、予定点検が policy から導かれることを固定する。

const policy = (overrides: Partial<BackupSchedulePolicy> = {}): BackupSchedulePolicy => ({
  ...DEFAULT_BACKUP_SCHEDULE_POLICY,
  scheduledTime: '20:00',
  ...overrides
});

// TZ=Asia/Tokyo(npm test)。ローカル時刻で組み立てる。
const at = (hour: number, minute = 0) => new Date(2026, 9, 7, hour, minute, 0);

function auditLog(overrides: Partial<AuditLog>): AuditLog {
  return {
    logId: 'log-1',
    timestamp: at(18).toISOString(),
    userId: 'u1',
    userName: '管理者',
    userRole: 'admin',
    actionType: 'backup_export',
    details: '',
    ...overrides
  } as AuditLog;
}

const backupExportLog = (when: Date, encrypted: boolean): AuditLog => auditLog({
  logId: `export-${when.getTime()}`,
  timestamp: when.toISOString(),
  actionType: 'backup_export',
  details: `バックアップ書き出し: yakureki_backup_20261007.json に 120件のローカルデータを書き出しました。${encrypted ? '（パスワード暗号化保護）' : ''}`
});

test('buildBackupScheduleReviewState reviews the schedule policy, not the generation history', () => {
  const state = buildBackupScheduleReviewState([], policy({ scheduledTime: '22:30' }), at(10));

  // 設定タブが描画する項目はすべてスケジュール点検の値でなければならない
  assert.equal(state.review.scheduledTime, '22:30');
  assert.equal(state.review.isDue, false);
  assert.equal(state.review.isEnabled, true);
  assert.equal(state.review.actionLabel, '予定時刻待ち');
  assert.match(state.review.detail, /^予定 .*22:30.* \/ 最新バックアップ .* \/ 外部保存 /);
  assert.deepEqual(state.review.requiredActions, ['22:30以降にバックアップを書き出す']);

  // 世代管理の点検は別の形をしており、これらのフィールドを持たない(as any で取り違えると空欄になる)
  const generationReview = buildBackupGenerationReview([], at(10)) as unknown as Record<string, unknown>;
  assert.equal(generationReview.scheduledTime, undefined);
  assert.equal(generationReview.detail, undefined);
});

test('buildBackupScheduleReviewState turns blocked (red) once the scheduled time has passed without a backup today', () => {
  const state = buildBackupScheduleReviewState([], policy({ scheduledTime: '20:00' }), at(21));

  assert.equal(state.review.isDue, true);
  assert.equal(state.review.status, 'blocked');
  assert.equal(state.review.actionLabel, '今すぐ書き出し');
  assert.deepEqual(state.review.requiredActions, ['今日のバックアップを書き出す']);
  assert.equal(state.color, '#b91c1c');
  assert.equal(state.background, '#fef2f2');
});

test('buildBackupScheduleReviewState follows the policy being edited: the same logs give different answers per scheduled time', () => {
  const now = at(15);
  const beforeDue = buildBackupScheduleReviewState([], policy({ scheduledTime: '23:59' }), now);
  const afterDue = buildBackupScheduleReviewState([], policy({ scheduledTime: '00:00' }), now);

  assert.equal(beforeDue.review.status, 'pass');
  assert.equal(beforeDue.color, '#15803d');
  assert.equal(afterDue.review.status, 'blocked');
});

test('buildBackupScheduleReviewState asks for attention when the schedule is disabled', () => {
  const state = buildBackupScheduleReviewState([], policy({ enabled: false }), at(21));

  assert.equal(state.review.isEnabled, false);
  assert.equal(state.review.status, 'attention');
  assert.equal(state.review.actionLabel, '時刻を設定');
  assert.equal(state.color, '#b45309');
  assert.equal(state.background, '#fffbeb');
});

test('buildBackupScheduleReviewState recognises today\'s encrypted backup and still requires external storage when the policy says so', () => {
  const logs = [backupExportLog(at(18, 30), true)];

  const needsExternal = buildBackupScheduleReviewState(logs, policy({ requireExternalStorage: true }), at(21));
  assert.equal(needsExternal.review.status, 'attention');
  assert.equal(needsExternal.review.actionLabel, '外部保存確認');

  const complete = buildBackupScheduleReviewState(logs, policy({ requireExternalStorage: false }), at(21));
  assert.equal(complete.review.status, 'pass');
  assert.equal(complete.review.actionLabel, '本日分完了');
  assert.equal(complete.review.latestBackup?.fileName, 'yakureki_backup_20261007.json');
  assert.equal(complete.color, '#15803d');
});

test('buildBackupScheduleReviewState flags a plaintext backup when the policy requires encryption', () => {
  const logs = [backupExportLog(at(18, 30), false)];

  const strict = buildBackupScheduleReviewState(logs, policy({ requireEncrypted: true, requireExternalStorage: false }), at(21));
  assert.equal(strict.review.status, 'attention');
  assert.equal(strict.review.actionLabel, '暗号化で再保存');

  const relaxed = buildBackupScheduleReviewState(logs, policy({ requireEncrypted: false, requireExternalStorage: false }), at(21));
  assert.equal(relaxed.review.status, 'pass');
});

test('buildBackupScheduleReviewState ignores backups from other days', () => {
  const yesterday = new Date(2026, 9, 6, 18, 30, 0);
  const state = buildBackupScheduleReviewState([backupExportLog(yesterday, true)], policy(), at(21));

  assert.equal(state.review.latestBackup, undefined);
  assert.equal(state.review.status, 'blocked');
});
