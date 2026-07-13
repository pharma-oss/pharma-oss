import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveClientSyncRole } from './client_role.ts';

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
