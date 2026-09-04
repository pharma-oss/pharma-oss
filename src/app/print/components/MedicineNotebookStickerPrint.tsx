import React from 'react';
import { BookOpen } from 'lucide-react';
import type { PharmacyInfo } from '../types';
import {
  getDisplayDrugName,
  getAmountLabel,
  getAmountText,
  getTimingBadges
} from '../helpers';

export interface MedicineNotebookStickerPrintProps {
  patientData: any;
  prescriptionItems: any[];
  pharmacyInfo: PharmacyInfo;
  dispensingDateStr: string;
  renderIdentityMark: (variant?: 'paper' | 'compact' | 'tiny') => React.ReactNode;
}

export const MedicineNotebookStickerPrint = React.memo(function MedicineNotebookStickerPrint({
  patientData,
  prescriptionItems,
  pharmacyInfo,
  dispensingDateStr,
  renderIdentityMark
}: MedicineNotebookStickerPrintProps) {
  return (
    <section className="print-preview-card card paper-preview-card">
      <div className="preview-header no-print">
        <h3><BookOpen size={18} aria-hidden="true" /> お薬手帳シール</h3>
      </div>

      <div className="print-document sticker-sheet" data-testid="medicine-notebook-sticker-doc">
        {prescriptionItems.map((item, index) => (
          <div className="handbook-sticker" key={`sticker-${item.itemId}`}>
            <div className="sticker-head">
              <div>
                <strong>{patientData.name} 様</strong>
                <span>調剤日 {dispensingDateStr} / Rp {item.rpNumber || index + 1}</span>
              </div>
              {renderIdentityMark('tiny')}
            </div>
            <div className="sticker-drug">{getDisplayDrugName(item)}</div>
            <div className="sticker-dose-panel">
              <div>
                <span>{getAmountLabel(item)}</span>
                <strong>{getAmountText(item)}</strong>
              </div>
              <div>
                <span>日数</span>
                <strong>{item.days ? `${item.days}日分` : '-'}</strong>
              </div>
            </div>
            <div className="sticker-usage">{item.usage || '用法未設定'}</div>
            <div className="sticker-timing-row">
              {(getTimingBadges(item.usage).length > 0 ? getTimingBadges(item.usage) : ['指示どおり']).map((badge) => (
                <span key={`sticker-${item.itemId}-${badge}`}>{badge}</span>
              ))}
            </div>
            <div className="sticker-footer">
              <strong>{pharmacyInfo.name}</strong>
              <span>{pharmacyInfo.phone} / 担当 {pharmacyInfo.pharmacistName}</span>
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

        .sticker-sheet {
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

        .handbook-sticker {
          border: 1px dashed #cbd5e1;
          border-radius: 6px;
          padding: 0.6rem 0.8rem;
          background: #ffffff;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .sticker-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 0.3rem;
        }

        .sticker-head strong {
          display: block;
          font-size: 0.95rem;
          color: #0f172a;
        }

        .sticker-head span {
          display: block;
          font-size: 0.65rem;
          color: #64748b;
        }

        .sticker-drug {
          font-size: 1rem;
          font-weight: 800;
          color: #1e293b;
        }

        .sticker-dose-panel {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.4rem;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 0.3rem 0.5rem;
        }

        .sticker-dose-panel span {
          display: block;
          font-size: 0.6rem;
          color: #64748b;
        }

        .sticker-dose-panel strong {
          display: block;
          font-size: 0.85rem;
          color: #0f172a;
        }

        .sticker-usage {
          font-size: 0.85rem;
          font-weight: 700;
          color: #0f172a;
        }

        .sticker-timing-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem;
        }

        .sticker-timing-row span {
          font-size: 0.65rem;
          font-weight: 700;
          padding: 0.1rem 0.35rem;
          background: #eff6ff;
          color: #1d4ed8;
          border-radius: 3px;
          border: 1px solid #bfdbfe;
        }

        .sticker-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.62rem;
          color: #64748b;
          border-top: 1px solid #f1f5f9;
          padding-top: 0.3rem;
          margin-top: 0.2rem;
        }

        .sticker-footer strong {
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
          .sticker-sheet {
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
