import { test } from 'node:test';
import assert from 'node:assert';
import type { CalculationResultItem } from './calculator.ts';
import type { ClaimValidationIssue } from './claim_validation.ts';
import {
  buildClaimOfficialRuleBatchReview,
  buildClaimOfficialRuleBatchReviewCsv,
  buildClaimOfficialRuleReview,
  buildClaimOfficialRuleReviewCsv,
  formatClaimOfficialRuleBatchReview,
  formatClaimOfficialRuleReview,
  makeClaimOfficialRuleReviewFileName,
  type ClaimOfficialRuleCase
} from './claim_rule_review.ts';

const medicalDxFee: CalculationResultItem = {
  code: 'base_additions',
  name: '電子的調剤情報連携体制整備加算',
  points: 8,
  rationale: '月1回'
};

function makeCase(overrides: Partial<ClaimOfficialRuleCase> = {}): ClaimOfficialRuleCase {
  return {
    caseId: 'case-1',
    patientKey: 'patient-secret-1',
    serviceDate: '2026-06-15',
    calculatedFees: [],
    validationIssues: [],
    ...overrides
  };
}

function issue(overrides: Partial<ClaimValidationIssue> = {}): ClaimValidationIssue {
  return {
    severity: 'error',
    code: 'diagnostic_management_enabled',
    title: '秘密の検査薬は薬学管理がONです',
    message: '秘密の薬品名を含む説明',
    ...overrides
  };
}

test('diagnostic issues become a plain-language prohibited-charge review without leaking drug details', () => {
  const report = buildClaimOfficialRuleReview({
    currentCase: makeCase({ validationIssues: [issue()] })
  }, new Date('2026-06-22T00:00:00.000Z'));

  const item = report.items.find((entry) => entry.ruleId === 'diagnostic_drug_fee_only');
  assert.ok(item);
  assert.strictEqual(item.status, 'attention');
  assert.strictEqual(item.severity, 'error');
  assert.deepStrictEqual(item.relatedIssueCodes, ['diagnostic_management_enabled']);
  assert.match(item.title, /検査薬は薬剤料だけ/);

  const csv = buildClaimOfficialRuleReviewCsv(report);
  assert.doesNotMatch(csv, /秘密の検査薬|秘密の薬品名/);
  assert.doesNotMatch(csv, /patient-secret-1/);
  assert.match(csv, /diagnostic_management_enabled/);
});

test('same-patient same-month medical DX addition is limited to one claim', () => {
  const currentCase = makeCase({ caseId: 'case-current', calculatedFees: [medicalDxFee] });
  const report = buildClaimOfficialRuleReview({
    currentCase,
    monthCases: [
      makeCase({ caseId: 'case-previous', serviceDate: '2026-06-01', calculatedFees: [medicalDxFee] }),
      currentCase
    ]
  });

  const item = report.items.find((entry) => entry.ruleId === 'medical_dx_monthly_once');
  assert.ok(item);
  assert.strictEqual(item.status, 'attention');
  assert.strictEqual(item.observedCount, 2);
  assert.strictEqual(item.allowedCount, 1);
  assert.deepStrictEqual(item.relatedIssueCodes, ['medical_dx_monthly_limit_exceeded']);
});

test('medical DX count ignores another patient and another month', () => {
  const report = buildClaimOfficialRuleReview({
    currentCase: makeCase({ caseId: 'case-current', calculatedFees: [medicalDxFee] }),
    monthCases: [
      makeCase({ caseId: 'other-patient', patientKey: 'patient-secret-2', calculatedFees: [medicalDxFee] }),
      makeCase({ caseId: 'other-month', serviceDate: '2026-05-31', calculatedFees: [medicalDxFee] })
    ]
  });

  const item = report.items.find((entry) => entry.ruleId === 'medical_dx_monthly_once');
  assert.ok(item);
  assert.strictEqual(item.status, 'pass');
  assert.strictEqual(item.observedCount, 1);
});

test('medical DX addition is prohibited for special base fee B if it appears in calculated fees', () => {
  const report = buildClaimOfficialRuleReview({
    currentCase: makeCase({
      baseFeeCategory: 'special_b',
      calculatedFees: [medicalDxFee]
    })
  });

  const item = report.items.find((entry) => entry.ruleId === 'medical_dx_special_b_prohibited');
  assert.ok(item);
  assert.strictEqual(item.status, 'attention');
  assert.strictEqual(item.severity, 'error');
  assert.deepStrictEqual(item.relatedIssueCodes, ['medical_dx_special_b_prohibited']);
  assert.match(item.title, /特別調剤基本料B/);
});

test('insurance and public expense dates become one effective-period review', () => {
  const report = buildClaimOfficialRuleReview({
    currentCase: makeCase({
      validationIssues: [
        issue({ code: 'insurance_expired', title: '保険資格が期限切れです' }),
        issue({ code: 'public_insurance_start_future', title: '公費の開始日前です' })
      ]
    })
  });

  const item = report.items.find((entry) => entry.ruleId === 'insurance_effective_period');
  assert.ok(item);
  assert.strictEqual(item.status, 'attention');
  assert.deepStrictEqual(item.relatedIssueCodes, ['insurance_expired', 'public_insurance_start_future']);
  assert.match(item.title, /保険・公費の有効期間内/);
});

test('clear claims produce four passing checks and a compact status', () => {
  const report = buildClaimOfficialRuleReview({ currentCase: makeCase() });

  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.ruleCount, 4);
  assert.strictEqual(report.attentionCount, 0);
  assert.ok(report.items.every((item) => item.status === 'pass'));
  assert.strictEqual(formatClaimOfficialRuleReview(report), '算定ルール確認OK（4項目）');
});

test('CSV protects formula-like case IDs including leading whitespace and file name is stable', () => {
  const report = buildClaimOfficialRuleReview({
    currentCase: makeCase({ caseId: '  =case-1' })
  });
  const csv = buildClaimOfficialRuleReviewCsv(report);

  assert.match(csv, /'  =case-1/);
  assert.doesNotMatch(csv, /patient-secret-1/);
  assert.strictEqual(makeClaimOfficialRuleReviewFileName(new Date('2026-06-22T12:00:00.000Z')), '算定ルール確認_20260622.csv');
});

test('batch review aggregates patient-free checks across monthly cases', () => {
  const report = buildClaimOfficialRuleBatchReview([
    makeCase({ caseId: 'rule-case-001', calculatedFees: [medicalDxFee] }),
    makeCase({ caseId: 'rule-case-002', serviceDate: '2026-06-20', calculatedFees: [medicalDxFee] })
  ], new Date('2026-06-22T00:00:00.000Z'));

  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.caseCount, 2);
  assert.strictEqual(report.ruleCount, 8);
  assert.strictEqual(report.attentionCount, 2);
  assert.match(formatClaimOfficialRuleBatchReview(report), /同じ患者で月1回まで/);

  const csv = buildClaimOfficialRuleBatchReviewCsv(report);
  assert.match(csv, /2件・8項目を確認/);
  assert.doesNotMatch(csv, /patient-secret-1/);
});
