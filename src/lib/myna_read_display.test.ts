import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildMynaReadInsuranceDisplay,
  formatPatientInsuranceInfo
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
