// サテライト端末同期の2プロセスE2E。
// 事前に `npm run build` が必要(両サーバーが同じ .next を読む)。
//   1. メイン端末(hub)サーバーを起動し、サテライト端末を登録してトークンを得る
//   2. サテライトサーバーを起動し、自機API経由でハブへ push/pull できることを確認する
//   3. 競合(古い状態を前提にした更新)がハブ優先で記録されることを確認する
//   4. トークン失効後にサテライトが拒否されることを確認する
//   5. 同期ゲートウェイ(サテライトに公開する唯一の口)が、/api/sync/remote/* だけを通し、
//      それ以外を遮断すること、Nextがループバック専用でなければ起動を拒否することを確認する
// 参照: docs/satellite_terminal_sync_plan.md

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NEXT_BIN = join(__dirname, '..', 'node_modules', '.bin', 'next');
const TSX_BIN = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
const GATEWAY_SCRIPT = join(__dirname, 'runSyncGateway.ts');

const HUB_PORT = Number(process.env.YAKUREKI_SYNC_E2E_HUB_PORT || 3401);
const SATELLITE_PORT = Number(process.env.YAKUREKI_SYNC_E2E_SATELLITE_PORT || 3402);
const GATEWAY_PORT = Number(process.env.YAKUREKI_SYNC_E2E_GATEWAY_PORT || 3403);
const REFUSAL_GATEWAY_PORT = Number(process.env.YAKUREKI_SYNC_E2E_REFUSAL_GATEWAY_PORT || 3404);
const HUB_URL = `http://127.0.0.1:${HUB_PORT}`;
const SATELLITE_URL = `http://127.0.0.1:${SATELLITE_PORT}`;
const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`;
const SERVER_READY_TIMEOUT_MS = 120_000;
// mainの各ステップが正常に失敗/成功しても、プロセスツリーの残骸(next startが
// forkするnext-serverワーカー等)でイベントループが生き続けてスクリプトが
// 終了しないケースへの保険。CIのジョブタイムアウト(cancelled=ハング扱いで
// 原因が分かりにくい)より先に、必ず失敗として終了させる。
const HARD_TIMEOUT_MS = 4 * 60_000;

function assertOk(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function startProcess(name, command, args, env) {
  // npx経由だとspawnした子は"npx"自体になり、実際にHTTPを待ち受ける
  // next-serverはさらにその子(孫プロセス)になる。child.kill()は直接の
  // 子にしかシグナルを送らないため、npxだけ死んでnext-serverが残る
  // (実際にCIでオーファン化して25分のジョブタイムアウトまでハングした)。
  // next バイナリを直接spawnし、かつ detached: true で新しいプロセスグループの
  // リーダーにすることで、停止時に -pid でグループ全体へシグナルを送れるようにする。
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  return {
    name,
    child,
    getOutput: () => output
  };
}

// Next は運用の推奨どおりループバック専用(-H 127.0.0.1)で起動する。
function startServer(name, port, env) {
  return startProcess(name, NEXT_BIN, ['start', '-H', '127.0.0.1', '-p', String(port)], env);
}

function startGateway(name, port, upstreamPort, env = {}) {
  return startProcess(name, TSX_BIN, [GATEWAY_SCRIPT], {
    PHARMACY_SYNC_ROLE: 'hub',
    PHARMACY_SYNC_GATEWAY_HOST: '127.0.0.1',
    PHARMACY_SYNC_GATEWAY_PORT: String(port),
    PHARMACY_SYNC_GATEWAY_UPSTREAM: `http://127.0.0.1:${upstreamPort}`,
    ...env
  });
}

async function waitForGateway(baseUrl, server) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      // 許可リスト外のパスは常に404。応答が返ればゲートウェイは待受中。
      const response = await fetch(`${baseUrl}/ready-check`);
      if (response.status === 404) return;
    } catch {
      // まだ起動していない
    }
    await wait(500);
  }
  throw new Error(`${server.name} が時間内に起動しませんでした。\n--- output ---\n${server.getOutput().slice(-4000)}`);
}

async function waitForExit(server, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) return server.child.exitCode;
    await wait(250);
  }
  return null;
}

function hasLanIPv4Address() {
  return Object.values(networkInterfaces()).some((entries) => (entries || []).some((entry) => entry.family === 'IPv4' && !entry.internal));
}

async function waitForRole(baseUrl, expectedRole, server) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/sync/config`);
      if (response.ok) {
        const body = await response.json();
        assertOk(
          body.role === expectedRole,
          `${baseUrl} の役割が ${expectedRole} ではなく ${body.role} です(env設定を確認)。`
        );
        return;
      }
    } catch {
      // まだ起動していない
    }
    await wait(1000);
  }
  throw new Error(`${server.name} が時間内に起動しませんでした。\n--- server output ---\n${server.getOutput().slice(-4000)}`);
}

async function stopServer(server) {
  if (!server) return;
  const pid = server.child.pid;
  if (!pid) return;
  const signalGroup = (signal) => {
    try {
      // 負のPIDでプロセスグループ全体(next startが起動するnext-serverワーカーを含む)へ送る。
      process.kill(-pid, signal);
    } catch {
      // グループが既に消えている、または権限がない場合は個別プロセスへフォールバック
      try {
        server.child.kill(signal);
      } catch {
        // 既に終了済み
      }
    }
  };
  signalGroup('SIGTERM');
  await wait(1000);
  if (server.child.exitCode === null) {
    signalGroup('SIGKILL');
    await wait(300);
  }
}

async function main() {
  const workDir = await mkdtemp(join(tmpdir(), 'yakureki-sync-e2e-'));
  const hubEnv = {
    PHARMACY_SYNC_ROLE: 'hub',
    PHARMACY_SYNC_HUB_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    PHARMACY_SYNC_HUB_DB_PATH: join(workDir, 'sync_hub.sqlite')
  };

  let hubServer;
  let satelliteServer;
  let gatewayServer;
  let refusalGateway;
  let exposedListener;
  try {
    hubServer = startServer('hub', HUB_PORT, hubEnv);
    await waitForRole(HUB_URL, 'hub', hubServer);
    console.log('[sync-e2e] hub server ready');

    // サテライト端末を登録してトークンを得る
    const registerResponse = await fetch(`${HUB_URL}/api/sync/terminals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId: 'satellite-e2e', label: 'E2Eサテライト' })
    });
    assertOk(registerResponse.status === 201, `端末登録に失敗: HTTP ${registerResponse.status}`);
    const { token } = await registerResponse.json();
    assertOk(typeof token === 'string' && token.length > 0, '端末トークンが発行されていません。');
    console.log('[sync-e2e] terminal registered');

    satelliteServer = startServer('satellite', SATELLITE_PORT, {
      PHARMACY_SYNC_ROLE: 'satellite',
      PHARMACY_SYNC_HUB_ENDPOINT: HUB_URL,
      PHARMACY_SYNC_TERMINAL_ID: 'satellite-e2e',
      PHARMACY_SYNC_TERMINAL_TOKEN: token
    });
    await waitForRole(SATELLITE_URL, 'satellite', satelliteServer);
    console.log('[sync-e2e] satellite server ready');

    // サテライト経由の push がハブへ届く
    const pushResponse = await fetch(`${SATELLITE_URL}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'patients',
        rows: [{
          docId: 'e2e-p1',
          newDocumentState: { patientId: 'e2e-p1', name: 'E2E太郎', kana: 'イーツーイータロウ', birthDate: '1990-01-01', _deleted: false }
        }]
      })
    });
    assertOk(pushResponse.status === 200, `サテライト経由のpushに失敗: HTTP ${pushResponse.status}`);
    const pushBody = await pushResponse.json();
    assertOk(Array.isArray(pushBody.conflicts) && pushBody.conflicts.length === 0, '初回pushで競合が返りました。');

    const hubPull = await (await fetch(`${HUB_URL}/api/sync/pull?collection=patients&checkpoint=0`)).json();
    assertOk(hubPull.documents.length === 1 && hubPull.documents[0].patientId === 'e2e-p1', 'ハブに患者が集約されていません。');
    console.log('[sync-e2e] satellite push -> hub store OK');

    const satellitePull = await (await fetch(`${SATELLITE_URL}/api/sync/pull?collection=patients&checkpoint=0`)).json();
    assertOk(satellitePull.documents.length === 1, 'サテライト経由のpullで患者を取得できません。');
    console.log('[sync-e2e] satellite pull (via hub) OK');

    // 同期ゲートウェイ: サテライトに公開する口は /api/sync/remote/{pull,push} だけ
    gatewayServer = startGateway('gateway', GATEWAY_PORT, HUB_PORT);
    await waitForGateway(GATEWAY_URL, gatewayServer);
    const viaGateway = await fetch(`${GATEWAY_URL}/api/sync/remote/pull?collection=patients&checkpoint=0&batchSize=10`, {
      headers: { Authorization: `Bearer ${token}`, 'x-yakureki-terminal-id': 'satellite-e2e' }
    });
    assertOk(viaGateway.status === 200, `ゲートウェイ経由のpullに失敗: HTTP ${viaGateway.status}`);
    assertOk((await viaGateway.json()).documents.length === 1, 'ゲートウェイ経由で患者を取得できません。');
    const viaGatewayWithoutToken = await fetch(`${GATEWAY_URL}/api/sync/remote/pull?collection=patients&checkpoint=0`);
    assertOk(viaGatewayWithoutToken.status === 401, `トークンなしのpullが通りました: HTTP ${viaGatewayWithoutToken.status}`);
    for (const [method, path] of [
      ['GET', '/api/sync/pull?collection=patients&checkpoint=0'],
      ['POST', '/api/sync/push'],
      ['GET', '/api/sync/config'],
      ['GET', '/api/sync/terminals'],
      ['POST', '/api/sync/terminals'],
      ['GET', '/api/sync/conflicts'],
      ['GET', '/']
    ]) {
      const blocked = await fetch(`${GATEWAY_URL}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify({ terminalId: 'gateway-probe', label: 'x' }) : undefined
      });
      assertOk(blocked.status === 404, `ゲートウェイが許可リスト外を遮断していません: ${method} ${path} -> HTTP ${blocked.status}`);
    }
    const terminalsAfterProbe = await (await fetch(`${HUB_URL}/api/sync/terminals`)).json();
    assertOk(
      !JSON.stringify(terminalsAfterProbe).includes('gateway-probe'),
      'ゲートウェイ経由で端末が登録されました。'
    );
    console.log('[sync-e2e] gateway forwards /api/sync/remote/* only OK');

    // Nextがループバック専用でない(LAN側アドレスでも待受)場合、ゲートウェイは起動を拒否する
    if (hasLanIPv4Address()) {
      exposedListener = net.createServer();
      await new Promise((resolve) => exposedListener.listen(0, '0.0.0.0', resolve));
      const exposedPort = exposedListener.address().port;
      refusalGateway = startGateway('refusal-gateway', REFUSAL_GATEWAY_PORT, exposedPort);
      const exitCode = await waitForExit(refusalGateway, 30_000);
      assertOk(exitCode === 1, `Nextが全インターフェースで待受でもゲートウェイが起動しました(exit ${exitCode})。`);
      assertOk(refusalGateway.getOutput().includes('LAN側アドレス'), 'ゲートウェイの拒否理由が出力されていません。');
      console.log('[sync-e2e] gateway refuses to start when upstream is exposed to LAN OK');
    } else {
      console.log('[sync-e2e] LAN側IPv4アドレスが無いため、露出検知の確認はスキップしました');
    }

    // 競合: 古い状態を前提にした更新はハブ優先で拒否・記録される
    const currentState = hubPull.documents[0];
    const winResponse = await fetch(`${SATELLITE_URL}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'patients',
        rows: [{
          docId: 'e2e-p1',
          newDocumentState: { ...currentState, name: '勝った更新' },
          assumedMasterState: currentState
        }]
      })
    });
    assertOk((await winResponse.json()).conflicts.length === 0, '正常な更新が競合扱いになりました。');

    const loseResponse = await fetch(`${SATELLITE_URL}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'patients',
        rows: [{
          docId: 'e2e-p1',
          newDocumentState: { ...currentState, name: '負けた更新' },
          assumedMasterState: currentState
        }]
      })
    });
    const loseBody = await loseResponse.json();
    assertOk(loseBody.conflicts.length === 1, '古い状態からの更新が競合として返っていません。');

    const conflicts = await (await fetch(`${HUB_URL}/api/sync/conflicts?resolved=false`)).json();
    assertOk(conflicts.conflicts.length === 1, 'ハブの競合ログに記録されていません。');
    const masterAfter = await (await fetch(`${HUB_URL}/api/sync/pull?collection=patients&checkpoint=0`)).json();
    const masterDoc = masterAfter.documents.find((doc) => doc.patientId === 'e2e-p1');
    assertOk(masterDoc.name === '勝った更新', 'ハブの正本が負けた更新で上書きされています。');
    console.log('[sync-e2e] conflict recorded, hub master preserved OK');

    // トークン失効後はサテライトが拒否される
    const revokeResponse = await fetch(`${HUB_URL}/api/sync/terminals/satellite-e2e`, { method: 'DELETE' });
    assertOk(revokeResponse.status === 200, `端末失効に失敗: HTTP ${revokeResponse.status}`);
    const revokedPush = await fetch(`${SATELLITE_URL}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'patients',
        rows: [{ docId: 'e2e-p2', newDocumentState: { patientId: 'e2e-p2', name: '拒否されるはず', kana: 'キョヒ', birthDate: '1990-01-01', _deleted: false } }]
      })
    });
    assertOk(revokedPush.status === 401, `失効済み端末のpushが拒否されていません: HTTP ${revokedPush.status}`);
    console.log('[sync-e2e] revoked terminal rejected OK');

    console.log('[sync-e2e] all checks passed');
  } finally {
    if (exposedListener) exposedListener.close();
    await stopServer(refusalGateway);
    await stopServer(gatewayServer);
    await stopServer(satelliteServer);
    await stopServer(hubServer);
    await rm(workDir, { recursive: true, force: true });
  }
}

// main()自体がハングした場合(ネットワーク待ちの取りこぼし等)でも、CIのジョブタイムアウト
// (原因不明の"cancelled"になり調査しづらい)より先に、必ずエラーとして終了させる。
// 実行中にプロセスがまだ生きていればここで強制終了するため、hub/satelliteサーバーの
// 停止漏れがあっても最終的にはプロセスツリーごと片付く。
const hardTimeout = setTimeout(() => {
  console.error(`[sync-e2e] FAILED: ${HARD_TIMEOUT_MS / 1000}秒以内に完了しませんでした(ハング検知)。`);
  process.exit(1);
}, HARD_TIMEOUT_MS);
hardTimeout.unref?.();

main()
  .then(() => clearTimeout(hardTimeout))
  .catch((error) => {
    clearTimeout(hardTimeout);
    console.error('[sync-e2e] FAILED:', error.message || error);
    process.exit(1);
  });
