import type { PharmacyDatabase } from '@/db/types';
import { startReplication, type ReplicationHandle, type SyncReplicationRole } from './replication_client';

// DatabaseProvider がアプリ起動時に1回だけレプリケーションを開始するための
// シングルトン。起動後のハンドルは同期ステータスUI(Phase 3)からも参照する。

let activeHandle: ReplicationHandle | null = null;
let activeRole: SyncReplicationRole | null = null;

// サテライトはログイン(users)と施設設定(facility_settings)が揃うまで業務を開始できない。
// 薬品マスタなどの大きいコレクションは裏で同期を続け、ログインをブロックしない。
export const SATELLITE_LOGIN_GATE_COLLECTIONS = ['users', 'facility_settings'] as const;

export function startAppReplication(db: PharmacyDatabase, role: SyncReplicationRole): ReplicationHandle {
  if (activeHandle) return activeHandle;
  activeRole = role;
  activeHandle = startReplication(db, { role });
  return activeHandle;
}

export async function awaitSatelliteLoginGate(handle: ReplicationHandle): Promise<void> {
  await Promise.all(
    SATELLITE_LOGIN_GATE_COLLECTIONS.map((collection) => handle.states[collection]?.awaitInitialReplication())
  );
}

export function getActiveReplicationHandle(): ReplicationHandle | null {
  return activeHandle;
}

export function getActiveReplicationRole(): SyncReplicationRole | null {
  return activeRole;
}
