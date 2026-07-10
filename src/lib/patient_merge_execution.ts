import type { Patient } from '@/db/types';
import type { PatientMergeExecutionPlan, PatientMergeOperation } from './patient_merge';

export interface PatientMergeExecutionStore {
  upsertPatient(patient: Patient): Promise<void>;
  deletePatient(patientId: string): Promise<void>;
  patchVisitPatient(visitId: string, patientId: string): Promise<void>;
  patchAlertPatient(alertId: string, patientId: string): Promise<void>;
}

export interface PatientMergeOperationRunResult {
  appliedOperations: PatientMergeOperation[];
  auditDetail: string;
  checklist: string[];
}

export interface PatientMergeApplyResult extends PatientMergeOperationRunResult {
  rollbackOperations: PatientMergeOperation[];
}

export class PatientMergeExecutionError extends Error {
  readonly failedOperation: PatientMergeOperation | null;
  readonly appliedOperations: PatientMergeOperation[];
  readonly rollbackOperations: PatientMergeOperation[];
  readonly cause?: unknown;

  constructor(
    message: string,
    failedOperation: PatientMergeOperation | null,
    appliedOperations: PatientMergeOperation[],
    cause?: unknown
  ) {
    super(message);
    this.name = 'PatientMergeExecutionError';
    this.failedOperation = failedOperation;
    this.appliedOperations = appliedOperations;
    this.rollbackOperations = buildPatientMergeRollbackOperations(appliedOperations);
    this.cause = cause;
    Object.setPrototypeOf(this, PatientMergeExecutionError.prototype);
  }
}

// RxDBコレクションを PatientMergeExecutionStore として扱う共通ファクトリ。
// 受付画面(OCR)と設定の患者重複点検の両方から同じ実行経路を使う。
export function createRxdbPatientMergeExecutionStore(db: {
  patients: any;
  visits: any;
  alerts: any;
}): PatientMergeExecutionStore {
  return {
    async upsertPatient(patient) {
      const patientDoc = await db.patients.findOne(patient.patientId).exec();
      if (patientDoc) {
        await patientDoc.patch(patient);
      } else {
        await db.patients.insert(patient);
      }
    },
    async deletePatient(patientId) {
      const patientDoc = await db.patients.findOne(patientId).exec();
      if (!patientDoc) return;
      await patientDoc.remove();
    },
    async patchVisitPatient(visitId, patientId) {
      const visitDoc = await db.visits.findOne(visitId).exec();
      if (!visitDoc) throw new Error(`受付が見つかりません: ${visitId}`);
      await visitDoc.patch({ patientId });
    },
    async patchAlertPatient(alertId, patientId) {
      const alertDoc = await db.alerts.findOne(alertId).exec();
      if (!alertDoc) throw new Error(`アラートが見つかりません: ${alertId}`);
      await alertDoc.patch({ patientId });
    }
  };
}

export function invertPatientMergeOperation(operation: PatientMergeOperation): PatientMergeOperation {
  switch (operation.type) {
    case 'upsert_patient':
      return {
        type: 'upsert_patient',
        patientId: operation.patientId,
        before: operation.after,
        after: operation.before
      };
    case 'delete_patient':
      return {
        type: 'upsert_patient',
        patientId: operation.patientId,
        before: operation.before,
        after: operation.before
      };
    case 'patch_visit_patient':
      return {
        type: 'patch_visit_patient',
        visitId: operation.visitId,
        beforePatientId: operation.afterPatientId,
        afterPatientId: operation.beforePatientId
      };
    case 'patch_alert_patient':
      return {
        type: 'patch_alert_patient',
        alertId: operation.alertId,
        beforePatientId: operation.afterPatientId,
        afterPatientId: operation.beforePatientId
      };
  }
}

export function buildPatientMergeRollbackOperations(operations: PatientMergeOperation[]): PatientMergeOperation[] {
  return [...operations].reverse().map(invertPatientMergeOperation);
}

export async function applyPatientMergeOperation(
  store: PatientMergeExecutionStore,
  operation: PatientMergeOperation
): Promise<void> {
  switch (operation.type) {
    case 'upsert_patient':
      await store.upsertPatient(operation.after);
      return;
    case 'delete_patient':
      await store.deletePatient(operation.patientId);
      return;
    case 'patch_visit_patient':
      await store.patchVisitPatient(operation.visitId, operation.afterPatientId);
      return;
    case 'patch_alert_patient':
      await store.patchAlertPatient(operation.alertId, operation.afterPatientId);
      return;
  }
}

async function runPatientMergeOperations(
  store: PatientMergeExecutionStore,
  operations: PatientMergeOperation[],
  executionPlan: Pick<PatientMergeExecutionPlan, 'auditDetail' | 'checklist'>
): Promise<PatientMergeOperationRunResult> {
  const appliedOperations: PatientMergeOperation[] = [];

  for (const operation of operations) {
    try {
      await applyPatientMergeOperation(store, operation);
      appliedOperations.push(operation);
    } catch (error) {
      throw new PatientMergeExecutionError(
        '患者統合の実行中に失敗しました。適用済みの操作だけ取り消してから再確認してください。',
        operation,
        appliedOperations,
        error
      );
    }
  }

  return {
    appliedOperations,
    auditDetail: executionPlan.auditDetail,
    checklist: executionPlan.checklist
  };
}

export async function applyPatientMergeExecutionPlan(
  store: PatientMergeExecutionStore,
  executionPlan: PatientMergeExecutionPlan
): Promise<PatientMergeApplyResult> {
  if (!executionPlan.canApply || executionPlan.applyOperations.length === 0) {
    throw new PatientMergeExecutionError(
      '患者統合計画は実行できません。統合前の確認事項を見直してください。',
      null,
      []
    );
  }

  const result = await runPatientMergeOperations(store, executionPlan.applyOperations, executionPlan);
  return {
    ...result,
    rollbackOperations: buildPatientMergeRollbackOperations(result.appliedOperations)
  };
}

export async function rollbackPatientMergeExecutionPlan(
  store: PatientMergeExecutionStore,
  executionPlan: PatientMergeExecutionPlan
): Promise<PatientMergeOperationRunResult> {
  return runPatientMergeOperations(store, executionPlan.rollbackOperations, executionPlan);
}
