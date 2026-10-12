import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Drug, PrescriptionItem } from '@/db/types';
import {
  buildPricedClaimItems,
  toClaimItemPricingDrug,
  toDosageCategoryConflictInput
} from './useOfficialAuditSettings.ts';

// 点数の変動点検・剤形判定の食い違い点検へ渡す入力の特性化テスト（現状の出力を固定する）。

const PRICE_HISTORY = [
  { price: 120 },
  { price: 110, effectiveFrom: '2026-04-01' },
  { price: 100, effectiveFrom: '2026-10-01' }
];

const drug = (overrides: Partial<Drug>): Partial<Drug> => ({ name: 'テスト薬', price: 100, ...overrides });

const itemJson = (overrides: Record<string, unknown> = {}) => ({
  itemId: 'i1',
  visitId: 'v1',
  drugId: 'D-PRESCRIBED',
  ...overrides
}) as { itemId: string; visitId: string; drugId: string; dispensedDrugCode?: string; isHighRisk?: boolean; drugPriceOverride?: { price: number; effectiveFrom?: string } };

const itemDoc = <T extends { drugId: string; dispensedDrugCode?: string }>(json: T) => ({
  drugId: json.drugId,
  dispensedDrugCode: json.dispensedDrugCode,
  toJSON: () => json
});

// --- toDosageCategoryConflictInput -----------------------------------------

test('toDosageCategoryConflictInput keys the item by itemId (a prescription item has no id field)', () => {
  const item = { visitId: 'v1', rpNumber: 2, itemId: 'item-77', drugId: 'D1', dispensedDrug: 'アムロジン錠', usage: '1日1回', dosageCategory: 'internal', dosageCategorySource: 'manual' } as Pick<
    PrescriptionItem,
    'visitId' | 'rpNumber' | 'itemId' | 'drugId' | 'dispensedDrug' | 'usage' | 'dosageCategory' | 'dosageCategorySource'
  >;
  const input = toDosageCategoryConflictInput({ ...item, ...({ id: 'WRONG-ID' } as object) });
  assert.deepEqual(input, {
    visitId: 'v1',
    rpNumber: 2,
    itemId: 'item-77',
    drugName: 'アムロジン錠',
    dispensedDrug: 'アムロジン錠',
    usage: '1日1回',
    dosageCategory: 'internal',
    dosageCategorySource: 'manual'
  });
});

test('toDosageCategoryConflictInput names the drug by the dispensed drug, then by the drug id', () => {
  const base = { visitId: 'v1', rpNumber: 1, itemId: 'i1', drugId: 'D-CODE', usage: '点眼' };
  assert.equal(toDosageCategoryConflictInput({ ...base, dispensedDrug: '調剤薬' }).drugName, '調剤薬');
  const noName = toDosageCategoryConflictInput(base);
  assert.equal(noName.drugName, 'D-CODE');
  assert.equal(noName.dispensedDrug, undefined);
});

// --- toClaimItemPricingDrug -------------------------------------------------

test('toClaimItemPricingDrug returns undefined for a missing drug', () => {
  assert.equal(toClaimItemPricingDrug(undefined), undefined);
  assert.equal(toClaimItemPricingDrug(null), undefined);
});

test('toClaimItemPricingDrug passes only price, price history, YJ code, generic flag and high-risk flag', () => {
  const result = toClaimItemPricingDrug(drug({ name: 'は渡さない', yjCode: '2171022F1ZZZ', isGeneric: true, isHighRisk: true, price: 42, priceHistory: PRICE_HISTORY, stockQuantity: 9 }));
  assert.deepEqual(result, { price: 42, priceHistory: PRICE_HISTORY, yjCode: '2171022F1ZZZ', isGeneric: true, isHighRisk: true });
  assert.deepEqual(Object.keys(result ?? {}).sort(), ['isGeneric', 'isHighRisk', 'price', 'priceHistory', 'yjCode']);
});

test('toClaimItemPricingDrug reads RxDocument-like drugs through toJSON, copies the history, and leaves a missing history undefined', () => {
  const plain = drug({ price: 42, priceHistory: PRICE_HISTORY });
  const fromDoc = toClaimItemPricingDrug({ toJSON: () => plain });
  assert.deepEqual(fromDoc, toClaimItemPricingDrug(plain));
  assert.notStrictEqual(fromDoc?.priceHistory, PRICE_HISTORY, 'the history is copied, not shared');
  assert.equal(toClaimItemPricingDrug(drug({ price: 7 }))?.priceHistory, undefined);
});

// --- buildPricedClaimItems --------------------------------------------------

test('buildPricedClaimItems prices the prescribed drug by the dispensing date and keeps the item fields', () => {
  const drugs = new Map([['D-PRESCRIBED', drug({ yjCode: 'YJ-1', isGeneric: false, price: 100, priceHistory: PRICE_HISTORY })]]);
  const priceOn = (date: string) => buildPricedClaimItems([itemDoc(itemJson())], drugs, date)[0];
  assert.equal(priceOn('2026-03-31').price, 120);
  assert.equal(priceOn('2026-04-01').price, 110, 'the revision day already uses the new price');
  assert.equal(priceOn('2026-10-01').price, 100);
  const row = priceOn('2026-06-01');
  assert.equal(row.itemId, 'i1');
  assert.equal(row.visitId, 'v1');
  assert.equal(row.drugPrice, 110, 'the calculator and the pre-claim check read drugPrice');
  assert.equal(row.yjCode, 'YJ-1');
  assert.equal(row.drugPriceResolution.source, 'history');
});

test('buildPricedClaimItems bills the dispensed drug when there is one, and the prescribed drug otherwise', () => {
  const drugs = new Map([
    ['D-PRESCRIBED', drug({ yjCode: 'YJ-PRESCRIBED', price: 50 })],
    ['D-DISPENSED', drug({ yjCode: 'YJ-DISPENSED', price: 20 })]
  ]);
  const [dispensed] = buildPricedClaimItems([itemDoc(itemJson({ dispensedDrugCode: 'D-DISPENSED' }))], drugs, '2026-06-01');
  assert.equal(dispensed.price, 20);
  assert.equal(dispensed.yjCode, 'YJ-DISPENSED');
  const [prescribed] = buildPricedClaimItems([itemDoc(itemJson())], drugs, '2026-06-01');
  assert.equal(prescribed.price, 50);
  assert.equal(prescribed.yjCode, 'YJ-PRESCRIBED');
  // 調剤した薬品コードがマスターに無ければ、処方された薬品の薬価で引く
  const [missing] = buildPricedClaimItems([itemDoc(itemJson({ dispensedDrugCode: 'D-MISSING' }))], drugs, '2026-06-01');
  assert.equal(missing.price, 50);
});

test('buildPricedClaimItems honours the pharmacist-chosen price version and falls back to 0 for an unknown drug', () => {
  const drugs = new Map([['D-PRESCRIBED', drug({ price: 100, priceHistory: PRICE_HISTORY })]]);
  const [overridden] = buildPricedClaimItems([itemDoc(itemJson({ drugPriceOverride: { price: 120 } }))], drugs, '2026-06-01');
  assert.equal(overridden.price, 120);
  assert.equal(overridden.drugPriceResolution.source, 'override');
  const [unknown] = buildPricedClaimItems([itemDoc(itemJson())], new Map<string, Partial<Drug>>(), '2026-06-01');
  assert.equal(unknown.price, 0);
  assert.equal(unknown.yjCode, '');
});

test('buildPricedClaimItems decides the high-risk flag from the item first, then the prescribed drug, then the dispensed drug', () => {
  const drugs = new Map([
    ['D-PRESCRIBED', drug({ isHighRisk: true })],
    ['D-DISPENSED', drug({ isHighRisk: false })]
  ]);
  assert.equal(buildPricedClaimItems([itemDoc(itemJson())], drugs, '2026-06-01')[0].isHighRisk, true);
  assert.equal(buildPricedClaimItems([itemDoc(itemJson({ isHighRisk: false }))], drugs, '2026-06-01')[0].isHighRisk, false);
  assert.equal(buildPricedClaimItems([itemDoc(itemJson())], new Map<string, Partial<Drug>>(), '2026-06-01')[0].isHighRisk, false);
});
