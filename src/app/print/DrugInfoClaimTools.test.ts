import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import React from 'react';
import { listDisabledOpeningTags } from '@/lib/test_support/html_disabled_tags';
import { DrugInfoClaimTools } from './components/DrugInfoClaimTools';

test('DrugInfoClaimTools contracts and style encapsulation', () => {
  // 1. コンポーネントが React コンポーネントとして正しくエクスポートされていること
  assert.ok(DrugInfoClaimTools, 'DrugInfoClaimTools should be exported');
  assert.strictEqual(typeof DrugInfoClaimTools, 'object', 'React.memo returns an object component');

  // 2. ソースコードの静的契約検証: DrugInfoPrint からの分離と重複排除
  const drugInfoPrintSource = readFileSync(new URL('./components/DrugInfoPrint.tsx', import.meta.url), 'utf8');
  const claimToolsSource = readFileSync(new URL('./components/DrugInfoClaimTools.tsx', import.meta.url), 'utf8');

  // DrugInfoPrint.tsx は DrugInfoClaimTools を呼び出していること
  assert.match(drugInfoPrintSource, /<DrugInfoClaimTools\b/);

  // 移動対象5セレクタが DrugInfoPrint.tsx から完全に削除（移動）されていること
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-info-claim-tools\s*\{/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-info-claim-row\s*\{/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-info-control-panel\s*\{/);
  assert.doesNotMatch(drugInfoPrintSource, /\.input-agent-group\s*\{/);
  assert.doesNotMatch(drugInfoPrintSource, /\.input-receipt-remark\s*\{/);

  // 3. 移動対象5セレクタが DrugInfoClaimTools.tsx に漏れなく定義されていること
  assert.match(claimToolsSource, /\.drug-info-claim-tools\s*\{/);
  assert.match(claimToolsSource, /\.drug-info-claim-row\s*\{/);
  assert.match(claimToolsSource, /\.drug-info-control-panel\s*\{/);
  assert.match(claimToolsSource, /\.input-agent-group\s*\{/);
  assert.match(claimToolsSource, /\.input-receipt-remark\s*\{/);

  // 4. 定義値の厳格検証 (print.css にない 80px と 120px の維持)
  assert.match(claimToolsSource, /\.input-agent-group\s*\{[^}]*width:\s*80px/);
  assert.match(claimToolsSource, /\.input-receipt-remark\s*\{[^}]*width:\s*120px/);

  // 5. 印刷時非表示（@media print）が含まれていること
  assert.match(claimToolsSource, /@media\s+print\s*\{[^}]*\.no-print\s*\{[^}]*display:\s*none\s*!important/);
});

import { renderToStaticMarkup } from 'react-dom/server';
import type { PrintPrescriptionItem } from './types';

test('DrugInfoClaimTools true HTML rendering and input controls', () => {
  const mockItems: PrintPrescriptionItem[] = [
    {
      itemId: 'claim-tool-item-1',
      visitId: 'visit-1',
      drugId: '620000001',
      dispensedDrugCode: '620000001',
      drugName: 'ワーファリン錠1mg',
      amount: 1,
      days: 28,
      usage: '1日1回夕食後',
      rpNumber: 1,
      dosageCategory: 'internal',
      isHighRisk: true,
      tokkanType: '1',
      isIppoka: true,
      isCrushed: false,
      claimPreparation: true,
      claimManagement: true,
      isDiagnosticTest: false,
      receiptRemark: '抗凝固療法モニタリング中'
    },
    {
      itemId: 'claim-tool-item-2',
      visitId: 'visit-1',
      drugId: '620000002',
      dispensedDrugCode: '620000002',
      drugName: 'ロキソニンテープ50mg',
      amount: 7,
      days: 0,
      usage: '1日1回貼付',
      rpNumber: 2,
      dosageCategory: 'external',
      isHighRisk: false,
      isIppoka: false,
      isCrushed: false,
      claimPreparation: true,
      claimManagement: true,
      isDiagnosticTest: false
    }
  ] as unknown as PrintPrescriptionItem[];

  const noopAsync = async () => {};

  // 1. canEditBilling: true 時の実描画
  const htmlEditable = renderToStaticMarkup(
    React.createElement(DrugInfoClaimTools, {
      prescriptionItems: mockItems,
      canEditBilling: true,
      remarks: { 'claim-tool-item-1': '手動入力レセ適' },
      handleToggleIppoka: noopAsync,
      handleToggleCrushed: noopAsync,
      handleItemClaimToggle: noopAsync,
      handleTokkanChange: noopAsync,
      handleBillingAgentOverrideLocalChange: () => {},
      persistBillingAgentOverride: noopAsync,
      handleReceiptRemarkChange: () => {}
    })
  );

  assert.ok(htmlEditable.includes('drug-info-claim-tools no-print'), 'ツールバーのルートクラスが存在すること');
  assert.ok(htmlEditable.includes('ワーファリン錠1mg'), '第1薬品名が描画されていること');
  assert.ok(htmlEditable.includes('ロキソニンテープ50mg'), '第2薬品名が描画されていること');
  assert.ok(htmlEditable.includes('一包化'), '一包化ラベルが存在すること');
  assert.ok(htmlEditable.includes('粉砕'), '粉砕ラベルが存在すること');
  assert.ok(htmlEditable.includes('調製'), '調製ラベルが存在すること');
  assert.ok(htmlEditable.includes('薬管'), '薬管ラベルが存在すること');
  assert.ok(htmlEditable.includes('検査薬'), '検査薬ラベルが存在すること');
  assert.ok(htmlEditable.includes('加算1 (10点)'), 'ハイリスク薬の特定薬剤加算選択肢が描画されていること');
  assert.ok(htmlEditable.includes('手動入力レセ適'), 'remarksの特記事項値が入力欄に描画されていること');

  // 2. canEditBilling: false 時の disabled 保護実描画
  const htmlDisabled = renderToStaticMarkup(
    React.createElement(DrugInfoClaimTools, {
      prescriptionItems: mockItems,
      canEditBilling: false,
      remarks: {},
      handleToggleIppoka: noopAsync,
      handleToggleCrushed: noopAsync,
      handleItemClaimToggle: noopAsync,
      handleTokkanChange: noopAsync,
      handleBillingAgentOverrideLocalChange: () => {},
      persistBillingAgentOverride: noopAsync,
      handleReceiptRemarkChange: () => {}
    })
  );

  // canEditBilling: false 時は 15 個が無効化（一包化・粉砕・調製・薬管・検査薬チェックボックス、加算セレクト、レセ特記事項入力欄等）、true 時は 0 個
  const disabledTags = listDisabledOpeningTags(htmlDisabled);
  assert.strictEqual(
    disabledTags.length,
    15,
    `All claim controls must be disabled when canEditBilling is false:\n${disabledTags.join('\n')}`
  );
  const editableDisabledTags = listDisabledOpeningTags(htmlEditable);
  assert.strictEqual(
    editableDisabledTags.length,
    0,
    `No claim controls should be disabled when canEditBilling is true:\n${editableDisabledTags.join('\n')}`
  );
});
