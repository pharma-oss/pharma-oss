import React from 'react';
import { CreditCard, Loader2, Search, UserPlus } from 'lucide-react';
import {
  FEATURE_AVAILABILITY,
  isFeatureImplemented,
  labelWithAvailability
} from '@/lib/feature_availability';
import { normalizeInsuranceNumber } from '@/lib/patient_matching';
import type { MynaReaderAvailabilityState, MynaReaderButtonView } from '@/lib/myna_read_display';
import {
  formatOnlineEligibilityFieldMappingReport,
  type NormalizedOnlineEligibilityResult
} from '@/lib/online_eligibility';
import type { EligibilityStatus } from '../helpers';

export interface ReceptionPatientSearchBarProps {
  patientSearchQuery: string;
  onPatientSearchQueryChange: (value: string) => void;
  hasImage: boolean;
  isReadingMyna: boolean;
  mynaReadButton: MynaReaderButtonView;
  mynaMessage: string;
  hasDb: boolean;
  onMynaRead: () => void;
  onOpenPatientRegistration: () => void;
}

export const ReceptionPatientSearchBar = React.memo(function ReceptionPatientSearchBar({
  patientSearchQuery,
  onPatientSearchQueryChange,
  hasImage,
  isReadingMyna,
  mynaReadButton,
  mynaMessage,
  hasDb,
  onMynaRead,
  onOpenPatientRegistration
}: ReceptionPatientSearchBarProps) {
  return (
    <div className="form-group patient-search-group">
      <label htmlFor="patientSearch">
        患者を検索
        <span className="text-danger ml-1 text-sm" aria-hidden="true">*</span>
      </label>
      <div className="patient-search-row">
        <div className="patient-search-input">
          <Search size={16} aria-hidden="true" />
          <input
            id="patientSearch"
            type="text"
            autoComplete="off"
            maxLength={100}
            value={patientSearchQuery}
            onChange={(e) => onPatientSearchQueryChange(e.target.value)}
            placeholder={hasImage ? '読み取り中...' : '氏名・フリガナ・生年月日8桁（例: 山田 19850315）'}
            aria-describedby="patientSearchHint"
            data-testid="patient-search-input"
          />
        </div>
        <button
          type="button"
          className="btn-secondary flex-center gap-2"
          onClick={onMynaRead}
          disabled={isReadingMyna || mynaReadButton.disabled}
          aria-disabled={isReadingMyna || mynaReadButton.disabled}
          title={mynaReadButton.title}
          data-testid="myna-read-button"
        >
          {isReadingMyna ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
          {isReadingMyna ? '読取中...' : mynaReadButton.label}
        </button>
        <button
          type="button"
          className="btn-secondary flex-center gap-2"
          onClick={onOpenPatientRegistration}
          disabled={!hasDb}
          aria-disabled={!hasDb}
          data-testid="patient-register-open-button"
        >
          <UserPlus size={16} aria-hidden="true" />
          新規患者を登録
        </button>
      </div>
      <span id="patientSearchHint" className="field-hint">
        登録済みの患者から選びます。氏名・フリガナ・生年月日（半角8桁 例: 19850315）で探せます。空白で区切ると絞り込めます。初めての方は先に「新規患者を登録」してください。
      </span>
      {mynaMessage && (
        <span className="status-chip confirmed">
          {mynaMessage}
        </span>
      )}
    </div>
  );
});

export interface PatientNotFoundPromptProps {
  prompt: string;
  hasDb: boolean;
  onOpenPatientRegistration: () => void;
}

export const PatientNotFoundPrompt = React.memo(function PatientNotFoundPrompt({
  prompt,
  hasDb,
  onOpenPatientRegistration
}: PatientNotFoundPromptProps) {
  return (
    <div className="temporary-registration-note" data-testid="patient-not-found-note">
      <UserPlus size={16} aria-hidden="true" />
      <span>{prompt}</span>
      <button
        type="button"
        className="btn-primary flex-center gap-2"
        onClick={onOpenPatientRegistration}
        disabled={!hasDb}
        aria-disabled={!hasDb}
        data-testid="patient-register-from-empty-button"
      >
        <UserPlus size={16} aria-hidden="true" />
        新規患者を登録
      </button>
    </div>
  );
});

export interface ReceptionEligibilityToolRowProps {
  onlineEligibilityImplemented?: boolean;
  insuranceNumber: string;
  eligibilityStatus: EligibilityStatus;
  eligibilityMessage: string;
  eligibilityResult: NormalizedOnlineEligibilityResult | null;
  mynaReaderState: MynaReaderAvailabilityState;
  mynaReadButton: MynaReaderButtonView;
  onEligibilityCheck: () => void;
}

export const ReceptionEligibilityToolRow = React.memo(function ReceptionEligibilityToolRow({
  onlineEligibilityImplemented = isFeatureImplemented('onlineEligibility'),
  insuranceNumber,
  eligibilityStatus,
  eligibilityMessage,
  eligibilityResult,
  mynaReaderState,
  mynaReadButton,
  onEligibilityCheck
}: ReceptionEligibilityToolRowProps) {
  const isDisabled = !onlineEligibilityImplemented
    || !normalizeInsuranceNumber(insuranceNumber)
    || eligibilityStatus === 'checking';

  return (
    <div className="reception-tool-row">
      <button
        type="button"
        className="btn-secondary flex-center gap-2"
        onClick={onEligibilityCheck}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        title={onlineEligibilityImplemented ? undefined : FEATURE_AVAILABILITY.onlineEligibility.unavailableReason}
        data-testid="online-eligibility-button"
      >
        {eligibilityStatus === 'checking' ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        {labelWithAvailability('onlineEligibility', 'オンライン資格確認')}
      </button>
      {(mynaReadButton.disabled || !onlineEligibilityImplemented) && (
        <p className="field-hint reception-tool-note" data-testid="reception-tool-unimplemented-note">
          {[
            mynaReaderState.status === 'ready' && !mynaReaderState.available
              ? `マイナ読取は使えません(${mynaReaderState.reason || '接続先が未設定です'})`
              : '',
            !onlineEligibilityImplemented ? 'オンライン資格確認は未実装です' : ''
          ].filter(Boolean).join('。')}
          {mynaReaderState.status === 'checking' && onlineEligibilityImplemented ? '' : '。保険者番号・負担割合は手入力してください。'}
        </p>
      )}
      {eligibilityMessage && (
        <span
          className={`status-chip ${eligibilityStatus}`}
          title={eligibilityResult ? formatOnlineEligibilityFieldMappingReport(eligibilityResult.fieldMapping) : undefined}
        >
          {eligibilityMessage}
        </span>
      )}
    </div>
  );
});
