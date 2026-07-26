import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Sparkles
} from 'lucide-react';
import React from 'react';
import type { SoapAiDraftSuggestion } from '@/lib/soap_ai_draft';

export const CareChecklistCard = React.memo(function CareChecklistCard({
  warningCount,
  isWarningsLoading,
  unpickedCount,
  prescribedCount,
  patientAlertCount
}: {
  warningCount: number;
  isWarningsLoading: boolean;
  unpickedCount: number;
  prescribedCount: number;
  patientAlertCount: number;
}) {
  const items = [
    {
      label: '患者アラート',
      value: patientAlertCount,
      state: patientAlertCount > 0 ? 'review' : 'ok',
      text: patientAlertCount > 0 ? `${patientAlertCount}件` : '確認済'
    },
    {
      label: '相互作用・用量',
      value: warningCount,
      state: isWarningsLoading ? 'pending' : warningCount > 0 ? 'review' : 'ok',
      text: isWarningsLoading ? '解析中' : warningCount > 0 ? `${warningCount}件` : '確認済'
    },
    {
      label: 'GS1照合',
      value: unpickedCount,
      state: unpickedCount > 0 ? 'review' : 'ok',
      text: unpickedCount > 0 ? `${unpickedCount}件` : '完了'
    },
    {
      label: '指導文',
      value: prescribedCount,
      state: prescribedCount > 0 ? 'ok' : 'pending',
      text: prescribedCount > 0 ? `${prescribedCount}薬` : '未読込'
    }
  ];

  return (
    <div className="insight-card care-check">
      <div className="insight-header">
        <CheckCircle2 size={18} className="icon-care" />
        <h3>服薬指導チェック</h3>
      </div>
      <div className="care-check-list">
        {items.map((item) => (
          <div key={item.label} className={`care-check-item ${item.state}`}>
            <span className="care-check-label">{item.label}</span>
            <span className="care-check-value">{item.text}</span>
          </div>
        ))}
      </div>
      <style jsx>{`
        .care-check {
          border-left: 4px solid var(--accent);
        }

        .icon-care {
          color: var(--accent);
        }

        .care-check-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.5rem;
        }

        .care-check-item {
          min-height: 58px;
          display: grid;
          align-content: center;
          gap: 0.1rem;
          padding: 0.65rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
        }

        .care-check-item.ok {
          border-color: #bbf7d0;
          background: #f0fdf4;
        }

        .care-check-item.review {
          border-color: #fed7aa;
          background: #fff7ed;
        }

        .care-check-item.pending {
          border-color: var(--border);
          background: var(--bg-subtle);
        }

        .care-check-label {
          color: var(--text-muted);
          font-size: 0.74rem;
          font-weight: 800;
          overflow-wrap: anywhere;
        }

        .care-check-value {
          color: var(--text-main);
          font-size: 0.98rem;
          font-weight: 850;
        }

        .care-check-item.review .care-check-value {
          color: #c2410c;
        }

        .care-check-item.ok .care-check-value {
          color: var(--success);
        }
      `}</style>
    </div>
  );
});

export const WarningInsightCard = React.memo(function WarningInsightCard({
  warnings,
  isLoading
}: {
  warnings?: any[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="insight-card warning">
        <div className="insight-header">
          <Loader2 className="animate-spin" size={18} />
          <h3>相互作用・注意を解析中...</h3>
        </div>
      </div>
    );
  }

  if (!warnings || warnings.length === 0) {
    return (
      <div
        id="emr-warning-insights"
        className="insight-card warning"
        style={{ borderColor: 'var(--green-200)', backgroundColor: 'var(--green-50)' }}
      >
        <div className="insight-header">
          <CheckCircle2 size={18} color="var(--green-600)" />
          <h3 style={{ color: 'var(--green-700)' }}>相互作用・注意なし</h3>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--green-700)', marginTop: '0.5rem' }}>
          併用禁忌や用法用量の警告は検出されませんでした。
        </p>
      </div>
    );
  }

  return (
    <div id="emr-warning-insights" className="insight-card warning">
      <div className="insight-header">
        <AlertTriangle size={18} className="icon-warning" />
        <h3>相互作用・注意 ({warnings.length}件)</h3>
      </div>
      <ul className="insight-list">
        {warnings.map((w, idx) => (
          <li key={idx}>
            {w.type === 'contraindication' && (
              <>
                <strong style={{ color: w.severity === 'danger' ? '#ef4444' : '#eab308' }}>
                  {w.severity === 'danger' ? '併用禁忌:' : '併用注意:'}
                </strong>{' '}
                {w.drug1} と {w.drug2}（{w.message}）
              </>
            )}
            {w.type === 'usage' && (
              <>
                <strong style={{ color: w.severity === 'danger' ? '#ef4444' : '#eab308' }}>
                  {w.severity === 'danger' ? '病態禁忌/注意:' : '用法注意:'}
                </strong>{' '}
                {w.drug}（{w.message}）
              </>
            )}
            {w.type === 'patient_alert' && (
              <>
                <strong style={{ color: w.severity === 'danger' ? '#ef4444' : '#eab308' }}>
                  {w.alertType === 'allergy' ? '薬剤アレルギー:' : '副作用歴:'}
                </strong>{' '}
                {w.drug}（{w.message}）
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
});

export const SoapAiDraftInsightCard = React.memo(function SoapAiDraftInsightCard({
  suggestions,
  onApplyDraft,
  onFocusEvidence
}: {
  suggestions: SoapAiDraftSuggestion[];
  onApplyDraft: (suggestion: SoapAiDraftSuggestion) => void;
  onFocusEvidence: (targetId?: string) => void;
}) {
  const visibleSuggestions = suggestions.slice(0, 4);

  return (
    <div className="insight-card soap-ai-draft">
      <div className="insight-header">
        <Sparkles size={18} className="icon-ai" />
        <h3>AI補助 SOAP下書き</h3>
      </div>
      <div className="soap-ai-list">
        {visibleSuggestions.map((suggestion) => (
          <div key={suggestion.draftId} className={`soap-ai-item ${suggestion.severity}`}>
            <div className="soap-ai-title-row">
              <span className={`soap-ai-type ${suggestion.type.toLowerCase()}`}>
                {suggestion.type}
              </span>
              <strong>{suggestion.title}</strong>
              <span className="soap-ai-confidence">{suggestion.confidence}%</span>
            </div>
            <p>{suggestion.text}</p>
            <div className="soap-ai-evidence">
              {suggestion.evidence.slice(0, 2).map((evidence) => (
                <button
                  key={`${suggestion.draftId}-${evidence.label}`}
                  type="button"
                  className="soap-ai-evidence-link"
                  onClick={() => onFocusEvidence(evidence.targetId)}
                  disabled={!evidence.targetId}
                  title={evidence.targetLabel ? `${evidence.targetLabel}を確認` : '根拠を確認'}
                >
                  <span>
                    {evidence.label}: {evidence.detail}
                  </span>
                  {evidence.targetLabel && <small>{evidence.targetLabel}</small>}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn-secondary soap-ai-apply"
              onClick={() => onApplyDraft(suggestion)}
              title="SOAPへ反映して監査ログに記録"
            >
              <Plus size={14} aria-hidden="true" />
              <span>SOAPへ反映</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
});

export const VitalInsightCard = React.memo(function VitalInsightCard() {
  return (
    <div className="insight-card vital">
      <div className="insight-header">
        <h3>バイタル・臨床検査値</h3>
      </div>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-ghost)', margin: 0, fontWeight: 700 }}>
        最新の検査値（eGFR / Blood Pressure等）は未登録です
      </p>
    </div>
  );
});

export const DocLinkInsightCard = React.memo(function DocLinkInsightCard({
  prescribedDrugs,
  onSelectGuidance
}: {
  prescribedDrugs?: any[];
  onSelectGuidance: (type: string, text: string) => void;
}) {
  return (
    <div className="insight-card doc-link emr-prescription-doc-links" id="emr-prescription-doc-links">
      <div className="insight-header">
        <FileText size={18} className="icon-doc" />
        <h3>指導文・患者説明資料</h3>
      </div>
      {!prescribedDrugs || prescribedDrugs.length === 0 ? (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-ghost)', margin: 0, fontWeight: 700 }}>
          処方薬を読み込み中...
        </p>
      ) : (
        <div className="doc-link-list">
          {prescribedDrugs.map((drug) => (
            <button
              key={drug.name}
              type="button"
              className="doc-link-btn"
              onClick={() =>
                onSelectGuidance('medication', `${drug.name}: 服用タイミングと注意点`)
              }
            >
              <span>{drug.name}の指導文書</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
