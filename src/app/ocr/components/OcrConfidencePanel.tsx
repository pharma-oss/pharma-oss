import React from 'react';
import type { OcrConfidenceReport } from '@/lib/ocr_confidence';

export const OcrRawTextArea = React.memo(({ isProcessing, ocrResult }: { isProcessing: boolean; ocrResult: string }) => (
  <div className="raw-output mt-4">
    <label htmlFor="ocrRawText">OCR RAW テキスト</label>
    <textarea
      id="ocrRawText"
      readOnly
      maxLength={10000}
      value={isProcessing ? "解析中..." : ocrResult || "データがありません"}
    />
    <style jsx>{`
      .raw-output textarea {
        width: 100%;
        height: 100px;
        border-radius: var(--radius-md);
        border: 1px solid var(--border);
        background: var(--bg-base);
        padding: 0.5rem;
        font-family: monospace;
        font-size: 0.75rem;
        color: var(--text-muted);
      }
    `}</style>
  </div>
));
OcrRawTextArea.displayName = 'OcrRawTextArea';

export interface OcrConfidencePanelProps {
  report: OcrConfidenceReport;
  isProcessing: boolean;
  hasImage: boolean;
}

export const OcrConfidencePanel = React.memo(function OcrConfidencePanel({
  report,
  isProcessing,
  hasImage,
}: OcrConfidencePanelProps) {
  if (!hasImage) {
    return null;
  }

  const visiblePoints = report.reviewPoints.slice(0, 5);

  return (
    <section className={`ocr-confidence-panel tone-${report.tone}`} aria-label="OCR信頼度と人手確認ポイント">
      <div className="ocr-confidence-header">
        <span className="ocr-confidence-score">
          <span>OCR信頼度</span>
          <strong>{isProcessing ? '解析中' : `${report.score}%`}</strong>
        </span>
        <span className={`status-chip compact ${report.tone === 'green' ? 'confirmed' : 'warning'}`}>
          {isProcessing ? '読取中' : report.label}
        </span>
      </div>
      <div className="ocr-confidence-evidence">
        {(isProcessing ? ['OCR解析を実行中'] : report.evidence).slice(0, 3).map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      {!isProcessing && visiblePoints.length > 0 && (
        <div className="ocr-review-point-list">
          {visiblePoints.map((point) => (
            <div key={`${point.field}-${point.message}`} className={`ocr-review-point severity-${point.severity}`}>
              <span className="ocr-review-point-label">{point.label}</span>
              <span className="ocr-review-point-message">{point.message}</span>
              <span className="ocr-review-point-action">{point.suggestedAction}</span>
            </div>
          ))}
        </div>
      )}
      {!isProcessing && report.reviewPoints.length === 0 && (
        <div className="ocr-review-empty">主要項目に大きな確認ポイントはありません。保存前に処方箋原本との最終確認を行ってください。</div>
      )}

      <style jsx>{`
        .ocr-confidence-panel {
          display: grid;
          gap: 0.65rem;
          border: 1px solid var(--border);
          border-left-width: 4px;
          border-radius: var(--radius-md);
          background: #ffffff;
          padding: 0.85rem;
          box-shadow: var(--shadow-sm);
        }

        .ocr-confidence-panel.tone-green {
          border-left-color: #16a34a;
        }

        .ocr-confidence-panel.tone-amber {
          border-left-color: #f59e0b;
        }

        .ocr-confidence-panel.tone-red {
          border-left-color: #dc2626;
        }

        .ocr-confidence-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.65rem;
        }

        .ocr-confidence-score {
          min-width: 0;
          display: flex;
          align-items: baseline;
          gap: 0.45rem;
          color: var(--text-muted);
          font-size: var(--fs-sm);
          font-weight: 800;
        }

        .ocr-confidence-score strong {
          color: var(--text-main);
          font-size: 1.35rem;
          line-height: 1.05;
        }

        .ocr-confidence-evidence {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }

        .ocr-confidence-evidence span {
          min-height: 24px;
          display: inline-flex;
          align-items: center;
          padding: 0.08rem 0.4rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: #f8fafc;
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 800;
        }

        .ocr-review-point-list {
          display: grid;
          gap: 0.45rem;
        }

        .ocr-review-point {
          display: grid;
          grid-template-columns: minmax(86px, 0.22fr) minmax(0, 0.48fr) minmax(0, 0.58fr);
          gap: 0.55rem;
          align-items: start;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: #f8fafc;
          padding: 0.5rem 0.6rem;
        }

        .ocr-review-point-label {
          color: var(--text-main);
          font-size: var(--fs-sm);
          font-weight: 850;
        }

        .ocr-review-point-message,
        .ocr-review-point-action,
        .ocr-review-empty {
          min-width: 0;
          overflow-wrap: anywhere;
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 760;
          line-height: 1.45;
        }

        .ocr-review-point-action {
          color: #0369a1;
        }

        .ocr-review-point.severity-critical {
          border-color: #fecaca;
          background: #fef2f2;
        }

        .ocr-review-point.severity-warning {
          border-color: #fed7aa;
          background: #fff7ed;
        }

        .ocr-review-point.severity-info {
          border-color: #bfdbfe;
          background: #eff6ff;
        }

        @media (max-width: 900px) {
          .ocr-confidence-header {
            flex-direction: column;
            align-items: stretch;
          }

          .ocr-review-point {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
});
