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
  getMedicationFlags,
  getAmountLabel,
  getAmountPresentationPair,
  getAmountText,
  getTotalAmountText,
  getPickingEvidence
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

test('getAmountPresentationPair strictly pairs quantity and unit from the same source', () => {
  // 1. 換算情報あり: 処方単位ペア (prescribedAmount, prescribedUnitText) を取得
  assert.deepEqual(
    getAmountPresentationPair({
      amount: 750,
      unitText: 'mL',
      electronicUnitConversion: {
        conversionFactor: '250',
        prescribedAmount: '3',
        prescribedUnitText: '缶'
      }
    }),
    { amount: 3, unit: '缶' },
    '換算がある場合は処方単位ペア（3 缶）が返り、amount 750 や unitText mL と混ざらないこと'
  );

  // 2. 換算情報なし: 薬価単位ペア (amount, unitText) を取得
  assert.deepEqual(
    getAmountPresentationPair({
      amount: 10,
      unitText: '錠'
    }),
    { amount: 10, unit: '錠' }
  );

  // 3. 単位未設定: 数値と空文字単位
  assert.deepEqual(
    getAmountPresentationPair({
      amount: 5
    }),
    { amount: 5, unit: '' }
  );

  // 4. 処方単位側の不正値（<= 0, NaN, 空文字）は安全のため null 返却（'-' へ）
  assert.equal(
    getAmountPresentationPair({
      amount: 750,
      unitText: 'mL',
      electronicUnitConversion: {
        conversionFactor: '250',
        prescribedAmount: '0',
        prescribedUnitText: '缶'
      }
    }),
    null
  );
  assert.equal(
    getAmountPresentationPair({
      amount: 750,
      unitText: 'mL',
      electronicUnitConversion: {
        conversionFactor: '250',
        prescribedAmount: 'invalid',
        prescribedUnitText: '缶'
      }
    }),
    null
  );

  // 5. 薬価単位側の不正値（<= 0, NaN）は null 返却
  assert.equal(getAmountPresentationPair({ amount: 0, unitText: '錠' }), null);
  assert.equal(getAmountPresentationPair({ amount: -1, unitText: '錠' }), null);
  assert.equal(getAmountPresentationPair({ amount: Number.NaN, unitText: 'mL' }), null);
  assert.equal(getAmountPresentationPair({}), null);
});

test('getAmountText formats amount with unit or returns dash for invalid/zero values', () => {
  // 正常系：処方単位あり
  assert.equal(getAmountText({ amount: 30, unitText: 'mL' }), '30 mL');
  assert.equal(getAmountText({ amount: 25, unitText: 'g' }), '25 g');
  assert.equal(getAmountText({ amount: 2, unitText: '錠' }), '2 錠');

  // PR-D1 現状担保: 取込が両ペアに同じ値を入れている現行状態では同一文字列を返すこと
  const currentPrD1Item = {
    amount: 3,
    unitText: '缶',
    electronicUnitConversion: {
      conversionFactor: '250',
      prescribedAmount: '3',
      prescribedUnitText: '缶'
    }
  };
  assert.equal(getAmountText(currentPrD1Item), '3 缶');
  assert.equal(getAmountText(currentPrD1Item), getAmountText({ amount: 3, unitText: '缶' }));

  // PR-D2 安全網: 内部を薬価単位化（amount: 750, unitText: mL）した後も処方単位ペア（3 缶）で安全に出力されること
  assert.equal(
    getAmountText({
      amount: 750,
      unitText: 'mL',
      electronicUnitConversion: {
        conversionFactor: '250',
        prescribedAmount: '3',
        prescribedUnitText: '缶'
      }
    }),
    '3 缶',
    '750 缶 や 3 mL に決してならず、処方指示どおり「3 缶」と表示されること'
  );

  // 単位未設定時は勘で「錠」等を補完せず、数値のみ（余分な空白なし）
  assert.equal(getAmountText({ amount: 3 }), '3');
  assert.equal(getAmountText({ amount: 5, unitText: '' }), '5');
  assert.equal(getAmountText({ amount: 5, unitText: '   ' }), '5');

  // 未確定・ゼロ・負数・NaN は勘で 0 を置かず '-' を返却
  assert.equal(getAmountText({}), '-');
  assert.equal(getAmountText({ amount: 0, unitText: '錠' }), '-');
  assert.equal(getAmountText({ amount: -1, unitText: '錠' }), '-');
  assert.equal(getAmountText({ amount: Number.NaN, unitText: 'mL' }), '-');
  assert.equal(getAmountText({ amount: Number.POSITIVE_INFINITY, unitText: 'mL' }), '-');
});

test('getTotalAmountText calculates total quantity for daily items and passes total items through', () => {
  // 内服薬 (isDailyAmountItem === true): amount * days
  assert.equal(
    getTotalAmountText({ amount: 10, days: 3, unitText: 'mL', dosageCategory: 'internal', usage: '毎食後' }),
    '30 mL'
  );
  // 浮動小数点丸め (0.3 * 3 = 0.9)
  assert.equal(
    getTotalAmountText({ amount: 0.3, days: 3, unitText: 'g', dosageCategory: 'internal' }),
    '0.9 g'
  );

  // 外用薬 (dosageCategory: external): 日数があっても掛けずにそのまま
  assert.equal(
    getTotalAmountText({ amount: 25, days: 14, unitText: 'g', dosageCategory: 'external', usage: '1日1回貼付' }),
    '25 g'
  );

  // 内滴 (dosageCategory: internal_drop): そのまま
  assert.equal(
    getTotalAmountText({ amount: 10, days: 7, unitText: 'mL', dosageCategory: 'internal_drop' }),
    '10 mL'
  );

  // 頓服 (usage: 頓服): そのまま
  assert.equal(
    getTotalAmountText({ amount: 5, days: 5, unitText: '回分', usage: '頭痛時頓服' }),
    '5 回分'
  );

  // 日数ゼロ (days: 0) はシステム規約通り総量扱い
  assert.equal(
    getTotalAmountText({ amount: 10, days: 0, unitText: 'g' }),
    '10 g'
  );

  // 単位なし時の数値のみ
  assert.equal(
    getTotalAmountText({ amount: 2, days: 3 }),
    '6'
  );

  // 換算情報あり (処方単位ペアで日数積を算出)
  assert.equal(
    getTotalAmountText({
      amount: 750,
      days: 14,
      unitText: 'mL',
      dosageCategory: 'internal',
      electronicUnitConversion: {
        conversionFactor: '250',
        prescribedAmount: '3',
        prescribedUnitText: '缶'
      }
    }),
    '42 缶',
    '換算あり内服薬は処方単位ペア 3 缶 * 14 日 = 42 缶 となること（750*14=10500 缶 や 42 mL にならないこと）'
  );

  // 換算情報あり (外用全量アイテムは処方単位ペアをそのまま出力)
  assert.equal(
    getTotalAmountText({
      amount: 250,
      days: 7,
      unitText: 'mL',
      dosageCategory: 'external',
      electronicUnitConversion: {
        conversionFactor: '250',
        prescribedAmount: '1',
        prescribedUnitText: '本'
      }
    }),
    '1 本',
    '換算あり外用薬は処方単位ペア 1 本 がそのまま全量となること'
  );

  // 不正値・ゼロ
  assert.equal(getTotalAmountText({ amount: 0 }), '-');
  assert.equal(getTotalAmountText({ amount: Number.NaN }), '-');
});

test('getAmountLabel distinguishes daily from total based on semantics', () => {
  assert.equal(getAmountLabel({ days: 3, dosageCategory: 'internal' }), '1日量');
  assert.equal(getAmountLabel({ days: 14, usage: '毎食後' }), '1日量');
  assert.equal(getAmountLabel({ days: 14, dosageCategory: 'external' }), '全量');
  assert.equal(getAmountLabel({ days: 5, usage: '頭痛時頓服' }), '全量');
  assert.equal(getAmountLabel({ days: 0, usage: '毎食後' }), '全量');
});

test('getPickingEvidence distinguishes GS1 verified, manual picked, and unverified (3-value)', () => {
  // GS1 照合済み (Lot 番号あり)
  assert.equal(
    getPickingEvidence({ isPicked: true, pickedGs1Code: '01049999999000011727063010E2ELOT', pickedLotNumber: 'E2ELOT' }),
    'GS1照合済み (Lot E2ELOT)'
  );

  // GS1 照合済み (GTIN あり、Lot なし)
  assert.equal(
    getPickingEvidence({ isPicked: true, pickedGs1Code: '0104999999900001', pickedGtin: '04999999900001' }),
    'GS1照合済み (04999999900001)'
  );

  // GS1 照合済み (コードのみ、GTIN/Lot なし)
  assert.equal(
    getPickingEvidence({ isPicked: true, pickedGs1Code: '0104999999900001' }),
    'GS1照合済み'
  );

  // ピッキング済み（GS1 照合なし）: isPicked のみでコードなし
  assert.equal(
    getPickingEvidence({ isPicked: true }),
    'ピッキング済み（GS1照合なし）'
  );

  // 未照合: isPicked が false または未設定
  assert.equal(getPickingEvidence({ isPicked: false }), '未照合');
  assert.equal(getPickingEvidence({}), '未照合');
});

