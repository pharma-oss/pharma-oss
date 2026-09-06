import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePatientAge } from './patient_age.ts';

test('calculatePatientAge returns undefined for invalid or missing inputs (PR-E4)', () => {
  assert.strictEqual(calculatePatientAge(undefined), undefined);
  assert.strictEqual(calculatePatientAge(''), undefined);
  assert.strictEqual(calculatePatientAge('昭和45年3月2日'), undefined);
  assert.strictEqual(calculatePatientAge('S45.3.2'), undefined);
  assert.strictEqual(calculatePatientAge('invalid-date'), undefined);
});

test('calculatePatientAge computes correct age and shifts by 1 on birthday boundaries (PR-E4)', () => {
  const today = new Date();
  const currentYear = today.getFullYear();

  // 30年前の「昨日」生まれ -> 既に誕生日を迎えているので 30 歳
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const birthYesterday = `${currentYear - 30}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  assert.strictEqual(calculatePatientAge(birthYesterday), 30);

  // 30年前の「明日」生まれ -> まだ誕生日を迎えていないので 29 歳
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const birthTomorrow = `${currentYear - 30}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  assert.strictEqual(calculatePatientAge(birthTomorrow), 29);

  // 固定年（1970-03-02）の計算結果が有限な数値であること
  const fixedAge = calculatePatientAge('1970-03-02');
  assert.strictEqual(typeof fixedAge, 'number');
  assert.ok(fixedAge !== undefined && fixedAge >= 50 && fixedAge <= 60);
});
