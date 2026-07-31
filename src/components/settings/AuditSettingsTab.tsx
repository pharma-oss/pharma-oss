import React from 'react';
import { Loader2, AlertTriangle, CheckCircle, Download, ShieldCheck, FileText, CalendarClock } from 'lucide-react';
import { AuditLog, User } from '@/db/types';
import { getPermissionDeniedMessage } from '@/lib/audit';
import { type AuditIntegrityReport, type AuditLogRetentionMonthlyReview } from '@/lib/audit_integrity';
import { type OperationalClosingMonthlyReview, type OperationalClosingStoreBenchmarkActionTemplate } from '@/lib/operational_closing_review';
import { type AiSuggestionFeedbackMonthlyReview } from '@/lib/ai_suggestion_feedback';

  const auditActionLabel = (actionType: AuditLog['actionType']) => {
    const labels: Record<AuditLog['actionType'], string> = {
      login: 'ログイン',
      prescription_ocr: '処方箋OCR読込',
      prescription_edit: '薬歴完了・変更',
      billing_toggle: '点数算定切替',
      claim_lifecycle: '請求状態変更',
      daily_closing_approval: '日次締め承認',
      daily_closing_kpi_action: 'KPI改善アクション',
      session_lock: 'セッションロック',
      print: '印刷実行',
      uke_export: 'レセプト出力',
      stock_update: '在庫更新',
      user_switch: '操作者切替',
      facility_settings_update: '施設基準設定変更',
      drug_master_update: '医薬品マスタ更新',
      patient_medication_info_template: '薬情テンプレ承認',
      follow_up_record: '服薬フォロー記録',
      ai_suggestion_review: 'AI補助提案確認',
      electronic_prescription: '電子処方箋受付',
      external_device_handoff: '調剤機器連携',
      staff_create: 'スタッフ追加',
      staff_delete: 'スタッフ削除',
      staff_credential_recovery: 'スタッフ認証復旧',
      passkey_register: 'パスキー登録',
      audit_export: '監査ログ書出',
      audit_retention_approval: '監査ログ保全確認',
      backup_export: 'バックアップ書出',
      backup_schedule_update: 'バックアップ予定変更',
      backup_external_storage: '外部保存確認',
      backup_external_transfer_manifest: '外部保存連携JSON',
      backup_drill: '復旧テスト',
      backup_import: 'バックアップ復旧',
      official_spec_review: '公式仕様点検'
    };
    return labels[actionType] || actionType;
  };

interface AuditSettingsTabProps {
  currentUser: User;
  canViewAuditLogs: boolean;
  canManageFacility: boolean;
  canApproveDailyClosing: boolean;
  auditLogs: AuditLog[];
  auditIntegrity: AuditIntegrityReport | null;
  isCheckingAuditIntegrity: boolean;
  auditIntegrityStatus: string;
  auditIntegrityColor: string;
  latestAuditHashPreview: string;
  handleExportAuditLogs: () => Promise<void>;
  isExportingAuditLogs: boolean;
  handleExportAnonymousDiagnostic: () => Promise<void>;
  isExportingAnonymousDiagnostic: boolean;
  handleExportAuditRetentionLedgerCsv: () => Promise<void>;
  isExportingAuditRetentionLedger: boolean;
  auditRetentionReview: AuditLogRetentionMonthlyReview;
  auditRetentionReviewColor: string;
  auditRetentionReviewBackground: string;
  auditRetentionManagerReviewColor: string;
  auditRetentionManagerReviewBackground: string;
  handleRecordAuditRetentionManagerReview: () => Promise<void>;
  isRecordingAuditRetentionManagerReview: boolean;
  auditRetentionManagerReviewButtonLabel: string;
  handleExportAuditRetentionMonthlyReviewCsv: () => Promise<void>;
  isExportingAuditRetentionReview: boolean;
  latestRetentionJsonLabel: string;
  latestRetentionLedgerLabel: string;
  aiSuggestionFeedbackReview: AiSuggestionFeedbackMonthlyReview;
  aiSuggestionQualityGateColor: string;
  aiSuggestionQualityGateBackground: string;
  aiSuggestionFeedbackColor: string;
  aiSuggestionFeedbackBackground: string;
  handleExportAiSuggestionFeedbackReviewCsv: () => Promise<void>;
  isExportingAiSuggestionFeedbackReview: boolean;
  handleExportAiSuggestionFeedbackBiJson: () => Promise<void>;
  isExportingAiSuggestionFeedbackBi: boolean;
  handleApplyAiQualityRecommendation: () => Promise<void>;
  isApplyingAiQualityMode: boolean;
  dailyClosingReview: OperationalClosingMonthlyReview;
  latestClosingHashPreview: string;
  dailyClosingReviewColor: string;
  dailyClosingReviewStatus: string;
  handleExportDailyClosingReviewCsv: () => Promise<void>;
  isExportingDailyClosingReview: boolean;
  dailyClosingStoreBenchmarkBackground: string;
  dailyClosingStoreBenchmarkColor: string;
  handleExportDailyClosingStoreBenchmarkJson: () => Promise<void>;
  isExportingDailyClosingStoreBenchmark: boolean;
  recordingDailyClosingKpiActionId: string | null;
  handleRecordDailyClosingKpiAction: (template: OperationalClosingStoreBenchmarkActionTemplate) => Promise<void>;
  postponingDailyClosingKpiActionId: string | null;
  handlePostponeDailyClosingKpiAction: (template: OperationalClosingStoreBenchmarkActionTemplate) => Promise<void>;
  dailyClosingComparisonColor: string;
  dailyClosingComparisonBackground: string;
  dailyClosingComparison: OperationalClosingMonthlyReview['previousMonthComparison'];
  filterUser: string;
  setFilterUser: (value: string) => void;
  filterAction: string;
  setFilterAction: (value: string) => void;
}

export default function AuditSettingsTab({
  currentUser,
  canViewAuditLogs,
  canManageFacility,
  canApproveDailyClosing,
  auditLogs,
  auditIntegrity,
  isCheckingAuditIntegrity,
  auditIntegrityStatus,
  auditIntegrityColor,
  latestAuditHashPreview,
  handleExportAuditLogs,
  isExportingAuditLogs,
  handleExportAnonymousDiagnostic,
  isExportingAnonymousDiagnostic,
  handleExportAuditRetentionLedgerCsv,
  isExportingAuditRetentionLedger,
  auditRetentionReview,
  auditRetentionReviewColor,
  auditRetentionReviewBackground,
  auditRetentionManagerReviewColor,
  auditRetentionManagerReviewBackground,
  handleRecordAuditRetentionManagerReview,
  isRecordingAuditRetentionManagerReview,
  auditRetentionManagerReviewButtonLabel,
  handleExportAuditRetentionMonthlyReviewCsv,
  isExportingAuditRetentionReview,
  latestRetentionJsonLabel,
  latestRetentionLedgerLabel,
  aiSuggestionFeedbackReview,
  aiSuggestionQualityGateColor,
  aiSuggestionQualityGateBackground,
  aiSuggestionFeedbackColor,
  aiSuggestionFeedbackBackground,
  handleExportAiSuggestionFeedbackReviewCsv,
  isExportingAiSuggestionFeedbackReview,
  handleExportAiSuggestionFeedbackBiJson,
  isExportingAiSuggestionFeedbackBi,
  handleApplyAiQualityRecommendation,
  isApplyingAiQualityMode,
  dailyClosingReview,
  latestClosingHashPreview,
  dailyClosingReviewColor,
  dailyClosingReviewStatus,
  handleExportDailyClosingReviewCsv,
  isExportingDailyClosingReview,
  dailyClosingStoreBenchmarkBackground,
  dailyClosingStoreBenchmarkColor,
  handleExportDailyClosingStoreBenchmarkJson,
  isExportingDailyClosingStoreBenchmark,
  recordingDailyClosingKpiActionId,
  handleRecordDailyClosingKpiAction,
  postponingDailyClosingKpiActionId,
  handlePostponeDailyClosingKpiAction,
  dailyClosingComparisonColor,
  dailyClosingComparisonBackground,
  dailyClosingComparison,
  filterUser,
  setFilterUser,
  filterAction,
  setFilterAction
}: AuditSettingsTabProps) {
  return (
        <div className="settings-section glass">
          <h2>操作ログ・監査ログ（監査証跡）</h2>
          <p className="section-desc">薬局内の誰が、いつ、どのような重要操作を行ったかの履歴を監査用に出力・閲覧できます。</p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
              padding: '0.85rem 0',
              marginBottom: '1.2rem',
              borderTop: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  color: auditIntegrityColor,
                  fontWeight: 800,
                  fontSize: '0.92rem'
                }}
              >
                {isCheckingAuditIntegrity ? <Loader2 size={17} className="animate-spin" /> : auditIntegrity?.invalid ? <AlertTriangle size={17} /> : <CheckCircle size={17} />}
                監査ログ整合性: {auditIntegrityStatus}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                総数 {auditIntegrity?.total ?? auditLogs.length} / 署名済み {auditIntegrity?.signed ?? 0} / 未署名 {auditIntegrity?.unsigned ?? 0} / 異常 {auditIntegrity?.invalid ?? 0}
              </span>
              <span style={{ color: 'var(--text-ghost)', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                最新 {latestAuditHashPreview}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                JSONは責任者保全欄付き
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                className="btn-secondary flex-center gap-2"
                style={{ padding: '0.55rem 0.85rem', fontSize: '0.84rem' }}
                onClick={handleExportAuditLogs}
                disabled={!canViewAuditLogs || isExportingAuditLogs || auditLogs.length === 0}
                title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
              >
                {isExportingAuditLogs ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                <span>監査ログJSON</span>
              </button>
              <button
                className="btn-secondary flex-center gap-2"
                style={{ padding: '0.55rem 0.85rem', fontSize: '0.84rem' }}
                onClick={handleExportAnonymousDiagnostic}
                disabled={!canViewAuditLogs || isExportingAnonymousDiagnostic}
                title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : '患者情報などを含めないサポート用JSONを出力'}
                data-testid="anonymous-diagnostic-export-button"
              >
                {isExportingAnonymousDiagnostic ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                <span>個人情報なし診断JSON</span>
              </button>
              <button
                className="btn-secondary flex-center gap-2"
                style={{ padding: '0.55rem 0.85rem', fontSize: '0.84rem' }}
                onClick={handleExportAuditRetentionLedgerCsv}
                disabled={!canViewAuditLogs || isExportingAuditRetentionLedger || auditLogs.length === 0}
                title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
              >
                {isExportingAuditRetentionLedger ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                <span>保全台帳CSV</span>
              </button>
            </div>
          </div>

          <section
            aria-label="監査ログ保全月次棚卸"
            style={{
              padding: '0 0 1.2rem',
              marginBottom: '1.2rem',
              borderBottom: '1px solid var(--border)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>監査ログ保全月次棚卸</h3>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                  {auditRetentionReview.monthLabel} / 最新ハッシュ {latestAuditHashPreview}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                <span style={{
                  color: auditRetentionReviewColor,
                  background: auditRetentionReviewBackground,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '999px',
                  padding: '0.18rem 0.65rem',
                  fontSize: '0.78rem',
                  fontWeight: 800
                }}>
                  {auditRetentionReview.statusLabel}
                </span>
                <span style={{
                  color: auditRetentionManagerReviewColor,
                  background: auditRetentionManagerReviewBackground,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '999px',
                  padding: '0.18rem 0.65rem',
                  fontSize: '0.78rem',
                  fontWeight: 800
                }}>
                  {auditRetentionReview.managerReviewLabel}
                </span>
                <button
                  className="btn-secondary flex-center gap-2"
                  style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
                  onClick={handleRecordAuditRetentionManagerReview}
                  disabled={!canViewAuditLogs || isRecordingAuditRetentionManagerReview || auditLogs.length === 0}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : auditRetentionReview.managerReviewRequiredActions[0]}
                  data-testid="audit-retention-manager-review-button"
                >
                  {isRecordingAuditRetentionManagerReview ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                  <span>{auditRetentionManagerReviewButtonLabel}</span>
                </button>
                <button
                  className="btn-secondary flex-center gap-2"
                  style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
                  onClick={handleExportAuditRetentionMonthlyReviewCsv}
                  disabled={!canViewAuditLogs || isExportingAuditRetentionReview || auditLogs.length === 0}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
                >
                  {isExportingAuditRetentionReview ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>棚卸CSV</span>
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
                ['監査ログJSON', `${auditRetentionReview.auditJsonExportCount}回`],
                ['保全台帳CSV', `${auditRetentionReview.retentionLedgerExportCount}回`],
                ['責任者確認', auditRetentionReview.managerReviewLabel],
                ['差し戻し', `${auditRetentionReview.returnReasons.length}件`],
                ['対応', auditRetentionReview.actionLabel]
              ].map(([label, value]) => (
                <div key={label} style={{ borderLeft: '3px solid var(--primary)', padding: '0.2rem 0 0.2rem 0.65rem' }}>
                  <div style={{ color: 'var(--text-ghost)', fontSize: '0.74rem', fontWeight: 700 }}>{label}</div>
                  <div style={{ color: label === '差し戻し' ? auditRetentionReviewColor : label === '責任者確認' ? auditRetentionManagerReviewColor : 'var(--text-main)', fontSize: '1.02rem', fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.8rem',
              color: 'var(--text-muted)',
              fontSize: '0.8rem'
            }}>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>最新JSON</div>
                <div style={{ color: 'var(--text-main)', fontWeight: 700, wordBreak: 'break-all' }}>{latestRetentionJsonLabel}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>最新保全台帳</div>
                <div style={{ color: 'var(--text-main)', fontWeight: 700, wordBreak: 'break-all' }}>{latestRetentionLedgerLabel}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>差し戻し理由</div>
                <div style={{ color: auditRetentionReview.returnReasons.length > 0 ? auditRetentionReviewColor : 'var(--text-main)', fontWeight: 700 }}>
                  {auditRetentionReview.returnReasons.length > 0 ? auditRetentionReview.returnReasons.join(' / ') : 'なし'}
                </div>
              </div>
            </div>
          </section>

          <section
            aria-label="AI補助フィードバック月次レビュー"
            style={{
              padding: '0 0 1.2rem',
              marginBottom: '1.2rem',
              borderBottom: '1px solid var(--border)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>AI補助フィードバック月次レビュー</h3>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                  {aiSuggestionFeedbackReview.monthLabel} / 採否ログ {aiSuggestionFeedbackReview.totalCount}件
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                <span style={{
                  color: aiSuggestionQualityGateColor,
                  background: aiSuggestionQualityGateBackground,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '8px',
                  padding: '0.18rem 0.65rem',
                  fontSize: '0.78rem',
                  fontWeight: 800
                }}>
                  品質ゲート: {aiSuggestionFeedbackReview.qualityGate.statusLabel}
                </span>
                <span style={{
                  color: aiSuggestionFeedbackColor,
                  background: aiSuggestionFeedbackBackground,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '8px',
                  padding: '0.18rem 0.65rem',
                  fontSize: '0.78rem',
                  fontWeight: 800
                }}>
                  {aiSuggestionFeedbackReview.statusLabel}
                </span>
                <button
                  className="btn-secondary flex-center gap-2"
                  style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
                  onClick={handleExportAiSuggestionFeedbackReviewCsv}
                  disabled={!canViewAuditLogs || isExportingAiSuggestionFeedbackReview || isExportingAiSuggestionFeedbackBi}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
                >
                  {isExportingAiSuggestionFeedbackReview ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>フィードバックCSV</span>
                </button>
                <button
                  className="btn-secondary flex-center gap-2"
                  style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
                  onClick={handleExportAiSuggestionFeedbackBiJson}
                  disabled={!canViewAuditLogs || isExportingAiSuggestionFeedbackReview || isExportingAiSuggestionFeedbackBi}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
                >
                  {isExportingAiSuggestionFeedbackBi ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>BI JSON</span>
                </button>
                <button
                  className="btn-secondary flex-center gap-2"
                  style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
                  onClick={handleApplyAiQualityRecommendation}
                  disabled={
                    !canManageFacility
                    || isApplyingAiQualityMode
                    || aiSuggestionFeedbackReview.qualityGate.modeAlignment !== 'change_required'
                  }
                  title={!canManageFacility
                    ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings')
                    : aiSuggestionFeedbackReview.qualityGate.modeAlignment === 'change_required'
                      ? `推奨の「${aiSuggestionFeedbackReview.qualityGate.recommendedModeLabel}」へ変更`
                      : aiSuggestionFeedbackReview.qualityGate.modeAlignmentLabel}
                  data-testid="ai-quality-gate-apply"
                >
                  {isApplyingAiQualityMode ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                  <span>推奨モードを反映</span>
                </button>
              </div>
            </div>
            <div
              data-testid="ai-quality-gate"
              style={{
                border: '1px solid var(--border)',
                borderLeft: `4px solid ${aiSuggestionQualityGateColor}`,
                borderRadius: '8px',
                padding: '0.85rem',
                marginBottom: '0.85rem',
                background: aiSuggestionQualityGateBackground
              }}
            >
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '0.7rem',
                marginBottom: '0.7rem'
              }}>
                {[
                  ['現在 / 推奨', `${aiSuggestionFeedbackReview.qualityGate.currentModeLabel} / ${aiSuggestionFeedbackReview.qualityGate.recommendedModeLabel}`],
                  ['評価件数', `${aiSuggestionFeedbackReview.qualityGate.sampleCount}/${aiSuggestionFeedbackReview.qualityGate.policy.minimumMonthlySamples}件`],
                  ['却下率', `${aiSuggestionFeedbackReview.qualityGate.rejectionRate}%`],
                  [`高信頼度${aiSuggestionFeedbackReview.qualityGate.policy.highConfidenceThreshold}%以上`, `却下 ${aiSuggestionFeedbackReview.qualityGate.highConfidenceRejectedCount}/${aiSuggestionFeedbackReview.qualityGate.highConfidenceCount}件`],
                  ['理由未記入', `${aiSuggestionFeedbackReview.qualityGate.missingFeedbackCount}件`],
                  ['モード確認', aiSuggestionFeedbackReview.qualityGate.modeAlignmentLabel]
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', fontWeight: 800 }}>{label}</div>
                    <div style={{ color: 'var(--text-main)', fontSize: '0.96rem', fontWeight: 800, overflowWrap: 'anywhere' }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ color: aiSuggestionQualityGateColor, fontSize: '0.8rem', fontWeight: 750, marginBottom: '0.45rem' }}>
                {aiSuggestionFeedbackReview.qualityGate.reasons.join(' / ')}
              </div>
              <div style={{ color: 'var(--text-main)', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.45rem' }}>
                {aiSuggestionFeedbackReview.qualityGate.requiredActions.join(' / ')}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 650 }}>
                {aiSuggestionFeedbackReview.qualityGate.evaluationNote}
              </div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '0.75rem',
              marginBottom: '0.85rem'
            }}>
              {[
                ['採用', `${aiSuggestionFeedbackReview.acceptedCount}件`],
                ['修正', `${aiSuggestionFeedbackReview.modifiedCount}件`],
                ['却下', `${aiSuggestionFeedbackReview.rejectedCount}件`],
                ['採用率', `${aiSuggestionFeedbackReview.acceptanceRate}%`],
                ['修正/却下率', `${aiSuggestionFeedbackReview.correctionRate}%`],
                ['平均信頼度', aiSuggestionFeedbackReview.averageConfidence === undefined ? '-' : `${aiSuggestionFeedbackReview.averageConfidence}%`],
                ['フィードバック', `${aiSuggestionFeedbackReview.feedbackCount}件`],
                ['対応', aiSuggestionFeedbackReview.actionLabel]
              ].map(([label, value]) => (
                <div key={label} style={{ borderLeft: '3px solid #7c3aed', padding: '0.2rem 0 0.2rem 0.65rem' }}>
                  <div style={{ color: 'var(--text-ghost)', fontSize: '0.74rem', fontWeight: 700 }}>{label}</div>
                  <div style={{ color: label === '対応' ? aiSuggestionFeedbackColor : 'var(--text-main)', fontSize: '1.02rem', fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.8rem',
              color: 'var(--text-muted)',
              fontSize: '0.8rem'
            }}>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>最新採否</div>
                <div style={{ color: 'var(--text-main)', fontWeight: 700 }}>
                  {aiSuggestionFeedbackReview.latestRecord
                    ? `${aiSuggestionFeedbackReview.latestRecord.dateLabel} ${aiSuggestionFeedbackReview.latestRecord.decisionLabel}`
                    : '未記録'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>最新提案</div>
                <div style={{ color: 'var(--text-main)', fontWeight: 700 }}>
                  {aiSuggestionFeedbackReview.latestRecord?.suggestionTitle || '未記録'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.73rem', fontWeight: 800 }}>次の対応</div>
                <div style={{ color: aiSuggestionFeedbackColor, fontWeight: 700 }}>
                  {aiSuggestionFeedbackReview.requiredActions.join(' / ')}
                </div>
              </div>
            </div>
          </section>

          <section
            aria-label="日次締め月次レビュー"
            style={{
              padding: '0 0 1.2rem',
              marginBottom: '1.2rem',
              borderBottom: '1px solid var(--border)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>日次締め月次レビュー</h3>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                  {dailyClosingReview.monthLabel} / 最新承認ハッシュ {latestClosingHashPreview}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                <span style={{
                  color: dailyClosingReviewColor,
                  background: dailyClosingReview.daysWithBlockers > 0 ? '#fffbeb' : dailyClosingReview.approvalCount > 0 ? '#f0fdf4' : '#f8fafc',
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '999px',
                  padding: '0.18rem 0.65rem',
                  fontSize: '0.78rem',
                  fontWeight: 800
                }}>
                  {dailyClosingReviewStatus}
                </span>
                <button
                  className="btn-secondary flex-center gap-2"
                  style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
                  onClick={handleExportDailyClosingReviewCsv}
                  disabled={!canViewAuditLogs || isExportingDailyClosingReview}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
                >
                  {isExportingDailyClosingReview ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>レビューCSV</span>
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
                ['承認回数', `${dailyClosingReview.approvalCount}回`],
                ['承認日数', `${dailyClosingReview.approvedDayCount}日`],
                ['確認者数', `${dailyClosingReview.reviewerCount}名`],
                ['平均完了率', dailyClosingReview.averageCompletionRateLabel],
                ['残タスク日', `${dailyClosingReview.daysWithBlockers}日`],
                ['残タスク合計', `${dailyClosingReview.totalClosingBlockers}件`]
              ].map(([label, value]) => (
                <div key={label} style={{ borderLeft: '3px solid var(--primary)', padding: '0.2rem 0 0.2rem 0.65rem' }}>
                  <div style={{ color: 'var(--text-ghost)', fontSize: '0.74rem', fontWeight: 700 }}>{label}</div>
                  <div style={{ color: 'var(--text-main)', fontSize: '1.05rem', fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>
            <div
              aria-label="在庫・服薬フォロー月次KPI"
              data-testid="daily-closing-field-kpis"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '0.75rem',
                marginBottom: '0.85rem',
                padding: '0.75rem 0',
                borderTop: '1px solid rgba(148, 163, 184, 0.25)',
                borderBottom: '1px solid rgba(148, 163, 184, 0.25)'
              }}
            >
              {[
                ['在庫不足合計', `${dailyClosingReview.totalInventoryShortages}品目`, '#b45309'],
                ['入庫登録合計', `${dailyClosingReview.totalInventoryReceivings}件`, '#2563eb'],
                ['服薬フォロー合計', `${dailyClosingReview.totalFollowUpDueCount}件`, '#0f766e'],
                ['問い合わせ負荷合計', `${dailyClosingReview.totalSupportCaseCount}件`, '#7c3aed']
              ].map(([label, value, color]) => (
                <div key={label} style={{ borderLeft: `3px solid ${color}`, padding: '0.2rem 0 0.2rem 0.65rem', minWidth: 0 }}>
                  <div style={{ color: 'var(--text-ghost)', fontSize: '0.74rem', fontWeight: 700 }}>{label}</div>
                  <div style={{ color, fontSize: '1.05rem', fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>
            <div
              aria-label="店舗別KPIベンチマーク"
              style={{
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.85rem',
                background: dailyClosingStoreBenchmarkBackground,
                marginBottom: '0.85rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.7rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
                <div>
                  <div style={{ color: 'var(--text-main)', fontSize: '0.92rem', fontWeight: 850 }}>店舗別KPIベンチマーク</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 700 }}>
                    {dailyClosingReview.storeBenchmark.currentStoreName} / 比較店舗 {dailyClosingReview.storeBenchmark.storeCount}件
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <span style={{
                    color: dailyClosingStoreBenchmarkColor,
                    background: '#ffffff',
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    borderRadius: '999px',
                    padding: '0.16rem 0.55rem',
                    fontSize: '0.72rem',
                    fontWeight: 800
                  }}>
                    {dailyClosingReview.storeBenchmark.statusLabel}
                  </span>
                  <button
                    className="btn-secondary flex-center gap-2"
                    style={{ padding: '0.35rem 0.55rem', fontSize: '0.74rem' }}
                    onClick={handleExportDailyClosingStoreBenchmarkJson}
                    disabled={!canViewAuditLogs || isExportingDailyClosingStoreBenchmark}
                    title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : '患者情報なしの店舗別KPI JSONを書き出します'}
                  >
                    {isExportingDailyClosingStoreBenchmark ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    <span>BI JSON</span>
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(106px, 1fr))', gap: '0.65rem', marginBottom: '0.7rem' }}>
                {[
                  ['自店完了率', dailyClosingReview.storeBenchmark.currentStore?.averageCompletionRateLabel || '未集計'],
                  ['全店平均', dailyClosingReview.storeBenchmark.allStoreAverageCompletionRateLabel],
                  ['他店平均', dailyClosingReview.storeBenchmark.peerAverageCompletionRateLabel],
                  ['平均との差', dailyClosingReview.storeBenchmark.currentStore?.completionRateDifferenceFromAverage === undefined
                    ? '比較不可'
                    : `${dailyClosingReview.storeBenchmark.currentStore.completionRateDifferenceFromAverage > 0 ? '+' : ''}${dailyClosingReview.storeBenchmark.currentStore.completionRateDifferenceFromAverage}pt`],
                  ['残タスク差', dailyClosingReview.storeBenchmark.currentStore
                    ? `${dailyClosingReview.storeBenchmark.currentStore.blockerDifferenceFromAverage > 0 ? '+' : ''}${dailyClosingReview.storeBenchmark.currentStore.blockerDifferenceFromAverage}件`
                    : '比較不可']
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ color: 'var(--text-ghost)', fontSize: '0.7rem', fontWeight: 800 }}>{label}</div>
                    <div style={{ color: 'var(--text-main)', fontSize: '0.96rem', fontWeight: 850 }}>{value}</div>
                  </div>
                ))}
              </div>
              <div
                data-testid="store-field-kpi-benchmark"
                aria-label="在庫・服薬フォロー店舗比較"
                style={{
                  overflowX: 'auto',
                  marginBottom: '0.7rem',
                  padding: '0.55rem 0',
                  borderTop: '1px solid rgba(148, 163, 184, 0.28)',
                  borderBottom: '1px solid rgba(148, 163, 184, 0.28)'
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(126px, 1.2fr) repeat(3, minmax(92px, 1fr))', gap: '0.55rem', minWidth: '430px', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                  <strong style={{ color: 'var(--text-main)' }}>現場KPI（日平均）</strong>
                  <span>自店</span>
                  <span>全店</span>
                  <span>他店</span>
                  {[
                    ['在庫不足', dailyClosingReview.storeBenchmark.currentStore?.averageInventoryShortageLabel || '未集計', dailyClosingReview.storeBenchmark.allStoreAverageInventoryShortagesLabel, dailyClosingReview.storeBenchmark.peerAverageInventoryShortagesLabel],
                    ['入庫登録', dailyClosingReview.storeBenchmark.currentStore?.averageInventoryReceivingLabel || '未集計', dailyClosingReview.storeBenchmark.allStoreAverageInventoryReceivingsLabel, dailyClosingReview.storeBenchmark.peerAverageInventoryReceivingsLabel],
                    ['服薬フォロー', dailyClosingReview.storeBenchmark.currentStore?.averageFollowUpDueLabel || '未集計', dailyClosingReview.storeBenchmark.allStoreAverageFollowUpDueLabel, dailyClosingReview.storeBenchmark.peerAverageFollowUpDueLabel],
                    ['問い合わせ負荷', dailyClosingReview.storeBenchmark.currentStore?.averageSupportCaseLabel || '未集計', dailyClosingReview.storeBenchmark.allStoreAverageSupportCasesLabel, dailyClosingReview.storeBenchmark.peerAverageSupportCasesLabel]
                  ].flatMap(([label, current, allStores, peers]) => [
                    <strong key={`${label}-label`} style={{ color: 'var(--text-main)' }}>{label}</strong>,
                    <span key={`${label}-current`} style={{ color: 'var(--text-main)', fontWeight: 800 }}>{current}</span>,
                    <span key={`${label}-all`}>{allStores}</span>,
                    <span key={`${label}-peer`}>{peers}</span>
                  ])}
                </div>
              </div>
              {dailyClosingReview.storeBenchmark.storeSummaries.length > 0 && (
                <div style={{ display: 'grid', gap: '0.4rem', marginBottom: '0.65rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  {dailyClosingReview.storeBenchmark.storeSummaries.slice(0, 3).map((summary) => (
                    <div key={summary.storeKey} style={{ display: 'grid', gridTemplateColumns: 'minmax(94px, 1fr) auto auto auto', gap: '0.55rem', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-main)', fontWeight: 800 }}>{summary.storeName}</span>
                      <span>{summary.approvedDayCount}日</span>
                      <span>完了 {summary.averageCompletionRateLabel}</span>
                      <span>残 {summary.totalClosingBlockers}件</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ color: dailyClosingStoreBenchmarkColor, fontSize: '0.78rem', fontWeight: 750 }}>
                {dailyClosingReview.storeBenchmark.requiredActions.join(' / ')}
              </div>
              <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.28)', marginTop: '0.65rem', paddingTop: '0.65rem', display: 'grid', gap: '0.25rem' }}>
                <div style={{ color: 'var(--text-main)', fontSize: '0.78rem', fontWeight: 850 }}>
                  効果測定
                </div>
                <div style={{ color: dailyClosingStoreBenchmarkColor, fontSize: '0.74rem', fontWeight: 750 }}>
                  {dailyClosingReview.storeBenchmark.actionEffectSummary.statusLabel}
                  {dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution
                    ? ` / ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.title} / 実行後 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.measurementApprovedDayCount}/${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.measurementRequiredDayCount}日 / 完了率差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.completionRateDeltaLabel} / 残タスク平均差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.closingBlockerAverageDeltaLabel} / 在庫不足差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.inventoryShortageDeltaLabel} / 入庫差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.inventoryReceivingDeltaLabel} / フォロー差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.followUpDueDeltaLabel} / 問い合わせ差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.supportCaseDeltaLabel}`
                    : ' / 実行記録なし'}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.5 }}>
                  {dailyClosingReview.storeBenchmark.actionEffectSummary.requiredActions.join(' / ')}
                </div>
              </div>
              <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.28)', marginTop: '0.65rem', paddingTop: '0.65rem', display: 'grid', gap: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-main)', fontSize: '0.78rem', fontWeight: 850 }}>
                    未実施フォロー
                  </span>
                  <span style={{ color: dailyClosingStoreBenchmarkColor, fontSize: '0.72rem', fontWeight: 850 }}>
                    {dailyClosingReview.storeBenchmark.actionFollowUpSummary.statusLabel}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.5 }}>
                  未実施 {dailyClosingReview.storeBenchmark.actionFollowUpSummary.pendingCount}件 / 期限超過 {dailyClosingReview.storeBenchmark.actionFollowUpSummary.overdueCount}件 / 期限間近 {dailyClosingReview.storeBenchmark.actionFollowUpSummary.dueSoonCount}件
                  {dailyClosingReview.storeBenchmark.actionFollowUpSummary.nextDue
                    ? ` / 次期限 ${dailyClosingReview.storeBenchmark.actionFollowUpSummary.nextDue.dueDateLabel}`
                    : ''}
                </div>
                <div style={{ color: dailyClosingStoreBenchmarkColor, fontSize: '0.72rem', fontWeight: 750, lineHeight: 1.5 }}>
                  担当者・横断フォロー {dailyClosingReview.storeBenchmark.actionAssignmentSummary.statusLabel} / 未完了 {dailyClosingReview.storeBenchmark.actionAssignmentSummary.openAssignmentCount}件 / 店舗横断 {dailyClosingReview.storeBenchmark.actionAssignmentSummary.openCrossStoreFollowUpCount}件
                </div>
                <div style={{ color: dailyClosingStoreBenchmarkColor, fontSize: '0.7rem', fontWeight: 750, lineHeight: 1.5 }}>
                  エスカレーション {dailyClosingReview.storeBenchmark.actionAssignmentSummary.escalationLabel} / 延期中 {dailyClosingReview.storeBenchmark.actionAssignmentSummary.activePostponementCount}件
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', lineHeight: 1.5 }}>
                  担当 {dailyClosingReview.storeBenchmark.actionAssignmentSummary.assigneeLabels.join(' / ') || '未設定'}
                  {dailyClosingReview.storeBenchmark.actionAssignmentSummary.crossStoreTargetStoreNames.length > 0
                    ? ` / 横断先 ${dailyClosingReview.storeBenchmark.actionAssignmentSummary.crossStoreTargetStoreNames.join('、')}`
                    : ''}
                </div>
                <div style={{ display: 'grid', gap: '0.28rem' }}>
                  {dailyClosingReview.storeBenchmark.actionFollowUps.slice(0, 2).map((followUp) => (
                    <div key={followUp.templateId} style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                      <span style={{ color: 'var(--text-main)', fontWeight: 800 }}>{followUp.title}</span>
                      <span>{followUp.statusLabel}</span>
                      <span>担当 {followUp.assigneeLabel}</span>
                      <span>期限 {followUp.dueDateLabel}</span>
                      {followUp.status !== 'completed' && (
                        <span>{followUp.daysUntilDue < 0 ? `${Math.abs(followUp.daysUntilDue)}日超過` : `残り ${followUp.daysUntilDue}日`}</span>
                      )}
                      {followUp.crossStoreTargetStoreNames.length > 0 && (
                        <span>横断 {followUp.crossStoreTargetStoreNames.join('、')}</span>
                      )}
                      {followUp.postponed && (
                        <span>延期 {followUp.postponementReason || '理由未記入'}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {dailyClosingReview.storeBenchmark.actionTemplates.length > 0 && (
                <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.28)', marginTop: '0.65rem', paddingTop: '0.65rem' }}>
                  <div style={{ color: 'var(--text-main)', fontSize: '0.78rem', fontWeight: 850, marginBottom: '0.45rem' }}>
                    改善アクション
                  </div>
                  <div style={{ display: 'grid', gap: '0.55rem' }}>
                    {dailyClosingReview.storeBenchmark.actionTemplates.slice(0, 2).map((template) => {
                      const priorityColor = template.priority === 'high'
                        ? '#b91c1c'
                        : template.priority === 'medium'
                          ? '#b45309'
                          : '#15803d';
                      const priorityLabel = template.priority === 'high'
                        ? '高'
                        : template.priority === 'medium'
                          ? '中'
                          : '低';
                      const followUp = dailyClosingReview.storeBenchmark.actionFollowUps.find((candidate) => candidate.templateId === template.id);
                      return (
                        <div key={template.id} style={{ display: 'grid', gap: '0.28rem', borderLeft: `3px solid ${priorityColor}`, paddingLeft: '0.6rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-main)', fontSize: '0.8rem', fontWeight: 850 }}>
                              {template.title}
                            </span>
                            <span style={{ color: priorityColor, fontSize: '0.68rem', fontWeight: 850 }}>
                              優先度 {priorityLabel}
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', lineHeight: 1.55 }}>
                            {template.steps.join(' / ')}
                          </div>
                          <div style={{ color: dailyClosingStoreBenchmarkColor, fontSize: '0.72rem', fontWeight: 750 }}>
                            {template.expectedOutcome}
                          </div>
                          {followUp && (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 750 }}>
                              期限 {followUp.dueDateLabel} / {followUp.statusLabel} / 担当 {followUp.assigneeLabel}
                              {followUp.crossStoreTargetStoreNames.length > 0
                                ? ` / 横断 ${followUp.crossStoreTargetStoreNames.join('、')}`
                                : ''}
                              {followUp.postponed
                                ? ` / 延期 ${followUp.postponementReason || '理由未記入'}`
                                : ''}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <button
                              className="btn-secondary flex-center gap-2"
                              style={{ padding: '0.32rem 0.55rem', fontSize: '0.72rem' }}
                              onClick={() => handleRecordDailyClosingKpiAction(template)}
                              disabled={!canApproveDailyClosing || recordingDailyClosingKpiActionId === template.id}
                              title={!canApproveDailyClosing ? getPermissionDeniedMessage(currentUser, 'approve_daily_closing') : 'この改善アクションを監査ログに記録します'}
                            >
                              {recordingDailyClosingKpiActionId === template.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                              <span>実行記録</span>
                            </button>
                            <button
                              className="btn-secondary flex-center gap-2"
                              style={{ padding: '0.32rem 0.55rem', fontSize: '0.72rem' }}
                              onClick={() => handlePostponeDailyClosingKpiAction(template)}
                              disabled={!canApproveDailyClosing || followUp?.status === 'completed' || postponingDailyClosingKpiActionId === template.id}
                              title={!canApproveDailyClosing ? getPermissionDeniedMessage(currentUser, 'approve_daily_closing') : '延期理由と再期限を監査ログに記録します'}
                            >
                              {postponingDailyClosingKpiActionId === template.id ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />}
                              <span>延期記録</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div
              aria-label="日次締め前月比較"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(150px, 1.1fr) repeat(8, minmax(120px, 1fr))',
                gap: '0.6rem',
                alignItems: 'stretch',
                overflowX: 'auto',
                padding: '0.65rem 0',
                marginBottom: '0.85rem',
                borderTop: '1px solid rgba(148, 163, 184, 0.25)',
                borderBottom: '1px solid rgba(148, 163, 184, 0.25)'
              }}
            >
              <div style={{ minWidth: '150px' }}>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.74rem', fontWeight: 700 }}>前月比較</div>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: dailyClosingComparisonColor,
                  background: dailyClosingComparisonBackground,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '999px',
                  padding: '0.16rem 0.58rem',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  marginTop: '0.2rem'
                }}>
                  {dailyClosingComparison.statusLabel}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '0.25rem' }}>
                  {dailyClosingComparison.previousMonth.monthLabel}比
                </div>
              </div>
              {[
                ['承認日数', dailyClosingComparison.approvedDayDeltaLabel],
                ['平均完了率', dailyClosingComparison.averageCompletionRateDeltaLabel],
                ['残タスク日', dailyClosingComparison.daysWithBlockersDeltaLabel],
                ['残タスク合計', dailyClosingComparison.totalClosingBlockersDeltaLabel],
                ['在庫不足', dailyClosingComparison.inventoryShortageDeltaLabel],
                ['入庫登録', dailyClosingComparison.inventoryReceivingDeltaLabel],
                ['服薬フォロー', dailyClosingComparison.followUpDueDeltaLabel],
                ['問い合わせ負荷', dailyClosingComparison.supportCaseDeltaLabel]
              ].map(([label, value]) => (
                <div key={label} style={{ minWidth: '120px', borderLeft: '3px solid rgba(37, 99, 235, 0.45)', padding: '0.1rem 0 0.1rem 0.55rem' }}>
                  <div style={{ color: 'var(--text-ghost)', fontSize: '0.72rem', fontWeight: 700 }}>{label}</div>
                  <div style={{ color: dailyClosingComparisonColor, fontSize: '0.98rem', fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: '0.95rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                <div style={{ color: 'var(--text-main)', fontSize: '0.84rem', fontWeight: 800 }}>複数月KPI比較</div>
                <div style={{ color: 'var(--text-ghost)', fontSize: '0.75rem' }}>
                  直近{dailyClosingReview.monthlyKpiHistory.length}か月
                </div>
              </div>
              <div
                aria-label="日次締め複数月KPI比較"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, minmax(148px, 1fr))',
                  gap: '0.55rem',
                  overflowX: 'auto',
                  padding: '0.15rem 0.05rem 0.35rem'
                }}
              >
                {dailyClosingReview.monthlyKpiHistory.map((month) => {
                  const completion = month.averageCompletionRate ?? 0;
                  const blockerTone = month.totalClosingBlockers > 0
                    ? '#b45309'
                    : month.approvalCount > 0
                      ? '#15803d'
                      : '#64748b';
                  const barHeight = Math.max(6, Math.round(completion * 0.5));
                  return (
                    <div
                      key={month.monthKey}
                      style={{
                        minWidth: '148px',
                        border: '1px solid rgba(148, 163, 184, 0.32)',
                        borderRadius: '6px',
                        padding: '0.55rem',
                        background: month.approvalCount > 0 ? '#ffffff' : '#f8fafc'
                      }}
                    >
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 800 }}>{month.monthLabel}</div>
                      <div style={{ height: '58px', display: 'flex', alignItems: 'flex-end', gap: '0.45rem', marginTop: '0.35rem' }}>
                        <div style={{
                          width: '18px',
                          height: `${barHeight}px`,
                          borderRadius: '4px 4px 2px 2px',
                          background: blockerTone,
                          border: '1px solid rgba(15, 23, 42, 0.08)'
                        }} />
                        <div>
                          <div style={{ color: blockerTone, fontSize: '0.98rem', fontWeight: 850 }}>{month.averageCompletionRateLabel}</div>
                          <div style={{ color: 'var(--text-ghost)', fontSize: '0.68rem' }}>{month.approvedDayCount}日承認</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.45rem', marginTop: '0.4rem', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 700 }}>
                        <span>残日 {month.daysWithBlockers}</span>
                        <span>残 {month.totalClosingBlockers}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.25rem', marginTop: '0.35rem', color: 'var(--text-muted)', fontSize: '0.66rem', fontWeight: 700 }}>
                        <span title="在庫不足品目数">不足 {month.totalInventoryShortages}</span>
                        <span title="入庫登録件数">入庫 {month.totalInventoryReceivings}</span>
                        <span title="服薬フォロー候補数">フォロー {month.totalFollowUpDueCount}</span>
                        <span title="問い合わせ負荷件数">問合せ {month.totalSupportCaseCount}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {dailyClosingReview.allApprovals.length > 0 && (
              <div style={{ marginBottom: '0.95rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                  <div style={{ color: 'var(--text-main)', fontSize: '0.84rem', fontWeight: 800 }}>KPI推移</div>
                  <div style={{ color: 'var(--text-ghost)', fontSize: '0.75rem' }}>
                    完了率 {dailyClosingReview.completionTrendLabel} / 残タスク {dailyClosingReview.blockerTrendLabel}
                  </div>
                </div>
                <div
                  aria-label="日次締めKPI推移"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: '0.45rem',
                    overflowX: 'auto',
                    padding: '0.45rem 0.15rem 0.2rem'
                  }}
                >
                  {[...dailyClosingReview.allApprovals].reverse().map((approval) => {
                    const completion = approval.completionRate ?? 0;
                    const blockerCount = approval.closingBlockerCount ?? 0;
                    const barHeight = Math.max(6, Math.round(completion * 0.42));
                    return (
                      <div
                        key={`trend-${approval.logId}`}
                        title={`${approval.dateLabel} 完了率${approval.completionRate === undefined ? '-' : `${approval.completionRate}%`} 残タスク${approval.closingBlockerCount ?? '-'}件 在庫不足${approval.inventoryShortageCount ?? '-'}品目 入庫${approval.inventoryReceivingCount ?? '-'}件 フォロー${approval.followUpDueCount ?? '-'}件 問い合わせ${approval.supportCaseCount ?? '-'}件`}
                        style={{
                          flex: '0 0 42px',
                          minHeight: '74px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '0.25rem'
                        }}
                      >
                        <div style={{ height: '44px', display: 'flex', alignItems: 'flex-end' }}>
                          <div style={{
                            width: '16px',
                            height: `${barHeight}px`,
                            borderRadius: '4px 4px 2px 2px',
                            background: blockerCount > 0 ? '#f59e0b' : '#16a34a',
                            border: '1px solid rgba(15, 23, 42, 0.08)'
                          }} />
                        </div>
                        <span style={{ color: blockerCount > 0 ? '#b45309' : '#15803d', fontSize: '0.68rem', fontWeight: 800 }}>
                          {approval.completionRate === undefined ? '-' : `${approval.completionRate}%`}
                        </span>
                        <span style={{ color: 'var(--text-ghost)', fontSize: '0.66rem' }}>
                          {approval.dateKey.slice(-2)}日
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gap: '0.45rem' }}>
              {dailyClosingReview.recentApprovals.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>今月の日次締め承認は未記録です。</div>
              ) : (
                dailyClosingReview.recentApprovals.map((approval) => (
                  <div
                    key={approval.logId}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                      alignItems: 'center',
                      padding: '0.45rem 0',
                      borderTop: '1px solid rgba(148, 163, 184, 0.22)',
                      fontSize: '0.82rem'
                    }}
                  >
                    <span style={{ fontWeight: 700, color: 'var(--text-main)', minWidth: '7rem' }}>{approval.dateLabel}</span>
                    <span style={{ color: 'var(--text-muted)', flex: '1 1 9rem' }}>{approval.reviewerName}</span>
                    <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>完了 {approval.completionRate === undefined ? '-' : `${approval.completionRate}%`}</span>
                    <span style={{ color: (approval.closingBlockerCount ?? 0) > 0 ? '#b45309' : '#15803d', fontWeight: 700 }}>
                      残 {approval.closingBlockerCount ?? '-'}件
                    </span>
                    <span style={{ color: (approval.inventoryShortageCount ?? 0) > 0 ? '#b45309' : '#15803d', fontWeight: 700 }}>
                      不足 {approval.inventoryShortageCount ?? '-'}品目
                    </span>
                    <span style={{ color: (approval.inventoryReceivingCount ?? 0) > 0 ? '#2563eb' : 'var(--text-muted)', fontWeight: 700 }}>
                      入庫 {approval.inventoryReceivingCount ?? '-'}件
                    </span>
                    <span style={{ color: (approval.followUpDueCount ?? 0) > 0 ? '#b45309' : '#15803d', fontWeight: 700 }}>
                      フォロー {approval.followUpDueCount ?? '-'}件
                    </span>
                    <span style={{ color: (approval.supportCaseCount ?? 0) > 0 ? '#7c3aed' : 'var(--text-muted)', fontWeight: 700 }}>
                      問合せ {approval.supportCaseCount ?? '-'}件
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>操作ユーザーで絞り込み</label>
              <input
                type="text"
                placeholder="例: 山田"
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '200px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>操作種別</label>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'white', fontSize: '0.9rem' }}
              >
                <option value="">全種別</option>
                <option value="login">ログイン</option>
                <option value="prescription_ocr">処方箋OCR読込</option>
                <option value="prescription_edit">薬歴完了・変更</option>
                <option value="billing_toggle">点数算定切替</option>
                <option value="claim_lifecycle">請求状態変更</option>
                <option value="daily_closing_approval">日次締め承認</option>
                <option value="daily_closing_kpi_action">KPI改善アクション</option>
                <option value="session_lock">セッションロック</option>
                <option value="print">印刷実行</option>
                <option value="uke_export">レセプト出力</option>
                <option value="stock_update">在庫更新</option>
                <option value="user_switch">操作者切替</option>
                <option value="facility_settings_update">施設基準設定変更</option>
                <option value="drug_master_update">医薬品マスタ更新</option>
                <option value="patient_medication_info_template">薬情テンプレ承認</option>
                <option value="follow_up_record">服薬フォロー記録</option>
                <option value="ai_suggestion_review">AI補助提案確認</option>
                <option value="staff_create">スタッフ追加</option>
                <option value="staff_delete">スタッフ削除</option>
                <option value="staff_credential_recovery">スタッフ認証復旧</option>
                <option value="passkey_register">パスキー登録</option>
                <option value="audit_export">監査ログ書出</option>
                <option value="audit_retention_approval">監査ログ保全確認</option>
                <option value="backup_export">バックアップ書出</option>
                <option value="backup_schedule_update">バックアップ予定変更</option>
                <option value="backup_external_storage">外部保存確認</option>
                <option value="backup_external_transfer_manifest">外部保存連携JSON</option>
                <option value="backup_drill">復旧テスト</option>
                <option value="backup_import">バックアップ復旧</option>
                <option value="official_spec_review">公式仕様点検</option>
              </select>
            </div>
          </div>

          <div className="table-wrapper" style={{ maxHeight: '500px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)', background: 'var(--bg-muted)' }}>
                  <th style={{ padding: '0.75rem' }}>日時</th>
                  <th style={{ padding: '0.75rem' }}>操作者</th>
                  <th style={{ padding: '0.75rem' }}>種別</th>
                  <th style={{ padding: '0.75rem' }}>対象患者</th>
                  <th style={{ padding: '0.75rem' }}>操作詳細</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-ghost)' }}>
                      記録されている操作ログはありません。
                    </td>
                  </tr>
                ) : (
                  auditLogs
                    .filter((log) => {
                      const matchUser = !filterUser || log.userName.includes(filterUser);
                      const matchAction = !filterAction || log.actionType === filterAction;
                      return matchUser && matchAction;
                    })
                    .map((log) => {
                      let actionBadgeColor = 'gray';
                      if (log.actionType === 'prescription_ocr') actionBadgeColor = '#2563eb';
                      else if (log.actionType === 'prescription_edit') actionBadgeColor = '#16a34a';
                      else if (log.actionType === 'billing_toggle') actionBadgeColor = '#d97706';
                      else if (log.actionType === 'claim_lifecycle') actionBadgeColor = '#be123c';
                      else if (log.actionType === 'daily_closing_approval') actionBadgeColor = '#047857';
                      else if (log.actionType === 'daily_closing_kpi_action') actionBadgeColor = '#0f766e';
                      else if (log.actionType === 'session_lock') actionBadgeColor = '#475569';
                      else if (log.actionType === 'print') actionBadgeColor = '#7c3aed';
                      else if (log.actionType === 'uke_export') actionBadgeColor = '#db2777';
                      else if (log.actionType === 'stock_update') actionBadgeColor = '#0891b2';
                      else if (log.actionType === 'user_switch') actionBadgeColor = '#4b5563';
                      else if (log.actionType === 'facility_settings_update') actionBadgeColor = '#9333ea';
                      else if (log.actionType === 'drug_master_update') actionBadgeColor = '#0e7490';
                      else if (log.actionType === 'patient_medication_info_template') actionBadgeColor = '#047857';
                      else if (log.actionType === 'follow_up_record') actionBadgeColor = '#0f766e';
                      else if (log.actionType === 'ai_suggestion_review') actionBadgeColor = '#7c3aed';
                      else if (log.actionType === 'staff_create') actionBadgeColor = '#15803d';
                      else if (log.actionType === 'staff_delete') actionBadgeColor = '#b91c1c';
                      else if (log.actionType === 'staff_credential_recovery') actionBadgeColor = '#c2410c';
                      else if (log.actionType === 'passkey_register') actionBadgeColor = '#1d4ed8';
                      else if (log.actionType === 'audit_export') actionBadgeColor = '#0369a1';
                      else if (log.actionType === 'audit_retention_approval') actionBadgeColor = '#15803d';
                      else if (log.actionType === 'backup_export') actionBadgeColor = '#0f766e';
                      else if (log.actionType === 'backup_schedule_update') actionBadgeColor = '#4f46e5';
                      else if (log.actionType === 'backup_external_storage') actionBadgeColor = '#047857';
                      else if (log.actionType === 'backup_drill') actionBadgeColor = '#2563eb';
                      else if (log.actionType === 'backup_import') actionBadgeColor = '#b45309';
                      else if (log.actionType === 'official_spec_review') actionBadgeColor = '#0369a1';

                      return (
                        <tr key={log.logId} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem', whiteSpace: 'nowrap', color: 'var(--text-main)' }}>
                            {new Date(log.timestamp).toLocaleString('ja-JP')}
                          </td>
                          <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--text-main)' }}>
                            {log.userName}
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-ghost)', marginLeft: '0.25rem' }}>
                              ({log.userRole === 'pharmacist' ? '薬剤師' : log.userRole === 'clerk' ? '事務' : '管理'})
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              color: 'white',
                              fontSize: '0.75rem',
                              background: actionBadgeColor,
                              fontWeight: 600
                            }}>
                              {auditActionLabel(log.actionType)}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', fontWeight: 500, color: 'var(--text-main)' }}>
                            {log.patientName || '-'}
                          </td>
                          <td style={{ padding: '0.75rem', color: 'var(--text-main)' }}>
                            {log.details}
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
  );
}
