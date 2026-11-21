import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Patient } from '@/db/types';
import type { CopaymentSupportBadge } from '@/lib/patient_copayment_support';
import type { PublicInsuranceBadgeItem } from '@/lib/patient_public_insurance';
import type { InsuranceEligibilityIssue } from '@/lib/insurance_eligibility';
import { pickReceptionInsuranceNumber } from '@/lib/myna_read_display';

export interface SelectedPatientCardProps {
  patient: Pick<Patient, 'name' | 'birthDate' | 'insuranceInfo'>;
  publicBadges: readonly PublicInsuranceBadgeItem[];
  copaymentBadges: readonly CopaymentSupportBadge[];
  receptionAlerts: readonly InsuranceEligibilityIssue[];
  onReselect: () => void;
}

export const SelectedPatientCard = React.memo(function SelectedPatientCard({
  patient,
  publicBadges,
  copaymentBadges,
  receptionAlerts,
  onReselect
}: SelectedPatientCardProps) {
  return (
    <div className="selected-patient-card" data-testid="selected-patient-card">
      <div className="selected-patient-header">
        <div className="selected-patient-title-line">
          <span className="selected-patient-badge">選択中患者</span>
          <strong className="selected-patient-name">{patient.name}</strong>
          <span className="selected-patient-birth">（{patient.birthDate}）</span>
          <span className="selected-patient-insurance">
            保険者番号: {pickReceptionInsuranceNumber(patient.insuranceInfo) || '未登録'}
          </span>
          <button
            type="button"
            className="btn-secondary selected-patient-reselect"
            onClick={onReselect}
            data-testid="reselect-patient-button"
          >
            選び直す
          </button>
        </div>
        {(publicBadges.length > 0 || copaymentBadges.length > 0) && (
          <div className="selected-patient-public-badges" data-testid="selected-patient-public-badges">
            {publicBadges.map((badge) => (
              <span
                key={`selected-pub-badge-${badge.index}`}
                className={`selected-pub-badge ${badge.hasError ? 'error' : badge.hasWarning ? 'warning' : 'normal'}`}
                title={badge.warningMessage || `${badge.label} (負担者: ${badge.provider} / 受給者: ${badge.recipient})`}
              >
                公費{badge.index}: {badge.label}
                {badge.hasError && '【要確認】'}
                {badge.hasWarning && '【期限注意】'}
              </span>
            ))}
            {copaymentBadges.map((badge, idx) => (
              <span
                key={`selected-copay-badge-${idx}`}
                className={`selected-pub-badge ${badge.severity === 'orange' ? 'warning' : badge.severity === 'red' ? 'error' : 'normal'}`}
                title={badge.title}
                data-testid={`selected-patient-copay-badge-${idx}`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {receptionAlerts.length > 0 && (
        <div className="selected-patient-alerts" data-testid="selected-patient-alerts">
          {receptionAlerts.map((issue) => (
            <div
              key={issue.code}
              className={`selected-patient-alert-item ${issue.severity}`}
            >
              <AlertTriangle size={13} aria-hidden="true" />
              <span className="alert-item-title">{issue.title}:</span>
              <span className="alert-item-message">{issue.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
