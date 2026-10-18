import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PatientBanner,
  buildPatientBannerSummaryDisplay,
  getPatientBannerEditButtonState,
  PATIENT_BANNER_EDIT_LOAD_ERROR_TITLE,
  PATIENT_BANNER_EDIT_TITLE,
  PATIENT_BANNER_EDIT_UNSELECTED_TITLE,
  PATIENT_BANNER_LOAD_ERROR_SUBTITLE,
  PATIENT_BANNER_LOAD_ERROR_TITLE
} from './PatientBanner';
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

test('PatientBanner disables the edit action while no patient is loaded, so the edit modal cannot open for an unselected patient', () => {
  const html = renderToStaticMarkup(
    React.createElement(PatientBanner, { patientAlerts: [], targetVisitId: null, onOpenPicking: () => {} })
  );
  const editButton = html.match(/<button[^>]*class="btn-edit-insurance[^"]*"[^>]*>/)?.[0] ?? '';
  assert.ok(editButton.length > 0, 'edit button must be rendered');
  assert.ok(/\sdisabled(=""|\s|>)/.test(editButton), 'edit button must be disabled without a patient');
  // マイナ読取ボタンの包みにも同じ title があるので、編集ボタンの直前の包みだけを取り出して確かめる
  const wrapper = html.match(/<span[^>]*>(?=<button[^>]*class="btn-edit-insurance)/)?.[0] ?? '';
  assert.ok(wrapper.includes(`title="${PATIENT_BANNER_EDIT_UNSELECTED_TITLE}"`), 'tooltip must explain why it is disabled');
  assert.ok(wrapper.includes('data-disabled="true"'), 'wrapper must mark the disabled state for the not-allowed cursor');
});

test('getPatientBannerEditButtonState keeps the edit action off while the patient failed to load, and on only for a loaded patient', () => {
  assert.deepStrictEqual(getPatientBannerEditButtonState(null, true), {
    isDisabled: true,
    title: PATIENT_BANNER_EDIT_LOAD_ERROR_TITLE
  });
  // 取得失敗が優先される(患者データが残っていても編集させない)
  assert.deepStrictEqual(getPatientBannerEditButtonState({ name: '佐藤 花子' }, true), {
    isDisabled: true,
    title: PATIENT_BANNER_EDIT_LOAD_ERROR_TITLE
  });
  assert.deepStrictEqual(getPatientBannerEditButtonState(null, false), {
    isDisabled: true,
    title: PATIENT_BANNER_EDIT_UNSELECTED_TITLE
  });
  assert.deepStrictEqual(getPatientBannerEditButtonState({ name: '佐藤 花子' }, false), {
    isDisabled: false,
    title: PATIENT_BANNER_EDIT_TITLE
  });
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

test('buildPatientBannerSummaryDisplay returns error display when hasLoadError is true instead of unselected patient', () => {
  assert.deepStrictEqual(buildPatientBannerSummaryDisplay(null, null, true), {
    patientTitle: PATIENT_BANNER_LOAD_ERROR_TITLE,
    calcBirthDate: PATIENT_BANNER_LOAD_ERROR_SUBTITLE,
    patientInitials: '!'
  });
});

test('buildPatientBannerSummaryDisplay returns unselected state when patientData is null and hasLoadError is false', () => {
  assert.deepStrictEqual(buildPatientBannerSummaryDisplay(null, null, false), {
    patientTitle: '患者未選択',
    calcBirthDate: '生年月日未登録',
    patientInitials: '患'
  });
});

test('buildPatientBannerSummaryDisplay formats patient name, age, gender, and birthDate when patientData is present', () => {
  assert.deepStrictEqual(
    buildPatientBannerSummaryDisplay(
      { name: '佐藤 花子', birthDate: '1980-05-12', gender: 'female' },
      46,
      false
    ),
    {
      patientTitle: '佐藤 花子 (46歳 / 女性)',
      calcBirthDate: '1980/05/12生',
      patientInitials: '佐花'
    }
  );
});

test('buildPatientBannerSummaryDisplay prioritizes load error display even when patientData is provided', () => {
  const result = buildPatientBannerSummaryDisplay(
    { name: '佐藤 花子', birthDate: '1980-05-12', gender: 'female' },
    46,
    true
  );
  assert.deepStrictEqual(result, {
    patientTitle: PATIENT_BANNER_LOAD_ERROR_TITLE,
    calcBirthDate: PATIENT_BANNER_LOAD_ERROR_SUBTITLE,
    patientInitials: '!'
  });
  assert.strictEqual(result.patientTitle.includes('佐藤'), false);
  assert.strictEqual(result.patientTitle.includes('46'), false);
});

test('buildPatientBannerSummaryDisplay formats 0 years old without treating 0 as unknown age', () => {
  const result = buildPatientBannerSummaryDisplay(
    { name: '佐藤 花子', birthDate: '2026-01-01', gender: 'female' },
    0,
    false
  );
  assert.strictEqual(result.patientTitle, '佐藤 花子 (0歳 / 女性)');
});

test('buildPatientBannerSummaryDisplay formats unknown age when calcAge is null or undefined', () => {
  const nullAge = buildPatientBannerSummaryDisplay(
    { name: '佐藤 花子', birthDate: '1980-05-12', gender: 'female' },
    null,
    false
  );
  assert.strictEqual(nullAge.patientTitle, '佐藤 花子 (年齢不明 / 女性)');

  const undefinedAge = buildPatientBannerSummaryDisplay(
    { name: '佐藤 花子', birthDate: '1980-05-12', gender: 'female' },
    undefined,
    false
  );
  assert.strictEqual(undefinedAge.patientTitle, '佐藤 花子 (年齢不明 / 女性)');
});

test('buildPatientBannerSummaryDisplay formats male gender and omits gender segment when gender is empty', () => {
  const male = buildPatientBannerSummaryDisplay(
    { name: '佐藤 花子', birthDate: '1980-05-12', gender: 'male' },
    46,
    false
  );
  assert.strictEqual(male.patientTitle, '佐藤 花子 (46歳 / 男性)');

  const noGender = buildPatientBannerSummaryDisplay(
    { name: '佐藤 花子', birthDate: '1980-05-12', gender: '' },
    46,
    false
  );
  assert.strictEqual(noGender.patientTitle, '佐藤 花子 (46歳)');
});

