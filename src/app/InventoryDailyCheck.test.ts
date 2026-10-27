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
});
