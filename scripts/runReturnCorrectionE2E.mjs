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

// PWAインストール案内バナーはページ上部を覆い、座標ベースの page.click() が
// 返戻導線ボタンに当たらなくなる。クリック前に閉じてクリック対象を露出させる。
async function dismissInstallBanner(page) {
  await page.evaluate(() => document.querySelector('.pwa-dismiss-button')?.click()).catch(() => {});
  await wait(200);
}

// このE2Eの目的は返戻導線のルーティング検証。固定ヘッダー等が座標クリックを
// 妨げる環境差があるため、要素を可視化してからDOMクリックで発火させる。
async function jsClick(page, selector) {
  const clicked = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return false;
    element.scrollIntoView({ block: 'center' });
    element.click();
    return true;
  }, selector);
  assertOk(clicked, `jsClick target not found: ${selector}`);
}

// SPA遷移がNext.jsのオンデマンドコンパイルを跨ぐとフルナビゲーションになり、
// waitForFunctionの実行コンテキストが破棄されて条件成立を検知できないことがある。
// puppeteer側で保持されるpage.url()をポーリングして待つ方が確実。
async function waitForUrl(page, predicate, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate(page.url())) return;
    await wait(250);
  }
  assertOk(false, `URL condition not met within ${timeoutMs}ms: ${page.url()}`);
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
    pageUrl: page && !page.isClosed() ? page.url() : null,
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
  await dismissInstallBanner(page);
  await jsClick(page, '[data-testid="return-correction-action-claim-adjust-panel"]');
  await wait(500);
  assertOk(
    page.url().includes(`/print/${encodeURIComponent(visitId)}`),
    `claim-adjust-panel action should stay on print page, got ${page.url()}`
  );

  await jsClick(page, '[data-testid="return-correction-action-patient-insurance-editor"]');
  await waitForUrl(page, (url) => url.includes('/emr') && url.includes('openInsurance=1'));
  assertOk(page.url().includes(`visitId=${encodeURIComponent(visitId)}`), `insurance action URL lost visitId: ${page.url()}`);
  assertOk(page.url().includes('returnCorrection=insurance-master'), `insurance action URL lost returnCorrection: ${page.url()}`);

  await page.goto(`${baseUrl}/print/${encodeURIComponent(visitId)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(2500);
  await dismissInstallBanner(page);
  await jsClick(page, '[data-testid="return-correction-action-prescription-intervention-record"]');
  await waitForUrl(page, (url) => url.includes('/emr') && url.includes('openIntervention=1'));
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
    page.on('pageerror', (error) => logs.push(`PAGEERROR ${error.message}`));
    page.on('console', (message) => {
      const text = message.text();
      if (/error|failed/i.test(text) && !/manifest\.webmanifest|favicon/i.test(text)) {
        logs.push(`CONSOLE ${message.type()} ${text.slice(0, 300)}`);
      }
    });

    // dev/CIでは/emrの初回オンデマンドコンパイルが遅く、返戻導線クリック後の
    // SPA遷移待ち(10秒)を超えることがあるため、先に一度読み込んで温めておく
    await page.goto(`${baseUrl}/emr`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.goto(`${baseUrl}/settings`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(2000);
    const seedResult = await seedReturnCorrectionData(page);
    const visitId = seedResult.visitId;

    // seedは認証情報付きスタッフを投入するためログインゲートが有効になる。
    // このE2Eは返戻導線の検証が目的なので、seedした管理者のセッションを直接確立する
    // (実ログインフォームの検証は onboarding E2E が担う)。
    await page.evaluate(() => {
      window.sessionStorage.setItem('pharmacy_os_current_user', JSON.stringify({
        userId: 'e2e_return_correction_admin',
        name: 'E2E返戻管理者',
        role: 'admin'
      }));
    });

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
