import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NEXT_BIN = join(__dirname, '..', 'node_modules', '.bin', 'next');

const port = 3485;
const baseUrl = `http://127.0.0.1:${port}`;

const artifactDir = '/Users/takeaki/.gemini/antigravity-ide/brain/30ea8a4b-6e84-41f1-b254-cb9de74708a4/.tempmediaStorage';
const localArtifactDir = join(process.cwd(), 'artifacts', 'settings-design-before');

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
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err));

    // Pre-populate localStorage to suppress tutorials and set admin session
    await page.evaluateOnNewDocument(() => {
      ['input', 'picking', 'medication'].forEach(kind => {
        ['demo-pharmacist', 'anonymous', 'default', 'admin', 'user-1'].forEach(uid => {
          localStorage.setItem(`yakureki:workflow-tutorial:v1:${uid}:${kind}`, 'seen');
        });
      });
      localStorage.setItem('yakureki:onboarding-completed', 'true');
      localStorage.setItem('pharma-oss:first-time-modal-dismissed', 'true');
      // Set current user as admin
      localStorage.setItem('pharma-oss:current-user', JSON.stringify({
        id: 'admin',
        username: 'admin',
        role: 'admin',
        displayName: '管理者',
        passkeyRegistered: true
      }));
    });

    // Seed demo at root
    console.log('Visiting root to seed demo...');
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2' });
    await wait(2000);

    const clickResult = await page.evaluate(() => {
      const demoBtn = document.querySelector('button[data-testid="pre-login-tour-start-guest-demo"]') ||
                      document.querySelector('.btn-resume-demo');
      if (demoBtn) {
        demoBtn.click();
        return 'clicked demoBtn: ' + (demoBtn.getAttribute('data-testid') || demoBtn.className);
      }
      return 'no demo button found';
    });
    console.log('Click result:', clickResult);
    await wait(3000);

    // 1. 設定画面: 施設基準設定 (facility)
    console.log('Visiting /settings?tab=facility...');
    await page.goto(`${baseUrl}/settings?tab=facility`, { waitUntil: 'networkidle2' });
    await wait(2000);

    for (const width of [1280, 768, 375]) {
      console.log(`Capturing settings (facility) at ${width}px...`);
      await page.setViewport({ width, height: 900 });
      await wait(800);

      await page.screenshot({ path: join(localArtifactDir, `before_settings_facility_${width}px.png`), fullPage: true });
      await page.screenshot({ path: join(artifactDir, `before_settings_facility_${width}px.png`), fullPage: true });

      const metrics = await page.evaluate((w) => {
        const bodyScrollWidth = document.body.scrollWidth;
        const docScrollWidth = document.documentElement.scrollWidth;
        const panel = document.querySelector('.initial-setup-panel')?.getBoundingClientRect();
        const tabs = document.querySelector('.section-tabs')?.getBoundingClientRect();
        const container = document.querySelector('.settings-container')?.getBoundingClientRect();

        return {
          tab: 'facility',
          width: w,
          overflow: Math.max(bodyScrollWidth, docScrollWidth) > w,
          scrollWidth: Math.max(bodyScrollWidth, docScrollWidth),
          panel: panel ? { left: panel.left, right: panel.right, width: panel.width } : null,
          tabs: tabs ? { left: tabs.left, right: tabs.right, width: tabs.width } : null,
          container: container ? { left: container.left, right: container.right, width: container.width } : null
        };
      }, width);

      console.log(`[Settings Facility ${width}px Metrics]:`, JSON.stringify(metrics, null, 2));
    }

    // 2. 設定画面: スタッフ管理 (staff)
    console.log('Visiting /settings?tab=staff...');
    await page.goto(`${baseUrl}/settings?tab=staff`, { waitUntil: 'networkidle2' });
    await wait(2000);

    for (const width of [1280, 768, 375]) {
      console.log(`Capturing settings (staff) at ${width}px...`);
      await page.setViewport({ width, height: 900 });
      await wait(800);

      await page.screenshot({ path: join(localArtifactDir, `before_settings_staff_${width}px.png`), fullPage: true });
      await page.screenshot({ path: join(artifactDir, `before_settings_staff_${width}px.png`), fullPage: true });
    }

    console.log('Baseline capture complete!');
  } finally {
    if (browser) await browser.close();
    if (server) await stopServer(server);
  }
}

run().catch((err) => {
  console.error('Capture baseline error:', err);
  process.exit(1);
});
