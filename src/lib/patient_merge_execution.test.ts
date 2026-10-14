import { test } from 'node:test';
import assert from 'node:assert';
import type { Patient } from '../db/types.ts';
import {
  buildPatientMergeExecutionPlan,
  buildPatientMergePlan
} from './patient_merge.ts';
import { AuditLogFailedError } from './audit_guard.ts';
import {
  applyPatientMergeExecutionPlan,
  applyPatientMergeExecutionPlanWithAudit,
  PATIENT_MERGE_AUDIT_ROLLED_BACK,
  buildPatientMergeRollbackOperations,
  createRxdbPatientMergeExecutionStore,
  PatientMergeExecutionError,
  recoverFromPatientMergeFailure,
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
    // 患者本体は文書全体を差し替える(patch だと統合前に無かった項目が取り消しで消えない)
    // 保存済みの文書には gender がある(統合後の内容には無い)。全体を差し替えるなら gender は消える
    incrementalModify: async (mutate: (data: Patient) => Patient) => { calls.push(`replace:${id}:${JSON.stringify(mutate({ patientId: id, name: '', kana: '', birthDate: '', gender: 'female' }))}`); },
    remove: async () => { calls.push(`remove:${id}`); }
  });
  const collection = (docs: Record<string, ReturnType<typeof makeDoc>>) => ({
    findOne: (id: string) => ({ exec: async () => docs[id] || null }),
    insert: async (value: Patient) => { calls.push(`insert:${value.patientId}`); }
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

  assert.ok(calls.some((call) => call.startsWith('replace:pt_existing') && call.includes('既存')), 'the kept patient is replaced as a whole');
  assert.ok(calls.includes('insert:pt_new'));
  assert.ok(calls.includes('remove:pt_existing'));
  assert.ok(calls.some((call) => call.startsWith('patch:v1')));
  assert.ok(calls.some((call) => call.startsWith('patch:a1')));
  // 中身も確かめる: 受付とアラートは指定した患者へ付け替わる / 患者本体は全体の差し替え(保存済みの gender が残らない)
  assert.ok(calls.includes('patch:v1:{"patientId":"pt_existing"}'), 'the visit is moved to the given patient');
  assert.ok(calls.includes('patch:a1:{"patientId":"pt_existing"}'), 'the alert is moved to the given patient');
  assert.ok(
    calls.includes(`replace:pt_existing:${JSON.stringify({ patientId: 'pt_existing', name: '既存', kana: '', birthDate: '' })}`),
    'the kept patient is replaced as a whole: a field only the stored document had is not left behind'
  );
});

// ---- 監査ログが残らなければ統合を取り消す ----

function statefulPatientStore() {
  const state = {
    patients: { pt_target: { ...targetPatient }, pt_source: { ...sourcePatient } } as Record<string, Patient>,
    visits: { visit_1: 'pt_source' } as Record<string, string>,
    alerts: { alert_1: 'pt_source' } as Record<string, string>
  };
  const store: PatientMergeExecutionStore = {
    async upsertPatient(patient) { state.patients[patient.patientId] = { ...patient }; },
    async deletePatient(patientId) { delete state.patients[patientId]; },
    async patchVisitPatient(visitId, patientId) { state.visits[visitId] = patientId; },
    async patchAlertPatient(alertId, patientId) { state.alerts[alertId] = patientId; }
  };
  return { state, store };
}

test('applyPatientMergeExecutionPlanWithAudit keeps the merge and audits once', async () => {
  const { state, store } = statefulPatientStore();
  const details: string[] = [];

  await applyPatientMergeExecutionPlanWithAudit({
    store, executionPlan: executionPlan(),
    buildAuditDetail: (result) => `統合: ${result.appliedOperations.length}操作`,
    logAudit: async (detail) => { details.push(detail); return true; }
  });

  assert.deepStrictEqual(details, [`統合: ${executionPlan().applyOperations.length}操作`], 'the wording is built from the apply result');
  assert.strictEqual('pt_source' in state.patients, false, 'the source patient is deleted');
  assert.strictEqual(state.visits.visit_1, 'pt_target');
  assert.strictEqual(state.alerts.alert_1, 'pt_target');
});

test('applyPatientMergeExecutionPlanWithAudit brings the source patient, visits and alerts back when the audit log fails', async () => {
  const { state, store } = statefulPatientStore();
  const before = JSON.parse(JSON.stringify(state));

  await assert.rejects(
    () => applyPatientMergeExecutionPlanWithAudit({
      store, executionPlan: executionPlan(), buildAuditDetail: () => 'x', logAudit: async () => false
    }),
    (error: unknown) => {
      assert.ok(error instanceof AuditLogFailedError);
      assert.strictEqual(error.message, PATIENT_MERGE_AUDIT_ROLLED_BACK);
      return true;
    }
  );

  assert.deepStrictEqual(JSON.parse(JSON.stringify(state)), before, 'the data is exactly as it was before the merge');
});


// ---- 失敗後の後始末と利用者への伝え方(受付画面と設定の患者重複点検で共通) ----

test('recoverFromPatientMergeFailure reports a cancelled merge without touching the store when the audit log failed', async () => {
  const { calls, store } = createStore();

  const outcome = await recoverFromPatientMergeFailure(store, new AuditLogFailedError(PATIENT_MERGE_AUDIT_ROLLED_BACK));

  assert.strictEqual(outcome.message, `${PATIENT_MERGE_AUDIT_ROLLED_BACK} 候補を確認し直してください。`);
  assert.match(outcome.toast, /取り消しました/);
  assert.deepStrictEqual(calls, [], 'applyPatientMergeExecutionPlanWithAudit has already undone the merge');
});

test('recoverFromPatientMergeFailure undoes the applied prefix of a merge that failed part-way', async () => {
  const { state, store } = statefulPatientStore();
  const before = JSON.parse(JSON.stringify(state));
  const failing: PatientMergeExecutionStore = {
    ...store,
    async patchAlertPatient() { throw new Error('alert patch failed'); }
  };

  const error = await applyPatientMergeExecutionPlan(failing, executionPlan()).then(() => null, (caught: unknown) => caught);
  assert.ok(error instanceof PatientMergeExecutionError);
  assert.strictEqual(state.visits.visit_1, 'pt_target', 'the merge is half applied before the recovery');

  const outcome = await recoverFromPatientMergeFailure(store, error);

  assert.match(outcome.message, /適用済みの操作を取り消しました/);
  assert.strictEqual(outcome.toast, '患者統合に失敗しました。');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(state)), before, 'the data is exactly as it was before the merge');
});

test('recoverFromPatientMergeFailure tells the user to check the data when the undo fails too', async () => {
  const { store } = statefulPatientStore();
  const failing: PatientMergeExecutionStore = {
    ...store,
    async patchAlertPatient() { throw new Error('alert patch failed'); }
  };
  const error = await applyPatientMergeExecutionPlan(failing, executionPlan()).then(() => null, (caught: unknown) => caught);
  const brokenUndo: PatientMergeExecutionStore = {
    ...store,
    async patchVisitPatient() { throw new Error('undo failed'); }
  };

  const outcome = await recoverFromPatientMergeFailure(brokenUndo, error);

  assert.match(outcome.message, /取り消しにも失敗しました/);
  assert.strictEqual(outcome.toast, '患者統合に失敗しました。');
});

test('recoverFromPatientMergeFailure has nothing to undo for a plan that was rejected or an unknown error', async () => {
  const { calls, store } = createStore();
  const blocked = new PatientMergeExecutionError('blocked', null, []);

  for (const error of [blocked, new Error('unexpected')]) {
    const outcome = await recoverFromPatientMergeFailure(store, error);
    assert.strictEqual(outcome.message, '患者統合を実行できませんでした。候補を確認し直してください。');
    assert.strictEqual(outcome.toast, '患者統合に失敗しました。');
  }
  assert.deepStrictEqual(calls, []);
});
