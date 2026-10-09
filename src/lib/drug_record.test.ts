import { test } from 'node:test';
import assert from 'node:assert';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { DRUG_SCHEMA } from '../db/schema.ts';
import type { Drug } from '../db/types.ts';
import { drugRecordFromDocument } from './drug_record.ts';

// スキーマの全項目に値を持つ薬品(項目を足したら、このテストが気づく)
const FULL_DRUG: Drug = {
  code: 'D1', name: 'アムロジピン錠5mg', yjCode: '2171022F1010', isGeneric: true, genericName: 'アムロジピン', isAbolished: false,
  price: 10.1, priceHistory: [{ price: 12.3, effectiveFrom: '2024-04-01' }, { price: 10.1, effectiveFrom: '2025-04-01' }],
  stockQuantity: 100, location: 'A-01-02', isNarcotic: false, isPsychotropic: false, isPoisonous: false, isHighRisk: true,
  documentUrl: 'https://example.com/pi', unitText: '錠', unitCode: '001', reorderPoint: 30, leadTimeDays: 3, targetStock: 200
};

async function withDrug(run: (doc: any, col: any) => Promise<void>) {
  const db: any = await createRxDatabase({ name: `drec${Date.now()}${Math.random().toString(36).slice(2, 8)}`, storage: getRxStorageMemory() });
  await db.addCollections({ drugs: { schema: { ...DRUG_SCHEMA, version: 0 } } } as any);
  try {
    await db.drugs.insert(FULL_DRUG);
    await run(await db.drugs.findOne('D1').exec(), db.drugs);
  } finally { await db.close(); }
}

test('drugRecordFromDocument keeps every field of the drug schema', async () => {
  assert.deepStrictEqual(Object.keys(FULL_DRUG).sort(), Object.keys(DRUG_SCHEMA.properties).sort(), 'the fixture covers the whole schema');
  await withDrug(async (doc) => {
    assert.deepStrictEqual(drugRecordFromDocument(doc), FULL_DRUG);
  });
});

test('writing a drug record back with bulkUpsert changes nothing but what the caller changed', async () => {
  await withDrug(async (doc, col) => {
    const record = drugRecordFromDocument(doc);

    await col.bulkUpsert([{ ...record, price: 9.5, name: '改名された薬' }]);

    assert.deepStrictEqual((await col.findOne('D1').exec()).toJSON(), { ...FULL_DRUG, price: 9.5, name: '改名された薬' },
      'reorder point, lead time and target stock survive a drug master update');
  });
});

test('the record is a copy: changing it does not change the document', async () => {
  await withDrug(async (doc) => {
    const record = drugRecordFromDocument(doc);
    record.priceHistory!.push({ price: 1 });
    record.name = 'x';
    assert.strictEqual(doc.toJSON().priceHistory.length, 2);
    assert.strictEqual(doc.name, FULL_DRUG.name);
  });
});
