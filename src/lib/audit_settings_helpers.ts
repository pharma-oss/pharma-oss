import type { AuditLog } from '../db/types.ts';
import type { AuditIntegrityReport, AuditLogRetentionMonthlyReview } from './audit_integrity.ts';
import type { OperationalClosingMonthlyReview } from './operational_closing_review.ts';
import type { AiSuggestionFeedbackMonthlyReview } from './ai_suggestion_feedback.ts';

export const AUDIT_ACTION_LABELS: Record<AuditLog['actionType'], string> = {
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
  ai_draft_approved: 'AI下書き承認',
  ai_draft_modified: 'AI下書き修正',
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
  official_spec_review: '公式仕様点検',
  claim_points_review: '請求点数の変動点検'
};

export function auditActionLabel(actionType: AuditLog['actionType']): string {
  return AUDIT_ACTION_LABELS[actionType] || actionType;
}

export function formatDateTimeStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

export function makeAuditLogExportFileName(date = new Date()): string {
  return `yakureki_audit_logs_${formatDateTimeStamp(date)}.json`;
}

export function makeAuditLogRetentionLedgerCsvFileName(date = new Date()): string {
  return `yakureki_audit_retention_ledger_${formatDateTimeStamp(date)}.csv`;
}

export function makeAuditLogRetentionMonthlyReviewCsvFileName(monthKey: string): string {
  return `yakureki_audit_retention_monthly_review_${monthKey.replace('-', '')}.csv`;
}

export function makeDailyClosingReviewCsvFileName(monthKey: string): string {
  return `yakureki_daily_closing_review_${monthKey.replace('-', '')}.csv`;
}

export function makeDailyClosingStoreBenchmarkBiExportFileName(monthKey: string): string {
  return `yakureki_daily_closing_store_benchmark_${monthKey.replace('-', '')}.json`;
}

export function makeAiSuggestionFeedbackReviewCsvFileName(monthKey: string): string {
  return `yakureki_ai_feedback_review_${monthKey.replace('-', '')}.csv`;
}

export function makeAiSuggestionFeedbackBiExportFileName(monthKey: string): string {
  return `yakureki_ai_feedback_bi_${monthKey.replace('-', '')}.json`;
}

export function getAuditIntegrityStatus(report: AuditIntegrityReport | null, isChecking: boolean): { status: string; color: string; latestHashPreview: string } {
  const status = isChecking
    ? '検証中'
    : report?.invalid
      ? '要確認'
      : report?.unsigned
        ? '未署名あり'
        : report
          ? '正常'
          : '未検証';
  const color = report?.invalid
    ? '#b91c1c'
    : report?.unsigned
      ? '#b45309'
      : report
        ? '#15803d'
        : '#64748b';
  const latestHashPreview = report?.latestHash
    ? `${report.latestHash.slice(0, 12)}...${report.latestHash.slice(-8)}`
    : '-';
  return { status, color, latestHashPreview };
}

export function getAuditRetentionColors(review: AuditLogRetentionMonthlyReview) {
  const reviewColor = review.status === 'complete'
    ? '#15803d'
    : review.status === 'rejected'
      ? '#b91c1c'
      : '#b45309';
  const reviewBackground = review.status === 'complete'
    ? '#f0fdf4'
    : review.status === 'rejected'
      ? '#fef2f2'
      : '#fffbeb';
  const managerColor = review.managerReviewStatus === 'approved'
    ? '#15803d'
    : review.managerReviewStatus === 'returned'
      ? '#b91c1c'
      : '#b45309';
  const managerBackground = review.managerReviewStatus === 'approved'
    ? '#f0fdf4'
    : review.managerReviewStatus === 'returned'
      ? '#fef2f2'
      : '#fffbeb';
  const managerButtonLabel = review.status === 'complete' && review.returnReasons.length === 0
    ? '責任者承認'
    : '差し戻し記録';
  const latestRetentionJsonLabel = review.latestAuditJsonExport
    ? `${review.latestAuditJsonExport.dateLabel} ${review.latestAuditJsonExport.fileName || 'ファイル名未記録'}`
    : '未出力';
  const latestRetentionLedgerLabel = review.latestRetentionLedgerExport
    ? `${review.latestRetentionLedgerExport.dateLabel} ${review.latestRetentionLedgerExport.fileName || 'ファイル名未記録'}`
    : '未出力';

  return {
    reviewColor,
    reviewBackground,
    managerColor,
    managerBackground,
    managerButtonLabel,
    latestRetentionJsonLabel,
    latestRetentionLedgerLabel
  };
}

export function getDailyClosingReviewDisplay(review: OperationalClosingMonthlyReview) {
  const status = review.approvalCount === 0
    ? '未記録'
    : review.daysWithBlockers > 0
      ? '要フォロー'
      : '良好';
  const color = review.approvalCount === 0
    ? '#64748b'
    : review.daysWithBlockers > 0
      ? '#b45309'
      : '#15803d';
  const latestClosingHashPreview = review.latestApproval?.integrityHash
    ? `${review.latestApproval.integrityHash.slice(0, 10)}...${review.latestApproval.integrityHash.slice(-6)}`
    : '-';
  const comparison = review.previousMonthComparison;
  const comparisonColor = comparison.status === 'improved'
    ? '#15803d'
    : comparison.status === 'attention'
      ? '#b45309'
      : comparison.status === 'flat'
        ? '#475569'
        : '#64748b';
  const comparisonBackground = comparison.status === 'improved'
    ? '#f0fdf4'
    : comparison.status === 'attention'
      ? '#fffbeb'
      : '#f8fafc';
  const storeBenchmarkColor = review.storeBenchmark.status === 'leading'
    ? '#15803d'
    : review.storeBenchmark.status === 'needs_attention'
      ? '#b45309'
      : '#64748b';
  const storeBenchmarkBackground = review.storeBenchmark.status === 'leading'
    ? '#f0fdf4'
    : review.storeBenchmark.status === 'needs_attention'
      ? '#fffbeb'
      : '#f8fafc';

  return {
    status,
    color,
    latestClosingHashPreview,
    comparisonColor,
    comparisonBackground,
    storeBenchmarkColor,
    storeBenchmarkBackground
  };
}

export function getAiSuggestionFeedbackDisplay(review: AiSuggestionFeedbackMonthlyReview) {
  const color = review.status === 'ready'
    ? '#15803d'
    : review.status === 'needs_feedback'
      ? '#b45309'
      : '#64748b';
  const background = review.status === 'ready'
    ? '#f0fdf4'
    : review.status === 'needs_feedback'
      ? '#fffbeb'
      : '#f8fafc';
  const qualityGateColor = review.qualityGate.status === 'continue'
    ? '#15803d'
    : review.qualityGate.status === 'stop'
      ? '#b91c1c'
      : '#b45309';
  const qualityGateBackground = review.qualityGate.status === 'continue'
    ? '#f0fdf4'
    : review.qualityGate.status === 'stop'
      ? '#fef2f2'
      : '#fffbeb';
  const soapDraftColor = review.soapDraftSummary.status === 'ready'
    ? '#15803d'
    : review.soapDraftSummary.status === 'needs_review'
      ? '#b45309'
      : '#64748b';
  const soapDraftBackground = review.soapDraftSummary.status === 'ready'
    ? '#f0fdf4'
    : review.soapDraftSummary.status === 'needs_review'
      ? '#fffbeb'
      : '#f8fafc';
  const storeColor = review.storeComparison.status === 'leading'
    ? '#15803d'
    : review.storeComparison.status === 'needs_attention'
      ? '#b45309'
      : '#64748b';
  const storeBackground = review.storeComparison.status === 'leading'
    ? '#f0fdf4'
    : review.storeComparison.status === 'needs_attention'
      ? '#fffbeb'
      : '#f8fafc';

  return {
    color,
    background,
    qualityGateColor,
    qualityGateBackground,
    soapDraftColor,
    soapDraftBackground,
    storeColor,
    storeBackground
  };
}
