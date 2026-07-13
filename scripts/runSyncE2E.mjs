// サテライト端末同期の2プロセスE2E。
// 事前に `npm run build` が必要(両サーバーが同じ .next を読む)。
//   1. メイン端末(hub)サーバーを起動し、サテライト端末を登録してトークンを得る
//   2. サテライトサーバーを起動し、自機API経由でハブへ push/pull できることを確認する
//   3. 競合(古い状態を前提にした更新)がハブ優先で記録されることを確認する
//   4. トークン失効後にサテライトが拒否されることを確認する
// 参照: docs/satellite_terminal_sync_plan.md

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HUB_PORT = Number(process.env.YAKUREKI_SYNC_E2E_HUB_PORT || 3401);
const SATELLITE_PORT = Number(process.env.YAKUREKI_SYNC_E2E_SATELLITE_PORT || 3402);
const HUB_URL = `http://127.0.0.1:${HUB_PORT}`;
const SATELLITE_URL = `http://127.0.0.1:${SATELLITE_PORT}`;
const SERVER_READY_TIMEOUT_MS = 120_000;

function assertOk(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function startServer(name, port, env) {
  const child = spawn('npx', ['next', 'start', '-p', String(port)], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
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
  server.child.kill('SIGTERM');
  await wait(500);
  if (server.child.exitCode === null) {
    server.child.kill('SIGKILL');
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
    await stopServer(satelliteServer);
    await stopServer(hubServer);
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[sync-e2e] FAILED:', error.message || error);
  process.exit(1);
});
