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
import WorkflowMiniTutorial, {
  WORKFLOW_DEMO_FIXTURE,
  workflowTutorialStorageKey,
  type WorkflowTutorialKind
} from './WorkflowMiniTutorial';

function renderWithOpenDialogOnSsr(kind: WorkflowTutorialKind): {
  html: string;
  observedInitialStates: unknown[];
} {
  const observedInitialStates: unknown[] = [];
  const rawHtml = renderMarkupWithReactUseStateMock(
    () =>
      React.createElement(WorkflowMiniTutorial, {
        kind,
        userId: 'staff_A'
      }),
    {
      componentName: 'WorkflowMiniTutorial',
      restoreAtCallIndex: 1,
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

describe('WorkflowMiniTutorial UI rendering and fixtures', () => {
  it('renders enabled trigger buttons with kind-specific accent, label, and dialog trigger accessibility attributes across all workflow kinds', () => {
    const expectedCases: Array<{ kind: WorkflowTutorialKind; label: string }> = [
      { kind: 'input', label: '入力デモ' },
      { kind: 'picking', label: 'ピッキングデモ' },
      { kind: 'medication', label: '薬歴デモ' }
    ];

    for (const { kind, label } of expectedCases) {
      const html = stripStyleBlocks(
        renderToStaticMarkup(
          React.createElement(WorkflowMiniTutorial, {
            kind,
            userId: 'staff_A'
          })
        )
      );

      const triggerTag = findOpeningTag(
        html,
        `data-testid="workflow-demo-trigger-${kind}"`,
        'button'
      );
      assert.match(triggerTag, /\btype="button"/);
      assert.match(triggerTag, new RegExp(`\\bclass="workflow-demo-trigger ${kind}"`));
      assert.match(triggerTag, /\baria-haspopup="dialog"/);
      assert.match(triggerTag, new RegExp(`\\btitle="${label}を開く"`));

      assert.deepEqual(listDisabledOpeningTags(html), []);
      assert.ok(html.includes(`<span>${label}</span>`), `Expected trigger label ${label}`);
      assert.ok(html.includes('aria-hidden="true"'), 'Expected decorative SVG icon marked aria-hidden="true"');
      assert.ok(!html.includes(`data-testid="workflow-demo-${kind}"`), 'Closed SSR output must not mount dialog');
      assert.ok(!html.includes('<dialog'), 'Closed SSR output must not emit portal dialog element');
    }
  });

  it('initializes open and SSR portal guard hooks safely without invoking createPortal when isOpen is true', () => {
    const { html, observedInitialStates } = renderWithOpenDialogOnSsr('picking');

    assert.deepEqual(observedInitialStates, [false, false]);
    const triggerTag = findOpeningTag(
      html,
      'data-testid="workflow-demo-trigger-picking"',
      'button'
    );
    assert.match(triggerTag, /\bclass="workflow-demo-trigger picking"/);
    assert.ok(!html.includes('<dialog'), 'SSR with canUsePortal=false must skip createPortal even when open');
  });

  it('keeps fixed workflow demo fixtures isolated from DB storage', () => {
    assert.equal(WORKFLOW_DEMO_FIXTURE.input.prescriptionId, 'DEMO-INPUT-RX-001');
    assert.equal(WORKFLOW_DEMO_FIXTURE.input.patientName, 'デモ患者 みどり');
    assert.equal(WORKFLOW_DEMO_FIXTURE.picking.taskId, 'DEMO-PICK-001');
    assert.equal(WORKFLOW_DEMO_FIXTURE.picking.lot, 'DEMO-LOT-A');
    assert.equal(WORKFLOW_DEMO_FIXTURE.medication.recordId, 'DEMO-SOAP-001');
    assert.equal(WORKFLOW_DEMO_FIXTURE.medication.previousDifference, '用量変更あり');
  });

  it('generates distinct storage keys for each workflow kind and staff member', () => {
    const kinds: WorkflowTutorialKind[] = ['input', 'picking', 'medication'];
    const keys = kinds.map((kind) => workflowTutorialStorageKey('staff_A', kind));

    assert.equal(keys[0], 'yakureki:workflow-tutorial:v1:staff_A:input');
    assert.equal(keys[1], 'yakureki:workflow-tutorial:v1:staff_A:picking');
    assert.equal(keys[2], 'yakureki:workflow-tutorial:v1:staff_A:medication');

    // 異なるユーザーでは異なるキーになること
    const userBKey = workflowTutorialStorageKey('staff_B', 'input');
    assert.notEqual(keys[0], userBKey);
  });
});
