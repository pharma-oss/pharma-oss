// マスター取込で、薬価以外の項目（名称・YJコード・廃止フラグ）をどう当てるか。
//
// これらには適用開始日が無い。マスターの行は「今この薬品はこうである」としか
// 言っておらず、いつからそうなのかは書かれていない。したがって取込済みより
// 古いファイルの値は、手元の値より前の状態であって、上書きしてはいけない。
//
// 特に isAbolished は取り込むたびに無条件で書き換わっていたため、古いファイルを
// 取り込むと廃止済みの薬品が復活する。廃止コードでの調剤・請求につながる。

export interface DrugMasterAttributeSource {
  /** 既にある薬品の名称。マスターの行が空でも名前は必ず残す */
  name: string;
  yjCode?: string;
  isAbolished?: boolean;
  unitText?: string;
  unitCode?: string;
}

export interface DrugMasterAttributeRow {
  name?: string;
  yjCode?: string;
  isAbolished: boolean;
  unitText?: string;
  unitCode?: string;
}

export interface DrugMasterAttributeUpdate {
  name: string;
  yjCode?: string;
  isAbolished: boolean;
  unitText?: string;
  unitCode?: string;
  /** 古いファイルなので手元の値を残したか */
  keptStored: boolean;
}

export interface ResolveDrugMasterAttributesOptions {
  /** このファイルが取込済みより古いと分かっているか */
  sourceIsOlderThanStored?: boolean;
}

/**
 * 既にある薬品にマスターの行を当てる。
 *
 * 通常の取込では、空でない値だけを上書きする（これまでどおり）。
 * 取込済みより古いファイルでは、手元の値をそのまま残す。
 */
export function resolveDrugMasterAttributes(
  stored: DrugMasterAttributeSource,
  row: DrugMasterAttributeRow,
  options?: ResolveDrugMasterAttributesOptions
): DrugMasterAttributeUpdate {
  if (options?.sourceIsOlderThanStored) {
    return {
      name: stored.name,
      yjCode: stored.yjCode,
      // 項目を持たない既存ドキュメントは「廃止されていない」として扱う
      isAbolished: stored.isAbolished ?? false,
      ...(stored.unitText ? { unitText: stored.unitText } : {}),
      ...(stored.unitCode ? { unitCode: stored.unitCode } : {}),
      keptStored: true
    };
  }

  const unitText = row?.unitText || stored.unitText;
  const unitCode = row?.unitCode || stored.unitCode;

  return {
    name: row?.name || stored.name,
    yjCode: row?.yjCode || stored.yjCode,
    isAbolished: row.isAbolished,
    ...(unitText ? { unitText } : {}),
    ...(unitCode ? { unitCode } : {}),
    keptStored: false
  };
}
