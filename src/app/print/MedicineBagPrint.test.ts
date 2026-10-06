import { test } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MedicineBagPrint } from './components/MedicineBagPrint';
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

test('MedicineBagPrint renders internal medicine bag with accurate usage, timing badges, and safety strips', () => {
  const patientData = {
    name: '薬袋 太郎',
    patientId: 'PAT-BAG-001'
  };

  const internalItems = [
    {
      itemId: 'bag-item-1',
      drugName: 'アムロジピン錠5mg',
      dispensedDrug: 'アムロジピンOD錠5mg「トーワ」',
      amount: 1,
      days: 14,
      usage: '1日1回朝食後',
      usageSupplementText: '起床時血圧測定後に服用',
      dosageCategory: 'internal',
      unit: '錠'
    },
    {
      itemId: 'bag-item-2',
      drugName: 'アトルバスタチン錠10mg',
      amount: 1,
      days: 14,
      usage: '1日1回朝食後',
      dosageCategory: 'internal',
      unit: '錠'
    }
  ];

  const groupedForBags = {
    '1日1回朝食後': internalItems
  };

  const html = renderToStaticMarkup(
    React.createElement(MedicineBagPrint, {
      patientData,
      groupedForBags,
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: '東京都千代田区1-1-1',
      receiptRunId: 'BAG-2026-001',
      dispensingDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  // 1. 基本枠組みとデータ属性
  assert.ok(html.includes('data-testid="medicine-bag-doc"'), '薬袋ドキュメント要素が存在すること');
  assert.ok(html.includes('yakutai-doc internal-bag'), '内服薬袋クラスが付与されていること');
  assert.ok(html.includes('内服薬'), '内服薬種別ラベルが表示されていること');
  assert.ok(html.includes('おくすり袋'), 'おくすり袋タイトルが表示されていること');

  // 2. ヘッダー情報（受付番号、調剤日、患者名）
  assert.ok(html.includes('No. BAG-2026-001'), '受付番号が表示されていること');
  assert.ok(html.includes('調剤日 2026年10月6日'), '調剤日が表示されていること');
  assert.ok(html.includes('薬袋 太郎 様'), '患者名が表示されていること');

  // 3. 用法・用法補足・日数・タイミングバッジ
  assert.ok(html.includes('1日1回朝食後'), '用法が表示されていること');
  assert.ok(html.includes('（起床時血圧測定後に服用）'), '用法補足が表示されていること');
  assert.ok(html.includes('14日分'), '日数が表示されていること');
  assert.ok(html.includes('朝食後'), '朝食後タイミングバッジが表示されていること');

  // 4. 調剤薬品一覧（2種）
  assert.ok(html.includes('2 種'), '薬品種別数が正しく計算されていること');
  assert.ok(html.includes('アムロジピンOD錠5mg「トーワ」'), '代替調剤薬名が表示されていること');
  assert.ok(html.includes('アトルバスタチン錠10mg'), '処方薬名が表示されていること');

  // 5. 安全帯と薬局情報
  assert.ok(html.includes('氏名・使い方・日数'), '確認ガイダンスが表示されていること');
  assert.ok(html.includes('子どもの手の届かない場所'), '保管ガイダンスが表示されていること');
  assert.ok(html.includes('みらい調剤薬局'), '薬局名が表示されていること');
  assert.ok(html.includes('03-1234-5678'), '薬局電話番号が表示されていること');
  assert.ok(html.includes('調剤薬剤師: 薬剤 師範'), '調剤薬剤師が表示されていること');
  assert.ok(html.includes('1312345'), '薬局コードが表示されていること');
});

test('MedicineBagPrint renders external medicine bag with external-bag styling and unit counts', () => {
  const patientData = {
    name: '外用 花子',
    patientId: 'PAT-BAG-002'
  };

  const externalItems = [
    {
      itemId: 'bag-item-ext-1',
      drugName: 'ヒルドイドソフト軟膏0.3%',
      amount: 50,
      days: 0,
      usage: '1日2回患部に塗布',
      dosageCategory: 'external',
      unit: 'g'
    }
  ];

  const groupedForBags = {
    '1日2回患部に塗布': externalItems
  };

  const html = renderToStaticMarkup(
    React.createElement(MedicineBagPrint, {
      patientData,
      groupedForBags,
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: '東京都千代田区1-1-1',
      receiptRunId: 'BAG-2026-002',
      dispensingDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  // 1. 外用薬袋特有のクラスとラベル
  assert.ok(html.includes('yakutai-doc external-bag'), '外用薬袋クラスが付与されていること');
  assert.ok(html.includes('外用'), '外用ラベルが表示されていること');
  assert.ok(html.includes('外用花子 様') || html.includes('外用 花子 様'), '患者名が表示されていること');

  // 2. 薬品名と分量
  assert.ok(html.includes('ヒルドイドソフト軟膏0.3%'), '外用薬品名が表示されていること');
  assert.ok(html.includes('1日2回患部に塗布'), '用法が表示されていること');
});
