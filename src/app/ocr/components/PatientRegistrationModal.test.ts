import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import type { PharmacyDatabase } from '@/db/types';
import type { MynaReaderAvailabilityState } from '@/lib/myna_read_display';
import { EMPTY_PATIENT_REGISTRATION_FORM, type PatientRegistrationForm } from '@/lib/patient_registration';
import { findOpeningTag, listDisabledOpeningTags, stripStyleBlocks } from '@/lib/test_support/html_disabled_tags';
import { renderMarkupWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';
import { PatientRegistrationModal } from './PatientRegistrationModal';

const MYNA_BUTTON_MARKER = 'data-testid="registration-myna-read-button"';
const DISABLED_ATTRIBUTE_PATTERN = /\sdisabled=""(?=[\s/>]|$)/;

interface RenderOptions {
  initialForm?: PatientRegistrationForm;
  mynaReaderState?: MynaReaderAvailabilityState;
  isSubmitting?: boolean;
  isReadingMyna?: boolean;
}

function render(options: RenderOptions = {}): string {
  const html = renderMarkupWithReactUseStateMock(
    () =>
      React.createElement(PatientRegistrationModal, {
        db: {} as PharmacyDatabase,
        initialForm: options.initialForm ?? EMPTY_PATIENT_REGISTRATION_FORM,
        mynaReaderState: options.mynaReaderState ?? { status: 'ready', available: true },
        onClose: () => {},
        onRegistered: () => {},
        onSelectExisting: () => {}
      }),
    {
      componentName: 'PatientRegistrationModal',
      minCalls: 8,
      overrides: {
        4: {
          assertInitial: (initialState) =>
            assert.strictEqual(
              initialState,
              false,
              `Expected PatientRegistrationModal call 4 initial state to be false (isSubmitting), got ${String(initialState)}`
            ),
          ...(options.isSubmitting !== undefined ? { value: options.isSubmitting } : {})
        },
        5: {
          assertInitial: (initialState) =>
            assert.strictEqual(
              initialState,
              false,
              `Expected PatientRegistrationModal call 5 initial state to be false (isReadingMyna), got ${String(initialState)}`
            ),
          ...(options.isReadingMyna !== undefined ? { value: options.isReadingMyna } : {})
        }
      }
    }
  );
  return stripStyleBlocks(html);
}

describe('PatientRegistrationModal: 構造', () => {
  it('ダイアログとして描画され、見出しで名前が付く', () => {
    const html = render();
    const dialog = findOpeningTag(html, 'data-testid="patient-registration-modal"', 'div');
    assert.match(dialog, /role="dialog"/);
    assert.match(dialog, /aria-modal="true"/);
    assert.match(dialog, /aria-labelledby="patient-registration-title"/);
    assert.match(html, /<h3 id="patient-registration-title">新規患者の登録<\/h3>/);
  });

  it('氏名・フリガナ・生年月日・性別・保険者番号・記号・番号・負担割合の欄が、ラベルに結び付いて並ぶ', () => {
    const html = render();
    for (const [id, label] of [
      ['reg-name', '氏名'],
      ['reg-kana', 'フリガナ'],
      ['reg-birthDate', '生年月日'],
      ['reg-gender', '性別'],
      ['reg-insurerNumber', '保険者番号'],
      ['reg-insuredNumber', '記号・番号'],
      ['reg-burdenRatio', '負担割合']
    ]) {
      assert.match(html, new RegExp(`<label for="${id}">${label}`), `${label} のラベルが ${id} に結び付くこと`);
      assert.match(html, new RegExp(`id="${id}"`), `${id} の入力欄があること`);
    }
  });

  it('氏名・生年月日・性別だけが必須(aria-required)。保険情報とフリガナは必須にしない', () => {
    const html = render();
    for (const id of ['reg-name', 'reg-birthDate', 'reg-gender']) {
      const tag = findOpeningTag(html, `id="${id}"`, id === 'reg-gender' ? 'select' : 'input');
      assert.match(tag, /aria-required="true"/, `${id} は必須`);
    }
    for (const id of ['reg-kana', 'reg-insurerNumber', 'reg-insuredNumber']) {
      assert.doesNotMatch(findOpeningTag(html, `id="${id}"`, 'input'), /aria-required/, `${id} は必須にしない`);
    }
  });

  it('生年月日の欄は数字入力用で、半角8桁でも入力できると案内する', () => {
    const html = render();
    const tag = findOpeningTag(html, 'id="reg-birthDate"', 'input');
    assert.match(tag, /inputMode="numeric"/);
    assert.match(tag, /placeholder="例: 19850315"/);
    assert.match(html, /半角8桁\(例: 19850315\)でも入力できます/);
  });

  it('開いた直後は、エラーも重複の知らせも出さない', () => {
    const html = render();
    assert.doesNotMatch(html, /role="alert"/);
    assert.doesNotMatch(html, /patient-registration-duplicate/);
  });
});

describe('PatientRegistrationModal: 初期値', () => {
  it('渡した初期値(処方箋・マイナ読取で分かっている内容)が欄に入る', () => {
    const html = render({
      initialForm: {
        name: '山田 太郎',
        kana: 'ヤマダ タロウ',
        birthDate: '1985-03-15',
        gender: 'female',
        insurerNumber: '06139999',
        insuredNumber: '記号12 番号345',
        burdenRatio: '20'
      }
    });
    assert.match(findOpeningTag(html, 'id="reg-name"', 'input'), /value="山田 太郎"/);
    assert.match(findOpeningTag(html, 'id="reg-kana"', 'input'), /value="ヤマダ タロウ"/);
    assert.match(findOpeningTag(html, 'id="reg-birthDate"', 'input'), /value="1985-03-15"/);
    assert.match(findOpeningTag(html, 'id="reg-insurerNumber"', 'input'), /value="06139999"/);
    assert.match(findOpeningTag(html, 'id="reg-insuredNumber"', 'input'), /value="記号12 番号345"/);
    assert.match(html, /<option value="female" selected="">女性<\/option>/);
    assert.match(html, /<option value="20" selected="">2割<\/option>/);
  });

  it('何も渡さなければ、性別は未選択、負担割合は3割から始まる', () => {
    const html = render();
    assert.match(html, /<option value="" selected="">選択してください<\/option>/);
    assert.match(html, /<option value="30" selected="">3割<\/option>/);
  });
});

describe('PatientRegistrationModal: マイナ読み込みボタン', () => {
  it('使えるときは押せて、ラベルは「マイナ保険証から読み込む」', () => {
    const html = render({ mynaReaderState: { status: 'ready', available: true } });
    const button = findOpeningTag(html, MYNA_BUTTON_MARKER, 'button');
    assert.doesNotMatch(button, /\sdisabled=""/);
    assert.match(html, /マイナ保険証から読み込む/);
    assert.doesNotMatch(html, /registration-myna-unavailable-note/);
    // 押せないのは何もない(閉じる・キャンセル・登録も操作できる)
    assert.deepEqual(listDisabledOpeningTags(html), []);
  });

  it('接続先を確認している間は押せない', () => {
    const html = render({ mynaReaderState: { status: 'checking' } });
    const button = findOpeningTag(html, MYNA_BUTTON_MARKER, 'button');
    assert.match(button, /\sdisabled=""/);
    assert.deepEqual(listDisabledOpeningTags(html), [button]);
  });

  it('接続先が未設定なら押せず、理由と「手入力してください」を出す', () => {
    const html = render({ mynaReaderState: { status: 'ready', available: false, reason: '連携フォルダが未設定です。' } });
    const button = findOpeningTag(html, MYNA_BUTTON_MARKER, 'button');
    assert.match(button, /\sdisabled=""/);
    assert.match(button, /title="連携フォルダが未設定です。"/);
    assert.match(html, /マイナ保険証から読み込む（未設定）/);
    assert.deepEqual(listDisabledOpeningTags(html), [button]);
    const note = html.slice(html.indexOf('registration-myna-unavailable-note'));
    assert.match(note, /マイナ読取は使えません（連携フォルダが未設定です。）。手入力してください。/);
  });

  it('登録ボタンは、開いた直後は押せる送信ボタン', () => {
    const html = render();
    const submit = findOpeningTag(html, 'data-testid="patient-registration-submit"', 'button');
    assert.match(submit, /type="submit"/);
    assert.doesNotMatch(submit, /\sdisabled=""/);
    assert.match(html, /登録して受付へ進む/);
  });
});

describe('PatientRegistrationModal: 登録処理中・マイナ読取中の無効化状態', () => {
  it('登録処理中 (isSubmitting=true) は、閉じる・マイナ読取・キャンセル・登録ボタンの全4要素が無効化される', () => {
    const html = render({ isSubmitting: true });
    const disabledTags = listDisabledOpeningTags(html);
    assert.strictEqual(disabledTags.length, 4, '全4つのボタンが無効化されること');

    const closeBtn = findOpeningTag(html, 'class="registration-close"', 'button');
    const mynaBtn = findOpeningTag(html, MYNA_BUTTON_MARKER, 'button');
    const cancelBtn = findOpeningTag(html, 'キャンセル', 'button');
    const submitBtn = findOpeningTag(html, 'data-testid="patient-registration-submit"', 'button');

    assert.match(closeBtn, DISABLED_ATTRIBUTE_PATTERN, '閉じるボタンが無効化されていること');
    assert.match(mynaBtn, DISABLED_ATTRIBUTE_PATTERN, 'マイナ読取ボタンが無効化されていること');
    assert.match(mynaBtn, /\saria-disabled="true"/, 'マイナ読取ボタンに aria-disabled="true" が付与されていること');
    assert.match(cancelBtn, DISABLED_ATTRIBUTE_PATTERN, 'キャンセルボタンが無効化されていること');
    assert.match(submitBtn, DISABLED_ATTRIBUTE_PATTERN, '登録ボタンが無効化されていること');
    assert.match(submitBtn, /\saria-disabled="true"/, '登録ボタンに aria-disabled="true" が付与されていること');
    assert.match(html, /登録中\.\.\./, '登録ボタンの文言が「登録中...」に変化すること');
  });

  it('通常時 (isSubmitting=false, isReadingMyna=false) かつマイナ利用可能な場合、すべてのボタンが有効', () => {
    const html = render({ isSubmitting: false, isReadingMyna: false });
    assert.deepStrictEqual(listDisabledOpeningTags(html), []);

    const closeBtn = findOpeningTag(html, 'class="registration-close"', 'button');
    const mynaBtn = findOpeningTag(html, MYNA_BUTTON_MARKER, 'button');
    const cancelBtn = findOpeningTag(html, 'キャンセル', 'button');
    const submitBtn = findOpeningTag(html, 'data-testid="patient-registration-submit"', 'button');

    assert.doesNotMatch(closeBtn, DISABLED_ATTRIBUTE_PATTERN);
    assert.doesNotMatch(mynaBtn, DISABLED_ATTRIBUTE_PATTERN);
    assert.match(mynaBtn, /\saria-disabled="false"/, 'マイナ読取ボタンの aria-disabled は false であること');
    assert.doesNotMatch(cancelBtn, DISABLED_ATTRIBUTE_PATTERN);
    assert.doesNotMatch(submitBtn, DISABLED_ATTRIBUTE_PATTERN);
    assert.match(submitBtn, /\saria-disabled="false"/, '登録ボタンの aria-disabled は false であること');
    assert.match(html, /登録して受付へ進む/);
  });

  it('マイナ読取中 (isReadingMyna=true) は、マイナ読取ボタンのみが無効化され、閉じる・キャンセル・登録ボタンは有効なまま保たれる', () => {
    const html = render({ isReadingMyna: true });
    const disabledTags = listDisabledOpeningTags(html);
    assert.strictEqual(disabledTags.length, 1, 'マイナ読取ボタンのみが無効化されること');

    const mynaBtn = findOpeningTag(html, MYNA_BUTTON_MARKER, 'button');
    const closeBtn = findOpeningTag(html, 'class="registration-close"', 'button');
    const cancelBtn = findOpeningTag(html, 'キャンセル', 'button');
    const submitBtn = findOpeningTag(html, 'data-testid="patient-registration-submit"', 'button');

    assert.match(mynaBtn, DISABLED_ATTRIBUTE_PATTERN, 'マイナ読取ボタンが無効化されていること');
    assert.match(mynaBtn, /\saria-disabled="true"/);
    assert.match(html, /読取中\.\.\./);

    assert.doesNotMatch(closeBtn, DISABLED_ATTRIBUTE_PATTERN, '閉じるボタンは有効のまま');
    assert.doesNotMatch(cancelBtn, DISABLED_ATTRIBUTE_PATTERN, 'キャンセルボタンは有効のまま');
    assert.doesNotMatch(submitBtn, DISABLED_ATTRIBUTE_PATTERN, '登録ボタンは有効のまま');
    assert.match(submitBtn, /\saria-disabled="false"/, 'マイナ読取中も登録ボタンの aria-disabled は false のまま');
  });
});
