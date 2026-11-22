'use client';

import React, { useMemo, useState } from 'react';
import { ClipboardCheck, Download, FileText, Printer } from 'lucide-react';
import { toast } from 'sonner';
import type { AuditLog, DrugStock, PharmacyDatabase, PrescriptionItem, Visit } from '@/db/types';
import { logAuditAction } from '@/lib/audit';
import { AuditLogFailedError, ExportAuditFailedError, exportWithAuditFirst, runWithAuditRollback } from '@/lib/audit_guard';
import { downloadTextFile } from '@/lib/blob_download';
import {
  CONTROLLED_DRUG_LEDGER_DISCLAIMER,
  INVENTORY_EVENT_META,
  buildControlledDrugAuxiliaryLedgerCsv,
  buildControlledDrugAuxiliaryLedgerPrintHtml,
  buildControlledDrugAuxiliaryLedgerRows,
  buildInventoryStructuredAuditEntry,
  type InventoryStructuredEventKind
} from '@/lib/inventory_audit_log';
import { formatDateForFileName } from '@/lib/inventory_order';
import type { DrugWithSearchCache } from '../types';

export interface InventoryAuditToolsPanelProps {
  db: PharmacyDatabase | null | undefined;
  drugs: DrugWithSearchCache[];
  stockLots: DrugStock[];
}

export function InventoryAuditToolsPanel({ db, drugs, stockLots }: InventoryAuditToolsPanelProps) {
  const [eventKind, setEventKind] = useState<InventoryStructuredEventKind>('disposal');
  const [drugCode, setDrugCode] = useState('');
  const [lotId, setLotId] = useState('');
  const [quantityInput, setQuantityInput] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isExportingLedger, setIsExportingLedger] = useState(false);

  const selectedDrug = useMemo(
    () => drugs.find((drug) => drug.code === drugCode),
    [drugs, drugCode]
  );

  const candidateLots = useMemo(
    () => stockLots
      .filter((lot) => lot.drugCode === drugCode && (lot.quantity || 0) > 0)
      .slice()
      .sort((a, b) => String(a.expirationDate || '9999').localeCompare(String(b.expirationDate || '9999'))),
    [stockLots, drugCode]
  );

  const controlledCount = useMemo(
    () => drugs.filter((drug) => drug.isNarcotic || drug.isPsychotropic).length,
    [drugs]
  );

  const handleRecordEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!db || !selectedDrug || isRecording) return;

    const parsedQty = Number(quantityInput);
    if (!Number.isFinite(parsedQty) || parsedQty === 0) {
      toast.error('数量は 0 以外の数値で入力してください。');
      return;
    }
    if (!reason.trim()) {
      toast.error('理由を入力してください。');
      return;
    }

    const meta = INVENTORY_EVENT_META[eventKind];
    const quantityDelta = meta.defaultSign === 0
      ? parsedQty
      : Math.abs(parsedQty) * meta.defaultSign;
    const selectedLot = candidateLots.find((lot) => lot.id === lotId);

    const built = buildInventoryStructuredAuditEntry({
      kind: eventKind,
      drugCode: selectedDrug.code,
      drugName: selectedDrug.name,
      quantityDelta,
      lotNumber: selectedLot?.lotNumber,
      expirationDate: selectedLot?.expirationDate,
      reason: reason.trim(),
      note: note.trim() || undefined
    });

    setIsRecording(true);
    try {
      await runWithAuditRollback({
        write: async () => {
          const drugDoc = await db.drugs.findOne(selectedDrug.code).exec();
          if (!drugDoc) throw new Error('対象の医薬品が見つかりませんでした。');
          const prevDrugQty = drugDoc.stockQuantity ?? 0;
          const nextDrugQty = Math.max(0, Math.round((prevDrugQty + quantityDelta) * 100) / 100);
          await drugDoc.patch({ stockQuantity: nextDrugQty });

          let prevLotQty: number | null = null;
          const lotDoc = selectedLot ? await db.drug_stocks.findOne(selectedLot.id).exec() : null;
          if (lotDoc) {
            prevLotQty = lotDoc.quantity;
            const nextLotQty = Math.max(0, Math.round((prevLotQty + quantityDelta) * 100) / 100);
            await lotDoc.patch({ quantity: nextLotQty });
          }
          return { drugDoc, prevDrugQty, lotDoc, prevLotQty };
        },
        logAudit: () => logAuditAction(db, built.actionType, built.detail),
        rollback: async (written) => {
          await written.drugDoc.patch({ stockQuantity: written.prevDrugQty });
          if (written.lotDoc && written.prevLotQty !== null) {
            await written.lotDoc.patch({ quantity: written.prevLotQty });
          }
        },
        failureMessage: '構造化在庫監査ログの記録に失敗したため、在庫変更を取り消しました。'
      });

      toast.success(`${meta.label}を記録し、監査ログへ保存しました。`);
      setQuantityInput('');
      setReason('');
      setNote('');
      setLotId('');
    } catch (error) {
      console.error('Failed to record inventory audit event:', error);
      toast.error(error instanceof AuditLogFailedError ? error.message : '在庫監査イベントの記録に失敗しました。');
    } finally {
      setIsRecording(false);
    }
  };

  const buildAuxiliaryLedgerData = async () => {
    if (!db) return null;
    const [visitDocs, itemDocs, auditDocs, settingsDoc] = await Promise.all([
      db.visits.find({ selector: { status: 'completed' } }).exec(),
      db.prescription_items.find().exec(),
      db.audit_logs.find({
        selector: {
          actionType: { $in: ['stock_cancel', 'stock_return', 'stock_disposal', 'stock_take_variance'] }
        }
      }).exec(),
      db.facility_settings.findOne('default').exec()
    ]);

    const visits = visitDocs.map((doc) => doc.toJSON() as Visit);
    const prescriptionItems = itemDocs.map((doc) => doc.toJSON() as PrescriptionItem);
    const auditLogs = auditDocs.map((doc) => doc.toJSON() as AuditLog);
    const generatedAt = new Date().toISOString();
    const pharmacyName = settingsDoc?.pharmacyName || '未設定';
    const rows = buildControlledDrugAuxiliaryLedgerRows({
      drugs,
      stockLots,
      visits,
      prescriptionItems,
      auditLogs,
      asOfDate: generatedAt.slice(0, 10)
    });
    return { rows, meta: { pharmacyName, generatedAt } };
  };

  const handleExportLedger = async (mode: 'csv' | 'print') => {
    if (!db || isExportingLedger) return;
    setIsExportingLedger(true);
    try {
      const data = await buildAuxiliaryLedgerData();
      if (!data) return;

      await exportWithAuditFirst({
        logAudit: () => logAuditAction(
          db,
          'narcotic_ledger_export',
          `麻薬・向精神薬受払補助帳簿(${mode === 'csv' ? 'CSV' : '印刷用HTML'})出力: ${data.rows.length}行（法定帳簿の補助記録・患者個人情報なし）`
        ),
        download: () => {
          if (mode === 'csv') {
            const csv = buildControlledDrugAuxiliaryLedgerCsv(data.rows, data.meta);
            const dateStr = formatDateForFileName(new Date());
            downloadTextFile(
              `\uFEFF${csv}`,
              `yakureki-controlled-drug-auxiliary-ledger-${dateStr}.csv`,
              'text/csv;charset=utf-8;'
            );
            return;
          }
          const html = buildControlledDrugAuxiliaryLedgerPrintHtml(data.rows, data.meta);
          const printWin = window.open('', '_blank', 'noopener,noreferrer');
          if (!printWin) {
            toast.error('印刷用ウィンドウを開けませんでした。ポップアップ許可を確認してください。');
            return;
          }
          printWin.document.open();
          printWin.document.write(html);
          printWin.document.close();
        },
        failureMessage: '監査ログ記録に失敗したため、補助帳簿の出力を中止しました。'
      });

      toast.success(mode === 'csv' ? '麻薬・向精神薬補助帳簿 CSV を出力しました。' : '麻薬・向精神薬補助帳簿の印刷画面を開きました。');
    } catch (error) {
      console.error('Failed to export controlled drug auxiliary ledger:', error);
      toast.error(error instanceof ExportAuditFailedError ? error.message : '補助帳簿の出力に失敗しました。');
    } finally {
      setIsExportingLedger(false);
    }
  };

  return (
    <div className="card inventory-audit-tools-card" data-testid="inventory-audit-tools-panel">
      <div className="inventory-audit-section">
        <div className="inventory-audit-header">
          <div className="inventory-audit-title">
            <FileText size={18} aria-hidden="true" />
            <h3>麻薬・向精神薬 受払・残高 補助帳簿出力</h3>
          </div>
          <div className="inventory-audit-actions">
            <button
              type="button"
              className="btn-secondary compact"
              data-testid="controlled-ledger-csv-btn"
              onClick={() => handleExportLedger('csv')}
              disabled={!db || controlledCount === 0 || isExportingLedger}
            >
              <Download size={14} aria-hidden="true" />
              <span>補助帳簿 CSV</span>
            </button>
            <button
              type="button"
              className="btn-secondary compact"
              data-testid="controlled-ledger-print-btn"
              onClick={() => handleExportLedger('print')}
              disabled={!db || controlledCount === 0 || isExportingLedger}
            >
              <Printer size={14} aria-hidden="true" />
              <span>補助帳簿 印刷</span>
            </button>
          </div>
        </div>
        <p className="inventory-audit-disclaimer" role="note">
          {CONTROLLED_DRUG_LEDGER_DISCLAIMER}
        </p>
      </div>

      <form className="inventory-audit-form" onSubmit={handleRecordEvent} data-testid="inventory-structured-event-form">
        <div className="inventory-audit-title">
          <ClipboardCheck size={18} aria-hidden="true" />
          <h3>取消・返品・廃棄・棚卸差異の構造化記録</h3>
        </div>
        <div className="inventory-audit-grid">
          <label className="inventory-audit-field">
            <span>区分</span>
            <select
              value={eventKind}
              onChange={(e) => setEventKind(e.target.value as InventoryStructuredEventKind)}
            >
              {(Object.keys(INVENTORY_EVENT_META) as InventoryStructuredEventKind[]).map((key) => (
                <option key={key} value={key}>{INVENTORY_EVENT_META[key].label}</option>
              ))}
            </select>
          </label>
          <label className="inventory-audit-field">
            <span>対象医薬品</span>
            <select value={drugCode} onChange={(e) => { setDrugCode(e.target.value); setLotId(''); }} required>
              <option value="">選択してください</option>
              {drugs.slice(0, 200).map((drug) => (
                <option key={drug.code} value={drug.code}>{drug.name} (在庫 {drug.stockQuantity ?? 0})</option>
              ))}
            </select>
          </label>
          <label className="inventory-audit-field">
            <span>ロット（任意）</span>
            <select value={lotId} onChange={(e) => setLotId(e.target.value)} disabled={candidateLots.length === 0}>
              <option value="">ロット指定なし</option>
              {candidateLots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.lotNumber || 'ロット不明'} / 期限 {lot.expirationDate || '未設定'} (残 {lot.quantity})
                </option>
              ))}
            </select>
          </label>
          <label className="inventory-audit-field">
            <span>{eventKind === 'stocktake_variance' ? '差異数量 (+/-)' : '数量'}</span>
            <input
              type="number"
              step="0.01"
              value={quantityInput}
              onChange={(e) => setQuantityInput(e.target.value)}
              placeholder={eventKind === 'stocktake_variance' ? '例: -2 または +1' : '例: 10'}
              required
            />
          </label>
        </div>
        <div className="inventory-audit-grid-2">
          <label className="inventory-audit-field">
            <span>理由（必須）</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例: 使用期限切れ廃棄 / 破損 / 卸返品 / 処方取消による戻し"
              maxLength={200}
              required
            />
          </label>
          <label className="inventory-audit-field">
            <span>備考（患者個人情報不可）</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="伝票番号・立会者など"
              maxLength={200}
            />
          </label>
        </div>
        <div className="inventory-audit-submit-row">
          <button type="submit" className="btn-primary" disabled={!db || !selectedDrug || isRecording}>
            {isRecording ? '記録中...' : '在庫変更と監査ログを記録'}
          </button>
        </div>
      </form>

      <style jsx>{`
        .inventory-audit-tools-card {
          margin-top: var(--space-4);
          display: grid;
          gap: var(--space-4);
        }
        .inventory-audit-section,
        .inventory-audit-form {
          display: grid;
          gap: var(--space-2-5);
        }
        .inventory-audit-form {
          padding-top: var(--space-3);
          border-top: 1px solid var(--border);
        }
        .inventory-audit-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
          flex-wrap: wrap;
        }
        .inventory-audit-title {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .inventory-audit-title h3 {
          margin: 0;
          font-size: var(--fs-md);
        }
        .inventory-audit-actions {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
        }
        .inventory-audit-disclaimer {
          margin: 0;
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-sm);
          border: 1px solid #fecaca;
          background: var(--danger-soft, #fef2f2);
          color: #991b1b;
          font-size: var(--fs-xs);
          font-weight: 700;
        }
        .inventory-audit-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: var(--space-2);
        }
        .inventory-audit-grid-2 {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--space-2);
        }
        .inventory-audit-field {
          display: grid;
          gap: var(--space-1);
          min-width: 0;
        }
        .inventory-audit-field span {
          font-size: var(--fs-xs);
          font-weight: 700;
          color: var(--text-muted);
        }
        .inventory-audit-field input,
        .inventory-audit-field select {
          width: 100%;
          min-width: 0;
          padding: var(--space-1-5) var(--space-2);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          color: var(--text-main);
          font-size: var(--fs-sm);
          font-family: inherit;
        }
        .inventory-audit-submit-row {
          display: flex;
          justify-content: flex-end;
        }
        @media (max-width: 760px) {
          .inventory-audit-grid,
          .inventory-audit-grid-2 {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
