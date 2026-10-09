import { test } from 'node:test';
import assert from 'node:assert';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxLikeStore } from './rxdb_like_doc.ts';
import { restoreFields } from '../rxdb_restore.ts';

// テスト用ドキュメントが本物の RxDB と同じ結果を返すことを、同じ手順を両方に通して確かめる。
// 偽物が現実とずれると、壊れた取り消しがテストを通ってしまう。
type Outcome = { result: 'ok' | 'CONFLICT' | 'error'; quantity: number };

const scenarios: Array<{ name: string; run: (open: () => Promise<any>, other: () => Promise<any>) => Promise<void> }> = [
  { name: 'patch, then patch the same instance', run: async (open) => { const d = await open(); await d.patch({ quantity: 7 }); await d.patch({ quantity: 10 }); } },
  { name: 'patch, then restoreFields on the same instance', run: async (open) => { const d = await open(); await d.patch({ quantity: 7 }); await restoreFields(d, { quantity: 10 }); } },
  { name: 'patch, then getLatest().patch', run: async (open) => { const d = await open(); await d.patch({ quantity: 7 }); await d.getLatest().patch({ quantity: 10 }); } },
  { name: 'incrementalPatch twice on the same instance', run: async (open) => { const d = await open(); await d.incrementalPatch({ quantity: 7 }); await d.incrementalPatch({ quantity: 10 }); } },
  { name: 'patch on an instance another write has made stale', run: async (open, other) => { const d = await open(); await (await other()).patch({ quantity: 3 }); await d.patch({ quantity: 7 }); } },
  { name: 'restoreFields on an instance another write has made stale', run: async (open, other) => { const d = await open(); await (await other()).patch({ quantity: 3 }); await restoreFields(d, { quantity: 10 }); } }
];

async function outcomeOf(run: () => Promise<void>, quantity: () => Promise<number>): Promise<Outcome> {
  try {
    await run();
    return { result: 'ok', quantity: await quantity() };
  } catch (error: any) {
    return { result: error?.code === 'CONFLICT' ? 'CONFLICT' : 'error', quantity: await quantity() };
  }
}

test('the RxDB-like test document behaves like a real RxDB document on patch, incrementalPatch and stale instances', async () => {
  const db = await createRxDatabase({ name: `rxlike${Date.now()}`, storage: getRxStorageMemory() });
  await db.addCollections({
    stocks: {
      schema: {
        title: 'stock', version: 0, primaryKey: 'id', type: 'object',
        properties: { id: { type: 'string', maxLength: 80 }, quantity: { type: 'number' } },
        required: ['id']
      }
    } as any
  });
  const col = (db as any).stocks;
  try {
    for (const scenario of scenarios) {
      const id = scenario.name;
      await col.upsert({ id, quantity: 10 });
      const real = await outcomeOf(
        () => scenario.run(() => col.findOne(id).exec(), () => col.findOne(id).exec()),
        async () => (await col.findOne(id).exec()).quantity
      );

      const store = new RxLikeStore({ id, quantity: 10 });
      const fake = await outcomeOf(
        () => scenario.run(async () => store.open(), async () => store.open()),
        async () => store.current().quantity as number
      );

      assert.deepStrictEqual(fake, real, scenario.name);
    }
  } finally {
    await db.close();
  }
});

test('patch on the same instance twice really conflicts, so a rollback written that way cannot pass a test', async () => {
  const store = new RxLikeStore({ quantity: 10 });
  const doc = store.open();
  await doc.patch({ quantity: 7 });
  await assert.rejects(() => doc.patch({ quantity: 10 }), /CONFLICT/);
  assert.strictEqual(store.current().quantity, 7);
  await restoreFields(doc, { quantity: 10 });
  assert.strictEqual(store.current().quantity, 10);
});
