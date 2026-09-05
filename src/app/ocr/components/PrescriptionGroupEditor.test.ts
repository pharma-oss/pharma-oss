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
