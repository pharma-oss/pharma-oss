import React from 'react';
import { Loader2, AlertTriangle, CheckCircle, Download, ShieldCheck, FileText, CalendarClock } from 'lucide-react';
import { AuditLog, User } from '@/db/types';
import { getPermissionDeniedMessage } from '@/lib/audit';
import { type AuditIntegrityReport, type AuditLogRetentionMonthlyReview } from '@/lib/audit_integrity';
import { type OperationalClosingMonthlyReview, type OperationalClosingStoreBenchmarkActionTemplate } from '@/lib/operational_closing_review';
import { type AiSuggestionFeedbackMonthlyReview } from '@/lib/ai_suggestion_feedback';

import { auditActionLabel } from '@/lib/audit_settings_helpers';

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

          <div className="audit-header-bar">
            <div className="audit-integrity-info">
              <span className={`audit-integrity-status ${auditIntegrity?.invalid ? 'is-invalid' : 'is-valid'}`}>
                {isCheckingAuditIntegrity ? <Loader2 size={17} className="animate-spin" /> : auditIntegrity?.invalid ? <AlertTriangle size={17} /> : <CheckCircle size={17} />}
                監査ログ整合性: {auditIntegrityStatus}
              </span>
              <span className="audit-integrity-count">
                総数 {auditIntegrity?.total ?? auditLogs.length} / 署名済み {auditIntegrity?.signed ?? 0} / 未署名 {auditIntegrity?.unsigned ?? 0} / 異常 {auditIntegrity?.invalid ?? 0}
              </span>
              <span className="audit-latest-hash">
                最新 {latestAuditHashPreview}
              </span>
              <span className="audit-integrity-note">
                JSONは責任者保全欄付き
              </span>
            </div>
            <div className="audit-header-actions">
              <button
                className="btn-secondary flex-center gap-2 btn-audit-export"
                onClick={handleExportAuditLogs}
                disabled={!canViewAuditLogs || isExportingAuditLogs || auditLogs.length === 0}
                title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
              >
                {isExportingAuditLogs ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                <span>監査ログJSON</span>
              </button>
              <button
                className="btn-secondary flex-center gap-2 btn-audit-export"
                onClick={handleExportAnonymousDiagnostic}
                disabled={!canViewAuditLogs || isExportingAnonymousDiagnostic}
                title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : '患者情報などを含めないサポート用JSONを出力'}
                data-testid="anonymous-diagnostic-export-button"
              >
                {isExportingAnonymousDiagnostic ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                <span>個人情報なし診断JSON</span>
              </button>
              <button
                className="btn-secondary flex-center gap-2 btn-audit-export"
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
            className="audit-retention-section"
          >
            <div className="retention-header">
              <div>
                <h3 className="retention-title">監査ログ保全月次棚卸</h3>
                <p className="retention-subtitle">
                  {auditRetentionReview.monthLabel} / 最新ハッシュ {latestAuditHashPreview}
                </p>
              </div>
              <div className="retention-header-actions">
                <span className={`retention-status-badge status-${auditRetentionReview.status}`}>
                  {auditRetentionReview.statusLabel}
                </span>
                <span className={`retention-manager-badge status-${auditRetentionReview.managerReviewStatus || 'unreviewed'}`}>
                  {auditRetentionReview.managerReviewLabel}
                </span>
                <button
                  className="btn-secondary flex-center gap-2 btn-retention-action"
                  onClick={handleRecordAuditRetentionManagerReview}
                  disabled={!canViewAuditLogs || isRecordingAuditRetentionManagerReview || auditLogs.length === 0}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : auditRetentionReview.managerReviewRequiredActions[0]}
                  data-testid="audit-retention-manager-review-button"
                >
                  {isRecordingAuditRetentionManagerReview ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                  <span>{auditRetentionManagerReviewButtonLabel}</span>
                </button>
                <button
                  className="btn-secondary flex-center gap-2 btn-retention-action"
                  onClick={handleExportAuditRetentionMonthlyReviewCsv}
                  disabled={!canViewAuditLogs || isExportingAuditRetentionReview || auditLogs.length === 0}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
                >
                  {isExportingAuditRetentionReview ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>棚卸CSV</span>
                </button>
              </div>
            </div>
            <div className="retention-kpi-grid">
              {[
                ['監査ログJSON', `${auditRetentionReview.auditJsonExportCount}回`],
                ['保全台帳CSV', `${auditRetentionReview.retentionLedgerExportCount}回`],
                ['責任者確認', auditRetentionReview.managerReviewLabel],
                ['差し戻し', `${auditRetentionReview.returnReasons.length}件`],
                ['対応', auditRetentionReview.actionLabel]
              ].map(([label, value]) => (
                <div key={label} className="retention-kpi-item">
                  <div className="retention-kpi-label">{label}</div>
                  <div className={`retention-kpi-value ${label === '差し戻し' && auditRetentionReview.returnReasons.length > 0 ? 'is-returned' : label === '責任者確認' ? `status-${auditRetentionReview.managerReviewStatus || 'unreviewed'}` : ''}`}>{value}</div>
                </div>
              ))}
            </div>
            <div className="retention-summary-footer">
              <div>
                <div className="retention-footer-label">最新JSON</div>
                <div className="retention-footer-val">{latestRetentionJsonLabel}</div>
              </div>
              <div>
                <div className="retention-footer-label">最新保全台帳</div>
                <div className="retention-footer-val">{latestRetentionLedgerLabel}</div>
              </div>
              <div>
                <div className="retention-footer-label">差し戻し理由</div>
                <div className={`retention-footer-val ${auditRetentionReview.returnReasons.length > 0 ? 'is-returned' : ''}`}>
                  {auditRetentionReview.returnReasons.length > 0 ? auditRetentionReview.returnReasons.join(' / ') : 'なし'}
                </div>
              </div>
            </div>
          </section>

          <section
            aria-label="AI補助フィードバック月次レビュー"
            className="ai-feedback-section"
          >
            <div className="ai-feedback-header">
              <div>
                <h3 className="ai-feedback-title">AI補助フィードバック月次レビュー</h3>
                <p className="ai-feedback-subtitle">
                  {aiSuggestionFeedbackReview.monthLabel} / 採否ログ {aiSuggestionFeedbackReview.totalCount}件
                </p>
              </div>
              <div className="ai-feedback-header-actions">
                <span className={`ai-quality-gate-badge status-${aiSuggestionFeedbackReview.qualityGate.status}`}>
                  品質ゲート: {aiSuggestionFeedbackReview.qualityGate.statusLabel}
                </span>
                <span className={`ai-feedback-status-badge status-${aiSuggestionFeedbackReview.status}`}>
                  {aiSuggestionFeedbackReview.statusLabel}
                </span>
                <button
                  className="btn-secondary flex-center gap-2 btn-ai-feedback-action"
                  onClick={handleExportAiSuggestionFeedbackReviewCsv}
                  disabled={!canViewAuditLogs || isExportingAiSuggestionFeedbackReview || isExportingAiSuggestionFeedbackBi}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
                >
                  {isExportingAiSuggestionFeedbackReview ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>フィードバックCSV</span>
                </button>
                <button
                  className="btn-secondary flex-center gap-2 btn-ai-feedback-action"
                  onClick={handleExportAiSuggestionFeedbackBiJson}
                  disabled={!canViewAuditLogs || isExportingAiSuggestionFeedbackReview || isExportingAiSuggestionFeedbackBi}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
                >
                  {isExportingAiSuggestionFeedbackBi ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>BI JSON</span>
                </button>
                <button
                  className="btn-secondary flex-center gap-2 btn-ai-feedback-action"
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
              className={`ai-quality-gate-panel status-${aiSuggestionFeedbackReview.qualityGate.status}`}
            >
              <div className="ai-quality-grid">
                {[
                  ['現在 / 推奨', `${aiSuggestionFeedbackReview.qualityGate.currentModeLabel} / ${aiSuggestionFeedbackReview.qualityGate.recommendedModeLabel}`],
                  ['評価件数', `${aiSuggestionFeedbackReview.qualityGate.sampleCount}/${aiSuggestionFeedbackReview.qualityGate.policy.minimumMonthlySamples}件`],
                  ['却下率', `${aiSuggestionFeedbackReview.qualityGate.rejectionRate}%`],
                  [`高信頼度${aiSuggestionFeedbackReview.qualityGate.policy.highConfidenceThreshold}%以上`, `却下 ${aiSuggestionFeedbackReview.qualityGate.highConfidenceRejectedCount}/${aiSuggestionFeedbackReview.qualityGate.highConfidenceCount}件`],
                  ['理由未記入', `${aiSuggestionFeedbackReview.qualityGate.missingFeedbackCount}件`],
                  ['モード確認', aiSuggestionFeedbackReview.qualityGate.modeAlignmentLabel]
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="ai-quality-label">{label}</div>
                    <div className="ai-quality-value">{value}</div>
                  </div>
                ))}
              </div>
              <div className={`ai-quality-reasons status-${aiSuggestionFeedbackReview.qualityGate.status}`}>
                {aiSuggestionFeedbackReview.qualityGate.reasons.join(' / ')}
              </div>
              <div className="ai-quality-actions">
                {aiSuggestionFeedbackReview.qualityGate.requiredActions.join(' / ')}
              </div>
              <div className="ai-quality-note">
                {aiSuggestionFeedbackReview.qualityGate.evaluationNote}
              </div>
            </div>
            <div className="ai-feedback-kpi-grid">
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
                <div key={label} className="ai-feedback-kpi-item">
                  <div className="ai-feedback-kpi-label">{label}</div>
                  <div className={`ai-feedback-kpi-value ${label === '対応' ? `status-${aiSuggestionFeedbackReview.status}` : ''}`}>{value}</div>
                </div>
              ))}
            </div>
            <div className="ai-feedback-summary-footer">
              <div>
                <div className="ai-feedback-footer-label">最新採否</div>
                <div className="ai-feedback-footer-val">
                  {aiSuggestionFeedbackReview.latestRecord
                    ? `${aiSuggestionFeedbackReview.latestRecord.dateLabel} ${aiSuggestionFeedbackReview.latestRecord.decisionLabel}`
                    : '未記録'}
                </div>
              </div>
              <div>
                <div className="ai-feedback-footer-label">最新提案</div>
                <div className="ai-feedback-footer-val">
                  {aiSuggestionFeedbackReview.latestRecord?.suggestionTitle || '未記録'}
                </div>
              </div>
              <div>
                <div className="ai-feedback-footer-label">次の対応</div>
                <div className={`ai-feedback-footer-val status-${aiSuggestionFeedbackReview.status}`}>
                  {aiSuggestionFeedbackReview.requiredActions.join(' / ')}
                </div>
              </div>
            </div>
          </section>

          <section
            aria-label="日次締め月次レビュー"
            className="daily-closing-section"
          >
            <div className="closing-header">
              <div>
                <h3 className="closing-title">日次締め月次レビュー</h3>
                <p className="closing-subtitle">
                  {dailyClosingReview.monthLabel} / 最新承認ハッシュ {latestClosingHashPreview}
                </p>
              </div>
              <div className="closing-header-actions">
                <span className={`closing-status-badge ${dailyClosingReview.daysWithBlockers > 0 ? 'has-blockers' : dailyClosingReview.approvalCount > 0 ? 'is-approved' : 'is-empty'}`}>
                  {dailyClosingReviewStatus}
                </span>
                <button
                  className="btn-secondary flex-center gap-2 btn-closing-action"
                  onClick={handleExportDailyClosingReviewCsv}
                  disabled={!canViewAuditLogs || isExportingDailyClosingReview}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
                >
                  {isExportingDailyClosingReview ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>レビューCSV</span>
                </button>
              </div>
            </div>
            <div className="closing-kpi-grid">
              {[
                ['承認回数', `${dailyClosingReview.approvalCount}回`],
                ['承認日数', `${dailyClosingReview.approvedDayCount}日`],
                ['確認者数', `${dailyClosingReview.reviewerCount}名`],
                ['平均完了率', dailyClosingReview.averageCompletionRateLabel],
                ['残タスク日', `${dailyClosingReview.daysWithBlockers}日`],
                ['残タスク合計', `${dailyClosingReview.totalClosingBlockers}件`]
              ].map(([label, value]) => (
                <div key={label} className="closing-kpi-item">
                  <div className="closing-kpi-label">{label}</div>
                  <div className="closing-kpi-value">{value}</div>
                </div>
              ))}
            </div>
            <div
              aria-label="在庫・服薬フォロー月次KPI"
              data-testid="daily-closing-field-kpis"
              className="closing-field-kpis-grid"
            >
              {[
                ['在庫不足合計', `${dailyClosingReview.totalInventoryShortages}品目`, 'shortage'],
                ['入庫登録合計', `${dailyClosingReview.totalInventoryReceivings}件`, 'receiving'],
                ['服薬フォロー合計', `${dailyClosingReview.totalFollowUpDueCount}件`, 'followup'],
                ['問い合わせ負荷合計', `${dailyClosingReview.totalSupportCaseCount}件`, 'support']
              ].map(([label, value, kpiType]) => (
                <div key={label} className={`closing-field-kpi-item type-${kpiType}`}>
                  <div className="field-kpi-label">{label}</div>
                  <div className={`field-kpi-value type-${kpiType}`}>{value}</div>
                </div>
              ))}
            </div>
            <div
              aria-label="店舗別KPIベンチマーク"
              className={`store-benchmark-panel status-${dailyClosingReview.storeBenchmark.status}`}
            >
              <div className="benchmark-header">
                <div>
                  <div className="benchmark-title">店舗別KPIベンチマーク</div>
                  <div className="benchmark-subtitle">
                    {dailyClosingReview.storeBenchmark.currentStoreName} / 比較店舗 {dailyClosingReview.storeBenchmark.storeCount}件
                  </div>
                </div>
                <div className="benchmark-header-actions">
                  <span className={`benchmark-status-badge status-${dailyClosingReview.storeBenchmark.status}`}>
                    {dailyClosingReview.storeBenchmark.statusLabel}
                  </span>
                  <button
                    className="btn-secondary flex-center gap-2 btn-benchmark-export"
                    onClick={handleExportDailyClosingStoreBenchmarkJson}
                    disabled={!canViewAuditLogs || isExportingDailyClosingStoreBenchmark}
                    title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : '患者情報なしの店舗別KPI JSONを書き出します'}
                  >
                    {isExportingDailyClosingStoreBenchmark ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    <span>BI JSON</span>
                  </button>
                </div>
              </div>
              <div className="benchmark-stats-grid">
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
                    <div className="benchmark-stat-label">{label}</div>
                    <div className="benchmark-stat-value">{value}</div>
                  </div>
                ))}
              </div>
              <div
                data-testid="store-field-kpi-benchmark"
                aria-label="在庫・服薬フォロー店舗比較"
                className="benchmark-table-wrapper"
              >
                <div className="benchmark-grid-table">
                  <strong className="table-col-header">現場KPI（日平均）</strong>
                  <span className="table-col-header">自店</span>
                  <span className="table-col-header">全店</span>
                  <span className="table-col-header">他店</span>
                  {[
                    ['在庫不足', dailyClosingReview.storeBenchmark.currentStore?.averageInventoryShortageLabel || '未集計', dailyClosingReview.storeBenchmark.allStoreAverageInventoryShortagesLabel, dailyClosingReview.storeBenchmark.peerAverageInventoryShortagesLabel],
                    ['入庫登録', dailyClosingReview.storeBenchmark.currentStore?.averageInventoryReceivingLabel || '未集計', dailyClosingReview.storeBenchmark.allStoreAverageInventoryReceivingsLabel, dailyClosingReview.storeBenchmark.peerAverageInventoryReceivingsLabel],
                    ['服薬フォロー', dailyClosingReview.storeBenchmark.currentStore?.averageFollowUpDueLabel || '未集計', dailyClosingReview.storeBenchmark.allStoreAverageFollowUpDueLabel, dailyClosingReview.storeBenchmark.peerAverageFollowUpDueLabel],
                    ['問い合わせ負荷', dailyClosingReview.storeBenchmark.currentStore?.averageSupportCaseLabel || '未集計', dailyClosingReview.storeBenchmark.allStoreAverageSupportCasesLabel, dailyClosingReview.storeBenchmark.peerAverageSupportCasesLabel]
                  ].flatMap(([label, current, allStores, peers]) => [
                    <strong key={`${label}-label`} className="table-row-label">{label}</strong>,
                    <span key={`${label}-current`} className="table-cell-current">{current}</span>,
                    <span key={`${label}-all`} className="table-cell-all">{allStores}</span>,
                    <span key={`${label}-peer`} className="table-cell-peer">{peers}</span>
                  ])}
                </div>
              </div>
              {dailyClosingReview.storeBenchmark.storeSummaries.length > 0 && (
                <div className="benchmark-store-summaries">
                  {dailyClosingReview.storeBenchmark.storeSummaries.slice(0, 3).map((summary) => (
                    <div key={summary.storeKey} className="benchmark-store-row">
                      <span className="store-name">{summary.storeName}</span>
                      <span>{summary.approvedDayCount}日</span>
                      <span>完了 {summary.averageCompletionRateLabel}</span>
                      <span>残 {summary.totalClosingBlockers}件</span>
                    </div>
                  ))}
                </div>
              )}
              <div className={`benchmark-required-actions status-${dailyClosingReview.storeBenchmark.status}`}>
                {dailyClosingReview.storeBenchmark.requiredActions.join(' / ')}
              </div>
              <div className="benchmark-effect-section">
                <div className="effect-title">
                  効果測定
                </div>
                <div className={`effect-status status-${dailyClosingReview.storeBenchmark.status}`}>
                  {dailyClosingReview.storeBenchmark.actionEffectSummary.statusLabel}
                  {dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution
                    ? ` / ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.title} / 実行後 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.measurementApprovedDayCount}/${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.measurementRequiredDayCount}日 / 完了率差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.completionRateDeltaLabel} / 残タスク平均差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.closingBlockerAverageDeltaLabel} / 在庫不足差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.inventoryShortageDeltaLabel} / 入庫差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.inventoryReceivingDeltaLabel} / フォロー差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.followUpDueDeltaLabel} / 問い合わせ差 ${dailyClosingReview.storeBenchmark.actionEffectSummary.latestExecution.supportCaseDeltaLabel}`
                    : ' / 実行記録なし'}
                </div>
                <div className="effect-actions">
                  {dailyClosingReview.storeBenchmark.actionEffectSummary.requiredActions.join(' / ')}
                </div>
              </div>
              <div className="benchmark-followup-section">
                <div className="followup-header">
                  <span className="followup-title">
                    未実施フォロー
                  </span>
                  <span className={`followup-status-badge status-${dailyClosingReview.storeBenchmark.status}`}>
                    {dailyClosingReview.storeBenchmark.actionFollowUpSummary.statusLabel}
                  </span>
                </div>
                <div className="followup-counts">
                  未実施 {dailyClosingReview.storeBenchmark.actionFollowUpSummary.pendingCount}件 / 期限超過 {dailyClosingReview.storeBenchmark.actionFollowUpSummary.overdueCount}件 / 期限間近 {dailyClosingReview.storeBenchmark.actionFollowUpSummary.dueSoonCount}件
                  {dailyClosingReview.storeBenchmark.actionFollowUpSummary.nextDue
                    ? ` / 次期限 ${dailyClosingReview.storeBenchmark.actionFollowUpSummary.nextDue.dueDateLabel}`
                    : ''}
                </div>
                <div className={`followup-line status-${dailyClosingReview.storeBenchmark.status}`}>
                  担当者・横断フォロー {dailyClosingReview.storeBenchmark.actionAssignmentSummary.statusLabel} / 未完了 {dailyClosingReview.storeBenchmark.actionAssignmentSummary.openAssignmentCount}件 / 店舗横断 {dailyClosingReview.storeBenchmark.actionAssignmentSummary.openCrossStoreFollowUpCount}件
                </div>
                <div className={`followup-line status-${dailyClosingReview.storeBenchmark.status}`}>
                  エスカレーション {dailyClosingReview.storeBenchmark.actionAssignmentSummary.escalationLabel} / 延期中 {dailyClosingReview.storeBenchmark.actionAssignmentSummary.activePostponementCount}件
                </div>
                <div className="followup-assignees">
                  担当 {dailyClosingReview.storeBenchmark.actionAssignmentSummary.assigneeLabels.join(' / ') || '未設定'}
                  {dailyClosingReview.storeBenchmark.actionAssignmentSummary.crossStoreTargetStoreNames.length > 0
                    ? ` / 横断先 ${dailyClosingReview.storeBenchmark.actionAssignmentSummary.crossStoreTargetStoreNames.join('、')}`
                    : ''}
                </div>
                <div className="followup-list">
                  {dailyClosingReview.storeBenchmark.actionFollowUps.slice(0, 2).map((followUp) => (
                    <div key={followUp.templateId} className="followup-item-row">
                      <span className="item-title">{followUp.title}</span>
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
                <div className="benchmark-templates-section">
                  <div className="templates-title">
                    改善アクション
                  </div>
                  <div className="templates-list">
                    {dailyClosingReview.storeBenchmark.actionTemplates.slice(0, 2).map((template) => {
                      const priorityLabel = template.priority === 'high'
                        ? '高'
                        : template.priority === 'medium'
                          ? '中'
                          : '低';
                      const followUp = dailyClosingReview.storeBenchmark.actionFollowUps.find((candidate) => candidate.templateId === template.id);
                      return (
                        <div key={template.id} className={`template-card priority-${template.priority}`}>
                          <div className="template-card-header">
                            <span className="template-name">
                              {template.title}
                            </span>
                            <span className={`priority-badge priority-${template.priority}`}>
                              優先度 {priorityLabel}
                            </span>
                          </div>
                          <div className="template-steps">
                            {template.steps.join(' / ')}
                          </div>
                          <div className={`template-outcome status-${dailyClosingReview.storeBenchmark.status}`}>
                            {template.expectedOutcome}
                          </div>
                          {followUp && (
                            <div className="template-followup-info">
                              期限 {followUp.dueDateLabel} / {followUp.statusLabel} / 担当 {followUp.assigneeLabel}
                              {followUp.crossStoreTargetStoreNames.length > 0
                                ? ` / 横断 ${followUp.crossStoreTargetStoreNames.join('、')}`
                                : ''}
                              {followUp.postponed
                                ? ` / 延期 ${followUp.postponementReason || '理由未記入'}`
                                : ''}
                            </div>
                          )}
                          <div className="template-actions">
                            <button
                              className="btn-secondary flex-center gap-2 btn-template-action"
                              onClick={() => handleRecordDailyClosingKpiAction(template)}
                              disabled={!canApproveDailyClosing || recordingDailyClosingKpiActionId === template.id}
                              title={!canApproveDailyClosing ? getPermissionDeniedMessage(currentUser, 'approve_daily_closing') : 'この改善アクションを監査ログに記録します'}
                            >
                              {recordingDailyClosingKpiActionId === template.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                              <span>実行記録</span>
                            </button>
                            <button
                              className="btn-secondary flex-center gap-2 btn-template-action"
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
              className="comparison-grid-wrapper"
            >
              <div className="comparison-main-box">
                <div className="comparison-main-label">前月比較</div>
                <div className={`comparison-status-badge status-${dailyClosingComparison.status}`}>
                  {dailyClosingComparison.statusLabel}
                </div>
                <div className="comparison-month-label">
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
                <div key={label} className="comparison-metric-item">
                  <div className="comparison-metric-label">{label}</div>
                  <div className={`comparison-metric-val status-${dailyClosingComparison.status}`}>{value}</div>
                </div>
              ))}
            </div>
            <div className="multimonth-section">
              <div className="multimonth-header">
                <div className="multimonth-title">複数月KPI比較</div>
                <div className="multimonth-count">
                  直近{dailyClosingReview.monthlyKpiHistory.length}か月
                </div>
              </div>
              <div
                aria-label="日次締め複数月KPI比較"
                className="multimonth-grid"
              >
                {dailyClosingReview.monthlyKpiHistory.map((month) => {
                  const completion = month.averageCompletionRate ?? 0;
                  const barHeight = Math.max(6, Math.round(completion * 0.5));
                  const isBlocked = month.totalClosingBlockers > 0;
                  const isPass = month.approvalCount > 0 && !isBlocked;
                  const barClass = isBlocked ? 'has-blockers' : isPass ? 'is-pass' : 'is-default';

                  return (
                    <div
                      key={month.monthKey}
                      className={`multimonth-card ${month.approvalCount > 0 ? 'is-approved' : 'is-empty'}`}
                    >
                      <div className="multimonth-card-header">{month.monthLabel}</div>
                      <div className="multimonth-bar-container">
                        <div
                          className={`multimonth-bar ${barClass}`}
                          style={{ '--bar-height': `${barHeight}px` } as React.CSSProperties}
                        />
                        <div>
                          <div className={`multimonth-rate ${barClass}`}>{month.averageCompletionRateLabel}</div>
                          <div className="multimonth-days">{month.approvedDayCount}日承認</div>
                        </div>
                      </div>
                      <div className="multimonth-sub-stats">
                        <span>残日 {month.daysWithBlockers}</span>
                        <span>残 {month.totalClosingBlockers}</span>
                      </div>
                      <div className="multimonth-field-kpis">
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
              <div className="trend-section">
                <div className="trend-header">
                  <div className="trend-title">KPI推移</div>
                  <div className="trend-subtitle">
                    完了率 {dailyClosingReview.completionTrendLabel} / 残タスク {dailyClosingReview.blockerTrendLabel}
                  </div>
                </div>
                <div
                  aria-label="日次締めKPI推移"
                  className="trend-chart"
                >
                  {[...dailyClosingReview.allApprovals].reverse().map((approval) => {
                    const completion = approval.completionRate ?? 0;
                    const blockerCount = approval.closingBlockerCount ?? 0;
                    const barHeight = Math.max(6, Math.round(completion * 0.42));
                    const isBlocked = blockerCount > 0;
                    return (
                      <div
                        key={`trend-${approval.logId}`}
                        title={`${approval.dateLabel} 完了率${approval.completionRate === undefined ? '-' : `${approval.completionRate}%`} 残タスク${approval.closingBlockerCount ?? '-'}件 在庫不足${approval.inventoryShortageCount ?? '-'}品目 入庫${approval.inventoryReceivingCount ?? '-'}件 フォロー${approval.followUpDueCount ?? '-'}件 問い合わせ${approval.supportCaseCount ?? '-'}件`}
                        className="trend-bar-item"
                      >
                        <div className="trend-bar-wrapper">
                          <div
                            className={`trend-bar ${isBlocked ? 'has-blockers' : 'is-pass'}`}
                            style={{ '--bar-height': `${barHeight}px` } as React.CSSProperties}
                          />
                        </div>
                        <span className={`trend-val ${isBlocked ? 'has-blockers' : 'is-pass'}`}>
                          {approval.completionRate === undefined ? '-' : `${approval.completionRate}%`}
                        </span>
                        <span className="trend-date">
                          {approval.dateKey.slice(-2)}日
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="recent-approvals-list">
              {dailyClosingReview.recentApprovals.length === 0 ? (
                <div className="recent-approvals-empty">今月の日次締め承認は未記録です。</div>
              ) : (
                dailyClosingReview.recentApprovals.map((approval) => (
                  <div
                    key={approval.logId}
                    className="recent-approval-row"
                  >
                    <span className="approval-date">{approval.dateLabel}</span>
                    <span className="approval-reviewer">{approval.reviewerName}</span>
                    <span className="approval-completion">完了 {approval.completionRate === undefined ? '-' : `${approval.completionRate}%`}</span>
                    <span className={`approval-blockers ${(approval.closingBlockerCount ?? 0) > 0 ? 'has-blockers' : 'is-pass'}`}>
                      残 {approval.closingBlockerCount ?? '-'}件
                    </span>
                    <span className={`approval-shortages ${(approval.inventoryShortageCount ?? 0) > 0 ? 'has-shortages' : 'is-pass'}`}>
                      不足 {approval.inventoryShortageCount ?? '-'}品目
                    </span>
                    <span className={`approval-receivings ${(approval.inventoryReceivingCount ?? 0) > 0 ? 'has-receivings' : 'is-muted'}`}>
                      入庫 {approval.inventoryReceivingCount ?? '-'}件
                    </span>
                    <span className={`approval-followups ${(approval.followUpDueCount ?? 0) > 0 ? 'has-followups' : 'is-pass'}`}>
                      フォロー {approval.followUpDueCount ?? '-'}件
                    </span>
                    <span className={`approval-support ${(approval.supportCaseCount ?? 0) > 0 ? 'has-support' : 'is-muted'}`}>
                      問合せ {approval.supportCaseCount ?? '-'}件
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="audit-filter-bar">
            <div className="filter-field-user">
              <label className="filter-label">操作ユーザーで絞り込み</label>
              <input
                type="text"
                placeholder="例: 山田"
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="form-control input-filter-user"
              />
            </div>
            <div className="filter-field-action">
              <label className="filter-label">操作種別</label>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="form-control select-filter-action"
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
                <option value="ai_draft_approved">AI下書き承認</option>
                <option value="ai_draft_modified">AI下書き修正</option>
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

          <div className="table-wrapper audit-table-wrapper">
            <table className="data-table audit-data-table">
              <thead>
                <tr className="audit-table-head-row">
                  <th className="audit-th">日時</th>
                  <th className="audit-th">操作者</th>
                  <th className="audit-th">種別</th>
                  <th className="audit-th">対象患者</th>
                  <th className="audit-th">操作詳細</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="audit-empty-td">
                      記録されている操作ログはありません。
                    </td>
                  </tr>
                ) : (
                  auditLogs
                    .filter((log) => {
                      const matchUser = !filterUser || log.userName.includes(filterUser);
                      const matchAction = !filterAction || filterAction === 'all' || log.actionType === filterAction;
                      return matchUser && matchAction;
                    })
                    .map((log) => (
                      <tr key={log.logId} className="audit-log-row">
                        <td className="audit-td td-time">
                          {new Date(log.timestamp).toLocaleString('ja-JP')}
                        </td>
                        <td className="audit-td td-user">
                          {log.userName}
                          <span className="audit-role-badge">
                            ({log.userRole === 'pharmacist' ? '薬剤師' : log.userRole === 'clerk' ? '事務' : '管理'})
                          </span>
                        </td>
                        <td className="audit-td td-action">
                          <span className={`audit-action-badge action-${log.actionType}`}>
                            {auditActionLabel(log.actionType)}
                          </span>
                        </td>
                        <td className="audit-td td-patient">
                          {log.patientName || '-'}
                        </td>
                        <td className="audit-td td-details">
                          {log.details}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>

      <style jsx>{`
        /* ヘッダー & 整合性 */
        .audit-header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          padding: 0.85rem 0;
          margin-bottom: 1.2rem;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
        }
        .audit-integrity-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .audit-integrity-status {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-weight: 800;
          font-size: var(--fs-base);
        }
        .audit-integrity-status.is-valid {
          color: #15803d;
        }
        .audit-integrity-status.is-invalid {
          color: #b91c1c;
        }
        .audit-integrity-count {
          color: var(--text-muted);
          font-size: var(--fs-md);
        }
        .audit-latest-hash {
          color: var(--text-ghost);
          font-size: var(--fs-sm);
          font-family: monospace;
        }
        .audit-integrity-note {
          color: var(--text-muted);
          font-size: var(--fs-sm);
        }
        .audit-header-actions {
          display: flex;
          gap: 0.55rem;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .btn-audit-export {
          padding: 0.55rem 0.85rem;
          font-size: var(--fs-md);
        }

        /* 監査ログ保全月次棚卸 */
        .audit-retention-section {
          padding: 0 0 1.2rem;
          margin-bottom: 1.2rem;
          border-bottom: 1px solid var(--border);
        }
        .retention-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 0.85rem;
        }
        .retention-title {
          margin: 0;
          font-size: 1rem;
          color: var(--text-main);
        }
        .retention-subtitle {
          margin: 0.2rem 0 0;
          color: var(--text-muted);
          font-size: var(--fs-md);
        }
        .retention-header-actions {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          flex-wrap: wrap;
        }
        .retention-status-badge,
        .retention-manager-badge {
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 999px;
          padding: 0.18rem 0.65rem;
          font-size: var(--fs-sm);
          font-weight: 800;
        }
        .retention-status-badge.status-pass {
          color: #15803d;
          background: #f0fdf4;
          border-color: #86efac;
        }
        .retention-status-badge.status-attention {
          color: #b45309;
          background: #fffbeb;
          border-color: #fcd34d;
        }
        .retention-status-badge.status-blocked {
          color: #b91c1c;
          background: #fef2f2;
          border-color: #fca5a5;
        }
        .retention-manager-badge.status-confirmed,
        .retention-manager-badge.status-pass {
          color: #15803d;
          background: #f0fdf4;
          border-color: #86efac;
        }
        .retention-manager-badge.status-unreviewed,
        .retention-manager-badge.status-attention {
          color: #b45309;
          background: #fffbeb;
          border-color: #fcd34d;
        }
        .retention-manager-badge.status-blocked {
          color: #b91c1c;
          background: #fef2f2;
          border-color: #fca5a5;
        }
        .btn-retention-action {
          padding: 0.45rem 0.7rem;
          font-size: var(--fs-sm);
        }
        .retention-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 0.75rem;
          margin-bottom: 0.85rem;
        }
        .retention-kpi-item {
          border-left: 3px solid var(--primary);
          padding: 0.2rem 0 0.2rem 0.65rem;
        }
        .retention-kpi-label {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 700;
        }
        .retention-kpi-value {
          color: var(--text-main);
          font-size: 1.02rem;
          font-weight: 800;
        }
        .retention-kpi-value.is-returned {
          color: #b91c1c;
        }
        .retention-kpi-value.status-confirmed,
        .retention-kpi-value.status-pass {
          color: #15803d;
        }
        .retention-kpi-value.status-unreviewed,
        .retention-kpi-value.status-attention {
          color: #b45309;
        }
        .retention-summary-footer {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.8rem;
          color: var(--text-muted);
          font-size: var(--fs-sm);
        }
        .retention-footer-label {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 800;
        }
        .retention-footer-val {
          color: var(--text-main);
          font-weight: 700;
          word-break: break-all;
        }
        .retention-footer-val.is-returned {
          color: #b91c1c;
        }

        /* AI補助フィードバック月次レビュー */
        .ai-feedback-section {
          padding: 0 0 1.2rem;
          margin-bottom: 1.2rem;
          border-bottom: 1px solid var(--border);
        }
        .ai-feedback-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 0.85rem;
        }
        .ai-feedback-title {
          margin: 0;
          font-size: 1rem;
          color: var(--text-main);
        }
        .ai-feedback-subtitle {
          margin: 0.2rem 0 0;
          color: var(--text-muted);
          fontSize: var(--fs-md);
        }
        .ai-feedback-header-actions {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          flex-wrap: wrap;
        }
        .ai-quality-gate-badge,
        .ai-feedback-status-badge {
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 8px;
          padding: 0.18rem 0.65rem;
          font-size: var(--fs-sm);
          font-weight: 800;
        }
        .ai-quality-gate-badge.status-pass,
        .ai-feedback-status-badge.status-pass {
          color: #15803d;
          background: #f0fdf4;
          border-color: #86efac;
        }
        .ai-quality-gate-badge.status-attention,
        .ai-feedback-status-badge.status-attention {
          color: #b45309;
          background: #fffbeb;
          border-color: #fcd34d;
        }
        .ai-quality-gate-badge.status-blocked,
        .ai-feedback-status-badge.status-blocked {
          color: #b91c1c;
          background: #fef2f2;
          border-color: #fca5a5;
        }
        .btn-ai-feedback-action {
          padding: 0.45rem 0.7rem;
          font-size: var(--fs-sm);
        }
        .ai-quality-gate-panel {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.85rem;
          margin-bottom: 0.85rem;
        }
        .ai-quality-gate-panel.status-pass {
          border-left: 4px solid #15803d;
          background: #f0fdf4;
        }
        .ai-quality-gate-panel.status-attention {
          border-left: 4px solid #b45309;
          background: #fffbeb;
        }
        .ai-quality-gate-panel.status-blocked {
          border-left: 4px solid #b91c1c;
          background: #fef2f2;
        }
        .ai-quality-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 0.7rem;
          margin-bottom: 0.7rem;
        }
        .ai-quality-label {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 800;
        }
        .ai-quality-value {
          color: var(--text-main);
          font-size: var(--fs-base);
          font-weight: 800;
          overflow-wrap: anywhere;
        }
        .ai-quality-reasons {
          font-size: var(--fs-sm);
          font-weight: 750;
          margin-bottom: 0.45rem;
        }
        .ai-quality-reasons.status-pass {
          color: #15803d;
        }
        .ai-quality-reasons.status-attention {
          color: #b45309;
        }
        .ai-quality-reasons.status-blocked {
          color: #b91c1c;
        }
        .ai-quality-actions {
          color: var(--text-main);
          font-size: var(--fs-sm);
          font-weight: 700;
          margin-bottom: 0.45rem;
        }
        .ai-quality-note {
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 650;
        }
        .ai-feedback-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 0.75rem;
          margin-bottom: 0.85rem;
        }
        .ai-feedback-kpi-item {
          border-left: 3px solid #7c3aed;
          padding: 0.2rem 0 0.2rem 0.65rem;
        }
        .ai-feedback-kpi-label {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 700;
        }
        .ai-feedback-kpi-value {
          color: var(--text-main);
          font-size: 1.02rem;
          font-weight: 800;
        }
        .ai-feedback-kpi-value.status-pass {
          color: #15803d;
        }
        .ai-feedback-kpi-value.status-attention {
          color: #b45309;
        }
        .ai-feedback-kpi-value.status-blocked {
          color: #b91c1c;
        }
        .ai-feedback-summary-footer {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.8rem;
          color: var(--text-muted);
          font-size: var(--fs-sm);
        }
        .ai-feedback-footer-label {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 800;
        }
        .ai-feedback-footer-val {
          color: var(--text-main);
          font-weight: 700;
        }
        .ai-feedback-footer-val.status-pass {
          color: #15803d;
        }
        .ai-feedback-footer-val.status-attention {
          color: #b45309;
        }
        .ai-feedback-footer-val.status-blocked {
          color: #b91c1c;
        }

        /* 日次締め月次レビュー */
        .daily-closing-section {
          padding: 0 0 1.2rem;
          margin-bottom: 1.2rem;
          border-bottom: 1px solid var(--border);
        }
        .closing-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 0.85rem;
        }
        .closing-title {
          margin: 0;
          font-size: 1rem;
          color: var(--text-main);
        }
        .closing-subtitle {
          margin: 0.2rem 0 0;
          color: var(--text-muted);
          font-size: var(--fs-md);
        }
        .closing-header-actions {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          flex-wrap: wrap;
        }
        .closing-status-badge {
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 999px;
          padding: 0.18rem 0.65rem;
          font-size: var(--fs-sm);
          font-weight: 800;
        }
        .closing-status-badge.has-blockers {
          color: #b45309;
          background: #fffbeb;
          border-color: #fcd34d;
        }
        .closing-status-badge.is-approved {
          color: #15803d;
          background: #f0fdf4;
          border-color: #86efac;
        }
        .closing-status-badge.is-empty {
          color: var(--text-muted);
          background: #f8fafc;
          border-color: var(--border);
        }
        .btn-closing-action {
          padding: 0.45rem 0.7rem;
          font-size: var(--fs-sm);
        }
        .closing-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 0.75rem;
          margin-bottom: 0.85rem;
        }
        .closing-kpi-item {
          border-left: 3px solid var(--primary);
          padding: 0.2rem 0 0.2rem 0.65rem;
        }
        .closing-kpi-label {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 700;
        }
        .closing-kpi-value {
          color: var(--text-main);
          font-size: 1.05rem;
          font-weight: 800;
        }
        .closing-field-kpis-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 0.75rem;
          margin-bottom: 0.85rem;
          padding: 0.75rem 0;
          border-top: 1px solid rgba(148, 163, 184, 0.25);
          border-bottom: 1px solid rgba(148, 163, 184, 0.25);
        }
        .closing-field-kpi-item {
          padding: 0.2rem 0 0.2rem 0.65rem;
          min-width: 0;
        }
        .closing-field-kpi-item.type-shortage { border-left: 3px solid #b45309; }
        .closing-field-kpi-item.type-receiving { border-left: 3px solid #2563eb; }
        .closing-field-kpi-item.type-followup { border-left: 3px solid #0f766e; }
        .closing-field-kpi-item.type-support { border-left: 3px solid #7c3aed; }
        .field-kpi-label {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 700;
        }
        .field-kpi-value {
          font-size: 1.05rem;
          font-weight: 800;
        }
        .field-kpi-value.type-shortage { color: #b45309; }
        .field-kpi-value.type-receiving { color: #2563eb; }
        .field-kpi-value.type-followup { color: #0f766e; }
        .field-kpi-value.type-support { color: #7c3aed; }

        /* 店舗別KPIベンチマーク */
        .store-benchmark-panel {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.85rem;
          margin-bottom: 0.85rem;
        }
        .store-benchmark-panel.status-pass {
          background: #f0fdf4;
          border-color: #86efac;
        }
        .store-benchmark-panel.status-attention {
          background: #fffbeb;
          border-color: #fcd34d;
        }
        .store-benchmark-panel.status-blocked {
          background: #fef2f2;
          border-color: #fca5a5;
        }
        .benchmark-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.7rem;
          flex-wrap: wrap;
          margin-bottom: 0.7rem;
        }
        .benchmark-title {
          color: var(--text-main);
          font-size: var(--fs-base);
          font-weight: 850;
        }
        .benchmark-subtitle {
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 700;
        }
        .benchmark-header-actions {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          flex-wrap: wrap;
        }
        .benchmark-status-badge {
          background: #ffffff;
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 999px;
          padding: 0.16rem 0.55rem;
          font-size: var(--fs-xs);
          font-weight: 800;
        }
        .benchmark-status-badge.status-pass { color: #15803d; border-color: #86efac; }
        .benchmark-status-badge.status-attention { color: #b45309; border-color: #fcd34d; }
        .benchmark-status-badge.status-blocked { color: #b91c1c; border-color: #fca5a5; }
        .btn-benchmark-export {
          padding: 0.35rem 0.55rem;
          font-size: var(--fs-xs);
        }
        .benchmark-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(106px, 1fr));
          gap: 0.65rem;
          margin-bottom: 0.7rem;
        }
        .benchmark-stat-label {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 800;
        }
        .benchmark-stat-value {
          color: var(--text-main);
          font-size: var(--fs-base);
          font-weight: 850;
        }
        .benchmark-table-wrapper {
          overflow-x: auto;
          margin-bottom: 0.7rem;
          padding: 0.55rem 0;
          border-top: 1px solid rgba(148, 163, 184, 0.28);
          border-bottom: 1px solid rgba(148, 163, 184, 0.28);
        }
        .benchmark-grid-table {
          display: grid;
          grid-template-columns: minmax(126px, 1.2fr) repeat(3, minmax(92px, 1fr));
          gap: 0.55rem;
          min-width: 430px;
          color: var(--text-muted);
          font-size: var(--fs-xs);
        }
        .table-col-header {
          color: var(--text-main);
        }
        .table-row-label {
          color: var(--text-main);
        }
        .table-cell-current {
          color: var(--text-main);
          font-weight: 800;
        }
        .benchmark-store-summaries {
          display: grid;
          gap: 0.4rem;
          margin-bottom: 0.65rem;
          color: var(--text-muted);
          font-size: var(--fs-sm);
        }
        .benchmark-store-row {
          display: grid;
          grid-template-columns: minmax(94px, 1fr) auto auto auto;
          gap: 0.55rem;
          align-items: center;
        }
        .benchmark-store-row .store-name {
          color: var(--text-main);
          font-weight: 800;
        }
        .benchmark-required-actions {
          font-size: var(--fs-sm);
          font-weight: 750;
        }
        .benchmark-required-actions.status-pass { color: #15803d; }
        .benchmark-required-actions.status-attention { color: #b45309; }
        .benchmark-required-actions.status-blocked { color: #b91c1c; }
        .benchmark-effect-section {
          border-top: 1px solid rgba(148, 163, 184, 0.28);
          margin-top: 0.65rem;
          padding-top: 0.65rem;
          display: grid;
          gap: 0.25rem;
        }
        .effect-title {
          color: var(--text-main);
          font-size: var(--fs-sm);
          font-weight: 850;
        }
        .effect-status {
          font-size: var(--fs-xs);
          font-weight: 750;
        }
        .effect-status.status-pass { color: #15803d; }
        .effect-status.status-attention { color: #b45309; }
        .effect-status.status-blocked { color: #b91c1c; }
        .effect-actions {
          color: var(--text-muted);
          font-size: var(--fs-xs);
          line-height: 1.5;
        }
        .benchmark-followup-section {
          border-top: 1px solid rgba(148, 163, 184, 0.28);
          margin-top: 0.65rem;
          padding-top: 0.65rem;
          display: grid;
          gap: 0.35rem;
        }
        .followup-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .followup-title {
          color: var(--text-main);
          font-size: var(--fs-sm);
          font-weight: 850;
        }
        .followup-status-badge {
          font-size: var(--fs-xs);
          font-weight: 850;
        }
        .followup-status-badge.status-pass { color: #15803d; }
        .followup-status-badge.status-attention { color: #b45309; }
        .followup-status-badge.status-blocked { color: #b91c1c; }
        .followup-counts {
          color: var(--text-muted);
          font-size: var(--fs-xs);
          line-height: 1.5;
        }
        .followup-line {
          font-size: var(--fs-xs);
          font-weight: 750;
          line-height: 1.5;
        }
        .followup-line.status-pass { color: #15803d; }
        .followup-line.status-attention { color: #b45309; }
        .followup-line.status-blocked { color: #b91c1c; }
        .followup-assignees {
          color: var(--text-muted);
          font-size: var(--fs-xs);
          line-height: 1.5;
        }
        .followup-list {
          display: grid;
          gap: 0.28rem;
        }
        .followup-item-row {
          display: flex;
          gap: 0.45rem;
          align-items: center;
          flex-wrap: wrap;
          color: var(--text-muted);
          font-size: var(--fs-xs);
        }
        .followup-item-row .item-title {
          color: var(--text-main);
          font-weight: 800;
        }
        .benchmark-templates-section {
          border-top: 1px solid rgba(148, 163, 184, 0.28);
          margin-top: 0.65rem;
          padding-top: 0.65rem;
        }
        .templates-title {
          color: var(--text-main);
          font-size: var(--fs-sm);
          font-weight: 850;
          margin-bottom: 0.45rem;
        }
        .templates-list {
          display: grid;
          gap: 0.55rem;
        }
        .template-card {
          display: grid;
          gap: 0.28rem;
          padding-left: 0.6rem;
        }
        .template-card.priority-high { border-left: 3px solid #b91c1c; }
        .template-card.priority-medium { border-left: 3px solid #b45309; }
        .template-card.priority-low { border-left: 3px solid #15803d; }
        .template-card-header {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          flex-wrap: wrap;
        }
        .template-name {
          color: var(--text-main);
          font-size: var(--fs-sm);
          font-weight: 850;
        }
        .priority-badge {
          font-size: var(--fs-2xs);
          font-weight: 850;
        }
        .priority-badge.priority-high { color: #b91c1c; }
        .priority-badge.priority-medium { color: #b45309; }
        .priority-badge.priority-low { color: #15803d; }
        .template-steps {
          color: var(--text-muted);
          font-size: var(--fs-xs);
          line-height: 1.55;
        }
        .template-outcome {
          font-size: var(--fs-xs);
          font-weight: 750;
        }
        .template-outcome.status-pass { color: #15803d; }
        .template-outcome.status-attention { color: #b45309; }
        .template-outcome.status-blocked { color: #b91c1c; }
        .template-followup-info {
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 750;
        }
        .template-actions {
          display: flex;
          gap: 0.4rem;
          flex-wrap: wrap;
        }
        .btn-template-action {
          padding: 0.32rem 0.55rem;
          font-size: var(--fs-xs);
        }

        /* 前月比較 */
        .comparison-grid-wrapper {
          display: grid;
          grid-template-columns: minmax(150px, 1.1fr) repeat(8, minmax(120px, 1fr));
          gap: 0.6rem;
          align-items: stretch;
          overflow-x: auto;
          padding: 0.65rem 0;
          margin-bottom: 0.85rem;
          border-top: 1px solid rgba(148, 163, 184, 0.25);
          border-bottom: 1px solid rgba(148, 163, 184, 0.25);
        }
        .comparison-main-box {
          min-width: 150px;
        }
        .comparison-main-label {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 700;
        }
        .comparison-status-badge {
          display: inline-flex;
          align-items: center;
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 999px;
          padding: 0.16rem 0.58rem;
          font-size: var(--fs-sm);
          font-weight: 800;
          margin-top: 0.2rem;
        }
        .comparison-status-badge.status-pass {
          color: #15803d;
          background: #f0fdf4;
          border-color: #86efac;
        }
        .comparison-status-badge.status-attention {
          color: #b45309;
          background: #fffbeb;
          border-color: #fcd34d;
        }
        .comparison-status-badge.status-blocked {
          color: #b91c1c;
          background: #fef2f2;
          border-color: #fca5a5;
        }
        .comparison-month-label {
          color: var(--text-muted);
          font-size: var(--fs-xs);
          margin-top: 0.25rem;
        }
        .comparison-metric-item {
          min-width: 120px;
          border-left: 3px solid rgba(37, 99, 235, 0.45);
          padding: 0.1rem 0 0.1rem 0.55rem;
        }
        .comparison-metric-label {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
          font-weight: 700;
        }
        .comparison-metric-val {
          font-size: var(--fs-base);
          font-weight: 800;
        }
        .comparison-metric-val.status-pass { color: #15803d; }
        .comparison-metric-val.status-attention { color: #b45309; }
        .comparison-metric-val.status-blocked { color: #b91c1c; }

        /* 複数月KPI比較 */
        .multimonth-section {
          margin-bottom: 0.95rem;
        }
        .multimonth-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
          margin-bottom: 0.45rem;
        }
        .multimonth-title {
          color: var(--text-main);
          font-size: var(--fs-md);
          font-weight: 800;
        }
        .multimonth-count {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
        }
        .multimonth-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(148px, 1fr));
          gap: 0.55rem;
          overflow-x: auto;
          padding: 0.15rem 0.05rem 0.35rem;
        }
        .multimonth-card {
          min-width: 148px;
          border: 1px solid rgba(148, 163, 184, 0.32);
          border-radius: 6px;
          padding: 0.55rem;
        }
        .multimonth-card.is-approved { background: #ffffff; }
        .multimonth-card.is-empty { background: #f8fafc; }
        .multimonth-card-header {
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 800;
        }
        .multimonth-bar-container {
          height: 58px;
          display: flex;
          align-items: flex-end;
          gap: 0.45rem;
          margin-top: 0.35rem;
        }
        .multimonth-bar {
          width: 18px;
          height: var(--bar-height, 6px);
          border-radius: 4px 4px 2px 2px;
          border: 1px solid rgba(15, 23, 42, 0.08);
        }
        .multimonth-bar.has-blockers { background: #b45309; }
        .multimonth-bar.is-pass { background: #15803d; }
        .multimonth-bar.is-default { background: #64748b; }
        .multimonth-rate {
          font-size: var(--fs-base);
          font-weight: 850;
        }
        .multimonth-rate.has-blockers { color: #b45309; }
        .multimonth-rate.is-pass { color: #15803d; }
        .multimonth-rate.is-default { color: #64748b; }
        .multimonth-days {
          color: var(--text-ghost);
          font-size: var(--fs-2xs);
        }
        .multimonth-sub-stats {
          display: flex;
          justify-content: space-between;
          gap: 0.45rem;
          margin-top: 0.4rem;
          color: var(--text-muted);
          font-size: var(--fs-2xs);
          font-weight: 700;
        }
        .multimonth-field-kpis {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.25rem;
          margin-top: 0.35rem;
          color: var(--text-muted);
          font-size: var(--fs-2xs);
          font-weight: 700;
        }

        /* 推移グラフ & 最近の承認 */
        .trend-section {
          margin-bottom: 0.95rem;
        }
        .trend-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
          margin-bottom: 0.45rem;
        }
        .trend-title {
          color: var(--text-main);
          font-size: var(--fs-md);
          font-weight: 800;
        }
        .trend-subtitle {
          color: var(--text-ghost);
          font-size: var(--fs-xs);
        }
        .trend-chart {
          display: flex;
          align-items: flex-end;
          gap: 0.45rem;
          overflow-x: auto;
          padding: 0.45rem 0.15rem 0.2rem;
        }
        .trend-bar-item {
          flex: 0 0 42px;
          min-height: 74px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          gap: 0.25rem;
        }
        .trend-bar-wrapper {
          height: 44px;
          display: flex;
          align-items: flex-end;
        }
        .trend-bar {
          width: 16px;
          height: var(--bar-height, 6px);
          border-radius: 4px 4px 2px 2px;
          border: 1px solid rgba(15, 23, 42, 0.08);
        }
        .trend-bar.has-blockers { background: #f59e0b; }
        .trend-bar.is-pass { background: #16a34a; }
        .trend-val {
          font-size: var(--fs-2xs);
          font-weight: 800;
        }
        .trend-val.has-blockers { color: #b45309; }
        .trend-val.is-pass { color: #15803d; }
        .trend-date {
          color: var(--text-ghost);
          font-size: var(--fs-2xs);
        }
        .recent-approvals-list {
          display: grid;
          gap: 0.45rem;
        }
        .recent-approvals-empty {
          color: var(--text-muted);
          font-size: var(--fs-md);
        }
        .recent-approval-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          align-items: center;
          padding: 0.45rem 0;
          border-top: 1px solid rgba(148, 163, 184, 0.22);
          font-size: var(--fs-md);
        }
        .approval-date {
          font-weight: 700;
          color: var(--text-main);
          min-width: 7rem;
        }
        .approval-reviewer {
          color: var(--text-muted);
          flex: 1 1 9rem;
        }
        .approval-completion {
          color: var(--text-main);
          font-weight: 700;
        }
        .approval-blockers.has-blockers { color: #b45309; font-weight: 700; }
        .approval-blockers.is-pass { color: #15803d; font-weight: 700; }
        .approval-shortages.has-shortages { color: #b45309; font-weight: 700; }
        .approval-shortages.is-pass { color: #15803d; font-weight: 700; }
        .approval-receivings.has-receivings { color: #2563eb; font-weight: 700; }
        .approval-receivings.is-muted { color: var(--text-muted); font-weight: 700; }
        .approval-followups.has-followups { color: #b45309; font-weight: 700; }
        .approval-followups.is-pass { color: #15803d; font-weight: 700; }
        .approval-support.has-support { color: #7c3aed; font-weight: 700; }
        .approval-support.is-muted { color: var(--text-muted); font-weight: 700; }

        /* フィルター & 監査証跡一覧テーブル */
        .audit-filter-bar {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
          align-items: center;
        }
        .filter-field-user {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          flex: 1;
        }
        .filter-field-action {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          width: 200px;
        }
        .filter-label {
          font-size: var(--fs-sm);
          font-weight: 600;
        }
        .input-filter-user {
          padding: 0.5rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: var(--fs-base);
        }
        .select-filter-action {
          padding: 0.5rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: white;
          font-size: var(--fs-base);
        }
        .audit-table-wrapper {
          max-height: 500px;
          overflow-y: auto;
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        .audit-data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: var(--fs-md);
        }
        .audit-table-head-row {
          text-align: left;
          border-bottom: 2px solid var(--border);
          background: var(--bg-muted);
        }
        .audit-th {
          padding: 0.75rem;
        }
        .audit-empty-td {
          padding: 2rem;
          text-align: center;
          color: var(--text-ghost);
        }
        .audit-log-row {
          border-bottom: 1px solid var(--border);
        }
        .audit-td {
          padding: 0.75rem;
        }
        .td-time {
          white-space: nowrap;
          color: var(--text-main);
        }
        .td-user {
          font-weight: 600;
          color: var(--text-main);
        }
        .audit-role-badge {
          font-size: var(--fs-xs);
          color: var(--text-ghost);
          margin-left: 0.25rem;
        }
        .td-patient {
          font-weight: 500;
          color: var(--text-main);
        }
        .td-details {
          color: var(--text-main);
        }
        .audit-action-badge {
          padding: 2px 6px;
          border-radius: 4px;
          color: white;
          font-size: var(--fs-xs);
          font-weight: 600;
          background: #64748b;
        }
        .audit-action-badge.action-prescription_ocr { background: #2563eb; }
        .audit-action-badge.action-prescription_edit { background: #16a34a; }
        .audit-action-badge.action-billing_toggle { background: #d97706; }
        .audit-action-badge.action-claim_lifecycle { background: #be123c; }
        .audit-action-badge.action-daily_closing_approval { background: #047857; }
        .audit-action-badge.action-daily_closing_kpi_action { background: #0f766e; }
        .audit-action-badge.action-session_lock { background: #475569; }
        .audit-action-badge.action-print { background: #7c3aed; }
        .audit-action-badge.action-uke_export { background: #db2777; }
        .audit-action-badge.action-stock_update { background: #0891b2; }
        .audit-action-badge.action-user_switch { background: #4b5563; }
        .audit-action-badge.action-facility_settings_update { background: #9333ea; }
        .audit-action-badge.action-drug_master_update { background: #0e7490; }
        .audit-action-badge.action-patient_medication_info_template { background: #047857; }
        .audit-action-badge.action-follow_up_record { background: #0f766e; }
        .audit-action-badge.action-ai_suggestion_review { background: #7c3aed; }
        .audit-action-badge.action-staff_create { background: #15803d; }
        .audit-action-badge.action-staff_delete { background: #b91c1c; }
        .audit-action-badge.action-staff_credential_recovery { background: #c2410c; }
        .audit-action-badge.action-passkey_register { background: #1d4ed8; }
        .audit-action-badge.action-audit_export { background: #0369a1; }
        .audit-action-badge.action-audit_retention_approval { background: #15803d; }
        .audit-action-badge.action-backup_export { background: #0f766e; }
        .audit-action-badge.action-backup_schedule_update { background: #4f46e5; }
        .audit-action-badge.action-backup_external_storage { background: #047857; }
        .audit-action-badge.action-backup_drill { background: #2563eb; }
        .audit-action-badge.action-backup_import { background: #b45309; }
        .audit-action-badge.action-official_spec_review { background: #0369a1; }
      `}</style>
    </div>
  );
}
