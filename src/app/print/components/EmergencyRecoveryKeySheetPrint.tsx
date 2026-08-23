'use client';

import React from 'react';
import { KeyRound, ShieldAlert, Lock, CheckCircle2 } from 'lucide-react';
import type { DbKeyEscrowPayload } from '@/lib/db_key_escrow';

export interface EmergencyRecoveryKeySheetPrintProps {
  escrow: DbKeyEscrowPayload;
  facilityName?: string;
  facilityAddress?: string;
  facilityPhone?: string;
  renderIdentityMark: (size?: 'compact' | 'tiny') => React.ReactNode;
}

export function EmergencyRecoveryKeySheetPrint({
  escrow,
  facilityName = '青空薬局 導入確認店',
  facilityAddress = '〒100-0001 東京都千代田区1-1-1',
  facilityPhone = '03-0000-0000',
  renderIdentityMark
}: EmergencyRecoveryKeySheetPrintProps) {
  const jsonPayload = JSON.stringify(escrow);
  const base64Payload = typeof window !== 'undefined'
    ? window.btoa(jsonPayload)
    : Buffer.from(jsonPayload).toString('base64');

  return (
    <section className="print-preview-card card paper-preview-card emergency-recovery-card">
      <div className="preview-header no-print">
        <div>
          <h3><KeyRound size={18} aria-hidden="true" /> 緊急復旧用 暗号鍵エスクローシート</h3>
          <p className="preview-subtitle">端末障害・ブラウザプロファイル破損時の緊急復旧用シート（A4）</p>
        </div>
      </div>

      <div
        className="print-document yakujo-doc emergency-recovery-key-sheet-doc"
        data-testid="emergency-recovery-key-sheet-doc"
      >
        <div className="emergency-sheet-header">
          <div className="emergency-title-stack">
            <div className="emergency-badge">
              <ShieldAlert size={16} aria-hidden="true" />
              <span>極秘 / 管理者施錠保管</span>
            </div>
            <h2>緊急復旧用 暗号鍵エスクローシート</h2>
            <p>ブラウザプロファイル破損・端末交換時のデータベース復号鍵エスクロー控え</p>
          </div>
          <div className="emergency-issue-box">
            <span>鍵識別子 (Fingerprint)</span>
            <strong>{escrow.keyFingerprint}</strong>
            <small>発行 {new Date(escrow.createdAt).toLocaleDateString('ja-JP')}</small>
          </div>
          {renderIdentityMark('compact')}
        </div>

        <div className="emergency-meta-grid">
          <div className="emergency-meta-block">
            <span className="meta-label">発行薬局</span>
            <strong>{facilityName}</strong>
            <small>{facilityAddress} / TEL: {facilityPhone}</small>
          </div>
          <div className="emergency-meta-block">
            <span className="meta-label">暗号化方式</span>
            <strong>{escrow.algorithm}</strong>
            <small>PBKDF2 (100,000回 SHA-256) ＋ AES-GCM-256</small>
          </div>
          <div className="emergency-meta-block">
            <span className="meta-label">復号権限</span>
            <strong>管理者パスワード必須</strong>
            <small>エスクローの強度は管理者PWの強度に依存</small>
          </div>
        </div>

        <div className="emergency-payload-panel">
          <div className="payload-panel-header">
            <div className="flex items-center gap-2">
              <Lock size={16} aria-hidden="true" />
              <strong>エスクロー暗号化ペイロード (Base64)</strong>
            </div>
            <span className="checksum-badge">SHA-256: {escrow.checksumSha256.substring(0, 16)}...</span>
          </div>
          <div className="payload-box">
            <pre className="payload-text">{base64Payload}</pre>
          </div>
          <div className="payload-meta-row">
            <span>Salt: <code>{escrow.saltHex}</code></span>
            <span>IV: <code>{escrow.ivHex}</code></span>
          </div>
        </div>

        <div className="emergency-security-instructions">
          <h4><ShieldAlert size={16} aria-hidden="true" /> 保管・運用セキュリティ規程</h4>
          <ol>
            <li><strong>施錠保管の徹底:</strong> 本シートは患者データ全件の復号鍵を含みます。必ず耐火金庫等の鍵のかかる安全な場所に保管してください。</li>
            <li><strong>無断複製の禁止:</strong> コピー機やカメラ等による本シートの無断複製・デジタル保存は固く禁止します。</li>
            <li><strong>安全な復元手順:</strong> 新規端末またはプロファイル初期化後、復旧画面から本ペイロードを入力し、発行時の管理者パスワードを入力して復号・リストアします。</li>
            <li><strong>廃棄・失効手順:</strong> 管理者パスワード変更または鍵ローテーション時は、旧シートをシュレッダー等で完全に物理裁断廃棄してください。</li>
          </ol>
        </div>

        <div className="emergency-footer">
          <div className="emergency-sign-box">
            <span className="sign-label">発行責任者（管理者署名）</span>
            <div className="sign-line"></div>
          </div>
          <div className="emergency-stamp-box">
            <span className="stamp-label">薬局印</span>
            <div className="stamp-frame">印</div>
          </div>
        </div>
      </div>
    </section>
  );
}
