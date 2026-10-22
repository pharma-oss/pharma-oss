import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchStandbyHubState,
  isSameStandbyEndpoint,
  requestHubSwitch,
  requestStandbyHubRegistration
} from './standby_hub_client.ts';

const STATE = { activeEndpoint: 'https://standby.local:3443', defaultEndpoint: 'https://main.local:3443', overridden: true, epoch: 'abcd1234' };
const ENTRY = { endpoint: 'https://standby.local:3443', issuedAt: '2026-10-22T00:00:00.000Z', signature: 'sig' };

function jsonFetch(status: number, body: unknown, seen: { url: string; init?: RequestInit }[] = []): typeof fetch {
  return async (input, init) => {
    seen.push({ url: String(input), init });
    return new Response(JSON.stringify(body), { status });
  };
}

test('isSameStandbyEndpoint ignores trailing slashes and case but not ports or schemes', () => {
  assert.equal(isSameStandbyEndpoint('https://Standby.local:3443/', 'https://standby.local:3443'), true);
  assert.equal(isSameStandbyEndpoint('https://standby.local:3443', 'https://standby.local:3444'), false);
  assert.equal(isSameStandbyEndpoint('http://standby.local:3443', 'https://standby.local:3443'), false);
  assert.equal(isSameStandbyEndpoint('garbage', 'garbage'), true);
});

test('fetchStandbyHubState returns the server state, or the server message when it fails', async () => {
  const ok = await fetchStandbyHubState(jsonFetch(200, STATE));
  assert.deepEqual(ok, { ok: true, value: STATE });

  const failed = await fetchStandbyHubState(jsonFetch(500, { message: '壊れています' }));
  assert.deepEqual(failed, { ok: false, message: '壊れています' });

  const malformed = await fetchStandbyHubState(jsonFetch(200, { activeEndpoint: 1 }));
  assert.equal(malformed.ok, false);

  const unreachable = await fetchStandbyHubState((async () => { throw new TypeError('x'); }) as typeof fetch);
  assert.equal(unreachable.ok, false);
});

test('requestStandbyHubRegistration posts only the endpoint and returns the signed entry', async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const result = await requestStandbyHubRegistration('https://standby.local:3443', jsonFetch(200, ENTRY, seen));
  assert.deepEqual(result, { ok: true, value: ENTRY });
  assert.equal(seen[0].url, '/api/sync/standby-hub/register');
  assert.equal(seen[0].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(seen[0].init?.body)), { endpoint: 'https://standby.local:3443' });
  assert.equal(new Headers(seen[0].init?.headers).get('content-type'), 'application/json');

  const rejected = await requestStandbyHubRegistration('http://192.168.0.5', jsonFetch(400, { message: '許可されません' }));
  assert.deepEqual(rejected, { ok: false, message: '許可されません' });
  const badShape = await requestStandbyHubRegistration('https://standby.local:3443', jsonFetch(200, { endpoint: 'x' }));
  assert.equal(badShape.ok, false);
});

test('requestHubSwitch sends the signed entry (or the default target) and surfaces refusals verbatim', async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const ok = await requestHubSwitch({ entry: ENTRY }, jsonFetch(200, STATE, seen));
  assert.deepEqual(ok, { ok: true, value: STATE });
  assert.equal(seen[0].url, '/api/sync/standby-hub/switch');
  assert.deepEqual(JSON.parse(String(seen[0].init?.body)), { entry: ENTRY });

  const back = await requestHubSwitch({ target: 'default' }, jsonFetch(200, { ...STATE, overridden: false }, seen));
  assert.equal(back.ok && back.value.overridden, false);
  assert.deepEqual(JSON.parse(String(seen[1].init?.body)), { target: 'default' });

  const refused = await requestHubSwitch({ entry: ENTRY }, jsonFetch(422, { message: '予備機がこの端末（sat-1）を認証しませんでした。' }));
  assert.deepEqual(refused, { ok: false, message: '予備機がこの端末（sat-1）を認証しませんでした。' });

  const noBody = await requestHubSwitch({ entry: ENTRY }, (async () => new Response('', { status: 502 })) as typeof fetch);
  assert.equal(noBody.ok, false);
  const unreachable = await requestHubSwitch({ entry: ENTRY }, (async () => { throw new TypeError('x'); }) as typeof fetch);
  assert.equal(unreachable.ok, false);
});
