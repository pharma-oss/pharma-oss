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
