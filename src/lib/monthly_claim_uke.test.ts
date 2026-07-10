import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import encoding from 'encoding-japanese';
import type { FacilitySettings, Patient, Visit } from '../db/types.ts';
import type { CalculationResultItem } from './calculator.ts';
import { DISPENSING_UKE_KNOWN_RECORD_SPEC, DISPENSING_UKE_RECORD_SPEC_SOURCE } from './receipt/dispensing_uke_validation.ts';
import {
  buildMonthlyClaimOfficialUkeBundle,
  buildMonthlyClaimOfficialResubmissionRegressionCsv,
  buildMonthlyClaimOfficialResubmissionRegressionReport,
  buildMonthlyClaimOfficialSubmissionTrialCsv,
  buildMonthlyClaimOfficialSubmissionTrialReport,
  buildMonthlyClaimOfficialSubmissionTrialTemplate,
  buildMonthlyClaimOfficialPrescriptionGroupPlan,
  buildMonthlyClaimOfficialPrescriptionGroupPlanCsv,
  buildMonthlyClaimUkeBundle,
  buildMonthlyClaimUkeAllFieldIssueCsv,
  buildMonthlyClaimUkeAllFieldSourceSummary,
  buildMonthlyClaimUkeOfficialReadinessIssueCsv,
  buildMonthlyClaimUkeOfficialReadinessReviewCsv,
  buildMonthlyClaimUkeOfficialReadinessSummary,
  buildMonthlyClaimUkeOfficialSampleScopeReport,
  buildMonthlyClaimUkeResults,
  buildMonthlyClaimUkePreflightReport,
  buildMonthlyClaimUkeSampleCoverageReport,
  formatMonthlyClaimUkeAllFieldIssues,
  formatMonthlyClaimUkeBatchIssues,
  formatMonthlyClaimOfficialPrescriptionGroupPlan,
  formatMonthlyClaimOfficialResubmissionRegressionReport,
  formatMonthlyClaimOfficialSubmissionTrialReport,
  formatMonthlyClaimUkeIssues,
  formatMonthlyClaimUkeOfficialReadinessIssues,
  formatMonthlyClaimUkeOfficialSampleScopeReport,
  formatMonthlyClaimUkePreflightReport,
  getMonthlyClaimUkeAllFieldIssues,
  getMonthlyClaimUkeBatchIssues,
  getMonthlyClaimUkeIssues,
  getMonthlyClaimUkeOfficialReadinessIssues,
  makeMonthlyClaimUkeAllFieldIssueFileName,
  makeMonthlyClaimOfficialResubmissionRegressionFileName,
  makeMonthlyClaimOfficialSubmissionTrialFileName,
  makeMonthlyClaimUkeFileName,
  makeMonthlyClaimUkeOfficialReadinessIssueFileName,
  makeMonthlyClaimUkeOfficialReadinessReviewFileName,
  validateMonthlyClaimUkeBatch,
  type MonthlyClaimUkeCase
} from './monthly_claim_uke.ts';

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const settings: FacilitySettings = {
  id: 'default',
  pharmacyName: 'pharma-oss薬局',
  pharmacyKana: 'ヤクレキヤッキョク',
  pharmacyCode: '1234567',
  pharmacyPostalCode: '100-0001',
  pharmacyAddress: '東京都千代田区1-1',
  pharmacyPhone: '03-0000-0000',
  registrationNumber: 'T1234567890123',
  baseFeeCategory: '1',
  regionalSupportAddition: 'none',
  medicalDxAddition: false
};

function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    patientId: 'pt_1',
    name: '山田 太郎',
    kana: 'ヤマダ タロウ',
    birthDate: '1980-01-02',
    gender: 'male',
    insuranceInfo: {
      provider: '06123456',
      number: '記号123',
      burdenRatio: 30,
      relationship: '本人'
    },
    ...overrides
  };
}

function makeVisit(overrides: Partial<Visit> = {}): Visit {
  return {
    visitId: 'visit_1',
    patientId: 'pt_1',
    issueDate: '2026-06-14T09:00:00.000Z',
    status: 'completed',
    institutionId: '1312345',
    doctorId: 'doctor_1',
    ...overrides
  };
}

function makeRebillingLifecycle(reason = '返戻修正後の月遅れ請求'): NonNullable<Visit['claimLifecycle']> {
  return {
    status: 'rebilling',
    rebillingReason: reason
  };
}

function makeCase(overrides: {
  visit?: Partial<Visit>;
  patient?: Partial<Patient>;
  amount?: number;
  drugPrice?: number;
} = {}): MonthlyClaimUkeCase {
  const visit = makeVisit(overrides.visit);
  const patient = makePatient(overrides.patient);
  const fees: CalculationResultItem[] = [
    {
      name: '調剤基本料1',
      points: 45,
      code: 'base_fee',
      rationale: 'テスト'
    }
  ];

  return {
    visit,
    patient,
    settings,
    items: [
      {
        itemId: `${visit.visitId}_item_1`,
        visitId: visit.visitId,
        rpNumber: 1,
        drugId: 'drug_1',
        drugName: 'テスト錠10mg',
        yjCode: '123456789012',
        drugPrice: overrides.drugPrice ?? 12.3,
        amount: overrides.amount ?? 1,
        usage: '1日1回朝食後',
        days: 7
      }
    ],
    calculatedFees: fees
  };
}

function makeOfficialReadyCase(overrides: {
  visit?: Partial<Visit>;
  patient?: Partial<Patient>;
} = {}): MonthlyClaimUkeCase {
  const claim = makeCase(overrides);
  claim.items[0] = {
    ...claim.items[0],
    dispensedDrugCode: '620124201'
  };
  claim.calculatedFees = [
    {
      code: 'base_fee',
      receiptFeeCode: '410004110',
      name: '調剤基本料1',
      points: 45,
      rationale: 'テスト'
    },
    {
      code: 'drug_preparation',
      receiptFeeCode: '420001810',
      name: '薬剤調製料',
      points: 24,
      rationale: 'テスト'
    },
    {
      code: 'drug_fee',
      name: '薬剤料',
      points: 56,
      rationale: 'テスト'
    }
  ];
  return claim;
}

test('makeMonthlyClaimUkeFileName creates stable monthly claim UKE names', () => {
  assert.strictEqual(
    makeMonthlyClaimUkeFileName(new Date(2026, 5, 14, 9, 8, 7)),
    'MONTHLY_CLAIM_20260614_090807.uke'
  );
  assert.strictEqual(
    makeMonthlyClaimUkeAllFieldIssueFileName(new Date(2026, 5, 14, 9, 8, 7)),
    'MONTHLY_CLAIM_ALL_FIELDS_20260614_090807.csv'
  );
  assert.strictEqual(
    makeMonthlyClaimUkeOfficialReadinessIssueFileName(new Date(2026, 5, 14, 9, 8, 7)),
    'MONTHLY_CLAIM_OFFICIAL_READINESS_20260614_090807.csv'
  );
  assert.strictEqual(
    makeMonthlyClaimUkeOfficialReadinessReviewFileName(new Date(2026, 5, 14, 9, 8, 7)),
    'MONTHLY_CLAIM_OFFICIAL_READINESS_REVIEW_20260614_090807.csv'
  );
  assert.strictEqual(
    makeMonthlyClaimOfficialSubmissionTrialFileName(new Date(2026, 5, 14, 9, 8, 7)),
    'MONTHLY_CLAIM_OFFICIAL_SUBMISSION_TRIAL_20260614_090807.csv'
  );
  assert.strictEqual(
    makeMonthlyClaimOfficialResubmissionRegressionFileName(new Date(2026, 5, 14, 9, 8, 7)),
    'MONTHLY_CLAIM_OFFICIAL_RESUBMISSION_REGRESSION_20260614_090807.csv'
  );
});

test('buildMonthlyClaimUkeBundle combines multiple validated claims into one UKE payload', () => {
  const cases = [
    makeCase({
      visit: { claimLifecycle: makeRebillingLifecycle() }
    }),
    makeCase({
      visit: { visitId: 'visit_2', patientId: 'pt_2', claimLifecycle: makeRebillingLifecycle() },
      patient: { patientId: 'pt_2', name: '佐藤 花子', kana: 'サトウ ハナコ' }
    })
  ];
  const results = buildMonthlyClaimUkeResults(cases, new Date('2026-06-14T09:00:00.000Z'));
  const errors = getMonthlyClaimUkeIssues(results, 'error');
  assert.strictEqual(errors.length, 0);

  const bundle = buildMonthlyClaimUkeBundle(results, 'MONTHLY_CLAIM_TEST.uke');
  assert.strictEqual(bundle.fileName, 'MONTHLY_CLAIM_TEST.uke');
  assert.strictEqual(bundle.totalClaims, 2);
  assert.strictEqual(bundle.totalPoints, 90);
  assert.strictEqual(bundle.batchIssues.length, 0);
  assert.strictEqual(bundle.officialSampleScopeReport.ok, true);
  assert.ok(bundle.officialSampleScopeReport.suppressedRecordTypes.includes('MN'));
  assert.strictEqual(bundle.allFieldSourceSummary.sourceUrl, DISPENSING_UKE_RECORD_SPEC_SOURCE.url);
  assert.strictEqual(bundle.allFieldSourceSummary.checkedFieldCount, 0);
  assert.deepStrictEqual(bundle.allFieldIssues, []);
  assert.match(bundle.allFieldIssueCsv, /^"出典","出典URL","受付ID","患者ID","患者名","レコード位置"/);
  assert.strictEqual(bundle.records.filter((record) => record.type === 'YK').length, 1);
  assert.strictEqual(bundle.records.filter((record) => record.type === 'RE').length, 2);
  assert.strictEqual(bundle.records.filter((record) => record.type === 'ST').length, 1);
  assert.ok(bundle.content.length > 0);
});

test('monthly claim UKE official readiness reports missing fee and drug receipt codes', () => {
  const results = buildMonthlyClaimUkeResults([
    makeCase({
      visit: { claimLifecycle: makeRebillingLifecycle() }
    })
  ], new Date('2026-06-14T09:00:00.000Z'));

  const report = results[0].officialReadinessReport;
  const issues = getMonthlyClaimUkeOfficialReadinessIssues(results);
  const summary = buildMonthlyClaimUkeOfficialReadinessSummary(results);
  const issueCsv = buildMonthlyClaimUkeOfficialReadinessIssueCsv(issues);
  const reviewCsv = buildMonthlyClaimUkeOfficialReadinessReviewCsv(results);
  const preflightReport = buildMonthlyClaimUkePreflightReport(results);

  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.checkedFeeCount, 1);
  assert.strictEqual(report.readyFeeCount, 0);
  assert.strictEqual(report.checkedDrugItemCount, 1);
  assert.strictEqual(report.readyDrugItemCount, 0);
  assert.deepStrictEqual(issues.map((issue) => issue.code), [
    'official_uke_fee_code_missing',
    'official_uke_drug_code_invalid'
  ]);
  assert.strictEqual(summary.ok, false);
  assert.strictEqual(summary.errorCount, 2);
  assert.match(formatMonthlyClaimUkeOfficialReadinessIssues(issues), /調剤基本料1/);
  assert.match(formatMonthlyClaimUkeOfficialReadinessIssues(issues), /テスト錠10mg/);
  assert.match(issueCsv, /^"受付ID","患者名","重要度","指摘コード"/);
  assert.match(issueCsv, /"official_uke_fee_code_missing"/);
  assert.match(preflightReport.officialReadinessIssueCsv, /"official_uke_drug_code_invalid"/);
  assert.match(reviewCsv, /^"区分","受付ID","患者ID","患者名","判定","算定確認","薬剤確認","要対応件数"/);
  assert.match(reviewCsv, /"受付サマリ","visit_1","pt_1","山田 太郎","要対応","0\/1","0\/1","2"/);
  assert.match(preflightReport.officialReadinessReviewCsv, /"指摘","visit_1","pt_1","山田 太郎","要対応","0\/1","0\/1","2","official_uke_fee_code_missing"/);
  assert.match(formatMonthlyClaimUkePreflightReport(preflightReport), /公式提出準備 要対応 2/);
});

test('monthly claim UKE official readiness passes when official fee and drug codes are present', () => {
  const claim = makeCase({
    visit: { claimLifecycle: makeRebillingLifecycle() }
  });
  claim.calculatedFees[0] = {
    ...claim.calculatedFees[0],
    receiptFeeCode: '410004110'
  };
  claim.items[0] = {
    ...claim.items[0],
    dispensedDrugCode: '620124201'
  };

  const results = buildMonthlyClaimUkeResults([claim], new Date('2026-06-14T09:00:00.000Z'));
  const preflightReport = buildMonthlyClaimUkePreflightReport(results);
  const bundle = buildMonthlyClaimUkeBundle(results, 'MONTHLY_CLAIM_OFFICIAL_READY.uke');

  assert.strictEqual(results[0].officialReadinessReport.ok, true);
  assert.strictEqual(preflightReport.officialReadinessSummary.ok, true);
  assert.deepStrictEqual(preflightReport.officialReadinessIssues, []);
  assert.match(formatMonthlyClaimUkePreflightReport(preflightReport), /公式提出準備OK/);
  assert.strictEqual(bundle.officialReadinessSummary.readyFeeCount, 1);
  assert.strictEqual(bundle.officialReadinessSummary.readyDrugItemCount, 1);
  assert.match(bundle.officialReadinessIssueCsv, /^"受付ID","患者名","重要度","指摘コード"/);
  assert.match(preflightReport.officialReadinessReviewCsv, /"受付サマリ","visit_1","pt_1","山田 太郎","OK","1\/1","1\/1","0","","公式提出準備OK"/);
  assert.match(bundle.officialReadinessReviewCsv, /"公式提出準備OK"/);
});

test('monthly official UKE bundle builds RECEIPTY.CYO with standard records and Shift-JIS EOF', () => {
  const claims = [makeOfficialReadyCase({
    visit: {
      claimLifecycle: makeRebillingLifecycle(),
      prescriptionDate: '2026-06-14',
      dispensingDate: '2026-06-14'
    }
  })];
  const results = buildMonthlyClaimUkeResults(claims, new Date('2026-06-14T09:00:00.000Z'));
  const bundle = buildMonthlyClaimOfficialUkeBundle(claims, results);
  const decoded = encoding.codeToString(encoding.convert([...bundle.content.slice(0, -1)], {
    to: 'UNICODE',
    from: 'SJIS'
  }));

  assert.strictEqual(bundle.fileName, 'RECEIPTY.CYO');
  assert.strictEqual(bundle.totalClaims, 1);
  assert.strictEqual(bundle.totalPoints, 125);
  assert.strictEqual(bundle.officialReconciliationReport.ok, true);
  assert.strictEqual(bundle.officialReconciliationReport.goClaimCount, 1);
  assert.strictEqual(bundle.officialReconciliationReport.goTotalPoints, 125);
  assert.strictEqual(bundle.officialReconciliationReport.totalPrescriptionRecordCount, 1);
  assert.strictEqual(bundle.officialReconciliationReport.totalDispensingRecordCount, 1);
  assert.strictEqual(bundle.officialReconciliationReport.totalDrugRecordCount, 1);
  assert.strictEqual(bundle.officialReconciliationReport.totalManagementRecordCount, 1);
  assert.strictEqual(bundle.officialReconciliationReport.totalSupplementalRecordCount, 0);
  assert.strictEqual(bundle.officialReconciliationReport.totalDispensingDateRecordCount, 0);
  assert.strictEqual(bundle.officialReconciliationReport.totalCopaymentRecordCount, 0);
  assert.strictEqual(bundle.officialReconciliationReport.totalSplitRecordCount, 0);
  assert.strictEqual(bundle.officialReconciliationReport.totalCalculationItemCount, 3);
  assert.strictEqual(bundle.officialReconciliationReport.totalBodyPointTotal, 125);
  assert.match(bundle.officialReconciliationCsv, /"総括","","","","OK"/);
  assert.strictEqual(bundle.content.at(-1), 0x1a);
  assert.deepStrictEqual(bundle.records.map((record) => record.type), [
    'YK', 'RE', 'HO', 'SH', 'CZ', 'IY', 'KI', 'GO'
  ]);
  assert.deepStrictEqual(bundle.records[0].fields.slice(0, 6), [
    '1', '13', '4', '1234567', 'pharma-oss薬局', '202606'
  ]);
  assert.strictEqual(bundle.records[1].fields[1], '4112');
  assert.match(decoded, /^YK,1,13,4,1234567,pharma-oss薬局,202606/);
  assert.match(decoded, /GO,1,125,99\r\n$/);
});

test('monthly official UKE bundle builds multiple RP groups with allocated CZ and IY records', () => {
  const claim = makeOfficialReadyCase({
    visit: {
      claimLifecycle: makeRebillingLifecycle(),
      prescriptionDate: '2026-06-14',
      dispensingDate: '2026-06-14'
    }
  });
  claim.items[0] = {
    ...claim.items[0],
    amount: 3,
    days: 7,
    drugPrice: 25.1
  };
  claim.items.push({
    ...claim.items[0],
    itemId: 'visit_1_item_2',
    rpNumber: 2,
    drugId: 'drug_2',
    drugName: 'テスト軟膏',
    dispensedDrugCode: '620000002',
    amount: 1,
    days: 0,
    usage: '外用 患部に塗布',
    drugPrice: 5
  });
  claim.calculatedFees = [
    {
      code: 'base_fee',
      receiptFeeCode: '410004110',
      name: '調剤基本料1',
      points: 45,
      rationale: 'テスト'
    },
    {
      code: 'drug_preparation',
      receiptFeeCode: '420001810',
      name: '薬剤調製料',
      points: 34,
      rationale: 'テスト'
    },
    {
      code: 'drug_fee',
      name: '薬剤料',
      points: 57,
      rationale: 'テスト'
    }
  ];

  const results = buildMonthlyClaimUkeResults([claim], new Date('2026-06-14T09:00:00.000Z'));
  const report = results[0].officialReadinessReport;
  const issues = getMonthlyClaimUkeOfficialReadinessIssues(results);
  const issueCsv = buildMonthlyClaimUkeOfficialReadinessIssueCsv(issues);
  const reviewCsv = buildMonthlyClaimUkeOfficialReadinessReviewCsv(results);
  const preflightReport = buildMonthlyClaimUkePreflightReport(results);
  const prescriptionGroupPlan = buildMonthlyClaimOfficialPrescriptionGroupPlan(claim);
  const prescriptionGroupPlanCsv = buildMonthlyClaimOfficialPrescriptionGroupPlanCsv(prescriptionGroupPlan);
  const bundle = buildMonthlyClaimOfficialUkeBundle([claim], results);
  const shRecords = bundle.records.filter((record) => record.type === 'SH');
  const czRecords = bundle.records.filter((record) => record.type === 'CZ');
  const iyRecords = bundle.records.filter((record) => record.type === 'IY');
  const hoRecord = bundle.records.find((record) => record.type === 'HO');

  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.checkedDrugItemCount, 2);
  assert.strictEqual(report.readyDrugItemCount, 2);
  assert.strictEqual(prescriptionGroupPlan.groupCount, 2);
  assert.deepStrictEqual(prescriptionGroupPlan.items.map((item) => item.rpNumber), [1, 2]);
  assert.deepStrictEqual(prescriptionGroupPlan.items.map((item) => item.officialPrescriptionNumber), ['01', '02']);
  assert.deepStrictEqual(prescriptionGroupPlan.items.map((item) => item.receptionCount), [1, 2]);
  assert.deepStrictEqual(prescriptionGroupPlan.items.map((item) => item.prescriptionDate), ['2026-06-14', '2026-06-14']);
  assert.deepStrictEqual(prescriptionGroupPlan.items.map((item) => item.dispensingDate), ['2026-06-14', '2026-06-14']);
  assert.deepStrictEqual(issues.map((issue) => issue.code), [
    'official_uke_multiple_prescription_group_unconfirmed'
  ]);
  assert.strictEqual(issues[0].severity, 'warning');
  assert.strictEqual(issues[0].prescriptionGroupCount, 2);
  assert.deepStrictEqual(issues[0].rpNumbers, [1, 2]);
  assert.strictEqual(preflightReport.officialReadinessSummary.ok, true);
  assert.strictEqual(preflightReport.officialReadinessSummary.errorCount, 0);
  assert.strictEqual(preflightReport.officialReadinessSummary.warningCount, 1);
  assert.match(formatMonthlyClaimOfficialPrescriptionGroupPlan(prescriptionGroupPlan), /SH 01・02/);
  assert.match(formatMonthlyClaimOfficialPrescriptionGroupPlan(prescriptionGroupPlan), /受付回 1・2/);
  assert.match(prescriptionGroupPlanCsv, /^"受付ID","患者ID","患者名","RP番号","公式処方番号","処方箋受付回","処方箋交付年月日","調剤年月日"/);
  assert.match(prescriptionGroupPlanCsv, /"visit_1","pt_1","山田 太郎","1","01","1","20260614","20260614","1","visit_1_item_1","テスト錠10mg"/);
  assert.match(prescriptionGroupPlanCsv, /"visit_1","pt_1","山田 太郎","2","02","2","20260614","20260614","1","visit_1_item_2","テスト軟膏"/);
  assert.match(formatMonthlyClaimUkeOfficialReadinessIssues(issues), /複数処方グループ/);
  assert.match(issueCsv, /"official_uke_multiple_prescription_group_unconfirmed"/);
  assert.match(issueCsv, /"確認"/);
  assert.match(issueCsv, /公式処方番号 01・02/);
  assert.match(issueCsv, /処方箋交付 20260614/);
  assert.match(issueCsv, /"2","1・2"/);
  assert.match(reviewCsv, /"指摘","visit_1","pt_1","山田 太郎","確認","2\/2","2\/2","0","official_uke_multiple_prescription_group_unconfirmed"/);
  assert.strictEqual(bundle.totalPoints, 136);
  assert.strictEqual(bundle.officialReconciliationReport.ok, true);
  assert.strictEqual(bundle.officialReconciliationReport.goClaimCount, 1);
  assert.strictEqual(bundle.officialReconciliationReport.goTotalPoints, 136);
  assert.strictEqual(bundle.officialReconciliationReport.totalPrescriptionRecordCount, 2);
  assert.strictEqual(bundle.officialReconciliationReport.totalDispensingRecordCount, 2);
  assert.strictEqual(bundle.officialReconciliationReport.totalDrugRecordCount, 2);
  assert.strictEqual(bundle.officialReconciliationReport.totalCommentRecordCount, 0);
  assert.strictEqual(bundle.officialReconciliationReport.totalManagementRecordCount, 1);
  assert.strictEqual(bundle.officialReconciliationReport.totalSupplementalRecordCount, 0);
  assert.strictEqual(bundle.officialReconciliationReport.totalDispensingDateRecordCount, 0);
  assert.strictEqual(bundle.officialReconciliationReport.totalCopaymentRecordCount, 0);
  assert.strictEqual(bundle.officialReconciliationReport.totalSplitRecordCount, 0);
  assert.strictEqual(bundle.officialReconciliationReport.totalCalculationItemCount, 5);
  assert.strictEqual(bundle.officialReconciliationReport.totalBodyPointTotal, 136);
  assert.strictEqual(bundle.officialReconciliationReport.items[0].insurancePrescriptionCounts[0], 2);
  assert.strictEqual(bundle.officialReconciliationReport.items[0].insuranceTotalPoints[0], 136);
  assert.match(bundle.officialReconciliationCsv, /"受付","visit_1","pt_1","山田 太郎","OK","1","0","0","2","2","2","0","0","1","0","0","5","136","136","2","136"/);
  assert.deepStrictEqual(bundle.records.map((record) => record.type), [
    'YK', 'RE', 'HO', 'SH', 'CZ', 'IY', 'SH', 'CZ', 'IY', 'KI', 'GO'
  ]);
  assert.deepStrictEqual(hoRecord?.fields, ['06123456', '', '記号123', '2', '136']);
  assert.deepStrictEqual(shRecords.map((record) => record.fields[0]), ['01', '02']);
  assert.deepStrictEqual(czRecords[0].fields.slice(0, 13), [
    '', '20260614', '20260614', '1', '7', '1', '1', '01', '420001810', '24', '', '', '56'
  ]);
  assert.deepStrictEqual(czRecords[1].fields.slice(0, 13), [
    '', '20260614', '20260614', '2', '1', '1', '1', '02', '420001810', '10', '', '', '1'
  ]);
  assert.deepStrictEqual(iyRecords[0].fields.slice(0, 3), ['1', '620124201', '3']);
  assert.deepStrictEqual(iyRecords[1].fields.slice(0, 3), ['1', '620000002', '1']);
  assert.deepStrictEqual(bundle.records.at(-1), { type: 'GO', fields: ['1', '136', '99'] });
});

test('monthly official UKE bundle conditionally generates SN, JD, MF, and ST records', () => {
  const claims = [makeOfficialReadyCase({
    visit: {
      claimLifecycle: makeRebillingLifecycle(),
      prescriptionDate: '2026-06-14',
      dispensingDate: '2026-06-14',
      claimOptions: {
        officialSupplementalRecords: [{
          payerCategory: '1',
          confirmationCategory: '01',
          insurerNumber: '06123456',
          symbol: '記号',
          number: '123',
          branch: '01',
          recipientNumber: '1234567'
        }],
        officialDispensingDateRecords: [{
          payerCategory: '1',
          days: { '14': 1 }
        }],
        officialCopaymentRecords: [{
          category: '01',
          dailyAmounts: { '14': 3800 }
        }],
        officialSplitDispensingRecords: [{
          doctorNumber: '1',
          splitCount: 2,
          insuranceTargetPoints: 125,
          insuranceAfterSplitPoints: 63
        }]
      }
    },
    patient: {
      publicInsurances: [{
        provider: '51136018',
        recipient: '1234567',
        burdenRatio: 10
      }]
    }
  })];
  const results = buildMonthlyClaimUkeResults(claims, new Date('2026-06-14T09:00:00.000Z'));
  const bundle = buildMonthlyClaimOfficialUkeBundle(claims, results);
  const snRecord = bundle.records.find((record) => record.type === 'SN');
  const jdRecord = bundle.records.find((record) => record.type === 'JD');
  const mfRecord = bundle.records.find((record) => record.type === 'MF');
  const stRecord = bundle.records.find((record) => record.type === 'ST');

  assert.strictEqual(bundle.officialReconciliationReport.ok, true);
  assert.deepStrictEqual(bundle.records.map((record) => record.type), [
    'YK', 'RE', 'HO', 'KO', 'SN', 'JD', 'SH', 'CZ', 'IY', 'KI', 'MF', 'ST', 'GO'
  ]);
  assert.deepStrictEqual(snRecord?.fields, ['1', '01', '06123456', '記号', '123', '01', '1234567', '']);
  assert.strictEqual(jdRecord?.fields[0], '1');
  assert.strictEqual(jdRecord?.fields[14], '1');
  assert.strictEqual(mfRecord?.fields[0], '01');
  assert.strictEqual(mfRecord?.fields[14], '000003800');
  assert.deepStrictEqual(stRecord?.fields.slice(0, 7), ['1', '20260614', '20260614', '1', '2', '125', '63']);
  assert.strictEqual(bundle.officialReconciliationReport.totalSupplementalRecordCount, 1);
  assert.strictEqual(bundle.officialReconciliationReport.totalDispensingDateRecordCount, 1);
  assert.strictEqual(bundle.officialReconciliationReport.totalCopaymentRecordCount, 1);
  assert.strictEqual(bundle.officialReconciliationReport.totalSplitRecordCount, 1);
  assert.strictEqual(bundle.officialReconciliationReport.totalBodyPointTotal, 125);
  assert.strictEqual(bundle.officialReconciliationReport.items[0].publicPrescriptionCounts[0], 1);
  assert.strictEqual(bundle.officialReconciliationReport.items[0].publicTotalPoints[0], 125);
  assert.match(bundle.officialReconciliationCsv, /"受付","visit_1","pt_1","山田 太郎","OK","1","1","1","1","1","1","0","0","1","1","1","3","125","125","1","125","1","125"/);
});

test('monthly official UKE derives claim type codes for insured, public expense, and late-elderly cases', () => {
  const cases: Array<{
    label: string;
    patient: Partial<Patient>;
    expected: string;
  }> = [
    {
      label: 'insured person',
      patient: {
        insuranceInfo: {
          provider: '06123456',
          number: '記号123',
          burdenRatio: 30,
          relationship: '本人'
        }
      },
      expected: '4112'
    },
    {
      label: 'dependent family member',
      patient: {
        insuranceInfo: {
          provider: '06123456',
          number: '記号123',
          burdenRatio: 30,
          relationship: '家族'
        }
      },
      expected: '4116'
    },
    {
      label: 'preschool child',
      patient: {
        birthDate: '2021-01-02',
        insuranceInfo: {
          provider: '06123456',
          number: '記号123',
          burdenRatio: 20,
          relationship: '家族'
        }
      },
      expected: '4114'
    },
    {
      label: 'insurance with one public expense',
      patient: {
        publicInsurances: [{
          provider: '51136018',
          recipient: '1234567',
          burdenRatio: 10
        }]
      },
      expected: '4122'
    },
    {
      label: 'late elderly general income',
      patient: {
        birthDate: '1940-01-02',
        insuranceInfo: {
          provider: '391234',
          number: '123456',
          burdenRatio: 10,
          insuranceType: '後期高齢者'
        }
      },
      expected: '4318'
    },
    {
      label: 'late elderly 30 percent burden',
      patient: {
        birthDate: '1940-01-02',
        insuranceInfo: {
          provider: '391234',
          number: '123456',
          burdenRatio: 30,
          insuranceType: '後期高齢者'
        }
      },
      expected: '4310'
    }
  ];

  for (const entry of cases) {
    const claims = [makeOfficialReadyCase({
      visit: {
        claimLifecycle: makeRebillingLifecycle(),
        prescriptionDate: '2026-06-14',
        dispensingDate: '2026-06-14'
      },
      patient: entry.patient
    })];
    const results = buildMonthlyClaimUkeResults(claims, new Date('2026-06-14T09:00:00.000Z'));
    const bundle = buildMonthlyClaimOfficialUkeBundle(claims, results);
    const reRecord = bundle.records.find((record) => record.type === 'RE');

    assert.ok(reRecord, `${entry.label}: RE record must exist`);
    assert.strictEqual(reRecord.fields[1], entry.expected, entry.label);
  }
});

test('monthly official UKE bundle separates social and national insurance submissions', () => {
  const claims = [
    makeOfficialReadyCase({
      visit: {
        claimLifecycle: makeRebillingLifecycle(),
        prescriptionDate: '2026-06-14',
        dispensingDate: '2026-06-14'
      }
    }),
    makeOfficialReadyCase({
      visit: {
        visitId: 'visit_2',
        patientId: 'pt_2',
        claimLifecycle: makeRebillingLifecycle(),
        prescriptionDate: '2026-06-14',
        dispensingDate: '2026-06-14'
      },
      patient: {
        patientId: 'pt_2',
        name: '国保 花子',
        kana: 'コクホ ハナコ',
        insuranceInfo: {
          provider: '391234',
          number: '123456',
          burdenRatio: 30,
          insuranceType: '国保'
        }
      }
    })
  ];
  const results = buildMonthlyClaimUkeResults(claims, new Date('2026-06-14T09:00:00.000Z'));

  assert.throws(
    () => buildMonthlyClaimOfficialUkeBundle(claims, results),
    /社保系と国保系を分けて/
  );
});

test('monthly official submission trial report keeps social and national evidence patient-free', () => {
  const socialClaims = [makeOfficialReadyCase({
    visit: {
      claimLifecycle: makeRebillingLifecycle(),
      prescriptionDate: '2026-06-14',
      dispensingDate: '2026-06-14'
    }
  })];
  const nationalClaims = [makeOfficialReadyCase({
    visit: {
      visitId: 'visit_kokuho',
      patientId: 'pt_kokuho',
      claimLifecycle: makeRebillingLifecycle(),
      prescriptionDate: '2026-06-14',
      dispensingDate: '2026-06-14'
    },
    patient: {
      patientId: 'pt_kokuho',
      name: '国保 花子',
      kana: 'コクホ ハナコ',
      insuranceInfo: {
        provider: '391234',
        number: '国保456',
        burdenRatio: 30,
        insuranceType: '国保',
        relationship: '世帯主'
      }
    }
  })];
  const socialResults = buildMonthlyClaimUkeResults(socialClaims, new Date('2026-06-14T09:00:00.000Z'));
  const nationalResults = buildMonthlyClaimUkeResults(nationalClaims, new Date('2026-06-14T09:00:00.000Z'));
  const socialBundle = buildMonthlyClaimOfficialUkeBundle(socialClaims, socialResults);
  const nationalBundle = buildMonthlyClaimOfficialUkeBundle(nationalClaims, nationalResults);

  const report = buildMonthlyClaimOfficialSubmissionTrialReport([
    {
      bundle: socialBundle,
      submissionFileName: 'RECEIPTY_SOCIAL_202606.CYO',
      submittedTo: '支払基金オンライン請求確認環境',
      checkedAt: '2026-06-22',
      result: 'accepted',
      acceptanceId: 'SSK-202606-001',
      resultFileName: 'SSK_RESULT_202606.txt',
      checkedBy: '請求責任者',
      memo: 'GO件数とGO総合計点数が受付結果と一致',
      sourceArtifactSha256: 'a'.repeat(64),
      noPatientDataConfirmed: true
    },
    {
      bundle: nationalBundle,
      submissionFileName: 'RECEIPTY_KOKUHO_202606.CYO',
      submittedTo: '東京都国保連テスト受付',
      checkedAt: '2026-06-22',
      result: 'accepted_with_warnings',
      acceptanceId: 'KOKUHO-202606-001',
      resultFileName: 'KOKUHO_RESULT_202606.txt',
      checkedBy: '請求責任者',
      memo: '受付済。確認事項は次回提出前に再点検',
      sourceArtifactSha256: 'b'.repeat(64),
      noPatientDataConfirmed: true
    }
  ]);
  const csv = buildMonthlyClaimOfficialSubmissionTrialCsv(report);

  assert.strictEqual(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.strictEqual(report.evidenceIntegrityStatus, 'pass');
  assert.strictEqual(report.evidenceIntegrityIssueCount, 0);
  assert.deepStrictEqual(report.missingPayers, []);
  assert.deepStrictEqual(report.coveredPayers, ['social_insurance', 'national_insurance']);
  assert.strictEqual(report.acceptedTrialCount, 2);
  assert.strictEqual(report.rejectedTrialCount, 0);
  assert.strictEqual(report.notSubmittedTrialCount, 0);
  assert.strictEqual(report.totalClaims, 2);
  assert.strictEqual(report.totalPoints, 250);
  assert.strictEqual(report.totalGoClaimCount, 2);
  assert.strictEqual(report.totalGoPoints, 250);
  assert.deepStrictEqual(report.items.map((item) => item.payerLabel), ['社保系', '国保系']);
  assert.deepStrictEqual(report.items.map((item) => item.payerOrganizationCode), ['1', '2']);
  assert.deepStrictEqual(report.items.map((item) => item.fileName), [
    'RECEIPTY_SOCIAL_202606.CYO',
    'RECEIPTY_KOKUHO_202606.CYO'
  ]);
  assert.match(formatMonthlyClaimOfficialSubmissionTrialReport(report), /公式UKE現物提出試験: OK/);
  assert.match(csv, /^"区分","提出先区分","提出先区分コード","試験ファイル名"/);
  assert.match(csv, /"試験","社保系","1","RECEIPTY_SOCIAL_202606\.CYO","支払基金オンライン請求確認環境","2026-06-22","受付済","SSK-202606-001"/);
  assert.match(csv, /"試験","国保系","2","RECEIPTY_KOKUHO_202606\.CYO","東京都国保連テスト受付","2026-06-22","受付済（要確認あり）","KOKUHO-202606-001"/);
  assert.doesNotMatch(csv, /山田 太郎|国保 花子|pt_1|pt_kokuho|visit_1|visit_kokuho/);
});

test('monthly official submission trial report blocks missing payer and patient data in notes', () => {
  const claims = [makeOfficialReadyCase({
    visit: {
      claimLifecycle: makeRebillingLifecycle(),
      prescriptionDate: '2026-06-14',
      dispensingDate: '2026-06-14'
    }
  })];
  const results = buildMonthlyClaimUkeResults(claims, new Date('2026-06-14T09:00:00.000Z'));
  const bundle = buildMonthlyClaimOfficialUkeBundle(claims, results);

  const report = buildMonthlyClaimOfficialSubmissionTrialReport([
    {
      bundle,
      submissionFileName: 'RECEIPTY_SOCIAL_202606.CYO',
      submittedTo: '',
      checkedAt: '',
      result: 'not_submitted',
      acceptanceId: 'pt_1',
      memo: '山田 太郎の受付結果待ち'
    }
  ]);
  const csv = buildMonthlyClaimOfficialSubmissionTrialCsv(report);

  assert.strictEqual(report.ok, false);
  assert.deepStrictEqual(report.missingPayers, ['national_insurance']);
  assert.ok(report.issues.some((issue) => issue.code === 'official_submission_trial_national_missing'));
  assert.ok(report.issues.some((issue) => issue.code === 'official_submission_trial_destination_missing'));
  assert.ok(report.issues.some((issue) => issue.code === 'official_submission_trial_checked_at_missing'));
  assert.ok(report.issues.some((issue) => issue.code === 'official_submission_trial_not_submitted'));
  assert.ok(report.issues.some((issue) => issue.code === 'official_submission_trial_personal_info_detected'));
  assert.ok(report.issues.some((issue) => issue.code === 'official_submission_trial_evidence_integrity'));
  assert.match(formatMonthlyClaimOfficialSubmissionTrialReport(report), /要確認/);
  assert.match(csv, /"指摘","国保系","2"/);
  assert.match(csv, /"official_submission_trial_personal_info_detected"/);
  assert.doesNotMatch(JSON.stringify(report), /山田 太郎|pt_1/);
  assert.doesNotMatch(csv, /山田 太郎|pt_1/);
});

test('monthly official submission trial accepts patient-free bundle summaries from operations', () => {
  const report = buildMonthlyClaimOfficialSubmissionTrialReport([
    {
      payer: 'social_insurance',
      bundleSummary: {
        fileName: 'RECEIPTY_SOCIAL_202606.CYO',
        totalClaims: 120,
        totalPoints: 18000,
        goClaimCount: 120,
        goTotalPoints: 18000,
        recordCount: 2400,
        reconciliationOk: true
      },
      submittedTo: '支払基金オンライン請求確認環境',
      checkedAt: '2026-06-28',
      result: 'accepted',
      acceptanceId: 'SSK-202606-120',
      resultFileName: 'SSK_RESULT_202606.txt',
      checkedBy: '請求責任者',
      memo: '受付件数とGO集計を照合済み',
      sourceArtifactSha256: 'c'.repeat(64),
      noPatientDataConfirmed: true
    },
    {
      payer: 'national_insurance',
      bundleSummary: {
        fileName: 'RECEIPTY_KOKUHO_202606.CYO',
        totalClaims: 80,
        totalPoints: 12000,
        goClaimCount: 80,
        goTotalPoints: 12000,
        recordCount: 1600,
        reconciliationOk: true
      },
      submittedTo: '国保連合会オンライン請求確認環境',
      checkedAt: '2026-06-28',
      result: 'accepted',
      acceptanceId: 'KOKUHO-202606-080',
      resultFileName: 'KOKUHO_RESULT_202606.txt',
      checkedBy: '請求責任者',
      memo: '受付件数とGO集計を照合済み',
      sourceArtifactSha256: 'd'.repeat(64),
      noPatientDataConfirmed: true
    }
  ]);

  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.evidenceIntegrityStatus, 'pass');
  assert.strictEqual(report.totalClaims, 200);
  assert.strictEqual(report.totalGoPoints, 30000);
});

test('monthly official submission trial blocks dummy result artifacts', () => {
  const report = buildMonthlyClaimOfficialSubmissionTrialReport([{
    payer: 'social_insurance',
    bundleSummary: {
      fileName: 'RECEIPTY_SOCIAL_202606.CYO',
      totalClaims: 1,
      totalPoints: 100,
      goClaimCount: 1,
      goTotalPoints: 100,
      recordCount: 20,
      reconciliationOk: true
    },
    submittedTo: '支払基金オンライン請求確認環境',
    checkedAt: '2026-06-28',
    result: 'accepted',
    acceptanceId: 'SSK-202606-001',
    resultFileName: 'dummy-result.txt',
    checkedBy: '請求責任者',
    memo: '',
    sourceArtifactSha256: 'e'.repeat(64),
    noPatientDataConfirmed: true
  }], ['social_insurance']);

  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.evidenceIntegrityStatus, 'blocked');
  assert.ok(report.issues.some((issue) => issue.code === 'official_submission_trial_evidence_integrity'));
});

test('monthly official submission trial exposes a safe input template and CLI', () => {
  const template = buildMonthlyClaimOfficialSubmissionTrialTemplate();
  const script = readFileSync(new URL('../../scripts/runOfficialSubmissionTrialReview.ts', import.meta.url), 'utf8');

  assert.deepStrictEqual(template.trials.map((trial) => trial.payer), ['social_insurance', 'national_insurance']);
  assert.ok(template.trials.every((trial) => trial.noPatientDataConfirmed === false));
  assert.ok(template.guidance.some((item) => item.includes('UKE本文')));
  assert.strictEqual(
    packageJson.scripts['claim:official-submission-review'],
    'tsx scripts/runOfficialSubmissionTrialReview.ts'
  );
  assert.match(script, /YAKUREKI_OFFICIAL_SUBMISSION_TRIAL_JSON/);
  assert.match(script, /ok: report\.ok/);
});

test('monthly official resubmission regression report keeps return fixes and UKE diffs patient-free', () => {
  const generatedAt = new Date('2026-06-14T09:00:00.000Z');
  const acceptanceErrorOriginalClaims = [makeOfficialReadyCase({
    visit: {
      claimLifecycle: makeRebillingLifecycle(),
      prescriptionDate: '2026-06-14',
      dispensingDate: '2026-06-14'
    },
    patient: {
      insuranceInfo: {
        provider: '06123456',
        number: '記号123',
        burdenRatio: 30,
        relationship: '本人'
      }
    }
  })];
  const acceptanceErrorCorrectedClaims = [makeOfficialReadyCase({
    visit: {
      claimLifecycle: makeRebillingLifecycle(),
      prescriptionDate: '2026-06-14',
      dispensingDate: '2026-06-14'
    },
    patient: {
      insuranceInfo: {
        provider: '06123456',
        number: '記号999',
        burdenRatio: 30,
        relationship: '本人'
      }
    }
  })];
  const returnedOriginalClaims = [makeOfficialReadyCase({
    visit: {
      visitId: 'visit_return_case',
      patientId: 'pt_return_case',
      claimLifecycle: makeRebillingLifecycle(),
      prescriptionDate: '2026-06-14',
      dispensingDate: '2026-06-14'
    },
    patient: {
      patientId: 'pt_return_case',
      name: '返戻 三郎',
      kana: 'ヘンレイ サブロウ'
    }
  })];
  const returnedCorrectedClaims = [makeOfficialReadyCase({
    visit: {
      visitId: 'visit_return_case',
      patientId: 'pt_return_case',
      claimLifecycle: makeRebillingLifecycle('返戻修正後の再提出'),
      prescriptionDate: '2026-06-14',
      dispensingDate: '2026-06-14'
    },
    patient: {
      patientId: 'pt_return_case',
      name: '返戻 三郎',
      kana: 'ヘンレイ サブロウ'
    }
  })];
  returnedCorrectedClaims[0].calculatedFees = returnedCorrectedClaims[0].calculatedFees.map((fee) => (
    fee.code === 'drug_fee'
      ? { ...fee, points: 60 }
      : fee
  ));

  const acceptanceErrorOriginalBundle = buildMonthlyClaimOfficialUkeBundle(
    acceptanceErrorOriginalClaims,
    buildMonthlyClaimUkeResults(acceptanceErrorOriginalClaims, generatedAt)
  );
  const acceptanceErrorCorrectedBundle = buildMonthlyClaimOfficialUkeBundle(
    acceptanceErrorCorrectedClaims,
    buildMonthlyClaimUkeResults(acceptanceErrorCorrectedClaims, generatedAt)
  );
  const returnedOriginalBundle = buildMonthlyClaimOfficialUkeBundle(
    returnedOriginalClaims,
    buildMonthlyClaimUkeResults(returnedOriginalClaims, generatedAt)
  );
  const returnedCorrectedBundle = buildMonthlyClaimOfficialUkeBundle(
    returnedCorrectedClaims,
    buildMonthlyClaimUkeResults(returnedCorrectedClaims, generatedAt)
  );

  const report = buildMonthlyClaimOfficialResubmissionRegressionReport([
    {
      caseId: 'CASE-HO-NUMBER-001',
      trigger: 'acceptance_error',
      originalBundle: acceptanceErrorOriginalBundle,
      correctedBundle: acceptanceErrorCorrectedBundle,
      errorCode: 'SSK-HO-003',
      errorTitle: '被保険者記号番号不一致',
      errorCause: '受付結果の保険情報と出力時点の保険情報が一致しない',
      correctionCategory: 'insurance',
      correctionSummary: '保険記号番号を確認済み情報へ修正し、HOを再出力',
      resultFileName: 'SSK_REJECT_202606.txt',
      resubmissionCheckedAt: '2026-06-22',
      resubmissionResult: 'accepted',
      resubmissionAcceptanceId: 'SSK-RETRY-001',
      memo: '修正後UKEのHO差分のみ確認'
    },
    {
      caseId: 'CASE-POINT-RETURN-001',
      trigger: 'returned_claim',
      originalBundle: returnedOriginalBundle,
      correctedBundle: returnedCorrectedBundle,
      errorCode: 'KOKUHO-POINT-011',
      errorTitle: '薬剤料点数相違',
      errorCause: '返戻結果で薬剤料の点数再確認が必要',
      correctionCategory: 'points',
      correctionSummary: '薬剤料点数を再計算し、CZ/HO/GOの点数差分を固定',
      resultFileName: 'KOKUHO_RETURN_202606.txt',
      resubmissionCheckedAt: '2026-06-22',
      resubmissionResult: 'accepted_with_warnings',
      resubmissionAcceptanceId: 'KOKUHO-RETRY-001',
      memo: '再提出は受付済。次回提出前に同条件を再確認'
    }
  ]);
  const csv = buildMonthlyClaimOfficialResubmissionRegressionCsv(report);

  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.completedCaseCount, 2);
  assert.strictEqual(report.acceptanceErrorCount, 1);
  assert.strictEqual(report.returnedClaimCount, 1);
  assert.ok(report.changedRecordTypes.includes('HO'));
  assert.ok(report.changedRecordTypes.includes('GO'));
  assert.ok(report.totalChangedFieldCount >= 2);
  assert.ok(report.items[0].diffSummary.changedFieldRefs.includes('HO#1.3'));
  assert.ok(report.items[1].diffSummary.changedFieldRefs.includes('GO#1.2'));
  assert.strictEqual(report.items[1].diffSummary.goPointDifference, 4);
  assert.match(formatMonthlyClaimOfficialResubmissionRegressionReport(report), /公式UKE返戻・再提出回帰: OK/);
  assert.match(csv, /^"区分","ケースID","提出先区分","発生種別"/);
  assert.match(csv, /"回帰","CASE-HO-NUMBER-001","社保系","受付NG"/);
  assert.match(csv, /"回帰","CASE-POINT-RETURN-001","社保系","返戻"/);
  assert.match(csv, /HO#1\.3/);
  assert.match(csv, /GO#1\.2/);
  assert.doesNotMatch(csv, /山田 太郎|返戻 三郎|pt_1|pt_return_case|visit_1|visit_return_case|記号123|記号999/);
});

test('monthly official resubmission regression report blocks missing fixes, failed retry, and patient data', () => {
  const claims = [makeOfficialReadyCase({
    visit: {
      claimLifecycle: makeRebillingLifecycle(),
      prescriptionDate: '2026-06-14',
      dispensingDate: '2026-06-14'
    }
  })];
  const bundle = buildMonthlyClaimOfficialUkeBundle(
    claims,
    buildMonthlyClaimUkeResults(claims, new Date('2026-06-14T09:00:00.000Z'))
  );

  const report = buildMonthlyClaimOfficialResubmissionRegressionReport([
    {
      caseId: 'visit_1',
      trigger: 'acceptance_error',
      originalBundle: bundle,
      correctedBundle: bundle,
      errorCode: '',
      errorTitle: '受付不能',
      errorCause: '山田 太郎の保険情報を確認',
      correctionCategory: 'insurance',
      correctionSummary: '修正前後差分なし',
      resubmissionCheckedAt: '',
      resubmissionResult: 'rejected',
      memo: 'pt_1を確認'
    }
  ]);
  const csv = buildMonthlyClaimOfficialResubmissionRegressionCsv(report);

  assert.strictEqual(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === 'official_resubmission_regression_error_code_missing'));
  assert.ok(report.issues.some((issue) => issue.code === 'official_resubmission_regression_no_uke_diff'));
  assert.ok(report.issues.some((issue) => issue.code === 'official_resubmission_regression_checked_at_missing'));
  assert.ok(report.issues.some((issue) => issue.code === 'official_resubmission_regression_not_accepted'));
  assert.ok(report.issues.some((issue) => issue.code === 'official_resubmission_regression_personal_info_detected'));
  assert.match(formatMonthlyClaimOfficialResubmissionRegressionReport(report), /要確認/);
  assert.match(csv, /"official_resubmission_regression_personal_info_detected"/);
});

test('buildMonthlyClaimUkeBundle rejects claims with blocking UKE errors', () => {
  const brokenCase = makeCase({
    patient: { birthDate: '' }
  });
  const results = buildMonthlyClaimUkeResults([brokenCase]);
  const errors = getMonthlyClaimUkeIssues(results, 'error');
  assert.strictEqual(errors.length, 1);
  assert.match(formatMonthlyClaimUkeIssues(errors), /山田 太郎/);
  assert.throws(() => buildMonthlyClaimUkeBundle(results), /修正が必要/);
});

test('buildMonthlyClaimUkeSampleCoverageReport confirms social, national, public expense, returned, and rebilling samples', () => {
  const results = buildMonthlyClaimUkeResults([
    makeCase({
      patient: {
        insuranceInfo: {
          provider: '06123456',
          number: '社保123',
          burdenRatio: 30,
          insuranceType: '社保'
        }
      }
    }),
    makeCase({
      visit: { visitId: 'visit_kokuho', patientId: 'pt_kokuho' },
      patient: {
        patientId: 'pt_kokuho',
        name: '国保 花子',
        kana: 'コクホ ハナコ',
        insuranceInfo: {
          provider: '391234',
          number: '国保456',
          burdenRatio: 30,
          insuranceType: '国保'
        }
      }
    }),
    makeCase({
      visit: { visitId: 'visit_public', patientId: 'pt_public' },
      patient: {
        patientId: 'pt_public',
        name: '公費 次郎',
        kana: 'コウヒ ジロウ',
        publicInsurances: [
          {
            provider: '51136018',
            recipient: '1234567',
            burdenRatio: 10
          }
        ]
      }
    }),
    makeCase({
      visit: {
        visitId: 'visit_returned',
        patientId: 'pt_returned',
        claimLifecycle: {
          status: 'returned',
          returnReason: '保険番号相違'
        }
      },
      patient: { patientId: 'pt_returned', name: '返戻 三郎', kana: 'ヘンレイ サブロウ' }
    }),
    makeCase({
      visit: {
        visitId: 'visit_rebilling',
        patientId: 'pt_rebilling',
        claimLifecycle: {
          status: 'rebilling',
          rebillingReason: '返戻修正後の再請求'
        }
      },
      patient: { patientId: 'pt_rebilling', name: '再請求 四郎', kana: 'サイセイキュウ シロウ' }
    })
  ], new Date('2026-06-14T09:00:00.000Z'));

  assert.deepStrictEqual(getMonthlyClaimUkeIssues(results, 'error'), []);

  const report = buildMonthlyClaimUkeSampleCoverageReport(results);

  assert.deepStrictEqual(report.missingSamples, []);
  assert.deepStrictEqual(report.missingLabels, []);
  assert.deepStrictEqual(report.coveredSamples, report.requiredSamples);
});

test('buildMonthlyClaimUkeResults carries staged all-field validation reports', () => {
  const specsWithYkAllFields = DISPENSING_UKE_KNOWN_RECORD_SPEC.map((spec) => (
    spec.type === 'YK'
      ? {
        ...spec,
        allFields: [
          { index: 3, label: '薬局郵便番号', required: true, format: 'digits' as const, lengths: [7] }
        ]
      }
      : spec
  ));
  const results = buildMonthlyClaimUkeResults(
    [makeCase({
      visit: { claimLifecycle: makeRebillingLifecycle() },
      patient: { name: '=山田 太郎' }
    })],
    new Date('2026-06-14T09:00:00.000Z'),
    { recordSpecs: specsWithYkAllFields }
  );
  const result = results[0];
  const allFieldIssues = getMonthlyClaimUkeAllFieldIssues(results);
  const sourceSummary = buildMonthlyClaimUkeAllFieldSourceSummary(results);
  const issueCsv = buildMonthlyClaimUkeAllFieldIssueCsv(allFieldIssues);
  const preflightReport = buildMonthlyClaimUkePreflightReport(results);

  assert.ok(result.issues.some((issue) => issue.code === 'yk_all_field_4_digits_invalid'));
  assert.strictEqual(result.allFieldValidationReport.source.url, DISPENSING_UKE_RECORD_SPEC_SOURCE.url);
  assert.strictEqual(result.allFieldValidationReport.definedAllFieldCount, 1);
  assert.strictEqual(result.allFieldValidationReport.checkedFieldCount, 1);
  assert.strictEqual(result.allFieldValidationReport.issueFieldCount, 1);
  assert.strictEqual(result.allFieldValidationReport.formatIssueFieldCount, 1);
  assert.deepStrictEqual(result.allFieldValidationReport.recordTypesWithIssues, ['YK']);
  assert.strictEqual(sourceSummary.sourceLabel, DISPENSING_UKE_RECORD_SPEC_SOURCE.label);
  assert.strictEqual(sourceSummary.sourceUrl, DISPENSING_UKE_RECORD_SPEC_SOURCE.url);
  assert.strictEqual(sourceSummary.definedAllFieldCount, 1);
  assert.deepStrictEqual(sourceSummary.definedAllFieldRecordTypes, ['YK']);
  assert.strictEqual(sourceSummary.checkedFieldCount, 1);
  assert.strictEqual(sourceSummary.issueFieldCount, 1);
  assert.strictEqual(allFieldIssues.length, 1);
  assert.strictEqual(allFieldIssues[0].sourceLabel, DISPENSING_UKE_RECORD_SPEC_SOURCE.label);
  assert.strictEqual(allFieldIssues[0].sourceUrl, DISPENSING_UKE_RECORD_SPEC_SOURCE.url);
  assert.strictEqual(allFieldIssues[0].visitId, 'visit_1');
  assert.strictEqual(allFieldIssues[0].patientName, '=山田 太郎');
  assert.strictEqual(allFieldIssues[0].recordType, 'YK');
  assert.strictEqual(allFieldIssues[0].itemNumber, 4);
  assert.strictEqual(allFieldIssues[0].label, '薬局郵便番号');
  assert.strictEqual(allFieldIssues[0].statusLabel, '形式不備');
  assert.deepStrictEqual(allFieldIssues[0].issueCodes, ['yk_all_field_4_digits_invalid']);
  assert.match(formatMonthlyClaimUkeAllFieldIssues(allFieldIssues), /=山田 太郎: YK 4 薬局郵便番号 形式不備/);
  assert.match(issueCsv, /^"出典","出典URL","受付ID","患者ID","患者名","レコード位置"/);
  assert.match(issueCsv, new RegExp(`"${DISPENSING_UKE_RECORD_SPEC_SOURCE.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(issueCsv, /"visit_1","pt_1","'=山田 太郎","1","YK","4","薬局郵便番号"/);
  assert.match(issueCsv, /"yk_all_field_4_digits_invalid"/);
  assert.strictEqual(preflightReport.ok, false);
  assert.strictEqual(preflightReport.allFieldSourceSummary.sourceUrl, DISPENSING_UKE_RECORD_SPEC_SOURCE.url);
  assert.strictEqual(preflightReport.allFieldSourceSummary.definedAllFieldCount, 1);
  assert.strictEqual(preflightReport.errorResults.length, 1);
  assert.strictEqual(preflightReport.allFieldIssues.length, 1);
  assert.match(preflightReport.allFieldIssueCsv, /"yk_all_field_4_digits_invalid"/);
  assert.match(formatMonthlyClaimUkePreflightReport(preflightReport), /一括UKE事前チェック: 要修正/);
  assert.match(formatMonthlyClaimUkePreflightReport(preflightReport), /allFields指摘 1/);
  assert.match(formatMonthlyClaimUkePreflightReport(preflightReport), /allFields根拠 1項目/);
  assert.match(formatMonthlyClaimUkePreflightReport(preflightReport), /公式サンプルだけで見る種別 5種別確認/);
});

test('monthly claim UKE preflight keeps official-sample-only record types out of normal claims', () => {
  const results = buildMonthlyClaimUkeResults([
    makeCase({
      visit: { claimLifecycle: makeRebillingLifecycle() }
    })
  ]);
  const cleanReport = buildMonthlyClaimUkeOfficialSampleScopeReport(results);

  assert.strictEqual(cleanReport.ok, true);
  assert.deepStrictEqual(cleanReport.generatedValidationOnlyRecordTypes, []);
  assert.ok(cleanReport.validationOnlyRecordTypes.includes('MN'));
  assert.ok(!cleanReport.validationOnlyRecordTypes.includes('SN'));
  assert.match(formatMonthlyClaimUkeOfficialSampleScopeReport(cleanReport), /通常請求UKE外 5種別/);

  results[0].records.push({ type: 'MN', fields: ['940000030', '', '13450607940000030', '', '', ''] });
  const mixedReport = buildMonthlyClaimUkeOfficialSampleScopeReport(results);
  const preflightReport = buildMonthlyClaimUkePreflightReport(results);
  const errors = getMonthlyClaimUkeBatchIssues(preflightReport.batchIssues, 'error');

  assert.strictEqual(mixedReport.ok, false);
  assert.deepStrictEqual(mixedReport.generatedValidationOnlyRecordTypes, ['MN']);
  assert.ok(errors.some((issue) => issue.code === 'monthly_uke_official_sample_only_record_generated'));
  assert.match(formatMonthlyClaimUkePreflightReport(preflightReport), /公式サンプルだけで見る種別混入 1/);
  assert.throws(() => buildMonthlyClaimUkeBundle(results), /オンライン請求受付前チェック/);
});

test('validateMonthlyClaimUkeBatch rejects duplicated visits before bundle creation', () => {
  const results = buildMonthlyClaimUkeResults([
    makeCase({
      visit: { claimLifecycle: makeRebillingLifecycle() }
    }),
    makeCase({
      visit: { claimLifecycle: makeRebillingLifecycle() },
      patient: { patientId: 'pt_2', name: '佐藤 花子', kana: 'サトウ ハナコ' }
    })
  ]);
  const batchIssues = validateMonthlyClaimUkeBatch(results);
  const errors = getMonthlyClaimUkeBatchIssues(batchIssues, 'error');
  assert.ok(errors.some((issue) => issue.code === 'monthly_uke_duplicate_visit'));
  assert.match(formatMonthlyClaimUkeBatchIssues(errors), /同じ受付/);
  assert.throws(() => buildMonthlyClaimUkeBundle(results), /オンライン請求受付前チェック/);
});

test('validateMonthlyClaimUkeBatch rejects draft claims before monthly UKE creation', () => {
  const results = buildMonthlyClaimUkeResults([makeCase()]);

  const errors = getMonthlyClaimUkeBatchIssues(validateMonthlyClaimUkeBatch(results), 'error');

  assert.ok(errors.some((issue) => issue.code === 'monthly_uke_unprepared_claim_mixed'));
  assert.match(formatMonthlyClaimUkeBatchIssues(errors), /再請求準備前/);
  assert.throws(() => buildMonthlyClaimUkeBundle(results), /オンライン請求受付前チェック/);
});

test('validateMonthlyClaimUkeBatch rejects returned claims before rebilling preparation', () => {
  const results = buildMonthlyClaimUkeResults([
    makeCase({
      visit: {
        claimLifecycle: {
          status: 'returned',
          returnReason: '保険番号相違'
        }
      }
    })
  ]);

  const errors = getMonthlyClaimUkeBatchIssues(validateMonthlyClaimUkeBatch(results), 'error');

  assert.ok(errors.some((issue) => issue.code === 'monthly_uke_returned_claim_mixed'));
  assert.match(formatMonthlyClaimUkeBatchIssues(errors), /返戻対応/);
  assert.throws(() => buildMonthlyClaimUkeBundle(results), /オンライン請求受付前チェック/);
});

test('validateMonthlyClaimUkeBatch warns when rebilling reason is missing', () => {
  const results = buildMonthlyClaimUkeResults([
    makeCase({
      visit: {
        claimLifecycle: {
          status: 'rebilling'
        }
      }
    })
  ]);

  const warnings = getMonthlyClaimUkeBatchIssues(validateMonthlyClaimUkeBatch(results), 'warning');

  assert.ok(warnings.some((issue) => issue.code === 'monthly_uke_rebilling_reason_missing'));
  assert.match(formatMonthlyClaimUkeBatchIssues(warnings), /再請求理由/);

  const bundle = buildMonthlyClaimUkeBundle(results, 'MONTHLY_CLAIM_REBILLING_REASON_WARNING.uke');
  assert.strictEqual(bundle.batchIssues.length, 1);
});

test('validateMonthlyClaimUkeBatch rejects locked claims mixed into a batch', () => {
  for (const status of ['exported', 'accepted', 'closed'] as const) {
    const results = buildMonthlyClaimUkeResults([
      makeCase({
        visit: {
          claimLifecycle: {
            status,
            exportedFileName: 'RECEIPT_202606.uke',
            totalPoints: 45
          }
        }
      })
    ]);

    const errors = getMonthlyClaimUkeBatchIssues(validateMonthlyClaimUkeBatch(results), 'error');

    assert.ok(errors.some((issue) => issue.code === 'monthly_uke_locked_claim_mixed'));
    assert.match(formatMonthlyClaimUkeBatchIssues(errors), /再出力できない請求状態/);
    assert.throws(() => buildMonthlyClaimUkeBundle(results), /オンライン請求受付前チェック/);
  }
});

test('validateMonthlyClaimUkeBatch accepts claims prepared for rebilling', () => {
  const results = buildMonthlyClaimUkeResults([
    makeCase({
      visit: {
        claimLifecycle: {
          status: 'rebilling',
          rebillingReason: '返戻修正後の月遅れ請求'
        }
      }
    })
  ]);

  const errors = getMonthlyClaimUkeBatchIssues(validateMonthlyClaimUkeBatch(results), 'error');

  assert.deepStrictEqual(errors, []);
});

test('validateMonthlyClaimUkeBatch warns when claim months are mixed', () => {
  const results = buildMonthlyClaimUkeResults([
    makeCase({
      visit: { claimLifecycle: makeRebillingLifecycle() }
    }),
    makeCase({
      visit: {
        visitId: 'visit_2',
        patientId: 'pt_2',
        issueDate: '2026-05-14T09:00:00.000Z',
        claimLifecycle: makeRebillingLifecycle()
      },
      patient: { patientId: 'pt_2', name: '佐藤 花子', kana: 'サトウ ハナコ' }
    })
  ]);
  const warnings = getMonthlyClaimUkeBatchIssues(validateMonthlyClaimUkeBatch(results), 'warning');
  assert.ok(warnings.some((issue) => issue.code === 'monthly_uke_mixed_claim_month'));

  const bundle = buildMonthlyClaimUkeBundle(results, 'MONTHLY_CLAIM_MIXED.uke');
  assert.strictEqual(bundle.batchIssues.length, 1);
});
