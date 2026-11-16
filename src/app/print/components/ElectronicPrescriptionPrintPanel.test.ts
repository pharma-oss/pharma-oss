import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { VisitElectronicPrescription } from '@/db/types';
import type { ElectronicPrescriptionOperationKind } from '@/lib/electronic_prescription';
import {
  listDisabledOpeningTags,
  findOpeningTag,
  stripStyleBlocks
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

const ACTION_BUTTONS: readonly {
  name: string;
  testId: string;
  operation: ElectronicPrescriptionOperationKind;
  propKey: keyof Pick<
    ElectronicPrescriptionPrintPanelProps,
    | 'canRunElectronicPrescriptionDuplicateCheck'
    | 'canRegisterElectronicPrescriptionDispensingResult'
    | 'canSearchElectronicPrescriptionDispensingResult'
    | 'canChangeElectronicPrescriptionDispensingResult'
    | 'canCancelElectronicPrescriptionDispensingResult'
    | 'canCancelElectronicPrescriptionReception'
  >;
}[] = [
  {
    name: '重複確認',
    testId: 'electronic-prescription-duplicate-check-button',
    operation: 'duplicate_check',
    propKey: 'canRunElectronicPrescriptionDuplicateCheck'
  },
  {
    name: '調剤結果登録',
    testId: 'electronic-prescription-register-dispensing-result-button',
    operation: 'dispensing_result_register',
    propKey: 'canRegisterElectronicPrescriptionDispensingResult'
  },
  {
    name: '結果ID照会',
    testId: 'electronic-prescription-search-dispensing-result-button',
    operation: 'dispensing_result_search',
    propKey: 'canSearchElectronicPrescriptionDispensingResult'
  },
  {
    name: '調剤結果変更',
    testId: 'electronic-prescription-change-dispensing-result-button',
    operation: 'dispensing_result_change',
    propKey: 'canChangeElectronicPrescriptionDispensingResult'
  },
  {
    name: '結果取消',
    testId: 'electronic-prescription-cancel-dispensing-result-button',
    operation: 'dispensing_result_cancel',
    propKey: 'canCancelElectronicPrescriptionDispensingResult'
  },
  {
    name: '受付取消',
    testId: 'electronic-prescription-cancel-reception-button',
    operation: 'reception_cancel',
    propKey: 'canCancelElectronicPrescriptionReception'
  }
];

const ANIMATE_SPIN_TOKEN_PATTERN = /\bclass="[^"]*(?:\s|")animate-spin(?:\s|")/g;

function extractClassTokens(tag: string): string[] {
  const match = tag.match(/\bclass="([^"]*)"/);
  return match ? match[1].split(/\s+/).filter(Boolean) : [];
}

function renderPanel(overrides?: Partial<ElectronicPrescriptionPrintPanelProps>): string {
  return renderToStaticMarkup(
    React.createElement(ElectronicPrescriptionPrintPanel, createMockElectronicPrescriptionPrintPanelProps(overrides))
  );
}

function extractButtonSegment(html: string, testId: string): string {
  const stripped = stripStyleBlocks(html);
  const marker = `data-testid="${testId}"`;
  const markerIndex = stripped.indexOf(marker);
  assert.notStrictEqual(markerIndex, -1, `Button marker "${marker}" not found in HTML`);
  const buttonStart = stripped.lastIndexOf('<button', markerIndex);
  assert.notStrictEqual(buttonStart, -1, `Opening <button> for "${marker}" not found`);
  const buttonEnd = stripped.indexOf('</button>', markerIndex);
  assert.notStrictEqual(buttonEnd, -1, `Closing </button> for "${marker}" not found`);
  return stripped.slice(buttonStart, buttonEnd + '</button>'.length);
}

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

  it('omits supplementary display when comments, lab results, and narcotic administration are empty', () => {
    const html = renderPanel({
      electronicPrescriptionComments: [],
      electronicPrescriptionLaboratoryResults: [],
      electronicPrescriptionNarcoticAdministration: undefined
    });
    const stripped = stripStyleBlocks(html);

    assert.ok(
      !stripped.includes('data-testid="electronic-prescription-supplementary-display"'),
      'Supplementary display must not render when all supplementary fields are empty'
    );
    assert.ok(!stripped.includes('処方補足情報'), 'Supplementary heading must not render when empty');
    assert.ok(!stripped.includes('electronic-prescription-supplementary'), 'Supplementary container class must not render in markup when empty');
  });

  it('renders only prescription comments in supplementary display when only comments are provided', () => {
    const html = renderPanel({
      electronicPrescriptionComments: ['一包化希望', '粉砕不可'],
      electronicPrescriptionLaboratoryResults: [],
      electronicPrescriptionNarcoticAdministration: undefined
    });
    const stripped = stripStyleBlocks(html);
    const containerTag = findOpeningTag(html, 'data-testid="electronic-prescription-supplementary-display"', 'div');

    assert.ok(
      extractClassTokens(containerTag).includes('electronic-prescription-supplementary'),
      `Supplementary container must have exact electronic-prescription-supplementary class: ${containerTag}`
    );
    assert.ok(stripped.includes('<li>処方コメント: 一包化希望</li>'), 'First comment must be rendered');
    assert.ok(stripped.includes('<li>処方コメント: 粉砕不可</li>'), 'Second comment must be rendered');
    assert.ok(!stripped.includes('検査値:'), 'Lab results must not render when empty');
    assert.ok(!stripped.includes('麻薬施用情報:'), 'Narcotic info must not render when undefined');
  });

  it('renders laboratory results with optional unit and referenceRange formatting', () => {
    const html = renderPanel({
      electronicPrescriptionComments: [],
      electronicPrescriptionLaboratoryResults: [
        {
          testName: 'eGFR',
          value: '42.5',
          unit: 'mL/min/1.73m2',
          referenceRange: '60以上'
        },
        {
          testName: 'INR',
          value: '2.1'
        }
      ],
      electronicPrescriptionNarcoticAdministration: undefined
    });
    const stripped = stripStyleBlocks(html);
    findOpeningTag(html, 'data-testid="electronic-prescription-supplementary-display"', 'div');

    assert.ok(
      stripped.includes('<li>検査値: eGFR 42.5 mL/min/1.73m2（基準 60以上）</li>'),
      'Lab result with unit and referenceRange must render full formatting'
    );
    assert.ok(
      stripped.includes('<li>検査値: INR 2.1</li>'),
      'Lab result without unit or referenceRange must omit optional suffixes'
    );
    assert.ok(!stripped.includes('処方コメント:'), 'Comments must not render when empty');
    assert.ok(!stripped.includes('麻薬施用情報:'), 'Narcotic info must not render when undefined');
  });

  it('renders narcotic administration text and falls back to 表示不可 when displayText is empty', () => {
    const htmlWithText = renderPanel({
      electronicPrescriptionComments: [],
      electronicPrescriptionLaboratoryResults: [],
      electronicPrescriptionNarcoticAdministration: {
        isNarcoticPrescription: true,
        recordPresent: true,
        displayText: '麻薬施用者番号 12345'
      }
    });
    const strippedWithText = stripStyleBlocks(htmlWithText);
    findOpeningTag(htmlWithText, 'data-testid="electronic-prescription-supplementary-display"', 'div');
    assert.ok(strippedWithText.includes('<li>麻薬施用情報: 麻薬施用者番号 12345</li>'), 'Narcotic displayText must be rendered');
    assert.ok(!strippedWithText.includes('表示不可'), 'Fallback text must not render when displayText is non-empty');
    assert.ok(!strippedWithText.includes('処方コメント:'), 'Comments must not render when empty');
    assert.ok(!strippedWithText.includes('検査値:'), 'Lab results must not render when empty');

    for (const emptyDisplayText of ['', undefined] as const) {
      const htmlFallback = renderPanel({
        electronicPrescriptionComments: [],
        electronicPrescriptionLaboratoryResults: [],
        electronicPrescriptionNarcoticAdministration: {
          isNarcoticPrescription: true,
          recordPresent: true,
          displayText: emptyDisplayText
        }
      });
      const strippedFallback = stripStyleBlocks(htmlFallback);
      findOpeningTag(htmlFallback, 'data-testid="electronic-prescription-supplementary-display"', 'div');
      assert.ok(
        strippedFallback.includes('<li>麻薬施用情報: 表示不可</li>'),
        `Narcotic fallback 表示不可 must render when displayText is ${String(emptyDisplayText)}`
      );
    }
  });

  it('renders all three supplementary sections together when comments, labs, and narcotic info exist', () => {
    const html = renderPanel({
      electronicPrescriptionComments: ['残薬確認済み'],
      electronicPrescriptionLaboratoryResults: [{ testName: 'Scr', value: '1.4', unit: 'mg/dL' }],
      electronicPrescriptionNarcoticAdministration: {
        isNarcoticPrescription: true,
        recordPresent: true,
        displayText: '施用患者確認済み'
      }
    });
    const stripped = stripStyleBlocks(html);
    findOpeningTag(html, 'data-testid="electronic-prescription-supplementary-display"', 'div');

    assert.ok(stripped.includes('<strong>処方補足情報</strong>'), 'Supplementary heading must render');
    assert.ok(stripped.includes('<li>処方コメント: 残薬確認済み</li>'), 'Comment item must render');
    assert.ok(stripped.includes('<li>検査値: Scr 1.4 mg/dL</li>'), 'Lab result item must render');
    assert.ok(stripped.includes('<li>麻薬施用情報: 施用患者確認済み</li>'), 'Narcotic item must render');
  });

  it('sets aria-busy="false" and omits spinner icons when no operation is busy or in flight', () => {
    const html = renderPanel({
      electronicPrescriptionOperationBusy: false,
      electronicPrescriptionOperationInFlight: null
    });
    const stripped = stripStyleBlocks(html);
    const actionsTag = findOpeningTag(html, 'electronic-prescription-actions', 'div');

    assert.ok(actionsTag.includes('aria-busy="false"'), `Action bar must set aria-busy="false" when idle, got: ${actionsTag}`);
    assert.ok(!actionsTag.includes('aria-busy="true"'), 'Action bar must not set aria-busy="true" when idle');
    assert.strictEqual((stripped.match(ANIMATE_SPIN_TOKEN_PATTERN) || []).length, 0, 'No spinner icons should render when operation is not in flight');
  });

  it('renders spinner only on the active in-flight button for each of the 6 operations', () => {
    for (const active of ACTION_BUTTONS) {
      const html = renderPanel({
        electronicPrescriptionOperationBusy: true,
        electronicPrescriptionOperationInFlight: active.operation
      });
      const stripped = stripStyleBlocks(html);
      const actionsTag = findOpeningTag(html, 'electronic-prescription-actions', 'div');

      assert.ok(actionsTag.includes('aria-busy="true"'), `Action bar must set aria-busy="true" during ${active.operation}`);
      const spinMatches = stripped.match(ANIMATE_SPIN_TOKEN_PATTERN) || [];
      assert.strictEqual(spinMatches.length, 1, `Expected exactly 1 spinner during ${active.operation}, got ${spinMatches.length}`);

      const activeButtonHtml = extractButtonSegment(html, active.testId);
      assert.strictEqual(
        (activeButtonHtml.match(ANIMATE_SPIN_TOKEN_PATTERN) || []).length,
        1,
        `${active.name} button must contain spinner during ${active.operation}`
      );

      for (const other of ACTION_BUTTONS) {
        if (other.testId === active.testId) continue;
        const otherButtonHtml = extractButtonSegment(html, other.testId);
        assert.strictEqual(
          (otherButtonHtml.match(ANIMATE_SPIN_TOKEN_PATTERN) || []).length,
          0,
          `${other.name} button must not contain spinner during ${active.operation}`
        );
      }
    }
  });

  it('switches registration status badge class and optional metadata fallbacks', () => {
    const htmlRegistered = renderPanel();
    const strippedRegistered = stripStyleBlocks(htmlRegistered);
    const okBadgeTag = findOpeningTag(htmlRegistered, 'claim-lifecycle-badge', 'span');

    assert.deepStrictEqual(
      extractClassTokens(okBadgeTag),
      ['claim-lifecycle-badge', 'ok'],
      `Registered badge must have exact ok classes: ${okBadgeTag}`
    );
    assert.ok(strippedRegistered.includes('処方箋 1件 / 受付 受付済み'), 'Subtitle must show prescription count and reception label');
    assert.ok(strippedRegistered.includes('<strong>署名確認済み</strong>'), 'Valid signature label must render');
    assert.ok(strippedRegistered.includes('<strong>問題なし</strong>'), 'Passed duplicate check label must render');
    assert.ok(strippedRegistered.includes('<strong>登録済み</strong>'), 'Registered dispensing status label must render');
    assert.ok(strippedRegistered.includes('有効期限 2026/11/07'), 'ValidUntil text must render when provided');
    assert.ok(strippedRegistered.includes('反映日時 '), 'AppliedAt text must render when provided');
    assert.ok(strippedRegistered.includes('更新 2026/11/03 19:30'), 'UpdatedAt text must render when provided');
    assert.ok(strippedRegistered.includes(' / 署名日時 2026/11/03 19:30'), 'SignedAt text must render when provided');
    assert.ok(strippedRegistered.includes(' / SHA-256 a1b2c3d4e5f6'), 'Hash text must render when provided');

    const htmlUnregistered = renderPanel({
      electronicPrescription: {
        prescriptionId: 'ep-test-002',
        documentKind: 'electronic_prescription',
        sourceMode: 'connector',
        receivedAt: '2026-11-03T10:00:00Z',
        appliedAt: '',
        validUntil: '2026-11-07T23:59:59Z',
        signatureStatus: 'invalid',
        duplicateCheckStatus: 'warning',
        integrityHash: 'test-hash-sha256',
        receptionStatus: 'cancel_pending',
        dispensingResultStatus: 'pending'
      },
      electronicPrescriptionIds: ['ep-1', 'ep-2'],
      electronicPrescriptionDispensingResultStatus: 'pending',
      electronicPrescriptionReceptionStatus: 'cancel_pending',
      electronicPrescriptionSignatureStatus: 'invalid',
      electronicPrescriptionDuplicateCheckStatus: 'warning',
      electronicPrescriptionRegistered: false,
      electronicPrescriptionValidUntilText: undefined,
      electronicPrescriptionUpdatedAtText: undefined,
      electronicPrescriptionDispensingInformationSignedAtText: undefined,
      electronicPrescriptionDispensingInformationHashText: ''
    });
    const strippedUnregistered = stripStyleBlocks(htmlUnregistered);
    const warningBadgeTag = findOpeningTag(htmlUnregistered, 'claim-lifecycle-badge', 'span');

    assert.deepStrictEqual(
      extractClassTokens(warningBadgeTag),
      ['claim-lifecycle-badge', 'warning'],
      `Unregistered badge must have exact warning classes: ${warningBadgeTag}`
    );
    assert.ok(strippedUnregistered.includes('処方箋 2件 / 受付 取消確認中'), 'Subtitle must show 2 prescriptions and cancel_pending label');
    assert.ok(strippedUnregistered.includes('<strong>署名不正</strong>'), 'Invalid signature label must render');
    assert.ok(strippedUnregistered.includes('<strong>確認あり</strong>'), 'Warning duplicate check label must render');
    assert.ok(strippedUnregistered.includes('<strong>未登録</strong>'), 'Pending dispensing status label must render');
    assert.ok(strippedUnregistered.includes('有効期限の記録なし'), 'Missing validUntil fallback must render');
    assert.ok(strippedUnregistered.includes('調剤結果登録前に確認を実施してください。'), 'Missing appliedAt fallback must render');
    assert.ok(strippedUnregistered.includes('調剤完了後に登録します。'), 'Missing updatedAt fallback must render');
    assert.ok(!strippedUnregistered.includes('署名日時'), 'SignedAt must be omitted when undefined');
    assert.ok(!strippedUnregistered.includes('SHA-256'), 'Hash must be omitted when empty');
  });

  it('resolves button title tooltips across blocked, audit error, missing id, submitted, and lifecycle cases', () => {
    const blockedTitle = '端末未接続のため操作できません。';
    const htmlBlocked = renderPanel({
      electronicPrescriptionOperationBlockedTitle: blockedTitle
    });
    for (const btn of ACTION_BUTTONS) {
      const tag = findOpeningTag(htmlBlocked, `data-testid="${btn.testId}"`, 'button');
      assert.ok(tag.includes(`title="${blockedTitle}"`), `${btn.name} button must use blocked title when set: ${tag}`);
    }

    const htmlAuditError = renderPanel({
      electronicPrescriptionOperationBlockedTitle: undefined,
      prescriptionAuditErrorCount: 1,
      electronicPrescriptionRegistered: false,
      electronicPrescriptionDispensingResultStatus: 'pending'
    });
    assert.ok(
      findOpeningTag(htmlAuditError, 'data-testid="electronic-prescription-register-dispensing-result-button"', 'button')
        .includes('title="薬剤師確認の要修正項目を解消してください。"'),
      'Register button must show audit error title when prescriptionAuditErrorCount > 0'
    );
    assert.ok(
      findOpeningTag(htmlAuditError, 'data-testid="electronic-prescription-change-dispensing-result-button"', 'button')
        .includes('title="薬剤師確認の要修正項目を解消してください。"'),
      'Change button must show audit error title when prescriptionAuditErrorCount > 0'
    );

    const htmlSubmittedNoId = renderPanel({
      electronicPrescription: {
        prescriptionId: 'ep-test-003',
        documentKind: 'electronic_prescription',
        sourceMode: 'connector',
        receivedAt: '2026-11-03T10:00:00Z',
        appliedAt: '2026-11-03T10:05:00Z',
        validUntil: '2026-11-07T23:59:59Z',
        signatureStatus: 'valid',
        duplicateCheckStatus: 'passed',
        integrityHash: 'test-hash-sha256',
        receptionStatus: 'accepted',
        dispensingResultStatus: 'submitted'
      },
      electronicPrescriptionOperationBlockedTitle: undefined,
      prescriptionAuditErrorCount: 0,
      electronicPrescriptionRegistered: false,
      electronicPrescriptionDispensingResultStatus: 'submitted',
      electronicPrescriptionLifecycleDecision: (op) =>
        op === 'reception_cancel' ? { allowed: false, message: '既に受付取消済みです。' } : { allowed: true }
    });
    assert.ok(
      findOpeningTag(htmlSubmittedNoId, 'data-testid="electronic-prescription-register-dispensing-result-button"', 'button')
        .includes('title="送信済みの調剤結果を確認中です。"'),
      'Register button must show submitted title'
    );
    assert.ok(
      findOpeningTag(htmlSubmittedNoId, 'data-testid="electronic-prescription-change-dispensing-result-button"', 'button')
        .includes('title="調剤結果IDがありません。"'),
      'Change button must show missing id title when dispensingResultId is missing'
    );
    assert.ok(
      findOpeningTag(htmlSubmittedNoId, 'data-testid="electronic-prescription-cancel-dispensing-result-button"', 'button')
        .includes('title="調剤結果IDがありません。"'),
      'Cancel button must show missing id title when dispensingResultId is missing'
    );
    assert.ok(
      findOpeningTag(htmlSubmittedNoId, 'data-testid="electronic-prescription-cancel-reception-button"', 'button')
        .includes('title="既に受付取消済みです。"'),
      'Reception cancel button must reflect lifecycle decision message'
    );

    const htmlUnregisteredWithId = renderPanel({
      electronicPrescriptionOperationBlockedTitle: undefined,
      prescriptionAuditErrorCount: 0,
      electronicPrescriptionRegistered: false,
      electronicPrescriptionDispensingResultStatus: 'pending',
      electronicPrescriptionLifecycleDecision: () => ({ allowed: true })
    });
    assert.ok(
      !findOpeningTag(htmlUnregisteredWithId, 'data-testid="electronic-prescription-duplicate-check-button"', 'button').includes('title="'),
      'Duplicate check button must omit title when unblocked'
    );
    assert.ok(
      !findOpeningTag(htmlUnregisteredWithId, 'data-testid="electronic-prescription-register-dispensing-result-button"', 'button').includes('title="'),
      'Register button must omit title when pending and no audit errors'
    );
    assert.ok(
      findOpeningTag(htmlUnregisteredWithId, 'data-testid="electronic-prescription-search-dispensing-result-button"', 'button')
        .includes('title="タイムアウトや再送後に管理サービス上の調剤結果IDを確認します。"'),
      'Search button must render guidance title when unblocked'
    );
    assert.ok(
      findOpeningTag(htmlUnregisteredWithId, 'data-testid="electronic-prescription-change-dispensing-result-button"', 'button')
        .includes('title="登録済み調剤結果だけ変更できます。"'),
      'Change button must require registered result when id exists but not registered'
    );
    assert.ok(
      findOpeningTag(htmlUnregisteredWithId, 'data-testid="electronic-prescription-cancel-dispensing-result-button"', 'button')
        .includes('title="登録済み調剤結果だけ取消できます。"'),
      'Cancel button must require registered result when id exists but not registered'
    );
    assert.ok(
      !findOpeningTag(htmlUnregisteredWithId, 'data-testid="electronic-prescription-cancel-reception-button"', 'button').includes('title="'),
      'Reception cancel button must omit title when lifecycle decision has no message'
    );

    const htmlRegistered = renderPanel({
      electronicPrescriptionOperationBlockedTitle: undefined,
      prescriptionAuditErrorCount: 0,
      electronicPrescriptionRegistered: true
    });
    assert.ok(
      findOpeningTag(htmlRegistered, 'data-testid="electronic-prescription-register-dispensing-result-button"', 'button')
        .includes('title="調剤結果登録済みです。"'),
      'Register button must show already registered title when registered'
    );
    assert.ok(
      !findOpeningTag(htmlRegistered, 'data-testid="electronic-prescription-change-dispensing-result-button"', 'button').includes('title="'),
      'Change button must omit title when registered with id and no audit errors'
    );
    assert.ok(
      !findOpeningTag(htmlRegistered, 'data-testid="electronic-prescription-cancel-dispensing-result-button"', 'button').includes('title="'),
      'Cancel button must omit title when registered with id'
    );
  });
});
