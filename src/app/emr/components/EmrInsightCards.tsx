import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  Plus,
  Sparkles
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useDatabase } from '@/db/DatabaseProvider';
import type { SoapAiDraftSuggestion } from '@/lib/soap_ai_draft';
import {
  GUIDANCE_LOAD_ERROR_TOAST,
  buildGuidanceEntriesByDrugCode,
  getGuidanceDropdownState,
  getSafeDocumentUrl,
  getUniquePrescribedDrugs,
  type GuidanceLoadStatus
} from '@/lib/medication_guidance';
import { getCurrentUser } from '@/lib/audit';
import { checkMedicationGuidanceEditPermission } from '@/lib/medication_guidance_write';
import { MedicationGuidanceModal } from './MedicationGuidanceModal';
import type { SoapEntryType } from './SoapComponents';

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
          font-size: var(--fs-xs);
          font-weight: 800;
          overflow-wrap: anywhere;
        }

        .care-check-value {
          color: var(--text-main);
          font-size: var(--fs-base);
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
        className="insight-card warning is-clear"
      >
        <div className="insight-header">
          <CheckCircle2 size={18} color="var(--green-600)" />
          <h3 className="text-success-dark">相互作用・注意なし</h3>
        </div>
        <p className="insight-clear-desc">
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
                <strong className={w.severity === 'danger' ? 'severity-danger' : 'severity-warning'}>
                  {w.severity === 'danger' ? '併用禁忌:' : '併用注意:'}
                </strong>{' '}
                {w.drug1} と {w.drug2}（{w.message}）
              </>
            )}
            {w.type === 'usage' && (
              <>
                <strong className={w.severity === 'danger' ? 'severity-danger' : 'severity-warning'}>
                  {w.severity === 'danger' ? '病態禁忌/注意:' : '用法注意:'}
                </strong>{' '}
                {w.drug}（{w.message}）
              </>
            )}
            {w.type === 'patient_alert' && (
              <>
                <strong className={w.severity === 'danger' ? 'severity-danger' : 'severity-warning'}>
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
        <div>
          <h3>AI補助 SOAP下書き</h3>
          <span className="soap-ai-disclaimer">【定型文】医薬品マスタ・監査ルールに基づく補助候補（臨床判断ではありません）</span>
        </div>
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
              title="SOAPへ未確認下書きとして反映（内容を確認・承認してください）"
            >
              <Plus size={14} aria-hidden="true" />
              <span>SOAPへ反映</span>
            </button>
          </div>
        ))}
      </div>
      <style jsx>{`
        .soap-ai-disclaimer {
          display: block;
          font-size: var(--fs-2xs);
          color: var(--text-muted);
          font-weight: 500;
          margin-top: 0.15rem;
        }
      `}</style>
    </div>
  );
});

export const VitalInsightCard = React.memo(function VitalInsightCard() {
  return (
    <div className="insight-card vital">
      <div className="insight-header">
        <h3>バイタル・臨床検査値</h3>
      </div>
      <p className="insight-empty-text">
        最新の検査値（eGFR / Blood Pressure等）は未登録です
      </p>
    </div>
  );
});

type GuidanceDropdownEntry = { type: SoapEntryType; text: string };

// 薬ごとの「服薬指導補助」ドロップダウンの中身。登録済みの文例（S/O/A/P）の一覧、
// 読み込み中・未登録・読み込み失敗の表示、マニュアル編集への入口を持つ。
export function GuidanceDropdownPanel({
  loadStatus,
  entries,
  onSelectEntry,
  onEdit
}: {
  loadStatus: GuidanceLoadStatus;
  entries: GuidanceDropdownEntry[];
  onSelectEntry: (entry: GuidanceDropdownEntry) => void;
  onEdit: () => void;
}) {
  const state = getGuidanceDropdownState({ loadStatus, entryCount: entries.length });
  return (
    <div className="guidance-dropdown">
      <div className="guidance-header">サジェスト（クリックでアクティブなプロブレムに追記）</div>
      <div className="guidance-list">
        {state.status === 'list' ? (
          entries.map((entry, index) => (
            <button
              key={`${entry.type}-${index}`}
              type="button"
              className="guidance-item"
              onClick={() => onSelectEntry(entry)}
            >
              <span className={`tag ${entry.type.toLowerCase()}`}>{entry.type}</span>
              <span className="text">{entry.text}</span>
            </button>
          ))
        ) : state.status === 'error' ? (
          <p className="guidance-state is-error" role="alert">{state.message}</p>
        ) : (
          <p className="guidance-state">{state.message}</p>
        )}
      </div>
      <div className="guidance-footer">
        <button type="button" className="guidance-item edit" onClick={onEdit}>
          <BookOpen size={14} aria-hidden="true" />
          マニュアルを編集
        </button>
      </div>

      <style jsx>{`
        .guidance-dropdown {
          position: absolute;
          top: calc(100% + 0.25rem);
          right: 0;
          width: min(320px, 80vw);
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-md);
          z-index: 100;
          padding: 0.25rem;
          display: flex;
          flex-direction: column;
        }
        .guidance-header {
          font-size: var(--fs-2xs);
          color: var(--text-ghost);
          padding: 0.25rem 0.5rem;
          margin-bottom: 0.25rem;
          border-bottom: 1px dashed var(--border);
        }
        .guidance-list {
          max-height: 250px;
          overflow-y: auto;
        }
        .guidance-state {
          margin: 0;
          padding: 0.5rem;
          font-size: var(--fs-xs);
          color: var(--text-ghost);
          text-align: center;
        }
        .guidance-state.is-error {
          color: var(--danger);
          font-weight: 700;
          text-align: left;
        }
        .guidance-footer {
          border-top: 1px solid var(--border);
          margin-top: 0.25rem;
          padding-top: 0.25rem;
        }
        .guidance-item {
          display: flex;
          align-items: flex-start;
          text-align: left;
          width: 100%;
          background: transparent;
          border: none;
          padding: 0.5rem;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: var(--fs-xs);
        }
        .guidance-item:hover { background: var(--bg-hover); }
        .guidance-item .tag {
          font-weight: 800;
          font-size: var(--fs-2xs);
          margin-right: 0.5rem;
          padding: 0.1rem 0.3rem;
          border-radius: 4px;
        }
        .guidance-item .tag.s { color: var(--status-blue); background: rgba(59, 130, 246, 0.1); }
        .guidance-item .tag.o { color: var(--status-green); background: rgba(34, 197, 94, 0.1); }
        .guidance-item .tag.a { color: var(--status-orange); background: rgba(249, 115, 22, 0.1); }
        .guidance-item .tag.p { color: var(--status-purple); background: rgba(168, 85, 247, 0.1); }
        .guidance-item .text {
          flex: 1;
          color: var(--text-main);
          line-height: 1.4;
        }
        .guidance-item.edit {
          color: var(--primary);
          font-weight: 600;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
        }
        .guidance-item.edit:hover { background: var(--primary-light); }
      `}</style>
    </div>
  );
}

export const DocLinkInsightCard = React.memo(function DocLinkInsightCard({
  prescribedDrugs,
  onSelectGuidance
}: {
  prescribedDrugs?: any[];
  onSelectGuidance: (type: SoapEntryType, text: string) => void;
}) {
  const db = useDatabase();
  const [selectedDrug, setSelectedDrug] = useState<any>(null);
  const [guidanceByDrugCode, setGuidanceByDrugCode] = useState<Record<string, GuidanceDropdownEntry[]>>({});
  const [loadStatus, setLoadStatus] = useState<GuidanceLoadStatus>('loading');
  const [openDrugCode, setOpenDrugCode] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const displayDrugs = useMemo(() => getUniquePrescribedDrugs(prescribedDrugs), [prescribedDrugs]);
  const drugCodesKey = displayDrugs.map((drug) => drug.code || '').filter(Boolean).join('|');

  useEffect(() => {
    if (!db) return;
    let isMounted = true;
    const codes = drugCodesKey ? drugCodesKey.split('|') : [];
    if (codes.length === 0) {
      setGuidanceByDrugCode({});
      setLoadStatus('ready');
      return;
    }
    setLoadStatus('loading');
    const fetchGuidances = async () => {
      try {
        if (!db.medication_guidances) {
          throw new Error('medication_guidances collection not found');
        }
        const docs = await db.medication_guidances.find({ selector: { drugCode: { $in: codes } } }).exec();
        if (!isMounted) return;
        setGuidanceByDrugCode(buildGuidanceEntriesByDrugCode(docs.map((doc) => doc.toJSON())));
        setLoadStatus('ready');
      } catch (error) {
        console.error('Failed to fetch guidances:', error);
        if (!isMounted) return;
        setGuidanceByDrugCode({});
        setLoadStatus('error');
        toast.error(GUIDANCE_LOAD_ERROR_TOAST);
      }
    };
    fetchGuidances();
    return () => { isMounted = false; };
  }, [db, drugCodesKey, reloadKey]);

  return (
    <>
      <div id="emr-prescription-doc-links" className="insight-card default emr-prescription-doc-links">
        <div className="insight-header">
          <FileText size={18} className="icon-default" />
          <h3>添付文書・服薬指導補助</h3>
        </div>
        {displayDrugs.length === 0 ? (
          <p className="insight-empty-text">
            処方薬を読み込み中...
          </p>
        ) : (
          <div className="doc-drug-list">
            {displayDrugs.map((drug) => {
              const drugKey = drug.code || drug.name || '';
              const isOpen = openDrugCode === drugKey;
              const documentUrl = getSafeDocumentUrl(drug.documentUrl);
              return (
                <div key={drugKey} className="doc-drug-row">
                  <div className="doc-drug-info">
                    <div className="doc-drug-name">{drug.name}</div>
                    <div className="doc-drug-links">
                      {documentUrl ? (
                        <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="doc-link">
                          添付文書 ↗
                        </a>
                      ) : (
                        <span className="doc-link-none">添付文書なし</span>
                      )}
                    </div>
                  </div>
                  <div className="guidance-anchor">
                    <button
                      type="button"
                      className="btn-secondary guidance-trigger"
                      aria-expanded={isOpen}
                      onClick={() => setOpenDrugCode(isOpen ? null : drugKey)}
                    >
                      <BookOpen size={14} aria-hidden="true" />
                      服薬指導補助
                      <ChevronDown size={14} aria-hidden="true" />
                    </button>
                    {isOpen && (
                      <GuidanceDropdownPanel
                        loadStatus={loadStatus}
                        entries={guidanceByDrugCode[drug.code || ''] || []}
                        onSelectEntry={(entry) => {
                          onSelectGuidance(entry.type, entry.text);
                          setOpenDrugCode(null);
                        }}
                        onEdit={() => {
                          setOpenDrugCode(null);
                          // 文例は全患者のSOAPに追記される共有の参照データなので、編集できるのは権限のあるスタッフだけ
                          const permission = checkMedicationGuidanceEditPermission(getCurrentUser());
                          if (!permission.ok) {
                            toast.error(permission.message);
                            return;
                          }
                          setSelectedDrug(drug);
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <style jsx>{`
          .insight-card {
            background: var(--bg-card);
            border-radius: var(--radius-md);
            padding: 1.25rem;
            border: 1px solid var(--border);
            box-shadow: var(--shadow-sm);
          }
          .insight-card.default { border-left: 4px solid var(--text-ghost); }
          .insight-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 1rem;
          }
          .insight-header h3 {
            font-size: 1rem;
            margin: 0;
          }
          .icon-default { color: var(--text-ghost); }
          .insight-empty-text {
            font-size: var(--fs-md);
            color: var(--text-ghost);
            margin: 0;
            font-weight: 700;
          }
          .doc-drug-list {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }
          .doc-drug-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid var(--border);
          }
          .doc-drug-row:last-child { border-bottom: none; padding-bottom: 0; }
          .doc-drug-info { min-width: 0; }
          .doc-drug-name {
            font-weight: 600;
            font-size: var(--fs-sm);
            margin-bottom: 0.25rem;
            overflow-wrap: anywhere;
          }
          .doc-drug-links { display: flex; gap: 0.5rem; }
          .doc-link {
            font-size: var(--fs-xs);
            color: var(--primary);
            text-decoration: none;
          }
          .doc-link:hover { text-decoration: underline; }
          .doc-link-none {
            font-size: var(--fs-xs);
            color: var(--text-ghost);
          }
          .guidance-anchor { position: relative; flex-shrink: 0; }
          .guidance-trigger {
            display: flex;
            align-items: center;
            gap: 0.25rem;
            padding: 0.25rem 0.5rem;
            font-size: var(--fs-xs);
          }
        `}</style>
      </div>

      <MedicationGuidanceModal
        isOpen={!!selectedDrug}
        onClose={() => {
          setSelectedDrug(null);
          // 登録・編集した文例をドロップダウンへ反映する
          setReloadKey((key) => key + 1);
        }}
        drug={selectedDrug}
        db={db ?? undefined}
      />
    </>
  );
});
