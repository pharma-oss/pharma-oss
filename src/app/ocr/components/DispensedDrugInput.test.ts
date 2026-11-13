import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DatabaseContext } from '@/db/DatabaseContext';
import type { DrugMasterRecord } from '@/lib/master-data/drug_master';
import { findOpeningTag, stripStyleBlocks } from '@/lib/test_support/html_disabled_tags';
import {
  DISPENSED_DRUG_CANDIDATES_FETCH_ERROR_MESSAGE,
  NO_SUBSTITUTION_LABEL,
  getDispensedDrugCandidateViewState
} from '../helpers';
import type { Prescription } from '../types';
import { DispensedDrugInput } from './DispensedDrugInput';

test('getDispensedDrugCandidateViewState returns error status and error message when fetch error occurs with 0 candidates', () => {
  const state = getDispensedDrugCandidateViewState({
    candidateCount: 0,
    hasFetchError: true
  });

  assert.equal(state.status, 'error');
  assert.equal(state.hasError, true);
  assert.equal(
    state.errorMessage,
    '調剤薬品の候補を取得できませんでした。薬品検索を開くから選んでください。'
  );
  assert.equal(state.candidateCount, 0);
});

test('getDispensedDrugCandidateViewState prioritizes error when hasFetchError is true even if candidateCount is positive', () => {
  const state = getDispensedDrugCandidateViewState({
    candidateCount: 4,
    hasFetchError: true
  });

  assert.equal(state.status, 'error', '取得失敗時は前の候補を見せずエラー状態を最優先すること');
  assert.equal(state.hasError, true);
  assert.equal(
    state.errorMessage,
    '調剤薬品の候補を取得できませんでした。薬品検索を開くから選んでください。'
  );
  assert.equal(state.candidateCount, 0);
});

test('getDispensedDrugCandidateViewState returns candidates status when candidates exist without error', () => {
  const state = getDispensedDrugCandidateViewState({
    candidateCount: 3,
    hasFetchError: false
  });

  assert.equal(state.status, 'candidates');
  assert.equal(state.hasError, false);
  assert.equal(state.errorMessage, null);
  assert.equal(state.candidateCount, 3);
});

test('getDispensedDrugCandidateViewState returns empty status when candidates count is zero without error', () => {
  const state = getDispensedDrugCandidateViewState({
    candidateCount: 0,
    hasFetchError: false
  });

  assert.equal(state.status, 'empty');
  assert.equal(state.hasError, false);
  assert.equal(state.errorMessage, null);
  assert.equal(state.candidateCount, 0);
});

type ReactUseStateHook = (initialState: unknown) => [unknown, (next: unknown) => void];

interface ReactInternalsWithDispatcher {
  H?: {
    useState?: ReactUseStateHook;
  };
}

interface DispensedDrugInputHookOverrides {
  candidates?: DrugMasterRecord[];
  hasFetchError?: boolean;
  showDropdown?: boolean;
  focusedIndex?: number;
}

const basePrescription: Prescription = {
  id: 'rx-1',
  rpId: 'rp-1',
  drugCode: '610406001ZZZ',
  drugName: '【般】アムロジピン錠５ｍｇ',
  dispensedDrug: '選択済み調剤薬品',
  changeReason: '',
  amount: '1',
  usage: '1日1回朝食後',
  days: '14'
};

function makeCandidate(
  overrides: Partial<DrugMasterRecord> & Pick<DrugMasterRecord, 'code' | 'name'>
): DrugMasterRecord {
  return {
    isGeneric: true,
    searchNameLower: overrides.name.toLowerCase(),
    searchGenericLower: (overrides.genericName ?? '').toLowerCase(),
    ...overrides
  };
}

function renderDispensedDrugInput(
  options: {
    prescription?: Partial<Prescription>;
    index?: number;
    hooks?: DispensedDrugInputHookOverrides;
  } = {}
): string {
  const prescription: Prescription = {
    ...basePrescription,
    ...options.prescription
  };
  const hooks = options.hooks ?? {};

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
        assert.ok(
          Array.isArray(initialState) && initialState.length === 0,
          'Hook #0 (candidates) must initialize as empty array'
        );
        if (hooks.candidates !== undefined) return [hooks.candidates, () => {}];
      }
      if (idx === 1) {
        assert.equal(initialState, false, 'Hook #1 (hasFetchError) must initialize as false');
        if (hooks.hasFetchError !== undefined) return [hooks.hasFetchError, () => {}];
      }
      if (idx === 2) {
        assert.equal(initialState, false, 'Hook #2 (showDropdown) must initialize as false');
        if (hooks.showDropdown !== undefined) return [hooks.showDropdown, () => {}];
      }
      if (idx === 3) {
        assert.equal(initialState, -1, 'Hook #3 (focusedIndex) must initialize as -1');
        dispatcher.useState = origUseState;
        if (hooks.focusedIndex !== undefined) return [hooks.focusedIndex, () => {}];
      }
      return origUseState(initialState);
    };

    return React.createElement(DispensedDrugInput, {
      prescription,
      index: options.index ?? 0,
      onChange: () => {},
      onOpenDrugSearch: () => {}
    });
  }

  let html: string;
  try {
    html = renderToStaticMarkup(
      React.createElement(
        DatabaseContext.Provider,
        { value: null },
        React.createElement(Wrapper)
      )
    );
  } finally {
    if (capturedDispatcher && capturedOrigUseState) {
      capturedDispatcher.useState = capturedOrigUseState;
    }
  }

  assert.equal(callCount, 4, 'DispensedDrugInput must call useState exactly 4 times');
  return stripStyleBlocks(html);
}

describe('DispensedDrugInput SSR UI rendering', () => {
  test('renders closed readOnly input with 1-based aria-label and current dispensedDrug without dropdown', () => {
    const html = renderDispensedDrugInput({
      index: 2,
      prescription: { dispensedDrug: 'アムロジピン錠５ｍｇ「サワイ」' }
    });

    const inputTag = findOpeningTag(html, 'aria-label="調剤薬品名 3"', 'input');
    assert.match(inputTag, /\btype="text"/);
    assert.match(inputTag, /\breadOnly=""/);
    assert.match(inputTag, /\bclass="dispensed-drug-name"/);
    assert.match(inputTag, /\bplaceholder="タップして選択（先発・後発の変更）"/);
    assert.match(inputTag, /\bvalue="アムロジピン錠５ｍｇ「サワイ」"/);

    assert.ok(!html.includes('drug-dropdown'));
    assert.ok(!html.includes(NO_SUBSTITUTION_LABEL));
    assert.ok(!html.includes('薬品検索を開く'));
  });

  test('renders focused no-substitution option, fetch error alert, and unfocused search-more when hasFetchError is true', () => {
    const html = renderDispensedDrugInput({
      hooks: {
        candidates: [],
        hasFetchError: true,
        showDropdown: true,
        focusedIndex: 0
      }
    });

    assert.ok(html.includes('<ul class="drug-dropdown">'));

    const noSubLi = findOpeningTag(html, NO_SUBSTITUTION_LABEL, 'li');
    assert.match(noSubLi, /\bno-substitution-option\b/);
    assert.match(noSubLi, /\bfocused\b/);

    const errorLi = findOpeningTag(html, 'dispensed-candidates-error', 'li');
    assert.match(errorLi, /\bdispensed-candidates-error\b/);
    assert.match(errorLi, /\brole="alert"/);
    assert.ok(html.includes(DISPENSED_DRUG_CANDIDATES_FETCH_ERROR_MESSAGE));

    const searchMoreLi = findOpeningTag(html, '>薬品検索を開く</li>', 'li');
    assert.match(searchMoreLi, /\bsearch-more\b/);
    assert.doesNotMatch(searchMoreLi, /\bfocused\b/);
  });

  test('hides error alert and focuses trailing search-more when candidates are empty without fetch error', () => {
    const html = renderDispensedDrugInput({
      hooks: {
        candidates: [],
        hasFetchError: false,
        showDropdown: true,
        focusedIndex: 1
      }
    });

    assert.ok(!html.includes('dispensed-candidates-error'));
    assert.ok(!html.includes('role="alert"'));

    const noSubLi = findOpeningTag(html, NO_SUBSTITUTION_LABEL, 'li');
    assert.match(noSubLi, /\bno-substitution-option\b/);
    assert.doesNotMatch(noSubLi, /\bfocused\b/);

    const searchMoreLi = findOpeningTag(html, '>薬品検索を開く</li>', 'li');
    assert.match(searchMoreLi, /\bsearch-more\b/);
    assert.match(searchMoreLi, /\bfocused\b/);
  });

  test('renders formatted candidate names, YJ-code precedence with code fallback, stock dot status, and focus classes', () => {
    const candidates: DrugMasterRecord[] = [
      makeCandidate({
        code: '620000101',
        yjCode: '2149040F1027',
        name: '薬品名: アムロジピン錠5mg「サワイ」 （一般名: アムロジピンベシル酸塩）',
        stockQuantity: 25
      }),
      makeCandidate({
        code: '620000202',
        yjCode: '',
        name: 'アムロジピン錠5mg「テスト後発」',
        stockQuantity: 0
      })
    ];

    const candidateFocusedHtml = renderDispensedDrugInput({
      prescription: { dispensedDrug: '別の入力中表示名' },
      hooks: {
        candidates,
        hasFetchError: false,
        showDropdown: true,
        focusedIndex: 2
      }
    });

    const firstLi = findOpeningTag(candidateFocusedHtml, '2149040F1027', 'li');
    assert.match(firstLi, /\bdispensed-candidate\b/);
    assert.doesNotMatch(firstLi, /\bfocused\b/);
    assert.doesNotMatch(firstLi, /\bout-of-stock\b/);
    assert.ok(candidateFocusedHtml.includes('<span class="candidate-name">アムロジピン錠5mg「サワイ」</span>'));
    assert.ok(!candidateFocusedHtml.includes('薬品名:'));
    assert.ok(!candidateFocusedHtml.includes('一般名:'));
    assert.ok(candidateFocusedHtml.includes('2149040F1027'));
    assert.ok(!candidateFocusedHtml.includes('620000101'));

    const firstDot = findOpeningTag(candidateFocusedHtml, 'title="在庫 25"', 'span');
    assert.match(firstDot, /\bstock-mini-dot\b/);
    assert.match(firstDot, /\bin-stock\b/);
    assert.doesNotMatch(firstDot, /\bout-of-stock\b/);
    assert.match(firstDot, /\btitle="在庫 25"/);
    assert.match(firstDot, /\baria-label="在庫 25"/);
    assert.ok(candidateFocusedHtml.includes('在庫 25'));

    const secondLi = findOpeningTag(candidateFocusedHtml, '620000202', 'li');
    assert.match(secondLi, /\bdispensed-candidate\b/);
    assert.match(secondLi, /\bfocused\b/);
    assert.match(secondLi, /\bout-of-stock\b/);
    assert.ok(candidateFocusedHtml.includes('<span class="candidate-name">アムロジピン錠5mg「テスト後発」</span>'));
    assert.ok(candidateFocusedHtml.includes('620000202'));

    const secondDot = findOpeningTag(candidateFocusedHtml, 'title="在庫なし"', 'span');
    assert.match(secondDot, /\bstock-mini-dot\b/);
    assert.match(secondDot, /\bout-of-stock\b/);
    assert.doesNotMatch(secondDot, /\bin-stock\b/);
    assert.match(secondDot, /\btitle="在庫なし"/);
    assert.match(secondDot, /\baria-label="在庫なし"/);
    assert.ok(candidateFocusedHtml.includes('在庫なし'));

    const searchUnfocused = findOpeningTag(candidateFocusedHtml, '>薬品検索を開く</li>', 'li');
    assert.doesNotMatch(searchUnfocused, /\bfocused\b/);

    const searchFocusedHtml = renderDispensedDrugInput({
      prescription: { dispensedDrug: '別の入力中表示名' },
      hooks: {
        candidates,
        hasFetchError: false,
        showDropdown: true,
        focusedIndex: 3
      }
    });
    const searchFocused = findOpeningTag(searchFocusedHtml, '>薬品検索を開く</li>', 'li');
    assert.match(searchFocused, /\bsearch-more\b/);
    assert.match(searchFocused, /\bfocused\b/);
  });
});
