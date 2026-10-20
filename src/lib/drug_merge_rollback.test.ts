import { test } from 'node:test';
import assert from 'node:assert';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { DRUG_SCHEMA, DRUG_STOCK_SCHEMA } from '../db/schema.ts';
import type { Drug } from '../db/types.ts';
import { AuditLogFailedError } from './audit_guard.ts';
import { buildDrugMergeExecutionPlan, buildDrugMergePlan } from './drug_merge.ts';
import { applyDrugMergeExecutionPlanWithAudit, createRxdbDrugMergeExecutionStore } from './drug_merge_execution.ts';

// 実際の RxDB(メモリ)・実際の薬品と在庫ロットのスキーマで、薬品統合を取り消すと統合前の状態に戻ることを確かめる。
async function createDb() {
  const db: any = await createRxDatabase({ name: `dmerge${Date.now()}${Math.random().toString(36).slice(2, 8)}`, storage: getRxStorageMemory() });
  await db.addCollections({
    drugs: { schema: { ...DRUG_SCHEMA, version: 0 } },
    drug_stocks: { schema: { ...DRUG_STOCK_SCHEMA, version: 0 } },
    prescription_items: { schema: {
      title: 'item', version: 0, primaryKey: 'itemId', type: 'object',
      properties: { itemId: { type: 'string', maxLength: 100 }, drugId: { type: 'string' }, dispensedDrugCode: { type: 'string' } }, required: ['itemId']
    } }
  } as any);
  return db;
}

// 残す薬品は棚番地・YJコード・文書URLを持たず、統合元が持っている(統合で補われる項目)。ハイリスク区分も統合元だけ。
const TARGET: Drug = { code: 'drug_target', name: 'アムロジピン錠5mg「テスト」', isGeneric: true, price: 10.1, stockQuantity: 30, reorderPoint: 40 };
const SOURCE: Drug = {
  code: 'drug_source', name: 'アムロジピン錠5mg「テスト」', yjCode: '2171022G1023', isGeneric: true, genericName: 'アムロジピン',
  price: 10.1, stockQuantity: 20, location: 'B-02', documentUrl: 'https://example.com/pi', isHighRisk: true
};

async function snapshot(db: any) {
  const rows = async (collection: any) => (await collection.find().exec()).map((doc: any) => JSON.parse(JSON.stringify(doc.toJSON())))
    .sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { drugs: await rows(db.drugs), stocks: await rows(db.drug_stocks), items: await rows(db.prescription_items) };
}

async function setup(db: any) {
  await db.drugs.bulkInsert([TARGET, SOURCE]);
  await db.drug_stocks.bulkInsert([
    { id: 'stock_1', drugCode: 'drug_source', quantity: 12, arrivalDate: '2026-09-01' },
    { id: 'stock_2', drugCode: 'drug_source', quantity: 8, arrivalDate: '2026-09-15' }
  ]);
  await db.prescription_items.bulkInsert([
    { itemId: 'item_1', drugId: 'drug_source', dispensedDrugCode: 'drug_source' },
    { itemId: 'item_2', drugId: 'drug_target' }
  ]);
  const plan = buildDrugMergePlan({
    targetDrug: TARGET, sourceDrug: SOURCE,
    sourceItemRefs: [{ itemId: 'item_1', field: 'drugId' }, { itemId: 'item_1', field: 'dispensedDrugCode' }],
    sourceStockIds: ['stock_1', 'stock_2']
  });
  return buildDrugMergeExecutionPlan(plan);
}

test('a drug merge moves stock lots and references to the kept drug and removes the source', async () => {
  const db = await createDb();
  try {
    const executionPlan = await setup(db);
    await applyDrugMergeExecutionPlanWithAudit({
      store: createRxdbDrugMergeExecutionStore(db), executionPlan, buildAuditDetail: () => 'x', logAudit: async () => true
    });

    const after = await snapshot(db);
    assert.deepStrictEqual(after.drugs.map((d: any) => d.code), ['drug_target']);
    assert.strictEqual(after.drugs[0].stockQuantity, 50);
    assert.strictEqual(after.drugs[0].location, 'B-02', 'filled in from the source');
    assert.strictEqual(after.drugs[0].reorderPoint, 40, 'the kept drug\'s own order setting is kept');
    assert.ok(after.stocks.every((s: any) => s.drugCode === 'drug_target'));
    const item1 = after.items.find((item: any) => item.itemId === 'item_1');
    assert.strictEqual(item1?.drugId, 'drug_target');
    assert.strictEqual(item1?.dispensedDrugCode, 'drug_target');
    const item2 = after.items.find((item: any) => item.itemId === 'item_2');
    assert.strictEqual(item2?.drugId, 'drug_target');
    assert.strictEqual(item2?.dispensedDrugCode, undefined);
  } finally { await db.close(); }
});

test('cancelling a drug merge (audit log missing) brings the drugs, lots and references back exactly', async () => {
  const db = await createDb();
  try {
    const executionPlan = await setup(db);
    const before = await snapshot(db);

    await assert.rejects(
      () => applyDrugMergeExecutionPlanWithAudit({
        store: createRxdbDrugMergeExecutionStore(db), executionPlan, buildAuditDetail: () => 'x', logAudit: async () => false
      }),
      (error: unknown) => error instanceof AuditLogFailedError && error.rollbackFailed === false
    );

    assert.deepStrictEqual(await snapshot(db), before,
      'the kept drug has no location, YJ code, document URL or high-risk flag again, and the source drug is back');
  } finally { await db.close(); }
});
