import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const baseUrl = process.env.YAKUREKI_E2E_BASE_URL || 'http://127.0.0.1:3000';
const headless = process.env.YAKUREKI_E2E_HEADLESS !== '0';
const artifactRoot = process.env.YAKUREKI_E2E_ARTIFACT_DIR || 'artifacts/return-correction-e2e';

const returnCorrectionTargets = [
  'patient-insurance-editor',
  'prescription-intervention-record',
  'claim-adjust-panel'
];

function assertOk(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

async function seedReturnCorrectionData(page) {
  await page.waitForFunction(() => typeof window.__yakurekiSeedReturnCorrectionE2E === 'function', { timeout: 15000 });
  const result = await page.evaluate(async () => {
    if (typeof window.__yakurekiSeedReturnCorrectionE2E !== 'function') {
      return null;
    }
    return window.__yakurekiSeedReturnCorrectionE2E();
  });
  assertOk(result?.ok === true, 'return correction E2E seed bridge did not return ok.');
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
  await writeFile(join(artifactDir, 'browser-logs.json'), JSON.stringify({
    baseUrl,
    error: errorSummary(error),
    logs
  }, null, 2), 'utf8');

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

async function verifyReturnCorrectionRoutes(page, visitId) {
  await page.click('[data-testid="return-correction-action-claim-adjust-panel"]');
  await wait(500);
  assertOk(
    page.url().includes(`/print/${encodeURIComponent(visitId)}`),
    `claim-adjust-panel action should stay on print page, got ${page.url()}`
  );

  await page.click('[data-testid="return-correction-action-patient-insurance-editor"]');
  await page.waitForFunction(() => window.location.pathname === '/emr' && window.location.search.includes('openInsurance=1'), { timeout: 10000 });
  assertOk(page.url().includes(`visitId=${encodeURIComponent(visitId)}`), `insurance action URL lost visitId: ${page.url()}`);
  assertOk(page.url().includes('returnCorrection=insurance-master'), `insurance action URL lost returnCorrection: ${page.url()}`);

  await page.goto(`${baseUrl}/print/${encodeURIComponent(visitId)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(2500);
  await page.click('[data-testid="return-correction-action-prescription-intervention-record"]');
  await page.waitForFunction(() => window.location.pathname === '/emr' && window.location.search.includes('openIntervention=1'), { timeout: 10000 });
  assertOk(page.url().includes(`visitId=${encodeURIComponent(visitId)}`), `prescription action URL lost visitId: ${page.url()}`);
  assertOk(page.url().includes('returnCorrection=prescription-items'), `prescription action URL lost returnCorrection: ${page.url()}`);
  assertOk(page.url().includes('reason='), `prescription action URL lost reason: ${page.url()}`);
}

async function run() {
  const userDataDir = await mkdtemp(join(tmpdir(), 'yakureki-return-correction-e2e-'));
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
    page.on('pageerror', (error) => logs.push(`PAGEERROR ${error.message}`));
    page.on('console', (message) => {
      const text = message.text();
      if (/error|failed/i.test(text) && !/manifest\.webmanifest|favicon/i.test(text)) {
        logs.push(`CONSOLE ${message.type()} ${text.slice(0, 300)}`);
      }
    });

    await page.goto(`${baseUrl}/settings`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(2000);
    const seedResult = await seedReturnCorrectionData(page);
    const visitId = seedResult.visitId;

    await page.goto(`${baseUrl}/print/${encodeURIComponent(visitId)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(2500);
    await assertSelectors(page, [
      '[data-testid="print-page"]',
      '[data-testid="claim-lifecycle-panel"]',
      '[data-testid="claim-adjust-panel"]',
      ...returnCorrectionTargets.map((target) => `[data-testid="return-correction-action-${target}"]`)
    ], 'return correction print page');

    const visibleTargets = await page.$$eval('[data-return-correction-target]', (nodes) => (
      nodes.map((node) => node.getAttribute('data-return-correction-target')).filter(Boolean)
    ));
    assertOk(
      returnCorrectionTargets.every((target) => visibleTargets.includes(target)),
      `return correction targets missing: expected ${returnCorrectionTargets.join(', ')}, got ${visibleTargets.join(', ')}`
    );

    await verifyReturnCorrectionRoutes(page, visitId);

    const blockingLogs = logs.filter((line) => !/RxDB dev-mode warning|RxDB Open Core RxStorage|Failed to load resource/.test(line));
    assertOk(blockingLogs.length === 0, `browser logs contain errors: ${blockingLogs.join(' | ')}`);

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      visitId,
      checkedTargets: returnCorrectionTargets
    }, null, 2));
  } catch (error) {
    const artifactDir = await writeFailureArtifacts({ page, logs, error }).catch((artifactError) => {
      console.error('Failed to write return correction E2E failure artifacts:', artifactError);
      return '';
    });
    if (artifactDir) {
      console.error(`Return correction E2E failure artifacts: ${artifactDir}`);
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
