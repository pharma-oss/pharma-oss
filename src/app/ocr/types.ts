import type { DosageCategory } from '@/lib/dosage_category';

export type PrescriptionFieldValue = string | number | boolean | undefined | object;

export interface Prescription {
  id: string;
  rpId: string;
  drugCode: string; // マスタの薬品コード
  drugName: string; // 処方薬品名
  dispensedDrug: string; // 調剤薬品名
  dispensedDrugCode?: string; // 入力中の在庫表示用
  prescribedDrugCodeStatus?: 'active' | 'abolished' | 'unknown';
  prescribedDrugCodeAbolishedAt?: string;
  electronicSourceDrugName?: string;
  electronicMasterDrugName?: string;
  electronicDrugNameVerificationStatus?: 'matched' | 'mismatch' | 'not_checked';
  electronicDrugNameVerificationCheckedAt?: string;
  unitCode?: string;
  unitText?: string;
  electronicUnitConversion?: {
    conversionFactor: string;
    masterUnitCode?: string;
    masterUnitText?: string;
    prescribedAmount: string;
    prescribedUnitCode?: string;
    prescribedUnitText: string;
  };
  electronicUsageCode?: string;
  electronicUsageFallbackText?: string;
  electronicUsageSupplementText?: string;
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
  changeReason: string; // 変更理由
  amount: string;
  usage: string;
  days: string;
  rpComment?: string;
  dosageCategory?: DosageCategory;
  dosageCategorySource?: 'auto' | 'manual';
  isIppoka?: boolean;
  isCrushed?: boolean;
  tokkanType?: 'none' | '1' | '3_i';
  showReceiptRemark?: boolean;
  receiptRemark?: string;
  billingAgentGroupKey?: string;
  billingAgentGroupReason?: string;
}

export interface PrescriptionGroup {
  rpId: string;
  prescriptions: Prescription[];
  startIndex: number;
  usage: string;
  days: string;
  rpComment: string;
}

export const groupPrescriptionsByRp = (prescriptions: Prescription[]): PrescriptionGroup[] => {
  const groups: PrescriptionGroup[] = [];
  const groupIndexByRpId = new Map<string, number>();

  for (let i = 0; i < prescriptions.length; i++) {
    const prescription = prescriptions[i];
    const rpId = prescription.rpId || `rp_legacy_${i}`;
    const existingIndex = groupIndexByRpId.get(rpId);

    if (existingIndex === undefined) {
      groupIndexByRpId.set(rpId, groups.length);
      groups.push({
        rpId,
        prescriptions: [prescription],
        startIndex: i,
        usage: prescription.usage || '',
        days: prescription.days || '',
        rpComment: prescription.rpComment || ''
      });
      continue;
    }

    groups[existingIndex].prescriptions.push(prescription);
  }

  return groups;
};
