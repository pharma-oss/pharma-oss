import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const port = 3348;
const baseUrl = `http://127.0.0.1:${port}`;
const setupPassword = 'SetupPass123';
const artifactDir = '/Users/takeaki/.gemini/antigravity-ide/brain/e11142a9-4b43-4f52-b6ae-99b071e0968e';

function findChromePath() {
  const commonPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ];
  for (const p of commonPaths) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServerReady() {
  try {
    const res = await fetch(`${baseUrl}/settings?tab=officialAudit`);
    return res.status < 500;
  } catch {
    return false;
  }
}

async function startServer() {
  console.log(`Starting Next.js dev server on port ${port}...`);
  const server = spawn('npx', ['next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port) }
  });

  return new Promise((resolve, reject) => {
    let started = false;
    const timeout = setTimeout(() => {
      if (!started) {
        server.kill('SIGTERM');
        reject(new Error('Server failed to start within 30s'));
      }
    }, 30000);

    server.stdout.on('data', (data) => {
      const str = data.toString();
      console.log('[Next.js]', str.trim());
      if (str.includes('Ready in') || str.includes('started server on') || str.includes('http://')) {
        if (!started) {
          started = true;
          clearTimeout(timeout);
          resolve(server);
        }
      }
    });

    server.stderr.on('data', (data) => {
      console.error('[Next.js err]', data.toString().trim());
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    server.on('exit', (code) => {
      if (!started) {
        clearTimeout(timeout);
        reject(new Error(`Server exited prematurely with code ${code}`));
      }
    });
  });
}

async function ensureInitialAdmin(page) {
  const passwordInput = await page.waitForSelector('input[type=password]', { timeout: 6000 }).catch(() => null);
  if (!passwordInput) return false;

  console.log('Completing initial admin setup...');
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

async function ensureStaffLogin(page) {
  const staffButton = await page.waitForSelector('button, .staff-card, .user-card', { timeout: 4000 }).catch(() => null);
  if (!staffButton) return;

  console.log('Logging in as staff...');
  await page.evaluate(({ password }) => {
    const buttons = Array.from(document.querySelectorAll('button, .staff-card, .user-card'));
    const adminBtn = buttons.find((b) => (b.textContent || '').includes('E2E導入管理者') || (b.textContent || '').includes('管理者'));
    if (adminBtn) adminBtn.click();
  }, { password: setupPassword });

  await wait(1000);

  await page.evaluate(({ password }) => {
    const pwdInput = document.querySelector('input[type=password]');
    const form = pwdInput?.closest('form');
    if (pwdInput && form) {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(pwdInput, password);
      pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
      pwdInput.dispatchEvent(new Event('change', { bubbles: true }));
      form.requestSubmit();
    }
  }, { password: setupPassword });

  await wait(2000);
}

async function run() {
  let server;
  let browser;
  try {
    server = await startServer();

    const executablePath = findChromePath();
    console.log('Launching browser with Chrome:', executablePath);
    browser = await puppeteer.launch({
      executablePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });

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

    // Navigate directly to officialAudit tab
    console.log('Navigating to settings page (officialAudit tab)...');
    await page.goto(`${baseUrl}/settings?tab=officialAudit`, { waitUntil: 'networkidle2' });
    await wait(2000);

    // Initial setup or login if required
    await ensureInitialAdmin(page);
    await ensureStaffLogin(page);

    // Ensure officialAudit tab is active by clicking the tab pill
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.tab-pill'));
      const auditTab = tabs.find((t) => (t.textContent || '').includes('公式仕様点検'));
      if (auditTab && typeof auditTab.click === 'function') auditTab.click();
    });
    await wait(2000);

    // Seed demo data so we have real prescriptions to inspect
    const seedResult = await page.evaluate(async () => {
      const results = {};
      if (typeof window.__yakurekiSeedOnboardingE2E === 'function') {
        results.onboarding = await window.__yakurekiSeedOnboardingE2E();
      }
      if (typeof window.__yakurekiSeedReturnCorrectionE2E === 'function') {
        results.returnCorrection = await window.__yakurekiSeedReturnCorrectionE2E();
      }
      if (typeof window.__yakurekiSeedTutorialDemo === 'function') {
        results.tutorial = await window.__yakurekiSeedTutorialDemo();
      }
      return results;
    });
    console.log('Seed results:', seedResult);
    await wait(2000);

    // Ensure officialAudit tab is still active
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.tab-pill'));
      const auditTab = tabs.find((t) => (t.textContent || '').includes('公式仕様点検'));
      if (auditTab && typeof auditTab.click === 'function') auditTab.click();
    });
    await wait(2000);

    // Scroll to conflict inspection section
    const sectionSelector = '[data-testid="dosage-category-conflict-section"]';
    console.log('Waiting for dosage category conflict section...');
    await page.waitForSelector(sectionSelector, { timeout: 15000 });
    await page.$eval(sectionSelector, (el) => el.scrollIntoView({ behavior: 'auto', block: 'center' }));
    await wait(1000);

    // Wait for dosage category conflict run button
    const runButtonSelector = '[data-testid="dosage-category-conflict-run-button"]';
    await page.waitForSelector(runButtonSelector, { timeout: 15000 });

    console.log('Clicking dosage category conflict run button...');
    await page.click(runButtonSelector);

    // Wait for inspection to finish
    await wait(3000);

    // Read summary text for standard seeded data
    const summarySelector = '[data-testid="dosage-category-conflict-summary"]';
    await page.waitForSelector(summarySelector, { timeout: 10000 });
    const standardSummaryText = await page.$eval(summarySelector, (el) => el.textContent?.trim());
    console.log('\n========================================');
    console.log('【通常シードデータでの点検結果】');
    console.log(standardSummaryText);
    console.log('========================================\n');

    // Scroll section into view again and take viewport screenshot
    await page.$eval(sectionSelector, (el) => el.scrollIntoView({ behavior: 'auto', block: 'center' }));
    await wait(1000);

    const screenshotPath = join(artifactDir, 'dosage_category_conflict_inspection.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('Screenshot saved to:', screenshotPath);

  } catch (error) {
    console.error('Error running inspection:', error);
  } finally {
    if (browser) await browser.close();
    if (server) {
      console.log('Stopping Next.js server...');
      server.kill('SIGTERM');
    }
  }
}

run();
