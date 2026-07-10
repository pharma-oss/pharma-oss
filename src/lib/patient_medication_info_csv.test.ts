import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PatientMedicationInfoTemplate } from '../db/types.ts';
import {
  buildPatientMedicationInfoTemplateCsv,
  makePatientMedicationInfoCsvFileName,
  parsePatientMedicationInfoTemplateCsv
} from './patient_medication_info_csv.ts';

const completeTemplate: PatientMedicationInfoTemplate = {
  templateId: 'pmit_1',
  drugCode: '2325003F4031',
  drugName: 'ガスターD錠20mg',
  genericName: 'ファモチジン',
  status: 'approved',
  counselingText: '指示された飲み方を守ってください。',
  sideEffectText: '発疹などがあれば相談してください。',
  sourceType: 'pmda_insert',
  sourceUrl: 'https://www.pmda.go.jp/example',
  sourceRevisionDate: '2026-05-01',
  sourceHash: 'insert-2026-05',
  reviewerId: 'pharmacist_1',
  approvedAt: '2026-06-25T10:00:00Z'
};

test('medication info CSV round-trips multiline and quoted patient text without approval metadata', () => {
  const csv = buildPatientMedicationInfoTemplateCsv([{
    ...completeTemplate,
    counselingText: '1行目\n「2行目, "確認"」'
  }]);
  assert.doesNotMatch(csv, /reviewerId|approvedAt|承認済み/);
  assert.match(csv, /副作用・相談目安/);
  assert.match(csv, /使用上の注意/);
  assert.match(csv, /PMDA 添付文書/);
  assert.doesNotMatch(csv, /効能効果|飲み合わせ|保管/);

  const parsed = parsePatientMedicationInfoTemplateCsv(csv);
  assert.deepStrictEqual(parsed.issues, []);
  assert.strictEqual(parsed.drafts.length, 1);
  assert.strictEqual(parsed.drafts[0].counselingText, '1行目\n「2行目, "確認"」');
  assert.strictEqual(parsed.drafts[0].sourceType, 'pmda_insert');
  assert.strictEqual(parsed.drafts[0].readyForApproval, true);
  assert.strictEqual(parsed.readyForApprovalCount, 1);
});

test('medication info CSV rejects duplicate drug codes and invalid source types', () => {
  const csv = buildPatientMedicationInfoTemplateCsv([
    completeTemplate,
    { ...completeTemplate, templateId: 'pmit_2', sourceType: 'other' }
  ]).replace(',"その他",', ',"untrusted_scrape",');
  const parsed = parsePatientMedicationInfoTemplateCsv(csv);
  assert.ok(parsed.issues.some((issue) => issue.code === 'duplicate_drug_code' && issue.severity === 'error'));
  assert.ok(parsed.issues.some((issue) => issue.code === 'invalid_source_type' && issue.severity === 'error'));
});

test('medication info CSV accepts Japanese source type labels', () => {
  const csv = buildPatientMedicationInfoTemplateCsv([completeTemplate])
    .replace(',"PMDA 添付文書",', ',"添付文書",');
  const parsed = parsePatientMedicationInfoTemplateCsv(csv);
  assert.deepStrictEqual(parsed.issues, []);
  assert.strictEqual(parsed.drafts[0].sourceType, 'pmda_insert');

  const pharmacyCsv = buildPatientMedicationInfoTemplateCsv([{
    ...completeTemplate,
    sourceType: 'pharmacy_authored',
    sourceUrl: undefined,
    sourceHash: 'STORE-REVIEW-001'
  }]).replace(',"薬局作成",', ',"自店作成",');
  const pharmacyParsed = parsePatientMedicationInfoTemplateCsv(pharmacyCsv);
  assert.deepStrictEqual(pharmacyParsed.issues, []);
  assert.strictEqual(pharmacyParsed.drafts[0].sourceType, 'pharmacy_authored');
});

test('medication info CSV keeps incomplete content as an explicitly unready draft', () => {
  const csv = buildPatientMedicationInfoTemplateCsv([{ ...completeTemplate, sideEffectText: undefined }]);
  const parsed = parsePatientMedicationInfoTemplateCsv(csv);
  assert.strictEqual(parsed.drafts[0].readyForApproval, false);
  assert.ok(parsed.issues.some((issue) => issue.code === 'approval_requirements_incomplete' && issue.severity === 'warning'));
  assert.ok(parsed.issues.some((issue) => /副作用・相談目安/.test(issue.message)));
  assert.ok(!parsed.issues.some((issue) => issue.severity === 'error'));
});

test('medication info CSV does not mark unsupported scraped sources as ready for approval', () => {
  const csv = buildPatientMedicationInfoTemplateCsv([{
    ...completeTemplate,
    sourceUrl: 'https://www.kusuri-no-shiori.com/detail/example'
  }]);
  const parsed = parsePatientMedicationInfoTemplateCsv(csv);
  assert.strictEqual(parsed.drafts[0].readyForApproval, false);
  assert.ok(parsed.issues.some((issue) => issue.code === 'approval_requirements_incomplete' && issue.severity === 'warning'));
});

test('medication info CSV explains pmda source url domain mismatches', () => {
  const csv = buildPatientMedicationInfoTemplateCsv([{
    ...completeTemplate,
    sourceType: 'pmda_insert',
    sourceUrl: 'https://licensed.example.test/source/1'
  }]);
  const parsed = parsePatientMedicationInfoTemplateCsv(csv);
  assert.strictEqual(parsed.drafts[0].readyForApproval, false);
  assert.ok(parsed.issues.some((issue) => /pmda\.go\.jp/.test(issue.message)));
});

test('medication info CSV does not mark future source revision dates as ready', () => {
  const csv = buildPatientMedicationInfoTemplateCsv([{
    ...completeTemplate,
    sourceRevisionDate: '2999-01-01'
  }]);
  const parsed = parsePatientMedicationInfoTemplateCsv(csv);
  assert.strictEqual(parsed.drafts[0].readyForApproval, false);
  assert.ok(parsed.issues.some((issue) => /参照元版日/.test(issue.message)));
});

test('medication info CSV reports malformed headers and unterminated quotes', () => {
  const missingHeader = parsePatientMedicationInfoTemplateCsv('薬品コード,薬品名\n1,薬A');
  assert.ok(missingHeader.issues.some((issue) => issue.code === 'missing_column'));

  const unterminated = parsePatientMedicationInfoTemplateCsv('"薬品コード","薬品名\n1,薬A');
  assert.deepStrictEqual(unterminated.issues.map((issue) => issue.code), ['unterminated_quote']);
});

test('medication info CSV filename is stable and sortable', () => {
  assert.strictEqual(
    makePatientMedicationInfoCsvFileName(new Date(2026, 5, 28, 9, 8, 7)),
    'yakureki_medication_info_drafts_20260628_090807.csv'
  );
});
