import { test } from 'node:test';
import assert from 'node:assert';
import type { Patient } from '@/db/types';
import { processLiveEligibilityResponse } from './online_eligibility_live_connector.ts';

const mockPatient: Patient = {
  patientId: 'pt_001',
  name: '山田 太郎',
  kana: 'ヤマダ タロウ',
  birthDate: '1980-05-15',
  gender: 'male',
  insuranceInfo: {
    provider: '138001',
    number: '987654',
    burdenRatio: 30,
    relationship: 'self',
    insuranceType: 'shakai_hoken'
  },
  publicInsurances: []
};

test('processLiveEligibilityResponse parses raw response and computes change preview', () => {
  const rawResponse = {
    qualificationStatus: 'valid',
    insurerNumber: '138001',
    insuredNumber: '987654',
    burdenRatio: 30,
    publicExpenses: [
      {
        provider: '12130001',
        recipient: '1234567'
      }
    ]
  };

  const result = processLiveEligibilityResponse({
    patient: mockPatient,
    rawResponse
  });

  assert.strictEqual(result.normalized.uiStatus, 'confirmed');
  assert.strictEqual(result.preview.patientId, 'pt_001');
  assert.strictEqual(result.preview.hasPublicInsuranceChanges, true);
  assert.strictEqual(result.preview.publicInsurances.length, 1);
  assert.strictEqual(result.preview.publicInsurances[0].provider, '12130001');
});
