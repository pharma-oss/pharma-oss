import type { Visit } from '@/db/types';
import { calculateDispensingFees, getTotalPoints, type ItemWithPrice } from './calculator';
import { isActivePatientAlert } from './patient_alerts';
import { validateDispensingClaim, type ClaimValidationItem } from './claim_validation';
import { buildClaimRiskSummary } from './claim_risk';
import { buildPrescriptionInputAudit, type PrescriptionInputAuditItem } from './prescription_input_audit';
import { choosePrimarySupplier, getInventoryOrderActionLabel, getInventoryOrderPriority } from './inventory_order';
import { CLAIM_LIFECYCLE_STATUS_LABELS, getClaimLifecycleStatus } from './claim_lifecycle';
import {
  formatClaimWorkbenchDate,
  formatClaimWorkbenchMonth,
  getClaimLifecycleLatestEvent,
  getClaimWorkbenchActionLabel,
  getClaimWorkbenchPriority,
  shouldIncludeInMonthlyClaimWorkbench,
  type ClaimWorkbenchStatus
} from './claim_workbench';
import { calculateRequiredStockAmount, getStockDrugId, getTotalStock } from './stock';
import { isDemoVisit } from './demo_data';

export interface DashboardTask {
  visitId: string;
  name: string;
  age: string;
  status: string;
  time: string;
  waitMinutes: number;
  prescriptionCount: number;
  unpickedCount: number;
  priority: 'high' | 'medium' | 'normal';
  reviewFlags: string[];
}

export interface DashboardCounts {
  todayReceptionCount: number;
  waitingCount: number;
  processingCount: number;
  reviewCount: number;
  completedCount: number;
  pickingPendingCount: number;
  inventoryShortageCount: number;
  claimRiskCount: number;
  urgentClaimRiskCount: number;
  claimWorkbenchCount: number;
  returnedClaimCount: number;
  rebillingClaimCount: number;
  followUpDueCount: number;
  urgentFollowUpCount: number;
}

export interface DashboardInventoryRisk {
  drugId: string;
  drugName: string;
  location: string;
  supplierName: string;
  requiredAmount: number;
  availableAmount: number;
  shortageAmount: number;
  recommendedOrderAmount: number;
  affectedVisitCount: number;
  affectedPatientNames: string[];
  priority: 'high' | 'medium';
  actionLabel: string;
  pickingShortageAmount?: number;
}

export interface DashboardClaimRisk {
  visitId: string;
  patientId: string;
  name: string;
  time: string;
  prescriptionCount: number;
  totalPoints: number;
  errorCount: number;
  warningCount: number;
  priority: 'high' | 'medium';
  riskScore: number;
  topIssueTitles: string[];
  actionLabel: string;
}

export interface DashboardClaimWorkItem {
  visitId: string;
  patientId: string;
  name: string;
  issueDateLabel: string;
  monthLabel: string;
  status: ClaimWorkbenchStatus;
  statusLabel: string;
  priority: 'high' | 'medium' | 'normal';
  priorityLabel: string;
  totalPoints: number;
  prescriptionCount: number;
  exportedFileName?: string;
  latestEventLabel: string;
  reason?: string;
  actionLabel: string;
}

export interface DashboardFollowUpCandidate {
  visitId: string;
  patientId: string;
  name: string;
  time: string;
  prescriptionCount: number;
  priority: 'high' | 'medium';
  reasonFlags: string[];
  dueDate: string;
  dueLabel: string;
  suggestedAction: string;
  riskScore: number;
  attemptCount: number;
  lastContactLabel?: string;
  isOverdue: boolean;
}

export type FollowUpContactOutcome = 'completed' | 'no_answer' | 'rescheduled' | 'dismissed';

export interface RecordFollowUpInput {
  contactMethod: 'phone' | 'sms' | 'visit' | 'other';
  outcome: FollowUpContactOutcome;
  completedNote: string;
  nextAction?: string;
  dueDate?: string;
}

export type CompleteFollowUpInput = Omit<RecordFollowUpInput, 'outcome'>;

export const EMPTY_COUNTS: DashboardCounts = {
  todayReceptionCount: 0,
  waitingCount: 0,
  processingCount: 0,
  reviewCount: 0,
  completedCount: 0,
  pickingPendingCount: 0,
  inventoryShortageCount: 0,
  claimRiskCount: 0,
  urgentClaimRiskCount: 0,
  claimWorkbenchCount: 0,
  returnedClaimCount: 0,
  rebillingClaimCount: 0,
  followUpDueCount: 0,
  urgentFollowUpCount: 0
};

export const NO_SUBSTITUTION_LABELS = new Set(['変更なし', '変更調剤なし']);

export const hasActualDispensedDrug = (value: unknown): boolean => {
  const text = String(value ?? '').trim();
  return !!text && !NO_SUBSTITUTION_LABELS.has(text);
};

export function isSameLocalDate(value: string, date: Date): boolean {
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return false;
  return (
    target.getFullYear() === date.getFullYear() &&
    target.getMonth() === date.getMonth() &&
    target.getDate() === date.getDate()
  );
}

export function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function parseDateForSort(value?: string): number {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function isBeforeLocalDate(value: string, date: Date): boolean {
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return false;
  const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const basisDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return targetDate.getTime() < basisDate.getTime();
}

export const FOLLOW_UP_METHOD_LABELS: Record<RecordFollowUpInput['contactMethod'], string> = {
  phone: '電話',
  sms: 'SMS/メッセージ',
  visit: '来局時',
  other: 'その他'
};

export const FOLLOW_UP_OUTCOME_LABELS: Record<FollowUpContactOutcome, string> = {
  completed: '対応済み',
  no_answer: '不在/未応答',
  rescheduled: '次回確認へ継続',
  dismissed: '対象外'
};

export function formatFollowUpContactLabel(
  attempt: NonNullable<NonNullable<Visit['followUp']>['contactAttempts']>[number]
): string {
  const date = new Date(attempt.at);
  const dateLabel = Number.isNaN(date.getTime())
    ? '日時不明'
    : `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${dateLabel} ${FOLLOW_UP_METHOD_LABELS[attempt.method]} ${FOLLOW_UP_OUTCOME_LABELS[attempt.outcome]}`;
}

export function calculatePatientAge(birthDate?: string, basisDate = new Date()): string {
  if (!birthDate || birthDate.length < 10) return '不明';
  const birthYear = parseInt(birthDate.substring(0, 4), 10);
  const birthMonth = parseInt(birthDate.substring(5, 7), 10);
  const birthDay = parseInt(birthDate.substring(8, 10), 10);

  if (isNaN(birthYear) || isNaN(birthMonth) || isNaN(birthDay)) return '不明';

  const currentYear = basisDate.getFullYear();
  const currentMonth = basisDate.getMonth() + 1;
  const currentDay = basisDate.getDate();

  let calculatedAge = currentYear - birthYear;
  if (currentMonth < birthMonth || (currentMonth === birthMonth && currentDay < birthDay)) {
    calculatedAge--;
  }
  return String(Math.max(0, calculatedAge));
}

export function buildFollowUpSuggestion({
  hasFollowUpMedicationRisk,
  hasLongTermPrescription,
  hasIntervention,
  hasPatientAlert,
  issueDate
}: {
  hasFollowUpMedicationRisk: boolean;
  hasLongTermPrescription: boolean;
  hasIntervention: boolean;
  hasPatientAlert: boolean;
  issueDate: Date;
}) {
  const riskScore =
    (hasFollowUpMedicationRisk ? 40 : 0) +
    (hasIntervention ? 30 : 0) +
    (hasPatientAlert ? 30 : 0) +
    (hasLongTermPrescription ? 15 : 0);
  const basisDate = Number.isNaN(issueDate.getTime()) ? new Date() : issueDate;
  const urgent = hasFollowUpMedicationRisk || hasIntervention || hasPatientAlert;

  if (hasPatientAlert) {
    return {
      dueDate: formatDateInput(basisDate),
      dueLabel: '本日対応',
      suggestedAction: 'アレルギー・副作用歴に関わる服薬状況を確認',
      priority: 'high' as const,
      riskScore
    };
  }

  if (hasIntervention) {
    return {
      dueDate: formatDateInput(basisDate),
      dueLabel: '本日対応',
      suggestedAction: '疑義照会後の変更点と患者理解を確認',
      priority: 'high' as const,
      riskScore
    };
  }

  if (hasFollowUpMedicationRisk) {
    return {
      dueDate: formatDateInput(basisDate),
      dueLabel: '本日対応',
      suggestedAction: '副作用・服薬状況・残薬を確認',
      priority: 'high' as const,
      riskScore
    };
  }

  return {
    dueDate: formatDateInput(addLocalDays(basisDate, 7)),
    dueLabel: urgent ? '本日対応' : '7日以内',
    suggestedAction: hasLongTermPrescription
      ? '長期処方の服薬継続・残薬・次回受診予定を確認'
      : '服薬状況と次回確認の要否を確認',
    priority: urgent ? ('high' as const) : ('medium' as const),
    riskScore
  };
}

export interface CalculateInventoryRisksParams {
  inventoryShortageData: Map<string, {
    requiredAmount: number;
    availableAmount: number;
    shortageAmount: number;
    pickingShortageAmount?: number;
  }>;
  drugMap: Map<string, any>;
  stocksByDrugId: Map<string, any[]>;
  requiredVisitIdsByStockDrugId: Map<string, Set<string>>;
  activeVisitById: Map<string, any>;
  patientMap: Map<string, any>;
}

export function calculateDashboardInventoryRisks({
  inventoryShortageData,
  drugMap,
  stocksByDrugId,
  requiredVisitIdsByStockDrugId,
  activeVisitById,
  patientMap
}: CalculateInventoryRisksParams): DashboardInventoryRisk[] {
  const inventoryRiskData: DashboardInventoryRisk[] = [];

  for (const [drugId, shortage] of inventoryShortageData.entries()) {
    const drug = drugMap.get(drugId);
    const stockLots = stocksByDrugId.get(drugId) || [];
    const visitIds = Array.from(requiredVisitIdsByStockDrugId.get(drugId) || []);
    const affectedPatientNames: string[] = [];
    const affectedPatientNameSet = new Set<string>();

    for (let i = 0; i < visitIds.length; i++) {
      const visit = activeVisitById.get(visitIds[i]);
      if (!visit) continue;
      const patientDoc = patientMap.get(visit.patientId);
      const patientName = patientDoc?.name || '患者名未登録';
      if (!affectedPatientNameSet.has(patientName)) {
        affectedPatientNameSet.add(patientName);
        affectedPatientNames.push(patientName);
      }
    }

    const isHighRiskMedication = !!(
      drug?.isHighRisk ||
      drug?.isNarcotic ||
      drug?.isPsychotropic ||
      drug?.isPoisonous
    );
    const priority = getInventoryOrderPriority({
      availableAmount: shortage.availableAmount,
      isHighRiskMedication,
      affectedVisitCount: visitIds.length,
      pickingShortageAmount: shortage.pickingShortageAmount
    });
    const actionLabel = getInventoryOrderActionLabel({
      availableAmount: shortage.availableAmount,
      isHighRiskMedication,
      pickingShortageAmount: shortage.pickingShortageAmount
    });

    inventoryRiskData.push({
      drugId,
      drugName: drug?.name || drugId,
      location: drug?.location || '棚位置未設定',
      supplierName: choosePrimarySupplier(stockLots),
      requiredAmount: shortage.requiredAmount,
      availableAmount: shortage.availableAmount,
      shortageAmount: shortage.shortageAmount,
      recommendedOrderAmount: shortage.shortageAmount,
      affectedVisitCount: visitIds.length,
      affectedPatientNames,
      priority,
      actionLabel,
      pickingShortageAmount: shortage.pickingShortageAmount
    });
  }

  inventoryRiskData.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
    return b.shortageAmount - a.shortageAmount;
  });

  return inventoryRiskData;
}

export interface CalculateClaimRisksParams {
  claimReadyVisits: any[];
  patientMap: Map<string, any>;
  itemsByVisitId: Map<string, any[]>;
  drugMap: Map<string, any>;
  settingsData: any;
  alertsByPatientId: Map<string, any[]>;
}

export function calculateDashboardClaimRisks({
  claimReadyVisits,
  patientMap,
  itemsByVisitId,
  drugMap,
  settingsData,
  alertsByPatientId
}: CalculateClaimRisksParams): {
  claimRisks: DashboardClaimRisk[];
  claimRiskCount: number;
  urgentClaimRiskCount: number;
} {
  let claimRiskCount = 0;
  let urgentClaimRiskCount = 0;
  const claimRiskData: (DashboardClaimRisk & { sortKey: number })[] = [];

  for (let i = 0; i < claimReadyVisits.length; i++) {
    const visit = claimReadyVisits[i];
    const patientDoc = patientMap.get(visit.patientId);
    const items = itemsByVisitId.get(visit.visitId) || [];
    const claimItems: Array<ClaimValidationItem & ItemWithPrice> = new Array(items.length);

    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      const prescribedDrug = drugMap.get(item.drugId);
      const dispensedDrug = item.dispensedDrugCode ? drugMap.get(item.dispensedDrugCode) : undefined;
      const billingDrug = dispensedDrug || prescribedDrug;
      claimItems[j] = {
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
        isIppoka: !!item.isIppoka,
        isCrushed: !!item.isCrushed,
        tokkanType: item.tokkanType || 'none',
        receiptRemark: item.receiptRemark,
        claimPreparation: item.claimPreparation !== false,
        claimManagement: item.claimManagement !== false,
        claimDrugFee: item.claimDrugFee !== false,
        isDiagnosticTest: !!item.isDiagnosticTest,
        isPicked: !!item.isPicked,
        drugName: prescribedDrug?.name || item.dispensedDrug || item.drugId,
        drugPrice: billingDrug?.price,
        yjCode: billingDrug?.yjCode,
        genericName: billingDrug?.genericName,
        isHighRisk: !!billingDrug?.isHighRisk
      };
    }

    let calculatedFees: ReturnType<typeof calculateDispensingFees> = [];
    let totalPoints = 0;
    if (settingsData && patientDoc && claimItems.length > 0) {
      try {
        calculatedFees = calculateDispensingFees(
          settingsData,
          claimItems,
          patientDoc,
          visit.issueDate,
          visit.claimOptions
        );
        totalPoints = getTotalPoints(calculatedFees);
      } catch (err) {
        console.error('Failed to calculate dashboard claim risk:', err);
      }
    }

    const claimValidationIssues = validateDispensingClaim({
      settings: settingsData || null,
      patient: patientDoc || null,
      items: claimItems,
      calculatedFees,
      claimOptions: visit.claimOptions,
      patientAlerts: alertsByPatientId.get(visit.patientId) || [],
      totalPoints
    });
    const claimSummary = buildClaimRiskSummary({
      issues: claimValidationIssues,
      totalPoints
    });
    if (!claimSummary) continue;

    claimRiskCount++;
    if (claimSummary.priority === 'high') {
      urgentClaimRiskCount++;
    }
    const issueDate = new Date(visit.issueDate);
    const time = Number.isNaN(issueDate.getTime())
      ? '--:--'
      : `${issueDate.getHours().toString().padStart(2, '0')}:${issueDate.getMinutes().toString().padStart(2, '0')}`;
    const visibleClaimIssues = claimValidationIssues.filter(
      (issue) => issue.severity === 'error' || issue.severity === 'warning'
    );

    claimRiskData.push({
      visitId: visit.visitId,
      patientId: visit.patientId,
      name: patientDoc ? patientDoc.name : '患者名未登録',
      time,
      prescriptionCount: items.length,
      totalPoints,
      errorCount: visibleClaimIssues.filter((issue) => issue.severity === 'error').length,
      warningCount: visibleClaimIssues.filter((issue) => issue.severity === 'warning').length,
      priority: claimSummary.priority,
      riskScore: claimSummary.riskScore,
      topIssueTitles: claimSummary.topIssueTitles,
      actionLabel: claimSummary.actionLabel,
      sortKey: Number.isNaN(issueDate.getTime()) ? 0 : issueDate.getTime()
    });
  }

  claimRiskData.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
    if (a.riskScore !== b.riskScore) return b.riskScore - a.riskScore;
    return b.sortKey - a.sortKey;
  });

  const claimRisks = claimRiskData.map((risk) => ({
    visitId: risk.visitId,
    patientId: risk.patientId,
    name: risk.name,
    time: risk.time,
    prescriptionCount: risk.prescriptionCount,
    totalPoints: risk.totalPoints,
    errorCount: risk.errorCount,
    warningCount: risk.warningCount,
    priority: risk.priority,
    riskScore: risk.riskScore,
    topIssueTitles: risk.topIssueTitles,
    actionLabel: risk.actionLabel
  }));

  return { claimRisks, claimRiskCount, urgentClaimRiskCount };
}

export interface CalculateClaimWorkItemsParams {
  monthlyClaimVisits: any[];
  patientMap: Map<string, any>;
  itemsByVisitId: Map<string, any[]>;
  basisDate?: Date;
}

export function calculateDashboardClaimWorkItems({
  monthlyClaimVisits,
  patientMap,
  itemsByVisitId,
  basisDate = new Date()
}: CalculateClaimWorkItemsParams): {
  claimWorkItems: DashboardClaimWorkItem[];
  returnedClaimCount: number;
  rebillingClaimCount: number;
} {
  let returnedClaimCount = 0;
  let rebillingClaimCount = 0;
  const claimPriorityRank = { high: 0, medium: 1, normal: 2 };
  const claimWorkData: (DashboardClaimWorkItem & { sortKey: number })[] = [];

  for (let i = 0; i < monthlyClaimVisits.length; i++) {
    const visit = monthlyClaimVisits[i];
    const lifecycle = visit.claimLifecycle;
    const status = getClaimLifecycleStatus(lifecycle);
    if (status !== 'exported' && status !== 'accepted' && status !== 'returned' && status !== 'rebilling') {
      continue;
    }

    if (status === 'returned') returnedClaimCount++;
    if (status === 'rebilling') rebillingClaimCount++;

    const latestEvent = getClaimLifecycleLatestEvent(lifecycle);
    const latestEventAt =
      latestEvent?.at ||
      lifecycle?.rebillingAt ||
      lifecycle?.returnedAt ||
      lifecycle?.acceptedAt ||
      lifecycle?.exportedAt ||
      visit.issueDate;
    const patientDoc = patientMap.get(visit.patientId);
    const items = itemsByVisitId.get(visit.visitId) || [];
    const priority = getClaimWorkbenchPriority({
      status,
      latestEventAt,
      basisDate
    });
    const reason = status === 'returned'
      ? lifecycle?.returnReason
      : status === 'rebilling'
        ? lifecycle?.rebillingReason
        : undefined;
    const latestLabel = latestEvent
      ? `${latestEvent.type === 'exported' ? 'UKE出力' : latestEvent.type === 'accepted' ? '受付済' : latestEvent.type === 'returned' ? '返戻登録' : latestEvent.type === 'rebilling' ? '再請求準備' : '請求完了'} ${formatClaimWorkbenchDate(latestEvent.at)}`
      : formatClaimWorkbenchDate(latestEventAt);

    claimWorkData.push({
      visitId: visit.visitId,
      patientId: visit.patientId,
      name: patientDoc ? patientDoc.name : '患者名未登録',
      issueDateLabel: formatClaimWorkbenchDate(visit.issueDate),
      monthLabel: formatClaimWorkbenchMonth(lifecycle?.exportedAt || visit.issueDate),
      status,
      statusLabel: CLAIM_LIFECYCLE_STATUS_LABELS[status],
      priority,
      priorityLabel: priority === 'high' ? '至急' : priority === 'medium' ? '注意' : '通常',
      totalPoints: lifecycle?.totalPoints || 0,
      prescriptionCount: items.length,
      exportedFileName: lifecycle?.exportedFileName,
      latestEventLabel: latestLabel,
      reason,
      actionLabel: getClaimWorkbenchActionLabel(status),
      sortKey: parseDateForSort(latestEventAt)
    });
  }

  claimWorkData.sort((a, b) => {
    const priorityDiff = claimPriorityRank[a.priority] - claimPriorityRank[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.sortKey - a.sortKey;
  });

  const claimWorkItems = claimWorkData.map((item) => ({
    visitId: item.visitId,
    patientId: item.patientId,
    name: item.name,
    issueDateLabel: item.issueDateLabel,
    monthLabel: item.monthLabel,
    status: item.status,
    statusLabel: item.statusLabel,
    priority: item.priority,
    priorityLabel: item.priorityLabel,
    totalPoints: item.totalPoints,
    prescriptionCount: item.prescriptionCount,
    exportedFileName: item.exportedFileName,
    latestEventLabel: item.latestEventLabel,
    reason: item.reason,
    actionLabel: item.actionLabel
  }));

  return { claimWorkItems, returnedClaimCount, rebillingClaimCount };
}

export interface CalculateFollowUpCandidatesParams {
  completedVisits: any[];
  itemsByVisitId: Map<string, any[]>;
  alertsByPatientId: Map<string, any[]>;
  drugMap: Map<string, any>;
  interventionVisitIds: Set<string>;
  patientMap: Map<string, any>;
  basisDate?: Date;
}

export function calculateDashboardFollowUpCandidates({
  completedVisits,
  itemsByVisitId,
  alertsByPatientId,
  drugMap,
  interventionVisitIds,
  patientMap,
  basisDate = new Date()
}: CalculateFollowUpCandidatesParams): {
  followUpCandidates: DashboardFollowUpCandidate[];
  followUpDueCount: number;
  urgentFollowUpCount: number;
} {
  let followUpDueCount = 0;
  let urgentFollowUpCount = 0;
  const followUpCandidateData: (DashboardFollowUpCandidate & { sortKey: number })[] = [];

  for (let i = 0; i < completedVisits.length; i++) {
    const visit = completedVisits[i];
    if (visit.followUp?.status === 'completed' || visit.followUp?.status === 'dismissed') {
      continue;
    }
    const items = itemsByVisitId.get(visit.visitId) || [];
    const patientAlertsForVisit = alertsByPatientId.get(visit.patientId) || [];
    let hasFollowUpMedicationRisk = false;
    let hasLongTermPrescription = false;

    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      const stockDrugId = item.dispensedDrugCode || item.drugId;
      const drug = drugMap.get(stockDrugId) || drugMap.get(item.drugId);
      if (
        drug?.isHighRisk ||
        drug?.isNarcotic ||
        drug?.isPsychotropic ||
        drug?.isPoisonous
      ) {
        hasFollowUpMedicationRisk = true;
      }
      if (Number(item.days) >= 28) {
        hasLongTermPrescription = true;
      }
      if (hasFollowUpMedicationRisk && hasLongTermPrescription) break;
    }

    const hasIntervention = interventionVisitIds.has(visit.visitId);
    const hasPatientAlert = patientAlertsForVisit.length > 0;
    const hasOpenFollowUp = visit.followUp?.status === 'open';

    if (
      hasFollowUpMedicationRisk ||
      hasLongTermPrescription ||
      hasIntervention ||
      hasPatientAlert ||
      hasOpenFollowUp
    ) {
      followUpDueCount++;
      const patientDoc = patientMap.get(visit.patientId);
      const issueDate = new Date(visit.issueDate);
      const time = Number.isNaN(issueDate.getTime())
        ? '--:--'
        : `${issueDate.getHours().toString().padStart(2, '0')}:${issueDate.getMinutes().toString().padStart(2, '0')}`;
      const reasonFlags: string[] = [];
      if (hasFollowUpMedicationRisk) reasonFlags.push('重点フォロー薬');
      if (hasLongTermPrescription) reasonFlags.push('長期処方');
      if (hasIntervention) reasonFlags.push('疑義照会あり');
      if (hasPatientAlert) reasonFlags.push('患者アラート');
      for (const flag of visit.followUp?.reasonFlags || []) {
        if (!reasonFlags.includes(flag)) reasonFlags.push(flag);
      }
      if (reasonFlags.length === 0) {
        reasonFlags.push('継続フォロー');
      }

      const suggestion = buildFollowUpSuggestion({
        hasFollowUpMedicationRisk,
        hasLongTermPrescription,
        hasIntervention,
        hasPatientAlert,
        issueDate
      });
      const savedAttempts = Array.isArray(visit.followUp?.contactAttempts)
        ? visit.followUp.contactAttempts
        : [];
      const lastAttempt = savedAttempts.at(-1);
      const dueDate = visit.followUp?.dueDate || suggestion.dueDate;
      const isOverdue = isBeforeLocalDate(dueDate, basisDate);
      const priority = isOverdue ? ('high' as const) : suggestion.priority;
      if (priority === 'high') {
        urgentFollowUpCount++;
      }

      followUpCandidateData.push({
        visitId: visit.visitId,
        patientId: visit.patientId,
        name: patientDoc ? patientDoc.name : '患者名未登録',
        time,
        prescriptionCount: items.length,
        priority,
        reasonFlags,
        dueDate,
        dueLabel: isOverdue ? '期限超過' : visit.followUp?.reminderAt ? '再確認予定' : suggestion.dueLabel,
        suggestedAction: visit.followUp?.nextAction || suggestion.suggestedAction,
        riskScore: Math.max(suggestion.riskScore, visit.followUp?.riskScore || 0),
        attemptCount: savedAttempts.length,
        lastContactLabel: lastAttempt ? formatFollowUpContactLabel(lastAttempt) : undefined,
        isOverdue,
        sortKey: Number.isNaN(issueDate.getTime()) ? 0 : issueDate.getTime()
      });
    }
  }

  followUpCandidateData.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
    return b.sortKey - a.sortKey;
  });

  const followUpCandidates = followUpCandidateData.map((candidate) => ({
    visitId: candidate.visitId,
    patientId: candidate.patientId,
    name: candidate.name,
    time: candidate.time,
    prescriptionCount: candidate.prescriptionCount,
    priority: candidate.priority,
    reasonFlags: candidate.reasonFlags,
    dueDate: candidate.dueDate,
    dueLabel: candidate.dueLabel,
    suggestedAction: candidate.suggestedAction,
    riskScore: candidate.riskScore,
    attemptCount: candidate.attemptCount,
    lastContactLabel: candidate.lastContactLabel,
    isOverdue: candidate.isOverdue
  }));

  return { followUpCandidates, followUpDueCount, urgentFollowUpCount };
}

export interface CalculateProcessingTasksParams {
  processingVisits: any[];
  patientMap: Map<string, any>;
  itemsByVisitId: Map<string, any[]>;
  drugMap: Map<string, any>;
  shortageDrugIds: Set<string>;
  alertsByPatientId: Map<string, any[]>;
  basisDate?: Date;
}

export function calculateDashboardProcessingTasks({
  processingVisits,
  patientMap,
  itemsByVisitId,
  drugMap,
  shortageDrugIds,
  alertsByPatientId,
  basisDate = new Date()
}: CalculateProcessingTasksParams): DashboardTask[] {
  const taskData: DashboardTask[] = new Array(processingVisits.length);

  for (let i = 0; i < processingVisits.length; i++) {
    const visit = processingVisits[i];
    const patientDoc = patientMap.get(visit.patientId);
    const age = calculatePatientAge(patientDoc?.birthDate, basisDate);

    const issueDate = new Date(visit.issueDate);
    const time = Number.isNaN(issueDate.getTime())
      ? '--:--'
      : `${issueDate.getHours().toString().padStart(2, '0')}:${issueDate.getMinutes().toString().padStart(2, '0')}`;
    const waitMinutes = Number.isNaN(issueDate.getTime())
      ? 0
      : Math.max(0, Math.floor((basisDate.getTime() - issueDate.getTime()) / 60000));

    const items = itemsByVisitId.get(visit.visitId) || [];
    let unpickedCount = 0;
    let highRiskCount = 0;
    let visitShortageCount = 0;
    const prescriptionAuditItems: PrescriptionInputAuditItem[] = new Array(items.length);

    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      const stockDrugId = item.dispensedDrugCode || item.drugId;
      const drug = drugMap.get(stockDrugId) || drugMap.get(item.drugId);
      const prescribedDrug = drugMap.get(item.drugId);
      const dispensedDrug = item.dispensedDrugCode ? drugMap.get(item.dispensedDrugCode) : undefined;
      const billingDrug = dispensedDrug || prescribedDrug || drug;
      const hasDispensed = hasActualDispensedDrug(item.dispensedDrug);

      if (!item.isDiagnosticTest && !item.isPicked) {
        unpickedCount++;
      }
      if (
        item.isIppoka ||
        item.isCrushed ||
        drug?.isHighRisk ||
        drug?.isNarcotic ||
        drug?.isPsychotropic ||
        drug?.isPoisonous
      ) {
        highRiskCount++;
      }
      if (shortageDrugIds.has(stockDrugId)) {
        visitShortageCount++;
      }

      prescriptionAuditItems[j] = {
        id: item.itemId,
        rpId: item.rpNumber ? `rp_${item.rpNumber}` : undefined,
        drugCode: item.drugId,
        drugName: prescribedDrug?.name || item.drugId,
        dispensedDrug: item.dispensedDrug,
        dispensedDrugCode: item.dispensedDrugCode,
        changeReason: item.changeReason,
        amount: item.amount,
        usage: item.usage,
        days: item.days,
        rpComment: item.rpComment,
        receiptRemark: item.receiptRemark,
        isIppoka: !!item.isIppoka,
        isCrushed: !!item.isCrushed,
        showReceiptRemark: !!item.receiptRemark,
        yjCode: prescribedDrug?.yjCode || billingDrug?.yjCode,
        genericName: prescribedDrug?.genericName || billingDrug?.genericName,
        isHighRisk: !!prescribedDrug?.isHighRisk,
        isAbolished: !!prescribedDrug?.isAbolished,
        stockQuantity: prescribedDrug?.stockQuantity,
        dispensedYjCode: hasDispensed ? (dispensedDrug?.yjCode || billingDrug?.yjCode) : undefined,
        dispensedGenericName: hasDispensed ? (dispensedDrug?.genericName || billingDrug?.genericName) : undefined,
        dispensedIsHighRisk: hasDispensed ? !!(dispensedDrug?.isHighRisk || billingDrug?.isHighRisk) : false,
        dispensedIsAbolished: hasDispensed ? !!(dispensedDrug?.isAbolished || billingDrug?.isAbolished) : false,
        dispensedStockQuantity: hasDispensed ? (dispensedDrug?.stockQuantity ?? billingDrug?.stockQuantity) : undefined
      };
    }

    const patientAlertsForVisit = alertsByPatientId.get(visit.patientId) || [];
    const prescriptionAudit = buildPrescriptionInputAudit(prescriptionAuditItems, {
      patientAlerts: patientAlertsForVisit
    });
    const patientAlertMatchCount = prescriptionAudit.issues.filter(
      (issue) => issue.code === 'patient_allergy_match' || issue.code === 'patient_side_effect_match'
    ).length;
    const reviewFlags = [];
    if (prescriptionAudit.errorCount > 0) reviewFlags.push(`要修正 ${prescriptionAudit.errorCount}`);
    if (prescriptionAudit.warningCount > 0) reviewFlags.push(`薬剤師確認 ${prescriptionAudit.warningCount}`);
    if (patientAlertMatchCount > 0) reviewFlags.push(`患者アラート ${patientAlertMatchCount}`);
    if (highRiskCount > 0) reviewFlags.push(`重点監査 ${highRiskCount}`);
    if (unpickedCount > 0) reviewFlags.push(`GS1未照合 ${unpickedCount}`);
    if (visitShortageCount > 0) reviewFlags.push(`在庫注意 ${visitShortageCount}`);
    if (waitMinutes >= 30) reviewFlags.push(`待ち ${waitMinutes}分`);

    const priority = prescriptionAudit.errorCount > 0 || patientAlertMatchCount > 0 || visitShortageCount > 0
      ? 'high'
      : prescriptionAudit.warningCount > 0 || highRiskCount > 0 || unpickedCount > 0 || waitMinutes >= 30
        ? 'medium'
        : 'normal';

    taskData[i] = {
      visitId: visit.visitId,
      name: patientDoc ? patientDoc.name : '患者名未登録',
      age,
      status: prescriptionAudit.errorCount > 0
        ? '要修正'
        : prescriptionAudit.warningCount > 0 || patientAlertMatchCount > 0
          ? '薬剤師確認'
          : priority === 'normal'
            ? '処方入力済み'
            : '監査待ち',
      time,
      waitMinutes,
      prescriptionCount: items.length,
      unpickedCount,
      priority,
      reviewFlags
    };
  }

  taskData.sort((a, b) => {
    const priorityRank = { high: 0, medium: 1, normal: 2 };
    const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.waitMinutes - a.waitMinutes;
  });

  return taskData;
}

export function buildFollowUpRecordPayload(params: {
  candidate: DashboardFollowUpCandidate;
  input: RecordFollowUpInput;
  currentUserName: string;
  previousVisit: Visit;
  nowIso?: string;
}) {
  const now = params.nowIso || new Date().toISOString();
  const existingFollowUp = params.previousVisit.followUp;
  const existingAttempts = Array.isArray(existingFollowUp?.contactAttempts)
    ? existingFollowUp.contactAttempts
    : [];
  const nextAction = params.input.nextAction?.trim() || params.candidate.suggestedAction;
  const dueDate = params.input.dueDate || params.candidate.dueDate;
  const completedNote = params.input.completedNote.trim();
  const nextStatus: NonNullable<Visit['followUp']>['status'] = params.input.outcome === 'completed'
    ? 'completed'
    : params.input.outcome === 'dismissed'
      ? 'dismissed'
      : 'open';

  const contactAttempt = {
    at: now,
    by: params.currentUserName,
    method: params.input.contactMethod,
    outcome: params.input.outcome,
    note: completedNote,
    nextAction,
    dueDate
  };

  const payload = {
    ...existingFollowUp,
    status: nextStatus,
    reasonFlags: params.candidate.reasonFlags,
    summary: `${params.candidate.name} / ${params.candidate.reasonFlags.join('・')}`,
    dueDate,
    contactMethod: params.input.contactMethod,
    nextAction,
    riskScore: params.candidate.riskScore,
    reminderAt: nextStatus === 'open' ? dueDate : existingFollowUp?.reminderAt,
    reminderReason: nextStatus === 'open' ? nextAction : existingFollowUp?.reminderReason,
    contactAttempts: [...existingAttempts, contactAttempt],
    completedAt: nextStatus === 'completed' ? now : existingFollowUp?.completedAt,
    completedBy: nextStatus === 'completed' ? params.currentUserName : existingFollowUp?.completedBy,
    completedNote: nextStatus === 'completed' ? completedNote : existingFollowUp?.completedNote,
    updatedAt: now
  };

  return {
    payload,
    nextStatus,
    dueDate,
    completedNote,
    contactAttempt
  };
}

export function classifyDashboardVisits(params: {
  allVisits: any[];
  basisDate: Date;
}) {
  let todayReceptionCount = 0;
  let waitingCount = 0;
  let completedCount = 0;
  const processingVisits: any[] = [];
  const activeVisits: any[] = [];
  const completedVisits = [] as any[];
  const monthlyClaimVisits: any[] = [];

  for (let i = 0; i < params.allVisits.length; i++) {
    const visit = params.allVisits[i];
    if (
      visit.status === 'completed' &&
      !isDemoVisit(visit) &&
      shouldIncludeInMonthlyClaimWorkbench({
        lifecycle: visit.claimLifecycle,
        issueDate: visit.issueDate,
        basisDate: params.basisDate
      })
    ) {
      monthlyClaimVisits.push(visit);
    }

    if (isSameLocalDate(visit.issueDate, params.basisDate)) {
      todayReceptionCount++;
      if (visit.status === 'waiting') {
        waitingCount++;
        activeVisits.push(visit);
      } else if (visit.status === 'processing') {
        processingVisits.push(visit);
        activeVisits.push(visit);
      } else if (visit.status === 'completed') {
        completedCount++;
        completedVisits.push(visit);
      }
    }
  }

  return {
    todayReceptionCount,
    waitingCount,
    completedCount,
    processingVisits,
    activeVisits,
    completedVisits,
    monthlyClaimVisits
  };
}

export function aggregatePrescriptionItemRequirements(params: {
  prescriptionItems: any[];
  activeVisitIdSet: Set<string>;
  processingVisitIds: Set<string>;
}) {
  const itemsByVisitId = new Map<string, any[]>();
  const drugIdSetForItems = new Set<string>();
  const requiredByStockDrugId = new Map<string, number>();
  const requiredVisitIdsByStockDrugId = new Map<string, Set<string>>();
  const pickingShortageByStockDrugId = new Map<string, number>();
  let pickingPendingCount = 0;

  for (let i = 0; i < params.prescriptionItems.length; i++) {
    const item = params.prescriptionItems[i];
    const list = itemsByVisitId.get(item.visitId) || [];
    list.push(item);
    itemsByVisitId.set(item.visitId, list);

    const stockDrugId = getStockDrugId(item);
    if (item.drugId) drugIdSetForItems.add(item.drugId);
    if (stockDrugId) drugIdSetForItems.add(stockDrugId);

    const requiredAmount = calculateRequiredStockAmount(item);
    if (params.activeVisitIdSet.has(item.visitId) && stockDrugId && requiredAmount > 0) {
      requiredByStockDrugId.set(
        stockDrugId,
        (requiredByStockDrugId.get(stockDrugId) || 0) + requiredAmount
      );
      const visitIds = requiredVisitIdsByStockDrugId.get(stockDrugId) || new Set<string>();
      visitIds.add(item.visitId);
      requiredVisitIdsByStockDrugId.set(stockDrugId, visitIds);
    }

    const shortageQuantity = item.shortageQuantity || 0;
    if (params.activeVisitIdSet.has(item.visitId) && stockDrugId && shortageQuantity > 0) {
      pickingShortageByStockDrugId.set(
        stockDrugId,
        (pickingShortageByStockDrugId.get(stockDrugId) || 0) + shortageQuantity
      );
      const visitIds = requiredVisitIdsByStockDrugId.get(stockDrugId) || new Set<string>();
      visitIds.add(item.visitId);
      requiredVisitIdsByStockDrugId.set(stockDrugId, visitIds);
    }

    if (
      params.processingVisitIds.has(item.visitId) &&
      !item.isDiagnosticTest &&
      !item.isPicked
    ) {
      pickingPendingCount++;
    }
  }

  return {
    itemsByVisitId,
    drugIdSetForItems,
    requiredByStockDrugId,
    requiredVisitIdsByStockDrugId,
    pickingShortageByStockDrugId,
    pickingPendingCount
  };
}

export function calculateDashboardStockShortages(params: {
  requiredByStockDrugId: Map<string, number>;
  pickingShortageByStockDrugId: Map<string, number>;
  drugMap: Map<string, any>;
  stocksByDrugId: Map<string, any[]>;
}) {
  let inventoryShortageCount = 0;
  const shortageDrugIds = new Set<string>();
  const inventoryShortageData = new Map<string, {
    requiredAmount: number;
    availableAmount: number;
    shortageAmount: number;
    pickingShortageAmount?: number;
  }>();

  for (const [drugId, requiredAmount] of params.requiredByStockDrugId.entries()) {
    const drug = params.drugMap.get(drugId);
    const stockLots = params.stocksByDrugId.get(drugId) || [];
    const availableAmount = stockLots.length > 0
      ? getTotalStock(stockLots)
      : drug?.stockQuantity || 0;
    if (requiredAmount > availableAmount) {
      shortageDrugIds.add(drugId);
      inventoryShortageCount++;
      inventoryShortageData.set(drugId, {
        requiredAmount,
        availableAmount,
        shortageAmount: requiredAmount - availableAmount
      });
    }
  }

  for (const [drugId, pickingShortageAmount] of params.pickingShortageByStockDrugId.entries()) {
    const existing = inventoryShortageData.get(drugId);
    if (existing) {
      existing.pickingShortageAmount = pickingShortageAmount;
      existing.shortageAmount = Math.max(existing.shortageAmount, pickingShortageAmount);
      continue;
    }
    const drug = params.drugMap.get(drugId);
    const stockLots = params.stocksByDrugId.get(drugId) || [];
    const availableAmount = stockLots.length > 0
      ? getTotalStock(stockLots)
      : drug?.stockQuantity || 0;
    shortageDrugIds.add(drugId);
    inventoryShortageCount++;
    inventoryShortageData.set(drugId, {
      requiredAmount: params.requiredByStockDrugId.get(drugId) || 0,
      availableAmount,
      shortageAmount: pickingShortageAmount,
      pickingShortageAmount
    });
  }

  return {
    shortageDrugIds,
    inventoryShortageCount,
    inventoryShortageData
  };
}
