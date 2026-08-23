import React from 'react';
import { History } from 'lucide-react';
import type { PrescriptionHistoryTimelineEntry } from '@/lib/prescription_history_compare';
import { historyChangeLabel } from '../helpers';

export interface PrescriptionHistoryComparePanelProps {
  timeline: PrescriptionHistoryTimelineEntry[];
  isLoading: boolean;
  hasPatientContext: boolean;
  hasCurrentInput: boolean;
}

export const PrescriptionHistoryComparePanel = React.memo(({
  timeline,
  isLoading,
  hasPatientContext,
  hasCurrentInput
}: PrescriptionHistoryComparePanelProps) => {
  if (!hasPatientContext || !hasCurrentInput) return null;

  const tone = timeline.some(({ comparison }) => (
    comparison.addedCount + comparison.stoppedCount + comparison.changedCount
  ) > 0)
    ? 'changed'
    : 'stable';

  return (
    <section className={`prescription-history-panel ${tone}`} aria-label="過去処方比較">
      <div className="history-panel-header">
        <div className="history-title">
          <span className="history-icon" aria-hidden="true"><History size={17} /></span>
          <div>
            <span className="section-kicker">過去処方比較</span>
            <strong>
              {isLoading
                ? '読み込み中'
                : timeline.length > 0
                  ? `過去${timeline.length}回分を確認`
                  : '過去処方なし'}
            </strong>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="history-empty">過去2回分の処方を確認しています</div>
      ) : timeline.length === 0 ? (
        <div className="history-empty">この患者の過去処方はまだありません</div>
      ) : (
        <div className="history-snapshot-list">
          {timeline.map(({ snapshot, comparison }, snapshotIndex) => {
            const visibleChanges = comparison.changes.filter((change) => change.kind !== 'unchanged').slice(0, 4);
            const hiddenChangeCount = comparison.changes.filter((change) => change.kind !== 'unchanged').length - visibleChanges.length;
            return (
              <div key={snapshot.visitId} className="history-snapshot">
                <div className="history-snapshot-header">
                  <div>
                    <span>{snapshotIndex === 0 ? '前回' : '前々回'}</span>
                    <strong>{snapshot.dateLabel}{snapshot.institutionName ? ` / ${snapshot.institutionName}` : ''}</strong>
                  </div>
                  <div className="history-counts" aria-label={`${snapshotIndex === 0 ? '前回' : '前々回'}比較件数`}>
                    <span className="history-count changed">変更 {comparison.changedCount}</span>
                    <span className="history-count added">追加 {comparison.addedCount}</span>
                    <span className="history-count stopped">中止 {comparison.stoppedCount}</span>
                    <span className="history-count unchanged">継続 {comparison.unchangedCount}</span>
                  </div>
                </div>
                {visibleChanges.length > 0 ? (
                  <ul className="history-change-list">
                    {visibleChanges.map((change) => (
                      <li key={`${snapshot.visitId}-${change.kind}-${change.label}`} className={`history-change ${change.kind}`}>
                        <span className="history-change-kind">{historyChangeLabel[change.kind]}</span>
                        <div>
                          <strong>{change.label}</strong>
                          {change.fieldChanges.length > 0 ? (
                            <div className="history-field-list">
                              {change.fieldChanges.map((field) => (
                                <span key={field.field}>{field.label} {field.before} -&gt; {field.after}</span>
                              ))}
                            </div>
                          ) : (
                            <p>{change.kind === 'added' ? '過去処方から追加されています' : '今回入力から外れています'}</p>
                          )}
                        </div>
                      </li>
                    ))}
                    {hiddenChangeCount > 0 && (
                      <li className="history-more">他 {hiddenChangeCount} 件</li>
                    )}
                  </ul>
                ) : (
                  <div className="history-empty">この回からの処方変更はありません</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .prescription-history-panel {
          border: 1px solid #dbe4ef;
          border-radius: 8px;
          background: #ffffff;
          padding: 0.75rem;
          margin-bottom: 0.85rem;
          box-shadow: 0 8px 20px rgb(15 23 42 / 0.04);
        }

        .prescription-history-panel.changed {
          border-color: #bfdbfe;
          background: #f8fbff;
        }

        .prescription-history-panel.stable {
          border-color: #ccfbf1;
          background: #f7fefc;
        }

        .history-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .history-title {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          min-width: 0;
        }

        .history-title > div {
          display: grid;
          gap: 0.1rem;
          min-width: 0;
        }

        .history-title strong {
          color: var(--text-main);
          font-size: var(--fs-base);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .history-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          background: #2563eb;
          flex: 0 0 auto;
        }

        .prescription-history-panel.stable .history-icon {
          background: #0f766e;
        }

        .history-counts {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.35rem;
        }

        .history-count {
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

        .history-count.changed {
          color: #1d4ed8;
          background: #dbeafe;
          border-color: #bfdbfe;
        }

        .history-count.added {
          color: #0f766e;
          background: #ccfbf1;
          border-color: #99f6e4;
        }

        .history-count.stopped {
          color: #b91c1c;
          background: #fee2e2;
          border-color: #fecaca;
        }

        .history-count.unchanged {
          color: #475569;
          background: #f1f5f9;
          border-color: #e2e8f0;
        }

        .history-change-list {
          display: grid;
          gap: 0.45rem;
          margin: 0.7rem 0 0;
          padding: 0;
          list-style: none;
        }

        .history-change {
          display: grid;
          grid-template-columns: 46px minmax(0, 1fr);
          gap: 0.55rem;
          align-items: start;
          border: 1px solid #e2e8f0;
          border-radius: 7px;
          background: #ffffff;
          padding: 0.55rem;
        }

        .history-change.changed {
          border-color: #bfdbfe;
        }

        .history-change.added {
          border-color: #99f6e4;
        }

        .history-change.stopped {
          border-color: #fecaca;
        }

        .history-change-kind {
          border-radius: 5px;
          padding: 0.2rem 0.3rem;
          text-align: center;
          font-size: var(--fs-2xs);
          font-weight: 900;
          color: #ffffff;
          background: #2563eb;
        }

        .history-change.added .history-change-kind {
          background: #0f766e;
        }

        .history-change.stopped .history-change-kind {
          background: #dc2626;
        }

        .history-change strong {
          display: block;
          color: var(--text-main);
          font-size: var(--fs-md);
          line-height: 1.35;
        }

        .history-change p,
        .history-empty,
        .history-more {
          margin: 0.12rem 0 0;
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 700;
          line-height: 1.45;
        }

        .history-empty {
          margin-top: 0.55rem;
        }

        .history-field-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          margin-top: 0.3rem;
        }

        .history-field-list span {
          border-radius: 5px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #475569;
          font-size: var(--fs-xs);
          font-weight: 850;
          line-height: 1.35;
          padding: 0.18rem 0.38rem;
        }

        .history-snapshot-list {
          display: grid;
          gap: 0.75rem;
          margin-top: 0.7rem;
        }

        .history-snapshot {
          border-top: 1px solid #e2e8f0;
          padding-top: 0.7rem;
        }

        .history-snapshot:first-child {
          border-top: 0;
          padding-top: 0;
        }

        .history-snapshot-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.7rem;
        }

        .history-snapshot-header > div:first-child {
          display: grid;
          gap: 0.12rem;
          min-width: 0;
        }

        .history-snapshot-header span {
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 850;
        }

        .history-snapshot-header strong {
          color: var(--text-main);
          font-size: var(--fs-md);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (max-width: 720px) {
          .history-panel-header {
            align-items: stretch;
            flex-direction: column;
          }

          .history-snapshot-header {
            align-items: stretch;
            flex-direction: column;
          }

          .history-counts {
            justify-content: flex-start;
          }

          .history-change {
            grid-template-columns: 1fr;
          }

          .history-change-kind {
            width: max-content;
          }
        }
      `}</style>
    </section>
  );
});

PrescriptionHistoryComparePanel.displayName = 'PrescriptionHistoryComparePanel';
