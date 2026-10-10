import { test } from 'node:test';
import assert from 'node:assert';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { DRUG_SCHEMA } from '../db/schema.ts';
import { DRUGS_WITH_RECORDED_STOCK_SELECTOR } from './inventory_drug_query.ts';

test('the inventory list also takes drugs with negative stock, but not zero or unset stock, nor abolished drugs', async () => {
  const db: any = await createRxDatabase({ name: `invq${Date.now()}`, storage: getRxStorageMemory() });
  await db.addCollections({ drugs: { schema: { ...DRUG_SCHEMA, version: 0 } } } as any);
  try {
    const drug = (code: string, extra: Record<string, unknown> = {}) => ({ code, name: `薬${code}`, isGeneric: false, ...extra });
    await db.drugs.bulkInsert([
      drug('IN_STOCK', { stockQuantity: 12 }),
      drug('NEGATIVE', { stockQuantity: -5 }),
      drug('ZERO', { stockQuantity: 0 }),
      drug('UNSET'),
      drug('ABOLISHED_NEGATIVE', { stockQuantity: -1, isAbolished: true }),
      drug('ABOLISHED_STOCK', { stockQuantity: 3, isAbolished: true })
    ]);

    const found = (await db.drugs.find({ selector: DRUGS_WITH_RECORDED_STOCK_SELECTOR }).exec()).map((doc: any) => doc.code).sort();

    assert.deepStrictEqual(found, ['IN_STOCK', 'NEGATIVE']);
  } finally { await db.close(); }
});

test('a negative-stock drug is found even when it is far beyond a code-ordered limit', async () => {
  const db: any = await createRxDatabase({ name: `invq2${Date.now()}`, storage: getRxStorageMemory() });
  await db.addCollections({ drugs: { schema: { ...DRUG_SCHEMA, version: 0 } } } as any);
  try {
    // 先頭 50 件がコード順の制限(本番は 2500 件)を埋め、マイナス在庫の薬品はその後ろにある
    await db.drugs.bulkInsert(Array.from({ length: 200 }, (_, i) => ({ code: `A${String(i).padStart(4, '0')}`, name: `薬${i}`, isGeneric: false })));
    await db.drugs.insert({ code: 'Z9999', name: '後ろの薬', isGeneric: false, stockQuantity: -8 });

    const limited = (await db.drugs.find({ selector: { isAbolished: { $ne: true } }, limit: 50 }).exec()).map((doc: any) => doc.code);
    const recorded = (await db.drugs.find({ selector: DRUGS_WITH_RECORDED_STOCK_SELECTOR }).exec()).map((doc: any) => doc.code);

    assert.ok(!limited.includes('Z9999'), 'the limited list misses it (this is why it was never shown)');
    assert.deepStrictEqual(recorded, ['Z9999']);
  } finally { await db.close(); }
});
