import { test } from 'node:test';
import assert from 'node:assert';
import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
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
} from './audit_settings_helpers.ts';
import type { AuditIntegrityReport, AuditLogRetentionMonthlyReview } from './audit_integrity.ts';

test('auditActionLabel resolves known action types to Japanese labels and falls back to actionType', () => {
  assert.strictEqual(auditActionLabel('login'), 'ログイン');
  assert.strictEqual(auditActionLabel('prescription_edit'), '薬歴完了・変更');
  assert.strictEqual(auditActionLabel('audit_export'), '監査ログ書出');
  assert.strictEqual(auditActionLabel('official_spec_review'), '公式仕様点検');
  assert.strictEqual(auditActionLabel('custom_unknown_action' as any), 'custom_unknown_action');
});

test('getAuditIntegrityStatus reports checking, unverified, invalid, unsigned, and valid statuses', () => {
  // 1. isChecking = true
  const checkingInfo = getAuditIntegrityStatus(null, true);
  assert.strictEqual(checkingInfo.status, '検証中');
  assert.strictEqual(checkingInfo.color, '#64748b');

  // 2. report = null
  const nullInfo = getAuditIntegrityStatus(null, false);
  assert.strictEqual(nullInfo.status, '未検証');
  assert.strictEqual(nullInfo.color, '#64748b');
  assert.strictEqual(nullInfo.latestHashPreview, '-');

  // 3. invalid report
  const invalidReport: AuditIntegrityReport = {
    isValid: false,
    total: 10,
    signed: 8,
    unsigned: 0,
    invalid: 2,
    latestHash: 'abcdef0123456789abcdef0123456789'
  };
  const invalidInfo = getAuditIntegrityStatus(invalidReport, false);
  assert.strictEqual(invalidInfo.status, '要確認');
  assert.strictEqual(invalidInfo.color, '#b91c1c');

  // 4. unsigned report
  const unsignedReport: AuditIntegrityReport = {
    isValid: true,
    total: 10,
    signed: 7,
    unsigned: 3,
    invalid: 0,
    latestHash: '1234567890abcdef1234567890abcdef'
  };
  const unsignedInfo = getAuditIntegrityStatus(unsignedReport, false);
  assert.strictEqual(unsignedInfo.status, '未署名あり');
  assert.strictEqual(unsignedInfo.color, '#b45309');

  // 5. fully valid report
  const validReport: AuditIntegrityReport = {
    isValid: true,
    total: 10,
    signed: 10,
    unsigned: 0,
    invalid: 0,
    latestHash: '9876543210fedcba9876543210fedcba'
  };
  const validInfo = getAuditIntegrityStatus(validReport, false);
  assert.strictEqual(validInfo.status, '正常');
  assert.strictEqual(validInfo.color, '#15803d');
  assert.strictEqual(validInfo.latestHashPreview, '9876543210fe...10fedcba');
});

test('getAuditRetentionColors returns appropriate colors and button labels based on review state', () => {
  const completeReview: AuditLogRetentionMonthlyReview = {
    monthKey: '2026-08',
    monthLabel: '2026年08月',
    generatedAt: '2026-08-22T00:00:00.000Z',
    status: 'complete',
    statusLabel: '保全完了',
    actionLabel: '保全完了',
    auditJsonExportCount: 2,
    retentionLedgerExportCount: 2,
    returnReasons: [],
    requiredActions: [],
    managerReviewStatus: 'approved',
    managerReviewLabel: '承認済み',
    managerReviewRequiredActions: [],
    latestAuditJsonExport: {
      logId: 'audit-log-1',
      timestamp: '2026-08-20T10:00:00.000Z',
      kind: 'audit_json',
      dateLabel: '2026/08/20',
      fileName: 'audit_log_20260820.json'
    }
  };
  const completeColors = getAuditRetentionColors(completeReview);
  assert.strictEqual(completeColors.reviewColor, '#15803d');
  assert.strictEqual(completeColors.managerColor, '#15803d');
  assert.strictEqual(completeColors.managerButtonLabel, '責任者承認');
  assert.strictEqual(completeColors.latestRetentionJsonLabel, '2026/08/20 audit_log_20260820.json');

  const rejectedReview: AuditLogRetentionMonthlyReview = {
    ...completeReview,
    status: 'rejected',
    statusLabel: '保全差し戻し',
    managerReviewStatus: 'returned',
    returnReasons: ['未保存の監査ログあり']
  };
  const rejectedColors = getAuditRetentionColors(rejectedReview);
  assert.strictEqual(rejectedColors.reviewColor, '#b91c1c');
  assert.strictEqual(rejectedColors.managerColor, '#b91c1c');
  assert.strictEqual(rejectedColors.managerButtonLabel, '差し戻し記録');
});

test('file name generators produce predictable timestamped / monthKey filenames', () => {
  const fixedDate = new Date(2026, 7, 22, 10, 30, 45); // 2026-08-22 10:30:45
  assert.strictEqual(makeAuditLogExportFileName(fixedDate), 'yakureki_audit_logs_20260822_103045.json');
  assert.strictEqual(makeAuditLogRetentionLedgerCsvFileName(fixedDate), 'yakureki_audit_retention_ledger_20260822_103045.csv');
  assert.strictEqual(makeAuditLogRetentionMonthlyReviewCsvFileName('2026-08'), 'yakureki_audit_retention_monthly_review_202608.csv');
  assert.strictEqual(makeDailyClosingReviewCsvFileName('2026-08'), 'yakureki_daily_closing_review_202608.csv');
  assert.strictEqual(makeDailyClosingStoreBenchmarkBiExportFileName('2026-08'), 'yakureki_daily_closing_store_benchmark_202608.json');
  assert.strictEqual(makeAiSuggestionFeedbackReviewCsvFileName('2026-08'), 'yakureki_ai_feedback_review_202608.csv');
  assert.strictEqual(makeAiSuggestionFeedbackBiExportFileName('2026-08'), 'yakureki_ai_feedback_bi_202608.json');
});

test('getDailyClosingReviewDisplay formats approval counts, blocker status, comparison, and benchmarks', () => {
  // 1. 未記録 (approvalCount = 0)
  const emptyReview = {
    approvalCount: 0,
    daysWithBlockers: 0,
    latestApproval: null,
    previousMonthComparison: { status: 'no_data' as const },
    storeBenchmark: { status: 'single_store' as const }
  };
  const emptyDisplay = getDailyClosingReviewDisplay(emptyReview as any);
  assert.strictEqual(emptyDisplay.status, '未記録');
  assert.strictEqual(emptyDisplay.color, '#64748b');
  assert.strictEqual(emptyDisplay.latestClosingHashPreview, '-');
  assert.strictEqual(emptyDisplay.comparisonColor, '#64748b');
  assert.strictEqual(emptyDisplay.storeBenchmarkColor, '#64748b');

  // 2. 要フォロー (daysWithBlockers > 0)
  const blockerReview = {
    approvalCount: 20,
    daysWithBlockers: 3,
    latestApproval: { integrityHash: 'abcdef0123456789abcdef0123456789' },
    previousMonthComparison: { status: 'attention' as const },
    storeBenchmark: { status: 'needs_attention' as const }
  };
  const blockerDisplay = getDailyClosingReviewDisplay(blockerReview as any);
  assert.strictEqual(blockerDisplay.status, '要フォロー');
  assert.strictEqual(blockerDisplay.color, '#b45309');
  assert.strictEqual(blockerDisplay.latestClosingHashPreview, 'abcdef0123...456789');
  assert.strictEqual(blockerDisplay.comparisonColor, '#b45309');
  assert.strictEqual(blockerDisplay.storeBenchmarkColor, '#b45309');

  // 3. 良好 (daysWithBlockers = 0, improved, leading)
  const goodReview = {
    approvalCount: 25,
    daysWithBlockers: 0,
    latestApproval: { integrityHash: '1234567890abcdef1234567890abcdef' },
    previousMonthComparison: { status: 'improved' as const },
    storeBenchmark: { status: 'leading' as const }
  };
  const goodDisplay = getDailyClosingReviewDisplay(goodReview as any);
  assert.strictEqual(goodDisplay.status, '良好');
  assert.strictEqual(goodDisplay.color, '#15803d');
  assert.strictEqual(goodDisplay.comparisonColor, '#15803d');
  assert.strictEqual(goodDisplay.storeBenchmarkColor, '#15803d');
});

test('getAiSuggestionFeedbackDisplay formats status, quality gates, and store comparisons', () => {
  // 1. ready / continue / leading
  const readyReview = {
    status: 'ready' as const,
    qualityGate: { status: 'continue' as const },
    soapDraftSummary: { status: 'ready' as const },
    storeComparison: { status: 'leading' as const }
  };
  const readyDisplay = getAiSuggestionFeedbackDisplay(readyReview as any);
  assert.strictEqual(readyDisplay.color, '#15803d');
  assert.strictEqual(readyDisplay.background, '#f0fdf4');
  assert.strictEqual(readyDisplay.qualityGateColor, '#15803d');
  assert.strictEqual(readyDisplay.soapDraftColor, '#15803d');
  assert.strictEqual(readyDisplay.storeColor, '#15803d');

  // 2. needs_feedback / stop / needs_review / needs_attention
  const attentionReview = {
    status: 'needs_feedback' as const,
    qualityGate: { status: 'stop' as const },
    soapDraftSummary: { status: 'needs_review' as const },
    storeComparison: { status: 'needs_attention' as const }
  };
  const attentionDisplay = getAiSuggestionFeedbackDisplay(attentionReview as any);
  assert.strictEqual(attentionDisplay.color, '#b45309');
  assert.strictEqual(attentionDisplay.qualityGateColor, '#b91c1c');
  assert.strictEqual(attentionDisplay.soapDraftColor, '#b45309');
  assert.strictEqual(attentionDisplay.storeColor, '#b45309');
});
