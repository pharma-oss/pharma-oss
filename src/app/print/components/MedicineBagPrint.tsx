import React from 'react';
import { Package } from 'lucide-react';
import type { PharmacyInfo } from '../types';
import {
  getBagKindLabel,
  getBagDaysText,
  getTimingBadges,
  getDisplayDrugName,
  getMedicationFlags,
  getFormulationLabel,
  getAmountText,
  getBagRpComments
} from '../helpers';

export interface MedicineBagPrintProps {
  patientData: any;
  groupedForBags: Record<string, any[]>;
  pharmacyInfo: PharmacyInfo;
  pharmacyAddressLine: string;
  receiptRunId: string;
  dispensingDateStr: string;
  renderIdentityMark: (variant?: 'paper' | 'compact' | 'tiny') => React.ReactNode;
}

export const MedicineBagPrint = React.memo(function MedicineBagPrint({
  patientData,
  groupedForBags,
  pharmacyInfo,
  pharmacyAddressLine,
  receiptRunId,
  dispensingDateStr,
  renderIdentityMark
}: MedicineBagPrintProps) {
  return (
    <section className="print-preview-card card paper-preview-card yakutai-card">
      <div className="preview-header no-print">
        <h3><Package size={18} aria-hidden="true" /> 薬袋</h3>
      </div>

      {Object.entries(groupedForBags).map(([usage, groupItems]) => {
        const isExternalBag = /外用|塗布|貼付|点眼|点鼻|吸入/.test(usage);
        const bagComments = getBagRpComments(groupItems);

        return (
          <div
            className={`print-document yakutai-doc ${isExternalBag ? 'external-bag' : 'internal-bag'}`}
            data-testid="medicine-bag-doc"
            key={`bag-${usage}`}
          >
            <div className="yakutai-ribbon">
              <span>{getBagKindLabel(usage)}</span>
              <strong>おくすり袋</strong>
            </div>

            <div className="yakutai-body">
              <div className="yakutai-topline">
                <span>No. {receiptRunId}</span>
                <span>調剤日 {dispensingDateStr}</span>
                {renderIdentityMark('tiny')}
              </div>

              <div className="yakutai-name-line">
                <span>お名前</span>
                <strong>{patientData.name} 様</strong>
              </div>

              <div className="yakutai-usage-hero">
                <span>使い方</span>
                <strong>{usage}</strong>
                <em>{getBagDaysText(groupItems)}</em>
              </div>

              <div className="yakutai-timing-strip">
                {(getTimingBadges(usage).length > 0 ? getTimingBadges(usage) : [isExternalBag ? '外用' : '指示どおり']).map((badge) => (
                  <span key={`bag-${usage}-${badge}`}>{badge}</span>
                ))}
              </div>

              <div className="yakutai-drug-ledger">
                <div className="yakutai-ledger-head">
                  <span>中のお薬</span>
                  <strong>{groupItems.length} 種</strong>
                </div>
                {groupItems.map((item) => (
                  <div key={item.itemId} className="yakutai-ledger-row">
                    <div>
                      <strong>{getDisplayDrugName(item)}</strong>
                      <span>{getMedicationFlags(item).join(' / ') || getFormulationLabel(item)}</span>
                    </div>
                    <em>1日量 {getAmountText(item)}</em>
                  </div>
                ))}
              </div>

              <div className="yakutai-safety-strip">
                <div>
                  <span>確認</span>
                  <strong>氏名・使い方・日数</strong>
                </div>
                <div>
                  <span>保管</span>
                  <strong>子どもの手の届かない場所</strong>
                </div>
              </div>

              <div className="yakutai-note-lines">
                <span>備考</span>
                {bagComments.length > 0 ? (
                  bagComments.map((comment) => (
                    <strong key={comment}>{comment}</strong>
                  ))
                ) : (
                  <>
                    <i></i>
                    <i></i>
                  </>
                )}
              </div>

              <div className="yakutai-bottom">
                <div className="yakutai-pharmacy">
                  <strong>{pharmacyInfo.name}</strong>
                  <span>{pharmacyAddressLine}</span>
                  <span>TEL: {pharmacyInfo.phone}</span>
                  <span>調剤薬剤師: {pharmacyInfo.pharmacistName}</span>
                </div>
                <div className="yakutai-code-box">
                  <span>薬局コード</span>
                  <strong>{pharmacyInfo.code || '-'}</strong>
                  <small>用法・日数・1日量を確認してください</small>
                </div>
              </div>
            </div>
          </div>
        );
      })}

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
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .yakutai-card {
          align-items: center;
        }

        .preview-header {
          align-self: stretch;
          margin-bottom: 0.5rem;
        }

        .preview-header h3 {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1rem;
          color: var(--text-main);
        }

        .yakutai-doc {
          width: 148mm;
          max-width: 100%;
          min-height: 210mm;
          background: white;
          border: 1px solid #111;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          box-sizing: border-box;
          font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
          color: #111;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .yakutai-ribbon {
          background: #1e3a8a;
          color: white;
          padding: 0.6rem 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .external-bag .yakutai-ribbon {
          background: #0284c7;
        }

        .yakutai-ribbon span {
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        .yakutai-ribbon strong {
          font-size: 1.2rem;
          font-weight: 900;
        }

        .yakutai-body {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          flex: 1;
        }

        .yakutai-topline {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.75rem;
          color: #6b7280;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 0.4rem;
        }

        .yakutai-name-line {
          display: flex;
          align-items: baseline;
          gap: 0.75rem;
          border-bottom: 2px solid #111827;
          padding-bottom: 0.4rem;
        }

        .yakutai-name-line span {
          font-size: 0.8rem;
          color: #6b7280;
          font-weight: 700;
        }

        .yakutai-name-line strong {
          font-size: 1.35rem;
          font-weight: 900;
          color: #111827;
        }

        .yakutai-usage-hero {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 0.6rem 0.8rem;
        }

        .yakutai-usage-hero span {
          display: block;
          font-size: 0.7rem;
          color: #64748b;
          font-weight: 700;
        }

        .yakutai-usage-hero strong {
          display: block;
          font-size: 1.2rem;
          color: #0f172a;
          margin: 0.15rem 0;
        }

        .yakutai-usage-hero em {
          font-style: normal;
          font-size: 0.85rem;
          color: #2563eb;
          font-weight: 700;
        }

        .yakutai-timing-strip {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }

        .yakutai-timing-strip span {
          font-size: 0.72rem;
          font-weight: 700;
          padding: 0.2rem 0.5rem;
          background: #eff6ff;
          color: #1d4ed8;
          border-radius: 4px;
          border: 1px solid #bfdbfe;
        }

        .yakutai-drug-ledger {
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          overflow: hidden;
        }

        .yakutai-ledger-head {
          display: flex;
          justify-content: space-between;
          background: #f1f5f9;
          padding: 0.35rem 0.6rem;
          font-size: 0.72rem;
          color: #475569;
          font-weight: 700;
          border-bottom: 1px solid #e2e8f0;
        }

        .yakutai-ledger-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.4rem 0.6rem;
          border-bottom: 1px solid #f1f5f9;
          font-size: 0.75rem;
        }

        .yakutai-ledger-row:last-child {
          border-bottom: none;
        }

        .yakutai-ledger-row strong {
          display: block;
          color: #0f172a;
        }

        .yakutai-ledger-row span {
          display: block;
          font-size: 0.65rem;
          color: #64748b;
        }

        .yakutai-ledger-row em {
          font-style: normal;
          color: #334155;
          font-weight: 600;
        }

        .yakutai-safety-strip {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
          background: #fffbeb;
          border: 1px solid #fef3c7;
          border-radius: 4px;
          padding: 0.4rem 0.6rem;
          font-size: 0.7rem;
        }

        .yakutai-safety-strip span {
          display: block;
          font-size: 0.62rem;
          color: #92400e;
          font-weight: 700;
        }

        .yakutai-safety-strip strong {
          color: #78350f;
        }

        .yakutai-note-lines {
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 0.4rem 0.6rem;
          min-height: 45px;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .yakutai-note-lines span {
          font-size: 0.65rem;
          color: #64748b;
          font-weight: 700;
        }

        .yakutai-note-lines strong {
          font-size: 0.75rem;
          color: #1e293b;
        }

        .yakutai-note-lines i {
          display: block;
          border-bottom: 1px dashed #cbd5e1;
          height: 12px;
        }

        .yakutai-bottom {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 0.75rem;
          align-items: center;
          border-top: 1px solid #e2e8f0;
          padding-top: 0.5rem;
          margin-top: auto;
        }

        .yakutai-pharmacy {
          font-size: 0.68rem;
          line-height: 1.35;
          color: #475569;
        }

        .yakutai-pharmacy strong {
          display: block;
          font-size: 0.78rem;
          color: #0f172a;
        }

        .yakutai-code-box {
          text-align: right;
          font-size: 0.65rem;
        }

        .yakutai-code-box span {
          display: block;
          color: #64748b;
        }

        .yakutai-code-box strong {
          display: block;
          font-size: 0.85rem;
          font-family: monospace;
          color: #0f172a;
        }

        .yakutai-code-box small {
          display: block;
          font-size: 0.58rem;
          color: #94a3b8;
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
          .yakutai-doc {
            border: none;
            box-shadow: none;
            page-break-after: always;
          }
        }
      `}</style>
    </section>
  );
});
