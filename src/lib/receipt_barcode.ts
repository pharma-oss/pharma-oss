import { toLocalDateKeyFromValue } from './local_date.ts';

// 領収証に印字する照合バーコードの中身。
//
//   {受付番号}/{調剤日 YYYYMMDD}/{領収金額(円・整数)}
//   例: 3f2a9c1e7b4d/20261030/750
//
// 受付番号は紙面の受付番号 (visitId の先頭14文字) から英数字とアンダースコア以外を除いたもの。
// 区切りの `/` は JIS配列でも US配列でも同じキーで、キーボード入力型のスキャナで化けにくい。
// 領収金額を含むので、算定の条件を切り替えて金額が変われば中身も変わる (再発行した領収証と
// 古い領収証を、バーコードを読むだけで取り違えずに区別できる)。

const RECEIPT_BARCODE_SEPARATOR = '/';
const MAX_COPAY_YEN = 99_999_999;

export interface ReceiptBarcodeInput {
  /** 紙面の受付番号 (receiptRunId) */
  receiptNumber: string;
  /** 調剤日。YYYY-MM-DD でも時刻つきでもよい (端末の暦日にそろえる) */
  dispensingDate: string | undefined | null;
  /** 領収金額 (窓口で受け取る額・円) */
  copayYen: number;
}

export interface ReceiptBarcodeFields {
  receiptNumber: string;
  /** YYYY-MM-DD */
  dispensingDate: string;
  copayYen: number;
}

/** バーコードに入れる受付番号。区切りの `/` が混ざらないよう、英数字とアンダースコアだけを残す。 */
export function normalizeReceiptNumberForBarcode(receiptNumber: string): string {
  return String(receiptNumber ?? '').replace(/[^A-Za-z0-9_]/g, '');
}

/** 受付番号・調剤日・金額のどれかが使えないときは null (その場合はバーコードを印字しない)。 */
export function readReceiptBarcodeFields(input: ReceiptBarcodeInput): ReceiptBarcodeFields | null {
  const receiptNumber = normalizeReceiptNumberForBarcode(input.receiptNumber);
  if (!receiptNumber) return null;
  const dispensingDate = toLocalDateKeyFromValue(input.dispensingDate);
  if (!dispensingDate) return null;
  const copayYen = input.copayYen;
  if (!Number.isInteger(copayYen) || copayYen < 0 || copayYen > MAX_COPAY_YEN) return null;
  return { receiptNumber, dispensingDate, copayYen };
}

export function buildReceiptBarcodePayload(input: ReceiptBarcodeInput): string | null {
  const fields = readReceiptBarcodeFields(input);
  if (!fields) return null;
  return [
    fields.receiptNumber,
    fields.dispensingDate.replace(/-/g, ''),
    String(fields.copayYen)
  ].join(RECEIPT_BARCODE_SEPARATOR);
}

export function parseReceiptBarcodePayload(payload: string): ReceiptBarcodeFields | null {
  const parts = String(payload ?? '').split(RECEIPT_BARCODE_SEPARATOR);
  if (parts.length !== 3) return null;
  const [receiptNumber, compactDate, amountText] = parts;
  if (!/^[A-Za-z0-9_]+$/.test(receiptNumber)) return null;
  const dateMatch = compactDate.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!dateMatch) return null;
  // 実在する日付か (2026-02-30 のような値は読み取り違いか改ざん)
  const [, year, month, day] = dateMatch;
  const check = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    check.getFullYear() !== Number(year)
    || check.getMonth() !== Number(month) - 1
    || check.getDate() !== Number(day)
  ) {
    return null;
  }
  if (!/^(0|[1-9]\d{0,7})$/.test(amountText)) return null;
  return {
    receiptNumber,
    dispensingDate: `${year}-${month}-${day}`,
    copayYen: Number(amountText)
  };
}

/** バーコードの下に印字する、人が読める形。 */
export function formatReceiptBarcodeCaption(input: ReceiptBarcodeInput): string | null {
  const fields = readReceiptBarcodeFields(input);
  if (!fields) return null;
  return `${fields.receiptNumber} / ${fields.dispensingDate} / ¥${fields.copayYen.toLocaleString('ja-JP')}`;
}
