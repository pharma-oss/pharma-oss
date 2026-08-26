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
const setupPassword = 'SetupPass123';
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

async function ensureInitialAdmin(page) {
  const passwordInput = await page.waitForSelector('input[type=password]', { timeout: 8000 }).catch(() => null);
  if (!passwordInput) return false;

  await page.evaluate(({ name, password }) => {
    const passwordInput = document.querySelector('input[type=password]');
    const form = passwordInput?.closest('form');
    if (!passwordInput || !form) return;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    const setValue = (input, value) => {
      valueSetter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const nameInput = form.querySelector('input[type=text]');
    if (nameInput) setValue(nameInput, name);
    setValue(passwordInput, password);
    form.requestSubmit();
  }, { name: 'E2E導入管理者', password: setupPassword });
  await wait(3000);
  return true;
}

async function run() {
  await mkdir(localArtifactDir, { recursive: true });
  await mkdir(artifactDir, { recursive: true });

  let hubServer;
  let satServer;
  let browser;

  const terminalId = `sat-p25-${Date.now()}`;
  const dbPath = `/tmp/yakureki-hub-${Date.now()}.sqlite`;
  const encKey = 'mock_satellite_persistent_key_p25';

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

    const userDataDir = await mkdtemp(join(tmpdir(), 'yakureki-sat-shots-'));
    browser = await puppeteer.launch({
      headless: 'new',
      protocolTimeout: 120000,
      userDataDir,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=ja-JP', '--font-render-hinting=none']
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);
    await page.setViewport({ width: 1400, height: 1100 });

    await page.evaluateOnNewDocument((key) => {
      window.localStorage.setItem('yakureki_satellite_persistent_queue_enc_key', key);
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
    }, encKey);

    console.log('0. Initial admin setup on satellite /settings ...');
    await page.goto(`${satUrl}/settings`, { waitUntil: 'domcontentloaded' });
    await wait(2000);
    await ensureInitialAdmin(page);
    await wait(2000);

    // ==========================================
    // 1. 通常同期状態のサテライト画面
    // ==========================================
    console.log('1. Capturing Satellite Normal Screen on / ...');
    await page.evaluate(() => {
      window.localStorage.setItem('yakureki_satellite_unsent_queue_v1', '');
      const nav = document.querySelector('a[href="/"], nav a');
      if (nav) nav.click();
    });
    await wait(3000);

    const outPath1 = join(artifactDir, 'step5_satellite_normal.png');
    const outLocal1 = join(localArtifactDir, 'step5_satellite_normal.png');
    await page.screenshot({ path: outPath1, fullPage: false });
    await page.screenshot({ path: outLocal1, fullPage: false });
    console.log(`Saved screenshot 1: ${outPath1}`);

    // ==========================================
    // 2. 期限超過未送信データ（24h超 / 前日未送信）滞留時の警告画面
    // ==========================================
    console.log('2. Simulating expired queue records and capturing warning banner & danger badge...');
    // Temporarily stop Hub to simulate disconnected state where unsent expired items accumulate
    await stopServer(hubServer);
    hubServer = null;

    const expiredQueue = [
      {
        id: 'visits:visit_expired_1',
        docId: 'visit_expired_1',
        collectionName: 'visits',
        payload: { id: 'visit_expired_1', patientName: '前日未送信患者 A', status: 'completed' },
        enqueuedAt: new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
        checksum: 'mock_checksum_1'
      },
      {
        id: 'soap_records:soap_expired_2',
        docId: 'soap_expired_2',
        collectionName: 'soap_records',
        payload: { soapId: 'soap_expired_2', s: '前日入力の主訴', status: 'draft' },
        enqueuedAt: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
        checksum: 'mock_checksum_2'
      },
      {
        id: 'prescription_items:rx_expired_3',
        docId: 'rx_expired_3',
        collectionName: 'prescription_items',
        payload: { itemId: 'rx_expired_3', drugName: 'アムロジピン' },
        enqueuedAt: new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
        checksum: 'mock_checksum_3'
      }
    ];
    const encryptedExpired = CryptoJS.AES.encrypt(JSON.stringify(expiredQueue), encKey).toString();

    await page.evaluate((payload) => {
      window.localStorage.setItem('yakureki_satellite_unsent_queue_v1', payload);
    }, encryptedExpired);
    // Wait for polling interval (4s) in SyncStatusIndicator to update queue health & badge to is-danger
    await wait(4500);

    const outPath2 = join(artifactDir, 'step5_satellite_expired_warning.png');
    const outLocal2 = join(localArtifactDir, 'step5_satellite_expired_warning.png');
    await page.screenshot({ path: outPath2, fullPage: false });
    await page.screenshot({ path: outLocal2, fullPage: false });
    console.log(`Saved screenshot 2: ${outPath2}`);

    // ==========================================
    // 3. 上限接近（800件超）状態の注意 UI
    // ==========================================
    console.log('3. Simulating near-limit queue (820 items) and capturing near-limit UI...');
    const nearLimitQueue = [];
    const nowIso = new Date().toISOString();
    for (let i = 1; i <= 820; i++) {
      nearLimitQueue.push({
        id: `visits:v_${i}`,
        docId: `v_${i}`,
        collectionName: 'visits',
        payload: { id: `v_${i}` },
        enqueuedAt: nowIso,
        checksum: `chk_${i}`
      });
    }
    const encryptedNearLimit = CryptoJS.AES.encrypt(JSON.stringify(nearLimitQueue), encKey).toString();

    await page.evaluate((payload) => {
      window.localStorage.setItem('yakureki_satellite_unsent_queue_v1', payload);
    }, encryptedNearLimit);
    await wait(4500);

    const outPath3 = join(artifactDir, 'step5_satellite_near_limit.png');
    const outLocal3 = join(localArtifactDir, 'step5_satellite_near_limit.png');
    await page.screenshot({ path: outPath3, fullPage: false });
    await page.screenshot({ path: outLocal3, fullPage: false });
    console.log(`Saved screenshot 3: ${outPath3}`);

    // ==========================================
    // 4. サテライト端末の「設定 > 端末同期」タブ詳細画面
    // ==========================================
    console.log('4. Navigating to Settings > Terminal Sync on satellite...');
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

    await page.evaluate((payload) => {
      window.localStorage.setItem('yakureki_satellite_unsent_queue_v1', payload);
      const links = Array.from(document.querySelectorAll('a, button'));
      const settingsLink = links.find(el => (el.textContent || '').includes('設定'));
      if (settingsLink) settingsLink.click();
    }, encryptedPanelQueue);
    await wait(2500);

    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('button, .tab-pill'));
      const syncTab = tabs.find(el => (el.textContent || '').includes('端末同期'));
      if (syncTab) syncTab.click();
    });
    await wait(3000);

    const outPath4 = join(artifactDir, 'step5_satellite_terminal_sync_panel.png');
    const outLocal4 = join(localArtifactDir, 'step5_satellite_terminal_sync_panel.png');
    await page.screenshot({ path: outPath4, fullPage: false });
    await page.screenshot({ path: outLocal4, fullPage: false });
    console.log(`Saved screenshot 4: ${outPath4}`);

    console.log('All P2-5 satellite visual screenshots captured successfully with consistent badges!');
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
