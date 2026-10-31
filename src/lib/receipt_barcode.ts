// 領収証に印字する照合バーコードの中身。保険区分と領収金額だけを、数字9桁の固定長にする。
//
//   {区分1桁}{領収金額7桁(円・ゼロ埋め)}{チェックデジット1桁}
//   区分: 1=国保 / 2=社保 / 3=自費
//   例: 国保 ¥750 → 1 0000750 9 → `100007509`
//
// チェックデジットは Luhn (mod 10)。Code128 自身のチェックサムとは別に、読み取り側が
// 「区分と金額が欠けたり1桁ずれたりしていない」ことを数字だけで確かめられるようにする。
// 特定のレジ・会計ソフトの仕様に合わせたものではない。読ませる先が決まったら、その仕様に
// 合わせて作り直す (docs/user_manual.md の 3.4.1)。

export type InsuranceBarcodeCategory = 'national' | 'social' | 'self_pay';

export const INSURANCE_BARCODE_CODES: Record<InsuranceBarcodeCategory, string> = {
  national: '1',
  social: '2',
  self_pay: '3'
};

export const INSURANCE_BARCODE_LABELS: Record<InsuranceBarcodeCategory, string> = {
  national: '国保',
  social: '社保',
  self_pay: '自費'
};

/** 金額の桁数。7桁なので 9,999,999円まで */
export const RECEIPT_BARCODE_AMOUNT_DIGITS = 7;
export const RECEIPT_BARCODE_MAX_AMOUNT_YEN = 9_999_999;
export const RECEIPT_BARCODE_LENGTH = 1 + RECEIPT_BARCODE_AMOUNT_DIGITS + 1;

// ---------------------------------------------------------------------------
// 保険区分の割り当て (患者の保険種別・保険者番号 → 国保/社保/自費)
//
// 国保・社保の判定は、月次UKE (monthly_claim_uke.ts) の既存の分類と同じ文言・番号に合わせる。
// 後期高齢は既存コードが国保連側 (国保と同じ) に分けているので国保。
// 判定できないもの (公費のみ・労災・自賠責・保険情報なし・その他) は自費として扱う。
// ただし「判定できず自費扱い」であることを assumed で持ち回り、画面と領収証の文字に出す。
// ---------------------------------------------------------------------------

const NATIONAL_INSURANCE_TYPE_PATTERN = /国保|国民健康保険|後期高齢/;
const SOCIAL_INSURANCE_TYPE_PATTERN = /社保|健康保険|協会|組合|共済|被用者/;
const SELF_PAY_INSURANCE_TYPE_PATTERN = /自費/;

export interface InsuranceClassificationInput {
  /** 患者の保険種別 (自由入力の文字列。画面の選択肢は 社保・国保・後期高齢・自費) */
  insuranceType?: string | null;
  /** 保険者番号 */
  provider?: string | null;
  /** 公費の登録があるか (保険なしの理由の言い分けにだけ使う) */
  hasPublicInsurance?: boolean;
}

export type InsuranceClassificationBasis =
  | 'insurance_type'
  | 'provider_number'
  | 'self_pay_selected'
  | 'fallback_self_pay';

export interface InsuranceClassification {
  category: InsuranceBarcodeCategory;
  /** 判定できず自費として扱ったとき true */
  assumed: boolean;
  basis: InsuranceClassificationBasis;
  /** 画面に出す理由 */
  reason: string;
}

function digitsOnly(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function classifyInsuranceForBarcode(input: InsuranceClassificationInput): InsuranceClassification {
  const insuranceType = String(input.insuranceType ?? '').trim();
  const provider = digitsOnly(input.provider);

  if (insuranceType) {
    if (SELF_PAY_INSURANCE_TYPE_PATTERN.test(insuranceType)) {
      return { category: 'self_pay', assumed: false, basis: 'self_pay_selected', reason: `保険種別「${insuranceType}」` };
    }
    // 「国民健康保険」は「健康保険」を含むので、国保を先に見る
    if (NATIONAL_INSURANCE_TYPE_PATTERN.test(insuranceType)) {
      return { category: 'national', assumed: false, basis: 'insurance_type', reason: `保険種別「${insuranceType}」` };
    }
    if (SOCIAL_INSURANCE_TYPE_PATTERN.test(insuranceType)) {
      return { category: 'social', assumed: false, basis: 'insurance_type', reason: `保険種別「${insuranceType}」` };
    }
    return {
      category: 'self_pay',
      assumed: true,
      basis: 'fallback_self_pay',
      reason: `保険種別「${insuranceType}」は国保・社保に当てはまらない`
    };
  }

  // 保険種別が空のときは、既存の月次UKEと同じく保険者番号で見る
  if (provider.length === 6) {
    return { category: 'national', assumed: false, basis: 'provider_number', reason: `保険者番号 ${provider} (6桁)` };
  }
  if (provider.length === 8 && /^(06|07)/.test(provider)) {
    return { category: 'social', assumed: false, basis: 'provider_number', reason: `保険者番号 ${provider} (8桁・06/07始まり)` };
  }
  if (provider) {
    return {
      category: 'self_pay',
      assumed: true,
      basis: 'fallback_self_pay',
      reason: `保険種別が空で、保険者番号 ${provider} からは国保・社保を判定できない`
    };
  }
  return {
    category: 'self_pay',
    assumed: true,
    basis: 'fallback_self_pay',
    reason: input.hasPublicInsurance ? '公費のみ (保険種別・保険者番号なし)' : '保険情報なし'
  };
}

// ---------------------------------------------------------------------------
// チェックデジット: Luhn (mod 10)
// ---------------------------------------------------------------------------

/**
 * 末尾に足すチェックデジット。本体の右端から1桁おきに2倍し (9を超えたら9を引く)、
 * 全桁の和を 10 で割った余りを 10 から引く (余りが 0 なら 0)。
 *
 * Luhn にした理由: 広く使われる mod 10 方式で、入れ違いのない1桁の読み違いは必ず、
 * 隣り合う2桁の入れ替えもほぼ (09↔90 を除いて) 見つけられ、計算が手で追える。
 */
export function luhnCheckDigit(body: string): string {
  if (!/^\d+$/.test(body)) throw new Error('Luhn check digit needs a string of digits.');
  let sum = 0;
  let doubled = true;
  for (let i = body.length - 1; i >= 0; i--) {
    let digit = Number(body[i]);
    if (doubled) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubled = !doubled;
  }
  return String((10 - (sum % 10)) % 10);
}

/** 本体+チェックデジットの全体が Luhn を満たすか */
export function hasValidLuhnCheckDigit(full: string): boolean {
  if (!/^\d{2,}$/.test(full)) return false;
  return luhnCheckDigit(full.slice(0, -1)) === full.slice(-1);
}

// ---------------------------------------------------------------------------
// バーコードの中身
// ---------------------------------------------------------------------------

export interface ReceiptBarcodeInput extends InsuranceClassificationInput {
  /** 領収金額 (窓口で受け取る額・円) */
  copayYen: number;
}

export type ReceiptBarcodeResult =
  | {
      ok: true;
      /** バーコードに符号化する数字9桁 */
      payload: string;
      category: InsuranceBarcodeCategory;
      amountYen: number;
      classification: InsuranceClassification;
      /** バーコードの下に印字する、人が読める形 */
      caption: string;
    }
  | {
      ok: false;
      reason: 'amount_invalid' | 'amount_overflow';
      /** 画面に出す理由 */
      message: string;
    };

/** 領収証の紙に印字するラベル。判定できず自費にした分は「自費扱い」と書き、実際の扱いが分かるようにする。 */
export function describeBarcodeCategory(classification: InsuranceClassification): string {
  const label = INSURANCE_BARCODE_LABELS[classification.category];
  return classification.assumed ? `${label}扱い` : label;
}

export function buildReceiptBarcode(input: ReceiptBarcodeInput): ReceiptBarcodeResult {
  const { copayYen } = input;
  if (!Number.isInteger(copayYen) || copayYen < 0) {
    return { ok: false, reason: 'amount_invalid', message: '領収金額が正しくないため、バーコードを印字しません。' };
  }
  if (copayYen > RECEIPT_BARCODE_MAX_AMOUNT_YEN) {
    return {
      ok: false,
      reason: 'amount_overflow',
      message: `領収金額が${RECEIPT_BARCODE_MAX_AMOUNT_YEN.toLocaleString('ja-JP')}円を超え、バーコードの桁数(金額${RECEIPT_BARCODE_AMOUNT_DIGITS}桁)に収まらないため、バーコードを印字しません。`
    };
  }
  const classification = classifyInsuranceForBarcode(input);
  const body = `${INSURANCE_BARCODE_CODES[classification.category]}${String(copayYen).padStart(RECEIPT_BARCODE_AMOUNT_DIGITS, '0')}`;
  const payload = `${body}${luhnCheckDigit(body)}`;
  return {
    ok: true,
    payload,
    category: classification.category,
    amountYen: copayYen,
    classification,
    caption: `${describeBarcodeCategory(classification)} / ¥${copayYen.toLocaleString('ja-JP')} / ${payload}`
  };
}

export interface ReceiptBarcodeFields {
  category: InsuranceBarcodeCategory;
  amountYen: number;
}

const CATEGORY_BY_CODE = new Map<string, InsuranceBarcodeCategory>(
  (Object.entries(INSURANCE_BARCODE_CODES) as [InsuranceBarcodeCategory, string][]).map(([category, code]) => [code, category])
);

/** 読み取った9桁を、区分と金額に戻す。長さ・区分コード・チェックデジットのどれかが合わなければ null。 */
export function parseReceiptBarcodePayload(payload: string): ReceiptBarcodeFields | null {
  const text = String(payload ?? '');
  if (!new RegExp(`^\\d{${RECEIPT_BARCODE_LENGTH}}$`).test(text)) return null;
  const category = CATEGORY_BY_CODE.get(text[0]);
  if (!category) return null;
  if (!hasValidLuhnCheckDigit(text)) return null;
  return { category, amountYen: Number(text.slice(1, 1 + RECEIPT_BARCODE_AMOUNT_DIGITS)) };
}
