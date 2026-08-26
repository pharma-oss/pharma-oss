import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const baseUrl = process.env.YAKUREKI_E2E_BASE_URL || 'http://127.0.0.1:3000';
const setupPassword = process.env.YAKUREKI_E2E_SETUP_PASSWORD || 'SetupPass123';
const artifactDir = 'artifacts/step1-ui-verification';

function assertOk(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureInitialAdmin(page) {
  const passwordInput = await page.waitForSelector('input[type=password]', { timeout: 15000 }).catch(() => null);
  if (!passwordInput) return false;

  const prepared = await page.evaluate(({ name, password }) => {
    const passwordInput = document.querySelector('input[type=password]');
    const form = passwordInput?.closest('form');
    if (!(passwordInput instanceof HTMLInputElement) || !form) return false;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!valueSetter) return false;
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
    return true;
  }, { name: 'E2E導入管理者', password: setupPassword });
  assertOk(prepared, 'Initial admin setup form could not be prepared.');
  await wait(200);
  const submitted = await page.evaluate(() => {
    const passwordInput = document.querySelector('input[type=password]');
    const form = passwordInput?.closest('form');
    if (!form) return false;
    form.requestSubmit();
    return true;
  });
  if (submitted) {
    await wait(4000);
    return true;
  }

  throw new Error('Initial admin setup form was shown, but the setup button was not found.');
}

async function seedOnboardingData(page) {
  await page.waitForFunction(() => typeof window.__yakurekiSeedOnboardingE2E === 'function', { timeout: 15000 });
  const result = await page.evaluate(async () => {
    if (typeof window.__yakurekiSeedOnboardingE2E !== 'function') {
      return null;
    }
    return window.__yakurekiSeedOnboardingE2E();
  });
  assertOk(result?.ok === true, 'onboarding E2E seed bridge did not return ok.');
  return result;
}

async function run() {
  await mkdir(artifactDir, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });

    // チュートリアル無効化
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
    await page.goto(`${baseUrl}/settings`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(2000);
    await ensureInitialAdmin(page);

    console.log('2. Seeding test data ...');
    await seedOnboardingData(page);
    await wait(2000);

    // ========================
    // 在庫画面 (/inventory)
    // ========================
    console.log('3. Navigating to /inventory ...');
    await page.goto(`${baseUrl}/inventory`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.inventory-container', { timeout: 15000 });
    await wait(1500);

    // 1. 在庫一覧タブ (デフォルトタブ #tab-drugs)
    const drugsTab = await page.$('#tab-drugs, #panel-drugs');
    assertOk(Boolean(drugsTab), 'drugs tab or panel not found');
    await page.screenshot({ path: join(artifactDir, 'inventory_main_list.png'), fullPage: true });

    // computed style プローブ (text-right, stock-negative, space tokens)
    const listProbe = await page.evaluate(() => {
      const rightCell = document.querySelector('.data-table td.text-right');
      const space1 = getComputedStyle(document.documentElement).getPropertyValue('--space-1').trim();
      const space4 = getComputedStyle(document.documentElement).getPropertyValue('--space-4').trim();
      return {
        tableRows: document.querySelectorAll('.data-table tbody tr').length,
        hasTextRight: Boolean(rightCell),
        textRightComputedAlign: rightCell ? getComputedStyle(rightCell).textAlign : null,
        space1,
        space4
      };
    });
    console.log('Inventory List Probe:', JSON.stringify(listProbe, null, 2));

    // 2. 日次点検タブ (DailyCheckPanel: #tab-daily-check)
    console.log('4. Clicking Daily Check Tab (#tab-daily-check) ...');
    const dailyBtn = await page.$('#tab-daily-check');
    assertOk(Boolean(dailyBtn), 'Tab button #tab-daily-check not found');
    await dailyBtn.click();
    await page.waitForSelector('.daily-check-card, #panel-daily-check', { timeout: 5000 });
    await wait(1000);
    await page.screenshot({ path: join(artifactDir, 'inventory_daily_check.png'), fullPage: true });

    // 3. 納品取込タブ (ImportMaster: #tab-import)
    console.log('5. Clicking Import Master Tab (#tab-import) ...');
    const importBtn = await page.$('#tab-import');
    assertOk(Boolean(importBtn), 'Tab button #tab-import not found');
    await importBtn.click();
    await page.waitForSelector('.import-master, #panel-import', { timeout: 5000 });
    await wait(1000);
    await page.screenshot({ path: join(artifactDir, 'inventory_import_master.png'), fullPage: true });

    // 4. 棚番管理タブ (LocationMaster: #tab-locations)
    console.log('6. Clicking Location Master Tab (#tab-locations) ...');
    const locationBtn = await page.$('#tab-locations');
    assertOk(Boolean(locationBtn), 'Tab button #tab-locations not found');
    await locationBtn.click();
    await page.waitForSelector('.location-master, #panel-locations', { timeout: 5000 });
    await wait(1000);
    await page.screenshot({ path: join(artifactDir, 'inventory_location_master.png'), fullPage: true });

    // ========================
    // OCR 受付画面 (/ocr)
    // ========================
    console.log('7. Navigating to /ocr ...');
    await page.goto(`${baseUrl}/ocr`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.reception-choice-grid, .manual-entry-card', { timeout: 15000 });
    await wait(1000);

    // OCR エントランス画面をキャプチャ
    await page.screenshot({ path: join(artifactDir, 'ocr_entrance.png'), fullPage: true });

    // 「手入力受付」ボタンをクリックして処方受付フォームを展開
    console.log('8. Opening OCR Manual Entry Form ...');
    const manualBtn = await page.$('.manual-entry-card');
    assertOk(Boolean(manualBtn), '.manual-entry-card button not found');
    await manualBtn.click();
    await page.waitForSelector('.ocr-form, .form-group', { timeout: 15000 });
    await wait(1000);

    const ocrProbe = await page.evaluate(() => {
      const formCompact = document.querySelector('.form-group.is-compact');
      const formNarrow = document.querySelector('.form-group.is-narrow');
      const selectMd = document.querySelector('.form-select-md');
      return {
        compactWidth: formCompact ? getComputedStyle(formCompact).width : null,
        narrowWidth: formNarrow ? getComputedStyle(formNarrow).width : null,
        selectPadding: selectMd ? getComputedStyle(selectMd).padding : null,
        selectBorder: selectMd ? getComputedStyle(selectMd).border : null
      };
    });
    console.log('OCR Form Probe:', JSON.stringify(ocrProbe, null, 2));

    await page.screenshot({ path: join(artifactDir, 'ocr_reception_form.png'), fullPage: true });

    console.log('Real UI Capture completed successfully!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Capture failed:', err);
  process.exitCode = 1;
});
