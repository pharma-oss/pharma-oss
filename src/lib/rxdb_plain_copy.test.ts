import { test } from 'node:test';
import assert from 'node:assert';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { plainCopy } from './rxdb_restore.ts';

// 開発ビルドの RxDB では、文書のプロパティ(doc.claimLifecycle など入れ子の値)が structuredClone できない。
// IndexedDB(Dexie)は保存時に structuredClone するので、そのまま「元の値」として保持して書き戻す取り消しは
// RxError (DOC24) で失敗する(月次請求の一括UKE出力の取り消しが、実ブラウザで必ず失敗していた)。
addRxPlugin(RxDBDevModePlugin);

const LIFECYCLE = { status: 'rebilling', history: [{ at: '2026-10-01T00:00:00.000Z', note: 'a' }, { at: '2026-10-02T00:00:00.000Z', note: 'b' }] };

async function withVisit(run: (doc: any, col: any) => Promise<void>) {
  const db: any = await createRxDatabase({
    name: `plain${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() })
  });
  await db.addCollections({
    visits: { schema: {
      title: 'visit', version: 0, primaryKey: 'visitId', type: 'object',
      properties: {
        visitId: { type: 'string', maxLength: 50 },
        claimLifecycle: { type: 'object', properties: { status: { type: 'string' }, history: { type: 'array', items: { type: 'object', properties: { at: { type: 'string' }, note: { type: 'string' } } } } } }
      },
      required: ['visitId']
    } }
  } as any);
  try {
    await db.visits.insert({ visitId: 'v1', claimLifecycle: LIFECYCLE });
    await run(await db.visits.findOne('v1').exec(), db.visits);
  } finally { await db.close(); }
}

test('a nested value read from a document cannot be structured-cloned, but its plainCopy can', async () => {
  await withVisit(async (doc) => {
    assert.throws(() => structuredClone(doc.claimLifecycle), 'the hazard: the raw property is not cloneable');
    const copy = plainCopy(doc.claimLifecycle);
    assert.doesNotThrow(() => structuredClone(copy));
    assert.deepStrictEqual(copy, LIFECYCLE);
  });
});

test('plainCopy is detached from the document, so a later change to the document does not alter the saved value', async () => {
  await withVisit(async (doc) => {
    const saved = plainCopy(doc.claimLifecycle);
    await doc.patch({ claimLifecycle: { status: 'exported', history: [] } });
    assert.deepStrictEqual(saved, LIFECYCLE);
  });
});

test('plainCopy keeps undefined (a visit that had no lifecycle) and copies plain values', () => {
  assert.strictEqual(plainCopy(undefined), undefined);
  assert.deepStrictEqual(plainCopy({ a: [1, { b: 2 }] }), { a: [1, { b: 2 }] });
  assert.strictEqual(plainCopy('x'), 'x');
});
