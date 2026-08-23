'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Visit } from '@/db/types';
import { useDatabase } from '@/db/DatabaseProvider';
import { getCurrentUser, logAuditAction } from '@/lib/audit';
import { isActivePatientAlert } from '@/lib/patient_alerts';
import { buildOperationalKpis, type OperationalKpiSoapRecord, type OperationalKpis } from '@/lib/operational_kpi';
import { hasTutorialDemoData, isDemoVisit } from '@/lib/demo_data';
import {
  type DashboardTask,
  type DashboardCounts,
  type DashboardInventoryRisk,
  type DashboardClaimRisk,
  type DashboardClaimWorkItem,
  type DashboardFollowUpCandidate,
  type RecordFollowUpInput,
  type CompleteFollowUpInput,
  EMPTY_COUNTS,
  FOLLOW_UP_METHOD_LABELS,
  FOLLOW_UP_OUTCOME_LABELS,
  buildFollowUpRecordPayload,
  classifyDashboardVisits,
  aggregatePrescriptionItemRequirements,
  calculateDashboardStockShortages,
  calculateDashboardInventoryRisks,
  calculateDashboardClaimRisks,
  calculateDashboardClaimWorkItems,
  calculateDashboardFollowUpCandidates,
  calculateDashboardProcessingTasks
} from '@/lib/dashboard_tasks';

export type {
  DashboardTask,
  DashboardCounts,
  DashboardInventoryRisk,
  DashboardClaimRisk,
  DashboardClaimWorkItem,
  DashboardFollowUpCandidate,
  RecordFollowUpInput,
  CompleteFollowUpInput
};

const EMPTY_OPERATIONAL_KPIS: OperationalKpis = buildOperationalKpis({
  visits: [],
  soapRecords: [],
  counts: EMPTY_COUNTS
});

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
    const currentUser = getCurrentUser();
    const visitDoc = await db.visits.findOne(candidate.visitId).exec();
    if (!visitDoc) {
      throw new Error('Visit was not found.');
    }
    const previousVisit = visitDoc.toJSON() as Visit;
    const hadExistingFollowUp = Object.prototype.hasOwnProperty.call(previousVisit, 'followUp');
    const existingFollowUp = previousVisit.followUp;

    const { payload, dueDate, completedNote } = buildFollowUpRecordPayload({
      candidate,
      input,
      currentUserName: currentUser.name || '管理者',
      previousVisit
    });

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

        const {
          todayReceptionCount,
          waitingCount,
          completedCount,
          processingVisits,
          activeVisits,
          completedVisits,
          monthlyClaimVisits
        } = classifyDashboardVisits({
          allVisits,
          basisDate: today
        });

        const processingVisitIds = new Set<string>(processingVisits.map((v: any) => v.visitId));
        const activeVisitIdSet = new Set<string>(activeVisits.map((v: any) => v.visitId));
        const activeVisitById = new Map<string, any>(activeVisits.map((v: any) => [v.visitId, v]));
        const activeVisitIds = activeVisits.map((v: any) => v.visitId);
        const completedVisitIds = completedVisits.map((v: any) => v.visitId);
        const monthlyClaimVisitIds = monthlyClaimVisits.map((v: any) => v.visitId);

        const uniqueVisitIdsForItems = Array.from(new Set(
          activeVisitIds.concat(completedVisitIds, monthlyClaimVisitIds)
        ));

        const [interventionDocs, soapRecordDocs, prescriptionDocs] = await Promise.all([
          completedVisitIds.length > 0
            ? db.interventions.find({ selector: { visitId: { $in: completedVisitIds } } }).exec()
            : Promise.resolve([]),
          completedVisitIds.length > 0
            ? db.soap_records.find({ selector: { visitId: { $in: completedVisitIds } } }).exec()
            : Promise.resolve([]),
          uniqueVisitIdsForItems.length > 0
            ? db.prescription_items.find({ selector: { visitId: { $in: uniqueVisitIdsForItems } } }).exec()
            : Promise.resolve([])
        ]);

        const interventionVisitIds = new Set<string>(interventionDocs.map((d: any) => d.visitId));
        const prescriptionItems = prescriptionDocs.map((d: any) => typeof d.toJSON === 'function' ? d.toJSON() : d);

        const {
          itemsByVisitId,
          drugIdSetForItems,
          requiredByStockDrugId,
          requiredVisitIdsByStockDrugId,
          pickingShortageByStockDrugId,
          pickingPendingCount
        } = aggregatePrescriptionItemRequirements({
          prescriptionItems,
          activeVisitIdSet,
          processingVisitIds
        });

        const drugIdsForItems = Array.from(drugIdSetForItems);
        const drugMap = drugIdsForItems.length > 0
          ? await db.drugs.findByIds(drugIdsForItems).exec()
          : new Map();

        const stockDrugIdsForRequirements = Array.from(new Set([
          ...requiredByStockDrugId.keys(),
          ...pickingShortageByStockDrugId.keys()
        ]));
        const stockDocs = stockDrugIdsForRequirements.length > 0
          ? await db.drug_stocks.find({ selector: { drugCode: { $in: stockDrugIdsForRequirements } } }).exec()
          : [];
        const stocksByDrugId = new Map<string, any[]>();
        for (let i = 0; i < stockDocs.length; i++) {
          const stock = stockDocs[i];
          const list = stocksByDrugId.get(stock.drugCode) || [];
          list.push(stock);
          stocksByDrugId.set(stock.drugCode, list);
        }

        const {
          shortageDrugIds,
          inventoryShortageCount,
          inventoryShortageData
        } = calculateDashboardStockShortages({
          requiredByStockDrugId,
          pickingShortageByStockDrugId,
          drugMap,
          stocksByDrugId
        });

        const patientIdSet = new Set<string>();
        for (let i = 0; i < activeVisits.length; i++) patientIdSet.add(activeVisits[i].patientId);
        for (let i = 0; i < completedVisits.length; i++) patientIdSet.add(completedVisits[i].patientId);
        for (let i = 0; i < monthlyClaimVisits.length; i++) patientIdSet.add(monthlyClaimVisits[i].patientId);
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

        // 計算純粋関数群の呼び出し
        const visibleInventoryRisks = calculateDashboardInventoryRisks({
          inventoryShortageData,
          drugMap,
          stocksByDrugId,
          requiredVisitIdsByStockDrugId,
          activeVisitById,
          patientMap
        });

        const claimReadyVisits = processingVisits.concat(completedVisits);
        const { claimRisks, claimRiskCount, urgentClaimRiskCount } = calculateDashboardClaimRisks({
          claimReadyVisits,
          patientMap,
          itemsByVisitId,
          drugMap,
          settingsData,
          alertsByPatientId
        });

        const { claimWorkItems, returnedClaimCount, rebillingClaimCount } = calculateDashboardClaimWorkItems({
          monthlyClaimVisits,
          patientMap,
          itemsByVisitId,
          basisDate: today
        });

        const { followUpCandidates, followUpDueCount, urgentFollowUpCount } = calculateDashboardFollowUpCandidates({
          completedVisits,
          itemsByVisitId,
          alertsByPatientId,
          drugMap,
          interventionVisitIds,
          patientMap,
          basisDate: today
        });

        const taskData = calculateDashboardProcessingTasks({
          processingVisits,
          patientMap,
          itemsByVisitId,
          drugMap,
          shortageDrugIds,
          alertsByPatientId,
          basisDate: today
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
          claimWorkbenchCount: claimWorkItems.length,
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
        setClaimRisks(claimRisks);
        setClaimWorkItems(claimWorkItems);
        setFollowUpCandidates(followUpCandidates);
        setError(null);
      } catch (err) {
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
