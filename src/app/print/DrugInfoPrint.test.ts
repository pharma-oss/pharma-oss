import { test } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DrugInfoPrint } from './components/DrugInfoPrint';
import type { PharmacyInfo, PrintPrescriptionItem } from './types';
import type { MedicationInfoPrintContent } from '@/lib/patient_medication_info';

const mockPharmacyInfo: PharmacyInfo = {
  name: 'みらい調剤薬局 本店',
  code: '1234567',
  pharmacistName: '薬剤 師朗',
  address: '東京都千代田区霞が関1-1-1',
  postalCode: '100-0013',
  phone: '03-9876-5432',
  registrationNumber: 'REG-001'
};

test('DrugInfoPrint true HTML rendering with prescription items and approved template', () => {
  const mockPatient = {
    name: '山田 太郎',
    kana: 'ヤマダ タロウ',
    birthDate: '1975-05-15',
    gender: 'male'
  };

  const mockVisit = {
    visitId: 'visit-yakujo-1',
    institutionName: '中央総合病院',
    institutionId: '1312345',
    prescriptionDate: '2026-10-06',
    dispensingDate: '2026-10-06'
  };

  const mockItems: PrintPrescriptionItem[] = [
    {
      itemId: 'yakujo-item-1',
      visitId: 'visit-yakujo-1',
      drugId: '620000001',
      dispensedDrugCode: '620000001',
      drugName: 'アムロジピンOD錠5mg',
      amount: 1,
      days: 14,
      usage: '1日1回朝食後',
      rpNumber: 1,
      dosageCategory: 'internal',
      drugPrice: 10.1,
      claimDrugFee: true
    }
  ] as unknown as PrintPrescriptionItem[];

  const mockMedicationContent: MedicationInfoPrintContent = {
    drugName: 'アムロジピンOD錠5mg',
    source: 'approved_template',
    sourceRevisionDate: '2026-04-01',
    sideEffectText: 'めまい、ふらつき等があらわれることがあります。',
    usageCautionText: 'グレープフルーツジュースとの併用は避けてください。',
    officialSearchUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuSearch/'
  };

  const noopAsync = async () => {};

  const html = renderToStaticMarkup(
    React.createElement(DrugInfoPrint, {
      patientData: mockPatient,
      visitData: mockVisit,
      prescriptionItems: mockItems,
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: mockPharmacyInfo.address || '',
      receiptRunId: 'REC-20261006-001',
      patientBirthDateStr: '1975-05-15 (51歳)',
      dispensingDateStr: '2026-10-06',
      prescriptionDateStr: '2026-10-06',
      medicationInfoFallbackCount: 0,
      getMedicationInfoContent: () => mockMedicationContent,
      canEditBilling: true,
      remarks: {},
      renderIdentityMark: (variant) => React.createElement('span', { className: `identity-mark-${variant}` }, '認証印'),
      handleToggleIppoka: noopAsync,
      handleToggleCrushed: noopAsync,
      handleItemClaimToggle: noopAsync,
      dispensingDateForPrice: '2026-10-06',
      drugPriceChoicesByItemId: {},
      drugPriceWarningByItemId: {},
      handleDrugPriceOverrideChange: noopAsync,
      handleTokkanChange: noopAsync,
      handleReceiptRemarkChange: () => {},
      handleBillingAgentOverrideLocalChange: () => {},
      persistBillingAgentOverride: noopAsync
    })
  );

  // 1. ドキュメント基本構造とメタデータ
  assert.ok(html.includes('data-testid="drug-info-doc"'), '薬情ドキュメントコンテナが存在すること');
  assert.ok(html.includes('薬剤情報提供文書'), '文書タイトルが描画されていること');
  assert.ok(html.includes('処方日 2026-10-06 / 調剤日 2026-10-06'), '日付情報が描画されていること');
  assert.ok(html.includes('山田 太郎 様'), '患者名が様付きで描画されていること');
  assert.ok(html.includes('生年月日 1975-05-15 (51歳)'), '生年月日が表示されていること');
  assert.ok(html.includes('処方元 中央総合病院'), '処方元医療機関が表示されていること');
  assert.ok(html.includes('受付番号 REC-20261006-001'), '受付番号が表示されていること');

  // 2. 薬局・薬剤師情報とフッター
  assert.ok(html.includes('みらい調剤薬局 本店'), '薬局名が描画されていること');
  assert.ok(html.includes('担当 薬剤 師朗'), '担当薬剤師が描画されていること');
  assert.ok(html.includes('TEL: 03-9876-5432'), '薬局電話番号が描画されていること');
  assert.ok(html.includes('体調の変化、飲み合わせ、飲み忘れで迷う場合は、服用前に薬剤師へご相談ください'), '注意事項テキストが描画されていること');

  // 3. 医薬品カードと指導内容
  assert.ok(html.includes('アムロジピンOD錠5mg'), '医薬品名が描画されていること');
  assert.ok(html.includes('めまい、ふらつき'), '副作用情報が描画されていること');
  assert.ok(html.includes('グレープフルーツジュース'), '使用上の注意が描画されていること');

  // 4. フォールバック警告が出ないこと（count === 0）
  assert.ok(!html.includes('data-testid="medication-info-fallback-alert"'), 'フォールバック 0 件時は警告バナーが出ないこと');
});

test('DrugInfoPrint renders fallback alert when unapproved medications exist', () => {
  const mockPatient = { name: '鈴木 花子' };
  const mockVisit = { institutionName: 'クリニック' };

  const mockFallbackContent: MedicationInfoPrintContent = {
    drugName: '未承認薬錠',
    source: 'safe_fallback',
    sourceRevisionDate: '',
    sideEffectText: '',
    usageCautionText: '',
    officialSearchUrl: ''
  };

  const noopAsync = async () => {};

  const htmlWithFallback = renderToStaticMarkup(
    React.createElement(DrugInfoPrint, {
      patientData: mockPatient,
      visitData: mockVisit,
      prescriptionItems: [
        {
          itemId: 'item-fallback-1',
          visitId: 'visit-fallback',
          drugId: '620000999',
          dispensedDrugCode: '620000999',
          drugName: '未承認薬錠',
          amount: 1,
          days: 7,
          usage: '1日1回朝食後',
          rpNumber: 1,
          dosageCategory: 'internal',
          claimDrugFee: true
        }
      ] as unknown as PrintPrescriptionItem[],
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: '千代田区',
      receiptRunId: 'REC-002',
      patientBirthDateStr: '1980-01-01',
      dispensingDateStr: '2026-10-06',
      prescriptionDateStr: '2026-10-06',
      medicationInfoFallbackCount: 1,
      getMedicationInfoContent: () => mockFallbackContent,
      canEditBilling: false,
      remarks: {},
      renderIdentityMark: () => null,
      handleToggleIppoka: noopAsync,
      handleToggleCrushed: noopAsync,
      handleItemClaimToggle: noopAsync,
      dispensingDateForPrice: '2026-10-06',
      drugPriceChoicesByItemId: {},
      drugPriceWarningByItemId: {},
      handleDrugPriceOverrideChange: noopAsync,
      handleTokkanChange: noopAsync,
      handleReceiptRemarkChange: () => {},
      handleBillingAgentOverrideLocalChange: () => {},
      persistBillingAgentOverride: noopAsync
    })
  );

  // フォールバック警告バナーが出現すること
  assert.ok(htmlWithFallback.includes('data-testid="medication-info-fallback-alert"'), 'フォールバック警告バナーが存在すること');
  assert.ok(htmlWithFallback.includes('承認済み薬情がない薬剤 1件。定型文で印刷されます。'), '警告メッセージが正しく表示されること');
  assert.ok(htmlWithFallback.includes('詳しい薬剤情報は薬剤師へ確認してください'), 'カード内にフォールバック案内が出ること');
});

test('DrugInfoPrint renders empty notice when prescriptionItems is empty', () => {
  const mockPatient = { name: '空処方 患者' };
  const mockVisit = {};

  const noopAsync = async () => {};

  const htmlEmpty = renderToStaticMarkup(
    React.createElement(DrugInfoPrint, {
      patientData: mockPatient,
      visitData: mockVisit,
      prescriptionItems: [],
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: '',
      receiptRunId: 'REC-EMPTY',
      patientBirthDateStr: '2000-01-01',
      dispensingDateStr: '2026-10-06',
      prescriptionDateStr: '2026-10-06',
      medicationInfoFallbackCount: 0,
      getMedicationInfoContent: () => ({ drugName: '' } as any),
      canEditBilling: false,
      remarks: {},
      renderIdentityMark: () => null,
      handleToggleIppoka: noopAsync,
      handleToggleCrushed: noopAsync,
      handleItemClaimToggle: noopAsync,
      dispensingDateForPrice: '2026-10-06',
      drugPriceChoicesByItemId: {},
      drugPriceWarningByItemId: {},
      handleDrugPriceOverrideChange: noopAsync,
      handleTokkanChange: noopAsync,
      handleReceiptRemarkChange: () => {},
      handleBillingAgentOverrideLocalChange: () => {},
      persistBillingAgentOverride: noopAsync
    })
  );

  assert.ok(htmlEmpty.includes('処方データがありません'), '処方データ空の案内が表示されること');
});
