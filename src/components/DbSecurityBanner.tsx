'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';

import { getDbPassword } from '@/lib/env';

export function DbSecurityBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // NEXT_PUBLIC_DB_PASSWORD 未設定時かつブラウザ環境で警告を表示
    if (typeof window !== 'undefined' && !getDbPassword()) {
      setShowBanner(true);
    }
  }, []);

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
          <strong>【本番運用上の注意】</strong> DB暗号鍵（<code>NEXT_PUBLIC_DB_PASSWORD</code>）が未設定です。ブラウザプロファイル喪失時に復号不能となるリスクがあります。本番運用前に設定してください。
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
          fontSize: var(--fs-xs);
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
      `}</style>
    </div>
  );
}
