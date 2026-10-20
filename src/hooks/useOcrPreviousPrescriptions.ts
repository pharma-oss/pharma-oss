import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import type { Visit, PrescriptionItem, PharmacyDatabase } from '@/db/types';
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

// RxDB のドキュメントのうち、前回処方の組み立てに使う項目だけを持つ形
export interface PreviousPrescriptionDrugDoc {
  name?: string;
  yjCode?: string;
  genericName?: string;
  isHighRisk?: boolean;
  isAbolished?: boolean;
  stockQuantity?: number;
}

export interface PreviousPrescriptionDrugLookup {
  get(drugId: string): PreviousPrescriptionDrugDoc | undefined;
}

// 新しい順に並べた直近 limit 件(日付が読めない受付は 0 = 最古として扱う)
export function selectRecentVisits(visits: Visit[], limit = 2): Visit[] {
  return [...visits]
    .sort((a, b) => getVisitSortTime(b) - getVisitSortTime(a))
    .slice(0, limit);
}

// 「前回Do」の元にする、最新の完了済み受付(完了していないものは対象外)
export function selectLatestCompletedVisit(visits: Visit[]): Visit | undefined {
  return visits
    .filter((visit) => visit.status === 'completed')
    .sort((a, b) => getVisitSortTime(b) - getVisitSortTime(a))[0];
}

// 処方薬・調剤薬(後発品変更後)の両方を、重複なく・空を除いて返す
export function collectReferencedDrugIds(
  items: ReadonlyArray<Pick<PrescriptionItem, 'drugId' | 'dispensedDrugCode'>>
): string[] {
  return Array.from(new Set(
    items
      .flatMap((item) => [item.drugId, item.dispensedDrugCode])
      .filter((drugId): drugId is string => !!drugId)
  ));
}

// 過去処方タイムライン比較用のスナップショット。
// 比較に使う YJ コード・一般名は、調剤薬(後発品変更後)があればそれを優先し、無ければ処方薬から取る。
export function buildPrescriptionHistorySnapshot(
  visit: Visit,
  items: PrescriptionItem[],
  drugs: PreviousPrescriptionDrugLookup
): PrescriptionHistorySnapshot {
  return {
    visitId: visit.visitId,
    dateLabel: formatVisitDateLabel(visit),
    institutionName: visit.institutionName,
    items: items.map((item, index): PrescriptionHistoryItem => {
      const prescribedDrugDoc = drugs.get(item.drugId);
      const dispensedDrugDoc = item.dispensedDrugCode ? drugs.get(item.dispensedDrugCode) : undefined;
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
  };
}

// 「前回Do」で処方入力へ複写する元データ。数量が読めない・0 の行は 1 として扱う。
export function buildPreviousDoSourceItems(
  items: PrescriptionItem[],
  drugs: PreviousPrescriptionDrugLookup
): PreviousDoSourceItem[] {
  return items.map((item) => {
    const prescribedDrugDoc = drugs.get(item.drugId);
    const dispensedDrugDoc = item.dispensedDrugCode ? drugs.get(item.dispensedDrugCode) : undefined;

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
}

interface UseOcrPreviousPrescriptionsOptions {
  db: PharmacyDatabase | null | undefined;
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
  const [hasPreviousPrescriptionsError, setHasPreviousPrescriptionsError] = useState(false);
  const [previousDoSnapshot, setPreviousDoSnapshot] = useState<PreviousDoSnapshot | null>(null);
  const [isLoadingPreviousDo, setIsLoadingPreviousDo] = useState(false);
  const [hasPreviousDoError, setHasPreviousDoError] = useState(false);

  // 過去2回分の処方履歴スナップショット取得
  useEffect(() => {
    let isMounted = true;
    const loadPreviousPrescription = async () => {
      if (!db || !selectedPatientId) {
        setPreviousPrescriptions([]);
        setIsLoadingPreviousPrescription(false);
        setHasPreviousPrescriptionsError(false);
        return;
      }

      setIsLoadingPreviousPrescription(true);
      setHasPreviousPrescriptionsError(false);
      try {
        const visitDocs = await db.visits.find({ selector: { patientId: selectedPatientId } }).exec();
        const historyVisits = selectRecentVisits(
          visitDocs.map((visitDoc) => visitDoc.toJSON() as Visit),
          2
        );

        if (historyVisits.length === 0) {
          if (isMounted) {
            setPreviousPrescriptions([]);
            setHasPreviousPrescriptionsError(false);
          }
          return;
        }

        const historyItemGroups = await Promise.all(historyVisits.map(async (visit: Visit) => {
          const itemDocs = await db.prescription_items.find({ selector: { visitId: visit.visitId } }).exec();
          return {
            visit,
            items: itemDocs.map((itemDoc) => itemDoc.toJSON() as PrescriptionItem)
          };
        }));
        const drugIds = collectReferencedDrugIds(historyItemGroups.flatMap((group) => group.items));
        const drugsMap = drugIds.length > 0
          ? await db.drugs.findByIds(drugIds).exec()
          : new Map();
        const snapshots = historyItemGroups.map(({ visit, items }) => (
          buildPrescriptionHistorySnapshot(visit, items, drugsMap)
        ));

        if (isMounted) {
          setPreviousPrescriptions(snapshots);
          setHasPreviousPrescriptionsError(false);
        }
      } catch (error) {
        console.error('Failed to load previous prescription:', error);
        if (isMounted) {
          setPreviousPrescriptions([]);
          setHasPreviousPrescriptionsError(true);
          toast.error('過去処方箋の読み込みに失敗しました。');
        }
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
        setHasPreviousDoError(false);
        return;
      }

      setIsLoadingPreviousDo(true);
      setHasPreviousDoError(false);
      try {
        const visitDocs = await db.visits.find({ selector: { patientId: selectedPatientId } }).exec();
        const latestCompletedVisit = selectLatestCompletedVisit(
          visitDocs.map((visitDoc) => visitDoc.toJSON() as Visit)
        );

        if (!latestCompletedVisit) {
          if (isMounted) {
            setPreviousDoSnapshot(null);
            setHasPreviousDoError(false);
          }
          return;
        }

        const itemDocs = await db.prescription_items.find({
          selector: { visitId: latestCompletedVisit.visitId }
        }).exec();
        const items = itemDocs.map((itemDoc) => itemDoc.toJSON() as PrescriptionItem);

        if (items.length === 0) {
          if (isMounted) {
            setPreviousDoSnapshot(null);
            setHasPreviousDoError(false);
          }
          return;
        }

        const drugIds = collectReferencedDrugIds(items);
        const drugsMap = drugIds.length > 0
          ? await db.drugs.findByIds(drugIds).exec()
          : new Map();

        const doItems = buildPreviousDoSourceItems(items, drugsMap);

        if (isMounted) {
          setPreviousDoSnapshot({
            visit: latestCompletedVisit,
            items: doItems
          });
          setHasPreviousDoError(false);
        }
      } catch (error) {
        console.error('Failed to load previous DO prescription:', error);
        if (isMounted) {
          setPreviousDoSnapshot(null);
          setHasPreviousDoError(true);
          toast.error('前回Do処方の読み込みに失敗しました。');
        }
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
    hasPreviousPrescriptionsError,
    setHasPreviousPrescriptionsError,
    previousDoSnapshot,
    setPreviousDoSnapshot,
    isLoadingPreviousDo,
    hasPreviousDoError,
    setHasPreviousDoError,
    previousPrescriptionTimeline
  };
}
