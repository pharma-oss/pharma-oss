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

import { buildClaimPointsDriftReview } from '@/lib/claim_points_drift';
import { buildDosageCategoryConflictReview } from '@/lib/dosage_category_conflict';

function createMockOfficialAuditSettingsProps(overrides: Record<string, unknown> = {}) {
  return {
    canViewOfficialAudit: true,
    claimPointsDrift: null,
    isReviewingClaimPointsDrift: false,
    handleReviewClaimPointsDrift: async () => {},
    handleExportClaimPointsDriftCsv: () => {},
    dosageCategoryConflict: null,
    isReviewingDosageCategoryConflict: false,
    handleReviewDosageCategoryConflict: async () => {},
    handleExportDosageCategoryConflictCsv: () => {},
    dispensingUkeSpecPdfText: '',
    setDispensingUkeSpecPdfText: () => {},
    setDispensingUkeSpecCompletionGate: () => {},
    setDispensingUkeSpecCompletionLabel: () => {},
    dispensingUkeSpecConfirmationText: '',
    setDispensingUkeSpecConfirmationText: () => {},
    isFetchingDispensingUkeSpecPdf: false,
    handleFetchDispensingUkeSpecPdf: async () => {},
    handleReviewDispensingUkeSpecPdfText: async () => {},
    dispensingUkeSpecCompletionGate: null,
    isExportingDispensingUkeSpecReview: false,
    handleExportDispensingUkeSpecReviewCsv: async () => {},
    isExportingDispensingUkeSpecImplementationPack: false,
    handleExportDispensingUkeSpecImplementationPack: async () => {},
    dispensingUkeSpecCompletionLabel: '未点検',
    isExportingDispensingUkeOfficialAllFieldsGate: false,
    handleExportDispensingUkeOfficialAllFieldsGateCsv: async () => {},
    ...overrides
  };
}

describe('OfficialAuditSettingsTab renderToStaticMarkup contracts', () => {
  it('renders official audit score, UKE completion gate, and self-audit items', () => {
    const props = createMockOfficialAuditSettingsProps();
    const html = renderToStaticMarkup(React.createElement(OfficialAuditSettingsTab, props as any));

    assert.ok(html.includes('<h2>公式仕様点検</h2>'), 'Should render tab main h2 title');
    assert.ok(html.includes('公式提出UKE allFields完了ゲート'), 'Should render UKE gate section title');
    assert.ok(html.includes('data-testid="dispensing-uke-official-all-fields-gate"'), 'Should render allFields gate container');
    assert.ok(html.includes('完了ゲートCSV'), 'Should render gate CSV export button');
    assert.ok(html.includes('請求点数の変動点検'), 'Should render drift check section');
    assert.ok(html.includes('剤形判定の食い違い点検'), 'Should render dosage category conflict section');
  });

  it('renders claim points drift review results when claimPointsDrift is populated', () => {
    const driftReview = buildClaimPointsDriftReview([
      {
        visitId: 'visit-drift-01',
        patientName: '患者 点検太郎',
        dispensingDate: '2026-10-01',
        claimStatus: 'exported',
        exportedAt: '2026-10-01T10:00:00Z',
        exportedFileName: 'RECEIPTC.UKE',
        exportedPoints: 450,
        currentPoints: 475
      }
    ]);

    const props = createMockOfficialAuditSettingsProps({
      claimPointsDrift: driftReview
    });
    const html = renderToStaticMarkup(React.createElement(OfficialAuditSettingsTab, props as any));

    assert.ok(html.includes('data-testid="claim-points-drift-summary"'), 'Should render drift summary container');
    assert.ok(html.includes('data-testid="claim-points-drift-table"'), 'Should render drift table');
    assert.ok(html.includes('患者 点検太郎'), 'Should render patient name in drift table');
    assert.ok(html.includes('450点'), 'Should render exported points');
    assert.ok(html.includes('475点'), 'Should render current recalculated points');
    assert.ok(html.includes('+25点'), 'Should render points diff delta');
  });

  it('renders dosage category conflict review results when conflict is detected', () => {
    const conflictReview = buildDosageCategoryConflictReview([
      {
        visitId: 'visit-conflict-01',
        rpNumber: 1,
        itemId: 'item-01',
        drugName: 'ロキソプロフェンナトリウム錠60mg',
        dosageCategory: 'internal',
        dosageCategorySource: 'manual',
        usage: '1日1回 患部に塗布'
      }
    ]);

    const props = createMockOfficialAuditSettingsProps({
      dosageCategoryConflict: conflictReview
    });
    const html = renderToStaticMarkup(React.createElement(OfficialAuditSettingsTab, props as any));

    assert.ok(html.includes('data-testid="dosage-category-conflict-summary"'), 'Should render conflict summary container');
    assert.ok(html.includes('data-testid="dosage-category-conflict-table"'), 'Should render conflict table');
    assert.ok(html.includes('visit-conflict-01'), 'Should render affected visit ID');
    assert.ok(html.includes('外用'), 'Should render calculation category label');
    assert.ok(html.includes('内服'), 'Should render print category label');
  });

  it('disables trigger buttons when canViewOfficialAudit is false', () => {
    const props = createMockOfficialAuditSettingsProps({
      canViewOfficialAudit: false
    });
    const html = renderToStaticMarkup(React.createElement(OfficialAuditSettingsTab, props as any));

    assert.ok(html.includes('disabled=""'), 'Action buttons should be disabled when canViewOfficialAudit is false');
  });
});

