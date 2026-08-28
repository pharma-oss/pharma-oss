import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveClaimItemPricing } from './claim_item_pricing.ts';

// drugPrice を埋めずに明細を算定へ渡すと、薬剤料が算定されず点数が黙って低く出る。
// 印刷画面と点数の点検で同じ結果になるよう、両方からこの関数を使う。

const drug = {
  price: 10.1,
  priceHistory: [
    { price: 11.7, effectiveFrom: '2024-04-01' },
    { price: 10.1, effectiveFrom: '2026-04-01' }
  ],
  yjCode: '2149040F1012',
  isGeneric: true,
  isHighRisk: false
};

test('the price is the one that applied on the dispensing date', () => {
  const pricing = resolveClaimItemPricing({}, { prescribed: drug }, '2025-06-01');

  assert.equal(pricing.drugPrice, 11.7);
  assert.equal(pricing.drugPriceResolution.source, 'history');
  // 算定が見るのは drugPrice。price だけ埋めても薬剤料は出ない。
  assert.equal(pricing.price, pricing.drugPrice);
});

test('the dispensed drug decides the price when the prescription was substituted', () => {
  const dispensed = { ...drug, price: 8.2, priceHistory: undefined, yjCode: '5200000S1010', isGeneric: false };
  const pricing = resolveClaimItemPricing({}, { prescribed: drug, dispensed }, '2026-06-01');

  assert.equal(pricing.drugPrice, 8.2);
  assert.equal(pricing.yjCode, '5200000S1010');
  assert.equal(pricing.isGeneric, false);
});

test('a revision the pharmacist chose overrides the dispensing date', () => {
  const pricing = resolveClaimItemPricing(
    { drugPriceOverride: { effectiveFrom: '2024-04-01', price: 11.7 } },
    { prescribed: drug },
    '2026-06-01'
  );

  assert.equal(pricing.drugPrice, 11.7);
  assert.equal(pricing.drugPriceResolution.source, 'override');
});

test('an unknown price falls back to what the item already carried', () => {
  const pricing = resolveClaimItemPricing({ price: 5.5 }, { prescribed: {} }, '2026-06-01');

  assert.equal(pricing.drugPrice, 5.5);
  // 薬価が分からない明細を 0円で算定しないこと (item の値も無いときだけ 0)
  assert.equal(resolveClaimItemPricing({}, {}, '2026-06-01').drugPrice, 0);
});

test('the high risk flag prefers the item, then the prescribed drug', () => {
  assert.equal(resolveClaimItemPricing({ isHighRisk: true }, { prescribed: drug }, '2026-06-01').isHighRisk, true);
  assert.equal(
    resolveClaimItemPricing({}, { prescribed: { ...drug, isHighRisk: true } }, '2026-06-01').isHighRisk,
    true
  );
  assert.equal(
    resolveClaimItemPricing({}, { dispensed: { ...drug, isHighRisk: true } }, '2026-06-01').isHighRisk,
    true
  );
  assert.equal(resolveClaimItemPricing({}, {}, '2026-06-01').isHighRisk, false);
});

test('the history comes from the drug the price was taken from', () => {
  const dispensed = { price: 8.2, priceHistory: [{ price: 8.2, effectiveFrom: '2026-01-01' }] };
  const pricing = resolveClaimItemPricing({}, { prescribed: drug, dispensed }, '2026-06-01');

  assert.deepEqual(pricing.drugPriceHistory, [{ price: 8.2, effectiveFrom: '2026-01-01' }]);
});
