import { test } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { findOpeningTag, listDisabledOpeningTags } from '@/lib/test_support/html_disabled_tags';
import { DrugInfoPrint } from './components/DrugInfoPrint';
import {
  DrugInfoItemCard,
  hasPrescriptionChange,
  formatDaysText,
  formatUsageText,
  formatMedicationSourceText
} from './components/DrugInfoItemCard';
import type { PharmacyInfo, PrintPrescriptionItem } from './types';
import type { MedicationInfoPrintContent } from '@/lib/patient_medication_info';
import type { DrugPriceRevisionChoice } from '@/lib/drug_price_history';

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

test('DrugInfoItemCard render contract, parent/child composition, and scoped style relocation', () => {
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
  const sampleItem: PrintPrescriptionItem = {
    itemId: 'item-contract-1',
    visitId: 'visit-contract',
    drugId: '620000001',
    dispensedDrugCode: '620000001',
    drugName: 'アムロジピン錠5mg',
    amount: 1,
    days: 14,
    usage: '1日1回朝食後',
    rpNumber: 1,
    dosageCategory: 'internal',
    drugPrice: 10.1,
    claimDrugFee: true
  } as unknown as PrintPrescriptionItem;
  const sampleMedicationInfo = {
    drugName: 'アムロジピン錠5mg',
    source: 'approved_template' as const,
    sourceRevisionDate: '2026-04-01',
    sideEffectText: 'めまい・ふらつきに注意',
    usageCautionText: '毎日決まった時間に服用してください',
    officialSearchUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuSearch/',
    // 禁止項目が誤って描画されないことを確認するためのダミー拡張プロパティ
    effectText: 'FORBIDDEN_EFFECT_TEXT',
    interactionText: 'FORBIDDEN_INTERACTION_TEXT',
    storageText: 'FORBIDDEN_STORAGE_TEXT'
  } as MedicationInfoPrintContent;

  // 1. 親 DrugInfoPrint は処方アイテムあり時に DrugInfoItemCard を実描画する
  const parentWithItemHtml = renderToStaticMarkup(
    React.createElement(DrugInfoPrint, {
      patientData: { name: '患者 花子' },
      visitData: { institutionName: 'テスト医院' },
      prescriptionItems: [sampleItem],
      pharmacyInfo: samplePharmacyInfo,
      pharmacyAddressLine: '〒100-0001 東京都千代田区1-1-1',
      receiptRunId: 'RUN-1',
      patientBirthDateStr: '1980/01/01',
      dispensingDateStr: '2026/06/01',
      prescriptionDateStr: '2026/06/01',
      medicationInfoFallbackCount: 0,
      getMedicationInfoContent: () => sampleMedicationInfo,
      canEditBilling: true,
      remarks: {},
      renderIdentityMark: () => React.createElement('span', { className: 'test-mark' }, 'M'),
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
  const parentWithItemDom = parentWithItemHtml.replace(/<style[\s\S]*?<\/style>/g, '');
  assert.match(parentWithItemDom, /class="drug-info-row drug-info-card\b/);

  // 2. 親 DrugInfoPrint 自身の <style>（アイテム0件描画の末尾 style）からカード専用セレクタが除去され、文書枠組みスタイルを維持していること
  const parentEmptyHtml = renderToStaticMarkup(
    React.createElement(DrugInfoPrint, {
      patientData: { name: '患者 花子' },
      visitData: { institutionName: 'テスト医院' },
      prescriptionItems: [],
      pharmacyInfo: samplePharmacyInfo,
      pharmacyAddressLine: '〒100-0001 東京都千代田区1-1-1',
      receiptRunId: 'RUN-1',
      patientBirthDateStr: '1980/01/01',
      dispensingDateStr: '2026/06/01',
      prescriptionDateStr: '2026/06/01',
      medicationInfoFallbackCount: 0,
      getMedicationInfoContent: () => sampleMedicationInfo,
      canEditBilling: true,
      remarks: {},
      renderIdentityMark: () => React.createElement('span', { className: 'test-mark' }, 'M'),
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
  const parentStyles = parentEmptyHtml.match(/<style[^>]*>[\s\S]*?<\/style>/g) ?? [];
  assert.ok(parentStyles.length >= 2, 'DrugInfoPrint should emit child claim tools style and its own parent style');
  const drugInfoPrintStyle = parentStyles[parentStyles.length - 1];

  assert.doesNotMatch(drugInfoPrintStyle, /\.drug-info-row\.drug-info-card\s*\{/);
  assert.doesNotMatch(drugInfoPrintStyle, /\.drug-appearance-cell/);
  assert.doesNotMatch(drugInfoPrintStyle, /\.drug-shape\s*\{/);
  assert.doesNotMatch(drugInfoPrintStyle, /\.drug-shape\.tablet/);
  assert.doesNotMatch(drugInfoPrintStyle, /\.drug-shape\.powder/);
  assert.doesNotMatch(drugInfoPrintStyle, /\.drug-shape\.liquid/);
  assert.doesNotMatch(drugInfoPrintStyle, /\.drug-shape\.ointment/);
  assert.doesNotMatch(drugInfoPrintStyle, /\.drug-info-counseling-grid\s*\{/);
  assert.doesNotMatch(drugInfoPrintStyle, /\.drug-info-safety-grid\s*\{/);
  assert.doesNotMatch(drugInfoPrintStyle, /\.drug-info-source-line\s*\{/);

  assert.match(drugInfoPrintStyle, /\.yakujo-doc\s*\{/);
  assert.match(drugInfoPrintStyle, /\.drug-info-doc\s*\{/);
  assert.match(drugInfoPrintStyle, /\.drug-info-titlebar\s*\{/);
  assert.match(drugInfoPrintStyle, /\.drug-info-patient-line\s*\{/);
  assert.match(drugInfoPrintStyle, /\.drug-info-list\s*\{/);
  assert.match(drugInfoPrintStyle, /\.drug-info-bottom-note\s*\{/);
  assert.match(drugInfoPrintStyle, /\.drug-info-footer\s*\{/);

  // 3. DrugInfoItemCard 単体の実描画出力でカード専用スタイル・必須文言・禁止要素不在を検証
  const cardHtml = renderToStaticMarkup(
    React.createElement(DrugInfoItemCard, {
      item: sampleItem,
      idx: 0,
      medicationInfo: sampleMedicationInfo,
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
  const cardStyle = cardHtml.match(/<style[^>]*>[\s\S]*?<\/style>/)?.[0] ?? '';
  const cardDom = cardHtml.replace(/<style[\s\S]*?<\/style>/g, '');

  assert.match(cardStyle, /\.drug-info-row\.drug-info-card\s*\{/);
  assert.match(cardStyle, /\.drug-appearance-cell/);
  assert.match(cardStyle, /\.drug-shape\s*\{/);
  assert.match(cardStyle, /\.drug-shape\.tablet\s*\{/);
  assert.match(cardStyle, /\.drug-shape\.powder\s*\{/);
  assert.match(cardStyle, /\.drug-shape\.liquid\s*\{/);
  assert.match(cardStyle, /\.drug-shape\.ointment\s*\{/);
  assert.match(cardStyle, /\.drug-info-counseling-grid\s*\{/);
  assert.match(cardStyle, /\.drug-info-safety-grid\s*\{/);
  assert.match(cardStyle, /\.drug-info-source-line\s*\{/);
  assert.match(cardStyle, /\.paper-embedded-control\s*\{[^}]*display:\s*none/);

  assert.match(cardDom, /参照版日/);
  assert.match(cardDom, /PMDAで公式情報を確認/);
  assert.match(cardDom, /副作用・相談目安/);
  assert.match(cardDom, /使用上の注意/);
  assert.ok(cardDom.includes('めまい・ふらつきに注意'));
  assert.ok(cardDom.includes('毎日決まった時間に服用してください'));

  assert.doesNotMatch(cardHtml, /identity-copy/);
  assert.doesNotMatch(cardHtml, /shiori/i);
  assert.doesNotMatch(cardDom, /FORBIDDEN_EFFECT_TEXT/);
  assert.doesNotMatch(cardDom, /FORBIDDEN_INTERACTION_TEXT/);
  assert.doesNotMatch(cardDom, /FORBIDDEN_STORAGE_TEXT/);
  assert.doesNotMatch(cardHtml, /drug-info-message-box/);
});

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

test('DrugInfoItemCard billing adjustment controls disabled states when canEditBilling is false vs true', () => {
  const mockItemFull: PrintPrescriptionItem = {
    itemId: 'item-claim-full',
    visitId: 'visit-1',
    drugId: '620000003',
    dispensedDrugCode: '620000003',
    drugName: 'ワーファリン錠1mg',
    dispensedDrug: 'ワーファリン錠1mg',
    amount: 1,
    days: 28,
    usage: '1日1回夕食後',
    rpNumber: 1,
    dosageCategory: 'internal',
    drugPrice: 9.8,
    claimDrugFee: true,
    isHighRisk: true,
    tokkanType: '1',
    isIppoka: true,
    isCrushed: false,
    claimPreparation: true,
    claimManagement: true,
    isDiagnosticTest: false,
    billingAgentGroupKey: 'AGENT-1',
    receiptRemark: '特記事項メモ'
  } as unknown as PrintPrescriptionItem;

  const mockMedicationInfo: MedicationInfoPrintContent = {
    drugName: 'ワーファリン錠1mg',
    source: 'approved_template',
    sourceRevisionDate: '2026-04-01',
    sideEffectText: '出血傾向等',
    usageCautionText: '納豆・クロレラ摂取禁止',
    officialSearchUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuSearch/'
  };

  const drugPriceChoices: DrugPriceRevisionChoice[] = [
    { value: '2026-04-01', effectiveFrom: '2026-04-01', price: 9.8, isAutoSelected: true },
    { value: '2024-04-01', effectiveFrom: '2024-04-01', price: 10.2, isAutoSelected: false }
  ];

  const noopAsync = async () => {};

  const renderCard = (canEditBilling: boolean) =>
    renderToStaticMarkup(
      React.createElement(DrugInfoItemCard, {
        item: mockItemFull,
        idx: 0,
        medicationInfo: mockMedicationInfo,
        canEditBilling,
        remarks: { 'item-claim-full': '特記事項メモ' },
        drugPriceChoices,
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

  const htmlDisabled = renderCard(false);
  const htmlEditable = renderCard(true);

  // 1. canEditBilling: false 時は全9個のフォームコントロールが無効化されること
  const disabledTags = listDisabledOpeningTags(htmlDisabled);
  assert.strictEqual(
    disabledTags.length,
    9,
    `All 9 billing adjustment controls must have disabled="" when canEditBilling is false:\n${disabledTags.join('\n')}`
  );

  // 各コントロールの開始タグを findOpeningTag で特定し、disabled="" を検証
  assert.match(findOpeningTag(htmlDisabled, '>一包化</label>', 'input'), /\sdisabled=""/, '一包化チェックボックスが無効化されていること');
  assert.match(findOpeningTag(htmlDisabled, '>粉砕</label>', 'input'), /\sdisabled=""/, '粉砕チェックボックスが無効化されていること');
  assert.match(findOpeningTag(htmlDisabled, '>調製</label>', 'input'), /\sdisabled=""/, '調製チェックボックスが無効化されていること');
  assert.match(findOpeningTag(htmlDisabled, '>薬管</label>', 'input'), /\sdisabled=""/, '薬管チェックボックスが無効化されていること');
  assert.match(findOpeningTag(htmlDisabled, '>検査薬</label>', 'input'), /\sdisabled=""/, '検査薬チェックボックスが無効化されていること');
  assert.match(findOpeningTag(htmlDisabled, '特定薬剤: なし', 'select'), /\sdisabled=""/, '特定薬剤加算セレクトが無効化されていること');
  assert.match(findOpeningTag(htmlDisabled, '薬価: 調剤日時点（自動）', 'select'), /\sdisabled=""/, '薬価改定セレクトが無効化されていること');
  assert.match(findOpeningTag(htmlDisabled, 'placeholder="レセ適"', 'input'), /\sdisabled=""/, 'レセ適入力欄が無効化されていること');
  assert.match(findOpeningTag(htmlDisabled, 'placeholder="剤キー"', 'input'), /\sdisabled=""/, '剤キー入力欄が無効化されていること');

  // 2. canEditBilling: true 時は全9個のフォームコントロールが有効であること (disabled="" が 0 個)
  const editableDisabledTags = listDisabledOpeningTags(htmlEditable);
  assert.strictEqual(
    editableDisabledTags.length,
    0,
    `No billing adjustment controls should have disabled="" when canEditBilling is true:\n${editableDisabledTags.join('\n')}`
  );

  // 各コントロールの開始タグが disabled="" を持たないことを検証
  assert.doesNotMatch(findOpeningTag(htmlEditable, '>一包化</label>', 'input'), /\sdisabled=""/, '一包化チェックボックスが有効であること');
  assert.doesNotMatch(findOpeningTag(htmlEditable, '>粉砕</label>', 'input'), /\sdisabled=""/, '粉砕チェックボックスが有効であること');
  assert.doesNotMatch(findOpeningTag(htmlEditable, '>調製</label>', 'input'), /\sdisabled=""/, '調製チェックボックスが有効であること');
  assert.doesNotMatch(findOpeningTag(htmlEditable, '>薬管</label>', 'input'), /\sdisabled=""/, '薬管チェックボックスが有効であること');
  assert.doesNotMatch(findOpeningTag(htmlEditable, '>検査薬</label>', 'input'), /\sdisabled=""/, '検査薬チェックボックスが有効であること');
  assert.doesNotMatch(findOpeningTag(htmlEditable, '特定薬剤: なし', 'select'), /\sdisabled=""/, '特定薬剤加算セレクトが有効であること');
  assert.doesNotMatch(findOpeningTag(htmlEditable, '薬価: 調剤日時点（自動）', 'select'), /\sdisabled=""/, '薬価改定セレクトが有効であること');
  assert.doesNotMatch(findOpeningTag(htmlEditable, 'placeholder="レセ適"', 'input'), /\sdisabled=""/, 'レセ適入力欄が有効であること');
  assert.doesNotMatch(findOpeningTag(htmlEditable, 'placeholder="剤キー"', 'input'), /\sdisabled=""/, '剤キー入力欄が有効であること');
});
