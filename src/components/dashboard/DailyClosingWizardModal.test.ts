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

test('runDailyClosingBackupAndAudit returns to step 1 and reports error when getDatabaseFn returns null', async () => {
  const admin = { userId: 'u_admin', name: '管理者A', role: 'admin' as const };
  const summary: ClosingCheckSummary = {
    todayVisitsCount: 4,
    uncompletedEmrCount: 2,
    unsentClaimCount: 0,
    canProceed: true,
  };
  const steps: Array<1 | 2 | 3> = [];
  const errors: string[] = [];
  const processing: boolean[] = [];
  let encryptCalled = false;
  let saveCalled = false;

  await runDailyClosingBackupAndAudit({
    operator: admin,
    password: 'password123',
    checkSummary: summary,
    setStep: (s) => steps.push(s),
    setIsProcessing: (p) => processing.push(p),
    setSaveStatus: () => {},
    toastError: (msg) => errors.push(msg),
    getDatabaseFn: async () => null,
    encryptBackupPayloadFn: (() => {
      encryptCalled = true;
      return {} as any;
    }) as any,
    saveBackupToDirectoryFn: (async () => {
      saveCalled = true;
      return {} as any;
    }) as any,
  });

  assert.deepStrictEqual(steps, [2, 1]);
  assert.deepStrictEqual(errors, ['データベースに接続できませんでした。']);
  assert.strictEqual(encryptCalled, false);
  assert.strictEqual(saveCalled, false);
  assert.strictEqual(processing[processing.length - 1], false);
});

test('runDailyClosingBackupAndAudit returns to step 1 and resets processing when buildDatabaseBackupFn throws', async () => {
  const admin = { userId: 'u_admin', name: '管理者A', role: 'admin' as const };
  const summary: ClosingCheckSummary = {
    todayVisitsCount: 4,
    uncompletedEmrCount: 2,
    unsentClaimCount: 0,
    canProceed: true,
  };
  const steps: Array<1 | 2 | 3> = [];
  const errors: string[] = [];
  const processing: boolean[] = [];
  let saveCalled = false;

  await runDailyClosingBackupAndAudit({
    operator: admin,
    password: 'password123',
    checkSummary: summary,
    setStep: (s) => steps.push(s),
    setIsProcessing: (p) => processing.push(p),
    setSaveStatus: () => {},
    toastError: (msg) => errors.push(msg),
    getDatabaseFn: async () => ({}),
    buildDatabaseBackupFn: (async () => {
      throw new Error('backup build failed');
    }) as any,
    saveBackupToDirectoryFn: (async () => {
      saveCalled = true;
      return {} as any;
    }) as any,
  });

  assert.deepStrictEqual(steps, [2, 1]);
  assert.deepStrictEqual(errors, ['日次締めの実行中にエラーが発生しました: backup build failed']);
  assert.strictEqual(saveCalled, false);
  assert.strictEqual(processing[processing.length - 1], false);
});

test('runDailyClosingBackupAndAudit returns to step 1 and avoids audit log when saveBackupToDirectoryFn throws', async () => {
  const admin = { userId: 'u_admin', name: '管理者A', role: 'admin' as const };
  const summary: ClosingCheckSummary = {
    todayVisitsCount: 4,
    uncompletedEmrCount: 2,
    unsentClaimCount: 0,
    canProceed: true,
  };
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
  const steps: Array<1 | 2 | 3> = [];
  const errors: string[] = [];
  const processing: boolean[] = [];
  let auditCalled = false;

  await runDailyClosingBackupAndAudit({
    operator: admin,
    password: 'password123',
    checkSummary: summary,
    setStep: (s) => steps.push(s),
    setIsProcessing: (p) => processing.push(p),
    setSaveStatus: () => {},
    toastError: (msg) => errors.push(msg),
    getDatabaseFn: async () => ({}),
    buildDatabaseBackupFn: async () => fakeBackup,
    encryptBackupPayloadFn: () => fakeEncrypted,
    makeBackupFileNameFn: () => 'backup.enc.json',
    saveBackupToDirectoryFn: async () => {
      throw new Error('disk write failed');
    },
    logAuditActionFn: async () => {
      auditCalled = true;
      return true;
    },
  });

  assert.deepStrictEqual(steps, [2, 1]);
  assert.deepStrictEqual(errors, ['日次締めの実行中にエラーが発生しました: disk write failed']);
  assert.strictEqual(auditCalled, false);
  assert.strictEqual(processing[processing.length - 1], false);
});

test('runDailyClosingBackupAndAudit advances to step 3 and records audit details with checkSummary counts on success', async () => {
  const admin = { userId: 'u_admin', name: '管理者A', role: 'admin' as const };
  const summary: ClosingCheckSummary = {
    todayVisitsCount: 4,
    uncompletedEmrCount: 2,
    unsentClaimCount: 0,
    canProceed: true,
  };
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
  const steps: Array<1 | 2 | 3> = [];
  const successes: string[] = [];
  const errors: string[] = [];
  const processing: boolean[] = [];
  const auditCalls: Array<{ action: string; details: string }> = [];

  await runDailyClosingBackupAndAudit({
    operator: admin,
    password: 'password123',
    checkSummary: summary,
    setStep: (s) => steps.push(s),
    setIsProcessing: (p) => processing.push(p),
    setSaveStatus: () => {},
    toastError: (msg) => errors.push(msg),
    toastSuccess: (msg) => successes.push(msg),
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
    logAuditActionFn: async (_db, action, details) => {
      auditCalls.push({ action, details });
      return true;
    },
  });

  assert.deepStrictEqual(steps, [2, 3]);
  assert.deepStrictEqual(successes, [
    '日次締め・暗号化バックアップ外部保存を記録しました (NAS_Backups/backup.enc.json)',
  ]);
  assert.strictEqual(errors.length, 0);
  assert.strictEqual(processing[processing.length - 1], false);
  assert.strictEqual(auditCalls.length, 1);
  assert.strictEqual(auditCalls[0].action, 'backup_export');
  assert.ok(auditCalls[0].details.includes('backup.enc.json'));
  assert.ok(auditCalls[0].details.includes('NAS_Backups/backup.enc.json'));
  assert.ok(auditCalls[0].details.includes('受付件数 4件'));
  assert.ok(auditCalls[0].details.includes('未完了薬歴 2件'));
});

test('runDailyClosingBackupAndAudit records audit details with 0 counts when checkSummary is null on success', async () => {
  const admin = { userId: 'u_admin', name: '管理者A', role: 'admin' as const };
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
  const steps: Array<1 | 2 | 3> = [];
  const successes: string[] = [];
  const errors: string[] = [];
  const processing: boolean[] = [];
  const auditCalls: Array<{ action: string; details: string }> = [];

  await runDailyClosingBackupAndAudit({
    operator: admin,
    password: 'password123',
    checkSummary: null,
    setStep: (s) => steps.push(s),
    setIsProcessing: (p) => processing.push(p),
    setSaveStatus: () => {},
    toastError: (msg) => errors.push(msg),
    toastSuccess: (msg) => successes.push(msg),
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
    logAuditActionFn: async (_db, action, details) => {
      auditCalls.push({ action, details });
      return true;
    },
  });

  assert.deepStrictEqual(steps, [2, 3]);
  assert.deepStrictEqual(successes, [
    '日次締め・暗号化バックアップ外部保存を記録しました (NAS_Backups/backup.enc.json)',
  ]);
  assert.strictEqual(errors.length, 0);
  assert.strictEqual(processing[processing.length - 1], false);
  assert.strictEqual(auditCalls.length, 1);
  assert.strictEqual(auditCalls[0].action, 'backup_export');
  assert.ok(auditCalls[0].details.includes('受付件数 0件'));
  assert.ok(auditCalls[0].details.includes('未完了薬歴 0件'));
});

test('runDailyClosingBackupAndAudit rejects operator with clerk role without advancing steps or querying database', async () => {
  const clerk = { userId: 'u_clerk', name: '事務員A', role: 'clerk' as const };
  const summary: ClosingCheckSummary = {
    todayVisitsCount: 4,
    uncompletedEmrCount: 2,
    unsentClaimCount: 0,
    canProceed: true,
  };
  const steps: Array<1 | 2 | 3> = [];
  const errors: string[] = [];
  let getDatabaseCalled = false;

  await runDailyClosingBackupAndAudit({
    operator: clerk,
    password: 'password123',
    checkSummary: summary,
    setStep: (s) => steps.push(s),
    setIsProcessing: () => {},
    setSaveStatus: () => {},
    toastError: (msg) => errors.push(msg),
    getDatabaseFn: async () => {
      getDatabaseCalled = true;
      return null;
    },
  });

  assert.deepStrictEqual(steps, []);
  assert.deepStrictEqual(errors, [
    '事務員A（事務）には「バックアップ/復旧」の権限がありません。必要に応じて薬剤師または管理者に切り替えてください。',
  ]);
  assert.strictEqual(getDatabaseCalled, false);
});

test('runDailyClosingBackupAndAudit trims encryption password, writes formatted encrypted JSON payload without plaintext marker, and toggles isProcessing', async () => {
  const admin = { userId: 'u_admin', name: '管理者A', role: 'admin' as const };
  const summary: ClosingCheckSummary = {
    todayVisitsCount: 1,
    uncompletedEmrCount: 0,
    unsentClaimCount: 0,
    canProceed: true,
  };
  const plainBackupPayload = {
    app: 'yakureki' as const,
    formatVersion: 1 as const,
    createdAt: '2026-10-19T00:00:00Z',
    collections: {
      patients: [{ id: 'pt_secret', marker: 'SECRET-PLAINTEXT-MARKER' }],
    },
  };
  const fakeEncryptedPayload = {
    app: 'yakureki' as const,
    formatVersion: 1 as const,
    encrypted: true as const,
    ciphertext: 'AES_ENCRYPTED_DATA_ABC123',
    createdAt: '2026-10-19T00:00:00Z',
  };

  let recordedEncryptPayload: unknown = null;
  let recordedEncryptPassword = '';
  let recordedSaveFileName = '';
  let recordedSaveContent = '';
  const processingCalls: boolean[] = [];
  const steps: Array<1 | 2 | 3> = [];
  const errors: string[] = [];
  const successes: string[] = [];

  await runDailyClosingBackupAndAudit({
    operator: admin,
    password: '  secure-password-1234  ',
    checkSummary: summary,
    setStep: (s) => steps.push(s),
    setIsProcessing: (p) => processingCalls.push(p),
    setSaveStatus: () => {},
    toastError: (msg) => errors.push(msg),
    toastSuccess: (msg) => successes.push(msg),
    getDatabaseFn: async () => ({}),
    buildDatabaseBackupFn: async () => plainBackupPayload,
    encryptBackupPayloadFn: (payload, pass) => {
      recordedEncryptPayload = payload;
      recordedEncryptPassword = pass;
      return fakeEncryptedPayload;
    },
    makeBackupFileNameFn: () => 'closing-2026-10-19.enc.json',
    saveBackupToDirectoryFn: async (fileName, content) => {
      recordedSaveFileName = fileName;
      recordedSaveContent = content;
      return {
        success: true,
        fileName,
        pathOrName: 'NAS_Backups/closing-2026-10-19.enc.json',
        sha256Matched: true,
      };
    },
    logAuditActionFn: async () => true,
  });

  assert.strictEqual(recordedEncryptPayload, plainBackupPayload);
  assert.strictEqual(recordedEncryptPassword, 'secure-password-1234');
  assert.strictEqual(recordedSaveFileName, 'closing-2026-10-19.enc.json');
  assert.strictEqual(recordedSaveContent, JSON.stringify(fakeEncryptedPayload, null, 2));
  assert.ok(!recordedSaveContent.includes('SECRET-PLAINTEXT-MARKER'));
  assert.strictEqual(processingCalls[0], true);
  assert.strictEqual(processingCalls[processingCalls.length - 1], false);
  assert.deepStrictEqual(steps, [2, 3]);
  assert.strictEqual(errors.length, 0);
  assert.strictEqual(successes.length, 1);
});

test('runDailyClosingBackupAndAudit includes distinct fileName and distinct pathOrName with labels in audit log details', async () => {
  const admin = { userId: 'u_admin', name: '管理者A', role: 'admin' as const };
  const summary: ClosingCheckSummary = {
    todayVisitsCount: 5,
    uncompletedEmrCount: 1,
    unsentClaimCount: 0,
    canProceed: true,
  };
  const auditCalls: Array<{ action: string; details: string }> = [];

  await runDailyClosingBackupAndAudit({
    operator: admin,
    password: 'password123',
    checkSummary: summary,
    setStep: () => {},
    setIsProcessing: () => {},
    setSaveStatus: () => {},
    getDatabaseFn: async () => ({}),
    buildDatabaseBackupFn: async () => ({
      app: 'yakureki' as const,
      formatVersion: 1 as const,
      createdAt: '2026-10-18T00:00:00Z',
      collections: {},
    }),
    encryptBackupPayloadFn: () => ({
      app: 'yakureki' as const,
      formatVersion: 1 as const,
      encrypted: true as const,
      ciphertext: 'ciphertext_xyz',
      createdAt: '2026-10-18T00:00:00Z',
    }),
    makeBackupFileNameFn: () => 'closing-2026-10-18.enc.json',
    saveBackupToDirectoryFn: async () => ({
      success: true,
      fileName: 'closing-2026-10-18.enc.json',
      pathOrName: 'NAS_Backups/other/saved.enc.json',
      sha256Matched: true,
    }),
    logAuditActionFn: async (_db, action, details) => {
      auditCalls.push({ action, details });
      return true;
    },
  });

  assert.strictEqual(auditCalls.length, 1);
  assert.strictEqual(auditCalls[0].action, 'backup_export');
  assert.ok(auditCalls[0].details.includes('ファイル名 closing-2026-10-18.enc.json'));
  assert.ok(auditCalls[0].details.includes('保存先 NAS_Backups/other/saved.enc.json'));
});

test('runDailyClosingBackupAndAudit uses fallback error message when saveBackupToDirectoryFn fails without errorMessage or with empty errorMessage', async () => {
  const admin = { userId: 'u_admin', name: '管理者A', role: 'admin' as const };
  const summary: ClosingCheckSummary = {
    todayVisitsCount: 2,
    uncompletedEmrCount: 1,
    unsentClaimCount: 0,
    canProceed: true,
  };

  const testCases: Array<{
    name: string;
    failureResult: {
      success: false;
      fileName: string;
      pathOrName: string;
      sha256Matched: boolean;
      errorMessage?: string;
    };
  }> = [
    {
      name: 'errorMessage undefined',
      failureResult: {
        success: false,
        fileName: 'backup.enc.json',
        pathOrName: '',
        sha256Matched: false,
      },
    },
    {
      name: 'errorMessage empty string',
      failureResult: {
        success: false,
        fileName: 'backup.enc.json',
        pathOrName: '',
        sha256Matched: false,
        errorMessage: '',
      },
    },
  ];

  for (const tc of testCases) {
    const steps: Array<1 | 2 | 3> = [];
    const errors: string[] = [];
    let auditCalled = false;

    await runDailyClosingBackupAndAudit({
      operator: admin,
      password: 'password123',
      checkSummary: summary,
      setStep: (s) => steps.push(s),
      setIsProcessing: () => {},
      setSaveStatus: () => {},
      toastError: (msg) => errors.push(msg),
      getDatabaseFn: async () => ({}),
      buildDatabaseBackupFn: async () => ({
        app: 'yakureki' as const,
        formatVersion: 1 as const,
        createdAt: '2026-10-18T00:00:00Z',
        collections: {},
      }),
      encryptBackupPayloadFn: () => ({
        app: 'yakureki' as const,
        formatVersion: 1 as const,
        encrypted: true as const,
        ciphertext: 'ciphertext_xyz',
        createdAt: '2026-10-18T00:00:00Z',
      }),
      makeBackupFileNameFn: () => 'backup.enc.json',
      saveBackupToDirectoryFn: async () => tc.failureResult,
      logAuditActionFn: async () => {
        auditCalled = true;
        return true;
      },
    });

    assert.deepStrictEqual(steps, [2, 1], `steps mismatch for ${tc.name}`);
    assert.deepStrictEqual(
      errors,
      ['外部保存に失敗しました。締め処理を中止します。'],
      `errors mismatch for ${tc.name}`
    );
    assert.strictEqual(auditCalled, false, `audit should not be called for ${tc.name}`);
  }
});


