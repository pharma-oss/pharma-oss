import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PatientBanner,
  buildPatientBannerSummaryDisplay,
  executePatientInsuranceSave,
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
  type EditablePublicInsurance
} from '@/lib/patient_public_insurance';
import type { PublicInsurance } from '@/db/types';
import { findOpeningTag } from '@/lib/test_support/html_disabled_tags';
import { renderMarkupWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';
import { FEATURE_AVAILABILITY } from '@/lib/feature_availability';

const DISABLED_ATTRIBUTE_PATTERN = /\sdisabled=""(?=[\s/>]|$)/;

function renderWithPatientBannerOverrides(overrides: {
  isModalOpen?: boolean;
  questionnaireRawText?: string;
  isQuestionnaireProcessing?: boolean;
  isSavingInsurance?: boolean;
  patientData?: unknown;
  isReading?: boolean;
  isReadingClinical?: boolean;
  mynaReaderState?: unknown;
  editCopaymentSupport?: unknown;
}): string {
  return renderMarkupWithReactUseStateMock(
    () =>
      React.createElement(PatientBanner, {
        patientAlerts: [],
        targetVisitId: 'test-visit-id',
        onOpenPicking: () => { }
      }),
    {
      componentName: 'PatientBanner',
      restoreAtCallIndex: 37,
      minCalls: 38,
      overrides: {
        ...(overrides.patientData !== undefined ? { 0: { value: overrides.patientData } } : {}),
        ...(overrides.isReading !== undefined ? { 2: { value: overrides.isReading } } : {}),
        ...(overrides.isReadingClinical !== undefined ? { 3: { value: overrides.isReadingClinical } } : {}),
        ...(overrides.mynaReaderState !== undefined ? { 4: { value: overrides.mynaReaderState } } : {}),
        ...(overrides.isModalOpen !== undefined ? { 7: { value: overrides.isModalOpen } } : {}),
        ...(overrides.questionnaireRawText !== undefined ? { 26: { value: overrides.questionnaireRawText } } : {}),
        ...(overrides.isQuestionnaireProcessing !== undefined ? { 36: { value: overrides.isQuestionnaireProcessing } } : {}),
        ...(overrides.isSavingInsurance !== undefined ? { 37: { value: overrides.isSavingInsurance } } : {})
      },
      onUseState: ({ callIndex, initialState }) => {
        if (callIndex === 21 && overrides.editCopaymentSupport !== undefined) {
          assert.equal(
            typeof initialState,
            'object',
            'PatientBanner call 21 initial state must be an object'
          );
          assert.ok(
            initialState !== null && 'highCostLimitCategory' in (initialState as Record<string, unknown>),
            'PatientBanner call 21 initial state must be EditableCopaymentSupport'
          );
          return [
            {
              ...(initialState as Record<string, unknown>),
              ...(overrides.editCopaymentSupport as Record<string, unknown>)
            },
            () => { }
          ];
        }
        return undefined;
      }
    }
  );
}

test('PatientBanner renders initial fallback state without crashing and contains edit action', () => {
  const element = React.createElement(PatientBanner, {
    patientAlerts: [],
    targetVisitId: null,
    onOpenPicking: () => { }
  });

  const html = renderToStaticMarkup(element);
  assert.ok(html.includes('患者未選択'), 'Must show fallback when patient is unselected');
  assert.ok(html.includes('患者・保険・公費編集'), 'Must expose patient & insurance edit button');
  assert.ok(html.includes('ピッキング支援'), 'Must expose picking button');
  assert.ok(html.includes('マイナ読取'), 'Must expose myna card reader button');
});

test('PatientBanner keeps the Myna read button off until the connection is confirmed', () => {
  const html = renderToStaticMarkup(
    React.createElement(PatientBanner, { patientAlerts: [], targetVisitId: null, onOpenPicking: () => { } })
  );
  const mynaButton = html.match(/<button[^>]*data-testid="myna-read-button"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';
  assert.ok(mynaButton.length > 0, 'the Myna button must be rendered');
  assert.ok(/\sdisabled(=""|\s|>)/.test(mynaButton), 'the Myna button must be disabled before the availability check finishes');
  assert.ok(mynaButton.includes('マイナ読取'));
});

test('PatientBanner disables the edit action while no patient is loaded, so the edit modal cannot open for an unselected patient', () => {
  const html = renderToStaticMarkup(
    React.createElement(PatientBanner, { patientAlerts: [], targetVisitId: null, onOpenPicking: () => { } })
  );
  const editButton = html.match(/<button[^>]*class="btn-edit-insurance[^"]*"[^>]*>/)?.[0] ?? '';
  assert.ok(editButton.length > 0, 'edit button must be rendered');
  assert.ok(/\sdisabled(=""|\s|>)/.test(editButton), 'edit button must be disabled without a patient');
  // マイナ読取ボタンの包みにも同じ title があるので、編集ボタンの直前の包みだけを取り出して確かめる
  const wrapper = html.match(/<span[^>]*>(?=<button[^>]*class="btn-edit-insurance)/)?.[0] ?? '';
  assert.ok(wrapper.includes(`title="${PATIENT_BANNER_EDIT_UNSELECTED_TITLE}"`), 'tooltip must explain why it is disabled');
  assert.ok(wrapper.includes('data-disabled="true"'), 'wrapper must mark the disabled state for the not-allowed cursor');
});

test('PatientBanner enables the edit action and clears data-disabled when a patient is loaded without errors', () => {
  const html = renderWithPatientBannerOverrides({
    patientData: {
      patientId: 'pt_loaded_1',
      name: '佐藤 花子',
      kana: 'サトウ ハナコ',
      birthDate: '1985-04-01'
    }
  });
  const editButton = html.match(/<button[^>]*class="btn-edit-insurance[^"]*"[^>]*>/)?.[0] ?? '';
  assert.ok(editButton.length > 0, 'edit button must be rendered');
  assert.ok(!DISABLED_ATTRIBUTE_PATTERN.test(editButton), 'edit button must be enabled when a patient is loaded');
  const wrapper = html.match(/<span[^>]*>(?=<button[^>]*class="btn-edit-insurance)/)?.[0] ?? '';
  assert.ok(wrapper.includes(`title="${PATIENT_BANNER_EDIT_TITLE}"`), 'tooltip must show active edit title');
  assert.ok(!wrapper.includes('data-disabled="true"'), 'wrapper must not mark data-disabled when enabled');
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

test('pins questionnaire inputs, re-extract button, and save insurance button as disabled when isQuestionnaireProcessing is true', () => {
  const html = renderWithPatientBannerOverrides({
    isModalOpen: true,
    isQuestionnaireProcessing: true,
    questionnaireRawText: 'アレルギー: 既往あり'
  });

  const cameraInputTag = findOpeningTag(html, 'data-testid="emr-initial-questionnaire-camera-input"', 'input');
  assert.ok(
    DISABLED_ATTRIBUTE_PATTERN.test(cameraInputTag),
    'Camera input should be disabled during questionnaire processing'
  );

  const imageInputTag = findOpeningTag(html, 'data-testid="emr-initial-questionnaire-image-input"', 'input');
  assert.ok(
    DISABLED_ATTRIBUTE_PATTERN.test(imageInputTag),
    'Image input should be disabled during questionnaire processing'
  );

  const reextractBtnTag = findOpeningTag(html, '全文から再抽出', 'button');
  assert.ok(
    DISABLED_ATTRIBUTE_PATTERN.test(reextractBtnTag),
    'Re-extract button should be disabled during questionnaire processing'
  );

  const saveBtnTag = findOpeningTag(html, 'OCR中...', 'button');
  assert.ok(
    DISABLED_ATTRIBUTE_PATTERN.test(saveBtnTag),
    'Save insurance button should be disabled during questionnaire processing'
  );
  assert.ok(html.includes('OCR中...'), 'Save button label should indicate OCR in-flight');
});

test('pins questionnaire inputs, re-extract button, and save insurance button as enabled when idle with questionnaire text', () => {
  const html = renderWithPatientBannerOverrides({
    isModalOpen: true,
    isQuestionnaireProcessing: false,
    questionnaireRawText: 'アレルギー: なし'
  });

  const cameraInputTag = findOpeningTag(html, 'data-testid="emr-initial-questionnaire-camera-input"', 'input');
  assert.ok(
    !DISABLED_ATTRIBUTE_PATTERN.test(cameraInputTag),
    'Camera input should be enabled when idle'
  );

  const imageInputTag = findOpeningTag(html, 'data-testid="emr-initial-questionnaire-image-input"', 'input');
  assert.ok(
    !DISABLED_ATTRIBUTE_PATTERN.test(imageInputTag),
    'Image input should be enabled when idle'
  );

  const reextractBtnTag = findOpeningTag(html, '全文から再抽出', 'button');
  assert.ok(
    !DISABLED_ATTRIBUTE_PATTERN.test(reextractBtnTag),
    'Re-extract button should be enabled when text is present and idle'
  );

  const saveBtnTag = findOpeningTag(html, '保存して適用', 'button');
  assert.ok(
    !DISABLED_ATTRIBUTE_PATTERN.test(saveBtnTag),
    'Save insurance button should be enabled when idle'
  );
  assert.ok(html.includes('保存して適用'), 'Save button label should indicate normal ready state');
});

test('pins questionnaire re-extract button as disabled when questionnaire raw text is empty even if idle', () => {
  const html = renderWithPatientBannerOverrides({
    isModalOpen: true,
    isQuestionnaireProcessing: false,
    questionnaireRawText: ''
  });

  const reextractBtnTag = findOpeningTag(html, '全文から再抽出', 'button');
  assert.ok(
    DISABLED_ATTRIBUTE_PATTERN.test(reextractBtnTag),
    'Re-extract button should be disabled when questionnaire raw text is empty'
  );
});

test('pins Myna read button and wrapper as disabled when isReading is true even if reader is available', () => {
  const html = renderWithPatientBannerOverrides({
    isReading: true,
    patientData: { name: '山田 太郎' },
    mynaReaderState: { status: 'ready', available: true }
  });

  const buttonTag = findOpeningTag(html, 'data-testid="myna-read-button"', 'button');
  assert.ok(
    DISABLED_ATTRIBUTE_PATTERN.test(buttonTag),
    'Myna read button must be disabled when isReading is true'
  );

  const wrapperTag = findOpeningTag(html, 'data-testid="myna-read-button"', 'span');
  assert.ok(
    wrapperTag.includes('data-disabled="true"'),
    'Myna wrapper must have data-disabled="true" when isReading is true'
  );
  assert.ok(
    wrapperTag.includes('title="読み取り中..."'),
    'Myna wrapper title must be "読み取り中..." when isReading is true'
  );
  assert.ok(
    html.includes('読取中...'),
    'Button label must indicate reading in-flight state'
  );
});

test('pins Myna read button and wrapper as enabled when reader is available and not reading with patient loaded', () => {
  const html = renderWithPatientBannerOverrides({
    isReading: false,
    patientData: { name: '山田 太郎' },
    mynaReaderState: { status: 'ready', available: true }
  });

  const buttonTag = findOpeningTag(html, 'data-testid="myna-read-button"', 'button');
  assert.ok(
    !DISABLED_ATTRIBUTE_PATTERN.test(buttonTag),
    'Myna read button must be enabled when reader is available, patient is loaded, and not reading'
  );

  const wrapperTag = findOpeningTag(html, 'data-testid="myna-read-button"', 'span');
  assert.ok(
    !wrapperTag.includes('data-disabled="true"'),
    'Myna wrapper must not have data-disabled="true" when available and ready'
  );
  assert.ok(
    html.includes('マイナ読取'),
    'Button label must show idle "マイナ読取"'
  );
});

test('pins Myna read button and wrapper as disabled when patientData is null even if reader is ready', () => {
  const html = renderWithPatientBannerOverrides({
    isReading: false,
    patientData: null,
    mynaReaderState: { status: 'ready', available: true }
  });

  const buttonTag = findOpeningTag(html, 'data-testid="myna-read-button"', 'button');
  assert.ok(
    DISABLED_ATTRIBUTE_PATTERN.test(buttonTag),
    'Myna read button must be disabled when patientData is null'
  );

  const wrapperTag = findOpeningTag(html, 'data-testid="myna-read-button"', 'span');
  assert.ok(
    wrapperTag.includes('data-disabled="true"'),
    'Myna wrapper must have data-disabled="true" when patientData is null'
  );
  assert.ok(
    wrapperTag.includes('title="患者を選択してください"'),
    'Myna wrapper title must be "患者を選択してください" when patientData is null'
  );
});

test('pins Myna read button and wrapper as disabled when reader is unavailable even with patient loaded', () => {
  const html = renderWithPatientBannerOverrides({
    isReading: false,
    patientData: { name: '山田 太郎' },
    mynaReaderState: { status: 'ready', available: false, reason: 'カードリーダーが見つかりません。' }
  });

  const buttonTag = findOpeningTag(html, 'data-testid="myna-read-button"', 'button');
  assert.ok(
    DISABLED_ATTRIBUTE_PATTERN.test(buttonTag),
    'Myna read button must be disabled when reader is unavailable'
  );

  const wrapperTag = findOpeningTag(html, 'data-testid="myna-read-button"', 'span');
  assert.ok(
    wrapperTag.includes('data-disabled="true"'),
    'Myna wrapper must have data-disabled="true" when reader is unavailable'
  );
  assert.ok(
    wrapperTag.includes('title="カードリーダーが見つかりません。"'),
    'Myna wrapper title must reflect unavailable reason'
  );
});

test('pins Myna clinical import button as disabled while feature is unimplemented and modal is open', () => {
  const html = renderWithPatientBannerOverrides({
    isModalOpen: true,
    isReadingClinical: false,
    patientData: { name: '山田 太郎' }
  });

  const buttonTag = findOpeningTag(html, 'data-testid="myna-clinical-import-button"', 'button');
  assert.ok(
    DISABLED_ATTRIBUTE_PATTERN.test(buttonTag),
    'Clinical import button must be disabled when feature is unimplemented'
  );
  assert.ok(
    buttonTag.includes(`title="${FEATURE_AVAILABILITY.mynaClinicalImport.unavailableReason}"`),
    'Clinical import button must set unavailable reason as title'
  );
  assert.ok(
    html.includes('特定健診・薬剤履歴を取込（未実装）'),
    'Button label must contain unimplemented badge text'
  );
  assert.ok(
    html.includes('data-testid="myna-clinical-unimplemented-note"'),
    'Unimplemented note must be rendered next to button'
  );
});

test('pins Myna clinical import button as disabled when reading or patient is null, and enabled when ready', () => {
  const feature = FEATURE_AVAILABILITY.mynaClinicalImport as { implemented: boolean };
  const origImplemented = feature.implemented;
  feature.implemented = true;
  try {
    const readingHtml = renderWithPatientBannerOverrides({
      isModalOpen: true,
      isReadingClinical: true,
      patientData: { name: '山田 太郎' }
    });
    const readingBtn = findOpeningTag(readingHtml, 'data-testid="myna-clinical-import-button"', 'button');
    assert.ok(
      DISABLED_ATTRIBUTE_PATTERN.test(readingBtn),
      'Clinical import button must be disabled while isReadingClinical is true'
    );
    assert.ok(
      readingHtml.includes('取込中...'),
      'Button label must indicate reading state'
    );

    const noPatientHtml = renderWithPatientBannerOverrides({
      isModalOpen: true,
      isReadingClinical: false,
      patientData: null
    });
    const noPatientBtn = findOpeningTag(noPatientHtml, 'data-testid="myna-clinical-import-button"', 'button');
    assert.ok(
      DISABLED_ATTRIBUTE_PATTERN.test(noPatientBtn),
      'Clinical import button must be disabled when patientData is null'
    );

    const readyHtml = renderWithPatientBannerOverrides({
      isModalOpen: true,
      isReadingClinical: false,
      patientData: { name: '山田 太郎' }
    });
    const readyBtn = findOpeningTag(readyHtml, 'data-testid="myna-clinical-import-button"', 'button');
    assert.ok(
      !DISABLED_ATTRIBUTE_PATTERN.test(readyBtn),
      'Clinical import button must be enabled when ready with patient loaded'
    );
    assert.ok(
      readyHtml.includes('特定健診・薬剤履歴を取込'),
      'Button label must be clean without unimplemented badge'
    );
  } finally {
    feature.implemented = origImplemented;
  }
});

test('pins high cost multiple occurrence checkbox disabled state based on highCostLimitCategory', () => {
  const disabledHtml = renderWithPatientBannerOverrides({
    isModalOpen: true,
    editCopaymentSupport: { highCostLimitCategory: '' }
  });
  const disabledCheckbox = findOpeningTag(disabledHtml, 'data-testid="m-high-cost-multiple"', 'input');
  assert.ok(
    DISABLED_ATTRIBUTE_PATTERN.test(disabledCheckbox),
    'High-cost multiple occurrence checkbox must be disabled when highCostLimitCategory is empty'
  );

  const enabledHtml = renderWithPatientBannerOverrides({
    isModalOpen: true,
    editCopaymentSupport: { highCostLimitCategory: 'ウ' }
  });
  const enabledCheckbox = findOpeningTag(enabledHtml, 'data-testid="m-high-cost-multiple"', 'input');
  assert.ok(
    !DISABLED_ATTRIBUTE_PATTERN.test(enabledCheckbox),
    'High-cost multiple occurrence checkbox must be enabled when highCostLimitCategory is specified'
  );
});

test('pins reduction certificate number input disabled state based on reductionCode', () => {
  const disabledHtml = renderWithPatientBannerOverrides({
    isModalOpen: true,
    editCopaymentSupport: { reductionCode: '' }
  });
  const disabledInput = findOpeningTag(disabledHtml, 'data-testid="m-reduction-cert"', 'input');
  assert.ok(
    DISABLED_ATTRIBUTE_PATTERN.test(disabledInput),
    'Reduction certificate number input must be disabled when reductionCode is empty'
  );

  const enabledHtml = renderWithPatientBannerOverrides({
    isModalOpen: true,
    editCopaymentSupport: { reductionCode: '1' }
  });
  const enabledInput = findOpeningTag(enabledHtml, 'data-testid="m-reduction-cert"', 'input');
  assert.ok(
    !DISABLED_ATTRIBUTE_PATTERN.test(enabledInput),
    'Reduction certificate number input must be enabled when reductionCode is specified'
  );
});

test('executePatientInsuranceSave keeps modal open on missing patient or patch failure and succeeds only after writes complete', async () => {
  let missingCalled = 0;
  let errorCalled = 0;
  let successCalled = 0;
  let visitPatchedEventCalled = 0;

  const missingResult = await executePatientInsuranceSave({
    findPatientDoc: async () => null,
    patientPatch: { name: '山田 太郎' },
    findVisitDoc: async () => null,
    onSuccess: () => { successCalled += 1; },
    onMissingPatient: () => { missingCalled += 1; },
    onError: () => { errorCalled += 1; }
  });
  assert.equal(missingResult, false);
  assert.equal(missingCalled, 1);
  assert.equal(successCalled, 0);
  assert.equal(errorCalled, 0);

  const patchErrorResult = await executePatientInsuranceSave({
    findPatientDoc: async () => ({
      patch: async () => {
        throw new Error('PATIENT_PATCH_FAILED');
      }
    }),
    patientPatch: { name: '山田 太郎' },
    findVisitDoc: async () => null,
    onSuccess: () => { successCalled += 1; },
    onMissingPatient: () => { missingCalled += 1; },
    onError: () => { errorCalled += 1; }
  });
  assert.equal(patchErrorResult, false);
  assert.equal(errorCalled, 1);
  assert.equal(successCalled, 0);

  const visitErrorResult = await executePatientInsuranceSave({
    findPatientDoc: async () => ({ patch: async () => ({}) }),
    patientPatch: { name: '山田 太郎' },
    questionnairePayload: { sourceType: 'manual', capturedAt: '2026-11-17T00:00:00.000Z' },
    findVisitDoc: async () => ({
      patch: async () => {
        throw new Error('VISIT_PATCH_FAILED');
      }
    }),
    onVisitPatched: () => { visitPatchedEventCalled += 1; },
    onSuccess: () => { successCalled += 1; },
    onMissingPatient: () => { missingCalled += 1; },
    onError: () => { errorCalled += 1; }
  });
  assert.equal(visitErrorResult, false);
  assert.equal(errorCalled, 2);
  assert.equal(visitPatchedEventCalled, 0);
  assert.equal(successCalled, 0);

  const okResult = await executePatientInsuranceSave({
    findPatientDoc: async () => ({ patch: async () => ({}) }),
    patientPatch: { name: '山田 太郎' },
    questionnairePayload: { sourceType: 'manual', capturedAt: '2026-11-17T00:00:00.000Z' },
    findVisitDoc: async () => ({ patch: async () => ({}) }),
    onVisitPatched: () => { visitPatchedEventCalled += 1; },
    onSuccess: () => { successCalled += 1; },
    onMissingPatient: () => { missingCalled += 1; },
    onError: () => { errorCalled += 1; }
  });
  assert.equal(okResult, true);
  assert.equal(visitPatchedEventCalled, 1);
  assert.equal(successCalled, 1);
  assert.equal(missingCalled, 1);
  assert.equal(errorCalled, 2);
});

test('pins save and cancel buttons in PatientBanner modal as disabled while isSavingInsurance is true', () => {
  const savingHtml = renderWithPatientBannerOverrides({
    isModalOpen: true,
    isSavingInsurance: true,
    isQuestionnaireProcessing: false
  });
  const cancelBtn = findOpeningTag(savingHtml, 'キャンセル', 'button');
  const saveBtn = findOpeningTag(savingHtml, '保存中...', 'button');
  assert.ok(DISABLED_ATTRIBUTE_PATTERN.test(cancelBtn), 'Cancel button must be disabled while isSavingInsurance is true');
  assert.ok(DISABLED_ATTRIBUTE_PATTERN.test(saveBtn), 'Save button must be disabled while isSavingInsurance is true');
  assert.ok(savingHtml.includes('保存中...'), 'Save button label must indicate saving state');

  const idleHtml = renderWithPatientBannerOverrides({
    isModalOpen: true,
    isSavingInsurance: false,
    isQuestionnaireProcessing: false
  });
  const idleCancelBtn = findOpeningTag(idleHtml, 'キャンセル', 'button');
  const idleSaveBtn = findOpeningTag(idleHtml, '保存して適用', 'button');
  assert.ok(!DISABLED_ATTRIBUTE_PATTERN.test(idleCancelBtn), 'Cancel button must be enabled when idle');
  assert.ok(!DISABLED_ATTRIBUTE_PATTERN.test(idleSaveBtn), 'Save button must be enabled when idle');
});

