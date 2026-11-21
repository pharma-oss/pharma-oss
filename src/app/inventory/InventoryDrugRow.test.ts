import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Drug } from '@/db/types';
import { findOpeningTag, listDisabledOpeningTags } from '@/lib/test_support/html_disabled_tags';
import { renderMarkupWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';
import { DailyCheckPanel } from './components/DailyCheckPanel';
import {
  assertPatchableInventoryDrugDoc,
  InventoryRow,
  saveDrugLocationChange,
  type InventoryRowProps
} from './components/InventoryRow';
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
    return renderMarkupWithReactUseStateMock(
      () => React.createElement(InventoryRow, props),
      {
        componentName: 'InventoryRow',
        restoreAtCallIndex: 5,
        expectedCalls: 6,
        overrides: {
          0: {
            assertInitial: (initialState) =>
              assert.equal(
                initialState,
                false,
                `Expected InventoryRow useState #0 (isAdjusting) initial value to be false, got ${String(initialState)}`
              ),
            value: isAdjusting
          },
          2: {
            assertInitial: (initialState) =>
              assert.equal(
                initialState,
                false,
                `Expected ReorderPointEditor useState #2 (isSaving) initial value to be false, got ${String(initialState)}`
              ),
            value: isSaving
          }
        }
      }
    );
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
    assert.doesNotMatch(reorderInput, /\sdisabled=""(?=[\s/>]|$)/, 'Reorder point input must be enabled when isSaving is false');
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
    assert.doesNotMatch(idleBtn, /\sdisabled=""(?=[\s/>]|$)/, 'Negative stock adjustment button must be enabled when isAdjusting is false');
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
    assert.doesNotMatch(adjustBtn, /\sdisabled=""(?=[\s/>]|$)/, 'Adjustment button must stay enabled when only reorder point is saving');
  });

  it('saveDrugLocationChange handles location creation/patch success and returns Japanese alerts on insert or patch failure', async () => {
    const inserted: unknown[] = [];
    const patched: Array<Record<string, unknown>> = [];
    const newLoc = { id: 'loc-new', part1: 'A', part2: '09', part3: '', displayText: 'A-09' };

    const okOutcome = await saveDrugLocationChange({
      drugDoc: { patch: async (v) => { patched.push(v); } },
      locationString: 'A-09',
      newLocationDoc: newLoc,
      locationsCollection: { insert: async (doc) => { inserted.push(doc); } }
    });
    assert.deepEqual(okOutcome, { ok: true, alertMessage: null });
    assert.equal(inserted.length, 1);
    assert.deepEqual(patched, [{ location: 'A-09' }]);

    // 新規棚番登録が失敗した場合は薬品への patch を行わず通知を返す
    let patchCalledOnInsertFail = false;
    const insertFail = await saveDrugLocationChange({
      drugDoc: { patch: async () => { patchCalledOnInsertFail = true; } },
      locationString: 'A-09',
      newLocationDoc: newLoc,
      locationsCollection: { insert: async () => { throw new Error('insert failed'); } }
    });
    assert.equal(insertFail.ok, false);
    assert.equal(patchCalledOnInsertFail, false);
    assert.match(insertFail.alertMessage || '', /新しい棚番地の登録に失敗しました/);

    // 薬品 patch 失敗時は保存失敗・クリア失敗いずれも画面復元を促す通知を返す
    const patchFail = await saveDrugLocationChange({
      drugDoc: { patch: async () => { throw new Error('CONFLICT'); } },
      locationString: 'B-01-02'
    });
    assert.equal(patchFail.ok, false);
    assert.match(patchFail.alertMessage || '', /薬品の棚番地の保存に失敗しました/);

    const clearFail = await saveDrugLocationChange({
      drugDoc: { patch: async () => { throw new Error('CONFLICT'); } },
      locationString: ''
    });
    assert.equal(clearFail.ok, false);
    assert.match(clearFail.alertMessage || '', /薬品の棚番地の保存に失敗しました/);

    // patch() を持たない読み取り専用オブジェクトが渡されても例外を握って失敗通知を返す
    assert.throws(() => assertPatchableInventoryDrugDoc({ reorderPoint: 10 }), TypeError);
    assert.throws(() => assertPatchableInventoryDrugDoc(null), TypeError);
    const nonPatchableOutcome = await saveDrugLocationChange({
      drugDoc: { reorderPoint: 10 },
      locationString: 'C-02-01'
    });
    assert.equal(nonPatchableOutcome.ok, false);
    assert.match(nonPatchableOutcome.alertMessage || '', /薬品の棚番地の保存に失敗しました/);
  });
});
