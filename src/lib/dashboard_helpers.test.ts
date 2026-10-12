import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Drug } from '@/db/types';
import { buildClaimCalculationItems } from './dashboard_helpers.ts';

// 月次請求・公式UKEの算定に渡す明細の特性化テスト（現状の出力を固定する）。
// 薬品名・薬価・YJコード・一般名・ハイリスクは、処方明細ではなく薬品マスターから引く。

const drug = (overrides: Partial<Drug>): Drug =>
  ({ code: 'D', name: '', isGeneric: false, price: 0, stockQuantity: 0, ...overrides }) as unknown as Drug;

const item = (overrides: Record<string, unknown> = {}) => ({
  itemId: 'i1',
  visitId: 'v1',
  drugId: 'D-PRESCRIBED',
  usage: '1日3回 毎食後',
  ...overrides
}) as { itemId: string; visitId: string; drugId: string; usage: string; dispensedDrug?: string; dispensedDrugCode?: string };

const PRICE_HISTORY = [
  { price: 120 },
  { price: 110, effectiveFrom: '2026-04-01' },
  { price: 100, effectiveFrom: '2026-10-01' }
];

test('buildClaimCalculationItems takes name, YJ code, generic name and high-risk flag from the drug master', () => {
  const master = drug({ name: 'アムロジン錠5mg', yjCode: '2171022F1ZZZ', genericName: 'アムロジピン', isHighRisk: true, price: 10 });
  const [row] = buildClaimCalculationItems([item()], new Map([['D-PRESCRIBED', master]]), '2026-10-12');
  assert.equal(row.drugName, 'アムロジン錠5mg');
  assert.equal(row.yjCode, '2171022F1ZZZ');
  assert.equal(row.genericName, 'アムロジピン');
  assert.equal(row.isHighRisk, true);
  assert.equal(row.price, 10);
});

test('buildClaimCalculationItems falls back to the dispensed drug name, then to the drug id, when the master has no entry', () => {
  const empty = new Map<string, Drug>();
  const [dispensed] = buildClaimCalculationItems([item({ dispensedDrug: '調剤した薬品名' })], empty, '2026-10-12');
  assert.equal(dispensed.drugName, '調剤した薬品名');
  const [idOnly] = buildClaimCalculationItems([item()], empty, '2026-10-12');
  assert.equal(idOnly.drugName, 'D-PRESCRIBED');
  // マスターに名前が無い（空）ときも同じ順で落ちる
  const [blankName] = buildClaimCalculationItems([item({ dispensedDrug: '調剤した薬品名' })], new Map([['D-PRESCRIBED', drug({ name: '' })]]), '2026-10-12');
  assert.equal(blankName.drugName, '調剤した薬品名');
});

test('buildClaimCalculationItems looks the drug up by the dispensed drug code first and falls back to the prescribed drug id', () => {
  const prescribed = drug({ name: '処方薬', price: 50 });
  const dispensed = drug({ name: '調剤薬', price: 20 });
  const both = new Map([['D-PRESCRIBED', prescribed], ['D-DISPENSED', dispensed]]);
  const [useDispensed] = buildClaimCalculationItems([item({ dispensedDrugCode: 'D-DISPENSED' })], both, '2026-10-12');
  assert.equal(useDispensed.drugName, '調剤薬');
  assert.equal(useDispensed.price, 20);
  // 調剤した薬品コードがマスターに無ければ、処方された薬品で引く
  const [fallBack] = buildClaimCalculationItems([item({ dispensedDrugCode: 'D-MISSING' })], new Map([['D-PRESCRIBED', prescribed]]), '2026-10-12');
  assert.equal(fallBack.drugName, '処方薬');
  assert.equal(fallBack.price, 50);
});

test('buildClaimCalculationItems prices the item by the dispensing date: the revision day already uses the new price', () => {
  const master = new Map([['D-PRESCRIBED', drug({ price: 100, priceHistory: PRICE_HISTORY })]]);
  const priceOn = (date: string) => buildClaimCalculationItems([item()], master, date)[0].price;
  assert.equal(priceOn('2026-03-31'), 120, 'before the first dated revision: the oldest known price');
  assert.equal(priceOn('2026-04-01'), 110, 'on the revision day: the new price');
  assert.equal(priceOn('2026-09-30'), 110);
  assert.equal(priceOn('2026-10-01'), 100);
});

test('buildClaimCalculationItems uses 0 when there is no drug, no price, or an unreadable date for a drug with a history', () => {
  assert.equal(buildClaimCalculationItems([item()], new Map<string, Drug>(), '2026-10-12')[0].price, 0);
  assert.equal(buildClaimCalculationItems([item()], new Map([['D-PRESCRIBED', drug({ price: undefined })]]), '2026-10-12')[0].price, 0);
  // 調剤日が読めないとき、履歴のある薬品に最新版を当てて点数を動かさない（0 にする）
  assert.equal(buildClaimCalculationItems([item()], new Map([['D-PRESCRIBED', drug({ price: 100, priceHistory: PRICE_HISTORY })]]), '')[0].price, 0);
});

test('buildClaimCalculationItems accepts RxDocument-like drugs (toJSON) the same as plain objects', () => {
  const plain = drug({ name: 'ノルバスク錠', yjCode: '2171022F2ZZZ', price: 30 });
  const asDoc = { toJSON: () => plain };
  const fromPlain = buildClaimCalculationItems([item()], new Map([['D-PRESCRIBED', plain]]), '2026-10-12')[0];
  const fromDoc = buildClaimCalculationItems([item()], new Map([['D-PRESCRIBED', asDoc]]), '2026-10-12')[0];
  assert.deepEqual(fromDoc, fromPlain);
});

test('buildClaimCalculationItems never reads price, YJ code, generic name, high-risk flag or name from the item itself', () => {
  // 処方明細にこれらの項目は無い。昔の取り出しは item の同名項目へフォールバックしていたが、読まない。
  const polluted = Object.assign(item(), { price: 999, yjCode: 'FROM-ITEM', genericName: 'FROM-ITEM', isHighRisk: true, drugName: 'FROM-ITEM' });
  const [row] = buildClaimCalculationItems([polluted], new Map<string, Drug>(), '2026-10-12');
  assert.equal(row.price, 0);
  assert.equal(row.yjCode, undefined);
  assert.equal(row.genericName, undefined);
  assert.equal(row.isHighRisk, false);
  assert.equal(row.drugName, 'D-PRESCRIBED');
});

test('buildClaimCalculationItems keeps the item fields and treats a missing high-risk flag as false', () => {
  const [row] = buildClaimCalculationItems([item({ dispensedDrug: '調剤薬' })], new Map([['D-PRESCRIBED', drug({ name: 'マスター名' })]]), '2026-10-12');
  assert.equal(row.itemId, 'i1');
  assert.equal(row.visitId, 'v1');
  assert.equal(row.usage, '1日3回 毎食後');
  assert.equal(row.isHighRisk, false);
  // マスター名があれば、調剤した薬品名より優先する
  assert.equal(row.drugName, 'マスター名');
});
