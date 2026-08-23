import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DailyCheckPanel } from './inventory/components/DailyCheckPanel';
import {
  DAILY_CONTROLLED_DRUG_DIFFERENCE_REASONS,
  DAILY_CONTROLLED_DRUG_SNAPSHOT_STORAGE_KEY,
  hasDailyControlledDrugActualCount,
  getDailyControlledDrugCheckSummary,
  getDailyControlledDrugMissingReasonRows,
  type DailyControlledDrugCheckRow
} from '@/lib/inventory_daily_check';

describe('InventoryDailyCheck components and pure contracts', () => {
  it('exports DailyCheckPanel as a callable React component function', () => {
    assert.equal(typeof DailyCheckPanel, 'function');
  });

  it('defines structured difference reasons and storage key', () => {
    assert.ok(DAILY_CONTROLLED_DRUG_DIFFERENCE_REASONS.length >= 4);
    assert.equal(DAILY_CONTROLLED_DRUG_SNAPSHOT_STORAGE_KEY, 'yakureki_controlled_drug_daily_check_latest_v1');
  });

  it('correctly calculates summary and identifies missing reason rows', () => {
    const rows: DailyControlledDrugCheckRow[] = [
      {
        drugCode: 'd1',
        drugName: '麻薬A',
        kind: 'narcotic',
        systemStock: 10,
        pendingStock: 0,
        shelfStockSystem: 10,
        actualCount: 10
      },
      {
        drugCode: 'd2',
        drugName: '向精神薬B',
        kind: 'psychotropic',
        systemStock: 20,
        pendingStock: 0,
        shelfStockSystem: 20,
        actualCount: 18 // mismatch without reason
      },
      {
        drugCode: 'd3',
        drugName: '麻薬C',
        kind: 'narcotic',
        systemStock: 5,
        pendingStock: 0,
        shelfStockSystem: 5 // unentered
      }
    ];

    const summary = getDailyControlledDrugCheckSummary(rows);
    assert.equal(summary.totalCount, 3);
    assert.equal(summary.enteredCount, 2);
    assert.equal(summary.unenteredCount, 1);
    assert.equal(summary.mismatchCount, 1);

    const missingReasonRows = getDailyControlledDrugMissingReasonRows(rows);
    assert.equal(missingReasonRows.length, 1);
    assert.equal(missingReasonRows[0].drugCode, 'd2');
  });
});
