import React from 'react';
import { FileText } from 'lucide-react';
import { formatYen } from '@/lib/billing';
import type { PharmacyInfo } from '../types';

export interface ReceiptPrintProps {
  patientData: any;
  totalPoints: number;
  insuranceAmounts: {
    burdenRatio: number;
    totalCostYen: number;
    insurerBurdenYen: number;
    patientCopayYen: number;
  };
  receiptBreakdownRows: {
    label: string;
    points: number;
    note: string;
  }[];
  pharmacyInfo: PharmacyInfo;
  pharmacyAddressLine: string;
  receiptRunId: string;
  currentDateStr: string;
  dispensingDateStr: string;
  prescriptionDateStr: string;
  renderIdentityMark: (variant?: 'paper' | 'compact' | 'tiny') => React.ReactNode;
}

export const ReceiptPrint = React.memo(function ReceiptPrint({
  patientData,
  totalPoints,
  insuranceAmounts,
  receiptBreakdownRows,
  pharmacyInfo,
  pharmacyAddressLine,
  receiptRunId,
  currentDateStr,
  dispensingDateStr,
  prescriptionDateStr,
  renderIdentityMark
}: ReceiptPrintProps) {
  return (
    <section className="print-preview-card card paper-preview-card receipt-preview-card">
      <div className="preview-header no-print">
        <h3><FileText size={18} aria-hidden="true" /> 領収証</h3>
      </div>

      <div className="print-document receipt-doc receipt-redesign-doc" data-testid="receipt-doc">
        <div className="receipt-copy-band">
          <span>患者様控</span>
          <strong>No. {receiptRunId}</strong>
          <span>発行日 {currentDateStr}</span>
        </div>

        <div className="receipt-redesign-titlebar">
          <div>
            <span>保険調剤</span>
            <h2>領収証</h2>
          </div>
          {renderIdentityMark('compact')}
        </div>

        <div className="receipt-payee-line">
          <span>氏名</span>
          <strong>{patientData.name} 様</strong>
        </div>

        <div className="receipt-money-panel">
          <span>領収金額</span>
          <strong>¥{formatYen(insuranceAmounts.patientCopayYen)}</strong>
          <p>ただし、保険調剤一部負担金として上記正に領収いたしました。</p>
        </div>

        <div className="receipt-accounting-strip">
          <div>
            <span>総点数</span>
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
          <div>
            <span>患者負担割合</span>
            <strong>{insuranceAmounts.burdenRatio}%</strong>
          </div>
        </div>

        <table className="receipt-redesign-table">
          <thead>
            <tr>
              <th>費用区分</th>
              <th>点数</th>
              <th>摘要</th>
            </tr>
          </thead>
          <tbody>
            {receiptBreakdownRows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className="text-right">{row.points.toLocaleString()} 点</td>
                <td>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="receipt-office-grid">
          <div className="receipt-office-info">
            <strong>{pharmacyInfo.name}</strong>
            <span>{pharmacyAddressLine}</span>
            <span>TEL: {pharmacyInfo.phone}</span>
            {pharmacyInfo.code ? <span>保険薬局コード: {pharmacyInfo.code}</span> : null}
            <span>登録番号: {pharmacyInfo.registrationNumber}</span>
          </div>
          <div className="receipt-seal-box">領収印</div>
        </div>

        <div className="receipt-stub">
          <span>薬局控え</span>
          <strong>{patientData.name} 様 / ¥{formatYen(insuranceAmounts.patientCopayYen)}</strong>
          <span>処方日 {prescriptionDateStr} / 調剤日 {dispensingDateStr}</span>
        </div>

        <p className="receipt-note">保険診療等には、医療機関等が仕入れ時に負担する消費税が反映されています。</p>
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

        .receipt-doc {
          width: 148mm;
          max-width: 100%;
          min-height: 210mm;
          background: white;
          padding: 10mm 11mm;
          font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
          color: #111;
          border: 1px solid #111;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          box-sizing: border-box;
          position: relative;
        }

        .receipt-copy-band {
          display: flex;
          justify-content: space-between;
          font-size: 0.72rem;
          color: #6b7280;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 0.35rem;
          margin-bottom: 0.6rem;
        }

        .receipt-copy-band strong {
          font-family: monospace;
          color: #111827;
        }

        .receipt-redesign-titlebar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #111827;
          padding-bottom: 0.5rem;
          margin-bottom: 0.75rem;
        }

        .receipt-redesign-titlebar span {
          font-size: 0.72rem;
          color: #6b7280;
          font-weight: 700;
        }

        .receipt-redesign-titlebar h2 {
          margin: 0;
          font-size: 1.4rem;
          font-weight: 900;
          color: #111827;
        }

        .receipt-payee-line {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
          border-bottom: 1px solid #d1d5db;
          padding-bottom: 0.35rem;
          margin-bottom: 0.75rem;
        }

        .receipt-payee-line span {
          font-size: 0.75rem;
          color: #6b7280;
          width: 40px;
        }

        .receipt-payee-line strong {
          font-size: 1.1rem;
          color: #111827;
        }

        .receipt-money-panel {
          background: #f0fdf4;
          border: 2px solid #16a34a;
          border-radius: 6px;
          padding: 0.75rem;
          text-align: center;
          margin-bottom: 1rem;
        }

        .receipt-money-panel span {
          display: block;
          font-size: 0.75rem;
          color: #166534;
          font-weight: 700;
        }

        .receipt-money-panel strong {
          display: block;
          font-size: 1.75rem;
          font-weight: 900;
          color: #15803d;
          margin: 0.2rem 0;
        }

        .receipt-money-panel p {
          margin: 0;
          font-size: 0.7rem;
          color: #166534;
        }

        .receipt-accounting-strip {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.4rem;
          border: 1px solid #d1d5db;
          background: #f9fafb;
          padding: 0.5rem;
          margin-bottom: 1rem;
        }

        .receipt-accounting-strip > div span {
          display: block;
          font-size: 0.68rem;
          color: #6b7280;
        }

        .receipt-accounting-strip > div strong {
          display: block;
          font-size: 0.88rem;
          color: #111827;
        }

        .receipt-redesign-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1rem;
          font-size: 0.76rem;
        }

        .receipt-redesign-table th,
        .receipt-redesign-table td {
          border: 1px solid #d1d5db;
          padding: 0.35rem 0.5rem;
        }

        .receipt-redesign-table th {
          background: #f3f4f6;
          font-weight: 700;
          text-align: left;
        }

        .text-right { text-align: right; }

        .receipt-office-grid {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 1rem;
          align-items: center;
          margin-bottom: 0.75rem;
          border-top: 1px solid #e5e7eb;
          padding-top: 0.6rem;
        }

        .receipt-office-info {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          font-size: 0.72rem;
          color: #4b5563;
        }

        .receipt-office-info strong {
          font-size: 0.85rem;
          color: #111827;
        }

        .receipt-seal-box {
          width: 48px;
          height: 48px;
          border: 1px dashed #9ca3af;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          color: #9ca3af;
        }

        .receipt-stub {
          border-top: 1px dashed #9ca3af;
          padding-top: 0.5rem;
          margin-top: 0.5rem;
          display: flex;
          justify-content: space-between;
          font-size: 0.68rem;
          color: #6b7280;
        }

        .receipt-stub strong {
          color: #111827;
        }

        .receipt-note {
          margin: 0.4rem 0 0;
          font-size: 0.62rem;
          color: #9ca3af;
          text-align: center;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          .receipt-preview-card {
            border: none;
            padding: 0;
            background: none;
          }
          .receipt-doc {
            border: none;
            box-shadow: none;
            page-break-after: always;
          }
        }
      `}</style>
    </section>
  );
});
