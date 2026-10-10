import { test } from 'node:test';
import assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { LOCATION_SCHEMA } from '@/db/schema';
import {
  buildLocationDisplayText,
  buildBulkLocationDocs,
  executeBulkLocationInsert,
  LocationMaster
} from './LocationMaster';

addRxPlugin(RxDBMigrationSchemaPlugin);
const keepDocument = (oldDoc: unknown) => oldDoc;

async function createTestLocationsDb() {
  const db: any = await createRxDatabase({
    name: `loc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    storage: getRxStorageMemory()
  });
  await db.addCollections({
    locations: {
      schema: LOCATION_SCHEMA,
      migrationStrategies: Object.fromEntries(
        Array.from({ length: LOCATION_SCHEMA.version }, (_, index) => [index + 1, keepDocument])
      )
    }
  });
  return db;
}

test('buildLocationDisplayText joins non-empty parts with hyphens', () => {
  assert.strictEqual(buildLocationDisplayText('A', '01', '02'), 'A-01-02');
  assert.strictEqual(buildLocationDisplayText('A', '01', ''), 'A-01');
  assert.strictEqual(buildLocationDisplayText('', '01', ''), '01');
  assert.strictEqual(buildLocationDisplayText('', '', ''), '');
});

test('buildBulkLocationDocs generates formatted location documents with zero-padding', () => {
  const docs = buildBulkLocationDocs({
    prefix: 'A',
    start: 1,
    end: 3,
    existingLocations: []
  });
  assert.strictEqual(docs.length, 3);
  assert.strictEqual(docs[0].part1, 'A');
  assert.strictEqual(docs[0].part2, '01');
  assert.strictEqual(docs[0].displayText, 'A-01');
  assert.strictEqual(docs[1].displayText, 'A-02');
  assert.strictEqual(docs[2].displayText, 'A-03');
  assert.ok(docs[0].id && docs[0].id.length > 0);
});

test('buildBulkLocationDocs pads numbers to match end length when end has 3 or more digits', () => {
  const docs = buildBulkLocationDocs({
    prefix: 'B',
    start: 8,
    end: 105,
    existingLocations: []
  });
  assert.strictEqual(docs[0].part2, '008');
  assert.strictEqual(docs[0].displayText, 'B-008');
  assert.strictEqual(docs[docs.length - 1].part2, '105');
  assert.strictEqual(docs[docs.length - 1].displayText, 'B-105');
});

test('buildBulkLocationDocs skips existing displayText items and returns empty when all exist', () => {
  const existing = [{ displayText: 'A-01' }, { displayText: 'A-03' }];
  const docs = buildBulkLocationDocs({
    prefix: 'A',
    start: 1,
    end: 4,
    existingLocations: existing
  });
  assert.strictEqual(docs.length, 2);
  assert.strictEqual(docs[0].displayText, 'A-02');
  assert.strictEqual(docs[1].displayText, 'A-04');

  const allExisting = [{ displayText: 'A-01' }, { displayText: 'A-02' }];
  const emptyDocs = buildBulkLocationDocs({
    prefix: 'A',
    start: 1,
    end: 2,
    existingLocations: allExisting
  });
  assert.strictEqual(emptyDocs.length, 0);
});

test('executeBulkLocationInsert writes all documents successfully in real RxDB memory store', async () => {
  const db = await createTestLocationsDb();
  try {
    const docs = buildBulkLocationDocs({
      prefix: 'SHELF',
      start: 1,
      end: 5,
      existingLocations: []
    });

    const result = await executeBulkLocationInsert(db.locations, docs);
    assert.strictEqual(result.successCount, 5);
    assert.strictEqual(result.errorCount, 0);
    assert.strictEqual(result.rolledBack, false);
    assert.strictEqual(result.errorMessage, undefined);

    const totalCount = await db.locations.count().exec();
    assert.strictEqual(totalCount, 5);
    const first = await db.locations.findOne(docs[0].id).exec();
    assert.strictEqual(first.displayText, 'SHELF-01');
  } finally {
    await db.close();
  }
});

test('executeBulkLocationInsert detects partial bulkInsert failure, rolls back inserted docs, and reports error count', async () => {
  const db = await createTestLocationsDb();
  try {
    // 既存レコードを1件挿入
    const initialDoc = {
      id: 'clashing-id-001',
      part1: 'ORIG',
      part2: '01',
      part3: '',
      displayText: 'ORIG-01'
    };
    await db.locations.insert(initialDoc);
    assert.strictEqual(await db.locations.count().exec(), 1);

    // 3件の一括作成対象を作成し、うち1件を既存と同じ ID にして衝突エラー（RxStorageBulkWriteError）を発生させる
    const docs = [
      { id: 'new-id-1', part1: 'TEST', part2: '01', part3: '', displayText: 'TEST-01' },
      { id: 'clashing-id-001', part1: 'TEST', part2: '02', part3: '', displayText: 'TEST-02' },
      { id: 'new-id-3', part1: 'TEST', part2: '03', part3: '', displayText: 'TEST-03' }
    ];

    const result = await executeBulkLocationInsert(db.locations, docs);
    assert.strictEqual(result.errorCount, 1);
    assert.strictEqual(result.successCount, 2);
    assert.strictEqual(result.rolledBack, true);
    assert.match(result.errorMessage || '', /棚番の一括作成に失敗しました（1件の書き込みエラー）。作成を取り消しました。/);

    // ロールバックが成功したため、成功した2件は削除され、DB に残るのは衝突した元データ1件のみ
    const totalCount = await db.locations.count().exec();
    assert.strictEqual(totalCount, 1, 'Only original existing document remains after rollback');
    const doc1 = await db.locations.findOne('new-id-1').exec();
    assert.strictEqual(doc1, null, 'Inserted new doc was rolled back');
    const doc3 = await db.locations.findOne('new-id-3').exec();
    assert.strictEqual(doc3, null, 'Inserted new doc was rolled back');
    const orig = await db.locations.findOne('clashing-id-001').exec();
    assert.strictEqual(orig.displayText, 'ORIG-01', 'Original document is untouched');
  } finally {
    await db.close();
  }
});

test('LocationMaster component renders static markup with form inputs', () => {
  const html = renderToStaticMarkup(
    React.createElement(LocationMaster, {
      db: null,
      locations: [
        { id: '1', part1: 'A', part2: '01', part3: '', displayText: 'A-01' }
      ],
      drugs: []
    })
  );
  assert.ok(html.includes('棚番'));
  assert.ok(html.includes('A-01'));
  assert.ok(html.includes('一括作成'));
});
