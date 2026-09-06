import type { Drug } from '@/db/types';
import type { DosageCategory } from '@/lib/dosage_category';

export type DrugMasterRecord = Drug & {
  searchNameLower: string;
  searchGenericLower: string;
  janCode?: string;
};

export interface ElectronicUsageOption {
  code: string;
  label: string;
  /** 用法が属する剤形。未設定はマスタ側に区分情報が無いことを表す。 */
  category?: DosageCategory;
}

export interface MasterDataSeedPayload {
  version: string;
  drugs: DrugMasterRecord[];
  usageOptions: ElectronicUsageOption[];
}

export interface MasterDataBackendStatus {
  backend: 'opfs' | 'transient' | 'memory';
  sqliteVersion?: string;
  persistent: boolean;
  message?: string;
}
