import encoding from 'encoding-japanese';
import {
  buildBackupScheduleReview,
  type BackupGenerationReview,
  type BackupSchedulePolicy,
  type BackupScheduleReview,
  type BackupRestoreDrillReport
} from './backup.ts';
import {
  buildDrugStockCsvMigrationPreview,
  buildPatientCsvMigrationPreview,
  buildSoapCsvMigrationPreview,
  buildVisitCsvMigrationPreview,
  type DrugStockCsvMigrationPreview,
  type PatientCsvMigrationPreview,
  type SoapCsvMigrationPreview,
  type VisitCsvMigrationPreview
} from './migration_csv.ts';
import type { AuditLog } from '../db/types.ts';

export function getBackupGenerationReviewDisplay(review: BackupGenerationReview) {
  const color = review.status === 'pass'
    ? '#15803d'
    : review.status === 'attention'
      ? '#b45309'
      : '#b91c1c';
  const background = review.status === 'pass'
    ? '#f0fdf4'
    : review.status === 'attention'
      ? '#fffbeb'
      : '#fef2f2';

  const latestBackupGenerationLabel = review.latestBackup
    ? `${review.latestBackup.dateLabel} ${review.latestBackup.fileName || 'ファイル名未記録'}`
    : '未出力';
  const latestBackupDrillLabel = review.latestDrillAt
    ? `${review.latestDrillAt} 実施済み`
    : '未実施';
  const latestBackupExternalStorageLabel = review.latestExternalStorage
    ? `${review.latestExternalStorage.dateLabel} ${review.latestExternalStorage.destinationName || '外部保存先'}`
    : '未確認';

  return {
    color,
    background,
    latestBackupGenerationLabel,
    latestBackupDrillLabel,
    latestBackupExternalStorageLabel
  };
}

export function getBackupScheduleReviewDisplay(review: BackupScheduleReview) {
  const color = review.status === 'pass'
    ? '#15803d'
    : review.status === 'attention'
      ? '#b45309'
      : '#b91c1c';
  const background = review.status === 'pass'
    ? '#f0fdf4'
    : review.status === 'attention'
      ? '#fffbeb'
      : '#fef2f2';

  return { color, background };
}

// 設定 > バックアップ「閉店時バックアップ予定」の点検。編集中のポリシーから導く
// (世代管理の点検 buildBackupGenerationReview とは別の形で、scheduledTime / detail などを持つ)。
export function buildBackupScheduleReviewState(
  auditLogs: AuditLog[],
  policy: BackupSchedulePolicy,
  generatedAt: Date = new Date()
) {
  const review = buildBackupScheduleReview(auditLogs, policy, generatedAt);
  return { review, ...getBackupScheduleReviewDisplay(review) };
}

export function getBackupDrillStatusStyle(status: BackupRestoreDrillReport['status']) {
  const styles = {
    pass: { color: '#15803d', background: '#f0fdf4', border: '#86efac' },
    attention: { color: '#b45309', background: '#fffbeb', border: '#fcd34d' },
    blocked: { color: '#b91c1c', background: '#fef2f2', border: '#fca5a5' }
  }[status];

  return {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    borderRadius: '999px',
    border: `1px solid ${styles.border}`,
    padding: '0.16rem 0.6rem',
    fontSize: 'var(--fs-xs)',
    fontWeight: 800,
    color: styles.color,
    background: styles.background,
    whiteSpace: 'nowrap' as const
  };
}

export type MigrationCsvKind = 'patients' | 'visits' | 'drug_stocks' | 'soap_records';
export type MigrationCsvPreview =
  | PatientCsvMigrationPreview
  | VisitCsvMigrationPreview
  | DrugStockCsvMigrationPreview
  | SoapCsvMigrationPreview;

// 移行CSVのバイト列を文字コード自動判定で文字列へ戻す(他社レセコンの出力は Shift_JIS が多い)。
// 判定できなければ Shift_JIS とみなす。
export function decodeMigrationCsvBytes(bytes: Uint8Array): string {
  const detectedEncoding = encoding.detect(bytes);
  const unicodeArray = encoding.convert(bytes, {
    to: 'UNICODE',
    from: typeof detectedEncoding === 'string' ? detectedEncoding : 'SJIS'
  });
  return encoding.codeToString(unicodeArray as number[]);
}

export function getMigrationCsvLabel(kind: MigrationCsvKind): string {
  return kind === 'patients'
    ? '患者CSV'
    : kind === 'visits'
      ? '受付CSV'
      : kind === 'drug_stocks'
        ? '在庫CSV'
        : '薬歴CSV';
}

export function buildMigrationCsvPreview(
  kind: MigrationCsvKind,
  csvText: string,
  generatedAt: Date
): MigrationCsvPreview {
  return kind === 'patients'
    ? buildPatientCsvMigrationPreview(csvText, { generatedAt })
    : kind === 'visits'
      ? buildVisitCsvMigrationPreview(csvText, { generatedAt })
      : kind === 'drug_stocks'
        ? buildDrugStockCsvMigrationPreview(csvText, { generatedAt })
        : buildSoapCsvMigrationPreview(csvText, { generatedAt });
}

// プレビュー作成後に出すトーストの種類と文言(blocked は修正を促すエラー、attention は警告)
export function describeMigrationPreviewResult(
  label: string,
  preview: MigrationCsvPreview
): { level: 'error' | 'warning' | 'success'; message: string } {
  if (preview.status === 'blocked') {
    return {
      level: 'error',
      message: `${label}の移行プレビューを作成しました（${preview.statusLabel}）。指摘を修正してください。`
    };
  }
  if (preview.status === 'attention') {
    return {
      level: 'warning',
      message: `${label}の移行プレビューを作成しました（${preview.statusLabel}）。`
    };
  }
  return {
    level: 'success',
    message: `${label}の移行プレビューを作成しました（${preview.rows.length}件）。`
  };
}
