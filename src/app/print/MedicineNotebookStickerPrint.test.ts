import { test } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { stripStyleBlocks } from '@/lib/test_support/html_disabled_tags';
import { MedicineNotebookStickerPrint } from './components/MedicineNotebookStickerPrint';
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

test('MedicineNotebookStickerPrint renders handbook sticker with drug info, dose, days, and timing badges', () => {
  const patientData = {
    name: '手帳 花子',
    patientId: 'PAT-STICKER-001'
  };

  const prescriptionItems = [
    {
      itemId: 'sticker-item-1',
      drugName: 'アムロジピン錠5mg',
      dispensedDrug: 'アムロジピンOD錠5mg「トーワ」',
      amount: 1,
      days: 14,
      usage: '1日1回朝食後',
      usageSupplementText: '起床時血圧測定後に服用',
      rpNumber: 1,
      unit: '錠'
    }
  ];

  const html = renderToStaticMarkup(
    React.createElement(MedicineNotebookStickerPrint, {
      patientData,
      prescriptionItems,
      pharmacyInfo: mockPharmacyInfo,
      dispensingDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  // 1. ルート要素とステッカー要素
  assert.ok(html.includes('data-testid="medicine-notebook-sticker-doc"'), 'お薬手帳シールドキュメント要素が存在すること');
  assert.ok(html.includes('handbook-sticker'), '手帳ステッカークラスが存在すること');

  // 2. ヘッダー情報（患者名、調剤日、Rp番号）
  assert.ok(html.includes('手帳 花子 様'), '患者名が表示されていること');
  assert.ok(html.includes('調剤日 2026年10月6日'), '調剤日が表示されていること');
  assert.ok(html.includes('Rp 1'), 'Rp番号が表示されていること');

  // 3. 薬品名・分量・日数
  assert.ok(html.includes('アムロジピンOD錠5mg「トーワ」'), '調剤薬品名が表示されていること');
  assert.ok(html.includes('14日分'), '日数が表示されていること');

  const cleanMarkup = stripStyleBlocks(html);

  // 4. 用法・用法補足・タイミングバッジ（用法文言ではなくバッジ行自体を検証する）
  assert.ok(html.includes('1日1回朝食後'), '用法が表示されていること');
  assert.ok(html.includes('（起床時血圧測定後に服用）'), '用法補足が表示されていること');
  assert.ok(
    cleanMarkup.includes('<div class="sticker-timing-row"><span>朝</span><span>食後</span></div>'),
    'タイミングバッジ行に朝・食後が表示されていること'
  );

  // 5. 薬局・担当薬剤師
  assert.ok(html.includes('みらい調剤薬局'), '薬局名が表示されていること');
  assert.ok(html.includes('03-1234-5678'), '薬局電話番号が表示されていること');
  assert.ok(html.includes('担当 薬剤 師範'), '担当薬剤師が表示されていること');
});

test('MedicineNotebookStickerPrint renders fallback timing badge when usage has no recognized timing keywords', () => {
  const html = renderToStaticMarkup(
    React.createElement(MedicineNotebookStickerPrint, {
      patientData: { name: '手帳 次郎', patientId: 'PAT-STICKER-002' },
      prescriptionItems: [
        {
          itemId: 'sticker-item-2',
          drugName: 'カロナール錠200',
          amount: 1,
          days: 5,
          usage: '疼痛時服用',
          rpNumber: 1,
          unitText: '錠'
        }
      ],
      pharmacyInfo: mockPharmacyInfo,
      dispensingDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  const cleanMarkup = stripStyleBlocks(html);
  assert.ok(
    cleanMarkup.includes('<div class="sticker-timing-row"><span>指示どおり</span></div>'),
    'タイミングキーワードなし時は「指示どおり」バッジが表示されること'
  );
});
