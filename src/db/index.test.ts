import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase, legacyMigrationStrategies } from './index';
import { DRUG_SCHEMA } from './schema';

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
});

