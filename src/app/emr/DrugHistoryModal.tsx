'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Pill, Stethoscope, CalendarDays, FileText, Loader2, History } from 'lucide-react';
import { useDatabase } from '@/db/DatabaseProvider';
import {
  buildDrugMedicationHistory,
  listPatientPrescribedDrugs,
  type MedHistoryPrescriptionItem,
  type MedHistorySoapRecord,
  type MedHistoryVisit
} from '@/lib/drug_medication_history';

const SOAP_LETTER_COLOR: Record<string, string> = {
  S: 'var(--status-blue)',
  O: 'var(--status-green)',
  A: 'var(--status-orange)',
  P: 'var(--status-purple)'
};

function formatDate(date?: string): string {
  return date ? date.replace(/-/g, '/') : '日付不明';
}

export default function DrugHistoryModal({
  targetVisitId,
  open,
  onClose
}: {
  targetVisitId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const db = useDatabase();
  const [loading, setLoading] = useState(false);
  const [visits, setVisits] = useState<MedHistoryVisit[]>([]);
  const [items, setItems] = useState<MedHistoryPrescriptionItem[]>([]);
  const [soaps, setSoaps] = useState<MedHistorySoapRecord[]>([]);
  const [selectedDrugId, setSelectedDrugId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !db) return;
    let cancelled = false;
    setLoading(true);
    setSelectedDrugId(null);
    (async () => {
      try {
        let patientId: string | null = null;
        if (targetVisitId) {
          const visit = await db.visits.findOne(targetVisitId).exec();
          patientId = visit?.patientId ?? null;
        } else {
          const processing = await db.visits.find({ selector: { status: 'processing' } }).exec();
          patientId = processing[0]?.patientId ?? null;
        }
        if (cancelled) return;
        if (!patientId) {
          setVisits([]); setItems([]); setSoaps([]);
          return;
        }
        const visitDocs = await db.visits.find({ selector: { patientId } }).exec();
        const visitList = visitDocs.map((d: any) => d.toJSON());
        const visitIds = visitList.map((v: MedHistoryVisit) => v.visitId);
        const [itemDocs, soapDocs] = await Promise.all([
          db.prescription_items.find({ selector: { visitId: { $in: visitIds } } }).exec(),
          db.soap_records.find({ selector: { visitId: { $in: visitIds } } }).exec()
        ]);
        if (cancelled) return;
        setVisits(visitList);
        setItems(itemDocs.map((d: any) => d.toJSON()));
        setSoaps(soapDocs.map((d: any) => d.toJSON()));
      } catch (err) {
        console.error('Failed to load drug medication history:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, db, targetVisitId]);

  const drugs = useMemo(() => listPatientPrescribedDrugs(items, visits), [items, visits]);
  const selectedDrug = useMemo(
    () => drugs.find((d) => d.drugId === selectedDrugId) ?? drugs[0],
    [drugs, selectedDrugId]
  );
  const history = useMemo(
    () => (selectedDrug
      ? buildDrugMedicationHistory({
        anchorLabel: selectedDrug.label,
        matchKeys: selectedDrug.matchKeys,
        matchNames: selectedDrug.matchNames,
        visits,
        items,
        soapRecords: soaps
      })
      : null),
    [selectedDrug, visits, items, soaps]
  );

  if (!open) return null;

  return (
    <div className="dh-overlay" onClick={onClose} role="presentation">
      <div className="dh-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="薬剤履歴">
        <div className="dh-header">
          <div className="dh-title">
            <History size={18} aria-hidden="true" />
            <div>
              <h3>薬剤履歴</h3>
              <span>特定の薬を起点に、過去の処方・処方医・その時の薬歴を遡る</span>
            </div>
          </div>
          <button className="dh-close" onClick={onClose} aria-label="閉じる"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="dh-empty"><Loader2 size={20} className="spin" aria-hidden="true" /> 読み込み中...</div>
        ) : drugs.length === 0 ? (
          <div className="dh-empty">この患者の処方履歴がまだありません。</div>
        ) : (
          <div className="dh-body">
            <aside className="dh-druglist" aria-label="薬剤を選択">
              {drugs.map((drug) => (
                <button
                  key={drug.drugId}
                  className={`dh-drug ${selectedDrug?.drugId === drug.drugId ? 'active' : ''}`}
                  onClick={() => setSelectedDrugId(drug.drugId)}
                >
                  <Pill size={14} aria-hidden="true" />
                  <span className="dh-drug-name">{drug.label}</span>
                  <span className="dh-drug-meta">{drug.occurrences}回 / 最終 {formatDate(drug.lastDate)}</span>
                </button>
              ))}
            </aside>

            <section className="dh-timeline" aria-label="履歴">
              {history && (
                <div className="dh-anchor">
                  <strong>{history.anchorLabel}</strong>
                  <span>{history.totalVisits}件の受付 / 最終処方 {formatDate(history.lastDispensedDate)}</span>
                </div>
              )}
              {history && history.entries.length === 0 ? (
                <div className="dh-empty">この薬の過去処方は見つかりませんでした。</div>
              ) : (
                history?.entries.map((entry) => (
                  <article key={entry.visitId} className="dh-entry">
                    <div className="dh-entry-head">
                      <span className="dh-date"><CalendarDays size={14} aria-hidden="true" /> {formatDate(entry.date)}</span>
                      <span className="dh-doctor">
                        <Stethoscope size={14} aria-hidden="true" />
                        {entry.institutionName || '医療機関不明'}
                        {entry.departmentName ? ` ${entry.departmentName}` : ''}
                        {entry.doctorName ? ` / ${entry.doctorName}医師` : ''}
                      </span>
                    </div>

                    <div className="dh-rx">
                      {entry.prescriptions.map((rx, idx) => (
                        <div key={idx} className="dh-rx-line">
                          <Pill size={13} aria-hidden="true" />
                          <span className="dh-rx-name">{rx.drugLabel}</span>
                          <span className="dh-rx-detail">
                            {rx.usage ? `${rx.usage}　` : ''}{rx.amount ? `${rx.amount} ` : ''}× {rx.days}日分
                          </span>
                          {rx.substitutedTo && <span className="dh-rx-sub">→ 調剤: {rx.substitutedTo}</span>}
                        </div>
                      ))}
                    </div>

                    <div className="dh-soap">
                      <div className="dh-soap-head"><FileText size={13} aria-hidden="true" /> その時の薬歴</div>
                      {entry.hasSoap && entry.soap ? (
                        entry.soap.problems.map((problem, pIdx) => (
                          <div key={pIdx} className="dh-problem">
                            {problem.title && <div className="dh-problem-title">{problem.title}</div>}
                            {problem.entries
                              .filter((soapEntry) => soapEntry.text.trim().length > 0)
                              .map((soapEntry, eIdx) => (
                                <div key={eIdx} className="dh-soap-line">
                                  <span className="dh-soap-letter" style={{ color: SOAP_LETTER_COLOR[soapEntry.type] }}>{soapEntry.type}</span>
                                  <span>{soapEntry.text}</span>
                                </div>
                              ))}
                          </div>
                        ))
                      ) : (
                        <div className="dh-soap-empty">この受付の薬歴は記録されていません。</div>
                      )}
                    </div>
                  </article>
                ))
              )}
            </section>
          </div>
        )}
      </div>

      <style jsx>{`
        .dh-overlay {
          position: fixed; inset: 0; z-index: 60;
          display: flex; align-items: center; justify-content: center;
          padding: 1rem; background: rgb(15 23 42 / 0.42); backdrop-filter: blur(3px);
        }
        .dh-modal {
          width: min(920px, 100%); max-height: min(86vh, 880px);
          display: flex; flex-direction: column;
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: var(--radius-lg); box-shadow: var(--shadow-xl); overflow: hidden;
        }
        .dh-header {
          display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 1rem;
          padding: 1rem 1.25rem; border-bottom: 1px solid var(--border);
        }
        .dh-title { display: flex; gap: 0.6rem; color: var(--primary-dark); min-width: min(220px, 100%); flex: 1 1 220px; }
        .dh-title h3 { font-size: 1.05rem; margin: 0; color: var(--text-main); }
        .dh-title span { font-size: 0.76rem; color: var(--text-muted); font-weight: 600; }
        .dh-close {
          width: 34px; height: 34px; min-height: 34px; flex: 0 0 auto;
          display: inline-flex; align-items: center; justify-content: center;
          border: 1px solid var(--border); border-radius: var(--radius-md);
          background: #fff; color: var(--text-muted); cursor: pointer;
        }
        .dh-close:hover { background: var(--bg-subtle); color: var(--text-main); }
        .dh-empty {
          display: flex; align-items: center; justify-content: center; gap: 0.5rem;
          padding: 2.5rem 1rem; color: var(--text-muted); font-size: 0.9rem;
        }
        .dh-body { display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: 0; flex: 1; }
        .dh-druglist {
          display: flex; flex-direction: column; gap: 0.3rem; padding: 0.85rem;
          border-right: 1px solid var(--border); overflow-y: auto; background: var(--bg-subtle);
        }
        .dh-drug {
          display: grid; grid-template-columns: 16px 1fr; align-items: center;
          gap: 0.4rem 0.5rem; text-align: left; padding: 0.55rem 0.65rem;
          border: 1px solid transparent; border-radius: var(--radius-md);
          background: transparent; cursor: pointer; min-height: auto;
        }
        .dh-drug:hover { background: var(--bg-hover); }
        .dh-drug.active { background: var(--primary-soft); border-color: var(--primary); }
        .dh-drug-name { font-size: 0.84rem; font-weight: 700; color: var(--text-main); overflow-wrap: anywhere; }
        .dh-drug-meta { grid-column: 2; font-size: 0.7rem; color: var(--text-muted); font-weight: 600; }
        .dh-timeline { padding: 1rem 1.25rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.85rem; }
        .dh-anchor {
          display: flex; flex-direction: column; gap: 0.15rem; padding-bottom: 0.4rem;
          border-bottom: 1px solid var(--border);
        }
        .dh-anchor strong { font-size: 1rem; color: var(--text-main); }
        .dh-anchor span { font-size: 0.76rem; color: var(--text-muted); font-weight: 600; }
        .dh-entry {
          border: 1px solid var(--border); border-left: 4px solid var(--primary);
          border-radius: 0 var(--radius-md) var(--radius-md) 0; padding: 0.75rem 0.9rem;
          display: flex; flex-direction: column; gap: 0.55rem; background: #fff;
        }
        .dh-entry-head { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; align-items: center; }
        .dh-date { display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 800; color: var(--text-main); font-size: 0.92rem; }
        .dh-doctor { display: inline-flex; align-items: center; gap: 0.3rem; color: var(--text-muted); font-size: 0.78rem; font-weight: 700; }
        .dh-rx { display: flex; flex-direction: column; gap: 0.3rem; }
        .dh-rx-line { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; font-size: 0.82rem; }
        .dh-rx-name { font-weight: 800; color: var(--text-main); }
        .dh-rx-detail { color: var(--text-muted); font-weight: 600; }
        .dh-rx-sub {
          font-size: 0.72rem; font-weight: 700; color: var(--accent);
          background: var(--accent-soft); padding: 0.05rem 0.4rem; border-radius: var(--radius-sm);
        }
        .dh-soap { border-top: 1px dashed var(--border); padding-top: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
        .dh-soap-head { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.74rem; font-weight: 800; color: var(--text-muted); }
        .dh-problem { display: flex; flex-direction: column; gap: 0.2rem; }
        .dh-problem-title { font-size: 0.8rem; font-weight: 800; color: var(--text-main); }
        .dh-soap-line { display: grid; grid-template-columns: 16px 1fr; gap: 0.45rem; font-size: 0.82rem; color: var(--text-main); line-height: 1.5; }
        .dh-soap-letter { font-weight: 900; text-align: center; }
        .dh-soap-empty { font-size: 0.78rem; color: var(--text-ghost); font-weight: 600; }
        @media (max-width: 760px) {
          .dh-body { grid-template-columns: 1fr; }
          .dh-druglist { flex-direction: row; overflow-x: auto; border-right: none; border-bottom: 1px solid var(--border); }
          .dh-drug { min-width: 180px; }
        }
      `}</style>
    </div>
  );
}
