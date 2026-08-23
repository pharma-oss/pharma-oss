import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import type { PrescriptionInputAuditResult } from '@/lib/prescription_input_audit';
import { auditSeverityLabel } from '../helpers';

export interface PrescriptionAuditPanelProps {
  audit: PrescriptionInputAuditResult;
  hasCurrentInput: boolean;
}

export const PrescriptionAuditPanel = React.memo(({
  audit,
  hasCurrentInput
}: PrescriptionAuditPanelProps) => {
  if (!hasCurrentInput) return null;

  const tone = audit.errorCount > 0 ? 'error' : audit.warningCount > 0 ? 'warning' : 'ok';
  const visibleIssues = audit.issues.slice(0, 5);
  const hiddenIssueCount = audit.issues.length - visibleIssues.length;
  const headline = audit.errorCount > 0
    ? `要修正 ${audit.errorCount}件`
    : audit.warningCount > 0
      ? `要確認 ${audit.warningCount}件`
      : '保存前チェックOK';

  return (
    <section className={`prescription-audit-panel ${tone}`} aria-label="処方入力後チェック">
      <div className="audit-panel-header">
        <div className="audit-title">
          <span className="audit-icon" aria-hidden="true">
            {tone === 'ok' ? <ShieldCheck size={17} /> : <AlertTriangle size={17} />}
          </span>
          <div>
            <span className="section-kicker">処方入力後チェック</span>
            <strong>{headline}</strong>
          </div>
        </div>
        <div className="audit-counts" aria-label="監査件数">
          <span className="audit-count error">要修正 {audit.errorCount}</span>
          <span className="audit-count warning">要確認 {audit.warningCount}</span>
          <span className="audit-count info">確認 {audit.infoCount}</span>
        </div>
      </div>

      {visibleIssues.length > 0 ? (
        <ul className="audit-issue-list">
          {visibleIssues.map((issue) => (
            <li key={`${issue.code}-${issue.title}`} className={`audit-issue ${issue.severity}`}>
              <span className="audit-severity">{auditSeverityLabel[issue.severity]}</span>
              <div>
                <strong>{issue.title}</strong>
                <p>{issue.message}</p>
              </div>
            </li>
          ))}
          {hiddenIssueCount > 0 && (
            <li className="audit-more">他 {hiddenIssueCount} 件</li>
          )}
        </ul>
      ) : (
        <div className="audit-ok-message">未解決の監査項目はありません</div>
      )}

      <style jsx>{`
        .prescription-audit-panel {
          border: 1px solid #dbe4ef;
          border-radius: 8px;
          background: #ffffff;
          padding: 0.75rem;
          margin-bottom: 0.85rem;
          box-shadow: 0 8px 20px rgb(15 23 42 / 0.04);
        }

        .prescription-audit-panel.error {
          border-color: #fecaca;
          background: #fff7f7;
        }

        .prescription-audit-panel.warning {
          border-color: #fde68a;
          background: #fffbeb;
        }

        .prescription-audit-panel.ok {
          border-color: #bbf7d0;
          background: #f7fef9;
        }

        .audit-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .audit-title {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          min-width: 0;
        }

        .audit-title > div {
          display: grid;
          gap: 0.1rem;
        }

        .audit-title strong {
          color: var(--text-main);
          font-size: var(--fs-base);
        }

        .audit-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          background: var(--success);
          flex: 0 0 auto;
        }

        .prescription-audit-panel.error .audit-icon {
          background: #dc2626;
        }

        .prescription-audit-panel.warning .audit-icon {
          background: #b45309;
        }

        .audit-counts {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.35rem;
        }

        .audit-count {
          min-height: 24px;
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0 0.55rem;
          font-size: var(--fs-xs);
          font-weight: 850;
          border: 1px solid transparent;
          white-space: nowrap;
        }

        .audit-count.error {
          color: #b91c1c;
          background: #fee2e2;
          border-color: #fecaca;
        }

        .audit-count.warning {
          color: #92400e;
          background: #fef3c7;
          border-color: #fde68a;
        }

        .audit-count.info {
          color: #0f766e;
          background: #ccfbf1;
          border-color: #99f6e4;
        }

        .audit-issue-list {
          display: grid;
          gap: 0.45rem;
          margin: 0.7rem 0 0;
          padding: 0;
          list-style: none;
        }

        .audit-issue {
          display: grid;
          grid-template-columns: 58px minmax(0, 1fr);
          gap: 0.55rem;
          align-items: start;
          border: 1px solid #e2e8f0;
          border-radius: 7px;
          background: #ffffff;
          padding: 0.55rem;
        }

        .audit-issue.error {
          border-color: #fecaca;
        }

        .audit-issue.warning {
          border-color: #fde68a;
        }

        .audit-severity {
          border-radius: 5px;
          padding: 0.2rem 0.3rem;
          text-align: center;
          font-size: var(--fs-2xs);
          font-weight: 900;
          color: #ffffff;
          background: #0f766e;
        }

        .audit-issue.error .audit-severity {
          background: #dc2626;
        }

        .audit-issue.warning .audit-severity {
          background: #b45309;
        }

        .audit-issue strong {
          display: block;
          color: var(--text-main);
          font-size: var(--fs-md);
          line-height: 1.35;
        }

        .audit-issue p {
          margin: 0.12rem 0 0;
          color: var(--text-muted);
          font-size: var(--fs-xs);
          line-height: 1.45;
        }

        .audit-more,
        .audit-ok-message {
          color: var(--text-muted);
          font-size: var(--fs-sm);
          font-weight: 800;
        }

        .audit-ok-message {
          margin-top: 0.55rem;
        }

        @media (max-width: 720px) {
          .audit-panel-header {
            align-items: stretch;
            flex-direction: column;
          }

          .audit-counts {
            justify-content: flex-start;
          }

          .audit-issue {
            grid-template-columns: 1fr;
          }

          .audit-severity {
            width: max-content;
          }
        }
      `}</style>
    </section>
  );
});

PrescriptionAuditPanel.displayName = 'PrescriptionAuditPanel';
