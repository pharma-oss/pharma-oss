import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const baseUrl = process.env.YAKUREKI_E2E_BASE_URL || 'http://127.0.0.1:3000';
const setupPassword = process.env.YAKUREKI_E2E_SETUP_PASSWORD || 'SetupPass123';
const artifactDir = 'artifacts/step3-ui-verification';

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
    // ① ClientLayout / 共通シェル
    // ========================
    console.log('3. Capturing ClientLayout / App Shell on / ...');
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.user-profile, .user-select', { timeout: 15000 });
    await wait(2000);
    await page.screenshot({ path: join(artifactDir, 'step3_client_layout.png'), fullPage: true });

    // ========================
    // ② DailyClosingWizardModal (日締め・閉局ウィザード)
    // ========================
    console.log('4. Triggering DailyClosingWizardModal on / ...');
    const closingBtn = await page.waitForSelector('[data-testid="daily-closing-wizard-button"]', { timeout: 15000 });
    assertOk(Boolean(closingBtn), 'Daily closing wizard button not found');
    await closingBtn.click();
    await page.waitForSelector('.closing-modal-overlay, .closing-modal-card', { timeout: 5000 });
    await wait(1000);
    await page.screenshot({ path: join(artifactDir, 'step3_daily_closing_modal.png'), fullPage: true });

    const closeClosingBtn = await page.$('.btn-closing-close, .btn-closing-cancel');
    if (closeClosingBtn) await closeClosingBtn.click();
    await wait(800);

    // ========================
    // ③ TerminalSyncPanel (端末同期設定画面)
    // ========================
    console.log('5. Navigating to /settings?tab=terminalSync ...');
    await page.goto(`${baseUrl}/settings?tab=terminalSync`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(2000);

    await page.waitForSelector('.terminal-sync-container, .sync-card', { timeout: 15000 });
    await wait(1000);

    // 端末同期セクションまでスクロール
    await page.evaluate(() => {
      const container = document.querySelector('.terminal-sync-container, .sync-card');
      container?.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await wait(1000);
    await page.screenshot({ path: join(artifactDir, 'step3_terminal_sync_panel.png'), fullPage: false });

    // ========================
    // ④ MedicalInstitutionMasterSyncModal
    // ========================
    console.log('6. Triggering MedicalInstitutionMasterSyncModal on /settings?tab=master ...');
    await page.goto(`${baseUrl}/settings?tab=master`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(2000);

    await page.waitForSelector('.upload-area, .btn-primary', { timeout: 15000 });
    const syncModalBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b => b.textContent?.includes('医療機関マスタ同期モーダルを開く') || b.textContent?.includes('医療機関マスタ同期')) || null;
    });
    const syncModalBtnEl = syncModalBtn.asElement();
    assertOk(Boolean(syncModalBtnEl), 'Button for MedicalInstitutionMasterSyncModal not found');
    await syncModalBtnEl.click();
    await page.waitForSelector('.sync-dialog, #sync-title', { timeout: 5000 });
    await wait(1000);
    await page.screenshot({ path: join(artifactDir, 'step3_med_inst_sync_modal.png'), fullPage: true });

    const closeSyncBtn = await page.$('.btn-sync-close, .sync-footer .btn-secondary');
    if (closeSyncBtn) await closeSyncBtn.click();
    await wait(800);

    // ========================
    // ⑤ LoginModal (スタッフログインモーダル)
    // ========================
    console.log('7. Triggering LoginModal on / ...');
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => {
      const select = document.querySelector('.user-select');
      return select && select.options.length > 1;
    }, { timeout: 10000 });

    const selectResult = await page.evaluate(() => {
      const select = document.querySelector('.user-select');
      if (!(select instanceof HTMLSelectElement)) return { ok: false, reason: 'no select' };
      const otherOpt = Array.from(select.options).find(o => !o.disabled && o.value && o.value !== select.value);
      if (!otherOpt) return { ok: false, reason: 'no other option', opts: Array.from(select.options).map(o => ({ value: o.value, text: o.text })) };
      select.value = otherOpt.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, chosen: otherOpt.value, text: otherOpt.text };
    });
    console.log('Select result for LoginModal:', JSON.stringify(selectResult));
    assertOk(selectResult.ok, `Failed to select another user: ${JSON.stringify(selectResult)}`);

    await page.waitForSelector('.login-modal-overlay, .login-modal', { timeout: 8000 });
    await wait(1000);
    await page.screenshot({ path: join(artifactDir, 'step3_login_modal.png'), fullPage: true });

    console.log('Step 3 Real UI Capture completed successfully!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Capture failed:', err);
  process.exitCode = 1;
});
