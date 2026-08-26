'use client';

import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Upload, CheckCircle2, FileText, X, Database, AlertTriangle } from 'lucide-react';
import {
  getMedicalInstitutionMasterStats,
  importMedicalInstitutionMasterCsv,
  importMedicalInstitutionMasterJson,
  isUsingSeedMedicalInstitutionData,
  mergeBureauMedicalInstitutionRecords
} from '@/lib/master-data/medical_institution_master';
import { parseBureauInstitutionListUpload } from '@/lib/master-data/medical_institution_bureau_import';

export interface MedicalInstitutionMasterSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSynced?: (count: number) => void;
}

export const MedicalInstitutionMasterSyncModal: React.FC<MedicalInstitutionMasterSyncModalProps> = ({
  isOpen,
  onClose,
  onSynced
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [stats, setStats] = useState(getMedicalInstitutionMasterStats());
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) dialog.showModal();
      setStats(getMedicalInstitutionMasterStats());
    } else {
      if (dialog.open) dialog.close();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setMessage(null);

    try {
      const text = await file.text();
      let count = 0;
      if (file.name.endsWith('.json')) {
        const res = importMedicalInstitutionMasterJson(text);
        count = res.length;
      } else {
        const res = importMedicalInstitutionMasterCsv(text);
        count = res.length;
      }

      if (count > 0) {
        const newStats = getMedicalInstitutionMasterStats();
        setStats(newStats);
        setMessage({ text: `医療機関マスタを正常に最新化しました（${count}件）`, isError: false });
        if (onSynced) onSynced(count);
      } else {
        setMessage({ text: '有効な医療機関データが検出されませんでした。ファイルフォーマットをご確認ください。', isError: true });
      }
    } catch {
      setMessage({ text: 'マスタファイルの読み込み中にエラーが発生しました。', isError: true });
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  const handleBureauFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setMessage(null);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const results = await parseBureauInstitutionListUpload(bytes, file.name);

      let importedTotal = 0;
      let skippedInactiveTotal = 0;
      let skippedPharmacyTotal = 0;
      let issueTotal = 0;
      const perPrefecture: string[] = [];

      for (const result of results) {
        if (result.records.length > 0) {
          mergeBureauMedicalInstitutionRecords(result.records, {
            prefectureName: result.prefectureName,
            sourceFileName: result.sourceFileName,
            skippedInactiveCount: result.skippedInactiveCount,
            issueCount: result.issues.length
          });
        }
        importedTotal += result.records.length;
        skippedInactiveTotal += result.skippedInactiveCount;
        skippedPharmacyTotal += result.skippedPharmacyCount;
        issueTotal += result.issues.length;
        perPrefecture.push(`${result.prefectureName} ${result.records.length}件`);
      }

      if (importedTotal > 0) {
        setStats(getMedicalInstitutionMasterStats());
        const detail = perPrefecture.length > 1 ? `（${perPrefecture.join(' / ')}）` : '';
        const skippedInactiveNote = skippedInactiveTotal > 0 ? ` 休止${skippedInactiveTotal}件を除外。` : '';
        const skippedPharmacyNote = skippedPharmacyTotal > 0 ? ` 薬局${skippedPharmacyTotal}件は対象外のため除外。` : '';
        const issueNote = issueTotal > 0 ? ` ${issueTotal}件は解析できず未取込。` : '';
        setMessage({
          text: `病院・診療所・歯科を取り込みました（計${importedTotal}件）${detail}。${skippedInactiveNote}${skippedPharmacyNote}${issueNote}`.trim(),
          isError: false
        });
        if (onSynced) onSynced(importedTotal);
      } else if (skippedPharmacyTotal > 0) {
        setMessage({
          text: `このファイルは薬局のみの一覧表のため、対象データ(病院・診療所・歯科)がありませんでした。地方厚生局サイトで「医科」または「歯科」の一覧表をダウンロードしてください。`,
          isError: true
        });
      } else {
        setMessage({ text: '有効な医療機関データが検出されませんでした。ファイル形式をご確認ください。', isError: true });
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : '不明なエラー';
      setMessage({ text: `厚生局データの読み込み中にエラーが発生しました（${reason}）。`, isError: true });
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="institution-sync-modal glass sync-dialog"
      aria-labelledby="sync-title"
      onClose={onClose}
    >
      <div className="sync-header">
        <div className="sync-title-box">
          <RefreshCw size={22} />
          <h3 id="sync-title" className="sync-title">
            医療機関マスタ 最新情報同期
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn-sync-close"
        >
          <X size={20} />
        </button>
      </div>

      <div className="sync-body">
        <div className="sync-stats-card">
          <Database size={32} className="sync-stats-icon" />
          <div>
            <div className="sync-stats-label">現在の登録施設数</div>
            <div className="sync-stats-count">
              {stats.totalCount.toLocaleString()} <span className="sync-stats-unit">施設</span>
            </div>
            {stats.lastSyncTimestamp && (
              <div className="sync-stats-updated">
                最終更新: {new Date(stats.lastSyncTimestamp).toLocaleString('ja-JP')}
              </div>
            )}
          </div>
        </div>

        {isUsingSeedMedicalInstitutionData() && (
          <div className="sync-seed-alert">
            <AlertTriangle size={16} className="sync-seed-icon" />
            <span>サンプルデータ（{stats.totalCount}件）を使用中です。実在しない架空の医療機関コードです。運用開始前に、下記から厚生局の最新マスタファイルを取り込んでください。</span>
          </div>
        )}

        <div className="sync-upload-dropzone">
          <label className="sync-upload-label">
            <Upload size={28} className="sync-upload-icon" />
            <span className="sync-upload-title">
              {isProcessing ? '更新・解析中...' : '地方厚生局「コード内容別医療機関一覧表」(ZIP / Excel) を取り込む'}
            </span>
            <span className="sync-upload-desc">
              各地方厚生局サイトの「医科」または「歯科」の一覧表(.zip / .xlsx)をそのままアップロードできます。
              病院・診療所・歯科のみ取り込み、薬局データは自動的に除外されます。
              都道府県ごとに既存データのみ置き換わり、他都道府県分は保持されます。
            </span>
            <input
              type="file"
              accept=".zip,.xlsx"
              className="sync-file-input"
              disabled={isProcessing}
              onChange={handleBureauFileUpload}
            />
          </label>
        </div>

        <div className="sync-csv-dropzone">
          <label className="sync-csv-label">
            <FileText size={22} className="sync-csv-icon" />
            <span className="sync-csv-title">
              {isProcessing ? '更新・解析中...' : '独自整形済みのCSV / JSONを取り込む(上級者向け)'}
            </span>
            <input
              type="file"
              accept=".csv,.txt,.json"
              className="sync-file-input"
              disabled={isProcessing}
              onChange={handleFileUpload}
            />
          </label>
        </div>

        {message && (
          <div className={`sync-message-box ${message.isError ? 'is-danger' : 'is-success'}`}>
            {message.isError ? <X size={16} /> : <CheckCircle2 size={16} />}
            <span>{message.text}</span>
          </div>
        )}
      </div>

      <div className="sync-footer">
        <button type="button" className="btn-secondary" onClick={onClose}>
          閉じる
        </button>
      </div>

      <style jsx>{`
        .sync-dialog {
          width: 560px;
          max-width: 92%;
          padding: var(--space-6);
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--bg-card);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
        }
        .sync-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border);
          padding-bottom: var(--space-3-5);
        }
        .sync-title-box {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          color: var(--primary);
        }
        .sync-title {
          font-size: 1.15rem;
          font-weight: 800;
          margin: 0;
        }
        .btn-sync-close {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: var(--space-1);
        }
        .sync-body {
          padding: var(--space-5) 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-5);
        }
        .sync-stats-card {
          padding: var(--space-4);
          border-radius: 10px;
          background: var(--bg-subtle);
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: var(--space-4);
        }
        .sync-stats-icon {
          color: var(--primary);
        }
        .sync-stats-label {
          font-size: var(--fs-md);
          color: var(--text-muted);
        }
        .sync-stats-count {
          font-size: 1.4rem;
          font-weight: 800;
          color: var(--text-main);
        }
        .sync-stats-unit {
          font-size: var(--fs-base);
          font-weight: 600;
        }
        .sync-stats-updated {
          font-size: var(--fs-xs);
          color: var(--text-ghost);
          margin-top: var(--space-1);
        }
        .sync-seed-alert {
          padding: var(--space-3);
          border-radius: var(--radius-md);
          background: var(--warning-soft);
          color: var(--warning);
          font-size: var(--fs-md);
          font-weight: 700;
          display: flex;
          align-items: flex-start;
          gap: var(--space-2);
        }
        .sync-seed-icon {
          flex-shrink: 0;
          margin-top: 0.1rem;
        }
        .sync-upload-dropzone {
          border: 2px dashed var(--border-strong);
          border-radius: 12px;
          padding: var(--space-6);
          text-align: center;
          background: var(--bg-card);
          cursor: pointer;
        }
        .sync-upload-label {
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-2);
        }
        .sync-upload-icon {
          color: var(--primary);
        }
        .sync-upload-title {
          font-size: var(--fs-base);
          font-weight: 700;
        }
        .sync-upload-desc {
          font-size: var(--fs-sm);
          color: var(--text-muted);
        }
        .sync-file-input {
          display: none;
        }
        .sync-csv-dropzone {
          border: 1px dashed var(--border);
          border-radius: 12px;
          padding: var(--space-5);
          text-align: center;
          background: var(--bg-subtle);
          cursor: pointer;
        }
        .sync-csv-label {
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-1-5);
        }
        .sync-csv-icon {
          color: var(--text-muted);
        }
        .sync-csv-title {
          font-size: var(--fs-md);
          font-weight: 700;
          color: var(--text-muted);
        }
        .sync-message-box {
          padding: var(--space-3);
          border-radius: var(--radius-md);
          font-size: var(--fs-md);
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: var(--space-1-5);
        }
        .sync-message-box.is-danger {
          background: var(--danger-soft);
          color: var(--danger);
        }
        .sync-message-box.is-success {
          background: var(--success-soft);
          color: var(--success);
        }
        .sync-footer {
          display: flex;
          justify-content: flex-end;
          border-top: 1px solid var(--border);
          padding-top: var(--space-3-5);
        }
      `}</style>
    </dialog>
  );
};
