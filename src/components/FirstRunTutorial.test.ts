import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  findOpeningTag,
  listDisabledOpeningTags,
  stripStyleBlocks
} from '@/lib/test_support/html_disabled_tags';
import { renderMarkupWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';
import FirstRunTutorial, {
  DEMO_TUTORIAL_FIXTURE,
  tutorialStorageKey
} from './FirstRunTutorial';

function createTutorialProps() {
  return {
    userId: 'staff_1',
    autoOpen: false,
    onStartReception: () => {},
    onStartDemo: () => {},
    onCleanupDemo: () => {}
  };
}

function renderWithOpenModalOnSsr(): {
  html: string;
  observedInitialStates: unknown[];
} {
  const observedInitialStates: unknown[] = [];
  const rawHtml = renderMarkupWithReactUseStateMock(
    () => React.createElement(FirstRunTutorial, createTutorialProps()),
    {
      componentName: 'FirstRunTutorial',
      restoreAtCallIndex: 2,
      onUseState: ({ callIndex, initialState }) => {
        observedInitialStates.push(initialState);
        if (callIndex === 0) {
          return [true, () => {}];
        }
        return undefined;
      }
    }
  );
  return { html: stripStyleBlocks(rawHtml), observedInitialStates };
}

describe('FirstRunTutorial UI rendering and isolation', () => {
  it('renders an enabled trigger button with dialog trigger accessibility attributes in initial SSR output', () => {
    const html = stripStyleBlocks(
      renderToStaticMarkup(React.createElement(FirstRunTutorial, createTutorialProps()))
    );

    const triggerTag = findOpeningTag(html, 'data-testid="tutorial-trigger"', 'button');
    assert.match(triggerTag, /\btype="button"/);
    assert.match(triggerTag, /\bclass="tutorial-trigger"/);
    assert.match(triggerTag, /\baria-haspopup="dialog"/);
    assert.match(triggerTag, /\btitle="はじめての方向け3分デモ"/);

    assert.deepEqual(listDisabledOpeningTags(html), []);
    assert.ok(html.includes('<span>3分デモ</span>'), 'Expected visible 3分デモ trigger label');
    assert.ok(html.includes('aria-hidden="true"'), 'Expected decorative SVG icon marked aria-hidden="true"');
    assert.ok(!html.includes('tutorial-start-reception'), 'Closed SSR output must not mount modal controls');
    assert.ok(!html.includes('role="dialog"'), 'Closed SSR output must not render portal dialog markup');
  });

  it('initializes open, step, and SSR portal guard hooks safely without invoking createPortal when isOpen is true', () => {
    const { html, observedInitialStates } = renderWithOpenModalOnSsr();

    assert.deepEqual(observedInitialStates, [false, 0, false]);
    const triggerTag = findOpeningTag(html, 'data-testid="tutorial-trigger"', 'button');
    assert.match(triggerTag, /\baria-haspopup="dialog"/);
    assert.ok(!html.includes('role="dialog"'), 'SSR with canUsePortal=false must skip createPortal even when open');
  });

  it('keeps demo data isolated with fixed fixtures without touching DB directly', () => {
    assert.equal(DEMO_TUTORIAL_FIXTURE.dashboard.receivedToday, 12);
    assert.equal(DEMO_TUTORIAL_FIXTURE.reception.prescriptionId, 'DEMO-RX-001');
    assert.equal(DEMO_TUTORIAL_FIXTURE.medicationRecord.patientName, 'デモ患者 さくら');
  });

  it('generates isolated localStorage keys per user for versioned first-run tutorial tracking', () => {
    const key1 = tutorialStorageKey('staff_1');
    const key2 = tutorialStorageKey('staff_2');

    assert.equal(key1, 'yakureki:first-run-tutorial:v1:staff_1');
    assert.equal(key2, 'yakureki:first-run-tutorial:v1:staff_2');
    assert.notEqual(key1, key2);
  });
});
