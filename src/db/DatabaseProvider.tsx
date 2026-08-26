'use client';

import React, { useEffect, useState } from 'react';
import { DatabaseContext } from './DatabaseContext';
import type { PharmacyDatabase } from './types';
import type { OnboardingE2ESeedResult } from '@/lib/onboarding_e2e_seed';
import type { ReturnCorrectionE2ESeedResult } from '@/lib/return_correction_e2e_seed';
import { isProduction } from '@/lib/env';

export { useDatabase } from './DatabaseContext';

declare global {
  interface Window {
    __yakurekiSeedOnboardingE2E?: () => Promise<OnboardingE2ESeedResult>;
    __yakurekiSeedReturnCorrectionE2E?: () => Promise<ReturnCorrectionE2ESeedResult>;
    __yakurekiSeedTutorialDemo?: () => Promise<{ visitId: string; alreadySeeded: boolean }>;
  }
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<PharmacyDatabase | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [satelliteSyncing, setSatelliteSyncing] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        // ⚡ Bolt: Dynamically import RxDB to remove it from the initial JS bundle,
        // significantly improving Time to Interactive (TTI)
        const { getDatabase } = await import('./index');
        const _db = await getDatabase();

        // メイン端末(hub)・サテライト端末は自機の /api/sync と常時レプリケーションする。
        // サテライトはメモリDBが空の状態で起動するため、ログインに必要なコレクション
        // (users, facility_settings)の初回取得が終わるまで画面をブロックする。
        const { resolveClientSyncRole } = await import('@/lib/sync/client_role');
        const syncRole = await resolveClientSyncRole();
        if (syncRole === 'hub' || syncRole === 'satellite') {
          const { startAppReplication, awaitSatelliteLoginGate } = await import('@/lib/sync/replication_bootstrap');
          const handle = startAppReplication(_db, syncRole);
          if (syncRole === 'satellite') {
            setSatelliteSyncing(true);
            await awaitSatelliteLoginGate(handle);
            setSatelliteSyncing(false);
          }
        }

        setDb(_db);

        // Request persistent storage to prevent automatic data eviction by the browser
        if (navigator.storage && navigator.storage.persist) {
          try {
            const isPersisted = await navigator.storage.persist();
            if (isPersisted) {
              console.log('Storage successfully persisted.');
            } else {
              console.warn('Storage persistence not granted.');
            }
          } catch (error) {
            console.error('Error requesting storage persistence:', error);
          }
        }
      } catch (error) {
        console.error('Database initialization failed:', error);
        const message = error instanceof Error ? error.message : '不明なエラー';
        setDbError(message);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!db || isProduction()) return;

    const seedOnboardingE2E = async () => {
      const { seedOnboardingE2EData } = await import('@/lib/onboarding_e2e_seed');
      return seedOnboardingE2EData(db);
    };
    const seedReturnCorrectionE2E = async () => {
      const { seedReturnCorrectionE2EData } = await import('@/lib/return_correction_e2e_seed');
      return seedReturnCorrectionE2EData(db);
    };
    const seedTutorialDemo = async () => {
      const { seedTutorialDemoData } = await import('@/lib/demo_data');
      return seedTutorialDemoData(db);
    };
    window.__yakurekiSeedOnboardingE2E = seedOnboardingE2E;
    window.__yakurekiSeedReturnCorrectionE2E = seedReturnCorrectionE2E;
    window.__yakurekiSeedTutorialDemo = seedTutorialDemo;

    return () => {
      if (window.__yakurekiSeedOnboardingE2E === seedOnboardingE2E) {
        delete window.__yakurekiSeedOnboardingE2E;
      }
      if (window.__yakurekiSeedReturnCorrectionE2E === seedReturnCorrectionE2E) {
        delete window.__yakurekiSeedReturnCorrectionE2E;
      }
      if (window.__yakurekiSeedTutorialDemo === seedTutorialDemo) {
        delete window.__yakurekiSeedTutorialDemo;
      }
    };
  }, [db]);

  if (dbError) {
    return (
      <div className="db-fullscreen-container">
        <div role="alert" className="db-alert-card">
          <h1 className="db-card-title">ローカルデータベースを開けません</h1>
          <p className="db-card-desc">
            患者データ保護のため、アプリは自動削除や自動初期化を実行していません。バックアップの有無を確認し、管理者の復旧手順に従ってください。
          </p>
          <p className="db-error-text">エラー: {dbError}</p>
        </div>
        <style jsx>{`
          .db-fullscreen-container {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: var(--space-8);
            background: #f8fafc;
            color: #0f172a;
          }
          .db-alert-card {
            max-width: 720px;
            border: 1px solid #fecaca;
            border-radius: var(--radius-md);
            background: #fff1f2;
            padding: var(--space-5);
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
          }
          .db-card-title {
            margin: 0 0 var(--space-3);
            font-size: 1.25rem;
          }
          .db-card-desc {
            margin: 0 0 var(--space-3);
            line-height: 1.7;
          }
          .db-error-text {
            margin: 0;
            font-size: var(--fs-md);
            color: #7f1d1d;
          }
        `}</style>
      </div>
    );
  }

  if (satelliteSyncing) {
    return (
      <div className="db-fullscreen-container">
        <div role="status" className="db-status-card">
          <h1 className="db-card-title">メイン端末からデータを取得しています…</h1>
          <p className="db-card-desc">
            この端末はサテライト端末です。患者データは端末に保存されず、起動のたびにメイン端末から取得します。
            この画面のまま進まない場合は、メイン端末が起動しているか、ネットワーク接続を確認してください。
          </p>
        </div>
        <style jsx>{`
          .db-fullscreen-container {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: var(--space-8);
            background: #f8fafc;
            color: #0f172a;
          }
          .db-status-card {
            max-width: 720px;
            border: 1px solid #bfdbfe;
            border-radius: var(--radius-md);
            background: #eff6ff;
            padding: var(--space-5);
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
          }
          .db-card-title {
            margin: 0 0 var(--space-3);
            font-size: 1.25rem;
          }
          .db-card-desc {
            margin: 0 0 var(--space-3);
            line-height: 1.7;
          }
        `}</style>
      </div>
    );
  }

  return (
    <DatabaseContext.Provider value={db}>
      {children}
    </DatabaseContext.Provider>
  );
}
