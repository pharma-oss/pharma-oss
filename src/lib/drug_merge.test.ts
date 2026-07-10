import { test } from 'node:test';
import assert from 'node:assert';
import type { Drug } from '../db/types.ts';
import {
  buildDrugMergeExecutionPlan,
  buildDrugMergePlan,
  buildDrugMergeRollbackOperations,
  invertDrugMergeOperation
} from './drug_merge.ts';
import {
  applyDrugMergeExecutionPlan,
  applyDrugMergeOperation,
  createRxdbDrugMergeExecutionStore,
  DrugMergeExecutionError,
  type DrugMergeExecutionStore
} from './drug_merge_execution.ts';

const targetDrug: Drug = {
  code: 'drug_target',
  name: 'アムロジピンOD錠5mg「テスト」',
  yjCode: '2171022G1023',
  isGeneric: true,
  price: 10.1,
  stockQuantity: 30,
  location: 'A-01'
};

const sourceDrug: Drug = {
  code: 'drug_source',
  name: 'アムロジピンOD錠5mg「テスト」',
  yjCode: '2171022G1023',
  isGeneric: true,
  price: 10.1,
  stockQuantity: 20,
  isHighRisk: true
};

test('薬品統合計画は在庫合算・安全区分維持・参照付け替え・統合元削除を含む', () => {
  const plan = buildDrugMergePlan({
    targetDrug,
    sourceDrug,
    sourceItemRefs: [
      { itemId: 'item_1', field: 'drugId' },
      { itemId: 'item_1', field: 'dispensedDrugCode' },
      { itemId: 'item_2', field: 'drugId' }
    ],
    sourceStockIds: ['stock_1', 'stock_2']
  });

  assert.strictEqual(plan.canApply, true);
  assert.strictEqual(plan.mergedDrug.stockQuantity, 50);
  // 統合元にだけ付いていたハイリスク区分は外さない
  assert.strictEqual(plan.mergedDrug.isHighRisk, true);
  assert.strictEqual(plan.mergedDrug.location, 'A-01');

  const executionPlan = buildDrugMergeExecutionPlan(plan);
  const types = executionPlan.applyOperations.map((operation) => operation.type);
  assert.deepStrictEqual(types, [
    'upsert_drug',
    'patch_item_drug',
    'patch_item_drug',
    'patch_item_drug',
    'patch_stock_drug',
    'patch_stock_drug',
    'delete_drug'
  ]);
  // ロールバックは逆順で、削除はupsert(復元)になる
  const rollbackTypes = executionPlan.rollbackOperations.map((operation) => operation.type);
  assert.strictEqual(rollbackTypes[0], 'upsert_drug');
  assert.strictEqual(rollbackTypes[rollbackTypes.length - 1], 'upsert_drug');
});

test('YJコードが異なる統合は実行不可、薬価差・テンプレ残りは警告', () => {
  const plan = buildDrugMergePlan({
    targetDrug,
    sourceDrug: { ...sourceDrug, yjCode: '9999999X9999' }
  });
  assert.strictEqual(plan.canApply, false);
  assert.ok(plan.issues.some((issue) => issue.code === 'drug_merge_yj_differs' && issue.severity === 'error'));
  const executionPlan = buildDrugMergeExecutionPlan(plan);
  assert.strictEqual(executionPlan.canApply, false);
  assert.strictEqual(executionPlan.applyOperations.length, 0);

  const warned = buildDrugMergePlan({
    targetDrug,
    sourceDrug: { ...sourceDrug, price: 12.3 },
    sourceTemplateCount: 2,
    sourceGuidanceCount: 1
  });
  assert.strictEqual(warned.canApply, true);
  assert.ok(warned.issues.some((issue) => issue.code === 'drug_merge_price_differs' && issue.severity === 'warning'));
  assert.ok(warned.issues.some((issue) => issue.code === 'drug_merge_source_documents'));
});

test('invertDrugMergeOperation は各操作の逆操作を返す', () => {
  const patch = invertDrugMergeOperation({
    type: 'patch_item_drug',
    itemId: 'item_1',
    field: 'drugId',
    beforeCode: 'drug_source',
    afterCode: 'drug_target'
  });
  assert.deepStrictEqual(patch, {
    type: 'patch_item_drug',
    itemId: 'item_1',
    field: 'drugId',
    beforeCode: 'drug_target',
    afterCode: 'drug_source'
  });

  const restore = invertDrugMergeOperation({ type: 'delete_drug', code: 'drug_source', before: sourceDrug });
  assert.strictEqual(restore.type, 'upsert_drug');
});

test('実行途中で失敗した場合は適用済み操作分のロールバックを返す', async () => {
  const plan = buildDrugMergePlan({
    targetDrug,
    sourceDrug,
    sourceItemRefs: [{ itemId: 'item_broken', field: 'drugId' }],
    sourceStockIds: []
  });
  const executionPlan = buildDrugMergeExecutionPlan(plan);
  const store: DrugMergeExecutionStore = {
    upsertDrug: async () => {},
    deleteDrug: async () => {},
    patchItemDrugField: async () => { throw new Error('boom'); },
    patchStockDrug: async () => {}
  };

  await assert.rejects(
    () => applyDrugMergeExecutionPlan(store, executionPlan),
    (error: unknown) => {
      assert.ok(error instanceof DrugMergeExecutionError);
      assert.strictEqual(error.appliedOperations.length, 1);
      assert.strictEqual(error.rollbackOperations.length, 1);
      assert.strictEqual(error.rollbackOperations[0].type, 'upsert_drug');
      return true;
    }
  );

  const rollback = buildDrugMergeRollbackOperations(executionPlan.applyOperations);
  assert.strictEqual(rollback.length, executionPlan.applyOperations.length);
});

test('createRxdbDrugMergeExecutionStore はRxDB文書を更新・削除する', async () => {
  const calls: string[] = [];
  const makeDoc = (id: string) => ({
    patch: async (value: unknown) => { calls.push(`patch:${id}:${JSON.stringify(value)}`); },
    remove: async () => { calls.push(`remove:${id}`); }
  });
  const collection = (docs: Record<string, ReturnType<typeof makeDoc>>) => ({
    findOne: (id: string) => ({ exec: async () => docs[id] || null }),
    insert: async (value: { code?: string }) => { calls.push(`insert:${value.code}`); }
  });
  const db = {
    drugs: collection({ drug_target: makeDoc('drug_target') }),
    drug_stocks: collection({ stock_1: makeDoc('stock_1') }),
    prescription_items: collection({ item_1: makeDoc('item_1') })
  };
  const store = createRxdbDrugMergeExecutionStore(db);

  await store.upsertDrug(targetDrug);
  await store.upsertDrug({ ...sourceDrug, code: 'drug_new' });
  await store.deleteDrug('drug_target');
  await store.deleteDrug('drug_missing');
  await store.patchItemDrugField('item_1', 'drugId', 'drug_target');
  await store.patchStockDrug('stock_1', 'drug_target');
  await assert.rejects(() => store.patchItemDrugField('item_missing', 'drugId', 'drug_target'), /処方明細が見つかりません/);
  await assert.rejects(() => store.patchStockDrug('stock_missing', 'drug_target'), /在庫ロットが見つかりません/);

  assert.ok(calls.some((call) => call.startsWith('patch:drug_target')));
  assert.ok(calls.includes('insert:drug_new'));
  assert.ok(calls.includes('remove:drug_target'));
  assert.ok(calls.some((call) => call.includes('patch:item_1') && call.includes('drugId')));
  assert.ok(calls.some((call) => call.includes('patch:stock_1') && call.includes('drugCode')));
});
