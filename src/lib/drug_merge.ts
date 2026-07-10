// 薬品マスタ重複の統合計画。patient_merge と同じ構成で、
// 計画(このファイル) → 実行/ロールバック(drug_merge_execution) に分ける。
// 統合先(残す薬品)を基準に、在庫ロットと処方参照を付け替え、統合元を削除する。
// 過去請求のUKE・請求時点スナップショットは書き換えない(履歴は請求スナップショットが保持する)。
import type { Drug } from '../db/types.ts';

export type DrugMergeItemField = 'drugId' | 'dispensedDrugCode';
export type DrugMergeIssueSeverity = 'error' | 'warning';

export interface DrugMergeIssue {
  severity: DrugMergeIssueSeverity;
  code: string;
  message: string;
}

export interface DrugMergeConflict {
  field: string;
  label: string;
  targetValue: string;
  sourceValue: string;
}

export interface DrugMergeItemRef {
  itemId: string;
  field: DrugMergeItemField;
}

export interface DrugMergePlanInput {
  targetDrug: Drug;
  sourceDrug: Drug;
  sourceItemRefs?: DrugMergeItemRef[];
  sourceStockIds?: string[];
  // 統合元コードに紐づく薬情テンプレ・服薬指導文の件数(付け替えないため警告表示に使う)
  sourceTemplateCount?: number;
  sourceGuidanceCount?: number;
}

export interface DrugMergeUpsertOperation {
  type: 'upsert_drug';
  code: string;
  before: Drug;
  after: Drug;
}

export interface DrugMergeDeleteOperation {
  type: 'delete_drug';
  code: string;
  before: Drug;
}

export interface DrugMergeItemPatchOperation {
  type: 'patch_item_drug';
  itemId: string;
  field: DrugMergeItemField;
  beforeCode: string;
  afterCode: string;
}

export interface DrugMergeStockPatchOperation {
  type: 'patch_stock_drug';
  stockId: string;
  beforeCode: string;
  afterCode: string;
}

export type DrugMergeOperation =
  | DrugMergeUpsertOperation
  | DrugMergeDeleteOperation
  | DrugMergeItemPatchOperation
  | DrugMergeStockPatchOperation;

export interface DrugMergeExecutionPlan {
  canApply: boolean;
  applyOperations: DrugMergeOperation[];
  rollbackOperations: DrugMergeOperation[];
  auditDetail: string;
  checklist: string[];
}

export interface DrugMergePlan {
  targetCode: string;
  sourceCode: string;
  sourceDrug: Drug;
  targetDrugBefore: Drug;
  mergedDrug: Drug;
  itemRefs: DrugMergeItemRef[];
  stockIds: string[];
  conflicts: DrugMergeConflict[];
  issues: DrugMergeIssue[];
  canApply: boolean;
  summary: string;
}

const asText = (value: unknown): string => String(value ?? '').trim();

function addConflict(
  conflicts: DrugMergeConflict[],
  field: string,
  label: string,
  targetValue: unknown,
  sourceValue: unknown
) {
  const targetText = asText(targetValue);
  const sourceText = asText(sourceValue);
  if (!targetText || !sourceText || targetText === sourceText) return;
  conflicts.push({ field, label, targetValue: targetText, sourceValue: sourceText });
}

function mergeField<T>(targetValue: T | undefined, sourceValue: T | undefined): T | undefined {
  return asText(targetValue) ? targetValue : sourceValue;
}

function buildMergedDrug(targetDrug: Drug, sourceDrug: Drug, conflicts: DrugMergeConflict[]): Drug {
  addConflict(conflicts, 'name', '薬品名', targetDrug.name, sourceDrug.name);
  addConflict(conflicts, 'yjCode', 'YJコード', targetDrug.yjCode, sourceDrug.yjCode);
  addConflict(conflicts, 'price', '薬価', targetDrug.price, sourceDrug.price);
  addConflict(conflicts, 'genericName', '一般名', targetDrug.genericName, sourceDrug.genericName);
  addConflict(conflicts, 'location', '棚番地', targetDrug.location, sourceDrug.location);

  return {
    ...targetDrug,
    yjCode: mergeField(targetDrug.yjCode, sourceDrug.yjCode),
    genericName: mergeField(targetDrug.genericName, sourceDrug.genericName),
    price: targetDrug.price ?? sourceDrug.price,
    location: mergeField(targetDrug.location, sourceDrug.location),
    documentUrl: mergeField(targetDrug.documentUrl, sourceDrug.documentUrl),
    // 在庫数は合算する(在庫ロットは付け替えで引き継ぐ)
    stockQuantity: (targetDrug.stockQuantity || 0) + (sourceDrug.stockQuantity || 0),
    // 安全区分はどちらかに付いていれば残す(外す方向の統合はさせない)
    isNarcotic: !!(targetDrug.isNarcotic || sourceDrug.isNarcotic),
    isPsychotropic: !!(targetDrug.isPsychotropic || sourceDrug.isPsychotropic),
    isPoisonous: !!(targetDrug.isPoisonous || sourceDrug.isPoisonous),
    isHighRisk: !!(targetDrug.isHighRisk || sourceDrug.isHighRisk)
  };
}

export function buildDrugMergePlan(input: DrugMergePlanInput): DrugMergePlan {
  const { targetDrug, sourceDrug } = input;
  const issues: DrugMergeIssue[] = [];
  const conflicts: DrugMergeConflict[] = [];

  if (targetDrug.code === sourceDrug.code) {
    issues.push({
      severity: 'error',
      code: 'drug_merge_same_drug',
      message: '同じ薬品コード同士は統合できません。'
    });
  }

  const targetYj = asText(targetDrug.yjCode);
  const sourceYj = asText(sourceDrug.yjCode);
  if (targetYj && sourceYj && targetYj !== sourceYj) {
    issues.push({
      severity: 'error',
      code: 'drug_merge_yj_differs',
      message: 'YJコードが異なるため別薬品の可能性があります。統合できません。'
    });
  }

  if (asText(targetDrug.name) && asText(sourceDrug.name) && asText(targetDrug.name) !== asText(sourceDrug.name)) {
    issues.push({
      severity: 'warning',
      code: 'drug_merge_name_differs',
      message: '薬品名が異なります。同一薬品(規格)か添付文書・マスタで確認してください。'
    });
  }

  if (targetDrug.price !== undefined && sourceDrug.price !== undefined && targetDrug.price !== sourceDrug.price) {
    issues.push({
      severity: 'warning',
      code: 'drug_merge_price_differs',
      message: `薬価が異なります(残す: ${targetDrug.price} / 統合元: ${sourceDrug.price})。統合後は残す薬品の薬価で計算されます。`
    });
  }

  if (targetDrug.isAbolished && !sourceDrug.isAbolished) {
    issues.push({
      severity: 'warning',
      code: 'drug_merge_target_abolished',
      message: '残す薬品が廃止済みです。廃止でない方を残す指定になっていないか確認してください。'
    });
  }

  if ((input.sourceTemplateCount || 0) > 0 || (input.sourceGuidanceCount || 0) > 0) {
    issues.push({
      severity: 'warning',
      code: 'drug_merge_source_documents',
      message: `統合元コードの薬情テンプレ${input.sourceTemplateCount || 0}件・指導文${input.sourceGuidanceCount || 0}件は付け替えません。必要な場合は統合先コードで作成・承認し直してください。`
    });
  }

  const mergedDrug = buildMergedDrug(targetDrug, sourceDrug, conflicts);
  const itemRefs = (input.sourceItemRefs || []).filter((ref) => ref.itemId);
  const stockIds = (input.sourceStockIds || []).filter(Boolean);
  const canApply = issues.every((issue) => issue.severity !== 'error');

  return {
    targetCode: targetDrug.code,
    sourceCode: sourceDrug.code,
    sourceDrug,
    targetDrugBefore: targetDrug,
    mergedDrug,
    itemRefs,
    stockIds,
    conflicts,
    issues,
    canApply,
    summary: `${sourceDrug.name}（${sourceDrug.code}）を ${targetDrug.name}（${targetDrug.code}）へ統合: 処方参照${itemRefs.length}件・在庫ロット${stockIds.length}件を付け替え、確認事項${issues.length + conflicts.length}件`
  };
}

export function buildDrugMergeAuditDetail(plan: DrugMergePlan): string {
  const conflictText = plan.conflicts.length > 0
    ? `確認事項 ${plan.conflicts.map((conflict) => `${conflict.label}:${conflict.sourceValue}->${conflict.targetValue}`).join('、')}`
    : '確認事項なし';
  return [
    `薬品統合プレビュー: ${plan.sourceCode} -> ${plan.targetCode}`,
    `処方参照 ${plan.itemRefs.length}件 / 在庫ロット ${plan.stockIds.length}件`,
    conflictText,
    `判定 ${plan.canApply ? '統合可能' : '統合不可'}`
  ].join(' / ');
}

export function buildDrugMergeExecutionPlan(plan: DrugMergePlan): DrugMergeExecutionPlan {
  const applyOperations: DrugMergeOperation[] = [];

  applyOperations.push({
    type: 'upsert_drug',
    code: plan.targetCode,
    before: plan.targetDrugBefore,
    after: plan.mergedDrug
  });
  for (const ref of plan.itemRefs) {
    applyOperations.push({
      type: 'patch_item_drug',
      itemId: ref.itemId,
      field: ref.field,
      beforeCode: plan.sourceCode,
      afterCode: plan.targetCode
    });
  }
  for (const stockId of plan.stockIds) {
    applyOperations.push({
      type: 'patch_stock_drug',
      stockId,
      beforeCode: plan.sourceCode,
      afterCode: plan.targetCode
    });
  }
  applyOperations.push({
    type: 'delete_drug',
    code: plan.sourceCode,
    before: plan.sourceDrug
  });

  const rollbackOperations = buildDrugMergeRollbackOperations(applyOperations);

  return {
    canApply: plan.canApply,
    applyOperations: plan.canApply ? applyOperations : [],
    rollbackOperations: plan.canApply ? rollbackOperations : [],
    auditDetail: buildDrugMergeAuditDetail(plan),
    checklist: [
      '統合先・統合元が同一薬品(同一規格)であることを確認した',
      '薬価・YJコード・棚番地の差分を確認した',
      '統合後に在庫数と発注候補を確認する'
    ]
  };
}

export function invertDrugMergeOperation(operation: DrugMergeOperation): DrugMergeOperation {
  switch (operation.type) {
    case 'upsert_drug':
      return { type: 'upsert_drug', code: operation.code, before: operation.after, after: operation.before };
    case 'delete_drug':
      return { type: 'upsert_drug', code: operation.code, before: operation.before, after: operation.before };
    case 'patch_item_drug':
      return {
        type: 'patch_item_drug',
        itemId: operation.itemId,
        field: operation.field,
        beforeCode: operation.afterCode,
        afterCode: operation.beforeCode
      };
    case 'patch_stock_drug':
      return {
        type: 'patch_stock_drug',
        stockId: operation.stockId,
        beforeCode: operation.afterCode,
        afterCode: operation.beforeCode
      };
  }
}

export function buildDrugMergeRollbackOperations(operations: DrugMergeOperation[]): DrugMergeOperation[] {
  return [...operations].reverse().map(invertDrugMergeOperation);
}
