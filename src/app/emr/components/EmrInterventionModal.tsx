import React from 'react';
import { MessageSquare } from 'lucide-react';

export interface EmrInterventionModalProps {
  isOpen: boolean;
  onClose: () => void;
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
  }) => Promise<void>;
  resetForm: () => void;
}

export const EmrInterventionModal: React.FC<EmrInterventionModalProps> = ({
  isOpen,
  onClose,
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
  if (!isOpen) return null;

  return (
    <div className="insurance-modal-overlay">
      <div className="insurance-modal animate-scale" style={{ width: '500px' }}>
        <div className="modal-header">
          <div className="modal-title-row">
            <MessageSquare size={20} />
            <h3>疑義照会・処方変更を記録</h3>
          </div>
          <span className="modal-subtitle">変更理由と医師の回答結果をレセプト(UKE)に自動連携します。</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group flex-1">
              <label>照会状態</label>
              <select
                value={intStatus}
                onChange={(e) => setIntStatus(e.target.value as 'pending' | 'completed')}
                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'white' }}
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
                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'white' }}
              >
                <option value="phone">電話</option>
                <option value="fax">FAX</option>
                <option value="in_person">対面</option>
                <option value="other">その他</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>照会先医師名</label>
            <input
              type="text"
              placeholder="例: 山田"
              value={intDoctor}
              onChange={(e) => setIntDoctor(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
            />
          </div>
          <div className="form-group">
            <label>疑義照会・変更の理由</label>
            <textarea
              placeholder="例: 重複投薬防止のため / 後発品への変更"
              value={intReason}
              onChange={(e) => setIntReason(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', minHeight: '60px' }}
            />
          </div>
          <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group flex-1">
              <label>変更前の薬品名</label>
              <input
                type="text"
                placeholder="例: ロキソニン錠60mg"
                value={intBefore}
                onChange={(e) => setIntBefore(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
              />
            </div>
            <div className="form-group flex-1">
              <label>変更後の薬品名</label>
              <input
                type="text"
                placeholder="例: ロキソプロフェンNa塩錠60mg"
                value={intAfter}
                onChange={(e) => setIntAfter(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
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
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
            />
          </div>
          <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group flex-1">
              <label>回答期限</label>
              <input
                type="date"
                value={intResponseDueDate}
                onChange={(e) => setIntResponseDueDate(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
              />
            </div>
            <div className="form-group flex-1">
              <label>備考メモ</label>
              <input
                type="text"
                placeholder="例: 次回受診時に再確認"
                value={intNote}
                onChange={(e) => setIntNote(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
              />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: 'var(--fs-base)', color: 'var(--text-main)' }}>
            <input
              type="checkbox"
              checked={intConsented}
              onChange={(e) => setIntConsented(e.target.checked)}
            />
            患者の同意を得ている
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="btn-secondary" onClick={onClose}>キャンセル</button>
          <button
            className="btn-primary"
            onClick={async () => {
              if (!intReason.trim()) {
                alert('理由を入力してください。');
                return;
              }
              await onSave({
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
              });
              onClose();
              resetForm();
            }}
          >
            登録
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmrInterventionModal;
