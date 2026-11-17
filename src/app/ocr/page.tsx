'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import './ocr.css';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Upload, FileSearch, CheckCircle, Trash2, Loader2, CreditCard, Search, UserPlus, Hospital, Printer, AlertTriangle, ShieldCheck, History, QrCode, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useMynaReaderAvailability } from '@/hooks/useMynaReaderAvailability';
import { buildReceptionInsuranceNumberPatch, checkMynaReadMatchesPatient, getMynaReaderButtonView, pickReceptionInsuranceNumber } from '@/lib/myna_read_display';
import { useDatabase } from '@/db/DatabaseProvider';
import type { Patient, Visit } from '@/db/types';
import { generateUUID } from '@/lib/crypto';
import {
  FEATURE_AVAILABILITY,
  UNIMPLEMENTED_BADGE_LABEL,
  isFeatureImplemented,
  labelWithAvailability
} from '@/lib/feature_availability';
import { normalizeInsuranceNumber } from '@/lib/patient_matching';
import { buildPatientSearchQuery, extractPatientHintsFromQuery } from '@/lib/patient_search';
import {
  applyMynaToRegistrationForm,
  EMPTY_PATIENT_REGISTRATION_FORM,
  type PatientRegistrationForm,
  type PatientRegistrationOutcome
} from '@/lib/patient_registration';
import { describePatientMasterChanges } from '@/lib/patient_master_update';
import {
  buildPatientMergeExecutionPlan,
  buildPatientMergePlan
} from '@/lib/patient_merge';
import {
  applyPatientMergeExecutionPlanWithAudit,
  createRxdbPatientMergeExecutionStore,
  recoverFromPatientMergeFailure
} from '@/lib/patient_merge_execution';
import { getCurrentUser, logAuditAction } from '@/lib/audit';
import { recordAuditOrNotify } from '@/lib/audit_guard';
import { PrescriptionRegistrationError, registerPrescriptionAtomically } from '@/lib/prescription_registration';
import { isClaimEditBlocked } from '@/lib/claim_edit_guard';
import { buildReceptionClaimOptions, judgeAfterHoursCategory } from '@/lib/claim_conditions';
import { formatOnlineEligibilityFieldMappingReport } from '@/lib/online_eligibility';
import { buildProviderHistory, buildRecentProviderHistoryQuery, matchProviderHistory, type ProviderHistoryOption } from '@/lib/master-data/provider_history';
import { buildPrescriptionInputAudit } from '@/lib/prescription_input_audit';
import { buildPreviousDoPrescriptions } from '@/lib/previous_prescription_do';
import { buildOcrConfidenceReport } from '@/lib/ocr_confidence';
import { parseJahisQr, parsePrescriptionOcrText } from '@/lib/ocr/processor';
import type { DosageCategory } from '@/lib/dosage_category';
import { evaluateInsuranceEligibility } from '@/lib/insurance_eligibility';
import { buildPublicInsuranceBadgeList } from '@/lib/patient_public_insurance';
import { buildHighCostCopaymentBadges } from '@/lib/patient_copayment_support';
import DrugSearchModal from './components/DrugSearchModal';
import PrescriptionQrReader from './components/PrescriptionQrReader';
import { PatientRegistrationModal } from './components/PatientRegistrationModal';
import WorkflowMiniTutorial from '@/components/WorkflowMiniTutorial';
import type { Prescription, PrescriptionFieldValue } from './types';
import { groupPrescriptionsByRp } from './types';
import {
  toPatientEligibilityStatus,
  filterReceptionEligibilityAlerts,
  buildCandidatePublicInsuranceSummary,
  getPatientCandidatePanelViewState,
  getPatientRegistrationPrompt,
  getPreviousDoViewState,
  createEmptyPrescription,
  buildPrescriptionFromElectronicItem,
  toDateInputValue,
  dateInputToIso,
  normalizeDateInputValue,
  normalizeJahisDateInputValue,
  formatVisitDateLabel,
  getProviderHistoryCandidateViewState,
  PROVIDER_HISTORY_FETCH_ERROR_TOAST_MESSAGE,
  PATIENT_MERGE_COLLECTION_LABEL,
  formatPatientMergeOperationLabel,
  QR_SOURCE_LABEL,
  buildPrescriptionsFromParsedItems,
  calculatePrescriptionMetrics,
  buildPrescriptionAuditInputItems,
  resolveExistingElectronicPrescriptionLinks,
  isElectronicPrescriptionInstitutionMismatch,
  buildAppliedElectronicPrescriptionState,
  updatePrescriptionFieldAt,
  updateRpGroupField,
  updateRpGroupDosageCategory,
  appendDrugToRpGroup,
  insertEmptyRpGroupAfter,
  removePrescriptionItemOrReset,
  togglePrescriptionIppokaAt,
  togglePrescriptionCrushedAt,
  togglePrescriptionReceiptRemarkAt,
  validateReceptionPrescriptionItems,
  buildReceptionPrescriptionItemsPayload
} from './helpers';
import { OcrRawTextArea, OcrConfidencePanel } from './components/OcrConfidencePanel';
import { PrescriptionGroupEditor } from './components/PrescriptionGroupEditor';
import { PrescriptionAuditPanel } from './components/PrescriptionAuditPanel';
import { PrescriptionHistoryComparePanel } from './components/PrescriptionHistoryComparePanel';
import { useOcrElectronicPrescription } from '@/hooks/useOcrElectronicPrescription';
import { useOcrPatientEligibility, type PatientCandidate } from '@/hooks/useOcrPatientEligibility';
import { useOcrPreviousPrescriptions } from '@/hooks/useOcrPreviousPrescriptions';
import { useOcrDrugSearchModal } from '@/hooks/useOcrDrugSearchModal';

// ⚡ Bolt: Hoist regex to module scope to avoid re-compilation on every function call
const INSURANCE_NUMBER_REGEX = /^\d+$/;

export default function OcrPage() {
  const router = useRouter();
  const db = useDatabase();

  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isManualEntry, setIsManualEntry] = useState(false);
  // QR・電子処方箋の取り込み欄。普段は畳み、電子処方箋で受付を選んだときや取得結果が出たときに開く。
  const [isIntakeToolsOpen, setIsIntakeToolsOpen] = useState(false);
  // 電子処方箋は接続モジュールが無く未実装。実装済みになるまで、関連のボタンは「未実装」で押せなくする。
  const electronicPrescriptionImplemented = isFeatureImplemented('electronicPrescription');
  const electronicPrescriptionUnavailableReason = FEATURE_AVAILABILITY.electronicPrescription.unavailableReason;
  // マイナ読取は、接続先(資格確認端末の連携フォルダ等)が設定されているときだけ押せる。
  // オンライン資格確認は、連携の仕様が未入手で未実装。押せなくして保険情報は手入力にする。
  const mynaReaderState = useMynaReaderAvailability();
  const mynaReadButton = getMynaReaderButtonView(mynaReaderState, 'マイナ読取');
  const onlineEligibilityImplemented = isFeatureImplemented('onlineEligibility');

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
      }).catch(() => { });
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
  // 既存患者の検索欄。氏名・フリガナ・生年月日(半角8桁)を空白で区切って打つ。
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  // 新規患者の登録画面。開くたびに key を変えて、入力を初期値からやり直す。
  const [patientRegistrationKey, setPatientRegistrationKey] = useState<number | null>(null);

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
  const [hasProviderHistoryFetchError, setHasProviderHistoryFetchError] = useState(false);

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
    pendingElectronicPrescription,
    setPendingElectronicPrescription,
    electronicPrescriptionPaperOriginalConfirmed,
    setElectronicPrescriptionPaperOriginalConfirmed,
    appliedElectronicPrescription,
    setAppliedElectronicPrescription,
    electronicPrescriptionApplyDecision,
    handleElectronicPrescriptionFetch
  } = useOcrElectronicPrescription();

  // Hook: 患者照会・マイナ・資格確認
  const {
    patientMatches,
    patientCandidates,
    hasPatientCandidatesFetchError,
    selectedPatientId,
    setSelectedPatientId,
    selectedPatient,
    selectPatient,
    clearSelectedPatient,
    mynaReadResult,
    setMynaReadResult,
    patientMergeReview,
    setPatientMergeReview,
    isLoadingPatientMergeReview,
    setIsLoadingPatientMergeReview,
    isApplyingPatientMerge,
    setIsApplyingPatientMerge,
    patientMergeMessage,
    setPatientMergeMessage,
    activePatientAlerts,
    hasPatientAlertsFetchError,
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
    patientSearchQuery,
    setPatientSearchQuery,
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
    setPreviousPrescriptions,
    isLoadingPreviousPrescription,
    hasPreviousPrescriptionsError,
    previousDoSnapshot,
    setPreviousDoSnapshot,
    isLoadingPreviousDo,
    hasPreviousDoError,
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
    modalInitialQuery,
    modalTargetField,
    modalPrescribedCode,
    handleOpenDrugSearch,
    handleModalSelect
  } = useOcrDrugSearchModal({ setPrescriptions });

  const appliedElectronicPrescriptionIds = useMemo(() => {
    if (!appliedElectronicPrescription) return [];
    const linkedIds = appliedElectronicPrescription.linkedPrescriptions?.map((link) => link.prescriptionId) || [];
    return Array.from(new Set([appliedElectronicPrescription.prescriptionId, ...linkedIds]));
  }, [appliedElectronicPrescription]);
  // 取得結果(確認待ち・反映済み)が出たら取り込み欄を開いて内容を見せる
  useEffect(() => {
    if (pendingElectronicPrescription || appliedElectronicPrescription) setIsIntakeToolsOpen(true);
  }, [pendingElectronicPrescription, appliedElectronicPrescription]);
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
  const prescriptionMetrics = useMemo(
    () => calculatePrescriptionMetrics(prescriptions, prescriptionGroups),
    [prescriptions, prescriptionGroups]
  );
  const prescriptionAudit = useMemo(() => {
    const auditItems = buildPrescriptionAuditInputItems(prescriptions, prescriptionGroups);
    return buildPrescriptionInputAudit(auditItems, {
      patientAlerts: activePatientAlerts,
      hasPatientAlertsFetchError
    });
  }, [activePatientAlerts, hasPatientAlertsFetchError, prescriptions, prescriptionGroups]);
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
  const {
    disabledReason: previousDoDisabledReason,
    summary: previousDoSummary
  } = useMemo(() => (
    getPreviousDoViewState({
      selectedPatientId,
      isLoadingPreviousDo,
      hasPreviousDoError,
      previousDoSnapshot
    })
  ), [hasPreviousDoError, isLoadingPreviousDo, previousDoSnapshot, selectedPatientId]);
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
  const selectedPatientEligibilityIssues = useMemo(() => {
    if (!selectedPatient) return [];
    return evaluateInsuranceEligibility({ patient: selectedPatient });
  }, [selectedPatient]);
  const selectedPatientPublicBadges = useMemo(() => {
    if (!selectedPatient) return [];
    return buildPublicInsuranceBadgeList(selectedPatient.publicInsurances, selectedPatientEligibilityIssues);
  }, [selectedPatient, selectedPatientEligibilityIssues]);
  const selectedPatientCopaymentBadges = useMemo(() => {
    if (!selectedPatient) return [];
    return buildHighCostCopaymentBadges(selectedPatient.insuranceInfo);
  }, [selectedPatient]);
  const selectedPatientReceptionAlerts = useMemo(() => {
    return filterReceptionEligibilityAlerts(selectedPatientEligibilityIssues, {
      hasPatientAlertsFetchError
    });
  }, [hasPatientAlertsFetchError, selectedPatientEligibilityIssues]);
  const candidatePublicSummaryByPatientId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildCandidatePublicInsuranceSummary>>();
    for (const patient of patientCandidates) {
      if (!patient.publicInsurances || patient.publicInsurances.length === 0) continue;
      const issues = evaluateInsuranceEligibility({ patient });
      const summary = buildCandidatePublicInsuranceSummary(patient, issues);
      if (summary) {
        map.set(patient.patientId, summary);
      }
    }
    return map;
  }, [patientCandidates]);
  const patientCandidateMatchById = useMemo(() => (
    new Map(patientMatches.map((match) => [match.patient.patientId, match]))
  ), [patientMatches]);
  const patientCandidatePanelViewState = useMemo(() => (
    getPatientCandidatePanelViewState({
      candidateCount: patientCandidates.length,
      hasFetchError: hasPatientCandidatesFetchError
    })
  ), [hasPatientCandidatesFetchError, patientCandidates.length]);
  // 探している患者が見つからないときの、新規患者の登録への案内(全員が一部の条件だけの一致のときも含む)
  const patientRegistrationPrompt = useMemo(() => (
    getPatientRegistrationPrompt({
      candidateCount: patientCandidates.length,
      hasFetchError: hasPatientCandidatesFetchError,
      hasQuery: !!patientSearchQuery.trim(),
      hasOnlyPartialMatches: patientMatches.length > 0 && patientMatches.every((match) => match.matchKind === 'partial')
    })
  ), [hasPatientCandidatesFetchError, patientCandidates.length, patientMatches, patientSearchQuery]);

  useEffect(() => {
    let isMounted = true;
    const loadProviderHistory = async () => {
      if (!db) return;
      setHasProviderHistoryFetchError(false);
      try {
        const visitDocs = await db.visits.find(buildRecentProviderHistoryQuery()).exec();
        const history = buildProviderHistory(visitDocs.map((visitDoc) => visitDoc.toJSON() as Visit));
        if (isMounted) {
          setProviderHistory(history.slice(0, 20));
          setHasProviderHistoryFetchError(false);
        }
      } catch (error) {
        console.error('Failed to load provider history:', error);
        if (isMounted) {
          setProviderHistory([]);
          setHasProviderHistoryFetchError(true);
          toast.error(PROVIDER_HISTORY_FETCH_ERROR_TOAST_MESSAGE);
        }
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
    const existingLinks = resolveExistingElectronicPrescriptionLinks(appliedElectronicPrescription);
    const isAppending = existingLinks.length > 0;
    if (existingLinks.some((link) => link.prescriptionId === prescription.prescriptionId)) {
      toast.warning('この電子処方箋はすでに処方入力へ反映済みです。');
      return;
    }
    if (isAppending) {
      if (isElectronicPrescriptionInstitutionMismatch(
        { institutionCode, institutionName },
        prescription.provider
      )) {
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
      if (!isAppending && (prescription.patient.name || nextPatientBirthDate)) {
        // 処方箋に書かれた患者を、検索欄にも入れて探す。違う患者が選ばれたままにしない(同じ受付への追加は同一患者)。
        setSelectedPatientId(null);
        setPatientSearchQuery(buildPatientSearchQuery({ name: prescription.patient.name, birthDate: nextPatientBirthDate }));
      }
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

      const nextPrescriptions = prescription.items.map((item, index) =>
        buildPrescriptionFromElectronicItem(
          item,
          prescription.prescriptionId || 'unknown',
          index,
          generateUUID
        )
      );
      setPrescriptions((current) => isAppending
        ? [...current, ...nextPrescriptions]
        : nextPrescriptions.length > 0
          ? nextPrescriptions
          : [createEmptyPrescription('rp_initial', { id: 'item_initial' })]);

      const nextAppliedState = buildAppliedElectronicPrescriptionState({
        applied: appliedElectronicPrescription,
        existingLinks,
        prescription,
        duplicateCheckStatus: result.duplicateCheck?.status,
        integrityHash: result.integrityHash!,
        paperOriginalConfirmed: electronicPrescriptionPaperOriginalConfirmed
      });
      setAppliedElectronicPrescription(nextAppliedState);

      const duplicateCheckMessage = result.duplicateCheck?.messages?.length
        ? ` / ${result.duplicateCheck.messages.join('、')}`
        : '';
      setElectronicPrescriptionStatus(electronicPrescriptionApplyDecision.status === 'review' ? 'warning' : 'confirmed');
      setElectronicPrescriptionMessage(`${electronicPrescriptionApplyDecision.message}${duplicateCheckMessage}`);
      if (electronicPrescriptionApplyDecision.status === 'review') {
        toast.warning(`電子処方箋を${isAppending ? '追加' : '反映'}しました。重複投薬・併用禁忌の注意内容を確認してください。`);
      } else {
        toast.success(`電子処方箋を${isAppending ? '追加' : '反映'}しました（合計${nextAppliedState.linkedPrescriptions?.length || 1}処方箋、追加${nextPrescriptions.length}薬品）。`);
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
    selectedPatientId,
    setAppliedElectronicPrescription,
    setElectronicPrescriptionMessage,
    setElectronicPrescriptionStatus,
    setPatientSearchQuery,
    setSelectedPatientId
  ]);

  const handleApplyPrescriptionQrData = useCallback(async (
    qrData: string,
    source: keyof typeof QR_SOURCE_LABEL,
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
      setPatientSearchQuery(buildPatientSearchQuery({ name: parsed.patient.name, birthDate: nextBirthDate }));
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
    setElectronicPrescriptionMessage(`${QR_SOURCE_LABEL[source]}で読み取った処方箋QRを反映しました。電子処方箋ではありません。`);
  }, [hasCurrentPrescriptionInput, setAppliedElectronicPrescription, setElectronicPrescriptionMessage, setElectronicPrescriptionPaperOriginalConfirmed, setElectronicPrescriptionStatus, setEligibilityResult, setEligibilityStatus, setPendingElectronicPrescription, setPatientSearchQuery, setSelectedPatientId]);

  // 新規患者の登録画面を開く。分かっている氏名・生年月日(処方箋・QR・マイナ読取)と、読み取ったマイナの内容を初期値にする。
  // 患者を選んでいるときは、その人ではなく別の新しい人を登録するので、空から始める。
  const patientRegistrationInitial = useMemo<{ form: PatientRegistrationForm; fromMyna: boolean }>(() => {
    if (selectedPatientId) return { form: EMPTY_PATIENT_REGISTRATION_FORM, fromMyna: false };
    const queryHints = extractPatientHintsFromQuery(patientSearchQuery);
    const base: PatientRegistrationForm = {
      ...EMPTY_PATIENT_REGISTRATION_FORM,
      name: patientName.trim() || queryHints.name,
      birthDate: patientBirthDate.trim() || queryHints.birthDate
    };
    // 直近のマイナ読取が、いま受付欄にある人のものなら、カナ・性別・記号番号まで引き継ぐ(別の人の読取は使わない)
    const useMyna = !!mynaReadResult
      && mynaReadResult.readerSource !== 'mock'
      && checkMynaReadMatchesPatient(mynaReadResult, { name: patientName, birthDate: patientBirthDate }).matches;
    if (useMyna && mynaReadResult) return { form: applyMynaToRegistrationForm(base, mynaReadResult), fromMyna: true };
    return { form: base, fromMyna: false };
  }, [mynaReadResult, patientBirthDate, patientName, patientSearchQuery, selectedPatientId]);

  const openPatientRegistration = useCallback(() => {
    setPatientRegistrationKey((current) => (current ?? 0) + 1);
  }, []);

  const closePatientRegistration = useCallback(() => {
    setPatientRegistrationKey(null);
  }, []);

  const handlePatientRegistered = useCallback((outcome: Extract<PatientRegistrationOutcome, { status: 'registered' }>) => {
    setPatientRegistrationKey(null);
    // 登録した患者を選んで、続けて受付する(患者マスターの購読が届く前でも選べるよう、登録直後のドキュメントを渡す)
    selectPatient({ ...outcome.patient, doc: outcome.doc });
    setPatientSearchQuery(buildPatientSearchQuery({ name: outcome.patient.name, birthDate: outcome.patient.birthDate }));
  }, [selectPatient, setPatientSearchQuery]);

  const handleSelectExistingFromRegistration = useCallback((patient: Patient) => {
    setPatientRegistrationKey(null);
    selectPatient(patient);
    setPatientSearchQuery(buildPatientSearchQuery({ name: patient.name, birthDate: patient.birthDate }));
    toast.info(`登録済みの患者「${patient.name}」を選びました。`);
  }, [selectPatient, setPatientSearchQuery]);

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
  }, [db, selectedPatient, setIsLoadingPatientMergeReview, setPatientMergeMessage, setPatientMergeReview]);

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
      // 適用 -> 監査ログ。監査ログが残らなければ、統合を取り消す。
      await applyPatientMergeExecutionPlanWithAudit({
        store,
        executionPlan,
        buildAuditDetail: (result) => `患者統合実行: ${plan.summary}。${result.auditDetail}`,
        logAudit: (detail) => logAuditAction(
          db,
          'prescription_edit',
          detail,
          plan.targetPatientId,
          plan.mergedPatient.name
        )
      });
      // 候補の一覧は患者マスターの購読で更新される(統合元は消え、残す患者は統合後の内容になる)
      setSelectedPatientId(plan.targetPatientId);
      setPatientName(plan.mergedPatient.name);
      setPatientBirthDate(plan.mergedPatient.birthDate);
      setInsuranceNumber(pickReceptionInsuranceNumber(plan.mergedPatient.insuranceInfo));
      if (plan.mergedPatient.insuranceInfo?.burdenRatio) setBurdenRatio(String(plan.mergedPatient.insuranceInfo.burdenRatio));
      setPatientMergeReview(null);
      setPatientMergeMessage('患者統合を実行しました。受付とアラートを残す患者へ付け替えました。');
      toast.success('患者統合を実行しました。');
    } catch (error) {
      console.error('Failed to apply patient merge:', error);
      const outcome = await recoverFromPatientMergeFailure(store, error);
      setPatientMergeMessage(outcome.message);
      toast.error(outcome.toast);
    } finally {
      setIsApplyingPatientMerge(false);
    }
  }, [db, patientMergeReview, setIsApplyingPatientMerge, setPatientMergeMessage, setPatientMergeReview, setSelectedPatientId]);

  const applyProviderHistory = useCallback((provider: ProviderHistoryOption) => {
    setInstitutionCode(provider.institutionCode);
    setInstitutionName(provider.institutionName);
    if (!departmentName && provider.departments.length > 0) setDepartmentName(provider.departments[0]);
    if (!doctorName && provider.doctors.length > 0) setDoctorName(provider.doctors[0]);
  }, [departmentName, doctorName]);

  const matchingProviderHistory = useMemo(() => {
    return matchProviderHistory(providerHistory, { institutionCode, institutionName });
  }, [institutionCode, institutionName, providerHistory]);

  const providerHistoryViewState = useMemo(() => (
    getProviderHistoryCandidateViewState({
      candidateCount: matchingProviderHistory.length,
      hasFetchError: hasProviderHistoryFetchError
    })
  ), [hasProviderHistoryFetchError, matchingProviderHistory.length]);

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
      setPatientSearchQuery(buildPatientSearchQuery({ name: parsed.patient.name, birthDate: nextBirthDate }));
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
  }, [setEligibilityResult, setEligibilityStatus, setPatientSearchQuery, setSelectedPatientId]);

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
    setPrescriptions((prev) => updatePrescriptionFieldAt(prev, id, field, value, index));
  }, []);

  const handleRpFieldChange = useCallback((rpId: string, field: 'usage' | 'usageSupplementText' | 'days' | 'rpComment', value: string) => {
    setPrescriptions((prev) => updateRpGroupField(prev, rpId, field, value));
  }, []);

  const handleRpDosageCategoryChange = useCallback((rpId: string, category: DosageCategory | null) => {
    setPrescriptions((prev) => updateRpGroupDosageCategory(prev, rpId, category));
  }, []);

  const handleAddDrugToRp = useCallback((rpId: string) => {
    setPrescriptions((prev) => appendDrugToRpGroup(prev, rpId));
  }, []);

  const handleAddRpAfter = useCallback((rpId: string) => {
    setPrescriptions((prev) => insertEmptyRpGroupAfter(prev, rpId));
  }, []);

  const handleDeletePrescription = useCallback((id: string) => {
    setPrescriptions((prev) => removePrescriptionItemOrReset(prev, id));
  }, []);

  const handleToggleIppoka = useCallback((id: string, checked: boolean, index: number) => {
    setPrescriptions((prev) => togglePrescriptionIppokaAt(prev, id, checked, index));
  }, []);

  const handleToggleCrushed = useCallback((id: string, checked: boolean, index: number) => {
    setPrescriptions((prev) => togglePrescriptionCrushedAt(prev, id, checked, index));
  }, []);

  const handleToggleReceiptRemark = useCallback((id: string, checked: boolean, index: number) => {
    setPrescriptions((prev) => togglePrescriptionReceiptRemarkAt(prev, id, checked, index));
  }, []);

  const handleReset = () => {
    if (window.confirm('入力内容と画像を破棄して最初からやり直しますか？')) {
      setImage(null);
      setIsManualEntry(false);
      setIsIntakeToolsOpen(false);
      setPatientName('');
      setPatientBirthDate('');
      setInsuranceNumber('');
      setBurdenRatio('30');
      setSelectedPatientId(null);
      setPatientSearchQuery('');
      setMynaReadResult(null);
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
    // 受付は、登録済みの患者を選んで行う。初めての方は、先に患者登録をする。
    if (!selectedPatientId) {
      alert('患者を選択してください。初めての方は「新規患者を登録」から、先に患者登録をしてください。');
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

    const prescriptionValidationError = validateReceptionPrescriptionItems(prescriptions);
    if (prescriptionValidationError) {
      toast.error(prescriptionValidationError);
      return;
    }

    setIsSaving(true);

    // Generate unique IDs
    const visitId = `v_${generateUUID()}`;

    try {
      // 選んだ患者を、保存の直前に読み直す(別の端末での更新や、統合で消えた場合に気づくため)
      const selectedPatientDoc = await db.patients.findOne(selectedPatientId).exec();
      if (!selectedPatientDoc) {
        toast.error('選択した患者が見つかりません。患者を選び直してください。');
        setIsSaving(false);
        return;
      }
      // 受付した実時刻を残し、開局時間が設定済みなら時間外・休日・深夜を受付時に自動判定する。
      // 判定できない (開局時間が未設定など) 受付は、これまでと同じ (区分なし) にする。
      const receptionAt = new Date().toISOString();
      let receptionClaimOptions: ReturnType<typeof buildReceptionClaimOptions>;
      try {
        const settingsDoc = await db.facility_settings.findOne('default').exec();
        receptionClaimOptions = buildReceptionClaimOptions(
          judgeAfterHoursCategory(receptionAt, settingsDoc?.toJSON().businessHours)
        );
      } catch (settingsError) {
        console.error('Failed to read business hours for the reception judgement:', settingsError);
      }
      const existingPatient = { ...selectedPatientDoc.toJSON(), doc: selectedPatientDoc };
      const patientId = existingPatient.patientId;
      // 患者の氏名・生年月日は登録内容のまま。受付で書き換えない(処方箋の読み取り違いで、選んだ患者の名前が変わらないように)
      const savedPatientName = existingPatient.name;
      const savedEligibilityStatus = toPatientEligibilityStatus(eligibilityStatus);
      const eligibilityPatch = eligibilityResult?.insuranceInfoPatch || {};
      const insurancePayload = {
        ...(existingPatient.insuranceInfo || {}),
        ...buildReceptionInsuranceNumberPatch(existingPatient.insuranceInfo, insuranceNumber),
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
      const existingPublicInsurances = existingPatient.publicInsurances?.map((publicInsurance) => ({ ...publicInsurance }));
      const publicInsurancesPayload = eligibilityPublicInsurances && eligibilityPublicInsurances.length > 0
        ? eligibilityPublicInsurances
        : existingPublicInsurances;
      const patientUpdatePayload = {
        name: existingPatient.name,
        birthDate: existingPatient.birthDate,
        insuranceInfo: insurancePayload,
        ...(publicInsurancesPayload ? { publicInsurances: publicInsurancesPayload } : {})
      };
      const patientMasterChanges = describePatientMasterChanges(existingPatient, patientUpdatePayload);
      let lockedClaimCountForPatient = 0;
      if (patientMasterChanges.length > 0) {
        const existingPatientVisits = await db.visits.find({ selector: { patientId } }).exec();
        lockedClaimCountForPatient = existingPatientVisits.filter((visit) => isClaimEditBlocked(visit.claimLifecycle)).length;
      }

      const prescriptionItems = buildReceptionPrescriptionItemsPayload(prescriptions, visitId, generateUUID);

      // 患者 -> 受付 -> 処方明細の順に書き、どれかが失敗したら書いた分を取り消す(受付だけ、明細が欠けた受付が残らない)
      await registerPrescriptionAtomically({
        db,
        patientId,
        existingPatientDoc: existingPatient.doc,
        patientUpdate: patientUpdatePayload,
        newPatientDefaults: {},
        visit: {
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
          receptionAt,
          ...(receptionClaimOptions
            ? { claimOptions: { drugFeeOnly: false, disabledFeeCodes: [], disabledFeeRationales: {}, ...receptionClaimOptions } }
            : {}),
          status: 'processing', // 処方入力済みステータスとして扱う
          ...(appliedElectronicPrescription
            ? { electronicPrescription: appliedElectronicPrescription }
            : {})
        },
        items: prescriptionItems
      });

      // 監査ログの記録
      await recordAuditOrNotify(
        () => logAuditAction(
          db,
          'prescription_ocr',
          `処方箋受付: 既存患者選択「${savedPatientName}」の処方データ（${institutionName.trim()} ${departmentName.trim()} ${doctorName.trim()}、処方薬${prescriptionItems.length}件）を登録しました。`,
          patientId,
          savedPatientName
        ),
        (message) => toast.warning(message)
      );
      if (patientMasterChanges.length > 0) {
        await recordAuditOrNotify(
          () => logAuditAction(
            db,
            'prescription_edit',
            `患者マスター更新: OCR受付に伴い「${savedPatientName}」の患者情報を更新しました（${patientMasterChanges.join(' / ')}）。${lockedClaimCountForPatient > 0 ? `ロック済み請求${lockedClaimCountForPatient}件は請求時点スナップショットで確認できます。` : 'ロック済み請求はありません。'}`,
            patientId,
            savedPatientName
          ),
          (message) => toast.warning(message)
        );
      }

      // Transition to print page
      toast.success('データを保存しました。');
      router.push(`/print/${visitId}`);
    } catch (error) {
      // 🛡️ Sentinel: Do not leak raw error objects to the UI, but log for debugging
      console.error('Failed to save data securely:', error);
      toast.error(
        error instanceof PrescriptionRegistrationError && error.rollbackFailed
          ? '保存に失敗し、途中まで保存されたデータを取り消せませんでした。受付一覧と患者情報を確認してください。'
          : '保存に失敗しました。'
      );
      setIsSaving(false); // Only set to false on error, success redirects
    }
  };

  const isEditorOpen = !!image || isManualEntry;

  // 手入力受付を始めたら、続けて患者を検索できるように検索欄へ進める(QR・電子処方箋で患者が分かっているときは動かさない)
  useEffect(() => {
    if (!isManualEntry || image) return;
    const searchInput = document.getElementById('patientSearch') as HTMLInputElement | null;
    if (searchInput && !searchInput.value && document.activeElement === document.body) searchInput.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManualEntry]);

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
              disabled={!electronicPrescriptionImplemented}
              aria-disabled={!electronicPrescriptionImplemented}
              onClick={() => {
                if (!electronicPrescriptionImplemented) return;
                setIsManualEntry(true);
                setIsIntakeToolsOpen(true);
                setElectronicPrescriptionMessage('引換番号または処方箋IDを入力して取得してください。');
              }}
            >
              <FileSearch size={42} aria-hidden="true" />
              <span className="manual-entry-title">
                電子処方箋で受付
                {!electronicPrescriptionImplemented && (
                  <span className="unimplemented-badge" data-testid="electronic-prescription-entry-badge">{UNIMPLEMENTED_BADGE_LABEL}</span>
                )}
              </span>
              <span className="manual-entry-subtitle">
                {electronicPrescriptionImplemented
                  ? 'yakurekiの接続モジュールから取得して確認します。'
                  : electronicPrescriptionUnavailableReason}
              </span>
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
              {[
                { key: 'patient', label: '患者', ready: !!selectedPatientId, text: selectedPatientId ? '選択済' : '未選択' },
                { key: 'provider', label: '処方元', ready: !!(institutionName.trim() && departmentName.trim() && doctorName.trim()), text: institutionName.trim() && departmentName.trim() && doctorName.trim() ? '入力済' : '未入力' },
                { key: 'prescription', label: '処方', ready: prescriptionMetrics.missingTotal === 0, text: prescriptionMetrics.missingTotal === 0 ? '入力済' : `未入力 ${prescriptionMetrics.missingTotal}` }
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`readiness-item ${item.ready ? 'ready' : 'attention'}`}
                  onClick={() => document.getElementById(`reception-section-${item.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  <span>{item.label}</span>
                  <strong>{item.text}</strong>
                </button>
              ))}
            </div>

            <OcrConfidencePanel
              report={ocrConfidenceReport}
              isProcessing={isProcessing}
              hasImage={!!image}
            />

            <div className="ocr-form">
              <section className="intake-tools" aria-label="読み取り・取得">
                <button
                  type="button"
                  className="intake-tools-toggle"
                  aria-expanded={isIntakeToolsOpen}
                  aria-controls="intake-tools-body"
                  onClick={() => setIsIntakeToolsOpen((open) => !open)}
                  data-testid="intake-tools-toggle"
                >
                  <QrCode size={18} aria-hidden="true" />
                  <span className="intake-tools-title">
                    {electronicPrescriptionImplemented ? 'QR・電子処方箋から取り込む' : '処方箋QRから取り込む'}
                  </span>
                  {appliedElectronicPrescription && (
                    <span className="status-chip compact confirmed">反映済み {appliedElectronicPrescriptionIds.length}件</span>
                  )}
                  <ChevronDown size={18} aria-hidden="true" className={isIntakeToolsOpen ? 'chevron open' : 'chevron'} />
                </button>
                {/* 閉じている間もマウントしたままにする(読み取り済みのQRや取得結果を失わないため) */}
                <div id="intake-tools-body" className="intake-tools-body" hidden={!isIntakeToolsOpen}>
                  <PrescriptionQrReader
                    onApplyQrData={handleApplyPrescriptionQrData}
                    disabled={isProcessing || isSaving}
                  />

                  {!electronicPrescriptionImplemented ? (
                    <section
                      className="electronic-prescription-panel is-unimplemented"
                      data-testid="electronic-prescription-panel"
                      aria-label="電子処方箋受付（未実装）"
                    >
                      <div className="electronic-prescription-header">
                        <div>
                          <span className="section-kicker">電子処方箋</span>
                          <strong>電子処方箋での受付</strong>
                        </div>
                        <span className="status-chip warning" data-testid="electronic-prescription-unimplemented-badge">
                          {UNIMPLEMENTED_BADGE_LABEL}
                        </span>
                      </div>
                      <p className="electronic-prescription-note">{electronicPrescriptionUnavailableReason}</p>
                      <button
                        type="button"
                        className="btn-secondary flex-center gap-2"
                        disabled
                        aria-disabled="true"
                        data-testid="electronic-prescription-fetch"
                      >
                        <Search size={16} aria-hidden="true" />
                        {labelWithAvailability('electronicPrescription', '取得して確認')}
                      </button>
                    </section>
                  ) : (
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
                  )}
                </div>
              </section>

              <div className="form-section-title section-first" id="reception-section-patient">患者・保険</div>
              <div className="form-group patient-search-group">
                <label htmlFor="patientSearch">
                  患者を検索
                  <span className="text-danger ml-1 text-sm" aria-hidden="true">*</span>
                </label>
                <div className="patient-search-row">
                  <div className="patient-search-input">
                    <Search size={16} aria-hidden="true" />
                    <input
                      id="patientSearch"
                      type="text"
                      autoComplete="off"
                      maxLength={100}
                      value={patientSearchQuery}
                      onChange={(e) => setPatientSearchQuery(e.target.value)}
                      placeholder={image ? '読み取り中...' : '氏名・フリガナ・生年月日8桁（例: 山田 19850315）'}
                      aria-describedby="patientSearchHint"
                      data-testid="patient-search-input"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-secondary flex-center gap-2"
                    onClick={handleMynaRead}
                    disabled={isReadingMyna || mynaReadButton.disabled}
                    aria-disabled={isReadingMyna || mynaReadButton.disabled}
                    title={mynaReadButton.title}
                    data-testid="myna-read-button"
                  >
                    {isReadingMyna ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                    {isReadingMyna ? '読取中...' : mynaReadButton.label}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary flex-center gap-2"
                    onClick={openPatientRegistration}
                    disabled={!db}
                    aria-disabled={!db}
                    data-testid="patient-register-open-button"
                  >
                    <UserPlus size={16} aria-hidden="true" />
                    新規患者を登録
                  </button>
                </div>
                <span id="patientSearchHint" className="field-hint">
                  登録済みの患者から選びます。氏名・フリガナ・生年月日（半角8桁 例: 19850315）で探せます。空白で区切ると絞り込めます。初めての方は先に「新規患者を登録」してください。
                </span>
                {mynaMessage && (
                  <span className="status-chip confirmed">
                    {mynaMessage}
                  </span>
                )}
              </div>
              {!selectedPatient && (patientName.trim() || patientBirthDate) && (
                <p className="field-hint prescription-patient-hint" data-testid="prescription-patient-hint">
                  読み取った患者: {[patientName.trim(), patientBirthDate && `（${patientBirthDate}）`].filter(Boolean).join(' ')}
                </p>
              )}

              {(patientCandidatePanelViewState.errorBannerMessage
                || patientCandidatePanelViewState.showCandidates
                || selectedPatient
                || isLoadingPatientMergeReview || patientMergeReview || patientMergeMessage
                || patientRegistrationPrompt) && (
                  <div className="patient-selection-panel">
                    <div className="panel-title">患者選択</div>
                    {patientCandidatePanelViewState.errorBannerMessage && (
                      <div className="patient-candidate-fetch-error" role="alert">
                        <AlertTriangle size={16} aria-hidden="true" />
                        <span>{patientCandidatePanelViewState.errorBannerMessage}</span>
                      </div>
                    )}
                    {patientCandidatePanelViewState.showCandidates && (
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
                                onClick={() => selectPatient(patient)}
                              >
                                <span className="candidate-main">{patient.name}</span>
                                <span className="candidate-meta">
                                  {[patient.kana, patient.birthDate].filter(Boolean).join(' / ')} / 保険者番号 {pickReceptionInsuranceNumber(patient.insuranceInfo) || '未登録'}
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
                                {candidatePublicSummaryByPatientId.get(patient.patientId) && (
                                  <span className="candidate-public-tags">
                                    <span className={`candidate-pub-badge ${candidatePublicSummaryByPatientId.get(patient.patientId)?.hasExpired ? 'error' : candidatePublicSummaryByPatientId.get(patient.patientId)?.hasWarning ? 'warning' : 'normal'}`}>
                                      公費: {candidatePublicSummaryByPatientId.get(patient.patientId)?.summary}
                                      {candidatePublicSummaryByPatientId.get(patient.patientId)?.hasExpired && '【期限切】'}
                                      {candidatePublicSummaryByPatientId.get(patient.patientId)?.hasWarning && '【期限注意】'}
                                    </span>
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
                    )}
                    {patientRegistrationPrompt && (
                      <div className="temporary-registration-note" data-testid="patient-not-found-note">
                        <UserPlus size={16} aria-hidden="true" />
                        <span>{patientRegistrationPrompt}</span>
                        <button
                          type="button"
                          className="btn-primary flex-center gap-2"
                          onClick={openPatientRegistration}
                          disabled={!db}
                          aria-disabled={!db}
                          data-testid="patient-register-from-empty-button"
                        >
                          <UserPlus size={16} aria-hidden="true" />
                          新規患者を登録
                        </button>
                      </div>
                    )}
                    {selectedPatient && (
                      <div className="selected-patient-card" data-testid="selected-patient-card">
                        <div className="selected-patient-header">
                          <div className="selected-patient-title-line">
                            <span className="selected-patient-badge">選択中患者</span>
                            <strong className="selected-patient-name">{selectedPatient.name}</strong>
                            <span className="selected-patient-birth">（{selectedPatient.birthDate}）</span>
                            <span className="selected-patient-insurance">
                              保険者番号: {pickReceptionInsuranceNumber(selectedPatient.insuranceInfo) || '未登録'}
                            </span>
                            <button
                              type="button"
                              className="btn-secondary selected-patient-reselect"
                              onClick={clearSelectedPatient}
                              data-testid="reselect-patient-button"
                            >
                              選び直す
                            </button>
                          </div>
                          {(selectedPatientPublicBadges.length > 0 || selectedPatientCopaymentBadges.length > 0) && (
                            <div className="selected-patient-public-badges" data-testid="selected-patient-public-badges">
                              {selectedPatientPublicBadges.map((badge) => (
                                <span
                                  key={`selected-pub-badge-${badge.index}`}
                                  className={`selected-pub-badge ${badge.hasError ? 'error' : badge.hasWarning ? 'warning' : 'normal'}`}
                                  title={badge.warningMessage || `${badge.label} (負担者: ${badge.provider} / 受給者: ${badge.recipient})`}
                                >
                                  公費{badge.index}: {badge.label}
                                  {badge.hasError && '【要確認】'}
                                  {badge.hasWarning && '【期限注意】'}
                                </span>
                              ))}
                              {selectedPatientCopaymentBadges.map((badge, idx) => (
                                <span
                                  key={`selected-copay-badge-${idx}`}
                                  className={`selected-pub-badge ${badge.severity === 'orange' ? 'warning' : badge.severity === 'red' ? 'error' : 'normal'}`}
                                  title={badge.title}
                                  data-testid={`selected-patient-copay-badge-${idx}`}
                                >
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {selectedPatientReceptionAlerts.length > 0 && (
                          <div className="selected-patient-alerts" data-testid="selected-patient-alerts">
                            {selectedPatientReceptionAlerts.map((issue) => (
                              <div
                                key={issue.code}
                                className={`selected-patient-alert-item ${issue.severity}`}
                              >
                                <AlertTriangle size={13} aria-hidden="true" />
                                <span className="alert-item-title">{issue.title}:</span>
                                <span className="alert-item-message">{issue.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
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
                                  {PATIENT_MERGE_COLLECTION_LABEL[reassignment.collection]} {reassignment.count}件
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
                )}


              <div className="form-row">
                <div className="form-group flex-1">
                  <label htmlFor="insuranceNumber">
                    保険者番号
                  </label>
                  <input
                    id="insuranceNumber"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
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

                <div className="form-group is-narrow">
                  <label htmlFor="burdenRatio">
                    負担割合
                  </label>
                  <select
                    id="burdenRatio"
                    value={burdenRatio}
                    onChange={(e) => setBurdenRatio(e.target.value)}
                    className="w-full form-select-md"
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
                  onClick={handleEligibilityCheck}
                  disabled={!onlineEligibilityImplemented || !normalizeInsuranceNumber(insuranceNumber) || eligibilityStatus === 'checking'}
                  aria-disabled={!onlineEligibilityImplemented || !normalizeInsuranceNumber(insuranceNumber) || eligibilityStatus === 'checking'}
                  title={onlineEligibilityImplemented ? undefined : FEATURE_AVAILABILITY.onlineEligibility.unavailableReason}
                  data-testid="online-eligibility-button"
                >
                  {eligibilityStatus === 'checking' ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  {labelWithAvailability('onlineEligibility', 'オンライン資格確認')}
                </button>
                {(mynaReadButton.disabled || !onlineEligibilityImplemented) && (
                  <p className="field-hint reception-tool-note" data-testid="reception-tool-unimplemented-note">
                    {[
                      mynaReaderState.status === 'ready' && !mynaReaderState.available
                        ? `マイナ読取は使えません(${mynaReaderState.reason || '接続先が未設定です'})`
                        : '',
                      !onlineEligibilityImplemented ? 'オンライン資格確認は未実装です' : ''
                    ].filter(Boolean).join('。')}
                    {mynaReaderState.status === 'checking' && onlineEligibilityImplemented ? '' : '。保険者番号・負担割合は手入力してください。'}
                  </p>
                )}
                {eligibilityMessage && (
                  <span
                    className={`status-chip ${eligibilityStatus}`}
                    title={eligibilityResult ? formatOnlineEligibilityFieldMappingReport(eligibilityResult.fieldMapping) : undefined}
                  >
                    {eligibilityMessage}
                  </span>
                )}
              </div>

              <div className="form-section-title" id="reception-section-provider">処方箋情報</div>
              <div className="provider-grid">
                <div className="form-group">
                  <label htmlFor="institutionCode">医療機関コード</label>
                  <input
                    id="institutionCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
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

              {providerHistoryViewState.hasError && (
                <div className="provider-history-list" aria-label="医療機関候補">
                  <p className="provider-history-error" role="alert">
                    {providerHistoryViewState.errorMessage}
                  </p>
                </div>
              )}

              {providerHistoryViewState.status === 'candidates' && (
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

              <div className="prescription-workbench" id="reception-section-prescription">
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
                    hasError={hasPreviousPrescriptionsError}
                    hasPatientContext={!!selectedPatientId}
                    hasCurrentInput={hasCurrentPrescriptionInput}
                  />
                </div>
              </div>

              {patientRegistrationKey !== null && db && (
                <PatientRegistrationModal
                  key={patientRegistrationKey}
                  db={db}
                  initialForm={patientRegistrationInitial.form}
                  initialFromMyna={patientRegistrationInitial.fromMyna}
                  mynaReaderState={mynaReaderState}
                  onClose={closePatientRegistration}
                  onRegistered={handlePatientRegistered}
                  onSelectExisting={handleSelectExistingFromRegistration}
                />
              )}

              <DrugSearchModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSelect={handleModalSelect}
                initialQuery={modalInitialQuery}
                mode={modalTargetField}
                prescribedDrugCode={modalPrescribedCode}
              />

              {(!!image || isProcessing || !!ocrResult) && (
                <OcrRawTextArea isProcessing={isProcessing} ocrResult={ocrResult} />
              )}

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
                    <span className="btn-label-main">{isSaving ? "保存中..." : "外部連携・印刷"}</span>
                    <span className="btn-label-sub">・ピッキングへ</span>
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
