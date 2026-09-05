import { useState, useEffect, useCallback } from 'react';
import type { VisitPharmacyDeviceHandoff } from '@/db/types';
import type {
  PharmacyDeviceOperation,
  PharmacyDeviceOperationResult,
  PharmacyDevicePrescriptionPayload
} from '@/lib/pharmacy_device_connector';
import type { ExternalConnectorReadinessCheck, ExternalConnectorReadinessReport } from '@/lib/external_connector_readiness';
import { isDemoVisit } from '@/lib/demo_data';
import { logAuditAction } from '@/lib/audit';
import { formatPrescriptionAuditIssues } from '@/app/print/helpers';
import { PHARMACY_DEVICE_HANDOFF_STATUS_LABELS } from '@/app/print/types';

export interface UsePrintDeviceIntegrationProps {
  db: any;
  visitId: string;
  visitData: any;
  patientData: any;
  prescriptionItems: any[];
  prescriptionAudit: { errorCount: number; issues: any[] };
  ensurePermission: (action: any) => boolean;
  setVisitData: React.Dispatch<React.SetStateAction<any>>;
}

export function usePrintDeviceIntegration({
  db,
  visitId,
  visitData,
  patientData,
  prescriptionItems,
  prescriptionAudit,
  ensurePermission,
  setVisitData
}: UsePrintDeviceIntegrationProps) {
  const [pharmacyDeviceOperationInFlight, setPharmacyDeviceOperationInFlight] = useState<PharmacyDeviceOperation | null>(null);
  const [pharmacyDeviceReadiness, setPharmacyDeviceReadiness] = useState<ExternalConnectorReadinessCheck | null>(null);
  const [isLoadingPharmacyDeviceReadiness, setIsLoadingPharmacyDeviceReadiness] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoadingPharmacyDeviceReadiness(true);
    fetch('/api/system/connector-readiness')
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<ExternalConnectorReadinessReport>;
      })
      .then((report) => {
        if (!active) return;
        setPharmacyDeviceReadiness(report.checks.find((check) => check.id === 'pharmacy_device') || null);
      })
      .catch((error) => {
        console.error('Failed to load pharmacy device connector readiness:', error);
        if (active) setPharmacyDeviceReadiness(null);
      })
      .finally(() => {
        if (active) setIsLoadingPharmacyDeviceReadiness(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const pharmacyDeviceHandoff = visitData?.pharmacyDeviceHandoff as VisitPharmacyDeviceHandoff | undefined;
  const pharmacyDeviceConnectorReady = pharmacyDeviceReadiness?.status === 'ready';
  const pharmacyDeviceOperationBusy = pharmacyDeviceOperationInFlight !== null;
  const canSubmitPharmacyDevice = pharmacyDeviceConnectorReady && !pharmacyDeviceOperationBusy;
  const canReplacePharmacyDevice = pharmacyDeviceConnectorReady
    && !pharmacyDeviceOperationBusy
    && !!pharmacyDeviceHandoff
    && pharmacyDeviceHandoff.status !== 'cancelled';
  const canCancelPharmacyDevice = pharmacyDeviceConnectorReady
    && !pharmacyDeviceOperationBusy
    && !!pharmacyDeviceHandoff
    && pharmacyDeviceHandoff.status !== 'cancelled';

  const pharmacyDeviceFlowStatus = !pharmacyDeviceHandoff
    ? pharmacyDeviceConnectorReady ? 'warning' : 'skipped'
    : pharmacyDeviceHandoff.status === 'cancelled'
      ? 'cancelled'
      : pharmacyDeviceHandoff.status === 'accepted' || pharmacyDeviceHandoff.status === 'duplicate'
        ? 'ok'
        : 'error';

  const pharmacyDeviceBlockedTitle = !pharmacyDeviceConnectorReady
    ? pharmacyDeviceReadiness?.requiredActions[0] || '設定の外部連携で調剤機器の接続準備を完了してください。'
    : undefined;

  const buildPharmacyDevicePrescriptionPayload = useCallback((): PharmacyDevicePrescriptionPayload => ({
    visitId,
    prescriptionDate: visitData?.prescriptionDate || visitData?.issueDate || new Date().toISOString().slice(0, 10),
    dispensingDate: visitData?.dispensingDate || new Date().toISOString().slice(0, 10),
    patient: {
      patientId: patientData?.patientId || patientData?.id || visitData?.patientId || '',
      name: patientData?.name || '',
      kana: patientData?.kana || undefined,
      birthDate: patientData?.birthDate || '',
      gender: patientData?.gender || undefined
    },
    provider: {
      institutionCode: visitData?.institutionId || undefined,
      institutionName: visitData?.institutionName || '自院',
      departmentName: visitData?.departmentName || visitData?.departmentId || undefined,
      doctorName: visitData?.doctorName || visitData?.doctorId || undefined
    },
    items: prescriptionItems.map((item, index) => ({
      itemId: item.itemId,
      rpNumber: item.rpNumber || index + 1,
      prescribedDrugCode: item.drugId,
      dispensedDrugCode: item.dispensedDrugCode || item.drugId,
      drugName: String(item.dispensedDrug || item.drugName || item.drugId || ''),
      amount: Number(item.amount || 0),
      usage: String(item.usage || ''),
      days: Number(item.days || 0),
      unit: item.unitText || undefined
    }))
  }), [visitId, visitData, patientData, prescriptionItems]);

  const patchPharmacyDeviceHandoff = async (handoff: VisitPharmacyDeviceHandoff) => {
    if (!db) throw new Error('データベースの初期化が完了していません。');
    const visitDoc = await db.visits.findOne(visitId).exec();
    if (!visitDoc) throw new Error('対象の受付が見つかりません。');
    await visitDoc.patch({ pharmacyDeviceHandoff: handoff });
    setVisitData((previous: any) => previous ? { ...previous, pharmacyDeviceHandoff: handoff } : previous);
  };

  const handlePharmacyDeviceOperation = useCallback(async (operation: PharmacyDeviceOperation) => {
    if (!ensurePermission('print_documents')) return;
    if (isDemoVisit(visitData)) {
      alert('チュートリアルのデモ受付のため、外部調剤機器・POSへは送信できません。');
      return;
    }
    if (!db || !visitData || !patientData) {
      alert('外部調剤機器へ送る処方データを読み込めませんでした。');
      return;
    }
    if (pharmacyDeviceReadiness?.status !== 'ready') {
      alert('外部調剤機器の接続準備が完了していません。設定の「外部連携」で残対応を確認してください。');
      return;
    }
    if (operation !== 'cancel' && prescriptionAudit.errorCount > 0) {
      alert(`薬剤師確認で要修正の項目があります。\n\n${formatPrescriptionAuditIssues(prescriptionAudit.issues.filter((issue: any) => issue.severity === 'error'))}`);
      return;
    }

    const current = visitData.pharmacyDeviceHandoff as VisitPharmacyDeviceHandoff | undefined;
    if (operation === 'submit' && current && current.status !== 'cancelled') {
      alert('この処方は外部調剤機器へ送信済みです。内容を更新する場合は「差し替える」を使用してください。');
      return;
    }
    if ((operation === 'replace' || operation === 'cancel') && (!current || current.status === 'cancelled')) {
      alert('差替または取消対象の外部機器連携がありません。');
      return;
    }

    let reason = '';
    if (operation === 'replace' || operation === 'cancel') {
      const enteredReason = window.prompt(
        operation === 'replace' ? '外部調剤機器へ差し替える理由を入力してください。' : '外部調剤機器への連携を取り消す理由を入力してください。',
        operation === 'replace' ? '処方内容の修正' : '受付取消'
      );
      if (!enteredReason?.trim()) return;
      reason = enteredReason.trim();
    }

    const operationLabel = operation === 'submit' ? '送信' : operation === 'replace' ? '差替' : '取消';
    const preflightAuditOk = await logAuditAction(
      db,
      'external_device_handoff',
      `外部調剤機器連携${operationLabel}: 受付ID ${visitId} / 処方薬 ${prescriptionItems.length}件${current?.transferId ? ` / 連携ID ${current.transferId}` : ''}`,
      visitData.patientId,
      patientData.name
    );
    if (!preflightAuditOk) {
      alert('監査ログを記録できなかったため、外部調剤機器へ送信しませんでした。');
      return;
    }

    setPharmacyDeviceOperationInFlight(operation);
    try {
      const response = await fetch('/api/external-integration/prescription-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation,
          previousTransferId: current?.transferId,
          reason: reason || undefined,
          payload: operation === 'cancel' ? undefined : buildPharmacyDevicePrescriptionPayload()
        })
      });
      const result = await response.json() as PharmacyDeviceOperationResult;
      if (!response.ok || result.status !== 'success' || !result.outcome || !result.transferId || !result.payloadHash || !result.connectorKind || !result.interfaceVersion) {
        await logAuditAction(
          db,
          'external_device_handoff',
          `外部調剤機器連携失敗: ${operationLabel} / 状態 ${result.status} / ${result.message}`,
          visitData.patientId,
          patientData.name
        );
        alert(result.message || `外部調剤機器への${operationLabel}に失敗しました。`);
        return;
      }

      const updatedAt = new Date().toISOString();
      const nextHandoff: VisitPharmacyDeviceHandoff = {
        connectorKind: result.connectorKind,
        interfaceVersion: result.interfaceVersion,
        transferId: result.transferId,
        payloadHash: result.payloadHash,
        status: result.outcome,
        lastOperation: operation,
        submittedAt: current?.submittedAt || updatedAt,
        updatedAt
      };
      await patchPharmacyDeviceHandoff(nextHandoff);
      const resultAuditOk = await logAuditAction(
        db,
        'external_device_handoff',
        `外部調剤機器連携完了: ${operationLabel} / 状態 ${PHARMACY_DEVICE_HANDOFF_STATUS_LABELS[nextHandoff.status]} / 連携ID ${nextHandoff.transferId} / 仕様版 ${nextHandoff.interfaceVersion}`,
        visitData.patientId,
        patientData.name
      );
      if (!resultAuditOk) {
        alert('外部調剤機器への連携は完了しましたが、結果監査ログを記録できませんでした。接続先の結果を確認してください。');
        return;
      }
      alert(result.message);
    } catch (error) {
      console.error('Failed to submit pharmacy device operation:', error);
      alert(`外部調剤機器への${operationLabel}に失敗しました。`);
    } finally {
      setPharmacyDeviceOperationInFlight(null);
    }
  }, [
    ensurePermission,
    visitData,
    db,
    patientData,
    pharmacyDeviceReadiness,
    prescriptionAudit,
    visitId,
    prescriptionItems,
    buildPharmacyDevicePrescriptionPayload
  ]);

  return {
    pharmacyDeviceFlowStatus,
    pharmacyDeviceReadiness,
    pharmacyDeviceHandoff,
    isLoadingPharmacyDeviceReadiness,
    pharmacyDeviceConnectorReady,
    pharmacyDeviceOperationBusy,
    pharmacyDeviceOperationInFlight,
    canSubmitPharmacyDevice,
    canReplacePharmacyDevice,
    canCancelPharmacyDevice,
    pharmacyDeviceBlockedTitle,
    handlePharmacyDeviceOperation
  };
}
