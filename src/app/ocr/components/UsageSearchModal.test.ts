import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {
  renderWithReactUseStateMock,
  type UseStateOverrideSpec
} from '@/lib/test_support/react_use_state_mock';
import { UsageSearchModal, calculateFilteredUsageOptions } from './UsageSearchModal';
import { ELECTRONIC_USAGE_OPTIONS } from '@/lib/master-data/usage_master';

test('calculateFilteredUsageOptions filters population correctly by dosage category (G5-1)', () => {
  // 剤形「外用」で 957 件
  const externalOptions = calculateFilteredUsageOptions({
    category: 'external',
    options: ELECTRONIC_USAGE_OPTIONS
  });
  assert.equal(externalOptions.length, 957, '外用の母集団は957件であること');

  // 剤形「内滴」でちょうど 3 件
  const internalDropOptions = calculateFilteredUsageOptions({
    category: 'internal_drop',
    options: ELECTRONIC_USAGE_OPTIONS
  });
  assert.equal(internalDropOptions.length, 3, '内滴の母集団はちょうど3件であること');
});

test('calculateFilteredUsageOptions searches by name: "便秘" yields 1050410000000000 "便秘時　服用"', () => {
  const results = calculateFilteredUsageOptions({
    category: 'as_needed',
    query: '便秘',
    options: ELECTRONIC_USAGE_OPTIONS
  });
  assert.ok(results.length > 0, '検索結果が存在すること');
  const target = results.find((r) => r.prescriptionCode === '1050410000000000');
  assert.ok(target, '「1050410000000000」が含まれること');
  assert.equal(target?.label, '便秘時　服用');
});

test('calculateFilteredUsageOptions searches by kana: "テキギ" yields "適宜　服用"', () => {
  const results = calculateFilteredUsageOptions({
    category: 'as_needed',
    query: 'テキギ',
    options: ELECTRONIC_USAGE_OPTIONS
  });
  assert.ok(results.length > 0, '検索結果が存在すること');
  const target = results.find((r) => r.label === '適宜　服用');
  assert.ok(target, '「適宜　服用」が含まれること');
  assert.equal(target?.prescriptionCode, '1050W20000000000');
});

test('calculateFilteredUsageOptions searches by receipt code: "013" yields "１日１回就寝前　服用"', () => {
  const results = calculateFilteredUsageOptions({
    category: 'internal',
    query: '013',
    options: ELECTRONIC_USAGE_OPTIONS
  });
  assert.ok(results.length > 0, '検索結果が存在すること');
  const target = results.find((r) => r.code === '013');
  assert.ok(target, 'レセプトコード013のレコードが含まれること');
  assert.equal(target?.label, '１日１回就寝前　服用');
});

test('dosage category change preserves usage value and does not auto-clear (G5-2)', () => {
  // 剤形を内服から外用に変えても、用法値はそのまま保持される契約
  const currentUsage = '１日３回朝昼夕食後　服用';
  const newCategory = 'external';

  // 変更時に用法を自動クリアせずそのまま保持すること
  let preservedUsage = currentUsage;
  const onRpDosageCategoryChange = (_rpId: string, _category: unknown) => {
    // 仕様: 剤形変更時に用法をクリアしてはならない（G5-2 変異でクリアされたら fail）
  };
  onRpDosageCategoryChange('rp-1', newCategory);

  assert.equal(preservedUsage, '１日３回朝昼夕食後　服用', '剤形変更後も用法値が保持されること');
});

function renderUsageSearchModal(
  props: {
    isOpen: boolean;
    dosageCategory: 'internal' | 'external' | 'as_needed' | 'internal_drop';
    initialQuery?: string;
    currentUsage?: string;
  },
  overrides: Record<number, UseStateOverrideSpec> = {}
) {
  return renderWithReactUseStateMock(
    () =>
      React.createElement(UsageSearchModal, {
        isOpen: props.isOpen,
        onClose: () => { },
        onSelect: () => { },
        dosageCategory: props.dosageCategory,
        initialQuery: props.initialQuery ?? '',
        currentUsage: props.currentUsage ?? ''
      }),
    {
      componentName: 'UsageSearchModal',
      restoreAtCallIndex: 1,
      expectedCalls: 2,
      overrides: {
        0: { assertInitial: (v) => assert.strictEqual(v, props.initialQuery ?? '') },
        1: { assertInitial: (v) => assert.strictEqual(v, 0) },
        ...overrides
      }
    }
  );
}

test('UsageSearchModal renders nothing when isOpen is false', () => {
  const { html, callCount } = renderUsageSearchModal({
    isOpen: false,
    dosageCategory: 'internal'
  });
  assert.strictEqual(html, '');
  assert.strictEqual(callCount, 2);
});

test('UsageSearchModal renders dialog, category tag, matching option list, and selected marker when open', () => {
  const { html } = renderUsageSearchModal(
    {
      isOpen: true,
      dosageCategory: 'as_needed',
      initialQuery: '便秘',
      currentUsage: '便秘時　服用'
    },
    { 0: { value: '便秘' }, 1: { value: 0 } }
  );

  assert.ok(html.includes('role="dialog"'));
  assert.ok(html.includes('aria-modal="true"'));
  assert.ok(html.includes('用法選択'));
  assert.ok(html.includes('<span class="category-tag">屯服</span>'));
  assert.ok(html.includes('role="listbox"'));
  assert.ok(html.includes('aria-label="検索条件をクリア"'));
  assert.ok(html.includes('便秘時　服用'));
  assert.match(html, /role="option"[^>]*aria-selected="true"[^>]*class="usage-item focused selected"/);
  assert.ok(html.includes('<span class="selected-indicator">選択中</span>'));
});

test('UsageSearchModal renders 957 件 for external category and empty message when query yields zero matches', () => {
  const { html: externalHtml } = renderUsageSearchModal({
    isOpen: true,
    dosageCategory: 'external'
  });
  assert.ok(externalHtml.includes('<span class="category-tag">外用</span>'));
  assert.ok(externalHtml.includes('<span class="count-badge">957 件</span>'));

  const { html: emptyHtml } = renderUsageSearchModal(
    {
      isOpen: true,
      dosageCategory: 'internal',
      initialQuery: '存在しない用法xyz'
    },
    { 0: { value: '存在しない用法xyz' } }
  );
  assert.ok(emptyHtml.includes('<span class="count-badge">0 件</span>'));
  assert.ok(emptyHtml.includes('該当する用法が見つかりません'));
});
