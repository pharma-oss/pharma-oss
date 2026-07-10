import type { Drug } from '@/db/types';

export type DrugMasterRecord = Drug & {
  searchNameLower: string;
  searchGenericLower: string;
};

export interface ElectronicUsageOption {
  code: string;
  label: string;
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
