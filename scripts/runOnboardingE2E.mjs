import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const baseUrl = process.env.YAKUREKI_E2E_BASE_URL || 'http://127.0.0.1:3000';
const setupPassword = process.env.YAKUREKI_E2E_SETUP_PASSWORD || 'SetupPass123';
const visitId = process.env.YAKUREKI_E2E_VISIT_ID || '';
const autoSeed = process.env.YAKUREKI_E2E_AUTO_SEED === '1';
const headless = process.env.YAKUREKI_E2E_HEADLESS !== '0';
const artifactRoot = process.env.YAKUREKI_E2E_ARTIFACT_DIR || 'artifacts/onboarding-e2e';
const successArtifactDir = process.env.YAKUREKI_E2E_SUCCESS_ARTIFACT_DIR || '';

const requiredSettingsSelectors = [
  '[data-testid="initial-setup-panel"]',
  '[data-testid="initial-setup-checklist-csv-button"]',
  '[data-testid="initial-setup-step-claim_test"]',
  '[data-testid="initial-setup-step-print_test"]',
  '[data-testid="daily-closing-field-kpis"]',
  '[data-testid="store-field-kpi-benchmark"]'
];

const requiredDashboardSelectors = [
  '[data-testid="claim-risk-queue"]',
  '[data-testid="monthly-claim-workbench"]',
  '[data-testid="monthly-claim-uke-button"]'
];

const requiredPrintSelectors = [
  '[data-testid="print-page"]',
  '[data-testid="print-uke-export-button"]',
  '[data-testid="print-execute-button"]',
  '[data-testid="pharmacist-check-panel"]',
  '[data-testid="claim-check-panel"]',
  '[data-testid="claim-lifecycle-panel"]',
  '[data-testid="dispensing-record-doc"]',
  '[data-testid="receipt-statement-doc"]'
];

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

async function assertSelectors(page, selectors, label) {
  const missing = [];
  for (const selector of selectors) {
    if (!await page.$(selector)) {
      missing.push(selector);
    }
  }
  assertOk(missing.length === 0, `${label} missing selectors: ${missing.join(', ')}`);
}

async function assertTextIncludes(page, selector, expectedTexts, label) {
  const text = await page.$eval(selector, (element) => element.textContent || '');
  const missing = expectedTexts.filter((expected) => !text.includes(expected));
  assertOk(missing.length === 0, `${label} missing text: ${missing.join(', ')}`);
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

function artifactStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function errorSummary(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }
  return {
    name: 'Error',
    message: String(error)
  };
}

async function writeFailureArtifacts({ page, logs, error }) {
  const artifactDir = join(artifactRoot, artifactStamp());
  await mkdir(artifactDir, { recursive: true });

  const payload = {
    baseUrl,
    autoSeed,
    visitId,
    error: errorSummary(error),
    logs
  };
  await writeFile(join(artifactDir, 'browser-logs.json'), JSON.stringify(payload, null, 2), 'utf8');

  if (page && !page.isClosed()) {
    await page.screenshot({ path: join(artifactDir, 'failure.png'), fullPage: true }).catch(() => {});
    const html = await page.content().catch(() => '');
    if (html) {
      await writeFile(join(artifactDir, 'page.html'), html, 'utf8');
    }
    const text = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (text) {
      await writeFile(join(artifactDir, 'page.txt'), text, 'utf8');
    }
  }

  return artifactDir;
}

async function run() {
  const userDataDir = await mkdtemp(join(tmpdir(), 'yakureki-onboarding-e2e-'));
  let browser;
  let page;
  const logs = [];

  try {
    browser = await puppeteer.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      protocolTimeout: 90000,
      userDataDir
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    page.on('pageerror', (error) => logs.push(`PAGEERROR ${error.message}`));
    page.on('console', (message) => {
      const text = message.text();
      if (/error|failed/i.test(text) && !/manifest\.webmanifest|favicon/i.test(text)) {
        logs.push(`CONSOLE ${message.type()} ${text.slice(0, 300)}`);
      }
    });

    await page.goto(`${baseUrl}/settings`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(2000);
    await ensureInitialAdmin(page);
    let effectiveVisitId = visitId;
    let seedResult = null;
    if (autoSeed) {
      seedResult = await seedOnboardingData(page);
      effectiveVisitId = visitId || seedResult.visitId;
      await page.goto(`${baseUrl}/settings?tab=audit`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    await page.waitForSelector('[data-testid="initial-setup-panel"]', { timeout: 20000 });
    await assertSelectors(page, requiredSettingsSelectors, 'settings onboarding');
    if (seedResult) {
      await assertTextIncludes(page, '[data-testid="daily-closing-field-kpis"]', [
        '在庫不足合計',
        '1品目',
        '入庫登録合計',
        '2件',
        '服薬フォロー合計',
        '1件',
        '問い合わせ負荷合計',
        '1件'
      ], 'settings daily closing field KPIs');
    }
    const settingsScreenshot = successArtifactDir
      ? join(successArtifactDir, 'settings-daily-closing-kpis.png')
      : '';
    const settingsMobileScreenshot = successArtifactDir
      ? join(successArtifactDir, 'settings-daily-closing-kpis-mobile.png')
      : '';
    if (settingsScreenshot) {
      await mkdir(successArtifactDir, { recursive: true });
      const focused = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid="daily-closing-field-kpis"]');
        if (!panel) return false;
        panel.scrollIntoView({ block: 'center', inline: 'nearest' });
        return true;
      });
      assertOk(focused, 'settings daily closing field KPI panel was not found for screenshot.');
      await wait(200);
      await page.screenshot({ path: settingsScreenshot });
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      const mobileLayout = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid="daily-closing-field-kpis"]');
        if (!panel) return null;
        panel.scrollIntoView({ block: 'center', inline: 'nearest' });
        return {
          viewportWidth: document.documentElement.clientWidth,
          pageScrollWidth: document.documentElement.scrollWidth,
          panelWidth: Math.round(panel.getBoundingClientRect().width)
        };
      });
      assertOk(mobileLayout, 'settings daily closing field KPI panel was not found at mobile width.');
      assertOk(
        mobileLayout.pageScrollWidth <= mobileLayout.viewportWidth + 1,
        `settings mobile layout overflows horizontally: ${mobileLayout.pageScrollWidth}px > ${mobileLayout.viewportWidth}px`
      );
      await wait(200);
      await page.screenshot({ path: settingsMobileScreenshot });
      await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    }

    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(2500);
    await assertSelectors(page, requiredDashboardSelectors, 'dashboard onboarding');

    if (effectiveVisitId) {
      await page.goto(`${baseUrl}/print/${encodeURIComponent(effectiveVisitId)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await wait(2500);
      await assertSelectors(page, requiredPrintSelectors, 'print onboarding');
    }

    const blockingLogs = logs.filter((line) => !/RxDB dev-mode warning|RxDB Open Core RxStorage|Failed to load resource/.test(line));
    assertOk(blockingLogs.length === 0, `browser logs contain errors: ${blockingLogs.join(' | ')}`);

    const result = {
      ok: true,
      baseUrl,
      checked: {
        settings: requiredSettingsSelectors.length,
        dashboard: requiredDashboardSelectors.length,
        print: effectiveVisitId ? requiredPrintSelectors.length : 0
      },
      seeded: seedResult ? {
        patientId: seedResult.patientId,
        visitId: seedResult.visitId,
        auditLogCount: seedResult.auditLogIds.length
      } : null,
      settingsScreenshot: settingsScreenshot || null,
      settingsMobileScreenshot: settingsMobileScreenshot || null,
      skipped: effectiveVisitId ? [] : ['print route: set YAKUREKI_E2E_VISIT_ID or YAKUREKI_E2E_AUTO_SEED=1']
    };
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const artifactDir = await writeFailureArtifacts({ page, logs, error }).catch((artifactError) => {
      console.error('Failed to write onboarding E2E failure artifacts:', artifactError);
      return '';
    });
    if (artifactDir) {
      console.error(`Onboarding E2E failure artifacts: ${artifactDir}`);
    }
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
    await rm(userDataDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
