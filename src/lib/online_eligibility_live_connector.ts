import type { Patient, PublicInsurance } from '@/db/types';
import {
  normalizeOnlineEligibilityResponse,
  type NormalizedOnlineEligibilityResult
} from './online_eligibility';

export interface EligibilityChangePreview {
  patientId?: string;
  patientName?: string;
  uiStatus: NormalizedOnlineEligibilityResult['uiStatus'];
  statusMessage: string;
  checkedAt: string;
  hasInsuranceChanges: boolean;
  hasPublicInsuranceChanges: boolean;
  insurancePatch: NonNullable<Patient['insuranceInfo']>;
  publicInsurances: PublicInsurance[];
}

export function processLiveEligibilityResponse({
  patient,
  rawResponse,
  checkedAt = new Date().toISOString()
}: {
  patient?: Patient;
  rawResponse: Record<string, unknown> | string;
  checkedAt?: string;
}): {
  normalized: NormalizedOnlineEligibilityResult;
  preview: EligibilityChangePreview;
} {
  const normalized = normalizeOnlineEligibilityResponse(rawResponse);
  const currentInsurance = patient?.insuranceInfo;
  const currentPublicInsurances = patient?.publicInsurances || [];

  const newInsurance = normalized.insuranceInfoPatch;
  const newPublicInsurances = normalized.publicInsurances || [];

  const hasInsuranceChanges =
    !currentInsurance ||
    currentInsurance.provider !== newInsurance.provider ||
    currentInsurance.number !== newInsurance.number ||
    currentInsurance.burdenRatio !== newInsurance.burdenRatio;

  const hasPublicInsuranceChanges =
    currentPublicInsurances.length !== newPublicInsurances.length ||
    newPublicInsurances.some((newPub, idx) => {
      const cur = currentPublicInsurances[idx];
      return (
        !cur ||
        cur.provider !== newPub.provider ||
        cur.recipient !== newPub.recipient
      );
    });

  const preview: EligibilityChangePreview = {
    patientId: patient?.patientId,
    patientName: patient?.name,
    uiStatus: normalized.uiStatus,
    statusMessage: normalized.message,
    checkedAt: normalized.checkedAt || checkedAt,
    hasInsuranceChanges,
    hasPublicInsuranceChanges,
    insurancePatch: newInsurance,
    publicInsurances: newPublicInsurances
  };

  return {
    normalized,
    preview
  };
}
