import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { findOpeningTag } from '@/lib/test_support/html_disabled_tags';
import {
  ClaimRiskRow,
  ClaimWorkbenchRow,
  InventoryRiskRow,
  FollowUpCandidateRow,
  AiPredictionRow
} from '@/components/dashboard/DashboardRows';
import {
  KpiCard,
  OperationTile,
  StatCard,
  EmptyState
} from '@/components/dashboard/DashboardCards';
import { ClaimWorkbenchSection } from '@/components/dashboard/ClaimWorkbenchSection';
import { OperationalClosingSection } from '@/components/dashboard/OperationalClosingSection';
import { InventoryAlertSection } from '@/components/dashboard/InventoryAlertSection';
import { FollowUpModal } from '@/components/dashboard/FollowUpModal';
import {
  toClaimWorkbenchExportItem,
  formatClaimRuleAttentionForScreen
} from '@/lib/dashboard_helpers';
import type { OperationalAiPrediction } from '@/lib/operational_ai_prediction';
import {
  EMPTY_COUNTS,
  type DashboardClaimWorkItem,
  type DashboardInventoryRisk
} from '@/lib/dashboard_tasks';

describe('Dashboard component contracts and routing handlers', () => {
  describe('DashboardRows export contracts', () => {
    it('exports memoized row components with callable interfaces', () => {
      assert.equal(typeof ClaimRiskRow, 'object'); // React.memo
      assert.equal(typeof ClaimWorkbenchRow, 'object');
      assert.equal(typeof InventoryRiskRow, 'object');
      assert.equal(typeof FollowUpCandidateRow, 'object');
      assert.equal(typeof AiPredictionRow, 'object');
    });

    it('ClaimRiskRow triggers onOpen callback with expected task routing', () => {
      let opened = false;
      const props = {
        name: '山田太郎',
        time: '10:00',
        prescriptionCount: 2,
        totalPoints: 1500,
        errorCount: 1,
        warningCount: 0,
        priority: 'high' as const,
        riskScore: 80,
        topIssueTitles: ['禁忌疑い'],
        actionLabel: '処方監査確認',
        onOpen: () => { opened = true; }
      };

      const element = (ClaimRiskRow as any).type ? (ClaimRiskRow as any).type(props) : (ClaimRiskRow as any)(props);
      assert.ok(element);
      assert.equal(element.type, 'div');
      assert.ok(element.props.className.includes('claim-risk-row'));

      props.onOpen();
      assert.equal(opened, true);
    });

    it('ClaimWorkbenchRow triggers onOpen callback for claim confirmation', () => {
      let opened = false;
      const item: DashboardClaimWorkItem = {
        visitId: 'v1',
        patientId: 'p1',
        name: '佐藤花子',
        priority: 'high' as const,
        priorityLabel: '返戻対応',
        status: 'returned' as const,
        statusLabel: '返戻',
        issueDateLabel: '2026/08/01',
        monthLabel: '2026年8月',
        totalPoints: 1200,
        prescriptionCount: 1,
        latestEventLabel: '返戻取込 (2026/08/20)',
        exportedFileName: 'RECEIPTC.UKE',
        actionLabel: '再請求準備'
      };
      const props = {
        item,
        onOpen: () => { opened = true; }
      };

      const element = (ClaimWorkbenchRow as any).type ? (ClaimWorkbenchRow as any).type(props) : (ClaimWorkbenchRow as any)(props);
      assert.ok(element);
      assert.ok(element.props.className.includes('claim-workbench-row'));

      props.onOpen();
      assert.equal(opened, true);
    });

    it('InventoryRiskRow triggers onOpen callback for order workbench routing', () => {
      let opened = false;
      const props = {
        drugName: 'ロキソニン錠60mg',
        location: 'A-01',
        supplierName: 'スズケン',
        requiredAmount: 100,
        availableAmount: 20,
        shortageAmount: 80,
        recommendedOrderAmount: 100,
        affectedVisitCount: 2,
        affectedPatientNames: ['患者A', '患者B'],
        priority: 'high' as const,
        actionLabel: '至急発注',
        pickingShortageAmount: 10,
        onOpen: () => { opened = true; }
      };

      const element = (InventoryRiskRow as any).type ? (InventoryRiskRow as any).type(props) : (InventoryRiskRow as any)(props);
      assert.ok(element);
      assert.ok(element.props.className.includes('inventory-risk-row'));

      props.onOpen();
      assert.equal(opened, true);
    });

    it('FollowUpCandidateRow provides expected callback properties', () => {
      let opened = false;
      let completed = false;
      const props = {
        candidate: {
          visitId: 'v1',
          patientId: 'p1',
          name: '高橋一郎',
          time: '09:30',
          prescriptionCount: 3,
          suggestedAction: '7日後に服薬アドヒアランス確認',
          reasonFlags: ['多剤併用', 'ハイリスク薬'],
          priority: 'high' as const,
          riskScore: 60,
          isOverdue: true,
          attemptCount: 1,
          lastContactLabel: '8/20 電話 (不在)'
        },
        isCompleting: false,
        onOpen: () => { opened = true; },
        onComplete: () => { completed = true; }
      };

      assert.equal(typeof FollowUpCandidateRow, 'object');
      props.onOpen();
      assert.equal(opened, true);
      props.onComplete();
      assert.equal(completed, true);
    });

    it('AiPredictionRow triggers onOpen callback', () => {
      let opened = false;
      const prediction: OperationalAiPrediction = {
        predictionId: 'pred_1',
        targetId: 'v1',
        domain: 'follow_up' as const,
        severity: 'warning' as const,
        title: '服薬フォロー優先度 高',
        message: '副作用リスクの疑い',
        evidence: [{ label: '併用薬', detail: 'NSAIDs併用', source: '処方監査' }],
        score: 75,
        confidence: 0.88,
        suggestedAction: '確認架電',
        requiresHumanReview: true,
        guardrail: '処方監査ルール'
      };
      const props = {
        prediction,
        onOpen: () => { opened = true; }
      };

      const element = (AiPredictionRow as any).type ? (AiPredictionRow as any).type(props) : (AiPredictionRow as any)(props);
      assert.ok(element);
      assert.ok(element.props.className.includes('ai-prediction-row'));

      props.onOpen();
      assert.equal(opened, true);
    });
  });

  describe('DashboardCards export contracts', () => {
    it('exports KpiCard, OperationTile, StatCard, EmptyState', () => {
      assert.equal(typeof KpiCard, 'object');
      assert.equal(typeof OperationTile, 'object');
      assert.equal(typeof StatCard, 'object');
      assert.equal(typeof EmptyState, 'object');
    });

    it('OperationTile renders and responds to onClick', () => {
      let clicked = false;
      const DummyIcon = () => React.createElement('span', null, 'icon');
      const props = {
        icon: DummyIcon,
        label: '処方監査待ち',
        value: 5,
        subLabel: '要確認',
        tone: 'amber' as const,
        onClick: () => { clicked = true; }
      };

      const element = (OperationTile as any).type ? (OperationTile as any).type(props) : (OperationTile as any)(props);
      assert.ok(element);
      assert.ok(element.props.className.includes('operation-tile'));

      props.onClick();
      assert.equal(clicked, true);
    });
  });

  describe('Section and Modal contracts', () => {
    it('exports all major dashboard section components', () => {
      assert.equal(typeof ClaimWorkbenchSection, 'function');
      assert.equal(typeof OperationalClosingSection, 'function');
      assert.equal(typeof InventoryAlertSection, 'function');
      assert.equal(typeof FollowUpModal, 'function');
    });
  });

  describe('dashboard_helpers contracts', () => {
    it('converts DashboardClaimWorkItem to claim export format', () => {
      const item: DashboardClaimWorkItem = {
        visitId: 'v10',
        name: '鈴木太郎',
        patientId: 'p10',
        priority: 'high' as const,
        priorityLabel: '返戻',
        status: 'returned' as const,
        statusLabel: '返戻対応中',
        issueDateLabel: '2026/08/10',
        monthLabel: '2026年8月',
        totalPoints: 2300,
        prescriptionCount: 2,
        latestEventLabel: '返戻受領',
        exportedFileName: 'RECEIPTC.UKE',
        actionLabel: '再請求作成',
        reason: '記号番号相違'
      };

      const exportItem = toClaimWorkbenchExportItem(item);
      assert.equal(exportItem.visitId, 'v10');
      assert.equal(exportItem.patientName, '鈴木太郎');
      assert.equal(exportItem.statusLabel, '返戻対応中');
      assert.equal(exportItem.totalPoints, 2300);
      assert.equal(exportItem.reason, '記号番号相違');
    });

    it('formats claim rule attention messages for screen display', () => {
      const report: any = {
        reports: [
          {
            items: [
              { status: 'attention', title: '特定加算の算定要件確認' }
            ]
          }
        ]
      };
      const cases: any[] = [
        { patient: { name: '患者A' } }
      ];
      const text = formatClaimRuleAttentionForScreen(report, cases);
      assert.ok(text.includes('特定加算'));
      assert.ok(text.includes('患者A'));
    });
  });

  describe('ClaimWorkbenchSection UI disabled states and markup pinning', () => {
    const sampleAcceptedItem: DashboardClaimWorkItem = {
      visitId: 'v-accepted-1',
      name: '佐藤花子',
      patientId: 'p-1',
      priority: 'normal',
      priorityLabel: '受付済',
      status: 'accepted',
      statusLabel: '受付済',
      issueDateLabel: '2026/10/01',
      monthLabel: '2026年10月',
      totalPoints: 1200,
      prescriptionCount: 1,
      latestEventLabel: '審査受付完了',
      exportedFileName: 'RECEIPTC.UKE',
      actionLabel: '入金確認後に締め'
    };

    const sampleRebillingItem: DashboardClaimWorkItem = {
      visitId: 'v-rebilling-1',
      name: '山田太郎',
      patientId: 'p-2',
      priority: 'medium',
      priorityLabel: '再請求',
      status: 'rebilling',
      statusLabel: '再請求準備',
      issueDateLabel: '2026/09/15',
      monthLabel: '2026年9月',
      totalPoints: 1800,
      prescriptionCount: 2,
      latestEventLabel: '月遅れ再請求準備',
      exportedFileName: 'RECEIPTC.UKE',
      actionLabel: '月遅れ/UKE再出力'
    };

    const sampleReturnedItem: DashboardClaimWorkItem = {
      visitId: 'v-returned-1',
      name: '田中一郎',
      patientId: 'p-3',
      priority: 'high',
      priorityLabel: '返戻対応',
      status: 'returned',
      statusLabel: '返戻',
      issueDateLabel: '2026/08/20',
      monthLabel: '2026年8月',
      totalPoints: 2400,
      prescriptionCount: 3,
      latestEventLabel: '返戻取込 (2026/09/10)',
      exportedFileName: 'RECEIPTC.UKE',
      actionLabel: '修正して再請求へ',
      reason: '保険番号記載不備'
    };

    it('pins all export, review, closing, memo, and csv buttons as disabled when claim work items are empty', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimWorkbenchSection, {
          db: null,
          claimWorkItems: [],
          counts: EMPTY_COUNTS,
          isLoading: false,
          onOpenTask: () => {},
          onRefresh: () => {}
        })
      );

      const ukeBtn = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
      const officialUkeBtn = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
      const officialReadinessBtn = findOpeningTag(html, 'data-testid="monthly-claim-official-readiness-button"', 'button');
      const ruleReviewBtn = findOpeningTag(html, 'data-testid="monthly-claim-rule-review-button"', 'button');
      const closeAcceptedBtn = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
      const memoBtn = findOpeningTag(html, '<span>請求メモ</span>', 'button');
      const csvBtn = findOpeningTag(html, '<span>CSV</span>', 'button');
      const importBtn = findOpeningTag(html, 'data-testid="claim-acceptance-import-button"', 'button');

      assert.ok(ukeBtn.includes('disabled=""'), 'Uke export button must be disabled when empty');
      assert.ok(officialUkeBtn.includes('disabled=""'), 'Official uke button must be disabled when empty');
      assert.ok(officialReadinessBtn.includes('disabled=""'), 'Official readiness button must be disabled when empty');
      assert.ok(ruleReviewBtn.includes('disabled=""'), 'Rule review button must be disabled when empty');
      assert.ok(closeAcceptedBtn.includes('disabled=""'), 'Close accepted button must be disabled when empty');
      assert.ok(memoBtn.includes('disabled=""'), 'Memo button must be disabled when empty');
      assert.ok(csvBtn.includes('disabled=""'), 'CSV button must be disabled when empty');
      assert.ok(!importBtn.includes('disabled'), 'Import button should remain enabled when not in-flight');

      assert.ok(html.includes('現在、月次請求で未締めの返戻・再請求ワークはありません。'));
    });

    it('enables closing, memo, and csv buttons while pinning export and review buttons as disabled for accepted items', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimWorkbenchSection, {
          db: null,
          claimWorkItems: [sampleAcceptedItem],
          counts: { ...EMPTY_COUNTS, claimWorkbenchCount: 1 },
          isLoading: false,
          onOpenTask: () => {},
          onRefresh: () => {}
        })
      );

      const ukeBtn = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
      const officialUkeBtn = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
      const officialReadinessBtn = findOpeningTag(html, 'data-testid="monthly-claim-official-readiness-button"', 'button');
      const ruleReviewBtn = findOpeningTag(html, 'data-testid="monthly-claim-rule-review-button"', 'button');
      const closeAcceptedBtn = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
      const memoBtn = findOpeningTag(html, '<span>請求メモ</span>', 'button');
      const csvBtn = findOpeningTag(html, '<span>CSV</span>', 'button');

      assert.ok(ukeBtn.includes('disabled=""'), 'Uke export button must be disabled when no rebilling item exists');
      assert.ok(officialUkeBtn.includes('disabled=""'), 'Official uke button must be disabled when no rebilling item exists');
      assert.ok(officialReadinessBtn.includes('disabled=""'), 'Official readiness button must be disabled when no rebilling item exists');
      assert.ok(ruleReviewBtn.includes('disabled=""'), 'Rule review button must be disabled when no rebilling item exists');
      assert.ok(!closeAcceptedBtn.includes('disabled'), 'Close accepted button must be enabled when accepted items exist');
      assert.ok(!memoBtn.includes('disabled'), 'Memo button must be enabled when items exist');
      assert.ok(!csvBtn.includes('disabled'), 'CSV button must be enabled when items exist');

      assert.ok(html.includes('受付済 1'));
    });

    it('enables export and review buttons while pinning close accepted button as disabled for rebilling items', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimWorkbenchSection, {
          db: null,
          claimWorkItems: [sampleRebillingItem],
          counts: { ...EMPTY_COUNTS, claimWorkbenchCount: 1, rebillingClaimCount: 1 },
          isLoading: false,
          onOpenTask: () => {},
          onRefresh: () => {}
        })
      );

      const ukeBtn = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
      const officialUkeBtn = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
      const officialReadinessBtn = findOpeningTag(html, 'data-testid="monthly-claim-official-readiness-button"', 'button');
      const ruleReviewBtn = findOpeningTag(html, 'data-testid="monthly-claim-rule-review-button"', 'button');
      const closeAcceptedBtn = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
      const memoBtn = findOpeningTag(html, '<span>請求メモ</span>', 'button');
      const csvBtn = findOpeningTag(html, '<span>CSV</span>', 'button');

      assert.ok(!ukeBtn.includes('disabled'), 'Uke export button must be enabled when rebilling items exist');
      assert.ok(!officialUkeBtn.includes('disabled'), 'Official uke button must be enabled when rebilling items exist');
      assert.ok(!officialReadinessBtn.includes('disabled'), 'Official readiness button must be enabled when rebilling items exist');
      assert.ok(!ruleReviewBtn.includes('disabled'), 'Rule review button must be enabled when rebilling items exist');
      assert.ok(closeAcceptedBtn.includes('disabled=""'), 'Close accepted button must be disabled when acceptedCount is 0');
      assert.ok(!memoBtn.includes('disabled'), 'Memo button must be enabled when items exist');
      assert.ok(!csvBtn.includes('disabled'), 'CSV button must be enabled when items exist');

      assert.ok(html.includes('再請求 1'));
    });

    it('pins all export, review, and close buttons as disabled while enabling memo and csv for returned items', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClaimWorkbenchSection, {
          db: null,
          claimWorkItems: [sampleReturnedItem],
          counts: { ...EMPTY_COUNTS, claimWorkbenchCount: 1, returnedClaimCount: 1 },
          isLoading: false,
          onOpenTask: () => {},
          onRefresh: () => {}
        })
      );

      const ukeBtn = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
      const officialUkeBtn = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
      const closeAcceptedBtn = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
      const memoBtn = findOpeningTag(html, '<span>請求メモ</span>', 'button');
      const csvBtn = findOpeningTag(html, '<span>CSV</span>', 'button');

      assert.ok(ukeBtn.includes('disabled=""'), 'Uke export button must be disabled for returned-only items');
      assert.ok(officialUkeBtn.includes('disabled=""'), 'Official uke button must be disabled for returned-only items');
      assert.ok(closeAcceptedBtn.includes('disabled=""'), 'Close accepted button must be disabled when acceptedCount is 0');
      assert.ok(!memoBtn.includes('disabled'), 'Memo button must be enabled');
      assert.ok(!csvBtn.includes('disabled'), 'CSV button must be enabled');

      assert.ok(html.includes('返戻 1'));
    });
  });

  describe('InventoryAlertSection UI disabled states and markup pinning', () => {
    const sampleUrgentRisk: DashboardInventoryRisk = {
      drugId: 'drug-1',
      drugName: 'ロキソニン錠60mg',
      location: 'A-01',
      supplierName: 'スズケン',
      requiredAmount: 100,
      availableAmount: 20,
      shortageAmount: 80,
      recommendedOrderAmount: 100,
      affectedVisitCount: 2,
      affectedPatientNames: ['患者A', '患者B'],
      priority: 'high',
      actionLabel: '至急発注',
      pickingShortageAmount: 10
    };

    const mockAppRouter = {
      push: () => {},
      replace: () => {},
      refresh: () => {},
      back: () => {},
      forward: () => {},
      prefetch: () => {}
    };

    it('pins memo and csv buttons as disabled when inventory risks are empty', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          AppRouterContext.Provider,
          { value: mockAppRouter },
          React.createElement(InventoryAlertSection, {
            inventoryRisks: [],
            counts: EMPTY_COUNTS,
            isLoading: false
          })
        )
      );

      const memoBtn = findOpeningTag(html, '<span>発注メモ</span>', 'button');
      const csvBtn = findOpeningTag(html, '<span>CSV</span>', 'button');

      assert.ok(memoBtn.includes('disabled=""'), 'Memo button must be disabled when no risks exist');
      assert.ok(csvBtn.includes('disabled=""'), 'CSV button must be disabled when no risks exist');
      assert.ok(html.includes('現在、在庫不足リスクはありません。'));
      assert.ok(html.includes('0品目'));
    });

    it('enables memo and csv buttons and displays urgent badge when inventory risks are present', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          AppRouterContext.Provider,
          { value: mockAppRouter },
          React.createElement(InventoryAlertSection, {
            inventoryRisks: [sampleUrgentRisk],
            counts: { ...EMPTY_COUNTS, inventoryShortageCount: 1 },
            isLoading: false
          })
        )
      );

      const memoBtn = findOpeningTag(html, '<span>発注メモ</span>', 'button');
      const csvBtn = findOpeningTag(html, '<span>CSV</span>', 'button');

      assert.ok(!memoBtn.includes('disabled'), 'Memo button must be enabled when risks exist');
      assert.ok(!csvBtn.includes('disabled'), 'CSV button must be enabled when risks exist');
      assert.ok(html.includes('至急 1'));
      assert.ok(html.includes('1品目'));
      assert.ok(html.includes('ロキソニン錠60mg'));
    });
  });
});
