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
      <div className="modal-content" style={{ width: '600px', maxWidth: '90vw' }}>
        <div className="modal-header">
          <h2>服薬指導補助マニュアル: {drug?.name}</h2>
          <button className="btn-icon" onClick={onClose}>
            <span style={{ fontSize: '1.2rem' }}>&times;</span>
          </button>
        </div>
        <div className="modal-body">
          {isLoading ? (
            <div className="flex-center" style={{ height: '200px' }}>
              <Loader2 className="spin" size={24} />
            </div>
          ) : (
            <>
              <p
                style={{ fontSize: '0.85rem', color: 'var(--text-ghost)', marginBottom: '1rem' }}
              >
                この薬剤に関する指導ポイントやヒントを登録できます。
              </p>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  marginBottom: '1rem'
                }}
              >
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: '1.2rem',
                        paddingTop: '0.5rem',
                        width: '30px',
                        textAlign: 'center',
                        color:
                          entry.type === 'S'
                            ? 'var(--status-blue)'
                            : entry.type === 'O'
                              ? 'var(--status-green)'
                              : entry.type === 'A'
                                ? 'var(--status-orange)'
                                : 'var(--status-purple)'
                      }}
                    >
                      {entry.type}
                    </div>
                    <textarea
                      value={entry.text}
                      onChange={(e) => updateEntry(entry.id, e.target.value)}
                      style={{
                        flex: 1,
                        minHeight: '60px',
                        padding: '0.5rem',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        resize: 'vertical'
                      }}
                      placeholder="内容を入力..."
                    />
                    <button
                      className="btn-icon text-muted"
                      onClick={() => removeEntry(entry.id)}
                      style={{ padding: '0.5rem' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-ghost)',
                    alignSelf: 'center',
                    marginRight: '0.5rem'
                  }}
                >
                  追加:
                </span>
                {['S', 'O', 'A', 'P'].map((type) => (
                  <button
                    key={type}
                    className={`btn-add-entry ${type.toLowerCase()}`}
                    onClick={() => addEntry(type)}
                    style={{
                      background: 'white',
                      border: '1px solid var(--border)',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
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
    </div>
  );
};
