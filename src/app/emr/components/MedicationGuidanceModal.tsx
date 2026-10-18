import { Loader2, Save, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { getGuidanceDuplicateNotice, pickGuidanceDocument, type GuidanceDocumentLike } from '@/lib/medication_guidance';
import { getCurrentUser, logAuditAction } from '@/lib/audit';
import {
  checkMedicationGuidanceEditPermission,
  getMedicationGuidanceSaveErrorMessage,
  saveMedicationGuidance
} from '@/lib/medication_guidance_write';

export interface MedicationGuidanceEntry {
  id?: string;
  type: string;
  text: string;
}

export interface MedicationGuidanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  drug: {
    code?: string;
    name?: string;
    [key: string]: any;
  } | null | undefined;
  db?: any;
  initialEntries?: MedicationGuidanceEntry[];
  initialLoadError?: boolean;
}

export const MEDICATION_GUIDANCE_LOAD_ERROR_MESSAGE =
  '服薬指導記録の読み込みに失敗しました。既存の記録を上書きしないよう保存を停止しています。モーダルを閉じて再度開いてください。';

export interface MedicationGuidanceModalViewState {
  status: 'loading' | 'error' | 'ready';
  errorMessage: string | null;
  isSaveDisabled: boolean;
  saveDisabledTitle: string;
}

export function getMedicationGuidanceModalViewState(
  isLoading: boolean,
  hasLoadError: boolean,
  isSaving: boolean
): MedicationGuidanceModalViewState {
  if (isLoading) {
    return {
      status: 'loading',
      errorMessage: null,
      isSaveDisabled: true,
      saveDisabledTitle: '読み込み中...'
    };
  }
  if (hasLoadError) {
    return {
      status: 'error',
      errorMessage: MEDICATION_GUIDANCE_LOAD_ERROR_MESSAGE,
      isSaveDisabled: true,
      saveDisabledTitle: '読み込みに失敗したため保存できません'
    };
  }
  return {
    status: 'ready',
    errorMessage: null,
    isSaveDisabled: isSaving,
    saveDisabledTitle: isSaving ? '保存中...' : ''
  };
}

export function normalizeGuidanceEntries(
  entries: Array<{ type: string; text: string; [key: string]: unknown }>
): Array<{ type: string; text: string }> {
  return entries.map((e) => ({
    type: typeof e.type === 'string' ? e.type.toUpperCase().trim() : 'S',
    text: typeof e.text === 'string' ? e.text.trim() : ''
  }));
}

export const MedicationGuidanceModal: React.FC<MedicationGuidanceModalProps> = ({
  isOpen,
  onClose,
  drug,
  db,
  initialEntries = [],
  initialLoadError = false
}) => {
  const [entries, setEntries] = useState<{ id: string; type: string; text: string }[]>(
    () => initialEntries.map((e) => ({ ...e, id: e.id || uuidv4() }))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(Boolean(initialLoadError));
  const [docId, setDocId] = useState<string | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    async function fetchGuidance() {
      if (!isOpen || !drug || !db) return;
      setIsLoading(true);
      setHasLoadError(false);
      setDuplicateCount(0);
      try {
        if (!db.medication_guidances) {
          throw new Error('medication_guidances collection not found');
        }
        const guidances = await db.medication_guidances
          .find({ selector: { drugCode: drug.code } })
          .exec();
        if (!isMounted) return;
        const documents = (guidances as Array<{ toJSON: () => GuidanceDocumentLike }>).map((doc) => doc.toJSON());
        const picked = pickGuidanceDocument(documents);
        setDuplicateCount(documents.length);
        if (picked) {
          setEntries(picked.entries.map((e) => ({ ...e, id: uuidv4() })));
          setDocId(picked.id);
        } else {
          setEntries([]);
          setDocId(null);
        }
        setHasLoadError(false);
      } catch (e) {
        console.error('Failed to fetch guidance:', e);
        if (isMounted) {
          setEntries([]);
          setDocId(null);
          setHasLoadError(true);
          toast.error('服薬指導記録の読み込みに失敗しました。');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    fetchGuidance();
    return () => {
      isMounted = false;
    };
  }, [isOpen, drug, db]);

  const addEntry = (type: string) => {
    setEntries([...entries, { id: uuidv4(), type, text: '' }]);
  };

  const updateEntry = (id: string, text: string) => {
    setEntries(entries.map((e) => (e.id === id ? { ...e, text } : e)));
  };

  const removeEntry = (id: string) => {
    setEntries(entries.filter((e) => e.id !== id));
  };

  const handleSave = async () => {
    if (!db || !drug || hasLoadError || isLoading) return;
    // 画面の入口でも確認しているが、保存の直前にも確認する（操作者がモーダルを開いたまま切り替わった場合など）
    const permission = checkMedicationGuidanceEditPermission(getCurrentUser());
    if (!permission.ok) {
      toast.error(permission.message);
      return;
    }
    setIsSaving(true);
    try {
      await saveMedicationGuidance({
        collection: db.medication_guidances,
        docId,
        drug: { code: drug.code || '', name: drug.name || '' },
        entries: normalizeGuidanceEntries(entries),
        now: new Date().toISOString(),
        newId: `guidance_${uuidv4()}`,
        logAudit: (detail) => logAuditAction(db, 'patient_medication_info_template', detail)
      });
      toast.success('服薬指導補助マニュアルを保存しました');
      onClose();
    } catch (e) {
      console.error('Failed to save guidance:', e);
      toast.error(getMedicationGuidanceSaveErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const viewState = getMedicationGuidanceModalViewState(isLoading, hasLoadError, isSaving);

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-md">
        <div className="modal-header">
          <h2>服薬指導補助マニュアル: {drug?.name}</h2>
          <button className="btn-icon" onClick={onClose}>
            <span className="close-icon">&times;</span>
          </button>
        </div>
        <div className="modal-body">
          {viewState.status === 'loading' ? (
            <div className="flex-center loading-container">
              <Loader2 className="spin" size={24} />
            </div>
          ) : viewState.status === 'error' ? (
            <p className="guidance-load-error" role="alert">
              {viewState.errorMessage}
            </p>
          ) : (
            <>
              <p className="guidance-desc">
                この薬剤に関する指導ポイントやヒントを登録できます。
              </p>
              {getGuidanceDuplicateNotice(duplicateCount) && (
                <p className="guidance-duplicate-note" role="note">
                  {getGuidanceDuplicateNotice(duplicateCount)}
                </p>
              )}

              <div className="guidance-entry-list">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="guidance-entry-row"
                  >
                    <div className={`guidance-type-badge is-${entry.type.toLowerCase()}`}>
                      {entry.type}
                    </div>
                    <textarea
                      value={entry.text}
                      onChange={(e) => updateEntry(entry.id, e.target.value)}
                      className="guidance-textarea"
                      placeholder="内容を入力..."
                    />
                    <button
                      className="btn-icon text-muted btn-trash-action"
                      onClick={() => removeEntry(entry.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="guidance-add-bar">
                <span className="guidance-add-label">
                  追加:
                </span>
                {['S', 'O', 'A', 'P'].map((type) => (
                  <button
                    key={type}
                    className={`btn-add-type is-${type.toLowerCase()}`}
                    onClick={() => addEntry(type)}
                  >
                    + {type}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            キャンセル
          </button>
          <span
            className="btn-tooltip-wrapper"
            data-disabled={viewState.isSaveDisabled}
            title={viewState.saveDisabledTitle}
          >
            <button className="btn-primary" onClick={handleSave} disabled={viewState.isSaveDisabled}>
              {isSaving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              保存
            </button>
          </span>
        </div>
      </div>
      <style jsx>{`
        .modal-md {
          width: 600px;
          max-width: 90vw;
        }
        .close-icon {
          font-size: 1.2rem;
        }
        .loading-container {
          height: 200px;
        }
        .guidance-desc {
          font-size: var(--fs-md);
          color: var(--text-ghost);
          margin-bottom: var(--space-4);
        }
        .guidance-duplicate-note {
          font-size: var(--fs-xs);
          color: var(--status-orange);
          margin: 0 0 var(--space-3);
          font-weight: 600;
        }
        .guidance-load-error {
          font-size: var(--fs-md);
          color: var(--status-red, #dc2626);
          margin-bottom: var(--space-4);
          font-weight: 600;
        }
        .guidance-entry-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          margin-bottom: var(--space-4);
        }
        .guidance-entry-row {
          display: flex;
          gap: var(--space-2);
          align-items: flex-start;
        }
        .guidance-type-badge {
          font-weight: 800;
          font-size: 1.2rem;
          padding-top: var(--space-2);
          width: 30px;
          text-align: center;
        }
        .guidance-type-badge.is-s { color: var(--status-blue); }
        .guidance-type-badge.is-o { color: var(--status-green); }
        .guidance-type-badge.is-a { color: var(--status-orange); }
        .guidance-type-badge.is-p { color: var(--status-purple); }
        .guidance-textarea {
          flex: 1;
          min-height: 60px;
          padding: var(--space-2);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          resize: vertical;
          background: var(--bg-card);
          color: var(--text-main);
          font-size: var(--fs-base);
          font-family: inherit;
        }
        .btn-trash-action {
          padding: var(--space-2);
        }
        .guidance-add-bar {
          display: flex;
          gap: var(--space-2);
          align-items: center;
        }
        .guidance-add-label {
          font-size: var(--fs-md);
          color: var(--text-ghost);
          align-self: center;
          margin-right: var(--space-2);
        }
        .btn-add-type {
          background: white;
          border: 1px solid var(--border);
          padding: 0.2rem 0.6rem;
          border-radius: var(--radius-sm);
          font-size: var(--fs-sm);
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .btn-add-type:hover {
          border-color: var(--primary);
          background: var(--primary-light);
        }
      `}</style>
    </div>
  );
};
