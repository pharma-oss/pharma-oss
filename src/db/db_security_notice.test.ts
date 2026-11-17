import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  _resetDbSecurityNoticeForTesting,
  getDbSecurityNoticeFlags,
  recordLegacyDbKeyInUse,
  recordStoragePersistenceDenied,
  requestAndTrackStoragePersistence,
  resolveDbSecurityBannerState,
  subscribeDbSecurityNotice,
  type DbSecurityNoticeFlags
} from './db_security_notice';

describe('db_security_notice (P5-2)', () => {
  beforeEach(() => {
    _resetDbSecurityNoticeForTesting();
  });

  it('tracks storage persistence denial and legacy key usage and notifies subscribers immediately and on change', () => {
    const observed: DbSecurityNoticeFlags[] = [];
    const unsubscribe = subscribeDbSecurityNotice((flags) => {
      observed.push(flags);
    });

    assert.deepStrictEqual(observed, [{ storagePersistenceDenied: false, legacyKeyInUse: false }]);

    recordStoragePersistenceDenied();
    recordStoragePersistenceDenied(); // duplicate should not re-emit
    recordLegacyDbKeyInUse();

    assert.deepStrictEqual(observed, [
      { storagePersistenceDenied: false, legacyKeyInUse: false },
      { storagePersistenceDenied: true, legacyKeyInUse: false },
      { storagePersistenceDenied: true, legacyKeyInUse: true }
    ]);
    assert.deepStrictEqual(getDbSecurityNoticeFlags(), {
      storagePersistenceDenied: true,
      legacyKeyInUse: true
    });

    unsubscribe();
  });

  it('requestAndTrackStoragePersistence records denial when persist returns false or throws, and stays silent when granted', async () => {
    assert.equal(await requestAndTrackStoragePersistence(undefined), null);
    assert.equal(getDbSecurityNoticeFlags().storagePersistenceDenied, false);

    assert.equal(await requestAndTrackStoragePersistence({ persist: async () => true }), true);
    assert.equal(getDbSecurityNoticeFlags().storagePersistenceDenied, false);

    assert.equal(await requestAndTrackStoragePersistence({ persist: async () => false }), false);
    assert.equal(getDbSecurityNoticeFlags().storagePersistenceDenied, true);

    _resetDbSecurityNoticeForTesting();
    assert.equal(
      await requestAndTrackStoragePersistence({
        persist: async () => {
          throw new Error('SecurityError');
        }
      }),
      false
    );
    assert.equal(getDbSecurityNoticeFlags().storagePersistenceDenied, true);
  });

  it('resolveDbSecurityBannerState prioritizes legacy key, includes env/persistence notices independently, and flags critical only for legacy key', () => {
    assert.deepStrictEqual(
      resolveDbSecurityBannerState({
        missingEnvPassword: false,
        storagePersistenceDenied: false,
        legacyKeyInUse: false
      }),
      { showBanner: false, isCritical: false, items: [] }
    );

    const persistenceOnly = resolveDbSecurityBannerState({
      missingEnvPassword: false,
      storagePersistenceDenied: true,
      legacyKeyInUse: false
    });
    assert.equal(persistenceOnly.showBanner, true);
    assert.equal(persistenceOnly.isCritical, false);
    assert.deepStrictEqual(
      persistenceOnly.items.map((item) => item.id),
      ['storage_persistence_denied']
    );

    const allThree = resolveDbSecurityBannerState({
      missingEnvPassword: true,
      storagePersistenceDenied: true,
      legacyKeyInUse: true
    });
    assert.equal(allThree.showBanner, true);
    assert.equal(allThree.isCritical, true);
    assert.deepStrictEqual(
      allThree.items.map((item) => item.id),
      ['legacy_key', 'missing_env_password', 'storage_persistence_denied']
    );
  });
});
