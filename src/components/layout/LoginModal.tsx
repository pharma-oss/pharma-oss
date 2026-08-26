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
    >
      <div
        className="login-modal card glass animate-fade-in"
      >
        <div className="login-header">
          <h2 className="login-title">
            スタッフログイン
          </h2>
          <p className="text-muted text-sm">「{selectedUser.name}」として認証してください</p>
        </div>

        {loginError && (
          <div className="login-error">
            ⚠️ {loginError}
          </div>
        )}

        <form onSubmit={onPasswordSubmit} className="login-form">
          <div className="login-field-group">
            <label
              htmlFor="staff-password"
              className="login-label"
            >
              パスワード
            </label>
            <div className="login-input-wrapper">
              <input
                id="staff-password"
                type="password"
                placeholder="パスワードを入力してください"
                className="login-password-input"
                value={passwordInput}
                onChange={(e) => onPasswordInputChange(e.target.value)}
                required
              />
              <KeyRound
                size={16}
                className="text-ghost login-key-icon"
              />
            </div>
          </div>

          <div className="login-actions">
            <button
              type="submit"
              className="btn-primary flex-center gap-2 btn-login-submit"
              disabled={isVerifying}
            >
              {isVerifying && <Loader2 size={16} className="animate-spin" />}
              <span>パスワードでログイン</span>
            </button>

            {selectedUser.passkeyCredentialId && (
              <button
                type="button"
                className="btn-secondary flex-center gap-2 btn-login-passkey"
                onClick={onPasskeyClick}
                disabled={isVerifying}
              >
                <Fingerprint size={16} />
                <span>パスキーでログイン</span>
              </button>
            )}

            <button
              type="button"
              className="btn-secondary text-sm btn-login-cancel"
              onClick={onCancel}
              disabled={isVerifying}
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>
      <style jsx>{`
        .login-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(8px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .login-modal {
          width: 90%;
          max-width: 420px;
          padding: var(--space-8);
          border-radius: var(--radius-lg);
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: var(--shadow-xl);
          background: rgba(255, 255, 255, 0.85);
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
          color: var(--foreground);
        }
        .login-header {
          text-align: center;
        }
        .login-title {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text-main);
          margin-bottom: var(--space-1);
        }
        .login-error {
          background: #fef2f2;
          border: 1px solid #fee2e2;
          border-radius: var(--radius-md);
          padding: var(--space-3);
          color: #dc2626;
          font-size: var(--fs-md);
          font-weight: 500;
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .login-field-group {
          display: flex;
          flex-direction: column;
          gap: var(--space-1-5);
        }
        .login-label {
          font-size: var(--fs-sm);
          font-weight: 600;
          color: var(--text-muted);
        }
        .login-input-wrapper {
          position: relative;
        }
        .login-password-input {
          width: 100%;
          padding: var(--space-2-5) var(--space-3) var(--space-2-5) var(--space-9);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: var(--fs-base);
          outline: none;
          background: rgba(255, 255, 255, 0.8);
          color: var(--foreground);
        }
        .login-key-icon {
          position: absolute;
          left: var(--space-3);
          top: 50%;
          transform: translateY(-50%);
        }
        .login-actions {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          margin-top: var(--space-2);
        }
        .btn-login-submit {
          width: 100%;
          padding: var(--space-2-5) var(--space-3);
        }
        .btn-login-passkey {
          width: 100%;
          padding: var(--space-2-5) var(--space-3);
          border: 1px solid #3b82f6;
          color: #2563eb;
          background: rgba(37, 99, 235, 0.04);
        }
        .btn-login-cancel {
          width: 100%;
          margin-top: var(--space-1);
          padding: var(--space-2-5) var(--space-3);
        }
      `}</style>
    </div>
  );
}
