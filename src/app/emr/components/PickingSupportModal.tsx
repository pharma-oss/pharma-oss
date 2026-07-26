'use meemo';
'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Barcode,
  Activity,
  X,
  Download,
  Upload,
  Printer,
  Edit2
} from 'lucide-react';
import type { PickingItem } from '@/lib/emr_helpers';

export interface PickingSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: PickingItem[];
  patientName: string;
  prescriptionId: string;
  onScanGs1: (scannedCode: string) => Promise<{ success: boolean; message: string }>;
  onRecordShortage: (itemId: string, shortageQty: number, note: string) => Promise<void>;
  onResetPick: (itemId: string) => void;
  onExportInstruction: () => void;
  onImportResultFile: (file: File) => Promise<void>;
  onPrintReceipt: () => void;
}

export const PickingSupportModal: React.FC<PickingSupportModalProps> = ({
  isOpen,
  onClose,
  items,
  patientName,
  prescriptionId,
  onScanGs1,
  onRecordShortage,
  onResetPick,
  onExportInstruction,
  onImportResultFile,
  onPrintReceipt
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [scanInput, setScanInput] = useState('');
  const [scanMessage, setScanMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isVerifyingScan, setIsVerifyingScan] = useState(false);
  const [editingShortageItemId, setEditingShortageItemId] = useState<string | null>(null);
  const [shortageQtyInput, setShortageQtyInput] = useState<number>(0);
  const [shortageNoteInput, setShortageNoteInput] = useState('');
  const [isImportingSystemResult, setIsImportingSystemResult] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalItems = items.length;
  const pickedItems = items.filter((item) => item.isPicked).length;
  const isAllPicked = totalItems > 0 && pickedItems === totalItems;

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = scanInput.trim();
    if (!code || isVerifyingScan) return;

    setIsVerifyingScan(true);
    setScanMessage(null);

    try {
      const res = await onScanGs1(code);
      if (res.success) {
        setScanMessage({ text: res.message, isError: false });
        setScanInput('');
      } else {
        setScanMessage({ text: res.message, isError: true });
      }
    } catch {
      setScanMessage({ text: 'スキャン処理中にエラーが発生しました。', isError: true });
    } finally {
      setIsVerifyingScan(false);
    }
  };

  const openShortageEditor = (item: PickingItem) => {
    setEditingShortageItemId(item.itemId);
    setShortageQtyInput(item.shortageQuantity || 0);
    setShortageNoteInput(item.shortageNote || '');
  };

  const saveShortage = async (itemId: string) => {
    await onRecordShortage(itemId, shortageQtyInput, shortageNoteInput);
    setEditingShortageItemId(null);
  };

  return (
    <dialog
      ref={dialogRef}
      className="picking-modal glass"
      aria-labelledby="picking-title"
      onClose={onClose}
    >
      <div
        className="modal-header"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '1rem'
        }}
      >
        <div
          className="modal-title-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)' }}>
            <Activity size={20} />
            <h3 id="picking-title" style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
              GS1ピッキング支援 (リアルタイム照合)
            </h3>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            aria-label="閉じる"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.2rem' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="patient-prescription-info" style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
          患者: <strong style={{ color: 'var(--text-main)' }}>{patientName}</strong> 様 / 処方ID: {prescriptionId}
        </div>
      </div>

      <div className="modal-body" style={{ padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <form onSubmit={handleScanSubmit} className="scan-form-box" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Barcode size={16} />
            GS1バーコード / JANコード スキャン
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              placeholder="バーコードリーダーの入力を受け付けます..."
              className="input-field"
              style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.95rem' }}
              autoFocus
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={isVerifyingScan || !scanInput.trim()}
              style={{ minWidth: '80px' }}
            >
              {isVerifyingScan ? '照合中...' : '照合'}
            </button>
          </div>
          {scanMessage && (
            <div
              style={{
                fontSize: '0.85rem',
                color: scanMessage.isError ? 'var(--danger)' : 'var(--success)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              {scanMessage.isError ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
              <span>{scanMessage.text}</span>
            </div>
          )}
        </form>

        <div className="picking-status-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
          <div>
            進捗: <strong>{pickedItems}</strong> / {totalItems} 調剤完了
          </div>
          {isAllPicked && (
            <div style={{ color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <CheckCircle2 size={18} />
              <span>全調剤完了</span>
            </div>
          )}
        </div>

        <div className="picking-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '350px', overflowY: 'auto' }}>
          {items.map((item) => (
            <div
              key={item.itemId}
              className={`picking-item-card ${item.isPicked ? 'picked' : ''}`}
              style={{
                padding: '0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: item.isPicked ? 'rgba(34, 197, 94, 0.05)' : 'var(--bg-card)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{item.drugName}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  必要量: <strong>{item.totalQuantity}</strong> | 棚: {item.location || '未設定'}
                </div>

                {item.shortageQuantity > 0 && (
                  <div style={{ color: 'var(--warning)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <AlertTriangle size={14} />
                    <span>不足数: {item.shortageQuantity} {item.shortageNote ? `(${item.shortageNote})` : ''}</span>
                  </div>
                )}

                {item.pickedGtin && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--success)', fontFamily: 'monospace' }}>
                    GTIN: {item.pickedGtin} {item.pickedLotNumber ? ` / Lot: ${item.pickedLotNumber}` : ''}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {editingShortageItemId === item.itemId ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem' }}>不足量:</span>
                      <input
                        type="number"
                        min={0}
                        value={shortageQtyInput}
                        onChange={(e) => setShortageQtyInput(Number(e.target.value))}
                        style={{ width: '60px', padding: '0.2rem 0.4rem', fontSize: '0.85rem' }}
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="メモ (任意)"
                      value={shortageNoteInput}
                      onChange={(e) => setShortageNoteInput(e.target.value)}
                      style={{ fontSize: '0.8rem', padding: '0.2rem 0.4rem', width: '140px' }}
                    />
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ padding: '0.15rem 0.4rem', fontSize: '0.75rem' }}
                        onClick={() => void saveShortage(item.itemId)}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '0.15rem 0.4rem', fontSize: '0.75rem' }}
                        onClick={() => setEditingShortageItemId(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => openShortageEditor(item)}
                      style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                    >
                      <Edit2 size={13} />
                      <span>不足記録</span>
                    </button>

                    {item.isPicked ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => onResetPick(item.itemId)}
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', color: 'var(--danger)' }}
                      >
                        解除
                      </button>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        未照合
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="modal-footer"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--border)',
          paddingTop: '1rem',
          marginTop: '1rem'
        }}
      >
        <div className="external-sync-group" style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn-secondary flex-center gap-1"
            onClick={onExportInstruction}
            title="ピッキング指示データ(CSV)を出力"
          >
            <Download size={15} />
            <span>指示CSV</span>
          </button>
          <label className="btn-secondary flex-center gap-1" style={{ cursor: 'pointer' }}>
            <Upload size={15} />
            <span>{isImportingSystemResult ? '取込中...' : '結果取込'}</span>
            <input
              type="file"
              accept=".csv,.txt"
              style={{ display: 'none' }}
              disabled={isImportingSystemResult}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setIsImportingSystemResult(true);
                try {
                  await onImportResultFile(file);
                } finally {
                  setIsImportingSystemResult(false);
                  e.target.value = '';
                }
              }}
            />
          </label>
        </div>

        <div className="actions" style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn-secondary flex-center gap-1" onClick={onPrintReceipt}>
            <Printer size={15} />
            <span>印刷</span>
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>
            完了
          </button>
        </div>
      </div>
    </dialog>
  );
};
