import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachDialogCollector,
  buildBulkInsertFailureResult,
  buildBulkRemoveFailureResult,
  findDbInReactFiberTree,
  patchCollectionMethodOnDb,
  restoreAllPatchedMethods,
  restorePatchedMethod
} from '../../../scripts/lib/failure_injection.mjs';

describe('failure_injection library helpers (P6-3)', () => {
  it('finds db in a React fiber tree across child, sibling, hook state, and avoids cycles', () => {
    const db = { visits: { bulkInsert: async () => ({}) }, drug_stocks: { find: () => ({}) } };
    const root: Record<string, unknown> = { memoizedProps: {} };
    const childA: Record<string, unknown> = { memoizedProps: {}, return: root };
    const siblingB: Record<string, unknown> = {
      memoizedProps: { value: { db } },
      return: root
    };
    root.child = childA;
    childA.sibling = siblingB;

    assert.strictEqual(findDbInReactFiberTree(root, ['visits', 'drug_stocks']), db);
    assert.strictEqual(findDbInReactFiberTree(root, ['nonexistent']), null);

    // hook.memoizedState に db が乗っているケース
    const hookNode: Record<string, unknown> = {
      memoizedProps: {},
      memoizedState: {
        memoizedState: 'other',
        next: { memoizedState: db, next: null }
      }
    };
    assert.strictEqual(findDbInReactFiberTree(hookNode, ['visits']), db);
  });

  it('builds RxDB-compatible bulkInsert and bulkRemove failure payloads', () => {
    assert.deepStrictEqual(
      buildBulkInsertFailureResult({ errorIds: ['lot_1'], successIds: ['lot_ok'], status: 409 }),
      {
        success: [{ id: 'lot_ok' }],
        error: [{ documentId: 'lot_1', status: 409 }]
      }
    );
    assert.deepStrictEqual(
      buildBulkRemoveFailureResult({ errorIds: ['lot_1'], status: 500 }),
      {
        success: [],
        error: [{ documentId: 'lot_1', status: 500 }]
      }
    );
  });

  it('patches and restores both prototype-inherited and own collection methods cleanly', async () => {
    class FakeCollection {
      async bulkInsert() {
        return 'original-proto';
      }
    }
    const collection = new FakeCollection() as FakeCollection & { custom?: () => Promise<string> };
    collection.custom = async () => 'original-own';

    const db = { drug_stocks: collection };
    const registry = new Map();

    const k1 = patchCollectionMethodOnDb(db, 'drug_stocks', 'bulkInsert', async () => 'injected-proto', registry);
    const k2 = patchCollectionMethodOnDb(db, 'drug_stocks', 'custom', async () => 'injected-own', registry);

    assert.strictEqual(await db.drug_stocks.bulkInsert(), 'injected-proto');
    assert.strictEqual(await db.drug_stocks.custom?.(), 'injected-own');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(db.drug_stocks, 'bulkInsert'), true);

    assert.strictEqual(restorePatchedMethod(k1, registry), true);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(db.drug_stocks, 'bulkInsert'), false);
    assert.strictEqual(await db.drug_stocks.bulkInsert(), 'original-proto');

    assert.strictEqual(restoreAllPatchedMethods(registry), 1);
    assert.strictEqual(registry.size, 0);
    assert.strictEqual(await db.drug_stocks.custom?.(), 'original-own');
    assert.strictEqual(restorePatchedMethod(k2, registry), false);
  });

  it('collects dialog messages and accepts or dismisses confirm dialogs according to options', async () => {
    const listeners = new Map<string, Array<(dialog: unknown) => Promise<void>>>();
    const fakePage = {
      on(event: string, fn: (dialog: unknown) => Promise<void>) {
        listeners.set(event, [...(listeners.get(event) || []), fn]);
      },
      off(event: string, fn: (dialog: unknown) => Promise<void>) {
        listeners.set(event, (listeners.get(event) || []).filter((f) => f !== fn));
      }
    };

    const collector = attachDialogCollector(fakePage, { acceptConfirm: false });
    let accepted = 0;
    let dismissed = 0;
    const [handler] = listeners.get('dialog') || [];
    assert.ok(handler);

    await handler({
      type: () => 'alert',
      message: () => '保存に失敗しました',
      accept: async () => { accepted++; },
      dismiss: async () => { dismissed++; }
    });
    await handler({
      type: () => 'confirm',
      message: () => '続行しますか？',
      accept: async () => { accepted++; },
      dismiss: async () => { dismissed++; }
    });

    assert.deepStrictEqual(collector.getMessages(), ['保存に失敗しました', '続行しますか？']);
    assert.strictEqual(accepted, 1);
    assert.strictEqual(dismissed, 1);

    collector.detach();
    assert.strictEqual((listeners.get('dialog') || []).length, 0);
  });
});
