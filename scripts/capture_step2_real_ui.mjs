import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const baseUrl = process.env.YAKUREKI_E2E_BASE_URL || 'http://127.0.0.1:3000';
const setupPassword = process.env.YAKUREKI_E2E_SETUP_PASSWORD || 'SetupPass123';
const artifactDir = 'artifacts/step2-ui-verification';

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
    // EMR メイン画面 (/emr)
    // ========================
    console.log('3. Navigating to /emr ...');
    await page.goto(`${baseUrl}/emr`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.patient-banner, .emr-workspace', { timeout: 15000 });
    await wait(2000);

    // 1. EMR メイン全体画面キャプチャ
    await page.screenshot({ path: join(artifactDir, 'emr_main_screen.png'), fullPage: true });

    const emrProbe = await page.evaluate(() => {
      const banner = document.querySelector('.patient-banner');
      const actions = document.querySelector('.patient-actions');
      const btnEdit = document.querySelector('.btn-edit-insurance');
      const btnPick = document.querySelector('.btn-picking');
      return {
        hasBanner: Boolean(banner),
        hasActions: Boolean(actions),
        actionsGap: actions ? getComputedStyle(actions).gap : null,
        btnEditBg: btnEdit ? getComputedStyle(btnEdit).backgroundColor : null,
        btnPickBg: btnPick ? getComputedStyle(btnPick).backgroundColor : null
      };
    });
    console.log('EMR Main Probe:', JSON.stringify(emrProbe, null, 2));

    // 2. ピッキング支援モーダル (.picking-modal)
    console.log('4. Opening Picking Support Modal ...');
    const pickingBtn = await page.$('.btn-picking');
    assertOk(Boolean(pickingBtn), 'Button .btn-picking not found in patient banner');
    await pickingBtn.click();
    await page.waitForSelector('.picking-modal, #picking-title', { timeout: 5000 });
    await wait(1000);
    await page.screenshot({ path: join(artifactDir, 'emr_picking_modal.png'), fullPage: true });

    // モーダルを閉じる
    const closePickingBtn = await page.$('.btn-picking-close, .modal-footer .btn-primary');
    if (closePickingBtn) await closePickingBtn.click();
    await wait(800);

    // 3. 疑義照会モーダル (.modal-intervention)
    console.log('5. Opening EMR Intervention Modal ...');
    const interventionBtn = await page.evaluateHandle(() => {
      const cards = Array.from(document.querySelectorAll('.aside-card'));
      const card = cards.find(c => c.textContent?.includes('疑義照会'));
      return card?.querySelector('.btn-aside-action') || null;
    });
    const intBtnElement = interventionBtn.asElement();
    assertOk(Boolean(intBtnElement), 'Button for new intervention not found in aside card');
    await intBtnElement.click();
    await page.waitForSelector('.modal-intervention, .insurance-modal-overlay', { timeout: 5000 });
    await wait(1000);
    await page.screenshot({ path: join(artifactDir, 'emr_intervention_modal.png'), fullPage: true });

    // モーダルを閉じる
    const closeIntBtn = await page.$('.modal-intervention .btn-secondary');
    if (closeIntBtn) await closeIntBtn.click();
    await wait(800);

    // 4. トレーシングレポート作成モーダル (.tracing-dialog)
    console.log('6. Opening Tracing Report Modal ...');
    const tracingBtn = await page.evaluateHandle(() => {
      const cards = Array.from(document.querySelectorAll('.aside-card'));
      const card = cards.find(c => c.textContent?.includes('トレーシングレポート'));
      return card?.querySelector('.btn-aside-action') || null;
    });
    const traceBtnElement = tracingBtn.asElement();
    assertOk(Boolean(traceBtnElement), 'Button for new tracing report not found in aside card');
    await traceBtnElement.click();
    await page.waitForSelector('.tracing-dialog, #tracing-title', { timeout: 5000 });
    await wait(1000);
    await page.screenshot({ path: join(artifactDir, 'emr_tracing_modal.png'), fullPage: true });

    // モーダルを閉じる
    const closeTraceBtn = await page.$('.tracing-dialog .btn-modal-close, .tracing-footer-actions .btn-secondary');
    if (closeTraceBtn) await closeTraceBtn.click();
    await wait(800);

    console.log('Step 2 Real UI Capture completed successfully!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Capture failed:', err);
  process.exitCode = 1;
});
