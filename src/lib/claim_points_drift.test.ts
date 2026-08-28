import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClaimPointsDriftCsv,
  buildClaimPointsDriftReview,
  formatClaimPointsDriftSummary,
  makeClaimPointsDriftCsvFileName
} from './claim_points_drift.ts';

// 算定を直すと、既に UKE を出した受付の点数が変わる。どの請求が影響を受けたかを
// 受付横断で出す。何を再提出するかは運用者が決めるので、ここでは並べるだけ。

const exported = (over: Partial<Parameters<typeof buildClaimPointsDriftReview>[0][number]> = {}) => ({
  visitId: 'v_1',
  patientName: '導入 テスト',
  dispensingDate: '2026-08-01',
  claimStatus: 'exported',
  exportedAt: '2026-08-10T01:00:00.000Z',
  exportedFileName: 'RECEIPTC.UKE',
  exportedPoints: 194,
  currentPoints: 417,
  ...over
});

test('a claim whose points have not moved is not listed', () => {
  const review = buildClaimPointsDriftReview([exported({ currentPoints: 194 })]);

  assert.equal(review.checkedCount, 1);
  assert.deepEqual(review.cases, []);
  assert.equal(review.netDeltaPoints, 0);
});

test('a claim that gained points is listed with the difference', () => {
  // 薬剤料が入るようになった受付。194点 → 417点 は実測値。
  const review = buildClaimPointsDriftReview([exported()]);

  assert.equal(review.cases.length, 1);
  assert.equal(review.cases[0].kind, 'increased');
  assert.equal(review.cases[0].exportedPoints, 194);
  assert.equal(review.cases[0].currentPoints, 417);
  assert.equal(review.cases[0].deltaPoints, 223);
  assert.equal(review.increasedCount, 1);
  assert.equal(review.netDeltaPoints, 223);
});

test('a claim that lost points is separated from one that gained', () => {
  const review = buildClaimPointsDriftReview([
    exported({ visitId: 'v_1', currentPoints: 417 }),
    exported({ visitId: 'v_2', currentPoints: 150 })
  ]);

  assert.deepEqual(review.cases.map((item) => [item.visitId, item.kind, item.deltaPoints]), [
    ['v_1', 'increased', 223],
    ['v_2', 'decreased', -44]
  ]);
  assert.equal(review.increasedCount, 1);
  assert.equal(review.decreasedCount, 1);
  // 差引は相殺した値。件数の代わりに使わないこと。
  assert.equal(review.netDeltaPoints, 179);
});

test('a claim that was never exported is not counted at all', () => {
  // 未出力の受付が混ざると「出力済み何件を突き合わせたか」の意味が変わる
  const review = buildClaimPointsDriftReview([
    exported(),
    { visitId: 'v_draft', currentPoints: 417 },
    { visitId: 'v_draft2', exportedPoints: undefined, currentPoints: 100 }
  ]);

  assert.equal(review.checkedCount, 1);
  assert.equal(review.cases.length, 1);
  assert.equal(review.cases[0].visitId, 'v_1');
});

test('a claim that cannot be recalculated is listed rather than dropped', () => {
  // 黙って落とすと「ずれが無かった」のと同じに見えてしまう
  const review = buildClaimPointsDriftReview([exported({ currentPoints: undefined })]);

  assert.equal(review.checkedCount, 1);
  assert.equal(review.cases[0].kind, 'unknown');
  assert.equal(review.cases[0].currentPoints, undefined);
  assert.equal(review.cases[0].deltaPoints, undefined);
  assert.equal(review.unknownCount, 1);
  assert.equal(review.netDeltaPoints, 0);
});

test('the largest difference comes first, and unrecalculable claims come before those', () => {
  const review = buildClaimPointsDriftReview([
    exported({ visitId: 'v_small', currentPoints: 200 }),
    exported({ visitId: 'v_big', currentPoints: 900 }),
    exported({ visitId: 'v_unknown', currentPoints: undefined }),
    exported({ visitId: 'v_mid', currentPoints: 50 })
  ]);

  // 差の絶対値の大きい順。増減の向きでは並べない（どちらも確認が要る）
  assert.deepEqual(review.cases.map((item) => item.visitId), ['v_unknown', 'v_big', 'v_mid', 'v_small']);
  assert.deepEqual(review.cases.map((item) => item.deltaPoints), [undefined, 706, -144, 6]);
});

test('claims with the same difference keep a stable order', () => {
  const review = buildClaimPointsDriftReview([
    exported({ visitId: 'v_b', currentPoints: 200 }),
    exported({ visitId: 'v_a', currentPoints: 200 })
  ]);

  assert.deepEqual(review.cases.map((item) => item.visitId), ['v_a', 'v_b']);
});

test('missing labels fall back instead of showing blanks', () => {
  const review = buildClaimPointsDriftReview([
    { visitId: 'v_1', exportedPoints: 100, currentPoints: 120 }
  ]);

  assert.equal(review.cases[0].patientName, '（患者名なし）');
  assert.equal(review.cases[0].dispensingDate, '不明');
  assert.equal(review.cases[0].exportedAt, '不明');
  assert.equal(review.cases[0].claimStatus, '不明');
});

test('the summary states what was compared, not only what moved', () => {
  assert.equal(formatClaimPointsDriftSummary(buildClaimPointsDriftReview([])), '出力済みの請求がありません。');
  assert.equal(
    formatClaimPointsDriftSummary(buildClaimPointsDriftReview([exported({ currentPoints: 194 })])),
    '出力済み 1件を突き合わせ、点数のずれはありませんでした。'
  );

  const mixed = formatClaimPointsDriftSummary(buildClaimPointsDriftReview([
    exported({ visitId: 'v_1' }),
    exported({ visitId: 'v_2', currentPoints: 150 }),
    exported({ visitId: 'v_3', currentPoints: undefined })
  ]));
  assert.match(mixed, /出力済み 3件のうち 3件/);
  assert.match(mixed, /増 1件/);
  assert.match(mixed, /減 1件/);
  assert.match(mixed, /再計算できず 1件/);
  assert.match(mixed, /差引 \+179点/);
});

test('the csv carries the difference with its sign and is safe to open', () => {
  const csv = buildClaimPointsDriftCsv(buildClaimPointsDriftReview([
    exported({ visitId: '=cmd', currentPoints: 417 }),
    exported({ visitId: 'v_2', currentPoints: undefined })
  ]));
  const lines = csv.split('\n');

  assert.match(lines[0], /^"受付ID","患者名"/);
  // 再計算できなかった受付が先頭に来る
  assert.match(lines[1], /^"v_2"/);
  assert.match(lines[1], /"","","再計算できず"$/);
  // 表計算ソフトが数式として解釈しないこと
  assert.match(lines[2], /^"'=cmd"/);
  // 差は数値のまま。表計算で合計できるようにする
  assert.match(lines[2], /"223","増"$/);

  const negative = buildClaimPointsDriftCsv(buildClaimPointsDriftReview([exported({ currentPoints: 150 })]));
  assert.match(negative.split('\n')[1], /"-44","減"$/);
});

test('the csv file name carries the moment it was taken', () => {
  assert.equal(
    makeClaimPointsDriftCsvFileName(new Date(2026, 7, 28, 9, 5, 3)),
    'yakureki_claim_points_drift_20260828_090503.csv'
  );
});
