import { test } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { findOpeningTag, listDisabledOpeningTags } from '@/lib/test_support/html_disabled_tags';
import {
  OrderWorkbench,
  type OrderWorkbenchProps,
  type OrderWorkbenchCandidate
} from './components/OrderWorkbench';
import { type ReceivingDraft } from './types';

const noop = () => {};

function createCandidate(overrides: Partial<OrderWorkbenchCandidate> = {}): OrderWorkbenchCandidate {
  return {
    drugId: 'drug-1',
    drugName: 'アモキシシリンカプセル250mg',
    location: 'A-01',
    supplierName: '東邦薬品',
    requiredAmount: 100,
    availableAmount: 20,
    shortageAmount: 80,
    recommendedOrderAmount: 100,
    affectedVisitCount: 3,
    priority: 'high',
    actionLabel: '要発注',
    ...overrides
  };
}

function createDefaultProps(overrides: Partial<OrderWorkbenchProps> = {}): OrderWorkbenchProps {
  return {
    candidates: [],
    orderedDrugIds: new Set(),
    hasRestoreError: false,
    receivingDrafts: {},
    receivingDrugId: '',
    onRequestTransfer: noop,
    onToggleOrdered: noop,
    onUpdateReceivingDraft: noop,
    onRegisterReceivedStock: noop,
    onExportCsv: noop,
    onCopyMemo: noop,
    onExportReceivingChecklist: noop,
    onCopyReceivingMemo: noop,
    onClearOrdered: noop,
    ...overrides
  };
}

test('OrderWorkbench exports as callable React component', () => {
  assert.ok(OrderWorkbench, 'OrderWorkbench should be exported');
  assert.strictEqual(typeof OrderWorkbench, 'function', 'OrderWorkbench should be a function component');
});

test('OrderWorkbench action controls disabled state when candidates is empty', () => {
  const props = createDefaultProps({
    candidates: [],
    orderedDrugIds: new Set()
  });

  const html = renderToStaticMarkup(React.createElement(OrderWorkbench, props));

  // 候補0件のときは、未対応メモ・CSV・入庫メモ・入庫確認CSVの4ボタンすべてが無効化されること
  const disabledTags = listDisabledOpeningTags(html);
  assert.strictEqual(
    disabledTags.length,
    4,
    `When candidates are empty, exactly 4 header action buttons must be disabled:\n${disabledTags.join('\n')}`
  );

  const copyMemoTag = findOpeningTag(html, '未対応メモ', 'button');
  assert.match(copyMemoTag, /\sdisabled=""/, '未対応メモボタンが無効化されていること');

  const exportCsvTag = findOpeningTag(html, '<span>CSV</span>', 'button');
  assert.match(exportCsvTag, /\sdisabled=""/, '未対応CSVボタンが無効化されていること');

  const copyReceivingMemoTag = findOpeningTag(html, '入庫メモ', 'button');
  assert.match(copyReceivingMemoTag, /\sdisabled=""/, '入庫メモボタンが無効化されていること');

  const exportReceivingCsvTag = findOpeningTag(html, '入庫確認CSV', 'button');
  assert.match(exportReceivingCsvTag, /\sdisabled=""/, '入庫確認CSVボタンが無効化されていること');

  assert.strictEqual(html.includes('現在、該当する発注候補はありません。'), true, '空の案内メッセージが表示されること');
});

test('OrderWorkbench action controls disabled state when open candidates exist but ordered is empty', () => {
  const candidate1 = createCandidate({ drugId: 'drug-1', drugName: 'アモキシシリンカプセル250mg' });
  const props = createDefaultProps({
    candidates: [candidate1],
    orderedDrugIds: new Set() // 未対応のみ、発注済み0件 (openCount=1, orderedCount=0, canExport=true)
  });

  const html = renderToStaticMarkup(React.createElement(OrderWorkbench, props));

  // 未対応あり・発注済み0件のときは、入庫メモ・入庫確認CSVの2ボタンのみが無効化されること
  const disabledTags = listDisabledOpeningTags(html);
  assert.strictEqual(
    disabledTags.length,
    2,
    `When open candidates exist and orderedCount is 0, exactly 2 buttons (receiving memos) must be disabled:\n${disabledTags.join('\n')}`
  );

  // 未対応エクスポートボタンは有効
  const copyMemoTag = findOpeningTag(html, '未対応メモ', 'button');
  assert.doesNotMatch(copyMemoTag, /\sdisabled=""/, '未対応メモボタンが有効であること');

  const exportCsvTag = findOpeningTag(html, '<span>CSV</span>', 'button');
  assert.doesNotMatch(exportCsvTag, /\sdisabled=""/, '未対応CSVボタンが有効であること');

  // 入庫エクスポートボタンは無効
  const copyReceivingMemoTag = findOpeningTag(html, '入庫メモ', 'button');
  assert.match(copyReceivingMemoTag, /\sdisabled=""/, '入庫メモボタンが無効化されていること');

  const exportReceivingCsvTag = findOpeningTag(html, '入庫確認CSV', 'button');
  assert.match(exportReceivingCsvTag, /\sdisabled=""/, '入庫確認CSVボタンが無効化されていること');
});

test('OrderWorkbench action controls disabled state when all candidates are ordered and receivingDrugId toggles', () => {
  const candidate1 = createCandidate({ drugId: 'drug-1', drugName: 'アモキシシリンカプセル250mg' });
  const baseDraft: ReceivingDraft = {
    quantity: '100',
    lotNumber: 'LOT-123',
    expirationDate: '2027-12-31',
    arrivalDate: '2026-11-13',
    supplierName: '東邦薬品'
  };

  // 1. receivingDrugId なし（通常の発注済み表示）
  const propsNotReceiving = createDefaultProps({
    candidates: [candidate1],
    orderedDrugIds: new Set(['drug-1']), // 全件発注済み (openCount=0, orderedCount=1, canExport=false)
    receivingDrafts: { 'drug-1': baseDraft },
    receivingDrugId: ''
  });

  const htmlNotReceiving = renderToStaticMarkup(React.createElement(OrderWorkbench, propsNotReceiving));

  // 未対応0件のため未対応エクスポート2件が無効、入庫登録ボタンは有効（計2件disabled）
  const disabledTagsNotReceiving = listDisabledOpeningTags(htmlNotReceiving);
  assert.strictEqual(
    disabledTagsNotReceiving.length,
    2,
    `When all candidates are ordered and not receiving, exactly 2 export buttons must be disabled:\n${disabledTagsNotReceiving.join('\n')}`
  );

  const copyMemoTag = findOpeningTag(htmlNotReceiving, '未対応メモ', 'button');
  assert.match(copyMemoTag, /\sdisabled=""/, '未対応メモボタンが無効化されていること');

  const exportCsvTag = findOpeningTag(htmlNotReceiving, '<span>CSV</span>', 'button');
  assert.match(exportCsvTag, /\sdisabled=""/, '未対応CSVボタンが無効化されていること');

  const copyReceivingMemoTag = findOpeningTag(htmlNotReceiving, '入庫メモ', 'button');
  assert.doesNotMatch(copyReceivingMemoTag, /\sdisabled=""/, '入庫メモボタンが有効であること');

  const exportReceivingCsvTag = findOpeningTag(htmlNotReceiving, '入庫確認CSV', 'button');
  assert.doesNotMatch(exportReceivingCsvTag, /\sdisabled=""/, '入庫確認CSVボタンが有効であること');

  // 発注済みカード内の入庫登録ボタンは有効
  const registerBtnTagNotReceiving = findOpeningTag(htmlNotReceiving, '入庫登録', 'button');
  assert.doesNotMatch(registerBtnTagNotReceiving, /\sdisabled=""/, '入庫登録ボタンが有効であること');
  assert.strictEqual(htmlNotReceiving.includes('<span>入庫登録</span>'), true, 'ボタン文言が「入庫登録」であること');

  // 2. receivingDrugId === 'drug-1'（入庫登録実行中）
  const propsReceiving = createDefaultProps({
    candidates: [candidate1],
    orderedDrugIds: new Set(['drug-1']),
    receivingDrafts: { 'drug-1': baseDraft },
    receivingDrugId: 'drug-1'
  });

  const htmlReceiving = renderToStaticMarkup(React.createElement(OrderWorkbench, propsReceiving));

  // 未対応エクスポート2件に加え、入庫登録ボタンも無効化（計3件disabled）
  const disabledTagsReceiving = listDisabledOpeningTags(htmlReceiving);
  assert.strictEqual(
    disabledTagsReceiving.length,
    3,
    `When candidate is receiving, exactly 3 buttons (unhandled exports and receiving-submit) must be disabled:\n${disabledTagsReceiving.join('\n')}`
  );

  const registerBtnTagReceiving = findOpeningTag(htmlReceiving, '登録中...', 'button');
  assert.match(registerBtnTagReceiving, /\sdisabled=""/, '入庫登録処理中は入庫登録ボタンが無効化されていること');
  assert.strictEqual(htmlReceiving.includes('<span>登録中...</span>'), true, '処理中のボタン文言が「登録中...」であること');
});

test('OrderWorkbench action controls enabled state when mixed open and ordered candidates exist', () => {
  const candidate1 = createCandidate({ drugId: 'drug-1', drugName: 'アモキシシリンカプセル250mg' });
  const candidate2 = createCandidate({ drugId: 'drug-2', drugName: 'カロナール錠200' });

  const props = createDefaultProps({
    candidates: [candidate1, candidate2],
    orderedDrugIds: new Set(['drug-2']), // candidate1は未対応、candidate2は発注済み (openCount=1, orderedCount=1, canExport=true)
    receivingDrugId: ''
  });

  const html = renderToStaticMarkup(React.createElement(OrderWorkbench, props));

  // 未対応候補も発注済み候補も存在し、登録処理中でもない場合、disabled なコントロールは 0 個
  const disabledTags = listDisabledOpeningTags(html);
  assert.strictEqual(
    disabledTags.length,
    0,
    `When open and ordered candidates coexist without receiving in-flight, 0 controls must be disabled:\n${disabledTags.join('\n')}`
  );

  const copyMemoTag = findOpeningTag(html, '未対応メモ', 'button');
  assert.doesNotMatch(copyMemoTag, /\sdisabled=""/, '未対応メモボタンが有効であること');

  const exportCsvTag = findOpeningTag(html, '<span>CSV</span>', 'button');
  assert.doesNotMatch(exportCsvTag, /\sdisabled=""/, '未対応CSVボタンが有効であること');

  const copyReceivingMemoTag = findOpeningTag(html, '入庫メモ', 'button');
  assert.doesNotMatch(copyReceivingMemoTag, /\sdisabled=""/, '入庫メモボタンが有効であること');

  const exportReceivingCsvTag = findOpeningTag(html, '入庫確認CSV', 'button');
  assert.doesNotMatch(exportReceivingCsvTag, /\sdisabled=""/, '入庫確認CSVボタンが有効であること');

  const registerBtnTag = findOpeningTag(html, '入庫登録', 'button');
  assert.doesNotMatch(registerBtnTag, /\sdisabled=""/, '発注済み薬品の入庫登録ボタンが有効であること');
});

