import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { getCurrentUser, logAuditAction } from '@/lib/audit';
import { isClaimEditBlocked, getClaimEditBlockedMessage } from '@/lib/claim_edit_guard';
import {
  buildInterventionAuditDetail,
  buildInterventionEvent,
  buildInterventionRecord,
  deleteInterventionWithAudit,
  recordInterventionWithAudit,
  resolveInterventionCategory,
  type InterventionCategory,
  type InterventionInput
} from '@/lib/prescription_intervention_support';

export interface UseEmrInterventionParams {
  db: any;
  findActiveVisit: () => Promise<any>;
}

export function useEmrIntervention({ db, findActiveVisit }: UseEmrInterventionParams) {
  const [interventions, setInterventions] = useState<any[]>([]);
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

  const handleAddIntervention = useCallback(async (input: InterventionInput) => {
    if (!db) return;
    try {
      const visit = await findActiveVisit();
      if (!visit) return;
      if (isClaimEditBlocked(visit.claimLifecycle)) {
        toast.error(getClaimEditBlockedMessage(visit.claimLifecycle, 'prescription'));
        return;
      }

      const category = resolveInterventionCategory(input);
      const newId = `int_${uuidv4()}`;
      const now = new Date().toISOString();
      const currentUser = getCurrentUser();

      const newRecord = buildInterventionRecord(input, {
        interventionId: newId,
        visitId: visit.visitId,
        handledBy: currentUser.name,
        now
      });

      // visit.interventionEvents への同期保存（コレクションを増やさず visit の入れ子プロパティとして構造化）
      const event = buildInterventionEvent(input, category, {
        eventId: newId,
        handledBy: currentUser.name,
        now
      });

      // 保存 -> イベント追記 -> 監査ログ。監査ログが残らなければ、書いたものを全部元に戻す。
      await recordInterventionWithAudit({
        db,
        visit,
        record: newRecord,
        event,
        auditDetail: buildInterventionAuditDetail(input, category),
        logAudit: (patientId, patientName, detail) =>
          logAuditAction(db, 'prescription_edit', detail, patientId, patientName)
      });

      setInterventions((prev: any[]) => [...prev, newRecord]);
      toast.success(input.inquiryStatus === 'pending' ? '疑義照会を照会中として記録しました' : '疑義照会・処方変更を記録しました');
    } catch (err) {
      console.error('Failed to save intervention:', err);
      toast.error('保存に失敗しました');
    }
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
    } catch (e: any) {
      console.error('Failed to delete intervention:', e);
      toast.error('疑義照会の削除に失敗しました。');
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
