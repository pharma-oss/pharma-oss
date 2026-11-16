import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import type { Drug } from '@/db/types';
import { findOpeningTag, listDisabledOpeningTags } from '@/lib/test_support/html_disabled_tags';
import { renderMarkupWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';
import { ImportMaster, type ImportMasterProps } from './components/ImportMaster';
import { toInventoryDrugRow, type DrugWithSearchCache } from './types';

interface ImportPreviewRow {
  rawCode: string;
  quantity: number;
  lotNumber: string;
  expirationDate: string;
  matchedDrug?: DrugWithSearchCache | null;
}

interface ImportMasterStateOverrides {
  parsedData?: ImportPreviewRow[];
  isImporting?: boolean;
  isOcrProcessing?: boolean;
}

function makeDrugRow(overrides: Partial<Drug> & Pick<Drug, 'code' | 'name'>): DrugWithSearchCache {
  return toInventoryDrugRow({
    isGeneric: false,
    stockQuantity: 10,
    ...overrides
  });
}

function makeBaseProps(overrides: Partial<ImportMasterProps> = {}): ImportMasterProps {
  return {
    db: null,
    drugs: [],
    activeTab: 'import',
    orderedDrugIds: new Set<string>(),
    onDrugsReceived: () => 0,
    ...overrides
  };
}

function renderImportMasterWithState(
  props: ImportMasterProps,
  overrides: ImportMasterStateOverrides = {}
): string {
  const { parsedData = [], isImporting = false, isOcrProcessing = false } = overrides;
  return renderMarkupWithReactUseStateMock(
    () => React.createElement(ImportMaster, props),
    {
      componentName: 'ImportMaster',
      restoreAtCallIndex: 2,
      expectedCalls: 3,
      overrides: {
        0: {
          assertInitial: (initialState) =>
            assert.ok(
              Array.isArray(initialState) && initialState.length === 0,
              `Expected ImportMaster useState #0 (parsedData) initial value to be empty array, got ${String(initialState)}`
            ),
          value: parsedData
        },
        1: {
          assertInitial: (initialState) =>
            assert.equal(
              initialState,
              false,
              `Expected ImportMaster useState #1 (isImporting) initial value to be false, got ${String(initialState)}`
            ),
          value: isImporting
        },
        2: {
          assertInitial: (initialState) =>
            assert.equal(
              initialState,
              false,
              `Expected ImportMaster useState #2 (isOcrProcessing) initial value to be false, got ${String(initialState)}`
            ),
          value: isOcrProcessing
        }
      }
    }
  );
}

describe('ImportMaster UI disabled states and markup pinning', () => {
  it('renders OCR upload tab with enabled file input when idle and disables it with busy label and class when isOcrProcessing is true', () => {
    const props = makeBaseProps({ activeTab: 'import-ocr' });

    const idleHtml = renderImportMasterWithState(props, { isOcrProcessing: false });
    assert.deepEqual(listDisabledOpeningTags(idleHtml), []);
    const idleInput = findOpeningTag(idleHtml, 'accept=".png,.jpg,.jpeg"', 'input');
    assert.doesNotMatch(idleInput, /\sdisabled=""(?=[\s/>]|$)/, 'OCR file input must be enabled when isOcrProcessing is false');
    assert.ok(idleHtml.includes('納品書の画像を選択 (PNG, JPG)'));
    assert.ok(!idleHtml.includes('読み取り中...'));
    assert.ok(!idleHtml.includes('is-busy'));

    const busyHtml = renderImportMasterWithState(props, { isOcrProcessing: true });
    const disabledTags = listDisabledOpeningTags(busyHtml);
    assert.equal(disabledTags.length, 1);
    const busyInput = findOpeningTag(busyHtml, 'accept=".png,.jpg,.jpeg"', 'input');
    assert.ok(busyInput.includes('disabled=""'), 'OCR file input must be disabled when isOcrProcessing is true');
    assert.equal(disabledTags[0], busyInput);
    assert.ok(busyHtml.includes('読み取り中...'));
    assert.ok(!busyHtml.includes('納品書の画像を選択'));
    assert.ok(busyHtml.includes('is-busy'));
  });

  it('renders CSV import tab without preview when parsedData is empty and disables import execution button when all preview rows are unmatched', () => {
    const props = makeBaseProps({ activeTab: 'import' });

    const emptyHtml = renderImportMasterWithState(props, { parsedData: [] });
    assert.deepEqual(listDisabledOpeningTags(emptyHtml), []);
    const csvInput = findOpeningTag(emptyHtml, 'accept=".csv"', 'input');
    assert.doesNotMatch(csvInput, /\sdisabled=""(?=[\s/>]|$)/);
    assert.ok(emptyHtml.includes('卸データ（CSV）から入荷インポート'));
    assert.ok(!emptyHtml.includes('プレビュー'));
    assert.ok(!emptyHtml.includes('インポート実行'));

    const unmatchedHtml = renderImportMasterWithState(props, {
      parsedData: [
        {
          rawCode: 'UNKNOWN-999',
          quantity: 12,
          lotNumber: 'LOT-01',
          expirationDate: '2027-08',
          matchedDrug: null
        }
      ],
      isImporting: false
    });

    assert.ok(unmatchedHtml.includes('プレビュー (1 件)'));
    assert.ok(unmatchedHtml.includes('unmatched-import-row'));
    assert.ok(unmatchedHtml.includes('<span class="unmatched">マスター未登録</span>'));
    assert.ok(!unmatchedHtml.includes('発注済み→自動解除'));

    const disabledTags = listDisabledOpeningTags(unmatchedHtml);
    assert.equal(disabledTags.length, 1);
    const importBtn = findOpeningTag(unmatchedHtml, 'インポート実行', 'button');
    assert.ok(importBtn.includes('disabled=""'), 'Import button must be disabled when no row matches master');
    assert.equal(disabledTags[0], importBtn);

    const tooltipWrapper = findOpeningTag(unmatchedHtml, 'class="btn-tooltip-wrapper"', 'span');
    assert.ok(tooltipWrapper.includes('data-disabled="true"'));
    assert.ok(tooltipWrapper.includes('title="インポート可能なデータがありません"'));
    assert.ok(!unmatchedHtml.includes('animate-spin'));
  });

  it('enables import execution button when valid matched row exists, renders auto-clear badge for ordered drugs, and disables button with spinner when isImporting is true', () => {
    const orderedDrug = makeDrugRow({ code: 'D-ORD', name: 'アムロジピン錠5mg' });
    const regularDrug = makeDrugRow({ code: 'D-REG', name: 'ロキソニン錠60mg' });
    const props = makeBaseProps({
      activeTab: 'import',
      drugs: [orderedDrug, regularDrug],
      orderedDrugIds: new Set(['D-ORD'])
    });
    const parsedData: ImportPreviewRow[] = [
      {
        rawCode: 'JAN-ORD',
        quantity: 30,
        lotNumber: 'L100',
        expirationDate: '2028-01',
        matchedDrug: orderedDrug
      },
      {
        rawCode: 'JAN-REG',
        quantity: 10,
        lotNumber: '',
        expirationDate: '',
        matchedDrug: regularDrug
      }
    ];

    const readyHtml = renderImportMasterWithState(props, { parsedData, isImporting: false });
    assert.deepEqual(listDisabledOpeningTags(readyHtml), []);
    assert.ok(readyHtml.includes('プレビュー (2 件)'));
    assert.equal((readyHtml.match(/発注済み→自動解除/g) || []).length, 1);
    assert.ok(readyHtml.includes('未抽出'));

    const readyBtn = findOpeningTag(readyHtml, 'インポート実行</button>', 'button');
    assert.doesNotMatch(readyBtn, /\sdisabled=""(?=[\s/>]|$)/, 'Import button must be enabled when matched data exists and not importing');
    const readyWrapper = findOpeningTag(readyHtml, 'class="btn-tooltip-wrapper"', 'span');
    assert.ok(readyWrapper.includes('data-disabled="false"'));
    assert.ok(!readyHtml.includes('インポート中...</button>'));
    assert.ok(!readyHtml.includes('animate-spin'));

    const importingHtml = renderImportMasterWithState(props, { parsedData, isImporting: true });
    const disabledTags = listDisabledOpeningTags(importingHtml);
    assert.equal(disabledTags.length, 1);
    const importingBtn = findOpeningTag(importingHtml, 'インポート中...</button>', 'button');
    assert.ok(importingBtn.includes('disabled=""'), 'Import button must be disabled when isImporting is true');
    assert.equal(disabledTags[0], importingBtn);

    const importingWrapper = findOpeningTag(importingHtml, 'class="btn-tooltip-wrapper"', 'span');
    assert.ok(importingWrapper.includes('data-disabled="true"'));
    assert.ok(importingWrapper.includes('title="インポート中..."'));
    assert.ok(importingHtml.includes('animate-spin'));
    assert.ok(!importingHtml.includes('インポート実行</button>'));
  });

  it('caps preview rows at 100 items and toggles the preview limit message strictly above 100 rows', () => {
    const drug = makeDrugRow({ code: 'D-BULK', name: '大量入荷テスト錠' });
    const props = makeBaseProps({ activeTab: 'import', drugs: [drug] });

    const makeRows = (count: number): ImportPreviewRow[] =>
      Array.from({ length: count }, (_, idx) => ({
        rawCode: `ROW-${String(idx).padStart(3, '0')}`,
        quantity: 1,
        lotNumber: 'L1',
        expirationDate: '2028-03',
        matchedDrug: drug
      }));

    const html100 = renderImportMasterWithState(props, { parsedData: makeRows(100) });
    assert.ok(html100.includes('プレビュー (100 件)'));
    assert.ok(html100.includes('ROW-099'));
    assert.ok(!html100.includes('※プレビューが多すぎます'));

    const html105 = renderImportMasterWithState(props, { parsedData: makeRows(105) });
    assert.ok(html105.includes('プレビュー (105 件)'));
    assert.ok(html105.includes('ROW-099'));
    assert.ok(!html105.includes('ROW-100'));
    assert.ok(!html105.includes('ROW-104'));
    assert.ok(html105.includes('※プレビューが多すぎます。上位100件のみ表示しています（全 105 件）。'));
  });
});
