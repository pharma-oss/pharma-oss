import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Drug } from '@/db/types';
import { findOpeningTag, listDisabledOpeningTags } from '@/lib/test_support/html_disabled_tags';
import { DailyCheckPanel } from './components/DailyCheckPanel';
import { InventoryRow, type InventoryRowProps } from './components/InventoryRow';
import { toInventoryDrugRow } from './types';

function drug(overrides: Partial<Drug> & Pick<Drug, 'code' | 'name'>): Drug {
  return { isGeneric: false, stockQuantity: 10, ...overrides };
}

// 描画した HTML から <style> の中身(styled-jsx の CSS 本文)を除き、DOM だけを検証する
function renderDailyCheckPanel(drugs: Drug[]): string {
  const rows = drugs.map(toInventoryDrugRow);
  const html = renderToStaticMarkup(
    React.createElement(DailyCheckPanel, { db: null, drugs: rows, pendingStockMap: new Map<string, number>() })
  );
  return html.replace(/<style[\s\S]*?<\/style>/g, '');
}

describe('toInventoryDrugRow', () => {
  it('carries the narcotic, psychotropic, poisonous and high-risk flags from the drug document', () => {
    const row = toInventoryDrugRow(drug({
      code: 'D1',
      name: '区分つき薬',
      isNarcotic: true,
      isPsychotropic: true,
      isPoisonous: true,
      isHighRisk: true
    }));
    assert.equal(row.isNarcotic, true);
    assert.equal(row.isPsychotropic, true);
    assert.equal(row.isPoisonous, true);
    assert.equal(row.isHighRisk, true);
  });

  it('leaves the flags unset when the drug document has none', () => {
    const row = toInventoryDrugRow(drug({ code: 'D2', name: '区分なし薬' }));
    assert.ok(!row.isNarcotic);
    assert.ok(!row.isPsychotropic);
    assert.ok(!row.isPoisonous);
    assert.ok(!row.isHighRisk);
  });

  it('keeps the document, the displayed fields and the lowercase search keys', () => {
    const source = drug({
      code: 'D3',
      name: 'ABC錠',
      yjCode: 'YJ123abc',
      genericName: '一般名',
      price: 12.5,
      location: 'A-01',
      stockQuantity: 7,
      isAbolished: false
    });
    const row = toInventoryDrugRow(source);
    assert.equal(row.doc, source);
    assert.equal(row.code, 'D3');
    assert.equal(row.name, 'ABC錠');
    assert.equal(row.genericName, '一般名');
    assert.equal(row.price, 12.5);
    assert.equal(row.location, 'A-01');
    assert.equal(row.stockQuantity, 7);
    assert.equal(row.searchNameLower, 'abc錠');
    assert.equal(row.searchYjCodeLower, 'yj123abc');
  });

  it('uses empty search keys when the name or YJ code is missing', () => {
    const row = toInventoryDrugRow({ code: 'D4', isGeneric: false } as Drug);
    assert.equal(row.searchNameLower, '');
    assert.equal(row.searchYjCodeLower, '');
  });
});

describe('DailyCheckPanel with drug rows built from drug documents', () => {
  it('lists narcotic and psychotropic drugs and leaves out ordinary ones', () => {
    const html = renderDailyCheckPanel([
      drug({ code: 'N1', name: '麻薬テスト錠', isNarcotic: true }),
      drug({ code: 'P1', name: '向精神薬テスト錠', isPsychotropic: true }),
      drug({ code: 'G1', name: '一般テスト錠' })
    ]);
    assert.match(html, /麻薬テスト錠/);
    assert.match(html, /向精神薬テスト錠/);
    assert.doesNotMatch(html, /一般テスト錠/);
    assert.doesNotMatch(html, /表示できる品目がありません/);
  });

  it('shows the empty state when no drug is a narcotic or psychotropic', () => {
    const html = renderDailyCheckPanel([
      drug({ code: 'G1', name: '一般テスト錠' }),
      drug({ code: 'H1', name: 'ハイリスクテスト錠', isHighRisk: true, isPoisonous: true })
    ]);
    assert.match(html, /表示できる品目がありません/);
    assert.doesNotMatch(html, /ハイリスクテスト錠/);
  });
});

describe('InventoryRow UI disabled states and markup pinning', () => {
  interface InventoryRowStateOverrides {
    isAdjusting?: boolean;
    isSaving?: boolean;
  }

  function renderInventoryRowWithState(
    props: InventoryRowProps,
    overrides: InventoryRowStateOverrides = {}
  ): string {
    const { isAdjusting = false, isSaving = false } = overrides;
    let callCount = 0;
    let activeDispatcher: { useState?: (init: unknown) => [unknown, (v: unknown) => void] } | undefined;
    let savedOrigUseState: ((init: unknown) => [unknown, (v: unknown) => void]) | undefined;

    function Wrapper(): React.ReactNode {
      const internals = (React as unknown as {
        __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
          H?: { useState?: (init: unknown) => [unknown, (v: unknown) => void] };
        };
      }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

      const dispatcher = internals?.H;
      if (dispatcher?.useState) {
        const origUseState = dispatcher.useState;
        activeDispatcher = dispatcher;
        savedOrigUseState = origUseState;
        dispatcher.useState = (initialState: unknown) => {
          const currentIndex = callCount++;
          if (currentIndex === 0) {
            assert.equal(
              initialState,
              false,
              `Expected InventoryRow useState #0 (isAdjusting) initial value to be false, got ${String(initialState)}`
            );
            return [isAdjusting, () => {}];
          }
          if (currentIndex === 2) {
            assert.equal(
              initialState,
              false,
              `Expected ReorderPointEditor useState #2 (isSaving) initial value to be false, got ${String(initialState)}`
            );
            return [isSaving, () => {}];
          }
          if (currentIndex === 5) {
            dispatcher.useState = origUseState;
          }
          return origUseState(initialState);
        };
      }

      return React.createElement(InventoryRow, props);
    }

    let html = '';
    try {
      html = renderToStaticMarkup(React.createElement(Wrapper));
    } finally {
      if (activeDispatcher && savedOrigUseState) {
        activeDispatcher.useState = savedOrigUseState;
      }
    }

    assert.equal(
      callCount,
      6,
      `Expected InventoryRow tree to call useState exactly 6 times, got ${callCount}`
    );
    return html;
  }

  function makeInventoryDrugRow(
    overrides: Partial<Drug> & Pick<Drug, 'code' | 'name'>,
    reorderPoint?: number
  ) {
    const row = toInventoryDrugRow(drug(overrides));
    if (reorderPoint !== undefined) {
      row.doc = { reorderPoint };
    }
    return row;
  }

  it('renders positive stock row without negative adjustment button, pins reorder input as enabled, and falls back to drug code when yjCode is absent', () => {
    const html = renderInventoryRowWithState({
      drug: makeInventoryDrugRow(
        {
          code: 'D100',
          name: 'アムロジピン錠5mg',
          yjCode: '2171022F2023',
          location: 'A-01-02',
          stockQuantity: 15
        },
        20
      ),
      pendingStock: 5,
      db: null,
      locations: []
    });

    assert.deepEqual(listDisabledOpeningTags(html), []);
    assert.ok(!html.includes('0へ補正'));
    assert.ok(!html.includes('補正中...'));
    assert.ok(!html.includes('stock-negative'));

    const reorderInput = findOpeningTag(html, 'aria-label="アムロジピン錠5mgの発注点"', 'input');
    assert.ok(!reorderInput.includes('disabled'), 'Reorder point input must be enabled when isSaving is false');
    assert.ok(reorderInput.includes('value="20"'));

    assert.ok(findOpeningTag(html, 'aria-label="棚番地パート1"', 'input').includes('value="A"'));
    assert.ok(findOpeningTag(html, 'aria-label="棚番地パート2"', 'input').includes('value="01"'));
    assert.ok(findOpeningTag(html, 'aria-label="棚番地パート3"', 'input').includes('value="02"'));
    assert.ok(html.includes('<td>2171022F2023</td>'));
    assert.ok(html.includes('<td class="text-right">5</td>'));

    const fallbackHtml = renderInventoryRowWithState({
      drug: makeInventoryDrugRow({
        code: 'GEN-001',
        name: '一般名テスト薬',
        stockQuantity: 3
      }),
      pendingStock: 5,
      db: null,
      locations: []
    });

    assert.ok(!fallbackHtml.includes('0へ補正'), 'Adjustment button must appear only when totalStock < 0');
    assert.ok(fallbackHtml.includes('<td class="text-right ">3</td>'));
    assert.ok(fallbackHtml.includes('<td class="text-right stock-negative">-2</td>'));
    assert.ok(fallbackHtml.includes('<td>GEN-001</td>'));
  });

  it('renders negative stock adjustment button as enabled when totalStock is negative and isAdjusting is false, and disables it with in-flight label when isAdjusting is true', () => {
    const props: InventoryRowProps = {
      drug: makeInventoryDrugRow({
        code: 'D200',
        name: 'メトホルミン錠250mg',
        yjCode: '3962002F1020',
        stockQuantity: -4
      }),
      pendingStock: 0,
      db: null,
      locations: []
    };

    const idleHtml = renderInventoryRowWithState(props, { isAdjusting: false, isSaving: false });
    assert.deepEqual(listDisabledOpeningTags(idleHtml), []);
    const idleBtn = findOpeningTag(idleHtml, '>0へ補正</button>', 'button');
    assert.ok(!idleBtn.includes('disabled'), 'Negative stock adjustment button must be enabled when isAdjusting is false');
    assert.ok(!idleHtml.includes('>補正中...</button>'));
    assert.equal((idleHtml.match(/stock-negative/g) || []).length, 2);
    assert.ok(idleHtml.includes('<td class="text-right">-</td>'));

    const adjustingHtml = renderInventoryRowWithState(props, { isAdjusting: true, isSaving: false });
    const disabledTags = listDisabledOpeningTags(adjustingHtml);
    assert.equal(disabledTags.length, 1);
    const adjustingBtn = findOpeningTag(adjustingHtml, '>補正中...</button>', 'button');
    assert.ok(adjustingBtn.includes('disabled=""'), 'Negative stock adjustment button must be disabled when isAdjusting is true');
    assert.equal(disabledTags[0], adjustingBtn);
    assert.ok(!adjustingHtml.includes('>0へ補正</button>'));
  });

  it('disables reorder point input when ReorderPointEditor isSaving is true while keeping adjustment button enabled', () => {
    const html = renderInventoryRowWithState(
      {
        drug: makeInventoryDrugRow({
          code: 'D300',
          name: 'ロキソニン錠60mg',
          yjCode: '1149019F1020',
          stockQuantity: -2
        }),
        pendingStock: 1,
        db: null,
        locations: []
      },
      { isAdjusting: false, isSaving: true }
    );

    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(disabledTags.length, 1);
    const reorderInput = findOpeningTag(html, 'aria-label="ロキソニン錠60mgの発注点"', 'input');
    assert.ok(reorderInput.includes('disabled=""'), 'Reorder point input must be disabled when isSaving is true');
    assert.equal(disabledTags[0], reorderInput);

    const adjustBtn = findOpeningTag(html, '0へ補正', 'button');
    assert.ok(!adjustBtn.includes('disabled'), 'Adjustment button must stay enabled when only reorder point is saving');
  });
});
