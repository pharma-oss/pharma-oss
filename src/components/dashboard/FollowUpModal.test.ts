import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  listDisabledOpeningTags,
  findOpeningTag
} from '@/lib/test_support/html_disabled_tags';
import type { DashboardFollowUpCandidate } from '@/lib/dashboard_tasks';
import {
  FollowUpModal,
  type FollowUpModalProps
} from './FollowUpModal';

function createMockFollowUpCandidate(
  overrides?: Partial<DashboardFollowUpCandidate>
): DashboardFollowUpCandidate {
  return {
    visitId: 'visit-test-001',
    patientId: 'patient-test-001',
    name: '山田 太郎',
    time: '10:30',
    prescriptionCount: 3,
    priority: 'high',
    reasonFlags: ['ハイリスク薬処方', '初回処方'],
    dueDate: '2026-11-06',
    dueLabel: '2日後確認',
    suggestedAction: '服用初期のふらつき・血圧低下の有無を確認',
    riskScore: 85,
    attemptCount: 0,
    isOverdue: false,
    ...overrides
  };
}

function createMockFollowUpModalProps(
  overrides?: Partial<FollowUpModalProps>
): FollowUpModalProps {
  return {
    candidate: createMockFollowUpCandidate(),
    onClose: () => {},
    onRecord: async () => {},
    ...overrides
  };
}

function renderWithIsSubmitting(
  props: FollowUpModalProps,
  isSubmittingOverride: boolean
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
        if (currentIndex === 4) {
          assert.equal(
            initialState,
            false,
            `Expected FollowUpModal useState call #4 initial value to be false (isSubmitting), got ${String(initialState)}`
          );
          dispatcher.useState = origUseState;
          return [isSubmittingOverride, () => {}];
        }
        return origUseState(initialState);
      };
    }
    return React.createElement(FollowUpModal, props);
  }

  const html = renderToStaticMarkup(React.createElement(Wrapper));
  assert.equal(
    callCount,
    5,
    `Expected FollowUpModal to call useState exactly 5 times, got ${callCount}`
  );
  return html;
}

describe('FollowUpModal component contracts', () => {
  it('exports FollowUpModal as a callable React component function', () => {
    assert.equal(typeof FollowUpModal, 'function');
  });

  it('renders normal ready state with all action buttons enabled and no spinner', () => {
    const props = createMockFollowUpModalProps();
    const html = renderToStaticMarkup(React.createElement(FollowUpModal, props));

    // Structural expectations
    assert.ok(html.includes('山田 太郎さんの服薬フォロー対応記録'), 'Form should have patient aria-label');
    assert.ok(html.includes('山田 太郎さん / 10:30・3薬'), 'Header should render candidate summary');
    assert.ok(html.includes('ハイリスク薬処方'), 'Reason flag 1 should be displayed');
    assert.ok(html.includes('初回処方'), 'Reason flag 2 should be displayed');
    assert.ok(html.includes('2日後確認 / リスク 85'), 'Due plan summary should be displayed');
    assert.ok(html.includes('服用初期のふらつき・血圧低下の有無を確認'), 'Suggested action should be displayed');

    // Action buttons disabled state
    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      0,
      `When isSubmitting is false, exactly 0 disabled="" tags should be present, got ${disabledTags.length}:\n${disabledTags.join('\n')}`
    );

    const cancelBtnTag = findOpeningTag(html, 'キャンセル', 'button');
    assert.ok(!cancelBtnTag.includes('disabled=""'), `Cancel button must not be disabled: ${cancelBtnTag}`);

    const reminderBtnTag = findOpeningTag(html, '未完了で記録', 'button');
    assert.ok(!reminderBtnTag.includes('disabled=""'), `Reminder button must not be disabled: ${reminderBtnTag}`);

    const submitBtnTag = findOpeningTag(html, '記録して対応済み', 'button');
    assert.ok(!submitBtnTag.includes('disabled=""'), `Submit button must not be disabled: ${submitBtnTag}`);

    assert.ok(!html.includes('animate-spin'), 'Loading spinner should not be present in ready state');
    assert.ok(!html.includes('保存中'), 'Saving label should not be present in ready state');
    assert.ok(html.includes('記録して対応済み'), 'Submit button should display "記録して対応済み" in ready state');
  });

  it('renders submitting state with all 3 action buttons disabled, spinner visible, and label changed to 保存中', () => {
    const props = createMockFollowUpModalProps();
    const html = renderWithIsSubmitting(props, true);

    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      3,
      `When isSubmitting is true, exactly 3 disabled="" action button tags should be present, got ${disabledTags.length}:\n${disabledTags.join('\n')}`
    );

    const cancelBtnTag = findOpeningTag(html, 'キャンセル', 'button');
    assert.ok(cancelBtnTag.includes('disabled=""'), `Cancel button must be disabled when isSubmitting is true: ${cancelBtnTag}`);

    const reminderBtnTag = findOpeningTag(html, '未完了で記録', 'button');
    assert.ok(reminderBtnTag.includes('disabled=""'), `Reminder button must be disabled when isSubmitting is true: ${reminderBtnTag}`);

    const savingBtnTag = findOpeningTag(html, '保存中', 'button');
    assert.ok(savingBtnTag.includes('disabled=""'), `Saving button must be disabled when isSubmitting is true: ${savingBtnTag}`);

    assert.ok(html.includes('animate-spin'), 'Loading spinner should be present when isSubmitting is true');
    assert.ok(html.includes('保存中'), 'Saving label should be present when isSubmitting is true');
    assert.ok(!html.includes('記録して対応済み'), 'Label "記録して対応済み" should not be present when isSubmitting is true');
  });

  it('pins individual disabled state for キャンセル button during isSubmitting', () => {
    const props = createMockFollowUpModalProps();

    const readyHtml = renderToStaticMarkup(React.createElement(FollowUpModal, props));
    const readyCancelBtn = findOpeningTag(readyHtml, 'キャンセル', 'button');
    assert.ok(
      !readyCancelBtn.includes('disabled=""'),
      `Cancel button must be enabled when isSubmitting is false: ${readyCancelBtn}`
    );

    const submittingHtml = renderWithIsSubmitting(props, true);
    const submittingCancelBtn = findOpeningTag(submittingHtml, 'キャンセル', 'button');
    assert.ok(
      submittingCancelBtn.includes('disabled=""'),
      `Cancel button must be disabled when isSubmitting is true: ${submittingCancelBtn}`
    );
  });

  it('pins individual disabled state for 未完了で記録 button during isSubmitting', () => {
    const props = createMockFollowUpModalProps();

    const readyHtml = renderToStaticMarkup(React.createElement(FollowUpModal, props));
    const readyReminderBtn = findOpeningTag(readyHtml, '未完了で記録', 'button');
    assert.ok(
      !readyReminderBtn.includes('disabled=""'),
      `Reminder button must be enabled when isSubmitting is false: ${readyReminderBtn}`
    );

    const submittingHtml = renderWithIsSubmitting(props, true);
    const submittingReminderBtn = findOpeningTag(submittingHtml, '未完了で記録', 'button');
    assert.ok(
      submittingReminderBtn.includes('disabled=""'),
      `Reminder button must be disabled when isSubmitting is true: ${submittingReminderBtn}`
    );
  });

  it('pins individual disabled state and loading spinner for 記録して対応済み button during isSubmitting', () => {
    const props = createMockFollowUpModalProps();

    const readyHtml = renderToStaticMarkup(React.createElement(FollowUpModal, props));
    const readySubmitBtn = findOpeningTag(readyHtml, '記録して対応済み', 'button');
    assert.ok(
      !readySubmitBtn.includes('disabled=""'),
      `Submit button must be enabled when isSubmitting is false: ${readySubmitBtn}`
    );
    assert.ok(!readyHtml.includes('animate-spin'), 'Spinner must not be present when ready');

    const submittingHtml = renderWithIsSubmitting(props, true);
    const submittingSavingBtn = findOpeningTag(submittingHtml, '保存中', 'button');
    assert.ok(
      submittingSavingBtn.includes('disabled=""'),
      `Submit button must be disabled when isSubmitting is true: ${submittingSavingBtn}`
    );
    assert.ok(submittingHtml.includes('animate-spin'), 'Spinner must be present when isSubmitting is true');
  });
});

