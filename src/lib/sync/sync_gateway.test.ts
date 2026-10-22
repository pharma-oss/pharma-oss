import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createSyncGatewayHandler,
  decideGatewayRoute,
  findExposedUpstreamAddresses,
  listLanIPv4Addresses,
  resolveSyncGatewayConfig,
  selectForwardHeaders,
  waitForUpstream
} from './sync_gateway.ts';
import type { NetworkInterfaceMap, SyncGatewayEnv } from './sync_gateway.ts';
import { TERMINAL_ID_HEADER } from './sync_http.ts';

describe('decideGatewayRoute', () => {
  test('allows exactly the two satellite routes and forwards the target unchanged', () => {
    const pull = decideGatewayRoute('GET', '/api/sync/remote/pull?collection=patients&checkpoint=0&batchSize=200');
    assert.deepEqual(pull, {
      allow: true,
      method: 'GET',
      path: '/api/sync/remote/pull',
      upstreamTarget: '/api/sync/remote/pull?collection=patients&checkpoint=0&batchSize=200'
    });
    const push = decideGatewayRoute('POST', '/api/sync/remote/push');
    assert.equal(push.allow, true);
    assert.equal(push.allow && push.upstreamTarget, '/api/sync/remote/push');
  });

  test('denies every route that is meant for the machine\'s own browser or for connectors', () => {
    const denied = [
      '/',
      '/emr',
      '/_next/static/chunks/main.js',
      '/api/sync/pull',
      '/api/sync/push',
      '/api/sync/config',
      '/api/sync/status',
      '/api/sync/terminals',
      '/api/sync/terminals/satellite-1',
      '/api/sync/conflicts',
      '/api/sync/conflicts/c1',
      '/api/sync/standby-hub/switch',
      '/api/eligibility/check',
      '/api/electronic-prescription/operation',
      '/api/external-integration/prescription-handoff',
      '/api/system/connector-readiness',
      '/api/sync/remote',
      '/api/sync/remote/',
      '/api/sync/remote/status'
    ];
    for (const target of denied) {
      for (const method of ['GET', 'POST', 'DELETE']) {
        const decision = decideGatewayRoute(method, target);
        assert.equal(decision.allow, false, `${method} ${target}`);
        assert.equal(decision.allow === false && decision.status, 404, `${method} ${target}`);
      }
    }
  });

  test('does not normalize the path: lookalike and traversal forms are denied', () => {
    const lookalikes = [
      '/api/sync/remote/pull/',
      '/api/sync/remote/pull/..',
      '/api/sync/remote/pull/../terminals',
      '/api/sync/remote/../terminals',
      '/api/sync/remote/./pull',
      '//api/sync/remote/pull',
      '/api/sync/remote//pull',
      '/api/sync/remote/%70ull',
      '/api/sync/remote%2Fpull',
      '/api/sync/remote/pull%2f..%2fterminals',
      '/API/SYNC/REMOTE/PULL',
      '/api/sync/remote/pull;x=1',
      '/api/sync/remote/pull#fragment',
      '/api/sync\\remote\\pull',
      'http://evil.example/api/sync/remote/pull',
      'api/sync/remote/pull',
      '/api/sync/remote/pull\r\nX-Injected: 1',
      `/api/sync/remote/pull?${'a'.repeat(3000)}`
    ];
    for (const target of lookalikes) {
      assert.equal(decideGatewayRoute('GET', target).allow, false, target);
    }
    assert.equal(decideGatewayRoute('GET', undefined).allow, false);
    assert.equal(decideGatewayRoute('GET', '').allow, false);
  });

  test('answers 405 with the allowed method when only the method is wrong', () => {
    const decision = decideGatewayRoute('POST', '/api/sync/remote/pull?collection=patients');
    assert.deepEqual(decision, { allow: false, status: 405, path: '/api/sync/remote/pull', allowedMethod: 'GET' });
    const reversed = decideGatewayRoute('GET', '/api/sync/remote/push');
    assert.equal(reversed.allow === false && reversed.status, 405);
    assert.equal(decideGatewayRoute('OPTIONS', '/api/sync/remote/push').allow, false);
  });
});

describe('selectForwardHeaders', () => {
  test('forwards only the headers the remote routes need', () => {
    const forwarded = selectForwardHeaders({
      authorization: 'Bearer token-1',
      'content-type': 'application/json',
      accept: 'application/json',
      [TERMINAL_ID_HEADER]: 'satellite-1',
      cookie: 'session=abc',
      host: 'hub.local:3443',
      'x-forwarded-for': '203.0.113.9',
      'x-middleware-subrequest': 'middleware',
      connection: 'keep-alive',
      'content-length': '999',
      'transfer-encoding': 'chunked'
    });
    assert.deepEqual(forwarded, {
      authorization: 'Bearer token-1',
      'content-type': 'application/json',
      accept: 'application/json',
      [TERMINAL_ID_HEADER]: 'satellite-1'
    });
  });

  test('drops empty and repeated (array) header values', () => {
    assert.deepEqual(selectForwardHeaders({ authorization: '', 'content-type': ['a', 'b'] as unknown as string }), {});
  });
});

describe('resolveSyncGatewayConfig', () => {
  const lanTls: SyncGatewayEnv = {
    PHARMACY_SYNC_ROLE: 'hub',
    PHARMACY_SYNC_GATEWAY_TLS_CERT: '/etc/hub/cert.pem',
    PHARMACY_SYNC_GATEWAY_TLS_KEY: '/etc/hub/key.pem'
  };

  test('accepts the default LAN setup with HTTPS', () => {
    const result = resolveSyncGatewayConfig(lanTls);
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok && result.config, {
      host: '0.0.0.0',
      port: 3443,
      upstreamHost: '127.0.0.1',
      upstreamPort: 3000,
      tlsCertPath: '/etc/hub/cert.pem',
      tlsKeyPath: '/etc/hub/key.pem',
      transportEncryption: 'none'
    });
  });

  test('refuses to start on satellite and standalone machines', () => {
    for (const role of ['satellite', 'standalone', '', 'unknown']) {
      const result = resolveSyncGatewayConfig({ ...lanTls, PHARMACY_SYNC_ROLE: role });
      assert.equal(result.ok, false, role);
    }
    assert.equal(resolveSyncGatewayConfig({ ...lanTls, PHARMACY_SYNC_ROLE: undefined }).ok, false);
  });

  test('requires HTTPS or aes-gcm when listening beyond loopback', () => {
    assert.equal(resolveSyncGatewayConfig({ PHARMACY_SYNC_ROLE: 'hub' }).ok, false);
    assert.equal(resolveSyncGatewayConfig({ PHARMACY_SYNC_ROLE: 'hub', PHARMACY_SYNC_GATEWAY_HOST: '192.168.0.3' }).ok, false);
    const aes = resolveSyncGatewayConfig({ PHARMACY_SYNC_ROLE: 'hub', PHARMACY_SYNC_TRANSPORT_ENCRYPTION: 'aes-gcm' });
    assert.equal(aes.ok, true);
    assert.equal(aes.ok && aes.config.transportEncryption, 'aes-gcm');
  });

  test('allows plain HTTP only on a loopback listen address', () => {
    for (const host of ['127.0.0.1', 'localhost', '::1']) {
      assert.equal(resolveSyncGatewayConfig({ PHARMACY_SYNC_ROLE: 'hub', PHARMACY_SYNC_GATEWAY_HOST: host, PHARMACY_SYNC_GATEWAY_PORT: '3403' }).ok, true, host);
    }
    // 先頭が 127. でも名前は loopback ではない
    assert.equal(resolveSyncGatewayConfig({ PHARMACY_SYNC_ROLE: 'hub', PHARMACY_SYNC_GATEWAY_HOST: '127.0.0.1.example.com' }).ok, false);
  });

  test('requires the TLS certificate and key together', () => {
    assert.equal(resolveSyncGatewayConfig({ PHARMACY_SYNC_ROLE: 'hub', PHARMACY_SYNC_GATEWAY_TLS_CERT: '/c.pem', PHARMACY_SYNC_TRANSPORT_ENCRYPTION: 'aes-gcm' }).ok, false);
    assert.equal(resolveSyncGatewayConfig({ PHARMACY_SYNC_ROLE: 'hub', PHARMACY_SYNC_GATEWAY_TLS_KEY: '/k.pem', PHARMACY_SYNC_TRANSPORT_ENCRYPTION: 'aes-gcm' }).ok, false);
  });

  test('validates the listen port', () => {
    for (const port of ['0', '65536', 'abc', '3.5', '-1']) {
      assert.equal(resolveSyncGatewayConfig({ ...lanTls, PHARMACY_SYNC_GATEWAY_PORT: port }).ok, false, port);
    }
    const ok = resolveSyncGatewayConfig({ ...lanTls, PHARMACY_SYNC_GATEWAY_PORT: '8443' });
    assert.equal(ok.ok && ok.config.port, 8443);
  });

  test('accepts only a same-machine http upstream', () => {
    const accepted = resolveSyncGatewayConfig({ ...lanTls, PHARMACY_SYNC_GATEWAY_UPSTREAM: 'http://localhost:3100' });
    assert.equal(accepted.ok && accepted.config.upstreamPort, 3100);
    const rejected = [
      'http://192.168.0.3:3000',
      'http://hub.local:3000',
      'https://127.0.0.1:3000',
      'http://127.0.0.1.example.com:3000',
      'http://0.0.0.0:3000',
      'not a url'
    ];
    for (const upstream of rejected) {
      assert.equal(resolveSyncGatewayConfig({ ...lanTls, PHARMACY_SYNC_GATEWAY_UPSTREAM: upstream }).ok, false, upstream);
    }
  });

  test('rejects listening on the same port as the upstream', () => {
    assert.equal(resolveSyncGatewayConfig({ ...lanTls, PHARMACY_SYNC_GATEWAY_PORT: '3000' }).ok, false);
  });
});

interface RecordedRequest {
  method: string | undefined;
  url: string | undefined;
  headers: http.IncomingHttpHeaders;
  body: string;
}

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

async function close(server: http.Server): Promise<void> {
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function withGateway(
  options: { maxBodyBytes?: number; upstreamTimeoutMs?: number; upstreamResponder?: http.RequestListener; skipUpstream?: boolean },
  run: (ctx: { gatewayUrl: string; requests: RecordedRequest[]; logs: string[] }) => Promise<void>
) {
  const requests: RecordedRequest[] = [];
  const logs: string[] = [];
  const upstream = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      if (options.upstreamResponder) {
        options.upstreamResponder(req, res);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'upstream=1', 'X-Powered-By': 'next' });
      res.end(JSON.stringify({ ok: true, echoedUrl: req.url }));
    });
  });
  const upstreamPort = options.skipUpstream ? 1 : await listen(upstream);
  const gateway = http.createServer(createSyncGatewayHandler({
    upstreamHost: '127.0.0.1',
    upstreamPort,
    maxBodyBytes: options.maxBodyBytes,
    upstreamTimeoutMs: options.upstreamTimeoutMs,
    log: (line) => logs.push(line)
  }));
  const gatewayPort = await listen(gateway);
  try {
    await run({ gatewayUrl: `http://127.0.0.1:${gatewayPort}`, requests, logs });
  } finally {
    await close(gateway);
    if (!options.skipUpstream) await close(upstream);
  }
}

describe('createSyncGatewayHandler', () => {
  test('forwards an allowed pull with the auth headers and relays the upstream answer', async () => {
    await withGateway({}, async ({ gatewayUrl, requests }) => {
      const response = await fetch(`${gatewayUrl}/api/sync/remote/pull?collection=patients&checkpoint=3&batchSize=50`, {
        headers: {
          Authorization: 'Bearer token-1',
          [TERMINAL_ID_HEADER]: 'satellite-1',
          Cookie: 'session=abc',
          'X-Forwarded-For': '203.0.113.9'
        }
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, echoedUrl: '/api/sync/remote/pull?collection=patients&checkpoint=3&batchSize=50' });
      assert.equal(response.headers.get('set-cookie'), null);
      assert.equal(response.headers.get('x-powered-by'), null);
      assert.equal(response.headers.get('cache-control'), 'no-store');

      assert.equal(requests.length, 1);
      assert.equal(requests[0].method, 'GET');
      assert.equal(requests[0].headers.authorization, 'Bearer token-1');
      assert.equal(requests[0].headers[TERMINAL_ID_HEADER], 'satellite-1');
      assert.equal(requests[0].headers.cookie, undefined);
      assert.equal(requests[0].headers['x-forwarded-for'], undefined);
    });
  });

  test('forwards an allowed push body and the upstream status code', async () => {
    await withGateway({
      upstreamResponder: (_req, res) => {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'denied' }));
      }
    }, async ({ gatewayUrl, requests }) => {
      const payload = JSON.stringify({ collection: 'patients', rows: [{ docId: 'p1' }] });
      const response = await fetch(`${gatewayUrl}/api/sync/remote/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer bad' },
        body: payload
      });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { message: 'denied' });
      assert.equal(requests.length, 1);
      assert.equal(requests[0].method, 'POST');
      assert.equal(requests[0].body, payload);
      assert.equal(requests[0].headers['content-length'], String(Buffer.byteLength(payload)));
    });
  });

  test('never reaches the upstream for routes outside the allow-list', async () => {
    await withGateway({}, async ({ gatewayUrl, requests }) => {
      const attempts: Array<{ method: string; path: string; status: number }> = [
        { method: 'GET', path: '/api/sync/pull?collection=patients&checkpoint=0', status: 404 },
        { method: 'POST', path: '/api/sync/push', status: 404 },
        { method: 'GET', path: '/api/sync/config', status: 404 },
        { method: 'GET', path: '/api/sync/terminals', status: 404 },
        { method: 'POST', path: '/api/sync/terminals', status: 404 },
        { method: 'DELETE', path: '/api/sync/terminals/satellite-1', status: 404 },
        { method: 'GET', path: '/api/sync/conflicts', status: 404 },
        { method: 'POST', path: '/api/electronic-prescription/operation', status: 404 },
        { method: 'GET', path: '/emr', status: 404 },
        { method: 'GET', path: '/api/sync/remote/pull/../terminals', status: 404 },
        { method: 'GET', path: '/api/sync/remote/pull/', status: 404 },
        { method: 'POST', path: '/api/sync/remote/pull', status: 405 },
        { method: 'GET', path: '/api/sync/remote/push', status: 405 }
      ];
      for (const attempt of attempts) {
        const response = await fetch(`${gatewayUrl}${attempt.path}`, {
          method: attempt.method,
          headers: { 'Content-Type': 'application/json' },
          body: attempt.method === 'POST' ? '{}' : undefined
        });
        assert.equal(response.status, attempt.status, `${attempt.method} ${attempt.path}`);
        await response.text();
      }
      assert.equal(requests.length, 0, `upstream saw: ${requests.map((r) => `${r.method} ${r.url}`).join(', ')}`);
    });
  });

  test('rejects an oversized push body with 413 before contacting the upstream', async () => {
    await withGateway({ maxBodyBytes: 64 }, async ({ gatewayUrl, requests }) => {
      const response = await fetch(`${gatewayUrl}/api/sync/remote/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: 'patients', rows: 'x'.repeat(500) })
      });
      assert.equal(response.status, 413);
      assert.equal(requests.length, 0);
    });
  });

  test('stops buffering a body that keeps arriving past the limit and never forwards it', async () => {
    await withGateway({ maxBodyBytes: 1024 }, async ({ gatewayUrl, requests }) => {
      let status: number | null = null;
      try {
        const response = await fetch(`${gatewayUrl}/api/sync/remote/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collection: 'patients', rows: 'x'.repeat(4 * 1024 * 1024) })
        });
        status = response.status;
      } catch {
        // 応答前に接続が閉じられた場合も、上流へ届いていないことが確認できればよい
      }
      assert.ok(status === null || status === 413, `unexpected status ${status}`);
      assert.equal(requests.length, 0);
    });
  });

  test('answers 502 when the upstream is down and 504 when it does not answer in time', async () => {
    await withGateway({ skipUpstream: true }, async ({ gatewayUrl }) => {
      const response = await fetch(`${gatewayUrl}/api/sync/remote/pull?collection=patients`);
      assert.equal(response.status, 502);
      assert.match((await response.json()).message, /メイン端末/);
    });
    await withGateway({
      upstreamTimeoutMs: 100,
      upstreamResponder: () => undefined
    }, async ({ gatewayUrl }) => {
      const response = await fetch(`${gatewayUrl}/api/sync/remote/pull?collection=patients`);
      assert.equal(response.status, 504);
    });
  });

  test('logs method, path, status and source but never the query, headers or body', async () => {
    await withGateway({}, async ({ gatewayUrl, logs }) => {
      const response = await fetch(`${gatewayUrl}/api/sync/remote/pull?collection=patients&secret=query-secret`, {
        headers: { Authorization: 'Bearer header-secret' }
      });
      await response.text();
      const denied = await fetch(`${gatewayUrl}/api/sync/terminals?x=denied-query`);
      await denied.text();
      assert.equal(logs.length, 2);
      assert.match(logs[0], /^GET "\/api\/sync\/remote\/pull" 200 \d+ms from /);
      assert.match(logs[1], /^GET "\/api\/sync\/terminals" 404 \d+ms from /);
      assert.equal(logs.join('\n').includes('secret'), false);
      assert.equal(logs.join('\n').includes('denied-query'), false);
    });
  });
});

describe('upstream exposure self-check', () => {
  const interfaces: NetworkInterfaceMap = {
    lo0: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' }],
    en0: [
      { address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', mac: 'aa:bb:cc:dd:ee:ff', internal: false, cidr: 'fe80::1/64', scopeid: 4 },
      { address: '192.168.0.3', netmask: '255.255.255.0', family: 'IPv4', mac: 'aa:bb:cc:dd:ee:ff', internal: false, cidr: '192.168.0.3/24' }
    ],
    en1: [{ address: '10.0.0.8', netmask: '255.0.0.0', family: 'IPv4', mac: 'aa:bb:cc:dd:ee:00', internal: false, cidr: '10.0.0.8/8' }]
  };

  test('lists only non-internal IPv4 addresses', () => {
    assert.deepEqual(listLanIPv4Addresses(interfaces), ['192.168.0.3', '10.0.0.8']);
    assert.deepEqual(listLanIPv4Addresses({}), []);
  });

  test('reports the LAN addresses where the upstream port accepts connections', async () => {
    const probed: string[] = [];
    const exposed = await findExposedUpstreamAddresses(3000, {
      interfaces,
      probe: async (host, port) => {
        probed.push(`${host}:${port}`);
        return host === '192.168.0.3';
      }
    });
    assert.deepEqual(exposed, ['192.168.0.3']);
    assert.deepEqual(probed, ['192.168.0.3:3000', '10.0.0.8:3000']);
  });

  test('reports nothing when the upstream is loopback-only', async () => {
    assert.deepEqual(await findExposedUpstreamAddresses(3000, { interfaces, probe: async () => false }), []);
  });

  test('waitForUpstream retries until the upstream answers, and gives up after the timeout', async () => {
    let calls = 0;
    const slept: number[] = [];
    const ready = await waitForUpstream('127.0.0.1', 3000, {
      timeoutMs: 10_000,
      intervalMs: 2000,
      probe: async () => ++calls >= 3,
      sleep: async (ms) => { slept.push(ms); }
    });
    assert.equal(ready, true);
    assert.equal(calls, 3);
    assert.deepEqual(slept, [2000, 2000]);

    const neverReady = await waitForUpstream('127.0.0.1', 3000, {
      timeoutMs: 4000,
      intervalMs: 2000,
      probe: async () => false,
      sleep: async () => undefined
    });
    assert.equal(neverReady, false);
  });
});
