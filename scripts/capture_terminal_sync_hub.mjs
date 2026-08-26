import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const port = 3400;
const baseUrl = `http://127.0.0.1:${port}`;
const setupPassword = 'SetupPass123';
const artifactDir = '/Users/takeaki/.gemini/antigravity-ide/brain/7ad7cc77-8091-43b0-8626-4a614821a8f9';
const localArtifactDir = join(process.cwd(), 'artifacts', 'step3-ui-verification');

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServerReady() {
  try {
    const res = await fetch(`${baseUrl}/api/sync/config`);
    return res.status < 500;
  } catch {
    return false;
  }
}

async function startHubServer() {
  console.log('Starting next hub server on port', port);
  const server = spawn('npx', ['next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(port),
      PHARMACY_SYNC_ROLE: 'hub',
      PHARMACY_SYNC_HUB_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      PHARMACY_SYNC_HUB_DB_PATH: '/tmp/yakureki-hub-preview.sqlite'
    }
  });

  for (let i = 0; i < 40; i++) {
    if (await isServerReady()) {
      console.log('Hub server is ready!');
      return server;
    }
    await wait(1000);
  }
  server.kill('SIGTERM');
  throw new Error('Hub dev server failed to start within 40s');
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

  let server;
  let browser;
  try {
    server = await startHubServer();
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1200 });

    // チュートリアル・デモポップアップ無効化
    await page.evaluateOnNewDocument(() => {
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function patchedGetItem(key) {
        if (
          String(key).startsWith('yakureki:pre-login-tour') ||
          String(key).startsWith('yakureki:workflow-tutorial') ||
          String(key).startsWith('yakureki:first-run-tutorial')
        ) {
          return '2026-01-01T00:00:00.000Z';
        }
        return originalGetItem.call(this, key);
      };
    });

    console.log('1. Setting up initial admin on /settings ...');
    await page.goto(`${baseUrl}/settings`, { waitUntil: 'domcontentloaded' });
    await wait(2000);
    await ensureInitialAdmin(page);
    await seedOnboardingData(page);
    await wait(2000);

    // Register a satellite terminal via API to populate the list
    console.log('2. Registering sample satellite terminals...');
    await fetch(`${baseUrl}/api/sync/terminals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId: 'satellite-counter-1', label: '1階 窓口受付端末' })
    }).catch((e) => console.log('API error', e));

    await fetch(`${baseUrl}/api/sync/terminals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId: 'satellite-cleanroom-2', label: '無菌室調剤端末' })
    }).catch((e) => console.log('API error', e));

    console.log('3. Navigating to Settings > Terminal Sync tab...');
    await page.goto(`${baseUrl}/settings`, { waitUntil: 'networkidle2' });
    await wait(2000);

    // Switch to Terminal Sync tab
    const clickedTab = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button.tab-pill, button'));
      const tab = buttons.find((b) => (b.textContent || '').includes('端末同期'));
      if (tab) {
        tab.click();
        return true;
      }
      return false;
    });
    console.log('Switched to Terminal Sync tab:', clickedTab);
    await wait(2500);

    // Scroll to terminal sync container
    await page.evaluate(() => {
      const section = document.querySelector('.terminal-sync-container, .settings-section');
      if (section) section.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await wait(1000);

    const outPath1 = join(artifactDir, 'step3_terminal_sync_panel_hub.png');
    const outPathLocal = join(localArtifactDir, 'step3_terminal_sync_panel_hub.png');
    await page.screenshot({ path: outPath1, fullPage: false });
    await page.screenshot({ path: outPathLocal, fullPage: false });
    console.log(`Saved screenshot to: ${outPath1} and ${outPathLocal}`);

    console.log('TerminalSyncPanel hub screenshot captured successfully!');
  } finally {
    if (browser) await browser.close();
    if (server) server.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
