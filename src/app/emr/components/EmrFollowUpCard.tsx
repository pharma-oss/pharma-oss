'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { PharmacyDatabase, Visit } from '@/db/types';
import { logAuditAction } from '@/lib/audit';
import { AuditLogFailedError } from '@/lib/audit_guard';
import {
  FOLLOW_UP_CONTACT_METHOD_LABELS,
  FOLLOW_UP_REASON_FLAG_OPTIONS,
  buildDrugFollowUpTemplatePresets,
  buildEmrFollowUpSchedulePatch,
  buildGuidanceSoapInsertDetail,
  normalizeFollowUpDueDate,
  saveEmrFollowUpSchedule,
  type FollowUpContactMethod,
  type GuidanceSoapInsertDetail
} from '@/lib/follow_up_templates';
import { plainCopy } from '@/lib/rxdb_restore';
import type { EmrPrescribedDrugItem } from '@/lib/emr_helpers';

export interface EmrFollowUpCardProps {
  db?: PharmacyDatabase | null;
  targetVisitId?: string | null;
  patientName?: string;
  prescribedDrugs: readonly EmrPrescribedDrugItem[];
  initialFollowUp?: Visit['followUp'];
  onEnsureVisitEditable?: () => Promise<{ ok: true; visit: Visit } | { ok: false; message: string }>;
  onInsertFollowUpDraft: (detail: GuidanceSoapInsertDetail) => void;
}

export const EmrFollowUpCard = React.memo(function EmrFollowUpCard({
  db,
  targetVisitId,
  patientName,
  prescribedDrugs,
  initialFollowUp,
  onEnsureVisitEditable,
  onInsertFollowUpDraft
}: EmrFollowUpCardProps) {
  const primaryDrugName = prescribedDrugs[0]?.name || '';
  const presets = useMemo(() => buildDrugFollowUpTemplatePresets(primaryDrugName), [primaryDrugName]);

  const [savedFollowUp, setSavedFollowUp] = useState<Visit['followUp']>(initialFollowUp);
  const [selectedFlags, setSelectedFlags] = useState<string[]>(
    () => (initialFollowUp?.reasonFlags?.length ? [...initialFollowUp.reasonFlags] : ['継続フォロー'])
  );
  const [dueDate, setDueDate] = useState<string>(() => normalizeFollowUpDueDate(initialFollowUp?.dueDate));
  const [contactMethod, setContactMethod] = useState<FollowUpContactMethod>(
    () => initialFollowUp?.contactMethod || 'phone'
  );
  const [nextAction, setNextAction] = useState<string>(() => initialFollowUp?.nextAction || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!db || !targetVisitId) return;
    let cancelled = false;
    db.visits.findOne(targetVisitId).exec()
      .then((doc) => {
        if (cancelled || !doc) return;
        const json = doc.toJSON() as Visit;
        if (json.followUp) {
          setSavedFollowUp(json.followUp);
          if (json.followUp.reasonFlags?.length) setSelectedFlags([...json.followUp.reasonFlags]);
          if (json.followUp.dueDate) setDueDate(json.followUp.dueDate);
          if (json.followUp.contactMethod) setContactMethod(json.followUp.contactMethod);
          if (json.followUp.nextAction) setNextAction(json.followUp.nextAction);
        }
      })
      .catch((error) => {
        console.warn('Failed to load visit followUp:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [db, targetVisitId]);

  const toggleFlag = (flag: string) => {
    setSelectedFlags((prev) => (
      prev.includes(flag) ? prev.filter((item) => item !== flag) : [...prev, flag]
    ));
  };

  const handleInsertPreset = (presetIndex: number) => {
    const preset = presets[presetIndex];
    if (!preset) return;
    const detail = buildGuidanceSoapInsertDetail({
      type: preset.type,
      text: preset.text,
      sourceKey: `followup-${preset.category}`
    });
    onInsertFollowUpDraft(detail);
    if (!nextAction.trim()) {
      setNextAction(preset.defaultNextAction);
    }
    setSelectedFlags((prev) => (
      prev.includes(preset.defaultReasonFlag) ? prev : [...prev, preset.defaultReasonFlag]
    ));
  };

  const handleSaveFollowUp = async () => {
    if (!db || isSaving) return;
    setIsSaving(true);
    try {
      let visitId = targetVisitId || null;
      if (onEnsureVisitEditable) {
        const editable = await onEnsureVisitEditable();
        if (!editable.ok) {
          toast.error(editable.message);
          return;
        }
        visitId = editable.visit.visitId;
      }
      if (!visitId) {
        toast.error('対象の受付が選択されていません。');
        return;
      }
      const visitDoc = await db.visits.findOne(visitId).exec();
      if (!visitDoc) {
        toast.error('受付データが見つかりませんでした。');
        return;
      }
      const currentVisit = visitDoc.toJSON() as Visit;
      const previousFollowUp = plainCopy(currentVisit.followUp);
      const followUpPatch = buildEmrFollowUpSchedulePatch({
        existingFollowUp: previousFollowUp,
        reasonFlags: selectedFlags,
        nextAction,
        dueDate,
        contactMethod
      });

      const persisted = await saveEmrFollowUpSchedule({
        visitDoc,
        previousFollowUp,
        followUpPatch,
        logAudit: (detail) => logAuditAction(
          db,
          'prescription_edit',
          detail,
          currentVisit.patientId,
          patientName
        )
      });
      setSavedFollowUp(persisted);
      setNextAction(persisted.nextAction || '');
      toast.success(`フォロー予定（${persisted.dueDate}）を登録しました。ダッシュボードのフォロー候補に表示されます。`);
    } catch (error) {
      console.error('Failed to save follow-up schedule:', error);
      toast.error(error instanceof AuditLogFailedError ? error.message : 'フォロー予定の保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  const hasOpenSchedule = savedFollowUp?.status === 'open';

  return (
    <div className="insight-card follow-up-card" data-testid="emr-follow-up-card">
      <div className="insight-header follow-up-header">
        <div className="follow-up-title-group">
          <CalendarClock size={18} className="icon-followup" aria-hidden="true" />
          <h3>服薬フォロー・定型テンプレート</h3>
        </div>
        <span
          className={`follow-up-status-chip ${hasOpenSchedule ? 'is-open' : 'is-none'}`}
          data-testid="emr-follow-up-status"
        >
          {hasOpenSchedule ? (
            <>
              <CheckCircle2 size={12} aria-hidden="true" />
              予定あり ({savedFollowUp?.dueDate || '-'})
            </>
          ) : '未予約'}
        </span>
      </div>

      <p className="follow-up-note">
        定型文は SOAP へ「未確認下書き」として挿入されます（薬剤師の確認・承認が必要です）。
      </p>

      <div className="follow-up-preset-grid">
        {presets.map((preset, idx) => (
          <button
            key={preset.category}
            type="button"
            className="btn-secondary follow-up-preset-btn"
            data-testid={`follow-up-preset-${preset.category}`}
            onClick={() => handleInsertPreset(idx)}
          >
            <Plus size={12} aria-hidden="true" />
            <span>{preset.label} ({preset.type})</span>
          </button>
        ))}
      </div>

      <div className="follow-up-schedule-box">
        <div className="follow-up-schedule-title">次回フォロー予定（ダッシュボード候補へ接続）</div>
        <div className="follow-up-flag-list">
          {FOLLOW_UP_REASON_FLAG_OPTIONS.map((flag) => (
            <label key={flag} className="follow-up-flag-chip">
              <input
                type="checkbox"
                checked={selectedFlags.includes(flag)}
                onChange={() => toggleFlag(flag)}
                disabled={isSaving}
              />
              <span>{flag}</span>
            </label>
          ))}
        </div>
        <div className="follow-up-input-row">
          <label className="follow-up-field">
            <span>確認予定日</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={isSaving}
              data-testid="emr-follow-up-due-date"
            />
          </label>
          <label className="follow-up-field">
            <span>連絡方法</span>
            <select
              value={contactMethod}
              onChange={(e) => setContactMethod(e.target.value as FollowUpContactMethod)}
              disabled={isSaving}
              data-testid="emr-follow-up-method"
            >
              {(Object.keys(FOLLOW_UP_CONTACT_METHOD_LABELS) as FollowUpContactMethod[]).map((key) => (
                <option key={key} value={key}>{FOLLOW_UP_CONTACT_METHOD_LABELS[key]}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="follow-up-field">
          <span>次回確認事項</span>
          <input
            type="text"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="例: 7日後に残薬数とめまい有無を電話確認"
            maxLength={200}
            disabled={isSaving}
            data-testid="emr-follow-up-next-action"
          />
        </label>
        <button
          type="button"
          className="btn-primary follow-up-save-btn"
          onClick={handleSaveFollowUp}
          disabled={isSaving || !db}
          data-testid="emr-follow-up-save-btn"
        >
          <Save size={14} aria-hidden="true" />
          <span>{isSaving ? '保存中...' : 'フォロー候補へ登録'}</span>
        </button>
      </div>

      <style jsx>{`
        .follow-up-card {
          border-left: 4px solid var(--primary);
        }
        .follow-up-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
          flex-wrap: wrap;
        }
        .follow-up-title-group {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .icon-followup {
          color: var(--primary);
        }
        .follow-up-status-chip {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-0-5) var(--space-2);
          border-radius: 999px;
          font-size: var(--fs-2xs);
          font-weight: 700;
        }
        .follow-up-status-chip.is-open {
          background: #dcfce7;
          color: #166534;
          border: 1px solid #86efac;
        }
        .follow-up-status-chip.is-none {
          background: var(--bg-subtle);
          color: var(--text-muted);
          border: 1px solid var(--border);
        }
        .follow-up-note {
          margin: 0 0 var(--space-2);
          font-size: var(--fs-2xs);
          color: var(--text-muted);
          line-height: 1.45;
        }
        .follow-up-preset-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--space-1-5);
          margin-bottom: var(--space-3);
        }
        .follow-up-preset-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1);
          padding: var(--space-1-5) var(--space-2);
          font-size: var(--fs-xs);
          font-weight: 700;
          min-height: 32px;
        }
        .follow-up-schedule-box {
          display: grid;
          gap: var(--space-2);
          padding-top: var(--space-2-5);
          border-top: 1px dashed var(--border);
        }
        .follow-up-schedule-title {
          font-size: var(--fs-xs);
          font-weight: 800;
          color: var(--text-main);
        }
        .follow-up-flag-list {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-1-5);
        }
        .follow-up-flag-chip {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-0-5) var(--space-2);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-base);
          font-size: var(--fs-2xs);
          font-weight: 600;
          cursor: pointer;
        }
        .follow-up-input-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--space-2);
        }
        .follow-up-field {
          display: grid;
          gap: var(--space-1);
          min-width: 0;
        }
        .follow-up-field span {
          font-size: var(--fs-2xs);
          font-weight: 700;
          color: var(--text-muted);
        }
        .follow-up-field input,
        .follow-up-field select {
          width: 100%;
          min-width: 0;
          padding: var(--space-1-5) var(--space-2);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          color: var(--text-main);
          font-size: var(--fs-xs);
          font-family: inherit;
        }
        .follow-up-save-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1-5);
          min-height: 36px;
          font-size: var(--fs-xs);
          font-weight: 700;
        }
      `}</style>
    </div>
  );
});
