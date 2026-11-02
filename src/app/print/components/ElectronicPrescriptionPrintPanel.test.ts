import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { VisitElectronicPrescription } from '@/db/types';
import {
  listDisabledOpeningTags,
  findOpeningTag
} from '@/lib/test_support/html_disabled_tags';
import {
  ElectronicPrescriptionPrintPanel,
  type ElectronicPrescriptionPrintPanelProps
} from './ElectronicPrescriptionPrintPanel';

function createMockElectronicPrescriptionPrintPanelProps(
  overrides?: Partial<ElectronicPrescriptionPrintPanelProps>
): ElectronicPrescriptionPrintPanelProps {
  const defaultPrescription: VisitElectronicPrescription = {
    prescriptionId: 'ep-test-001',
    documentKind: 'electronic_prescription',
    sourceMode: 'connector',
    receivedAt: '2026-11-03T10:00:00Z',
    appliedAt: '2026-11-03T10:05:00Z',
    validUntil: '2026-11-07T23:59:59Z',
    signatureStatus: 'valid',
    duplicateCheckStatus: 'passed',
    integrityHash: 'test-hash-sha256',
    receptionStatus: 'accepted',
    dispensingResultStatus: 'registered',
    dispensingResultId: 'disp-result-001',
    dispensingResultUpdatedAt: '2026-11-03T10:30:00Z'
  };

  return {
    electronicPrescription: defaultPrescription,
    electronicPrescriptionIds: ['ep-test-001'],
    electronicPrescriptionDispensingResultStatus: 'registered',
    electronicPrescriptionReceptionStatus: 'accepted',
    electronicPrescriptionSignatureStatus: 'valid',
    electronicPrescriptionDuplicateCheckStatus: 'passed',
    electronicPrescriptionRegistered: true,
    electronicPrescriptionOperationBusy: false,
    electronicPrescriptionOperationInFlight: null,
    canRunElectronicPrescriptionDuplicateCheck: true,
    canRegisterElectronicPrescriptionDispensingResult: true,
    canSearchElectronicPrescriptionDispensingResult: true,
    canChangeElectronicPrescriptionDispensingResult: true,
    canCancelElectronicPrescriptionDispensingResult: true,
    canCancelElectronicPrescriptionReception: true,
    electronicPrescriptionOperationBlockedTitle: undefined,
    electronicPrescriptionValidUntilText: '2026/11/07',
    electronicPrescriptionUpdatedAtText: '2026/11/03 19:30',
    electronicPrescriptionDispensingInformationSignatureText: '署名検証済（有効）',
    electronicPrescriptionDispensingInformationHpkiText: 'HPKIカード認証済',
    electronicPrescriptionDispensingInformationSignedAtText: '2026/11/03 19:30',
    electronicPrescriptionDispensingInformationHashText: 'a1b2c3d4e5f6',
    electronicPrescriptionComments: [],
    electronicPrescriptionLaboratoryResults: [],
    prescriptionAuditErrorCount: 0,
    electronicPrescriptionLifecycleDecision: () => ({ allowed: true }),
    handleElectronicPrescriptionOperation: () => {},
    ...overrides
  };
}

const ACTION_BUTTONS = [
  {
    name: '重複確認',
    testId: 'electronic-prescription-duplicate-check-button',
    propKey: 'canRunElectronicPrescriptionDuplicateCheck' as const
  },
  {
    name: '調剤結果登録',
    testId: 'electronic-prescription-register-dispensing-result-button',
    propKey: 'canRegisterElectronicPrescriptionDispensingResult' as const
  },
  {
    name: '結果ID照会',
    testId: 'electronic-prescription-search-dispensing-result-button',
    propKey: 'canSearchElectronicPrescriptionDispensingResult' as const
  },
  {
    name: '調剤結果変更',
    testId: 'electronic-prescription-change-dispensing-result-button',
    propKey: 'canChangeElectronicPrescriptionDispensingResult' as const
  },
  {
    name: '結果取消',
    testId: 'electronic-prescription-cancel-dispensing-result-button',
    propKey: 'canCancelElectronicPrescriptionDispensingResult' as const
  },
  {
    name: '受付取消',
    testId: 'electronic-prescription-cancel-reception-button',
    propKey: 'canCancelElectronicPrescriptionReception' as const
  }
] as const;

describe('ElectronicPrescriptionPrintPanel component disabled and lifecycle contracts', () => {
  it('exports ElectronicPrescriptionPrintPanel component', () => {
    assert.strictEqual(typeof ElectronicPrescriptionPrintPanel, 'object');
  });

  it('renders null when electronicPrescription prop is undefined', () => {
    const props = createMockElectronicPrescriptionPrintPanelProps({
      electronicPrescription: undefined
    });
    const html = renderToStaticMarkup(React.createElement(ElectronicPrescriptionPrintPanel, props));
    assert.strictEqual(html, '');
  });

  it('enables all 6 lifecycle action buttons when all action conditions are true', () => {
    const props = createMockElectronicPrescriptionPrintPanelProps({
      canRunElectronicPrescriptionDuplicateCheck: true,
      canRegisterElectronicPrescriptionDispensingResult: true,
      canSearchElectronicPrescriptionDispensingResult: true,
      canChangeElectronicPrescriptionDispensingResult: true,
      canCancelElectronicPrescriptionDispensingResult: true,
      canCancelElectronicPrescriptionReception: true
    });
    const html = renderToStaticMarkup(React.createElement(ElectronicPrescriptionPrintPanel, props));

    const disabledTags = listDisabledOpeningTags(html);
    assert.strictEqual(
      disabledTags.length,
      0,
      `No buttons should be disabled when all conditions are true, but got:\n${disabledTags.join('\n')}`
    );

    for (const btn of ACTION_BUTTONS) {
      const tag = findOpeningTag(html, `data-testid="${btn.testId}"`, 'button');
      assert.ok(!tag.includes('disabled=""'), `${btn.name} button must not have disabled attribute`);
    }
  });

  it('disables all 6 lifecycle action buttons when all action conditions are false', () => {
    const props = createMockElectronicPrescriptionPrintPanelProps({
      canRunElectronicPrescriptionDuplicateCheck: false,
      canRegisterElectronicPrescriptionDispensingResult: false,
      canSearchElectronicPrescriptionDispensingResult: false,
      canChangeElectronicPrescriptionDispensingResult: false,
      canCancelElectronicPrescriptionDispensingResult: false,
      canCancelElectronicPrescriptionReception: false
    });
    const html = renderToStaticMarkup(React.createElement(ElectronicPrescriptionPrintPanel, props));

    const disabledTags = listDisabledOpeningTags(html);
    assert.strictEqual(
      disabledTags.length,
      6,
      `All 6 action buttons must be disabled when conditions are false, but got ${disabledTags.length}:\n${disabledTags.join('\n')}`
    );

    for (const btn of ACTION_BUTTONS) {
      const tag = findOpeningTag(html, `data-testid="${btn.testId}"`, 'button');
      assert.ok(tag.includes('disabled=""'), `${btn.name} button must have disabled="" attribute`);
    }
  });

  for (const target of ACTION_BUTTONS) {
    it(`pins disabled state for ${target.name} button when ${target.propKey} is false`, () => {
      // 1 つだけ false、他 5 つは true
      const overrides: Partial<ElectronicPrescriptionPrintPanelProps> = {
        canRunElectronicPrescriptionDuplicateCheck: true,
        canRegisterElectronicPrescriptionDispensingResult: true,
        canSearchElectronicPrescriptionDispensingResult: true,
        canChangeElectronicPrescriptionDispensingResult: true,
        canCancelElectronicPrescriptionDispensingResult: true,
        canCancelElectronicPrescriptionReception: true,
        [target.propKey]: false
      };
      const props = createMockElectronicPrescriptionPrintPanelProps(overrides);
      const html = renderToStaticMarkup(React.createElement(ElectronicPrescriptionPrintPanel, props));

      const disabledTags = listDisabledOpeningTags(html);
      assert.strictEqual(
        disabledTags.length,
        1,
        `Exactly 1 button (${target.name}) should be disabled, but got ${disabledTags.length}:\n${disabledTags.join('\n')}`
      );

      const targetTag = findOpeningTag(html, `data-testid="${target.testId}"`, 'button');
      assert.ok(targetTag.includes('disabled=""'), `${target.name} must have disabled="" attribute`);

      for (const other of ACTION_BUTTONS) {
        if (other.testId === target.testId) continue;
        const otherTag = findOpeningTag(html, `data-testid="${other.testId}"`, 'button');
        assert.ok(!otherTag.includes('disabled=""'), `${other.name} must not be disabled when only ${target.name} is false`);
      }
    });
  }

  it('reflects in-flight operation with spinner icon and aria-busy on the action bar', () => {
    const props = createMockElectronicPrescriptionPrintPanelProps({
      electronicPrescriptionOperationBusy: true,
      electronicPrescriptionOperationInFlight: 'duplicate_check'
    });
    const html = renderToStaticMarkup(React.createElement(ElectronicPrescriptionPrintPanel, props));

    assert.ok(html.includes('aria-busy="true"'), 'Action container must have aria-busy="true"');
    assert.ok(html.includes('animate-spin'), 'In-flight operation button must render spinner with animate-spin');
  });
});
