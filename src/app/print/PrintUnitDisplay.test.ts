import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiquidLabelSheetPrint } from './components/LiquidLabelSheetPrint';
import { OintmentLabelSheetPrint } from './components/OintmentLabelSheetPrint';
import type { PharmacyInfo } from './types';

const dummyPharmacyInfo: PharmacyInfo = {
  name: 'テスト調剤薬局',
  code: '1234567',
  phone: '03-1234-5678',
  postalCode: '100-0001',
  address: '東京都千代田区千代田1-1',
  registrationNumber: 'REG-001',
  pharmacistName: 'テスト薬剤師'
};

const dummyPatientData = {
  id: 'p001',
  name: '患者 太郎',
  gender: 'male',
  birthDate: '2020-01-01'
};

test('LiquidLabelSheetPrint renders mL unit, daily amount, total multiplied by days, and NO tablet unit', () => {
  // 小児用シロップ 1日量 10mL, 3日分
  const syrupItem = {
    itemId: 'item-syrup-1',
    visitId: 'v1',
    drugId: 'drug-syrup',
    drugName: 'アンブロキソール塩酸塩シロップ0.3%',
    amount: 10,
    days: 3,
    unitText: 'mL',
    usage: '1日3回毎食後',
    dosageCategory: 'internal' as const
  };

  const element = React.createElement(LiquidLabelSheetPrint, {
    patientData: dummyPatientData,
    liquidItems: [syrupItem],
    pharmacyInfo: dummyPharmacyInfo,
    pharmacyAddressLine: dummyPharmacyInfo.address,
    currentDateStr: '2026/09/04',
    renderIdentityMark: () => React.createElement('span', null, 'MARK')
  });

  const html = renderToStaticMarkup(element);

  // 肯定アサート：実HTML内に計算された全量、1日量、日数が正しく現れること
  assert.ok(html.includes('全量'), '全量ラベルが含まれること');
  assert.ok(html.includes('30 mL'), '10mL * 3日分 = 30 mL が全量として含まれること');
  assert.ok(html.includes('1日量'), '1日量ラベルが含まれること');
  assert.ok(html.includes('10 mL'), '1日量 10 mL が含まれること');
  assert.ok(html.includes('3日分'), '3日分が含まれること');

  // 否定アサート：水剤ラベルに「錠」という単位が一切混入していないこと
  assert.ok(!html.includes('錠'), '水剤ラベルに「錠」が一切含まれないこと');
});

test('OintmentLabelSheetPrint renders g unit, total amount, and NO tablet unit', () => {
  // 外用軟膏 全量 25g, 7日分
  const ointmentItem = {
    itemId: 'item-ointment-1',
    visitId: 'v1',
    drugId: 'drug-ointment',
    drugName: 'ヒルドイドソフト軟膏0.3%',
    amount: 25,
    days: 7,
    unitText: 'g',
    usage: '1日2回患部に塗布',
    dosageCategory: 'external' as const
  };

  const element = React.createElement(OintmentLabelSheetPrint, {
    patientData: dummyPatientData,
    ointmentItems: [ointmentItem],
    pharmacyInfo: dummyPharmacyInfo,
    pharmacyAddressLine: dummyPharmacyInfo.address,
    currentDateStr: '2026/09/04',
    renderIdentityMark: () => React.createElement('span', null, 'MARK')
  });

  const html = renderToStaticMarkup(element);

  // 肯定アサート：外用全量 25 g がそのまま含まれること（日数が掛けられて過大にならない）
  assert.ok(html.includes('全量'), '全量ラベルが含まれること');
  assert.ok(html.includes('25 g'), '外用全量 25 g が含まれること');
  assert.ok(html.includes('7日分'), '7日分が含まれること');

  // 否定アサート：軟膏ラベルに「錠」という単位が一切混入していないこと
  assert.ok(!html.includes('錠'), '軟膏ラベルに「錠」が一切含まれないこと');
  assert.ok(!html.includes('175 g'), '外用薬の全量が日数倍 (25*7=175) されていないこと');
});
