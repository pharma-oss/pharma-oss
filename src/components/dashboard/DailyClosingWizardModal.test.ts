import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BACKUP_PASSWORD_TOO_SHORT_MESSAGE,
  CLOSING_CHECK_FAILED_CONFIRM_MESSAGE,
  canProceedWithClosing,
  getClosingCheckDisplayState,
  runDailyClosingBackupAndAudit,
  validateDailyClosingSubmission,
  type ClosingCheckSummary,
} from './DailyClosingWizardModal';

test('getClosingCheckDisplayState returns checking status when isChecking is true', () => {
  const summary: ClosingCheckSummary = {
    todayVisitsCount: 10,
    uncompletedEmrCount: 1,
    unsentClaimCount: 0,
    canProceed: true,
  };
  assert.deepStrictEqual(getClosingCheckDisplayState(true, false, null), {
    status: 'checking',
  });
  assert.deepStrictEqual(getClosingCheckDisplayState(true, true, summary), {
    status: 'checking',
  });
});

test('getClosingCheckDisplayState returns error status with clear message when pre-check fails', () => {
  const state = getClosingCheckDisplayState(false, true, null);
  assert.strictEqual(state.status, 'error');
  if (state.status === 'error') {
    assert.strictEqual(
      state.message,
      '事前点検に失敗したため、本日の受付件数および薬歴未完了件数を確認できませんでした。'
    );
  }
});

test('getClosingCheckDisplayState prioritizes error status even if stale checkSummary is passed', () => {
  const staleSummary: ClosingCheckSummary = {
    todayVisitsCount: 0,
    uncompletedEmrCount: 0,
    unsentClaimCount: 0,
    canProceed: true,
  };
  const state = getClosingCheckDisplayState(false, true, staleSummary);
  assert.strictEqual(state.status, 'error');
  if (state.status === 'error') {
    assert.strictEqual(
      state.message,
      '事前点検に失敗したため、本日の受付件数および薬歴未完了件数を確認できませんでした。'
    );
  }
});

test('getClosingCheckDisplayState returns error status if checkSummary is missing when not checking', () => {
  const state = getClosingCheckDisplayState(false, false, null);
  assert.strictEqual(state.status, 'error');
});

test('getClosingCheckDisplayState returns ready status with counts when check completed successfully', () => {
  const summary: ClosingCheckSummary = {
    todayVisitsCount: 42,
    uncompletedEmrCount: 3,
    unsentClaimCount: 0,
    canProceed: true,
  };
  const state = getClosingCheckDisplayState(false, false, summary);
  assert.deepStrictEqual(state, {
    status: 'ready',
    todayVisitsCount: 42,
    uncompletedEmrCount: 3,
  });
});

test('canProceedWithClosing asks the user to confirm when the pre-check failed', () => {
  const asked: string[] = [];
  const failed = getClosingCheckDisplayState(false, true, null);

  assert.strictEqual(canProceedWithClosing(failed, (message) => { asked.push(message); return false; }), false);
  assert.strictEqual(canProceedWithClosing(failed, (message) => { asked.push(message); return true; }), true);
  assert.deepStrictEqual(asked, [CLOSING_CHECK_FAILED_CONFIRM_MESSAGE, CLOSING_CHECK_FAILED_CONFIRM_MESSAGE]);
  assert.ok(CLOSING_CHECK_FAILED_CONFIRM_MESSAGE.includes('事前点検に失敗'));
});

test('canProceedWithClosing does not ask when the pre-check succeeded', () => {
  const summary: ClosingCheckSummary = {
    todayVisitsCount: 5,
    uncompletedEmrCount: 0,
    unsentClaimCount: 0,
    canProceed: true,
  };
  let asked = 0;
  const ready = getClosingCheckDisplayState(false, false, summary);

  assert.strictEqual(canProceedWithClosing(ready, () => { asked++; return false; }), true);
  assert.strictEqual(asked, 0);
});

test('canProceedWithClosing does not ask while the pre-check is still running', () => {
  let asked = 0;
  const checking = getClosingCheckDisplayState(true, false, null);

  assert.strictEqual(canProceedWithClosing(checking, () => { asked++; return false; }), true);
  assert.strictEqual(asked, 0);
});

test('validateDailyClosingSubmission rejects operator without manage_backups permission', () => {
  const clerk = { userId: 'u_clerk', name: '事務員A', role: 'clerk' as const };
  const result = validateDailyClosingSubmission(clerk, 'password123');
  assert.deepStrictEqual(result, {
    ok: false,
    errorMessage: '事務員A（事務）には「バックアップ/復旧」の権限がありません。必要に応じて薬剤師または管理者に切り替えてください。',
  });
});

test('validateDailyClosingSubmission rejects passwords shorter than 8 characters after trimming and accepts 8 or more', () => {
  const admin = { userId: 'u_admin', name: '管理者A', role: 'admin' as const };

  const sevenChars = validateDailyClosingSubmission(admin, '1234567');
  assert.deepStrictEqual(sevenChars, {
    ok: false,
    errorMessage: BACKUP_PASSWORD_TOO_SHORT_MESSAGE,
  });

  const paddedSevenChars = validateDailyClosingSubmission(admin, '  1234567  ');
  assert.deepStrictEqual(paddedSevenChars, {
    ok: false,
    errorMessage: BACKUP_PASSWORD_TOO_SHORT_MESSAGE,
  });

  const eightChars = validateDailyClosingSubmission(admin, '12345678');
  assert.deepStrictEqual(eightChars, {
    ok: true,
    backupPassword: '12345678',
  });

  const paddedEightChars = validateDailyClosingSubmission(admin, '  12345678  ');
  assert.deepStrictEqual(paddedEightChars, {
    ok: true,
    backupPassword: '12345678',
  });
});

test('runDailyClosingBackupAndAudit does not advance to step 2 when password validation fails and returns to step 1 when directory save or audit fails', async () => {
  const admin = { userId: 'u_admin', name: '管理者A', role: 'admin' as const };
  const summary: ClosingCheckSummary = {
    todayVisitsCount: 4,
    uncompletedEmrCount: 0,
    unsentClaimCount: 0,
    canProceed: true,
  };

  // 1) Short password: stays on step 1 (setStep is never called)
  const shortSteps: Array<1 | 2 | 3> = [];
  const shortErrors: string[] = [];
  await runDailyClosingBackupAndAudit({
    operator: admin,
    password: '1234567',
    checkSummary: summary,
    setStep: (s) => shortSteps.push(s),
    setIsProcessing: () => {},
    setSaveStatus: () => {},
    toastError: (msg) => shortErrors.push(msg),
  });
  assert.deepStrictEqual(shortSteps, []);
  assert.deepStrictEqual(shortErrors, [BACKUP_PASSWORD_TOO_SHORT_MESSAGE]);

  const fakeBackup = {
    app: 'yakureki' as const,
    formatVersion: 1 as const,
    createdAt: '2026-10-14T00:00:00Z',
    collections: {},
  };
  const fakeEncrypted = {
    app: 'yakureki' as const,
    formatVersion: 1 as const,
    encrypted: true as const,
    ciphertext: 'abc',
    createdAt: '2026-10-14T00:00:00Z',
  };

  // 2) Directory picker cancelled / external save failed: advances to step 2 then returns to step 1
  const pickerCancelSteps: Array<1 | 2 | 3> = [];
  const pickerCancelErrors: string[] = [];
  await runDailyClosingBackupAndAudit({
    operator: admin,
    password: 'password123',
    checkSummary: summary,
    setStep: (s) => pickerCancelSteps.push(s),
    setIsProcessing: () => {},
    setSaveStatus: () => {},
    toastError: (msg) => pickerCancelErrors.push(msg),
    getDatabaseFn: async () => ({}),
    buildDatabaseBackupFn: async () => fakeBackup,
    encryptBackupPayloadFn: () => fakeEncrypted,
    makeBackupFileNameFn: () => 'backup.enc.json',
    saveBackupToDirectoryFn: async () => ({
      success: false,
      fileName: 'backup.enc.json',
      pathOrName: '',
      sha256Matched: false,
      errorMessage: 'フォルダ選択がユーザーによってキャンセルされました。',
    }),
  });
  assert.deepStrictEqual(pickerCancelSteps, [2, 1]);
  assert.deepStrictEqual(pickerCancelErrors, ['フォルダ選択がユーザーによってキャンセルされました。']);

  // 3) Audit log failure: advances to step 2 then returns to step 1
  const auditFailSteps: Array<1 | 2 | 3> = [];
  const auditFailErrors: string[] = [];
  await runDailyClosingBackupAndAudit({
    operator: admin,
    password: 'password123',
    checkSummary: summary,
    setStep: (s) => auditFailSteps.push(s),
    setIsProcessing: () => {},
    setSaveStatus: () => {},
    toastError: (msg) => auditFailErrors.push(msg),
    getDatabaseFn: async () => ({}),
    buildDatabaseBackupFn: async () => fakeBackup,
    encryptBackupPayloadFn: () => fakeEncrypted,
    makeBackupFileNameFn: () => 'backup.enc.json',
    saveBackupToDirectoryFn: async () => ({
      success: true,
      fileName: 'backup.enc.json',
      pathOrName: 'NAS_Backups/backup.enc.json',
      sha256Matched: true,
    }),
    logAuditActionFn: async () => false,
  });
  assert.deepStrictEqual(auditFailSteps, [2, 1]);
  assert.deepStrictEqual(auditFailErrors, ['監査ログの記録に失敗したため、締め処理を完了できませんでした。']);
});
