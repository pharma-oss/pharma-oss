import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import CryptoJS from 'crypto-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NEXT_BIN = join(__dirname, '..', 'node_modules', '.bin', 'next');

const hubPort = 3420;
const satPort = 3422;
const hubUrl = `http://127.0.0.1:${hubPort}`;
const satUrl = `http://127.0.0.1:${satPort}`;
const setupPassword = 'SetupPass123';
const artifactDir = '/Users/takeaki/.gemini/antigravity-ide/brain/7ad7cc77-8091-43b0-8626-4a614821a8f9';
const localArtifactDir = join(process.cwd(), 'artifacts', 'p2-4-ui-verification');
const encKey = 'mock_satellite_persistent_key_123';

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

async function seedOnboardingData(page) {
  await page.waitForFunction(() => typeof window.__yakurekiSeedOnboardingE2E === 'function', { timeout: 10000 }).catch(() => null);
  await page.evaluate(async () => {
    if (typeof window.__yakurekiSeedOnboardingE2E === 'function') {
      return await window.__yakurekiSeedOnboardingE2E();
    }
  });
}

async function run() {
  await mkdir(localArtifactDir, { recursive: true });
  await mkdir(artifactDir, { recursive: true });

  let hubServer;
  let satServer;
  let browser;

  const terminalId = `sat-p24-${Date.now()}`;
  const dbPath = `/tmp/yakureki-hub-p24-${Date.now()}.sqlite`;
  const hubKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  try {
    console.log('[1/5] Starting Hub server...');
    hubServer = startServer('Hub', hubPort, {
      PORT: String(hubPort),
      PHARMACY_SYNC_ROLE: 'hub',
      PHARMACY_SYNC_HUB_ENCRYPTION_KEY: hubKey,
      PHARMACY_SYNC_HUB_DB_PATH: dbPath
    });
    await waitForServerReady(hubUrl, 'hub');

    console.log('[2/5] Registering terminal on Hub...');
    const registerRes = await fetch(`${hubUrl}/api/sync/terminals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, label: '調剤室サテライト' })
    });
    if (!registerRes.ok) throw new Error('Terminal registration failed');
    const { token: terminalToken } = await registerRes.json();

    console.log('[3/5] Starting Satellite server...');
    satServer = startServer('Satellite', satPort, {
      PORT: String(satPort),
      PHARMACY_SYNC_ROLE: 'satellite',
      PHARMACY_SYNC_HUB_ENDPOINT: hubUrl,
      PHARMACY_SYNC_TERMINAL_ID: terminalId,
      PHARMACY_SYNC_TERMINAL_TOKEN: terminalToken
    });
    await waitForServerReady(satUrl, 'satellite');

    console.log('[4/5] Launching Puppeteer...');
    const userDataDir = await mkdtemp(join(tmpdir(), 'yakureki-p24-browser-'));
    browser = await puppeteer.launch({
      headless: 'new',
      protocolTimeout: 120000,
      userDataDir,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=ja-JP', '--font-render-hinting=none']
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);
    await page.setViewport({ width: 1400, height: 1000 });

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
    await seedOnboardingData(page);
    await wait(2000);

    // -------------------------------------------------------------
    // Screen 1: Online Synced State
    // -------------------------------------------------------------
    console.log('Capturing Screen 1: Online Synced...');
    await page.evaluate(() => {
      const nav = document.querySelector('a[href="/"], nav a');
      if (nav) nav.click();
    });
    await wait(3000);

    const path1Local = join(localArtifactDir, 'step4_satellite_online_synced.png');
    const path1Artifact = join(artifactDir, 'step4_satellite_online_synced.png');
    await page.screenshot({ path: path1Local, fullPage: false });
    await page.screenshot({ path: path1Artifact, fullPage: false });
    console.log('Saved Screen 1:', path1Local);

    // -------------------------------------------------------------
    // Screen 2: Hub Offline Login (Offline Auth Mode)
    // -------------------------------------------------------------
    console.log('Capturing Screen 2: Offline Login Mode with Yellow Banner...');
    await stopServer(hubServer);
    hubServer = null;
    await wait(5000); // Wait for reachability probe to update status and trigger offline auth mode

    const path2Local = join(localArtifactDir, 'step4_satellite_offline_login.png');
    const path2Artifact = join(artifactDir, 'step4_satellite_offline_login.png');
    await page.screenshot({ path: path2Local, fullPage: false });
    await page.screenshot({ path: path2Artifact, fullPage: false });
    console.log('Saved Screen 2:', path2Local);

    // -------------------------------------------------------------
    // Screen 3: Revoked Terminal Blocked (Tombstone Lock Screen)
    // -------------------------------------------------------------
    console.log('Capturing Screen 3: Revoked Terminal Blocked (Tombstone)...');
    await page.evaluate(() => {
      window.localStorage.setItem('yakureki_satellite_revocation_tombstone', 'true');
      window.localStorage.removeItem('yakureki_satellite_offline_auth_cache_v1');
    });
    await wait(3000);

    const path3Local = join(localArtifactDir, 'step4_satellite_revoked_offline_blocked.png');
    const path3Artifact = join(artifactDir, 'step4_satellite_revoked_offline_blocked.png');
    await page.screenshot({ path: path3Local, fullPage: false });
    await page.screenshot({ path: path3Artifact, fullPage: false });
    console.log('Saved Screen 3:', path3Local);

    // -------------------------------------------------------------
    // Screen 4: Standby Hub Switch in Settings Tab
    // -------------------------------------------------------------
    console.log('Capturing Screen 4: Standby Hub UI & Queue Breakdown...');
    const issuedAt = new Date().toISOString();
    const standbyEndpoint = 'https://standby-hub.local:3000';
    const message = `${standbyEndpoint.trim().toLowerCase()}|${issuedAt.trim()}`;
    const signature = CryptoJS.HmacSHA256(message, terminalToken).toString(CryptoJS.enc.Hex);

    const dummyQueue = [
      { id: 'patients:p1', collectionName: 'patients', state: { patientId: 'p1' }, checksum: 'abc', enqueuedAt: new Date().toISOString() },
      { id: 'visits:v1', collectionName: 'visits', state: { visitId: 'v1' }, checksum: 'abc', enqueuedAt: new Date().toISOString() },
      { id: 'prescription_items:rx1', collectionName: 'prescription_items', state: { id: 'rx1' }, checksum: 'abc', enqueuedAt: new Date().toISOString() },
      { id: 'prescription_items:rx2', collectionName: 'prescription_items', state: { id: 'rx2' }, checksum: 'abc', enqueuedAt: new Date().toISOString() },
      { id: 'prescription_items:rx3', collectionName: 'prescription_items', state: { id: 'rx3' }, checksum: 'abc', enqueuedAt: new Date().toISOString() },
      { id: 'drug_stocks:s1', collectionName: 'drug_stocks', state: { id: 's1' }, checksum: 'abc', enqueuedAt: new Date().toISOString() },
      { id: 'drug_stocks:s2', collectionName: 'drug_stocks', state: { id: 's2' }, checksum: 'abc', enqueuedAt: new Date().toISOString() },
      { id: 'drug_stocks:s3', collectionName: 'drug_stocks', state: { id: 's3' }, checksum: 'abc', enqueuedAt: new Date().toISOString() },
      { id: 'alerts:a1', collectionName: 'alerts', state: { alertId: 'a1' }, checksum: 'abc', enqueuedAt: new Date().toISOString() },
      { id: 'soap_records:sp1', collectionName: 'soap_records', state: { soapId: 'sp1' }, checksum: 'abc', enqueuedAt: new Date().toISOString() },
      { id: 'medication_guidances:g1', collectionName: 'medication_guidances', state: { guidanceId: 'g1' }, checksum: 'abc', enqueuedAt: new Date().toISOString() },
      { id: 'audit_logs:l1', collectionName: 'audit_logs', state: { logId: 'l1' }, checksum: 'abc', enqueuedAt: new Date().toISOString() },
      { id: 'audit_logs:l2', collectionName: 'audit_logs', state: { logId: 'l2' }, checksum: 'abc', enqueuedAt: new Date().toISOString() },
      { id: 'audit_logs:l3', collectionName: 'audit_logs', state: { logId: 'l3' }, checksum: 'abc', enqueuedAt: new Date().toISOString() },
    ];
    const encQueue = CryptoJS.AES.encrypt(JSON.stringify(dummyQueue), encKey).toString();

    // Re-seed offline cache and remove tombstone, set session user
    const users = [
      { userId: 'admin_1', name: '導入管理者', role: 'admin', salt: 'mock_salt', passwordHash: 'mock_hash', cachedAt: new Date().toISOString() }
    ];
    const encAuthCache = CryptoJS.AES.encrypt(JSON.stringify(users), encKey).toString();

    await page.evaluate(({ standbyEntry, encQueue, key, encAuthCache, adminUser }) => {
      window.localStorage.removeItem('yakureki_satellite_revocation_tombstone');
      window.localStorage.setItem('yakureki_satellite_offline_auth_cache_v1', encAuthCache);
      window.localStorage.setItem('yakureki_satellite_standby_hub_allowlist_v1', JSON.stringify([standbyEntry]));
      window.localStorage.setItem('yakureki_satellite_unsent_queue_v1', encQueue);
      window.localStorage.setItem('yakureki_satellite_persistent_queue_enc_key', key);
      window.sessionStorage.setItem('pharmacy_os_current_user', JSON.stringify(adminUser));
      const settingsLink = document.querySelector('a[href="/settings"]');
      if (settingsLink) settingsLink.click();
    }, { standbyEntry: { endpoint: standbyEndpoint, issuedAt, signature }, encQueue, key: encKey, encAuthCache, adminUser: { userId: 'admin_1', name: '導入管理者', role: 'admin' } });
    await wait(3000);

    // Click "端末同期" tab in settings
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const syncTab = buttons.find((b) => b.textContent?.includes('端末同期'));
      if (syncTab) syncTab.click();
    });
    await wait(3000);

    const path4Local = join(localArtifactDir, 'step4_satellite_standby_hub_switch.png');
    const path4Artifact = join(artifactDir, 'step4_satellite_standby_hub_switch.png');
    await page.screenshot({ path: path4Local, fullPage: false });
    await page.screenshot({ path: path4Artifact, fullPage: false });
    console.log('Saved Screen 4:', path4Local);

    console.log('All 4 screenshots captured successfully!');
  } finally {
    if (browser) await browser.close();
    if (satServer) await stopServer(satServer);
    if (hubServer) await stopServer(hubServer);
  }
}

run().catch((err) => {
  console.error('Error during capture:', err);
  process.exit(1);
});
