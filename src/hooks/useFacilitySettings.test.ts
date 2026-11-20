import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { FACILITY_SETTINGS_SCHEMA } from '@/db/schema';
import type { FacilitySettings } from '@/db/types';
import {
  DEFAULT_FACILITY_SETTINGS,
  normalizeLoadedFacilitySettings
} from './useFacilitySettings';

addRxPlugin(RxDBMigrationSchemaPlugin);

const identityMigration = <T>(doc: T): T => doc;

describe('useFacilitySettings helpers', () => {
  it('returns default facility settings when input is null, undefined, or empty', () => {
    assert.deepStrictEqual(normalizeLoadedFacilitySettings(null), {
      ...DEFAULT_FACILITY_SETTINGS,
      officialFeeCodeOverrides: {}
    });
    assert.deepStrictEqual(normalizeLoadedFacilitySettings(undefined), {
      ...DEFAULT_FACILITY_SETTINGS,
      officialFeeCodeOverrides: {}
    });
    assert.deepStrictEqual(normalizeLoadedFacilitySettings({}), {
      ...DEFAULT_FACILITY_SETTINGS,
      aiAssistMode: 'enabled',
      officialFeeCodeOverrides: {},
      businessHours: undefined
    });
  });

  it('preserves all configured fields including businessHours and officialFeeCodeOverrides while normalizing aiAssistMode', () => {
    const saved: Partial<FacilitySettings> = {
      id: 'default',
      pharmacyName: '青葉薬局',
      pharmacyKana: 'アオバヤッキョク',
      pharmacyCode: '1312345',
      pharmacyPostalCode: '150-0001',
      pharmacyAddress: '東京都渋谷区神宮前1-2-3',
      pharmacyPhone: '03-9999-0000',
      pharmacyFax: '03-9999-0001',
      registrationNumber: 'T1234567890123',
      ownerName: '鈴木 太郎',
      managerName: '佐藤 花子',
      defaultPharmacistName: '佐藤',
      baseFeeCategory: '3_a',
      regionalSupportAddition: '2',
      medicalDxAddition: true,
      postGenericAddition: '3',
      genericDispensingReduction: true,
      aiAssistMode: 'invalid_mode' as unknown as FacilitySettings['aiAssistMode'],
      officialFeeCodeOverrides: { base_1: '401000110' },
      businessHours: {
        weekday: { open: '09:00', close: '18:30' },
        saturday: { open: '09:00', close: '13:00' },
        holidayDates: ['2026-11-23']
      }
    };

    const normalized = normalizeLoadedFacilitySettings(saved);
    assert.strictEqual(normalized.pharmacyName, '青葉薬局');
    assert.strictEqual(normalized.pharmacyCode, '1312345');
    assert.strictEqual(normalized.baseFeeCategory, '3_a');
    assert.strictEqual(normalized.regionalSupportAddition, '2');
    assert.strictEqual(normalized.medicalDxAddition, true);
    assert.strictEqual(normalized.postGenericAddition, '3');
    assert.strictEqual(normalized.genericDispensingReduction, true);
    assert.strictEqual(normalized.aiAssistMode, 'enabled');
    assert.deepStrictEqual(normalized.officialFeeCodeOverrides, { base_1: '401000110' });
    assert.notStrictEqual(normalized.officialFeeCodeOverrides, saved.officialFeeCodeOverrides);
    assert.deepStrictEqual(normalized.businessHours, {
      weekday: { open: '09:00', close: '18:30' },
      saturday: { open: '09:00', close: '13:00' },
      holidayDates: ['2026-11-23']
    });
  });

  it('round-trips a real RxDB facility_settings document without dropping businessHours or overrides', async () => {
    const db = await createRxDatabase({
      name: `facility_settings_norm_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      storage: getRxStorageMemory(),
      multiInstance: false
    });
    try {
      await db.addCollections({
        facility_settings: {
          schema: FACILITY_SETTINGS_SCHEMA,
          migrationStrategies: {
            1: identityMigration,
            2: identityMigration,
            3: identityMigration,
            4: identityMigration,
            5: identityMigration,
            6: identityMigration
          }
        }
      });

      await db.facility_settings.insert({
        id: 'default',
        pharmacyName: '桜丘薬局',
        pharmacyPostalCode: '150-0031',
        pharmacyAddress: '東京都渋谷区桜丘町1-1',
        pharmacyPhone: '03-1111-2222',
        defaultPharmacistName: '田中',
        baseFeeCategory: '2',
        regionalSupportAddition: '1',
        medicalDxAddition: true,
        postGenericAddition: '2',
        genericDispensingReduction: false,
        aiAssistMode: 'disabled',
        officialFeeCodeOverrides: { base_2: '401000210' },
        businessHours: {
          weekday: { open: '08:30', close: '19:00' },
          holidayDates: ['2026-12-31']
        }
      });

      const doc = await db.facility_settings.findOne('default').exec();
      assert.ok(doc);
      const normalized = normalizeLoadedFacilitySettings(doc.toJSON() as Partial<FacilitySettings>);
      assert.strictEqual(normalized.pharmacyName, '桜丘薬局');
      assert.strictEqual(normalized.aiAssistMode, 'disabled');
      assert.deepStrictEqual(normalized.officialFeeCodeOverrides, { base_2: '401000210' });
      assert.deepStrictEqual(normalized.businessHours, {
        weekday: { open: '08:30', close: '19:00' },
        holidayDates: ['2026-12-31']
      });
    } finally {
      await db.close();
    }
  });
});
