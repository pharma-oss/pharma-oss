import type { Alert, Patient, PublicInsurance, Visit } from '@/db/types';

export type PatientMergeReassignmentCollection = 'visits' | 'alerts';
export type PatientMergeIssueSeverity = 'error' | 'warning';

export interface PatientMergeConflict {
  field: string;
  label: string;
  targetValue: string;
  sourceValue: string;
  resolution: 'keep_target' | 'merge_public_insurance';
}

export interface PatientMergeIssue {
  severity: PatientMergeIssueSeverity;
  code: string;
  message: string;
}

export interface PatientMergeReassignment {
  collection: PatientMergeReassignmentCollection;
  sourcePatientId: string;
  targetPatientId: string;
  count: number;
  ids: string[];
}

export interface PatientMergePlanInput {
  targetPatient: Patient;
  sourcePatient: Patient;
  sourceVisits?: Pick<Visit, 'visitId'>[];
  sourceAlerts?: Pick<Alert, 'alertId'>[];
}

export interface PatientMergePatientUpsertOperation {
  type: 'upsert_patient';
  patientId: string;
  before: Patient;
  after: Patient;
}

export interface PatientMergePatientDeleteOperation {
  type: 'delete_patient';
  patientId: string;
  before: Patient;
}

export interface PatientMergeVisitPatchOperation {
  type: 'patch_visit_patient';
  visitId: string;
  beforePatientId: string;
  afterPatientId: string;
}

export interface PatientMergeAlertPatchOperation {
  type: 'patch_alert_patient';
  alertId: string;
  beforePatientId: string;
  afterPatientId: string;
}

export type PatientMergeOperation =
  | PatientMergePatientUpsertOperation
  | PatientMergePatientDeleteOperation
  | PatientMergeVisitPatchOperation
  | PatientMergeAlertPatchOperation;

export interface PatientMergeExecutionPlan {
  canApply: boolean;
  applyOperations: PatientMergeOperation[];
  rollbackOperations: PatientMergeOperation[];
  auditDetail: string;
  checklist: string[];
}

export interface PatientMergePlan {
  targetPatientId: string;
  sourcePatientId: string;
  sourcePatient: Patient;
  targetPatientBefore: Patient;
  mergedPatient: Patient;
  reassignments: PatientMergeReassignment[];
  conflicts: PatientMergeConflict[];
  issues: PatientMergeIssue[];
  canApply: boolean;
  summary: string;
}

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

function addIssue(issues: PatientMergeIssue[], issue: PatientMergeIssue) {
  issues.push(issue);
}

function addConflict(
  conflicts: PatientMergeConflict[],
  field: string,
  label: string,
  targetValue: unknown,
  sourceValue: unknown,
  resolution: PatientMergeConflict['resolution'] = 'keep_target'
) {
  const targetText = asText(targetValue);
  const sourceText = asText(sourceValue);
  if (!targetText || !sourceText || targetText === sourceText) return;
  conflicts.push({
    field,
    label,
    targetValue: targetText,
    sourceValue: sourceText,
    resolution
  });
}

function mergeField<T>(targetValue: T | undefined, sourceValue: T | undefined): T | undefined {
  const targetText = asText(targetValue);
  if (targetText) return targetValue;
  return sourceValue;
}

function publicInsuranceKey(insurance: PublicInsurance): string {
  return [
    asText(insurance.provider),
    asText(insurance.recipient)
  ].join(':');
}

function mergePublicInsurances(
  targetInsurances: PublicInsurance[] | undefined,
  sourceInsurances: PublicInsurance[] | undefined,
  conflicts: PatientMergeConflict[]
): PublicInsurance[] | undefined {
  const merged = [...(targetInsurances || [])].map((insurance) => ({ ...insurance }));
  const seen = new Map(merged.map((insurance, index) => [publicInsuranceKey(insurance), index]));

  for (const sourceInsurance of sourceInsurances || []) {
    const key = publicInsuranceKey(sourceInsurance);
    const targetIndex = seen.get(key);
    if (targetIndex === undefined) {
      seen.set(key, merged.length);
      merged.push({ ...sourceInsurance });
      continue;
    }

    const targetInsurance = merged[targetIndex];
    addConflict(conflicts, `publicInsurances.${key}.burdenRatio`, '公費負担割合', targetInsurance.burdenRatio, sourceInsurance.burdenRatio, 'merge_public_insurance');
    addConflict(conflicts, `publicInsurances.${key}.startDate`, '公費開始日', targetInsurance.startDate, sourceInsurance.startDate, 'merge_public_insurance');
    addConflict(conflicts, `publicInsurances.${key}.endDate`, '公費終了日', targetInsurance.endDate, sourceInsurance.endDate, 'merge_public_insurance');
    addConflict(conflicts, `publicInsurances.${key}.monthlyLimitYen`, '公費月額上限', targetInsurance.monthlyLimitYen, sourceInsurance.monthlyLimitYen, 'merge_public_insurance');
    merged[targetIndex] = {
      ...targetInsurance,
      burdenRatio: mergeField(targetInsurance.burdenRatio, sourceInsurance.burdenRatio),
      startDate: mergeField(targetInsurance.startDate, sourceInsurance.startDate),
      endDate: mergeField(targetInsurance.endDate, sourceInsurance.endDate),
      monthlyLimitYen: mergeField(targetInsurance.monthlyLimitYen, sourceInsurance.monthlyLimitYen)
    };
  }

  return merged.length > 0 ? merged : undefined;
}

function mergePatientMaster(
  targetPatient: Patient,
  sourcePatient: Patient,
  conflicts: PatientMergeConflict[]
): Patient {
  addConflict(conflicts, 'name', '患者名', targetPatient.name, sourcePatient.name);
  addConflict(conflicts, 'kana', 'カナ', targetPatient.kana, sourcePatient.kana);
  addConflict(conflicts, 'birthDate', '生年月日', targetPatient.birthDate, sourcePatient.birthDate);
  addConflict(conflicts, 'gender', '性別', targetPatient.gender, sourcePatient.gender);

  const targetInsurance = targetPatient.insuranceInfo;
  const sourceInsurance = sourcePatient.insuranceInfo;
  const insuranceInfo = targetInsurance || sourceInsurance
    ? {
        provider: mergeField(targetInsurance?.provider, sourceInsurance?.provider),
        number: mergeField(targetInsurance?.number, sourceInsurance?.number),
        burdenRatio: mergeField(targetInsurance?.burdenRatio, sourceInsurance?.burdenRatio),
        insuranceType: mergeField(targetInsurance?.insuranceType, sourceInsurance?.insuranceType),
        relationship: mergeField(targetInsurance?.relationship, sourceInsurance?.relationship),
        validFrom: mergeField(targetInsurance?.validFrom, sourceInsurance?.validFrom),
        validTo: mergeField(targetInsurance?.validTo, sourceInsurance?.validTo),
        eligibilityCheckedAt: mergeField(targetInsurance?.eligibilityCheckedAt, sourceInsurance?.eligibilityCheckedAt),
        eligibilityStatus: mergeField(targetInsurance?.eligibilityStatus, sourceInsurance?.eligibilityStatus)
      }
    : undefined;

  addConflict(conflicts, 'insuranceInfo.provider', '保険者番号', targetInsurance?.provider, sourceInsurance?.provider);
  addConflict(conflicts, 'insuranceInfo.number', '記号番号', targetInsurance?.number, sourceInsurance?.number);
  addConflict(conflicts, 'insuranceInfo.burdenRatio', '負担割合', targetInsurance?.burdenRatio, sourceInsurance?.burdenRatio);
  addConflict(conflicts, 'insuranceInfo.insuranceType', '保険種別', targetInsurance?.insuranceType, sourceInsurance?.insuranceType);
  addConflict(conflicts, 'insuranceInfo.relationship', '本人・家族', targetInsurance?.relationship, sourceInsurance?.relationship);
  addConflict(conflicts, 'insuranceInfo.validFrom', '保険有効開始日', targetInsurance?.validFrom, sourceInsurance?.validFrom);
  addConflict(conflicts, 'insuranceInfo.validTo', '保険有効期限', targetInsurance?.validTo, sourceInsurance?.validTo);
  addConflict(conflicts, 'insuranceInfo.eligibilityCheckedAt', '資格確認日', targetInsurance?.eligibilityCheckedAt, sourceInsurance?.eligibilityCheckedAt);
  addConflict(conflicts, 'insuranceInfo.eligibilityStatus', '資格確認状態', targetInsurance?.eligibilityStatus, sourceInsurance?.eligibilityStatus);

  return {
    ...targetPatient,
    kana: mergeField(targetPatient.kana, sourcePatient.kana) || '',
    birthDate: mergeField(targetPatient.birthDate, sourcePatient.birthDate) || '',
    gender: mergeField(targetPatient.gender, sourcePatient.gender),
    ...(insuranceInfo ? { insuranceInfo } : {}),
    ...(() => {
      const publicInsurances = mergePublicInsurances(targetPatient.publicInsurances, sourcePatient.publicInsurances, conflicts);
      return publicInsurances ? { publicInsurances } : {};
    })()
  };
}

function buildReassignment(
  collection: PatientMergeReassignmentCollection,
  ids: string[],
  sourcePatientId: string,
  targetPatientId: string
): PatientMergeReassignment {
  return {
    collection,
    sourcePatientId,
    targetPatientId,
    count: ids.length,
    ids
  };
}

export function buildPatientMergePlan(input: PatientMergePlanInput): PatientMergePlan {
  const { targetPatient, sourcePatient } = input;
  const issues: PatientMergeIssue[] = [];
  const conflicts: PatientMergeConflict[] = [];

  if (targetPatient.patientId === sourcePatient.patientId) {
    addIssue(issues, {
      severity: 'error',
      code: 'patient_merge_same_patient',
      message: '同じ患者ID同士は統合できません。'
    });
  }

  if (asText(targetPatient.name) && asText(sourcePatient.name) && asText(targetPatient.name) !== asText(sourcePatient.name)) {
    addIssue(issues, {
      severity: 'warning',
      code: 'patient_merge_name_differs',
      message: '患者名が異なります。別人統合ではないか確認してください。'
    });
  }

  if (asText(targetPatient.birthDate) && asText(sourcePatient.birthDate) && asText(targetPatient.birthDate) !== asText(sourcePatient.birthDate)) {
    addIssue(issues, {
      severity: 'warning',
      code: 'patient_merge_birthdate_differs',
      message: '生年月日が異なります。統合前に本人確認をしてください。'
    });
  }

  const mergedPatient = mergePatientMaster(targetPatient, sourcePatient, conflicts);
  const sourceVisitIds = (input.sourceVisits || []).map((visit) => visit.visitId).filter(Boolean);
  const sourceAlertIds = (input.sourceAlerts || []).map((alert) => alert.alertId).filter(Boolean);
  const reassignments = [
    buildReassignment('visits', sourceVisitIds, sourcePatient.patientId, targetPatient.patientId),
    buildReassignment('alerts', sourceAlertIds, sourcePatient.patientId, targetPatient.patientId)
  ].filter((reassignment) => reassignment.count > 0);

  const blockingIssues = issues.filter((issue) => issue.severity === 'error');
  const movedCount = reassignments.reduce((sum, reassignment) => sum + reassignment.count, 0);
  return {
    targetPatientId: targetPatient.patientId,
    sourcePatientId: sourcePatient.patientId,
    sourcePatient,
    targetPatientBefore: targetPatient,
    mergedPatient,
    reassignments,
    conflicts,
    issues,
    canApply: blockingIssues.length === 0,
    summary: `${sourcePatient.name}（${sourcePatient.patientId}）を ${targetPatient.name}（${targetPatient.patientId}）へ統合: 移動対象${movedCount}件、確認事項${issues.length + conflicts.length}件`
  };
}

export function buildPatientMergeAuditDetail(plan: PatientMergePlan): string {
  const reassignText = plan.reassignments.length > 0
    ? plan.reassignments.map((item) => `${item.collection} ${item.count}件`).join(' / ')
    : '移動対象なし';
  const conflictText = plan.conflicts.length > 0
    ? `確認事項 ${plan.conflicts.map((conflict) => `${conflict.label}:${conflict.sourceValue}->${conflict.targetValue}`).join('、')}`
    : '確認事項なし';
  return [
    `患者統合プレビュー: ${plan.sourcePatientId} -> ${plan.targetPatientId}`,
    reassignText,
    conflictText,
    `判定 ${plan.canApply ? '統合可能' : '統合不可'}`
  ].join(' / ');
}

export function buildPatientMergeExecutionPlan(plan: PatientMergePlan): PatientMergeExecutionPlan {
  const applyOperations: PatientMergeOperation[] = [];
  const rollbackOperations: PatientMergeOperation[] = [];

  if (plan.canApply) {
    applyOperations.push({
      type: 'upsert_patient',
      patientId: plan.targetPatientId,
      before: plan.targetPatientBefore,
      after: plan.mergedPatient
    });
    rollbackOperations.unshift({
      type: 'upsert_patient',
      patientId: plan.targetPatientId,
      before: plan.mergedPatient,
      after: plan.targetPatientBefore
    });

    for (const reassignment of plan.reassignments) {
      for (const id of reassignment.ids) {
        if (reassignment.collection === 'visits') {
          applyOperations.push({
            type: 'patch_visit_patient',
            visitId: id,
            beforePatientId: plan.sourcePatientId,
            afterPatientId: plan.targetPatientId
          });
          rollbackOperations.unshift({
            type: 'patch_visit_patient',
            visitId: id,
            beforePatientId: plan.targetPatientId,
            afterPatientId: plan.sourcePatientId
          });
        } else {
          applyOperations.push({
            type: 'patch_alert_patient',
            alertId: id,
            beforePatientId: plan.sourcePatientId,
            afterPatientId: plan.targetPatientId
          });
          rollbackOperations.unshift({
            type: 'patch_alert_patient',
            alertId: id,
            beforePatientId: plan.targetPatientId,
            afterPatientId: plan.sourcePatientId
          });
        }
      }
    }

    applyOperations.push({
      type: 'delete_patient',
      patientId: plan.sourcePatientId,
      before: plan.sourcePatient
    });
    rollbackOperations.unshift({
      type: 'upsert_patient',
      patientId: plan.sourcePatientId,
      before: plan.sourcePatient,
      after: plan.sourcePatient
    });
  }

  return {
    canApply: plan.canApply,
    applyOperations,
    rollbackOperations,
    auditDetail: buildPatientMergeAuditDetail(plan),
    checklist: [
      '統合前バックアップを作成する',
      '残す患者と統合元患者の氏名・生年月日・保険番号を確認する',
      '保険・公費の確認事項を薬剤師または管理者が確認する',
      '実行後に受付、アラート、監査ログを確認する'
    ]
  };
}
