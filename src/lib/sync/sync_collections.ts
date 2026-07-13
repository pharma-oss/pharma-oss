import { BACKUP_COLLECTIONS, type BackupCollectionName } from '../backup.ts';

// 同期対象コレクションは BACKUP_COLLECTIONS を単一の情報源とする。
// 新しいコレクションを追加するときはここではなく backup.ts の BACKUP_COLLECTIONS
// を更新すれば、バックアップと同期の両方に自動的に反映される。
// audit_logs だけは特別扱い(サテライトはpush専用、ハブは双方向)。
// 参照: docs/satellite_terminal_sync_plan.md

export const SYNC_PUSH_ONLY_FROM_SATELLITE_COLLECTIONS = ['audit_logs'] as const;

export type SyncCollectionName = BackupCollectionName;

export const ALL_SYNC_COLLECTIONS: readonly SyncCollectionName[] = BACKUP_COLLECTIONS;

export function isSyncCollectionName(value: string): value is SyncCollectionName {
  return (ALL_SYNC_COLLECTIONS as readonly string[]).includes(value);
}

export function isPushOnlyFromSatelliteCollection(collection: SyncCollectionName): boolean {
  return (SYNC_PUSH_ONLY_FROM_SATELLITE_COLLECTIONS as readonly string[]).includes(collection);
}
