import React from 'react';
import { BookOpen, AlertTriangle } from 'lucide-react';
import { DrugInfoItemCard } from './DrugInfoItemCard';
import { DrugInfoClaimTools } from './DrugInfoClaimTools';
import { COMMON_RECEIPT_REMARKS } from '@/lib/data/receipt_remarks';
import type { MedicationInfoPrintContent } from '@/lib/patient_medication_info';
import type { PharmacyInfo } from '../types';
import type { DrugPriceRevisionChoice } from '@/lib/drug_price_history';

export interface DrugInfoPrintProps {
  patientData: any;
  visitData: any;
  prescriptionItems: any[];
  pharmacyInfo: PharmacyInfo;
  pharmacyAddressLine: string;
  receiptRunId: string;
  patientBirthDateStr: string;
  dispensingDateStr: string;
  prescriptionDateStr: string;
  medicationInfoFallbackCount: number;
  getMedicationInfoContent: (item: any) => MedicationInfoPrintContent;
  canEditBilling: boolean;
  remarks: Record<string, string>;
  renderIdentityMark: (variant?: 'paper' | 'compact' | 'tiny') => React.ReactNode;
  handleToggleIppoka: (itemId: string, checked: boolean, idx: number) => Promise<void>;
  handleToggleCrushed: (itemId: string, checked: boolean, idx: number) => Promise<void>;
  handleItemClaimToggle: (itemId: string, field: string, checked: boolean, idx: number) => Promise<void>;
  dispensingDateForPrice: string;
  drugPriceChoicesByItemId: Record<string, DrugPriceRevisionChoice[]>;
  drugPriceWarningByItemId: Record<string, string>;
  handleDrugPriceOverrideChange: (itemId: string, effectiveFrom: string, idx: number) => Promise<void>;
  handleTokkanChange: (itemId: string, value: string, idx: number) => Promise<void>;
  handleReceiptRemarkChange: (itemId: string, value: string, idx: number) => void;
  handleBillingAgentOverrideLocalChange: (itemId: string, field: string, value: string, idx: number) => void;
  persistBillingAgentOverride: (itemId: string, idx: number) => Promise<void>;
}

export const DrugInfoPrint = React.memo(function DrugInfoPrint({
  patientData,
  visitData,
  prescriptionItems,
  pharmacyInfo,
  pharmacyAddressLine,
  receiptRunId,
  patientBirthDateStr,
  dispensingDateStr,
  prescriptionDateStr,
  medicationInfoFallbackCount,
  getMedicationInfoContent,
  canEditBilling,
  remarks,
  renderIdentityMark,
  handleToggleIppoka,
  handleToggleCrushed,
  handleItemClaimToggle,
  dispensingDateForPrice,
  drugPriceChoicesByItemId,
  drugPriceWarningByItemId,
  handleDrugPriceOverrideChange,
  handleTokkanChange,
  handleReceiptRemarkChange,
  handleBillingAgentOverrideLocalChange,
  persistBillingAgentOverride
}: DrugInfoPrintProps) {
  return (
    <section className="print-preview-card card paper-preview-card">
      <div className="preview-header no-print">
        <div>
          <h3><BookOpen size={18} aria-hidden="true" /> 薬剤情報提供文書</h3>
        </div>
      </div>

      {medicationInfoFallbackCount > 0 && (
        <div className="fallback-alert no-print" role="alert" data-testid="medication-info-fallback-alert">
          <AlertTriangle size={17} aria-hidden="true" />
          承認済み薬情がない薬剤 {medicationInfoFallbackCount}件。定型文で印刷されます。
        </div>
      )}

      <div className="print-document yakujo-doc drug-info-doc" data-testid="drug-info-doc">
        <div className="drug-info-titlebar">
          <div>
            <div className="doc-title">薬剤情報提供文書</div>
            <div className="doc-submeta">処方日 {prescriptionDateStr} / 調剤日 {dispensingDateStr}</div>
          </div>
          <div className="drug-info-stamp-stack">
            {renderIdentityMark('compact')}
            <div className="drug-info-pharmacy-stamp">
              <strong>{pharmacyInfo.name}</strong>
              <span>担当 {pharmacyInfo.pharmacistName}</span>
            </div>
          </div>
        </div>

        <div className="drug-info-patient-line">
          <strong>{patientData.name} 様</strong>
          <span>生年月日 {patientBirthDateStr}</span>
          <span>処方元 {visitData.institutionName || visitData.institutionId || '未設定'}</span>
          <span>受付番号 {receiptRunId}</span>
        </div>

        <div className="drug-info-list">
          {prescriptionItems.length > 0 ? (
            prescriptionItems.map((item, idx) => (
              <DrugInfoItemCard
                key={item.itemId}
                item={item}
                idx={idx}
                medicationInfo={getMedicationInfoContent(item)}
                canEditBilling={canEditBilling}
                remarks={remarks}
                drugPriceChoices={drugPriceChoicesByItemId[item.itemId]}
                drugPriceWarning={drugPriceWarningByItemId[item.itemId]}
                dispensingDateForPrice={dispensingDateForPrice}
                handleToggleIppoka={handleToggleIppoka}
                handleToggleCrushed={handleToggleCrushed}
                handleItemClaimToggle={handleItemClaimToggle}
                handleTokkanChange={handleTokkanChange}
                handleDrugPriceOverrideChange={handleDrugPriceOverrideChange}
                handleReceiptRemarkChange={handleReceiptRemarkChange}
                handleBillingAgentOverrideLocalChange={handleBillingAgentOverrideLocalChange}
                persistBillingAgentOverride={persistBillingAgentOverride}
              />
            ))
          ) : (
            <div className="drug-info-empty">処方データがありません</div>
          )}
          <datalist id="receipt-remarks-list">
            {COMMON_RECEIPT_REMARKS.map((rm) => (
              <option key={rm.code} value={`${rm.code} ${rm.label}`} />
            ))}
          </datalist>
        </div>

        <div className="drug-info-bottom-note">
          <strong>ご注意</strong>
          <span>体調の変化、飲み合わせ、飲み忘れで迷う場合は、服用前に薬剤師へご相談ください。</span>
        </div>

        <div className="doc-footer drug-info-footer">
          <div className="pharmacy-info">
            <strong>{pharmacyInfo.name}</strong><br/>
            {pharmacyAddressLine}<br/>
            TEL: {pharmacyInfo.phone}<br/>
            調剤薬剤師: {pharmacyInfo.pharmacistName}
          </div>
          <div className="pharmacist-seal-box">印</div>
        </div>
      </div>

      <DrugInfoClaimTools
        prescriptionItems={prescriptionItems}
        canEditBilling={canEditBilling}
        remarks={remarks}
        handleToggleIppoka={handleToggleIppoka}
        handleToggleCrushed={handleToggleCrushed}
        handleItemClaimToggle={handleItemClaimToggle}
        handleTokkanChange={handleTokkanChange}
        handleBillingAgentOverrideLocalChange={handleBillingAgentOverrideLocalChange}
        persistBillingAgentOverride={persistBillingAgentOverride}
        handleReceiptRemarkChange={handleReceiptRemarkChange}
      />

      <style jsx>{`
        .paper-preview-card {
          align-items: center;
          overflow-x: auto;
          background:
            linear-gradient(90deg, rgba(226, 232, 240, 0.7) 1px, transparent 1px),
            linear-gradient(rgba(226, 232, 240, 0.7) 1px, transparent 1px),
            #f7f8fb;
          background-size: 16px 16px;
          padding: 1.25rem;
        }

        .preview-header {
          align-self: stretch;
          margin-bottom: 1rem;
        }

        .preview-header h3 {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1rem;
          color: var(--text-main);
        }

        .fallback-alert {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0 1rem 0.75rem;
          padding: 0.65rem 0.75rem;
          border: 1px solid #d97706;
          border-radius: 8px;
          color: #92400e;
          background: #fffbeb;
          font-weight: 700;
          font-size: 0.84rem;
        }

        .yakujo-doc {
          width: 210mm;
          max-width: 100%;
          min-height: 297mm;
          max-height: 297mm;
          height: 297mm;
          padding: 11mm 13mm;
          font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
          background: white;
          color: #111;
          border: 1px solid #b7b7b7;
          box-shadow: 0 14px 34px rgba(15, 23, 42, 0.16);
          box-sizing: border-box;
          overflow: hidden;
        }

        .drug-info-doc {
          font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
        }

        .drug-info-titlebar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 68mm;
          gap: 6mm;
          align-items: start;
          border-bottom: 2px solid #111;
          padding-bottom: 3.5mm;
          margin-bottom: 3.5mm;
        }

        .doc-title {
          font-size: 1.45rem;
          font-weight: bold;
          color: #111;
        }

        .doc-submeta {
          font-size: 0.75rem;
          color: #444;
          margin-top: 0.2rem;
        }

        .drug-info-stamp-stack {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 2.5mm;
          align-items: stretch;
        }

        .drug-info-pharmacy-stamp {
          border: 1px solid #222;
          padding: 2.4mm;
          min-height: 11mm;
          font-size: 0.7rem;
          line-height: 1.4;
        }

        .drug-info-pharmacy-stamp strong,
        .drug-info-pharmacy-stamp span {
          display: block;
        }

        .drug-info-patient-line {
          display: grid;
          grid-template-columns: 1.1fr 0.85fr 1.45fr 0.85fr;
          gap: 0;
          border: 1px solid #222;
          margin-bottom: 4mm;
          font-size: 0.72rem;
        }

        .drug-info-patient-line strong,
        .drug-info-patient-line span {
          padding: 1.8mm 2mm;
          border-right: 1px solid #222;
        }

        .drug-info-patient-line span:last-child {
          border-right: none;
        }

        .drug-info-list {
          display: grid;
          gap: 2.8mm;
        }

        .drug-info-empty {
          padding: 8mm;
          text-align: center;
          color: #666;
          font-size: 0.85rem;
        }

        .drug-info-bottom-note {
          border: 1px solid #111;
          padding: 1.8mm 2.5mm;
          margin: 3mm 0;
          font-size: 0.7rem;
          display: flex;
          gap: 2mm;
        }

        .doc-footer.drug-info-footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          border-top: 1px solid #111;
          padding-top: 2.5mm;
          font-size: 0.72rem;
        }

        .pharmacist-seal-box {
          width: 14mm;
          height: 14mm;
          border: 1px solid #111;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          .paper-preview-card {
            background: none !important;
            padding: 0 !important;
            border: none !important;
          }
          .yakujo-doc {
            box-shadow: none !important;
            border: none !important;
            page-break-after: always !important;
          }
        }
      `}</style>
    </section>
  );
});
