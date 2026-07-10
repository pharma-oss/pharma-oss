import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildMigrationPackageReadinessAuditDetail,
  buildMigrationPackageReadinessCsv,
  buildMigrationPackageReadinessReview,
  buildDrugStockCsvMigrationPreview,
  buildPatientCsvMigrationPreview,
  buildSoapCsvMigrationPreview,
  buildVisitCsvMigrationPreview
} from './migration_csv.ts';

test('buildPatientCsvMigrationPreview maps patient CSV aliases into backup patients', () => {
  const csv = [
    '患者番号,氏名,フリガナ,生年月日,性別,保険者番号,記号番号,負担割合',
    'P001,山田 太郎,ヤマダ タロウ,1980/4/3,男,12345678,記号-123,3割'
  ].join('\n');

  const preview = buildPatientCsvMigrationPreview(csv, {
    generatedAt: new Date('2026-06-18T10:00:00.000Z')
  });

  assert.strictEqual(preview.statusLabel, 'CSV移行OK');
  assert.strictEqual(preview.rows.length, 1);
  assert.strictEqual(preview.backup.createdAt, '2026-06-18T10:00:00.000Z');
  assert.strictEqual(preview.backup.collections.patients?.length, 1);
  assert.deepStrictEqual(preview.backup.collections.patients?.[0], {
    patientId: 'P001',
    name: '山田 太郎',
    kana: 'ヤマダ タロウ',
    birthDate: '1980-04-03',
    gender: 'male',
    insuranceInfo: {
      provider: '12345678',
      number: '記号-123',
      burdenRatio: 30
    }
  });
  assert.strictEqual(preview.sourceFormat?.delimiter, 'comma');
  assert.strictEqual(preview.sourceFormat?.recognizedColumns.patientId, '患者番号');
  assert.strictEqual(preview.diagnostic.statusLabel, '移行OK');
});

test('buildPatientCsvMigrationPreview supports TSV and detects duplicate, missing ID, and mojibake risks', () => {
  const tsv = [
    '患者ID\t患者名\tカナ\t生年月日\t性別',
    'P001\t山田 太郎\tヤマダ タロウ\t19800403\t男性',
    'P001\t重複 患者\tチョウフク カンジャ\t1979-01-02\t女性',
    '\tIDなし 患者\tアイディーナシ\t1981/5/6\tその他',
    'P004\t譁ｰ螳ｿ 薬局\tモジバケ\t1982/7/8\t男'
  ].join('\n');

  const preview = buildPatientCsvMigrationPreview(tsv, {
    generatedAt: new Date('2026-06-18T10:00:00.000Z')
  });

  assert.strictEqual(preview.sourceFormat?.delimiter, 'tab');
  assert.strictEqual(preview.statusLabel, 'CSV修正必要');
  assert.strictEqual(preview.rows.length, 4);
  assert.ok(preview.issues.some((issue) => issue.code === 'patient_migration_csv_patient_id_missing'));
  assert.strictEqual(preview.diagnostic.statusLabel, '移行不可');
  assert.strictEqual(preview.diagnostic.duplicatePrimaryKeyCount, 1);
  assert.strictEqual(preview.diagnostic.missingPrimaryKeyCount, 1);
  assert.strictEqual(preview.diagnostic.mojibakeSuspectCount, 1);
  assert.strictEqual(preview.diagnostic.missingRequiredCollectionCount, 0);
});

test('buildPatientCsvMigrationPreview blocks files without patient mapping headers', () => {
  const preview = buildPatientCsvMigrationPreview('品名,数量\n薬品A,10', {
    generatedAt: new Date('2026-06-18T10:00:00.000Z')
  });

  assert.strictEqual(preview.statusLabel, 'CSV修正必要');
  assert.strictEqual(preview.rows.length, 0);
  assert.ok(preview.issues.some((issue) => issue.code === 'patient_migration_csv_header_missing'));
  assert.strictEqual(preview.backup.collections.patients?.length, 0);
});

test('buildVisitCsvMigrationPreview maps visit CSV aliases into backup visits', () => {
  const csv = [
    '受付番号,患者番号,来局日,状態,処方日,医療機関名,診療科,医師名',
    'V001,P001,2026/6/18,受付中,2026/6/17,青空クリニック,内科,佐藤 一郎'
  ].join('\n');

  const preview = buildVisitCsvMigrationPreview(csv, {
    generatedAt: new Date('2026-06-18T11:00:00.000Z')
  });

  assert.strictEqual(preview.statusLabel, 'CSV移行OK');
  assert.strictEqual(preview.rows.length, 1);
  assert.deepStrictEqual(preview.backup.collections.visits?.[0], {
    visitId: 'V001',
    patientId: 'P001',
    issueDate: '2026-06-18',
    status: 'waiting',
    prescriptionDate: '2026-06-17',
    institutionName: '青空クリニック',
    departmentName: '内科',
    doctorName: '佐藤 一郎'
  });
  assert.strictEqual(preview.sourceFormat?.recognizedColumns.visitId, '受付番号');
  assert.strictEqual(preview.diagnostic.statusLabel, '移行OK');
});

test('buildVisitCsvMigrationPreview supports TSV and detects duplicate and missing visit IDs', () => {
  const tsv = [
    '受付ID\t患者ID\t受付日\tステータス\t医療機関コード',
    'V001\tP001\t20260618\t完了\t1312345',
    'V001\tP002\t2026-06-19\tキャンセル\t1312345',
    '\tP003\t2026/6/20\t調剤中\t1312345'
  ].join('\n');

  const preview = buildVisitCsvMigrationPreview(tsv, {
    generatedAt: new Date('2026-06-18T11:00:00.000Z')
  });

  assert.strictEqual(preview.sourceFormat?.delimiter, 'tab');
  assert.strictEqual(preview.statusLabel, 'CSV修正必要');
  assert.strictEqual(preview.rows.length, 3);
  assert.ok(preview.issues.some((issue) => issue.code === 'visit_migration_csv_visit_id_missing'));
  assert.strictEqual(preview.backup.collections.visits?.[0].status, 'completed');
  assert.strictEqual(preview.backup.collections.visits?.[1].status, 'cancelled');
  assert.strictEqual(preview.backup.collections.visits?.[2].status, 'processing');
  assert.strictEqual(preview.diagnostic.duplicatePrimaryKeyCount, 1);
  assert.strictEqual(preview.diagnostic.missingPrimaryKeyCount, 1);
});

test('buildVisitCsvMigrationPreview blocks files without visit mapping headers', () => {
  const preview = buildVisitCsvMigrationPreview('患者番号,氏名\nP001,山田 太郎', {
    generatedAt: new Date('2026-06-18T11:00:00.000Z')
  });

  assert.strictEqual(preview.statusLabel, 'CSV修正必要');
  assert.strictEqual(preview.rows.length, 0);
  assert.ok(preview.issues.some((issue) => issue.code === 'visit_migration_csv_header_missing'));
  assert.strictEqual(preview.backup.collections.visits?.length, 0);
});

test('buildDrugStockCsvMigrationPreview maps stock CSV aliases into backup drug stocks', () => {
  const csv = [
    '在庫ID,薬品コード,JANコード,ロット番号,使用期限,在庫数,入庫日,仕入先',
    'S001,620001234,4987123456789,LOT-1,2027/3/31,"1,200",2026/6/1,東京卸'
  ].join('\n');

  const preview = buildDrugStockCsvMigrationPreview(csv, {
    generatedAt: new Date('2026-06-18T12:00:00.000Z')
  });

  assert.strictEqual(preview.statusLabel, 'CSV移行OK');
  assert.strictEqual(preview.rows.length, 1);
  assert.deepStrictEqual(preview.backup.collections.drug_stocks?.[0], {
    id: 'S001',
    drugCode: '620001234',
    quantity: 1200,
    janCode: '4987123456789',
    lotNumber: 'LOT-1',
    expirationDate: '2027-03-31',
    arrivalDate: '2026-06-01',
    supplier: '東京卸'
  });
  assert.strictEqual(preview.sourceFormat?.recognizedColumns.drugCode, '薬品コード');
  assert.strictEqual(preview.diagnostic.statusLabel, '移行OK');
});

test('buildDrugStockCsvMigrationPreview generates stock IDs and detects generated duplicates', () => {
  const tsv = [
    '薬品コード\tロット\t期限\t数量',
    '620001234\tLOT-1\t20270331\t100錠',
    '620001234\tLOT-1\t2027-03-31\t50',
    '620009999\t\t\t'
  ].join('\n');

  const preview = buildDrugStockCsvMigrationPreview(tsv, {
    generatedAt: new Date('2026-06-18T12:00:00.000Z')
  });

  assert.strictEqual(preview.sourceFormat?.delimiter, 'tab');
  assert.strictEqual(preview.statusLabel, 'CSV修正必要');
  assert.strictEqual(preview.rows.length, 2);
  assert.strictEqual(preview.backup.collections.drug_stocks?.[0].id, 'stock_620001234_LOT_1_2027_03_31');
  assert.ok(preview.issues.some((issue) => issue.code === 'drug_stock_migration_csv_id_generated'));
  assert.ok(preview.issues.some((issue) => issue.code === 'drug_stock_migration_csv_required_value_missing'));
  assert.strictEqual(preview.diagnostic.duplicatePrimaryKeyCount, 1);
});

test('buildDrugStockCsvMigrationPreview blocks files without stock mapping headers', () => {
  const preview = buildDrugStockCsvMigrationPreview('患者番号,氏名\nP001,山田 太郎', {
    generatedAt: new Date('2026-06-18T12:00:00.000Z')
  });

  assert.strictEqual(preview.statusLabel, 'CSV修正必要');
  assert.strictEqual(preview.rows.length, 0);
  assert.ok(preview.issues.some((issue) => issue.code === 'drug_stock_migration_csv_header_missing'));
  assert.strictEqual(preview.backup.collections.drug_stocks?.length, 0);
});

test('buildSoapCsvMigrationPreview maps SOAP CSV aliases into backup soap records', () => {
  const csv = [
    '薬歴ID,受付ID,記録者ID,記録日時,問題名,S,O,A,P',
    'SOAP001,V001,user_1,202606181030,高血圧,眠気なし,血圧130/80,継続可,次回も確認'
  ].join('\n');

  const preview = buildSoapCsvMigrationPreview(csv, {
    generatedAt: new Date('2026-06-18T13:00:00.000Z')
  });

  assert.strictEqual(preview.statusLabel, 'CSV移行OK');
  assert.strictEqual(preview.rows.length, 1);
  assert.deepStrictEqual(preview.backup.collections.soap_records?.[0], {
    soapId: 'SOAP001',
    visitId: 'V001',
    authorId: 'user_1',
    problems: [{
      id: 'migration_problem',
      title: '高血圧',
      entries: [
        { type: 'S', text: '眠気なし' },
        { type: 'O', text: '血圧130/80' },
        { type: 'A', text: '継続可' },
        { type: 'P', text: '次回も確認' }
      ]
    }],
    updatedAt: '2026-06-18T10:30:00.000Z'
  });
  assert.strictEqual(preview.sourceFormat?.recognizedColumns.visitId, '受付ID');
  assert.strictEqual(preview.diagnostic.statusLabel, '移行OK');
});

test('buildSoapCsvMigrationPreview supports free text and generated IDs', () => {
  const tsv = [
    '受付ID\t記録日\t薬歴本文',
    'V001\t20260618\t患者より飲み忘れなし。次回も継続確認。',
    'V001\t20260618\t重複する移行薬歴IDになる行'
  ].join('\n');

  const preview = buildSoapCsvMigrationPreview(tsv, {
    generatedAt: new Date('2026-06-18T13:00:00.000Z')
  });

  assert.strictEqual(preview.sourceFormat?.delimiter, 'tab');
  assert.strictEqual(preview.statusLabel, 'CSV修正必要');
  assert.strictEqual(preview.rows.length, 2);
  assert.strictEqual(preview.backup.collections.soap_records?.[0].soapId, 'soap_V001_2026_06_18T00_00_00_000Z');
  assert.deepStrictEqual((preview.backup.collections.soap_records?.[0].problems as any[])[0].entries, [
    { type: 'S', text: '患者より飲み忘れなし。次回も継続確認。' }
  ]);
  assert.ok(preview.issues.some((issue) => issue.code === 'soap_migration_csv_id_generated'));
  assert.strictEqual(preview.diagnostic.duplicatePrimaryKeyCount, 1);
});

test('buildSoapCsvMigrationPreview blocks rows without visit ID or SOAP text', () => {
  const csv = [
    '受付ID,S,O,A,P',
    ',眠気あり,,,',
    'V001,,,,'
  ].join('\n');

  const preview = buildSoapCsvMigrationPreview(csv, {
    generatedAt: new Date('2026-06-18T13:00:00.000Z')
  });

  assert.strictEqual(preview.statusLabel, 'CSV修正必要');
  assert.strictEqual(preview.rows.length, 0);
  assert.ok(preview.issues.some((issue) => issue.code === 'soap_migration_csv_visit_id_missing'));
  assert.ok(preview.issues.some((issue) => issue.code === 'soap_migration_csv_text_missing'));
  assert.strictEqual(preview.backup.collections.soap_records?.length, 0);
});

test('buildSoapCsvMigrationPreview blocks files without SOAP mapping headers', () => {
  const preview = buildSoapCsvMigrationPreview('患者番号,氏名\nP001,山田 太郎', {
    generatedAt: new Date('2026-06-18T13:00:00.000Z')
  });

  assert.strictEqual(preview.statusLabel, 'CSV修正必要');
  assert.strictEqual(preview.rows.length, 0);
  assert.ok(preview.issues.some((issue) => issue.code === 'soap_migration_csv_header_missing'));
  assert.strictEqual(preview.backup.collections.soap_records?.length, 0);
});

test('buildMigrationPackageReadinessReview passes a complete migration pack for one-day onboarding trial', () => {
  const generatedAt = new Date('2026-06-18T14:00:00.000Z');
  const patients = buildPatientCsvMigrationPreview([
    '患者番号,氏名,生年月日',
    'P001,山田 太郎,1980/4/3'
  ].join('\n'), { generatedAt });
  const visits = buildVisitCsvMigrationPreview([
    '受付番号,患者番号,来局日',
    'V001,P001,2026/6/18'
  ].join('\n'), { generatedAt });
  const drugStocks = buildDrugStockCsvMigrationPreview([
    '在庫ID,薬品コード,在庫数',
    'S001,620001234,10'
  ].join('\n'), { generatedAt });
  const soapRecords = buildSoapCsvMigrationPreview([
    '薬歴ID,受付ID,記録日,薬歴本文',
    'SOAP001,V001,20260618,服薬状況を確認'
  ].join('\n'), { generatedAt });

  const review = buildMigrationPackageReadinessReview({
    generatedAt,
    patients,
    visits,
    drugStocks,
    soapRecords
  });

  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.statusLabel, '導入移行OK');
  assert.strictEqual(review.readyForOneDayTrial, true);
  assert.strictEqual(review.requiredSourceCount, 2);
  assert.strictEqual(review.providedSourceCount, 4);
  assert.strictEqual(review.totalRowCount, 4);
  assert.strictEqual(review.referenceIssueCount, 0);
  assert.ok(review.sources.every((source) => source.status === 'pass'));
  assert.ok(review.references.every((reference) => reference.status === 'pass'));
});

test('buildMigrationPackageReadinessReview blocks orphan visits and orphan SOAP records without leaking source IDs', () => {
  const generatedAt = new Date('2026-06-18T14:00:00.000Z');
  const patients = buildPatientCsvMigrationPreview([
    '患者番号,氏名,生年月日',
    'P001,山田 太郎,1980/4/3'
  ].join('\n'), { generatedAt });
  const visits = buildVisitCsvMigrationPreview([
    '受付番号,患者番号,来局日',
    'V-SECRET-001,P999,2026/6/18'
  ].join('\n'), { generatedAt });
  const soapRecords = buildSoapCsvMigrationPreview([
    '薬歴ID,受付ID,記録日,薬歴本文',
    'SOAP-SECRET-001,V999,20260618,患者秘密メモ'
  ].join('\n'), { generatedAt });

  const review = buildMigrationPackageReadinessReview({
    generatedAt,
    patients,
    visits,
    soapRecords,
    recommendedSourceKinds: ['patients', 'visits', 'soap_records']
  });
  const csv = buildMigrationPackageReadinessCsv(review);
  const auditDetail = buildMigrationPackageReadinessAuditDetail(review);

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.readyForOneDayTrial, false);
  assert.strictEqual(review.referenceIssueCount, 2);
  assert.ok(review.references.some((reference) => (
    reference.id === 'visit_patient_reference'
    && reference.status === 'blocked'
    && reference.issueCount === 1
  )));
  assert.ok(review.references.some((reference) => (
    reference.id === 'soap_visit_reference'
    && reference.status === 'blocked'
    && reference.issueCount === 1
  )));
  assert.match(csv, /患者情報なし/);
  assert.match(auditDetail, /導入移行レビュー 導入移行不可/);
  for (const sensitiveValue of ['P001', 'P999', 'V-SECRET-001', 'V999', 'SOAP-SECRET-001', '山田 太郎', '患者秘密メモ']) {
    assert.doesNotMatch(csv, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(auditDetail, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('buildMigrationPackageReadinessReview marks missing required core CSVs as blocked and optional CSVs as attention', () => {
  const review = buildMigrationPackageReadinessReview({
    generatedAt: new Date('2026-06-18T14:00:00.000Z')
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.blockedSourceCount, 2);
  assert.strictEqual(review.attentionSourceCount, 2);
  assert.ok(review.sources.some((source) => (
    source.kind === 'patients'
    && source.required
    && source.status === 'blocked'
  )));
  assert.ok(review.sources.some((source) => (
    source.kind === 'drug_stocks'
    && !source.required
    && source.status === 'attention'
  )));
});
