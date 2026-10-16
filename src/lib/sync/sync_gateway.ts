import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import type { IncomingHttpHeaders, IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { parseRole, parseTransportEncryption } from './sync_config.ts';
import type { PharmacySyncTransportEncryption } from './sync_config.ts';
import { TERMINAL_ID_HEADER } from './sync_http.ts';

// メイン端末(hub)の同期ゲートウェイ。
//
// Next.js 本体は `next start -H 127.0.0.1` でループバック専用に起動し、施設内LANには
// このゲートウェイだけを公開する。ゲートウェイは、サテライト端末がハブへ接続するための
// 2つの口(/api/sync/remote/pull と /api/sync/remote/push)だけを転送し、それ以外
// (画面、自機のブラウザ向けAPI、各種コネクタ)はLAN側からは到達できないようにする。
// サテライトの認証(Bearerトークン + 端末ID)は従来どおりNext側のルートが行う。
// 参照: docs/satellite_terminal_sync_plan.md

export const GATEWAY_ALLOWED_ROUTES = [
  { method: 'GET', path: '/api/sync/remote/pull' },
  { method: 'POST', path: '/api/sync/remote/push' }
] as const;

type AllowedMethod = (typeof GATEWAY_ALLOWED_ROUTES)[number]['method'];

export type GatewayRouteDecision =
  | { allow: true; method: AllowedMethod; path: string; upstreamTarget: string }
  | { allow: false; status: 404 | 405; path: string; allowedMethod?: AllowedMethod };

const MAX_TARGET_LENGTH = 2048;
export const GATEWAY_MAX_BODY_BYTES = 16 * 1024 * 1024;
export const GATEWAY_UPSTREAM_TIMEOUT_MS = 30_000;

const FORWARDED_REQUEST_HEADERS = ['authorization', 'content-type', 'accept', TERMINAL_ID_HEADER];

// 許可する (メソッド, パス) を、正規化せずに文字列として完全一致で判定する。
// URLとして解釈し直すと、`..` や `%2e`、`//` の扱いが転送先のNextと食い違う余地ができるため、
// 受け取ったパスをそのまま比較し、一致したものだけを同じ文字列で転送する。
export function decideGatewayRoute(method: string | undefined, rawTarget: string | undefined): GatewayRouteDecision {
  if (
    !rawTarget
    || rawTarget.length > MAX_TARGET_LENGTH
    || !rawTarget.startsWith('/')
    || /[\\#\u0000-\u001f\u007f]/.test(rawTarget)
  ) {
    return { allow: false, status: 404, path: '' };
  }
  const queryStart = rawTarget.indexOf('?');
  const path = queryStart === -1 ? rawTarget : rawTarget.slice(0, queryStart);
  const route = GATEWAY_ALLOWED_ROUTES.find((candidate) => candidate.path === path);
  if (!route) return { allow: false, status: 404, path };
  if (route.method !== String(method || '').toUpperCase()) {
    return { allow: false, status: 405, path, allowedMethod: route.method };
  }
  return { allow: true, method: route.method, path, upstreamTarget: rawTarget };
}

// 転送するヘッダーを許可リストで絞る(Cookie、X-Forwarded-*、Host などは渡さない)。
export function selectForwardHeaders(incoming: IncomingHttpHeaders): Record<string, string> {
  const forwarded: Record<string, string> = {};
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = incoming[name];
    if (typeof value === 'string' && value.length > 0) forwarded[name] = value;
  }
  return forwarded;
}

export interface SyncGatewayEnv {
  PHARMACY_SYNC_ROLE?: string;
  PHARMACY_SYNC_TRANSPORT_ENCRYPTION?: string;
  PHARMACY_SYNC_GATEWAY_HOST?: string;
  PHARMACY_SYNC_GATEWAY_PORT?: string;
  PHARMACY_SYNC_GATEWAY_UPSTREAM?: string;
  PHARMACY_SYNC_GATEWAY_TLS_CERT?: string;
  PHARMACY_SYNC_GATEWAY_TLS_KEY?: string;
}

export interface SyncGatewayConfig {
  host: string;
  port: number;
  upstreamHost: string;
  upstreamPort: number;
  tlsCertPath?: string;
  tlsKeyPath?: string;
  transportEncryption: PharmacySyncTransportEncryption;
}

export type SyncGatewayConfigResult =
  | { ok: true; config: SyncGatewayConfig }
  | { ok: false; message: string };

const DEFAULT_GATEWAY_HOST = '0.0.0.0';
const DEFAULT_GATEWAY_PORT = 3443;
const DEFAULT_GATEWAY_UPSTREAM = 'http://127.0.0.1:3000';
// ゲートウェイの転送先は同一端末のNextだけ。`127.0.0.1.example.com` のような名前を通さないよう、完全一致で判定する。
const UPSTREAM_HOSTS = new Set(['127.0.0.1', 'localhost']);
const LOOPBACK_LISTEN_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function resolveSyncGatewayConfig(env: SyncGatewayEnv): SyncGatewayConfigResult {
  if (parseRole(env.PHARMACY_SYNC_ROLE) !== 'hub') {
    return { ok: false, message: 'ゲートウェイはメイン端末でだけ起動できます。PHARMACY_SYNC_ROLE=hub を設定してください。' };
  }
  const transportEncryption = parseTransportEncryption(env.PHARMACY_SYNC_TRANSPORT_ENCRYPTION);

  const host = env.PHARMACY_SYNC_GATEWAY_HOST?.trim() || DEFAULT_GATEWAY_HOST;
  const portText = env.PHARMACY_SYNC_GATEWAY_PORT?.trim();
  const port = portText ? Number(portText) : DEFAULT_GATEWAY_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, message: 'PHARMACY_SYNC_GATEWAY_PORT は 1〜65535 の整数にしてください。' };
  }

  let upstreamHost: string;
  let upstreamPort: number;
  try {
    const upstream = new URL(env.PHARMACY_SYNC_GATEWAY_UPSTREAM?.trim() || DEFAULT_GATEWAY_UPSTREAM);
    upstreamHost = upstream.hostname.toLowerCase();
    upstreamPort = Number(upstream.port || 80);
    if (upstream.protocol !== 'http:' || !UPSTREAM_HOSTS.has(upstreamHost)) throw new Error('unsupported upstream');
  } catch {
    return {
      ok: false,
      message: 'PHARMACY_SYNC_GATEWAY_UPSTREAM は同一端末のNext(例: http://127.0.0.1:3000)だけを指定できます。'
    };
  }
  if (upstreamPort === port && (host === DEFAULT_GATEWAY_HOST || LOOPBACK_LISTEN_HOSTS.has(host))) {
    return { ok: false, message: 'ゲートウェイの待受ポートとNextのポートは別の値にしてください。' };
  }

  const tlsCertPath = env.PHARMACY_SYNC_GATEWAY_TLS_CERT?.trim() || undefined;
  const tlsKeyPath = env.PHARMACY_SYNC_GATEWAY_TLS_KEY?.trim() || undefined;
  if (!!tlsCertPath !== !!tlsKeyPath) {
    return { ok: false, message: 'HTTPSで公開するには PHARMACY_SYNC_GATEWAY_TLS_CERT と PHARMACY_SYNC_GATEWAY_TLS_KEY の両方を設定してください。' };
  }

  // 患者情報を扱うため、LANに公開するときはHTTPSか、本文のAES-GCM暗号化のどちらかを必須にする。
  // (サテライト側の接続先検証 isAllowedHubEndpoint と同じ規約)
  if (!LOOPBACK_LISTEN_HOSTS.has(host) && !tlsCertPath && transportEncryption !== 'aes-gcm') {
    return {
      ok: false,
      message: '施設内LANへ公開するには、HTTPS(PHARMACY_SYNC_GATEWAY_TLS_CERT/KEY)か、'
        + 'PHARMACY_SYNC_TRANSPORT_ENCRYPTION=aes-gcm のどちらかを設定してください。'
    };
  }

  return {
    ok: true,
    config: { host, port, upstreamHost, upstreamPort, tlsCertPath, tlsKeyPath, transportEncryption }
  };
}

export interface SyncGatewayHandlerOptions {
  upstreamHost: string;
  upstreamPort: number;
  maxBodyBytes?: number;
  upstreamTimeoutMs?: number;
  // 1行のログ。メソッド・パス(クエリなし)・ステータス・所要時間・接続元だけを渡す。
  // ヘッダー(トークン)・クエリ・本文は決して渡さない。
  log?: (line: string) => void;
}

class BodyTooLargeError extends Error {}

function readLimitedBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    request.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBytes) {
        // 接続を先に切ると413が届かない。以降の本文は保持せずに読み捨て、応答後にConnection: closeで閉じる。
        chunks.length = 0;
        request.removeAllListeners('data');
        request.resume();
        reject(new BodyTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
    request.on('aborted', () => reject(new Error('request aborted')));
  });
}

function sendJson(response: ServerResponse, status: number, message: string, extraHeaders: Record<string, string> = {}) {
  if (response.headersSent) {
    response.end();
    return;
  }
  const payload = Buffer.from(JSON.stringify({ message }));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  response.end(payload);
}

export function createSyncGatewayHandler(options: SyncGatewayHandlerOptions): RequestListener {
  const maxBodyBytes = options.maxBodyBytes ?? GATEWAY_MAX_BODY_BYTES;
  const upstreamTimeoutMs = options.upstreamTimeoutMs ?? GATEWAY_UPSTREAM_TIMEOUT_MS;
  const log = options.log ?? (() => undefined);

  return async (request, response) => {
    const startedAt = Date.now();
    const decision = decideGatewayRoute(request.method, request.url);
    const logPath = JSON.stringify((decision.path || '(invalid)').slice(0, 120));
    const finish = (status: number) => {
      log(`${request.method} ${logPath} ${status} ${Date.now() - startedAt}ms from ${request.socket.remoteAddress || '-'}`);
    };

    if (!decision.allow) {
      const extra: Record<string, string> = decision.allowedMethod ? { Allow: decision.allowedMethod } : {};
      sendJson(response, decision.status, 'この端末では提供していない操作です。', extra);
      finish(decision.status);
      return;
    }

    let body: Buffer | undefined;
    if (decision.method === 'POST') {
      try {
        body = await readLimitedBody(request, maxBodyBytes);
      } catch (error) {
        const status = error instanceof BodyTooLargeError ? 413 : 400;
        sendJson(response, status, status === 413 ? '同期の送信データが大きすぎます。' : '同期リクエストを読み取れませんでした。', {
          Connection: 'close'
        });
        finish(status);
        return;
      }
    }

    const headers = selectForwardHeaders(request.headers);
    if (body) headers['content-length'] = String(body.length);

    const upstreamRequest = http.request({
      host: options.upstreamHost,
      port: options.upstreamPort,
      method: decision.method,
      path: decision.upstreamTarget,
      headers,
      timeout: upstreamTimeoutMs
    });
    upstreamRequest.on('timeout', () => upstreamRequest.destroy(new Error('upstream timeout')));
    upstreamRequest.on('response', (upstreamResponse) => {
      const status = upstreamResponse.statusCode || 502;
      const responseHeaders: Record<string, string> = { 'Cache-Control': 'no-store' };
      const contentType = upstreamResponse.headers['content-type'];
      if (typeof contentType === 'string') responseHeaders['Content-Type'] = contentType;
      response.writeHead(status, responseHeaders);
      upstreamResponse.pipe(response);
      upstreamResponse.on('end', () => finish(status));
      upstreamResponse.on('error', () => response.destroy());
    });
    upstreamRequest.on('error', (error) => {
      const timedOut = error.message === 'upstream timeout';
      const status = timedOut ? 504 : 502;
      sendJson(response, status, 'メイン端末の同期サービスから応答がありません。');
      finish(status);
    });
    upstreamRequest.end(body);
  };
}

// 起動時の自己点検用。Next が全インターフェースで待ち受けていると、ゲートウェイを通らずに
// LANから直接届いてしまう。この端末のLAN側IPv4アドレス宛てにNextのポートへ接続できるかを調べる。

export type NetworkInterfaceMap = ReturnType<typeof os.networkInterfaces>;

export function listLanIPv4Addresses(interfaces: NetworkInterfaceMap = os.networkInterfaces()): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}

export function probeTcpConnect(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const settle = (connected: boolean) => {
      socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(timeoutMs, () => settle(false));
    socket.once('connect', () => settle(true));
    socket.once('error', () => settle(false));
  });
}

export type TcpProbe = (host: string, port: number) => Promise<boolean>;

export async function findExposedUpstreamAddresses(
  port: number,
  deps: { interfaces?: NetworkInterfaceMap; probe?: TcpProbe } = {}
): Promise<string[]> {
  const probe = deps.probe ?? probeTcpConnect;
  const exposed: string[] = [];
  for (const address of listLanIPv4Addresses(deps.interfaces)) {
    if (await probe(address, port)) exposed.push(address);
  }
  return exposed;
}

export async function waitForUpstream(
  host: string,
  port: number,
  options: { timeoutMs: number; intervalMs?: number; probe?: TcpProbe; sleep?: (ms: number) => Promise<void> }
): Promise<boolean> {
  const probe = options.probe ?? probeTcpConnect;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const intervalMs = options.intervalMs ?? 2000;
  let waitedMs = 0;
  for (;;) {
    if (await probe(host, port)) return true;
    if (waitedMs >= options.timeoutMs) return false;
    await sleep(intervalMs);
    waitedMs += intervalMs;
  }
}
