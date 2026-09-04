import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { MedicationInfoPrintContent } from '@/lib/patient_medication_info';
import {
  drugPriceOverrideValue,
  formatDrugPriceRevisionLabel,
  type DrugPriceRevisionChoice
} from '@/lib/drug_price_history';
import {
  getDisplayDrugName,
  getPrescribedDrugName,
  getAmountText,
  getFormulationLabel,
  getDrugShapeClass,
  getTimingBadges,
  getMedicationFlags,
  getPickingEvidence
} from '../helpers';

export function hasPrescriptionChange(item: {
  drugName?: string;
  prescribedDrugName?: string;
  genericName?: string;
  dispensedDrug?: string;
  drugId?: string;
}): boolean {
  return getDisplayDrugName(item) !== getPrescribedDrugName(item);
}

export function formatDaysText(days: number | string | undefined | null): string {
  return days ? `${days}日分` : '-';
}

export function formatUsageText(usage: string | undefined | null): string {
  return usage || '用法未設定';
}

export function formatMedicationSourceText(medicationInfo: { source?: string; sourceRevisionDate?: string }): string {
  return medicationInfo.source === 'approved_template'
    ? `薬局確認済み情報（参照版日 ${medicationInfo.sourceRevisionDate}）`
    : '詳しい薬剤情報は薬剤師へ確認してください';
}

export interface DrugInfoItemCardProps {
  item: any;
  idx: number;
  medicationInfo: MedicationInfoPrintContent;
  canEditBilling: boolean;
  remarks: Record<string, string>;
  drugPriceChoices?: DrugPriceRevisionChoice[];
  drugPriceWarning?: string;
  dispensingDateForPrice?: string;
  handleToggleIppoka: (itemId: string, checked: boolean, idx: number) => Promise<void>;
  handleToggleCrushed: (itemId: string, checked: boolean, idx: number) => Promise<void>;
  handleItemClaimToggle: (itemId: string, field: string, checked: boolean, idx: number) => Promise<void>;
  handleTokkanChange: (itemId: string, value: string, idx: number) => Promise<void>;
  handleDrugPriceOverrideChange: (itemId: string, effectiveFrom: string, idx: number) => Promise<void>;
  handleReceiptRemarkChange: (itemId: string, value: string, idx: number) => void;
  handleBillingAgentOverrideLocalChange: (itemId: string, field: string, value: string, idx: number) => void;
  persistBillingAgentOverride: (itemId: string, idx: number) => Promise<void>;
}

export const DrugInfoItemCard = React.memo(function DrugInfoItemCard({
  item,
  idx,
  medicationInfo,
  canEditBilling,
  remarks,
  drugPriceChoices = [],
  drugPriceWarning,
  dispensingDateForPrice,
  handleToggleIppoka,
  handleToggleCrushed,
  handleItemClaimToggle,
  handleTokkanChange,
  handleDrugPriceOverrideChange,
  handleReceiptRemarkChange,
  handleBillingAgentOverrideLocalChange,
  persistBillingAgentOverride
}: DrugInfoItemCardProps) {
  const isChanged = hasPrescriptionChange(item);

  return (
    <section className={`drug-info-row drug-info-card ${item.isHighRisk ? 'high-risk' : ''}`} key={item.itemId}>
      <div className="drug-info-med-header">
        <div className="drug-appearance-cell">
          <span className={`drug-shape ${getDrugShapeClass(item)}`} aria-hidden="true"></span>
          <small>{getFormulationLabel(item)}</small>
        </div>

        <div className="drug-info-med-title">
          <span>お薬 {idx + 1}</span>
          <strong>{getDisplayDrugName(item)}</strong>
        </div>

        <div className="drug-info-flag-list">
          {getMedicationFlags(item).length > 0 ? (
            getMedicationFlags(item).map((flag) => (
              <span key={`${item.itemId}-${flag}`}>{flag}</span>
            ))
          ) : (
            <span>通常薬</span>
          )}
        </div>
      </div>

      {isChanged && (
        <p className="drug-info-change">
          処方: {getPrescribedDrugName(item)}
          {item.changeReason ? ` / 変更理由: ${item.changeReason}` : ''}
        </p>
      )}

      <div className="drug-info-counseling-grid">
        <div className="drug-info-usage-hero">
          <span>使い方</span>
          <strong>{formatUsageText(item.usage)}</strong>
          <div className="drug-info-timing-row">
            {(getTimingBadges(item.usage).length > 0 ? getTimingBadges(item.usage) : ['指示どおり']).map((badge) => (
              <em key={`${item.itemId}-timing-${badge}`}>{badge}</em>
            ))}
          </div>
        </div>
        <div className="drug-info-fact">
          <span>1日量</span>
          <strong>{getAmountText(item)}</strong>
        </div>
        <div className="drug-info-fact">
          <span>日数</span>
          <strong>{formatDaysText(item.days)}</strong>
        </div>
      </div>

      <div className="drug-info-safety-grid">
        <div>
          <span>副作用・相談目安</span>
          <p>{medicationInfo.sideEffectText}</p>
        </div>
        <div>
          <span>使用上の注意</span>
          <p>{medicationInfo.usageCautionText}</p>
        </div>
      </div>

      <div className="drug-info-source-line">
        <div>
          <span>
            {formatMedicationSourceText(medicationInfo)}
          </span>
          <small>{getPickingEvidence(item)}</small>
        </div>
        {medicationInfo.officialSearchUrl && (
          <a href={medicationInfo.officialSearchUrl} target="_blank" rel="noreferrer" className="no-print">
            PMDAで公式情報を確認
          </a>
        )}
      </div>

      <div className="drug-info-control-panel paper-embedded-control no-print">
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

        {drugPriceChoices.length > 0 && (
          <select
            className="drug-price-revision-select"
            data-testid={`drug-price-revision-${item.itemId}`}
            value={drugPriceOverrideValue(item.drugPriceOverride)}
            onChange={(e) => handleDrugPriceOverrideChange(item.itemId, e.target.value, idx)}
            disabled={!canEditBilling}
            title={`調剤日 ${dispensingDateForPrice || '不明'} 時点の薬価で算定します`}
          >
            <option value="">薬価: 調剤日時点（自動）</option>
            {drugPriceChoices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                薬価: {choice.price}円（{formatDrugPriceRevisionLabel(choice.effectiveFrom)}）
                {choice.isAutoSelected ? ' ※調剤日時点' : ''}
              </option>
            ))}
          </select>
        )}

        <input
          type="text"
          list="receipt-remarks-list"
          placeholder="レセ適"
          value={remarks[item.itemId] ?? item.receiptRemark ?? ''}
          onChange={(e) => handleReceiptRemarkChange(item.itemId, e.target.value, idx)}
          disabled={!canEditBilling}
        />
        <label className="agent-override-field">
          <span>剤</span>
          <input
            type="text"
            placeholder="剤キー"
            maxLength={50}
            value={item.billingAgentGroupKey || ''}
            onChange={(e) => handleBillingAgentOverrideLocalChange(item.itemId, 'billingAgentGroupKey', e.target.value, idx)}
            onBlur={() => persistBillingAgentOverride(item.itemId, idx)}
            disabled={!canEditBilling}
          />
        </label>
      </div>

      {drugPriceWarning && (
        <p
          className="drug-price-override-warning no-print"
          data-testid={`drug-price-override-warning-${item.itemId}`}
          role="status"
        >
          <AlertTriangle size={14} aria-hidden="true" />
          {drugPriceWarning}
        </p>
      )}

      <style jsx>{`
        .paper-embedded-control {
          display: none;
        }

        .drug-info-row.drug-info-card {
          display: block;
          border: 1.5px solid #111;
          padding: 0;
          page-break-inside: avoid;
        }

        .drug-info-row.drug-info-card.high-risk {
          border-left: 5px solid #b91c1c;
        }

        .drug-info-med-header {
          display: grid;
          grid-template-columns: 23mm minmax(0, 1fr) auto;
          gap: 3mm;
          align-items: stretch;
          border-bottom: 1px solid #111;
          background: #f8fafc;
        }

        .drug-appearance-cell,
        .drug-info-card .drug-appearance-cell {
          min-height: 24mm;
          border-right: 1px solid #111;
          background: #fff;
          padding: 2.5mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2.5mm;
          text-align: center;
        }

        .drug-appearance-cell small,
        .drug-info-card .drug-appearance-cell small {
          font-size: 0.68rem;
          color: #444;
          font-weight: 700;
        }

        .drug-info-med-title {
          min-width: 0;
          display: grid;
          align-content: center;
          gap: 1mm;
          padding: 2.2mm 0;
        }

        .drug-info-med-title span {
          font-size: 0.72rem;
          color: #6b7280;
          font-weight: 700;
        }

        .drug-info-med-title strong {
          min-width: 0;
          font-size: 1.02rem;
          line-height: 1.25;
        }

        .drug-info-flag-list {
          display: flex;
          align-content: center;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 1.2mm;
          max-width: 38mm;
          padding: 2mm 2.5mm 2mm 0;
        }

        .drug-info-flag-list span {
          border: 1px solid #111;
          background: #fff;
          color: #111;
          font-size: 0.64rem;
          font-style: normal;
          font-weight: 900;
          line-height: 1;
          padding: 1mm 1.7mm;
          white-space: nowrap;
        }

        .drug-info-change,
        .drug-info-card .drug-info-change {
          margin: 0;
          padding: 1.5mm 2.5mm;
          border-bottom: 1px solid #111;
          background: #fff7ed;
          color: #7c2d12;
          font-size: 0.7rem;
        }

        .drug-info-counseling-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 25mm 22mm;
          border-bottom: 1px solid #111;
        }

        .drug-info-counseling-grid > div {
          min-height: 20mm;
          padding: 2.2mm 2.5mm;
          border-right: 1px solid #111;
        }

        .drug-info-counseling-grid > div:last-child {
          border-right: none;
        }

        .drug-info-usage-hero strong {
          display: block;
          margin-top: 1mm;
          font-size: 0.92rem;
          line-height: 1.35;
        }

        .drug-info-timing-row {
          display: flex;
          flex-wrap: wrap;
          gap: 1mm;
          margin-top: 2mm;
        }

        .drug-info-timing-row em {
          border: 1px solid #111;
          background: #fff;
          color: #111;
          font-size: 0.64rem;
          font-style: normal;
          font-weight: 900;
          line-height: 1;
          padding: 1mm 1.7mm;
          white-space: nowrap;
        }

        .drug-info-fact strong {
          display: block;
          margin-top: 1mm;
          font-size: 0.92rem;
        }

        .drug-info-safety-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          border-bottom: 1px solid #111;
        }

        .drug-info-safety-grid > div {
          min-height: 19mm;
          padding: 2mm 2.5mm;
          border-right: 1px solid #111;
        }

        .drug-info-safety-grid > div:last-child {
          border-right: none;
        }

        .drug-info-safety-grid span {
          display: block;
          color: #0f766e;
          font-size: 0.62rem;
          font-weight: 900;
          margin-bottom: 0.8mm;
        }

        .drug-info-safety-grid p {
          margin: 0;
          color: #111;
          font-size: 0.68rem;
          line-height: 1.35;
        }

        .drug-info-source-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2mm;
          padding: 1.7mm 2.5mm;
          border-bottom: 1px solid #111;
          background: #f8fafc;
        }

        .drug-info-source-line small {
          display: block;
          color: #4b5563;
          font-size: 0.6rem;
          font-weight: 800;
        }

        .drug-info-source-line span {
          margin-bottom: 0;
          color: #334155;
          font-size: 0.62rem;
          font-weight: 900;
        }

        .drug-info-source-line a {
          color: #0f766e;
          font-size: 0.66rem;
          font-weight: 900;
          text-decoration: underline;
        }

        .drug-shape {
          display: inline-block;
          position: relative;
          width: 17mm;
          height: 10mm;
          background: #fefefe;
          border: 1.5px solid #8792a2;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.9);
        }

        .drug-shape.tablet {
          border-radius: 999px;
        }

        .drug-shape.tablet::after {
          content: "";
          position: absolute;
          inset: 1mm auto 1mm 50%;
          border-left: 1px solid #b9c0ca;
        }

        .drug-shape.high-risk {
          border-color: #b91c1c;
          background: #fff5f5;
        }

        .drug-shape.powder {
          width: 15mm;
          height: 17mm;
          border-radius: 1mm;
          background: linear-gradient(160deg, #ffffff 0 58%, #d8e6f3 59% 100%);
        }

        .drug-shape.liquid {
          width: 12mm;
          height: 20mm;
          border-radius: 2mm 2mm 4mm 4mm;
          background: linear-gradient(#ffffff 0 38%, #bae6fd 39% 100%);
          border-color: #0284c7;
        }

        .drug-shape.ointment {
          width: 20mm;
          height: 8mm;
          border-radius: 999px 2mm 2mm 999px;
          background: linear-gradient(90deg, #dcfce7 0 25%, #ffffff 26% 100%);
          border-color: #15803d;
        }

        @media print {
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </section>
  );
});
