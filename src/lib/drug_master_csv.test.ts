import { test } from 'node:test';
import assert from 'node:assert';
import {
  DRUG_MASTER_SPECIFICATION_COLUMNS,
  DRUG_MASTER_SPECIFICATION_SOURCE,
  buildDrugMasterColumnDefinitionReview,
  buildDrugMasterSpecificationRevisionReview,
  formatDrugMasterColumnDefinitionReview,
  formatDrugMasterCsvLayoutLabel,
  formatDrugMasterSpecificationRevisionReview,
  parseDrugMasterCsvLine,
  parseDrugMasterUpdateCsv
} from './drug_master_csv.ts';

function quoteCsvRow(values: string[]): string {
  return values.map((value) => `"${value}"`).join(',');
}

function makeStandardDrugMasterRow(overrides: Record<number, string> = {}): string[] {
  const values = Array(42).fill('');
  Object.assign(values, {
    0: '2',
    1: 'Y',
    2: '620000001',
    3: '3',
    4: '標準錠',
    5: '6',
    6: 'ヒョウジュン',
    7: '001',
    8: '1',
    9: '錠',
    10: '1',
    11: '12.3',
    12: '00',
    13: '0',
    14: '0',
    15: '0',
    16: '1',
    17: '0',
    18: '0',
    19: '0',
    20: '00000',
    21: '1',
    22: '000000001',
    23: '0',
    24: '0000000000000',
    25: '0',
    26: '0',
    27: '1',
    28: '',
    29: '20260601',
    30: '99999999',
    31: '1234567F1020',
    32: '000000001',
    33: '99999999',
    34: '標準錠',
    35: '20260601',
    36: '1234567F1020',
    37: '標準錠の一般名',
    38: '1',
    39: '0',
    40: '000000001',
    41: '0',
    ...overrides
  });
  return values;
}

test('parseDrugMasterCsvLine handles quoted commas and escaped quotes', () => {
  assert.deepStrictEqual(
    parseDrugMasterCsvLine('"1","620001","A, 錠","He said ""ok"""'),
    ['1', '620001', 'A, 錠', 'He said "ok"']
  );
});

test('parseDrugMasterUpdateCsv uses SSK standard layout when no header exists', () => {
  const csv = [
    [
      '2',
      'Y',
      '620000001',
      '',
      '標準錠',
      '',
      '',
      '',
      '',
      '',
      '',
      '12.3',
      ...Array(19).fill(''),
      '1234567F1020',
      '',
      '99999999'
    ].map((value) => `"${value}"`).join(',')
  ].join('\n');

  const result = parseDrugMasterUpdateCsv(csv, { today: new Date(2026, 5, 15) });

  assert.strictEqual(result.layout.source, 'ssk-standard');
  assert.strictEqual(formatDrugMasterCsvLayoutLabel(result.layout), '支払基金標準列');
  assert.strictEqual(result.rows.length, 1);
  assert.strictEqual(result.rows[0].code, '620000001');
  assert.strictEqual(result.rows[0].name, '標準錠');
  assert.strictEqual(result.rows[0].price, 12.3);
  assert.strictEqual(result.rows[0].yjCode, '1234567F1020');
  assert.strictEqual(result.rows[0].isAbolished, false);
});

test('parseDrugMasterUpdateCsv maps shuffled header columns by name', () => {
  const csv = [
    '"医薬品名（漢字）","薬価","医薬品コード","変更区分","YJコード","廃止年月日"',
    '"ヘッダー錠","45.6","620000002","9","1234567F2020","99999999"'
  ].join('\n');

  const result = parseDrugMasterUpdateCsv(csv, { today: new Date(2026, 5, 15) });

  assert.strictEqual(result.layout.source, 'header');
  assert.strictEqual(formatDrugMasterCsvLayoutLabel(result.layout), 'ヘッダー列名');
  assert.deepStrictEqual(
    result.rows.map((row) => ({
      code: row.code,
      name: row.name,
      price: row.price,
      yjCode: row.yjCode,
      isAbolished: row.isAbolished
    })),
    [{
      code: '620000002',
      name: 'ヘッダー錠',
      price: 45.6,
      yjCode: '1234567F2020',
      isAbolished: true
    }]
  );
});

test('parseDrugMasterUpdateCsv marks rows abolished by effective abolish date', () => {
  const csv = [
    '"変更区分","医薬品コード","医薬品名","薬価","廃止日"',
    '"2","620000003","期限切れ錠","10","20260614"'
  ].join('\n');

  const result = parseDrugMasterUpdateCsv(csv, { today: new Date(2026, 5, 15) });

  assert.strictEqual(result.rows[0].isAbolished, true);
});

test('parseDrugMasterUpdateCsv rejects header files missing required columns', () => {
  const csv = [
    '"医薬品名","薬価","変更区分"',
    '"コードなし錠","12","2"'
  ].join('\n');

  const result = parseDrugMasterUpdateCsv(csv);

  assert.strictEqual(result.rows.length, 0);
  assert.ok(result.issues.some((issue) => issue.severity === 'error' && issue.code === 'drug_master_csv_required_column_missing'));
});

test('parseDrugMasterUpdateCsv skips malformed rows and keeps valid rows', () => {
  const csv = [
    '"変更区分","医薬品コード","医薬品名","薬価"',
    '"2","","コード空欄錠","12"',
    '"2","620000004","有効錠","18"'
  ].join('\n');

  const result = parseDrugMasterUpdateCsv(csv);

  assert.strictEqual(result.rows.length, 1);
  assert.strictEqual(result.rows[0].code, '620000004');
  assert.strictEqual(result.skippedRowCount, 1);
  assert.ok(result.issues.some((issue) => issue.severity === 'warning' && issue.code === 'drug_master_csv_row_missing_key'));
});

test('parseDrugMasterUpdateCsv rejects SSK standard rows with non-drug master type', () => {
  const csv = [quoteCsvRow(makeStandardDrugMasterRow({ 1: 'T' }))].join('\n');

  const result = parseDrugMasterUpdateCsv(csv);

  assert.strictEqual(result.rows.length, 0);
  assert.ok(result.issues.some((issue) => issue.severity === 'error' && issue.code === 'drug_master_csv_master_type_mismatch'));
});

test('buildDrugMasterColumnDefinitionReview reports SSK standard column positions', () => {
  const csv = [quoteCsvRow(makeStandardDrugMasterRow())].join('\n');

  const result = parseDrugMasterUpdateCsv(csv, { today: new Date(2026, 5, 15) });
  const review = buildDrugMasterColumnDefinitionReview(result.layout, result.maxColumnCount);

  assert.strictEqual(review.ok, true);
  assert.strictEqual(review.source, 'ssk-standard');
  assert.strictEqual(review.specificationColumnCount, 42);
  assert.strictEqual(review.observedColumnCount, 42);
  assert.strictEqual(review.matchedSpecificationColumns.length, 42);
  assert.deepStrictEqual(review.missingSpecificationColumns, []);
  assert.ok(review.matchedColumns.some((column) => column.includes('医薬品コード:3列目')));
  assert.ok(review.matchedColumns.some((column) => column.includes('薬価基準収載医薬品コード:32列目')));
  assert.deepStrictEqual(review.missingRequiredColumns, []);
  assert.deepStrictEqual(review.missingOptionalColumns, []);
  assert.match(formatDrugMasterColumnDefinitionReview(review), /令和8年基本マスターファイルレイアウト/);
  assert.match(formatDrugMasterColumnDefinitionReview(review), /仕様項目 42\/42/);
});

test('drug master specification columns cover the Reiwa 8 layout item list', () => {
  assert.strictEqual(DRUG_MASTER_SPECIFICATION_COLUMNS.length, 42);
  assert.strictEqual(DRUG_MASTER_SPECIFICATION_COLUMNS[0].label, '変更区分');
  assert.strictEqual(DRUG_MASTER_SPECIFICATION_COLUMNS[31].label, '薬価基準収載医薬品コード');
  assert.strictEqual(DRUG_MASTER_SPECIFICATION_COLUMNS[41].label, '選定療養区分');
});

test('buildDrugMasterSpecificationRevisionReview tracks the official PDF revision source', () => {
  const review = buildDrugMasterSpecificationRevisionReview();
  const label = formatDrugMasterSpecificationRevisionReview(review);

  assert.strictEqual(review.ok, true);
  assert.strictEqual(review.source, DRUG_MASTER_SPECIFICATION_SOURCE);
  assert.strictEqual(review.source.fileName, 'master_3_20260731.pdf');
  assert.strictEqual(review.source.expectedItemCount, 42);
  assert.strictEqual(review.actualItemCount, 42);
  assert.strictEqual(review.firstItemLabel, '変更区分');
  assert.strictEqual(review.lastItemLabel, '選定療養区分');
  assert.match(label, /仕様PDF master_3_20260731\.pdf/);
  assert.match(label, /項目 42\/42/);
});

test('buildDrugMasterSpecificationRevisionReview fails when item order drifts from the PDF source', () => {
  const driftedColumns = DRUG_MASTER_SPECIFICATION_COLUMNS.map((column) => ({ ...column }));
  driftedColumns[0] = {
    ...driftedColumns[0],
    itemNumber: 2,
    label: 'マスター種別'
  };

  const review = buildDrugMasterSpecificationRevisionReview(driftedColumns);

  assert.strictEqual(review.ok, false);
  assert.ok(review.issues.some((issue) => issue.includes('先頭項目')));
  assert.ok(review.issues.some((issue) => issue.includes('項番')));
});

test('buildDrugMasterColumnDefinitionReview fails SSK standard files missing late specification columns', () => {
  const csv = [quoteCsvRow(makeStandardDrugMasterRow().slice(0, 34))].join('\n');

  const result = parseDrugMasterUpdateCsv(csv, { today: new Date(2026, 5, 15) });
  const review = buildDrugMasterColumnDefinitionReview(result.layout, result.maxColumnCount);

  assert.strictEqual(result.maxColumnCount, 34);
  assert.strictEqual(review.ok, false);
  assert.strictEqual(review.matchedSpecificationColumns.length, 34);
  assert.ok(review.missingSpecificationColumns.some((column) => column.includes('35.基本漢字名称')));
  assert.match(formatDrugMasterColumnDefinitionReview(review), /仕様項目 34\/42/);
  assert.match(formatDrugMasterColumnDefinitionReview(review), /仕様未確認/);
});

test('buildDrugMasterColumnDefinitionReview reports optional header columns separately', () => {
  const csv = [
    '"変更区分","医薬品コード","医薬品名","薬価"',
    '"2","620000004","有効錠","18"'
  ].join('\n');

  const result = parseDrugMasterUpdateCsv(csv);
  const review = buildDrugMasterColumnDefinitionReview(result.layout);

  assert.strictEqual(review.ok, true);
  assert.strictEqual(review.source, 'header');
  assert.deepStrictEqual(review.missingRequiredColumns, []);
  assert.ok(review.missingOptionalColumns.includes('薬価基準収載医薬品コード'));
  assert.ok(review.missingOptionalColumns.includes('経過措置年月日又は商品名医薬品コード使用期限'));
  assert.match(formatDrugMasterColumnDefinitionReview(review), /任意未確認/);
});


// 薬価の版に付ける適用開始日は、行の「変更年月日」(項番30) から取る。

test('parseDrugMasterUpdateCsv reads the change date as the price effective date', () => {
  const csv = [
    makeStandardDrugMasterRow({ 2: '620000001', 11: '0000000010.90', 29: '20260401' }).join(','),
    makeStandardDrugMasterRow({ 2: '620000002', 11: '0000000012.30', 29: '20240401' }).join(',')
  ].join('\n');

  const parsed = parseDrugMasterUpdateCsv(csv, { today: new Date('2026-06-14T09:00:00+09:00') });

  assert.strictEqual(parsed.rows[0].changeDate, '2026-04-01');
  assert.strictEqual(parsed.rows[1].changeDate, '2024-04-01');
});

test('parseDrugMasterUpdateCsv leaves the change date empty when it is unset', () => {
  // 99999999 と空欄は「未設定」。取込日で代用させるため空文字にする。
  const csv = [
    makeStandardDrugMasterRow({ 2: '620000001', 29: '99999999' }).join(','),
    // 9999年は「未設定」。99991231 の形は月日として成立してしまうので明示的に落とす。
    makeStandardDrugMasterRow({ 2: '620000002', 29: '99991231' }).join(','),
    makeStandardDrugMasterRow({ 2: '620000003', 29: '' }).join(','),
    makeStandardDrugMasterRow({ 2: '620000004', 29: '00000000' }).join(','),
    makeStandardDrugMasterRow({ 2: '620000005', 29: '2026' }).join(',')
  ].join('\n');

  const parsed = parseDrugMasterUpdateCsv(csv, { today: new Date('2026-06-14T09:00:00+09:00') });

  assert.deepStrictEqual(parsed.rows.map((row) => row.changeDate), ['', '', '', '', '']);
});

test('parseDrugMasterUpdateCsv rejects an impossible change date instead of passing it through', () => {
  const csv = makeStandardDrugMasterRow({ 2: '620000001', 29: '20261301' }).join(',');
  const parsed = parseDrugMasterUpdateCsv(csv, { today: new Date('2026-06-14T09:00:00+09:00') });

  assert.strictEqual(parsed.rows[0].changeDate, '', '13月は日付として使わない');
});

test('parseDrugMasterUpdateCsv extracts unitText and unitCode from SSK standard layout', () => {
  const csv = makeStandardDrugMasterRow({ 2: '620000001', 7: '001', 9: '錠' }).join(',');
  const parsed = parseDrugMasterUpdateCsv(csv, { today: new Date('2026-06-14T09:00:00+09:00') });

  assert.strictEqual(parsed.rows[0].unitCode, '001');
  assert.strictEqual(parsed.rows[0].unitText, '錠');
});

test('parseDrugMasterUpdateCsv extracts unitText and unitCode from header CSV with unit aliases', () => {
  const csv = [
    '"医薬品名","薬価","医薬品コード","変更区分","単位漢字名称","単位コード"',
    '"テストシロップ","3.5","620000002","2","ｍＬ","034"',
    '"テスト軟膏","15.0","620000003","2","単位","022"'
  ].join('\n');

  const parsed = parseDrugMasterUpdateCsv(csv, { today: new Date('2026-06-14T09:00:00+09:00') });
  assert.strictEqual(parsed.rows[0].unitText, 'ｍＬ');
  assert.strictEqual(parsed.rows[0].unitCode, '034');
  assert.strictEqual(parsed.rows[1].unitText, '単位');
  assert.strictEqual(parsed.rows[1].unitCode, '022');
});

test('parseDrugMasterUpdateCsv leaves unitText and unitCode undefined when CSV has no unit column', () => {
  const csv = [
    '"医薬品名","薬価","医薬品コード","変更区分"',
    '"テスト錠","10.0","620000004","2"'
  ].join('\n');

  const parsed = parseDrugMasterUpdateCsv(csv, { today: new Date('2026-06-14T09:00:00+09:00') });
  assert.strictEqual(parsed.rows[0].unitText, undefined);
  assert.strictEqual(parsed.rows[0].unitCode, undefined);
});

