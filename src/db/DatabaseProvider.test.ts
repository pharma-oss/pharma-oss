import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { findOpeningTag, stripStyleBlocks } from '@/lib/test_support/html_disabled_tags';
import { renderMarkupWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';
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

function ChildProbe(): React.ReactNode {
  const db = useDatabase();
  const label = db ? `db-connected:${(db as unknown as { name?: string }).name ?? 'ok'}` : 'db-loading';
  return React.createElement('main', { 'data-child': 'true' }, label);
}

function renderDatabaseProvider(overrides: DatabaseProviderHookOverrides = {}): string {
  const html = renderMarkupWithReactUseStateMock(
    () =>
      React.createElement(
        DatabaseProvider,
        null,
        React.createElement(ChildProbe)
      ),
    {
      componentName: 'DatabaseProvider',
      restoreAtCallIndex: 2,
      minCalls: 3,
      overrides: {
        0: {
          assertInitial: (v) =>
            assert.equal(v, null, 'Hook #0 (db) must initialize as null'),
          ...(overrides.db !== undefined ? { value: overrides.db } : {})
        },
        1: {
          assertInitial: (v) =>
            assert.equal(v, null, 'Hook #1 (dbError) must initialize as null'),
          ...(overrides.dbError !== undefined ? { value: overrides.dbError } : {})
        },
        2: {
          assertInitial: (v) =>
            assert.equal(v, false, 'Hook #2 (satelliteSyncing) must initialize as false'),
          ...(overrides.satelliteSyncing !== undefined ? { value: overrides.satelliteSyncing } : {})
        }
      }
    }
  );
  return stripStyleBlocks(html);
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
