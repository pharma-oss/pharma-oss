import React from 'react';
import { MessageSquare } from 'lucide-react';
import {
  INTERVENTION_CATEGORY_LABELS,
  suggestInterventionCategory,
  type InterventionCategory
} from '@/lib/prescription_intervention_support';
import { userFacingErrorMessage } from '@/lib/user_facing_error';

export interface EmrInterventionSubmitOutcome {
  alertMessage: string | null;
  shouldCloseAndReset: boolean;
}

/**
 * 疑義照会モーダル送信時の入力チェックと保存結果から、警告表示・モーダル閉鎖可否を決める。
 */
export async function submitEmrInterventionForm(params: {
  reason: string;
  onSave: () => Promise<boolean | void>;
}): Promise<EmrInterventionSubmitOutcome> {
  if (!params.reason.trim()) {
    return {
      alertMessage: '理由を入力してください。',
      shouldCloseAndReset: false
    };
  }
  try {
    const result = await params.onSave();
    return {
      alertMessage: null,
      shouldCloseAndReset: result !== false
    };
  } catch (error) {
    return {
      alertMessage: userFacingErrorMessage(error, '保存に失敗しました。'),
      shouldCloseAndReset: false
    };
  }
}

export interface EmrInterventionModalProps {
  isOpen: boolean;
  onClose: () => void;
  intCategory?: InterventionCategory;
  setIntCategory?: (val: InterventionCategory) => void;
  intDoctor: string;
  setIntDoctor: (val: string) => void;
  intReason: string;
  setIntReason: (val: string) => void;
  intBefore: string;
  setIntBefore: (val: string) => void;
  intAfter: string;
  setIntAfter: (val: string) => void;
  intResult: string;
  setIntResult: (val: string) => void;
  intStatus: 'pending' | 'completed';
  setIntStatus: (val: 'pending' | 'completed') => void;
  intMethod: 'phone' | 'fax' | 'in_person' | 'other';
  setIntMethod: (val: 'phone' | 'fax' | 'in_person' | 'other') => void;
  intResponseDueDate: string;
  setIntResponseDueDate: (val: string) => void;
  intNote: string;
  setIntNote: (val: string) => void;
  intConsented: boolean;
  setIntConsented: (val: boolean) => void;
  onSave: (input: {
    category?: InterventionCategory;
    reason: string;
    beforeSnapshot: string;
    afterSnapshot: string;
    inquiryStatus: 'pending' | 'completed';
    inquiryMethod: 'phone' | 'fax' | 'in_person' | 'other';
    inquiryDoctor: string;
    inquiryResult: string;
    responseDueDate: string;
    note: string;
    patientConsented: boolean;
  }) => Promise<boolean | void>;
  resetForm: () => void;
}

export const EmrInterventionModal: React.FC<EmrInterventionModalProps> = ({
  isOpen,
  onClose,
  intCategory = 'other',
  setIntCategory,
  intDoctor,
  setIntDoctor,
  intReason,
  setIntReason,
  intBefore,
  setIntBefore,
  intAfter,
  setIntAfter,
  intResult,
  setIntResult,
  intStatus,
  setIntStatus,
  intMethod,
  setIntMethod,
  intResponseDueDate,
  setIntResponseDueDate,
  intNote,
  setIntNote,
  intConsented,
  setIntConsented,
  onSave,
  resetForm
}) => {
  const [isSaving, setIsSaving] = React.useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const outcome = await submitEmrInterventionForm({
        reason: intReason,
        onSave: () => onSave({
          category: intCategory,
          reason: intReason,
          beforeSnapshot: intBefore,
          afterSnapshot: intAfter,
          inquiryStatus: intStatus,
          inquiryMethod: intMethod,
          inquiryDoctor: intDoctor,
          inquiryResult: intResult,
          responseDueDate: intResponseDueDate,
          note: intNote,
          patientConsented: intConsented
        })
      });
      if (outcome.alertMessage) {
        alert(outcome.alertMessage);
      }
      if (outcome.shouldCloseAndReset) {
        onClose();
        resetForm();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="insurance-modal-overlay">
      <div className="insurance-modal animate-scale modal-intervention">
        <div className="modal-header">
          <div className="modal-title-row">
            <MessageSquare size={20} />
            <h3>疑義照会・処方変更を記録</h3>
          </div>
          <span className="modal-subtitle">変更理由と医師の回答結果をレセプト(UKE)に自動連携します。</span>
        </div>
        <div className="intervention-form-body">
          <div className="form-row intervention-row">
            <div className="form-group flex-1">
              <label>照会状態</label>
              <select
                value={intStatus}
                onChange={(e) => setIntStatus(e.target.value as 'pending' | 'completed')}
                className="intervention-select"
              >
                <option value="completed">回答済</option>
                <option value="pending">照会中</option>
              </select>
            </div>
            <div className="form-group flex-1">
              <label>照会方法</label>
              <select
                value={intMethod}
                onChange={(e) => setIntMethod(e.target.value as 'phone' | 'fax' | 'in_person' | 'other')}
                className="intervention-select"
              >
                <option value="phone">電話</option>
                <option value="fax">FAX</option>
                <option value="in_person">対面</option>
                <option value="other">その他</option>
              </select>
            </div>
          </div>
          <div className="form-row intervention-row">
            <div className="form-group flex-1">
              <label>照会区分</label>
              <select
                value={intCategory}
                onChange={(e) => setIntCategory?.(e.target.value as InterventionCategory)}
                className="intervention-select"
                data-testid="intervention-category-select"
              >
                {Object.entries(INTERVENTION_CATEGORY_LABELS).map(([catKey, label]) => (
                  <option key={catKey} value={catKey}>{label}</option>
                ))}
              </select>
            </div>
            <div className="form-group flex-1">
              <label>照会先医師名</label>
              <input
                type="text"
                placeholder="例: 山田"
                value={intDoctor}
                onChange={(e) => setIntDoctor(e.target.value)}
                className="intervention-input"
              />
            </div>
          </div>
          <div className="form-group">
            <label>疑義照会・変更の理由</label>
            <textarea
              placeholder="例: 重複投薬防止のため / 後発品への変更"
              value={intReason}
              onChange={(e) => {
                const val = e.target.value;
                setIntReason(val);
                if (intCategory === 'other' && setIntCategory) {
                  const suggested = suggestInterventionCategory(val, intBefore, intAfter);
                  if (suggested !== 'other') setIntCategory(suggested);
                }
              }}
              className="intervention-textarea"
            />
          </div>
          <div className="form-row intervention-row">
            <div className="form-group flex-1">
              <label>変更前の薬品名</label>
              <input
                type="text"
                placeholder="例: ロキソニン錠60mg"
                value={intBefore}
                onChange={(e) => setIntBefore(e.target.value)}
                className="intervention-input"
              />
            </div>
            <div className="form-group flex-1">
              <label>変更後の薬品名</label>
              <input
                type="text"
                placeholder="例: ロキソプロフェンNa塩錠60mg"
                value={intAfter}
                onChange={(e) => setIntAfter(e.target.value)}
                className="intervention-input"
              />
            </div>
          </div>
          <div className="form-group">
            <label>{intStatus === 'pending' ? '照会内容・未回答メモ' : '照会・回答結果'}</label>
            <input
              type="text"
              placeholder={intStatus === 'pending' ? '例: 医師不在。折り返し待ち' : '例: 了承、削除、一般名処方へ変更'}
              value={intResult}
              onChange={(e) => setIntResult(e.target.value)}
              className="intervention-input"
            />
          </div>
          <div className="form-row intervention-row">
            <div className="form-group flex-1">
              <label>回答期限</label>
              <input
                type="date"
                value={intResponseDueDate}
                onChange={(e) => setIntResponseDueDate(e.target.value)}
                className="intervention-input"
              />
            </div>
            <div className="form-group flex-1">
              <label>備考メモ</label>
              <input
                type="text"
                placeholder="例: 次回受診時に再確認"
                value={intNote}
                onChange={(e) => setIntNote(e.target.value)}
                className="intervention-input"
              />
            </div>
          </div>
          <label className="intervention-checkbox-label">
            <input
              type="checkbox"
              checked={intConsented}
              onChange={(e) => setIntConsented(e.target.checked)}
            />
            患者の同意を得ている
          </label>
        </div>
        <div className="intervention-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>キャンセル</button>
          <button
            type="button"
            className="btn-primary"
            disabled={isSaving}
            aria-busy={isSaving}
            onClick={() => void handleSubmit()}
          >
            {isSaving ? '登録中...' : '登録'}
          </button>
        </div>
      </div>
      <style jsx>{`
        .modal-intervention {
          width: 500px;
          max-width: 95vw;
        }
        .intervention-form-body {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .intervention-row {
          display: flex;
          gap: var(--space-4);
        }
        .intervention-select {
          padding: var(--space-2);
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: white;
          color: var(--text-main);
          font-size: var(--fs-base);
        }
        .intervention-input {
          padding: var(--space-2);
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-main);
          font-size: var(--fs-base);
        }
        .intervention-textarea {
          padding: var(--space-2);
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          min-height: 60px;
          resize: vertical;
          background: var(--bg-card);
          color: var(--text-main);
          font-size: var(--fs-base);
          font-family: inherit;
        }
        .intervention-checkbox-label {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          cursor: pointer;
          font-size: var(--fs-base);
          color: var(--text-main);
        }
        .intervention-footer {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-2);
          margin-top: var(--space-4);
        }
      `}</style>
    </div>
  );
};

export default EmrInterventionModal;
