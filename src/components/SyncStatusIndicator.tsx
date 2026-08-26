'use client';

import { useEffect, useRef, useState } from 'react';
import { CloudOff, Cloud, RefreshCw, AlertTriangle, AlertOctagon } from 'lucide-react';
import { resolveClientSyncIdentity, type ClientSyncRole } from '@/lib/sync/client_role';
import { getActiveReplicationHandle } from '@/lib/sync/replication_bootstrap';
import { getSatelliteQueueHealth, type SatelliteQueueHealth } from '@/lib/sync/satellite_local_queue';
import { useDatabase } from '@/db/DatabaseContext';

// ヘッダー常時表示の同期ステータス。standaloneでは何も描画しない。
// サテライトで未同期データがある(またはメイン端末未接続の)状態でタブを閉じようと
// すると、メモリ上のデータ消失を防ぐための確認ダイアログを出す。

type SyncIndicatorState = 'synced' | 'syncing' | 'disconnected' | 'warning-limit' | 'danger-expired' | 'danger-limit';

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
  const db = useDatabase();
  const [role, setRole] = useState<ClientSyncRole>('standalone');
  const [hubReachable, setHubReachable] = useState(true);
  const [activeCollectionCount, setActiveCollectionCount] = useState(0);
  const [queueHealth, setQueueHealth] = useState<SatelliteQueueHealth | null>(null);
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

      if (role === 'satellite') {
        const health = getSatelliteQueueHealth();
        if (!cancelled) setQueueHealth(health);

        if (reachable) {
          import('@/lib/sync/satellite_local_queue').then(({ flushUnsentLocalQueue }) => {
            flushUnsentLocalQueue().then(() => {
              if (!cancelled) setQueueHealth(getSatelliteQueueHealth());
            });
          }).catch(() => {});
        }
      }
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

  let indicator: SyncIndicatorState = 'synced';
  if (role === 'satellite' && queueHealth) {
    if (queueHealth.isLimitExceeded) {
      indicator = 'danger-limit';
    } else if (queueHealth.hasExpired) {
      indicator = 'danger-expired';
    } else if (queueHealth.isNearLimit) {
      indicator = 'warning-limit';
    } else if (!hubReachable) {
      indicator = 'disconnected';
    } else if (activeCollectionCount > 0 || queueHealth.total > 0) {
      indicator = 'syncing';
    } else {
      indicator = 'synced';
    }
  } else {
    indicator = !hubReachable
      ? 'disconnected'
      : activeCollectionCount > 0
        ? 'syncing'
        : 'synced';
  }
  indicatorRef.current = indicator;

  useEffect(() => {
    if (role !== 'satellite') return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        import('@/lib/sync/satellite_local_queue').then(({ flushUnsentLocalQueue }) => {
          flushUnsentLocalQueue();
        }).catch(() => {});
      }
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (indicatorRef.current === 'synced') return;
      import('@/lib/sync/satellite_local_queue').then(({ flushUnsentLocalQueue }) => {
        flushUnsentLocalQueue();
      }).catch(() => {});
      event.preventDefault();
      event.returnValue = '';
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [role]);

  if (role === 'standalone') return null;

  const roleLabel = role === 'hub' ? 'メイン端末' : 'サテライト';
  const getIndicatorConfig = () => {
    switch (indicator) {
      case 'danger-limit':
        return {
          icon: <AlertOctagon size={14} aria-hidden="true" />,
          label: `未送信 ${queueHealth?.total ?? 0}件 (上限超過・要同期)`,
          className: 'is-danger'
        };
      case 'danger-expired':
        return {
          icon: <AlertTriangle size={14} aria-hidden="true" />,
          label: `未送信 ${queueHealth?.total ?? 0}件 (前日未送信 ${queueHealth?.expiredCount ?? 0}件)`,
          className: 'is-danger'
        };
      case 'warning-limit':
        return {
          icon: <AlertTriangle size={14} aria-hidden="true" />,
          label: `未送信 ${queueHealth?.total ?? 0}件 (上限接近)`,
          className: 'is-warning'
        };
      case 'disconnected':
        return {
          icon: <CloudOff size={14} aria-hidden="true" />,
          label: role === 'satellite'
            ? queueHealth && queueHealth.total > 0
              ? `未同期 ${queueHealth.total}件 (Hub未接続)`
              : 'メイン端末未接続'
            : '同期エラー',
          className: 'is-disconnected'
        };
      case 'syncing':
        return {
          icon: <RefreshCw size={14} className="animate-spin" aria-hidden="true" />,
          label: role === 'satellite' && queueHealth && queueHealth.total > 0
            ? `同期中… (未送信 ${queueHealth.total}件)`
            : '同期中…',
          className: 'is-syncing'
        };
      case 'synced':
      default:
        return {
          icon: <Cloud size={14} aria-hidden="true" />,
          label: '同期済み',
          className: 'is-synced'
        };
    }
  };

  const config = getIndicatorConfig();

  return (
    <div
      role="status"
      aria-live="polite"
      title={`${roleLabel}: ${config.label}`}
      className={`sync-status-indicator ${config.className}`}
      data-testid="sync-status-indicator"
    >
      {config.icon}
      <span>{roleLabel}: {config.label}</span>
      <style jsx>{`
        .sync-status-indicator {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1) var(--space-2-5);
          border-radius: 999px;
          font-size: var(--fs-xs);
          font-weight: 600;
          white-space: nowrap;
          transition: background-color 0.2s ease, border-color 0.2s ease;
        }
        .sync-status-indicator.is-danger {
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #f87171;
        }
        .sync-status-indicator.is-warning {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fcd34d;
        }
        .sync-status-indicator.is-disconnected {
          background: rgba(254, 226, 226, 0.9);
          color: #b91c1c;
          border: 1px solid #fecaca;
        }
        .sync-status-indicator.is-syncing {
          background: rgba(254, 249, 195, 0.9);
          color: #a16207;
          border: 1px solid #fde68a;
        }
        .sync-status-indicator.is-synced {
          background: rgba(220, 252, 231, 0.9);
          color: #15803d;
          border: 1px solid #bbf7d0;
        }
        :global(.animate-spin) {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
