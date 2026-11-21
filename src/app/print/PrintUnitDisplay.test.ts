import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiquidLabelSheetPrint } from './components/LiquidLabelSheetPrint';
import { OintmentLabelSheetPrint } from './components/OintmentLabelSheetPrint';
import { MedicineBagPrint } from './components/MedicineBagPrint';
import { MedicineNotebookStickerPrint } from './components/MedicineNotebookStickerPrint';
import { DispensingRecordPrint } from './components/DispensingRecordPrint';
import { DrugInfoItemCard } from './components/DrugInfoItemCard';
import { getDispensingAmountText, getDispensingTotalAmountText } from './helpers';
import type { PharmacyInfo, PrintPrescriptionItem } from './types';

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
  gender: 'male' as const,
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

test('OintmentLabelSheetPrint renders multiplied total for daily-like ointment (dosageCategory undefined, unclassified usage) and kills mutation #9', () => {
  // 1日量 5g, 7日分, dosageCategory 未設定, usage に「塗布」等の外用キーワードなし（「塗る」）
  const dailyOintmentItem = {
    itemId: 'item-ointment-daily-1',
    visitId: 'v1',
    drugId: 'drug-ointment-daily',
    drugName: 'プロペト',
    amount: 5,
    days: 7,
    unitText: 'g',
    usage: '1日2回患部に塗る'
  };

  const element = React.createElement(OintmentLabelSheetPrint, {
    patientData: dummyPatientData,
    ointmentItems: [dailyOintmentItem],
    pharmacyInfo: dummyPharmacyInfo,
    pharmacyAddressLine: dummyPharmacyInfo.address,
    currentDateStr: '2026/09/04',
    renderIdentityMark: () => React.createElement('span', null, 'MARK')
  });

  const html = renderToStaticMarkup(element);

  // isDailyAmountItem が true となり、getTotalAmountText により 5g * 7日分 = 35 g が全量として出力されること
  assert.ok(html.includes('全量'), '全量ラベルが含まれること');
  assert.ok(html.includes('35 g'), '5g * 7日分 = 35 g が全量として含まれること（getAmountText だと 5 g となり検出可能）');
  assert.ok(html.includes('7日分'), '7日分が含まれること');
});


test('LiquidLabelSheetPrint annotates the dispensing total when a unit conversion exists', () => {
  // 医師は「1日3缶」と処方、係数250、薬価単位 mL の実量は 1日 750 mL、14日分
  const convertedLiquidItem = {
    itemId: 'item-liquid-conv-1',
    visitId: 'v1',
    drugId: 'drug-liquid-conv',
    drugName: '□□内用液',
    amount: 750,
    days: 14,
    unitText: 'mL',
    usage: '1日3回毎食後',
    dosageCategory: 'internal' as const,
    electronicUnitConversion: {
      conversionFactor: '250',
      masterUnitText: 'mL',
      prescribedAmount: '3',
      prescribedUnitText: '缶'
    }
  };

  const element = React.createElement(LiquidLabelSheetPrint, {
    patientData: dummyPatientData,
    liquidItems: [convertedLiquidItem],
    pharmacyInfo: dummyPharmacyInfo,
    pharmacyAddressLine: dummyPharmacyInfo.address,
    currentDateStr: '2026/09/05',
    renderIdentityMark: () => React.createElement('span', null, 'MARK')
  });

  const html = renderToStaticMarkup(element);

  // 表示は医師の処方通り（3缶 × 14日分 = 42 缶）
  assert.ok(html.includes('42 缶'), '処方単位の全量 42 缶 が含まれること');
  assert.ok(html.includes('3 缶'), '処方単位の1日量 3 缶 が含まれること');
  // 投薬瓶の中身は調剤単位の実量（750 mL × 14日分 = 10500 mL）
  assert.ok(html.includes('10500 mL'), '調剤単位の実量 10500 mL が併記されること');
  assert.ok(!html.includes('錠'), '水剤ラベルに「錠」が一切含まれないこと');
});

test('LiquidLabelSheetPrint omits the dispensing annotation when there is no unit conversion', () => {
  // 換算なし＝表示ペアが薬価単位ペアそのものなので、括弧書きは出さない
  const plainSyrupItem = {
    itemId: 'item-liquid-plain-1',
    visitId: 'v1',
    drugId: 'drug-liquid-plain',
    drugName: 'アンブロキソール塩酸塩シロップ0.3%',
    amount: 10,
    days: 3,
    unitText: 'mL',
    usage: '1日3回毎食後',
    dosageCategory: 'internal' as const
  };

  const element = React.createElement(LiquidLabelSheetPrint, {
    patientData: dummyPatientData,
    liquidItems: [plainSyrupItem],
    pharmacyInfo: dummyPharmacyInfo,
    pharmacyAddressLine: dummyPharmacyInfo.address,
    currentDateStr: '2026/09/05',
    renderIdentityMark: () => React.createElement('span', null, 'MARK')
  });

  const html = renderToStaticMarkup(element);

  assert.ok(html.includes('30 mL'), '全量 30 mL が含まれること');
  assert.ok(!html.includes('調剤量'), '換算がない明細では調剤量の併記が出ないこと');
});

test('OintmentLabelSheetPrint renders total amount 14 枚 (not 196) for tape with undefined dosageCategory (PR-E2)', () => {
  const tapeItem = {
    itemId: 'item-tape-1',
    visitId: 'v1',
    drugId: 'drug-tape-1',
    drugName: 'モーラステープ20mg',
    amount: 14,
    days: 14,
    unitText: '枚',
    usage: '1日1回患部に貼る'
    // dosageCategory is intentionally undefined
  };

  const element = React.createElement(OintmentLabelSheetPrint, {
    patientData: dummyPatientData,
    ointmentItems: [tapeItem],
    pharmacyInfo: dummyPharmacyInfo,
    pharmacyAddressLine: dummyPharmacyInfo.address,
    currentDateStr: '2026/09/06',
    renderIdentityMark: () => React.createElement('span', null, 'MARK')
  });

  const html = renderToStaticMarkup(element);

  assert.ok(html.includes('全量'), '全量ラベルが含まれること');
  assert.ok(html.includes('14 枚'), '外用テープ剤の全量 14 枚 がそのまま含まれること');
  assert.ok(!html.includes('196 枚'), '14枚 * 14日 = 196 枚 に過大乗算されていないこと');
});

test('MedicineBagPrint renders external-bag class and 外用薬 ribbon for tape item (PR-E3)', () => {
  const tapeItem = {
    itemId: 'item-tape-bag-1',
    visitId: 'v1',
    drugId: 'drug-tape-1',
    drugName: 'モーラステープ20mg',
    amount: 14,
    days: 14,
    unitText: '枚',
    usage: '1日1回患部に貼る'
  };

  const usage = '1日1回患部に貼る';
  const element = React.createElement(MedicineBagPrint, {
    patientData: dummyPatientData,
    groupedForBags: {
      [usage]: [tapeItem]
    },
    pharmacyInfo: dummyPharmacyInfo,
    pharmacyAddressLine: dummyPharmacyInfo.address,
    receiptRunId: 'RUN-001',
    dispensingDateStr: '2026/09/06',
    renderIdentityMark: () => React.createElement('span', null, 'MARK')
  });

  const html = renderToStaticMarkup(element);

  // external-bag クラスを持ち、リボンに「外用薬」が出ること（「内服薬」でないこと）
  assert.ok(html.includes('external-bag'), 'テープ剤の薬袋は external-bag クラスを持つこと');
  assert.ok(!html.includes('internal-bag'), 'テープ剤の薬袋に internal-bag クラスが付かないこと');
  assert.ok(html.includes('外用薬'), 'リボンに「外用薬」が含まれること');
  assert.ok(!html.includes('内服薬'), 'リボンに「内服薬」が含まれないこと');
});

test('B-1: getDispensingAmountText and getDispensingTotalAmountText return drug-price unit equivalents only when unit conversion exists', () => {
  const convertedDaily = {
    amount: 750,
    days: 14,
    unitText: 'mL',
    dosageCategory: 'internal' as const,
    electronicUnitConversion: {
      conversionFactor: '250',
      masterUnitText: 'mL',
      prescribedAmount: '3',
      prescribedUnitText: '缶'
    }
  };
  assert.equal(getDispensingAmountText(convertedDaily), '750 mL');
  assert.equal(getDispensingTotalAmountText(convertedDaily), '10500 mL');

  // item.unitText が空でも masterUnitText があればそれを使う（自前単位補完はしない）
  const masterUnitFallback = {
    amount: 75,
    days: 14,
    dosageCategory: 'external' as const,
    electronicUnitConversion: {
      conversionFactor: '25',
      masterUnitText: 'g',
      prescribedAmount: '3',
      prescribedUnitText: '本'
    }
  };
  assert.equal(getDispensingAmountText(masterUnitFallback), '75 g');
  assert.equal(getDispensingTotalAmountText(masterUnitFallback), '75 g');

  // 換算なしでは空文字
  assert.equal(getDispensingAmountText({ amount: 3, days: 7, unitText: '錠', dosageCategory: 'internal' }), '');
  assert.equal(getDispensingTotalAmountText({ amount: 3, days: 7, unitText: '錠', dosageCategory: 'internal' }), '');
});

test('B-1: DispensingRecordPrint, MedicineBagPrint, OintmentLabelSheetPrint, MedicineNotebookStickerPrint, and DrugInfoItemCard co-display dispensing-unit equivalents on unit conversion and omit them otherwise', () => {
  const basePricing = {
    price: 10.1,
    drugPrice: 10.1,
    drugPriceResolution: { price: 10.1, source: 'current' as const },
    yjCode: '3259101S1028',
    isGeneric: false,
    isHighRisk: false,
    genericName: '',
    dispensedGenericName: ''
  };
  const convertedCanItem: PrintPrescriptionItem = {
    ...basePricing,
    itemId: 'item-b1-can',
    visitId: 'v-b1',
    rpNumber: 1,
    drugId: 'drug-ensure',
    drugName: 'エンシュア・リキッド',
    amount: 750,
    days: 14,
    unitText: 'mL',
    usage: '1日3回毎食後',
    dosageCategory: 'internal',
    electronicUnitConversion: {
      conversionFactor: '250',
      masterUnitText: 'mL',
      prescribedAmount: '3',
      prescribedUnitText: '缶'
    }
  };
  const convertedTubeItem: PrintPrescriptionItem = {
    ...basePricing,
    itemId: 'item-b1-tube',
    visitId: 'v-b1',
    rpNumber: 2,
    drugId: 'drug-ointment-tube',
    drugName: 'ヒルドイドソフト軟膏0.3% 25g',
    amount: 75,
    days: 14,
    unitText: 'g',
    usage: '1日2回患部に塗布',
    dosageCategory: 'external',
    electronicUnitConversion: {
      conversionFactor: '25',
      masterUnitText: 'g',
      prescribedAmount: '3',
      prescribedUnitText: '本'
    }
  };
  const plainItem: PrintPrescriptionItem = {
    ...basePricing,
    itemId: 'item-b1-plain',
    visitId: 'v-b1',
    rpNumber: 3,
    drugId: 'drug-plain',
    drugName: 'アムロジピン錠5mg',
    amount: 1,
    days: 14,
    unitText: '錠',
    usage: '1日1回朝食後',
    dosageCategory: 'internal'
  };

  const renderMark = () => React.createElement('span', null, 'MARK');

  // 1. 調剤録 (DispensingRecordPrint)
  const recordConvertedHtml = renderToStaticMarkup(
    React.createElement(DispensingRecordPrint, {
      patientData: dummyPatientData,
      visitData: { visitId: 'v-b1', institutionName: 'テスト内科' },
      prescriptionItems: [convertedCanItem, convertedTubeItem],
      pharmacyInfo: dummyPharmacyInfo,
      pharmacyAddressLine: dummyPharmacyInfo.address,
      receiptRunId: 'RUN-B1',
      currentDateStr: '2026/11/22',
      patientBirthDateStr: '2020/01/01',
      dispensingDateStr: '2026/11/22',
      prescriptionDateStr: '2026/11/22',
      electronicPrescriptionIds: [],
      electronicPrescriptionDispensingResultStatus: 'pending',
      electronicPrescriptionDispensingInformationSignatureText: '-',
      electronicPrescriptionDispensingInformationHpkiText: '-',
      electronicPrescriptionDispensingInformationHashText: '',
      electronicPrescriptionComments: [],
      electronicPrescriptionLaboratoryResults: [],
      isFirstItemInRp: () => true,
      renderIdentityMark: renderMark
    })
  );
  assert.ok(recordConvertedHtml.includes('1日量 3 缶'));
  assert.ok(recordConvertedHtml.includes('調剤実量 750 mL'));
  assert.ok(recordConvertedHtml.includes('全量 3 本'));
  assert.ok(recordConvertedHtml.includes('調剤実量 75 g'));

  const recordPlainHtml = renderToStaticMarkup(
    React.createElement(DispensingRecordPrint, {
      patientData: dummyPatientData,
      visitData: { visitId: 'v-b1', institutionName: 'テスト内科' },
      prescriptionItems: [plainItem],
      pharmacyInfo: dummyPharmacyInfo,
      pharmacyAddressLine: dummyPharmacyInfo.address,
      receiptRunId: 'RUN-B1',
      currentDateStr: '2026/11/22',
      patientBirthDateStr: '2020/01/01',
      dispensingDateStr: '2026/11/22',
      prescriptionDateStr: '2026/11/22',
      electronicPrescriptionIds: [],
      electronicPrescriptionDispensingResultStatus: 'pending',
      electronicPrescriptionDispensingInformationSignatureText: '-',
      electronicPrescriptionDispensingInformationHpkiText: '-',
      electronicPrescriptionDispensingInformationHashText: '',
      electronicPrescriptionComments: [],
      electronicPrescriptionLaboratoryResults: [],
      isFirstItemInRp: () => true,
      renderIdentityMark: renderMark
    })
  );
  assert.ok(!recordPlainHtml.includes('調剤実量'));

  // 2. 薬袋 (MedicineBagPrint)
  const bagConvertedHtml = renderToStaticMarkup(
    React.createElement(MedicineBagPrint, {
      patientData: dummyPatientData,
      groupedForBags: { '1日3回毎食後': [convertedCanItem] },
      pharmacyInfo: dummyPharmacyInfo,
      pharmacyAddressLine: dummyPharmacyInfo.address,
      receiptRunId: 'RUN-B1',
      dispensingDateStr: '2026/11/22',
      renderIdentityMark: renderMark
    })
  );
  assert.ok(bagConvertedHtml.includes('1日量 3 缶'));
  assert.ok(bagConvertedHtml.includes('調剤実量 750 mL'));

  const bagPlainHtml = renderToStaticMarkup(
    React.createElement(MedicineBagPrint, {
      patientData: dummyPatientData,
      groupedForBags: { '1日1回朝食後': [plainItem] },
      pharmacyInfo: dummyPharmacyInfo,
      pharmacyAddressLine: dummyPharmacyInfo.address,
      receiptRunId: 'RUN-B1',
      dispensingDateStr: '2026/11/22',
      renderIdentityMark: renderMark
    })
  );
  assert.ok(!bagPlainHtml.includes('調剤実量'));

  // 3. 軟膏ラベル (OintmentLabelSheetPrint)
  const ointmentConvertedHtml = renderToStaticMarkup(
    React.createElement(OintmentLabelSheetPrint, {
      patientData: dummyPatientData,
      ointmentItems: [convertedTubeItem],
      pharmacyInfo: dummyPharmacyInfo,
      pharmacyAddressLine: dummyPharmacyInfo.address,
      currentDateStr: '2026/11/22',
      renderIdentityMark: renderMark
    })
  );
  assert.ok(ointmentConvertedHtml.includes('3 本'));
  assert.ok(ointmentConvertedHtml.includes('調剤量 75 g'));

  const ointmentPlainHtml = renderToStaticMarkup(
    React.createElement(OintmentLabelSheetPrint, {
      patientData: dummyPatientData,
      ointmentItems: [{ ...convertedTubeItem, electronicUnitConversion: undefined }],
      pharmacyInfo: dummyPharmacyInfo,
      pharmacyAddressLine: dummyPharmacyInfo.address,
      currentDateStr: '2026/11/22',
      renderIdentityMark: renderMark
    })
  );
  assert.ok(!ointmentPlainHtml.includes('調剤量'));

  // 4. お薬手帳シール (MedicineNotebookStickerPrint)
  const stickerConvertedHtml = renderToStaticMarkup(
    React.createElement(MedicineNotebookStickerPrint, {
      patientData: dummyPatientData,
      prescriptionItems: [convertedCanItem],
      pharmacyInfo: dummyPharmacyInfo,
      dispensingDateStr: '2026/11/22',
      renderIdentityMark: renderMark
    })
  );
  assert.ok(stickerConvertedHtml.includes('3 缶'));
  assert.ok(stickerConvertedHtml.includes('調剤実量 750 mL'));

  const stickerPlainHtml = renderToStaticMarkup(
    React.createElement(MedicineNotebookStickerPrint, {
      patientData: dummyPatientData,
      prescriptionItems: [plainItem],
      pharmacyInfo: dummyPharmacyInfo,
      dispensingDateStr: '2026/11/22',
      renderIdentityMark: renderMark
    })
  );
  assert.ok(!stickerPlainHtml.includes('調剤実量'));

  // 5. 薬剤情報提供文書 (DrugInfoItemCard)
  const noopAsync = async () => {};
  const drugInfoConvertedHtml = renderToStaticMarkup(
    React.createElement(DrugInfoItemCard, {
      item: convertedCanItem,
      idx: 0,
      medicationInfo: {
        drugName: convertedCanItem.drugName,
        source: 'approved_template',
        sourceRevisionDate: '2026-11-01',
        sideEffectText: '消化器症状',
        usageCautionText: '指示通り服用',
        officialSearchUrl: ''
      },
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
  assert.ok(drugInfoConvertedHtml.includes('3 缶'));
  assert.ok(drugInfoConvertedHtml.includes('調剤実量 750 mL'));

  const drugInfoPlainHtml = renderToStaticMarkup(
    React.createElement(DrugInfoItemCard, {
      item: plainItem,
      idx: 0,
      medicationInfo: {
        drugName: plainItem.drugName,
        source: 'approved_template',
        sourceRevisionDate: '2026-11-01',
        sideEffectText: 'めまい',
        usageCautionText: '指示通り服用',
        officialSearchUrl: ''
      },
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
  assert.ok(!drugInfoPlainHtml.includes('調剤実量'));
});


