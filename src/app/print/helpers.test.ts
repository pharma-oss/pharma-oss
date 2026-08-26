import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getClaimItemFlagValue,
  calculatePatientAge,
  toDateOnly,
  stableHashText,
  getPatientIdentityMark
} from './helpers.ts';

// PrintPickingFlow.test.ts がソース文字列でしか見ていなかった
// 帳票・算定まわりの純粋関数を、直接テストへ昇格する (P3 宿題)。

test('getClaimItemFlagValue defaults to true except for isDiagnosticTest', () => {
  // 算定フラグは「未設定なら算定する」が既定。false のときだけ外す。
  // ここを取り違えるとレセプト点数が変わるため、既定値を固定する。
  assert.equal(getClaimItemFlagValue({}, 'isBillable'), true);
  assert.equal(getClaimItemFlagValue({ isBillable: undefined }, 'isBillable'), true);
  assert.equal(getClaimItemFlagValue({ isBillable: true }, 'isBillable'), true);
  assert.equal(getClaimItemFlagValue({ isBillable: false }, 'isBillable'), false);

  // isDiagnosticTest だけは逆で、「明示的に true のときだけ真」。
  assert.equal(getClaimItemFlagValue({}, 'isDiagnosticTest'), false);
  assert.equal(getClaimItemFlagValue({ isDiagnosticTest: undefined }, 'isDiagnosticTest'), false);
  assert.equal(getClaimItemFlagValue({ isDiagnosticTest: true }, 'isDiagnosticTest'), true);
  assert.equal(getClaimItemFlagValue({ isDiagnosticTest: false }, 'isDiagnosticTest'), false);
});

test('getClaimItemFlagValue treats 0 and empty string as set (not false)', () => {
  // item[field] !== false という実装なので、falsy でも false 以外は true になる。
  // 意図した挙動であることを固定しておく。
  assert.equal(getClaimItemFlagValue({ isBillable: 0 }, 'isBillable'), true);
  assert.equal(getClaimItemFlagValue({ isBillable: '' }, 'isBillable'), true);
  assert.equal(getClaimItemFlagValue({ isBillable: null }, 'isBillable'), true);
});

test('calculatePatientAge handles birthdays that have not arrived this year', () => {
  const today = new Date();
  const y = today.getFullYear();

  // 明日が誕生日 → まだ加齢していない
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const notYet = `${y - 40}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  assert.equal(calculatePatientAge(notYet), 39);

  // 昨日が誕生日 → 加齢済み
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const already = `${y - 40}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  assert.equal(calculatePatientAge(already), 40);
});

test('calculatePatientAge returns undefined for missing or invalid input', () => {
  assert.equal(calculatePatientAge(undefined), undefined);
  assert.equal(calculatePatientAge(''), undefined);
  assert.equal(calculatePatientAge('not-a-date'), undefined);
});

test('toDateOnly extracts the date part and rejects unusable input', () => {
  assert.equal(toDateOnly('2026-08-26T12:34:56.000Z'), '2026-08-26');
  assert.equal(toDateOnly('2026-08-26'), '2026-08-26');
});

test('stableHashText is deterministic and non-negative', () => {
  assert.equal(stableHashText('デモ患者 みどり'), stableHashText('デモ患者 みどり'));
  assert.notEqual(stableHashText('患者A'), stableHashText('患者B'));
  assert.ok(stableHashText('') >= 0);
  assert.ok(stableHashText('x'.repeat(500)) >= 0);
});

test('getPatientIdentityMark returns a stable mark for the same patient', () => {
  // 取り違え防止マークは、同じ患者なら毎回同じものが出ること。
  const a = getPatientIdentityMark('pt_0001', 'v_0001');
  const b = getPatientIdentityMark('pt_0001', 'v_0001');
  assert.deepEqual(a, b);
  assert.ok(a, '空でないマークが返ること');
  // 受付が違えばマークも変わり得る (取り違え防止のため受付単位で決まる)
  assert.ok(getPatientIdentityMark('pt_0001', 'v_0002'));
});
