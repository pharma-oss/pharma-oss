import { Loader2, Save, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

export const MedicationGuidanceModal = ({
  isOpen,
  onClose,
  drug,
  db
}: {
  isOpen: boolean;
  onClose: () => void;
  drug: any;
  db: any;
}) => {
  const [entries, setEntries] = useState<{ id: string; type: string; text: string }[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [docId, setDocId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchGuidance() {
      if (!isOpen || !drug || !db) return;
      setIsLoading(true);
      try {
        if (!db.medication_guidances) {
          throw new Error('medication_guidances collection not found');
        }
        const guidances = await db.medication_guidances
          .find({ selector: { drugCode: drug.code } })
          .exec();
        if (!isMounted) return;
        if (guidances.length > 0) {
          setEntries(guidances[0].entries.map((e: any) => ({ ...e, id: uuidv4() })));
          setDocId(guidances[0].id);
        } else {
          setEntries([]);
          setDocId(null);
        }
      } catch (e) {
        console.error('Failed to fetch guidance:', e);
        if (isMounted) {
          setEntries([]);
          setDocId(null);
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
    if (!db || !drug) return;
    setIsSaving(true);
    try {
      const cleanEntries = entries.map((e) => ({ type: e.type, text: e.text }));
      if (docId) {
        const doc = await db.medication_guidances.findOne({ selector: { id: docId } }).exec();
        if (doc) {
          await doc.patch({
            entries: cleanEntries,
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        await db.medication_guidances.insert({
          id: `guidance_${uuidv4()}`,
          drugCode: drug.code,
          drugName: drug.name,
          entries: cleanEntries,
          updatedAt: new Date().toISOString()
        });
      }
      toast.success('服薬指導補助マニュアルを保存しました');
      onClose();
    } catch (e) {
      console.error('Failed to save guidance:', e);
      toast.error('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

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
          {isLoading ? (
            <div className="flex-center loading-container">
              <Loader2 className="spin" size={24} />
            </div>
          ) : (
            <>
              <p className="guidance-desc">
                この薬剤に関する指導ポイントやヒントを登録できます。
              </p>

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
            data-disabled={isSaving}
            title={isSaving ? '保存中...' : ''}
          >
            <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
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
