import type { Drug } from '@/db/types';
import type { DosageCategory } from '@/lib/dosage_category';

export type DrugMasterRecord = Drug & {
  searchNameLower: string;
  searchGenericLower: string;
  janCode?: string;
};

export interface ElectronicUsageOption {
  /** 調剤レセプト用法コード（別表12、3桁）。既存の意味を変えない。 */
  code: string;
  /** 用法名称（項番8） */
  label: string;
  /** 電子処方箋用法コード（項番1、16桁） */
  prescriptionCode?: string;
  /** 剤形。項番2と項番6から §3.5 の表に従って導出する */
  category?: DosageCategory;
  /** 用法カナ名称（項番18）。候補検索に使う */
  kana?: string;
  /** 用法補足レコードの要否（項番13/15/17）。補足欄を必須にするかの判定に使う */
  supplement?: {
    asNeededCondition: boolean;                          // 項番13
    administrationTime: boolean;                         // 項番15
    site: 'none' | 'optional' | 'lateral' | 'required';  // 項番17
  };
  /** 0:標準コード / 1:適用ガイドコード（項番12）。guide は補足記録が必須 */
  codeKind?: 'standard' | 'guide';
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
