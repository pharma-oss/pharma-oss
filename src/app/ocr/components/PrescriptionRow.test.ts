import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrescriptionRow } from './PrescriptionRow';
import type { Prescription } from '../types';

const basePrescription: Prescription = {
  id: 'item-1',
  rpId: 'rp-1',
  drugCode: '620000001',
  drugName: 'アムロジピン錠５ｍｇ',
  dispensedDrug: 'アムロジピン錠５ｍｇ「サワイ」',
  dispensedDrugCode: '622290901',
  changeReason: '',
  amount: '1',
  usage: '1日1回朝食後',
  days: '14'
};

test('PrescriptionRow renders unit stack with label and unit input field containing unitText value', () => {
  const prescriptionWithUnit: Prescription = {
    ...basePrescription,
    unitText: 'カプセル',
    unitCode: '003'
  };

  const element = React.createElement(PrescriptionRow, {
    prescription: prescriptionWithUnit,
    index: 0,
    onChange: () => {},
    onOpenDrugSearch: () => {},
    onToggleIppoka: () => {},
    onToggleCrushed: () => {},
    onToggleReceiptRemark: () => {}
  });

  const html = renderToStaticMarkup(element);

  // 肯定アサート：単位ラベル、aria-label、クラス、値が実HTMLに正しく含まれること
  assert.ok(html.includes('<span class="field-label">単位</span>'), 'field-label "単位" が含まれること');
  assert.ok(html.includes('aria-label="単位 1"'), 'aria-label="単位 1" を持つ input が含まれること');
  assert.ok(html.includes('class="unit-text"'), 'class="unit-text" が含まれること');
  assert.ok(html.includes('value="カプセル"'), 'unitText の値 "カプセル" が input value に反映されていること');
  assert.ok(html.includes('placeholder="単位"'), 'placeholder="単位" が含まれること');
});

test('PrescriptionRow renders empty value in unit input field when unitText is undefined', () => {
  const prescriptionWithoutUnit: Prescription = {
    ...basePrescription,
    unitText: undefined,
    unitCode: undefined
  };

  const element = React.createElement(PrescriptionRow, {
    prescription: prescriptionWithoutUnit,
    index: 1,
    onChange: () => {},
    onOpenDrugSearch: () => {},
    onToggleIppoka: () => {},
    onToggleCrushed: () => {},
    onToggleReceiptRemark: () => {}
  });

  const html = renderToStaticMarkup(element);

  assert.ok(html.includes('aria-label="単位 2"'), 'aria-label="単位 2" を持つ input が含まれること');
  assert.ok(html.includes('value=""'), 'unitText 未設定時は value="" として安全に描画されること');
});
