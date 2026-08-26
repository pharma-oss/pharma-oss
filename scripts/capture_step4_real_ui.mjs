import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const port = 3334;
const baseUrl = `http://127.0.0.1:${port}`;
const setupPassword = 'SetupPass123';
const artifactDir = '/Users/takeaki/.gemini/antigravity-ide/brain/7ad7cc77-8091-43b0-8626-4a614821a8f9';

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServerReady() {
  try {
    const res = await fetch(`${baseUrl}/settings`);
    return res.status < 500;
  } catch {
    return false;
  }
}

async function startServer() {
  console.log('Starting next dev server on port', port);
  const server = spawn('npx', ['next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) }
  });

  for (let i = 0; i < 40; i++) {
    if (await isServerReady()) {
      console.log('Server is ready!');
      return server;
    }
    await wait(1000);
  }
  server.kill('SIGTERM');
  throw new Error('Dev server failed to start within 40s');
}

async function ensureInitialAdmin(page) {
  const passwordInput = await page.waitForSelector('input[type=password]', { timeout: 8000 }).catch(() => null);
  if (!passwordInput) return false;

  await page.evaluate(({ name, password }) => {
    const passwordInput = document.querySelector('input[type=password]');
    const form = passwordInput?.closest('form');
    if (!(passwordInput instanceof HTMLInputElement) || !form) return;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    const setValue = (input, value) => {
      valueSetter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const nameInput = form.querySelector('input[type=text]');
    if (nameInput instanceof HTMLInputElement) {
      setValue(nameInput, name);
    }
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
      await window.__yakurekiSeedOnboardingE2E();
    }
  }).catch(() => {});
}

async function run() {
  let server;
  let browser;
  try {
    server = await startServer();
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 950 });

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

    console.log('Navigating to settings page...');
    await page.goto(`${baseUrl}/settings`, { waitUntil: 'domcontentloaded' });
    await wait(2000);

    // Initial admin setup & test data seeding
    await ensureInitialAdmin(page);
    await seedOnboardingData(page);
    await wait(2000);

    const tabs = [
      { id: 'facility', query: '施設基準設定', name: 'step4_settings_facility.png' },
      { id: 'staff', query: 'スタッフ管理', name: 'step4_settings_staff.png' },
      { id: 'template', query: '薬情テンプレ', name: 'step4_settings_template.png' },
      { id: 'drug_master', query: 'マスタ更新', name: 'step4_settings_drug_master.png' },
      { id: 'connectors', query: '外部連携', name: 'step4_settings_connectors.png' },
      { id: 'audit', query: '操作ログ', name: 'step4_settings_audit.png' },
      { id: 'backup', query: 'バックアップ', name: 'step4_settings_backup.png' },
      { id: 'official_audit', query: '公式仕様点検', name: 'step4_settings_official_audit.png' }
    ];

    for (const tab of tabs) {
      console.log(`Switching to tab: ${tab.id} (${tab.query})`);
      const clicked = await page.evaluate((textToFind) => {
        const buttons = Array.from(document.querySelectorAll('button.tab-pill, button'));
        const tabBtn = buttons.find((b) => (b.textContent || '').includes(textToFind));
        if (tabBtn) {
          tabBtn.click();
          return true;
        }
        return false;
      }, tab.query);

      await wait(1000);

      // Scroll to the tab content
      await page.evaluate(() => {
        const section = document.querySelector('.settings-section');
        if (section) {
          section.scrollIntoView({ behavior: 'instant', block: 'start' });
        }
      });

      await wait(1000);
      const outPath = join(artifactDir, tab.name);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`Saved screenshot: ${outPath} (clicked: ${clicked})`);
    }

    console.log('All Step 4 screenshots captured successfully!');
  } finally {
    if (browser) await browser.close();
    if (server) server.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
