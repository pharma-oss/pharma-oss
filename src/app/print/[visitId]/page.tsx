'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import '../print.css';
import { useParams, useRouter } from 'next/navigation';
import {
  Printer,
  FileText,
  FileCheck2,
  Package,
  ArrowLeft,
  CheckCircle,
  Download,
  Loader2,
  BookOpen,
  SlidersHorizontal,
  AlertTriangle,
  Info,
  MessageSquare,
  Sparkles,
  Clipboard,
  Pencil,
  XCircle
} from 'lucide-react';
import { COMMON_RECEIPT_REMARKS } from "@/lib/data/receipt_remarks";
import { isDemoVisit } from "@/lib/demo_data";
import { buildDispensingUkeRecords, type DispensingUkeItem } from '@/lib/receipt/dispensing_uke';
import { generateUkeContent } from "@/lib/receipt/uke_generator";
import { useDatabase } from '@/db/DatabaseProvider';
import { calculateDispensingFees, getTotalPoints, getFormulationType, type FeeCode, type FeeCalculationOptions } from '@/lib/calculator';
import { calculateInsuranceAmounts, formatYen } from '@/lib/billing';
import { validateDispensingClaim } from '@/lib/claim_validation';
import {
  buildClaimExportSnapshot,
  compareClaimExportSnapshotToCurrent,
  buildClaimReturnCorrectionSuggestions,
  buildClaimReturnCorrectionAction,
  makeClaimSnapshotDifferenceCsvFileName,
  buildClaimSnapshotDifferenceCsv,
  buildClaimReturnCorrectionHandoffMemo,
  type ClaimReturnCorrectionSuggestion
} from '@/lib/claim_snapshot';
import {
  CLAIM_LIFECYCLE_STATUS_LABELS,
  getClaimLifecycleStatus,
  isClaimLifecycleLocked,
  markClaimClosed,
  markClaimExported,
  markClaimRebilling,
  markClaimReturned,
  type ClaimLifecycleState
} from '@/lib/claim_lifecycle';
import { getClaimEditBlockedMessage, isClaimEditBlocked } from '@/lib/claim_edit_guard';
import { canUserPerform, getCurrentUser, getPermissionDeniedMessage, logAuditAction, type PermissionAction } from '@/lib/audit';
import { validateDispensingUkeRecords } from '@/lib/receipt/dispensing_uke_validation';
import { buildPrescriptionInputAudit, type PrescriptionInputAuditItem } from '@/lib/prescription_input_audit';
import {
  buildAiSuggestionsFromPrescriptionAudit,
  summarizeAiSuggestions,
  formatAiSuggestionConfidence,
  buildAiSuggestionDecisionAuditDetail,
  getAiSuggestionDecisionLabel,
  type AiAssistSuggestion,
  type AiSuggestionDecision
} from '@/lib/ai_suggestion';
import {
  AI_ASSIST_MODE_LABELS,
  filterAiAssistItemsByMode,
  normalizeAiAssistMode
} from '@/lib/ai_assist_policy';
import {
  buildMedicationInfoPrintContent
} from '@/lib/patient_medication_info';

import {
  FEE_TOGGLES,
  CLAIM_ISSUE_LABELS,
  ELECTRONIC_PRESCRIPTION_DISPENSING_STATUS_LABELS,
  ELECTRONIC_PRESCRIPTION_FILE_SIGNATURE_STATUS_LABELS,
  PHARMACY_DEVICE_HANDOFF_STATUS_LABELS,
  type PendingReceiptRemarkSave,
  type PharmacyInfo
} from '../types';

import {
  formatUkeValidationIssues,
  formatClaimValidationIssues,
  toDateOnly,
  calculatePatientAge,
  getPatientIdentityMark,
  getDisplayDrugName,
  isLiquidItem,
  isOintmentItem,
  getClaimItemFlagValue,
  formatPrescriptionAuditIssues
} from '../helpers';

import { DispensingRecordPrint } from '../components/DispensingRecordPrint';
import { ReceiptStatementPrint } from '../components/ReceiptStatementPrint';
import { ReceiptPrint } from '../components/ReceiptPrint';
import { DrugInfoPrint } from '../components/DrugInfoPrint';
import { MedicineBagPrint } from '../components/MedicineBagPrint';
import { MedicineNotebookStickerPrint } from '../components/MedicineNotebookStickerPrint';
import { LiquidLabelSheetPrint } from '../components/LiquidLabelSheetPrint';
import { OintmentLabelSheetPrint } from '../components/OintmentLabelSheetPrint';
import { PharmacyDeviceHandoffPanel } from '../components/PharmacyDeviceHandoffPanel';
import { ElectronicPrescriptionPrintPanel } from '../components/ElectronicPrescriptionPrintPanel';

import { usePrintVisitData } from '@/hooks/usePrintVisitData';
import { usePrintPresetConfig } from '@/hooks/usePrintPresetConfig';
import { usePrintElectronicPrescription } from '@/hooks/usePrintElectronicPrescription';
import { usePrintDeviceIntegration } from '@/hooks/usePrintDeviceIntegration';

export default function PrintPage() {
  const params = useParams();
  const router = useRouter();
  const db = useDatabase();
  const visitId = params.visitId as string;

  const debounceRef = useRef<Record<string, NodeJS.Timeout>>({});

  const {
    printMarginTop,
    printMarginBottom,
    printFontScale
  } = usePrintPresetConfig();

  const {
    isLoading,
    visitData,
    patientData,
    patientAlerts,
    settingsData,
    prescriptionItems,
    approvedMedicationInfoTemplates,
    remarks,
    claimOptions,
    setVisitData,
    setPrescriptionItems,
    setRemarks,
    setClaimOptions
  } = usePrintVisitData(db, visitId);

  const currentUser = useMemo(() => getCurrentUser(), []);
  const canPrintDocuments = canUserPerform(currentUser, 'print_documents');
  const canChangeBilling = canUserPerform(currentUser, 'change_billing');
  const canExportUke = canUserPerform(currentUser, 'export_uke');

  const ensurePermission = useCallback((action: PermissionAction) => {
    if (!canUserPerform(currentUser, action)) {
      alert(getPermissionDeniedMessage(currentUser, action));
      return false;
    }
    return true;
  }, [currentUser]);

  const auditItems = useMemo<PrescriptionInputAuditItem[]>(() => {
    return prescriptionItems.map((item, index) => ({
      id: item.itemId || `item-${index}`,
      drugId: item.drugId,
      drugCode: item.dispensedDrugCode || item.drugId,
      drugName: item.dispensedDrug || item.drugName || item.drugId,
      amount: item.amount,
      usage: item.usage,
      days: item.days,
      dispensingQuantity: item.dispensingQuantity,
      unit: item.unit,
      changeReason: item.changeReason,
      dispensingCategory: item.dispensingCategory,
      rpComment: item.rpComment,
      isIppoka: item.isIppoka,
      isCrushed: item.isCrushed,
      isDiagnosticTest: item.isDiagnosticTest,
      isHighRisk: item.isHighRisk,
      isAbolished: item.isAbolished,
      abolishedAt: item.abolishedAt,
      billingAgentGroupKey: item.billingAgentGroupKey,
      billingAgentGroupReason: item.billingAgentGroupReason,
      receiptRemark: remarks[item.itemId] ?? item.receiptRemark
    }));
  }, [prescriptionItems, remarks]);

  const prescriptionAudit = useMemo(() => {
    return buildPrescriptionInputAudit(auditItems, { patientAlerts });
  }, [auditItems, patientAlerts]);

  const calculatedFees = useMemo(() => {
    if (!settingsData || !patientData) return [];
    const visitDateStr = visitData?.dispensingDate || visitData?.prescriptionDate || visitData?.issueDate || new Date().toISOString().slice(0, 10);
    return calculateDispensingFees(settingsData, prescriptionItems, patientData, visitDateStr, claimOptions);
  }, [settingsData, prescriptionItems, patientData, visitData, claimOptions]);

  const totalPoints = useMemo(() => {
    return getTotalPoints(calculatedFees);
  }, [calculatedFees]);

  const claimValidation = useMemo(() => {
    return validateDispensingClaim({
      settings: settingsData,
      patient: patientData,
      items: prescriptionItems,
      calculatedFees,
      claimOptions,
      patientAlerts,
      totalPoints,
      currentVisitId: visitId
    });
  }, [settingsData, patientData, prescriptionItems, calculatedFees, claimOptions, patientAlerts, totalPoints, visitId]);

  const claimValidationErrors = useMemo(() => claimValidation.filter((i) => i.severity === 'error'), [claimValidation]);
  const claimValidationWarnings = useMemo(() => claimValidation.filter((i) => i.severity === 'warning'), [claimValidation]);
  const claimValidationInfos = useMemo(() => claimValidation.filter((i) => i.severity === 'info'), [claimValidation]);
  const hasClaimErrors = claimValidationErrors.length > 0;
  const hasClaimWarnings = claimValidationWarnings.length > 0;

  const claimLifecycle = visitData?.claimLifecycle as ClaimLifecycleState | undefined;
  const claimLifecycleStatus = getClaimLifecycleStatus(claimLifecycle);
  const claimLifecycleLocked = isClaimLifecycleLocked(claimLifecycle);
  const claimEditBlocked = isClaimEditBlocked(claimLifecycle);
  const canEditBilling = canChangeBilling && !claimEditBlocked;
  const canDownloadUke = canExportUke && (claimLifecycleStatus === 'draft' || claimLifecycleStatus === 'rebilling');
  const canCloseClaim = canExportUke && (claimLifecycleStatus === 'exported' || claimLifecycleStatus === 'accepted');
  const canReviewAiSuggestions = canUserPerform(currentUser, 'review_ai_suggestions');

  const ensureClaimEditable = () => {
    if (!isClaimEditBlocked(visitData?.claimLifecycle)) return true;
    alert(getClaimEditBlockedMessage(visitData?.claimLifecycle, 'billing'));
    return false;
  };

  const {
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
    handleElectronicPrescriptionOperation
  } = usePrintElectronicPrescription({
    db,
    visitId,
    visitData,
    patientData,
    prescriptionItems,
    totalPoints,
    prescriptionAudit,
    canChangeBilling,
    setVisitData
  });

  const {
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
    handlePharmacyDeviceOperation: delegateHandlePharmacyDeviceOperation
  } = usePrintDeviceIntegration({
    db,
    visitId,
    visitData,
    patientData,
    prescriptionItems,
    prescriptionAudit,
    ensurePermission,
    setVisitData
  });

  const persistClaimOptions = async (nextOptions: FeeCalculationOptions) => {
    if (!db) throw new Error('データベースの初期化が完了していません。');
    const visitDoc = await db.visits.findOne(visitId).exec();
    if (!visitDoc) throw new Error('対象の受付が見つかりません。');
    await visitDoc.patch({ claimOptions: nextOptions });
    setVisitData((prev: any) => prev ? { ...prev, claimOptions: nextOptions } : prev);
  };

  const handleDrugFeeOnlyChange = async (drugFeeOnly: boolean) => {
    if (!ensurePermission('change_billing')) return;
    if (claimEditBlocked) {
      alert(getClaimEditBlockedMessage(claimLifecycle, 'billing'));
      return;
    }
    const previousOptions = claimOptions;
    const nextOptions = { ...claimOptions, drugFeeOnly };
    setClaimOptions(nextOptions);
    try {
      await persistClaimOptions(nextOptions);
      if (db) {
        const auditOk = await logAuditAction(
          db,
          'billing_toggle',
          `点数請求切替: ${drugFeeOnly ? '薬剤料のみ' : '通常調剤報酬算定'}`,
          visitData?.patientId,
          patientData?.name
        );
        if (!auditOk) {
          await persistClaimOptions(previousOptions);
          setClaimOptions(previousOptions);
          alert('点数請求切替の監査ログ記録に失敗したため、変更を元に戻しました。');
        }
      }
    } catch (e) {
      setClaimOptions(previousOptions);
      console.error('Failed to persist claim options:', e);
      alert('点数請求設定の保存に失敗しました。');
    }
  };

  const handleRecordAiSuggestionDecision = async (
    suggestion: AiAssistSuggestion,
    decision: AiSuggestionDecision
  ) => {
    if (!ensurePermission('review_ai_suggestions')) return;
    if (!db) {
      alert('データベースの初期化が完了していません。');
      return;
    }

    let modifiedAction = '';
    let feedback = '';
    if (decision === 'modified') {
      const enteredAction = window.prompt('修正後の対応を入力してください。', suggestion.suggestedAction);
      if (!enteredAction?.trim()) return;
      modifiedAction = enteredAction.trim();
      feedback = window.prompt('修正理由・補足（任意）を入力してください。', '')?.trim() || '';
    } else if (decision === 'rejected') {
      const rejectionReason = window.prompt('却下理由を入力してください。', '処方意図を確認済み');
      if (!rejectionReason?.trim()) return;
      feedback = rejectionReason.trim();
    }

    try {
      const reviewer = getCurrentUser();
      await logAuditAction(
        db,
        'ai_suggestion_review',
        buildAiSuggestionDecisionAuditDetail({
          suggestion,
          decision,
          reviewerName: reviewer.name,
          modifiedAction,
          feedback
        }),
        visitData?.patientId,
        patientData?.name
      );
      alert(`AI補助提案を「${getAiSuggestionDecisionLabel(decision)}」として監査ログへ記録しました。`);
    } catch (err) {
      console.error('Failed to record AI suggestion decision:', err);
      alert('AI補助提案の採否記録に失敗しました。');
    }
  };

  const handleFeeToggle = async (code: FeeCode, enabled: boolean) => {
    if (!ensurePermission('change_billing')) return;
    if (!ensureClaimEditable()) return;
    if (!db) {
      alert('データベースの初期化が完了していません。');
      return;
    }
    const previousOptions = claimOptions;
    const currentDisabled = new Set(claimOptions.disabledFeeCodes || []);
    const rationales = { ...(claimOptions.disabledFeeRationales || {}) };
    
    let rationale = '';
    if (!enabled) {
      rationale = window.prompt(`算定項目「${code}」を除外する理由を入力してください。`, '算定要件未充足のため') || 'その他の理由';
      rationales[code] = rationale;
    } else {
      delete rationales[code];
    }

    if (enabled) {
      currentDisabled.delete(code);
    } else {
      currentDisabled.add(code);
    }
    const nextOptions = {
      ...claimOptions,
      disabledFeeCodes: Array.from(currentDisabled),
      disabledFeeRationales: rationales
    };
    try {
      setClaimOptions(nextOptions);
      await persistClaimOptions(nextOptions);
      const actionText = enabled ? '算定ON' : `算定OFF (理由: ${rationale})`;
      const auditOk = await logAuditAction(
        db,
        'billing_toggle',
        `点数請求算定切替: 「${code}」を ${actionText} に変更しました。`,
        visitData?.patientId,
        patientData?.name
      );
      if (!auditOk) {
        setClaimOptions(previousOptions);
        await persistClaimOptions(previousOptions);
        throw new Error('算定切替の監査ログ記録に失敗したため、変更を元に戻しました。');
      }
    } catch (err: any) {
      setClaimOptions(previousOptions);
      console.error('Failed to update fee toggle:', err);
      alert(`算定切替に失敗しました: ${err.message || err}`);
    }
  };

  const handleToggleIppoka = async (itemId: string, checked: boolean, idx: number) => {
    if (!ensurePermission('change_billing')) return;
    if (claimEditBlocked) {
      alert(getClaimEditBlockedMessage(claimLifecycle, 'billing'));
      return;
    }
    const previousItems = prescriptionItems;
    const nextItems = prescriptionItems.map((item, i) => i === idx ? { ...item, isIppoka: checked } : item);
    setPrescriptionItems(nextItems);
    try {
      if (!db) return;
      const itemDoc = await db.prescription_items.findOne(itemId).exec();
      if (itemDoc) await itemDoc.patch({ isIppoka: checked });
      const auditOk = await logAuditAction(
        db,
        'billing_toggle',
        `一包化フラグ変更: ${itemId} ${checked ? 'ON' : 'OFF'}`,
        visitData?.patientId,
        patientData?.name
      );
      if (!auditOk) {
        if (itemDoc) await itemDoc.patch({ isIppoka: !checked });
        setPrescriptionItems(previousItems);
        alert('一包化フラグ変更の監査ログ記録に失敗したため、変更を元に戻しました。');
      }
    } catch (e) {
      setPrescriptionItems(previousItems);
      console.error('Failed to toggle ippoka:', e);
    }
  };

  const handleToggleCrushed = async (itemId: string, checked: boolean, idx: number) => {
    if (!ensurePermission('change_billing')) return;
    if (claimEditBlocked) {
      alert(getClaimEditBlockedMessage(claimLifecycle, 'billing'));
      return;
    }
    const previousItems = prescriptionItems;
    const nextItems = prescriptionItems.map((item, i) => i === idx ? { ...item, isCrushed: checked } : item);
    setPrescriptionItems(nextItems);
    try {
      if (!db) return;
      const itemDoc = await db.prescription_items.findOne(itemId).exec();
      if (itemDoc) await itemDoc.patch({ isCrushed: checked });
      const auditOk = await logAuditAction(
        db,
        'billing_toggle',
        `粉砕フラグ変更: ${itemId} ${checked ? 'ON' : 'OFF'}`,
        visitData?.patientId,
        patientData?.name
      );
      if (!auditOk) {
        if (itemDoc) await itemDoc.patch({ isCrushed: !checked });
        setPrescriptionItems(previousItems);
        alert('粉砕フラグ変更の監査ログ記録に失敗したため、変更を元に戻しました。');
      }
    } catch (e) {
      setPrescriptionItems(previousItems);
      console.error('Failed to toggle crushed:', e);
    }
  };

  const handleItemClaimToggle = async (
    itemId: string,
    field: string,
    value: boolean,
    index: number
  ) => {
    if (!ensurePermission('change_billing')) return;
    if (!ensureClaimEditable()) return;
    if (!db) return;
    try {
      const currentItem = prescriptionItems[index];
      if (currentItem && currentItem.itemId === itemId && currentItem.doc) {
        const patch: Record<string, boolean> = { [field]: value };
        const previousPatch: Record<string, boolean> = { [field]: getClaimItemFlagValue(currentItem, field) };
        if (field === 'isDiagnosticTest' && value) {
          patch.claimPreparation = false;
          patch.claimManagement = false;
          previousPatch.claimPreparation = getClaimItemFlagValue(currentItem, 'claimPreparation');
          previousPatch.claimManagement = getClaimItemFlagValue(currentItem, 'claimManagement');
        }
        await currentItem.doc.patch(patch);

        const drugLabel = currentItem.dispensedDrug || currentItem.drugName || currentItem.drugId;
        const auditOk = await logAuditAction(
          db,
          'billing_toggle',
          `処方薬別算定切替: 薬品「${drugLabel}」の「${field}」を ${value ? 'ON' : 'OFF'} に変更しました。`,
          visitData?.patientId,
          patientData?.name
        );
        if (!auditOk) {
          await currentItem.doc.patch(previousPatch);
          throw new Error('処方薬別算定切替の監査ログ記録に失敗したため、変更を元に戻しました。');
        }
        setPrescriptionItems(prev => {
          if (prev[index]?.itemId !== itemId) return prev;
          const next = [...prev];
          next[index] = { ...next[index], ...patch };
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to update item claim flags:', err);
      alert(`処方薬別算定切替に失敗しました: ${err instanceof Error ? err.message : err}`);
    }
  };

  const handleTokkanChange = async (itemId: string, value: string, idx: number) => {
    if (!ensurePermission('change_billing')) return;
    if (claimEditBlocked) {
      alert(getClaimEditBlockedMessage(claimLifecycle, 'billing'));
      return;
    }
    const previousItems = prescriptionItems;
    const nextItems = prescriptionItems.map((item, i) => i === idx ? { ...item, tokkanType: (value === 'none' ? undefined : value) as any } : item);
    setPrescriptionItems(nextItems);
    try {
      if (!db) return;
      const itemDoc = await db.prescription_items.findOne(itemId).exec();
      if (itemDoc) await itemDoc.patch({ tokkanType: (value === 'none' ? undefined : value) as any });
      await logAuditAction(
        db,
        'billing_toggle',
        `特定薬剤管理指導料変更: ${itemId} tokkanType=${value}`,
        visitData?.patientId,
        patientData?.name
      );
    } catch (e) {
      setPrescriptionItems(previousItems);
      console.error('Failed to change tokkan:', e);
    }
  };

  const handleReceiptRemarkChange = (itemId: string, value: string, idx: number) => {
    if (!ensurePermission('change_billing')) return;
    if (claimEditBlocked) {
      alert(getClaimEditBlockedMessage(claimLifecycle, 'billing'));
      return;
    }
    setRemarks((prev) => ({ ...prev, [itemId]: value }));
    if (debounceRef.current[itemId]) clearTimeout(debounceRef.current[itemId]);
    debounceRef.current[itemId] = setTimeout(async () => {
      try {
        if (!db) return;
        const itemDoc = await db.prescription_items.findOne(itemId).exec();
        if (itemDoc) await itemDoc.patch({ receiptRemark: value });
      } catch (e) {
        console.error('Failed to save receipt remark:', e);
      }
    }, 500);
  };

  const ensureReceiptRemarksSaved = async () => {
    for (const [itemId, timer] of Object.entries(debounceRef.current)) {
      if (timer) {
        clearTimeout(timer);
        delete debounceRef.current[itemId];
        const value = remarks[itemId];
        if (value !== undefined && db) {
          try {
            const itemDoc = await db.prescription_items.findOne(itemId).exec();
            if (itemDoc) await itemDoc.patch({ receiptRemark: value });
          } catch (e) {
            console.error('Failed to flush receipt remark:', e);
            alert('レセ適コメントの保存に失敗しました。保存後にもう一度実行してください。');
            return false;
          }
        }
      }
    }
    return true;
  };

  const handleBillingAgentOverrideLocalChange = (itemId: string, field: string, value: string, idx: number) => {
    if (!canEditBilling) return;
    setPrescriptionItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const persistBillingAgentOverride = async (itemId: string, idx: number) => {
    if (!canEditBilling || !db) return;
    const item = prescriptionItems[idx];
    if (!item) return;
    try {
      const itemDoc = await db.prescription_items.findOne(itemId).exec();
      if (itemDoc) {
        await itemDoc.patch({
          billingAgentGroupKey: item.billingAgentGroupKey || undefined,
          billingAgentGroupReason: item.billingAgentGroupReason || undefined
        });
      }
    } catch (e) {
      console.error('Failed to persist billing agent override:', e);
    }
  };

  const handlePrint = async () => {
    if (!ensurePermission('print_documents')) return;
    if (!db) {
      alert('データベースの初期化が完了していません。');
      return;
    }
    if (!(await ensureReceiptRemarksSaved())) return;
    const medicationInfoContents = prescriptionItems.map((item) => getMedicationInfoContent(item));
    const medicationInfoFallbackCount = medicationInfoContents.filter((content) => content.source === 'safe_fallback').length;
    if (medicationInfoFallbackCount > 0) {
      const shouldContinue = window.confirm(
        `承認済みの薬情テンプレがない薬剤が${medicationInfoFallbackCount}件あります。安全な定型文で印刷しますか？`
      );
      if (!shouldContinue) return;
    }
    if (prescriptionAudit.errorCount > 0) {
      alert(`薬剤師確認で要修正の項目があります。\n\n${formatPrescriptionAuditIssues(prescriptionAudit.issues.filter((issue) => issue.severity === 'error'))}`);
      return;
    }
    if (prescriptionAudit.warningCount > 0) {
      const shouldContinue = window.confirm(
        `薬剤師確認で確認事項があります。このまま印刷しますか？\n\n${formatPrescriptionAuditIssues(prescriptionAudit.issues.filter((issue) => issue.severity === 'warning'))}`
      );
      if (!shouldContinue) return;
    }
    const auditOk = await logAuditAction(
      db,
      'print',
      `帳票印刷実行: 受付ID ${visitId} / 患者 ${patientData?.name || '未設定'}`,
      visitData?.patientId,
      patientData?.name
    );
    if (!auditOk) {
      alert('印刷の監査ログ記録に失敗したため、印刷を中止しました。');
      return;
    }
    window.print();
  };

  const persistClaimLifecycle = async (nextLifecycle: ClaimLifecycleState, detail: string) => {
    if (!db) return;
    const visitDoc = await db.visits.findOne(visitId).exec();
    if (!visitDoc) {
      throw new Error('Visit was not found.');
    }
    const previousLifecycle = (visitDoc.toJSON() as any).claimLifecycle as ClaimLifecycleState | undefined;
    await visitDoc.patch({ claimLifecycle: nextLifecycle });
    setVisitData((prev: any) => prev ? { ...prev, claimLifecycle: nextLifecycle } : prev);
    const auditOk = await logAuditAction(
      db,
      'claim_lifecycle',
      detail,
      visitData?.patientId,
      patientData?.name
    );
    if (!auditOk) {
      const rollbackLifecycle = previousLifecycle || { status: 'draft' as const };
      await visitDoc.patch({ claimLifecycle: rollbackLifecycle });
      setVisitData((prev: any) => prev ? { ...prev, claimLifecycle: rollbackLifecycle } : prev);
      throw new Error('請求状態変更の監査ログ記録に失敗したため、変更を取り消しました。');
    }
  };

  const handleDownloadUke = async () => {
    if (!ensurePermission('export_uke')) return;
    if (isDemoVisit(visitData)) {
      alert('チュートリアルのデモ受付のため、UKEファイルは出力できません。\nUKE出力前チェックまでの流れは、この画面の薬剤師確認・請求前チェックで練習できます。');
      return;
    }
    if (claimLifecycleStatus !== 'draft' && claimLifecycleStatus !== 'rebilling') {
      alert('UKEを再出力する場合は、返戻登録または再請求/月遅れ準備に切り替えてから出力してください。');
      return;
    }
    try {
      if (prescriptionAudit.errorCount > 0) {
        alert(`薬剤師確認で要修正の項目があります。\n\n${formatPrescriptionAuditIssues(prescriptionAudit.issues.filter((issue: any) => issue.severity === 'error'))}`);
        return;
      }

      if (prescriptionAudit.warningCount > 0) {
        const shouldContinue = window.confirm(
          `薬剤師確認で確認事項があります。このままUKEを出力しますか？\n\n${formatPrescriptionAuditIssues(prescriptionAudit.issues.filter((issue: any) => issue.severity === 'warning'))}`
        );
        if (!shouldContinue) return;
      }

      if (!settingsData) {
        throw new Error('Facility settings are not loaded.');
      }
      if (!db) {
        throw new Error('データベースの初期化が完了していません。');
      }

      let relatedInterventions: any[] = [];
      if (db) {
        relatedInterventions = await db.interventions.find({ selector: { visitId } }).exec();
      }

      const generatedAt = new Date();
      const itemsForUke = prescriptionItems.map((item) => ({
        ...item,
        receiptRemark: remarks[item.itemId] ?? item.receiptRemark
      }));
      const records = buildDispensingUkeRecords({
        visit: visitData,
        patient: patientData,
        settings: settingsData,
        items: itemsForUke,
        calculatedFees,
        interventions: relatedInterventions,
        generatedAt
      });

      const ukeValidationIssues = validateDispensingUkeRecords(records);
      const ukeErrors = ukeValidationIssues.filter((issue) => issue.severity === 'error');
      const ukeWarnings = ukeValidationIssues.filter((issue) => issue.severity === 'warning');

      if (ukeErrors.length > 0) {
        alert(`UKE出力前チェックで修正が必要な項目があります。\n\n${formatUkeValidationIssues(ukeErrors)}`);
        return;
      }

      if (ukeWarnings.length > 0) {
        const shouldContinue = window.confirm(
          `UKE出力前チェックで確認事項があります。このまま出力しますか？\n\n${formatUkeValidationIssues(ukeWarnings)}`
        );
        if (!shouldContinue) return;
      }

      const ukeContent = generateUkeContent(records);
      const fileName = `RECEIPT_${visitId.replace('v_', '')}.uke`;
      const previousLifecycleForExport = visitData?.claimLifecycle as ClaimLifecycleState | undefined;

      const currentUserForClaim = getCurrentUser();
      const exportedAt = generatedAt.toISOString();
      const exportSnapshot = buildClaimExportSnapshot({
        visit: visitData,
        patient: patientData,
        items: prescriptionItems,
        totalPoints,
        createdAt: exportedAt,
        exportedFileName: fileName
      });
      const nextLifecycle = markClaimExported({
        current: visitData?.claimLifecycle,
        at: exportedAt,
        by: currentUserForClaim.name,
        fileName,
        totalPoints,
        exportSnapshot
      });
      await persistClaimLifecycle(
        nextLifecycle,
        `請求状態変更: UKE「${fileName}」を出力し、請求をロックしました（点数: ${totalPoints}点）。`
      );
      const auditOk = await logAuditAction(
        db,
        'uke_export',
        `レセプト（UKE）エクスポート: 患者「${patientData?.name}」の電子レセプト（点数: ${totalPoints}点）を出力しました。`,
        visitData?.patientId,
        patientData?.name
      );
      if (!auditOk) {
        const rollbackLifecycle = previousLifecycleForExport || { status: 'draft' as const };
        const visitDoc = await db.visits.findOne(visitId).exec();
        if (visitDoc) {
          await visitDoc.patch({ claimLifecycle: rollbackLifecycle });
          setVisitData((prev: any) => prev ? { ...prev, claimLifecycle: rollbackLifecycle } : prev);
        }
        throw new Error('UKE出力の監査ログ記録に失敗したため、出力を中止しました。');
      }

      const blob = new Blob([ukeContent as unknown as BlobPart], { type: 'text/csv;charset=shift_jis' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download UKE:', err);
      alert(err instanceof Error ? err.message : 'UKEファイルの生成に失敗しました。');
    }
  };

  const handleRegisterReturn = async () => {
    if (!ensurePermission('change_billing')) return;
    const reason = window.prompt('返戻理由を入力してください (例: 保険者番号不一致、用法不備等):');
    if (!reason?.trim()) return;
    const nextLifecycle = markClaimReturned({
      current: claimLifecycle,
      at: new Date().toISOString(),
      by: currentUser?.name || '担当者',
      reason: reason.trim()
    });
    await persistClaimLifecycle(nextLifecycle, `返戻登録 (${reason.trim()})`);
  };

  const handlePrepareRebilling = async () => {
    if (!ensurePermission('change_billing')) return;
    const note = window.prompt('再請求の申し送り・修正方針を入力してください:', '算定内容を修正して翌月再請求');
    if (note === null) return;
    const nextLifecycle = markClaimRebilling({
      current: claimLifecycle,
      at: new Date().toISOString(),
      by: currentUser?.name || '担当者',
      reason: note.trim()
    });
    await persistClaimLifecycle(nextLifecycle, `再請求準備 (${note.trim()})`);
  };

  const handleCloseClaim = async () => {
    if (!ensurePermission('change_billing')) return;
    const nextLifecycle = markClaimClosed({
      current: claimLifecycle,
      at: new Date().toISOString(),
      by: currentUser?.name || '担当者'
    });
    await persistClaimLifecycle(nextLifecycle, '請求完了');
  };

  const claimExportSnapshot = claimLifecycle?.exportSnapshot;
  const claimSnapshotDifferences = useMemo(() => {
    if (!claimExportSnapshot || !patientData || !visitData) return [];
    return compareClaimExportSnapshotToCurrent({
      snapshot: claimExportSnapshot,
      patient: patientData,
      items: prescriptionItems,
      totalPoints
    });
  }, [claimExportSnapshot, patientData, visitData, prescriptionItems, totalPoints]);

  const claimReturnCorrectionSuggestions = useMemo(() => {
    return buildClaimReturnCorrectionSuggestions(claimSnapshotDifferences);
  }, [claimSnapshotDifferences]);

  const handleDownloadClaimSnapshotDifferenceCsv = async () => {
    if (!claimExportSnapshot) {
      alert('UKE出力時点のスナップショットがありません。');
      return;
    }
    const fileName = makeClaimSnapshotDifferenceCsvFileName(claimExportSnapshot);
    const csv = buildClaimSnapshotDifferenceCsv({
      snapshot: claimExportSnapshot,
      differences: claimSnapshotDifferences,
      suggestions: claimReturnCorrectionSuggestions
    });
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    if (db) {
      await logAuditAction(
        db,
        'claim_lifecycle',
        `請求時点差分CSVエクスポート: ${fileName} に ${claimSnapshotDifferences.length}件の差分と返戻修正候補 ${claimReturnCorrectionSuggestions.length}件を書き出しました。`,
        visitData?.patientId,
        patientData?.name
      );
    }
  };

  const handleCopyClaimReturnCorrectionMemo = async () => {
    if (!claimExportSnapshot) {
      alert('UKE出力時点のスナップショットがありません。');
      return;
    }
    if (!navigator.clipboard) {
      alert('このブラウザではクリップボードへコピーできません。差分CSVを書き出してください。');
      return;
    }

    const memo = buildClaimReturnCorrectionHandoffMemo({
      snapshot: claimExportSnapshot,
      differences: claimSnapshotDifferences,
      suggestions: claimReturnCorrectionSuggestions
    });
    await navigator.clipboard.writeText(memo);
    if (db) {
      await logAuditAction(
        db,
        'claim_lifecycle',
        `返戻修正メモコピー: 請求時点差分 ${claimSnapshotDifferences.length}件、返戻修正候補 ${claimReturnCorrectionSuggestions.length}件を患者情報付きの院内引き継ぎメモとしてコピーしました。`,
        visitData?.patientId,
        patientData?.name
      );
    }
    alert('返戻修正メモをクリップボードにコピーしました。');
  };

  const handlePharmacyDeviceOperation = async (operation: any) => {
    if (!ensurePermission('print_documents')) return;
    if (isDemoVisit(visitData)) {
      alert('チュートリアルのデモ受付のため、外部調剤機器・POSへは送信できません。');
      return;
    }
    return delegateHandlePharmacyDeviceOperation(operation);
  };

  const getElectronicPrescriptionDocumentKinds = (prescription: any) => (
    prescription?.linkedPrescriptions?.length
      ? prescription.linkedPrescriptions.map((link: any) => link.documentKind)
      : [prescription?.documentKind || 'prescription']
  );

  const handleOpenPicking = () => {
    router.push(`/emr?visitId=${encodeURIComponent(visitId)}&openPicking=1`);
  };

  const handleOpenIntervention = () => {
    const firstIssue = prescriptionAudit.issues.find((issue) => issue.severity === 'error')
      || prescriptionAudit.issues.find((issue) => issue.severity === 'warning')
      || prescriptionAudit.issues[0];
    const reason = firstIssue ? `${firstIssue.title}: ${firstIssue.message}` : '';
    const query = new URLSearchParams({
      visitId,
      openIntervention: '1'
    });
    if (reason) query.set('reason', reason);
    router.push(`/emr?${query.toString()}`);
  };

  const handleReturnCorrectionAction = (suggestion: ClaimReturnCorrectionSuggestion) => {
    const action = buildClaimReturnCorrectionAction(suggestion, visitId);
    if (action.type === 'route') {
      const query = new URLSearchParams(action.searchParams);
      router.push(`${action.pathname}?${query.toString()}`);
      return;
    }
    document.getElementById(action.elementId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (isLoading) {
    return (
      <div className="print-loading-screen" role="status" aria-live="polite">
        <Loader2 size={36} className="animate-spin" aria-hidden="true" />
        <p>印刷データを読み込んでいます...</p>
      </div>
    );
  }

  if (!visitData || !patientData) {
    return (
      <div className="print-error-screen" role="alert">
        <h2>印刷対象の受付が見つかりませんでした</h2>
        <button className="btn-secondary" onClick={() => router.back()}>戻る</button>
      </div>
    );
  }

  const pharmacyInfo: PharmacyInfo = {
    name: settingsData?.pharmacyName || 'Next-Gen 薬局',
    code: settingsData?.pharmacyCode || '',
    postalCode: settingsData?.pharmacyPostalCode || '123-4567',
    address: settingsData?.pharmacyAddress || '東京都渋谷区桜丘町26-1',
    phone: settingsData?.pharmacyPhone || '03-1234-5678',
    registrationNumber: settingsData?.registrationNumber || 'T1234567890123',
    pharmacistName: settingsData?.defaultPharmacistName || '山田'
  };

  const pharmacyAddressLine = `${pharmacyInfo.postalCode ? `〒${pharmacyInfo.postalCode} ` : ''}${pharmacyInfo.address}`.trim();
  const insuranceAmounts = calculateInsuranceAmounts(totalPoints, patientData.insuranceInfo?.burdenRatio ?? 30);
  const prescriptionDateStr = new Date(visitData.prescriptionDate || visitData.issueDate || Date.now()).toLocaleDateString('ja-JP');
  const dispensingDateStr = new Date(visitData.dispensingDate || visitData.issueDate || Date.now()).toLocaleDateString('ja-JP');
  const currentDateStr = new Date().toLocaleDateString('ja-JP');
  const patientBirthDateStr = patientData.birthDate ? new Date(patientData.birthDate).toLocaleDateString('ja-JP') : '-';
  const receiptRunId = visitId.replace(/^v_/, '').slice(0, 14) || visitId.slice(0, 14);
  const patientAge = calculatePatientAge(patientData.birthDate);

  const patientIdentityMark = getPatientIdentityMark(patientData.patientId || patientData.id || '', visitId);
  const renderIdentityMark = (variant: 'paper' | 'compact' | 'tiny' = 'paper') => (
    <div className={`identity-mark ${patientIdentityMark.className} ${variant}`} aria-label={`職員用照合色 ${patientIdentityMark.label}`}>
      <span className="identity-symbol" aria-hidden="true"></span>
    </div>
  );

  const isFirstItemInRp = (item: any, index: number) => {
    const rpNumber = item.rpNumber || index + 1;
    return prescriptionItems.findIndex((candidate, candidateIndex) => (
      (candidate.rpNumber || candidateIndex + 1) === rpNumber
    )) === index;
  };

  const isDrugFeeOnly = !!claimOptions.drugFeeOnly;
  const disabledFeeCodes = new Set(claimOptions.disabledFeeCodes || []);

  const claimCheckStatus = hasClaimErrors ? 'error' : hasClaimWarnings ? 'warning' : 'ok';
  const pharmacistCheckStatus = prescriptionAudit.errorCount > 0 ? 'error' : prescriptionAudit.warningCount > 0 ? 'warning' : 'ok';

  const visiblePrescriptionAuditIssues = prescriptionAudit.issues.slice(0, 8);
  const hiddenPrescriptionAuditIssueCount = prescriptionAudit.issues.length - visiblePrescriptionAuditIssues.length;

  const aiAssistMode = normalizeAiAssistMode(settingsData?.aiAssistMode);
  const allAiAssistSuggestions = buildAiSuggestionsFromPrescriptionAudit(prescriptionAudit);
  const aiAssistSuggestions = filterAiAssistItemsByMode(allAiAssistSuggestions, aiAssistMode);
  const aiAssistSummary = summarizeAiSuggestions(aiAssistSuggestions);

  const getApprovedMedicationInfoTemplate = (item: any) => (
    (item.dispensedDrugCode && approvedMedicationInfoTemplates[item.dispensedDrugCode])
      || (item.drugId && approvedMedicationInfoTemplates[item.drugId])
      || null
  );

  const getMedicationInfoContent = (item: any) => buildMedicationInfoPrintContent({
    drugName: getDisplayDrugName(item),
    genericName: item.dispensedGenericName || item.genericName,
    isHighRisk: !!item.isHighRisk,
    isLiquid: isLiquidItem(item),
    isOintment: isOintmentItem(item),
    approvedTemplate: getApprovedMedicationInfoTemplate(item)
  });

  const medicationInfoFallbackCount = prescriptionItems.reduce((count, item) => (
    count + (getMedicationInfoContent(item).source === 'safe_fallback' ? 1 : 0)
  ), 0);

  const groupedForBags = prescriptionItems.reduce<Record<string, any[]>>((groups, item) => {
    const key = item.usage || '用法未設定';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});

  const liquidItems = prescriptionItems.filter(isLiquidItem);
  const ointmentItems = prescriptionItems.filter(isOintmentItem);

  const sumFeePoints = (codes: FeeCode[]) => (
    calculatedFees
      .filter((fee) => fee.code && codes.includes(fee.code))
      .reduce((sum, fee) => sum + fee.points, 0)
  );

  const receiptBreakdownRows = [
    {
      label: '調剤技術料',
      points: sumFeePoints(['base_fee', 'base_additions', 'drug_preparation', 'mixing']),
      note: '基本料・加算・調製料'
    },
    {
      label: '薬学管理料',
      points: sumFeePoints(['dispensing_management', 'medication_guidance', 'special_management', 'ippoka']),
      note: '管理料・服薬指導料'
    },
    {
      label: '薬剤料',
      points: sumFeePoints(['drug_fee']),
      note: '薬価にもとづく薬剤料'
    },
    {
      label: '特定保険医療材料料',
      points: 0,
      note: '該当なし'
    }
  ];

  const electronicPrescriptionDispensingInformationFile = electronicPrescription?.dispensingInformationFile;
  const electronicPrescriptionDispensingInformationSignatureText = electronicPrescriptionDispensingInformationFile
    ? ELECTRONIC_PRESCRIPTION_FILE_SIGNATURE_STATUS_LABELS[electronicPrescriptionDispensingInformationFile.signatureStatus]
    : '調剤情報提供ファイル未作成';
  const electronicPrescriptionDispensingInformationHpkiText = electronicPrescriptionDispensingInformationFile?.hpkiVerification
    ? `HPKI ${electronicPrescriptionDispensingInformationFile.hpkiVerification.status === 'valid' ? '署名検証済み' : '署名要確認'}`
    : 'HPKI未署名';
  const electronicPrescriptionDispensingInformationHashText = electronicPrescriptionDispensingInformationFile?.fileHash
    ? `${electronicPrescriptionDispensingInformationFile.fileHash.slice(0, 16)}...`
    : '';

  const electronicPrescriptionComments = electronicPrescription?.supplementaryInformation?.prescriptionComments || [];
  const electronicPrescriptionLaboratoryResults = electronicPrescription?.supplementaryInformation?.laboratoryResults || [];
  const electronicPrescriptionNarcoticAdministration = electronicPrescription?.supplementaryInformation?.narcoticAdministration;

  const latestClaimLifecycleEvent = claimLifecycle?.history && claimLifecycle.history.length > 0
    ? claimLifecycle.history[claimLifecycle.history.length - 1]
    : null;

  return (
    <div
      className="print-page"
      data-testid="print-page"
      style={{
        '--print-margin-top': `${printMarginTop}mm`,
        '--print-margin-bottom': `${printMarginBottom}mm`,
        '--print-font-scale': `${printFontScale / 100}`
      } as React.CSSProperties}
    >
      <div className="page-header print-header no-print">
        <div className="flex items-center gap-4">
          <button className="icon-btn" onClick={() => router.back()} aria-label="戻る" title="戻る">
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <div>
            <h1>帳票印刷</h1>
            <p className="text-muted">{patientData.name} 様の調剤録、薬袋、お薬手帳シール、各種ラベルを印刷します。</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleOpenPicking}
            title="薬歴入力画面でピッキング支援を開きます"
          >
            <Package size={16} aria-hidden="true" />
            <span>ピッキングへ</span>
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleDownloadUke}
            disabled={!canExportUke || hasClaimErrors}
            data-testid="print-uke-export-button"
            title={hasClaimErrors ? '請求前チェックのエラーを解消してください。' : undefined}
          >
            <Download size={16} aria-hidden="true" />
            <span>UKE出力</span>
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handlePrint}
            disabled={!canPrintDocuments}
            data-testid="print-execute-button"
          >
            <Printer size={16} aria-hidden="true" />
            <span>印刷実行</span>
          </button>
        </div>
      </div>

      <div className="print-workspace">
        {/* レセコン算定コンソール */}
        <section className="receipt-console-panel no-print" aria-label="レセコン算定コンソール">
          <div className="receipt-console-main">
            <div>
              <span className="console-kicker">RECEIPT COMPUTATION CONSOLE</span>
              <h2>算定・請求前点検・帳票管理</h2>
              <p>保険調剤点数、請求前チェック、UKE出力、印刷帳票のプレビューを調停します。</p>
            </div>
            <div className="console-total">
              <span>合計請求点数</span>
              <strong>{totalPoints.toLocaleString()} 点</strong>
              <small>患者負担 ¥{formatYen(insuranceAmounts.patientCopayYen)}（{insuranceAmounts.burdenRatio}%）</small>
            </div>
          </div>

          <div className="receipt-flow-grid">
            <div className={`receipt-flow-step ${pharmacistCheckStatus}`}>
              <span>1 薬剤師確認</span>
              <strong>{pharmacistCheckStatus === 'ok' ? '確認済' : `${prescriptionAudit.errorCount}件 修正要`}</strong>
            </div>
            <div className={`receipt-flow-step ${claimCheckStatus}`}>
              <span>2 請求前チェック</span>
              <strong>{claimCheckStatus === 'ok' ? '適合' : `${claimValidationErrors.length}件 不備`}</strong>
            </div>
            <div className={`receipt-flow-step ${claimLifecycleLocked ? 'locked' : claimLifecycleStatus}`}>
              <span>3 請求ロック</span>
              <strong>{CLAIM_LIFECYCLE_STATUS_LABELS[claimLifecycleStatus]}</strong>
            </div>
            <div className={`receipt-flow-step ${pharmacyDeviceFlowStatus}`}>
              <span>4 調剤機器</span>
              <strong>{pharmacyDeviceHandoff ? PHARMACY_DEVICE_HANDOFF_STATUS_LABELS[pharmacyDeviceHandoff.status] : '未送信'}</strong>
            </div>
            <div className={`receipt-flow-step ${electronicPrescriptionFlowStatus}`}>
              <span>5 電子処方箋</span>
              <strong>{electronicPrescription ? ELECTRONIC_PRESCRIPTION_DISPENSING_STATUS_LABELS[electronicPrescriptionDispensingResultStatus] : '対象外'}</strong>
            </div>
          </div>

          <div className="claim-snapshot-panel">
            <div className="claim-snapshot-header">
              <div>
                <span>請求時点スナップショット</span>
                <strong>
                  {claimExportSnapshot
                    ? `${new Date(claimExportSnapshot.createdAt).toLocaleString('ja-JP')} 出力時点`
                    : '未作成'}
                </strong>
              </div>
              <span className="claim-snapshot-badge">
                {claimExportSnapshot
                  ? claimSnapshotDifferences.length > 0
                    ? `差分 ${claimSnapshotDifferences.length}件`
                    : '差分なし'
                  : 'UKE未出力'}
              </span>
              <div className="claim-snapshot-actions">
                <button
                  type="button"
                  className="btn-secondary compact-action"
                  onClick={handleDownloadClaimSnapshotDifferenceCsv}
                  disabled={!claimExportSnapshot}
                  data-testid="claim-snapshot-diff-csv-button"
                >
                  <Download size={14} aria-hidden="true" />
                  <span>差分CSV</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary compact-action"
                  onClick={handleCopyClaimReturnCorrectionMemo}
                  disabled={!claimExportSnapshot}
                  data-testid="claim-return-correction-memo-button"
                >
                  <Clipboard size={14} aria-hidden="true" />
                  <span>返戻メモ</span>
                </button>
              </div>
            </div>

            {claimExportSnapshot && (
              claimSnapshotDifferences.length > 0 ? (
                <>
                  <div className="claim-snapshot-diff-list" aria-label="請求時点スナップショットと現在値の差分">
                    {claimSnapshotDifferences.map((difference) => (
                      <div key={difference.field} className="claim-snapshot-diff-row">
                        <strong>{difference.label}</strong>
                        <p>
                          <span>請求時点: {difference.snapshotValue}</span>
                          <span>現在: {difference.currentValue}</span>
                        </p>
                      </div>
                    ))}
                  </div>

                  {claimReturnCorrectionSuggestions.length > 0 && (
                    <div className="claim-return-suggestions" aria-label="返戻修正候補">
                      <div className="claim-return-suggestion-header">
                        <span>返戻修正候補</span>
                        <strong>{claimReturnCorrectionSuggestions.length.toLocaleString()}件</strong>
                      </div>
                      {claimReturnCorrectionSuggestions.map((suggestion) => (
                        <div key={suggestion.id} className={`claim-return-suggestion-row ${suggestion.severity}`}>
                          <div>
                            <strong>{suggestion.title}</strong>
                            <p>{suggestion.message}</p>
                            <small>{suggestion.differenceSummary}</small>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleReturnCorrectionAction(suggestion)}
                            data-testid={`return-correction-action-${suggestion.actionTarget}`}
                            data-return-correction-id={suggestion.id}
                            data-return-correction-target={suggestion.actionTarget}
                          >
                            {suggestion.actionLabel}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="claim-snapshot-ok">現在の患者マスター、処方、点数との差分はありません。</p>
              )
            )}
          </div>
        </section>

        {/* 外部調剤機器連携パネル */}
        <PharmacyDeviceHandoffPanel
          pharmacyDeviceFlowStatus={pharmacyDeviceFlowStatus}
          pharmacyDeviceReadiness={pharmacyDeviceReadiness}
          pharmacyDeviceHandoff={pharmacyDeviceHandoff}
          isLoadingPharmacyDeviceReadiness={isLoadingPharmacyDeviceReadiness}
          pharmacyDeviceConnectorReady={pharmacyDeviceConnectorReady}
          pharmacyDeviceOperationBusy={pharmacyDeviceOperationBusy}
          pharmacyDeviceOperationInFlight={pharmacyDeviceOperationInFlight}
          canSubmitPharmacyDevice={canSubmitPharmacyDevice}
          canReplacePharmacyDevice={canReplacePharmacyDevice}
          canCancelPharmacyDevice={canCancelPharmacyDevice}
          pharmacyDeviceBlockedTitle={pharmacyDeviceBlockedTitle}
          handlePharmacyDeviceOperation={handlePharmacyDeviceOperation}
        />

        {/* 請求ライフサイクルパネル */}
        <section className={`print-preview-card card claim-lifecycle-panel no-print status-${claimLifecycleStatus}`} data-testid="claim-lifecycle-panel">
          <div className="preview-header claim-check-header">
            <div>
              <h3>
                {claimLifecycleLocked ? <AlertTriangle size={18} aria-hidden="true" /> : <FileCheck2 size={18} aria-hidden="true" />}
                請求ライフサイクル
              </h3>
              <p className="claim-check-subtitle">
                UKE出力後は算定をロックし、返戻・月遅れ・再請求の理由と担当者を履歴に残します。
              </p>
            </div>
            <span className={`claim-lifecycle-badge ${claimLifecycleStatus}`}>
              {CLAIM_LIFECYCLE_STATUS_LABELS[claimLifecycleStatus]}
            </span>
          </div>

          <div className="claim-lifecycle-grid">
            <div className="claim-lifecycle-status-card">
              <span>請求ロック</span>
              <strong>{claimLifecycleLocked ? 'ロック中' : '変更可能'}</strong>
              <p>
                {claimLifecycleLocked
                  ? `${claimLifecycle?.exportedFileName || 'UKE出力'} 後の算定変更は返戻登録または再請求準備が必要です。`
                  : claimLifecycleStatus === 'draft'
                    ? 'UKE出力前の請求です。請求前チェックを通してから出力してください。'
                    : '返戻・再請求対応中のため、算定修正が可能です。'}
              </p>
            </div>

            <div className="claim-lifecycle-status-card">
              <span>最新イベント</span>
              <strong>{latestClaimLifecycleEvent ? CLAIM_LIFECYCLE_STATUS_LABELS[getClaimLifecycleStatus({ status: latestClaimLifecycleEvent.type })] : '未出力'}</strong>
              <p>
                {latestClaimLifecycleEvent
                  ? `${new Date(latestClaimLifecycleEvent.at).toLocaleString('ja-JP')} / ${latestClaimLifecycleEvent.by || '担当者未記録'}`
                  : 'UKE出力後に履歴が作成されます。'}
              </p>
            </div>

            <div className="claim-lifecycle-actions">
              <button
                type="button"
                className="btn-secondary compact-action"
                onClick={handleRegisterReturn}
                disabled={!canChangeBilling || claimLifecycleStatus === 'draft'}
                title={!canChangeBilling ? getPermissionDeniedMessage(currentUser, 'change_billing') : undefined}
              >
                <span>返戻登録</span>
              </button>
              <button
                type="button"
                className="btn-secondary compact-action"
                onClick={handlePrepareRebilling}
                disabled={!canChangeBilling || claimLifecycleStatus !== 'returned'}
                title={!canChangeBilling ? getPermissionDeniedMessage(currentUser, 'change_billing') : undefined}
              >
                <span>再請求/月遅れ</span>
              </button>
              <button
                type="button"
                className="btn-secondary compact-action"
                onClick={handleCloseClaim}
                disabled={!canChangeBilling || (claimLifecycleStatus !== 'exported' && claimLifecycleStatus !== 'rebilling')}
                title={!canChangeBilling ? getPermissionDeniedMessage(currentUser, 'change_billing') : undefined}
              >
                <span>請求完了</span>
              </button>
            </div>
          </div>
        </section>

        {/* 電子処方箋ステータスパネル */}
        <ElectronicPrescriptionPrintPanel
          electronicPrescription={electronicPrescription}
          electronicPrescriptionIds={electronicPrescriptionIds}
          electronicPrescriptionDispensingResultStatus={electronicPrescriptionDispensingResultStatus}
          electronicPrescriptionReceptionStatus={electronicPrescriptionReceptionStatus}
          electronicPrescriptionSignatureStatus={electronicPrescriptionSignatureStatus}
          electronicPrescriptionDuplicateCheckStatus={electronicPrescriptionDuplicateCheckStatus}
          electronicPrescriptionRegistered={electronicPrescriptionRegistered}
          electronicPrescriptionOperationBusy={electronicPrescriptionOperationBusy}
          electronicPrescriptionOperationInFlight={electronicPrescriptionOperationInFlight}
          canRunElectronicPrescriptionDuplicateCheck={canRunElectronicPrescriptionDuplicateCheck}
          canRegisterElectronicPrescriptionDispensingResult={canRegisterElectronicPrescriptionDispensingResult}
          canSearchElectronicPrescriptionDispensingResult={canSearchElectronicPrescriptionDispensingResult}
          canChangeElectronicPrescriptionDispensingResult={canChangeElectronicPrescriptionDispensingResult}
          canCancelElectronicPrescriptionDispensingResult={canCancelElectronicPrescriptionDispensingResult}
          canCancelElectronicPrescriptionReception={canCancelElectronicPrescriptionReception}
          electronicPrescriptionDispensingInformationSignatureText={electronicPrescriptionDispensingInformationSignatureText}
          electronicPrescriptionDispensingInformationHpkiText={electronicPrescriptionDispensingInformationHpkiText}
          electronicPrescriptionDispensingInformationSignedAtText={electronicPrescriptionDispensingInformationFile?.signedAt}
          electronicPrescriptionDispensingInformationHashText={electronicPrescriptionDispensingInformationHashText}
          electronicPrescriptionComments={electronicPrescriptionComments}
          electronicPrescriptionLaboratoryResults={electronicPrescriptionLaboratoryResults}
          electronicPrescriptionNarcoticAdministration={electronicPrescriptionNarcoticAdministration}
          prescriptionAuditErrorCount={prescriptionAudit.errorCount}
          electronicPrescriptionLifecycleDecision={electronicPrescriptionLifecycleDecision}
          handleElectronicPrescriptionOperation={handleElectronicPrescriptionOperation}
        />

        {/* 薬剤師確認パネル */}
        <section className={`print-preview-card card claim-check-panel pharmacist-check-panel no-print ${pharmacistCheckStatus}`} data-testid="pharmacist-check-panel">
          <div className="preview-header claim-check-header">
            <div>
              <h3>
                {pharmacistCheckStatus === 'ok' ? <CheckCircle size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
                薬剤師確認
              </h3>
              <p className="claim-check-subtitle">
                {prescriptionItems.length.toLocaleString()}薬品 / 要修正 {prescriptionAudit.errorCount} / 要確認 {prescriptionAudit.warningCount} / 情報 {prescriptionAudit.infoCount} / AI補助 {aiAssistSummary.totalCount}（{AI_ASSIST_MODE_LABELS[aiAssistMode]}）
              </p>
            </div>
            <div className="claim-header-actions">
              <button
                type="button"
                className="btn-secondary compact-action"
                onClick={handleOpenIntervention}
              >
                <MessageSquare size={16} aria-hidden="true" />
                <span>疑義照会を記録</span>
              </button>
              <span className={`claim-check-badge ${pharmacistCheckStatus}`}>
                {pharmacistCheckStatus === 'ok' ? '確認済' : prescriptionAudit.errorCount > 0 ? '修正あり' : '確認あり'}
              </span>
            </div>
          </div>

          {visiblePrescriptionAuditIssues.length === 0 ? (
            <div className="claim-check-ok-row">
              <CheckCircle size={18} aria-hidden="true" />
              <span>処方監査の確認事項はありません。</span>
            </div>
          ) : (
            <div className="claim-issue-list">
              {visiblePrescriptionAuditIssues.map((issue, index) => (
                <div key={`${issue.code}-${issue.itemIds?.join('-') || issue.rpId || index}`} className={`claim-issue ${issue.severity}`}>
                  <div className="claim-issue-icon" aria-hidden="true">
                    {issue.severity === 'info' ? <Info size={17} /> : <AlertTriangle size={17} />}
                  </div>
                  <div>
                    <div className="claim-issue-title-row">
                      <strong className="claim-issue-title">{issue.title}</strong>
                      <span className={`claim-issue-severity ${issue.severity}`}>
                        {CLAIM_ISSUE_LABELS[issue.severity]}
                      </span>
                    </div>
                    <p className="claim-issue-message">{issue.message}</p>
                  </div>
                </div>
              ))}
              {hiddenPrescriptionAuditIssueCount > 0 && (
                <div className="claim-issue-more">他 {hiddenPrescriptionAuditIssueCount} 件</div>
              )}
            </div>
          )}

          {allAiAssistSuggestions.length > aiAssistSuggestions.length && (
            <div className="ai-assist-mode-notice" role="status" data-testid="ai-assist-mode-notice">
              AI補助は「{AI_ASSIST_MODE_LABELS[aiAssistMode]}」です。
              {aiAssistMode === 'disabled'
                ? '候補表示を停止しています。通常の処方監査は継続します。'
                : `要修正以外の候補 ${allAiAssistSuggestions.length - aiAssistSuggestions.length}件を非表示にしています。`}
            </div>
          )}

          {aiAssistSuggestions.length > 0 && (
            <div className="ai-assist-panel" aria-label="AI補助提案">
              <div className="ai-assist-topline">
                <div className="ai-assist-heading">
                  <Sparkles size={17} aria-hidden="true" />
                  <strong>AI補助</strong>
                  <span>根拠付き {aiAssistSummary.totalCount}件 / 最高信頼度 {aiAssistSummary.maxConfidence}%</span>
                </div>
                <span className="ai-assist-review-badge">薬剤師確認必須</span>
              </div>

              <div className="ai-assist-list">
                {aiAssistSuggestions.map((suggestion: any) => (
                  <div
                    key={suggestion.suggestionId}
                    className={`ai-assist-item ${suggestion.severity}`}
                    data-testid="ai-assist-suggestion"
                  >
                    <div className="ai-assist-item-main">
                      <div className="ai-assist-title-row">
                        <strong>{suggestion.title}</strong>
                      </div>
                      <p>{suggestion.suggestedAction}</p>
                      <div className="ai-assist-meta">
                        <span>信頼度 {formatAiSuggestionConfidence(suggestion)}</span>
                      </div>
                    </div>
                    <div className="ai-assist-actions">
                      <button
                        type="button"
                        className="btn-secondary compact-action ai-assist-decision"
                        onClick={() => handleRecordAiSuggestionDecision(suggestion, 'accepted')}
                        disabled={!canReviewAiSuggestions}
                        title="採用として監査ログに記録"
                      >
                        <CheckCircle size={15} aria-hidden="true" />
                        <span>採用</span>
                      </button>
                      <button
                        type="button"
                        className="btn-secondary compact-action ai-assist-decision"
                        onClick={() => handleRecordAiSuggestionDecision(suggestion, 'modified')}
                        disabled={!canReviewAiSuggestions}
                        title="修正として監査ログに記録"
                      >
                        <Pencil size={15} aria-hidden="true" />
                        <span>修正</span>
                      </button>
                      <button
                        type="button"
                        className="btn-secondary compact-action ai-assist-decision"
                        onClick={() => handleRecordAiSuggestionDecision(suggestion, 'rejected')}
                        disabled={!canReviewAiSuggestions}
                        title="却下として監査ログに記録"
                      >
                        <XCircle size={15} aria-hidden="true" />
                        <span>却下</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 算定調整パネル */}
        <section
          id="claim-adjust-panel"
          className="print-preview-card card claim-panel no-print"
          data-testid="claim-adjust-panel"
        >
          <div className="preview-header">
            <h3><SlidersHorizontal size={18} aria-hidden="true" /> 算定調整</h3>
          </div>

          {claimLifecycleLocked && (
            <div className="claim-lock-notice" role="status">
              UKE出力後の請求はロック中です。返戻登録または再請求/月遅れ準備に切り替えると算定を修正できます。
            </div>
          )}

          <div className="claim-toggle-grid">
            <label className="claim-toggle-item primary-toggle">
              <input
                type="checkbox"
                checked={isDrugFeeOnly}
                disabled={!canEditBilling}
                onChange={(e) => handleDrugFeeOnlyChange(e.target.checked)}
              />
              <span>薬剤料のみ請求</span>
            </label>
            {FEE_TOGGLES.map((fee) => {
              const checked = isDrugFeeOnly ? fee.code === 'drug_fee' : !disabledFeeCodes.has(fee.code);
              return (
                <label className="claim-toggle-item" key={fee.code}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!canEditBilling || isDrugFeeOnly}
                    onChange={(e) => handleFeeToggle(fee.code, e.target.checked)}
                  />
                  <span>{fee.label}</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* 請求前チェックパネル */}
        <section
          className={`print-preview-card card claim-check-panel no-print ${claimCheckStatus}`}
          data-testid="claim-check-panel"
        >
          <div className="preview-header claim-check-header">
            <div>
              <h3>
                {claimCheckStatus === 'ok' ? <CheckCircle size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
                レセコン請求前チェック
              </h3>
              <p className="claim-check-subtitle">
                エラー {claimValidationErrors.length} 件 / 警告 {claimValidationWarnings.length} 件 / 情報 {claimValidationInfos.length} 件
              </p>
            </div>
            <span className={`claim-check-badge ${claimCheckStatus}`}>
              {claimCheckStatus === 'ok' ? '適合' : hasClaimErrors ? '要修正' : '要確認'}
            </span>
          </div>

          {claimValidation.length > 0 && (
            <div className="claim-issue-list" aria-label="請求前チェック結果">
              {claimValidation.slice(0, 10).map((issue, idx) => (
                <div key={`${issue.code}-${idx}`} className={`claim-issue-item ${issue.severity}`}>
                  <div className="claim-issue-icon">
                    {issue.severity === 'error' ? <AlertTriangle size={16} /> : issue.severity === 'warning' ? <AlertTriangle size={16} /> : <Info size={16} />}
                  </div>
                  <div>
                    <div className="claim-issue-title-row">
                      <strong className="claim-issue-title">{issue.title}</strong>
                      <span className={`claim-issue-severity ${issue.severity}`}>
                        {CLAIM_ISSUE_LABELS[issue.severity]}
                      </span>
                    </div>
                    <p className="claim-issue-message">{issue.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 1. 調剤録 (dispensing-record) */}
        <DispensingRecordPrint
          patientData={patientData}
          visitData={visitData}
          prescriptionItems={prescriptionItems}
          pharmacyInfo={pharmacyInfo}
          pharmacyAddressLine={pharmacyAddressLine}
          receiptRunId={receiptRunId}
          currentDateStr={currentDateStr}
          patientBirthDateStr={patientBirthDateStr}
          dispensingDateStr={dispensingDateStr}
          prescriptionDateStr={prescriptionDateStr}
          patientAge={patientAge}
          electronicPrescription={electronicPrescription}
          electronicPrescriptionIds={electronicPrescriptionIds}
          electronicPrescriptionDispensingResultStatus={electronicPrescriptionDispensingResultStatus}
          electronicPrescriptionDispensingInformationSignatureText={electronicPrescriptionDispensingInformationSignatureText}
          electronicPrescriptionDispensingInformationHpkiText={electronicPrescriptionDispensingInformationHpkiText}
          electronicPrescriptionDispensingInformationHashText={electronicPrescriptionDispensingInformationHashText}
          electronicPrescriptionComments={electronicPrescriptionComments}
          electronicPrescriptionLaboratoryResults={electronicPrescriptionLaboratoryResults}
          electronicPrescriptionNarcoticAdministration={electronicPrescriptionNarcoticAdministration}
          renderIdentityMark={renderIdentityMark}
          isFirstItemInRp={isFirstItemInRp}
        />

        {/* 2. 調剤明細書 (receipt-statement) */}
        <ReceiptStatementPrint
          patientData={patientData}
          visitData={visitData}
          calculatedFees={calculatedFees}
          totalPoints={totalPoints}
          insuranceAmounts={insuranceAmounts}
          pharmacyInfo={pharmacyInfo}
          pharmacyAddressLine={pharmacyAddressLine}
          receiptRunId={receiptRunId}
          currentDateStr={currentDateStr}
          patientBirthDateStr={patientBirthDateStr}
          dispensingDateStr={dispensingDateStr}
          prescriptionDateStr={prescriptionDateStr}
          renderIdentityMark={renderIdentityMark}
        />

        {/* 3. 領収証 (receipt) */}
        <ReceiptPrint
          patientData={patientData}
          totalPoints={totalPoints}
          insuranceAmounts={insuranceAmounts}
          receiptBreakdownRows={receiptBreakdownRows}
          pharmacyInfo={pharmacyInfo}
          pharmacyAddressLine={pharmacyAddressLine}
          receiptRunId={receiptRunId}
          currentDateStr={currentDateStr}
          dispensingDateStr={dispensingDateStr}
          prescriptionDateStr={prescriptionDateStr}
          renderIdentityMark={renderIdentityMark}
        />

        {/* 4. 薬剤情報提供文書 (drug-info) */}
        <DrugInfoPrint
          patientData={patientData}
          visitData={visitData}
          prescriptionItems={prescriptionItems}
          pharmacyInfo={pharmacyInfo}
          pharmacyAddressLine={pharmacyAddressLine}
          receiptRunId={receiptRunId}
          patientBirthDateStr={patientBirthDateStr}
          dispensingDateStr={dispensingDateStr}
          prescriptionDateStr={prescriptionDateStr}
          medicationInfoFallbackCount={medicationInfoFallbackCount}
          getMedicationInfoContent={getMedicationInfoContent}
          canEditBilling={canEditBilling}
          remarks={remarks}
          renderIdentityMark={renderIdentityMark}
          handleToggleIppoka={handleToggleIppoka}
          handleToggleCrushed={handleToggleCrushed}
          handleItemClaimToggle={handleItemClaimToggle}
          handleTokkanChange={handleTokkanChange}
          handleReceiptRemarkChange={handleReceiptRemarkChange}
          handleBillingAgentOverrideLocalChange={handleBillingAgentOverrideLocalChange}
          persistBillingAgentOverride={persistBillingAgentOverride}
        />

        {/* 5. 薬袋 (medicine-bag) */}
        <MedicineBagPrint
          patientData={patientData}
          groupedForBags={groupedForBags}
          pharmacyInfo={pharmacyInfo}
          pharmacyAddressLine={pharmacyAddressLine}
          receiptRunId={receiptRunId}
          dispensingDateStr={dispensingDateStr}
          renderIdentityMark={renderIdentityMark}
        />

        {/* 6. お薬手帳シール (medicine-notebook-sticker) */}
        <MedicineNotebookStickerPrint
          patientData={patientData}
          prescriptionItems={prescriptionItems}
          pharmacyInfo={pharmacyInfo}
          dispensingDateStr={dispensingDateStr}
          renderIdentityMark={renderIdentityMark}
        />

        {/* 7. 水剤ラベル (liquid-label-sheet) */}
        <LiquidLabelSheetPrint
          patientData={patientData}
          liquidItems={liquidItems}
          pharmacyInfo={pharmacyInfo}
          pharmacyAddressLine={pharmacyAddressLine}
          currentDateStr={currentDateStr}
          renderIdentityMark={renderIdentityMark}
        />

        {/* 8. 軟膏ラベル (ointment-label-sheet) */}
        <OintmentLabelSheetPrint
          patientData={patientData}
          ointmentItems={ointmentItems}
          pharmacyInfo={pharmacyInfo}
          pharmacyAddressLine={pharmacyAddressLine}
          currentDateStr={currentDateStr}
          renderIdentityMark={renderIdentityMark}
        />
      </div>
    </div>
  );
}
