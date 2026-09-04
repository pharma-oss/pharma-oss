import React from 'react';
import { Trash2 } from 'lucide-react';
import type { Prescription, PrescriptionFieldValue } from '../types';
import { PrescribedDrugInput } from './PrescribedDrugInput';
import { DispensedDrugInput } from './DispensedDrugInput';

export interface PrescriptionRowProps {
  prescription: Prescription;
  index: number;
  onChange: (id: string, field: string, value: PrescriptionFieldValue, index: number) => void;
  onOpenDrugSearch: (id: string, currentDrug: string, targetField: 'prescribed' | 'dispensed', prescribedCode?: string) => void;
  onToggleIppoka: (id: string, checked: boolean, index: number) => void;
  onToggleCrushed: (id: string, checked: boolean, index: number) => void;
  onToggleReceiptRemark: (id: string, checked: boolean, index: number) => void;
  onDelete?: (id: string) => void;
}

export const PrescriptionRow = React.memo(({
  prescription,
  index,
  onChange,
  onOpenDrugSearch,
  onToggleIppoka,
  onToggleCrushed,
  onToggleReceiptRemark,
  onDelete
}: PrescriptionRowProps) => {
  return (
    <div className="prescription-row-container">
      <div className="prescription-row">
        <div className="prescription-row-index" aria-hidden="true">{index + 1}</div>
        <div className="field-stack drug-stack">
          <span className="field-label">薬品名</span>
          <PrescribedDrugInput
            prescription={prescription}
            index={index}
            onChange={onChange}
            onOpenDrugSearch={onOpenDrugSearch}
          />
        </div>
        <div className="field-stack amount-stack">
          <span className="field-label">1日量</span>
          <input
            type="text"
            className="amount"
            aria-label={`1日量 ${index + 1}`}
            placeholder="1"
            maxLength={10}
            value={prescription.amount}
            onChange={(e) => onChange(prescription.id, 'amount', e.target.value, index)}
          />
        </div>
        <div className="field-stack unit-stack">
          <span className="field-label">単位</span>
          <input
            type="text"
            className="unit-text"
            aria-label={`単位 ${index + 1}`}
            placeholder="単位"
            maxLength={10}
            value={prescription.unitText || ''}
            onChange={(e) => onChange(prescription.id, 'unitText', e.target.value, index)}
          />
        </div>
      </div>
      <div className="prescription-row-sub">
        <span className="sub-row-label">調剤薬</span>
        <div className="dispensed-field">
          <DispensedDrugInput
            prescription={prescription}
            index={index}
            onChange={onChange}
            onOpenDrugSearch={onOpenDrugSearch}
          />
        </div>
      </div>
      <div className="prescription-flags">
        <label className="flag-chip">
          <input
            type="checkbox"
            checked={prescription.isIppoka || false}
            onChange={(e) => onToggleIppoka(prescription.id, e.target.checked, index)}
          />
          一包化
        </label>
        <label className="flag-chip">
          <input
            type="checkbox"
            checked={prescription.isCrushed || false}
            onChange={(e) => onToggleCrushed(prescription.id, e.target.checked, index)}
          />
          粉砕
        </label>
        <label className="flag-chip">
          <input
            type="checkbox"
            checked={prescription.showReceiptRemark || false}
            onChange={(e) => onToggleReceiptRemark(prescription.id, e.target.checked, index)}
          />
          レセ摘あり
        </label>
        <label className="flag-chip tokkan-chip">
          <span>特管</span>
          <select
            aria-label={`特定薬剤管理指導加算 ${index + 1}`}
            value={prescription.tokkanType || 'none'}
            onChange={(e) => onChange(prescription.id, 'tokkanType', e.target.value, index)}
          >
            <option value="none">なし</option>
            <option value="1">加算1</option>
            <option value="3_i">加算3イ</option>
          </select>
        </label>
        <label className="agent-override-chip">
          <span>剤上書き</span>
          <input
            type="text"
            aria-label={`剤グループ上書き ${index + 1}`}
            maxLength={50}
            value={prescription.billingAgentGroupKey || ''}
            onChange={(e) => onChange(prescription.id, 'billingAgentGroupKey', e.target.value, index)}
          />
        </label>
        {prescription.changeReason && (
          <div className="change-reason-display">
            変更理由: {prescription.changeReason}
          </div>
        )}
        {onDelete && (
          <button
            type="button"
            className="btn-trash"
            onClick={() => onDelete(prescription.id)}
            title="薬品を削除"
            aria-label={`薬品 ${index + 1} を削除`}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {prescription.showReceiptRemark && (
        <div className="receipt-remark-row">
          <label htmlFor={`receiptRemark-${prescription.id}`}>レセプト摘要</label>
          <textarea
            id={`receiptRemark-${prescription.id}`}
            rows={2}
            maxLength={1000}
            value={prescription.receiptRemark || ''}
            onChange={(e) => onChange(prescription.id, 'receiptRemark', e.target.value, index)}
          />
        </div>
      )}
      {prescription.billingAgentGroupKey && (
        <div className="receipt-remark-row">
          <label htmlFor={`billingAgentGroupReason-${prescription.id}`}>剤理由</label>
          <textarea
            id={`billingAgentGroupReason-${prescription.id}`}
            rows={2}
            maxLength={500}
            value={prescription.billingAgentGroupReason || ''}
            onChange={(e) => onChange(prescription.id, 'billingAgentGroupReason', e.target.value, index)}
          />
        </div>
      )}
      <style jsx>{`
        .prescription-row-container {
          margin-bottom: 0.55rem;
          padding: 0.55rem;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background: #ffffff;
          transition: border-color var(--transition-fast), background var(--transition-fast), box-shadow var(--transition-fast);
        }

        .prescription-row-index {
          width: 26px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          background: #f8fafc;
          color: var(--primary-dark);
          border: 1px solid #dbeafe;
          font-size: var(--fs-sm);
          font-weight: 850;
        }

        .prescription-row-container:focus-within {
          border-color: var(--primary);
          background: #ffffff;
          box-shadow: 0 0 0 3px rgb(37 99 235 / 0.1);
        }

        .prescription-row {
          display: grid;
          grid-template-columns: 26px minmax(0, 1fr) 72px 64px;
          gap: 0.65rem;
          margin-bottom: 0.55rem;
          align-items: end;
        }

        .field-stack {
          min-width: 0;
          display: grid;
          gap: 0.28rem;
        }

        .field-label {
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 850;
        }

        .amount-stack {
          min-width: 0;
        }

        .unit-stack {
          min-width: 0;
        }

        .prescription-row :global(input.amount) {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          min-height: 38px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: #ffffff;
          color: var(--text-main);
          font-size: var(--fs-base);
          font-weight: 700;
          text-align: right;
          padding: 0.45rem 0.55rem;
        }

        .prescription-row :global(input.amount:focus) {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgb(37 99 235 / 0.12);
        }

        .prescription-row :global(input.unit-text) {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          min-height: 38px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: #ffffff;
          color: var(--text-main);
          font-size: var(--fs-base);
          font-weight: 700;
          text-align: left;
          padding: 0.45rem 0.55rem;
        }

        .prescription-row :global(input.unit-text:focus) {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgb(37 99 235 / 0.12);
        }

        .prescription-row-sub {
          display: grid;
          grid-template-columns: 56px minmax(0, 1fr);
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.55rem;
          margin-left: 32px;
        }

        .sub-row-label {
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 800;
          line-height: 1;
        }

        .dispensed-field {
          min-width: 0;
        }

        .prescription-flags {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.45rem;
        }

        .flag-chip {
          min-height: 28px;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.2rem 0.5rem;
          border: 1px solid transparent;
          border-radius: 6px;
          background: #f1f5f9;
          color: var(--text-muted);
          font-size: var(--fs-sm);
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }

        .flag-chip:has(input:checked) {
          border-color: #bbf7d0;
          background: #f0fdf4;
          color: var(--success);
        }

        .flag-chip input {
          width: 14px;
          height: 14px;
          accent-color: var(--success);
        }

        .tokkan-chip {
          cursor: default;
          gap: 0.38rem;
        }

        .tokkan-chip select {
          min-height: 24px;
          border: 1px solid #cbd5e1;
          border-radius: 5px;
          background: #ffffff;
          color: var(--text-main);
          font-size: var(--fs-xs);
          font-weight: 800;
          padding: 0 0.35rem;
        }

        .agent-override-chip {
          min-height: 28px;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.2rem 0.45rem;
          border: 1px solid #bae6fd;
          border-radius: 6px;
          background: #f0f9ff;
          color: #075985;
          font-size: var(--fs-sm);
          font-weight: 800;
        }

        .agent-override-chip input {
          width: 96px;
          min-height: 24px;
          border: 1px solid #7dd3fc;
          border-radius: 5px;
          background: #ffffff;
          color: var(--text-main);
          font-size: var(--fs-xs);
          font-weight: 800;
          padding: 0 0.35rem;
        }

        .agent-override-chip input:focus {
          outline: none;
          border-color: #0284c7;
          box-shadow: 0 0 0 3px rgb(14 165 233 / 0.12);
        }

        .change-reason-display {
          min-height: 28px;
          display: inline-flex;
          align-items: center;
          color: #b45309;
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 6px;
          padding: 0.2rem 0.5rem;
          font-size: var(--fs-sm);
          font-weight: 700;
        }

        .btn-trash {
          margin-left: auto;
          min-height: 28px;
          width: 28px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: #ef4444;
          cursor: pointer;
          opacity: 0.72;
        }

        .btn-trash:hover {
          background: #fef2f2;
          opacity: 1;
        }

        .receipt-remark-row {
          display: grid;
          grid-template-columns: 74px minmax(0, 1fr);
          gap: 0.5rem;
          align-items: start;
          margin-top: 0.55rem;
        }

        .receipt-remark-row label {
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 800;
          padding-top: 0.45rem;
        }

        .receipt-remark-row textarea {
          width: 100%;
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 0.5rem 0.6rem;
          font-family: inherit;
          font-size: var(--fs-md);
          resize: vertical;
        }

        @media (max-width: 720px) {
          .prescription-row {
            grid-template-columns: 1fr;
          }

          .prescription-row-sub,
          .receipt-remark-row {
            grid-template-columns: 1fr;
          }

          .prescription-row-container {
            padding: 0.75rem;
          }

          .sub-row-label {
            margin-top: 0.2rem;
          }

          .prescription-row-sub {
            margin-left: 0;
          }
        }
      `}</style>
    </div>
  );
});

PrescriptionRow.displayName = 'PrescriptionRow';
