'use client';

import { useEffect, useRef, useState } from 'react';
import { CloudOff, Cloud, RefreshCw } from 'lucide-react';
import { resolveClientSyncIdentity, type ClientSyncRole } from '@/lib/sync/client_role';
import { getActiveReplicationHandle } from '@/lib/sync/replication_bootstrap';
import { useDatabase } from '@/db/DatabaseContext';

// ヘッダー常時表示の同期ステータス。standaloneでは何も描画しない。
// サテライトで未同期データがある(またはメイン端末未接続の)状態でタブを閉じようと
// すると、メモリ上のデータ消失を防ぐための確認ダイアログを出す。

type SyncIndicatorState = 'synced' | 'syncing' | 'disconnected';

const POLL_INTERVAL_MS = 4000;

async function probeHubReachable(): Promise<boolean> {
  try {
    const response = await fetch('/api/sync/status');
    if (!response.ok) return false;
    const body = await response.json();
    if (body.role === 'hub') return true;
    return body.hubReachable !== false;
  } catch {
    return false;
  }
}

export function SyncStatusIndicator() {
  // dbが確定した時点で startAppReplication 済み(DatabaseProviderがsetDbより先に呼ぶ)。
  // ヘッダーはdb確定前にも描画されるため、db を購読エフェクトの依存にして再試行する。
  const db = useDatabase();
  const [role, setRole] = useState<ClientSyncRole>('standalone');
  const [hubReachable, setHubReachable] = useState(true);
  // 「同期中」は awaitInSync() のレースではなく、各レプリケーションの active$
  // (実際に転送サイクルが走っているか)で判定する。awaitInSync は定期 reSync の
  // たびにリセットされ、14コレクション分を短いタイムアウトで競わせると
  // 常に「同期中」表示に張り付いてしまう。
  const [activeCollectionCount, setActiveCollectionCount] = useState(0);
  const indicatorRef = useRef<SyncIndicatorState>('synced');

  useEffect(() => {
    let cancelled = false;
    resolveClientSyncIdentity().then(({ role: resolvedRole }) => {
      if (!cancelled) {
        setRole(resolvedRole);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (role === 'standalone') return;

    let cancelled = false;
    const evaluate = async () => {
      const reachable = await probeHubReachable();
      if (!cancelled) setHubReachable(reachable);
    };
    evaluate();
    const timer = setInterval(evaluate, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [role]);

  useEffect(() => {
    if (role === 'standalone') return;
    const handle = getActiveReplicationHandle();
    if (!handle) return;
    const activeCollections = new Set<string>();
    const subscriptions = Object.entries(handle.states).map(([collectionName, state]) =>
      state.active$.subscribe((isActive: boolean) => {
        if (isActive) {
          activeCollections.add(collectionName);
        } else {
          activeCollections.delete(collectionName);
        }
        setActiveCollectionCount(activeCollections.size);
      })
    );
    return () => subscriptions.forEach((subscription) => subscription.unsubscribe());
  }, [role, db]);

  const indicator: SyncIndicatorState = !hubReachable
    ? 'disconnected'
    : activeCollectionCount > 0
      ? 'syncing'
      : 'synced';
  indicatorRef.current = indicator;

  useEffect(() => {
    if (role !== 'satellite') return;
    // サテライトはタブを閉じるとメモリ上の未同期データが消える。
    // 同期済みなら黙って閉じられる(データはメイン端末にある)。
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (indicatorRef.current === 'synced') return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [role]);

  if (role === 'standalone') return null;

  const roleLabel = role === 'hub' ? 'メイン端末' : 'サテライト';
  const config = indicator === 'disconnected'
    ? {
        icon: <CloudOff size={14} aria-hidden="true" />,
        label: role === 'satellite' ? 'メイン端末未接続・未同期データはこの端末のみ' : '同期エラー',
        background: 'rgba(254, 226, 226, 0.9)',
        color: '#b91c1c',
        border: '1px solid #fecaca'
      }
    : indicator === 'syncing'
      ? {
          icon: <RefreshCw size={14} aria-hidden="true" />,
          label: '同期中…',
          background: 'rgba(254, 249, 195, 0.9)',
          color: '#a16207',
          border: '1px solid #fde68a'
        }
      : {
          icon: <Cloud size={14} aria-hidden="true" />,
          label: '同期済み',
          background: 'rgba(220, 252, 231, 0.9)',
          color: '#15803d',
          border: '1px solid #bbf7d0'
        };

  return (
    <div
      role="status"
      aria-live="polite"
      title={`${roleLabel}: ${config.label}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.35rem 0.7rem',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        background: config.background,
        color: config.color,
        border: config.border
      }}
    >
      {config.icon}
      <span>{roleLabel}: {config.label}</span>
    </div>
  );
}
