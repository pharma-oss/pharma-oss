import { test } from 'node:test';
import assert from 'node:assert';
import type { Patient } from '../db/types.ts';
import { evaluateInsuranceEligibility } from './insurance_eligibility.ts';

const basePatient: Patient = {
  patientId: 'pt_1',
  name: '山田 太郎',
  kana: 'ヤマダ タロウ',
  birthDate: '1980-01-01',
  insuranceInfo: {
    provider: '06123456',
    number: '記号123',
    burdenRatio: 30,
    relationship: '本人',
    eligibilityStatus: 'valid',
    eligibilityCheckedAt: '2026-06-01',
    validFrom: '2026-04-01',
    validTo: '2026-12-31'
  }
};

test('evaluateInsuranceEligibility returns no issue for valid structured insurance', () => {
  assert.deepStrictEqual(
    evaluateInsuranceEligibility({ patient: basePatient, serviceDate: '2026-06-15' }),
    []
  );
});

test('evaluateInsuranceEligibility warns when qualification is unchecked or expiring soon', () => {
  const issues = evaluateInsuranceEligibility({
    patient: {
      ...basePatient,
      insuranceInfo: {
        ...basePatient.insuranceInfo,
        eligibilityStatus: 'unchecked',
        validTo: '2026-06-20'
      }
    },
    serviceDate: '2026-06-15'
  });

  assert.ok(issues.some((issue) => issue.code === 'insurance_eligibility_unchecked' && issue.severity === 'warning'));
  assert.ok(issues.some((issue) => issue.code === 'insurance_expiring_soon' && issue.severity === 'warning'));
});

test('evaluateInsuranceEligibility warns when relationship is missing or qualification check is stale', () => {
  const issues = evaluateInsuranceEligibility({
    patient: {
      ...basePatient,
      insuranceInfo: {
        ...basePatient.insuranceInfo,
        relationship: undefined,
        eligibilityCheckedAt: '2026-04-01'
      }
    },
    serviceDate: '2026-06-15'
  });

  assert.ok(issues.some((issue) => issue.code === 'insurance_relationship_missing' && issue.severity === 'warning'));
  assert.ok(issues.some((issue) => issue.code === 'insurance_eligibility_checked_at_stale' && issue.severity === 'warning'));
});

test('evaluateInsuranceEligibility errors when qualification check date is invalid or future dated', () => {
  const invalidIssues = evaluateInsuranceEligibility({
    patient: {
      ...basePatient,
      insuranceInfo: {
        ...basePatient.insuranceInfo,
        eligibilityCheckedAt: '資格確認日不明'
      }
    },
    serviceDate: '2026-06-15'
  });
  const futureIssues = evaluateInsuranceEligibility({
    patient: {
      ...basePatient,
      insuranceInfo: {
        ...basePatient.insuranceInfo,
        eligibilityCheckedAt: '2026-06-16'
      }
    },
    serviceDate: '2026-06-15'
  });

  assert.ok(invalidIssues.some((issue) => issue.code === 'insurance_eligibility_checked_at_invalid' && issue.severity === 'error'));
  assert.ok(futureIssues.some((issue) => issue.code === 'insurance_eligibility_checked_at_future' && issue.severity === 'error'));
});

test('evaluateInsuranceEligibility errors on invalid insurance and public expense identifiers', () => {
  const issues = evaluateInsuranceEligibility({
    patient: {
      ...basePatient,
      insuranceInfo: {
        ...basePatient.insuranceInfo,
        provider: '０６１２３４５６'
      },
      publicInsurances: [
        {
          provider: '51136A18',
          recipient: '123456',
          monthlyLimitYen: 5000
        },
        {
          provider: '',
          recipient: '',
          monthlyLimitYen: 0
        }
      ]
    },
    serviceDate: '2026-06-15'
  });

  assert.ok(issues.some((issue) => issue.code === 'insurance_provider_format_invalid' && issue.severity === 'error'));
  assert.ok(issues.some((issue) => issue.code === 'public_insurance_provider_format_invalid' && issue.severity === 'error'));
  assert.ok(issues.some((issue) => issue.code === 'public_insurance_recipient_format_invalid' && issue.severity === 'error'));
  assert.ok(issues.some((issue) => issue.code === 'public_insurance_provider_missing' && issue.severity === 'error'));
  assert.ok(issues.some((issue) => issue.code === 'public_insurance_recipient_missing' && issue.severity === 'error'));
});

test('evaluateInsuranceEligibility validates public expense burden ratio', () => {
  const issues = evaluateInsuranceEligibility({
    patient: {
      ...basePatient,
      publicInsurances: [
        {
          provider: '51136018',
          recipient: '1234567',
          monthlyLimitYen: 5000
        },
        {
          provider: '81136018',
          recipient: '7654321',
          burdenRatio: 101,
          monthlyLimitYen: 5000
        }
      ]
    },
    serviceDate: '2026-06-15'
  });

  assert.ok(issues.some((issue) => issue.code === 'public_insurance_burden_ratio_missing' && issue.severity === 'warning'));
  assert.ok(issues.some((issue) => issue.code === 'public_insurance_burden_ratio_invalid' && issue.severity === 'error'));
});

test('evaluateInsuranceEligibility errors on expired insurance and future public expense start', () => {
  const issues = evaluateInsuranceEligibility({
    patient: {
      ...basePatient,
      insuranceInfo: {
        ...basePatient.insuranceInfo,
        validTo: '2026-06-14'
      },
      publicInsurances: [
        {
          provider: '51136018',
          recipient: '1234567',
          startDate: '2026-06-20',
          endDate: '2026-12-31',
          burdenRatio: 10
        }
      ]
    },
    serviceDate: '2026-06-15'
  });

  assert.ok(issues.some((issue) => issue.code === 'insurance_expired' && issue.severity === 'error'));
  assert.ok(issues.some((issue) => issue.code === 'public_insurance_start_future' && issue.severity === 'error'));
  assert.ok(issues.some((issue) => issue.code === 'public_insurance_monthly_limit_missing' && issue.severity === 'warning'));
});
