import { useState, useCallback } from 'react';
import type { RxDocument } from 'rxdb';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import type { Intervention, PharmacyDatabase, Visit } from '@/db/types';
import { getCurrentUser, logAuditAction } from '@/lib/audit';
import { isClaimEditBlocked, getClaimEditBlockedMessage } from '@/lib/claim_edit_guard';
import {
  buildInterventionAuditDetail,
  buildInterventionEvent,
  buildInterventionRecord,
  deleteInterventionWithAudit,
  recordInterventionWithAudit,
  resolveInterventionCategory,
  type InterventionAuditFn,
  type InterventionCategory,
  type InterventionInput,
  type InterventionStoreDb,
  type InterventionVisitHandle
} from '@/lib/prescription_intervention_support';
import { userFacingErrorMessage } from '@/lib/user_facing_error';

export type InterventionItem = Intervention & { id?: string; category?: InterventionCategory | string };

export function mergeInterventionCategories(
  records: Intervention[],
  events?: Visit['interventionEvents']
): InterventionItem[] {
  if (!events || events.length === 0) {
    return records.map((r) => ({ ...r }));
  }
  const categoryByEventId = new Map(events.map((ev) => [ev.eventId, ev.category]));
  return records.map((record) => {
    const category = categoryByEventId.get(record.interventionId);
    return category ? { ...record, category } : { ...record };
  });
}

export type EmrInterventionVisitHandle = InterventionVisitHandle & Pick<Visit, 'visitId' | 'claimLifecycle'>;

export interface ExecuteAddEmrInterventionParams {
  db: InterventionStoreDb | null | undefined;
  findActiveVisit: () => Promise<EmrInterventionVisitHandle | null>;
  input: InterventionInput;
  appendIntervention: (record: InterventionItem) => void;
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
  logAudit: InterventionAuditFn;
  recordIntervention?: typeof recordInterventionWithAudit;
  now?: string;
  interventionId?: string;
  currentUserName?: string;
}

export const INTERVENTION_DB_NOT_READY_MESSAGE = 'データベースの準備ができていません。しばらくしてから再度お試しください。';
export const INTERVENTION_ACTIVE_VISIT_NOT_FOUND_MESSAGE = '処理中の受付が見つかりません';

/**
 * 疑義照会・処方変更を記録し、成否を boolean で返す。
 * 保存失敗・請求ロック・DB/来局未取得のいずれでも false を返し、モーダルを閉じない根拠にする。
 */
export async function executeAddEmrIntervention({
  db,
  findActiveVisit,
  input,
  appendIntervention,
  notifySuccess,
  notifyError,
  logAudit,
  recordIntervention = recordInterventionWithAudit,
  now,
  interventionId,
  currentUserName
}: ExecuteAddEmrInterventionParams): Promise<boolean> {
  if (!db) {
    notifyError(INTERVENTION_DB_NOT_READY_MESSAGE);
    return false;
  }
  try {
    const visit = await findActiveVisit();
    if (!visit) {
      notifyError(INTERVENTION_ACTIVE_VISIT_NOT_FOUND_MESSAGE);
      return false;
    }
    if (isClaimEditBlocked(visit.claimLifecycle)) {
      notifyError(getClaimEditBlockedMessage(visit.claimLifecycle, 'prescription'));
      return false;
    }

    const category = resolveInterventionCategory(input);
    const id = interventionId ?? `int_${uuidv4()}`;
    const timestamp = now ?? new Date().toISOString();
    const operatorName = currentUserName ?? getCurrentUser().name;

    const newRecord = buildInterventionRecord(input, {
      interventionId: id,
      visitId: visit.visitId,
      handledBy: operatorName,
      now: timestamp
    });

    // visit.interventionEvents への同期保存（コレクションを増やさず visit の入れ子プロパティとして構造化）
    const event = buildInterventionEvent(input, category, {
      eventId: id,
      handledBy: operatorName,
      now: timestamp
    });

    // 保存 -> イベント追記 -> 監査ログ。監査ログが残らなければ、書いたものを全部元に戻す。
    await recordIntervention({
      db,
      visit,
      record: newRecord,
      event,
      auditDetail: buildInterventionAuditDetail(input, category),
      logAudit
    });

    appendIntervention({ ...newRecord, category });
    notifySuccess(input.inquiryStatus === 'pending' ? '疑義照会を照会中として記録しました' : '疑義照会・処方変更を記録しました');
    return true;
  } catch (err) {
    console.error('Failed to save intervention:', err);
    notifyError(userFacingErrorMessage(err, '保存に失敗しました'));
    return false;
  }
}

export interface UseEmrInterventionParams {
  db: PharmacyDatabase | null | undefined;
  findActiveVisit: () => Promise<RxDocument<Visit> | null>;
}

export function useEmrIntervention({ db, findActiveVisit }: UseEmrInterventionParams) {
  const [interventions, setInterventions] = useState<InterventionItem[]>([]);
  const [isInterventionModalOpen, setIsInterventionModalOpen] = useState(false);
  const [intCategory, setIntCategory] = useState<InterventionCategory>('other');
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

  const resetInterventionForm = useCallback(() => {
    setIntCategory('other');
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

  const handleAddIntervention = useCallback(async (input: InterventionInput): Promise<boolean> => {
    if (!db) {
      toast.error(INTERVENTION_DB_NOT_READY_MESSAGE);
      return false;
    }
    return executeAddEmrIntervention({
      db,
      findActiveVisit,
      input,
      appendIntervention: (newRecord) => setInterventions((prev) => [...prev, newRecord]),
      notifySuccess: (message) => toast.success(message),
      notifyError: (message) => toast.error(message),
      logAudit: (patientId, patientName, detail) =>
        logAuditAction(db, 'prescription_edit', detail, patientId, patientName)
    });
  }, [db, findActiveVisit]);

  const handleDeleteIntervention = useCallback(async (interventionId: string) => {
    if (!db) return;
    try {
      const visit = await findActiveVisit();
      if (!visit) return;
      if (isClaimEditBlocked(visit.claimLifecycle)) {
        toast.error(getClaimEditBlockedMessage(visit.claimLifecycle, 'prescription'));
        return;
      }

      const { deleted } = await deleteInterventionWithAudit({
        db,
        visit,
        interventionId,
        logAudit: (patientId, patientName, detail) =>
          logAuditAction(db, 'prescription_edit', detail, patientId, patientName)
      });
      if (deleted) {
        toast.success('疑義照会を削除しました。');
        setInterventions((prev) => prev.filter((i) => (i.interventionId || i.id) !== interventionId));
      }
    } catch (e: unknown) {
      console.error('Failed to delete intervention:', e);
      toast.error(userFacingErrorMessage(e, '疑義照会の削除に失敗しました。'));
    }
  }, [db, findActiveVisit]);

  return {
    interventions,
    setInterventions,
    isInterventionModalOpen,
    setIsInterventionModalOpen,
    intCategory,
    setIntCategory,
    intDoctor,
    setIntDoctor,
    intReason,
    setIntReason,
    intBefore,
    setIntBefore,
    intAfter,
    setIntAfter,
    intResult,
    setIntResult,
    intStatus,
    setIntStatus,
    intMethod,
    setIntMethod,
    intResponseDueDate,
    setIntResponseDueDate,
    intNote,
    setIntNote,
    intConsented,
    setIntConsented,
    resetInterventionForm,
    handleAddIntervention,
    handleDeleteIntervention
  };
}
