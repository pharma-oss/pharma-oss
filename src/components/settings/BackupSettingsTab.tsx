import React from 'react';
import { UploadCloud, AlertTriangle, Loader2, Save, FileText, Search, ShieldCheck, Download } from 'lucide-react';
import { User } from '@/db/types';
import { getPermissionDeniedMessage } from '@/lib/audit';
import {
  type BackupSchedulePolicy,
  type BackupCollectionName,
  type CollectionDiff,
  type BackupRestoreDrillReport,
  type YakurekiBackup,
  type BackupScheduleReview,
  type BackupGenerationReview
} from '@/lib/backup';
import {
  type DrugStockCsvMigrationPreview,
  type PatientCsvMigrationPreview,
  type SoapCsvMigrationPreview,
  type VisitCsvMigrationPreview
} from '@/lib/migration_csv';
import {
  type PatientDuplicateGroup,
  type PatientDuplicateScanReport
} from '@/lib/patient_duplicate_review';
import { type PatientMergeExecutionPlan, type PatientMergePlan } from '@/lib/patient_merge';
import { type AiSuggestionFeedbackMonthlyReview } from '@/lib/ai_suggestion_feedback';
import {
  type DbKeyEscrowPayload,
  createDbKeyEscrow,
  restoreDbKeyFromEscrow,
  computeKeyFingerprint,
  formatEscrowKeySheetText,
  parseEscrowKeySheetText,
  getLocalStoredDbPassword,
  setLocalStoredDbPassword
} from '@/lib/db_key_escrow';

import { getBackupDrillStatusStyle as backupDrillStatusStyle } from '@/lib/backup_settings_helpers';

interface DuplicateMergeReview {
  groupId: string;
  sourcePatientId: string;
  plan: PatientMergePlan;
  executionPlan: PatientMergeExecutionPlan;
}

interface BackupSettingsTabProps {
  currentUser: User;
  canManageBackups: boolean;
  downloadTextFile: (fileName: string, content: string, type: string) => void;
  formatDateTimeStamp: (date: Date) => string;
  backupScheduleReview: BackupScheduleReview;
  backupScheduleReviewColor: string;
  backupScheduleReviewBackground: string;
  backupSchedulePolicy: BackupSchedulePolicy;
  handleBackupSchedulePolicyChange: (patch: Partial<BackupSchedulePolicy>) => void;
  isSavingBackupSchedule: boolean;
  handleSaveBackupSchedulePolicy: () => Promise<void>;
  handleScanPatientDuplicates: () => Promise<void>;
  isScanningPatientDuplicates: boolean;
  patientDuplicateMessage: string;
  patientDuplicateReport: PatientDuplicateScanReport | null;
  duplicateMergeTargets: Record<string, string>;
  setDuplicateMergeTargets: (updater: (current: Record<string, string>) => Record<string, string>) => void;
  setDuplicateMergeReview: (value: DuplicateMergeReview | null) => void;
  openDuplicateMergeReview: (group: PatientDuplicateGroup, sourcePatientId: string) => Promise<void>;
  isApplyingDuplicateMerge: boolean;
  duplicateMergeReview: DuplicateMergeReview | null;
  handleApplyDuplicateMerge: () => Promise<void>;
  backupGenerationReview: BackupGenerationReview;
  backupGenerationReviewColor: string;
  backupGenerationReviewBackground: string;
  handleExportBackupGenerationReviewCsv: () => Promise<void>;
  isExportingBackupGenerationReview: boolean;
  soapDraftFeedbackBackground: string;
  soapDraftFeedbackColor: string;
  aiSuggestionFeedbackReview: AiSuggestionFeedbackMonthlyReview;
  storeFeedbackBackground: string;
  storeFeedbackColor: string;
  latestBackupGenerationLabel: string;
  latestBackupDrillLabel: string;
  latestBackupExternalStorageLabel: string;
  useEncryption: boolean;
  setUseEncryption: (value: boolean) => void;
  showExportPassword: boolean;
  setShowExportPassword: (value: boolean) => void;
  exportPassword: string;
  setExportPassword: (value: string) => void;
  exportBackupExternalTransferManifest: boolean;
  setExportBackupExternalTransferManifest: (value: boolean) => void;
  externalBackupRetentionDays: number;
  setExternalBackupRetentionDays: (value: number) => void;
  handleExportBackup: () => Promise<void>;
  isExportingBackup: boolean;
  handleRecordBackupExternalStorage: () => Promise<void>;
  isRecordingExternalBackupStorage: boolean;
  externalBackupFileName: string;
  setExternalBackupFileName: (value: string) => void;
  externalBackupDestinationName: string;
  setExternalBackupDestinationName: (value: string) => void;
  externalBackupDestinationPath: string;
  setExternalBackupDestinationPath: (value: string) => void;
  externalBackupVerifierName: string;
  setExternalBackupVerifierName: (value: string) => void;
  externalBackupReadBackVerified: boolean;
  setExternalBackupReadBackVerified: (value: boolean) => void;
  externalBackupImmutableVerified: boolean;
  setExternalBackupImmutableVerified: (value: boolean) => void;
  externalBackupNotes: string;
  setExternalBackupNotes: (value: string) => void;
  handleExternalBackupReceiptFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  externalBackupReceiptFile: File | null;
  isRecordingExternalBackupReceipt: boolean;
  handleRecordBackupExternalTransferReceipt: () => Promise<void>;
  migrationCsvKind: 'patients' | 'visits' | 'drug_stocks' | 'soap_records';
  handleMigrationCsvKindChange: (kind: 'patients' | 'visits' | 'drug_stocks' | 'soap_records') => void;
  isAnalyzingMigrationCsv: boolean;
  isAnalyzingDiff: boolean;
  handleMigrationCsvFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  migrationCsvFile: File | null;
  handleAnalyzeMigrationCsv: () => Promise<void>;
  migrationCsvPreview: PatientCsvMigrationPreview | VisitCsvMigrationPreview | DrugStockCsvMigrationPreview | SoapCsvMigrationPreview | null;
  pendingBackupPayload: YakurekiBackup | null;
  handleBackupFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showImportPasswordInput: boolean;
  backupFile: File | null;
  handleImportBackup: () => Promise<void>;
  isImportingBackup: boolean;
  importPassword: string;
  setImportPassword: (value: string) => void;
  handleDecryptAndAnalyze: () => void;
  handleCancelRestore: () => void;
  backupDiffs: CollectionDiff[] | null;
  backupDrillReport: BackupRestoreDrillReport | null;
  handleRecordBackupDrill: () => Promise<void>;
  handleConfirmRestore: () => Promise<void>;
}

export default function BackupSettingsTab({
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
}: BackupSettingsTabProps) {
  const [currentKeyFingerprint, setCurrentKeyFingerprint] = React.useState<string>('計算中...');
  const [escrowAdminPassword, setEscrowAdminPassword] = React.useState('');
  const [isGeneratingEscrow, setIsGeneratingEscrow] = React.useState(false);
  const [issuedEscrow, setIssuedEscrow] = React.useState<DbKeyEscrowPayload | null>(null);
  const [escrowError, setEscrowError] = React.useState<string | null>(null);

  // 復元用ステート
  const [escrowRestoreInput, setEscrowRestoreInput] = React.useState('');
  const [escrowRestorePassword, setEscrowRestorePassword] = React.useState('');
  const [isRestoringEscrow, setIsRestoringEscrow] = React.useState(false);
  const [escrowRestoreMessage, setEscrowRestoreMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  React.useEffect(() => {
    const localKey = getLocalStoredDbPassword() || process.env.NEXT_PUBLIC_DB_PASSWORD || '';
    if (localKey) {
      computeKeyFingerprint(localKey).then(setCurrentKeyFingerprint).catch(() => setCurrentKeyFingerprint('未設定'));
    } else {
      setCurrentKeyFingerprint('未設定 (セッション一時鍵)');
    }
  }, []);

  const handleIssueEscrowSheet = async () => {
    if (!escrowAdminPassword || escrowAdminPassword.length < 8) {
      setEscrowError('管理者パスワードは8文字以上で入力してください。');
      return;
    }
    setIsGeneratingEscrow(true);
    setEscrowError(null);
    try {
      const localKey = getLocalStoredDbPassword() || process.env.NEXT_PUBLIC_DB_PASSWORD || '';
      if (!localKey) {
        throw new Error('ローカルDB暗号鍵が見つかりません。');
      }
      const escrow = await createDbKeyEscrow(localKey, escrowAdminPassword);
      setIssuedEscrow(escrow);
      const text = formatEscrowKeySheetText(escrow, '青空薬局');
      downloadTextFile(`emergency_key_escrow_${escrow.keyFingerprint}.txt`, text, 'text/plain;charset=utf-8');
      setEscrowAdminPassword('');
    } catch (err: any) {
      setEscrowError(err.message || 'エスクローの発行に失敗しました。');
    } finally {
      setIsGeneratingEscrow(false);
    }
  };

  const handleRestoreFromEscrow = async () => {
    if (!escrowRestoreInput.trim()) {
      setEscrowRestoreMessage({ ok: false, text: 'エスクロー文字列またはJSONを入力してください。' });
      return;
    }
    if (!escrowRestorePassword) {
      setEscrowRestoreMessage({ ok: false, text: '管理者パスワードを入力してください。' });
      return;
    }
    setIsRestoringEscrow(true);
    setEscrowRestoreMessage(null);
    try {
      const parsed = parseEscrowKeySheetText(escrowRestoreInput);
      if (!parsed) {
        throw new Error('エスクローデータの形式を認識できませんでした。Base64またはJSONをそのまま貼り付けてください。');
      }
      const result = await restoreDbKeyFromEscrow(parsed, escrowRestorePassword);
      if (!result.ok) {
        throw new Error(result.reason);
      }
      setLocalStoredDbPassword(result.dbPassword);
      setEscrowRestoreMessage({
        ok: true,
        text: `DB暗号鍵の復元に成功しました（Fingerprint: ${result.keyFingerprint}）。ページを再読み込みして復旧したDBにアクセスしてください。`
      });
      setEscrowRestoreInput('');
      setEscrowRestorePassword('');
    } catch (err: any) {
      setEscrowRestoreMessage({ ok: false, text: err.message || '復元に失敗しました。' });
    } finally {
      setIsRestoringEscrow(false);
    }
  };

  return (
        <div className="settings-section glass backup-section" data-testid="backup-section">
          <h2>バックアップ/復旧</h2>
          <p className="section-desc">この端末のローカルDBをJSONとして書き出し、選択したバックアップから同じIDのデータを復旧できます。</p>

          <div className="backup-alert" role="status">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>バックアップJSONには患者情報、薬歴、保険情報、操作ログが含まれます。店舗で定めた保管場所に保存し、不要な端末や共有フォルダへ置かないでください。</span>
          </div>

          <section className="backup-schedule-section" aria-label="閉店時バックアップ予定">
            <div className="backup-schedule-header">
              <div>
                <h3>閉店時バックアップ予定</h3>
                <p className="help-text">予定時刻を過ぎても今日の暗号化バックアップと外部保存確認が未完了なら、ダッシュボードと日次締めで要対応にします。</p>
              </div>
              <span className={`backup-schedule-status status-${backupScheduleReview.status}`}>
                {backupScheduleReview.statusLabel}
              </span>
            </div>
            <div className="backup-schedule-summary">
              {[
                ['予定時刻', backupScheduleReview.scheduledTime],
                ['判定', backupScheduleReview.actionLabel],
                ['次の対応', backupScheduleReview.requiredActions.join(' / ')]
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <p className="help-text">{backupScheduleReview.detail}</p>
            <div className="backup-schedule-form">
              <label>
                <span>予定を有効にする</span>
                <input
                  type="checkbox"
                  checked={backupSchedulePolicy.enabled}
                  onChange={(e) => handleBackupSchedulePolicyChange({ enabled: e.target.checked })}
                />
              </label>
              <label>
                <span>予定時刻</span>
                <input
                  type="time"
                  className="form-control"
                  value={backupSchedulePolicy.scheduledTime}
                  onChange={(e) => handleBackupSchedulePolicyChange({ scheduledTime: e.target.value })}
                />
              </label>
              <label>
                <span>暗号化を必須にする</span>
                <input
                  type="checkbox"
                  checked={backupSchedulePolicy.requireEncrypted}
                  onChange={(e) => handleBackupSchedulePolicyChange({ requireEncrypted: e.target.checked })}
                />
              </label>
              <label>
                <span>外部保存確認を必須にする</span>
                <input
                  type="checkbox"
                  checked={backupSchedulePolicy.requireExternalStorage}
                  onChange={(e) => handleBackupSchedulePolicyChange({ requireExternalStorage: e.target.checked })}
                />
              </label>
              <button
                type="button"
                className="btn-secondary flex-center gap-2"
                onClick={handleSaveBackupSchedulePolicy}
                disabled={!canManageBackups || isSavingBackupSchedule}
                title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : undefined}
              >
                {isSavingBackupSchedule ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                <span>{isSavingBackupSchedule ? '保存中...' : '予定を保存'}</span>
              </button>
            </div>
          </section>

          <section
            aria-label="患者重複点検（名寄せ）"
            data-testid="patient-duplicate-review-section"
            className="patient-duplicate-section"
          >
            <div className="duplicate-header">
              <div>
                <h3>患者重複点検（名寄せ）</h3>
                <p className="help-text">
                  氏名またはカナと生年月日が一致する患者を全件から洗い出します。統合すると受付とアラートを「残す患者」へ付け替え、統合元患者を削除します（実行は監査ログに残ります）。チュートリアルのデモ患者は対象外です。
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary flex-center gap-2"
                onClick={handleScanPatientDuplicates}
                disabled={!canManageBackups || isScanningPatientDuplicates}
                title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : undefined}
                data-testid="patient-duplicate-scan-button"
              >
                {isScanningPatientDuplicates ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
                <span>{isScanningPatientDuplicates ? '点検中...' : '重複候補を確認'}</span>
              </button>
            </div>
            {patientDuplicateMessage && <p className="help-text" role="status">{patientDuplicateMessage}</p>}
            {patientDuplicateReport && patientDuplicateReport.groups.length > 0 && (
              <div className="duplicate-groups-list">
                {patientDuplicateReport.groups.map((group) => {
                  const targetPatientId = duplicateMergeTargets[group.groupId] || group.suggestedTargetPatientId;
                  return (
                    <div key={group.groupId} className="duplicate-group-card">
                      <div className="duplicate-group-header">
                        <strong>{group.displayName}</strong>
                        <span className="help-text">{group.birthDate}</span>
                        <span className="help-text">{group.matchLabel} / {group.members.length}名</span>
                      </div>
                      <div className="duplicate-members-list">
                        {group.members.map((member) => (
                          <div key={member.patientId} className="duplicate-member-row">
                            <label className="member-keep-label">
                              <input
                                type="radio"
                                name={`duplicate-target-${group.groupId}`}
                                checked={targetPatientId === member.patientId}
                                onChange={() => {
                                  setDuplicateMergeTargets((current) => ({ ...current, [group.groupId]: member.patientId }));
                                  setDuplicateMergeReview(null);
                                }}
                              />
                              <span>残す</span>
                            </label>
                            <span className="member-name">{member.name}{member.kana ? `（${member.kana}）` : ''}</span>
                            <span className="help-text">受付 {member.visitCount}件{member.latestVisitDate ? ` / 直近 ${member.latestVisitDate.slice(0, 10)}` : ''}</span>
                            <span className="help-text">保険者番号 {member.insuranceNumber || '未登録'}</span>
                            {member.patientId !== targetPatientId && (
                              <button
                                type="button"
                                className="btn-secondary btn-duplicate-review"
                                onClick={() => openDuplicateMergeReview(group, member.patientId)}
                                disabled={!canManageBackups || isApplyingDuplicateMerge}
                              >
                                統合確認
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {duplicateMergeReview?.groupId === group.groupId && (
                        <div className="duplicate-merge-review" data-testid="patient-duplicate-merge-review">
                          <strong className="merge-review-title">統合内容の確認</strong>
                          <p className="help-text">{duplicateMergeReview.plan.summary}</p>
                          {duplicateMergeReview.plan.issues.length > 0 && (
                            <ul className="help-text merge-review-issues">
                              {duplicateMergeReview.plan.issues.map((issue) => (
                                <li key={issue.code}>{issue.severity === 'error' ? '要修正: ' : '確認: '}{issue.message}</li>
                              ))}
                            </ul>
                          )}
                          {duplicateMergeReview.plan.conflicts.length > 0 && (
                            <ul className="help-text merge-review-conflicts">
                              {duplicateMergeReview.plan.conflicts.map((conflict) => (
                                <li key={conflict.field}>{conflict.label}: 統合元「{conflict.sourceValue}」→ 残す値「{conflict.targetValue}」</li>
                              ))}
                            </ul>
                          )}
                          <div className="merge-review-actions">
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={handleApplyDuplicateMerge}
                              disabled={!duplicateMergeReview.executionPlan.canApply || isApplyingDuplicateMerge}
                              data-testid="patient-duplicate-merge-apply"
                            >
                              {isApplyingDuplicateMerge ? '統合中...' : '患者統合を実行'}
                            </button>
                            <button type="button" className="btn-secondary" onClick={() => setDuplicateMergeReview(null)} disabled={isApplyingDuplicateMerge}>
                              閉じる
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section
            aria-label="バックアップ世代管理"
            className="generation-section"
          >
            <div className="generation-header">
              <div>
                <h3 className="generation-title">バックアップ世代管理</h3>
                <p className="generation-subtitle">
                  直近{backupGenerationReview.retentionDays}日 / 必要 {backupGenerationReview.requiredGenerationCount}世代
                </p>
              </div>
              <div className="generation-header-actions">
                <span className={`generation-status-badge status-${backupGenerationReview.status}`}>
                  {backupGenerationReview.statusLabel}
                </span>
                <button
                  className="btn-secondary flex-center gap-2 btn-generation-csv"
                  onClick={handleExportBackupGenerationReviewCsv}
                  disabled={!canManageBackups || isExportingBackupGenerationReview}
                  title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : undefined}
                >
                  {isExportingBackupGenerationReview ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>世代管理CSV</span>
                </button>
              </div>
            </div>
            <div className="generation-kpi-grid">
              {[
                ['保存世代', `${backupGenerationReview.generationCount}世代`],
                ['暗号化', `${backupGenerationReview.encryptedGenerationCount}世代`],
                ['復旧テスト', backupGenerationReview.drillAgeDays === undefined ? '未記録' : `${backupGenerationReview.drillAgeDays}日前`],
                ['外部保存', backupGenerationReview.externalStorageStatusLabel],
                ['対応', backupGenerationReview.actionLabel]
              ].map(([label, value]) => (
                <div key={label} className="generation-kpi-item">
                  <div className="generation-kpi-label">{label}</div>
                  <div className={`generation-kpi-value ${label === '保存世代' || label === '外部保存' ? `highlight status-${backupGenerationReview.status}` : ''}`}>{value}</div>
                </div>
              ))}
            </div>
            <div className="ai-feedback-grid">
              <div className={`feedback-card card-soap status-${aiSuggestionFeedbackReview.soapDraftSummary.status}`}>
                <div className="feedback-card-header">
                  <div>
                    <div className="feedback-card-title">SOAP下書き品質レビュー</div>
                    <div className="feedback-card-subtitle">
                      採否 {aiSuggestionFeedbackReview.soapDraftSummary.totalCount}件 / {aiSuggestionFeedbackReview.soapDraftSummary.actionLabel}
                    </div>
                  </div>
                  <span className={`feedback-badge status-${aiSuggestionFeedbackReview.soapDraftSummary.status}`}>
                    {aiSuggestionFeedbackReview.soapDraftSummary.statusLabel}
                  </span>
                </div>
                <div className="feedback-stats-grid">
                  {[
                    ['採用率', `${aiSuggestionFeedbackReview.soapDraftSummary.acceptanceRate}%`],
                    ['修正/却下率', `${aiSuggestionFeedbackReview.soapDraftSummary.correctionRate}%`],
                    ['平均信頼度', aiSuggestionFeedbackReview.soapDraftSummary.averageConfidence === undefined ? '-' : `${aiSuggestionFeedbackReview.soapDraftSummary.averageConfidence}%`],
                    ['S/O/A/P', `${aiSuggestionFeedbackReview.soapDraftSummary.typeCounts.S}/${aiSuggestionFeedbackReview.soapDraftSummary.typeCounts.O}/${aiSuggestionFeedbackReview.soapDraftSummary.typeCounts.A}/${aiSuggestionFeedbackReview.soapDraftSummary.typeCounts.P}`]
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="feedback-stat-label">{label}</div>
                      <div className="feedback-stat-value">{value}</div>
                    </div>
                  ))}
                </div>
                <div className={`feedback-action-text status-${aiSuggestionFeedbackReview.soapDraftSummary.status}`}>
                  {aiSuggestionFeedbackReview.soapDraftSummary.requiredActions.join(' / ')}
                </div>
              </div>
              <div className="feedback-card card-domain">
                <div className="feedback-card-title">提案種別別</div>
                {aiSuggestionFeedbackReview.domainSummaries.length > 0 ? (
                  <div className="domain-summaries-list">
                    {aiSuggestionFeedbackReview.domainSummaries.map((summary) => (
                      <div key={summary.domain} className="domain-summary-row">
                        <span className="domain-summary-label">{summary.domainLabel}</span>
                        <span>{summary.totalCount}件</span>
                        <span>採用 {summary.acceptanceRate}%</span>
                        <span>修正/却下 {summary.correctionRate}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="domain-empty-text">今月の提案種別ログは未記録です。</div>
                )}
              </div>
              <div className={`feedback-card card-store status-${aiSuggestionFeedbackReview.storeComparison.status}`}>
                <div className="feedback-card-header">
                  <div>
                    <div className="feedback-card-title">店舗別フィードバック比較</div>
                    <div className="feedback-card-subtitle">
                      {aiSuggestionFeedbackReview.storeComparison.currentStoreName} / 比較店舗 {aiSuggestionFeedbackReview.storeComparison.storeCount}件
                    </div>
                  </div>
                  <span className={`feedback-badge status-${aiSuggestionFeedbackReview.storeComparison.status}`}>
                    {aiSuggestionFeedbackReview.storeComparison.statusLabel}
                  </span>
                </div>
                <div className="feedback-stats-grid">
                  {[
                    ['自店採用率', aiSuggestionFeedbackReview.storeComparison.currentStore ? `${aiSuggestionFeedbackReview.storeComparison.currentStore.acceptanceRate}%` : '-'],
                    ['全体平均', `${aiSuggestionFeedbackReview.storeComparison.allStoreAverageAcceptanceRate}%`],
                    ['他店平均', aiSuggestionFeedbackReview.storeComparison.peerAverageAcceptanceRate === undefined ? '-' : `${aiSuggestionFeedbackReview.storeComparison.peerAverageAcceptanceRate}%`],
                    ['平均との差', aiSuggestionFeedbackReview.storeComparison.currentStore ? `${aiSuggestionFeedbackReview.storeComparison.currentStore.differenceFromAverage > 0 ? '+' : ''}${aiSuggestionFeedbackReview.storeComparison.currentStore.differenceFromAverage}pt` : '-']
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="feedback-stat-label">{label}</div>
                      <div className="feedback-stat-value">{value}</div>
                    </div>
                  ))}
                </div>
                {aiSuggestionFeedbackReview.storeComparison.storeSummaries.length > 0 && (
                  <div className="store-summaries-list">
                    {aiSuggestionFeedbackReview.storeComparison.storeSummaries.slice(0, 3).map((summary) => (
                      <div key={summary.storeKey} className="store-summary-row">
                        <span className="store-summary-label">{summary.storeName}</span>
                        <span>{summary.totalCount}件</span>
                        <span>採用 {summary.acceptanceRate}%</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className={`feedback-action-text status-${aiSuggestionFeedbackReview.storeComparison.status}`}>
                  {aiSuggestionFeedbackReview.storeComparison.requiredActions.join(' / ')}
                </div>
              </div>
            </div>
            <div className="generation-summary-footer">
              <div>
                <div className="generation-footer-label">最新バックアップ</div>
                <div className="generation-footer-val">{latestBackupGenerationLabel}</div>
              </div>
              <div>
                <div className="generation-footer-label">最新復旧テスト</div>
                <div className="generation-footer-val">{latestBackupDrillLabel}</div>
              </div>
              <div>
                <div className="generation-footer-label">最新外部保存確認</div>
                <div className="generation-footer-val">{latestBackupExternalStorageLabel}</div>
              </div>
              <div>
                <div className="generation-footer-label">必要な対応</div>
                <div className={`generation-footer-val ${backupGenerationReview.status !== 'pass' ? `status-${backupGenerationReview.status}` : ''}`}>
                  {backupGenerationReview.requiredActions.join(' / ')}
                </div>
              </div>
            </div>
          </section>

          {/* 暗号鍵エスクロー（緊急復旧）管理セクション */}
          <section
            aria-label="暗号鍵エスクロー（緊急復旧）管理"
            data-testid="db-key-escrow-section"
            className="escrow-section"
          >
            <div className="escrow-header">
              <div>
                <h3 className="escrow-title">
                  <ShieldCheck size={20} aria-hidden="true" />
                  暗号鍵エスクロー（緊急復旧）管理
                </h3>
                <p className="help-text escrow-desc">
                  端末障害・ブラウザプロファイル破損時のデータ全損を防ぐため、DB暗号鍵を管理者パスワード（PBKDF2 120,000回 ＋ AES-GCM-256）で暗号化して控えを発行・復旧します。
                </p>
              </div>
              <div className="escrow-fingerprint-box">
                <span className="fingerprint-label">現在のDB鍵識別子 (Fingerprint)</span>
                <strong className="fingerprint-val">{currentKeyFingerprint}</strong>
              </div>
            </div>

            <div className="escrow-panels-grid">
              {/* 発行パネル */}
              <div className="escrow-panel">
                <h4 className="escrow-panel-title">① 緊急復旧用シートを発行・保管</h4>
                <p className="escrow-panel-desc">
                  管理者パスワードを入力してエスクローテキストを発行します。耐火金庫等の鍵のかかる安全な場所に施錠保管してください。
                </p>
                <div className="escrow-issue-controls">
                  <input
                    type="password"
                    placeholder="管理者パスワード (8文字以上)"
                    value={escrowAdminPassword}
                    onChange={(e) => setEscrowAdminPassword(e.target.value)}
                    disabled={isGeneratingEscrow || !canManageBackups}
                    className="input-escrow-password"
                    data-testid="escrow-issue-password-input"
                  />
                  <button
                    type="button"
                    className="btn-primary flex-center gap-2 btn-escrow-action"
                    onClick={handleIssueEscrowSheet}
                    disabled={isGeneratingEscrow || !canManageBackups || !escrowAdminPassword}
                    data-testid="escrow-issue-button"
                  >
                    {isGeneratingEscrow ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
                    <span>エスクロー控えを出力</span>
                  </button>
                </div>
                {escrowError && (
                  <p className="escrow-error-text">{escrowError}</p>
                )}
                {issuedEscrow && (
                  <div className="escrow-success-banner">
                    ✔ エスクローを発行しダウンロードしました (FP: {issuedEscrow.keyFingerprint})
                  </div>
                )}
              </div>

              {/* 復元パネル */}
              <div className="escrow-panel" data-testid="db-key-escrow-restore-section">
                <h4 className="escrow-panel-title">② エスクローからDB暗号鍵を復元</h4>
                <p className="escrow-panel-desc">
                  紙面控えのBase64またはJSONと、発行時の管理者パスワードを入力して端末のDB暗号鍵を復元します。
                </p>
                <div className="escrow-restore-form">
                  <textarea
                    placeholder="エスクロー暗号化ペイロード (Base64またはJSON)"
                    value={escrowRestoreInput}
                    onChange={(e) => setEscrowRestoreInput(e.target.value)}
                    rows={2}
                    className="textarea-escrow-payload"
                    data-testid="escrow-restore-payload-input"
                  />
                  <div className="escrow-restore-controls">
                    <input
                      type="password"
                      placeholder="発行時の管理者パスワード"
                      value={escrowRestorePassword}
                      onChange={(e) => setEscrowRestorePassword(e.target.value)}
                      disabled={isRestoringEscrow || !canManageBackups}
                      className="input-escrow-password"
                      data-testid="escrow-restore-password-input"
                    />
                    <button
                      type="button"
                      className="btn-primary flex-center gap-2 btn-escrow-restore"
                      onClick={handleRestoreFromEscrow}
                      disabled={isRestoringEscrow || !canManageBackups || !escrowRestoreInput || !escrowRestorePassword}
                      data-testid="escrow-restore-button"
                    >
                      {isRestoringEscrow ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />}
                      <span>暗号鍵を復元して適用</span>
                    </button>
                  </div>
                </div>
                {escrowRestoreMessage && (
                  <div className={`escrow-message-banner ${escrowRestoreMessage.ok ? 'message-ok' : 'message-error'}`}>
                    {escrowRestoreMessage.text}
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="backup-workflow">
            <section className="backup-workflow-item">
              <div>
                <h3>バックアップを書き出す</h3>
                <p className="help-text">患者、受付、処方、薬歴、マスタ、設定、スタッフ、操作ログをまとめて保存します。</p>
                <div className="export-options-list">
                  <label className="export-checkbox-label">
                    <input
                      type="checkbox"
                      checked={useEncryption}
                      onChange={(e) => setUseEncryption(e.target.checked)}
                      className="checkbox-accent"
                      aria-label="バックアップファイルをパスワードで暗号化する"
                      data-testid="backup-export-encryption-checkbox"
                    />
                    <span>バックアップファイルをパスワードで暗号化する（推奨・既定）</span>
                  </label>
                  {!useEncryption && (
                    <div className="backup-plain-warning" role="alert">
                      暗号化しないバックアップには患者情報、薬歴、スタッフ情報、監査ログが平文で含まれます。移行や障害対応などの例外時だけ使用してください。
                    </div>
                  )}
                  {useEncryption && (
                    <div className="export-password-wrapper">
                      <input
                        type={showExportPassword ? 'text' : 'password'}
                        placeholder="暗号化パスワードを入力"
                        value={exportPassword}
                        onChange={(e) => setExportPassword(e.target.value)}
                        className="form-control input-export-password"
                        aria-label="暗号化パスワード"
                        data-testid="backup-export-password"
                      />
                      <button
                        type="button"
                        className="btn-secondary btn-toggle-password"
                        onClick={() => setShowExportPassword(!showExportPassword)}
                      >
                        {showExportPassword ? '隠す' : '表示'}
                      </button>
                    </div>
                  )}
                  <label className="export-checkbox-label">
                    <input
                      type="checkbox"
                      checked={exportBackupExternalTransferManifest}
                      onChange={(e) => setExportBackupExternalTransferManifest(e.target.checked)}
                      className="checkbox-accent"
                      aria-label="外部保存連携JSONも出力する"
                      data-testid="backup-export-transfer-manifest-checkbox"
                    />
                    <span>外部保存連携JSONも出力する</span>
                  </label>
                  {exportBackupExternalTransferManifest && (
                    <label className="retention-days-label">
                      <span>保存先保持日数</span>
                      <input
                        type="number"
                        min={1}
                        className="form-control input-retention-days"
                        value={externalBackupRetentionDays}
                        onChange={(e) => setExternalBackupRetentionDays(Number(e.target.value) || 1)}
                        data-testid="backup-export-transfer-retention-days"
                      />
                    </label>
                  )}
                </div>
              </div>
              <button
                className="btn-primary flex-center gap-2"
                onClick={handleExportBackup}
                disabled={isExportingBackup || !canManageBackups}
                title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : undefined}
                data-testid="backup-export-button"
              >
                {isExportingBackup ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
                <span>{isExportingBackup ? '書き出し中...' : 'バックアップを書き出す'}</span>
              </button>
            </section>

            <section className="backup-workflow-item backup-external-item">
              <div>
                <h3>外部保存を確認する</h3>
                <p className="help-text">書き出したバックアップを店舗で定めた保存先へ置き、保存先から開けることと上書き・削除されにくい設定を確認します。</p>
              </div>
              <button
                className="btn-primary flex-center gap-2"
                onClick={handleRecordBackupExternalStorage}
                disabled={isRecordingExternalBackupStorage || !canManageBackups}
                title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : undefined}
              >
                {isRecordingExternalBackupStorage ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
                <span>{isRecordingExternalBackupStorage ? '記録中...' : '外部保存を記録'}</span>
              </button>
              <div className="backup-external-form">
                <label>
                  <span>バックアップファイル名</span>
                  <input
                    type="text"
                    className="form-control"
                    value={externalBackupFileName}
                    onChange={(e) => setExternalBackupFileName(e.target.value)}
                    placeholder={backupGenerationReview.latestBackup?.fileName || 'yakureki_backup_YYYYMMDD_HHMMSS.json'}
                  />
                </label>
                <label>
                  <span>保存先名</span>
                  <input
                    type="text"
                    className="form-control"
                    value={externalBackupDestinationName}
                    onChange={(e) => setExternalBackupDestinationName(e.target.value)}
                    placeholder="例: 店舗バックアップ保管庫"
                    data-testid="backup-external-destination-name"
                  />
                </label>
                <label>
                  <span>保存先パス/URL</span>
                  <input
                    type="text"
                    className="form-control"
                    value={externalBackupDestinationPath}
                    onChange={(e) => setExternalBackupDestinationPath(e.target.value)}
                    placeholder="例: s3://pharmacy-backup/yakureki/"
                    data-testid="backup-external-destination-path"
                  />
                </label>
                <label>
                  <span>確認者</span>
                  <input
                    type="text"
                    className="form-control"
                    value={externalBackupVerifierName}
                    onChange={(e) => setExternalBackupVerifierName(e.target.value)}
                    placeholder={currentUser.name || '管理者'}
                  />
                </label>
                <div className="backup-external-checks">
                  <label>
                    <input
                      type="checkbox"
                      checked={externalBackupReadBackVerified}
                      onChange={(e) => setExternalBackupReadBackVerified(e.target.checked)}
                    />
                    <span>保存先から開ける</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={externalBackupImmutableVerified}
                      onChange={(e) => setExternalBackupImmutableVerified(e.target.checked)}
                    />
                    <span>上書き・削除不可を確認</span>
                  </label>
                </div>
                <label className="backup-external-notes">
                  <span>備考</span>
                  <input
                    type="text"
                    className="form-control"
                    value={externalBackupNotes}
                    onChange={(e) => setExternalBackupNotes(e.target.value)}
                    placeholder="例: オブジェクトロック30日を確認"
                    data-testid="backup-external-notes"
                  />
                </label>
                <div className="backup-external-receipt">
                  <label className="file-input-label">
                    <FileText size={22} className="upload-icon" aria-hidden="true" />
                    <span>受領書JSONを選択</span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={handleExternalBackupReceiptFileChange}
                      className="hidden-input"
                      aria-label="外部保存ジョブ受領書JSONを選択"
                      disabled={isRecordingExternalBackupReceipt}
                    />
                  </label>
                  {externalBackupReceiptFile && (
                    <div className="file-info">
                      選択中の受領書: <strong>{externalBackupReceiptFile.name}</strong>
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn-secondary flex-center gap-2"
                    onClick={handleRecordBackupExternalTransferReceipt}
                    disabled={!canManageBackups || !externalBackupReceiptFile || isRecordingExternalBackupReceipt}
                    title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : !externalBackupReceiptFile ? '外部保存ジョブ受領書JSONを選択してください' : undefined}
                  >
                    {isRecordingExternalBackupReceipt ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
                    <span>{isRecordingExternalBackupReceipt ? '受領書を記録中...' : '受領書を監査ログへ記録'}</span>
                  </button>
                </div>
              </div>
            </section>

            <section className="backup-workflow-item">
              <div>
                <h3>移行CSVをプレビュー</h3>
                <p className="help-text">既存薬局ソフトから出力した患者CSV/TSV、受付CSV/TSV、在庫CSV/TSV、薬歴CSV/TSVを、復旧前プレビューで確認できる移行データに変換します。</p>
              </div>
              <div className="backup-import-controls">
                <div role="group" aria-label="移行CSV種別" className="migration-kind-group">
                  {[
                    ['patients', '患者'],
                    ['visits', '受付'],
                    ['drug_stocks', '在庫'],
                    ['soap_records', '薬歴']
                  ].map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      className={`${migrationCsvKind === kind ? 'btn-primary' : 'btn-secondary'} btn-migration-kind`}
                      onClick={() => handleMigrationCsvKindChange(kind as 'patients' | 'visits' | 'drug_stocks' | 'soap_records')}
                      disabled={isAnalyzingMigrationCsv || isAnalyzingDiff}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="file-input-label">
                  <FileText size={24} className="upload-icon" aria-hidden="true" />
                  <span>CSV/TSVを選択</span>
                  <input
                    type="file"
                    accept=".csv,.tsv,text/csv,text/tab-separated-values"
                    onChange={handleMigrationCsvFileChange}
                    className="hidden-input"
                    aria-label="移行CSVファイルを選択"
                    disabled={isAnalyzingMigrationCsv || isAnalyzingDiff}
                  />
                </label>
                {migrationCsvFile && (
                  <div className="file-info">
                    選択中のファイル: <strong>{migrationCsvFile.name}</strong>
                  </div>
                )}
                <button
                  className="btn-primary flex-center gap-2"
                  onClick={handleAnalyzeMigrationCsv}
                  disabled={!migrationCsvFile || isAnalyzingMigrationCsv || isAnalyzingDiff || !canManageBackups}
                  title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : !migrationCsvFile ? 'CSV/TSVを選択してください' : undefined}
                >
                  {isAnalyzingMigrationCsv ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
                  <span>{isAnalyzingMigrationCsv ? '解析中...' : 'CSVを変換してプレビュー'}</span>
                </button>
              </div>

              {migrationCsvPreview && (
                <div
                  aria-label="移行CSVマッピング"
                  className="migration-preview-wrapper"
                >
                  <div className="migration-preview-header">
                    <div className="migration-preview-title-group">
                      <strong className="migration-preview-title">
                        {migrationCsvKind === 'patients'
                          ? '患者CSV移行マッピング'
                          : migrationCsvKind === 'visits'
                            ? '受付CSV移行マッピング'
                            : migrationCsvKind === 'drug_stocks'
                              ? '在庫CSV移行マッピング'
                              : '薬歴CSV移行マッピング'}
                      </strong>
                      <span className={`backup-status-badge status-${migrationCsvPreview.status}`}>
                        {migrationCsvPreview.statusLabel}
                      </span>
                    </div>
                    {migrationCsvPreview.sourceFormat && (
                      <span className="migration-format-badge">
                        {migrationCsvPreview.sourceFormat.delimiter === 'tab' ? 'TSV' : 'CSV'} / 見出し {migrationCsvPreview.sourceFormat.headerLine}行目
                      </span>
                    )}
                  </div>
                  <div className="migration-stats-grid">
                    {[
                      [migrationCsvKind === 'patients' ? '患者行' : migrationCsvKind === 'visits' ? '受付行' : migrationCsvKind === 'drug_stocks' ? '在庫行' : '薬歴行', `${migrationCsvPreview.rows.length}件`],
                      ['指摘', `${migrationCsvPreview.issues.length}件`],
                      ['ID欠落', `${migrationCsvPreview.diagnostic.missingPrimaryKeyCount}件`],
                      ['同一ID重複', `${migrationCsvPreview.diagnostic.duplicatePrimaryKeyCount}件`],
                      ['文字化け疑い', `${migrationCsvPreview.diagnostic.mojibakeSuspectCount}件`]
                    ].map(([label, value]) => (
                      <div key={label} className="migration-stat-item">
                        <div className="migration-stat-label">{label}</div>
                        <div className="migration-stat-value">{value}</div>
                      </div>
                    ))}
                  </div>
                  {migrationCsvPreview.sourceFormat && Object.keys(migrationCsvPreview.sourceFormat.recognizedColumns).length > 0 && (
                    <div className="migration-columns-info">
                      認識列: {Object.values(migrationCsvPreview.sourceFormat.recognizedColumns).filter(Boolean).join(' / ')}
                    </div>
                  )}
                  {migrationCsvPreview.issues.length > 0 && (
                    <div className="migration-issues-list">
                      {migrationCsvPreview.issues.slice(0, 4).map((issue) => (
                        <div key={`${issue.code}-${issue.line || 'file'}`} className="migration-issue-row">
                          <span className={`backup-status-badge status-${issue.severity === 'error' ? 'blocked' : 'attention'}`}>
                            {issue.severity === 'error' ? '修正' : '要確認'}
                          </span>
                          <span className="issue-title">{issue.title}</span>
                          <span className="issue-message">{issue.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="migration-actions">
                    <button
                      type="button"
                      className="btn-secondary btn-save-migration-json"
                      onClick={() => downloadTextFile(
                        `yakureki_${migrationCsvKind === 'patients' ? 'patient' : migrationCsvKind === 'visits' ? 'visit' : migrationCsvKind === 'drug_stocks' ? 'drug_stock' : 'soap'}_migration_${formatDateTimeStamp(new Date())}.json`,
                        JSON.stringify(migrationCsvPreview.backup, null, 2),
                        'application/json;charset=utf-8'
                      )}
                    >
                      変換JSONを保存
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className={`backup-workflow-item ${pendingBackupPayload ? 'no-border-bottom' : ''}`}>
              <div>
                <h3>バックアップを復旧する</h3>
                <p className="help-text">バックアップ内にある既存IDのデータは更新され、未登録のデータは追加されます。</p>
              </div>
              <div className="backup-import-controls">
                <label className="file-input-label">
                  <UploadCloud size={24} className="upload-icon" aria-hidden="true" />
                  <span>JSONを選択</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleBackupFileChange}
                    className="hidden-input"
                    aria-label="バックアップJSONファイルを選択"
                    disabled={showImportPasswordInput || !!pendingBackupPayload}
                  />
                </label>
                {backupFile && (
                  <div className="file-info">
                    選択中のファイル: <strong>{backupFile.name}</strong>
                  </div>
                )}
                {!showImportPasswordInput && !pendingBackupPayload && (
                  <button
                    className="btn-primary flex-center gap-2"
                    onClick={handleImportBackup}
                    disabled={!backupFile || isImportingBackup || isAnalyzingDiff || !canManageBackups}
                    title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : !backupFile ? '復旧するJSONファイルを選択してください' : undefined}
                  >
                    {isAnalyzingDiff ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <UploadCloud size={18} aria-hidden="true" />}
                    <span>{isAnalyzingDiff ? '解析中...' : 'バックアップを復旧する'}</span>
                  </button>
                )}
              </div>

              {showImportPasswordInput && (
                <div className="import-password-box">
                  <div className="import-password-title">
                    <span>🔑 暗号化されたバックアップファイルです。復号用パスワードを入力してください。</span>
                  </div>
                  <div className="import-password-controls">
                    <input
                      type="password"
                      placeholder="復号用パスワードを入力"
                      value={importPassword}
                      onChange={(e) => setImportPassword(e.target.value)}
                      className="form-control input-import-password"
                      aria-label="復号用パスワード"
                    />
                    <button
                      className="btn-primary btn-import-pw-action"
                      onClick={handleDecryptAndAnalyze}
                    >
                      復号する
                    </button>
                    <button
                      className="btn-secondary btn-import-pw-action"
                      onClick={handleCancelRestore}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}

              {backupDiffs && pendingBackupPayload && (
                <div className="backup-preview-box">
                  <h3 className="backup-preview-title">
                    <ShieldCheck size={20} className="text-success" />
                    <span>復旧前プレビュー（差分解析結果）</span>
                  </h3>
                  <p className="help-text backup-preview-desc">
                    アップロードされたバックアップから差分を検出しました。内容を確認し、問題なければ「復旧を実行する」をクリックしてください。既存IDのデータは上書きされます。
                  </p>

                  {backupDrillReport && (
                    <div
                      aria-label="復旧テスト（訓練）レポート"
                      className="drill-report-box"
                    >
                      <div className="drill-report-header">
                        <div className="drill-report-title-group">
                          <strong className="drill-report-title">復旧テスト（訓練）</strong>
                          <span className={`backup-status-badge status-${backupDrillReport.status}`}>{backupDrillReport.statusLabel}</span>
                        </div>
                        <span className="drill-report-date">
                          バックアップ作成 {new Date(backupDrillReport.backupCreatedAt).toLocaleString('ja-JP')}
                        </span>
                      </div>
                      <div className="drill-stats-grid">
                        {[
                          ['対象件数', `${backupDrillReport.totalRows}件`],
                          ['対象区分', `${backupDrillReport.collectionCount}区分`],
                          ['新規追加', `${backupDrillReport.diffSummary.added}件`],
                          ['上書き更新', `${backupDrillReport.diffSummary.updated}件`],
                          ['変更なし', `${backupDrillReport.diffSummary.unchanged}件`]
                        ].map(([label, value]) => (
                          <div key={label} className="drill-stat-item">
                            <div className="drill-stat-label">{label}</div>
                            <div className="drill-stat-value">{value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="drill-checks-list">
                        {backupDrillReport.checks.map((check) => (
                          <div key={check.id} className="drill-check-row">
                            <span className="drill-check-label">{check.label}</span>
                            <span className={`backup-status-badge status-${check.status}`}>
                              {check.status === 'pass' ? 'OK' : check.status === 'attention' ? '要確認' : '不可'}
                            </span>
                            <span className="drill-check-detail">{check.detail}</span>
                          </div>
                        ))}
                      </div>
                      <div
                        aria-label="導入移行診断"
                        className="migration-diagnostic-box"
                      >
                        <div className="diagnostic-header">
                          <strong className="diagnostic-title">導入移行診断</strong>
                          <span className={`backup-status-badge status-${backupDrillReport.migrationDiagnostic.status}`}>
                            {backupDrillReport.migrationDiagnostic.statusLabel}
                          </span>
                        </div>
                        <div className="diagnostic-stats-grid">
                          {[
                            ['ID欠落', `${backupDrillReport.migrationDiagnostic.missingPrimaryKeyCount}件`],
                            ['同一ID重複', `${backupDrillReport.migrationDiagnostic.duplicatePrimaryKeyCount}件`],
                            ['文字化け疑い', `${backupDrillReport.migrationDiagnostic.mojibakeSuspectCount}件`],
                            ['必須領域不足', `${backupDrillReport.migrationDiagnostic.missingRequiredCollectionCount}件`]
                          ].map(([label, value]) => (
                            <div key={label} className="diagnostic-stat-item">
                              <div className="diagnostic-stat-label">{label}</div>
                              <div className="diagnostic-stat-value">{value}</div>
                            </div>
                          ))}
                        </div>
                        <div className={`diagnostic-action-text status-${backupDrillReport.migrationDiagnostic.status} ${backupDrillReport.migrationDiagnostic.issues.length > 0 ? 'has-margin' : ''}`}>
                          {backupDrillReport.migrationDiagnostic.requiredActions.join(' / ')}
                        </div>
                        {backupDrillReport.migrationDiagnostic.issues.length > 0 && (
                          <div className="diagnostic-issues-list">
                            {backupDrillReport.migrationDiagnostic.issues.slice(0, 4).map((issue) => (
                              <div key={issue.id} className="diagnostic-issue-row">
                                <span className={`backup-status-badge status-${issue.severity}`}>{issue.severity === 'blocked' ? '不可' : '要確認'}</span>
                                <span className="diagnostic-issue-label">{issue.label}</span>
                                <span className="diagnostic-issue-detail">{issue.detail}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="diff-table-wrapper">
                    <table className="diff-table">
                      <thead>
                        <tr className="diff-table-head-row">
                          <th className="diff-th">データ区分</th>
                          <th className="diff-th col-added">新規追加</th>
                          <th className="diff-th col-updated">上書き更新</th>
                          <th className="diff-th col-unchanged">変更なし</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backupDiffs.map((diff) => {
                          const collectionLabels: Record<string, string> = {
                            facility_settings: '施設基準設定',
                            patients: '患者情報',
                            visits: '受付・来局記録',
                            prescription_items: '処方データ',
                            soap_records: '薬歴（SOAP）',
                            alerts: 'アレルギー・疾患警告',
                            interventions: '疑義照会・介入記録',
                            drugs: '薬品マスタ',
                            drug_stocks: '薬品在庫',
                            locations: '配置棚位置',
                            drug_infos: '添付文書・相互作用マスタ',
                            medication_guidances: '服薬指導計画',
                            patient_medication_info_templates: '薬情テンプレ',
                            users: 'スタッフ情報',
                            audit_logs: '操作ログ（監査証跡）'
                          };
                          const label = collectionLabels[diff.collection] || diff.collection;

                          if (diff.added === 0 && diff.updated === 0 && diff.unchanged === 0) {
                            return null;
                          }

                          return (
                            <tr key={diff.collection} className="diff-tr">
                              <td className="diff-td col-label">{label}</td>
                              <td className={`diff-td col-added ${diff.added > 0 ? 'is-positive' : ''}`}>
                                {diff.added > 0 ? `+${diff.added} 件` : '0'}
                              </td>
                              <td className={`diff-td col-updated ${diff.updated > 0 ? 'is-positive' : ''}`}>
                                {diff.updated > 0 ? `${diff.updated} 件` : '0'}
                              </td>
                              <td className="diff-td col-unchanged">
                                {diff.unchanged}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="restore-actions">
                    <button
                      className="btn-secondary btn-restore-action"
                      onClick={handleCancelRestore}
                      disabled={isImportingBackup}
                    >
                      キャンセル
                    </button>
                    <button
                      className="btn-secondary btn-restore-action"
                      onClick={handleRecordBackupDrill}
                      disabled={isImportingBackup || !backupDrillReport}
                    >
                      復旧テストを記録
                    </button>
                    <button
                      className="btn-primary btn-confirm-restore"
                      onClick={handleConfirmRestore}
                      disabled={isImportingBackup || backupDrillReport?.status === 'blocked'}
                      title={backupDrillReport?.status === 'blocked' ? '復旧前診断が復旧不可です。ID欠落や重複を修正してください。' : undefined}
                    >
                      {isImportingBackup ? (
                        <>
                          <Loader2 size={16} className="spin" aria-hidden="true" />
                          <span>復旧を実行中...</span>
                        </>
                      ) : (
                        <span>復旧を実行する</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

      <style jsx>{`
        .backup-workflow {
          display: grid;
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        .backup-workflow-item {
          display: grid;
          grid-template-columns: minmax(0, 1.8fr) minmax(280px, 1.2fr);
          gap: 1.5rem;
          align-items: start;
          padding: 1.5rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: rgba(255, 255, 255, 0.6);
        }
        .backup-workflow-item.no-border-bottom {
          border-bottom: none;
        }
        .backup-import-controls {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          justify-content: flex-end;
          flex-wrap: wrap;
        }
        .backup-alert {
          border: 1px solid #fecaca;
          background: #fef2f2;
          border-radius: 8px;
          padding: 0.85rem 1rem;
          margin-bottom: 1rem;
        }
        .backup-alert p {
          margin: 0;
          color: #991b1b;
          font-size: var(--fs-sm);
        }
        .backup-plain-warning {
          border: 1px solid #fed7aa;
          background: #fff7ed;
          border-radius: 8px;
          padding: 0.85rem 1rem;
          margin-bottom: 1rem;
        }
        .backup-plain-warning p {
          margin: 0;
          color: #9a3412;
          font-size: var(--fs-sm);
        }
        .backup-schedule-section {
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.82);
          padding: 1rem;
          margin-bottom: 1.5rem;
        }
        .backup-schedule-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 0.75rem;
        }
        .backup-schedule-status {
          display: inline-flex;
          align-items: center;
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 999px;
          padding: 0.15rem 0.65rem;
          font-size: var(--fs-xs);
          font-weight: 800;
        }
        .backup-schedule-status.status-pass {
          color: #15803d;
          background: #f0fdf4;
          border-color: #86efac;
        }
        .backup-schedule-status.status-attention {
          color: #b45309;
          background: #fffbeb;
          border-color: #fcd34d;
        }
        .backup-schedule-status.status-blocked {
          color: #b91c1c;
          background: #fef2f2;
          border-color: #fca5a5;
        }
        .backup-schedule-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .backup-schedule-summary div {
          padding: 0.5rem 0.65rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: rgba(248, 250, 252, 0.7);
        }
        .backup-schedule-summary span {
          display: block;
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 700;
        }
        .backup-schedule-summary strong {
          display: block;
          color: var(--text-main);
          font-size: 0.98rem;
          font-weight: 800;
          margin-top: 0.1rem;
        }
        .backup-schedule-form {
          border-top: 1px solid rgba(148, 163, 184, 0.25);
          padding-top: 0.75rem;
        }
        .backup-external-form {
          border-top: 1px solid rgba(148, 163, 184, 0.25);
          padding-top: 0.75rem;
          margin-top: 0.75rem;
        }
        .backup-external-form input.form-control {
          max-width: 100%;
        }
        .backup-external-checks {
          display: grid;
          gap: 0.45rem;
          margin-top: 0.65rem;
        }
        .backup-external-item {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 0.65rem;
          padding: 0.45rem 0.65rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.7);
          font-size: var(--fs-sm);
        }
        .backup-external-notes {
          display: grid;
          gap: 0.35rem;
          margin-top: 0.65rem;
        }
        .backup-external-notes textarea {
          width: 100%;
          min-height: 70px;
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 0.5rem;
          font-size: var(--fs-sm);
        }
        .backup-external-receipt {
          border: 1px dashed var(--border);
          border-radius: 6px;
          padding: 0.65rem;
          background: rgba(248, 250, 252, 0.85);
          margin-top: 0.65rem;
        }

        /* 患者重複点検（名寄せ） */
        .patient-duplicate-section {
          padding: 0 0 1.2rem;
          margin-bottom: 1.2rem;
          border-bottom: 1px solid var(--border);
        }
        .duplicate-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 0.6rem;
        }
        .duplicate-groups-list {
          display: grid;
          gap: 0.85rem;
        }
        .duplicate-group-card {
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0.85rem;
        }
        .duplicate-group-header {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
          margin-bottom: 0.5rem;
        }
        .duplicate-members-list {
          display: grid;
          gap: 0.45rem;
        }
        .duplicate-member-row {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          flex-wrap: wrap;
        }
        .member-keep-label {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        .member-name {
          min-width: 9rem;
        }
        .btn-duplicate-review {
          padding: 0.25rem 0.6rem;
          font-size: var(--fs-sm);
        }
        .duplicate-merge-review {
          margin-top: 0.7rem;
          padding: 0.7rem;
          border-radius: 8px;
          background: var(--bg-subtle);
        }
        .merge-review-title {
          display: block;
          margin-bottom: 0.35rem;
        }
        .merge-review-issues,
        .merge-review-conflicts {
          margin: 0.35rem 0 0 1rem;
        }
        .merge-review-actions {
          display: flex;
          gap: 0.6rem;
          margin-top: 0.6rem;
        }

        /* バックアップ世代管理 */
        .generation-section {
          padding: 0 0 1.2rem;
          margin-bottom: 1.2rem;
          border-bottom: 1px solid var(--border);
        }
        .generation-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 0.85rem;
        }
        .generation-title {
          margin: 0;
          font-size: 1rem;
          color: var(--text-main);
        }
        .generation-subtitle {
          margin: 0.2rem 0 0;
          color: var(--text-muted);
          font-size: var(--fs-md);
        }
        .generation-header-actions {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          flex-wrap: wrap;
        }
        .generation-status-badge {
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 999px;
          padding: 0.18rem 0.65rem;
          font-size: var(--fs-sm);
          font-weight: 800;
        }
        .generation-status-badge.status-pass {
          color: #15803d;
          background: #f0fdf4;
          border-color: #86efac;
        }
        .generation-status-badge.status-attention {
          color: #b45309;
          background: #fffbeb;
          border-color: #fcd34d;
        }
        .generation-status-badge.status-blocked {
          color: #b91c1c;
          background: #fef2f2;
          border-color: #fca5a5;
        }
        .btn-generation-csv {
          padding: 0.45rem 0.7rem;
          font-size: var(--fs-sm);
        }
        .generation-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 0.75rem;
          margin-bottom: 0.85rem;
        }
        .generation-kpi-item {
          border-left: 3px solid var(--primary);
          padding: 0.2rem 0 0.2rem 0.65rem;
        }
        .generation-kpi-label {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          fontWeight: 700;
        }
        .generation-kpi-value {
          color: var(--text-main);
          font-size: 1.02rem;
          font-weight: 800;
        }
        .generation-kpi-value.highlight.status-pass {
          color: #15803d;
        }
        .generation-kpi-value.highlight.status-attention {
          color: #b45309;
        }
        .generation-kpi-value.highlight.status-blocked {
          color: #b91c1c;
        }

        /* AIフィードバック */
        .ai-feedback-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.8rem;
          margin-bottom: 0.85rem;
          color: var(--text-muted);
          font-size: var(--fs-sm);
        }
        .feedback-card {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.85rem;
          background: #ffffff;
        }
        .feedback-card.card-soap.status-pass,
        .feedback-card.card-store.status-pass {
          background: #f0fdf4;
          border-color: #86efac;
        }
        .feedback-card.card-soap.status-attention,
        .feedback-card.card-store.status-attention {
          background: #fffbeb;
          border-color: #fcd34d;
        }
        .feedback-card.card-soap.status-blocked,
        .feedback-card.card-store.status-blocked {
          background: #fef2f2;
          border-color: #fca5a5;
        }
        .feedback-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.6rem;
          margin-bottom: 0.7rem;
        }
        .feedback-card-title {
          color: var(--text-main);
          font-size: var(--fs-base);
          font-weight: 800;
          margin-bottom: 0.7rem;
        }
        .feedback-card-header .feedback-card-title {
          margin-bottom: 0;
        }
        .feedback-card-subtitle {
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 700;
        }
        .feedback-badge {
          background: #ffffff;
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 999px;
          padding: 0.16rem 0.55rem;
          font-size: var(--fs-xs);
          font-weight: 800;
          white-space: nowrap;
        }
        .feedback-badge.status-pass {
          color: #15803d;
          border-color: #86efac;
        }
        .feedback-badge.status-attention {
          color: #b45309;
          border-color: #fcd34d;
        }
        .feedback-badge.status-blocked {
          color: #b91c1c;
          border-color: #fca5a5;
        }
        .feedback-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
          gap: 0.55rem;
          margin-bottom: 0.65rem;
        }
        .feedback-stat-label {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 800;
        }
        .feedback-stat-value {
          color: var(--text-main);
          font-size: var(--fs-base);
          font-weight: 800;
        }
        .feedback-action-text {
          font-size: var(--fs-sm);
          font-weight: 700;
        }
        .feedback-action-text.status-pass {
          color: #15803d;
        }
        .feedback-action-text.status-attention {
          color: #b45309;
        }
        .feedback-action-text.status-blocked {
          color: #b91c1c;
        }
        .domain-summaries-list {
          display: grid;
          gap: 0.55rem;
        }
        .domain-summary-row {
          display: grid;
          grid-template-columns: minmax(86px, 1fr) auto auto auto;
          gap: 0.55rem;
          align-items: center;
        }
        .domain-summary-label {
          color: var(--text-main);
          font-weight: 800;
        }
        .domain-empty-text {
          color: var(--text-muted);
          font-weight: 700;
        }
        .store-summaries-list {
          display: grid;
          gap: 0.4rem;
          margin-bottom: 0.65rem;
        }
        .store-summary-row {
          display: grid;
          grid-template-columns: minmax(92px, 1fr) auto auto;
          gap: 0.55rem;
          align-items: center;
        }
        .store-summary-label {
          color: var(--text-main);
          font-weight: 800;
        }
        .generation-summary-footer {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.8rem;
          color: var(--text-muted);
          font-size: var(--fs-sm);
        }
        .generation-footer-label {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 800;
        }
        .generation-footer-val {
          color: var(--text-main);
          font-weight: 700;
          word-break: break-all;
        }
        .generation-footer-val.status-attention {
          color: #b45309;
        }
        .generation-footer-val.status-blocked {
          color: #b91c1c;
        }

        /* 暗号鍵エスクロー */
        .escrow-section {
          padding: 1.2rem;
          margin-bottom: 1.5rem;
          border: 2px solid #0284c7;
          border-radius: 12px;
          background: #f0f9ff;
        }
        .escrow-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 0.75rem;
        }
        .escrow-title {
          margin: 0;
          color: #0369a1;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .escrow-desc {
          color: #0c4a6e;
          margin: 0.35rem 0 0;
        }
        .escrow-fingerprint-box {
          text-align: right;
        }
        .fingerprint-label {
          font-size: var(--fs-xs);
          color: var(--text-muted);
          display: block;
        }
        .fingerprint-val {
          font-size: 1.1rem;
          font-family: monospace;
          color: #0284c7;
        }
        .escrow-panels-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }
        .escrow-panel {
          background: #ffffff;
          border: 1px solid #bae6fd;
          border-radius: 8px;
          padding: 1rem;
        }
        .escrow-panel-title {
          margin: 0 0 0.5rem;
          font-size: var(--fs-sm);
          color: #0369a1;
        }
        .escrow-panel-desc {
          font-size: var(--fs-xs);
          color: var(--text-muted);
          margin: 0 0 0.75rem;
        }
        .escrow-issue-controls {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          align-items: center;
        }
        .input-escrow-password {
          padding: 0.4rem 0.6rem;
          font-size: var(--fs-sm);
          border: 1px solid var(--border);
          border-radius: 6px;
          flex: 1 1 180px;
        }
        .btn-escrow-action {
          padding: 0.4rem 0.85rem;
          font-size: var(--fs-sm);
        }
        .escrow-error-text {
          color: #b91c1c;
          font-size: var(--fs-xs);
          margin: 0.5rem 0 0;
        }
        .escrow-success-banner {
          margin-top: 0.5rem;
          padding: 0.5rem;
          background: #f0fdf4;
          border: 1px solid #86efac;
          border-radius: 6px;
          font-size: var(--fs-xs);
          color: #166534;
        }
        .escrow-restore-form {
          display: grid;
          gap: 0.5rem;
        }
        .textarea-escrow-payload {
          width: 100%;
          padding: 0.4rem 0.6rem;
          font-size: var(--fs-xs);
          font-family: monospace;
          border: 1px solid var(--border);
          border-radius: 6px;
        }
        .escrow-restore-controls {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          align-items: center;
        }
        .btn-escrow-restore {
          padding: 0.4rem 0.85rem;
          font-size: var(--fs-sm);
          background: #0284c7;
          border-color: #0284c7;
        }
        .escrow-message-banner {
          margin-top: 0.5rem;
          padding: 0.5rem;
          border-radius: 6px;
          font-size: var(--fs-xs);
        }
        .escrow-message-banner.message-ok {
          background: #f0fdf4;
          border: 1px solid #86efac;
          color: #166534;
        }
        .escrow-message-banner.message-error {
          background: #fef2f2;
          border: 1px solid #fca5a5;
          color: #991b1b;
        }

        /* エクスポート・インポート オプション */
        .export-options-list {
          margin-top: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .export-checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          font-size: var(--fs-md);
          font-weight: 500;
        }
        .checkbox-accent {
          width: 1rem;
          height: 1rem;
          accent-color: var(--primary);
        }
        .export-password-wrapper {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          max-width: 300px;
        }
        .input-export-password {
          margin: 0;
          padding: 0.4rem 0.6rem;
          font-size: var(--fs-md);
          flex: 1;
        }
        .btn-toggle-password {
          padding: 0.4rem 0.6rem;
          min-height: auto;
          font-size: var(--fs-xs);
        }
        .retention-days-label {
          display: grid;
          gap: 0.25rem;
          max-width: 160px;
          font-size: var(--fs-md);
          font-weight: 700;
          color: var(--text-muted);
        }
        .input-retention-days {
          margin: 0;
          padding: 0.4rem 0.6rem;
          font-size: var(--fs-md);
        }

        /* 移行CSV */
        .migration-kind-group {
          display: inline-flex;
          gap: 0.35rem;
          padding: 0.2rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg-subtle);
        }
        .btn-migration-kind {
          min-height: auto;
          padding: 0.38rem 0.75rem;
          font-size: var(--fs-sm);
          box-shadow: none;
        }
        .migration-preview-wrapper {
          grid-column: 1 / -1;
          margin-top: 0.75rem;
          border-top: 1px solid rgba(148, 163, 184, 0.28);
          padding-top: 0.85rem;
          display: grid;
          gap: 0.75rem;
        }
        .migration-preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .migration-preview-title-group {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          flex-wrap: wrap;
        }
        .migration-preview-title {
          color: var(--text-main);
          font-size: var(--fs-md);
        }
        .backup-status-badge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 0.16rem 0.6rem;
          font-size: var(--fs-xs);
          font-weight: 800;
          white-space: nowrap;
        }
        .backup-status-badge.status-pass {
          color: #15803d;
          background: #f0fdf4;
          border-color: #86efac;
        }
        .backup-status-badge.status-attention {
          color: #b45309;
          background: #fffbeb;
          border-color: #fcd34d;
        }
        .backup-status-badge.status-blocked {
          color: #b91c1c;
          background: #fef2f2;
          border-color: #fca5a5;
        }
        .migration-format-badge {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 700;
        }
        .migration-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 0.55rem;
        }
        .migration-stat-item {
          border-left: 3px solid rgba(37, 99, 235, 0.35);
          padding-left: 0.55rem;
        }
        .migration-stat-label {
          color: var(--text-ghost);
          font-size: var(--fs-2xs);
          font-weight: 800;
        }
        .migration-stat-value {
          color: var(--text-main);
          font-size: var(--fs-base);
          font-weight: 800;
        }
        .migration-columns-info {
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 700;
        }
        .migration-issues-list {
          display: grid;
          gap: 0.35rem;
          font-size: var(--fs-xs);
        }
        .migration-issue-row {
          display: grid;
          grid-template-columns: minmax(72px, 0.35fr) minmax(140px, 0.55fr) minmax(180px, 1fr);
          gap: 0.45rem;
          align-items: center;
        }
        .issue-title {
          color: var(--text-main);
          font-weight: 800;
        }
        .issue-message {
          color: var(--text-muted);
        }
        .migration-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .btn-save-migration-json {
          padding: 0.45rem 0.9rem;
          min-height: auto;
          font-size: var(--fs-sm);
        }

        /* 復旧・差分・訓練レポート */
        .import-password-box {
          grid-column: 1 / -1;
          margin-top: 1rem;
          padding: 1.25rem;
          background: #fffbeb;
          border: 1px solid #fcd34d;
          border-radius: 8px;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .import-password-title {
          font-weight: 700;
          font-size: var(--fs-base);
          color: #92400e;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .import-password-controls {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          width: 100%;
          max-width: 500px;
        }
        .input-import-password {
          margin: 0;
          padding: 0.5rem;
          font-size: var(--fs-base);
          flex: 1;
        }
        .btn-import-pw-action {
          min-height: auto;
          padding: 0.5rem 1.25rem;
        }
        .backup-preview-box {
          grid-column: 1 / -1;
          margin-top: 1rem;
          padding: 1.5rem;
          border: 2px solid var(--primary);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: var(--shadow-md);
          width: 100%;
        }
        .backup-preview-title {
          margin: 0 0 0.5rem 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--primary-dark);
          font-size: 1.1rem;
        }
        .backup-preview-desc {
          margin-bottom: 1rem;
          font-size: var(--fs-md);
          color: var(--text-muted);
        }
        .drill-report-box {
          border-top: 1px solid rgba(148, 163, 184, 0.28);
          border-bottom: 1px solid rgba(148, 163, 184, 0.28);
          padding: 0.85rem 0;
          margin-bottom: 1rem;
        }
        .drill-report-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
          margin-bottom: 0.75rem;
        }
        .drill-report-title-group {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          flex-wrap: wrap;
        }
        .drill-report-title {
          color: var(--text-main);
          font-size: var(--fs-base);
        }
        .drill-report-date {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
        }
        .drill-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 0.6rem;
          margin-bottom: 0.75rem;
        }
        .drill-stat-item {
          border-left: 3px solid rgba(37, 99, 235, 0.45);
          padding-left: 0.55rem;
        }
        .drill-stat-label {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 700;
        }
        .drill-stat-value {
          color: var(--text-main);
          font-size: var(--fs-base);
          font-weight: 800;
        }
        .drill-checks-list {
          display: grid;
          gap: 0.35rem;
        }
        .drill-check-row {
          display: grid;
          grid-template-columns: minmax(110px, 0.6fr) minmax(70px, 0.35fr) minmax(180px, 1fr);
          gap: 0.5rem;
          align-items: center;
          font-size: var(--fs-sm);
        }
        .drill-check-label {
          color: var(--text-main);
          font-weight: 700;
        }
        .drill-check-detail {
          color: var(--text-muted);
        }
        .migration-diagnostic-box {
          border-top: 1px solid rgba(148, 163, 184, 0.28);
          margin-top: 0.85rem;
          padding-top: 0.85rem;
        }
        .diagnostic-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.65rem;
          flex-wrap: wrap;
          margin-bottom: 0.65rem;
        }
        .diagnostic-title {
          color: var(--text-main);
          font-size: var(--fs-md);
        }
        .diagnostic-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 0.55rem;
          margin-bottom: 0.65rem;
        }
        .diagnostic-stat-item {
          border-left: 3px solid rgba(37, 99, 235, 0.35);
          padding-left: 0.55rem;
        }
        .diagnostic-stat-label {
          color: var(--text-ghost);
          font-size: var(--fs-2xs);
          font-weight: 800;
        }
        .diagnostic-stat-value {
          color: var(--text-main);
          font-size: var(--fs-base);
          font-weight: 800;
        }
        .diagnostic-action-text {
          font-size: var(--fs-xs);
          font-weight: 750;
        }
        .diagnostic-action-text.status-pass {
          color: var(--text-muted);
        }
        .diagnostic-action-text.status-attention {
          color: var(--warning);
        }
        .diagnostic-action-text.status-blocked {
          color: var(--danger);
        }
        .diagnostic-action-text.has-margin {
          margin-bottom: 0.55rem;
        }
        .diagnostic-issues-list {
          display: grid;
          gap: 0.35rem;
          font-size: var(--fs-xs);
        }
        .diagnostic-issue-row {
          display: grid;
          grid-template-columns: minmax(72px, 0.35fr) minmax(96px, 0.4fr) minmax(180px, 1fr);
          gap: 0.45rem;
          align-items: center;
        }
        .diagnostic-issue-label {
          color: var(--text-main);
          font-weight: 800;
        }
        .diagnostic-issue-detail {
          color: var(--text-muted);
        }
        .diff-table-wrapper {
          max-height: 260px;
          overflow-y: auto;
          border: 1px solid var(--border);
          border-radius: 8px;
          margin-bottom: 1.25rem;
        }
        .diff-table {
          width: 100%;
          border-collapse: collapse;
          font-size: var(--fs-md);
        }
        .diff-table-head-row {
          background: var(--bg-subtle);
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        .diff-th {
          padding: 0.6rem 0.75rem;
          font-weight: 600;
        }
        .diff-th.col-added {
          color: var(--success);
        }
        .diff-th.col-updated {
          color: var(--warning);
        }
        .diff-th.col-unchanged {
          color: var(--text-muted);
        }
        .diff-tr {
          border-bottom: 1px solid var(--border);
        }
        .diff-td {
          padding: 0.5rem 0.75rem;
        }
        .diff-td.col-label {
          font-weight: 600;
          color: var(--text-main);
        }
        .diff-td.col-added.is-positive {
          color: var(--success);
          font-weight: 600;
        }
        .diff-td.col-updated.is-positive {
          color: var(--warning);
          font-weight: 600;
        }
        .diff-td.col-unchanged {
          color: var(--text-ghost);
        }
        .restore-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
        }
        .btn-restore-action {
          padding: 0.5rem 1.25rem;
        }
        .btn-confirm-restore {
          padding: 0.5rem 1.5rem;
          background: var(--success);
          border-color: var(--success);
          box-shadow: none;
        }

        @media (max-width: 700px) {
          .backup-workflow-item {
            grid-template-columns: 1fr;
          }
          .backup-import-controls {
            justify-content: flex-start;
            max-width: none;
          }
        }
      `}</style>
    </div>
  );
}

