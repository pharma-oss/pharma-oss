import { runWithAuditRollback } from './audit_guard.ts';
import { restoreFields } from './rxdb_restore.ts';

// 1つのドキュメントの項目を書き換え、監査ログが残らなければ(または監査ログの処理が例外なら)元の値へ戻す。
// 書き込みは patch() のまま(他端末の同時更新を CONFLICT で検出するため)、戻すのは restoreFields。
// 監査ログが残らなかったときは AuditLogFailedError を投げ、戻す処理にも失敗したら、その旨がメッセージに加わる。
interface WritableDocument {
  patch: (values: any) => Promise<unknown>;
  incrementalPatch?: (values: any) => Promise<unknown>;
}

export async function patchWithAuditRollback(params: {
  doc: WritableDocument;
  patch: Record<string, unknown>;
  // 書き込み前の値(patch に含めた項目と同じキー)
  previous: Record<string, unknown>;
  logAudit: () => Promise<boolean>;
  failureMessage: string;
}): Promise<void> {
  await runWithAuditRollback({
    write: async () => {
      await params.doc.patch(params.patch);
    },
    logAudit: params.logAudit,
    rollback: () => restoreFields(params.doc, params.previous),
    failureMessage: params.failureMessage
  });
}
