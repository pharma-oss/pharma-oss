import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MedicineBagPrint } from './components/MedicineBagPrint';
import {
  getClaimItemFlagValue,
  calculatePatientAge,
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
  getDispensingTotalAmountText,
  getPickingEvidence,
  getBagDosageCategory,
  getBagKindLabel,
  buildPrintAuditItems,
  buildPrintItemMasterFacts,
  buildPrintPrescriptionItem,
  getPrintVisitDataViewState,
  PRINT_LOAD_ERROR_HEADING,
  PRINT_LOAD_ERROR_DESCRIPTION,
  PRINT_NOT_FOUND_HEADING,
  type PrintDrugMasterDoc
} from './helpers.ts';
import { buildPrescriptionInputAudit } from '@/lib/prescription_input_audit';
import type { PrescriptionItem } from '@/db/types';
import type { PrintPrescriptionItem } from './types.ts';

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


test('getDispensingTotalAmountText annotates the dispensing-unit total only when a unit conversion exists', () => {
  const converted = {
    amount: 750,
    days: 14,
    unitText: 'mL',
    usage: '1日3回毎食後',
    dosageCategory: 'internal' as const,
    electronicUnitConversion: {
      conversionFactor: '250',
      masterUnitText: 'mL',
      prescribedAmount: '3',
      prescribedUnitText: '缶'
    }
  };
  // 表示は処方単位、併記は調剤単位の実量
  assert.equal(getTotalAmountText(converted), '42 缶');
  assert.equal(getDispensingTotalAmountText(converted), '10500 mL');

  // 換算なしは併記不要（表示ペアがすでに薬価単位ペア）
  assert.equal(
    getDispensingTotalAmountText({ amount: 10, days: 3, unitText: 'mL', dosageCategory: 'internal', usage: '毎食後' }),
    ''
  );

  // 全量アイテム（外用）は日数を掛けずそのまま
  assert.equal(
    getDispensingTotalAmountText({
      amount: 50,
      days: 0,
      unitText: 'g',
      dosageCategory: 'external',
      electronicUnitConversion: {
        conversionFactor: '10',
        prescribedAmount: '5',
        prescribedUnitText: '本'
      }
    }),
    '50 g'
  );

  // 薬価単位側の数量が不正なら併記しない（勘で数字を出さない）
  const invalidAmount = {
    amount: Number.NaN,
    days: 14,
    unitText: 'mL',
    dosageCategory: 'internal' as const,
    electronicUnitConversion: { conversionFactor: '250', prescribedAmount: '3', prescribedUnitText: '缶' }
  };
  assert.equal(getDispensingTotalAmountText(invalidAmount), '');

  // 薬価単位側に単位がなければ数値のみ（勘で単位を補完しない）
  assert.equal(
    getDispensingTotalAmountText({
      amount: 750,
      days: 14,
      usage: '1日3回毎食後',
      dosageCategory: 'internal',
      electronicUnitConversion: { conversionFactor: '250', prescribedAmount: '3', prescribedUnitText: '缶' }
    }),
    '10500'
  );
});

test('getBagDosageCategory and getBagKindLabel classify bag kinds correctly (PR-E3)', () => {
  // 証拠A: テープ剤・点眼液・坐剤・耳科用液 -> 外用薬
  const tapeGroup = [{ drugName: 'モーラステープ20mg', usage: '1日1回患部に貼る' }];
  assert.equal(getBagDosageCategory(tapeGroup), 'external');
  assert.equal(getBagKindLabel(getBagDosageCategory(tapeGroup)), '外用薬');

  const eyeDropGroup = [{ drugName: 'ヒアレイン点眼液0.1%', usage: '1日5回両眼に1滴ずつ' }];
  assert.equal(getBagDosageCategory(eyeDropGroup), 'external');
  assert.equal(getBagKindLabel(getBagDosageCategory(eyeDropGroup)), '外用薬');

  const suppositoryGroup = [{ drugName: 'ボラザG坐剤', usage: '1日2回肛門内に挿入' }];
  assert.equal(getBagDosageCategory(suppositoryGroup), 'external');
  assert.equal(getBagKindLabel(getBagDosageCategory(suppositoryGroup)), '外用薬');

  const earDropGroup = [{ drugName: 'タリビッド耳科用液', usage: '1日2回点耳' }];
  assert.equal(getBagDosageCategory(earDropGroup), 'external');
  assert.equal(getBagKindLabel(getBagDosageCategory(earDropGroup)), '外用薬');

  // 証拠A: カロナール錠200 / 疼痛時に1回1錠 -> 頓服薬
  const tonpukuGroup = [{ drugName: 'カロナール錠200', usage: '疼痛時に1回1錠' }];
  assert.equal(getBagDosageCategory(tonpukuGroup), 'as_needed');
  assert.equal(getBagKindLabel(getBagDosageCategory(tonpukuGroup)), '頓服薬');

  // 内服の回帰: アムロジピン錠5mg / 1日1回朝食後 -> 内服薬
  const internalGroup = [{ drugName: 'アムロジピン錠5mg', usage: '1日1回朝食後' }];
  assert.equal(getBagDosageCategory(internalGroup), 'internal');
  assert.equal(getBagKindLabel(getBagDosageCategory(internalGroup)), '内服薬');

  // 手動指定の優先: 手動で internal 指定された明細があれば、外用明細が混在していても '内服薬'
  const manualOverrideGroup = [
    {
      drugName: 'モーラステープ20mg',
      usage: '1日1回患部に貼る',
      dosageCategory: 'internal' as const,
      dosageCategorySource: 'manual' as const
    },
    {
      drugName: 'ヒアレイン点眼液0.1%',
      usage: '1日1回点眼'
    }
  ];
  assert.equal(getBagDosageCategory(manualOverrideGroup), 'internal');
  assert.equal(getBagKindLabel(getBagDosageCategory(manualOverrideGroup)), '内服薬');

  // 混在袋: 内服明細と外用明細が同一グループにある場合に '外用薬'（安全側優先）
  const mixedGroup = [
    { drugName: 'アムロジピン錠5mg', usage: '用法共通' },
    { drugName: 'モーラステープ20mg', usage: '用法共通' }
  ];
  assert.equal(getBagDosageCategory(mixedGroup), 'external');
  assert.equal(getBagKindLabel(getBagDosageCategory(mixedGroup)), '外用薬');

  // 空明細のフォールバック
  assert.equal(getBagDosageCategory([]), 'internal');
  assert.equal(getBagKindLabel('internal'), '内服薬');
  assert.equal(getBagKindLabel('injection'), '注射薬');
});

test('getBagDosageCategory respects resolveEffectiveDosageCategory for legacy auto records (PR-E7)', () => {
  // 耳科用液 (PR-E1以前に保存され dosageCategory: 'internal', dosageCategorySource: 'auto')
  // -> 用法の外用判定が優先され 'external' / '外用薬'
  const legacyEarDropGroup = [
    {
      drugName: 'タリビッド耳科用液',
      usage: '1日2回点耳',
      dosageCategory: 'internal' as const,
      dosageCategorySource: 'auto' as const
    }
  ];
  assert.equal(getBagDosageCategory(legacyEarDropGroup), 'external');
  assert.equal(getBagKindLabel(getBagDosageCategory(legacyEarDropGroup)), '外用薬');

  // 手動指定 (dosageCategorySource === 'manual') は最優先で尊重され 'internal' / '内服薬'
  const manualOverrideGroup = [
    {
      drugName: 'ヒアレイン点眼液0.1%',
      usage: '1日5回点眼',
      dosageCategory: 'internal' as const,
      dosageCategorySource: 'manual' as const
    }
  ];
  assert.equal(getBagDosageCategory(manualOverrideGroup), 'internal');
  assert.equal(getBagKindLabel(getBagDosageCategory(manualOverrideGroup)), '内服薬');
});

test('MedicineBagPrint renders usage supplement text next to usage hero (G6-4)', () => {
  const element = React.createElement(MedicineBagPrint, {
    patientData: { name: '山田 太郎' },
    groupedForBags: {
      '１日１回就寝前　服用': [
        {
          itemId: 'item-1',
          drugName: 'ロヒプノール錠1mg',
          amount: 1,
          days: 14,
          dosageCategory: 'internal',
          usageSupplementText: '就寝30分前に水で服用'
        }
      ]
    },
    pharmacyInfo: {
      name: 'テスト薬局',
      code: 'PH-001',
      postalCode: '100-0001',
      address: '東京都千代田区',
      phone: '03-1234-5678',
      registrationNumber: 'REG-001',
      pharmacistName: '薬剤師 太郎'
    },
    pharmacyAddressLine: '東京都千代田区',
    receiptRunId: 'RUN-001',
    dispensingDateStr: '2026/09/06',
    renderIdentityMark: () => null
  });

  const html = renderToStaticMarkup(element);
  assert.ok(html.includes('１日１回就寝前　服用'), '用法名が含まれること');
  assert.ok(html.includes('就寝30分前に水で服用'), '用法補足テキストが薬袋に描画されること (G6-4)');
  assert.ok(html.includes('yakutai-usage-supplement'), '補足用のスタイル要素が存在すること');
});

// ---- 印刷時の薬剤師確認への入力 ----
// 過去に印刷ページの分割で、薬剤マスタ由来の項目 (廃止・在庫・YJコード・rpId など) が
// 監査へ渡されなくなり、廃止薬の選択などが印刷時に検出されなくなっていた。

const drugDoc = (overrides: PrintDrugMasterDoc = {}): PrintDrugMasterDoc => ({
  yjCode: '', genericName: '', isHighRisk: false, isAbolished: false, stockQuantity: 100, ...overrides
});

// loadData と同じ経路: 保存済みの明細 + 薬剤マスタ -> 印刷用明細
function printItem(
  base: Partial<PrintPrescriptionItem> & Pick<PrintPrescriptionItem, 'itemId' | 'drugId'>,
  prescribed?: PrintDrugMasterDoc,
  dispensed?: PrintDrugMasterDoc
): PrintPrescriptionItem {
  const stored = { visitId: 'v1', amount: 1, days: 14, usage: '1日1回朝食後', ...base } as PrescriptionItem;
  return buildPrintPrescriptionItem(stored, prescribed, dispensed, '2026-10-08');
}

test('buildPrintItemMasterFacts reads the prescribed and dispensed drugs separately and bills against the dispensed one', () => {
  const facts = buildPrintItemMasterFacts(
    drugDoc({ yjCode: 'YJ-BRAND', genericName: '一般名', isHighRisk: true, isAbolished: false, stockQuantity: 12 }),
    drugDoc({ yjCode: 'YJ-GENERIC', isHighRisk: false, isAbolished: true, stockQuantity: 0 })
  );

  assert.deepStrictEqual(facts, {
    isAbolished: true,
    stockQuantity: 0,
    prescribedYjCode: 'YJ-BRAND',
    prescribedGenericName: '一般名',
    prescribedIsHighRisk: true,
    prescribedIsAbolished: false,
    prescribedStockQuantity: 12,
    dispensedYjCode: 'YJ-GENERIC',
    dispensedIsHighRisk: false,
    dispensedIsAbolished: true,
    dispensedStockQuantity: 0
  });
});

test('buildPrintItemMasterFacts falls back to the prescribed drug when nothing was substituted, and tolerates missing master rows', () => {
  const unsubstituted = buildPrintItemMasterFacts(drugDoc({ isAbolished: true, stockQuantity: 7 }), undefined);
  assert.strictEqual(unsubstituted.isAbolished, true);
  assert.strictEqual(unsubstituted.stockQuantity, 7);
  assert.strictEqual(unsubstituted.dispensedYjCode, undefined);
  assert.strictEqual(unsubstituted.dispensedIsAbolished, false);
  assert.strictEqual(unsubstituted.dispensedStockQuantity, undefined);

  const missing = buildPrintItemMasterFacts(undefined, undefined);
  assert.strictEqual(missing.isAbolished, false);
  assert.strictEqual(missing.stockQuantity, undefined);
  assert.strictEqual(missing.prescribedIsHighRisk, false);
});

test('buildPrintPrescriptionItem carries names, master facts and pricing together', () => {
  const stored = { itemId: 'a', visitId: 'v1', drugId: 'BRAND', dispensedDrugCode: 'GENERIC', amount: 2, days: 7, usage: '1日2回朝夕食後', rpNumber: 1 } as PrescriptionItem;
  const printed = buildPrintPrescriptionItem(
    stored,
    drugDoc({ name: '先発錠', yjCode: 'YJ-B', genericName: '一般名', isHighRisk: true, stockQuantity: 4 }),
    drugDoc({ name: '後発錠', yjCode: 'YJ-G', isAbolished: true, stockQuantity: 0 }),
    '2026-10-08'
  );

  assert.strictEqual(printed.drugName, '先発錠');
  assert.strictEqual(printed.dispensedDrug, '後発錠');
  assert.strictEqual(printed.genericName, '一般名');
  assert.strictEqual(printed.isAbolished, true, 'billed against the dispensed drug');
  assert.strictEqual(printed.stockQuantity, 0);
  assert.strictEqual(printed.prescribedStockQuantity, 4);
  assert.strictEqual(printed.dispensedIsAbolished, true);
  assert.strictEqual(printed.yjCode, 'YJ-G', 'pricing reads the dispensed drug');
  assert.strictEqual(printed.amount, 2, 'stored fields are kept');
  assert.strictEqual(printed.usage, '1日2回朝夕食後');

  // 保存済みの薬品名・調剤薬名があればマスタ名より優先する
  const named = buildPrintPrescriptionItem(
    { ...stored, drugName: '保存済み処方名', dispensedDrug: '保存済み調剤名' } as PrescriptionItem & { drugName?: string },
    drugDoc({ name: '先発錠' }), drugDoc({ name: '後発錠' }), '2026-10-08'
  );
  assert.strictEqual(named.drugName, '保存済み処方名');
  assert.strictEqual(named.dispensedDrug, '保存済み調剤名');
});

test('buildPrintAuditItems keeps the Rp grouping and ignores placeholder substitutions like 変更なし', () => {
  const [grouped, ungrouped, placeholder, real] = buildPrintAuditItems([
    printItem({ itemId: 'a', drugId: 'D1', rpNumber: 2 }, drugDoc()),
    printItem({ itemId: 'b', drugId: 'D2' }, drugDoc()),
    printItem({ itemId: 'c', drugId: 'D3', dispensedDrug: '変更なし', dispensedDrugCode: 'D3' }, drugDoc({ isAbolished: true }), drugDoc({ isAbolished: true })),
    printItem({ itemId: 'd', drugId: 'D4', dispensedDrug: '後発D錠', dispensedDrugCode: 'D4GE' }, drugDoc(), drugDoc({ isAbolished: true, stockQuantity: 3 }))
  ]);

  assert.strictEqual(grouped.rpId, 'rp_2');
  assert.strictEqual(ungrouped.rpId, undefined);
  assert.strictEqual(grouped.drugCode, 'D1', 'the audit item is keyed by the prescribed drug');

  assert.strictEqual(placeholder.dispensedIsAbolished, false, '変更なし is not an actual dispensed drug');
  assert.strictEqual(placeholder.dispensedYjCode, undefined);
  assert.strictEqual(placeholder.isAbolished, true, 'the prescribed side is still checked');

  assert.strictEqual(real.dispensedIsAbolished, true);
  assert.strictEqual(real.dispensedStockQuantity, 3);
});

test('buildPrintAuditItems prefers the receipt remark being edited over the saved one', () => {
  const items = [printItem({ itemId: 'a', drugId: 'D1', receiptRemark: '保存済み' }, drugDoc())];

  assert.strictEqual(buildPrintAuditItems(items, {})[0].receiptRemark, '保存済み');
  assert.strictEqual(buildPrintAuditItems(items, { a: '編集中' })[0].receiptRemark, '編集中');
  assert.strictEqual(buildPrintAuditItems(items, { a: '編集中' })[0].showReceiptRemark, true);

  const cleared = buildPrintAuditItems(items, { a: '' })[0];
  assert.strictEqual(cleared.receiptRemark, '', 'an emptied remark wins over the saved text');
  assert.strictEqual(cleared.showReceiptRemark, false);
});

test('the print-time pharmacist check catches abolished drugs, stock problems, missing substitution reasons and duplicate therapy', () => {
  const items = [
    printItem({ itemId: 'i1', drugId: 'D1', drugName: '廃止薬A錠', rpNumber: 1 }, drugDoc({ yjCode: '2149001F1', genericName: 'ロキソプロフェン', isAbolished: true })),
    printItem({ itemId: 'i2', drugId: 'D2', drugName: '在庫なしB錠', rpNumber: 2 }, drugDoc({ yjCode: '3999001F1', genericName: 'ビタミンB', stockQuantity: 0 })),
    printItem({ itemId: 'i3', drugId: 'D3', drugName: 'ロキソニン錠60mg', amount: 3, days: 5, usage: '1日3回毎食後', rpNumber: 3 }, drugDoc({ yjCode: '2149001F2', genericName: 'ロキソプロフェン', stockQuantity: 50 })),
    printItem({ itemId: 'i4', drugId: 'D4', drugName: 'ボルタレン錠25mg', amount: 3, days: 5, usage: '1日3回毎食後', rpNumber: 3 }, drugDoc({ yjCode: '2149002F1', genericName: 'ジクロフェナク', stockQuantity: 50 })),
    printItem(
      { itemId: 'i5', drugId: 'D5', drugName: '先発C錠', dispensedDrug: '後発C錠', dispensedDrugCode: 'D5GE', rpNumber: 4 },
      drugDoc({ yjCode: '1179001F1', genericName: 'ゾルピデム', stockQuantity: 20 }),
      drugDoc({ yjCode: '1179001F1', genericName: 'ゾルピデム', stockQuantity: 20 })
    ),
    printItem({ itemId: 'i6', drugId: 'D6', drugName: 'ハイリスクD錠', rpNumber: 5 }, drugDoc({ yjCode: '2171001F1', genericName: 'ワルファリン', isHighRisk: true, stockQuantity: 10 }))
  ];

  const audit = buildPrescriptionInputAudit(buildPrintAuditItems(items), { patientAlerts: [] });
  const codes = audit.issues.map((issue) => `${issue.severity}:${issue.code}`).sort();

  assert.deepStrictEqual(codes, [
    'error:abolished_drug_selected',
    'warning:high_risk_without_comment',
    'warning:similar_therapy_detected',
    'warning:stock_empty',
    'warning:stock_shortage',
    'warning:substitution_reason_missing'
  ]);
  assert.strictEqual(audit.errorCount, 1, 'an abolished drug is an error, which stops printing');
});

test('buildPrintAuditItems prefers the prescribed drug\'s YJ code and generic name, falling back to the billing drug\'s', () => {
  const base = { visitId: 'v1', amount: 1, days: 14, usage: '1日1回朝食後', drugName: 'X', dispensedGenericName: '' };
  const [prescribedFirst, fallback] = buildPrintAuditItems([
    { ...base, itemId: 'a', drugId: 'D1', yjCode: 'YJ-BILLING', genericName: '請求側一般名', prescribedYjCode: 'YJ-PRESCRIBED', prescribedGenericName: '処方側一般名' },
    { ...base, itemId: 'b', drugId: 'D2', yjCode: 'YJ-BILLING', genericName: '請求側一般名' }
  ] as unknown as PrintPrescriptionItem[]);

  assert.strictEqual(prescribedFirst.yjCode, 'YJ-PRESCRIBED');
  assert.strictEqual(prescribedFirst.genericName, '処方側一般名');
  assert.strictEqual(fallback.yjCode, 'YJ-BILLING');
  assert.strictEqual(fallback.genericName, '請求側一般名');
});

test('getPrintVisitDataViewState prioritizes loading status over error and missing data', () => {
  const state = getPrintVisitDataViewState({
    isLoading: true,
    hasLoadError: true,
    hasVisitData: false,
    hasPatientData: false
  });

  assert.strictEqual(state.status, 'loading');
  assert.strictEqual(state.isLoading, true);
  assert.strictEqual(state.hasError, false);
  assert.strictEqual(state.isNotFound, false);
  assert.strictEqual(state.isReady, false);
});

test('getPrintVisitDataViewState returns error status when load error occurs and visit/patient data are incomplete', () => {
  const state = getPrintVisitDataViewState({
    isLoading: false,
    hasLoadError: true,
    hasVisitData: true,
    hasPatientData: false
  });

  assert.strictEqual(state.status, 'error');
  assert.strictEqual(state.isLoading, false);
  assert.strictEqual(state.hasError, true);
  assert.strictEqual(state.isNotFound, false);
  assert.strictEqual(state.isReady, false);
});

test('getPrintVisitDataViewState returns not_found status when loading succeeded but visit or patient is missing', () => {
  const state = getPrintVisitDataViewState({
    isLoading: false,
    hasLoadError: false,
    hasVisitData: false,
    hasPatientData: false
  });

  assert.strictEqual(state.status, 'not_found');
  assert.strictEqual(state.isLoading, false);
  assert.strictEqual(state.hasError, false);
  assert.strictEqual(state.isNotFound, true);
  assert.strictEqual(state.isReady, false);
});

test('getPrintVisitDataViewState returns ready status when not loading, no error, and both visit and patient data exist', () => {
  const state = getPrintVisitDataViewState({
    isLoading: false,
    hasLoadError: false,
    hasVisitData: true,
    hasPatientData: true
  });

  assert.strictEqual(state.status, 'ready');
  assert.strictEqual(state.isLoading, false);
  assert.strictEqual(state.hasError, false);
  assert.strictEqual(state.isNotFound, false);
  assert.strictEqual(state.isReady, true);
});

test('getPrintVisitDataViewState returns not_found when only one of visit and patient exists and no load error occurred', () => {
  // 受付はあるが患者の文書が無い(患者の削除など)。表示可にすると、患者が null のまま印刷画面を描画して壊れる。
  const visitOnly = getPrintVisitDataViewState({
    isLoading: false,
    hasLoadError: false,
    hasVisitData: true,
    hasPatientData: false
  });
  assert.strictEqual(visitOnly.status, 'not_found');
  assert.strictEqual(visitOnly.isNotFound, true);
  assert.strictEqual(visitOnly.isReady, false);
  assert.strictEqual(visitOnly.hasError, false);

  const patientOnly = getPrintVisitDataViewState({
    isLoading: false,
    hasLoadError: false,
    hasVisitData: false,
    hasPatientData: true
  });
  assert.strictEqual(patientOnly.status, 'not_found');
  assert.strictEqual(patientOnly.isNotFound, true);
  assert.strictEqual(patientOnly.isReady, false);
  assert.strictEqual(patientOnly.hasError, false);
});

test('getPrintVisitDataViewState reports a load error when either visit or patient is missing, and keeps showing complete data despite a load error', () => {
  const patientOnlyWithError = getPrintVisitDataViewState({
    isLoading: false,
    hasLoadError: true,
    hasVisitData: false,
    hasPatientData: true
  });
  assert.strictEqual(patientOnlyWithError.status, 'error');
  assert.strictEqual(patientOnlyWithError.hasError, true);
  assert.strictEqual(patientOnlyWithError.isNotFound, false);

  // 読み込みに失敗した後でも、受付と患者が両方揃っているなら、エラー画面で隠さず表示する。
  const completeWithError = getPrintVisitDataViewState({
    isLoading: false,
    hasLoadError: true,
    hasVisitData: true,
    hasPatientData: true
  });
  assert.strictEqual(completeWithError.status, 'ready');
  assert.strictEqual(completeWithError.isReady, true);
  assert.strictEqual(completeWithError.hasError, false);
  assert.strictEqual(completeWithError.isNotFound, false);
});

test('PRINT_LOAD_ERROR_HEADING, DESCRIPTION, and NOT_FOUND_HEADING define explicit non-empty Japanese guidance', () => {
  assert.strictEqual(PRINT_LOAD_ERROR_HEADING, '印刷データの読み込みに失敗しました');
  assert.strictEqual(
    PRINT_LOAD_ERROR_DESCRIPTION,
    '受付や患者の情報を読み込めませんでした。再読み込みしてから、もう一度開いてください。'
  );
  assert.strictEqual(PRINT_NOT_FOUND_HEADING, '印刷対象の受付が見つかりませんでした');
});

