import type { PrescriptionItem } from '@/db/types';

export interface PreviousDoSourceItem extends Pick<
  PrescriptionItem,
  | 'itemId'
  | 'rpNumber'
  | 'drugId'
  | 'dispensedDrug'
  | 'dispensedDrugCode'
  | 'changeReason'
  | 'amount'
  | 'usage'
  | 'days'
  | 'rpComment'
  | 'isIppoka'
  | 'isCrushed'
  | 'tokkanType'
  | 'receiptRemark'
  | 'billingAgentGroupKey'
  | 'billingAgentGroupReason'
> {
  prescribedDrugName?: string;
  prescribedYjCode?: string;
  prescribedGenericName?: string;
  prescribedIsHighRisk?: boolean;
  prescribedIsAbolished?: boolean;
  prescribedStockQuantity?: number;
  dispensedDrugName?: string;
  dispensedYjCode?: string;
  dispensedGenericName?: string;
  dispensedIsHighRisk?: boolean;
  dispensedIsAbolished?: boolean;
  dispensedStockQuantity?: number;
}

export interface PreviousDoPrescriptionInput {
  id: string;
  rpId: string;
  drugCode: string;
  drugName: string;
  dispensedDrug: string;
  dispensedDrugCode?: string;
  yjCode?: string;
  genericName?: string;
  isHighRisk?: boolean;
  isAbolished?: boolean;
  stockQuantity?: number;
  dispensedYjCode?: string;
  dispensedGenericName?: string;
  dispensedIsHighRisk?: boolean;
  dispensedIsAbolished?: boolean;
  dispensedStockQuantity?: number;
  changeReason: string;
  amount: string;
  usage: string;
  days: string;
  rpComment?: string;
  isIppoka?: boolean;
  isCrushed?: boolean;
  tokkanType?: 'none' | '1' | '3_i';
  showReceiptRemark?: boolean;
  receiptRemark?: string;
  billingAgentGroupKey?: string;
  billingAgentGroupReason?: string;
}

export interface PreviousDoSourceVisit {
  visitId: string;
  institutionName?: string;
  prescriptionDate?: string;
  dispensingDate?: string;
  issueDate?: string;
}

export interface PreviousDoSnapshot {
  visit: PreviousDoSourceVisit;
  items: PreviousDoSourceItem[];
}

export function sortPreviousDoItems(items: PreviousDoSourceItem[]): PreviousDoSourceItem[] {
  return items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => {
      const aRp = a.item.rpNumber ?? a.originalIndex + 1;
      const bRp = b.item.rpNumber ?? b.originalIndex + 1;
      if (aRp !== bRp) return aRp - bRp;
      return a.originalIndex - b.originalIndex;
    })
    .map(({ item }) => item);
}

export function buildPreviousDoPrescriptions(
  items: PreviousDoSourceItem[],
  createId: (prefix: 'item' | 'rp', index: number) => string
): PreviousDoPrescriptionInput[] {
  const rpIdByNumber = new Map<number, string>();
  const sortedItems = sortPreviousDoItems(items);

  return sortedItems.map((item, index) => {
    const rpNumber = item.rpNumber ?? index + 1;
    let rpId = rpIdByNumber.get(rpNumber);
    if (!rpId) {
      rpId = createId('rp', rpIdByNumber.size);
      rpIdByNumber.set(rpNumber, rpId);
    }

    return {
      id: createId('item', index),
      rpId,
      drugCode: item.drugId,
      drugName: item.prescribedDrugName || item.drugId,
      dispensedDrug: item.dispensedDrug || item.dispensedDrugName || '',
      dispensedDrugCode: item.dispensedDrugCode || '',
      yjCode: item.prescribedYjCode || '',
      genericName: item.prescribedGenericName || '',
      isHighRisk: !!item.prescribedIsHighRisk,
      isAbolished: !!item.prescribedIsAbolished,
      stockQuantity: item.prescribedStockQuantity,
      dispensedYjCode: item.dispensedYjCode || '',
      dispensedGenericName: item.dispensedGenericName || '',
      dispensedIsHighRisk: !!item.dispensedIsHighRisk,
      dispensedIsAbolished: !!item.dispensedIsAbolished,
      dispensedStockQuantity: item.dispensedStockQuantity,
      changeReason: item.changeReason || '',
      amount: Number.isFinite(item.amount) ? String(item.amount) : '',
      usage: item.usage || '',
      days: Number.isFinite(item.days) ? String(item.days) : '',
      rpComment: item.rpComment || '',
      isIppoka: !!item.isIppoka,
      isCrushed: !!item.isCrushed,
      tokkanType: item.tokkanType || 'none',
      showReceiptRemark: !!item.receiptRemark,
      receiptRemark: item.receiptRemark || '',
      billingAgentGroupKey: item.billingAgentGroupKey || '',
      billingAgentGroupReason: item.billingAgentGroupReason || ''
    };
  });
}
