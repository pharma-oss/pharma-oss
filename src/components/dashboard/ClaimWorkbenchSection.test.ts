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
      claimWorkItems: []
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
  });

  it('pins UKE export buttons as disabled when no rebilling item exists and enables close accepted button when accepted item exists', () => {
    // Only accepted item: hasExportableClaimWorkItems is false, acceptedClaimWorkItemCount is 1
    const props = createMockClaimWorkbenchSectionProps({
      claimWorkItems: [sampleAcceptedItem]
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
  });

  it('pins close accepted button as disabled when no accepted item exists and enables UKE export buttons when rebilling item exists', () => {
    // Only rebilling item: hasExportableClaimWorkItems is true, acceptedClaimWorkItemCount is 0
    const props = createMockClaimWorkbenchSectionProps({
      claimWorkItems: [sampleRebillingItem]
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
  });

  it('pins loading state and disabled attribute during isExportingUke', () => {
    const props = createMockClaimWorkbenchSectionProps();
    const html = renderWithStateOverrides(props, { isExportingUke: true });

    // The 4 UKE export buttons are disabled during export
    const ukeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
    assert.ok(ukeBtnTag.includes('disabled=""'), `一括UKE button must be disabled during isExportingUke: ${ukeBtnTag}`);
    assert.ok(html.includes('<span>作成中</span>'), 'Label must switch to 作成中');
    assert.ok(html.includes('animate-spin'), 'Spinner must be visible');

    const officialUkeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
    assert.ok(officialUkeBtnTag.includes('disabled=""'), `公式UKE button must be disabled during isExportingUke: ${officialUkeBtnTag}`);

    const closeAcceptedBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
    assert.ok(!closeAcceptedBtnTag.includes('disabled=""'), `受付済締め button must remain enabled: ${closeAcceptedBtnTag}`);
  });

  it('pins loading state and disabled attribute during isExportingOfficialUke', () => {
    const props = createMockClaimWorkbenchSectionProps();
    const html = renderWithStateOverrides(props, { isExportingOfficialUke: true });

    const officialUkeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-uke-button"', 'button');
    assert.ok(officialUkeBtnTag.includes('disabled=""'), `公式UKE button must be disabled during isExportingOfficialUke: ${officialUkeBtnTag}`);
    assert.ok(html.includes('<span>作成中</span>'), 'Label must switch to 作成中');
    assert.ok(html.includes('animate-spin'), 'Spinner must be visible');

    const ukeBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-uke-button"', 'button');
    assert.ok(ukeBtnTag.includes('disabled=""'), `一括UKE button must be disabled during isExportingOfficialUke: ${ukeBtnTag}`);
  });

  it('pins loading state and disabled attribute during isCheckingOfficialReadiness', () => {
    const props = createMockClaimWorkbenchSectionProps();
    const html = renderWithStateOverrides(props, { isCheckingOfficialReadiness: true });

    const readinessBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-official-readiness-button"', 'button');
    assert.ok(readinessBtnTag.includes('disabled=""'), `公式確認 button must be disabled during isCheckingOfficialReadiness: ${readinessBtnTag}`);
    assert.ok(html.includes('<span>確認中</span>'), 'Label must switch to 確認中');
    assert.ok(html.includes('animate-spin'), 'Spinner must be visible');
  });

  it('pins loading state and disabled attribute during isCheckingRules', () => {
    const props = createMockClaimWorkbenchSectionProps();
    const html = renderWithStateOverrides(props, { isCheckingRules: true });

    const ruleBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-rule-review-button"', 'button');
    assert.ok(ruleBtnTag.includes('disabled=""'), `算定ルール button must be disabled during isCheckingRules: ${ruleBtnTag}`);
    assert.ok(html.includes('<span>確認中</span>'), 'Label must switch to 確認中');
    assert.ok(html.includes('animate-spin'), 'Spinner must be visible');
  });

  it('pins loading state and disabled attribute during isClosingAccepted', () => {
    const props = createMockClaimWorkbenchSectionProps();
    const html = renderWithStateOverrides(props, { isClosingAccepted: true });

    const closeAcceptedBtnTag = findOpeningTag(html, 'data-testid="monthly-claim-close-accepted-button"', 'button');
    assert.ok(closeAcceptedBtnTag.includes('disabled=""'), `受付済締め button must be disabled during isClosingAccepted: ${closeAcceptedBtnTag}`);
    assert.ok(html.includes('<span>締め中</span>'), 'Label must switch to 締め中');
    assert.ok(html.includes('animate-spin'), 'Spinner must be visible');
  });

  it('pins loading state and disabled attribute during isImportingAcceptance', () => {
    const props = createMockClaimWorkbenchSectionProps();
    const html = renderWithStateOverrides(props, { isImportingAcceptance: true });

    const importAcceptanceBtnTag = findOpeningTag(html, 'data-testid="claim-acceptance-import-button"', 'button');
    assert.ok(importAcceptanceBtnTag.includes('disabled=""'), `結果取込 button must be disabled during isImportingAcceptance: ${importAcceptanceBtnTag}`);
    assert.ok(html.includes('<span>取込中</span>'), 'Label must switch to 取込中');
    assert.ok(html.includes('animate-spin'), 'Spinner must be visible');
  });
});
