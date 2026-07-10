import { test } from 'node:test';
import assert from 'node:assert';
import {
  CLAIM_LIFECYCLE_STATUS_LABELS,
  getClaimLifecycleStatus,
  isClaimLifecycleLocked,
  markClaimAccepted,
  markClaimClosed,
  markClaimExported,
  markClaimRebilling,
  markClaimReturned
} from './claim_lifecycle.ts';

test('claim lifecycle defaults to editable draft before UKE export', () => {
  assert.strictEqual(getClaimLifecycleStatus(undefined), 'draft');
  assert.strictEqual(CLAIM_LIFECYCLE_STATUS_LABELS.draft, '請求前');
  assert.strictEqual(isClaimLifecycleLocked(undefined), false);
});

test('markClaimExported locks the claim and records UKE metadata', () => {
  const exported = markClaimExported({
    at: '2026-06-14T09:00:00.000Z',
    by: '薬剤師 一郎',
    fileName: 'RECEIPT_123.uke',
    totalPoints: 147,
    exportSnapshot: {
      createdAt: '2026-06-14T09:00:00.000Z',
      visitId: 'visit_1',
      patientId: 'pt_1',
      patientName: '山田 太郎',
      patientBirthDate: '1980-01-02',
      issueDate: '2026-06-14T09:00:00.000Z',
      totalPoints: 147,
      prescriptionItems: [
        {
          itemId: 'item_1',
          drugId: 'drug_1',
          amount: 1,
          days: 7
        }
      ]
    }
  });

  assert.strictEqual(exported.status, 'exported');
  assert.strictEqual(exported.lockedAt, '2026-06-14T09:00:00.000Z');
  assert.strictEqual(exported.exportedFileName, 'RECEIPT_123.uke');
  assert.strictEqual(exported.exportSnapshot?.patientName, '山田 太郎');
  assert.strictEqual(isClaimLifecycleLocked(exported), true);
  assert.strictEqual(exported.history?.[0].type, 'exported');
});

test('markClaimAccepted keeps exported claims locked with receipt metadata', () => {
  const exported = markClaimExported({
    at: '2026-06-14T09:00:00.000Z',
    by: '薬剤師 一郎',
    fileName: 'RECEIPT_123.uke',
    totalPoints: 147
  });
  const accepted = markClaimAccepted({
    current: exported,
    at: '2026-06-14T10:00:00.000Z',
    by: '管理者',
    receiptNumber: 'ACC-001'
  });

  assert.strictEqual(accepted.status, 'accepted');
  assert.strictEqual(CLAIM_LIFECYCLE_STATUS_LABELS.accepted, '受付済');
  assert.strictEqual(accepted.acceptanceReceiptNumber, 'ACC-001');
  assert.strictEqual(accepted.lockedAt, '2026-06-14T09:00:00.000Z');
  assert.strictEqual(isClaimLifecycleLocked(accepted), true);
  assert.deepStrictEqual(accepted.history?.map((event) => event.type), ['exported', 'accepted']);
});


test('returned and rebilling states unlock claim edits while preserving history', () => {
  const exported = markClaimExported({
    at: '2026-06-14T09:00:00.000Z',
    by: '薬剤師 一郎',
    fileName: 'RECEIPT_123.uke',
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
    reason: '記号番号修正後に再請求'
  });

  assert.strictEqual(returned.status, 'returned');
  assert.strictEqual(isClaimLifecycleLocked(returned), false);
  assert.strictEqual(rebilling.status, 'rebilling');
  assert.strictEqual(isClaimLifecycleLocked(rebilling), false);
  assert.deepStrictEqual(rebilling.history?.map((event) => event.type), ['exported', 'returned', 'rebilling']);
});

test('markClaimClosed locks completed claims', () => {
  const closed = markClaimClosed({
    current: { status: 'exported', lockedAt: '2026-06-14T09:00:00.000Z' },
    at: '2026-06-20T09:00:00.000Z',
    by: '管理者'
  });

  assert.strictEqual(closed.status, 'closed');
  assert.strictEqual(closed.lockedAt, '2026-06-14T09:00:00.000Z');
  assert.strictEqual(isClaimLifecycleLocked(closed), true);
  assert.strictEqual(closed.history?.[0].type, 'closed');
});
