import { restoreFields } from './rxdb_restore.ts';

// 処方箋の受付(患者の更新または作成、受付、処方明細)を、全部書けたときだけ残す。
//
// 以前は3つを Promise.all で並行して書いていた。処方明細の保存が一部失敗する(または患者の更新が競合する)と、
// 受付だけが残り、「保存に失敗しました」と出て再送信すると、明細が欠けた受付と二重の受付ができた。
// 患者 -> 受付 -> 処方明細の順に書き、途中で失敗したら書いたものを逆順に取り消す。
export class PrescriptionRegistrationError extends Error {
  // 取り消しにも失敗し、途中まで保存されたデータが残っている可能性がある
  readonly rollbackFailed: boolean;
  readonly cause: unknown;
  constructor(message: string, cause: unknown, rollbackFailed: boolean) {
    super(message);
    this.name = 'PrescriptionRegistrationError';
    this.cause = cause;
    this.rollbackFailed = rollbackFailed;
  }
}

interface PatientDocument {
  patch: (values: any) => Promise<unknown>;
  incrementalPatch?: (values: any) => Promise<unknown>;
  toJSON: () => Record<string, unknown>;
}

interface RegistrationDb {
  patients: {
    insert: (doc: any) => Promise<unknown>;
    findOne: (id: string) => { exec: () => Promise<{ remove: () => Promise<unknown> } | null> };
  };
  visits: {
    insert: (doc: any) => Promise<unknown>;
    findOne: (id: string) => { exec: () => Promise<{ remove: () => Promise<unknown> } | null> };
  };
  prescription_items: {
    bulkInsert: (docs: any[]) => Promise<{ success?: Array<{ primary?: string; itemId?: string }>; error?: Array<{ documentId?: string }> }>;
    bulkRemove: (ids: string[]) => Promise<unknown>;
  };
}

export async function registerPrescriptionAtomically(params: {
  db: RegistrationDb;
  patientId: string;
  // 既存患者のドキュメント(受付の直前に読み直したもの)。無ければ新規患者として作る。
  existingPatientDoc?: PatientDocument | null;
  patientUpdate: Record<string, unknown>;
  newPatientDefaults: Record<string, unknown>;
  visit: { visitId: string } & Record<string, unknown>;
  items: Array<{ itemId: string } & Record<string, unknown>>;
}): Promise<void> {
  const { db, patientId, existingPatientDoc, patientUpdate, newPatientDefaults, visit, items } = params;
  const undoSteps: Array<() => Promise<void>> = [];

  try {
    if (existingPatientDoc) {
      const before = existingPatientDoc.toJSON();
      await existingPatientDoc.patch(patientUpdate);
      // 戻すときは、更新した項目を更新前の値へ。更新前に無かった項目は消す。
      const restore: Record<string, unknown> = {};
      for (const key of Object.keys(patientUpdate)) restore[key] = key in before ? before[key] : undefined;
      undoSteps.push(() => restoreFields(existingPatientDoc, restore));
    } else {
      await db.patients.insert({ patientId, ...newPatientDefaults, ...patientUpdate });
      undoSteps.push(async () => { await (await db.patients.findOne(patientId).exec())?.remove(); });
    }

    await db.visits.insert(visit);
    undoSteps.push(async () => { await (await db.visits.findOne(visit.visitId).exec())?.remove(); });

    // bulkInsert は個別のドキュメントの失敗を例外にしないため、結果を見る。
    // 取り消すのは書けた分だけ(失敗した分の ID は別の既存データのものかもしれない)。
    const result = await db.prescription_items.bulkInsert(items);
    const insertedIds = (result?.success ?? []).map((doc) => doc.primary ?? doc.itemId).filter((id): id is string => !!id);
    if (insertedIds.length > 0) {
      undoSteps.push(() => db.prescription_items.bulkRemove(insertedIds).then(() => undefined));
    }
    if (result?.error && result.error.length > 0) {
      console.error('Failed to insert prescription items:', JSON.stringify(result.error, null, 2).slice(0, 4000));
      throw new Error(`処方明細の保存に失敗しました（${result.error.length}件）。`);
    }
  } catch (error) {
    let rollbackFailed = false;
    for (const undo of undoSteps.reverse()) {
      try {
        await undo();
      } catch (undoError) {
        rollbackFailed = true;
        console.error('Failed to undo a prescription registration write:', undoError);
      }
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new PrescriptionRegistrationError(reason, error, rollbackFailed);
  }
}
