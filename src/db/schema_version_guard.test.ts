import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as schemas from './schema.ts';

interface SchemaSnapshot {
  version: number;
  shapeHash: string;
}

/**
 * スキーマの形（version を除く全定義）の正規化ハッシュを計算する。
 * 形が変わったのに version を上げ忘れると既存端末の RxDB が開けなくなるため、
 * 本テストの固定値と突き合わせて機械的に検知する（P6-1）。
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = canonicalize(record[key]);
    }
    return sorted;
  }
  return value;
}

function computeShapeHash(schema: Record<string, unknown>): string {
  const { version: _version, ...shape } = schema;
  const canonicalJson = JSON.stringify(canonicalize(shape));
  return createHash('sha256').update(canonicalJson).digest('hex').slice(0, 16);
}

const EXPECTED_SCHEMA_SNAPSHOTS: Record<string, SchemaSnapshot> = {
  ALERT_SCHEMA: { version: 1, shapeHash: '4f2d1991124382ff' },
  AUDIT_LOG_SCHEMA: { version: 20, shapeHash: '5c3b9dd39a36b5ff' },
  DRUG_INFO_SCHEMA: { version: 2, shapeHash: '22c906f9a1e1a957' },
  DRUG_SCHEMA: { version: 10, shapeHash: '1cd1014a77a72139' },
  DRUG_STOCK_SCHEMA: { version: 5, shapeHash: '7d4f9b891d18dabd' },
  FACILITY_SETTINGS_SCHEMA: { version: 6, shapeHash: '1393332b8f05eb0f' },
  INTERVENTION_SCHEMA: { version: 3, shapeHash: '63d5b4a8cb663927' },
  LOCATION_SCHEMA: { version: 1, shapeHash: 'c809ea900995813b' },
  MEDICATION_GUIDANCE_SCHEMA: { version: 1, shapeHash: '40a9753dded38dbc' },
  PATIENT_MEDICATION_INFO_TEMPLATE_SCHEMA: { version: 1, shapeHash: '5450e1a3dc0998ff' },
  PATIENT_SCHEMA: { version: 4, shapeHash: 'eadef0be4d549dd6' },
  PRESCRIPTION_ITEM_SCHEMA: { version: 18, shapeHash: 'b8c670e8d3888710' },
  SOAP_RECORD_SCHEMA: { version: 4, shapeHash: '4ca4bb3dddbb3b8d' },
  USER_SCHEMA: { version: 2, shapeHash: '8cc1ffeb1d1b2a96' },
  VISIT_SCHEMA: { version: 25, shapeHash: '3910bc72fe372c1f' }
};

describe('Schema version guard (P6-1)', () => {
  test('all exported *_SCHEMA definitions are registered in EXPECTED_SCHEMA_SNAPSHOTS', () => {
    const exportedNames = Object.keys(schemas)
      .filter((name) => name.endsWith('_SCHEMA'))
      .sort();
    const expectedNames = Object.keys(EXPECTED_SCHEMA_SNAPSHOTS).sort();
    assert.deepStrictEqual(
      exportedNames,
      expectedNames,
      'New or removed *_SCHEMA must be registered in EXPECTED_SCHEMA_SNAPSHOTS'
    );
  });

  for (const [name, expected] of Object.entries(EXPECTED_SCHEMA_SNAPSHOTS)) {
    test(`${name} has not changed shape without bumping version`, () => {
      const schema = (schemas as Record<string, unknown>)[name] as Record<string, unknown> | undefined;
      assert.ok(schema && typeof schema === 'object', `${name} must be exported from src/db/schema.ts`);
      const actualVersion = schema.version;
      const actualShapeHash = computeShapeHash(schema);

      if (actualShapeHash !== expected.shapeHash && actualVersion === expected.version) {
        assert.fail(
          `${name} shape changed (${expected.shapeHash} -> ${actualShapeHash}) while version remained ${actualVersion}. ` +
            'Bump schema.version, add migration strategy in src/db/index.ts, and update EXPECTED_SCHEMA_SNAPSHOTS.'
        );
      }

      assert.strictEqual(
        actualVersion,
        expected.version,
        `${name} version changed (${expected.version} -> ${String(actualVersion)}). Update EXPECTED_SCHEMA_SNAPSHOTS.`
      );
      assert.strictEqual(
        actualShapeHash,
        expected.shapeHash,
        `${name} shapeHash changed (${expected.shapeHash} -> ${actualShapeHash}). Update EXPECTED_SCHEMA_SNAPSHOTS.`
      );
    });
  }
});
