'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';

export function DbSecurityBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // NEXT_PUBLIC_DB_PASSWORD 未設定時かつブラウザ環境で警告を表示
    if (typeof window !== 'undefined' && !process.env.NEXT_PUBLIC_DB_PASSWORD) {
      setShowBanner(true);
    }
  }, []);

  if (!showBanner) return null;

  return (
    <div
      role="alert"
      aria-label="データベース暗号鍵セキュリティ警告"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        padding: '0.6rem 1rem',
        fontSize: '0.75rem',
        background: 'var(--warning-soft)',
        color: 'var(--warning)',
        borderBottom: '1px solid var(--warning)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span>
          <strong>【本番運用上の注意】</strong> DB暗号鍵（<code>NEXT_PUBLIC_DB_PASSWORD</code>）が未設定です。ブラウザプロファイル喪失時に復号不能となるリスクがあります。本番運用前に設定してください。
        </span>
      </div>
      <a
        href="/settings"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          flexShrink: 0,
          color: 'var(--warning)',
          fontWeight: 600,
          textDecoration: 'underline'
        }}
      >
        <Lock size={12} aria-hidden="true" />
        詳細を確認
      </a>
    </div>
  );
}
