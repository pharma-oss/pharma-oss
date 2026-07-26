import type { AuditLog } from '@/db/types';
import type { DashboardClaimWorkItem } from '@/hooks/useDashboardTasks';
import {
  buildClaimOfficialRuleBatchReview,
  type ClaimOfficialRuleBatchReviewReport
} from '@/lib/claim_rule_review';
import { validateDispensingClaim } from '@/lib/claim_validation';
import type { MonthlyClaimUkeCase } from '@/lib/monthly_claim_uke';

export function toPlain<T>(value: T | { toJSON: () => T }): T {
  return value && typeof (value as { toJSON?: () => T }).toJSON === 'function'
    ? (value as { toJSON: () => T }).toJSON()
    : (value as T);
}

export function readTextFile(file: File, encoding = 'Shift_JIS'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsText(file, encoding);
  });
}

export function downloadUtf8Csv(fileName: string, csv: string) {
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function toClaimWorkbenchExportItem(item: DashboardClaimWorkItem) {
  return {
    visitId: item.visitId,
    patientId: item.patientId,
    patientName: item.name,
    issueDateLabel: item.issueDateLabel,
    monthLabel: item.monthLabel,
    statusLabel: item.statusLabel,
    priorityLabel: item.priorityLabel,
    totalPoints: item.totalPoints,
    prescriptionCount: item.prescriptionCount,
    exportedFileName: item.exportedFileName,
    latestEventLabel: item.latestEventLabel,
    reason: item.reason,
    actionLabel: item.actionLabel
  };
}

export function buildClaimRuleReviewForCases(
  cases: MonthlyClaimUkeCase[],
  generatedAt: Date
): ClaimOfficialRuleBatchReviewReport {
  const width = Math.max(3, String(cases.length).length);
  const ruleCases = cases.map((claimCase, index) => {
    const serviceDate = claimCase.visit.dispensingDate || claimCase.visit.issueDate;
    return {
      caseId: `rule-case-${String(index + 1).padStart(width, '0')}`,
      patientKey: claimCase.patient.patientId,
      serviceDate,
      baseFeeCategory: claimCase.settings.baseFeeCategory,
      calculatedFees: claimCase.calculatedFees,
      validationIssues: validateDispensingClaim({
        settings: claimCase.settings,
        patient: claimCase.patient,
        items: claimCase.items,
        calculatedFees: claimCase.calculatedFees,
        claimOptions: claimCase.visit.claimOptions,
        totalPoints: claimCase.calculatedFees.reduce((sum, fee) => sum + fee.points, 0),
        serviceDate
      })
    };
  });
  return buildClaimOfficialRuleBatchReview(ruleCases, generatedAt);
}

export function formatClaimRuleAttentionForScreen(
  report: ClaimOfficialRuleBatchReviewReport,
  cases: MonthlyClaimUkeCase[]
): string {
  const lines = report.reports.flatMap((caseReport, index) => {
    const patientName = cases[index]?.patient.name || `ケース${index + 1}`;
    return caseReport.items
      .filter((item) => item.status === 'attention')
      .map((item) => `${patientName}: ${item.title}`);
  });
  return `${lines.slice(0, 8).join('\n')}${lines.length > 8 ? `\nほか${lines.length - 8}項目` : ''}`;
}

export function isSameLocalDay(timestamp: string | undefined, basisDate: Date): boolean {
  if (!timestamp) return false;
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return false;
  return (
    value.getFullYear() === basisDate.getFullYear() &&
    value.getMonth() === basisDate.getMonth() &&
    value.getDate() === basisDate.getDate()
  );
}

export function countInventoryReceivingLogs(logs: AuditLog[], basisDate: Date): number {
  return logs.filter(
    (log) =>
      log.actionType === 'stock_update' &&
      log.details.includes('発注ワークベンチ入庫登録') &&
      isSameLocalDay(log.timestamp, basisDate)
  ).length;
}

export function countSupportLoadLogs(logs: AuditLog[], basisDate: Date): number {
  return logs.filter((log) => {
    if (!isSameLocalDay(log.timestamp, basisDate)) return false;
    if (log.actionType === 'daily_closing_approval' || log.actionType === 'daily_closing_kpi_action')
      return false;
    return /個人情報なし診断|サポート|問い合わせ|SLA|障害対応|リリース運用受入/.test(log.details);
  }).length;
}
