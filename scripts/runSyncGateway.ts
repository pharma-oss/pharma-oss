// メイン端末(hub)の同期ゲートウェイを起動する。
//   1. Next を `npm run start`(hub は自動でループバック専用)で起動しておく
//   2. このスクリプトを `npm run sync:gateway` で起動する
// サテライト端末の接続先(PHARMACY_SYNC_HUB_ENDPOINT)は、このゲートウェイのURLにする。
// 参照: docs/satellite_terminal_sync_plan.md、src/lib/sync/sync_gateway.ts
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import {
  createSyncGatewayHandler,
  findExposedUpstreamAddresses,
  resolveSyncGatewayConfig,
  waitForUpstream
} from '../src/lib/sync/sync_gateway.ts';
import { loadEnvFiles } from './lib/env_files.ts';

const UPSTREAM_WAIT_TIMEOUT_MS = 120_000;

function fail(message: string): never {
  console.error(`[sync-gateway] ${message}`);
  process.exit(1);
}

function log(line: string) {
  console.log(`[sync-gateway] ${new Date().toISOString()} ${line}`);
}

async function main() {
  loadEnvFiles();
  const env = process.env;
  const configResult = resolveSyncGatewayConfig({
    PHARMACY_SYNC_ROLE: env.PHARMACY_SYNC_ROLE,
    PHARMACY_SYNC_TRANSPORT_ENCRYPTION: env.PHARMACY_SYNC_TRANSPORT_ENCRYPTION,
    PHARMACY_SYNC_GATEWAY_HOST: env.PHARMACY_SYNC_GATEWAY_HOST,
    PHARMACY_SYNC_GATEWAY_PORT: env.PHARMACY_SYNC_GATEWAY_PORT,
    PHARMACY_SYNC_GATEWAY_UPSTREAM: env.PHARMACY_SYNC_GATEWAY_UPSTREAM,
    PHARMACY_SYNC_GATEWAY_TLS_CERT: env.PHARMACY_SYNC_GATEWAY_TLS_CERT,
    PHARMACY_SYNC_GATEWAY_TLS_KEY: env.PHARMACY_SYNC_GATEWAY_TLS_KEY
  });
  if (!configResult.ok) fail(configResult.message);
  const config = configResult.config;

  let tls: { cert: Buffer; key: Buffer } | undefined;
  if (config.tlsCertPath && config.tlsKeyPath) {
    try {
      tls = { cert: readFileSync(config.tlsCertPath), key: readFileSync(config.tlsKeyPath) };
    } catch {
      fail('HTTPSの証明書または秘密鍵のファイルを読み込めません。PHARMACY_SYNC_GATEWAY_TLS_CERT / _KEY のパスを確認してください。');
    }
  }

  log(`Nextの起動を待っています(${config.upstreamHost}:${config.upstreamPort})。`);
  const upstreamReady = await waitForUpstream(config.upstreamHost, config.upstreamPort, { timeoutMs: UPSTREAM_WAIT_TIMEOUT_MS });
  if (!upstreamReady) {
    fail(`${UPSTREAM_WAIT_TIMEOUT_MS / 1000}秒以内にNextへ接続できませんでした。先に \`npm run start\` を起動してください。`);
  }

  // Next がLAN側のアドレスでも待ち受けていると、ゲートウェイを通らずに届いてしまう。起動を止める。
  const exposed = await findExposedUpstreamAddresses(config.upstreamPort);
  if (exposed.length > 0) {
    fail(
      `Nextがこの端末のLAN側アドレス(${exposed.join(', ')})でも待ち受けています。`
      + '\`npm run start\`(hub は自動でループバック専用)でNextを起動し直してから、ゲートウェイを起動してください。`next start` を直接使っていないか確認してください。'
    );
  }

  const handler = createSyncGatewayHandler({
    upstreamHost: config.upstreamHost,
    upstreamPort: config.upstreamPort,
    log
  });
  const server = tls
    ? https.createServer({ cert: tls.cert, key: tls.key, minVersion: 'TLSv1.2' }, handler)
    : http.createServer(handler);

  server.on('error', (error) => fail(`待受を開始できません: ${error.message}`));
  server.listen(config.port, config.host, () => {
    log(`同期ゲートウェイを開始しました(${tls ? 'HTTPS' : 'HTTP'} ${config.host}:${config.port} → ${config.upstreamHost}:${config.upstreamPort})。`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
