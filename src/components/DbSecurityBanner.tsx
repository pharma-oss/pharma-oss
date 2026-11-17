'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';

import {
  getDbSecurityNoticeFlags,
  resolveDbSecurityBannerState,
  subscribeDbSecurityNotice,
  type DbSecurityNoticeFlags
} from '@/db/db_security_notice';
import { getDbPassword } from '@/lib/env';

export interface DbSecurityBannerViewProps {
  showBanner?: boolean;
  storagePersistenceDenied?: boolean;
  legacyKeyInUse?: boolean;
}

export function DbSecurityBannerView({
  showBanner = false,
  storagePersistenceDenied = false,
  legacyKeyInUse = false
}: DbSecurityBannerViewProps) {
  const bannerState = resolveDbSecurityBannerState({
    missingEnvPassword: showBanner,
    storagePersistenceDenied,
    legacyKeyInUse
  });

  if (!bannerState.showBanner) return null;

  return (
    <div
      role="alert"
      aria-label="データベース暗号鍵セキュリティ警告"
      className={`db-security-banner${bannerState.isCritical ? ' is-critical' : ''}`}
    >
      <div className="banner-content">
        <AlertTriangle size={16} aria-hidden="true" className="banner-icon" />
        <div className="banner-messages">
          {bannerState.items.map((item) => (
            <span key={item.id} className="banner-item">
              <strong>{item.prefix}</strong>{' '}
              {item.includesEnvCode ? (
                <>
                  DB暗号鍵（<code>NEXT_PUBLIC_DB_PASSWORD</code>）が未設定です。
                </>
              ) : (
                item.headline
              )}
              <span className="banner-detail">{item.detail}</span>
            </span>
          ))}
        </div>
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
        .db-security-banner.is-critical {
          background: var(--danger-soft);
          color: var(--danger);
          border-bottom: 1px solid var(--danger);
        }
        .banner-content {
          display: flex;
          align-items: flex-start;
          gap: var(--space-2);
        }
        .banner-messages {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }
        .banner-icon {
          flex-shrink: 0;
          margin-top: 2px;
        }
        .banner-link {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          flex-shrink: 0;
          color: inherit;
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
  const [missingEnvPassword, setMissingEnvPassword] = useState(false);
  const [noticeFlags, setNoticeFlags] = useState<DbSecurityNoticeFlags>(() => getDbSecurityNoticeFlags());

  useEffect(() => {
    // NEXT_PUBLIC_DB_PASSWORD 未設定時かつブラウザ環境で警告を表示
    if (typeof window !== 'undefined' && !getDbPassword()) {
      setMissingEnvPassword(true);
    }
    return subscribeDbSecurityNotice((flags) => {
      setNoticeFlags(flags);
    });
  }, []);

  return (
    <DbSecurityBannerView
      showBanner={missingEnvPassword}
      storagePersistenceDenied={noticeFlags.storagePersistenceDenied}
      legacyKeyInUse={noticeFlags.legacyKeyInUse}
    />
  );
}
