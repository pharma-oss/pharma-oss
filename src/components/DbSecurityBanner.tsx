'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';

import { getDbPassword } from '@/lib/env';

export interface DbSecurityBannerViewProps {
  showBanner: boolean;
}

export function DbSecurityBannerView({ showBanner }: DbSecurityBannerViewProps) {
  if (!showBanner) return null;

  return (
    <div
      role="alert"
      aria-label="データベース暗号鍵セキュリティ警告"
      className="db-security-banner"
    >
      <div className="banner-content">
        <AlertTriangle size={16} aria-hidden="true" className="banner-icon" />
        <span>
          <strong>【本番運用上の注意】</strong> DB暗号鍵（<code>NEXT_PUBLIC_DB_PASSWORD</code>）が未設定です。<span className="banner-detail">ブラウザプロファイル喪失時に復号不能となるリスクがあります。本番運用前に設定してください。</span>
        </span>
      </div>
      <a
        href="/settings"
        className="banner-link"
      >
        <Lock size={12} aria-hidden="true" />
        詳細を確認
      </a>
      <style jsx>{`
        .db-security-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          padding: var(--space-2-5) var(--space-4);
          font-size: var(--fs-xs);
          background: var(--warning-soft);
          color: var(--warning);
          border-bottom: 1px solid var(--warning);
        }
        .banner-content {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .banner-icon {
          flex-shrink: 0;
        }
        .banner-link {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          flex-shrink: 0;
          color: var(--warning);
          font-weight: 600;
          text-decoration: underline;
        }
        /* 狭い画面では注意の見出しだけにして、説明は設定画面で読んでもらう
           (バナーが画面の1/4を占めて入力欄を押し下げないようにする) */
        @media (max-width: 640px) {
          .db-security-banner {
            padding: var(--space-1-5) var(--space-3);
            gap: var(--space-2);
          }
          .banner-detail {
            display: none;
          }
          .banner-link {
            white-space: nowrap;
          }
        }
      `}</style>
    </div>
  );
}

export function DbSecurityBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // NEXT_PUBLIC_DB_PASSWORD 未設定時かつブラウザ環境で警告を表示
    if (typeof window !== 'undefined' && !getDbPassword()) {
      setShowBanner(true);
    }
  }, []);

  return <DbSecurityBannerView showBanner={showBanner} />;
}
