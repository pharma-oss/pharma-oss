import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  findOpeningTag,
  listDisabledOpeningTags,
  stripStyleBlocks
} from '@/lib/test_support/html_disabled_tags';
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
import type { DispensingUkeSpecificationPdfAllFieldCompletionGate } from '@/lib/receipt/dispensing_uke_spec_pdf';
import { DISPENSING_UKE_RECORD_SPEC_SOURCE } from '@/lib/receipt/dispensing_uke_validation';

type AuditSettingsTabProps = React.ComponentProps<typeof AuditSettingsTab>;

const DISABLED_ATTR_PATTERN = /\sdisabled=""(?=[\s/>]|$)/;
const BUTTON_BLOCK_PATTERN = /<button\b[^>]*>[\s\S]*?<\/button>/gi;
const BUTTON_OPENING_TAG_PATTERN = /^<button\b[^>]*>/i;

function findButtonOpeningTagBySpanText(html: string, spanText: string): string {
  const stripped = stripStyleBlocks(html);
  const buttonBlocks = stripped.match(BUTTON_BLOCK_PATTERN) || [];
  const targetSpan = `<span>${spanText}</span>`;
  const matchingBlocks = buttonBlocks.filter((block) => block.includes(targetSpan));
  assert.equal(
    matchingBlocks.length,
    1,
    `Expected exactly 1 <button> containing ${targetSpan}, got ${matchingBlocks.length}`
  );
  const openingMatch = matchingBlocks[0].match(BUTTON_OPENING_TAG_PATTERN);
  assert.ok(openingMatch, `Failed to extract opening <button> tag for ${targetSpan}`);
  return openingMatch[0];
}

interface AuditControlSpec {
  name: string;
  getOpeningTag: (html: string) => string;
}

const AUDIT_DAILY_CLOSING_ACTION_SPECS: readonly AuditControlSpec[] = [
  {
    name: '改善アクション 実行記録ボタン (L631)',
    getOpeningTag: (html) => findButtonOpeningTagBySpanText(html, '実行記録')
  },
  {
    name: '改善アクション 延期記録ボタン (L640)',
    getOpeningTag: (html) => findButtonOpeningTagBySpanText(html, '延期記録')
  }
];

function createMockAuditSettingsProps(
  overrides: Partial<AuditSettingsTabProps> = {}
): AuditSettingsTabProps {
  const dummyUser: User = {
    userId: 'user-admin-1',
    name: '管理者 太郎',
    role: 'admin',
    passwordHash: 'hash-admin',
    salt: 'salt-admin'
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
    dailyClosingComparison: dummyDailyClosingReview.previousMonthComparison,
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
    const html = renderToStaticMarkup(React.createElement(AuditSettingsTab, props));

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
      role: 'clerk',
      passwordHash: 'hash-clerk',
      salt: 'salt-clerk'
    };
    const props = createMockAuditSettingsProps({
      currentUser: clerkUser,
      canViewAuditLogs: false
    });
    const html = renderToStaticMarkup(React.createElement(AuditSettingsTab, props));

    // canViewAuditLogs: false 時は 9 個の操作が無効化され、true 時は 0 個が無効（CSV/JSON/台帳エクスポート・改ざん検証・診断レポート等）
    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      9,
      `Action controls must be disabled when canViewAuditLogs is false:\n${disabledTags.join('\n')}`
    );
    const htmlPermitted = renderToStaticMarkup(
      React.createElement(AuditSettingsTab, createMockAuditSettingsProps({ currentUser: clerkUser, canViewAuditLogs: true }))
    );
    const permittedTags = listDisabledOpeningTags(htmlPermitted);
    assert.equal(
      permittedTags.length,
      0,
      `Action controls must not be disabled when canViewAuditLogs is true:\n${permittedTags.join('\n')}`
    );
    assert.ok(html.includes('事務 次郎（事務）には「監査ログ閲覧」の権限がありません'), 'Permission denied notice should be rendered');
  });

  it('disables daily closing KPI action buttons only when canApproveDailyClosing is false', () => {
    const deniedProps = createMockAuditSettingsProps({ canApproveDailyClosing: false });
    const deniedHtml = renderToStaticMarkup(React.createElement(AuditSettingsTab, deniedProps));

    // canApproveDailyClosing: false の時はアクションテンプレートの 2 ボタン（実行記録・延期記録）が無効化
    const disabledDenied = listDisabledOpeningTags(deniedHtml);
    assert.equal(
      disabledDenied.length,
      2,
      `Action template buttons must be disabled when canApproveDailyClosing is false:\n${disabledDenied.join('\n')}`
    );

    const deniedExtractedTags = AUDIT_DAILY_CLOSING_ACTION_SPECS.map((spec) => ({
      name: spec.name,
      tag: spec.getOpeningTag(deniedHtml)
    }));

    for (const item of deniedExtractedTags) {
      assert.ok(
        DISABLED_ATTR_PATTERN.test(item.tag),
        `Expected "${item.name}" to have disabled="" when canApproveDailyClosing is false:\n${item.tag}`
      );
      assert.ok(
        item.tag.includes('日次締め承認'),
        `Expected "${item.name}" to include permission denied title when canApproveDailyClosing is false:\n${item.tag}`
      );
    }

    const permittedProps = createMockAuditSettingsProps({ canApproveDailyClosing: true });
    const permittedHtml = renderToStaticMarkup(React.createElement(AuditSettingsTab, permittedProps));

    const disabledPermitted = listDisabledOpeningTags(permittedHtml);
    assert.equal(
      disabledPermitted.length,
      0,
      `Action template buttons must not be disabled when canApproveDailyClosing is true:\n${disabledPermitted.join('\n')}`
    );

    const permittedExtractedTags = AUDIT_DAILY_CLOSING_ACTION_SPECS.map((spec) => ({
      name: spec.name,
      tag: spec.getOpeningTag(permittedHtml)
    }));

    for (const item of permittedExtractedTags) {
      assert.ok(
        !DISABLED_ATTR_PATTERN.test(item.tag),
        `Expected "${item.name}" not to have disabled="" when canApproveDailyClosing is true:\n${item.tag}`
      );
    }
  });

  it('disables AI quality recommendation button only when canManageFacility is false', () => {
    const deniedProps = createMockAuditSettingsProps({ canManageFacility: false });
    const deniedHtml = renderToStaticMarkup(React.createElement(AuditSettingsTab, deniedProps));

    // canManageFacility: false の時は AI 推奨モード反映ボタンの 1 個が無効化
    const disabledDenied = listDisabledOpeningTags(deniedHtml);
    assert.equal(
      disabledDenied.length,
      1,
      `AI quality button must be disabled when canManageFacility is false:\n${disabledDenied.join('\n')}`
    );

    const deniedTag = findOpeningTag(deniedHtml, 'data-testid="ai-quality-gate-apply"', 'button');
    assert.ok(
      DISABLED_ATTR_PATTERN.test(deniedTag),
      `Expected ai-quality-gate-apply to have disabled="" when canManageFacility is false:\n${deniedTag}`
    );
    assert.ok(
      deniedTag.includes('施設基準設定'),
      `Expected ai-quality-gate-apply to include permission denied title when canManageFacility is false:\n${deniedTag}`
    );

    const permittedProps = createMockAuditSettingsProps({ canManageFacility: true });
    const permittedHtml = renderToStaticMarkup(React.createElement(AuditSettingsTab, permittedProps));

    const disabledPermitted = listDisabledOpeningTags(permittedHtml);
    assert.equal(
      disabledPermitted.length,
      0,
      `AI quality button must not be disabled when canManageFacility is true:\n${disabledPermitted.join('\n')}`
    );

    const permittedTag = findOpeningTag(permittedHtml, 'data-testid="ai-quality-gate-apply"', 'button');
    assert.ok(
      !DISABLED_ATTR_PATTERN.test(permittedTag),
      `Expected ai-quality-gate-apply not to have disabled="" when canManageFacility is true:\n${permittedTag}`
    );
  });

  it('keeps daily closing action buttons and AI quality button disabled during processing or when conditions unmet even when permitted', () => {
    // 実行記録処理中の無効化
    const recordingProps = createMockAuditSettingsProps({
      canApproveDailyClosing: true,
      recordingDailyClosingKpiActionId: 'start-daily-closing-log'
    });
    const recordingHtml = renderToStaticMarkup(React.createElement(AuditSettingsTab, recordingProps));
    const recordBtnTag = findButtonOpeningTagBySpanText(recordingHtml, '実行記録');
    assert.ok(
      DISABLED_ATTR_PATTERN.test(recordBtnTag),
      `Expected 実行記録 button to be disabled during recording:\n${recordBtnTag}`
    );

    // 延期記録処理中の無効化
    const postponingProps = createMockAuditSettingsProps({
      canApproveDailyClosing: true,
      postponingDailyClosingKpiActionId: 'start-daily-closing-log'
    });
    const postponingHtml = renderToStaticMarkup(React.createElement(AuditSettingsTab, postponingProps));
    const postponeBtnTag = findButtonOpeningTagBySpanText(postponingHtml, '延期記録');
    assert.ok(
      DISABLED_ATTR_PATTERN.test(postponeBtnTag),
      `Expected 延期記録 button to be disabled during postponing:\n${postponeBtnTag}`
    );

    // AI 推奨反映処理中の無効化
    const applyingAiProps = createMockAuditSettingsProps({
      canManageFacility: true,
      isApplyingAiQualityMode: true
    });
    const applyingAiHtml = renderToStaticMarkup(React.createElement(AuditSettingsTab, applyingAiProps));
    const aiApplyBtnTag = findOpeningTag(applyingAiHtml, 'data-testid="ai-quality-gate-apply"', 'button');
    assert.ok(
      DISABLED_ATTR_PATTERN.test(aiApplyBtnTag),
      `Expected ai-quality-gate-apply button to be disabled during applying AI mode:\n${aiApplyBtnTag}`
    );
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

    // canViewOfficialAudit: false 時は 9 個が無効化、true 時はデータ未ロード起因の 4 個だけが無効（差分の 5 個が権限で制御されるボタン）
    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      9,
      `Action buttons must be disabled when canViewOfficialAudit is false:\n${disabledTags.join('\n')}`
    );
    const htmlPermitted = renderToStaticMarkup(
      React.createElement(OfficialAuditSettingsTab, createMockOfficialAuditSettingsProps({ canViewOfficialAudit: true }) as any)
    );
    const permittedTags = listDisabledOpeningTags(htmlPermitted);
    assert.equal(
      permittedTags.length,
      4,
      `Action buttons must have only 4 state-disabled controls when canViewOfficialAudit is true:\n${permittedTags.join('\n')}`
    );
  });

  it('keeps trigger buttons disabled only when permission is denied once specification inspection conditions are met', () => {
    const dummyGate: DispensingUkeSpecificationPdfAllFieldCompletionGate = {
      ok: true,
      statusLabel: 'OK',
      source: DISPENSING_UKE_RECORD_SPEC_SOURCE,
      expectedRecordTypeCount: 1,
      parsedRecordTypeCount: 1,
      expectedRecordTypes: ['RE'],
      parsedRecordTypes: ['RE'],
      missingRecordTypes: [],
      parsedFieldCount: 10,
      definedFieldCount: 10,
      remainingFieldCount: 0,
      remainingRecordTypes: [],
      parseIssueCount: 0,
      blockerCount: 0,
      blockers: []
    };

    const readyProps = {
      dispensingUkeSpecCompletionGate: dummyGate,
      dispensingUkeSpecPdfText: 'text'
    };

    const deniedProps = createMockOfficialAuditSettingsProps({
      ...readyProps,
      canViewOfficialAudit: false
    });
    const htmlDenied = renderToStaticMarkup(React.createElement(OfficialAuditSettingsTab, deniedProps as any));

    // 権限なしの 9 個は全トリガー・出力ボタンが無効化
    const disabledTagsDenied = listDisabledOpeningTags(htmlDenied);
    assert.equal(
      disabledTagsDenied.length,
      9,
      `Action buttons must have 9 disabled elements when canViewOfficialAudit is false:\n${disabledTagsDenied.join('\n')}`
    );

    const permittedProps = createMockOfficialAuditSettingsProps({
      ...readyProps,
      canViewOfficialAudit: true
    });
    const htmlPermitted = renderToStaticMarkup(React.createElement(OfficialAuditSettingsTab, permittedProps as any));

    // 権限ありの 2 個はデータ未ロード起因の CSV 出力ボタン（claim-points-drift-csv-button と dosage-category-conflict-csv-button）
    const disabledTagsPermitted = listDisabledOpeningTags(htmlPermitted);
    assert.equal(
      disabledTagsPermitted.length,
      2,
      `Action buttons must have 2 state-disabled controls when canViewOfficialAudit is true:\n${disabledTagsPermitted.join('\n')}`
    );
    assert.ok(
      disabledTagsPermitted.some((tag) => tag.includes('data-testid="claim-points-drift-csv-button"')),
      `Must include claim-points-drift-csv-button in permitted disabled controls:\n${disabledTagsPermitted.join('\n')}`
    );
    assert.ok(
      disabledTagsPermitted.some((tag) => tag.includes('data-testid="dosage-category-conflict-csv-button"')),
      `Must include dosage-category-conflict-csv-button in permitted disabled controls:\n${disabledTagsPermitted.join('\n')}`
    );
  });

  it('keeps gate CSV button disabled during exporting official all fields gate CSV', () => {
    const props = createMockOfficialAuditSettingsProps({
      canViewOfficialAudit: true,
      isExportingDispensingUkeOfficialAllFieldsGate: true
    });
    const html = renderToStaticMarkup(React.createElement(OfficialAuditSettingsTab, props as any));

    const gateCsvBtn = findOpeningTag(
      html,
      'data-testid="dispensing-uke-official-all-fields-gate-csv-button"',
      'button'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(gateCsvBtn),
      `Expected gate CSV button to be disabled during export:\n${gateCsvBtn}`
    );
  });

  it('keeps claim points drift run button disabled during in-flight review', () => {
    const props = createMockOfficialAuditSettingsProps({
      canViewOfficialAudit: true,
      isReviewingClaimPointsDrift: true
    });
    const html = renderToStaticMarkup(React.createElement(OfficialAuditSettingsTab, props as any));

    const runBtn = findOpeningTag(
      html,
      'data-testid="claim-points-drift-run-button"',
      'button'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(runBtn),
      `Expected claim points drift run button to be disabled during review:\n${runBtn}`
    );
    assert.ok(
      html.includes('点検中...'),
      'Expected button label to show "点検中..." during review'
    );
  });

  it('keeps dosage category conflict run button disabled during in-flight review', () => {
    const props = createMockOfficialAuditSettingsProps({
      canViewOfficialAudit: true,
      isReviewingDosageCategoryConflict: true
    });
    const html = renderToStaticMarkup(React.createElement(OfficialAuditSettingsTab, props as any));

    const runBtn = findOpeningTag(
      html,
      'data-testid="dosage-category-conflict-run-button"',
      'button'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(runBtn),
      `Expected dosage category conflict run button to be disabled during review:\n${runBtn}`
    );
    assert.ok(
      html.includes('点検中...'),
      'Expected button label to show "点検中..." during review'
    );
  });

  it('keeps spec fetch, review buttons and textareas disabled during fetching spec PDF', () => {
    const props = createMockOfficialAuditSettingsProps({
      canViewOfficialAudit: true,
      isFetchingDispensingUkeSpecPdf: true
    });
    const html = renderToStaticMarkup(React.createElement(OfficialAuditSettingsTab, props as any));

    const fetchBtn = findOpeningTag(
      html,
      'data-testid="dispensing-uke-spec-fetch-button"',
      'button'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(fetchBtn),
      `Expected spec fetch button to be disabled during fetch:\n${fetchBtn}`
    );
    assert.ok(
      html.includes('取得中...'),
      'Expected fetch button label to show "取得中..." during fetch'
    );

    const reviewBtn = findOpeningTag(
      html,
      'data-testid="dispensing-uke-spec-review-button"',
      'button'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(reviewBtn),
      `Expected spec review button to be disabled during fetch:\n${reviewBtn}`
    );

    const textTextarea = findOpeningTag(
      html,
      'textarea-spec-text',
      'textarea'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(textTextarea),
      `Expected spec text textarea to be disabled during fetch:\n${textTextarea}`
    );

    const memoTextarea = findOpeningTag(
      html,
      'textarea-memo',
      'textarea'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(memoTextarea),
      `Expected confirmation memo textarea to be disabled during fetch:\n${memoTextarea}`
    );
  });

  it('keeps spec review CSV and implementation pack buttons disabled during respective in-flight exports', () => {
    const reviewExportProps = createMockOfficialAuditSettingsProps({
      canViewOfficialAudit: true,
      dispensingUkeSpecCompletionGate: {
        ok: true,
        statusLabel: 'OK',
        source: DISPENSING_UKE_RECORD_SPEC_SOURCE,
        expectedRecordTypeCount: 1,
        parsedRecordTypeCount: 1,
        expectedRecordTypes: ['RE'],
        parsedRecordTypes: ['RE'],
        missingRecordTypes: [],
        parsedFieldCount: 10,
        definedFieldCount: 10,
        remainingFieldCount: 0,
        remainingRecordTypes: [],
        parseIssueCount: 0,
        blockerCount: 0,
        blockers: []
      },
      isExportingDispensingUkeSpecReview: true
    });
    const reviewHtml = renderToStaticMarkup(
      React.createElement(OfficialAuditSettingsTab, reviewExportProps as any)
    );
    const reviewCsvBtn = findOpeningTag(
      reviewHtml,
      'data-testid="dispensing-uke-spec-review-csv-button"',
      'button'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(reviewCsvBtn),
      `Expected spec review CSV button to be disabled during export:\n${reviewCsvBtn}`
    );

    const packExportProps = createMockOfficialAuditSettingsProps({
      canViewOfficialAudit: true,
      dispensingUkeSpecPdfText: 'YK 薬局情報レコード',
      isExportingDispensingUkeSpecImplementationPack: true
    });
    const packHtml = renderToStaticMarkup(
      React.createElement(OfficialAuditSettingsTab, packExportProps as any)
    );
    const packBtn = findOpeningTag(
      packHtml,
      'data-testid="dispensing-uke-spec-implementation-pack-button"',
      'button'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(packBtn),
      `Expected implementation pack button to be disabled during export:\n${packBtn}`
    );
  });
});



