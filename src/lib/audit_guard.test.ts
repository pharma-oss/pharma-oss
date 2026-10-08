import { test } from 'node:test';
import assert from 'node:assert';
import {
  AUDIT_NOT_RECORDED_NOTICE,
  AuditLogFailedError,
  EXPORT_AUDIT_FAILED_MESSAGE,
  ExportAuditFailedError,
  ROLLBACK_ALSO_FAILED_NOTE,
  exportWithAuditFirst,
  recordAuditOrNotify,
  runWithAuditRollback
} from './audit_guard.ts';

test('exportWithAuditFirst downloads only after the audit log was recorded', async () => {
  const events: string[] = [];
  await exportWithAuditFirst({
    logAudit: async () => { events.push('audit'); return true; },
    download: () => { events.push('download'); }
  });
  assert.deepStrictEqual(events, ['audit', 'download']);
});

test('exportWithAuditFirst does not download when the audit log fails, and says so', async () => {
  const events: string[] = [];
  await assert.rejects(
    () => exportWithAuditFirst({
      logAudit: async () => { events.push('audit'); return false; },
      download: () => { events.push('download'); }
    }),
    (error: unknown) => error instanceof ExportAuditFailedError && error.message === EXPORT_AUDIT_FAILED_MESSAGE
  );
  assert.deepStrictEqual(events, ['audit']);

  await assert.rejects(
    () => exportWithAuditFirst({ logAudit: async () => false, download: () => {}, failureMessage: '個別の文言' }),
    (error: unknown) => error instanceof ExportAuditFailedError && error.message === '個別の文言'
  );
});

test('exportWithAuditFirst waits for an async download such as a clipboard write, and skips it when the audit log fails', async () => {
  const events: string[] = [];
  await exportWithAuditFirst({
    logAudit: async () => { events.push('audit'); return true; },
    download: async () => { await Promise.resolve(); events.push('copied'); }
  });
  assert.deepStrictEqual(events, ['audit', 'copied'], 'the copy has finished when the call returns');

  await assert.rejects(
    () => exportWithAuditFirst({ logAudit: async () => false, download: async () => { events.push('copied again'); } }),
    ExportAuditFailedError
  );
  assert.deepStrictEqual(events, ['audit', 'copied']);
});

test('runWithAuditRollback keeps the write when the audit log is recorded', async () => {
  const events: string[] = [];
  const result = await runWithAuditRollback({
    write: async () => { events.push('write'); return { id: 7 }; },
    logAudit: async () => { events.push('audit'); return true; },
    rollback: async () => { events.push('rollback'); },
    failureMessage: '失敗'
  });
  assert.deepStrictEqual(result, { id: 7 });
  assert.deepStrictEqual(events, ['write', 'audit']);
});

test('runWithAuditRollback hands the written result to rollback and fails when the audit log fails', async () => {
  const rolledBack: unknown[] = [];
  await assert.rejects(
    () => runWithAuditRollback({
      write: async () => ({ id: 7 }),
      logAudit: async () => false,
      rollback: async (written) => { rolledBack.push(written); },
      failureMessage: '監査ログが残らなかったため元に戻しました'
    }),
    new Error('監査ログが残らなかったため元に戻しました')
  );
  assert.deepStrictEqual(rolledBack, [{ id: 7 }]);
});

test('runWithAuditRollback also rolls back when the audit step throws, and rethrows that error', async () => {
  let rolledBack = false;
  await assert.rejects(
    () => runWithAuditRollback({
      write: async () => 1,
      logAudit: async () => { throw new Error('db closed'); },
      rollback: async () => { rolledBack = true; },
      failureMessage: 'x'
    }),
    /db closed/
  );
  assert.strictEqual(rolledBack, true);
});

test('runWithAuditRollback does not roll back when the write itself fails (nothing was written)', async () => {
  let audited = false;
  let rolledBack = false;
  await assert.rejects(
    () => runWithAuditRollback({
      write: async () => { throw new Error('write failed'); },
      logAudit: async () => { audited = true; return true; },
      rollback: async () => { rolledBack = true; },
      failureMessage: 'x'
    }),
    /write failed/
  );
  assert.strictEqual(audited, false);
  assert.strictEqual(rolledBack, false);
});

test('runWithAuditRollback tells the user when the rollback itself failed too', async () => {
  await assert.rejects(
    () => runWithAuditRollback({
      write: async () => 1,
      logAudit: async () => false,
      rollback: async () => { throw new Error('rollback failed'); },
      failureMessage: '元のエラー'
    }),
    (error: unknown) => {
      assert.ok(error instanceof AuditLogFailedError);
      assert.strictEqual(error.message, `元のエラー${ROLLBACK_ALSO_FAILED_NOTE}`);
      assert.strictEqual(error.rollbackFailed, true);
      return true;
    }
  );
});

test('runWithAuditRollback throws an AuditLogFailedError that says the rollback worked when it did', async () => {
  await assert.rejects(
    () => runWithAuditRollback({ write: async () => 1, logAudit: async () => false, rollback: async () => {}, failureMessage: '戻しました' }),
    (error: unknown) => {
      assert.ok(error instanceof AuditLogFailedError);
      assert.strictEqual(error.message, '戻しました');
      assert.strictEqual(error.rollbackFailed, false);
      return true;
    }
  );
});

test('runWithAuditRollback passes the written result to the audit step, so the wording can use it', async () => {
  let seen: unknown;
  await runWithAuditRollback({
    write: async () => ({ deletedCount: 3 }),
    logAudit: async (written) => { seen = written; return true; },
    rollback: async () => {},
    failureMessage: 'x'
  });
  assert.deepStrictEqual(seen, { deletedCount: 3 });
});

test('runWithAuditRollback rethrows an audit step exception unchanged, even if the rollback also fails', async () => {
  const original = new Error('db closed');
  await assert.rejects(
    () => runWithAuditRollback({
      write: async () => 1,
      logAudit: async () => { throw original; },
      rollback: async () => { throw new Error('rollback failed'); },
      failureMessage: 'x'
    }),
    (error: unknown) => error === original
  );
});

test('recordAuditOrNotify stays quiet on success and notifies when the record was not written', async () => {
  const messages: string[] = [];
  const notify = (message: string) => { messages.push(message); };

  assert.strictEqual(await recordAuditOrNotify(async () => true, notify), true);
  assert.deepStrictEqual(messages, []);

  assert.strictEqual(await recordAuditOrNotify(async () => false, notify), false);
  assert.deepStrictEqual(messages, [AUDIT_NOT_RECORDED_NOTICE]);

  const throwing = async (): Promise<boolean> => { throw new Error('boom'); };
  assert.strictEqual(await recordAuditOrNotify(throwing, notify), false);
  assert.strictEqual(messages.length, 2, 'a throwing audit call is reported like a failed one');
});
