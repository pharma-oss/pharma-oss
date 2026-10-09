import { test } from 'node:test';
import assert from 'node:assert';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { DRUG_SCHEMA, DRUG_STOCK_SCHEMA } from '../db/schema.ts';
import type { Drug, DrugStock } from '../db/types.ts';
import { AuditLogFailedError, ROLLBACK_ALSO_FAILED_NOTE, runWithAuditRollback } from './audit_guard.ts';
import { deliveryWriteFailureMessage, writeDeliveryStock } from './delivery_import.ts';

// 実際のスキーマ(項目はそのまま、移行の版だけ 0 にして)・実際の RxDB(メモリ)で、
// 納品書の取込が既存の薬品マスタを壊さないことを確かめる。
async function createDb() {
  const db: any = await createRxDatabase({ name: `deliv${Date.now()}${Math.random().toString(36).slice(2, 8)}`, storage: getRxStorageMemory() });
  await db.addCollections({
    drugs: { schema: { ...DRUG_SCHEMA, version: 0 } },
    drug_stocks: { schema: { ...DRUG_STOCK_SCHEMA, version: 0 } }
  } as any);
  return db;
}

// スキーマの全項目に値を持つ薬品。取込のあとも、在庫数以外は1項目も変わらないこと
const FULL_DRUG: Drug = {
  code: 'D1', name: 'アムロジピン錠5mg', yjCode: '2171022F1010', isGeneric: true, genericName: 'アムロジピン', isAbolished: false,
  price: 10.1, priceHistory: [{ price: 12.3, effectiveFrom: '2024-04-01' }, { price: 10.1, effectiveFrom: '2025-04-01' }],
  stockQuantity: 100, location: 'A-01-02', isNarcotic: false, isPsychotropic: false, isPoisonous: false, isHighRisk: true,
  documentUrl: 'https://example.com/pi', unitText: '錠', unitCode: '001', reorderPoint: 30, leadTimeDays: 3, targetStock: 200
};

const lot = (id: string, quantity: number): DrugStock => ({ id, drugCode: 'D1', quantity, arrivalDate: '2026-10-10' });

test('the test drug has a value for every field of the drug schema, so the next test cannot miss a new field', () => {
  assert.deepStrictEqual(Object.keys(FULL_DRUG).sort(), Object.keys(DRUG_SCHEMA.properties).sort());
});

test('writeDeliveryStock adds the lots and raises the stock count and changes nothing else on the drug', async () => {
  const db = await createDb();
  try {
    await db.drugs.insert(FULL_DRUG);

    await writeDeliveryStock(db, [lot('l1', 20), lot('l2', 5)], new Map([['D1', 25]]));

    assert.deepStrictEqual((await db.drugs.findOne('D1').exec()).toJSON(), { ...FULL_DRUG, stockQuantity: 125 },
      'price history, unit, reorder point, lead time and target stock are all still there');
    assert.strictEqual(await db.drug_stocks.count().exec(), 2);
  } finally { await db.close(); }
});

test('writeDeliveryStock leaves nothing behind when one lot cannot be registered', async () => {
  const db = await createDb();
  try {
    await db.drugs.insert(FULL_DRUG);
    await db.drug_stocks.insert(lot('l2', 7)); // l2 はすでに存在する => この1件だけ失敗する(例外にはならない)

    await assert.rejects(
      () => writeDeliveryStock(db, [lot('l1', 20), lot('l2', 5)], new Map([['D1', 25]])),
      /1 件のロット在庫登録に失敗しました。$/
    );

    assert.strictEqual(await db.drug_stocks.count().exec(), 1, 'only the lot that was there before');
    assert.strictEqual((await db.drug_stocks.findOne('l2').exec()).quantity, 7, 'and it is untouched');
    assert.strictEqual((await db.drugs.findOne('D1').exec()).stockQuantity, 100);
  } finally { await db.close(); }
});

test('writeDeliveryStock puts every count and lot back when a later drug write fails', async () => {
  const db = await createDb();
  try {
    await db.drugs.insert(FULL_DRUG);
    await db.drugs.insert({ ...FULL_DRUG, code: 'D2', name: '別の薬', stockQuantity: 50 });
    const real = await db.drugs.findByIds(['D1', 'D2']).exec();
    // 2つ目の薬品の書き込みだけ失敗する
    const failingDb = {
      drug_stocks: db.drug_stocks,
      drugs: { findByIds: () => ({ exec: async () => new Map([
        ['D1', real.get('D1')],
        ['D2', { stockQuantity: 50, patch: async () => { throw new Error('write failed'); }, incrementalPatch: async () => undefined }]
      ]) }) }
    };

    await assert.rejects(
      () => writeDeliveryStock(failingDb as any, [lot('l1', 20), { ...lot('l3', 4), drugCode: 'D2' }], new Map([['D1', 20], ['D2', 4]])),
      /write failed$/
    );

    assert.strictEqual(await db.drug_stocks.count().exec(), 0, 'both lots removed');
    assert.strictEqual((await db.drugs.findOne('D1').exec()).stockQuantity, 100, 'the first drug is back to its count');
  } finally { await db.close(); }
});

test('undo() brings the previous counts back and removes the lots (the audit log was not recorded)', async () => {
  const db = await createDb();
  try {
    await db.drugs.insert(FULL_DRUG);
    const written = await writeDeliveryStock(db, [lot('l1', 20)], new Map([['D1', 20]]));
    assert.strictEqual((await db.drugs.findOne('D1').exec()).stockQuantity, 120);

    assert.strictEqual(await written.undo(), '', 'nothing to warn about');

    assert.deepStrictEqual((await db.drugs.findOne('D1').exec()).toJSON(), FULL_DRUG);
    assert.strictEqual(await db.drug_stocks.count().exec(), 0);
  } finally { await db.close(); }
});

test('undo() returns the warning when a lot cannot be removed, and still puts the count back', async () => {
  const db = await createDb();
  try {
    await db.drugs.insert(FULL_DRUG);
    const brokenDb = {
      drugs: db.drugs,
      drug_stocks: { bulkInsert: async () => ({ success: [{ remove: async () => { throw new Error('storage unavailable'); } }], error: [] }) }
    };
    const written = await writeDeliveryStock(brokenDb as any, [lot('l1', 20)], new Map([['D1', 20]]));

    assert.strictEqual(await written.undo(), ROLLBACK_ALSO_FAILED_NOTE);
    assert.strictEqual((await db.drugs.findOne('D1').exec()).stockQuantity, 100);
  } finally { await db.close(); }
});

test('writeDeliveryStock fails, and removes the lot, when the drug is not in the master (no lot without a count)', async () => {
  const db = await createDb();
  try {
    await db.drugs.insert(FULL_DRUG);

    await assert.rejects(
      () => writeDeliveryStock(db, [lot('l1', 20), { ...lot('l9', 3), drugCode: 'GONE' }], new Map([['D1', 20], ['GONE', 3]])),
      /薬品マスタに見つかりません: GONE/
    );

    assert.strictEqual(await db.drug_stocks.count().exec(), 0);
    assert.strictEqual((await db.drugs.findOne('D1').exec()).stockQuantity, 100);
  } finally { await db.close(); }
});

// 発注ワークベンチの入荷登録と同じ組み立て: 書き込み -> 監査ログ。残らなければ取り消す。
function receive(db: any, auditOk: boolean) {
  return runWithAuditRollback({
    write: () => writeDeliveryStock(db, [lot('r1', 30)], new Map([['D1', 30]])),
    logAudit: async () => auditOk,
    rollback: async (written) => { const note = await written.undo(); if (note) throw new Error(note); },
    failureMessage: '入庫登録の監査ログ記録に失敗したため、入庫を取り消しました。'
  });
}

test('receiving stock keeps the lot and the count when the audit log is recorded', async () => {
  const db = await createDb();
  try {
    await db.drugs.insert(FULL_DRUG);
    await receive(db, true);
    assert.strictEqual((await db.drugs.findOne('D1').exec()).stockQuantity, 130);
    assert.strictEqual(await db.drug_stocks.count().exec(), 1);
  } finally { await db.close(); }
});

test('receiving stock removes the lot and puts the count back when the audit log is missing', async () => {
  const db = await createDb();
  try {
    await db.drugs.insert(FULL_DRUG);

    const error = await receive(db, false).then(() => null, (caught: unknown) => caught);

    assert.ok(error instanceof AuditLogFailedError);
    assert.strictEqual(error.rollbackFailed, false);
    assert.deepStrictEqual((await db.drugs.findOne('D1').exec()).toJSON(), FULL_DRUG, 'the drug is exactly as before');
    assert.strictEqual(await db.drug_stocks.count().exec(), 0);
    assert.strictEqual(deliveryWriteFailureMessage(error, '入庫登録に失敗しました。'), `入庫登録に失敗しました。 ${error.message}`);
  } finally { await db.close(); }
});

test('deliveryWriteFailureMessage shows a reason only for a cancelled import or a failed undo', () => {
  const fallback = 'インポート中にエラーが発生しました。';
  assert.strictEqual(deliveryWriteFailureMessage(new Error('1 件のロット在庫登録に失敗しました。'), fallback), fallback, 'internal wording is not shown');
  assert.strictEqual(deliveryWriteFailureMessage('string', fallback), fallback);
  assert.match(deliveryWriteFailureMessage(new Error(`write failed${ROLLBACK_ALSO_FAILED_NOTE}`), fallback), /元に戻す処理にも失敗しました/);
  assert.match(deliveryWriteFailureMessage(new AuditLogFailedError('取り消しました'), fallback), /取り消しました$/);
});
