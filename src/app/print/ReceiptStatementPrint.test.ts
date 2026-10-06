import { test } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReceiptStatementPrint } from './components/ReceiptStatementPrint';
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

test('ReceiptStatementPrint renders full dispensing statement with points, yen breakdown, and fee table', () => {
  const patientData = {
    name: '明細 太郎',
    patientId: 'PAT-STMT-001',
    insuranceInfo: {
      provider: '06130012',
      number: '123456',
      burdenRatio: 30
    }
  };

  const visitData = {
    institutionName: '千代田メディカルクリニック',
    departmentName: '内科',
    doctorName: '佐藤 健太'
  };

  const calculatedFees = [
    {
      code: 'base_fee',
      name: '調剤基本料1',
      rationale: '基本料1 (45点)',
      points: 45,
      receiptFeeCode: '410004110'
    },
    {
      code: 'drug_preparation',
      name: '薬剤調製料 (内服薬)',
      rationale: '内服薬 14日分 (24点)',
      points: 24,
      receiptFeeCode: '420001810'
    },
    {
      code: 'drug_fee',
      name: '薬剤料',
      rationale: 'アムロジピン他 (14点)',
      points: 14,
      receiptFeeCode: '620000001'
    }
  ];

  const insuranceAmounts = {
    burdenRatio: 30,
    totalCostYen: 830,
    insurerBurdenYen: 580,
    patientCopayYen: 250
  };

  const html = renderToStaticMarkup(
    React.createElement(ReceiptStatementPrint, {
      patientData,
      visitData,
      calculatedFees,
      totalPoints: 83,
      insuranceAmounts,
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: '東京都千代田区1-1-1',
      receiptRunId: 'STMT-2026-001',
      currentDateStr: '2026年10月6日',
      patientBirthDateStr: '1975年5月20日',
      dispensingDateStr: '2026年10月6日',
      prescriptionDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  // 1. ルート要素とタイトル
  assert.ok(html.includes('data-testid="receipt-statement-doc"'), '調剤明細書ドキュメント要素が存在すること');
  assert.ok(html.includes('調剤明細書'), '明細書タイトルが表示されること');
  assert.ok(html.includes('STMT-2026-001'), '受付番号が表示されていること');

  // 2. 患者・医療機関・保険情報
  assert.ok(html.includes('明細 太郎 様'), '患者名が表示されていること');
  assert.ok(html.includes('PAT-STMT-001'), '患者番号が表示されていること');
  assert.ok(html.includes('1975年5月20日'), '生年月日が表示されていること');
  assert.ok(html.includes('千代田メディカルクリニック'), '処方元医療機関が表示されていること');
  assert.ok(html.includes('佐藤 健太'), '処方医が表示されていること');
  assert.ok(html.includes('06130012'), '保険者番号が表示されていること');
  assert.ok(html.includes('負担割合 30%'), '負担割合が表示されていること');

  // 3. 点数・金額サマリー帯
  assert.ok(html.includes('83 点'), '合計点数が表示されていること');
  assert.ok(html.includes('¥830'), '保険診療総額が表示されていること');
  assert.ok(html.includes('¥580'), '保険者負担相当額が表示されていること');
  assert.ok(html.includes('¥250'), '患者負担金額が表示されていること');

  // 4. 調剤報酬の内訳テーブル
  assert.ok(html.includes('statement-fee-ledger'), '調剤報酬内訳テーブルクラスが存在すること');
  assert.ok(html.includes('調剤基本料1'), '調剤基本料1が表示されていること');
  assert.ok(html.includes('410004110'), 'レセ電算コードが表示されていること');
  assert.ok(html.includes('薬剤調製料 (内服薬)'), '薬剤調製料が表示されていること');
  assert.ok(html.includes('薬剤料'), '薬剤料が表示されていること');

  // 5. 薬局・確認欄
  assert.ok(html.includes('みらい調剤薬局'), '薬局名が表示されていること');
  assert.ok(html.includes('確認印'), '確認印枠が存在すること');
});

test('ReceiptStatementPrint renders empty state message when calculated fees are empty', () => {
  const patientData = {
    name: '空 明細',
    patientId: 'PAT-STMT-EMPTY'
  };

  const visitData = {};

  const insuranceAmounts = {
    burdenRatio: 0,
    totalCostYen: 0,
    insurerBurdenYen: 0,
    patientCopayYen: 0
  };

  const html = renderToStaticMarkup(
    React.createElement(ReceiptStatementPrint, {
      patientData,
      visitData,
      calculatedFees: [],
      totalPoints: 0,
      insuranceAmounts,
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: '東京都千代田区1-1-1',
      receiptRunId: 'STMT-EMPTY',
      currentDateStr: '2026年10月6日',
      patientBirthDateStr: '1990年1月1日',
      dispensingDateStr: '2026年10月6日',
      prescriptionDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  assert.ok(html.includes('データがありません'), '空データ案内メッセージが表示されること');
});
