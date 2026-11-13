import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  listDisabledOpeningTags,
  findOpeningTag
} from '@/lib/test_support/html_disabled_tags';
import type { DashboardClaimWorkItem, DashboardCounts } from '@/hooks/useDashboardTasks';
import {
  ClaimWorkbenchSection,
  type ClaimWorkbenchSectionProps
} from './ClaimWorkbenchSection';

function createMockCounts(overrides?: Partial<DashboardCounts>): DashboardCounts {
  return {
    todayReceptionCount: 10,
    waitingCount: 0,
    processingCount: 0,
    reviewCount: 0,
    completedCount: 10,
    pickingPendingCount: 0,
    inventoryShortageCount: 0,
    claimRiskCount: 0,
    urgentClaimRiskCount: 0,
    claimWorkbenchCount: 2,
    returnedClaimCount: 0,
    rebillingClaimCount: 1,
    followUpDueCount: 0,
    urgentFollowUpCount: 0,
    ...overrides
  };
}

const sampleRebillingItem: DashboardClaimWorkItem = {
  visitId: 'v-rebilling-1',
  patientId: 'p1',
  name: '患者 一郎',
  issueDateLabel: '11/1',
  monthLabel: '11月',
  status: 'rebilling',
  statusLabel: '再請求準備',
  priority: 'normal',
  priorityLabel: '通常',
  totalPoints: 1200,
  prescriptionCount: 2,
  latestEventLabel: '再請求準備 11/1',
  actionLabel: '月遅れ/UKE再出力'
};

const sampleAcceptedItem: DashboardClaimWorkItem = {
  visitId: 'v-accepted-1',
  patientId: 'p2',
  name: '患者 二郎',
  issueDateLabel: '11/2',
  monthLabel: '11月',
  status: 'accepted',
  statusLabel: '受付済',
  priority: 'normal',
  priorityLabel: '通常',
  totalPoints: 850,
  prescriptionCount: 1,
  latestEventLabel: '受付済 11/2',
  actionLabel: '入金確認後に締め'
};

const sampleReturnedItem: DashboardClaimWorkItem = {
  visitId: 'v-returned-1',
  patientId: 'p3',
  name: '患者 三郎',
  issueDateLabel: '11/3',
  monthLabel: '11月',
  status: 'returned',
  statusLabel: '返戻',
  priority: 'high',
  priorityLabel: '返戻対応',
  totalPoints: 2400,
  prescriptionCount: 3,
  latestEventLabel: '返戻取込 11/3',
  actionLabel: '修正して再請求へ',
  reason: '保険番号記載不備'
};

function createMockClaimWorkbenchSectionProps(
  overrides?: Partial<ClaimWorkbenchSectionProps>
): ClaimWorkbenchSectionProps {
  return {
    db: null,
    claimWorkItems: [sampleRebillingItem, sampleAcceptedItem],
    counts: createMockCounts(overrides?.counts),
    isLoading: false,
    onOpenTask: () => {},
    onRefresh: () => {},
    ...overrides
  };
}

interface StateOverrides {
  isExportingUke?: boolean;
  isExportingOfficialUke?: boolean;
  isCheckingOfficialReadiness?: boolean;
  isCheckingRules?: boolean;
  isImportingAcceptance?: boolean;
  isClosingAccepted?: boolean;
}

function renderWithStateOverrides(
  props: ClaimWorkbenchSectionProps,
  overrides: StateOverrides
): string {
  let callCount = 0;
  function Wrapper(): React.ReactNode {
    const internals = (React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
        H?: { useState?: (init: unknown) => [unknown, (v: unknown) => void] }
      }
    }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

    const dispatcher = internals?.H;
    if (dispatcher?.useState) {
      const origUseState = dispatcher.useState;
      dispatcher.useState = (initialState: unknown) => {
        const currentIndex = callCount++;
        assert.equal(
          initialState,
          false,
          `Expected ClaimWorkbenchSection useState call #${currentIndex} initial value to be false, got ${String(initialState)}`
        );

        let overrideValue = false;
        if (currentIndex === 0 && overrides.isExportingUke !== undefined) {
          overrideValue = overrides.isExportingUke;
        } else if (currentIndex === 1 && overrides.isExportingOfficialUke !== undefined) {
          overrideValue = overrides.isExportingOfficialUke;
        } else if (currentIndex === 2 && overrides.isCheckingOfficialReadiness !== undefined) {
          overrideValue = overrides.isCheckingOfficialReadiness;
        } else if (currentIndex === 3 && overrides.isCheckingRules !== undefined) {
          overrideValue = overrides.isCheckingRules;
        } else if (currentIndex === 4 && overrides.isImportingAcceptance !== undefined) {
          overrideValue = overrides.isImportingAcceptance;
        } else if (currentIndex === 5 && overrides.isClosingAccepted !== undefined) {
          overrideValue = overrides.isClosingAccepted;
        }

        if (callCount === 6) {
          dispatcher.useState = origUseState;
        }
        return [overrideValue, () => {}];
      };
    }
    return React.createElement(ClaimWorkbenchSection, props);
  }

  const html = renderToStaticMarkup(React.createElement(Wrapper));
  assert.equal(
    callCount,
    6,
    `Expected ClaimWorkbenchSection to call useState exactly 6 times, got ${callCount}`
  );
  return html;
}

describe('ClaimWorkbenchSection component contracts and UI disabled states', () => {
  it('exports ClaimWorkbenchSection as a callable React component function', () => {
    assert.equal(typeof ClaimWorkbenchSection, 'function');
  });

  it('renders normal ready state with all 8 action buttons enabled and no spinner', () => {
    const props = createMockClaimWorkbenchSectionProps();
    const html = renderToStaticMarkup(React.createElement(ClaimWorkbenchSection, props));

    // Structural expectations
    assert.ok(html.includes('レセプト点検・月次請求ワークベンチ'), 'Section title should be present');
    assert.ok(
      html.includes('当月・過去分のUKE出力済み、返戻対応、再請求/月遅れ準備'),
      'Section description should be present'
    );

    // When rebilling and accepted items exist and no in-flight task is running, 0 buttons should be disabled
    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      0,
      `In ready state, exactly 0 action buttons should be disabled, got ${disabledTags.length}:\n${disabledTags.join('\n')}`
    );

    // Verify all 8 individual buttons are enabled
    const ukeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
    assert.ok(!ukeBtnTag.includes('disabled=""'), `一括UKE button must not be disabled: ${ukeBtnTag}`);
    assert.ok(html.includes('<span>一括UKE</span>'), 'Label should be 一括UKE');

    const officialUkeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
    assert.ok(!officialUkeBtnTag.includes('disabled=""'), `公式UKE button must not be disabled: ${officialUkeBtnTag}`);
    assert.ok(html.includes('<span>公式UKE</span>'), 'Label should be 公式UKE');

    const readinessBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-readiness-button"', 'button');
    assert.ok(!readinessBtnTag.includes('disabled=""'), `公式確認 button must not be disabled: ${readinessBtnTag}`);
    assert.ok(html.includes('<span>公式確認</span>'), 'Label should be 公式確認');

    const ruleBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-rule-review-button"', 'button');
    assert.ok(!ruleBtnTag.includes('disabled=""'), `算定ルール button must not be disabled: ${ruleBtnTag}`);
    assert.ok(html.includes('<span>算定ルール</span>'), 'Label should be 算定ルール');

    const closeAcceptedBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
    assert.ok(!closeAcceptedBtnTag.includes('disabled=""'), `受付済締め button must not be disabled: ${closeAcceptedBtnTag}`);
    assert.ok(html.includes('<span>受付済締め</span>'), 'Label should be 受付済締め');

    const importAcceptanceBtnTag = findOpeningTag(html, 'data-testid="claim-acceptance-import-button"', 'button');
    assert.ok(!importAcceptanceBtnTag.includes('disabled=""'), `結果取込 button must not be disabled: ${importAcceptanceBtnTag}`);
    assert.ok(html.includes('<span>結果取込</span>'), 'Label should be 結果取込');

    const memoBtnTag = findOpeningTag(html, '<span>請求メモ</span>', 'button');
    assert.ok(!memoBtnTag.includes('disabled=""'), `請求メモ button must not be disabled: ${memoBtnTag}`);

    const csvBtnTag = findOpeningTag(html, '<span>CSV</span>', 'button');
    assert.ok(!csvBtnTag.includes('disabled=""'), `CSV button must not be disabled: ${csvBtnTag}`);

    // No spinner in ready state
    assert.ok(!html.includes('animate-spin'), 'Spinner should not be present in ready state');
  });

  it('pins all claim-dependent buttons as disabled when claimWorkItems is empty', () => {
    const props = createMockClaimWorkbenchSectionProps({
      claimWorkItems: [],
      counts: createMockCounts({ claimWorkbenchCount: 0 })
    });
    const html = renderToStaticMarkup(React.createElement(ClaimWorkbenchSection, props));

    // When empty, 7 buttons are disabled (4 UKE export buttons, close accepted, memo, csv), while import acceptance remains enabled
    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      7,
      `When claimWorkItems is empty, exactly 7 buttons should be disabled, got ${disabledTags.length}:\n${disabledTags.join('\n')}`
    );

    const ukeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
    assert.ok(ukeBtnTag.includes('disabled=""'), `一括UKE button must be disabled: ${ukeBtnTag}`);

    const officialUkeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
    assert.ok(officialUkeBtnTag.includes('disabled=""'), `公式UKE button must be disabled: ${officialUkeBtnTag}`);

    const readinessBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-readiness-button"', 'button');
    assert.ok(readinessBtnTag.includes('disabled=""'), `公式確認 button must be disabled: ${readinessBtnTag}`);

    const ruleBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-rule-review-button"', 'button');
    assert.ok(ruleBtnTag.includes('disabled=""'), `算定ルール button must be disabled: ${ruleBtnTag}`);

    const closeAcceptedBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
    assert.ok(closeAcceptedBtnTag.includes('disabled=""'), `受付済締め button must be disabled: ${closeAcceptedBtnTag}`);

    const memoBtnTag = findOpeningTag(html, '<span>請求メモ</span>', 'button');
    assert.ok(memoBtnTag.includes('disabled=""'), `請求メモ button must be disabled: ${memoBtnTag}`);

    const csvBtnTag = findOpeningTag(html, '<span>CSV</span>', 'button');
    assert.ok(csvBtnTag.includes('disabled=""'), `CSV button must be disabled: ${csvBtnTag}`);

    // Import acceptance button does not depend on claim items
    const importAcceptanceBtnTag = findOpeningTag(html, 'data-testid="claim-acceptance-import-button"', 'button');
    assert.ok(!importAcceptanceBtnTag.includes('disabled=""'), `結果取込 button should remain enabled: ${importAcceptanceBtnTag}`);

    assert.ok(
      html.includes('現在、月次請求で未締めの返戻・再請求ワークはありません。'),
      'Empty state message should be present'
    );
    assert.ok(html.includes('<span class="section-count">0件</span>'), '0件 count badge should be present');
  });

  it('pins UKE export buttons as disabled when no rebilling item exists and enables close accepted button when accepted item exists', () => {
    // Only accepted item: hasExportableClaimWorkItems is false, acceptedClaimWorkItemCount is 1
    const props = createMockClaimWorkbenchSectionProps({
      claimWorkItems: [sampleAcceptedItem],
      counts: createMockCounts({ claimWorkbenchCount: 1 })
    });
    const html = renderToStaticMarkup(React.createElement(ClaimWorkbenchSection, props));

    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      4,
      `When only accepted items exist, exactly 4 UKE buttons should be disabled, got ${disabledTags.length}:\n${disabledTags.join('\n')}`
    );

    const ukeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
    assert.ok(ukeBtnTag.includes('disabled=""'), `一括UKE button must be disabled: ${ukeBtnTag}`);

    const officialUkeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
    assert.ok(officialUkeBtnTag.includes('disabled=""'), `公式UKE button must be disabled: ${officialUkeBtnTag}`);

    const readinessBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-readiness-button"', 'button');
    assert.ok(readinessBtnTag.includes('disabled=""'), `公式確認 button must be disabled: ${readinessBtnTag}`);

    const ruleBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-rule-review-button"', 'button');
    assert.ok(ruleBtnTag.includes('disabled=""'), `算定ルール button must be disabled: ${ruleBtnTag}`);

    // close accepted, import acceptance, memo, and csv must be enabled
    const closeAcceptedBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
    assert.ok(!closeAcceptedBtnTag.includes('disabled=""'), `受付済締め button must be enabled: ${closeAcceptedBtnTag}`);

    const memoBtnTag = findOpeningTag(html, '<span>請求メモ</span>', 'button');
    assert.ok(!memoBtnTag.includes('disabled=""'), `請求メモ button must be enabled: ${memoBtnTag}`);

    const csvBtnTag = findOpeningTag(html, '<span>CSV</span>', 'button');
    assert.ok(!csvBtnTag.includes('disabled=""'), `CSV button must be enabled: ${csvBtnTag}`);

    assert.ok(html.includes('<span class="section-count">受付済 1</span>'), '受付済 1 badge should be present');
    assert.ok(html.includes('<span class="section-count">1件</span>'), '1件 count badge should be present');
  });

  it('pins close accepted button as disabled when no accepted item exists and enables UKE export buttons when rebilling item exists', () => {
    // Only rebilling item: hasExportableClaimWorkItems is true, acceptedClaimWorkItemCount is 0
    const props = createMockClaimWorkbenchSectionProps({
      claimWorkItems: [sampleRebillingItem],
      counts: createMockCounts({ claimWorkbenchCount: 1, rebillingClaimCount: 1 })
    });
    const html = renderToStaticMarkup(React.createElement(ClaimWorkbenchSection, props));

    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      1,
      `When only rebilling items exist, exactly 1 button (受付済締め) should be disabled, got ${disabledTags.length}:\n${disabledTags.join('\n')}`
    );

    const closeAcceptedBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
    assert.ok(closeAcceptedBtnTag.includes('disabled=""'), `受付済締め button must be disabled: ${closeAcceptedBtnTag}`);

    const ukeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
    assert.ok(!ukeBtnTag.includes('disabled=""'), `一括UKE button must be enabled: ${ukeBtnTag}`);

    const officialUkeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
    assert.ok(!officialUkeBtnTag.includes('disabled=""'), `公式UKE button must be enabled: ${officialUkeBtnTag}`);

    const readinessBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-readiness-button"', 'button');
    assert.ok(!readinessBtnTag.includes('disabled=""'), `公式確認 button must be enabled: ${readinessBtnTag}`);

    const ruleBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-rule-review-button"', 'button');
    assert.ok(!ruleBtnTag.includes('disabled=""'), `算定ルール button must be enabled: ${ruleBtnTag}`);

    assert.ok(html.includes('<span class="section-count">再請求 1</span>'), '再請求 1 badge should be present');
    assert.ok(html.includes('<span class="section-count">1件</span>'), '1件 count badge should be present');
  });

  it('pins all export, review, and close buttons as disabled while enabling memo, csv, and import for returned items, and renders returned badge', () => {
    // Returned item: hasExportableClaimWorkItems is false, acceptedClaimWorkItemCount is 0
    const props = createMockClaimWorkbenchSectionProps({
      claimWorkItems: [sampleReturnedItem],
      counts: createMockCounts({ claimWorkbenchCount: 1, returnedClaimCount: 1 })
    });
    const html = renderToStaticMarkup(React.createElement(ClaimWorkbenchSection, props));

    // 5 buttons disabled: uke, officialUke, readiness, rule, closeAccepted
    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      5,
      `When only returned items exist, exactly 5 buttons should be disabled, got ${disabledTags.length}:\n${disabledTags.join('\n')}`
    );

    const ukeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
    assert.ok(ukeBtnTag.includes('disabled=""'), `一括UKE button must be disabled for returned-only: ${ukeBtnTag}`);

    const officialUkeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
    assert.ok(officialUkeBtnTag.includes('disabled=""'), `公式UKE button must be disabled for returned-only: ${officialUkeBtnTag}`);

    const readinessBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-readiness-button"', 'button');
    assert.ok(readinessBtnTag.includes('disabled=""'), `公式確認 button must be disabled for returned-only: ${readinessBtnTag}`);

    const ruleBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-rule-review-button"', 'button');
    assert.ok(ruleBtnTag.includes('disabled=""'), `算定ルール button must be disabled for returned-only: ${ruleBtnTag}`);

    const closeAcceptedBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
    assert.ok(closeAcceptedBtnTag.includes('disabled=""'), `受付済締め button must be disabled for returned-only: ${closeAcceptedBtnTag}`);

    const memoBtnTag = findOpeningTag(html, '<span>請求メモ</span>', 'button');
    assert.ok(!memoBtnTag.includes('disabled=""'), `請求メモ button must be enabled: ${memoBtnTag}`);

    const csvBtnTag = findOpeningTag(html, '<span>CSV</span>', 'button');
    assert.ok(!csvBtnTag.includes('disabled=""'), `CSV button must be enabled: ${csvBtnTag}`);

    const importAcceptanceBtnTag = findOpeningTag(html, 'data-testid="claim-acceptance-import-button"', 'button');
    assert.ok(!importAcceptanceBtnTag.includes('disabled=""'), `結果取込 button must be enabled: ${importAcceptanceBtnTag}`);

    assert.ok(html.includes('<span class="section-count urgent">返戻 1</span>'), '返戻 1 urgent badge should be present');
    assert.ok(html.includes('<span class="section-count">1件</span>'), '1件 count badge should be present');
    assert.ok(html.includes('修正して再請求へ'), 'Returned action label should be present');
  });

  function getButtonSnippet(html: string, testId: string): string {
    const marker = `data-testid="${testId}"`;
    const markerIndex = html.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error(`data-testid="${testId}" not found in HTML`);
    }
    const buttonStart = html.lastIndexOf('<button', markerIndex);
    const buttonEnd = html.indexOf('</button>', markerIndex);
    if (buttonStart === -1 || buttonEnd === -1) {
      throw new Error(`Cannot delimit <button> tags for data-testid="${testId}"`);
    }
    return html.slice(buttonStart, buttonEnd + 9);
  }

  it('pins mutual exclusion across all 4 UKE export and review buttons when any export or review operation is in-flight', () => {
    const props = createMockClaimWorkbenchSectionProps();
    const operations: Array<keyof StateOverrides> = [
      'isExportingUke',
      'isExportingOfficialUke',
      'isCheckingOfficialReadiness',
      'isCheckingRules'
    ];

    for (const op of operations) {
      const html = renderWithStateOverrides(props, { [op]: true });

      const ukeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
      const officialUkeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
      const readinessBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-readiness-button"', 'button');
      const ruleBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-rule-review-button"', 'button');

      assert.ok(
        ukeBtnTag.includes('disabled=""'),
        `一括UKE button must be disabled during ${op}: ${ukeBtnTag}`
      );
      assert.ok(
        officialUkeBtnTag.includes('disabled=""'),
        `公式UKE button must be disabled during ${op}: ${officialUkeBtnTag}`
      );
      assert.ok(
        readinessBtnTag.includes('disabled=""'),
        `公式確認 button must be disabled during ${op}: ${readinessBtnTag}`
      );
      assert.ok(
        ruleBtnTag.includes('disabled=""'),
        `算定ルール button must be disabled during ${op}: ${ruleBtnTag}`
      );

      // Non-UKE buttons must remain enabled
      const closeAcceptedBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
      assert.ok(
        !closeAcceptedBtnTag.includes('disabled=""'),
        `受付済締め button must remain enabled during ${op}: ${closeAcceptedBtnTag}`
      );

      const importAcceptanceBtnTag = findOpeningTag(html, 'data-testid="claim-acceptance-import-button"', 'button');
      assert.ok(
        !importAcceptanceBtnTag.includes('disabled=""'),
        `結果取込 button must remain enabled during ${op}: ${importAcceptanceBtnTag}`
      );
    }
  });

  it('pins loading state and disabled attribute during isExportingUke', () => {
    const props = createMockClaimWorkbenchSectionProps();
    const html = renderWithStateOverrides(props, { isExportingUke: true });

    // The 4 UKE export buttons are disabled during export
    const ukeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
    assert.ok(ukeBtnTag.includes('disabled=""'), `一括UKE button must be disabled during isExportingUke: ${ukeBtnTag}`);
    const ukeSnippet = getButtonSnippet(html, 'monthly-claim-uke-button');
    assert.ok(ukeSnippet.includes('<span>作成中</span>'), 'UKE label must switch to 作成中');
    assert.ok(ukeSnippet.includes('animate-spin'), 'UKE spinner must be visible');

    const officialUkeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
    assert.ok(officialUkeBtnTag.includes('disabled=""'), `公式UKE button must be disabled during isExportingUke: ${officialUkeBtnTag}`);
    const officialUkeSnippet = getButtonSnippet(html, 'monthly-claim-official-uke-button');
    assert.ok(officialUkeSnippet.includes('<span>公式UKE</span>'), 'Official UKE label must remain 公式UKE');
    assert.ok(!officialUkeSnippet.includes('animate-spin'), 'Official UKE spinner must not be visible');

    const readinessBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-readiness-button"', 'button');
    assert.ok(readinessBtnTag.includes('disabled=""'), `公式確認 button must be disabled during isExportingUke: ${readinessBtnTag}`);
    const readinessSnippet = getButtonSnippet(html, 'monthly-claim-official-readiness-button');
    assert.ok(readinessSnippet.includes('<span>公式確認</span>'), 'Official readiness label must remain 公式確認');
    assert.ok(!readinessSnippet.includes('animate-spin'), 'Official readiness spinner must not be visible');

    const ruleBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-rule-review-button"', 'button');
    assert.ok(ruleBtnTag.includes('disabled=""'), `算定ルール button must be disabled during isExportingUke: ${ruleBtnTag}`);
    const ruleSnippet = getButtonSnippet(html, 'monthly-claim-rule-review-button');
    assert.ok(ruleSnippet.includes('<span>算定ルール</span>'), 'Rule review label must remain 算定ルール');
    assert.ok(!ruleSnippet.includes('animate-spin'), 'Rule review spinner must not be visible');

    const closeAcceptedBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
    assert.ok(!closeAcceptedBtnTag.includes('disabled=""'), `受付済締め button must remain enabled: ${closeAcceptedBtnTag}`);

    const importAcceptanceBtnTag = findOpeningTag(html, 'data-testid="claim-acceptance-import-button"', 'button');
    assert.ok(!importAcceptanceBtnTag.includes('disabled=""'), `結果取込 button must remain enabled: ${importAcceptanceBtnTag}`);
  });

  it('pins loading state and disabled attribute during isExportingOfficialUke', () => {
    const props = createMockClaimWorkbenchSectionProps();
    const html = renderWithStateOverrides(props, { isExportingOfficialUke: true });

    const officialUkeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
    assert.ok(officialUkeBtnTag.includes('disabled=""'), `公式UKE button must be disabled during isExportingOfficialUke: ${officialUkeBtnTag}`);
    const officialUkeSnippet = getButtonSnippet(html, 'monthly-claim-official-uke-button');
    assert.ok(officialUkeSnippet.includes('<span>作成中</span>'), 'Official UKE label must switch to 作成中');
    assert.ok(officialUkeSnippet.includes('animate-spin'), 'Official UKE spinner must be visible');

    const ukeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
    assert.ok(ukeBtnTag.includes('disabled=""'), `一括UKE button must be disabled during isExportingOfficialUke: ${ukeBtnTag}`);
    const ukeSnippet = getButtonSnippet(html, 'monthly-claim-uke-button');
    assert.ok(ukeSnippet.includes('<span>一括UKE</span>'), 'UKE label must remain 一括UKE');
    assert.ok(!ukeSnippet.includes('animate-spin'), 'UKE spinner must not be visible');

    const readinessBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-readiness-button"', 'button');
    assert.ok(readinessBtnTag.includes('disabled=""'), `公式確認 button must be disabled during isExportingOfficialUke: ${readinessBtnTag}`);
    const readinessSnippet = getButtonSnippet(html, 'monthly-claim-official-readiness-button');
    assert.ok(readinessSnippet.includes('<span>公式確認</span>'), 'Official readiness label must remain 公式確認');
    assert.ok(!readinessSnippet.includes('animate-spin'), 'Official readiness spinner must not be visible');

    const ruleBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-rule-review-button"', 'button');
    assert.ok(ruleBtnTag.includes('disabled=""'), `算定ルール button must be disabled during isExportingOfficialUke: ${ruleBtnTag}`);
    const ruleSnippet = getButtonSnippet(html, 'monthly-claim-rule-review-button');
    assert.ok(ruleSnippet.includes('<span>算定ルール</span>'), 'Rule review label must remain 算定ルール');
    assert.ok(!ruleSnippet.includes('animate-spin'), 'Rule review spinner must not be visible');

    const closeAcceptedBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
    assert.ok(!closeAcceptedBtnTag.includes('disabled=""'), `受付済締め button must remain enabled: ${closeAcceptedBtnTag}`);

    const importAcceptanceBtnTag = findOpeningTag(html, 'data-testid="claim-acceptance-import-button"', 'button');
    assert.ok(!importAcceptanceBtnTag.includes('disabled=""'), `結果取込 button must remain enabled: ${importAcceptanceBtnTag}`);
  });

  it('pins loading state and disabled attribute during isCheckingOfficialReadiness', () => {
    const props = createMockClaimWorkbenchSectionProps();
    const html = renderWithStateOverrides(props, { isCheckingOfficialReadiness: true });

    const readinessBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-readiness-button"', 'button');
    assert.ok(readinessBtnTag.includes('disabled=""'), `公式確認 button must be disabled during isCheckingOfficialReadiness: ${readinessBtnTag}`);
    const readinessSnippet = getButtonSnippet(html, 'monthly-claim-official-readiness-button');
    assert.ok(readinessSnippet.includes('<span>確認中</span>'), 'Official readiness label must switch to 確認中');
    assert.ok(readinessSnippet.includes('animate-spin'), 'Official readiness spinner must be visible');

    const ukeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
    assert.ok(ukeBtnTag.includes('disabled=""'), `一括UKE button must be disabled during isCheckingOfficialReadiness: ${ukeBtnTag}`);
    const ukeSnippet = getButtonSnippet(html, 'monthly-claim-uke-button');
    assert.ok(ukeSnippet.includes('<span>一括UKE</span>'), 'UKE label must remain 一括UKE');
    assert.ok(!ukeSnippet.includes('animate-spin'), 'UKE spinner must not be visible');

    const officialUkeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
    assert.ok(officialUkeBtnTag.includes('disabled=""'), `公式UKE button must be disabled during isCheckingOfficialReadiness: ${officialUkeBtnTag}`);
    const officialUkeSnippet = getButtonSnippet(html, 'monthly-claim-official-uke-button');
    assert.ok(officialUkeSnippet.includes('<span>公式UKE</span>'), 'Official UKE label must remain 公式UKE');
    assert.ok(!officialUkeSnippet.includes('animate-spin'), 'Official UKE spinner must not be visible');

    const ruleBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-rule-review-button"', 'button');
    assert.ok(ruleBtnTag.includes('disabled=""'), `算定ルール button must be disabled during isCheckingOfficialReadiness: ${ruleBtnTag}`);
    const ruleSnippet = getButtonSnippet(html, 'monthly-claim-rule-review-button');
    assert.ok(ruleSnippet.includes('<span>算定ルール</span>'), 'Rule review label must remain 算定ルール');
    assert.ok(!ruleSnippet.includes('animate-spin'), 'Rule review spinner must not be visible');

    const closeAcceptedBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
    assert.ok(!closeAcceptedBtnTag.includes('disabled=""'), `受付済締め button must remain enabled: ${closeAcceptedBtnTag}`);

    const importAcceptanceBtnTag = findOpeningTag(html, 'data-testid="claim-acceptance-import-button"', 'button');
    assert.ok(!importAcceptanceBtnTag.includes('disabled=""'), `結果取込 button must remain enabled: ${importAcceptanceBtnTag}`);
  });

  it('pins loading state and disabled attribute during isCheckingRules', () => {
    const props = createMockClaimWorkbenchSectionProps();
    const html = renderWithStateOverrides(props, { isCheckingRules: true });

    const ruleBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-rule-review-button"', 'button');
    assert.ok(ruleBtnTag.includes('disabled=""'), `算定ルール button must be disabled during isCheckingRules: ${ruleBtnTag}`);
    const ruleSnippet = getButtonSnippet(html, 'monthly-claim-rule-review-button');
    assert.ok(ruleSnippet.includes('<span>確認中</span>'), 'Rule review label must switch to 確認中');
    assert.ok(ruleSnippet.includes('animate-spin'), 'Rule review spinner must be visible');

    const ukeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
    assert.ok(ukeBtnTag.includes('disabled=""'), `一括UKE button must be disabled during isCheckingRules: ${ukeBtnTag}`);
    const ukeSnippet = getButtonSnippet(html, 'monthly-claim-uke-button');
    assert.ok(ukeSnippet.includes('<span>一括UKE</span>'), 'UKE label must remain 一括UKE');
    assert.ok(!ukeSnippet.includes('animate-spin'), 'UKE spinner must not be visible');

    const officialUkeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
    assert.ok(officialUkeBtnTag.includes('disabled=""'), `公式UKE button must be disabled during isCheckingRules: ${officialUkeBtnTag}`);
    const officialUkeSnippet = getButtonSnippet(html, 'monthly-claim-official-uke-button');
    assert.ok(officialUkeSnippet.includes('<span>公式UKE</span>'), 'Official UKE label must remain 公式UKE');
    assert.ok(!officialUkeSnippet.includes('animate-spin'), 'Official UKE spinner must not be visible');

    const readinessBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-readiness-button"', 'button');
    assert.ok(readinessBtnTag.includes('disabled=""'), `公式確認 button must be disabled during isCheckingRules: ${readinessBtnTag}`);
    const readinessSnippet = getButtonSnippet(html, 'monthly-claim-official-readiness-button');
    assert.ok(readinessSnippet.includes('<span>公式確認</span>'), 'Official readiness label must remain 公式確認');
    assert.ok(!readinessSnippet.includes('animate-spin'), 'Official readiness spinner must not be visible');

    const closeAcceptedBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
    assert.ok(!closeAcceptedBtnTag.includes('disabled=""'), `受付済締め button must remain enabled: ${closeAcceptedBtnTag}`);

    const importAcceptanceBtnTag = findOpeningTag(html, 'data-testid="claim-acceptance-import-button"', 'button');
    assert.ok(!importAcceptanceBtnTag.includes('disabled=""'), `結果取込 button must remain enabled: ${importAcceptanceBtnTag}`);
  });

  it('pins loading state and disabled attribute during isClosingAccepted', () => {
    const props = createMockClaimWorkbenchSectionProps();
    const html = renderWithStateOverrides(props, { isClosingAccepted: true });

    const closeAcceptedBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
    assert.ok(closeAcceptedBtnTag.includes('disabled=""'), `受付済締め button must be disabled during isClosingAccepted: ${closeAcceptedBtnTag}`);
    const closeAcceptedSnippet = getButtonSnippet(html, 'monthly-claim-close-accepted-button');
    assert.ok(closeAcceptedSnippet.includes('<span>締め中</span>'), 'Label must switch to 締め中');
    assert.ok(closeAcceptedSnippet.includes('animate-spin'), 'Spinner must be visible');

    // UKE buttons should remain enabled when items exist
    const ukeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
    assert.ok(!ukeBtnTag.includes('disabled=""'), `一括UKE button must remain enabled during isClosingAccepted: ${ukeBtnTag}`);

    const officialUkeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
    assert.ok(!officialUkeBtnTag.includes('disabled=""'), `公式UKE button must remain enabled during isClosingAccepted: ${officialUkeBtnTag}`);
  });

  it('pins loading state and disabled attribute during isImportingAcceptance', () => {
    const props = createMockClaimWorkbenchSectionProps();
    const html = renderWithStateOverrides(props, { isImportingAcceptance: true });

    const importAcceptanceBtnTag = findOpeningTag(html, 'data-testid="claim-acceptance-import-button"', 'button');
    assert.ok(importAcceptanceBtnTag.includes('disabled=""'), `結果取込 button must be disabled during isImportingAcceptance: ${importAcceptanceBtnTag}`);
    const importAcceptanceSnippet = getButtonSnippet(html, 'claim-acceptance-import-button');
    assert.ok(importAcceptanceSnippet.includes('<span>取込中</span>'), 'Label must switch to 取込中');
    assert.ok(importAcceptanceSnippet.includes('animate-spin'), 'Spinner must be visible');

    // UKE buttons should remain enabled when items exist
    const ukeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
    assert.ok(!ukeBtnTag.includes('disabled=""'), `一括UKE button must remain enabled during isImportingAcceptance: ${ukeBtnTag}`);
  });
});
