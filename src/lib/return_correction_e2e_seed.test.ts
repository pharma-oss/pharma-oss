import { test } from 'node:test';
import assert from 'node:assert';
import type { AuditLog, Drug, FacilitySettings, Patient, PrescriptionItem, User, Visit } from '../db/types.ts';
import {
  compareClaimExportSnapshotToCurrent,
  buildClaimReturnCorrectionSuggestions
} from './claim_snapshot.ts';
import {
  RETURN_CORRECTION_E2E_SEED_IDS,
  buildReturnCorrectionE2ESeedRecords,
  seedReturnCorrectionE2EData,
  type ReturnCorrectionE2ESeedDatabase
} from './return_correction_e2e_seed.ts';

function collection<T>() {
  const batches: T[][] = [];
  return {
    batches,
    async bulkUpsert(rows: T[]) {
      batches.push(rows);
    }
  };
}

test('buildReturnCorrectionE2ESeedRecords creates stable return correction suggestions', () => {
  const records = buildReturnCorrectionE2ESeedRecords(new Date('2026-06-18T01:00:00.000Z'));
  const visit = records.visits[0];
  const patient = records.patients[0];
  const items = records.prescriptionItems;
  const snapshot = visit.claimLifecycle?.exportSnapshot;

  assert.ok(snapshot);
  assert.strictEqual(visit.visitId, RETURN_CORRECTION_E2E_SEED_IDS.visitId);
  assert.strictEqual(visit.claimLifecycle?.status, 'returned');

  const differences = compareClaimExportSnapshotToCurrent({
    snapshot,
    patient,
    items,
    totalPoints: 211
  });
  const suggestions = buildClaimReturnCorrectionSuggestions(differences);

  assert.deepStrictEqual(
    suggestions.map((suggestion) => suggestion.actionTarget),
    ['patient-insurance-editor', 'prescription-intervention-record', 'claim-adjust-panel']
  );
  assert.deepStrictEqual(
    suggestions.map((suggestion) => suggestion.id),
    ['insurance-master', 'prescription-items', 'claim-points']
  );
});

test('seedReturnCorrectionE2EData upserts return correction fixture data', async () => {
  const facilitySettings = collection<FacilitySettings>();
  const users = collection<User>();
  const patients = collection<Patient>();
  const visits = collection<Visit>();
  const drugs = collection<Drug>();
  const prescriptionItems = collection<PrescriptionItem>();
  const auditLogs = collection<AuditLog>();
  const db: ReturnCorrectionE2ESeedDatabase = {
    facility_settings: facilitySettings,
    users,
    patients,
    visits,
    drugs,
    prescription_items: prescriptionItems,
    audit_logs: auditLogs
  };

  const result = await seedReturnCorrectionE2EData(db, new Date('2026-06-18T01:00:00.000Z'));

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.visitId, RETURN_CORRECTION_E2E_SEED_IDS.visitId);
  assert.deepStrictEqual(result.expectedActionTargets, [
    'patient-insurance-editor',
    'prescription-intervention-record',
    'claim-adjust-panel'
  ]);
  assert.strictEqual(facilitySettings.batches[0].length, 1);
  assert.strictEqual(users.batches[0].length, 1);
  assert.strictEqual(patients.batches[0].length, 1);
  assert.strictEqual(visits.batches[0][0].claimLifecycle?.status, 'returned');
  assert.strictEqual(drugs.batches[0].length, 2);
  assert.strictEqual(prescriptionItems.batches[0][0].visitId, RETURN_CORRECTION_E2E_SEED_IDS.visitId);
  assert.strictEqual(auditLogs.batches[0][0].actionType, 'claim_lifecycle');
});
