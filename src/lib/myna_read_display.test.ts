import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildMynaReadConfirmationMessage,
  buildMynaReadInsuranceDisplay,
  checkMynaReadMatchesPatient,
  formatPatientInsuranceInfo,
  getMynaReaderButtonView,
  pickReceptionInsuranceNumber
} from './myna_read_display.ts';
import type { MynaCardReaderResult } from './myna_card_reader.ts';

const baseReaderResult: MynaCardReaderResult = {
  name: '資格 花子',
  birthDate: '1940-01-02',
  insuranceInfo: {
    provider: '06123456',
    number: '記号123',
    burdenRatio: 30
  },
  readerSource: 'bridge',
  readerCheckedAt: '2026-06-25T09:00:00.000Z',
  readerMessage: 'カードリーダー連携サービスから読取内容を取得しました。'
};

test('formatPatientInsuranceInfo uses registered insurance type and burden ratio', () => {
  assert.strictEqual(
    formatPatientInsuranceInfo({ insuranceType: '後期高齢', burdenRatio: 10 }),
    '後期高齢（1割）'
  );
  assert.strictEqual(formatPatientInsuranceInfo({ burdenRatio: 30 }), '3割負担');
  assert.strictEqual(formatPatientInsuranceInfo(undefined), '保険情報未登録');
});

test('mock myna reads keep the registered patient burden instead of showing demo burden', () => {
  const display = buildMynaReadInsuranceDisplay({
    patientInsuranceInfo: { insuranceType: '後期高齢', burdenRatio: 10 },
    readerResult: {
      ...baseReaderResult,
      readerSource: 'mock',
      readerMessage: 'デモ用のマイナ読取データを反映しました。'
    }
  });

  assert.strictEqual(display.status, 'demo');
  assert.match(display.label, /後期高齢（1割）/);
  assert.match(display.label, /デモ読取/);
  assert.doesNotMatch(display.label, /社保（3割）/);
});

test('bridge burden mismatch is shown as a confirmation warning without overwriting the patient value', () => {
  const display = buildMynaReadInsuranceDisplay({
    patientInsuranceInfo: { insuranceType: '後期高齢', burdenRatio: 10 },
    readerResult: baseReaderResult
  });

  assert.strictEqual(display.status, 'warning');
  assert.match(display.label, /後期高齢（1割）/);
  assert.match(display.label, /読取 06123456（3割）/);
  assert.match(display.message, /患者登録値を維持/);
});

test('matching bridge burden is marked verified using the registered patient display', () => {
  const display = buildMynaReadInsuranceDisplay({
    patientInsuranceInfo: { insuranceType: '社保', burdenRatio: 30 },
    readerResult: baseReaderResult
  });

  assert.strictEqual(display.status, 'verified');
  assert.strictEqual(display.label, '社保（3割） - マイナ確認済');
});

test('bridge read can display reader burden when the patient has no registered burden', () => {
  const display = buildMynaReadInsuranceDisplay({
    patientInsuranceInfo: undefined,
    readerResult: baseReaderResult
  });

  assert.strictEqual(display.status, 'verified');
  assert.strictEqual(display.label, '読取 06123456（3割） - マイナ確認済');
});

const folderResult: MynaCardReaderResult = {
  name: '検証 花子',
  kana: 'ケンショウ ハナコ',
  birthDate: '1985-03-15',
  insuranceInfo: { provider: '01234567', number: '記号123 番号456 枝番01' },
  readerSource: 'folder',
  readerCheckedAt: '2026-10-23T00:28:00.000Z',
  readerMessage: '資格確認端末の連携フォルダから読み取りました。'
};

test('a folder read of the selected patient is shown as confirmed', () => {
  const display = buildMynaReadInsuranceDisplay({
    patientInsuranceInfo: { burdenRatio: 30 },
    patient: { name: '検証　花子', kana: 'けんしょう はなこ', birthDate: '1985-03-15' },
    readerResult: folderResult
  });
  assert.strictEqual(display.status, 'verified');
});

test('a read that belongs to another person is never shown as confirmed', () => {
  const otherBirth = buildMynaReadInsuranceDisplay({
    patientInsuranceInfo: { burdenRatio: 30 },
    patient: { name: '検証 花子', birthDate: '1990-01-01' },
    readerResult: folderResult
  });
  assert.strictEqual(otherBirth.status, 'warning');
  assert.ok(otherBirth.message.includes('生年月日'));
  assert.ok(otherBirth.message.includes('別の患者'));

  const otherName = buildMynaReadInsuranceDisplay({
    patientInsuranceInfo: { burdenRatio: 30 },
    patient: { name: '佐藤 一郎', kana: 'サトウ イチロウ', birthDate: '1985-03-15' },
    readerResult: folderResult
  });
  assert.strictEqual(otherName.status, 'warning');
  assert.ok(otherName.label.includes('別の方のおそれ'));
});

test('identity matching accepts the kanji name or the kana, ignoring spaces and hiragana/katakana', () => {
  assert.ok(checkMynaReadMatchesPatient(folderResult, { name: '検証花子', birthDate: '1985-03-15' }).matches);
  assert.ok(checkMynaReadMatchesPatient(folderResult, { name: '別表記', kana: 'ケンショウハナコ', birthDate: '1985-03-15' }).matches);
  assert.ok(!checkMynaReadMatchesPatient(folderResult, { name: '別人', kana: 'ベツジン', birthDate: '1985-03-15' }).matches);
});

test('demo reads are still shown as demo even when an identity is passed', () => {
  const display = buildMynaReadInsuranceDisplay({
    patient: { name: '佐藤 一郎', birthDate: '1970-01-01' },
    readerResult: { ...folderResult, readerSource: 'mock' }
  });
  assert.strictEqual(display.status, 'demo');
});

test('pickReceptionInsuranceNumber returns the insurer number, never the symbol text', () => {
  assert.strictEqual(pickReceptionInsuranceNumber(folderResult.insuranceInfo), '01234567');
  assert.strictEqual(pickReceptionInsuranceNumber({ provider: '社保', number: '12345678' }), '12345678');
  assert.strictEqual(pickReceptionInsuranceNumber({ provider: '社保', number: '記号123 番号456' }), '');
  assert.strictEqual(pickReceptionInsuranceNumber(undefined), '');
});

test('the confirmation message lists what is about to be filled in and says when the burden ratio is missing', () => {
  const message = buildMynaReadConfirmationMessage(folderResult);
  assert.ok(message.includes('氏名: 検証 花子（ケンショウ ハナコ）'));
  assert.ok(message.includes('生年月日: 1985-03-15'));
  assert.ok(message.includes('保険者番号: 01234567'));
  assert.ok(message.includes('負担割合: 読取結果に無いため'));
  // 読取時刻は端末のローカル時刻で見せる(UTCのまま出さない)
  const checked = new Date(folderResult.readerCheckedAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  assert.ok(message.includes(`読取時刻: ${checked.getFullYear()}-${pad(checked.getMonth() + 1)}-${pad(checked.getDate())} ${pad(checked.getHours())}:${pad(checked.getMinutes())}:${pad(checked.getSeconds())}`));
  const withBurden = buildMynaReadConfirmationMessage({ ...folderResult, insuranceInfo: { ...folderResult.insuranceInfo, burdenRatio: 20 } });
  assert.ok(withBurden.includes('負担割合: 2割'));
});

test('the reader button is off while checking and when no source is configured, and on only when available', () => {
  assert.deepStrictEqual(getMynaReaderButtonView({ status: 'checking' }, 'マイナ読取').disabled, true);
  const off = getMynaReaderButtonView({ status: 'ready', available: false, reason: 'フォルダが未設定です。' }, 'マイナ読取');
  assert.strictEqual(off.disabled, true);
  assert.strictEqual(off.label, 'マイナ読取（未設定）');
  assert.strictEqual(off.title, 'フォルダが未設定です。');
  assert.deepStrictEqual(getMynaReaderButtonView({ status: 'ready', available: true }, 'マイナ読取'), { disabled: false, label: 'マイナ読取' });
});
