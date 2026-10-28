import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { findOpeningTag } from '@/lib/test_support/html_disabled_tags';
import { DailyCheckPanel } from './inventory/components/DailyCheckPanel';
import { toInventoryDrugRow } from './inventory/types';
import {
  DAILY_CONTROLLED_DRUG_DIFFERENCE_REASONS,
  DAILY_CONTROLLED_DRUG_SNAPSHOT_STORAGE_KEY,
  hasDailyControlledDrugActualCount,
  getDailyControlledDrugCheckSummary,
  getDailyControlledDrugMissingReasonRows,
  type DailyControlledDrugCheckRow
} from '@/lib/inventory_daily_check';

describe('InventoryDailyCheck components and pure contracts', () => {
  it('exports DailyCheckPanel as a callable React component function', () => {
    assert.equal(typeof DailyCheckPanel, 'function');
  });

  it('defines structured difference reasons and storage key', () => {
    assert.ok(DAILY_CONTROLLED_DRUG_DIFFERENCE_REASONS.length >= 4);
    assert.equal(DAILY_CONTROLLED_DRUG_SNAPSHOT_STORAGE_KEY, 'yakureki_controlled_drug_daily_check_latest_v1');
  });

  it('correctly calculates summary and identifies missing reason rows', () => {
    const rows: DailyControlledDrugCheckRow[] = [
      {
        drugCode: 'd1',
        drugName: '麻薬A',
        kind: 'narcotic',
        systemStock: 10,
        pendingStock: 0,
        shelfStockSystem: 10,
        actualCount: 10
      },
      {
        drugCode: 'd2',
        drugName: '向精神薬B',
        kind: 'psychotropic',
        systemStock: 20,
        pendingStock: 0,
        shelfStockSystem: 20,
        actualCount: 18 // mismatch without reason
      },
      {
        drugCode: 'd3',
        drugName: '麻薬C',
        kind: 'narcotic',
        systemStock: 5,
        pendingStock: 0,
        shelfStockSystem: 5 // unentered
      }
    ];

    const summary = getDailyControlledDrugCheckSummary(rows);
    assert.equal(summary.totalCount, 3);
    assert.equal(summary.enteredCount, 2);
    assert.equal(summary.unenteredCount, 1);
    assert.equal(summary.mismatchCount, 1);

    const missingReasonRows = getDailyControlledDrugMissingReasonRows(rows);
    assert.equal(missingReasonRows.length, 1);
    assert.equal(missingReasonRows[0].drugCode, 'd2');
  });
});

describe('DailyCheckPanel UI disabled states and markup pinning', () => {
  const sampleNarcoticDrug = toInventoryDrugRow({
    code: '610400001',
    name: 'モルヒネ塩酸塩錠10mg',
    yjCode: '1149001F1020',
    isGeneric: false,
    isNarcotic: true,
    isPsychotropic: false,
    stockQuantity: 50
  });

  const samplePsychotropicDrug = toInventoryDrugRow({
    code: '610400002',
    name: 'ジアゼパム錠5mg',
    yjCode: '1124007F2039',
    isGeneric: true,
    isNarcotic: false,
    isPsychotropic: true,
    stockQuantity: 100
  });

  const sampleNonControlledDrug = toInventoryDrugRow({
    code: '610400003',
    name: 'アムロジピン錠5mg',
    yjCode: '2171022F2023',
    isGeneric: true,
    isNarcotic: false,
    isPsychotropic: false,
    stockQuantity: 200
  });

  it('renders all 4 action buttons disabled when drugs list is empty', () => {
    const html = renderToStaticMarkup(
      React.createElement(DailyCheckPanel, {
        db: {},
        drugs: [],
        pendingStockMap: new Map<string, number>()
      })
    );

    const fillBtnTag = findOpeningTag(html, '表示中を一致', 'button');
    const clearBtnTag = findOpeningTag(html, '表示中クリア', 'button');
    const csvBtnTag = findOpeningTag(html, '表示中CSV', 'button');
    const saveBtnTag = findOpeningTag(html, '棚卸し結果を保存', 'button');
    const saveTooltipSpan = findOpeningTag(html, '棚卸し結果を保存', 'span');

    assert.ok(fillBtnTag.includes('disabled=""'), 'Fill button must be disabled when no rows exist');
    assert.ok(clearBtnTag.includes('disabled=""'), 'Clear button must be disabled when no rows exist');
    assert.ok(csvBtnTag.includes('disabled=""'), 'CSV export button must be disabled when no rows exist');
    assert.ok(saveBtnTag.includes('disabled=""'), 'Save button must be disabled when no rows exist');
    assert.ok(saveTooltipSpan.includes('data-disabled="true"'), 'Save tooltip wrapper must have data-disabled="true"');
    assert.ok(html.includes('表示できる品目がありません'), 'Empty table row message must be displayed');
  });

  it('renders all action buttons disabled when only non-controlled drugs are supplied', () => {
    const html = renderToStaticMarkup(
      React.createElement(DailyCheckPanel, {
        db: {},
        drugs: [sampleNonControlledDrug],
        pendingStockMap: new Map<string, number>()
      })
    );

    const fillBtnTag = findOpeningTag(html, '表示中を一致', 'button');
    const clearBtnTag = findOpeningTag(html, '表示中クリア', 'button');
    const csvBtnTag = findOpeningTag(html, '表示中CSV', 'button');
    const saveBtnTag = findOpeningTag(html, '棚卸し結果を保存', 'button');
    const saveTooltipSpan = findOpeningTag(html, '棚卸し結果を保存', 'span');

    assert.ok(fillBtnTag.includes('disabled=""'), 'Fill button must be disabled for non-controlled drugs');
    assert.ok(clearBtnTag.includes('disabled=""'), 'Clear button must be disabled for non-controlled drugs');
    assert.ok(csvBtnTag.includes('disabled=""'), 'CSV export button must be disabled for non-controlled drugs');
    assert.ok(saveBtnTag.includes('disabled=""'), 'Save button must be disabled for non-controlled drugs');
    assert.ok(saveTooltipSpan.includes('data-disabled="true"'), 'Save wrapper must have data-disabled="true"');
    assert.ok(html.includes('表示できる品目がありません'));
  });

  it('enables fill and csv buttons while pinning clear and save as disabled when controlled drugs are unentered', () => {
    const html = renderToStaticMarkup(
      React.createElement(DailyCheckPanel, {
        db: {},
        drugs: [sampleNarcoticDrug, samplePsychotropicDrug],
        pendingStockMap: new Map<string, number>()
      })
    );

    const fillBtnTag = findOpeningTag(html, '表示中を一致', 'button');
    const clearBtnTag = findOpeningTag(html, '表示中クリア', 'button');
    const csvBtnTag = findOpeningTag(html, '表示中CSV', 'button');
    const saveBtnTag = findOpeningTag(html, '棚卸し結果を保存', 'button');
    const saveTooltipSpan = findOpeningTag(html, '棚卸し結果を保存', 'span');

    assert.ok(!fillBtnTag.includes('disabled'), 'Fill button must be enabled when controlled drugs exist');
    assert.ok(!csvBtnTag.includes('disabled'), 'CSV export button must be enabled when controlled drugs exist');
    assert.ok(clearBtnTag.includes('disabled=""'), 'Clear button must remain disabled when enteredCount is 0');
    assert.ok(saveBtnTag.includes('disabled=""'), 'Save button must remain disabled when enteredCount is 0');
    assert.ok(saveTooltipSpan.includes('data-disabled="true"'), 'Save wrapper must have data-disabled="true"');
    assert.ok(saveTooltipSpan.includes('title="実地数を入力してください"'), 'Save tooltip must guide user to enter counts');

    assert.ok(html.includes('モルヒネ塩酸塩錠10mg'), 'Narcotic drug name should be rendered in table');
    assert.ok(html.includes('ジアゼパム錠5mg'), 'Psychotropic drug name should be rendered in table');
    assert.ok(html.includes('未入力 2 件'), 'Summary note should indicate 2 unentered rows');
  });

  interface DailyCheckStateOverrides {
    actualCounts?: Record<string, number>;
    isSavingInventory?: boolean;
  }

  function renderWithDailyCheckOverrides(
    drugs: ReturnType<typeof toInventoryDrugRow>[],
    overrides: DailyCheckStateOverrides = {}
  ): string {
    const { actualCounts = {}, isSavingInventory = false } = overrides;
    let callCount = 0;

    function Wrapper(): React.ReactNode {
      const internals = (React as unknown as {
        __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
          H?: { useState?: (init: unknown) => [unknown, (v: unknown) => void] }
        }
      }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

      const dispatcher = internals?.H;
      if (dispatcher?.useState) {
        const origUseState = dispatcher.useState;
        dispatcher.useState = (initialState: unknown) => {
          const currentIndex = callCount++;
          if (currentIndex === 0) {
            assert.deepEqual(
              initialState,
              {},
              `Expected DailyCheckPanel useState call #0 initial value to be {}, got ${JSON.stringify(initialState)}`
            );
            return [actualCounts, () => {}];
          }
          if (currentIndex === 7) {
            assert.equal(
              initialState,
              false,
              `Expected DailyCheckPanel useState call #7 initial value to be false (isSavingInventory), got ${String(initialState)}`
            );
            dispatcher.useState = origUseState;
            return [isSavingInventory, () => {}];
          }
          return origUseState(initialState);
        };
      }

      return React.createElement(DailyCheckPanel, {
        db: {},
        drugs,
        pendingStockMap: new Map<string, number>()
      });
    }

    const html = renderToStaticMarkup(React.createElement(Wrapper));
    assert.equal(
      callCount,
      8,
      `Expected DailyCheckPanel to call useState exactly 8 times, got ${callCount}`
    );
    return html;
  }

  it('pins per-row clear count button disabled state based on hasActualCount', () => {
    const drugs = [sampleNarcoticDrug, samplePsychotropicDrug];

    // Case 1: unentered actual counts -> both row clear buttons must be disabled
    const unenteredHtml = renderWithDailyCheckOverrides(drugs, { actualCounts: {} });
    const rowClearUnentered1 = findOpeningTag(
      unenteredHtml,
      'モルヒネ塩酸塩錠10mgの実地棚在庫数をクリア',
      'button'
    );
    const rowClearUnentered2 = findOpeningTag(
      unenteredHtml,
      'ジアゼパム錠5mgの実地棚在庫数をクリア',
      'button'
    );
    assert.ok(
      rowClearUnentered1.includes('disabled=""'),
      `Unentered narcotic row clear button must be disabled: ${rowClearUnentered1}`
    );
    assert.ok(
      rowClearUnentered2.includes('disabled=""'),
      `Unentered psychotropic row clear button must be disabled: ${rowClearUnentered2}`
    );

    // Case 2: entered count for drug1 only -> drug1 row clear enabled, drug2 row clear disabled
    const partiallyEnteredHtml = renderWithDailyCheckOverrides(drugs, {
      actualCounts: { [sampleNarcoticDrug.code]: 50 }
    });
    const rowClearEntered1 = findOpeningTag(
      partiallyEnteredHtml,
      'モルヒネ塩酸塩錠10mgの実地棚在庫数をクリア',
      'button'
    );
    const rowClearStillUnentered2 = findOpeningTag(
      partiallyEnteredHtml,
      'ジアゼパム錠5mgの実地棚在庫数をクリア',
      'button'
    );
    assert.ok(
      !rowClearEntered1.includes('disabled'),
      `Entered narcotic row clear button must be enabled: ${rowClearEntered1}`
    );
    assert.ok(
      rowClearStillUnentered2.includes('disabled=""'),
      `Unentered psychotropic row clear button must remain disabled: ${rowClearStillUnentered2}`
    );
  });

  it('enables clear all and save buttons when actual counts are entered and idle', () => {
    const drugs = [sampleNarcoticDrug, samplePsychotropicDrug];
    const html = renderWithDailyCheckOverrides(drugs, {
      actualCounts: {
        [sampleNarcoticDrug.code]: 50,
        [samplePsychotropicDrug.code]: 100
      },
      isSavingInventory: false
    });

    const clearAllBtnTag = findOpeningTag(html, '表示中クリア', 'button');
    const saveBtnTag = findOpeningTag(html, 'btn-primary flex-center gap-2', 'button');
    const saveTooltipSpan = findOpeningTag(html, 'btn-tooltip-wrapper', 'span');

    assert.ok(
      !clearAllBtnTag.includes('disabled'),
      `Clear all button must be enabled when enteredCount > 0: ${clearAllBtnTag}`
    );
    assert.ok(
      !saveBtnTag.includes('disabled'),
      `Save button must be enabled when enteredCount > 0 and idle: ${saveBtnTag}`
    );
    assert.ok(
      !saveTooltipSpan.includes('data-disabled="true"'),
      `Save tooltip must not have data-disabled="true" when enabled: ${saveTooltipSpan}`
    );
    assert.ok(html.includes('棚卸し結果を保存'), 'Save button label should be "棚卸し結果を保存"');
  });

  it('pins save button as disabled and wrapper data-disabled when isSavingInventory is true even with entered counts', () => {
    const drugs = [sampleNarcoticDrug, samplePsychotropicDrug];
    const html = renderWithDailyCheckOverrides(drugs, {
      actualCounts: {
        [sampleNarcoticDrug.code]: 50
      },
      isSavingInventory: true
    });

    const saveBtnTag = findOpeningTag(html, 'btn-primary flex-center gap-2', 'button');
    const saveTooltipSpan = findOpeningTag(html, 'btn-tooltip-wrapper', 'span');

    assert.ok(
      saveBtnTag.includes('disabled=""'),
      `Save button must be disabled when isSavingInventory is true: ${saveBtnTag}`
    );
    assert.ok(
      saveTooltipSpan.includes('data-disabled="true"'),
      `Save tooltip wrapper must have data-disabled="true" when saving: ${saveTooltipSpan}`
    );
    assert.ok(
      saveTooltipSpan.includes('title="保存中..."'),
      `Save tooltip title must be "保存中...": ${saveTooltipSpan}`
    );
    assert.ok(html.includes('保存中...'), 'Save button label should change to "保存中..."');
  });
});
