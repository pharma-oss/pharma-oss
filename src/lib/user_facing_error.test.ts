import { test } from 'node:test';
import assert from 'node:assert';
import {
  extractErrorMessage,
  stripRxdbErrorParameters,
  userFacingErrorMessage
} from './user_facing_error.ts';
import { AuditLogFailedError } from './audit_guard.ts';

const FALLBACK = '保存に失敗しました';
const FAKE_HASH = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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

test('userFacingErrorMessage replaces RxDB errors containing Japanese patient data in Parameters with fallback', () => {
  const rxdbVd2WithJapanesePatient = new Error([
    'RxError (VD2):',
    'document does not match schema',
    'Error code: VD2',
    '--------------------',
    'Parameters:',
    'document: {"patientId":"P001","name":"山田 太郎","birthDate":"1980-05-12","address":"東京都渋谷区"}'
  ].join('\n'));

  const result = userFacingErrorMessage(rxdbVd2WithJapanesePatient, FALLBACK);
  assert.strictEqual(result, FALLBACK);
  assert.strictEqual(result.includes('山田 太郎'), false);
  assert.strictEqual(result.includes('Parameters:'), false);
});

test('extractErrorMessage safely extracts non-empty Error or object messages', () => {
  assert.strictEqual(extractErrorMessage(new Error('boom')), 'boom');
  assert.strictEqual(extractErrorMessage(new Error('')), undefined);
  assert.strictEqual(extractErrorMessage({ message: 'failed' }), 'failed');
  assert.strictEqual(extractErrorMessage({ message: 123 }), undefined);
  assert.strictEqual(extractErrorMessage('plain string'), undefined);
  assert.strictEqual(extractErrorMessage(null), undefined);
});

test('extractErrorMessage strips RxDB Parameters blocks (patient PII and password hashes) and long hex tokens', () => {
  const rxdbConflict = new Error([
    'RxError (CONFLICT):',
    'Document update conflict',
    '--------------------',
    'Parameters:',
    'writeRow: {"patientId":"P002","name":"佐藤 花子","phone":"090-1234-5678"}'
  ].join('\n'));
  const conflictMessage = extractErrorMessage(rxdbConflict);
  assert.strictEqual(conflictMessage, 'RxError (CONFLICT):\nDocument update conflict');
  assert.strictEqual(conflictMessage?.includes('佐藤 花子'), false);
  assert.strictEqual(conflictMessage?.includes('Parameters:'), false);

  const rxdbDb1Object = {
    message: `Error code: DB1\nParameters:\npasswordHash: "${FAKE_HASH}"`
  };
  const db1Message = extractErrorMessage(rxdbDb1Object);
  assert.strictEqual(db1Message, 'Error code: DB1');
  assert.strictEqual(db1Message?.includes(FAKE_HASH), false);

  const hexLeak = extractErrorMessage(new Error(`Key mismatch: ${FAKE_HASH}`));
  assert.strictEqual(hexLeak, 'Key mismatch: [省略]');

  const parametersOnly = extractErrorMessage(new Error(`--------------------\nParameters:\npasswordHash: "${FAKE_HASH}"`));
  assert.strictEqual(parametersOnly, undefined);
});

test('stripRxdbErrorParameters removes Parameters block while preserving Japanese message prefix', () => {
  const japaneseWithParams = `保存に失敗しました。\n--------------------\nParameters:\ndocument: {"name":"鈴木 一郎"}`;
  assert.strictEqual(stripRxdbErrorParameters(japaneseWithParams), '保存に失敗しました。');
});
