import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildClaimWorkbenchCsv,
  buildClaimWorkbenchMemo,
  formatClaimWorkbenchDate,
  formatClaimWorkbenchMonth,
  getClaimLifecycleLatestEvent,
  getClaimWorkbenchActionLabel,
  getClaimWorkbenchPriority,
  isClaimWorkbenchClosable,
  isClaimWorkbenchUkeExportable,
  shouldIncludeInMonthlyClaimWorkbench
} from './claim_workbench.ts';
import { markClaimAccepted, markClaimExported, markClaimRebilling, markClaimReturned } from './claim_lifecycle.ts';

test('monthly claim workbench includes unclosed exported claims and lingering returns', () => {
  const basisDate = new Date('2026-06-20T12:00:00.000Z');
  const exported = markClaimExported({
    at: '2026-06-14T09:00:00.000Z',
    by: '薬剤師 一郎',
    fileName: 'RECEIPT_123.uke',
    totalPoints: 147
  });
  const oldReturned = markClaimReturned({
    current: exported,
    at: '2026-05-30T09:00:00.000Z',
    by: '薬剤師 二郎',
    reason: '保険番号相違'
  });
  const accepted = markClaimAccepted({
    current: exported,
    at: '2026-06-18T09:00:00.000Z',
    by: '管理者',
    receiptNumber: 'ACC-001'
  });

  assert.strictEqual(shouldIncludeInMonthlyClaimWorkbench({
    lifecycle: exported,
    issueDate: '2026-06-14T09:00:00.000Z',
    basisDate
  }), true);
  assert.strictEqual(shouldIncludeInMonthlyClaimWorkbench({
    lifecycle: exported,
    issueDate: '2026-05-14T09:00:00.000Z',
    basisDate
  }), true);
  assert.strictEqual(shouldIncludeInMonthlyClaimWorkbench({
    lifecycle: oldReturned,
    issueDate: '2026-05-10T09:00:00.000Z',
    basisDate
  }), true);
  assert.strictEqual(shouldIncludeInMonthlyClaimWorkbench({
    lifecycle: accepted,
    issueDate: '2026-06-14T09:00:00.000Z',
    basisDate
  }), true);
  assert.strictEqual(shouldIncludeInMonthlyClaimWorkbench({
    lifecycle: { status: 'closed' },
    issueDate: '2026-06-14T09:00:00.000Z',
    basisDate
  }), false);
});

test('claim workbench priority and action labels match claim states', () => {
  assert.strictEqual(getClaimWorkbenchPriority({
    status: 'returned',
    latestEventAt: '2026-06-19T09:00:00.000Z',
    basisDate: new Date('2026-06-20T09:00:00.000Z')
  }), 'high');
  assert.strictEqual(getClaimWorkbenchPriority({
    status: 'rebilling',
    latestEventAt: '2026-06-19T09:00:00.000Z',
    basisDate: new Date('2026-06-20T09:00:00.000Z')
  }), 'medium');
  assert.strictEqual(getClaimWorkbenchPriority({
    status: 'accepted',
    latestEventAt: '2026-06-19T09:00:00.000Z',
    basisDate: new Date('2026-06-20T09:00:00.000Z')
  }), 'normal');
  assert.strictEqual(getClaimWorkbenchPriority({
    status: 'exported',
    latestEventAt: '2026-06-01T09:00:00.000Z',
    basisDate: new Date('2026-06-20T09:00:00.000Z')
  }), 'medium');
  assert.strictEqual(getClaimWorkbenchActionLabel('returned'), '修正して再請求へ');
  assert.strictEqual(getClaimWorkbenchActionLabel('rebilling'), '月遅れ/UKE再出力');
  assert.strictEqual(getClaimWorkbenchActionLabel('accepted'), '入金確認後に締め');
  assert.strictEqual(getClaimWorkbenchActionLabel('exported'), '入金確認後に締め');
  assert.strictEqual(isClaimWorkbenchUkeExportable('returned'), false);
  assert.strictEqual(isClaimWorkbenchUkeExportable('rebilling'), true);
  assert.strictEqual(isClaimWorkbenchUkeExportable('accepted'), false);
  assert.strictEqual(isClaimWorkbenchUkeExportable('exported'), false);
  assert.strictEqual(isClaimWorkbenchClosable('accepted'), true);
  assert.strictEqual(isClaimWorkbenchClosable('exported'), false);
  assert.strictEqual(isClaimWorkbenchClosable('returned'), false);
  assert.strictEqual(isClaimWorkbenchClosable('rebilling'), false);
});

test('claim workbench formats dates and latest lifecycle event', () => {
  const exported = markClaimExported({
    at: '2026-06-14T09:00:00.000Z',
    by: '薬剤師 一郎',
    fileName: 'RECEIPT_123.uke',
    totalPoints: 147
  });
  const rebilling = markClaimRebilling({
    current: exported,
    at: '2026-06-15T10:00:00.000Z',
    by: '薬剤師 二郎',
    reason: '記号番号修正後に再請求'
  });

  assert.strictEqual(formatClaimWorkbenchDate('2026-06-14T09:00:00.000Z'), '2026/06/14');
  assert.strictEqual(formatClaimWorkbenchMonth('2026-06-14T09:00:00.000Z'), '2026年6月');
  assert.strictEqual(getClaimLifecycleLatestEvent(rebilling)?.type, 'rebilling');
});

test('claim workbench CSV and memo summarize monthly claim work safely', () => {
  const item = {
    visitId: 'visit_1',
    patientId: 'pt_1',
    patientName: '=山田 太郎',
    issueDateLabel: '2026/06/14',
    monthLabel: '2026年6月',
    statusLabel: '返戻対応',
    priorityLabel: '至急',
    totalPoints: 147,
    prescriptionCount: 3,
    exportedFileName: 'RECEIPT_123.uke',
    latestEventLabel: '返戻登録 2026/06/15',
    reason: '保険番号相違',
    actionLabel: '修正して再請求へ'
  };

  const csv = buildClaimWorkbenchCsv([item]);
  assert.match(csv, /^"優先度","請求状態","患者ID","患者名"/);
  assert.match(csv, /"'=山田 太郎"/);
  assert.match(csv, /"修正して再請求へ"/);
  const memo = buildClaimWorkbenchMemo([item]);
  assert.match(memo, /^月次請求ワークベンチ 1件/);
  assert.match(memo, /至急: =山田 太郎 \/ 返戻対応 \/ 2026\/06\/14 \/ 147点 \/ 修正して再請求へ/);
});
