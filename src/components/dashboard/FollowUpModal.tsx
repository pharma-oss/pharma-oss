'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { DashboardFollowUpCandidate, RecordFollowUpInput } from '@/hooks/useDashboardTasks';

export interface FollowUpModalProps {
  candidate: DashboardFollowUpCandidate;
  onClose: () => void;
  onRecord: (candidate: DashboardFollowUpCandidate, input: RecordFollowUpInput) => Promise<void>;
}

export interface FollowUpSubmitOutcome {
  shouldClose: boolean;
  alertMessage: string | null;
}

/**
 * 服薬フォローモーダルの送信入力検証と記録結果から、モーダル閉鎖・警告表示を判定する。
 */
export async function submitFollowUpAction(params: {
  note: string;
  failureMessage: string;
  onSubmit: () => Promise<void>;
}): Promise<FollowUpSubmitOutcome> {
  if (!params.note.trim()) {
    return {
      shouldClose: false,
      alertMessage: '対応内容を入力してください。'
    };
  }
  try {
    await params.onSubmit();
    return {
      shouldClose: true,
      alertMessage: null
    };
  } catch (error) {
    console.error('Failed to record follow up:', error);
    return {
      shouldClose: false,
      alertMessage: params.failureMessage
    };
  }
}

export function FollowUpModal({ candidate, onClose, onRecord }: FollowUpModalProps) {
  const [method, setMethod] = useState<RecordFollowUpInput['contactMethod']>('phone');
  const [note, setNote] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRequestClose = () => {
    if (!isSubmitting) onClose();
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const outcome = await submitFollowUpAction({
        note,
        failureMessage: '服薬フォローの記録に失敗しました。',
        onSubmit: () =>
          onRecord(candidate, {
            contactMethod: method,
            outcome: 'completed',
            completedNote: note,
            nextAction,
            dueDate
          })
      });
      if (outcome.alertMessage) {
        alert(outcome.alertMessage);
      }
      if (outcome.shouldClose) {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveReminder = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const outcome = await submitFollowUpAction({
        note,
        failureMessage: '次回確認の記録に失敗しました。',
        onSubmit: () =>
          onRecord(candidate, {
            contactMethod: method,
            outcome: 'rescheduled',
            completedNote: note,
            nextAction,
            dueDate
          })
      });
      if (outcome.alertMessage) {
        alert(outcome.alertMessage);
      }
      if (outcome.shouldClose) {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="followup-modal-backdrop" role="presentation" onMouseDown={handleRequestClose}>
      <form
        className="followup-modal"
        aria-label={`${candidate.name}さんの服薬フォロー対応記録`}
        onSubmit={handleComplete}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="followup-modal-header">
          <div>
            <h3>服薬フォロー対応記録</h3>
            <p>{candidate.name}さん / {candidate.time}・{candidate.prescriptionCount}薬</p>
          </div>
          <button
            type="button"
            className="followup-modal-close"
            onClick={handleRequestClose}
            disabled={isSubmitting}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div className="followup-reasons modal" aria-label="フォロー理由">
          {candidate.reasonFlags.map((flag) => (
            <span key={flag}>{flag}</span>
          ))}
        </div>

        <div className="followup-plan" aria-label="推奨フォロー計画">
          <span>推奨</span>
          <strong>{candidate.dueLabel} / リスク {candidate.riskScore}</strong>
          <p>{candidate.suggestedAction}</p>
        </div>

        <label className="followup-field">
          <span>対応方法</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            <option value="phone">電話</option>
            <option value="sms">SMS/メッセージ</option>
            <option value="visit">来局時</option>
            <option value="other">その他</option>
          </select>
        </label>

        <label className="followup-field">
          <span>対応内容</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="服薬状況、副作用、残薬、患者への説明内容など"
            required
          />
        </label>

        <div className="followup-modal-grid">
          <label className="followup-field">
            <span>次回確認日</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="followup-field">
            <span>次回アクション</span>
            <input
              type="text"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="例: 3日後に副作用確認"
            />
          </label>
        </div>

        <div className="followup-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
            キャンセル
          </button>
          <button type="button" className="btn-secondary" onClick={handleSaveReminder} disabled={isSubmitting}>
            未完了で記録
          </button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            <span>{isSubmitting ? '保存中' : '記録して対応済み'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
