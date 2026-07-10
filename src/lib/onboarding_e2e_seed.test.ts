import { test } from 'node:test';
import assert from 'node:assert';
import type { AuditLog, Drug, FacilitySettings, Patient, PrescriptionItem, User, Visit } from '../db/types.ts';
import { buildInitialSetupChecklist } from './onboarding.ts';
import { buildOperationalClosingMonthlyReview } from './operational_closing_review.ts';
import {
  ONBOARDING_E2E_SEED_IDS,
  buildOnboardingE2ESeedRecords,
  seedOnboardingE2EData,
  type OnboardingE2ESeedDatabase
} from './onboarding_e2e_seed.ts';

function collection<T>() {
  const batches: T[][] = [];
  return {
    batches,
    async bulkUpsert(rows: T[]) {
      batches.push(rows);
    }
  };
}

test('buildOnboardingE2ESeedRecords creates setup-complete onboarding evidence', () => {
  const seededAt = new Date('2026-06-18T01:00:00.000Z');
  const records = buildOnboardingE2ESeedRecords(seededAt);
  const checklist = buildInitialSetupChecklist({
    settings: records.facilitySettings,
    staff: records.users,
    auditLogs: records.auditLogs,
    generatedAt: seededAt
  });
  const closingReview = buildOperationalClosingMonthlyReview(records.auditLogs, seededAt, {
    currentStoreName: records.facilitySettings.pharmacyName,
    currentStoreCode: records.facilitySettings.pharmacyCode
  });

  assert.strictEqual(records.visits[0].visitId, ONBOARDING_E2E_SEED_IDS.visitId);
  assert.strictEqual(records.patients[0].patientId, ONBOARDING_E2E_SEED_IDS.patientId);
  assert.strictEqual(records.prescriptionItems[0].visitId, ONBOARDING_E2E_SEED_IDS.visitId);
  assert.strictEqual(records.prescriptionItems.length, 3);
  assert.ok(records.prescriptionItems.some((item) => item.itemId === ONBOARDING_E2E_SEED_IDS.liquidPrescriptionItemId));
  assert.ok(records.prescriptionItems.some((item) => item.itemId === ONBOARDING_E2E_SEED_IDS.ointmentPrescriptionItemId));
  assert.strictEqual(records.visits[0].claimLifecycle?.status, 'rebilling');
  assert.strictEqual(records.visits[0].claimLifecycle?.exportSnapshot?.prescriptionItems.length, 3);
  assert.ok(records.drugs[0].price && records.drugs[0].price > 0);
  assert.deepStrictEqual(
    records.auditLogs.map((log) => log.actionType),
    ['drug_master_update', 'backup_drill', 'backup_export', 'backup_external_storage', 'claim_lifecycle', 'uke_export', 'print', 'daily_closing_approval', 'daily_closing_approval']
  );
  assert.strictEqual(checklist.status, 'complete');
  assert.strictEqual(checklist.statusLabel, '導入準備OK');
  assert.strictEqual(closingReview.totalInventoryShortages, 1);
  assert.strictEqual(closingReview.totalInventoryReceivings, 2);
  assert.strictEqual(closingReview.totalFollowUpDueCount, 1);
  assert.strictEqual(closingReview.totalSupportCaseCount, 1);
  assert.strictEqual(closingReview.previousMonthComparison.inventoryShortageDeltaLabel, '-2品目');
  assert.strictEqual(closingReview.previousMonthComparison.inventoryReceivingDeltaLabel, '+1件');
  assert.strictEqual(closingReview.previousMonthComparison.followUpDueDeltaLabel, '-1件');
  assert.strictEqual(closingReview.previousMonthComparison.supportCaseDeltaLabel, '-2件');
});

test('seedOnboardingE2EData upserts every collection and returns the seeded visit', async () => {
  const facilitySettings = collection<FacilitySettings>();
  const users = collection<User>();
  const patients = collection<Patient>();
  const visits = collection<Visit>();
  const drugs = collection<Drug>();
  const prescriptionItems = collection<PrescriptionItem>();
  const auditLogs = collection<AuditLog>();
  const db: OnboardingE2ESeedDatabase = {
    facility_settings: facilitySettings,
    users,
    patients,
    visits,
    drugs,
    prescription_items: prescriptionItems,
    audit_logs: auditLogs
  };

  const result = await seedOnboardingE2EData(db, new Date('2026-06-18T01:00:00.000Z'));

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.visitId, ONBOARDING_E2E_SEED_IDS.visitId);
  assert.strictEqual(result.patientId, ONBOARDING_E2E_SEED_IDS.patientId);
  assert.strictEqual(result.auditLogIds.length, 9);
  assert.deepStrictEqual(result.collections, [
    'facility_settings',
    'users',
    'patients',
    'visits',
    'drugs',
    'prescription_items',
    'audit_logs'
  ]);
  assert.strictEqual(facilitySettings.batches[0].length, 1);
  assert.strictEqual(users.batches[0].length, 2);
  assert.strictEqual(patients.batches[0].length, 1);
  assert.strictEqual(visits.batches[0][0].visitId, ONBOARDING_E2E_SEED_IDS.visitId);
  assert.strictEqual(drugs.batches[0].length, 3);
  assert.strictEqual(prescriptionItems.batches[0].length, 3);
  assert.strictEqual(drugs.batches[0][0].code, ONBOARDING_E2E_SEED_IDS.drugCode);
  assert.strictEqual(prescriptionItems.batches[0][0].itemId, ONBOARDING_E2E_SEED_IDS.prescriptionItemId);
  assert.strictEqual(auditLogs.batches[0].length, 9);
});
