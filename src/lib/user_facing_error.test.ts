import { test } from 'node:test';
import assert from 'node:assert';
import { userFacingErrorMessage } from './user_facing_error.ts';
import { AuditLogFailedError } from './audit_guard.ts';

const FALLBACK = '保存に失敗しました';

test('a message written for the user is shown as it is', () => {
  assert.strictEqual(userFacingErrorMessage(new Error('疑義照会記録の監査ログ記録に失敗したため、記録を元に戻しました。'), FALLBACK), '疑義照会記録の監査ログ記録に失敗したため、記録を元に戻しました。');
  assert.strictEqual(userFacingErrorMessage(new AuditLogFailedError('請求状態変更の監査ログ記録に失敗したため、変更を取り消しました。'), FALLBACK), '請求状態変更の監査ログ記録に失敗したため、変更を取り消しました。');
  assert.strictEqual(userFacingErrorMessage(new Error('カタカナだけ: ロールバック'), FALLBACK), 'カタカナだけ: ロールバック');
});

test('internal errors (English, codes) and non-errors are replaced by the fallback', () => {
  assert.strictEqual(userFacingErrorMessage(new Error('RxError (CONFLICT)'), FALLBACK), FALLBACK);
  assert.strictEqual(userFacingErrorMessage(new Error('Given document data could not be structured cloned'), FALLBACK), FALLBACK);
  assert.strictEqual(userFacingErrorMessage('文字列のエラー', FALLBACK), FALLBACK);
  assert.strictEqual(userFacingErrorMessage(undefined, FALLBACK), FALLBACK);
  assert.strictEqual(userFacingErrorMessage(new Error(''), FALLBACK), FALLBACK);
});
