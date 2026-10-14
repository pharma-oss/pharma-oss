import type { Patient } from '@/db/types';
import type { PatientMergeExecutionPlan, PatientMergeOperation } from './patient_merge';
import { AuditLogFailedError, runWithAuditRollback } from './audit_guard';

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

export interface PatientMergeDocLike {
  incrementalModify(mutationFunction: (doc: Patient) => Patient | Promise<Patient>): Promise<unknown>;
  remove(): Promise<unknown>;
}

export interface PatientMergeQueryLike<T> {
  exec(): Promise<T | null>;
}

export interface PatientMergePatientsCollectionLike {
  findOne(id: string): PatientMergeQueryLike<PatientMergeDocLike>;
  insert(patient: Patient): Promise<unknown>;
}

export interface PatientMergeVisitDocLike {
  patch(data: { patientId: string }): Promise<unknown>;
}

export interface PatientMergeAlertDocLike {
  patch(data: { patientId: string }): Promise<unknown>;
}

export interface PatientMergeDatabaseLike {
  patients: PatientMergePatientsCollectionLike;
  visits: {
    findOne(id: string): PatientMergeQueryLike<PatientMergeVisitDocLike>;
  };
  alerts: {
    findOne(id: string): PatientMergeQueryLike<PatientMergeAlertDocLike>;
  };
}

// RxDBコレクションを PatientMergeExecutionStore として扱う共通ファクトリ。
// 受付画面(OCR)と設定の患者重複点検の両方から同じ実行経路を使う。
export function createRxdbPatientMergeExecutionStore(db: PatientMergeDatabaseLike): PatientMergeExecutionStore {
  return {
    async upsertPatient(patient) {
      const patientDoc = await db.patients.findOne(patient.patientId).exec();
      if (patientDoc) {
        // 文書全体を patient の内容にする。patch だと、統合で補われた項目(保険情報・公費など)が統合前の記録に
        // 無いために消えず、取り消しても統合前の状態に戻らない。
        await patientDoc.incrementalModify(() => ({ ...patient }));
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

export const PATIENT_MERGE_AUDIT_ROLLED_BACK = '患者統合の監査ログ記録に失敗したため、統合を取り消しました。';

// 患者統合の実行: 適用 -> 監査ログ。監査ログが残らなければ、適用した操作を逆順に取り消して失敗にする。
export async function applyPatientMergeExecutionPlanWithAudit(params: {
  store: PatientMergeExecutionStore;
  executionPlan: PatientMergeExecutionPlan;
  buildAuditDetail: (result: PatientMergeApplyResult) => string;
  logAudit: (detail: string) => Promise<boolean>;
}): Promise<PatientMergeApplyResult> {
  const { store, executionPlan, buildAuditDetail, logAudit } = params;
  return runWithAuditRollback({
    write: () => applyPatientMergeExecutionPlan(store, executionPlan),
    logAudit: (result) => logAudit(buildAuditDetail(result)),
    rollback: async (result) => {
      for (const operation of result.rollbackOperations) {
        await applyPatientMergeOperation(store, operation);
      }
    },
    failureMessage: PATIENT_MERGE_AUDIT_ROLLED_BACK
  });
}

export interface PatientMergeFailureOutcome {
  // 画面に残す説明文(候補の確認し直しを促す)
  message: string;
  // 失敗を知らせるトースト
  toast: string;
}

// 患者統合が例外で終わったあとの後始末と、利用者への伝え方。
// - 監査ログが残らなかった: applyPatientMergeExecutionPlanWithAudit がすでに取り消している
// - 途中の操作で失敗した: 適用済みの操作を取り消す(取り消しにも失敗したらデータの確認を促す)
// - 何も適用していない: 取り消すものはない
// 受付画面(OCR)と設定の患者重複点検の両方がこれを使い、失敗時の扱いと文言を揃える。
export async function recoverFromPatientMergeFailure(
  store: PatientMergeExecutionStore,
  error: unknown
): Promise<PatientMergeFailureOutcome> {
  if (error instanceof AuditLogFailedError) {
    return {
      message: `${error.message} 候補を確認し直してください。`,
      toast: '患者統合を取り消しました（監査ログを記録できませんでした）。'
    };
  }
  const toast = '患者統合に失敗しました。';
  if (error instanceof PatientMergeExecutionError && error.rollbackOperations.length > 0) {
    try {
      for (const operation of error.rollbackOperations) {
        await applyPatientMergeOperation(store, operation);
      }
      return { message: '患者統合に失敗したため、適用済みの操作を取り消しました。候補を確認し直してください。', toast };
    } catch (rollbackError) {
      console.error('Failed to rollback patient merge:', rollbackError);
      return { message: '患者統合に失敗し、取り消しにも失敗しました。監査ログと患者データを確認してください。', toast };
    }
  }
  return { message: '患者統合を実行できませんでした。候補を確認し直してください。', toast };
}

export async function rollbackPatientMergeExecutionPlan(
  store: PatientMergeExecutionStore,
  executionPlan: PatientMergeExecutionPlan
): Promise<PatientMergeOperationRunResult> {
  return runPatientMergeOperations(store, executionPlan.rollbackOperations, executionPlan);
}
