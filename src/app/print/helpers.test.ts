import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getClaimItemFlagValue,
  calculatePatientAge,
  toDateOnly,
  stableHashText,
  getPatientIdentityMark,
  getDisplayDrugName,
  getPrescribedDrugName,
  getRecordDrugName,
  isLiquidItem,
  isOintmentItem,
  getRecordNotes,
  getBagDaysText,
  getBagRpComments,
  getFormulationLabel,
  getDrugShapeClass,
  getMedicationFlags
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

test('getDisplayDrugName prioritizes dispensedDrug over drugName and drugId', () => {
  assert.equal(getDisplayDrugName({ dispensedDrug: 'アムロジピン錠5mg「サワイ」', drugName: 'ノルバスク錠5mg', drugId: 'd001' }), 'アムロジピン錠5mg「サワイ」');
  assert.equal(getDisplayDrugName({ drugName: 'ノルバスク錠5mg', drugId: 'd001' }), 'ノルバスク錠5mg');
  assert.equal(getDisplayDrugName({ drugId: 'd001' }), 'd001');
  assert.equal(getDisplayDrugName({}), '');
});

test('getPrescribedDrugName prioritizes drugName over drugId', () => {
  assert.equal(getPrescribedDrugName({ drugName: 'ノルバスク錠5mg', drugId: 'd001' }), 'ノルバスク錠5mg');
  assert.equal(getPrescribedDrugName({ drugId: 'd001' }), 'd001');
  assert.equal(getPrescribedDrugName({}), '');
});

test('getRecordDrugName handles dispensed substitution and fallback', () => {
  assert.equal(getRecordDrugName({ dispensedDrug: 'アムロジピン錠5mg', drugName: 'ノルバスク錠5mg' }), 'アムロジピン錠5mg');
  assert.equal(getRecordDrugName({ dispensedDrug: '変更なし', drugName: 'ノルバスク錠5mg' }), 'ノルバスク錠5mg');
  assert.equal(getRecordDrugName({ dispensedDrug: '変更調剤なし', drugName: 'ノルバスク錠5mg' }), 'ノルバスク錠5mg');
  assert.equal(getRecordDrugName({ dispensedDrug: '', drugName: 'ノルバスク錠5mg' }), 'ノルバスク錠5mg');
});

test('isLiquidItem detects liquid formulation from name or usage', () => {
  assert.equal(isLiquidItem({ drugName: 'アンブロキソールシロップ0.3%' }), true);
  assert.equal(isLiquidItem({ drugName: 'ドライシロップ小児用' }), true);
  assert.equal(isLiquidItem({ drugName: '総合内用液' }), true);
  assert.equal(isLiquidItem({ usage: '1回2ml 内滴' }), true);
  assert.equal(isLiquidItem({ drugName: 'ロキソニン錠60mg', usage: '1日3回毎食後' }), false);
});

test('isOintmentItem detects ointment formulation from name or usage', () => {
  assert.equal(isOintmentItem({ drugName: 'ヒルドイドソフト軟膏0.3%' }), true);
  assert.equal(isOintmentItem({ drugName: 'プロペトクリーム' }), true);
  assert.equal(isOintmentItem({ drugName: 'モーラステープ20mg' }), true);
  assert.equal(isOintmentItem({ usage: '1日1回 患部に塗布' }), true);
  assert.equal(isOintmentItem({ drugName: 'ロキソニン錠60mg', usage: '1日3回毎食後' }), false);
});

test('getRecordNotes formats note combinations with separator', () => {
  const note1 = getRecordNotes({
    dispensedDrug: 'アムロジピン錠5mg',
    drugName: 'ノルバスク錠5mg',
    changeReason: '患者希望',
    isIppoka: true,
    isCrushed: true,
    rpComment: '粉砕後混合'
  });
  assert.equal(note1, '後発変更: アムロジピン錠5mg / 変更理由: 患者希望 / 一包化 / 粉砕 / 粉砕後混合');

  const note2 = getRecordNotes({
    dispensedDrug: 'ノルバスク錠5mg',
    drugName: 'ノルバスク錠5mg'
  });
  assert.equal(note2, '');
});

test('getBagDaysText extracts maximum positive days count', () => {
  assert.equal(getBagDaysText([{ days: 7 }, { days: 14 }, { days: 3 }]), '14日分');
  assert.equal(getBagDaysText([{ days: 0 }, { days: -1 }]), '');
  assert.equal(getBagDaysText([]), '');
});

test('getBagRpComments dedupes rp comments', () => {
  const comments = getBagRpComments([
    { rpComment: '朝食後服用' },
    { rpComment: '朝食後服用' },
    { rpComment: '寝る前' }
  ]);
  assert.deepEqual(comments, ['朝食後服用', '寝る前']);
});

test('getFormulationLabel resolves liquid, ointment, and formulation types', () => {
  assert.equal(getFormulationLabel({ drugName: '小児用シロップ' }), '内用液剤');
  assert.equal(getFormulationLabel({ drugName: 'ヒルドイド軟膏' }), '外用塗布剤');
  assert.equal(getFormulationLabel({ yjCode: '1124001F1023' }), '内用錠剤');
  assert.equal(getFormulationLabel({ yjCode: '1124001B1023' }), '散剤・顆粒剤');
});

test('getDrugShapeClass prioritizes high-risk and formulation indicators', () => {
  assert.equal(getDrugShapeClass({ isHighRisk: true, drugName: 'ワーファリン錠1mg' }), 'high-risk');
  assert.equal(getDrugShapeClass({ drugName: '小児用シロップ' }), 'liquid');
  assert.equal(getDrugShapeClass({ drugName: 'プロペト軟膏' }), 'ointment');
  assert.equal(getDrugShapeClass({ yjCode: '1124001B1023' }), 'powder');
  assert.equal(getDrugShapeClass({ drugName: 'ロキソニン錠60mg' }), 'tablet');
});

test('getMedicationFlags aggregates special condition labels', () => {
  assert.deepEqual(
    getMedicationFlags({ isHighRisk: true, isGeneric: true, isIppoka: true, isCrushed: true }),
    ['ハイリスク薬', '後発医薬品', '一包化対象', '粉砕対象']
  );
  assert.deepEqual(getMedicationFlags({}), []);
});

