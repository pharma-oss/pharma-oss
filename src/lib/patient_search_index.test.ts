import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedKeyEncryptionCryptoJsStorage } from 'rxdb/plugins/encryption-crypto-js';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { PATIENT_SCHEMA } from '@/db/schema';
import type { Patient, PharmacyDatabase } from '@/db/types';
import {
  attachPatientSearchIndexHooks,
  backfillPatientSearchIndexes,
  buildPatientBlindIndexSelector,
  computePatientBlindIndexFields,
  derivePatientSearchIndexKey,
  findPatientsByBirthDateViaBlindIndex,
  getPatientSearchIndexVersionTag,
  registerPatientSearchIndexKey,
  searchPatientsViaBlindIndex
} from './patient_search_index';

addRxPlugin(RxDBMigrationSchemaPlugin);

const identityMigration = <T>(doc: T): T => doc;

describe('patient_search_index (PATIENT_SCHEMA v5 keyed HMAC blind index)', () => {
  it('computes deterministic keyed HMAC hashes with no plaintext PII and distinct hashes per key', () => {
    const keyA = derivePatientSearchIndexKey('password-A-1234567890');
    const keyB = derivePatientSearchIndexKey('password-B-1234567890');

    const fieldsA = computePatientBlindIndexFields(
      { name: '山田 太郎', kana: 'やまだ たろう', birthDate: '1980-05-12' },
      keyA
    );
    const fieldsA2 = computePatientBlindIndexFields(
      { name: '山田　太郎', kana: 'ヤマダ タロウ', birthDate: '1980/5/12' },
      keyA
    );
    const fieldsB = computePatientBlindIndexFields(
      { name: '山田 太郎', kana: 'やまだ たろう', birthDate: '1980-05-12' },
      keyB
    );

    assert.deepStrictEqual(fieldsA, fieldsA2);
    assert.match(fieldsA.birthDateHash || '', /^[0-9a-f]{64}$/);
    assert.match(fieldsA.namePrefixHash || '', /^[0-9a-f]{64}$/);
    assert.match(fieldsA.kanaPrefixHash || '', /^[0-9a-f]{64}$/);
    assert.match(fieldsA.givenNamePrefixHash || '', /^[0-9a-f]{64}$/);
    assert.match(fieldsA.givenKanaPrefixHash || '', /^[0-9a-f]{64}$/);
    assert.notStrictEqual(fieldsA.birthDateHash, fieldsB.birthDateHash);
    assert.notStrictEqual(fieldsA.searchIndexVersion, fieldsB.searchIndexVersion);

    const serialized = JSON.stringify(fieldsA);
    assert.strictEqual(serialized.includes('山田'), false);
    assert.strictEqual(serialized.includes('太郎'), false);
    assert.strictEqual(serialized.includes('1980'), false);
    assert.strictEqual(serialized.includes('password-A'), false);
  });

  it('builds birthDateHash selector for 8-digit dates and $or initial-hash selector for name/kana', () => {
    const key = derivePatientSearchIndexKey('test-password-selector');
    const dateSelector = buildPatientBlindIndexSelector('山田 19800512', key);
    assert.ok(dateSelector && 'birthDateHash' in dateSelector);

    const textSelector = buildPatientBlindIndexSelector('やまだ', key);
    assert.ok(textSelector && Array.isArray(textSelector.$or));
    assert.strictEqual(textSelector.$or.length, 4);

    assert.strictEqual(buildPatientBlindIndexSelector('   ', key), null);
    assert.strictEqual(buildPatientBlindIndexSelector('1980', key), null);
  });

  it('indexes patients automatically on encrypted RxDB insert/save, backfills legacy docs, and queries via blind index', async () => {
    const dbPassword = 'encrypted-test-password-2026';
    const baseStorage = wrappedKeyEncryptionCryptoJsStorage({
      storage: wrappedValidateAjvStorage({
        storage: getRxStorageMemory()
      })
    });
    const db = await createRxDatabase({
      name: `patient_blind_index_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      password: dbPassword,
      storage: baseStorage,
      multiInstance: false
    });

    try {
      await db.addCollections({
        patients: {
          schema: PATIENT_SCHEMA,
          migrationStrategies: {
            1: identityMigration,
            2: identityMigration,
            3: identityMigration,
            4: identityMigration,
            5: identityMigration
          }
        }
      });

      const hmacKey = registerPatientSearchIndexKey(db, dbPassword);
      const versionTag = getPatientSearchIndexVersionTag(hmacKey);

      // 1. Insert a legacy (unindexed) patient before attaching hooks to simulate v4 -> v5 carryover
      await db.patients.insert({
        patientId: 'pt_legacy',
        name: '佐藤 花子',
        kana: 'サトウ ハナコ',
        birthDate: '1975-11-03'
      });

      // Before backfill, search safely falls back so legacy patients are never missed
      const beforeBackfill = await searchPatientsViaBlindIndex(
        db as unknown as Pick<PharmacyDatabase, 'patients'>,
        '19751103',
        8
      );
      assert.strictEqual(beforeBackfill.usedBlindIndex, false);
      assert.deepStrictEqual(beforeBackfill.patients.map((p) => p.patientId), ['pt_legacy']);

      const birthDateBeforeBackfill = await findPatientsByBirthDateViaBlindIndex(
        db as unknown as Pick<PharmacyDatabase, 'patients'>,
        '1975-11-03'
      );
      assert.strictEqual(birthDateBeforeBackfill.usedBlindIndex, false);
      assert.deepStrictEqual(birthDateBeforeBackfill.patients.map((p) => p.patientId), ['pt_legacy']);

      // 2. Attach hooks and backfill legacy patients
      attachPatientSearchIndexHooks(db.patients, hmacKey);
      const backfilled = await backfillPatientSearchIndexes(
        db as unknown as Pick<PharmacyDatabase, 'patients'>,
        hmacKey
      );
      assert.strictEqual(backfilled, 1);

      // Second backfill is idempotent (0 updates)
      assert.strictEqual(
        await backfillPatientSearchIndexes(db as unknown as Pick<PharmacyDatabase, 'patients'>, hmacKey),
        0
      );

      // 3. Insert new patients with hooks active
      await db.patients.insert({
        patientId: 'pt_yamada',
        name: '山田 太郎',
        kana: 'ヤマダ タロウ',
        birthDate: '1980-05-12'
      });
      await db.patients.insert({
        patientId: 'pt_suzuki',
        name: '鈴木 一郎',
        kana: 'スズキ イチロウ',
        birthDate: '1992-08-20'
      });

      const yamadaDoc = await db.patients.findOne('pt_yamada').exec();
      assert.strictEqual((yamadaDoc?.toJSON() as Patient).searchIndexVersion, versionTag);

      // 4. Search by 8-digit birthDate uses blind index
      const byDate = await searchPatientsViaBlindIndex(
        db as unknown as Pick<PharmacyDatabase, 'patients'>,
        '19800512',
        8
      );
      assert.strictEqual(byDate.usedBlindIndex, true);
      assert.deepStrictEqual(byDate.patients.map((p) => p.patientId), ['pt_yamada']);

      // 5. Non-existent birthDate returns empty via blind index without falling back to full scan
      const missingDate = await searchPatientsViaBlindIndex(
        db as unknown as Pick<PharmacyDatabase, 'patients'>,
        '19991231',
        8
      );
      assert.strictEqual(missingDate.usedBlindIndex, true);
      assert.strictEqual(missingDate.patients.length, 0);

      // 5b. findPatientsByBirthDateViaBlindIndex narrows strictly to birthDateHash and avoids full scan on 0 hits
      const exactBirthDateCandidates = await findPatientsByBirthDateViaBlindIndex(
        db as unknown as Pick<PharmacyDatabase, 'patients'>,
        '1980-05-12'
      );
      assert.strictEqual(exactBirthDateCandidates.usedBlindIndex, true);
      assert.deepStrictEqual(exactBirthDateCandidates.patients.map((p) => p.patientId), ['pt_yamada']);

      const missingBirthDateCandidates = await findPatientsByBirthDateViaBlindIndex(
        db as unknown as Pick<PharmacyDatabase, 'patients'>,
        '1999-12-31'
      );
      assert.strictEqual(missingBirthDateCandidates.usedBlindIndex, true);
      assert.deepStrictEqual(missingBirthDateCandidates.patients, []);

      // 6. Search by surname/kana/given-name prefix uses blind index
      const byKana = await searchPatientsViaBlindIndex(
        db as unknown as Pick<PharmacyDatabase, 'patients'>,
        'さとう',
        8
      );
      assert.strictEqual(byKana.usedBlindIndex, true);
      assert.deepStrictEqual(byKana.patients.map((p) => p.patientId), ['pt_legacy']);

      const byGivenName = await searchPatientsViaBlindIndex(
        db as unknown as Pick<PharmacyDatabase, 'patients'>,
        '一郎',
        8
      );
      assert.strictEqual(byGivenName.usedBlindIndex, true);
      assert.deepStrictEqual(byGivenName.patients.map((p) => p.patientId), ['pt_suzuki']);

      // 7. Mid-word substring still works via transparent fallback
      const byMiddleChar = await searchPatientsViaBlindIndex(
        db as unknown as Pick<PharmacyDatabase, 'patients'>,
        '田',
        8
      );
      assert.strictEqual(byMiddleChar.usedBlindIndex, false);
      assert.deepStrictEqual(byMiddleChar.patients.map((p) => p.patientId), ['pt_yamada']);

      // 8. Single-token name (no given-name split) inserts cleanly and indexes surname initial
      await db.patients.insert({
        patientId: 'pt_single',
        name: 'ナナシ',
        kana: 'ナナシ',
        birthDate: '2001-01-01'
      });
      const bySingle = await searchPatientsViaBlindIndex(
        db as unknown as Pick<PharmacyDatabase, 'patients'>,
        'ナナシ',
        8
      );
      assert.strictEqual(bySingle.usedBlindIndex, true);
      assert.deepStrictEqual(bySingle.patients.map((p) => p.patientId), ['pt_single']);

      // 9. Verify PATIENT_SCHEMA keeps all PII fields encrypted (never exposed in plaintext)
      assert.deepStrictEqual(
        PATIENT_SCHEMA.encrypted,
        ['name', 'kana', 'birthDate', 'insuranceInfo', 'publicInsurances']
      );
    } finally {
      await db.close();
    }
  });
});
