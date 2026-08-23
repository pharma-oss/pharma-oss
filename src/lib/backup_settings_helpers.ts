import type {
  BackupGenerationReview,
  BackupScheduleReview,
  BackupRestoreDrillReport
} from './backup.ts';

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
