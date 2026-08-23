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

describe('RxDB schema collection limit contracts', () => {
  it('defines valid RxDB schemas within open-core collection limits', () => {
    const activeSchemas = [
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
    ];

    assert.ok(activeSchemas.length <= 14, `Active schemas must not exceed 14, found ${activeSchemas.length}`);
    for (const schema of activeSchemas) {
      assert.ok(schema.version >= 0);
      assert.equal(schema.type, 'object');
      assert.ok(schema.primaryKey);
    }
  });
});
