import { test } from 'node:test';
import assert from 'node:assert';
import { validateDispensingClaim } from './claim_validation.ts';
import type { CalculationResultItem } from './calculator.ts';
import type { FacilitySettings, Patient } from '../db/types.ts';
import type { ClaimValidationItem } from './claim_validation.ts';

const settings: FacilitySettings = {
  id: 'default',
  pharmacyName: 'テスト薬局',
  pharmacyCode: '1234567',
  baseFeeCategory: '1',
  regionalSupportAddition: 'none',
  medicalDxAddition: false,
  postGenericAddition: 'none',
  genericDispensingReduction: false
};

const patient: Patient = {
  patientId: 'p1',
  name: '山田 太郎',
  kana: 'ヤマダ タロウ',
  birthDate: '1980-01-01',
  insuranceInfo: {
    provider: '06123456',
    number: '記号123',
    burdenRatio: 30
  }
};

const fees: CalculationResultItem[] = [
  { code: 'base_fee', name: '調剤基本料1', points: 47, rationale: 'test' },
  { code: 'drug_preparation', name: '薬剤調製料', points: 24, rationale: 'test' },
  { code: 'dispensing_management', name: '調剤管理料', points: 10, rationale: 'test' },
  { code: 'medication_guidance', name: '服薬管理指導料1', points: 45, rationale: 'test' },
  { code: 'drug_fee', name: '薬剤料', points: 21, rationale: 'test' }
];

const medicalDxFee: CalculationResultItem = {
  code: 'base_additions',
  feeKey: 'medical_dx_addition',
  name: '電子的調剤情報連携体制整備加算',
  points: 8,
  rationale: 'test'
};

function item(overrides: Partial<ClaimValidationItem> = {}): ClaimValidationItem {
  return {
    itemId: 'item1',
    visitId: 'visit1',
    drugId: 'drug1',
    drugName: 'テスト錠',
    amount: 1,
    days: 7,
    usage: '1日1回 朝食後',
    drugPrice: 30,
    yjCode: '1234567F',
    claimPreparation: true,
    claimManagement: true,
    claimDrugFee: true,
    ...overrides
  };
}

test('validateDispensingClaim returns no blocking issue for a complete normal claim', () => {
  const issues = validateDispensingClaim({
    settings,
    patient,
    items: [item()],
    calculatedFees: fees,
    totalPoints: 147
  });

  assert.deepStrictEqual(
    issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code),
    []
  );
});

test('validateDispensingClaim catches missing insurance, pharmacy code, and drug price', () => {
  const issues = validateDispensingClaim({
    settings: { ...settings, pharmacyCode: '' },
    patient: { ...patient, insuranceInfo: undefined },
    items: [item({ drugPrice: undefined })],
    calculatedFees: fees.filter((fee) => fee.code !== 'drug_fee'),
    totalPoints: 126
  });

  const codes = issues.map((issue) => issue.code);

  assert.ok(codes.includes('insurance_missing'));
  assert.ok(codes.includes('pharmacy_code_missing'));
  assert.ok(codes.includes('drug_price_missing'));
  assert.ok(codes.includes('drug_fee_result_missing'));
});

test('validateDispensingClaim blocks abolished drugs and missing receipt drug codes', () => {
  const issues = validateDispensingClaim({
    settings,
    patient,
    items: [
      item({ itemId: 'abolished', drugName: '廃止薬錠', isAbolished: true }),
      item({ itemId: 'missing-code', drugId: '', drugName: 'コード未設定錠' })
    ],
    calculatedFees: fees,
    totalPoints: 147
  });

  assert.ok(issues.some((issue) => issue.code === 'abolished_drug_claimed' && issue.severity === 'error' && issue.itemId === 'abolished'));
  assert.ok(issues.some((issue) => issue.code === 'receipt_drug_code_missing' && issue.severity === 'error' && issue.itemId === 'missing-code'));
});

test('validateDispensingClaim surfaces structured insurance eligibility and public expense issues', () => {
  const issues = validateDispensingClaim({
    settings,
    patient: {
      ...patient,
      insuranceInfo: {
        ...patient.insuranceInfo,
        eligibilityStatus: 'valid',
        validTo: '2026-06-14'
      },
      publicInsurances: [
        {
          provider: '51136018',
          recipient: '1234567',
          burdenRatio: 10,
          endDate: '2026-06-20'
        }
      ]
    },
    items: [item()],
    calculatedFees: fees,
    totalPoints: 147,
    serviceDate: '2026-06-15'
  });

  assert.ok(issues.some((issue) => issue.code === 'insurance_expired' && issue.severity === 'error'));
  assert.ok(issues.some((issue) => issue.code === 'insurance_relationship_missing' && issue.severity === 'warning'));
  assert.ok(issues.some((issue) => issue.code === 'insurance_eligibility_checked_at_missing' && issue.severity === 'warning'));
  assert.ok(issues.some((issue) => issue.code === 'public_insurance_expiring_soon' && issue.severity === 'warning'));
  assert.ok(issues.some((issue) => issue.code === 'public_insurance_monthly_limit_missing' && issue.severity === 'warning'));
});

test('validateDispensingClaim blocks invalid insurance and public expense identifiers', () => {
  const issues = validateDispensingClaim({
    settings,
    patient: {
      ...patient,
      insuranceInfo: {
        ...patient.insuranceInfo,
        provider: '06-123456',
        eligibilityStatus: 'valid'
      },
      publicInsurances: [
        {
          provider: '5113601',
          recipient: '１２３４５６７',
          burdenRatio: 10,
          monthlyLimitYen: 5000
        }
      ]
    },
    items: [item()],
    calculatedFees: fees,
    totalPoints: 147,
    serviceDate: '2026-06-15'
  });

  assert.ok(issues.some((issue) => issue.code === 'insurance_provider_format_invalid' && issue.severity === 'error'));
  assert.ok(issues.some((issue) => issue.code === 'public_insurance_provider_format_invalid' && issue.severity === 'error'));
  assert.ok(issues.some((issue) => issue.code === 'public_insurance_recipient_format_invalid' && issue.severity === 'error'));
});

test('validateDispensingClaim requires diagnostic tests to be drug-fee-only', () => {
  const issues = validateDispensingClaim({
    settings,
    patient,
    items: [item({ isDiagnosticTest: true })],
    calculatedFees: [
      { code: 'base_fee', name: '調剤基本料1', points: 47, rationale: 'test' },
      { code: 'drug_fee', name: '薬剤料', points: 21, rationale: 'test' }
    ],
    totalPoints: 68
  });

  const codes = issues.map((issue) => issue.code);

  assert.ok(codes.includes('diagnostic_preparation_enabled'));
  assert.ok(codes.includes('diagnostic_management_enabled'));
  assert.ok(codes.includes('diagnostic_drug_fee_only_required'));

  const drugFeeOnlyIssues = validateDispensingClaim({
    settings,
    patient,
    items: [
      item({
        isDiagnosticTest: true,
        claimPreparation: false,
        claimManagement: false
      })
    ],
    calculatedFees: [
      { code: 'drug_fee', name: '薬剤料', points: 21, rationale: 'test' }
    ],
    claimOptions: { drugFeeOnly: true },
    totalPoints: 21
  });

  assert.deepStrictEqual(
    drugFeeOnlyIssues.filter((issue) => issue.severity === 'error').map((issue) => issue.code),
    []
  );
});

test('validateDispensingClaim blocks medical DX when same-month history already claimed it', () => {
  const issues = validateDispensingClaim({
    settings: {
      ...settings,
      medicalDxAddition: true
    },
    patient,
    items: [item()],
    calculatedFees: [...fees, medicalDxFee],
    totalPoints: 155,
    serviceDate: '2026-06-20',
    currentVisitId: 'visit-current',
    monthlyFeeHistory: [
      {
        visitId: 'visit-previous',
        patientId: patient.patientId,
        serviceDate: '2026-06-01',
        feeKey: 'medical_dx_addition',
        points: 8
      }
    ]
  });

  assert.ok(issues.some((issue) => (
    issue.code === 'monthly_once_fee_already_claimed'
    && issue.severity === 'error'
    && issue.feeCode === 'base_additions'
  )));
});

test('validateDispensingClaim surfaces available monthly fee OFF rationale when fee is already suppressed', () => {
  const issues = validateDispensingClaim({
    settings: {
      ...settings,
      medicalDxAddition: true
    },
    patient,
    items: [item()],
    calculatedFees: fees,
    totalPoints: 147,
    serviceDate: '2026-06-20',
    currentVisitId: 'visit-current',
    monthlyFeeHistory: [
      {
        visitId: 'visit-previous',
        patientId: patient.patientId,
        serviceDate: '2026-06-01',
        feeKey: 'medical_dx_addition',
        points: 8
      }
    ]
  });

  assert.ok(!issues.some((issue) => issue.code === 'monthly_once_fee_already_claimed'));
  assert.ok(issues.some((issue) => (
    issue.code === 'monthly_fee_off_reason_available'
    && issue.severity === 'info'
    && /算定済み/.test(issue.message)
  )));

  const issuesWithRationale = validateDispensingClaim({
    settings: {
      ...settings,
      medicalDxAddition: true
    },
    patient,
    items: [item()],
    calculatedFees: fees,
    claimOptions: {
      disabledFeeRationales: {
        medical_dx_addition: '同月内に算定済みのため'
      }
    },
    totalPoints: 147,
    serviceDate: '2026-06-20',
    currentVisitId: 'visit-current',
    monthlyFeeHistory: [
      {
        visitId: 'visit-previous',
        patientId: patient.patientId,
        serviceDate: '2026-06-01',
        feeKey: 'medical_dx_addition',
        points: 8
      }
    ]
  });

  assert.ok(!issuesWithRationale.some((issue) => issue.code === 'monthly_fee_off_reason_available'));
});

test('validateDispensingClaim blocks medical DX for special base fee B when calculated fee contains it', () => {
  const issues = validateDispensingClaim({
    settings: {
      ...settings,
      baseFeeCategory: 'special_b',
      medicalDxAddition: true
    },
    patient,
    items: [item()],
    calculatedFees: [...fees, medicalDxFee],
    totalPoints: 155,
    serviceDate: '2026-06-20'
  });

  assert.ok(issues.some((issue) => (
    issue.code === 'medical_dx_special_b_prohibited'
    && issue.severity === 'error'
    && /特別調剤基本料B/.test(issue.message)
  )));
});

test('validateDispensingClaim warns for high-risk medicine without tokkan selection', () => {
  const issues = validateDispensingClaim({
    settings,
    patient,
    items: [item({ isHighRisk: true, tokkanType: 'none' })],
    calculatedFees: fees,
    totalPoints: 147
  });

  assert.ok(issues.some((issue) => issue.code === 'high_risk_tokkan_missing' && issue.severity === 'warning'));

  const disabledIssues = validateDispensingClaim({
    settings,
    patient,
    items: [item({ isHighRisk: true, tokkanType: 'none' })],
    calculatedFees: fees.filter((fee) => fee.code !== 'special_management'),
    claimOptions: { disabledFeeCodes: ['special_management'] },
    totalPoints: 147
  });

  assert.ok(!disabledIssues.some((issue) => issue.code === 'high_risk_tokkan_missing'));
});

test('validateDispensingClaim surfaces patient allergy and side effect alerts', () => {
  const issues = validateDispensingClaim({
    settings,
    patient,
    items: [
      item({ drugName: 'ペニシリンVカリウム錠' }),
      item({ itemId: 'item2', drugId: 'drug2', drugName: 'ロキソニン錠60mg' })
    ],
    calculatedFees: fees,
    patientAlerts: [
      {
        alertId: 'a1',
        patientId: patient.patientId,
        type: 'allergy',
        content: 'ペニシリン',
        status: 'active'
      },
      {
        alertId: 'a2',
        patientId: patient.patientId,
        type: 'side_effect',
        content: 'ロキソニン',
        status: 'active'
      }
    ],
    totalPoints: 147
  });

  assert.ok(issues.some((issue) => issue.code === 'patient_allergy_match' && issue.severity === 'error'));
  assert.ok(issues.some((issue) => issue.code === 'patient_side_effect_match' && issue.severity === 'warning'));
});

test('validateDispensingClaim catches duplicate therapeutic category therapy', () => {
  const issues = validateDispensingClaim({
    settings,
    patient,
    items: [
      item({ itemId: 'i1', drugId: 'd1', drugName: 'ロキソニン錠60mg', yjCode: '1149019F1020' }),
      item({ itemId: 'i2', drugId: 'd2', drugName: 'ボルタレン錠25mg', yjCode: '1149002F1020' })
    ],
    calculatedFees: fees,
    totalPoints: 147
  });

  assert.ok(issues.some((issue) => issue.code === 'duplicate_therapy_detected' && issue.severity === 'warning'));
});
