import React from 'react';
import { FileText } from 'lucide-react';
import { formatYen } from '@/lib/billing';
import type { PharmacyInfo } from '../types';
import { getFeeSectionLabel } from '../helpers';

export interface ReceiptStatementPrintProps {
  patientData: any;
  visitData: any;
  calculatedFees: any[];
  totalPoints: number;
  insuranceAmounts: {
    burdenRatio: number;
    totalCostYen: number;
    insurerBurdenYen: number;
    patientCopayYen: number;
  };
  pharmacyInfo: PharmacyInfo;
  pharmacyAddressLine: string;
  receiptRunId: string;
  currentDateStr: string;
  patientBirthDateStr: string;
  dispensingDateStr: string;
  prescriptionDateStr: string;
  renderIdentityMark: (variant?: 'paper' | 'compact' | 'tiny') => React.ReactNode;
}

export const ReceiptStatementPrint = React.memo(function ReceiptStatementPrint({
  patientData,
  visitData,
  calculatedFees,
  totalPoints,
  insuranceAmounts,
  pharmacyInfo,
  pharmacyAddressLine,
  receiptRunId,
  currentDateStr,
  patientBirthDateStr,
  dispensingDateStr,
  prescriptionDateStr,
  renderIdentityMark
}: ReceiptStatementPrintProps) {
  return (
    <section className="print-preview-card card paper-preview-card">
      <div className="preview-header no-print">
        <h3><FileText size={18} aria-hidden="true" /> 調剤明細書</h3>
      </div>

      <div className="print-document yakujo-doc receipt-statement-doc statement-ledger-doc" data-testid="receipt-statement-doc">
        <div className="statement-redesign-header">
          <div className="statement-title-stack">
            <span>保険調剤 / 明細</span>
            <h2>調剤明細書</h2>
            <p>調剤報酬点数、保険診療総額、患者負担額を1枚で確認できる明細です。</p>
          </div>
          <div className="statement-issue-box">
            <span>受付番号</span>
            <strong>{receiptRunId}</strong>
            <small>発行 {currentDateStr}</small>
          </div>
          {renderIdentityMark('compact')}
        </div>

        <div className="statement-redesign-meta">
          <div className="statement-person-block">
            <span>患者</span>
            <strong>{patientData.name} 様</strong>
            <p>患者番号 {patientData.patientId || patientData.id || '-'} / 生年月日 {patientBirthDateStr}</p>
          </div>
          <div>
            <span>処方元</span>
            <strong>{visitData.institutionName || visitData.institutionId || '未設定'}</strong>
            <p>{visitData.departmentName || visitData.departmentId || '診療科未設定'} / {visitData.doctorName || visitData.doctorId || '処方医未設定'}</p>
          </div>
          <div>
            <span>保険</span>
            <strong>{patientData.insuranceInfo?.provider || '未設定'}</strong>
            <p>記号番号 {patientData.insuranceInfo?.number || '未設定'} / 負担割合 {insuranceAmounts.burdenRatio}%</p>
          </div>
        </div>

        <div className="statement-summary-band">
          <div>
            <span>合計点数</span>
            <strong>{totalPoints.toLocaleString()} 点</strong>
          </div>
          <div>
            <span>保険診療総額</span>
            <strong>¥{formatYen(insuranceAmounts.totalCostYen)}</strong>
          </div>
          <div>
            <span>保険者負担相当額</span>
            <strong>¥{formatYen(insuranceAmounts.insurerBurdenYen)}</strong>
          </div>
          <div className="statement-summary-primary">
            <span>患者負担</span>
            <strong>¥{formatYen(insuranceAmounts.patientCopayYen)}</strong>
          </div>
        </div>

        <div className="statement-section-heading">
          <strong>調剤報酬の内訳</strong>
          <span>処方日 {prescriptionDateStr} / 調剤日 {dispensingDateStr}</span>
        </div>

        <table className="statement-fee-ledger">
          <thead>
            <tr>
              <th>区分</th>
              <th>算定項目</th>
              <th>算定根拠</th>
              <th>点数</th>
              <th>コード/摘要</th>
            </tr>
          </thead>
          <tbody>
            {calculatedFees.length > 0 ? (
              calculatedFees.map((fee, idx) => (
                <tr key={`${fee.name}-${idx}`}>
                  <td className="statement-category">{getFeeSectionLabel(fee.code)}</td>
                  <td className="statement-fee-name">{fee.name}</td>
                  <td>{fee.rationale || '-'}</td>
                  <td className="statement-point-cell">{fee.points.toLocaleString()}</td>
                  <td>{fee.receiptFeeCode || fee.receiptRemarks?.map((remark: any) => remark.code).join(' / ') || '-'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="text-center">データがありません</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="statement-confirmation-grid">
          <div>
            <span>薬局</span>
            <strong>{pharmacyInfo.name}</strong>
            <p>{pharmacyAddressLine} / TEL: {pharmacyInfo.phone}</p>
          </div>
          <div>
            <span>確認欄</span>
            <p>点数、負担割合、保険情報、領収金額を確認しました。</p>
          </div>
          <div className="statement-seal-cell">確認印</div>
        </div>

        <div className="statement-footer-note">
          <span>※点数は国が定める調剤報酬点数にもとづきます。疑問点は薬局窓口へお尋ねください。</span>
          <strong>{pharmacyInfo.name}</strong>
        </div>
      </div>

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

        .yakujo-doc {
          width: 210mm;
          min-height: 297mm;
          background: white;
          padding: 15mm;
          font-size: 0.85rem;
          color: #111;
          border: 1px solid #111;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          box-sizing: border-box;
          position: relative;
        }

        .receipt-statement-doc {
          font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
        }

        .statement-redesign-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 1rem;
          border-bottom: 2px solid #111827;
          padding-bottom: 0.75rem;
          margin-bottom: 1rem;
        }

        .statement-title-stack span {
          display: block;
          font-size: 0.75rem;
          color: #6b7280;
          font-weight: 700;
        }

        .statement-title-stack h2 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 900;
          color: #111827;
        }

        .statement-title-stack p {
          margin: 0.2rem 0 0;
          font-size: 0.78rem;
          color: #4b5563;
        }

        .statement-issue-box {
          text-align: right;
          border-right: 1px solid #e5e7eb;
          padding-right: 1rem;
        }

        .statement-issue-box span {
          display: block;
          font-size: 0.72rem;
          color: #6b7280;
        }

        .statement-issue-box strong {
          display: block;
          font-size: 1.05rem;
          font-family: monospace;
          color: #111827;
        }

        .statement-issue-box small {
          display: block;
          font-size: 0.72rem;
          color: #9ca3af;
        }

        .statement-redesign-meta {
          display: grid;
          grid-template-columns: 1.2fr 1fr 1fr;
          gap: 0.75rem;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 0.75rem 1rem;
          margin-bottom: 1rem;
        }

        .statement-redesign-meta > div span {
          display: block;
          font-size: 0.7rem;
          color: #6b7280;
          font-weight: 700;
          margin-bottom: 0.15rem;
        }

        .statement-redesign-meta > div strong {
          display: block;
          font-size: 0.95rem;
          color: #111827;
        }

        .statement-redesign-meta > div p {
          margin: 0.15rem 0 0;
          font-size: 0.75rem;
          color: #4b5563;
        }

        .statement-summary-band {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.5rem;
          border: 1px solid #111827;
          background: #fdfdfd;
          padding: 0.6rem 0.8rem;
          margin-bottom: 1.25rem;
        }

        .statement-summary-band > div span {
          display: block;
          font-size: 0.72rem;
          color: #4b5563;
        }

        .statement-summary-band > div strong {
          display: block;
          font-size: 1.15rem;
          color: #111827;
        }

        .statement-summary-primary {
          background: #f0fdf4;
          border-left: 2px solid #16a34a;
          padding-left: 0.5rem;
        }

        .statement-summary-primary strong {
          color: #15803d !important;
          font-size: 1.3rem !important;
        }

        .statement-section-heading {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          border-bottom: 1px solid #d1d5db;
          padding-bottom: 0.35rem;
          margin-bottom: 0.5rem;
        }

        .statement-section-heading strong {
          font-size: 0.92rem;
          color: #111827;
        }

        .statement-section-heading span {
          font-size: 0.75rem;
          color: #6b7280;
        }

        .statement-fee-ledger {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1.5rem;
          font-size: 0.8rem;
        }

        .statement-fee-ledger th,
        .statement-fee-ledger td {
          border: 1px solid #d1d5db;
          padding: 0.4rem 0.6rem;
          vertical-align: middle;
        }

        .statement-fee-ledger th {
          background: #f3f4f6;
          font-weight: 700;
          color: #374151;
          text-align: left;
        }

        .statement-category {
          font-weight: 700;
          color: #4b5563;
          width: 90px;
          background: #fafafa;
        }

        .statement-fee-name {
          font-weight: 600;
        }

        .statement-point-cell {
          text-align: right;
          font-family: monospace;
          font-weight: 700;
          width: 70px;
        }

        .statement-confirmation-grid {
          display: grid;
          grid-template-columns: 1.5fr 1.5fr auto;
          gap: 1rem;
          border: 1px solid #e5e7eb;
          padding: 0.75rem 1rem;
          background: #f9fafb;
          margin-bottom: 1rem;
          align-items: center;
        }

        .statement-confirmation-grid span {
          display: block;
          font-size: 0.7rem;
          color: #6b7280;
          font-weight: 700;
        }

        .statement-confirmation-grid strong {
          display: block;
          font-size: 0.9rem;
          color: #111827;
        }

        .statement-confirmation-grid p {
          margin: 0.15rem 0 0;
          font-size: 0.75rem;
          color: #4b5563;
        }

        .statement-seal-cell {
          width: 50px;
          height: 50px;
          border: 1px dashed #9ca3af;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.72rem;
          color: #9ca3af;
        }

        .statement-footer-note {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.72rem;
          color: #6b7280;
          border-top: 1px solid #e5e7eb;
          padding-top: 0.5rem;
        }

        .text-center { text-align: center; }

        @media print {
          .no-print {
            display: none !important;
          }
          .paper-preview-card {
            border: none;
            padding: 0;
            background: none;
          }
          .yakujo-doc {
            border: none;
            box-shadow: none;
            padding: var(--print-margin-top, 10mm) 10mm var(--print-margin-bottom, 10mm) 10mm;
            page-break-after: always;
          }
        }
      `}</style>
    </section>
  );
});
