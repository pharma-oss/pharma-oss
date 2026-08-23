import { Drug } from '@/db/types';
import { type InventoryOrderRisk } from '@/lib/inventory_order';

export type DrugWithSearchCache = Drug & {
    searchNameLower: string;
    searchYjCodeLower: string;
    doc?: any;
};

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
    return new Date().toISOString().split('T')[0];
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

