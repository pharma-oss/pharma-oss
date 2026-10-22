import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { openHubStore, type HubStore } from './hub_store.ts';
import { computeStandbyHubHmac, verifyStandbyHubHmac, type StandbyHubEntry } from './satellite_offline_auth.ts';
import type { SatelliteHubState, SatelliteHubStateStore } from './satellite_hub_state.ts';
import { SatelliteHubStateCorruptError } from './satellite_hub_state.ts';
import {
  getStandbyHubState,
  normalizeHubEndpoint,
  signStandbyHubEntry,
  switchSatelliteHub
} from './standby_hub.ts';
import { handleRemotePull } from './sync_remote.ts';
import { encodeTransportPayload, TERMINAL_ID_HEADER } from './sync_http.ts';
import type { PharmacySyncEnv } from './sync_config.ts';
import { performSyncPull } from './sync_client.ts';

const MAIN = 'https://main.local:3443';
const STANDBY = 'https://standby.local:3443';
const TOKEN = 'real-terminal-token-0123456789';

function satelliteEnv(overrides: Partial<PharmacySyncEnv> = {}): PharmacySyncEnv {
  return {
    PHARMACY_SYNC_ROLE: 'satellite',
    PHARMACY_SYNC_HUB_ENDPOINT: MAIN,
    PHARMACY_SYNC_TERMINAL_ID: 'sat-1',
    PHARMACY_SYNC_TERMINAL_TOKEN: TOKEN,
    ...overrides
  };
}

function memoryStateStore(initial: SatelliteHubState | null = null, options: { failWrite?: boolean; corrupt?: boolean } = {}) {
  let state = initial;
  const store: SatelliteHubStateStore & { current(): SatelliteHubState | null } = {
    read() {
      if (options.corrupt) throw new SatelliteHubStateCorruptError('/data/satellite_hub_state.json');
      return state;
    },
    write(next) {
      if (options.failWrite) throw new Error('disk full');
      state = next;
      options.corrupt = false;
    },
    current: () => state
  };
  return store;
}

// ハブの /api/sync/remote/pull を、実際のハブストアと認証付きでそのまま呼ぶ代わりの fetch
function fetchToHub(store: HubStore, calls: { url: string; headers: Headers }[] = []): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({ url: url.toString(), headers });
    const result = handleRemotePull({
      authorizationHeader: headers.get('authorization'),
      terminalId: headers.get(TERMINAL_ID_HEADER),
      store,
      collection: url.searchParams.get('collection') || '',
      checkpointSeq: Number(url.searchParams.get('checkpoint')),
      batchSize: Number(url.searchParams.get('batchSize')),
      transportEncryption: 'none'
    });
    return new Response(JSON.stringify(result.body), { status: result.status });
  };
}

function restoredStandbyHub(options: { token?: string; withUsers?: boolean } = {}): { store: HubStore } {
  const store = openHubStore({ dbPath: ':memory:', encryptionKey: randomBytes(32) });
  store.rotateTerminalToken('sat-1', 'テスト');
  if (options.token !== undefined) {
    // 端末の登録(トークンのハッシュ)は、復旧したハブストアの中身そのもの
    store.revokeTerminal('sat-1');
  }
  if (options.withUsers !== false) {
    store.push('users', 'hub-local', [{ docId: 'u1', newDocumentState: { userId: 'u1', name: '管理者', _deleted: false } }]);
  }
  return { store };
}

function registeredHub(withUsers = true): { store: HubStore; token: string } {
  const store = openHubStore({ dbPath: ':memory:', encryptionKey: randomBytes(32) });
  const { token } = store.registerTerminal('sat-1', 'テスト');
  if (withUsers) {
    store.push('users', 'hub-local', [{ docId: 'u1', newDocumentState: { userId: 'u1', name: '管理者', _deleted: false } }]);
  }
  return { store, token };
}

function signedEntry(endpoint = STANDBY, token = TOKEN, issuedAt = '2026-10-22T00:00:00.000Z'): StandbyHubEntry {
  return { endpoint, issuedAt, signature: computeStandbyHubHmac(endpoint, issuedAt, token) };
}

test('normalizeHubEndpoint keeps only scheme, host and port and rejects what the sync rules forbid', () => {
  assert.equal(normalizeHubEndpoint('https://Standby.local:3443/api/anything?x=1', 'none'), 'https://standby.local:3443');
  assert.equal(normalizeHubEndpoint('  https://standby.local:3443/  ', 'none'), 'https://standby.local:3443');
  assert.equal(normalizeHubEndpoint('http://127.0.0.1:3400', 'none'), 'http://127.0.0.1:3400');
  assert.equal(normalizeHubEndpoint('http://192.168.1.50:3000', 'none'), null, 'LAN の平文 HTTP は拒否');
  assert.equal(normalizeHubEndpoint('http://192.168.1.50:3000', 'aes-gcm'), 'http://192.168.1.50:3000');
  assert.equal(normalizeHubEndpoint('https://evil.example.com', 'none'), null, '施設外のホストは拒否');
  assert.equal(normalizeHubEndpoint('https://user:pass@standby.local:3443', 'none'), null, '認証情報つきは拒否');
  assert.equal(normalizeHubEndpoint('ftp://standby.local', 'none'), null);
  assert.equal(normalizeHubEndpoint('not a url', 'none'), null);
});

test('signStandbyHubEntry signs with the real terminal token, never a placeholder', () => {
  const now = new Date('2026-10-22T09:00:00.000Z');
  const result = signStandbyHubEntry('https://Standby.local:3443/', { env: satelliteEnv() }, now);
  assert.ok(result.ok);
  const entry = result.ok ? result.body : null;
  assert.deepEqual(
    { endpoint: entry?.endpoint, issuedAt: entry?.issuedAt },
    { endpoint: STANDBY, issuedAt: '2026-10-22T09:00:00.000Z' }
  );
  assert.equal(verifyStandbyHubHmac(entry as StandbyHubEntry, TOKEN), true);
  assert.equal(verifyStandbyHubHmac(entry as StandbyHubEntry, 'mock_satellite_token'), false);
});

test('signStandbyHubEntry rejects disallowed endpoints and non-satellite roles', () => {
  const bad = signStandbyHubEntry('http://192.168.1.50:3000', { env: satelliteEnv() });
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 400);
  const empty = signStandbyHubEntry('   ', { env: satelliteEnv() });
  assert.equal(empty.status, 400);
  const notString = signStandbyHubEntry({ endpoint: STANDBY }, { env: satelliteEnv() });
  assert.equal(notString.status, 400);
  const hub = signStandbyHubEntry(STANDBY, {
    env: { PHARMACY_SYNC_ROLE: 'hub', PHARMACY_SYNC_HUB_ENCRYPTION_KEY: randomBytes(32).toString('hex') }
  });
  assert.equal(hub.status, 400);
  const standalone = signStandbyHubEntry(STANDBY, { env: {} });
  assert.equal(standalone.status, 400);
});

test('signStandbyHubEntry honours the real transport setting (http LAN is fine under aes-gcm)', () => {
  const env = satelliteEnv({
    PHARMACY_SYNC_HUB_ENDPOINT: 'http://192.168.1.10:3000',
    PHARMACY_SYNC_TRANSPORT_ENCRYPTION: 'aes-gcm',
    PHARMACY_SYNC_TRANSPORT_KEY: randomBytes(32).toString('hex')
  });
  const result = signStandbyHubEntry('http://192.168.1.50:3000', { env });
  assert.ok(result.ok);
});

test('getStandbyHubState reports the environment endpoint, then the saved one', () => {
  const store = memoryStateStore();
  const before = getStandbyHubState({ env: satelliteEnv(), satelliteHubStateStore: store });
  assert.deepEqual(before.body, { activeEndpoint: MAIN, defaultEndpoint: MAIN, overridden: false, epoch: '' });

  store.write({ endpoint: STANDBY, epoch: 'abcd1234', switchedAt: '2026-10-22T01:00:00.000Z' });
  const after = getStandbyHubState({ env: satelliteEnv(), satelliteHubStateStore: store });
  assert.deepEqual(after.body, {
    activeEndpoint: STANDBY,
    defaultEndpoint: MAIN,
    overridden: true,
    epoch: 'abcd1234',
    switchedAt: '2026-10-22T01:00:00.000Z'
  });
});

test('getStandbyHubState surfaces an unreadable saved file as an error', () => {
  const result = getStandbyHubState({ env: satelliteEnv(), satelliteHubStateStore: memoryStateStore(null, { corrupt: true }) });
  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
});

test('switchSatelliteHub saves the standby and makes sync follow it, after the standby accepts this terminal', async () => {
  const { store: standbyHub, token } = registeredHub();
  const calls: { url: string; headers: Headers }[] = [];
  const stateStore = memoryStateStore();
  const env = satelliteEnv({ PHARMACY_SYNC_TERMINAL_TOKEN: token });
  const entry = signedEntry(STANDBY, token);
  try {
    const result = await switchSatelliteHub(
      { entry },
      { env, fetchImpl: fetchToHub(standbyHub, calls), satelliteHubStateStore: stateStore },
      new Date('2026-10-22T10:00:00.000Z')
    );
    assert.ok(result.ok, JSON.stringify(result.body));
    assert.equal(result.ok && result.body.activeEndpoint, STANDBY);
    assert.equal(result.ok && result.body.overridden, true);
    assert.match(result.ok ? result.body.epoch : '', /^[a-z0-9]{4,40}$/);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.startsWith(`${STANDBY}/api/sync/remote/pull`), true);
    assert.equal(calls[0].headers.get('authorization'), `Bearer ${token}`);
    assert.equal(calls[0].headers.get(TERMINAL_ID_HEADER), 'sat-1');

    assert.equal(stateStore.current()?.endpoint, STANDBY);
    assert.equal(stateStore.current()?.switchedAt, '2026-10-22T10:00:00.000Z');

    // 切替後の同期は、環境変数の接続先ではなく保存した接続先へ向かう
    const pullCalls: string[] = [];
    const pulled = await performSyncPull('users', 0, 10, {
      env,
      satelliteHubStateStore: stateStore,
      fetchImpl: async (input) => {
        pullCalls.push(String(input));
        return new Response(JSON.stringify({ documents: [], checkpoint: { seq: 0 } }));
      }
    });
    assert.ok(pulled.ok);
    assert.equal(pullCalls[0].startsWith(`${STANDBY}/api/sync/remote/pull`), true);
  } finally {
    standbyHub.close();
  }
});

test('switchSatelliteHub rejects a tampered or placeholder-signed entry without contacting anything or saving', async () => {
  const stateStore = memoryStateStore();
  let fetched = 0;
  const options = {
    env: satelliteEnv(),
    satelliteHubStateStore: stateStore,
    fetchImpl: (async () => { fetched += 1; return new Response('{}'); }) as typeof fetch
  };
  const tampered = { ...signedEntry(), endpoint: 'https://attacker.local:3443' };
  const placeholder = signedEntry(STANDBY, 'mock_satellite_token');
  for (const entry of [tampered, placeholder, { ...signedEntry(), signature: 'bad' }]) {
    const result = await switchSatelliteHub({ entry }, options);
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
  }
  assert.equal(fetched, 0);
  assert.equal(stateStore.current(), null);
});

test('switchSatelliteHub rejects malformed requests', async () => {
  const options = { env: satelliteEnv(), satelliteHubStateStore: memoryStateStore() };
  for (const body of [null, undefined, {}, { entry: null }, { entry: { endpoint: STANDBY } }, { target: 'standby' }, 'default']) {
    const result = await switchSatelliteHub(body, options);
    assert.equal(result.status, 400, JSON.stringify(body));
  }
});

test('switchSatelliteHub does not switch to a hub that is unreachable', async () => {
  const stateStore = memoryStateStore();
  const result = await switchSatelliteHub(
    { entry: signedEntry() },
    {
      env: satelliteEnv(),
      satelliteHubStateStore: stateStore,
      fetchImpl: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch
    }
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.match(result.ok ? '' : result.body.message, /接続できませんでした/);
  assert.equal(stateStore.current(), null);
});

test('switchSatelliteHub does not switch to a hub that does not know this terminal (a 401 would wipe the satellite caches)', async () => {
  const { store: standbyHub } = registeredHub();
  const stateStore = memoryStateStore();
  try {
    // 予備機にはこの端末が別のトークンで登録されている
    const result = await switchSatelliteHub(
      { entry: signedEntry() },
      { env: satelliteEnv(), satelliteHubStateStore: stateStore, fetchImpl: fetchToHub(standbyHub) }
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 422);
    assert.match(result.ok ? '' : result.body.message, /認証しませんでした/);
    assert.match(result.ok ? '' : result.body.message, /sat-1/);
    assert.equal(stateStore.current(), null);
  } finally {
    standbyHub.close();
  }
});

test('switchSatelliteHub does not switch to a hub whose staff data has not been restored', async () => {
  const { store: standbyHub, token } = registeredHub(false);
  const stateStore = memoryStateStore();
  try {
    const result = await switchSatelliteHub(
      { entry: signedEntry(STANDBY, token) },
      { env: satelliteEnv({ PHARMACY_SYNC_TERMINAL_TOKEN: token }), satelliteHubStateStore: stateStore, fetchImpl: fetchToHub(standbyHub) }
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 422);
    assert.match(result.ok ? '' : result.body.message, /スタッフ情報が復旧されていません/);
    assert.equal(stateStore.current(), null);
  } finally {
    standbyHub.close();
  }
});

test('switchSatelliteHub reports a hub that is not running as a hub, or that rejects the check', async () => {
  const run = async (status: number) => switchSatelliteHub(
    { entry: signedEntry() },
    {
      env: satelliteEnv(),
      satelliteHubStateStore: memoryStateStore(),
      fetchImpl: (async () => new Response('{}', { status })) as typeof fetch
    }
  );
  const notHub = await run(404);
  assert.match(notHub.ok ? '' : notHub.body.message, /hub として動いていません|hub）として動いていません/);
  const other = await run(500);
  assert.match(other.ok ? '' : other.body.message, /HTTP 500/);
});

test('switchSatelliteHub fails without claiming success when the choice cannot be saved', async () => {
  const { store: standbyHub, token } = registeredHub();
  try {
    const result = await switchSatelliteHub(
      { entry: signedEntry(STANDBY, token) },
      {
        env: satelliteEnv({ PHARMACY_SYNC_TERMINAL_TOKEN: token }),
        satelliteHubStateStore: memoryStateStore(null, { failWrite: true }),
        fetchImpl: fetchToHub(standbyHub)
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
    assert.match(result.ok ? '' : result.body.message, /接続先は変わっていません/);
  } finally {
    standbyHub.close();
  }
});

test('switchSatelliteHub refuses to switch to where the satellite already is', async () => {
  const stateStore = memoryStateStore({ endpoint: STANDBY, epoch: 'abcd1234', switchedAt: '2026-10-22T01:00:00.000Z' });
  let fetched = 0;
  const options = {
    env: satelliteEnv(),
    satelliteHubStateStore: stateStore,
    fetchImpl: (async () => { fetched += 1; return new Response('{}'); }) as typeof fetch
  };
  const sameStandby = await switchSatelliteHub({ entry: signedEntry(`${STANDBY}/`) }, options);
  assert.equal(sameStandby.status, 409);

  const alreadyMain = await switchSatelliteHub(
    { target: 'default' },
    { ...options, satelliteHubStateStore: memoryStateStore() }
  );
  assert.equal(alreadyMain.status, 409);
  assert.equal(fetched, 0);
});

test('switchSatelliteHub can return to the main hub, which makes sync follow the environment endpoint again with a new epoch', async () => {
  const { store: mainHub, token } = registeredHub();
  const stateStore = memoryStateStore({ endpoint: STANDBY, epoch: 'oldepoch1', switchedAt: '2026-10-22T01:00:00.000Z' });
  const calls: { url: string; headers: Headers }[] = [];
  try {
    const result = await switchSatelliteHub(
      { target: 'default' },
      {
        env: satelliteEnv({ PHARMACY_SYNC_TERMINAL_TOKEN: token }),
        satelliteHubStateStore: stateStore,
        fetchImpl: fetchToHub(mainHub, calls)
      }
    );
    assert.ok(result.ok, JSON.stringify(result.body));
    assert.equal(result.ok && result.body.activeEndpoint, MAIN);
    assert.equal(result.ok && result.body.overridden, false);
    assert.notEqual(result.ok && result.body.epoch, 'oldepoch1', '戻すときも世代を作り直して、pull をやり直す');
    assert.equal(calls[0].url.startsWith(`${MAIN}/api/sync/remote/pull`), true);
    assert.equal(stateStore.current()?.endpoint, null);
  } finally {
    mainHub.close();
  }
});

test('switchSatelliteHub treats a registered standby that equals the environment endpoint as the main hub', async () => {
  const { store: mainHub, token } = registeredHub();
  const stateStore = memoryStateStore({ endpoint: STANDBY, epoch: 'oldepoch1', switchedAt: '2026-10-22T01:00:00.000Z' });
  try {
    const result = await switchSatelliteHub(
      { entry: signedEntry(MAIN, token) },
      { env: satelliteEnv({ PHARMACY_SYNC_TERMINAL_TOKEN: token }), satelliteHubStateStore: stateStore, fetchImpl: fetchToHub(mainHub) }
    );
    assert.ok(result.ok);
    assert.equal(result.ok && result.body.overridden, false);
    assert.equal(stateStore.current()?.endpoint, null);
  } finally {
    mainHub.close();
  }
});

test('switchSatelliteHub lets going back to the main hub repair an unreadable saved file', async () => {
  const { store: mainHub, token } = registeredHub();
  const stateStore = memoryStateStore(null, { corrupt: true });
  try {
    const result = await switchSatelliteHub(
      { target: 'default' },
      { env: satelliteEnv({ PHARMACY_SYNC_TERMINAL_TOKEN: token }), satelliteHubStateStore: stateStore, fetchImpl: fetchToHub(mainHub) }
    );
    assert.ok(result.ok, JSON.stringify(result.body));
    assert.equal(stateStore.current()?.endpoint, null);
  } finally {
    mainHub.close();
  }
});

test('switchSatelliteHub decodes the probe under aes-gcm transport encryption', async () => {
  const transportKey = randomBytes(32);
  const { store: standbyHub, token } = registeredHub();
  const stateStore = memoryStateStore();
  const env = satelliteEnv({
    PHARMACY_SYNC_TERMINAL_TOKEN: token,
    PHARMACY_SYNC_HUB_ENDPOINT: 'http://192.168.1.10:3000',
    PHARMACY_SYNC_TRANSPORT_ENCRYPTION: 'aes-gcm',
    PHARMACY_SYNC_TRANSPORT_KEY: transportKey.toString('hex')
  });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const result = handleRemotePull({
      authorizationHeader: headers.get('authorization'),
      terminalId: headers.get(TERMINAL_ID_HEADER),
      store: standbyHub,
      collection: url.searchParams.get('collection') || '',
      checkpointSeq: 0,
      batchSize: 1,
      transportEncryption: 'aes-gcm',
      transportKey
    });
    return new Response(JSON.stringify(result.body), { status: result.status });
  };
  try {
    const entry = signedEntry('http://192.168.1.50:3000', token);
    const result = await switchSatelliteHub({ entry }, { env, satelliteHubStateStore: stateStore, fetchImpl });
    assert.ok(result.ok, JSON.stringify(result.body));
    // 暗号化が一致しない相手は、読み取れないとして拒否する
    const plain: typeof fetch = async () => new Response(JSON.stringify(encodeTransportPayload({ documents: [{}] }, 'none')));
    const mismatch = await switchSatelliteHub(
      { entry: signedEntry('http://192.168.1.60:3000', token) },
      { env, satelliteHubStateStore: memoryStateStore(), fetchImpl: plain }
    );
    assert.equal(mismatch.ok, false);
    assert.match(mismatch.ok ? '' : mismatch.body.message, /転送暗号化の設定/);
  } finally {
    standbyHub.close();
  }
});
