import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const port = 3335;
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
  let server;
  let browser;
  try {
    server = await startServer();
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1100 });

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

    console.log('2. Navigating to print page: /print/e2e_onboarding_visit');
    await page.goto(`${baseUrl}/print/e2e_onboarding_visit`, { waitUntil: 'networkidle2' });
    await wait(3000);

    const outPath1 = join(artifactDir, 'step5_print_page_main.png');
    await page.screenshot({ path: outPath1, fullPage: true });
    console.log(`Saved screenshot: ${outPath1}`);

    // Switch to Drug Info tab
    const clickedDrugInfo = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('button, .tab-pill, [role="tab"]'));
      const tab = tabs.find((b) => (b.textContent || '').includes('薬情') || (b.textContent || '').includes('薬剤情報'));
      if (tab) {
        tab.click();
        return true;
      }
      return false;
    });
    if (clickedDrugInfo) {
      await wait(2000);
      const outPath2 = join(artifactDir, 'step5_print_drug_info.png');
      await page.screenshot({ path: outPath2, fullPage: true });
      console.log(`Saved screenshot: ${outPath2}`);
    }

    // Switch to Emergency Escrow tab
    const clickedEscrow = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('button, .tab-pill, [role="tab"]'));
      const tab = tabs.find((b) => (b.textContent || '').includes('緊急復旧') || (b.textContent || '').includes('暗号鍵'));
      if (tab) {
        tab.click();
        return true;
      }
      return false;
    });

    if (clickedEscrow) {
      await wait(2000);
      const outPath3 = join(artifactDir, 'step5_print_emergency_escrow.png');
      await page.screenshot({ path: outPath3, fullPage: true });
      console.log(`Saved screenshot: ${outPath3}`);
    }

    console.log('Step 5 screenshots captured successfully!');
  } finally {
    if (browser) await browser.close();
    if (server) server.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
