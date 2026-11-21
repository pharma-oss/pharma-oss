import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClaimWorkbenchRow } from './DashboardRows';
import {
  ClaimWorkbenchSection,
  buildClaimWorkbenchUkeCasesData,
  resolveClaimWorkbenchSelfPayFlow
} from './ClaimWorkbenchSection';
import { ClaimRiskSection } from './ClaimRiskSection';
import { PrintHeaderActions } from '@/app/print/components/PrintHeaderActions';
import { ClaimCheckPanel } from '@/app/print/components/ClaimCheckPanel';
import { ReceiptConsoleSummaryPanel } from '@/app/print/components/ReceiptConsoleSummaryPanel';
import {
  buildSingleOfficialUkeModalClaimState,
  calculatePrintReceiptInsuranceAmounts,
  getSingleLegacyUkeBlockReason
} from '@/app/print/helpers';
import { calculateDashboardClaimRisks } from '@/lib/dashboard_tasks';
import {
  SELF_PAY_CLAIM_EXCLUSION_NOTE,
  SELF_PAY_UKE_BLOCKED_MESSAGE
} from '@/lib/self_pay_claim';
import { DEMO_PATIENT_ID } from '@/lib/demo_data';
import { findOpeningTag } from '@/lib/test_support/html_disabled_tags';
import type { DashboardClaimWorkItem, DashboardCounts } from '@/hooks/useDashboardTasks';
import type { FacilitySettings, Patient, PrescriptionItem, Visit } from '@/db/types';

// 保険種別が「自費」の患者を請求から外す配線を、純粋関数の実実行と React 実描画で固定する。
// 判定・仕分け・UKEの防御そのものは src/lib/self_pay_claim.test.ts が実動で確かめている。

const SAMPLE_COUNTS: DashboardCounts = {
  todayReceptionCount: 3,
  waitingCount: 0,
  processingCount: 0,
  reviewCount: 0,
  completedCount: 3,
  pickingPendingCount: 0,
  inventoryShortageCount: 0,
  claimRiskCount: 0,
  urgentClaimRiskCount: 0,
  claimWorkbenchCount: 2,
  returnedClaimCount: 0,
  rebillingClaimCount: 2,
  followUpDueCount: 0,
  urgentFollowUpCount: 0,
  selfPayClaimExcludedCount: 0
};

const baseItem: DashboardClaimWorkItem = {
  visitId: 'v1',
  patientId: 'p1',
  name: '患者 一郎',
  issueDateLabel: '8/5',
  monthLabel: '8月',
  status: 'rebilling',
  statusLabel: '再請求準備',
  priority: 'normal',
  priorityLabel: '通常',
  totalPoints: 500,
  prescriptionCount: 2,
  latestEventLabel: '再請求準備 8/20',
  actionLabel: '再請求の準備を進める'
};

const sampleSettings: FacilitySettings = {
  id: 'default',
  pharmacyName: 'テスト薬局',
  pharmacyCode: '1312345',
  pharmacyPostalCode: '100-0001',
  pharmacyAddress: '東京都千代田区1-1-1',
  pharmacyPhone: '03-1234-5678',
  baseFeeCategory: '1',
  regionalSupportAddition: 'none',
  medicalDxAddition: false
};

test('the workbench case builder drops self-pay cases and the visits that would be marked exported', async () => {
  const insuredPatient: Patient = {
    patientId: 'p_insured',
    name: '社保 太郎',
    kana: 'シャホ タロウ',
    birthDate: '1980-01-01',
    insuranceInfo: { insuranceType: '社保', provider: '06139999', number: '12345', burdenRatio: 30 }
  };
  const selfPayPatient: Patient = {
    patientId: 'p_self_pay',
    name: '自費 花子',
    kana: 'ジヒ ハナコ',
    birthDate: '1985-05-05',
    insuranceInfo: { insuranceType: '自費', burdenRatio: 100 }
  };
  const demoPatient: Patient = {
    patientId: DEMO_PATIENT_ID,
    name: 'デモ患者',
    kana: 'デモカンジャ',
    birthDate: '1990-01-01',
    insuranceInfo: { insuranceType: '社保', provider: '06139999', burdenRatio: 30 }
  };

  const visits: Visit[] = [
    { visitId: 'v_insured', patientId: 'p_insured', issueDate: '2026-08-05', dispensingDate: '2026-08-05', status: 'completed' },
    { visitId: 'v_self_pay', patientId: 'p_self_pay', issueDate: '2026-08-05', dispensingDate: '2026-08-05', status: 'completed' },
    { visitId: 'v_demo', patientId: DEMO_PATIENT_ID, issueDate: '2026-08-05', dispensingDate: '2026-08-05', status: 'completed' }
  ];
  const items: PrescriptionItem[] = [
    { itemId: 'i1', visitId: 'v_insured', drugId: '620000001', dispensedDrug: 'アムロジピン錠5mg', amount: 1, usage: '1日1回朝食後', days: 14, rpNumber: 1 },
    { itemId: 'i2', visitId: 'v_self_pay', drugId: '620000001', dispensedDrug: 'アムロジピン錠5mg', amount: 1, usage: '1日1回朝食後', days: 14, rpNumber: 1 },
    { itemId: 'i3', visitId: 'v_demo', drugId: '620000001', dispensedDrug: 'アムロジピン錠5mg', amount: 1, usage: '1日1回朝食後', days: 14, rpNumber: 1 }
  ];

  const mockDb = {
    facility_settings: {
      findOne: () => ({ exec: async () => ({ toJSON: () => sampleSettings }) })
    },
    visits: {
      find: () => ({
        exec: async () => visits.map((visit) => ({ visitId: visit.visitId, toJSON: () => visit }))
      })
    },
    prescription_items: {
      find: () => ({ exec: async () => items.map((item) => ({ toJSON: () => item })) })
    },
    patients: {
      findByIds: () => ({
        exec: async () => new Map([
          ['p_insured', { toJSON: () => insuredPatient }],
          ['p_self_pay', { toJSON: () => selfPayPatient }],
          [DEMO_PATIENT_ID, { toJSON: () => demoPatient }]
        ])
      })
    },
    drugs: {
      findByIds: () => ({
        exec: async () => new Map([
          ['620000001', { toJSON: () => ({ code: '620000001', name: 'アムロジピン錠5mg', price: 10.1, isGeneric: false }) }]
        ])
      })
    },
    interventions: {
      find: () => ({ exec: async () => [] })
    }
  };

  const result = await buildClaimWorkbenchUkeCasesData(mockDb, [
    { visitId: 'v_insured' },
    { visitId: 'v_self_pay' },
    { visitId: 'v_demo' }
  ]);

  assert.deepEqual(result.cases.map((c) => c.visit.visitId), ['v_insured']);
  // UKEに載せなかった自費受付を、出力済み・ロック対象（visits / visitDocs）に残さないこと
  assert.deepEqual(result.visits.map((v) => v.visitId), ['v_insured']);
  assert.deepEqual(result.visitDocs.map((d) => d.visitId), ['v_insured']);
  assert.deepEqual(result.selfPayExcluded.map((e) => e.visitId), ['v_self_pay']);
  assert.deepEqual(result.missingMessages, []);
});

test('the self-pay flow helper reports excluded counts, ends quietly without double empty notice when all are self-pay, and never throws', () => {
  const excluded = [{ visitId: 'v_self_pay', patientId: 'p_self_pay', patientName: '自費 花子' }];

  // 1. 混在時: 自費除外を通知しつつ処理を続行する
  const mixed = resolveClaimWorkbenchSelfPayFlow({
    selfPayExcluded: excluded,
    remainingCaseCount: 2,
    emptyFallbackMessage: 'UKEを出力できる受付がありません。'
  });
  assert.match(mixed.selfPayNote || '', /1件は請求の対象外/);
  assert.equal(mixed.emptyNotice, null);
  assert.equal(mixed.shouldStop, false);

  // 2. 全件自費で空になったとき: 自費の説明だけを出して終了し、「受付がありません」の二重表示をしない
  const allSelfPay = resolveClaimWorkbenchSelfPayFlow({
    selfPayExcluded: excluded,
    remainingCaseCount: 0,
    emptyFallbackMessage: 'UKEを出力できる受付がありません。'
  });
  assert.match(allSelfPay.selfPayNote || '', /すべて自費の患者でした/);
  assert.equal(allSelfPay.emptyNotice, null);
  assert.equal(allSelfPay.shouldStop, true);

  // 3. 自費ゼロで通常対象もゼロのとき: 空の案内を出す
  const trulyEmpty = resolveClaimWorkbenchSelfPayFlow({
    selfPayExcluded: [],
    remainingCaseCount: 0,
    emptyFallbackMessage: 'UKEを出力できる受付がありません。'
  });
  assert.equal(trulyEmpty.selfPayNote, null);
  assert.equal(trulyEmpty.emptyNotice, 'UKEを出力できる受付がありません。');
  assert.equal(trulyEmpty.shouldStop, true);
});

test('the workbench section renders the self-pay notice only when a billed claim belongs to a self-pay patient', () => {
  const withSelfPayHtml = renderToStaticMarkup(
    React.createElement(ClaimWorkbenchSection, {
      db: null,
      claimWorkItems: [{ ...baseItem, selfPayExcluded: true }],
      counts: SAMPLE_COUNTS,
      isLoading: false,
      onOpenTask: () => {},
      onRefresh: () => {}
    })
  );
  assert.ok(withSelfPayHtml.includes('data-testid="claim-workbench-self-pay-note"'));

  const withoutSelfPayHtml = renderToStaticMarkup(
    React.createElement(ClaimWorkbenchSection, {
      db: null,
      claimWorkItems: [baseItem],
      counts: SAMPLE_COUNTS,
      isLoading: false,
      onOpenTask: () => {},
      onRefresh: () => {}
    })
  );
  assert.ok(!withoutSelfPayHtml.includes('claim-workbench-self-pay-note'));
});

test('the dashboard risk calculation and risk section count and display excluded self-pay patients', () => {
  const selfPayPatient: Patient = {
    patientId: 'p_risk_self_pay',
    name: '自費 二郎',
    kana: 'ジヒ ジロウ',
    birthDate: '1990-02-02',
    insuranceInfo: { insuranceType: '自費', burdenRatio: 100 }
  };
  const riskCalc = calculateDashboardClaimRisks({
    claimReadyVisits: [
      { visitId: 'v_risk_self_pay', patientId: 'p_risk_self_pay', issueDate: '2026-08-05' }
    ],
    patientMap: new Map([['p_risk_self_pay', selfPayPatient]]),
    itemsByVisitId: new Map([
      ['v_risk_self_pay', [{ itemId: 'ri1', visitId: 'v_risk_self_pay', drugId: '620000001', dispensedDrug: 'テスト薬', amount: 1, usage: '1日1回', days: 7 }]]
    ]),
    drugMap: new Map(),
    settingsData: sampleSettings,
    alertsByPatientId: new Map()
  });
  assert.equal(riskCalc.selfPayExcludedCount, 1);
  assert.equal(riskCalc.claimRiskCount, 0);

  const htmlWithExcluded = renderToStaticMarkup(
    React.createElement(ClaimRiskSection, {
      claimRisks: [],
      counts: { ...SAMPLE_COUNTS, selfPayClaimExcludedCount: riskCalc.selfPayExcludedCount },
      urgentClaimRiskCount: 0,
      isLoading: false,
      onOpenTask: () => {}
    })
  );
  assert.ok(htmlWithExcluded.includes('data-testid="claim-risk-self-pay-note"'));
  assert.ok(htmlWithExcluded.includes('1件は、請求の対象外'));

  const htmlWithoutExcluded = renderToStaticMarkup(
    React.createElement(ClaimRiskSection, {
      claimRisks: [],
      counts: { ...SAMPLE_COUNTS, selfPayClaimExcludedCount: 0 },
      urgentClaimRiskCount: 0,
      isLoading: false,
      onOpenTask: () => {}
    })
  );
  assert.ok(!htmlWithoutExcluded.includes('claim-risk-self-pay-note'));
});

test('the print screens stop both UKE exports for a self-pay patient and show exclusion status', () => {
  // 1. 旧形式UKE・公式UKE ともに自費患者では PrintHeaderActions の両ボタンが disabled になること
  const selfPayHeaderHtml = renderToStaticMarkup(
    React.createElement(PrintHeaderActions, {
      canExportUke: true,
      canPrintDocuments: true,
      hasClaimErrors: false,
      isSelfPayClaimExcluded: true,
      onOpenPicking: () => {},
      onOpenOfficialUke: () => {},
      onDownloadLegacyUke: () => {},
      onPrint: () => {}
    })
  );
  const legacyBtnTag = findOpeningTag(selfPayHeaderHtml, 'data-testid="print-uke-export-button"', 'button');
  const officialBtnTag = findOpeningTag(selfPayHeaderHtml, 'data-testid="print-official-uke-button"', 'button');
  assert.ok(legacyBtnTag.includes('disabled=""'), '自費患者では旧形式UKEボタンが無効化されること');
  assert.ok(officialBtnTag.includes('disabled=""'), '自費患者では公式UKEボタンが無効化されること');

  // 2. 旧形式UKEハンドラの事前ガードが自費患者をブロックすること
  assert.equal(
    getSingleLegacyUkeBlockReason({
      isSelfPayClaimExcluded: true,
      isDemo: false,
      claimLifecycleStatus: 'draft'
    }),
    SELF_PAY_UKE_BLOCKED_MESSAGE
  );
  assert.equal(
    getSingleLegacyUkeBlockReason({
      isSelfPayClaimExcluded: false,
      isDemo: false,
      claimLifecycleStatus: 'draft'
    }),
    null
  );

  // 3. 公式UKEモーダルのエラー状態にも自費ブロックが反映されること
  const officialModalState = buildSingleOfficialUkeModalClaimState({
    isSelfPayClaimExcluded: true,
    hasClaimErrors: false,
    claimValidationErrors: []
  });
  assert.equal(officialModalState.hasClaimErrors, true);
  assert.deepEqual(officialModalState.claimErrorMessages, [SELF_PAY_UKE_BLOCKED_MESSAGE]);

  // 4. 算定コンソールと請求前チェックパネルに自費対象外表示が描画されること
  const consoleHtml = renderToStaticMarkup(
    React.createElement(ReceiptConsoleSummaryPanel, {
      totalPoints: 500,
      patientCopayYen: 5000,
      burdenRatio: 100,
      isSelfPayClaimExcluded: true,
      pharmacistCheckStatus: 'ok',
      pharmacistErrorCount: 0,
      claimCheckStatus: 'ok',
      claimValidationErrorCount: 0,
      claimLifecycleLocked: false,
      claimLifecycleStatus: 'draft',
      claimLifecycleLabel: '未出力',
      pharmacyDeviceFlowStatus: 'idle',
      pharmacyDeviceLabel: '未送信',
      electronicPrescriptionFlowStatus: 'idle',
      electronicPrescriptionLabel: '対象外'
    })
  );
  assert.ok(consoleHtml.includes('data-testid="print-self-pay-claim-note"'));
  assert.ok(consoleHtml.includes(SELF_PAY_CLAIM_EXCLUSION_NOTE));
  assert.ok(consoleHtml.includes('対象外（自費）'));

  const selfPayClaimCheckHtml = renderToStaticMarkup(
    React.createElement(ClaimCheckPanel, {
      claimCheckStatus: 'ok',
      isSelfPayClaimExcluded: true,
      hasClaimErrors: false,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      issues: []
    })
  );
  assert.ok(selfPayClaimCheckHtml.includes('対象外'), '自費患者の請求前チェックパネルに対象外バッジが表示されること');
});

test('the print receipt amount calculation computes points times burden ratio independently of self-pay UKE exclusion', () => {
  // 領収金額は、自費でも保険点数×負担割合のまま。除外の判定を領収証の計算に持ち込んでいないこと
  assert.deepEqual(calculatePrintReceiptInsuranceAmounts(500, 100), {
    totalPoints: 500,
    totalCostYen: 5000,
    rawPatientCopayYen: 5000,
    patientCopayYen: 5000,
    insurerBurdenYen: 0,
    burdenRatio: 100
  });
  assert.deepEqual(calculatePrintReceiptInsuranceAmounts(320, 30), {
    totalPoints: 320,
    totalCostYen: 3200,
    rawPatientCopayYen: 960,
    patientCopayYen: 960,
    insurerBurdenYen: 2240,
    burdenRatio: 30
  });
  assert.deepEqual(calculatePrintReceiptInsuranceAmounts(320, undefined), {
    totalPoints: 320,
    totalCostYen: 3200,
    rawPatientCopayYen: 960,
    patientCopayYen: 960,
    insurerBurdenYen: 2240,
    burdenRatio: 30
  });
});

test('the workbench row shows a self-pay badge only for a flagged claim', () => {
  const flagged = renderToStaticMarkup(React.createElement(ClaimWorkbenchRow, { item: { ...baseItem, selfPayExcluded: true }, onOpen: () => {} }));
  assert.ok(flagged.includes('data-testid="claim-workbench-self-pay-badge"'));
  assert.ok(flagged.includes('自費（UKE対象外）'));
  const normal = renderToStaticMarkup(React.createElement(ClaimWorkbenchRow, { item: baseItem, onOpen: () => {} }));
  assert.ok(!normal.includes('claim-workbench-self-pay-badge'));
  assert.ok(!normal.includes('自費'));
});
