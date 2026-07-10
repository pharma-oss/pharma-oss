'use client';

import React from 'react';
import { BookOpen, ChevronDown, Clock, History, Save, MessageSquare, AlertTriangle, Activity, FileText, CreditCard, Loader2, CheckCircle2, Plus, Printer, Trash2, Sparkles, Camera, Upload, ClipboardList, Download } from 'lucide-react';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { useDatabase } from '@/db/DatabaseProvider';
import type { Alert, FacilitySettings, InsuranceEligibilityStatus, PrescriptionItem, PublicInsurance, SoapRecord as DbSoapRecord, SoapStructuredAssessment, TracingReportStatus, Visit, VisitInitialQuestionnaire, VisitMynaClinicalImport, VisitTracingReport } from '@/db/types';
import { evaluateUsageWarningCondition } from '@/lib/clinical_rules';
import { findPatientAlertDrugWarnings, formatPatientAlertLabel, isActivePatientAlert } from '@/lib/patient_alerts';
import { aggregateStockRequirements, compareStockLotsByExpiration, findMatchingStockLotForGs1Barcode, findStockShortages, getStockDrugId, getTotalStock, calculateRequiredStockAmount, matchGs1BarcodeToStockTarget } from '@/lib/stock';
import { canUserPerform, getCurrentUser, getPermissionDeniedMessage, logAuditAction } from '@/lib/audit';
import { getClaimEditBlockedMessage, isClaimEditBlocked } from '@/lib/claim_edit_guard';
import {
  buildSoapAiDraftSuggestions,
  soapDraftSuggestionToAiAssistSuggestion,
  type SoapAiDraftSuggestion
} from '@/lib/soap_ai_draft';
import { buildAiSuggestionDecisionAuditDetail } from '@/lib/ai_suggestion';
import {
  AI_ASSIST_MODE_LABELS,
  filterAiAssistItemsByMode,
  normalizeAiAssistMode
} from '@/lib/ai_assist_policy';
import type { MynaCardReaderResult } from '@/lib/myna_card_reader';
import {
  buildMynaReadInsuranceDisplay,
  formatPatientInsuranceInfo,
  type MynaReadInsuranceDisplay
} from '@/lib/myna_read_display';
import {
  buildPastProblemSuggestions,
  buildPrescriptionTimeline,
  buildSoapHistoryTimeline,
  type PrescriptionTimelineEntry,
  type SoapHistoryTimelineEntry
} from '@/lib/emr_patient_history';
import {
  createDefaultSoapStructuredAssessment,
  getMissingSoapStructuredAssessmentFields,
  normalizeSoapStructuredAssessment
} from '@/lib/soap_structured_assessment';
import { findDrugInfosByDrugNames } from '@/lib/drug_info_reference';
import { findDrugInteractionWarnings } from '@/lib/drug_interaction_check';
import {
  buildContraindicatedConditionPatientTexts,
  findContraindicatedConditionWarnings
} from '@/lib/drug_contraindicated_condition_check';
import { extractInitialQuestionnaireOcrDraft } from '@/lib/initial_questionnaire_ocr';
import DrugHistoryModal from './DrugHistoryModal';
import WorkflowMiniTutorial from '@/components/WorkflowMiniTutorial';

function toDateInputValue(value?: string): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function todayDateInputValue(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

const inquiryStatusLabel = {
  none: '未照会',
  pending: '照会中',
  completed: '回答済',
  cancelled: '中止'
} as const;

const inquiryMethodLabel = {
  phone: '電話',
  fax: 'FAX',
  in_person: '対面',
  other: 'その他'
} as const;

const tracingStatusLabel: Record<TracingReportStatus, string> = {
  draft: '下書き',
  ready: '送付準備',
  sent: '送付済',
  closed: '完了'
};

const MAX_QUESTIONNAIRE_IMAGE_DATA_URL_LENGTH = 240000;

function dataUrlByteSize(dataUrl: string): number {
  const payload = dataUrl.split(',')[1] || '';
  return Math.ceil((payload.length * 3) / 4);
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('画像を読み込めませんでした。'));
    };
    image.src = objectUrl;
  });
}

async function compressQuestionnaireImage(file: File): Promise<{ dataUrl: string; byteSize: number }> {
  const image = await loadImageFromFile(file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('画像圧縮を実行できませんでした。');

  const candidates = [
    { maxSize: 1100, quality: 0.5 },
    { maxSize: 900, quality: 0.42 },
    { maxSize: 720, quality: 0.34 },
    { maxSize: 560, quality: 0.28 }
  ];

  let fallback = '';
  for (const candidate of candidates) {
    const scale = Math.min(1, candidate.maxSize / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', candidate.quality);
    fallback = dataUrl;
    if (dataUrl.length <= MAX_QUESTIONNAIRE_IMAGE_DATA_URL_LENGTH) {
      return { dataUrl, byteSize: dataUrlByteSize(dataUrl) };
    }
  }

  return { dataUrl: fallback, byteSize: dataUrlByteSize(fallback) };
}

type ReversiblePatch = {
  doc: { patch: (patch: Record<string, unknown>) => Promise<unknown> };
  patch: Record<string, unknown>;
  rollbackPatch: Record<string, unknown>;
  label: string;
};

function safeStockQuantity(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function consumeFromStockLot(stock: any, requestedAmount: number, workingQuantities: Map<string, number>): number {
  if (!stock?.id || requestedAmount <= 0) return 0;
  const available = safeStockQuantity(workingQuantities.has(stock.id) ? workingQuantities.get(stock.id) : stock.quantity);
  const deducted = Math.min(available, requestedAmount);
  if (deducted > 0) {
    workingQuantities.set(stock.id, available - deducted);
  }
  return deducted;
}

async function rollbackAppliedPatches(appliedPatches: ReversiblePatch[]) {
  for (let i = appliedPatches.length - 1; i >= 0; i--) {
    const operation = appliedPatches[i];
    try {
      await operation.doc.patch(operation.rollbackPatch);
    } catch (error) {
      console.error(`Failed to rollback ${operation.label}:`, error);
    }
  }
}

export default function EmrPage() {
  const db = useDatabase();
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  // SOAPエディタが解決した受付ID。null=受付なし(保存不可)、undefined=解決中。
  const [soapVisitId, setSoapVisitId] = useState<string | null | undefined>(undefined);
  const [completionConfirmation, setCompletionConfirmation] = useState<{
    soapEmpty: boolean;
    missingStructuredFields: string[];
    stockShortageText: string;
  } | null>(null);

  // States for warnings
  const [warnings, setWarnings] = useState<any[]>([]);
  const [isWarningsLoading, setIsWarningsLoading] = useState(false);
  const [prescribedDrugs, setPrescribedDrugs] = useState<any[]>([]);
  const [patientAlerts, setPatientAlerts] = useState<Alert[]>([]);

  // States for Picking Support Mode
  const [pickingItems, setPickingItems] = useState<any[]>([]);
  const [isPickingModalOpen, setIsPickingModalOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('openPicking') === '1';
  });
  const [activeEmrSection, setActiveEmrSection] = useState<'soap' | 'history'>('soap');
  const [patientPrescriptionTimeline, setPatientPrescriptionTimeline] = useState<PrescriptionTimelineEntry[]>([]);
  const [soapHistoryTimeline, setSoapHistoryTimeline] = useState<SoapHistoryTimelineEntry[]>([]);
  const [isPatientHistoryLoading, setIsPatientHistoryLoading] = useState(false);
  const [facilitySettings, setFacilitySettings] = useState<FacilitySettings | null>(null);
  const [targetVisitId, setTargetVisitId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('visitId');
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    const visitId = searchParams.get('visitId');
    if (visitId) {
      setTargetVisitId(visitId);
    }
    if (searchParams.get('openPicking') === '1') {
      setIsPickingModalOpen(true);
    }
    if (searchParams.get('openIntervention') === '1') {
      setIsInterventionModalOpen(true);
      const reason = searchParams.get('reason');
      if (reason) setIntReason(reason);
    }
  }, []);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    db.facility_settings.findOne('default').exec()
      .then((doc) => {
        if (!cancelled) {
          setFacilitySettings(doc ? doc.toJSON() : null);
        }
      })
      .catch((error) => {
        console.warn('Failed to load AI assist mode for EMR:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [db]);


  // States for Interventions
  const [interventions, setInterventions] = useState<any[]>([]);
  const [tracingReports, setTracingReports] = useState<VisitTracingReport[]>([]);
  const [initialQuestionnaire, setInitialQuestionnaire] = useState<VisitInitialQuestionnaire | null>(null);
  const [mynaClinicalImports, setMynaClinicalImports] = useState<VisitMynaClinicalImport[]>([]);
  const [isInterventionModalOpen, setIsInterventionModalOpen] = useState(false);
  const [isTracingModalOpen, setIsTracingModalOpen] = useState(false);
  const [isDrugHistoryOpen, setIsDrugHistoryOpen] = useState(false);
  const [intDoctor, setIntDoctor] = useState('');
  const [intReason, setIntReason] = useState('');
  const [intBefore, setIntBefore] = useState('');
  const [intAfter, setIntAfter] = useState('');
  const [intResult, setIntResult] = useState('');
  const [intStatus, setIntStatus] = useState<'pending' | 'completed'>('completed');
  const [intMethod, setIntMethod] = useState<'phone' | 'fax' | 'in_person' | 'other'>('phone');
  const [intResponseDueDate, setIntResponseDueDate] = useState('');
  const [intNote, setIntNote] = useState('');
  const [intConsented, setIntConsented] = useState(true);
  const [tracingReportDate, setTracingReportDate] = useState(() => todayDateInputValue());
  const [tracingStatus, setTracingStatus] = useState<TracingReportStatus>('draft');
  const [tracingDestinationInstitution, setTracingDestinationInstitution] = useState('');
  const [tracingDestinationDepartment, setTracingDestinationDepartment] = useState('');
  const [tracingDestinationDoctor, setTracingDestinationDoctor] = useState('');
  const [tracingSubject, setTracingSubject] = useState('');
  const [tracingMedicationSummary, setTracingMedicationSummary] = useState('');
  const [tracingPatientCondition, setTracingPatientCondition] = useState('');
  const [tracingAssessment, setTracingAssessment] = useState('');
  const [tracingProposal, setTracingProposal] = useState('');
  const [tracingFollowUpPlan, setTracingFollowUpPlan] = useState('');
  const [tracingResponseSummary, setTracingResponseSummary] = useState('');
  const unpickedPickingCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < pickingItems.length; i++) {
      if (!pickingItems[i].isPicked) count++;
    }
    return count;
  }, [pickingItems]);
  const activePatientAlertCount = useMemo(
    () => patientAlerts.filter(isActivePatientAlert).length,
    [patientAlerts]
  );
  const aiAssistMode = normalizeAiAssistMode(facilitySettings?.aiAssistMode);
  const allSoapAiDraftSuggestions = useMemo(() => (
    buildSoapAiDraftSuggestions({
      prescribedDrugs,
      warnings,
      patientAlerts
    })
  ), [prescribedDrugs, warnings, patientAlerts]);
  const soapAiDraftSuggestions = useMemo(() => (
    filterAiAssistItemsByMode(allSoapAiDraftSuggestions, aiAssistMode)
  ), [aiAssistMode, allSoapAiDraftSuggestions]);

  const soapFlushRef = React.useRef<(() => Promise<{ hasContent: boolean; missingStructuredFields: string[] }>) | null>(null);

  const findActiveVisit = useCallback(async () => {
    if (!db) return null;
    if (targetVisitId) {
      return db.visits.findOne(targetVisitId).exec();
    }
    // 処理中の受付が複数あるときは、最新の受付を既定にする(取り違え防止)
    const visits = await db.visits.find({ selector: { status: 'processing' } }).exec();
    if (visits.length === 0) return null;
    return visits.slice().sort((a: Visit, b: Visit) => (b.issueDate || '').localeCompare(a.issueDate || ''))[0];
  }, [db, targetVisitId]);

  const ensureActiveVisitEditable = useCallback(async (scope: 'prescription' | 'soap' | 'picking' | 'stock') => {
    const visit = await findActiveVisit();
    if (!visit) {
      return { ok: false as const, visit: null, message: '処理中の患者が見つかりません' };
    }
    if (isClaimEditBlocked(visit.claimLifecycle)) {
      return {
        ok: false as const,
        visit,
        message: getClaimEditBlockedMessage(visit.claimLifecycle, scope)
      };
    }
    return { ok: true as const, visit, message: '' };
  }, [findActiveVisit]);

  // To receive the addEntry event from DocLinkInsightCard we need to pass a callback.
  // Because SoapEditor manages its own state internally right now, we either need to lift SoapEditor state up
  // or use an event dispatcher. Let's use a simple custom event for decoupled communication.
  const handleSelectGuidance = useCallback((type: string, text: string) => {
    document.dispatchEvent(new CustomEvent('insert-soap-guidance', { detail: { type, text } }));
  }, []);

  const handleFocusSoapEvidence = useCallback((targetId?: string) => {
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) {
      toast.info('根拠の表示先がまだ読み込まれていません。');
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('soap-evidence-focus');
    window.setTimeout(() => {
      target.classList.remove('soap-evidence-focus');
    }, 1600);
  }, []);

  const handleApplySoapAiDraft = useCallback(async (draft: SoapAiDraftSuggestion) => {
    const currentUser = getCurrentUser();
    if (!canUserPerform(currentUser, 'review_ai_suggestions')) {
      toast.error(getPermissionDeniedMessage(currentUser, 'review_ai_suggestions'));
      return;
    }

    const editable = await ensureActiveVisitEditable('soap');
    if (!editable.ok) {
      toast.error(editable.message);
      return;
    }

    document.dispatchEvent(new CustomEvent('insert-soap-guidance', {
      detail: { type: draft.type, text: draft.text }
    }));

    if (!db || !editable.visit) {
      toast.success(`SOAP ${draft.type} にAI補助下書きを反映しました。`);
      return;
    }

    try {
      const patients = await db.patients.find({ selector: { patientId: editable.visit.patientId } }).exec();
      const patientName = patients[0]?.name || '不明';
      await logAuditAction(
        db,
        'ai_suggestion_review',
        buildAiSuggestionDecisionAuditDetail({
          suggestion: soapDraftSuggestionToAiAssistSuggestion(draft),
          decision: 'accepted',
          reviewerName: currentUser.name,
          feedback: 'SOAP下書きへ反映'
        }),
        editable.visit.patientId,
        patientName
      );
      toast.success(`SOAP ${draft.type} にAI補助下書きを反映し、監査ログへ記録しました。`);
    } catch (error) {
      console.error('Failed to log SOAP AI draft application:', error);
      toast.warning(`SOAP ${draft.type} に反映しましたが、監査ログ記録に失敗しました。`);
    }
  }, [db, ensureActiveVisitEditable]);

  const handleAddIntervention = async (input: {
    reason: string;
    beforeSnapshot: string;
    afterSnapshot: string;
    inquiryStatus: 'pending' | 'completed';
    inquiryMethod: 'phone' | 'fax' | 'in_person' | 'other';
    inquiryDoctor: string;
    inquiryResult: string;
    responseDueDate: string;
    note: string;
    patientConsented: boolean;
  }) => {
    if (!db) return;
    try {
      const visit = await findActiveVisit();
      if (!visit) return;
      if (isClaimEditBlocked(visit.claimLifecycle)) {
        toast.error(getClaimEditBlockedMessage(visit.claimLifecycle, 'prescription'));
        return;
      }

      const newId = `int_${uuidv4()}`;
      const now = new Date().toISOString();
      const newRecord = {
        interventionId: newId,
        visitId: visit.visitId,
        beforeSnapshot: input.beforeSnapshot,
        afterSnapshot: input.afterSnapshot,
        reason: input.reason,
        inquiryStatus: input.inquiryStatus,
        inquiryMethod: input.inquiryMethod,
        inquiryDoctor: input.inquiryDoctor,
        inquiryResult: input.inquiryResult,
        responseDueDate: input.responseDueDate || undefined,
        contactedAt: now,
        respondedAt: input.inquiryStatus === 'completed' ? now : undefined,
        handledBy: getCurrentUser().name,
        note: input.note,
        patientConsented: input.patientConsented,
        createdAt: now,
        updatedAt: now
      };

      const insertedDoc = await db.interventions.insert(newRecord);

      // 監査ログの記録
      const patients = await db.patients.find({ selector: { patientId: visit.patientId } }).exec();
      const patientName = patients[0]?.name || '不明';
      const auditOk = await logAuditAction(
        db,
        'prescription_edit',
        `疑義照会登録: 状態 ${inquiryStatusLabel[input.inquiryStatus]} / 方法 ${inquiryMethodLabel[input.inquiryMethod]} / 照会先「${input.inquiryDoctor || '未指定'}」 / 理由: ${input.reason} / 結果: ${input.inquiryResult || '未回答'}${input.responseDueDate ? ` / 回答期限: ${input.responseDueDate}` : ''}。`,
        visit.patientId,
        patientName
      );
      if (!auditOk) {
        await insertedDoc.remove();
        throw new Error('疑義照会記録の監査ログ記録に失敗したため、記録を元に戻しました。');
      }

      setInterventions(prev => [...prev, newRecord]);
      toast.success(input.inquiryStatus === 'pending' ? '疑義照会を照会中として記録しました' : '疑義照会・処方変更を記録しました');
    } catch (err) {
      console.error('Failed to save intervention:', err);
      toast.error('保存に失敗しました');
    }
  };

  const resetInterventionForm = useCallback(() => {
    setIntDoctor('');
    setIntReason('');
    setIntBefore('');
    setIntAfter('');
    setIntResult('');
    setIntStatus('completed');
    setIntMethod('phone');
    setIntResponseDueDate('');
    setIntNote('');
    setIntConsented(true);
  }, []);

  const resetTracingForm = useCallback(() => {
    setTracingReportDate(todayDateInputValue());
    setTracingStatus('draft');
    setTracingDestinationInstitution('');
    setTracingDestinationDepartment('');
    setTracingDestinationDoctor('');
    setTracingSubject('');
    setTracingMedicationSummary('');
    setTracingPatientCondition('');
    setTracingAssessment('');
    setTracingProposal('');
    setTracingFollowUpPlan('');
    setTracingResponseSummary('');
  }, []);

  const handleAddTracingReport = useCallback(async () => {
    if (!db) return;
    const visit = await findActiveVisit();
    if (!visit) {
      toast.error('処理中の患者が見つかりません');
      return;
    }
    if (!tracingSubject.trim()) {
      alert('件名を入力してください。');
      return;
    }

    const now = new Date().toISOString();
    const currentVisit = visit.toJSON() as Visit;
    const currentCareCommunication = currentVisit.careCommunication || {};
    const report: VisitTracingReport = {
      reportId: `tr_${uuidv4()}`,
      status: tracingStatus,
      reportDate: tracingReportDate || todayDateInputValue(),
      destinationInstitution: tracingDestinationInstitution.trim() || currentVisit.institutionName || '',
      destinationDepartment: tracingDestinationDepartment.trim() || currentVisit.departmentName || '',
      destinationDoctor: tracingDestinationDoctor.trim() || currentVisit.doctorName || '',
      subject: tracingSubject.trim(),
      medicationSummary: tracingMedicationSummary.trim(),
      patientCondition: tracingPatientCondition.trim(),
      assessment: tracingAssessment.trim(),
      proposal: tracingProposal.trim(),
      followUpPlan: tracingFollowUpPlan.trim(),
      sentAt: tracingStatus === 'sent' || tracingStatus === 'closed' ? now : undefined,
      sentBy: tracingStatus === 'sent' || tracingStatus === 'closed' ? getCurrentUser().name : undefined,
      responseSummary: tracingResponseSummary.trim(),
      createdAt: now,
      updatedAt: now
    };

    try {
      const nextReports = [report, ...(currentCareCommunication.tracingReports || [])];
      await visit.patch({
        careCommunication: {
          ...currentCareCommunication,
          tracingReports: nextReports,
          updatedAt: now
        }
      });
      setTracingReports(nextReports);

      const patients = await db.patients.find({ selector: { patientId: currentVisit.patientId } }).exec();
      const patientName = patients[0]?.name || '不明';
      const auditOk = await logAuditAction(
        db,
        'follow_up_record',
        `トレーシングレポート記録: ${tracingStatusLabel[report.status]} / ${report.subject} / 宛先 ${report.destinationInstitution || '未指定'} ${report.destinationDoctor || ''}`,
        currentVisit.patientId,
        patientName
      );
      if (!auditOk) {
        toast.warning('レポートは保存しましたが、監査ログ記録に失敗しました。');
      } else {
        toast.success('トレーシングレポートを記録しました');
      }
      setIsTracingModalOpen(false);
      resetTracingForm();
    } catch (error) {
      console.error('Failed to save tracing report:', error);
      toast.error('トレーシングレポートの保存に失敗しました');
    }
  }, [
    db,
    findActiveVisit,
    resetTracingForm,
    tracingAssessment,
    tracingDestinationDepartment,
    tracingDestinationDoctor,
    tracingDestinationInstitution,
    tracingFollowUpPlan,
    tracingMedicationSummary,
    tracingPatientCondition,
    tracingProposal,
    tracingReportDate,
    tracingResponseSummary,
    tracingStatus,
    tracingSubject
  ]);

  useEffect(() => {
    async function fetchInterventions() {
      if (!db) return;
      try {
        const visit = await findActiveVisit();
        if (visit) {
          const list = await db.interventions.find({ selector: { visitId: visit.visitId } }).exec();
          setInterventions(list.map(d => d.toJSON()));
          const visitJson = visit.toJSON() as Visit;
          setTracingReports(visitJson.careCommunication?.tracingReports || []);
          setInitialQuestionnaire(visitJson.initialQuestionnaire || null);
          setMynaClinicalImports(visitJson.careCommunication?.mynaClinicalImports || []);
        } else {
          setInterventions([]);
          setTracingReports([]);
          setInitialQuestionnaire(null);
          setMynaClinicalImports([]);
        }
      } catch (err) {
        console.error('Failed to load interventions:', err);
      }
    }
    fetchInterventions();
    document.addEventListener('visit-care-communication-updated', fetchInterventions);
    return () => {
      document.removeEventListener('visit-care-communication-updated', fetchInterventions);
    };
  }, [db, findActiveVisit]);

  useEffect(() => {
    let isCancelled = false;

    async function fetchPatientHistory() {
      if (!db) {
        setPatientPrescriptionTimeline([]);
        setSoapHistoryTimeline([]);
        return;
      }

      setIsPatientHistoryLoading(true);
      try {
        const activeVisitDoc = await findActiveVisit();
        if (!activeVisitDoc) {
          if (!isCancelled) {
            setPatientPrescriptionTimeline([]);
            setSoapHistoryTimeline([]);
          }
          return;
        }

        const activeVisit = (activeVisitDoc.toJSON?.() ?? activeVisitDoc) as Visit;
        const visitDocs = await db.visits.find({ selector: { patientId: activeVisit.patientId } }).exec();
        const visits = visitDocs.map((visitDoc) => visitDoc.toJSON()) as Visit[];
        const visitIds = visits.map((visit) => visit.visitId);

        const itemDocs = visitIds.length > 0
          ? await db.prescription_items.find({ selector: { visitId: { $in: visitIds } } }).exec()
          : [];
        const items = itemDocs.map((itemDoc) => itemDoc.toJSON()) as PrescriptionItem[];

        const drugIds = Array.from(new Set(
          items
            .flatMap((item) => [item.drugId, item.dispensedDrugCode])
            .filter((drugId): drugId is string => !!drugId)
        ));
        const drugDocsMap = drugIds.length > 0
          ? await db.drugs.findByIds(drugIds).exec()
          : new Map();
        const drugNamesById = new Map<string, string>();
        for (const [drugId, drugDoc] of drugDocsMap.entries()) {
          if (drugDoc?.name) drugNamesById.set(drugId, drugDoc.name);
        }

        const soapDocs = visitIds.length > 0
          ? await db.soap_records.find({ selector: { visitId: { $in: visitIds } } }).exec()
          : [];
        const soapRecords = soapDocs.map((soapDoc) => soapDoc.toJSON()) as DbSoapRecord[];

        if (!isCancelled) {
          setPatientPrescriptionTimeline(buildPrescriptionTimeline({
            visits,
            items,
            currentVisitId: activeVisit.visitId,
            drugNamesById,
            maxEntries: 8
          }));
          setSoapHistoryTimeline(buildSoapHistoryTimeline({
            visits,
            soapRecords,
            currentVisitId: activeVisit.visitId,
            maxEntries: 6
          }));
        }
      } catch (error) {
        console.error('Failed to load patient history:', error);
        if (!isCancelled) {
          setPatientPrescriptionTimeline([]);
          setSoapHistoryTimeline([]);
        }
      } finally {
        if (!isCancelled) setIsPatientHistoryLoading(false);
      }
    }

    fetchPatientHistory();
    return () => { isCancelled = true; };
  }, [db, findActiveVisit]);

  useEffect(() => {
    const activeDb = db;
    if (!activeDb) return;

    let prescriptionSub: any;
    let isCancelled = false;

    async function setupSubscriptions() {
      if (!activeDb) return;
      try {
        const visit = await findActiveVisit();
        if (!visit) {
          if (!isCancelled) setPickingItems([]);
          return;
        }
        const visitId = visit.visitId;

        const presQuery = activeDb.prescription_items.find({ selector: { visitId } });

        let currentItems: any[] = [];

        const updateJoinedItems = async () => {
          if (isCancelled || !activeDb) return;
          if (currentItems.length === 0) {

            setPickingItems([]);
            return;
          }

          // Fetch prescribed and dispensed drug codes so picking follows the actual dispensed product.
          const drugIdSet = new Set<string>();
          const stockDrugIdSet = new Set<string>();
          for (let i = 0; i < currentItems.length; i++) {
            const item = currentItems[i];
            const stockDrugId = getStockDrugId(item);
            if (item.drugId) drugIdSet.add(item.drugId);
            if (stockDrugId) {
              drugIdSet.add(stockDrugId);
              stockDrugIdSet.add(stockDrugId);
            }
          }
          const drugIds = Array.from(drugIdSet);
          const stockDrugIds = Array.from(stockDrugIdSet);
          const drugsMap = await activeDb.drugs.findByIds(drugIds).exec();
          const stockLots = stockDrugIds.length > 0
            ? await activeDb.drug_stocks.find({ selector: { drugCode: { $in: stockDrugIds } } }).exec()
            : [];

          const janCodesByDrugId = new Map<string, string[]>();
          const stockLotsByDrugId = new Map<string, Array<{
            id: string;
            janCode?: string;
            lotNumber?: string;
            expirationDate?: string;
            arrivalDate?: string;
            quantity: number;
          }>>();
          for (let i = 0; i < stockLots.length; i++) {
            const lot = stockLots[i];
            const stockLot = {
              id: lot.id,
              janCode: lot.janCode,
              lotNumber: lot.lotNumber,
              expirationDate: lot.expirationDate,
              arrivalDate: lot.arrivalDate,
              quantity: lot.quantity
            };
            const lots = stockLotsByDrugId.get(lot.drugCode) || [];
            lots.push(stockLot);
            stockLotsByDrugId.set(lot.drugCode, lots);

            if (!lot.janCode) continue;
            const codes = janCodesByDrugId.get(lot.drugCode) || [];
            if (!codes.includes(lot.janCode)) codes.push(lot.janCode);
            janCodesByDrugId.set(lot.drugCode, codes);
          }

          for (const lots of stockLotsByDrugId.values()) {
            lots.sort(compareStockLotsByExpiration);
          }

          const joined = currentItems.map(item => {
            const stockDrugId = getStockDrugId(item);
            const drug = drugsMap.get(stockDrugId) || drugsMap.get(item.drugId);
            return {
              itemId: item.itemId,
              visitId: item.visitId,
              drugId: item.drugId,
              stockDrugId,
              drugName: item.dispensedDrug || drug?.name || '不明',
              prescribedDrugName: drugsMap.get(item.drugId)?.name || item.drugId,
              yjCode: drug?.yjCode,
              janCodes: janCodesByDrugId.get(stockDrugId) || [],
              location: drug?.location || '',
              amount: item.amount,
              usage: item.usage || '',
              days: item.days,
              totalQuantity: calculateRequiredStockAmount({
                drugId: stockDrugId,
                amount: item.amount,
                days: item.days
              }),
              isPicked: !!item.isPicked,
              pickedAt: item.pickedAt,
              pickedGs1Code: item.pickedGs1Code,
              pickedGtin: item.pickedGtin,
              pickedLotNumber: item.pickedLotNumber,
              pickedExpirationDate: item.pickedExpirationDate,
              pickedStockId: item.pickedStockId,
              shortageQuantity: item.shortageQuantity || 0,
              shortageNote: item.shortageNote || '',
              stockLots: stockLotsByDrugId.get(stockDrugId) || []
            };
          });

          // Sort by shelf location (empty locations go to the bottom)
          joined.sort((a, b) => {
            if (!a.location && !b.location) return 0;
            if (!a.location) return 1;
            if (!b.location) return -1;
            return a.location.localeCompare(b.location, 'ja');
          });

          if (!isCancelled) {
            setPickingItems(joined);
          }
        };

        prescriptionSub = presQuery.$.subscribe((items) => {
          currentItems = items;
          updateJoinedItems();
        });

      } catch (err) {
        console.error('Failed to setup picking subscriptions:', err);
      }
    }

    setupSubscriptions();

    return () => {
      isCancelled = true;
      if (prescriptionSub) prescriptionSub.unsubscribe();
    };
  }, [db, findActiveVisit]);

  const handleVerifyPickingScan = useCallback(async (scanValue: string) => {
    if (!db) return { ok: false, message: 'データベースが未接続です。' };
    const input = scanValue.trim();
    if (!input) {
      return { ok: false, message: 'GS1コードを入力してください。' };
    }

    try {
      const editable = await ensureActiveVisitEditable('picking');
      if (!editable.ok) {
        toast.error(editable.message);
        return { ok: false, message: editable.message };
      }
      let alreadyVerifiedDrugName = '';

      for (let i = 0; i < pickingItems.length; i++) {
        const item = pickingItems[i];
        const result = matchGs1BarcodeToStockTarget(input, {
          stockDrugId: item.stockDrugId,
          yjCode: item.yjCode,
          janCodes: item.janCodes || []
        });

        if (!result.matched) continue;

        if (item.isPicked) {
          alreadyVerifiedDrugName = item.drugName;
          continue;
        }

        const doc = await db.prescription_items.findOne(item.itemId).exec();
        if (!doc) {
          toast.error('ピッキング対象の処方明細が見つかりません');
          return { ok: false, message: 'ピッキング対象の処方明細が見つかりません。' };
        }

        const matchedStockLot = findMatchingStockLotForGs1Barcode(result.parsed, item.stockLots || []);
        await doc.modify((data: PrescriptionItem) => {
          data.isPicked = true;
          data.pickedAt = new Date().toISOString();
          data.pickedGs1Code = result.parsed.raw;
          delete data.pickedGtin;
          delete data.pickedLotNumber;
          delete data.pickedExpirationDate;
          delete data.pickedStockId;
          if (result.parsed.gtin) data.pickedGtin = result.parsed.gtin;
          if (result.parsed.lotNumber) data.pickedLotNumber = result.parsed.lotNumber;
          if (result.parsed.expirationDate) data.pickedExpirationDate = result.parsed.expirationDate;
          if (matchedStockLot?.id) data.pickedStockId = matchedStockLot.id;
          return data;
        });
        const stockLinkText = matchedStockLot?.id ? '（在庫ロット紐付け済み）' : '（在庫引落は期限順）';
        toast.success(`${item.drugName} をGS1照合しました${stockLinkText}`);
        return {
          ok: true,
          itemId: item.itemId,
          drugName: item.drugName,
          message: `${item.drugName} と照合しました。${stockLinkText}`
        };
      }

      if (alreadyVerifiedDrugName) {
        return {
          ok: false,
          message: `${alreadyVerifiedDrugName} は既にGS1照合済みです。`
        };
      }

      return {
        ok: false,
        message: '読み取ったGS1コードは今回の未照合薬と一致しません。薬品名、棚番地、入荷JAN/GTINを確認してください。'
      };
    } catch (e) {
      console.error('Failed to verify GS1 picking scan:', e);
      toast.error('GS1照合の保存に失敗しました');
      return { ok: false, message: 'GS1照合の保存に失敗しました。' };
    }
  }, [db, ensureActiveVisitEditable, pickingItems]);

  const handleResetPickingItem = useCallback(async (itemId: string) => {
    if (!db) return;
    try {
      const editable = await ensureActiveVisitEditable('picking');
      if (!editable.ok) {
        toast.error(editable.message);
        return;
      }
      const doc = await db.prescription_items.findOne(itemId).exec();
      if (!doc) {
        toast.error('ピッキング対象の処方明細が見つかりません');
        return;
      }
      await doc.modify((data: PrescriptionItem) => {
        data.isPicked = false;
        delete data.pickedAt;
        delete data.pickedGs1Code;
        delete data.pickedGtin;
        delete data.pickedLotNumber;
        delete data.pickedExpirationDate;
        delete data.pickedStockId;
        return data;
      });
      toast.success('GS1照合を解除しました');
    } catch (e) {
      console.error('Failed to reset picking state:', e);
      toast.error('ピッキング状態の更新に失敗しました');
    }
  }, [db, ensureActiveVisitEditable]);

  // 棚在庫が足りない時に不足数とメモを処方明細へ記録する(0で解除)
  const handleRecordPickingShortage = useCallback(async (itemId: string, quantity: number, note: string) => {
    if (!db) return;
    try {
      const editable = await ensureActiveVisitEditable('picking');
      if (!editable.ok) {
        toast.error(editable.message);
        return;
      }
      const doc = await db.prescription_items.findOne(itemId).exec();
      if (!doc) {
        toast.error('ピッキング対象の処方明細が見つかりません');
        return;
      }
      const drugName = doc.dispensedDrug || doc.drugId;
      const trimmedNote = note.trim();

      if (quantity > 0) {
        await doc.modify((data: PrescriptionItem) => {
          data.shortageQuantity = quantity;
          if (trimmedNote) {
            data.shortageNote = trimmedNote;
          } else {
            delete data.shortageNote;
          }
          data.shortageRecordedAt = new Date().toISOString();
          return data;
        });
        await logAuditAction(
          db,
          'stock_update',
          `ピッキング不足登録: 「${drugName}」の不足 ${quantity} を記録しました。${trimmedNote ? `メモ: ${trimmedNote}` : ''}`
        );
        toast.success(`不足を記録しました（${drugName} / ${quantity}）`);
      } else {
        await doc.modify((data: PrescriptionItem) => {
          delete data.shortageQuantity;
          delete data.shortageNote;
          delete data.shortageRecordedAt;
          return data;
        });
        await logAuditAction(
          db,
          'stock_update',
          `ピッキング不足解除: 「${drugName}」の不足記録を解除しました。`
        );
        toast.success('不足記録を解除しました');
      }
    } catch (e) {
      console.error('Failed to record picking shortage:', e);
      toast.error('不足数の保存に失敗しました');
    }
  }, [db, ensureActiveVisitEditable]);

  // ピッキング結果をレジロール紙(80mm)向けの専用ウィンドウで印刷する
  const handlePrintPickingReceipt = useCallback(async () => {
    if (pickingItems.length === 0) {
      toast.info('印刷するピッキング項目がありません。');
      return;
    }
    if (!db) {
      toast.error('データベースの準備ができていません。しばらく待ってから再実行してください。');
      return;
    }
    try {
      let patientName = '患者未選択';
      let dispensingDate = '';
      let patientId = '';
      const visitDoc = await findActiveVisit();
      if (visitDoc) {
        const visit = (visitDoc.toJSON?.() ?? visitDoc) as Visit;
        dispensingDate = visit.dispensingDate || visit.prescriptionDate || '';
        patientId = visit.patientId;
        const patientDoc = await db.patients.findOne(visit.patientId).exec();
        if (patientDoc?.name) patientName = patientDoc.name;
      }

      let pharmacyName = '';
      try {
        const settings = await db.facility_settings.findOne('default').exec();
        pharmacyName = settings?.pharmacyName || '';
      } catch {
        // 施設名が取れなくても印刷は続行する
      }

      const { openPickingReceiptPrintWindow } = await import('@/lib/picking_receipt');
      const opened = openPickingReceiptPrintWindow({
        pharmacyName,
        patientName,
        dispensingDate,
        operatorName: getCurrentUser().name,
        items: pickingItems.map((item) => ({
          location: item.location,
          drugName: item.drugName,
          totalQuantity: item.totalQuantity,
          usage: item.usage,
          days: item.days,
          isPicked: !!item.isPicked,
          pickedLotNumber: item.pickedLotNumber,
          pickedExpirationDate: item.pickedExpirationDate,
          shortageQuantity: item.shortageQuantity,
          shortageNote: item.shortageNote
        }))
      });
      if (!opened) {
        toast.error('印刷ウィンドウを開けませんでした。ポップアップを許可してください。');
        return;
      }
      await logAuditAction(
        db,
        'print',
        `ピッキングリスト印刷: 「${patientName}」のピッキングリストをレジロール用に印刷しました（${pickingItems.length}品目）。`,
        patientId,
        patientName
      );
    } catch (e) {
      console.error('Failed to print picking receipt:', e);
      toast.error('ピッキングリストの印刷に失敗しました');
    }
  }, [db, findActiveVisit, pickingItems]);

  // 既存(外部)ピッキングシステムへ渡す指示CSV(棚番地・JAN・必要数量・ロット候補入り)を書き出す
  const handleExportPickingInstruction = useCallback(async () => {
    if (pickingItems.length === 0) {
      toast.info('書き出すピッキング項目がありません。');
      return;
    }
    if (!db) {
      toast.error('データベースの準備ができていません。しばらく待ってから再実行してください。');
      return;
    }
    try {
      const visitDoc = await findActiveVisit();
      if (!visitDoc) {
        toast.error('対象の受付が見つかりません。');
        return;
      }
      const visit = (visitDoc.toJSON?.() ?? visitDoc) as Visit;
      const patientDoc = await db.patients.findOne(visit.patientId).exec();
      const settings = await db.facility_settings.findOne('default').exec();

      const {
        buildPickingInstruction,
        buildPickingInstructionCsv,
        buildPickingInstructionFileName
      } = await import('@/lib/picking_system');
      const instruction = buildPickingInstruction({
        visitId: visit.visitId,
        patientName: patientDoc?.name || '患者名未登録',
        patientKana: patientDoc?.kana || '',
        dispensingDate: visit.dispensingDate || visit.prescriptionDate || '',
        pharmacyName: settings?.pharmacyName || '',
        items: pickingItems.map((item) => ({
          itemId: item.itemId,
          rpNumber: item.rpNumber,
          drugCode: item.stockDrugId || item.drugId,
          yjCode: item.yjCode,
          janCodes: item.janCodes,
          drugName: item.drugName,
          totalQuantity: item.totalQuantity,
          usage: item.usage,
          days: item.days,
          location: item.location,
          isPicked: item.isPicked,
          stockLots: (item.stockLots || []).map((lot: any) => ({
            lotNumber: lot.lotNumber,
            expirationDate: lot.expirationDate,
            quantity: lot.quantity
          }))
        }))
      });
      const fileName = buildPickingInstructionFileName(visit.visitId);
      const csv = buildPickingInstructionCsv(instruction);
      const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      await logAuditAction(
        db,
        'stock_update',
        `ピッキング指示CSV書き出し: 「${fileName}」に${instruction.items.length}品目を出力しました（外部ピッキングシステム連携用・店舗内利用限定）。`,
        visit.patientId,
        patientDoc?.name
      );
      toast.success(`ピッキング指示CSVを書き出しました（${instruction.items.length}品目）。`);
    } catch (e) {
      console.error('Failed to export picking instruction:', e);
      toast.error('ピッキング指示CSVの書き出しに失敗しました');
    }
  }, [db, findActiveVisit, pickingItems]);

  // 外部ピッキングシステムが出力した結果CSV/TSVを読み取り、GS1照合と同じ形へ反映する
  const handleImportPickingResultFile = useCallback(async (file: File) => {
    if (!db) {
      toast.error('データベースの準備ができていません。しばらく待ってから再実行してください。');
      return;
    }
    try {
      const editable = await ensureActiveVisitEditable('picking');
      if (!editable.ok) {
        toast.error(editable.message);
        return;
      }
      const visitDoc = await findActiveVisit();
      if (!visitDoc) {
        toast.error('対象の受付が見つかりません。');
        return;
      }
      const visit = (visitDoc.toJSON?.() ?? visitDoc) as Visit;

      const text = await file.text();
      const {
        parsePickingSystemResult,
        buildPickingResultApplyPlan,
        buildPickingResultAuditDetail
      } = await import('@/lib/picking_system');
      const parsed = parsePickingSystemResult(text);
      if (!parsed.ok) {
        toast.error(parsed.message || 'ピッキング結果を読み取れませんでした。');
        return;
      }
      const plan = buildPickingResultApplyPlan({
        visitId: visit.visitId,
        items: pickingItems.map((item) => ({
          itemId: item.itemId,
          drugId: item.drugId,
          stockDrugId: item.stockDrugId,
          yjCode: item.yjCode,
          janCodes: item.janCodes,
          drugName: item.drugName,
          totalQuantity: item.totalQuantity,
          isPicked: item.isPicked
        })),
        rows: [...parsed.rows]
      });
      const allIssues = [...parsed.issues, ...plan.issues];
      if (!plan.canApply) {
        const issueText = allIssues.slice(0, 5).map((issue) => `${issue.lineNumber}行目: ${issue.message}`).join('\n');
        toast.error(`反映できる結果がありません。\n${issueText}`.trim());
        return;
      }

      const detailLines = [
        ...plan.updates.slice(0, 8).map((update) => (
          update.action === 'picked'
            ? `照合: ${update.drugName}${update.lotNumber ? ` (Lot ${update.lotNumber})` : ''}${update.warnings.length > 0 ? ` ※${update.warnings.join(' ')}` : ''}`
            : `不足: ${update.drugName} (${update.shortageQuantity})`
        )),
        ...(plan.updates.length > 8 ? [`ほか${plan.updates.length - 8}件`] : []),
        ...allIssues.slice(0, 3).map((issue) => `取込不可 ${issue.lineNumber}行目: ${issue.message}`)
      ];
      const shouldApply = window.confirm(
        `外部ピッキング結果を反映します（${plan.summary}）。\n\n${detailLines.join('\n')}\n\nよろしいですか？`
      );
      if (!shouldApply) return;

      const appliedAt = new Date().toISOString();
      for (const update of plan.updates) {
        const doc = await db.prescription_items.findOne(update.itemId).exec();
        if (!doc) continue;
        if (update.action === 'picked') {
          await doc.modify((data: PrescriptionItem) => {
            data.isPicked = true;
            data.pickedAt = appliedAt;
            delete data.pickedGs1Code;
            delete data.pickedGtin;
            delete data.pickedStockId;
            delete data.pickedLotNumber;
            delete data.pickedExpirationDate;
            if (update.lotNumber) data.pickedLotNumber = update.lotNumber;
            if (update.expirationDate) data.pickedExpirationDate = update.expirationDate;
            return data;
          });
        } else {
          await doc.modify((data: PrescriptionItem) => {
            data.shortageQuantity = update.shortageQuantity as number;
            if (update.note) {
              data.shortageNote = update.note;
            }
            data.shortageRecordedAt = appliedAt;
            return data;
          });
        }
      }

      const patientDoc = await db.patients.findOne(visit.patientId).exec();
      await logAuditAction(
        db,
        'stock_update',
        `${buildPickingResultAuditDetail(plan)}（結果ファイル: ${file.name}）。反映後は現物とロット・期限の一致を確認してください。`,
        visit.patientId,
        patientDoc?.name
      );
      toast.success(`外部ピッキング結果を反映しました（${plan.summary}）。`);
    } catch (e) {
      console.error('Failed to import picking system result:', e);
      toast.error('ピッキング結果の取込に失敗しました');
    }
  }, [db, ensureActiveVisitEditable, findActiveVisit, pickingItems]);



useEffect(() => {
    async function fetchWarnings() {
      if (!db) return;
      setIsWarningsLoading(true);
      try {
        const visit = await findActiveVisit();
        if (!visit) {
          setWarnings([]);
          setPrescribedDrugs([]);
          setPatientAlerts([]);
          setIsWarningsLoading(false);
          return;
        }
        const visitJson = visit.toJSON() as Visit;
        const items = await db.prescription_items.find({ selector: { visitId: visit.visitId } }).exec();

        const newWarnings = [];

        let patientAgeVal = 0;
        let activePatientAlertsArr: Alert[] = [];
        try {
            const patients = await db.patients.find({ selector: { patientId: visit.patientId } }).exec();
            const patient = patients[0];
            if (patient && patient.birthDate) {
                const birth = new Date(patient.birthDate);
                const today = new Date();
                patientAgeVal = today.getFullYear() - birth.getFullYear();
                if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) {
                    patientAgeVal--;
                }
            }

            const alerts = await db.alerts.find({ selector: { patientId: visit.patientId } }).exec();
            activePatientAlertsArr = alerts.map((alert) => alert.toJSON()).filter(isActivePatientAlert);
            setPatientAlerts(activePatientAlertsArr);
        } catch (e) {
            console.error("Failed to fetch patient data for warnings", e);
        }

        const contraindicatedConditionPatientTexts = buildContraindicatedConditionPatientTexts({
          alerts: activePatientAlertsArr,
          initialQuestionnaire: visitJson.initialQuestionnaire || null
        });

        const currentDrugs = [];
        const currentAlertItems = [];

        // ⚡ Bolt: Eliminate N+1 queries by fetching all drugs in a single batch
        const drugIdSet = new Set<string>();
        for (let i = 0; i < items.length; i++) {
          drugIdSet.add(items[i].drugId);
        }
        const drugIds = Array.from(drugIdSet);
        const drugsMap = await db.drugs.findByIds(drugIds).exec();

        // Fetch all drug names in current prescription for cross-checking
        for (const item of items) {
           const drug = drugsMap.get(item.drugId);
           if (drug) {
              currentDrugs.push(drug);
              currentAlertItems.push({
                itemId: item.itemId,
                drugId: item.drugId,
                drugName: drug.name,
                dispensedDrug: item.dispensedDrug,
                yjCode: drug.yjCode,
                genericName: drug.genericName
              });
           }
        }
        setPrescribedDrugs(currentDrugs);

        const patientAlertWarnings = findPatientAlertDrugWarnings(activePatientAlertsArr, currentAlertItems);
        for (const warning of patientAlertWarnings) {
          newWarnings.push({
            type: 'patient_alert',
            severity: warning.severity,
            drug: warning.drugName,
            alertType: warning.alertType,
            message: warning.message
          });
        }

        // ⚡ Bolt: Eliminate sequential N+1 database queries by fetching all drug infos concurrently.
        // Also eliminate redundant queries by collecting unique drug names first.
        const uniqueDrugs = new Map();
        for (let i = 0; i < items.length; i++) {
           const drug = drugsMap.get(items[i].drugId);
           if (drug && !uniqueDrugs.has(drug.name)) {
              uniqueDrugs.set(drug.name, drug);
           }
        }

        const drugInfoMap = await findDrugInfosByDrugNames(
          Array.from(uniqueDrugs.values()).map((drug) => drug.name)
        );

        const interactionResult = findDrugInteractionWarnings(
          Array.from(uniqueDrugs.values()).map((drug) => ({
            drugId: drug.code,
            drugName: drug.name,
            genericName: drug.genericName
          })),
          drugInfoMap
        );
        for (const warning of interactionResult.warnings) {
          newWarnings.push({
            type: 'contraindication',
            severity: warning.severity,
            drug1: warning.drug1,
            drug2: warning.drug2,
            message: warning.mechanism
              ? `${warning.clinicalEffect} ${warning.mechanism}`
              : warning.clinicalEffect
          });
        }

        // 薬剤同士の相互作用ではなく、患者の疾患・妊娠・肝腎機能等に基づく絶対禁忌
        // （例: 抗コリン薬と閉塞隅角緑内障）。常にdanger（病態禁忌）として扱う
        const contraindicatedConditionResult = findContraindicatedConditionWarnings(
          Array.from(uniqueDrugs.values()).map((drug) => ({ drugId: drug.code, drugName: drug.name })),
          contraindicatedConditionPatientTexts,
          drugInfoMap
        );
        for (const warning of contraindicatedConditionResult.warnings) {
          newWarnings.push({
            type: 'usage',
            severity: 'danger',
            drug: warning.drug,
            message: warning.reason
              ? `${warning.conditionText}に該当（${warning.matchedPatientCondition}）: ${warning.reason}`
              : `${warning.conditionText}に該当（${warning.matchedPatientCondition}）`
          });
        }

        for (let i = 0; i < items.length; i++) {
           const item = items[i];
           const drug = drugsMap.get(item.drugId);
           if (!drug) continue;

           const docs = drugInfoMap.get(drug.name);

           if (docs && docs.length > 0) {
              const info = docs[0];

              // Check usage warnings dynamically based on the parsed condition
              if (info.usageWarnings) {
                 for (const warning of info.usageWarnings) {
                    const isWarningTriggered = evaluateUsageWarningCondition(warning.condition, {
                       amount: item.amount,
                       age: patientAgeVal,
                       diseases: contraindicatedConditionPatientTexts
                    });

                    if (isWarningTriggered) {
                       newWarnings.push({
                          type: 'usage',
                          severity: warning.severity || 'warning',
                          drug: drug.name,
                          message: warning.message
                       });
                    }
                 }
              }
           }
        }

        setWarnings(newWarnings);
      } catch (err) {
        console.error('Failed to fetch warnings', err);
      } finally {
        setIsWarningsLoading(false);
      }
    }
    fetchWarnings();
  }, [db, findActiveVisit]);



  const handleCompleteVisit = async (options?: { skipConfirmation?: boolean }) => {
    if (!db) return;

    setIsCompleting(true);
    try {
      const visit = await findActiveVisit();
      if (!visit) {
        toast.error('処理中の患者が見つかりません');
        return;
      }
      if (isClaimEditBlocked(visit.claimLifecycle)) {
        toast.error(getClaimEditBlockedMessage(visit.claimLifecycle, 'stock'));
        return;
      }

      if (visit.status !== 'processing') {
        toast.error('この受付は処理中ではありません');
        return;
      }

      // Fetch prescription items
      const items = await db.prescription_items.find({ selector: { visitId: visit.visitId } }).exec();

      const unverifiedPickingItems = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.isDiagnosticTest && !item.isPicked) {
          unverifiedPickingItems.push(item);
        }
      }

      if (unverifiedPickingItems.length > 0) {
        setIsPickingModalOpen(true);
        toast.error(`GS1未照合の薬剤が ${unverifiedPickingItems.length} 件あります。ピッキング支援で照合してください。`);
        return;
      }

      // ⚡ Bolt: Eliminate N+1 queries by fetching all prescribed and stock-target drugs in a single batch.
      const drugIdSet = new Set<string>();
      const stockDrugIdSet = new Set<string>();
      const stockDrugNameMap = new Map<string, string>();
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const stockDrugId = getStockDrugId(item);
        if (item.drugId) drugIdSet.add(item.drugId);
        if (stockDrugId) {
          drugIdSet.add(stockDrugId);
          stockDrugIdSet.add(stockDrugId);
          if (!stockDrugNameMap.has(stockDrugId)) {
            stockDrugNameMap.set(stockDrugId, item.dispensedDrug || item.drugId);
          }
        }
      }
      const drugIds = Array.from(drugIdSet);
      const stockDrugIds = Array.from(stockDrugIdSet);
      const drugsMap = await db.drugs.findByIds(drugIds).exec();

      // ⚡ Bolt: Eliminate N+1 queries for drug_stocks by batch fetching and grouping in memory.
      // Database-level sorting is omitted in the batch query and performed locally per group.
      const allStocks = await db.drug_stocks.find({
        selector: { drugCode: { $in: stockDrugIds } }
      }).exec();

      const stocksByDrugId = new Map<string, any[]>();
      for (const stock of allStocks) {
        if (!stocksByDrugId.has(stock.drugCode)) {
          stocksByDrugId.set(stock.drugCode, []);
        }
        stocksByDrugId.get(stock.drugCode)!.push(stock);
      }

      for (const stockArray of stocksByDrugId.values()) {
        stockArray.sort(compareStockLotsByExpiration);
      }

      // ⚡ Bolt: Aggregate required amounts by drugId to avoid sequential patch() calls inside loop
      // and prevent 409 Conflict errors for identical items in the same prescription.
      const aggregatedAmounts = aggregateStockRequirements(items);
      const availableStockByDrugId = new Map<string, number>();
      for (const [drugId, stockArray] of stocksByDrugId.entries()) {
        availableStockByDrugId.set(drugId, getTotalStock(stockArray));
      }

      const shortages = findStockShortages(aggregatedAmounts, availableStockByDrugId);
      const stockShortageText = shortages.length > 0
        ? shortages.slice(0, 3).map((shortage) => {
          const drug = drugsMap.get(shortage.drugId);
          const name = drug?.name || stockDrugNameMap.get(shortage.drugId) || shortage.drugId;
          return `${name} ${shortage.shortageAmount.toLocaleString()}不足`;
        }).join('、')
        : '';

      // Persist the latest SOAP before completing, and warn if it is empty
      // (服薬状況・指導内容の記録は服薬管理指導料の算定要件)。
      const soapResult = soapFlushRef.current
        ? await soapFlushRef.current()
        : { hasContent: false, missingStructuredFields: [] };

      // 未確認事項はネイティブconfirmの連発ではなく、1つの確認モーダルへまとめて提示する。
      if (!options?.skipConfirmation) {
        setCompletionConfirmation({
          soapEmpty: !soapResult.hasContent,
          missingStructuredFields: soapResult.missingStructuredFields,
          stockShortageText
        });
        return;
      }

      if (stockShortageText) {
        toast.warning(`在庫不足がありますが、マイナス在庫として完了します: ${stockShortageText}`);
      }

      const patchOperations: ReversiblePatch[] = [];
      const workingStockQuantities = new Map<string, number>();
      const stockById = new Map<string, any>();
      for (let i = 0; i < allStocks.length; i++) {
        const stock = allStocks[i];
        if (!stock.id) continue;
        stockById.set(stock.id, stock);
        workingStockQuantities.set(stock.id, safeStockQuantity(stock.quantity));
      }

      const fallbackRequirements = new Map<string, number>();
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const stockDrugId = getStockDrugId(item);
        const requiredAmount = calculateRequiredStockAmount(item);
        if (!stockDrugId || requiredAmount <= 0) continue;

        let remainingAmount = requiredAmount;
        const linkedStockId = typeof item.pickedStockId === 'string' ? item.pickedStockId : '';
        const linkedStock = linkedStockId ? stockById.get(linkedStockId) : null;
        if (linkedStock && linkedStock.drugCode === stockDrugId) {
          remainingAmount -= consumeFromStockLot(linkedStock, remainingAmount, workingStockQuantities);
        }

        if (remainingAmount > 0) {
          fallbackRequirements.set(stockDrugId, (fallbackRequirements.get(stockDrugId) || 0) + remainingAmount);
        }
      }

      for (const [drugId, totalRequiredAmount] of fallbackRequirements.entries()) {
        const stocks = stocksByDrugId.get(drugId) || [];
        let remainingToDeduct = totalRequiredAmount;
        for (let j = 0; j < stocks.length; j++) {
          if (remainingToDeduct <= 0) break;
          remainingToDeduct -= consumeFromStockLot(stocks[j], remainingToDeduct, workingStockQuantities);
        }
      }

      for (let i = 0; i < allStocks.length; i++) {
        const stock = allStocks[i];
        const nextQuantity = stock.id ? workingStockQuantities.get(stock.id) : undefined;
        if (typeof nextQuantity !== 'number' || nextQuantity === stock.quantity) continue;
        patchOperations.push({
          doc: stock,
          patch: { quantity: nextQuantity },
          rollbackPatch: { quantity: stock.quantity },
          label: `drug stock ${stock.id || stock.drugCode}`
        });
      }

      for (const [drugId, totalRequiredAmount] of aggregatedAmounts.entries()) {
        const drug = drugsMap.get(drugId);
        if (!drug) continue;
        patchOperations.push({
          doc: drug,
          patch: { stockQuantity: (drug.stockQuantity || 0) - totalRequiredAmount },
          rollbackPatch: { stockQuantity: drug.stockQuantity || 0 },
          label: `drug master ${drugId}`
        });
      }

      patchOperations.push({
        doc: visit,
        patch: { status: 'completed' },
        rollbackPatch: { status: visit.status },
        label: `visit ${visit.visitId}`
      });

      const appliedPatches: ReversiblePatch[] = [];
      try {
        for (const operation of patchOperations) {
          await operation.doc.patch(operation.patch);
          appliedPatches.push(operation);
        }
      } catch (patchError) {
        await rollbackAppliedPatches(appliedPatches);
        throw patchError;
      }

      // 監査ログ
      const patients = await db.patients.find({ selector: { patientId: visit.patientId } }).exec();
      const patientName = patients[0]?.name || '不明';
      const auditOk = await logAuditAction(
        db,
        'prescription_edit',
        `薬歴入力完了: 患者「${patientName}」の薬歴SOAP入力を完了し、ステータスを完了に変更しました。在庫引き落としを処理しました。`,
        visit.patientId,
        patientName
      );
      if (!auditOk) {
        await rollbackAppliedPatches(appliedPatches);
        throw new Error('薬歴完了の監査ログ記録に失敗したため、在庫と受付ステータスを元に戻しました。');
      }

      toast.success('薬歴を完了し、在庫を引き落としました。');
    } catch (err) {
      console.error(err);
      toast.error(`エラーが発生しました: ${err instanceof Error ? err.message : err}`);
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSave = async () => {
    const editable = await ensureActiveVisitEditable('soap');
    if (!editable.ok) {
      toast.error(editable.message);
      return;
    }
    setIsSaving(true);
    try {
      await soapFlushRef.current?.();
      toast.success('薬歴を保存しました。');
    } catch (error) {
      console.error('Failed to save SOAP immediately:', error);
      toast.error('薬歴の保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSoapVisitResolved = useCallback((visitId: string | null) => {
    setSoapVisitId(visitId);
  }, []);

  return (
      <div className="emr-page">
      <div className="page-header emr-header">
        <PatientBanner patientAlerts={patientAlerts} targetVisitId={targetVisitId} onOpenPicking={() => setIsPickingModalOpen(true)} />
      </div>


      <div className="emr-workspace">
        {/* SOAP Editor */}
        <section className="soap-section card">
          <div className="section-tabs" role="tablist" aria-label="EMRセクション">
            <button
              className={`tab-pill ${activeEmrSection === 'soap' ? 'active' : ''}`}
              role="tab"
              aria-selected={activeEmrSection === 'soap'}
              aria-controls="soap-panel"
              id="tab-soap"
              onClick={() => setActiveEmrSection('soap')}
            >
              <MessageSquare size={16} aria-hidden="true" /> SOAP 入力
            </button>
            <button
              className={`tab-pill ${activeEmrSection === 'history' ? 'active' : ''}`}
              role="tab"
              aria-selected={activeEmrSection === 'history'}
              aria-controls="history-panel"
              id="tab-history"
              onClick={() => setActiveEmrSection('history')}
            >
              <History size={16} aria-hidden="true" /> 経過
            </button>
            <button className="btn-do-copy ml-auto" onClick={() => setIsDrugHistoryOpen(true)} aria-label="薬剤履歴を開く" title="特定の薬を起点に、過去の処方・処方医・その時の薬歴を遡る">
              <History size={16} aria-hidden="true" /> 薬剤履歴
            </button>
            <WorkflowMiniTutorial
              kind="medication"
              userId={getCurrentUser().userId}
              autoOpen={!isPickingModalOpen}
            />
          </div>

          <div
            className="soap-grid"
            role="tabpanel"
            id="soap-panel"
            aria-labelledby="tab-soap"
            hidden={activeEmrSection !== 'soap'}
            style={{ display: activeEmrSection === 'soap' ? 'flex' : 'none', flexDirection: 'column', gap: '1rem' }}
          >
            <SoapEditor
              targetVisitId={targetVisitId}
              registerFlush={(fn) => { soapFlushRef.current = fn; }}
              onResolvedVisitChange={handleSoapVisitResolved}
            />
          </div>

          <SoapHistoryPanel
            entries={soapHistoryTimeline}
            isLoading={isPatientHistoryLoading}
            hidden={activeEmrSection !== 'history'}
          />

          <div className="emr-actions">
            <span
              className="btn-tooltip-wrapper"
              data-disabled={isCompleting || soapVisitId === null}
              title={isCompleting ? '完了処理中...' : soapVisitId === null ? '受付が選択されていません' : ''}
            >
              <button
                className="btn-complete btn-stacked"
                onClick={() => handleCompleteVisit()}
                disabled={isCompleting || soapVisitId === null}
                style={{ whiteSpace: 'nowrap' }}
              >
                <span className="btn-label-main flex-center gap-2">
                  {isCompleting ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
                  <span>{isCompleting ? '処理中...' : '薬歴完了 (在庫引落)'}</span>
                </span>
                <span className="btn-label-sub">記録を確定して受付を完了する</span>
              </button>
            </span>
            <span
              className="btn-tooltip-wrapper"
              data-disabled={isSaving || soapVisitId === null}
              title={isSaving ? '保存中...' : soapVisitId === null ? '受付が選択されていません' : ''}
            >
              <button
                className="btn-primary btn-stacked"
                onClick={handleSave}
                disabled={isSaving || soapVisitId === null}
              >
                <span className="btn-label-main flex-center gap-2">
                  {isSaving ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
                  <span>{isSaving ? '保存中...' : '保存'}</span>
                </span>
                <span className="btn-label-sub">完了せず記録だけ保存する</span>
              </button>
            </span>
          </div>
        </section>


        {/* Reference / Insights Column */}
        {/* ⚡ Bolt: Render the extracted Insight components directly.
            They are internally wrapped in React.memo and have static markup,
            so they will never re-render when the parent EmrPage updates. */}
        <section className="reference-section">
          <CareChecklistCard
            warningCount={warnings.length}
            isWarningsLoading={isWarningsLoading}
            unpickedCount={unpickedPickingCount}
            prescribedCount={prescribedDrugs.length}
            patientAlertCount={activePatientAlertCount}
          />
          <WarningInsightCard warnings={warnings} isLoading={isWarningsLoading} />
          <SoapHistoryQuickCard
            entries={soapHistoryTimeline}
            isLoading={isPatientHistoryLoading}
            onOpenFullHistory={() => setActiveEmrSection('history')}
          />
          {allSoapAiDraftSuggestions.length > soapAiDraftSuggestions.length && (
            <div
              className="insight-card"
              role="status"
              data-testid="soap-ai-mode-notice"
              style={{
                borderLeft: '4px solid #f59e0b',
                background: '#fffbeb',
                color: '#92400e'
              }}
            >
              <div className="insight-header">
                <AlertTriangle size={18} aria-hidden="true" />
                <h3>AI補助は「{AI_ASSIST_MODE_LABELS[aiAssistMode]}」です</h3>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.5 }}>
                {aiAssistMode === 'disabled'
                  ? 'SOAP下書き候補を停止しています。通常の薬歴入力は継続できます。'
                  : `要修正以外の下書き候補 ${allSoapAiDraftSuggestions.length - soapAiDraftSuggestions.length}件を非表示にしています。`}
              </p>
            </div>
          )}
          {soapAiDraftSuggestions.length > 0 && (
            <SoapAiDraftInsightCard
              suggestions={soapAiDraftSuggestions}
              onApplyDraft={handleApplySoapAiDraft}
              onFocusEvidence={handleFocusSoapEvidence}
            />
          )}
          <VitalInsightCard />
          <DocLinkInsightCard prescribedDrugs={prescribedDrugs} onSelectGuidance={handleSelectGuidance} />
        </section>

        {/* Prescription Timeline / History */}

        <aside className="history-aside" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card glass-premium" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>初回質問表</h3>
              {initialQuestionnaire && (
                <span className="status-chip compact confirmed">OCR取込済</span>
              )}
            </div>
            {!initialQuestionnaire ? (
              <span className="text-muted" style={{ fontSize: '0.82rem', color: 'var(--text-ghost)' }}>
                この受付には初回質問表が保存されていません。
              </span>
            ) : (
              <div className="questionnaire-summary-list">
                {initialQuestionnaire.imageDataUrl && (
                  <details className="questionnaire-image-details">
                    <summary>
                      保存画像を確認
                      {initialQuestionnaire.imageByteSize ? `（${Math.round(initialQuestionnaire.imageByteSize / 1024)}KB）` : ''}
                    </summary>
                    <img src={initialQuestionnaire.imageDataUrl} alt="保存済み初回質問表" />
                  </details>
                )}
                {[
                  ['アレルギー', initialQuestionnaire.allergies],
                  ['副作用歴', initialQuestionnaire.adverseDrugReactions],
                  ['既往歴・治療中', initialQuestionnaire.medicalHistory],
                  ['症状・相談', initialQuestionnaire.currentSymptoms],
                  ['妊娠・授乳', initialQuestionnaire.pregnancyLactation],
                  ['生活情報', initialQuestionnaire.lifestyle],
                  ['備考', initialQuestionnaire.notes]
                ].filter(([, value]) => !!value).slice(0, 5).map(([label, value]) => (
                  <div key={label} className="questionnaire-summary-item">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
                {initialQuestionnaire.rawText && (
                  <details className="questionnaire-raw-text">
                    <summary>OCR全文</summary>
                    <pre>{initialQuestionnaire.rawText}</pre>
                  </details>
                )}
              </div>
            )}
          </div>

          <div className="card glass-premium" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>マイナ取込</h3>
              {mynaClinicalImports.length > 0 && (
                <span className="status-chip compact confirmed">{mynaClinicalImports.length}件</span>
              )}
            </div>
            {mynaClinicalImports.length === 0 ? (
              <span className="text-muted" style={{ fontSize: '0.82rem', color: 'var(--text-ghost)' }}>
                特定健診情報・薬剤履歴はまだ取り込まれていません。
              </span>
            ) : (
              <div className="myna-clinical-list">
                {mynaClinicalImports.slice(0, 3).map((item) => (
                  <div key={item.importId} className="myna-clinical-item">
                    <div className="tracing-report-title-row">
                      <strong>{item.readerSource === 'mock' ? 'デモ取込' : '実機取込'}</strong>
                      <span>{new Date(item.importedAt).toLocaleString('ja-JP')}</span>
                    </div>
                    <p>
                      特定健診 {item.specificHealthCheckups?.length || 0}件 / 薬剤履歴 {item.medicationHistory?.length || 0}件
                    </p>
                    {item.specificHealthCheckups?.[0] && (
                      <span>
                        健診: {[
                          item.specificHealthCheckups[0].checkedAt,
                          item.specificHealthCheckups[0].egfr ? `eGFR ${item.specificHealthCheckups[0].egfr}` : '',
                          item.specificHealthCheckups[0].hba1c ? `HbA1c ${item.specificHealthCheckups[0].hba1c}` : ''
                        ].filter(Boolean).join(' / ')}
                      </span>
                    )}
                    {item.medicationHistory?.[0] && (
                      <span>直近薬剤: {item.medicationHistory[0].drugName}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card glass-premium" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>疑義照会</h3>
              <button
                className="btn-primary"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRadius: '6px' }}
                onClick={() => setIsInterventionModalOpen(true)}
              >
                新規記録
              </button>
            </div>
            <div className="intervention-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '180px', overflowY: 'auto' }}>
              {interventions.length === 0 ? (
                <span className="text-muted" style={{ fontSize: '0.82rem', color: 'var(--text-ghost)' }}>記録されている履歴はありません。</span>
              ) : (
                interventions.map((inv) => (
                  <div key={inv.interventionId} className="glass" style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.8rem', background: 'rgba(255,255,255,0.45)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                        {inv.inquiryDoctor || '未指定'}医師
                      </span>
                      <span className={`status-chip compact ${inv.inquiryStatus === 'pending' ? 'warning' : 'confirmed'}`}>
                        {inquiryStatusLabel[inv.inquiryStatus as keyof typeof inquiryStatusLabel] || '記録'}
                      </span>
                    </div>
                    <div style={{ marginBottom: '0.2rem', color: 'var(--text-main)' }}><strong>理由:</strong> {inv.reason}</div>
                    {inv.inquiryResult && (
                      <div style={{ marginBottom: '0.2rem', color: 'var(--text-main)' }}><strong>回答:</strong> {inv.inquiryResult}</div>
                    )}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-ghost)' }}>
                      {inv.beforeSnapshot || '変更前未入力'} &rarr; {inv.afterSnapshot || '変更後未入力'}
                      {inv.responseDueDate ? ` / 期限 ${inv.responseDueDate}` : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card glass-premium" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>トレーシングレポート</h3>
              <button
                className="btn-primary"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRadius: '6px' }}
                onClick={() => setIsTracingModalOpen(true)}
              >
                新規作成
              </button>
            </div>
            <div className="tracing-report-list">
              {tracingReports.length === 0 ? (
                <span className="text-muted" style={{ fontSize: '0.82rem', color: 'var(--text-ghost)' }}>記録されているレポートはありません。</span>
              ) : (
                tracingReports.map((report) => (
                  <div key={report.reportId} className="tracing-report-item">
                    <div className="tracing-report-title-row">
                      <strong>{report.subject}</strong>
                      <span className={`status-chip compact ${report.status === 'draft' ? 'warning' : 'confirmed'}`}>
                        {tracingStatusLabel[report.status]}
                      </span>
                    </div>
                    <span>{report.reportDate} / {report.destinationInstitution || '宛先未指定'} {report.destinationDoctor || ''}</span>
                    {(report.patientCondition || report.proposal) && (
                      <p>{report.patientCondition || report.proposal}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="aside-header">
            <Clock size={17} className="icon-history" aria-hidden="true" />
            <h3>処方遍歴 / Timeline</h3>
          </div>
          <div className="timeline-list">
            {isPatientHistoryLoading ? (
              <div className="timeline-empty">処方遍歴を確認しています</div>
            ) : patientPrescriptionTimeline.length === 0 ? (
              <div className="timeline-empty">この患者の処方遍歴はまだありません</div>
            ) : (
              patientPrescriptionTimeline.map((entry) => (
                <TimelineItem
                  key={entry.id}
                  date={entry.dateLabel}
                  drug={entry.drugLabel}
                  detail={entry.detail}
                  change={entry.change}
                  active={entry.active}
                />
              ))
            )}
          </div>
        </aside>
      </div>

      {/* 疑義照会登録モーダル */}
      <DrugHistoryModal
        targetVisitId={targetVisitId}
        open={isDrugHistoryOpen}
        onClose={() => setIsDrugHistoryOpen(false)}
      />

      {/* 薬歴完了の確認モーダル: 未確認事項をまとめて1回で提示する */}
      {completionConfirmation && (
        <div className="insurance-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="completion-confirm-title">
          <div className="insurance-modal animate-scale" style={{ width: '520px' }}>
            <div className="modal-header">
              <div className="modal-title-row">
                <CheckCircle2 size={20} />
                <h3 id="completion-confirm-title">薬歴を完了しますか？</h3>
              </div>
              <span className="modal-subtitle">薬歴を完了し、在庫を引き落とします。</span>
            </div>
            {(completionConfirmation.soapEmpty || completionConfirmation.missingStructuredFields.length > 0 || completionConfirmation.stockShortageText) ? (
              <ul className="completion-warning-list">
                {completionConfirmation.soapEmpty && (
                  <li>SOAP（薬歴）が空のまま完了しようとしています。記録なしで完了すると後から追記が必要になります。</li>
                )}
                {completionConfirmation.missingStructuredFields.length > 0 && (
                  <li>薬歴の構造化チェックに未確認項目があります: {completionConfirmation.missingStructuredFields.join('、')}</li>
                )}
                {completionConfirmation.stockShortageText && (
                  <li>在庫不足があります（マイナス在庫として記録されます）: {completionConfirmation.stockShortageText}</li>
                )}
              </ul>
            ) : (
              <p className="completion-ok-note">SOAP記録・構造化チェックともに確認済みです。</p>
            )}
            <div className="completion-modal-actions">
              <button className="btn-secondary" onClick={() => setCompletionConfirmation(null)}>
                戻って入力
              </button>
              <button
                className="btn-complete flex-center gap-2"
                onClick={() => {
                  setCompletionConfirmation(null);
                  void handleCompleteVisit({ skipConfirmation: true });
                }}
              >
                <CheckCircle2 size={16} aria-hidden="true" /> このまま完了
              </button>
            </div>
          </div>
        </div>
      )}

      {isInterventionModalOpen && (
        <div className="insurance-modal-overlay">
          <div className="insurance-modal animate-scale" style={{ width: '500px' }}>
            <div className="modal-header">
              <div className="modal-title-row">
                <MessageSquare size={20} />
                <h3>疑義照会・処方変更を記録</h3>
              </div>
              <span className="modal-subtitle">変更理由と医師の回答結果をレセプト(UKE)に自動連携します。</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group flex-1">
                  <label>照会状態</label>
                  <select
                    value={intStatus}
                    onChange={(e) => setIntStatus(e.target.value as 'pending' | 'completed')}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'white' }}
                  >
                    <option value="completed">回答済</option>
                    <option value="pending">照会中</option>
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label>照会方法</label>
                  <select
                    value={intMethod}
                    onChange={(e) => setIntMethod(e.target.value as 'phone' | 'fax' | 'in_person' | 'other')}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'white' }}
                  >
                    <option value="phone">電話</option>
                    <option value="fax">FAX</option>
                    <option value="in_person">対面</option>
                    <option value="other">その他</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>照会先医師名</label>
                <input
                  type="text"
                  placeholder="例: 山田"
                  value={intDoctor}
                  onChange={(e) => setIntDoctor(e.target.value)}
                  style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                />
              </div>
              <div className="form-group">
                <label>疑義照会・変更の理由</label>
                <textarea
                  placeholder="例: 重複投薬防止のため / 後発品への変更"
                  value={intReason}
                  onChange={(e) => setIntReason(e.target.value)}
                  style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', minHeight: '60px' }}
                />
              </div>
              <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group flex-1">
                  <label>変更前の薬品名</label>
                  <input
                    type="text"
                    placeholder="例: ロキソニン錠60mg"
                    value={intBefore}
                    onChange={(e) => setIntBefore(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                  />
                </div>
                <div className="form-group flex-1">
                  <label>変更後の薬品名</label>
                  <input
                    type="text"
                    placeholder="例: ロキソプロフェンNa塩錠60mg"
                    value={intAfter}
                    onChange={(e) => setIntAfter(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>{intStatus === 'pending' ? '照会内容・未回答メモ' : '照会・回答結果'}</label>
                <input
                  type="text"
                  placeholder={intStatus === 'pending' ? '例: 医師不在。折り返し待ち' : '例: 了承、削除、一般名処方へ変更'}
                  value={intResult}
                  onChange={(e) => setIntResult(e.target.value)}
                  style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                />
              </div>
              <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group flex-1">
                  <label>回答期限</label>
                  <input
                    type="date"
                    value={intResponseDueDate}
                    onChange={(e) => setIntResponseDueDate(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                  />
                </div>
                <div className="form-group flex-1">
                  <label>記録メモ</label>
                  <input
                    type="text"
                    placeholder="例: FAX送信済み"
                    value={intNote}
                    onChange={(e) => setIntNote(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                  />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                <input
                  type="checkbox"
                  checked={intConsented}
                  onChange={(e) => setIntConsented(e.target.checked)}
                />
                患者の同意を得ている
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn-secondary" onClick={() => setIsInterventionModalOpen(false)}>キャンセル</button>
              <button
                className="btn-primary"
                onClick={async () => {
                  if (!intReason.trim()) {
                    alert('理由を入力してください。');
                    return;
                  }
                  await handleAddIntervention({
                    reason: intReason,
                    beforeSnapshot: intBefore,
                    afterSnapshot: intAfter,
                    inquiryStatus: intStatus,
                    inquiryMethod: intMethod,
                    inquiryDoctor: intDoctor,
                    inquiryResult: intResult,
                    responseDueDate: intResponseDueDate,
                    note: intNote,
                    patientConsented: intConsented
                  });
                  setIsInterventionModalOpen(false);
                  resetInterventionForm();
                }}
              >
                登録
              </button>
            </div>
          </div>
        </div>
      )}

      {isTracingModalOpen && (
        <div className="insurance-modal-overlay">
          <div className="insurance-modal animate-scale" style={{ width: '720px' }}>
            <div className="modal-header">
              <div className="modal-title-row">
                <FileText size={20} />
                <h3>トレーシングレポートを作成</h3>
              </div>
              <span className="modal-subtitle">服薬状況、評価、処方医への提案、次回フォローを記録します。</span>
            </div>
            <div className="modal-body">
              <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ width: '150px' }}>
                  <label>作成日</label>
                  <input
                    type="date"
                    value={tracingReportDate}
                    onChange={(e) => setTracingReportDate(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                  />
                </div>
                <div className="form-group" style={{ width: '150px' }}>
                  <label>状態</label>
                  <select
                    value={tracingStatus}
                    onChange={(e) => setTracingStatus(e.target.value as TracingReportStatus)}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'white' }}
                  >
                    <option value="draft">下書き</option>
                    <option value="ready">送付準備</option>
                    <option value="sent">送付済</option>
                    <option value="closed">完了</option>
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label>件名</label>
                  <input
                    type="text"
                    maxLength={300}
                    placeholder="例: 服薬状況と残薬調整のご報告"
                    value={tracingSubject}
                    onChange={(e) => setTracingSubject(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>宛先医療機関</label>
                  <input
                    type="text"
                    maxLength={200}
                    placeholder="未入力時は受付の医療機関名を使用"
                    value={tracingDestinationInstitution}
                    onChange={(e) => setTracingDestinationInstitution(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                  />
                </div>
                <div className="form-group">
                  <label>診療科・医師</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input
                      type="text"
                      maxLength={100}
                      placeholder="診療科"
                      value={tracingDestinationDepartment}
                      onChange={(e) => setTracingDestinationDepartment(e.target.value)}
                      style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                    />
                    <input
                      type="text"
                      maxLength={100}
                      placeholder="医師名"
                      value={tracingDestinationDoctor}
                      onChange={(e) => setTracingDestinationDoctor(e.target.value)}
                      style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                    />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>薬剤・服薬状況</label>
                <textarea
                  value={tracingMedicationSummary}
                  onChange={(e) => setTracingMedicationSummary(e.target.value)}
                  placeholder="対象薬、服薬状況、残薬、飲み忘れなど"
                  style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', minHeight: '72px' }}
                />
              </div>
              <div className="form-group">
                <label>患者状態・相談内容</label>
                <textarea
                  value={tracingPatientCondition}
                  onChange={(e) => setTracingPatientCondition(e.target.value)}
                  placeholder="副作用疑い、症状変化、患者からの相談"
                  style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', minHeight: '72px' }}
                />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label>薬学的評価</label>
                  <textarea
                    value={tracingAssessment}
                    onChange={(e) => setTracingAssessment(e.target.value)}
                    placeholder="薬剤師としての評価"
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', minHeight: '82px' }}
                  />
                </div>
                <div className="form-group">
                  <label>提案・依頼事項</label>
                  <textarea
                    value={tracingProposal}
                    onChange={(e) => setTracingProposal(e.target.value)}
                    placeholder="処方提案、検査値確認依頼など"
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', minHeight: '82px' }}
                  />
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label>次回フォロー</label>
                  <textarea
                    value={tracingFollowUpPlan}
                    onChange={(e) => setTracingFollowUpPlan(e.target.value)}
                    placeholder="電話確認、次回来局時確認など"
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', minHeight: '72px' }}
                  />
                </div>
                <div className="form-group">
                  <label>医療機関からの回答</label>
                  <textarea
                    value={tracingResponseSummary}
                    onChange={(e) => setTracingResponseSummary(e.target.value)}
                    placeholder="返信・対応結果があれば入力"
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', minHeight: '72px' }}
                  />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn-secondary" onClick={() => setIsTracingModalOpen(false)}>キャンセル</button>
              <button className="btn-primary" onClick={handleAddTracingReport}>
                <Save size={16} />
                記録
              </button>
            </div>
          </div>
        </div>
      )}

      <PickingSupportModal
        isOpen={isPickingModalOpen}
        onClose={() => setIsPickingModalOpen(false)}
        items={pickingItems}
        userId={getCurrentUser().userId}
        onVerifyScan={handleVerifyPickingScan}
        onResetPick={handleResetPickingItem}
        onRecordShortage={handleRecordPickingShortage}
        onPrintReceipt={handlePrintPickingReceipt}
        onExportInstruction={handleExportPickingInstruction}
        onImportResultFile={handleImportPickingResultFile}
      />

      <style jsx>{`

        .insurance-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .insurance-modal {
          width: 520px;
          max-width: 90%;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(25px);
          border: 1px solid rgba(255, 255, 255, 0.45);
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .animate-scale {
          animation: scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .modal-header {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          border-bottom: 1px solid var(--border);
          padding-bottom: 1rem;
        }

        .modal-title-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--primary);
        }

        .modal-title-row h3 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
        }

        .modal-subtitle {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin: 0;
        }

        .modal-body {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-height: 60vh;
          overflow-y: auto;
          padding-right: 4px;
        }

        .questionnaire-summary-list,
        .tracing-report-list,
        .myna-clinical-list {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }

        .questionnaire-summary-item,
        .tracing-report-item,
        .myna-clinical-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding: 0.65rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.52);
          font-size: 0.8rem;
        }

        .questionnaire-summary-item span,
        .tracing-report-item span,
        .myna-clinical-item span {
          color: var(--text-ghost);
          font-size: 0.74rem;
        }

        .questionnaire-summary-item strong,
        .tracing-report-item strong,
        .myna-clinical-item strong {
          color: var(--text-main);
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .questionnaire-image-details {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
          padding: 0.6rem;
          font-size: 0.78rem;
          color: var(--text-muted);
        }

        .questionnaire-image-details img {
          display: block;
          width: 100%;
          height: auto;
          max-height: 260px;
          object-fit: contain;
          margin-top: 0.55rem;
          border-radius: 6px;
          background: #f8fafc;
        }

        .questionnaire-raw-text {
          font-size: 0.78rem;
          color: var(--text-muted);
        }

        .questionnaire-raw-text pre {
          margin-top: 0.5rem;
          padding: 0.6rem;
          max-height: 140px;
          overflow: auto;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
          color: var(--text-main);
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .tracing-report-title-row {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .tracing-report-title-row > :first-child {
          min-width: min(180px, 100%);
        }

        .tracing-report-item p {
          margin: 0;
          color: var(--text-muted);
          overflow-wrap: anywhere;
        }

        .myna-clinical-item p {
          margin: 0;
          color: var(--text-main);
          font-size: 0.8rem;
          font-weight: 800;
        }

        .modal-section-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text-muted);
          border-left: 3px solid var(--primary);
          padding-left: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .form-group.full-width {
          grid-column: span 2;
        }

        .form-group label {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-muted);
        }

        .form-group input, .form-group select {
          padding: 0.6rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.9);
          font-size: 0.9rem;
          outline: none;
          transition: all 0.2s;
        }

        .form-group input:focus, .form-group select:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          border-top: 1px solid var(--border);
          padding-top: 1rem;
          margin-top: 0.5rem;
        }

        .emr-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          /* ページ全体を自然に流し、内部スクロールとの二重スクロールを避ける。
             操作ボタンは .emr-actions の sticky で常時見える。 */
        }

        .patient-banner {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          padding: 1.25rem 2rem;
          border-radius: var(--radius-lg);
          border: 1px solid var(--border);
          flex-wrap: wrap;
        }

        .avatar.large {
          width: 64px;
          height: 64px;
          font-size: 1.5rem;
          background: linear-gradient(135deg, var(--primary), var(--accent));
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
        }

        .patient-summary {
          min-width: min(100%, 340px);
          flex: 1 1 340px;
        }
        .patient-summary h2 { margin-bottom: 0.2rem; }
        .patient-summary .row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .id-tag { color: var(--text-ghost); font-family: var(--font-outfit), var(--font-noto-sans-jp), sans-serif; font-size: 0.9rem; }

        .patient-alerts {
          margin-left: auto;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: min(100%, 280px);
        }

        .badge {
          padding: 4px 12px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .badge.red { background: #fee2e2; color: #dc2626; }
        .badge.orange { background: #fef3c7; color: #d97706; }
        .badge.blue { background: #dbeafe; color: #2563eb; }
        .badge-outline {
          border: 1px solid var(--border);
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .emr-workspace {
          display: grid;
          grid-template-columns: minmax(420px, 1.25fr) minmax(280px, 0.85fr) minmax(240px, 0.7fr);
          align-items: start;
          gap: 1.5rem;
        }

        .soap-section {
          display: flex;
          flex-direction: column;
          padding: 0;
          border-right: 1px solid var(--border);
          border-radius: var(--radius-lg);
          background: var(--bg-card);
        }

        .section-tabs {
          display: flex;
          padding: 0.75rem 1.5rem;
          border-bottom: 1px solid var(--border);
          background: #fdfdfd;
          align-items: center;
          border-radius: var(--radius-lg) var(--radius-lg) 0 0;
        }


        .tab-pill {
          padding: 0.5rem 1.25rem;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
        }

        .tab-pill:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: -2px;
          border-radius: 4px 4px 0 0;
        }

        .tab-pill.active {
          color: var(--primary);
          border-bottom: 2px solid var(--primary);
        }

        .btn-do-copy {
          background: var(--primary-light);
          color: var(--primary);
          border: 1px solid rgba(37, 99, 235, 0.2);
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          transition: all var(--transition-fast);
        }

        .btn-do-copy:hover { transform: scale(1.02); background: #dbeafe; }

        .soap-grid {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 1rem;
          gap: 1rem;
          background: #fdfdfd;
        }

        .emr-actions {
          position: sticky;
          bottom: 0;
          z-index: 20;
          padding: 1rem 2rem;
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          background: white;
          border-radius: 0 0 var(--radius-lg) var(--radius-lg);
          box-shadow: 0 -8px 20px rgb(15 23 42 / 0.06);
        }

        .emr-actions .btn-tooltip-wrapper {
          flex: none;
        }

        .emr-actions .btn-stacked {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.18rem;
        }

        .emr-actions .btn-label-main {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }

        .emr-actions .btn-label-sub {
          font-size: 0.66rem;
          font-weight: 700;
          opacity: 0.82;
          line-height: 1;
        }

        .completion-warning-list {
          margin: 1rem 0 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 0.5rem;
        }

        .completion-warning-list li {
          border: 1px solid #fde68a;
          background: #fffbeb;
          color: #92400e;
          border-radius: var(--radius-sm);
          padding: 0.6rem 0.75rem;
          font-size: 0.85rem;
          font-weight: 700;
          line-height: 1.55;
        }

        .completion-ok-note {
          margin: 1rem 0 0;
          border: 1px solid var(--green-200);
          background: var(--green-50);
          color: var(--green-700);
          border-radius: var(--radius-sm);
          padding: 0.6rem 0.75rem;
          font-size: 0.85rem;
          font-weight: 700;
        }

        .completion-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          margin-top: 1.25rem;
        }

        /* Reference Section */
        .reference-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .insight-card {
          background: var(--bg-card);
          border-radius: var(--radius-md);
          padding: 1.25rem;
          border: 1px solid var(--border);
          box-shadow: var(--shadow-sm);
        }

        .insight-card.warning { border-left: 4px solid #f59e0b; }
        .insight-card.info { border-left: 4px solid #3b82f6; }
        .insight-card.default { border-left: 4px solid var(--text-ghost); }

        .insight-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .insight-header h3 {
          font-size: 1rem;
          margin: 0;
        }

        .icon-warning { color: #f59e0b; }
        .icon-info { color: #3b82f6; }
        .icon-default { color: var(--text-ghost); }

        .insight-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          font-size: 0.9rem;
        }

        .insight-list li {
          padding-bottom: 0.5rem;
          border-bottom: 1px dashed var(--border);
        }
        .insight-list li:last-child { border-bottom: none; padding-bottom: 0; }

        .trend-graph-placeholder {
          background: var(--bg-base);
          padding: 1rem;
          border-radius: var(--radius-sm);
          text-align: center;
        }

        .trend-line {
          font-size: 1.25rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
        }

        .arrow-down { color: #10b981; }
        .arrow-flat { color: var(--text-ghost); }

        .trend-label {
          font-size: 0.8rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
        }

        .doc-links {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .doc-link {
          font-size: 0.9rem;
          color: var(--primary);
          text-decoration: none;
          padding: 0.5rem;
          background: var(--bg-base);
          border-radius: var(--radius-sm);
          transition: background var(--transition-fast);
        }
        .doc-link:hover { background: var(--primary-light); }

        .mt-2 { margin-top: 0.5rem; }

        .history-aside {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          overflow-y: auto;
          padding-right: 0.5rem;
        }

        .aside-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .aside-header .icon-history {
          color: var(--primary);
        }

        .aside-header h3 { font-size: 1.1rem; margin: 0; }

        .timeline-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .timeline-empty {
          border: 1px dashed var(--border);
          border-radius: 8px;
          background: #ffffff;
          color: var(--text-muted);
          font-size: 0.82rem;
          font-weight: 800;
          line-height: 1.5;
          padding: 0.85rem;
        }

        .ml-auto { margin-left: auto; }
        .gap-2 { gap: 0.5rem; }

        :global(.soap-evidence-focus) {
          outline: 3px solid rgba(124, 58, 237, 0.45);
          outline-offset: 4px;
          box-shadow: 0 0 0 6px rgba(124, 58, 237, 0.08);
          transition: outline-color 0.2s ease, box-shadow 0.2s ease;
        }

        @media (max-width: 1380px) {
          .emr-workspace {
            grid-template-columns: minmax(0, 1fr) 320px;
          }

          .history-aside {
            grid-column: 1 / -1;
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            align-items: start;
          }
        }

        @media (max-width: 980px) {
          .emr-page {
            height: auto;
          }

          .emr-workspace {
            grid-template-columns: 1fr;
            overflow: visible;
          }

          .reference-section,
          .history-aside {
            overflow: visible;
            padding-right: 0;
          }

          .history-aside {
            display: flex !important;
          }
        }
      `}</style>
    </div>
  );
}

// ⚡ Bolt: Wrap with React.memo to prevent unnecessary re-renders when the parent EMR workspace updates

// ⚡ Bolt: Wrap with React.memo to prevent unnecessary re-renders of SOAP text areas when the parent updates

// 前回までの薬歴を、SOAP入力中に参照できるよう右カラムへ常設する簡易カード。
// 全履歴は「経過」タブで確認する(閲覧のみ。前回DOコピーは行わない)。
const SoapHistoryQuickCard = React.memo(function SoapHistoryQuickCard({
  entries,
  isLoading,
  onOpenFullHistory
}: {
  entries: SoapHistoryTimelineEntry[];
  isLoading: boolean;
  onOpenFullHistory: () => void;
}) {
  const visibleEntries = entries.slice(0, 2);

  return (
    <div className="insight-card soap-history-quick">
      <div className="insight-header">
        <History size={18} className="icon-history" />
        <h3>前回までの薬歴</h3>
      </div>
      {isLoading ? (
        <p className="quick-empty">過去の薬歴を確認しています</p>
      ) : visibleEntries.length === 0 ? (
        <p className="quick-empty">この患者の過去薬歴はまだありません</p>
      ) : (
        <div className="quick-list">
          {visibleEntries.map((entry, entryIndex) => (
            <details key={entry.visitId} className="quick-entry" open={entryIndex === 0}>
              <summary>
                <span className="quick-date">{entry.dateLabel}</span>
                <span className="quick-visit">{entry.visitLabel}</span>
              </summary>
              <div className="quick-problems">
                {entry.problems.map((problem) => (
                  <div key={`${entry.visitId}-${problem.title}`} className="quick-problem">
                    <h4>{problem.title}</h4>
                    {problem.snippets.map((snippet, index) => (
                      <div key={`${snippet.type}-${index}`} className={`quick-snippet type-${snippet.type.toLowerCase()}`}>
                        <span>{snippet.type}</span>
                        <p>{snippet.text}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
      {entries.length > 0 && (
        <button type="button" className="quick-open-full" onClick={onOpenFullHistory}>
          経過タブで全て見る（{entries.length}回分）
        </button>
      )}
      <style jsx>{`
        .soap-history-quick {
          border-left: 4px solid var(--primary);
        }

        .icon-history {
          color: var(--primary);
        }

        .quick-empty {
          margin: 0;
          font-size: 0.82rem;
          color: var(--text-ghost);
          font-weight: 700;
        }

        .quick-list {
          display: grid;
          gap: 0.5rem;
        }

        .quick-entry {
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: #fdfdfd;
        }

        .quick-entry summary {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.6rem;
          padding: 0.5rem 0.65rem;
          cursor: pointer;
          list-style: none;
        }

        .quick-entry summary::-webkit-details-marker {
          display: none;
        }

        .quick-date {
          color: var(--text-ghost);
          font-size: 0.75rem;
          font-weight: 800;
          white-space: nowrap;
        }

        .quick-visit {
          color: var(--text-main);
          font-size: 0.8rem;
          font-weight: 750;
          text-align: right;
          overflow-wrap: anywhere;
        }

        .quick-problems {
          display: grid;
          gap: 0.5rem;
          padding: 0 0.65rem 0.65rem;
        }

        .quick-problem h4 {
          margin: 0 0 0.25rem;
          font-size: 0.8rem;
          color: var(--text-main);
        }

        .quick-snippet {
          display: flex;
          gap: 0.45rem;
          align-items: flex-start;
          margin-bottom: 0.2rem;
        }

        .quick-snippet span {
          flex-shrink: 0;
          width: 18px;
          font-size: 0.72rem;
          font-weight: 850;
          text-align: center;
        }

        .quick-snippet.type-s span { color: var(--status-blue); }
        .quick-snippet.type-o span { color: var(--status-green); }
        .quick-snippet.type-a span { color: var(--status-orange); }
        .quick-snippet.type-p span { color: var(--status-purple); }

        .quick-snippet p {
          margin: 0;
          font-size: 0.78rem;
          line-height: 1.55;
          color: var(--text-muted);
          overflow-wrap: anywhere;
        }

        .quick-open-full {
          margin-top: 0.65rem;
          width: 100%;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          color: var(--primary-dark);
          font-size: 0.8rem;
          font-weight: 800;
          padding: 0.45rem;
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .quick-open-full:hover {
          background: var(--primary-light);
          border-color: var(--primary);
        }
      `}</style>
    </div>
  );
});

const SoapHistoryPanel = React.memo(function SoapHistoryPanel({
  entries,
  isLoading,
  hidden = false
}: {
  entries: SoapHistoryTimelineEntry[];
  isLoading: boolean;
  hidden?: boolean;
}) {
  return (
    <div
      className="soap-history-panel"
      role="tabpanel"
      id="history-panel"
      aria-labelledby="tab-history"
      hidden={hidden}
    >
      {isLoading ? (
        <div className="soap-history-empty">過去の薬歴を確認しています</div>
      ) : entries.length === 0 ? (
        <div className="soap-history-empty">この患者の過去薬歴はまだありません</div>
      ) : (
        <div className="soap-history-list">
          {entries.map((entry) => (
            <article key={entry.visitId} className="soap-history-entry">
              <div className="soap-history-entry-header">
                <span>{entry.dateLabel}</span>
                <strong>{entry.visitLabel}</strong>
              </div>
              <div className="soap-history-problems">
                {entry.problems.map((problem) => (
                  <section key={`${entry.visitId}-${problem.title}`} className="soap-history-problem">
                    <h4>{problem.title}</h4>
                    <div className="soap-history-snippets">
                      {problem.snippets.map((snippet, index) => (
                        <div key={`${snippet.type}-${index}`} className={`soap-history-snippet type-${snippet.type.toLowerCase()}`}>
                          <span>{snippet.type}</span>
                          <p>{snippet.text}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      <style jsx>{`
        .soap-history-panel {
          display: grid;
          gap: 0.85rem;
          min-height: 320px;
        }

        .soap-history-panel[hidden] {
          display: none;
        }

        .soap-history-list {
          display: grid;
          gap: 0.85rem;
        }

        .soap-history-entry {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #ffffff;
          padding: 0.9rem;
          box-shadow: 0 8px 20px rgb(15 23 42 / 0.04);
        }

        .soap-history-entry-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.75rem;
          padding-bottom: 0.55rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .soap-history-entry-header span {
          color: var(--text-ghost);
          font-size: 0.78rem;
          font-weight: 800;
          white-space: nowrap;
        }

        .soap-history-entry-header strong {
          color: var(--text-main);
          font-size: 0.86rem;
          text-align: right;
          overflow-wrap: anywhere;
        }

        .soap-history-problems {
          display: grid;
          gap: 0.65rem;
          margin-top: 0.75rem;
        }

        .soap-history-problem {
          display: grid;
          gap: 0.45rem;
        }

        .soap-history-problem h4 {
          margin: 0;
          color: var(--text-main);
          font-size: 0.9rem;
        }

        .soap-history-snippets {
          display: grid;
          gap: 0.35rem;
        }

        .soap-history-snippet {
          display: grid;
          grid-template-columns: 28px minmax(0, 1fr);
          gap: 0.45rem;
          align-items: start;
          border-radius: 6px;
          background: #f8fafc;
          padding: 0.45rem 0.55rem;
        }

        .soap-history-snippet span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          color: #ffffff;
          background: var(--primary);
          font-size: 0.74rem;
          font-weight: 900;
        }

        .soap-history-snippet.type-s span { background: var(--status-blue); }
        .soap-history-snippet.type-o span { background: var(--status-green); }
        .soap-history-snippet.type-a span { background: var(--status-orange); }
        .soap-history-snippet.type-p span { background: var(--status-purple); }

        .soap-history-snippet p,
        .soap-history-empty {
          margin: 0;
          color: var(--text-muted);
          font-size: 0.82rem;
          line-height: 1.55;
          overflow-wrap: anywhere;
        }

        .soap-history-empty {
          border: 1px dashed var(--border);
          border-radius: 8px;
          background: #ffffff;
          padding: 1rem;
          font-weight: 800;
        }
      `}</style>
    </div>
  );
});

// ⚡ Bolt: Wrap PatientBanner with React.memo to prevent unnecessary re-renders when parent states change
const PatientBanner = React.memo(function PatientBanner({
  patientAlerts,
  targetVisitId,
  onOpenPicking
}: {
  patientAlerts: Alert[],
  targetVisitId: string | null,
  onOpenPicking: () => void
}) {
  const db = useDatabase();
  const [patientData, setPatientData] = useState<any>(null);

  useEffect(() => {
    async function fetchPatientData() {
      if (!db) return;
      try {
        const visit = targetVisitId
          ? await db.visits.findOne(targetVisitId).exec()
          : (await db.visits.find({ selector: { status: 'processing' } }).exec())
              .slice()
              .sort((a: any, b: any) => (b.issueDate || '').localeCompare(a.issueDate || ''))[0];
        if (visit) {
          const patients = await db.patients.find({ selector: { patientId: visit.patientId } }).exec();
          if (patients.length > 0) {
            setPatientData(patients[0].toJSON());
          } else {
            setPatientData(null);
          }
        } else {
          setPatientData(null);
        }
      } catch (e) {
        console.error(e);
      }
    }
    fetchPatientData();
  }, [db, targetVisitId]);

  const calcAge = useMemo(() => {
    if (!patientData || !patientData.birthDate) return null;
    const birth = new Date(patientData.birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
  }, [patientData]);

  const calcBirthDate = patientData?.birthDate ? patientData.birthDate.replace(/-/g, '/') + '生' : '生年月日未登録';
  const patientName = patientData?.name || '患者未選択';
  const patientGender = patientData?.gender === 'female' ? '女性' : patientData?.gender === 'male' ? '男性' : '';
  const patientTitle = patientData
    ? `${patientName} (${[calcAge !== null ? `${calcAge}歳` : '年齢不明', patientGender].filter(Boolean).join(' / ')})`
    : patientName;
  const patientInitials = patientName
    .split(/\s|　/)
    .filter(Boolean)
    .map((part: string) => part[0])
    .join('')
    .slice(0, 2) || 'PT';
  const activePatientAlerts = patientAlerts.filter(isActivePatientAlert).slice(0, 4);

  const [isReading, setIsReading] = useState(false);
  const [isReadingClinical, setIsReadingClinical] = useState(false);
  const [mynaReadDisplay, setMynaReadDisplay] = useState<MynaReadInsuranceDisplay | null>(null);
  const [mynaClinicalMessage, setMynaClinicalMessage] = useState('');
  const patientInsuranceInfo = formatPatientInsuranceInfo(patientData?.insuranceInfo);
  const displayedInsuranceInfo = mynaReadDisplay?.label || patientInsuranceInfo;
  const insuranceBadgeClass = mynaReadDisplay?.status === 'verified'
    ? 'green'
    : mynaReadDisplay?.status === 'warning'
      ? 'orange'
      : 'blue';

  // Premium Insurance Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasOpenedInsuranceFromQuery, setHasOpenedInsuranceFromQuery] = useState(false);
  const [editPatientName, setEditPatientName] = useState('');
  const [editPatientBirthDate, setEditPatientBirthDate] = useState('');
  const [editProvider, setEditProvider] = useState('');
  const [editNumber, setEditNumber] = useState('');
  const [editBurden, setEditBurden] = useState(30);
  const [editType, setEditType] = useState('社保');
  const [editRel, setEditRel] = useState('本人');
  const [editValidFrom, setEditValidFrom] = useState('');
  const [editValidTo, setEditValidTo] = useState('');
  const [editEligibilityCheckedAt, setEditEligibilityCheckedAt] = useState('');
  const [editEligibilityStatus, setEditEligibilityStatus] = useState<InsuranceEligibilityStatus>('unchecked');
  const [editPub1Provider, setEditPub1Provider] = useState('');
  const [editPub1Recipient, setEditPub1Recipient] = useState('');
  const [editPub1Burden, setEditPub1Burden] = useState(10);
  const [editPub1StartDate, setEditPub1StartDate] = useState('');
  const [editPub1EndDate, setEditPub1EndDate] = useState('');
  const [editPub1MonthlyLimitYen, setEditPub1MonthlyLimitYen] = useState('');
  const [questionnaireImageDataUrl, setQuestionnaireImageDataUrl] = useState('');
  const [questionnaireImageName, setQuestionnaireImageName] = useState('');
  const [questionnaireImageByteSize, setQuestionnaireImageByteSize] = useState(0);
  const [questionnaireCapturedAt, setQuestionnaireCapturedAt] = useState('');
  const [questionnaireRawText, setQuestionnaireRawText] = useState('');
  const [questionnaireAllergies, setQuestionnaireAllergies] = useState('');
  const [questionnaireAdverseDrugReactions, setQuestionnaireAdverseDrugReactions] = useState('');
  const [questionnaireMedicalHistory, setQuestionnaireMedicalHistory] = useState('');
  const [questionnaireCurrentSymptoms, setQuestionnaireCurrentSymptoms] = useState('');
  const [questionnairePregnancyLactation, setQuestionnairePregnancyLactation] = useState('');
  const [questionnaireLifestyle, setQuestionnaireLifestyle] = useState('');
  const [questionnaireNotes, setQuestionnaireNotes] = useState('');
  const [questionnaireSourceType, setQuestionnaireSourceType] = useState<'camera' | 'image' | 'manual'>('manual');
  const [questionnaireWarnings, setQuestionnaireWarnings] = useState<string[]>([]);
  const [isQuestionnaireProcessing, setIsQuestionnaireProcessing] = useState(false);

  const findBannerVisit = useCallback(async () => {
    if (!db) return null;
    if (targetVisitId) {
      return db.visits.findOne(targetVisitId).exec();
    }
    const visits = await db.visits.find({ selector: { status: 'processing' } }).exec();
    return visits[0] || null;
  }, [db, targetVisitId]);

  const loadVisitQuestionnaireIntoModal = useCallback(async () => {
    const visit = await findBannerVisit();
    const visitJson = visit?.toJSON() as Visit | undefined;
    const questionnaire = visitJson?.initialQuestionnaire;
    setQuestionnaireImageDataUrl(questionnaire?.imageDataUrl || '');
    setQuestionnaireImageName(questionnaire?.imageOriginalName || '');
    setQuestionnaireImageByteSize(questionnaire?.imageByteSize || 0);
    setQuestionnaireCapturedAt(questionnaire?.capturedAt || '');
    setQuestionnaireRawText(questionnaire?.rawText || '');
    setQuestionnaireAllergies(questionnaire?.allergies || '');
    setQuestionnaireAdverseDrugReactions(questionnaire?.adverseDrugReactions || '');
    setQuestionnaireMedicalHistory(questionnaire?.medicalHistory || '');
    setQuestionnaireCurrentSymptoms(questionnaire?.currentSymptoms || '');
    setQuestionnairePregnancyLactation(questionnaire?.pregnancyLactation || '');
    setQuestionnaireLifestyle(questionnaire?.lifestyle || '');
    setQuestionnaireNotes(questionnaire?.notes || '');
    setQuestionnaireSourceType(questionnaire?.sourceType || 'manual');
    setQuestionnaireWarnings([]);
    setMynaClinicalMessage('');
  }, [findBannerVisit]);

  const hasQuestionnaireInput = useMemo(() => (
    [
      questionnaireImageDataUrl,
      questionnaireRawText,
      questionnaireAllergies,
      questionnaireAdverseDrugReactions,
      questionnaireMedicalHistory,
      questionnaireCurrentSymptoms,
      questionnairePregnancyLactation,
      questionnaireLifestyle,
      questionnaireNotes
    ].some((value) => value.trim().length > 0)
  ), [
    questionnaireAdverseDrugReactions,
    questionnaireAllergies,
    questionnaireCurrentSymptoms,
    questionnaireImageDataUrl,
    questionnaireLifestyle,
    questionnaireMedicalHistory,
    questionnaireNotes,
    questionnairePregnancyLactation,
    questionnaireRawText
  ]);

  const applyQuestionnaireOcrText = useCallback((text: string) => {
    const draft = extractInitialQuestionnaireOcrDraft(text);
    setQuestionnaireRawText(draft.rawText);
    setQuestionnaireAllergies((current) => draft.allergies || current);
    setQuestionnaireAdverseDrugReactions((current) => draft.adverseDrugReactions || current);
    setQuestionnaireMedicalHistory((current) => draft.medicalHistory || current);
    setQuestionnaireCurrentSymptoms((current) => draft.currentSymptoms || current);
    setQuestionnairePregnancyLactation((current) => draft.pregnancyLactation || current);
    setQuestionnaireLifestyle((current) => draft.lifestyle || current);
    setQuestionnaireNotes((current) => draft.notes || current);
    setQuestionnaireWarnings(draft.warnings);
  }, []);

  const handleQuestionnaireFileSelection = useCallback(async (file: File, sourceType: 'camera' | 'image') => {
    setIsQuestionnaireProcessing(true);
    setQuestionnaireSourceType(sourceType);
    setQuestionnaireCapturedAt(new Date().toISOString());
    setQuestionnaireWarnings([]);

    try {
      const [compressed, { processPrescription }] = await Promise.all([
        compressQuestionnaireImage(file),
        import('@/lib/ocr/processor')
      ]);
      setQuestionnaireImageDataUrl(compressed.dataUrl);
      setQuestionnaireImageByteSize(compressed.byteSize);
      setQuestionnaireImageName(file.name || 'questionnaire.jpg');
      const text = await processPrescription(file);
      applyQuestionnaireOcrText(text);
      toast.success(`初回質問表をOCR入力しました（保存画像 ${Math.round(compressed.byteSize / 1024)}KB）。`);
    } catch (error) {
      console.error('Failed to process initial questionnaire image:', error);
      toast.error(error instanceof Error ? error.message : '初回質問表のOCRに失敗しました。');
    } finally {
      setIsQuestionnaireProcessing(false);
    }
  }, [applyQuestionnaireOcrText]);

  const handleQuestionnaireFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>, sourceType: 'camera' | 'image') => {
    const file = event.target.files?.[0];
    if (file) {
      handleQuestionnaireFileSelection(file, sourceType);
    }
    event.target.value = '';
  }, [handleQuestionnaireFileSelection]);

  const openModal = useCallback(() => {
    if (patientData) {
      setEditPatientName(patientData.name || '');
      setEditPatientBirthDate(toDateInputValue(patientData.birthDate));
      setEditProvider(patientData.insuranceInfo?.provider || '');
      setEditNumber(patientData.insuranceInfo?.number || '');
      setEditBurden(patientData.insuranceInfo?.burdenRatio ?? 30);
      setEditType(patientData.insuranceInfo?.insuranceType || '社保');
      setEditRel(patientData.insuranceInfo?.relationship || '本人');
      setEditValidFrom(toDateInputValue(patientData.insuranceInfo?.validFrom));
      setEditValidTo(toDateInputValue(patientData.insuranceInfo?.validTo));
      setEditEligibilityCheckedAt(toDateInputValue(patientData.insuranceInfo?.eligibilityCheckedAt));
      setEditEligibilityStatus(patientData.insuranceInfo?.eligibilityStatus || 'unchecked');

      const pub1 = patientData.publicInsurances?.[0];
      setEditPub1Provider(pub1?.provider || '');
      setEditPub1Recipient(pub1?.recipient || '');
      setEditPub1Burden(pub1?.burdenRatio ?? 10);
      setEditPub1StartDate(toDateInputValue(pub1?.startDate));
      setEditPub1EndDate(toDateInputValue(pub1?.endDate));
      setEditPub1MonthlyLimitYen(pub1?.monthlyLimitYen !== undefined ? String(pub1.monthlyLimitYen) : '');
    }
    loadVisitQuestionnaireIntoModal().catch((error) => {
      console.error('Failed to load initial questionnaire:', error);
    });
    setIsModalOpen(true);
  }, [loadVisitQuestionnaireIntoModal, patientData]);

  useEffect(() => {
    if (typeof window === 'undefined' || hasOpenedInsuranceFromQuery || !patientData) return;
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('openInsurance') !== '1') return;
    setHasOpenedInsuranceFromQuery(true);
    openModal();
  }, [hasOpenedInsuranceFromQuery, openModal, patientData]);

  useEffect(() => {
    setMynaReadDisplay(null);
  }, [patientData?.patientId]);

  const handleSaveInsurance = async () => {
    if (!db || !patientData) return;
    try {
      const patientDoc = await db.patients.findOne(patientData.patientId).exec();
      if (patientDoc) {
        const publicInsurances: PublicInsurance[] = [];
        if (editPub1Provider && editPub1Recipient) {
          publicInsurances.push({
            provider: editPub1Provider,
            recipient: editPub1Recipient,
            burdenRatio: Number(editPub1Burden),
            startDate: editPub1StartDate || undefined,
            endDate: editPub1EndDate || undefined,
            monthlyLimitYen: editPub1MonthlyLimitYen.trim() ? Number(editPub1MonthlyLimitYen) : undefined
          });
        }

        const nextInsuranceInfo = {
          provider: editProvider,
          number: editNumber,
          burdenRatio: Number(editBurden),
          insuranceType: editType,
          relationship: editRel,
          validFrom: editValidFrom || undefined,
          validTo: editValidTo || undefined,
          eligibilityCheckedAt: editEligibilityCheckedAt || undefined,
          eligibilityStatus: editEligibilityStatus
        };
        const now = new Date().toISOString();
        const questionnairePayload: VisitInitialQuestionnaire | undefined = hasQuestionnaireInput
          ? {
              sourceType: questionnaireSourceType,
              capturedAt: questionnaireCapturedAt || now,
              imageDataUrl: questionnaireImageDataUrl || undefined,
              imageOriginalName: questionnaireImageName || undefined,
              imageByteSize: questionnaireImageByteSize || undefined,
              imageCompressedAt: questionnaireImageDataUrl ? now : undefined,
              rawText: questionnaireRawText.trim() || undefined,
              allergies: questionnaireAllergies.trim() || undefined,
              adverseDrugReactions: questionnaireAdverseDrugReactions.trim() || undefined,
              medicalHistory: questionnaireMedicalHistory.trim() || undefined,
              currentSymptoms: questionnaireCurrentSymptoms.trim() || undefined,
              pregnancyLactation: questionnairePregnancyLactation.trim() || undefined,
              lifestyle: questionnaireLifestyle.trim() || undefined,
              notes: questionnaireNotes.trim() || undefined,
              reviewedAt: now,
              reviewedBy: getCurrentUser().name
            }
          : undefined;

        await patientDoc.patch({
          name: editPatientName.trim() || patientData.name,
          birthDate: editPatientBirthDate || patientData.birthDate,
          insuranceInfo: nextInsuranceInfo,
          publicInsurances
        });
        if (questionnairePayload) {
          const visit = await findBannerVisit();
          if (visit) {
            await visit.patch({ initialQuestionnaire: questionnairePayload });
            document.dispatchEvent(new CustomEvent('visit-care-communication-updated'));
          }
        }

        toast.success(questionnairePayload
          ? '患者・保険・公費情報と初回質問表を保存しました。'
          : '患者・保険・公費情報を保存しました。');
        setIsModalOpen(false);

        // Update local memory state to re-render PatientBanner
        setPatientData((prev: any) => ({
          ...prev,
          name: editPatientName.trim() || prev?.name,
          birthDate: editPatientBirthDate || prev?.birthDate,
          insuranceInfo: nextInsuranceInfo,
          publicInsurances
        }));
      }
    } catch (e) {
      console.error(e);
      toast.error('保存に失敗しました。');
    }
  };

  const handleMynaRead = useCallback(async () => {
    if (!patientData) {
      toast.warning('患者を選択してからマイナ読取を実行してください。');
      return;
    }

    setIsReading(true);

    try {
      const response = await fetch('/api/myna/read');
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || 'マイナ読取に失敗しました。');
      }

      const nextDisplay = buildMynaReadInsuranceDisplay({
        patientInsuranceInfo: patientData.insuranceInfo,
        readerResult: payload as MynaCardReaderResult
      });
      setMynaReadDisplay(nextDisplay);

      if (nextDisplay.status === 'warning') {
        toast.warning(nextDisplay.message);
      } else if (nextDisplay.status === 'demo') {
        toast.info(nextDisplay.message);
      } else {
        toast.success(nextDisplay.message);
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'マイナ読取に失敗しました。');
    } finally {
      setIsReading(false);
    }
  }, [patientData]);

  const handleMynaClinicalImport = useCallback(async () => {
    if (!db || !patientData) {
      toast.warning('患者を選択してからマイナ取込を実行してください。');
      return;
    }

    setIsReadingClinical(true);
    setMynaClinicalMessage('');

    try {
      const response = await fetch('/api/myna/read');
      const payload = await response.json().catch(() => null) as MynaCardReaderResult | null;
      if (!response.ok || !payload) {
        throw new Error((payload as any)?.message || 'マイナ取込に失敗しました。');
      }

      const healthCheckups = payload.specificHealthCheckups || [];
      const medicationHistory = payload.medicationHistory || [];
      if (healthCheckups.length === 0 && medicationHistory.length === 0) {
        setMynaClinicalMessage('特定健診情報・薬剤履歴は取得結果に含まれていませんでした。');
        toast.info('特定健診情報・薬剤履歴は取得結果に含まれていませんでした。');
        return;
      }

      const visit = await findBannerVisit();
      if (!visit) {
        throw new Error('保存先の来局レコードが見つかりません。');
      }

      const now = new Date().toISOString();
      const visitJson = visit.toJSON() as Visit;
      const currentCareCommunication = visitJson.careCommunication || {};
      const importRecord: VisitMynaClinicalImport = {
        importId: `myna_${Date.now()}`,
        importedAt: now,
        readerSource: payload.readerSource,
        readerCheckedAt: payload.readerCheckedAt,
        specificHealthCheckups: healthCheckups,
        medicationHistory,
        note: `特定健診 ${healthCheckups.length}件 / 薬剤履歴 ${medicationHistory.length}件`
      };

      await visit.patch({
        careCommunication: {
          ...currentCareCommunication,
          mynaClinicalImports: [importRecord, ...(currentCareCommunication.mynaClinicalImports || [])].slice(0, 20),
          updatedAt: now
        }
      });
      document.dispatchEvent(new CustomEvent('visit-care-communication-updated'));

      const message = `特定健診 ${healthCheckups.length}件 / 薬剤履歴 ${medicationHistory.length}件を取り込みました。`;
      setMynaClinicalMessage(message);
      toast.success(message);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'マイナ取込に失敗しました。');
    } finally {
      setIsReadingClinical(false);
    }
  }, [db, findBannerVisit, patientData]);

  return (
    <div id="emr-patient-alerts" className="patient-banner glass">
      <div className="avatar large">{patientInitials}</div>
      <div className="patient-summary">
        <div className="row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h2>{patientTitle}</h2>
          <span className="id-tag">ID: {patientData?.patientId || '-'}</span>
          <span className="badge-outline">処理中</span>
          <button
            className="btn-edit-insurance flex align-center gap-1" 
            onClick={openModal} 
            title="患者・保険・公費情報を編集"
            style={{ 
              background: 'rgba(37, 99, 235, 0.08)',
              color: 'var(--primary)',
              border: '1px solid rgba(37, 99, 235, 0.15)',
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginLeft: '4px'
            }}
          >
            <CreditCard size={12} />
            <span>患者・保険・公費編集</span>
          </button>
          <button 
            className="btn-picking flex align-center gap-1" 
            onClick={onOpenPicking} 
            title="ピッキング支援モードを開始" 
            style={{ 
              background: 'rgba(16, 185, 129, 0.08)',
              color: 'var(--success, #10b981)',
              border: '1px solid rgba(16, 185, 129, 0.15)',
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginLeft: '4px'
            }}
          >
            <Activity size={12} />
            <span>ピッキング支援</span>
          </button>
        </div>
        <p className="text-muted">{calcBirthDate}</p>

      </div>
      <div className="patient-alerts">
        <div className="flex gap-2 patient-alert-badges">
          {activePatientAlerts.length > 0 ? (
            activePatientAlerts.map((alert) => (
              <span
                key={alert.alertId}
                className={`badge ${alert.type === 'allergy' ? 'red' : alert.type === 'side_effect' ? 'orange' : 'blue'}`}
              >
                {formatPatientAlertLabel(alert)}
              </span>
            ))
          ) : (
            <span className="badge blue">患者アラートなし</span>
          )}
        </div>
        <div className="flex align-center gap-2" style={{ justifyContent: 'flex-end', marginTop: '4px' }}>
          <span className={`badge ${insuranceBadgeClass}`}>
            {mynaReadDisplay?.status === 'verified' && <CheckCircle2 size={12} className="inline-icon" aria-hidden="true" />}
            保険: {displayedInsuranceInfo}
          </span>
          <span
            className="btn-tooltip-wrapper"
            data-disabled={isReading || !patientData}
            title={isReading ? '読み取り中...' : !patientData ? '患者を選択してください' : ''}
          >
            <button
              className="btn-myna"
              onClick={handleMynaRead}
              disabled={isReading || !patientData}
              aria-label="マイナンバーカードを読み取る"
            >
              {isReading ? (
                <><Loader2 size={14} className="spin" aria-hidden="true" /> 読取中...</>
              ) : (
                <><CreditCard size={14} aria-hidden="true" /> マイナ読取</>
              )}
            </button>
          </span>
        </div>
      </div>

      {/* Premium Insurance/Public Support Editor Modal */}
      {isModalOpen && (
        <div className="insurance-modal-overlay">
          <div className="insurance-modal card glass animate-scale">
            <div className="modal-header">
              <div className="modal-title-row">
                <CreditCard className="icon-primary" size={20} />
                <h3>患者・保険・公費情報の構造化登録</h3>
              </div>
              <p className="modal-subtitle">{patientName} 様の請求保険者・公費負担情報を設定します。</p>
            </div>
            
            <div className="modal-body">
              <div className="modal-section-title">患者基本情報</div>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="m-patient-name">患者名</label>
                  <input
                    id="m-patient-name"
                    type="text"
                    maxLength={100}
                    value={editPatientName}
                    onChange={(e) => setEditPatientName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="m-patient-birth-date">生年月日</label>
                  <input
                    id="m-patient-birth-date"
                    type="date"
                    value={editPatientBirthDate}
                    onChange={(e) => setEditPatientBirthDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-section-title mt-4">初回質問表 OCR</div>
              <div className="questionnaire-intake-panel" data-testid="emr-initial-questionnaire-ocr-panel">
                <div className="questionnaire-actions">
                  <label className="btn-secondary flex align-center gap-2 questionnaire-upload-button">
                    {isQuestionnaireProcessing ? <Loader2 size={16} className="spin" /> : <Camera size={16} />}
                    <span>{isQuestionnaireProcessing ? '読取中...' : 'カメラで撮影'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden-input"
                      disabled={isQuestionnaireProcessing}
                      onChange={(event) => handleQuestionnaireFileUpload(event, 'camera')}
                      data-testid="emr-initial-questionnaire-camera-input"
                    />
                  </label>
                  <label className="btn-secondary flex align-center gap-2 questionnaire-upload-button">
                    <Upload size={16} />
                    <span>画像を選択</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden-input"
                      disabled={isQuestionnaireProcessing}
                      onChange={(event) => handleQuestionnaireFileUpload(event, 'image')}
                      data-testid="emr-initial-questionnaire-image-input"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-secondary flex align-center gap-2"
                    onClick={() => {
                      setQuestionnaireSourceType('manual');
                      setQuestionnaireCapturedAt((current) => current || new Date().toISOString());
                      applyQuestionnaireOcrText(questionnaireRawText);
                    }}
                    disabled={!questionnaireRawText.trim() || isQuestionnaireProcessing}
                  >
                    <ClipboardList size={16} />
                    全文から再抽出
                  </button>
                  {questionnaireImageByteSize > 0 && (
                    <span className="questionnaire-size-chip">
                      保存画像 {Math.round(questionnaireImageByteSize / 1024)}KB
                    </span>
                  )}
                </div>
                {questionnaireImageDataUrl && (
                  <div className="questionnaire-preview">
                    <img src={questionnaireImageDataUrl} alt="初回質問表の軽量保存画像" />
                  </div>
                )}
                {questionnaireWarnings.length > 0 && (
                  <ul className="questionnaire-warning-list">
                    {questionnaireWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
                <div className="questionnaire-field-grid">
                  <div className="form-group">
                    <label htmlFor="m-questionnaire-allergies">アレルギー</label>
                    <textarea
                      id="m-questionnaire-allergies"
                      value={questionnaireAllergies}
                      onChange={(e) => setQuestionnaireAllergies(e.target.value)}
                      placeholder="薬・食物・花粉など"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="m-questionnaire-adverse">副作用歴</label>
                    <textarea
                      id="m-questionnaire-adverse"
                      value={questionnaireAdverseDrugReactions}
                      onChange={(e) => setQuestionnaireAdverseDrugReactions(e.target.value)}
                      placeholder="過去に合わなかった薬、症状"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="m-questionnaire-history">既往歴・治療中</label>
                    <textarea
                      id="m-questionnaire-history"
                      value={questionnaireMedicalHistory}
                      onChange={(e) => setQuestionnaireMedicalHistory(e.target.value)}
                      placeholder="持病、治療中の疾患"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="m-questionnaire-symptoms">症状・相談内容</label>
                    <textarea
                      id="m-questionnaire-symptoms"
                      value={questionnaireCurrentSymptoms}
                      onChange={(e) => setQuestionnaireCurrentSymptoms(e.target.value)}
                      placeholder="今回困っていること"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="m-questionnaire-pregnancy">妊娠・授乳</label>
                    <input
                      id="m-questionnaire-pregnancy"
                      type="text"
                      value={questionnairePregnancyLactation}
                      onChange={(e) => setQuestionnairePregnancyLactation(e.target.value)}
                      placeholder="該当なし / 妊娠中 / 授乳中"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="m-questionnaire-lifestyle">生活情報</label>
                    <input
                      id="m-questionnaire-lifestyle"
                      type="text"
                      value={questionnaireLifestyle}
                      onChange={(e) => setQuestionnaireLifestyle(e.target.value)}
                      placeholder="飲酒、喫煙、運転など"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="m-questionnaire-notes">備考</label>
                  <textarea
                    id="m-questionnaire-notes"
                    value={questionnaireNotes}
                    onChange={(e) => setQuestionnaireNotes(e.target.value)}
                    placeholder="薬剤師確認メモ"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="m-questionnaire-raw">OCR全文</label>
                  <textarea
                    id="m-questionnaire-raw"
                    className="questionnaire-raw-textarea"
                    value={isQuestionnaireProcessing ? '解析中...' : questionnaireRawText}
                    readOnly={isQuestionnaireProcessing}
                    onChange={(e) => {
                      setQuestionnaireRawText(e.target.value);
                      setQuestionnaireSourceType('manual');
                      setQuestionnaireCapturedAt((current) => current || new Date().toISOString());
                    }}
                    placeholder="撮影後にOCR全文が入ります。手入力・貼り付けもできます。"
                  />
                </div>
              </div>

              <div className="modal-section-title mt-4">マイナ臨床情報</div>
              <div className="myna-clinical-import-panel" data-testid="myna-clinical-import-panel">
                <button
                  type="button"
                  className="btn-secondary flex align-center gap-2"
                  onClick={handleMynaClinicalImport}
                  disabled={isReadingClinical || !patientData}
                  data-testid="myna-clinical-import-button"
                >
                  {isReadingClinical ? <Loader2 size={16} className="spin" /> : <History size={16} />}
                  {isReadingClinical ? '取込中...' : '特定健診・薬剤履歴を取込'}
                </button>
                {mynaClinicalMessage && (
                  <span className="myna-clinical-message">{mynaClinicalMessage}</span>
                )}
              </div>

              <div className="modal-section-title mt-4">保険情報 (HOレコード用)</div>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="m-ins-type">保険種別</label>
                  <select id="m-ins-type" value={editType} onChange={(e) => setEditType(e.target.value)}>
                    <option value="社保">社保 (健康保険)</option>
                    <option value="国保">国保 (国民健康保険)</option>
                    <option value="後期高齢">後期高齢</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="m-ins-rel">本人・家族区分</label>
                  <select id="m-ins-rel" value={editRel} onChange={(e) => setEditRel(e.target.value)}>
                    <option value="本人">本人</option>
                    <option value="家族">家族</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="m-ins-provider">保険者番号 (8桁/6桁)</label>
                  <input 
                    id="m-ins-provider"
                    type="text" 
                    maxLength={8}
                    placeholder="例: 06139999" 
                    value={editProvider} 
                    onChange={(e) => setEditProvider(e.target.value)} 
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="m-ins-number">記号番号</label>
                  <input 
                    id="m-ins-number"
                    type="text" 
                    placeholder="例: 記号123 番号456" 
                    value={editNumber} 
                    onChange={(e) => setEditNumber(e.target.value)} 
                  />
                </div>
                <div className="form-group full-width">
                  <label htmlFor="m-ins-burden">自己負担割合 (%)</label>
                  <select id="m-ins-burden" value={editBurden} onChange={(e) => setEditBurden(Number(e.target.value))}>
                    <option value={30}>30 % (3割)</option>
                    <option value={20}>20 % (2割)</option>
                    <option value={10}>10 % (1割)</option>
                    <option value={0}>0 % (無償/公費全額)</option>
                  </select>
                </div>
              </div>

              <div className="modal-section-title mt-4">資格確認・有効期間</div>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="m-ins-eligibility-status">資格確認状態</label>
                  <select
                    id="m-ins-eligibility-status"
                    value={editEligibilityStatus}
                    onChange={(e) => setEditEligibilityStatus(e.target.value as InsuranceEligibilityStatus)}
                  >
                    <option value="unchecked">未確認</option>
                    <option value="valid">有効</option>
                    <option value="warning">要確認</option>
                    <option value="invalid">無効</option>
                    <option value="unavailable">確認不可</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="m-ins-eligibility-checked-at">資格確認日</label>
                  <input
                    id="m-ins-eligibility-checked-at"
                    type="date"
                    value={editEligibilityCheckedAt}
                    onChange={(e) => setEditEligibilityCheckedAt(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="m-ins-valid-from">保険有効開始日</label>
                  <input
                    id="m-ins-valid-from"
                    type="date"
                    value={editValidFrom}
                    onChange={(e) => setEditValidFrom(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="m-ins-valid-to">保険有効期限</label>
                  <input
                    id="m-ins-valid-to"
                    type="date"
                    value={editValidTo}
                    onChange={(e) => setEditValidTo(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-section-title mt-4">公費情報 (KOレコード用)</div>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="m-pub-provider">公費負担者番号 (8桁)</label>
                  <input 
                    id="m-pub-provider"
                    type="text" 
                    maxLength={8}
                    placeholder="例: 51136018 (難病)" 
                    value={editPub1Provider} 
                    onChange={(e) => setEditPub1Provider(e.target.value)} 
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="m-pub-recipient">公費受給者番号 (7桁)</label>
                  <input 
                    id="m-pub-recipient"
                    type="text" 
                    maxLength={7}
                    placeholder="例: 1234567" 
                    value={editPub1Recipient} 
                    onChange={(e) => setEditPub1Recipient(e.target.value)} 
                  />
                </div>
                <div className="form-group full-width">
                  <label htmlFor="m-pub-burden">公費自己負担割合 (%)</label>
                  <select id="m-pub-burden" value={editPub1Burden} onChange={(e) => setEditPub1Burden(Number(e.target.value))}>
                    <option value={10}>10 % (1割負担)</option>
                    <option value={0}>0 % (自己負担なし)</option>
                    <option value={20}>20 % (2割負担)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="m-pub-start-date">公費開始日</label>
                  <input
                    id="m-pub-start-date"
                    type="date"
                    value={editPub1StartDate}
                    onChange={(e) => setEditPub1StartDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="m-pub-end-date">公費有効期限</label>
                  <input
                    id="m-pub-end-date"
                    type="date"
                    value={editPub1EndDate}
                    onChange={(e) => setEditPub1EndDate(e.target.value)}
                  />
                </div>
                <div className="form-group full-width">
                  <label htmlFor="m-pub-monthly-limit">月額負担上限 (円)</label>
                  <input
                    id="m-pub-monthly-limit"
                    type="number"
                    min={0}
                    placeholder="例: 5000"
                    value={editPub1MonthlyLimitYen}
                    onChange={(e) => setEditPub1MonthlyLimitYen(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setIsModalOpen(false)}>キャンセル</button>
              <button className="btn-primary" onClick={handleSaveInsurance} disabled={isQuestionnaireProcessing}>
                {isQuestionnaireProcessing ? 'OCR中...' : '保存して適用'}
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        .flex { display: flex; }
        .align-center { align-items: center; }
        .gap-2 { gap: 0.5rem; }
        .badge.green { background: #d1fae5; color: #059669; display: flex; align-items: center; gap: 4px; }
        .inline-icon { display: inline-block; }
        .patient-alert-badges {
          justify-content: flex-end;
          flex-wrap: wrap;
          max-width: 420px;
        }

        .btn-myna {
          background: #fdf2f8;
          color: #db2777;
          border: 1px solid #fbcfe8;
          padding: 2px 8px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          transition: all var(--transition-fast);
        }
        .btn-myna:hover:not(:disabled) {
          background: #fce7f3;
        }
        .btn-myna:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .hidden-input {
          position: absolute;
          width: 1px;
          height: 1px;
          opacity: 0;
          pointer-events: none;
        }

        .questionnaire-intake-panel,
        .myna-clinical-import-panel {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #f8fafc;
          padding: 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .questionnaire-actions,
        .myna-clinical-import-panel {
          display: flex;
          flex-direction: row;
          flex-wrap: wrap;
          align-items: center;
        }

        .questionnaire-upload-button {
          position: relative;
          cursor: pointer;
          min-height: 38px;
          padding: 0.45rem 0.65rem;
        }

        .questionnaire-size-chip,
        .myna-clinical-message {
          border-radius: 999px;
          background: #ecfeff;
          color: #0f766e;
          padding: 0.2rem 0.55rem;
          font-size: 0.75rem;
          font-weight: 800;
        }

        .questionnaire-preview {
          width: min(100%, 360px);
          max-height: 240px;
          overflow: auto;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: white;
        }

        .questionnaire-preview img {
          display: block;
          width: 100%;
          height: auto;
        }

        .questionnaire-field-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.75rem;
        }

        .questionnaire-intake-panel textarea {
          min-height: 76px;
          resize: vertical;
        }

        .questionnaire-raw-textarea {
          min-height: 112px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.78rem;
          line-height: 1.5;
        }

        .questionnaire-warning-list {
          display: grid;
          gap: 0.35rem;
          margin: 0;
          padding-left: 1.1rem;
          color: #92400e;
          font-size: 0.78rem;
          font-weight: 700;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
});


type SoapEntryType = 'S' | 'O' | 'A' | 'P';
interface SoapEntry {
  id: string;
  type: SoapEntryType;
  text: string;
}

interface SoapProblem {
  id: string;
  title: string;
  entries: SoapEntry[];
}

type SoapSaveStatus = 'loading' | 'saved' | 'dirty' | 'saving' | 'error';

const soapStructuredAssessmentControls = [
  {
    field: 'adherence' as const,
    label: '服薬状況',
    options: [
      ['unknown', '未確認'],
      ['good', '良好'],
      ['partial', '一部不良'],
      ['poor', '不良']
    ]
  },
  {
    field: 'leftoverMedicine' as const,
    label: '残薬',
    options: [
      ['unknown', '未確認'],
      ['none', 'なし'],
      ['has', 'あり']
    ]
  },
  {
    field: 'adverseEvent' as const,
    label: '副作用・有害事象',
    options: [
      ['unknown', '未確認'],
      ['none', 'なし'],
      ['has', 'あり']
    ]
  },
  {
    field: 'genericChangePreference' as const,
    label: '後発品変更意向',
    options: [
      ['unknown', '未確認'],
      ['accepted', '希望・可'],
      ['declined', '希望なし'],
      ['consult', '要相談']
    ]
  },
  {
    field: 'medicationNotebook' as const,
    label: 'お薬手帳',
    options: [
      ['unknown', '未確認'],
      ['issued', '交付・確認済'],
      ['not_issued', '未交付']
    ]
  }
];

const SoapStructuredAssessmentPanel = React.memo(function SoapStructuredAssessmentPanel({
  assessment,
  onChange
}: {
  assessment: SoapStructuredAssessment;
  onChange: <K extends keyof SoapStructuredAssessment>(field: K, value: NonNullable<SoapStructuredAssessment[K]>) => void;
}) {
  const normalized = normalizeSoapStructuredAssessment(assessment);
  const missingCount = soapStructuredAssessmentControls.filter(
    (control) => (normalized[control.field] || 'unknown') === 'unknown'
  ).length;

  return (
    <section className="soap-structured-panel" aria-label="薬歴構造化チェック">
      <div className="soap-structured-header">
        <span className="soap-structured-title">
          <ClipboardList size={17} aria-hidden="true" />
          <h3>薬歴構造化チェック</h3>
        </span>
        <span className={`structured-progress ${missingCount === 0 ? 'done' : ''}`}>
          {missingCount === 0 ? '全項目確認済み' : `未確認 ${missingCount}項目`}
        </span>
      </div>
      <div className="soap-structured-grid">
        {soapStructuredAssessmentControls.map((control) => {
          const currentValue = normalized[control.field] || 'unknown';
          const optionValues = control.options.map(([value]) => value);
          // ラジオグループ標準の矢印キー移動: 選択を移して移動先へフォーカスする。
          const handleChipKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
            const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
            const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
            if (!forward && !backward) return;
            event.preventDefault();
            const currentIndex = Math.max(optionValues.indexOf(currentValue), 0);
            const nextIndex = (currentIndex + (forward ? 1 : -1) + optionValues.length) % optionValues.length;
            onChange(control.field, optionValues[nextIndex] as any);
            const chipRow = event.currentTarget.closest('.chip-row');
            window.setTimeout(() => {
              (chipRow?.querySelector('[aria-checked="true"]') as HTMLButtonElement | null)?.focus();
            }, 0);
          };
          return (
            <div
              key={control.field}
              className={`soap-structured-field ${currentValue === 'unknown' ? 'unconfirmed' : 'confirmed'}`}
              role="radiogroup"
              aria-label={control.label}
            >
              <span className="field-label">{control.label}</span>
              <div className="chip-row">
                {control.options.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={currentValue === value}
                    tabIndex={currentValue === value ? 0 : -1}
                    className={`assessment-chip ${currentValue === value ? 'selected' : ''} ${value === 'unknown' ? 'is-unknown' : ''}`}
                    onClick={() => onChange(control.field, value as any)}
                    onKeyDown={handleChipKeyDown}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .soap-structured-panel {
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--bg-card);
          padding: 0.9rem;
          display: grid;
          gap: 0.7rem;
        }

        .soap-structured-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .soap-structured-title {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          color: var(--primary-dark);
          min-width: 0;
        }

        .soap-structured-header h3 {
          margin: 0;
          color: var(--text-main);
          font-size: 0.92rem;
          font-weight: 850;
        }

        .structured-progress {
          border-radius: 999px;
          background: var(--warning-soft);
          color: var(--warning);
          padding: 0.16rem 0.6rem;
          font-size: 0.72rem;
          font-weight: 850;
          white-space: nowrap;
        }

        .structured-progress.done {
          background: var(--success-soft);
          color: var(--success);
        }

        .soap-structured-grid {
          display: grid;
          gap: 0.45rem;
        }

        .soap-structured-field {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          min-width: 0;
          padding: 0.3rem 0.45rem;
          border-radius: var(--radius-sm);
          transition: background var(--transition-fast);
        }

        .soap-structured-field.unconfirmed {
          background: #fffdf4;
        }

        .field-label {
          flex: 0 0 128px;
          color: var(--text-muted);
          font-size: 0.78rem;
          font-weight: 800;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .soap-structured-field.confirmed .field-label {
          color: var(--primary-dark);
        }

        .chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem;
        }

        .assessment-chip {
          border: 1px solid var(--border);
          border-radius: 999px;
          background: var(--bg-card);
          color: var(--text-muted);
          padding: 0.22rem 0.66rem;
          font-size: 0.76rem;
          font-weight: 760;
          cursor: pointer;
          transition: all var(--transition-fast);
          white-space: nowrap;
        }

        .assessment-chip:hover {
          border-color: var(--primary);
          color: var(--primary-dark);
          background: var(--primary-light);
        }

        .assessment-chip.selected {
          border-color: var(--primary);
          background: var(--primary);
          color: #ffffff;
          font-weight: 850;
        }

        .assessment-chip.selected.is-unknown {
          border-color: var(--warning);
          background: var(--warning-soft);
          color: var(--warning);
        }

        @media (max-width: 980px) {
          .soap-structured-field {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.3rem;
          }

          .field-label {
            flex: none;
          }
        }
      `}</style>
    </section>
  );
});

const SoapSaveStatusIndicator = React.memo(function SoapSaveStatusIndicator({
  status,
  lastSavedAt
}: {
  status: SoapSaveStatus;
  lastSavedAt?: string;
}) {
  const label = status === 'loading'
    ? '読込中'
    : status === 'saving'
      ? '保存中'
      : status === 'dirty'
        ? '未保存の変更あり'
        : status === 'error'
          ? '保存失敗'
          : '自動保存済み';
  const detail = status === 'saved' && lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className={`soap-save-status status-${status}`} role="status" aria-live="polite">
      <span className="save-dot" aria-hidden="true" />
      <strong>{label}</strong>
      {detail && <small>{detail}</small>}
      <style jsx>{`
        .soap-save-status {
          min-height: 32px;
          display: inline-flex;
          align-items: center;
          gap: 0.38rem;
          align-self: flex-end;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: #ffffff;
          color: var(--text-muted);
          padding: 0 0.7rem;
          font-size: 0.78rem;
          font-weight: 800;
        }

        .save-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #94a3b8;
        }

        .soap-save-status strong {
          color: inherit;
          font-size: inherit;
        }

        .soap-save-status small {
          color: var(--text-ghost);
          font-size: 0.72rem;
          font-weight: 760;
        }

        .status-saved {
          color: #047857;
          border-color: #bbf7d0;
          background: #f0fdf4;
        }

        .status-saved .save-dot {
          background: #10b981;
        }

        .status-saving,
        .status-dirty {
          color: #b45309;
          border-color: #fde68a;
          background: #fffbeb;
        }

        .status-saving .save-dot,
        .status-dirty .save-dot {
          background: #f59e0b;
        }

        .status-error {
          color: #b91c1c;
          border-color: #fecaca;
          background: #fef2f2;
        }

        .status-error .save-dot {
          background: #ef4444;
        }
      `}</style>
    </div>
  );
});

const SoapEditor = ({ targetVisitId, registerFlush, onResolvedVisitChange }: {
  targetVisitId: string | null;
  registerFlush?: (fn: (() => Promise<{ hasContent: boolean; missingStructuredFields: string[] }>) | null) => void;
  onResolvedVisitChange?: (visitId: string | null) => void;
}) => {
  const db = useDatabase();
  // null=解決中。false=受付なし(入力しても保存されないため、エディタの代わりに案内を表示する)。
  const [hasResolvedVisit, setHasResolvedVisit] = useState<boolean | null>(null);
  const [problems, setProblems] = useState<SoapProblem[]>([
    {
      id: uuidv4(),
      title: '#1 ',
      entries: [
        { id: uuidv4(), type: 'S', text: '' },
        { id: uuidv4(), type: 'O', text: '' },
        { id: uuidv4(), type: 'A', text: '' },
        { id: uuidv4(), type: 'P', text: '' }
      ]
    }
  ]);

  const [activeProblemId, setActiveProblemId] = useState<string | null>(null);
  const [pastProblemSuggestions, setPastProblemSuggestions] = useState<string[]>([]);
  const [structuredAssessment, setStructuredAssessment] = useState<SoapStructuredAssessment>(() => createDefaultSoapStructuredAssessment());
  const [saveStatus, setSaveStatus] = useState<SoapSaveStatus>('loading');
  const [lastSavedAt, setLastSavedAt] = useState('');

  // Persistence: resolve the active visit, load its saved SOAP on mount, and
  // autosave edits to db.soap_records so nothing the pharmacist writes is lost.
  const resolvedVisitIdRef = React.useRef<string | null>(null);
  const soapIdRef = React.useRef<string | null>(null);
  const loadedRef = React.useRef(false);
  const dirtyRef = React.useRef(false);
  const problemsRef = React.useRef(problems);
  const structuredAssessmentRef = React.useRef(structuredAssessment);
  problemsRef.current = problems;
  structuredAssessmentRef.current = structuredAssessment;

  useEffect(() => {
    let cancelled = false;
    loadedRef.current = false;
    dirtyRef.current = false;
    setSaveStatus('loading');
    setLastSavedAt('');
    setHasResolvedVisit(null);
    setStructuredAssessment(createDefaultSoapStructuredAssessment());
    (async () => {
      if (!db) return;
      let visitId = targetVisitId;
      if (!visitId) {
        const processing = await db.visits.find({ selector: { status: 'processing' } }).exec();
        visitId = processing[0]?.visitId ?? null;
      }
      if (cancelled) return;
      resolvedVisitIdRef.current = visitId;
      setHasResolvedVisit(!!visitId);
      onResolvedVisitChange?.(visitId);
      if (!visitId) {
        loadedRef.current = true;
        setSaveStatus('saved');
        return;
      }
      try {
        const existing = await db.soap_records.find({ selector: { visitId } }).exec();
        if (cancelled) return;
        const record = existing[0]?.toJSON?.() ?? existing[0];
        soapIdRef.current = record?.soapId ?? `soap_${visitId}`;
        if (record && Array.isArray(record.problems) && record.problems.length > 0) {
          setProblems(record.problems.map((p: any) => ({
            id: p.id || uuidv4(),
            title: p.title || '',
            entries: (p.entries || []).map((e: any) => ({ id: uuidv4(), type: e.type as SoapEntryType, text: e.text || '' }))
          })));
          setActiveProblemId(null);
        }
        setStructuredAssessment(normalizeSoapStructuredAssessment(record?.structuredAssessment));
        setLastSavedAt(record?.updatedAt || '');
        setSaveStatus('saved');
      } catch (err) {
        console.error('Failed to load SOAP record:', err);
        if (!cancelled) setSaveStatus('error');
      } finally {
        if (!cancelled) loadedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [db, targetVisitId, onResolvedVisitChange]);

  useEffect(() => {
    let cancelled = false;

    async function loadPastProblemSuggestions() {
      if (!db) {
        setPastProblemSuggestions([]);
        return;
      }

      try {
        let visitId = targetVisitId;
        if (!visitId) {
          const processing = await db.visits.find({ selector: { status: 'processing' } }).exec();
          visitId = processing[0]?.visitId ?? null;
        }
        if (!visitId) {
          if (!cancelled) setPastProblemSuggestions([]);
          return;
        }

        const currentVisitDoc = await db.visits.findOne(visitId).exec();
        const currentVisit = currentVisitDoc?.toJSON?.() ?? currentVisitDoc;
        if (!currentVisit?.patientId) {
          if (!cancelled) setPastProblemSuggestions([]);
          return;
        }

        const visitDocs = await db.visits.find({ selector: { patientId: currentVisit.patientId } }).exec();
        const pastVisitIds = visitDocs
          .map((visitDoc) => visitDoc.toJSON() as Visit)
          .map((visit) => visit.visitId)
          .filter((id) => id !== visitId);

        const soapDocs = pastVisitIds.length > 0
          ? await db.soap_records.find({ selector: { visitId: { $in: pastVisitIds } } }).exec()
          : [];
        const soapRecords = soapDocs.map((soapDoc) => soapDoc.toJSON()) as DbSoapRecord[];

        if (!cancelled) {
          setPastProblemSuggestions(buildPastProblemSuggestions(soapRecords));
        }
      } catch (error) {
        console.error('Failed to load past problem suggestions:', error);
        if (!cancelled) setPastProblemSuggestions([]);
      }
    }

    loadPastProblemSuggestions();
    return () => { cancelled = true; };
  }, [db, targetVisitId]);

  const persistSoap = useCallback(async (): Promise<{ hasContent: boolean; missingStructuredFields: string[] }> => {
    const current = problemsRef.current;
    const assessment = normalizeSoapStructuredAssessment(structuredAssessmentRef.current);
    const hasContent = current.some(p => p.entries.some(e => e.text.trim().length > 0));
    const missingStructuredFields = getMissingSoapStructuredAssessmentFields(assessment);
    const visitId = resolvedVisitIdRef.current;
    if (!db || !visitId) return { hasContent, missingStructuredFields };
    const soapId = soapIdRef.current || `soap_${visitId}`;
    soapIdRef.current = soapId;
    setSaveStatus('saving');
    const updatedAt = new Date().toISOString();
    try {
      await db.soap_records.upsert({
        soapId,
        visitId,
        authorId: getCurrentUser().userId,
        problems: current.map(p => ({
          id: p.id,
          title: p.title,
          entries: p.entries.map(e => ({ type: e.type, text: e.text }))
        })),
        structuredAssessment: assessment,
        updatedAt
      });
      setLastSavedAt(updatedAt);
      setSaveStatus(dirtyRef.current ? 'dirty' : 'saved');
    } catch (err) {
      console.error('Failed to save SOAP record:', err);
      dirtyRef.current = true;
      setSaveStatus('error');
      throw err;
    }
    return { hasContent, missingStructuredFields };
  }, [db]);

  // Debounced autosave once the existing record has loaded and the user edited.
  useEffect(() => {
    if (!loadedRef.current || !dirtyRef.current) return;
    const handle = setTimeout(() => {
      dirtyRef.current = false;
      void persistSoap().catch(() => undefined);
    }, 700);
    return () => clearTimeout(handle);
  }, [problems, structuredAssessment, persistSoap]);

  // Expose an immediate flush so the parent can guarantee a save before completing.
  useEffect(() => {
    if (!registerFlush) return;
    registerFlush(async () => {
      dirtyRef.current = false;
      return persistSoap();
    });
    return () => registerFlush(null);
  }, [registerFlush, persistSoap]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current && saveStatus !== 'saving') return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  const markSoapDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveStatus('dirty');
  }, []);

  useEffect(() => {
    if (problems.length > 0 && !activeProblemId) {
      setActiveProblemId(problems[0].id);
    }
  }, [problems, activeProblemId]);

  useEffect(() => {
    const handleInsert = (e: Event) => {
      const { type, text } = (e as CustomEvent).detail;
      markSoapDirty();
      setProblems(prev => {
        const targetId = activeProblemId || prev[0]?.id;
        if (!targetId) return prev;

        return prev.map(p => {
          if (p.id !== targetId) return p;
          // 同種の空欄エントリがあればそこへ入れ、空箱を増やさない。
          const emptyIndex = p.entries.findIndex(entry => entry.type === type && entry.text.trim() === '');
          if (emptyIndex >= 0) {
            const entries = [...p.entries];
            entries[emptyIndex] = { ...entries[emptyIndex], text };
            return { ...p, entries };
          }
          return { ...p, entries: [...p.entries, { id: uuidv4(), type: type as SoapEntryType, text }] };
        });
      });
      toast.success(`${type}に指導項目を追記しました`);
    };
    document.addEventListener('insert-soap-guidance', handleInsert);
    return () => document.removeEventListener('insert-soap-guidance', handleInsert);
  }, [activeProblemId, markSoapDirty]);

  const addProblem = (title: string = '') => {
    markSoapDirty();
    setProblems([...problems, { id: uuidv4(), title: `#${problems.length + 1} ${title}`, entries: [{ id: uuidv4(), type: 'S', text: '' }] }]);
  };

  const removeProblem = useCallback((probId: string) => {
    markSoapDirty();
    setProblems(prev => prev.filter(p => p.id !== probId));
  }, [markSoapDirty]);

  const updateProblemTitle = useCallback((probId: string, title: string) => {
    markSoapDirty();
    setProblems(prev => prev.map(p => p.id === probId ? { ...p, title } : p));
  }, [markSoapDirty]);

  const addEntry = useCallback((probId: string, type: SoapEntryType) => {
    markSoapDirty();
    setProblems(prev => prev.map(p => {
      if (p.id === probId) {
        return { ...p, entries: [...p.entries, { id: uuidv4(), type, text: '' }] };
      }
      return p;
    }));
  }, [markSoapDirty]);

  const updateEntry = useCallback((probId: string, entryId: string, text: string) => {
    markSoapDirty();
    setProblems(prev => prev.map(p => {
      if (p.id === probId) {
        return { ...p, entries: p.entries.map(e => e.id === entryId ? { ...e, text } : e) };
      }
      return p;
    }));
  }, [markSoapDirty]);

  const removeEntry = useCallback((probId: string, entryId: string) => {
    markSoapDirty();
    setProblems(prev => prev.map(p => {
      if (p.id === probId) {
        return { ...p, entries: p.entries.filter(e => e.id !== entryId) };
      }
      return p;
    }));
  }, [markSoapDirty]);

  const updateStructuredAssessment = useCallback(<K extends keyof SoapStructuredAssessment>(
    field: K,
    value: NonNullable<SoapStructuredAssessment[K]>
  ) => {
    markSoapDirty();
    setStructuredAssessment(prev => normalizeSoapStructuredAssessment({
      ...prev,
      [field]: value
    }));
  }, [markSoapDirty]);

  const handleImmediateSave = useCallback(() => {
    dirtyRef.current = false;
    void persistSoap()
      .then(() => {
        if (resolvedVisitIdRef.current) toast.success('薬歴を保存しました');
      })
      .catch(() => undefined);
  }, [persistSoap]);

  const handleEditorKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      handleImmediateSave();
    }
  }, [handleImmediateSave]);

  const [isPastMenuOpen, setIsPastMenuOpen] = useState(false);
  const pastMenuRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isPastMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!pastMenuRef.current?.contains(event.target as Node)) {
        setIsPastMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPastMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPastMenuOpen]);

  if (hasResolvedVisit === false) {
    return (
      <div className="soap-editor-empty" role="status">
        <MessageSquare size={26} aria-hidden="true" />
        <h3>受付が選択されていません</h3>
        <p>
          薬歴を記録するには処理中の受付が必要です。
          受付がない状態では入力内容は保存されません。
        </p>
        <div className="empty-actions">
          <a className="btn-secondary" href="/ocr">処方箋OCRで受付を開始</a>
          <a className="btn-secondary" href="/">ダッシュボードで受付を確認</a>
        </div>
        <style jsx>{`
          .soap-editor-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.6rem;
            padding: 2.5rem 1.5rem;
            text-align: center;
            color: var(--text-muted);
            border: 1px dashed var(--border-strong);
            border-radius: var(--radius-md);
            background: var(--bg-card);
          }

          .soap-editor-empty h3 {
            margin: 0;
            color: var(--text-main);
            font-size: 1.02rem;
            font-weight: 800;
          }

          .soap-editor-empty p {
            margin: 0;
            font-size: 0.85rem;
            line-height: 1.7;
            max-width: 420px;
          }

          .empty-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 0.6rem;
            margin-top: 0.5rem;
          }

          .empty-actions a {
            text-decoration: none;
            display: inline-flex;
            align-items: center;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="soap-editor-container" onKeyDown={handleEditorKeyDown}>
      <div className="soap-editor-toolbar">
        <span className="keyboard-hint">Ctrl(⌘)+Enter で即時保存</span>
        <SoapSaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
      </div>
      <SoapStructuredAssessmentPanel
        assessment={structuredAssessment}
        onChange={updateStructuredAssessment}
      />
      {problems.map(problem => (
        <div key={problem.id} className={`problem-block ${activeProblemId === problem.id ? 'active' : ''}`} onClick={() => setActiveProblemId(problem.id)}>
          <div className="problem-header">
            <input
              type="text"
              value={problem.title}
              onChange={(e) => updateProblemTitle(problem.id, e.target.value)}
              placeholder="#1 プロブレム名（例: 高血圧、副作用フォロー）"
              className="problem-title-input"
            />
            {activeProblemId === problem.id && problems.length > 1 && (
              <span className="active-target-badge" title="指導文・AI下書きはこのプロブレムへ挿入されます">挿入先</span>
            )}
            {problems.length > 1 && (
              <button onClick={() => removeProblem(problem.id)} className="btn-remove-problem" aria-label="プロブレムを削除" title="プロブレムを削除">
                <Trash2 size={16} />
              </button>
            )}
          </div>
          <div className="problem-entries">
            {problem.entries.map(entry => (
              <SoapEntryBox
                key={entry.id}
                entry={entry}
                onChange={(text) => updateEntry(problem.id, entry.id, text)}
                onRemove={() => removeEntry(problem.id, entry.id)}
              />
            ))}
          </div>
          <div className="problem-actions">
            <span className="actions-label">追加:</span>
            {(['S', 'O', 'A', 'P'] as SoapEntryType[]).map(type => (
              <button
                key={type}
                className={`btn-add-entry ${type.toLowerCase()}`}
                onClick={() => addEntry(problem.id, type)}
              >
                <strong>+ {type}</strong> {soapEntryTypeMeta[type].subLabel}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="soap-editor-footer">
        <button className="btn-secondary" onClick={() => addProblem()} style={{ fontSize: '0.85rem' }}>
          <Plus size={14} style={{ marginRight: '4px' }} /> 新規プロブレム
        </button>
        <div className="past-problem-menu-wrap" ref={pastMenuRef}>
          <button
            type="button"
            className="past-problem-trigger"
            aria-haspopup="menu"
            aria-expanded={isPastMenuOpen}
            disabled={pastProblemSuggestions.length === 0}
            title={pastProblemSuggestions.length === 0 ? 'この患者の過去プロブレムはまだありません' : ''}
            onClick={() => setIsPastMenuOpen(open => !open)}
          >
            <History size={14} aria-hidden="true" />
            過去のプロブレムから追加
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {isPastMenuOpen && (
            <div className="past-problem-menu" role="menu" aria-label="過去のプロブレム候補">
              {pastProblemSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  role="menuitem"
                  className="past-problem-item"
                  onClick={() => {
                    addProblem(suggestion);
                    setIsPastMenuOpen(false);
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <style jsx>{`
        .soap-editor-container {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .soap-editor-toolbar {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.75rem;
          position: sticky;
          top: 0; /* ページスクロール(.content-scroll)の上端に固定 */
          z-index: 5;
          background: #fdfdfd;
          padding: 0.3rem 0;
        }
        .keyboard-hint {
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--text-ghost);
        }
        .problem-block {
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 0.85rem;
          background: var(--bg-subtle);
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
        }
        .problem-block.active {
          border-color: var(--primary);
          box-shadow: 0 0 0 2px var(--primary-light);
          background: var(--bg-card);
        }
        .problem-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }
        .problem-title-input {
          flex: 1;
          min-width: 0;
          font-weight: 600;
          font-size: 1.05rem;
          color: var(--text-main);
          border: none;
          background: transparent;
          border-bottom: 1px solid transparent;
          padding: 0.2rem;
        }
        .problem-title-input:focus {
          outline: none;
          border-bottom: 1px solid var(--primary);
        }
        .active-target-badge {
          flex-shrink: 0;
          border-radius: 999px;
          background: var(--primary-light);
          color: var(--primary-dark);
          border: 1px solid var(--primary-soft);
          padding: 0.1rem 0.55rem;
          font-size: 0.7rem;
          font-weight: 850;
          white-space: nowrap;
        }
        .btn-remove-problem {
          flex-shrink: 0;
          background: transparent;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: var(--radius-sm);
          color: var(--text-ghost);
          opacity: 0;
          transition: opacity var(--transition-fast), color var(--transition-fast);
        }
        .problem-block:hover .btn-remove-problem,
        .problem-block:focus-within .btn-remove-problem,
        .btn-remove-problem:focus-visible {
          opacity: 1;
        }
        .btn-remove-problem:hover {
          background: var(--danger-soft);
          color: var(--danger);
        }
        .problem-entries {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          margin-bottom: 0.75rem;
        }
        .problem-actions {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.4rem;
          padding-top: 0.5rem;
          border-top: 1px dashed var(--border);
        }
        .actions-label {
          font-size: 0.78rem;
          color: var(--text-ghost);
          font-weight: 700;
          margin-right: 0.25rem;
        }
        .btn-add-entry {
          display: inline-flex;
          align-items: center;
          gap: 0.28rem;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 0.22rem 0.7rem;
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--text-muted);
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .btn-add-entry strong {
          font-weight: 850;
        }
        .btn-add-entry:hover { background: var(--bg-hover); }
        .btn-add-entry.s strong { color: var(--status-blue); }
        .btn-add-entry.o strong { color: var(--status-green); }
        .btn-add-entry.a strong { color: var(--status-orange); }
        .btn-add-entry.p strong { color: var(--status-purple); }
        .btn-add-entry.s:hover { border-color: var(--status-blue); }
        .btn-add-entry.o:hover { border-color: var(--status-green); }
        .btn-add-entry.a:hover { border-color: var(--status-orange); }
        .btn-add-entry.p:hover { border-color: var(--status-purple); }
        .soap-editor-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          margin-top: 0.25rem;
        }
        .past-problem-menu-wrap {
          position: relative;
        }
        .past-problem-trigger {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text-muted);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          padding: 0.4rem 0.7rem;
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .past-problem-trigger:hover:not(:disabled) {
          border-color: var(--primary);
          color: var(--primary-dark);
          background: var(--primary-light);
        }
        .past-problem-trigger:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .past-problem-trigger:focus-visible {
          outline: none;
          border-color: var(--border-focus);
          box-shadow: 0 0 0 3px var(--primary-light);
        }
        .past-problem-menu {
          position: absolute;
          bottom: calc(100% + 6px);
          left: 0;
          min-width: 240px;
          max-width: 340px;
          max-height: 260px;
          overflow-y: auto;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-md);
          padding: 0.35rem;
          display: grid;
          gap: 0.15rem;
          z-index: 30;
        }
        .past-problem-item {
          text-align: left;
          border: none;
          background: transparent;
          border-radius: var(--radius-sm);
          padding: 0.45rem 0.6rem;
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text-main);
          cursor: pointer;
          overflow-wrap: anywhere;
        }
        .past-problem-item:hover,
        .past-problem-item:focus-visible {
          background: var(--primary-light);
          color: var(--primary-dark);
          outline: none;
        }
      `}</style>
    </div>
  );
};

const soapEntryTypeMeta: Record<SoapEntryType, { color: string; subLabel: string; placeholder: string }> = {
  S: {
    color: 'blue',
    subLabel: '主観',
    placeholder: '患者の訴え・自覚症状・生活状況（例: 咳が続いて夜眠れない）'
  },
  O: {
    color: 'green',
    subLabel: '客観',
    placeholder: '処方内容・検査値・観察事項（例: 前回から用量変更なし、血圧130/85）'
  },
  A: {
    color: 'orange',
    subLabel: '評価',
    placeholder: '薬学的評価・判断（例: アドヒアランス良好、副作用の兆候なし）'
  },
  P: {
    color: 'purple',
    subLabel: '計画',
    placeholder: '指導内容・次回確認事項（例: 眠気に注意するよう説明、次回残薬確認）'
  }
};

const SOAP_ENTRY_MAX_LENGTH = 2000;
const SOAP_ENTRY_COUNT_WARNING_THRESHOLD = 1800;

const SoapEntryBox = React.memo(function SoapEntryBox({
  entry,
  onChange,
  onRemove
}: {
  entry: SoapEntry,
  onChange: (text: string) => void,
  onRemove: () => void
}) {
  const [charCount, setCharCount] = useState(entry.text ? entry.text.length : 0);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const resizeToContent = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 56), 420)}px`;
  }, []);

  React.useLayoutEffect(() => {
    resizeToContent();
  }, [entry.text, resizeToContent]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCharCount(e.target.value.length);
    onChange(e.target.value);
  }, [onChange]);

  const meta = soapEntryTypeMeta[entry.type] ?? soapEntryTypeMeta.S;

  return (
    <div className={`soap-entry-container ${meta.color}`}>
      <div className={`soap-letter-column ${meta.color}`}>
        <div className="letter-large">{entry.type}</div>
        <div className="letter-sub">{meta.subLabel}</div>
      </div>
      <div className="soap-content-column">
        <textarea
          ref={textareaRef}
          rows={2}
          maxLength={SOAP_ENTRY_MAX_LENGTH}
          value={entry.text}
          onChange={handleChange}
          placeholder={meta.placeholder}
          aria-label={`${entry.type}（${meta.subLabel}）`}
        />
        {charCount >= SOAP_ENTRY_COUNT_WARNING_THRESHOLD && (
          <span className="char-count">{charCount} / {SOAP_ENTRY_MAX_LENGTH}</span>
        )}
      </div>
      <button onClick={onRemove} className="btn-remove-entry" aria-label="項目を削除" title="項目を削除">
        <Trash2 size={14} />
      </button>
      <style jsx>{`
        .soap-entry-container {
          position: relative;
          display: flex;
          gap: 0.75rem;
          align-items: stretch;
          background: var(--bg-card);
          padding: 0.5rem 0.6rem;
          border: 1px solid var(--border);
          border-left-width: 3px;
          border-radius: var(--radius-sm);
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
        }
        .soap-entry-container.blue { border-left-color: var(--status-blue); }
        .soap-entry-container.green { border-left-color: var(--status-green); }
        .soap-entry-container.orange { border-left-color: var(--status-orange); }
        .soap-entry-container.purple { border-left-color: var(--status-purple); }

        .soap-entry-container:focus-within {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px var(--primary-light);
        }

        .soap-letter-column {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          gap: 0.05rem;
          width: 44px;
          flex-shrink: 0;
          padding-top: 0.35rem;
        }
        .soap-letter-column.blue { color: var(--status-blue); }
        .soap-letter-column.green { color: var(--status-green); }
        .soap-letter-column.orange { color: var(--status-orange); }
        .soap-letter-column.purple { color: var(--status-purple); }

        .letter-large {
          font-family: var(--font-outfit), sans-serif;
          font-size: 1.4rem;
          font-weight: 800;
          line-height: 1;
        }

        .letter-sub {
          font-size: 0.62rem;
          font-weight: 800;
          opacity: 0.85;
        }

        .soap-content-column {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          min-width: 0;
        }

        textarea {
          width: 100%;
          border: none;
          background: transparent;
          padding: 0.45rem 0.2rem;
          font-size: 0.95rem;
          line-height: 1.55;
          font-family: inherit;
          color: var(--text-main);
          resize: none;
          min-height: 56px;
          overflow-y: auto;
        }

        textarea::placeholder {
          color: var(--text-ghost);
          font-size: 0.85rem;
        }

        textarea:focus {
          outline: none;
        }

        .char-count {
          align-self: flex-end;
          font-size: 0.72rem;
          font-weight: 760;
          color: var(--warning);
        }

        .btn-remove-entry {
          position: absolute;
          top: 6px;
          right: 6px;
          background: transparent;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: var(--radius-sm);
          color: var(--text-ghost);
          opacity: 0;
          transition: opacity var(--transition-fast), color var(--transition-fast);
        }
        .soap-entry-container:hover .btn-remove-entry,
        .soap-entry-container:focus-within .btn-remove-entry,
        .btn-remove-entry:focus-visible {
          opacity: 1;
        }
        .btn-remove-entry:hover {
          background: var(--danger-soft);
          color: var(--danger);
        }
      `}</style>
    </div>
  );
});


// ⚡ Bolt: Extracted specific InsightCards into their own purely memoized components.
// This completely avoids the issue of passing inline JSX elements (or children)
// as props, which defeats React.memo's shallow comparison.
const CareChecklistCard = React.memo(function CareChecklistCard({
  warningCount,
  isWarningsLoading,
  unpickedCount,
  prescribedCount,
  patientAlertCount
}: {
  warningCount: number;
  isWarningsLoading: boolean;
  unpickedCount: number;
  prescribedCount: number;
  patientAlertCount: number;
}) {
  const items = [
    {
      label: '患者アラート',
      value: patientAlertCount,
      state: patientAlertCount > 0 ? 'review' : 'ok',
      text: patientAlertCount > 0 ? `${patientAlertCount}件` : '確認済'
    },
    {
      label: '相互作用・用量',
      value: warningCount,
      state: isWarningsLoading ? 'pending' : warningCount > 0 ? 'review' : 'ok',
      text: isWarningsLoading ? '解析中' : warningCount > 0 ? `${warningCount}件` : '確認済'
    },
    {
      label: 'GS1照合',
      value: unpickedCount,
      state: unpickedCount > 0 ? 'review' : 'ok',
      text: unpickedCount > 0 ? `${unpickedCount}件` : '完了'
    },
    {
      label: '指導文',
      value: prescribedCount,
      state: prescribedCount > 0 ? 'ok' : 'pending',
      text: prescribedCount > 0 ? `${prescribedCount}薬` : '未読込'
    }
  ];

  return (
    <div className="insight-card care-check">
      <div className="insight-header">
        <CheckCircle2 size={18} className="icon-care" />
        <h3>服薬指導チェック</h3>
      </div>
      <div className="care-check-list">
        {items.map((item) => (
          <div key={item.label} className={`care-check-item ${item.state}`}>
            <span className="care-check-label">{item.label}</span>
            <span className="care-check-value">{item.text}</span>
          </div>
        ))}
      </div>
      <style jsx>{`
        .care-check {
          border-left: 4px solid var(--accent);
        }

        .icon-care {
          color: var(--accent);
        }

        .care-check-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.5rem;
        }

        .care-check-item {
          min-height: 58px;
          display: grid;
          align-content: center;
          gap: 0.1rem;
          padding: 0.65rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
        }

        .care-check-item.ok {
          border-color: #bbf7d0;
          background: #f0fdf4;
        }

        .care-check-item.review {
          border-color: #fed7aa;
          background: #fff7ed;
        }

        .care-check-item.pending {
          border-color: var(--border);
          background: var(--bg-subtle);
        }

        .care-check-label {
          color: var(--text-muted);
          font-size: 0.74rem;
          font-weight: 800;
          overflow-wrap: anywhere;
        }

        .care-check-value {
          color: var(--text-main);
          font-size: 0.98rem;
          font-weight: 850;
        }

        .care-check-item.review .care-check-value {
          color: #c2410c;
        }

        .care-check-item.ok .care-check-value {
          color: var(--success);
        }
      `}</style>
    </div>
  );
});

const WarningInsightCard = React.memo(function WarningInsightCard({ warnings, isLoading }: { warnings?: any[], isLoading?: boolean }) {
  if (isLoading) {
    return (
      <div className="insight-card warning">
        <div className="insight-header">
           <Loader2 className="animate-spin" size={18} />
           <h3>相互作用・注意を解析中...</h3>
        </div>
      </div>
    );
  }

  if (!warnings || warnings.length === 0) {
    return (
      <div id="emr-warning-insights" className="insight-card warning" style={{ borderColor: 'var(--green-200)', backgroundColor: 'var(--green-50)' }}>
        <div className="insight-header">
          <CheckCircle2 size={18} color="var(--green-600)" />
          <h3 style={{ color: 'var(--green-700)' }}>相互作用・注意なし</h3>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--green-700)', marginTop: '0.5rem' }}>
          併用禁忌や用法用量の警告は検出されませんでした。
        </p>
      </div>
    );
  }

  return (
    <div id="emr-warning-insights" className="insight-card warning">
      <div className="insight-header">
        <AlertTriangle size={18} className="icon-warning" />
        <h3>相互作用・注意 ({warnings.length}件)</h3>
      </div>
      <ul className="insight-list">
        {warnings.map((w, idx) => (
           <li key={idx}>
             {w.type === 'contraindication' && (
                <>
                  <strong style={{ color: w.severity === 'danger' ? '#ef4444' : '#eab308' }}>
                    {w.severity === 'danger' ? '併用禁忌:' : '併用注意:'}
                  </strong> {w.drug1} と {w.drug2}（{w.message}）
                </>
             )}
             {w.type === 'usage' && (
                <>
                  <strong style={{ color: w.severity === 'danger' ? '#ef4444' : '#eab308' }}>
                    {w.severity === 'danger' ? '病態禁忌/注意:' : '用法注意:'}
                  </strong> {w.drug}（{w.message}）
                </>
             )}
             {w.type === 'patient_alert' && (
                <>
                  <strong style={{ color: w.severity === 'danger' ? '#ef4444' : '#eab308' }}>
                    {w.alertType === 'allergy' ? '薬剤アレルギー:' : '副作用歴:'}
                  </strong> {w.drug}（{w.message}）
                </>
             )}
           </li>
        ))}
      </ul>
    </div>
  );
});

const SoapAiDraftInsightCard = React.memo(function SoapAiDraftInsightCard({
  suggestions,
  onApplyDraft,
  onFocusEvidence
}: {
  suggestions: SoapAiDraftSuggestion[];
  onApplyDraft: (suggestion: SoapAiDraftSuggestion) => void;
  onFocusEvidence: (targetId?: string) => void;
}) {
  const visibleSuggestions = suggestions.slice(0, 4);

  return (
    <div className="insight-card soap-ai-draft">
      <div className="insight-header">
        <Sparkles size={18} className="icon-ai" />
        <h3>AI補助 SOAP下書き</h3>
      </div>
      <div className="soap-ai-list">
        {visibleSuggestions.map((suggestion) => (
          <div key={suggestion.draftId} className={`soap-ai-item ${suggestion.severity}`}>
            <div className="soap-ai-title-row">
              <span className={`soap-ai-type ${suggestion.type.toLowerCase()}`}>{suggestion.type}</span>
              <strong>{suggestion.title}</strong>
              <span className="soap-ai-confidence">{suggestion.confidence}%</span>
            </div>
            <p>{suggestion.text}</p>
            <div className="soap-ai-evidence">
              {suggestion.evidence.slice(0, 2).map((evidence) => (
                <button
                  key={`${suggestion.draftId}-${evidence.label}`}
                  type="button"
                  className="soap-ai-evidence-link"
                  onClick={() => onFocusEvidence(evidence.targetId)}
                  disabled={!evidence.targetId}
                  title={evidence.targetLabel ? `${evidence.targetLabel}を確認` : '根拠を確認'}
                >
                  <span>{evidence.label}: {evidence.detail}</span>
                  {evidence.targetLabel && <small>{evidence.targetLabel}</small>}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn-secondary soap-ai-apply"
              onClick={() => onApplyDraft(suggestion)}
              title="SOAPへ反映して監査ログに記録"
            >
              <Plus size={14} aria-hidden="true" />
              <span>SOAPへ反映</span>
            </button>
          </div>
        ))}
      </div>
      <div className="soap-ai-guardrail">薬剤師確認必須 / AI補助は候補提示のみ</div>
      <style jsx>{`
        .soap-ai-draft {
          border-left: 4px solid #7c3aed;
        }

        .icon-ai {
          color: #7c3aed;
        }

        .soap-ai-list {
          display: grid;
          gap: 0.65rem;
        }

        .soap-ai-item {
          display: grid;
          gap: 0.45rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
          padding: 0.7rem;
        }

        .soap-ai-item.critical {
          border-color: #fecaca;
          background: #fef2f2;
        }

        .soap-ai-item.warning {
          border-color: #fed7aa;
          background: #fff7ed;
        }

        .soap-ai-title-row {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          min-width: 0;
        }

        .soap-ai-title-row strong {
          flex: 1;
          min-width: 0;
          color: var(--text-main);
          font-size: 0.86rem;
          line-height: 1.35;
        }

        .soap-ai-type,
        .soap-ai-confidence {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 22px;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 850;
          white-space: nowrap;
        }

        .soap-ai-type {
          width: 28px;
          color: #fff;
        }

        .soap-ai-type.s { background: var(--status-blue); }
        .soap-ai-type.o { background: var(--status-green); }
        .soap-ai-type.a { background: var(--status-orange); }
        .soap-ai-type.p { background: var(--status-purple); }

        .soap-ai-confidence {
          padding: 0 0.45rem;
          background: #f8fafc;
          color: #475569;
          border: 1px solid #e2e8f0;
        }

        .soap-ai-item p {
          color: var(--text-muted);
          font-size: 0.82rem;
          line-height: 1.5;
          margin: 0;
        }

        .soap-ai-evidence {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }

        .soap-ai-evidence-link {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          max-width: 100%;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          background: rgba(255, 255, 255, 0.72);
          color: #64748b;
          cursor: pointer;
          font-size: 0.72rem;
          font-weight: 650;
          line-height: 1.35;
          padding: 0.14rem 0.4rem;
          text-align: left;
        }

        .soap-ai-evidence-link:hover:not(:disabled) {
          border-color: #a78bfa;
          color: #6d28d9;
          background: #f5f3ff;
        }

        .soap-ai-evidence-link:disabled {
          cursor: default;
        }

        .soap-ai-evidence-link span,
        .soap-ai-evidence-link small {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .soap-ai-evidence-link small {
          flex: 0 0 auto;
          color: #6d28d9;
          font-size: 0.68rem;
          font-weight: 850;
        }

        .soap-ai-apply {
          justify-self: flex-end;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          min-height: 30px;
          padding: 0.25rem 0.55rem;
          border-radius: 6px;
          font-size: 0.78rem;
          white-space: nowrap;
        }

        .soap-ai-guardrail {
          margin-top: 0.65rem;
          color: #475569;
          font-size: 0.75rem;
          font-weight: 800;
        }
      `}</style>
    </div>
  );
});

const VitalInsightCard = React.memo(function VitalInsightCard() {
  return (
    <div className="insight-card info">
      <div className="insight-header">
        <Activity size={18} className="icon-info" />
        <h3>検査値・バイタル推移</h3>
      </div>
      <div className="trend-graph-placeholder">
        <p className="trend-label">検査値・バイタルは未連携です。</p>
      </div>
    </div>
  );
});

const DocLinkInsightCard = React.memo(function DocLinkInsightCard({ prescribedDrugs, onSelectGuidance }: { prescribedDrugs?: any[], onSelectGuidance: (type: string, text: string) => void }) {
  const db = useDatabase();
  const [selectedDrug, setSelectedDrug] = useState<any>(null);
  const [guidanceData, setGuidanceData] = useState<Record<string, any[]>>({});
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);

  // Extract unique drugs to avoid duplicate links if the same drug is prescribed multiple times
  const displayDrugs = useMemo(() => {
    return Array.from(new Map((prescribedDrugs || []).map(d => [d.code, d])).values());
  }, [prescribedDrugs]);

  useEffect(() => {
    let isMounted = true;
    async function fetchGuidances() {
      if (!db || !db.medication_guidances) return;
      const codes = displayDrugs.map(d => d.code);
      if (codes.length === 0) return;

      try {
        const guidances = await db.medication_guidances.find({
          selector: { drugCode: { $in: codes } }
        }).exec();

        if (!isMounted) return;

        const dataMap: Record<string, any[]> = {};
        for (const g of guidances) {
          dataMap[g.drugCode] = g.entries || [];
        }
        setGuidanceData(dataMap);
      } catch (e) {
        console.error('Failed to fetch guidances:', e);
      }
    }
    fetchGuidances();
    return () => { isMounted = false; };
  }, [db, displayDrugs]);

  return (
    <>
      <div id="emr-prescription-doc-links" className="insight-card default">
        <div className="insight-header">
          <FileText size={18} className="icon-default" />
          <h3>添付文書・服薬指導補助</h3>
        </div>
        <div className="doc-links">
          {displayDrugs.map(drug => {
            const entries = guidanceData[drug.code] || [];
            const isDropdownOpen = dropdownOpen === drug.code;

            return (
              <div key={drug.code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{drug.name}</div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {drug.documentUrl ? (
                      <a href={drug.documentUrl} target="_blank" rel="noopener noreferrer" className="doc-link" style={{ fontSize: '0.8rem' }}>
                        添付文書 ↗
                      </a>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '0.8rem' }}>添付文書なし</span>
                    )}
                  </div>
                </div>
                <div style={{ position: 'relative' }}>
                  <button
                    className="btn-secondary"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    onClick={() => setDropdownOpen(isDropdownOpen ? null : drug.code)}
                  >
                    <BookOpen size={14} />
                    服薬指導補助
                    <ChevronDown size={14} />
                  </button>
                  {isDropdownOpen && (
                    <div className="guidance-dropdown">
                      <div className="guidance-header">サジェスト（クリックでアクティブなプロブレムに追記）</div>
                      <div className="guidance-list">
                      {entries.length > 0 ? (
                        entries.map((entry, idx) => (
                          <button
                            key={idx}
                            className="guidance-item"
                            onClick={() => {
                              onSelectGuidance(entry.type, entry.text);
                              setDropdownOpen(null);
                            }}
                          >
                            <span className={`tag ${entry.type.toLowerCase()}`}>{entry.type}</span>
                            <span className="text">{entry.text}</span>
                          </button>
                        ))
                      ) : (
                        <div style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-ghost)', textAlign: 'center' }}>
                          マニュアル未登録
                        </div>
                      )}
                      </div>
                      <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.25rem', paddingTop: '0.25rem' }}>
                        <button
                          className="guidance-item edit"
                          onClick={() => {
                            setSelectedDrug(drug);
                            setDropdownOpen(null);
                          }}
                        >
                          <BookOpen size={14} style={{ marginRight: '0.5rem' }} />
                          マニュアルを編集 (Enter)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <a href="#" className="doc-link" style={{ marginTop: '0.5rem', display: 'inline-block' }}>高血圧治療ガイドライン2019 ↗</a>
        </div>
      </div>

      <MedicationGuidanceModal
        isOpen={!!selectedDrug}
        onClose={() => {
          setSelectedDrug(null);
          // Refetch to reflect updates (a simple way is to force it, or just let RxDB subscription handle it if we had one.
          // For now, we will rely on a basic reload or the user reopening the page to see changes immediately.
          // Ideally we'd use RxDB useRxQuery here but keeping it simple.)
        }}
        drug={selectedDrug}
        db={db}
      />

      <style jsx>{`
        .guidance-dropdown {
          position: absolute;
          top: calc(100% + 0.25rem);
          right: 0;
          width: 320px;
          background: white;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          z-index: 100;
          padding: 0.25rem;
          display: flex;
          flex-direction: column;
        }
        .guidance-header {
          font-size: 0.75rem;
          color: var(--text-ghost);
          padding: 0.25rem 0.5rem;
          margin-bottom: 0.25rem;
          border-bottom: 1px dashed var(--border);
        }
        .guidance-list {
          max-height: 250px;
          overflow-y: auto;
        }
        .guidance-item {
          display: flex;
          align-items: flex-start;
          text-align: left;
          width: 100%;
          background: transparent;
          border: none;
          padding: 0.5rem;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: background 0.15s;
          font-size: 0.85rem;
        }
        .guidance-item:hover {
          background: var(--bg-hover);
        }
        .guidance-item .tag {
          font-weight: 800;
          font-size: 0.75rem;
          margin-right: 0.5rem;
          padding: 0.1rem 0.3rem;
          border-radius: 4px;
        }
        .guidance-item .tag.s { color: var(--status-blue); background: rgba(59, 130, 246, 0.1); }
        .guidance-item .tag.o { color: var(--status-green); background: rgba(34, 197, 94, 0.1); }
        .guidance-item .tag.a { color: var(--status-orange); background: rgba(249, 115, 22, 0.1); }
        .guidance-item .tag.p { color: var(--status-purple); background: rgba(168, 85, 247, 0.1); }
        .guidance-item .text {
          flex: 1;
          color: var(--text-main);
          line-height: 1.4;
        }
        .guidance-item.edit {
          color: var(--primary);
          font-weight: 500;
          align-items: center;
          justify-content: center;
        }
        .guidance-item.edit:hover {
          background: var(--primary-light);
        }
      `}</style>
    </>
  );
});

const MedicationGuidanceModal = ({ isOpen, onClose, drug, db }: { isOpen: boolean, onClose: () => void, drug: any, db: any }) => {
  const [entries, setEntries] = useState<{ id: string, type: string, text: string }[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [docId, setDocId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchGuidance() {
      if (!isOpen || !drug || !db) return;
      setIsLoading(true);
      try {
        if (!db.medication_guidances) {
          throw new Error('medication_guidances collection not found');
        }
        const guidances = await db.medication_guidances.find({ selector: { drugCode: drug.code } }).exec();
        if (!isMounted) return;
        if (guidances.length > 0) {
          setEntries(guidances[0].entries.map((e: any) => ({ ...e, id: uuidv4() })));
          setDocId(guidances[0].id);
        } else {
          setEntries([]);
          setDocId(null);
        }
      } catch (e) {
        console.error('Failed to fetch guidance:', e);
        if (isMounted) {
          setEntries([]);
          setDocId(null);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    fetchGuidance();
    return () => { isMounted = false; };
  }, [isOpen, drug, db]);

  const addEntry = (type: string) => {
    setEntries([...entries, { id: uuidv4(), type, text: '' }]);
  };

  const updateEntry = (id: string, text: string) => {
    setEntries(entries.map(e => e.id === id ? { ...e, text } : e));
  };

  const removeEntry = (id: string) => {
    setEntries(entries.filter(e => e.id !== id));
  };

  const handleSave = async () => {
    if (!db || !drug) return;
    setIsSaving(true);
    try {
      const cleanEntries = entries.map(e => ({ type: e.type, text: e.text }));
      if (docId) {
        const doc = await db.medication_guidances.findOne({ selector: { id: docId } }).exec();
        if (doc) {
          await doc.patch({
            entries: cleanEntries,
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        await db.medication_guidances.insert({
          id: `guidance_${uuidv4()}`,
          drugCode: drug.code,
          drugName: drug.name,
          entries: cleanEntries,
          updatedAt: new Date().toISOString()
        });
      }
      toast.success('服薬指導補助マニュアルを保存しました');
      onClose();
    } catch (e) {
      console.error('Failed to save guidance:', e);
      toast.error('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ width: '600px', maxWidth: '90vw' }}>
        <div className="modal-header">
          <h2>服薬指導補助マニュアル: {drug?.name}</h2>
          <button className="btn-icon" onClick={onClose}><Trash2 size={20} className="hidden" /> {/* Using Trash2 hidden as a quick placeholder for X if X is not imported, let's use standard HTML character for X to be safe */} <span style={{ fontSize: '1.2rem' }}>&times;</span></button>
        </div>
        <div className="modal-body">
          {isLoading ? (
            <div className="flex-center" style={{ height: '200px' }}>
              <Loader2 className="spin" size={24} />
            </div>
          ) : (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-ghost)', marginBottom: '1rem' }}>
                この薬剤に関する指導ポイントやヒントを登録できます。
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                {entries.map(entry => (
                  <div key={entry.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <div style={{
                      fontWeight: 800,
                      fontSize: '1.2rem',
                      paddingTop: '0.5rem',
                      width: '30px',
                      textAlign: 'center',
                      color: entry.type === 'S' ? 'var(--status-blue)' : entry.type === 'O' ? 'var(--status-green)' : entry.type === 'A' ? 'var(--status-orange)' : 'var(--status-purple)'
                    }}>
                      {entry.type}
                    </div>
                    <textarea
                      value={entry.text}
                      onChange={(e) => updateEntry(entry.id, e.target.value)}
                      style={{ flex: 1, minHeight: '60px', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '4px', resize: 'vertical' }}
                      placeholder="内容を入力..."
                    />
                    <button className="btn-icon text-muted" onClick={() => removeEntry(entry.id)} style={{ padding: '0.5rem' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-ghost)', alignSelf: 'center', marginRight: '0.5rem' }}>追加:</span>
                {(['S', 'O', 'A', 'P']).map(type => (
                  <button
                    key={type}
                    className={`btn-add-entry ${type.toLowerCase()}`}
                    onClick={() => addEntry(type)}
                    style={{ background: 'white', border: '1px solid var(--border)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    + {type}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>キャンセル</button>
          <span className="btn-tooltip-wrapper" data-disabled={isSaving} title={isSaving ? '保存中...' : ''}>
            <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              保存
            </button>
          </span>
        </div>
      </div>
    </div>
  );
};


const TimelineItem = React.memo(function TimelineItem({
  date,
  drug,
  detail,
  change,
  active
}: {
  date: string;
  drug: string;
  detail?: string;
  change: string;
  active?: boolean;
}) {
  return (
    <div className={`timeline-item card ${active ? 'active' : ''}`}>
      <span className="date">{date}</span>
      <span className="drug">{drug}</span>
      {detail && <span className="detail">{detail}</span>}
      <span className={`badge ${change === '変更' || change === '追記' ? 'orange' : change === '終了' ? 'red' : 'blue'}`}>{change}</span>
      <style jsx>{`
        .timeline-item {
          padding: 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .timeline-item.active { border-color: var(--primary); background: var(--primary-light); }
        .date { font-size: 0.75rem; color: var(--text-ghost); font-family: var(--font-outfit), var(--font-noto-sans-jp), sans-serif; }
        .drug { font-size: 0.9rem; font-weight: 600; color: var(--text-main); }
        .detail { color: var(--text-muted); font-size: 0.78rem; line-height: 1.45; overflow-wrap: anywhere; }
        .badge { align-self: flex-start; padding: 2px 6px; font-size: 0.7rem; }
      `}</style>
    </div>
  );
});

interface PickingSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: any[];
  userId: string;
  onVerifyScan: (scanValue: string) => Promise<{ ok: boolean; message: string; itemId?: string; drugName?: string } | void>;
  onResetPick: (itemId: string) => Promise<void>;
  onRecordShortage: (itemId: string, quantity: number, note: string) => Promise<void>;
  onPrintReceipt: () => Promise<void>;
  // 既存(外部)ピッキングシステム連携: 指示CSV書き出しと結果ファイル取込
  onExportInstruction: () => Promise<void>;
  onImportResultFile: (file: File) => Promise<void>;
}

const PickingSupportModal = ({ isOpen, onClose, items, userId, onVerifyScan, onResetPick, onRecordShortage, onPrintReceipt, onExportInstruction, onImportResultFile }: PickingSupportModalProps) => {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const scanInputRef = React.useRef<HTMLInputElement>(null);
  const [scanValue, setScanValue] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [scanStatus, setScanStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [isVerifyingScan, setIsVerifyingScan] = useState(false);
  const [shortageEditItemId, setShortageEditItemId] = useState<string | null>(null);
  const [shortageQuantityInput, setShortageQuantityInput] = useState('');
  const [shortageNoteInput, setShortageNoteInput] = useState('');
  const [isSavingShortage, setIsSavingShortage] = useState(false);
  const [isImportingSystemResult, setIsImportingSystemResult] = useState(false);

  const openShortageEditor = (item: any) => {
    setShortageEditItemId(item.itemId);
    setShortageQuantityInput(item.shortageQuantity > 0 ? String(item.shortageQuantity) : '');
    setShortageNoteInput(item.shortageNote || '');
  };

  const closeShortageEditor = () => {
    setShortageEditItemId(null);
    setShortageQuantityInput('');
    setShortageNoteInput('');
  };

  const handleShortageSave = async (itemId: string) => {
    const quantity = parseFloat(shortageQuantityInput);
    if (!Number.isFinite(quantity) || quantity < 0) {
      toast.error('不足数は0以上の数値で入力してください。');
      return;
    }
    setIsSavingShortage(true);
    try {
      await onRecordShortage(itemId, quantity, shortageNoteInput);
      closeShortageEditor();
    } finally {
      setIsSavingShortage(false);
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
      window.setTimeout(() => scanInputRef.current?.focus(), 50);
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target !== dialog) return;

      const rect = dialog.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );

      if (!isDialogContent) {
        onClose();
      }
    };

    dialog.addEventListener('click', handleBackdropClick);
    return () => dialog.removeEventListener('click', handleBackdropClick);
  }, [onClose]);

  if (!isOpen) return null;

  const totalCount = items.length;
  const pickedCount = items.filter(item => item.isPicked).length;
  const shortageCount = items.filter(item => (item.shortageQuantity || 0) > 0).length;
  const isFinished = totalCount > 0 && pickedCount === totalCount;
  const progressPercent = totalCount > 0 ? Math.round((pickedCount / totalCount) * 100) : 0;
  const handleScanSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsVerifyingScan(true);
    try {
      const result = await onVerifyScan(scanValue);
      if (result?.ok) {
        setScanStatus('ok');
        setScanMessage(result.message);
        setScanValue('');
        window.setTimeout(() => scanInputRef.current?.focus(), 50);
      } else {
        setScanStatus('error');
        setScanMessage(result?.message || 'GS1照合に失敗しました。');
      }
    } finally {
      setIsVerifyingScan(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="picking-modal glass"
      aria-labelledby="picking-title"
      onClose={onClose}
    >
      <div className="modal-header" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        <div className="modal-title-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)' }}>
            <Activity size={20} />
            <h3 id="picking-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>ピッキング支援モード</h3>
          </div>
          <div className="flex align-center gap-2">
            <WorkflowMiniTutorial kind="picking" userId={userId} autoOpen={isOpen} />
            <button className="btn-close-picking" onClick={onClose} aria-label="閉じる" style={{ background: 'none', border: 'none', fontSize: '1.8rem', color: 'var(--text-ghost)', cursor: 'pointer', lineHeight: 1, padding: '4px', minHeight: 'auto' }}>
              &times;
            </button>
          </div>
        </div>
        <p className="modal-subtitle" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
          GS1データバーを読み取り、今回調剤する医薬品と一致したものだけ照合済みにします。
        </p>
      </div>

      <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px', marginTop: '1rem' }}>
        {totalCount === 0 ? (
          <div className="empty-state" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-ghost)', border: '1px dashed var(--border-strong)', borderRadius: '8px' }}>
            処方データが登録されていないか、読み込み中です。
          </div>
        ) : (
          <>
            <form className={`gs1-scan-panel ${scanStatus}`} onSubmit={handleScanSubmit}>
              <label htmlFor="gs1-picking-scan">GS1コード読取</label>
              <div className="gs1-scan-row">
                <input
                  ref={scanInputRef}
                  id="gs1-picking-scan"
                  type="text"
                  value={scanValue}
                  onChange={(event) => {
                    setScanValue(event.target.value);
                    setScanStatus('idle');
                    setScanMessage('');
                  }}
                  placeholder="例: (01)04912345678904(17)260630(10)LOT-A"
                  autoComplete="off"
                />
                <button className="btn-primary flex-center gap-2" type="submit" disabled={isVerifyingScan || !scanValue.trim()}>
                  {isVerifyingScan ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Activity size={16} aria-hidden="true" />}
                  <span>{isVerifyingScan ? '照合中' : '照合'}</span>
                </button>
              </div>
              {scanMessage && (
                <p className="gs1-scan-message" role={scanStatus === 'error' ? 'alert' : 'status'}>
                  {scanMessage}
                </p>
              )}
            </form>

            <div className="progress-section" style={{ marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                <span>GS1照合進捗</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
                  {shortageCount > 0 && (
                    <span style={{ color: 'var(--warning)', fontSize: '0.82rem' }}>不足 {shortageCount}品目</span>
                  )}
                  <span style={{ color: 'var(--success)' }}>{pickedCount} / {totalCount} 件 ({progressPercent}%)</span>
                </span>
              </div>
              <div className="progress-bar-bg" style={{ width: '100%', height: '8px', background: 'var(--bg-muted)', borderRadius: '4px', overflow: 'hidden' }}>
                <div 
                  className="progress-bar-fill" 
                  style={{ 
                    width: `${progressPercent}%`, 
                    height: '100%', 
                    background: 'linear-gradient(90deg, var(--success), #34d399)', 
                    transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' 
                  }} 
                />
              </div>
            </div>

            {isFinished && (
              <div className="finished-celebration" style={{
                background: 'rgba(21, 128, 61, 0.1)',
                border: '1px solid rgba(21, 128, 61, 0.3)',
                borderRadius: '12px',
                padding: '1rem',
                textAlign: 'center',
                marginBottom: '0.5rem',
                color: 'var(--success)',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}>
                <CheckCircle2 size={18} aria-hidden="true" />
                <span>すべての薬剤のGS1照合が完了しました。</span>
              </div>
            )}

            <div className="picking-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {items.map((item) => (
                <div 
                  key={item.itemId} 
                  className={`picking-item-card ${item.isPicked ? 'picked' : ''}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    alignItems: 'start',
                    gap: '1rem',
                    padding: '1rem',
                    border: item.isPicked ? '1px solid rgba(21, 128, 61, 0.3)' : '1px solid var(--border)',
                    borderRadius: '12px',
                    background: item.isPicked ? 'rgba(220, 252, 231, 0.4)' : '#ffffff',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: item.isPicked ? 'none' : 'var(--shadow-sm)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', minWidth: 0 }}>
                    <div className={`location-badge ${item.location ? 'assigned' : 'unassigned'}`} style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontWeight: 800,
                      color: item.location ? 'var(--success)' : 'var(--text-ghost)',
                      background: item.location ? 'rgba(21, 128, 61, 0.1)' : 'var(--bg-muted)',
                      border: item.location ? '1px solid rgba(21, 128, 61, 0.2)' : '1px solid var(--border)',
                      minWidth: '70px',
                      textAlign: 'center'
                    }}>
                      {item.location || '未設定'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="drug-name-text" style={{
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        color: 'var(--text-main)',
                        transition: 'all 0.2s'
                      }}>
                        {item.drugName}
                      </div>
                      {item.prescribedDrugName && item.prescribedDrugName !== item.drugName && (
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-ghost)', marginTop: '0.15rem' }}>
                          処方: {item.prescribedDrugName}
                        </div>
                      )}
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        {item.usage || '用法未設定'} ({item.days}日分)
                      </div>
                      <div className="gs1-code-line">
                        <span>照合キー: {item.stockDrugId}</span>
                        {item.yjCode && <span>YJ: {item.yjCode}</span>}
                        {item.janCodes?.length > 0 && <span>GTIN/JAN: {item.janCodes.slice(0, 2).join(', ')}</span>}
                      </div>
                      {item.isPicked ? (
                        <div className="gs1-evidence-line">
                          <CheckCircle2 size={14} aria-hidden="true" />
                          <span>
                            {item.pickedGtin ? `GTIN ${item.pickedGtin}` : 'GS1照合済み'}
                            {item.pickedLotNumber ? ` / Lot ${item.pickedLotNumber}` : ''}
                            {item.pickedExpirationDate ? ` / 期限 ${item.pickedExpirationDate}` : ''}
                            {item.pickedStockId ? ' / 在庫ロット紐付け済み' : ' / 引落は期限順'}
                          </span>
                        </div>
                      ) : (
                        <div className="gs1-pending-line">
                          <AlertTriangle size={14} aria-hidden="true" />
                          <span>未照合</span>
                        </div>
                      )}

                      {shortageEditItemId === item.itemId ? (
                        <div className="shortage-editor">
                          <label>
                            不足数
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={shortageQuantityInput}
                              onChange={(event) => setShortageQuantityInput(event.target.value)}
                              aria-label={`${item.drugName} の不足数`}
                            />
                          </label>
                          <input
                            type="text"
                            className="shortage-note-input"
                            maxLength={500}
                            placeholder="メモ（棚在庫切れ・期限切れなど）"
                            value={shortageNoteInput}
                            onChange={(event) => setShortageNoteInput(event.target.value)}
                            aria-label={`${item.drugName} の不足メモ`}
                          />
                          <div className="shortage-editor-actions">
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => handleShortageSave(item.itemId)}
                              disabled={isSavingShortage}
                              style={{ minHeight: '30px', padding: '0 0.7rem', fontSize: '0.78rem' }}
                            >
                              {isSavingShortage ? '保存中...' : '保存'}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={closeShortageEditor}
                              disabled={isSavingShortage}
                              style={{ minHeight: '30px', padding: '0 0.7rem', fontSize: '0.78rem' }}
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : item.shortageQuantity > 0 ? (
                        <div className="shortage-line">
                          <AlertTriangle size={14} aria-hidden="true" />
                          <span>不足 {item.shortageQuantity}{item.shortageNote ? `（${item.shortageNote}）` : ''}</span>
                          <button type="button" className="shortage-inline-btn" onClick={() => openShortageEditor(item)}>変更</button>
                          <button type="button" className="shortage-inline-btn" onClick={() => onRecordShortage(item.itemId, 0, '')}>解除</button>
                          <a
                            className="shortage-inline-link"
                            href="/inventory?tab=order-workbench"
                            target="_blank"
                            rel="noopener noreferrer"
                            title="発注ワークベンチを別タブで開きます(ピッキングはこのまま続けられます)"
                          >
                            発注ワークベンチで確認 ↗
                          </a>
                        </div>
                      ) : (
                        <button type="button" className="shortage-open-btn" onClick={() => openShortageEditor(item)}>
                          不足を記録
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <span className="qty-value" style={{
                        fontSize: '1.25rem',
                        fontWeight: 800,
                        color: item.isPicked ? 'var(--success)' : 'var(--primary)',
                        transition: 'all 0.2s'
                      }}>
                        {item.totalQuantity}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '2px' }}>錠/包/本</span>
                    </div>

                    {item.isPicked ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => onResetPick(item.itemId)}
                        style={{ minHeight: '32px', padding: '0 0.75rem', fontSize: '0.8rem' }}
                      >
                        解除
                      </button>
                    ) : (
                      <span className="scan-required-badge">GS1待ち</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn-secondary flex-center gap-2"
          onClick={() => { void onExportInstruction(); }}
          disabled={totalCount === 0 || isImportingSystemResult}
          title="既存のピッキングシステムへ渡す指示CSV(棚番地・JAN・必要数量・ロット候補入り)を書き出します。店舗内利用限定です"
          style={{ minHeight: '38px', padding: '0 1.1rem' }}
          data-testid="picking-instruction-export"
        >
          <Download size={16} aria-hidden="true" />
          <span>指示CSV</span>
        </button>
        <label
          className="btn-secondary flex-center gap-2"
          title="ピッキングシステムが出力した結果CSV/TSVを取り込み、GS1照合・不足記録へ反映します"
          style={{ minHeight: '38px', padding: '0 1.1rem', cursor: totalCount === 0 || isImportingSystemResult ? 'not-allowed' : 'pointer', opacity: totalCount === 0 || isImportingSystemResult ? 0.55 : 1 }}
          data-testid="picking-result-import"
        >
          {isImportingSystemResult ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
          <span>{isImportingSystemResult ? '取込中...' : '結果取込'}</span>
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            style={{ display: 'none' }}
            disabled={totalCount === 0 || isImportingSystemResult}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              setIsImportingSystemResult(true);
              void onImportResultFile(file).finally(() => setIsImportingSystemResult(false));
            }}
          />
        </label>
        <button
          type="button"
          className="btn-secondary flex-center gap-2"
          onClick={() => { void onPrintReceipt(); }}
          disabled={totalCount === 0}
          title="レジロール紙(80mm)向けにピッキング結果を印刷します"
          style={{ minHeight: '38px', padding: '0 1.25rem' }}
        >
          <Printer size={16} aria-hidden="true" />
          <span>レジロール印刷</span>
        </button>
        <button className="btn-secondary" onClick={onClose} style={{ minHeight: '38px', padding: '0 1.5rem' }}>
          閉じる
        </button>
      </div>

      <style jsx>{`
        .picking-modal {
          width: 760px;
          max-width: 95%;
          background: rgba(255, 255, 255, 0.88);
          backdrop-filter: blur(25px);
          border: 1px solid rgba(255, 255, 255, 0.45);
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          padding: 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          border: none;
          outline: none;
        }

        .picking-modal::backdrop {
          background-color: rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(8px);
        }

        .gs1-scan-panel {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #ffffff;
          padding: 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .gs1-scan-panel.ok {
          border-color: rgba(21, 128, 61, 0.35);
          background: #f0fdf4;
        }

        .gs1-scan-panel.error {
          border-color: rgba(220, 38, 38, 0.35);
          background: #fef2f2;
        }

        .gs1-scan-panel label {
          font-size: 0.82rem;
          font-weight: 800;
          color: var(--text-main);
        }

        .gs1-scan-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 0.75rem;
          align-items: center;
        }

        .gs1-scan-row input {
          min-height: 40px;
          border: 1px solid var(--border-strong);
          border-radius: 6px;
          padding: 0 0.75rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.88rem;
        }

        .gs1-scan-row input:focus {
          outline: 2px solid var(--primary);
          outline-offset: 1px;
        }

        .gs1-scan-message {
          margin: 0;
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--text-main);
        }

        .picking-item-card:hover {
          border-color: var(--border-strong) !important;
          transform: translateY(-1px);
        }

        .picking-item-card.picked:hover {
          border-color: rgba(21, 128, 61, 0.5) !important;
          transform: none;
        }

        .gs1-code-line,
        .gs1-evidence-line,
        .gs1-pending-line {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.45rem;
          margin-top: 0.35rem;
          font-size: 0.74rem;
          line-height: 1.35;
        }

        .gs1-code-line {
          color: var(--text-ghost);
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }

        .gs1-evidence-line {
          color: var(--success);
          font-weight: 700;
        }

        .gs1-pending-line {
          color: #b45309;
          font-weight: 700;
        }

        .scan-required-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 28px;
          padding: 0 0.65rem;
          border-radius: 6px;
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fde68a;
          font-size: 0.76rem;
          font-weight: 800;
          white-space: nowrap;
        }

        .shortage-line {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.45rem;
          margin-top: 0.4rem;
          color: #c2410c;
          font-size: 0.78rem;
          font-weight: 800;
        }

        .shortage-inline-btn {
          min-height: 24px;
          border: 1px solid #fed7aa;
          border-radius: 5px;
          background: #fff7ed;
          color: #c2410c;
          font-size: 0.72rem;
          font-weight: 800;
          padding: 0 0.5rem;
          cursor: pointer;
        }

        .shortage-inline-btn:hover {
          border-color: #c2410c;
        }

        .shortage-inline-link {
          display: inline-flex;
          align-items: center;
          min-height: 24px;
          color: #9a3412;
          font-size: 0.72rem;
          font-weight: 800;
          text-decoration: underline;
          text-underline-offset: 2px;
          white-space: nowrap;
        }

        .shortage-inline-link:hover {
          color: #7c2d12;
        }

        .shortage-open-btn {
          margin-top: 0.4rem;
          min-height: 26px;
          border: 1px dashed var(--border-strong);
          border-radius: 6px;
          background: transparent;
          color: var(--text-muted);
          font-size: 0.74rem;
          font-weight: 800;
          padding: 0 0.6rem;
          cursor: pointer;
        }

        .shortage-open-btn:hover {
          border-color: #c2410c;
          color: #c2410c;
          background: #fff7ed;
        }

        .shortage-editor {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.45rem;
          padding: 0.5rem;
          border: 1px solid #fed7aa;
          border-radius: 8px;
          background: #fff7ed;
        }

        .shortage-editor label {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.76rem;
          font-weight: 800;
          color: #9a3412;
        }

        .shortage-editor input[type='number'] {
          width: 84px;
          min-height: 32px;
          border: 1px solid #fdba74;
          border-radius: 6px;
          padding: 0 0.5rem;
          font-size: 0.85rem;
          background: #ffffff;
        }

        .shortage-note-input {
          flex: 1 1 180px;
          min-width: 0;
          min-height: 32px;
          border: 1px solid #fdba74;
          border-radius: 6px;
          padding: 0 0.55rem;
          font-size: 0.8rem;
          background: #ffffff;
        }

        .shortage-editor-actions {
          display: inline-flex;
          gap: 0.4rem;
        }

        @media (max-width: 720px) {
          .picking-modal {
            width: 95%;
            padding: 1rem;
          }

          .gs1-scan-row {
            grid-template-columns: 1fr;
          }

          .picking-item-card {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </dialog>
  );
};
