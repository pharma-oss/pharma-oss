import React from 'react';
import { Droplets } from 'lucide-react';
import type { PharmacyInfo } from '../types';
import {
  getDisplayDrugName,
  getAmountText,
  getTotalAmountText
} from '../helpers';

export interface LiquidLabelSheetPrintProps {
  patientData: any;
  liquidItems: any[];
  pharmacyInfo: PharmacyInfo;
  pharmacyAddressLine: string;
  currentDateStr: string;
  renderIdentityMark: (variant?: 'paper' | 'compact' | 'tiny') => React.ReactNode;
}

export const LiquidLabelSheetPrint = React.memo(function LiquidLabelSheetPrint({
  patientData,
  liquidItems,
  pharmacyInfo,
  pharmacyAddressLine,
  currentDateStr,
  renderIdentityMark
}: LiquidLabelSheetPrintProps) {
  if (liquidItems.length === 0) return null;

  return (
    <section className="print-preview-card card paper-preview-card">
      <div className="preview-header no-print">
        <h3><Droplets size={18} aria-hidden="true" /> 水剤ラベル</h3>
      </div>

      <div className="print-document label-sheet" data-testid="liquid-label-sheet-doc">
        {liquidItems.map((item) => (
          <div className="bottle-label liquid-label" key={`liquid-${item.itemId}`}>
            <div className="label-head">
              <div className="label-title">水剤</div>
              {renderIdentityMark('tiny')}
            </div>
            <div className="label-patient">{patientData.name} 様</div>
            <div className="label-drug">{getDisplayDrugName(item)}</div>
            <div className="label-usage">{item.usage || '用法未設定'}</div>
            <div className="label-dose-grid">
              <div>
                <span>全量</span>
                <strong>{getTotalAmountText(item)}</strong>
              </div>
              <div>
                <span>1日量</span>
                <strong>{getAmountText(item)}</strong>
              </div>
              <div>
                <span>日数</span>
                <strong>{item.days ? `${item.days}日分` : '-'}</strong>
              </div>
            </div>
            <div className="label-warning">使用前によく振り、量を確認してください</div>
            <div className="label-footer">
              <strong>{pharmacyInfo.name}</strong>
              <span>{pharmacyAddressLine} / TEL: {pharmacyInfo.phone}</span>
              <span>調剤薬剤師: {pharmacyInfo.pharmacistName} / {currentDateStr}</span>
            </div>
          </div>
        ))}
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

        .label-sheet {
          width: 210mm;
          min-height: 297mm;
          background: white;
          padding: 10mm;
          border: 1px solid #111;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          box-sizing: border-box;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8mm;
          align-content: start;
          font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
          color: #111;
        }

        .bottle-label {
          border: 1px dashed #cbd5e1;
          border-radius: 6px;
          padding: 0.6rem 0.8rem;
          background: #ffffff;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .label-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 0.25rem;
        }

        .label-title {
          font-size: 0.75rem;
          font-weight: 800;
          padding: 0.1rem 0.4rem;
          background: #dbeafe;
          color: #1e40af;
          border-radius: 3px;
        }

        .label-patient {
          font-size: 0.95rem;
          font-weight: 900;
          color: #0f172a;
        }

        .label-drug {
          font-size: 0.95rem;
          font-weight: 800;
          color: #1e293b;
        }

        .label-usage {
          font-size: 0.82rem;
          font-weight: 700;
          color: #0f172a;
        }

        .label-dose-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.4rem;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 0.25rem 0.4rem;
        }

        .label-dose-grid span {
          display: block;
          font-size: 0.6rem;
          color: #64748b;
        }

        .label-dose-grid strong {
          display: block;
          font-size: 0.8rem;
          color: #0f172a;
        }

        .label-warning {
          font-size: 0.62rem;
          color: #b45309;
          background: #fef3c7;
          border-radius: 3px;
          padding: 0.15rem 0.35rem;
          font-weight: 700;
        }

        .label-footer {
          border-top: 1px solid #f1f5f9;
          padding-top: 0.25rem;
          font-size: 0.58rem;
          color: #64748b;
          display: flex;
          flex-direction: column;
          gap: 0.05rem;
        }

        .label-footer strong {
          color: #334155;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          .paper-preview-card {
            border: none;
            padding: 0;
            background: none;
          }
          .label-sheet {
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
