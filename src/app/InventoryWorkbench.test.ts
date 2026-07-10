import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const inventorySource = readFileSync(new URL('./inventory/page.tsx', import.meta.url), 'utf8');

test('inventory page exposes an order workbench for active shortages', () => {
  assert.match(inventorySource, /order-workbench/);
  assert.match(inventorySource, /発注ワークベンチ/);
  assert.match(inventorySource, /OrderWorkbench/);
  assert.match(inventorySource, /orderCandidates/);
  assert.match(inventorySource, /pendingVisitCountMap/);
  assert.match(inventorySource, /isClaimEditBlocked/);
  assert.match(inventorySource, /filter\(\(visit\) => !isClaimEditBlocked\(visit\.claimLifecycle\)\)/);
  assert.match(inventorySource, /stockLotsByDrugCode/);
  assert.match(inventorySource, /db\.drug_stocks\.find/);
  assert.match(inventorySource, /choosePrimarySupplier/);
  assert.match(inventorySource, /getInventoryOrderPriority/);
  assert.match(inventorySource, /getInventoryOrderActionLabel/);
});

test('inventory order workbench supports export, memo copy, and same-day ordered state', () => {
  assert.match(inventorySource, /ORDER_WORKBENCH_STORAGE_PREFIX/);
  assert.match(inventorySource, /orderedDrugIds/);
  assert.match(inventorySource, /localStorage\.setItem/);
  assert.match(inventorySource, /buildInventoryOrderCsv/);
  assert.match(inventorySource, /buildInventoryOrderMemo/);
  assert.match(inventorySource, /yakureki-order-workbench/);
  assert.match(inventorySource, /未対応メモ/);
  assert.match(inventorySource, /発注済みにする/);
  assert.match(inventorySource, /発注済みチェックを解除/);
});
