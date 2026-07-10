import { test } from 'node:test';
import assert from 'node:assert';
import { buildOperationalKpis } from './operational_kpi.ts';
import {
  buildOperationalClosingAuditDetails,
  buildOperationalClosingCsv,
  buildOperationalClosingMemo,
  buildOperationalClosingReport
} from './operational_closing_report.ts';

const kpis = buildOperationalKpis({
  basisDate: new Date('2026-06-15T12:00:00+09:00'),
  visits: [
    {
      visitId: 'visit_1',
      patientId: 'pt_1',
      issueDate: '2026-06-15T09:00:00+09:00',
      status: 'completed',
      claimLifecycle: { status: 'closed', closedAt: '2026-06-15T10:00:00+09:00' }
    },
    {
      visitId: 'visit_2',
      patientId: 'pt_2',
      issueDate: '2026-06-15T10:00:00+09:00',
      status: 'processing',
      claimLifecycle: { status: 'returned', returnedAt: '2026-06-15T11:00:00+09:00' }
    }
  ],
  soapRecords: [{ visitId: 'visit_1', updatedAt: '2026-06-15T09:30:00+09:00' }],
  counts: {
    todayReceptionCount: 2,
    waitingCount: 0,
    processingCount: 1,
    reviewCount: 1,
    pickingPendingCount: 1,
    inventoryShortageCount: 1,
    urgentClaimRiskCount: 1,
    returnedClaimCount: 1,
    rebillingClaimCount: 0,
    urgentFollowUpCount: 1
  }
});

test('buildOperationalClosingReport creates non-patient daily closing rows', () => {
  const report = buildOperationalClosingReport({
    generatedAt: new Date('2026-06-15T20:00:00+09:00'),
    reviewerName: '管理者',
    storeName: '青空薬局 渋谷店',
    storeCode: '1312345',
    kpis,
    counts: {
      todayReceptionCount: 2,
      waitingCount: 0,
      processingCount: 1,
      reviewCount: 1,
      pickingPendingCount: 1,
      inventoryShortageCount: 1,
      urgentClaimRiskCount: 1,
      returnedClaimCount: 1,
      rebillingClaimCount: 0,
      urgentFollowUpCount: 1,
      claimRiskCount: 1,
      claimWorkbenchCount: 1,
      followUpDueCount: 1
    },
    urgentInventoryRiskCount: 1,
    claimRisks: [
      {
        priority: 'high',
        riskScore: 90,
        topIssueTitles: ['保険情報未設定'],
        actionLabel: '保険確認'
      }
    ],
    inventoryRisks: [
      {
        priority: 'high',
        drugName: '=危険薬',
        shortageAmount: 14,
        actionLabel: '至急発注'
      }
    ],
    claimWorkItems: [
      {
        priorityLabel: '至急',
        statusLabel: '返戻対応',
        actionLabel: '修正して再請求へ'
      }
    ],
    followUpCandidates: [
      {
        priority: 'high',
        reasonFlags: ['重点フォロー薬'],
        dueLabel: '本日対応',
        suggestedAction: '副作用確認'
      }
    ],
    inventoryReceivingCount: 2,
    supportCaseCount: 3
  });

  assert.ok(report.rows.some((row) => row.item === '本日完了率' && row.value === '50%'));
  assert.ok(report.rows.some((row) => row.item === '店舗' && row.value === '青空薬局 渋谷店'));
  assert.ok(report.rows.some((row) => row.item === 'バックアップ確認' && row.value === '未記録'));
  assert.ok(report.rows.some((row) => row.item === '在庫不足' && row.detail.includes('至急1品目')));
  assert.ok(report.rows.some((row) => row.item === '入庫登録' && row.value === '2'));
  assert.ok(report.rows.some((row) => row.item === '問い合わせ負荷' && row.value === '3'));
  assert.ok(report.memoLines.some((line) => line.includes('店舗: 青空薬局 渋谷店')));
  assert.ok(report.memoLines.some((line) => line.includes('入庫登録: 2件')));
  assert.ok(report.memoLines.some((line) => line.includes('問い合わせ負荷: 3件')));
  assert.ok(report.memoLines.some((line) => line.includes('責任者確認')));
});

test('buildOperationalClosingCsv and memo avoid patient names and neutralize formulas', () => {
  const report = buildOperationalClosingReport({
    generatedAt: new Date('2026-06-15T20:00:00+09:00'),
    reviewerName: '=管理者',
    storeName: '=危険薬局',
    storeCode: '1312345',
    kpis,
    counts: {
      todayReceptionCount: 2,
      waitingCount: 0,
      processingCount: 1,
      reviewCount: 1,
      pickingPendingCount: 1,
      inventoryShortageCount: 1,
      urgentClaimRiskCount: 1,
      returnedClaimCount: 1,
      rebillingClaimCount: 0,
      urgentFollowUpCount: 1,
      claimRiskCount: 1,
      claimWorkbenchCount: 1,
      followUpDueCount: 1
    },
    urgentInventoryRiskCount: 1,
    claimRisks: [{ priority: 'high', riskScore: 90, topIssueTitles: ['保険情報未設定'], actionLabel: '保険確認' }],
    inventoryRisks: [{ priority: 'high', drugName: '=HYPERLINK("https://example.invalid")', shortageAmount: 14, actionLabel: '至急発注' }],
    claimWorkItems: [{ priorityLabel: '至急', statusLabel: '返戻対応', actionLabel: '修正して再請求へ' }],
    followUpCandidates: [{ priority: 'high', reasonFlags: ['重点フォロー薬'], dueLabel: '本日対応', suggestedAction: '副作用確認' }],
    inventoryReceivingCount: 1,
    supportCaseCount: 1
  });

  const csv = buildOperationalClosingCsv(report);
  const memo = buildOperationalClosingMemo(report);
  const auditDetails = buildOperationalClosingAuditDetails(report);

  assert.match(csv, /^"区分","項目","値","補足"/);
  assert.match(csv, /"'=管理者"/);
  assert.match(csv, /"'=危険薬局"/);
  assert.match(csv, /"至急1品目 \/ 至急:'=HYPERLINK\(""https:\/\/example\.invalid""\) 不足14"/);
  assert.match(csv, /"現場KPI","入庫登録","1","発注ワークベンチからロット在庫へ登録した件数"/);
  assert.match(csv, /"現場KPI","問い合わせ負荷","1","個人情報なし診断やサポート対応の当日記録件数"/);
  assert.doesNotMatch(csv, /山田|佐藤|pt_1|pt_2|visit_1|visit_2/);
  assert.match(memo, /^日次締めレビュー/);
  assert.match(memo, /閉店前残タスク:/);
  assert.match(memo, /入庫登録: 1件/);
  assert.match(memo, /問い合わせ負荷: 1件/);
  assert.doesNotMatch(memo, /山田|佐藤|pt_1|pt_2|visit_1|visit_2/);
  assert.match(auditDetails, /^日次締め承認:/);
  assert.match(auditDetails, /店舗名 =危険薬局/);
  assert.match(auditDetails, /店舗コード 1312345/);
  assert.match(auditDetails, /月次請求締め率 50%/);
  assert.match(auditDetails, /在庫不足 1品目/);
  assert.match(auditDetails, /入庫登録 1件/);
  assert.match(auditDetails, /服薬フォロー 1件/);
  assert.match(auditDetails, /問い合わせ負荷 1件/);
  assert.doesNotMatch(auditDetails, /山田|佐藤|pt_1|pt_2|visit_1|visit_2/);
});

test('buildOperationalClosingReport includes backup continuity evidence when available', () => {
  const report = buildOperationalClosingReport({
    generatedAt: new Date('2026-06-15T20:00:00+09:00'),
    reviewerName: '管理者',
    kpis,
    counts: {
      todayReceptionCount: 2,
      waitingCount: 0,
      processingCount: 1,
      reviewCount: 1,
      pickingPendingCount: 1,
      inventoryShortageCount: 1,
      urgentClaimRiskCount: 1,
      returnedClaimCount: 1,
      rebillingClaimCount: 0,
      urgentFollowUpCount: 1,
      claimRiskCount: 1,
      claimWorkbenchCount: 1,
      followUpDueCount: 1
    },
    urgentInventoryRiskCount: 1,
    claimRisks: [],
    inventoryRisks: [],
    claimWorkItems: [],
    followUpCandidates: [],
    backupContinuity: {
      generatedAt: '2026-06-15T11:00:00.000Z',
      latestBackupAt: '2026-06-15T10:00:00.000Z',
      latestDrillAt: '2026-06-10T10:00:00.000Z',
      backupAgeDays: 0,
      drillAgeDays: 5,
      status: 'pass',
      statusLabel: '良好',
      detail: 'バックアップ保存 2026/06/15 19:00（0日前） / 復旧テスト 2026/06/10 19:00（5日前）',
      recommendation: '閉店後の保存先確認のみ'
    }
  });

  assert.ok(report.rows.some((row) => row.item === 'バックアップ確認' && row.value === '良好'));
  assert.ok(report.rows.some((row) => row.item === 'バックアップ確認' && row.detail.includes('復旧テスト')));
  assert.ok(report.memoLines.some((line) => line.includes('バックアップ確認: 良好')));
  assert.match(buildOperationalClosingAuditDetails(report), /バックアップ確認 良好/);
  assert.match(buildOperationalClosingCsv(report), /"責任者確認","バックアップ確認","良好"/);
});
