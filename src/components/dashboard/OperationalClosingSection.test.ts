import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  listDisabledOpeningTags,
  findOpeningTag
} from '@/lib/test_support/html_disabled_tags';
import { buildOperationalKpis } from '@/lib/operational_kpi';
import { DEFAULT_BACKUP_SCHEDULE_POLICY } from '@/lib/backup';
import type { FacilitySettings } from '@/db/types';
import type { DashboardCounts } from '@/lib/dashboard_tasks';
import {
  OperationalClosingSection,
  type OperationalClosingSectionProps
} from './OperationalClosingSection';

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
    claimWorkbenchCount: 0,
    returnedClaimCount: 0,
    rebillingClaimCount: 0,
    followUpDueCount: 0,
    urgentFollowUpCount: 0,
    ...overrides
  };
}

function createMockFacilitySettings(overrides?: Partial<FacilitySettings>): FacilitySettings {
  return {
    id: 'fac-test-001',
    pharmacyName: 'テスト薬局',
    pharmacyCode: '1234567',
    baseFeeCategory: '1',
    regionalSupportAddition: 'none',
    medicalDxAddition: false,
    ...overrides
  };
}

function createMockOperationalClosingSectionProps(
  overrides?: Partial<OperationalClosingSectionProps>
): OperationalClosingSectionProps {
  const counts = createMockCounts(overrides?.counts);
  const kpis = overrides?.kpis ?? buildOperationalKpis({
    visits: [],
    soapRecords: [],
    counts,
    basisDate: new Date('2026-11-04T12:00:00+09:00')
  });

  return {
    db: null,
    kpis,
    counts,
    claimRisks: [],
    inventoryRisks: [],
    claimWorkItems: [],
    followUpCandidates: [],
    auditLogs: [],
    facilitySettings: createMockFacilitySettings(),
    backupSchedulePolicy: DEFAULT_BACKUP_SCHEDULE_POLICY,
    onRefresh: () => {},
    ...overrides
  };
}

function renderWithIsRecordingClosing(
  props: OperationalClosingSectionProps,
  isRecordingClosingOverride: boolean
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
        if (currentIndex === 0) {
          assert.equal(
            initialState,
            false,
            `Expected OperationalClosingSection useState call #0 initial value to be false (isRecordingClosing), got ${String(initialState)}`
          );
          dispatcher.useState = origUseState;
          return [isRecordingClosingOverride, () => {}];
        }
        return origUseState(initialState);
      };
    }
    return React.createElement(OperationalClosingSection, props);
  }

  const html = renderToStaticMarkup(React.createElement(Wrapper));
  assert.equal(
    callCount,
    1,
    `Expected OperationalClosingSection to call useState exactly 1 time, got ${callCount}`
  );
  return html;
}

describe('OperationalClosingSection component contracts', () => {
  it('exports OperationalClosingSection as a callable React component function', () => {
    assert.equal(typeof OperationalClosingSection, 'function');
  });

  it('renders normal ready state with all action buttons enabled and no spinner', () => {
    const props = createMockOperationalClosingSectionProps();
    const html = renderToStaticMarkup(React.createElement(OperationalClosingSection, props));

    // Structural expectations
    assert.ok(html.includes('日次・月次KPI'), 'Section header should contain title');
    assert.ok(
      html.includes('受付から薬歴、請求、在庫、フォローまで、今日を締められるかを横断して見ます。'),
      'Section header should contain description'
    );
    assert.ok(html.includes('本日完了率'), 'KPI card 本日完了率 should be rendered');
    assert.ok(html.includes('平均処理時間'), 'KPI card 平均処理時間 should be rendered');
    assert.ok(html.includes('閉店前残タスク'), 'KPI card 閉店前残タスク should be rendered');
    assert.ok(html.includes('月次請求締め率'), 'KPI card 月次請求締め率 should be rendered');
    assert.ok(html.includes('バックアップ確認'), 'KPI card バックアップ確認 should be rendered');

    // Action buttons disabled state
    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      0,
      `When isRecordingClosing is false, exactly 0 disabled="" tags should be present, got ${disabledTags.length}:\n${disabledTags.join('\n')}`
    );

    const approveBtnTag = findOpeningTag(html, '<span>締め承認</span>', 'button');
    assert.ok(!approveBtnTag.includes('disabled=""'), `締め承認 button must not be disabled: ${approveBtnTag}`);

    const memoBtnTag = findOpeningTag(html, '<span>締めメモ</span>', 'button');
    assert.ok(!memoBtnTag.includes('disabled=""'), `締めメモ button must not be disabled: ${memoBtnTag}`);

    const csvBtnTag = findOpeningTag(html, '<span>締めCSV</span>', 'button');
    assert.ok(!csvBtnTag.includes('disabled=""'), `締めCSV button must not be disabled: ${csvBtnTag}`);

    // No spinner in ready state
    assert.ok(!html.includes('animate-spin'), 'Spinner should not be present in normal ready state');
  });

  it('renders recording state with 締め承認 button disabled and spinner visible', () => {
    const props = createMockOperationalClosingSectionProps();
    const html = renderWithIsRecordingClosing(props, true);

    // Only 締め承認 button should be disabled
    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      1,
      `When isRecordingClosing is true, exactly 1 disabled="" action button tag should be present, got ${disabledTags.length}:\n${disabledTags.join('\n')}`
    );

    const approveBtnTag = findOpeningTag(html, '<span>締め承認</span>', 'button');
    assert.ok(
      approveBtnTag.includes('disabled=""'),
      `締め承認 button must be disabled when isRecordingClosing is true: ${approveBtnTag}`
    );

    const memoBtnTag = findOpeningTag(html, '<span>締めメモ</span>', 'button');
    assert.ok(!memoBtnTag.includes('disabled=""'), `締めメモ button must remain enabled: ${memoBtnTag}`);

    const csvBtnTag = findOpeningTag(html, '<span>締めCSV</span>', 'button');
    assert.ok(!csvBtnTag.includes('disabled=""'), `締めCSV button must remain enabled: ${csvBtnTag}`);

    // Spinner should be visible in recording state
    assert.ok(html.includes('animate-spin'), 'Spinner should be visible when isRecordingClosing is true');
  });

  it('pins individual disabled state for 締め承認 button during isRecordingClosing', () => {
    const props = createMockOperationalClosingSectionProps();
    const readyHtml = renderToStaticMarkup(React.createElement(OperationalClosingSection, props));
    const readyApproveBtn = findOpeningTag(readyHtml, '<span>締め承認</span>', 'button');
    assert.ok(
      !readyApproveBtn.includes('disabled=""'),
      `Ready state must not have disabled attribute on 締め承認 button: ${readyApproveBtn}`
    );

    const recordingHtml = renderWithIsRecordingClosing(props, true);
    const recordingApproveBtn = findOpeningTag(recordingHtml, '<span>締め承認</span>', 'button');
    assert.ok(
      recordingApproveBtn.includes('disabled=""'),
      `Recording state must have disabled attribute on 締め承認 button: ${recordingApproveBtn}`
    );
  });

  it('pins loading spinner visibility for 締め承認 button during isRecordingClosing', () => {
    const props = createMockOperationalClosingSectionProps();
    const readyHtml = renderToStaticMarkup(React.createElement(OperationalClosingSection, props));
    assert.ok(
      !readyHtml.includes('animate-spin'),
      'Ready state must not render animate-spin loading spinner'
    );

    const recordingHtml = renderWithIsRecordingClosing(props, true);
    assert.ok(
      recordingHtml.includes('animate-spin'),
      'Recording state must render animate-spin loading spinner'
    );
  });

  it('reflects urgent class when closing status is not clear', () => {
    // 1. Clear status
    const clearCounts = createMockCounts({
      todayReceptionCount: 10,
      completedCount: 10,
      waitingCount: 0,
      processingCount: 0,
      reviewCount: 0,
      pickingPendingCount: 0,
      inventoryShortageCount: 0,
      urgentClaimRiskCount: 0,
      returnedClaimCount: 0,
      rebillingClaimCount: 0,
      urgentFollowUpCount: 0
    });
    const clearKpis = buildOperationalKpis({
      visits: [],
      soapRecords: [],
      counts: clearCounts,
      basisDate: new Date('2026-11-04T12:00:00+09:00')
    });
    const clearProps = createMockOperationalClosingSectionProps({
      counts: clearCounts,
      kpis: clearKpis
    });
    const clearHtml = renderToStaticMarkup(React.createElement(OperationalClosingSection, clearProps));
    assert.ok(
      clearHtml.includes('section-count '),
      'Clear status should have standard section-count class'
    );
    assert.ok(
      !clearHtml.includes('section-count urgent'),
      'Clear status should not have urgent class'
    );

    // 2. Urgent / blocked status
    const blockedCounts = createMockCounts({
      waitingCount: 2,
      reviewCount: 3
    });
    const blockedKpis = buildOperationalKpis({
      visits: [],
      soapRecords: [],
      counts: blockedCounts,
      basisDate: new Date('2026-11-04T12:00:00+09:00')
    });
    const blockedProps = createMockOperationalClosingSectionProps({
      counts: blockedCounts,
      kpis: blockedKpis
    });
    const blockedHtml = renderToStaticMarkup(React.createElement(OperationalClosingSection, blockedProps));
    assert.ok(
      blockedHtml.includes('section-count urgent'),
      'Blocked status should include urgent class on section-count'
    );
  });
});
