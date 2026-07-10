import { test } from 'node:test';
import assert from 'node:assert';
import type { Alert, Patient, Visit } from '../db/types.ts';
import {
  buildPatientMergeAuditDetail,
  buildPatientMergeExecutionPlan,
  buildPatientMergePlan
} from './patient_merge.ts';

const targetPatient: Patient = {
  patientId: 'pt_target',
  name: '山田 太郎',
  kana: 'ヤマダ タロウ',
  birthDate: '1980-01-01',
  gender: 'male',
  insuranceInfo: {
    provider: '06123456',
    number: '記号123',
    burdenRatio: 30,
    relationship: '本人',
    eligibilityStatus: 'valid'
  },
  publicInsurances: [
    {
      provider: '51136018',
      recipient: '1234567',
      burdenRatio: 10,
      monthlyLimitYen: 5000
    }
  ]
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
    validTo: '2026-12-31',
    eligibilityCheckedAt: '2026-06-15T09:00:00.000Z'
  },
  publicInsurances: [
    {
      provider: '81136018',
      recipient: '7654321',
      burdenRatio: 20,
      monthlyLimitYen: 10000
    }
  ]
};

function visit(visitId: string): Pick<Visit, 'visitId'> {
  return { visitId };
}

function alert(alertId: string): Pick<Alert, 'alertId'> {
  return { alertId };
}

test('buildPatientMergePlan reassigns source visits and alerts to the target patient', () => {
  const plan = buildPatientMergePlan({
    targetPatient,
    sourcePatient,
    sourceVisits: [visit('visit_1'), visit('visit_2')],
    sourceAlerts: [alert('alert_1')]
  });

  assert.strictEqual(plan.canApply, true);
  assert.deepStrictEqual(
    plan.reassignments.map((reassignment) => ({
      collection: reassignment.collection,
      count: reassignment.count,
      ids: reassignment.ids
    })),
    [
      { collection: 'visits', count: 2, ids: ['visit_1', 'visit_2'] },
      { collection: 'alerts', count: 1, ids: ['alert_1'] }
    ]
  );
  assert.strictEqual(plan.mergedPatient.insuranceInfo?.validTo, '2026-12-31');
  assert.strictEqual(plan.mergedPatient.insuranceInfo?.eligibilityCheckedAt, '2026-06-15T09:00:00.000Z');
  assert.strictEqual(plan.mergedPatient.publicInsurances?.length, 2);
  assert.match(plan.summary, /移動対象3件/);
});

test('buildPatientMergePlan keeps target values and records conflicts for differing insurance fields', () => {
  const plan = buildPatientMergePlan({
    targetPatient,
    sourcePatient: {
      ...sourcePatient,
      insuranceInfo: {
        ...sourcePatient.insuranceInfo,
        number: '別記号999',
        burdenRatio: 20
      }
    }
  });

  assert.strictEqual(plan.mergedPatient.insuranceInfo?.number, '記号123');
  assert.strictEqual(plan.mergedPatient.insuranceInfo?.burdenRatio, 30);
  assert.ok(plan.conflicts.some((conflict) => conflict.field === 'insuranceInfo.number'));
  assert.ok(plan.conflicts.some((conflict) => conflict.field === 'insuranceInfo.burdenRatio'));
});

test('buildPatientMergePlan warns when names or birth dates differ', () => {
  const plan = buildPatientMergePlan({
    targetPatient,
    sourcePatient: {
      ...sourcePatient,
      name: '山田 次郎',
      birthDate: '1970-01-01'
    }
  });

  assert.strictEqual(plan.canApply, true);
  assert.ok(plan.issues.some((issue) => issue.code === 'patient_merge_name_differs' && issue.severity === 'warning'));
  assert.ok(plan.issues.some((issue) => issue.code === 'patient_merge_birthdate_differs' && issue.severity === 'warning'));
  assert.ok(plan.conflicts.some((conflict) => conflict.field === 'name'));
  assert.ok(plan.conflicts.some((conflict) => conflict.field === 'birthDate'));
});

test('buildPatientMergePlan blocks merging the same patient id', () => {
  const plan = buildPatientMergePlan({
    targetPatient,
    sourcePatient: {
      ...sourcePatient,
      patientId: targetPatient.patientId
    }
  });

  assert.strictEqual(plan.canApply, false);
  assert.ok(plan.issues.some((issue) => issue.code === 'patient_merge_same_patient' && issue.severity === 'error'));
});

test('buildPatientMergeAuditDetail summarizes patient merge evidence', () => {
  const plan = buildPatientMergePlan({
    targetPatient,
    sourcePatient,
    sourceVisits: [visit('visit_1')],
    sourceAlerts: [alert('alert_1')]
  });

  const detail = buildPatientMergeAuditDetail(plan);

  assert.match(detail, /患者統合プレビュー/);
  assert.match(detail, /pt_source -> pt_target/);
  assert.match(detail, /visits 1件/);
  assert.match(detail, /alerts 1件/);
  assert.match(detail, /判定 統合可能/);
});

test('buildPatientMergeExecutionPlan lists apply and rollback operations in executable order', () => {
  const plan = buildPatientMergePlan({
    targetPatient,
    sourcePatient,
    sourceVisits: [visit('visit_1')],
    sourceAlerts: [alert('alert_1')]
  });

  const executionPlan = buildPatientMergeExecutionPlan(plan);

  assert.strictEqual(executionPlan.canApply, true);
  assert.deepStrictEqual(
    executionPlan.applyOperations.map((operation) => operation.type),
    ['upsert_patient', 'patch_visit_patient', 'patch_alert_patient', 'delete_patient']
  );
  assert.deepStrictEqual(
    executionPlan.rollbackOperations.map((operation) => operation.type),
    ['upsert_patient', 'patch_alert_patient', 'patch_visit_patient', 'upsert_patient']
  );
  assert.ok(executionPlan.applyOperations.some((operation) => (
    operation.type === 'patch_visit_patient'
    && operation.visitId === 'visit_1'
    && operation.beforePatientId === 'pt_source'
    && operation.afterPatientId === 'pt_target'
  )));
  assert.ok(executionPlan.rollbackOperations.some((operation) => (
    operation.type === 'patch_alert_patient'
    && operation.alertId === 'alert_1'
    && operation.beforePatientId === 'pt_target'
    && operation.afterPatientId === 'pt_source'
  )));
  assert.ok(executionPlan.checklist.some((item) => item.includes('バックアップ')));
  assert.match(executionPlan.auditDetail, /患者統合プレビュー/);
});

test('buildPatientMergeExecutionPlan produces no operations when merge is blocked', () => {
  const plan = buildPatientMergePlan({
    targetPatient,
    sourcePatient: {
      ...sourcePatient,
      patientId: targetPatient.patientId
    },
    sourceVisits: [visit('visit_1')]
  });

  const executionPlan = buildPatientMergeExecutionPlan(plan);

  assert.strictEqual(executionPlan.canApply, false);
  assert.deepStrictEqual(executionPlan.applyOperations, []);
  assert.deepStrictEqual(executionPlan.rollbackOperations, []);
});
