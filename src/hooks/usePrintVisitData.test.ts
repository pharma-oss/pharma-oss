import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { wrappedKeyEncryptionCryptoJsStorage } from 'rxdb/plugins/encryption-crypto-js';
import {
  ALERT_SCHEMA,
  DRUG_SCHEMA,
  FACILITY_SETTINGS_SCHEMA,
  INTERVENTION_SCHEMA,
  PATIENT_MEDICATION_INFO_TEMPLATE_SCHEMA,
  PATIENT_SCHEMA,
  PRESCRIPTION_ITEM_SCHEMA,
  VISIT_SCHEMA
} from '@/db/schema';
import { legacyMigrationStrategies } from '@/db/index';
import type {
  Alert,
  Drug,
  FacilitySettings,
  Intervention,
  Patient,
  PatientMedicationInfoTemplate,
  PharmacyDatabase,
  PrescriptionItem,
  Visit
} from '@/db/types';
import {
  collectPrintVisitDrugIds,
  loadPrintVisitSnapshot,
  selectApprovedTemplatesByDrugCode
} from './usePrintVisitData.ts';

async function createPrintVisitTestDb() {
  addRxPlugin(RxDBMigrationSchemaPlugin);
  const storage = wrappedValidateAjvStorage({
    storage: wrappedKeyEncryptionCryptoJsStorage({ storage: getRxStorageMemory() })
  });
  const db = await createRxDatabase({
    name: `print_visit_data_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    storage,
    password: 'test-print-visit-password',
    ignoreDuplicate: true
  });
  await db.addCollections({
    visits: { schema: VISIT_SCHEMA, migrationStrategies: legacyMigrationStrategies(VISIT_SCHEMA, {}) },
    patients: { schema: PATIENT_SCHEMA, migrationStrategies: legacyMigrationStrategies(PATIENT_SCHEMA, {}) },
    alerts: { schema: ALERT_SCHEMA, migrationStrategies: legacyMigrationStrategies(ALERT_SCHEMA, {}) },
    prescription_items: { schema: PRESCRIPTION_ITEM_SCHEMA, migrationStrategies: legacyMigrationStrategies(PRESCRIPTION_ITEM_SCHEMA, {}) },
    drugs: { schema: DRUG_SCHEMA, migrationStrategies: legacyMigrationStrategies(DRUG_SCHEMA, {}) },
    facility_settings: { schema: FACILITY_SETTINGS_SCHEMA, migrationStrategies: legacyMigrationStrategies(FACILITY_SETTINGS_SCHEMA, {}) },
    patient_medication_info_templates: {
      schema: PATIENT_MEDICATION_INFO_TEMPLATE_SCHEMA,
      migrationStrategies: legacyMigrationStrategies(PATIENT_MEDICATION_INFO_TEMPLATE_SCHEMA, {})
    },
    interventions: { schema: INTERVENTION_SCHEMA, migrationStrategies: legacyMigrationStrategies(INTERVENTION_SCHEMA, {}) }
  });
  return db as unknown as PharmacyDatabase;
}

describe('usePrintVisitData helpers and loader', () => {
  it('collectPrintVisitDrugIds deduplicates prescribed and dispensed codes while skipping blanks', () => {
    assert.deepEqual(
      collectPrintVisitDrugIds([
        { drugId: ' D1 ', dispensedDrugCode: 'D2' },
        { drugId: 'D2', dispensedDrugCode: 'D3' },
        { drugId: '', dispensedDrugCode: null },
        { drugId: 'D1', dispensedDrugCode: ' D3 ' }
      ]),
      ['D1', 'D2', 'D3']
    );
    assert.deepEqual(collectPrintVisitDrugIds([]), []);
  });

  it('selectApprovedTemplatesByDrugCode ignores non-approved templates and selects latest approved per drugCode', () => {
    const makeTpl = (
      overrides: Partial<PatientMedicationInfoTemplate> & Pick<PatientMedicationInfoTemplate, 'templateId' | 'drugCode' | 'status'>
    ): PatientMedicationInfoTemplate => ({
      drugName: 'テスト錠',
      sideEffectText: 'めまいやふらつきが出た場合は相談してください。',
      counselingText: '指示どおり毎日服用してください。',
      sourceType: 'pmda_insert',
      sourceRevisionDate: '2026-04-01',
      sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/ResultDataSetPDF/123456',
      reviewerId: 'pharmacist_1',
      ...overrides
    });

    const selected = selectApprovedTemplatesByDrugCode([
      makeTpl({ templateId: 't_draft', drugCode: 'D1', status: 'draft', approvedAt: '2026-07-01T00:00:00Z' }),
      makeTpl({ templateId: 't_old', drugCode: 'D1', status: 'approved', approvedAt: '2026-05-01T00:00:00Z' }),
      makeTpl({ templateId: 't_new', drugCode: 'D1', status: 'approved', approvedAt: '2026-06-01T00:00:00Z' }),
      makeTpl({ templateId: 't_retired', drugCode: 'D2', status: 'retired', approvedAt: '2026-06-01T00:00:00Z' })
    ]);

    assert.deepEqual(Object.keys(selected), ['D1']);
    assert.equal(selected.D1.templateId, 't_new');
  });

  it('loadPrintVisitSnapshot loads encrypted visit, active alerts, approved templates, dispensing-date pricing, remarks, and interventions', async () => {
    const db = await createPrintVisitTestDb();
    try {
      const patient: Patient = {
        patientId: 'pt_1',
        name: '印刷 太郎',
        kana: 'インサツ タロウ',
        birthDate: '1970-05-01'
      };
      const visit: Visit = {
        visitId: 'v_1',
        patientId: 'pt_1',
        issueDate: '2026-06-15T09:00:00.000Z',
        dispensingDate: '2026-06-15',
        status: 'completed'
      };
      const settings: FacilitySettings = {
        id: 'default',
        pharmacyName: 'テスト薬局',
        baseFeeCategory: '1',
        regionalSupportAddition: 'none',
        medicalDxAddition: false
      };
      const drugs: Drug[] = [
        {
          code: 'D_PRESC',
          name: '処方薬A',
          isGeneric: false,
          price: 50,
          priceHistory: [
            { price: 60 },
            { price: 55, effectiveFrom: '2026-04-01' },
            { price: 50, effectiveFrom: '2026-10-01' }
          ]
        },
        {
          code: 'D_DISP',
          name: '後発調剤薬B',
          isGeneric: true,
          price: 20,
          priceHistory: [
            { price: 25 },
            { price: 22, effectiveFrom: '2026-04-01' },
            { price: 20, effectiveFrom: '2026-10-01' }
          ]
        }
      ];
      const items: PrescriptionItem[] = [
        {
          itemId: 'i_1',
          visitId: 'v_1',
          drugId: 'D_PRESC',
          dispensedDrugCode: 'D_DISP',
          dispensedDrug: '後発調剤薬B',
          amount: 1,
          days: 14,
          usage: '1日1回朝食後',
          receiptRemark: '後発変更あり'
        }
      ];
      const alerts: Alert[] = [
        { alertId: 'a_active', patientId: 'pt_1', type: 'allergy', content: 'ペニシリンアレルギー', status: 'active' },
        { alertId: 'a_resolved', patientId: 'pt_1', type: 'side_effect', content: '解消済み副作用', status: 'resolved' }
      ];
      const templates: PatientMedicationInfoTemplate[] = [
        {
          templateId: 'tpl_approved',
          drugCode: 'D_DISP',
          drugName: '後発調剤薬B',
          status: 'approved',
          sideEffectText: 'めまいやふらつきが出た場合は相談してください。',
          counselingText: '指示どおり毎日服用してください。',
          sourceType: 'pmda_insert',
          sourceRevisionDate: '2026-04-01',
          sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/ResultDataSetPDF/123456',
          reviewerId: 'pharmacist_1',
          approvedAt: '2026-05-01T00:00:00Z'
        },
        { templateId: 'tpl_draft', drugCode: 'D_PRESC', drugName: '処方薬A', status: 'draft' }
      ];
      const interventions: Intervention[] = [
        { interventionId: 'int_1', visitId: 'v_1', reason: '後発品変更確認' }
      ];

      await Promise.all([
        db.patients.insert(patient),
        db.visits.insert(visit),
        db.facility_settings.insert(settings),
        db.drugs.bulkInsert(drugs),
        db.prescription_items.bulkInsert(items),
        db.alerts.bulkInsert(alerts),
        db.patient_medication_info_templates.bulkInsert(templates),
        db.interventions.bulkInsert(interventions)
      ]);

      const snapshot = await loadPrintVisitSnapshot(db, 'v_1');
      assert.equal(snapshot.found, true);
      if (!snapshot.found) return;

      assert.equal(snapshot.visitData.visitId, 'v_1');
      assert.equal(snapshot.patientData?.name, '印刷 太郎');
      assert.equal(snapshot.settingsData?.pharmacyName, 'テスト薬局');
      assert.deepEqual(snapshot.patientAlerts.map((a) => a.alertId), ['a_active']);
      assert.deepEqual(Object.keys(snapshot.approvedMedicationInfoTemplates), ['D_DISP']);
      assert.equal(snapshot.prescriptionItems.length, 1);
      assert.equal(snapshot.prescriptionItems[0].price, 22, 'uses 2026-04-01 price revision for 2026-06-15 dispensing date');
      assert.deepEqual(snapshot.remarks, { i_1: '後発変更あり' });
      assert.deepEqual(snapshot.interventions.map((i) => i.interventionId), ['int_1']);
    } finally {
      await db.close();
    }
  });

  it('loadPrintVisitSnapshot returns found=false for missing visit and awaits parallel stage-1 errors cleanly without unhandled rejections', async () => {
    const db = await createPrintVisitTestDb();
    try {
      const missing = await loadPrintVisitSnapshot(db, 'v_does_not_exist');
      assert.deepEqual(missing, { found: false });

      // Stage-1 の prescription_items が失敗したとき、visit=null でもエラーを握りつぶさず未処理 Promise を残さない
      let unhandled = false;
      const onUnhandled = () => { unhandled = true; };
      process.on('unhandledRejection', onUnhandled);
      try {
        const faultyDb = {
          visits: { findOne: () => ({ exec: async () => null }) },
          prescription_items: { find: () => ({ exec: async () => { throw new Error('items query failed'); } }) },
          facility_settings: { findOne: () => ({ exec: async () => null }) }
        } as unknown as PharmacyDatabase;
        await assert.rejects(() => loadPrintVisitSnapshot(faultyDb, 'v_missing'), /items query failed/);
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(unhandled, false, 'must not leave unhandledRejection from parallel stage-1 promises');
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    } finally {
      await db.close();
    }
  });
});
