'use client';

import React, { useState, useCallback } from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileCheck2,
  Loader2,
  ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { canUserPerform, getCurrentUser, getPermissionDeniedMessage, logAuditAction } from '@/lib/audit';
import type { AuditLog, FacilitySettings } from '@/db/types';
import { buildBackupContinuityReport, type BackupSchedulePolicy } from '@/lib/backup';
import {
  buildOperationalClosingAuditDetails,
  buildOperationalClosingCsv,
  buildOperationalClosingMemo,
  buildOperationalClosingReport
} from '@/lib/operational_closing_report';
import {
  downloadUtf8Csv,
  isSameLocalDay,
  countInventoryReceivingLogs,
  countSupportLoadLogs
} from '@/lib/dashboard_helpers';
import { KpiCard } from './DashboardCards';
import type { OperationalKpis } from '@/lib/operational_kpi';
import type {
  DashboardClaimRisk,
  DashboardClaimWorkItem,
  DashboardCounts,
  DashboardFollowUpCandidate,
  DashboardInventoryRisk
} from '@/hooks/useDashboardTasks';

export interface OperationalClosingSectionProps {
  db: any;
  kpis: OperationalKpis;
  counts: DashboardCounts;
  claimRisks: DashboardClaimRisk[];
  inventoryRisks: DashboardInventoryRisk[];
  claimWorkItems: DashboardClaimWorkItem[];
  followUpCandidates: DashboardFollowUpCandidate[];
  auditLogs: AuditLog[];
  facilitySettings: FacilitySettings | null;
  backupSchedulePolicy: BackupSchedulePolicy;
  onRefresh: () => void;
}

export function OperationalClosingSection({
  db,
  kpis,
  counts,
  claimRisks,
  inventoryRisks,
  claimWorkItems,
  followUpCandidates,
  auditLogs,
  facilitySettings,
  backupSchedulePolicy,
  onRefresh
}: OperationalClosingSectionProps) {
  const [isRecordingClosing, setIsRecordingClosing] = useState(false);

  const dailyKpis = kpis.daily;
  const monthlyKpis = kpis.monthly;
  const backupContinuity = buildBackupContinuityReport(
    auditLogs,
    new Date(),
    { schedulePolicy: backupSchedulePolicy }
  );

  const closingTone = dailyKpis.closingBlockerCount === 0
    ? 'green'
    : dailyKpis.closingBlockerCount <= 3
      ? 'amber'
      : 'red';

  const monthlyClaimTone = monthlyKpis.openClaimCount === 0
    ? 'green'
    : monthlyKpis.openClaimCount <= 3
      ? 'amber'
      : 'red';

  const backupContinuityTone = backupContinuity.status === 'pass'
    ? 'green'
    : backupContinuity.status === 'attention'
      ? 'amber'
      : 'red';

  const getClosingReport = useCallback((generatedAt = new Date()) => {
    const todayLogs = auditLogs.filter((log) => isSameLocalDay(log.timestamp, generatedAt));
    const controlledDrugInventoryCount = todayLogs.filter(
      (log) => log.actionType === 'stock_update' && log.details.includes('麻薬・向精神薬')
    ).length;
    const inventoryReceivingCount = countInventoryReceivingLogs(todayLogs, generatedAt);
    const remoteSupportLoadCount = countSupportLoadLogs(todayLogs, generatedAt);

    return buildOperationalClosingReport({
      generatedAt,
      reviewerName: getCurrentUser().name || '管理者',
      storeName: facilitySettings?.pharmacyName,
      storeCode: facilitySettings?.pharmacyCode,
      kpis,
      counts: {
        todayReceptionCount: counts.todayReceptionCount,
        waitingCount: counts.waitingCount,
        processingCount: counts.processingCount,
        reviewCount: counts.reviewCount,
        pickingPendingCount: counts.pickingPendingCount,
        inventoryShortageCount: counts.inventoryShortageCount,
        urgentClaimRiskCount: counts.urgentClaimRiskCount,
        returnedClaimCount: counts.returnedClaimCount,
        rebillingClaimCount: counts.rebillingClaimCount,
        urgentFollowUpCount: counts.urgentFollowUpCount,
        claimRiskCount: counts.claimRiskCount,
        claimWorkbenchCount: counts.claimWorkbenchCount,
        followUpDueCount: counts.followUpDueCount
      },
      urgentInventoryRiskCount: inventoryRisks.filter(r => r.priority === 'high').length,
      claimRisks: claimRisks.map(r => ({
        priority: r.priority,
        riskScore: r.riskScore,
        topIssueTitles: r.topIssueTitles,
        actionLabel: r.actionLabel
      })),
      inventoryRisks: inventoryRisks.map(r => ({
        priority: r.priority,
        drugName: r.drugName,
        shortageAmount: r.shortageAmount,
        actionLabel: r.actionLabel
      })),
      claimWorkItems: claimWorkItems.map(w => ({
        priorityLabel: w.priorityLabel,
        statusLabel: w.statusLabel,
        actionLabel: w.actionLabel
      })),
      followUpCandidates: followUpCandidates.map(f => ({
        priority: f.priority,
        reasonFlags: f.reasonFlags,
        dueLabel: f.dueLabel,
        suggestedAction: f.suggestedAction
      })),
      backupContinuity,
      inventoryReceivingCount,
      supportCaseCount: remoteSupportLoadCount
    });
  }, [auditLogs, backupContinuity, claimRisks, claimWorkItems, counts, facilitySettings, followUpCandidates, inventoryRisks, kpis]);

  const handleApproveOperationalClosing = useCallback(async () => {
    const operator = getCurrentUser();
    if (!canUserPerform(operator, 'approve_daily_closing')) {
      toast.error(getPermissionDeniedMessage(operator, 'approve_daily_closing'));
      return;
    }
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    const report = getClosingReport();
    if (dailyKpis.closingBlockerCount > 0) {
      if (!window.confirm(`未完了の主要業務があります（残タスク ${dailyKpis.closingBlockerCount}件）。\nこのまま日次締めを承認しますか？`)) {
        return;
      }
    }

    setIsRecordingClosing(true);
    try {
      const details = buildOperationalClosingAuditDetails(report);
      const auditOk = await logAuditAction(
        db,
        'daily_closing_approval',
        details
      );
      if (!auditOk) {
        throw new Error('日次締め承認の監査ログ記録に失敗しました。');
      }
      toast.success('日次締め承認を監査ログに記録しました');
      onRefresh();
    } catch (err: any) {
      console.error('Failed to approve operational closing:', err);
      toast.error(`日次締め承認に失敗しました: ${err.message || err}`);
    } finally {
      setIsRecordingClosing(false);
    }
  }, [dailyKpis.closingBlockerCount, db, getClosingReport, onRefresh]);

  const handleCopyOperationalClosingMemo = useCallback(async () => {
    const report = getClosingReport();
    const memo = buildOperationalClosingMemo(report);
    try {
      await navigator.clipboard.writeText(memo);
      toast.success('日次締めメモをコピーしました');
    } catch {
      toast.error('メモのコピーに失敗しました。');
    }
  }, [getClosingReport]);

  const handleExportOperationalClosingCsv = useCallback(() => {
    const report = getClosingReport();
    const csv = buildOperationalClosingCsv(report);
    const fileName = `daily_closing_report_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadUtf8Csv(fileName, csv);
    toast.success('日次締めCSVを作成しました');
  }, [getClosingReport]);

  return (
    <section className="kpi-section" aria-label="日次・月次KPI">
      <div className="section-header compact">
        <div>
          <h3>日次・月次KPI</h3>
          <p className="text-muted">受付から薬歴、請求、在庫、フォローまで、今日を締められるかを横断して見ます。</p>
        </div>
        <div className="section-metrics">
          <button
            type="button"
            className="section-action-button primary"
            onClick={handleApproveOperationalClosing}
            disabled={isRecordingClosing}
          >
            {isRecordingClosing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
            <span>締め承認</span>
          </button>
          <button
            type="button"
            className="section-action-button"
            onClick={handleCopyOperationalClosingMemo}
          >
            <Copy size={14} aria-hidden="true" />
            <span>締めメモ</span>
          </button>
          <button
            type="button"
            className="section-action-button primary"
            onClick={handleExportOperationalClosingCsv}
          >
            <Download size={14} aria-hidden="true" />
            <span>締めCSV</span>
          </button>
          <span className={`section-count ${dailyKpis.closingStatus === 'clear' ? '' : 'urgent'}`}>
            {dailyKpis.closingStatusLabel}
          </span>
        </div>
      </div>
      <div className="kpi-grid">
        <KpiCard
          icon={CheckCircle2}
          tone={dailyKpis.completionRate >= 90 ? 'green' : dailyKpis.completionRate >= 60 ? 'amber' : 'red'}
          label="本日完了率"
          value={dailyKpis.completionRateLabel}
          subLabel={`${dailyKpis.completedCount}/${dailyKpis.receptionCount}件完了`}
          detail="受付から薬歴完了まで"
        />
        <KpiCard
          icon={Clock}
          tone="blue"
          label="平均処理時間"
          value={dailyKpis.averageCompletionLabel}
          subLabel="SOAP更新時刻基準"
          detail="受付から薬歴完了まで"
        />
        <KpiCard
          icon={ShieldCheck}
          tone={closingTone}
          label="閉店前残タスク"
          value={dailyKpis.closingBlockerCount}
          subLabel={dailyKpis.closingStatus === 'clear' ? '主要キュー完了' : `稼働中 ${dailyKpis.activeQueueCount}件`}
          detail="受付・監査・在庫・請求・フォロー"
        />
        <KpiCard
          icon={FileCheck2}
          tone={monthlyClaimTone}
          label="月次請求締め率"
          value={monthlyKpis.closedClaimRateLabel}
          subLabel={`${monthlyKpis.closedClaimCount}/${monthlyKpis.claimTargetCount}件締め`}
          detail={monthlyKpis.openClaimCount > 0 ? `未締め ${monthlyKpis.openClaimCount}件` : '未締めなし'}
        />
        <KpiCard
          icon={Download}
          tone={backupContinuityTone}
          label="バックアップ確認"
          value={backupContinuity.statusLabel}
          subLabel={backupContinuity.recommendation}
          detail={backupContinuity.detail}
        />
      </div>
    </section>
  );
}
