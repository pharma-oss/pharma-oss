import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_COLLECTIONS } from '../backup.ts';
import {
  ALL_SYNC_COLLECTIONS,
  SYNC_PUSH_ONLY_FROM_SATELLITE_COLLECTIONS,
  isPushOnlyFromSatelliteCollection,
  isSyncCollectionName
} from './sync_collections.ts';

test('ALL_SYNC_COLLECTIONS is the backup collection list, so a collection added to backups is synced automatically', () => {
  assert.deepEqual([...ALL_SYNC_COLLECTIONS], [...BACKUP_COLLECTIONS]);
});

test('isSyncCollectionName accepts every known collection and rejects unknown, mis-cased and inherited names', () => {
  for (const name of BACKUP_COLLECTIONS) {
    assert.equal(isSyncCollectionName(name), true, name);
  }
  for (const bad of ['', 'unknown', 'Audit_Logs', 'audit_logs ', 'patients,visits', 'constructor', '__proto__', 'toString']) {
    assert.equal(isSyncCollectionName(bad), false, JSON.stringify(bad));
  }
});

test('audit_logs is the only collection a satellite may push without pulling', () => {
  assert.deepEqual([...SYNC_PUSH_ONLY_FROM_SATELLITE_COLLECTIONS], ['audit_logs']);
  assert.equal(isPushOnlyFromSatelliteCollection('audit_logs'), true);

  for (const name of ALL_SYNC_COLLECTIONS.filter((c) => c !== 'audit_logs')) {
    assert.equal(isPushOnlyFromSatelliteCollection(name), false, `${name} must stay bidirectional`);
  }
});

test('every push-only collection is itself a synced collection', () => {
  for (const name of SYNC_PUSH_ONLY_FROM_SATELLITE_COLLECTIONS) {
    assert.equal(isSyncCollectionName(name), true, name);
  }
});
