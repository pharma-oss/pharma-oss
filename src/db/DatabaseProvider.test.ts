import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { findOpeningTag, stripStyleBlocks } from '@/lib/test_support/html_disabled_tags';
import { DatabaseProvider, useDatabase } from './DatabaseProvider';
import {
  DB_DEFAULT_ERROR_DESCRIPTION,
  DB_KEY_STORAGE_UNAVAILABLE_DESCRIPTION,
  DbKeyStorageUnavailableError
} from './db_password';
import type { PharmacyDatabase } from './types';

interface DatabaseProviderHookOverrides {
  db?: PharmacyDatabase | null;
  dbError?: unknown | null;
  satelliteSyncing?: boolean;
}

type ReactUseStateHook = (initialState: unknown) => [unknown, (next: unknown) => void];

interface ReactInternalsWithDispatcher {
  H?: {
    useState?: ReactUseStateHook;
  };
}

function ChildProbe(): React.ReactNode {
  const db = useDatabase();
  const label = db ? `db-connected:${(db as unknown as { name?: string }).name ?? 'ok'}` : 'db-loading';
  return React.createElement('main', { 'data-child': 'true' }, label);
}

function renderDatabaseProvider(overrides: DatabaseProviderHookOverrides = {}): string {
  let callCount = 0;
  let capturedDispatcher: { useState?: ReactUseStateHook } | undefined;
  let capturedOrigUseState: ReactUseStateHook | undefined;

  function Wrapper(): React.ReactNode {
    const internals = (React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: ReactInternalsWithDispatcher;
    }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const dispatcher = internals?.H;
    assert.ok(dispatcher?.useState, 'React SSR dispatcher.useState must be present during render');

    const origUseState = dispatcher.useState;
    capturedDispatcher = dispatcher;
    capturedOrigUseState = origUseState;

    dispatcher.useState = (initialState: unknown) => {
      const idx = callCount++;
      if (idx === 0) {
        assert.equal(initialState, null, 'Hook #0 (db) must initialize as null');
        if (overrides.db !== undefined) return [overrides.db, () => {}];
      }
      if (idx === 1) {
        assert.equal(initialState, null, 'Hook #1 (dbError) must initialize as null');
        if (overrides.dbError !== undefined) return [overrides.dbError, () => {}];
      }
      if (idx === 2) {
        dispatcher.useState = origUseState;
        assert.equal(initialState, false, 'Hook #2 (satelliteSyncing) must initialize as false');
        if (overrides.satelliteSyncing !== undefined) return [overrides.satelliteSyncing, () => {}];
      }
      return origUseState(initialState);
    };

    return React.createElement(
      DatabaseProvider,
      null,
      React.createElement(ChildProbe)
    );
  }

  try {
    const html = renderToStaticMarkup(React.createElement(Wrapper));
    assert.ok(callCount >= 3, `Expected at least 3 useState calls, observed ${callCount}`);
    return stripStyleBlocks(html);
  } finally {
    if (capturedDispatcher && capturedOrigUseState) {
      capturedDispatcher.useState = capturedOrigUseState;
    }
  }
}

describe('DatabaseProvider SSR UI states and context wiring', () => {
  it('renders alert card with sanitized error message and suppresses satellite status and children when dbError is set', () => {
    const html = renderDatabaseProvider({
      dbError: new Error('IndexedDB open failed\n--------------------\nParameters:\nsecret_db_key'),
      satelliteSyncing: true
    });

    const alertTag = findOpeningTag(html, 'ローカルデータベースを開けません', 'div');
    assert.match(alertTag, /\brole="alert"/);
    assert.match(alertTag, /\bdb-alert-card\b/);
    assert.ok(html.includes('<h1 class="db-card-title">ローカルデータベースを開けません</h1>'));
    assert.ok(html.includes(`<p class="db-card-desc">${DB_DEFAULT_ERROR_DESCRIPTION}</p>`));
    assert.ok(html.includes('<p class="db-error-text">エラー: IndexedDB open failed</p>'));
    assert.ok(!html.includes('secret_db_key'));
    assert.ok(!html.includes('db-status-card'));
    assert.ok(!html.includes('data-child="true"'));

    const withCauseHtml = renderDatabaseProvider({
      dbError: new DbKeyStorageUnavailableError({ name: 'SecurityError' })
    });
    assert.ok(withCauseHtml.includes(`<p class="db-card-desc">${DB_KEY_STORAGE_UNAVAILABLE_DESCRIPTION}</p>`));
    assert.ok(withCauseHtml.includes('<p class="db-error-text">詳細: SecurityError</p>'));

    const withoutCauseHtml = renderDatabaseProvider({
      dbError: new DbKeyStorageUnavailableError()
    });
    assert.ok(withoutCauseHtml.includes(`<p class="db-card-desc">${DB_KEY_STORAGE_UNAVAILABLE_DESCRIPTION}</p>`));
    assert.ok(!withoutCauseHtml.includes('class="db-error-text"'));
  });

  it('renders satellite syncing status card while hiding children when satelliteSyncing is true', () => {
    const html = renderDatabaseProvider({
      dbError: null,
      satelliteSyncing: true
    });

    const statusTag = findOpeningTag(html, 'メイン端末からデータを取得しています…', 'div');
    assert.match(statusTag, /\brole="status"/);
    assert.match(statusTag, /\bdb-status-card\b/);
    assert.ok(html.includes('<h1 class="db-card-title">メイン端末からデータを取得しています…</h1>'));
    assert.ok(html.includes('この端末はサテライト端末です。患者データは端末に保存されず、起動のたびにメイン端末から取得します。'));
    assert.ok(!html.includes('role="alert"'));
    assert.ok(!html.includes('data-child="true"'));
  });

  it('provides current db instance through DatabaseContext to children when ready', () => {
    const nullDbHtml = renderDatabaseProvider({
      db: null,
      dbError: null,
      satelliteSyncing: false
    });
    assert.equal(nullDbHtml, '<main data-child="true">db-loading</main>');

    const stubDb = { name: 'pharmacy-db-ready' } as unknown as PharmacyDatabase;
    const readyDbHtml = renderDatabaseProvider({
      db: stubDb,
      dbError: null,
      satelliteSyncing: false
    });
    assert.equal(readyDbHtml, '<main data-child="true">db-connected:pharmacy-db-ready</main>');
  });
});
