import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { importMedicalInstitutionMasterJson } from '@/lib/master-data/medical_institution_master';
import {
  findOpeningTag,
  listDisabledOpeningTags,
  stripStyleBlocks
} from '@/lib/test_support/html_disabled_tags';
import { MedicalInstitutionMasterSyncModal } from './MedicalInstitutionMasterSyncModal';

interface MasterSyncHookOverrides {
  stats?: {
    totalCount: number;
    lastSyncTimestamp: string | null;
  };
  isProcessing?: boolean;
  message?: { text: string; isError: boolean } | null;
}

type ReactUseStateHook = (initialState: unknown) => [unknown, (next: unknown) => void];

interface ReactInternalsWithDispatcher {
  H?: {
    useState?: ReactUseStateHook;
  };
}

function renderMasterSyncModal(
  isOpen: boolean,
  overrides: MasterSyncHookOverrides = {}
): string {
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
        assert.ok(
          typeof initialState === 'object' &&
            initialState !== null &&
            'totalCount' in (initialState as Record<string, unknown>),
          'Hook #0 (stats) must initialize as stats object'
        );
        if (overrides.stats !== undefined) return [overrides.stats, () => {}];
      }
      if (idx === 1) {
        assert.equal(typeof initialState, 'boolean', 'Hook #1 (isProcessing) must initialize as boolean');
        if (overrides.isProcessing !== undefined) return [overrides.isProcessing, () => {}];
      }
      if (idx === 2) {
        dispatcher.useState = origUseState;
        assert.equal(initialState, null, 'Hook #2 (message) must initialize as null');
        if (overrides.message !== undefined) return [overrides.message, () => {}];
      }
      return origUseState(initialState);
    };

    return React.createElement(MedicalInstitutionMasterSyncModal, {
      isOpen,
      onClose: () => {}
    });
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

describe('MedicalInstitutionMasterSyncModal UI states', () => {
  it('returns empty markup when closed and renders dialog with enabled file inputs and stats when open', () => {
    const closedHtml = renderMasterSyncModal(false, {
      isProcessing: true,
      message: { text: '閉鎖時は非表示', isError: true }
    });
    assert.equal(closedHtml, '');

    const openHtml = renderMasterSyncModal(true, {
      stats: { totalCount: 1234, lastSyncTimestamp: '2026-05-01T09:30:00.000Z' },
      isProcessing: false,
      message: null
    });

    const dialogTag = findOpeningTag(openHtml, 'aria-labelledby="sync-title"', 'dialog');
    assert.match(dialogTag, /\binstitution-sync-modal\b/);
    assert.match(dialogTag, /\bsync-dialog\b/);
    assert.ok(openHtml.includes('<h3 id="sync-title" class="sync-title">医療機関マスタ 最新情報同期</h3>'));
    assert.ok(openHtml.includes('1,234'));
    assert.ok(openHtml.includes('最終更新:'));
    assert.ok(openHtml.includes('地方厚生局「コード内容別医療機関一覧表」(ZIP / Excel) を取り込む'));
    assert.ok(openHtml.includes('独自整形済みのCSV / JSONを取り込む(上級者向け)'));
    assert.equal(listDisabledOpeningTags(openHtml).length, 0);
    assert.ok(!openHtml.includes('更新・解析中...'));
    assert.ok(!openHtml.includes('sync-message-box'));
  });

  it('disables both file upload inputs and switches upload headings while isProcessing is true', () => {
    const processingHtml = renderMasterSyncModal(true, {
      isProcessing: true
    });

    const disabledTags = listDisabledOpeningTags(processingHtml);
    assert.equal(disabledTags.length, 2);

    const bureauInput = findOpeningTag(processingHtml, 'accept=".zip,.xlsx"', 'input');
    const csvInput = findOpeningTag(processingHtml, 'accept=".csv,.txt,.json"', 'input');
    assert.match(bureauInput, /\bdisabled\b/i);
    assert.match(csvInput, /\bdisabled\b/i);

    const progressLabels = processingHtml.match(/更新・解析中\.\.\./g) ?? [];
    assert.equal(progressLabels.length, 2);
    assert.ok(!processingHtml.includes('地方厚生局「コード内容別医療機関一覧表」(ZIP / Excel) を取り込む'));
    assert.ok(!processingHtml.includes('独自整形済みのCSV / JSONを取り込む(上級者向け)'));
  });

  it('distinguishes danger and success message boxes and hides stats updated line when timestamp is null', () => {
    const errorHtml = renderMasterSyncModal(true, {
      stats: { totalCount: 5, lastSyncTimestamp: null },
      message: { text: '読込エラーが発生しました', isError: true }
    });
    assert.ok(!errorHtml.includes('最終更新:'));
    const errorBox = findOpeningTag(errorHtml, '読込エラーが発生しました', 'div');
    assert.match(errorBox, /\bsync-message-box\b/);
    assert.match(errorBox, /\bis-danger\b/);
    assert.doesNotMatch(errorBox, /\bis-success\b/);

    const successHtml = renderMasterSyncModal(true, {
      stats: { totalCount: 42, lastSyncTimestamp: '2026-05-02T00:00:00.000Z' },
      message: { text: '42件のマスタを同期しました', isError: false }
    });
    const successBox = findOpeningTag(successHtml, '42件のマスタを同期しました', 'div');
    assert.match(successBox, /\bsync-message-box\b/);
    assert.match(successBox, /\bis-success\b/);
    assert.doesNotMatch(successBox, /\bis-danger\b/);
  });

  it('shows seed data alert initially and hides it after importing medical institution master data', () => {
    const seedHtml = renderMasterSyncModal(true, {
      stats: { totalCount: 5, lastSyncTimestamp: null }
    });
    assert.ok(seedHtml.includes('class="sync-seed-alert"'));
    assert.ok(seedHtml.includes('サンプルデータ（5件）を使用中です。'));

    importMedicalInstitutionMasterJson(
      JSON.stringify([
        {
          code: '1398765432',
          scoreCode: '9876543',
          prefectureCode: '13',
          name: '同期済みテスト病院'
        }
      ])
    );

    const syncedHtml = renderMasterSyncModal(true);
    assert.ok(!syncedHtml.includes('class="sync-seed-alert"'));
    assert.ok(!syncedHtml.includes('サンプルデータ（'));
    assert.ok(syncedHtml.includes('最終更新:'));
  });
});

