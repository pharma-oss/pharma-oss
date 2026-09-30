import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'artifacts', 'multi-public-insurance-20260930');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkServerReady(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

function findChromePath() {
  const commonPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chrome binary not found on macOS');
}

async function run() {
  const port = 3457;
  const baseUrl = `http://127.0.0.1:${port}`;

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  let isReady = await checkServerReady(port);
  let serverProcess = null;

  if (!isReady) {
    console.log(`Starting next start server on port ${port}...`);
    serverProcess = spawn('npx', ['next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: 'inherit'
    });

    for (let i = 0; i < 40; i++) {
      await wait(1000);
      if (await checkServerReady(port)) {
        isReady = true;
        break;
      }
    }
  }

  if (!isReady) {
    throw new Error('Failed to start server.');
  }

  console.log('Server is ready on port', port);
  const executablePath = findChromePath();
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // 1. Visit root to seed demo patient
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      const user = JSON.stringify({
        id: 'admin_user',
        username: 'admin',
        name: '管理者',
        role: 'admin',
        active: true
      });
      sessionStorage.setItem('pharmacy_os_current_user', user);
      localStorage.setItem('pharmacy_os_current_user', user);
    });

    console.log('Clicking demo start button...');
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(b => (b.textContent || '').includes('デモ患者で実際に操作する'));
    }, { timeout: 10000 });

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const startBtn = buttons.find(b => (b.textContent || '').includes('デモ患者で実際に操作する'));
      if (startBtn) startBtn.click();
    });

    console.log('Waiting for navigation to EMR...');
    await page.waitForFunction(() => window.location.href.includes('/emr'), { timeout: 15000 });
    await page.waitForSelector('.patient-banner', { timeout: 15000 });
    await wait(2000);

    // Dismiss tutorial dialog if open
    await page.evaluate(() => {
      const closeButtons = Array.from(document.querySelectorAll('button'));
      const dismissBtn = closeButtons.find(b => (b.textContent || '').includes('薬歴を始める') || (b.textContent || '').includes('あとで見る'));
      if (dismissBtn) dismissBtn.click();
      const dialogs = document.querySelectorAll('dialog');
      for (const d of dialogs) {
        if (d.open) d.close();
      }
    });
    await wait(1000);

    // Capture 1: Initial EMR Banner
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_emr_banner_initial.png') });
    console.log('Captured 01_emr_banner_initial.png');

    // 2. Open Insurance Modal
    console.log('Opening Insurance Edit Modal...');
    await page.evaluate(() => {
      const btn = document.querySelector('.btn-edit-insurance');
      if (btn) btn.click();
    });

    await page.waitForSelector('.insurance-modal', { timeout: 5000 });
    await wait(500);

    // Capture 2: Initial Modal with 1st Public Insurance
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_insurance_modal_initial.png') });
    console.log('Captured 02_insurance_modal_initial.png');

    // 3. Add 2nd Public Insurance (指定難病 54136018 + 精神通院 21136018)
    console.log('Adding 2nd Public Insurance...');
    await page.evaluate(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      const setValue = (input, value) => {
        if (!input) return;
        valueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };

      // 1件目を指定難病に設定
      setValue(document.querySelector('#m-pub-provider-0'), '54136018');
      setValue(document.querySelector('#m-pub-recipient-0'), '1234567');
      setValue(document.querySelector('#m-pub-monthly-limit-0'), '10000');

      // 「公費を追加」をクリック
      const addBtn = document.querySelector('.btn-add-public');
      if (addBtn) addBtn.click();
    });

    await wait(500);

    // 2件目の入力
    await page.evaluate(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      const setValue = (input, value) => {
        if (!input) return;
        valueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };

      setValue(document.querySelector('#m-pub-provider-1'), '21136018');
      setValue(document.querySelector('#m-pub-recipient-1'), '7654321');
      setValue(document.querySelector('#m-pub-monthly-limit-1'), '2500');

      // モーダル内の公費セクションへスクロール
      const publicSection = document.querySelector('.modal-section-header');
      if (publicSection) {
        publicSection.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    });

    await wait(500);

    // Capture 3: Modal with multiple public insurances filled
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_insurance_modal_multiple_filled.png') });
    console.log('Captured 03_insurance_modal_multiple_filled.png');

    // 4. Save and apply
    console.log('Saving multiple public insurances...');
    await page.evaluate(() => {
      const saveBtn = Array.from(document.querySelectorAll('.modal-footer button')).find(b => (b.textContent || '').includes('保存'));
      if (saveBtn) saveBtn.click();
    });

    await wait(2000);

    // Capture 4: Banner after saving with multiple public insurance badges
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_emr_banner_multi_public_saved.png') });
    console.log('Captured 04_emr_banner_multi_public_saved.png');

    // 5. Test responsive on 768px and 375px
    await page.setViewport({ width: 768, height: 900 });
    await wait(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_emr_banner_768px.png') });
    console.log('Captured 05_emr_banner_768px.png');

    await page.setViewport({ width: 375, height: 800 });
    await wait(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_emr_banner_375px.png') });
    console.log('Captured 06_emr_banner_375px.png');

    console.log('All real UI verifications captured successfully!');
  } finally {
    await browser.close();
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  }
}

run().catch((err) => {
  console.error('Error in capture script:', err);
  process.exit(1);
});
