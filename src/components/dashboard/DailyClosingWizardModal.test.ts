import assert from 'node:assert/strict';
import { describe, it, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  listDisabledOpeningTags,
  findOpeningTag,
  stripStyleBlocks,
} from '@/lib/test_support/html_disabled_tags';
import { renderMarkupWithReactUseStateMock } from '@/lib/test_support/react_use_state_mock';
import {
  BACKUP_PASSWORD_TOO_SHORT_MESSAGE,
  CLOSING_CHECK_FAILED_CONFIRM_MESSAGE,
  canProceedWithClosing,
  getClosingCheckDisplayState,
  runDailyClosingBackupAndAudit,
  validateDailyClosingSubmission,
  DailyClosingWizardModal,
  buildTodaySoapRecordsQuery,
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

interface DailyClosingWizardModalMockState {
  step?: 1 | 2 | 3;
  isProcessing?: boolean;
  saveStatus?: string;
  password?: string;
  checkSummary?: ClosingCheckSummary | null;
  isChecking?: boolean;
  hasCheckError?: boolean;
  permissionError?: string | null;
}

function renderDailyClosingWizardModal(
  props: { isOpen: boolean; onClose?: () => void; onComplete?: () => void },
  stateOverrides?: DailyClosingWizardModalMockState
): string {
  const expectedInitials: Record<number, unknown> = {
    0: 1, // step
    1: false, // isProcessing
    2: '', // saveStatus
    3: '', // password
    4: null, // checkSummary
    5: true, // isChecking
    6: false, // hasCheckError
    7: null, // permissionError
  };

  return renderMarkupWithReactUseStateMock(
    () =>
      React.createElement(DailyClosingWizardModal, {
        isOpen: props.isOpen,
        onClose: props.onClose ?? (() => {}),
        onComplete: props.onComplete ?? (() => {}),
      }),
    {
      componentName: 'DailyClosingWizardModal',
      restoreAtCallIndex: 7,
      expectedCalls: 8,
      onUseState: ({ callIndex, initialState }) => {
        const expectedInit = expectedInitials[callIndex];
        assert.strictEqual(
          initialState,
          expectedInit,
          `Expected DailyClosingWizardModal useState call #${callIndex} initial value to be ${String(expectedInit)}, got ${String(initialState)}`
        );

        let value = initialState;
        if (stateOverrides) {
          if (callIndex === 0 && stateOverrides.step !== undefined) value = stateOverrides.step;
          if (callIndex === 1 && stateOverrides.isProcessing !== undefined) value = stateOverrides.isProcessing;
          if (callIndex === 2 && stateOverrides.saveStatus !== undefined) value = stateOverrides.saveStatus;
          if (callIndex === 3 && stateOverrides.password !== undefined) value = stateOverrides.password;
          if (callIndex === 4 && stateOverrides.checkSummary !== undefined) value = stateOverrides.checkSummary;
          if (callIndex === 5 && stateOverrides.isChecking !== undefined) value = stateOverrides.isChecking;
          if (callIndex === 6 && stateOverrides.hasCheckError !== undefined) value = stateOverrides.hasCheckError;
          if (callIndex === 7 && stateOverrides.permissionError !== undefined) value = stateOverrides.permissionError;
        }

        return [value, () => {}];
      }
    }
  );
}

describe('DailyClosingWizardModal UI rendering and button disabled states', () => {
  it('renders null when isOpen is false', () => {
    const html = renderDailyClosingWizardModal({ isOpen: false });
    assert.strictEqual(html, '');
  });

  it('renders default pre-checking state (isChecking=true, isProcessing=false) with submit button disabled and cancel enabled', () => {
    const html = renderDailyClosingWizardModal({ isOpen: true });

    assert.ok(html.includes('日次締め・閉局ウィザード'), 'Header title must be rendered');
    assert.ok(html.includes('データベースを計測中…'), 'Pre-checking status must be displayed');

    const disabledTags = listDisabledOpeningTags(html);
    assert.strictEqual(
      disabledTags.length,
      1,
      `During pre-checking, exactly 1 button must be disabled, got ${disabledTags.length}:\n${disabledTags.join('\n')}`
    );

    const cancelBtnTag = findOpeningTag(html, 'キャンセル', 'button');
    assert.ok(
      !cancelBtnTag.includes('disabled=""'),
      `Cancel button must be enabled during pre-checking: ${cancelBtnTag}`
    );

    const submitBtnTag = findOpeningTag(html, '暗号化バックアップ', 'button');
    assert.ok(
      submitBtnTag.includes('disabled=""'),
      `Submit button must be disabled during pre-checking (isChecking=true): ${submitBtnTag}`
    );
  });

  it('renders ready state (isChecking=false, isProcessing=false) with all action buttons enabled', () => {
    const summary: ClosingCheckSummary = {
      todayVisitsCount: 15,
      uncompletedEmrCount: 0,
      unsentClaimCount: 0,
      canProceed: true,
    };
    const html = renderDailyClosingWizardModal(
      { isOpen: true },
      { isChecking: false, checkSummary: summary }
    );

    assert.ok(html.includes('本日受付件数: <strong>15</strong> 件'), 'Today visits count must be rendered');
    assert.ok(html.includes('薬歴未完了件数: <strong>0</strong> 件'), 'Uncompleted EMR count must be rendered');

    const disabledTags = listDisabledOpeningTags(html);
    assert.strictEqual(
      disabledTags.length,
      0,
      `When ready, exactly 0 disabled buttons should be present, got ${disabledTags.length}:\n${disabledTags.join('\n')}`
    );

    const cancelBtnTag = findOpeningTag(html, 'キャンセル', 'button');
    assert.ok(!cancelBtnTag.includes('disabled=""'), `Cancel button must be enabled: ${cancelBtnTag}`);

    const submitBtnTag = findOpeningTag(html, '暗号化バックアップ', 'button');
    assert.ok(!submitBtnTag.includes('disabled=""'), `Submit button must be enabled: ${submitBtnTag}`);

    const cleanMarkup = stripStyleBlocks(html);
    assert.strictEqual(
      cleanMarkup.match(/\bicon-warning\b/g)?.length ?? 0,
      0,
      'Zero icon-warning elements must be rendered in DOM when uncompletedEmrCount is 0'
    );
    assert.strictEqual(
      cleanMarkup.match(/\bicon-success\b/g)?.length ?? 0,
      2,
      'Exactly 2 icon-success elements must be rendered in DOM when uncompletedEmrCount is 0'
    );
  });

  it('renders processing state (isChecking=false, isProcessing=true) with header close, cancel, and submit disabled', () => {
    const summary: ClosingCheckSummary = {
      todayVisitsCount: 10,
      uncompletedEmrCount: 0,
      unsentClaimCount: 0,
      canProceed: true,
    };
    const html = renderDailyClosingWizardModal(
      { isOpen: true },
      { isChecking: false, isProcessing: true, checkSummary: summary }
    );

    const disabledTags = listDisabledOpeningTags(html);
    assert.strictEqual(
      disabledTags.length,
      3,
      `When isProcessing is true, exactly 3 buttons must be disabled, got ${disabledTags.length}:\n${disabledTags.join('\n')}`
    );

    const headerCloseBtnTag = findOpeningTag(html, 'aria-label="閉じる"', 'button');
    assert.ok(
      headerCloseBtnTag.includes('disabled=""'),
      `Header close button must be disabled during processing: ${headerCloseBtnTag}`
    );

    const cancelBtnTag = findOpeningTag(html, 'キャンセル', 'button');
    assert.ok(
      cancelBtnTag.includes('disabled=""'),
      `Cancel button must be disabled during processing: ${cancelBtnTag}`
    );

    const submitBtnTag = findOpeningTag(html, '暗号化バックアップ', 'button');
    assert.ok(
      submitBtnTag.includes('disabled=""'),
      `Submit button must be disabled during processing: ${submitBtnTag}`
    );

    const idleHtml = renderDailyClosingWizardModal(
      { isOpen: true },
      { isChecking: false, isProcessing: false, checkSummary: summary }
    );
    const idleHeaderCloseBtnTag = findOpeningTag(idleHtml, 'aria-label="閉じる"', 'button');
    assert.ok(
      !idleHeaderCloseBtnTag.includes('disabled=""'),
      `Header close button must be enabled when isProcessing is false: ${idleHeaderCloseBtnTag}`
    );
  });

  it('pins mutual exclusion across isChecking and isProcessing states', () => {
    const summary: ClosingCheckSummary = {
      todayVisitsCount: 5,
      uncompletedEmrCount: 0,
      unsentClaimCount: 0,
      canProceed: true,
    };

    // Case A: isChecking=true, isProcessing=false -> submit is disabled, cancel is enabled
    const htmlA = renderDailyClosingWizardModal(
      { isOpen: true },
      { isChecking: true, isProcessing: false, checkSummary: summary }
    );
    const cancelTagA = findOpeningTag(htmlA, 'キャンセル', 'button');
    const submitTagA = findOpeningTag(htmlA, '暗号化バックアップ', 'button');
    assert.ok(!cancelTagA.includes('disabled=""'), `Case A cancel must be enabled: ${cancelTagA}`);
    assert.ok(submitTagA.includes('disabled=""'), `Case A submit must be disabled: ${submitTagA}`);

    // Case B: isChecking=false, isProcessing=true -> both submit and cancel are disabled
    const htmlB = renderDailyClosingWizardModal(
      { isOpen: true },
      { isChecking: false, isProcessing: true, checkSummary: summary }
    );
    const cancelTagB = findOpeningTag(htmlB, 'キャンセル', 'button');
    const submitTagB = findOpeningTag(htmlB, '暗号化バックアップ', 'button');
    assert.ok(cancelTagB.includes('disabled=""'), `Case B cancel must be disabled: ${cancelTagB}`);
    assert.ok(submitTagB.includes('disabled=""'), `Case B submit must be disabled: ${submitTagB}`);

    // Case C: isChecking=true, isProcessing=true -> both submit and cancel are disabled
    const htmlC = renderDailyClosingWizardModal(
      { isOpen: true },
      { isChecking: true, isProcessing: true, checkSummary: summary }
    );
    const cancelTagC = findOpeningTag(htmlC, 'キャンセル', 'button');
    const submitTagC = findOpeningTag(htmlC, '暗号化バックアップ', 'button');
    assert.ok(cancelTagC.includes('disabled=""'), `Case C cancel must be disabled: ${cancelTagC}`);
    assert.ok(submitTagC.includes('disabled=""'), `Case C submit must be disabled: ${submitTagC}`);

    // Case D: isChecking=false, isProcessing=false -> neither is disabled
    const htmlD = renderDailyClosingWizardModal(
      { isOpen: true },
      { isChecking: false, isProcessing: false, checkSummary: summary }
    );
    const cancelTagD = findOpeningTag(htmlD, 'キャンセル', 'button');
    const submitTagD = findOpeningTag(htmlD, '暗号化バックアップ', 'button');
    assert.ok(!cancelTagD.includes('disabled=""'), `Case D cancel must be enabled: ${cancelTagD}`);
    assert.ok(!submitTagD.includes('disabled=""'), `Case D submit must be enabled: ${submitTagD}`);
  });

  it('renders pre-check error state (hasCheckError=true, isChecking=false) with submit button enabled and warning message', () => {
    const html = renderDailyClosingWizardModal(
      { isOpen: true },
      { isChecking: false, hasCheckError: true }
    );

    assert.ok(
      html.includes('事前点検に失敗したため、本日の受付件数および薬歴未完了件数を確認できませんでした。'),
      'Pre-check error message must be displayed'
    );

    const disabledTags = listDisabledOpeningTags(html);
    assert.strictEqual(
      disabledTags.length,
      0,
      `When pre-check fails but not processing, buttons should be enabled, got ${disabledTags.length}`
    );

    const cancelBtnTag = findOpeningTag(html, 'キャンセル', 'button');
    assert.ok(!cancelBtnTag.includes('disabled=""'), 'Cancel button must be enabled');

    const submitBtnTag = findOpeningTag(html, '暗号化バックアップ', 'button');
    assert.ok(!submitBtnTag.includes('disabled=""'), 'Submit button must be enabled even on pre-check error');
  });

  it('renders uncompleted EMR count warning when uncompletedEmrCount > 0', () => {
    const summary: ClosingCheckSummary = {
      todayVisitsCount: 10,
      uncompletedEmrCount: 4,
      unsentClaimCount: 0,
      canProceed: true,
    };
    const html = renderDailyClosingWizardModal(
      { isOpen: true },
      { isChecking: false, checkSummary: summary }
    );

    assert.ok(html.includes('薬歴未完了件数: <strong>4</strong> 件'), 'Uncompleted EMR count must be displayed');
    const cleanMarkup = stripStyleBlocks(html);
    assert.ok(cleanMarkup.includes('icon-warning'), 'Warning icon must be displayed for non-zero uncompleted EMR');
    assert.strictEqual(
      cleanMarkup.match(/\bicon-warning\b/g)?.length ?? 0,
      1,
      'Exactly 1 icon-warning element must be rendered in DOM when uncompletedEmrCount > 0'
    );
    assert.strictEqual(
      cleanMarkup.match(/\bicon-success\b/g)?.length ?? 0,
      1,
      'Exactly 1 icon-success element (reception count) must be rendered in DOM when uncompletedEmrCount > 0'
    );
  });

  it('renders permission error card when permissionError is present', () => {
    const html = renderDailyClosingWizardModal(
      { isOpen: true },
      { permissionError: 'バックアップおよび日次締めの実行権限がありません。' }
    );

    assert.ok(html.includes('権限エラー'), 'Permission error card must be displayed');
    assert.ok(html.includes('バックアップおよび日次締めの実行権限がありません。'), 'Permission error description must be displayed');

    const permCloseBtnTag = findOpeningTag(html, '>閉じる</button>', 'button');
    assert.ok(permCloseBtnTag.includes('btn-perm-close'), 'Permission close button must be rendered');
    assert.ok(!permCloseBtnTag.includes('disabled=""'), 'Permission close button must be enabled');

    const cleanMarkup = stripStyleBlocks(html);
    assert.ok(!cleanMarkup.includes('btn-closing-cancel'), 'Cancel button must not be rendered on permission error');
    assert.ok(!cleanMarkup.includes('btn-closing-submit'), 'Submit button must not be rendered on permission error');
  });

  it('renders step 2 executing screen with status message and file check icon', () => {
    const html = renderDailyClosingWizardModal(
      { isOpen: true },
      { step: 2, saveStatus: '暗号化バックアップデータを生成中…' }
    );

    const cleanMarkup = stripStyleBlocks(html);
    assert.ok(cleanMarkup.includes('closing-step2-box'), 'Step 2 box container element must be rendered in DOM');
    assert.ok(cleanMarkup.includes('closing-step2-icon'), 'File check icon must be rendered in step 2');
    assert.ok(cleanMarkup.includes('暗号化バックアップデータを生成中…'), 'Save status must be rendered');
    assert.ok(cleanMarkup.includes('暗号化処理および検証記録を実行中です…'), 'Processing description must be rendered');

    assert.ok(!cleanMarkup.includes('btn-closing-cancel'), 'Cancel button must not be rendered in step 2');
    assert.ok(!cleanMarkup.includes('btn-closing-submit'), 'Submit button must not be rendered in step 2');
  });

  it('renders step 3 completion screen with confirm button', () => {
    const html = renderDailyClosingWizardModal(
      { isOpen: true },
      { step: 3 }
    );

    const cleanMarkup = stripStyleBlocks(html);
    assert.ok(cleanMarkup.includes('closing-step3-box'), 'Step 3 box container element must be rendered in DOM');
    assert.ok(cleanMarkup.includes('closing-step3-icon'), 'Completion check icon must be rendered in step 3');
    assert.ok(cleanMarkup.includes('日次締め・暗号化外部保存が完了しました'), 'Completion title must be rendered');

    const confirmBtnTag = findOpeningTag(html, '確認して閉じる', 'button');
    assert.ok(confirmBtnTag.includes('btn-closing-confirm'), 'Confirm button must be rendered in step 3');
    assert.ok(!confirmBtnTag.includes('disabled=""'), 'Confirm button must be enabled in step 3');

    assert.ok(!cleanMarkup.includes('btn-closing-cancel'), 'Cancel button must not be rendered in step 3');
    assert.ok(!cleanMarkup.includes('btn-closing-submit'), 'Submit button must not be rendered in step 3');
  });

  it('restores useState dispatcher hook immediately so subsequent renders are not polluted', () => {
    const internals = (React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
        H?: { useState?: (init: unknown) => [unknown, (v: unknown) => void] }
      }
    }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

    let probeBefore: unknown = null;
    let probeAfter: unknown = null;

    function ProbeBefore(): React.ReactNode {
      probeBefore = internals?.H?.useState;
      return null;
    }
    function ProbeAfter(): React.ReactNode {
      probeAfter = internals?.H?.useState;
      return null;
    }

    renderToStaticMarkup(React.createElement(ProbeBefore));
    renderDailyClosingWizardModal({ isOpen: true }, { isChecking: false });
    renderToStaticMarkup(React.createElement(ProbeAfter));

    assert.ok(probeBefore !== null, 'ProbeBefore must capture initial useState hook');
    assert.strictEqual(
      probeAfter,
      probeBefore,
      'useState dispatcher must be completely restored to its original reference after render'
    );
  });

  it('buildTodaySoapRecordsQuery restricts SOAP fetch to today visitIds and skips empty queries (P2-2)', () => {
    assert.strictEqual(buildTodaySoapRecordsQuery([]), null);
    assert.deepStrictEqual(buildTodaySoapRecordsQuery(['v1', 'v2']), {
      selector: { visitId: { $in: ['v1', 'v2'] } }
    });
  });
});


