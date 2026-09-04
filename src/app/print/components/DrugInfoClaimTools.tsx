import React from 'react';
import { getDisplayDrugName } from '../helpers';

export interface DrugInfoClaimToolsProps {
  prescriptionItems: any[];
  canEditBilling: boolean;
  remarks: Record<string, string>;
  handleToggleIppoka: (itemId: string, checked: boolean, idx: number) => Promise<void>;
  handleToggleCrushed: (itemId: string, checked: boolean, idx: number) => Promise<void>;
  handleItemClaimToggle: (itemId: string, field: string, checked: boolean, idx: number) => Promise<void>;
  handleTokkanChange: (itemId: string, value: string, idx: number) => Promise<void>;
  handleBillingAgentOverrideLocalChange: (itemId: string, field: string, value: string, idx: number) => void;
  persistBillingAgentOverride: (itemId: string, idx: number) => Promise<void>;
  handleReceiptRemarkChange: (itemId: string, value: string, idx: number) => void;
}

export const DrugInfoClaimTools = React.memo(function DrugInfoClaimTools({
  prescriptionItems,
  canEditBilling,
  remarks,
  handleToggleIppoka,
  handleToggleCrushed,
  handleItemClaimToggle,
  handleTokkanChange,
  handleBillingAgentOverrideLocalChange,
  persistBillingAgentOverride,
  handleReceiptRemarkChange
}: DrugInfoClaimToolsProps) {
  return (
    <div className="drug-info-claim-tools no-print" aria-label="薬剤情報提供書の算定調整">
      {prescriptionItems.map((item, idx) => (
        <div className="drug-info-claim-row" key={`drug-info-claim-${item.itemId}`}>
          <strong>{getDisplayDrugName(item)}</strong>
          <div className="drug-info-control-panel">
            <label>
              <input
                type="checkbox"
                checked={item.isIppoka || false}
                disabled={!canEditBilling}
                onChange={(e) => handleToggleIppoka(item.itemId, e.target.checked, idx)}
              />
              一包化
            </label>
            <label>
              <input
                type="checkbox"
                checked={item.isCrushed || false}
                disabled={!canEditBilling}
                onChange={(e) => handleToggleCrushed(item.itemId, e.target.checked, idx)}
              />
              粉砕
            </label>
            <label>
              <input
                type="checkbox"
                checked={item.claimPreparation !== false}
                disabled={!canEditBilling}
                onChange={(e) => handleItemClaimToggle(item.itemId, 'claimPreparation', e.target.checked, idx)}
              />
              調製
            </label>
            <label>
              <input
                type="checkbox"
                checked={item.claimManagement !== false}
                disabled={!canEditBilling}
                onChange={(e) => handleItemClaimToggle(item.itemId, 'claimManagement', e.target.checked, idx)}
              />
              薬管
            </label>
            <label>
              <input
                type="checkbox"
                checked={item.isDiagnosticTest || false}
                disabled={!canEditBilling}
                onChange={(e) => handleItemClaimToggle(item.itemId, 'isDiagnosticTest', e.target.checked, idx)}
              />
              検査薬
            </label>
            {item.isHighRisk && (
              <select
                value={item.tokkanType || 'none'}
                onChange={(e) => handleTokkanChange(item.itemId, e.target.value, idx)}
                disabled={!canEditBilling}
              >
                <option value="none">特定薬剤: なし</option>
                <option value="1">加算1 (10点)</option>
                <option value="3_i">加算3イ (5点)</option>
              </select>
            )}
            <input
              type="text"
              placeholder="剤グループ"
              value={item.billingAgentGroupKey || ''}
              disabled={!canEditBilling}
              onChange={(e) => handleBillingAgentOverrideLocalChange(item.itemId, 'billingAgentGroupKey', e.target.value, idx)}
              onBlur={() => persistBillingAgentOverride(item.itemId, idx)}
              className="input-agent-group"
            />
            <input
              type="text"
              placeholder="摘要コメント"
              value={remarks[item.itemId] ?? (item.receiptRemark || '')}
              disabled={!canEditBilling}
              onChange={(e) => handleReceiptRemarkChange(item.itemId, e.target.value, idx)}
              className="input-receipt-remark"
            />
          </div>
        </div>
      ))}

      <style jsx>{`
        .drug-info-claim-tools {
          width: 100%;
          max-width: 210mm;
          margin-top: 0.85rem;
          display: grid;
          gap: 0.55rem;
          align-self: center;
        }

        .drug-info-claim-row {
          display: grid;
          grid-template-columns: minmax(160px, 0.8fr) minmax(0, 2.2fr);
          gap: 0.75rem;
          align-items: center;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          background: #ffffff;
          padding: 0.65rem;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .drug-info-claim-row > strong {
          min-width: 0;
          color: #111827;
          font-size: 0.84rem;
          line-height: 1.4;
        }

        .drug-info-control-panel {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .drug-info-control-panel label {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          color: #334155;
          font-size: 0.76rem;
          font-weight: 700;
        }

        .drug-info-control-panel input.input-agent-group,
        .input-agent-group {
          width: 80px;
          font-size: 0.75rem;
          padding: 2px 4px;
        }

        .drug-info-control-panel input.input-receipt-remark,
        .input-receipt-remark {
          width: 120px;
          font-size: 0.75rem;
          padding: 2px 4px;
        }

        @media print {
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
});
