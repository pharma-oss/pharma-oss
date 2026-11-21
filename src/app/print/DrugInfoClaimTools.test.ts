import { test } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { listDisabledOpeningTags } from '@/lib/test_support/html_disabled_tags';
import { DrugInfoPrint } from './components/DrugInfoPrint';
import { DrugInfoClaimTools } from './components/DrugInfoClaimTools';
import type { PharmacyInfo, PrintPrescriptionItem } from './types';

test('DrugInfoClaimTools render contracts and scoped style encapsulation', () => {
  // 1. コンポーネントが React コンポーネントとして正しくエクスポートされていること
  assert.ok(DrugInfoClaimTools, 'DrugInfoClaimTools should be exported');
  assert.strictEqual(typeof DrugInfoClaimTools, 'object', 'React.memo returns an object component');

  const noopAsync = async () => {};
  const samplePharmacyInfo: PharmacyInfo = {
    code: '1312345',
    name: 'テスト薬局',
    postalCode: '100-0001',
    address: '東京都千代田区1-1-1',
    phone: '03-1234-5678',
    registrationNumber: '1312345',
    pharmacistName: '薬剤 太郎'
  };

  // 2. DrugInfoPrint の実描画出力で DrugInfoClaimTools が組み込まれており、親自身の <style> にはツール用セレクタが無いこと
  const parentHtml = renderToStaticMarkup(
    React.createElement(DrugInfoPrint, {
      patientData: { name: '患者 太郎' },
      visitData: { institutionName: 'テスト医院' },
      prescriptionItems: [],
      pharmacyInfo: samplePharmacyInfo,
      pharmacyAddressLine: '〒100-0001 東京都千代田区1-1-1',
      receiptRunId: 'RUN-2',
      patientBirthDateStr: '1980/01/01',
      dispensingDateStr: '2026/06/01',
      prescriptionDateStr: '2026/06/01',
      medicationInfoFallbackCount: 0,
      getMedicationInfoContent: () => ({
        drugName: '',
        source: 'safe_fallback' as const,
        sourceRevisionDate: '',
        sideEffectText: '',
        usageCautionText: '',
        officialSearchUrl: ''
      }),
      canEditBilling: true,
      remarks: {},
      renderIdentityMark: () => React.createElement('span', null, 'M'),
      handleToggleIppoka: noopAsync,
      handleToggleCrushed: noopAsync,
      handleItemClaimToggle: noopAsync,
      dispensingDateForPrice: '2026-06-01',
      drugPriceChoicesByItemId: {},
      drugPriceWarningByItemId: {},
      handleDrugPriceOverrideChange: noopAsync,
      handleTokkanChange: noopAsync,
      handleReceiptRemarkChange: () => {},
      handleBillingAgentOverrideLocalChange: () => {},
      persistBillingAgentOverride: noopAsync
    })
  );
  const parentDom = parentHtml.replace(/<style[\s\S]*?<\/style>/g, '');
  assert.match(parentDom, /class="drug-info-claim-tools no-print"/);

  const parentStyles = parentHtml.match(/<style[^>]*>[\s\S]*?<\/style>/g) ?? [];
  assert.ok(parentStyles.length >= 2, 'DrugInfoPrint should render child style and its own style');
  const drugInfoPrintStyle = parentStyles[parentStyles.length - 1];

  assert.doesNotMatch(drugInfoPrintStyle, /\.drug-info-claim-tools\s*\{/);
  assert.doesNotMatch(drugInfoPrintStyle, /\.drug-info-claim-row\s*\{/);
  assert.doesNotMatch(drugInfoPrintStyle, /\.drug-info-control-panel\s*\{/);
  assert.doesNotMatch(drugInfoPrintStyle, /\.input-agent-group\s*\{/);
  assert.doesNotMatch(drugInfoPrintStyle, /\.input-receipt-remark\s*\{/);

  // 3. DrugInfoClaimTools 単体の実描画出力で 5 セレクタ・幅定義・印刷非表示が保持されていること
  const claimToolsHtml = renderToStaticMarkup(
    React.createElement(DrugInfoClaimTools, {
      prescriptionItems: [],
      canEditBilling: true,
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
  const claimToolsStyle = claimToolsHtml.match(/<style[^>]*>[\s\S]*?<\/style>/)?.[0] ?? '';

  assert.match(claimToolsStyle, /\.drug-info-claim-tools\s*\{/);
  assert.match(claimToolsStyle, /\.drug-info-claim-row\s*\{/);
  assert.match(claimToolsStyle, /\.drug-info-control-panel\s*\{/);
  assert.match(claimToolsStyle, /\.input-agent-group\s*\{/);
  assert.match(claimToolsStyle, /\.input-receipt-remark\s*\{/);
  assert.match(claimToolsStyle, /\.input-agent-group\s*\{[^}]*width:\s*80px/);
  assert.match(claimToolsStyle, /\.input-receipt-remark\s*\{[^}]*width:\s*120px/);
  assert.match(claimToolsStyle, /@media\s+print\s*\{[^}]*\.no-print\s*\{[^}]*display:\s*none\s*!important/);
});

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
