import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const port = 3000;
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
    const buttons = Array.from(document.querySelectorAll('button, .staff-card, .user-card'));
    const adminBtn = buttons.find((b) => (b.textContent || '').includes('E2E導入管理者'));
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
  let browser;
  try {
    const chromePath = findChromePath();
    console.log('Using Chrome executable:', chromePath);

    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,1200']
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

    // 3. 用法を選ぶボタンをクリックしてモーダルを開く
    console.log('3. Opening UsageSearchModal...');
    const selectUsageBtn = await page.waitForSelector('.btn-select-usage', { timeout: 8000 });
    if (!selectUsageBtn) throw new Error('No .btn-select-usage button found');
    await selectUsageBtn.click();
    await wait(1000);

    // モーダルが開いている画面をキャプチャ
    mkdirSync(artifactDir, { recursive: true });
    const modalPath = join(artifactDir, 'pr_g5_usage_modal.png');
    await page.screenshot({ path: modalPath, fullPage: false });
    console.log('Saved modal screenshot to:', modalPath);

    // モーダルから「１日３回朝昼夕食後　服用」を選択
    console.log('3.1 Selecting usage from modal...');
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.usage-item'));
      const target = items.find((el) => (el.textContent || '').includes('１日３回朝昼夕食後'));
      if (target) target.click();
    });
    await wait(1000);

    // 4. 剤形セレクトを「外用」に変更
    console.log('4. Changing dosage category to external...');
    await page.evaluate(() => {
      const select = document.querySelector('.rp-category select');
      if (select) {
        select.value = 'external';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await wait(1500);

    // 5. 不一致警告バッジが表示され、用法が保持されていることを確認
    const result = await page.evaluate(() => {
      const badge = document.querySelector('.rp-category-mismatch-badge');
      const usageInput = document.querySelector('.usage-selector-wrap input');
      const select = document.querySelector('.rp-category select');
      return {
        hasBadge: Boolean(badge),
        badgeText: badge?.textContent?.trim(),
        usageValue: usageInput?.value,
        categoryValue: select?.value
      };
    });
    console.log('Inspection result after category change:', result);

    const shotPath = join(artifactDir, 'pr_g5_mismatch_warning.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log('Saved mismatch warning screenshot to:', shotPath);

  } finally {
    if (browser) await browser.close();
  }
}

run().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
