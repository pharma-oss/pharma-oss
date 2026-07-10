import { test } from 'node:test';
import assert from 'node:assert';
import type { UkeRecord } from './uke_generator.ts';
import {
  DISPENSING_UKE_IMPLEMENTED_RECORD_SPEC,
  DISPENSING_UKE_KNOWN_RECORD_SPEC,
  DISPENSING_UKE_OFFICIAL_RECORD_SPEC,
  DISPENSING_UKE_OFFICIAL_SUBMISSION_RECORD_TYPES,
  DISPENSING_UKE_OFFICIAL_SAMPLE_RECORD_SPEC,
  DISPENSING_UKE_RECORD_SPEC_SOURCE,
  buildDispensingUkeAllFieldValidationReport,
  buildDispensingUkeAllFieldValidationReportCsv,
  buildDispensingUkeOfficialAllFieldDefinitionGate,
  buildDispensingUkeOfficialAllFieldDefinitionGateCsv,
  buildDispensingUkeOfficialSubmissionGate,
  buildDispensingUkeRecordSpecReview,
  buildDispensingUkeSpecCoverageReport,
  formatDispensingUkeAllFieldValidationReport,
  formatDispensingUkeOfficialAllFieldDefinitionGate,
  formatDispensingUkeOfficialSubmissionGate,
  formatDispensingUkeRecordSpecReview,
  getDispensingUkeRecordDefinedFields,
  validateDispensingUkeRecords
} from './dispensing_uke_validation.ts';

const validRecords: UkeRecord[] = [
  {
    type: 'YK',
    fields: ['1312345', 'テスト薬局', '', '1000001', '東京都千代田区1-1', '0312345678', 'T1234567890123']
  },
  {
    type: 'RE',
    fields: ['1', '202606', 'v_1', 'pt_1', '山田太郎', 'ヤマダタロウ', '1', '19800101', '123']
  },
  {
    type: 'HO',
    fields: ['06139999', '記号123番号456', '30']
  },
  {
    type: 'JD',
    fields: ['20260604']
  },
  {
    type: 'SH',
    fields: ['20260604', 'inst_1', 'dr_1']
  },
  {
    type: 'KI',
    fields: ['1', 'BASE', '調剤基本料1', '47', '施設基準']
  },
  {
    type: 'IY',
    fields: ['1', '1', '1234567F1020', '620000001', 'テスト錠', '1', '7', '1日1回', '10', '1', '0']
  },
  {
    type: 'TK',
    fields: ['123', '1', '1']
  },
  {
    type: 'ST',
    fields: ['20260604120000', 'yakureki']
  }
];

const allKnownRecordTypes: UkeRecord[] = [
  validRecords[0],
  validRecords[1],
  validRecords[2],
  {
    type: 'KO',
    fields: ['51136018', '1234567', '10']
  },
  validRecords[3],
  validRecords[4],
  {
    type: 'CZ',
    fields: ['1', 'PREP', '薬剤調製料', '24', '内服']
  },
  validRecords[5],
  {
    type: 'TO',
    fields: ['1', 'DRUG_FEE', '薬剤料', '56', '薬価']
  },
  validRecords[6],
  {
    type: 'CO',
    fields: ['820100001', '1', 'テスト摘要']
  },
  {
    type: 'MN',
    fields: ['940000030', '東京都港区新橋', '13450607940000030', '', '', '']
  },
  {
    type: 'SN',
    fields: ['1', '01', '', '', '', '46', '', '']
  },
  {
    type: 'JY',
    fields: ['2', '5', '0', '', '', '15', '0', '']
  },
  {
    type: 'ON',
    fields: ['1', '', '', '202801310100', '', '1', '', '', '', '', '', '', '', 'Y0000040011349999946000000000000Z00007146XX1134561']
  },
  {
    type: 'EX',
    fields: ['', '', '', '', '', '', '', '', '', '', '', '1:202407:']
  },
  {
    type: 'RC',
    fields: ['Ver00001db528af87bae99b304282f514dc2f5a3']
  },
  {
    type: 'MF',
    fields: ['1', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
  },
  validRecords[7],
  validRecords[8]
];

test('validateDispensingUkeRecords accepts a structurally complete record set', () => {
  const issues = validateDispensingUkeRecords(validRecords);
  assert.deepStrictEqual(issues, []);
});

test('buildDispensingUkeSpecCoverageReport reports known, missing, and unknown record types', () => {
  const completeReport = buildDispensingUkeSpecCoverageReport(allKnownRecordTypes);
  assert.deepStrictEqual(completeReport.missingKnownRecordTypes, []);
  assert.deepStrictEqual(completeReport.missingRequiredRecordTypes, []);
  assert.deepStrictEqual(completeReport.unknownRecordTypes, []);
  assert.ok(completeReport.knownRecordTypes.includes('IY'));
  assert.ok(completeReport.knownRecordTypes.includes('KO'));

  const partialReport = buildDispensingUkeSpecCoverageReport([
    ...validRecords,
    { type: 'ZZ', fields: ['unmapped'] }
  ]);
  assert.ok(partialReport.missingKnownRecordTypes.includes('KO'));
  assert.ok(partialReport.unknownRecordTypes.includes('ZZ'));
});

test('buildDispensingUkeRecordSpecReview confirms implemented record spec coverage', () => {
  const review = buildDispensingUkeRecordSpecReview(allKnownRecordTypes);

  assert.strictEqual(review.ok, true);
  assert.strictEqual(review.source, DISPENSING_UKE_RECORD_SPEC_SOURCE);
  assert.ok(review.source.url.endsWith('/iryokikan_in_07.pdf'));
  assert.strictEqual(review.source.revision, '2026-05-25');
  assert.strictEqual(review.source.fileName, 'iryokikan_in_07.pdf');
  assert.ok(review.source.sampleDataUrl.endsWith('/phasample.zip'));
  assert.ok(review.source.codeInfoSpecUrl?.endsWith('/rezept12.pdf'));
  assert.deepStrictEqual(review.expectedRecordTypes, DISPENSING_UKE_KNOWN_RECORD_SPEC.map((spec) => spec.type));
  assert.strictEqual(DISPENSING_UKE_IMPLEMENTED_RECORD_SPEC.length, 15);
  assert.strictEqual(DISPENSING_UKE_OFFICIAL_SAMPLE_RECORD_SPEC.length, 5);
  assert.strictEqual(review.expectedRecordTypes.length, 20);
  assert.deepStrictEqual(review.missingRuleRecordTypes, []);
  assert.deepStrictEqual(review.extraRuleRecordTypes, []);
  assert.deepStrictEqual(review.missingRequiredRecordTypes, []);
  assert.deepStrictEqual(review.extraRequiredRecordTypes, []);
  assert.deepStrictEqual(review.missingSingletonRecordTypes, []);
  assert.deepStrictEqual(review.extraSingletonRecordTypes, []);
  assert.deepStrictEqual(review.missingOrderRecordTypes, []);
  assert.deepStrictEqual(review.mismatchedOrderRecordTypes, []);
  assert.deepStrictEqual(review.mismatchedMinFieldRecordTypes, []);
  assert.deepStrictEqual(review.keyFieldIssues, []);
  assert.deepStrictEqual(review.missingGeneratedRecordTypes, []);
  assert.deepStrictEqual(review.unknownGeneratedRecordTypes, []);
  assert.ok(formatDispensingUkeRecordSpecReview(review).includes('検証対象 20/20'));
});

test('official submission gate rejects missing GO and a non-GO final record', () => {
  const gate = buildDispensingUkeOfficialSubmissionGate(validRecords);

  assert.strictEqual(gate.ok, false);
  assert.deepStrictEqual(gate.missingRequiredRecordTypes, ['GO']);
  assert.deepStrictEqual(gate.nonStandardRecordTypes, []);
  assert.strictEqual(gate.firstRecordType, 'YK');
  assert.strictEqual(gate.lastRecordType, 'ST');
  assert.ok(gate.issues.some((issue) => issue.code === 'official_submission_required_record_missing'));
  assert.ok(gate.issues.some((issue) => issue.code === 'official_submission_last_record_not_go'));
  assert.match(formatDispensingUkeOfficialSubmissionGate(gate), /必須不足 GO/);
  assert.doesNotMatch(formatDispensingUkeOfficialSubmissionGate(gate), /非標準/);
});

test('official submission gate rejects records outside the Reiwa 8 standard list', () => {
  const gate = buildDispensingUkeOfficialSubmissionGate([
    { type: 'YK', fields: [] },
    { type: 'RE', fields: [] },
    { type: 'KH', fields: [] },
    { type: 'KI', fields: ['1'] },
    { type: 'GO', fields: ['1', '0', '99'] }
  ]);

  assert.strictEqual(gate.ok, false);
  assert.deepStrictEqual(gate.nonStandardRecordTypes, ['KH']);
  assert.ok(gate.issues.some((issue) => issue.code === 'official_submission_nonstandard_record_present'));
});

test('official submission gate accepts the current Reiwa 8 SSK file skeleton', () => {
  const records: UkeRecord[] = [
    { type: 'YK', fields: ['1', '13', '4', '9999999', 'テスト薬局', '80606', '00', '03-0000-0000'] },
    { type: 'RE', fields: ['1', '1111', '80606', '患者名', '1', '4550101'] },
    { type: 'HO', fields: ['06139999'] },
    { type: 'SH', fields: ['01', '1', '', '', '123'] },
    { type: 'CZ', fields: ['1'] },
    { type: 'IY', fields: ['1', '620000001'] },
    { type: 'TK', fields: ['810000001', '摘要'] },
    { type: 'KI', fields: ['1'] },
    { type: 'GO', fields: ['1', '123', '99'] }
  ];
  const gate = buildDispensingUkeOfficialSubmissionGate(records);

  assert.strictEqual(gate.ok, true);
  assert.deepStrictEqual(gate.missingRequiredRecordTypes, []);
  assert.deepStrictEqual(gate.nonStandardRecordTypes, []);
  assert.deepStrictEqual(gate.standardRecordTypes, [...DISPENSING_UKE_OFFICIAL_SUBMISSION_RECORD_TYPES]);
  assert.strictEqual(gate.statusLabel, '公式提出形式の骨格確認OK');
});

test('strict official submission validation turns gate findings into blocking errors', () => {
  const issues = validateDispensingUkeRecords(validRecords, { officialSubmission: true });

  assert.ok(issues.some((issue) => issue.severity === 'error' && issue.code === 'official_submission_required_record_missing'));
  assert.ok(issues.some((issue) => issue.severity === 'error' && issue.code === 'official_submission_last_record_not_go'));
});

test('official submission validation applies Reiwa 8 YK/RE/HO/KO all-field definitions without legacy field layout', () => {
  const officialRecords: UkeRecord[] = [
    { type: 'YK', fields: ['1', '13', '4', '9999999', 'テスト薬局', '202606', '00', '03-0000-0000'] },
    { type: 'RE', fields: ['1', '4118', '202606', '患者名', '1', '19800101'] },
    { type: 'HO', fields: ['06139999', '記号', '123456', '1', '123'] },
    { type: 'KO', fields: ['51136018', '1234567', '', '1', '123'] },
    { type: 'SH', fields: ['01', '1', '', '', '123'] },
    { type: 'GO', fields: ['1', '123', '99'] }
  ];
  const ykSpec = DISPENSING_UKE_OFFICIAL_RECORD_SPEC.find((spec) => spec.type === 'YK');
  const reSpec = DISPENSING_UKE_OFFICIAL_RECORD_SPEC.find((spec) => spec.type === 'RE');
  const hoSpec = DISPENSING_UKE_OFFICIAL_RECORD_SPEC.find((spec) => spec.type === 'HO');
  const koSpec = DISPENSING_UKE_OFFICIAL_RECORD_SPEC.find((spec) => spec.type === 'KO');

  assert.ok(ykSpec);
  assert.ok(reSpec);
  assert.ok(hoSpec);
  assert.ok(koSpec);
  assert.strictEqual(ykSpec.minFields, 8);
  assert.strictEqual(reSpec.minFields, 41);
  assert.strictEqual(hoSpec.minFields, 13);
  assert.strictEqual(koSpec.minFields, 9);
  assert.deepStrictEqual(ykSpec.allFields?.map((field) => field.label), [
    '審査支払機関',
    '都道府県',
    '点数表',
    '薬局コード',
    '薬局連絡先名称',
    '請求年月',
    'マルチボリューム識別情報',
    '電話番号'
  ]);
  assert.deepStrictEqual(reSpec.allFields?.slice(0, 6).map((field) => field.label), [
    'レセプト番号',
    'レセプト種別',
    '調剤年月',
    '氏名',
    '男女区分',
    '生年月日'
  ]);
  assert.deepStrictEqual(hoSpec.allFields?.slice(0, 5).map((field) => field.label), [
    '保険者番号',
    '被保険者記号',
    '被保険者番号',
    '処方箋受付回数',
    '合計点数'
  ]);
  assert.deepStrictEqual(koSpec.allFields?.slice(0, 5).map((field) => field.label), [
    '負担者番号',
    '受給者番号',
    '任意給付区分',
    '処方箋受付回数',
    '合計点数'
  ]);

  const okIssues = validateDispensingUkeRecords(officialRecords, {
    context: 'official_submission',
    officialSubmission: true,
    recordSpecs: DISPENSING_UKE_OFFICIAL_RECORD_SPEC
  });
  assert.deepStrictEqual(okIssues.filter((issue) => issue.severity === 'error'), []);

  const missingPhoneRecords = officialRecords.map((record) => (
    record.type === 'YK' ? { ...record, fields: record.fields.slice(0, 7) } : record
  ));
  const missingPhoneIssues = validateDispensingUkeRecords(missingPhoneRecords, {
    context: 'official_submission',
    officialSubmission: true,
    recordSpecs: DISPENSING_UKE_OFFICIAL_RECORD_SPEC
  });
  assert.ok(missingPhoneIssues.some((issue) => issue.code === 'yk_all_field_8_missing'));

  const brokenCommonRecords = officialRecords.map((record) => {
    if (record.type === 'RE') return { ...record, fields: record.fields.slice(0, 5) };
    if (record.type === 'HO') return { ...record, fields: ['06139999', '記号', '123456', '1', ''] };
    if (record.type === 'KO') return { ...record, fields: ['51136018', '12345', '', '1', '123'] };
    return record;
  });
  const brokenCommonIssues = validateDispensingUkeRecords(brokenCommonRecords, {
    context: 'official_submission',
    officialSubmission: true,
    recordSpecs: DISPENSING_UKE_OFFICIAL_RECORD_SPEC
  });
  assert.ok(brokenCommonIssues.some((issue) => issue.code === 're_all_field_6_missing'));
  assert.ok(brokenCommonIssues.some((issue) => issue.code === 'ho_all_field_5_missing'));
  assert.ok(brokenCommonIssues.some((issue) => issue.code === 'ko_all_field_2_digits_invalid'));
});

test('official submission validation applies Reiwa 8 SH/CZ/IY/TO/CO/TK/KI all-field definitions', () => {
  const officialRecords: UkeRecord[] = [
    { type: 'YK', fields: ['1', '13', '4', '9999999', 'テスト薬局', '202606', '00', '03-0000-0000'] },
    { type: 'RE', fields: ['1', '4118', '202606', '患者名', '1', '19800101'] },
    { type: 'SH', fields: ['01', '1', '001', '', '24'] },
    { type: 'CZ', fields: ['1', '20260602', '20260602', '1', '7', '1', '1', '01', '420001810', '24', '', '', '56'] },
    { type: 'IY', fields: ['1', '620124201', '3'] },
    { type: 'TO', fields: ['1', '700000001', '1', '001'] },
    { type: 'CO', fields: ['810000001', '朝食後に服用'] },
    { type: 'TK', fields: ['810000002', '摘要情報'] },
    { type: 'KI', fields: ['20260602', '1', '1', '410004110', '45'] },
    { type: 'GO', fields: ['1', '123', '99'] }
  ];
  const specs = new Map(DISPENSING_UKE_OFFICIAL_RECORD_SPEC.map((spec) => [spec.type, spec]));

  assert.strictEqual(specs.get('SH')?.minFields, 9);
  assert.strictEqual(specs.get('CZ')?.minFields, 70);
  assert.strictEqual(specs.get('IY')?.minFields, 9);
  assert.strictEqual(specs.get('TO')?.minFields, 6);
  assert.strictEqual(specs.get('CO')?.minFields, 2);
  assert.strictEqual(specs.get('TK')?.minFields, 2);
  assert.strictEqual(specs.get('KI')?.minFields, 113);
  assert.deepStrictEqual(specs.get('CZ')?.allFields?.slice(1, 10).map((field) => field.label), [
    '処方箋交付年月日',
    '調剤年月日',
    '処方箋受付回',
    '調剤数量',
    '薬剤調製料負担区分',
    '薬剤調製料算定区分',
    '薬剤調製料算定先No',
    '薬剤調製料コード',
    '薬剤調製料点数'
  ]);
  assert.deepStrictEqual(specs.get('KI')?.allFields?.slice(0, 5).map((field) => field.label), [
    '算定日',
    '処方箋受付回',
    '調剤基本料負担区分',
    '調剤基本料コード',
    '調剤基本料点数'
  ]);

  const okIssues = validateDispensingUkeRecords(officialRecords, {
    context: 'official_submission',
    officialSubmission: true,
    recordSpecs: DISPENSING_UKE_OFFICIAL_RECORD_SPEC
  });
  assert.deepStrictEqual(okIssues.filter((issue) => issue.severity === 'error'), []);

  const brokenBodyRecords = officialRecords.map((record) => {
    if (record.type === 'SH') return { ...record, fields: ['01', '1', '001'] };
    if (record.type === 'CZ') return { ...record, fields: ['1', '2026-06-02', '20260602', '1', '7', '1', '1', '01', '420001810', '24', '', '', '56'] };
    if (record.type === 'IY') return { ...record, fields: ['1', '62012420'] };
    if (record.type === 'TO') return { ...record, fields: ['1', '', '1'] };
    if (record.type === 'CO') return { ...record, fields: ['81000001', '朝食後に服用'] };
    if (record.type === 'TK') return { ...record, fields: ['', '摘要情報'] };
    if (record.type === 'KI') return { ...record, fields: ['2026-06-02', '1'] };
    return record;
  });
  const brokenBodyIssues = validateDispensingUkeRecords(brokenBodyRecords, {
    context: 'official_submission',
    officialSubmission: true,
    recordSpecs: DISPENSING_UKE_OFFICIAL_RECORD_SPEC
  });
  assert.ok(brokenBodyIssues.some((issue) => issue.code === 'sh_all_field_5_missing'));
  assert.ok(brokenBodyIssues.some((issue) => issue.code === 'cz_all_field_2_date_invalid'));
  assert.ok(brokenBodyIssues.some((issue) => issue.code === 'iy_all_field_2_digits_invalid'));
  assert.ok(brokenBodyIssues.some((issue) => issue.code === 'to_all_field_2_missing'));
  assert.ok(brokenBodyIssues.some((issue) => issue.code === 'co_all_field_1_digits_invalid'));
  assert.ok(brokenBodyIssues.some((issue) => issue.code === 'tk_all_field_1_missing'));
  assert.ok(brokenBodyIssues.some((issue) => issue.code === 'ki_all_field_1_date_invalid'));
});

test('official submission validation applies Reiwa 8 SN/JD/MF/ST all-field definitions and payer conditions', () => {
  const officialRecords: UkeRecord[] = [
    { type: 'YK', fields: ['1', '13', '4', '9999999', 'テスト薬局', '202606', '00', '03-0000-0000'] },
    { type: 'RE', fields: ['1', '4118', '202606', '患者名', '1', '19800101'] },
    { type: 'HO', fields: ['06139999', '記号', '123456', '1', '123'] },
    { type: 'SN', fields: ['1', '01', '06139999', '記号', '123456', '01', '', ''] },
    { type: 'JD', fields: ['1', '1'] },
    { type: 'MF', fields: ['01'] },
    { type: 'SH', fields: ['01', '1', '', '', '123'] },
    { type: 'ST', fields: ['1', '20260602', '20260602', '1', '2'] },
    { type: 'GO', fields: ['1', '123', '99'] }
  ];
  const specs = new Map(DISPENSING_UKE_OFFICIAL_RECORD_SPEC.map((spec) => [spec.type, spec]));

  assert.strictEqual(specs.get('SN')?.minFields, 8);
  assert.strictEqual(specs.get('JD')?.minFields, 32);
  assert.strictEqual(specs.get('MF')?.minFields, 32);
  assert.strictEqual(specs.get('ST')?.minFields, 15);
  assert.deepStrictEqual(specs.get('SN')?.allFields?.map((field) => field.label), [
    '負担者種別',
    '確認区分',
    '保険者番号等',
    '被保険者資格に係る記号',
    '被保険者資格に係る番号',
    '枝番',
    '受給者番号',
    '予備'
  ]);
  assert.deepStrictEqual(specs.get('ST')?.allFields?.slice(0, 5).map((field) => field.label), [
    '医師番号',
    '処方月日',
    '調剤月日',
    '処方箋受付回',
    '分割指示回数'
  ]);

  const okIssues = validateDispensingUkeRecords(officialRecords, {
    context: 'official_submission',
    officialSubmission: true,
    recordSpecs: DISPENSING_UKE_OFFICIAL_RECORD_SPEC
  });
  assert.deepStrictEqual(okIssues.filter((issue) => issue.severity === 'error'), []);

  const brokenConditionalRecords = officialRecords.map((record) => {
    if (record.type === 'SN') return { ...record, fields: ['1', '1'] };
    if (record.type === 'JD') return { ...record, fields: [] };
    if (record.type === 'MF') return { ...record, fields: ['1'] };
    if (record.type === 'ST') return { ...record, fields: ['1', '2026-06-02', '20260602', '1', '2'] };
    return record;
  });
  const brokenConditionalIssues = validateDispensingUkeRecords(brokenConditionalRecords, {
    context: 'official_submission',
    officialSubmission: true,
    recordSpecs: DISPENSING_UKE_OFFICIAL_RECORD_SPEC
  });
  assert.ok(brokenConditionalIssues.some((issue) => issue.code === 'sn_all_field_2_digits_invalid'));
  assert.ok(brokenConditionalIssues.some((issue) => issue.code === 'jd_all_field_1_missing'));
  assert.ok(brokenConditionalIssues.some((issue) => issue.code === 'mf_all_field_1_digits_invalid'));
  assert.ok(brokenConditionalIssues.some((issue) => issue.code === 'st_all_field_2_date_invalid'));

  const noPayerRecords = officialRecords.filter((record) => record.type !== 'HO');
  const noPayerIssues = validateDispensingUkeRecords(noPayerRecords, {
    context: 'official_submission',
    officialSubmission: true,
    recordSpecs: DISPENSING_UKE_OFFICIAL_RECORD_SPEC
  });
  assert.ok(noPayerIssues.some((issue) => issue.code === 'official_submission_sn_without_payer_record'));
  assert.ok(noPayerIssues.some((issue) => issue.code === 'official_submission_jd_without_payer_record'));
  assert.ok(noPayerIssues.some((issue) => issue.code === 'official_submission_mf_without_payer_record'));
});

test('official submission all-field definition gate confirms every standard record including GO', () => {
  const gate = buildDispensingUkeOfficialAllFieldDefinitionGate();
  const csv = buildDispensingUkeOfficialAllFieldDefinitionGateCsv(gate);
  const goItem = gate.items.find((item) => item.recordType === 'GO');
  const goSpec = DISPENSING_UKE_OFFICIAL_RECORD_SPEC.find((spec) => spec.type === 'GO');

  assert.strictEqual(gate.ok, true);
  assert.strictEqual(gate.source, DISPENSING_UKE_RECORD_SPEC_SOURCE);
  assert.deepStrictEqual(gate.expectedRecordTypes, [...DISPENSING_UKE_OFFICIAL_SUBMISSION_RECORD_TYPES]);
  assert.deepStrictEqual(gate.missingRecordTypes, []);
  assert.deepStrictEqual(gate.recordTypesWithoutAllFields, []);
  assert.strictEqual(gate.completedRecordTypeCount, DISPENSING_UKE_OFFICIAL_SUBMISSION_RECORD_TYPES.length);
  assert.strictEqual(gate.expectedFieldCount, 372);
  assert.strictEqual(gate.definedFieldCount, 372);
  assert.strictEqual(gate.issueCount, 0);
  assert.ok(goItem);
  assert.strictEqual(goItem.expectedFieldCount, 3);
  assert.strictEqual(goItem.definedFieldCount, 3);
  assert.deepStrictEqual(goSpec?.allFields?.map((field) => field.label), [
    '総件数',
    '総合計点数',
    'マルチボリューム識別情報'
  ]);
  assert.match(formatDispensingUkeOfficialAllFieldDefinitionGate(gate), /公式提出allFields完了ゲート: OK/);
  assert.match(formatDispensingUkeOfficialAllFieldDefinitionGate(gate), /レコード 16\/16/);
  assert.match(csv, /^"出典","出典URL","判定","レコード種別","レコード名","期待項目数","定義項目数"/);
  assert.match(csv, /"GO","総括情報","3","3","","","","定義完了",""/);

  const missingGoGate = buildDispensingUkeOfficialAllFieldDefinitionGate(
    DISPENSING_UKE_OFFICIAL_RECORD_SPEC.filter((spec) => spec.type !== 'GO')
  );
  assert.strictEqual(missingGoGate.ok, false);
  assert.deepStrictEqual(missingGoGate.missingRecordTypes, ['GO']);
  assert.ok(missingGoGate.recordTypesWithoutAllFields.includes('GO'));
  assert.ok(missingGoGate.issues.some((issue) => issue.code === 'official_all_fields_record_missing'));

  const partialGoGate = buildDispensingUkeOfficialAllFieldDefinitionGate(
    DISPENSING_UKE_OFFICIAL_RECORD_SPEC.map((spec) => (
      spec.type === 'GO'
        ? { ...spec, allFields: spec.allFields?.slice(0, 2) }
        : spec
    ))
  );
  assert.strictEqual(partialGoGate.ok, false);
  assert.ok(partialGoGate.recordTypesWithoutAllFields.includes('GO'));
  assert.ok(partialGoGate.issues.some((issue) => issue.message.includes('3項目目')));
});

test('getDispensingUkeRecordDefinedFields merges key fields and staged all-field definitions', () => {
  const ykSpec = DISPENSING_UKE_KNOWN_RECORD_SPEC.find((spec) => spec.type === 'YK');

  assert.ok(ykSpec);
  const fields = getDispensingUkeRecordDefinedFields({
    ...ykSpec,
    allFields: [
      { index: 2, label: '都道府県', required: false, format: 'text' },
      { index: 0, label: '保険薬局コード', required: true, format: 'digits', lengths: [7] }
    ]
  });

  assert.deepStrictEqual(fields.map((field) => field.index), [0, 1, 2, 4, 5]);
  assert.strictEqual(fields.find((field) => field.index === 2)?.label, '都道府県');
});

test('validateDispensingUkeRecords applies staged all-field definitions', () => {
  const specsWithYkAllFields = DISPENSING_UKE_KNOWN_RECORD_SPEC.map((spec) => (
    spec.type === 'YK'
      ? {
        ...spec,
        allFields: [
          { index: 2, label: '都道府県コード', required: true, format: 'digits' as const, lengths: [2] },
          { index: 3, label: '郵便番号', required: false, format: 'digits' as const, lengths: [7] }
        ]
      }
      : spec
  ));
  const records = validRecords.map((record) => ({
    ...record,
    fields: [...record.fields]
  }));
  const yk = records.find((record) => record.type === 'YK');
  assert.ok(yk);
  yk.fields[2] = '';
  yk.fields[3] = '100-0001';

  const issues = validateDispensingUkeRecords(records, { recordSpecs: specsWithYkAllFields });
  const report = buildDispensingUkeAllFieldValidationReport(records, { recordSpecs: specsWithYkAllFields });
  const csv = buildDispensingUkeAllFieldValidationReportCsv(report);
  const codes = issues.map((issue) => issue.code);

  assert.ok(codes.includes('yk_all_field_3_missing'));
  assert.ok(codes.includes('yk_all_field_4_digits_invalid'));
  assert.ok(issues.some((issue) => issue.message.includes('全項目定義')));
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.source.url, DISPENSING_UKE_RECORD_SPEC_SOURCE.url);
  assert.strictEqual(report.definedAllFieldCount, 2);
  assert.deepStrictEqual(report.definedAllFieldRecordTypes, ['YK']);
  assert.strictEqual(report.checkedFieldCount, 2);
  assert.strictEqual(report.issueFieldCount, 2);
  assert.strictEqual(report.missingFieldCount, 1);
  assert.strictEqual(report.formatIssueFieldCount, 1);
  assert.deepStrictEqual(report.recordTypesWithIssues, ['YK']);
  assert.match(formatDispensingUkeAllFieldValidationReport(report), /allFields検証: 要確認/);
  assert.match(formatDispensingUkeAllFieldValidationReport(report), /定義 2/);
  assert.match(formatDispensingUkeAllFieldValidationReport(report), /必須抜け 1 \/ 形式不備 1/);
  assert.match(csv, /^"出典","出典URL","定義レコード","定義項目数","レコード位置","レコード種別","項番","項目名"/);
  assert.match(csv, new RegExp(`"${DISPENSING_UKE_RECORD_SPEC_SOURCE.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(csv, /"YK","2","1","YK","3","都道府県コード","必須","digits","なし","必須抜け","yk_all_field_3_missing"/);
  assert.match(csv, /"YK","2","1","YK","4","郵便番号","任意","digits","あり","形式不備","yk_all_field_4_digits_invalid"/);
});

test('buildDispensingUkeRecordSpecReview reports missing generated record types for sample coverage', () => {
  const review = buildDispensingUkeRecordSpecReview(validRecords);

  assert.strictEqual(review.ok, false);
  assert.ok(review.missingGeneratedRecordTypes.includes('KO'));
  assert.ok(review.missingGeneratedRecordTypes.includes('CZ'));
  assert.ok(review.missingGeneratedRecordTypes.includes('CO'));
  assert.deepStrictEqual(review.unknownGeneratedRecordTypes, []);
  assert.ok(formatDispensingUkeRecordSpecReview(review).includes('未生成'));
});

test('validateDispensingUkeRecords catches missing required records and items', () => {
  const issues = validateDispensingUkeRecords([
    validRecords[0],
    validRecords[1],
    validRecords[8]
  ]);

  assert.ok(issues.some((issue) => issue.code === 'uke_missing_jd'));
  assert.ok(issues.some((issue) => issue.code === 'uke_missing_iy'));
});

test('validateDispensingUkeRecords catches duplicated singleton records', () => {
  const issues = validateDispensingUkeRecords([
    validRecords[0],
    {
      type: 'YK',
      fields: ['1312345', '重複薬局', '', '1000001', '東京都千代田区1-1', '0312345678', 'T1234567890123']
    },
    ...validRecords.slice(1)
  ]);

  assert.ok(issues.some((issue) => issue.code === 'uke_duplicate_yk' && issue.severity === 'error'));
});

test('validateDispensingUkeRecords catches invalid record order', () => {
  const issues = validateDispensingUkeRecords([
    validRecords[0],
    validRecords[2],
    validRecords[1],
    ...validRecords.slice(3)
  ]);

  assert.ok(issues.some((issue) => issue.code === 'uke_record_order_invalid' && issue.recordType === 'RE'));
});

test('validateDispensingUkeRecords catches invalid numeric field formats', () => {
  const records: UkeRecord[] = [
    {
      type: 'YK',
      fields: ['13123A5', 'テスト薬局', '', '100-0001', '東京都千代田区1-1', '0312345678', 'T1234567890123']
    },
    {
      type: 'RE',
      fields: ['1', '2026-06', 'v_1', 'pt_1', '山田太郎', 'ヤマダタロウ', '1', '19800101', '123点']
    },
    {
      type: 'HO',
      fields: ['06-139999', '記号123番号456', '三割']
    },
    {
      type: 'KO',
      fields: ['51136A18', '123456', '110']
    },
    {
      type: 'JD',
      fields: ['2026-06-04']
    },
    {
      type: 'SH',
      fields: ['2026064', 'inst_1', 'dr_1']
    },
    validRecords[5],
    validRecords[6],
    {
      type: 'TK',
      fields: ['123点', 'one', '1件']
    },
    {
      type: 'ST',
      fields: ['202606041200', 'yakureki']
    }
  ];

  const issues = validateDispensingUkeRecords(records);
  const codes = issues.map((issue) => issue.code);

  assert.ok(codes.includes('yk_pharmacy_code_format_invalid'));
  assert.ok(codes.includes('re_claim_month_format_invalid'));
  assert.ok(codes.includes('re_total_points_format_invalid'));
  assert.ok(codes.includes('ho_insurer_number_format_invalid'));
  assert.ok(codes.includes('ho_burden_ratio_format_invalid'));
  assert.ok(codes.includes('ko_public_provider_format_invalid'));
  assert.ok(codes.includes('ko_public_recipient_format_invalid'));
  assert.ok(codes.includes('ko_public_burden_ratio_format_invalid'));
  assert.ok(codes.includes('jd_dispensing_date_format_invalid'));
  assert.ok(codes.includes('sh_prescription_date_format_invalid'));
  assert.ok(codes.includes('tk_total_points_format_invalid'));
  assert.ok(codes.includes('tk_fee_count_format_invalid'));
  assert.ok(codes.includes('tk_iy_count_format_invalid'));
  assert.ok(codes.includes('st_timestamp_format_invalid'));
});

test('validateDispensingUkeRecords treats official sample-only record types as known validation targets', () => {
  const issues = validateDispensingUkeRecords([
    { type: 'MN', fields: ['940000030', '東京都港区新橋', '13450607940000030', '', '', ''] },
    { type: 'SN', fields: ['A', '', '', '', '', '46', '', ''] },
    { type: 'JY', fields: ['2', 'B', '0', '', '', '15', '0', ''] },
    { type: 'ON', fields: ['C', '', '', '2028-01-31', '', '1', '', '', '', '', '', '', '', 'payload'] },
    { type: 'EX', fields: ['', '', '', '', '', '', '', '', '', '', '', 'payload'] },
    { type: 'RC', fields: ['Ver00001db528af87bae99b304282f514dc2f5a3'] },
    { type: 'MF', fields: ['D', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''] }
  ]);
  const codes = issues.map((issue) => issue.code);

  assert.ok(!codes.includes('uke_unknown_record_type'));
  assert.ok(codes.includes('sn_category_format_invalid'));
  assert.ok(codes.includes('sn_field_missing_1'));
  assert.ok(codes.includes('jy_type_format_invalid'));
  assert.ok(codes.includes('on_category_format_invalid'));
  assert.ok(codes.includes('on_effective_timestamp_format_invalid'));
  assert.ok(codes.includes('mf_category_format_invalid'));
});

test('validateDispensingUkeRecords catches mismatched total points', () => {
  const records = validRecords.map((record) => ({
    ...record,
    fields: [...record.fields]
  }));
  const total = records.find((record) => record.type === 'TK');
  assert.ok(total);
  total.fields[0] = '999';

  const issues = validateDispensingUkeRecords(records);

  assert.ok(issues.some((issue) => issue.code === 'uke_total_points_mismatch'));
});

test('validateDispensingUkeRecords catches mismatched fee record counts', () => {
  const records = validRecords.map((record) => ({
    ...record,
    fields: [...record.fields]
  }));
  const total = records.find((record) => record.type === 'TK');
  assert.ok(total);
  total.fields[1] = '9';

  const issues = validateDispensingUkeRecords(records);

  assert.ok(issues.some((issue) => issue.code === 'uke_fee_count_mismatch'));
});

test('validateDispensingUkeRecords ignores non-sequenced TO detail records in fee counts', () => {
  const issues = validateDispensingUkeRecords([
    ...validRecords.slice(0, -2),
    {
      type: 'TO',
      fields: ['', 'INTERVENT_drug_1', '【疑義照会・処方変更】理由: 規格確認', '0', '']
    },
    ...validRecords.slice(-2)
  ]);

  assert.ok(!issues.some((issue) => issue.code === 'uke_fee_count_mismatch'));
});

test('validateDispensingUkeRecords catches missing receipt drug code in IY records', () => {
  const records = validRecords.map((record) => ({
    ...record,
    fields: [...record.fields]
  }));
  const iy = records.find((record) => record.type === 'IY');
  assert.ok(iy);
  iy.fields[3] = '';

  const issues = validateDispensingUkeRecords(records);

  assert.ok(issues.some((issue) => issue.code === 'iy_field_missing_3' && issue.severity === 'error'));
});

test('validateDispensingUkeRecords catches invalid patient birth date', () => {
  const records = validRecords.map((record) => ({
    ...record,
    fields: [...record.fields]
  }));
  const re = records.find((record) => record.type === 'RE');
  assert.ok(re);
  re.fields[7] = '1980-01-01';

  const issues = validateDispensingUkeRecords(records);

  assert.ok(issues.some((issue) => issue.code === 're_birthdate_invalid'));
});
