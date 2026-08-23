'use client';

import React, { useState } from 'react';
import { KeyRound, ShieldAlert, Lock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { DbKeyEscrowPayload } from '@/lib/db_key_escrow';

export interface EmergencyRecoveryKeySheetPrintProps {
  escrow: DbKeyEscrowPayload | null;
  facilityName?: string;
  facilityAddress?: string;
  facilityPhone?: string;
  renderIdentityMark: (size?: 'compact' | 'tiny') => React.ReactNode;
  onGenerateEscrow?: (adminPassword: string) => Promise<void>;
  isGenerating?: boolean;
  errorMessage?: string | null;
  isDemoOrSample?: boolean;
}

export function EmergencyRecoveryKeySheetPrint({
  escrow,
  facilityName = '青空薬局 導入確認店',
  facilityAddress = '〒100-0001 東京都千代田区1-1-1',
  facilityPhone = '03-0000-0000',
  renderIdentityMark,
  onGenerateEscrow,
  isGenerating = false,
  errorMessage = null,
  isDemoOrSample = false
}: EmergencyRecoveryKeySheetPrintProps) {
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPasswordInput || adminPasswordInput.length < 8) {
      setLocalError('管理者パスワードは8文字以上で入力してください。');
      return;
    }
    setLocalError(null);
    if (onGenerateEscrow) {
      try {
        await onGenerateEscrow(adminPasswordInput);
        setAdminPasswordInput('');
      } catch (err: any) {
        setLocalError(err.message || 'エスクローの発行に失敗しました。');
      }
    }
  };

  const jsonPayload = escrow ? JSON.stringify(escrow) : '';
  const base64Payload = escrow
    ? (typeof window !== 'undefined' ? window.btoa(jsonPayload) : Buffer.from(jsonPayload).toString('base64'))
    : '';

  return (
    <section className="print-preview-card card paper-preview-card emergency-recovery-card">
      <div className="preview-header no-print">
        <div>
          <h3><KeyRound size={18} aria-hidden="true" /> 緊急復旧用 暗号鍵エスクローシート</h3>
          <p className="preview-subtitle">端末障害・ブラウザプロファイル破損時の緊急復旧用シート（A4）</p>
        </div>
        {escrow && (
          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: 'var(--fs-xs)' }}>
            <CheckCircle2 size={14} aria-hidden="true" /> 発行済み (FP: {escrow.keyFingerprint})
          </span>
        )}
      </div>

      {/* 管理者認証・発行フォーム（印刷時は非表示） */}
      <div className="escrow-generation-panel no-print" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Lock size={16} color="#0284c7" aria-hidden="true" />
          <strong style={{ fontSize: 'var(--fs-sm)' }}>
            {escrow ? '暗号鍵エスクローの再発行' : '暗号鍵エスクローの発行（管理者認証）'}
          </strong>
        </div>
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>
          患者データを復号可能な本物の DB 暗号鍵を、管理者パスワード（PBKDF2 120,000回 ＋ AES-GCM-256）で暗号化してシートに印字します。
        </p>

        <form onSubmit={handleGenerate} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="password"
            placeholder="管理者パスワード (8文字以上)"
            value={adminPasswordInput}
            onChange={(e) => setAdminPasswordInput(e.target.value)}
            disabled={isGenerating}
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              fontSize: 'var(--fs-sm)',
              minWidth: '240px'
            }}
          />
          <button
            type="submit"
            disabled={isGenerating || !adminPasswordInput}
            className="btn btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.9rem',
              fontSize: 'var(--fs-sm)',
              fontWeight: 700
            }}
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            {escrow ? '新しいパスワードで再発行' : 'エスクローを発行して印字プレビュー生成'}
          </button>
        </form>

        {(localError || errorMessage) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#b91c1c', fontSize: 'var(--fs-xs)', marginTop: '0.5rem' }}>
            <AlertCircle size={14} />
            <span>{localError || errorMessage}</span>
          </div>
        )}
      </div>

      {/* 印刷対象ドキュメント */}
      <div
        className="print-document yakujo-doc emergency-recovery-key-sheet-doc"
        data-testid="emergency-recovery-key-sheet-doc"
      >
        {!escrow ? (
          /* 未発行時の警告表示 */
          <div style={{ textAlign: 'center', padding: '3rem 1.5rem', background: '#fff1f2', border: '2px dashed #f43f5e', borderRadius: '8px', color: '#9f1239' }}>
            <ShieldAlert size={48} style={{ margin: '0 auto 1rem', color: '#e11d48' }} />
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.5rem' }}>
              【未発行・認証前】緊急復旧用 暗号鍵エスクローシート
            </h3>
            <p style={{ fontSize: 'var(--fs-sm)', maxWidth: '480px', margin: '0 auto 1rem', lineHeight: 1.6 }}>
              このシートには有効な暗号鍵が含まれていません。上部のフォームから管理者パスワードを入力してエスクローを発行してから印刷・施錠保管してください。
            </p>
            <span style={{ display: 'inline-block', padding: '0.2rem 0.8rem', background: '#ffe4e6', borderRadius: '999px', fontSize: 'var(--fs-xs)', fontWeight: 800 }}>
              未認証状態での印刷・金庫保管厳禁
            </span>
          </div>
        ) : (
          /* 発行済みの本物シート */
          <>
            {isDemoOrSample && (
              <div style={{
                background: '#fffbeb',
                border: '2px solid #f59e0b',
                borderRadius: '8px',
                padding: '0.6rem 1rem',
                marginBottom: '0.85rem',
                color: '#92400e',
                fontSize: 'var(--fs-xs)',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <ShieldAlert size={16} color="#d97706" />
                <span>【サンプル / CIデモ用控え】本シートはテスト用合成鍵で生成されています。本番患者データの復旧には使用できません。</span>
              </div>
            )}
            <div className="emergency-sheet-header">
              <div className="emergency-title-stack">
                <div className="emergency-badge" style={isDemoOrSample ? { background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' } : undefined}>
                  <ShieldAlert size={16} aria-hidden="true" />
                  <span>{isDemoOrSample ? 'サンプル / デモ控え' : '極秘 / 管理者施錠保管'}</span>
                </div>
                <h2>緊急復旧用 暗号鍵エスクローシート{isDemoOrSample ? '（サンプル）' : ''}</h2>
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
                <small>PBKDF2 (120,000回 SHA-256) ＋ AES-GCM-256</small>
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
          </>
        )}
      </div>
    </section>
  );
}
