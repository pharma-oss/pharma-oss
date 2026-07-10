import { test } from 'node:test';
import assert from 'node:assert';
import type { CalculationResultItem } from '../calculator.ts';
import type { FacilitySettings, Patient, Visit } from '../../db/types.ts';
import type { UkeRecord } from './uke_generator.ts';
import {
  validateDispensingUkeRecords
} from './dispensing_uke_validation.ts';
import {
  buildDispensingUkeOfficialSampleConditionalRecordAlignmentReview,
  buildDispensingUkeOfficialSampleConditionalRecordAlignmentReviewCsv,
  buildDispensingUkeRecordProfileGapChecklist,
  buildDispensingUkeRecordProfileGapChecklistCsv,
  buildDispensingUkeRecordProfileGapImplementationPlan,
  buildDispensingUkeRecordProfileGapImplementationPlanCsv,
  buildDispensingUkeRecordProfileGapProgressCsv,
  buildDispensingUkeRecordProfileGapProgressReview,
  buildDispensingUkeGeneratedRecordProfileReport,
  buildDispensingUkeOfficialSampleRecordProfileReport,
  buildDispensingUkeRecordProfileGapReview,
  compareDispensingUkeRecordProfiles,
  formatDispensingUkeOfficialSampleConditionalRecordAlignmentReview,
  formatDispensingUkeRecordProfileGapChecklist,
  formatDispensingUkeRecordProfileGapImplementationPlan,
  formatDispensingUkeRecordProfileGapProgressReview,
  formatDispensingUkeRecordProfileGapReview,
  formatDispensingUkeRecordProfileComparisonReport,
  parseDispensingUkeOfficialSampleRecodeInfoCsv
} from './dispensing_uke_official_sample.ts';

async function loadBuilder() {
  const importedModule = await (import('./dispensing_uke' + '.ts') as Promise<typeof import('./dispensing_uke.ts')>);
  return importedModule.buildDispensingUkeRecords;
}

const settings: FacilitySettings = {
  id: 'default',
  pharmacyName: '青空薬局',
  pharmacyKana: 'アオゾラヤッキョク',
  pharmacyCode: '1234567',
  pharmacyPostalCode: '100-0001',
  pharmacyAddress: '東京都千代田区1-1-1',
  pharmacyPhone: '03-1111-2222',
  registrationNumber: 'T1234567890123',
  baseFeeCategory: '1',
  regionalSupportAddition: 'none',
  medicalDxAddition: false,
  postGenericAddition: 'none',
  genericDispensingReduction: false
};

const visit: Visit = {
  visitId: 'v_001',
  patientId: 'p_001',
  institutionId: 'clinic_001',
  doctorId: 'doctor_001',
  issueDate: '2026-06-02T09:30:00.000Z',
  status: 'processing'
};

const patient: Patient = {
  patientId: 'p_001',
  name: '山田 太郎',
  kana: 'ヤマダ タロウ',
  birthDate: '1980-04-05',
  gender: 'male',
  insuranceInfo: {
    provider: '06139999',
    number: '12345678',
    burdenRatio: 30
  }
};

function padFields(fields: string[], size: number): string[] {
  return [...fields, ...Array(Math.max(0, size - fields.length)).fill('')];
}

function rec(type: string, fields: string[], claimSerial = '1', rowSerial = '1', status = '0'): string {
  return [claimSerial, rowSerial, status, type, ...fields].join(',');
}

const officialShapeRecodeInfo = [
  rec('YK', padFields(['1', '13', '4', '9999946', 'サンプル調剤薬局', '202407', '00', '03-9999-9999'], 8), '1', '1'),
  rec('RE', padFields(['7', '4118', '202406', 'サンプル　二', '1', '19491010', '', '29', '13', '1'], 41), '1', '2'),
  rec('HO', padFields(['06132013', '１１１', '１１３４５６', '1', '528'], 13), '1', '3'),
  rec('SN', padFields(['1', '01', '', '', '', '46', '', ''], 8), '1', '4'),
  rec('JD', padFields(['1'], 32), '1', '5'),
  rec('SH', padFields(['01', '1', '001', '', '3'], 9), '1', '6'),
  rec('CZ', padFields(['1', '20240616', '20240616', '1', '60', '1', '1', '01', '420001810', '24'], 70), '1', '7'),
  rec('IY', padFields(['1', '620124201', '4'], 9), '1', '8'),
  rec('CO', ['810000001', '"薬品番号,引用あり"'], '1', '9'),
  rec('TK', ['810000001', '特例による２か月処方'], '1', '10')
].join('\n');

test('buildDispensingUkeRecords includes pharmacy, patient, fee, drug, and total records', async () => {
  const buildDispensingUkeRecords = await loadBuilder();
  const fees: CalculationResultItem[] = [
    { code: 'base_fee', name: '調剤基本料1', points: 47, rationale: '施設基準' },
    { code: 'drug_preparation', name: '薬剤調製料', points: 24, rationale: '内服1剤' },
    { code: 'drug_fee', name: '薬剤料', points: 56, rationale: '薬価計算' }
  ];

  const patientWithPublic: Patient = {
    ...patient,
    publicInsurances: [
      {
        provider: '51136018',
        recipient: '1234567',
        burdenRatio: 10
      }
    ]
  };

  const records: UkeRecord[] = buildDispensingUkeRecords({
    visit,
    patient: patientWithPublic,
    settings,
    calculatedFees: fees,
    generatedAt: new Date('2026-06-02T10:11:12'),
    items: [
      {
        itemId: 'item_001',
        visitId: 'v_001',
        rpNumber: 1,
        drugId: 'drug_001',
        yjCode: '1234567F1020',
        drugName: 'テスト錠10mg',
        amount: 3,
        usage: '1日3回毎食後',
        days: 7,
        drugPrice: 25.1,
        receiptRemark: '820100001 テスト摘要'
      }
    ]
  });

  assert.strictEqual(records[0].type, 'YK');
  assert.deepStrictEqual(records[0].fields.slice(0, 7), ['1234567', '青空薬局', 'アオゾラヤッキョク', '100-0001', '東京都千代田区1-1-1', '03-1111-2222', 'T1234567890123']);
  assert.strictEqual(records[0].fields.length, 8);
  assert.strictEqual(records.find(record => record.type === 'RE')?.fields.length, 41);
  assert.strictEqual(records.find(record => record.type === 'HO')?.fields.length, 13);
  assert.strictEqual(records.find(record => record.type === 'KO')?.fields.length, 9);
  assert.strictEqual(records.find(record => record.type === 'JD')?.fields.length, 32);
  assert.strictEqual(records.find(record => record.type === 'SH')?.fields.length, 9);
  assert.strictEqual(records.find(record => record.type === 'CZ')?.fields.length, 70);
  assert.strictEqual(records.find(record => record.type === 'KI')?.fields.length, 113);
  assert.ok(records.some(record => record.type === 'RE' && record.fields[1] === '202606' && record.fields[4] === '山田 太郎'));
  assert.ok(records.some(record => record.type === 'KO' && record.fields[0] === '51136018' && record.fields[1] === '1234567' && record.fields[2] === '10'));
  assert.ok(records.some(record => record.type === 'KI' && record.fields[1] === 'BASE' && record.fields[3] === '47'));
  assert.ok(records.some(record => record.type === 'CZ' && record.fields[1] === 'PREP' && record.fields[3] === '24'));
  assert.ok(records.some(record => record.type === 'TO' && record.fields[1] === 'DRUG_FEE' && record.fields[3] === '56'));
  assert.ok(records.some(record => record.type === 'IY' && record.fields[2] === '1234567F1020' && record.fields[5] === '3'));
  assert.ok(records.some(record => record.type === 'CO' && record.fields[0] === '820100001' && record.fields[2] === 'テスト摘要'));
  assert.ok(records.some(record => record.type === 'TK' && record.fields[0] === '127' && record.fields[1] === '3' && record.fields[2] === '1'));
  assert.ok(records.some(record => record.type === 'ST' && record.fields[0] === '20260602101112'));
});

test('buildDispensingUkeRecords generates SN only when special public expense option is confirmed', async () => {
  const buildDispensingUkeRecords = await loadBuilder();
  const records: UkeRecord[] = buildDispensingUkeRecords({
    visit: {
      ...visit,
      claimOptions: {
        specialPublicExpenseRecord: {
          category: '1',
          branch: '01',
          supplementalCode: '46'
        }
      }
    },
    patient,
    settings,
    calculatedFees: [
      { code: 'base_fee', name: '調剤基本料1', points: 47, rationale: '施設基準' }
    ],
    generatedAt: new Date('2026-06-02T10:11:12'),
    items: [
      {
        itemId: 'item_001',
        visitId: 'v_001',
        rpNumber: 1,
        drugId: 'drug_001',
        yjCode: '1234567F1020',
        drugName: 'テスト錠10mg',
        amount: 3,
        usage: '1日3回毎食後',
        days: 7,
        drugPrice: 25.1
      }
    ]
  });

  const snRecord = records.find(record => record.type === 'SN');
  const officialParsed = parseDispensingUkeOfficialSampleRecodeInfoCsv(officialShapeRecodeInfo);
  const officialProfileReport = buildDispensingUkeOfficialSampleRecordProfileReport(officialParsed.records);
  const generatedProfileReport = buildDispensingUkeGeneratedRecordProfileReport(records, 'SN条件付き生成UKE');
  const comparison = compareDispensingUkeRecordProfiles(officialProfileReport, generatedProfileReport);
  const snAlignment = buildDispensingUkeOfficialSampleConditionalRecordAlignmentReview(comparison, 'SN');
  const snAlignmentCsv = buildDispensingUkeOfficialSampleConditionalRecordAlignmentReviewCsv(snAlignment);

  assert.ok(snRecord);
  assert.deepStrictEqual(snRecord.fields, ['1', '01', '', '', '', '46', '', '']);
  assert.ok(records.findIndex(record => record.type === 'SN') > records.findIndex(record => record.type === 'HO'));
  assert.ok(records.findIndex(record => record.type === 'SN') < records.findIndex(record => record.type === 'JD'));
  assert.deepStrictEqual(validateDispensingUkeRecords(records).filter(issue => issue.recordType === 'SN'), []);
  assert.strictEqual(snAlignment.ok, true);
  assert.strictEqual(snAlignment.statusLabel, '形状一致');
  assert.strictEqual(snAlignment.officialRecordCount, 1);
  assert.strictEqual(snAlignment.generatedRecordCount, 1);
  assert.deepStrictEqual(snAlignment.officialNonBlankFieldNumbers, [1, 2, 6]);
  assert.deepStrictEqual(snAlignment.generatedNonBlankFieldNumbers, [1, 2, 6]);
  assert.match(formatDispensingUkeOfficialSampleConditionalRecordAlignmentReview(snAlignment), /SN公式サンプル現物形状突合: 形状一致/);
  assert.match(snAlignmentCsv, /^"公式出典","生成元","レコード種別","レコード名","判定","公式件数","生成件数"/);
  assert.match(snAlignmentCsv, /"SN","公式サンプルSN情報","形状一致","1","1","8-8","8-8","1・2・6","1・2・6"/);
  assert.doesNotMatch(JSON.stringify(snAlignment), /山田 太郎|p_001|12345678/);
});

test('buildDispensingUkeRecords exposes value-free shape gaps against official-style sample records', async () => {
  const buildDispensingUkeRecords = await loadBuilder();
  const officialParsed = parseDispensingUkeOfficialSampleRecodeInfoCsv(officialShapeRecodeInfo);
  const officialProfileReport = buildDispensingUkeOfficialSampleRecordProfileReport(officialParsed.records);
  const patientWithPublic: Patient = {
    ...patient,
    publicInsurances: [
      {
        provider: '51136018',
        recipient: '1234567',
        burdenRatio: 10
      }
    ]
  };
  const generatedRecords: UkeRecord[] = buildDispensingUkeRecords({
    visit,
    patient: patientWithPublic,
    settings,
    calculatedFees: [
      { code: 'base_fee', name: '調剤基本料1', points: 47, rationale: '施設基準' },
      { code: 'drug_preparation', name: '薬剤調製料', points: 24, rationale: '内服1剤' },
      { code: 'drug_fee', name: '薬剤料', points: 56, rationale: '薬価計算' }
    ],
    generatedAt: new Date('2026-06-02T10:11:12'),
    items: [
      {
        itemId: 'item_001',
        visitId: 'v_001',
        rpNumber: 1,
        drugId: 'drug_001',
        yjCode: '1234567F1020',
        drugName: 'テスト錠10mg',
        amount: 3,
        usage: '1日3回毎食後',
        days: 7,
        drugPrice: 25.1,
        receiptRemark: '820100001 テスト摘要'
      }
    ]
  });
  const generatedProfileReport = buildDispensingUkeGeneratedRecordProfileReport(generatedRecords);
  const comparison = compareDispensingUkeRecordProfiles(officialProfileReport, generatedProfileReport);
  const missingSnAlignment = buildDispensingUkeOfficialSampleConditionalRecordAlignmentReview(comparison, 'SN');
  const gapReview = buildDispensingUkeRecordProfileGapReview(comparison);
  const checklist = buildDispensingUkeRecordProfileGapChecklist(gapReview);
  const progressWithoutConfirmations = buildDispensingUkeRecordProfileGapProgressReview(checklist);

  assert.deepStrictEqual(officialParsed.issues, []);
  assert.strictEqual(comparison.ok, false);
  assert.deepStrictEqual(comparison.officialOnlyRecordTypes, ['SN']);
  assert.strictEqual(missingSnAlignment.ok, false);
  assert.ok(missingSnAlignment.issues.some((issue) => issue.includes('条件付き生成UKEにありません')));
  assert.deepStrictEqual(comparison.generatedOnlyRecordTypes, ['KI', 'KO', 'ST', 'TO']);
  assert.ok(!comparison.fieldCountMismatchRecordTypes.includes('YK'));
  assert.ok(!comparison.fieldCountMismatchRecordTypes.includes('RE'));
  assert.ok(!comparison.fieldCountMismatchRecordTypes.includes('CZ'));
  assert.ok(comparison.fieldCountMismatchRecordTypes.includes('CO'));
  assert.ok(comparison.fieldCountMismatchRecordTypes.includes('IY'));
  assert.ok(comparison.fieldCountMismatchRecordTypes.includes('TK'));
  assert.ok(comparison.nonBlankMismatchRecordTypes.includes('YK'));
  assert.match(formatDispensingUkeRecordProfileComparisonReport(comparison), /公式だけ SN/);
  assert.match(formatDispensingUkeRecordProfileComparisonReport(comparison), /生成だけ KI・KO・ST・TO/);
  assert.strictEqual(gapReview.ok, false);
  assert.deepStrictEqual(gapReview.officialOnlyRecordTypes, ['SN']);
  assert.deepStrictEqual(gapReview.generatedOnlyRecordTypes, ['KI', 'KO', 'ST', 'TO']);
  assert.deepStrictEqual(gapReview.generatedShorterRecordTypes, []);
  assert.deepStrictEqual(gapReview.generatedExtraNeedsSpecReviewRecordTypes, ['CO', 'IY', 'TK']);
  assert.deepStrictEqual(gapReview.nonBlankMismatchRecordTypes, ['CO', 'CZ', 'HO', 'IY', 'RE', 'SH', 'TK', 'YK']);
  assert.deepStrictEqual(gapReview.criticalRecordTypes, ['SN']);
  assert.deepStrictEqual(gapReview.highRecordTypes, ['CO', 'IY', 'TK']);
  assert.ok(gapReview.items.some((item) => item.recordType === 'SN' && item.nextAction.includes('生成ルール')));
  assert.ok(gapReview.items.some((item) => item.recordType === 'IY' && item.nextAction.includes('仕様本文')));
  assert.strictEqual(checklist.ok, false);
  assert.deepStrictEqual(checklist.recordTypesByHighestPriority.critical, ['SN']);
  assert.deepStrictEqual(checklist.recordTypesByHighestPriority.high, ['CO', 'IY', 'TK']);
  assert.ok(!checklist.recordTypesByHighestPriority.medium.includes('CO'));
  assert.strictEqual(checklist.items[0].recordType, 'SN');
  assert.strictEqual(checklist.items[0].fieldLabel, 'レコード全体');
  assert.strictEqual(checklist.items[0].checkTarget, '生成ルール追加');
  assert.ok(checklist.items[0].doneCriteria.some((criterion) => criterion.includes('未生成が差分レビューから消えた')));
  assert.ok(checklist.items.some((item) => item.recordType === 'CO' && item.fieldLabel === '第3項目'));
  assert.strictEqual(progressWithoutConfirmations.ok, false);
  assert.strictEqual(progressWithoutConfirmations.blockedCriticalPathCount, 4);
  assert.deepStrictEqual(progressWithoutConfirmations.blockedCriticalPathRecordTypes, ['CO', 'IY', 'SN', 'TK']);
  assert.strictEqual(progressWithoutConfirmations.readyForImplementationCount, 0);
  assert.match(formatDispensingUkeRecordProfileGapReview(gapReview), /追加項目要突合 CO・IY・TK/);
  assert.match(formatDispensingUkeRecordProfileGapReview(gapReview), /優先 最優先 SN \/ 高 CO・IY・TK/);
  assert.match(formatDispensingUkeRecordProfileGapChecklist(checklist), /確認リスト: 要確認/);
  assert.match(formatDispensingUkeRecordProfileGapChecklist(checklist), /優先 最優先 SN \/ 高 CO・IY・TK/);
  assert.match(formatDispensingUkeRecordProfileGapChecklist(checklist), /先頭 SN: レコード全体 生成ルール追加/);
  assert.match(formatDispensingUkeRecordProfileGapProgressReview(progressWithoutConfirmations), /未確認の優先項目 CO・IY・SN・TK/);
  const checklistCsv = buildDispensingUkeRecordProfileGapChecklistCsv(checklist);
  assert.match(checklistCsv, /^"ID","優先度","レコード種別","分類","確認対象","項目","理由","次の対応","完了条件"/);
  assert.match(checklistCsv, /"SN-official_only-record","最優先","SN","未生成","生成ルール追加","レコード全体"/);
  assert.match(checklistCsv, /"CO-generated_extra_fields_need_spec_review-3","高","CO","追加項目要突合","追加項目確認","第3項目"/);
  const formulaSafeCsv = buildDispensingUkeRecordProfileGapChecklistCsv({
    ...checklist,
    items: [{
      ...checklist.items[0],
      reason: '@要注意',
      action: '=仕様確認'
    }]
  });
  assert.match(formulaSafeCsv, /"'@要注意","'=仕様確認"/);
  const progressWithConfirmations = buildDispensingUkeRecordProfileGapProgressReview(checklist, [
    {
      checklistItemId: 'SN-official_only-record',
      status: 'generation_rule_needed',
      evidenceLabel: '仕様PDF SNレコード欄',
      reviewer: '請求担当',
      reviewedAt: '2026-06-19',
      note: 'SNの生成条件を実装対象にする'
    },
    {
      checklistItemId: 'CO-generated_extra_fields_need_spec_review-3',
      status: 'sample_variation',
      evidenceLabel: '仕様PDF COレコード欄'
    },
    {
      checklistItemId: 'IY-generated_extra_fields_need_spec_review-10_11',
      status: 'no_change_needed',
      evidenceLabel: '仕様PDF IYレコード欄'
    },
    {
      checklistItemId: 'TK-generated_extra_fields_need_spec_review-3',
      status: 'no_change_needed',
      evidenceLabel: '仕様PDF TKレコード欄'
    }
  ]);
  assert.strictEqual(progressWithConfirmations.ok, true);
  assert.strictEqual(progressWithConfirmations.blockedCriticalPathCount, 0);
  assert.deepStrictEqual(progressWithConfirmations.readyForImplementationRecordTypes, ['SN']);
  assert.match(formatDispensingUkeRecordProfileGapProgressReview(progressWithConfirmations), /生成修正 SN/);
  const progressCsv = buildDispensingUkeRecordProfileGapProgressCsv(progressWithConfirmations);
  assert.match(progressCsv, /^"ID","優先度","レコード種別","分類","項目","確認状態","根拠","担当","確認日時","次の対応","メモ"/);
  assert.match(progressCsv, /"SN-official_only-record","最優先","SN","未生成","レコード全体","生成修正","仕様PDF SNレコード欄","請求担当","2026-06-19"/);
  const progressWithInputIssues = buildDispensingUkeRecordProfileGapProgressReview(checklist, [
    {
      checklistItemId: 'SN-official_only-record',
      status: 'generation_rule_needed',
      evidenceLabel: ''
    },
    {
      checklistItemId: 'old-gap-id',
      status: 'no_change_needed',
      evidenceLabel: '古いCSV'
    }
  ]);
  assert.strictEqual(progressWithInputIssues.ok, false);
  assert.ok(progressWithInputIssues.confirmationIssues.some((issue) => issue.includes('根拠が未入力')));
  assert.ok(progressWithInputIssues.confirmationIssues.some((issue) => issue.includes('現在の確認リストにありません')));
  const blockedImplementationPlan = buildDispensingUkeRecordProfileGapImplementationPlan(progressWithoutConfirmations);
  assert.strictEqual(blockedImplementationPlan.readyForImplementation, false);
  assert.strictEqual(blockedImplementationPlan.taskCount, 0);
  assert.deepStrictEqual(blockedImplementationPlan.blockedCriticalPathRecordTypes, ['CO', 'IY', 'SN', 'TK']);
  assert.match(buildDispensingUkeRecordProfileGapImplementationPlanCsv(blockedImplementationPlan), /"未確認のため保留"/);
  const implementationPlan = buildDispensingUkeRecordProfileGapImplementationPlan(progressWithConfirmations);
  assert.strictEqual(implementationPlan.readyForImplementation, true);
  assert.strictEqual(implementationPlan.taskCount, 1);
  assert.deepStrictEqual(implementationPlan.taskRecordTypes, ['SN']);
  assert.strictEqual(implementationPlan.tasks[0].id, 'SN-generation-implementation');
  assert.deepStrictEqual(implementationPlan.tasks[0].evidenceLabels, ['仕様PDF SNレコード欄']);
  assert.ok(implementationPlan.tasks[0].acceptanceCriteria.some((criterion) => criterion.includes('差分レビューから消える')));
  assert.ok(implementationPlan.tasks[0].testFocus.some((focus) => focus.includes('SN-official_only-record')));
  assert.match(formatDispensingUkeRecordProfileGapImplementationPlan(implementationPlan), /実装候補 SN/);
  const implementationCsv = buildDispensingUkeRecordProfileGapImplementationPlanCsv(implementationPlan);
  assert.match(implementationCsv, /^"ID","優先度","レコード種別","実装項目","根拠","対象項目","実装範囲","完了条件","テスト観点"/);
  assert.match(implementationCsv, /"SN-generation-implementation","最優先","SN","SN生成ルール追加","仕様PDF SNレコード欄","レコード全体"/);
  const serializedComparison = JSON.stringify(comparison);
  assert.doesNotMatch(serializedComparison, /山田/);
  assert.doesNotMatch(serializedComparison, /青空薬局/);
  assert.doesNotMatch(serializedComparison, /テスト錠/);
  assert.doesNotMatch(serializedComparison, /サンプル調剤薬局/);
  const serializedGapReview = JSON.stringify(gapReview);
  assert.doesNotMatch(serializedGapReview, /山田/);
  assert.doesNotMatch(serializedGapReview, /青空薬局/);
  assert.doesNotMatch(serializedGapReview, /テスト錠/);
  assert.doesNotMatch(serializedGapReview, /サンプル調剤薬局/);
  const serializedChecklist = JSON.stringify(checklist);
  assert.doesNotMatch(serializedChecklist, /山田/);
  assert.doesNotMatch(serializedChecklist, /青空薬局/);
  assert.doesNotMatch(serializedChecklist, /テスト錠/);
  assert.doesNotMatch(serializedChecklist, /サンプル調剤薬局/);
  assert.doesNotMatch(checklistCsv, /山田/);
  assert.doesNotMatch(checklistCsv, /青空薬局/);
  assert.doesNotMatch(checklistCsv, /テスト錠/);
  assert.doesNotMatch(checklistCsv, /サンプル調剤薬局/);
  assert.doesNotMatch(progressCsv, /山田/);
  assert.doesNotMatch(progressCsv, /青空薬局/);
  assert.doesNotMatch(progressCsv, /テスト錠/);
  assert.doesNotMatch(progressCsv, /サンプル調剤薬局/);
  assert.doesNotMatch(implementationCsv, /山田/);
  assert.doesNotMatch(implementationCsv, /青空薬局/);
  assert.doesNotMatch(implementationCsv, /テスト錠/);
  assert.doesNotMatch(implementationCsv, /サンプル調剤薬局/);
});

test('buildDispensingUkeRecords marks diagnostic test drugs and deduplicates comments', async () => {
  const buildDispensingUkeRecords = await loadBuilder();
  const records: UkeRecord[] = buildDispensingUkeRecords({
    visit,
    patient,
    settings,
    generatedAt: new Date('2026-06-02T10:11:12'),
    calculatedFees: [
      {
        code: 'dispensing_management',
        name: '調剤管理料',
        points: 10,
        rationale: '管理料',
        receiptRemarks: [{ code: '820100001', text: 'テスト摘要' }]
      }
    ],
    items: [
      {
        itemId: 'item_002',
        visitId: 'v_001',
        drugId: 'test_kit',
        drugName: '検査薬A',
        amount: 1,
        usage: '検査用',
        days: 1,
        claimDrugFee: false,
        isDiagnosticTest: true,
        receiptRemark: '820100001 テスト摘要'
      }
    ]
  });

  const itemRecord = records.find(record => record.type === 'IY');
  assert.ok(itemRecord);
  assert.strictEqual(itemRecord.fields[9], '0');
  assert.strictEqual(itemRecord.fields[10], '1');
  assert.strictEqual(records.filter(record => record.type === 'CO' && record.fields[0] === '820100001').length, 1);
});

test('buildDispensingUkeRecords supports disabledFeeRationales and interventions with TO records', async () => {
  const buildDispensingUkeRecords = await loadBuilder();
  const visitWithRationales: Visit = {
    ...visit,
    claimOptions: {
      disabledFeeCodes: ['base_fee'],
      disabledFeeRationales: {
        base_fee: '同一敷地内薬局のため'
      }
    }
  };

  const interventions = [
    {
      interventionId: 'int_001',
      visitId: 'v_001',
      reason: '医師指示により一般名に変更',
      beforeSnapshot: 'drug_001',
      afterSnapshot: 'drug_001_gen',
      inquiryDoctor: '山田',
      inquiryResult: '了承',
      patientConsented: true,
      createdAt: '2026-06-02T10:00:00.000Z'
    }
  ];

  const records: UkeRecord[] = buildDispensingUkeRecords({
    visit: visitWithRationales,
    patient,
    settings,
    calculatedFees: [
      { code: 'drug_fee', name: '薬剤料', points: 56, rationale: '薬価計算' }
    ],
    interventions,
    generatedAt: new Date('2026-06-02T10:11:12'),
    items: [
      {
        itemId: 'item_001',
        visitId: 'v_001',
        rpNumber: 1,
        drugId: 'drug_001',
        yjCode: '1234567F1020',
        drugName: 'テスト錠10mg',
        amount: 3,
        usage: '1日3回毎食後',
        days: 7,
        drugPrice: 25.1
      }
    ]
  });

  // TOレコードの存在を確認
  const toRecords = records.filter(record => record.type === 'TO');
  assert.strictEqual(toRecords.length, 3);

  // 1つは算定除外理由のTOレコード
  const excludeTo = toRecords.find(r => r.fields[1] === 'EXCLUDE_BASE_FEE');
  assert.ok(excludeTo);
  assert.strictEqual(excludeTo.fields[2], '【算定除外】base_fee: 同一敷地内薬局のため');

  // もう1つはInterventionのTOレコード
  const interventTo = toRecords.find(r => r.fields[1].startsWith('INTERVENT_'));
  assert.ok(interventTo);
  assert.ok(interventTo.fields[2].includes('理由: 医師指示により一般名に変更'));
  assert.ok(interventTo.fields[2].includes('照会先: 山田医師'));
  assert.ok(interventTo.fields[2].includes('結果: 了承'));
  assert.ok(interventTo.fields[2].includes('(患者同意済)'));
});
