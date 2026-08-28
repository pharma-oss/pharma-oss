// 処方明細に「調剤日時点の薬価」を当てる。
//
// calculateDispensingFees と請求前チェックは drugPrice を見る。ここを埋めずに
// 明細をそのまま渡すと薬剤料が算定されず、点数が黙って低く出る。
// 印刷画面と点数の点検で同じ結果になるよう、両方からこの関数を使う。

import {
  resolveDrugPriceWithOverride,
  type DrugPriceOverride,
  type DrugPriceResolution,
  type DrugPriceRevision
} from './drug_price_history.ts';

export interface ClaimItemPricingDrug {
  price?: number;
  priceHistory?: DrugPriceRevision[];
  yjCode?: string;
  isGeneric?: boolean;
  isHighRisk?: boolean;
}

export interface ClaimItemPricingItem {
  price?: number;
  yjCode?: string;
  isGeneric?: boolean;
  isHighRisk?: boolean;
  drugPriceOverride?: DrugPriceOverride;
}

export interface ClaimItemPricing {
  price: number;
  /** 算定と請求前チェックが見るのはこちら */
  drugPrice: number;
  drugPriceHistory?: DrugPriceRevision[];
  drugPriceResolution: DrugPriceResolution;
  yjCode: string;
  isGeneric?: boolean;
  isHighRisk: boolean;
}

/**
 * 調剤した薬品があればそちらを、無ければ処方された薬品を薬価の根拠にする。
 * 薬剤師が版を選び直していればその版を使う。
 */
export function resolveClaimItemPricing(
  item: ClaimItemPricingItem,
  drugs: { prescribed?: ClaimItemPricingDrug; dispensed?: ClaimItemPricingDrug },
  dispensingDate: string
): ClaimItemPricing {
  const billingDrug = drugs?.dispensed || drugs?.prescribed;
  const resolution = resolveDrugPriceWithOverride(
    billingDrug ?? {},
    dispensingDate,
    item?.drugPriceOverride
  );
  const price = resolution.price ?? item?.price ?? 0;

  return {
    price,
    drugPrice: price,
    drugPriceHistory: billingDrug?.priceHistory,
    drugPriceResolution: resolution,
    yjCode: billingDrug?.yjCode || item?.yjCode || '',
    isGeneric: billingDrug?.isGeneric ?? item?.isGeneric,
    isHighRisk: item?.isHighRisk ?? drugs?.prescribed?.isHighRisk ?? drugs?.dispensed?.isHighRisk ?? false
  };
}
