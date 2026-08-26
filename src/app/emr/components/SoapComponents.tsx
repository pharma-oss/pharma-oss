import { AlertCircle, CheckCircle2, ClipboardList, History, Sparkles, X } from 'lucide-react';
import React from 'react';
import type { SoapStructuredAssessment } from '@/db/types';
import type { SoapHistoryTimelineEntry } from '@/lib/emr_patient_history';
import {
  normalizeSoapStructuredAssessment,
  soapStructuredAssessmentControls
} from '@/lib/soap_structured_assessment';

export type SoapSaveStatus = 'loading' | 'saved' | 'saving' | 'dirty' | 'error';

export type SoapEntryType = 'S' | 'O' | 'A' | 'P';

export const soapEntryTypeMeta: Record<SoapEntryType, { label: string; subLabel: string; className: string }> = {
  S: { label: 'S (Subjective)', subLabel: '主訴・患者の発言', className: 'type-s' },
  O: { label: 'O (Objective)', subLabel: '客観的所見・検査値・処方内容', className: 'type-o' },
  A: { label: 'A (Assessment)', subLabel: '評価・アセスメント', className: 'type-a' },
  P: { label: 'P (Plan)', subLabel: '計画・服薬指導方針・次回確認事項', className: 'type-p' }
};

export interface SoapEntry {
  id: string;
  type: SoapEntryType;
  text: string;
  origin?: 'manual' | 'ai_draft' | 'legacy_unspecified';
  aiStatus?: 'unconfirmed' | 'reviewed' | 'approved' | 'modified';
  aiDraftId?: string;
  confirmedAt?: string;
  confirmedBy?: string;
}

export interface SoapProblem {
  id: string;
  title: string;
  entries: SoapEntry[];
}

export const SoapEntryBox = React.memo(function SoapEntryBox({
  entry,
  onChange,
  onRemove,
  onApprove
}: {
  entry: SoapEntry;
  onChange: (text: string) => void;
  onRemove: () => void;
  onApprove?: () => void;
}) {
  const meta = soapEntryTypeMeta[entry.type];
  const isUnconfirmedAi = entry.origin === 'ai_draft' && entry.aiStatus === 'unconfirmed';
  const isApprovedAi = entry.origin === 'ai_draft' && (entry.aiStatus === 'approved' || entry.aiStatus === 'modified');
  const isLegacy = entry.origin === 'legacy_unspecified';

  return (
    <div className={`soap-entry-box ${meta.className} ${isUnconfirmedAi ? 'entry-ai-unconfirmed' : ''} ${isApprovedAi ? 'entry-ai-approved' : ''}`}>
      <div className="entry-header">
        <span className="entry-badge">{entry.type}</span>
        <span className="entry-sublabel">{meta.subLabel}</span>
        {isUnconfirmedAi && (
          <span className="ai-unconfirmed-badge" title="AIが自動提案した下書きです。薬剤師が内容を確認・承認してください">
            <Sparkles size={12} aria-hidden="true" />
            AI下書き（未確認）
          </span>
        )}
        {isApprovedAi && (
          <span className="ai-approved-badge" title="薬剤師が内容を確認・承認しました">
            <CheckCircle2 size={12} aria-hidden="true" />
            {entry.aiStatus === 'modified' ? 'AI下書き（修正済）' : 'AI下書き（承認済）'}
          </span>
        )}
        {isLegacy && (
          <span className="legacy-badge" title="マイグレーション前の既存記録です（由来記録なし）">
            由来記録なし
          </span>
        )}
        {isUnconfirmedAi && onApprove && (
          <button
            type="button"
            onClick={onApprove}
            className="btn-approve-ai"
            title="このAI下書きをそのまま承認して確定記録にします"
          >
            <CheckCircle2 size={13} aria-hidden="true" />
            <span>この内容で承認</span>
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="btn-remove-entry"
          aria-label={`${entry.type} エントリを削除`}
        >
          <X size={14} />
        </button>
      </div>
      <textarea
        value={entry.text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${meta.label} を入力...`}
        rows={3}
        className={`entry-textarea ${isUnconfirmedAi ? 'textarea-ai-unconfirmed' : ''}`}
      />
      {isUnconfirmedAi && (
        <div className="ai-unconfirmed-hint">
          <AlertCircle size={12} aria-hidden="true" />
          <span>編集すると自動的に「修正済」となり、「この内容で承認」を押すと「承認済」として確定保存されます。</span>
        </div>
      )}
      <style jsx>{`
        .soap-entry-box.entry-ai-unconfirmed {
          border: 1.5px solid #f59e0b;
          background: #fffdfa;
          border-radius: 8px;
          padding: 0.5rem;
        }
        .soap-entry-box.entry-ai-approved {
          border: 1px solid #bbf7d0;
          background: #f0fdf4;
          border-radius: 8px;
          padding: 0.5rem;
        }
        .entry-header {
          display: flex;
          align-items: center;
          gap: var(--space-1-5);
          margin-bottom: var(--space-1);
          flex-wrap: wrap;
        }
        .entry-badge {
          font-weight: 850;
          font-size: var(--fs-md);
        }
        .entry-sublabel {
          font-size: var(--fs-xs);
          color: var(--text-muted);
        }
        .ai-unconfirmed-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.72rem;
          font-weight: 800;
          color: #b45309;
          background: #fef3c7;
          border: 1px solid #fde68a;
          padding: 0.15rem 0.45rem;
          border-radius: 9999px;
        }
        .ai-approved-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.72rem;
          font-weight: 800;
          color: #15803d;
          background: #dcfce7;
          border: 1px solid #bbf7d0;
          padding: 0.15rem 0.45rem;
          border-radius: 9999px;
        }
        .legacy-badge {
          display: inline-flex;
          align-items: center;
          font-size: 0.68rem;
          font-weight: 600;
          color: var(--text-ghost);
          background: var(--bg-subtle);
          border: 1px solid var(--border);
          padding: 0.1rem 0.35rem;
          border-radius: 4px;
        }
        .btn-approve-ai {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.75rem;
          font-weight: 800;
          color: #fff;
          background: #10b981;
          border: none;
          padding: 0.2rem 0.55rem;
          border-radius: 6px;
          cursor: pointer;
          margin-left: auto;
          transition: background var(--transition-fast);
        }
        .btn-approve-ai:hover {
          background: #059669;
        }
        .btn-remove-entry {
          margin-left: 0.25rem;
          background: transparent;
          border: none;
          cursor: pointer;
          opacity: 0.7;
          display: flex;
          align-items: center;
          padding: var(--space-0-5);
          border-radius: var(--radius-sm);
        }
        .soap-entry-box:not(.entry-ai-unconfirmed) .btn-remove-entry {
          margin-left: auto;
        }
        .btn-remove-entry:hover {
          opacity: 1;
          background: rgba(0, 0, 0, 0.05);
        }
        .entry-textarea {
          width: 100%;
          padding: var(--space-2);
          border-radius: 6px;
          border: 1px solid var(--border);
          font-size: var(--fs-base);
          font-family: inherit;
          resize: vertical;
          background: var(--bg-card);
          color: var(--text-main);
        }
        .entry-textarea:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 2px var(--primary-soft);
        }
        .textarea-ai-unconfirmed {
          border-color: #fde68a;
          background: #ffffff;
        }
        .ai-unconfirmed-hint {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.72rem;
          color: #d97706;
          margin-top: 0.35rem;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
});


export const SoapHistoryQuickCard = React.memo(function SoapHistoryQuickCard({
  entries,
  isLoading,
  onOpenFullHistory
}: {
  entries: SoapHistoryTimelineEntry[];
  isLoading: boolean;
  onOpenFullHistory: () => void;
}) {
  const visibleEntries = entries.slice(0, 2);

  return (
    <div className="insight-card soap-history-quick">
      <div className="insight-header">
        <History size={18} className="icon-history" />
        <h3>前回までの薬歴</h3>
      </div>
      {isLoading ? (
        <p className="quick-empty">過去の薬歴を確認しています</p>
      ) : visibleEntries.length === 0 ? (
        <p className="quick-empty">この患者の過去薬歴はまだありません</p>
      ) : (
        <div className="quick-list">
          {visibleEntries.map((entry, entryIndex) => (
            <details key={entry.visitId} className="quick-entry" open={entryIndex === 0}>
              <summary>
                <span className="quick-date">{entry.dateLabel}</span>
                <span className="quick-visit">{entry.visitLabel}</span>
              </summary>
              <div className="quick-problems">
                {entry.problems.map((problem) => (
                  <div key={`${entry.visitId}-${problem.title}`} className="quick-problem">
                    <h4>{problem.title}</h4>
                    {problem.snippets.map((snippet, index) => (
                      <div
                        key={`${snippet.type}-${index}`}
                        className={`quick-snippet type-${snippet.type.toLowerCase()}`}
                      >
                        <span>{snippet.type}</span>
                        <p>{snippet.text}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
      {entries.length > 0 && (
        <button type="button" className="quick-open-full" onClick={onOpenFullHistory}>
          経過タブで全て見る（{entries.length}回分）
        </button>
      )}
      <style jsx>{`
        .soap-history-quick {
          border-left: 4px solid var(--primary);
        }

        .icon-history {
          color: var(--primary);
        }

        .quick-empty {
          margin: 0;
          font-size: var(--fs-md);
          color: var(--text-ghost);
          font-weight: 700;
        }

        .quick-list {
          display: grid;
          gap: 0.5rem;
        }

        .quick-entry {
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: #fdfdfd;
        }

        .quick-entry summary {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.6rem;
          padding: 0.5rem 0.65rem;
          cursor: pointer;
          list-style: none;
        }

        .quick-entry summary::-webkit-details-marker {
          display: none;
        }

        .quick-date {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 800;
          white-space: nowrap;
        }

        .quick-visit {
          color: var(--text-main);
          font-size: var(--fs-sm);
          font-weight: 750;
          text-align: right;
          overflow-wrap: anywhere;
        }

        .quick-problems {
          display: grid;
          gap: 0.5rem;
          padding: 0 0.65rem 0.65rem;
        }

        .quick-problem h4 {
          margin: 0 0 0.25rem;
          font-size: var(--fs-sm);
          color: var(--text-main);
        }

        .quick-snippet {
          display: flex;
          gap: 0.45rem;
          align-items: flex-start;
          margin-bottom: 0.2rem;
        }

        .quick-snippet span {
          flex-shrink: 0;
          width: 18px;
          font-size: var(--fs-xs);
          font-weight: 850;
          text-align: center;
        }

        .quick-snippet.type-s span {
          color: var(--status-blue);
        }
        .quick-snippet.type-o span {
          color: var(--status-green);
        }
        .quick-snippet.type-a span {
          color: var(--status-orange);
        }
        .quick-snippet.type-p span {
          color: var(--status-purple);
        }

        .quick-snippet p {
          margin: 0;
          font-size: var(--fs-sm);
          line-height: 1.55;
          color: var(--text-muted);
          overflow-wrap: anywhere;
        }

        .quick-open-full {
          margin-top: 0.65rem;
          width: 100%;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          color: var(--primary-dark);
          font-size: var(--fs-sm);
          font-weight: 800;
          padding: 0.45rem;
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .quick-open-full:hover {
          background: var(--primary-light);
          border-color: var(--primary);
        }
      `}</style>
    </div>
  );
});

export const SoapHistoryPanel = React.memo(function SoapHistoryPanel({
  entries,
  isLoading,
  hidden = false
}: {
  entries: SoapHistoryTimelineEntry[];
  isLoading: boolean;
  hidden?: boolean;
}) {
  return (
    <div
      className="soap-history-panel"
      role="tabpanel"
      id="history-panel"
      aria-labelledby="tab-history"
      hidden={hidden}
    >
      {isLoading ? (
        <div className="soap-history-empty">過去の薬歴を確認しています</div>
      ) : entries.length === 0 ? (
        <div className="soap-history-empty">この患者の過去薬歴はまだありません</div>
      ) : (
        <div className="soap-history-list">
          {entries.map((entry) => (
            <article key={entry.visitId} className="soap-history-entry">
              <div className="soap-history-entry-header">
                <span>{entry.dateLabel}</span>
                <strong>{entry.visitLabel}</strong>
              </div>
              <div className="soap-history-problems">
                {entry.problems.map((problem) => (
                  <section
                    key={`${entry.visitId}-${problem.title}`}
                    className="soap-history-problem"
                  >
                    <h4>{problem.title}</h4>
                    <div className="soap-history-snippets">
                      {problem.snippets.map((snippet, index) => (
                        <div
                          key={`${snippet.type}-${index}`}
                          className={`soap-history-snippet type-${snippet.type.toLowerCase()}`}
                        >
                          <span>{snippet.type}</span>
                          <p>{snippet.text}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      <style jsx>{`
        .soap-history-panel {
          display: grid;
          gap: 0.85rem;
          min-height: 320px;
        }

        .soap-history-panel[hidden] {
          display: none;
        }

        .soap-history-list {
          display: grid;
          gap: 0.85rem;
        }

        .soap-history-entry {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #ffffff;
          padding: 0.9rem;
          box-shadow: 0 8px 20px rgb(15 23 42 / 0.04);
        }

        .soap-history-entry-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.75rem;
          padding-bottom: 0.55rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .soap-history-entry-header span {
          color: var(--text-ghost);
          font-size: var(--fs-sm);
          font-weight: 800;
          white-space: nowrap;
        }

        .soap-history-entry-header strong {
          color: var(--text-main);
          font-size: var(--fs-md);
          text-align: right;
          overflow-wrap: anywhere;
        }

        .soap-history-problems {
          display: grid;
          gap: 0.65rem;
          margin-top: 0.75rem;
        }

        .soap-history-problem {
          display: grid;
          gap: 0.45rem;
        }

        .soap-history-problem h4 {
          margin: 0;
          color: var(--text-main);
          font-size: var(--fs-base);
        }

        .soap-history-snippets {
          display: grid;
          gap: 0.35rem;
        }

        .soap-history-snippet {
          display: grid;
          grid-template-columns: 28px minmax(0, 1fr);
          gap: 0.45rem;
          align-items: start;
          border-radius: 6px;
          background: #f8fafc;
          padding: 0.45rem 0.55rem;
        }

        .soap-history-snippet span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          color: #ffffff;
          background: var(--primary);
          font-size: var(--fs-xs);
          font-weight: 900;
        }

        .soap-history-snippet.type-s span {
          background: var(--status-blue);
        }
        .soap-history-snippet.type-o span {
          background: var(--status-green);
        }
        .soap-history-snippet.type-a span {
          background: var(--status-orange);
        }
        .soap-history-snippet.type-p span {
          background: var(--status-purple);
        }

        .soap-history-snippet p,
        .soap-history-empty {
          margin: 0;
          color: var(--text-muted);
          font-size: var(--fs-md);
          line-height: 1.55;
          overflow-wrap: anywhere;
        }

        .soap-history-empty {
          border: 1px dashed var(--border);
          border-radius: 8px;
          background: #ffffff;
          padding: 1rem;
          font-weight: 800;
        }
      `}</style>
    </div>
  );
});

export const SoapStructuredAssessmentPanel = React.memo(
  function SoapStructuredAssessmentPanel({
    assessment,
    onChange
  }: {
    assessment: SoapStructuredAssessment;
    onChange: <K extends keyof SoapStructuredAssessment>(
      field: K,
      value: NonNullable<SoapStructuredAssessment[K]>
    ) => void;
  }) {
    const normalized = normalizeSoapStructuredAssessment(assessment);
    const missingCount = soapStructuredAssessmentControls.filter(
      (control) => (normalized[control.field as keyof SoapStructuredAssessment] || 'unknown') === 'unknown'
    ).length;

    return (
      <section className="soap-structured-panel" aria-label="薬歴構造化チェック">
        <div className="soap-structured-header">
          <span className="soap-structured-title">
            <ClipboardList size={17} aria-hidden="true" />
            <h3>薬歴構造化チェック</h3>
          </span>
          <span className={`structured-progress ${missingCount === 0 ? 'done' : ''}`}>
            {missingCount === 0 ? '全項目確認済み' : `未確認 ${missingCount}項目`}
          </span>
        </div>
        <div className="soap-structured-grid">
          {soapStructuredAssessmentControls.map((control) => {
            const currentValue = normalized[control.field as keyof SoapStructuredAssessment] || 'unknown';
            const optionValues = control.options.map(([value]) => value);
            const handleChipKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
              const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
              const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
              if (!forward && !backward) return;
              event.preventDefault();
              const currentIndex = Math.max(optionValues.indexOf(currentValue), 0);
              const nextIndex =
                (currentIndex + (forward ? 1 : -1) + optionValues.length) % optionValues.length;
              onChange(control.field, optionValues[nextIndex] as any);
              const chipRow = event.currentTarget.closest('.chip-row');
              window.setTimeout(() => {
                (
                  chipRow?.querySelector('[aria-checked="true"]') as HTMLButtonElement | null
                )?.focus();
              }, 0);
            };
            return (
              <div
                key={control.field}
                className={`soap-structured-field ${currentValue === 'unknown' ? 'unconfirmed' : 'confirmed'}`}
                role="radiogroup"
                aria-label={control.label}
              >
                <span className="field-label">{control.label}</span>
                <div className="chip-row">
                  {control.options.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={currentValue === value}
                      tabIndex={currentValue === value ? 0 : -1}
                      className={`assessment-chip ${currentValue === value ? 'selected' : ''} ${value === 'unknown' ? 'is-unknown' : ''}`}
                      onClick={() => onChange(control.field, value as any)}
                      onKeyDown={handleChipKeyDown}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <style jsx>{`
          .soap-structured-panel {
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            background: var(--bg-card);
            padding: 0.9rem;
            display: grid;
            gap: 0.7rem;
          }

          .soap-structured-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
          }

          .soap-structured-title {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            color: var(--primary-dark);
            min-width: 0;
          }

          .soap-structured-header h3 {
            margin: 0;
            color: var(--text-main);
            font-size: var(--fs-base);
            font-weight: 850;
          }

          .structured-progress {
            border-radius: 999px;
            background: var(--warning-soft);
            color: var(--warning);
            padding: 0.16rem 0.6rem;
            font-size: var(--fs-xs);
            font-weight: 850;
            white-space: nowrap;
          }

          .structured-progress.done {
            background: var(--success-soft);
            color: var(--success);
          }

          .soap-structured-grid {
            display: grid;
            gap: 0.45rem;
          }

          /* 項目名とチップを横並びにすると「服薬コンプライアンス」のような
             長いラベルが省略されるため、ラベルは常に上に置いて全文を出す。 */
          .soap-structured-field {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 0.35rem;
            min-width: 0;
            padding: 0.45rem 0.5rem;
            border-radius: var(--radius-sm);
            transition: background var(--transition-fast);
          }

          .soap-structured-field.unconfirmed {
            background: #fffdf4;
          }

          .field-label {
            color: var(--text-muted);
            font-size: var(--fs-sm);
            font-weight: 800;
          }

          .soap-structured-field.confirmed .field-label {
            color: var(--primary-dark);
          }

          .chip-row {
            display: flex;
            flex-wrap: wrap;
            gap: 0.3rem;
          }

          .assessment-chip {
            border: 1px solid var(--border);
            border-radius: 999px;
            background: var(--bg-card);
            color: var(--text-muted);
            padding: 0.22rem 0.66rem;
            font-size: var(--fs-xs);
            font-weight: 760;
            cursor: pointer;
            transition: all var(--transition-fast);
            white-space: nowrap;
          }

          .assessment-chip:hover {
            border-color: var(--primary);
            color: var(--primary-dark);
            background: var(--primary-light);
          }

          .assessment-chip.selected {
            border-color: var(--primary);
            background: var(--primary);
            color: #ffffff;
            font-weight: 850;
          }

          .assessment-chip.selected.is-unknown {
            border-color: var(--warning);
            background: var(--warning-soft);
            color: var(--warning);
          }

        `}</style>
      </section>
    );
  }
);

export const SoapSaveStatusIndicator = React.memo(function SoapSaveStatusIndicator({
  status,
  lastSavedAt
}: {
  status: SoapSaveStatus;
  lastSavedAt?: string;
}) {
  const label =
    status === 'loading'
      ? '読込中'
      : status === 'saving'
        ? '保存中'
        : status === 'dirty'
          ? '未保存の変更あり'
          : status === 'error'
            ? '保存失敗'
            : '自動保存済み';
  const detail =
    status === 'saved' && lastSavedAt
      ? new Date(lastSavedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
      : '';

  return (
    <div className={`soap-save-status status-${status}`} role="status" aria-live="polite">
      <span className="save-dot" aria-hidden="true" />
      <strong>{label}</strong>
      {detail && <small>{detail}</small>}
      <style jsx>{`
        .soap-save-status {
          min-height: 32px;
          display: inline-flex;
          align-items: center;
          gap: 0.38rem;
          align-self: flex-end;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: #ffffff;
          color: var(--text-muted);
          padding: 0 0.7rem;
          font-size: var(--fs-sm);
          font-weight: 800;
        }

        .save-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #94a3b8;
        }

        .soap-save-status strong {
          color: inherit;
          font-size: inherit;
        }

        .soap-save-status small {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 760;
        }

        .status-saved {
          color: #047857;
          border-color: #bbf7d0;
          background: #f0fdf4;
        }

        .status-saved .save-dot {
          background: #10b981;
        }

        .status-saving,
        .status-dirty {
          color: #b45309;
          border-color: #fde68a;
          background: #fffbeb;
        }

        .status-saving .save-dot,
        .status-dirty .save-dot {
          background: #f59e0b;
        }

        .status-error {
          color: #b91c1c;
          border-color: #fecaca;
          background: #fef2f2;
        }

        .status-error .save-dot {
          background: #ef4444;
        }
      `}</style>
    </div>
  );
});
