import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const port = 3339;
const baseUrl = `http://127.0.0.1:${port}`;
const setupPassword = 'SetupPass123';
const artifactDir = '/Users/takeaki/.gemini/antigravity-ide/brain/f95a18ae-4214-42e1-bf3d-c41a638574c6';

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
    const res = await fetch(`${baseUrl}/settings`);
    return res.status < 500;
  } catch (err) {
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

async function ensureStaffLogin(page) {
  const staffButton = await page.waitForSelector('button, .staff-card, .user-card', { timeout: 5000 }).catch(() => null);
  if (!staffButton) return;

  await page.evaluate(({ password }) => {
    // 1. Click staff card for E2E導入管理者
    const buttons = Array.from(document.querySelectorAll('button, .staff-card, .user-card'));
    const adminBtn = buttons.find((b) => (b.textContent || '').includes('E2E導入管理者'));
    if (adminBtn) adminBtn.click();
  }, { password: setupPassword });

  await wait(1000);

  // 2. Type password if password input is shown
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
    const chromePath = findChromePath();
    console.log('Using Chrome executable:', chromePath);

    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,1200']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });

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
    await wait(2000);

    console.log('2. Navigating to OCR page: /ocr');
    await page.goto(`${baseUrl}/ocr`, { waitUntil: 'networkidle2' });
    await wait(3000);

    console.log('2.1 Ensuring staff login on /ocr ...');
    await ensureStaffLogin(page);
    await wait(2000);

    console.log('2.2 Opening manual entry form...');
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('button, .manual-entry-card'));
      const manualBtn = cards.find((b) => (b.textContent || '').includes('OCRなしで手入力受付'));
      if (manualBtn) manualBtn.click();
    });
    await wait(2000);

    const currentUrl = page.url();
    const pageTitle = await page.title();
    console.log('Current URL:', currentUrl, 'Title:', pageTitle);

    // Verify prescription row and unit input
    console.log('3. Inspecting .prescription-row and .unit-stack...');
    const report = await page.evaluate(() => {
      const row = document.querySelector('.prescription-row');
      const header = document.querySelector('.prescription-row-header');
      const unitStack = document.querySelector('.unit-stack');
      const unitInput = document.querySelector('input.unit-text');
      const amountInput = document.querySelector('input.amount');
      const drugInput = document.querySelector('.prescribed-drug-container input');

      return {
        hasRow: Boolean(row),
        gridTemplateColumns: row ? window.getComputedStyle(row).gridTemplateColumns : null,
        hasHeader: Boolean(header),
        headerGridTemplateColumns: header ? window.getComputedStyle(header).gridTemplateColumns : null,
        headerChildrenText: header ? Array.from(header.children).map(c => c.textContent) : null,
        hasUnitStack: Boolean(unitStack),
        hasUnitInput: Boolean(unitInput),
        unitInputAriaLabel: unitInput ? unitInput.getAttribute('aria-label') : null,
        unitInputPlaceholder: unitInput ? unitInput.getAttribute('placeholder') : null,
        unitInputDisplay: unitInput ? window.getComputedStyle(unitInput).display : null,
        unitInputWidth: unitInput ? window.getComputedStyle(unitInput).width : null,
        hasAmountInput: Boolean(amountInput),
        hasDrugInput: Boolean(drugInput)
      };
    });

    console.log('DOM & Style inspection report:', JSON.stringify(report, null, 2));

    if (!report.hasRow) throw new Error('No .prescription-row found');
    if (!report.hasHeader) throw new Error('No .prescription-row-header found');
    if (!report.hasUnitStack) throw new Error('No .unit-stack found');
    if (!report.hasUnitInput) throw new Error('No input.unit-text found');

    // Scroll editor-column to the bottom where prescriptions are located
    console.log('4. Scrolling editor-column to prescriptions section...');
    await page.evaluate(() => {
      const editorCol = document.querySelector('.editor-column');
      if (editorCol) {
        editorCol.scrollTop = editorCol.scrollHeight;
      }
      const workbench = document.querySelector('.prescription-workbench');
      if (workbench) {
        workbench.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    });
    await wait(1500);

    // Enter unit "錠" into unit-text input
    console.log('5. Entering unit "錠" into unit-text input...');
    const unitInputEl = await page.$('input.unit-text');
    if (unitInputEl) {
      await unitInputEl.type('錠');
      await wait(500);
    }

    // Capture viewport screenshot showing the prescription row and unit field in context
    const outViewport = join(artifactDir, 'pr_c3_ocr_prescription_viewport.png');
    await page.screenshot({ path: outViewport, fullPage: false });
    console.log(`Saved prescription viewport screenshot: ${outViewport}`);

    // Capture focused screenshot of prescription group (header + row)
    const groupEl = await page.$('.rp-group');
    if (groupEl) {
      const outGroup = join(artifactDir, 'pr_c3_ocr_prescription_group.png');
      await groupEl.screenshot({ path: outGroup });
      console.log(`Saved focused prescription group screenshot: ${outGroup}`);
    }

    // Capture focused screenshot of prescription row
    const rowEl = await page.$('.prescription-row');
    if (rowEl) {
      const outRow = join(artifactDir, 'pr_c3_ocr_prescription_row.png');
      await rowEl.screenshot({ path: outRow });
      console.log(`Saved focused prescription row screenshot: ${outRow}`);
    }

    console.log('SUCCESS: PR-C3 UI verification completed successfully!');
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error('Execution error:', err);
  process.exit(1);
});
