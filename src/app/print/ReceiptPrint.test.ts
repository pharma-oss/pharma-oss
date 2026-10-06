import { test } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReceiptPrint } from './components/ReceiptPrint';
import type { PharmacyInfo } from './types';

const mockPharmacyInfo: PharmacyInfo = {
  name: 'みらい調剤薬局',
  code: '1312345',
  postalCode: '100-0001',
  address: '東京都千代田区1-1-1',
  phone: '03-1234-5678',
  registrationNumber: 'T1234567890123',
  pharmacistName: '薬剤 師範'
};

test('ReceiptPrint renders official receipt with patient copay, insurance breakdown, and fee rows', () => {
  const patientData = {
    name: '領収 太郎',
    patientId: 'PAT-RCPT-001'
  };

  const insuranceAmounts = {
    burdenRatio: 30,
    totalCostYen: 830,
    insurerBurdenYen: 580,
    patientCopayYen: 250
  };

  const receiptBreakdownRows = [
    { label: '調剤基本料', points: 45, note: '45点' },
    { label: '薬剤調製料', points: 24, note: '24点' },
    { label: '薬剤料', points: 14, note: '14点' }
  ];

  const html = renderToStaticMarkup(
    React.createElement(ReceiptPrint, {
      patientData,
      totalPoints: 83,
      insuranceAmounts,
      receiptBreakdownRows,
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: '東京都千代田区1-1-1',
      receiptRunId: 'RCPT-2026-001',
      currentDateStr: '2026年10月6日',
      dispensingDateStr: '2026年10月6日',
      prescriptionDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  // 1. ルート要素とタイトル
  assert.ok(html.includes('data-testid="receipt-doc"'), '領収証ドキュメント要素が存在すること');
  assert.ok(html.includes('患者様控'), '患者様控が表示されること');
  assert.ok(html.includes('No. RCPT-2026-001'), '受付番号が表示されていること');
  assert.ok(html.includes('発行日 2026年10月6日'), '発行日が表示されていること');
  assert.ok(html.includes('領収証'), '領収証タイトルが表示されること');

  // 2. 氏名と領収金額（患者負担）
  assert.ok(html.includes('領収 太郎 様'), '患者名が表示されていること');
  assert.ok(html.includes('¥250'), '領収金額が表示されていること');
  assert.ok(html.includes('保険調剤一部負担金として上記正に領収いたしました'), '領収文言が表示されていること');

  // 3. 総点数・保険診療総額・保険者負担額・患者負担割合
  assert.ok(html.includes('83 点'), '総点数が表示されていること');
  assert.ok(html.includes('¥830'), '保険診療総額が表示されていること');
  assert.ok(html.includes('¥580'), '保険者負担相当額が表示されていること');
  assert.ok(html.includes('30%'), '患者負担割合が表示されていること');

  // 4. 費用内訳テーブル
  assert.ok(html.includes('receipt-redesign-table'), '費用内訳テーブルクラスが存在すること');
  assert.ok(html.includes('調剤基本料'), '調剤基本料行が表示されていること');
  assert.ok(html.includes('45点'), '基本料点数が表示されていること');
  assert.ok(html.includes('薬剤調製料'), '薬剤調製料行が表示されていること');
  assert.ok(html.includes('薬剤料'), '薬剤料行が表示されていること');

  // 5. 薬局情報・領収印枠
  assert.ok(html.includes('みらい調剤薬局'), '薬局名が表示されていること');
  assert.ok(html.includes('03-1234-5678'), '薬局電話番号が表示されていること');
  assert.ok(html.includes('領収印'), '領収印枠が存在すること');
});
