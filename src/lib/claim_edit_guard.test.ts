import { test } from 'node:test';
import assert from 'node:assert';
import { markClaimAccepted, markClaimExported, markClaimRebilling, markClaimReturned } from './claim_lifecycle.ts';
import { canEditClaimScopedData, getClaimEditBlockedMessage, isClaimEditBlocked } from './claim_edit_guard.ts';

test('claim edit guard blocks exported and accepted claims', () => {
  const exported = markClaimExported({
    at: '2026-06-14T09:00:00.000Z',
    by: '薬剤師 一郎',
    fileName: 'MONTHLY_CLAIM.uke',
    totalPoints: 147
  });
  const accepted = markClaimAccepted({
    current: exported,
    at: '2026-06-14T10:00:00.000Z',
    by: '管理者',
    receiptNumber: 'ACC-001'
  });

  assert.strictEqual(isClaimEditBlocked(exported), true);
  assert.strictEqual(isClaimEditBlocked(accepted), true);
  assert.strictEqual(canEditClaimScopedData(accepted), false);
  assert.match(getClaimEditBlockedMessage(accepted, 'stock'), /在庫引き落とし/);
  assert.match(getClaimEditBlockedMessage(accepted, 'stock'), /再請求\/月遅れ準備/);
});

test('claim edit guard allows returned and rebilling claims', () => {
  const exported = markClaimExported({
    at: '2026-06-14T09:00:00.000Z',
    by: '薬剤師 一郎',
    fileName: 'MONTHLY_CLAIM.uke',
    totalPoints: 147
  });
  const returned = markClaimReturned({
    current: exported,
    at: '2026-06-15T09:00:00.000Z',
    by: '薬剤師 二郎',
    reason: '保険番号相違'
  });
  const rebilling = markClaimRebilling({
    current: returned,
    at: '2026-06-15T10:00:00.000Z',
    by: '薬剤師 二郎',
    reason: '再請求準備'
  });

  assert.strictEqual(isClaimEditBlocked(returned), false);
  assert.strictEqual(canEditClaimScopedData(rebilling), true);
});

// --- P3 昇格分 ---
// PrintPickingFlow.test.ts が「emr page blocks locked claims before prescription,
// picking, soap, and stock changes」としてソース文字列でしか見ていなかった契約を、
// 純粋関数への直接テストへ昇格する。

test('claim edit guard blocks every edit scope while the claim is locked', () => {
  const exported = markClaimExported({
    at: '2026-06-14T09:00:00.000Z',
    by: '薬剤師 一郎',
    fileName: 'MONTHLY_CLAIM.uke',
    totalPoints: 147
  });

  const scopes = ['billing', 'prescription', 'soap', 'picking', 'stock'] as const;
  for (const scope of scopes) {
    assert.strictEqual(
      canEditClaimScopedData(exported),
      false,
      `${scope}: ロック中は編集不可であること`
    );
    const message = getClaimEditBlockedMessage(exported, scope);
    assert.match(message, /ロックされています/, `${scope}: ロック理由が示されること`);
    assert.match(message, /返戻登録または再請求/, `${scope}: 解除手順が示されること`);
  }
});

test('claim edit blocked message names the scope and the exported file', () => {
  const exported = markClaimExported({
    at: '2026-06-14T09:00:00.000Z',
    by: '薬剤師 一郎',
    fileName: 'RECEIPT_2026_06.uke',
    totalPoints: 147
  });

  // 薬剤師がどの操作を止められたのか分かるよう、スコープ名が本文に出ること。
  assert.match(getClaimEditBlockedMessage(exported, 'prescription'), /処方内容を変更/);
  assert.match(getClaimEditBlockedMessage(exported, 'soap'), /薬歴を変更/);
  assert.match(getClaimEditBlockedMessage(exported, 'picking'), /ピッキング照合を変更/);
  assert.match(getClaimEditBlockedMessage(exported, 'stock'), /在庫引き落としを変更/);
  // どのファイルの請求でロックされたのかも示すこと。
  assert.match(getClaimEditBlockedMessage(exported, 'billing'), /RECEIPT_2026_06\.uke/);
});

test('claim edit guard treats a closed claim as locked', () => {
  // closed は exported / accepted と並ぶロック状態だが、既存テストで未検証だった。
  const closed = { status: 'closed' as const };
  assert.strictEqual(isClaimEditBlocked(closed), true);
  assert.strictEqual(canEditClaimScopedData(closed), false);
});

test('claim edit guard allows editing when no lifecycle has started', () => {
  // 未出力(undefined / draft)は通常業務なので、ここを塞ぐと受付ができなくなる。
  assert.strictEqual(canEditClaimScopedData(undefined), true);
  assert.strictEqual(canEditClaimScopedData(null), true);
  assert.strictEqual(canEditClaimScopedData({ status: 'draft' }), true);
});
