import {
  DEFAULT_BACKUP_SCHEDULE_POLICY,
  normalizeBackupSchedulePolicy,
  type BackupSchedulePolicy
} from './backup.ts';

export const BACKUP_SCHEDULE_POLICY_STORAGE_KEY = 'yakureki_backup_schedule_policy';

export function readBackupSchedulePolicy(): BackupSchedulePolicy {
  if (typeof window === 'undefined') {
    return DEFAULT_BACKUP_SCHEDULE_POLICY;
  }

  try {
    const raw = window.localStorage.getItem(BACKUP_SCHEDULE_POLICY_STORAGE_KEY);
    return normalizeBackupSchedulePolicy(raw ? JSON.parse(raw) : undefined);
  } catch (error) {
    console.warn('Failed to read backup schedule policy:', error);
    return DEFAULT_BACKUP_SCHEDULE_POLICY;
  }
}

export function writeBackupSchedulePolicy(policy: BackupSchedulePolicy): BackupSchedulePolicy {
  const normalized = normalizeBackupSchedulePolicy(policy);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(BACKUP_SCHEDULE_POLICY_STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized;
}
