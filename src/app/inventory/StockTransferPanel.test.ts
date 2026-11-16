import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
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
import { renderMarkupWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';
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
  const html = renderMarkupWithReactUseStateMock(
    () =>
      React.createElement(StockTransferPanel, {
        db: null,
        drugs: props.drugs ?? [],
        stockLots: props.stockLots ?? []
      }),
    {
      componentName: 'StockTransferPanel',
      restoreAtCallIndex: 14,
      minCalls: 15,
      overrides: {
        0: {
          assertInitial: (v) =>
            assert.equal(v, 'out', 'Hook #0 (direction) must initialize as out'),
          ...(overrides.direction !== undefined ? { value: overrides.direction } : {})
        },
        ...(overrides.drugQuery !== undefined ? { 1: { value: overrides.drugQuery } } : {}),
        ...(overrides.selectedDrugCode !== undefined ? { 2: { value: overrides.selectedDrugCode } } : {}),
        ...(overrides.quantityInput !== undefined ? { 3: { value: overrides.quantityInput } } : {}),
        ...(overrides.lotId !== undefined ? { 4: { value: overrides.lotId } } : {}),
        ...(overrides.lotNumberInput !== undefined ? { 5: { value: overrides.lotNumberInput } } : {}),
        ...(overrides.expirationInput !== undefined ? { 6: { value: overrides.expirationInput } } : {}),
        ...(overrides.partnerName !== undefined ? { 7: { value: overrides.partnerName } } : {}),
        ...(overrides.partnerAddress !== undefined ? { 8: { value: overrides.partnerAddress } } : {}),
        ...(overrides.note !== undefined ? { 9: { value: overrides.note } } : {}),
        10: {
          assertInitial: (v) =>
            assert.equal(v, false, 'Hook #10 (isSubmitting) must initialize as false'),
          ...(overrides.isSubmitting !== undefined ? { value: overrides.isSubmitting } : {})
        },
        11: {
          assertInitial: (v) =>
            assert.equal(v, 0, 'Hook #11 (historyReloadKey) must initialize as 0'),
          ...(overrides.historyReloadKey !== undefined ? { value: overrides.historyReloadKey } : {})
        },
        12: {
          assertInitial: (v) =>
            assert.ok(Array.isArray(v), 'Hook #12 (history) must initialize as array'),
          ...(overrides.history !== undefined ? { value: overrides.history } : {})
        },
        13: {
          assertInitial: (v) =>
            assert.equal(v, false, 'Hook #13 (hasHistoryLoadError) must initialize as false'),
          ...(overrides.hasHistoryLoadError !== undefined ? { value: overrides.hasHistoryLoadError } : {})
        },
        14: {
          assertInitial: (v) =>
            assert.equal(v, null, 'Hook #14 (fallbackDrug) must initialize as null'),
          ...(overrides.fallbackDrug !== undefined ? { value: overrides.fallbackDrug } : {})
        }
      }
    }
  );
  return stripStyleBlocks(html);
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

