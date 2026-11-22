import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRUG_STOCK_SCHEMA,
  LOCATION_SCHEMA,
  FACILITY_SETTINGS_SCHEMA,
  PATIENT_SCHEMA,
  VISIT_SCHEMA,
  PRESCRIPTION_ITEM_SCHEMA,
  SOAP_RECORD_SCHEMA,
  MEDICATION_GUIDANCE_SCHEMA,
  PATIENT_MEDICATION_INFO_TEMPLATE_SCHEMA,
  USER_SCHEMA,
  ALERT_SCHEMA,
  INTERVENTION_SCHEMA,
  DRUG_SCHEMA,
  AUDIT_LOG_SCHEMA
} from './schema';
import { BACKUP_COLLECTIONS } from '@/lib/backup';
import { ALL_SYNC_COLLECTIONS } from '@/lib/sync/sync_collections';

describe('RxDB schema collection limit contracts', () => {
  it('defines valid RxDB schemas within open-core collection limits and aligns 1:1 with backup and sync collections (H-2)', () => {
    const activeSchemasByCollection = {
      drug_stocks: DRUG_STOCK_SCHEMA,
      locations: LOCATION_SCHEMA,
      facility_settings: FACILITY_SETTINGS_SCHEMA,
      patients: PATIENT_SCHEMA,
      visits: VISIT_SCHEMA,
      prescription_items: PRESCRIPTION_ITEM_SCHEMA,
      soap_records: SOAP_RECORD_SCHEMA,
      medication_guidances: MEDICATION_GUIDANCE_SCHEMA,
      patient_medication_info_templates: PATIENT_MEDICATION_INFO_TEMPLATE_SCHEMA,
      users: USER_SCHEMA,
      alerts: ALERT_SCHEMA,
      interventions: INTERVENTION_SCHEMA,
      drugs: DRUG_SCHEMA,
      audit_logs: AUDIT_LOG_SCHEMA
    } as const;

    const activeCollectionNames = Object.keys(activeSchemasByCollection).sort();
    const activeSchemas = Object.values(activeSchemasByCollection);

    assert.ok(activeSchemas.length <= 14, `Active schemas must not exceed 14, found ${activeSchemas.length}`);
    for (const schema of activeSchemas) {
      assert.ok(schema.version >= 0);
      assert.equal(schema.type, 'object');
      assert.ok(schema.primaryKey);
    }

    assert.deepEqual(
      [...BACKUP_COLLECTIONS].sort(),
      activeCollectionNames,
      'BACKUP_COLLECTIONS must match active RxDB collections 1:1'
    );
    assert.deepEqual(
      [...ALL_SYNC_COLLECTIONS].sort(),
      activeCollectionNames,
      'ALL_SYNC_COLLECTIONS must match active RxDB collections 1:1'
    );
  });
});
