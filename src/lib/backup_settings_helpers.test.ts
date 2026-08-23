import { test } from 'node:test';
import assert from 'node:assert';
import {
  getBackupGenerationReviewDisplay,
  getBackupScheduleReviewDisplay,
  getBackupDrillStatusStyle
} from './backup_settings_helpers.ts';
import type { BackupGenerationReview, BackupScheduleReview } from './backup.ts';

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
