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
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: 'var(--card-bg, #ffffff)',
          color: 'var(--foreground, #1e293b)',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '560px',
          padding: '1.5rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: '1px solid var(--border-color, #e2e8f0)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={20} style={{ color: 'var(--primary, #2563eb)' }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>日次締め・閉局ウィザード</h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
          >
            <X size={18} />
          </button>
        </div>

        {permissionError ? (
          <div style={{ padding: '1.5rem 0', textAlign: 'center' }}>
            <AlertTriangle size={36} style={{ color: '#dc2626', marginBottom: '0.5rem' }} />
            <p style={{ fontWeight: 600, color: '#b91c1c' }}>権限エラー</p>
            <p style={{ fontSize: '0.85rem', color: '#475569' }}>{permissionError}</p>
            <button
              onClick={onClose}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                cursor: 'pointer',
              }}
            >
              閉じる
            </button>
          </div>
        ) : step === 1 ? (
          <div>
            <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.5 }}>
              本日の受付・薬歴データの整合性をリアルタイム計測し、パスワード暗号化を適用した上で外部保存（NAS / USB）と監査ログ記録を完遂します。
            </p>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '1rem',
                margin: '1rem 0',
                fontSize: '0.8rem',
              }}
            >
              <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600, color: '#334155' }}>【本日のデータ実測状況】</p>
              {isChecking ? (
                <p style={{ color: '#64748b' }}>データベースを計測中…</p>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <CheckCircle2 size={15} style={{ color: '#16a34a' }} />
                    <span>本日受付件数: <strong>{checkSummary?.todayVisitsCount || 0}</strong> 件</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    {checkSummary?.uncompletedEmrCount === 0 ? (
                      <CheckCircle2 size={15} style={{ color: '#16a34a' }} />
                    ) : (
                      <AlertTriangle size={15} style={{ color: '#d97706' }} />
                    )}
                    <span>薬歴未完了件数: <strong>{checkSummary?.uncompletedEmrCount || 0}</strong> 件</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <HardDrive size={15} style={{ color: '#0284c7' }} />
                    <span>外部保存方式: {isFileSystemAccessSupported() ? '1クリックフォルダ保存 (File System Access)' : '暗号化JSON保存'}</span>
                  </div>
                </>
              )}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: '#334155' }}>
                暗号化パスワード (AES-256) <span style={{ color: '#dc2626' }}>*必須</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8文字以上のバックアップ専用暗号化パスワードを入力"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.85rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
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
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--primary, #2563eb)',
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  opacity: isChecking || isProcessing ? 0.6 : 1,
                }}
              >
                暗号化バックアップ & 閉局実行
              </button>
            </div>
          </div>
        ) : step === 2 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <FileCheck size={36} style={{ color: 'var(--primary, #2563eb)', marginBottom: '1rem' }} />
            <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{saveStatus}</p>
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>暗号化処理および検証記録を実行中です…</p>
          </div>
        ) : (
          <div>
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <CheckCircle2 size={44} style={{ color: '#16a34a', marginBottom: '0.5rem' }} />
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem', fontWeight: 600 }}>日次締め・暗号化外部保存が完了しました</h4>
              <p style={{ fontSize: '0.85rem', color: '#475569' }}>
                AES-256 暗号化バックアップおよび店舗設定は外部保存先へ正しく書き出され、監査ログへ記録されました。
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => {
                  onComplete();
                  onClose();
                }}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#16a34a',
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                確認して閉じる
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
