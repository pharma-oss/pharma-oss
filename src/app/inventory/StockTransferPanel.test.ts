import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Drug, DrugStock } from '@/db/types';
import {
  STOCK_TRANSFER_HISTORY_EMPTY_MESSAGE,
  STOCK_TRANSFER_HISTORY_LOAD_ERROR_MESSAGE,
  TRANSFER_DIRECTION_LABELS,
  getStockTransferHistoryHeading,
  type StockTransferDirection,
  type StockTransferRecord
} from '@/lib/stock_transfer';
import {
  findOpeningTag,
  listDisabledOpeningTags,
  stripStyleBlocks
} from '@/lib/test_support/html_disabled_tags';
import { StockTransferPanel } from './components/StockTransferPanel';
import { toInventoryDrugRow, type DrugWithSearchCache } from './types';

interface StockTransferHookOverrides {
  direction?: StockTransferDirection;
  drugQuery?: string;
  selectedDrugCode?: string;
  quantityInput?: string;
  lotId?: string;
  lotNumberInput?: string;
  expirationInput?: string;
  partnerName?: string;
  partnerAddress?: string;
  note?: string;
  isSubmitting?: boolean;
  historyReloadKey?: number;
  history?: Array<StockTransferRecord & { logId: string }>;
  hasHistoryLoadError?: boolean;
  fallbackDrug?: { code: string; name: string; stockQuantity?: number; location?: string } | null;
}

type ReactUseStateHook = (initialState: unknown) => [unknown, (next: unknown) => void];

interface ReactInternalsWithDispatcher {
  H?: {
    useState?: ReactUseStateHook;
  };
}

function makeDrug(overrides: Partial<Drug> & { code: string; name: string }): DrugWithSearchCache {
  return toInventoryDrugRow({
    isGeneric: false,
    ...overrides
  });
}

function renderStockTransferPanel(
  props: {
    drugs?: DrugWithSearchCache[];
    stockLots?: DrugStock[];
  } = {},
  overrides: StockTransferHookOverrides = {}
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
        assert.equal(initialState, 'out', 'Hook #0 (direction) must initialize as out');
        if (overrides.direction !== undefined) return [overrides.direction, () => {}];
      }
      if (idx === 1 && overrides.drugQuery !== undefined) return [overrides.drugQuery, () => {}];
      if (idx === 2 && overrides.selectedDrugCode !== undefined) return [overrides.selectedDrugCode, () => {}];
      if (idx === 3 && overrides.quantityInput !== undefined) return [overrides.quantityInput, () => {}];
      if (idx === 4 && overrides.lotId !== undefined) return [overrides.lotId, () => {}];
      if (idx === 5 && overrides.lotNumberInput !== undefined) return [overrides.lotNumberInput, () => {}];
      if (idx === 6 && overrides.expirationInput !== undefined) return [overrides.expirationInput, () => {}];
      if (idx === 7 && overrides.partnerName !== undefined) return [overrides.partnerName, () => {}];
      if (idx === 8 && overrides.partnerAddress !== undefined) return [overrides.partnerAddress, () => {}];
      if (idx === 9 && overrides.note !== undefined) return [overrides.note, () => {}];
      if (idx === 10) {
        assert.equal(initialState, false, 'Hook #10 (isSubmitting) must initialize as false');
        if (overrides.isSubmitting !== undefined) return [overrides.isSubmitting, () => {}];
      }
      if (idx === 11) {
        assert.equal(initialState, 0, 'Hook #11 (historyReloadKey) must initialize as 0');
        if (overrides.historyReloadKey !== undefined) return [overrides.historyReloadKey, () => {}];
      }
      if (idx === 12) {
        assert.ok(Array.isArray(initialState), 'Hook #12 (history) must initialize as array');
        if (overrides.history !== undefined) return [overrides.history, () => {}];
      }
      if (idx === 13) {
        assert.equal(initialState, false, 'Hook #13 (hasHistoryLoadError) must initialize as false');
        if (overrides.hasHistoryLoadError !== undefined) return [overrides.hasHistoryLoadError, () => {}];
      }
      if (idx === 14) {
        dispatcher.useState = origUseState;
        assert.equal(initialState, null, 'Hook #14 (fallbackDrug) must initialize as null');
        if (overrides.fallbackDrug !== undefined) return [overrides.fallbackDrug, () => {}];
      }
      return origUseState(initialState);
    };

    return React.createElement(StockTransferPanel, {
      db: null,
      drugs: props.drugs ?? [],
      stockLots: props.stockLots ?? []
    });
  }

  try {
    const html = renderToStaticMarkup(React.createElement(Wrapper));
    assert.ok(callCount >= 15, `Expected at least 15 useState calls, observed ${callCount}`);
    return stripStyleBlocks(html);
  } finally {
    if (capturedDispatcher && capturedOrigUseState) {
      capturedDispatcher.useState = capturedOrigUseState;
    }
  }
}

describe('StockTransferPanel UI states and form branches', () => {
  it('renders out direction fields, caps drug search suggestions at 8, and shows empty history', () => {
    const drugs: DrugWithSearchCache[] = Array.from({ length: 10 }, (_, idx) =>
      makeDrug({
        code: `D-CAND-${idx + 1}`,
        name: `候補テスト錠-${idx + 1}`,
        stockQuantity: 10 + idx
      })
    ).concat(
      makeDrug({
        code: 'D-OTHER',
        name: '別系統シロップ',
        stockQuantity: 3
      })
    );

    const html = renderStockTransferPanel(
      { drugs },
      { direction: 'out', drugQuery: '候補テスト', isSubmitting: false, history: [] }
    );

    const outLabel = findOpeningTag(html, '出庫(他薬局へ譲渡)', 'label');
    const inLabel = findOpeningTag(html, '入庫(他薬局から譲受)', 'label');
    assert.match(outLabel, /\bactive\b/);
    assert.doesNotMatch(inLabel, /\bactive\b/);

    assert.ok(html.includes('aria-label="出庫ロット"'));
    assert.ok(!html.includes('<span>ロット番号</span>'));
    assert.ok(!html.includes('<span>使用期限</span>'));
    assert.ok(html.includes('<span>分譲先 名称 *</span>'));
    assert.ok(html.includes('<span>分譲先 住所</span>'));

    assert.equal(listDisabledOpeningTags(html).length, 0);
    assert.ok(html.includes(`${TRANSFER_DIRECTION_LABELS.out}を記録して記録書を印刷`));
    assert.ok(!html.includes('記録中...'));

    assert.ok(html.includes('<ul class="transfer-drug-suggestions">'));
    const suggestionItems = html.match(/class="suggestion-name"/g) ?? [];
    assert.equal(suggestionItems.length, 8);
    assert.ok(html.includes('候補テスト錠-8'));
    assert.ok(!html.includes('候補テスト錠-9'));
    assert.ok(!html.includes('候補テスト錠-10'));
    assert.ok(!html.includes('別系統シロップ'));

    assert.ok(html.includes(getStockTransferHistoryHeading({ hasLoadError: false, historyCount: 0 })));
    assert.ok(html.includes(`<p class="text-muted">${STOCK_TRANSFER_HISTORY_EMPTY_MESSAGE}</p>`));
    assert.ok(!html.includes('role="alert"'));
    assert.ok(!html.includes('transfer-history-table'));
  });

  it('switches to in direction fields, locks submit button while submitting, and renders sorted lots or fallbackDrug', () => {
    const drugs: DrugWithSearchCache[] = [
      makeDrug({
        code: 'D-OUT',
        name: '出庫テスト錠10mg',
        stockQuantity: 25
      })
    ];
    const stockLots: DrugStock[] = [
      { id: 'L-ZERO', drugCode: 'D-OUT', lotNumber: 'ZERO', expirationDate: '2026-01-01', quantity: 0 },
      { id: 'L-LATE', drugCode: 'D-OUT', lotNumber: 'LOT-B', expirationDate: '2027-03-01', quantity: 10 },
      { id: 'L-SOON', drugCode: 'D-OUT', expirationDate: '2026-08-15', quantity: 15 },
      { id: 'L-OTHER', drugCode: 'D-OTHER', lotNumber: 'OTHER', expirationDate: '2026-05-01', quantity: 5 }
    ];

    const outSelectedHtml = renderStockTransferPanel(
      { drugs, stockLots },
      { direction: 'out', selectedDrugCode: 'D-OUT' }
    );
    assert.ok(outSelectedHtml.includes('class="transfer-selected-drug"'));
    assert.ok(outSelectedHtml.includes('<strong>出庫テスト錠10mg</strong>'));
    assert.ok(outSelectedHtml.includes('現在庫 25 / 棚位置未設定'));
    assert.ok(!outSelectedHtml.includes('id="transfer-drug"'));

    const soonIndex = outSelectedHtml.indexOf('ロット未記録 / 期限 2026-08-15 / 残 15');
    const lateIndex = outSelectedHtml.indexOf('LOT-B / 期限 2027-03-01 / 残 10');
    assert.ok(soonIndex > -1 && lateIndex > -1 && soonIndex < lateIndex);
    assert.ok(!outSelectedHtml.includes('value="L-ZERO"'));
    assert.ok(!outSelectedHtml.includes('value="L-OTHER"'));

    const inSubmittingHtml = renderStockTransferPanel(
      { drugs },
      {
        direction: 'in',
        selectedDrugCode: 'D-FALLBACK',
        fallbackDrug: { code: 'D-FALLBACK', name: '補充フォールバック薬', stockQuantity: 0, location: 'C-2' },
        isSubmitting: true
      }
    );

    const outLabelInMode = findOpeningTag(inSubmittingHtml, '出庫(他薬局へ譲渡)', 'label');
    const inLabelInMode = findOpeningTag(inSubmittingHtml, '入庫(他薬局から譲受)', 'label');
    assert.doesNotMatch(outLabelInMode, /\bactive\b/);
    assert.match(inLabelInMode, /\bactive\b/);

    assert.ok(inSubmittingHtml.includes('<strong>補充フォールバック薬</strong>'));
    assert.ok(inSubmittingHtml.includes('現在庫 0 / C-2'));
    assert.ok(!inSubmittingHtml.includes('aria-label="出庫ロット"'));
    assert.ok(inSubmittingHtml.includes('<span>ロット番号</span>'));
    assert.ok(inSubmittingHtml.includes('<span>使用期限</span>'));
    assert.ok(inSubmittingHtml.includes('<span>分譲元 名称 *</span>'));
    assert.ok(inSubmittingHtml.includes('<span>分譲元 住所</span>'));

    assert.equal(listDisabledOpeningTags(inSubmittingHtml).length, 1);
    const submitBtn = findOpeningTag(inSubmittingHtml, '記録中...', 'button');
    assert.match(submitBtn, /\bdisabled\b/i);
    assert.ok(!inSubmittingHtml.includes('を記録して記録書を印刷'));
  });

  it('renders alert error state and formatted transfer history rows for out and in directions', () => {
    const errorHtml = renderStockTransferPanel(
      {},
      { hasHistoryLoadError: true, history: [] }
    );
    const alertTag = findOpeningTag(errorHtml, STOCK_TRANSFER_HISTORY_LOAD_ERROR_MESSAGE, 'p');
    assert.match(alertTag, /\btransfer-history-load-error\b/);
    assert.match(alertTag, /\brole="alert"/);
    assert.ok(!errorHtml.includes(STOCK_TRANSFER_HISTORY_EMPTY_MESSAGE));
    assert.ok(!errorHtml.includes('transfer-history-table'));

    const history: Array<StockTransferRecord & { logId: string }> = [
      {
        logId: 'LOG-1',
        direction: 'out',
        drugCode: 'D-1',
        drugName: '分譲出庫薬錠5mg',
        quantity: 20,
        partnerName: 'ひかり薬局 本店',
        transferredAt: '2026-05-01T14:30:59.000Z'
      },
      {
        logId: 'LOG-2',
        direction: 'in',
        drugCode: 'D-2',
        drugName: '分譲入庫カプセル10mg',
        quantity: 12,
        partnerName: 'さくら薬局 北店',
        transferredAt: '2026-05-02T09:05:00.000Z'
      }
    ];

    const readyHtml = renderStockTransferPanel(
      {},
      { hasHistoryLoadError: false, history }
    );
    assert.ok(readyHtml.includes('<table class="transfer-history-table">'));
    assert.ok(readyHtml.includes('<td>2026-05-01 14:30</td>'));
    assert.ok(readyHtml.includes('<td>2026-05-02 09:05</td>'));
    assert.ok(readyHtml.includes(`<span class="transfer-badge out">${TRANSFER_DIRECTION_LABELS.out}</span>`));
    assert.ok(readyHtml.includes(`<span class="transfer-badge in">${TRANSFER_DIRECTION_LABELS.in}</span>`));
    assert.ok(readyHtml.includes('<td class="transfer-history-drug">分譲出庫薬錠5mg</td>'));
    assert.ok(readyHtml.includes('<td class="transfer-history-drug">分譲入庫カプセル10mg</td>'));
    assert.ok(readyHtml.includes('<td>ひかり薬局 本店</td>'));
    assert.ok(readyHtml.includes('<td>さくら薬局 北店</td>'));
    const printButtons = readyHtml.match(/記録書<\/button>/g) ?? [];
    assert.equal(printButtons.length, 2);
  });
});

