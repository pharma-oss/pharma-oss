import { useState, useCallback } from 'react';
import type { VisitElectronicPrescription } from '@/db/types';
import {
  requiresElectronicPrescriptionDispensingHpkiSignature,
  validateElectronicPrescriptionLifecycleOperation,
  type ElectronicPrescriptionOperationKind,
  type ElectronicPrescriptionOperationResult
} from '@/lib/electronic_prescription';
import { isDemoVisit } from '@/lib/demo_data';
import { logAuditAction, type PermissionAction } from '@/lib/audit';
import { formatPrescriptionAuditIssues, getElectronicPrescriptionDocumentKinds } from '../app/print/helpers';
import {
  ELECTRONIC_PRESCRIPTION_OPERATION_LABELS,
  ELECTRONIC_PRESCRIPTION_HPKI_STATUS_LABELS,
  ELECTRONIC_PRESCRIPTION_FILE_SIGNATURE_STATUS_LABELS
} from '../app/print/types';

export interface UsePrintElectronicPrescriptionProps {
  db: any;
  visitId: string;
  visitData: any;
  patientData: any;
  prescriptionItems: any[];
  totalPoints: number;
  prescriptionAudit: { errorCount: number; issues: any[] };
  canChangeBilling: boolean;
  ensurePermission?: (action: PermissionAction) => boolean;
  setVisitData: React.Dispatch<React.SetStateAction<any>>;
}

export function usePrintElectronicPrescription({
  db,
  visitId,
  visitData,
  patientData,
  prescriptionItems,
  totalPoints,
  prescriptionAudit,
  canChangeBilling,
  ensurePermission,
  setVisitData
}: UsePrintElectronicPrescriptionProps) {
  const [electronicPrescriptionOperationInFlight, setElectronicPrescriptionOperationInFlight] = useState<ElectronicPrescriptionOperationKind | null>(null);

  const electronicPrescription = visitData?.electronicPrescription as VisitElectronicPrescription | undefined;
  const electronicPrescriptionIds = electronicPrescription
    ? Array.from(new Set([
        electronicPrescription.prescriptionId,
        ...(electronicPrescription.linkedPrescriptions?.map((item) => item.prescriptionId) || [])
      ].filter(Boolean)))
    : [];

  const electronicPrescriptionReceptionStatus = electronicPrescription?.receptionStatus || 'accepted';
  const electronicPrescriptionDispensingResultStatus = electronicPrescription?.dispensingResultStatus || 'pending';
  const electronicPrescriptionSignatureStatus = electronicPrescription?.signatureStatus || 'not_checked';
  const electronicPrescriptionDuplicateCheckStatus = electronicPrescription?.duplicateCheckStatus || 'not_checked';
  const electronicPrescriptionRegistered = electronicPrescriptionDispensingResultStatus === 'registered';
  const electronicPrescriptionOperationBusy = electronicPrescriptionOperationInFlight !== null;

  const canSubmitElectronicPrescriptionOperation = canChangeBilling && !electronicPrescription && electronicPrescriptionReceptionStatus !== 'cancelled';

  const electronicPrescriptionLifecycleDecision = useCallback((operation: ElectronicPrescriptionOperationKind) => (
    electronicPrescription
      ? validateElectronicPrescriptionLifecycleOperation(operation, electronicPrescription)
      : { allowed: false, message: '電子処方箋情報がありません。' }
  ), [electronicPrescription]);

  const canRunElectronicPrescriptionDuplicateCheck = canSubmitElectronicPrescriptionOperation && !electronicPrescriptionOperationBusy;
  const canSearchElectronicPrescriptionDispensingResult = canSubmitElectronicPrescriptionOperation && !electronicPrescriptionOperationBusy;
  const canRegisterElectronicPrescriptionDispensingResult = canSubmitElectronicPrescriptionOperation
    && !electronicPrescriptionOperationBusy
    && electronicPrescriptionLifecycleDecision('dispensing_result_register').allowed
    && prescriptionAudit.errorCount === 0;
  const canChangeElectronicPrescriptionDispensingResult = canSubmitElectronicPrescriptionOperation
    && !electronicPrescriptionOperationBusy
    && electronicPrescriptionLifecycleDecision('dispensing_result_change').allowed
    && prescriptionAudit.errorCount === 0;
  const canCancelElectronicPrescriptionDispensingResult = canSubmitElectronicPrescriptionOperation
    && !electronicPrescriptionOperationBusy
    && electronicPrescriptionLifecycleDecision('dispensing_result_cancel').allowed;
  const canCancelElectronicPrescriptionReception = canSubmitElectronicPrescriptionOperation
    && !electronicPrescriptionOperationBusy
    && electronicPrescriptionLifecycleDecision('reception_cancel').allowed;

  const electronicPrescriptionFlowStatus = !electronicPrescription
    ? 'skipped'
    : electronicPrescriptionReceptionStatus === 'cancelled'
      ? 'cancelled'
      : electronicPrescriptionDispensingResultStatus === 'registered'
        ? 'completed'
        : 'in_progress';

  const buildElectronicPrescriptionDispensingPayload = () => ({
    type: 'yakureki-electronic-prescription-dispensing-result' as const,
    schemaVersion: 1 as const,
    prescriptionDate: visitData?.prescriptionDate || visitData?.issueDate,
    dispensingDate: visitData?.dispensingDate || new Date().toISOString().slice(0, 10),
    totalPoints,
    signatureRequirement: {
      hpkiSignatureRequired: visitData?.electronicPrescription
        ? requiresElectronicPrescriptionDispensingHpkiSignature(
            getElectronicPrescriptionDocumentKinds(visitData.electronicPrescription)
          )
        : true,
      expectedSignerRole: 'pharmacist' as const
    },
    items: prescriptionItems.map((item, index) => ({
      itemId: item.itemId,
      rpNumber: item.rpNumber || index + 1,
      prescribedDrugCode: item.drugId,
      dispensedDrugCode: item.dispensedDrugCode || item.drugId,
      yjCode: item.dispensedYjCode || item.yjCode || item.prescribedYjCode,
      prescribedDrugCodeStatus: item.prescribedDrugCodeStatus,
      prescribedDrugCodeAbolishedAt: item.prescribedDrugCodeAbolishedAt || undefined,
      sourceDrugName: item.electronicSourceDrugName || undefined,
      masterDrugName: item.electronicMasterDrugName || undefined,
      drugNameVerificationStatus: item.electronicDrugNameVerificationStatus || undefined,
      drugNameVerificationCheckedAt: item.electronicDrugNameVerificationCheckedAt || undefined,
      amount: String(item.amount || ''),
      unitCode: item.unitCode || undefined,
      unitText: item.unitText || item.unit || undefined,
      unitConversion: item.electronicUnitConversion || undefined,
      usageCode: item.electronicUsageCode || undefined,
      usage: item.usage || '',
      usageFallbackText: item.electronicUsageFallbackText || undefined,
      usageSupplementText: item.electronicUsageSupplementText || undefined,
      days: String(item.days || ''),
      changeReason: item.changeReason || undefined,
      isIppoka: !!item.isIppoka,
      isCrushed: !!item.isCrushed,
      isDiagnosticTest: !!item.isDiagnosticTest
    }))
  });

  const patchElectronicPrescriptionMetadata = async (
    nextElectronicPrescription: VisitElectronicPrescription
  ) => {
    if (!db) throw new Error('データベースの初期化が完了していません。');
    const visitDoc = await db.visits.findOne(visitId).exec();
    if (!visitDoc) throw new Error('対象の受付が見つかりません。');
    await visitDoc.patch({ electronicPrescription: nextElectronicPrescription });
    setVisitData((prev: any) => prev ? { ...prev, electronicPrescription: nextElectronicPrescription } : prev);
  };

  const buildNextElectronicPrescriptionMetadata = (
    operation: ElectronicPrescriptionOperationKind,
    current: VisitElectronicPrescription,
    result: ElectronicPrescriptionOperationResult,
    nowIso: string
  ): VisitElectronicPrescription => {
    const dispensingInformationFile = result.dispensingInformationFile || current.dispensingInformationFile;
    if (operation === 'duplicate_check') {
      return {
        ...current,
        duplicateCheckStatus: result.duplicateCheck?.status || current.duplicateCheckStatus,
        linkedPrescriptions: current.linkedPrescriptions?.map((link) => ({
          ...link,
          duplicateCheckStatus: result.duplicateCheck?.status || link.duplicateCheckStatus
        }))
      };
    }
    if (operation === 'reception_cancel') {
      return {
        ...current,
        receptionStatus: 'cancelled',
        dispensingResultStatus: current.dispensingResultStatus === 'registered'
          ? current.dispensingResultStatus
          : 'cancelled',
        dispensingResultUpdatedAt: result.registeredAt || nowIso
      };
    }
    if (operation === 'dispensing_result_search') {
      return result.dispensingResultId
        ? {
            ...current,
            dispensingResultStatus: 'registered',
            dispensingResultEverRegistered: true,
            dispensingResultId: result.dispensingResultId,
            dispensingResultUpdatedAt: result.registeredAt || nowIso,
            ...(dispensingInformationFile ? { dispensingInformationFile } : {})
          }
        : current;
    }
    if (operation === 'dispensing_result_cancel') {
      return {
        ...current,
        dispensingResultStatus: 'cancelled',
        dispensingResultEverRegistered: true,
        dispensingResultUpdatedAt: result.registeredAt || nowIso
      };
    }
    return {
      ...current,
      dispensingResultStatus: 'registered',
      dispensingResultEverRegistered: true,
      dispensingResultId: result.dispensingResultId || current.dispensingResultId,
      dispensingResultUpdatedAt: result.registeredAt || nowIso,
      ...(dispensingInformationFile ? { dispensingInformationFile } : {})
    };
  };

  const handleElectronicPrescriptionOperation = async (operation: ElectronicPrescriptionOperationKind) => {
    if (ensurePermission && !ensurePermission('change_billing')) return;
    if (!db || !visitData?.electronicPrescription) {
      alert('電子処方箋の受付情報がありません。');
      return;
    }

    const currentElectronicPrescription = visitData.electronicPrescription as VisitElectronicPrescription;
    const prescriptionIds = Array.from(new Set([
      currentElectronicPrescription.prescriptionId,
      ...(currentElectronicPrescription.linkedPrescriptions?.map((link) => link.prescriptionId) || [])
    ]));
    const operationLabel = ELECTRONIC_PRESCRIPTION_OPERATION_LABELS[operation];
    const lifecycleDecision = validateElectronicPrescriptionLifecycleOperation(
      operation,
      currentElectronicPrescription
    );
    if (!lifecycleDecision.allowed) {
      alert(lifecycleDecision.message || `${operationLabel}は現在の状態では実行できません。`);
      return;
    }
    if (operation === 'dispensing_result_register' && prescriptionAudit.errorCount > 0) {
      alert(`薬剤師確認で要修正の項目があります。\n\n${formatPrescriptionAuditIssues(prescriptionAudit.issues.filter((issue) => issue.severity === 'error'))}`);
      return;
    }
    if (
      operation === 'dispensing_result_change'
      && !currentElectronicPrescription.dispensingResultId
    ) {
      alert('調剤結果IDがないため、変更を送信できません。');
      return;
    }

    let reason = '';
    if (operation === 'reception_cancel' || operation === 'dispensing_result_cancel' || operation === 'dispensing_result_change') {
      const enteredReason = window.prompt(`${operationLabel}の理由を入力してください。`, operation === 'dispensing_result_change' ? '調剤結果の修正のため' : '受付内容の確認により取消');
      if (!enteredReason?.trim()) return;
      reason = enteredReason.trim();
    }

    const preflightAuditOk = await logAuditAction(
      db,
      'electronic_prescription',
      `電子処方箋操作送信: ${operationLabel} / 処方箋 ${prescriptionIds.length}件 / 代表ID ${currentElectronicPrescription.prescriptionId} / 調剤結果 ${currentElectronicPrescription.dispensingResultStatus}`,
      visitData?.patientId,
      patientData?.name
    );
    if (!preflightAuditOk) {
      alert('監査ログを記録できなかったため、電子処方箋操作を送信しませんでした。');
      return;
    }

    setElectronicPrescriptionOperationInFlight(operation);
    try {
      const response = await fetch('/api/electronic-prescription/operation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation,
          prescriptionId: currentElectronicPrescription.prescriptionId,
          prescriptionIds,
          dispensingResultId: currentElectronicPrescription.dispensingResultId,
          integrityHash: currentElectronicPrescription.integrityHash,
          reason: reason || undefined,
          signatureRequirement: {
            hpkiSignatureRequired: requiresElectronicPrescriptionDispensingHpkiSignature(
              getElectronicPrescriptionDocumentKinds(currentElectronicPrescription)
            ),
            expectedSignerRole: 'pharmacist'
          },
          payload: operation === 'dispensing_result_register' || operation === 'dispensing_result_change'
            ? buildElectronicPrescriptionDispensingPayload()
            : undefined
        })
      });
      const result = await response.json() as ElectronicPrescriptionOperationResult;
      if (operation === 'dispensing_result_search' && result.status === 'not_found') {
        await logAuditAction(
          db,
          'electronic_prescription',
          `電子処方箋操作完了: ${operationLabel} / 調剤結果IDなし`,
          visitData?.patientId,
          patientData?.name
        );
        alert(result.message || '電子処方箋管理サービスに調剤結果IDが見つかりませんでした。');
        return;
      }
      if (result.status !== 'success') {
        await logAuditAction(
          db,
          'electronic_prescription',
          `電子処方箋操作失敗: ${operationLabel} / 状態 ${result.status} / ${result.message}`,
          visitData?.patientId,
          patientData?.name
        );
        alert(result.message || `${operationLabel}に失敗しました。`);
        return;
      }

      const nowIso = new Date().toISOString();
      const nextElectronicPrescription = buildNextElectronicPrescriptionMetadata(
        operation,
        currentElectronicPrescription,
        result,
        nowIso
      );
      await patchElectronicPrescriptionMetadata(nextElectronicPrescription);

      const dispensingInformationSignatureAudit = nextElectronicPrescription.dispensingInformationFile
        ? ` / 調剤情報提供ファイル署名 ${ELECTRONIC_PRESCRIPTION_FILE_SIGNATURE_STATUS_LABELS[nextElectronicPrescription.dispensingInformationFile.signatureStatus]}`
        : '';
      const dispensingInformationHpkiAudit = nextElectronicPrescription.dispensingInformationFile?.hpkiVerification
        ? ` / HPKI ${ELECTRONIC_PRESCRIPTION_HPKI_STATUS_LABELS[nextElectronicPrescription.dispensingInformationFile.hpkiVerification.status]}`
        : '';
      const resultAuditOk = await logAuditAction(
        db,
        'electronic_prescription',
        `電子処方箋操作完了: ${operationLabel} / 処方箋 ${prescriptionIds.length}件 / 代表ID ${currentElectronicPrescription.prescriptionId} / 調剤結果 ${nextElectronicPrescription.dispensingResultStatus}${nextElectronicPrescription.dispensingResultId ? ` / 調剤結果ID ${nextElectronicPrescription.dispensingResultId}` : ''}${dispensingInformationSignatureAudit}${dispensingInformationHpkiAudit}`,
        visitData?.patientId,
        patientData?.name
      );
      if (!resultAuditOk) {
        alert('電子処方箋操作は完了しましたが、結果監査ログを記録できませんでした。接続モジュール側の結果を確認してください。');
        return;
      }
      alert(`${operationLabel}が完了しました。`);
    } catch (err) {
      console.error('Failed to submit electronic prescription operation:', err);
      alert(`${operationLabel}に失敗しました: ${err instanceof Error ? err.message : err}`);
    } finally {
      setElectronicPrescriptionOperationInFlight(null);
    }
  };

  return {
    electronicPrescription,
    electronicPrescriptionIds,
    electronicPrescriptionReceptionStatus,
    electronicPrescriptionDispensingResultStatus,
    electronicPrescriptionSignatureStatus,
    electronicPrescriptionDuplicateCheckStatus,
    electronicPrescriptionRegistered,
    electronicPrescriptionOperationBusy,
    electronicPrescriptionOperationInFlight,
    canRunElectronicPrescriptionDuplicateCheck,
    canRegisterElectronicPrescriptionDispensingResult,
    canSearchElectronicPrescriptionDispensingResult,
    canChangeElectronicPrescriptionDispensingResult,
    canCancelElectronicPrescriptionDispensingResult,
    canCancelElectronicPrescriptionReception,
    electronicPrescriptionFlowStatus,
    electronicPrescriptionLifecycleDecision,
    buildElectronicPrescriptionDispensingPayload,
    patchElectronicPrescriptionMetadata,
    buildNextElectronicPrescriptionMetadata,
    handleElectronicPrescriptionOperation
  };
}
