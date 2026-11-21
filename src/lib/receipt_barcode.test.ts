import { test } from 'node:test';
import assert from 'node:assert';
import {
  INSURANCE_BARCODE_CODES,
  RECEIPT_BARCODE_MAX_AMOUNT_YEN,
  buildReceiptBarcode,
  classifyInsuranceForBarcode,
  describeBarcodeCategory,
  hasValidLuhnCheckDigit,
  luhnCheckDigit,
  parseReceiptBarcodePayload
} from './receipt_barcode.ts';
import React from 'react';
import { renderMarkupWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';
import { PatientBanner } from '@/app/emr/components/PatientBanner';
import { isCode128Printable, layoutCode128B } from './code128.ts';

// ---- チェックデジット (Luhn / mod 10) ----

test('the Luhn check digit follows the standard test vectors', () => {
  // 7992739871 → 3 は Luhn の定番のテスト値 (全体 79927398713)
  assert.strictEqual(luhnCheckDigit('7992739871'), '3');
  assert.strictEqual(luhnCheckDigit('4539578763621486'.slice(0, -1)), '6', 'a 16-digit card-style number');
  assert.strictEqual(luhnCheckDigit('0'), '0');
  assert.strictEqual(luhnCheckDigit('1'), '8');
});

test('the check digit of the documented examples is worked out digit by digit', () => {
  // 国保 ¥750: 本体 1 0000750 = 1,0,0,0,0,7,5,0
  //   右から 0(×2=0) 5 7(×2=14→5) 0 0(×2=0) 0 0(×2=0) 1 → 0+5+5+0+0+0+0+1 = 11 → (10 - 1) % 10 = 9
  assert.strictEqual(luhnCheckDigit('10000750'), '9');
  // 自費 ¥12,340: 本体 3 0012340 = 3,0,0,1,2,3,4,0
  //   右から 0(×2=0) 4 3(×2=6) 2 1(×2=2) 0 0(×2=0) 3 → 0+4+6+2+2+0+0+3 = 17 → (10 - 7) % 10 = 3
  assert.strictEqual(luhnCheckDigit('30012340'), '3');
  // 社保 ¥1,130: 本体 2 0001130 → 0+3+2+1+0+0+0+2 = 8 → 2
  assert.strictEqual(luhnCheckDigit('20001130'), '2');
});

test('a body whose digit sum is already a multiple of 10 gets check digit 0, not 10', () => {
  // 19: 右から 9(×2=18→9) 1 → 9+1 = 10 → (10 - 0) % 10 = 0
  assert.strictEqual(luhnCheckDigit('19'), '0');
  assert.ok(hasValidLuhnCheckDigit('190'));
});

test('every single-digit mistake in the 9 digits is caught, and so are adjacent swaps except 09/90', () => {
  const payload = buildReceiptBarcodeOk({ insuranceType: '国保', copayYen: 4560 }).payload;
  assert.ok(hasValidLuhnCheckDigit(payload));
  for (let i = 0; i < payload.length; i++) {
    for (let digit = 0; digit <= 9; digit++) {
      if (String(digit) === payload[i]) continue;
      const mistaken = payload.slice(0, i) + digit + payload.slice(i + 1);
      assert.ok(!hasValidLuhnCheckDigit(mistaken), `position ${i} read as ${digit}`);
    }
  }
  for (let i = 0; i < payload.length - 1; i++) {
    if (payload[i] === payload[i + 1]) continue;
    const swapped = payload.slice(0, i) + payload[i + 1] + payload[i] + payload.slice(i + 2);
    const isNineZero = (payload[i] === '0' && payload[i + 1] === '9') || (payload[i] === '9' && payload[i + 1] === '0');
    if (isNineZero) continue;
    assert.ok(!hasValidLuhnCheckDigit(swapped), `adjacent swap at ${i}`);
  }
});

test('luhnCheckDigit rejects anything but digits', () => {
  assert.throws(() => luhnCheckDigit('12a4'));
  assert.throws(() => luhnCheckDigit(''));
  assert.strictEqual(hasValidLuhnCheckDigit('1'), false);
  assert.strictEqual(hasValidLuhnCheckDigit('12a45'), false);
});

// ---- バーコードの中身 ----

function buildReceiptBarcodeOk(input: Parameters<typeof buildReceiptBarcode>[0]) {
  const result = buildReceiptBarcode(input);
  assert.strictEqual(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('unreachable');
  return result;
}

test('the payload is the category digit, the amount in 7 zero-padded digits, and the check digit', () => {
  assert.strictEqual(buildReceiptBarcodeOk({ insuranceType: '国保', copayYen: 750 }).payload, '100007509');
  assert.strictEqual(buildReceiptBarcodeOk({ insuranceType: '社保', copayYen: 1130 }).payload, '200011302');
  assert.strictEqual(buildReceiptBarcodeOk({ insuranceType: '自費', copayYen: 12340 }).payload, '300123403');
});

test('a zero copay is still encoded (no amount is not the same as zero yen)', () => {
  const result = buildReceiptBarcodeOk({ insuranceType: '社保', copayYen: 0 });
  assert.strictEqual(result.payload.length, 9);
  assert.strictEqual(result.payload.slice(0, 8), '20000000');
  assert.deepStrictEqual(parseReceiptBarcodePayload(result.payload), { category: 'social', amountYen: 0 });
});

test('the payload changes when the amount or the category changes (a re-issued receipt is distinguishable)', () => {
  const base = buildReceiptBarcodeOk({ insuranceType: '社保', copayYen: 750 }).payload;
  assert.notStrictEqual(buildReceiptBarcodeOk({ insuranceType: '社保', copayYen: 780 }).payload, base);
  assert.notStrictEqual(buildReceiptBarcodeOk({ insuranceType: '国保', copayYen: 750 }).payload, base);
});

test('the largest amount fits in 7 digits, and one yen more is refused with a reason', () => {
  const max = buildReceiptBarcodeOk({ insuranceType: '国保', copayYen: RECEIPT_BARCODE_MAX_AMOUNT_YEN });
  assert.strictEqual(max.payload, '199999996');
  assert.strictEqual(RECEIPT_BARCODE_MAX_AMOUNT_YEN, 9_999_999);

  const over = buildReceiptBarcode({ insuranceType: '国保', copayYen: RECEIPT_BARCODE_MAX_AMOUNT_YEN + 1 });
  assert.strictEqual(over.ok, false);
  if (!over.ok) {
    assert.strictEqual(over.reason, 'amount_overflow');
    assert.match(over.message, /9,999,999円を超え/);
    assert.match(over.message, /バーコードを印字しません/);
  }
});

test('a negative, fractional or non-finite amount builds no barcode', () => {
  for (const copayYen of [-1, 12.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = buildReceiptBarcode({ insuranceType: '社保', copayYen });
    assert.strictEqual(result.ok, false, String(copayYen));
    if (!result.ok) assert.strictEqual(result.reason, 'amount_invalid');
  }
});

test('the payload is 9 digits, printable by Code128, and short enough for a 148 mm receipt at any amount', () => {
  for (const copayYen of [0, 1, 750, 12340, 9_999_999]) {
    const { payload } = buildReceiptBarcodeOk({ insuranceType: '自費', copayYen });
    assert.match(payload, /^\d{9}$/);
    assert.ok(isCode128Printable(payload));
    const { modules } = layoutCode128B(payload);
    // 9桁は 数字ごとに11モジュール + 開始・チェック・終了。0.28mm で 50mm に満たない
    assert.strictEqual(modules, 11 * (9 + 2) + 13);
    assert.ok(modules * 0.28 < 50);
  }
});

test('parsing returns exactly what was built', () => {
  const { payload } = buildReceiptBarcodeOk({ insuranceType: '自費', copayYen: 12340 });
  assert.deepStrictEqual(parseReceiptBarcodePayload(payload), { category: 'self_pay', amountYen: 12340 });
  assert.deepStrictEqual(parseReceiptBarcodePayload('100007509'), { category: 'national', amountYen: 750 });
});

test('parsing rejects a wrong length, a non-digit, an unknown category code and a failed check digit', () => {
  for (const bad of ['', '10000750', '1000075099', '10000750a', '1 0000750', '000007507', '400007501', '100007508']) {
    assert.strictEqual(parseReceiptBarcodePayload(bad), null, JSON.stringify(bad));
  }
  // 区分コードは 1〜3 だけ。チェックデジットが合っていても 0 や 4 は受け付けない
  for (const code of ['0', '4', '9']) {
    const body = `${code}0000750`;
    assert.strictEqual(parseReceiptBarcodePayload(`${body}${luhnCheckDigit(body)}`), null, `category code ${code}`);
  }
});

test('the category codes are 1 national, 2 social, 3 self pay', () => {
  assert.deepStrictEqual(INSURANCE_BARCODE_CODES, { national: '1', social: '2', self_pay: '3' });
});

// ---- 人が読める文字 ----

test('the caption names the category, the amount and the digits', () => {
  assert.strictEqual(buildReceiptBarcodeOk({ insuranceType: '国保', copayYen: 750 }).caption, '国保 / ¥750 / 100007509');
  assert.strictEqual(buildReceiptBarcodeOk({ insuranceType: '自費', copayYen: 12340 }).caption, '自費 / ¥12,340 / 300123403');
});

test('a category assumed because nothing matched is written 自費扱い, so the paper shows what actually happened', () => {
  const unknown = buildReceiptBarcodeOk({ insuranceType: '労災', copayYen: 750 });
  assert.strictEqual(unknown.category, 'self_pay');
  assert.strictEqual(unknown.classification.assumed, true);
  assert.strictEqual(unknown.caption, '自費扱い / ¥750 / 300007507');
  assert.strictEqual(describeBarcodeCategory(unknown.classification), '自費扱い');

  const chosen = buildReceiptBarcodeOk({ insuranceType: '自費', copayYen: 750 });
  assert.strictEqual(chosen.classification.assumed, false);
  assert.strictEqual(chosen.caption, '自費 / ¥750 / 300007507');
});

// ---- 保険区分の割り当て表 ----

interface ClassificationCase {
  name: string;
  input: Parameters<typeof classifyInsuranceForBarcode>[0];
  category: 'national' | 'social' | 'self_pay';
  assumed: boolean;
  reasonIncludes: string;
}

const CLASSIFICATION_TABLE: ClassificationCase[] = [
  // 保険種別で決まるもの (既存の月次UKEの分類)
  { name: '国保', input: { insuranceType: '国保' }, category: 'national', assumed: false, reasonIncludes: '国保' },
  { name: '国民健康保険', input: { insuranceType: '国民健康保険' }, category: 'national', assumed: false, reasonIncludes: '国民健康保険' },
  { name: '国保組合 (国保と組合を両方含む)', input: { insuranceType: '国保組合' }, category: 'national', assumed: false, reasonIncludes: '国保組合' },
  { name: '後期高齢 (画面の選択肢)', input: { insuranceType: '後期高齢' }, category: 'national', assumed: false, reasonIncludes: '後期高齢' },
  { name: '後期高齢者医療', input: { insuranceType: '後期高齢者医療' }, category: 'national', assumed: false, reasonIncludes: '後期高齢者医療' },
  { name: '社保', input: { insuranceType: '社保' }, category: 'social', assumed: false, reasonIncludes: '社保' },
  { name: '協会けんぽ', input: { insuranceType: '協会けんぽ' }, category: 'social', assumed: false, reasonIncludes: '協会けんぽ' },
  { name: '健康保険組合', input: { insuranceType: '健康保険組合' }, category: 'social', assumed: false, reasonIncludes: '健康保険組合' },
  { name: '共済組合', input: { insuranceType: '共済組合' }, category: 'social', assumed: false, reasonIncludes: '共済組合' },
  { name: '被用者保険', input: { insuranceType: '被用者保険' }, category: 'social', assumed: false, reasonIncludes: '被用者保険' },
  // 自費 (画面の選択肢)
  { name: '自費', input: { insuranceType: '自費' }, category: 'self_pay', assumed: false, reasonIncludes: '自費' },
  // 種別が書かれていれば、保険者番号より種別を優先する
  { name: '種別は国保で番号は8桁', input: { insuranceType: '国保', provider: '06130012' }, category: 'national', assumed: false, reasonIncludes: '国保' },
  { name: '種別は社保で番号は6桁', input: { insuranceType: '社保', provider: '123456' }, category: 'social', assumed: false, reasonIncludes: '社保' },
  { name: '種別は自費で保険者番号も入っている', input: { insuranceType: '自費', provider: '06130012' }, category: 'self_pay', assumed: false, reasonIncludes: '自費' },
  // 種別が空のときは保険者番号 (既存の月次UKEと同じ)
  { name: '種別なし・6桁', input: { provider: '123456' }, category: 'national', assumed: false, reasonIncludes: '6桁' },
  // 8桁は 06・07 に限らず社保 (01 の協会けんぽ、31〜34 の共済、63 の健保組合 など)
  { name: '種別なし・8桁で06始まり', input: { provider: '06130012' }, category: 'social', assumed: false, reasonIncludes: '8桁' },
  { name: '種別なし・8桁で07始まり', input: { provider: '07130012' }, category: 'social', assumed: false, reasonIncludes: '8桁' },
  { name: '種別なし・8桁で01始まり (協会けんぽ)', input: { provider: '01130012' }, category: 'social', assumed: false, reasonIncludes: '8桁' },
  { name: '種別なし・8桁で31始まり (共済)', input: { provider: '31130012' }, category: 'social', assumed: false, reasonIncludes: '8桁' },
  { name: '種別なし・8桁で63始まり (健保組合)', input: { provider: '63130012' }, category: 'social', assumed: false, reasonIncludes: '8桁' },
  { name: '種別なし・8桁で00始まり', input: { provider: '00130012' }, category: 'social', assumed: false, reasonIncludes: '8桁' },
  { name: '種別が空白だけ・6桁', input: { insuranceType: '  ', provider: '123456' }, category: 'national', assumed: false, reasonIncludes: '6桁' },
  { name: '保険者番号にハイフンなどが混ざる', input: { provider: '01-130012' }, category: 'social', assumed: false, reasonIncludes: '8桁' },
  { name: '種別が空白だけ・8桁', input: { insuranceType: '   ', provider: '01130012' }, category: 'social', assumed: false, reasonIncludes: '8桁' },
  // 判定できないものは自費扱い (assumed)
  { name: '労災', input: { insuranceType: '労災' }, category: 'self_pay', assumed: true, reasonIncludes: '「労災」' },
  { name: '自賠責', input: { insuranceType: '自賠責' }, category: 'self_pay', assumed: true, reasonIncludes: '「自賠責」' },
  { name: '公費のみ (公費の登録あり・保険情報なし)', input: { hasPublicInsurance: true }, category: 'self_pay', assumed: true, reasonIncludes: '公費のみ' },
  { name: '保険情報なし', input: {}, category: 'self_pay', assumed: true, reasonIncludes: '保険情報なし' },
  { name: '保険情報が空文字', input: { insuranceType: '', provider: '' }, category: 'self_pay', assumed: true, reasonIncludes: '保険情報なし' },
  // 6桁と8桁以外の桁数は、従来どおり判定できず自費扱い
  { name: '種別なし・5桁', input: { provider: '12345' }, category: 'self_pay', assumed: true, reasonIncludes: '判定できない' },
  { name: '種別なし・7桁', input: { provider: '1234567' }, category: 'self_pay', assumed: true, reasonIncludes: '判定できない' },
  { name: '種別なし・9桁', input: { provider: '123456789' }, category: 'self_pay', assumed: true, reasonIncludes: '判定できない' },
  { name: '種別なし・桁が数字でない', input: { provider: 'abcdefgh' }, category: 'self_pay', assumed: true, reasonIncludes: '保険情報なし' },
  { name: '種別なし・null', input: { insuranceType: null, provider: null }, category: 'self_pay', assumed: true, reasonIncludes: '保険情報なし' }
];

for (const row of CLASSIFICATION_TABLE) {
  test(`insurance category: ${row.name}`, () => {
    const result = classifyInsuranceForBarcode(row.input);
    assert.strictEqual(result.category, row.category);
    assert.strictEqual(result.assumed, row.assumed);
    assert.ok(result.reason.includes(row.reasonIncludes), `reason "${result.reason}" should include "${row.reasonIncludes}"`);
  });
}

test('a public-expense registration does not change the category of a patient who has insurance', () => {
  assert.strictEqual(classifyInsuranceForBarcode({ insuranceType: '社保', hasPublicInsurance: true }).category, 'social');
  assert.strictEqual(classifyInsuranceForBarcode({ provider: '123456', hasPublicInsurance: true }).category, 'national');
});

test('every 保険種別 the patient editor offers has a defined barcode category, and 自費 is one of them', () => {
  const html = renderMarkupWithReactUseStateMock(
    () => React.createElement(PatientBanner, {
      patientAlerts: [],
      targetVisitId: 'v-barcode-ins-types',
      onOpenPicking: () => {}
    }),
    {
      componentName: 'PatientBanner',
      restoreAtCallIndex: 37,
      minCalls: 38,
      overrides: {
        0: {
          value: {
            patientId: 'pt_barcode_ins_types',
            name: 'テスト 太郎',
            kana: 'テスト タロウ',
            birthDate: '1980-01-01',
            insuranceInfo: { insuranceType: '社保', burdenRatio: 30 }
          }
        },
        7: { value: true }
      }
    }
  );
  const select = html.match(/<select[^>]*id="m-ins-type"[^>]*>[\s\S]*?<\/select>/)?.[0] ?? '';
  assert.ok(select.length > 0, 'PatientBanner edit modal must render <select id="m-ins-type">');
  const values = [...select.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepStrictEqual(values, ['社保', '国保', '後期高齢', '自費']);
  const categories = values.map((value) => {
    const result = classifyInsuranceForBarcode({ insuranceType: value });
    assert.strictEqual(result.assumed, false, `「${value}」 is a defined choice, not a fallback`);
    return result.category;
  });
  assert.deepStrictEqual(categories, ['social', 'national', 'national', 'self_pay']);
});
