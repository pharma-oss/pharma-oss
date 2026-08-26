import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import CryptoJS from 'crypto-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NEXT_BIN = join(__dirname, '..', 'node_modules', '.bin', 'next');

const hubPort = 3410;
const satPort = 3412;
const hubUrl = `http://127.0.0.1:${hubPort}`;
const satUrl = `http://127.0.0.1:${satPort}`;
const artifactDir = '/Users/takeaki/.gemini/antigravity-ide/brain/7ad7cc77-8091-43b0-8626-4a614821a8f9';
const localArtifactDir = join(process.cwd(), 'artifacts', 'p2-5-ui-verification');

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function startServer(name, port, env) {
  const child = spawn(NEXT_BIN, ['start', '-p', String(port)], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  let output = '';
  child.stdout?.on('data', (chunk) => { output += chunk; });
  child.stderr?.on('data', (chunk) => { output += chunk; });
  return {
    name,
    child,
    getOutput: () => output
  };
}

async function stopServer(server) {
  if (!server?.child?.pid) return;
  const pid = server.child.pid;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      server.child.kill('SIGTERM');
    } catch {}
  }
}

async function waitForServerReady(url, expectedRole) {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${url}/api/sync/config`);
      if (res.ok) {
        const data = await res.json();
        if (!expectedRole || data.role === expectedRole) {
          return true;
        }
      }
    } catch {}
    await wait(1000);
  }
  throw new Error(`Server at ${url} failed to become ready`);
}

async function run() {
  await mkdir(localArtifactDir, { recursive: true });
  await mkdir(artifactDir, { recursive: true });

  let hubServer;
  let satServer;
  let browser;

  const terminalId = `sat-p25-${Date.now()}`;
  const dbPath = `/tmp/yakureki-hub-${Date.now()}.sqlite`;

  try {
    console.log('Starting Next Hub server on port', hubPort);
    hubServer = startServer('hub', hubPort, {
      PORT: String(hubPort),
      PHARMACY_SYNC_ROLE: 'hub',
      PHARMACY_SYNC_HUB_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      PHARMACY_SYNC_HUB_DB_PATH: dbPath
    });
    await waitForServerReady(hubUrl, 'hub');
    console.log('Hub server is ready!');

    // Register satellite terminal in Hub to get token
    console.log('Registering satellite terminal in Hub...');
    const registerRes = await fetch(`${hubUrl}/api/sync/terminals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, label: '2階 薬歴入力サテライト' })
    });
    const regData = await registerRes.json();
    const token = regData.token;
    console.log('Registered satellite terminal, token received:', token ? 'OK' : 'FAIL');

    console.log('Starting Next Satellite server on port', satPort);
    satServer = startServer('satellite', satPort, {
      PORT: String(satPort),
      PHARMACY_SYNC_ROLE: 'satellite',
      PHARMACY_SYNC_HUB_ENDPOINT: hubUrl,
      PHARMACY_SYNC_TERMINAL_ID: terminalId,
      PHARMACY_SYNC_TERMINAL_TOKEN: token
    });
    await waitForServerReady(satUrl, 'satellite');
    console.log('Satellite server is ready!');

    const userDataDir = await mkdtemp(join(tmpdir(), 'yakureki-sat-panel-'));
    browser = await puppeteer.launch({
      headless: 'new',
      userDataDir,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=ja-JP', '--font-render-hinting=none']
    });

    const encKey = 'mock_satellite_persistent_key_p25';
    const panelQueue = [
      {
        id: 'visits:visit_101',
        docId: 'visit_101',
        collectionName: 'visits',
        payload: { id: 'visit_101', patientName: '佐藤 一郎', status: 'completed' },
        enqueuedAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
        checksum: 'chk_101'
      },
      {
        id: 'visits:visit_102',
        docId: 'visit_102',
        collectionName: 'visits',
        payload: { id: 'visit_102', patientName: '鈴木 花子', status: 'completed' },
        enqueuedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        checksum: 'chk_102'
      },
      {
        id: 'soap_records:soap_201',
        docId: 'soap_201',
        collectionName: 'soap_records',
        payload: { soapId: 'soap_201', s: '血圧安定。残薬なし。' },
        enqueuedAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
        checksum: 'chk_201'
      }
    ];
    const encryptedPanelQueue = CryptoJS.AES.encrypt(JSON.stringify(panelQueue), encKey).toString();

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1100 });

    await page.evaluateOnNewDocument(({ key, queue }) => {
      window.sessionStorage.setItem('pharmacy_os_current_user', JSON.stringify({
        userId: 'u_admin',
        name: '管理者 薬剤師',
        role: 'admin'
      }));
      window.localStorage.setItem('yakureki_satellite_persistent_queue_enc_key', key);
      window.localStorage.setItem('yakureki_satellite_unsent_queue_v1', queue);

      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function patchedGetItem(k) {
        if (
          String(k).startsWith('yakureki:pre-login-tour') ||
          String(k).startsWith('yakureki:workflow-tutorial') ||
          String(k).startsWith('yakureki:first-run-tutorial')
        ) {
          return '2026-01-01T00:00:00.000Z';
        }
        return originalGetItem.call(this, k);
      };
    }, { key: encKey, queue: encryptedPanelQueue });

    console.log('Navigating to Settings > Terminal Sync on satellite...');
    await page.goto(`${satUrl}/settings?tab=terminalSync`, { waitUntil: 'domcontentloaded' });
    await wait(4000);

    const outPath4 = join(artifactDir, 'step5_satellite_terminal_sync_panel.png');
    const outLocal4 = join(localArtifactDir, 'step5_satellite_terminal_sync_panel.png');
    await page.screenshot({ path: outPath4, fullPage: false });
    await page.screenshot({ path: outLocal4, fullPage: false });
    console.log(`Saved screenshot 4: ${outPath4}`);

    console.log('Satellite Terminal Sync Panel screenshot captured successfully!');
  } finally {
    if (browser) await browser.close();
    await stopServer(satServer);
    await stopServer(hubServer);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
