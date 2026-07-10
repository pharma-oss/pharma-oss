import { test } from 'node:test';
import assert from 'node:assert';
import type { Patient } from '../db/types.ts';
import {
  buildPatientMergeExecutionPlan,
  buildPatientMergePlan
} from './patient_merge.ts';
import {
  applyPatientMergeExecutionPlan,
  buildPatientMergeRollbackOperations,
  createRxdbPatientMergeExecutionStore,
  PatientMergeExecutionError,
  rollbackPatientMergeExecutionPlan,
  type PatientMergeExecutionStore
} from './patient_merge_execution.ts';

const targetPatient: Patient = {
  patientId: 'pt_target',
  name: '山田 太郎',
  kana: 'ヤマダ タロウ',
  birthDate: '1980-01-01',
  insuranceInfo: {
    provider: '06123456',
    number: '記号123',
    burdenRatio: 30,
    relationship: '本人'
  }
};

const sourcePatient: Patient = {
  patientId: 'pt_source',
  name: '山田 太郎',
  kana: 'ヤマダ タロウ',
  birthDate: '1980-01-01',
  insuranceInfo: {
    provider: '06123456',
    number: '記号123',
    burdenRatio: 30,
    relationship: '本人',
    validTo: '2026-12-31'
  }
};

function executionPlan() {
  return buildPatientMergeExecutionPlan(buildPatientMergePlan({
    targetPatient,
    sourcePatient,
    sourceVisits: [{ visitId: 'visit_1' }],
    sourceAlerts: [{ alertId: 'alert_1' }]
  }));
}

function createStore(options: { failOn?: string } = {}): {
  calls: string[];
  store: PatientMergeExecutionStore;
} {
  const calls: string[] = [];
  const record = (call: string) => {
    calls.push(call);
    if (call === options.failOn) {
      throw new Error(`failed at ${call}`);
    }
  };

  return {
    calls,
    store: {
      async upsertPatient(patient) {
        record(`upsert:${patient.patientId}`);
      },
      async deletePatient(patientId) {
        record(`delete:${patientId}`);
      },
      async patchVisitPatient(visitId, patientId) {
        record(`patch_visit:${visitId}->${patientId}`);
      },
      async patchAlertPatient(alertId, patientId) {
        record(`patch_alert:${alertId}->${patientId}`);
      }
    }
  };
}

test('applyPatientMergeExecutionPlan applies patient merge operations in order', async () => {
  const plan = executionPlan();
  const { calls, store } = createStore();

  const result = await applyPatientMergeExecutionPlan(store, plan);

  assert.deepStrictEqual(calls, [
    'upsert:pt_target',
    'patch_visit:visit_1->pt_target',
    'patch_alert:alert_1->pt_target',
    'delete:pt_source'
  ]);
  assert.deepStrictEqual(result.appliedOperations, plan.applyOperations);
  assert.deepStrictEqual(result.rollbackOperations, plan.rollbackOperations);
  assert.match(result.auditDetail, /患者統合プレビュー/);
  assert.ok(result.checklist.some((item) => item.includes('バックアップ')));
});

test('rollbackPatientMergeExecutionPlan applies rollback operations in order', async () => {
  const plan = executionPlan();
  const { calls, store } = createStore();

  const result = await rollbackPatientMergeExecutionPlan(store, plan);

  assert.deepStrictEqual(calls, [
    'upsert:pt_source',
    'patch_alert:alert_1->pt_source',
    'patch_visit:visit_1->pt_source',
    'upsert:pt_target'
  ]);
  assert.deepStrictEqual(result.appliedOperations, plan.rollbackOperations);
});

test('applyPatientMergeExecutionPlan returns rollback operations for the applied prefix on failure', async () => {
  const plan = executionPlan();
  const { calls, store } = createStore({ failOn: 'patch_alert:alert_1->pt_target' });

  await assert.rejects(
    () => applyPatientMergeExecutionPlan(store, plan),
    (error) => {
      assert.ok(error instanceof PatientMergeExecutionError);
      assert.strictEqual(error.failedOperation?.type, 'patch_alert_patient');
      assert.deepStrictEqual(
        error.appliedOperations.map((operation) => operation.type),
        ['upsert_patient', 'patch_visit_patient']
      );
      assert.deepStrictEqual(
        error.rollbackOperations.map((operation) => operation.type),
        ['patch_visit_patient', 'upsert_patient']
      );
      return true;
    }
  );
  assert.deepStrictEqual(calls, [
    'upsert:pt_target',
    'patch_visit:visit_1->pt_target',
    'patch_alert:alert_1->pt_target'
  ]);
});

test('applyPatientMergeExecutionPlan rejects blocked merge plans before touching the store', async () => {
  const plan = buildPatientMergeExecutionPlan(buildPatientMergePlan({
    targetPatient,
    sourcePatient: {
      ...sourcePatient,
      patientId: targetPatient.patientId
    }
  }));
  const { calls, store } = createStore();

  await assert.rejects(
    () => applyPatientMergeExecutionPlan(store, plan),
    (error) => {
      assert.ok(error instanceof PatientMergeExecutionError);
      assert.strictEqual(error.failedOperation, null);
      assert.deepStrictEqual(error.rollbackOperations, []);
      return true;
    }
  );
  assert.deepStrictEqual(calls, []);
});

test('buildPatientMergeRollbackOperations inverts only the completed operations', () => {
  const plan = executionPlan();
  const partialOperations = plan.applyOperations.slice(0, 2);

  assert.deepStrictEqual(
    buildPatientMergeRollbackOperations(partialOperations).map((operation) => operation.type),
    ['patch_visit_patient', 'upsert_patient']
  );
});

test('createRxdbPatientMergeExecutionStore patches and removes RxDB documents', async () => {
  const calls: string[] = [];
  const makeDoc = (id: string) => ({
    patch: async (value: unknown) => { calls.push(`patch:${id}:${JSON.stringify(value)}`); },
    remove: async () => { calls.push(`remove:${id}`); }
  });
  const collection = (docs: Record<string, ReturnType<typeof makeDoc>>) => ({
    findOne: (id: string) => ({ exec: async () => docs[id] || null }),
    insert: async (value: { patientId?: string }) => { calls.push(`insert:${value.patientId}`); }
  });
  const db = {
    patients: collection({ pt_existing: makeDoc('pt_existing') }),
    visits: collection({ v1: makeDoc('v1') }),
    alerts: collection({ a1: makeDoc('a1') })
  };
  const store = createRxdbPatientMergeExecutionStore(db);

  await store.upsertPatient({ patientId: 'pt_existing', name: '既存', kana: '', birthDate: '' });
  await store.upsertPatient({ patientId: 'pt_new', name: '新規', kana: '', birthDate: '' });
  await store.deletePatient('pt_existing');
  await store.deletePatient('pt_missing');
  await store.patchVisitPatient('v1', 'pt_existing');
  await store.patchAlertPatient('a1', 'pt_existing');
  await assert.rejects(() => store.patchVisitPatient('v_missing', 'pt_existing'), /受付が見つかりません/);
  await assert.rejects(() => store.patchAlertPatient('a_missing', 'pt_existing'), /アラートが見つかりません/);

  assert.ok(calls.some((call) => call.startsWith('patch:pt_existing')));
  assert.ok(calls.includes('insert:pt_new'));
  assert.ok(calls.includes('remove:pt_existing'));
  assert.ok(calls.some((call) => call.startsWith('patch:v1')));
  assert.ok(calls.some((call) => call.startsWith('patch:a1')));
});
