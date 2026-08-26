'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { AuditLog, PharmacyDatabase, User, FacilitySettings } from '@/db/types';
import { logAuditAction } from '@/lib/audit';
import {
  buildAuditLogExportJson,
  buildAuditLogRetentionLedgerCsv,
  buildAuditLogRetentionManagerReviewAuditDetail,
  buildAuditLogRetentionMonthlyReview,
  buildAuditLogRetentionMonthlyReviewCsv,
  verifyAuditLogIntegrity,
  type AuditIntegrityReport,
  type AuditLogRetentionMonthlyReview
} from '@/lib/audit_integrity';
import {
  buildOperationalClosingMonthlyReview,
  buildOperationalClosingMonthlyReviewCsv,
  buildOperationalClosingStoreBenchmarkActionAuditDetail,
  buildOperationalClosingStoreBenchmarkActionPostponementAuditDetail,
  buildOperationalClosingStoreBenchmarkBiExport,
  type OperationalClosingMonthlyReview,
  type OperationalClosingStoreBenchmarkActionTemplate
} from '@/lib/operational_closing_review';
import {
  buildAiSuggestionFeedbackBiExport,
  buildAiSuggestionFeedbackMonthlyReview,
  buildAiSuggestionFeedbackMonthlyReviewCsv,
  type AiSuggestionFeedbackMonthlyReview
} from '@/lib/ai_suggestion_feedback';
import {
  normalizeAiAssistMode
} from '@/lib/ai_assist_policy';
import {
  getAuditIntegrityStatus,
  getAuditRetentionColors,
  makeAuditLogExportFileName,
  makeAuditLogRetentionLedgerCsvFileName,
  makeAuditLogRetentionMonthlyReviewCsvFileName,
  makeDailyClosingReviewCsvFileName,
  makeDailyClosingStoreBenchmarkBiExportFileName,
  makeAiSuggestionFeedbackReviewCsvFileName,
  makeAiSuggestionFeedbackBiExportFileName,
  getDailyClosingReviewDisplay,
  getAiSuggestionFeedbackDisplay
} from '@/lib/audit_settings_helpers';
import { downloadTextFile } from '@/lib/blob_download';
import type { BackupSchedulePolicy } from '@/lib/backup';
import type { ExternalConnectorReadinessReport } from '@/lib/external_connector_readiness';
import { buildOnlineEligibilityFieldReadinessReport } from '@/lib/online_eligibility_field_readiness';
import { buildOnlineEligibilityResponseDiffReport } from '@/lib/online_eligibility_response_diff';
import { buildStaffAccessRecoveryMonthlyReview, buildStaffAccessRecoveryReviewFromAuditLogs } from '@/lib/staff_access_recovery_review';
import { buildInitialSetupChecklist } from '@/lib/onboarding';
import { buildBackupGenerationReview, buildBackupScheduleReview } from '@/lib/backup';
import { buildAnonymousDiagnosticExportJson, makeAnonymousDiagnosticExportFileName } from '@/lib/anonymous_diagnostic_export';
import type { OfficialAuditSummary, OfficialAuditItem } from '@/lib/official_audit';
import type { PermissionAction } from '@/lib/audit';

export interface UseAuditSettingsOptions {
  db: PharmacyDatabase | null;
  currentUser: User;
  canViewAuditLogs: boolean;
  canManageFacility: boolean;
  canApproveDailyClosing: boolean;
  settings: FacilitySettings;
  staffList?: User[];
  officialAuditSummary: OfficialAuditSummary;
  officialAuditBlockers: OfficialAuditItem[];
  backupSchedulePolicy: BackupSchedulePolicy;
  getDrugInfoReferenceCount: () => Promise<number>;
  ensurePermission: (permission: PermissionAction) => boolean;
}

export function useAuditSettings(options: UseAuditSettingsOptions) {
  const {
    db,
    currentUser,
    canViewAuditLogs,
    settings,
    staffList = [],
    officialAuditSummary,
    officialAuditBlockers,
    backupSchedulePolicy,
    getDrugInfoReferenceCount,
    ensurePermission
  } = options;

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditIntegrity, setAuditIntegrity] = useState<AuditIntegrityReport | null>(null);
  const [isCheckingAuditIntegrity, setIsCheckingAuditIntegrity] = useState(false);
  const [isExportingAuditLogs, setIsExportingAuditLogs] = useState(false);
  const [isExportingAnonymousDiagnostic, setIsExportingAnonymousDiagnostic] = useState(false);
  const [isExportingAuditRetentionLedger, setIsExportingAuditRetentionLedger] = useState(false);
  const [isRecordingAuditRetentionManagerReview, setIsRecordingAuditRetentionManagerReview] = useState(false);
  const [isExportingAuditRetentionReview, setIsExportingAuditRetentionReview] = useState(false);
  const [isExportingAiSuggestionFeedbackReview, setIsExportingAiSuggestionFeedbackReview] = useState(false);
  const [isExportingAiSuggestionFeedbackBi, setIsExportingAiSuggestionFeedbackBi] = useState(false);
  const [isApplyingAiQualityMode, setIsApplyingAiQualityMode] = useState(false);
  const [isExportingDailyClosingReview, setIsExportingDailyClosingReview] = useState(false);
  const [isExportingDailyClosingStoreBenchmark, setIsExportingDailyClosingStoreBenchmark] = useState(false);
  const [recordingDailyClosingKpiActionId, setRecordingDailyClosingKpiActionId] = useState<string | null>(null);
  const [postponingDailyClosingKpiActionId, setPostponingDailyClosingKpiActionId] = useState<string | null>(null);
  // 操作ユーザーは自由入力のテキストボックス。'all' を初期値にすると
  // log.userName.includes('all') が評価され、監査ログが1件も表示されなくなる。
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('all');

  const fetchAuditLogs = useCallback(async () => {
    if (!db || !canViewAuditLogs) return;
    try {
      const logs = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const rows = logs.map(d => d.toJSON());
      setAuditLogs(rows);
      setIsCheckingAuditIntegrity(true);
      const report = await verifyAuditLogIntegrity(rows);
      setAuditIntegrity(report);
    } catch (e) {
      console.error('Failed to fetch audit logs:', e);
    } finally {
      setIsCheckingAuditIntegrity(false);
    }
  }, [db, canViewAuditLogs]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  const auditIntegrityInfo = useMemo(
    () => getAuditIntegrityStatus(auditIntegrity, isCheckingAuditIntegrity),
    [auditIntegrity, isCheckingAuditIntegrity]
  );

  const auditRetentionReview = useMemo(
    () => buildAuditLogRetentionMonthlyReview(
      auditLogs,
      auditIntegrity ?? {
        total: auditLogs.length,
        signed: 0,
        unsigned: auditLogs.length,
        invalid: 0,
        isValid: auditLogs.length === 0
      }
    ),
    [auditLogs, auditIntegrity]
  );

  const auditRetentionColors = useMemo(
    () => getAuditRetentionColors(auditRetentionReview),
    [auditRetentionReview]
  );

  const aiSuggestionFeedbackReview = useMemo(
    () => buildAiSuggestionFeedbackMonthlyReview(auditLogs, new Date(), {
      currentStoreName: settings.pharmacyName || '自店',
      currentStoreCode: settings.pharmacyCode || undefined,
      currentAiAssistMode: normalizeAiAssistMode(settings.aiAssistMode)
    }),
    [auditLogs, settings.pharmacyName, settings.pharmacyCode, settings.aiAssistMode]
  );

  const dailyClosingReview = useMemo(
    () => buildOperationalClosingMonthlyReview(auditLogs, new Date(), {
      currentStoreName: settings.pharmacyName || '自店',
      currentStoreCode: settings.pharmacyCode || undefined
    }),
    [auditLogs, settings.pharmacyName, settings.pharmacyCode]
  );

  const dailyClosingComparison = dailyClosingReview.previousMonthComparison;

  const handleExportAuditLogs = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    if (auditLogs.length === 0) {
      toast.info('エクスポートできる監査ログがありません。');
      return;
    }

    setIsExportingAuditLogs(true);
    try {
      const report = auditIntegrity ?? await verifyAuditLogIntegrity(auditLogs);
      const exportedAt = new Date();
      const fileName = makeAuditLogExportFileName(exportedAt);
      const blob = new Blob([buildAuditLogExportJson(auditLogs, report, exportedAt)], {
        type: 'application/json;charset=utf-8'
      });

      const auditOk = await logAuditAction(
        db,
        'audit_export',
        `監査ログJSONエクスポート: ${fileName} に ${auditLogs.length}件を書き出しました（署名済み: ${report.signed}件, 未署名: ${report.unsigned}件, 異常: ${report.invalid}件、責任者保全欄付き）。`
      );
      if (!auditOk) {
        throw new Error('監査ログJSONエクスポートの監査ログ記録に失敗したため、書き出しを中止しました。');
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`監査ログJSONを書き出しました（${auditLogs.length}件、責任者保全欄付き）。`);
    } catch (error: any) {
      console.error('Failed to export audit logs:', error);
      toast.error(`監査ログJSONの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingAuditLogs(false);
    }
  };

  const handleExportAnonymousDiagnostic = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsExportingAnonymousDiagnostic(true);
    try {
      const generatedAt = new Date();
      const [
        patientCount,
        visitCount,
        prescriptionItemCount,
        soapRecordCount,
        userCount,
        alertCount,
        interventionCount,
        drugCount,
        drugStockCount,
        facilitySettingsCount,
        locationCount,
        drugInfoCount,
        medicationGuidanceCount,
        patientMedicationInfoTemplateCount,
        auditLogCount
      ] = await Promise.all([
        db.patients.count().exec(),
        db.visits.count().exec(),
        db.prescription_items.count().exec(),
        db.soap_records.count().exec(),
        db.users.count().exec(),
        db.alerts.count().exec(),
        db.interventions.count().exec(),
        db.drugs.count().exec(),
        db.drug_stocks.count().exec(),
        db.facility_settings.count().exec(),
        db.locations.count().exec(),
        getDrugInfoReferenceCount(),
        db.medication_guidances.count().exec(),
        db.patient_medication_info_templates.count().exec(),
        db.audit_logs.count().exec()
      ]);
      let externalConnectorReadiness: ExternalConnectorReadinessReport | undefined;
      try {
        const readinessResponse = await fetch('/api/system/connector-readiness');
        if (readinessResponse.ok) {
          externalConnectorReadiness = await readinessResponse.json();
        }
      } catch (readinessError) {
        console.warn('Failed to fetch external connector readiness:', readinessError);
      }
      const onlineEligibilityFieldReadiness = externalConnectorReadiness
        ? buildOnlineEligibilityFieldReadinessReport({
          generatedAt,
          connectorReadiness: externalConnectorReadiness,
          responseDiff: buildOnlineEligibilityResponseDiffReport([])
        })
        : undefined;
      const staffForDiagnostic = (await db.users.find().exec()).map(doc => doc.toJSON());
      const report = auditIntegrity ?? await verifyAuditLogIntegrity(auditLogs);
      const staffAccessRecoveryReview = buildStaffAccessRecoveryReviewFromAuditLogs({
        generatedAt,
        auditLogs,
        sourceArtifactSha256: report.latestHash
      });
      const staffAccessRecoveryMonthlyReview = buildStaffAccessRecoveryMonthlyReview(auditLogs, generatedAt, {
        sourceArtifactSha256: report.latestHash
      });
      const fileName = makeAnonymousDiagnosticExportFileName(generatedAt);
      const content = buildAnonymousDiagnosticExportJson({
        generatedAt,
        settings,
        staff: staffForDiagnostic,
        auditLogs,
        collectionCounts: {
          patients: patientCount,
          visits: visitCount,
          prescription_items: prescriptionItemCount,
          soap_records: soapRecordCount,
          users: userCount,
          alerts: alertCount,
          interventions: interventionCount,
          drugs: drugCount,
          drug_stocks: drugStockCount,
          facility_settings: facilitySettingsCount,
          locations: locationCount,
          drug_infos: drugInfoCount,
          medication_guidances: medicationGuidanceCount,
          patient_medication_info_templates: patientMedicationInfoTemplateCount,
          audit_logs: auditLogCount
        },
        auditIntegrity: report,
        auditRetentionReview: buildAuditLogRetentionMonthlyReview(auditLogs, report, generatedAt),
        initialSetupChecklist: buildInitialSetupChecklist({
          settings,
          staff: staffForDiagnostic,
          auditLogs
        }),
        backupGenerationReview: buildBackupGenerationReview(auditLogs),
        backupScheduleReview: buildBackupScheduleReview(auditLogs, backupSchedulePolicy),
        officialAuditSummary,
        officialAuditBlockerCount: officialAuditBlockers.length,
        dailyClosingReview: buildOperationalClosingMonthlyReview(auditLogs, generatedAt, {
          currentStoreName: settings.pharmacyName || '自店',
          currentStoreCode: settings.pharmacyCode || undefined
        }),
        aiSuggestionFeedbackReview: buildAiSuggestionFeedbackMonthlyReview(auditLogs, generatedAt, {
          currentStoreName: settings.pharmacyName || '自店',
          currentStoreCode: settings.pharmacyCode || undefined,
          currentAiAssistMode: normalizeAiAssistMode(settings.aiAssistMode)
        }),
        externalConnectorReadiness,
        onlineEligibilityFieldReadiness,
        staffAccessRecoveryReview,
        staffAccessRecoveryMonthlyReview
      });

      const auditOk = await logAuditAction(
        db,
        'audit_export',
        `個人情報なし診断JSONエクスポート: ${fileName} に患者情報なしのサポート診断サマリを書き出しました（監査ログ ${auditLogs.length}件、DB集計 14領域）。`
      );
      if (!auditOk) {
        throw new Error('個人情報なし診断JSONエクスポートの監査ログ記録に失敗したため、書き出しを中止しました。');
      }

      downloadTextFile(fileName, content, 'application/json;charset=utf-8');

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success('個人情報なし診断JSONを書き出しました。');
    } catch (error: any) {
      console.error('Failed to export support diagnostic JSON:', error);
      toast.error(`個人情報なし診断JSONの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingAnonymousDiagnostic(false);
    }
  };

  const handleExportAuditRetentionLedgerCsv = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    if (auditLogs.length === 0) {
      toast.info('保全台帳を作成できる監査ログがありません。');
      return;
    }

    setIsExportingAuditRetentionLedger(true);
    try {
      const report = auditIntegrity ?? await verifyAuditLogIntegrity(auditLogs);
      const exportedAt = new Date();
      const auditLogFileName = makeAuditLogExportFileName(exportedAt);
      const fileName = makeAuditLogRetentionLedgerCsvFileName(exportedAt);
      const blob = new Blob([`\ufeff${buildAuditLogRetentionLedgerCsv(report, auditLogFileName, exportedAt)}`], {
        type: 'text/csv;charset=utf-8'
      });

      const auditOk = await logAuditAction(
        db,
        'audit_export',
        `監査ログ保全台帳CSVエクスポート: ${fileName} に最新ハッシュ ${report.latestHash || '未署名'} の外部WORM保存確認欄を書き出しました。`
      );
      if (!auditOk) {
        throw new Error('監査ログ保全台帳CSVエクスポートの監査ログ記録に失敗したため、書き出しを中止しました。');
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success('監査ログ保全台帳CSVを書き出しました（外部WORM保存確認欄付き）。');
    } catch (error: any) {
      console.error('Failed to export audit retention ledger CSV:', error);
      toast.error(`監査ログ保全台帳CSVの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingAuditRetentionLedger(false);
    }
  };

  const handleExportAuditRetentionMonthlyReviewCsv = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    if (auditLogs.length === 0) {
      toast.info('棚卸CSVを作成できる監査ログがありません。');
      return;
    }

    setIsExportingAuditRetentionReview(true);
    try {
      const report = auditIntegrity ?? await verifyAuditLogIntegrity(auditLogs);
      const review = buildAuditLogRetentionMonthlyReview(auditLogs, report);
      const fileName = makeAuditLogRetentionMonthlyReviewCsvFileName(review.monthKey);
      const blob = new Blob([`\ufeff${buildAuditLogRetentionMonthlyReviewCsv(review)}`], {
        type: 'text/csv;charset=utf-8'
      });

      const auditOk = await logAuditAction(
        db,
        'audit_export',
        `監査ログ保全月次棚卸CSVエクスポート: ${fileName} を書き出しました（${review.monthLabel}, 判定: ${review.statusLabel}, 差し戻し: ${review.returnReasons.length}件）。`
      );
      if (!auditOk) {
        throw new Error('監査ログ保全月次棚卸CSVエクスポートの監査ログ記録に失敗したため、書き出しを中止しました。');
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`監査ログ保全月次棚卸CSVを書き出しました（${review.statusLabel}）。`);
    } catch (error: any) {
      console.error('Failed to export audit retention monthly review CSV:', error);
      toast.error(`監査ログ保全月次棚卸CSVの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingAuditRetentionReview(false);
    }
  };

  const handleRecordAuditRetentionManagerReview = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    if (auditLogs.length === 0) {
      toast.info('責任者確認を記録できる監査ログがありません。');
      return;
    }

    setIsRecordingAuditRetentionManagerReview(true);
    try {
      const report = auditIntegrity ?? await verifyAuditLogIntegrity(auditLogs);
      const review = buildAuditLogRetentionMonthlyReview(auditLogs, report);
      const auditOk = await logAuditAction(
        db,
        'audit_retention_approval',
        buildAuditLogRetentionManagerReviewAuditDetail(
          review,
          currentUser.name || '責任者'
        )
      );
      if (!auditOk) {
        throw new Error('監査ログ保全の責任者確認記録に失敗しました。');
      }

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      if (review.status === 'complete' && review.returnReasons.length === 0) {
        toast.success('監査ログ保全の責任者承認を記録しました。');
      } else {
        toast.warning('監査ログ保全の差し戻し記録を残しました。');
      }
    } catch (error: any) {
      console.error('Failed to record audit retention manager review:', error);
      toast.error(`責任者確認の記録に失敗しました: ${error.message || error}`);
    } finally {
      setIsRecordingAuditRetentionManagerReview(false);
    }
  };

  const handleExportDailyClosingReviewCsv = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsExportingDailyClosingReview(true);
    try {
      const review = buildOperationalClosingMonthlyReview(auditLogs, new Date(), {
        currentStoreName: settings.pharmacyName || '自店',
        currentStoreCode: settings.pharmacyCode || undefined
      });
      const fileName = makeDailyClosingReviewCsvFileName(review.monthKey);
      const blob = new Blob([`\ufeff${buildOperationalClosingMonthlyReviewCsv(review)}`], {
        type: 'text/csv;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      await logAuditAction(
        db,
        'audit_export',
        `日次締め月次レビューCSVエクスポート: ${fileName} に ${review.approvalCount}件の承認ログサマリを書き出しました。`
      );

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`日次締め月次レビューCSVを書き出しました（${review.approvalCount}件）。`);
    } catch (error: any) {
      console.error('Failed to export daily closing review CSV:', error);
      toast.error(`日次締め月次レビューCSVの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingDailyClosingReview(false);
    }
  };

  const handleExportDailyClosingStoreBenchmarkJson = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsExportingDailyClosingStoreBenchmark(true);
    try {
      const review = buildOperationalClosingMonthlyReview(auditLogs, new Date(), {
        currentStoreName: settings.pharmacyName || '自店',
        currentStoreCode: settings.pharmacyCode || undefined
      });
      const fileName = makeDailyClosingStoreBenchmarkBiExportFileName(review.monthKey);
      const blob = new Blob([buildOperationalClosingStoreBenchmarkBiExport(review)], {
        type: 'application/json;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      await logAuditAction(
        db,
        'audit_export',
        `店舗別KPIベンチマークJSONエクスポート: ${fileName} に ${review.storeBenchmark.storeCount}件の店舗別KPIサマリを書き出しました（患者情報なし、外部BI連携用）。`
      );

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`店舗別KPIベンチマークJSONを書き出しました（${review.storeBenchmark.storeCount}店舗）。`);
    } catch (error: any) {
      console.error('Failed to export daily closing store benchmark JSON:', error);
      toast.error(`店舗別KPIベンチマークJSONの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingDailyClosingStoreBenchmark(false);
    }
  };

  const handleRecordDailyClosingKpiAction = async (template: OperationalClosingStoreBenchmarkActionTemplate) => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setRecordingDailyClosingKpiActionId(template.id);
    try {
      const review = buildOperationalClosingMonthlyReview(auditLogs, new Date(), {
        currentStoreName: settings.pharmacyName || '自店',
        currentStoreCode: settings.pharmacyCode || undefined
      });
      const latestTemplate = review.storeBenchmark.actionTemplates.find((candidate) => candidate.id === template.id) || template;
      const auditOk = await logAuditAction(
        db,
        'daily_closing_kpi_action',
        buildOperationalClosingStoreBenchmarkActionAuditDetail(latestTemplate, review)
      );
      if (!auditOk) {
        throw new Error('KPI改善アクションの監査ログ記録に失敗しました。');
      }

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`KPI改善アクションを記録しました: ${latestTemplate.title}`);
    } catch (error: any) {
      console.error('Failed to record KPI action:', error);
      toast.error(`KPI改善アクションの記録に失敗しました: ${error.message || error}`);
    } finally {
      setRecordingDailyClosingKpiActionId(null);
    }
  };

  const handlePostponeDailyClosingKpiAction = async (template: OperationalClosingStoreBenchmarkActionTemplate) => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    const reason = window.prompt('延期理由を入力してください', '対象店舗との確認待ち');
    if (!reason?.trim()) return;
    const daysText = window.prompt('再期限までの日数を入力してください', '7');
    const postponeDays = Math.round(Number(daysText));
    if (!Number.isFinite(postponeDays) || postponeDays < 1 || postponeDays > 60) {
      toast.error('再期限までの日数は1日から60日の範囲で入力してください。');
      return;
    }

    setPostponingDailyClosingKpiActionId(template.id);
    try {
      const review = buildOperationalClosingMonthlyReview(auditLogs, new Date(), {
        currentStoreName: settings.pharmacyName || '自店',
        currentStoreCode: settings.pharmacyCode || undefined
      });
      const latestTemplate = review.storeBenchmark.actionTemplates.find((candidate) => candidate.id === template.id) || template;
      const newDueDate = new Date();
      newDueDate.setDate(newDueDate.getDate() + postponeDays);
      const auditOk = await logAuditAction(
        db,
        'daily_closing_kpi_action',
        buildOperationalClosingStoreBenchmarkActionPostponementAuditDetail(latestTemplate, review, reason, newDueDate)
      );
      if (!auditOk) {
        throw new Error('KPI改善アクション見送りの監査ログ記録に失敗しました。');
      }

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.info(`KPI改善アクションの見送りを記録しました: ${latestTemplate.title}`);
    } catch (error: any) {
      console.error('Failed to postpone KPI action:', error);
      toast.error(`KPI改善アクション見送りの記録に失敗しました: ${error.message || error}`);
    } finally {
      setPostponingDailyClosingKpiActionId(null);
    }
  };

  const handleExportAiSuggestionFeedbackReviewCsv = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsExportingAiSuggestionFeedbackReview(true);
    try {
      const review = buildAiSuggestionFeedbackMonthlyReview(auditLogs, new Date(), {
        currentStoreName: settings.pharmacyName || '自店',
        currentStoreCode: settings.pharmacyCode || undefined,
        currentAiAssistMode: normalizeAiAssistMode(settings.aiAssistMode)
      });
      const fileName = makeAiSuggestionFeedbackReviewCsvFileName(review.monthKey);
      const blob = new Blob([`\ufeff${buildAiSuggestionFeedbackMonthlyReviewCsv(review)}`], {
        type: 'text/csv;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      await logAuditAction(
        db,
        'audit_export',
        `AI補助フィードバック月次レビューCSVエクスポート: ${fileName} に ${review.totalCount}件の採否ログと ${review.storeComparison.storeCount}件の店舗別サマリを書き出しました。`
      );

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`AI補助フィードバックCSVを書き出しました（${review.totalCount}件）。`);
    } catch (error: any) {
      console.error('Failed to export AI suggestion feedback review CSV:', error);
      toast.error(`AI補助フィードバックCSVの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingAiSuggestionFeedbackReview(false);
    }
  };

  const handleExportAiSuggestionFeedbackBiJson = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsExportingAiSuggestionFeedbackBi(true);
    try {
      const generatedAt = new Date();
      const review = buildAiSuggestionFeedbackMonthlyReview(auditLogs, generatedAt, {
        currentStoreName: settings.pharmacyName || '自店',
        currentStoreCode: settings.pharmacyCode || undefined,
        currentAiAssistMode: normalizeAiAssistMode(settings.aiAssistMode)
      });
      const fileName = makeAiSuggestionFeedbackBiExportFileName(review.monthKey);
      const blob = new Blob([buildAiSuggestionFeedbackBiExport(review, generatedAt)], {
        type: 'application/json;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      await logAuditAction(
        db,
        'audit_export',
        `AI補助フィードバックBI JSONエクスポート: ${fileName} に ${review.totalCount}件の採否ログと ${review.storeComparison.storeCount}件の店舗別フィードバック比較を書き出しました（患者情報なし）。`
      );

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`AI補助フィードバックBI JSONを書き出しました（${review.storeComparison.storeCount}店舗）。`);
    } catch (error: any) {
      console.error('Failed to export AI suggestion feedback BI JSON:', error);
      toast.error(`AI補助フィードバックBI JSONの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingAiSuggestionFeedbackBi(false);
    }
  };

  const handleApplyAiQualityRecommendation = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    const recommendedMode = aiSuggestionFeedbackReview.qualityGate.recommendedMode;
    if (!recommendedMode || recommendedMode === settings.aiAssistMode) {
      toast.info('推奨モードへの変更は不要です。');
      return;
    }

    setIsApplyingAiQualityMode(true);
    try {
      const doc = await db.facility_settings.findOne().exec();
      if (doc) {
        await doc.patch({
          aiAssistMode: recommendedMode
        });
      }
      await logAuditAction(
        db,
        'facility_settings_update',
        `AI補助モードを品質推奨に基づき ${settings.aiAssistMode} から ${recommendedMode} へ変更しました。`
      );

      const refreshed = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
      const refreshedRows = refreshed.map(d => d.toJSON());
      setAuditLogs(refreshedRows);
      setAuditIntegrity(await verifyAuditLogIntegrity(refreshedRows));
      toast.success(`AI補助モードを ${recommendedMode} に更新しました。`);
    } catch (error: any) {
      console.error('Failed to apply AI quality recommendation:', error);
      toast.error(`AI補助モードの更新に失敗しました: ${error.message || error}`);
    } finally {
      setIsApplyingAiQualityMode(false);
    }
  };

  const dailyClosingDisplay = getDailyClosingReviewDisplay(dailyClosingReview);
  const aiFeedbackDisplay = getAiSuggestionFeedbackDisplay(aiSuggestionFeedbackReview);

  return {
    auditLogs,
    auditIntegrity,
    isCheckingAuditIntegrity,
    auditIntegrityStatus: auditIntegrityInfo.status,
    auditIntegrityColor: auditIntegrityInfo.color,
    latestAuditHashPreview: auditIntegrityInfo.latestHashPreview,
    handleExportAuditLogs,
    isExportingAuditLogs,
    handleExportAnonymousDiagnostic,
    isExportingAnonymousDiagnostic,
    handleExportAuditRetentionLedgerCsv,
    isExportingAuditRetentionLedger,
    auditRetentionReview,
    auditRetentionReviewColor: auditRetentionColors.reviewColor,
    auditRetentionReviewBackground: auditRetentionColors.reviewBackground,
    auditRetentionManagerReviewColor: auditRetentionColors.managerColor,
    auditRetentionManagerReviewBackground: auditRetentionColors.managerBackground,
    handleRecordAuditRetentionManagerReview,
    isRecordingAuditRetentionManagerReview,
    auditRetentionManagerReviewButtonLabel: auditRetentionColors.managerButtonLabel,
    handleExportAuditRetentionMonthlyReviewCsv,
    isExportingAuditRetentionReview,
    latestRetentionJsonLabel: auditRetentionColors.latestRetentionJsonLabel,
    latestRetentionLedgerLabel: auditRetentionColors.latestRetentionLedgerLabel,
    aiSuggestionFeedbackReview,
    aiSuggestionQualityGateColor: aiFeedbackDisplay.qualityGateColor,
    aiSuggestionQualityGateBackground: aiFeedbackDisplay.qualityGateBackground,
    aiSuggestionFeedbackColor: aiFeedbackDisplay.color,
    aiSuggestionFeedbackBackground: aiFeedbackDisplay.background,
    soapDraftFeedbackColor: aiFeedbackDisplay.soapDraftColor,
    soapDraftFeedbackBackground: aiFeedbackDisplay.soapDraftBackground,
    storeFeedbackColor: aiFeedbackDisplay.storeColor,
    storeFeedbackBackground: aiFeedbackDisplay.storeBackground,
    handleExportAiSuggestionFeedbackReviewCsv,
    isExportingAiSuggestionFeedbackReview,
    handleExportAiSuggestionFeedbackBiJson,
    isExportingAiSuggestionFeedbackBi,
    handleApplyAiQualityRecommendation,
    isApplyingAiQualityMode,
    dailyClosingReview,
    latestClosingHashPreview: dailyClosingDisplay.latestClosingHashPreview,
    dailyClosingReviewColor: dailyClosingDisplay.color,
    dailyClosingReviewStatus: dailyClosingDisplay.status,
    handleExportDailyClosingReviewCsv,
    isExportingDailyClosingReview,
    dailyClosingStoreBenchmarkBackground: dailyClosingDisplay.storeBenchmarkBackground,
    dailyClosingStoreBenchmarkColor: dailyClosingDisplay.storeBenchmarkColor,
    handleExportDailyClosingStoreBenchmarkJson,
    isExportingDailyClosingStoreBenchmark,
    recordingDailyClosingKpiActionId,
    handleRecordDailyClosingKpiAction,
    postponingDailyClosingKpiActionId,
    handlePostponeDailyClosingKpiAction,
    dailyClosingComparisonColor: dailyClosingDisplay.comparisonColor,
    dailyClosingComparisonBackground: dailyClosingDisplay.comparisonBackground,
    dailyClosingComparison: dailyClosingReview.previousMonthComparison,
    filterUser,
    setFilterUser,
    filterAction,
    setFilterAction,
    fetchAuditLogs
  };
}
