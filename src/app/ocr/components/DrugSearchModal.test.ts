import { test } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { DatabaseContext } from '@/db/DatabaseContext';
import {
  renderWithReactUseStateMock,
  type UseStateOverrideSpec
} from '@/lib/test_support/react_use_state_mock';
import { type DrugMasterRecord } from '@/lib/master-data/drug_master';
import DrugSearchModal, { calculateFilteredDrugs } from './DrugSearchModal';

const mockDrugs: DrugMasterRecord[] = [
  {
    code: 'GEN001',
    yjCode: '2171022F1000',
    name: '【般】アムロジピン錠５ｍｇ',
    genericName: 'アムロジピンベシル酸塩',
    price: 0,
    isGeneric: false,
    isAbolished: false,
    searchNameLower: '【般】アムロジピン錠５ｍｇ',
    searchGenericLower: 'アムロジピンベシル酸塩'
  },
  {
    code: 'BRAND001',
    yjCode: '2171022F1022',
    name: 'ノルバスク錠５ｍｇ',
    genericName: 'アムロジピンベシル酸塩',
    price: 35.5,
    isGeneric: false,
    isAbolished: false,
    searchNameLower: 'ノルバスク錠５ｍｇ',
    searchGenericLower: 'アムロジピンベシル酸塩'
  },
  {
    code: 'GENERIC001',
    yjCode: '2171022F1103',
    name: 'アムロジピン錠５ｍｇ「サワイ」',
    genericName: 'アムロジピンベシル酸塩',
    price: 10.1,
    isGeneric: true,
    isAbolished: false,
    searchNameLower: 'アムロジピン錠５ｍｇ「サワイ」',
    searchGenericLower: 'アムロジピンベシル酸塩'
  },
  {
    code: 'GENERIC002',
    yjCode: '2171022F1111',
    name: 'アムロジピン錠５ｍｇ「日医工」',
    genericName: 'アムロジピンベシル酸塩',
    price: 9.8,
    isGeneric: true,
    isAbolished: false,
    searchNameLower: 'アムロジピン錠５ｍｇ「日医工」',
    searchGenericLower: 'アムロジピンベシル酸塩'
  }
];

test('calculateFilteredDrugs in prescribed mode includes general name placeholder drugs for prescription entry', () => {
  const results = calculateFilteredDrugs({
    query: 'アムロジピン',
    mode: 'prescribed',
    showAllCandidates: true,
    allDrugs: mockDrugs,
    workerSearchResults: []
  });

  assert.strictEqual(results.length, 4);
  assert.ok(results.some((d: DrugMasterRecord) => d.code === 'GEN001'), 'General name placeholder should be included in prescribed mode');
  assert.ok(results.some((d: DrugMasterRecord) => d.code === 'BRAND001'));
  assert.ok(results.some((d: DrugMasterRecord) => d.code === 'GENERIC001'));
});

test('calculateFilteredDrugs in dispensed mode excludes general name placeholders from dispensing candidates', () => {
  const results = calculateFilteredDrugs({
    query: 'アムロジピン',
    mode: 'dispensed',
    showAllCandidates: true,
    allDrugs: mockDrugs,
    workerSearchResults: []
  });

  assert.strictEqual(results.length, 3);
  assert.ok(!results.some((d: DrugMasterRecord) => d.code === 'GEN001'), 'General name placeholder must be excluded from dispensing selection');
  assert.ok(results.some((d: DrugMasterRecord) => d.code === 'BRAND001'));
  assert.ok(results.some((d: DrugMasterRecord) => d.code === 'GENERIC001'));
  assert.ok(results.some((d: DrugMasterRecord) => d.code === 'GENERIC002'));
});

test('calculateFilteredDrugs preserves direct query matches even when worker search is empty', () => {
  const results = calculateFilteredDrugs({
    query: 'ノルバスク',
    mode: 'prescribed',
    showAllCandidates: false,
    allDrugs: mockDrugs,
    workerSearchResults: []
  });

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].code, 'BRAND001');
  assert.ok(results.some((d: DrugMasterRecord) => d.code === 'BRAND001'));
});

function renderDrugSearchModal(
  props: {
    isOpen: boolean;
    mode?: 'prescribed' | 'dispensed';
    initialQuery?: string;
    prescribedDrugCode?: string;
  },
  overrides: Record<number, UseStateOverrideSpec> = {}
) {
  return renderWithReactUseStateMock(
    () =>
      React.createElement(
        DatabaseContext.Provider,
        { value: null },
        React.createElement(DrugSearchModal, {
          isOpen: props.isOpen,
          mode: props.mode ?? 'dispensed',
          initialQuery: props.initialQuery ?? '',
          prescribedDrugCode: props.prescribedDrugCode,
          onClose: () => { },
          onSelect: () => { }
        })
      ),
    {
      componentName: 'DrugSearchModal',
      restoreAtCallIndex: 9,
      expectedCalls: 10,
      overrides: {
        0: { assertInitial: (v) => assert.strictEqual(v, props.initialQuery ?? '') },
        1: { assertInitial: (v) => assert.strictEqual(v, true) },
        2: { assertInitial: (v) => assert.strictEqual(v, null) },
        3: { assertInitial: (v) => assert.strictEqual(v, '') },
        4: { assertInitial: (v) => assert.ok(Array.isArray(v) && v.length === 0) },
        5: { assertInitial: (v) => assert.ok(v instanceof Map && v.size === 0) },
        6: { assertInitial: (v) => assert.strictEqual(v, false) },
        ...overrides
      }
    }
  );
}

test('DrugSearchModal returns empty markup when closed', () => {
  const { html, callCount } = renderDrugSearchModal({ isOpen: false });
  assert.strictEqual(html, '');
  assert.strictEqual(callCount, 10);
});

test('DrugSearchModal in prescribed mode renders prescribed header, hides dispensed filter checkbox, and shows loading state', () => {
  const { html } = renderDrugSearchModal(
    { isOpen: true, mode: 'prescribed' },
    { 6: { value: true } }
  );

  assert.ok(html.includes('処方薬品検索'));
  assert.ok(!html.includes('商品名・先発/後発を含めて探す'));
  assert.ok(html.includes('データを読み込み中...'));
  assert.match(html, /<button\b[^>]*class="btn-primary"[^>]*\sdisabled=""(?=[\s/>]|$)/);
});

test('DrugSearchModal in dispensed mode renders candidates without general placeholder and requires changeReason for out-of-rule selection', () => {
  const { html: blockedHtml } = renderDrugSearchModal(
    {
      isOpen: true,
      mode: 'dispensed',
      initialQuery: 'アムロジピン',
      prescribedDrugCode: '2149040F1000'
    },
    {
      0: { value: 'アムロジピン' },
      2: { value: mockDrugs[1] }, // YJ 2171022F1022 vs prescribed 2149040F1000 -> out of rule
      3: { value: '' },
      4: { value: mockDrugs }
    }
  );

  assert.ok(blockedHtml.includes('調剤薬品検索'));
  assert.ok(blockedHtml.includes('商品名・先発/後発を含めて探す'));
  assert.ok(blockedHtml.includes('ノルバスク錠5mg') || blockedHtml.includes('ノルバスク錠'));
  assert.ok(!blockedHtml.includes('【般】アムロジピン'));
  assert.ok(blockedHtml.includes('変更理由（ルール外の変更のため入力が必要です）'));
  assert.ok(blockedHtml.includes('data-disabled="true"'));
  assert.match(blockedHtml, /<button\b[^>]*class="btn-primary"[^>]*\sdisabled=""(?=[\s/>]|$)/);

  const { html: enabledHtml } = renderDrugSearchModal(
    {
      isOpen: true,
      mode: 'dispensed',
      initialQuery: 'アムロジピン',
      prescribedDrugCode: '2149040F1000'
    },
    {
      0: { value: 'アムロジピン' },
      2: { value: mockDrugs[1] },
      3: { value: '処方医確認済みのため変更' },
      4: { value: mockDrugs }
    }
  );

  assert.ok(enabledHtml.includes('data-disabled="false"'));
  assert.doesNotMatch(
    enabledHtml,
    /<button\b[^>]*class="btn-primary"[^>]*\sdisabled=""(?=[\s/>]|$)/
  );
});
