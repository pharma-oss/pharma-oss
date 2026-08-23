import { useState, useEffect, useMemo } from 'react';
import type { Visit, PrescriptionItem } from '@/db/types';
import { formatDrugDisplayName } from '@/lib/master-data/drug_display';
import { formatVisitDateLabel, getVisitSortTime } from '@/app/ocr/helpers';
import {
  comparePrescriptionHistoryTimeline,
  type PrescriptionHistorySnapshot,
  type PrescriptionHistoryItem,
  type PrescriptionHistoryTimelineEntry
} from '@/lib/prescription_history_compare';
import type { PreviousDoSourceItem, PreviousDoSnapshot } from '@/lib/previous_prescription_do';
import type { Prescription } from '@/app/ocr/types';

export type { PreviousDoSourceItem, PreviousDoSnapshot };

interface UseOcrPreviousPrescriptionsOptions {
  db: any;
  selectedPatientId: string | null;
  prescriptions: Prescription[];
}

export function useOcrPreviousPrescriptions({
  db,
  selectedPatientId,
  prescriptions
}: UseOcrPreviousPrescriptionsOptions) {
  const [previousPrescriptions, setPreviousPrescriptions] = useState<PrescriptionHistorySnapshot[]>([]);
  const [isLoadingPreviousPrescription, setIsLoadingPreviousPrescription] = useState(false);
  const [previousDoSnapshot, setPreviousDoSnapshot] = useState<PreviousDoSnapshot | null>(null);
  const [isLoadingPreviousDo, setIsLoadingPreviousDo] = useState(false);

  // 過去2回分の処方履歴スナップショット取得
  useEffect(() => {
    let isMounted = true;
    const loadPreviousPrescription = async () => {
      if (!db || !selectedPatientId) {
        setPreviousPrescriptions([]);
        setIsLoadingPreviousPrescription(false);
        return;
      }

      setIsLoadingPreviousPrescription(true);
      try {
        const visitDocs = await db.visits.find({ selector: { patientId: selectedPatientId } }).exec();
        const visits = visitDocs
          .map((visitDoc: any) => visitDoc.toJSON() as Visit)
          .sort((a: Visit, b: Visit) => getVisitSortTime(b) - getVisitSortTime(a));
        const historyVisits = visits.slice(0, 2);

        if (historyVisits.length === 0) {
          if (isMounted) setPreviousPrescriptions([]);
          return;
        }

        const historyItemGroups = await Promise.all(historyVisits.map(async (visit: Visit) => {
          const itemDocs = await db.prescription_items.find({ selector: { visitId: visit.visitId } }).exec();
          return {
            visit,
            items: itemDocs.map((itemDoc: any) => itemDoc.toJSON())
          };
        }));
        const drugIds = Array.from(new Set(
          historyItemGroups
            .flatMap((group: any) => group.items)
            .flatMap((item: any) => [item.drugId, item.dispensedDrugCode])
            .filter((drugId: any): drugId is string => !!drugId)
        ));
        const drugsMap = drugIds.length > 0
          ? await db.drugs.findByIds(drugIds).exec()
          : new Map();
        const snapshots: PrescriptionHistorySnapshot[] = historyItemGroups.map(({ visit, items }: any) => ({
          visitId: visit.visitId,
          dateLabel: formatVisitDateLabel(visit),
          institutionName: visit.institutionName,
          items: items.map((item: any, index: number): PrescriptionHistoryItem => {
            const prescribedDrugDoc = drugsMap.get(item.drugId);
            const dispensedDrugDoc = item.dispensedDrugCode ? drugsMap.get(item.dispensedDrugCode) : undefined;
            const comparisonDrugDoc = dispensedDrugDoc || prescribedDrugDoc;
            const prescribedName = prescribedDrugDoc?.name ? formatDrugDisplayName(prescribedDrugDoc.name) : item.drugId;
            const dispensedName = item.dispensedDrug || (dispensedDrugDoc?.name ? formatDrugDisplayName(dispensedDrugDoc.name) : '');

            return {
              id: item.itemId || `${visit.visitId}-${index}`,
              drugCode: item.drugId,
              drugName: prescribedName,
              dispensedDrug: dispensedName,
              amount: item.amount,
              usage: item.usage,
              days: item.days,
              yjCode: comparisonDrugDoc?.yjCode || prescribedDrugDoc?.yjCode || '',
              genericName: comparisonDrugDoc?.genericName || prescribedDrugDoc?.genericName || ''
            };
          })
        }));

        if (isMounted) {
          setPreviousPrescriptions(snapshots);
        }
      } catch (error) {
        console.error('Failed to load previous prescription:', error);
        if (isMounted) setPreviousPrescriptions([]);
      } finally {
        if (isMounted) setIsLoadingPreviousPrescription(false);
      }
    };

    loadPreviousPrescription();
    return () => { isMounted = false; };
  }, [db, selectedPatientId]);

  // 最新完了受付のDo処方スナップショット取得
  useEffect(() => {
    let isMounted = true;
    const loadPreviousDoSnapshot = async () => {
      if (!db || !selectedPatientId) {
        setPreviousDoSnapshot(null);
        setIsLoadingPreviousDo(false);
        return;
      }

      setIsLoadingPreviousDo(true);
      try {
        const visitDocs = await db.visits.find({ selector: { patientId: selectedPatientId } }).exec();
        const latestCompletedVisit = visitDocs
          .map((visitDoc: any) => visitDoc.toJSON() as Visit)
          .filter((visit: Visit) => visit.status === 'completed')
          .sort((a: Visit, b: Visit) => getVisitSortTime(b) - getVisitSortTime(a))[0];

        if (!latestCompletedVisit) {
          if (isMounted) setPreviousDoSnapshot(null);
          return;
        }

        const itemDocs = await db.prescription_items.find({
          selector: { visitId: latestCompletedVisit.visitId }
        }).exec();
        const items = itemDocs.map((itemDoc: any) => itemDoc.toJSON() as PrescriptionItem);

        if (items.length === 0) {
          if (isMounted) setPreviousDoSnapshot(null);
          return;
        }

        const drugIds = Array.from(new Set(
          items
            .flatMap((item: any) => [item.drugId, item.dispensedDrugCode])
            .filter((drugId: any): drugId is string => !!drugId)
        ));
        const drugsMap = drugIds.length > 0
          ? await db.drugs.findByIds(drugIds).exec()
          : new Map();

        const doItems: PreviousDoSourceItem[] = items.map((item: any) => {
          const prescribedDrugDoc = drugsMap.get(item.drugId);
          const dispensedDrugDoc = item.dispensedDrugCode ? drugsMap.get(item.dispensedDrugCode) : undefined;

          return {
            itemId: item.itemId,
            rpNumber: item.rpNumber,
            drugId: item.drugId,
            dispensedDrug: item.dispensedDrug,
            dispensedDrugCode: item.dispensedDrugCode,
            changeReason: item.changeReason,
            amount: Number(item.amount) || 1,
            usage: item.usage,
            days: item.days,
            rpComment: item.rpComment,
            isIppoka: item.isIppoka,
            isCrushed: item.isCrushed,
            tokkanType: item.tokkanType,
            receiptRemark: item.receiptRemark,
            billingAgentGroupKey: item.billingAgentGroupKey,
            billingAgentGroupReason: item.billingAgentGroupReason,
            prescribedDrugName: prescribedDrugDoc?.name ? formatDrugDisplayName(prescribedDrugDoc.name) : undefined,
            prescribedYjCode: prescribedDrugDoc?.yjCode || '',
            prescribedGenericName: prescribedDrugDoc?.genericName || '',
            prescribedIsHighRisk: !!prescribedDrugDoc?.isHighRisk,
            prescribedIsAbolished: !!prescribedDrugDoc?.isAbolished,
            prescribedStockQuantity: prescribedDrugDoc?.stockQuantity,
            dispensedDrugName: dispensedDrugDoc?.name ? formatDrugDisplayName(dispensedDrugDoc.name) : undefined,
            dispensedYjCode: dispensedDrugDoc?.yjCode || '',
            dispensedGenericName: dispensedDrugDoc?.genericName || '',
            dispensedIsHighRisk: !!dispensedDrugDoc?.isHighRisk,
            dispensedIsAbolished: !!dispensedDrugDoc?.isAbolished,
            dispensedStockQuantity: dispensedDrugDoc?.stockQuantity
          };
        });

        if (isMounted) {
          setPreviousDoSnapshot({
            visit: latestCompletedVisit,
            items: doItems
          });
        }
      } catch (error) {
        console.error('Failed to load previous DO prescription:', error);
        if (isMounted) setPreviousDoSnapshot(null);
      } finally {
        if (isMounted) setIsLoadingPreviousDo(false);
      }
    };

    loadPreviousDoSnapshot();
    return () => { isMounted = false; };
  }, [db, selectedPatientId]);

  const hasCurrentPrescriptionInput = useMemo(() => (
    prescriptions.some((prescription) => prescription.drugCode || prescription.drugName.trim())
  ), [prescriptions]);

  // 過去処方タイムライン比較
  const previousPrescriptionTimeline = useMemo<PrescriptionHistoryTimelineEntry[]>(() => {
    if (!hasCurrentPrescriptionInput || previousPrescriptions.length === 0) return [];
    return comparePrescriptionHistoryTimeline(prescriptions, previousPrescriptions);
  }, [hasCurrentPrescriptionInput, prescriptions, previousPrescriptions]);

  return {
    previousPrescriptions,
    setPreviousPrescriptions,
    isLoadingPreviousPrescription,
    previousDoSnapshot,
    setPreviousDoSnapshot,
    isLoadingPreviousDo,
    previousPrescriptionTimeline
  };
}
