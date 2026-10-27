import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FacilitySettingsTab from '@/components/settings/FacilitySettingsTab';
import type { FacilitySettings, User } from '@/db/types';
import type { OfficialFeeCodeMasterProposal } from '@/lib/official_fee_code_overrides';
import {
  findOpeningTag,
  listDisabledOpeningTags,
  listDataDisabledOpeningTags,
  stripStyleBlocks
} from '@/lib/test_support/html_disabled_tags';

type FacilitySettingsTabProps = React.ComponentProps<typeof FacilitySettingsTab>;

const DISABLED_ATTR_PATTERN = /\sdisabled=""(?=[\s/>]|$)/;
const DATA_DISABLED_ATTR_PATTERN = /\sdata-disabled="true"(?=[\s/>]|$)/;
const ARIA_DISABLED_ATTR_PATTERN = /\saria-disabled="true"(?=[\s/>]|$)/;

function listAriaDisabledOpeningTags(html: string): string[] {
  const stripped = stripStyleBlocks(html);
  const matches = stripped.match(/<[a-zA-Z0-9:-]+\b[^>]*>/g) || [];
  return matches.filter((tag) => ARIA_DISABLED_ATTR_PATTERN.test(tag));
}

function findWrapperSpanBeforeOpeningTag(
  html: string,
  marker: string,
  childTagName: string
): string {
  const stripped = stripStyleBlocks(html);
  const childTag = findOpeningTag(stripped, marker, childTagName);
  const childIndex = stripped.indexOf(childTag);
  const precedingHtml = stripped.slice(0, childIndex + childTag.length);
  return findOpeningTag(precedingHtml, childTag, 'span');
}

const MOCK_ADMIN_USER: User = {
  userId: 'admin-1',
  name: '管理者 太郎',
  role: 'admin',
  passwordHash: 'hash-admin',
  salt: 'salt-admin'
};

const DEFAULT_FACILITY_SETTINGS: FacilitySettings = {
  id: 'facility-1',
  pharmacyName: 'テスト薬局',
  pharmacyCode: '1310123456',
  pharmacyPostalCode: '100-0001',
  pharmacyPhone: '03-1234-5678',
  pharmacyAddress: '東京都千代田区千代田1-1',
  baseFeeCategory: '1',
  regionalSupportAddition: '1',
  medicalDxAddition: true,
  postGenericAddition: '1',
  genericDispensingReduction: false,
  aiAssistMode: 'enabled',
  officialFeeCodeOverrides: {}
};

const MOCK_PROPOSAL: OfficialFeeCodeMasterProposal = {
  overrides: {},
  candidates: [
    {
      key: 'base_fee_1',
      label: '調剤基本料1',
      groupLabel: '調剤基本料',
      officialFeeCode: '410001000',
      masterName: '調剤基本料１',
      rowNumber: 2,
      confidence: 'name_match'
    }
  ],
  unresolvedItems: [],
  issues: [],
  matchedCount: 1,
  unresolvedCount: 0,
  duplicateCount: 0,
  skippedRowCount: 0
};

function createMockFacilitySettingsProps(
  overrides: Partial<FacilitySettingsTabProps> = {}
): FacilitySettingsTabProps {
  return {
    settings: DEFAULT_FACILITY_SETTINGS,
    currentUser: MOCK_ADMIN_USER,
    canManageFacility: true,
    isSavingSettings: false,
    isImportingOfficialFeeCodeCsv: false,
    isReviewingOfficialFeeCodeMasterCsv: false,
    officialFeeCodeMasterProposal: MOCK_PROPOSAL,
    handleSettingsChange: () => {},
    handleExportOfficialFeeCodeCsv: async () => {},
    handleImportOfficialFeeCodeCsv: async () => {},
    handleReviewOfficialFeeCodeMasterCsv: async () => {},
    handleApplyOfficialFeeCodeMasterProposal: async () => {},
    handleExportOfficialFeeCodeMasterProposalReviewCsv: async () => {},
    handleOfficialFeeCodeChange: () => {},
    handleSaveSettings: async () => {},
    ...overrides
  };
}

interface FacilityControlSpec {
  name: string;
  kind: 'disabled' | 'data-disabled' | 'aria-disabled';
  getOpeningTag: (html: string) => string;
}

const FACILITY_MANAGEMENT_CONTROL_SPECS: readonly FacilityControlSpec[] = [
  {
    name: '公式算定コード CSVひな形ボタン ラッパー (L212, data-disabled)',
    kind: 'data-disabled',
    getOpeningTag: (html) =>
      findOpeningTag(html, 'data-testid="official-fee-code-csv-export"', 'span')
  },
  {
    name: '公式算定コード CSVひな形ボタン (L219, official-fee-code-csv-export)',
    kind: 'disabled',
    getOpeningTag: (html) =>
      findOpeningTag(html, 'data-testid="official-fee-code-csv-export"', 'button')
  },
  {
    name: '公式算定コード CSV読込 ラッパー (L228, data-disabled)',
    kind: 'data-disabled',
    getOpeningTag: (html) =>
      findWrapperSpanBeforeOpeningTag(
        html,
        'data-testid="official-fee-code-csv-input"',
        'label'
      )
  },
  {
    name: '公式算定コード CSV読込 ラベル (L233, aria-disabled)',
    kind: 'aria-disabled',
    getOpeningTag: (html) =>
      findOpeningTag(html, 'data-testid="official-fee-code-csv-input"', 'label')
  },
  {
    name: '公式算定コード CSV読込 入力 (L246, official-fee-code-csv-input)',
    kind: 'disabled',
    getOpeningTag: (html) =>
      findOpeningTag(html, 'data-testid="official-fee-code-csv-input"', 'input')
  },
  {
    name: '公式算定コード 公式表CSV照合 ラッパー (L254, data-disabled)',
    kind: 'data-disabled',
    getOpeningTag: (html) =>
      findWrapperSpanBeforeOpeningTag(
        html,
        'data-testid="official-fee-code-master-csv-input"',
        'label'
      )
  },
  {
    name: '公式算定コード 公式表CSV照合 ラベル (L259, aria-disabled)',
    kind: 'aria-disabled',
    getOpeningTag: (html) =>
      findOpeningTag(html, 'data-testid="official-fee-code-master-csv-input"', 'label')
  },
  {
    name: '公式算定コード 公式表CSV照合 入力 (L272, official-fee-code-master-csv-input)',
    kind: 'disabled',
    getOpeningTag: (html) =>
      findOpeningTag(html, 'data-testid="official-fee-code-master-csv-input"', 'input')
  },
  {
    name: '公式算定コード 候補を反映ボタン (L282, official-fee-code-master-apply)',
    kind: 'disabled',
    getOpeningTag: (html) =>
      findOpeningTag(html, 'data-testid="official-fee-code-master-apply"', 'button')
  },
  {
    name: '公式算定コード 照合結果CSVボタン (L292, official-fee-code-master-review-csv)',
    kind: 'disabled',
    getOpeningTag: (html) =>
      findOpeningTag(html, 'data-testid="official-fee-code-master-review-csv"', 'button')
  },
  {
    name: '設定保存ボタン ラッパー (L359, data-disabled)',
    kind: 'data-disabled',
    getOpeningTag: (html) => findOpeningTag(html, '設定を保存する', 'span')
  },
  {
    name: '設定保存ボタン (L365, disabled)',
    kind: 'disabled',
    getOpeningTag: (html) => findOpeningTag(html, '設定を保存する', 'button')
  }
];

describe('FacilitySettingsTab contracts', () => {
  it('exports FacilitySettingsTab as a callable React component function', () => {
    assert.equal(typeof FacilitySettingsTab, 'function');
  });

  it('keeps facility management controls disabled only when canManageFacility is false', () => {
    const deniedProps = createMockFacilitySettingsProps({ canManageFacility: false });
    const deniedHtml = renderToStaticMarkup(React.createElement(FacilitySettingsTab, deniedProps));

    const disabledDenied = listDisabledOpeningTags(deniedHtml);
    assert.equal(
      disabledDenied.length,
      6,
      `When canManageFacility is false, exactly 6 disabled="" tags must be present:\n${disabledDenied.join('\n')}`
    );

    const dataDisabledDenied = listDataDisabledOpeningTags(deniedHtml);
    assert.equal(
      dataDisabledDenied.length,
      4,
      `When canManageFacility is false, exactly 4 data-disabled="true" tags must be present:\n${dataDisabledDenied.join('\n')}`
    );

    const ariaDisabledDenied = listAriaDisabledOpeningTags(deniedHtml);
    assert.equal(
      ariaDisabledDenied.length,
      2,
      `When canManageFacility is false, exactly 2 aria-disabled="true" tags must be present:\n${ariaDisabledDenied.join('\n')}`
    );

    const permittedProps = createMockFacilitySettingsProps({ canManageFacility: true });
    const permittedHtml = renderToStaticMarkup(
      React.createElement(FacilitySettingsTab, permittedProps)
    );

    const disabledPermitted = listDisabledOpeningTags(permittedHtml);
    assert.equal(
      disabledPermitted.length,
      0,
      `When canManageFacility is true and state is ready, 0 disabled="" tags must be present:\n${disabledPermitted.join('\n')}`
    );

    const dataDisabledPermitted = listDataDisabledOpeningTags(permittedHtml);
    assert.equal(
      dataDisabledPermitted.length,
      0,
      `When canManageFacility is true and state is ready, 0 data-disabled="true" tags must be present:\n${dataDisabledPermitted.join('\n')}`
    );

    const ariaDisabledPermitted = listAriaDisabledOpeningTags(permittedHtml);
    assert.equal(
      ariaDisabledPermitted.length,
      0,
      `When canManageFacility is true and state is ready, 0 aria-disabled="true" tags must be present:\n${ariaDisabledPermitted.join('\n')}`
    );

    const deniedExtractedTags = FACILITY_MANAGEMENT_CONTROL_SPECS.map((spec) => ({
      name: spec.name,
      kind: spec.kind,
      tag: spec.getOpeningTag(deniedHtml)
    }));
    const permittedExtractedTags = FACILITY_MANAGEMENT_CONTROL_SPECS.map((spec) => ({
      name: spec.name,
      kind: spec.kind,
      tag: spec.getOpeningTag(permittedHtml)
    }));

    assert.equal(deniedExtractedTags.length, 12);
    assert.equal(permittedExtractedTags.length, 12);

    const checkDisabled = (tag: string, kind: FacilityControlSpec['kind']): boolean => {
      if (kind === 'disabled') return DISABLED_ATTR_PATTERN.test(tag);
      if (kind === 'data-disabled') return DATA_DISABLED_ATTR_PATTERN.test(tag);
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

  it('keeps proposal action buttons disabled when proposal is absent even when permitted', () => {
    const permittedNoProposalProps = createMockFacilitySettingsProps({
      canManageFacility: true,
      officialFeeCodeMasterProposal: null
    });
    const html = renderToStaticMarkup(
      React.createElement(FacilitySettingsTab, permittedNoProposalProps)
    );

    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      2,
      `When permitted but proposal is null, exactly 2 buttons must be disabled:\n${disabledTags.join('\n')}`
    );

    const applyButtonTag = findOpeningTag(
      html,
      'data-testid="official-fee-code-master-apply"',
      'button'
    );
    const reviewCsvButtonTag = findOpeningTag(
      html,
      'data-testid="official-fee-code-master-review-csv"',
      'button'
    );

    assert.ok(
      DISABLED_ATTR_PATTERN.test(applyButtonTag),
      `Expected official-fee-code-master-apply to be disabled when proposal is absent:\n${applyButtonTag}`
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(reviewCsvButtonTag),
      `Expected official-fee-code-master-review-csv to be disabled when proposal is absent:\n${reviewCsvButtonTag}`
    );
    assert.deepEqual(
      disabledTags,
      [applyButtonTag, reviewCsvButtonTag],
      `Disabled tags in permitted no-proposal render must be only apply and review-csv buttons:\n${disabledTags.join('\n')}`
    );
  });

  it('keeps proposal apply button disabled when proposal has zero matched candidates', () => {
    const zeroMatchedProposal: OfficialFeeCodeMasterProposal = {
      ...MOCK_PROPOSAL,
      matchedCount: 0,
      candidates: []
    };
    const props = createMockFacilitySettingsProps({
      canManageFacility: true,
      officialFeeCodeMasterProposal: zeroMatchedProposal
    });
    const html = renderToStaticMarkup(React.createElement(FacilitySettingsTab, props));

    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      1,
      `When permitted and proposal exists with matchedCount 0, only apply button must be disabled:\n${disabledTags.join('\n')}`
    );

    const applyButtonTag = findOpeningTag(
      html,
      'data-testid="official-fee-code-master-apply"',
      'button'
    );
    const reviewCsvButtonTag = findOpeningTag(
      html,
      'data-testid="official-fee-code-master-review-csv"',
      'button'
    );

    assert.ok(
      DISABLED_ATTR_PATTERN.test(applyButtonTag),
      `Expected official-fee-code-master-apply to be disabled when matchedCount is 0:\n${applyButtonTag}`
    );
    assert.ok(
      !DISABLED_ATTR_PATTERN.test(reviewCsvButtonTag),
      `Expected official-fee-code-master-review-csv to remain enabled when matchedCount is 0:\n${reviewCsvButtonTag}`
    );
    assert.deepEqual(disabledTags, [applyButtonTag]);
  });

  it('keeps official fee code CSV import controls disabled during in-flight import', () => {
    const props = createMockFacilitySettingsProps({
      canManageFacility: true,
      isImportingOfficialFeeCodeCsv: true
    });
    const html = renderToStaticMarkup(React.createElement(FacilitySettingsTab, props));

    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      1,
      `When isImportingOfficialFeeCodeCsv is true, exactly 1 input must be disabled:\n${disabledTags.join('\n')}`
    );

    const inputTag = findOpeningTag(
      html,
      'data-testid="official-fee-code-csv-input"',
      'input'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(inputTag),
      `Expected official-fee-code-csv-input to be disabled during import:\n${inputTag}`
    );
    assert.deepEqual(disabledTags, [inputTag]);

    const dataDisabledTags = listDataDisabledOpeningTags(html);
    assert.equal(
      dataDisabledTags.length,
      1,
      `When isImportingOfficialFeeCodeCsv is true, exactly 1 data-disabled tag must be present:\n${dataDisabledTags.join('\n')}`
    );
    const wrapperSpan = findWrapperSpanBeforeOpeningTag(
      html,
      'data-testid="official-fee-code-csv-input"',
      'label'
    );
    assert.ok(
      DATA_DISABLED_ATTR_PATTERN.test(wrapperSpan),
      `Expected wrapper span to have data-disabled during import:\n${wrapperSpan}`
    );

    const ariaDisabledTags = listAriaDisabledOpeningTags(html);
    assert.equal(
      ariaDisabledTags.length,
      1,
      `When isImportingOfficialFeeCodeCsv is true, exactly 1 aria-disabled tag must be present:\n${ariaDisabledTags.join('\n')}`
    );
    const labelTag = findOpeningTag(
      html,
      'data-testid="official-fee-code-csv-input"',
      'label'
    );
    assert.ok(
      ARIA_DISABLED_ATTR_PATTERN.test(labelTag),
      `Expected upload label to have aria-disabled during import:\n${labelTag}`
    );
  });

  it('keeps official fee code master CSV review controls disabled during in-flight review', () => {
    const props = createMockFacilitySettingsProps({
      canManageFacility: true,
      isReviewingOfficialFeeCodeMasterCsv: true
    });
    const html = renderToStaticMarkup(React.createElement(FacilitySettingsTab, props));

    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      1,
      `When isReviewingOfficialFeeCodeMasterCsv is true, exactly 1 input must be disabled:\n${disabledTags.join('\n')}`
    );

    const inputTag = findOpeningTag(
      html,
      'data-testid="official-fee-code-master-csv-input"',
      'input'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(inputTag),
      `Expected official-fee-code-master-csv-input to be disabled during review:\n${inputTag}`
    );
    assert.deepEqual(disabledTags, [inputTag]);

    const dataDisabledTags = listDataDisabledOpeningTags(html);
    assert.equal(
      dataDisabledTags.length,
      1,
      `When isReviewingOfficialFeeCodeMasterCsv is true, exactly 1 data-disabled tag must be present:\n${dataDisabledTags.join('\n')}`
    );
    const wrapperSpan = findWrapperSpanBeforeOpeningTag(
      html,
      'data-testid="official-fee-code-master-csv-input"',
      'label'
    );
    assert.ok(
      DATA_DISABLED_ATTR_PATTERN.test(wrapperSpan),
      `Expected wrapper span to have data-disabled during review:\n${wrapperSpan}`
    );

    const ariaDisabledTags = listAriaDisabledOpeningTags(html);
    assert.equal(
      ariaDisabledTags.length,
      1,
      `When isReviewingOfficialFeeCodeMasterCsv is true, exactly 1 aria-disabled tag must be present:\n${ariaDisabledTags.join('\n')}`
    );
    const labelTag = findOpeningTag(
      html,
      'data-testid="official-fee-code-master-csv-input"',
      'label'
    );
    assert.ok(
      ARIA_DISABLED_ATTR_PATTERN.test(labelTag),
      `Expected upload label to have aria-disabled during review:\n${labelTag}`
    );
  });

  it('keeps save settings button disabled during in-flight save', () => {
    const props = createMockFacilitySettingsProps({
      canManageFacility: true,
      isSavingSettings: true
    });
    const html = renderToStaticMarkup(React.createElement(FacilitySettingsTab, props));

    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      1,
      `When isSavingSettings is true, exactly 1 button must be disabled:\n${disabledTags.join('\n')}`
    );

    const saveButtonTag = findOpeningTag(html, 'btn-primary', 'button');
    assert.ok(
      DISABLED_ATTR_PATTERN.test(saveButtonTag),
      `Expected save button to be disabled during save:\n${saveButtonTag}`
    );
    assert.deepEqual(disabledTags, [saveButtonTag]);

    const dataDisabledTags = listDataDisabledOpeningTags(html);
    assert.equal(
      dataDisabledTags.length,
      1,
      `When isSavingSettings is true, exactly 1 data-disabled tag must be present:\n${dataDisabledTags.join('\n')}`
    );
    const wrapperSpan = findOpeningTag(html, 'btn-primary', 'span');
    assert.ok(
      DATA_DISABLED_ATTR_PATTERN.test(wrapperSpan),
      `Expected wrapper span to have data-disabled during save:\n${wrapperSpan}`
    );
  });
});
