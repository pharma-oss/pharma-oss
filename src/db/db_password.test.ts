import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DbKeyStorageUnavailableError,
  LOCAL_DB_PASSWORD_KEY,
  getOrCreateLocalDbPassword,
  resolveDbPassword,
  resolveDbPasswordWithWindow,
  sanitizeDatabaseErrorMessage,
  getDatabaseErrorCardViewState,
  DB_KEY_STORAGE_UNAVAILABLE_DESCRIPTION,
  DB_DEFAULT_ERROR_DESCRIPTION,
  type StorageLike,
  type WindowLike
} from './db_password';

describe('db_password contracts', () => {
  describe('getOrCreateLocalDbPassword', () => {
    it('throws DbKeyStorageUnavailableError when storage.setItem throws an error', () => {
      const mockStorage: StorageLike = {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError: localStorage write denied');
        }
      };

      assert.throws(
        () => getOrCreateLocalDbPassword(mockStorage, () => 'gen_key_123'),
        (err: unknown) => {
          assert.ok(err instanceof DbKeyStorageUnavailableError);
          assert.strictEqual(err.code, 'DB_KEY_STORAGE_UNAVAILABLE');
          assert.ok(err.message.includes('プライベートブラウズを終了'));
          assert.ok(err.message.includes('localStorage'));
          return true;
        }
      );
    });

    it('throws DbKeyStorageUnavailableError when storage.getItem throws an error', () => {
      const mockStorage: StorageLike = {
        getItem: () => {
          throw new Error('SecurityError: localStorage access blocked');
        },
        setItem: () => {}
      };

      assert.throws(
        () => getOrCreateLocalDbPassword(mockStorage, () => 'gen_key_123'),
        (err: unknown) => {
          assert.ok(err instanceof DbKeyStorageUnavailableError);
          assert.strictEqual(err.code, 'DB_KEY_STORAGE_UNAVAILABLE');
          return true;
        }
      );
    });

    it('throws DbKeyStorageUnavailableError when storage is null or undefined', () => {
      assert.throws(
        () => getOrCreateLocalDbPassword(null),
        (err: unknown) => err instanceof DbKeyStorageUnavailableError
      );
      assert.throws(
        () => getOrCreateLocalDbPassword(undefined),
        (err: unknown) => err instanceof DbKeyStorageUnavailableError
      );
    });

    it('returns existing key when stored key exists and does not call setItem or generateKey', () => {
      let setCalled = false;
      let generateCalled = false;
      const mockStorage: StorageLike = {
        getItem: (k) => (k === LOCAL_DB_PASSWORD_KEY ? 'saved_secret_pass' : null),
        setItem: () => {
          setCalled = true;
        }
      };

      const key = getOrCreateLocalDbPassword(mockStorage, () => {
        generateCalled = true;
        return 'new_pass';
      });

      assert.strictEqual(key, 'saved_secret_pass');
      assert.strictEqual(setCalled, false);
      assert.strictEqual(generateCalled, false);
    });

    it('persists and returns newly generated key when no existing key was stored', () => {
      let storedKey = '';
      const mockStorage: StorageLike = {
        getItem: () => null,
        setItem: (k, v) => {
          if (k === LOCAL_DB_PASSWORD_KEY) storedKey = v;
        }
      };

      const key = getOrCreateLocalDbPassword(mockStorage, () => 'fresh_random_key');
      assert.strictEqual(key, 'fresh_random_key');
      assert.strictEqual(storedKey, 'fresh_random_key');
    });
  });

  describe('resolveDbPassword', () => {
    it('returns configured password without touching storage or throwing when configured', () => {
      const brokenStorage: StorageLike = {
        getItem: () => {
          throw new Error('Storage is completely broken');
        },
        setItem: () => {
          throw new Error('Storage is completely broken');
        }
      };

      const key = resolveDbPassword('env_configured_secret', brokenStorage);
      assert.strictEqual(key, 'env_configured_secret');
    });

    it('delegates to getOrCreateLocalDbPassword when configured password is unset and throws on storage failure', () => {
      const brokenStorage: StorageLike = {
        getItem: () => null,
        setItem: () => {
          throw new Error('Access denied in private mode');
        }
      };

      assert.throws(
        () => resolveDbPassword(undefined, brokenStorage),
        (err: unknown) => err instanceof DbKeyStorageUnavailableError
      );
      assert.throws(
        () => resolveDbPassword('', brokenStorage),
        (err: unknown) => err instanceof DbKeyStorageUnavailableError
      );
    });
  });

  describe('resolveDbPasswordWithWindow', () => {
    it('returns configured password without touching window.localStorage even when accessing it throws', () => {
      let getterCalled = false;
      const throwingWindow: WindowLike = {
        get localStorage(): StorageLike {
          getterCalled = true;
          throw new DOMException('Access is denied for this document.', 'SecurityError');
        }
      };

      const key = resolveDbPasswordWithWindow('configured-env-key-123', throwingWindow, () => 'gen-key');
      assert.strictEqual(key, 'configured-env-key-123');
      assert.strictEqual(getterCalled, false);
    });

    it('throws DbKeyStorageUnavailableError with cause name SecurityError when password unset and accessing localStorage throws', () => {
      const throwingWindow: WindowLike = {
        get localStorage(): StorageLike {
          throw new DOMException('Access is denied for this document.', 'SecurityError');
        }
      };

      assert.throws(
        () => resolveDbPasswordWithWindow(undefined, throwingWindow, () => 'gen-key'),
        (err: unknown) => {
          assert.ok(err instanceof DbKeyStorageUnavailableError);
          assert.strictEqual((err as DbKeyStorageUnavailableError).causeName, 'SecurityError');
          return true;
        }
      );
    });

    it('delegates to normal storage resolution when password unset and window has normal storage', () => {
      let storedKey: string | null = null;
      const mockStorage: StorageLike = {
        getItem: (k: string) => (k === LOCAL_DB_PASSWORD_KEY ? storedKey : null),
        setItem: (k: string, v: string) => {
          if (k === LOCAL_DB_PASSWORD_KEY) storedKey = v;
        }
      };
      const normalWindow: WindowLike = { localStorage: mockStorage };

      const key1 = resolveDbPasswordWithWindow(undefined, normalWindow, () => 'generated-test-key-abc');
      assert.strictEqual(key1, 'generated-test-key-abc');
      assert.strictEqual(storedKey, 'generated-test-key-abc');

      const key2 = resolveDbPasswordWithWindow(undefined, normalWindow, () => 'different-key');
      assert.strictEqual(key2, 'generated-test-key-abc');
    });

    it('throws DbKeyStorageUnavailableError when window is null and password unset', () => {
      assert.throws(
        () => resolveDbPasswordWithWindow(undefined, null, () => 'gen-key'),
        (err: unknown) => err instanceof DbKeyStorageUnavailableError
      );
    });
  });

  describe('getDatabaseErrorCardViewState', () => {
    it('extracts cause name when present and null when absent in DbKeyStorageUnavailableError', () => {
      const withName = new DbKeyStorageUnavailableError(new DOMException('quota', 'QuotaExceededError'));
      assert.strictEqual(withName.causeName, 'QuotaExceededError');

      const withGenericError = new DbKeyStorageUnavailableError(new Error('something'));
      assert.strictEqual(withGenericError.causeName, 'Error');

      const withoutCause = new DbKeyStorageUnavailableError();
      assert.strictEqual(withoutCause.causeName, null);

      const withNonObject = new DbKeyStorageUnavailableError('string-cause');
      assert.strictEqual(withNonObject.causeName, null);
    });

    it('returns target action guidance for DbKeyStorageUnavailableError instance', () => {
      const err = new DbKeyStorageUnavailableError();
      const state = getDatabaseErrorCardViewState(err);

      assert.strictEqual(state.title, 'ローカルデータベースを開けません');
      assert.strictEqual(state.description, DB_KEY_STORAGE_UNAVAILABLE_DESCRIPTION);
      assert.ok(state.description.includes('プライベートブラウズを終了'));
      assert.strictEqual(state.errorMessage, null);
    });

    it('returns formatted detail message when causeName is present and null when absent', () => {
      const withCause = new DbKeyStorageUnavailableError(new DOMException('quota', 'QuotaExceededError'));
      const stateWithCause = getDatabaseErrorCardViewState(withCause);
      assert.strictEqual(stateWithCause.errorLabel, '詳細');
      assert.strictEqual(stateWithCause.errorMessage, 'QuotaExceededError');

      const withoutCause = new DbKeyStorageUnavailableError();
      const stateWithoutCause = getDatabaseErrorCardViewState(withoutCause);
      assert.strictEqual(stateWithoutCause.errorMessage, null);
    });

    it('relies strictly on instanceof DbKeyStorageUnavailableError rather than name or string matching', () => {
      const fakeErrorObject = { name: 'DbKeyStorageUnavailableError', message: 'fake error' };
      const fakeState = getDatabaseErrorCardViewState(fakeErrorObject);
      assert.strictEqual(fakeState.description, DB_DEFAULT_ERROR_DESCRIPTION);
      assert.strictEqual(fakeState.errorMessage, '不明なエラー');

      const fakeString = 'DbKeyStorageUnavailableError occurred';
      const fakeStringState = getDatabaseErrorCardViewState(fakeString);
      assert.strictEqual(fakeStringState.description, DB_DEFAULT_ERROR_DESCRIPTION);
      assert.strictEqual(fakeStringState.errorMessage, fakeString);
    });

    it('returns default protection description for generic errors', () => {
      const genericErr = new Error('RxError (DB1): Password mismatch');
      const state = getDatabaseErrorCardViewState(genericErr);

      assert.strictEqual(state.title, 'ローカルデータベースを開けません');
      assert.strictEqual(state.description, DB_DEFAULT_ERROR_DESCRIPTION);
      assert.ok(state.description.includes('患者データ保護のため'));
      assert.strictEqual(state.errorMessage, 'RxError (DB1): Password mismatch');
    });

    it('sets errorLabel to 詳細 for DbKeyStorageUnavailableError with cause or without cause', () => {
      const withCause = new DbKeyStorageUnavailableError(new Error('fail'));
      const stateWithCause = getDatabaseErrorCardViewState(withCause);
      assert.strictEqual(stateWithCause.errorLabel, '詳細');
      assert.strictEqual(stateWithCause.errorMessage, 'Error');

      const withoutCause = new DbKeyStorageUnavailableError();
      const stateWithoutCause = getDatabaseErrorCardViewState(withoutCause);
      assert.strictEqual(stateWithoutCause.errorLabel, '詳細');
      assert.strictEqual(stateWithoutCause.errorMessage, null);
    });

    it('sets errorLabel to エラー for generic errors (Error, string, unknown value)', () => {
      const err = new Error('generic db crash');
      const stateErr = getDatabaseErrorCardViewState(err);
      assert.strictEqual(stateErr.errorLabel, 'エラー');
      assert.strictEqual(stateErr.errorMessage, 'generic db crash');

      const strErr = 'simple string error';
      const stateStr = getDatabaseErrorCardViewState(strErr);
      assert.strictEqual(stateStr.errorLabel, 'エラー');
      assert.strictEqual(stateStr.errorMessage, 'simple string error');

      const unknownErr = { code: 500 };
      const stateUnknown = getDatabaseErrorCardViewState(unknownErr);
      assert.strictEqual(stateUnknown.errorLabel, 'エラー');
      assert.strictEqual(stateUnknown.errorMessage, '不明なエラー');
    });

    it('preserves errorLabel as エラー when generic Error message starts with 詳細:', () => {
      const trickyErr = new Error('詳細: injected error message');
      const state = getDatabaseErrorCardViewState(trickyErr);
      assert.strictEqual(state.errorLabel, 'エラー');
      assert.strictEqual(state.errorMessage, '詳細: injected error message');
    });

    it('sanitizes Parameters and hashes when generic Error or string with Parameters is provided', () => {
      const fakeHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const rxdbMessage = `Error code: DB1\nFix: Align passwords\n--------------------\nParameters:\npasswordHash: "${fakeHash}"`;

      const stateFromError = getDatabaseErrorCardViewState(new Error(rxdbMessage));
      assert.strictEqual(stateFromError.errorLabel, 'エラー');
      assert.ok(stateFromError.errorMessage?.includes('Error code: DB1'));
      assert.strictEqual(stateFromError.errorMessage?.includes('Parameters'), false);
      assert.strictEqual(stateFromError.errorMessage?.includes(fakeHash), false);

      const stateFromString = getDatabaseErrorCardViewState(rxdbMessage);
      assert.strictEqual(stateFromString.errorLabel, 'エラー');
      assert.ok(stateFromString.errorMessage?.includes('Error code: DB1'));
      assert.strictEqual(stateFromString.errorMessage?.includes('Parameters'), false);
      assert.strictEqual(stateFromString.errorMessage?.includes(fakeHash), false);
    });
  });

  describe('sanitizeDatabaseErrorMessage', () => {
    const fakeHash1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const fakeHash2 = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

    it('strips hyphen line and Parameters block in RxDB 17.4.0 format while preserving body with Error code: DB1', () => {
      const rxdbMessage = `
Error message: RxDocument.prepare(): another instance on this adapter has a different password
Error code: DB1
Fix: Ensure that all instances use the same password.
--------------------
Parameters:
passwordHash: "${fakeHash1}"
existingPasswordHash: "${fakeHash2}"
`;
      const sanitized = sanitizeDatabaseErrorMessage(rxdbMessage);
      assert.ok(sanitized.includes('Error message: RxDocument.prepare()'));
      assert.ok(sanitized.includes('Error code: DB1'));
      assert.ok(sanitized.includes('Fix: Ensure that all instances use the same password.'));
      assert.strictEqual(sanitized.includes('--------------------'), false);
      assert.strictEqual(sanitized.includes('Parameters:'), false);
      assert.strictEqual(sanitized.includes('passwordHash'), false);
      assert.strictEqual(sanitized.includes('existingPasswordHash'), false);
      assert.strictEqual(sanitized.includes(fakeHash1), false);
      assert.strictEqual(sanitized.includes(fakeHash2), false);
    });

    it('preserves generic error messages without Parameters unchanged', () => {
      const plainMessage = 'RxError (DB1): Password mismatch without parameters';
      const sanitized = sanitizeDatabaseErrorMessage(plainMessage);
      assert.strictEqual(sanitized, plainMessage);
    });

    it('strips from Parameters line when hyphen line is absent and line begins with Parameters:', () => {
      const messageWithoutHyphens = `Generic database error
Parameters:
someKey: "someValue"
extraKey: 12345`;
      const sanitized = sanitizeDatabaseErrorMessage(messageWithoutHyphens);
      assert.strictEqual(sanitized, 'Generic database error');
      assert.strictEqual(sanitized.includes('Parameters:'), false);
      assert.strictEqual(sanitized.includes('someKey'), false);
    });

    it('replaces 64 or more hexadecimal characters outside Parameters with [省略]', () => {
      const messageWithHex = `Corrupted block at ${fakeHash1} in storage ${fakeHash2}aa`;
      const sanitized = sanitizeDatabaseErrorMessage(messageWithHex);
      assert.strictEqual(sanitized, 'Corrupted block at [省略] in storage [省略]');
      assert.strictEqual(sanitized.includes(fakeHash1), false);
      assert.strictEqual(sanitized.includes(fakeHash2), false);
    });

    it('returns 不明なエラー when message consists solely of Parameters block and becomes empty', () => {
      const paramsOnly = `--------------------\nParameters:\npasswordHash: "${fakeHash1}"`;
      const sanitized = sanitizeDatabaseErrorMessage(paramsOnly);
      assert.strictEqual(sanitized, '不明なエラー');

      const paramsOnlyNoHyphen = `Parameters:\nsomeKey: "val"`;
      assert.strictEqual(sanitizeDatabaseErrorMessage(paramsOnlyNoHyphen), '不明なエラー');

      const whitespaceOnly = '   \n\n\t  ';
      assert.strictEqual(sanitizeDatabaseErrorMessage(whitespaceOnly), '不明なエラー');
    });
  });
});

