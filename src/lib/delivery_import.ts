import type { DrugStock } from '../db/types.ts';
import {
  applyReversiblePatches,
  undoAppliedPatchesNote,
  type ReversiblePatch
} from './rxdb_restore.ts';
import { AuditLogFailedError, ROLLBACK_ALSO_FAILED_NOTE } from './audit_guard.ts';

// 卸データ・納品書の取込: ロット在庫を登録し、薬品マスタの在庫数へ加算する。
//
// 薬品マスタは bulkUpsert で書き戻してはいけない。upsert は文書を丸ごと置き換えるため、書き戻す項目を
// 列挙すると、列挙し忘れた項目(薬価履歴・調剤単位・発注点・リードタイム・目標在庫)が取込のたびに消える。
// 在庫数だけを patch する。
interface ImportDb {
  drug_stocks: {
    bulkInsert: (docs: DrugStock[]) => Promise<{ success: Array<{ remove: () => Promise<unknown> }>; error: unknown[] }>;
  };
  drugs: {
    findByIds: (ids: string[]) => { exec: () => Promise<Map<string, any>> };
  };
}

export interface DeliveryImportWritten {
  /** 書いたものを取り消す。戻せなかったものがあれば、その旨の注意書きを返す(全部戻せたら空文字) */
  undo: () => Promise<string>;
}

// 失敗したときは、そこまでに書いたものを取り消して投げる(取り消しにも失敗したら、その旨をメッセージに加える)。
export async function writeDeliveryStock(
  db: ImportDb,
  stockInserts: DrugStock[],
  quantityByDrugCode: Map<string, number>
): Promise<DeliveryImportWritten> {
  const insertedLots: Array<{ remove: () => Promise<unknown> }> = [];
  let appliedPatches: ReversiblePatch[] = [];

  const undo = async (): Promise<string> => {
    let note = '';
    for (let i = insertedLots.length - 1; i >= 0; i--) {
      try {
        await insertedLots[i].remove();
      } catch (error) {
        console.error('Failed to rollback imported stock lot:', error);
        note = ROLLBACK_ALSO_FAILED_NOTE;
      }
    }
    return (await undoAppliedPatchesNote(appliedPatches)) || note;
  };

  try {
    const lotResult = await db.drug_stocks.bulkInsert(stockInserts);
    insertedLots.push(...lotResult.success);
    if (lotResult.error.length > 0) {
      console.error('Failed to insert some stock lots:', lotResult.error);
      throw new Error(`${lotResult.error.length} 件のロット在庫登録に失敗しました。`);
    }

    const drugDocs = await db.drugs.findByIds(Array.from(quantityByDrugCode.keys())).exec();
    // ロットだけ登録されて、薬品マスタの在庫数が増えない状態を残さない
    const missingCodes = Array.from(quantityByDrugCode.keys()).filter((code) => !drugDocs.has(code));
    if (missingCodes.length > 0) {
      throw new Error(`薬品マスタに見つかりません: ${missingCodes.join(', ')}`);
    }
    const patches: ReversiblePatch[] = [];
    for (const [code, doc] of drugDocs.entries()) {
      const currentQuantity = doc.stockQuantity || 0;
      patches.push({
        doc,
        patch: { stockQuantity: currentQuantity + (quantityByDrugCode.get(code) || 0) },
        rollbackPatch: { stockQuantity: currentQuantity },
        label: `drug master ${code}`
      });
    }
    appliedPatches = await applyReversiblePatches(patches);
  } catch (error) {
    const note = await undo();
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${reason}${note}`);
  }

  return { undo };
}

// 画面に出す失敗の文言。監査ログが残らず取り消した場合と、取り消しにも失敗した場合だけ理由を添える
// (それ以外は内部のエラー文言を利用者に見せない)。
export function deliveryWriteFailureMessage(error: unknown, fallback: string): string {
  if (error instanceof AuditLogFailedError) return `${fallback} ${error.message}`;
  if (error instanceof Error && error.message.includes(ROLLBACK_ALSO_FAILED_NOTE.trim())) return `${fallback} ${error.message}`;
  return fallback;
}
