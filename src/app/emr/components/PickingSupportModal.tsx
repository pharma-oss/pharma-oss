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
import WorkflowMiniTutorial from '@/components/WorkflowMiniTutorial';

export interface PickingSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: PickingItem[];
  patientName: string;
  prescriptionId: string;
  userId?: string;
  onScanGs1: (scannedCode: string) => Promise<{ success: boolean; message: string }>;
  onRecordShortage: (itemId: string, shortageQty: number, note: string) => Promise<void>;
  onResetPick: (itemId: string) => void;
  onExportInstruction: () => Promise<void>;
  onImportResultFile: (file: File) => Promise<void>;
  onPrintReceipt: () => void;
}

export const PickingSupportModal: React.FC<PickingSupportModalProps> = ({
  isOpen,
  onClose,
  items,
  patientName,
  prescriptionId,
  userId,
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
      <div className="modal-header picking-header">
        <div className="modal-title-row picking-title-row">
          <div className="picking-title-group">
            <Activity size={20} />
            <h3 id="picking-title" className="picking-title">
              GS1ピッキング支援 (リアルタイム照合)
            </h3>
          </div>
          <button
            type="button"
            className="btn-close btn-picking-close"
            onClick={onClose}
            aria-label="閉じる"
          >
            <X size={20} />
          </button>
        </div>

        <div className="patient-prescription-info">
          患者: <strong className="patient-name-strong">{patientName}</strong> 様 / 処方ID: {prescriptionId}
        </div>
        <WorkflowMiniTutorial kind="picking" userId={userId || ''} autoOpen={isOpen} />
      </div>

      <div className="modal-body picking-body">
        <form onSubmit={handleScanSubmit} className="scan-form-box">
          <label className="scan-label">
            <Barcode size={16} />
            GS1バーコード / JANコード スキャン
          </label>
          <div className="scan-input-group">
            <input
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              placeholder="バーコードリーダーの入力を受け付けます..."
              className="input-field scan-input"
              autoFocus
            />
            <button
              type="submit"
              className="btn-primary btn-scan-submit"
              disabled={isVerifyingScan || !scanInput.trim()}
            >
              {isVerifyingScan ? '照合中...' : '照合'}
            </button>
          </div>
          {scanMessage && (
            <div className={`scan-message ${scanMessage.isError ? 'is-error' : 'is-success'}`}>
              {scanMessage.isError ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
              <span>{scanMessage.text}</span>
            </div>
          )}
        </form>

        <div className="picking-status-summary">
          <div>
            進捗: <strong>{pickedItems}</strong> / {totalItems} 調剤完了
          </div>
          {isAllPicked && (
            <div className="all-picked-badge">
              <CheckCircle2 size={18} />
              <span>全調剤完了</span>
            </div>
          )}
        </div>

        <div className="picking-list">
          {items.map((item) => (
            <div
              key={item.itemId}
              className={`picking-item-card ${item.isPicked ? 'picked' : ''}`}
            >
              <div className="item-info">
                <div className="item-name">{item.drugName}</div>
                <div className="item-meta">
                  必要量: <strong>{item.totalQuantity}</strong> | 棚: {item.location || '未設定'}
                </div>

                {item.shortageQuantity > 0 && (
                  <div className="item-shortage-alert">
                    <AlertTriangle size={14} />
                    <span>不足数: {item.shortageQuantity} {item.shortageNote ? `(${item.shortageNote})` : ''}</span>
                  </div>
                )}

                {item.pickedGtin && (
                  <div className="item-gtin">
                    GTIN: {item.pickedGtin} {item.pickedLotNumber ? ` / Lot: ${item.pickedLotNumber}` : ''}
                  </div>
                )}
              </div>

              <div className="item-actions">
                {editingShortageItemId === item.itemId ? (
                  <div className="shortage-editor">
                    <div className="shortage-qty-row">
                      <span className="shortage-label">不足量:</span>
                      <input
                        type="number"
                        min={0}
                        value={shortageQtyInput}
                        onChange={(e) => setShortageQtyInput(Number(e.target.value))}
                        className="shortage-qty-input"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="メモ (任意)"
                      value={shortageNoteInput}
                      onChange={(e) => setShortageNoteInput(e.target.value)}
                      className="shortage-note-input"
                    />
                    <div className="shortage-btn-row">
                      <button
                        type="button"
                        className="btn-primary btn-shortage-action"
                        onClick={() => void saveShortage(item.itemId)}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-shortage-action"
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
                      className="btn-secondary btn-shortage-record"
                      onClick={() => openShortageEditor(item)}
                    >
                      <Edit2 size={13} />
                      <span>不足記録</span>
                    </button>

                    {item.isPicked ? (
                      <button
                        type="button"
                        className="btn-secondary btn-reset-pick"
                        onClick={() => onResetPick(item.itemId)}
                      >
                        解除
                      </button>
                    ) : (
                      <div className="unpicked-label">
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

      <div className="modal-footer picking-footer">
        <div className="external-sync-group">
          <button
            type="button"
            className="btn-secondary flex-center gap-1"
            onClick={onExportInstruction}
            data-testid="picking-instruction-export"
            title="ピッキング指示データ(CSV)を出力"
          >
            <Download size={15} />
            <span>指示CSV</span>
          </button>
          <label className="btn-secondary flex-center gap-1 btn-file-upload" data-testid="picking-result-import">
            <Upload size={15} />
            <span>{isImportingSystemResult ? '取込中...' : '結果取込'}</span>
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              className="file-input-hidden"
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

        <div className="actions picking-footer-actions">
          <button type="button" className="btn-secondary flex-center gap-1" onClick={onPrintReceipt}>
            <Printer size={15} />
            <span>レジロール印刷</span>
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>
            完了
          </button>
        </div>
      </div>
      <style jsx>{`
        .picking-header {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
          border-bottom: 1px solid var(--border);
          padding-bottom: var(--space-4);
        }
        .picking-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
        }
        .picking-title-group {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          color: var(--success);
        }
        .picking-title {
          font-size: 1.2rem;
          font-weight: 700;
          margin: 0;
        }
        .btn-picking-close {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: var(--space-0-5);
          display: flex;
          align-items: center;
        }
        .patient-prescription-info {
          font-size: var(--fs-md);
          color: var(--text-muted);
        }
        .patient-name-strong {
          color: var(--text-main);
        }
        .picking-body {
          padding: var(--space-4) 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-5);
        }
        .scan-form-box {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .scan-label {
          font-size: var(--fs-md);
          fontWeight: 600;
          display: flex;
          align-items: center;
          gap: var(--space-1-5);
        }
        .scan-input-group {
          display: flex;
          gap: var(--space-2);
        }
        .scan-input {
          flex: 1;
          padding: var(--space-2) var(--space-3);
          font-size: var(--fs-base);
        }
        .btn-scan-submit {
          min-width: 80px;
        }
        .scan-message {
          font-size: var(--fs-md);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: var(--space-1);
        }
        .scan-message.is-error {
          color: var(--danger);
        }
        .scan-message.is-success {
          color: var(--success);
        }
        .picking-status-summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: var(--fs-base);
        }
        .all-picked-badge {
          color: var(--success);
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: var(--space-1-5);
        }
        .picking-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          max-height: 350px;
          overflow-y: auto;
        }
        .picking-item-card {
          padding: var(--space-3);
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          background: var(--bg-card);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .picking-item-card.picked {
          background: rgba(34, 197, 94, 0.05);
        }
        .item-info {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }
        .item-name {
          font-weight: 700;
          font-size: var(--fs-base);
        }
        .item-meta {
          font-size: var(--fs-sm);
          color: var(--text-muted);
        }
        .item-shortage-alert {
          color: var(--warning);
          font-size: var(--fs-sm);
          display: flex;
          align-items: center;
          gap: var(--space-1);
        }
        .item-gtin {
          font-size: var(--fs-xs);
          color: var(--success);
          font-family: monospace;
        }
        .item-actions {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .shortage-editor {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
          align-items: flex-end;
        }
        .shortage-qty-row {
          display: flex;
          gap: var(--space-1);
          align-items: center;
        }
        .shortage-label {
          font-size: var(--fs-sm);
        }
        .shortage-qty-input {
          width: 60px;
          padding: var(--space-0-5) var(--space-1);
          font-size: var(--fs-md);
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
        }
        .shortage-note-input {
          font-size: var(--fs-sm);
          padding: var(--space-0-5) var(--space-1);
          width: 140px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
        }
        .shortage-btn-row {
          display: flex;
          gap: var(--space-1);
        }
        .btn-shortage-action {
          padding: var(--space-0-5) var(--space-1);
          font-size: var(--fs-xs);
        }
        .btn-shortage-record {
          padding: var(--space-1) var(--space-1-5);
          font-size: var(--fs-sm);
          display: flex;
          align-items: center;
          gap: var(--space-0-5);
        }
        .btn-reset-pick {
          padding: var(--space-1) var(--space-2);
          font-size: var(--fs-sm);
          color: var(--danger);
        }
        .unpicked-label {
          font-size: var(--fs-sm);
          color: var(--text-muted);
          font-style: italic;
        }
        .picking-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px solid var(--border);
          padding-top: var(--space-4);
          margin-top: var(--space-4);
        }
        .external-sync-group {
          display: flex;
          gap: var(--space-2);
        }
        .btn-file-upload {
          cursor: pointer;
        }
        .file-input-hidden {
          display: none;
        }
        .picking-footer-actions {
          display: flex;
          gap: var(--space-2);
        }
      `}</style>
    </dialog>
  );
};
