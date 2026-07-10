// README/ランディングページ用スクリーンショットの自動撮影。
// クリーンなブラウザプロファイルで初期セットアップ→チュートリアルのデモ患者投入→
// 主要4画面を docs/images/ へ保存する。表示されるのは架空のデモデータのみ。
// 使い方: 開発サーバー起動中に `npm run docs:screenshots`
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const baseUrl = process.env.YAKUREKI_SCREENSHOT_BASE_URL || 'http://127.0.0.1:3000';
const outputDir = new URL('../docs/images/', import.meta.url).pathname;
const setupPassword = process.env.YAKUREKI_E2E_SETUP_PASSWORD || 'SetupPass123';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureInitialAdmin(page) {
  const passwordInput = await page.waitForSelector('input[type=password]', { timeout: 20000 }).catch(() => null);
  if (!passwordInput) return;
  await page.evaluate(({ password }) => {
    const input = document.querySelector('input[type=password]');
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!(input instanceof HTMLInputElement) || !valueSetter) return;
    valueSetter.call(input, password);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { password: setupPassword });
  await wait(200);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent?.includes('パスワードを設定して開始'));
    button?.click();
  });
  await wait(4000);
}

async function dismissOverlays(page) {
  // 初回チュートリアル・業務別30秒デモ・PWAインストールバナーは表示タイミングが
  // 遅れて出ることがあるため、「何も出ていない状態」を2回連続で確認するまで閉じ続ける
  let cleanStreak = 0;
  for (let attempt = 0; attempt < 15 && cleanStreak < 2; attempt++) {
    const hadOverlay = await page.evaluate(() => {
      let clicked = false;
      const tutorialClose = document.querySelector('.tutorial-close');
      if (tutorialClose) {
        tutorialClose.click();
        clicked = true;
      }
      const later = [...document.querySelectorAll('button')]
        .find((candidate) => candidate.textContent?.trim() === 'あとで見る');
      if (later) {
        later.click();
        clicked = true;
      }
      const pwaClose = document.querySelector('.pwa-dismiss-button');
      if (pwaClose) {
        pwaClose.click();
        clicked = true;
      }
      return clicked || document.body.innerText.includes('30秒デモ');
    });
    cleanStreak = hadOverlay ? 0 : cleanStreak + 1;
    await wait(600);
  }
}

async function seedTutorialDemo(page) {
  await page.waitForSelector('[data-testid="tutorial-trigger"]', { timeout: 20000 });
  await page.evaluate(() => document.querySelector('[data-testid="tutorial-trigger"]')?.click());
  await page.waitForSelector('[data-testid="first-run-tutorial"]', { timeout: 10000 });
  await page.evaluate(() => {
    const dialog = document.querySelector('[data-testid="first-run-tutorial"]');
    const steps = dialog?.querySelectorAll('.tutorial-progress button');
    steps?.[steps.length - 1]?.click();
  });
  await wait(300);
  await page.evaluate(() => document.querySelector('[data-testid="tutorial-start-demo"]')?.click());
  await page.waitForFunction(() => window.location.pathname === '/emr', { timeout: 20000 });
  await wait(2500);
  const url = new URL(page.url());
  return url.searchParams.get('visitId');
}

async function capture(page, path) {
  await wait(800);
  await page.screenshot({ path });
  console.log(`saved: ${path}`);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const userDataDir = await mkdtemp(join(tmpdir(), 'yakureki-shots-'));
  const browser = await puppeteer.launch({
    headless: 'new',
    userDataDir,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=ja-JP', '--font-render-hinting=none']
  });

  try {
    const page = await browser.newPage();
    // 業務別30秒デモの自動表示は表示タイミングが非決定的なため、
    // 「閲覧済み」として扱わせて自動オープン自体を無効化する(手動オープンは可能なまま)
    await page.evaluateOnNewDocument(() => {
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function patchedGetItem(key) {
        if (String(key).startsWith('yakureki:workflow-tutorial:')) {
          return '2026-01-01T00:00:00.000Z';
        }
        return originalGetItem.call(this, key);
      };
    });
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await ensureInitialAdmin(page);
    await dismissOverlays(page);

    const visitId = await seedTutorialDemo(page);
    if (!visitId) throw new Error('デモ受付IDを取得できませんでした。');

    // 1. 薬歴(EMR): 患者バナー+副作用歴アラート+SOAP
    await dismissOverlays(page);
    await capture(page, join(outputDir, 'emr-soap.png'));

    // 2. ピッキング支援モーダル(GS1照合・指示CSV・結果取込)
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')]
        .find((candidate) => candidate.textContent?.includes('ピッキング支援'));
      button?.click();
    });
    await wait(900);
    await dismissOverlays(page);
    // 30秒デモを閉じた後、ピッキング支援本体のフッター(指示CSV)が見えるまで待つ
    await page.waitForSelector('[data-testid="picking-instruction-export"]', { timeout: 10000 });
    await capture(page, join(outputDir, 'picking.png'));

    // 3. ダッシュボード(対応キュー・KPI・デモ残存バナー)
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => document.body.innerText.includes('本日の業務'),
      { timeout: 30000 }
    );
    await dismissOverlays(page);
    await capture(page, join(outputDir, 'dashboard.png'));

    // 4. 薬剤師確認・印刷/請求画面
    await page.goto(`${baseUrl}/print/${encodeURIComponent(visitId)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => document.body.innerText.includes('薬剤師確認') || document.body.innerText.includes('調剤録'),
      { timeout: 30000 }
    );
    await dismissOverlays(page);
    await capture(page, join(outputDir, 'print.png'));

    console.log('done.');
  } finally {
    await browser.close();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
