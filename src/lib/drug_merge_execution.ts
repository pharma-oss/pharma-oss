// 薬品統合計画の実行とロールバック。patient_merge_execution と同じ構成。
// 途中で失敗した場合は適用済み操作の逆操作を返し、呼び出し側で取り消せるようにする。
import type { Drug } from '../db/types.ts';
import {
  buildDrugMergeRollbackOperations,
  type DrugMergeExecutionPlan,
  type DrugMergeItemField,
  type DrugMergeOperation
} from './drug_merge.ts';

export interface DrugMergeExecutionStore {
  upsertDrug(drug: Drug): Promise<void>;
  deleteDrug(code: string): Promise<void>;
  patchItemDrugField(itemId: string, field: DrugMergeItemField, code: string): Promise<void>;
  patchStockDrug(stockId: string, code: string): Promise<void>;
}

export interface DrugMergeOperationRunResult {
  appliedOperations: DrugMergeOperation[];
  auditDetail: string;
  checklist: string[];
}

export interface DrugMergeApplyResult extends DrugMergeOperationRunResult {
  rollbackOperations: DrugMergeOperation[];
}

export class DrugMergeExecutionError extends Error {
  readonly failedOperation: DrugMergeOperation | null;
  readonly appliedOperations: DrugMergeOperation[];
  readonly rollbackOperations: DrugMergeOperation[];
  readonly cause?: unknown;

  constructor(
    message: string,
    failedOperation: DrugMergeOperation | null,
    appliedOperations: DrugMergeOperation[],
    cause?: unknown
  ) {
    super(message);
    this.name = 'DrugMergeExecutionError';
    this.failedOperation = failedOperation;
    this.appliedOperations = appliedOperations;
    this.rollbackOperations = buildDrugMergeRollbackOperations(appliedOperations);
    this.cause = cause;
    Object.setPrototypeOf(this, DrugMergeExecutionError.prototype);
  }
}

// RxDBコレクションを DrugMergeExecutionStore として扱う共通ファクトリ
export function createRxdbDrugMergeExecutionStore(db: {
  drugs: any;
  drug_stocks: any;
  prescription_items: any;
}): DrugMergeExecutionStore {
  return {
    async upsertDrug(drug) {
      const drugDoc = await db.drugs.findOne(drug.code).exec();
      if (drugDoc) {
        await drugDoc.patch(drug);
      } else {
        await db.drugs.insert(drug);
      }
    },
    async deleteDrug(code) {
      const drugDoc = await db.drugs.findOne(code).exec();
      if (!drugDoc) return;
      await drugDoc.remove();
    },
    async patchItemDrugField(itemId, field, code) {
      const itemDoc = await db.prescription_items.findOne(itemId).exec();
      if (!itemDoc) throw new Error(`処方明細が見つかりません: ${itemId}`);
      await itemDoc.patch({ [field]: code });
    },
    async patchStockDrug(stockId, code) {
      const stockDoc = await db.drug_stocks.findOne(stockId).exec();
      if (!stockDoc) throw new Error(`在庫ロットが見つかりません: ${stockId}`);
      await stockDoc.patch({ drugCode: code });
    }
  };
}

export async function applyDrugMergeOperation(
  store: DrugMergeExecutionStore,
  operation: DrugMergeOperation
): Promise<void> {
  switch (operation.type) {
    case 'upsert_drug':
      await store.upsertDrug(operation.after);
      return;
    case 'delete_drug':
      await store.deleteDrug(operation.code);
      return;
    case 'patch_item_drug':
      await store.patchItemDrugField(operation.itemId, operation.field, operation.afterCode);
      return;
    case 'patch_stock_drug':
      await store.patchStockDrug(operation.stockId, operation.afterCode);
      return;
  }
}

export async function applyDrugMergeExecutionPlan(
  store: DrugMergeExecutionStore,
  executionPlan: DrugMergeExecutionPlan
): Promise<DrugMergeApplyResult> {
  if (!executionPlan.canApply || executionPlan.applyOperations.length === 0) {
    throw new DrugMergeExecutionError(
      '薬品統合計画は実行できません。統合前の確認事項を見直してください。',
      null,
      []
    );
  }

  const appliedOperations: DrugMergeOperation[] = [];
  for (const operation of executionPlan.applyOperations) {
    try {
      await applyDrugMergeOperation(store, operation);
      appliedOperations.push(operation);
    } catch (error) {
      throw new DrugMergeExecutionError(
        '薬品統合の実行中に失敗しました。適用済みの操作だけ取り消してから再確認してください。',
        operation,
        appliedOperations,
        error
      );
    }
  }

  return {
    appliedOperations,
    auditDetail: executionPlan.auditDetail,
    checklist: executionPlan.checklist,
    rollbackOperations: buildDrugMergeRollbackOperations(appliedOperations)
  };
}
