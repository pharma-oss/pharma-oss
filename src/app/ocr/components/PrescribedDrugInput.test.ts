import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { DatabaseContext } from '@/db/DatabaseContext';
import type { RecentDrug } from '@/lib/drug_recents';
import type { DrugMasterRecord } from '@/lib/master-data/drug_master';
import { findOpeningTag, stripStyleBlocks } from '@/lib/test_support/html_disabled_tags';
import { renderMarkupWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';
import type { Prescription } from '../types';
import { PrescribedDrugInput, calculatePrescribedDrugSelectUpdates } from './PrescribedDrugInput';

const mockDrugWithUnit: DrugMasterRecord = {
  code: '620000003',
  name: 'アンブロキソール塩酸塩シロップ０．３％',
  yjCode: '2239001S1020',
  isGeneric: true,
  isAbolished: false,
  price: 5.4,
  stockQuantity: 500,
  unitText: 'ｍＬ',
  unitCode: '007',
  searchNameLower: 'アンブロキソール塩酸塩シロップ０．３％',
  searchGenericLower: 'アンブロキソール塩酸塩'
};

test('calculatePrescribedDrugSelectUpdates produces unitText and unitCode updates when drug has unit', () => {
  const updates = calculatePrescribedDrugSelectUpdates(mockDrugWithUnit, {
    dispensedDrug: '',
    unitText: '',
    unitCode: '',
    electronicUnitConversion: undefined
  });

  const unitTextUpdate = updates.find((u) => u.field === 'unitText');
  const unitCodeUpdate = updates.find((u) => u.field === 'unitCode');

  assert.ok(unitTextUpdate, 'unitText update should be produced');
  assert.equal(unitTextUpdate?.value, 'ｍＬ');
  assert.ok(unitCodeUpdate, 'unitCode update should be produced');
  assert.equal(unitCodeUpdate?.value, '007');
});

test('calculatePrescribedDrugSelectUpdates overwrites unitText/unitCode with master unit when electronic conversion exists', () => {
  const updates = calculatePrescribedDrugSelectUpdates(mockDrugWithUnit, {
    dispensedDrug: '',
    unitText: '本',
    unitCode: '010',
    electronicUnitConversion: {
      conversionFactor: '1',
      prescribedAmount: '10',
      prescribedUnitText: '本',
      prescribedUnitCode: '010'
    }
  });

  const unitTextUpdate = updates.find((u) => u.field === 'unitText');
  const unitCodeUpdate = updates.find((u) => u.field === 'unitCode');

  assert.ok(unitTextUpdate, '換算あり明細は表示が処方単位ペアで保護されるため、マスタ単位で上書きされること');
  assert.equal(unitTextUpdate?.value, 'ｍＬ');
  assert.ok(unitCodeUpdate, '換算あり明細はマスタ単位コードで上書きされること');
  assert.equal(unitCodeUpdate?.value, '007');
});

test('calculatePrescribedDrugSelectUpdates protects existing unitText/unitCode when no conversion exists (QR/manual entry)', () => {
  const updates = calculatePrescribedDrugSelectUpdates(mockDrugWithUnit, {
    dispensedDrug: '',
    unitText: '本',
    unitCode: '010',
    electronicUnitConversion: undefined
  });

  const unitTextUpdate = updates.find((u) => u.field === 'unitText');
  const unitCodeUpdate = updates.find((u) => u.field === 'unitCode');

  assert.equal(unitTextUpdate, undefined, '換算なし明細で既に単位がある場合、手入力・QR単位が保護されること');
  assert.equal(unitCodeUpdate, undefined, '換算なし明細で既にコードがある場合、保護されること');
});

test('calculatePrescribedDrugSelectUpdates suppresses unitText/unitCode when master drug does not carry unit', () => {
  const drugWithoutUnit: DrugMasterRecord = {
    ...mockDrugWithUnit,
    unitText: undefined,
    unitCode: undefined
  };

  const updates = calculatePrescribedDrugSelectUpdates(drugWithoutUnit, {
    dispensedDrug: '',
    unitText: '',
    unitCode: '',
    electronicUnitConversion: undefined
  });

  const unitTextUpdate = updates.find((u) => u.field === 'unitText');
  const unitCodeUpdate = updates.find((u) => u.field === 'unitCode');

  assert.equal(unitTextUpdate, undefined);
  assert.equal(unitCodeUpdate, undefined);
});

interface PrescribedDrugInputHookOverrides {
  suggestions?: DrugMasterRecord[];
  showDropdown?: boolean;
  focusedIndex?: number;
  typedQuery?: string;
  recentDrugs?: RecentDrug[];
  showRecents?: boolean;
  isSearching?: boolean;
}

const basePrescription: Prescription = {
  id: 'rx-1',
  rpId: 'rp-1',
  drugCode: '',
  drugName: '',
  dispensedDrug: '',
  changeReason: '',
  amount: '1',
  usage: '1日1回朝食後',
  days: '14'
};

function makeDrugRecord(
  overrides: Partial<DrugMasterRecord> & Pick<DrugMasterRecord, 'code' | 'name'>
): DrugMasterRecord {
  return {
    isGeneric: false,
    searchNameLower: overrides.name.toLowerCase(),
    searchGenericLower: (overrides.genericName ?? '').toLowerCase(),
    ...overrides
  };
}

function renderPrescribedDrugInput(
  options: {
    prescription?: Partial<Prescription>;
    index?: number;
    hooks?: PrescribedDrugInputHookOverrides;
  } = {}
): string {
  const prescription: Prescription = {
    ...basePrescription,
    ...options.prescription
  };
  const hooks = options.hooks ?? {};

  const html = renderMarkupWithReactUseStateMock(
    () =>
      React.createElement(
        DatabaseContext.Provider,
        { value: null },
        React.createElement(PrescribedDrugInput, {
          prescription,
          index: options.index ?? 0,
          onChange: () => { },
          onOpenDrugSearch: () => { }
        })
      ),
    {
      componentName: 'PrescribedDrugInput',
      restoreAtCallIndex: 6,
      expectedCalls: 7,
      overrides: {
        0: {
          assertInitial: (v) =>
            assert.ok(
              Array.isArray(v) && v.length === 0,
              'Hook #0 (suggestions) must initialize as empty array'
            ),
          ...(hooks.suggestions !== undefined ? { value: hooks.suggestions } : {})
        },
        1: {
          assertInitial: (v) =>
            assert.equal(v, false, 'Hook #1 (showDropdown) must initialize as false'),
          ...(hooks.showDropdown !== undefined ? { value: hooks.showDropdown } : {})
        },
        2: {
          assertInitial: (v) =>
            assert.equal(v, -1, 'Hook #2 (focusedIndex) must initialize as -1'),
          ...(hooks.focusedIndex !== undefined ? { value: hooks.focusedIndex } : {})
        },
        3: {
          assertInitial: (v) =>
            assert.equal(v, '', 'Hook #3 (typedQuery) must initialize as empty string'),
          ...(hooks.typedQuery !== undefined ? { value: hooks.typedQuery } : {})
        },
        4: {
          assertInitial: (v) =>
            assert.ok(
              Array.isArray(v) && v.length === 0,
              'Hook #4 (recentDrugs) must initialize as empty array'
            ),
          ...(hooks.recentDrugs !== undefined ? { value: hooks.recentDrugs } : {})
        },
        5: {
          assertInitial: (v) =>
            assert.equal(v, false, 'Hook #5 (showRecents) must initialize as false'),
          ...(hooks.showRecents !== undefined ? { value: hooks.showRecents } : {})
        },
        6: {
          assertInitial: (v) =>
            assert.equal(v, false, 'Hook #6 (isSearching) must initialize as false'),
          ...(hooks.isSearching !== undefined ? { value: hooks.isSearching } : {})
        }
      }
    }
  );
  return stripStyleBlocks(html);
}

describe('PrescribedDrugInput SSR UI rendering', () => {
  test('renders loading status dropdown while isSearching is true for a 2+ character query', () => {
    const searchingHtml = renderPrescribedDrugInput({
      hooks: {
        typedQuery: 'アム',
        isSearching: true,
        showDropdown: false
      }
    });
    assert.ok(searchingHtml.includes('data-testid="prescribed-drug-searching"'));
    assert.ok(searchingHtml.includes('候補を検索中...'));

    const idleHtml = renderPrescribedDrugInput({
      hooks: {
        typedQuery: 'アム',
        isSearching: false,
        showDropdown: false
      }
    });
    assert.ok(!idleHtml.includes('data-testid="prescribed-drug-searching"'));
  });
  test('renders closed input and detail search button with 1-based aria-labels and suppresses dropdowns', () => {
    const html = renderPrescribedDrugInput({
      index: 1,
      prescription: { drugName: 'アンブロキソール塩酸塩シロップ０．３％' },
      hooks: {
        suggestions: [makeDrugRecord({ code: '620000100', name: '候補薬A' })],
        recentDrugs: [{ code: '620000200', name: '最近薬B' }],
        showDropdown: false,
        showRecents: false
      }
    });

    const inputTag = findOpeningTag(html, 'aria-label="処方薬品名 2"', 'input');
    assert.match(inputTag, /\btype="text"/);
    assert.match(inputTag, /\bclass="drug-name"/);
    assert.match(inputTag, /\bplaceholder="薬品名を入力（2文字から候補）"/);
    assert.match(inputTag, /\bautoComplete="off"/);
    assert.match(inputTag, /\bspellCheck="false"/);
    assert.match(inputTag, /\benterKeyHint="search"/);
    assert.match(inputTag, /\bvalue="アンブロキソール塩酸塩シロップ０．３％"/);

    const searchBtn = findOpeningTag(html, 'class="drug-search-button"', 'button');
    assert.match(searchBtn, /\btype="button"/);
    assert.match(searchBtn, /\baria-label="処方薬品 2 を詳細検索"/);
    assert.match(searchBtn, /\btitle="薬品を詳細検索"/);

    assert.ok(!html.includes('recent-dropdown'));
    assert.ok(!html.includes('prescribed-dropdown'));
    assert.ok(!html.includes('最近選んだ薬品'));
    assert.ok(!html.includes('詳細検索を開く'));
  });

  test('renders up to 8 recent drugs only when showRecents is true and showDropdown is false', () => {
    const recentDrugs: RecentDrug[] = Array.from({ length: 10 }, (_, idx) => ({
      code: `REC-${idx + 1}`,
      name: `最近選んだ薬品${idx + 1}`
    }));

    const recentsOnlyHtml = renderPrescribedDrugInput({
      hooks: {
        recentDrugs,
        showRecents: true,
        showDropdown: false,
        suggestions: []
      }
    });

    const recentsUl = findOpeningTag(recentsOnlyHtml, 'recent-dropdown', 'ul');
    assert.match(recentsUl, /\bdrug-dropdown\b/);
    assert.match(recentsUl, /\brecent-dropdown\b/);
    assert.match(recentsUl, /\baria-label="最近選んだ薬品"/);
    assert.ok(recentsOnlyHtml.includes('<li class="dropdown-heading" aria-hidden="true">最近選んだ薬品</li>'));
    for (let i = 1; i <= 8; i++) {
      assert.ok(
        recentsOnlyHtml.includes(`<span class="drug-suggestion-name">最近選んだ薬品${i}</span>`),
        `最近選んだ薬品${i} は 8 件上限内で表示されるべき`
      );
    }
    assert.ok(!recentsOnlyHtml.includes('最近選んだ薬品9'));
    assert.ok(!recentsOnlyHtml.includes('最近選んだ薬品10'));
    assert.ok(!recentsOnlyHtml.includes('prescribed-dropdown'));

    const bothActiveHtml = renderPrescribedDrugInput({
      hooks: {
        recentDrugs: recentDrugs.slice(0, 2),
        showRecents: true,
        showDropdown: true,
        suggestions: [makeDrugRecord({ code: '620000999', yjCode: '2149040F1027', name: '優先サジェスト薬' })]
      }
    });

    assert.ok(bothActiveHtml.includes('prescribed-dropdown'));
    assert.ok(!bothActiveHtml.includes('recent-dropdown'));
    assert.ok(!bothActiveHtml.includes('最近選んだ薬品'));
  });

  test('renders suggestion dropdown with formatted names, YJ-code priority and fallback, stock dots, and focused indices', () => {
    const suggestions: DrugMasterRecord[] = [
      makeDrugRecord({
        code: '620000301',
        yjCode: '2239001S1020',
        name: '薬品名: ロサルタンK錠50mg「A」 （一般名: ロサルタンカリウム）',
        stockQuantity: 18
      }),
      makeDrugRecord({
        code: '620000302',
        yjCode: '',
        name: 'ロサルタンK錠50mg「後発B」',
        stockQuantity: 0
      })
    ];

    const itemFocusedHtml = renderPrescribedDrugInput({
      prescription: { drugName: 'ロサル' },
      hooks: {
        suggestions,
        showDropdown: true,
        focusedIndex: 1
      }
    });

    assert.ok(itemFocusedHtml.includes('<ul class="drug-dropdown prescribed-dropdown">'));

    const firstLi = findOpeningTag(itemFocusedHtml, '2239001S1020', 'li');
    assert.doesNotMatch(firstLi, /\bfocused\b/);
    assert.ok(itemFocusedHtml.includes('<span class="drug-suggestion-name">ロサルタンK錠50mg「A」</span>'));
    assert.ok(!itemFocusedHtml.includes('薬品名:'));
    assert.ok(!itemFocusedHtml.includes('一般名:'));
    assert.ok(itemFocusedHtml.includes('2239001S1020'));
    assert.ok(!itemFocusedHtml.includes('620000301'));

    const firstDot = findOpeningTag(itemFocusedHtml, 'title="在庫 18"', 'span');
    assert.match(firstDot, /\bstock-mini-dot\b/);
    assert.match(firstDot, /\bin-stock\b/);
    assert.doesNotMatch(firstDot, /\bout-of-stock\b/);
    assert.match(firstDot, /\baria-label="在庫 18"/);
    assert.ok(itemFocusedHtml.includes('在庫 18'));

    const secondLi = findOpeningTag(itemFocusedHtml, '620000302', 'li');
    assert.match(secondLi, /\bclass="focused"/);
    assert.ok(itemFocusedHtml.includes('<span class="drug-suggestion-name">ロサルタンK錠50mg「後発B」</span>'));
    assert.ok(itemFocusedHtml.includes('620000302'));

    const secondDot = findOpeningTag(itemFocusedHtml, 'title="在庫なし"', 'span');
    assert.match(secondDot, /\bstock-mini-dot\b/);
    assert.match(secondDot, /\bout-of-stock\b/);
    assert.doesNotMatch(secondDot, /\bin-stock\b/);
    assert.match(secondDot, /\baria-label="在庫なし"/);
    assert.ok(itemFocusedHtml.includes('在庫なし'));

    const searchUnfocused = findOpeningTag(itemFocusedHtml, '>詳細検索を開く</li>', 'li');
    assert.match(searchUnfocused, /\bsearch-more\b/);
    assert.doesNotMatch(searchUnfocused, /\bfocused\b/);

    const searchFocusedHtml = renderPrescribedDrugInput({
      prescription: { drugName: 'ロサル' },
      hooks: {
        suggestions,
        showDropdown: true,
        focusedIndex: 2
      }
    });
    const searchFocused = findOpeningTag(searchFocusedHtml, '>詳細検索を開く</li>', 'li');
    assert.match(searchFocused, /\bsearch-more\b/);
    assert.match(searchFocused, /\bfocused\b/);
  });
});
