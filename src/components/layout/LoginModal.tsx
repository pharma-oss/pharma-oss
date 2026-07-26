import { Fingerprint, KeyRound, Loader2 } from 'lucide-react';
import React from 'react';
import type { User } from '@/db/types';

export function LoginModal({
  selectedUser,
  passwordInput,
  loginError,
  isVerifying,
  onPasswordInputChange,
  onPasswordSubmit,
  onPasskeyClick,
  onCancel
}: {
  selectedUser: User;
  passwordInput: string;
  loginError: string;
  isVerifying: boolean;
  onPasswordInputChange: (value: string) => void;
  onPasswordSubmit: (e: React.FormEvent) => void;
  onPasskeyClick: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="login-modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        className="login-modal card glass animate-fade-in"
        style={{
          width: '90%',
          maxWidth: '420px',
          padding: '2rem',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: 'var(--shadow-xl)',
          background: 'rgba(255, 255, 255, 0.85)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          color: 'var(--foreground)'
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'var(--text-main)',
              marginBottom: '0.25rem'
            }}
          >
            スタッフログイン
          </h2>
          <p className="text-muted text-sm">「{selectedUser.name}」として認証してください</p>
        </div>

        {loginError && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fee2e2',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
              color: '#dc2626',
              fontSize: '0.85rem',
              fontWeight: 500
            }}
          >
            ⚠️ {loginError}
          </div>
        )}

        <form onSubmit={onPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label
              htmlFor="staff-password"
              style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}
            >
              パスワード
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="staff-password"
                type="password"
                placeholder="パスワードを入力してください"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.75rem 0.65rem 2.25rem',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.9rem',
                  outline: 'none',
                  background: 'rgba(255, 255, 255, 0.8)',
                  color: 'var(--foreground)'
                }}
                value={passwordInput}
                onChange={(e) => onPasswordInputChange(e.target.value)}
                required
              />
              <KeyRound
                size={16}
                className="text-ghost"
                style={{
                  position: 'absolute',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="submit"
              className="btn-primary flex-center gap-2"
              style={{ width: '100%', padding: '0.7rem' }}
              disabled={isVerifying}
            >
              {isVerifying && <Loader2 size={16} className="animate-spin" />}
              <span>パスワードでログイン</span>
            </button>

            {selectedUser.passkeyCredentialId && (
              <button
                type="button"
                className="btn-secondary flex-center gap-2"
                style={{
                  width: '100%',
                  padding: '0.7rem',
                  border: '1px solid #3b82f6',
                  color: '#2563eb',
                  background: 'rgba(37, 99, 235, 0.04)'
                }}
                onClick={onPasskeyClick}
                disabled={isVerifying}
              >
                <Fingerprint size={16} />
                <span>パスキーでログイン</span>
              </button>
            )}

            <button
              type="button"
              className="btn-secondary text-sm"
              style={{ width: '100%', marginTop: '0.25rem', padding: '0.7rem' }}
              onClick={onCancel}
              disabled={isVerifying}
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
