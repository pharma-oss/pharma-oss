import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyReversiblePatches,
  PatchRollbackError,
  rollbackAppliedPatches,
  type ReversiblePatch
} from './emr_helpers.ts';
import { AuditLogFailedError, ROLLBACK_ALSO_FAILED_NOTE, runWithAuditRollback } from './audit_guard.ts';
import { RxLikeStore } from './test_support/rxdb_like_doc.ts';

// 本物の RxDB と同じ「版」の性質を持つドキュメント(test_support/rxdb_like_doc)。
// 同じインスタンスで一度書いたあとにもう一度 patch() すると CONFLICT になる。
// failOn に一致する書き込みは失敗させる。
function fakeDoc(initial: Record<string, unknown>, failOn: (patch: Record<string, unknown>) => boolean = () => false) {
  const store = new RxLikeStore(initial);
  store.failWrite = failOn;
  return { doc: store.open(), get state() { return store.current(); } };
}

// 在庫ロット・薬品マスタ・受付の3つを1回の完了で書き換える、薬歴完了と同じ形
function completionScenario(options: { failOn?: { lot?: (p: Record<string, unknown>) => boolean; drug?: (p: Record<string, unknown>) => boolean; visit?: (p: Record<string, unknown>) => boolean } } = {}) {
  const lot = fakeDoc({ quantity: 10 }, options.failOn?.lot);
  const drug = fakeDoc({ stockQuantity: 10 }, options.failOn?.drug);
  const visit = fakeDoc({ status: 'processing' }, options.failOn?.visit);
  const operations: ReversiblePatch[] = [
    { doc: lot.doc, patch: { quantity: 7 }, rollbackPatch: { quantity: 10 }, label: 'drug stock lot_1' },
    { doc: drug.doc, patch: { stockQuantity: 7 }, rollbackPatch: { stockQuantity: 10 }, label: 'drug master D-1' },
    { doc: visit.doc, patch: { status: 'completed' }, rollbackPatch: { status: 'processing' }, label: 'visit v1' }
  ];
  const snapshot = () => ({ lot: { ...lot.state }, drug: { ...drug.state }, visit: { ...visit.state } });
  return { operations, snapshot };
}

const BEFORE = { lot: { quantity: 10 }, drug: { stockQuantity: 10 }, visit: { status: 'processing' } };
const AFTER = { lot: { quantity: 7 }, drug: { stockQuantity: 7 }, visit: { status: 'completed' } };

test('applyReversiblePatches applies every write in order and returns them', async () => {
  const { operations, snapshot } = completionScenario();

  const applied = await applyReversiblePatches(operations);

  assert.deepStrictEqual(applied.map((op) => op.label), ['drug stock lot_1', 'drug master D-1', 'visit v1']);
  assert.deepStrictEqual(snapshot(), AFTER);
});

test('applyReversiblePatches puts back the writes already made when a later one fails', async () => {
  const { operations, snapshot } = completionScenario({ failOn: { visit: (p) => p.status === 'completed' } });

  await assert.rejects(() => applyReversiblePatches(operations), /write failed/);

  assert.deepStrictEqual(snapshot(), BEFORE, 'stock and the visit are as they were');
});

test('applyReversiblePatches says so when the undo fails too, and still tries the other writes', async () => {
  // 受付の書き込みで失敗。戻す処理は薬品マスタの分だけ失敗する
  const { operations, snapshot } = completionScenario({
    failOn: {
      visit: (p) => p.status === 'completed',
      drug: (p) => p.stockQuantity === 10
    }
  });

  await assert.rejects(
    () => applyReversiblePatches(operations),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /write failed/, 'the original reason is kept');
      assert.ok(error.message.endsWith(ROLLBACK_ALSO_FAILED_NOTE));
      return true;
    }
  );

  assert.strictEqual(snapshot().lot.quantity, 10, 'the lot was still put back although the drug master could not be');
  assert.strictEqual(snapshot().drug.stockQuantity, 7, 'the one that could not be undone stays, and the user is told');
});

test('rollbackAppliedPatches throws PatchRollbackError naming what could not be put back', async () => {
  const { operations, snapshot } = completionScenario({ failOn: { drug: (p) => p.stockQuantity === 10 } });
  const applied = await applyReversiblePatches(operations);

  await assert.rejects(
    () => rollbackAppliedPatches(applied),
    (error: unknown) => {
      assert.ok(error instanceof PatchRollbackError);
      assert.deepStrictEqual(error.failedLabels, ['drug master D-1']);
      return true;
    }
  );

  assert.strictEqual(snapshot().visit.status, 'processing', 'the others were put back');
  assert.strictEqual(snapshot().lot.quantity, 10);
});

test('the completion flow undoes stock and status when the audit log is missing, and when the audit step throws', async () => {
  for (const audit of [
    async () => false,
    async (): Promise<boolean> => { throw new Error('patient lookup failed'); }
  ]) {
    const { operations, snapshot } = completionScenario();

    await assert.rejects(
      () => runWithAuditRollback({
        write: () => applyReversiblePatches(operations),
        logAudit: audit,
        rollback: (applied) => rollbackAppliedPatches(applied),
        failureMessage: '監査ログを記録できなかったため、元に戻しました。'
      }),
      (error: unknown) => error instanceof Error && (error instanceof AuditLogFailedError || /patient lookup failed/.test(error.message))
    );

    assert.deepStrictEqual(snapshot(), BEFORE);
  }
});

test('the completion flow tells the user to check the data when the undo after a missing audit log fails', async () => {
  const { operations } = completionScenario({ failOn: { lot: (p) => p.quantity === 10 } });

  await assert.rejects(
    () => runWithAuditRollback({
      write: () => applyReversiblePatches(operations),
      logAudit: async () => false,
      rollback: (applied) => rollbackAppliedPatches(applied),
      failureMessage: '監査ログを記録できなかったため、元に戻しました。'
    }),
    (error: unknown) => {
      assert.ok(error instanceof AuditLogFailedError);
      assert.strictEqual(error.rollbackFailed, true);
      assert.ok(error.message.endsWith(ROLLBACK_ALSO_FAILED_NOTE));
      return true;
    }
  );
});
