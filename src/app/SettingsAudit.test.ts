import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AuditSettingsTab from '@/components/settings/AuditSettingsTab';
import BackupSettingsTab from '@/components/settings/BackupSettingsTab';
import DrugMasterSettingsTab from '@/components/settings/DrugMasterSettingsTab';
import ExternalConnectorSettingsTab from '@/components/settings/ExternalConnectorSettingsTab';
import FacilitySettingsTab from '@/components/settings/FacilitySettingsTab';
import MedicationInfoTemplateSettingsTab from '@/components/settings/MedicationInfoTemplateSettingsTab';
import OfficialAuditSettingsTab from '@/components/settings/OfficialAuditSettingsTab';
import StaffSettingsTab from '@/components/settings/StaffSettingsTab';
import type { User, AuditLog } from '@/db/types';
import {
  buildAuditLogRetentionMonthlyReview,
  type AuditIntegrityReport
} from '@/lib/audit_integrity';
import { buildOperationalClosingMonthlyReview } from '@/lib/operational_closing_review';
import { buildAiSuggestionFeedbackMonthlyReview } from '@/lib/ai_suggestion_feedback';

function createMockAuditSettingsProps(overrides: Record<string, unknown> = {}) {
  const dummyUser: User = {
    userId: 'user-admin-1',
    name: '管理者 太郎',
    role: 'admin'
  };

  const sampleLog: AuditLog = {
    logId: 'audit-log-1',
    timestamp: '2026-10-06T10:00:00Z',
    userId: 'user-admin-1',
    userName: '管理者 太郎',
    userRole: 'admin',
    actionType: 'login',
    details: '管理者がシステムにログインしました',
    terminalId: 'term-hub-01'
  };

  const dummyIntegrity: AuditIntegrityReport = {
    total: 1,
    signed: 1,
    unsigned: 0,
    invalid: 0,
    isValid: true,
    latestHash: 'hash-abc-123'
  };

  const basisDate = new Date('2026-10-06T12:00:00Z');
  const dummyRetentionReview = buildAuditLogRetentionMonthlyReview(
    [sampleLog],
    dummyIntegrity,
    basisDate
  );

  const dummyDailyClosingReview = buildOperationalClosingMonthlyReview(
    [sampleLog],
    basisDate
  );

  const dummyAiFeedbackReview = buildAiSuggestionFeedbackMonthlyReview(
    [sampleLog],
    basisDate
  );

  return {
    currentUser: dummyUser,
    canViewAuditLogs: true,
    canManageFacility: true,
    canApproveDailyClosing: true,
    auditLogs: [sampleLog],
    auditIntegrity: dummyIntegrity,
    isCheckingAuditIntegrity: false,
    auditIntegrityStatus: '正常（改ざん未検知）',
    auditIntegrityColor: 'var(--success)',
    latestAuditHashPreview: 'hash-abc-123...',
    handleExportAuditLogs: async () => {},
    isExportingAuditLogs: false,
    handleExportAnonymousDiagnostic: async () => {},
    isExportingAnonymousDiagnostic: false,
    handleExportAuditRetentionLedgerCsv: async () => {},
    isExportingAuditRetentionLedger: false,
    auditRetentionReview: dummyRetentionReview,
    auditRetentionReviewColor: 'var(--success)',
    auditRetentionReviewBackground: '#f0fdf4',
    auditRetentionManagerReviewColor: 'var(--success)',
    auditRetentionManagerReviewBackground: '#f0fdf4',
    handleRecordAuditRetentionManagerReview: async () => {},
    isRecordingAuditRetentionManagerReview: false,
    auditRetentionManagerReviewButtonLabel: '責任者月次確認を記録',
    handleExportAuditRetentionMonthlyReviewCsv: async () => {},
    isExportingAuditRetentionReview: false,
    latestRetentionJsonLabel: '最新WORM保全済み',
    latestRetentionLedgerLabel: '最新保全台帳記録済み',
    aiSuggestionFeedbackReview: dummyAiFeedbackReview,
    aiSuggestionQualityGateColor: 'var(--success)',
    aiSuggestionQualityGateBackground: '#f0fdf4',
    aiSuggestionFeedbackColor: 'var(--success)',
    aiSuggestionFeedbackBackground: '#f0fdf4',
    handleExportAiSuggestionFeedbackReviewCsv: async () => {},
    isExportingAiSuggestionFeedbackReview: false,
    handleExportAiSuggestionFeedbackBiJson: async () => {},
    isExportingAiSuggestionFeedbackBi: false,
    handleApplyAiQualityRecommendation: async () => {},
    isApplyingAiQualityMode: false,
    dailyClosingReview: dummyDailyClosingReview,
    latestClosingHashPreview: 'closing-hash-123...',
    dailyClosingReviewColor: 'var(--success)',
    dailyClosingReviewStatus: '日次締め完了',
    handleExportDailyClosingReviewCsv: async () => {},
    isExportingDailyClosingReview: false,
    dailyClosingStoreBenchmarkBackground: '#f0fdf4',
    dailyClosingStoreBenchmarkColor: 'var(--success)',
    handleExportDailyClosingStoreBenchmarkJson: async () => {},
    isExportingDailyClosingStoreBenchmark: false,
    recordingDailyClosingKpiActionId: null,
    handleRecordDailyClosingKpiAction: async () => {},
    postponingDailyClosingKpiActionId: null,
    handlePostponeDailyClosingKpiAction: async () => {},
    dailyClosingComparisonColor: 'var(--success)',
    dailyClosingComparisonBackground: '#f0fdf4',
    dailyClosingComparison: null,
    filterUser: '',
    setFilterUser: () => {},
    filterAction: '',
    setFilterAction: () => {},
    ...overrides
  };
}

describe('Settings component export contracts', () => {
  it('exports all settings tabs as callable React component functions', () => {
    assert.equal(typeof AuditSettingsTab, 'function');
    assert.equal(typeof BackupSettingsTab, 'function');
    assert.equal(typeof DrugMasterSettingsTab, 'function');
    assert.equal(typeof ExternalConnectorSettingsTab, 'function');
    assert.equal(typeof FacilitySettingsTab, 'function');
    assert.equal(typeof MedicationInfoTemplateSettingsTab, 'function');
    assert.equal(typeof OfficialAuditSettingsTab, 'function');
    assert.equal(typeof StaffSettingsTab, 'function');
  });
});

describe('AuditSettingsTab renderToStaticMarkup contracts', () => {
  it('renders audit log sections, integrity badges, and export buttons when permitted', () => {
    const props = createMockAuditSettingsProps();
    const html = renderToStaticMarkup(React.createElement(AuditSettingsTab, props as any));

    assert.ok(html.includes('操作ログ・監査ログ（監査証跡）'), 'Should render audit header');
    assert.ok(html.includes('監査ログ整合性: 正常（改ざん未検知）'), 'Should render integrity status text');
    assert.ok(html.includes('最新 hash-abc-123...'), 'Should render latest hash preview');
    assert.ok(html.includes('監査ログJSON'), 'Should render audit JSON export button');
    assert.ok(html.includes('data-testid="anonymous-diagnostic-export-button"'), 'Should render diagnostic export button');
    assert.ok(html.includes('保全台帳CSV'), 'Should render retention ledger button');
    assert.ok(html.includes('監査ログ保全月次棚卸'), 'Should render monthly retention review section');
  });

  it('blocks export buttons and displays permission notice when canViewAuditLogs is false', () => {
    const clerkUser: User = {
      userId: 'user-clerk-2',
      name: '事務 次郎',
      role: 'clerk'
    };
    const props = createMockAuditSettingsProps({
      currentUser: clerkUser,
      canViewAuditLogs: false
    });
    const html = renderToStaticMarkup(React.createElement(AuditSettingsTab, props as any));

    // Export buttons should be disabled and title should contain permission denied message
    assert.ok(html.includes('disabled=""'), 'Action buttons should be disabled');
    assert.ok(html.includes('事務 次郎（事務）には「監査ログ閲覧」の権限がありません'), 'Permission denied notice should be rendered');
  });
});
