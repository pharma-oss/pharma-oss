'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, AlertOctagon, RefreshCw, ArrowRight, CheckCircle2 } from 'lucide-react';
import { resolveClientSyncIdentity } from '@/lib/sync/client_role';
import {
  getSatelliteQueueHealth,
  flushUnsentLocalQueue,
  SATELLITE_QUEUE_LIMITS,
  type SatelliteQueueHealth
} from '@/lib/sync/satellite_local_queue';
import { toast } from 'sonner';

export type QueueWarningSeverity = 'danger' | 'warning';
export type QueueWarningCause = 'limit_exceeded' | 'expired' | 'near_limit' | 'persistence_failed' | 'corrupted';

export interface QueueWarning {
  severity: QueueWarningSeverity;
  cause: QueueWarningCause;
  title: string;
  description: string;
}

// 警告条件: 保存失敗、破損、上限超過または期限切れは danger、上限接近のみは warning。いずれにも当たらなければ表示しない。
// 文言の優先順位は 保存失敗 > 破損 > 上限超過 > 期限切れ > 上限接近。
export function resolveQueueWarning(health: SatelliteQueueHealth | null): QueueWarning | null {
  if (!health) return null;
  const limitLabel = SATELLITE_QUEUE_LIMITS.MAX_RECOMMENDED_RECORDS.toLocaleString('ja-JP');

  if (health.hasStoragePersistenceError || health.hasPersistentKeyError) {
    return {
      severity: 'danger',
      cause: 'persistence_failed',
      title: '【データ保全警告】未送信データの端末保存に失敗しています',
      description: '端末ストレージの容量超過または制限により、未送信キューを永続化できません。ブラウザを閉じると未送信データが消失する危険があります。直ちにHub端末へ同期してください。'
    };
  }
  if (health.hasCorruptedQueue) {
    return {
      severity: 'danger',
      cause: 'corrupted',
      title: '【データ保全警告】未送信キューのデータが破損しています',
      description: '端末内に保存された未送信キューの復号または解析に失敗しました。Hub端末との接続を確認し、同期状態を点検してください。'
    };
  }
  if (health.isLimitExceeded) {
    return {
      severity: 'danger',
      cause: 'limit_exceeded',
      title: `【要同期】未送信データが ${health.total} 件滞留しています（推奨上限${limitLabel}件超過）`,
      description: 'サテライト端末の未送信キューが上限に達しています。Hub端末へデータを同期するまで、新規受付等の連続入力は控えてください。'
    };
  }
  if (health.hasExpired) {
    return {
      severity: 'danger',
      cause: 'expired',
      title: `【要対応】前日以前の未送信データが ${health.expiredCount} 件滞留しています`,
      description: '未送信のまま日付を跨いだ患者データがあります。データ欠落や重複を防止するため、Hub端末との接続を確認し、即座に同期を完了させてください。'
    };
  }
  if (health.isNearLimit) {
    return {
      severity: 'warning',
      cause: 'near_limit',
      title: `【注意】未送信データが ${health.total} 件滞留しています（推奨上限${limitLabel}件）`,
      description: '通信切断が継続すると未送信データが蓄積されます。Hub端末の稼働およびネットワーク接続を確認してください。'
    };
  }
  return null;
}

export function SatelliteQueueWarningBanner() {
  const router = useRouter();
  const [role, setRole] = useState<'hub' | 'satellite' | 'standalone'>('standalone');
  const [health, setHealth] = useState<SatelliteQueueHealth | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const checkHealth = useCallback(() => {
    if (typeof window === 'undefined') return;
    const currentHealth = getSatelliteQueueHealth();
    setHealth(currentHealth);
  }, []);

  useEffect(() => {
    let cancelled = false;
    resolveClientSyncIdentity().then((identity) => {
      if (!cancelled) {
        setRole(identity.role);
        if (identity.role === 'satellite') {
          checkHealth();
        }
      }
    });
    return () => { cancelled = true; };
  }, [checkHealth]);

  useEffect(() => {
    if (role !== 'satellite') return;
    const interval = setInterval(checkHealth, 3000);
    return () => clearInterval(interval);
  }, [role, checkHealth]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const result = await flushUnsentLocalQueue();
      if (result.flushedCount > 0) {
        toast.success(`${result.flushedCount} 件の未送信データをHubへ同期しました。`);
      } else if (result.remainingCount === 0) {
        toast.success('未送信データはありません。');
      } else {
        toast.warning(`Hub端末と通信できませんでした (未送信残り: ${result.remainingCount} 件)`);
      }
      checkHealth();
    } catch {
      toast.error('同期中にエラーが発生しました。Hub端末の稼働状態を確認してください。');
    } finally {
      setIsSyncing(false);
    }
  };

  if (role !== 'satellite') return null;

  return (
    <SatelliteQueueWarningBannerView
      health={health}
      isSyncing={isSyncing}
      onManualSync={handleManualSync}
      onOpenSettings={() => router.push('/settings?tab=terminalSync')}
    />
  );
}

export interface SatelliteQueueWarningBannerViewProps {
  health: SatelliteQueueHealth | null;
  isSyncing: boolean;
  onManualSync: () => void;
  onOpenSettings: () => void;
}

export function SatelliteQueueWarningBannerView({
  health,
  isSyncing,
  onManualSync,
  onOpenSettings
}: SatelliteQueueWarningBannerViewProps) {
  const warning = resolveQueueWarning(health);
  if (!warning) return null;
  const isDanger = warning.severity === 'danger';

  return (
    <aside
      className={`satellite-queue-banner ${isDanger ? 'is-danger' : 'is-warning'}`}
      role="alert"
      aria-live="assertive"
      data-testid="satellite-queue-warning-banner"
    >
      <div className="banner-content">
        <div className="banner-icon-col">
          {warning.cause === 'limit_exceeded' ? (
            <AlertOctagon size={20} className="banner-icon icon-danger" aria-hidden="true" />
          ) : (
            <AlertTriangle size={20} className={`banner-icon ${isDanger ? 'icon-danger' : 'icon-warning'}`} aria-hidden="true" />
          )}
        </div>
        <div className="banner-text-col">
          <strong className="banner-title">{warning.title}</strong>
          <p className="banner-desc">{warning.description}</p>
        </div>
        <div className="banner-actions">
          <button
            type="button"
            className={`btn-sync-action ${isDanger ? 'btn-danger-sync' : 'btn-warning-sync'}`}
            onClick={onManualSync}
            disabled={isSyncing}
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} aria-hidden="true" />
            <span>{isSyncing ? '同期中…' : '今すぐ同期'}</span>
          </button>
          <button
            type="button"
            className="btn-details-action"
            onClick={onOpenSettings}
          >
            <span>端末同期設定</span>
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      <style jsx>{`
        .satellite-queue-banner {
          width: 100%;
          border-bottom: 2px solid transparent;
          padding: var(--space-3) var(--space-5);
          transition: background-color 0.2s ease, border-color 0.2s ease;
          position: relative;
          z-index: 50;
        }
        .satellite-queue-banner.is-danger {
          background: #fef2f2;
          border-color: #f87171;
          color: #991b1b;
        }
        .satellite-queue-banner.is-warning {
          background: #fffbeb;
          border-color: #fcd34d;
          color: #92400e;
        }
        .banner-content {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: var(--space-4);
          flex-wrap: wrap;
        }
        .banner-icon-col {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
        :global(.icon-danger) {
          color: #dc2626;
        }
        :global(.icon-warning) {
          color: #d97706;
        }
        .banner-text-col {
          flex: 1;
          min-width: 280px;
        }
        .banner-title {
          display: block;
          font-size: var(--fs-sm);
          font-weight: 700;
          margin-bottom: 0.15rem;
        }
        .banner-desc {
          font-size: var(--fs-xs);
          line-height: 1.4;
          margin: 0;
          opacity: 0.9;
        }
        .banner-actions {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-shrink: 0;
        }
        .btn-sync-action {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: var(--space-1-5) var(--space-3);
          border-radius: var(--radius-md, 6px);
          font-size: var(--fs-xs);
          font-weight: 700;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.15s ease;
        }
        .btn-danger-sync {
          background: #dc2626;
          color: #ffffff;
          border-color: #b91c1c;
        }
        .btn-danger-sync:hover:not(:disabled) {
          background: #b91c1c;
        }
        .btn-warning-sync {
          background: #d97706;
          color: #ffffff;
          border-color: #b45309;
        }
        .btn-warning-sync:hover:not(:disabled) {
          background: #b45309;
        }
        .btn-sync-action:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn-details-action {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: var(--space-1-5) var(--space-2-5);
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: var(--radius-md, 6px);
          font-size: var(--fs-xs);
          font-weight: 600;
          color: inherit;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-details-action:hover {
          background: #ffffff;
        }
        :global(.animate-spin) {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </aside>
  );
}
