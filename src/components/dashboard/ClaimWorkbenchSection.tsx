'use client';

import React, { useState, useCallback } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  FileCheck2,
  FileText,
  Loader2,
  ShieldCheck,
  Upload
} from 'lucide-react';
import { toast } from 'sonner';
import { canUserPerform, getCurrentUser, getPermissionDeniedMessage, logAuditAction } from '@/lib/audit';
import { markClaimClosed, markClaimExported } from '@/lib/claim_lifecycle';
import { buildClaimExportSnapshot } from '@/lib/claim_snapshot';
import { isDemoVisit } from '@/lib/demo_data';
import {
  buildClaimOfficialRuleBatchReviewCsv,
  makeClaimOfficialRuleReviewFileName
} from '@/lib/claim_rule_review';
import {
  buildClaimWorkbenchCsv,
  buildClaimWorkbenchMemo,
  isClaimWorkbenchClosable,
  isClaimWorkbenchUkeExportable
} from '@/lib/claim_workbench';
import {
  buildMonthlyClaimOfficialUkeBundle,
  buildMonthlyClaimUkeBundle,
  buildMonthlyClaimUkePreflightReport,
  buildMonthlyClaimUkeResults,
  formatMonthlyClaimUkeAllFieldIssues,
  formatMonthlyClaimUkeBatchIssues,
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
import {
  toPlain,
  readTextFile,
  downloadUtf8Csv,
  toClaimWorkbenchExportItem,
  buildClaimRuleReviewForCases,
  formatClaimRuleAttentionForScreen
} from '@/lib/dashboard_helpers';
import { EmptyState } from './DashboardCards';
import { ClaimWorkbenchRow } from './DashboardRows';
import type { DashboardClaimWorkItem, DashboardCounts } from '@/hooks/useDashboardTasks';
import { resolveDrugPrice } from '@/lib/drug_price_history';
import { calculateDispensingFees } from '@/lib/calculator';

export interface ClaimWorkbenchSectionProps {
  db: any;
  claimWorkItems: DashboardClaimWorkItem[];
  counts: DashboardCounts;
  isLoading: boolean;
  onOpenTask: (visitId: string) => void;
  onRefresh: () => void;
}

export function ClaimWorkbenchSection({
  db,
  claimWorkItems,
  counts,
  isLoading,
  onOpenTask,
  onRefresh
}: ClaimWorkbenchSectionProps) {
  const [isExportingUke, setIsExportingUke] = useState(false);
  const [isExportingOfficialUke, setIsExportingOfficialUke] = useState(false);
  const [isCheckingOfficialReadiness, setIsCheckingOfficialReadiness] = useState(false);
  const [isCheckingRules, setIsCheckingRules] = useState(false);
  const [isImportingAcceptance, setIsImportingAcceptance] = useState(false);
  const [isClosingAccepted, setIsClosingAccepted] = useState(false);

  const visibleClaimWorkItems = claimWorkItems.slice(0, 5);
  const hasExportableClaimWorkItems = claimWorkItems.some((item) => isClaimWorkbenchUkeExportable(item.status));
  const acceptedClaimWorkItemCount = claimWorkItems.filter((item) => isClaimWorkbenchClosable(item.status)).length;

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
      .map((doc: any) => ({ doc, visit: toPlain<any>(doc) }))
      // 念のための防御: デモ受付が請求対象に紛れても、UKEへは絶対に載せない
      .filter((row: any) => !isDemoVisit(row.visit))
      .sort((left: any, right: any) => {
        const leftDate = left.visit.dispensingDate || left.visit.prescriptionDate || left.visit.issueDate || '';
        const rightDate = right.visit.dispensingDate || right.visit.prescriptionDate || right.visit.issueDate || '';
        return leftDate.localeCompare(rightDate) || String(left.visit.visitId).localeCompare(String(right.visit.visitId));
      });
    const visits = visitRows.map((row: any) => row.visit);
    const orderedVisitDocs = visitRows.map((row: any) => row.doc);
    const patientIds = Array.from(new Set(visits.map((visit: any) => visit.patientId).filter(Boolean)));
    const prescriptionDocs = targetVisitIds.length > 0
      ? await db.prescription_items.find({ selector: { visitId: { $in: targetVisitIds } } }).exec()
      : [];
    const prescriptionItems = prescriptionDocs.map((doc: any) => toPlain<any>(doc));
    const drugIds = new Set<string>();
    for (const item of prescriptionItems) {
      if (item.drugId) drugIds.add(item.drugId);
      if (item.dispensedDrugCode) drugIds.add(item.dispensedDrugCode);
    }

    const [patientMap, drugMap, interventionDocs] = await Promise.all([
      patientIds.length > 0 ? db.patients.findByIds(patientIds).exec() : Promise.resolve(new Map()),
      drugIds.size > 0 ? db.drugs.findByIds(Array.from(drugIds)).exec() : Promise.resolve(new Map()),
      targetVisitIds.length > 0 ? db.interventions.find({ selector: { visitId: { $in: targetVisitIds } } }).exec() : Promise.resolve([])
    ]);
    const interventions = interventionDocs.map((doc: any) => toPlain<any>(doc));
    const interventionsByVisitId = new Map<string, any[]>();
    for (const intervention of interventions) {
      const list = interventionsByVisitId.get(intervention.visitId) || [];
      list.push(intervention);
      interventionsByVisitId.set(intervention.visitId, list);
    }

    const cases: MonthlyClaimUkeCase[] = [];
    const missingMessages: string[] = [];

    for (const visit of visits) {
      const patient = toPlain<any>(patientMap.get(visit.patientId));
      if (!patient) {
        missingMessages.push(`患者ID ${visit.patientId} (受付 ${visit.visitId}) の患者情報が見つかりません。`);
        continue;
      }
      const rawItems = prescriptionItems.filter((item: any) => item.visitId === visit.visitId);
      if (rawItems.length === 0) {
        missingMessages.push(`受付 ${visit.visitId} (${patient.name || '氏名未設定'}) の処方明細が見つかりません。`);
        continue;
      }

      // 月次請求も薬価は「調剤日時点」で引く。現在のマスター薬価で組むと、
      // 薬価改定後の再請求で過去分の点数が動いてしまう。
      const dispensingDateForPrice = visit.dispensingDate || visit.issueDate || '';

      const items = rawItems.map((item: any) => {
        const drug = toPlain<any>(drugMap.get(item.dispensedDrugCode || item.drugId) || drugMap.get(item.drugId));
        return {
          ...item,
          drugName: drug?.name || item.drugName || item.drugId,
          price: resolveDrugPrice(drug ?? {}, dispensingDateForPrice).price ?? item.price ?? 0,
          yjCode: drug?.yjCode || item.yjCode,
          genericName: drug?.genericName || item.genericName,
          isHighRisk: !!(drug?.isHighRisk || item.isHighRisk)
        };
      });

      const calculatedFees = calculateDispensingFees(
        settingsData,
        items,
        patient,
        visit.issueDate,
        visit.claimOptions
      );

      cases.push({
        visit,
        patient,
        settings: settingsData,
        items,
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
    const exportableClaimWorkItems = claimWorkItems.filter((item) => isClaimWorkbenchUkeExportable(item.status));
    if (exportableClaimWorkItems.length === 0) {
      toast.info('公式提出準備を確認できる再請求準備の受付はありません。');
      return;
    }

    setIsCheckingOfficialReadiness(true);
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
        `月次一括UKE公式提出準備レビューCSV: ${fileName} / 受付 ${preflightReport.totalClaims}件 / 公式提出準備 ${preflightReport.officialReadinessSummary.readyFeeCount}/${preflightReport.officialReadinessSummary.checkedFeeCount}算定、${preflightReport.officialReadinessSummary.readyDrugItemCount}/${preflightReport.officialReadinessSummary.checkedDrugItemCount}薬剤 / 要対応 ${preflightReport.officialReadinessSummary.errorCount}件 / allFields確認 ${preflightReport.allFieldSourceSummary.sourceUrl || ''}。`
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
      setIsCheckingOfficialReadiness(false);
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

    setIsCheckingRules(true);
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
      setIsCheckingRules(false);
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

    setIsExportingOfficialUke(true);
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
          `月次公式UKE作成停止: 算定ルールの要確認 ${ruleReport.attentionCount}項目を患者情報なしCSV「${ruleFileName}」へ書き出しました。`
        );
        if (!auditOk) {
          throw new Error('月次公式UKE作成停止ログの記録に失敗したため、処理を中断しました。');
        }
        downloadUtf8Csv(ruleFileName, buildClaimOfficialRuleBatchReviewCsv(ruleReport));
        alert(`公式提出形式へ切り替える前に算定ルールの確認が必要です。\n\n${formatClaimRuleAttentionForScreen(ruleReport, cases)}\n\n患者情報なしCSV: ${ruleFileName}`);
        return;
      }

      const results = buildMonthlyClaimUkeResults(cases, generatedAt);
      const preflightReport = buildMonthlyClaimUkePreflightReport(results);
      if (!preflightReport.officialReadinessSummary.ok) {
        const reviewFileName = makeMonthlyClaimUkeOfficialReadinessIssueFileName(generatedAt);
        const auditOk = await logAuditAction(
          db,
          'uke_export',
          `月次公式UKE出力停止: 公式提出準備の要対応 ${preflightReport.officialReadinessSummary.errorCount}件 / ${formatMonthlyClaimUkeOfficialSampleScopeReport(preflightReport.officialSampleScopeReport)} を患者情報なしCSV「${reviewFileName}」へ書き出しました。`
        );
        if (!auditOk) {
          throw new Error('公式提出準備未対応ログの記録に失敗したため、処理を中断しました。');
        }
        downloadUtf8Csv(reviewFileName, preflightReport.officialReadinessReviewCsv);
        alert(`公式UKEを作成する前に公式提出準備の確認が必要です。\n\n${formatMonthlyClaimUkeOfficialReadinessIssues(preflightReport.officialReadinessIssues)}\n\n患者情報なしCSV: ${reviewFileName}`);
        return;
      }

      const bundle = buildMonthlyClaimOfficialUkeBundle(cases, results);
      const officialFileName = makeMonthlyClaimUkeFileName(generatedAt);
      for (let i = 0; i < visitDocs.length; i++) {
        const visitDoc = visitDocs[i];
        const caseItem = cases[i];
        const previousLifecycle = visitDoc.claimLifecycle ? toPlain(visitDoc.claimLifecycle) : undefined;
        claimLifecycleRollbacks.push({ visitDoc, previousLifecycle });
        const updatedLifecycle = markClaimExported({
          current: previousLifecycle,
          at: generatedAt.toISOString(),
          by: operator.name || '管理者',
          fileName: officialFileName,
          totalPoints: bundle.totalPoints,
          exportSnapshot: caseItem ? buildClaimExportSnapshot({
            visit: caseItem.visit,
            patient: caseItem.patient,
            items: caseItem.items,
            totalPoints: results[i]?.totalPoints ?? 0,
            createdAt: generatedAt.toISOString(),
            exportedFileName: officialFileName
          }) : undefined
        });
        await visitDoc.patch({ claimLifecycle: updatedLifecycle });
      }

      const lifecycleAuditOk = await logAuditAction(
        db,
        'claim_lifecycle',
        `月次公式UKE請求状態更新: ${officialFileName} / 対象 ${visitDocs.length}件を exported へ更新しました。`
      );
      if (!lifecycleAuditOk) {
        throw new Error('月次公式UKEの請求状態監査ログ記録に失敗しました');
      }

      const reconciliation = bundle.officialReconciliationReport;
      const exportAuditOk = await logAuditAction(
        db,
        'uke_export',
        `月次公式UKE出力: ${officialFileName} / RECEIPTY.CYO|bundle.fileName / 受付 ${cases.length}件 / 合計 ${bundle.totalPoints}点 / 提出準備確認済み / 集計突合OK (IR加算・情報料・調基 ${reconciliation.totalSupplementalRecordCount} / 処方 ${reconciliation.totalPrescriptionRecordCount} / 剤 ${reconciliation.totalSplitRecordCount} / 請求 ${reconciliation.goTotalPoints}点)。`
      );
      if (!exportAuditOk) {
        throw new Error('月次公式UKE出力の監査ログ記録に失敗したため、出力を中止しました。');
      }

      const blob = new Blob([bundle.content as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = officialFileName;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`公式UKEを出力しました（${cases.length}件・${officialFileName}）。`);
      onRefresh();
    } catch (err: any) {
      console.error('Failed to export official UKE:', err);
      for (const rollback of claimLifecycleRollbacks) {
        try {
          await rollback.visitDoc.patch({ claimLifecycle: rollback.previousLifecycle });
        } catch (rErr) {
          console.error('Failed to rollback monthly official claim lifecycle changes:', rErr);
        }
      }
      toast.error(`公式UKEの出力に失敗しました: ${err.message || err}`);
    } finally {
      setIsExportingOfficialUke(false);
    }
  }, [buildClaimWorkbenchUkeCases, claimWorkItems, db, onRefresh]);

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
    const exportableClaimWorkItems = claimWorkItems.filter((item) => isClaimWorkbenchUkeExportable(item.status));
    if (exportableClaimWorkItems.length === 0) {
      toast.info('UKEを出力できる再請求準備の受付はありません。');
      return;
    }

    setIsExportingUke(true);
    const claimLifecycleRollbacks: Array<{ visitDoc: any; previousLifecycle: any }> = [];
    try {
      const { cases, missingMessages, visits, visitDocs } = await buildClaimWorkbenchUkeCases(exportableClaimWorkItems);
      if (missingMessages.length > 0) {
        alert(`オンライン請求受付前チェック前に確認が必要な受付があります。\n\n${missingMessages.slice(0, 8).join('\n')}${missingMessages.length > 8 ? `\nほか${missingMessages.length - 8}件` : ''}`);
        return;
      }
      if (cases.length === 0) {
        toast.info('UKEを出力できる受付がありません。');
        return;
      }

      const generatedAt = new Date();
      const results = buildMonthlyClaimUkeResults(cases, generatedAt);
      const preflightReport = buildMonthlyClaimUkePreflightReport(results);
      if (preflightReport.errorResults.length > 0) {
        const allFieldIssueFileName = makeMonthlyClaimUkeAllFieldIssueFileName(generatedAt);
        const auditOk = await logAuditAction(
          db,
          'uke_export',
          `月次一括UKE出力停止: UKE事前検証エラー ${preflightReport.errorResults.length}件 / 全項目定義の指摘 allFields指摘 ${preflightReport.allFieldIssues.length}件を患者情報なしCSV「${allFieldIssueFileName}」へ書き出しました。`
        );
        if (!auditOk) {
          throw new Error('月次一括UKE出力停止ログの監査ログ記録に失敗したため、確認CSVの出力を中止しました。');
        }
        downloadUtf8Csv(allFieldIssueFileName, preflightReport.allFieldIssueCsv);
        alert(`UKEを出力する前にエラーの解消が必要です。\n\n${formatMonthlyClaimUkeBatchIssues(preflightReport.batchIssues)}\n${formatMonthlyClaimUkeAllFieldIssues(preflightReport.allFieldIssues)}\n\n患者情報なしCSV: ${allFieldIssueFileName}`);
        return;
      }
      if (preflightReport.warningResults.length > 0) {
        // 警告のみの場合は継続可能
      }

      const bundle = buildMonthlyClaimUkeBundle(results);
      const ukeFileName = makeMonthlyClaimUkeFileName(generatedAt);
      for (let i = 0; i < visitDocs.length; i++) {
        const visitDoc = visitDocs[i];
        const caseItem = cases[i];
        const previousLifecycle = visitDoc.claimLifecycle ? toPlain(visitDoc.claimLifecycle) : undefined;
        claimLifecycleRollbacks.push({ visitDoc, previousLifecycle });
        const updatedLifecycle = markClaimExported({
          current: previousLifecycle,
          at: generatedAt.toISOString(),
          by: operator.name || '管理者',
          fileName: ukeFileName,
          totalPoints: bundle.totalPoints,
          exportSnapshot: caseItem ? buildClaimExportSnapshot({
            visit: caseItem.visit,
            patient: caseItem.patient,
            items: caseItem.items,
            totalPoints: results[i]?.totalPoints ?? 0,
            createdAt: generatedAt.toISOString(),
            exportedFileName: ukeFileName
          }) : undefined
        });
        await visitDoc.patch({ claimLifecycle: updatedLifecycle });
      }

      const lifecycleAuditOk = await logAuditAction(
        db,
        'claim_lifecycle',
        `月次一括UKE請求状態更新: ${ukeFileName} / 対象 ${visitDocs.length}件を exported へ更新しました。`
      );
      if (!lifecycleAuditOk) {
        throw new Error('月次一括UKEの請求状態監査ログ記録に失敗しました');
      }

      const exportAuditOk = await logAuditAction(
        db,
        'uke_export',
        `月次一括UKE出力: ${ukeFileName} / 受付 ${cases.length}件 / 合計 ${bundle.totalPoints}点。`
      );
      if (!exportAuditOk) {
        throw new Error('月次一括UKE出力の監査ログ記録に失敗したため、出力を中止しました。');
      }

      const blob = new Blob([bundle.content as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = ukeFileName;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`月次一括UKEを作成しました（${cases.length}件・${ukeFileName}）。`);
      onRefresh();
    } catch (err: any) {
      console.error('Failed to export UKE:', err);
      for (const rollback of claimLifecycleRollbacks) {
        try {
          await rollback.visitDoc.patch({ claimLifecycle: rollback.previousLifecycle });
        } catch (rErr) {
          console.error('Failed to rollback monthly claim lifecycle changes:', rErr);
        }
      }
      toast.error(`UKEの出力に失敗しました: ${err.message || err}`);
    } finally {
      setIsExportingUke(false);
    }
  }, [buildClaimWorkbenchUkeCases, claimWorkItems, db, onRefresh]);

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
    const closable = claimWorkItems.filter((item) => isClaimWorkbenchClosable(item.status));
    if (closable.length === 0) {
      toast.info('締め処理ができる受付済みの請求ワークはありません。');
      return;
    }
    const closedCount = closable.length;
    if (!window.confirm(`受付済みの請求 ${closedCount}件を請求完了（締め）にしますか？`)) {
      return;
    }

    setIsClosingAccepted(true);
    const claimLifecycleRollbacks: Array<{ visitDoc: any; previousLifecycle: any }> = [];
    try {
      const targetVisitIds = closable.map((item) => item.visitId);
      const visitDocs = await db.visits.find({ selector: { visitId: { $in: targetVisitIds } } }).exec();
      const closedAt = new Date();

      for (const visitDoc of visitDocs) {
        const previousLifecycle = visitDoc.claimLifecycle ? toPlain(visitDoc.claimLifecycle) : undefined;
        claimLifecycleRollbacks.push({ visitDoc, previousLifecycle });
        const updatedLifecycle = markClaimClosed({
          current: previousLifecycle,
          at: closedAt.toISOString(),
          by: operator.name || '管理者',
          note: '月次請求ワークベンチ一括締め'
        });
        await visitDoc.patch({ claimLifecycle: updatedLifecycle });
      }

      const auditOk = await logAuditAction(
        db,
        'claim_lifecycle',
        `月次請求一括締め完了: 受付済 ${closedCount}件を請求完了（closed）に更新しました。`
      );
      if (!auditOk) {
        throw new Error('一括締め完了の監査ログ記録に失敗しました。');
      }
      toast.success(`受付済み請求 ${closedCount}件を請求完了として締めました`);
      onRefresh();
    } catch (err: any) {
      console.error('Failed to close accepted claims:', err);
      for (const rollback of claimLifecycleRollbacks) {
        try {
          await rollback.visitDoc.patch({ claimLifecycle: rollback.previousLifecycle });
        } catch (rErr) {
          console.error('Rollback error:', rErr);
        }
      }
      toast.error(`請求完了の更新に失敗しました: ${err.message || err}`);
    } finally {
      setIsClosingAccepted(false);
    }
  }, [claimWorkItems, db, onRefresh]);

  const handleImportClaimAcceptanceResults = useCallback(async () => {
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
    input.accept = '.csv,.txt,.dat';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsImportingAcceptance(true);
      try {
        const text = await readTextFile(file);
        const parseResult = parseOnlineClaimAcceptanceResults(text);
        if (parseResult.rows.length === 0) {
          alert(`審査結果ファイルの解析に失敗しました。\n\n${formatOnlineClaimAcceptanceIssues(parseResult.issues)}`);
          return;
        }

        const visits = await db.visits.find().exec();
        const plainVisits = visits.map((v: any) => toPlain(v));
        const reconcileResult = reconcileOnlineClaimAcceptanceResults({
          rows: parseResult.rows,
          visits: plainVisits,
          importedAt: new Date().toISOString(),
          importedBy: operator.name || '管理者'
        });

        const matchedItems = reconcileResult.items.filter((item: any) => item.visit && item.nextLifecycle);
        if (matchedItems.length === 0) {
          alert(`一致する受付が見つかりませんでした。\nフォーマット: ${formatOnlineClaimAcceptanceSourceFormat(parseResult.sourceFormat)}`);
          return;
        }

        for (const matched of matchedItems) {
          const doc = visits.find((v: any) => v.visitId === matched.row.visitId);
          if (doc && matched.nextLifecycle) {
            await doc.patch({ claimLifecycle: matched.nextLifecycle });
          }
        }

        await logAuditAction(
          db,
          'claim_lifecycle',
          `オンライン請求審査結果取込: ${file.name} / 取込形式 ${formatOnlineClaimAcceptanceSourceFormat(parseResult.sourceFormat)} / 一致 ${matchedItems.length}件 / 受付済 ${reconcileResult.acceptedCount}件 / 返戻 ${reconcileResult.returnedCount}件。`
        );
        toast.success(`受付結果を取り込みました（${matchedItems.length}件更新・取込形式: ${formatOnlineClaimAcceptanceSourceFormat(parseResult.sourceFormat)}）。`);
        onRefresh();
      } catch (err: any) {
        console.error('Failed to import acceptance results:', err);
        toast.error(`審査結果の取込に失敗しました: ${err.message || err}`);
      } finally {
        setIsImportingAcceptance(false);
      }
    };
    input.click();
  }, [db, onRefresh]);

  const handleCopyClaimWorkbenchMemo = useCallback(async () => {
    if (claimWorkItems.length === 0) return;
    const memo = buildClaimWorkbenchMemo(claimWorkItems.map(toClaimWorkbenchExportItem));
    try {
      await navigator.clipboard.writeText(memo);
      toast.success('月次請求メモをコピーしました');
    } catch {
      toast.error('メモのコピーに失敗しました。');
    }
  }, [claimWorkItems]);

  const handleExportClaimWorkbenchCsv = useCallback(() => {
    if (claimWorkItems.length === 0) return;
    const csv = buildClaimWorkbenchCsv(claimWorkItems.map(toClaimWorkbenchExportItem));
    downloadUtf8Csv(`claim_workbench_${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success('月次請求ワークCSVを作成しました');
  }, [claimWorkItems]);

  const handleOpenTaskInternal = useCallback((visitId: string) => onOpenTask(visitId), [onOpenTask]);
  const handleOpenTask = handleOpenTaskInternal;

  return (
    <section
      id="claim-workbench"
      className="claim-workbench-section"
      aria-label="レセプト点検・月次請求ワークベンチ"
      data-testid="monthly-claim-workbench"
    >
      <div className="section-header">
        <div>
          <span className="section-title-line">
            <FileText size={16} aria-hidden="true" />
            <h3>レセプト点検・月次請求ワークベンチ</h3>
          </span>
          <p className="text-muted">当月・過去分のUKE出力済み、返戻対応、再請求/月遅れ準備、公式提出前チェック、審査結果（受付済・返戻）の突合・再請求を一元管理します。</p>
        </div>
        <div className="section-metrics">
          <button
            type="button"
            className="section-action-button"
            data-testid="monthly-claim-uke-button"
            onClick={handleDownloadClaimWorkbenchUke}
            disabled={!hasExportableClaimWorkItems || isExportingUke || isExportingOfficialUke || isCheckingOfficialReadiness || isCheckingRules}
          >
            {isExportingUke ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
            <span>{isExportingUke ? '作成中' : '一括UKE'}</span>
          </button>
          <button
            type="button"
            className="section-action-button primary"
            data-testid="monthly-claim-official-uke-button"
            onClick={handleDownloadClaimWorkbenchOfficialUke}
            disabled={!hasExportableClaimWorkItems || isExportingOfficialUke || isExportingUke || isCheckingOfficialReadiness || isCheckingRules}
          >
            {isExportingOfficialUke ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
            <span>{isExportingOfficialUke ? '作成中' : '公式UKE'}</span>
          </button>
          <button
            type="button"
            className="section-action-button"
            data-testid="monthly-claim-official-readiness-button"
            onClick={handleDownloadClaimWorkbenchOfficialReadiness}
            disabled={!hasExportableClaimWorkItems || isCheckingOfficialReadiness || isExportingUke || isExportingOfficialUke || isCheckingRules}
          >
            {isCheckingOfficialReadiness ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
            <span>{isCheckingOfficialReadiness ? '確認中' : '公式確認'}</span>
          </button>
          <button
            type="button"
            className="section-action-button"
            data-testid="monthly-claim-rule-review-button"
            onClick={handleDownloadClaimWorkbenchRuleReview}
            disabled={!hasExportableClaimWorkItems || isCheckingRules || isCheckingOfficialReadiness || isExportingUke || isExportingOfficialUke}
          >
            {isCheckingRules ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FileCheck2 size={14} aria-hidden="true" />}
            <span>{isCheckingRules ? '確認中' : '算定ルール'}</span>
          </button>
          <button
            type="button"
            className="section-action-button primary"
            data-testid="monthly-claim-close-accepted-button"
            onClick={handleCloseAcceptedClaimWorkbenchItems}
            disabled={acceptedClaimWorkItemCount === 0 || isClosingAccepted}
          >
            {isClosingAccepted ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
            <span>{isClosingAccepted ? '締め中' : '受付済締め'}</span>
          </button>
          <button
            type="button"
            className="section-action-button"
            data-testid="claim-acceptance-import-button"
            onClick={handleImportClaimAcceptanceResults}
            disabled={isImportingAcceptance}
          >
            {isImportingAcceptance ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}
            <span>{isImportingAcceptance ? '取込中' : '結果取込'}</span>
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
  );
}
