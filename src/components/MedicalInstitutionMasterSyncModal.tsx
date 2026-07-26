'use client';

import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Upload, CheckCircle2, FileText, X, Database } from 'lucide-react';
import {
  getMedicalInstitutionMasterStats,
  importMedicalInstitutionMasterCsv,
  importMedicalInstitutionMasterJson
} from '@/lib/master-data/medical_institution_master';

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

  return (
    <dialog
      ref={dialogRef}
      className="institution-sync-modal glass"
      aria-labelledby="sync-title"
      onClose={onClose}
      style={{
        width: '560px',
        maxWidth: '92%',
        padding: '1.5rem',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.15)'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '0.85rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
          <RefreshCw size={22} />
          <h3 id="sync-title" style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
            医療機関マスタ 最新情報同期
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.2rem' }}
        >
          <X size={20} />
        </button>
      </div>

      <div style={{ padding: '1.25rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div
          style={{
            padding: '1rem',
            borderRadius: '10px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <Database size={32} style={{ color: 'var(--primary)' }} />
          <div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>現在の登録施設数</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)' }}>
              {stats.totalCount.toLocaleString()} <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>施設</span>
            </div>
            {stats.lastSyncTimestamp && (
              <div style={{ fontSize: '0.76rem', color: 'var(--text-ghost)', marginTop: '0.2rem' }}>
                最終更新: {new Date(stats.lastSyncTimestamp).toLocaleString('ja-JP')}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            border: '2px dashed var(--border-strong)',
            borderRadius: '12px',
            padding: '1.5rem',
            textAlign: 'center',
            background: 'var(--bg-card)',
            cursor: 'pointer'
          }}
        >
          <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <Upload size={28} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>
              {isProcessing ? '更新・解析中...' : '厚労省・厚生局最新マスタファイル (CSV / JSON) を取り込む'}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              地方厚生局届出のCSVデータやJSON形式ファイルをアップロードすると即時最新化されます
            </span>
            <input
              type="file"
              accept=".csv,.txt,.json"
              style={{ display: 'none' }}
              disabled={isProcessing}
              onChange={handleFileUpload}
            />
          </label>
        </div>

        {message && (
          <div
            style={{
              padding: '0.75rem',
              borderRadius: '8px',
              background: message.isError ? 'var(--danger-soft)' : 'var(--success-soft)',
              color: message.isError ? 'var(--danger)' : 'var(--success)',
              fontSize: '0.88rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            {message.isError ? <X size={16} /> : <CheckCircle2 size={16} />}
            <span>{message.text}</span>
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          borderTop: '1px solid var(--border)',
          paddingTop: '0.85rem'
        }}
      >
        <button type="button" className="btn-secondary" onClick={onClose}>
          閉じる
        </button>
      </div>
    </dialog>
  );
};
