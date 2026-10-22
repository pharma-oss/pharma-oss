import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveClientSyncIdentity, resolveClientSyncRole } from './client_role.ts';

test('resolveClientSyncRole returns standalone when window is undefined (SSR)', async () => {
  assert.equal(typeof window, 'undefined');
  const role = await resolveClientSyncRole();
  assert.equal(role, 'standalone');
});

test('resolveClientSyncRole parses hub/satellite from a mocked fetch when window exists', async () => {
  (globalThis as { window?: unknown }).window = {};
  try {
    const hubFetch: typeof fetch = async () => new Response(JSON.stringify({ role: 'hub', configured: true }), { status: 200 });
    assert.equal(await resolveClientSyncRole({ fetchImpl: hubFetch }), 'hub');

    const satelliteFetch: typeof fetch = async () => new Response(JSON.stringify({ role: 'satellite', configured: true }), { status: 200 });
    assert.equal(await resolveClientSyncRole({ fetchImpl: satelliteFetch }), 'satellite');

    const standaloneFetch: typeof fetch = async () => new Response(JSON.stringify({ role: 'standalone', configured: true }), { status: 200 });
    assert.equal(await resolveClientSyncRole({ fetchImpl: standaloneFetch }), 'standalone');
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test('resolveClientSyncRole falls back to standalone on network failure or bad response', async () => {
  (globalThis as { window?: unknown }).window = {};
  try {
    const throwingFetch: typeof fetch = async () => { throw new Error('network down'); };
    assert.equal(await resolveClientSyncRole({ fetchImpl: throwingFetch }), 'standalone');

    const errorFetch: typeof fetch = async () => new Response('{}', { status: 500 });
    assert.equal(await resolveClientSyncRole({ fetchImpl: errorFetch }), 'standalone');

    const garbageFetch: typeof fetch = async () => new Response(JSON.stringify({ role: 'nonsense' }), { status: 200 });
    assert.equal(await resolveClientSyncRole({ fetchImpl: garbageFetch }), 'standalone');
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test('resolveClientSyncIdentity carries the hub epoch of a satellite that switched to a standby', async () => {
  (globalThis as { window?: unknown }).window = {};
  try {
    const switched: typeof fetch = async () => new Response(
      JSON.stringify({ role: 'satellite', configured: true, terminalId: 'sat-1', hubEpoch: ' abcd1234 ' }),
      { status: 200 }
    );
    assert.deepEqual(await resolveClientSyncIdentity({ fetchImpl: switched }), { role: 'satellite', terminalId: 'sat-1', hubEpoch: 'abcd1234' });

    const neverSwitched: typeof fetch = async () => new Response(
      JSON.stringify({ role: 'satellite', configured: true, terminalId: 'sat-1' }),
      { status: 200 }
    );
    const identity = await resolveClientSyncIdentity({ fetchImpl: neverSwitched });
    assert.equal(identity.role, 'satellite');
    assert.equal('hubEpoch' in identity, false);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});
