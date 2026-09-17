import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildDosageCategoryConflictReview,
  buildDosageCategoryConflictCsv,
  makeDosageCategoryConflictCsvFileName,
  formatDosageCategoryConflictSummary,
  type DosageCategoryConflictInput,
  type DosageCategoryConflictPoints
} from './dosage_category_conflict.ts';

test('buildDosageCategoryConflictReview detects mismatch between calculation and print categories', () => {
  const inputs: DosageCategoryConflictInput[] = [
    {
      visitId: 'visit-1',
      rpNumber: 1,
      drugName: 'テスト錠',
      usage: '1日3回毎食後',
      dosageCategory: 'internal',
      dosageCategorySource: 'auto'
    },
    {
      // 手動で「内服」と指定したが、用法に「点眼」が含まれるため算定側legacyは外用とみなすケース
      visitId: 'visit-2',
      rpNumber: 1,
      drugName: '点眼テスト液',
      usage: '1日1回点眼',
      dosageCategory: 'internal',
      dosageCategorySource: 'manual'
    },
    {
      // 外用一致ケース
      visitId: 'visit-2',
      rpNumber: 2,
      drugName: '軟膏テスト',
      usage: '1日2回塗布',
      dosageCategory: 'external',
      dosageCategorySource: 'manual'
    }
  ];

  // points を渡さない場合の検証
  const reviewWithoutPoints = buildDosageCategoryConflictReview(inputs);
  assert.strictEqual(reviewWithoutPoints.checkedItemCount, 3);
  assert.strictEqual(reviewWithoutPoints.cases.length, 1);
  assert.strictEqual(reviewWithoutPoints.affectedVisitCount, 1);
  assert.strictEqual(reviewWithoutPoints.pointsChangedVisitCount, 0);
  assert.strictEqual(reviewWithoutPoints.netDeltaPoints, 0);
  assert.deepStrictEqual(reviewWithoutPoints.deltaPointsByVisitId, {});

  const conflictCase = reviewWithoutPoints.cases[0];
  assert.strictEqual(conflictCase.visitId, 'visit-2');
  assert.strictEqual(conflictCase.rpNumber, 1);
  assert.strictEqual(conflictCase.calculationCategoryLabel, '外用');
  assert.strictEqual(conflictCase.printCategoryLabel, '内服');

  // points を渡した場合の検証
  const points: DosageCategoryConflictPoints[] = [
    {
      visitId: 'visit-2',
      legacyPoints: 120,
      respectManualPoints: 100 // -20点
    }
  ];

  const reviewWithPoints = buildDosageCategoryConflictReview(inputs, points);
  assert.strictEqual(reviewWithPoints.checkedItemCount, 3);
  assert.strictEqual(reviewWithPoints.cases.length, 1);
  assert.strictEqual(reviewWithPoints.affectedVisitCount, 1);
  assert.strictEqual(reviewWithPoints.pointsChangedVisitCount, 1);
  assert.strictEqual(reviewWithPoints.netDeltaPoints, -20);
  assert.strictEqual(reviewWithPoints.deltaPointsByVisitId['visit-2'], -20);
});

test('buildDosageCategoryConflictCsv generates valid CSV without personal data or drug names', () => {
  const inputs: DosageCategoryConflictInput[] = [
    {
      visitId: 'visit-xyz',
      rpNumber: 3,
      drugName: '秘密の薬品名A',
      usage: '1日1回点眼',
      dosageCategory: 'internal',
      dosageCategorySource: 'manual'
    }
  ];
  const points: DosageCategoryConflictPoints[] = [
    {
      visitId: 'visit-xyz',
      legacyPoints: 80,
      respectManualPoints: 110 // +30点
    }
  ];

  const review = buildDosageCategoryConflictReview(inputs, points);
  const csv = buildDosageCategoryConflictCsv(review);

  // 1. ヘッダー行とデータ行の構造検証
  const lines = csv.split('\r\n');
  assert.strictEqual(lines[0], '"受付ID","Rp番号","現行算定判定","実効剤形（帳票）","増減","点数差"');
  assert.strictEqual(lines[1], '"visit-xyz","3","外用","内服","増","30"');

  // 2. 個人情報（患者名・患者ID・薬品名）が含まれないことの厳格検証（金科玉条 第二条）
  assert.doesNotMatch(csv, /秘密の薬品名/);
  assert.doesNotMatch(csv, /患者/);
  assert.doesNotMatch(csv, /patient/i);
});

test('makeDosageCategoryConflictCsvFileName formats filename correctly', () => {
  const d = new Date(2026, 8, 17, 14, 30, 45); // 2026-09-17 14:30:45
  const fileName = makeDosageCategoryConflictCsvFileName(d);
  assert.strictEqual(fileName, 'dosage_category_conflict_20260917_143045.csv');
});

test('formatDosageCategoryConflictSummary formats summary text correctly', () => {
  const emptyReview = buildDosageCategoryConflictReview([]);
  assert.strictEqual(formatDosageCategoryConflictSummary(emptyReview), '点検対象の処方明細がありません。');

  const matchReview = buildDosageCategoryConflictReview([
    {
      visitId: 'v1',
      drugName: '通常薬',
      usage: '1日3回毎食後',
      dosageCategory: 'internal',
      dosageCategorySource: 'auto'
    }
  ]);
  assert.strictEqual(
    formatDosageCategoryConflictSummary(matchReview),
    '処方明細 1件を点検し、剤形判定の食い違いはありませんでした。'
  );

  const conflictReview = buildDosageCategoryConflictReview(
    [
      {
        visitId: 'v2',
        rpNumber: 1,
        drugName: 'テスト',
        usage: '1日1回点眼',
        dosageCategory: 'internal',
        dosageCategorySource: 'manual'
      }
    ],
    [{ visitId: 'v2', legacyPoints: 100, respectManualPoints: 85 }]
  );
  assert.strictEqual(
    formatDosageCategoryConflictSummary(conflictReview),
    '処方明細 1件のうち 1件（1受付）で算定と帳票の剤形判定が食い違っています / 点数変動 1受付（差引 -15点）。'
  );
});
