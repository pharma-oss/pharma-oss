import { test } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OintmentLabelSheetPrint } from './components/OintmentLabelSheetPrint';
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

test('OintmentLabelSheetPrint renders ointment label with application site, dosage, and safety warning', () => {
  const patientData = {
    name: '軟膏 花子',
    patientId: 'PAT-OINT-001'
  };

  const ointmentItems = [
    {
      itemId: 'oint-item-1',
      drugName: 'プロペト',
      amount: 50,
      days: 0,
      totalAmount: 50,
      usage: '1日2回乾燥部位に薄く塗布',
      dosageCategory: 'external',
      unit: 'g'
    }
  ];

  const html = renderToStaticMarkup(
    React.createElement(OintmentLabelSheetPrint, {
      patientData,
      ointmentItems,
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: '東京都千代田区1-1-1',
      currentDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  // 1. ルート要素とラベルタイトル
  assert.ok(html.includes('data-testid="ointment-label-sheet-doc"'), '軟膏ラベルシート要素が存在すること');
  assert.ok(html.includes('bottle-label ointment-label'), '軟膏ラベルクラスが存在すること');
  assert.ok(html.includes('外用'), '外用タイトルが表示されること');

  // 2. 患者名と薬品名
  assert.ok(html.includes('軟膏 花子 様'), '患者名が表示されること');
  assert.ok(html.includes('プロペト'), '薬品名が表示されること');
  assert.ok(html.includes('1日2回乾燥部位に薄く塗布'), '用法が表示されること');

  // 3. 用量グリッド
  assert.ok(html.includes('全量'), '全量ラベルが表示されること');
  assert.ok(html.includes('50 g') || html.includes('50g') || html.includes('50'), '全量が表示されること');

  // 4. 安全注意文と薬局情報
  assert.ok(html.includes('使用部位と回数を確認してください'), '軟膏注意文が表示されること');
  assert.ok(html.includes('みらい調剤薬局'), '薬局名が表示されること');
  assert.ok(html.includes('調剤薬剤師: 薬剤 師範'), '調剤薬剤師が表示されること');
});

test('OintmentLabelSheetPrint returns null when ointmentItems is empty', () => {
  const patientData = { name: '空 軟膏' };

  const html = renderToStaticMarkup(
    React.createElement(OintmentLabelSheetPrint, {
      patientData,
      ointmentItems: [],
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: '東京都千代田区1-1-1',
      currentDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  assert.equal(html, '', '空データ時は何も描画されないこと（null）');
});
