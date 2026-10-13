import { test } from 'node:test';
import assert from 'node:assert';
import type { Drug } from '../db/types.ts';
import { restoreDrugMasterFromRollback, buildDrugMasterPartialImportErrorMessage } from './drug_master_rollback.ts';

const drug = (code: string, overrides: Partial<Drug> = {}): Drug => ({
  code, name: `薬${code}`, yjCode: '', isGeneric: false, isAbolished: false, price: 10, stockQuantity: 0, ...overrides
} as Drug);

function fakeDrugDb(initial: Drug[], options: { failUpsertCodes?: string[] } = {}) {
  const rows = new Map<string, Drug>(initial.map((d) => [d.code, d]));
  const makeDoc = (code: string) => ({
    toJSON: () => JSON.parse(JSON.stringify(rows.get(code))),
    remove: async () => { rows.delete(code); }
  });
  const db = {
    drugs: {
      findByIds: (codes: string[]) => ({
        exec: async () => new Map(codes.filter((c) => rows.has(c)).map((c) => [c, makeDoc(c)]))
      }),
      findOne: (code: string) => ({ exec: async () => (rows.has(code) ? makeDoc(code) : null) }),
      bulkUpsert: async (list: Drug[]) => {
        const error: unknown[] = [];
        for (const row of list) {
          if (options.failUpsertCodes?.includes(row.code)) { error.push({ documentId: row.code }); continue; }
          rows.set(row.code, JSON.parse(JSON.stringify(row)));
        }
        return { success: [], error };
      }
    }
  } as unknown as Parameters<typeof restoreDrugMasterFromRollback>[0];
  return { db, snapshot: () => JSON.parse(JSON.stringify(Object.fromEntries(rows))) as Record<string, Drug> };
}

// 更新後のマスタ: A は価格が更新済み、B は廃止済み、N はこの更新で追加された薬品
const afterUpdate = () => [drug('A', { price: 99 }), drug('B', { isAbolished: true }), drug('N'), drug('KEEP', { price: 5 })];
const payload = {
  restoreRows: [drug('A', { price: 10 }), drug('B', { isAbolished: false })],
  deleteCodes: ['N']
};

test('restoreDrugMasterFromRollback restores the previous rows and deletes the codes the update added', async () => {
  const { db, snapshot } = fakeDrugDb(afterUpdate());

  const result = await restoreDrugMasterFromRollback(db, payload);

  assert.deepStrictEqual({ restored: result.restoredCount, deleted: result.deletedCount }, { restored: 2, deleted: 1 });
  const rows = snapshot();
  assert.strictEqual(rows.A.price, 10);
  assert.strictEqual(rows.B.isAbolished, false);
  assert.strictEqual('N' in rows, false);
  assert.strictEqual(rows.KEEP.price, 5, 'untouched rows stay as they are');
});

test('undo puts the master back to exactly the state before the restore', async () => {
  const initial = afterUpdate();
  const { db, snapshot } = fakeDrugDb(initial);
  const result = await restoreDrugMasterFromRollback(db, payload);

  await result.undo();

  assert.deepStrictEqual(snapshot(), JSON.parse(JSON.stringify(Object.fromEntries(initial.map((d) => [d.code, d])))));
});

test('undo also removes a row the restore created that did not exist before', async () => {
  const { db, snapshot } = fakeDrugDb([drug('KEEP')]);
  const result = await restoreDrugMasterFromRollback(db, { restoreRows: [drug('GONE_BEFORE')], deleteCodes: [] });
  assert.ok('GONE_BEFORE' in snapshot());

  await result.undo();
  assert.deepStrictEqual(Object.keys(snapshot()), ['KEEP']);
});

test('restoreDrugMasterFromRollback counts only the codes that actually existed when deleting', async () => {
  const { db } = fakeDrugDb([drug('A')]);
  const result = await restoreDrugMasterFromRollback(db, { restoreRows: [], deleteCodes: ['A', 'MISSING'] });
  assert.strictEqual(result.deletedCount, 1);
});

test('restoreDrugMasterFromRollback fails loudly when some rows cannot be restored', async () => {
  const { db } = fakeDrugDb(afterUpdate(), { failUpsertCodes: ['B'] });
  await assert.rejects(
    () => restoreDrugMasterFromRollback(db, payload),
    new Error('1件の薬品マスター復元に失敗しました。')
  );
});

test('restoreDrugMasterFromRollback with an empty payload touches nothing', async () => {
  const { db, snapshot } = fakeDrugDb(afterUpdate());
  const before = snapshot();
  const result = await restoreDrugMasterFromRollback(db, { restoreRows: [], deleteCodes: [] });
  assert.deepStrictEqual(snapshot(), before);
  await result.undo();
  assert.deepStrictEqual(snapshot(), before);
});

test('buildDrugMasterPartialImportErrorMessage formats message for successful rollback', () => {
  const msg = buildDrugMasterPartialImportErrorMessage(3, true);
  assert.strictEqual(msg, '3件の薬品マスタ更新に失敗しました。取り込み前の状態へ戻しました。');
});

test('buildDrugMasterPartialImportErrorMessage formats message for failed rollback prompting manual check', () => {
  const msg = buildDrugMasterPartialImportErrorMessage(3, false);
  assert.strictEqual(msg, '3件の薬品マスタ更新に失敗し、取り込み前の状態への復元にも失敗しました。薬品マスタの内容を確認してください。');
});
