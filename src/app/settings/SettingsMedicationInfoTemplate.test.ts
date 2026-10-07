import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import MedicationInfoTemplateSettingsTab from '@/components/settings/MedicationInfoTemplateSettingsTab';
import {
  MEDICATION_INFO_TEMPLATE_STATUS_LABELS,
  MEDICATION_INFO_SOURCE_TYPE_LABELS,
  MEDICATION_INFO_TEMPLATE_READINESS_LABELS,
  createEmptyMedicationInfoTemplateForm,
  makeMedicationInfoTemplateId,
  medicationInfoTemplateToForm,
  sortMedicationInfoTemplates
} from '@/lib/medication_info_template_ui';

describe('SettingsMedicationInfoTemplate contracts and pure helpers', () => {
  it('exports MedicationInfoTemplateSettingsTab as a callable React component function', () => {
    assert.equal(typeof MedicationInfoTemplateSettingsTab, 'function');
  });

  it('provides comprehensive status, source type, and readiness labels', () => {
    assert.equal(MEDICATION_INFO_TEMPLATE_STATUS_LABELS.draft, '下書き');
    assert.equal(MEDICATION_INFO_TEMPLATE_STATUS_LABELS.approved, '承認済み');
    assert.equal(MEDICATION_INFO_SOURCE_TYPE_LABELS.pmda_insert, 'PMDA 添付文書');
    assert.equal(MEDICATION_INFO_TEMPLATE_READINESS_LABELS.ready, '承認準備OK');
  });

  it('creates empty template form with default draft status', () => {
    const form = createEmptyMedicationInfoTemplateForm();
    assert.equal(form.status, 'draft');
    assert.equal(form.sourceType, 'pharmacy_authored');
    assert.equal(form.templateId, '');
  });

  it('generates unique and sanitized template IDs from drug code', () => {
    const id = makeMedicationInfoTemplateId('DRUG-001/A', new Date('2026-08-23T10:00:00Z'));
    assert.ok(id.startsWith('pmit_DRUG-001A_'));
  });

  it('converts template document to form data and sorts by timestamp descending', () => {
    const docA: any = {
      templateId: 'pmit_1',
      drugCode: 'D1',
      drugName: '薬品A',
      status: 'approved',
      updatedAt: '2026-08-20T10:00:00Z'
    };
    const docB: any = {
      templateId: 'pmit_2',
      drugCode: 'D2',
      drugName: '薬品B',
      status: 'draft',
      updatedAt: '2026-08-22T10:00:00Z'
    };

    const form = medicationInfoTemplateToForm(docA);
    assert.equal(form.templateId, 'pmit_1');
    assert.equal(form.drugName, '薬品A');

    const sorted = sortMedicationInfoTemplates([docA, docB]);
    assert.equal(sorted[0].templateId, 'pmit_2', 'Latest updated document should come first');
    assert.equal(sorted[1].templateId, 'pmit_1');
  });
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PatientMedicationInfoTemplate } from '@/db/types';

function createMockMedicationInfoTemplateProps(overrides: Record<string, unknown> = {}) {
  const emptyForm = createEmptyMedicationInfoTemplateForm();
  return {
    invalidApprovedMedicationInfoTemplates: [],
    medicationInfoTemplateStatusFilter: 'all',
    setMedicationInfoTemplateStatusFilter: () => {},
    medicationInfoTemplates: [],
    medicationInfoTemplateStatusCounts: { draft: 0, needs_review: 0, approved: 0, retired: 0 },
    medicationInfoTemplateReadinessFilter: 'all',
    setMedicationInfoTemplateReadinessFilter: () => {},
    medicationInfoTemplateReadinessCounts: { all: 0, ready: 0, missing: 0 },
    medicationInfoTemplateSearch: '',
    setMedicationInfoTemplateSearch: () => {},
    filteredMedicationInfoTemplates: [],
    isLoadingMedicationInfoTemplates: false,
    selectedMedicationInfoTemplateId: '',
    handleSelectMedicationInfoTemplate: () => {},
    getMedicationInfoTemplateReadinessIssues: () => [],
    handleNewMedicationInfoTemplate: () => {},
    isSavingMedicationInfoTemplate: false,
    isImportingMedicationInfoCsv: false,
    handleExportMedicationInfoCsv: async () => {},
    canManageFacility: true,
    handleImportMedicationInfoCsv: async () => {},
    handleUsePmdaMedicationInfoSearchUrl: () => {},
    isBuildingMedicationInfoSafetyDraft: false,
    handleApplyMedicationInfoSafetyDraft: async () => {},
    handleExportMedicationInfoSafetyDraftCsv: async () => {},
    isExportingMedicationInfoSafetyDraftCsv: false,
    medicationInfoCsvImportSummary: null,
    selectedMedicationInfoTemplate: undefined,
    isEditingImmutableMedicationInfoRevision: false,
    medicationInfoTemplateForm: emptyForm,
    handleMedicationInfoTemplateFormChange: () => {},
    currentMedicationInfoApprovalIssues: [],
    handleSaveMedicationInfoTemplate: async () => {},
    ...overrides
  };
}

describe('MedicationInfoTemplateSettingsTab renderToStaticMarkup contracts', () => {
  it('renders header, filter buttons, and empty state when template list is empty', () => {
    const props = createMockMedicationInfoTemplateProps();
    const html = renderToStaticMarkup(React.createElement(MedicationInfoTemplateSettingsTab, props as any));

    assert.ok(html.includes('<h2>薬情テンプレ承認</h2>'), 'Should render tab h2 title');
    assert.ok(html.includes('data-testid="medication-info-template-section"'), 'Should render section testid');
    assert.ok(html.includes('data-testid="medication-info-template-status-filter-all"'), 'Should render all status filter button');
    assert.ok(html.includes('data-testid="medication-info-template-readiness-filter-all"'), 'Should render readiness filter button');
    assert.ok(html.includes('テンプレはまだありません。'), 'Should render empty state message');
    assert.ok(html.includes('data-testid="medication-info-template-csv-export"'), 'Should render CSV export button');
  });

  it('renders template item in sidebar with drug info, badges, and readiness tags', () => {
    const mockTemplate: PatientMedicationInfoTemplate = {
      templateId: 'pmit_DRUG-100_v1',
      drugCode: '620000100',
      drugName: 'カロナール錠300 300mg',
      genericName: 'アセトアミノフェン',
      effectText: '熱を下げ、痛みを和らげます',
      counselingText: '指示された服用回数を守ってください',
      sideEffectText: '発疹、かゆみなどが現れることがあります',
      sourceType: 'pmda_insert',
      status: 'approved',
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
      approvedAt: '2026-10-01T10:00:00Z',
      reviewerId: 'user-admin-1'
    };

    const props = createMockMedicationInfoTemplateProps({
      medicationInfoTemplates: [mockTemplate],
      filteredMedicationInfoTemplates: [mockTemplate],
      selectedMedicationInfoTemplateId: 'pmit_DRUG-100_v1',
      selectedMedicationInfoTemplate: mockTemplate
    });
    const html = renderToStaticMarkup(React.createElement(MedicationInfoTemplateSettingsTab, props as any));

    assert.ok(html.includes('カロナール錠300 300mg'), 'Should render drug name');
    assert.ok(html.includes('620000100'), 'Should render drug code');
    assert.ok(html.includes('アセトアミノフェン'), 'Should render generic name');
    assert.ok(html.includes('承認済み'), 'Should render approved status badge');
    assert.ok(html.includes('承認準備OK'), 'Should render ready badge');
  });

  it('renders alert box when invalidApprovedMedicationInfoTemplates exists', () => {
    const invalidTemplate: PatientMedicationInfoTemplate = {
      templateId: 'pmit_INVALID_v1',
      drugCode: '620000200',
      drugName: '不備薬品錠',
      sourceType: 'pharmacy_authored',
      status: 'approved',
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z'
      // missing approvedAt and reviewerId -> invalid approved
    };

    const props = createMockMedicationInfoTemplateProps({
      invalidApprovedMedicationInfoTemplates: [invalidTemplate]
    });
    const html = renderToStaticMarkup(React.createElement(MedicationInfoTemplateSettingsTab, props as any));

    assert.ok(html.includes('data-testid="medication-info-invalid-approved-alert"'), 'Should render alert container');
    assert.ok(html.includes('承認条件を満たさず印刷に使われないテンプレが1件あります。'), 'Should render warning message with count');
  });

  it('disables CSV buttons when canManageFacility is false', () => {
    const props = createMockMedicationInfoTemplateProps({
      canManageFacility: false
    });
    const html = renderToStaticMarkup(React.createElement(MedicationInfoTemplateSettingsTab, props as any));

    assert.ok(/<button(?=[^>]*data-testid="medication-info-template-csv-export")(?=[^>]*disabled)[^>]*>/.test(html), 'CSV export button should be disabled');
    assert.ok(/<input(?=[^>]*data-testid="medication-info-template-csv-input")(?=[^>]*disabled)[^>]*>/.test(html), 'CSV file input should be disabled');
  });
});

