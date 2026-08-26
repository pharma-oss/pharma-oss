'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, ShieldCheck, HardDrive, FileCheck, X, AlertTriangle } from 'lucide-react';
import { isFileSystemAccessSupported, saveBackupToDirectory } from '@/lib/file_system_backup';
import { makeBackupFileName, buildDatabaseBackup, encryptBackupPayload } from '@/lib/backup';
import { canUserPerform, getCurrentUser, logAuditAction, getPermissionDeniedMessage } from '@/lib/audit';
import { toast } from 'sonner';

interface DailyClosingWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

interface ClosingCheckSummary {
  todayVisitsCount: number;
  uncompletedEmrCount: number;
  unsentClaimCount: number;
  canProceed: boolean;
}

export function DailyClosingWizardModal({ isOpen, onClose, onComplete }: DailyClosingWizardModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [checkSummary, setCheckSummary] = useState<ClosingCheckSummary | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // 初期化・権限チェック & リアルタイム整合性実測
  useEffect(() => {
    if (!isOpen) return;

    // モーダルは isOpen 切替でアンマウントされないため、開くたびに
    // 前回の step/password/checkSummary を明示的にリセットする。
    // (リセットしないと、閉じて再度開いた際に前回完了時の step=3
    //  「完了しました」画面がバックアップ未実行のまま表示されてしまう)
    setStep(1);
    setPassword('');
    setSaveStatus('');
    setIsProcessing(false);
    setCheckSummary(null);

    const operator = getCurrentUser();
    if (!canUserPerform(operator, 'manage_backups')) {
      setPermissionError(getPermissionDeniedMessage(operator, 'manage_backups'));
      return;
    }
    setPermissionError(null);

    let cancelled = false;
    async function runPreClosingCheck() {
      setIsChecking(true);
      try {
        const { getDatabase } = await import('@/db');
        const db = await getDatabase();
        if (!db || cancelled) return;

        // 本日の日付範囲 (00:00:00 - 23:59:59)
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

        // 1. 本日の受付数実測
        const visits = await db.visits.find({
          selector: {
            issueDate: { $gte: startOfDay, $lte: endOfDay }
          }
        }).exec();

        // 2. 本日受付の中で SOAP (薬歴) 未作成/未完了のものを実測
        const visitsWithEmr = new Set<string>();
        const soapRecords = await db.soap_records.find().exec();
        for (const s of soapRecords) {
          if (s.visitId) visitsWithEmr.add(s.visitId);
        }
        let uncompletedEmr = 0;
        for (const v of visits) {
          if (!visitsWithEmr.has(v.visitId)) {
            uncompletedEmr++;
          }
        }

        // 3. 完了していない受付件数
        let unsentClaims = 0;
        for (const v of visits) {
          if (v.status !== 'completed') {
            unsentClaims++;
          }
        }

        if (!cancelled) {
          setCheckSummary({
            todayVisitsCount: visits.length,
            uncompletedEmrCount: uncompletedEmr,
            unsentClaimCount: unsentClaims,
            canProceed: true,
          });
        }
      } catch (err) {
        console.error('Pre-closing check failed:', err);
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    }

    runPreClosingCheck();
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRunBackupAndClosing = async () => {
    const operator = getCurrentUser();
    if (!canUserPerform(operator, 'manage_backups')) {
      toast.error(getPermissionDeniedMessage(operator, 'manage_backups'));
      return;
    }

    // バックアップ独立の個別パスワード入力を必須化（ライブDB鍵の無断自動流用を防止）
    const backupPassword = password.trim();
    if (!backupPassword || backupPassword.length < 8) {
      toast.error('バックアップ専用の暗号化パスワード(8文字以上)を入力してください。');
      return;
    }

    setIsProcessing(true);
    setSaveStatus('暗号化バックアップデータを生成中…');

    try {
      const { getDatabase } = await import('@/db');
      const db = await getDatabase();
      if (!db) {
        toast.error('データベースに接続できませんでした。');
        setIsProcessing(false);
        return;
      }

      // レコード収集(バックアップ機能本体と同じ BACKUP_COLLECTIONS / localSettings 定義を再利用し、
      // 対象コレクションが将来増減してもここで個別に追従する必要がないようにする)
      const backupPayload = await buildDatabaseBackup(db);

      // 真正な暗号化の適用
      setSaveStatus('AES-256 暗号化を適用中…');
      const encryptedPayload = encryptBackupPayload(backupPayload, backupPassword);
      const fileName = makeBackupFileName();
      const content = JSON.stringify(encryptedPayload, null, 2);

      // 外部保存実行
      setSaveStatus('外部保存先（NAS / USB）へ書き出し中…');
      const result = await saveBackupToDirectory(fileName, content);

      if (!result.success) {
        toast.error(result.errorMessage || '外部保存に失敗しました。締め処理を中止します。');
        setIsProcessing(false);
        return;
      }

      // 監査ログの実質記録
      setSaveStatus('日次締め監査ログを記録中…');
      const auditDetails = `日次締め・閉局外部暗号化保存完了: ファイル名 ${fileName} / 保存先 ${result.pathOrName} / 受付件数 ${checkSummary?.todayVisitsCount || 0}件 / 未完了薬歴 ${checkSummary?.uncompletedEmrCount || 0}件`;
      const auditOk = await logAuditAction(db, 'backup_export', auditDetails);
      if (!auditOk) {
        toast.error('監査ログの記録に失敗したため、締め処理を完了できませんでした。');
        setIsProcessing(false);
        return;
      }

      toast.success(`日次締め・暗号化バックアップ外部保存を記録しました (${result.pathOrName})`);
      setStep(3);
    } catch (err: any) {
      console.error('Failed to run daily closing backup:', err);
      toast.error(`日次締めの実行中にエラーが発生しました: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="closing-modal-overlay">
      <div className="closing-modal-card">
        <div className="closing-modal-header">
          <div className="closing-title-box">
            <ShieldCheck size={20} className="closing-title-icon" />
            <h3 className="closing-title">日次締め・閉局ウィザード</h3>
          </div>
          <button
            onClick={onClose}
            className="btn-closing-close"
          >
            <X size={18} />
          </button>
        </div>

        {permissionError ? (
          <div className="closing-perm-error">
            <AlertTriangle size={36} className="closing-perm-icon" />
            <p className="closing-perm-title">権限エラー</p>
            <p className="closing-perm-desc">{permissionError}</p>
            <button
              onClick={onClose}
              className="btn-perm-close"
            >
              閉じる
            </button>
          </div>
        ) : step === 1 ? (
          <div>
            <p className="closing-desc">
              本日の受付・薬歴データの整合性をリアルタイム計測し、パスワード暗号化を適用した上で外部保存（NAS / USB）と監査ログ記録を完遂します。
            </p>

            <div className="closing-stats-box">
              <p className="closing-stats-title">【本日のデータ実測状況】</p>
              {isChecking ? (
                <p className="closing-stats-loading">データベースを計測中…</p>
              ) : (
                <>
                  <div className="closing-stat-row">
                    <CheckCircle2 size={15} className="icon-success" />
                    <span>本日受付件数: <strong>{checkSummary?.todayVisitsCount || 0}</strong> 件</span>
                  </div>
                  <div className="closing-stat-row">
                    {checkSummary?.uncompletedEmrCount === 0 ? (
                      <CheckCircle2 size={15} className="icon-success" />
                    ) : (
                      <AlertTriangle size={15} className="icon-warning" />
                    )}
                    <span>薬歴未完了件数: <strong>{checkSummary?.uncompletedEmrCount || 0}</strong> 件</span>
                  </div>
                  <div className="closing-stat-row">
                    <HardDrive size={15} className="icon-info" />
                    <span>外部保存方式: {isFileSystemAccessSupported() ? '1クリックフォルダ保存 (File System Access)' : '暗号化JSON保存'}</span>
                  </div>
                </>
              )}
            </div>

            <div className="closing-field-group">
              <label className="closing-label">
                暗号化パスワード (AES-256) <span className="closing-required-star">*必須</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8文字以上のバックアップ専用暗号化パスワードを入力"
                className="closing-password-input"
              />
            </div>

            <div className="closing-actions">
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="btn-closing-cancel"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={isChecking || isProcessing}
                onClick={() => {
                  setStep(2);
                  handleRunBackupAndClosing();
                }}
                className="btn-closing-submit"
              >
                暗号化バックアップ & 閉局実行
              </button>
            </div>
          </div>
        ) : step === 2 ? (
          <div className="closing-step2-box">
            <FileCheck size={36} className="closing-step2-icon" />
            <p className="closing-step2-status">{saveStatus}</p>
            <p className="closing-step2-desc">暗号化処理および検証記録を実行中です…</p>
          </div>
        ) : (
          <div>
            <div className="closing-step3-box">
              <CheckCircle2 size={44} className="closing-step3-icon" />
              <h4 className="closing-step3-title">日次締め・暗号化外部保存が完了しました</h4>
              <p className="closing-step3-desc">
                AES-256 暗号化バックアップおよび店舗設定は外部保存先へ正しく書き出され、監査ログへ記録されました。
              </p>
            </div>
            <div className="closing-step3-actions">
              <button
                type="button"
                onClick={() => {
                  onComplete();
                  onClose();
                }}
                className="btn-closing-confirm"
              >
                確認して閉じる
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .closing-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }
        .closing-modal-card {
          background: var(--card-bg, #ffffff);
          color: var(--foreground, #1e293b);
          border-radius: 12px;
          width: 90%;
          max-width: 560px;
          padding: var(--space-6);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          border: 1px solid var(--border-color, #e2e8f0);
        }
        .closing-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-4);
        }
        .closing-title-box {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .closing-title-icon {
          color: var(--primary, #2563eb);
        }
        .closing-title {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 600;
        }
        .btn-closing-close {
          background: transparent;
          border: none;
          cursor: pointer;
          color: #64748b;
          padding: var(--space-1);
        }
        .closing-perm-error {
          padding: var(--space-6) 0;
          text-align: center;
        }
        .closing-perm-icon {
          color: #dc2626;
          margin-bottom: var(--space-2);
        }
        .closing-perm-title {
          font-weight: 600;
          color: #b91c1c;
        }
        .closing-perm-desc {
          font-size: var(--fs-md);
          color: #475569;
        }
        .btn-perm-close {
          margin-top: var(--space-4);
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md);
          border: 1px solid #cbd5e1;
          background: #ffffff;
          cursor: pointer;
        }
        .closing-desc {
          font-size: var(--fs-md);
          color: #475569;
          line-height: 1.5;
        }
        .closing-stats-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: var(--radius-md);
          padding: var(--space-4);
          margin: var(--space-4) 0;
          font-size: var(--fs-sm);
        }
        .closing-stats-title {
          margin: 0 0 var(--space-2) 0;
          font-weight: 600;
          color: #334155;
        }
        .closing-stats-loading {
          color: #64748b;
        }
        .closing-stat-row {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-bottom: var(--space-1-5);
        }
        .icon-success {
          color: #16a34a;
        }
        .icon-warning {
          color: #d97706;
        }
        .icon-info {
          color: #0284c7;
        }
        .closing-field-group {
          margin-bottom: var(--space-4);
        }
        .closing-label {
          display: block;
          font-size: var(--fs-sm);
          font-weight: 600;
          margin-bottom: var(--space-1-5);
          color: #334155;
        }
        .closing-required-star {
          color: #dc2626;
        }
        .closing-password-input {
          width: 100%;
          padding: var(--space-2);
          border-radius: var(--radius-md);
          border: 1px solid #cbd5e1;
          font-size: var(--fs-md);
          box-sizing: border-box;
        }
        .closing-actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-2);
          margin-top: var(--space-5);
        }
        .btn-closing-cancel {
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md);
          border: 1px solid #cbd5e1;
          background: #ffffff;
          cursor: pointer;
          font-size: var(--fs-md);
        }
        .btn-closing-submit {
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md);
          border: none;
          background: var(--primary, #2563eb);
          color: #ffffff;
          font-weight: 600;
          cursor: pointer;
          font-size: var(--fs-md);
        }
        .btn-closing-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .closing-step2-box {
          text-align: center;
          padding: var(--space-8) var(--space-4);
        }
        .closing-step2-icon {
          color: var(--primary, #2563eb);
          margin-bottom: var(--space-4);
        }
        .closing-step2-status {
          font-weight: 600;
          font-size: var(--fs-base);
        }
        .closing-step2-desc {
          font-size: var(--fs-sm);
          color: #64748b;
        }
        .closing-step3-box {
          text-align: center;
          padding: var(--space-4) 0;
        }
        .closing-step3-icon {
          color: #16a34a;
          margin-bottom: var(--space-2);
        }
        .closing-step3-title {
          margin: 0 0 var(--space-2) 0;
          font-size: 1.05rem;
          font-weight: 600;
        }
        .closing-step3-desc {
          font-size: var(--fs-md);
          color: #475569;
        }
        .closing-step3-actions {
          display: flex;
          justify-content: center;
          margin-top: var(--space-4);
        }
        .btn-closing-confirm {
          padding: var(--space-2) var(--space-5);
          border-radius: var(--radius-md);
          border: none;
          background: #16a34a;
          color: #ffffff;
          font-weight: 600;
          cursor: pointer;
          font-size: var(--fs-md);
        }
      `}</style>
    </div>
  );
}
