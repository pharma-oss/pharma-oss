import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrescriptionGroupEditor } from './PrescriptionGroupEditor';
import type { PrescriptionGroup } from '../types';

const mockGroup: PrescriptionGroup = {
  rpId: 'rp-1',
  startIndex: 0,
  usage: '1日1回朝食後',
  usageSupplementText: '',
  days: '14',
  rpComment: '',
  prescriptions: [
    {
      id: 'item-1',
      rpId: 'rp-1',
      drugCode: '620000001',
      drugName: 'アムロジピン錠５ｍｇ',
      dispensedDrug: '',
      dispensedDrugCode: '',
      changeReason: '',
      amount: '1',
      unitText: '錠',
      usage: '1日1回朝食後',
      days: '14'
    }
  ]
};

test('PrescriptionGroupEditor renders 4-column header matching prescription row layout', () => {
  const element = React.createElement(PrescriptionGroupEditor, {
    group: mockGroup,
    groupIndex: 0,
    onChange: () => {},
    onOpenDrugSearch: () => {},
    onToggleIppoka: () => {},
    onToggleCrushed: () => {},
    onToggleReceiptRemark: () => {},
    onRpFieldChange: () => {},
    onRpDosageCategoryChange: () => {},
    onAddDrugToRp: () => {},
    onAddRpAfter: () => {},
    onDelete: () => {}
  });

  const html = renderToStaticMarkup(element);

  // 4列ヘッダーの各要素が含まれていること
  assert.ok(html.includes('class="prescription-row-header"'), 'prescription-row-header が存在すること');
  assert.ok(html.includes('<span>薬品名</span>'), '「薬品名」ヘッダーが存在すること');
  assert.ok(html.includes('<span class="header-amount">1日量</span>'), '「1日量」ヘッダー（.header-amount）が存在すること');
  assert.ok(html.includes('<span class="header-unit">単位</span>'), '「単位」ヘッダー（.header-unit）が存在すること');
});

test('PrescriptionGroupEditor renders usage selector button and readonly input without datalist', () => {
  const element = React.createElement(PrescriptionGroupEditor, {
    group: mockGroup,
    groupIndex: 0,
    onChange: () => {},
    onOpenDrugSearch: () => {},
    onToggleIppoka: () => {},
    onToggleCrushed: () => {},
    onToggleReceiptRemark: () => {},
    onRpFieldChange: () => {},
    onRpDosageCategoryChange: () => {},
    onAddDrugToRp: () => {},
    onAddRpAfter: () => {},
    onDelete: () => {}
  });

  const html = renderToStaticMarkup(element);

  // datalist は撤去されていること
  assert.equal(html.includes('<datalist'), false, 'datalist が撤去されていること');

  // 用法欄は readonly input として描画されること
  assert.ok(html.includes('readonly=""') || html.includes('readonly'), '用法欄が readonly であること');
  assert.ok(html.includes('用法を選ぶ'), '「用法を選ぶ」ボタンが存在すること');

  // value に 3桁コード+空白（例: "001 "）が含まれないこと
  const valueMatch = html.match(/class="[^"]*usage[^"]*"[^>]*value="([^"]*)"/);
  if (valueMatch) {
    assert.equal(/^\d{3}\s/.test(valueMatch[1]), false, '用法欄の value にコード番号が含まれないこと');
  }
});

test('PrescriptionGroupEditor displays mismatch warning badge when usage does not match dosage category while preserving value (G5-2)', () => {
  // 外用薬の Rp に内服用法が指定されているグループ
  const mismatchGroup = {
    ...mockGroup,
    usage: '１日３回朝昼夕食後　服用',
    prescriptions: [
      {
        ...mockGroup.prescriptions[0],
        drugName: 'ロキソニンテープ50mg',
        dosageCategory: 'external' as const,
        dosageCategorySource: 'manual' as const
      }
    ]
  };

  const element = React.createElement(PrescriptionGroupEditor, {
    group: mismatchGroup,
    groupIndex: 0,
    onChange: () => {},
    onOpenDrugSearch: () => {},
    onToggleIppoka: () => {},
    onToggleCrushed: () => {},
    onToggleReceiptRemark: () => {},
    onRpFieldChange: () => {},
    onRpDosageCategoryChange: () => {},
    onAddDrugToRp: () => {},
    onAddRpAfter: () => {},
    onDelete: () => {}
  });

  const html = renderToStaticMarkup(element);

  // Rp ヘッダに不一致バッジが表示されること
  assert.ok(html.includes('rp-category-mismatch-badge'), 'ヘッダに不一致バッジが表示されること');
  assert.ok(html.includes('用法と調剤区分が不一致'), 'バッジテキストが含まれること');

  // 用法の値が消されずに保持されていること (G5-2)
  assert.ok(html.includes('value="１日３回朝昼夕食後　服用"'), '用法がクリアされず保持されていること');
});

