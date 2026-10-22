import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DbKeyStorageUnavailableError,
  LOCAL_DB_PASSWORD_KEY,
  getOrCreateLocalDbPassword,
  resolveDbPassword,
  getDatabaseErrorCardViewState,
  DB_KEY_STORAGE_UNAVAILABLE_DESCRIPTION,
  DB_DEFAULT_ERROR_DESCRIPTION,
  type StorageLike
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

  describe('getDatabaseErrorCardViewState', () => {
    it('returns target action guidance for DbKeyStorageUnavailableError instance', () => {
      const err = new DbKeyStorageUnavailableError();
      const state = getDatabaseErrorCardViewState(err);

      assert.strictEqual(state.title, 'ローカルデータベースを開けません');
      assert.strictEqual(state.description, DB_KEY_STORAGE_UNAVAILABLE_DESCRIPTION);
      assert.ok(state.description.includes('プライベートブラウズを終了'));
      assert.strictEqual(state.errorMessage, err.message);
    });

    it('returns default protection description for generic errors', () => {
      const genericErr = new Error('RxError (DB1): Password mismatch');
      const state = getDatabaseErrorCardViewState(genericErr);

      assert.strictEqual(state.title, 'ローカルデータベースを開けません');
      assert.strictEqual(state.description, DB_DEFAULT_ERROR_DESCRIPTION);
      assert.ok(state.description.includes('患者データ保護のため'));
      assert.strictEqual(state.errorMessage, 'RxError (DB1): Password mismatch');
    });
  });
});
