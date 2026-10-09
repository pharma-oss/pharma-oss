import { test } from 'node:test';
import assert from 'node:assert';
import { ROLLBACK_ALSO_FAILED_NOTE } from './audit_guard.ts';
import {
  applyReversiblePatches,
  restoreFields,
  restoreWith,
  undoAppliedPatchesNote,
  type ReversiblePatch
} from './rxdb_restore.ts';
import { RxLikeStore } from './test_support/rxdb_like_doc.ts';

// 月次請求の一括処理(UKE出力・一括締め・審査結果の取込)と同じ形: 複数の受付の請求状態をまとめて書き換え、
// 途中や後続の監査ログで失敗したらまとめて戻す。
function visits(lifecycles: Array<Record<string, unknown> | undefined>) {
  const stores = lifecycles.map((claimLifecycle, i) => {
    const initial: Record<string, unknown> = { visitId: `v${i + 1}` };
    if (claimLifecycle) initial.claimLifecycle = claimLifecycle;
    return new RxLikeStore(initial);
  });
  const patches = (next: Record<string, unknown>): ReversiblePatch[] => stores.map((store, i) => ({
    doc: store.open(),
    patch: { claimLifecycle: next },
    rollbackPatch: { claimLifecycle: lifecycles[i] },
    label: `visit v${i + 1}`
  }));
  const lifecyclesNow = () => stores.map((store) => store.current().claimLifecycle);
  return { stores, patches, lifecyclesNow };
}

const DRAFT = { status: 'draft' };
const EXPORTED = { status: 'exported', fileName: 'RECEIPTY.CYO' };

test('applyReversiblePatches updates every visit and undoAppliedPatchesNote puts all of them back when the audit log fails', async () => {
  const { patches, lifecyclesNow } = visits([DRAFT, DRAFT, DRAFT]);

  const applied = await applyReversiblePatches(patches(EXPORTED));
  assert.deepStrictEqual(lifecyclesNow(), [EXPORTED, EXPORTED, EXPORTED]);

  assert.strictEqual(await undoAppliedPatchesNote(applied), '', 'nothing to warn about');
  assert.deepStrictEqual(lifecyclesNow(), [DRAFT, DRAFT, DRAFT]);
});

test('applyReversiblePatches leaves no half-updated visits when the third write fails', async () => {
  const { stores, patches, lifecyclesNow } = visits([DRAFT, DRAFT, DRAFT]);
  stores[2].failWrite = (values) => (values.claimLifecycle as any)?.status === 'exported';

  await assert.rejects(() => applyReversiblePatches(patches(EXPORTED)), /write failed/);

  assert.deepStrictEqual(lifecyclesNow(), [DRAFT, DRAFT, DRAFT], 'the first two are back to draft');
});

test('undoAppliedPatchesNote returns the warning when one visit cannot be put back, and still restores the others', async () => {
  const { stores, patches, lifecyclesNow } = visits([DRAFT, DRAFT, DRAFT]);
  const applied = await applyReversiblePatches(patches(EXPORTED));
  stores[1].failWrite = (values) => (values.claimLifecycle as any)?.status === 'draft';

  const note = await undoAppliedPatchesNote(applied);

  assert.strictEqual(note, ROLLBACK_ALSO_FAILED_NOTE);
  assert.deepStrictEqual(lifecyclesNow(), [DRAFT, EXPORTED, DRAFT], 'only the one that failed stays changed');
});

test('a visit that had no claim lifecycle gets none again after the undo', async () => {
  const { patches, lifecyclesNow } = visits([undefined, DRAFT]);

  const applied = await applyReversiblePatches(patches(EXPORTED));
  await undoAppliedPatchesNote(applied);

  assert.deepStrictEqual(lifecyclesNow(), [undefined, DRAFT]);
});

test('restoreFields writes against the latest revision, also after another writer', async () => {
  const store = new RxLikeStore({ price: 10, name: 'a' });
  const stale = store.open();
  await store.open().patch({ name: 'b' });

  await restoreFields(stale, { price: 12 });

  assert.deepStrictEqual(store.current(), { price: 12, name: 'b' }, 'the other writer\'s field is kept');
});

test('restoreFields and restoreWith fall back to patch / modify for documents without the incremental methods', async () => {
  const calls: string[] = [];
  const plain = {
    patch: async (values: unknown) => { calls.push(`patch ${JSON.stringify(values)}`); },
    modify: async (mutate: (data: any) => any) => { calls.push(`modify ${JSON.stringify(mutate({ a: 1 }))}`); }
  };

  await restoreFields(plain, { a: 2 });
  await restoreWith(plain, (data) => ({ ...data, a: 3 }));

  assert.deepStrictEqual(calls, ['patch {"a":2}', 'modify {"a":3}']);
});

test('restoreWith can remove a field, which writing a value cannot', async () => {
  const store = new RxLikeStore({ id: 'i1', drugPriceOverride: { price: 12.3 } });
  const stale = store.open();
  await store.open().patch({ note: 'x' });

  await restoreWith(stale as any, (data: any) => { const next = { ...data }; delete next.drugPriceOverride; return next; });

  assert.strictEqual('drugPriceOverride' in store.current(), false);
});
