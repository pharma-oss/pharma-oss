import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const baseUrl = process.env.YAKUREKI_E2E_BASE_URL || 'http://127.0.0.1:3000';
const artifactDir = 'artifacts/step1-ui-verification';

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function probe() {
  await mkdir(artifactDir, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200 });

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

  // 初期管理者作成を /settings で完了
  await page.goto(`${baseUrl}/settings`, { waitUntil: 'networkidle2', timeout: 30000 });
  await wait(1500);

  const pwdInput = await page.$('input[type=password]');
  if (pwdInput) {
    await page.type('input[type=text]', '管理者');
    await page.type('input[type=password]', 'SetupPass123');
    const submitBtn = await page.$('button[type=submit]');
    if (submitBtn) {
      await submitBtn.click();
      await wait(3000);
    }
  }

  console.log('1. Probing /inventory ...');
  await page.goto(`${baseUrl}/inventory`, { waitUntil: 'networkidle2', timeout: 30000 });
  await wait(2000);

  const inventoryProbe = await page.evaluate(() => {
    const spaceTokens = {
      space1: getComputedStyle(document.documentElement).getPropertyValue('--space-1').trim(),
      space2: getComputedStyle(document.documentElement).getPropertyValue('--space-2').trim(),
      space4: getComputedStyle(document.documentElement).getPropertyValue('--space-4').trim(),
      space8: getComputedStyle(document.documentElement).getPropertyValue('--space-8').trim(),
    };
    const title = document.querySelector('h1')?.textContent?.trim() || '';
    const tabs = Array.from(document.querySelectorAll('.tab')).map(t => t.textContent?.trim());
    const tableRows = document.querySelectorAll('tbody tr').length;
    return { spaceTokens, title, tabs, tableRows };
  });
  console.log('Inventory Probe Result:', JSON.stringify(inventoryProbe, null, 2));
  await page.screenshot({ path: join(artifactDir, 'inventory_page.png'), fullPage: true });

  console.log('2. Probing /ocr ...');
  await page.goto(`${baseUrl}/ocr`, { waitUntil: 'networkidle2', timeout: 30000 });
  await wait(2000);

  const ocrProbe = await page.evaluate(() => {
    const title = document.querySelector('h1')?.textContent?.trim() || '';
    const formGroups = Array.from(document.querySelectorAll('.form-group')).length;
    const formGroupW180 = document.querySelector('.form-group-w-180');
    const formGroupW120 = document.querySelector('.form-group-w-120');
    const select = document.querySelector('.form-select-md');

    return {
      title,
      formGroups,
      w180ComputedWidth: formGroupW180 ? getComputedStyle(formGroupW180).width : null,
      w120ComputedWidth: formGroupW120 ? getComputedStyle(formGroupW120).width : null,
      selectBorder: select ? getComputedStyle(select).border : null,
      selectPadding: select ? getComputedStyle(select).padding : null
    };
  });
  console.log('OCR Probe Result:', JSON.stringify(ocrProbe, null, 2));
  await page.screenshot({ path: join(artifactDir, 'ocr_page.png'), fullPage: true });

  await browser.close();
  console.log('UI Probe finished successfully.');
}

probe().catch((err) => {
  console.error('Probe failed:', err);
  process.exitCode = 1;
});
