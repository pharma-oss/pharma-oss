'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Upload, FileSearch, CheckCircle, Trash2, Loader2, CreditCard, Search, Plus, Hospital, Printer, AlertTriangle, ShieldCheck, History } from 'lucide-react';
import { toast } from 'sonner';
import { useDatabase } from '@/db/DatabaseProvider';
import type { Alert, Drug, InsuranceEligibilityStatus, Patient, PharmacyDatabase, PrescriptionItem, Visit } from '@/db/types';
import { generateUUID } from '@/lib/crypto';
import { parseFlexibleDateInput } from '@/lib/date_input';
import {
  buildPatientCandidateMatches,
  findMatchingPatient,
  normalizeInsuranceNumber,
  normalizePatientName,
  type PatientCandidateMatch
} from '@/lib/patient_matching';
import { describePatientMasterChanges } from '@/lib/patient_master_update';
import {
  buildPatientMergeExecutionPlan,
  buildPatientMergePlan,
  type PatientMergeExecutionPlan,
  type PatientMergeOperation,
  type PatientMergePlan
} from '@/lib/patient_merge';
import {
  applyPatientMergeExecutionPlan,
  applyPatientMergeOperation,
  createRxdbPatientMergeExecutionStore,
  PatientMergeExecutionError
} from '@/lib/patient_merge_execution';
import { getCurrentUser, logAuditAction } from '@/lib/audit';
import { isClaimEditBlocked } from '@/lib/claim_edit_guard';
import {
  formatOnlineEligibilityFieldMappingReport,
  normalizeOnlineEligibilityResponse,
  type NormalizedOnlineEligibilityResult
} from '@/lib/online_eligibility';
import { findDrugMasterRecordByCode, findSubstitutionCandidates, isGeneralNameDrugRecord, searchDrugMaster, type DrugMasterRecord } from '@/lib/master-data/drug_master';
import { formatDrugDisplayName } from '@/lib/master-data/drug_display';
import { buildProviderHistory, matchProviderHistory, type ProviderHistoryOption } from '@/lib/master-data/provider_history';
import { ELECTRONIC_USAGE_OPTIONS, formatElectronicUsage } from '@/lib/master-data/usage_master';
import { buildPrescriptionInputAudit, type PrescriptionInputAuditResult } from '@/lib/prescription_input_audit';
import { comparePrescriptionHistoryTimeline, type PrescriptionHistoryItem, type PrescriptionHistorySnapshot, type PrescriptionHistoryTimelineEntry } from '@/lib/prescription_history_compare';
import {
  buildPreviousDoPrescriptions,
  type PreviousDoSnapshot,
  type PreviousDoSourceItem
} from '@/lib/previous_prescription_do';
import { buildOcrConfidenceReport, type OcrConfidenceReport } from '@/lib/ocr_confidence';
import { parseJahisQr, parsePrescriptionOcrText, type DrugItem as JahisDrugItem } from '@/lib/ocr/processor';
import { DOSAGE_CATEGORIES, DOSAGE_CATEGORY_LABELS, inferDosageCategory, type DosageCategory } from '@/lib/dosage_category';
import {
  buildElectronicPrescriptionApplyDecision,
  normalizeElectronicPrescriptionFetchKey,
  type ElectronicPrescriptionFetchKeyKind,
  type ElectronicPrescriptionFetchResult
} from '@/lib/electronic_prescription';
import DrugSearchModal from './components/DrugSearchModal';
import PrescriptionQrReader from './components/PrescriptionQrReader';
import WorkflowMiniTutorial from '@/components/WorkflowMiniTutorial';
import type { Prescription, PrescriptionGroup, PrescriptionFieldValue } from './types';
import { groupPrescriptionsByRp } from './types';
import {
  toPatientEligibilityStatus,
  getDrugAuditMeta,
  getDispensedDrugAuditMeta,
  clearDispensedDrugAuditMeta,
  auditSeverityLabel,
  historyChangeLabel,
  createEmptyPrescription,
  toDateInputValue,
  dateInputToIso,
  normalizeDateInputValue,
  normalizeJahisDateInputValue,
  getGroupDosageCategory,
  attachStockQuantities,
  stockTitle,
  stockClassName,
  formatVisitDateLabel,
  getVisitSortTime,
  isGeneralNameDrug,
  sortDrugSuggestions,
  NO_SUBSTITUTION_LABEL,
  isNoSubstitutionValue
} from './helpers';
import { OcrRawTextArea, OcrConfidencePanel } from './components/OcrConfidencePanel';
import { PrescribedDrugInput } from './components/PrescribedDrugInput';
import { DispensedDrugInput } from './components/DispensedDrugInput';
import { PrescriptionRow } from './components/PrescriptionRow';
import { PrescriptionGroupEditor } from './components/PrescriptionGroupEditor';
import { PrescriptionAuditPanel } from './components/PrescriptionAuditPanel';
import { PrescriptionHistoryComparePanel } from './components/PrescriptionHistoryComparePanel';
import { useOcrElectronicPrescription } from '@/hooks/useOcrElectronicPrescription';
import { useOcrPatientEligibility, type PatientCandidate, type PatientMergeReview } from '@/hooks/useOcrPatientEligibility';
import { useOcrPreviousPrescriptions } from '@/hooks/useOcrPreviousPrescriptions';
import { useOcrDrugSearchModal } from '@/hooks/useOcrDrugSearchModal';

// ⚡ Bolt: Hoist regex to module scope to avoid re-compilation on every function call
const INSURANCE_NUMBER_REGEX = /^\d+$/;



const patientMergeCollectionLabel = {
  visits: '受付',
  alerts: 'アラート'
} as const;

function formatPatientMergeOperationLabel(operation: PatientMergeOperation): string {
  switch (operation.type) {
    case 'upsert_patient':
      return `残す患者情報を更新: ${operation.patientId}`;
    case 'delete_patient':
      return `統合元患者を削除: ${operation.patientId}`;
    case 'patch_visit_patient':
      return `受付を付け替え: ${operation.visitId} -> ${operation.afterPatientId}`;
    case 'patch_alert_patient':
      return `アラートを付け替え: ${operation.alertId} -> ${operation.afterPatientId}`;
  }
}



const normalizeDrugComparableText = (value?: string) => (
  String(value || '')
    .normalize('NFKC')
    .replace(/[【［\[]\s*般\s*[】］\]]/g, '')
    .replace(/\s|　/g, '')
    .toLowerCase()
);

const toQrDrugCodeStatus = (drug?: Pick<DrugMasterRecord, 'isAbolished'>): Prescription['prescribedDrugCodeStatus'] => {
  if (!drug) return 'unknown';
  return drug.isAbolished ? 'abolished' : 'active';
};

const qrSourceLabel = {
  camera: 'カメラ',
  image: '画像',
  manual: 'スキャナー'
} as const;

async function findBestDrugMasterForQrItem(item: JahisDrugItem): Promise<DrugMasterRecord | undefined> {
  const drugCode = item.drugCode?.trim();
  if (drugCode) {
    const exactDrug = await findDrugMasterRecordByCode(drugCode);
    if (exactDrug) return exactDrug;
  }

  const drugName = item.drugName.trim();
  if (!drugName) return undefined;

  const candidates = await searchDrugMaster(drugName, 25);
  if (candidates.length === 0) return undefined;
  const normalizedName = normalizeDrugComparableText(drugName);
  return candidates.find((drug) => (
    normalizeDrugComparableText(drug.name) === normalizedName ||
    normalizeDrugComparableText(formatDrugDisplayName(drug.name)) === normalizedName ||
    normalizeDrugComparableText(drug.genericName) === normalizedName ||
    normalizeDrugComparableText(drug.code) === normalizeDrugComparableText(drugCode) ||
    normalizeDrugComparableText(drug.yjCode) === normalizeDrugComparableText(drugCode)
  )) || candidates[0];
}

const getEffectiveDispensedDrug = (prescription: Prescription) => {
  const dispensedDrug = prescription.dispensedDrug.trim();
  if (!dispensedDrug || isNoSubstitutionValue(dispensedDrug)) return '';
  return dispensedDrug;
};

// QR・OCRで読み取った薬品行を、薬品マスタ照合込みで編集フォームの行へ変換する
const buildPrescriptionsFromParsedItems = async (
  items: JahisDrugItem[],
  idPrefix: string
): Promise<Prescription[]> => (
  Promise.all(items.map(async (item, index) => {
    const matchedDrug = await findBestDrugMasterForQrItem(item);
    const auditMeta = matchedDrug ? getDrugAuditMeta(matchedDrug) : undefined;
    const rpNumber = item.rpNumber || index + 1;
    return createEmptyPrescription(`rp_${idPrefix}_${rpNumber}`, {
      id: `item_${idPrefix}_${generateUUID()}`,
      drugCode: matchedDrug?.code || item.drugCode || '',
      drugName: matchedDrug?.name ? formatDrugDisplayName(matchedDrug.name) : item.drugName,
      amount: item.amount || '1',
      unitText: item.unit || '',
      electronicUsageCode: item.usageCode || '',
      electronicUsageFallbackText: item.usage || '',
      prescribedDrugCodeStatus: toQrDrugCodeStatus(matchedDrug),
      usage: item.usage || '',
      days: item.days || '',
      rpComment: item.rpComment || '',
      dispensedDrug: NO_SUBSTITUTION_LABEL,
      changeReason: '',
      ...(auditMeta || {})
    });
  }))
);
export default function OcrPage() {
  const router = useRouter();
  const db = useDatabase();

  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isManualEntry, setIsManualEntry] = useState(false);

  useEffect(() => {
    // ⚡ Bolt: Defer heavy OCR engine initialization to idle time.
    // Eagerly loading tesseract.js and its worker can block the main thread and delay Time to Interactive (TTI).
    // By wrapping it in requestIdleCallback, we ensure it only loads when the browser has free resources,
    // maintaining the benefit of no cold start without penalizing initial page load.
    const idleCallback = ('requestIdleCallback' in window)
      ? window.requestIdleCallback.bind(window)
      : (cb: () => void) => window.setTimeout(cb, 1000);

    const handle = idleCallback(() => {
      import('@/lib/ocr/processor').then(({ preloadOcr }) => {
        preloadOcr();
      }).catch(() => {});
    });

    return () => {
      if ('cancelIdleCallback' in window) {
        window.cancelIdleCallback(handle as number);
      } else {
        clearTimeout(handle as number);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (image && image.startsWith('blob:')) {
        URL.revokeObjectURL(image);
      }
    };
  }, [image]);
  const [ocrResult, setOcrResult] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [patientName, setPatientName] = useState('');
  const [patientBirthDate, setPatientBirthDate] = useState('');
  const [insuranceNumber, setInsuranceNumber] = useState('');
  const [burdenRatio, setBurdenRatio] = useState('30');

  // Prescriptions State
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(() => [
    createEmptyPrescription('rp_initial', { id: 'item_initial' })
  ]);

  // Provider State
  const [institutionCode, setInstitutionCode] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [prescriptionDate, setPrescriptionDate] = useState(() => toDateInputValue());
  const [dispensingDate, setDispensingDate] = useState(() => toDateInputValue());
  const [providerHistory, setProviderHistory] = useState<ProviderHistoryOption[]>([]);

  // Hook: 電子処方箋連携
  const {
    electronicPrescriptionKey,
    setElectronicPrescriptionKey,
    electronicPrescriptionKeyKind,
    setElectronicPrescriptionKeyKind,
    electronicPrescriptionInsuredNumber,
    setElectronicPrescriptionInsuredNumber,
    electronicPrescriptionStatus,
    setElectronicPrescriptionStatus,
    electronicPrescriptionMessage,
    setElectronicPrescriptionMessage,
    electronicPrescriptionWarnings,
    setElectronicPrescriptionWarnings,
    electronicPrescriptionIntegrityHash,
    setElectronicPrescriptionIntegrityHash,
    isFetchingElectronicPrescription,
    setIsFetchingElectronicPrescription,
    pendingElectronicPrescription,
    setPendingElectronicPrescription,
    electronicPrescriptionPaperOriginalConfirmed,
    setElectronicPrescriptionPaperOriginalConfirmed,
    appliedElectronicPrescription,
    setAppliedElectronicPrescription,
    electronicPrescriptionApplyDecision,
    handleElectronicPrescriptionFetch,
    clearPendingElectronicPrescription
  } = useOcrElectronicPrescription();

  // Hook: 患者照会・マイナ・資格確認
  const {
    patientCandidates,
    setPatientCandidates,
    selectedPatientId,
    setSelectedPatientId,
    patientMergeReview,
    setPatientMergeReview,
    isLoadingPatientMergeReview,
    setIsLoadingPatientMergeReview,
    isApplyingPatientMerge,
    setIsApplyingPatientMerge,
    patientMergeMessage,
    setPatientMergeMessage,
    activePatientAlerts,
    setActivePatientAlerts,
    isReadingMyna,
    mynaMessage,
    setMynaMessage,
    eligibilityStatus,
    setEligibilityStatus,
    eligibilityMessage,
    setEligibilityMessage,
    eligibilityResult,
    setEligibilityResult,
    handleMynaRead,
    handleEligibilityCheck
  } = useOcrPatientEligibility({
    db,
    patientName,
    patientBirthDate,
    insuranceNumber,
    burdenRatio,
    setPatientName,
    setPatientBirthDate,
    setInsuranceNumber,
    setBurdenRatio
  });

  // Hook: 過去処方・Do処方
  const {
    previousPrescriptions,
    setPreviousPrescriptions,
    isLoadingPreviousPrescription,
    previousDoSnapshot,
    setPreviousDoSnapshot,
    isLoadingPreviousDo,
    previousPrescriptionTimeline
  } = useOcrPreviousPrescriptions({
    db,
    selectedPatientId,
    prescriptions
  });

  // Hook: 薬品検索モーダル
  const {
    isModalOpen,
    setIsModalOpen,
    editingRowId,
    modalInitialQuery,
    modalTargetField,
    modalPrescribedCode,
    handleOpenDrugSearch,
    handleModalClose,
    handleModalSelect
  } = useOcrDrugSearchModal({ setPrescriptions });

  const appliedElectronicPrescriptionIds = useMemo(() => {
    if (!appliedElectronicPrescription) return [];
    const linkedIds = appliedElectronicPrescription.linkedPrescriptions?.map((link) => link.prescriptionId) || [];
    return Array.from(new Set([appliedElectronicPrescription.prescriptionId, ...linkedIds]));
  }, [appliedElectronicPrescription]);
  const pendingElectronicPrescriptionAlreadyApplied = !!pendingElectronicPrescription?.prescription?.prescriptionId
    && appliedElectronicPrescriptionIds.includes(pendingElectronicPrescription.prescription.prescriptionId);
  const displayedElectronicPrescriptionWarnings = useMemo(
    () => Array.from(new Set([
      ...electronicPrescriptionWarnings,
      ...(electronicPrescriptionApplyDecision?.requiredActions || [])
    ])),
    [electronicPrescriptionApplyDecision, electronicPrescriptionWarnings]
  );
  const prescriptionGroups = useMemo(() => groupPrescriptionsByRp(prescriptions), [prescriptions]);
  const prescriptionMetrics = useMemo(() => {
    const missingDrugCount = prescriptions.filter((prescription) => !prescription.drugName.trim()).length;
    const missingAmountCount = prescriptions.filter((prescription) => !prescription.amount.trim()).length;
    const missingUsageCount = prescriptionGroups.filter((group) => !group.usage.trim()).length;
    const missingDaysCount = prescriptionGroups.filter((group) => !group.days.trim()).length;
    const substitutionCount = prescriptions.filter((prescription) => {
      const dispensedDrug = prescription.dispensedDrug.trim();
      return dispensedDrug && !isNoSubstitutionValue(dispensedDrug);
    }).length;
    const specialPrepCount = prescriptions.filter((prescription) => (
      prescription.isIppoka || prescription.isCrushed || prescription.showReceiptRemark
    )).length;

    return {
      rpCount: prescriptionGroups.length,
      drugCount: prescriptions.length,
      missingDrugCount,
      missingAmountCount,
      missingUsageCount,
      missingDaysCount,
      missingTotal: missingDrugCount + missingAmountCount + missingUsageCount + missingDaysCount,
      substitutionCount,
      specialPrepCount
    };
  }, [prescriptions, prescriptionGroups]);
  const prescriptionAudit = useMemo(() => (
    buildPrescriptionInputAudit(prescriptions, { patientAlerts: activePatientAlerts })
  ), [activePatientAlerts, prescriptions]);
  const ocrConfidenceReport = useMemo(() => buildOcrConfidenceReport({
    ocrText: ocrResult,
    patientName,
    patientBirthDate,
    insuranceNumber,
    institutionName,
    departmentName,
    doctorName,
    prescriptions
  }), [departmentName, doctorName, insuranceNumber, institutionName, ocrResult, patientBirthDate, patientName, prescriptions]);
  const hasCurrentPrescriptionInput = useMemo(() => (
    prescriptions.some((prescription) => prescription.drugCode || prescription.drugName.trim())
  ), [prescriptions]);
  const previousDoDisabledReason = useMemo(() => {
    if (!selectedPatientId) return '患者選択後に利用できます';
    if (isLoadingPreviousDo) return '前回処方を確認しています';
    if (!previousDoSnapshot || previousDoSnapshot.items.length === 0) return '直近完了受付の処方がありません';
    return '';
  }, [isLoadingPreviousDo, previousDoSnapshot, selectedPatientId]);
  const previousDoSummary = useMemo(() => {
    if (isLoadingPreviousDo) return '確認中';
    if (!previousDoSnapshot) return '前回なし';
    return `${formatVisitDateLabel(previousDoSnapshot.visit)} / ${previousDoSnapshot.items.length}薬品`;
  }, [isLoadingPreviousDo, previousDoSnapshot]);
  const handleApplyPreviousDo = useCallback(() => {
    if (!previousDoSnapshot || previousDoSnapshot.items.length === 0) {
      toast.warning('直近完了受付の処方がありません。');
      return;
    }

    if (
      hasCurrentPrescriptionInput &&
      !window.confirm('現在の処方入力を前回処方で置き換えます。よろしいですか？')
    ) {
      return;
    }

    const clonedPrescriptions = buildPreviousDoPrescriptions(
      previousDoSnapshot.items,
      (prefix) => `${prefix}_${generateUUID()}`
    );
    setPrescriptions(clonedPrescriptions);
    toast.success(`前回DOを投入しました（${formatVisitDateLabel(previousDoSnapshot.visit)} / ${clonedPrescriptions.length}薬品）。`);
  }, [hasCurrentPrescriptionInput, previousDoSnapshot]);
  const selectedPatient = useMemo(
    () => patientCandidates.find((patient) => patient.patientId === selectedPatientId),
    [patientCandidates, selectedPatientId]
  );
  const patientCandidateMatches = useMemo<PatientCandidateMatch<PatientCandidate>[]>(() => (
    buildPatientCandidateMatches(patientCandidates, {
      name: patientName,
      birthDate: patientBirthDate,
      insuranceNumber
    }, patientCandidates.length)
  ), [insuranceNumber, patientBirthDate, patientCandidates, patientName]);
  const patientCandidateMatchById = useMemo(() => (
    new Map(patientCandidateMatches.map((match) => [match.patient.patientId, match]))
  ), [patientCandidateMatches]);

  useEffect(() => {
    let isMounted = true;
    const loadProviderHistory = async () => {
      if (!db) return;
      try {
        const visitDocs = await db.visits.find().exec();
        const history = buildProviderHistory(visitDocs.map((visitDoc) => visitDoc.toJSON() as Visit));
        if (isMounted) setProviderHistory(history.slice(0, 20));
      } catch (error) {
        console.error('Failed to load provider history:', error);
      }
    };

    loadProviderHistory();
    return () => { isMounted = false; };
  }, [db]);

  const handleElectronicPrescriptionApply = useCallback(async () => {
    if (!db || !pendingElectronicPrescription?.prescription || !electronicPrescriptionApplyDecision) return;
    if (!electronicPrescriptionApplyDecision.canApply) {
      toast.warning(electronicPrescriptionApplyDecision.message);
      return;
    }
    const result = pendingElectronicPrescription;
    const prescription = result.prescription!;
    const existingLinks = appliedElectronicPrescription?.linkedPrescriptions?.length
      ? appliedElectronicPrescription.linkedPrescriptions
      : appliedElectronicPrescription
        ? [{
            prescriptionId: appliedElectronicPrescription.prescriptionId,
            documentKind: appliedElectronicPrescription.documentKind,
            validUntil: appliedElectronicPrescription.validUntil,
            signatureStatus: appliedElectronicPrescription.signatureStatus,
            signatureHpkiVerification: appliedElectronicPrescription.signatureHpkiVerification,
            duplicateCheckStatus: appliedElectronicPrescription.duplicateCheckStatus,
            integrityHash: appliedElectronicPrescription.integrityHash,
            paperOriginalConfirmed: appliedElectronicPrescription.paperOriginalConfirmed,
            supplementaryInformation: appliedElectronicPrescription.supplementaryInformation
          }]
        : [];
    const isAppending = existingLinks.length > 0;
    if (existingLinks.some((link) => link.prescriptionId === prescription.prescriptionId)) {
      toast.warning('この電子処方箋はすでに処方入力へ反映済みです。');
      return;
    }
    if (isAppending) {
      const normalizeProvider = (value: string | undefined) => String(value || '')
        .normalize('NFKC')
        .replace(/[\s　]/g, '')
        .toUpperCase();
      const currentInstitutionCode = normalizeProvider(institutionCode);
      const nextInstitutionCode = normalizeProvider(prescription.provider.institutionCode);
      const currentInstitutionName = normalizeProvider(institutionName);
      const nextInstitutionName = normalizeProvider(prescription.provider.institutionName);
      const institutionMismatch = currentInstitutionCode && nextInstitutionCode
        ? currentInstitutionCode !== nextInstitutionCode
        : !currentInstitutionName || !nextInstitutionName || currentInstitutionName !== nextInstitutionName;
      if (institutionMismatch) {
        toast.warning('同じ受付へ追加できるのは、同一医療機関が発行した電子処方箋だけです。');
        return;
      }
      if (normalizeDateInputValue(prescription.prescriptionDate) !== normalizeDateInputValue(prescriptionDate)) {
        toast.warning('同じ受付へ追加できるのは、同じ処方日の電子処方箋だけです。');
        return;
      }
    }
    if (
      hasCurrentPrescriptionInput
      && !window.confirm(isAppending
        ? '同一患者・同一医療機関・同日発行の電子処方箋として、現在の処方入力へ追加します。よろしいですか？'
        : '現在の処方入力を電子処方箋の内容で置き換えます。よろしいですか？')
    ) {
      return;
    }

    const auditOk = await logAuditAction(
      db,
      'electronic_prescription',
      `電子処方箋取得内容を処方入力へ${isAppending ? '追加' : '反映'}: 文書区分 ${prescription.documentKind === 'electronic_prescription' ? '電子処方箋' : '処方箋情報提供ファイル'}、署名 ${prescription.signatureVerification?.status || '不明'}、重複確認 ${result.duplicateCheck?.status || 'not_checked'}、取得内容SHA-256 ${result.integrityHash?.slice(0, 16) || '未記録'}...。`,
      selectedPatientId || undefined,
      patientName || undefined
    );
    if (!auditOk) {
      toast.error('監査ログを記録できなかったため、電子処方箋の反映を中止しました。');
      return;
    }

    try {
      const nextPatientBirthDate = normalizeDateInputValue(prescription.patient.birthDate);
      const nextPrescriptionDate = normalizeDateInputValue(prescription.prescriptionDate);
      if (prescription.patient.name) setPatientName(prescription.patient.name);
      if (nextPatientBirthDate) setPatientBirthDate(nextPatientBirthDate);
      if (prescription.patient.burdenRatio) {
        setBurdenRatio(String(prescription.patient.burdenRatio));
      }
      if (!isAppending) {
        if (prescription.provider.institutionCode) setInstitutionCode(prescription.provider.institutionCode);
        if (prescription.provider.institutionName) setInstitutionName(prescription.provider.institutionName);
        if (prescription.provider.departmentName) setDepartmentName(prescription.provider.departmentName);
        if (prescription.provider.doctorName) setDoctorName(prescription.provider.doctorName);
        if (nextPrescriptionDate) {
          setPrescriptionDate(nextPrescriptionDate);
          setDispensingDate(nextPrescriptionDate);
        }
      }

      const nextPrescriptions = prescription.items.map((item, index) => {
        const rpNumber = item.rpNumber || index + 1;
        return createEmptyPrescription(`rp_ep_${prescription.prescriptionId}_${rpNumber}`, {
          id: `item_ep_${generateUUID()}`,
          drugCode: item.drugCode || item.receiptCode || item.yjCode || '',
          drugName: item.drugName,
          amount: item.unitConversion?.prescribedAmount || item.amount,
          unitCode: item.unitConversion?.prescribedUnitCode || item.unitCode || '',
          unitText: item.unitConversion?.prescribedUnitText || item.unitText || '',
          electronicUnitConversion: item.unitConversion,
          electronicUsageCode: item.usageCode || '',
          electronicUsageFallbackText: item.usageFallbackText || '',
          electronicUsageSupplementText: item.usageSupplementText || '',
          prescribedDrugCodeStatus: item.drugCodeStatus || 'unknown',
          prescribedDrugCodeAbolishedAt: item.drugCodeAbolishedAt || '',
          electronicSourceDrugName: item.sourceDrugName || '',
          electronicMasterDrugName: item.masterDrugName || '',
          electronicDrugNameVerificationStatus: item.drugNameVerificationStatus || 'not_checked',
          electronicDrugNameVerificationCheckedAt: item.drugNameVerificationCheckedAt || '',
          usage: [item.usage || item.usageFallbackText || '', item.usageSupplementText || '']
            .filter(Boolean)
            .join(' '),
          days: item.days,
          rpComment: item.rpComment || '',
          dispensedDrug: NO_SUBSTITUTION_LABEL,
          changeReason: ''
        });
      });
      setPrescriptions((current) => isAppending
        ? [...current, ...nextPrescriptions]
        : nextPrescriptions.length > 0
          ? nextPrescriptions
          : [createEmptyPrescription('rp_initial', { id: 'item_initial' })]);
      const appliedAt = new Date().toISOString();
      const nextLink = {
        prescriptionId: prescription.prescriptionId!,
        documentKind: prescription.documentKind!,
        validUntil: prescription.validUntil!,
        signatureStatus: prescription.signatureVerification!.status,
        signatureHpkiVerification: prescription.signatureVerification?.hpkiVerification,
        duplicateCheckStatus: result.duplicateCheck?.status || 'not_checked' as const,
        integrityHash: result.integrityHash!,
        paperOriginalConfirmed: prescription.documentKind === 'prescription_information'
          ? electronicPrescriptionPaperOriginalConfirmed
          : undefined,
        supplementaryInformation: prescription.supplementaryInformation
      };
      const linkedPrescriptions = [...existingLinks, nextLink];
      const duplicateStatuses = linkedPrescriptions.map((link) => link.duplicateCheckStatus);
      const duplicateCheckStatus = duplicateStatuses.includes('blocked')
        ? 'blocked'
        : duplicateStatuses.includes('warning')
          ? 'warning'
          : duplicateStatuses.every((status) => status === 'passed')
            ? 'passed'
            : 'not_checked';
      const earliestValidUntil = linkedPrescriptions
        .map((link) => link.validUntil)
        .sort()[0] || prescription.validUntil!;
      setAppliedElectronicPrescription({
        prescriptionId: appliedElectronicPrescription?.prescriptionId || prescription.prescriptionId!,
        linkedPrescriptions,
        documentKind: appliedElectronicPrescription?.documentKind || prescription.documentKind!,
        sourceMode: 'connector',
        receivedAt: appliedElectronicPrescription?.receivedAt || appliedAt,
        appliedAt,
        validUntil: earliestValidUntil,
        signatureStatus: appliedElectronicPrescription?.signatureStatus || prescription.signatureVerification!.status,
        signatureHpkiVerification: appliedElectronicPrescription?.signatureHpkiVerification || prescription.signatureVerification?.hpkiVerification,
        duplicateCheckStatus,
        integrityHash: appliedElectronicPrescription?.integrityHash || result.integrityHash!,
        paperOriginalConfirmed: linkedPrescriptions.every((link) => (
          link.documentKind !== 'prescription_information' || link.paperOriginalConfirmed === true
        )) || undefined,
        refill: appliedElectronicPrescription?.refill || prescription.refill,
        supplementaryInformation: appliedElectronicPrescription?.supplementaryInformation || prescription.supplementaryInformation,
        receptionStatus: 'accepted',
        dispensingResultStatus: 'pending',
        dispensingResultEverRegistered: false
      });

      const duplicateCheckMessage = result.duplicateCheck?.messages?.length
        ? ` / ${result.duplicateCheck.messages.join('、')}`
        : '';
      setElectronicPrescriptionStatus(electronicPrescriptionApplyDecision.status === 'review' ? 'warning' : 'confirmed');
      setElectronicPrescriptionMessage(`${electronicPrescriptionApplyDecision.message}${duplicateCheckMessage}`);
      if (electronicPrescriptionApplyDecision.status === 'review') {
        toast.warning(`電子処方箋を${isAppending ? '追加' : '反映'}しました。重複投薬・併用禁忌の注意内容を確認してください。`);
      } else {
        toast.success(`電子処方箋を${isAppending ? '追加' : '反映'}しました（合計${linkedPrescriptions.length}処方箋、追加${nextPrescriptions.length}薬品）。`);
      }
    } catch (error) {
      console.error('Electronic prescription apply failed:', error);
      setElectronicPrescriptionStatus('warning');
      setElectronicPrescriptionMessage('取得した電子処方箋を処方入力へ反映できませんでした。');
      toast.error('電子処方箋の反映に失敗しました。');
    }
  }, [
    db,
    appliedElectronicPrescription,
    electronicPrescriptionApplyDecision,
    electronicPrescriptionPaperOriginalConfirmed,
    hasCurrentPrescriptionInput,
    institutionCode,
    institutionName,
    patientName,
    pendingElectronicPrescription,
    prescriptionDate,
    selectedPatientId
  ]);

  const handleApplyPrescriptionQrData = useCallback(async (
    qrData: string,
    source: keyof typeof qrSourceLabel,
    segmentCount: number
  ) => {
    const parsed = parseJahisQr(qrData);
    const hasPatient = !!parsed.patient.name || !!parsed.patient.birthDate;
    const hasProvider = !!parsed.provider.institutionName || !!parsed.provider.doctorName || !!parsed.provider.prescriptionDate;
    const hasItems = parsed.items.length > 0;

    if (parsed.rawRecordCount === 0 || (!hasPatient && !hasProvider && !hasItems)) {
      toast.error('JAHIS形式の処方箋QRとして読み取れませんでした。');
      return;
    }

    if (
      hasItems &&
      hasCurrentPrescriptionInput &&
      !window.confirm('現在の処方入力をQRコードの内容で置き換えます。よろしいですか？')
    ) {
      return;
    }

    setIsManualEntry(true);
    setOcrResult(qrData);
    setPendingElectronicPrescription(null);
    setElectronicPrescriptionPaperOriginalConfirmed(false);
    setAppliedElectronicPrescription(null);

    const nextBirthDate = normalizeJahisDateInputValue(parsed.patient.birthDate);
    if (parsed.patient.name) setPatientName(parsed.patient.name);
    if (nextBirthDate) setPatientBirthDate(nextBirthDate);
    if (hasPatient) {
      setSelectedPatientId(null);
      setEligibilityStatus('unchecked');
      setEligibilityResult(null);
    }

    const nextPrescriptionDate = normalizeJahisDateInputValue(parsed.provider.prescriptionDate);
    if (parsed.provider.institutionName) setInstitutionName(parsed.provider.institutionName);
    if (parsed.provider.institutionCode) setInstitutionCode(parsed.provider.institutionCode);
    if (parsed.provider.departmentName) setDepartmentName(parsed.provider.departmentName);
    if (parsed.provider.doctorName) setDoctorName(parsed.provider.doctorName);
    if (nextPrescriptionDate) {
      setPrescriptionDate(nextPrescriptionDate);
      setDispensingDate(nextPrescriptionDate);
    }

    if (hasItems) {
      const resolvedPrescriptions = await buildPrescriptionsFromParsedItems(parsed.items, 'qr');
      setPrescriptions(resolvedPrescriptions.length > 0
        ? resolvedPrescriptions
        : [createEmptyPrescription('rp_initial', { id: 'item_initial' })]);
      const unmatchedCount = resolvedPrescriptions.filter((prescription) => !prescription.drugCode).length;
      if (unmatchedCount > 0) {
        toast.warning(`処方箋QRを反映しました。薬品マスター未照合が${unmatchedCount}件あります。`);
      } else {
        toast.success(`処方箋QRを反映しました（${segmentCount}QR / ${resolvedPrescriptions.length}薬品）。`);
      }
    } else {
      toast.warning('QRコードから患者・処方元情報を反映しました。処方薬は読み取れませんでした。');
    }

    if (parsed.warnings.length > 0) {
      toast.warning(parsed.warnings.slice(0, 2).join(' / '));
    }
    setElectronicPrescriptionStatus('unchecked');
    setElectronicPrescriptionMessage(`${qrSourceLabel[source]}で読み取った処方箋QRを反映しました。電子処方箋ではありません。`);
  }, [hasCurrentPrescriptionInput]);

  const applyPatientCandidate = useCallback((patient: PatientCandidate) => {
    setSelectedPatientId(patient.patientId);
    setPatientName(patient.name);
    setPatientBirthDate(patient.birthDate);
    if (patient.insuranceInfo?.number) setInsuranceNumber(patient.insuranceInfo.number);
    if (patient.insuranceInfo?.burdenRatio) setBurdenRatio(String(patient.insuranceInfo.burdenRatio));
    setEligibilityStatus('unchecked');
    setEligibilityResult(null);
  }, []);

  const openPatientMergeReview = useCallback(async (sourcePatient: PatientCandidate) => {
    if (!db || !selectedPatient) return;
    if (sourcePatient.patientId === selectedPatient.patientId) {
      setPatientMergeMessage('同じ患者は統合できません。');
      return;
    }

    setIsLoadingPatientMergeReview(true);
    setPatientMergeMessage('');
    try {
      const [sourceVisitDocs, sourceAlertDocs] = await Promise.all([
        db.visits.find({ selector: { patientId: sourcePatient.patientId } }).exec(),
        db.alerts.find({ selector: { patientId: sourcePatient.patientId } }).exec()
      ]);
      const plan = buildPatientMergePlan({
        targetPatient: selectedPatient,
        sourcePatient,
        sourceVisits: sourceVisitDocs.map((visitDoc) => ({ visitId: visitDoc.get('visitId') })),
        sourceAlerts: sourceAlertDocs.map((alertDoc) => ({ alertId: alertDoc.get('alertId') }))
      });
      setPatientMergeReview({
        sourcePatientId: sourcePatient.patientId,
        plan,
        executionPlan: buildPatientMergeExecutionPlan(plan)
      });
    } catch (error) {
      console.error('Failed to build patient merge review:', error);
      setPatientMergeReview(null);
      setPatientMergeMessage('統合確認を作れませんでした。候補を選び直してください。');
    } finally {
      setIsLoadingPatientMergeReview(false);
    }
  }, [db, selectedPatient]);

  const handleApplyPatientMerge = useCallback(async () => {
    if (!db || !patientMergeReview) return;
    const { executionPlan, plan } = patientMergeReview;
    if (!executionPlan.canApply) {
      setPatientMergeMessage('統合前の確認事項を見直してください。');
      return;
    }

    if (!window.confirm('統合元患者を削除し、受付とアラートを残す患者へ付け替えます。実行しますか？')) {
      return;
    }

    const store = createRxdbPatientMergeExecutionStore(db);
    setIsApplyingPatientMerge(true);
    setPatientMergeMessage('');
    try {
      const result = await applyPatientMergeExecutionPlan(store, executionPlan);
      await logAuditAction(
        db,
        'prescription_edit',
        `患者統合実行: ${plan.summary}。${result.auditDetail}`,
        plan.targetPatientId,
        plan.mergedPatient.name
      );
      setPatientCandidates((current) => current
        .filter((patient) => patient.patientId !== plan.sourcePatientId)
        .map((patient) => (
          patient.patientId === plan.targetPatientId
            ? { ...plan.mergedPatient, doc: patient.doc }
            : patient
        )));
      setSelectedPatientId(plan.targetPatientId);
      setPatientName(plan.mergedPatient.name);
      setPatientBirthDate(plan.mergedPatient.birthDate);
      if (plan.mergedPatient.insuranceInfo?.number) setInsuranceNumber(plan.mergedPatient.insuranceInfo.number);
      if (plan.mergedPatient.insuranceInfo?.burdenRatio) setBurdenRatio(String(plan.mergedPatient.insuranceInfo.burdenRatio));
      setPatientMergeReview(null);
      setPatientMergeMessage('患者統合を実行しました。受付とアラートを残す患者へ付け替えました。');
      toast.success('患者統合を実行しました。');
    } catch (error) {
      console.error('Failed to apply patient merge:', error);
      if (error instanceof PatientMergeExecutionError && error.rollbackOperations.length > 0) {
        try {
          for (const operation of error.rollbackOperations) {
            await applyPatientMergeOperation(store, operation);
          }
          setPatientMergeMessage('患者統合に失敗したため、適用済みの操作を取り消しました。候補を確認し直してください。');
        } catch (rollbackError) {
          console.error('Failed to rollback patient merge:', rollbackError);
          setPatientMergeMessage('患者統合に失敗し、取り消しにも失敗しました。監査ログと患者データを確認してください。');
        }
      } else {
        setPatientMergeMessage('患者統合を実行できませんでした。候補を確認し直してください。');
      }
      toast.error('患者統合に失敗しました。');
    } finally {
      setIsApplyingPatientMerge(false);
    }
  }, [db, patientMergeReview]);

  const applyProviderHistory = useCallback((provider: ProviderHistoryOption) => {
    setInstitutionCode(provider.institutionCode);
    setInstitutionName(provider.institutionName);
    if (!departmentName && provider.departments.length > 0) setDepartmentName(provider.departments[0]);
    if (!doctorName && provider.doctors.length > 0) setDoctorName(provider.doctors[0]);
  }, [departmentName, doctorName]);

  const matchingProviderHistory = useMemo(() => {
    return matchProviderHistory(providerHistory, { institutionCode, institutionName });
  }, [institutionCode, institutionName, providerHistory]);

  const selectedProvider = useMemo(() => {
    const code = institutionCode.trim();
    const name = institutionName.trim();
    return providerHistory.find((provider) => (
      (code && provider.institutionCode === code) ||
      (name && provider.institutionName === name)
    ));
  }, [institutionCode, institutionName, providerHistory]);

  // OCRの生テキストを解析し、QR取込と同じ編集フォームへ下書き転記する。
  // 読み取れなかった項目は空のまま残し、RAWテキストを見ながら手で直せるようにする。
  const applyOcrParsedResult = useCallback(async (rawText: string) => {
    const parsed = parsePrescriptionOcrText(rawText);

    if (parsed.matchedFieldCount === 0) {
      toast.warning('OCR結果から自動転記できる項目が見つかりませんでした。原本を確認しながら手入力してください。');
      return;
    }

    const nextBirthDate = normalizeJahisDateInputValue(parsed.patient.birthDate);
    if (parsed.patient.name) setPatientName(parsed.patient.name);
    if (nextBirthDate) setPatientBirthDate(nextBirthDate);
    if (parsed.patient.name || nextBirthDate) {
      setSelectedPatientId(null);
      setEligibilityStatus('unchecked');
      setEligibilityResult(null);
    }

    const nextPrescriptionDate = normalizeJahisDateInputValue(parsed.provider.prescriptionDate);
    if (parsed.provider.institutionName) setInstitutionName(parsed.provider.institutionName);
    if (parsed.provider.departmentName) setDepartmentName(parsed.provider.departmentName);
    if (parsed.provider.doctorName) setDoctorName(parsed.provider.doctorName);
    if (nextPrescriptionDate) {
      setPrescriptionDate(nextPrescriptionDate);
      setDispensingDate(nextPrescriptionDate);
    }

    if (parsed.items.length > 0) {
      const resolvedPrescriptions = await buildPrescriptionsFromParsedItems(parsed.items, 'ocr');
      setPrescriptions(resolvedPrescriptions);
      const unmatchedCount = resolvedPrescriptions.filter((prescription) => !prescription.drugCode).length;
      if (unmatchedCount > 0) {
        toast.warning(`OCR結果を下書き転記しました。薬品マスター未照合が${unmatchedCount}件あります。各行を確認してください。`);
      } else {
        toast.success(`OCR結果を下書き転記しました（薬品${resolvedPrescriptions.length}件）。原本と照合して修正してください。`);
      }
    } else {
      toast.warning('OCRから患者・処方元情報のみ転記しました。処方薬は読み取れませんでした。');
    }
  }, []);

  const startOcr = useCallback(async (file: File) => {
    setIsProcessing(true);
    try {
      // ⚡ Bolt: Dynamically import heavy OCR processing to reduce initial bundle size
      const { processPrescription } = await import('@/lib/ocr/processor');
      const result = await processPrescription(file);
      setOcrResult(result);
      await applyOcrParsedResult(result);
    } catch (err) {
      // 🛡️ Sentinel: Do not leak raw error objects to the UI, but log for debugging
      console.error('Failed to process prescription image:', err);
      toast.error('解析に失敗しました。');
    } finally {
      setIsProcessing(false);
    }
  }, [applyOcrParsedResult]);

  const handleFileSelection = useCallback((file: File) => {
    // 🛡️ Sentinel: Validate MIME type and file size (prevent malicious uploads and DoS)
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast.error('画像ファイル(JPG, PNG)またはPDFファイルを選択してください。');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('ファイルサイズは10MB以下にしてください。');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setImage(objectUrl);

    // Trigger processing simulation or actual logic
    startOcr(file);
  }, [startOcr]);



  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
  }, [handleFileSelection]);


  const handlePrescriptionChange = useCallback((id: string, field: string, value: PrescriptionFieldValue, index: number) => {
    setPrescriptions((prev) => {
      // ⚡ Bolt: Optimize hot path by attempting direct index access first,
      // falling back to findIndex if the array mutated asynchronously.
      let targetIndex = prev[index]?.id === id ? index : prev.findIndex((p) => p.id === id);
      if (targetIndex === -1) return prev;
      const next = [...prev];
      if (field === 'usage' || field === 'days' || field === 'rpComment') {
        const targetRpId = next[targetIndex].rpId;
        return next.map((prescription) => (
          prescription.rpId === targetRpId ? { ...prescription, [field]: value } : prescription
        ));
      }
      next[targetIndex] = { ...next[targetIndex], [field]: value };
      return next;
    });
  }, []);

  const handleRpFieldChange = useCallback((rpId: string, field: 'usage' | 'days' | 'rpComment', value: string) => {
    setPrescriptions((prev) => prev.map((prescription) => (
      prescription.rpId === rpId ? { ...prescription, [field]: value } : prescription
    )));
  }, []);

  const handleRpDosageCategoryChange = useCallback((rpId: string, category: DosageCategory | null) => {
    setPrescriptions((prev) => prev.map((prescription) => (
      prescription.rpId === rpId
        ? {
            ...prescription,
            dosageCategory: category || undefined,
            dosageCategorySource: category ? 'manual' as const : undefined
          }
        : prescription
    )));
  }, []);

  const handleAddDrugToRp = useCallback((rpId: string) => {
    setPrescriptions((prev) => {
      const next = [...prev];
      const lastIndex = next.reduce((foundIndex, prescription, index) => (
        prescription.rpId === rpId ? index : foundIndex
      ), -1);
      const template = next[lastIndex];
      const insertIndex = lastIndex >= 0 ? lastIndex + 1 : next.length;
      next.splice(insertIndex, 0, createEmptyPrescription(rpId, {
        usage: template?.usage || '',
        days: template?.days || '',
        rpComment: template?.rpComment || '',
        dosageCategory: template?.dosageCategory,
        dosageCategorySource: template?.dosageCategorySource
      }));
      return next;
    });
  }, []);

  const handleAddRpAfter = useCallback((rpId: string) => {
    setPrescriptions((prev) => {
      const next = [...prev];
      const lastIndex = next.reduce((foundIndex, prescription, index) => (
        prescription.rpId === rpId ? index : foundIndex
      ), -1);
      const insertIndex = lastIndex >= 0 ? lastIndex + 1 : next.length;
      next.splice(insertIndex, 0, createEmptyPrescription());
      return next;
    });
  }, []);

  const handleDeletePrescription = useCallback((id: string) => {
    setPrescriptions((prev) => {
      if (prev.length <= 1) {
        return [createEmptyPrescription('rp_initial', { id: 'item_initial' })];
      }
      const next = prev.filter((prescription) => prescription.id !== id);
      return next.length > 0 ? next : [createEmptyPrescription('rp_initial', { id: 'item_initial' })];
    });
  }, []);

  const handleToggleIppoka = useCallback((id: string, checked: boolean, index: number) => {
    setPrescriptions((prev) => {
      let targetIndex = prev[index]?.id === id ? index : prev.findIndex((p) => p.id === id);
      if (targetIndex === -1) return prev;
      const next = [...prev];
      next[targetIndex] = { ...next[targetIndex], isIppoka: checked };
      return next;
    });
  }, []);

  const handleToggleCrushed = useCallback((id: string, checked: boolean, index: number) => {
    setPrescriptions((prev) => {
      let targetIndex = prev[index]?.id === id ? index : prev.findIndex((p) => p.id === id);
      if (targetIndex === -1) return prev;
      const next = [...prev];
      next[targetIndex] = { ...next[targetIndex], isCrushed: checked };
      return next;
    });
  }, []);

  const handleToggleReceiptRemark = useCallback((id: string, checked: boolean, index: number) => {
    setPrescriptions((prev) => {
      let targetIndex = prev[index]?.id === id ? index : prev.findIndex((p) => p.id === id);
      if (targetIndex === -1) return prev;
      const next = [...prev];
      next[targetIndex] = {
        ...next[targetIndex],
        showReceiptRemark: checked,
        receiptRemark: checked ? next[targetIndex].receiptRemark : ''
      };
      return next;
    });
  }, []);

  const handleReset = () => {
    if (window.confirm('入力内容と画像を破棄して最初からやり直しますか？')) {
      setImage(null);
      setIsManualEntry(false);
      setPatientName('');
      setPatientBirthDate('');
      setInsuranceNumber('');
      setBurdenRatio('30');
      setSelectedPatientId(null);
      setPatientCandidates([]);
      setPatientMergeReview(null);
      setPatientMergeMessage('');
      setMynaMessage('');
      setEligibilityStatus('unchecked');
      setEligibilityMessage('');
      setElectronicPrescriptionKey('');
      setElectronicPrescriptionKeyKind('exchange_number');
      setElectronicPrescriptionInsuredNumber('');
      setElectronicPrescriptionStatus('unchecked');
      setElectronicPrescriptionMessage('');
      setElectronicPrescriptionWarnings([]);
      setElectronicPrescriptionIntegrityHash('');
      setPendingElectronicPrescription(null);
      setElectronicPrescriptionPaperOriginalConfirmed(false);
      setAppliedElectronicPrescription(null);
      setPreviousPrescriptions([]);
      setPreviousDoSnapshot(null);
      setInstitutionCode('');
      setInstitutionName('');
      setDepartmentName('');
      setDoctorName('');
      setPrescriptionDate(toDateInputValue());
      setDispensingDate(toDateInputValue());
      setPrescriptions([createEmptyPrescription('rp_initial', { id: 'item_initial' })]);
      setOcrResult('');
    }
  };

  const handleSave = async () => {
    if (!db) return;

    // Input Validation
    if (!patientName.trim()) {
      alert('患者名を入力してください。');
      return;
    }

    if (!patientBirthDate.trim()) {
      alert('生年月日を入力してください。');
      return;
    }

    if (Number.isNaN(new Date(patientBirthDate).getTime())) {
      alert('生年月日を正しく入力してください。');
      return;
    }

    if (insuranceNumber.trim() && !INSURANCE_NUMBER_REGEX.test(insuranceNumber.trim())) {
      alert('保険者番号は半角数字で入力してください。');
      return;
    }

    if (!institutionName.trim()) {
      alert('医療機関名を入力してください。');
      return;
    }

    if (!departmentName.trim()) {
      alert('診療科を入力してください。');
      return;
    }

    if (!doctorName.trim()) {
      alert('医師名を入力してください。');
      return;
    }

    if (!prescriptionDate || !dispensingDate) {
      alert('処方日と調剤日を選択してください。');
      return;
    }

    if (prescriptions.length === 0) {
      alert('処方内容が入力されていません。');
      return;
    }

    for (let i = 0; i < prescriptions.length; i++) {
      const p = prescriptions[i];
      if (!p.drugName.trim() || !p.drugCode) {
        toast.error(`処方薬${i + 1}: 薬品名を選択してください。`);
        return;
      }
      if (!p.amount || isNaN(parseFloat(p.amount)) || parseFloat(p.amount) <= 0) {
        toast.error(`処方薬${i + 1}: 数量を正しく入力してください。`);
        return;
      }
      if (p.days === '' || isNaN(parseInt(p.days, 10)) || parseInt(p.days, 10) < 0) {
        toast.error(`処方薬${i + 1}: 日数を0以上で入力してください。`);
        return;
      }
      // 【般】一般名処方は記載上の概念であり、在庫・ピッキングは銘柄(調剤薬)で追跡する。
      // 調剤薬が未選択のままだと般コードで在庫参照してしまうため、ここで止める。
      if (isGeneralNameDrugRecord({ code: p.drugCode, name: p.drugName }) && !p.dispensedDrugCode) {
        toast.error(`処方薬${i + 1}: 一般名処方です。調剤薬(銘柄)を候補から選択してください。`);
        return;
      }
    }

    setIsSaving(true);

    // Generate unique IDs
    const visitId = `v_${generateUUID()}`;

    try {
      const patientDocs = await db.patients.find().exec();
      const patientCandidates = patientDocs.map((patientDoc) => ({
        ...patientDoc.toJSON(),
        doc: patientDoc
      }));
      const selectedExistingPatient = selectedPatientId
        ? patientCandidates.find((patient) => patient.patientId === selectedPatientId)
        : undefined;
      const patientMatch = selectedExistingPatient
        ? undefined
        : findMatchingPatient(patientCandidates, {
            name: patientName,
            birthDate: patientBirthDate,
            insuranceNumber
          });
      const existingPatient = selectedExistingPatient || patientMatch?.patient;
      const patientId = existingPatient?.patientId || `pt_${generateUUID()}`;
      const currentInsuranceNumber = insuranceNumber.trim();
      const savedEligibilityStatus = toPatientEligibilityStatus(eligibilityStatus);
      const eligibilityPatch = eligibilityResult?.insuranceInfoPatch || {};
      const insurancePayload = {
        ...(existingPatient?.insuranceInfo || {}),
        ...(currentInsuranceNumber ? { number: currentInsuranceNumber } : {}),
        ...eligibilityPatch,
        burdenRatio: eligibilityPatch.burdenRatio ?? parseInt(burdenRatio, 10),
        ...((savedEligibilityStatus && !eligibilityPatch.eligibilityStatus)
          ? {
              eligibilityStatus: savedEligibilityStatus,
              eligibilityCheckedAt: new Date().toISOString()
            }
          : {})
      };
      const eligibilityPublicInsurances = eligibilityResult?.publicInsurances?.filter((publicInsurance) => (
        publicInsurance.provider && publicInsurance.recipient
      ));
      const existingPublicInsurances = existingPatient?.publicInsurances?.map((publicInsurance) => ({ ...publicInsurance }));
      const publicInsurancesPayload = eligibilityPublicInsurances && eligibilityPublicInsurances.length > 0
        ? eligibilityPublicInsurances
        : existingPublicInsurances;
      const patientUpdatePayload = {
        name: patientName,
        birthDate: patientBirthDate,
        insuranceInfo: insurancePayload,
        ...(publicInsurancesPayload ? { publicInsurances: publicInsurancesPayload } : {})
      };
      const patientMasterChanges = existingPatient
        ? describePatientMasterChanges(existingPatient, patientUpdatePayload)
        : [];
      let lockedClaimCountForPatient = 0;
      if (existingPatient && patientMasterChanges.length > 0) {
        const existingPatientVisits = await db.visits.find({ selector: { patientId } }).exec();
        lockedClaimCountForPatient = existingPatientVisits.filter((visit) => isClaimEditBlocked(visit.claimLifecycle)).length;
      }

      // ⚡ Bolt: Use a manual for loop instead of .map() to avoid intermediate array/closure allocations
      const prescriptionItems = new Array(prescriptions.length);
      const rpNumberById = new Map<string, number>();
      let nextRpNumber = 1;
      for (let i = 0; i < prescriptions.length; i++) {
        const item = prescriptions[i];
        if (!rpNumberById.has(item.rpId)) {
          rpNumberById.set(item.rpId, nextRpNumber);
          nextRpNumber++;
        }
        prescriptionItems[i] = {
          itemId: `item_${generateUUID()}`,
          visitId,
          rpNumber: rpNumberById.get(item.rpId) || i + 1,
          drugId: item.drugCode,
          dispensedDrug: getEffectiveDispensedDrug(item) || item.drugName,
          dispensedDrugCode: item.dispensedDrugCode || '',
          prescribedDrugCodeStatus: item.prescribedDrugCodeStatus,
          // 空文字はスキーマの format: 'date' 検証に落ちるため、値があるときだけ含める
          ...(item.prescribedDrugCodeAbolishedAt
            ? { prescribedDrugCodeAbolishedAt: item.prescribedDrugCodeAbolishedAt }
            : {}),
          electronicSourceDrugName: item.electronicSourceDrugName || '',
          electronicMasterDrugName: item.electronicMasterDrugName || '',
          electronicDrugNameVerificationStatus: item.electronicDrugNameVerificationStatus,
          ...(item.electronicDrugNameVerificationCheckedAt
            ? { electronicDrugNameVerificationCheckedAt: item.electronicDrugNameVerificationCheckedAt }
            : {}),
          unitCode: item.unitCode || '',
          unitText: item.unitText || '',
          electronicUnitConversion: item.electronicUnitConversion,
          electronicUsageCode: item.electronicUsageCode || '',
          electronicUsageFallbackText: item.electronicUsageFallbackText || '',
          electronicUsageSupplementText: item.electronicUsageSupplementText || '',
          changeReason: item.changeReason,
          amount: parseFloat(item.amount) || 1,
          usage: item.usage,
          days: Number.isFinite(parseInt(item.days, 10)) ? parseInt(item.days, 10) : 0,
          rpComment: item.rpComment?.trim() || '',
          dosageCategory: (item.dosageCategorySource === 'manual' && item.dosageCategory)
            ? item.dosageCategory
            : inferDosageCategory(item.drugName || getEffectiveDispensedDrug(item), item.usage),
          dosageCategorySource: item.dosageCategorySource === 'manual' ? 'manual' as const : 'auto' as const,
          isIppoka: !!item.isIppoka,
          isCrushed: !!item.isCrushed,
          tokkanType: item.tokkanType || 'none',
          receiptRemark: item.showReceiptRemark ? (item.receiptRemark || '') : '',
          billingAgentGroupKey: item.billingAgentGroupKey?.trim() || '',
          billingAgentGroupReason: item.billingAgentGroupKey?.trim() ? (item.billingAgentGroupReason?.trim() || '') : ''
        };
      }

      const patientWrite = existingPatient?.doc
        ? existingPatient.doc.patch(patientUpdatePayload)
        : db.patients.insert({
            patientId,
            kana: '', // Empty placeholder
            gender: 'other',
            ...patientUpdatePayload
          });

      const [, , prescriptionItemsResult] = await Promise.all([
        patientWrite,
        db.visits.insert({
          visitId,
          patientId,
          institutionId: institutionName.trim().slice(0, 100),
          institutionCode: institutionCode.trim(),
          institutionName: institutionName.trim(),
          departmentName: departmentName.trim(),
          doctorId: doctorName.trim(),
          doctorName: doctorName.trim(),
          prescriptionDate,
          dispensingDate,
          issueDate: dateInputToIso(dispensingDate),
          status: 'processing', // 処方入力済みステータスとして扱う
          ...(appliedElectronicPrescription
            ? { electronicPrescription: appliedElectronicPrescription }
            : {})
        }),
        db.prescription_items.bulkInsert(prescriptionItems),
      ]);

      // bulkInsertは個別docの失敗を例外にしないため、明示的に確認して処方明細の黙失を防ぐ
      if (prescriptionItemsResult?.error?.length > 0) {
        console.error('Failed to insert prescription items:', JSON.stringify(prescriptionItemsResult.error, null, 2).slice(0, 4000));
        throw new Error(`処方明細の保存に失敗しました（${prescriptionItemsResult.error.length}件）。`);
      }

      // 監査ログの記録
      await logAuditAction(
        db,
        'prescription_ocr',
        `処方箋受付: ${existingPatient ? '既存患者選択' : '簡易新規患者登録'}「${patientName}」の処方データ（${institutionName.trim()} ${departmentName.trim()} ${doctorName.trim()}、処方薬${prescriptionItems.length}件）を登録しました。`,
        patientId,
        patientName
      );
      if (existingPatient && patientMasterChanges.length > 0) {
        await logAuditAction(
          db,
          'prescription_edit',
          `患者マスター更新: OCR受付に伴い「${patientName}」の患者情報を更新しました（${patientMasterChanges.join(' / ')}）。${lockedClaimCountForPatient > 0 ? `ロック済み請求${lockedClaimCountForPatient}件は請求時点スナップショットで確認できます。` : 'ロック済み請求はありません。'}`,
          patientId,
          patientName
        );
      }

      // Transition to print page
      toast.success('データを保存しました。');
      router.push(`/print/${visitId}`);
    } catch (error) {
      // 🛡️ Sentinel: Do not leak raw error objects to the UI, but log for debugging
      console.error('Failed to save data securely:', error);
      toast.error('保存に失敗しました。');
      setIsSaving(false); // Only set to false on error, success redirects
    }
  };

  const isEditorOpen = !!image || isManualEntry;

  return (
    <div className="ocr-page">
      <div className="page-header">
        <div>
          <h1>処方箋受付</h1>
          <p className="text-muted">OCRまたは手入力で処方内容を受付し、印刷画面へ進みます。</p>
        </div>

        <div className="flex gap-2 align-center">
          <WorkflowMiniTutorial
            kind="input"
            userId={getCurrentUser().userId}
            autoOpen
          />
        </div>
      </div>

      {!isEditorOpen ? (
        <div className="reception-choice-grid">
          <label
            className={`upload-zone glass flex-center ${isDragging ? 'drag-active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="text-center">
              <Upload size={48} className="mb-4 text-ghost" />
              <p>画像をドロップするか、クリックして選択</p>
              <span className="text-ghost text-sm">JPG, PNG, PDF (10MBまで)</span>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden-input"
              accept="image/*,application/pdf"
            />
          </label>

          <div className="reception-entry-stack">
            <button
              type="button"
              className="manual-entry-card glass"
              onClick={() => setIsManualEntry(true)}
            >
              <FileSearch size={42} aria-hidden="true" />
              <span className="manual-entry-title">OCRなしで手入力受付</span>
              <span className="manual-entry-subtitle">患者情報と処方内容を直接入力します。</span>
            </button>

            <button
              type="button"
              className="manual-entry-card glass"
              data-testid="electronic-prescription-entry"
              onClick={() => {
                setIsManualEntry(true);
                setElectronicPrescriptionMessage('引換番号または処方箋IDを入力して取得してください。');
              }}
            >
              <FileSearch size={42} aria-hidden="true" />
              <span className="manual-entry-title">電子処方箋で受付</span>
              <span className="manual-entry-subtitle">yakurekiの接続モジュールから取得して確認します。</span>
            </button>

            <PrescriptionQrReader
              onApplyQrData={handleApplyPrescriptionQrData}
              disabled={isSaving}
            />
          </div>
        </div>
      ) : (
        <div className={`side-by-side-container ${image ? '' : 'manual-mode'}`}>
          <div className="visual-column card">
            <div className="column-label">
              <FileSearch size={16} /> {image ? '処方箋イメージ' : '手入力受付'}
              <button
                className="btn-trash ml-auto"
                onClick={handleReset}
                aria-label="受付をやり直す"
                title="受付をやり直す"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
            {image ? (
              <div className="image-preview-container">
                <Image
                  src={image}
                  alt="処方箋イメージ"
                  fill
                  sizes="(max-width: 900px) 100vw, 50vw"
                  unoptimized
                  className="prescription-preview-image"
                />
              </div>
            ) : (
              <div className="manual-placeholder">
                <FileSearch size={48} aria-hidden="true" />
                <strong>手入力受付</strong>
                <span>処方箋画像なしで、右側のフォームから受付できます。</span>
              </div>
            )}
          </div>

          {/* Right: Extracted Data / Form */}
          <div className="editor-column card">
            <div className="column-label">
              <CheckCircle size={16} /> {image ? '抽出データ / 修正' : '受付データ入力'}
              {isProcessing && <span className="processing-tag">解析中...</span>}
            </div>

            <div className="input-readiness-strip" aria-label="受付入力状況">
              <div className={`readiness-item ${patientName.trim() && patientBirthDate ? 'ready' : 'attention'}`}>
                <span>患者</span>
                <strong>{patientName.trim() && patientBirthDate ? '入力済' : '未入力'}</strong>
              </div>
              <div className={`readiness-item ${institutionName.trim() && departmentName.trim() && doctorName.trim() ? 'ready' : 'attention'}`}>
                <span>処方元</span>
                <strong>{institutionName.trim() && departmentName.trim() && doctorName.trim() ? '入力済' : '未入力'}</strong>
              </div>
              <div className={`readiness-item ${prescriptionMetrics.missingTotal === 0 ? 'ready' : 'attention'}`}>
                <span>処方</span>
                <strong>{prescriptionMetrics.missingTotal === 0 ? '入力済' : `未入力 ${prescriptionMetrics.missingTotal}`}</strong>
              </div>
            </div>

            <OcrConfidencePanel
              report={ocrConfidenceReport}
              isProcessing={isProcessing}
              hasImage={!!image}
            />

            <div className="ocr-form">
              <div className="form-group">
                <label htmlFor="patientName">
                  患者名
                  <span className="text-danger ml-1 text-sm" aria-hidden="true">*</span>
                </label>
                <input
                  id="patientName"
                  type="text"
                  placeholder={image ? '読み取り中...' : '患者名を入力'}
                  maxLength={100}
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  required
                  aria-required="true"
                />
              </div>

              <div className="form-row">
                <div className="form-group" style={{ width: '180px' }}>
                  <label htmlFor="patientBirthDate">
                    生年月日
                    <span className="text-danger ml-1 text-sm" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="patientBirthDate"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="例: 19850315"
                    maxLength={10}
                    value={patientBirthDate}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const digitsOnly = raw.replace(/[^\d]/g, '');
                      // 半角8桁が揃った時点でYYYY-MM-DDへ自動変換する(生年月日8桁検索と同じ入力方式)。
                      // 揃うまで・不正な日付のままはそのまま表示し、入力途中で書き換えない。
                      const normalized = digitsOnly.length === 8 ? parseFlexibleDateInput(digitsOnly) : undefined;
                      setPatientBirthDate(normalized || raw);
                    }}
                    required
                    aria-required="true"
                  />
                  <span className="field-hint">半角8桁(例: 19850315)でも入力できます</span>
                </div>

                <div className="form-group flex-1">
                  <label htmlFor="insuranceNumber">
                    保険者番号
                  </label>
                  <input
                    id="insuranceNumber"
                    type="text"
                    maxLength={20}
                    value={insuranceNumber}
                    onChange={(e) => {
                      setInsuranceNumber(e.target.value);
                      setEligibilityStatus('unchecked');
                      setEligibilityResult(null);
                    }}
                    placeholder="未入力でも受付可"
                  />
                </div>

                <div className="form-group" style={{ width: '120px' }}>
                  <label htmlFor="burdenRatio">
                    負担割合
                  </label>
                  <select
                    id="burdenRatio"
                    value={burdenRatio}
                    onChange={(e) => setBurdenRatio(e.target.value)}
                    className="w-full"
                    style={{ padding: '0.6rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'white' }}
                  >
                    <option value="10">1割</option>
                    <option value="20">2割</option>
                    <option value="30">3割</option>
                  </select>
                </div>
              </div>

              <div className="reception-tool-row">
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={handleMynaRead}
                  disabled={isReadingMyna}
                >
                  {isReadingMyna ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                  {isReadingMyna ? '読取中...' : 'マイナ読取で自動入力'}
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  onClick={handleEligibilityCheck}
                  disabled={!normalizeInsuranceNumber(insuranceNumber) || eligibilityStatus === 'checking'}
                >
                  {eligibilityStatus === 'checking' ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  オンライン資格確認
                </button>
                {eligibilityMessage && (
                  <span
                    className={`status-chip ${eligibilityStatus}`}
                    title={eligibilityResult ? formatOnlineEligibilityFieldMappingReport(eligibilityResult.fieldMapping) : undefined}
                  >
                    {eligibilityMessage}
                  </span>
                )}
                {mynaMessage && (
                  <span className="status-chip confirmed">
                    {mynaMessage}
                  </span>
                )}
              </div>

              <PrescriptionQrReader
                onApplyQrData={handleApplyPrescriptionQrData}
                disabled={isProcessing || isSaving}
              />

              <section
                className="electronic-prescription-panel"
                data-testid="electronic-prescription-panel"
                aria-label="電子処方箋受付"
              >
                <div className="electronic-prescription-header">
                  <div>
                    <span className="section-kicker">電子処方箋</span>
                    <strong>取得内容を確認して受付</strong>
                  </div>
                  <span className={`status-chip ${electronicPrescriptionStatus}`}>
                    {appliedElectronicPrescription
                      ? `反映済み ${appliedElectronicPrescriptionIds.length}件`
                      : electronicPrescriptionStatus === 'confirmed'
                        ? '取得済み'
                      : electronicPrescriptionStatus === 'checking'
                        ? '取得中'
                        : electronicPrescriptionStatus === 'warning'
                          ? '要確認'
                          : electronicPrescriptionStatus === 'unavailable'
                            ? '未接続'
                            : '未取得'}
                  </span>
                </div>
                <div className="electronic-prescription-controls">
                  <div
                    className="electronic-prescription-key-kind"
                    role="radiogroup"
                    aria-label="電子処方箋取得キー種別"
                    data-testid="electronic-prescription-key-kind"
                  >
                    <button
                      type="button"
                      className={electronicPrescriptionKeyKind === 'exchange_number' ? 'active' : ''}
                      aria-pressed={electronicPrescriptionKeyKind === 'exchange_number'}
                      onClick={() => {
                        setElectronicPrescriptionKeyKind('exchange_number');
                        setPendingElectronicPrescription(null);
                        setElectronicPrescriptionPaperOriginalConfirmed(false);
                      }}
                      data-testid="electronic-prescription-key-kind-exchange"
                    >
                      引換番号
                    </button>
                    <button
                      type="button"
                      className={electronicPrescriptionKeyKind === 'prescription_id' ? 'active' : ''}
                      aria-pressed={electronicPrescriptionKeyKind === 'prescription_id'}
                      onClick={() => {
                        setElectronicPrescriptionKeyKind('prescription_id');
                        setPendingElectronicPrescription(null);
                        setElectronicPrescriptionPaperOriginalConfirmed(false);
                      }}
                      data-testid="electronic-prescription-key-kind-prescription-id"
                    >
                      処方箋ID
                    </button>
                  </div>
                  <label htmlFor="electronicPrescriptionKey">引換番号・処方箋ID</label>
                  <input
                    id="electronicPrescriptionKey"
                    type="text"
                    maxLength={80}
                    value={electronicPrescriptionKey}
                    onChange={(e) => {
                      setElectronicPrescriptionKey(e.target.value);
                      setPendingElectronicPrescription(null);
                      setElectronicPrescriptionPaperOriginalConfirmed(false);
                    }}
                    placeholder={electronicPrescriptionKeyKind === 'exchange_number' ? '半角数字6〜16桁' : '英数字・ハイフン'}
                    data-testid="electronic-prescription-key"
                  />
                  <label htmlFor="electronicPrescriptionInsuredNumber">
                    被保険者番号{electronicPrescriptionKeyKind === 'exchange_number' ? '（必須）' : '（任意照合）'}
                  </label>
                  <input
                    id="electronicPrescriptionInsuredNumber"
                    type="text"
                    maxLength={40}
                    value={electronicPrescriptionInsuredNumber}
                    onChange={(event) => {
                      setElectronicPrescriptionInsuredNumber(event.target.value);
                      setPendingElectronicPrescription(null);
                      setElectronicPrescriptionPaperOriginalConfirmed(false);
                    }}
                    placeholder={electronicPrescriptionKeyKind === 'exchange_number' ? '引換番号での取得時に入力' : '患者照合に使う場合だけ入力'}
                    data-testid="electronic-prescription-insured-number"
                  />
                  <button
                    type="button"
                    className="btn-secondary flex-center gap-2"
                    onClick={() => handleElectronicPrescriptionFetch(patientBirthDate)}
                    disabled={isFetchingElectronicPrescription}
                    data-testid="electronic-prescription-fetch"
                  >
                    {isFetchingElectronicPrescription ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    {isFetchingElectronicPrescription ? '取得中...' : '取得して確認'}
                  </button>
                </div>
                <p className="electronic-prescription-note">
                  引換番号での取得には被保険者番号が必要です。接続先未設定時は取得せず、デモ応答も本番受付へ反映しません。
                </p>
                {electronicPrescriptionMessage && (
                  <div className={`electronic-prescription-message ${electronicPrescriptionStatus}`}>
                    {electronicPrescriptionMessage}
                  </div>
                )}
                {pendingElectronicPrescription?.prescription && electronicPrescriptionApplyDecision && (
                  <div className="electronic-prescription-review" data-testid="electronic-prescription-review">
                    <dl>
                      <div>
                        <dt>文書</dt>
                        <dd>
                          {pendingElectronicPrescription.prescription.documentKind === 'electronic_prescription'
                            ? '電子処方箋'
                            : pendingElectronicPrescription.prescription.documentKind === 'prescription_information'
                              ? '処方箋情報提供ファイル'
                              : '判定不能'}
                        </dd>
                      </div>
                      <div>
                        <dt>電子署名</dt>
                        <dd>{pendingElectronicPrescription.prescription.signatureVerification?.status || '未確認'}</dd>
                      </div>
                      <div>
                        <dt>有効期限</dt>
                        <dd>{pendingElectronicPrescription.prescription.validUntil || '不明'}</dd>
                      </div>
                      <div>
                        <dt>重複確認</dt>
                        <dd>{pendingElectronicPrescription.duplicateCheck?.status || 'not_checked'}</dd>
                      </div>
                      {pendingElectronicPrescription.prescription.refill && (
                        <div>
                          <dt>リフィル</dt>
                          <dd>
                            {pendingElectronicPrescription.prescription.refill.currentCount}
                            /{pendingElectronicPrescription.prescription.refill.totalCount}回目
                          </dd>
                        </div>
                      )}
                    </dl>
                    {(
                      pendingElectronicPrescription.prescription.items.some((item) => item.unitConversion || item.usageSupplementText)
                      || (pendingElectronicPrescription.prescription.supplementaryInformation?.prescriptionComments.length || 0) > 0
                      || (pendingElectronicPrescription.prescription.supplementaryInformation?.laboratoryResults.length || 0) > 0
                      || !!pendingElectronicPrescription.prescription.supplementaryInformation?.narcoticAdministration?.isNarcoticPrescription
                    ) && (
                      <div className="electronic-prescription-supplementary" data-testid="electronic-prescription-supplementary">
                        <strong>処方補足情報</strong>
                        <ul>
                          {pendingElectronicPrescription.prescription.items.flatMap((item) => [
                            ...(item.unitConversion ? [
                              `${item.drugName}: 単位変換 ${item.unitConversion.prescribedAmount}${item.unitConversion.prescribedUnitText}（係数 ${item.unitConversion.conversionFactor}）`
                            ] : []),
                            ...(item.usageSupplementText ? [`${item.drugName}: 用法補足 ${item.usageSupplementText}`] : [])
                          ]).map((text) => <li key={text}>{text}</li>)}
                          {pendingElectronicPrescription.prescription.supplementaryInformation?.prescriptionComments.map((comment) => (
                            <li key={`comment-${comment}`}>処方コメント: {comment}</li>
                          ))}
                          {pendingElectronicPrescription.prescription.supplementaryInformation?.laboratoryResults.map((result, index) => (
                            <li key={`lab-${result.testName}-${index}`}>
                              検査値: {result.testName} {result.value}{result.unit ? ` ${result.unit}` : ''}
                              {result.referenceRange ? `（基準 ${result.referenceRange}）` : ''}
                            </li>
                          ))}
                          {pendingElectronicPrescription.prescription.supplementaryInformation?.narcoticAdministration?.isNarcoticPrescription && (
                            <li>
                              麻薬施用情報: {pendingElectronicPrescription.prescription.supplementaryInformation.narcoticAdministration.displayText || '表示不可'}
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    {pendingElectronicPrescription.prescription.documentKind === 'prescription_information' && (
                      <label className="electronic-prescription-original-check">
                        <input
                          type="checkbox"
                          checked={electronicPrescriptionPaperOriginalConfirmed}
                          onChange={(event) => setElectronicPrescriptionPaperOriginalConfirmed(event.target.checked)}
                        />
                        <span>紙の処方箋原本を受領し、取得内容と照合しました</span>
                      </label>
                    )}
                    <div className={`electronic-prescription-decision ${electronicPrescriptionApplyDecision.status}`}>
                      <strong>{electronicPrescriptionApplyDecision.statusLabel}</strong>
                      <span>{electronicPrescriptionApplyDecision.message}</span>
                    </div>
                    <button
                      type="button"
                      className="btn-primary flex-center gap-2"
                      onClick={handleElectronicPrescriptionApply}
                      disabled={!electronicPrescriptionApplyDecision.canApply || pendingElectronicPrescriptionAlreadyApplied}
                      data-testid="electronic-prescription-apply"
                    >
                      <CheckCircle size={16} />
                      {pendingElectronicPrescriptionAlreadyApplied
                        ? 'この処方箋は反映済み'
                        : appliedElectronicPrescription
                          ? '同日処方として追加'
                          : '処方入力へ反映'}
                    </button>
                  </div>
                )}
                {displayedElectronicPrescriptionWarnings.length > 0 && (
                  <ul className="electronic-prescription-warnings">
                    {displayedElectronicPrescriptionWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
                {electronicPrescriptionIntegrityHash && (
                  <div className="electronic-prescription-hash">
                    取得内容SHA-256: {electronicPrescriptionIntegrityHash.slice(0, 16)}...
                  </div>
                )}
              </section>

              <div className="patient-selection-panel">
                <div className="panel-title">患者選択</div>
                {patientCandidates.length > 0 ? (
                  <div className="patient-candidate-list">
                    {patientCandidates.map((patient) => {
                      const match = patientCandidateMatchById.get(patient.patientId);
                      const canOpenMergeReview = !!selectedPatient && selectedPatient.patientId !== patient.patientId;
                      return (
                        <div
                          key={patient.patientId}
                          className={`patient-candidate risk-${match?.risk || 'medium'} ${selectedPatientId === patient.patientId ? 'selected' : ''}`}
                        >
                          <button
                            type="button"
                            className="patient-candidate-select"
                            onClick={() => applyPatientCandidate(patient)}
                          >
                            <span className="candidate-main">{patient.name}</span>
                            <span className="candidate-meta">
                              {patient.birthDate} / 保険者番号 {patient.insuranceInfo?.number || '未登録'}
                            </span>
                            {match && (
                              <span className="candidate-reasons">
                                {match.reasonLabels.map((label) => (
                                  <span key={label}>{label}</span>
                                ))}
                              </span>
                            )}
                            {match?.warning && (
                              <span className="candidate-warning">
                                <AlertTriangle size={12} aria-hidden="true" />
                                {match.warning}
                              </span>
                            )}
                          </button>
                          {canOpenMergeReview && (
                            <button
                              type="button"
                              className={`patient-merge-open ${patientMergeReview?.sourcePatientId === patient.patientId ? 'active' : ''}`}
                              onClick={() => openPatientMergeReview(patient)}
                              disabled={isLoadingPatientMergeReview || isApplyingPatientMerge}
                            >
                              <ShieldCheck size={13} aria-hidden="true" />
                              統合確認
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="temporary-registration-note">
                    <Plus size={16} aria-hidden="true" />
                    <span>一致する患者がいない場合は、名前・生年月日・保険者番号だけで簡易登録して取り揃えを開始します。</span>
                  </div>
                )}
                {selectedPatient && (
                  <div className="selected-patient-note">
                    選択中: {selectedPatient.name}（{selectedPatient.birthDate}）
                  </div>
                )}
                {(isLoadingPatientMergeReview || patientMergeReview || patientMergeMessage) && (
                  <div className="patient-merge-review">
                    <div className="patient-merge-review-title">
                      <ShieldCheck size={15} aria-hidden="true" />
                      同姓同名の統合確認
                    </div>
                    {isLoadingPatientMergeReview && (
                      <div className="merge-status-line">
                        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                        統合内容を確認しています
                      </div>
                    )}
                    {patientMergeReview && (
                      <>
                        <div className="merge-patient-grid">
                          <div>
                            <span>残す患者</span>
                            <strong>{patientMergeReview.plan.mergedPatient.name}</strong>
                            <small>{patientMergeReview.plan.targetPatientId}</small>
                          </div>
                          <div>
                            <span>統合元</span>
                            <strong>{patientMergeReview.plan.sourcePatient.name}</strong>
                            <small>{patientMergeReview.plan.sourcePatientId}</small>
                          </div>
                        </div>
                        <div className="merge-summary-row">
                          {patientMergeReview.plan.reassignments.map((reassignment) => (
                            <span key={reassignment.collection}>
                              {patientMergeCollectionLabel[reassignment.collection]} {reassignment.count}件
                            </span>
                          ))}
                          <span>確認事項 {patientMergeReview.plan.issues.length + patientMergeReview.plan.conflicts.length}件</span>
                        </div>
                        {(patientMergeReview.plan.issues.length > 0 || patientMergeReview.plan.conflicts.length > 0) && (
                          <div className="merge-warning-list">
                            {patientMergeReview.plan.issues.slice(0, 3).map((issue) => (
                              <span key={issue.code}>{issue.message}</span>
                            ))}
                            {patientMergeReview.plan.conflicts.slice(0, 3).map((conflict) => (
                              <span key={conflict.field}>{conflict.label}: {conflict.sourceValue} / {conflict.targetValue}</span>
                            ))}
                          </div>
                        )}
                        <div className="merge-operation-list">
                          {patientMergeReview.executionPlan.applyOperations.map((operation, index) => (
                            <span key={`${operation.type}-${index}`}>
                              {index + 1}. {formatPatientMergeOperationLabel(operation)}
                            </span>
                          ))}
                        </div>
                        <div className="merge-checklist">
                          {patientMergeReview.executionPlan.checklist.map((item) => (
                            <span key={item}>{item}</span>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="btn-primary patient-merge-apply"
                          onClick={handleApplyPatientMerge}
                          disabled={!patientMergeReview.executionPlan.canApply || isApplyingPatientMerge}
                        >
                          {isApplyingPatientMerge ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                          {isApplyingPatientMerge ? '統合中...' : '患者統合を実行'}
                        </button>
                      </>
                    )}
                    {patientMergeMessage && (
                      <div className="merge-status-line">
                        {patientMergeMessage}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="form-section-title">処方箋情報</div>
              <div className="provider-grid">
                <div className="form-group">
                  <label htmlFor="institutionCode">医療機関コード</label>
                  <input
                    id="institutionCode"
                    type="text"
                    maxLength={50}
                    value={institutionCode}
                    onChange={(e) => setInstitutionCode(e.target.value)}
                    onBlur={() => {
                      const match = providerHistory.find((provider) => provider.institutionCode === institutionCode.trim());
                      if (match) applyProviderHistory(match);
                    }}
                    placeholder="コードで検索"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="institutionName">
                    医療機関名
                    <span className="text-danger ml-1 text-sm" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="institutionName"
                    type="text"
                    maxLength={200}
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    placeholder="候補がなければ手入力"
                    required
                    aria-required="true"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="departmentName">
                    診療科
                    <span className="text-danger ml-1 text-sm" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="departmentName"
                    type="text"
                    maxLength={100}
                    list="departmentHistory"
                    value={departmentName}
                    onChange={(e) => setDepartmentName(e.target.value)}
                    placeholder="例: 内科"
                    required
                    aria-required="true"
                  />
                  <datalist id="departmentHistory">
                    {selectedProvider?.departments.map((department) => (
                      <option key={department} value={department} />
                    ))}
                  </datalist>
                </div>
                <div className="form-group">
                  <label htmlFor="doctorName">
                    医師名
                    <span className="text-danger ml-1 text-sm" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="doctorName"
                    type="text"
                    maxLength={100}
                    list="doctorHistory"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    placeholder="例: 山田 太郎"
                    required
                    aria-required="true"
                  />
                  <datalist id="doctorHistory">
                    {selectedProvider?.doctors.map((doctor) => (
                      <option key={doctor} value={doctor} />
                    ))}
                  </datalist>
                </div>
                <div className="form-group">
                  <label htmlFor="prescriptionDate">処方日</label>
                  <input
                    id="prescriptionDate"
                    type="date"
                    value={prescriptionDate}
                    onChange={(e) => setPrescriptionDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="dispensingDate">調剤日</label>
                  <input
                    id="dispensingDate"
                    type="date"
                    value={dispensingDate}
                    onChange={(e) => setDispensingDate(e.target.value)}
                  />
                </div>
              </div>

              {matchingProviderHistory.length > 0 && (
                <div className="provider-history-list" aria-label="医療機関候補">
                  {matchingProviderHistory.map((provider) => (
                    <button
                      key={provider.key}
                      type="button"
                      className="provider-history-item"
                      onClick={() => applyProviderHistory(provider)}
                    >
                      <Hospital size={15} aria-hidden="true" />
                      <span>{provider.institutionCode || 'コード未登録'} / {provider.institutionName || '医療機関名未登録'}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="prescription-workbench">
                <div className="prescription-workbench-header">
                  <div>
                    <span className="section-kicker">処方内容</span>
                    <strong>{prescriptionMetrics.rpCount}Rp / {prescriptionMetrics.drugCount}薬品</strong>
                  </div>
                  <div className="workbench-chips" aria-label="処方入力サマリ">
                    <button
                      type="button"
                      className="btn-secondary workbench-action"
                      onClick={handleApplyPreviousDo}
                      disabled={!!previousDoDisabledReason}
                      title={previousDoDisabledReason || `前回処方を投入: ${previousDoSummary}`}
                    >
                      <History size={14} aria-hidden="true" />
                      前回DO
                    </button>
                    <span className={`status-chip compact ${previousDoSnapshot ? 'confirmed' : 'warning'}`}>
                      {previousDoSummary}
                    </span>
                    <span className={`status-chip compact ${prescriptionMetrics.missingTotal === 0 ? 'confirmed' : 'warning'}`}>
                      未入力 {prescriptionMetrics.missingTotal}
                    </span>
                    {prescriptionMetrics.substitutionCount > 0 && (
                      <span className="status-chip compact confirmed">
                        変更 {prescriptionMetrics.substitutionCount}
                      </span>
                    )}
                    {prescriptionMetrics.specialPrepCount > 0 && (
                      <span className="status-chip compact">
                        調製 {prescriptionMetrics.specialPrepCount}
                      </span>
                    )}
                  </div>
                </div>

                <div className="prescriptions-list">
                  {prescriptionGroups.map((group, index) => (
                    <PrescriptionGroupEditor
                      key={group.rpId}
                      group={group}
                      groupIndex={index}
                      onChange={handlePrescriptionChange}
                      onOpenDrugSearch={handleOpenDrugSearch}
                      onToggleIppoka={handleToggleIppoka}
                      onToggleCrushed={handleToggleCrushed}
                      onToggleReceiptRemark={handleToggleReceiptRemark}
                      onRpFieldChange={handleRpFieldChange}
                      onRpDosageCategoryChange={handleRpDosageCategoryChange}
                      onAddDrugToRp={handleAddDrugToRp}
                      onAddRpAfter={handleAddRpAfter}
                      onDelete={handleDeletePrescription}
                    />
                  ))}
                </div>

                <div className="post-entry-checks">
                  <PrescriptionAuditPanel
                    audit={prescriptionAudit}
                    hasCurrentInput={hasCurrentPrescriptionInput}
                  />

                  <PrescriptionHistoryComparePanel
                    timeline={previousPrescriptionTimeline}
                    isLoading={isLoadingPreviousPrescription}
                    hasPatientContext={!!selectedPatientId}
                    hasCurrentInput={hasCurrentPrescriptionInput}
                  />
                </div>
              </div>

              <DrugSearchModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSelect={handleModalSelect}
                initialQuery={modalInitialQuery}
                mode={modalTargetField}
                prescribedDrugCode={modalPrescribedCode}
              />

              <OcrRawTextArea isProcessing={isProcessing} ocrResult={ocrResult} />

              <div className="form-actions mt-auto">
                <button className="btn-secondary" onClick={handleReset}>キャンセル</button>
                <span
                  className="btn-tooltip-wrapper"
                  data-disabled={isProcessing || isSaving}
                  title={isProcessing ? "解析中..." : isSaving ? "保存中..." : ""}
                >
                  <button
                    className="btn-primary flex-center gap-2"
                    onClick={handleSave}
                    disabled={isProcessing || isSaving}
                  >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                    {isSaving ? "保存中..." : "外部連携・印刷・ピッキングへ"}
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .ocr-page {
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .page-header {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
        }

        .page-header > div:first-child {
          flex: 1 1 260px;
          min-width: min(260px, 100%);
        }

        .upload-zone {
          flex: 1;
          border: 2px dashed var(--border);
          border-radius: var(--radius-lg);
          cursor: pointer;
          transition: border-color var(--transition-fast);
        }

        .upload-zone:hover {
          border-color: var(--primary);
          background: rgba(37, 99, 235, 0.02);
        }

        .upload-zone:focus-within {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
          border-color: var(--primary);
        }

        .reception-choice-grid {
          flex: 1;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(280px, 420px);
          gap: 1.5rem;
          min-height: 420px;
        }

        .reception-entry-stack {
          min-width: 0;
          display: grid;
          gap: 1rem;
          align-content: start;
        }

        .manual-entry-card {
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          background: white;
          color: var(--text-main);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 2rem;
          min-height: 148px;
          text-align: center;
          transition: border-color var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast);
        }

        .manual-entry-card:hover {
          border-color: var(--primary);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .manual-entry-card:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }

        .manual-entry-title {
          font-size: 1.05rem;
          font-weight: 700;
        }

        .manual-entry-subtitle {
          color: var(--text-muted);
          font-size: 0.88rem;
          line-height: 1.5;
        }

        .hidden-input {
          clip: rect(0 0 0 0);
          clip-path: inset(50%);
          height: 1px;
          overflow: hidden;
          position: absolute;
          white-space: nowrap;
          width: 1px;
        }

        .upload-zone.drag-active {
          border-color: var(--primary);
          background: rgba(37, 99, 235, 0.05);
          transform: scale(1.02);
        }

        .side-by-side-container {
          display: grid;
          grid-template-columns: minmax(260px, 0.85fr) minmax(0, 1.15fr);
          gap: 1.5rem;
          height: calc(100vh - 200px);
          min-height: 620px;
        }

        /* 手入力受付では処方箋イメージがないため、左カラムを畳んで入力フォームを広げる */
        .side-by-side-container.manual-mode {
          grid-template-columns: 220px minmax(0, 1fr);
        }

        .side-by-side-container.manual-mode .manual-placeholder {
          padding: 1.25rem 0.75rem;
        }

        .visual-column {
          display: flex;
          flex-direction: column;
          min-height: 0;
          min-width: 0;
          overflow: hidden;
        }

        .column-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: 1rem;
          text-transform: uppercase;
        }

        .image-preview-container {
          position: relative;
          height: 100%;
          overflow: hidden;
          background: #f1f5f9;
          border-radius: var(--radius-md);
          display: flex;
          justify-content: center;
        }

        .prescription-preview-image {
          object-fit: contain;
        }

        .manual-placeholder {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          min-height: 320px;
          border: 1px dashed var(--border);
          border-radius: var(--radius-md);
          background: #f8fafc;
          color: var(--text-muted);
          text-align: center;
          padding: 2rem;
        }

        .manual-placeholder strong {
          color: var(--text-main);
          font-size: 1.05rem;
        }

        .editor-column {
          display: flex;
          flex-direction: column;
          min-height: 0;
          min-width: 0;
        }

        .input-readiness-strip {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.5rem;
          margin: -0.15rem 0 0.85rem;
        }

        .readiness-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.55rem;
          min-height: 38px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 0.45rem 0.6rem;
          background: #ffffff;
        }

        .readiness-item span {
          color: var(--text-muted);
          font-size: 0.75rem;
          font-weight: 800;
        }

        .readiness-item strong {
          color: var(--text-main);
          font-size: 0.82rem;
          white-space: nowrap;
        }

        .readiness-item.ready {
          border-color: #bbf7d0;
          background: #f0fdf4;
        }

        .readiness-item.ready strong {
          color: var(--success);
        }

        .readiness-item.attention {
          border-color: #fed7aa;
          background: #fff7ed;
        }

        .readiness-item.attention strong {
          color: #c2410c;
        }

        .ocr-form {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          overflow-y: auto;
          padding-right: 0.5rem;
          min-width: 0;
        }

        .form-row {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .form-row > .form-group {
          flex: 1 1 160px;
          min-width: 0;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .form-group input[type='date'] {
          min-width: 165px;
        }

        .form-group label {
          font-size: 0.8rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .field-hint {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          padding: 0.6rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-family: inherit;
          font-size: 0.9rem;
          background: #ffffff;
        }

        .form-group textarea {
          resize: vertical;
          min-height: 58px;
        }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
          border-color: var(--border-focus);
          outline: none; /* fallback, focus-visible will handle outline */
        }

        .form-group input:focus-visible,
        .form-group select:focus-visible,
        .form-group textarea:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 1px;
        }

        .reception-tool-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
        }

        .status-chip {
          display: inline-flex;
          align-items: center;
          min-height: 32px;
          padding: 0.35rem 0.6rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          font-size: 0.78rem;
          color: var(--text-muted);
          background: #f8fafc;
        }

        .status-chip.confirmed {
          border-color: #bbf7d0;
          color: #15803d;
          background: #f0fdf4;
        }

        .status-chip.warning,
        .status-chip.unavailable {
          border-color: #fed7aa;
          color: #c2410c;
          background: #fff7ed;
        }

        .status-chip.compact {
          min-height: 28px;
          padding: 0.25rem 0.5rem;
          font-size: 0.74rem;
          font-weight: 800;
        }

        .electronic-prescription-panel {
          display: grid;
          gap: 0.65rem;
          border: 1px solid #bfdbfe;
          border-radius: var(--radius-md);
          background: #eff6ff;
          padding: 0.8rem;
        }

        .electronic-prescription-header,
        .electronic-prescription-controls {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
        }

        .electronic-prescription-header {
          justify-content: space-between;
        }

        .electronic-prescription-header strong {
          display: block;
          color: var(--text-main);
          font-size: 0.92rem;
        }

        .electronic-prescription-controls label {
          color: var(--text-muted);
          font-size: 0.78rem;
          font-weight: 800;
        }

        .electronic-prescription-key-kind {
          display: inline-flex;
          padding: 0.16rem;
          border: 1px solid #93c5fd;
          border-radius: var(--radius-md);
          background: #dbeafe;
        }

        .electronic-prescription-key-kind button {
          min-height: 30px;
          padding: 0.25rem 0.55rem;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #1e40af;
          font-size: 0.78rem;
          font-weight: 900;
          cursor: pointer;
        }

        .electronic-prescription-key-kind button.active {
          background: #ffffff;
          color: #0f172a;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
        }

        .electronic-prescription-controls input {
          flex: 1 1 220px;
          min-width: 0;
          padding: 0.6rem;
          border: 1px solid #93c5fd;
          border-radius: var(--radius-md);
          background: #ffffff;
          font-size: 0.9rem;
        }

        .electronic-prescription-note,
        .electronic-prescription-message,
        .electronic-prescription-hash,
        .electronic-prescription-warnings {
          margin: 0;
          color: #1e40af;
          font-size: 0.76rem;
          font-weight: 700;
          line-height: 1.5;
        }

        .electronic-prescription-message.warning,
        .electronic-prescription-message.unavailable,
        .electronic-prescription-warnings {
          color: #92400e;
        }

        .electronic-prescription-warnings {
          padding-left: 1.1rem;
        }

        .electronic-prescription-hash {
          color: #475569;
          overflow-wrap: anywhere;
        }

        .electronic-prescription-review {
          display: grid;
          gap: 0.65rem;
          border-top: 1px solid #bfdbfe;
          padding-top: 0.7rem;
        }

        .electronic-prescription-review dl {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
          gap: 0.45rem;
          margin: 0;
        }

        .electronic-prescription-review dl > div {
          min-width: 0;
          padding: 0.45rem 0.55rem;
          border: 1px solid #bfdbfe;
          border-radius: 6px;
          background: #ffffff;
        }

        .electronic-prescription-review dt {
          color: var(--text-muted);
          font-size: 0.7rem;
          font-weight: 800;
        }

        .electronic-prescription-review dd {
          margin: 0.1rem 0 0;
          overflow-wrap: anywhere;
          color: var(--text-main);
          font-size: 0.78rem;
          font-weight: 800;
        }

        .electronic-prescription-original-check {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          color: #92400e;
          font-size: 0.78rem;
          font-weight: 800;
          line-height: 1.45;
        }

        .electronic-prescription-original-check input {
          flex: 0 0 auto;
          margin-top: 0.15rem;
        }

        .electronic-prescription-decision {
          display: grid;
          gap: 0.2rem;
          padding: 0.55rem 0.65rem;
          border: 1px solid #bfdbfe;
          border-radius: 6px;
          background: #ffffff;
          color: #1e40af;
          font-size: 0.76rem;
          line-height: 1.45;
        }

        .electronic-prescription-decision.blocked {
          border-color: #fed7aa;
          background: #fff7ed;
          color: #92400e;
        }

        .electronic-prescription-decision.review {
          border-color: #fde68a;
          background: #fffbeb;
          color: #92400e;
        }

        .patient-selection-panel {
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 0.75rem;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .panel-title {
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--text-muted);
        }

        .patient-candidate-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.5rem;
        }

        .patient-candidate {
          border: 1px solid var(--border);
          border-radius: 6px;
          background: white;
          padding: 0.55rem 0.65rem;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .patient-candidate.selected {
          border-color: var(--primary);
          background: var(--primary-light);
        }

        .patient-candidate-select {
          border: 0;
          background: transparent;
          color: inherit;
          padding: 0;
          cursor: pointer;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .patient-candidate-select:hover .candidate-main {
          color: var(--primary);
        }

        .patient-candidate.risk-high {
          border-color: #f59e0b;
        }

        .patient-candidate.risk-low.selected {
          border-color: #0f766e;
          background: #f0fdfa;
        }

        .candidate-main {
          font-weight: 700;
          color: var(--text-main);
        }

        .candidate-meta,
        .selected-patient-note,
        .temporary-registration-note {
          color: var(--text-muted);
          font-size: 0.78rem;
          line-height: 1.45;
        }

        .candidate-reasons {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem;
        }

        .candidate-reasons span {
          border-radius: 5px;
          background: #eef2ff;
          color: #3730a3;
          font-size: 0.68rem;
          font-weight: 800;
          line-height: 1.3;
          padding: 0.15rem 0.32rem;
        }

        .candidate-warning {
          display: flex;
          align-items: flex-start;
          gap: 0.25rem;
          color: #92400e;
          font-size: 0.72rem;
          font-weight: 700;
          line-height: 1.35;
        }

        .patient-merge-open {
          align-self: flex-start;
          border: 1px solid #bfdbfe;
          border-radius: 5px;
          background: #eff6ff;
          color: #1d4ed8;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          min-height: 28px;
          padding: 0.25rem 0.45rem;
          cursor: pointer;
          font-size: 0.74rem;
          font-weight: 800;
        }

        .patient-merge-open:hover,
        .patient-merge-open.active {
          border-color: #2563eb;
          background: #dbeafe;
        }

        .patient-merge-open:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .patient-merge-review {
          border: 1px solid #bfdbfe;
          border-radius: 6px;
          background: #fff;
          padding: 0.7rem;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .patient-merge-review-title,
        .merge-status-line {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          color: #1e3a8a;
          font-size: 0.8rem;
          font-weight: 800;
        }

        .merge-status-line {
          color: var(--text-muted);
          font-weight: 700;
        }

        .merge-patient-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.5rem;
        }

        .merge-patient-grid > div {
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.18rem;
          min-width: 0;
        }

        .merge-patient-grid span,
        .merge-patient-grid small {
          color: var(--text-muted);
          font-size: 0.72rem;
        }

        .merge-patient-grid strong {
          color: var(--text-main);
          font-size: 0.88rem;
          overflow-wrap: anywhere;
        }

        .merge-summary-row,
        .merge-warning-list,
        .merge-operation-list,
        .merge-checklist {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }

        .merge-summary-row span,
        .merge-warning-list span,
        .merge-operation-list span,
        .merge-checklist span {
          border-radius: 5px;
          padding: 0.24rem 0.4rem;
          font-size: 0.72rem;
          font-weight: 800;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        .merge-summary-row span {
          background: #ecfeff;
          color: #0f766e;
        }

        .merge-warning-list span {
          background: #fff7ed;
          color: #9a3412;
        }

        .merge-operation-list span {
          background: #f1f5f9;
          color: #334155;
        }

        .merge-checklist span {
          background: #f0fdf4;
          color: #166534;
        }

        .patient-merge-apply {
          align-self: flex-start;
          min-height: 34px;
        }

        .temporary-registration-note {
          display: flex;
          align-items: center;
          gap: 0.45rem;
        }

        .provider-grid {
          display: grid;
          grid-template-columns: minmax(96px, 0.7fr) minmax(0, 1.35fr) minmax(96px, 0.8fr) minmax(96px, 0.8fr);
          gap: 0.75rem;
        }

        .provider-grid .form-group:nth-last-child(-n + 2) {
          max-width: 180px;
        }

        .provider-history-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          margin-top: -0.35rem;
        }

        .provider-history-item {
          border: 1px solid var(--border);
          border-radius: 6px;
          background: white;
          color: var(--text-main);
          padding: 0.4rem 0.55rem;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          cursor: pointer;
          font-size: 0.8rem;
          max-width: 100%;
        }

        .provider-history-item:hover {
          border-color: var(--primary);
          background: var(--primary-light);
        }

        .form-section-title {
          font-size: 0.9rem;
          font-weight: 600;
          border-bottom: 2px solid var(--primary-light);
          padding-bottom: 4px;
          margin-top: 1rem;
        }

        .prescription-workbench {
          border: 1px solid #dbe4ef;
          border-radius: 8px;
          background: #f8fafc;
          padding: 0.85rem;
        }

        .prescription-workbench-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .prescription-workbench-header > div:first-child {
          display: grid;
          gap: 0.15rem;
        }

        .section-kicker {
          color: var(--text-muted);
          font-size: 0.75rem;
          font-weight: 800;
        }

        .prescription-workbench-header strong {
          color: var(--text-main);
          font-size: 1rem;
        }

        .workbench-chips {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.4rem;
        }

        .workbench-action {
          min-height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.3rem;
          padding: 0 0.65rem;
          border-radius: 6px;
          font-size: 0.76rem;
          font-weight: 850;
          white-space: nowrap;
        }

        .prescriptions-list {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .post-entry-checks {
          display: grid;
          gap: 0.85rem;
          margin-top: 0.9rem;
        }

        .post-entry-checks:empty {
          display: none;
        }

        .processing-tag {
          font-size: 0.7rem;
          color: var(--primary);
          background: var(--primary-light);
          padding: 2px 8px;
          border-radius: 99px;
          margin-left: 0.5rem;
        }

        .form-actions {
          position: sticky;
          bottom: 0;
          z-index: 3;
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          border-top: 1px solid var(--border);
          padding: 1rem 0 0.1rem;
          background: linear-gradient(180deg, rgba(248, 250, 252, 0), #ffffff 28%);
        }

        .btn-trash {
          background: none;
          border: none;
          color: #ef4444;
          cursor: pointer;
        }

        .btn-trash:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
          border-radius: 4px;
        }

        .ml-auto { margin-left: auto; }
        .mb-4 { margin-bottom: 1rem; }
        .gap-2 { gap: 0.5rem; }
        .animate-spin {
          animation: spin 1s linear infinite;
        }

        @media (max-width: 900px) {
          .reception-choice-grid {
            grid-template-columns: 1fr;
          }

          .side-by-side-container,
          .side-by-side-container.manual-mode {
            grid-template-columns: 1fr;
            height: auto;
            min-height: 0;
          }

          /* 手入力受付では左カラムは案内文だけで実質空欄のため、幅の狭い画面では畳んで
             右の入力フォームを広げる(ヘッダーの「受付をやり直す」ボタンは残す)。 */
          .side-by-side-container.manual-mode .manual-placeholder {
            display: none;
          }

          /* 処方箋イメージがある場合は原本確認のため残すが、フォームを圧迫しないよう
             高さを抑える(拡大はブラウザのピンチズームで可能)。
             next/image の fill は親に確定した高さが必要なため、100%ではなく固定値にする。 */
          .image-preview-container {
            height: 260px;
          }

          .provider-grid,
          .form-row {
            grid-template-columns: 1fr;
            flex-direction: column;
          }

          .input-readiness-strip,
          .prescription-workbench-header {
            grid-template-columns: 1fr;
            flex-direction: column;
            align-items: stretch;
          }

          .merge-patient-grid {
            grid-template-columns: 1fr;
          }

          .workbench-chips {
            justify-content: flex-start;
          }

          .provider-grid .form-group:nth-last-child(-n + 2) {
            max-width: none;
          }

        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
