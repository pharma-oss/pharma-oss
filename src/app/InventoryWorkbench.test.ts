import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { findOpeningTag, listDisabledOpeningTags } from '@/lib/test_support/html_disabled_tags';
import { defaultReceivingDraft } from './inventory/types';
import {
  OrderWorkbench,
  type OrderWorkbenchProps
} from './inventory/components/OrderWorkbench';
import {
  formatInventoryAmount,
  choosePrimarySupplier,
  getInventoryOrderPriority,
  getInventoryOrderActionLabel,
  buildInventoryOrderCsv,
  buildInventoryOrderMemo,
  getOrderWorkbenchRestoreErrorBannerMessage,
  type InventoryOrderRisk
} from '@/lib/inventory_order';

describe('InventoryWorkbench components and pure order helpers', () => {
  it('exports OrderWorkbench as a callable React component function', () => {
    assert.equal(typeof OrderWorkbench, 'function');
  });

  it('formats inventory amount with commas and fractions', () => {
    assert.equal(formatInventoryAmount(1000), '1,000');
    assert.equal(formatInventoryAmount(12.5), '12.5');
  });

  it('selects primary supplier by weight from stock lots', () => {
    const lots = [
      { supplier: 'スズケン', quantity: 10 },
      { supplier: 'アルフレッサ', quantity: 50 },
      { supplier: 'スズケン', quantity: 20 }
    ];
    assert.equal(choosePrimarySupplier(lots), 'アルフレッサ');
  });

  it('calculates order priority and labels based on shortage', () => {
    assert.equal(getInventoryOrderPriority({ availableAmount: 0, isHighRiskMedication: false, affectedVisitCount: 1 }), 'high');
    assert.equal(getInventoryOrderPriority({ availableAmount: 50, isHighRiskMedication: false, affectedVisitCount: 1 }), 'medium');
    assert.equal(getInventoryOrderActionLabel({ availableAmount: 0, isHighRiskMedication: false, pickingShortageAmount: 10 }), '棚不足の報告あり・現物確認と至急手配');
    assert.equal(getInventoryOrderActionLabel({ availableAmount: 0, isHighRiskMedication: false }), '至急発注・融通確認');
    assert.equal(getInventoryOrderActionLabel({ availableAmount: 50, isHighRiskMedication: false }), '不足数を発注・代替候補を確認');
  });

  it('builds CSV and memo representation for order candidates', () => {
    const candidates: InventoryOrderRisk[] = [
      {
        drugId: 'd1',
        drugName: 'ロキソニン錠60mg',
        location: 'A-01',
        supplierName: 'スズケン',
        requiredAmount: 100,
        availableAmount: 20,
        shortageAmount: 80,
        recommendedOrderAmount: 100,
        affectedVisitCount: 2,
        priority: 'high',
        actionLabel: '至急発注'
      }
    ];

    const csv = buildInventoryOrderCsv(candidates);
    assert.ok(csv.includes('ロキソニン錠60mg'));
    assert.ok(csv.includes('スズケン'));

    const memo = buildInventoryOrderMemo(candidates);
    assert.ok(memo.includes('ロキソニン錠60mg'));
  });

  it('handles enhanced order risk candidates with reorder points, expiry risk, and substitutes', () => {
    const enhancedCandidate = {
      drugId: 'd2',
      drugName: 'アムロジピン錠5mg「サワイ」',
      location: 'B-02',
      supplierName: 'アルフレッサ',
      requiredAmount: 0,
      availableAmount: 30,
      effectiveAvailableAmount: 30,
      reorderPoint: 50,
      leadTimeDays: 1,
      shortageAmount: 0,
      reorderPointShortage: 20,
      recommendedOrderAmount: 20,
      affectedVisitCount: 0,
      priority: 'medium' as const,
      riskReason: 'below_reorder_point' as const,
      actionLabel: '発注点割れ(残30/点50)・計画発注',
      expiryRisk: {
        nearestExpirationDate: '2027-03-31',
        expiredQuantity: 0,
        urgentExpiringQuantity: 0,
        attentionExpiringQuantity: 30,
        hasExpired: false,
        hasUrgentExpiring: false,
        hasAttentionExpiring: true,
        daysToNearestExpiry: 180
      },
      substitutes: [
        {
          drugCode: 'd3',
          drugName: 'アムロジピンOD錠5mg「日医工」',
          yjCode: '2149005F2047',
          isGeneric: true,
          availableAmount: 100,
          isSameGenericName: true
        }
      ]
    };

    assert.equal(enhancedCandidate.riskReason, 'below_reorder_point');
    assert.equal(enhancedCandidate.substitutes.length, 1);
    assert.equal(enhancedCandidate.substitutes[0].availableAmount, 100);
    assert.equal(enhancedCandidate.expiryRisk.hasAttentionExpiring, true);
  });
});

describe('OrderWorkbench UI disabled states and markup pinning', () => {
  function createMockOrderWorkbenchProps(overrides: Partial<OrderWorkbenchProps> = {}): OrderWorkbenchProps {
    return {
      candidates: [],
      orderedDrugIds: new Set<string>(),
      hasRestoreError: false,
      receivingDrafts: {},
      receivingDrugId: '',
      onRequestTransfer: () => {},
      onToggleOrdered: () => {},
      onUpdateReceivingDraft: () => {},
      onRegisterReceivedStock: () => {},
      onExportCsv: () => {},
      onCopyMemo: () => {},
      onExportReceivingChecklist: () => {},
      onCopyReceivingMemo: () => {},
      onClearOrdered: () => {},
      ...overrides
    };
  }

  const sampleCandidate: InventoryOrderRisk = {
    drugId: 'd1',
    drugName: 'ロキソニン錠60mg',
    location: 'A-01',
    supplierName: 'スズケン',
    requiredAmount: 100,
    availableAmount: 20,
    shortageAmount: 80,
    recommendedOrderAmount: 100,
    affectedVisitCount: 2,
    priority: 'high',
    actionLabel: '至急発注'
  };

  it('pins all 4 operation buttons as disabled when candidates list is empty', () => {
    const props = createMockOrderWorkbenchProps({ candidates: [] });
    const html = renderToStaticMarkup(React.createElement(OrderWorkbench, props));

    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(disabledTags.length, 4, `Expected exactly 4 disabled buttons when empty:\n${disabledTags.join('\n')}`);

    const openMemoTag = findOpeningTag(html, '<span>未対応メモ</span>', 'button');
    assert.ok(openMemoTag.includes('disabled=""'), `Expected open memo button to be disabled: ${openMemoTag}`);

    const openCsvTag = findOpeningTag(html, '<span>CSV</span>', 'button');
    assert.ok(openCsvTag.includes('disabled=""'), `Expected open CSV button to be disabled: ${openCsvTag}`);

    const receivingMemoTag = findOpeningTag(html, '<span>入庫メモ</span>', 'button');
    assert.ok(receivingMemoTag.includes('disabled=""'), `Expected receiving memo button to be disabled: ${receivingMemoTag}`);

    const receivingChecklistTag = findOpeningTag(html, '<span>入庫確認CSV</span>', 'button');
    assert.ok(receivingChecklistTag.includes('disabled=""'), `Expected receiving checklist button to be disabled: ${receivingChecklistTag}`);

    assert.ok(html.includes('現在、該当する発注候補はありません。'));
    assert.ok(!html.includes('発注済みチェックを解除'));
  });

  it('enables open memo and csv buttons while pinning receiving memo and checklist as disabled when un-ordered candidates exist', () => {
    const props = createMockOrderWorkbenchProps({
      candidates: [sampleCandidate],
      orderedDrugIds: new Set()
    });
    const html = renderToStaticMarkup(React.createElement(OrderWorkbench, props));

    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(disabledTags.length, 2, `Expected exactly 2 disabled buttons when open candidates exist and ordered is empty:\n${disabledTags.join('\n')}`);

    const openMemoTag = findOpeningTag(html, '<span>未対応メモ</span>', 'button');
    assert.ok(!openMemoTag.includes('disabled'), `Expected open memo button to be enabled: ${openMemoTag}`);

    const openCsvTag = findOpeningTag(html, '<span>CSV</span>', 'button');
    assert.ok(!openCsvTag.includes('disabled'), `Expected open CSV button to be enabled: ${openCsvTag}`);

    const receivingMemoTag = findOpeningTag(html, '<span>入庫メモ</span>', 'button');
    assert.ok(receivingMemoTag.includes('disabled=""'), `Expected receiving memo button to be disabled: ${receivingMemoTag}`);

    const receivingChecklistTag = findOpeningTag(html, '<span>入庫確認CSV</span>', 'button');
    assert.ok(receivingChecklistTag.includes('disabled=""'), `Expected receiving checklist button to be disabled: ${receivingChecklistTag}`);

    assert.ok(html.includes('分譲で融通'), 'Un-ordered candidate should show transfer button');
    assert.ok(html.includes('<span>発注済みにする</span>'));
    assert.ok(!html.includes('発注済みチェックを解除'));
  });

  it('enables receiving memo and checklist while pinning open memo and csv as disabled when all candidates are ordered', () => {
    const props = createMockOrderWorkbenchProps({
      candidates: [sampleCandidate],
      orderedDrugIds: new Set(['d1'])
    });
    const html = renderToStaticMarkup(React.createElement(OrderWorkbench, props));

    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(disabledTags.length, 2, `Expected exactly 2 disabled buttons when all candidates are ordered:\n${disabledTags.join('\n')}`);

    const openMemoTag = findOpeningTag(html, '<span>未対応メモ</span>', 'button');
    assert.ok(openMemoTag.includes('disabled=""'), `Expected open memo button to be disabled: ${openMemoTag}`);

    const openCsvTag = findOpeningTag(html, '<span>CSV</span>', 'button');
    assert.ok(openCsvTag.includes('disabled=""'), `Expected open CSV button to be disabled: ${openCsvTag}`);

    const receivingMemoTag = findOpeningTag(html, '<span>入庫メモ</span>', 'button');
    assert.ok(!receivingMemoTag.includes('disabled'), `Expected receiving memo button to be enabled: ${receivingMemoTag}`);

    const receivingChecklistTag = findOpeningTag(html, '<span>入庫確認CSV</span>', 'button');
    assert.ok(!receivingChecklistTag.includes('disabled'), `Expected receiving checklist button to be enabled: ${receivingChecklistTag}`);

    const clearOrderedBtn = findOpeningTag(html, '発注済みチェックを解除', 'button');
    assert.ok(!clearOrderedBtn.includes('disabled'), `Clear ordered button must be enabled: ${clearOrderedBtn}`);
    assert.ok(!html.includes('分譲で融通'), 'Ordered candidate should hide transfer button');
    assert.ok(html.includes('<span>発注済み</span>'));
  });

  it('pins receiving submit button as disabled when receivingDrugId matches candidate during in-flight receiving', () => {
    const inFlightProps = createMockOrderWorkbenchProps({
      candidates: [sampleCandidate],
      orderedDrugIds: new Set(['d1']),
      receivingDrugId: 'd1',
      receivingDrafts: { d1: defaultReceivingDraft(sampleCandidate) }
    });
    const inFlightHtml = renderToStaticMarkup(React.createElement(OrderWorkbench, inFlightProps));

    const inFlightDisabled = listDisabledOpeningTags(inFlightHtml);
    assert.equal(inFlightDisabled.length, 3, `Expected 3 disabled buttons when all ordered and receiving in-flight:\n${inFlightDisabled.join('\n')}`);

    const inFlightBtn = findOpeningTag(inFlightHtml, '<span>登録中...</span>', 'button');
    assert.ok(inFlightBtn.includes('disabled=""'), `Expected in-flight receiving button to be disabled: ${inFlightBtn}`);
    assert.ok(!findOpeningTag(inFlightHtml, '発注済みチェックを解除', 'button').includes('disabled'));

    const idleProps = createMockOrderWorkbenchProps({
      candidates: [sampleCandidate],
      orderedDrugIds: new Set(['d1']),
      receivingDrugId: '',
      receivingDrafts: { d1: defaultReceivingDraft(sampleCandidate) }
    });
    const idleHtml = renderToStaticMarkup(React.createElement(OrderWorkbench, idleProps));

    const idleDisabled = listDisabledOpeningTags(idleHtml);
    assert.equal(idleDisabled.length, 2, `Expected 2 disabled buttons when all ordered and idle:\n${idleDisabled.join('\n')}`);

    const idleBtn = findOpeningTag(idleHtml, '<span>入庫登録</span>', 'button');
    assert.ok(!idleBtn.includes('disabled'), `Expected idle receiving button to be enabled: ${idleBtn}`);
    assert.ok(!findOpeningTag(idleHtml, '発注済みチェックを解除', 'button').includes('disabled'));
  });

  it('enables all header and receiving controls when open and ordered candidates coexist and renders restore error banner when hasRestoreError is true', () => {
    const orderedCandidate: InventoryOrderRisk = {
      ...sampleCandidate,
      drugId: 'd2',
      drugName: 'カロナール錠200'
    };

    const html = renderToStaticMarkup(
      React.createElement(
        OrderWorkbench,
        createMockOrderWorkbenchProps({
          candidates: [sampleCandidate, orderedCandidate],
          orderedDrugIds: new Set(['d2']),
          hasRestoreError: true,
          receivingDrugId: '',
          receivingDrafts: { d2: defaultReceivingDraft(orderedCandidate) }
        })
      )
    );

    assert.deepEqual(listDisabledOpeningTags(html), []);
    assert.ok(!findOpeningTag(html, '<span>未対応メモ</span>', 'button').includes('disabled'));
    assert.ok(!findOpeningTag(html, '<span>CSV</span>', 'button').includes('disabled'));
    assert.ok(!findOpeningTag(html, '<span>入庫メモ</span>', 'button').includes('disabled'));
    assert.ok(!findOpeningTag(html, '<span>入庫確認CSV</span>', 'button').includes('disabled'));
    assert.ok(!findOpeningTag(html, '<span>入庫登録</span>', 'button').includes('disabled'));
    assert.ok(!findOpeningTag(html, '発注済みチェックを解除', 'button').includes('disabled'));
    assert.ok(html.includes('分譲で融通'));
    assert.ok(html.includes('order-workbench-restore-error'));
    assert.ok(html.includes(getOrderWorkbenchRestoreErrorBannerMessage(true) ?? ''));

    const cleanHtml = renderToStaticMarkup(
      React.createElement(
        OrderWorkbench,
        createMockOrderWorkbenchProps({
          candidates: [sampleCandidate, orderedCandidate],
          orderedDrugIds: new Set(['d2']),
          hasRestoreError: false
        })
      )
    );
    assert.ok(!cleanHtml.includes('order-workbench-restore-error'));
  });
});

