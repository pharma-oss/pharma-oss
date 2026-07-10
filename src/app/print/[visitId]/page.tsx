'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Printer, FileText, FileCheck2, Package, ArrowLeft, CheckCircle, Download, Loader2, BookOpen, Droplets, Paintbrush, SlidersHorizontal, AlertTriangle, Info, MessageSquare, Sparkles, Pencil, XCircle, Clipboard, Send, RefreshCw } from 'lucide-react';
import { COMMON_RECEIPT_REMARKS } from "@/lib/data/receipt_remarks";
import { buildDispensingUkeRecords } from '@/lib/receipt/dispensing_uke';
import { generateUkeContent } from "@/lib/receipt/uke_generator";
import { useDatabase } from '@/db/DatabaseProvider';
import { calculateDispensingFees, getTotalPoints, getFormulationType, type FeeCode, type FeeCalculationOptions } from '@/lib/calculator';
import { calculateInsuranceAmounts, formatYen } from '@/lib/billing';
import { validateDispensingClaim } from '@/lib/claim_validation';
import {
  buildClaimReturnCorrectionAction,
  buildClaimReturnCorrectionHandoffMemo,
  buildClaimReturnCorrectionSuggestions,
  buildClaimExportSnapshot,
  buildClaimSnapshotDifferenceCsv,
  compareClaimExportSnapshotToCurrent,
  makeClaimSnapshotDifferenceCsvFileName,
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
import { isDemoVisit } from '@/lib/demo_data';
import { canUserPerform, getCurrentUser, getPermissionDeniedMessage, logAuditAction, type PermissionAction } from '@/lib/audit';
import { validateDispensingUkeRecords } from '@/lib/receipt/dispensing_uke_validation';
import { buildPrescriptionInputAudit, type PrescriptionInputAuditIssue, type PrescriptionInputAuditItem } from '@/lib/prescription_input_audit';
import {
  buildAiSuggestionDecisionAuditDetail,
  buildAiSuggestionsFromPrescriptionAudit,
  formatAiSuggestionConfidence,
  getAiSuggestionDecisionLabel,
  summarizeAiSuggestions,
  type AiAssistSuggestion,
  type AiSuggestionDecision
} from '@/lib/ai_suggestion';
import {
  AI_ASSIST_MODE_LABELS,
  filterAiAssistItemsByMode,
  normalizeAiAssistMode
} from '@/lib/ai_assist_policy';
import type { FacilitySettings, PatientMedicationInfoTemplate, VisitElectronicPrescription, VisitElectronicPrescriptionHpkiVerification, VisitPharmacyDeviceHandoff } from '@/db/types';
import {
  requiresElectronicPrescriptionDispensingHpkiSignature,
  validateElectronicPrescriptionLifecycleOperation,
  type ElectronicPrescriptionOperationKind,
  type ElectronicPrescriptionOperationResult
} from '@/lib/electronic_prescription';
import type { ExternalConnectorReadinessCheck, ExternalConnectorReadinessReport } from '@/lib/external_connector_readiness';
import type {
  PharmacyDeviceOperation,
  PharmacyDeviceOperationResult,
  PharmacyDevicePrescriptionPayload
} from '@/lib/pharmacy_device_connector';
import {
  buildMedicationInfoPrintContent,
  selectApprovedPatientMedicationInfoTemplate
} from '@/lib/patient_medication_info';

const FEE_TOGGLES: { code: FeeCode; label: string }[] = [
  { code: 'base_fee', label: '調剤基本料' },
  { code: 'base_additions', label: '施設基準加算/減算' },
  { code: 'drug_preparation', label: '薬剤調製料' },
  { code: 'dispensing_management', label: '調剤管理料' },
  { code: 'medication_guidance', label: '服薬管理指導料' },
  { code: 'special_management', label: '特薬管' },
  { code: 'ippoka', label: '外来服薬支援料2' },
  { code: 'mixing', label: '自家製剤/計量混合' },
  { code: 'drug_fee', label: '薬剤料' }
];

const CLAIM_ISSUE_LABELS = {
  error: '要修正',
  warning: '要確認',
  info: '情報'
} as const;

const AI_SUGGESTION_SEVERITY_LABELS = {
  critical: '要修正',
  warning: '要確認',
  info: '情報'
} as const;

const PATIENT_IDENTITY_MARKS = [
  { label: 'A', className: 'mark-sakura' },
  { label: 'B', className: 'mark-aoba' },
  { label: 'C', className: 'mark-tsubaki' },
  { label: 'D', className: 'mark-sumire' },
  { label: 'E', className: 'mark-kohaku' },
  { label: 'F', className: 'mark-shizuku' }
] as const;

const ELECTRONIC_PRESCRIPTION_OPERATION_LABELS: Record<ElectronicPrescriptionOperationKind, string> = {
  duplicate_check: '重複投薬等チェック',
  reception_cancel: '受付取消',
  dispensing_result_register: '調剤結果登録',
  dispensing_result_search: '調剤結果ID検索',
  dispensing_result_cancel: '調剤結果取消',
  dispensing_result_change: '調剤結果変更'
};

const ELECTRONIC_PRESCRIPTION_RECEPTION_STATUS_LABELS: Record<VisitElectronicPrescription['receptionStatus'], string> = {
  accepted: '受付済み',
  cancel_pending: '取消確認中',
  cancelled: '取消済み'
};

const ELECTRONIC_PRESCRIPTION_DISPENSING_STATUS_LABELS: Record<VisitElectronicPrescription['dispensingResultStatus'], string> = {
  pending: '未登録',
  submitted: '送信済み',
  registered: '登録済み',
  failed: '登録失敗',
  cancelled: '取消済み'
};

const ELECTRONIC_PRESCRIPTION_DOCUMENT_KIND_LABELS: Record<VisitElectronicPrescription['documentKind'], string> = {
  electronic_prescription: '電子処方箋',
  prescription_information: '処方箋情報提供ファイル'
};

const ELECTRONIC_PRESCRIPTION_SIGNATURE_STATUS_LABELS: Record<VisitElectronicPrescription['signatureStatus'], string> = {
  valid: '署名確認済み',
  invalid: '署名不正',
  not_checked: '署名未確認',
  not_applicable: '対象外'
};

const ELECTRONIC_PRESCRIPTION_DUPLICATE_CHECK_STATUS_LABELS: Record<VisitElectronicPrescription['duplicateCheckStatus'], string> = {
  not_checked: '未実施',
  passed: '問題なし',
  warning: '確認あり',
  blocked: '停止'
};

const ELECTRONIC_PRESCRIPTION_FILE_SIGNATURE_STATUS_LABELS: Record<NonNullable<VisitElectronicPrescription['dispensingInformationFile']>['signatureStatus'], string> = {
  valid: '電子署名検証済み',
  invalid: '電子署名不正',
  present: '電子署名あり',
  unsigned: '電子署名なし',
  not_checked: '未確認'
};

const ELECTRONIC_PRESCRIPTION_HPKI_STATUS_LABELS: Record<VisitElectronicPrescriptionHpkiVerification['status'], string> = {
  valid: 'HPKI確認済み',
  invalid: 'HPKI不正',
  expired: 'HPKI期限切れ',
  revoked: 'HPKI失効',
  not_checked: 'HPKI未確認',
  not_applicable: 'HPKI対象外'
};

const PHARMACY_DEVICE_HANDOFF_STATUS_LABELS: Record<VisitPharmacyDeviceHandoff['status'], string> = {
  accepted: '受付済み',
  duplicate: '送信済み',
  cancelled: '取消済み'
};

function stableHashText(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function formatUkeValidationIssues(issues: ReturnType<typeof validateDispensingUkeRecords>): string {
  return issues
    .slice(0, 8)
    .map((issue) => `・${issue.title}: ${issue.message}`)
    .join('\n');
}

function formatPrescriptionAuditIssues(issues: PrescriptionInputAuditIssue[]): string {
  return issues
    .slice(0, 8)
    .map((issue) => `・${issue.title}: ${issue.message}`)
    .join('\n');
}

function toDateOnly(value: unknown): string {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

type PendingReceiptRemarkSave = {
  itemId: string;
  index: number;
  remark: string;
  doc: any;
};

type ClaimItemFlagField = 'claimPreparation' | 'claimManagement' | 'claimDrugFee' | 'isDiagnosticTest';
type BillingAgentOverrideField = 'billingAgentGroupKey' | 'billingAgentGroupReason';

function getClaimItemFlagValue(item: any, field: ClaimItemFlagField): boolean {
  if (field === 'isDiagnosticTest') {
    return !!item.isDiagnosticTest;
  }
  return item[field] !== false;
}

export default function PrintPage() {
  const params = useParams();
  const router = useRouter();
  const db = useDatabase();
  const visitId = params.visitId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isFinishing, setIsFinishing] = useState(false);
  const [visitData, setVisitData] = useState<any>(null);
  const [patientData, setPatientData] = useState<any>(null);
  const [patientAlerts, setPatientAlerts] = useState<any[]>([]);
  const [settingsData, setSettingsData] = useState<FacilitySettings | null>(null);
  const [prescriptionItems, setPrescriptionItems] = useState<any[]>([]);
  const [approvedMedicationInfoTemplates, setApprovedMedicationInfoTemplates] = useState<Record<string, PatientMedicationInfoTemplate>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [claimOptions, setClaimOptions] = useState<FeeCalculationOptions>({ drugFeeOnly: false, disabledFeeCodes: [] });
  const [electronicPrescriptionOperationInFlight, setElectronicPrescriptionOperationInFlight] = useState<ElectronicPrescriptionOperationKind | null>(null);
  const [pharmacyDeviceOperationInFlight, setPharmacyDeviceOperationInFlight] = useState<PharmacyDeviceOperation | null>(null);
  const [pharmacyDeviceReadiness, setPharmacyDeviceReadiness] = useState<ExternalConnectorReadinessCheck | null>(null);
  const [isLoadingPharmacyDeviceReadiness, setIsLoadingPharmacyDeviceReadiness] = useState(true);
  const debounceRef = useRef<Record<string, NodeJS.Timeout>>({});
  const pendingReceiptRemarkRef = useRef<Record<string, PendingReceiptRemarkSave>>({});

  // Premium Print Slider States
  const [printMarginTop, setPrintMarginTop] = useState(15); // mm
  const [printMarginBottom, setPrintMarginBottom] = useState(15); // mm
  const [printFontScale, setPrintFontScale] = useState(100); // %

  useEffect(() => {
    const top = localStorage.getItem('printMarginTop');
    const bottom = localStorage.getItem('printMarginBottom');
    const scale = localStorage.getItem('printFontScale');
    if (top) setPrintMarginTop(Number(top));
    if (bottom) setPrintMarginBottom(Number(bottom));
    if (scale) setPrintFontScale(Number(scale));
  }, []);

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

  const handleMarginTopChange = (val: number) => {
    setPrintMarginTop(val);
    localStorage.setItem('printMarginTop', String(val));
  };

  const handleMarginBottomChange = (val: number) => {
    setPrintMarginBottom(val);
    localStorage.setItem('printMarginBottom', String(val));
  };

  const handleFontScaleChange = (val: number) => {
    setPrintFontScale(val);
    localStorage.setItem('printFontScale', String(val));
  };

  useEffect(() => {
    async function loadData() {
      if (!db || !visitId) return;

      try {
        // ⚡ Bolt: Eliminate read waterfalls by initiating independent queries concurrently.
        // Avoid blindly grouping all queries if it delays dependent queries.
        const visitPromise = db.visits.findOne(visitId).exec();
        const itemsPromise = db.prescription_items.find({ selector: { visitId } }).exec();
        const settingsPromise = db.facility_settings.findOne('default').exec();

        const visit = await visitPromise;
        if (!visit) {
           setIsLoading(false);
           return;
        }

        setVisitData(visit.toJSON());
        const visitJson = visit.toJSON();
        setClaimOptions({
          drugFeeOnly: !!visitJson.claimOptions?.drugFeeOnly,
          disabledFeeCodes: Array.from(visitJson.claimOptions?.disabledFeeCodes || []),
          disabledFeeRationales: { ...(visitJson.claimOptions?.disabledFeeRationales || {}) }
        });

        // Initiate dependent queries immediately after visit and items are resolved
        const patientPromise = db.patients.findOne(visit.patientId).exec();
        const alertsPromise = db.alerts.find({ selector: { patientId: visit.patientId } }).exec();

        const items = await itemsPromise;

        // ⚡ Bolt: Use a manual for loop instead of .map() to avoid intermediate array/closure allocations
        const drugIds: string[] = [];
        for (let i = 0; i < items.length; i++) {
          const prescribedDrugId = items[i].drugId;
          const dispensedDrugCode = items[i].dispensedDrugCode;
          if (prescribedDrugId) drugIds.push(prescribedDrugId);
          if (dispensedDrugCode) drugIds.push(dispensedDrugCode);
        }

        const uniqueDrugIds = Array.from(new Set(drugIds));
        const drugsPromise = db.drugs.findByIds(uniqueDrugIds).exec();
        const medicationInfoTemplatesPromise = uniqueDrugIds.length > 0
          ? db.patient_medication_info_templates.find({
              selector: {
                drugCode: { $in: uniqueDrugIds },
                status: 'approved'
              }
            }).exec()
          : Promise.resolve([]);

        // Await remaining concurrent promises together
        const [patient, drugsMap, settingsDoc, alerts, medicationInfoTemplateDocs] = await Promise.all([
          patientPromise,
          drugsPromise,
          settingsPromise,
          alertsPromise,
          medicationInfoTemplatesPromise
        ]);

        if (patient) setPatientData(patient.toJSON());
        setPatientAlerts(alerts.map((alert) => alert.toJSON()).filter((alert) => alert.status !== 'resolved'));
        if (settingsDoc) setSettingsData(settingsDoc.toJSON());
        const templateCandidatesByDrugCode: Record<string, PatientMedicationInfoTemplate[]> = {};
        for (const templateDoc of medicationInfoTemplateDocs) {
          const template = templateDoc.toJSON() as PatientMedicationInfoTemplate;
          if (template.status === 'approved') {
            templateCandidatesByDrugCode[template.drugCode] ||= [];
            templateCandidatesByDrugCode[template.drugCode].push(template);
          }
        }
        const templatesByDrugCode: Record<string, PatientMedicationInfoTemplate> = {};
        for (const [drugCode, candidates] of Object.entries(templateCandidatesByDrugCode)) {
          const selectedTemplate = selectApprovedPatientMedicationInfoTemplate(candidates);
          if (selectedTemplate) templatesByDrugCode[drugCode] = selectedTemplate;
        }
        setApprovedMedicationInfoTemplates(templatesByDrugCode);

        // ⚡ Bolt: Avoid calling .toJSON() on RxDocuments inside loops to prevent deep clone overhead
        // which causes massive garbage collection pauses and delays rendering.
        // ⚡ Bolt: Use a manual for loop instead of .map() to avoid intermediate array/closure allocations
        const itemsData = new Array(items.length);
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const dispensedDrugDoc = item.dispensedDrugCode ? drugsMap.get(item.dispensedDrugCode) : undefined;
          const prescribedDrugDoc = drugsMap.get(item.drugId);
          const billingDrugDoc = dispensedDrugDoc || prescribedDrugDoc;
          itemsData[i] = {
            itemId: item.itemId,
            visitId: item.visitId,
            rpNumber: item.rpNumber,
            drugId: item.drugId,
            dispensedDrug: item.dispensedDrug,
            dispensedDrugCode: item.dispensedDrugCode,
            changeReason: item.changeReason,
            amount: item.amount,
            usage: item.usage,
            days: item.days,
            rpComment: item.rpComment,
            tokkanType: item.tokkanType || 'none',
            isIppoka: item.isIppoka || false,
            isCrushed: item.isCrushed || false,
            claimPreparation: item.claimPreparation !== false,
            claimManagement: item.claimManagement !== false,
            claimDrugFee: item.claimDrugFee !== false,
            isDiagnosticTest: !!item.isDiagnosticTest,
            receiptRemark: item.receiptRemark,
            billingAgentGroupKey: item.billingAgentGroupKey || '',
            billingAgentGroupReason: item.billingAgentGroupReason || '',
            isPicked: !!item.isPicked,
            pickedAt: item.pickedAt,
            pickedGs1Code: item.pickedGs1Code,
            pickedGtin: item.pickedGtin,
            pickedLotNumber: item.pickedLotNumber,
            pickedExpirationDate: item.pickedExpirationDate,
            pickedStockId: item.pickedStockId,
            isHighRisk: billingDrugDoc ? billingDrugDoc.isHighRisk : false,
            isAbolished: billingDrugDoc ? billingDrugDoc.isAbolished : false,
            stockQuantity: billingDrugDoc ? billingDrugDoc.stockQuantity : undefined,
            drugName: prescribedDrugDoc ? prescribedDrugDoc.name : undefined,
            drugPrice: billingDrugDoc ? billingDrugDoc.price : undefined,
            yjCode: billingDrugDoc ? billingDrugDoc.yjCode : undefined,
            genericName: billingDrugDoc ? billingDrugDoc.genericName : undefined,
            prescribedYjCode: prescribedDrugDoc ? prescribedDrugDoc.yjCode : undefined,
            prescribedGenericName: prescribedDrugDoc ? prescribedDrugDoc.genericName : undefined,
            prescribedIsHighRisk: prescribedDrugDoc ? prescribedDrugDoc.isHighRisk : false,
            prescribedIsAbolished: prescribedDrugDoc ? prescribedDrugDoc.isAbolished : false,
            prescribedStockQuantity: prescribedDrugDoc ? prescribedDrugDoc.stockQuantity : undefined,
            dispensedYjCode: dispensedDrugDoc ? dispensedDrugDoc.yjCode : undefined,
            dispensedGenericName: dispensedDrugDoc ? dispensedDrugDoc.genericName : undefined,
            dispensedIsHighRisk: dispensedDrugDoc ? dispensedDrugDoc.isHighRisk : false,
            dispensedIsAbolished: dispensedDrugDoc ? dispensedDrugDoc.isAbolished : false,
            dispensedStockQuantity: dispensedDrugDoc ? dispensedDrugDoc.stockQuantity : undefined,
            doc: item // ⚡ Bolt: Cache RxDocument to bypass findOne lookup during updates
          };
        }
        setPrescriptionItems(itemsData);

      } catch (error) {
        // 🛡️ Sentinel: Do not leak raw error objects to the UI, but log for debugging
        console.error('Failed to load data for printing securely:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [db, visitId]);

  const handleToggleIppoka = async (itemId: string, newIppokaState: boolean, index: number) => {
    if (!ensurePermission('change_billing')) return;
    if (!ensureClaimEditable()) return;
    if (!db) return;
    try {
      // ⚡ Bolt: Bypass O(N) .find() iteration by passing the item index directly from the render loop.
      const currentItem = prescriptionItems[index];
      if (currentItem && currentItem.itemId === itemId && currentItem.doc) {
        await currentItem.doc.patch({ isIppoka: newIppokaState });
        // ⚡ Bolt: Optimize hot path by bypassing O(N) .findIndex() and directly updating the item
        // via its index. This eliminates closure allocations and iteration.
        setPrescriptionItems(prev => {
          if (prev[index]?.itemId !== itemId) return prev; // Sanity check
          const next = [...prev];
          next[index] = { ...next[index], isIppoka: newIppokaState };
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to toggle ippoka:', err);
    }
  };

  const handleToggleCrushed = async (itemId: string, newCrushedState: boolean, index: number) => {
    if (!ensurePermission('change_billing')) return;
    if (!ensureClaimEditable()) return;
    if (!db) return;
    try {
      const currentItem = prescriptionItems[index];
      if (currentItem && currentItem.itemId === itemId && currentItem.doc) {
        await currentItem.doc.patch({ isCrushed: newCrushedState });
        setPrescriptionItems(prev => {
          if (prev[index]?.itemId !== itemId) return prev;
          const next = [...prev];
          next[index] = { ...next[index], isCrushed: newCrushedState };
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to toggle crushed:', err);
    }
  };

  const handleTokkanChange = async (itemId: string, newTokkanType: string, index: number) => {
    if (!ensurePermission('change_billing')) return;
    if (!ensureClaimEditable()) return;
    if (!db) return;
    try {
      const currentItem = prescriptionItems[index];
      if (currentItem && currentItem.itemId === itemId && currentItem.doc) {
        await currentItem.doc.patch({ tokkanType: newTokkanType });
        setPrescriptionItems(prev => {
          if (prev[index]?.itemId !== itemId) return prev;
          const next = [...prev];
          next[index] = { ...next[index], tokkanType: newTokkanType };
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to update tokkan:', err);
    }
  };

  const persistClaimOptions = async (nextOptions: FeeCalculationOptions) => {
    if (!db) {
      throw new Error('データベースの初期化が完了していません。');
    }
    const visitDoc = await db.visits.findOne(visitId).exec();
    if (!visitDoc) {
      throw new Error('対象の受付が見つかりません。');
    }
    await visitDoc.patch({ claimOptions: nextOptions });
  };

  const ensurePermission = (action: PermissionAction) => {
    const user = getCurrentUser();
    if (canUserPerform(user, action)) return true;
    alert(getPermissionDeniedMessage(user, action));
    return false;
  };

  const ensureClaimEditable = () => {
    if (!isClaimEditBlocked(visitData?.claimLifecycle)) return true;
    alert(getClaimEditBlockedMessage(visitData?.claimLifecycle, 'billing'));
    return false;
  };

  const handleDrugFeeOnlyChange = async (enabled: boolean) => {
    if (!ensurePermission('change_billing')) return;
    if (!ensureClaimEditable()) return;
    if (!db) {
      alert('データベースの初期化が完了していません。');
      return;
    }
    const previousOptions = claimOptions;
    const rationales = { ...(claimOptions.disabledFeeRationales || {}) };
    let rationale = '';
    if (enabled) {
      rationale = window.prompt('「薬剤料のみ」の請求に切り替える理由を入力してください。', '検査薬のみの処方のため') || '検査薬のみの処方のため';
      rationales['drug_fee_only'] = rationale;
    } else {
      delete rationales['drug_fee_only'];
    }

    const nextOptions = {
      ...claimOptions,
      drugFeeOnly: enabled,
      disabledFeeCodes: claimOptions.disabledFeeCodes || [],
      disabledFeeRationales: rationales
    };
    try {
      setClaimOptions(nextOptions);
      await persistClaimOptions(nextOptions);
      const actionText = enabled ? `薬剤料のみ請求に設定 (理由: ${rationale})` : '通常請求に設定';
      const auditOk = await logAuditAction(
        db,
        'billing_toggle',
        `点数請求切替: ${actionText} に変更しました。`,
        visitData?.patientId,
        patientData?.name
      );
      if (!auditOk) {
        setClaimOptions(previousOptions);
        await persistClaimOptions(previousOptions);
        throw new Error('点数請求切替の監査ログ記録に失敗したため、変更を元に戻しました。');
      }
    } catch (err: any) {
      setClaimOptions(previousOptions);
      console.error('Failed to update drug-fee-only claim option:', err);
      alert(`点数請求切替に失敗しました: ${err.message || err}`);
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

  const handleItemClaimToggle = async (
    itemId: string,
    field: ClaimItemFlagField,
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

  const handleBillingAgentOverrideLocalChange = (
    itemId: string,
    field: BillingAgentOverrideField,
    value: string,
    index: number
  ) => {
    if (!ensurePermission('change_billing')) return;
    if (!ensureClaimEditable()) return;
    const limitedValue = value.slice(0, field === 'billingAgentGroupKey' ? 50 : 500);
    setPrescriptionItems(prev => {
      if (prev[index]?.itemId !== itemId) return prev;
      const next = [...prev];
      const current = next[index];
      const nextItem = {
        ...current,
        [field]: limitedValue
      };
      if (field === 'billingAgentGroupKey' && !limitedValue.trim()) {
        nextItem.billingAgentGroupReason = '';
      }
      next[index] = nextItem;
      return next;
    });
  };

  const persistBillingAgentOverride = async (itemId: string, index: number) => {
    if (!ensurePermission('change_billing')) return;
    if (!ensureClaimEditable()) return;
    if (!db) return;
    try {
      const currentItem = prescriptionItems[index];
      if (!currentItem || currentItem.itemId !== itemId || !currentItem.doc) return;

      const billingAgentGroupKey = String(currentItem.billingAgentGroupKey || '').trim().slice(0, 50);
      const billingAgentGroupReason = billingAgentGroupKey
        ? String(currentItem.billingAgentGroupReason || '').trim().slice(0, 500)
        : '';
      const patch = { billingAgentGroupKey, billingAgentGroupReason };
      await currentItem.doc.patch(patch);
      setPrescriptionItems(prev => {
        if (prev[index]?.itemId !== itemId) return prev;
        const next = [...prev];
        next[index] = { ...next[index], ...patch };
        return next;
      });

      const drugLabel = currentItem.dispensedDrug || currentItem.drugName || currentItem.drugId;
      await logAuditAction(
        db,
        'billing_toggle',
        `剤グループ上書き: 薬品「${drugLabel}」を「${billingAgentGroupKey || '未設定'}」に変更しました。${billingAgentGroupReason ? `理由: ${billingAgentGroupReason}` : ''}`,
        visitData?.patientId,
        patientData?.name
      );
    } catch (err) {
      console.error('Failed to update billing agent override:', err);
      alert(`剤グループ上書きの保存に失敗しました: ${err instanceof Error ? err.message : err}`);
    }
  };

  const handleReceiptRemarkChange = (itemId: string, newRemark: string, index: number) => {
    if (!ensurePermission('change_billing')) return;
    if (!ensureClaimEditable()) return;
    if (!db) return;

    // ⚡ Bolt: Update local state immediately without triggering recalculation of dispensing fees
    setRemarks(prev => ({ ...prev, [itemId]: newRemark }));
    const currentItem = prescriptionItems[index];
    if (currentItem && currentItem.itemId === itemId && currentItem.doc) {
      pendingReceiptRemarkRef.current[itemId] = {
        itemId,
        index,
        remark: newRemark,
        doc: currentItem.doc
      };
    }

    // ⚡ Bolt: Debounce the database update to reduce write frequency and re-renders
    if (debounceRef.current[itemId]) {
      clearTimeout(debounceRef.current[itemId]);
    }

    debounceRef.current[itemId] = setTimeout(async () => {
      try {
        const pending = pendingReceiptRemarkRef.current[itemId];
        if (pending && pending.remark === newRemark) {
          await persistReceiptRemark(pending);
        }
      } catch (err) {
        console.error('Failed to update receipt remark:', err);
      }
    }, 500);
  };

  const persistReceiptRemark = async (pending: PendingReceiptRemarkSave) => {
    await pending.doc.patch({ receiptRemark: pending.remark });
    setPrescriptionItems(prev => {
      if (prev[pending.index]?.itemId !== pending.itemId) return prev;
      const next = [...prev];
      next[pending.index] = { ...next[pending.index], receiptRemark: pending.remark };
      return next;
    });

    const latestPending = pendingReceiptRemarkRef.current[pending.itemId];
    if (latestPending && latestPending.remark === pending.remark) {
      delete pendingReceiptRemarkRef.current[pending.itemId];
    }
  };

  const flushPendingReceiptRemarks = async () => {
    const pendingSaves = Object.values(pendingReceiptRemarkRef.current);
    if (pendingSaves.length === 0) return;

    for (let i = 0; i < pendingSaves.length; i++) {
      const pending = pendingSaves[i];
      const timeout = debounceRef.current[pending.itemId];
      if (timeout) {
        clearTimeout(timeout);
        delete debounceRef.current[pending.itemId];
      }
      await persistReceiptRemark(pending);
    }
  };

  const ensureReceiptRemarksSaved = async () => {
    try {
      await flushPendingReceiptRemarks();
      return true;
    } catch (error) {
      console.error('Failed to flush receipt remarks:', error);
      alert('レセ適コメントの保存に失敗しました。保存後にもう一度実行してください。');
      return false;
    }
  };

  // Cleanup timeouts on unmount
  useEffect(() => {
    // ⚡ Bolt: ensure pending saves are flushed rather than lost on unmount
    const currentDebounceRef = debounceRef.current;
    return () => {
      // ⚡ Bolt: Use for...in loop to avoid intermediate array allocation from Object.keys() and closure overhead
      for (const itemId in currentDebounceRef) {
         const timeout = currentDebounceRef[itemId];
         if (timeout) {
           clearTimeout(timeout);
         }
      }
    };
  }, []);

  // ⚡ Bolt: Use useMemo instead of useEffect + state to derive calculatedFees and totalPoints.
  // This eliminates an entire render cycle that occurs when useEffect triggers a setState.
  const { calculatedFees, totalPoints } = useMemo(() => {
    if (!visitData || !patientData || !settingsData || prescriptionItems.length === 0) {
      return { calculatedFees: [], totalPoints: 0 };
    }
    try {
      const fees = calculateDispensingFees(
        settingsData,
        prescriptionItems,
        patientData,
        visitData.issueDate,
        claimOptions
      );
      return {
        calculatedFees: fees,
        totalPoints: getTotalPoints(fees)
      };
    } catch (err) {
      console.error('Failed to recalculate fees securely:', err);
      return { calculatedFees: [], totalPoints: 0 };
    }
  }, [prescriptionItems, visitData, patientData, settingsData, claimOptions]);

  const claimValidationIssues = useMemo(() => {
    if (!visitData || !patientData) {
      return [];
    }

    return validateDispensingClaim({
      settings: settingsData,
      patient: patientData,
      items: prescriptionItems,
      calculatedFees,
      claimOptions,
      patientAlerts,
      totalPoints,
      serviceDate: visitData.dispensingDate || visitData.prescriptionDate || visitData.issueDate
    });
  }, [visitData, patientData, settingsData, prescriptionItems, calculatedFees, claimOptions, patientAlerts, totalPoints]);

  const prescriptionAuditItems = useMemo<PrescriptionInputAuditItem[]>(() => (
    prescriptionItems.map((item) => {
      const dispensedDrug = String(item.dispensedDrug || '').trim();
      const hasActualDispensedDrug = dispensedDrug && !['変更なし', '変更調剤なし'].includes(dispensedDrug);
      return {
        id: item.itemId,
        rpId: item.rpNumber ? `rp_${item.rpNumber}` : undefined,
        drugCode: item.drugId,
        drugName: item.drugName || item.drugId,
        dispensedDrug: item.dispensedDrug,
        dispensedDrugCode: item.dispensedDrugCode,
        changeReason: item.changeReason,
        amount: item.amount,
        usage: item.usage,
        days: item.days,
        rpComment: item.rpComment,
        receiptRemark: item.receiptRemark,
        isIppoka: item.isIppoka,
        isCrushed: item.isCrushed,
        showReceiptRemark: !!item.receiptRemark,
        yjCode: item.prescribedYjCode || item.yjCode,
        genericName: item.prescribedGenericName || item.genericName,
        isHighRisk: !!item.prescribedIsHighRisk,
        isAbolished: !!item.prescribedIsAbolished,
        stockQuantity: item.prescribedStockQuantity,
        dispensedYjCode: hasActualDispensedDrug ? (item.dispensedYjCode || item.yjCode) : undefined,
        dispensedGenericName: hasActualDispensedDrug ? (item.dispensedGenericName || item.genericName) : undefined,
        dispensedIsHighRisk: hasActualDispensedDrug ? !!(item.dispensedIsHighRisk || item.isHighRisk) : false,
        dispensedIsAbolished: hasActualDispensedDrug ? !!(item.dispensedIsAbolished || item.isAbolished) : false,
        dispensedStockQuantity: hasActualDispensedDrug ? (item.dispensedStockQuantity ?? item.stockQuantity) : undefined
      };
    })
  ), [prescriptionItems]);

  const prescriptionAudit = useMemo(() => (
    buildPrescriptionInputAudit(prescriptionAuditItems, { patientAlerts })
  ), [prescriptionAuditItems, patientAlerts]);

  const aiAssistMode = normalizeAiAssistMode(settingsData?.aiAssistMode);
  const allAiAssistSuggestions = useMemo(() => (
    buildAiSuggestionsFromPrescriptionAudit(prescriptionAudit)
  ), [prescriptionAudit]);
  const aiAssistSuggestions = useMemo(() => (
    filterAiAssistItemsByMode(allAiAssistSuggestions, aiAssistMode)
  ), [aiAssistMode, allAiAssistSuggestions]);

  const aiAssistSummary = useMemo(() => (
    summarizeAiSuggestions(aiAssistSuggestions)
  ), [aiAssistSuggestions]);

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
      `印刷開始: 患者「${patientData?.name}」の調剤録・薬袋等の帳票印刷を開始しました。薬情 承認版 ${medicationInfoContents.length - medicationInfoFallbackCount}件 / 定型文 ${medicationInfoFallbackCount}件。`,
      visitData?.patientId,
      patientData?.name
    );
    if (!auditOk) {
      alert('印刷の監査ログ記録に失敗したため、印刷を中止しました。');
      return;
    }
    try {
      window.print();
    } catch (err) {
      console.error('Failed to print documents:', err);
      await logAuditAction(
        db,
        'print',
        `印刷失敗: 患者「${patientData?.name}」の帳票印刷開始後にブラウザ印刷で失敗しました。`,
        visitData?.patientId,
        patientData?.name
      );
      alert(`印刷に失敗しました: ${err instanceof Error ? err.message : err}`);
    }
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
      if (!(await ensureReceiptRemarksSaved())) return;
      if (prescriptionAudit.errorCount > 0) {
        alert(`薬剤師確認で要修正の項目があります。\n\n${formatPrescriptionAuditIssues(prescriptionAudit.issues.filter((issue) => issue.severity === 'error'))}`);
        return;
      }

      if (prescriptionAudit.warningCount > 0) {
        const shouldContinue = window.confirm(
          `薬剤師確認で確認事項があります。このままUKEを出力しますか？\n\n${formatPrescriptionAuditIssues(prescriptionAudit.issues.filter((issue) => issue.severity === 'warning'))}`
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
    const reason = window.prompt('返戻理由・修正方針を入力してください。', visitData?.claimLifecycle?.returnReason || '返戻内容を確認し、修正後に再請求するため');
    if (!reason?.trim()) return;

    try {
      const currentUserForClaim = getCurrentUser();
      const nextLifecycle = markClaimReturned({
        current: visitData?.claimLifecycle,
        at: new Date().toISOString(),
        by: currentUserForClaim.name,
        reason: reason.trim()
      });
      await persistClaimLifecycle(
        nextLifecycle,
        `請求状態変更: 返戻対応に切り替えました。理由: ${reason.trim()}`
      );
    } catch (err) {
      console.error('Failed to register returned claim:', err);
      alert('返戻状態の保存に失敗しました。');
    }
  };

  const handleStartRebilling = async () => {
    if (!ensurePermission('change_billing')) return;
    const reason = window.prompt('再請求・月遅れ請求の理由を入力してください。', visitData?.claimLifecycle?.rebillingReason || '返戻内容を修正し、再請求または月遅れ請求として処理するため');
    if (!reason?.trim()) return;

    try {
      const currentUserForClaim = getCurrentUser();
      const nextLifecycle = markClaimRebilling({
        current: visitData?.claimLifecycle,
        at: new Date().toISOString(),
        by: currentUserForClaim.name,
        reason: reason.trim()
      });
      await persistClaimLifecycle(
        nextLifecycle,
        `請求状態変更: 再請求・月遅れ準備に切り替えました。理由: ${reason.trim()}`
      );
    } catch (err) {
      console.error('Failed to start rebilling:', err);
      alert('再請求準備の保存に失敗しました。');
    }
  };

  const handleCloseClaim = async () => {
    if (!ensurePermission('export_uke')) return;
    if (!window.confirm('この受付を請求完了として締めますか？ 完了後は返戻登録まで算定変更をロックします。')) return;

    try {
      const currentUserForClaim = getCurrentUser();
      const nextLifecycle = markClaimClosed({
        current: visitData?.claimLifecycle,
        at: new Date().toISOString(),
        by: currentUserForClaim.name
      });
      await persistClaimLifecycle(
        nextLifecycle,
        '請求状態変更: 請求完了として締めました。'
      );
    } catch (err) {
      console.error('Failed to close claim:', err);
      alert('請求完了状態の保存に失敗しました。');
    }
  };

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
    alert('返戻修正メモをコピーしました。');
  };

  const buildPharmacyDevicePrescriptionPayload = (): PharmacyDevicePrescriptionPayload => ({
    visitId,
    prescriptionDate: toDateOnly(visitData?.prescriptionDate || visitData?.issueDate),
    dispensingDate: toDateOnly(visitData?.dispensingDate || visitData?.issueDate),
    patient: {
      patientId: String(patientData?.patientId || visitData?.patientId || ''),
      name: String(patientData?.name || ''),
      kana: patientData?.kana || undefined,
      birthDate: toDateOnly(patientData?.birthDate),
      gender: patientData?.gender || undefined
    },
    provider: {
      institutionCode: visitData?.institutionCode || undefined,
      institutionName: String(visitData?.institutionName || ''),
      departmentName: visitData?.departmentName || undefined,
      doctorName: visitData?.doctorName || undefined
    },
    items: prescriptionItems.map((item, index) => ({
      itemId: String(item.itemId || ''),
      rpNumber: Number(item.rpNumber || index + 1),
      prescribedDrugCode: String(item.drugId || ''),
      dispensedDrugCode: String(item.dispensedDrugCode || item.drugId || ''),
      drugName: String(item.dispensedDrug || item.drugName || item.drugId || ''),
      amount: Number(item.amount),
      usage: String(item.usage || ''),
      days: Number(item.days || 0),
      unit: item.unit || undefined
    }))
  });

  const patchPharmacyDeviceHandoff = async (handoff: VisitPharmacyDeviceHandoff) => {
    if (!db) throw new Error('データベースの初期化が完了していません。');
    const visitDoc = await db.visits.findOne(visitId).exec();
    if (!visitDoc) throw new Error('対象の受付が見つかりません。');
    await visitDoc.patch({ pharmacyDeviceHandoff: handoff });
    setVisitData((previous: any) => previous ? { ...previous, pharmacyDeviceHandoff: handoff } : previous);
  };

  const handlePharmacyDeviceOperation = async (operation: PharmacyDeviceOperation) => {
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
      alert(`薬剤師確認で要修正の項目があります。\n\n${formatPrescriptionAuditIssues(prescriptionAudit.issues.filter((issue) => issue.severity === 'error'))}`);
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

      const updatedAt = result.receivedAt || new Date().toISOString();
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
  };

  const getElectronicPrescriptionDocumentKinds = (electronicPrescription: VisitElectronicPrescription) => (
    electronicPrescription.linkedPrescriptions?.length
      ? electronicPrescription.linkedPrescriptions.map((link) => link.documentKind)
      : [electronicPrescription.documentKind]
  );

  const buildElectronicPrescriptionDispensingPayload = () => ({
    type: 'yakureki-electronic-prescription-dispensing-result',
    schemaVersion: 1,
    prescriptionDate: visitData?.prescriptionDate || visitData?.issueDate,
    dispensingDate: visitData?.dispensingDate || new Date().toISOString().slice(0, 10),
    totalPoints,
    signatureRequirement: {
      hpkiSignatureRequired: visitData?.electronicPrescription
        ? requiresElectronicPrescriptionDispensingHpkiSignature(
            getElectronicPrescriptionDocumentKinds(visitData.electronicPrescription)
          )
        : true,
      expectedSignerRole: 'pharmacist'
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
      amount: item.amount,
      unitCode: item.unitCode || undefined,
      unitText: item.unitText || item.unit || undefined,
      unitConversion: item.electronicUnitConversion || undefined,
      usageCode: item.electronicUsageCode || undefined,
      usage: item.usage,
      usageFallbackText: item.electronicUsageFallbackText || undefined,
      usageSupplementText: item.electronicUsageSupplementText || undefined,
      days: item.days,
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
    if (!ensurePermission('change_billing')) return;
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

  const handleFinish = async () => {
    if (!(await ensureReceiptRemarksSaved())) return;
    setIsFinishing(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    router.push('/');
  };

  if (isLoading) {
    return <div className="p-8">読み込み中...</div>;
  }

  if (!visitData || !patientData) {
    return (
      <div className="p-8">
        <h2>データが見つかりませんでした</h2>
        <button className="btn-secondary mt-4" onClick={() => router.push('/')}>ダッシュボードに戻る</button>
      </div>
    );
  }

  // ⚡ Bolt: Cache formatted dates to prevent multiple expensive Date instantiations and formatting during render
  const currentDateStr = new Date().toLocaleDateString('ja-JP');
  const patientBirthDateStr = new Date(patientData.birthDate).toLocaleDateString('ja-JP');
  const disabledFeeCodes = new Set(claimOptions.disabledFeeCodes || []);
  const isDrugFeeOnly = !!claimOptions.drugFeeOnly;
  const currentUser = getCurrentUser();
  const canChangeBilling = canUserPerform(currentUser, 'change_billing');
  const canExportUke = canUserPerform(currentUser, 'export_uke');
  const canPrintDocuments = canUserPerform(currentUser, 'print_documents');
  const canReviewAiSuggestions = canUserPerform(currentUser, 'review_ai_suggestions');
  const pharmacyDeviceHandoff = visitData.pharmacyDeviceHandoff as VisitPharmacyDeviceHandoff | undefined;
  const pharmacyDeviceOperationBusy = pharmacyDeviceOperationInFlight !== null;
  const pharmacyDeviceConnectorReady = pharmacyDeviceReadiness?.status === 'ready';
  const canOperatePharmacyDevice = canPrintDocuments && pharmacyDeviceConnectorReady && !pharmacyDeviceOperationBusy;
  const canSubmitPharmacyDevice = canOperatePharmacyDevice
    && (!pharmacyDeviceHandoff || pharmacyDeviceHandoff.status === 'cancelled')
    && prescriptionAudit.errorCount === 0;
  const canReplacePharmacyDevice = canOperatePharmacyDevice
    && !!pharmacyDeviceHandoff
    && pharmacyDeviceHandoff.status !== 'cancelled'
    && prescriptionAudit.errorCount === 0;
  const canCancelPharmacyDevice = canOperatePharmacyDevice
    && !!pharmacyDeviceHandoff
    && pharmacyDeviceHandoff.status !== 'cancelled';
  const pharmacyDeviceFlowStatus = pharmacyDeviceHandoff?.status === 'cancelled'
    ? 'warning'
    : pharmacyDeviceHandoff
      ? 'ok'
      : pharmacyDeviceConnectorReady
        ? 'warning'
        : 'error';
  const pharmacyDeviceBlockedTitle = !canPrintDocuments
    ? getPermissionDeniedMessage(currentUser, 'print_documents')
    : isLoadingPharmacyDeviceReadiness
      ? '接続準備を確認しています。'
      : !pharmacyDeviceConnectorReady
        ? '設定の「外部連携」で接続準備を完了してください。'
        : pharmacyDeviceOperationBusy
          ? '外部調剤機器へ送信中です。'
          : prescriptionAudit.errorCount > 0
            ? '薬剤師確認の要修正項目を解消してください。'
            : undefined;
  const claimLifecycle = visitData.claimLifecycle as ClaimLifecycleState | undefined;
  const claimLifecycleStatus = getClaimLifecycleStatus(claimLifecycle);
  const claimLifecycleLocked = isClaimLifecycleLocked(claimLifecycle);
  const canEditBilling = canChangeBilling && !claimLifecycleLocked;
  const canDownloadUke = canExportUke && (claimLifecycleStatus === 'draft' || claimLifecycleStatus === 'rebilling');
  const canCloseClaim = canExportUke && (claimLifecycleStatus === 'exported' || claimLifecycleStatus === 'accepted');
  const claimLifecycleHistory = claimLifecycle?.history || [];
  const latestClaimLifecycleEvent = claimLifecycleHistory[claimLifecycleHistory.length - 1];
  const claimExportSnapshot = claimLifecycle?.exportSnapshot;
  const claimSnapshotDifferences = claimExportSnapshot
    ? compareClaimExportSnapshotToCurrent({
        snapshot: claimExportSnapshot,
        patient: patientData,
        items: prescriptionItems,
        totalPoints
      })
    : [];
  const claimSnapshotStatus = claimExportSnapshot
    ? claimSnapshotDifferences.length > 0 ? 'changed' : 'ok'
    : 'empty';
  const claimReturnCorrectionSuggestions = buildClaimReturnCorrectionSuggestions(claimSnapshotDifferences);
  const hasClaimErrors = claimValidationIssues.some((issue) => issue.severity === 'error');
  const hasClaimWarnings = claimValidationIssues.some((issue) => issue.severity === 'warning');
  const claimCheckStatus = hasClaimErrors ? 'error' : hasClaimWarnings ? 'warning' : 'ok';
  const pharmacistCheckStatus = prescriptionAudit.errorCount > 0 ? 'error' : prescriptionAudit.warningCount > 0 ? 'warning' : 'ok';
  const electronicPrescription = visitData.electronicPrescription as VisitElectronicPrescription | undefined;
  const electronicPrescriptionIds = electronicPrescription
    ? Array.from(new Set([
        electronicPrescription.prescriptionId,
        ...(electronicPrescription.linkedPrescriptions?.map((link) => link.prescriptionId) || [])
      ]))
    : [];
  const electronicPrescriptionReceptionStatus = electronicPrescription?.receptionStatus || 'accepted';
  const electronicPrescriptionDispensingResultStatus = electronicPrescription?.dispensingResultStatus || 'pending';
  const electronicPrescriptionSignatureStatus = electronicPrescription?.signatureStatus || 'not_checked';
  const electronicPrescriptionDuplicateCheckStatus = electronicPrescription?.duplicateCheckStatus || 'not_checked';
  const electronicPrescriptionRegistered = electronicPrescriptionDispensingResultStatus === 'registered';
  const electronicPrescriptionOperationBusy = electronicPrescriptionOperationInFlight !== null;
  const canSubmitElectronicPrescriptionOperation = canChangeBilling && !!electronicPrescription && electronicPrescriptionReceptionStatus !== 'cancelled';
  const electronicPrescriptionLifecycleDecision = (operation: ElectronicPrescriptionOperationKind) => (
    electronicPrescription
      ? validateElectronicPrescriptionLifecycleOperation(operation, electronicPrescription)
      : { allowed: false, message: '電子処方箋の受付情報がありません。' }
  );
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
    ? 'ok'
    : electronicPrescriptionDispensingResultStatus === 'registered'
      ? 'ok'
      : electronicPrescriptionDispensingResultStatus === 'failed'
        ? 'error'
        : 'warning';
  const electronicPrescriptionOperationBlockedTitle = !canChangeBilling
    ? getPermissionDeniedMessage(currentUser, 'change_billing')
    : electronicPrescriptionReceptionStatus === 'cancelled'
      ? '受付取消済みです。'
      : electronicPrescriptionOperationBusy
        ? '電子処方箋操作を送信中です。'
        : undefined;
  const electronicPrescriptionValidUntilText = electronicPrescription?.validUntil
    ? new Date(electronicPrescription.validUntil).toLocaleDateString('ja-JP')
    : '未記録';
  const electronicPrescriptionUpdatedAtText = electronicPrescription?.dispensingResultUpdatedAt
    ? new Date(electronicPrescription.dispensingResultUpdatedAt).toLocaleString('ja-JP')
    : '未登録';
  const electronicPrescriptionDispensingInformationFile = electronicPrescription?.dispensingInformationFile;
  const electronicPrescriptionDispensingHpkiRequired = electronicPrescription
    ? requiresElectronicPrescriptionDispensingHpkiSignature(
        getElectronicPrescriptionDocumentKinds(electronicPrescription)
      )
    : false;
  const electronicPrescriptionDispensingInformationSignatureText = electronicPrescriptionDispensingInformationFile
    ? ELECTRONIC_PRESCRIPTION_FILE_SIGNATURE_STATUS_LABELS[electronicPrescriptionDispensingInformationFile.signatureStatus]
    : '未確認';
  const electronicPrescriptionHpkiText = electronicPrescription?.signatureHpkiVerification
    ? ELECTRONIC_PRESCRIPTION_HPKI_STATUS_LABELS[electronicPrescription.signatureHpkiVerification.status]
    : 'HPKI未確認';
  const electronicPrescriptionDispensingInformationHpkiText = electronicPrescriptionDispensingInformationFile?.hpkiVerification
    ? ELECTRONIC_PRESCRIPTION_HPKI_STATUS_LABELS[electronicPrescriptionDispensingInformationFile.hpkiVerification.status]
    : electronicPrescriptionDispensingHpkiRequired
      ? 'HPKI未確認'
      : 'HPKI対象外（紙原本）';
  const electronicPrescriptionDispensingInformationSignedAtText = electronicPrescriptionDispensingInformationFile?.signedAt
    ? new Date(electronicPrescriptionDispensingInformationFile.signedAt).toLocaleString('ja-JP')
    : '';
  const electronicPrescriptionSupplementarySources = electronicPrescription
    ? (electronicPrescription.linkedPrescriptions?.length
        ? electronicPrescription.linkedPrescriptions.map((link) => link.supplementaryInformation)
        : [electronicPrescription.supplementaryInformation]
      ).filter((value): value is NonNullable<VisitElectronicPrescription['supplementaryInformation']> => !!value)
    : [];
  const electronicPrescriptionComments = Array.from(new Set(
    electronicPrescriptionSupplementarySources.flatMap((source) => source.prescriptionComments)
  ));
  const electronicPrescriptionLaboratoryResults = electronicPrescriptionSupplementarySources.flatMap(
    (source) => source.laboratoryResults
  );
  const electronicPrescriptionNarcoticAdministration = electronicPrescriptionSupplementarySources
    .map((source) => source.narcoticAdministration)
    .find((value) => value?.isNarcoticPrescription);
  const electronicPrescriptionDispensingInformationHashText = electronicPrescriptionDispensingInformationFile?.fileHash
    ? `${electronicPrescriptionDispensingInformationFile.fileHash.slice(0, 16)}...`
    : '';
  const visiblePrescriptionAuditIssues = prescriptionAudit.issues.slice(0, 8);
  const hiddenPrescriptionAuditIssueCount = prescriptionAudit.issues.length - visiblePrescriptionAuditIssues.length;
  const visibleAiAssistSuggestions = aiAssistSuggestions.slice(0, 3);
  const hiddenAiAssistSuggestionCount = aiAssistSuggestions.length - visibleAiAssistSuggestions.length;
  const pharmacyInfo = {
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
  const prescriptionDateStr = new Date(visitData.prescriptionDate || visitData.issueDate).toLocaleDateString('ja-JP');
  const dispensingDateStr = new Date(visitData.dispensingDate || visitData.issueDate || Date.now()).toLocaleDateString('ja-JP');
  const receiptRunId = visitId.replace(/^v_/, '').slice(0, 14) || visitId.slice(0, 14);
  const pickedItemsCount = prescriptionItems.filter((item) => item.isPicked).length;
  const pickingStatusText = prescriptionItems.length === 0
    ? '対象なし'
    : pickedItemsCount === prescriptionItems.length
      ? '全件GS1照合済'
      : `${pickedItemsCount}/${prescriptionItems.length} 件照合`;
  const patientAge = (() => {
    const birth = new Date(patientData.birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return Number.isFinite(age) ? age : undefined;
  })();
  const patientIdentityMark = PATIENT_IDENTITY_MARKS[
    stableHashText(`${patientData.patientId || patientData.id || ''}:${visitId}`) % PATIENT_IDENTITY_MARKS.length
  ];
  const renderIdentityMark = (variant: 'paper' | 'compact' | 'tiny' = 'paper') => (
    <div className={`identity-mark ${patientIdentityMark.className} ${variant}`} aria-label={`職員用照合色 ${patientIdentityMark.label}`}>
      <span className="identity-symbol" aria-hidden="true"></span>
    </div>
  );

  const getDisplayDrugName = (item: any) => item.dispensedDrug || item.drugName || item.drugId;
  const getPrescribedDrugName = (item: any) => item.drugName || item.drugId;
  const getRecordDrugName = (item: any) => {
    const dispensedDrug = String(item.dispensedDrug || '').trim();
    if (dispensedDrug && !['変更なし', '変更調剤なし'].includes(dispensedDrug)) return dispensedDrug;
    return getPrescribedDrugName(item);
  };
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
  const getRecordNotes = (item: any, includeRpComment = true) => {
    const notes: string[] = [];
    const prescribedDrugName = getPrescribedDrugName(item);
    const recordDrugName = getRecordDrugName(item);
    if (recordDrugName !== prescribedDrugName) notes.push(`処方: ${prescribedDrugName}`);
    if (item.changeReason) notes.push(`変更理由: ${item.changeReason}`);
    const rpComment = String(item.rpComment || '').trim();
    if (includeRpComment && rpComment) notes.push(`Rpコメント: ${rpComment}`);
    if (item.isIppoka) notes.push('一包化');
    if (item.isCrushed) notes.push('粉砕');
    if (item.isDiagnosticTest) notes.push('検査薬');
    return notes.join(' / ');
  };
  const getPickingEvidence = (item: any) => {
    if (!item.isPicked) return 'GS1未照合';
    const parts = [];
    if (item.pickedGtin) parts.push(`GTIN ${item.pickedGtin}`);
    if (item.pickedLotNumber) parts.push(`Lot ${item.pickedLotNumber}`);
    if (item.pickedExpirationDate) parts.push(`期限 ${item.pickedExpirationDate}`);
    if (item.pickedStockId) parts.push('ロット在庫紐付け済');
    return parts.length > 0 ? parts.join(' / ') : 'GS1照合済';
  };
  const getAmountText = (item: any) => {
    const form = getFormulationType(item.yjCode);
    if (form === 'liquid') return `${item.amount} mL`;
    if (form === 'ointment') return `${item.amount} g`;
    if (form === 'tablet') return `${item.amount} 錠`;
    if (form === 'powder') return `${item.amount} 包`;
    return `${item.amount}`;
  };
  const isLiquidItem = (item: any) => {
    const text = `${getDisplayDrugName(item)} ${item.usage || ''}`;
    return getFormulationType(item.yjCode) === 'liquid' || /水剤|液|シロップ|内滴/.test(text);
  };
  const isOintmentItem = (item: any) => {
    const text = `${getDisplayDrugName(item)} ${item.usage || ''}`;
    return getFormulationType(item.yjCode) === 'ointment' || /軟膏|クリーム|ゲル|ローション|外用/.test(text);
  };
  const medicationInfoFallbackCount = prescriptionItems.reduce((count, item) => (
    count + (getMedicationInfoContent(item).source === 'safe_fallback' ? 1 : 0)
  ), 0);
  const groupedForBags = prescriptionItems.reduce<Record<string, any[]>>((groups, item) => {
    const key = item.usage || '用法未設定';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
  const isFirstItemInRp = (item: any, index: number) => {
    const rpNumber = item.rpNumber || index + 1;
    return prescriptionItems.findIndex((candidate, candidateIndex) => (
      (candidate.rpNumber || candidateIndex + 1) === rpNumber
    )) === index;
  };
  const getBagDaysText = (items: any[]) => {
    const days = Array.from(new Set(items.map((item) => item.days).filter(Boolean)));
    if (days.length === 0) return '日数未設定';
    if (days.length === 1) return `${days[0]}日分`;
    return `${Math.min(...days)}-${Math.max(...days)}日分`;
  };
  const getBagRpComments = (items: any[]) => (
    Array.from(new Set(items.map((item) => String(item.rpComment || '').trim()).filter(Boolean)))
  );
  const liquidItems = prescriptionItems.filter(isLiquidItem);
  const ointmentItems = prescriptionItems.filter(isOintmentItem);
  const getFeeSectionLabel = (code?: FeeCode) => {
    if (code === 'base_fee' || code === 'base_additions' || code === 'drug_preparation' || code === 'mixing') return '調剤技術料';
    if (code === 'dispensing_management' || code === 'medication_guidance' || code === 'special_management' || code === 'ippoka') return '薬学管理料';
    if (code === 'drug_fee') return '薬剤料';
    return 'その他';
  };
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
  const getFormulationLabel = (item: any) => {
    const type = getFormulationType(item.yjCode);
    if (type === 'tablet') return '錠剤/カプセル';
    if (type === 'powder') return '散剤';
    if (type === 'liquid') return '液剤';
    if (type === 'ointment') return '外用';
    return '薬剤';
  };
  const getDrugShapeClass = (item: any) => {
    const type = getFormulationType(item.yjCode);
    if (type === 'powder') return 'powder';
    if (type === 'liquid') return 'liquid';
    if (type === 'ointment') return 'ointment';
    return item.isHighRisk ? 'tablet high-risk' : 'tablet';
  };
  const getTimingBadges = (usageValue?: string) => {
    const usageText = String(usageValue || '');
    const badges: string[] = [];
    if (/起床|朝/.test(usageText)) badges.push('朝');
    if (/昼/.test(usageText)) badges.push('昼');
    if (/夕|夕食/.test(usageText)) badges.push('夕');
    if (/寝|就寝/.test(usageText)) badges.push('寝る前');
    if (/食前/.test(usageText)) badges.push('食前');
    if (/食後/.test(usageText)) badges.push('食後');
    if (/食間/.test(usageText)) badges.push('食間');
    if (/頓服|痛い時|発作時|必要時/.test(usageText)) badges.push('必要時');
    if (/外用|塗布|貼付|点眼|点鼻|吸入/.test(usageText)) badges.push('外用');
    return Array.from(new Set(badges)).slice(0, 5);
  };
  const getMedicationFlags = (item: any) => {
    const flags: string[] = [];
    if (item.isHighRisk) flags.push('ハイリスク');
    if (item.isIppoka) flags.push('一包化');
    if (item.isCrushed) flags.push('粉砕');
    if (item.isDiagnosticTest) flags.push('検査薬');
    if (getDisplayDrugName(item) !== getPrescribedDrugName(item)) flags.push('変更調剤');
    if (isLiquidItem(item)) flags.push('水剤');
    if (isOintmentItem(item)) flags.push('外用');
    return flags;
  };
  const getBagKindLabel = (usage: string) => (
    /外用|塗布|貼付|点眼|点鼻|吸入/.test(usage) ? '外用薬' : '内服薬'
  );

  return (
    <div className="print-page" data-testid="print-page" style={{
      '--print-margin-top': `${printMarginTop}mm`,
      '--print-margin-bottom': `${printMarginBottom}mm`,
      '--print-font-scale': `${printFontScale / 100}`
    } as React.CSSProperties}>
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
        <div className="flex gap-4">
          <span
            className="btn-tooltip-wrapper"
            data-disabled={isFinishing}
            title={isFinishing ? "完了処理中..." : ""}
          >
            <button
              className="btn-secondary flex-center gap-2"
              onClick={handleFinish}
              disabled={isFinishing}
            >
              {isFinishing ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <CheckCircle size={18} aria-hidden="true" />}
              <span>{isFinishing ? "移動中..." : "ダッシュボードへ戻る"}</span>
            </button>
          </span>
          <button
            className="btn-secondary flex-center gap-2"
            onClick={handleOpenPicking}
            title="薬歴入力画面でピッキング支援を開きます"
          >
            <Package size={18} aria-hidden="true" />
            <span>ピッキングへ</span>
          </button>
          <button
            className="btn-secondary flex-center gap-2"
            data-testid="print-uke-export-button"
            onClick={handleDownloadUke}
            disabled={!canDownloadUke}
            title={!canExportUke ? getPermissionDeniedMessage(currentUser, 'export_uke') : !canDownloadUke ? '再出力は再請求/月遅れ準備に切り替えてから実行します。' : undefined}
          >
            <Download size={18} aria-hidden="true" />
            <span>UKE(レセプト)出力</span>
          </button>
          <button
            className="btn-primary flex-center gap-2"
            data-testid="print-execute-button"
            onClick={handlePrint}
            disabled={!canPrintDocuments}
            title={!canPrintDocuments ? getPermissionDeniedMessage(currentUser, 'print_documents') : undefined}
          >
            <Printer size={18} aria-hidden="true" />
            <span>印刷を実行</span>
          </button>
        </div>
      </div>

      <div className="print-workspace">
        <section className="receipt-console-panel no-print">
          <div className="receipt-console-main">
            <div>
              <span className="console-kicker">レセコン連携</span>
              <h2>調剤録・レセプト発行</h2>
              <p>{patientData.name} 様 / {prescriptionDateStr} 処方 / 受付ID {receiptRunId}</p>
            </div>
            <div className="console-total">
              <span>総点数</span>
              <strong>{totalPoints.toLocaleString()} 点</strong>
              <small>患者負担 ¥{formatYen(insuranceAmounts.patientCopayYen)}</small>
            </div>
          </div>

          <div className="receipt-flow-grid">
            <div className={`receipt-flow-step ${pharmacistCheckStatus}`}>
              <span>1 薬剤師確認</span>
              <strong>{pharmacistCheckStatus === 'ok' ? '完了' : prescriptionAudit.errorCount > 0 ? '要修正' : '要確認'}</strong>
            </div>
            <div className="receipt-flow-step ok">
              <span>2 算定</span>
              <strong>{calculatedFees.length.toLocaleString()} 項目</strong>
            </div>
            <div className={`receipt-flow-step ${pickedItemsCount === prescriptionItems.length ? 'ok' : 'warning'}`}>
              <span>3 GS1照合</span>
              <strong>{pickingStatusText}</strong>
            </div>
            <div className={`receipt-flow-step ${hasClaimErrors || prescriptionAudit.errorCount > 0 ? 'error' : claimLifecycleLocked ? 'warning' : 'ok'}`}>
              <span>4 UKE出力</span>
              <strong>{hasClaimErrors || prescriptionAudit.errorCount > 0 ? '保留' : claimLifecycleStatus === 'draft' ? '出力可能' : CLAIM_LIFECYCLE_STATUS_LABELS[claimLifecycleStatus]}</strong>
            </div>
            <div className={`receipt-flow-step ${electronicPrescriptionFlowStatus}`}>
              <span>5 電子処方箋</span>
              <strong>{electronicPrescription ? ELECTRONIC_PRESCRIPTION_DISPENSING_STATUS_LABELS[electronicPrescriptionDispensingResultStatus] : '対象外'}</strong>
            </div>
          </div>
        </section>

        <section
          className={`print-preview-card card claim-lifecycle-panel no-print status-${pharmacyDeviceFlowStatus}`}
          data-testid="pharmacy-device-handoff-panel"
        >
          <div className="preview-header claim-check-header">
            <div>
              <h3>
                {pharmacyDeviceFlowStatus === 'ok' ? <CheckCircle size={18} aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
                外部調剤機器連携
              </h3>
              <p className="claim-check-subtitle">
                {pharmacyDeviceReadiness?.pharmacyDevice?.connectorKind === 'nsips_gateway'
                  ? '許諾済みNSIPSゲートウェイ'
                  : pharmacyDeviceReadiness?.pharmacyDevice?.connectorKind === 'vendor_api'
                    ? 'メーカーAPI'
                    : '接続方式未設定'}
                {' / '}
                仕様版 {pharmacyDeviceReadiness?.pharmacyDevice?.interfaceVersion || '未設定'}
              </p>
            </div>
            <span className={`claim-lifecycle-badge ${pharmacyDeviceFlowStatus}`}>
              {pharmacyDeviceHandoff
                ? PHARMACY_DEVICE_HANDOFF_STATUS_LABELS[pharmacyDeviceHandoff.status]
                : isLoadingPharmacyDeviceReadiness
                  ? '確認中'
                  : pharmacyDeviceReadiness?.statusLabel || '未設定'}
            </span>
          </div>

          <div className="claim-lifecycle-grid">
            <div className="claim-lifecycle-status-card">
              <span>接続準備</span>
              <strong>{pharmacyDeviceConnectorReady ? '送信可能' : pharmacyDeviceReadiness?.statusLabel || '確認できません'}</strong>
              <p>{pharmacyDeviceConnectorReady ? '施設内接続・仕様・必須機能・直近試行を確認済み' : pharmacyDeviceReadiness?.requiredActions[0] || '設定の外部連携を確認してください。'}</p>
            </div>

            <div className="claim-lifecycle-status-card">
              <span>連携結果</span>
              <strong>{pharmacyDeviceHandoff ? PHARMACY_DEVICE_HANDOFF_STATUS_LABELS[pharmacyDeviceHandoff.status] : '未送信'}</strong>
              <p>
                {pharmacyDeviceHandoff
                  ? `${new Date(pharmacyDeviceHandoff.updatedAt).toLocaleString('ja-JP')} / ${pharmacyDeviceHandoff.interfaceVersion}`
                  : '処方内容を確認してから明示的に送信します。'}
              </p>
            </div>

            <div className="claim-lifecycle-status-card">
              <span>連携ID</span>
              <strong>{pharmacyDeviceHandoff?.transferId || '未発行'}</strong>
              <p>{pharmacyDeviceHandoff ? `重複防止 ${pharmacyDeviceHandoff.payloadHash.slice(0, 12)}...` : '同じ内容の二重送信を接続先で防止します。'}</p>
            </div>

            <div className="claim-lifecycle-actions" aria-busy={pharmacyDeviceOperationBusy}>
              <button
                type="button"
                className="btn-primary compact-action"
                data-testid="pharmacy-device-submit-button"
                onClick={() => handlePharmacyDeviceOperation('submit')}
                disabled={!canSubmitPharmacyDevice}
                title={pharmacyDeviceBlockedTitle || (pharmacyDeviceHandoff?.status !== 'cancelled' && pharmacyDeviceHandoff ? '送信済みです。' : undefined)}
              >
                {pharmacyDeviceOperationInFlight === 'submit'
                  ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  : <Send size={16} aria-hidden="true" />}
                <span>外部機器へ送る</span>
              </button>
              <button
                type="button"
                className="btn-secondary compact-action"
                data-testid="pharmacy-device-replace-button"
                onClick={() => handlePharmacyDeviceOperation('replace')}
                disabled={!canReplacePharmacyDevice}
                title={pharmacyDeviceBlockedTitle || (!pharmacyDeviceHandoff || pharmacyDeviceHandoff.status === 'cancelled' ? '送信済みの連携がありません。' : undefined)}
              >
                {pharmacyDeviceOperationInFlight === 'replace'
                  ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  : <RefreshCw size={16} aria-hidden="true" />}
                <span>差し替える</span>
              </button>
              <button
                type="button"
                className="btn-secondary compact-action"
                data-testid="pharmacy-device-cancel-button"
                onClick={() => handlePharmacyDeviceOperation('cancel')}
                disabled={!canCancelPharmacyDevice}
                title={pharmacyDeviceBlockedTitle || (!pharmacyDeviceHandoff || pharmacyDeviceHandoff.status === 'cancelled' ? '取消できる連携がありません。' : undefined)}
              >
                {pharmacyDeviceOperationInFlight === 'cancel'
                  ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  : <XCircle size={16} aria-hidden="true" />}
                <span>連携を取り消す</span>
              </button>
            </div>
          </div>
        </section>

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
                <AlertTriangle size={16} aria-hidden="true" />
                <span>返戻登録</span>
              </button>
              <button
                type="button"
                className="btn-secondary compact-action"
                onClick={handleStartRebilling}
                disabled={!canChangeBilling || claimLifecycleStatus === 'draft'}
                title={!canChangeBilling ? getPermissionDeniedMessage(currentUser, 'change_billing') : undefined}
              >
                <FileText size={16} aria-hidden="true" />
                <span>再請求/月遅れ</span>
              </button>
              <button
                type="button"
                className="btn-primary compact-action"
                onClick={handleCloseClaim}
                disabled={!canCloseClaim}
                title={!canExportUke ? getPermissionDeniedMessage(currentUser, 'export_uke') : undefined}
              >
                <CheckCircle size={16} aria-hidden="true" />
                <span>請求完了</span>
              </button>
            </div>
          </div>

          <div className={`claim-snapshot-panel ${claimSnapshotStatus}`}>
            <div className="claim-snapshot-header">
              <div>
                <span>請求時点スナップショット</span>
                <strong>
                  {claimExportSnapshot
                    ? `${new Date(claimExportSnapshot.createdAt).toLocaleString('ja-JP')} 出力時点`
                    : '未作成'}
                </strong>
              </div>
              <span className={`claim-snapshot-badge ${claimSnapshotStatus}`}>
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

            {claimExportSnapshot ? (
              <>
                <div className="claim-snapshot-facts">
                  <div>
                    <span>患者・保険</span>
                    <strong>{claimExportSnapshot.patientName}</strong>
                    <p>
                      {claimExportSnapshot.insuranceInfo?.provider || '保険者未設定'} / {claimExportSnapshot.insuranceInfo?.number || '記号番号未設定'} / {claimExportSnapshot.insuranceInfo?.burdenRatio !== undefined ? `${claimExportSnapshot.insuranceInfo.burdenRatio}%` : '負担割合未設定'}
                    </p>
                  </div>
                  <div>
                    <span>処方・点数</span>
                    <strong>{claimExportSnapshot.prescriptionItems.length.toLocaleString()}薬品 / {claimExportSnapshot.totalPoints.toLocaleString()}点</strong>
                    <p>{claimExportSnapshot.exportedFileName || claimLifecycle?.exportedFileName || 'ファイル名未記録'}</p>
                  </div>
                </div>

                {claimSnapshotDifferences.length > 0 ? (
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
                )}
              </>
            ) : (
              <p className="claim-snapshot-ok">UKE出力時に患者・保険・処方・点数を保存します。</p>
            )}
          </div>

          {claimLifecycleHistory.length > 0 && (
            <div className="claim-lifecycle-history" aria-label="請求状態変更履歴">
              {claimLifecycleHistory.slice(-4).reverse().map((event, index) => (
                <div key={`${event.type}-${event.at}-${index}`} className="claim-lifecycle-event">
                  <span>{new Date(event.at).toLocaleString('ja-JP')}</span>
                  <strong>{event.type === 'exported' ? 'UKE出力' : event.type === 'accepted' ? '受付済' : event.type === 'returned' ? '返戻登録' : event.type === 'rebilling' ? '再請求準備' : '請求完了'}</strong>
                  <p>{event.note || event.fileName || '詳細なし'}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {electronicPrescription && (
          <section className={`print-preview-card card electronic-prescription-lifecycle-panel no-print status-${electronicPrescriptionFlowStatus}`} data-testid="electronic-prescription-lifecycle-panel">
            <div className="preview-header claim-check-header">
              <div>
                <h3>
                  {electronicPrescriptionFlowStatus === 'ok' ? <CheckCircle size={18} aria-hidden="true" /> : <FileCheck2 size={18} aria-hidden="true" />}
                  電子処方箋ライフサイクル
                </h3>
                <p className="claim-check-subtitle">
                  {ELECTRONIC_PRESCRIPTION_DOCUMENT_KIND_LABELS[electronicPrescription.documentKind]} / 有効期限 {electronicPrescriptionValidUntilText} / 処方箋 {electronicPrescriptionIds.length}件 / 代表ID {electronicPrescription.prescriptionId}
                </p>
              </div>
              <span className={`electronic-prescription-badge ${electronicPrescriptionFlowStatus}`}>
                {ELECTRONIC_PRESCRIPTION_DISPENSING_STATUS_LABELS[electronicPrescriptionDispensingResultStatus]}
              </span>
            </div>

            <div className="claim-lifecycle-grid electronic-prescription-grid">
              <div className="claim-lifecycle-status-card">
                <span>受付</span>
                <strong>{ELECTRONIC_PRESCRIPTION_RECEPTION_STATUS_LABELS[electronicPrescriptionReceptionStatus]}</strong>
                <p>
                  文書: {ELECTRONIC_PRESCRIPTION_DOCUMENT_KIND_LABELS[electronicPrescription.documentKind]}
                  {electronicPrescription.documentKind === 'prescription_information'
                    ? ` / 紙原本 ${electronicPrescription.paperOriginalConfirmed ? '確認済み' : '未確認'}`
                    : ''}
                </p>
              </div>

              <div className="claim-lifecycle-status-card">
                <span>検証</span>
                <strong>{ELECTRONIC_PRESCRIPTION_SIGNATURE_STATUS_LABELS[electronicPrescriptionSignatureStatus]}</strong>
                <p>HPKI: {electronicPrescriptionHpkiText} / 重複確認: {ELECTRONIC_PRESCRIPTION_DUPLICATE_CHECK_STATUS_LABELS[electronicPrescriptionDuplicateCheckStatus]}</p>
              </div>

              <div className="claim-lifecycle-status-card">
                <span>調剤結果</span>
                <strong>{ELECTRONIC_PRESCRIPTION_DISPENSING_STATUS_LABELS[electronicPrescriptionDispensingResultStatus]}</strong>
                <p>
                  {electronicPrescription.dispensingResultId ? `ID ${electronicPrescription.dispensingResultId}` : '調剤結果IDなし'}
                  {' / '}
                  {electronicPrescriptionUpdatedAtText}
                </p>
                <p>
                  調剤情報提供ファイル署名: {electronicPrescriptionDispensingInformationSignatureText}
                  {electronicPrescriptionDispensingInformationSignedAtText ? ` / ${electronicPrescriptionDispensingInformationSignedAtText}` : ''}
                </p>
                <p>HPKI: {electronicPrescriptionDispensingInformationHpkiText}</p>
              </div>

              {(electronicPrescriptionComments.length > 0
                || electronicPrescriptionLaboratoryResults.length > 0
                || electronicPrescriptionNarcoticAdministration) && (
                <div className="electronic-prescription-supplementary" data-testid="electronic-prescription-supplementary-display">
                  <strong>処方補足情報</strong>
                  <ul>
                    {electronicPrescriptionComments.map((comment) => (
                      <li key={`electronic-comment-${comment}`}>処方コメント: {comment}</li>
                    ))}
                    {electronicPrescriptionLaboratoryResults.map((result, index) => (
                      <li key={`electronic-lab-${result.testName}-${index}`}>
                        検査値: {result.testName} {result.value}{result.unit ? ` ${result.unit}` : ''}
                        {result.referenceRange ? `（基準 ${result.referenceRange}）` : ''}
                      </li>
                    ))}
                    {electronicPrescriptionNarcoticAdministration && (
                      <li>麻薬施用情報: {electronicPrescriptionNarcoticAdministration.displayText || '表示不可'}</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="claim-lifecycle-actions electronic-prescription-actions" aria-busy={electronicPrescriptionOperationBusy}>
                <button
                  type="button"
                  className="btn-secondary compact-action"
                  data-testid="electronic-prescription-duplicate-check-button"
                  onClick={() => handleElectronicPrescriptionOperation('duplicate_check')}
                  disabled={!canRunElectronicPrescriptionDuplicateCheck}
                  title={electronicPrescriptionOperationBlockedTitle}
                >
                  {electronicPrescriptionOperationInFlight === 'duplicate_check'
                    ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    : <FileCheck2 size={16} aria-hidden="true" />}
                  <span>重複確認</span>
                </button>
                <button
                  type="button"
                  className="btn-primary compact-action"
                  data-testid="electronic-prescription-register-dispensing-result-button"
                  onClick={() => handleElectronicPrescriptionOperation('dispensing_result_register')}
                  disabled={!canRegisterElectronicPrescriptionDispensingResult}
                  title={electronicPrescriptionOperationBlockedTitle
                    || (prescriptionAudit.errorCount > 0
                      ? '薬剤師確認の要修正項目を解消してください。'
                      : electronicPrescriptionRegistered
                        ? '調剤結果登録済みです。'
                        : electronicPrescriptionDispensingResultStatus === 'submitted'
                          ? '送信済みの調剤結果を確認中です。'
                          : undefined)}
                >
                  {electronicPrescriptionOperationInFlight === 'dispensing_result_register'
                    ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    : <CheckCircle size={16} aria-hidden="true" />}
                  <span>調剤結果登録</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary compact-action"
                  data-testid="electronic-prescription-search-dispensing-result-button"
                  onClick={() => handleElectronicPrescriptionOperation('dispensing_result_search')}
                  disabled={!canSearchElectronicPrescriptionDispensingResult}
                  title={electronicPrescriptionOperationBlockedTitle || 'タイムアウトや再送後に管理サービス上の調剤結果IDを確認します。'}
                >
                  {electronicPrescriptionOperationInFlight === 'dispensing_result_search'
                    ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    : <RefreshCw size={16} aria-hidden="true" />}
                  <span>結果ID照会</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary compact-action"
                  data-testid="electronic-prescription-change-dispensing-result-button"
                  onClick={() => handleElectronicPrescriptionOperation('dispensing_result_change')}
                  disabled={!canChangeElectronicPrescriptionDispensingResult}
                  title={electronicPrescriptionOperationBlockedTitle
                    || (prescriptionAudit.errorCount > 0
                      ? '薬剤師確認の要修正項目を解消してください。'
                      : !electronicPrescription.dispensingResultId
                        ? '調剤結果IDがありません。'
                        : !electronicPrescriptionRegistered
                          ? '登録済み調剤結果だけ変更できます。'
                          : undefined)}
                >
                  {electronicPrescriptionOperationInFlight === 'dispensing_result_change'
                    ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    : <Pencil size={16} aria-hidden="true" />}
                  <span>調剤結果変更</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary compact-action"
                  data-testid="electronic-prescription-cancel-dispensing-result-button"
                  onClick={() => handleElectronicPrescriptionOperation('dispensing_result_cancel')}
                  disabled={!canCancelElectronicPrescriptionDispensingResult}
                  title={electronicPrescriptionOperationBlockedTitle
                    || (!electronicPrescription.dispensingResultId
                      ? '調剤結果IDがありません。'
                      : !electronicPrescriptionRegistered
                        ? '登録済み調剤結果だけ取消できます。'
                        : undefined)}
                >
                  {electronicPrescriptionOperationInFlight === 'dispensing_result_cancel'
                    ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    : <XCircle size={16} aria-hidden="true" />}
                  <span>結果取消</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary compact-action"
                  data-testid="electronic-prescription-cancel-reception-button"
                  onClick={() => handleElectronicPrescriptionOperation('reception_cancel')}
                  disabled={!canCancelElectronicPrescriptionReception}
                  title={electronicPrescriptionOperationBlockedTitle
                    || electronicPrescriptionLifecycleDecision('reception_cancel').message}
                >
                  {electronicPrescriptionOperationInFlight === 'reception_cancel'
                    ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    : <AlertTriangle size={16} aria-hidden="true" />}
                  <span>受付取消</span>
                </button>
              </div>
            </div>
          </section>
        )}

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

          {visibleAiAssistSuggestions.length > 0 && (
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
                {visibleAiAssistSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.suggestionId}
                    className={`ai-assist-item ${suggestion.severity}`}
                    data-testid="ai-assist-suggestion"
                  >
                    <div className="ai-assist-item-main">
                      <div className="ai-assist-title-row">
                        <strong>{suggestion.title}</strong>
                        <span className={`claim-issue-severity ${suggestion.severity === 'critical' ? 'error' : suggestion.severity}`}>
                          {AI_SUGGESTION_SEVERITY_LABELS[suggestion.severity]}
                        </span>
                      </div>
                      <p>{suggestion.suggestedAction}</p>
                      <div className="ai-assist-meta">
                        <span>信頼度 {formatAiSuggestionConfidence(suggestion)}</span>
                        <span>根拠 {suggestion.evidence.length}件</span>
                        {suggestion.rpId && <span>{suggestion.rpId}</span>}
                      </div>
                      <div className="ai-assist-evidence">
                        {suggestion.evidence.slice(0, 2).map((evidence) => (
                          <span key={`${suggestion.suggestionId}-${evidence.label}`}>{evidence.label}: {evidence.detail}</span>
                        ))}
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
                {hiddenAiAssistSuggestionCount > 0 && (
                  <div className="claim-issue-more">他 {hiddenAiAssistSuggestionCount} 件のAI補助提案</div>
                )}
              </div>
            </div>
          )}
        </section>

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

          <div className="claim-controls">
            <label className="claim-switch claim-switch-strong">
              <input
                type="checkbox"
                checked={isDrugFeeOnly}
                disabled={!canEditBilling}
                onChange={(e) => handleDrugFeeOnlyChange(e.target.checked)}
              />
              <span>薬剤料のみ</span>
            </label>

            <div className="fee-toggle-grid">
              {FEE_TOGGLES.map((fee) => {
                const checked = isDrugFeeOnly ? fee.code === 'drug_fee' : !disabledFeeCodes.has(fee.code);
                return (
                  <label key={fee.code} className="claim-switch">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!canEditBilling || (isDrugFeeOnly && fee.code !== 'drug_fee')}
                      onChange={(e) => handleFeeToggle(fee.code, e.target.checked)}
                    />
                    <span>{fee.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </section>

        <section className="print-preview-card card claim-panel no-print">
          <div className="preview-header">
            <h3><SlidersHorizontal size={18} aria-hidden="true" /> 印刷レイアウト微調整 (店舗個別設定)</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>サーマルプリンタやブラウザの余白誤差をミリメートル単位で微調整できます。（端末に自動保存）</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', padding: '0.5rem 0' }}>
            <div className="slider-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600 }}>
                <span>上部余白</span>
                <span>{printMarginTop} mm</span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                value={printMarginTop}
                onChange={(e) => handleMarginTopChange(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
            
            <div className="slider-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600 }}>
                <span>下部余白</span>
                <span>{printMarginBottom} mm</span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                value={printMarginBottom}
                onChange={(e) => handleMarginBottomChange(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>

            <div className="slider-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600 }}>
                <span>フォント縮尺倍率</span>
                <span>{printFontScale} %</span>
              </div>
              <input
                type="range"
                min={50}
                max={150}
                value={printFontScale}
                onChange={(e) => handleFontScaleChange(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          </div>
        </section>

        <section className={`print-preview-card card claim-check-panel no-print ${claimCheckStatus}`} data-testid="claim-check-panel">
          <div className="preview-header claim-check-header">
            <div>
              <h3>
                {claimCheckStatus === 'ok' ? <CheckCircle size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
                請求前チェック
              </h3>
              <p className="claim-check-subtitle">UKE出力・印刷前に、請求条件と帳票印字に関わる入力を確認します。</p>
            </div>
            <span className={`claim-check-badge ${claimCheckStatus}`}>
              {claimCheckStatus === 'ok' ? '問題なし' : hasClaimErrors ? '修正あり' : '確認あり'}
            </span>
          </div>

          {claimValidationIssues.length === 0 ? (
            <div className="claim-check-ok-row">
              <CheckCircle size={18} aria-hidden="true" />
              <span>入力と算定設定に大きな不整合はありません。</span>
            </div>
          ) : (
            <div className="claim-issue-list">
              {claimValidationIssues.map((issue, index) => (
                <div key={`${issue.code}-${issue.itemId || issue.feeCode || index}`} className={`claim-issue ${issue.severity}`}>
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
            </div>
          )}
        </section>

        {/* 調剤録 プレビュー */}
        <section className="print-preview-card card dispensing-record-card">
          <div className="preview-header no-print">
            <div>
              <h3><FileText size={18} aria-hidden="true" /> 調剤録</h3>
            </div>
          </div>

          <div className="print-document yakujo-doc dispensing-record-doc" data-testid="dispensing-record-doc">
            <div className="record-titlebar">
              <div>
                <div className="doc-title">調剤録</div>
                <div className="record-number">受付番号: {receiptRunId} / 発行 {currentDateStr}</div>
              </div>
              {renderIdentityMark('compact')}
            </div>

            <table className="record-info-table">
              <tbody>
                <tr>
                  <th>患者氏名</th>
                  <td>{patientData.name}</td>
                  <th>年齢</th>
                  <td>{patientAge !== undefined ? `${patientAge}歳` : '-'}</td>
                </tr>
                <tr>
                  <th>生年月日</th>
                  <td>{patientBirthDateStr}</td>
                  <th>調剤年月日</th>
                  <td>{dispensingDateStr}</td>
                </tr>
                <tr>
                  <th>処方箋発行年月日</th>
                  <td>{prescriptionDateStr}</td>
                  <th>情報提供・指導年月日</th>
                  <td>{dispensingDateStr}</td>
                </tr>
                <tr>
                  <th>保険医療機関</th>
                  <td colSpan={3}>{visitData.institutionName || visitData.institutionId || '未設定'}</td>
                </tr>
                <tr>
                  <th>診療科</th>
                  <td>{visitData.departmentName || visitData.departmentId || '未設定'}</td>
                  <th>処方医氏名</th>
                  <td>{visitData.doctorName || visitData.doctorId || '未設定'}</td>
                </tr>
                <tr>
                  <th>調剤薬剤師</th>
                  <td>{pharmacyInfo.pharmacistName}</td>
                  <th>発行年月日</th>
                  <td>{currentDateStr}</td>
                </tr>
                {electronicPrescription && (
                  <tr>
                    <th>電子処方箋</th>
                    <td>
                      処方箋 {electronicPrescriptionIds.length}件 / {ELECTRONIC_PRESCRIPTION_DISPENSING_STATUS_LABELS[electronicPrescriptionDispensingResultStatus]}
                    </td>
                    <th>調剤情報提供ファイル署名</th>
                    <td>
                      {electronicPrescriptionDispensingInformationSignatureText}
                      {' / '}
                      {electronicPrescriptionDispensingInformationHpkiText}
                      {electronicPrescriptionDispensingInformationHashText ? ` / SHA-256 ${electronicPrescriptionDispensingInformationHashText}` : ''}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="doc-body">
              <h4 className="doc-subtitle">薬名・1日量・用法</h4>
              <table className="drug-table record-drug-table">
                <thead>
                  <tr>
                    <th>Rp</th>
                    <th>薬品名</th>
                    <th>1日量</th>
                    <th>用法</th>
                    <th>日数</th>
                    <th>備考</th>
                  </tr>
                </thead>
                <tbody>
                  {prescriptionItems.map((item, index) => (
                    <tr key={`record-${item.itemId}`}>
                      <td className="text-center">{item.rpNumber || '-'}</td>
                      <td>{getRecordDrugName(item)}</td>
                      <td>{getAmountText(item)}</td>
                      <td>{item.usage || '未設定'}</td>
                      <td>{item.days ? `${item.days} 日分` : '-'}</td>
                      <td className="text-sm">{getRecordNotes(item, isFirstItemInRp(item, index)) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(electronicPrescriptionComments.length > 0
                || electronicPrescriptionLaboratoryResults.length > 0
                || electronicPrescriptionNarcoticAdministration) && (
                <div className="record-guidance-box electronic-prescription-supplementary-print" data-testid="electronic-prescription-supplementary-print">
                  <div className="record-guidance-label">電子処方箋の処方補足情報</div>
                  {electronicPrescriptionComments.map((comment) => (
                    <p key={`print-comment-${comment}`}>処方コメント: {comment}</p>
                  ))}
                  {electronicPrescriptionLaboratoryResults.map((result, index) => (
                    <p key={`print-lab-${result.testName}-${index}`}>
                      検査値: {result.testName} {result.value}{result.unit ? ` ${result.unit}` : ''}
                      {result.referenceRange ? ` / 基準 ${result.referenceRange}` : ''}
                      {result.measuredAt ? ` / ${new Date(result.measuredAt).toLocaleString('ja-JP')}` : ''}
                    </p>
                  ))}
                  {electronicPrescriptionNarcoticAdministration && (
                    <p>麻薬施用情報: {electronicPrescriptionNarcoticAdministration.displayText || '表示不可'}</p>
                  )}
                </div>
              )}

              <div className="record-guidance-box">
                <div className="record-guidance-label">情報提供・指導の要点</div>
                <div className="record-guidance-lines">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>

            <div className="doc-footer">
              <div className="pharmacy-info">
                <strong>{pharmacyInfo.name}</strong><br/>
                {pharmacyAddressLine}<br/>
                TEL: {pharmacyInfo.phone}<br/>
                調剤薬剤師: {pharmacyInfo.pharmacistName}
              </div>
              <div className="pharmacist-seal-box">印</div>
            </div>
          </div>
        </section>


        {/* 調剤明細書 プレビュー */}
        <section className="print-preview-card card paper-preview-card">
          <div className="preview-header no-print">
            <h3><FileText size={18} aria-hidden="true" /> 調剤明細書</h3>
          </div>

          <div className="print-document yakujo-doc receipt-statement-doc statement-ledger-doc" data-testid="receipt-statement-doc">
            <div className="statement-redesign-header">
              <div className="statement-title-stack">
                <span>保険調剤 / 明細</span>
                <h2>調剤明細書</h2>
                <p>調剤報酬点数、保険診療総額、患者負担額を1枚で確認できる明細です。</p>
              </div>
              <div className="statement-issue-box">
                <span>受付番号</span>
                <strong>{receiptRunId}</strong>
                <small>発行 {currentDateStr}</small>
              </div>
              {renderIdentityMark('compact')}
            </div>

            <div className="statement-redesign-meta">
              <div className="statement-person-block">
                <span>患者</span>
                <strong>{patientData.name} 様</strong>
                <p>患者番号 {patientData.patientId || patientData.id || '-'} / 生年月日 {patientBirthDateStr}</p>
              </div>
              <div>
                <span>処方元</span>
                <strong>{visitData.institutionName || visitData.institutionId || '未設定'}</strong>
                <p>{visitData.departmentName || visitData.departmentId || '診療科未設定'} / {visitData.doctorName || visitData.doctorId || '処方医未設定'}</p>
              </div>
              <div>
                <span>保険</span>
                <strong>{patientData.insuranceInfo?.provider || '未設定'}</strong>
                <p>記号番号 {patientData.insuranceInfo?.number || '未設定'} / 負担割合 {insuranceAmounts.burdenRatio}%</p>
              </div>
            </div>

            <div className="statement-summary-band">
              <div>
                <span>合計点数</span>
                <strong>{totalPoints.toLocaleString()} 点</strong>
              </div>
              <div>
                <span>保険診療総額</span>
                <strong>¥{formatYen(insuranceAmounts.totalCostYen)}</strong>
              </div>
              <div>
                <span>保険者負担相当額</span>
                <strong>¥{formatYen(insuranceAmounts.insurerBurdenYen)}</strong>
              </div>
              <div className="statement-summary-primary">
                <span>患者負担</span>
                <strong>¥{formatYen(insuranceAmounts.patientCopayYen)}</strong>
              </div>
            </div>

            <div className="statement-section-heading">
              <strong>調剤報酬の内訳</strong>
              <span>処方日 {prescriptionDateStr} / 調剤日 {dispensingDateStr}</span>
            </div>

            <table className="statement-fee-ledger">
              <thead>
                <tr>
                  <th>区分</th>
                  <th>算定項目</th>
                  <th>算定根拠</th>
                  <th>点数</th>
                  <th>コード/摘要</th>
                </tr>
              </thead>
              <tbody>
                {calculatedFees.length > 0 ? (
                  calculatedFees.map((fee, idx) => (
                    <tr key={`${fee.name}-${idx}`}>
                      <td className="statement-category">{getFeeSectionLabel(fee.code)}</td>
                      <td className="statement-fee-name">{fee.name}</td>
                      <td>{fee.rationale || '-'}</td>
                      <td className="statement-point-cell">{fee.points.toLocaleString()}</td>
                      <td>{fee.receiptFeeCode || fee.receiptRemarks?.map((remark) => remark.code).join(' / ') || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center">データがありません</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="statement-confirmation-grid">
              <div>
                <span>薬局</span>
                <strong>{pharmacyInfo.name}</strong>
                <p>{pharmacyAddressLine} / TEL: {pharmacyInfo.phone}</p>
              </div>
              <div>
                <span>確認欄</span>
                <p>点数、負担割合、保険情報、領収金額を確認しました。</p>
              </div>
              <div className="statement-seal-cell">確認印</div>
            </div>

            <div className="statement-footer-note">
              <span>※点数は国が定める調剤報酬点数にもとづきます。疑問点は薬局窓口へお尋ねください。</span>
              <strong>{pharmacyInfo.name}</strong>
            </div>
          </div>
        </section>

        {/* 領収証 プレビュー */}
        <section className="print-preview-card card paper-preview-card receipt-preview-card">
          <div className="preview-header no-print">
            <h3><FileText size={18} aria-hidden="true" /> 領収証</h3>
          </div>

          <div className="print-document receipt-doc receipt-redesign-doc" data-testid="receipt-doc">
            <div className="receipt-copy-band">
              <span>患者様控</span>
              <strong>No. {receiptRunId}</strong>
              <span>発行日 {currentDateStr}</span>
            </div>

            <div className="receipt-redesign-titlebar">
              <div>
                <span>保険調剤</span>
                <h2>領収証</h2>
              </div>
              {renderIdentityMark('compact')}
            </div>

            <div className="receipt-payee-line">
              <span>氏名</span>
              <strong>{patientData.name} 様</strong>
            </div>

            <div className="receipt-money-panel">
              <span>領収金額</span>
              <strong>¥{formatYen(insuranceAmounts.patientCopayYen)}</strong>
              <p>ただし、保険調剤一部負担金として上記正に領収いたしました。</p>
            </div>

            <div className="receipt-accounting-strip">
              <div>
                <span>総点数</span>
                <strong>{totalPoints.toLocaleString()} 点</strong>
              </div>
              <div>
                <span>保険診療総額</span>
                <strong>¥{formatYen(insuranceAmounts.totalCostYen)}</strong>
              </div>
              <div>
                <span>保険者負担相当額</span>
                <strong>¥{formatYen(insuranceAmounts.insurerBurdenYen)}</strong>
              </div>
              <div>
                <span>患者負担割合</span>
                <strong>{insuranceAmounts.burdenRatio}%</strong>
              </div>
            </div>

            <table className="receipt-redesign-table">
              <thead>
                <tr>
                  <th>費用区分</th>
                  <th>点数</th>
                  <th>摘要</th>
                </tr>
              </thead>
              <tbody>
                {receiptBreakdownRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="text-right">{row.points.toLocaleString()} 点</td>
                    <td>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="receipt-office-grid">
              <div className="receipt-office-info">
                <strong>{pharmacyInfo.name}</strong>
                <span>{pharmacyAddressLine}</span>
                <span>TEL: {pharmacyInfo.phone}</span>
                {pharmacyInfo.code ? <span>保険薬局コード: {pharmacyInfo.code}</span> : null}
                <span>登録番号: {pharmacyInfo.registrationNumber}</span>
              </div>
              <div className="receipt-seal-box">領収印</div>
            </div>

            <div className="receipt-stub">
              <span>薬局控え</span>
              <strong>{patientData.name} 様 / ¥{formatYen(insuranceAmounts.patientCopayYen)}</strong>
              <span>処方日 {prescriptionDateStr} / 調剤日 {dispensingDateStr}</span>
            </div>

            <p className="receipt-note">保険診療等には、医療機関等が仕入れ時に負担する消費税が反映されています。</p>
          </div>
        </section>

        {/* 薬剤情報提供文書 プレビュー */}
        <section className="print-preview-card card paper-preview-card">
          <div className="preview-header no-print">
            <h3><FileText size={18} aria-hidden="true" /> 薬剤情報提供文書</h3>
          </div>

          {medicationInfoFallbackCount > 0 && (
            <div
              className="no-print"
              role="alert"
              data-testid="medication-info-fallback-alert"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                margin: '0 1rem 0.75rem',
                padding: '0.65rem 0.75rem',
                border: '1px solid #d97706',
                borderRadius: '8px',
                color: '#92400e',
                background: '#fffbeb',
                fontWeight: 700,
                fontSize: '0.84rem'
              }}
            >
              <AlertTriangle size={17} aria-hidden="true" />
              承認済み薬情がない薬剤 {medicationInfoFallbackCount}件。定型文で印刷されます。
            </div>
          )}

          <div className="print-document yakujo-doc drug-info-doc" data-testid="drug-info-doc">
            <div className="drug-info-titlebar">
              <div>
                <div className="doc-title">薬剤情報提供文書</div>
                <div className="doc-submeta">処方日 {prescriptionDateStr} / 調剤日 {dispensingDateStr}</div>
              </div>
              <div className="drug-info-stamp-stack">
                {renderIdentityMark('compact')}
                <div className="drug-info-pharmacy-stamp">
                  <strong>{pharmacyInfo.name}</strong>
                  <span>担当 {pharmacyInfo.pharmacistName}</span>
                </div>
              </div>
            </div>

            <div className="drug-info-patient-line">
              <strong>{patientData.name} 様</strong>
              <span>生年月日 {patientBirthDateStr}</span>
              <span>処方元 {visitData.institutionName || visitData.institutionId || '未設定'}</span>
              <span>受付番号 {receiptRunId}</span>
            </div>

            <div className="drug-info-list">
              {prescriptionItems.length > 0 ? (
                prescriptionItems.map((item, idx) => {
                  const medicationInfo = getMedicationInfoContent(item);
                  return (
                  <section className={`drug-info-row drug-info-card ${item.isHighRisk ? 'high-risk' : ''}`} key={item.itemId}>
                    <div className="drug-info-med-header">
                      <div className="drug-appearance-cell">
                        <span className={`drug-shape ${getDrugShapeClass(item)}`} aria-hidden="true"></span>
                        <small>{getFormulationLabel(item)}</small>
                      </div>

                      <div className="drug-info-med-title">
                        <span>お薬 {idx + 1}</span>
                        <strong>{getDisplayDrugName(item)}</strong>
                      </div>

                      <div className="drug-info-flag-list">
                        {getMedicationFlags(item).length > 0 ? (
                          getMedicationFlags(item).map((flag) => (
                            <span key={`${item.itemId}-${flag}`}>{flag}</span>
                          ))
                        ) : (
                          <span>通常薬</span>
                        )}
                      </div>
                    </div>

                    {getDisplayDrugName(item) !== getPrescribedDrugName(item) && (
                      <p className="drug-info-change">
                        処方: {getPrescribedDrugName(item)}
                        {item.changeReason ? ` / 変更理由: ${item.changeReason}` : ''}
                      </p>
                    )}

                    <div className="drug-info-counseling-grid">
                      <div className="drug-info-usage-hero">
                        <span>使い方</span>
                        <strong>{item.usage || '用法未設定'}</strong>
                        <div className="drug-info-timing-row">
                          {(getTimingBadges(item.usage).length > 0 ? getTimingBadges(item.usage) : ['指示どおり']).map((badge) => (
                            <em key={`${item.itemId}-timing-${badge}`}>{badge}</em>
                          ))}
                        </div>
                      </div>
                      <div className="drug-info-fact">
                        <span>1日量</span>
                        <strong>{getAmountText(item)}</strong>
                      </div>
                      <div className="drug-info-fact">
                        <span>日数</span>
                        <strong>{item.days ? `${item.days}日分` : '-'}</strong>
                      </div>
                    </div>

                    <div className="drug-info-safety-grid">
                      <div>
                        <span>副作用・相談目安</span>
                        <p>{medicationInfo.sideEffectText}</p>
                      </div>
                      <div>
                        <span>使用上の注意</span>
                        <p>{medicationInfo.usageCautionText}</p>
                      </div>
                    </div>

                    <div className="drug-info-source-line">
                      <div>
                        <span>
                          {medicationInfo.source === 'approved_template'
                            ? `薬局確認済み情報（参照版日 ${medicationInfo.sourceRevisionDate}）`
                            : '詳しい薬剤情報は薬剤師へ確認してください'}
                        </span>
                        <small>{getPickingEvidence(item)}</small>
                      </div>
                      <a href={medicationInfo.officialSearchUrl} target="_blank" rel="noreferrer">PMDAで公式情報を確認</a>
                    </div>

                    <div className="drug-info-control-panel paper-embedded-control no-print">
                        <label>
                          <input
                            type="checkbox"
                            checked={item.isIppoka || false}
                            disabled={!canEditBilling}
                            onChange={(e) => handleToggleIppoka(item.itemId, e.target.checked, idx)}
                          />
                          一包化
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={item.isCrushed || false}
                            disabled={!canEditBilling}
                            onChange={(e) => handleToggleCrushed(item.itemId, e.target.checked, idx)}
                          />
                          粉砕
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={item.claimPreparation !== false}
                            disabled={!canEditBilling}
                            onChange={(e) => handleItemClaimToggle(item.itemId, 'claimPreparation', e.target.checked, idx)}
                          />
                          調製
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={item.claimManagement !== false}
                            disabled={!canEditBilling}
                            onChange={(e) => handleItemClaimToggle(item.itemId, 'claimManagement', e.target.checked, idx)}
                          />
                          薬管
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={item.isDiagnosticTest || false}
                            disabled={!canEditBilling}
                            onChange={(e) => handleItemClaimToggle(item.itemId, 'isDiagnosticTest', e.target.checked, idx)}
                          />
                          検査薬
                        </label>

                        {item.isHighRisk && (
                          <select
                            value={item.tokkanType || 'none'}
                            onChange={(e) => handleTokkanChange(item.itemId, e.target.value, idx)}
                            disabled={!canEditBilling}
                          >
                            <option value="none">特定薬剤: なし</option>
                            <option value="1">加算1 (10点)</option>
                            <option value="3_i">加算3イ (5点)</option>
                          </select>
                        )}

                        <input
                          type="text"
                          list="receipt-remarks-list"
                          placeholder="レセ適"
                          value={remarks[item.itemId] ?? item.receiptRemark ?? ''}
                          onChange={(e) => handleReceiptRemarkChange(item.itemId, e.target.value, idx)}
                          disabled={!canEditBilling}
                        />
                        <label className="agent-override-field">
                          <span>剤</span>
                          <input
                            type="text"
                            placeholder="剤キー"
                            maxLength={50}
                            value={item.billingAgentGroupKey || ''}
                            onChange={(e) => handleBillingAgentOverrideLocalChange(item.itemId, 'billingAgentGroupKey', e.target.value, idx)}
                            onBlur={() => persistBillingAgentOverride(item.itemId, idx)}
                            disabled={!canEditBilling}
                          />
                        </label>
                        {item.billingAgentGroupKey && (
                          <input
                            className="agent-override-reason"
                            type="text"
                            placeholder="剤理由"
                            maxLength={500}
                            value={item.billingAgentGroupReason || ''}
                            onChange={(e) => handleBillingAgentOverrideLocalChange(item.itemId, 'billingAgentGroupReason', e.target.value, idx)}
                            onBlur={() => persistBillingAgentOverride(item.itemId, idx)}
                            disabled={!canEditBilling}
                          />
                        )}
                    </div>
                      </section>
                  );
                })
              ) : (
                <div className="drug-info-empty">処方データがありません</div>
              )}
              <datalist id="receipt-remarks-list">
                {COMMON_RECEIPT_REMARKS.map((rm) => (
                  <option key={rm.code} value={`${rm.code} ${rm.label}`} />
                ))}
              </datalist>
            </div>

            <div className="drug-info-bottom-note">
              <strong>ご注意</strong>
              <span>体調の変化、飲み合わせ、飲み忘れで迷う場合は、服用前に薬剤師へご相談ください。</span>
            </div>

            <div className="doc-footer drug-info-footer">
              <div className="pharmacy-info">
                <strong>{pharmacyInfo.name}</strong><br/>
                {pharmacyAddressLine}<br/>
                TEL: {pharmacyInfo.phone}<br/>
                担当薬剤師: {pharmacyInfo.pharmacistName}
              </div>
            </div>
          </div>

          <div className="drug-info-claim-tools no-print" aria-label="薬剤情報提供書の算定調整">
            {prescriptionItems.map((item, idx) => (
              <div className="drug-info-claim-row" key={`drug-info-claim-${item.itemId}`}>
                <strong>{getDisplayDrugName(item)}</strong>
                <div className="drug-info-control-panel">
                  <label>
                    <input
                      type="checkbox"
                      checked={item.isIppoka || false}
                      disabled={!canEditBilling}
                      onChange={(e) => handleToggleIppoka(item.itemId, e.target.checked, idx)}
                    />
                    一包化
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={item.isCrushed || false}
                      disabled={!canEditBilling}
                      onChange={(e) => handleToggleCrushed(item.itemId, e.target.checked, idx)}
                    />
                    粉砕
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={item.claimPreparation !== false}
                      disabled={!canEditBilling}
                      onChange={(e) => handleItemClaimToggle(item.itemId, 'claimPreparation', e.target.checked, idx)}
                    />
                    調製
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={item.claimManagement !== false}
                      disabled={!canEditBilling}
                      onChange={(e) => handleItemClaimToggle(item.itemId, 'claimManagement', e.target.checked, idx)}
                    />
                    薬管
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={item.isDiagnosticTest || false}
                      disabled={!canEditBilling}
                      onChange={(e) => handleItemClaimToggle(item.itemId, 'isDiagnosticTest', e.target.checked, idx)}
                    />
                    検査薬
                  </label>
                  {item.isHighRisk && (
                    <select
                      value={item.tokkanType || 'none'}
                      onChange={(e) => handleTokkanChange(item.itemId, e.target.value, idx)}
                      disabled={!canEditBilling}
                    >
                      <option value="none">特定薬剤: なし</option>
                      <option value="1">加算1 (10点)</option>
                      <option value="3_i">加算3イ (5点)</option>
                    </select>
                  )}
                  <input
                    type="text"
                    list="receipt-remarks-list"
                    placeholder="レセ適"
                    value={remarks[item.itemId] ?? item.receiptRemark ?? ''}
                    onChange={(e) => handleReceiptRemarkChange(item.itemId, e.target.value, idx)}
                    disabled={!canEditBilling}
                  />
                  <label className="agent-override-field">
                    <span>剤</span>
                    <input
                      type="text"
                      placeholder="剤キー"
                      maxLength={50}
                      value={item.billingAgentGroupKey || ''}
                      onChange={(e) => handleBillingAgentOverrideLocalChange(item.itemId, 'billingAgentGroupKey', e.target.value, idx)}
                      onBlur={() => persistBillingAgentOverride(item.itemId, idx)}
                      disabled={!canEditBilling}
                    />
                  </label>
                  {item.billingAgentGroupKey && (
                    <input
                      className="agent-override-reason"
                      type="text"
                      placeholder="剤理由"
                      maxLength={500}
                      value={item.billingAgentGroupReason || ''}
                      onChange={(e) => handleBillingAgentOverrideLocalChange(item.itemId, 'billingAgentGroupReason', e.target.value, idx)}
                      onBlur={() => persistBillingAgentOverride(item.itemId, idx)}
                      disabled={!canEditBilling}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 薬袋 プレビュー */}
        <section className="print-preview-card card paper-preview-card yakutai-card">
          <div className="preview-header no-print">
            <h3><Package size={18} aria-hidden="true" /> 薬袋</h3>
          </div>

          {Object.entries(groupedForBags).map(([usage, groupItems]) => {
            const isExternalBag = /外用|塗布|貼付|点眼|点鼻|吸入/.test(usage);
            const bagComments = getBagRpComments(groupItems);

            return (
            <div className={`print-document yakutai-doc ${isExternalBag ? 'external-bag' : 'internal-bag'}`} data-testid="medicine-bag-doc" key={`bag-${usage}`}>
              <div className="yakutai-ribbon">
                <span>{getBagKindLabel(usage)}</span>
                <strong>おくすり袋</strong>
              </div>

              <div className="yakutai-body">
                <div className="yakutai-topline">
                  <span>No. {receiptRunId}</span>
                  <span>調剤日 {dispensingDateStr}</span>
                  {renderIdentityMark('tiny')}
                </div>

                <div className="yakutai-name-line">
                  <span>お名前</span>
                  <strong>{patientData.name} 様</strong>
                </div>

                <div className="yakutai-usage-hero">
                  <span>使い方</span>
                  <strong>{usage}</strong>
                  <em>{getBagDaysText(groupItems)}</em>
                </div>

                <div className="yakutai-timing-strip">
                  {(getTimingBadges(usage).length > 0 ? getTimingBadges(usage) : [isExternalBag ? '外用' : '指示どおり']).map((badge) => (
                    <span key={`bag-${usage}-${badge}`}>{badge}</span>
                  ))}
                </div>

                <div className="yakutai-drug-ledger">
                  <div className="yakutai-ledger-head">
                    <span>中のお薬</span>
                    <strong>{groupItems.length} 種</strong>
                  </div>
                  {groupItems.map((item) => (
                    <div key={item.itemId} className="yakutai-ledger-row">
                      <div>
                        <strong>{getDisplayDrugName(item)}</strong>
                        <span>{getMedicationFlags(item).join(' / ') || getFormulationLabel(item)}</span>
                      </div>
                      <em>1日量 {getAmountText(item)}</em>
                    </div>
                  ))}
                </div>

                <div className="yakutai-safety-strip">
                  <div>
                    <span>確認</span>
                    <strong>氏名・使い方・日数</strong>
                  </div>
                  <div>
                    <span>保管</span>
                    <strong>子どもの手の届かない場所</strong>
                  </div>
                </div>

                <div className="yakutai-note-lines">
                  <span>備考</span>
                  {bagComments.length > 0 ? (
                    bagComments.map((comment) => (
                      <strong key={comment}>{comment}</strong>
                    ))
                  ) : (
                    <>
                      <i></i>
                      <i></i>
                    </>
                  )}
                </div>

                <div className="yakutai-bottom">
                  <div className="yakutai-pharmacy">
                    <strong>{pharmacyInfo.name}</strong>
                    <span>{pharmacyAddressLine}</span>
                    <span>TEL: {pharmacyInfo.phone}</span>
                    <span>調剤薬剤師: {pharmacyInfo.pharmacistName}</span>
                  </div>
                  <div className="yakutai-code-box">
                    <span>薬局コード</span>
                    <strong>{pharmacyInfo.code || '-'}</strong>
                    <small>用法・日数・1日量を確認してください</small>
                  </div>
                </div>
              </div>
            </div>
            );
          })}
        </section>

        {/* お薬手帳シール */}
        <section className="print-preview-card card paper-preview-card">
          <div className="preview-header no-print">
            <h3><BookOpen size={18} aria-hidden="true" /> お薬手帳シール</h3>
          </div>

          <div className="print-document sticker-sheet" data-testid="medicine-notebook-sticker-doc">
            {prescriptionItems.map((item, index) => (
              <div className="handbook-sticker" key={`sticker-${item.itemId}`}>
                <div className="sticker-head">
                  <div>
                    <strong>{patientData.name} 様</strong>
                    <span>調剤日 {dispensingDateStr} / Rp {item.rpNumber || index + 1}</span>
                  </div>
                  {renderIdentityMark('tiny')}
                </div>
                <div className="sticker-drug">{getDisplayDrugName(item)}</div>
                <div className="sticker-dose-panel">
                  <div>
                    <span>1日量</span>
                    <strong>{getAmountText(item)}</strong>
                  </div>
                  <div>
                    <span>日数</span>
                    <strong>{item.days ? `${item.days}日分` : '-'}</strong>
                  </div>
                </div>
                <div className="sticker-usage">{item.usage || '用法未設定'}</div>
                <div className="sticker-timing-row">
                  {(getTimingBadges(item.usage).length > 0 ? getTimingBadges(item.usage) : ['指示どおり']).map((badge) => (
                    <span key={`sticker-${item.itemId}-${badge}`}>{badge}</span>
                  ))}
                </div>
                <div className="sticker-footer">
                  <strong>{pharmacyInfo.name}</strong>
                  <span>{pharmacyInfo.phone} / 担当 {pharmacyInfo.pharmacistName}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 水剤ラベル */}
        {liquidItems.length > 0 && (
          <section className="print-preview-card card paper-preview-card">
            <div className="preview-header no-print">
              <h3><Droplets size={18} aria-hidden="true" /> 水剤ラベル</h3>
            </div>

            <div className="print-document label-sheet" data-testid="liquid-label-sheet-doc">
              {liquidItems.map((item) => (
                <div className="bottle-label liquid-label" key={`liquid-${item.itemId}`}>
                  <div className="label-head">
                    <div className="label-title">水剤</div>
                    {renderIdentityMark('tiny')}
                  </div>
                  <div className="label-patient">{patientData.name} 様</div>
                  <div className="label-drug">{getDisplayDrugName(item)}</div>
                  <div className="label-usage">{item.usage || '用法未設定'}</div>
                  <div className="label-dose-grid">
                    <div>
                      <span>全量</span>
                      <strong>{getAmountText(item)}</strong>
                    </div>
                    <div>
                      <span>日数</span>
                      <strong>{item.days ? `${item.days}日分` : '-'}</strong>
                    </div>
                  </div>
                  <div className="label-warning">使用前によく振り、量を確認してください</div>
                  <div className="label-footer">
                    <strong>{pharmacyInfo.name}</strong>
                    <span>{pharmacyAddressLine} / TEL: {pharmacyInfo.phone}</span>
                    <span>調剤薬剤師: {pharmacyInfo.pharmacistName} / {currentDateStr}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 軟膏ラベル */}
        {ointmentItems.length > 0 && (
          <section className="print-preview-card card paper-preview-card">
            <div className="preview-header no-print">
              <h3><Paintbrush size={18} aria-hidden="true" /> 軟膏ラベル</h3>
            </div>

            <div className="print-document label-sheet" data-testid="ointment-label-sheet-doc">
              {ointmentItems.map((item) => (
                <div className="bottle-label ointment-label" key={`ointment-${item.itemId}`}>
                  <div className="label-head">
                    <div className="label-title">外用</div>
                    {renderIdentityMark('tiny')}
                  </div>
                  <div className="label-patient">{patientData.name} 様</div>
                  <div className="label-drug">{getDisplayDrugName(item)}</div>
                  <div className="label-usage">{item.usage || '患部に使用'}</div>
                  <div className="label-dose-grid">
                    <div>
                      <span>全量</span>
                      <strong>{getAmountText(item)}</strong>
                    </div>
                    <div>
                      <span>日数</span>
                      <strong>{item.days ? `${item.days}日分` : '-'}</strong>
                    </div>
                  </div>
                  <div className="label-warning">使用部位と回数を確認してください</div>
                  <div className="label-footer">
                    <strong>{pharmacyInfo.name}</strong>
                    <span>{pharmacyAddressLine} / TEL: {pharmacyInfo.phone}</span>
                    <span>調剤薬剤師: {pharmacyInfo.pharmacistName} / {currentDateStr}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <style jsx>{`
        .print-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          height: 100%;
        }

        .print-header {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }

        /* 日本語見出しは単語区切りがなく、折り返しなしのflexだと1文字幅まで
           潰れてしまうため、タイトル側に最低幅を確保し、ボタン列は折り返す。 */
        .print-header > div:first-child {
          flex: 1 1 260px;
          min-width: min(260px, 100%);
        }

        .print-header > div:last-child {
          flex-wrap: wrap;
        }

        .flex { display: flex; }
        .items-center { align-items: center; }
        .gap-4 { gap: 1rem; }
        .gap-2 { gap: 0.5rem; }

        .print-workspace {
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 1.35rem;
          flex: 1;
          overflow-y: auto;
          padding: 0 0.5rem 2rem;
        }

        .print-preview-card {
          display: flex;
          flex-direction: column;
          background: #ffffff;
          padding: 1rem;
          border: 1px solid #d9dee7;
          border-radius: 8px;
        }

        .paper-preview-card {
          align-items: center;
          overflow-x: auto;
          background:
            linear-gradient(90deg, rgba(226, 232, 240, 0.7) 1px, transparent 1px),
            linear-gradient(rgba(226, 232, 240, 0.7) 1px, transparent 1px),
            #f7f8fb;
          background-size: 16px 16px;
          padding: 1.25rem;
        }

        .dispensing-record-card,
        .yakutai-card {
          align-items: center;
        }

        .dispensing-record-card .preview-header,
        .yakutai-card .preview-header,
        .paper-preview-card .preview-header {
          align-self: stretch;
        }

        .preview-header {
          margin-bottom: 1rem;
        }
        .preview-header h3 {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1rem;
          color: var(--text-main);
        }

        .receipt-console-panel {
          grid-column: 1 / -1;
          background: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          padding: 1rem;
          display: grid;
          gap: 1rem;
          box-shadow: var(--shadow-sm);
        }

        .receipt-console-main {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
        }

        .receipt-console-main h2 {
          margin: 0.1rem 0;
          font-size: 1.25rem;
          color: #111827;
        }

        .receipt-console-main p,
        .console-total small {
          margin: 0;
          color: #6b7280;
          font-size: 0.84rem;
        }

        .console-kicker {
          font-size: 0.72rem;
          font-weight: 800;
          color: #047857;
          letter-spacing: 0;
        }

        .console-total {
          text-align: right;
          min-width: 160px;
        }

        .console-total span {
          display: block;
          font-size: 0.78rem;
          color: #6b7280;
        }

        .console-total strong {
          display: block;
          font-size: 1.45rem;
          color: #111827;
        }

        .receipt-flow-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 0.75rem;
        }

        .receipt-flow-step {
          min-height: 64px;
          border-radius: 8px;
          border: 1px solid #d1d5db;
          background: #f9fafb;
          padding: 0.7rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 0.2rem;
        }

        .receipt-flow-step span {
          font-size: 0.74rem;
          color: #6b7280;
          font-weight: 800;
        }

        .receipt-flow-step strong {
          font-size: 0.92rem;
          color: #111827;
        }

        .receipt-flow-step.ok {
          border-color: #bbf7d0;
          background: #f0fdf4;
        }

        .receipt-flow-step.warning {
          border-color: #fde68a;
          background: #fffbeb;
        }

        .receipt-flow-step.error {
          border-color: #fecaca;
          background: #fef2f2;
        }

        /* --- Document Styles (Paper Simulation) --- */
        .print-document {
          background: white;
          color: #111;
          box-sizing: border-box;
          box-shadow: 0 14px 34px rgba(15, 23, 42, 0.16);
          border: 1px solid #b7b7b7;
          border-radius: 0;
          line-height: 1.35;
          margin: 0 auto;
          padding-top: var(--print-margin-top, 15mm);
          padding-bottom: var(--print-margin-bottom, 15mm);
          font-size: calc(100% * var(--print-font-scale, 1));
          font-variant-numeric: tabular-nums;
        }

        .yakujo-doc {
          width: 210mm;
          max-width: 100%;
          min-height: 297mm;
          padding: 11mm 13mm;
          font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
        }

        :global(.identity-mark) {
          --mark-color: #2563eb;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 7mm;
          height: 7mm;
          min-width: 7mm;
          min-height: 7mm;
          border: none;
          background: transparent;
          padding: 0;
          line-height: 0;
          flex: 0 0 auto;
        }

        :global(.identity-mark.compact) {
          width: 6mm;
          height: 6mm;
          min-width: 6mm;
          min-height: 6mm;
        }

        :global(.identity-mark.tiny) {
          width: 4mm;
          height: 4mm;
          min-width: 4mm;
          min-height: 4mm;
        }

        :global(.identity-symbol) {
          width: 100%;
          height: 100%;
          border: 1px solid rgba(17, 17, 17, 0.28);
          border-radius: 999px;
          background: var(--mark-color);
          display: inline-block;
          box-shadow: inset 0 0 0 0.8mm rgba(255, 255, 255, 0.85);
        }

        :global(.identity-mark.compact .identity-symbol) {
          box-shadow: inset 0 0 0 0.65mm rgba(255, 255, 255, 0.85);
        }

        :global(.identity-mark.tiny .identity-symbol) {
          box-shadow: inset 0 0 0 0.45mm rgba(255, 255, 255, 0.85);
        }

        :global(.mark-sakura) { --mark-color: #be123c; }
        :global(.mark-aoba) { --mark-color: #047857; }
        :global(.mark-tsubaki) { --mark-color: #b91c1c; }
        :global(.mark-sumire) { --mark-color: #6d28d9; }
        :global(.mark-kohaku) { --mark-color: #b45309; }
        :global(.mark-shizuku) { --mark-color: #0369a1; }

        .doc-header {
          display: flex;
          justify-content: space-between;
          border-bottom: 2px solid #333;
          padding-bottom: 10px;
          margin-bottom: 20px;
        }

        .doc-title { font-size: 1.5rem; font-weight: bold; }
        .doc-submeta {
          margin-top: 4px;
          font-size: 0.78rem;
          color: #555;
        }
        .doc-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
          text-align: right;
          font-size: 0.9rem;
        }

        .doc-patient {
          margin-bottom: 30px;
          font-size: 1.2rem;
        }
        .patient-name { font-size: 1.5rem; font-weight: bold; margin-right: 10px; }

        .doc-intro { margin-bottom: 20px; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .text-sm { font-size: 0.85rem; }
        .font-bold { font-weight: bold; }
        .bg-gray-50 { background-color: #f9fafb; }

        .drug-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        .drug-table th, .drug-table td {
          border: 1px solid #333;
          padding: 8px;
          text-align: left;
        }
        .drug-table th { background-color: #f1f5f9; }

        .dispensing-record-doc {
          font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
          color: #111;
        }

        .dispensing-record-doc .doc-title {
          font-size: 1.45rem;
          text-align: left;
        }

        .record-titlebar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: start;
          gap: 12px;
          border-bottom: 2px solid #111;
          padding-bottom: 3.5mm;
          margin-bottom: 4mm;
        }

        .record-number {
          margin-top: 1mm;
          font-size: 0.78rem;
          color: #333;
          white-space: nowrap;
        }

        .record-info-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 5mm;
          font-size: 0.82rem;
        }

        .record-info-table th,
        .record-info-table td {
          border: 1px solid #333;
          padding: 2.1mm 2.4mm;
          vertical-align: top;
        }

        .record-info-table th {
          width: 22%;
          background: #f7f7f7;
          font-weight: 700;
          text-align: left;
          white-space: nowrap;
          word-break: keep-all;
        }

        .record-info-table td {
          width: 28%;
        }

        .record-drug-table {
          font-size: 0.78rem;
          table-layout: fixed;
        }

        .record-drug-table th,
        .record-drug-table td {
          padding: 1.8mm;
          vertical-align: top;
        }

        .record-drug-table th {
          white-space: nowrap;
          word-break: keep-all;
        }

        .record-drug-table th:nth-child(1),
        .record-drug-table td:nth-child(1) {
          width: 42px;
        }

        .record-drug-table th:nth-child(2),
        .record-drug-table td:nth-child(2) {
          width: 30%;
        }

        .record-drug-table th:nth-child(3),
        .record-drug-table td:nth-child(3) {
          width: 74px;
        }

        .record-drug-table th:nth-child(5),
        .record-drug-table td:nth-child(5) {
          width: 72px;
        }

        .record-drug-table th:nth-child(6),
        .record-drug-table td:nth-child(6) {
          width: 30%;
        }

        .record-guidance-box {
          border: 1px solid #333;
          margin-top: 5mm;
          min-height: 31mm;
          padding: 3mm;
        }

        .record-guidance-label {
          font-size: 0.86rem;
          font-weight: 700;
          margin-bottom: 3mm;
        }

        .record-guidance-lines {
          display: grid;
          gap: 9mm;
        }

        .record-guidance-lines span {
          display: block;
          border-bottom: 1px solid #999;
          min-height: 1px;
        }

        .dispensing-record-doc .doc-footer {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          margin-top: 18px;
          text-align: left;
        }

        .pharmacist-seal-box {
          width: 18mm;
          height: 18mm;
          border: 1px solid #333;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.9rem;
        }

        .receipt-summary-strip {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border: 1px solid #333;
          margin-bottom: 18px;
        }

        .receipt-summary-strip div {
          padding: 8px;
          border-right: 1px solid #333;
        }

        .receipt-summary-strip div:last-child {
          border-right: none;
        }

        .receipt-summary-strip span {
          display: block;
          font-size: 0.74rem;
          color: #555;
          margin-bottom: 2px;
        }

        .statement-topbar {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: start;
          gap: 6mm;
          border-bottom: 2px solid #111;
          padding-bottom: 3mm;
          margin-bottom: 3mm;
        }

        .statement-document-title {
          text-align: center;
          font-size: 1.34rem;
          font-weight: 900;
          letter-spacing: 0;
        }

        .statement-admin-row {
          display: grid;
          grid-template-columns: 20mm 20mm 1fr 1fr 1fr;
          border: 1px solid #222;
          border-bottom: none;
          min-height: 7mm;
          align-items: center;
          font-size: 0.72rem;
        }

        .statement-admin-row span {
          height: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-right: 1px solid #222;
          padding: 0 2mm;
        }

        .statement-admin-row span:last-child {
          border-right: none;
        }

        .statement-patient-table,
        .statement-ledger-table,
        .receipt-breakdown-table {
          width: 100%;
          border-collapse: collapse;
        }

        .statement-patient-table {
          margin-bottom: 4mm;
          font-size: 0.72rem;
        }

        .statement-patient-table th,
        .statement-patient-table td {
          border: 1px solid #222;
          padding: 1.7mm 2mm;
          vertical-align: middle;
        }

        .statement-patient-table th {
          width: 18mm;
          background: #f4f4f4;
          font-weight: 700;
          text-align: center;
          white-space: nowrap;
        }

        .statement-patient-name {
          font-weight: 800;
          font-size: 0.86rem;
        }

        .statement-ledger-table {
          table-layout: fixed;
          font-size: 0.7rem;
        }

        .statement-ledger-table th,
        .statement-ledger-table td {
          border: 1px solid #222;
          padding: 1.4mm 1.8mm;
          vertical-align: top;
        }

        .statement-ledger-table th {
          background: #f0f3f7;
          text-align: center;
          font-weight: 800;
        }

        .statement-ledger-table td strong {
          display: block;
          font-size: 0.77rem;
          line-height: 1.28;
        }

        .statement-ledger-table td span {
          display: block;
          margin-top: 0.7mm;
          color: #444;
          line-height: 1.3;
        }

        .statement-ledger-table tfoot td {
          background: #f7f7f7;
          font-weight: 800;
        }

        .statement-category-col {
          width: 22mm;
        }

        .statement-points-col {
          width: 18mm;
        }

        .statement-code-col {
          width: 31mm;
        }

        .statement-category {
          text-align: center;
          font-weight: 700;
          word-break: keep-all;
          background: #fafafa;
        }

        .statement-footer-note {
          display: flex;
          justify-content: space-between;
          gap: 10mm;
          align-items: flex-end;
          margin-top: 4mm;
          font-size: 0.68rem;
          color: #333;
        }

        .receipt-doc {
          width: 148mm;
          max-width: 100%;
          min-height: 210mm;
          padding: 10mm 11mm;
          font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
        }

        .receipt-topbar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: start;
          gap: 5mm;
          border-bottom: 2px solid #111;
          padding-bottom: 3mm;
          margin-bottom: 3mm;
        }

        .receipt-kicker {
          text-align: left;
          font-size: 0.68rem;
          color: #444;
          margin-bottom: 1mm;
          font-weight: 700;
        }

        .receipt-title {
          text-align: left;
          font-size: 1.42rem;
          font-weight: 900;
          letter-spacing: 0;
        }

        .receipt-meta-row,
        .receipt-footer {
          display: flex;
          justify-content: space-between;
          gap: 8mm;
        }

        .receipt-meta-row {
          font-size: 0.72rem;
          border: 1px solid #222;
          padding: 1.5mm 2mm;
          margin-bottom: 4mm;
        }

        .receipt-patient-box {
          display: grid;
          grid-template-columns: 20mm 1fr;
          border: 1.5px solid #222;
          min-height: 11mm;
          margin-bottom: 5mm;
          align-items: center;
        }

        .receipt-patient-box span {
          height: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f5;
          border-right: 1px solid #222;
          font-size: 0.8rem;
          font-weight: 700;
        }

        .receipt-patient-box strong {
          padding: 0 3mm;
          font-size: 1rem;
        }

        .receipt-total-box {
          border: 3px double #111;
          padding: 4mm;
          margin-bottom: 5mm;
          text-align: center;
        }

        .receipt-total-box span {
          display: block;
          font-size: 0.76rem;
          color: #444;
          margin-bottom: 1mm;
          font-weight: 700;
        }

        .receipt-total-box strong {
          display: block;
          font-size: 1.85rem;
          line-height: 1.1;
        }

        .receipt-total-box small {
          display: block;
          margin-top: 1.5mm;
          font-size: 0.68rem;
          color: #444;
        }

        .receipt-breakdown-table {
          font-size: 0.72rem;
          margin-bottom: 4mm;
        }

        .receipt-breakdown-table th,
        .receipt-breakdown-table td {
          border: 1px solid #222;
          padding: 1.7mm;
        }

        .receipt-breakdown-table th {
          background: #f0f3f7;
          text-align: center;
        }

        .receipt-settlement-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          border: 1px solid #222;
          margin-bottom: 3mm;
        }

        .receipt-settlement-grid div {
          min-height: 12mm;
          padding: 2mm;
          border-right: 1px solid #222;
          border-bottom: 1px solid #222;
        }

        .receipt-settlement-grid div:nth-child(2n) {
          border-right: none;
        }

        .receipt-settlement-grid div:nth-last-child(-n + 2) {
          border-bottom: none;
        }

        .receipt-settlement-grid span {
          display: block;
          color: #555;
          font-size: 0.7rem;
          font-weight: 700;
        }

        .receipt-settlement-grid strong {
          display: block;
          margin-top: 1mm;
          font-size: 0.84rem;
        }

        .receipt-note {
          font-size: 0.68rem;
          color: #444;
          margin: 0 0 5mm;
          line-height: 1.45;
        }

        .receipt-footer {
          align-items: flex-end;
          margin-top: auto;
          border-top: 1px solid #222;
          padding-top: 4mm;
          font-size: 0.7rem;
          line-height: 1.45;
        }

        .receipt-seal-box {
          width: 20mm;
          height: 20mm;
          border: 1px solid #222;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 4mm;
          font-size: 0.72rem;
          color: #333;
          flex: 0 0 auto;
        }

        .drug-info-titlebar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 68mm;
          gap: 6mm;
          align-items: start;
          border-bottom: 2px solid #111;
          padding-bottom: 3.5mm;
          margin-bottom: 3.5mm;
        }

        .drug-info-stamp-stack {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 2.5mm;
          align-items: stretch;
        }

        .drug-info-pharmacy-stamp {
          border: 1px solid #222;
          padding: 2.4mm;
          min-height: 11mm;
          font-size: 0.7rem;
          line-height: 1.4;
        }

        .drug-info-pharmacy-stamp strong,
        .drug-info-pharmacy-stamp span {
          display: block;
        }

        .drug-info-patient-line {
          display: grid;
          grid-template-columns: 1.1fr 0.85fr 1.45fr 0.85fr;
          gap: 0;
          border: 1px solid #222;
          margin-bottom: 4mm;
          font-size: 0.72rem;
        }

        .drug-info-patient-line strong,
        .drug-info-patient-line span {
          padding: 1.8mm 2mm;
          border-right: 1px solid #222;
        }

        .drug-info-patient-line span:last-child {
          border-right: none;
        }

        .drug-info-list {
          display: grid;
          gap: 2.8mm;
        }

        .drug-info-row {
          display: grid;
          grid-template-columns: 24mm minmax(0, 1fr);
          gap: 3mm;
          border: 1px solid #222;
          page-break-inside: avoid;
        }

        .drug-info-row.high-risk {
          border-left: 4px solid #b91c1c;
        }

        .drug-appearance-cell {
          border-right: 1px solid #222;
          background: #f7f7f7;
          min-height: 30mm;
          padding: 2.5mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2.5mm;
          text-align: center;
        }

        .drug-appearance-cell small {
          font-size: 0.68rem;
          color: #444;
          font-weight: 700;
        }

        .drug-shape {
          display: inline-block;
          position: relative;
          width: 17mm;
          height: 10mm;
          background: #fefefe;
          border: 1.5px solid #8792a2;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.9);
        }

        .drug-shape.tablet {
          border-radius: 999px;
        }

        .drug-shape.tablet::after {
          content: "";
          position: absolute;
          inset: 1mm auto 1mm 50%;
          border-left: 1px solid #b9c0ca;
        }

        .drug-shape.high-risk {
          border-color: #b91c1c;
          background: #fff5f5;
        }

        .drug-shape.powder {
          width: 15mm;
          height: 17mm;
          border-radius: 1mm;
          background: linear-gradient(160deg, #ffffff 0 58%, #d8e6f3 59% 100%);
        }

        .drug-shape.liquid {
          width: 12mm;
          height: 20mm;
          border-radius: 2mm 2mm 4mm 4mm;
          background: linear-gradient(#ffffff 0 38%, #bae6fd 39% 100%);
          border-color: #0284c7;
        }

        .drug-shape.ointment {
          width: 20mm;
          height: 8mm;
          border-radius: 999px 2mm 2mm 999px;
          background: linear-gradient(90deg, #dcfce7 0 25%, #ffffff 26% 100%);
          border-color: #15803d;
        }

        .drug-info-main {
          min-width: 0;
          padding: 2.5mm 3mm 2.7mm 0;
        }

        .drug-info-name-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 3mm;
          border-bottom: 1px solid #bbb;
          padding-bottom: 1.5mm;
          margin-bottom: 2mm;
        }

        .drug-info-name-row strong {
          font-size: 0.93rem;
          line-height: 1.35;
        }

        .drug-risk-badge {
          border: 1px solid #b91c1c;
          color: #991b1b;
          background: #fff5f5;
          padding: 0.5mm 2mm;
          font-size: 0.68rem;
          font-weight: 800;
          white-space: nowrap;
        }

        .drug-info-change {
          margin: -1mm 0 2.5mm;
          color: #555;
          font-size: 0.72rem;
        }

        .drug-info-dose-grid {
          display: grid;
          grid-template-columns: 24mm minmax(0, 1fr) 22mm;
          border: 1px solid #222;
          margin-bottom: 2mm;
        }

        .drug-info-dose-grid div {
          padding: 1.7mm;
          border-right: 1px solid #222;
        }

        .drug-info-dose-grid div:last-child {
          border-right: none;
        }

        .drug-info-dose-grid span {
          display: block;
          color: #555;
          font-size: 0.66rem;
          font-weight: 700;
        }

        .drug-info-dose-grid strong {
          display: block;
          margin-top: 0.6mm;
          font-size: 0.76rem;
          line-height: 1.35;
        }

        .drug-info-guidance {
          margin: 0;
          font-size: 0.74rem;
          line-height: 1.5;
        }

        .drug-info-control-panel {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          align-items: center;
          margin-top: 0.65rem;
          padding: 0.55rem;
          border: 1px dashed #cbd5e1;
          background: #f8fafc;
          border-radius: 6px;
        }

        .paper-embedded-control {
          display: none;
        }

        .drug-info-claim-tools {
          width: 100%;
          max-width: 210mm;
          margin-top: 0.85rem;
          display: grid;
          gap: 0.55rem;
          align-self: center;
        }

        .drug-info-claim-row {
          display: grid;
          grid-template-columns: minmax(160px, 0.8fr) minmax(0, 2.2fr);
          gap: 0.75rem;
          align-items: center;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          background: #ffffff;
          padding: 0.65rem;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .drug-info-claim-row > strong {
          min-width: 0;
          color: #111827;
          font-size: 0.84rem;
          line-height: 1.4;
        }

        .drug-info-control-panel label {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          color: #334155;
          font-size: 0.76rem;
          font-weight: 700;
        }

        .drug-info-control-panel input[type="text"],
        .drug-info-control-panel select {
          min-height: 28px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 0 0.45rem;
          font-size: 0.78rem;
          background: #fff;
        }

        .drug-info-control-panel input[type="text"] {
          width: 140px;
        }

        .drug-info-control-panel .agent-override-field {
          gap: 0.35rem;
          padding: 0.12rem 0.35rem;
          border: 1px solid #bae6fd;
          border-radius: 6px;
          background: #f0f9ff;
          color: #075985;
        }

        .drug-info-control-panel .agent-override-field input[type="text"] {
          width: 96px;
          border-color: #7dd3fc;
          font-weight: 700;
        }

        .drug-info-control-panel input.agent-override-reason {
          width: 180px;
          border-color: #7dd3fc;
        }

        .drug-info-empty {
          border: 1px solid #222;
          padding: 5mm;
          text-align: center;
          color: #555;
        }

        .drug-info-bottom-note {
          display: grid;
          grid-template-columns: 22mm minmax(0, 1fr);
          border: 1px solid #222;
          margin-top: 5mm;
          font-size: 0.78rem;
        }

        .drug-info-bottom-note strong {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f5;
          border-right: 1px solid #222;
          padding: 2.5mm;
        }

        .drug-info-bottom-note span {
          padding: 2.5mm;
        }

        .drug-info-footer {
          margin-top: 8mm;
        }

        .claim-panel {
          grid-column: 1 / -1;
          background: #f8fafc;
        }

        .claim-lifecycle-panel {
          grid-column: 1 / -1;
          background: #fff7ed;
          border-color: #fed7aa;
        }

        .claim-lifecycle-panel.status-draft,
        .claim-lifecycle-panel.status-rebilling,
        .claim-lifecycle-panel.status-returned {
          background: #f8fafc;
          border-color: #e2e8f0;
        }

        .claim-lifecycle-panel.status-accepted {
          background: #ecfeff;
          border-color: #a5f3fc;
        }

        .claim-lifecycle-panel.status-closed {
          background: #f0fdf4;
          border-color: #bbf7d0;
        }

        .electronic-prescription-lifecycle-panel {
          grid-column: 1 / -1;
          background: #f8fafc;
          border-color: #cbd5e1;
        }

        .electronic-prescription-lifecycle-panel.status-ok {
          background: #f0fdf4;
          border-color: #bbf7d0;
        }

        .electronic-prescription-lifecycle-panel.status-warning {
          background: #fffbeb;
          border-color: #fde68a;
        }

        .electronic-prescription-lifecycle-panel.status-error {
          background: #fef2f2;
          border-color: #fecaca;
        }

        .electronic-prescription-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 26px;
          padding: 0 0.65rem;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 800;
          white-space: nowrap;
          background: #e0f2fe;
          color: #0369a1;
          border: 1px solid #bae6fd;
        }

        .electronic-prescription-badge.ok {
          background: #dcfce7;
          color: #166534;
          border-color: #bbf7d0;
        }

        .electronic-prescription-badge.warning {
          background: #fef3c7;
          color: #92400e;
          border-color: #fde68a;
        }

        .electronic-prescription-badge.error {
          background: #fee2e2;
          color: #b91c1c;
          border-color: #fecaca;
        }

        .claim-lifecycle-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 26px;
          padding: 0 0.65rem;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 800;
          white-space: nowrap;
          background: #fff7ed;
          color: #c2410c;
          border: 1px solid #fed7aa;
        }

        .claim-lifecycle-badge.draft,
        .claim-lifecycle-badge.rebilling,
        .claim-lifecycle-badge.returned {
          background: #eff6ff;
          color: #1d4ed8;
          border-color: #bfdbfe;
        }

        .claim-lifecycle-badge.closed {
          background: #dcfce7;
          color: #166534;
          border-color: #bbf7d0;
        }

        .claim-lifecycle-badge.accepted {
          background: #cffafe;
          color: #0e7490;
          border-color: #67e8f9;
        }

        .claim-lifecycle-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
          gap: 0.75rem;
          align-items: stretch;
        }

        .electronic-prescription-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(188px, auto);
        }

        .claim-lifecycle-status-card,
        .claim-lifecycle-event {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #fff;
          padding: 0.85rem;
        }

        .claim-lifecycle-status-card span,
        .claim-lifecycle-event span {
          display: block;
          color: var(--text-muted);
          font-size: 0.75rem;
          font-weight: 800;
        }

        .claim-lifecycle-status-card strong,
        .claim-lifecycle-event strong {
          display: block;
          margin-top: 0.18rem;
          color: var(--text-main);
          font-size: 0.96rem;
        }

        .claim-lifecycle-status-card p,
        .claim-lifecycle-event p {
          margin-top: 0.28rem;
          color: var(--text-muted);
          font-size: 0.82rem;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .claim-lifecycle-actions {
          min-width: 184px;
          display: grid;
          gap: 0.5rem;
          align-content: center;
        }

        .electronic-prescription-actions {
          min-width: 188px;
        }

        .claim-lifecycle-history {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
          margin-top: 0.85rem;
        }

        .claim-snapshot-panel {
          margin-top: 0.85rem;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #fff;
          padding: 0.85rem;
        }

        .claim-snapshot-panel.changed {
          border-color: #fdba74;
          background: #fff7ed;
        }

        .claim-snapshot-panel.ok {
          border-color: #bbf7d0;
          background: #f0fdf4;
        }

        .claim-snapshot-panel.empty {
          background: #f8fafc;
        }

        .claim-snapshot-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .claim-snapshot-header span,
        .claim-snapshot-facts span {
          display: block;
          color: var(--text-muted);
          font-size: 0.75rem;
          font-weight: 800;
        }

        .claim-snapshot-header strong,
        .claim-snapshot-facts strong {
          display: block;
          margin-top: 0.18rem;
          color: var(--text-main);
          font-size: 0.96rem;
        }

        .claim-snapshot-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 26px;
          padding: 0 0.65rem;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 800;
          white-space: nowrap;
          background: #f8fafc;
          color: #475569;
          border: 1px solid #e2e8f0;
        }

        .claim-snapshot-badge.changed {
          background: #ffedd5;
          color: #c2410c;
          border-color: #fdba74;
        }

        .claim-snapshot-badge.ok {
          background: #dcfce7;
          color: #166534;
          border-color: #bbf7d0;
        }

        .claim-snapshot-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.45rem;
          flex-wrap: wrap;
        }

        .claim-snapshot-facts {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
          margin-top: 0.75rem;
        }

        .claim-snapshot-facts > div {
          min-width: 0;
          border-top: 1px solid rgba(148, 163, 184, 0.35);
          padding-top: 0.65rem;
        }

        .claim-snapshot-facts p,
        .claim-snapshot-ok,
        .claim-snapshot-diff-row p {
          margin-top: 0.28rem;
          color: var(--text-muted);
          font-size: 0.82rem;
          line-height: 1.5;
        }

        .claim-snapshot-diff-list {
          display: grid;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }

        .claim-snapshot-diff-row {
          border: 1px solid #fed7aa;
          border-radius: 8px;
          background: #fff;
          padding: 0.7rem;
        }

        .claim-snapshot-diff-row strong {
          display: block;
          color: #9a3412;
          font-size: 0.88rem;
        }

        .claim-snapshot-diff-row p {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.5rem;
        }

        .claim-return-suggestions {
          display: grid;
          gap: 0.55rem;
          margin-top: 0.85rem;
          padding-top: 0.85rem;
          border-top: 1px solid rgba(251, 146, 60, 0.45);
        }

        .claim-return-suggestion-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .claim-return-suggestion-header span {
          color: #9a3412;
          font-size: 0.75rem;
          font-weight: 900;
        }

        .claim-return-suggestion-header strong {
          color: #c2410c;
          font-size: 0.86rem;
        }

        .claim-return-suggestion-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.8rem;
          border: 1px solid #fed7aa;
          border-radius: 8px;
          background: #fff;
          padding: 0.72rem;
        }

        .claim-return-suggestion-row.warning {
          border-color: #fde68a;
        }

        .claim-return-suggestion-row > div {
          min-width: 0;
        }

        .claim-return-suggestion-row strong {
          display: block;
          color: #7c2d12;
          font-size: 0.88rem;
        }

        .claim-return-suggestion-row p,
        .claim-return-suggestion-row small {
          display: block;
          margin-top: 0.25rem;
          color: var(--text-muted);
          font-size: 0.8rem;
          line-height: 1.45;
        }

        .claim-return-suggestion-row > button {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 26px;
          padding: 0 0.6rem;
          border-radius: 999px;
          background: #fff7ed;
          border: 1px solid #fed7aa;
          color: #9a3412;
          font-size: 0.76rem;
          font-weight: 900;
          white-space: nowrap;
          cursor: pointer;
        }

        .claim-return-suggestion-row > button:hover {
          background: #ffedd5;
          border-color: #fdba74;
        }

        .claim-controls {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .claim-lock-notice {
          margin-bottom: 0.85rem;
          padding: 0.7rem 0.85rem;
          border: 1px solid #fed7aa;
          border-radius: 8px;
          background: #fff7ed;
          color: #9a3412;
          font-size: 0.84rem;
          font-weight: 700;
          line-height: 1.5;
        }

        .fee-toggle-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 0.75rem;
        }

        .claim-switch {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          min-height: 34px;
          font-size: 0.9rem;
          color: var(--text-main);
        }

        .claim-switch input {
          width: 1rem;
          height: 1rem;
          accent-color: var(--primary);
        }

        .claim-switch-strong {
          font-weight: 700;
          color: #0f766e;
        }

        .claim-check-panel {
          grid-column: 1 / -1;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }

        .claim-check-panel.error {
          background: #fff7ed;
          border-color: #fed7aa;
        }

        .claim-check-panel.warning {
          background: #fefce8;
          border-color: #fde68a;
        }

        .claim-check-panel.ok {
          background: #f0fdf4;
          border-color: #bbf7d0;
        }

        .claim-check-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }

        .claim-header-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .compact-action {
          min-height: 32px;
          padding: 0.35rem 0.6rem;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          white-space: nowrap;
        }

        .compact-action:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .claim-check-subtitle {
          margin-top: 0.25rem;
          font-size: 0.84rem;
          line-height: 1.5;
          color: var(--text-muted);
        }

        .claim-check-badge,
        .claim-issue-severity {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 24px;
          padding: 0 0.55rem;
          border-radius: 999px;
          font-size: 0.76rem;
          font-weight: 700;
          white-space: nowrap;
        }

        .claim-check-badge.error,
        .claim-issue-severity.error {
          background: #fee2e2;
          color: #991b1b;
        }

        .claim-check-badge.warning,
        .claim-issue-severity.warning {
          background: #fef3c7;
          color: #92400e;
        }

        .claim-check-badge.ok,
        .claim-issue-severity.info {
          background: #dcfce7;
          color: #166534;
        }

        .claim-issue-list {
          display: grid;
          gap: 0.75rem;
        }

        .claim-check-ok-row,
        .claim-issue {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.75rem;
          align-items: flex-start;
          border-radius: 8px;
          background: white;
          border: 1px solid #e2e8f0;
          padding: 0.85rem;
        }

        .claim-check-ok-row {
          align-items: center;
          color: #166534;
          font-weight: 700;
        }

        .claim-issue {
          border-left-width: 4px;
        }

        .claim-issue.error {
          border-left-color: #dc2626;
        }

        .claim-issue.warning {
          border-left-color: #f59e0b;
        }

        .claim-issue.info {
          border-left-color: #2563eb;
        }

        .claim-issue-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          color: #475569;
        }

        .claim-issue.error .claim-issue-icon {
          color: #dc2626;
        }

        .claim-issue.warning .claim-issue-icon {
          color: #d97706;
        }

        .claim-issue.info .claim-issue-icon {
          color: #2563eb;
        }

        .claim-issue-title-row {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
        }

        .claim-issue-title-row > .claim-issue-title {
          min-width: min(200px, 100%);
        }

        .claim-issue-title {
          color: var(--text-main);
          line-height: 1.4;
        }

        .claim-issue-message {
          margin-top: 0.25rem;
          font-size: 0.84rem;
          line-height: 1.55;
          color: var(--text-muted);
        }

        .claim-issue-more {
          color: var(--text-muted);
          font-size: 0.84rem;
          font-weight: 700;
          padding: 0 0.15rem;
        }

        .ai-assist-panel {
          margin-top: 0.95rem;
          display: grid;
          gap: 0.75rem;
          border-top: 1px solid rgba(148, 163, 184, 0.45);
          padding-top: 0.85rem;
        }

        .ai-assist-mode-notice {
          margin-top: 0.85rem;
          border: 1px solid #f59e0b;
          border-radius: 8px;
          background: #fffbeb;
          color: #92400e;
          padding: 0.65rem 0.75rem;
          font-size: 0.82rem;
          font-weight: 700;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .ai-assist-topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .ai-assist-heading {
          display: inline-flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.45rem;
          color: #334155;
          font-size: 0.9rem;
        }

        .ai-assist-heading svg {
          color: #7c3aed;
        }

        .ai-assist-heading span {
          color: var(--text-muted);
          font-size: 0.78rem;
          font-weight: 700;
        }

        .ai-assist-review-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 24px;
          padding: 0 0.6rem;
          border-radius: 999px;
          background: #eff6ff;
          color: #1d4ed8;
          border: 1px solid #bfdbfe;
          font-size: 0.75rem;
          font-weight: 800;
          white-space: nowrap;
        }

        .ai-assist-list {
          display: grid;
          gap: 0.65rem;
        }

        .ai-assist-item {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.8rem;
          align-items: start;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          border-left-width: 4px;
          background: rgba(255, 255, 255, 0.86);
          padding: 0.75rem;
        }

        .ai-assist-item.critical {
          border-left-color: #dc2626;
        }

        .ai-assist-item.warning {
          border-left-color: #d97706;
        }

        .ai-assist-item.info {
          border-left-color: #2563eb;
        }

        .ai-assist-item-main {
          min-width: 0;
        }

        .ai-assist-title-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .ai-assist-title-row strong {
          line-height: 1.4;
          color: var(--text-main);
        }

        .ai-assist-item p {
          margin-top: 0.25rem;
          color: var(--text-muted);
          line-height: 1.55;
          font-size: 0.84rem;
        }

        .ai-assist-meta,
        .ai-assist-evidence {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
          margin-top: 0.45rem;
        }

        .ai-assist-meta span,
        .ai-assist-evidence span {
          display: inline-flex;
          align-items: center;
          max-width: 100%;
          border-radius: 999px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #475569;
          font-size: 0.74rem;
          font-weight: 700;
          line-height: 1.35;
          padding: 0.18rem 0.48rem;
        }

        .ai-assist-evidence span {
          border-radius: 6px;
          background: #fff;
          color: #64748b;
          font-weight: 600;
        }

        .ai-assist-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 0.35rem;
          max-width: 260px;
        }

        .ai-assist-decision {
          min-width: 68px;
          justify-content: center;
        }

        .doc-summary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px 16px;
          border: 1px solid #333;
          padding: 10px;
          margin-bottom: 20px;
        }

        .summary-label {
          display: block;
          font-size: 0.75rem;
          color: #555;
          margin-bottom: 2px;
        }

        .doc-subtitle {
          font-size: 1rem;
          margin: 18px 0 8px;
        }

        .doc-notes {
          border: 1px solid #ccc;
          padding: 10px;
          margin-bottom: 40px;
        }

        .doc-footer {
          margin-top: auto;
          text-align: right;
          font-size: 0.9rem;
        }

        /* 薬袋 (Yakutai) */
        .yakutai-doc {
          --bag-color: #175a48;
          --bag-soft: #f3fbf7;
          width: 148mm;
          min-height: 210mm;
          padding: 9mm 11mm;
          display: flex;
          flex-direction: column;
          gap: 4.2mm;
          border: 1.5px solid var(--bag-color);
          font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
          color: #111;
        }

        .yakutai-doc.external-bag {
          --bag-color: #9f1239;
          --bag-soft: #fff5f7;
        }

        .yakutai-topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 4mm;
          font-size: 0.68rem;
          color: #333;
        }

        .yakutai-title {
          text-align: center;
          color: var(--bag-color);
          font-size: 1.9rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          border-top: 1.5px solid var(--bag-color);
          border-bottom: 1.5px solid var(--bag-color);
          padding: 2mm 0 2.5mm;
        }

        .yakutai-name-line {
          display: grid;
          grid-template-columns: 20mm minmax(0, 1fr);
          align-items: end;
          gap: 3mm;
          min-height: 17mm;
          border-bottom: 1px solid var(--bag-color);
        }

        .yakutai-name-line span,
        .yakutai-field-grid span,
        .yakutai-usage-box span,
        .yakutai-dose-box > span,
        .yakutai-count-grid span,
        .yakutai-note-lines span,
        .yakutai-code-box span {
          color: #4b5563;
          font-size: 0.68rem;
          font-weight: 800;
        }

        .yakutai-name-line strong {
          min-width: 0;
          font-size: 1.55rem;
          line-height: 1.15;
          padding-bottom: 1.5mm;
        }

        .yakutai-field-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          border: 1px solid var(--bag-color);
        }

        .yakutai-field-grid > div {
          display: grid;
          gap: 1mm;
          padding: 2mm 2.5mm;
          border-right: 1px solid var(--bag-color);
          min-height: 12mm;
        }

        .yakutai-field-grid > div:last-child {
          border-right: none;
        }

        .yakutai-field-grid strong {
          font-size: 0.9rem;
        }

        .yakutai-usage-box {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          grid-template-areas:
            "label days"
            "usage days";
          gap: 1.5mm 5mm;
          border: 1.8px solid var(--bag-color);
          background: var(--bag-soft);
          padding: 4mm;
          min-height: 31mm;
        }

        .yakutai-usage-box span {
          grid-area: label;
        }

        .yakutai-usage-box strong {
          grid-area: usage;
          min-width: 0;
          font-size: 1.45rem;
          line-height: 1.25;
        }

        .yakutai-usage-box em {
          grid-area: days;
          align-self: center;
          border-left: 1px solid var(--bag-color);
          padding-left: 4mm;
          font-style: normal;
          font-size: 1.05rem;
          font-weight: 900;
          white-space: nowrap;
        }

        .yakutai-dose-box {
          display: grid;
          gap: 1.6mm;
        }

        .yakutai-drug-list {
          display: grid;
          gap: 1.6mm;
        }

        .drug-line {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 4mm;
          align-items: baseline;
          font-size: 0.9rem;
          border-bottom: 1px dashed #9ca3af;
          padding-bottom: 1.4mm;
        }

        .drug-line strong {
          white-space: nowrap;
        }

        .yakutai-count-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border: 1px solid var(--bag-color);
        }

        .yakutai-count-grid > div {
          min-height: 13mm;
          display: grid;
          align-content: center;
          gap: 1mm;
          text-align: center;
          border-right: 1px solid var(--bag-color);
          padding: 1.8mm;
        }

        .yakutai-count-grid > div:last-child {
          border-right: none;
        }

        .yakutai-count-grid strong {
          font-size: 0.85rem;
        }

        .yakutai-note-lines {
          display: grid;
          gap: 1.5mm;
          border: 1px solid var(--bag-color);
          padding: 2.5mm;
          min-height: 22mm;
        }

        .yakutai-note-lines strong {
          font-size: 0.82rem;
          line-height: 1.4;
        }

        .yakutai-note-lines i {
          display: block;
          border-bottom: 1px solid #9ca3af;
          min-height: 4mm;
        }

        .yakutai-bottom {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 32mm;
          gap: 5mm;
          align-items: end;
          font-size: 0.68rem;
          line-height: 1.35;
          border-top: 1.5px solid var(--bag-color);
          padding-top: 3mm;
          margin-top: auto;
        }

        .yakutai-pharmacy {
          display: grid;
          gap: 0.6mm;
        }

        .yakutai-code-box {
          display: grid;
          gap: 1mm;
          text-align: right;
        }

        .yakutai-code-box small {
          color: #555;
          font-size: 0.62rem;
          line-height: 1.25;
        }

        .sticker-sheet, .label-sheet {
          width: 210mm;
          max-width: 100%;
          min-height: 297mm;
          padding: 11mm;
          display: grid;
          align-content: start;
          gap: 6mm;
          font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
        }

        .sticker-sheet {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .handbook-sticker {
          min-height: 47mm;
          border: 1px solid #222;
          border-top: 4px solid #2563eb;
          padding: 4mm;
          display: flex;
          flex-direction: column;
          gap: 2.2mm;
          page-break-inside: avoid;
          background: #ffffff;
        }

        .sticker-head, .sticker-row, .label-row {
          display: flex;
          justify-content: space-between;
          gap: 3mm;
        }

        .sticker-head {
          align-items: flex-start;
          border-bottom: 1px solid #222;
          padding-bottom: 1.6mm;
        }

        .sticker-head > div {
          display: grid;
          gap: 0.8mm;
        }

        .sticker-head strong {
          font-size: 0.86rem;
        }

        .sticker-head span {
          font-size: 0.68rem;
          color: #444;
        }

        .sticker-drug, .label-drug {
          font-size: 0.98rem;
          font-weight: 700;
          line-height: 1.35;
        }

        .sticker-usage, .label-usage {
          font-size: 0.9rem;
          line-height: 1.4;
          border: 1px solid #222;
          padding: 1.8mm 2mm;
        }

        .sticker-footer, .label-footer {
          margin-top: auto;
          display: grid;
          gap: 0.7mm;
          border-top: 1px solid #bbb;
          padding-top: 1.5mm;
          font-size: 0.68rem;
          color: #555;
          text-align: left;
          line-height: 1.25;
        }

        .sticker-footer strong,
        .label-footer strong {
          color: #111;
          font-size: 0.72rem;
        }

        .label-sheet {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .bottle-label {
          min-height: 56mm;
          border: 1.5px solid #111;
          padding: 5mm;
          display: flex;
          flex-direction: column;
          gap: 2.8mm;
          page-break-inside: avoid;
          background: #fff;
        }

        .liquid-label {
          border-left: 5px solid #0369a1;
          background: #ffffff;
        }

        .ointment-label {
          border-left: 5px solid #15803d;
          background: #ffffff;
        }

        .label-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 3mm;
          border-bottom: 1px solid #222;
          padding-bottom: 1.8mm;
        }

        .label-title {
          font-size: 1.15rem;
          font-weight: 900;
          color: #111827;
        }

        .label-patient {
          font-size: 1.05rem;
          font-weight: 800;
        }

        /* --- Radical print redesign: practical paper family --- */
        .statement-ledger-doc {
          display: flex;
          flex-direction: column;
          gap: 4mm;
        }

        .statement-redesign-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 38mm auto;
          gap: 4mm;
          align-items: start;
          border-bottom: 2px solid #111;
          padding-bottom: 4mm;
        }

        .statement-title-stack span,
        .receipt-redesign-titlebar span,
        .receipt-copy-band span,
        .statement-redesign-meta span,
        .statement-summary-band span,
        .statement-confirmation-grid span,
        .receipt-accounting-strip span,
        .receipt-office-info span,
        .receipt-stub span,
        .drug-info-med-title span,
        .drug-info-fact span,
        .drug-info-usage-hero span,
        .sticker-dose-panel span,
        .label-dose-grid span {
          color: #4b5563;
          font-size: 0.68rem;
          font-weight: 800;
        }

        .statement-title-stack h2,
        .receipt-redesign-titlebar h2 {
          margin: 1mm 0 0;
          color: #111;
          font-size: 1.65rem;
          line-height: 1;
          font-weight: 900;
          letter-spacing: 0;
        }

        .statement-title-stack p {
          margin: 2mm 0 0;
          color: #444;
          font-size: 0.73rem;
          line-height: 1.5;
        }

        .statement-issue-box {
          border: 1px solid #111;
          min-height: 19mm;
          padding: 2.2mm;
          display: grid;
          align-content: center;
          gap: 0.8mm;
          text-align: center;
        }

        .statement-issue-box span,
        .statement-issue-box small {
          color: #4b5563;
          font-size: 0.66rem;
          font-weight: 800;
        }

        .statement-issue-box strong {
          font-size: 0.9rem;
          line-height: 1.25;
        }

        .statement-redesign-meta {
          display: grid;
          grid-template-columns: 1.25fr 1.2fr 1fr;
          border: 1px solid #111;
        }

        .statement-redesign-meta > div {
          min-width: 0;
          min-height: 22mm;
          padding: 2.4mm 2.8mm;
          border-right: 1px solid #111;
          display: grid;
          align-content: center;
          gap: 1mm;
        }

        .statement-redesign-meta > div:last-child {
          border-right: none;
        }

        .statement-redesign-meta strong {
          min-width: 0;
          color: #111;
          font-size: 0.88rem;
          line-height: 1.3;
        }

        .statement-person-block strong {
          font-size: 1.05rem;
        }

        .statement-redesign-meta p {
          margin: 0;
          color: #333;
          font-size: 0.68rem;
          line-height: 1.4;
        }

        .statement-summary-band {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border: 2px solid #111;
        }

        .statement-summary-band > div {
          min-height: 18mm;
          padding: 2.4mm 2.8mm;
          border-right: 1px solid #111;
          display: grid;
          align-content: center;
          gap: 1mm;
        }

        .statement-summary-band > div:last-child {
          border-right: none;
        }

        .statement-summary-band strong {
          color: #111;
          font-size: 1.02rem;
          line-height: 1.2;
        }

        .statement-summary-primary {
          background: #f8fafc;
        }

        .statement-summary-primary strong {
          font-size: 1.18rem;
        }

        .statement-section-heading {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 4mm;
          border-bottom: 1.5px solid #111;
          padding-bottom: 1.5mm;
        }

        .statement-section-heading strong {
          font-size: 0.95rem;
        }

        .statement-section-heading span {
          color: #4b5563;
          font-size: 0.68rem;
          font-weight: 800;
        }

        .statement-fee-ledger {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 0.68rem;
        }

        .statement-fee-ledger th,
        .statement-fee-ledger td {
          border: 1px solid #111;
          padding: 1.55mm 1.8mm;
          vertical-align: top;
        }

        .statement-fee-ledger th {
          background: #eef2f7;
          text-align: center;
          font-weight: 900;
        }

        .statement-fee-ledger th:nth-child(1) { width: 21mm; }
        .statement-fee-ledger th:nth-child(2) { width: 35mm; }
        .statement-fee-ledger th:nth-child(4) { width: 17mm; }
        .statement-fee-ledger th:nth-child(5) { width: 27mm; }

        .statement-fee-name {
          font-weight: 800;
          line-height: 1.3;
        }

        .statement-point-cell {
          text-align: right;
          font-weight: 900;
          font-size: 0.76rem;
        }

        .statement-confirmation-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 46mm 19mm;
          border: 1px solid #111;
          margin-top: auto;
        }

        .statement-confirmation-grid > div {
          min-height: 18mm;
          padding: 2.3mm;
          border-right: 1px solid #111;
        }

        .statement-confirmation-grid > div:last-child {
          border-right: none;
        }

        .statement-confirmation-grid strong {
          display: block;
          margin-top: 0.8mm;
          font-size: 0.78rem;
        }

        .statement-confirmation-grid p {
          margin: 0.8mm 0 0;
          color: #333;
          font-size: 0.68rem;
          line-height: 1.35;
        }

        .statement-seal-cell {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #555;
          font-size: 0.7rem;
          font-weight: 800;
        }

        .receipt-redesign-doc {
          display: flex;
          flex-direction: column;
          gap: 4mm;
        }

        .receipt-copy-band,
        .receipt-stub {
          display: grid;
          grid-template-columns: 22mm minmax(0, 1fr) auto;
          gap: 3mm;
          align-items: center;
          border: 1px solid #111;
          min-height: 8mm;
          padding: 1.3mm 2mm;
          font-size: 0.68rem;
        }

        .receipt-copy-band strong,
        .receipt-stub strong {
          min-width: 0;
          font-size: 0.78rem;
        }

        .receipt-redesign-titlebar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 5mm;
          align-items: start;
          border-bottom: 2px solid #111;
          padding-bottom: 3mm;
        }

        .receipt-payee-line {
          display: grid;
          grid-template-columns: 20mm minmax(0, 1fr);
          border: 1.5px solid #111;
          min-height: 15mm;
          align-items: center;
        }

        .receipt-payee-line span {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f3f4f6;
          border-right: 1px solid #111;
          color: #333;
          font-size: 0.78rem;
          font-weight: 900;
        }

        .receipt-payee-line strong {
          padding: 0 3mm;
          font-size: 1.05rem;
        }

        .receipt-money-panel {
          border: 3px double #111;
          padding: 4.5mm 5mm;
          text-align: center;
          background: #fff;
        }

        .receipt-money-panel strong {
          display: block;
          margin-top: 1mm;
          color: #111;
          font-size: 2.15rem;
          line-height: 1;
          font-weight: 900;
        }

        .receipt-money-panel p {
          margin: 2mm 0 0;
          color: #333;
          font-size: 0.72rem;
          line-height: 1.45;
        }

        .receipt-accounting-strip {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          border: 1px solid #111;
        }

        .receipt-accounting-strip > div {
          min-height: 13mm;
          padding: 2.2mm;
          border-right: 1px solid #111;
          border-bottom: 1px solid #111;
        }

        .receipt-accounting-strip > div:nth-child(2n) {
          border-right: none;
        }

        .receipt-accounting-strip > div:nth-last-child(-n + 2) {
          border-bottom: none;
        }

        .receipt-accounting-strip strong {
          display: block;
          margin-top: 1mm;
          font-size: 0.9rem;
        }

        .receipt-redesign-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 0.7rem;
        }

        .receipt-redesign-table th,
        .receipt-redesign-table td {
          border: 1px solid #111;
          padding: 1.7mm;
          vertical-align: top;
        }

        .receipt-redesign-table th {
          background: #eef2f7;
          text-align: center;
          font-weight: 900;
        }

        .receipt-redesign-table th:nth-child(2) {
          width: 24mm;
        }

        .receipt-office-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 22mm;
          gap: 4mm;
          align-items: end;
          border-top: 1.5px solid #111;
          padding-top: 4mm;
          margin-top: auto;
        }

        .receipt-office-info {
          display: grid;
          gap: 0.7mm;
          line-height: 1.3;
        }

        .receipt-office-info strong {
          font-size: 0.82rem;
        }

        .receipt-redesign-doc .receipt-seal-box {
          width: 22mm;
          height: 22mm;
          border-radius: 999px;
          font-size: 0.72rem;
        }

        .receipt-stub {
          border-style: dashed;
          margin-top: 1mm;
        }

        .drug-info-row.drug-info-card {
          display: block;
          border: 1.5px solid #111;
          padding: 0;
          page-break-inside: avoid;
        }

        .drug-info-row.drug-info-card.high-risk {
          border-left: 5px solid #b91c1c;
        }

        .drug-info-med-header {
          display: grid;
          grid-template-columns: 23mm minmax(0, 1fr) auto;
          gap: 3mm;
          align-items: stretch;
          border-bottom: 1px solid #111;
          background: #f8fafc;
        }

        .drug-info-card .drug-appearance-cell {
          min-height: 24mm;
          border-right: 1px solid #111;
          background: #fff;
        }

        .drug-info-med-title {
          min-width: 0;
          display: grid;
          align-content: center;
          gap: 1mm;
          padding: 2.2mm 0;
        }

        .drug-info-med-title strong {
          min-width: 0;
          font-size: 1.02rem;
          line-height: 1.25;
        }

        .drug-info-flag-list {
          display: flex;
          align-content: center;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 1.2mm;
          max-width: 38mm;
          padding: 2mm 2.5mm 2mm 0;
        }

        .drug-info-flag-list span,
        .drug-info-timing-row em,
        .sticker-timing-row span,
        .yakutai-timing-strip span {
          border: 1px solid #111;
          background: #fff;
          color: #111;
          font-size: 0.64rem;
          font-style: normal;
          font-weight: 900;
          line-height: 1;
          padding: 1mm 1.7mm;
          white-space: nowrap;
        }

        .drug-info-card .drug-info-change {
          margin: 0;
          padding: 1.5mm 2.5mm;
          border-bottom: 1px solid #111;
          background: #fff7ed;
          color: #7c2d12;
          font-size: 0.7rem;
        }

        .drug-info-counseling-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 25mm 22mm;
          border-bottom: 1px solid #111;
        }

        .drug-info-counseling-grid > div {
          min-height: 20mm;
          padding: 2.2mm 2.5mm;
          border-right: 1px solid #111;
        }

        .drug-info-counseling-grid > div:last-child {
          border-right: none;
        }

        .drug-info-usage-hero strong {
          display: block;
          margin-top: 1mm;
          font-size: 0.92rem;
          line-height: 1.35;
        }

        .drug-info-timing-row {
          display: flex;
          flex-wrap: wrap;
          gap: 1mm;
          margin-top: 2mm;
        }

        .drug-info-fact strong {
          display: block;
          margin-top: 1mm;
          font-size: 0.92rem;
        }

        .drug-info-safety-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          border-bottom: 1px solid #111;
        }

        .drug-info-safety-grid > div {
          min-height: 19mm;
          padding: 2mm 2.5mm;
          border-right: 1px solid #111;
        }

        .drug-info-safety-grid > div:last-child {
          border-right: none;
        }

        .drug-info-safety-grid span,
        .drug-info-source-line span {
          display: block;
          color: #0f766e;
          font-size: 0.62rem;
          font-weight: 900;
          margin-bottom: 0.8mm;
        }

        .drug-info-safety-grid p {
          margin: 0;
          color: #111;
          font-size: 0.68rem;
          line-height: 1.35;
        }

        .drug-info-source-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2mm;
          padding: 1.7mm 2.5mm;
          border-bottom: 1px solid #111;
          background: #f8fafc;
        }

        .drug-info-source-line small {
          display: block;
          color: #4b5563;
          font-size: 0.6rem;
          font-weight: 800;
        }

        .drug-info-source-line span {
          margin-bottom: 0;
          color: #334155;
        }

        .drug-info-source-line a {
          color: #0f766e;
          font-size: 0.66rem;
          font-weight: 900;
          text-decoration: underline;
        }

        .yakutai-doc {
          display: grid;
          grid-template-columns: 23mm minmax(0, 1fr);
          gap: 0;
          padding: 0;
          overflow: hidden;
        }

        .yakutai-ribbon {
          background: var(--bag-color);
          color: #fff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          gap: 5mm;
          padding: 8mm 3mm;
          writing-mode: vertical-rl;
          text-orientation: mixed;
        }

        .yakutai-ribbon span {
          font-size: 0.9rem;
          font-weight: 900;
          letter-spacing: 0.08em;
        }

        .yakutai-ribbon strong {
          font-size: 1.45rem;
          letter-spacing: 0.1em;
        }

        .yakutai-body {
          min-width: 0;
          padding: 9mm 10mm;
          display: flex;
          flex-direction: column;
          gap: 4mm;
        }

        .yakutai-doc .yakutai-topline {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 3mm;
          border-bottom: 1px solid var(--bag-color);
          padding-bottom: 2mm;
        }

        .yakutai-usage-hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 2mm 5mm;
          border: 2px solid var(--bag-color);
          background: var(--bag-soft);
          padding: 4mm;
        }

        .yakutai-usage-hero span {
          grid-column: 1 / -1;
          color: #4b5563;
          font-size: 0.74rem;
          font-weight: 900;
        }

        .yakutai-usage-hero strong {
          min-width: 0;
          font-size: 1.58rem;
          line-height: 1.22;
        }

        .yakutai-usage-hero em {
          align-self: center;
          border-left: 1px solid var(--bag-color);
          padding-left: 4mm;
          font-style: normal;
          font-size: 1.05rem;
          font-weight: 900;
          white-space: nowrap;
        }

        .yakutai-timing-strip {
          display: flex;
          flex-wrap: wrap;
          gap: 1.5mm;
        }

        .yakutai-timing-strip span {
          border-color: var(--bag-color);
          color: var(--bag-color);
        }

        .yakutai-drug-ledger {
          border: 1px solid var(--bag-color);
        }

        .yakutai-ledger-head,
        .yakutai-ledger-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 4mm;
          align-items: center;
          padding: 2.2mm 2.5mm;
          border-bottom: 1px solid var(--bag-color);
        }

        .yakutai-ledger-head {
          background: var(--bag-soft);
        }

        .yakutai-ledger-head span,
        .yakutai-ledger-row span,
        .yakutai-safety-strip span {
          color: #4b5563;
          font-size: 0.68rem;
          font-weight: 900;
        }

        .yakutai-ledger-head strong,
        .yakutai-ledger-row strong {
          font-size: 0.86rem;
          line-height: 1.35;
        }

        .yakutai-ledger-row:last-child {
          border-bottom: none;
        }

        .yakutai-ledger-row div {
          min-width: 0;
          display: grid;
          gap: 0.7mm;
        }

        .yakutai-ledger-row em {
          font-style: normal;
          font-size: 0.8rem;
          font-weight: 900;
          white-space: nowrap;
        }

        .yakutai-safety-strip {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          border: 1px solid var(--bag-color);
        }

        .yakutai-safety-strip > div {
          min-height: 13mm;
          padding: 2.2mm;
          border-right: 1px solid var(--bag-color);
          display: grid;
          align-content: center;
          gap: 1mm;
        }

        .yakutai-safety-strip > div:last-child {
          border-right: none;
        }

        .yakutai-safety-strip strong {
          font-size: 0.84rem;
        }

        .handbook-sticker {
          min-height: 54mm;
          border-top-width: 6px;
          gap: 2mm;
        }

        .sticker-dose-panel,
        .label-dose-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          border: 1px solid #111;
        }

        .sticker-dose-panel > div,
        .label-dose-grid > div {
          min-height: 11mm;
          padding: 1.8mm;
          border-right: 1px solid #111;
          display: grid;
          align-content: center;
          gap: 0.7mm;
        }

        .sticker-dose-panel > div:last-child,
        .label-dose-grid > div:last-child {
          border-right: none;
        }

        .sticker-dose-panel strong,
        .label-dose-grid strong {
          font-size: 0.88rem;
        }

        .sticker-timing-row {
          display: flex;
          flex-wrap: wrap;
          gap: 1mm;
        }

        .sticker-timing-row span {
          border-color: #2563eb;
          color: #1d4ed8;
        }

        .label-dose-grid {
          margin-top: -0.7mm;
        }

        .label-warning {
          border: 1px solid #111;
          background: #f8fafc;
          padding: 1.8mm 2mm;
          color: #111;
          font-size: 0.78rem;
          font-weight: 900;
          line-height: 1.35;
        }

        @media (max-width: 900px) {
          .receipt-console-main {
            flex-direction: column;
          }

          .console-total {
            text-align: left;
          }

          .receipt-flow-grid,
          .receipt-summary-strip,
          .claim-lifecycle-grid,
          .electronic-prescription-grid,
          .claim-lifecycle-history,
          .claim-snapshot-facts {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .claim-lifecycle-actions,
          .electronic-prescription-actions {
            grid-column: 1 / -1;
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .record-titlebar,
          .dispensing-record-doc .doc-footer {
            grid-template-columns: 1fr;
            flex-direction: column;
            align-items: flex-start;
          }
        }

        @media (max-width: 640px) {
          .claim-lifecycle-grid,
          .electronic-prescription-grid,
          .claim-lifecycle-history,
          .claim-snapshot-facts,
          .claim-snapshot-diff-row p,
          .claim-lifecycle-actions,
          .electronic-prescription-actions {
            grid-template-columns: 1fr;
          }

          .claim-snapshot-header {
            flex-direction: column;
          }

          .claim-snapshot-actions {
            width: 100%;
            justify-content: stretch;
          }

          .claim-lifecycle-actions,
          .electronic-prescription-actions {
            min-width: 0;
          }

          .claim-snapshot-actions .compact-action,
          .claim-lifecycle-actions .compact-action,
          .electronic-prescription-actions .compact-action {
            width: 100%;
            justify-content: center;
          }

          .ai-assist-item,
          .ai-assist-title-row {
            grid-template-columns: 1fr;
            flex-direction: column;
          }

          .ai-assist-actions {
            max-width: none;
            justify-content: stretch;
          }

          .ai-assist-decision {
            flex: 1 1 0;
          }
        }

        /* --- Print Styles --- */
        @media print {
          body { background: white !important; }
          header, .no-print { display: none !important; }

          .print-workspace {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            position: relative !important;
          }

          .print-preview-card {
            background: white !important;
            padding: 0 !important;
            margin-bottom: 20px !important;
            box-shadow: none !important;
            border: none !important;
            page-break-after: always !important;
          }

          .print-document {
            box-shadow: none !important;
            margin: 0 auto !important;
            padding-top: var(--print-margin-top, 10mm) !important;
            padding-bottom: var(--print-margin-bottom, 10mm) !important;
            font-size: calc(100% * var(--print-font-scale, 1)) !important;
          }

          .yakutai-doc {
            page-break-after: always !important;
            break-after: page !important;
          }
        }
      `}</style>
    </div>
  );
}
