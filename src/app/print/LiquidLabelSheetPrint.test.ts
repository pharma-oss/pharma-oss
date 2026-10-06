import { test } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiquidLabelSheetPrint } from './components/LiquidLabelSheetPrint';
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

test('LiquidLabelSheetPrint renders liquid label with bottle instructions, dosages, and safety warning', () => {
  const patientData = {
    name: '水剤 太郎',
    patientId: 'PAT-LIQ-001'
  };

  const liquidItems = [
    {
      itemId: 'liq-item-1',
      drugName: 'アンブロキソール塩酸塩シロップ0.3%',
      amount: 10,
      days: 7,
      totalAmount: 70,
      usage: '1日3回毎食後',
      dosageCategory: 'internal',
      unit: 'mL'
    }
  ];

  const html = renderToStaticMarkup(
    React.createElement(LiquidLabelSheetPrint, {
      patientData,
      liquidItems,
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: '東京都千代田区1-1-1',
      currentDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  // 1. ルート要素とラベルタイトル
  assert.ok(html.includes('data-testid="liquid-label-sheet-doc"'), '水剤ラベルシート要素が存在すること');
  assert.ok(html.includes('bottle-label liquid-label'), '水剤ボトルラベルクラスが存在すること');
  assert.ok(html.includes('水剤'), '水剤タイトルが表示されること');

  // 2. 患者名と薬品名
  assert.ok(html.includes('水剤 太郎 様'), '患者名が表示されること');
  assert.ok(html.includes('アンブロキソール塩酸塩シロップ0.3%'), '薬品名が表示されること');
  assert.ok(html.includes('1日3回毎食後'), '用法が表示されること');

  // 3. 用量グリッド（全量、1日量、日数）
  assert.ok(html.includes('全量'), '全量ラベルが表示されること');
  assert.ok(html.includes('70 mL') || html.includes('70mL') || html.includes('70'), '全量が表示されること');
  assert.ok(html.includes('1日量'), '1日量ラベルが表示されること');
  assert.ok(html.includes('7日分'), '日数が表示されること');

  // 4. 安全注意文と薬局情報
  assert.ok(html.includes('使用前によく振り、量を確認してください'), '水剤注意文が表示されること');
  assert.ok(html.includes('みらい調剤薬局'), '薬局名が表示されること');
  assert.ok(html.includes('調剤薬剤師: 薬剤 師範'), '調剤薬剤師が表示されること');
});

test('LiquidLabelSheetPrint returns null when liquidItems is empty', () => {
  const patientData = { name: '空 水剤' };

  const html = renderToStaticMarkup(
    React.createElement(LiquidLabelSheetPrint, {
      patientData,
      liquidItems: [],
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: '東京都千代田区1-1-1',
      currentDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  assert.equal(html, '', '空データ時は何も描画されないこと（null）');
});
