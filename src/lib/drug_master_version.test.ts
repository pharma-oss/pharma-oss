import { test } from 'node:test';
import assert from 'node:assert';
import type { Drug } from '../db/types.ts';
import {
  buildDrugMasterDiffCsv,
  buildDrugMasterUpdateArtifacts,
  makeDrugMasterDiffCsvFileName,
  makeDrugMasterRollbackFileName,
  validateDrugMasterRollbackPayload
} from './drug_master_version.ts';

test('buildDrugMasterUpdateArtifacts summarizes changes and creates rollback payload', () => {
  const beforeRows: Drug[] = [
    {
      code: '001',
      name: 'A錠',
      yjCode: 'YJ001',
      isGeneric: false,
      isAbolished: false,
      price: 10
    },
    {
      code: '002',
      name: 'B錠',
      yjCode: 'YJ002',
      isGeneric: true,
      isAbolished: false,
      price: 20
    },
    {
      code: '004',
      name: '変更なし錠',
      yjCode: 'YJ004',
      isGeneric: false,
      isAbolished: false,
      price: 40
    }
  ];
  const afterRows: Drug[] = [
    {
      code: '001',
      name: 'A錠',
      yjCode: 'YJ001',
      isGeneric: false,
      isAbolished: false,
      price: 11
    },
    {
      code: '002',
      name: 'B錠',
      yjCode: 'YJ002',
      isGeneric: true,
      isAbolished: true,
      price: 20
    },
    {
      code: '003',
      name: 'C錠',
      yjCode: 'YJ003',
      isGeneric: false,
      isAbolished: false,
      price: 30
    },
    beforeRows[2]
  ];

  const artifacts = buildDrugMasterUpdateArtifacts({
    sourceFileName: 'iyakuhin.csv',
    beforeRows,
    afterRows,
    createdAt: new Date(2026, 5, 15, 1, 2, 3),
    sourceEvidence: {
      sourceFileName: 'iyakuhin.csv',
      sourceFileType: 'zip',
      extractedCsvFileName: 'y_all.csv',
      archiveEntryCount: 2,
      csvEntryCount: 1,
      sourceUrl: 'https://www.ssk.or.jp/download/index.html',
      fileSizeBytes: 1234,
      sha256: 'a'.repeat(64),
      capturedAt: '2026-06-15T01:02:03.000Z',
      layoutLabel: 'ヘッダー列名',
      rowCount: 4,
      skippedRowCount: 0,
      sourceUrlReviewLabel: '支払基金 医薬品マスター候補ファイル',
      specificationRevisionLabel: '支払基金 令和8年基本マスターファイルレイアウト 医薬品マスター: OK / 仕様PDF master_3_20260601.pdf',
      specificationSourceUrl: 'https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/index.files/master_3_20260601.pdf'
    }
  });

  assert.strictEqual(artifacts.versionId, '20260615_010203');
  assert.deepStrictEqual(artifacts.summary, {
    newCount: 1,
    updatedCount: 1,
    abolishedCount: 1,
    changedCount: 3
  });
  assert.deepStrictEqual(artifacts.changes.map((change) => [change.code, change.changeType]), [
    ['001', 'updated'],
    ['002', 'abolished'],
    ['003', 'new']
  ]);
  assert.deepStrictEqual(
    artifacts.rollback.restoreRows.map((row) => row.code),
    ['001', '002']
  );
  assert.deepStrictEqual(artifacts.rollback.deleteCodes, ['003']);
  assert.strictEqual(artifacts.rollback.sourceEvidence?.sha256, 'a'.repeat(64));
  assert.strictEqual(artifacts.rollback.sourceEvidence?.sourceFileType, 'zip');
  assert.strictEqual(artifacts.rollback.sourceEvidence?.extractedCsvFileName, 'y_all.csv');
  assert.strictEqual(artifacts.sourceEvidence?.layoutLabel, 'ヘッダー列名');
  assert.strictEqual(artifacts.sourceEvidence?.sourceUrlReviewLabel, '支払基金 医薬品マスター候補ファイル');
  assert.match(artifacts.sourceEvidence?.specificationRevisionLabel || '', /master_3_20260601\.pdf/);
  assert.strictEqual(artifacts.sourceEvidence?.specificationSourceUrl, 'https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/index.files/master_3_20260601.pdf');
  assert.strictEqual(makeDrugMasterDiffCsvFileName(artifacts.versionId), 'yakureki_drug_master_diff_20260615_010203.csv');
  assert.strictEqual(makeDrugMasterRollbackFileName(artifacts.versionId), 'yakureki_drug_master_rollback_20260615_010203.json');
});

test('buildDrugMasterDiffCsv exports reviewable CSV and escapes formula-like cells', () => {
  const artifacts = buildDrugMasterUpdateArtifacts({
    sourceFileName: 'iyakuhin.csv',
    beforeRows: [],
    afterRows: [
      {
        code: '777',
        name: '=危険な名前',
        yjCode: '@YJ777',
        isGeneric: false,
        isAbolished: false,
        price: 77
      }
    ],
    createdAt: new Date(2026, 5, 15, 1, 2, 3)
  });

  const csv = buildDrugMasterDiffCsv(artifacts);

  assert.match(csv, /^"区分","医薬品コード","医薬品名"/);
  assert.match(csv, /"新規","777","'=危険な名前"/);
  assert.match(csv, /"'@YJ777"/);
  assert.match(csv, /"ロールバック時は削除対象"/);
});

test('validateDrugMasterRollbackPayload accepts pharma-oss rollback JSON and strips extra fields', () => {
  const artifacts = buildDrugMasterUpdateArtifacts({
    sourceFileName: 'iyakuhin.csv',
    beforeRows: [
      {
        code: '001',
        name: 'A錠',
        isGeneric: false,
        price: 10
      }
    ],
    afterRows: [
      {
        code: '001',
        name: 'A錠',
        isGeneric: false,
        price: 11
      },
      {
        code: '003',
        name: 'C錠',
        isGeneric: false,
        price: 30
      }
    ],
    createdAt: new Date(2026, 5, 15, 1, 2, 3)
  });
  const raw = {
    ...artifacts.rollback,
    restoreRows: [
      {
        ...artifacts.rollback.restoreRows[0],
        unexpected: 'ignore me'
      }
    ]
  };

  const validation = validateDrugMasterRollbackPayload(raw);

  assert.strictEqual(validation.ok, true);
  if (!validation.ok) return;
  assert.deepStrictEqual(validation.payload.deleteCodes, ['003']);
  assert.strictEqual(validation.payload.sourceEvidence, undefined);
  assert.strictEqual((validation.payload.restoreRows[0] as any).unexpected, undefined);
});

test('validateDrugMasterRollbackPayload preserves source evidence', () => {
  const artifacts = buildDrugMasterUpdateArtifacts({
    sourceFileName: 'iyakuhin.csv',
    beforeRows: [],
    afterRows: [
      {
        code: '001',
        name: 'A錠',
        isGeneric: false,
        price: 10
      }
    ],
    createdAt: new Date(2026, 5, 15, 1, 2, 3),
    sourceEvidence: {
      sourceFileName: 'iyakuhin.csv',
      sourceFileType: 'zip',
      extractedCsvFileName: 'y_all.csv',
      archiveEntryCount: 2,
      csvEntryCount: 1,
      sourceUrl: 'https://www.ssk.or.jp/download/index.html',
      fileSizeBytes: 1234,
      sha256: 'b'.repeat(64),
      capturedAt: '2026-06-15T01:02:03.000Z',
      layoutLabel: '支払基金標準列',
      rowCount: 1,
      skippedRowCount: 0,
      sourceUrlReviewLabel: '支払基金 医薬品マスター掲載ページ',
      specificationRevisionLabel: '支払基金 令和8年基本マスターファイルレイアウト 医薬品マスター: OK / 仕様PDF master_3_20260601.pdf',
      specificationSourceUrl: 'https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/index.files/master_3_20260601.pdf'
    }
  });

  const validation = validateDrugMasterRollbackPayload(artifacts.rollback);

  assert.strictEqual(validation.ok, true);
  if (!validation.ok) return;
  assert.strictEqual(validation.payload.sourceEvidence?.sourceUrl, 'https://www.ssk.or.jp/download/index.html');
  assert.strictEqual(validation.payload.sourceEvidence?.sha256, 'b'.repeat(64));
  assert.strictEqual(validation.payload.sourceEvidence?.sourceFileType, 'zip');
  assert.strictEqual(validation.payload.sourceEvidence?.extractedCsvFileName, 'y_all.csv');
  assert.strictEqual(validation.payload.sourceEvidence?.archiveEntryCount, 2);
  assert.strictEqual(validation.payload.sourceEvidence?.csvEntryCount, 1);
  assert.strictEqual(validation.payload.sourceEvidence?.layoutLabel, '支払基金標準列');
  assert.strictEqual(validation.payload.sourceEvidence?.sourceUrlReviewLabel, '支払基金 医薬品マスター掲載ページ');
  assert.match(validation.payload.sourceEvidence?.specificationRevisionLabel || '', /master_3_20260601\.pdf/);
  assert.strictEqual(validation.payload.sourceEvidence?.specificationSourceUrl, 'https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/index.files/master_3_20260601.pdf');
});

test('validateDrugMasterRollbackPayload rejects unrelated JSON', () => {
  const validation = validateDrugMasterRollbackPayload({
    app: 'other',
    type: 'drug-master-rollback',
    version: 1
  });

  assert.strictEqual(validation.ok, false);
});
