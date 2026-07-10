import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { useDatabase, DatabaseContext } from './DatabaseContext.ts';

// Mock React 19's useContext via internal dispatcher
const ReactInternals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
let mockContextValue: any = undefined;

const originalDispatcher = ReactInternals.H;

const mockDispatcher = {
  useContext(context: any) {
    return mockContextValue;
  }
};

// Mock console.warn
const originalWarn = console.warn;
const mockWarn = mock.fn();

beforeEach(() => {
  mockWarn.mock.resetCalls();
  console.warn = mockWarn;
  ReactInternals.H = mockDispatcher;
});

afterEach(() => {
  console.warn = originalWarn;
  ReactInternals.H = originalDispatcher;
  // @ts-ignore
  delete global.window;
});

test('useDatabase warns when context is undefined in browser', () => {
  // @ts-ignore
  global.window = {};

  mockContextValue = undefined;

  useDatabase();

  assert.strictEqual(mockWarn.mock.callCount(), 1);
  assert.strictEqual(mockWarn.mock.calls[0].arguments[0], 'useDatabase must be used within a DatabaseProvider');
});

test('useDatabase does NOT warn when context is undefined in SSR', () => {
  // global.window is undefined
  mockContextValue = undefined;

  useDatabase();

  assert.strictEqual(mockWarn.mock.callCount(), 0);
});

test('useDatabase does NOT warn when context is defined', () => {
  // @ts-ignore
  global.window = {};
  mockContextValue = { some: 'db' };

  const result = useDatabase();

  assert.strictEqual(mockWarn.mock.callCount(), 0);
  assert.deepStrictEqual(result, { some: 'db' });
});
