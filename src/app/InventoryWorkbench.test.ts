import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { findOpeningTag } from '@/lib/test_support/html_disabled_tags';
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

    const openMemoTag = findOpeningTag(html, '<span>未対応メモ</span>', 'button');
    assert.ok(openMemoTag.includes('disabled=""'), `Expected open memo button to be disabled: ${openMemoTag}`);

    const openCsvTag = findOpeningTag(html, '<span>CSV</span>', 'button');
    assert.ok(openCsvTag.includes('disabled=""'), `Expected open CSV button to be disabled: ${openCsvTag}`);

    const receivingMemoTag = findOpeningTag(html, '<span>入庫メモ</span>', 'button');
    assert.ok(receivingMemoTag.includes('disabled=""'), `Expected receiving memo button to be disabled: ${receivingMemoTag}`);

    const receivingChecklistTag = findOpeningTag(html, '<span>入庫確認CSV</span>', 'button');
    assert.ok(receivingChecklistTag.includes('disabled=""'), `Expected receiving checklist button to be disabled: ${receivingChecklistTag}`);
  });

  it('enables open memo and csv buttons while pinning receiving memo and checklist as disabled when un-ordered candidates exist', () => {
    const props = createMockOrderWorkbenchProps({
      candidates: [sampleCandidate],
      orderedDrugIds: new Set()
    });
    const html = renderToStaticMarkup(React.createElement(OrderWorkbench, props));

    const openMemoTag = findOpeningTag(html, '<span>未対応メモ</span>', 'button');
    assert.ok(!openMemoTag.includes('disabled'), `Expected open memo button to be enabled: ${openMemoTag}`);

    const openCsvTag = findOpeningTag(html, '<span>CSV</span>', 'button');
    assert.ok(!openCsvTag.includes('disabled'), `Expected open CSV button to be enabled: ${openCsvTag}`);

    const receivingMemoTag = findOpeningTag(html, '<span>入庫メモ</span>', 'button');
    assert.ok(receivingMemoTag.includes('disabled=""'), `Expected receiving memo button to be disabled: ${receivingMemoTag}`);

    const receivingChecklistTag = findOpeningTag(html, '<span>入庫確認CSV</span>', 'button');
    assert.ok(receivingChecklistTag.includes('disabled=""'), `Expected receiving checklist button to be disabled: ${receivingChecklistTag}`);
  });

  it('enables receiving memo and checklist while pinning open memo and csv as disabled when all candidates are ordered', () => {
    const props = createMockOrderWorkbenchProps({
      candidates: [sampleCandidate],
      orderedDrugIds: new Set(['d1'])
    });
    const html = renderToStaticMarkup(React.createElement(OrderWorkbench, props));

    const openMemoTag = findOpeningTag(html, '<span>未対応メモ</span>', 'button');
    assert.ok(openMemoTag.includes('disabled=""'), `Expected open memo button to be disabled: ${openMemoTag}`);

    const openCsvTag = findOpeningTag(html, '<span>CSV</span>', 'button');
    assert.ok(openCsvTag.includes('disabled=""'), `Expected open CSV button to be disabled: ${openCsvTag}`);

    const receivingMemoTag = findOpeningTag(html, '<span>入庫メモ</span>', 'button');
    assert.ok(!receivingMemoTag.includes('disabled'), `Expected receiving memo button to be enabled: ${receivingMemoTag}`);

    const receivingChecklistTag = findOpeningTag(html, '<span>入庫確認CSV</span>', 'button');
    assert.ok(!receivingChecklistTag.includes('disabled'), `Expected receiving checklist button to be enabled: ${receivingChecklistTag}`);
  });

  it('pins receiving submit button as disabled when receivingDrugId matches candidate during in-flight receiving', () => {
    const inFlightProps = createMockOrderWorkbenchProps({
      candidates: [sampleCandidate],
      orderedDrugIds: new Set(['d1']),
      receivingDrugId: 'd1',
      receivingDrafts: { d1: defaultReceivingDraft(sampleCandidate) }
    });
    const inFlightHtml = renderToStaticMarkup(React.createElement(OrderWorkbench, inFlightProps));

    const inFlightBtn = findOpeningTag(inFlightHtml, '<span>登録中...</span>', 'button');
    assert.ok(inFlightBtn.includes('disabled=""'), `Expected in-flight receiving button to be disabled: ${inFlightBtn}`);

    const idleProps = createMockOrderWorkbenchProps({
      candidates: [sampleCandidate],
      orderedDrugIds: new Set(['d1']),
      receivingDrugId: '',
      receivingDrafts: { d1: defaultReceivingDraft(sampleCandidate) }
    });
    const idleHtml = renderToStaticMarkup(React.createElement(OrderWorkbench, idleProps));

    const idleBtn = findOpeningTag(idleHtml, '<span>入庫登録</span>', 'button');
    assert.ok(!idleBtn.includes('disabled'), `Expected idle receiving button to be enabled: ${idleBtn}`);
  });
});

