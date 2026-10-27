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
import {
  findOpeningTag,
  listDisabledOpeningTags,
  stripStyleBlocks
} from '@/lib/test_support/html_disabled_tags';

type MedicationInfoTemplateSettingsTabProps = React.ComponentProps<
  typeof MedicationInfoTemplateSettingsTab
>;

const DISABLED_ATTR_PATTERN = /\sdisabled=""(?=[\s/>]|$)/;
const ARIA_DISABLED_ATTR_PATTERN = /\saria-disabled="true"(?=[\s/>]|$)/;

function listAriaDisabledOpeningTags(html: string): string[] {
  const stripped = stripStyleBlocks(html);
  const matches = stripped.match(/<[a-zA-Z0-9:-]+\b[^>]*>/g) || [];
  return matches.filter((tag) => ARIA_DISABLED_ATTR_PATTERN.test(tag));
}

function createMockMedicationInfoTemplateProps(
  overrides: Partial<MedicationInfoTemplateSettingsTabProps> = {}
): MedicationInfoTemplateSettingsTabProps {
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

interface MedicationInfoControlSpec {
  name: string;
  kind: 'disabled' | 'aria-disabled';
  getOpeningTag: (html: string) => string;
}

const MEDICATION_INFO_CONTROL_SPECS: readonly MedicationInfoControlSpec[] = [
  {
    name: 'CSV書出ボタン (L264, medication-info-template-csv-export)',
    kind: 'disabled',
    getOpeningTag: (html) =>
      findOpeningTag(html, 'data-testid="medication-info-template-csv-export"', 'button')
  },
  {
    name: 'CSV下書き取込ラベル (L272, aria-disabled)',
    kind: 'aria-disabled',
    getOpeningTag: (html) =>
      findOpeningTag(html, 'data-testid="medication-info-template-csv-input"', 'label')
  },
  {
    name: 'CSV下書き取込ファイル入力 (L283, medication-info-template-csv-input)',
    kind: 'disabled',
    getOpeningTag: (html) =>
      findOpeningTag(html, 'data-testid="medication-info-template-csv-input"', 'input')
  },
  {
    name: '副作用/注意案一括反映ボタン (L301, medication-info-template-safety-draft)',
    kind: 'disabled',
    getOpeningTag: (html) =>
      findOpeningTag(html, 'data-testid="medication-info-template-safety-draft"', 'button')
  },
  {
    name: '注意案CSV出力ボタン (L313, medication-info-template-safety-draft-csv-export)',
    kind: 'disabled',
    getOpeningTag: (html) =>
      findOpeningTag(html, 'data-testid="medication-info-template-safety-draft-csv-export"', 'button')
  }
];

describe('MedicationInfoTemplateSettingsTab renderToStaticMarkup contracts', () => {
  it('renders header, filter buttons, and empty state when template list is empty', () => {
    const props = createMockMedicationInfoTemplateProps();
    const html = renderToStaticMarkup(React.createElement(MedicationInfoTemplateSettingsTab, props));

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
    const html = renderToStaticMarkup(React.createElement(MedicationInfoTemplateSettingsTab, props));

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
    };

    const props = createMockMedicationInfoTemplateProps({
      invalidApprovedMedicationInfoTemplates: [invalidTemplate]
    });
    const html = renderToStaticMarkup(React.createElement(MedicationInfoTemplateSettingsTab, props));

    assert.ok(html.includes('data-testid="medication-info-invalid-approved-alert"'), 'Should render alert container');
    assert.ok(html.includes('承認条件を満たさず印刷に使われないテンプレが1件あります。'), 'Should render warning message with count');
  });

  it('keeps medication info template management controls disabled only when canManageFacility is false', () => {
    const deniedProps = createMockMedicationInfoTemplateProps({
      canManageFacility: false
    });
    const deniedHtml = renderToStaticMarkup(
      React.createElement(MedicationInfoTemplateSettingsTab, deniedProps)
    );

    const disabledDenied = listDisabledOpeningTags(deniedHtml);
    assert.equal(
      disabledDenied.length,
      4,
      `When canManageFacility is false, exactly 4 disabled="" form control tags must be present:\n${disabledDenied.join('\n')}`
    );

    const ariaDisabledDenied = listAriaDisabledOpeningTags(deniedHtml);
    assert.equal(
      ariaDisabledDenied.length,
      1,
      `When canManageFacility is false, exactly 1 aria-disabled="true" tag must be present:\n${ariaDisabledDenied.join('\n')}`
    );

    const permittedProps = createMockMedicationInfoTemplateProps({
      canManageFacility: true
    });
    const permittedHtml = renderToStaticMarkup(
      React.createElement(MedicationInfoTemplateSettingsTab, permittedProps)
    );

    const disabledPermitted = listDisabledOpeningTags(permittedHtml);
    assert.equal(
      disabledPermitted.length,
      0,
      `When canManageFacility is true and state is ready, 0 disabled="" tags must be present:\n${disabledPermitted.join('\n')}`
    );

    const ariaDisabledPermitted = listAriaDisabledOpeningTags(permittedHtml);
    assert.equal(
      ariaDisabledPermitted.length,
      0,
      `When canManageFacility is true and state is ready, 0 aria-disabled="true" tags must be present:\n${ariaDisabledPermitted.join('\n')}`
    );

    const deniedExtractedTags = MEDICATION_INFO_CONTROL_SPECS.map((spec) => ({
      name: spec.name,
      kind: spec.kind,
      tag: spec.getOpeningTag(deniedHtml)
    }));
    const permittedExtractedTags = MEDICATION_INFO_CONTROL_SPECS.map((spec) => ({
      name: spec.name,
      kind: spec.kind,
      tag: spec.getOpeningTag(permittedHtml)
    }));

    assert.equal(deniedExtractedTags.length, 5);
    assert.equal(permittedExtractedTags.length, 5);

    const checkDisabled = (tag: string, kind: MedicationInfoControlSpec['kind']): boolean => {
      if (kind === 'disabled') return DISABLED_ATTR_PATTERN.test(tag);
      return ARIA_DISABLED_ATTR_PATTERN.test(tag);
    };

    const deniedTagsDiagnostic = deniedExtractedTags
      .map((item) => `[${item.kind}] ${item.tag}`)
      .join('\n');
    for (const item of deniedExtractedTags) {
      assert.ok(
        checkDisabled(item.tag, item.kind),
        `Expected "${item.name}" to have ${item.kind} when canManageFacility is false:\n${item.tag}\nAll extracted tags:\n${deniedTagsDiagnostic}`
      );
    }

    const permittedTagsDiagnostic = permittedExtractedTags
      .map((item) => `[${item.kind}] ${item.tag}`)
      .join('\n');
    for (const item of permittedExtractedTags) {
      assert.ok(
        !checkDisabled(item.tag, item.kind),
        `Expected "${item.name}" not to have ${item.kind} when canManageFacility is true:\n${item.tag}\nAll extracted tags:\n${permittedTagsDiagnostic}`
      );
    }
  });

  it('keeps safety draft buttons disabled during background processing even when permitted', () => {
    const buildingProps = createMockMedicationInfoTemplateProps({
      canManageFacility: true,
      isBuildingMedicationInfoSafetyDraft: true
    });
    const buildingHtml = renderToStaticMarkup(
      React.createElement(MedicationInfoTemplateSettingsTab, buildingProps)
    );

    const draftApplyButtonTag = findOpeningTag(
      buildingHtml,
      'data-testid="medication-info-template-safety-draft"',
      'button'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(draftApplyButtonTag),
      `Expected safety draft apply button to be disabled when building draft:\n${draftApplyButtonTag}`
    );

    const exportingProps = createMockMedicationInfoTemplateProps({
      canManageFacility: true,
      isExportingMedicationInfoSafetyDraftCsv: true
    });
    const exportingHtml = renderToStaticMarkup(
      React.createElement(MedicationInfoTemplateSettingsTab, exportingProps)
    );

    const draftCsvButtonTag = findOpeningTag(
      exportingHtml,
      'data-testid="medication-info-template-safety-draft-csv-export"',
      'button'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(draftCsvButtonTag),
      `Expected safety draft csv export button to be disabled when exporting csv:\n${draftCsvButtonTag}`
    );
  });

  it('keeps top action controls and file inputs disabled during in-flight CSV import', () => {
    const props = createMockMedicationInfoTemplateProps({
      canManageFacility: true,
      isImportingMedicationInfoCsv: true
    });
    const html = renderToStaticMarkup(
      React.createElement(MedicationInfoTemplateSettingsTab, props)
    );

    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      6,
      `When isImportingMedicationInfoCsv is true, exactly 6 form controls must be disabled:\n${disabledTags.join('\n')}`
    );

    const newBtn = findOpeningTag(html, '新規', 'button');
    const exportBtn = findOpeningTag(
      html,
      'data-testid="medication-info-template-csv-export"',
      'button'
    );
    const inputTag = findOpeningTag(
      html,
      'data-testid="medication-info-template-csv-input"',
      'input'
    );
    const pmdaBtn = findOpeningTag(html, 'PMDA検索URL', 'button');
    const safetyDraftBtn = findOpeningTag(
      html,
      'data-testid="medication-info-template-safety-draft"',
      'button'
    );
    const safetyDraftCsvBtn = findOpeningTag(
      html,
      'data-testid="medication-info-template-safety-draft-csv-export"',
      'button'
    );

    for (const [name, tag] of [
      ['新規ボタン', newBtn],
      ['CSV書出ボタン', exportBtn],
      ['CSV取込入力', inputTag],
      ['PMDA検索URLボタン', pmdaBtn],
      ['副作用/注意案ボタン', safetyDraftBtn],
      ['注意案CSVボタン', safetyDraftCsvBtn]
    ]) {
      assert.ok(
        DISABLED_ATTR_PATTERN.test(tag),
        `Expected "${name}" to be disabled during CSV import:\n${tag}`
      );
    }

    const ariaDisabledTags = listAriaDisabledOpeningTags(html);
    assert.equal(
      ariaDisabledTags.length,
      1,
      `When isImportingMedicationInfoCsv is true, exactly 1 aria-disabled tag must be present:\n${ariaDisabledTags.join('\n')}`
    );
    const labelTag = findOpeningTag(
      html,
      'data-testid="medication-info-template-csv-input"',
      'label'
    );
    assert.ok(
      ARIA_DISABLED_ATTR_PATTERN.test(labelTag),
      `Expected CSV upload label to have aria-disabled during CSV import:\n${labelTag}`
    );
  });

  it('keeps approve button disabled and sets title when approval issues exist', () => {
    const props = createMockMedicationInfoTemplateProps({
      canManageFacility: true,
      currentMedicationInfoApprovalIssues: [
        { code: 'side_effect_text', message: '主な副作用を入力してください' }
      ]
    });
    const html = renderToStaticMarkup(
      React.createElement(MedicationInfoTemplateSettingsTab, props)
    );

    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      1,
      `When approval issues exist, only the approve button must be disabled:\n${disabledTags.join('\n')}`
    );

    const approveBtn = findOpeningTag(
      html,
      'data-testid="medication-info-template-approve"',
      'button'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(approveBtn),
      `Expected approve button to be disabled when issues exist:\n${approveBtn}`
    );
    assert.ok(
      approveBtn.includes('title="主な副作用を入力してください"'),
      `Expected approve button title to explain issues:\n${approveBtn}`
    );

    const saveDraftBtn = findOpeningTag(
      html,
      'data-testid="medication-info-template-save-draft"',
      'button'
    );
    const needsReviewBtn = findOpeningTag(
      html,
      'data-testid="medication-info-template-needs-review"',
      'button'
    );
    const retireBtn = findOpeningTag(
      html,
      'data-testid="medication-info-template-retire"',
      'button'
    );

    assert.ok(!DISABLED_ATTR_PATTERN.test(saveDraftBtn));
    assert.ok(!DISABLED_ATTR_PATTERN.test(needsReviewBtn));
    assert.ok(!DISABLED_ATTR_PATTERN.test(retireBtn));
    assert.deepEqual(disabledTags, [approveBtn]);
  });

  it('keeps needs-review and retire buttons disabled with revision notice when editing immutable revision', () => {
    const props = createMockMedicationInfoTemplateProps({
      canManageFacility: true,
      isEditingImmutableMedicationInfoRevision: true
    });
    const html = renderToStaticMarkup(
      React.createElement(MedicationInfoTemplateSettingsTab, props)
    );

    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      2,
      `When editing immutable revision, exactly 2 buttons must be disabled:\n${disabledTags.join('\n')}`
    );

    const needsReviewBtn = findOpeningTag(
      html,
      'data-testid="medication-info-template-needs-review"',
      'button'
    );
    const retireBtn = findOpeningTag(
      html,
      'data-testid="medication-info-template-retire"',
      'button'
    );

    assert.ok(
      DISABLED_ATTR_PATTERN.test(needsReviewBtn),
      `Expected needs-review button to be disabled when editing immutable revision:\n${needsReviewBtn}`
    );
    assert.ok(
      needsReviewBtn.includes('title="本文・参照元の変更は新版として下書き保存してください"'),
      `Expected needs-review button title to explain immutable revision notice:\n${needsReviewBtn}`
    );

    assert.ok(
      DISABLED_ATTR_PATTERN.test(retireBtn),
      `Expected retire button to be disabled when editing immutable revision:\n${retireBtn}`
    );
    assert.ok(
      retireBtn.includes('title="本文・参照元の変更は新版として下書き保存してください"'),
      `Expected retire button title to explain immutable revision notice:\n${retireBtn}`
    );

    const saveDraftBtn = findOpeningTag(
      html,
      'data-testid="medication-info-template-save-draft"',
      'button'
    );
    const approveBtn = findOpeningTag(
      html,
      'data-testid="medication-info-template-approve"',
      'button'
    );

    assert.ok(!DISABLED_ATTR_PATTERN.test(saveDraftBtn));
    assert.ok(!DISABLED_ATTR_PATTERN.test(approveBtn));
    assert.deepEqual(disabledTags, [needsReviewBtn, retireBtn]);
  });

  it('keeps all action buttons and form submit controls disabled during in-flight template save', () => {
    const props = createMockMedicationInfoTemplateProps({
      canManageFacility: true,
      isSavingMedicationInfoTemplate: true
    });
    const html = renderToStaticMarkup(
      React.createElement(MedicationInfoTemplateSettingsTab, props)
    );

    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      10,
      `When isSavingMedicationInfoTemplate is true, exactly 10 form controls must be disabled:\n${disabledTags.join('\n')}`
    );

    const saveDraftBtn = findOpeningTag(
      html,
      'data-testid="medication-info-template-save-draft"',
      'button'
    );
    const approveBtn = findOpeningTag(
      html,
      'data-testid="medication-info-template-approve"',
      'button'
    );
    const needsReviewBtn = findOpeningTag(
      html,
      'data-testid="medication-info-template-needs-review"',
      'button'
    );
    const retireBtn = findOpeningTag(
      html,
      'data-testid="medication-info-template-retire"',
      'button'
    );

    assert.ok(DISABLED_ATTR_PATTERN.test(saveDraftBtn));
    assert.ok(DISABLED_ATTR_PATTERN.test(approveBtn));
    assert.ok(DISABLED_ATTR_PATTERN.test(needsReviewBtn));
    assert.ok(DISABLED_ATTR_PATTERN.test(retireBtn));

    const ariaDisabledTags = listAriaDisabledOpeningTags(html);
    assert.equal(
      ariaDisabledTags.length,
      1,
      `When isSavingMedicationInfoTemplate is true, exactly 1 aria-disabled tag must be present:\n${ariaDisabledTags.join('\n')}`
    );
  });
});


