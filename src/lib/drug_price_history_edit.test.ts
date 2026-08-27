import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDrugPriceHistoryEditAuditDetail,
  buildDrugPriceHistoryEditPlan,
  isSubmittedClaimStatus,
  parseDrugPriceHistoryDraft,
  toDrugPriceHistoryDraft,
  type DrugPriceHistoryEditTarget
} from './drug_price_history_edit.ts';
import type { DrugPriceRevision } from './drug_price_history.ts';

// 版を直すと過去の調剤の薬剤料が変わる。
// 「何件変わるか」「うち提出済みが何件か」を出せることが、この計画の目的。

const history: DrugPriceRevision[] = [
  { price: 13.2 },
  { price: 11.7, effectiveFrom: '2024-04-01' },
  { price: 10.1, effectiveFrom: '2026-04-01' }
];

const drug = { code: '620000001', name: 'アムロジピン錠5mg', price: 10.1, priceHistory: history };

function target(overrides: Partial<DrugPriceHistoryEditTarget> = {}): DrugPriceHistoryEditTarget {
  return {
    itemId: 'item_1',
    visitId: 'visit_1',
    dispensingDate: '2025-06-01',
    ...overrides
  };
}

test('an edit round-trips through the draft rows without changing anything', () => {
  const plan = buildDrugPriceHistoryEditPlan({
    drug,
    draft: toDrugPriceHistoryDraft(history),
    targets: []
  });

  assert.deepEqual(plan.after, history);
  assert.equal(plan.changed, false);
  // 変わっていないものを適用させない (監査ログに中身の無い記録が残る)
  assert.equal(plan.canApply, false);
});

test('a blank effective date means the revision with no known start', () => {
  const parsed = parseDrugPriceHistoryDraft([
    { price: '10.1', effectiveFrom: '2026-04-01' },
    { price: '13.2', effectiveFrom: '  ' }
  ]);

  assert.deepEqual(parsed.revisions, [
    { price: 13.2 },
    { price: 10.1, effectiveFrom: '2026-04-01' }
  ]);
  assert.deepEqual(parsed.issues, []);
});

test('rows left entirely blank are not entries', () => {
  const parsed = parseDrugPriceHistoryDraft([
    { price: '', effectiveFrom: '' },
    { price: '10.1', effectiveFrom: '2026-04-01' },
    { price: '  ', effectiveFrom: '   ' }
  ]);

  assert.deepEqual(parsed.revisions, [{ price: 10.1, effectiveFrom: '2026-04-01' }]);
  assert.deepEqual(parsed.issues, []);
});

test('a row with a date but no price is an error, not a silently dropped row', () => {
  // 黙って捨てると、入れたはずの版が消えたことに気づけない
  const parsed = parseDrugPriceHistoryDraft([{ price: '', effectiveFrom: '2026-04-01' }]);

  assert.deepEqual(parsed.revisions, []);
  assert.equal(parsed.issues.length, 1);
  assert.equal(parsed.issues[0].code, 'price_invalid');
  assert.equal(parsed.issues[0].rowIndex, 0);
});

test('a price that is not a positive number is rejected', () => {
  for (const price of ['0', '-1', 'abc', 'NaN']) {
    const parsed = parseDrugPriceHistoryDraft([{ price, effectiveFrom: '2026-04-01' }]);
    assert.equal(parsed.issues[0]?.code, 'price_invalid', `${price} を通してはいけない`);
  }
  assert.deepEqual(
    parseDrugPriceHistoryDraft([{ price: ' 10.1 ', effectiveFrom: '2026-04-01' }]).revisions,
    [{ price: 10.1, effectiveFrom: '2026-04-01' }]
  );
});

test('a date that is not a real calendar day is rejected', () => {
  for (const effectiveFrom of ['2026-02-30', '2026-13-01', '2026/04/01', '20260401', '2026-4-1']) {
    const parsed = parseDrugPriceHistoryDraft([{ price: '10.1', effectiveFrom }]);
    assert.equal(parsed.issues[0]?.code, 'date_invalid', `${effectiveFrom} を通してはいけない`);
  }
  // うるう日は通す
  assert.deepEqual(
    parseDrugPriceHistoryDraft([{ price: '10.1', effectiveFrom: '2024-02-29' }]).revisions,
    [{ price: 10.1, effectiveFrom: '2024-02-29' }]
  );
});

test('two revisions with no start date cannot be ordered, so it is an error', () => {
  const parsed = parseDrugPriceHistoryDraft([
    { price: '13.2', effectiveFrom: '' },
    { price: '12.0', effectiveFrom: '' }
  ]);

  assert.equal(parsed.issues.some((issue) => issue.code === 'unknown_start_duplicated'), true);
  assert.equal(parsed.issues.find((issue) => issue.code === 'unknown_start_duplicated')?.rowIndex, 1);
});

test('two revisions sharing an effective date is an error', () => {
  const parsed = parseDrugPriceHistoryDraft([
    { price: '11.7', effectiveFrom: '2024-04-01' },
    { price: '10.1', effectiveFrom: '2024-04-01' }
  ]);

  const issue = parsed.issues.find((entry) => entry.code === 'date_duplicated');
  assert.ok(issue);
  assert.equal(issue.rowIndex, 1);
});

test('a revision that repeats the price before it is flagged but still applies', () => {
  const parsed = parseDrugPriceHistoryDraft([
    { price: '11.7', effectiveFrom: '2024-04-01' },
    { price: '11.7', effectiveFrom: '2026-04-01' }
  ]);

  const issue = parsed.issues.find((entry) => entry.code === 'price_unchanged');
  assert.ok(issue);
  assert.equal(issue.severity, 'warning');
  assert.match(issue.message, /適用 2026-04-01/);
});

test('a history with no dated revision resolves the same on every dispensing date', () => {
  const parsed = parseDrugPriceHistoryDraft([{ price: '13.2', effectiveFrom: '' }]);

  const issue = parsed.issues.find((entry) => entry.code === 'no_dated_revision');
  assert.ok(issue);
  assert.equal(issue.severity, 'warning');
  // 版が空なら警告は出ない (版を持たない薬品は正常)
  assert.deepEqual(parseDrugPriceHistoryDraft([]).issues, []);
});

test('the plan counts the dispensings whose price the edit moves', () => {
  // 2024-04-01 の版を 11.7 → 12.5 に直す
  const plan = buildDrugPriceHistoryEditPlan({
    drug,
    draft: [
      { price: '13.2', effectiveFrom: '' },
      { price: '12.5', effectiveFrom: '2024-04-01' },
      { price: '10.1', effectiveFrom: '2026-04-01' }
    ],
    targets: [
      target({ itemId: 'moved', dispensingDate: '2025-06-01' }),
      target({ itemId: 'after_the_next_revision', dispensingDate: '2026-06-01' }),
      target({ itemId: 'before_every_revision', dispensingDate: '2020-01-01' })
    ]
  });

  assert.equal(plan.canApply, true);
  assert.deepEqual(plan.impact.map((row) => row.itemId), ['moved']);
  assert.deepEqual(
    plan.impact.map((row) => [row.beforePrice, row.afterPrice]),
    [[11.7, 12.5]]
  );
  assert.equal(plan.submittedCount, 0);
});

test('dispensings already sent out are counted separately and warned about', () => {
  const plan = buildDrugPriceHistoryEditPlan({
    drug,
    draft: [
      { price: '13.2', effectiveFrom: '' },
      { price: '12.5', effectiveFrom: '2024-04-01' },
      { price: '10.1', effectiveFrom: '2026-04-01' }
    ],
    targets: [
      target({ itemId: 'draft', claimStatus: 'draft' }),
      target({ itemId: 'no_status' }),
      target({ itemId: 'exported', claimStatus: 'exported' }),
      target({ itemId: 'returned', claimStatus: 'returned' })
    ]
  });

  assert.equal(plan.impact.length, 4);
  assert.equal(plan.submittedCount, 2);
  const issue = plan.issues.find((entry) => entry.code === 'submitted_claim_affected');
  assert.ok(issue);
  assert.match(issue.message, /2件/);
});

test('a returned or rebilled claim counts as already sent out', () => {
  assert.equal(isSubmittedClaimStatus(undefined), false);
  assert.equal(isSubmittedClaimStatus('draft'), false);
  for (const status of ['exported', 'accepted', 'returned', 'rebilling', 'closed']) {
    assert.equal(isSubmittedClaimStatus(status), true, status);
  }
});

test('an item pinned to a chosen revision keeps its price and is reported as orphaned', () => {
  // 上書きは適用した薬価を持っているので点数は動かない。
  // ただし版そのものが消えると、存在しない版を指したままになる。
  const plan = buildDrugPriceHistoryEditPlan({
    drug,
    draft: [
      { price: '13.2', effectiveFrom: '' },
      { price: '10.1', effectiveFrom: '2026-04-01' }
    ],
    targets: [target({ drugPriceOverride: { price: 11.7, effectiveFrom: '2024-04-01' } })]
  });

  assert.deepEqual(plan.impact, []);
  const issue = plan.issues.find((entry) => entry.code === 'override_orphaned');
  assert.ok(issue);
  assert.match(issue.message, /1件/);
});

test('an item pinned to a revision that survives the edit is not orphaned', () => {
  const plan = buildDrugPriceHistoryEditPlan({
    drug,
    draft: [
      { price: '13.2', effectiveFrom: '' },
      { price: '12.5', effectiveFrom: '2024-04-01' },
      { price: '10.1', effectiveFrom: '2026-04-01' }
    ],
    targets: [
      target({ drugPriceOverride: { price: 11.7, effectiveFrom: '2024-04-01' } }),
      target({ itemId: 'pinned_to_unknown_start', drugPriceOverride: { price: 13.2 } })
    ]
  });

  assert.equal(plan.issues.some((entry) => entry.code === 'override_orphaned'), false);
});

test('the current price follows the newest dated revision, not the newest row', () => {
  // 開始日不明の版だけを残す訂正では、現在薬価を決められる版が無くなる
  const cleared = buildDrugPriceHistoryEditPlan({
    drug,
    draft: [{ price: '13.2', effectiveFrom: '' }],
    targets: []
  });
  assert.equal(cleared.afterCurrentPrice, 10.1, '決められないなら現在薬価は据え置く');

  const corrected = buildDrugPriceHistoryEditPlan({
    drug,
    draft: [
      { price: '11.7', effectiveFrom: '2024-04-01' },
      { price: '9.8', effectiveFrom: '2026-04-01' }
    ],
    targets: []
  });
  assert.equal(corrected.afterCurrentPrice, 9.8);
});

test('an edit that only errors cannot be applied', () => {
  const plan = buildDrugPriceHistoryEditPlan({
    drug,
    draft: [{ price: '-1', effectiveFrom: '2024-04-01' }],
    targets: []
  });

  assert.equal(plan.canApply, false);
  assert.equal(plan.issues.some((issue) => issue.severity === 'error'), true);
});

test('warnings alone do not block the edit', () => {
  // 「意味の無い版を消す」ための訂正まで止めてしまう
  const plan = buildDrugPriceHistoryEditPlan({
    drug,
    draft: [
      { price: '11.7', effectiveFrom: '2024-04-01' },
      { price: '11.7', effectiveFrom: '2026-04-01' }
    ],
    targets: []
  });

  assert.equal(plan.issues.some((issue) => issue.severity === 'warning'), true);
  assert.equal(plan.issues.some((issue) => issue.severity === 'error'), false);
  assert.equal(plan.canApply, true);
});

test('clearing every revision is a legitimate edit', () => {
  const plan = buildDrugPriceHistoryEditPlan({ drug, draft: [], targets: [] });

  assert.deepEqual(plan.after, []);
  assert.equal(plan.canApply, true);
  // 版が無くなったら現在薬価で解決される
  assert.equal(plan.afterCurrentPrice, 10.1);
});

test('the audit detail names both sides of the edit and the impact', () => {
  const plan = buildDrugPriceHistoryEditPlan({
    drug,
    draft: [
      { price: '13.2', effectiveFrom: '' },
      { price: '10.1', effectiveFrom: '2026-04-01' }
    ],
    targets: [target({ claimStatus: 'exported' })]
  });

  const detail = buildDrugPriceHistoryEditAuditDetail(plan);
  assert.match(detail, /アムロジピン錠5mg.*620000001/);
  assert.match(detail, /訂正前: 13\.2円（開始日不明・最初の改定より前） \/ 11\.7円（適用 2024-04-01） \/ 10\.1円（適用 2026-04-01）/);
  assert.match(detail, /訂正後: 13\.2円（開始日不明・最初の改定より前） \/ 10\.1円（適用 2026-04-01）/);
  assert.match(detail, /版 3件 → 2件/);
  assert.match(detail, /うち提出済み 1件/);
});

test('the audit detail says so when a drug had no revisions at all', () => {
  const plan = buildDrugPriceHistoryEditPlan({
    drug: { code: '620000002', name: '新規薬品', price: 8.2 },
    draft: [{ price: '8.2', effectiveFrom: '2026-04-01' }],
    targets: []
  });

  assert.match(buildDrugPriceHistoryEditAuditDetail(plan), /訂正前: なし/);
});

test('rows entered out of order are sorted before they become revisions', () => {
  // 画面では行を足した順に並ぶ。入力順のまま保存すると調剤日で引けなくなる。
  const parsed = parseDrugPriceHistoryDraft([
    { price: '10.1', effectiveFrom: '2026-04-01' },
    { price: '13.2', effectiveFrom: '2022-04-01' },
    { price: '11.7', effectiveFrom: '2024-04-01' }
  ]);

  assert.deepEqual(parsed.revisions.map((revision) => revision.effectiveFrom), [
    '2022-04-01',
    '2024-04-01',
    '2026-04-01'
  ]);
});

test('an item pinned to a revision is left out of the impact even when the history moves', () => {
  // 上書きは適用した薬価を持つので、版をどう直しても点数は動かない。
  // ここを自動解決で測ると、動かない明細まで「変わる」と出てしまう。
  const plan = buildDrugPriceHistoryEditPlan({
    drug,
    draft: [
      { price: '13.2', effectiveFrom: '' },
      { price: '12.5', effectiveFrom: '2024-04-01' },
      { price: '10.1', effectiveFrom: '2026-04-01' }
    ],
    targets: [target({ drugPriceOverride: { price: 20, effectiveFrom: '2024-04-01' } })]
  });

  assert.deepEqual(plan.impact, []);
});

test('applying an unchanged draft still repairs a current price that drifted from the history', () => {
  // 取込の不具合で price と履歴がずれた薬品を、版を触らずに直せること
  const drifted = { code: '620000001', name: 'アムロジピン錠5mg', price: 99.9, priceHistory: history };
  const plan = buildDrugPriceHistoryEditPlan({
    drug: drifted,
    draft: toDrugPriceHistoryDraft(history),
    targets: []
  });

  assert.deepEqual(plan.after, history);
  assert.equal(plan.beforeCurrentPrice, 99.9);
  assert.equal(plan.afterCurrentPrice, 10.1);
  assert.equal(plan.changed, true);
  assert.equal(plan.canApply, true);
});

test('moving a revision to another date is a change even though the prices match', () => {
  const plan = buildDrugPriceHistoryEditPlan({
    drug: { code: '620000001', name: 'テスト', price: 11.7, priceHistory: [{ price: 11.7, effectiveFrom: '2024-04-01' }] },
    draft: [{ price: '11.7', effectiveFrom: '2025-04-01' }],
    targets: [target({ itemId: 'between_the_two_dates', dispensingDate: '2024-06-01' })]
  });

  assert.equal(plan.changed, true);
  assert.equal(plan.canApply, true);
  // 版が動いた期間の調剤は、記録から推定へ落ちるが薬価は同じなので影響には出ない
  assert.deepEqual(plan.impact, []);
});
