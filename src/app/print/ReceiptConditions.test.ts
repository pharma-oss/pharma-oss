import { test } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReceiptPrint } from './components/ReceiptPrint';
import { ReceiptStatementPrint, type ReceiptStatementFeeLike } from './components/ReceiptStatementPrint';
import { ReceiptConditionPanel, type ReceiptBarcodeStatus, type ReceiptConditionPanelProps } from './components/ReceiptConditionPanel';
import { findOpeningTag, stripStyleBlocks } from '../../lib/test_support/html_disabled_tags';
import { buildReceiptBarcode } from '../../lib/receipt_barcode';
import type { ConditionChoicePreview, ConditionChoicePreviews } from '../../lib/claim_condition_previews';
import type { PharmacyInfo } from './types';

const pharmacyInfo: PharmacyInfo = {
  name: 'みらい調剤薬局',
  code: '1312345',
  postalCode: '100-0001',
  address: '東京都千代田区1-1-1',
  phone: '03-1234-5678',
  registrationNumber: '',
  pharmacistName: '薬剤 師範'
};

const insuranceAmounts = { burdenRatio: 30, totalCostYen: 830, insurerBurdenYen: 580, patientCopayYen: 250 };

function renderReceipt(extra: Record<string, unknown> = {}) {
  return stripStyleBlocks(renderToStaticMarkup(
    React.createElement(ReceiptPrint, {
      patientData: { name: '領収 太郎', patientId: 'PAT-RCPT-001' },
      totalPoints: 83,
      insuranceAmounts,
      receiptBreakdownRows: [{ label: '調剤技術料', points: 71, note: '基本料・加算・調製料' }],
      pharmacyInfo,
      pharmacyAddressLine: '東京都千代田区1-1-1',
      receiptRunId: '3f2a9c1e-7b4d-',
      currentDateStr: '2026年10月30日',
      dispensingDateStr: '2026年10月30日',
      prescriptionDateStr: '2026年10月30日',
      renderIdentityMark: () => null,
      ...extra
    })
  ));
}

// ---- 領収証: バーコード ----

test('the receipt prints the barcode of its own amount, with the readable caption under it', () => {
  const built = buildReceiptBarcode({ insuranceType: '国保', copayYen: 250 });
  assert.ok(built.ok);
  if (!built.ok) return;
  const html = renderReceipt({ barcode: { payload: built.payload, caption: built.caption } });

  assert.ok(html.includes('data-testid="receipt-barcode"'));
  assert.ok(html.includes(`data-barcode-payload="${built.payload}"`));
  assert.match(built.payload, /^1\d{7}\d$/);
  assert.strictEqual(built.payload.slice(0, 8), '10000250', '区分1桁 + 金額7桁');
  assert.ok(html.includes(`国保 / ¥250 / ${built.payload}`), 'the caption is printed under the bars');
  assert.ok((html.match(/<rect /g) || []).length > 20, 'the bars are drawn');
  assert.ok(html.includes('role="img"'));
  // 領収金額の表示と、バーコードに入れた金額は同じ値
  assert.ok(html.includes('¥250'));
});

test('the receipt without a barcode prop prints none (existing callers are unchanged)', () => {
  const html = renderReceipt();
  assert.ok(!html.includes('receipt-barcode'));
  assert.ok(!html.includes('role="img"'), 'no barcode image (the header icon is decorative)');
});

// ---- 領収証: 点数未設定 ----

test('with an unset fee the receipt shows 点数未設定 instead of any amount, and prints no barcode', () => {
  const html = renderReceipt({
    unsetFeeNames: ['休日加算'],
    barcode: { payload: 'x/20261030/250', caption: 'x / 2026-10-30 / ¥250' },
    receiptBreakdownRows: [
      { label: '調剤技術料', points: 71, note: '基本料・加算・調製料' },
      { label: '休日加算', points: 0, note: '点数未設定', unset: true }
    ]
  });

  assert.ok(html.includes('data-testid="receipt-amount-pending"'));
  assert.ok(html.includes('休日加算の点数が点数表に未設定のため、金額は確定していません。'));
  assert.ok(html.includes('点数未設定'));
  // 窓口負担・診療総額・保険者負担・総点数のどれも数字で出さない
  assert.ok(!html.includes('¥250'), 'no copay amount');
  assert.ok(!html.includes('¥830'), 'no total cost');
  assert.ok(!html.includes('¥580'), 'no insurer amount');
  assert.ok(!html.includes('83 点'), 'no total points');
  assert.ok(!html.includes('保険調剤一部負担金として上記正に領収いたしました'), 'the acknowledgement wording is not printed');
  assert.ok(!html.includes('receipt-barcode'), 'no barcode without a confirmed amount');
  assert.ok(html.includes('<td className="text-right">未設定</td>') || html.includes('>未設定<'), 'the unset row says 未設定');
  assert.ok(html.includes('71 点'), 'confirmed rows still show their points');
});

test('with no unset fee the receipt keeps showing amounts', () => {
  const html = renderReceipt({ unsetFeeNames: [] });
  assert.ok(!html.includes('receipt-amount-pending'));
  assert.ok(html.includes('¥250'));
  assert.ok(html.includes('83 点'));
});

test('the condition panel slot is rendered inside the receipt card, before the paper', () => {
  const html = renderReceipt({ conditionPanel: React.createElement('div', { 'data-testid': 'slot-marker' }, 'パネル') });
  const slot = html.indexOf('data-testid="slot-marker"');
  const paper = html.indexOf('data-testid="receipt-doc"');
  assert.ok(slot > 0 && slot < paper);
});

// ---- 調剤明細書: 点数未設定 ----

function renderStatement(calculatedFees: readonly ReceiptStatementFeeLike[]) {
  return stripStyleBlocks(renderToStaticMarkup(
    React.createElement(ReceiptStatementPrint, {
      patientData: { name: '明細 太郎', patientId: 'PAT-STMT-001', insuranceInfo: { provider: '06130012', number: '123456', burdenRatio: 30 } },
      visitData: { institutionName: '千代田メディカルクリニック', departmentName: '内科', doctorName: '佐藤 健太' },
      calculatedFees,
      totalPoints: 83,
      insuranceAmounts,
      pharmacyInfo,
      pharmacyAddressLine: '東京都千代田区1-1-1',
      receiptRunId: '3f2a9c1e-7b4d-',
      currentDateStr: '2026年10月30日',
      patientBirthDateStr: '1980年1月1日',
      dispensingDateStr: '2026年10月30日',
      prescriptionDateStr: '2026年10月30日',
      renderIdentityMark: () => null
    })
  ));
}

test('the statement hides its totals while a fee has no points, and marks that fee 未設定', () => {
  const html = renderStatement([
    { code: 'base_fee' as const, name: '調剤基本料1', rationale: '基本料', points: 47, receiptFeeCode: '410004110' },
    { code: 'medication_guidance' as const, name: '服薬管理指導料(お薬手帳なし)', rationale: '点数が未設定です', points: 0, pointsUnset: true }
  ]);
  assert.ok(html.includes('点数未設定'));
  assert.ok(!html.includes('¥250') && !html.includes('¥830') && !html.includes('¥580'));
  assert.ok(!html.includes('83 点'));
  assert.ok(html.includes('statement-point-cell">未設定<'));
  assert.ok(html.includes('statement-point-cell">47<'));
});

test('the statement keeps its totals when every fee has points', () => {
  const html = renderStatement([{ code: 'base_fee' as const, name: '調剤基本料1', rationale: '基本料', points: 47 }]);
  assert.ok(html.includes('¥250') && html.includes('¥830') && html.includes('¥580'));
  assert.ok(html.includes('83 点'));
  assert.ok(!html.includes('点数未設定'));
});

// ---- 条件パネル ----

const preview = (copayYen: number | null, totalPoints = 83): ConditionChoicePreview => ({
  totalPoints,
  copayYen,
  unsetFeeNames: copayYen === null ? ['未設定の項目'] : []
});

const previews: ConditionChoicePreviews = {
  medicationNotebook: { carried: preview(250), not_carried: preview(null) },
  afterHoursCategory: { none: preview(250), after_hours: preview(null), holiday: preview(null), late_night: preview(null) },
  tokkanOverride: { item: preview(250), none: preview(220), '1': preview(280), '3_i': preview(265) }
};

function panelProps(overrides: Partial<ReceiptConditionPanelProps> = {}): ReceiptConditionPanelProps {
  return {
    conditions: { medicationNotebook: 'carried', afterHoursCategory: 'none', tokkanOverride: undefined },
    previews,
    current: preview(250),
    autoJudgement: { status: 'unavailable', reason: 'hours_unconfigured', message: '開局時間が未設定のため自動判定できません。' },
    receptionAtText: '2026/10/30 21:30',
    canPrintReceipt: true,
    barcodeStatus: { kind: 'ok', payload: '100007509', categoryText: '国保', amountYen: 750, assumed: false, reason: '保険種別「国保」' },
    onChange: () => {},
    onApplyAutoJudgement: () => {},
    onPrintReceiptOnly: () => {},
    ...overrides
  };
}

function renderPanel(overrides: Partial<ReceiptConditionPanelProps> = {}) {
  return stripStyleBlocks(renderToStaticMarkup(React.createElement(ReceiptConditionPanel, panelProps(overrides))));
}

test('the panel offers every condition with the amount each choice would give, and marks the current choices', () => {
  const html = renderPanel({
    conditions: { medicationNotebook: 'not_carried', afterHoursCategory: 'holiday', tokkanOverride: '1' }
  });
  for (const id of [
    'condition-notebook-carried', 'condition-notebook-not_carried',
    'condition-after-hours-none', 'condition-after-hours-after_hours', 'condition-after-hours-holiday', 'condition-after-hours-late_night',
    'condition-tokkan-item', 'condition-tokkan-none', 'condition-tokkan-1', 'condition-tokkan-3_i'
  ]) {
    assert.ok(html.includes(`data-testid="${id}"`), id);
  }
  assert.ok(/checked=""/.test(findOpeningTag(html, 'data-testid="condition-notebook-not_carried"', 'input')));
  assert.ok(!/checked=""/.test(findOpeningTag(html, 'data-testid="condition-notebook-carried"', 'input')));
  assert.ok(/checked=""/.test(findOpeningTag(html, 'data-testid="condition-after-hours-holiday"', 'input')));
  assert.ok(/checked=""/.test(findOpeningTag(html, 'data-testid="condition-tokkan-1"', 'input')));
  assert.ok(!/checked=""/.test(findOpeningTag(html, 'data-testid="condition-tokkan-item"', 'input')));
  assert.ok(html.includes('¥280'), 'the amount for tokkan 1');
  assert.ok(html.includes('¥220'), 'the amount for no tokkan');
  assert.ok((html.match(/点数未設定/g) || []).length >= 4, 'unset choices say so instead of showing a number');
});

test('with nothing chosen the defaults are selected: notebook carried, normal hours, per-item tokkan', () => {
  const html = renderPanel();
  assert.ok(/checked=""/.test(findOpeningTag(html, 'data-testid="condition-notebook-carried"', 'input')));
  assert.ok(/checked=""/.test(findOpeningTag(html, 'data-testid="condition-after-hours-none"', 'input')));
  assert.ok(/checked=""/.test(findOpeningTag(html, 'data-testid="condition-tokkan-item"', 'input')));
});

test('the panel shows the current copay, or 点数未設定 with the print button off when it is not confirmed', () => {
  const ok = renderPanel();
  assert.ok(/receipt-condition-current[\s\S]*?¥250/.test(ok));
  assert.ok(!ok.includes('data-testid="receipt-condition-unset"'));
  assert.ok(!/disabled=""/.test(findOpeningTag(ok, 'data-testid="print-receipt-only-button"', 'button')));

  const unset = renderPanel({ current: preview(null) });
  assert.ok(/receipt-condition-current[\s\S]*?点数未設定/.test(unset));
  assert.ok(unset.includes('data-testid="receipt-condition-unset"'));
  assert.ok(unset.includes('領収証は印刷できず、請求も確定できません'));
  assert.ok(/disabled=""/.test(findOpeningTag(unset, 'data-testid="print-receipt-only-button"', 'button')));
});

test('without print permission the receipt-only print is off, but the conditions stay editable', () => {
  const html = renderPanel({ canPrintReceipt: false });
  assert.ok(/disabled=""/.test(findOpeningTag(html, 'data-testid="print-receipt-only-button"', 'button')));
  assert.ok(!/<fieldset[^>]*disabled=""/.test(html));
});

test('a locked claim disables every condition group and says why', () => {
  const html = renderPanel({ lockedReason: 'RECEIPT_v1.uke 後の請求はロックされています。' });
  assert.strictEqual((html.match(/<fieldset[^>]*disabled=""/g) || []).length, 3, 'all three groups are disabled');
  assert.ok(html.includes('data-testid="receipt-condition-locked"'));
  assert.ok(html.includes('RECEIPT_v1.uke 後の請求はロックされています。'));
  assert.ok(!html.includes('各選択肢の右の金額は'), 'the how-to line gives way to the lock reason');
  assert.ok(!/disabled=""/.test(findOpeningTag(html, 'data-testid="print-receipt-only-button"', 'button')), 're-printing receipt remains enabled even when claim is locked');
});

test('while saving, the conditions and the print button are off', () => {
  const html = renderPanel({ busy: true });
  assert.strictEqual((html.match(/<fieldset[^>]*disabled=""/g) || []).length, 3);
  assert.ok(/disabled=""/.test(findOpeningTag(html, 'data-testid="print-receipt-only-button"', 'button')));
});

test('the automatic judgement is shown, and offered only when it differs from the current choice', () => {
  const judged = (category: 'none' | 'after_hours' | 'holiday' | 'late_night') => ({
    status: 'judged' as const,
    category,
    reason: '平日の開局時間 09:00〜18:00 の外'
  });
  const differs = renderPanel({ autoJudgement: judged('after_hours') });
  assert.ok(differs.includes('受付時刻 2026/10/30 21:30 から自動判定'));
  assert.ok(differs.includes('平日の開局時間 09:00〜18:00 の外'));
  assert.ok(differs.includes('data-testid="condition-apply-auto"'));
  assert.ok(differs.includes('自動判定に合わせる（時間外）'));
  assert.ok(!/disabled=""/.test(findOpeningTag(differs, 'data-testid="condition-apply-auto"', 'button')), 'apply auto judgement button is enabled normally');

  const differsBusy = renderPanel({ autoJudgement: judged('after_hours'), busy: true });
  assert.ok(/disabled=""/.test(findOpeningTag(differsBusy, 'data-testid="condition-apply-auto"', 'button')), 'apply auto judgement button is disabled while saving');

  const differsLocked = renderPanel({ autoJudgement: judged('after_hours'), lockedReason: 'ロック中' });
  assert.ok(/disabled=""/.test(findOpeningTag(differsLocked, 'data-testid="condition-apply-auto"', 'button')), 'apply auto judgement button is disabled when locked');

  const same = renderPanel({
    autoJudgement: judged('after_hours'),
    conditions: { medicationNotebook: 'carried', afterHoursCategory: 'after_hours', tokkanOverride: undefined }
  });
  assert.ok(!same.includes('condition-apply-auto'));

  const unavailable = renderPanel();
  assert.ok(unavailable.includes('開局時間が未設定のため自動判定できません。'));
  assert.ok(!unavailable.includes('condition-apply-auto'));
});

// ---- 操作 → 保存する条件 ----

type AnyElement = React.ReactElement<{ children?: React.ReactNode; [key: string]: unknown }>;

function findElements(node: React.ReactNode, predicate: (element: AnyElement) => boolean, found: AnyElement[] = []): AnyElement[] {
  if (Array.isArray(node)) {
    node.forEach((child) => findElements(child, predicate, found));
  } else if (React.isValidElement(node)) {
    const element = node as AnyElement;
    if (predicate(element)) found.push(element);
    findElements(element.props.children, predicate, found);
  }
  return found;
}

// memo で包んだコンポーネントを関数として呼び、返った要素から操作の入口を探す (フックは使っていない)
function renderTree(overrides: Partial<ReceiptConditionPanelProps>) {
  return (ReceiptConditionPanel as unknown as { type: (props: ReceiptConditionPanelProps) => React.ReactNode }).type(panelProps(overrides));
}

function choose(overrides: Partial<ReceiptConditionPanelProps>, testId: string) {
  const patches: unknown[] = [];
  const tree = renderTree({ ...overrides, onChange: (patch) => patches.push(patch) });
  const [input] = findElements(tree, (element) => element.props['data-testid'] === testId);
  assert.ok(input, `${testId} exists`);
  (input.props.onChange as () => void)();
  assert.strictEqual(patches.length, 1, `${testId} reports one change`);
  return patches[0] as Record<string, unknown>;
}

test('choosing a value reports just that condition; choosing the default clears it', () => {
  assert.deepStrictEqual(choose({}, 'condition-notebook-not_carried'), { medicationNotebook: 'not_carried' });
  const cleared = choose({}, 'condition-notebook-carried');
  assert.deepStrictEqual(Object.keys(cleared), ['medicationNotebook']);
  assert.strictEqual(cleared.medicationNotebook, undefined);

  assert.deepStrictEqual(choose({}, 'condition-after-hours-holiday'), { afterHoursCategory: 'holiday' });
  assert.deepStrictEqual(choose({}, 'condition-after-hours-late_night'), { afterHoursCategory: 'late_night' });
  assert.deepStrictEqual(choose({}, 'condition-after-hours-after_hours'), { afterHoursCategory: 'after_hours' });
  const normal = choose({}, 'condition-after-hours-none');
  assert.deepStrictEqual(Object.keys(normal), ['afterHoursCategory']);
  assert.strictEqual(normal.afterHoursCategory, undefined);

  assert.deepStrictEqual(choose({}, 'condition-tokkan-none'), { tokkanOverride: 'none' });
  assert.deepStrictEqual(choose({}, 'condition-tokkan-1'), { tokkanOverride: '1' });
  assert.deepStrictEqual(choose({}, 'condition-tokkan-3_i'), { tokkanOverride: '3_i' });
  const perItem = choose({}, 'condition-tokkan-item');
  assert.deepStrictEqual(Object.keys(perItem), ['tokkanOverride']);
  assert.strictEqual(perItem.tokkanOverride, undefined);
});

test('the auto-judgement button and the receipt-only print button call their own handlers', () => {
  let applied = 0;
  let printed = 0;
  const tree = renderTree({
    autoJudgement: { status: 'judged', category: 'late_night', reason: '深夜の時間帯 (22:00〜06:00)' },
    onApplyAutoJudgement: () => { applied += 1; },
    onPrintReceiptOnly: () => { printed += 1; }
  });
  const [apply] = findElements(tree, (element) => element.props['data-testid'] === 'condition-apply-auto');
  const [print] = findElements(tree, (element) => element.props['data-testid'] === 'print-receipt-only-button');
  (apply.props.onClick as () => void)();
  (print.props.onClick as () => void)();
  assert.deepStrictEqual([applied, printed], [1, 1]);
});

// ---- 条件パネル: 照合バーコードの状態 ----

test('the panel shows the barcode category, amount, digits and where the category came from', () => {
  const html = renderPanel();
  assert.ok(html.includes('data-testid="receipt-condition-barcode"'));
  assert.ok(/照合バーコード：<strong>国保<\/strong> ¥750/.test(html));
  assert.ok(html.includes('100007509'));
  assert.ok(html.includes('保険種別「国保」'));
  assert.ok(!html.includes('receipt-condition-barcode-assumed'), 'no warning when the category was recognised');
});

test('a category assumed as self pay is called out on screen with what falls into it', () => {
  const status: ReceiptBarcodeStatus = {
    kind: 'ok',
    payload: '300007507',
    categoryText: '自費扱い',
    amountYen: 750,
    assumed: true,
    reason: '公費のみ (保険種別・保険者番号なし)'
  };
  const html = renderPanel({ barcodeStatus: status });
  assert.ok(/照合バーコード：<strong>自費扱い<\/strong> ¥750/.test(html));
  assert.ok(html.includes('data-testid="receipt-condition-barcode-assumed"'));
  assert.ok(html.includes('保険区分を判定できないため、自費として扱っています。'));
  assert.ok(html.includes('公費のみ・労災・自賠責・保険情報なしも自費になります。'));
  assert.ok(html.includes('患者の保険種別を設定してください'));
  assert.ok(html.includes('公費のみ (保険種別・保険者番号なし)'), 'the reason is shown');
  assert.ok(html.includes('condition-barcode assumed') || /class="[^"]*condition-barcode[^"]*assumed/.test(html), 'styled as a warning');
});

test('an explicit 自費 choice is shown without the assumption warning', () => {
  const html = renderPanel({
    barcodeStatus: { kind: 'ok', payload: '300007507', categoryText: '自費', amountYen: 750, assumed: false, reason: '保険種別「自費」' }
  });
  assert.ok(/照合バーコード：<strong>自費<\/strong>/.test(html));
  assert.ok(!html.includes('receipt-condition-barcode-assumed'));
});

test('when no barcode is printed the panel says so and gives the reason', () => {
  const overflow = renderPanel({
    barcodeStatus: { kind: 'none', message: '領収金額が9,999,999円を超え、バーコードの桁数(金額7桁)に収まらないため、バーコードを印字しません。' }
  });
  assert.ok(overflow.includes('照合バーコード：印字しません。'));
  assert.ok(overflow.includes('9,999,999円を超え'));
  assert.ok(!overflow.includes('receipt-condition-barcode-assumed'));

  const unset = renderPanel({
    barcodeStatus: { kind: 'none', message: '点数が未設定で金額が確定しないため、バーコードは印字しません。' }
  });
  assert.ok(unset.includes('点数が未設定で金額が確定しない'));
});
