import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PatientBanner } from './PatientBanner';
import {
  buildPublicInsuranceBadgeList,
  toEditablePublicInsurances,
  toPublicInsurances,
  getPublicInsuranceCategoryName,
  type EditablePublicInsurance
} from '@/lib/patient_public_insurance';
import type { PublicInsurance } from '@/db/types';

test('PatientBanner renders initial fallback state without crashing and contains edit action', () => {
  const element = React.createElement(PatientBanner, {
    patientAlerts: [],
    targetVisitId: null,
    onOpenPicking: () => {}
  });

  const html = renderToStaticMarkup(element);
  assert.ok(html.includes('患者未選択'), 'Must show fallback when patient is unselected');
  assert.ok(html.includes('患者・保険・公費編集'), 'Must expose patient & insurance edit button');
  assert.ok(html.includes('ピッキング支援'), 'Must expose picking button');
  assert.ok(html.includes('マイナ読取'), 'Must expose myna card reader button');
});

test('buildPublicInsuranceBadgeList formats multiple public badges and maps legal categories', () => {
  const sampleInsurances: PublicInsurance[] = [
    {
      provider: '54136018',
      recipient: '1234567',
      burdenRatio: 20
    },
    {
      provider: '21136018',
      recipient: '7654321',
      burdenRatio: 10
    },
    {
      provider: '80136018',
      recipient: '9999999',
      burdenRatio: 0
    }
  ];

  const badges = buildPublicInsuranceBadgeList(sampleInsurances, []);
  assert.strictEqual(badges.length, 3);
  assert.strictEqual(badges[0].categoryName, '指定難病');
  assert.strictEqual(badges[0].label, '指定難病 (20%)');
  assert.strictEqual(badges[1].categoryName, '精神通院医療');
  assert.strictEqual(badges[1].label, '精神通院医療 (10%)');
  assert.strictEqual(badges[2].categoryName, '地方単独公費');
  assert.strictEqual(badges[2].label, '地方単独公費 (0%)');
});

test('public insurance editor state preserves up to 4 items and discards empty slots', () => {
  const initial = toEditablePublicInsurances([
    { provider: '51136018', recipient: '1111111', burdenRatio: 10 }
  ]);
  assert.strictEqual(initial.length, 1);

  // ユーザーがフォームで第2公費を追加
  const added: EditablePublicInsurance[] = [
    ...initial,
    {
      id: 'test-slot-2',
      provider: '21136018',
      recipient: '2222222',
      burdenRatio: 10,
      startDate: '2026-06-01',
      endDate: '2027-05-31',
      monthlyLimitYen: '5000'
    },
    // 空のスロット
    {
      id: 'test-slot-3',
      provider: '',
      recipient: '',
      burdenRatio: 10,
      startDate: '',
      endDate: '',
      monthlyLimitYen: ''
    }
  ];

  const saved = toPublicInsurances(added);
  assert.strictEqual(saved.length, 2, 'Empty 3rd slot must be discarded while 1st and 2nd are saved');
  assert.strictEqual(saved[0].provider, '51136018');
  assert.strictEqual(saved[1].provider, '21136018');
  assert.strictEqual(saved[1].monthlyLimitYen, 5000);
});
