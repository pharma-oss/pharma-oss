import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildOnlineEligibilityResponseDiffCsv,
  buildOnlineEligibilityResponseDiffReport,
  buildOnlineEligibilitySamplePrivacyIssues,
  buildOnlineEligibilitySampleRegistryReport,
  buildOnlineEligibilitySampleDiff,
  formatOnlineEligibilityResponseDiffSummary,
  type OnlineEligibilityOfficialSample
} from './online_eligibility_response_diff.ts';

const officialStyleSample: OnlineEligibilityOfficialSample = {
  sampleId: 'official_style_valid_public_expense',
  sourceLabel: '個人情報を除いた資格確認実レスポンス形式サンプル',
  capturedAt: '2026-06-18T09:00:00.000Z',
  containsPersonalData: false,
  response: {
    資格情報: {
      資格確認結果: '資格有効',
      照会日時: '2026-06-18T09:00:00.000Z',
      保険情報: {
        保険者番号: '０６１２３４５６',
        被保険者証記号: '記号１２３',
        被保険者証番号: '番号４５６',
        一部負担金割合: '３割',
        資格取得年月日: '令和8年4月1日',
        有効期限: '20261231'
      },
      公費情報一覧: [
        {
          負担者番号: '５１１３６０１８',
          受給者番号: '１２３４５６７',
          有効開始年月日: '令和8年4月1日',
          有効終了年月日: '2026/12/31'
        }
      ]
    }
  },
  expected: {
    patientStatus: 'valid',
    insurerNumber: '06123456',
    insuredNumber: '記号123 番号456',
    burdenRatio: 30,
    validFrom: '2026-04-01',
    validTo: '2026-12-31',
    publicInsuranceCount: 1
  }
};

test('buildOnlineEligibilitySampleDiff passes when normalized fields match expected values', () => {
  const result = buildOnlineEligibilitySampleDiff(officialStyleSample);

  assert.strictEqual(result.status, 'pass');
  assert.strictEqual(result.issueCount, 0);
  assert.ok(result.recognizedFieldCount >= 6);
});

test('buildOnlineEligibilitySampleDiff lists field-level mismatches', () => {
  const result = buildOnlineEligibilitySampleDiff({
    ...officialStyleSample,
    sampleId: 'official_style_mismatch',
    expected: {
      ...officialStyleSample.expected,
      burdenRatio: 20,
      validTo: '2027-12-31'
    }
  });

  assert.strictEqual(result.status, 'fail');
  assert.deepStrictEqual(result.issues.map((issue) => issue.field), ['burdenRatio', 'validTo']);
  assert.ok(result.issues.some((issue) => issue.expected === '20' && issue.actual === '30'));
});

test('buildOnlineEligibilityResponseDiffReport summarizes sample mismatches', () => {
  const report = buildOnlineEligibilityResponseDiffReport([
    officialStyleSample,
    {
      ...officialStyleSample,
      sampleId: 'official_style_invalid_status',
      expected: {
        ...officialStyleSample.expected,
        patientStatus: 'invalid'
      }
    }
  ]);

  assert.strictEqual(report.status, 'fail');
  assert.strictEqual(report.sampleCount, 2);
  assert.strictEqual(report.failedSampleCount, 1);
  assert.strictEqual(report.issueCount, 1);
  assert.strictEqual(report.privacyIssueCount, 0);
  assert.match(formatOnlineEligibilityResponseDiffSummary(report), /2件中1件不一致/);
});

test('buildOnlineEligibilityResponseDiffReport handles empty sample sets explicitly', () => {
  const report = buildOnlineEligibilityResponseDiffReport([]);

  assert.strictEqual(report.status, 'empty');
  assert.strictEqual(report.sampleCount, 0);
  assert.strictEqual(report.privacyIssueCount, 0);
  assert.match(formatOnlineEligibilityResponseDiffSummary(report), /実レスポンスサンプル未登録/);
});

test('buildOnlineEligibilityResponseDiffCsv exports pass and mismatch rows', () => {
  const report = buildOnlineEligibilityResponseDiffReport([
    officialStyleSample,
    {
      ...officialStyleSample,
      sampleId: 'official_style_mismatch',
      expected: {
        ...officialStyleSample.expected,
        burdenRatio: 20
      }
    }
  ]);
  const csv = buildOnlineEligibilityResponseDiffCsv(report);

  assert.match(csv, /^sampleId,sourceLabel,status,issueCount,field,expected,actual,recognizedFieldCount,missingFieldCount/);
  assert.match(csv, /official_style_valid_public_expense/);
  assert.match(csv, /official_style_mismatch/);
  assert.match(csv, /burdenRatio,20,30/);
});

test('buildOnlineEligibilitySamplePrivacyIssues blocks samples marked as containing personal data', () => {
  const issues = buildOnlineEligibilitySamplePrivacyIssues({
    ...officialStyleSample,
    containsPersonalData: true
  } as unknown as OnlineEligibilityOfficialSample);

  assert.ok(issues.some((issue) => issue.code === 'contains_personal_data_flag'));
});

test('buildOnlineEligibilitySamplePrivacyIssues flags overly specific labels and long numbers', () => {
  const issues = buildOnlineEligibilitySamplePrivacyIssues({
    ...officialStyleSample,
    sampleId: '患者名_1234567890',
    sourceLabel: '氏名入りレスポンス'
  });

  assert.ok(issues.some((issue) => issue.code === 'sample_id_too_specific'));
  assert.ok(issues.some((issue) => issue.code === 'source_label_too_specific'));
});

test('buildOnlineEligibilitySampleRegistryReport summarizes sample readiness', () => {
  const emptyReport = buildOnlineEligibilitySampleRegistryReport([]);
  const readyReport = buildOnlineEligibilitySampleRegistryReport([officialStyleSample]);

  assert.strictEqual(emptyReport.status, 'attention');
  assert.strictEqual(readyReport.status, 'ready');
  assert.strictEqual(readyReport.sampleCount, 1);
  assert.match(readyReport.summary, /1件/);
});
