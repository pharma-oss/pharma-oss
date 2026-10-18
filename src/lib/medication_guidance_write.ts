// 服薬指導補助の文例（medication_guidances）の保存。
// 文例は全患者の SOAP に追記される共有の参照データなので、薬情テンプレと同じく
// 権限（manage_facility_settings）で守り、書き込みは「書込 → 監査ログ → 残らなければ元に戻す」にする。

import { canUserPerform, getPermissionDeniedMessage, type PermissionAction } from './audit.ts';
import { AuditLogFailedError, runWithAuditRollback } from './audit_guard.ts';
import { patchWithAuditRollback } from './doc_audit_write.ts';
import { GUIDANCE_ENTRY_TYPES } from './medication_guidance.ts';
import type { User } from '../db/types.ts';

// 薬情テンプレの編集（useMedicationInfoTemplateSettings）と同じ権限。薬剤師と管理者が編集でき、事務はできない。
export const MEDICATION_GUIDANCE_EDIT_PERMISSION: PermissionAction = 'manage_facility_settings';

export const MEDICATION_GUIDANCE_AUDIT_FAILED_MESSAGE =
  '監査ログの記録に失敗したため、服薬指導文例の保存を取り消しました。';

export type MedicationGuidanceEditCheck = { ok: true } | { ok: false; message: string };

export function checkMedicationGuidanceEditPermission(user: User, policy?: Parameters<typeof canUserPerform>[2]): MedicationGuidanceEditCheck {
  if (canUserPerform(user, MEDICATION_GUIDANCE_EDIT_PERMISSION, policy)) {
    return { ok: true };
  }
  return { ok: false, message: getPermissionDeniedMessage(user, MEDICATION_GUIDANCE_EDIT_PERMISSION) };
}

export function buildMedicationGuidanceAuditDetail(params: {
  mode: 'create' | 'update';
  drugName: string;
  drugCode: string;
  entries: ReadonlyArray<{ type: string }>;
}): string {
  const counts = GUIDANCE_ENTRY_TYPES
    .map((type) => `${type} ${params.entries.filter((entry) => entry.type === type).length}`)
    .join(' / ');
  const action = params.mode === 'create' ? '登録' : '更新';
  return `服薬指導文例${action}: ${params.drugName} (${params.drugCode}) / 項目 ${params.entries.length}件 (${counts})`;
}

interface GuidanceDocumentHandle {
  patch: (values: Record<string, unknown>) => Promise<unknown>;
  incrementalPatch?: (values: Record<string, unknown>) => Promise<unknown>;
  remove: () => Promise<unknown>;
  toJSON: () => { entries: ReadonlyArray<{ type: string; text: string }>; updatedAt: string };
}

export interface GuidanceCollectionLike {
  findOne: (query: { selector: { id: string } }) => { exec: () => Promise<GuidanceDocumentHandle | null> };
  insert: (doc: {
    id: string;
    drugCode: string;
    drugName: string;
    entries: Array<{ type: string; text: string }>;
    updatedAt: string;
  }) => Promise<unknown>;
}

export async function saveMedicationGuidance(params: {
  collection: GuidanceCollectionLike;
  // 既存の文書を更新するときの id。なければ（または文書が消えていたら）新しく登録する
  docId: string | null;
  drug: { code: string; name: string };
  entries: Array<{ type: string; text: string }>;
  now: string;
  newId: string;
  logAudit: (detail: string) => Promise<boolean>;
}): Promise<{ id: string; mode: 'create' | 'update' }> {
  const failureMessage = MEDICATION_GUIDANCE_AUDIT_FAILED_MESSAGE;

  if (params.docId) {
    const doc = await params.collection.findOne({ selector: { id: params.docId } }).exec();
    if (doc) {
      const stored = doc.toJSON();
      const detail = buildMedicationGuidanceAuditDetail({
        mode: 'update',
        drugName: params.drug.name,
        drugCode: params.drug.code,
        entries: params.entries
      });
      await patchWithAuditRollback({
        doc,
        patch: { entries: params.entries, updatedAt: params.now },
        previous: { entries: stored.entries.map((entry) => ({ type: entry.type, text: entry.text })), updatedAt: stored.updatedAt },
        logAudit: () => params.logAudit(detail),
        failureMessage
      });
      return { id: params.docId, mode: 'update' };
    }
    // 読み込み後に別の端末の同期で消えた場合は、編集した内容を失わないよう新しく登録する
  }

  const detail = buildMedicationGuidanceAuditDetail({
    mode: 'create',
    drugName: params.drug.name,
    drugCode: params.drug.code,
    entries: params.entries
  });
  await runWithAuditRollback({
    write: async () => {
      await params.collection.insert({
        id: params.newId,
        drugCode: params.drug.code,
        drugName: params.drug.name,
        entries: params.entries,
        updatedAt: params.now
      });
      return params.newId;
    },
    logAudit: () => params.logAudit(detail),
    rollback: async (id) => {
      const inserted = await params.collection.findOne({ selector: { id } }).exec();
      if (inserted) await inserted.remove();
    },
    failureMessage
  });
  return { id: params.newId, mode: 'create' };
}

// 画面に出す保存失敗の文言。監査ログが残らなかったときはその理由を、それ以外は共通の文言にする。
export function getMedicationGuidanceSaveErrorMessage(error: unknown): string {
  if (error instanceof AuditLogFailedError) return error.message;
  return '保存に失敗しました';
}
