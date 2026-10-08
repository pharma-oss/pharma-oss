import { test } from 'node:test';
import assert from 'node:assert';
import type { Drug } from '../db/types.ts';
import {
  buildDrugMergeExecutionPlan,
  buildDrugMergePlan,
  buildDrugMergeRollbackOperations,
  invertDrugMergeOperation
} from './drug_merge.ts';
import { AuditLogFailedError, ROLLBACK_ALSO_FAILED_NOTE } from './audit_guard.ts';
import {
  applyDrugMergeExecutionPlan,
  applyDrugMergeExecutionPlanWithAudit,
  applyDrugMergeOperation,
  DRUG_MERGE_AUDIT_ROLLED_BACK,
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

// ---- 監査ログが残らなければ統合を取り消す ----

function statefulDrugStore(options: { failOnRollback?: boolean } = {}) {
  const state = {
    drugs: { drug_target: { ...targetDrug }, drug_source: { ...sourceDrug } } as Record<string, Drug>,
    items: {
      item_1: { drugId: 'drug_source', dispensedDrugCode: 'drug_source' },
      item_2: { drugId: 'drug_source', dispensedDrugCode: '' }
    } as Record<string, Record<string, string>>,
    stocks: { stock_1: 'drug_source', stock_2: 'drug_source' } as Record<string, string>
  };
  let applying = true;
  const store: DrugMergeExecutionStore = {
    async upsertDrug(drug) { if (!applying && options.failOnRollback) throw new Error('rollback failed'); state.drugs[drug.code] = { ...drug }; },
    async deleteDrug(code) { delete state.drugs[code]; },
    async patchItemDrugField(itemId, field, code) { state.items[itemId][field] = code; },
    async patchStockDrug(stockId, code) { state.stocks[stockId] = code; }
  };
  return { state, store, startRollback: () => { applying = false; } };
}

const mergePlanInput = {
  targetDrug,
  sourceDrug,
  sourceItemRefs: [
    { itemId: 'item_1', field: 'drugId' as const },
    { itemId: 'item_1', field: 'dispensedDrugCode' as const },
    { itemId: 'item_2', field: 'drugId' as const }
  ],
  sourceStockIds: ['stock_1', 'stock_2']
};

test('applyDrugMergeExecutionPlanWithAudit keeps the merge and audits with the wording built from the result', async () => {
  const { state, store } = statefulDrugStore();
  const executionPlan = buildDrugMergeExecutionPlan(buildDrugMergePlan(mergePlanInput));
  const details: string[] = [];

  const result = await applyDrugMergeExecutionPlanWithAudit({
    store, executionPlan,
    buildAuditDetail: (r) => `統合実行: ${r.appliedOperations.length}操作`,
    logAudit: async (detail) => { details.push(detail); return true; }
  });

  assert.strictEqual(details.length, 1);
  assert.match(details[0], /^統合実行: \d+操作$/);
  assert.strictEqual('drug_source' in state.drugs, false, 'the source drug is gone');
  assert.strictEqual(state.items.item_1.drugId, 'drug_target');
  assert.strictEqual(state.stocks.stock_2, 'drug_target');
  assert.ok(result.rollbackOperations.length > 0);
});

test('applyDrugMergeExecutionPlanWithAudit puts every drug, item and stock back when the audit log fails', async () => {
  const { state, store } = statefulDrugStore();
  const before = JSON.parse(JSON.stringify(state));
  const executionPlan = buildDrugMergeExecutionPlan(buildDrugMergePlan(mergePlanInput));

  await assert.rejects(
    () => applyDrugMergeExecutionPlanWithAudit({ store, executionPlan, buildAuditDetail: () => 'x', logAudit: async () => false }),
    (error: unknown) => {
      assert.ok(error instanceof AuditLogFailedError);
      assert.strictEqual(error.message, DRUG_MERGE_AUDIT_ROLLED_BACK);
      return true;
    }
  );

  assert.deepStrictEqual(JSON.parse(JSON.stringify(state)), before, 'the data is exactly as it was before the merge');
});

test('applyDrugMergeExecutionPlanWithAudit says so when the undo also fails', async () => {
  const { state, store, startRollback } = statefulDrugStore({ failOnRollback: true });
  const executionPlan = buildDrugMergeExecutionPlan(buildDrugMergePlan(mergePlanInput));

  await assert.rejects(
    () => applyDrugMergeExecutionPlanWithAudit({
      store, executionPlan, buildAuditDetail: () => 'x',
      logAudit: async () => { startRollback(); return false; }
    }),
    (error: unknown) => {
      assert.ok(error instanceof AuditLogFailedError);
      assert.strictEqual(error.rollbackFailed, true);
      assert.strictEqual(error.message, `${DRUG_MERGE_AUDIT_ROLLED_BACK}${ROLLBACK_ALSO_FAILED_NOTE}`);
      return true;
    }
  );
  assert.strictEqual('drug_source' in state.drugs, false, 'the half-undone state is reported, not hidden');
});

