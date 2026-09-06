import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDatabase,
  legacyMigrationStrategies,
  PRESCRIPTION_ITEM_ZERO_BASED_STRATEGIES,
  getPrescriptionItemMigrationStrategies
} from './index';
import { DRUG_SCHEMA, PRESCRIPTION_ITEM_SCHEMA } from './schema';

describe('Database initialization contracts', () => {
  it('exports getDatabase as a callable factory function', () => {
    assert.equal(typeof getDatabase, 'function');
  });

  it('provides migration strategy for DRUG_SCHEMA v9 preserving existing document', () => {
    const keepDocument = (doc: any) => doc;
    const strategies = legacyMigrationStrategies(DRUG_SCHEMA, {
      0: keepDocument,
      1: keepDocument,
      2: keepDocument,
      3: keepDocument,
      4: keepDocument,
      5: keepDocument,
      6: keepDocument,
      7: keepDocument,
      8: keepDocument
    });

    assert.strictEqual(DRUG_SCHEMA.version, 9, 'DRUG_SCHEMA version must be 9');
    assert.strictEqual(typeof strategies[9], 'function', 'Strategy for v9 must be defined');

    const v8Doc = {
      code: '620000001',
      name: '既存薬品錠10mg',
      isGeneric: false,
      price: 15.2,
      priceHistory: [{ price: 15.2, effectiveFrom: '2026-04-01' }]
    };

    const migratedDoc = strategies[9](v8Doc);
    assert.deepStrictEqual(migratedDoc, v8Doc, 'v8 document must be preserved without alteration');
  });

  it('provides migration strategy for PRESCRIPTION_ITEM_SCHEMA v18 returning 1..18 and 17 keepDocument (G6-1, G6-2)', () => {
    assert.strictEqual(PRESCRIPTION_ITEM_SCHEMA.version, 18, 'PRESCRIPTION_ITEM_SCHEMA version must be 18 (G6-1)');
    assert.ok(PRESCRIPTION_ITEM_SCHEMA.properties.usageSupplementText, 'usageSupplementText property must exist');

    // 本番で使われる実定義 (PRESCRIPTION_ITEM_ZERO_BASED_STRATEGIES) の 17 番目 (0-based) を直接検証
    assert.ok(
      typeof PRESCRIPTION_ITEM_ZERO_BASED_STRATEGIES[17] === 'function',
      'PRESCRIPTION_ITEM_ZERO_BASED_STRATEGIES[17] must be defined as a function (G6-2)'
    );

    const strategies = getPrescriptionItemMigrationStrategies();

    // 1 から 18 までのキーがすべて存在すること
    const expectedKeys = Array.from({ length: 18 }, (_, i) => i + 1);
    const actualKeys = Object.keys(strategies).map(Number).sort((a, b) => a - b);
    assert.deepStrictEqual(actualKeys, expectedKeys, 'legacyMigrationStrategies must return strategies for versions 1..18');

    assert.strictEqual(typeof strategies[18], 'function', 'Strategy for v18 must be a function');

    const v17Doc = {
      itemId: 'item_test_1',
      visitId: 'v_123',
      drugId: 'drug_456',
      amount: 1,
      days: 14,
      usage: '１日３回朝昼夕食後　服用'
    };
    const migratedDoc = strategies[18](v17Doc);
    assert.deepStrictEqual(migratedDoc, v17Doc, 'v17 document must be preserved without alteration when migrating to v18');
  });
});


