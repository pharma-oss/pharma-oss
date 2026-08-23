import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OrderWorkbench } from './inventory/components/OrderWorkbench';
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
});
