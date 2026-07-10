'use client';

import {
  AlertCircle,
  ArrowRight,
  Barcode,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileCheck2,
  FilePlus2,
  HeartPulse,
  Loader2,
  PackageSearch,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useDatabase } from '@/db/DatabaseProvider';
import type { AuditLog, FacilitySettings } from '@/db/types';
import { useDashboardTasks, type DashboardClaimRisk, type DashboardClaimWorkItem, type DashboardFollowUpCandidate, type DashboardInventoryRisk } from '@/hooks/useDashboardTasks';
import { canUserPerform, getCurrentUser, getPermissionDeniedMessage, logAuditAction } from '@/lib/audit';
import { buildBackupContinuityReport, DEFAULT_BACKUP_SCHEDULE_POLICY, type BackupSchedulePolicy } from '@/lib/backup';
import { readBackupSchedulePolicy } from '@/lib/backup_schedule_storage';
import {
  buildAutomaticDisabledFeeRationales,
  calculateDispensingFees,
  type MonthlyFeeHistoryEntry
} from '@/lib/calculator';
import { markClaimClosed, markClaimExported } from '@/lib/claim_lifecycle';
import {
  buildClaimOfficialRuleBatchReview,
  buildClaimOfficialRuleBatchReviewCsv,
  makeClaimOfficialRuleReviewFileName,
  type ClaimOfficialRuleBatchReviewReport
} from '@/lib/claim_rule_review';
import { buildClaimExportSnapshot } from '@/lib/claim_snapshot';
import { isDemoVisit } from '@/lib/demo_data';
import { validateDispensingClaim } from '@/lib/claim_validation';
import {
  buildClaimWorkbenchCsv,
  buildClaimWorkbenchMemo,
  isClaimWorkbenchClosable,
  isClaimWorkbenchUkeExportable
} from '@/lib/claim_workbench';
import { buildInventoryOrderCsv, buildInventoryOrderMemo, formatDateForFileName, formatInventoryAmount } from '@/lib/inventory_order';
import {
  buildOperationalClosingAuditDetails,
  buildOperationalClosingCsv,
  buildOperationalClosingMemo,
  buildOperationalClosingReport
} from '@/lib/operational_closing_report';
import {
  buildOperationalAiPredictions,
  summarizeOperationalAiPredictions,
  type OperationalAiPrediction
} from '@/lib/operational_ai_prediction';
import {
  AI_ASSIST_MODE_LABELS,
  filterAiAssistItemsByMode,
  normalizeAiAssistMode
} from '@/lib/ai_assist_policy';
import {
  buildMonthlyClaimOfficialUkeBundle,
  buildMonthlyClaimUkeBundle,
  buildMonthlyClaimUkePreflightReport,
  buildMonthlyClaimUkeResults,
  formatMonthlyClaimUkeAllFieldIssues,
  formatMonthlyClaimUkeBatchIssues,
  formatMonthlyClaimUkeIssues,
  formatMonthlyClaimUkeOfficialReadinessIssues,
  formatMonthlyClaimUkeOfficialSampleScopeReport,
  makeMonthlyClaimUkeAllFieldIssueFileName,
  makeMonthlyClaimUkeFileName,
  makeMonthlyClaimUkeOfficialReadinessIssueFileName,
  makeMonthlyClaimUkeOfficialReadinessReviewFileName,
  type MonthlyClaimUkeCase
} from '@/lib/monthly_claim_uke';
import {
  formatOnlineClaimAcceptanceIssues,
  formatOnlineClaimAcceptanceSourceFormat,
  parseOnlineClaimAcceptanceResults,
  reconcileOnlineClaimAcceptanceResults
} from '@/lib/online_claim_acceptance';

function toPlain<T>(value: T | { toJSON: () => T }): T {
  return value && typeof (value as { toJSON?: () => T }).toJSON === 'function'
    ? (value as { toJSON: () => T }).toJSON()
    : value as T;
}

function readTextFile(file: File, encoding = 'Shift_JIS'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsText(file, encoding);
  });
}

function downloadUtf8Csv(fileName: string, csv: string) {
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

function toClaimWorkbenchExportItem(item: DashboardClaimWorkItem) {
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

function buildClaimRuleReviewForCases(
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

function formatClaimRuleAttentionForScreen(
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

function isSameLocalDay(timestamp: string | undefined, basisDate: Date): boolean {
  if (!timestamp) return false;
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return false;
  return (
    value.getFullYear() === basisDate.getFullYear() &&
    value.getMonth() === basisDate.getMonth() &&
    value.getDate() === basisDate.getDate()
  );
}

function countInventoryReceivingLogs(logs: AuditLog[], basisDate: Date): number {
  return logs.filter((log) => (
    log.actionType === 'stock_update' &&
    log.details.includes('発注ワークベンチ入庫登録') &&
    isSameLocalDay(log.timestamp, basisDate)
  )).length;
}

function countSupportLoadLogs(logs: AuditLog[], basisDate: Date): number {
  return logs.filter((log) => {
    if (!isSameLocalDay(log.timestamp, basisDate)) return false;
    if (log.actionType === 'daily_closing_approval' || log.actionType === 'daily_closing_kpi_action') return false;
    return /個人情報なし診断|サポート|問い合わせ|SLA|障害対応|リリース運用受入/.test(log.details);
  }).length;
}

export default function Dashboard() {
  const router = useRouter();
  const db = useDatabase();
  const { tasks, counts, kpis, inventoryRisks, claimRisks, claimWorkItems, followUpCandidates, completeFollowUpCandidate, recordFollowUpCandidate, hasDemoData, refresh, isLoading, error } = useDashboardTasks();
  const currentUser = getCurrentUser();
  const [completingFollowUpId, setCompletingFollowUpId] = useState<string | null>(null);
  const [isExportingClaimWorkbenchUke, setIsExportingClaimWorkbenchUke] = useState(false);
  const [isExportingClaimWorkbenchOfficialUke, setIsExportingClaimWorkbenchOfficialUke] = useState(false);
  const [isCheckingClaimWorkbenchOfficialReadiness, setIsCheckingClaimWorkbenchOfficialReadiness] = useState(false);
  const [isCheckingClaimWorkbenchRules, setIsCheckingClaimWorkbenchRules] = useState(false);
  const [isImportingClaimAcceptance, setIsImportingClaimAcceptance] = useState(false);
  const [isClosingAcceptedClaims, setIsClosingAcceptedClaims] = useState(false);
  const [isRecordingOperationalClosing, setIsRecordingOperationalClosing] = useState(false);
  const [recordingFollowUp, setRecordingFollowUp] = useState<DashboardFollowUpCandidate | null>(null);
  const [followUpMethod, setFollowUpMethod] = useState<'phone' | 'sms' | 'visit' | 'other'>('phone');
  const [followUpNote, setFollowUpNote] = useState('');
  const [followUpNextAction, setFollowUpNextAction] = useState('');
  const [followUpDueDate, setFollowUpDueDate] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [facilitySettings, setFacilitySettings] = useState<FacilitySettings | null>(null);
  const [backupSchedulePolicy, setBackupSchedulePolicy] = useState<BackupSchedulePolicy>(DEFAULT_BACKUP_SCHEDULE_POLICY);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;

    db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec()
      .then((logs) => {
        if (!cancelled) {
          setAuditLogs(logs.map((log) => log.toJSON()));
        }
      })
      .catch((err) => {
        console.warn('Failed to load audit logs for backup continuity:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    setBackupSchedulePolicy(readBackupSchedulePolicy());
  }, []);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;

    db.facility_settings.findOne('default').exec()
      .then((doc) => {
        if (!cancelled) {
          setFacilitySettings(doc ? toPlain<FacilitySettings>(doc) : null);
        }
      })
      .catch((err) => {
        console.warn('Failed to load facility settings for daily closing:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [db]);

  const handleNewReception = useCallback(() => {
    router.push('/ocr');
  }, [router]);
  // デモデータ残存バナーからの一括削除。日次締め前に練習データを片づけてもらう。
  const handleCleanupDemoData = useCallback(async () => {
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    const shouldCleanup = window.confirm(
      '練習用のデモ患者・受付・処方・薬歴・アラート・在庫(「デモ」表記のデータ)をすべて削除します。よろしいですか？'
    );
    if (!shouldCleanup) return;
    try {
      const { cleanupTutorialDemoData } = await import('@/lib/demo_data');
      const result = await cleanupTutorialDemoData(db);
      toast.success(`デモデータを片づけました（受付${result.removedVisits}件・処方${result.removedPrescriptionItems}件・在庫${result.removedStocks}件など）。`);
      refresh();
    } catch (err) {
      console.error('Failed to cleanup tutorial demo data:', err);
      toast.error('デモデータの削除に失敗しました。');
    }
  }, [db, refresh]);
  const handleOpenTask = useCallback((visitId: string) => {
    router.push(`/print/${visitId}`);
  }, [router]);
  const handleOpenFollowUp = useCallback((visitId: string) => {
    router.push(`/emr?visitId=${encodeURIComponent(visitId)}`);
  }, [router]);
  const handleOpenAiPrediction = useCallback((prediction: OperationalAiPrediction) => {
    if (prediction.domain === 'inventory_shortage') {
      router.push('/inventory?tab=order-workbench');
      return;
    }
    if (!prediction.targetId) return;
    if (prediction.domain === 'follow_up') {
      handleOpenFollowUp(prediction.targetId);
      return;
    }
    handleOpenTask(prediction.targetId);
  }, [handleOpenFollowUp, handleOpenTask, router]);
  const handleFocusFollowUps = useCallback(() => {
    document.getElementById('followup-candidates')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const handleFocusInventoryRisks = useCallback(() => {
    document.getElementById('inventory-risk-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const handleFocusClaimRisks = useCallback(() => {
    document.getElementById('claim-risk-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const handleFocusClaimWorkbench = useCallback(() => {
    document.getElementById('monthly-claim-workbench')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const handleExportClaimWorkbenchCsv = useCallback(() => {
    if (claimWorkItems.length === 0) {
      toast.info('出力できる月次請求ワークはありません。');
      return;
    }

    const csv = buildClaimWorkbenchCsv(claimWorkItems.map(toClaimWorkbenchExportItem));
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `yakureki-claim-workbench-${formatDateForFileName(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('月次請求ワークCSVを作成しました。');
  }, [claimWorkItems]);
  const handleCopyClaimWorkbenchMemo = useCallback(async () => {
    if (claimWorkItems.length === 0) {
      toast.info('コピーできる月次請求ワークはありません。');
      return;
    }

    const memo = buildClaimWorkbenchMemo(claimWorkItems.map(toClaimWorkbenchExportItem));
    try {
      await navigator.clipboard.writeText(memo);
      toast.success('月次請求メモをコピーしました。');
    } catch (err) {
      console.error('Failed to copy claim workbench memo:', err);
      toast.error('月次請求メモのコピーに失敗しました。');
    }
  }, [claimWorkItems]);
  const handleCloseAcceptedClaimWorkbenchItems = useCallback(async () => {
    const operator = getCurrentUser();
    if (!canUserPerform(operator, 'export_uke')) {
      toast.error(getPermissionDeniedMessage(operator, 'export_uke'));
      return;
    }
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    const acceptedItems = claimWorkItems.filter((item) => isClaimWorkbenchClosable(item.status));
    if (acceptedItems.length === 0) {
      toast.info('請求完了へ締められる受付済み請求はありません。');
      return;
    }

    const shouldClose = window.confirm(
      `受付済みの請求 ${acceptedItems.length}件を請求完了として締めますか？ 完了後は返戻登録まで算定変更をロックします。`
    );
    if (!shouldClose) return;

    setIsClosingAcceptedClaims(true);
    try {
      const closedAt = new Date().toISOString();
      const visitIds = acceptedItems.map((item) => item.visitId);
      const visitDocs = await db.visits.find({ selector: { visitId: { $in: visitIds } } }).exec();
      const visitDocById = new Map<string, (typeof visitDocs)[number]>();
      for (const doc of visitDocs) {
        const visit = toPlain<any>(doc);
        if (visit?.visitId) visitDocById.set(visit.visitId, doc);
      }

      let closedCount = 0;
      for (const item of acceptedItems) {
        const visitDoc = visitDocById.get(item.visitId);
        if (!visitDoc) continue;
        const visit = toPlain<any>(visitDoc);
        if (visit?.claimLifecycle?.status !== 'accepted') continue;

        const nextLifecycle = markClaimClosed({
          current: visit.claimLifecycle,
          at: closedAt,
          by: operator.name,
          note: '月次請求ワークベンチから受付済み請求を一括締め'
        });
        await visitDoc.patch({ claimLifecycle: nextLifecycle });
        closedCount++;
        await logAuditAction(
          db,
          'claim_lifecycle',
          `請求状態変更: 月次請求ワークベンチから請求完了として締めました（受付済み一括締め）。`,
          item.patientId,
          item.name
        );
      }

      if (closedCount === 0) {
        toast.info('請求完了へ更新できる受付済み請求はありませんでした。');
        return;
      }

      await logAuditAction(
        db,
        'claim_lifecycle',
        `月次請求ワークベンチ: 受付済み請求 ${closedCount}件を請求完了として一括締めしました。`
      );
      toast.success(`受付済み請求 ${closedCount}件を請求完了として締めました。`);
    } catch (err) {
      console.error('Failed to close accepted claims:', err);
      toast.error('受付済み請求の一括締めに失敗しました。');
    } finally {
      setIsClosingAcceptedClaims(false);
    }
  }, [claimWorkItems, db]);
  const buildClaimWorkbenchUkeCases = useCallback(async (workItems: DashboardClaimWorkItem[]) => {
    if (!db) {
      throw new Error('データベースの初期化が完了していません。');
    }

    const targetVisitIds = Array.from(new Set(workItems.map((item) => item.visitId)));
    const [settingsDoc, visitDocs] = await Promise.all([
      db.facility_settings.findOne('default').exec(),
      db.visits.find({ selector: { visitId: { $in: targetVisitIds } } }).exec()
    ]);
    const settingsData = settingsDoc ? toPlain(settingsDoc) : null;
    if (!settingsData) {
      throw new Error('施設基準・薬局情報を保存してから一括UKEを作成してください。');
    }

    const visitRows = visitDocs
      .map((doc) => ({ doc, visit: toPlain<any>(doc) }))
      // 念のための防御: デモ受付が請求対象に紛れても、UKEへは絶対に載せない
      .filter((row) => !isDemoVisit(row.visit))
      .sort((left, right) => {
        const leftDate = left.visit.dispensingDate || left.visit.prescriptionDate || left.visit.issueDate || '';
        const rightDate = right.visit.dispensingDate || right.visit.prescriptionDate || right.visit.issueDate || '';
        return leftDate.localeCompare(rightDate) || String(left.visit.visitId).localeCompare(String(right.visit.visitId));
      });
    const visits = visitRows.map((row) => row.visit);
    const orderedVisitDocs = visitRows.map((row) => row.doc);
    const patientIds = Array.from(new Set(visits.map((visit) => visit.patientId).filter(Boolean)));
    const prescriptionDocs = targetVisitIds.length > 0
      ? await db.prescription_items.find({ selector: { visitId: { $in: targetVisitIds } } }).exec()
      : [];
    const prescriptionItems = prescriptionDocs.map((doc) => toPlain<any>(doc));
    const drugIds = new Set<string>();
    for (const item of prescriptionItems) {
      if (item.drugId) drugIds.add(item.drugId);
      if (item.dispensedDrugCode) drugIds.add(item.dispensedDrugCode);
    }

    const [patientMap, drugMap, interventionDocs] = await Promise.all([
      db.patients.findByIds(patientIds).exec(),
      drugIds.size > 0 ? db.drugs.findByIds(Array.from(drugIds)).exec() : Promise.resolve(new Map()),
      targetVisitIds.length > 0 ? db.interventions.find({ selector: { visitId: { $in: targetVisitIds } } }).exec() : Promise.resolve([])
    ]);
    const interventions = interventionDocs.map((doc) => toPlain<any>(doc));
    const interventionsByVisitId = new Map<string, any[]>();
    for (const intervention of interventions) {
      const list = interventionsByVisitId.get(intervention.visitId) || [];
      list.push(intervention);
      interventionsByVisitId.set(intervention.visitId, list);
    }

    const itemsByVisitId = new Map<string, any[]>();
    for (const item of prescriptionItems) {
      const list = itemsByVisitId.get(item.visitId) || [];
      list.push(item);
      itemsByVisitId.set(item.visitId, list);
    }

    const missingMessages: string[] = [];
    const cases: MonthlyClaimUkeCase[] = [];
    const monthlyFeeHistory: MonthlyFeeHistoryEntry[] = [];
    for (const visit of visits) {
      const patientDoc = patientMap.get(visit.patientId);
      const patient = patientDoc ? toPlain<any>(patientDoc) : null;
      const items = itemsByVisitId.get(visit.visitId) || [];
      if (!patient) {
        missingMessages.push(`${visit.visitId}: 患者情報がありません`);
        continue;
      }
      if (items.length === 0) {
        missingMessages.push(`${patient.name}: 処方薬がありません`);
        continue;
      }

      const ukeItems = items.map((item) => {
        const prescribedDrug = drugMap.get(item.drugId);
        const dispensedDrug = item.dispensedDrugCode ? drugMap.get(item.dispensedDrugCode) : undefined;
        const billingDrug = dispensedDrug || prescribedDrug;
        return {
          ...item,
          drugName: prescribedDrug?.name || item.dispensedDrug || item.drugId,
          drugPrice: billingDrug?.price,
          yjCode: billingDrug?.yjCode
        };
      });
      const serviceDate = visit.dispensingDate || visit.prescriptionDate || visit.issueDate;
      const calculationOptions = {
        ...(visit.claimOptions || {}),
        currentVisitId: visit.visitId,
        monthlyFeeHistory
      };
      const automaticRationales = buildAutomaticDisabledFeeRationales(
        settingsData,
        patient,
        serviceDate,
        calculationOptions
      );
      const mergedRationales = {
        ...(visit.claimOptions?.disabledFeeRationales || {}),
        ...automaticRationales
      };
      const visitClaimOptions = Object.keys(mergedRationales).length > 0
        ? {
            ...(visit.claimOptions || {}),
            disabledFeeRationales: mergedRationales
          }
        : visit.claimOptions;
      const calculatedFees = calculateDispensingFees(
        settingsData,
        ukeItems,
        patient,
        serviceDate,
        calculationOptions
      );
      for (const fee of calculatedFees) {
        if (!fee.feeKey || !fee.code || fee.points <= 0) continue;
        monthlyFeeHistory.push({
          visitId: visit.visitId,
          patientId: patient.patientId,
          serviceDate,
          feeKey: fee.feeKey,
          feeCode: fee.code,
          feeName: fee.name,
          points: fee.points
        });
      }
      cases.push({
        visit: {
          ...visit,
          claimOptions: visitClaimOptions
        },
        patient,
        settings: settingsData,
        items: ukeItems,
        calculatedFees,
        interventions: interventionsByVisitId.get(visit.visitId) || []
      });
    }

    return { cases, missingMessages, visits, visitDocs: orderedVisitDocs };
  }, [db]);

  const handleDownloadClaimWorkbenchOfficialReadiness = useCallback(async () => {
    const operator = getCurrentUser();
    if (!canUserPerform(operator, 'export_uke')) {
      toast.error(getPermissionDeniedMessage(operator, 'export_uke'));
      return;
    }
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    if (claimWorkItems.length === 0) {
      toast.info('公式提出準備を確認できる月次請求ワークはありません。');
      return;
    }
    const exportableClaimWorkItems = claimWorkItems.filter((item) => isClaimWorkbenchUkeExportable(item.status));
    if (exportableClaimWorkItems.length === 0) {
      toast.info('公式提出準備を確認できる再請求準備の受付はありません。');
      return;
    }

    setIsCheckingClaimWorkbenchOfficialReadiness(true);
    try {
      const { cases, missingMessages } = await buildClaimWorkbenchUkeCases(exportableClaimWorkItems);
      if (missingMessages.length > 0) {
        alert(`公式提出準備チェック前に確認が必要な受付があります。\n\n${missingMessages.slice(0, 8).join('\n')}${missingMessages.length > 8 ? `\nほか${missingMessages.length - 8}件` : ''}`);
        return;
      }
      if (cases.length === 0) {
        toast.info('公式提出準備を確認できる受付がありません。');
        return;
      }

      const generatedAt = new Date();
      const ruleReport = buildClaimRuleReviewForCases(cases, generatedAt);
      if (!ruleReport.ok) {
        const ruleFileName = makeClaimOfficialRuleReviewFileName(generatedAt);
        const auditOk = await logAuditAction(
          db,
          'uke_export',
          `月次公式提出準備確認停止: 算定ルールの要確認 ${ruleReport.attentionCount}項目を患者情報なしCSV「${ruleFileName}」へ書き出しました。`
        );
        if (!auditOk) {
          throw new Error('月次公式提出準備の算定ルール確認ログ記録に失敗したため、CSV出力を中止しました。');
        }
        downloadUtf8Csv(ruleFileName, buildClaimOfficialRuleBatchReviewCsv(ruleReport));
        alert(`公式提出準備を確認する前に算定ルールの確認が必要です。\n\n${formatClaimRuleAttentionForScreen(ruleReport, cases)}\n\n患者情報なしCSV: ${ruleFileName}`);
        return;
      }
      const results = buildMonthlyClaimUkeResults(cases, generatedAt);
      const preflightReport = buildMonthlyClaimUkePreflightReport(results);
      const fileName = makeMonthlyClaimUkeOfficialReadinessReviewFileName(generatedAt);
      const auditOk = await logAuditAction(
        db,
        'uke_export',
        `月次一括UKE公式提出準備レビューCSV: ${fileName} / 受付 ${preflightReport.totalClaims}件 / 公式提出準備 ${preflightReport.officialReadinessSummary.readyFeeCount}/${preflightReport.officialReadinessSummary.checkedFeeCount}算定、${preflightReport.officialReadinessSummary.readyDrugItemCount}/${preflightReport.officialReadinessSummary.checkedDrugItemCount}薬剤 / 要対応 ${preflightReport.officialReadinessSummary.errorCount}件。`
      );
      if (!auditOk) {
        throw new Error('月次一括UKE公式提出準備チェックの監査ログ記録に失敗したため、確認CSVの出力を中止しました。');
      }
      downloadUtf8Csv(fileName, preflightReport.officialReadinessReviewCsv);
      if (preflightReport.officialReadinessSummary.ok) {
        toast.success(`公式提出準備はOKです（確認CSV: ${fileName}）。`);
      } else {
        toast.warning(`公式提出準備に確認事項があります（${preflightReport.officialReadinessSummary.errorCount}件 / CSV: ${fileName}）。`);
      }
    } catch (err: any) {
      console.error('Failed to export monthly official readiness CSV:', err);
      toast.error(`公式提出準備チェックに失敗しました: ${err.message || err}`);
    } finally {
      setIsCheckingClaimWorkbenchOfficialReadiness(false);
    }
  }, [buildClaimWorkbenchUkeCases, claimWorkItems, db]);

  const handleDownloadClaimWorkbenchRuleReview = useCallback(async () => {
    const operator = getCurrentUser();
    if (!canUserPerform(operator, 'export_uke')) {
      toast.error(getPermissionDeniedMessage(operator, 'export_uke'));
      return;
    }
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    const exportableClaimWorkItems = claimWorkItems.filter((item) => isClaimWorkbenchUkeExportable(item.status));
    if (exportableClaimWorkItems.length === 0) {
      toast.info('算定ルールを確認できる再請求準備の受付はありません。');
      return;
    }

    setIsCheckingClaimWorkbenchRules(true);
    try {
      const { cases, missingMessages } = await buildClaimWorkbenchUkeCases(exportableClaimWorkItems);
      if (missingMessages.length > 0) {
        alert(`算定ルール確認前に確認が必要な受付があります。\n\n${missingMessages.slice(0, 8).join('\n')}${missingMessages.length > 8 ? `\nほか${missingMessages.length - 8}件` : ''}`);
        return;
      }
      if (cases.length === 0) {
        toast.info('算定ルールを確認できる受付がありません。');
        return;
      }

      const generatedAt = new Date();
      const report = buildClaimRuleReviewForCases(cases, generatedAt);
      const fileName = makeClaimOfficialRuleReviewFileName(generatedAt);
      const auditOk = await logAuditAction(
        db,
        'uke_export',
        `月次算定ルール確認CSV: ${fileName} / 受付 ${report.caseCount}件 / 確認 ${report.ruleCount}項目 / 要確認 ${report.attentionCount}項目（エラー ${report.errorCount}、警告 ${report.warningCount}）。`
      );
      if (!auditOk) {
        throw new Error('月次算定ルール確認の監査ログ記録に失敗したため、CSV出力を中止しました。');
      }
      downloadUtf8Csv(fileName, buildClaimOfficialRuleBatchReviewCsv(report));
      if (report.ok) {
        toast.success(`算定ルール確認はOKです（${report.caseCount}件・CSV: ${fileName}）。`);
      } else {
        alert(`請求前に算定ルールの確認が必要です。\n\n${formatClaimRuleAttentionForScreen(report, cases)}\n\n患者情報なしCSV: ${fileName}`);
      }
    } catch (err: any) {
      console.error('Failed to export claim rule review CSV:', err);
      toast.error(`算定ルール確認に失敗しました: ${err.message || err}`);
    } finally {
      setIsCheckingClaimWorkbenchRules(false);
    }
  }, [buildClaimWorkbenchUkeCases, claimWorkItems, db]);

  const handleDownloadClaimWorkbenchOfficialUke = useCallback(async () => {
    const operator = getCurrentUser();
    if (!canUserPerform(operator, 'export_uke')) {
      toast.error(getPermissionDeniedMessage(operator, 'export_uke'));
      return;
    }
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    const exportableClaimWorkItems = claimWorkItems.filter((item) => isClaimWorkbenchUkeExportable(item.status));
    if (exportableClaimWorkItems.length === 0) {
      toast.info('公式UKEを作成できる再請求準備の受付はありません。');
      return;
    }

    setIsExportingClaimWorkbenchOfficialUke(true);
    const claimLifecycleRollbacks: Array<{ visitDoc: any; previousLifecycle: any }> = [];
    try {
      const { cases, missingMessages, visits, visitDocs } = await buildClaimWorkbenchUkeCases(exportableClaimWorkItems);
      if (missingMessages.length > 0) {
        alert(`公式UKE作成前に確認が必要な受付があります。\n\n${missingMessages.slice(0, 8).join('\n')}${missingMessages.length > 8 ? `\nほか${missingMessages.length - 8}件` : ''}`);
        return;
      }
      if (cases.length === 0) {
        toast.info('公式UKEを作成できる受付がありません。');
        return;
      }

      const generatedAt = new Date();
      const ruleReport = buildClaimRuleReviewForCases(cases, generatedAt);
      if (!ruleReport.ok) {
        const ruleFileName = makeClaimOfficialRuleReviewFileName(generatedAt);
        const auditOk = await logAuditAction(
          db,
          'uke_export',
          `月次公式UKE出力停止: 算定ルールの要確認 ${ruleReport.attentionCount}項目を患者情報なしCSV「${ruleFileName}」へ書き出しました。`
        );
        if (!auditOk) {
          throw new Error('月次公式UKEの算定ルール確認ログ記録に失敗したため、CSV出力を中止しました。');
        }
        downloadUtf8Csv(ruleFileName, buildClaimOfficialRuleBatchReviewCsv(ruleReport));
        alert(`公式UKEを作成する前に算定ルールの確認が必要です。\n\n${formatClaimRuleAttentionForScreen(ruleReport, cases)}\n\n患者情報なしCSV: ${ruleFileName}`);
        return;
      }
      const results = buildMonthlyClaimUkeResults(cases, generatedAt);
      const preflightReport = buildMonthlyClaimUkePreflightReport(results);
      if (preflightReport.errorResults.length > 0) {
        const allFieldIssueFileName = preflightReport.allFieldIssues.length > 0
          ? makeMonthlyClaimUkeAllFieldIssueFileName(generatedAt)
          : '';
        if (allFieldIssueFileName) {
          const auditOk = await logAuditAction(
            db,
            'uke_export',
            `月次公式UKE出力停止: allFields指摘 ${preflightReport.allFieldIssues.length}件のため作成を止め、確認CSV「${allFieldIssueFileName}」を書き出しました。`
          );
          if (!auditOk) {
            throw new Error('月次公式UKE出力停止ログの監査ログ記録に失敗したため、確認CSVの出力を中止しました。');
          }
          downloadUtf8Csv(allFieldIssueFileName, preflightReport.allFieldIssueCsv);
        }
        alert(`公式UKE出力前チェックで修正が必要な受付があります。\n\n${formatMonthlyClaimUkeIssues(preflightReport.errorResults)}`);
        return;
      }
      if (preflightReport.batchErrorIssues.length > 0) {
        alert(`公式UKEの受付前チェックで修正が必要です。\n\n${formatMonthlyClaimUkeBatchIssues(preflightReport.batchErrorIssues)}`);
        return;
      }
      if (!preflightReport.officialReadinessSummary.ok) {
        const reviewFileName = makeMonthlyClaimUkeOfficialReadinessReviewFileName(generatedAt);
        const auditOk = await logAuditAction(
          db,
          'uke_export',
          `月次公式UKE出力停止: 公式提出準備の要対応 ${preflightReport.officialReadinessSummary.errorCount}件をレビューCSV「${reviewFileName}」へ書き出しました。`
        );
        if (!auditOk) {
          throw new Error('月次公式UKE出力停止ログの監査ログ記録に失敗したため、レビューCSVの出力を中止しました。');
        }
        downloadUtf8Csv(reviewFileName, preflightReport.officialReadinessReviewCsv);
        alert(`公式UKEを作成する前に確認が必要です。\n\n${formatMonthlyClaimUkeOfficialReadinessIssues(preflightReport.officialReadinessIssues)}\n\nレビューCSV: ${reviewFileName}`);
        return;
      }

      const warnings = [
        ...preflightReport.warningResults.flatMap((result) => result.filteredIssues.map((issue) => `${result.patientName}: ${issue.title}`)),
        ...preflightReport.batchWarningIssues.map((issue) => `${issue.patientName ? `${issue.patientName}: ` : ''}${issue.title}`)
      ];
      if (warnings.length > 0) {
        const shouldContinue = window.confirm(
          `公式UKE出力前に確認事項があります。このまま作成しますか？\n\n${warnings.slice(0, 8).join('\n')}${warnings.length > 8 ? `\nほか${warnings.length - 8}件` : ''}`
        );
        if (!shouldContinue) return;
      }

      const bundle = buildMonthlyClaimOfficialUkeBundle(cases, results);
      const caseByVisitId = new Map(cases.map((claimCase) => [claimCase.visit.visitId, claimCase]));
      const visitDocById = new Map<string, (typeof visitDocs)[number]>();
      visitDocs.forEach((doc, index) => {
        const visit = visits[index];
        if (visit?.visitId) visitDocById.set(visit.visitId, doc);
      });

      for (const result of bundle.results) {
        const visitDoc = visitDocById.get(result.visitId);
        const visit = visits.find((row) => row.visitId === result.visitId);
        if (!visitDoc || !visit) continue;
        const claimCase = caseByVisitId.get(result.visitId);
        const previousLifecycle = visit.claimLifecycle;
        const nextLifecycle = markClaimExported({
          current: visit.claimLifecycle,
          at: generatedAt.toISOString(),
          by: operator.name,
          fileName: bundle.fileName,
          totalPoints: result.totalPoints,
          exportSnapshot: claimCase
            ? buildClaimExportSnapshot({
                visit: claimCase.visit,
                patient: claimCase.patient,
                items: claimCase.items,
                totalPoints: result.totalPoints,
                createdAt: generatedAt.toISOString(),
                exportedFileName: bundle.fileName
              })
            : undefined
        });
        await visitDoc.patch({ claimLifecycle: nextLifecycle });
        claimLifecycleRollbacks.push({
          visitDoc,
          previousLifecycle: previousLifecycle || { status: 'draft' }
        });
        const lifecycleAuditOk = await logAuditAction(
          db,
          'claim_lifecycle',
          `請求状態変更: 月次公式UKE「${bundle.fileName}」に含め、請求をロックしました（点数: ${result.totalPoints}点）。`,
          result.patientId,
          result.patientName
        );
        if (!lifecycleAuditOk) {
          throw new Error(`月次公式UKEの請求状態監査ログ記録に失敗しました（受付ID: ${result.visitId}）。`);
        }
      }

      const reconciliation = bundle.officialReconciliationReport;
      const exportAuditOk = await logAuditAction(
        db,
        'uke_export',
        `月次公式UKEエクスポート: ${bundle.fileName} に ${bundle.totalClaims}件、合計${bundle.totalPoints}点を標準レコードで出力しました。提出先区分 ${bundle.records[0]?.fields[0] || '未確認'} / レコード ${bundle.records.length}件 / 公式提出準備OK / 集計突合OK（SN ${reconciliation.totalSupplementalRecordCount}件、JD ${reconciliation.totalDispensingDateRecordCount}件、SH ${reconciliation.totalPrescriptionRecordCount}件、CZ ${reconciliation.totalDispensingRecordCount}件、IY ${reconciliation.totalDrugRecordCount}件、TK ${reconciliation.totalCommentRecordCount}件、KI ${reconciliation.totalManagementRecordCount}件、MF ${reconciliation.totalCopaymentRecordCount}件、ST ${reconciliation.totalSplitRecordCount}件、GO ${reconciliation.goClaimCount ?? '未確認'}件 ${reconciliation.goTotalPoints ?? '未確認'}点）。`
      );
      if (!exportAuditOk) {
        throw new Error('月次公式UKE出力の監査ログ記録に失敗したため、出力を中止しました。');
      }

      const blob = new Blob([bundle.content as unknown as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = bundle.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success(`公式UKE ${bundle.fileName} を作成しました（${bundle.totalClaims}件 / ${bundle.totalPoints.toLocaleString('ja-JP')}点）。`);
    } catch (err: any) {
      if (claimLifecycleRollbacks.length > 0) {
        try {
          for (const rollback of [...claimLifecycleRollbacks].reverse()) {
            await rollback.visitDoc.patch({ claimLifecycle: rollback.previousLifecycle });
          }
        } catch (rollbackError) {
          console.error('Failed to rollback monthly official claim lifecycle changes:', rollbackError);
        }
      }
      console.error('Failed to download monthly official UKE:', err);
      toast.error(`公式UKEの作成に失敗しました: ${err.message || err}`);
    } finally {
      setIsExportingClaimWorkbenchOfficialUke(false);
    }
  }, [buildClaimWorkbenchUkeCases, claimWorkItems, db]);

  const handleDownloadClaimWorkbenchUke = useCallback(async () => {
    const operator = getCurrentUser();
    if (!canUserPerform(operator, 'export_uke')) {
      toast.error(getPermissionDeniedMessage(operator, 'export_uke'));
      return;
    }
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    if (claimWorkItems.length === 0) {
      toast.info('一括UKEを作成できる月次請求ワークはありません。');
      return;
    }
    const exportableClaimWorkItems = claimWorkItems.filter((item) => isClaimWorkbenchUkeExportable(item.status));
    if (exportableClaimWorkItems.length === 0) {
      toast.info('一括UKEを作成できる再請求準備の受付はありません。');
      return;
    }

    setIsExportingClaimWorkbenchUke(true);
    const claimLifecycleRollbacks: Array<{ visitDoc: any; previousLifecycle: any }> = [];
    try {
      const { cases, missingMessages, visits, visitDocs } = await buildClaimWorkbenchUkeCases(exportableClaimWorkItems);

      if (missingMessages.length > 0) {
        alert(`一括UKE作成前に確認が必要な受付があります。\n\n${missingMessages.slice(0, 8).join('\n')}${missingMessages.length > 8 ? `\nほか${missingMessages.length - 8}件` : ''}`);
        return;
      }
      if (cases.length === 0) {
        toast.info('一括UKEを作成できる受付がありません。');
        return;
      }

      const generatedAt = new Date();
      const ruleReport = buildClaimRuleReviewForCases(cases, generatedAt);
      if (!ruleReport.ok) {
        const ruleFileName = makeClaimOfficialRuleReviewFileName(generatedAt);
        const auditOk = await logAuditAction(
          db,
          'uke_export',
          `月次一括UKE出力停止: 算定ルールの要確認 ${ruleReport.attentionCount}項目を患者情報なしCSV「${ruleFileName}」へ書き出しました。`
        );
        if (!auditOk) {
          throw new Error('月次一括UKEの算定ルール確認ログ記録に失敗したため、CSV出力を中止しました。');
        }
        downloadUtf8Csv(ruleFileName, buildClaimOfficialRuleBatchReviewCsv(ruleReport));
        alert(`一括UKEを作成する前に算定ルールの確認が必要です。\n\n${formatClaimRuleAttentionForScreen(ruleReport, cases)}\n\n患者情報なしCSV: ${ruleFileName}`);
        return;
      }
      const results = buildMonthlyClaimUkeResults(cases, generatedAt);
      const preflightReport = buildMonthlyClaimUkePreflightReport(results);
      if (preflightReport.errorResults.length > 0) {
        const allFieldIssueFileName = preflightReport.allFieldIssues.length > 0
          ? makeMonthlyClaimUkeAllFieldIssueFileName(generatedAt)
          : '';
        if (allFieldIssueFileName) {
          const auditOk = await logAuditAction(
            db,
            'uke_export',
            `月次一括UKE出力停止: allFields指摘 ${preflightReport.allFieldIssues.length}件のためUKE作成を止め、確認CSV「${allFieldIssueFileName}」を書き出しました。根拠 ${preflightReport.allFieldSourceSummary.sourceLabel} (${preflightReport.allFieldSourceSummary.sourceUrl}) / 確認 ${preflightReport.allFieldSourceSummary.checkedFieldCount}項目。`
          );
          if (!auditOk) {
            throw new Error('月次一括UKE出力停止ログの監査ログ記録に失敗したため、確認CSVの出力を中止しました。');
          }
          downloadUtf8Csv(allFieldIssueFileName, preflightReport.allFieldIssueCsv);
        }
        const allFieldText = preflightReport.allFieldIssues.length > 0
          ? `\n\n全項目定義の指摘:\n${formatMonthlyClaimUkeAllFieldIssues(preflightReport.allFieldIssues)}\n\n確認CSV: ${allFieldIssueFileName}`
          : '';
        alert(`一括UKE出力前チェックで修正が必要な受付があります。\n\n${formatMonthlyClaimUkeIssues(preflightReport.errorResults)}${allFieldText}`);
        return;
      }

      if (preflightReport.warningResults.length > 0) {
        const shouldContinue = window.confirm(
          `一括UKE出力前チェックで確認事項があります。このまま作成しますか？\n\n${formatMonthlyClaimUkeIssues(preflightReport.warningResults)}`
        );
        if (!shouldContinue) return;
      }

      if (preflightReport.batchErrorIssues.length > 0) {
        alert(`オンライン請求受付前チェックで修正が必要な受付があります。\n\n${formatMonthlyClaimUkeBatchIssues(preflightReport.batchErrorIssues)}`);
        return;
      }
      if (preflightReport.batchWarningIssues.length > 0) {
        const shouldContinue = window.confirm(
          `オンライン請求受付前チェックで確認事項があります。このまま作成しますか？\n\n${formatMonthlyClaimUkeBatchIssues(preflightReport.batchWarningIssues)}`
        );
        if (!shouldContinue) return;
      }

      if (preflightReport.officialReadinessIssues.length > 0) {
        const officialReadinessIssueFileName = makeMonthlyClaimUkeOfficialReadinessIssueFileName(generatedAt);
        const auditOk = await logAuditAction(
          db,
          'uke_export',
          `月次一括UKE公式提出準備チェック: 公式算定コード・レセ電コードの確認事項 ${preflightReport.officialReadinessSummary.errorCount}件をCSV「${officialReadinessIssueFileName}」へ書き出しました。`
        );
        if (!auditOk) {
          throw new Error('月次一括UKE公式提出準備チェックの監査ログ記録に失敗したため、確認CSVの出力を中止しました。');
        }
        downloadUtf8Csv(officialReadinessIssueFileName, preflightReport.officialReadinessIssueCsv);
        const shouldContinue = window.confirm(
          `公式提出形式へ切り替える前に確認が必要な項目があります。\n\n${formatMonthlyClaimUkeOfficialReadinessIssues(preflightReport.officialReadinessIssues)}\n\n確認CSV: ${officialReadinessIssueFileName}\n\nこのまま従来UKEを作成しますか？`
        );
        if (!shouldContinue) return;
      }

      const fileName = makeMonthlyClaimUkeFileName(generatedAt);
      const bundle = buildMonthlyClaimUkeBundle(results, fileName);
      const caseByVisitId = new Map(cases.map((claimCase) => [claimCase.visit.visitId, claimCase]));

      const visitDocById = new Map<string, (typeof visitDocs)[number]>();
      visitDocs.forEach((doc, index) => {
        const visit = visits[index];
        if (visit?.visitId) visitDocById.set(visit.visitId, doc);
      });
      for (const result of bundle.results) {
        const visitDoc = visitDocById.get(result.visitId);
        const visit = visits.find((row) => row.visitId === result.visitId);
        if (!visitDoc || !visit) continue;
        const claimCase = caseByVisitId.get(result.visitId);
        const previousLifecycle = visit.claimLifecycle;
        const nextLifecycle = markClaimExported({
          current: visit.claimLifecycle,
          at: generatedAt.toISOString(),
          by: operator.name,
          fileName,
          totalPoints: result.totalPoints,
          exportSnapshot: claimCase
            ? buildClaimExportSnapshot({
                visit: claimCase.visit,
                patient: claimCase.patient,
                items: claimCase.items,
                totalPoints: result.totalPoints,
                createdAt: generatedAt.toISOString(),
                exportedFileName: fileName
              })
            : undefined
        });
        await visitDoc.patch({ claimLifecycle: nextLifecycle });
        claimLifecycleRollbacks.push({
          visitDoc,
          previousLifecycle: previousLifecycle || { status: 'draft' }
        });
        const lifecycleAuditOk = await logAuditAction(
          db,
          'claim_lifecycle',
          `請求状態変更: 月次一括UKE「${fileName}」に含め、請求をロックしました（点数: ${result.totalPoints}点）。`,
          result.patientId,
          result.patientName
        );
        if (!lifecycleAuditOk) {
          throw new Error(`月次一括UKEの請求状態監査ログ記録に失敗しました（受付ID: ${result.visitId}）。`);
        }
      }

      const exportAuditOk = await logAuditAction(
        db,
        'uke_export',
        `月次一括UKEエクスポート: ${fileName} に ${bundle.totalClaims}件、合計${bundle.totalPoints}点を出力しました。${formatMonthlyClaimUkeOfficialSampleScopeReport(bundle.officialSampleScopeReport)}。allFields確認 ${bundle.allFieldSourceSummary.checkedFieldCount}項目 / 指摘 ${bundle.allFieldSourceSummary.issueFieldCount}件 / 根拠 ${bundle.allFieldSourceSummary.sourceLabel} (${bundle.allFieldSourceSummary.sourceUrl})。公式提出準備 ${bundle.officialReadinessSummary.readyFeeCount}/${bundle.officialReadinessSummary.checkedFeeCount}算定、${bundle.officialReadinessSummary.readyDrugItemCount}/${bundle.officialReadinessSummary.checkedDrugItemCount}薬剤。`
      );
      if (!exportAuditOk) {
        throw new Error('月次一括UKE出力の監査ログ記録に失敗したため、出力を中止しました。');
      }

      const blob = new Blob([bundle.content as unknown as BlobPart], { type: 'text/csv;charset=shift_jis' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success(`月次一括UKEを作成しました（${bundle.totalClaims}件 / ${bundle.totalPoints.toLocaleString('ja-JP')}点）。`);
    } catch (err: any) {
      if (claimLifecycleRollbacks.length > 0) {
        try {
          for (const rollback of [...claimLifecycleRollbacks].reverse()) {
            await rollback.visitDoc.patch({ claimLifecycle: rollback.previousLifecycle });
          }
        } catch (rollbackError) {
          console.error('Failed to rollback monthly claim lifecycle changes:', rollbackError);
        }
      }
      console.error('Failed to download monthly claim UKE:', err);
      toast.error(`月次一括UKEの作成に失敗しました: ${err.message || err}`);
    } finally {
      setIsExportingClaimWorkbenchUke(false);
    }
  }, [buildClaimWorkbenchUkeCases, claimWorkItems, db]);
  const handleImportClaimAcceptanceResults = useCallback(() => {
    const operator = getCurrentUser();
    if (!canUserPerform(operator, 'export_uke')) {
      toast.error(getPermissionDeniedMessage(operator, 'export_uke'));
      return;
    }
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setIsImportingClaimAcceptance(true);
      try {
        const content = await readTextFile(file);
        const parsed = parseOnlineClaimAcceptanceResults(content);
        const parseErrors = parsed.issues.filter((issue) => issue.severity === 'error');
        if (parseErrors.length > 0) {
          alert(`受付結果ファイルを取り込めません。\n\n${formatOnlineClaimAcceptanceIssues(parseErrors)}`);
          return;
        }
        if (parsed.rows.length === 0) {
          toast.info('取込対象の受付結果がありません。');
          return;
        }

        const visitIds = Array.from(new Set(parsed.rows.map((row) => row.visitId)));
        const visitDocs = await db.visits.find({ selector: { visitId: { $in: visitIds } } }).exec();
        const visits = visitDocs.map((doc) => toPlain<any>(doc));
        const reconciliation = reconcileOnlineClaimAcceptanceResults({
          rows: parsed.rows,
          visits,
          importedAt: new Date().toISOString(),
          importedBy: operator.name
        });
        const reconciliationErrors = reconciliation.issues.filter((issue) => issue.severity === 'error');
        if (reconciliationErrors.length > 0) {
          alert(`受付結果の消込前に修正が必要です。\n\n${formatOnlineClaimAcceptanceIssues(reconciliationErrors)}`);
          return;
        }
        const reconciliationWarnings = reconciliation.issues.filter((issue) => issue.severity === 'warning');
        if (reconciliationWarnings.length > 0) {
          const shouldContinue = window.confirm(
            `受付結果の消込で確認事項があります。このまま反映しますか？\n\n${formatOnlineClaimAcceptanceIssues(reconciliationWarnings)}`
          );
          if (!shouldContinue) return;
        }

        const visitDocById = new Map<string, (typeof visitDocs)[number]>();
        visitDocs.forEach((doc, index) => {
          const visit = visits[index];
          if (visit?.visitId) visitDocById.set(visit.visitId, doc);
        });
        for (const item of reconciliation.items) {
          if (!item.nextLifecycle) continue;
          const visitDoc = visitDocById.get(item.row.visitId);
          if (!visitDoc) continue;
          await visitDoc.patch({ claimLifecycle: item.nextLifecycle });
          await logAuditAction(
            db,
            'claim_lifecycle',
            `オンライン請求受付結果取込: ${item.row.visitId} を${item.row.status === 'accepted' ? '受付済' : '返戻対応'}に更新しました。${item.row.reason ? ` 理由: ${item.row.reason}` : ''}`,
            item.visit?.patientId || item.row.patientId,
            item.row.patientName
          );
        }
        await logAuditAction(
          db,
          'uke_export',
          `オンライン請求受付結果取込: ${file.name} から受付済${reconciliation.acceptedCount}件、返戻${reconciliation.returnedCount}件を消し込みました。取込形式: ${formatOnlineClaimAcceptanceSourceFormat(parsed.sourceFormat)}。`
        );
        toast.success(`受付結果を取り込みました（受付済 ${reconciliation.acceptedCount}件 / 返戻 ${reconciliation.returnedCount}件）。`);
      } catch (err: any) {
        console.error('Failed to import online claim acceptance results:', err);
        toast.error(`受付結果ファイルの取込に失敗しました: ${err.message || err}`);
      } finally {
        setIsImportingClaimAcceptance(false);
      }
    };
    input.click();
  }, [db]);
  const handleExportInventoryOrderCsv = useCallback(() => {
    if (inventoryRisks.length === 0) {
      toast.info('出力できる在庫不足リスクはありません。');
      return;
    }

    const csv = buildInventoryOrderCsv(inventoryRisks);
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `yakureki-inventory-order-${formatDateForFileName(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('発注候補CSVを作成しました。');
  }, [inventoryRisks]);
  const handleCopyInventoryOrderMemo = useCallback(async () => {
    if (inventoryRisks.length === 0) {
      toast.info('コピーできる在庫不足リスクはありません。');
      return;
    }

    const memo = buildInventoryOrderMemo(inventoryRisks);
    try {
      await navigator.clipboard.writeText(memo);
      toast.success('発注・融通メモをコピーしました。');
    } catch (err) {
      console.error('Failed to copy inventory order memo:', err);
      toast.error('メモのコピーに失敗しました。');
    }
  }, [inventoryRisks]);
  const openFollowUpRecord = useCallback((candidate: DashboardFollowUpCandidate) => {
    setRecordingFollowUp(candidate);
    setFollowUpMethod('phone');
    setFollowUpNote('');
    setFollowUpNextAction(candidate.suggestedAction);
    setFollowUpDueDate(candidate.dueDate);
  }, []);
  const closeFollowUpRecord = useCallback(() => {
    if (completingFollowUpId) return;
    setRecordingFollowUp(null);
  }, [completingFollowUpId]);
  const handleCompleteFollowUp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordingFollowUp) return;
    const note = followUpNote.trim();
    if (!note) {
      toast.error('対応内容を入力してください。');
      return;
    }
    setCompletingFollowUpId(recordingFollowUp.visitId);
    try {
      await completeFollowUpCandidate(recordingFollowUp, {
        contactMethod: followUpMethod,
        completedNote: note,
        nextAction: followUpNextAction.trim() || undefined,
        dueDate: followUpDueDate || undefined
      });
      toast.success(`${recordingFollowUp.name}さんのフォローを対応済みにしました。`);
      setRecordingFollowUp(null);
    } catch (err) {
      console.error('Failed to complete follow-up candidate:', err);
      toast.error('フォロー候補の更新に失敗しました。');
    } finally {
      setCompletingFollowUpId(null);
    }
  }, [completeFollowUpCandidate, followUpDueDate, followUpMethod, followUpNextAction, followUpNote, recordingFollowUp]);
  const handleSaveFollowUpReminder = useCallback(async () => {
    if (!recordingFollowUp) return;
    const note = followUpNote.trim();
    if (!note) {
      toast.error('対応内容を入力してください。');
      return;
    }
    setCompletingFollowUpId(recordingFollowUp.visitId);
    try {
      await recordFollowUpCandidate(recordingFollowUp, {
        contactMethod: followUpMethod,
        outcome: 'rescheduled',
        completedNote: note,
        nextAction: followUpNextAction.trim() || undefined,
        dueDate: followUpDueDate || undefined
      });
      toast.success(`${recordingFollowUp.name}さんのフォローを次回確認として記録しました。`);
      setRecordingFollowUp(null);
    } catch (err) {
      console.error('Failed to record follow-up reminder:', err);
      toast.error('フォロー記録の保存に失敗しました。');
    } finally {
      setCompletingFollowUpId(null);
    }
  }, [followUpDueDate, followUpMethod, followUpNextAction, followUpNote, recordFollowUpCandidate, recordingFollowUp]);

  const pendingCount = counts.waitingCount;
  const reviewCount = counts.reviewCount;
  const completedCount = counts.completedCount;
  const reviewTasks = tasks.filter((task) => task.priority !== 'normal');
  const standardTasks = tasks.filter((task) => task.priority === 'normal');
  const visibleClaimRisks = claimRisks.slice(0, 6);
  const visibleClaimWorkItems = claimWorkItems.slice(0, 6);
  const hasExportableClaimWorkItems = claimWorkItems.some((item) => isClaimWorkbenchUkeExportable(item.status));
  const acceptedClaimWorkItemCount = claimWorkItems.filter((item) => isClaimWorkbenchClosable(item.status)).length;
  const visibleInventoryRisks = inventoryRisks.slice(0, 5);
  const visibleFollowUpCandidates = followUpCandidates.slice(0, 6);
  const aiAssistMode = normalizeAiAssistMode(facilitySettings?.aiAssistMode);
  const allOperationalAiPredictions = buildOperationalAiPredictions({
    claimRisks,
    inventoryRisks,
    followUpCandidates
  });
  const operationalAiPredictions = filterAiAssistItemsByMode(allOperationalAiPredictions, aiAssistMode);
  const operationalAiPredictionSummary = summarizeOperationalAiPredictions(operationalAiPredictions);
  const visibleOperationalAiPredictions = operationalAiPredictions.slice(0, 5);
  const urgentFollowUpCount = counts.urgentFollowUpCount;
  const urgentClaimRiskCount = counts.urgentClaimRiskCount;
  const urgentClaimWorkCount = counts.returnedClaimCount;
  const urgentInventoryRiskCount = inventoryRisks.filter((risk) => risk.priority === 'high').length;
  const dailyKpis = kpis.daily;
  const monthlyKpis = kpis.monthly;
  const closingTone = dailyKpis.closingStatus === 'blocked'
    ? 'red'
    : dailyKpis.closingStatus === 'attention'
      ? 'amber'
      : 'green';
  const monthlyClaimTone = monthlyKpis.openClaimCount > 0
    ? monthlyKpis.returnedClaimCount > 0
      ? 'red'
      : 'amber'
    : 'green';
  const backupContinuity = buildBackupContinuityReport(auditLogs, new Date(), {
    schedulePolicy: backupSchedulePolicy
  });
  const backupContinuityTone = backupContinuity.status === 'pass'
    ? 'green'
    : backupContinuity.status === 'attention'
      ? 'amber'
      : 'red';
  const createOperationalClosingReport = useCallback((reviewerName = currentUser.name) => {
    const generatedAt = new Date();

    return buildOperationalClosingReport({
      generatedAt,
      reviewerName,
      storeName: facilitySettings?.pharmacyName || undefined,
      storeCode: facilitySettings?.pharmacyCode || undefined,
      kpis,
      counts,
      urgentInventoryRiskCount,
      claimRisks: claimRisks.map((risk) => ({
        priority: risk.priority,
        riskScore: risk.riskScore,
        topIssueTitles: risk.topIssueTitles,
        actionLabel: risk.actionLabel
      })),
      inventoryRisks: inventoryRisks.map((risk) => ({
        priority: risk.priority,
        drugName: risk.drugName,
        shortageAmount: risk.shortageAmount,
        actionLabel: risk.actionLabel
      })),
      claimWorkItems: claimWorkItems.map((item) => ({
        priorityLabel: item.priorityLabel,
        statusLabel: item.statusLabel,
        actionLabel: item.actionLabel
      })),
      followUpCandidates: followUpCandidates.map((candidate) => ({
        priority: candidate.priority,
        reasonFlags: candidate.reasonFlags,
        dueLabel: candidate.dueLabel,
        suggestedAction: candidate.suggestedAction
      })),
      inventoryReceivingCount: countInventoryReceivingLogs(auditLogs, generatedAt),
      supportCaseCount: countSupportLoadLogs(auditLogs, generatedAt),
      backupContinuity: buildBackupContinuityReport(auditLogs, generatedAt, {
        schedulePolicy: backupSchedulePolicy
      })
    });
  }, [auditLogs, backupSchedulePolicy, claimRisks, claimWorkItems, counts, currentUser.name, facilitySettings?.pharmacyCode, facilitySettings?.pharmacyName, followUpCandidates, inventoryRisks, kpis, urgentInventoryRiskCount]);
  const handleExportOperationalClosingCsv = useCallback(() => {
    const report = createOperationalClosingReport();
    const csv = buildOperationalClosingCsv(report);
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `yakureki-daily-closing-${formatDateForFileName(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('日次締めCSVを作成しました。');
  }, [createOperationalClosingReport]);
  const handleCopyOperationalClosingMemo = useCallback(async () => {
    const memo = buildOperationalClosingMemo(createOperationalClosingReport());
    try {
      await navigator.clipboard.writeText(memo);
      toast.success('日次締めメモをコピーしました。');
    } catch (err) {
      console.error('Failed to copy daily closing memo:', err);
      toast.error('日次締めメモのコピーに失敗しました。');
    }
  }, [createOperationalClosingReport]);
  const handleApproveOperationalClosing = useCallback(async () => {
    const operator = getCurrentUser();
    if (!canUserPerform(operator, 'approve_daily_closing')) {
      toast.error(getPermissionDeniedMessage(operator, 'approve_daily_closing'));
      return;
    }
    if (!db) {
      toast.error('監査ログの準備が完了していません。');
      return;
    }

    setIsRecordingOperationalClosing(true);
    try {
      const report = createOperationalClosingReport(operator.name);
      await logAuditAction(
        db,
        'daily_closing_approval',
        buildOperationalClosingAuditDetails(report)
      );
      toast.success('日次締め承認を監査ログに記録しました。');
    } catch (err) {
      console.error('Failed to record daily closing approval:', err);
      toast.error('日次締め承認の記録に失敗しました。');
    } finally {
      setIsRecordingOperationalClosing(false);
    }
  }, [createOperationalClosingReport, db]);

  return (
    <div className="dashboard-container">
      <header className="welcome-header">
        <div className="welcome-copy">
          <span className="eyebrow"><Sparkles size={15} aria-hidden="true" /> 本日の業務</span>
          <h2>おはようございます、{currentUser.name}さん</h2>
          <p className="text-muted">受付から薬歴完了まで、いま動いている業務をここで確認できます。</p>
        </div>
        <button className="btn-primary" onClick={handleNewReception}>
          <Plus size={18} aria-hidden="true" />
          <span>新規受付</span>
        </button>
      </header>

      {hasDemoData && (
        <div className="notice demo" role="status" data-testid="demo-data-reminder">
          <PackageSearch size={16} aria-hidden="true" />
          <span>
            練習用のデモデータ（デモ患者 みどり・「デモ」薬品）が残っています。
            請求(UKE)には載りませんが、受付件数・フォロー候補・発注候補に混ざるため、練習が終わったら片づけてください。
          </span>
          <button type="button" className="section-action-button" onClick={handleCleanupDemoData} data-testid="demo-data-cleanup-button">
            デモデータを片づける
          </button>
        </div>
      )}

      <section className="stats-grid" aria-label="本日の状況">
        <StatCard icon={Users} tone="blue" label="本日受付" value={counts.todayReceptionCount} subLabel="ローカルDB集計" />
        <StatCard icon={Clock} tone="amber" label="受付待ち" value={pendingCount} subLabel="未処理の受付" />
        <StatCard icon={AlertCircle} tone="red" label="要確認" value={reviewCount} subLabel="薬剤師確認" />
        <StatCard icon={CheckCircle2} tone="green" label="完了" value={completedCount} subLabel="薬歴入力済み" />
      </section>

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
              disabled={isRecordingOperationalClosing}
            >
              {isRecordingOperationalClosing ? <Loader2 size={14} aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
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

      <section className="operations-grid" aria-label="運用キュー">
        <OperationTile
          icon={FileCheck2}
          label="電子処方箋・QR"
          value={pendingCount}
          subLabel="受付待ち"
          tone="blue"
          onClick={handleNewReception}
        />
        <OperationTile
          icon={Barcode}
          label="GS1監査"
          value={counts.pickingPendingCount}
          subLabel="未照合"
          tone={counts.pickingPendingCount > 0 ? 'amber' : 'green'}
          onClick={() => router.push('/emr?openPicking=1')}
        />
        <OperationTile
          icon={AlertCircle}
          label="請求リスク"
          value={counts.claimRiskCount}
          subLabel={urgentClaimRiskCount > 0 ? `要修正 ${urgentClaimRiskCount}` : '返戻予防'}
          tone={urgentClaimRiskCount > 0 ? 'red' : counts.claimRiskCount > 0 ? 'amber' : 'green'}
          onClick={counts.claimRiskCount > 0 ? handleFocusClaimRisks : () => router.push('/settings')}
        />
        <OperationTile
          icon={FileCheck2}
          label="月次請求"
          value={counts.claimWorkbenchCount}
          subLabel={urgentClaimWorkCount > 0 ? `返戻 ${urgentClaimWorkCount}` : counts.rebillingClaimCount > 0 ? `再請求 ${counts.rebillingClaimCount}` : '未締め確認'}
          tone={urgentClaimWorkCount > 0 ? 'red' : counts.rebillingClaimCount > 0 ? 'amber' : counts.claimWorkbenchCount > 0 ? 'blue' : 'green'}
          onClick={counts.claimWorkbenchCount > 0 ? handleFocusClaimWorkbench : handleFocusClaimRisks}
        />
        <OperationTile
          icon={PackageSearch}
          label="在庫注意"
          value={counts.inventoryShortageCount}
          subLabel={urgentInventoryRiskCount > 0 ? `至急 ${urgentInventoryRiskCount}` : '不足候補'}
          tone={counts.inventoryShortageCount > 0 ? 'red' : 'green'}
          onClick={counts.inventoryShortageCount > 0 ? handleFocusInventoryRisks : () => router.push('/inventory')}
        />
        <OperationTile
          icon={HeartPulse}
          label="服薬フォロー"
          value={counts.followUpDueCount}
          subLabel={urgentFollowUpCount > 0 ? `本日対応 ${urgentFollowUpCount}` : '候補'}
          tone={urgentFollowUpCount > 0 ? 'red' : 'teal'}
          onClick={handleFocusFollowUps}
        />
      </section>

      <section id="operational-ai-predictions" className="ai-prediction-section" aria-label="AI補助予測スコア">
        <div className="section-header">
          <div>
            <span className="ai-prediction-title-line">
              <Sparkles size={16} aria-hidden="true" />
              <h3>AI補助予測スコア</h3>
            </span>
            <p className="text-muted">返戻、在庫欠品、服薬フォローを横断し、優先して確認したい候補を根拠付きで表示します。</p>
          </div>
          <div className="section-metrics">
            <span className="section-count">{AI_ASSIST_MODE_LABELS[aiAssistMode]}</span>
            {operationalAiPredictionSummary.criticalCount > 0 && (
              <span className="section-count urgent">高リスク {operationalAiPredictionSummary.criticalCount}</span>
            )}
            <span className="section-count">最高 {operationalAiPredictionSummary.maxScore}</span>
            <span className="section-count">信頼度 {operationalAiPredictionSummary.averageConfidence}%</span>
            <span className="section-count">{operationalAiPredictionSummary.totalCount}件</span>
          </div>
        </div>

        <div className="ai-prediction-list">
          {isLoading && <EmptyState text="AI補助予測を読み込んでいます..." tone="loading" />}
          {!isLoading && allOperationalAiPredictions.length > operationalAiPredictions.length && (
            <div className="ai-prediction-mode-notice" role="status" data-testid="operational-ai-mode-notice">
              AI補助は「{AI_ASSIST_MODE_LABELS[aiAssistMode]}」です。
              {aiAssistMode === 'disabled'
                ? '候補表示を停止しています。通常の業務キューは継続します。'
                : `高リスク以外の候補 ${allOperationalAiPredictions.length - operationalAiPredictions.length}件を非表示にしています。`}
            </div>
          )}
          {!isLoading && visibleOperationalAiPredictions.map((prediction) => (
            <AiPredictionRow
              key={prediction.predictionId}
              prediction={prediction}
              onOpen={() => handleOpenAiPrediction(prediction)}
            />
          ))}
          {!isLoading && allOperationalAiPredictions.length === 0 && <EmptyState text="現在、優先確認が必要なAI補助予測はありません。" />}
        </div>

        {!isLoading && visibleOperationalAiPredictions.length > 0 && (
          <p className="ai-prediction-guardrail">{visibleOperationalAiPredictions[0].guardrail}</p>
        )}
      </section>

      <section id="claim-risk-queue" className="claim-risk-section" aria-label="返戻・請求リスク" data-testid="claim-risk-queue">
        <div className="section-header">
          <div>
            <span className="section-title-line">
              <AlertCircle size={16} aria-hidden="true" />
              <h3>返戻・請求リスク</h3>
            </span>
            <p className="text-muted">印刷・UKE出力前の請求チェックを横断し、保険情報・薬品マスタ・算定設定の修正候補を先に出します。</p>
          </div>
          <div className="section-metrics">
            {urgentClaimRiskCount > 0 && <span className="section-count urgent">要修正 {urgentClaimRiskCount}</span>}
            <span className="section-count">{counts.claimRiskCount}件</span>
          </div>
        </div>

        <div className="claim-risk-list">
          {isLoading && <EmptyState text="請求リスクを読み込んでいます..." tone="loading" />}
          {!isLoading && visibleClaimRisks.map((risk) => (
            <ClaimRiskRow
              key={risk.visitId}
              name={risk.name}
              time={risk.time}
              prescriptionCount={risk.prescriptionCount}
              totalPoints={risk.totalPoints}
              errorCount={risk.errorCount}
              warningCount={risk.warningCount}
              priority={risk.priority}
              riskScore={risk.riskScore}
              topIssueTitles={risk.topIssueTitles}
              actionLabel={risk.actionLabel}
              onOpen={() => handleOpenTask(risk.visitId)}
            />
          ))}
          {!isLoading && visibleClaimRisks.length === 0 && <EmptyState text="現在、返戻につながる請求リスクはありません。" />}
        </div>
      </section>

      <section id="monthly-claim-workbench" className="claim-workbench-section" aria-label="月次請求ワークベンチ" data-testid="monthly-claim-workbench">
        <div className="section-header">
          <div>
            <span className="section-title-line">
              <FileCheck2 size={16} aria-hidden="true" />
              <h3>月次請求ワークベンチ</h3>
            </span>
            <p className="text-muted">UKE出力済み、返戻対応、再請求/月遅れ準備の未締め請求を月次で追跡します。</p>
          </div>
          <div className="section-metrics">
            <button
              type="button"
              className="section-action-button primary"
              data-testid="monthly-claim-uke-button"
              onClick={handleDownloadClaimWorkbenchUke}
              disabled={!hasExportableClaimWorkItems || isExportingClaimWorkbenchUke || isExportingClaimWorkbenchOfficialUke || isCheckingClaimWorkbenchOfficialReadiness || isCheckingClaimWorkbenchRules}
            >
              {isExportingClaimWorkbenchUke ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FileCheck2 size={14} aria-hidden="true" />}
              <span>{isExportingClaimWorkbenchUke ? '作成中' : '一括UKE'}</span>
            </button>
            <button
              type="button"
              className="section-action-button primary"
              data-testid="monthly-claim-official-uke-button"
              onClick={handleDownloadClaimWorkbenchOfficialUke}
              disabled={!hasExportableClaimWorkItems || isExportingClaimWorkbenchOfficialUke || isExportingClaimWorkbenchUke || isCheckingClaimWorkbenchOfficialReadiness || isCheckingClaimWorkbenchRules}
            >
              {isExportingClaimWorkbenchOfficialUke ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
              <span>{isExportingClaimWorkbenchOfficialUke ? '作成中' : '公式UKE'}</span>
            </button>
            <button
              type="button"
              className="section-action-button"
              data-testid="monthly-claim-official-readiness-button"
              onClick={handleDownloadClaimWorkbenchOfficialReadiness}
              disabled={!hasExportableClaimWorkItems || isCheckingClaimWorkbenchOfficialReadiness || isExportingClaimWorkbenchUke || isExportingClaimWorkbenchOfficialUke || isCheckingClaimWorkbenchRules}
            >
              {isCheckingClaimWorkbenchOfficialReadiness ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
              <span>{isCheckingClaimWorkbenchOfficialReadiness ? '確認中' : '公式確認'}</span>
            </button>
            <button
              type="button"
              className="section-action-button"
              data-testid="monthly-claim-rule-review-button"
              onClick={handleDownloadClaimWorkbenchRuleReview}
              disabled={!hasExportableClaimWorkItems || isCheckingClaimWorkbenchRules || isCheckingClaimWorkbenchOfficialReadiness || isExportingClaimWorkbenchUke || isExportingClaimWorkbenchOfficialUke}
            >
              {isCheckingClaimWorkbenchRules ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FileCheck2 size={14} aria-hidden="true" />}
              <span>{isCheckingClaimWorkbenchRules ? '確認中' : '算定ルール'}</span>
            </button>
            <button
              type="button"
              className="section-action-button primary"
              data-testid="monthly-claim-close-accepted-button"
              onClick={handleCloseAcceptedClaimWorkbenchItems}
              disabled={acceptedClaimWorkItemCount === 0 || isClosingAcceptedClaims}
            >
              {isClosingAcceptedClaims ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
              <span>{isClosingAcceptedClaims ? '締め中' : '受付済締め'}</span>
            </button>
            <button
              type="button"
              className="section-action-button"
              data-testid="claim-acceptance-import-button"
              onClick={handleImportClaimAcceptanceResults}
              disabled={isImportingClaimAcceptance}
            >
              {isImportingClaimAcceptance ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}
              <span>{isImportingClaimAcceptance ? '取込中' : '結果取込'}</span>
            </button>
            <button
              type="button"
              className="section-action-button"
              onClick={handleCopyClaimWorkbenchMemo}
              disabled={claimWorkItems.length === 0}
            >
              <Copy size={14} aria-hidden="true" />
              <span>請求メモ</span>
            </button>
            <button
              type="button"
              className="section-action-button"
              onClick={handleExportClaimWorkbenchCsv}
              disabled={claimWorkItems.length === 0}
            >
              <Download size={14} aria-hidden="true" />
              <span>CSV</span>
            </button>
            {counts.returnedClaimCount > 0 && <span className="section-count urgent">返戻 {counts.returnedClaimCount}</span>}
            {counts.rebillingClaimCount > 0 && <span className="section-count">再請求 {counts.rebillingClaimCount}</span>}
            {acceptedClaimWorkItemCount > 0 && <span className="section-count">受付済 {acceptedClaimWorkItemCount}</span>}
            <span className="section-count">{counts.claimWorkbenchCount}件</span>
          </div>
        </div>

        <div className="claim-workbench-list">
          {isLoading && <EmptyState text="月次請求ワークを読み込んでいます..." tone="loading" />}
          {!isLoading && visibleClaimWorkItems.map((item) => (
            <ClaimWorkbenchRow
              key={item.visitId}
              item={item}
              onOpen={() => handleOpenTask(item.visitId)}
            />
          ))}
          {!isLoading && visibleClaimWorkItems.length === 0 && <EmptyState text="現在、月次請求で未締めの返戻・再請求ワークはありません。" />}
        </div>
      </section>

      <section id="inventory-risk-queue" className="inventory-risk-section" aria-label="在庫不足リスク">
        <div className="section-header">
          <div>
            <span className="section-title-line">
              <PackageSearch size={16} aria-hidden="true" />
              <h3>在庫不足リスク</h3>
            </span>
            <p className="text-muted">受付中・調剤中の処方から必要量を合算し、発注・融通確認が必要な薬品を先に出します。</p>
          </div>
          <div className="section-metrics">
            <button
              type="button"
              className="section-action-button"
              onClick={handleCopyInventoryOrderMemo}
              disabled={inventoryRisks.length === 0}
            >
              <Copy size={14} aria-hidden="true" />
              <span>発注メモ</span>
            </button>
            <button
              type="button"
              className="section-action-button primary"
              onClick={handleExportInventoryOrderCsv}
              disabled={inventoryRisks.length === 0}
            >
              <Download size={14} aria-hidden="true" />
              <span>CSV</span>
            </button>
            {urgentInventoryRiskCount > 0 && <span className="section-count urgent">至急 {urgentInventoryRiskCount}</span>}
            <span className="section-count">{counts.inventoryShortageCount}品目</span>
          </div>
        </div>

        <div className="inventory-risk-list">
          {isLoading && <EmptyState text="在庫リスクを読み込んでいます..." tone="loading" />}
          {!isLoading && visibleInventoryRisks.map((risk) => (
            <InventoryRiskRow
              key={risk.drugId}
              drugName={risk.drugName}
              location={risk.location}
              supplierName={risk.supplierName}
              requiredAmount={risk.requiredAmount}
              availableAmount={risk.availableAmount}
              shortageAmount={risk.shortageAmount}
              recommendedOrderAmount={risk.recommendedOrderAmount}
              affectedVisitCount={risk.affectedVisitCount}
              affectedPatientNames={risk.affectedPatientNames}
              priority={risk.priority}
              actionLabel={risk.actionLabel}
              pickingShortageAmount={risk.pickingShortageAmount}
              onOpen={() => router.push('/inventory?tab=order-workbench')}
            />
          ))}
          {!isLoading && visibleInventoryRisks.length === 0 && <EmptyState text="現在、在庫不足リスクはありません。" />}
        </div>
      </section>

      <section className="workflow-section">
        <div className="section-header">
          <div>
            <h3>進行中のタスク</h3>
            <p className="text-muted">カードを開くと薬剤師確認・印刷画面へ移動します。</p>
          </div>
          <button className="text-link" type="button">
            すべて表示
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>

        {error && (
          <div className="notice danger" role="alert">
            タスクの読み込みに失敗しました。画面を再読み込みしてください。
          </div>
        )}

        <div className="task-kanban">
          <KanbanColumn title="受付待ち" count={pendingCount} tone="neutral">
            {pendingCount === 0 && <EmptyState text="現在、受付待ちのタスクはありません。" />}
          </KanbanColumn>

          <KanbanColumn title="調剤中・処方入力済み" count={standardTasks.length} tone="amber">
            {isLoading && <EmptyState text="タスクを読み込んでいます..." tone="loading" />}
            {!isLoading && standardTasks.map((task) => (
              <PatientTaskCard
                key={task.visitId}
                visitId={task.visitId}
                name={task.name}
                age={task.age}
                status={task.status}
                time={task.time}
                waitMinutes={task.waitMinutes}
                prescriptionCount={task.prescriptionCount}
                reviewFlags={task.reviewFlags}
                priority={task.priority}
                onOpen={() => handleOpenTask(task.visitId)}
                interactive
              />
            ))}
            {!isLoading && standardTasks.length === 0 && <EmptyState text="現在、該当するタスクはありません。" />}
          </KanbanColumn>

          <KanbanColumn title="薬剤師確認・服薬指導" count={reviewTasks.length} tone="green">
            {isLoading && <EmptyState text="タスクを読み込んでいます..." tone="loading" />}
            {!isLoading && reviewTasks.map((task) => (
              <PatientTaskCard
                key={task.visitId}
                visitId={task.visitId}
                name={task.name}
                age={task.age}
                status={task.status}
                time={task.time}
                waitMinutes={task.waitMinutes}
                prescriptionCount={task.prescriptionCount}
                reviewFlags={task.reviewFlags}
                priority={task.priority}
                onOpen={() => handleOpenTask(task.visitId)}
                interactive
              />
            ))}
            {!isLoading && reviewTasks.length === 0 && <EmptyState text="現在、監査待ちのタスクはありません。" />}
          </KanbanColumn>
        </div>
      </section>

      <section id="followup-candidates" className="followup-section" aria-label="完了後フォロー候補">
        <div className="section-header">
          <div>
            <span className="section-title-line">
              <HeartPulse size={16} aria-hidden="true" />
              <h3>完了後フォロー候補</h3>
            </span>
            <p className="text-muted">重点フォロー薬・長期処方・患者アラート・疑義照会を拾い、次回確認日を提案します。</p>
          </div>
          <div className="section-metrics">
            {urgentFollowUpCount > 0 && <span className="section-count urgent">本日対応 {urgentFollowUpCount}</span>}
            <span className="section-count">{counts.followUpDueCount}件</span>
          </div>
        </div>

        <div className="followup-list">
          {isLoading && <EmptyState text="フォロー候補を読み込んでいます..." tone="loading" />}
          {!isLoading && visibleFollowUpCandidates.map((candidate) => (
            <FollowUpCandidateRow
              key={candidate.visitId}
              name={candidate.name}
              time={candidate.time}
              prescriptionCount={candidate.prescriptionCount}
              reasonFlags={candidate.reasonFlags}
              priority={candidate.priority}
              dueLabel={candidate.dueLabel}
              suggestedAction={candidate.suggestedAction}
              riskScore={candidate.riskScore}
              attemptCount={candidate.attemptCount}
              lastContactLabel={candidate.lastContactLabel}
              isOverdue={candidate.isOverdue}
              onOpen={() => handleOpenFollowUp(candidate.visitId)}
              onComplete={() => openFollowUpRecord(candidate)}
              isCompleting={completingFollowUpId === candidate.visitId}
            />
          ))}
          {!isLoading && visibleFollowUpCandidates.length === 0 && <EmptyState text="本日のフォロー候補はありません。" />}
        </div>
      </section>

      <section className="quick-actions" aria-label="よく使う操作">
        <button type="button" className="quick-action" onClick={() => router.push('/ocr')}>
          <FilePlus2 size={20} aria-hidden="true" />
          <span>処方箋を読み込む</span>
        </button>
        <button type="button" className="quick-action" onClick={() => router.push('/inventory')}>
          <PackageSearch size={20} aria-hidden="true" />
          <span>在庫を確認</span>
        </button>
        <button type="button" className="quick-action" onClick={() => router.push('/settings')}>
          <Settings size={20} aria-hidden="true" />
          <span>施設設定</span>
        </button>
        <button type="button" className="quick-action muted">
          <ShieldCheck size={20} aria-hidden="true" />
          <span>ローカル保存中</span>
        </button>
      </section>

      {recordingFollowUp && (
        <div className="followup-modal-backdrop" role="presentation" onMouseDown={closeFollowUpRecord}>
          <form
            className="followup-modal"
            aria-label={`${recordingFollowUp.name}さんの服薬フォロー対応記録`}
            onSubmit={handleCompleteFollowUp}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="followup-modal-header">
              <div>
                <h3>服薬フォロー対応記録</h3>
                <p>{recordingFollowUp.name}さん / {recordingFollowUp.time}・{recordingFollowUp.prescriptionCount}薬</p>
              </div>
              <button type="button" className="followup-modal-close" onClick={closeFollowUpRecord} aria-label="閉じる">
                ×
              </button>
            </div>

            <div className="followup-reasons modal" aria-label="フォロー理由">
              {recordingFollowUp.reasonFlags.map((flag) => (
                <span key={flag}>{flag}</span>
              ))}
            </div>

            <div className="followup-plan" aria-label="推奨フォロー計画">
              <span>推奨</span>
              <strong>{recordingFollowUp.dueLabel} / リスク {recordingFollowUp.riskScore}</strong>
              <p>{recordingFollowUp.suggestedAction}</p>
            </div>

            <label className="followup-field">
              <span>対応方法</span>
              <select value={followUpMethod} onChange={(e) => setFollowUpMethod(e.target.value as typeof followUpMethod)}>
                <option value="phone">電話</option>
                <option value="sms">SMS/メッセージ</option>
                <option value="visit">来局時</option>
                <option value="other">その他</option>
              </select>
            </label>

            <label className="followup-field">
              <span>対応内容</span>
              <textarea
                value={followUpNote}
                onChange={(e) => setFollowUpNote(e.target.value)}
                rows={4}
                placeholder="服薬状況、副作用、残薬、患者への説明内容など"
                required
              />
            </label>

            <div className="followup-modal-grid">
              <label className="followup-field">
                <span>次回確認日</span>
                <input type="date" value={followUpDueDate} onChange={(e) => setFollowUpDueDate(e.target.value)} />
              </label>
              <label className="followup-field">
                <span>次回アクション</span>
                <input
                  type="text"
                  value={followUpNextAction}
                  onChange={(e) => setFollowUpNextAction(e.target.value)}
                  placeholder="例: 3日後に副作用確認"
                />
              </label>
            </div>

            <div className="followup-modal-actions">
              <button type="button" className="btn-secondary" onClick={closeFollowUpRecord} disabled={!!completingFollowUpId}>
                キャンセル
              </button>
              <button type="button" className="btn-secondary" onClick={handleSaveFollowUpReminder} disabled={!!completingFollowUpId}>
                未完了で記録
              </button>
              <button type="submit" className="btn-primary" disabled={!!completingFollowUpId}>
                {completingFollowUpId && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                <span>{completingFollowUpId ? '保存中' : '記録して対応済み'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const KanbanColumn = React.memo(function KanbanColumn({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: 'neutral' | 'amber' | 'green';
  children: React.ReactNode;
}) {
  return (
    <div className="kanban-column">
      <div className="column-header">
        <h4>{title}</h4>
        <span className={`badge ${tone}`}>{count}</span>
      </div>
      <div className="task-list">{children}</div>
    </div>
  );
});

// tone: 'loading' でスピナー、'ok' でチェック(≒異常なし)を添え、
// 「読み込み中」と「確認済み・対象なし」を一目で区別できるようにする
const EmptyState = React.memo(function EmptyState({ text, tone = 'ok' }: { text: string; tone?: 'loading' | 'ok' }) {
  return (
    <div className="empty-state">
      {tone === 'loading'
        ? <Loader2 size={15} className="animate-spin" aria-hidden="true" />
        : <CheckCircle2 size={15} aria-hidden="true" />}
      <span>{text}</span>
    </div>
  );
});

const OPERATIONAL_AI_DOMAIN_META: Record<OperationalAiPrediction['domain'], {
  label: string;
  buttonLabel: string;
  Icon: React.ElementType;
}> = {
  claim_return: {
    label: '返戻',
    buttonLabel: '請求確認',
    Icon: FileCheck2
  },
  inventory_shortage: {
    label: '欠品',
    buttonLabel: '在庫管理',
    Icon: PackageSearch
  },
  follow_up: {
    label: 'フォロー',
    buttonLabel: '薬歴確認',
    Icon: HeartPulse
  }
};

const AiPredictionRow = React.memo(function AiPredictionRow({
  prediction,
  onOpen,
}: {
  prediction: OperationalAiPrediction;
  onOpen: () => void;
}) {
  const meta = OPERATIONAL_AI_DOMAIN_META[prediction.domain];
  const Icon = meta.Icon;

  return (
    <div className={`ai-prediction-row severity-${prediction.severity} domain-${prediction.domain}`}>
      <span className="ai-prediction-main">
        <span className="ai-prediction-name-line">
          <span className="ai-prediction-domain-badge">{meta.label}</span>
          <span className="ai-prediction-title">{prediction.title}</span>
          <span className="ai-prediction-score">スコア {prediction.score}</span>
          <span className="ai-prediction-confidence">信頼度 {prediction.confidence}%</span>
        </span>
        <span className="ai-prediction-message">{prediction.message}</span>
        <span className="ai-prediction-evidence" aria-label="AI補助予測の根拠">
          {prediction.evidence.slice(0, 3).map((evidence) => (
            <span key={`${prediction.predictionId}-${evidence.label}`}>{evidence.label}: {evidence.detail}</span>
          ))}
        </span>
      </span>
      <span className="ai-prediction-action">{prediction.suggestedAction}</span>
      <button type="button" className="ai-prediction-button" onClick={onOpen}>
        <Icon size={14} aria-hidden="true" />
        <span>{meta.buttonLabel}</span>
      </button>
    </div>
  );
});

const PatientTaskCard = React.memo(function PatientTaskCard({
  visitId,
  name,
  age,
  status,
  time,
  waitMinutes,
  prescriptionCount,
  reviewFlags,
  priority,
  interactive,
  onOpen,
}: {
  visitId: string;
  name: string;
  age: string;
  status: string;
  time: string;
  waitMinutes: number;
  prescriptionCount: number;
  reviewFlags: string[];
  priority: 'high' | 'medium' | 'normal';
  interactive?: boolean;
  onOpen?: () => void;
}) {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!onOpen) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  }, [onOpen]);

  return (
    <div
      className={`card patient-mini-card priority-${priority} ${interactive ? 'interactive' : ''}`}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `${name}さんの薬剤師確認を開く` : undefined}
      data-visit-id={visitId}
    >
      <div className="card-top">
        <span className="name">{name}</span>
        <span className="time">{time}</span>
      </div>
      <div className="card-bottom">
        <span className="age">{age}歳</span>
        <span className={`status-tag ${priority === 'high' ? 'urgent' : ''}`}>{status}</span>
      </div>
      <div className="task-meta-row">
        <span>{prescriptionCount}薬</span>
        <span>{waitMinutes}分</span>
      </div>
      {reviewFlags.length > 0 && (
        <div className="review-flags" aria-label="確認項目">
          {reviewFlags.slice(0, 3).map((flag) => (
            <span key={flag}>{flag}</span>
          ))}
        </div>
      )}
    </div>
  );
});

const FollowUpCandidateRow = React.memo(function FollowUpCandidateRow({
  name,
  time,
  prescriptionCount,
  reasonFlags,
  priority,
  dueLabel,
  suggestedAction,
  riskScore,
  attemptCount,
  lastContactLabel,
  isOverdue,
  isCompleting,
  onOpen,
  onComplete,
}: {
  name: string;
  time: string;
  prescriptionCount: number;
  reasonFlags: string[];
  priority: 'high' | 'medium';
  dueLabel: string;
  suggestedAction: string;
  riskScore: number;
  attemptCount: number;
  lastContactLabel?: string;
  isOverdue: boolean;
  isCompleting: boolean;
  onOpen: () => void;
  onComplete: () => void;
}) {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  }, [onOpen]);

  return (
    <div
      className={`followup-row priority-${priority}`}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${name}さんのフォロー薬歴を開く`}
    >
      <span className="followup-main">
        <span className="followup-name-line">
          <span className="followup-name">{name}</span>
          <span className="followup-risk-badge">リスク {riskScore}</span>
        </span>
        <span className="followup-meta">{time}・{prescriptionCount}薬 / {isOverdue ? '期限超過' : dueLabel}</span>
        {attemptCount > 0 && (
          <span className="followup-meta contact">接触{attemptCount}回{lastContactLabel ? ` / ${lastContactLabel}` : ''}</span>
        )}
        <span className="followup-plan-line">{suggestedAction}</span>
      </span>
      <span className="followup-reasons" aria-label="フォロー理由">
        {reasonFlags.slice(0, 3).map((flag) => (
          <span key={flag}>{flag}</span>
        ))}
      </span>
      <span className="followup-actions">
        <button
          type="button"
          className="followup-complete-button"
          onClick={(e) => {
            e.stopPropagation();
            onComplete();
          }}
          disabled={isCompleting}
        >
          <CheckCircle2 size={14} aria-hidden="true" />
          <span>{isCompleting ? '更新中' : '対応記録'}</span>
        </button>
        <ArrowRight size={16} aria-hidden="true" />
      </span>
    </div>
  );
});

const ClaimRiskRow = React.memo(function ClaimRiskRow({
  name,
  time,
  prescriptionCount,
  totalPoints,
  errorCount,
  warningCount,
  priority,
  riskScore,
  topIssueTitles,
  actionLabel,
  onOpen,
}: Omit<DashboardClaimRisk, 'visitId' | 'patientId'> & {
  onOpen: () => void;
}) {
  const issueSummary = topIssueTitles.length > 0
    ? topIssueTitles.join(' / ')
    : '請求前チェックを確認';

  return (
    <div className={`claim-risk-row priority-${priority}`}>
      <span className="claim-risk-main">
        <span className="claim-risk-name-line">
          <span className="claim-risk-name">{name}</span>
          <span className={`claim-risk-badge ${priority}`}>{priority === 'high' ? '要修正' : '要確認'}</span>
          <span className="claim-risk-score">リスク {riskScore}</span>
        </span>
        <span className="claim-risk-meta">
          {time}・{prescriptionCount}薬 / {totalPoints.toLocaleString('ja-JP')}点 / 要修正 {errorCount}・確認 {warningCount}
        </span>
        <span className="claim-risk-issues">{issueSummary}</span>
      </span>
      <span className="claim-risk-action">{actionLabel}</span>
      <button type="button" className="claim-risk-button" data-testid="claim-risk-open-print" onClick={onOpen}>
        <FileCheck2 size={14} aria-hidden="true" />
        <span>請求確認</span>
      </button>
    </div>
  );
});

const ClaimWorkbenchRow = React.memo(function ClaimWorkbenchRow({
  item,
  onOpen,
}: {
  item: DashboardClaimWorkItem;
  onOpen: () => void;
}) {
  return (
    <div className={`claim-workbench-row priority-${item.priority} status-${item.status}`}>
      <span className="claim-workbench-main">
        <span className="claim-workbench-name-line">
          <span className="claim-workbench-name">{item.name}</span>
          <span className={`claim-workbench-badge ${item.priority}`}>{item.priorityLabel}</span>
          <span className={`claim-workbench-status ${item.status}`}>{item.statusLabel}</span>
        </span>
        <span className="claim-workbench-meta">
          {item.issueDateLabel} / {item.monthLabel} / {item.totalPoints.toLocaleString('ja-JP')}点 / {item.prescriptionCount}薬
        </span>
        <span className="claim-workbench-event">
          {item.latestEventLabel}{item.exportedFileName ? ` / ${item.exportedFileName}` : ''}
        </span>
        {item.reason && <span className="claim-workbench-reason">{item.reason}</span>}
      </span>
      <span className="claim-workbench-action">{item.actionLabel}</span>
      <button type="button" className="claim-workbench-button" data-testid="claim-workbench-open-print" onClick={onOpen}>
        <FileCheck2 size={14} aria-hidden="true" />
        <span>請求確認</span>
      </button>
    </div>
  );
});

const InventoryRiskRow = React.memo(function InventoryRiskRow({
  drugName,
  location,
  supplierName,
  requiredAmount,
  availableAmount,
  shortageAmount,
  recommendedOrderAmount,
  affectedVisitCount,
  affectedPatientNames,
  priority,
  actionLabel,
  pickingShortageAmount,
  onOpen,
}: Omit<DashboardInventoryRisk, 'drugId'> & {
  onOpen: () => void;
}) {
  const patientSummary = affectedPatientNames.length > 0
    ? affectedPatientNames.slice(0, 3).join('、')
    : '患者名未登録';
  const remainingCount = Math.max(0, affectedPatientNames.length - 3);

  return (
    <div className={`inventory-risk-row priority-${priority}`}>
      <span className="inventory-risk-main">
        <span className="inventory-risk-name-line">
          <span className="inventory-risk-name">{drugName}</span>
          <span className={`inventory-risk-badge ${priority}`}>{priority === 'high' ? '至急' : '注意'}</span>
          {(pickingShortageAmount || 0) > 0 && (
            <span className="inventory-risk-badge high">棚不足報告 {formatInventoryAmount(pickingShortageAmount as number)}</span>
          )}
        </span>
        <span className="inventory-risk-meta">
          必要 {formatInventoryAmount(requiredAmount)} / 在庫 {formatInventoryAmount(availableAmount)} / 不足 {formatInventoryAmount(shortageAmount)}
        </span>
        <span className="inventory-risk-order">
          発注目安 {formatInventoryAmount(recommendedOrderAmount)} / 仕入先候補 {supplierName}
        </span>
        <span className="inventory-risk-patients">
          {affectedVisitCount}件: {patientSummary}{remainingCount > 0 ? ` ほか${remainingCount}名` : ''}
        </span>
      </span>
      <span className="inventory-risk-side">
        <span className="inventory-risk-location">{location}</span>
        <span className="inventory-risk-action">{actionLabel}</span>
      </span>
      <button type="button" className="inventory-risk-button" onClick={onOpen} title="発注ワークベンチを開きます">
        <PackageSearch size={14} aria-hidden="true" />
        <span>発注へ</span>
      </button>
    </div>
  );
});

const KpiCard = React.memo(function KpiCard({
  icon: Icon,
  tone,
  label,
  value,
  subLabel,
  detail,
}: {
  icon: React.ElementType;
  tone: 'blue' | 'amber' | 'red' | 'green';
  label: string;
  value: string | number;
  subLabel: string;
  detail: string;
}) {
  return (
    <div className={`kpi-card ${tone}`}>
      <span className="kpi-icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="kpi-copy">
        <span className="kpi-label">{label}</span>
        <span className="kpi-value">{value}</span>
        <span className="kpi-sub">{subLabel}</span>
        <span className="kpi-detail">{detail}</span>
      </span>
    </div>
  );
});

const OperationTile = React.memo(function OperationTile({
  icon: Icon,
  label,
  value,
  subLabel,
  tone,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  subLabel: string;
  tone: 'blue' | 'amber' | 'red' | 'green' | 'teal';
  onClick: () => void;
}) {
  return (
    <button type="button" className={`operation-tile ${tone}`} onClick={onClick}>
      <span className="operation-icon">
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="operation-copy">
        <span className="operation-label">{label}</span>
        <span className="operation-value">{value}</span>
        <span className="operation-sub">{subLabel}</span>
      </span>
    </button>
  );
});

const StatCard = React.memo(function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  subLabel,
}: {
  icon: React.ElementType;
  tone: 'blue' | 'amber' | 'red' | 'green';
  label: string;
  value: string | number;
  subLabel: string;
}) {
  return (
    <div className="card stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon size={23} aria-hidden="true" />
      </div>
      <div>
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
        <span className="stat-sub">{subLabel}</span>
      </div>
    </div>
  );
});
