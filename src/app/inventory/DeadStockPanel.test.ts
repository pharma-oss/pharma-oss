import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import type { Drug, DrugStock } from '@/db/types';
import {
  DEAD_STOCK_EMPTY_MESSAGE,
  DEAD_STOCK_LOAD_ERROR_MESSAGE,
  DEAD_STOCK_LOADING_MESSAGE
} from '@/lib/dead_stock';
import { toLocalDateKey } from '@/lib/local_date';
import {
  findOpeningTag,
  listDisabledOpeningTags,
  stripStyleBlocks
} from '@/lib/test_support/html_disabled_tags';
import { renderMarkupWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';
import { DeadStockPanel } from './components/DeadStockPanel';
import { toInventoryDrugRow, type DrugWithSearchCache } from './types';

interface DeadStockHookOverrides {
  thresholdDays?: number;
  movementSources?: {
    items: Array<{ visitId: string; drugId: string; dispensedDrugCode?: string }>;
    visits: Array<{ visitId: string; issueDate?: string; status?: string }>;
  } | null;
  hasLoadError?: boolean;
}

function makeDrug(overrides: Partial<Drug> & { code: string; name: string }): DrugWithSearchCache {
  return toInventoryDrugRow({
    isGeneric: false,
    ...overrides
  });
}

function renderDeadStockPanel(
  props: {
    drugs?: DrugWithSearchCache[];
    stockLots?: DrugStock[];
  } = {},
  overrides: DeadStockHookOverrides = {}
): string {
  const html = renderMarkupWithReactUseStateMock(
    () =>
      React.createElement(DeadStockPanel, {
        db: null,
        drugs: props.drugs ?? [],
        stockLots: props.stockLots ?? [],
        onOpenTransfer: () => {}
      }),
    {
      componentName: 'DeadStockPanel',
      restoreAtCallIndex: 2,
      minCalls: 3,
      overrides: {
        0: {
          assertInitial: (v) =>
            assert.equal(v, 90, 'Hook #0 (thresholdDays) must initialize as 90'),
          ...(overrides.thresholdDays !== undefined ? { value: overrides.thresholdDays } : {})
        },
        1: {
          assertInitial: (v) =>
            assert.equal(v, null, 'Hook #1 (movementSources) must initialize as null'),
          ...(overrides.movementSources !== undefined ? { value: overrides.movementSources } : {})
        },
        2: {
          assertInitial: (v) =>
            assert.equal(v, false, 'Hook #2 (hasLoadError) must initialize as false'),
          ...(overrides.hasLoadError !== undefined ? { value: overrides.hasLoadError } : {})
        }
      }
    }
  );
  return stripStyleBlocks(html);
}

describe('DeadStockPanel UI states and table rendering', () => {
  it('renders loading, alert error, and empty states while keeping CSV button disabled', () => {
    const loadingHtml = renderDeadStockPanel(
      {},
      { movementSources: null, hasLoadError: false }
    );
    assert.ok(loadingHtml.includes('<h3>不動在庫</h3>'));
    assert.ok(loadingHtml.includes(`<p class="text-muted">${DEAD_STOCK_LOADING_MESSAGE}</p>`));
    assert.ok(loadingHtml.includes('該当 <strong>0</strong> 品目'));
    assert.ok(loadingHtml.includes('在庫金額(薬価) <strong>0</strong> 円'));
    assert.equal(listDisabledOpeningTags(loadingHtml).length, 1);
    const loadingCsvBtn = findOpeningTag(loadingHtml, 'CSV', 'button');
    assert.match(loadingCsvBtn, /\bdisabled\b/i);
    assert.ok(!loadingHtml.includes('role="alert"'));
    assert.ok(!loadingHtml.includes('dead-stock-table'));

    const errorHtml = renderDeadStockPanel(
      {
        drugs: [makeDrug({ code: 'D-1', name: 'テスト錠', stockQuantity: 10, price: 100 })]
      },
      {
        movementSources: { items: [], visits: [] },
        hasLoadError: true
      }
    );
    const alertTag = findOpeningTag(errorHtml, DEAD_STOCK_LOAD_ERROR_MESSAGE, 'p');
    assert.match(alertTag, /\bdead-stock-load-error\b/);
    assert.match(alertTag, /\brole="alert"/);
    assert.ok(!errorHtml.includes(DEAD_STOCK_LOADING_MESSAGE));
    assert.ok(!errorHtml.includes(DEAD_STOCK_EMPTY_MESSAGE));
    assert.ok(!errorHtml.includes('dead-stock-table'));
    assert.equal(listDisabledOpeningTags(errorHtml).length, 1);

    const emptyHtml = renderDeadStockPanel(
      { drugs: [] },
      { movementSources: { items: [], visits: [] }, hasLoadError: false }
    );
    assert.ok(emptyHtml.includes(`<p class="text-muted">${DEAD_STOCK_EMPTY_MESSAGE}</p>`));
    assert.ok(!emptyHtml.includes('role="alert"'));
    assert.ok(!emptyHtml.includes(DEAD_STOCK_LOADING_MESSAGE));
    assert.ok(!emptyHtml.includes('dead-stock-table'));
    assert.equal(listDisabledOpeningTags(emptyHtml).length, 1);
  });

  it('enables CSV button, calculates total value, and renders recordless/expiry badges and movement dates in ready state', () => {
    const nearExpiry = toLocalDateKey(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    const drugs: DrugWithSearchCache[] = [
      makeDrug({
        code: 'D-NOMOVE',
        name: '無記録 expiring薬10mg',
        location: 'A-1-2',
        stockQuantity: 10,
        price: 150
      }),
      makeDrug({
        code: 'D-OLDMOVE',
        name: '長期滞留薬20mg',
        location: 'B-3-1',
        stockQuantity: 5,
        price: 200
      })
    ];
    const stockLots: DrugStock[] = [
      {
        id: 'LOT-1',
        drugCode: 'D-NOMOVE',
        quantity: 10,
        expirationDate: nearExpiry
      },
      {
        id: 'LOT-2',
        drugCode: 'D-OLDMOVE',
        quantity: 5,
        arrivalDate: '2020-02-01'
      }
    ];
    const movementSources = {
      items: [{ visitId: 'V-OLD', drugId: 'D-OLDMOVE' }],
      visits: [{ visitId: 'V-OLD', issueDate: '2020-01-15T09:00:00.000Z', status: 'completed' }]
    };

    const html = renderDeadStockPanel(
      { drugs, stockLots },
      { thresholdDays: 90, movementSources, hasLoadError: false }
    );

    assert.equal(listDisabledOpeningTags(html).length, 0);
    const csvBtn = findOpeningTag(html, 'CSV', 'button');
    assert.doesNotMatch(csvBtn, /\bdisabled\b/i);

    assert.ok(html.includes('該当 <strong>2</strong> 品目'));
    assert.ok(html.includes('在庫金額(薬価) <strong>2,500</strong> 円'));
    assert.ok(html.includes('<table class="dead-stock-table">'));

    assert.ok(html.includes('<td class="dead-stock-drug">無記録 expiring薬10mg</td>'));
    assert.ok(html.includes('<td>A-1-2</td>'));
    assert.ok(html.includes('1,500円'));
    assert.ok(html.includes(nearExpiry));

    assert.ok(html.includes('<td class="dead-stock-drug">長期滞留薬20mg</td>'));
    assert.ok(html.includes('<td>B-3-1</td>'));
    assert.ok(html.includes('1,000円'));
    assert.ok(html.includes('<td>2020-01-15</td>'));
    assert.ok(html.includes('<td>2020-02-01</td>'));

    const recordlessBadges = html.match(/<span class="dead-stock-flag">記録なし<\/span>/g) ?? [];
    assert.equal(recordlessBadges.length, 1);

    const expiryBadges = html.match(/<span class="dead-stock-flag expiry">期限注意<\/span>/g) ?? [];
    assert.equal(expiryBadges.length, 1);

    const transferButtons = html.match(/分譲へ<\/button>/g) ?? [];
    assert.equal(transferButtons.length, 2);
  });
});

