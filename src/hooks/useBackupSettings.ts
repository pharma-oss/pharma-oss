'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import encoding from 'encoding-japanese';
import type { PharmacyDatabase, User, Patient, AuditLog } from '@/db/types';
import { logAuditAction, type PermissionAction } from '@/lib/audit';
import {
  buildDatabaseBackup,
  countBackupRows,
  encryptBackupPayload,
  decryptBackupPayload,
  validateBackupPayload,
  isEncryptedBackup,
  importDatabaseBackup,
  calculateBackupDiff,
  buildBackupRestoreDrillReport,
  buildBackupRestoreDrillAuditDetail,
  buildBackupExternalTransferManifest,
  buildBackupExternalTransferManifestJson,
  buildBackupExternalTransferManifestAuditDetail,
  buildBackupExternalStorageEvidence,
  buildBackupExternalStorageAuditDetail,
  validateBackupExternalTransferReceipt,
  buildBackupExternalStorageEvidenceFromTransferReceipt,
  buildBackupSchedulePolicyAuditDetail,
  buildBackupGenerationReview,
  buildBackupGenerationReviewCsv,
  makeBackupFileName,
  makeBackupExternalTransferManifestFileName,
  DEFAULT_BACKUP_SCHEDULE_POLICY,
  type BackupSchedulePolicy,
  type BackupCollectionName,
  type CollectionDiff,
  type BackupRestoreDrillReport,
  type YakurekiBackup
} from '@/lib/backup';
import {
  readBackupSchedulePolicy,
  writeBackupSchedulePolicy
} from '@/lib/backup_schedule_storage';
import {
  buildPatientCsvMigrationPreview,
  buildVisitCsvMigrationPreview,
  buildDrugStockCsvMigrationPreview,
  buildSoapCsvMigrationPreview,
  type DrugStockCsvMigrationPreview,
  type PatientCsvMigrationPreview,
  type SoapCsvMigrationPreview,
  type VisitCsvMigrationPreview
} from '@/lib/migration_csv';
import {
  findDuplicatePatientGroups,
  buildPatientDuplicateScanAuditDetail,
  type PatientDuplicateGroup,
  type PatientDuplicateScanReport
} from '@/lib/patient_duplicate_review';
import {
  buildPatientMergePlan,
  buildPatientMergeExecutionPlan,
  type PatientMergeExecutionPlan,
  type PatientMergePlan
} from '@/lib/patient_merge';
import {
  createRxdbPatientMergeExecutionStore,
  applyPatientMergeExecutionPlan,
  applyPatientMergeOperation,
  PatientMergeExecutionError
} from '@/lib/patient_merge_execution';
import {
  getBackupGenerationReviewDisplay,
  getBackupScheduleReviewDisplay
} from '@/lib/backup_settings_helpers';
import { downloadTextFile } from '@/lib/blob_download';
import type { AiSuggestionFeedbackMonthlyReview } from '@/lib/ai_suggestion_feedback';

function makeBackupGenerationReviewCsvFileName(formatDateTimeStamp: (date: Date) => string, date = new Date()): string {
  return `yakureki_backup_generation_review_${formatDateTimeStamp(date)}.csv`;
}

export interface DuplicateMergeReview {
  groupId: string;
  sourcePatientId: string;
  plan: PatientMergePlan;
  executionPlan: PatientMergeExecutionPlan;
}

export interface UseBackupSettingsOptions {
  db: PharmacyDatabase | null;
  currentUser: User;
  canManageBackups: boolean;
  auditLogs: AuditLog[];
  fetchAuditLogs: () => Promise<void>;
  formatDateTimeStamp: (date: Date) => string;
  ensurePermission: (action: PermissionAction) => boolean;
  aiSuggestionFeedbackReview: AiSuggestionFeedbackMonthlyReview;
  soapDraftFeedbackBackground: string;
  soapDraftFeedbackColor: string;
  storeFeedbackBackground: string;
  storeFeedbackColor: string;
}

export function useBackupSettings({
  db,
  currentUser,
  canManageBackups,
  auditLogs,
  fetchAuditLogs,
  formatDateTimeStamp,
  ensurePermission,
  aiSuggestionFeedbackReview,
  soapDraftFeedbackBackground,
  soapDraftFeedbackColor,
  storeFeedbackBackground,
  storeFeedbackColor
}: UseBackupSettingsOptions) {
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [migrationCsvKind, setMigrationCsvKind] = useState<'patients' | 'visits' | 'drug_stocks' | 'soap_records'>('patients');
  const [migrationCsvFile, setMigrationCsvFile] = useState<File | null>(null);
  const [migrationCsvPreview, setMigrationCsvPreview] = useState<PatientCsvMigrationPreview | VisitCsvMigrationPreview | DrugStockCsvMigrationPreview | SoapCsvMigrationPreview | null>(null);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isExportingBackupGenerationReview, setIsExportingBackupGenerationReview] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [isAnalyzingMigrationCsv, setIsAnalyzingMigrationCsv] = useState(false);

  const [useEncryption, setUseEncryption] = useState(true);
  const [exportPassword, setExportPassword] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);

  const [importPassword, setImportPassword] = useState('');
  const [showImportPasswordInput, setShowImportPasswordInput] = useState(false);
  const [pendingEncryptedPayload, setPendingEncryptedPayload] = useState<any>(null);

  const [pendingBackupPayload, setPendingBackupPayload] = useState<YakurekiBackup | null>(null);
  const [backupRestoreSourceName, setBackupRestoreSourceName] = useState('バックアップファイル');
  const [backupRestoreSourceEncrypted, setBackupRestoreSourceEncrypted] = useState(false);
  const [backupDiffs, setBackupDiffs] = useState<CollectionDiff[] | null>(null);
  const [backupDrillReport, setBackupDrillReport] = useState<BackupRestoreDrillReport | null>(null);
  const [isAnalyzingDiff, setIsAnalyzingDiff] = useState(false);
  const [externalBackupFileName, setExternalBackupFileName] = useState('');
  const [externalBackupDestinationName, setExternalBackupDestinationName] = useState('');
  const [externalBackupDestinationPath, setExternalBackupDestinationPath] = useState('');
  const [externalBackupVerifierName, setExternalBackupVerifierName] = useState('');
  const [externalBackupNotes, setExternalBackupNotes] = useState('');
  const [externalBackupReadBackVerified, setExternalBackupReadBackVerified] = useState(false);
  const [externalBackupImmutableVerified, setExternalBackupImmutableVerified] = useState(false);
  const [exportBackupExternalTransferManifest, setExportBackupExternalTransferManifest] = useState(false);
  const [externalBackupRetentionDays, setExternalBackupRetentionDays] = useState(30);
  const [externalBackupReceiptFile, setExternalBackupReceiptFile] = useState<File | null>(null);
  const [isRecordingExternalBackupStorage, setIsRecordingExternalBackupStorage] = useState(false);
  const [isRecordingExternalBackupReceipt, setIsRecordingExternalBackupReceipt] = useState(false);
  const [backupSchedulePolicy, setBackupSchedulePolicy] = useState<BackupSchedulePolicy>(DEFAULT_BACKUP_SCHEDULE_POLICY);

  // 患者重複点検(名寄せ)
  const [patientDuplicateReport, setPatientDuplicateReport] = useState<PatientDuplicateScanReport | null>(null);
  const [isScanningPatientDuplicates, setIsScanningPatientDuplicates] = useState(false);
  const [patientDuplicateMessage, setPatientDuplicateMessage] = useState('');
  const [duplicateMergeTargets, setDuplicateMergeTargets] = useState<Record<string, string>>({});
  const [duplicateMergeReview, setDuplicateMergeReview] = useState<DuplicateMergeReview | null>(null);
  const [isApplyingDuplicateMerge, setIsApplyingDuplicateMerge] = useState(false);
  const [isSavingBackupSchedule, setIsSavingBackupSchedule] = useState(false);

  // レビュー表示の導出
  const backupGenerationReview = buildBackupGenerationReview(auditLogs);
  const {
    color: backupGenerationReviewColor,
    background: backupGenerationReviewBackground,
    latestBackupGenerationLabel,
    latestBackupDrillLabel,
    latestBackupExternalStorageLabel
  } = getBackupGenerationReviewDisplay(backupGenerationReview);

  const backupScheduleReview = buildBackupGenerationReview(auditLogs) as any;
  const {
    color: backupScheduleReviewColor,
    background: backupScheduleReviewBackground
  } = getBackupScheduleReviewDisplay(backupScheduleReview);

  const handleBackupSchedulePolicyChange = (patch: Partial<BackupSchedulePolicy>) => {
    setBackupSchedulePolicy((current) => ({
      ...current,
      ...patch
    }));
  };

  const handleSaveBackupSchedulePolicy = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsSavingBackupSchedule(true);
    try {
      const previousPolicy = readBackupSchedulePolicy();
      const normalizedPolicy = writeBackupSchedulePolicy(backupSchedulePolicy);
      setBackupSchedulePolicy(normalizedPolicy);

      const auditOk = await logAuditAction(
        db,
        'backup_schedule_update',
        buildBackupSchedulePolicyAuditDetail(normalizedPolicy)
      );
      if (!auditOk) {
        const restoredPolicy = writeBackupSchedulePolicy(previousPolicy);
        setBackupSchedulePolicy(restoredPolicy);
        throw new Error('閉店時バックアップ予定の監査ログ記録に失敗したため、変更を元に戻しました。');
      }

      await fetchAuditLogs();
      toast.success('閉店時バックアップ予定を保存しました。');
    } catch (error: any) {
      console.error('Failed to save backup schedule policy:', error);
      toast.error(`閉店時バックアップ予定の保存に失敗しました: ${error.message || error}`);
    } finally {
      setIsSavingBackupSchedule(false);
    }
  };

  const handleScanPatientDuplicates = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsScanningPatientDuplicates(true);
    setPatientDuplicateMessage('');
    setDuplicateMergeReview(null);
    try {
      const [patientDocs, visitDocs] = await Promise.all([
        db.patients.find().exec(),
        db.visits.find().exec()
      ]);
      const patients = patientDocs.map((doc) => doc.toJSON() as Patient);
      const visits = visitDocs.map((doc) => ({
        patientId: doc.get('patientId') as string,
        issueDate: doc.get('issueDate') as string
      }));
      const report = findDuplicatePatientGroups(patients, visits);
      setPatientDuplicateReport(report);
      setDuplicateMergeTargets(Object.fromEntries(
        report.groups.map((group) => [group.groupId, group.suggestedTargetPatientId])
      ));
      setPatientDuplicateMessage(report.groups.length === 0
        ? `重複候補はありません（対象 ${report.scannedPatientCount}名）。`
        : `重複候補 ${report.groups.length}グループ・${report.duplicatePatientCount}名が見つかりました。残す患者を選び、統合確認へ進んでください。`);
      await logAuditAction(db, 'prescription_edit', buildPatientDuplicateScanAuditDetail(report));
    } catch (error) {
      console.error('Failed to scan duplicate patients:', error);
      setPatientDuplicateReport(null);
      toast.error('患者重複点検に失敗しました。');
    } finally {
      setIsScanningPatientDuplicates(false);
    }
  };

  const openDuplicateMergeReview = async (group: PatientDuplicateGroup, sourcePatientId: string) => {
    if (!db) return;
    const targetPatientId = duplicateMergeTargets[group.groupId] || group.suggestedTargetPatientId;
    if (targetPatientId === sourcePatientId) {
      setPatientDuplicateMessage('残す患者と統合元が同じです。残す患者を選び直してください。');
      return;
    }

    try {
      const [targetDoc, sourceDoc, sourceVisitDocs, sourceAlertDocs] = await Promise.all([
        db.patients.findOne(targetPatientId).exec(),
        db.patients.findOne(sourcePatientId).exec(),
        db.visits.find({ selector: { patientId: sourcePatientId } }).exec(),
        db.alerts.find({ selector: { patientId: sourcePatientId } }).exec()
      ]);
      if (!targetDoc || !sourceDoc) {
        setPatientDuplicateMessage('対象患者を読み込めませんでした。もう一度「重複候補を確認」を実行してください。');
        return;
      }
      const plan = buildPatientMergePlan({
        targetPatient: targetDoc.toJSON() as Patient,
        sourcePatient: sourceDoc.toJSON() as Patient,
        sourceVisits: sourceVisitDocs.map((visitDoc) => ({ visitId: visitDoc.get('visitId') as string })),
        sourceAlerts: sourceAlertDocs.map((alertDoc) => ({ alertId: alertDoc.get('alertId') as string }))
      });
      setDuplicateMergeReview({
        groupId: group.groupId,
        sourcePatientId,
        plan,
        executionPlan: buildPatientMergeExecutionPlan(plan)
      });
      setPatientDuplicateMessage('');
    } catch (error) {
      console.error('Failed to build duplicate merge review:', error);
      setDuplicateMergeReview(null);
      setPatientDuplicateMessage('統合確認を作れませんでした。候補を選び直してください。');
    }
  };

  const handleApplyDuplicateMerge = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!db || !duplicateMergeReview) return;
    const { plan, executionPlan } = duplicateMergeReview;
    if (!executionPlan.canApply) {
      setPatientDuplicateMessage('統合前の確認事項を見直してください。');
      return;
    }
    if (!window.confirm('統合元患者を削除し、受付とアラートを残す患者へ付け替えます。実行しますか？')) {
      return;
    }

    const store = createRxdbPatientMergeExecutionStore(db);
    setIsApplyingDuplicateMerge(true);
    try {
      const result = await applyPatientMergeExecutionPlan(store, executionPlan);
      await logAuditAction(
        db,
        'prescription_edit',
        `患者統合実行: ${plan.summary}。${result.auditDetail}`,
        plan.targetPatientId,
        plan.mergedPatient.name
      );
      setDuplicateMergeReview(null);
      toast.success('患者統合を実行しました。');
      await handleScanPatientDuplicates();
    } catch (error: any) {
      console.error('Failed to apply duplicate merge:', error);
      if (error instanceof PatientMergeExecutionError && error.rollbackOperations.length > 0) {
        try {
          for (const operation of error.rollbackOperations) {
            await applyPatientMergeOperation(store, operation);
          }
          setPatientDuplicateMessage('患者統合に失敗したため、適用済みの操作を取り消しました。候補を確認し直してください。');
        } catch (rollbackError) {
          console.error('Failed to rollback duplicate merge:', rollbackError);
          setPatientDuplicateMessage('患者統合に失敗し、取り消しにも失敗しました。監査ログと患者データを確認してください。');
        }
      } else {
        setPatientDuplicateMessage('患者統合を実行できませんでした。候補を確認し直してください。');
      }
      toast.error('患者統合に失敗しました。');
    } finally {
      setIsApplyingDuplicateMerge(false);
    }
  };

  const handleExportBackup = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    if (useEncryption && !exportPassword.trim()) {
      toast.error('暗号化用パスワードを入力してください。');
      return;
    }

    if (!useEncryption) {
      const confirmed = window.confirm(
        'バックアップには患者情報、薬歴、スタッフ情報、監査ログが含まれます。\n\n' +
        '暗号化せずに平文JSONとして書き出しますか？'
      );
      if (!confirmed) {
        return;
      }
    }

    setIsExportingBackup(true);
    try {
      const backup = await buildDatabaseBackup(db);
      const fileName = makeBackupFileName(new Date(backup.createdAt));
      let payloadToSave: any = backup;
      let auditDetail = `バックアップ書き出し: ${fileName} に ${countBackupRows(backup)}件のローカルデータを書き出しました。`;

      if (useEncryption) {
        payloadToSave = encryptBackupPayload(backup, exportPassword.trim());
        auditDetail += '（パスワード暗号化保護）';
      }

      const rowCount = countBackupRows(backup);
      const payloadContent = JSON.stringify(payloadToSave, null, 2);
      const manifestGeneratedAt = new Date();
      let externalTransferManifestFileName = '';
      let externalTransferManifestContent = '';
      let externalTransferManifestAuditDetail = '';

      if (exportBackupExternalTransferManifest) {
        const manifest = buildBackupExternalTransferManifest({
          fileName,
          fileContent: payloadContent,
          payload: payloadToSave,
          destinationName: externalBackupDestinationName,
          destinationPathOrUrl: externalBackupDestinationPath,
          retentionDays: externalBackupRetentionDays,
          generatedAt: manifestGeneratedAt,
          notes: externalBackupNotes
        });

        if (manifest.status === 'blocked') {
          toast.error(manifest.requiredActions[0] || '外部保存連携JSONの入力内容を確認してください。');
          return;
        }

        externalTransferManifestFileName = makeBackupExternalTransferManifestFileName(fileName, manifestGeneratedAt);
        externalTransferManifestContent = buildBackupExternalTransferManifestJson(manifest);
        externalTransferManifestAuditDetail = buildBackupExternalTransferManifestAuditDetail(
          manifest,
          externalTransferManifestFileName
        );
      }

      const auditOk = await logAuditAction(db, 'backup_export', auditDetail);
      if (!auditOk) {
        throw new Error('バックアップ書き出しの監査ログ記録に失敗しました。');
      }

      if (externalTransferManifestContent) {
        const manifestAuditOk = await logAuditAction(
          db,
          'backup_external_transfer_manifest',
          externalTransferManifestAuditDetail
        );
        if (!manifestAuditOk) {
          throw new Error('外部保存連携JSONの監査ログ記録に失敗しました。');
        }
      }

      downloadTextFile(fileName, payloadContent, 'application/json;charset=utf-8');

      if (externalTransferManifestContent) {
        downloadTextFile(
          externalTransferManifestFileName,
          externalTransferManifestContent,
          'application/json;charset=utf-8'
        );
      }

      await fetchAuditLogs();
      setExternalBackupFileName(fileName);
      setExternalBackupReadBackVerified(false);
      setExternalBackupImmutableVerified(false);
      toast.success(`バックアップを書き出しました（${rowCount}件）。${useEncryption ? '暗号化済み。' : ''}${externalTransferManifestContent ? '外部保存連携JSONも出力しました。' : ''}`);
      setExportPassword('');
    } catch (error: any) {
      console.error('Failed to export backup:', error);
      toast.error(`バックアップの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleRecordBackupExternalStorage = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    const latestReview = buildBackupGenerationReview(auditLogs);
    const evidence = buildBackupExternalStorageEvidence({
      fileName: externalBackupFileName || latestReview.latestBackup?.fileName || '',
      destinationName: externalBackupDestinationName,
      destinationPathOrUrl: externalBackupDestinationPath,
      verifierName: externalBackupVerifierName,
      readBackVerified: externalBackupReadBackVerified,
      immutableStorageVerified: externalBackupImmutableVerified,
      notes: externalBackupNotes
    });

    if (evidence.status === 'blocked') {
      toast.error(evidence.requiredActions[0] || '外部保存確認の入力内容を確認してください。');
      return;
    }

    setIsRecordingExternalBackupStorage(true);
    try {
      const auditOk = await logAuditAction(
        db,
        'backup_external_storage',
        buildBackupExternalStorageAuditDetail(evidence)
      );
      if (!auditOk) {
        throw new Error('外部保存確認の監査ログ記録に失敗しました。');
      }
      await fetchAuditLogs();
      if (evidence.status === 'pass') {
        toast.success('バックアップの外部保存確認を監査ログに記録しました。');
      } else {
        toast.warning(`外部保存確認を記録しました（${evidence.statusLabel}）。`);
      }
    } catch (error: any) {
      console.error('Failed to record backup external storage:', error);
      toast.error(`外部保存確認の記録に失敗しました: ${error.message || error}`);
    } finally {
      setIsRecordingExternalBackupStorage(false);
    }
  };

  const handleExternalBackupReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setExternalBackupReceiptFile(file);
  };

  const handleRecordBackupExternalTransferReceipt = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    if (!externalBackupReceiptFile) {
      toast.error('外部保存ジョブ受領書JSONを選択してください。');
      return;
    }

    setIsRecordingExternalBackupReceipt(true);
    try {
      const parsed = JSON.parse(await externalBackupReceiptFile.text());
      const validation = validateBackupExternalTransferReceipt(parsed);
      if (!validation.ok) {
        toast.error(validation.reason);
        return;
      }

      const evidence = buildBackupExternalStorageEvidenceFromTransferReceipt(
        validation.receipt,
        currentUser.name || '外部保存ジョブ'
      );
      if (evidence.status === 'blocked') {
        toast.error(evidence.requiredActions[0] || '外部保存ジョブ受領書の内容を確認してください。');
        return;
      }

      const auditOk = await logAuditAction(
        db,
        'backup_external_storage',
        buildBackupExternalStorageAuditDetail(evidence)
      );
      if (!auditOk) {
        throw new Error('外部保存ジョブ受領書の監査ログ記録に失敗しました。');
      }

      await fetchAuditLogs();
      setExternalBackupFileName(evidence.fileName);
      setExternalBackupDestinationName(evidence.destinationName);
      setExternalBackupDestinationPath(evidence.destinationPathOrUrl);
      setExternalBackupVerifierName(evidence.verifierName);
      setExternalBackupReadBackVerified(evidence.readBackVerified);
      setExternalBackupImmutableVerified(evidence.immutableStorageVerified);
      setExternalBackupNotes(evidence.notes || '');
      setExternalBackupReceiptFile(null);

      if (evidence.status === 'pass') {
        toast.success('外部保存ジョブ受領書を監査ログに記録しました。');
      } else {
        toast.warning(`外部保存ジョブ受領書を記録しました（${evidence.statusLabel}）。`);
      }
    } catch (error: any) {
      console.error('Failed to record backup external transfer receipt:', error);
      toast.error(`外部保存ジョブ受領書の記録に失敗しました: ${error.message || error}`);
    } finally {
      setIsRecordingExternalBackupReceipt(false);
    }
  };

  const handleExportBackupGenerationReviewCsv = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsExportingBackupGenerationReview(true);
    try {
      const generatedAt = new Date();
      const review = buildBackupGenerationReview(auditLogs, generatedAt);
      const fileName = makeBackupGenerationReviewCsvFileName(formatDateTimeStamp, generatedAt);
      const auditOk = await logAuditAction(
        db,
        'audit_export',
        `バックアップ世代管理CSVエクスポート: ${fileName} を書き出しました（${review.retentionDays}日以内 ${review.generationCount}/${review.requiredGenerationCount}世代, 判定: ${review.statusLabel}）。`
      );
      if (!auditOk) {
        throw new Error('バックアップ世代管理CSV出力の監査ログ記録に失敗しました。');
      }

      downloadTextFile(fileName, `\ufeff${buildBackupGenerationReviewCsv(review)}`, 'text/csv;charset=utf-8');
      await fetchAuditLogs();
      toast.success(`バックアップ世代管理CSVを書き出しました（${review.statusLabel}）。`);
    } catch (error: any) {
      console.error('Failed to export backup generation review CSV:', error);
      toast.error(`バックアップ世代管理CSVの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingBackupGenerationReview(false);
    }
  };

  const analyzeBackupPayload = async (
    backup: YakurekiBackup,
    options: { migrationRequiredCollections?: readonly BackupCollectionName[] } = {}
  ) => {
    if (!db) return;
    setIsAnalyzingDiff(true);
    try {
      const diffs = await calculateBackupDiff(db, backup);
      setBackupDiffs(diffs);
      setBackupDrillReport(buildBackupRestoreDrillReport(backup, diffs, new Date(), {
        migrationRequiredCollections: options.migrationRequiredCollections
      }));
      setPendingBackupPayload(backup);
    } catch (error: any) {
      console.error('Failed to analyze backup diff:', error);
      toast.error(`バックアップ差分の解析に失敗しました: ${error.message || error}`);
    } finally {
      setIsAnalyzingDiff(false);
    }
  };

  const handleDecryptAndAnalyze = () => {
    if (!pendingEncryptedPayload) return;
    if (!importPassword.trim()) {
      toast.error('復号用パスワードを入力してください。');
      return;
    }

    try {
      const decryptedBackup = decryptBackupPayload(pendingEncryptedPayload, importPassword.trim());
      const validation = validateBackupPayload(decryptedBackup);
      if (!validation.ok) {
        toast.error(validation.reason);
        return;
      }

      setShowImportPasswordInput(false);
      setPendingEncryptedPayload(null);
      setImportPassword('');

      analyzeBackupPayload(validation.backup);
      toast.success('バックアップの復号に成功しました。');
    } catch (error: any) {
      toast.error(error.message || '復号に失敗しました。パスワードを確認してください。');
    }
  };

  const handleConfirmRestore = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!pendingBackupPayload || !db) return;
    if (backupDrillReport?.status === 'blocked') {
      toast.error('復旧前診断が「復旧不可」です。ID欠落や重複を修正してから復旧してください。');
      return;
    }

    setIsImportingBackup(true);
    try {
      const result = await importDatabaseBackup(db, pendingBackupPayload);
      const auditOk = await logAuditAction(
        db,
        'backup_import',
        `バックアップ復旧: ${backupRestoreSourceName || backupFile?.name || 'ファイル'} から ${result.totalRows}件のローカルデータを復旧しました。${backupRestoreSourceEncrypted ? '（復号後反映）' : ''}`
      );
      if (!auditOk) {
        throw new Error('バックアップ復旧の監査ログ記録に失敗しました。復旧後のデータと監査ログを確認してください。');
      }
      toast.success(`バックアップを復旧しました（${result.totalRows}件）。`);
      
      setPendingBackupPayload(null);
      setBackupDiffs(null);
      setBackupDrillReport(null);
      setBackupFile(null);
      setMigrationCsvPreview(null);
      setBackupRestoreSourceEncrypted(false);
    } catch (error: any) {
      console.error('Failed to import backup:', error);
      toast.error(`バックアップの復旧に失敗しました: ${error.message || error}`);
    } finally {
      setIsImportingBackup(false);
    }
  };

  const handleRecordBackupDrill = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!db || !backupDrillReport) return;

    try {
      const auditOk = await logAuditAction(
        db,
        'backup_drill',
        buildBackupRestoreDrillAuditDetail(backupDrillReport, backupRestoreSourceName || backupFile?.name || 'バックアップファイル')
      );
      if (!auditOk) {
        throw new Error('復旧テスト結果の監査ログ記録に失敗しました。');
      }
      await fetchAuditLogs();
      toast.success(`復旧テスト結果を監査ログに記録しました（${backupDrillReport.statusLabel}）。`);
    } catch (error: any) {
      console.error('Failed to record backup drill:', error);
      toast.error(`復旧テスト結果の記録に失敗しました: ${error.message || error}`);
    }
  };

  const handleCancelRestore = () => {
    setPendingBackupPayload(null);
    setBackupDiffs(null);
    setBackupDrillReport(null);
    setBackupFile(null);
    setMigrationCsvPreview(null);
    setImportPassword('');
    setShowImportPasswordInput(false);
    setPendingEncryptedPayload(null);
    setBackupRestoreSourceEncrypted(false);
    toast.info('復旧処理を取り消しました。');
  };

  const handleMigrationCsvKindChange = (kind: 'patients' | 'visits' | 'drug_stocks' | 'soap_records') => {
    setMigrationCsvKind(kind);
  };

  const handleMigrationCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setMigrationCsvFile(file);
  };

  const handleAnalyzeMigrationCsv = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!migrationCsvFile) {
      toast.error('移行プレビューするCSVを選択してください。');
      return;
    }
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsAnalyzingMigrationCsv(true);
    try {
      const buffer = await migrationCsvFile.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      const detectedEncoding = encoding.detect(uint8Array);
      const unicodeArray = encoding.convert(uint8Array, {
        to: 'UNICODE',
        from: typeof detectedEncoding === 'string' ? detectedEncoding : 'SJIS'
      });
      const csvText = encoding.codeToString(unicodeArray as number[]);
      const generatedAt = new Date();
      const preview = migrationCsvKind === 'patients'
        ? buildPatientCsvMigrationPreview(csvText, { generatedAt })
        : migrationCsvKind === 'visits'
          ? buildVisitCsvMigrationPreview(csvText, { generatedAt })
          : migrationCsvKind === 'drug_stocks'
            ? buildDrugStockCsvMigrationPreview(csvText, { generatedAt })
            : buildSoapCsvMigrationPreview(csvText, { generatedAt });
      const migrationLabel = migrationCsvKind === 'patients'
        ? '患者CSV'
        : migrationCsvKind === 'visits'
          ? '受付CSV'
          : migrationCsvKind === 'drug_stocks'
            ? '在庫CSV'
            : '薬歴CSV';
      setMigrationCsvPreview(preview);
      setBackupFile(null);
      setBackupRestoreSourceName(migrationCsvFile.name);
      setBackupRestoreSourceEncrypted(false);
      setShowImportPasswordInput(false);
      setPendingEncryptedPayload(null);
      setImportPassword('');
      await analyzeBackupPayload(preview.backup, { migrationRequiredCollections: [] });

      if (preview.status === 'blocked') {
        toast.error(`${migrationLabel}の移行プレビューを作成しました（${preview.statusLabel}）。指摘を修正してください。`);
      } else if (preview.status === 'attention') {
        toast.warning(`${migrationLabel}の移行プレビューを作成しました（${preview.statusLabel}）。`);
      } else {
        toast.success(`${migrationLabel}の移行プレビューを作成しました（${preview.rows.length}件）。`);
      }
    } catch (error: any) {
      console.error('Failed to analyze migration CSV:', error);
      toast.error(`CSVの移行プレビューに失敗しました: ${error.message || error}`);
    } finally {
      setIsAnalyzingMigrationCsv(false);
    }
  };

  const handleBackupFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setBackupFile(file);
  };

  const handleImportBackup = async () => {
    if (!ensurePermission('manage_backups')) return;
    if (!backupFile) {
      toast.error('復旧するバックアップJSONを選択してください。');
      return;
    }
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await backupFile.text());
    } catch (error) {
      toast.error('バックアップJSONを読み取れませんでした。');
      return;
    }

    if (isEncryptedBackup(parsed)) {
      setPendingEncryptedPayload(parsed);
      setShowImportPasswordInput(true);
      setBackupRestoreSourceEncrypted(true);
      return;
    }

    const validation = validateBackupPayload(parsed);
    if (!validation.ok) {
      toast.error(validation.reason);
      return;
    }

    analyzeBackupPayload(validation.backup);
    setBackupRestoreSourceEncrypted(false);
  };

  return {
    currentUser,
    canManageBackups,
    downloadTextFile,
    formatDateTimeStamp,
    backupScheduleReview,
    backupScheduleReviewColor,
    backupScheduleReviewBackground,
    backupSchedulePolicy,
    handleBackupSchedulePolicyChange,
    isSavingBackupSchedule,
    handleSaveBackupSchedulePolicy,
    handleScanPatientDuplicates,
    isScanningPatientDuplicates,
    patientDuplicateMessage,
    patientDuplicateReport,
    duplicateMergeTargets,
    setDuplicateMergeTargets,
    setDuplicateMergeReview,
    openDuplicateMergeReview,
    isApplyingDuplicateMerge,
    duplicateMergeReview,
    handleApplyDuplicateMerge,
    backupGenerationReview,
    backupGenerationReviewColor,
    backupGenerationReviewBackground,
    handleExportBackupGenerationReviewCsv,
    isExportingBackupGenerationReview,
    soapDraftFeedbackBackground,
    soapDraftFeedbackColor,
    aiSuggestionFeedbackReview,
    storeFeedbackBackground,
    storeFeedbackColor,
    latestBackupGenerationLabel,
    latestBackupDrillLabel,
    latestBackupExternalStorageLabel,
    useEncryption,
    setUseEncryption,
    showExportPassword,
    setShowExportPassword,
    exportPassword,
    setExportPassword,
    exportBackupExternalTransferManifest,
    setExportBackupExternalTransferManifest,
    externalBackupRetentionDays,
    setExternalBackupRetentionDays,
    handleExportBackup,
    isExportingBackup,
    handleRecordBackupExternalStorage,
    isRecordingExternalBackupStorage,
    externalBackupFileName,
    setExternalBackupFileName,
    externalBackupDestinationName,
    setExternalBackupDestinationName,
    externalBackupDestinationPath,
    setExternalBackupDestinationPath,
    externalBackupVerifierName,
    setExternalBackupVerifierName,
    externalBackupReadBackVerified,
    setExternalBackupReadBackVerified,
    externalBackupImmutableVerified,
    setExternalBackupImmutableVerified,
    externalBackupNotes,
    setExternalBackupNotes,
    handleExternalBackupReceiptFileChange,
    externalBackupReceiptFile,
    isRecordingExternalBackupReceipt,
    handleRecordBackupExternalTransferReceipt,
    migrationCsvKind,
    handleMigrationCsvKindChange,
    isAnalyzingMigrationCsv,
    isAnalyzingDiff,
    handleMigrationCsvFileChange,
    migrationCsvFile,
    handleAnalyzeMigrationCsv,
    migrationCsvPreview,
    pendingBackupPayload,
    handleBackupFileChange,
    showImportPasswordInput,
    backupFile,
    handleImportBackup,
    isImportingBackup,
    importPassword,
    setImportPassword,
    handleDecryptAndAnalyze,
    handleCancelRestore,
    backupDiffs,
    backupDrillReport,
    handleRecordBackupDrill,
    handleConfirmRestore
  };
}
