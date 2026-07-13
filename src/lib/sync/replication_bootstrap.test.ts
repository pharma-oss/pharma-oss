import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awaitSatelliteLoginGate, SATELLITE_LOGIN_GATE_COLLECTIONS } from './replication_bootstrap.ts';
import type { ReplicationHandle } from './replication_client.ts';

test('satellite login gate waits only for users and facility_settings', () => {
  assert.deepEqual([...SATELLITE_LOGIN_GATE_COLLECTIONS], ['users', 'facility_settings']);
});

test('awaitSatelliteLoginGate resolves when the gate collections finish initial replication', async () => {
  const awaited: string[] = [];
  const makeState = (name: string) => ({
    awaitInitialReplication: async () => { awaited.push(name); }
  });
  const handle = {
    states: {
      users: makeState('users'),
      facility_settings: makeState('facility_settings'),
      patients: makeState('patients')
    },
    awaitInitialReplication: async () => {},
    cancel: async () => {}
  } as unknown as ReplicationHandle;

  await awaitSatelliteLoginGate(handle);
  assert.deepEqual(awaited.sort(), ['facility_settings', 'users']);
  assert.ok(!awaited.includes('patients'), '薬品マスタ等の大きいコレクションはログインをブロックしない');
});

test('awaitSatelliteLoginGate tolerates a handle without one of the gate collections', async () => {
  const handle = {
    states: {
      users: { awaitInitialReplication: async () => {} }
    },
    awaitInitialReplication: async () => {},
    cancel: async () => {}
  } as unknown as ReplicationHandle;
  await awaitSatelliteLoginGate(handle);
});
