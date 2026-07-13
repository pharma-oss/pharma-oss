'use client';

import React, { useEffect, useState } from 'react';
import { DatabaseContext } from './DatabaseContext';
import type { PharmacyDatabase } from './types';
import type { OnboardingE2ESeedResult } from '@/lib/onboarding_e2e_seed';
import type { ReturnCorrectionE2ESeedResult } from '@/lib/return_correction_e2e_seed';

export { useDatabase } from './DatabaseContext';

declare global {
  interface Window {
    __yakurekiSeedOnboardingE2E?: () => Promise<OnboardingE2ESeedResult>;
    __yakurekiSeedReturnCorrectionE2E?: () => Promise<ReturnCorrectionE2ESeedResult>;
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
    if (!db || process.env.NODE_ENV === 'production') return;

    const seedOnboardingE2E = async () => {
      const { seedOnboardingE2EData } = await import('@/lib/onboarding_e2e_seed');
      return seedOnboardingE2EData(db);
    };
    const seedReturnCorrectionE2E = async () => {
      const { seedReturnCorrectionE2EData } = await import('@/lib/return_correction_e2e_seed');
      return seedReturnCorrectionE2EData(db);
    };
    window.__yakurekiSeedOnboardingE2E = seedOnboardingE2E;
    window.__yakurekiSeedReturnCorrectionE2E = seedReturnCorrectionE2E;

    return () => {
      if (window.__yakurekiSeedOnboardingE2E === seedOnboardingE2E) {
        delete window.__yakurekiSeedOnboardingE2E;
      }
      if (window.__yakurekiSeedReturnCorrectionE2E === seedReturnCorrectionE2E) {
        delete window.__yakurekiSeedReturnCorrectionE2E;
      }
    };
  }, [db]);

  if (dbError) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', background: '#f8fafc', color: '#0f172a' }}>
        <div role="alert" style={{ maxWidth: '720px', border: '1px solid #fecaca', borderRadius: '8px', background: '#fff1f2', padding: '1.25rem', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)' }}>
          <h1 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem' }}>ローカルデータベースを開けません</h1>
          <p style={{ margin: '0 0 0.75rem', lineHeight: 1.7 }}>
            患者データ保護のため、アプリは自動削除や自動初期化を実行していません。バックアップの有無を確認し、管理者の復旧手順に従ってください。
          </p>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#7f1d1d' }}>エラー: {dbError}</p>
        </div>
      </div>
    );
  }

  if (satelliteSyncing) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', background: '#f8fafc', color: '#0f172a' }}>
        <div role="status" style={{ maxWidth: '720px', border: '1px solid #bfdbfe', borderRadius: '8px', background: '#eff6ff', padding: '1.25rem', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)' }}>
          <h1 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem' }}>メイン端末からデータを取得しています…</h1>
          <p style={{ margin: '0 0 0.75rem', lineHeight: 1.7 }}>
            この端末はサテライト端末です。患者データは端末に保存されず、起動のたびにメイン端末から取得します。
            この画面のまま進まない場合は、メイン端末が起動しているか、ネットワーク接続を確認してください。
          </p>
        </div>
      </div>
    );
  }

  return (
    <DatabaseContext.Provider value={db}>
      {children}
    </DatabaseContext.Provider>
  );
}
