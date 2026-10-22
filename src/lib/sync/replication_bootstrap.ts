import type { PharmacyDatabase } from '@/db/types';
import { startReplication, type ReplicationHandle, type SyncReplicationRole } from './replication_client';

// DatabaseProvider がアプリ起動時に1回だけレプリケーションを開始するための
// シングルトン。起動後のハンドルは同期ステータスUI(Phase 3)からも参照する。

let activeHandle: ReplicationHandle | null = null;
let activeRole: SyncReplicationRole | null = null;
const handleListeners = new Set<(handle: ReplicationHandle | null) => void>();

function setActiveHandle(handle: ReplicationHandle | null): void {
  activeHandle = handle;
  handleListeners.forEach((listener) => listener(handle));
}

// サテライトはログイン(users)と施設設定(facility_settings)が揃うまで業務を開始できない。
// 薬品マスタなどの大きいコレクションは裏で同期を続け、ログインをブロックしない。
export const SATELLITE_LOGIN_GATE_COLLECTIONS = ['users', 'facility_settings'] as const;

export function startAppReplication(db: PharmacyDatabase, role: SyncReplicationRole, replicationEpoch?: string): ReplicationHandle {
  if (activeHandle) return activeHandle;
  activeRole = role;
  const handle = startReplication(db, { role, replicationEpoch });
  setActiveHandle(handle);
  return handle;
}

/**
 * サテライトが接続先のハブを切り替えた後に、レプリケーションを新しい世代でやり直す。
 * タブを開いたまま(メモリDBを保ったまま)切り替えるので、この端末にだけある入力は新しいハブへ送られ、
 * 新しいハブの内容は最初から取り込まれる。
 */
export async function restartAppReplication(
  db: PharmacyDatabase,
  role: SyncReplicationRole,
  replicationEpoch: string
): Promise<ReplicationHandle> {
  const previous = activeHandle;
  setActiveHandle(null);
  await previous?.cancel();
  activeRole = role;
  const handle = startReplication(db, { role, replicationEpoch });
  setActiveHandle(handle);
  return handle;
}

/** 起動中のレプリケーションが差し替わったとき(接続先の切替)に通知を受ける。解除関数を返す。 */
export function subscribeToReplicationHandle(listener: (handle: ReplicationHandle | null) => void): () => void {
  handleListeners.add(listener);
  return () => { handleListeners.delete(listener); };
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
