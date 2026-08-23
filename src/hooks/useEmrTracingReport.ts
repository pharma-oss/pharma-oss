import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { getCurrentUser, logAuditAction } from '@/lib/audit';
import { tracingStatusLabel } from '@/lib/emr_helpers';
import type { Visit, VisitTracingReport } from '@/db/types';

export interface UseEmrTracingReportParams {
  db: any;
  findActiveVisit: () => Promise<any>;
  currentPatientName: string;
}

export function useEmrTracingReport({
  db,
  findActiveVisit,
  currentPatientName
}: UseEmrTracingReportParams) {
  const [tracingReports, setTracingReports] = useState<VisitTracingReport[]>([]);
  const [isTracingModalOpen, setIsTracingModalOpen] = useState(false);

  const handleSaveTracingReport = useCallback(async (report: VisitTracingReport) => {
    if (!db) return;
    const visit = await findActiveVisit();
    if (!visit) {
      toast.error('処理中の受付が見つかりません');
      return;
    }
    const currentVisit = visit.toJSON() as Visit;
    const currentCare = currentVisit.careCommunication || {};
    const now = new Date().toISOString();

    const finalReport: VisitTracingReport = {
      ...report,
      sentAt: report.status === 'sent' || report.status === 'closed' ? report.sentAt || now : undefined,
      sentBy: report.status === 'sent' || report.status === 'closed' ? getCurrentUser().name : undefined,
      createdAt: report.createdAt || now,
      updatedAt: now
    };

    try {
      const nextReports = [finalReport, ...(currentCare.tracingReports || []).filter((r) => r.reportId !== finalReport.reportId)];
      await visit.patch({
        careCommunication: {
          ...currentCare,
          tracingReports: nextReports,
          updatedAt: now
        }
      });
      setTracingReports(nextReports);

      const instCodeInfo = finalReport.destinationInstitutionCode ? `[${finalReport.destinationInstitutionCode}] ` : '';
      const auditOk = await logAuditAction(
        db,
        'follow_up_record',
        `トレーシングレポート記録: ${tracingStatusLabel[finalReport.status] || finalReport.status} / ${finalReport.subject} / 宛先 ${instCodeInfo}${finalReport.destinationInstitution || '未指定'} ${finalReport.destinationDoctor || ''}`,
        currentVisit.patientId,
        currentPatientName
      );
      if (!auditOk) {
        toast.warning('レポートは保存しましたが、監査ログ記録に失敗しました。');
      } else {
        toast.success('トレーシングレポートを保存しました');
      }
    } catch (error) {
      console.error('Failed to save tracing report:', error);
      toast.error('トレーシングレポートの保存に失敗しました');
    }
  }, [db, findActiveVisit, currentPatientName]);

  return {
    tracingReports,
    setTracingReports,
    isTracingModalOpen,
    setIsTracingModalOpen,
    handleSaveTracingReport
  };
}
