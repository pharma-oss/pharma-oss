import { test } from 'node:test';
import assert from 'node:assert';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import type { Patient } from '../db/types.ts';
import { AuditLogFailedError } from './audit_guard.ts';
import { buildPatientMergeExecutionPlan, buildPatientMergePlan } from './patient_merge.ts';
import { applyPatientMergeExecutionPlanWithAudit, createRxdbPatientMergeExecutionStore } from './patient_merge_execution.ts';

// 実際の RxDB(メモリ)で、患者統合を取り消すと統合前の状態に戻ることを確かめる。
async function createDb() {
  const db: any = await createRxDatabase({ name: `pmerge${Date.now()}${Math.random().toString(36).slice(2, 8)}`, storage: getRxStorageMemory() });
  const keyed = (title: string, key: string, extra: Record<string, unknown>) => ({
    title, version: 0, primaryKey: key, type: 'object', properties: { [key]: { type: 'string', maxLength: 100 }, ...extra }, required: [key]
  });
  await db.addCollections({
    patients: { schema: keyed('patient', 'patientId', {
      name: { type: 'string' }, kana: { type: 'string' }, birthDate: { type: 'string' }, gender: { type: 'string' },
      insuranceInfo: { type: 'object' }, publicInsurances: { type: 'array', items: { type: 'object' } }
    }) },
    visits: { schema: keyed('visit', 'visitId', { patientId: { type: 'string' } }) },
    alerts: { schema: keyed('alert', 'alertId', { patientId: { type: 'string' } }) }
  } as any);
  return db;
}

// 残す患者は保険情報も公費も持たず、統合元が持っている(統合で補われる項目)
const TARGET: Patient = { patientId: 'pt_target', name: '山田 太郎', kana: '', birthDate: '1980-01-01' };
const SOURCE: Patient = {
  patientId: 'pt_source', name: '山田 太郎', kana: 'ヤマダ タロウ', birthDate: '1980-01-01', gender: 'male',
  insuranceInfo: { provider: '06123456', number: '記号123', burdenRatio: 30, relationship: '本人' },
  publicInsurances: [{ provider: '12345678', recipient: '0000001' }]
};

async function snapshot(db: any) {
  const rows = async (collection: any) => (await collection.find().exec()).map((doc: any) => JSON.parse(JSON.stringify(doc.toJSON())))
    .sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { patients: await rows(db.patients), visits: await rows(db.visits), alerts: await rows(db.alerts) };
}

async function setup(db: any) {
  await db.patients.bulkInsert([TARGET, SOURCE]);
  await db.visits.insert({ visitId: 'v1', patientId: 'pt_source' });
  await db.alerts.insert({ alertId: 'a1', patientId: 'pt_source' });
  return buildPatientMergeExecutionPlan(buildPatientMergePlan({
    targetPatient: TARGET, sourcePatient: SOURCE, sourceVisits: [{ visitId: 'v1' }], sourceAlerts: [{ alertId: 'a1' }]
  }));
}

test('a patient merge fills the kept patient in from the source and moves the visits and alerts', async () => {
  const db = await createDb();
  try {
    const executionPlan = await setup(db);
    await applyPatientMergeExecutionPlanWithAudit({
      store: createRxdbPatientMergeExecutionStore(db), executionPlan, buildAuditDetail: () => 'x', logAudit: async () => true
    });

    const after = await snapshot(db);
    assert.deepStrictEqual(after.patients.map((p: any) => p.patientId), ['pt_target']);
    assert.strictEqual(after.patients[0].insuranceInfo.number, '記号123');
    assert.strictEqual(after.patients[0].publicInsurances.length, 1);
    assert.strictEqual(after.visits[0].patientId, 'pt_target');
  } finally { await db.close(); }
});

test('cancelling a patient merge (audit log missing) brings both patients, the visits and the alerts back exactly', async () => {
  const db = await createDb();
  try {
    const executionPlan = await setup(db);
    const before = await snapshot(db);

    await assert.rejects(
      () => applyPatientMergeExecutionPlanWithAudit({
        store: createRxdbPatientMergeExecutionStore(db), executionPlan, buildAuditDetail: () => 'x', logAudit: async () => false
      }),
      (error: unknown) => error instanceof AuditLogFailedError && error.rollbackFailed === false
    );

    assert.deepStrictEqual(await snapshot(db), before,
      'the kept patient has no insurance, public insurance, gender or kana again, and the source patient is back');
  } finally { await db.close(); }
});
