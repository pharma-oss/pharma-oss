import { test } from 'node:test';
import assert from 'node:assert';
import { AuditLogFailedError, ROLLBACK_ALSO_FAILED_NOTE } from './audit_guard.ts';
import { patchWithAuditRollback } from './doc_audit_write.ts';
import { RxLikeStore } from './test_support/rxdb_like_doc.ts';

// スタッフのパスキー登録・パスワード再設定・パスキー解除と同じ形: 認証情報を書き換え、監査ログが残らなければ戻す
const PREVIOUS_PASSKEY = { passkeyCredentialId: 'cred-old', passkeyPublicKey: 'key-old' };
const NEW_PASSKEY = { passkeyCredentialId: 'cred-new', passkeyPublicKey: 'key-new' };
const MESSAGE = 'パスキー登録の監査ログ記録に失敗したため、登録を取り消しました。';

function staffDoc(initial: Record<string, unknown> = PREVIOUS_PASSKEY) {
  const store = new RxLikeStore({ userId: 'u1', name: '薬剤師', ...initial });
  return { store, doc: store.open() };
}

test('patchWithAuditRollback keeps the new values and audits once when the audit log is recorded', async () => {
  const { store, doc } = staffDoc();
  let audits = 0;

  await patchWithAuditRollback({
    doc, patch: NEW_PASSKEY, previous: PREVIOUS_PASSKEY,
    logAudit: async () => { audits += 1; return true; },
    failureMessage: MESSAGE
  });

  assert.strictEqual(audits, 1);
  assert.strictEqual(store.current().passkeyCredentialId, 'cred-new');
});

test('patchWithAuditRollback puts the previous credentials back when the audit log is not recorded', async () => {
  const { store, doc } = staffDoc();

  await assert.rejects(
    () => patchWithAuditRollback({ doc, patch: NEW_PASSKEY, previous: PREVIOUS_PASSKEY, logAudit: async () => false, failureMessage: MESSAGE }),
    (error: unknown) => error instanceof AuditLogFailedError && error.message === MESSAGE && error.rollbackFailed === false
  );

  assert.strictEqual(store.current().passkeyCredentialId, 'cred-old');
  assert.strictEqual(store.current().passkeyPublicKey, 'key-old');
});

test('patchWithAuditRollback also puts the values back when building the audit entry throws, and rethrows that error', async () => {
  const { store, doc } = staffDoc();

  await assert.rejects(
    () => patchWithAuditRollback({
      doc, patch: NEW_PASSKEY, previous: PREVIOUS_PASSKEY,
      logAudit: async () => { throw new Error('could not build the audit detail'); },
      failureMessage: MESSAGE
    }),
    /could not build the audit detail/
  );

  assert.strictEqual(store.current().passkeyCredentialId, 'cred-old');
});

test('patchWithAuditRollback says so when the undo also fails', async () => {
  const { store, doc } = staffDoc();
  // 最初の書き込み(新しい値)は通し、戻す書き込みだけ失敗させる
  store.failWrite = (values) => values.passkeyCredentialId === 'cred-old';

  await assert.rejects(
    () => patchWithAuditRollback({ doc, patch: NEW_PASSKEY, previous: PREVIOUS_PASSKEY, logAudit: async () => false, failureMessage: MESSAGE }),
    (error: unknown) => error instanceof AuditLogFailedError && error.rollbackFailed === true && error.message.endsWith(ROLLBACK_ALSO_FAILED_NOTE)
  );
});

test('patchWithAuditRollback does not write an audit entry when the write itself conflicts with another writer', async () => {
  const { store, doc } = staffDoc();
  // 別の端末が先にこのスタッフを書き換えた(このインスタンスは古い版)
  await store.open().patch({ name: '薬剤師(改名)' });
  let audits = 0;

  await assert.rejects(
    () => patchWithAuditRollback({
      doc, patch: NEW_PASSKEY, previous: PREVIOUS_PASSKEY,
      logAudit: async () => { audits += 1; return true; },
      failureMessage: MESSAGE
    }),
    /CONFLICT/
  );

  assert.strictEqual(audits, 0, 'nothing happened, so nothing is recorded');
  assert.strictEqual(store.current().passkeyCredentialId, 'cred-old');
  assert.strictEqual(store.current().name, '薬剤師(改名)', 'the other writer\'s change is untouched');
});
