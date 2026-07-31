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

const backupDrillStatusStyle = (status: BackupRestoreDrillReport['status']) => {
  const styles = {
    pass: { color: '#15803d', background: '#f0fdf4', border: '#86efac' },
    attention: { color: '#b45309', background: '#fffbeb', border: '#fcd34d' },
    blocked: { color: '#b91c1c', background: '#fef2f2', border: '#fca5a5' }
  }[status];

  return {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '999px',
    border: `1px solid ${styles.border}`,
    padding: '0.16rem 0.6rem',
    fontSize: '0.76rem',
    fontWeight: 800,
    color: styles.color,
    background: styles.background,
    whiteSpace: 'nowrap' as const
  };
};

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
              <span
                className="backup-schedule-status"
                style={{
                  color: backupScheduleReviewColor,
                  background: backupScheduleReviewBackground
                }}
              >
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
            style={{ padding: '0 0 1.2rem', marginBottom: '1.2rem', borderBottom: '1px solid var(--border)' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
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
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                {patientDuplicateReport.groups.map((group) => {
                  const targetPatientId = duplicateMergeTargets[group.groupId] || group.suggestedTargetPatientId;
                  return (
                    <div key={group.groupId} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                        <strong>{group.displayName}</strong>
                        <span className="help-text">{group.birthDate}</span>
                        <span className="help-text">{group.matchLabel} / {group.members.length}名</span>
                      </div>
                      <div style={{ display: 'grid', gap: '0.45rem' }}>
                        {group.members.map((member) => (
                          <div key={member.patientId} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
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
                            <span style={{ minWidth: '9rem' }}>{member.name}{member.kana ? `（${member.kana}）` : ''}</span>
                            <span className="help-text">受付 {member.visitCount}件{member.latestVisitDate ? ` / 直近 ${member.latestVisitDate.slice(0, 10)}` : ''}</span>
                            <span className="help-text">保険者番号 {member.insuranceNumber || '未登録'}</span>
                            {member.patientId !== targetPatientId && (
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
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
                        <div style={{ marginTop: '0.7rem', padding: '0.7rem', borderRadius: '8px', background: 'var(--bg-subtle)' }} data-testid="patient-duplicate-merge-review">
                          <strong style={{ display: 'block', marginBottom: '0.35rem' }}>統合内容の確認</strong>
                          <p className="help-text">{duplicateMergeReview.plan.summary}</p>
                          {duplicateMergeReview.plan.issues.length > 0 && (
                            <ul className="help-text" style={{ margin: '0.35rem 0 0 1rem' }}>
                              {duplicateMergeReview.plan.issues.map((issue) => (
                                <li key={issue.code}>{issue.severity === 'error' ? '要修正: ' : '確認: '}{issue.message}</li>
                              ))}
                            </ul>
                          )}
                          {duplicateMergeReview.plan.conflicts.length > 0 && (
                            <ul className="help-text" style={{ margin: '0.35rem 0 0 1rem' }}>
                              {duplicateMergeReview.plan.conflicts.map((conflict) => (
                                <li key={conflict.field}>{conflict.label}: 統合元「{conflict.sourceValue}」→ 残す値「{conflict.targetValue}」</li>
                              ))}
                            </ul>
                          )}
                          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.6rem' }}>
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
            style={{
              padding: '0 0 1.2rem',
              marginBottom: '1.2rem',
              borderBottom: '1px solid var(--border)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>バックアップ世代管理</h3>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                  直近{backupGenerationReview.retentionDays}日 / 必要 {backupGenerationReview.requiredGenerationCount}世代
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                <span style={{
                  color: backupGenerationReviewColor,
                  background: backupGenerationReviewBackground,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '999px',
                  padding: '0.18rem 0.65rem',
                  fontSize: '0.78rem',
                  fontWeight: 800
                }}>
                  {backupGenerationReview.statusLabel}
                </span>
                <button
                  className="btn-secondary flex-center gap-2"
                  style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
                  onClick={handleExportBackupGenerationReviewCsv}
                  disabled={!canManageBackups || isExportingBackupGenerationReview}
                  title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : undefined}
                >
                  {isExportingBackupGenerationReview ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>世代管理CSV</span>
                </button>
              </div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '0.75rem',
              marginBottom: '0.85rem'
            }}>
              {[
                ['保存世代', `${backupGenerationReview.generationCount}世代`],
                ['暗号化', `${backupGenerationReview.encryptedGenerationCount}世代`],
                ['復旧テスト', backupGenerationReview.drillAgeDays === undefined ? '未記録' : `${backupGenerationReview.drillAgeDays}日前`],
                ['外部保存', backupGenerationReview.externalStorageStatusLabel],
                ['対応', backupGenerationReview.actionLabel]
              ].map(([label, value]) => (
                <div key={label} style={{ borderLeft: '3px solid var(--primary)', padding: '0.2rem 0 0.2rem 0.65rem' }}>
                  <div style={{ color: 'var(--text-ghost)', fontSize: '0.74rem', fontWeight: 700 }}>{label}</div>
                  <div style={{ color: label === '保存世代' || label === '外部保存' ? backupGenerationReviewColor : 'var(--text-main)', fontSize: '1.02rem', fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.8rem',
              marginBottom: '0.85rem',
              color: 'var(--text-muted)',
              fontSize: '0.8rem'
            }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem', background: soapDraftFeedbackBackground }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.7rem' }}>
                  <div>
                    <div style={{ color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 800 }}>SOAP下書き品質レビュー</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 700 }}>
                      採否 {aiSuggestionFeedbackReview.soapDraftSummary.totalCount}件 / {aiSuggestionFeedbackReview.soapDraftSummary.actionLabel}
                    </div>
                  </div>
                  <span style={{
                    color: soapDraftFeedbackColor,
                    background: '#ffffff',
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    borderRadius: '999px',
                    padding: '0.16rem 0.55rem',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    whiteSpace: 'nowrap'
                  }}>
                    {aiSuggestionFeedbackReview.soapDraftSummary.statusLabel}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: '0.55rem', marginBottom: '0.65rem' }}>
                  {[
                    ['採用率', `${aiSuggestionFeedbackReview.soapDraftSummary.acceptanceRate}%`],
                    ['修正/却下率', `${aiSuggestionFeedbackReview.soapDraftSummary.correctionRate}%`],
                    ['平均信頼度', aiSuggestionFeedbackReview.soapDraftSummary.averageConfidence === undefined ? '-' : `${aiSuggestionFeedbackReview.soapDraftSummary.averageConfidence}%`],
                    ['S/O/A/P', `${aiSuggestionFeedbackReview.soapDraftSummary.typeCounts.S}/${aiSuggestionFeedbackReview.soapDraftSummary.typeCounts.O}/${aiSuggestionFeedbackReview.soapDraftSummary.typeCounts.A}/${aiSuggestionFeedbackReview.soapDraftSummary.typeCounts.P}`]
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ color: 'var(--text-ghost)', fontSize: '0.7rem', fontWeight: 800 }}>{label}</div>
                      <div style={{ color: 'var(--text-main)', fontSize: '0.94rem', fontWeight: 800 }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ color: soapDraftFeedbackColor, fontSize: '0.78rem', fontWeight: 700 }}>
                  {aiSuggestionFeedbackReview.soapDraftSummary.requiredActions.join(' / ')}
                </div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem', background: '#ffffff' }}>
                <div style={{ color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.7rem' }}>提案種別別</div>
                {aiSuggestionFeedbackReview.domainSummaries.length > 0 ? (
                  <div style={{ display: 'grid', gap: '0.55rem' }}>
                    {aiSuggestionFeedbackReview.domainSummaries.map((summary) => (
                      <div key={summary.domain} style={{ display: 'grid', gridTemplateColumns: 'minmax(86px, 1fr) auto auto auto', gap: '0.55rem', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-main)', fontWeight: 800 }}>{summary.domainLabel}</span>
                        <span>{summary.totalCount}件</span>
                        <span>採用 {summary.acceptanceRate}%</span>
                        <span>修正/却下 {summary.correctionRate}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontWeight: 700 }}>今月の提案種別ログは未記録です。</div>
                )}
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem', background: storeFeedbackBackground }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.7rem' }}>
                  <div>
                    <div style={{ color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 800 }}>店舗別フィードバック比較</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 700 }}>
                      {aiSuggestionFeedbackReview.storeComparison.currentStoreName} / 比較店舗 {aiSuggestionFeedbackReview.storeComparison.storeCount}件
                    </div>
                  </div>
                  <span style={{
                    color: storeFeedbackColor,
                    background: '#ffffff',
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    borderRadius: '999px',
                    padding: '0.16rem 0.55rem',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    whiteSpace: 'nowrap'
                  }}>
                    {aiSuggestionFeedbackReview.storeComparison.statusLabel}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(98px, 1fr))', gap: '0.55rem', marginBottom: '0.65rem' }}>
                  {[
                    ['自店採用率', aiSuggestionFeedbackReview.storeComparison.currentStore ? `${aiSuggestionFeedbackReview.storeComparison.currentStore.acceptanceRate}%` : '-'],
                    ['全体平均', `${aiSuggestionFeedbackReview.storeComparison.allStoreAverageAcceptanceRate}%`],
                    ['他店平均', aiSuggestionFeedbackReview.storeComparison.peerAverageAcceptanceRate === undefined ? '-' : `${aiSuggestionFeedbackReview.storeComparison.peerAverageAcceptanceRate}%`],
                    ['平均との差', aiSuggestionFeedbackReview.storeComparison.currentStore ? `${aiSuggestionFeedbackReview.storeComparison.currentStore.differenceFromAverage > 0 ? '+' : ''}${aiSuggestionFeedbackReview.storeComparison.currentStore.differenceFromAverage}pt` : '-']
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ color: 'var(--text-ghost)', fontSize: '0.7rem', fontWeight: 800 }}>{label}</div>
                      <div style={{ color: 'var(--text-main)', fontSize: '0.94rem', fontWeight: 800 }}>{value}</div>
                    </div>
                  ))}
                </div>
                {aiSuggestionFeedbackReview.storeComparison.storeSummaries.length > 0 && (
                  <div style={{ display: 'grid', gap: '0.4rem', marginBottom: '0.65rem' }}>
                    {aiSuggestionFeedbackReview.storeComparison.storeSummaries.slice(0, 3).map((summary) => (
                      <div key={summary.storeKey} style={{ display: 'grid', gridTemplateColumns: 'minmax(92px, 1fr) auto auto', gap: '0.55rem', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-main)', fontWeight: 800 }}>{summary.storeName}</span>
                        <span>{summary.totalCount}件</span>
                        <span>採用 {summary.acceptanceRate}%</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ color: storeFeedbackColor, fontSize: '0.78rem', fontWeight: 700 }}>
                  {aiSuggestionFeedbackReview.storeComparison.requiredActions.join(' / ')}
                </div>
              </div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.8rem',
              color: 'var(--text-muted)',
              fontSize: '0.8rem'
            }}>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>最新バックアップ</div>
                <div style={{ color: 'var(--text-main)', fontWeight: 700, wordBreak: 'break-all' }}>{latestBackupGenerationLabel}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>最新復旧テスト</div>
                <div style={{ color: 'var(--text-main)', fontWeight: 700 }}>{latestBackupDrillLabel}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>最新外部保存確認</div>
                <div style={{ color: 'var(--text-main)', fontWeight: 700, wordBreak: 'break-all' }}>{latestBackupExternalStorageLabel}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>必要な対応</div>
                <div style={{ color: backupGenerationReview.status === 'pass' ? 'var(--text-main)' : backupGenerationReviewColor, fontWeight: 700 }}>
                  {backupGenerationReview.requiredActions.join(' / ')}
                </div>
              </div>
            </div>
          </section>

          <div className="backup-workflow">
            <section className="backup-workflow-item">
              <div>
                <h3>バックアップを書き出す</h3>
                <p className="help-text">患者、受付、処方、薬歴、マスタ、設定、スタッフ、操作ログをまとめて保存します。</p>
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={useEncryption}
                      onChange={(e) => setUseEncryption(e.target.checked)}
                      style={{ width: '1rem', height: '1rem', accentColor: 'var(--primary)' }}
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
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', maxWidth: '300px' }}>
                      <input
                        type={showExportPassword ? 'text' : 'password'}
                        placeholder="暗号化パスワードを入力"
                        value={exportPassword}
                        onChange={(e) => setExportPassword(e.target.value)}
                        className="form-control"
                        style={{ margin: 0, padding: '0.4rem 0.6rem', fontSize: '0.88rem', flex: 1 }}
                        aria-label="暗号化パスワード"
                        data-testid="backup-export-password"
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '0.4rem 0.6rem', minHeight: 'auto', fontSize: '0.75rem' }}
                        onClick={() => setShowExportPassword(!showExportPassword)}
                      >
                        {showExportPassword ? '隠す' : '表示'}
                      </button>
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={exportBackupExternalTransferManifest}
                      onChange={(e) => setExportBackupExternalTransferManifest(e.target.checked)}
                      style={{ width: '1rem', height: '1rem', accentColor: 'var(--primary)' }}
                      aria-label="外部保存連携JSONも出力する"
                      data-testid="backup-export-transfer-manifest-checkbox"
                    />
                    <span>外部保存連携JSONも出力する</span>
                  </label>
                  {exportBackupExternalTransferManifest && (
                    <label style={{ display: 'grid', gap: '0.25rem', maxWidth: '160px', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                      <span>保存先保持日数</span>
                      <input
                        type="number"
                        min={1}
                        className="form-control"
                        value={externalBackupRetentionDays}
                        onChange={(e) => setExternalBackupRetentionDays(Number(e.target.value) || 1)}
                        style={{ margin: 0, padding: '0.4rem 0.6rem', fontSize: '0.88rem' }}
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
                <div role="group" aria-label="移行CSV種別" style={{ display: 'inline-flex', gap: '0.35rem', padding: '0.2rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-subtle)' }}>
                  {[
                    ['patients', '患者'],
                    ['visits', '受付'],
                    ['drug_stocks', '在庫'],
                    ['soap_records', '薬歴']
                  ].map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      className={migrationCsvKind === kind ? 'btn-primary' : 'btn-secondary'}
                      onClick={() => handleMigrationCsvKindChange(kind as 'patients' | 'visits' | 'drug_stocks' | 'soap_records')}
                      disabled={isAnalyzingMigrationCsv || isAnalyzingDiff}
                      style={{ minHeight: 'auto', padding: '0.38rem 0.75rem', fontSize: '0.78rem', boxShadow: 'none' }}
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
                  style={{
                    gridColumn: '1 / -1',
                    marginTop: '0.75rem',
                    borderTop: '1px solid rgba(148, 163, 184, 0.28)',
                    paddingTop: '0.85rem',
                    display: 'grid',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                      <strong style={{ color: 'var(--text-main)', fontSize: '0.88rem' }}>
                        {migrationCsvKind === 'patients'
                          ? '患者CSV移行マッピング'
                          : migrationCsvKind === 'visits'
                            ? '受付CSV移行マッピング'
                            : migrationCsvKind === 'drug_stocks'
                              ? '在庫CSV移行マッピング'
                              : '薬歴CSV移行マッピング'}
                      </strong>
                      <span style={backupDrillStatusStyle(migrationCsvPreview.status)}>
                        {migrationCsvPreview.statusLabel}
                      </span>
                    </div>
                    {migrationCsvPreview.sourceFormat && (
                      <span style={{ color: 'var(--text-ghost)', fontSize: '0.74rem', fontWeight: 700 }}>
                        {migrationCsvPreview.sourceFormat.delimiter === 'tab' ? 'TSV' : 'CSV'} / 見出し {migrationCsvPreview.sourceFormat.headerLine}行目
                      </span>
                    )}
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: '0.55rem'
                  }}>
                    {[
                      [migrationCsvKind === 'patients' ? '患者行' : migrationCsvKind === 'visits' ? '受付行' : migrationCsvKind === 'drug_stocks' ? '在庫行' : '薬歴行', `${migrationCsvPreview.rows.length}件`],
                      ['指摘', `${migrationCsvPreview.issues.length}件`],
                      ['ID欠落', `${migrationCsvPreview.diagnostic.missingPrimaryKeyCount}件`],
                      ['同一ID重複', `${migrationCsvPreview.diagnostic.duplicatePrimaryKeyCount}件`],
                      ['文字化け疑い', `${migrationCsvPreview.diagnostic.mojibakeSuspectCount}件`]
                    ].map(([label, value]) => (
                      <div key={label} style={{ borderLeft: '3px solid rgba(37, 99, 235, 0.35)', paddingLeft: '0.55rem' }}>
                        <div style={{ color: 'var(--text-ghost)', fontSize: '0.68rem', fontWeight: 800 }}>{label}</div>
                        <div style={{ color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 800 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {migrationCsvPreview.sourceFormat && Object.keys(migrationCsvPreview.sourceFormat.recognizedColumns).length > 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', fontWeight: 700 }}>
                      認識列: {Object.values(migrationCsvPreview.sourceFormat.recognizedColumns).filter(Boolean).join(' / ')}
                    </div>
                  )}
                  {migrationCsvPreview.issues.length > 0 && (
                    <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.74rem' }}>
                      {migrationCsvPreview.issues.slice(0, 4).map((issue) => (
                        <div key={`${issue.code}-${issue.line || 'file'}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(72px, 0.35fr) minmax(140px, 0.55fr) minmax(180px, 1fr)', gap: '0.45rem', alignItems: 'center' }}>
                          <span style={backupDrillStatusStyle(issue.severity === 'error' ? 'blocked' : 'attention')}>
                            {issue.severity === 'error' ? '修正' : '要確認'}
                          </span>
                          <span style={{ color: 'var(--text-main)', fontWeight: 800 }}>{issue.title}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{issue.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.45rem 0.9rem', minHeight: 'auto', fontSize: '0.78rem' }}
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

            <section className="backup-workflow-item" style={{ borderBottom: pendingBackupPayload ? 'none' : '1px solid var(--border)' }}>
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
                <div style={{
                  gridColumn: '1 / -1',
                  marginTop: '1rem',
                  padding: '1.25rem',
                  background: '#fffbeb',
                  border: '1px solid #fcd34d',
                  borderRadius: '8px',
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>🔑 暗号化されたバックアップファイルです。復号用パスワードを入力してください。</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%', maxWidth: '500px' }}>
                    <input
                      type="password"
                      placeholder="復号用パスワードを入力"
                      value={importPassword}
                      onChange={(e) => setImportPassword(e.target.value)}
                      className="form-control"
                      style={{ margin: 0, padding: '0.5rem', fontSize: '0.9rem', flex: 1 }}
                      aria-label="復号用パスワード"
                    />
                    <button
                      className="btn-primary"
                      onClick={handleDecryptAndAnalyze}
                      style={{ minHeight: 'auto', padding: '0.5rem 1.25rem' }}
                    >
                      復号する
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={handleCancelRestore}
                      style={{ minHeight: 'auto', padding: '0.5rem 1.25rem' }}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}

              {backupDiffs && pendingBackupPayload && (
                <div style={{
                  gridColumn: '1 / -1',
                  marginTop: '1rem',
                  padding: '1.5rem',
                  border: '2px solid var(--primary)',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.98)',
                  boxShadow: 'var(--shadow-md)',
                  width: '100%'
                }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-dark)', fontSize: '1.1rem' }}>
                    <ShieldCheck size={20} className="text-success" />
                    <span>復旧前プレビュー（差分解析結果）</span>
                  </h3>
                  <p className="help-text" style={{ marginBottom: '1rem', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                    アップロードされたバックアップから差分を検出しました。内容を確認し、問題なければ「復旧を実行する」をクリックしてください。既存IDのデータは上書きされます。
                  </p>

                  {backupDrillReport && (
                    <div
                      aria-label="復旧テスト（訓練）レポート"
                      style={{
                        borderTop: '1px solid rgba(148, 163, 184, 0.28)',
                        borderBottom: '1px solid rgba(148, 163, 184, 0.28)',
                        padding: '0.85rem 0',
                        marginBottom: '1rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                          <strong style={{ color: 'var(--text-main)', fontSize: '0.92rem' }}>復旧テスト（訓練）</strong>
                          <span style={backupDrillStatusStyle(backupDrillReport.status)}>{backupDrillReport.statusLabel}</span>
                        </div>
                        <span style={{ color: 'var(--text-ghost)', fontSize: '0.74rem' }}>
                          バックアップ作成 {new Date(backupDrillReport.backupCreatedAt).toLocaleString('ja-JP')}
                        </span>
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                        gap: '0.6rem',
                        marginBottom: '0.75rem'
                      }}>
                        {[
                          ['対象件数', `${backupDrillReport.totalRows}件`],
                          ['対象区分', `${backupDrillReport.collectionCount}区分`],
                          ['新規追加', `${backupDrillReport.diffSummary.added}件`],
                          ['上書き更新', `${backupDrillReport.diffSummary.updated}件`],
                          ['変更なし', `${backupDrillReport.diffSummary.unchanged}件`]
                        ].map(([label, value]) => (
                          <div key={label} style={{ borderLeft: '3px solid rgba(37, 99, 235, 0.45)', paddingLeft: '0.55rem' }}>
                            <div style={{ color: 'var(--text-ghost)', fontSize: '0.7rem', fontWeight: 700 }}>{label}</div>
                            <div style={{ color: 'var(--text-main)', fontSize: '0.98rem', fontWeight: 800 }}>{value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'grid', gap: '0.35rem' }}>
                        {backupDrillReport.checks.map((check) => (
                          <div key={check.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 0.6fr) minmax(70px, 0.35fr) minmax(180px, 1fr)', gap: '0.5rem', alignItems: 'center', fontSize: '0.78rem' }}>
                            <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{check.label}</span>
                            <span style={backupDrillStatusStyle(check.status)}>
                              {check.status === 'pass' ? 'OK' : check.status === 'attention' ? '要確認' : '不可'}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>{check.detail}</span>
                          </div>
                        ))}
                      </div>
                      <div
                        aria-label="導入移行診断"
                        style={{
                          borderTop: '1px solid rgba(148, 163, 184, 0.28)',
                          marginTop: '0.85rem',
                          paddingTop: '0.85rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
                          <strong style={{ color: 'var(--text-main)', fontSize: '0.88rem' }}>導入移行診断</strong>
                          <span style={backupDrillStatusStyle(backupDrillReport.migrationDiagnostic.status)}>
                            {backupDrillReport.migrationDiagnostic.statusLabel}
                          </span>
                        </div>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                          gap: '0.55rem',
                          marginBottom: '0.65rem'
                        }}>
                          {[
                            ['ID欠落', `${backupDrillReport.migrationDiagnostic.missingPrimaryKeyCount}件`],
                            ['同一ID重複', `${backupDrillReport.migrationDiagnostic.duplicatePrimaryKeyCount}件`],
                            ['文字化け疑い', `${backupDrillReport.migrationDiagnostic.mojibakeSuspectCount}件`],
                            ['必須領域不足', `${backupDrillReport.migrationDiagnostic.missingRequiredCollectionCount}件`]
                          ].map(([label, value]) => (
                            <div key={label} style={{ borderLeft: '3px solid rgba(37, 99, 235, 0.35)', paddingLeft: '0.55rem' }}>
                              <div style={{ color: 'var(--text-ghost)', fontSize: '0.68rem', fontWeight: 800 }}>{label}</div>
                              <div style={{ color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 800 }}>{value}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ color: backupDrillReport.migrationDiagnostic.status === 'pass' ? 'var(--text-muted)' : 'var(--warning)', fontSize: '0.76rem', fontWeight: 750, marginBottom: backupDrillReport.migrationDiagnostic.issues.length > 0 ? '0.55rem' : 0 }}>
                          {backupDrillReport.migrationDiagnostic.requiredActions.join(' / ')}
                        </div>
                        {backupDrillReport.migrationDiagnostic.issues.length > 0 && (
                          <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.74rem' }}>
                            {backupDrillReport.migrationDiagnostic.issues.slice(0, 4).map((issue) => (
                              <div key={issue.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(72px, 0.35fr) minmax(96px, 0.4fr) minmax(180px, 1fr)', gap: '0.45rem', alignItems: 'center' }}>
                                <span style={backupDrillStatusStyle(issue.severity)}>{issue.severity === 'blocked' ? '不可' : '要確認'}</span>
                                <span style={{ color: 'var(--text-main)', fontWeight: 800 }}>{issue.label}</span>
                                <span style={{ color: 'var(--text-muted)' }}>{issue.detail}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div style={{
                    maxHeight: '260px',
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    marginBottom: '1.25rem'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '0.6rem 0.75rem', fontWeight: 600 }}>データ区分</th>
                          <th style={{ padding: '0.6rem 0.75rem', color: 'var(--success)', fontWeight: 600 }}>新規追加</th>
                          <th style={{ padding: '0.6rem 0.75rem', color: 'var(--warning)', fontWeight: 600 }}>上書き更新</th>
                          <th style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>変更なし</th>
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
                            <tr key={diff.collection} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--text-main)' }}>{label}</td>
                              <td style={{ padding: '0.5rem 0.75rem', color: diff.added > 0 ? 'var(--success)' : 'inherit', fontWeight: diff.added > 0 ? 600 : 'normal' }}>
                                {diff.added > 0 ? `+${diff.added} 件` : '0'}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', color: diff.updated > 0 ? 'var(--warning)' : 'inherit', fontWeight: diff.updated > 0 ? 600 : 'normal' }}>
                                {diff.updated > 0 ? `${diff.updated} 件` : '0'}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-ghost)' }}>
                                {diff.unchanged}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button
                      className="btn-secondary"
                      onClick={handleCancelRestore}
                      disabled={isImportingBackup}
                      style={{ padding: '0.5rem 1.25rem' }}
                    >
                      キャンセル
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={handleRecordBackupDrill}
                      disabled={isImportingBackup || !backupDrillReport}
                      style={{ padding: '0.5rem 1.25rem' }}
                    >
                      復旧テストを記録
                    </button>
                    <button
                      className="btn-primary"
                      onClick={handleConfirmRestore}
                      disabled={isImportingBackup || backupDrillReport?.status === 'blocked'}
                      title={backupDrillReport?.status === 'blocked' ? '復旧前診断が復旧不可です。ID欠落や重複を修正してください。' : undefined}
                      style={{ padding: '0.5rem 1.5rem', background: 'var(--success)', borderColor: 'var(--success)', boxShadow: 'none' }}
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
        </div>
  );
}
