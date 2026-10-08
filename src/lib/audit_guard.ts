// 監査ログが残らなかったときの扱いを、操作の性質ごとに揃えるための部品。
//
// - 書き出し (読み取りだけで、データを持ち出す操作): 監査ログ -> ダウンロード。残らなければ書き出さない。
// - 書き込み (データを書き換える操作): 書き込み -> 監査ログ。残らなければ書き込みを元に戻して失敗にする。
// - 点検・結果の記録 (止めても意味がないもの): 処理は止めず、記録が残らなかったことを利用者へ知らせる。

// 監査ログが残らなかったことを示すエラー。rollbackFailed は、元に戻す処理にも失敗したことを表す。
export class AuditLogFailedError extends Error {
  readonly rollbackFailed: boolean;
  constructor(message: string, rollbackFailed = false) {
    super(message);
    this.rollbackFailed = rollbackFailed;
  }
}

export const ROLLBACK_ALSO_FAILED_NOTE = ' ただし、元に戻す処理にも失敗しました。データを確認してください。';

export const EXPORT_AUDIT_FAILED_MESSAGE = '監査ログ記録に失敗したため、書き出しを中止しました。';

// 監査ログが残らなかったので書き出しを止めたことを示すエラー。画面はメッセージをそのまま利用者へ見せてよい。
export class ExportAuditFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportAuditFailedError';
  }
}
export const AUDIT_NOT_RECORDED_NOTICE =
  '監査ログへの記録に失敗しました。この操作の記録が残っていないため、管理者へ連絡してください。';

// 監査ログ -> ダウンロード。監査ログが残らなければダウンロードは起こさず、Error を投げる。
export async function exportWithAuditFirst(params: {
  logAudit: () => Promise<boolean>;
  // ダウンロード、またはクリップボードへのコピーなど、データを持ち出す処理
  download: () => void | Promise<void>;
  failureMessage?: string;
}): Promise<void> {
  const auditOk = await params.logAudit();
  if (!auditOk) {
    throw new ExportAuditFailedError(params.failureMessage ?? EXPORT_AUDIT_FAILED_MESSAGE);
  }
  await params.download();
}

// 書き込み -> 監査ログ。監査ログが残らない、または監査ログの処理が例外になったときは、
// rollback に書き込みの結果を渡して元に戻し、元のエラーを投げる。
// 監査ログが残らなかった場合は AuditLogFailedError を投げ、元に戻す処理にも失敗したときは
// その旨をメッセージに加える。監査ログの処理が例外だった場合は、その例外をそのまま投げる。
// logAudit には書き込みの結果を渡す(監査ログの文言を結果から組み立てられる)。
// write が自分で失敗した場合は何も書かれていない前提(write の中で後始末すること)。
export async function runWithAuditRollback<T>(params: {
  write: () => Promise<T>;
  logAudit: (written: T) => Promise<boolean>;
  rollback: (written: T) => Promise<void>;
  failureMessage: string;
}): Promise<T> {
  const written = await params.write();
  try {
    const auditOk = await params.logAudit(written);
    if (!auditOk) {
      throw new AuditLogFailedError(params.failureMessage);
    }
  } catch (error) {
    let rollbackFailed = false;
    try {
      await params.rollback(written);
    } catch (rollbackError) {
      rollbackFailed = true;
      console.error('Failed to roll back after an audit log failure:', rollbackError);
    }
    if (rollbackFailed && error instanceof AuditLogFailedError) {
      throw new AuditLogFailedError(`${error.message}${ROLLBACK_ALSO_FAILED_NOTE}`, true);
    }
    throw error;
  }
  return written;
}

// 止めても意味のない記録(点検の実行、外部送信の結果など)。残らなかったことだけを知らせる。
export async function recordAuditOrNotify(
  logAudit: () => Promise<boolean>,
  notify: (message: string) => void
): Promise<boolean> {
  let auditOk = false;
  try {
    auditOk = await logAudit();
  } catch (error) {
    console.error('Failed to record audit log:', error);
  }
  if (!auditOk) notify(AUDIT_NOT_RECORDED_NOTICE);
  return auditOk;
}
