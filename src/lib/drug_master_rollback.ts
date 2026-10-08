import type { Drug, PharmacyDatabase } from '../db/types.ts';
import type { DrugMasterRollbackPayload } from './drug_master_version.ts';

export interface DrugMasterRestoreResult {
  restoredCount: number;
  deletedCount: number;
  // この復元そのものを取り消し、復元前の薬品マスタへ戻す(復元の監査ログが残らなかったときに使う)
  undo: () => Promise<void>;
}

type DrugMasterDb = Pick<PharmacyDatabase, 'drugs'>;

// ロールバック情報(更新前の行と、更新で追加された薬品コード)を薬品マスタへ適用する。
// 更新の取り込み・手動ロールバックの両方で使う。適用前の状態を控え、undo で戻せる。
export async function restoreDrugMasterFromRollback(
  db: DrugMasterDb,
  payload: Pick<DrugMasterRollbackPayload, 'restoreRows' | 'deleteCodes'>
): Promise<DrugMasterRestoreResult> {
  const affectedCodes = Array.from(new Set([
    ...payload.restoreRows.map((row) => row.code),
    ...payload.deleteCodes
  ]));
  const currentDocs = affectedCodes.length > 0
    ? await db.drugs.findByIds(affectedCodes).exec()
    : new Map();
  const before = new Map<string, Drug>();
  for (const code of affectedCodes) {
    const doc = currentDocs.get(code);
    if (doc) before.set(code, doc.toJSON() as Drug);
  }

  if (payload.restoreRows.length > 0) {
    const restoreResult = await db.drugs.bulkUpsert(payload.restoreRows);
    if (restoreResult.error.length > 0) {
      console.error('Failed to restore some drug master rollback records:', restoreResult.error);
      throw new Error(`${restoreResult.error.length}件の薬品マスター復元に失敗しました。`);
    }
  }

  let deletedCount = 0;
  for (const code of payload.deleteCodes) {
    const doc = await db.drugs.findOne(code).exec();
    if (doc) {
      await doc.remove();
      deletedCount++;
    }
  }

  const undo = async () => {
    const rowsToBringBack = affectedCodes.filter((code) => before.has(code)).map((code) => before.get(code)!);
    if (rowsToBringBack.length > 0) {
      const result = await db.drugs.bulkUpsert(rowsToBringBack);
      if (result.error.length > 0) {
        throw new Error(`${result.error.length}件の薬品マスターを復元前へ戻せませんでした。`);
      }
    }
    // 復元で新しく作られた行(復元前には無かった薬品コード)は消す
    for (const row of payload.restoreRows) {
      if (before.has(row.code)) continue;
      const doc = await db.drugs.findOne(row.code).exec();
      if (doc) await doc.remove();
    }
  };

  return { restoredCount: payload.restoreRows.length, deletedCount, undo };
}
