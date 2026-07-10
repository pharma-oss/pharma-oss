import { test } from 'node:test';
import assert from 'node:assert';
import type { AuditLog } from '../db/types.ts';
import {
  buildOperationalClosingMonthlyReview,
  buildOperationalClosingMonthlyReviewCsv,
  buildOperationalClosingStoreBenchmarkActionAuditDetail,
  buildOperationalClosingStoreBenchmarkActionPostponementAuditDetail,
  buildOperationalClosingStoreBenchmarkBiExport
} from './operational_closing_review.ts';

const logs: AuditLog[] = [
  {
    logId: 'log_1',
    timestamp: '2026-06-15T11:00:00.000Z',
    userId: 'pharm_1',
    userName: '薬剤師 一郎',
    userRole: 'pharmacist',
    actionType: 'daily_closing_approval',
    details: '日次締め承認: 2026/06/15 20:00 / 確認者 薬剤師 一郎 / 本日完了率 80% (8/10件完了) / 閉店前残タスク 2 (残タスク 2件) / 月次請求締め率 90% (9/10件締め) / 在庫不足 1品目 / 入庫登録 0件 / 服薬フォロー 1件 / 問い合わせ負荷 2件',
    integrityHash: 'hash_1'
  },
  {
    logId: 'log_2',
    timestamp: '2026-06-16T11:00:00.000Z',
    userId: 'admin_1',
    userName: '管理者',
    userRole: 'admin',
    actionType: 'daily_closing_approval',
    details: '日次締め承認: 2026/06/16 20:00 / 確認者 管理者 / 本日完了率 100% (12/12件完了) / 閉店前残タスク 0 (主要キュー0件) / 月次請求締め率 100% (10/10件締め) / 在庫不足 0品目 / 入庫登録 2件 / 服薬フォロー 0件 / 問い合わせ負荷 0件',
    integrityHash: 'hash_2'
  },
  {
    logId: 'log_other_month',
    timestamp: '2026-05-31T11:00:00.000Z',
    userId: 'admin_1',
    userName: '管理者',
    userRole: 'admin',
    actionType: 'daily_closing_approval',
    details: '日次締め承認: 2026/05/31 20:00 / 本日完了率 50% / 閉店前残タスク 5 / 在庫不足 3品目 / 入庫登録 1件 / 服薬フォロー 2件 / 問い合わせ負荷 3件'
  },
  {
    logId: 'log_patient',
    timestamp: '2026-06-16T12:00:00.000Z',
    userId: 'pharm_1',
    userName: '薬剤師 一郎',
    userRole: 'pharmacist',
    actionType: 'claim_lifecycle',
    patientId: 'pt_1',
    patientName: '山田 太郎',
    details: '請求状態変更'
  }
];

test('buildOperationalClosingMonthlyReview summarizes this month daily closing approvals', () => {
  const review = buildOperationalClosingMonthlyReview(logs, new Date('2026-06-20T12:00:00+09:00'));

  assert.strictEqual(review.monthKey, '2026-06');
  assert.strictEqual(review.monthLabel, '2026年06月');
  assert.strictEqual(review.approvalCount, 2);
  assert.strictEqual(review.approvedDayCount, 2);
  assert.strictEqual(review.reviewerCount, 2);
  assert.strictEqual(review.averageCompletionRateLabel, '90%');
  assert.strictEqual(review.daysWithBlockers, 1);
  assert.strictEqual(review.totalClosingBlockers, 2);
  assert.strictEqual(review.totalInventoryShortages, 1);
  assert.strictEqual(review.totalInventoryReceivings, 2);
  assert.strictEqual(review.totalFollowUpDueCount, 1);
  assert.strictEqual(review.totalSupportCaseCount, 2);
  assert.strictEqual(review.latestApproval?.logId, 'log_2');
  assert.strictEqual(review.latestApproval?.integrityHash, 'hash_2');
  assert.strictEqual(review.latestApproval?.storeName, '自店');
  assert.deepStrictEqual(review.allApprovals.map((record) => record.logId), ['log_2', 'log_1']);
  assert.deepStrictEqual(review.recentApprovals.map((record) => record.logId), ['log_2', 'log_1']);
  assert.strictEqual(review.completionTrendLabel, '80% -> 100%');
  assert.strictEqual(review.blockerTrendLabel, '2 -> 0');
  assert.strictEqual(review.previousMonthComparison.previousMonth.monthKey, '2026-05');
  assert.strictEqual(review.previousMonthComparison.approvedDayDeltaLabel, '+1日');
  assert.strictEqual(review.previousMonthComparison.averageCompletionRateDeltaLabel, '+40pt');
  assert.strictEqual(review.previousMonthComparison.daysWithBlockersDeltaLabel, '±0日');
  assert.strictEqual(review.previousMonthComparison.totalClosingBlockersDeltaLabel, '-3件');
  assert.strictEqual(review.previousMonthComparison.inventoryShortageDeltaLabel, '-2品目');
  assert.strictEqual(review.previousMonthComparison.inventoryReceivingDeltaLabel, '+1件');
  assert.strictEqual(review.previousMonthComparison.followUpDueDeltaLabel, '-1件');
  assert.strictEqual(review.previousMonthComparison.supportCaseDeltaLabel, '-1件');
  assert.strictEqual(review.previousMonthComparison.statusLabel, '改善');
  assert.deepStrictEqual(
    review.monthlyKpiHistory.map((month) => month.monthKey),
    ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
  );
  assert.deepStrictEqual(
    review.monthlyKpiHistory.slice(-2).map((month) => month.averageCompletionRateLabel),
    ['50%', '90%']
  );
  assert.deepStrictEqual(
    review.monthlyKpiHistory.slice(-2).map((month) => month.totalClosingBlockers),
    [5, 2]
  );
  assert.deepStrictEqual(
    review.monthlyKpiHistory.slice(-2).map((month) => month.totalInventoryShortages),
    [3, 1]
  );
  assert.deepStrictEqual(
    review.monthlyKpiHistory.slice(-2).map((month) => month.totalInventoryReceivings),
    [1, 2]
  );
  assert.deepStrictEqual(
    review.monthlyKpiHistory.slice(-2).map((month) => month.totalFollowUpDueCount),
    [2, 1]
  );
  assert.deepStrictEqual(
    review.monthlyKpiHistory.slice(-2).map((month) => month.totalSupportCaseCount),
    [3, 2]
  );
  assert.strictEqual(review.storeBenchmark.status, 'single_store');
  assert.strictEqual(review.storeBenchmark.currentStore?.averageCompletionRateLabel, '90%');
  assert.strictEqual(review.storeBenchmark.actionTemplates[0]?.id, 'import-store-comparison-logs');
});

test('buildOperationalClosingMonthlyReview benchmarks daily closing KPIs across stores', () => {
  const storeLogs: AuditLog[] = [
    {
      ...logs[0],
      logId: 'store_current_1',
      timestamp: '2026-06-15T11:00:00.000Z',
      details: '日次締め承認: 2026/06/15 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 確認者 薬剤師 一郎 / 本日完了率 70% / 閉店前残タスク 3 / 月次請求締め率 80%'
    },
    {
      ...logs[1],
      logId: 'store_current_2',
      timestamp: '2026-06-16T11:00:00.000Z',
      details: '日次締め承認: 2026/06/16 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 確認者 管理者 / 本日完了率 80% / 閉店前残タスク 1 / 月次請求締め率 90%'
    },
    {
      ...logs[1],
      logId: 'store_peer_1',
      timestamp: '2026-06-16T12:00:00.000Z',
      details: '日次締め承認: 2026/06/16 20:00 / 店舗名 青空薬局 新宿店 / 店舗コード 1399999 / 確認者 管理者 / 本日完了率 100% / 閉店前残タスク 0 / 月次請求締め率 100%'
    }
  ];

  const review = buildOperationalClosingMonthlyReview(storeLogs, new Date('2026-06-20T12:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });

  assert.strictEqual(review.storeBenchmark.storeCount, 2);
  assert.strictEqual(review.storeBenchmark.currentStore?.storeName, '青空薬局 渋谷店');
  assert.strictEqual(review.storeBenchmark.currentStore?.averageCompletionRate, 75);
  assert.strictEqual(review.storeBenchmark.allStoreAverageCompletionRate, 83);
  assert.strictEqual(review.storeBenchmark.peerAverageCompletionRate, 100);
  assert.strictEqual(review.storeBenchmark.currentStore?.completionRateDifferenceFromAverage, -8);
  assert.strictEqual(review.storeBenchmark.currentStore?.totalClosingBlockers, 4);
  assert.strictEqual(review.storeBenchmark.status, 'needs_attention');
  assert.ok(review.storeBenchmark.requiredActions.some((action) => action.includes('残タスク内訳')));
  assert.strictEqual(review.storeBenchmark.actionTemplates[0]?.id, 'reduce-closing-blockers');
  assert.strictEqual(review.storeBenchmark.actionTemplates[0]?.priority, 'high');
  assert.strictEqual(review.storeBenchmark.actionTemplates[0]?.dueInDays, 3);
  assert.strictEqual(review.storeBenchmark.actionTemplates[0]?.assigneeLabel, '店舗責任者');
  assert.deepStrictEqual(review.storeBenchmark.actionTemplates[0]?.crossStoreTargetStoreNames, ['青空薬局 新宿店']);
  assert.ok(review.storeBenchmark.actionTemplates[0]?.steps.some((step) => step.includes('閉店30分前')));
  assert.strictEqual(review.storeBenchmark.actionTemplates[1]?.id, 'compare-leading-store-flow');
  assert.strictEqual(review.storeBenchmark.actionFollowUpSummary.status, 'overdue');
  assert.strictEqual(review.storeBenchmark.actionFollowUpSummary.overdueCount, 1);
  assert.strictEqual(review.storeBenchmark.actionAssignmentSummary.status, 'cross_store_required');
  assert.strictEqual(review.storeBenchmark.actionAssignmentSummary.openCrossStoreFollowUpCount, 2);
  assert.strictEqual(review.storeBenchmark.actionAssignmentSummary.escalationStatus, 'required');
  assert.strictEqual(review.storeBenchmark.actionAssignmentSummary.escalationLabel, '責任者エスカレーション');
  assert.deepStrictEqual(review.storeBenchmark.actionAssignmentSummary.assigneeLabels, ['店舗責任者', 'エリア責任者']);
  assert.deepStrictEqual(review.storeBenchmark.actionAssignmentSummary.crossStoreTargetStoreNames, ['青空薬局 新宿店']);
  assert.strictEqual(review.storeBenchmark.actionFollowUps[0]?.templateId, 'reduce-closing-blockers');
  assert.strictEqual(review.storeBenchmark.actionFollowUps[0]?.assigneeLabel, '店舗責任者');
  assert.strictEqual(review.storeBenchmark.actionFollowUps[0]?.dueDateKey, '2026-06-19');
  assert.strictEqual(review.storeBenchmark.actionFollowUps[0]?.statusLabel, '期限超過');

  const csv = buildOperationalClosingMonthlyReviewCsv(review);
  assert.match(csv, /"担当者割当","割当状況","店舗横断フォローあり","未完了 2件 \/ 店舗横断 2件 \/ 担当 店舗責任者 \/ エリア責任者"/);
  assert.match(csv, /"担当者割当","エスカレーション","責任者エスカレーション","期限超過の担当者フォローが1件あります。管理者が担当者と実施日を確定してください。"/);
  assert.match(csv, /"未実施フォロー","閉店前残タスクを削減","期限超過","期限 2026-06-19 \/ 1日超過 \/ 店舗 青空薬局 渋谷店 \/ 優先度 高/);
});

test('buildOperationalClosingMonthlyReview benchmarks inventory and follow-up KPIs per approved day', () => {
  const fieldLogs: AuditLog[] = [
    {
      ...logs[0],
      logId: 'field_current_1',
      details: '日次締め承認: 2026/06/15 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 95% / 閉店前残タスク 0 / 在庫不足 3品目 / 入庫登録 0件 / 服薬フォロー 2件'
    },
    {
      ...logs[1],
      logId: 'field_current_2',
      details: '日次締め承認: 2026/06/16 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 95% / 閉店前残タスク 0 / 在庫不足 2品目 / 入庫登録 1件 / 服薬フォロー 2件'
    },
    {
      ...logs[0],
      logId: 'field_peer_1',
      details: '日次締め承認: 2026/06/15 20:00 / 店舗名 青空薬局 新宿店 / 店舗コード 1399999 / 本日完了率 95% / 閉店前残タスク 0 / 在庫不足 0品目 / 入庫登録 2件 / 服薬フォロー 0件'
    },
    {
      ...logs[1],
      logId: 'field_peer_2',
      details: '日次締め承認: 2026/06/16 20:00 / 店舗名 青空薬局 新宿店 / 店舗コード 1399999 / 本日完了率 95% / 閉店前残タスク 0 / 在庫不足 1品目 / 入庫登録 1件 / 服薬フォロー 1件'
    }
  ];

  const review = buildOperationalClosingMonthlyReview(fieldLogs, new Date('2026-06-20T12:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });

  assert.strictEqual(review.storeBenchmark.currentStore?.averageInventoryShortageLabel, '2.5品目/日');
  assert.strictEqual(review.storeBenchmark.currentStore?.averageInventoryReceivingLabel, '0.5件/日');
  assert.strictEqual(review.storeBenchmark.currentStore?.averageFollowUpDueLabel, '2件/日');
  assert.strictEqual(review.storeBenchmark.allStoreAverageInventoryShortagesLabel, '1.5品目/日');
  assert.strictEqual(review.storeBenchmark.peerAverageInventoryShortagesLabel, '0.5品目/日');
  assert.strictEqual(review.storeBenchmark.allStoreAverageInventoryReceivingsLabel, '1件/日');
  assert.strictEqual(review.storeBenchmark.peerAverageInventoryReceivingsLabel, '1.5件/日');
  assert.strictEqual(review.storeBenchmark.allStoreAverageFollowUpDueLabel, '1.3件/日');
  assert.strictEqual(review.storeBenchmark.peerAverageFollowUpDueLabel, '0.5件/日');
  assert.strictEqual(review.storeBenchmark.status, 'needs_attention');
  assert.strictEqual(review.storeBenchmark.actionLabel, '在庫・フォロー改善');
  assert.ok(review.storeBenchmark.requiredActions.some((action) => action.includes('入庫未登録')));
  assert.ok(review.storeBenchmark.requiredActions.some((action) => action.includes('次回確認日未設定')));
  assert.ok(review.storeBenchmark.actionTemplates.some((template) => template.id === 'reduce-inventory-shortages'));
  assert.ok(review.storeBenchmark.actionTemplates.some((template) => template.id === 'close-follow-up-due'));

  const csv = buildOperationalClosingMonthlyReviewCsv(review);
  assert.match(csv, /在庫不足 2\.5品目\/日 \/ 入庫 0\.5件\/日 \/ フォロー 2件\/日/);
  assert.match(csv, /"改善アクション","在庫不足を減らす","high"/);
  assert.match(csv, /"改善アクション","服薬フォロー残件を減らす","high"/);
});

test('buildOperationalClosingMonthlyReview benchmarks support load per approved day', () => {
  const supportLogs: AuditLog[] = [
    {
      ...logs[0],
      logId: 'support_current_1',
      details: '日次締め承認: 2026/06/15 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 95% / 閉店前残タスク 0 / 問い合わせ負荷 3件'
    },
    {
      ...logs[1],
      logId: 'support_current_2',
      details: '日次締め承認: 2026/06/16 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 95% / 閉店前残タスク 0 / 問い合わせ負荷 2件'
    },
    {
      ...logs[0],
      logId: 'support_peer_1',
      details: '日次締め承認: 2026/06/15 20:00 / 店舗名 青空薬局 新宿店 / 店舗コード 1399999 / 本日完了率 95% / 閉店前残タスク 0 / 問い合わせ負荷 0件'
    },
    {
      ...logs[1],
      logId: 'support_peer_2',
      details: '日次締め承認: 2026/06/16 20:00 / 店舗名 青空薬局 新宿店 / 店舗コード 1399999 / 本日完了率 95% / 閉店前残タスク 0 / 問い合わせ負荷 1件'
    }
  ];

  const review = buildOperationalClosingMonthlyReview(supportLogs, new Date('2026-06-20T12:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });

  assert.strictEqual(review.totalSupportCaseCount, 6);
  assert.strictEqual(review.storeBenchmark.currentStore?.averageSupportCaseLabel, '2.5件/日');
  assert.strictEqual(review.storeBenchmark.allStoreAverageSupportCasesLabel, '1.5件/日');
  assert.strictEqual(review.storeBenchmark.peerAverageSupportCasesLabel, '0.5件/日');
  assert.strictEqual(review.storeBenchmark.status, 'needs_attention');
  assert.strictEqual(review.storeBenchmark.actionLabel, '問い合わせ負荷改善');
  assert.ok(review.storeBenchmark.requiredActions.some((action) => action.includes('未解決問い合わせ')));
  assert.ok(review.storeBenchmark.actionTemplates.some((template) => template.id === 'reduce-support-load'));

  const csv = buildOperationalClosingMonthlyReviewCsv(review);
  assert.match(csv, /問い合わせ 2\.5件\/日/);
  assert.match(csv, /"改善アクション","問い合わせ負荷を減らす","medium"/);
});

test('buildOperationalClosingMonthlyReview tracks postponed KPI action due dates', () => {
  const actionBasisLogs: AuditLog[] = [
    {
      ...logs[0],
      logId: 'store_current_1',
      timestamp: '2026-06-15T11:00:00.000Z',
      details: '日次締め承認: 2026/06/15 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 70% / 閉店前残タスク 3'
    },
    {
      ...logs[1],
      logId: 'store_peer_1',
      timestamp: '2026-06-16T12:00:00.000Z',
      details: '日次締め承認: 2026/06/16 20:00 / 店舗名 青空薬局 新宿店 / 店舗コード 1399999 / 本日完了率 100% / 閉店前残タスク 0'
    }
  ];
  const baselineReview = buildOperationalClosingMonthlyReview(actionBasisLogs, new Date('2026-06-20T12:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });
  const postponeDetail = buildOperationalClosingStoreBenchmarkActionPostponementAuditDetail(
    baselineReview.storeBenchmark.actionTemplates[0],
    baselineReview,
    '対象店舗との確認会が未実施',
    new Date(2026, 5, 25)
  );
  const review = buildOperationalClosingMonthlyReview([
    ...actionBasisLogs,
    {
      logId: 'kpi_postpone_1',
      timestamp: '2026-06-20T13:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'daily_closing_kpi_action',
      details: postponeDetail
    }
  ], new Date('2026-06-22T12:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });

  assert.match(postponeDetail, /店舗別KPI改善アクション延期: reduce-closing-blockers/);
  assert.match(postponeDetail, /延期理由 対象店舗との確認会が未実施/);
  assert.match(postponeDetail, /旧期限 2026-06-19/);
  assert.match(postponeDetail, /再期限 2026-06-25/);
  assert.strictEqual(review.storeBenchmark.actionExecutions.length, 0);
  assert.strictEqual(review.storeBenchmark.actionPostponements.length, 1);
  assert.strictEqual(review.storeBenchmark.actionPostponements[0]?.reason, '対象店舗との確認会が未実施');
  const postponedFollowUp = review.storeBenchmark.actionFollowUps.find((followUp) => followUp.templateId === 'reduce-closing-blockers');
  assert.strictEqual(postponedFollowUp?.postponed, true);
  assert.strictEqual(postponedFollowUp?.originalDueDateKey, '2026-06-19');
  assert.strictEqual(postponedFollowUp?.dueDateKey, '2026-06-25');
  assert.strictEqual(postponedFollowUp?.daysUntilDue, 3);
  assert.strictEqual(postponedFollowUp?.status, 'due_soon');
  assert.strictEqual(postponedFollowUp?.postponementReason, '対象店舗との確認会が未実施');
  assert.strictEqual(review.storeBenchmark.actionFollowUpSummary.status, 'due_soon');
  assert.strictEqual(review.storeBenchmark.actionFollowUpSummary.overdueCount, 0);
  assert.strictEqual(review.storeBenchmark.actionAssignmentSummary.activePostponementCount, 1);
  assert.strictEqual(review.storeBenchmark.actionAssignmentSummary.escalationStatus, 'watch');

  const csv = buildOperationalClosingMonthlyReviewCsv(review);
  assert.match(csv, /"担当者割当","延期管理","延期中 1件","延期記録 1件 \/ 未完了 2件"/);
  assert.match(csv, /"延期記録","06\/20 22:00","閉店前残タスクを削減","記録者 管理者 \/ 店舗 青空薬局 渋谷店 \/ 担当 店舗責任者 \/ 理由 対象店舗との確認会が未実施 \/ 旧期限 2026-06-19 \/ 再期限 2026-06-25 \/ 残り 3日"/);

  const payload = JSON.parse(buildOperationalClosingStoreBenchmarkBiExport(review, new Date('2026-06-30T00:00:00.000Z')));
  const payloadFollowUp = payload.actionFollowUps.find((followUp: { templateId: string }) => followUp.templateId === 'reduce-closing-blockers');
  assert.strictEqual(payload.actionPostponements[0].newDueDateKey, '2026-06-25');
  assert.strictEqual(payloadFollowUp.postponementReason, '対象店舗との確認会が未実施');
  assert.strictEqual(payload.actionAssignmentSummary.activePostponementCount, 1);
});

test('buildOperationalClosingMonthlyReview measures recorded store KPI actions', () => {
  const actionBasisLogs: AuditLog[] = [
    {
      ...logs[0],
      logId: 'store_current_1',
      timestamp: '2026-06-15T11:00:00.000Z',
      details: '日次締め承認: 2026/06/15 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 70% / 閉店前残タスク 3'
    },
    {
      ...logs[1],
      logId: 'store_peer_1',
      timestamp: '2026-06-15T12:00:00.000Z',
      details: '日次締め承認: 2026/06/15 20:00 / 店舗名 青空薬局 新宿店 / 店舗コード 1399999 / 本日完了率 100% / 閉店前残タスク 0'
    }
  ];
  const baselineReview = buildOperationalClosingMonthlyReview(actionBasisLogs, new Date('2026-06-15T12:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });
  const detail = buildOperationalClosingStoreBenchmarkActionAuditDetail(
    baselineReview.storeBenchmark.actionTemplates[0],
    baselineReview
  );
  const review = buildOperationalClosingMonthlyReview([
    ...actionBasisLogs,
    {
      logId: 'kpi_action_1',
      timestamp: '2026-06-15T13:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'daily_closing_kpi_action',
      details: detail
    },
    {
      ...logs[1],
      logId: 'store_current_after',
      timestamp: '2026-06-16T11:00:00.000Z',
      details: '日次締め承認: 2026/06/16 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 90% / 閉店前残タスク 0'
    },
    {
      ...logs[1],
      logId: 'store_current_after_2',
      timestamp: '2026-06-17T11:00:00.000Z',
      details: '日次締め承認: 2026/06/17 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 100% / 閉店前残タスク 0'
    },
    {
      ...logs[1],
      logId: 'store_current_after_3',
      timestamp: '2026-06-18T11:00:00.000Z',
      details: '日次締め承認: 2026/06/18 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 100% / 閉店前残タスク 0'
    }
  ], new Date('2026-06-22T12:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });

  assert.match(detail, /店舗別KPI改善アクション記録: reduce-closing-blockers/);
  assert.match(detail, /期限 2026-06-18/);
  assert.match(detail, /担当者 店舗責任者/);
  assert.match(detail, /店舗横断フォロー 青空薬局 新宿店の閉店前確認手順を1つ取り入れる/);
  assert.match(detail, /基準完了率 70%/);
  assert.strictEqual(review.storeBenchmark.actionEffectSummary.executionCount, 1);
  assert.strictEqual(review.storeBenchmark.actionEffectSummary.status, 'improved');
  assert.strictEqual(review.storeBenchmark.actionEffectSummary.latestExecution?.templateId, 'reduce-closing-blockers');
  assert.strictEqual(review.storeBenchmark.actionEffectSummary.latestExecution?.assigneeLabel, '店舗責任者');
  assert.match(review.storeBenchmark.actionEffectSummary.latestExecution?.crossStoreFollowUpLabel || '', /青空薬局 新宿店/);
  assert.strictEqual(review.storeBenchmark.actionEffectSummary.latestExecution?.baselineAverageCompletionRate, 70);
  assert.strictEqual(review.storeBenchmark.actionEffectSummary.latestExecution?.currentAverageCompletionRate, 97);
  assert.strictEqual(review.storeBenchmark.actionEffectSummary.latestExecution?.completionRateDeltaLabel, '+27pt');
  assert.strictEqual(review.storeBenchmark.actionEffectSummary.latestExecution?.baselineTotalClosingBlockers, 3);
  assert.strictEqual(review.storeBenchmark.actionEffectSummary.latestExecution?.currentTotalClosingBlockers, 0);
  assert.strictEqual(review.storeBenchmark.actionEffectSummary.latestExecution?.baselineAverageClosingBlockersLabel, '3件/日');
  assert.strictEqual(review.storeBenchmark.actionEffectSummary.latestExecution?.currentAverageClosingBlockersLabel, '0件/日');
  assert.strictEqual(review.storeBenchmark.actionEffectSummary.latestExecution?.closingBlockerAverageDeltaLabel, '-3件/日');
  assert.strictEqual(review.storeBenchmark.actionEffectSummary.latestExecution?.measurementApprovedDayCount, 3);
  assert.strictEqual(review.storeBenchmark.actionEffectSummary.latestExecution?.measurementStatusLabel, '3営業日以上を測定');
  const completedFollowUp = review.storeBenchmark.actionFollowUps.find((followUp) => followUp.templateId === 'reduce-closing-blockers');
  assert.strictEqual(completedFollowUp?.status, 'completed');
  assert.strictEqual(completedFollowUp?.completedBy, '管理者');
  assert.strictEqual(review.storeBenchmark.actionFollowUpSummary.status, 'due_soon');
  assert.strictEqual(review.storeBenchmark.actionFollowUpSummary.dueSoonCount, 1);
  assert.strictEqual(review.storeBenchmark.actionAssignmentSummary.status, 'cross_store_required');
  assert.strictEqual(review.storeBenchmark.actionAssignmentSummary.openAssignmentCount, 1);
  assert.strictEqual(review.storeBenchmark.actionAssignmentSummary.escalationStatus, 'watch');
  assert.strictEqual(review.storeBenchmark.actionAssignmentSummary.escalationLabel, '期限前確認');
});

test('buildOperationalClosingMonthlyReview waits for three post-action business days before judging an effect', () => {
  const baselineLogs: AuditLog[] = [
    {
      ...logs[0],
      logId: 'measurement_current_before',
      details: '日次締め承認: 2026/06/15 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 70% / 閉店前残タスク 3'
    },
    {
      ...logs[0],
      logId: 'measurement_peer',
      timestamp: '2026-06-15T12:00:00.000Z',
      details: '日次締め承認: 2026/06/15 21:00 / 店舗名 青空薬局 新宿店 / 店舗コード 1399999 / 本日完了率 100% / 閉店前残タスク 0'
    }
  ];
  const baselineReview = buildOperationalClosingMonthlyReview(baselineLogs, new Date('2026-06-15T22:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });
  const detail = buildOperationalClosingStoreBenchmarkActionAuditDetail(
    baselineReview.storeBenchmark.actionTemplates[0],
    baselineReview
  );
  const review = buildOperationalClosingMonthlyReview([
    ...baselineLogs,
    {
      logId: 'measurement_action',
      timestamp: '2026-06-15T13:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'daily_closing_kpi_action',
      details: detail
    },
    {
      ...logs[1],
      logId: 'measurement_after_1',
      details: '日次締め承認: 2026/06/16 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 100% / 閉店前残タスク 0'
    }
  ], new Date('2026-06-20T12:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });

  const execution = review.storeBenchmark.actionEffectSummary.latestExecution;
  assert.strictEqual(execution?.measurementApprovedDayCount, 1);
  assert.strictEqual(execution?.measurementRemainingDayCount, 2);
  assert.strictEqual(execution?.effectStatus, 'pending');
  assert.strictEqual(execution?.effectStatusLabel, '効果測定中（1/3日）');
  assert.ok(review.storeBenchmark.actionEffectSummary.requiredActions.some((action) => action.includes('あと2営業日分')));
});

test('buildOperationalClosingMonthlyReview keeps measuring an action across a month boundary', () => {
  const juneLogs: AuditLog[] = [
    {
      ...logs[0],
      logId: 'cross_month_current_before',
      timestamp: '2026-06-30T10:00:00.000Z',
      details: '日次締め承認: 2026/06/30 19:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 70% / 閉店前残タスク 3'
    },
    {
      ...logs[0],
      logId: 'cross_month_peer',
      timestamp: '2026-06-30T11:00:00.000Z',
      details: '日次締め承認: 2026/06/30 20:00 / 店舗名 青空薬局 新宿店 / 店舗コード 1399999 / 本日完了率 100% / 閉店前残タスク 0'
    }
  ];
  const juneReview = buildOperationalClosingMonthlyReview(juneLogs, new Date('2026-06-30T21:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });
  const detail = buildOperationalClosingStoreBenchmarkActionAuditDetail(
    juneReview.storeBenchmark.actionTemplates[0],
    juneReview
  );
  const julyReview = buildOperationalClosingMonthlyReview([
    ...juneLogs,
    {
      logId: 'cross_month_action',
      timestamp: '2026-06-30T12:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'daily_closing_kpi_action',
      details: detail
    },
    ...[1, 2, 3].map((day): AuditLog => ({
      ...logs[1],
      logId: `cross_month_after_${day}`,
      timestamp: `2026-07-0${day}T10:00:00.000Z`,
      details: `日次締め承認: 2026/07/0${day} 19:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 100% / 閉店前残タスク 0`
    }))
  ], new Date('2026-07-04T12:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });

  const execution = julyReview.storeBenchmark.actionEffectSummary.latestExecution;
  assert.strictEqual(julyReview.monthKey, '2026-07');
  assert.strictEqual(execution?.templateId, 'reduce-closing-blockers');
  assert.strictEqual(execution?.measurementApprovedDayCount, 3);
  assert.strictEqual(execution?.currentAverageCompletionRate, 100);
  assert.strictEqual(execution?.effectStatus, 'improved');
});

test('buildOperationalClosingMonthlyReview measures default-store approvals with the configured store name', () => {
  const basisLogs: AuditLog[] = [
    {
      ...logs[0],
      logId: 'default_store_before',
      details: '日次締め承認: 2026/06/15 20:00 / 本日完了率 70% / 閉店前残タスク 3'
    },
    {
      ...logs[0],
      logId: 'default_store_peer',
      timestamp: '2026-06-15T12:00:00.000Z',
      details: '日次締め承認: 2026/06/15 21:00 / 店舗名 青空薬局 新宿店 / 本日完了率 100% / 閉店前残タスク 0'
    }
  ];
  const basisReview = buildOperationalClosingMonthlyReview(basisLogs, new Date('2026-06-15T22:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店'
  });
  const detail = buildOperationalClosingStoreBenchmarkActionAuditDetail(
    basisReview.storeBenchmark.actionTemplates[0],
    basisReview
  );
  const review = buildOperationalClosingMonthlyReview([
    ...basisLogs,
    {
      logId: 'default_store_action',
      timestamp: '2026-06-15T13:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'daily_closing_kpi_action',
      details: detail
    },
    ...[16, 17, 18].map((day): AuditLog => ({
      ...logs[1],
      logId: `default_store_after_${day}`,
      timestamp: `2026-06-${day}T10:00:00.000Z`,
      details: `日次締め承認: 2026/06/${day} 20:00 / 本日完了率 100% / 閉店前残タスク 0`
    }))
  ], new Date('2026-06-20T12:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店'
  });

  const execution = review.storeBenchmark.actionEffectSummary.latestExecution;
  assert.strictEqual(execution?.targetStoreName, '青空薬局 渋谷店');
  assert.strictEqual(execution?.measurementApprovedDayCount, 3);
  assert.strictEqual(execution?.currentAverageCompletionRate, 100);
  assert.strictEqual(execution?.currentAverageClosingBlockersLabel, '0件/日');
  assert.strictEqual(execution?.effectStatus, 'improved');
});

test('buildOperationalClosingMonthlyReview measures inventory action effects with field KPIs', () => {
  const fieldBasisLogs: AuditLog[] = [
    {
      ...logs[0],
      logId: 'inventory_action_current_before',
      details: '日次締め承認: 2026/06/15 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 100% / 閉店前残タスク 0 / 在庫不足 3品目 / 入庫登録 0件 / 服薬フォロー 1件'
    },
    {
      ...logs[0],
      logId: 'inventory_action_peer',
      timestamp: '2026-06-15T12:00:00.000Z',
      details: '日次締め承認: 2026/06/15 21:00 / 店舗名 青空薬局 新宿店 / 店舗コード 1399999 / 本日完了率 100% / 閉店前残タスク 0 / 在庫不足 0品目 / 入庫登録 2件 / 服薬フォロー 0件'
    }
  ];
  const baselineReview = buildOperationalClosingMonthlyReview(fieldBasisLogs, new Date('2026-06-15T22:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });
  const template = baselineReview.storeBenchmark.actionTemplates.find((candidate) => candidate.id === 'reduce-inventory-shortages');
  assert.ok(template);
  const detail = buildOperationalClosingStoreBenchmarkActionAuditDetail(template, baselineReview);
  const review = buildOperationalClosingMonthlyReview([
    ...fieldBasisLogs,
    {
      logId: 'inventory_action_record',
      timestamp: '2026-06-15T13:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'daily_closing_kpi_action',
      details: detail
    },
    {
      ...logs[1],
      logId: 'inventory_action_current_after',
      details: '日次締め承認: 2026/06/16 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 100% / 閉店前残タスク 0 / 在庫不足 0品目 / 入庫登録 2件 / 服薬フォロー 1件'
    },
    {
      ...logs[1],
      logId: 'inventory_action_current_after_2',
      timestamp: '2026-06-17T11:00:00.000Z',
      details: '日次締め承認: 2026/06/17 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 100% / 閉店前残タスク 0 / 在庫不足 0品目 / 入庫登録 2件 / 服薬フォロー 1件'
    },
    {
      ...logs[1],
      logId: 'inventory_action_current_after_3',
      timestamp: '2026-06-18T11:00:00.000Z',
      details: '日次締め承認: 2026/06/18 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 100% / 閉店前残タスク 0 / 在庫不足 0品目 / 入庫登録 2件 / 服薬フォロー 1件'
    }
  ], new Date('2026-06-20T12:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });

  assert.match(detail, /基準在庫不足 3品目\/日/);
  assert.match(detail, /基準入庫登録 0件\/日/);
  const execution = review.storeBenchmark.actionExecutions.find((candidate) => candidate.templateId === 'reduce-inventory-shortages');
  assert.strictEqual(execution?.baselineAverageInventoryShortagesLabel, '3品目/日');
  assert.strictEqual(execution?.currentAverageInventoryShortagesLabel, '0品目/日');
  assert.strictEqual(execution?.inventoryShortageDeltaLabel, '-3品目/日');
  assert.strictEqual(execution?.baselineAverageInventoryReceivingsLabel, '0件/日');
  assert.strictEqual(execution?.currentAverageInventoryReceivingsLabel, '2件/日');
  assert.strictEqual(execution?.inventoryReceivingDeltaLabel, '+2件/日');
  assert.strictEqual(execution?.measurementApprovedDayCount, 3);
  assert.strictEqual(execution?.effectStatus, 'improved');
  assert.ok(review.storeBenchmark.actionEffectSummary.requiredActions.some((action) => action.includes('在庫不足と入庫登録が改善')));
});

test('buildOperationalClosingMonthlyReview measures support load action effects', () => {
  const supportBasisLogs: AuditLog[] = [
    {
      ...logs[0],
      logId: 'support_action_current_before',
      details: '日次締め承認: 2026/06/15 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 100% / 閉店前残タスク 0 / 問い合わせ負荷 3件'
    },
    {
      ...logs[0],
      logId: 'support_action_peer',
      timestamp: '2026-06-15T12:00:00.000Z',
      details: '日次締め承認: 2026/06/15 21:00 / 店舗名 青空薬局 新宿店 / 店舗コード 1399999 / 本日完了率 100% / 閉店前残タスク 0 / 問い合わせ負荷 0件'
    }
  ];
  const baselineReview = buildOperationalClosingMonthlyReview(supportBasisLogs, new Date('2026-06-15T22:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });
  const template = baselineReview.storeBenchmark.actionTemplates.find((candidate) => candidate.id === 'reduce-support-load');
  assert.ok(template);
  const detail = buildOperationalClosingStoreBenchmarkActionAuditDetail(template, baselineReview);
  const review = buildOperationalClosingMonthlyReview([
    ...supportBasisLogs,
    {
      logId: 'support_action_record',
      timestamp: '2026-06-15T13:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'daily_closing_kpi_action',
      details: detail
    },
    {
      ...logs[1],
      logId: 'support_action_current_after',
      details: '日次締め承認: 2026/06/16 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 100% / 閉店前残タスク 0 / 問い合わせ負荷 0件'
    },
    {
      ...logs[1],
      logId: 'support_action_current_after_2',
      timestamp: '2026-06-17T11:00:00.000Z',
      details: '日次締め承認: 2026/06/17 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 100% / 閉店前残タスク 0 / 問い合わせ負荷 0件'
    },
    {
      ...logs[1],
      logId: 'support_action_current_after_3',
      timestamp: '2026-06-18T11:00:00.000Z',
      details: '日次締め承認: 2026/06/18 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 本日完了率 100% / 閉店前残タスク 0 / 問い合わせ負荷 0件'
    }
  ], new Date('2026-06-20T12:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });

  assert.match(detail, /基準問い合わせ負荷 3件\/日/);
  const execution = review.storeBenchmark.actionExecutions.find((candidate) => candidate.templateId === 'reduce-support-load');
  assert.strictEqual(execution?.baselineAverageSupportCasesLabel, '3件/日');
  assert.strictEqual(execution?.currentAverageSupportCasesLabel, '0件/日');
  assert.strictEqual(execution?.supportCaseDeltaLabel, '-3件/日');
  assert.strictEqual(execution?.measurementApprovedDayCount, 3);
  assert.strictEqual(execution?.effectStatus, 'improved');
  assert.ok(review.storeBenchmark.actionEffectSummary.requiredActions.some((action) => action.includes('問い合わせ負荷が改善')));
});

test('buildOperationalClosingMonthlyReviewCsv exports manager review without patient details', () => {
  const review = buildOperationalClosingMonthlyReview([
    {
      ...logs[0],
      userName: '=管理者'
    },
    ...logs.slice(1)
  ], new Date('2026-06-20T12:00:00+09:00'));

  const csv = buildOperationalClosingMonthlyReviewCsv(review);

  assert.match(csv, /^"区分","項目","値","補足"/);
  assert.match(csv, /"月次サマリ","承認回数","2","日次締め承認ログ数"/);
  assert.match(csv, /"月次サマリ","在庫不足合計","1","日次締め承認ログの在庫不足品目合計"/);
  assert.match(csv, /"月次サマリ","入庫登録合計","2","発注ワークベンチからロット在庫へ登録した件数"/);
  assert.match(csv, /"月次サマリ","服薬フォロー合計","1","日次締め時点の服薬フォロー候補合計"/);
  assert.match(csv, /"月次サマリ","問い合わせ負荷合計","2","個人情報なし診断やサポート対応の記録件数"/);
  assert.match(csv, /"前月比較","承認日数差","'\+1日","1日 -> 2日"/);
  assert.match(csv, /"前月比較","平均完了率差","'\+40pt","50% -> 90%"/);
  assert.match(csv, /"前月比較","残タスク合計差","'-3件","5件 -> 2件"/);
  assert.match(csv, /"前月比較","在庫不足合計差","'-2品目","3品目 -> 1品目"/);
  assert.match(csv, /"前月比較","入庫登録合計差","'\+1件","1件 -> 2件"/);
  assert.match(csv, /"前月比較","服薬フォロー合計差","'-1件","2件 -> 1件"/);
  assert.match(csv, /"前月比較","問い合わせ負荷合計差","'-1件","3件 -> 2件"/);
  assert.match(csv, /"前月比較","判定","改善","完了率上昇と残タスク減少を改善として評価"/);
  assert.match(csv, /"店舗別KPI","自店完了率","90%","自店"/);
  assert.match(csv, /"効果測定","改善アクション実行記録","0件","未記録"/);
  assert.match(csv, /"未実施フォロー","期限管理","期限間近あり","未実施 1件 \/ 期限超過 0件 \/ 期限間近 1件"/);
  assert.match(csv, /"担当者割当","割当状況","店舗横断フォローあり","未完了 1件 \/ 店舗横断 1件 \/ 担当 エリア責任者"/);
  assert.match(csv, /"担当者割当","エスカレーション","期限前確認","期限間近の担当者フォローが1件あります。期限前に実行記録または延期理由を残してください。"/);
  assert.match(csv, /"店舗別","自店","90%","店舗コード - \/ 承認 2日 \/ 残タスク 2件/);
  assert.match(csv, /"改善アクション","比較店舗ログを取込","medium","対象 自店 \/ 担当 エリア責任者 \/ 横断 比較対象店舗の日次締め承認ログの出力方法を共有してもらう \/ 期待 自店KPIを全店平均、他店平均と比較できる状態にする"/);
  assert.match(csv, /"改善手順","比較店舗ログを取込 1","他店舗の日次締め承認ログを監査ログJSONまたは移行データで取り込む","自店"/);
  assert.match(csv, /"未実施フォロー","比較店舗ログを取込","期限間近","期限 2026-06-23 \/ 残り 3日 \/ 店舗 自店 \/ 優先度 中/);
  assert.match(csv, /"複数月KPI","2026年05月","50%","承認 1日 \/ 残タスク日 1日 \/ 残タスク合計 5件 \/ 在庫不足 3品目 \/ 入庫 1件 \/ フォロー 2件 \/ 問い合わせ 3件"/);
  assert.match(csv, /"複数月KPI","2026年06月","90%","承認 2日 \/ 残タスク日 1日 \/ 残タスク合計 2件 \/ 在庫不足 1品目 \/ 入庫 2件 \/ フォロー 1件 \/ 問い合わせ 2件"/);
  assert.match(csv, /"KPI推移","本日完了率","80% -> 100%","古い承認から新しい承認の順"/);
  assert.match(csv, /"最新承認","整合性ハッシュ","hash_2","監査ログの署名値"/);
  assert.match(csv, /"月内承認","06\/16 20:00","管理者","完了率 100% \/ 残タスク 0件 \/ 在庫不足 0品目 \/ 入庫 2件 \/ フォロー 0件 \/ 問い合わせ 0件 \/ 月次請求 100% \/ hash hash_2"/);
  assert.match(csv, /"'=管理者"/);
  assert.doesNotMatch(csv, /山田|pt_1|claim_lifecycle/);
});

test('buildOperationalClosingStoreBenchmarkBiExport exports BI JSON without patient identifiers or source details', () => {
  const review = buildOperationalClosingMonthlyReview([
    {
      ...logs[0],
      logId: 'current_store',
      patientId: 'pt_hidden',
      patientName: '山田 太郎',
      details: '日次締め承認: 2026/06/15 20:00 / 店舗名 青空薬局 渋谷店 / 店舗コード 1312345 / 確認者 薬剤師 一郎 / 本日完了率 70% / 閉店前残タスク 3 / 月次請求締め率 80% / 在庫不足 2品目 / 入庫登録 1件 / 服薬フォロー 1件 / 問い合わせ負荷 2件 / 患者メモ 山田 太郎'
    },
    {
      ...logs[1],
      logId: 'peer_store',
      details: '日次締め承認: 2026/06/16 20:00 / 店舗名 青空薬局 新宿店 / 店舗コード 1399999 / 確認者 管理者 / 本日完了率 100% / 閉店前残タスク 0 / 月次請求締め率 100% / 在庫不足 0品目 / 入庫登録 2件 / 服薬フォロー 0件 / 問い合わせ負荷 0件'
    },
    logs[3]
  ], new Date('2026-06-20T12:00:00+09:00'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });

  const payload = JSON.parse(buildOperationalClosingStoreBenchmarkBiExport(
    review,
    new Date('2026-06-30T00:00:00.000Z')
  ));

  assert.strictEqual(payload.type, 'operational-closing-store-benchmark');
  assert.strictEqual(payload.schemaVersion, 5);
  assert.strictEqual(payload.generatedAt, '2026-06-30T00:00:00.000Z');
  assert.strictEqual(payload.monthKey, '2026-06');
  assert.strictEqual(payload.summary.storeCount, 2);
  assert.strictEqual(payload.summary.status, 'needs_attention');
  assert.strictEqual(payload.summary.allStoreAverageCompletionRate, 85);
  assert.strictEqual(payload.summary.peerAverageCompletionRate, 100);
  assert.strictEqual(payload.summary.totalInventoryShortages, 2);
  assert.strictEqual(payload.summary.totalInventoryReceivings, 3);
  assert.strictEqual(payload.summary.totalFollowUpDueCount, 1);
  assert.strictEqual(payload.summary.totalSupportCaseCount, 2);
  assert.strictEqual(payload.summary.allStoreAverageInventoryShortages, 1);
  assert.strictEqual(payload.summary.peerAverageInventoryShortages, 0);
  assert.strictEqual(payload.summary.allStoreAverageInventoryReceivings, 1.5);
  assert.strictEqual(payload.summary.peerAverageInventoryReceivings, 2);
  assert.strictEqual(payload.summary.allStoreAverageFollowUpDue, 0.5);
  assert.strictEqual(payload.summary.peerAverageFollowUpDue, 0);
  assert.strictEqual(payload.summary.allStoreAverageSupportCases, 1);
  assert.strictEqual(payload.summary.peerAverageSupportCases, 0);
  assert.strictEqual(payload.stores.length, 2);
  assert.strictEqual(payload.stores[1].storeName, '青空薬局 渋谷店');
  assert.strictEqual(payload.stores[1].averageCompletionRate, 70);
  assert.strictEqual(payload.stores[1].averageInventoryShortageLabel, '2品目/日');
  assert.strictEqual(payload.stores[1].averageInventoryReceivingLabel, '1件/日');
  assert.strictEqual(payload.stores[1].averageFollowUpDueLabel, '1件/日');
  assert.strictEqual(payload.stores[1].averageSupportCaseLabel, '2件/日');
  assert.strictEqual(payload.months.length, 6);
  assert.ok(payload.requiredActions.some((action: string) => action.includes('残タスク内訳')));
  assert.strictEqual(payload.actionTemplates[0].id, 'reduce-closing-blockers');
  assert.strictEqual(payload.actionTemplates[0].targetStoreName, '青空薬局 渋谷店');
  assert.strictEqual(payload.actionTemplates[0].assigneeLabel, '店舗責任者');
  assert.deepStrictEqual(payload.actionTemplates[0].crossStoreTargetStoreNames, ['青空薬局 新宿店']);
  assert.ok(payload.actionTemplates[0].expectedOutcome.includes('平均との差'));
  assert.strictEqual(payload.actionExecutions.length, 0);
  assert.strictEqual(payload.actionEffectSummary.status, 'not_recorded');
  assert.strictEqual(payload.actionFollowUpSummary.status, 'overdue');
  assert.strictEqual(payload.actionAssignmentSummary.status, 'cross_store_required');
  assert.strictEqual(payload.actionAssignmentSummary.escalationStatus, 'required');
  assert.deepStrictEqual(payload.actionAssignmentSummary.crossStoreTargetStoreNames, ['青空薬局 新宿店']);
  assert.strictEqual(payload.actionFollowUps[0].templateId, 'reduce-closing-blockers');
  assert.strictEqual(payload.actionFollowUps[0].assigneeLabel, '店舗責任者');
  assert.strictEqual(payload.actionFollowUps[0].dueDateKey, '2026-06-19');
  assert.strictEqual(payload.actionFollowUps[0].statusLabel, '期限超過');
  assert.deepStrictEqual(payload.privacy, {
    patientFieldsIncluded: false,
    containsPatientIdentifiers: false,
    sourceLogDetailsIncluded: false
  });
  assert.doesNotMatch(JSON.stringify(payload), /山田|pt_hidden|pt_1|患者メモ|日次締め承認|確認者|本日完了率/);
});

test('buildOperationalClosingMonthlyReviewCsv includes every approval in the month', () => {
  const monthlyLogs: AuditLog[] = Array.from({ length: 6 }, (_, index) => ({
    logId: `log_month_${index + 1}`,
    timestamp: `2026-06-${String(index + 1).padStart(2, '0')}T11:00:00.000Z`,
    userId: 'pharm_1',
    userName: '薬剤師 一郎',
    userRole: 'pharmacist',
    actionType: 'daily_closing_approval',
    details: `日次締め承認: 2026/06/${String(index + 1).padStart(2, '0')} 20:00 / 本日完了率 ${80 + index}% / 閉店前残タスク ${index % 2}`,
    integrityHash: `hash_${index + 1}`
  }));
  const review = buildOperationalClosingMonthlyReview(monthlyLogs, new Date('2026-06-20T12:00:00+09:00'));
  const csv = buildOperationalClosingMonthlyReviewCsv(review);

  assert.strictEqual(review.allApprovals.length, 6);
  assert.strictEqual(review.recentApprovals.length, 5);
  assert.strictEqual((csv.match(/"月内承認"/g) || []).length, 6);
  assert.match(csv, /hash_1/);
});

test('buildOperationalClosingMonthlyReview excludes patient-specific logs', () => {
  const review = buildOperationalClosingMonthlyReview(logs, new Date('2026-06-20T12:00:00+09:00'));
  const serialized = JSON.stringify(review);

  assert.doesNotMatch(serialized, /山田|pt_1|claim_lifecycle/);
});

test('buildOperationalClosingMonthlyReview reports empty month safely', () => {
  const review = buildOperationalClosingMonthlyReview(logs, new Date('2026-07-01T12:00:00+09:00'));

  assert.strictEqual(review.monthKey, '2026-07');
  assert.strictEqual(review.approvalCount, 0);
  assert.strictEqual(review.approvedDayCount, 0);
  assert.strictEqual(review.averageCompletionRateLabel, '未集計');
  assert.strictEqual(review.completionTrendLabel, '未集計');
  assert.strictEqual(review.blockerTrendLabel, '未集計');
  assert.strictEqual(review.previousMonthComparison.statusLabel, '比較なし');
  assert.strictEqual(review.previousMonthComparison.averageCompletionRateDeltaLabel, '比較不可');
  assert.strictEqual(review.monthlyKpiHistory.length, 6);
  const lastMonth = review.monthlyKpiHistory[review.monthlyKpiHistory.length - 1];
  assert.strictEqual(lastMonth?.monthKey, '2026-07');
  assert.strictEqual(lastMonth?.averageCompletionRateLabel, '未集計');
  assert.strictEqual(review.latestApproval, undefined);
  assert.deepStrictEqual(review.allApprovals, []);
  assert.deepStrictEqual(review.recentApprovals, []);
});
