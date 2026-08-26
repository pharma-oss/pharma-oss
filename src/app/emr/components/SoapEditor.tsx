import React, { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MessageSquare, Trash2, Plus, History, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useDatabase } from '@/db/DatabaseProvider';
import { getCurrentUser } from '@/lib/audit';
import type { Visit, SoapRecord as DbSoapRecord, SoapStructuredAssessment } from '@/db/types';
import {
  SoapEntryBox,
  SoapSaveStatusIndicator,
  SoapStructuredAssessmentPanel,
  type SoapProblem,
  type SoapEntry,
  type SoapEntryType,
  type SoapSaveStatus,
  soapEntryTypeMeta
} from './SoapComponents';
import {
  createDefaultSoapStructuredAssessment,
  normalizeSoapStructuredAssessment,
  getMissingSoapStructuredAssessmentFields
} from '@/lib/soap_structured_assessment';
import { buildPastProblemSuggestions } from '@/lib/emr_patient_history';

export interface SoapEditorProps {
  targetVisitId: string | null;
  registerFlush?: (fn: (() => Promise<{ hasContent: boolean; missingStructuredFields: string[]; unconfirmedAiDraftCount: number }>) | null) => void;
  onResolvedVisitChange?: (visitId: string | null) => void;
}

export const SoapEditor: React.FC<SoapEditorProps> = ({
  targetVisitId,
  registerFlush,
  onResolvedVisitChange
}) => {
  const db = useDatabase();
  // null=解決中。false=受付なし(入力しても保存されないため、エディタの代わりに案内を表示する)。
  const [hasResolvedVisit, setHasResolvedVisit] = useState<boolean | null>(null);
  const [problems, setProblems] = useState<SoapProblem[]>([
    {
      id: uuidv4(),
      title: '#1 ',
      entries: [
        { id: uuidv4(), type: 'S', text: '' },
        { id: uuidv4(), type: 'O', text: '' },
        { id: uuidv4(), type: 'A', text: '' },
        { id: uuidv4(), type: 'P', text: '' }
      ]
    }
  ]);

  const [activeProblemId, setActiveProblemId] = useState<string | null>(null);
  const [pastProblemSuggestions, setPastProblemSuggestions] = useState<string[]>([]);
  const [structuredAssessment, setStructuredAssessment] = useState<SoapStructuredAssessment>(() => createDefaultSoapStructuredAssessment());
  const [saveStatus, setSaveStatus] = useState<SoapSaveStatus>('loading');
  const [lastSavedAt, setLastSavedAt] = useState('');

  // Persistence: resolve the active visit, load its saved SOAP on mount, and
  // autosave edits to db.soap_records so nothing the pharmacist writes is lost.
  const resolvedVisitIdRef = useRef<string | null>(null);
  const soapIdRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const dirtyRef = useRef(false);
  const problemsRef = useRef(problems);
  const structuredAssessmentRef = useRef(structuredAssessment);
  problemsRef.current = problems;
  structuredAssessmentRef.current = structuredAssessment;

  useEffect(() => {
    let cancelled = false;
    loadedRef.current = false;
    dirtyRef.current = false;
    setSaveStatus('loading');
    setLastSavedAt('');
    setHasResolvedVisit(null);
    setStructuredAssessment(createDefaultSoapStructuredAssessment());
    (async () => {
      if (!db) return;
      let visitId = targetVisitId;
      if (!visitId) {
        const processing = await db.visits.find({ selector: { status: 'processing' } }).exec();
        visitId = processing[0]?.visitId ?? null;
      }
      if (cancelled) return;
      resolvedVisitIdRef.current = visitId;
      setHasResolvedVisit(!!visitId);
      onResolvedVisitChange?.(visitId);
      if (!visitId) {
        loadedRef.current = true;
        setSaveStatus('saved');
        return;
      }
      try {
        const existing = await db.soap_records.find({ selector: { visitId } }).exec();
        if (cancelled) return;
        const record = existing[0]?.toJSON?.() ?? existing[0];
        soapIdRef.current = record?.soapId ?? `soap_${visitId}`;
        if (record && Array.isArray(record.problems) && record.problems.length > 0) {
          setProblems(record.problems.map((p: any) => ({
            id: p.id || uuidv4(),
            title: p.title || '',
            entries: (p.entries || []).map((e: any) => ({
              id: e.id || uuidv4(),
              type: e.type as SoapEntryType,
              text: e.text || '',
              origin: e.origin || 'legacy_unspecified',
              aiStatus: e.aiStatus,
              aiDraftId: e.aiDraftId,
              confirmedAt: e.confirmedAt,
              confirmedBy: e.confirmedBy
            }))
          })));
          setActiveProblemId(null);
        }
        setStructuredAssessment(normalizeSoapStructuredAssessment(record?.structuredAssessment));
        setLastSavedAt(record?.updatedAt || '');
        setSaveStatus('saved');
      } catch (err) {
        console.error('Failed to load SOAP record:', err);
        if (!cancelled) setSaveStatus('error');
      } finally {
        if (!cancelled) loadedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [db, targetVisitId, onResolvedVisitChange]);

  useEffect(() => {
    let cancelled = false;

    async function loadPastProblemSuggestions() {
      if (!db) {
        setPastProblemSuggestions([]);
        return;
      }

      try {
        let visitId = targetVisitId;
        if (!visitId) {
          const processing = await db.visits.find({ selector: { status: 'processing' } }).exec();
          visitId = processing[0]?.visitId ?? null;
        }
        if (!visitId) {
          if (!cancelled) setPastProblemSuggestions([]);
          return;
        }

        const currentVisitDoc = await db.visits.findOne(visitId).exec();
        const currentVisit = currentVisitDoc?.toJSON?.() ?? currentVisitDoc;
        if (!currentVisit?.patientId) {
          if (!cancelled) setPastProblemSuggestions([]);
          return;
        }

        const visitDocs = await db.visits.find({ selector: { patientId: currentVisit.patientId } }).exec();
        const pastVisitIds = visitDocs
          .map((visitDoc) => visitDoc.toJSON() as Visit)
          .map((visit) => visit.visitId)
          .filter((id) => id !== visitId);

        const soapDocs = pastVisitIds.length > 0
          ? await db.soap_records.find({ selector: { visitId: { $in: pastVisitIds } } }).exec()
          : [];
        const soapRecords = soapDocs.map((soapDoc) => soapDoc.toJSON()) as DbSoapRecord[];

        if (!cancelled) {
          setPastProblemSuggestions(buildPastProblemSuggestions(soapRecords));
        }
      } catch (error) {
        console.error('Failed to load past problem suggestions:', error);
        if (!cancelled) setPastProblemSuggestions([]);
      }
    }

    loadPastProblemSuggestions();
    return () => { cancelled = true; };
  }, [db, targetVisitId]);

  const persistSoap = useCallback(async (): Promise<{ hasContent: boolean; missingStructuredFields: string[]; unconfirmedAiDraftCount: number }> => {
    const current = problemsRef.current;
    const assessment = normalizeSoapStructuredAssessment(structuredAssessmentRef.current);
    const hasContent = current.some((p: SoapProblem) => p.entries.some((e: { text: string }) => e.text.trim().length > 0));
    const missingStructuredFields = getMissingSoapStructuredAssessmentFields(assessment);
    const unconfirmedAiDraftCount = current.reduce((sum, p) => sum + p.entries.filter(e => e.origin === 'ai_draft' && e.aiStatus === 'unconfirmed').length, 0);
    const visitId = resolvedVisitIdRef.current;
    if (!db || !visitId) return { hasContent, missingStructuredFields, unconfirmedAiDraftCount };
    const soapId = soapIdRef.current || `soap_${visitId}`;
    soapIdRef.current = soapId;
    setSaveStatus('saving');
    const updatedAt = new Date().toISOString();
    try {
      await db.soap_records.upsert({
        soapId,
        visitId,
        authorId: getCurrentUser().userId,
        problems: current.map((p: SoapProblem) => ({
          id: p.id,
          title: p.title,
          entries: p.entries.map((e: SoapEntry) => ({
            id: e.id,
            type: e.type as SoapEntryType,
            text: e.text,
            origin: e.origin,
            aiStatus: e.aiStatus,
            aiDraftId: e.aiDraftId,
            confirmedAt: e.confirmedAt,
            confirmedBy: e.confirmedBy
          }))
        })),
        structuredAssessment: assessment,
        updatedAt
      });
      setLastSavedAt(updatedAt);
      setSaveStatus(dirtyRef.current ? 'dirty' : 'saved');
    } catch (err) {
      console.error('Failed to save SOAP record:', err);
      dirtyRef.current = true;
      setSaveStatus('error');
      throw err;
    }
    return { hasContent, missingStructuredFields, unconfirmedAiDraftCount };
  }, [db]);

  // Debounced autosave once the existing record has loaded and the user edited.
  useEffect(() => {
    if (!loadedRef.current || !dirtyRef.current) return;
    const handle = setTimeout(() => {
      dirtyRef.current = false;
      void persistSoap().catch(() => undefined);
    }, 700);
    return () => clearTimeout(handle);
  }, [problems, structuredAssessment, persistSoap]);

  // Expose an immediate flush so the parent can guarantee a save before completing.
  useEffect(() => {
    if (!registerFlush) return;
    registerFlush(async () => {
      dirtyRef.current = false;
      return persistSoap();
    });
    return () => registerFlush(null);
  }, [registerFlush, persistSoap]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current && saveStatus !== 'saving') return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  const markSoapDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveStatus('dirty');
  }, []);

  useEffect(() => {
    if (problems.length > 0 && !activeProblemId) {
      setActiveProblemId(problems[0].id);
    }
  }, [problems, activeProblemId]);

  useEffect(() => {
    const handleInsert = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const { type, text, origin, aiStatus, aiDraftId } = detail;
      markSoapDirty();
      setProblems((prev: SoapProblem[]) => {
        const targetId = activeProblemId || prev[0]?.id;
        if (!targetId) return prev;

        return prev.map((p: SoapProblem) => {
          if (p.id !== targetId) return p;
          // 同種の空欄エントリがあればそこへ入れ、空箱を増やさない。
          const emptyIndex = p.entries.findIndex((entry: { type: string; text: string }) => entry.type === type && entry.text.trim() === '');
          if (emptyIndex >= 0) {
            const entries = [...p.entries];
            entries[emptyIndex] = {
              ...entries[emptyIndex],
              text,
              origin: origin || (origin === undefined ? 'manual' : origin),
              aiStatus: aiStatus || (origin === 'ai_draft' ? 'unconfirmed' : undefined),
              aiDraftId: aiDraftId || entries[emptyIndex].aiDraftId
            };
            return { ...p, entries };
          }
          return {
            ...p,
            entries: [
              ...p.entries,
              {
                id: uuidv4(),
                type: type as SoapEntryType,
                text,
                origin: origin || (origin === undefined ? 'manual' : origin),
                aiStatus: aiStatus || (origin === 'ai_draft' ? 'unconfirmed' : undefined),
                aiDraftId
              }
            ]
          };
        });
      });
      toast.success(`${type}に指導項目を追記しました`);
    };
    document.addEventListener('insert-soap-guidance', handleInsert);
    return () => document.removeEventListener('insert-soap-guidance', handleInsert);
  }, [activeProblemId, markSoapDirty]);

  const addProblem = (title: string = '') => {
    markSoapDirty();
    setProblems([...problems, { id: uuidv4(), title: `#${problems.length + 1} ${title}`, entries: [{ id: uuidv4(), type: 'S', text: '', origin: 'manual' }] }]);
  };

  const removeProblem = useCallback((probId: string) => {
    markSoapDirty();
    setProblems((prev: SoapProblem[]) => prev.filter((p: SoapProblem) => p.id !== probId));
  }, [markSoapDirty]);

  const updateProblemTitle = useCallback((probId: string, title: string) => {
    markSoapDirty();
    setProblems((prev: SoapProblem[]) => prev.map((p: SoapProblem) => p.id === probId ? { ...p, title } : p));
  }, [markSoapDirty]);

  const addEntry = useCallback((probId: string, type: SoapEntryType) => {
    markSoapDirty();
    setProblems((prev: SoapProblem[]) => prev.map((p: SoapProblem) => {
      if (p.id === probId) {
        return { ...p, entries: [...p.entries, { id: uuidv4(), type, text: '', origin: 'manual' }] };
      }
      return p;
    }));
  }, [markSoapDirty]);

  const updateEntry = useCallback((probId: string, entryId: string, text: string) => {
    markSoapDirty();
    const currentUser = getCurrentUser();
    setProblems((prev: SoapProblem[]) => prev.map((p: SoapProblem) => {
      if (p.id === probId) {
        return {
          ...p,
          entries: p.entries.map((e: SoapEntry) => {
            if (e.id === entryId) {
              const wasAi = e.origin === 'ai_draft';
              return {
                ...e,
                text,
                origin: e.origin || 'manual',
                aiStatus: wasAi ? 'modified' : e.aiStatus,
                confirmedAt: wasAi ? new Date().toISOString() : e.confirmedAt,
                confirmedBy: wasAi ? currentUser.userId : e.confirmedBy
              };
            }
            return e;
          })
        };
      }
      return p;
    }));
  }, [markSoapDirty]);

  const approveEntry = useCallback((probId: string, entryId: string) => {
    markSoapDirty();
    const currentUser = getCurrentUser();
    const confirmedAt = new Date().toISOString();

    // 承認後のエントリは setProblems の外で組み立てる。
    // updater は React が遅延実行するため、updater 内で代入した変数は
    // この直後の dispatch 時点ではまだ null で、監査ログが記録されない。
    const targetEntry = problems
      .find((p: SoapProblem) => p.id === probId)
      ?.entries.find((e: SoapEntry) => e.id === entryId);
    const approvedTarget: SoapEntry | null = targetEntry
      ? { ...targetEntry, aiStatus: 'approved', confirmedAt, confirmedBy: currentUser.userId }
      : null;

    setProblems((prev: SoapProblem[]) => prev.map((p: SoapProblem) => {
      if (p.id === probId) {
        return {
          ...p,
          entries: p.entries.map((e: SoapEntry) => (
            e.id === entryId
              ? { ...e, aiStatus: 'approved' as const, confirmedAt, confirmedBy: currentUser.userId }
              : e
          ))
        };
      }
      return p;
    }));
    toast.success('AI下書きを承認しました');
    if (approvedTarget) {
      document.dispatchEvent(new CustomEvent('soap-ai-draft-approved', {
        detail: { entry: approvedTarget, reviewer: currentUser }
      }));
    }
  }, [markSoapDirty, problems]);

  const removeEntry = useCallback((probId: string, entryId: string) => {
    markSoapDirty();
    setProblems((prev: SoapProblem[]) => prev.map((p: SoapProblem) => {
      if (p.id === probId) {
        return { ...p, entries: p.entries.filter((e: { id: string }) => e.id !== entryId) };
      }
      return p;
    }));
  }, [markSoapDirty]);

  const updateStructuredAssessment = useCallback(<K extends keyof SoapStructuredAssessment>(
    field: K,
    value: NonNullable<SoapStructuredAssessment[K]>
  ) => {
    markSoapDirty();
    setStructuredAssessment((prev: SoapStructuredAssessment) => normalizeSoapStructuredAssessment({
      ...prev,
      [field]: value
    }));
  }, [markSoapDirty]);

  const handleImmediateSave = useCallback(() => {
    dirtyRef.current = false;
    void persistSoap()
      .then(() => {
        if (resolvedVisitIdRef.current) toast.success('薬歴を保存しました');
      })
      .catch(() => undefined);
  }, [persistSoap]);

  const handleEditorKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      handleImmediateSave();
    }
  }, [handleImmediateSave]);

  const [isPastMenuOpen, setIsPastMenuOpen] = useState(false);
  const pastMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isPastMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!pastMenuRef.current?.contains(event.target as Node)) {
        setIsPastMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPastMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPastMenuOpen]);

  if (hasResolvedVisit === false) {
    return (
      <div className="soap-editor-empty" role="status">
        <MessageSquare size={26} aria-hidden="true" />
        <h3>受付が選択されていません</h3>
        <p>
          薬歴を記録するには処理中の受付が必要です。
          受付がない状態では入力内容は保存されません。
        </p>
        <div className="empty-actions">
          <a className="btn-secondary" href="/ocr">処方箋OCRで受付を開始</a>
          <a className="btn-secondary" href="/">ダッシュボードで受付を確認</a>
        </div>
        <style jsx>{`
          .soap-editor-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.6rem;
            padding: 2.5rem 1.5rem;
            text-align: center;
            color: var(--text-muted);
            border: 1px dashed var(--border-strong);
            border-radius: var(--radius-md);
            background: var(--bg-card);
          }
          .soap-editor-empty h3 {
            margin: 0;
            color: var(--text-main);
            font-size: 1.02rem;
            font-weight: 800;
          }
          .soap-editor-empty p {
            margin: 0;
            font-size: var(--fs-md);
            line-height: 1.7;
            max-width: 420px;
          }
          .empty-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 0.6rem;
            margin-top: 0.5rem;
          }
          .empty-actions a {
            text-decoration: none;
            display: inline-flex;
            align-items: center;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="soap-editor-container" onKeyDown={handleEditorKeyDown}>
      <div className="soap-editor-toolbar">
        <span className="keyboard-hint">Ctrl(⌘)+Enter で即時保存</span>
        <SoapSaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
      </div>
      <SoapStructuredAssessmentPanel
        assessment={structuredAssessment}
        onChange={updateStructuredAssessment}
      />
      {problems.map(problem => (
        <div key={problem.id} className={`problem-block ${activeProblemId === problem.id ? 'active' : ''}`} onClick={() => setActiveProblemId(problem.id)}>
          <div className="problem-header">
            <input
              type="text"
              value={problem.title}
              onChange={(e) => updateProblemTitle(problem.id, e.target.value)}
              placeholder="#1 プロブレム名（例: 高血圧、副作用フォロー）"
              className="problem-title-input"
            />
            {activeProblemId === problem.id && problems.length > 1 && (
              <span className="active-target-badge" title="指導文・AI下書きはこのプロブレムへ挿入されます">挿入先</span>
            )}
            {problems.length > 1 && (
              <button onClick={() => removeProblem(problem.id)} className="btn-remove-problem" aria-label="プロブレムを削除" title="プロブレムを削除">
                <Trash2 size={16} />
              </button>
            )}
          </div>
          <div className="problem-entries">
            {problem.entries.map((entry: any) => (
              <SoapEntryBox
                key={entry.id}
                entry={entry}
                onChange={(text) => updateEntry(problem.id, entry.id, text)}
                onRemove={() => removeEntry(problem.id, entry.id)}
                onApprove={() => approveEntry(problem.id, entry.id)}
              />
            ))}
          </div>
          <div className="problem-actions">
            <span className="actions-label">追加:</span>
            {(['S', 'O', 'A', 'P'] as SoapEntryType[]).map(type => (
              <button
                key={type}
                className={`btn-add-entry ${type.toLowerCase()}`}
                onClick={() => addEntry(problem.id, type)}
              >
                <strong>+ {type}</strong> {soapEntryTypeMeta[type].subLabel}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="soap-editor-footer">
        <button className="btn-secondary btn-new-problem" onClick={() => addProblem()}>
          <Plus size={14} className="icon-plus" /> 新規プロブレム
        </button>
        <div className="past-problem-menu-wrap" ref={pastMenuRef}>
          <button
            type="button"
            className="past-problem-trigger"
            aria-haspopup="menu"
            aria-expanded={isPastMenuOpen}
            disabled={pastProblemSuggestions.length === 0}
            title={pastProblemSuggestions.length === 0 ? 'この患者の過去プロブレムはまだありません' : ''}
            onClick={() => setIsPastMenuOpen(open => !open)}
          >
            <History size={14} aria-hidden="true" />
            過去のプロブレムから追加
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {isPastMenuOpen && (
            <div className="past-problem-menu" role="menu" aria-label="過去のプロブレム候補">
              {pastProblemSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  role="menuitem"
                  className="past-problem-item"
                  onClick={() => {
                    addProblem(suggestion);
                    setIsPastMenuOpen(false);
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <style jsx>{`
        .soap-editor-container {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .soap-editor-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 0.75rem;
          position: sticky;
          top: 0;
          z-index: 5;
          background: #fdfdfd;
          padding: 0.3rem 0;
        }
        .keyboard-hint {
          font-size: var(--fs-xs);
          font-weight: 700;
          color: var(--text-ghost);
        }
        .problem-block {
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 0.85rem;
          background: var(--bg-subtle);
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
        }
        .problem-block.active {
          border-color: var(--primary);
          box-shadow: 0 0 0 2px var(--primary-light);
          background: var(--bg-card);
        }
        .problem-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }
        .problem-title-input {
          flex: 1;
          min-width: 0;
          font-weight: 600;
          font-size: 1.05rem;
          color: var(--text-main);
          border: none;
          background: transparent;
          border-bottom: 1px solid transparent;
          padding: 0.2rem;
        }
        .problem-title-input:focus {
          outline: none;
          border-bottom: 1px solid var(--primary);
        }
        .active-target-badge {
          flex-shrink: 0;
          border-radius: 999px;
          background: var(--primary-light);
          color: var(--primary-dark);
          border: 1px solid var(--primary-soft);
          padding: 0.1rem 0.55rem;
          font-size: var(--fs-xs);
          font-weight: 850;
          white-space: nowrap;
        }
        .btn-remove-problem {
          flex-shrink: 0;
          background: transparent;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: var(--radius-sm);
          color: var(--text-ghost);
          opacity: 0;
          transition: opacity var(--transition-fast), color var(--transition-fast);
        }
        .problem-block:hover .btn-remove-problem,
        .problem-block:focus-within .btn-remove-problem,
        .btn-remove-problem:focus-visible {
          opacity: 1;
        }
        .btn-remove-problem:hover {
          background: var(--danger-soft);
          color: var(--danger);
        }
        .problem-entries {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          margin-bottom: 0.75rem;
        }
        .problem-actions {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.4rem;
          padding-top: 0.5rem;
          border-top: 1px dashed var(--border);
        }
        .actions-label {
          font-size: var(--fs-sm);
          color: var(--text-ghost);
          font-weight: 700;
          margin-right: 0.25rem;
        }
        .btn-add-entry {
          display: inline-flex;
          align-items: center;
          gap: 0.28rem;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 0.22rem 0.7rem;
          font-size: var(--fs-sm);
          font-weight: 700;
          color: var(--text-muted);
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .btn-add-entry strong {
          font-weight: 850;
        }
        .btn-add-entry:hover { background: var(--bg-hover); }
        .btn-add-entry.s strong { color: var(--status-blue); }
        .btn-add-entry.o strong { color: var(--status-green); }
        .btn-add-entry.a strong { color: var(--status-orange); }
        .btn-add-entry.p strong { color: var(--status-purple); }
        .btn-add-entry.s:hover { border-color: var(--status-blue); }
        .btn-add-entry.o:hover { border-color: var(--status-green); }
        .btn-add-entry.a:hover { border-color: var(--status-orange); }
        .btn-add-entry.p:hover { border-color: var(--status-purple); }
        .soap-editor-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          margin-top: 0.25rem;
        }
        .past-problem-menu-wrap {
          position: relative;
        }
        .past-problem-trigger {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: var(--fs-md);
          font-weight: 700;
          color: var(--text-muted);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          padding: 0.4rem 0.7rem;
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .past-problem-trigger:hover:not(:disabled) {
          border-color: var(--primary);
          color: var(--primary-dark);
          background: var(--primary-light);
        }
        .past-problem-trigger:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .past-problem-trigger:focus-visible {
          outline: none;
          border-color: var(--border-focus);
          box-shadow: 0 0 0 3px var(--primary-light);
        }
        .past-problem-menu {
          position: absolute;
          bottom: calc(100% + 6px);
          left: 0;
          min-width: 240px;
          max-width: 340px;
          max-height: 260px;
          overflow-y: auto;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-md);
          padding: 0.35rem;
          display: grid;
          gap: 0.15rem;
          z-index: 30;
        }
        .past-problem-item {
          text-align: left;
          border: none;
          background: transparent;
          border-radius: var(--radius-sm);
          padding: 0.45rem 0.6rem;
          font-size: var(--fs-md);
          font-weight: 700;
          color: var(--text-main);
          cursor: pointer;
          overflow-wrap: anywhere;
        }
        .past-problem-item:hover,
        .past-problem-item:focus-visible {
          background: var(--primary-light);
          color: var(--primary-dark);
          outline: none;
        }
      `}</style>
    </div>
  );
};

export default SoapEditor;
