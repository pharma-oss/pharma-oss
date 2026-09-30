import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NEXT_BIN = join(__dirname, '..', 'node_modules', '.bin', 'next');

const port = 3475;
const baseUrl = `http://127.0.0.1:${port}`;

const artifactDir = '/Users/takeaki/.gemini/antigravity-ide/brain/30ea8a4b-6e84-41f1-b254-cb9de74708a4/.tempmediaStorage';
const localArtifactDir = join(process.cwd(), 'artifacts', 'emr-design-after');

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

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function startServer(p) {
  const child = spawn(NEXT_BIN, ['start', '-p', String(p)], {
    env: { ...process.env, PORT: String(p) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  let output = '';
  child.stdout?.on('data', (chunk) => { output += chunk; });
  child.stderr?.on('data', (chunk) => { output += chunk; });
  return {
    child,
    getOutput: () => output
  };
}

async function stopServer(server) {
  if (!server?.child?.pid) return;
  const pid = server.child.pid;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      server.child.kill('SIGTERM');
    } catch {}
  }
}

async function waitForServerReady(url) {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${url}/api/sync/config`);
      if (res.ok) return true;
    } catch {}
    await wait(1000);
  }
  throw new Error(`Server at ${url} failed to become ready`);
}

async function run() {
  await mkdir(localArtifactDir, { recursive: true });
  await mkdir(artifactDir, { recursive: true });

  let server;
  let browser;

  try {
    console.log('Starting Next server on port', port);
    server = startServer(port);
    await waitForServerReady(baseUrl);
    console.log('Server is ready!');

    browser = await puppeteer.launch({
      executablePath: findChromePath(),
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=ja-JP']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1000 });

    // Seed demo
    console.log('Visiting root to seed demo...');
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2' });
    await wait(1500);

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const startBtn = buttons.find(b =>
        (b.textContent || '').includes('デモ患者で実際に操作する') ||
        (b.textContent || '').includes('デモ体験を再開する')
      );
      if (startBtn) startBtn.click();
    });
    await wait(2500);

    // チュートリアルモーダルの「薬歴を始める」をクリック
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const startBtn = buttons.find(b => (b.textContent || '').includes('薬歴を始める'));
      if (startBtn) startBtn.click();
    });
    await wait(2000);

    // 1280px キャプチャ & 横はみ出しチェック
    console.log('Capturing 1280px...');
    await page.setViewport({ width: 1280, height: 1000 });
    await wait(1000);
    const scrollWidth1280 = await page.evaluate(() => document.documentElement.scrollWidth);
    const isOverflow1280 = scrollWidth1280 > 1280;
    console.log(`1280px: scrollWidth=${scrollWidth1280}, overflow=${isOverflow1280}`);
    await page.screenshot({ path: join(localArtifactDir, 'after_1280px.png'), fullPage: true });
    await page.screenshot({ path: join(artifactDir, 'after_1280px.png'), fullPage: true });

    // 768px キャプチャ & 横はみ出しチェック
    console.log('Capturing 768px...');
    await page.setViewport({ width: 768, height: 1000 });
    await wait(1000);
    const scrollWidth768 = await page.evaluate(() => document.documentElement.scrollWidth);
    const isOverflow768 = scrollWidth768 > 768;
    console.log(`768px: scrollWidth=${scrollWidth768}, overflow=${isOverflow768}`);
    await page.screenshot({ path: join(localArtifactDir, 'after_768px.png'), fullPage: true });
    await page.screenshot({ path: join(artifactDir, 'after_768px.png'), fullPage: true });

    // 375px キャプチャ & 横はみ出しチェック & ボタン位置チェック
    console.log('Capturing 375px...');
    await page.setViewport({ width: 375, height: 1000 });
    await wait(1000);
    const scrollWidth375 = await page.evaluate(() => document.documentElement.scrollWidth);
    const isOverflow375 = scrollWidth375 > 375;
    const actionButtonsMetrics = await page.evaluate(() => {
      const actions = document.querySelector('.emr-actions');
      if (!actions) return null;
      const rect = actions.getBoundingClientRect();
      const btns = Array.from(actions.querySelectorAll('button')).map(b => {
        const bRect = b.getBoundingClientRect();
        return {
          text: b.textContent?.trim().slice(0, 30),
          left: bRect.left,
          right: bRect.right,
          width: bRect.width,
          visible: bRect.left >= 0 && bRect.right <= window.innerWidth
        };
      });
      return { containerRect: { left: rect.left, right: rect.right, width: rect.width }, btns };
    });
    console.log(`375px: scrollWidth=${scrollWidth375}, overflow=${isOverflow375}`);
    console.log('375px action buttons metrics:', JSON.stringify(actionButtonsMetrics, null, 2));

    await page.screenshot({ path: join(localArtifactDir, 'after_375px.png'), fullPage: true });
    await page.screenshot({ path: join(artifactDir, 'after_375px.png'), fullPage: true });

    console.log('All after captures complete!');
  } finally {
    if (browser) await browser.close();
    if (server) await stopServer(server);
  }
}

run().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
