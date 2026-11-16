import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

export type ReactUseStateHook = (initialState: unknown) => [unknown, (next: unknown) => void];

export interface ReactInternalsDispatcher {
  useState?: ReactUseStateHook;
}

export interface ReactInternalsWithDispatcher {
  H?: ReactInternalsDispatcher;
}

export interface UseStateOverrideSpec {
  /** Override value to return from `useState`. Presence of the `value` key activates the override. */
  value?: unknown;
  /** Explicitly force override activation (useful only when combining dynamic builders). */
  hasOverride?: boolean;
  /** Optional assertion validated against the component's `initialState` argument on this hook call. */
  assertInitial?: (initialState: unknown) => void;
}

export interface UseStateMockHookContext {
  callIndex: number;
  initialState: unknown;
  origUseState: ReactUseStateHook;
  restoreNow: () => void;
}

export interface UseStateMockOptions {
  /** Declarative per-hook-index overrides and initial-value assertions. */
  overrides?: Record<number, UseStateOverrideSpec | undefined>;
  /** Custom per-call hook handler. Return `[state, setter]` to override, or `undefined` to delegate to `origUseState`. */
  onUseState?: (ctx: UseStateMockHookContext) => [unknown, (next: unknown) => void] | undefined;
  /** Restore original `useState` as soon as `callIndex >= restoreAtCallIndex` (before evaluating children). */
  restoreAtCallIndex?: number;
  /** Verify at least this many mocked `useState` calls occurred after render. */
  minCalls?: number;
  /** Verify exact number of mocked `useState` calls occurred after render. */
  expectedCalls?: number;
  /** Human-readable component label for assertion failure diagnostics. */
  componentName?: string;
}

export interface UseStateMockRenderResult {
  html: string;
  callCount: number;
}

const noopSetter: (next: unknown) => void = () => {};

function getReactInternalsDispatcher(): ReactInternalsDispatcher | undefined {
  const internals = (React as unknown as {
    __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: ReactInternalsWithDispatcher;
  }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  return internals?.H;
}

/**
 * Renders a React element via `renderToStaticMarkup` while intercepting React's SSR `useState`
 * dispatcher with guaranteed `try / finally` restoration, initial-state verification, and call-count guards.
 */
export function renderWithReactUseStateMock(
  renderElement: () => React.ReactNode,
  options: UseStateMockOptions = {}
): UseStateMockRenderResult {
  const label = options.componentName ?? 'Component';
  let callCount = 0;
  let patchedDispatcher: ReactInternalsDispatcher | undefined;
  let savedUseState: ReactUseStateHook | undefined;
  let restored = false;

  const restoreNow = () => {
    if (!restored && patchedDispatcher && savedUseState) {
      patchedDispatcher.useState = savedUseState;
      restored = true;
    }
  };

  function Wrapper(): React.ReactNode {
    const dispatcher = getReactInternalsDispatcher();
    assert.ok(
      dispatcher?.useState,
      `[${label}] React SSR dispatcher.useState must be present during render`
    );

    const origUseState = dispatcher.useState;
    patchedDispatcher = dispatcher;
    savedUseState = origUseState;

    dispatcher.useState = (initialState: unknown) => {
      const callIndex = callCount++;
      if (
        options.restoreAtCallIndex !== undefined &&
        callIndex >= options.restoreAtCallIndex
      ) {
        restoreNow();
      }

      const spec = options.overrides?.[callIndex];
      if (spec) {
        spec.assertInitial?.(initialState);
        const shouldOverride =
          spec.hasOverride ?? Object.prototype.hasOwnProperty.call(spec, 'value');
        if (shouldOverride) {
          return [spec.value, noopSetter];
        }
      }

      const custom = options.onUseState?.({
        callIndex,
        initialState,
        origUseState,
        restoreNow
      });
      if (custom !== undefined) {
        return custom;
      }

      return origUseState(initialState);
    };

    return renderElement();
  }

  let html = '';
  try {
    html = renderToStaticMarkup(React.createElement(Wrapper));
  } finally {
    restoreNow();
  }

  if (options.minCalls !== undefined) {
    assert.ok(
      callCount >= options.minCalls,
      `[${label}] Expected at least ${options.minCalls} useState calls, got ${callCount}`
    );
  }
  if (options.expectedCalls !== undefined) {
    assert.strictEqual(
      callCount,
      options.expectedCalls,
      `[${label}] Expected ${options.expectedCalls} useState calls, got ${callCount}`
    );
  }

  return { html, callCount };
}

/**
 * Convenience wrapper returning only the rendered static HTML markup.
 */
export function renderMarkupWithReactUseStateMock(
  renderElement: () => React.ReactNode,
  options: UseStateMockOptions = {}
): string {
  return renderWithReactUseStateMock(renderElement, options).html;
}
