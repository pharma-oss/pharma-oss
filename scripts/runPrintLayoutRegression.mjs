import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const baseUrl = process.env.YAKUREKI_E2E_BASE_URL || 'http://127.0.0.1:3000';
const setupPassword = process.env.YAKUREKI_E2E_SETUP_PASSWORD || 'SetupPass123';
const visitId = process.env.YAKUREKI_E2E_VISIT_ID || '';
const autoSeed = process.env.YAKUREKI_E2E_AUTO_SEED !== '0';
const headless = process.env.YAKUREKI_E2E_HEADLESS !== '0';
const artifactRoot = process.env.YAKUREKI_E2E_ARTIFACT_DIR || 'artifacts/print-layout-regression';

const printTargets = [
  { selector: '[data-testid="dispensing-record-doc"]', label: 'dispensing-record' },
  { selector: '[data-testid="receipt-statement-doc"]', label: 'receipt-statement' },
  { selector: '[data-testid="receipt-doc"]', label: 'receipt' },
  { selector: '[data-testid="drug-info-doc"]', label: 'drug-info' },
  { selector: '[data-testid="medicine-bag-doc"]', label: 'medicine-bag', multiple: true },
  { selector: '[data-testid="medicine-notebook-sticker-doc"]', label: 'medicine-notebook-sticker' },
  { selector: '[data-testid="liquid-label-sheet-doc"]', label: 'liquid-label-sheet' },
  { selector: '[data-testid="ointment-label-sheet-doc"]', label: 'ointment-label-sheet' }
];

function assertOk(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

async function ensureInitialAdmin(page) {
  const passwordInput = await page.waitForSelector('input[type=password]', { timeout: 15000 }).catch(() => null);
  if (!passwordInput) return false;

  const formHandle = await passwordInput.evaluateHandle((input) => input.closest('form'));
  const nameInput = await formHandle.asElement()?.$('input[type=text]');
  if (nameInput) {
    await nameInput.click({ clickCount: 3 });
    await page.keyboard.type('E2E導入管理者');
  }
  await passwordInput.click({ clickCount: 3 });
  await page.keyboard.type(setupPassword);
  await wait(500);
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

async function waitForLayout(page) {
  await page.waitForSelector('[data-testid="print-page"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="dispensing-record-doc"]', { timeout: 30000 });
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });
  await wait(1000);
}

async function screenshotElement(element, filePath) {
  const box = await element.boundingBox();
  assertOk(Boolean(box), `target has no visible bounding box: ${filePath}`);
  assertOk(box.width >= 120, `target width is too small: ${filePath}`);
  assertOk(box.height >= 120, `target height is too small: ${filePath}`);

  await element.screenshot({ path: filePath });
  const fileStat = await stat(filePath);
  assertOk(fileStat.size > 1000, `screenshot appears empty: ${filePath}`);
  return {
    filePath,
    width: Math.round(box.width),
    height: Math.round(box.height),
    bytes: fileStat.size
  };
}

async function capturePrintTargets(page, artifactDir) {
  const captures = [];

  await page.screenshot({ path: join(artifactDir, 'print-page-full.png'), fullPage: true });
  for (const target of printTargets) {
    const elements = await page.$$(target.selector);
    assertOk(elements.length > 0, `print layout target missing: ${target.selector}`);
    if (!target.multiple) {
      assertOk(elements.length === 1, `print layout target should be unique: ${target.selector}`);
    }

    for (let index = 0; index < elements.length; index++) {
      const suffix = target.multiple ? `-${index + 1}` : '';
      const fileName = `${target.label}${suffix}.png`;
      const result = await screenshotElement(elements[index], join(artifactDir, fileName));
      captures.push({
        label: target.label,
        selector: target.selector,
        index: index + 1,
        fileName,
        width: result.width,
        height: result.height,
        bytes: result.bytes
      });
    }
  }

  return captures;
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
  const userDataDir = await mkdtemp(join(tmpdir(), 'yakureki-print-layout-e2e-'));
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
    // ログイン前デモ(PreLoginTour)と業務別30秒デモは自動表示のタイミングが非決定的で、
    // 初期管理者フォームや検証対象パネルを覆うため、E2Eでは既読として扱って無効化する。
    // 表示内容そのものは PreLoginTour.test.ts / WorkflowMiniTutorial の単体テストが担保する。
    await page.evaluateOnNewDocument(() => {
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function patchedGetItem(key) {
        if (String(key).startsWith('yakureki:pre-login-tour') || String(key).startsWith('yakureki:workflow-tutorial')) {
          return '2026-01-01T00:00:00.000Z';
        }
        return originalGetItem.call(this, key);
      };
    });
    await page.setViewport({ width: 1440, height: 1800, deviceScaleFactor: 1 });
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
    }
    assertOk(Boolean(effectiveVisitId), 'set YAKUREKI_E2E_VISIT_ID or keep YAKUREKI_E2E_AUTO_SEED enabled.');

    await page.goto(`${baseUrl}/print/${encodeURIComponent(effectiveVisitId)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForLayout(page);

    const artifactDir = join(artifactRoot, artifactStamp());
    await mkdir(artifactDir, { recursive: true });
    const captures = await capturePrintTargets(page, artifactDir);

    const blockingLogs = logs.filter((line) => !/RxDB dev-mode warning|RxDB Open Core RxStorage|Failed to load resource/.test(line));
    assertOk(blockingLogs.length === 0, `browser logs contain errors: ${blockingLogs.join(' | ')}`);

    const result = {
      ok: true,
      baseUrl,
      visitId: effectiveVisitId,
      artifactDir,
      captureCount: captures.length,
      captures,
      seeded: seedResult ? {
        patientId: seedResult.patientId,
        visitId: seedResult.visitId,
        auditLogCount: seedResult.auditLogIds.length
      } : null
    };
    await writeFile(join(artifactDir, 'manifest.json'), JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const artifactDir = await writeFailureArtifacts({ page, logs, error }).catch((artifactError) => {
      console.error('Failed to write print layout failure artifacts:', artifactError);
      return '';
    });
    if (artifactDir) {
      console.error(`Print layout regression failure artifacts: ${artifactDir}`);
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
