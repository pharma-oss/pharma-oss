'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Visit } from '@/db/types';
import { useDatabase } from '@/db/DatabaseProvider';
import { getCurrentUser, logAuditAction } from '@/lib/audit';
import { calculateDispensingFees, getTotalPoints, type ItemWithPrice } from '@/lib/calculator';
import { isActivePatientAlert } from '@/lib/patient_alerts';
import { validateDispensingClaim, type ClaimValidationItem } from '@/lib/claim_validation';
import { buildClaimRiskSummary } from '@/lib/claim_risk';
import { buildPrescriptionInputAudit, type PrescriptionInputAuditItem } from '@/lib/prescription_input_audit';
import { calculateRequiredStockAmount, getStockDrugId, getTotalStock } from '@/lib/stock';
import { choosePrimarySupplier, getInventoryOrderActionLabel, getInventoryOrderPriority } from '@/lib/inventory_order';
import { CLAIM_LIFECYCLE_STATUS_LABELS, getClaimLifecycleStatus } from '@/lib/claim_lifecycle';
import { buildOperationalKpis, type OperationalKpiSoapRecord, type OperationalKpis } from '@/lib/operational_kpi';
import { hasTutorialDemoData, isDemoVisit } from '@/lib/demo_data';
import {
  formatClaimWorkbenchDate,
  formatClaimWorkbenchMonth,
  getClaimLifecycleLatestEvent,
  getClaimWorkbenchActionLabel,
  getClaimWorkbenchPriority,
  shouldIncludeInMonthlyClaimWorkbench,
  type ClaimWorkbenchStatus
} from '@/lib/claim_workbench';

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

const EMPTY_COUNTS: DashboardCounts = {
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

const EMPTY_OPERATIONAL_KPIS: OperationalKpis = buildOperationalKpis({
  visits: [],
  soapRecords: [],
  counts: EMPTY_COUNTS
});

function isSameLocalDate(value: string, date: Date): boolean {
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return false;
  return (
    target.getFullYear() === date.getFullYear() &&
    target.getMonth() === date.getMonth() &&
    target.getDate() === date.getDate()
  );
}

const NO_SUBSTITUTION_LABELS = new Set(['変更なし', '変更調剤なし']);

const hasActualDispensedDrug = (value: unknown) => {
  const text = String(value ?? '').trim();
  return !!text && !NO_SUBSTITUTION_LABELS.has(text);
};

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDateForSort(value?: string): number {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isBeforeLocalDate(value: string, date: Date): boolean {
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return false;
  const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const basisDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return targetDate.getTime() < basisDate.getTime();
}

const FOLLOW_UP_METHOD_LABELS: Record<RecordFollowUpInput['contactMethod'], string> = {
  phone: '電話',
  sms: 'SMS/メッセージ',
  visit: '来局時',
  other: 'その他'
};

const FOLLOW_UP_OUTCOME_LABELS: Record<FollowUpContactOutcome, string> = {
  completed: '対応済み',
  no_answer: '不在/未応答',
  rescheduled: '次回確認へ継続',
  dismissed: '対象外'
};

function formatFollowUpContactLabel(
  attempt: NonNullable<NonNullable<Visit['followUp']>['contactAttempts']>[number]
): string {
  const date = new Date(attempt.at);
  const dateLabel = Number.isNaN(date.getTime())
    ? '日時不明'
    : `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${dateLabel} ${FOLLOW_UP_METHOD_LABELS[attempt.method]} ${FOLLOW_UP_OUTCOME_LABELS[attempt.outcome]}`;
}

function buildFollowUpSuggestion({
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
    priority: urgent ? 'high' as const : 'medium' as const,
    riskScore
  };
}

export function useDashboardTasks() {
  const db = useDatabase();
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [counts, setCounts] = useState<DashboardCounts>(EMPTY_COUNTS);
  const [inventoryRisks, setInventoryRisks] = useState<DashboardInventoryRisk[]>([]);
  const [claimRisks, setClaimRisks] = useState<DashboardClaimRisk[]>([]);
  const [claimWorkItems, setClaimWorkItems] = useState<DashboardClaimWorkItem[]>([]);
  const [followUpCandidates, setFollowUpCandidates] = useState<DashboardFollowUpCandidate[]>([]);
  const [kpis, setKpis] = useState<OperationalKpis>(EMPTY_OPERATIONAL_KPIS);
  const [hasDemoData, setHasDemoData] = useState(false);
  const [refreshSeq, setRefreshSeq] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    setRefreshSeq((value) => value + 1);
  }, []);

  const recordFollowUpCandidate = useCallback(async (
    candidate: DashboardFollowUpCandidate,
    input: RecordFollowUpInput
  ) => {
    if (!db) {
      throw new Error('Database is not ready.');
    }
    const now = new Date().toISOString();
    const currentUser = getCurrentUser();
    const visitDoc = await db.visits.findOne(candidate.visitId).exec();
    if (!visitDoc) {
      throw new Error('Visit was not found.');
    }
    const previousVisit = visitDoc.toJSON() as Visit;
    const hadExistingFollowUp = Object.prototype.hasOwnProperty.call(previousVisit, 'followUp');
    const existingFollowUp = previousVisit.followUp;
    const existingAttempts = Array.isArray(existingFollowUp?.contactAttempts)
      ? existingFollowUp.contactAttempts
      : [];
    const nextAction = input.nextAction?.trim() || candidate.suggestedAction;
    const dueDate = input.dueDate || candidate.dueDate;
    const completedNote = input.completedNote.trim();
    const nextStatus: NonNullable<Visit['followUp']>['status'] = input.outcome === 'completed'
      ? 'completed'
      : input.outcome === 'dismissed'
        ? 'dismissed'
        : 'open';
    const contactAttempt = {
      at: now,
      by: currentUser.name,
      method: input.contactMethod,
      outcome: input.outcome,
      note: completedNote,
      nextAction,
      dueDate
    };
    const payload = {
      ...existingFollowUp,
      status: nextStatus,
      reasonFlags: candidate.reasonFlags,
      summary: `${candidate.name} / ${candidate.reasonFlags.join('・')}`,
      dueDate,
      contactMethod: input.contactMethod,
      nextAction,
      riskScore: candidate.riskScore,
      reminderAt: nextStatus === 'open' ? dueDate : existingFollowUp?.reminderAt,
      reminderReason: nextStatus === 'open' ? nextAction : existingFollowUp?.reminderReason,
      contactAttempts: [...existingAttempts, contactAttempt],
      completedAt: nextStatus === 'completed' ? now : existingFollowUp?.completedAt,
      completedBy: nextStatus === 'completed' ? currentUser.name : existingFollowUp?.completedBy,
      completedNote: nextStatus === 'completed' ? completedNote : existingFollowUp?.completedNote,
      updatedAt: now
    };

    await visitDoc.patch({ followUp: payload });
    const auditOk = await logAuditAction(
      db,
      'follow_up_record',
      `服薬フォロー記録: ${candidate.name} / ${FOLLOW_UP_METHOD_LABELS[input.contactMethod]} / ${FOLLOW_UP_OUTCOME_LABELS[input.outcome]} / 次回確認 ${dueDate || '未設定'} / 対応内容 ${completedNote}`,
      candidate.patientId,
      candidate.name
    );
    if (!auditOk) {
      await visitDoc.incrementalModify((rollbackVisit: Visit) => {
        if (hadExistingFollowUp) {
          rollbackVisit.followUp = existingFollowUp;
        } else {
          delete rollbackVisit.followUp;
        }
        return rollbackVisit;
      });
      throw new Error('服薬フォロー記録の監査ログ記録に失敗したため、変更を元に戻しました。');
    }
    setRefreshSeq((value) => value + 1);
  }, [db]);

  const completeFollowUpCandidate = useCallback(async (
    candidate: DashboardFollowUpCandidate,
    input?: CompleteFollowUpInput
  ) => {
    await recordFollowUpCandidate(candidate, {
      contactMethod: input?.contactMethod || 'other',
      outcome: 'completed',
      completedNote: input?.completedNote?.trim() || 'ダッシュボードで対応済みにしました。',
      nextAction: input?.nextAction,
      dueDate: input?.dueDate
    });
  }, [recordFollowUpCandidate]);

  useEffect(() => {
    async function loadTasks() {
      if (!db) {
        setCounts(EMPTY_COUNTS);
        setInventoryRisks([]);
        setClaimRisks([]);
        setClaimWorkItems([]);
        setFollowUpCandidates([]);
        setKpis(EMPTY_OPERATIONAL_KPIS);
        setHasDemoData(false);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setHasDemoData(await hasTutorialDemoData(db));
        const allVisits = await db.visits.find({
          selector: {
            status: { $in: ['waiting', 'processing', 'completed'] }
          }
        }).exec();
        const today = new Date();
        let todayReceptionCount = 0;
        let waitingCount = 0;
        let completedCount = 0;
        const processingVisits = [];
        const activeVisits = [];
        const completedVisits = [];
        const monthlyClaimVisits = [];

        for (let i = 0; i < allVisits.length; i++) {
          const visit = allVisits[i];
          if (
            visit.status === 'completed' &&
            // チュートリアルのデモ受付は練習用のため、月次請求(UKE)の対象に載せない
            !isDemoVisit(visit) &&
            shouldIncludeInMonthlyClaimWorkbench({
              lifecycle: visit.claimLifecycle,
              issueDate: visit.issueDate,
              basisDate: today
            })
          ) {
            monthlyClaimVisits.push(visit);
          }

          if (isSameLocalDate(visit.issueDate, today)) {
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

        const processingVisitIds = new Set<string>();
        for (let i = 0; i < processingVisits.length; i++) {
          processingVisitIds.add(processingVisits[i].visitId);
        }

        const activeVisitIdSet = new Set<string>();
        const activeVisitById = new Map<string, any>();
        const activeVisitIds = [];
        for (let i = 0; i < activeVisits.length; i++) {
          const visitId = activeVisits[i].visitId;
          activeVisitIds.push(visitId);
          activeVisitIdSet.add(visitId);
          activeVisitById.set(visitId, activeVisits[i]);
        }

        const completedVisitIds = [];
        for (let i = 0; i < completedVisits.length; i++) {
          completedVisitIds.push(completedVisits[i].visitId);
        }

        const monthlyClaimVisitIds = [];
        for (let i = 0; i < monthlyClaimVisits.length; i++) {
          monthlyClaimVisitIds.push(monthlyClaimVisits[i].visitId);
        }

        const visitIdsForItems = activeVisitIds.concat(completedVisitIds, monthlyClaimVisitIds);
        const uniqueVisitIdsForItems = Array.from(new Set(visitIdsForItems));

        const [interventionDocs, soapRecordDocs] = await Promise.all([
          completedVisitIds.length > 0
            ? db.interventions.find({
              selector: { visitId: { $in: completedVisitIds } }
            }).exec()
            : Promise.resolve([]),
          completedVisitIds.length > 0
            ? db.soap_records.find({
              selector: { visitId: { $in: completedVisitIds } }
            }).exec()
            : Promise.resolve([])
        ]);
        const interventionVisitIds = new Set<string>();
        for (let i = 0; i < interventionDocs.length; i++) {
          interventionVisitIds.add(interventionDocs[i].visitId);
        }

        const prescriptionItems = uniqueVisitIdsForItems.length > 0
          ? await db.prescription_items.find({
            selector: { visitId: { $in: uniqueVisitIdsForItems } }
          }).exec()
          : [];

        const itemsByVisitId = new Map<string, any[]>();
        const drugIdSetForItems = new Set<string>();
        const requiredByStockDrugId = new Map<string, number>();
        const requiredVisitIdsByStockDrugId = new Map<string, Set<string>>();
        // ピッキング時に現場で記録された棚不足(現物ベース)の合計
        const pickingShortageByStockDrugId = new Map<string, number>();
        let pickingPendingCount = 0;

        for (let i = 0; i < prescriptionItems.length; i++) {
          const item = prescriptionItems[i];
          const list = itemsByVisitId.get(item.visitId) || [];
          list.push(item);
          itemsByVisitId.set(item.visitId, list);

          const stockDrugId = getStockDrugId(item);
          if (item.drugId) drugIdSetForItems.add(item.drugId);
          if (stockDrugId) drugIdSetForItems.add(stockDrugId);

          const requiredAmount = calculateRequiredStockAmount(item);
          if (activeVisitIdSet.has(item.visitId) && stockDrugId && requiredAmount > 0) {
            requiredByStockDrugId.set(
              stockDrugId,
              (requiredByStockDrugId.get(stockDrugId) || 0) + requiredAmount
            );
            const visitIds = requiredVisitIdsByStockDrugId.get(stockDrugId) || new Set<string>();
            visitIds.add(item.visitId);
            requiredVisitIdsByStockDrugId.set(stockDrugId, visitIds);
          }

          const shortageQuantity = item.shortageQuantity || 0;
          if (activeVisitIdSet.has(item.visitId) && stockDrugId && shortageQuantity > 0) {
            pickingShortageByStockDrugId.set(
              stockDrugId,
              (pickingShortageByStockDrugId.get(stockDrugId) || 0) + shortageQuantity
            );
            const visitIds = requiredVisitIdsByStockDrugId.get(stockDrugId) || new Set<string>();
            visitIds.add(item.visitId);
            requiredVisitIdsByStockDrugId.set(stockDrugId, visitIds);
          }

          if (
            processingVisitIds.has(item.visitId) &&
            !item.isDiagnosticTest &&
            !item.isPicked
          ) {
            pickingPendingCount++;
          }
        }

        const drugIdsForItems = Array.from(drugIdSetForItems);
        const drugMap = drugIdsForItems.length > 0
          ? await db.drugs.findByIds(drugIdsForItems).exec()
          : new Map();

        const stockDrugIdsForRequirements = Array.from(new Set([
          ...requiredByStockDrugId.keys(),
          ...pickingShortageByStockDrugId.keys()
        ]));
        const stockDocs = stockDrugIdsForRequirements.length > 0
          ? await db.drug_stocks.find({
            selector: { drugCode: { $in: stockDrugIdsForRequirements } }
          }).exec()
          : [];
        const stocksByDrugId = new Map<string, any[]>();
        for (let i = 0; i < stockDocs.length; i++) {
          const stock = stockDocs[i];
          const list = stocksByDrugId.get(stock.drugCode) || [];
          list.push(stock);
          stocksByDrugId.set(stock.drugCode, list);
        }

        let inventoryShortageCount = 0;
        const shortageDrugIds = new Set<string>();
        const inventoryShortageData = new Map<string, {
          requiredAmount: number;
          availableAmount: number;
          shortageAmount: number;
          pickingShortageAmount?: number;
        }>();
        for (const [drugId, requiredAmount] of requiredByStockDrugId.entries()) {
          const drug = drugMap.get(drugId);
          const stockLots = stocksByDrugId.get(drugId) || [];
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

        // 現場で記録された棚不足は、システム在庫上は足りて見えても発注候補に載せる
        for (const [drugId, pickingShortageAmount] of pickingShortageByStockDrugId.entries()) {
          const existing = inventoryShortageData.get(drugId);
          if (existing) {
            existing.pickingShortageAmount = pickingShortageAmount;
            existing.shortageAmount = Math.max(existing.shortageAmount, pickingShortageAmount);
            continue;
          }
          const drug = drugMap.get(drugId);
          const stockLots = stocksByDrugId.get(drugId) || [];
          const availableAmount = stockLots.length > 0
            ? getTotalStock(stockLots)
            : drug?.stockQuantity || 0;
          shortageDrugIds.add(drugId);
          inventoryShortageCount++;
          inventoryShortageData.set(drugId, {
            requiredAmount: requiredByStockDrugId.get(drugId) || 0,
            availableAmount,
            shortageAmount: pickingShortageAmount,
            pickingShortageAmount
          });
        }

        // Optimize: Fetch all patients in one query to avoid N+1 problem
        // ⚡ Bolt: Use findByIds for primary key lookups instead of $in query.
        // ⚡ Bolt: Use a manual for loop instead of .map() to avoid intermediate array allocations
        // and reduce garbage collection pressure.
        const patientIdSet = new Set<string>();
        for (let i = 0; i < activeVisits.length; i++) {
          patientIdSet.add(activeVisits[i].patientId);
        }
        for (let i = 0; i < completedVisits.length; i++) {
          patientIdSet.add(completedVisits[i].patientId);
        }
        for (let i = 0; i < monthlyClaimVisits.length; i++) {
          patientIdSet.add(monthlyClaimVisits[i].patientId);
        }
        const patientIds = Array.from(patientIdSet);
        const patientMap = await db.patients.findByIds(patientIds).exec();
        const patientAlerts = patientIds.length > 0
          ? await db.alerts.find({ selector: { patientId: { $in: patientIds } } }).exec()
          : [];
        const alertsByPatientId = new Map<string, any[]>();
        for (let i = 0; i < patientAlerts.length; i++) {
          const alert = patientAlerts[i];
          if (!isActivePatientAlert(alert)) continue;
          const list = alertsByPatientId.get(alert.patientId) || [];
          list.push(alert);
          alertsByPatientId.set(alert.patientId, list);
        }
        const settingsDoc = await db.facility_settings.findOne('default').exec();
        const settingsData = settingsDoc && typeof settingsDoc.toJSON === 'function'
          ? settingsDoc.toJSON()
          : settingsDoc;

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
        const visibleInventoryRisks: DashboardInventoryRisk[] = inventoryRiskData.map((risk) => ({
          drugId: risk.drugId,
          drugName: risk.drugName,
          location: risk.location,
          supplierName: risk.supplierName,
          requiredAmount: risk.requiredAmount,
          availableAmount: risk.availableAmount,
          shortageAmount: risk.shortageAmount,
          recommendedOrderAmount: risk.recommendedOrderAmount,
          affectedVisitCount: risk.affectedVisitCount,
          affectedPatientNames: risk.affectedPatientNames,
          priority: risk.priority,
          actionLabel: risk.actionLabel,
          pickingShortageAmount: risk.pickingShortageAmount
        }));

        let claimRiskCount = 0;
        let urgentClaimRiskCount = 0;
        const claimRiskData: (DashboardClaimRisk & { sortKey: number })[] = [];
        const claimReadyVisits = processingVisits.concat(completedVisits);
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
          const visibleClaimIssues = claimValidationIssues.filter((issue) => (
            issue.severity === 'error' || issue.severity === 'warning'
          ));
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
        const visibleClaimRisks: DashboardClaimRisk[] = claimRiskData.map((risk) => ({
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
          const latestEventAt = latestEvent?.at || lifecycle?.rebillingAt || lifecycle?.returnedAt || lifecycle?.acceptedAt || lifecycle?.exportedAt || visit.issueDate;
          const patientDoc = patientMap.get(visit.patientId);
          const items = itemsByVisitId.get(visit.visitId) || [];
          const priority = getClaimWorkbenchPriority({
            status,
            latestEventAt,
            basisDate: today
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
        const visibleClaimWorkItems: DashboardClaimWorkItem[] = claimWorkData.map((item) => ({
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
            const stockDrugId = getStockDrugId(item);
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
            const isOverdue = isBeforeLocalDate(dueDate, today);
            const priority = isOverdue ? 'high' as const : suggestion.priority;
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
        const visibleFollowUpCandidates: DashboardFollowUpCandidate[] = followUpCandidateData.map((candidate) => ({
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

        const nowDate = new Date();
        const currentYear = nowDate.getFullYear();
        const currentMonth = nowDate.getMonth() + 1;
        const currentDay = nowDate.getDate();

        // ⚡ Bolt: Avoid calling .toJSON() on RxDocuments inside loops.
        // .toJSON() creates a deep clone of the entire document, which causes massive unnecessary
        // object allocations and GC pauses. Direct property access is much faster.
        // ⚡ Bolt: Preallocate taskData array and populate using a for loop rather than .map()
        // to completely eliminate closure allocations.
        const taskData: DashboardTask[] = new Array(processingVisits.length);
        for (let i = 0; i < processingVisits.length; i++) {
          const visit = processingVisits[i];
          const patientDoc = patientMap.get(visit.patientId);

          // Calculate age if birthDate exists
          let age = '不明';
          if (patientDoc && patientDoc.birthDate) {
            // ⚡ Bolt: Optimize age calculation by avoiding expensive Date object instantiations inside loops.
            // Manually parse YYYY-MM-DD strings for a significant performance boost during array mapping.
            const birthYear = parseInt(patientDoc.birthDate.substring(0, 4), 10);
            const birthMonth = parseInt(patientDoc.birthDate.substring(5, 7), 10);
            const birthDay = parseInt(patientDoc.birthDate.substring(8, 10), 10);

            let calculatedAge = currentYear - birthYear;
            if (currentMonth < birthMonth || (currentMonth === birthMonth && currentDay < birthDay)) {
              calculatedAge--;
            }
            age = String(calculatedAge);
          }

          // Format time
          const issueDate = new Date(visit.issueDate);
          const time = `${issueDate.getHours().toString().padStart(2, '0')}:${issueDate.getMinutes().toString().padStart(2, '0')}`;
          const waitMinutes = Number.isNaN(issueDate.getTime())
            ? 0
            : Math.max(0, Math.floor((nowDate.getTime() - issueDate.getTime()) / 60000));

          const items = itemsByVisitId.get(visit.visitId) || [];
          let unpickedCount = 0;
          let highRiskCount = 0;
          let visitShortageCount = 0;
          const prescriptionAuditItems: PrescriptionInputAuditItem[] = new Array(items.length);
          for (let j = 0; j < items.length; j++) {
            const item = items[j];
            const stockDrugId = getStockDrugId(item);
            const drug = drugMap.get(stockDrugId) || drugMap.get(item.drugId);
            const prescribedDrug = drugMap.get(item.drugId);
            const dispensedDrug = item.dispensedDrugCode ? drugMap.get(item.dispensedDrugCode) : undefined;
            const billingDrug = dispensedDrug || prescribedDrug || drug;
            const hasDispensedDrug = hasActualDispensedDrug(item.dispensedDrug);
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
              dispensedYjCode: hasDispensedDrug ? (dispensedDrug?.yjCode || billingDrug?.yjCode) : undefined,
              dispensedGenericName: hasDispensedDrug ? (dispensedDrug?.genericName || billingDrug?.genericName) : undefined,
              dispensedIsHighRisk: hasDispensedDrug ? !!(dispensedDrug?.isHighRisk || billingDrug?.isHighRisk) : false,
              dispensedIsAbolished: hasDispensedDrug ? !!(dispensedDrug?.isAbolished || billingDrug?.isAbolished) : false,
              dispensedStockQuantity: hasDispensedDrug ? (dispensedDrug?.stockQuantity ?? billingDrug?.stockQuantity) : undefined
            };
          }

          const patientAlertsForVisit = alertsByPatientId.get(visit.patientId) || [];
          const prescriptionAudit = buildPrescriptionInputAudit(prescriptionAuditItems, {
            patientAlerts: patientAlertsForVisit
          });
          const patientAlertMatchCount = prescriptionAudit.issues.filter((issue) => (
            issue.code === 'patient_allergy_match' || issue.code === 'patient_side_effect_match'
          )).length;
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
        const nextCounts: DashboardCounts = {
          todayReceptionCount,
          waitingCount,
          processingCount: processingVisits.length,
          reviewCount: taskData.filter((task) => task.priority !== 'normal').length,
          completedCount,
          pickingPendingCount,
          inventoryShortageCount,
          claimRiskCount,
          urgentClaimRiskCount,
          claimWorkbenchCount: visibleClaimWorkItems.length,
          returnedClaimCount,
          rebillingClaimCount,
          followUpDueCount,
          urgentFollowUpCount
        };
        const nextKpis = buildOperationalKpis({
          visits: allVisits as unknown as Visit[],
          soapRecords: soapRecordDocs as unknown as OperationalKpiSoapRecord[],
          counts: nextCounts,
          basisDate: today
        });

        setTasks(taskData);
        setCounts(nextCounts);
        setKpis(nextKpis);
        setInventoryRisks(visibleInventoryRisks);
        setClaimRisks(visibleClaimRisks);
        setClaimWorkItems(visibleClaimWorkItems);
        setFollowUpCandidates(visibleFollowUpCandidates);
        setError(null);
      } catch (err) {
        // 🛡️ Sentinel: Do not leak raw error objects to the UI, but log for debugging
        console.error('Failed to load tasks securely:', err);
        setError(err instanceof Error ? err : new Error('Unknown error occurred'));
        setKpis(EMPTY_OPERATIONAL_KPIS);
      } finally {
        setIsLoading(false);
      }
    }

    loadTasks();
  }, [db, refreshSeq]);

  return {
    tasks,
    counts,
    kpis,
    inventoryRisks,
    claimRisks,
    claimWorkItems,
    followUpCandidates,
    completeFollowUpCandidate,
    recordFollowUpCandidate,
    hasDemoData,
    refresh,
    isLoading,
    error
  };
}
