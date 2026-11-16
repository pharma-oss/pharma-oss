import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { getCurrentUser, logAuditAction } from '@/lib/audit';
import { tracingStatusLabel } from '@/lib/emr_helpers';
import { userFacingErrorMessage } from '@/lib/user_facing_error';
import type { DeepReadonlyObject, RxDocument } from 'rxdb';
import type { PharmacyDatabase, Visit, VisitCareCommunication, VisitTracingReport } from '@/db/types';

export const TRACING_REPORT_DB_NOT_READY_MESSAGE = 'データベースの準備ができていません。しばらくしてから再度お試しください。';
export const TRACING_REPORT_ACTIVE_VISIT_NOT_FOUND_MESSAGE = '処理中の受付が見つかりません';

function cloneMynaClinicalImports(
  imports: DeepReadonlyObject<VisitCareCommunication>['mynaClinicalImports']
): VisitCareCommunication['mynaClinicalImports'] {
  return imports?.map((imp) => ({
    ...imp,
    specificHealthCheckups: imp.specificHealthCheckups?.map((checkup) => ({
      ...checkup,
      findings: checkup.findings ? [...checkup.findings] : undefined
    })),
    medicationHistory: imp.medicationHistory?.map((item) => ({ ...item }))
  }));
}

export interface TracingReportVisitHandle {
  patientId: string;
  toJSON: () => DeepReadonlyObject<Visit>;
  patch: (patch: { careCommunication: NonNullable<Visit['careCommunication']> }) => Promise<unknown>;
}

export interface ExecuteSaveTracingReportParams {
  isDbReady: boolean;
  findActiveVisit: () => Promise<TracingReportVisitHandle | null>;
  report: VisitTracingReport;
  currentPatientName: string;
  setTracingReports: (reports: VisitTracingReport[]) => void;
  notifySuccess: (message: string) => void;
  notifyWarning: (message: string) => void;
  notifyError: (message: string) => void;
  logAudit: (patientId: string, patientName: string, detail: string) => Promise<boolean>;
  now?: string;
  currentUserName?: string;
}

/**
 * トレーシングレポートを保存し、成否を boolean で返す。
 * DB未準備・受付未取得・保存例外時は false を返し、編集中のモーダルを閉じない根拠にする。
 */
export async function executeSaveTracingReport({
  isDbReady,
  findActiveVisit,
  report,
  currentPatientName,
  setTracingReports,
  notifySuccess,
  notifyWarning,
  notifyError,
  logAudit,
  now,
  currentUserName
}: ExecuteSaveTracingReportParams): Promise<boolean> {
  if (!isDbReady) {
    notifyError(TRACING_REPORT_DB_NOT_READY_MESSAGE);
    return false;
  }

  try {
    const visit = await findActiveVisit();
    if (!visit) {
      notifyError(TRACING_REPORT_ACTIVE_VISIT_NOT_FOUND_MESSAGE);
      return false;
    }

    const currentVisit = visit.toJSON();
    const currentCare = currentVisit.careCommunication || {};
    const timestamp = now ?? new Date().toISOString();
    const isSentOrClosed = report.status === 'sent' || report.status === 'closed';
    const operatorName = isSentOrClosed ? (currentUserName ?? getCurrentUser().name) : undefined;

    const finalReport: VisitTracingReport = {
      ...report,
      sentAt: isSentOrClosed ? report.sentAt || timestamp : undefined,
      sentBy: operatorName,
      createdAt: report.createdAt || timestamp,
      updatedAt: timestamp
    };

    const nextReports: VisitTracingReport[] = [
      finalReport,
      ...(currentCare.tracingReports || [])
        .filter((r) => r.reportId !== finalReport.reportId)
        .map((r) => ({ ...r }))
    ];
    await visit.patch({
      careCommunication: {
        tracingReports: nextReports,
        ...(currentCare.mynaClinicalImports
          ? { mynaClinicalImports: cloneMynaClinicalImports(currentCare.mynaClinicalImports) }
          : {}),
        updatedAt: timestamp
      }
    });
    setTracingReports(nextReports);

    const instCodeInfo = finalReport.destinationInstitutionCode ? `[${finalReport.destinationInstitutionCode}] ` : '';
    const auditOk = await logAudit(
      currentVisit.patientId,
      currentPatientName,
      `トレーシングレポート記録: ${tracingStatusLabel[finalReport.status] || finalReport.status} / ${finalReport.subject} / 宛先 ${instCodeInfo}${finalReport.destinationInstitution || '未指定'} ${finalReport.destinationDoctor || ''}`
    );
    if (!auditOk) {
      notifyWarning('レポートは保存しましたが、監査ログ記録に失敗しました。');
    } else {
      notifySuccess('トレーシングレポートを保存しました');
    }
    return true;
  } catch (error) {
    console.error('Failed to save tracing report:', error);
    notifyError(userFacingErrorMessage(error, 'トレーシングレポートの保存に失敗しました'));
    return false;
  }
}

export interface UseEmrTracingReportParams {
  db: PharmacyDatabase | null | undefined;
  findActiveVisit: () => Promise<RxDocument<Visit> | null>;
  currentPatientName: string;
}

export function useEmrTracingReport({
  db,
  findActiveVisit,
  currentPatientName
}: UseEmrTracingReportParams) {
  const [tracingReports, setTracingReports] = useState<VisitTracingReport[]>([]);
  const [isTracingModalOpen, setIsTracingModalOpen] = useState(false);

  const handleSaveTracingReport = useCallback(async (report: VisitTracingReport): Promise<boolean> => {
    if (!db) {
      toast.error(TRACING_REPORT_DB_NOT_READY_MESSAGE);
      return false;
    }
    return executeSaveTracingReport({
      isDbReady: true,
      findActiveVisit,
      report,
      currentPatientName,
      setTracingReports,
      notifySuccess: (message) => toast.success(message),
      notifyWarning: (message) => toast.warning(message),
      notifyError: (message) => toast.error(message),
      logAudit: (patientId, patientName, detail) =>
        logAuditAction(db, 'follow_up_record', detail, patientId, patientName)
    });
  }, [db, findActiveVisit, currentPatientName]);

  return {
    tracingReports,
    setTracingReports,
    isTracingModalOpen,
    setIsTracingModalOpen,
    handleSaveTracingReport
  };
}
