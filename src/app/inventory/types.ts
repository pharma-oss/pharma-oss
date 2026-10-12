import { Drug } from '@/db/types';
import { type InventoryOrderRisk } from '@/lib/inventory_order';
import { toLocalDateKey } from '@/lib/local_date';

export type DrugWithSearchCache = Drug & {
    searchNameLower: string;
    searchYjCodeLower: string;
    doc?: any;
};

// RxDB の薬品文書から、在庫画面が読む項目だけを写した行を作る。
// 麻薬・向精神薬・毒薬・ハイリスク薬の区分もここで写す。写さないと、日次棚卸(麻薬・向精神薬の一覧)が常に空になり、
// 発注の重点薬判定も常に偽になる(初期リリースから、この写しにだけ区分が無かった)。
export function toInventoryDrugRow(d: Drug): DrugWithSearchCache {
    return {
        code: d.code,
        name: d.name,
        yjCode: d.yjCode,
        isGeneric: d.isGeneric,
        genericName: d.genericName,
        isAbolished: d.isAbolished,
        price: d.price,
        location: d.location,
        stockQuantity: d.stockQuantity,
        isNarcotic: d.isNarcotic,
        isPsychotropic: d.isPsychotropic,
        isPoisonous: d.isPoisonous,
        isHighRisk: d.isHighRisk,
        // ⚡ Bolt: Cache the document instance to avoid redundant lookups during updates
        doc: d,
        // ⚡ Bolt: Pre-compute lowercase strings for search to avoid allocations on every keystroke
        searchNameLower: (d.name || '').toLowerCase(),
        searchYjCodeLower: (d.yjCode || '').toLowerCase()
    };
}

export interface TransferPrefill {
    drugCode: string;
    quantity?: number;
    direction?: 'in' | 'out';
}

export type ReceivingDraft = {
    quantity: string;
    lotNumber: string;
    expirationDate: string;
    arrivalDate: string;
    supplierName: string;
};

export function toHalfWidth(str: string): string {
    return str.replace(/[！-～]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
}

export function todayDateKey(): string {
    return toLocalDateKey();
}

export function defaultReceivingDraft(candidate: InventoryOrderRisk): ReceivingDraft {
    return {
        quantity: String(candidate.recommendedOrderAmount),
        lotNumber: '',
        expirationDate: '',
        arrivalDate: todayDateKey(),
        supplierName: candidate.supplierName === '卸未設定' ? '' : candidate.supplierName
    };
}

export function formatInventoryAmount(value: number): string {
    return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

