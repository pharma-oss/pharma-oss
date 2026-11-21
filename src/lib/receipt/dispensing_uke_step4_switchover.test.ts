import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  categorizeUkeExportAuditType,
  evaluateUkeRetirementReadiness,
  formatMonthlyLegacyUkeExportAuditMessage,
  formatMonthlyOfficialUkeExportAuditMessage,
  formatSingleLegacyUkeExportAuditMessage,
  formatSingleOfficialUkeExportAuditMessage,
  UKE_UI_GUIDANCE
} from './uke_migration_policy';
import { PrintHeaderActions } from '@/app/print/components/PrintHeaderActions';
import { ClaimWorkbenchSection } from '@/components/dashboard/ClaimWorkbenchSection';
import { findOpeningTag } from '@/lib/test_support/html_disabled_tags';
import type { DashboardClaimWorkItem, DashboardCounts } from '@/hooks/useDashboardTasks';

const SAMPLE_WORKBENCH_COUNTS: DashboardCounts = {
  todayReceptionCount: 3,
  waitingCount: 0,
  processingCount: 0,
  reviewCount: 0,
  completedCount: 3,
  pickingPendingCount: 0,
  inventoryShortageCount: 0,
  claimRiskCount: 0,
  urgentClaimRiskCount: 0,
  claimWorkbenchCount: 1,
  returnedClaimCount: 0,
  rebillingClaimCount: 1,
  followUpDueCount: 0,
  urgentFollowUpCount: 0
};

const SAMPLE_WORKBENCH_ITEM: DashboardClaimWorkItem = {
  visitId: 'v-step5a-1',
  patientId: 'p-step5a-1',
  name: '請求 テスト',
  issueDateLabel: '11/1',
  monthLabel: '11月',
  status: 'rebilling',
  statusLabel: '再請求準備',
  priority: 'normal',
  priorityLabel: '通常',
  totalPoints: 1500,
  prescriptionCount: 1,
  latestEventLabel: '再請求準備 11/1',
  actionLabel: '月遅れ/UKE再出力'
};

test('track C-1 step 4: categorizeUkeExportAuditType distinguishes official from legacy inspection exports', () => {
  // 1. 公式提出用の監査ログ
  assert.equal(
    categorizeUkeExportAuditType('公式レセプト（UKE / RECEIPTY.CYO）エクスポート: 患者「テスト」の公式電子レセプト（点数: 1500点）を出力しました。'),
    'official'
  );
  assert.equal(
    categorizeUkeExportAuditType('月次公式UKE出力: RECEIPTY.CYO / 受付 12件 / 合計 18000点 / 提出準備確認済み / 集計突合OK'),
    'official'
  );

  // 2. 点検用旧形式の監査ログ
  assert.equal(
    categorizeUkeExportAuditType('レセプト（UKE・点検用旧形式）エクスポート: 患者「テスト」の電子レセプト（点数: 1500点、ファイル: RECEIPT_1.uke）を出力しました。'),
    'legacy_inspection'
  );
  assert.equal(
    categorizeUkeExportAuditType('月次一括UKE（点検用旧形式）出力: RECEIPT_2026-10.uke / 受付 12件 / 合計 18000点。'),
    'legacy_inspection'
  );

  // 3. その他
  assert.equal(
    categorizeUkeExportAuditType('処方監査を実施しました'),
    'unknown'
  );
});

test('track C-1 step 4: evaluateUkeRetirementReadiness strictly enforces safe retirement criteria', () => {
  // A. すべての基準未達成
  const resultBlocked = evaluateUkeRetirementReadiness({
    pilotMonthsConfirmed: 0,
    legacyExportCountLast3Months: 15,
    stakeholderConsentObtained: false
  });
  assert.equal(resultBlocked.canRetireLegacy, false);
  assert.equal(resultBlocked.currentStatus, 'active_parallel');
  assert.equal(resultBlocked.blockers.length, 3);

  // B. 実績あり・出力0だが合意がまだ
  const resultNesting = evaluateUkeRetirementReadiness({
    pilotMonthsConfirmed: 2,
    legacyExportCountLast3Months: 0,
    stakeholderConsentObtained: false
  });
  assert.equal(resultNesting.canRetireLegacy, false);
  assert.equal(resultNesting.currentStatus, 'ready_for_ui_nesting');
  assert.equal(resultNesting.blockers.length, 1);
  assert.match(resultNesting.blockers[0], /完全廃止合意が得られていません/);

  // C. 全条件クリア
  const resultReady = evaluateUkeRetirementReadiness({
    pilotMonthsConfirmed: 3,
    legacyExportCountLast3Months: 0,
    stakeholderConsentObtained: true
  });
  assert.equal(resultReady.canRetireLegacy, true);
  assert.equal(resultReady.currentStatus, 'ready_for_full_retirement');
  assert.equal(resultReady.blockers.length, 0);
});

test('track C-1 step 5a: single visit print header promotes official UKE, nests legacy UKE, and formats distinct audit logs', () => {
  const html = renderToStaticMarkup(
    React.createElement(PrintHeaderActions, {
      canExportUke: true,
      canPrintDocuments: true,
      hasClaimErrors: false,
      isSelfPayClaimExcluded: false,
      onOpenPicking: () => {},
      onOpenOfficialUke: () => {},
      onDownloadLegacyUke: () => {},
      onPrint: () => {}
    })
  );

  // 1. 公式UKEボタンはツールバー前面に配置され、点検用旧形式ボタンは閉じた <details> 内に格納されていること
  assert.match(html, /data-testid="print-official-uke-button"/);
  assert.match(
    html,
    /<details class="legacy-uke-details" data-testid="print-legacy-uke-disclosure"><summary class="legacy-uke-summary">旧形式UKE<\/summary>[\s\S]*?data-testid="print-uke-export-button"[\s\S]*?<\/details>/
  );
  assert.equal(html.includes('data-testid="print-legacy-uke-disclosure" open'), false, '旧形式UKEの折りたたみは初期状態で閉じていること');

  // 2. ボタンの title 属性で正本と点検用旧形式の役割が現場に明示されていること
  assert.ok(html.includes(UKE_UI_GUIDANCE.singleVisit.officialButtonTitle));
  assert.ok(html.includes(UKE_UI_GUIDANCE.singleVisit.legacyButtonTitleReady));

  // 3. 監査ログメッセージが「点検用旧形式」と「公式レセプト（UKE / RECEIPTY.CYO）」で厳密に区別され分類器と一致すること
  const legacyMessage = formatSingleLegacyUkeExportAuditMessage({
    patientName: '田中 太郎',
    totalPoints: 1500,
    fileName: 'RECEIPT_1.uke'
  });
  const officialMessage = formatSingleOfficialUkeExportAuditMessage({
    patientName: '田中 太郎',
    totalPoints: 1500,
    recordCount: 12
  });
  assert.match(legacyMessage, /^レセプト（UKE・点検用旧形式）エクスポート:/);
  assert.match(officialMessage, /^公式レセプト（UKE \/ RECEIPTY\.CYO）エクスポート:/);
  assert.equal(categorizeUkeExportAuditType(legacyMessage), 'legacy_inspection');
  assert.equal(categorizeUkeExportAuditType(officialMessage), 'official');
});

test('track C-1 step 5a: monthly claim workbench renders promoted official UKE, nests legacy UKE in closed details, and formats distinct audit logs', () => {
  const html = renderToStaticMarkup(
    React.createElement(ClaimWorkbenchSection, {
      db: null,
      claimWorkItems: [SAMPLE_WORKBENCH_ITEM],
      counts: SAMPLE_WORKBENCH_COUNTS,
      isLoading: false,
      onOpenTask: () => {},
      onRefresh: () => {}
    })
  );

  // 1. 公式UKEボタンが primary スタイルとして前面配置され、title 属性で公式正本が明記されていること
  const officialBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
  assert.ok(officialBtnTag.includes('class="section-action-button primary"'), '公式UKEボタンが primary クラスを持つこと');
  assert.ok(
    officialBtnTag.includes(`title="${UKE_UI_GUIDANCE.monthlyClaim.officialButtonTitle}"`),
    '公式UKEボタンの title が正本ガイダンスと一致すること'
  );

  // 2. 点検用旧形式ボタンが閉じた <details> 折りたたみ内に格納され、title 属性で点検用旧形式が明記されていること
  assert.match(
    html,
    /<details class="legacy-uke-details" data-testid="monthly-claim-legacy-uke-disclosure"><summary class="legacy-uke-summary">旧形式UKE<\/summary>[\s\S]*?data-testid="monthly-claim-uke-button"[\s\S]*?<\/details>/
  );
  assert.equal(
    html.includes('data-testid="monthly-claim-legacy-uke-disclosure" open'),
    false,
    '月次ワークベンチの旧形式UKE折りたたみは初期状態で閉じていること'
  );
  const legacyBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
  assert.ok(
    legacyBtnTag.includes(`title="${UKE_UI_GUIDANCE.monthlyClaim.legacyButtonTitle}"`),
    '旧形式UKEボタンの title が点検用ガイダンスと一致すること'
  );

  // 3. 監査ログが点検用旧形式と公式正本で区別され分類器と一致すること
  const monthlyLegacyMessage = formatMonthlyLegacyUkeExportAuditMessage({
    ukeFileName: 'RECEIPT_2026-11.uke',
    claimCount: 12,
    totalPoints: 18000
  });
  const monthlyOfficialMessage = formatMonthlyOfficialUkeExportAuditMessage({
    officialFileName: 'RECEIPT_2026-11.uke',
    claimCount: 12,
    totalPoints: 18000,
    totalSupplementalRecordCount: 4,
    totalPrescriptionRecordCount: 12,
    totalSplitRecordCount: 18,
    goTotalPoints: 18000
  });
  assert.match(monthlyLegacyMessage, /^月次一括UKE（点検用旧形式）出力:/);
  assert.match(monthlyOfficialMessage, /^月次公式UKE出力: RECEIPT_2026-11\.uke \/ RECEIPTY\.CYO/);
  assert.equal(categorizeUkeExportAuditType(monthlyLegacyMessage), 'legacy_inspection');
  assert.equal(categorizeUkeExportAuditType(monthlyOfficialMessage), 'official');
});
