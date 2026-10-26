import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CreditCard, Loader2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Patient, PharmacyDatabase } from '@/db/types';
import { generateUUID } from '@/lib/crypto';
import { logAuditAction } from '@/lib/audit';
import { AuditLogFailedError } from '@/lib/audit_guard';
import { parseFlexibleDateInput } from '@/lib/date_input';
import { buildMynaReadConfirmationMessage, getMynaReaderButtonView, type MynaReaderAvailabilityState } from '@/lib/myna_read_display';
import { fetchMynaCardRead } from '@/lib/myna_read_client';
import {
  applyMynaToRegistrationForm,
  registerPatient,
  validatePatientRegistration,
  type PatientRegistrationField,
  type PatientRegistrationForm,
  type PatientRegistrationOutcome
} from '@/lib/patient_registration';

export interface PatientRegistrationModalProps {
  db: PharmacyDatabase;
  /** 開いた時点の入力欄の値(処方箋・QR・マイナ読取で分かっている氏名と生年月日など) */
  initialForm: PatientRegistrationForm;
  /** 初期値がマイナ読取の内容を含むか(監査ログに残す) */
  initialFromMyna?: boolean;
  mynaReaderState: MynaReaderAvailabilityState;
  onClose: () => void;
  /** 登録できた。受付ではこの患者を選んで続ける。 */
  onRegistered: (outcome: Extract<PatientRegistrationOutcome, { status: 'registered' }>) => void;
  /** 同じ氏名・生年月日の患者が登録済みだった。受付ではその患者を選んで続ける。 */
  onSelectExisting: (patient: Patient) => void;
}

export function PatientRegistrationModal({
  db,
  initialForm,
  initialFromMyna = false,
  mynaReaderState,
  onClose,
  onRegistered,
  onSelectExisting
}: PatientRegistrationModalProps) {
  const [form, setForm] = useState<PatientRegistrationForm>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<PatientRegistrationField, string>>>({});
  const [duplicate, setDuplicate] = useState<Patient | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReadingMyna, setIsReadingMyna] = useState(false);
  const [mynaMessage, setMynaMessage] = useState('');
  const [usedMyna, setUsedMyna] = useState(initialFromMyna);
  const mynaButton = getMynaReaderButtonView(mynaReaderState, 'マイナ保険証から読み込む');
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, onClose]);

  const updateField = useCallback(<K extends PatientRegistrationField>(field: K, value: PatientRegistrationForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setDuplicate(null);
    setSubmitError('');
  }, []);

  const handleMynaRead = async () => {
    setIsReadingMyna(true);
    setMynaMessage('');
    try {
      const data = await fetchMynaCardRead();
      // 連携フォルダの結果は「直近に資格確認した人」のものなので、反映する前に、目の前の患者のものかを人が確かめる
      if (data.readerSource !== 'mock' && !window.confirm(buildMynaReadConfirmationMessage(data, '患者登録フォーム'))) {
        setMynaMessage('マイナ読取の内容は入れませんでした。');
        return;
      }
      setForm((current) => applyMynaToRegistrationForm(current, data));
      setErrors({});
      setDuplicate(null);
      setSubmitError('');
      setUsedMyna(true);
      setMynaMessage(data.readerMessage || 'マイナ読取内容を反映しました。');
    } catch (error) {
      console.error('Failed to read MyNa data for patient registration:', error);
      setMynaMessage(error instanceof Error && error.message ? error.message : 'マイナ読取に失敗しました。');
    } finally {
      setIsReadingMyna(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    const validation = validatePatientRegistration(form);
    if (!validation.ok) {
      setErrors(validation.errors);
      setSubmitError('入力内容を確認してください。');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    try {
      const outcome = await registerPatient({
        db,
        value: validation.value,
        generatePatientId: () => `pt_${generateUUID()}`,
        logAudit: (patient) => logAuditAction(
          db,
          'prescription_edit',
          `患者登録: 「${patient.name}」（生年月日 ${patient.birthDate}）を新規登録しました。入力元: ${usedMyna ? 'マイナ読取の内容を使用' : '手入力'}。`,
          patient.patientId,
          patient.name
        )
      });
      if (outcome.status === 'duplicate') {
        setDuplicate(outcome.patient);
        return;
      }
      toast.success(`患者「${outcome.patient.name}」を登録しました。続けて受付できます。`);
      onRegistered(outcome);
    } catch (error) {
      console.error('Failed to register patient:', error);
      setSubmitError(error instanceof AuditLogFailedError ? error.message : '患者登録に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const describedBy = (field: PatientRegistrationField) => (errors[field] ? `reg-${field}-error` : undefined);

  return (
    <div className="insurance-modal-overlay" data-testid="patient-registration-overlay">
      <div
        className="insurance-modal card glass animate-scale"
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-registration-title"
        data-testid="patient-registration-modal"
      >
        <div className="modal-header">
          <div className="modal-title-row">
            <UserPlus className="icon-primary" size={20} aria-hidden="true" />
            <h3 id="patient-registration-title">新規患者の登録</h3>
            <button
              type="button"
              className="registration-close"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="閉じる"
              title="閉じる"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <p className="modal-subtitle">初めての方は、先に患者を登録してから処方箋を受け付けます。登録すると、そのまま受付に進めます。</p>
        </div>

        <form className="registration-form" onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            <div className="registration-myna-row">
              <button
                type="button"
                className="btn-secondary flex-center gap-2"
                onClick={handleMynaRead}
                disabled={isReadingMyna || isSubmitting || mynaButton.disabled}
                aria-disabled={isReadingMyna || isSubmitting || mynaButton.disabled}
                title={mynaButton.title}
                data-testid="registration-myna-read-button"
              >
                {isReadingMyna ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CreditCard size={16} aria-hidden="true" />}
                {isReadingMyna ? '読取中...' : mynaButton.label}
              </button>
              {mynaReaderState.status === 'ready' && !mynaReaderState.available && (
                <span className="registration-hint" data-testid="registration-myna-unavailable-note">
                  マイナ読取は使えません（{mynaReaderState.reason || '接続先が未設定です'}）。手入力してください。
                </span>
              )}
              {mynaMessage && <span className="status-chip confirmed" role="status">{mynaMessage}</span>}
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="reg-name">
                  氏名<span className="text-danger" aria-hidden="true"> *</span>
                </label>
                <input
                  id="reg-name"
                  ref={firstFieldRef}
                  type="text"
                  maxLength={100}
                  autoComplete="off"
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  aria-required="true"
                  aria-invalid={!!errors.name}
                  aria-describedby={describedBy('name')}
                  placeholder="例: 山田 太郎"
                />
                {errors.name && <span id="reg-name-error" className="registration-error" role="alert">{errors.name}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="reg-kana">フリガナ</label>
                <input
                  id="reg-kana"
                  type="text"
                  maxLength={100}
                  autoComplete="off"
                  value={form.kana}
                  onChange={(event) => updateField('kana', event.target.value)}
                  aria-invalid={!!errors.kana}
                  aria-describedby={describedBy('kana')}
                  placeholder="例: ヤマダ タロウ"
                />
                {errors.kana && <span id="reg-kana-error" className="registration-error" role="alert">{errors.kana}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="reg-birthDate">
                  生年月日<span className="text-danger" aria-hidden="true"> *</span>
                </label>
                <input
                  id="reg-birthDate"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={10}
                  value={form.birthDate}
                  onChange={(event) => {
                    const raw = event.target.value;
                    const digitsOnly = raw.replace(/[^\d]/g, '');
                    // 半角8桁が揃った時点でYYYY-MM-DDへ自動変換する。揃うまで・不正な日付のままは書き換えない
                    const normalized = digitsOnly.length === 8 ? parseFlexibleDateInput(digitsOnly) : undefined;
                    updateField('birthDate', normalized || raw);
                  }}
                  aria-required="true"
                  aria-invalid={!!errors.birthDate}
                  aria-describedby={describedBy('birthDate')}
                  placeholder="例: 19850315"
                />
                {errors.birthDate
                  ? <span id="reg-birthDate-error" className="registration-error" role="alert">{errors.birthDate}</span>
                  : <span className="registration-hint">半角8桁(例: 19850315)でも入力できます</span>}
              </div>

              <div className="form-group">
                <label htmlFor="reg-gender">
                  性別<span className="text-danger" aria-hidden="true"> *</span>
                </label>
                <select
                  id="reg-gender"
                  value={form.gender}
                  onChange={(event) => updateField('gender', event.target.value as PatientRegistrationForm['gender'])}
                  aria-required="true"
                  aria-invalid={!!errors.gender}
                  aria-describedby={describedBy('gender')}
                >
                  <option value="">選択してください</option>
                  <option value="male">男性</option>
                  <option value="female">女性</option>
                  <option value="other">その他</option>
                </select>
                {errors.gender && <span id="reg-gender-error" className="registration-error" role="alert">{errors.gender}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="reg-insurerNumber">保険者番号</label>
                <input
                  id="reg-insurerNumber"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={10}
                  value={form.insurerNumber}
                  onChange={(event) => updateField('insurerNumber', event.target.value)}
                  aria-invalid={!!errors.insurerNumber}
                  aria-describedby={describedBy('insurerNumber')}
                  placeholder="未入力でも登録可"
                />
                {errors.insurerNumber && <span id="reg-insurerNumber-error" className="registration-error" role="alert">{errors.insurerNumber}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="reg-insuredNumber">記号・番号</label>
                <input
                  id="reg-insuredNumber"
                  type="text"
                  autoComplete="off"
                  maxLength={50}
                  value={form.insuredNumber}
                  onChange={(event) => updateField('insuredNumber', event.target.value)}
                  aria-invalid={!!errors.insuredNumber}
                  aria-describedby={describedBy('insuredNumber')}
                  placeholder="例: 記号12 番号345"
                />
                {errors.insuredNumber && <span id="reg-insuredNumber-error" className="registration-error" role="alert">{errors.insuredNumber}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="reg-burdenRatio">負担割合</label>
                <select
                  id="reg-burdenRatio"
                  value={form.burdenRatio}
                  onChange={(event) => updateField('burdenRatio', event.target.value as PatientRegistrationForm['burdenRatio'])}
                >
                  <option value="10">1割</option>
                  <option value="20">2割</option>
                  <option value="30">3割</option>
                </select>
              </div>
            </div>
          </div>

          {/* 重複の知らせ・エラー・ボタンは、本文のスクロールの外に置く(短い画面でも、押す場所と理由が常に見える) */}
          {duplicate && (
            <div className="registration-duplicate" role="alert" data-testid="patient-registration-duplicate">
              <span>
                同じ氏名・生年月日の患者がすでに登録されています: <strong>{duplicate.name}</strong>（{duplicate.birthDate}）
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onSelectExisting(duplicate)}
                data-testid="patient-registration-select-existing"
              >
                この患者を選んで受付へ
              </button>
            </div>
          )}

          {submitError && <div className="registration-error registration-submit-error" role="alert">{submitError}</div>}

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>キャンセル</button>
            <button
              type="submit"
              className="btn-primary flex-center gap-2"
              disabled={isSubmitting}
              aria-disabled={isSubmitting}
              data-testid="patient-registration-submit"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <UserPlus size={16} aria-hidden="true" />}
              {isSubmitting ? '登録中...' : '登録して受付へ進む'}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .registration-close {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
        }

        .registration-close:hover:not(:disabled) {
          background: rgba(15, 23, 42, 0.08);
        }

        .registration-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .registration-myna-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.6rem;
        }

        .registration-hint {
          font-size: var(--fs-xs);
          color: var(--text-muted);
        }

        .registration-error {
          font-size: var(--fs-xs);
          color: var(--danger);
        }

        .registration-submit-error {
          font-size: var(--fs-sm);
          font-weight: 600;
        }

        .registration-duplicate {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.6rem;
          padding: 0.75rem;
          border: 1px solid var(--warning);
          border-radius: 8px;
          background: var(--warning-soft);
          font-size: var(--fs-sm);
        }

        @media (max-width: 640px) {
          .registration-myna-row :global(button) {
            width: 100%;
          }

          .registration-form :global(.form-grid) {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default PatientRegistrationModal;
