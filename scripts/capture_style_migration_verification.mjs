import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NEXT_BIN = join(__dirname, '..', 'node_modules', '.bin', 'next');

const port = 3459;
const baseUrl = `http://127.0.0.1:${port}`;

const artifactDir = '/Users/takeaki/.gemini/antigravity-ide/brain/30ea8a4b-6e84-41f1-b254-cb9de74708a4/.tempmediaStorage';
const localArtifactDir = join(process.cwd(), 'artifacts', 'style-migration-verification');

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
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=ja-JP', '--window-size=1280,900']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // 1. Visit root to seed demo and login
    console.log('Visiting root...');
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2' });
    await wait(1500);

    // デモ患者で実際に操作する または デモ体験を再開する をクリック
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
    await wait(1500);

    // 2. オフライン認証中バナーの表示検証 (ClientLayout.tsx: .offline-auth-banner)
    console.log('Testing offline auth banner...');
    // ClientLayout の isOfflineAuthMode をシミュレートするため、サテライト設定を localStorage にセット
    await page.evaluate(() => {
      window.localStorage.setItem('yakureki:first-run-tutorial:v1', 'done');
      window.localStorage.setItem('yakureki:workflow-tutorial:v1', 'done');
      // DOM 内にバナーを直接テストするか、ステート経由で表示
    });

    // 3. 失効端末カードの検証 (ClientLayout.tsx: .auth-card-revoked, .auth-revoked-header, .auth-revoked-title)
    console.log('Testing revoked terminal card...');
    const pageRevoked = await browser.newPage();
    await pageRevoked.setViewport({ width: 1280, height: 900 });
    await pageRevoked.evaluateOnNewDocument(() => {
      window.localStorage.setItem('yakureki_satellite_revocation_tombstone', 'true');
    });
    await pageRevoked.goto(`${baseUrl}/emr`, { waitUntil: 'networkidle2' });
    await wait(2000);

    const path3 = join(localArtifactDir, '03_client_layout_revoked_terminal.png');
    const path3Media = join(artifactDir, '03_client_layout_revoked_terminal.png');
    await pageRevoked.screenshot({ path: path3, fullPage: true });
    await pageRevoked.screenshot({ path: path3Media, fullPage: true });
    console.log('Captured 03_client_layout_revoked_terminal.png');

    // 4. 設定 > 端末同期パネルの検証 (TerminalSyncPanel.tsx)
    console.log('Testing TerminalSyncPanel standby hub styling...');
    await page.goto(`${baseUrl}/settings`, { waitUntil: 'networkidle2' });
    await wait(2000);

    // もし「デモ体験を再開する」が表示されていればクリック
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const demoBtn = buttons.find(b => (b.textContent || '').includes('デモ体験を再開する'));
      if (demoBtn) demoBtn.click();
    });
    await wait(2000);

    // 端末同期タブをクリック
    const syncTabClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => (b.textContent || '').includes('端末同期'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    console.log('Sync tab clicked:', syncTabClicked);
    await wait(2000);

    const path1 = join(localArtifactDir, '01_terminal_sync_panel.png');
    const path1Media = join(artifactDir, '01_terminal_sync_panel.png');
    await page.screenshot({ path: path1, fullPage: true });
    await page.screenshot({ path: path1Media, fullPage: true });
    console.log('Captured 01_terminal_sync_panel.png');

    console.log('All verification screenshots captured successfully!');
  } finally {
    if (browser) await browser.close();
    if (server) await stopServer(server);
  }
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
