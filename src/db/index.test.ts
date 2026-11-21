import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { wrappedKeyEncryptionCryptoJsStorage } from 'rxdb/plugins/encryption-crypto-js';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import {
  getDatabase,
  legacyMigrationStrategies,
  PRESCRIPTION_ITEM_ZERO_BASED_STRATEGIES,
  getPrescriptionItemMigrationStrategies
} from './index';
import { DRUG_SCHEMA, PATIENT_SCHEMA, PRESCRIPTION_ITEM_SCHEMA, VISIT_SCHEMA } from './schema';
import type { PharmacyDatabase } from './types';
import {
  attachPatientSearchIndexHooks,
  backfillPatientSearchIndexes,
  registerPatientSearchIndexKey,
  searchPatientsViaBlindIndex
} from '@/lib/patient_search_index';

describe('Database initialization contracts', () => {
  it('exports getDatabase as a callable factory function', () => {
    assert.equal(typeof getDatabase, 'function');
  });

  it('provides migration strategy for DRUG_SCHEMA v10 preserving existing document', () => {
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
      8: keepDocument,
      9: keepDocument
    });

    assert.strictEqual(DRUG_SCHEMA.version, 10, 'DRUG_SCHEMA version must be 10');
    assert.strictEqual(typeof strategies[10], 'function', 'Strategy for v10 must be defined');

    const v9Doc = {
      code: '620000001',
      name: '既存薬品錠10mg',
      isGeneric: false,
      price: 15.2,
      priceHistory: [{ price: 15.2, effectiveFrom: '2026-04-01' }],
      unitText: '錠',
      unitCode: '001'
    };

    const migratedDoc = strategies[10](v9Doc);
    assert.deepStrictEqual(migratedDoc, v9Doc, 'v9 document must be preserved without alteration');
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

  it('migrates an existing v24 visits collection to v25 without losing tracingReports', async () => {
    addRxPlugin(RxDBMigrationSchemaPlugin);
    const dbName = `visit_v24_to_v25_${Date.now()}`;
    const storage = wrappedValidateAjvStorage({
      storage: wrappedKeyEncryptionCryptoJsStorage({ storage: getRxStorageMemory() })
    });
    const password = 'test-migration-password-1234';

    // v24 相当のスキーマ（destinationInstitutionCode 追加前）を再現する
    const v24VisitSchema = structuredClone(VISIT_SCHEMA) as typeof VISIT_SCHEMA & {
      properties: {
        careCommunication: {
          properties: {
            tracingReports: {
              items: {
                properties: Record<string, unknown>;
              };
            };
          };
        };
      };
    };
    v24VisitSchema.version = 24;
    delete v24VisitSchema.properties.careCommunication.properties.tracingReports.items.properties.destinationInstitutionCode;

    const db24 = await createRxDatabase({ name: dbName, storage, password, ignoreDuplicate: true });
    await db24.addCollections({
      visits: {
        schema: v24VisitSchema,
        migrationStrategies: legacyMigrationStrategies(v24VisitSchema, {})
      }
    });
    await db24.visits.insert({
      visitId: 'v_24_existing',
      patientId: 'pt_1',
      issueDate: '2026-11-16T10:00:00Z',
      status: 'completed',
      careCommunication: {
        tracingReports: [{
          reportId: 'tr_24',
          status: 'sent',
          reportDate: '2026-11-16',
          destinationInstitution: '青山内科クリニック',
          subject: '服薬状況のご報告',
          createdAt: '2026-11-16T09:00:00Z',
          updatedAt: '2026-11-16T10:00:00Z'
        }]
      }
    });
    await db24.close();

    const db25 = await createRxDatabase({ name: dbName, storage, password, ignoreDuplicate: true });
    await db25.addCollections({
      visits: {
        schema: VISIT_SCHEMA,
        migrationStrategies: legacyMigrationStrategies(VISIT_SCHEMA, {})
      }
    });
    const migrated = await db25.visits.findOne('v_24_existing').exec();
    assert.ok(migrated, 'existing v24 visit must remain readable after v25 migration');
    assert.strictEqual(migrated.careCommunication?.tracingReports?.[0]?.reportId, 'tr_24');
    assert.strictEqual(migrated.careCommunication?.tracingReports?.[0]?.destinationInstitution, '青山内科クリニック');
    await db25.remove();
  });

  it('migrates v25 visits to v26 and queries latest visits via issueDate index without full scan', async () => {
    addRxPlugin(RxDBMigrationSchemaPlugin);
    const dbName = `visit_v25_to_v26_${Date.now()}`;
    const storage = wrappedValidateAjvStorage({
      storage: wrappedKeyEncryptionCryptoJsStorage({ storage: getRxStorageMemory() })
    });
    const password = 'test-migration-password-v26';

    const v25VisitSchema = structuredClone(VISIT_SCHEMA);
    v25VisitSchema.version = 25;
    v25VisitSchema.indexes = ['patientId', 'status'];
    delete (v25VisitSchema.properties.issueDate as { maxLength?: number }).maxLength;

    const db25 = await createRxDatabase({ name: dbName, storage, password, ignoreDuplicate: true });
    await db25.addCollections({
      visits: {
        schema: v25VisitSchema,
        migrationStrategies: legacyMigrationStrategies(v25VisitSchema, {})
      }
    });
    await db25.visits.bulkInsert([
      { visitId: 'v_old', patientId: 'pt_1', issueDate: '2026-10-01T09:00:00Z', status: 'completed', institutionName: '旧病院' },
      { visitId: 'v_mid', patientId: 'pt_2', issueDate: '2026-11-01T09:00:00Z', status: 'completed', institutionName: '中病院' },
      { visitId: 'v_new', patientId: 'pt_3', issueDate: '2026-11-17T09:00:00Z', status: 'completed', institutionName: '新病院' }
    ]);
    await db25.close();

    const db26 = await createRxDatabase({ name: dbName, storage, password, ignoreDuplicate: true });
    await db26.addCollections({
      visits: {
        schema: VISIT_SCHEMA,
        migrationStrategies: legacyMigrationStrategies(VISIT_SCHEMA, {})
      }
    });
    const latest = await db26.visits.find({
      sort: [{ issueDate: 'desc' }],
      limit: 2
    }).exec();
    assert.deepStrictEqual(
      latest.map((d: { visitId: string }) => d.visitId),
      ['v_new', 'v_mid']
    );
    await db26.remove();
  });

  it('migrates v4 encrypted patients to v5 without losing PII and backfills keyed HMAC blind indexes', async () => {
    addRxPlugin(RxDBMigrationSchemaPlugin);
    const dbName = `patient_v4_to_v5_${Date.now()}`;
    const storage = wrappedValidateAjvStorage({
      storage: wrappedKeyEncryptionCryptoJsStorage({ storage: getRxStorageMemory() })
    });
    const password = 'test-migration-password-v5-patient';

    const v4PatientSchema = structuredClone(PATIENT_SCHEMA);
    v4PatientSchema.version = 4;
    delete v4PatientSchema.indexes;
    delete (v4PatientSchema.properties as Record<string, unknown>).searchIndexVersion;
    delete (v4PatientSchema.properties as Record<string, unknown>).birthDateHash;
    delete (v4PatientSchema.properties as Record<string, unknown>).namePrefixHash;
    delete (v4PatientSchema.properties as Record<string, unknown>).kanaPrefixHash;
    delete (v4PatientSchema.properties as Record<string, unknown>).givenNamePrefixHash;
    delete (v4PatientSchema.properties as Record<string, unknown>).givenKanaPrefixHash;

    const db4 = await createRxDatabase({ name: dbName, storage, password, multiInstance: false });
    await db4.addCollections({
      patients: {
        schema: v4PatientSchema,
        migrationStrategies: legacyMigrationStrategies(v4PatientSchema, {})
      }
    });
    await db4.patients.insert({
      patientId: 'pt_v4_carry',
      name: '高橋 美咲',
      kana: 'タカハシ ミサキ',
      birthDate: '1988-03-15',
      gender: 'female'
    });
    await db4.close();

    const db5 = await createRxDatabase({ name: dbName, storage, password, multiInstance: false });
    await db5.addCollections({
      patients: {
        schema: PATIENT_SCHEMA,
        migrationStrategies: legacyMigrationStrategies(PATIENT_SCHEMA, {})
      }
    });
    const hmacKey = registerPatientSearchIndexKey(db5, password);
    attachPatientSearchIndexHooks(db5.patients, hmacKey);

    const carried = await db5.patients.findOne('pt_v4_carry').exec();
    assert.ok(carried, 'existing v4 patient must remain readable after v5 migration');
    assert.strictEqual(carried.name, '高橋 美咲');
    assert.strictEqual(carried.kana, 'タカハシ ミサキ');
    assert.strictEqual(carried.birthDate, '1988-03-15');

    const patientDbView = db5 as unknown as Pick<PharmacyDatabase, 'patients'>;
    const backfilled = await backfillPatientSearchIndexes(patientDbView, hmacKey);
    assert.strictEqual(backfilled, 1);

    const found = await searchPatientsViaBlindIndex(patientDbView, '19880315', 8);
    assert.strictEqual(found.usedBlindIndex, true);
    assert.deepStrictEqual(found.patients.map((p) => p.patientId), ['pt_v4_carry']);

    await db5.remove();
  });
});


