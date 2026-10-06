import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import React from 'react';
import {
  DrugInfoItemCard,
  hasPrescriptionChange,
  formatDaysText,
  formatUsageText,
  formatMedicationSourceText
} from './components/DrugInfoItemCard';

test('DrugInfoItemCard exports and component type', () => {
  assert.ok(DrugInfoItemCard, 'DrugInfoItemCard should be exported');
  assert.strictEqual(typeof DrugInfoItemCard, 'object', 'React.memo returns an object component');
});

test('DrugInfoItemCard pure functions: hasPrescriptionChange', () => {
  // 1. 処方名と調剤名が同一（dispensedDrug なし、または一致）
  assert.strictEqual(
    hasPrescriptionChange({ drugName: 'アモキシシリンカプセル250mg' }),
    false,
    'No dispensedDrug should not be marked as change'
  );
  assert.strictEqual(
    hasPrescriptionChange({ drugName: 'アモキシシリンカプセル250mg', dispensedDrug: 'アモキシシリンカプセル250mg' }),
    false,
    'Same name should not be marked as change'
  );

  // 2. 先発から後発への変更
  assert.strictEqual(
    hasPrescriptionChange({ drugName: 'サワシリンカプセル250mg', dispensedDrug: 'アモキシシリンカプセル250mg「日医工」' }),
    true,
    'Different name should be marked as change'
  );

  // 3. 一般名処方からの調剤
  assert.strictEqual(
    hasPrescriptionChange({ drugName: '【般】アモキシシリンカプセル２５０ｍｇ', dispensedDrug: 'アモキシシリンカプセル250mg「トーワ」' }),
    true,
    'Generic prescription to brand should be marked as change'
  );
});

test('DrugInfoItemCard pure functions: formatDaysText', () => {
  assert.strictEqual(formatDaysText(14), '14日分');
  assert.strictEqual(formatDaysText('7'), '7日分');
  assert.strictEqual(formatDaysText(0), '-');
  assert.strictEqual(formatDaysText(undefined), '-');
  assert.strictEqual(formatDaysText(null), '-');
});

test('DrugInfoItemCard pure functions: formatUsageText', () => {
  assert.strictEqual(formatUsageText('1日3回毎食後'), '1日3回毎食後');
  assert.strictEqual(formatUsageText(''), '用法未設定');
  assert.strictEqual(formatUsageText(undefined), '用法未設定');
  assert.strictEqual(formatUsageText(null), '用法未設定');
});

test('DrugInfoItemCard pure functions: formatMedicationSourceText', () => {
  assert.strictEqual(
    formatMedicationSourceText({ source: 'approved_template', sourceRevisionDate: '2026-04-01' }),
    '薬局確認済み情報（参照版日 2026-04-01）'
  );
  assert.strictEqual(
    formatMedicationSourceText({ source: 'fallback', sourceRevisionDate: '' }),
    '詳しい薬剤情報は薬剤師へ確認してください'
  );
});

test('DrugInfoItemCard static contract and style relocation', () => {
  const drugInfoPrintSource = readFileSync(new URL('./components/DrugInfoPrint.tsx', import.meta.url), 'utf8');
  const itemCardSource = readFileSync(new URL('./components/DrugInfoItemCard.tsx', import.meta.url), 'utf8');

  // DrugInfoPrint.tsx は DrugInfoItemCard を呼び出していること
  assert.match(drugInfoPrintSource, /<DrugInfoItemCard\b/);

  // カード専用セレクタが DrugInfoPrint.tsx から移動（削除）されていること
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-info-row\.drug-info-card\s*\{/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-appearance-cell/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-shape\s*\{/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-shape\.tablet/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-shape\.powder/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-shape\.liquid/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-shape\.ointment/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-info-counseling-grid\s*\{/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-info-safety-grid\s*\{/);
  assert.doesNotMatch(drugInfoPrintSource, /\.drug-info-source-line\s*\{/);

  // カード専用セレクタが DrugInfoItemCard.tsx に漏れなく定義されていること
  assert.match(itemCardSource, /\.drug-info-row\.drug-info-card\s*\{/);
  assert.match(itemCardSource, /\.drug-appearance-cell/);
  assert.match(itemCardSource, /\.drug-shape\s*\{/);
  assert.match(itemCardSource, /\.drug-shape\.tablet\s*\{/);
  assert.match(itemCardSource, /\.drug-shape\.powder\s*\{/);
  assert.match(itemCardSource, /\.drug-shape\.liquid\s*\{/);
  assert.match(itemCardSource, /\.drug-shape\.ointment\s*\{/);
  assert.match(itemCardSource, /\.drug-info-counseling-grid\s*\{/);
  assert.match(itemCardSource, /\.drug-info-safety-grid\s*\{/);
  assert.match(itemCardSource, /\.drug-info-source-line\s*\{/);
  assert.match(itemCardSource, /\.paper-embedded-control\s*\{[^}]*display:\s*none/);

  // 親 DrugInfoPrint.tsx が文書枠組みスタイルを維持していること
  assert.match(drugInfoPrintSource, /\.yakujo-doc\s*\{/);
  assert.match(drugInfoPrintSource, /\.drug-info-doc\s*\{/);
  assert.match(drugInfoPrintSource, /\.drug-info-titlebar\s*\{/);
  assert.match(drugInfoPrintSource, /\.drug-info-patient-line\s*\{/);
  assert.match(drugInfoPrintSource, /\.drug-info-list\s*\{/);
  assert.match(drugInfoPrintSource, /\.drug-info-bottom-note\s*\{/);
  assert.match(drugInfoPrintSource, /\.drug-info-footer\s*\{/);

  // PrintLayoutRegression で要求される契約キーワードが存在すること
  assert.match(itemCardSource, /参照版日/);
  assert.match(itemCardSource, /PMDAで公式情報を確認/);
  assert.match(itemCardSource, /副作用・相談目安/);
  assert.match(itemCardSource, /使用上の注意/);
  assert.match(itemCardSource, /medicationInfo\.sideEffectText/);
  assert.match(itemCardSource, /medicationInfo\.usageCautionText/);

  // 禁止キーワードが含まれていないこと
  assert.doesNotMatch(itemCardSource, /identity-copy/);
  assert.doesNotMatch(itemCardSource, /shiori/i);
  assert.doesNotMatch(itemCardSource, /medicationInfo\.effectText/);
  assert.doesNotMatch(itemCardSource, /medicationInfo\.interactionText/);
  assert.doesNotMatch(itemCardSource, /medicationInfo\.storageText/);
  assert.doesNotMatch(itemCardSource, /drug-info-message-box/);
});

import { renderToStaticMarkup } from 'react-dom/server';
import type { PrintPrescriptionItem } from './types';
import type { MedicationInfoPrintContent } from '@/lib/patient_medication_info';

test('DrugInfoItemCard true HTML rendering with approved template and brand/generic change', () => {
  const mockItemWithSubstitution: PrintPrescriptionItem = {
    itemId: 'item-sub-1',
    visitId: 'visit-1',
    drugId: '620000001',
    dispensedDrugCode: '620000001',
    drugName: 'アムロジピンOD錠5mg',
    dispensedDrug: 'アムロジピンOD錠5mg「トーワ」',
    amount: 1,
    days: 14,
    usage: '1日1回朝食後',
    rpNumber: 1,
    dosageCategory: 'internal',
    drugPrice: 10.1,
    claimDrugFee: true
  } as unknown as PrintPrescriptionItem;

  const mockApprovedMedicationInfo: MedicationInfoPrintContent = {
    drugName: 'アムロジピンOD錠5mg「トーワ」',
    source: 'approved_template',
    sourceRevisionDate: '2026-04-01',
    sideEffectText: 'めまい、ふらつき、ほてり等があらわれることがあります。',
    usageCautionText: 'グレープフルーツジュースとの併用は避けてください。',
    officialSearchUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuSearch/'
  };

  const noopAsync = async () => {};

  const html = renderToStaticMarkup(
    React.createElement(DrugInfoItemCard, {
      item: mockItemWithSubstitution,
      idx: 0,
      medicationInfo: mockApprovedMedicationInfo,
      canEditBilling: true,
      remarks: {},
      handleToggleIppoka: noopAsync,
      handleToggleCrushed: noopAsync,
      handleItemClaimToggle: noopAsync,
      handleTokkanChange: noopAsync,
      handleDrugPriceOverrideChange: noopAsync,
      handleReceiptRemarkChange: () => {},
      handleBillingAgentOverrideLocalChange: () => {},
      persistBillingAgentOverride: noopAsync
    })
  );

  // 1. 基本枠組みと調剤薬品名の実描画
  assert.ok(html.includes('drug-info-row drug-info-card'), 'カードルートクラスが存在すること');
  assert.ok(html.includes('アムロジピンOD錠5mg「トーワ」'), '調剤薬名が描画されていること');
  assert.ok(html.includes('処方: アムロジピンOD錠5mg'), '変更前処方薬名が処方注記として描画されていること');

  // 2. 用法・日数・数量・外観の実描画
  assert.ok(html.includes('1日1回朝食後'), '用法テキストが描画されていること');
  assert.ok(html.includes('14日分'), '日数テキストが描画されていること');
  assert.ok(html.includes('drug-shape tablet'), '錠剤の外観シェイプクラスが適用されていること');
  assert.ok(html.includes('朝食後'), '服用タイミングバッジが描画されていること');

  // 3. 承認済み薬情テンプレートの内容と参照版日・PMDAリンクの実描画
  assert.ok(html.includes('めまい、ふらつき'), '副作用相談目安が描画されていること');
  assert.ok(html.includes('グレープフルーツジュース'), '使用上の注意が描画されていること');
  assert.ok(html.includes('薬局確認済み情報（参照版日 2026-04-01）'), '承認済み版日ラインが描画されていること');
  assert.ok(html.includes('https://www.pmda.go.jp/PmdaSearch/iyakuSearch/'), 'PMDA公式情報検索リンクが描画されていること');
  assert.ok(html.includes('PMDAで公式情報を確認'), 'PMDAリンクテキストが描画されていること');
});

test('DrugInfoItemCard true HTML rendering with fallback template and drug price warning', () => {
  const mockItemBasic: PrintPrescriptionItem = {
    itemId: 'item-basic-2',
    visitId: 'visit-1',
    drugId: '620000002',
    dispensedDrugCode: '620000002',
    drugName: 'ロキソニン錠60mg',
    amount: 3,
    days: 5,
    usage: '1日3回毎食後',
    rpNumber: 2,
    dosageCategory: 'internal',
    drugPrice: 15.2,
    claimDrugFee: true
  } as unknown as PrintPrescriptionItem;

  const mockFallbackMedicationInfo: MedicationInfoPrintContent = {
    drugName: 'ロキソニン錠60mg',
    source: 'safe_fallback',
    sourceRevisionDate: '',
    sideEffectText: '',
    usageCautionText: '',
    officialSearchUrl: ''
  };

  const noopAsync = async () => {};

  const html = renderToStaticMarkup(
    React.createElement(DrugInfoItemCard, {
      item: mockItemBasic,
      idx: 1,
      medicationInfo: mockFallbackMedicationInfo,
      canEditBilling: true,
      remarks: {},
      drugPriceWarning: '過去の薬価版が選択されています',
      drugPriceChoices: [
        { value: '2026-04-01', effectiveFrom: '2026-04-01', price: 15.2, isAutoSelected: true },
        { value: '2024-04-01', effectiveFrom: '2024-04-01', price: 16.0, isAutoSelected: false }
      ],
      dispensingDateForPrice: '2026-06-01',
      handleToggleIppoka: noopAsync,
      handleToggleCrushed: noopAsync,
      handleItemClaimToggle: noopAsync,
      handleTokkanChange: noopAsync,
      handleDrugPriceOverrideChange: noopAsync,
      handleReceiptRemarkChange: () => {},
      handleBillingAgentOverrideLocalChange: () => {},
      persistBillingAgentOverride: noopAsync
    })
  );

  // 1. フォールバック案内の実描画
  assert.ok(html.includes('詳しい薬剤情報は薬剤師へ確認してください'), 'フォールバック案内文が描画されていること');
  assert.ok(!html.includes('参照版日'), 'フォールバック時は参照版日が表示されないこと');

  // 2. 薬価警告と選択肢の実描画
  assert.ok(html.includes('過去の薬価版が選択されています'), '薬価警告が表示されていること');
  assert.ok(html.includes('drug-price-revision-select'), '薬価選択セレクトボックスが表示されていること');
});
