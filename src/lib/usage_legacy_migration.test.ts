import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedKeyEncryptionCryptoJsStorage } from 'rxdb/plugins/encryption-crypto-js';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { PRESCRIPTION_ITEM_SCHEMA } from '@/db/schema';
import { legacyMigrationStrategies } from '@/db/index';
import type { PharmacyDatabase, PrescriptionItem } from '@/db/types';
import {
  migrateLegacyCodedUsages,
  parseLegacyCodedUsage,
  planLegacyUsageNormalization
} from './usage_legacy_migration';

addRxPlugin(RxDBMigrationSchemaPlugin);

describe('A-2: legacy coded usage string normalization migration', () => {
  it('detects and strips 3-digit legacy prefixes without touching clean or non-coded usages', () => {
    assert.deepStrictEqual(parseLegacyCodedUsage('001 1日3回食後服用'), {
      legacyCode: '001',
      strippedUsage: '1日3回食後服用'
    });
    assert.deepStrictEqual(parseLegacyCodedUsage('005　１日１回朝食前　服用'), {
      legacyCode: '005',
      strippedUsage: '１日１回朝食前　服用'
    });
    assert.strictEqual(parseLegacyCodedUsage('１日１回朝食前　服用'), null);
    assert.strictEqual(parseLegacyCodedUsage('1日3回毎食後'), null);
    assert.strictEqual(parseLegacyCodedUsage(''), null);
    assert.strictEqual(parseLegacyCodedUsage('12 テスト'), null);
  });

  it('fills official 16-digit electronicUsageCode only on exact master match and never fabricates for free-text', () => {
    const exactMatchPlan = planLegacyUsageNormalization({
      itemId: 'item_exact',
      usage: '005 １日１回朝食前　服用',
      electronicUsageCode: ''
    });
    assert.ok(exactMatchPlan);
    assert.strictEqual(exactMatchPlan.afterUsage, '１日１回朝食前　服用');
    assert.strictEqual(exactMatchPlan.afterElectronicUsageCode, '1011000100000000');
    assert.strictEqual(exactMatchPlan.matchedOfficialMaster, true);

    const freeTextPlan = planLegacyUsageNormalization({
      itemId: 'item_free',
      usage: '001 1日3回食後服用',
      electronicUsageCode: ''
    });
    assert.ok(freeTextPlan);
    assert.strictEqual(freeTextPlan.afterUsage, '1日3回食後服用');
    assert.strictEqual(freeTextPlan.afterElectronicUsageCode, '');
    assert.strictEqual(freeTextPlan.matchedOfficialMaster, false);
  });

  it('runs dryRun, idempotent encrypted RxDB migration, and rolls back cleanly on audit failure', async () => {
    const storage = wrappedKeyEncryptionCryptoJsStorage({
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() })
    });
    const db = await createRxDatabase({
      name: `legacy_usage_mig_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      password: 'legacy-usage-migration-test-key',
      storage,
      multiInstance: false
    });

    try {
      await db.addCollections({
        prescription_items: {
          schema: PRESCRIPTION_ITEM_SCHEMA,
          migrationStrategies: legacyMigrationStrategies(PRESCRIPTION_ITEM_SCHEMA, {})
        }
      });

      await db.prescription_items.bulkInsert([
        {
          itemId: 'item_legacy_free',
          visitId: 'v_1',
          drugId: '620000001',
          amount: 1,
          days: 14,
          usage: '001 1日3回食後服用'
        },
        {
          itemId: 'item_legacy_official',
          visitId: 'v_1',
          drugId: '620000002',
          amount: 1,
          days: 14,
          usage: '005 １日１回朝食前　服用'
        },
        {
          itemId: 'item_already_clean',
          visitId: 'v_1',
          drugId: '620000003',
          amount: 1,
          days: 7,
          usage: '１日１回就寝前　服用'
        }
      ]);

      const dbView = db as unknown as Pick<PharmacyDatabase, 'prescription_items'>;

      // 1. Dry-run reports 2 candidates without mutating documents
      const dryRunResult = await migrateLegacyCodedUsages(dbView, { dryRun: true });
      assert.strictEqual(dryRunResult.scannedCount, 3);
      assert.strictEqual(dryRunResult.matchedCount, 2);
      assert.strictEqual(dryRunResult.updatedCount, 0);
      const untouched = (await db.prescription_items.findOne('item_legacy_free').exec())?.toJSON() as PrescriptionItem;
      assert.strictEqual(untouched.usage, '001 1日3回食後服用');

      // 2. Audit failure rolls back all patches
      await assert.rejects(
        () => migrateLegacyCodedUsages(dbView, { logAudit: async () => false }),
        /監査ログ記録に失敗/
      );
      const rolledBack = (await db.prescription_items.findOne('item_legacy_official').exec())?.toJSON() as PrescriptionItem;
      assert.strictEqual(rolledBack.usage, '005 １日１回朝食前　服用');
      assert.strictEqual(rolledBack.electronicUsageCode || '', '');

      // 3. Real migration updates 2 items and writes audit detail
      const auditLogs: string[] = [];
      const applied = await migrateLegacyCodedUsages(dbView, {
        logAudit: async (detail) => {
          auditLogs.push(detail);
          return true;
        }
      });
      assert.strictEqual(applied.updatedCount, 2);
      assert.strictEqual(auditLogs.length, 1);
      assert.match(auditLogs[0], /正規化 2件/);

      const freeDoc = (await db.prescription_items.findOne('item_legacy_free').exec())?.toJSON() as PrescriptionItem;
      assert.strictEqual(freeDoc.usage, '1日3回食後服用');
      assert.strictEqual(freeDoc.electronicUsageCode || '', '');

      const officialDoc = (await db.prescription_items.findOne('item_legacy_official').exec())?.toJSON() as PrescriptionItem;
      assert.strictEqual(officialDoc.usage, '１日１回朝食前　服用');
      assert.strictEqual(officialDoc.electronicUsageCode, '1011000100000000');

      // 4. Re-running is strictly idempotent (0 updates)
      const secondRun = await migrateLegacyCodedUsages(dbView, {
        logAudit: async () => {
          throw new Error('should not be called when 0 updates');
        }
      });
      assert.strictEqual(secondRun.matchedCount, 0);
      assert.strictEqual(secondRun.updatedCount, 0);
    } finally {
      await db.close();
    }
  });
});
