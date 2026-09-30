import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NEXT_BIN = join(__dirname, '..', 'node_modules', '.bin', 'next');

const port = 3470;
const baseUrl = `http://127.0.0.1:${port}`;

const artifactDir = '/Users/takeaki/.gemini/antigravity-ide/brain/30ea8a4b-6e84-41f1-b254-cb9de74708a4/.tempmediaStorage';
const localArtifactDir = join(process.cwd(), 'artifacts', 'emr-design-before');

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

    // 1280px キャプチャ
    console.log('Capturing 1280px...');
    await page.setViewport({ width: 1280, height: 1000 });
    await wait(1000);
    await page.screenshot({ path: join(localArtifactDir, 'before_1280px.png'), fullPage: true });
    await page.screenshot({ path: join(artifactDir, 'before_1280px.png'), fullPage: true });

    // 768px キャプチャ
    console.log('Capturing 768px...');
    await page.setViewport({ width: 768, height: 1000 });
    await wait(1000);
    await page.screenshot({ path: join(localArtifactDir, 'before_768px.png'), fullPage: true });
    await page.screenshot({ path: join(artifactDir, 'before_768px.png'), fullPage: true });

    // 375px キャプチャ
    console.log('Capturing 375px...');
    await page.setViewport({ width: 375, height: 1000 });
    await wait(1000);
    await page.screenshot({ path: join(localArtifactDir, 'before_375px.png'), fullPage: true });
    await page.screenshot({ path: join(artifactDir, 'before_375px.png'), fullPage: true });

    console.log('All baseline captures complete!');
  } finally {
    if (browser) await browser.close();
    if (server) await stopServer(server);
  }
}

run().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
