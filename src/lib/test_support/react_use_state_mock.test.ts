import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  renderMarkupWithReactUseStateMock,
  renderWithReactUseStateMock,
  type ReactInternalsDispatcher,
  type ReactInternalsWithDispatcher,
  type ReactUseStateHook
} from './react_use_state_mock';

function ChildCounter() {
  const [childVal] = React.useState('child-default');
  return React.createElement('span', { 'data-child': childVal }, childVal);
}

function SampleParent({ throwInBody = false }: { throwInBody?: boolean }) {
  const [first] = React.useState('init-a');
  const [second] = React.useState(false);
  const [third] = React.useState<string | undefined>('init-c');

  if (throwInBody) {
    throw new Error('intentional render failure');
  }

  return React.createElement(
    'div',
    null,
    React.createElement('span', { 'data-first': first }, first),
    React.createElement('span', { 'data-second': String(second) }, String(second)),
    React.createElement('span', { 'data-third': String(third) }, String(third)),
    React.createElement(ChildCounter)
  );
}

test('renderWithReactUseStateMock overrides target hooks, validates initialState, and restores before children', () => {
  const { html, callCount } = renderWithReactUseStateMock(
    () => React.createElement(SampleParent),
    {
      componentName: 'SampleParent',
      restoreAtCallIndex: 2,
      expectedCalls: 3,
      overrides: {
        0: {
          assertInitial: (init) => assert.strictEqual(init, 'init-a'),
          value: 'mock-a'
        },
        1: {
          assertInitial: (init) => assert.strictEqual(init, false)
          // No `value`: falls back to origUseState(false)
        },
        2: {
          assertInitial: (init) => assert.strictEqual(init, 'init-c'),
          value: undefined
        }
      }
    }
  );

  assert.strictEqual(callCount, 3);
  assert.ok(html.includes('data-first="mock-a"'));
  assert.ok(html.includes('data-second="false"'));
  assert.ok(html.includes('data-third="undefined"'));
  // ChildCounter must see its real initial value and not be counted in parent's expectedCalls: 3
  assert.ok(html.includes('data-child="child-default"'));
});

test('renderMarkupWithReactUseStateMock supports custom onUseState handler and minCalls', () => {
  const html = renderMarkupWithReactUseStateMock(
    () => React.createElement(SampleParent),
    {
      componentName: 'SampleParent',
      minCalls: 4, // includes ChildCounter when restoreAtCallIndex is not set
      onUseState: ({ callIndex }) => {
        if (callIndex === 1) {
          return [true, () => {}];
        }
        return undefined;
      }
    }
  );

  assert.ok(html.includes('data-first="init-a"'));
  assert.ok(html.includes('data-second="true"'));
  assert.ok(html.includes('data-child="child-default"'));
});

test('renderWithReactUseStateMock restores dispatcher.useState in finally even when component throws', () => {
  let observedDispatcher: ReactInternalsDispatcher | undefined;
  let capturedOriginalBeforePatch: ReactUseStateHook | undefined;

  function InspectorProbe() {
    const internals = (React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: ReactInternalsWithDispatcher;
    }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    observedDispatcher = internals?.H;
    capturedOriginalBeforePatch = observedDispatcher?.useState;
    return null;
  }
  renderToStaticMarkup(React.createElement(InspectorProbe));
  assert.ok(capturedOriginalBeforePatch);

  assert.throws(
    () =>
      renderWithReactUseStateMock(
        () => React.createElement(SampleParent, { throwInBody: true }),
        { componentName: 'ThrowingSample' }
      ),
    /intentional render failure/
  );

  if (observedDispatcher) {
    assert.strictEqual(
      observedDispatcher.useState,
      capturedOriginalBeforePatch,
      'Dispatcher.useState must be restored in finally after render exception'
    );
  }

  // Subsequent normal SSR render still works cleanly
  const cleanHtml = renderToStaticMarkup(React.createElement(SampleParent));
  assert.ok(cleanHtml.includes('data-first="init-a"'));
});

test('renderWithReactUseStateMock enforces expectedCalls and minCalls counts', () => {
  assert.throws(
    () =>
      renderWithReactUseStateMock(() => React.createElement(SampleParent), {
        componentName: 'SampleParent',
        restoreAtCallIndex: 2,
        expectedCalls: 99
      }),
    /\[SampleParent\] Expected 99 useState calls, got 3/
  );

  assert.throws(
    () =>
      renderWithReactUseStateMock(() => React.createElement(SampleParent), {
        componentName: 'SampleParent',
        restoreAtCallIndex: 2,
        minCalls: 5
      }),
    /\[SampleParent\] Expected at least 5 useState calls, got 3/
  );
});
