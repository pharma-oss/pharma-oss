import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NEXT_BIN = join(__dirname, '..', 'node_modules', '.bin', 'next');

const port = 3473;
const baseUrl = `http://127.0.0.1:${port}`;

const artifactDir = '/Users/takeaki/.gemini/antigravity-ide/brain/30ea8a4b-6e84-41f1-b254-cb9de74708a4/.tempmediaStorage';
const localArtifactDir = join(process.cwd(), 'artifacts', 'ocr-design-after');

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

    // Pre-populate localStorage to suppress tutorials and onboarding
    await page.evaluateOnNewDocument(() => {
      ['input', 'picking', 'medication'].forEach(kind => {
        ['demo-pharmacist', 'anonymous', 'default', 'admin', 'user-1'].forEach(uid => {
          localStorage.setItem(`yakureki:workflow-tutorial:v1:${uid}:${kind}`, 'seen');
        });
      });
      localStorage.setItem('yakureki:onboarding-completed', 'true');
      localStorage.setItem('pharma-oss:first-time-modal-dismissed', 'true');
    });

    // Seed demo at root
    console.log('Visiting root to seed demo...');
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2' });
    await wait(2000);

    // Click demo button using precise testid
    console.log('Clicking demo start button via testid or class...');
    await page.evaluate(() => {
      const demoBtn = document.querySelector('button[data-testid="pre-login-tour-start-guest-demo"]') ||
                      document.querySelector('.btn-resume-demo');
      if (demoBtn) {
        demoBtn.click();
      }
    });

    // Wait for redirect to /emr
    console.log('Waiting for redirect to /emr...');
    await wait(4000);
    console.log('Current URL after wait:', page.url());

    // 1. /ocr にアクセス（受付選択初期画面）
    console.log('Visiting /ocr...');
    await page.goto(`${baseUrl}/ocr`, { waitUntil: 'networkidle2' });
    await wait(2500);

    // Close any dialogs if still open
    await page.evaluate(() => {
      const dialogs = document.querySelectorAll('dialog');
      dialogs.forEach(d => {
        try { d.close(); } catch {}
      });
      const closeButtons = Array.from(document.querySelectorAll('.workflow-demo-close, button'));
      const closeBtn = closeButtons.find(b =>
        (b.textContent || '').includes('あとで見る') ||
        (b.textContent || '').includes('閉じる')
      );
      if (closeBtn) closeBtn.click();
    });
    await wait(1000);

    for (const width of [1280, 768, 375]) {
      console.log(`Capturing initial view at ${width}px...`);
      await page.setViewport({ width, height: 900 });
      await wait(600);
      await page.screenshot({ path: join(localArtifactDir, `after_choice_${width}px.png`), fullPage: true });
      await page.screenshot({ path: join(artifactDir, `after_choice_${width}px.png`), fullPage: true });

      const metrics = await page.evaluate((w) => {
        const bodyScrollWidth = document.body.scrollWidth;
        const docScrollWidth = document.documentElement.scrollWidth;
        const uploadZone = document.querySelector('.upload-zone')?.getBoundingClientRect();
        const manualCard = document.querySelector('.manual-entry-card')?.getBoundingClientRect();
        return {
          width: w,
          overflow: Math.max(bodyScrollWidth, docScrollWidth) > w,
          scrollWidth: Math.max(bodyScrollWidth, docScrollWidth),
          uploadZone: uploadZone ? { left: uploadZone.left, right: uploadZone.right, width: uploadZone.width } : null,
          manualCard: manualCard ? { left: manualCard.left, right: manualCard.right, width: manualCard.width } : null,
        };
      }, width);
      console.log(`[After Initial ${width}px Metrics]:`, JSON.stringify(metrics, null, 2));
    }

    // 2. 手入力カードをクリックして処方入力ワークベンチへ遷移
    console.log('Clicking manual entry card to open prescription workbench...');
    await page.evaluate(() => {
      const card = document.querySelector('.manual-entry-card');
      if (card) card.click();
    });
    await wait(2500);

    for (const width of [1280, 768, 375]) {
      console.log(`Capturing form view at ${width}px...`);
      await page.setViewport({ width, height: 900 });
      await wait(800);
      await page.screenshot({ path: join(localArtifactDir, `after_form_${width}px.png`), fullPage: true });
      await page.screenshot({ path: join(artifactDir, `after_form_${width}px.png`), fullPage: true });

      const metrics = await page.evaluate((w) => {
        const bodyScrollWidth = document.body.scrollWidth;
        const docScrollWidth = document.documentElement.scrollWidth;
        const formActions = document.querySelector('.form-actions')?.getBoundingClientRect();
        const cancelBtn = document.querySelector('.form-actions button.btn-secondary')?.getBoundingClientRect();
        const primaryBtn = document.querySelector('.form-actions button.btn-primary')?.getBoundingClientRect();
        const usageSelector = document.querySelector('.usage-selector-wrap')?.getBoundingClientRect();
        const selectUsageBtn = document.querySelector('.btn-select-usage')?.getBoundingClientRect();
        const rpFooter = document.querySelector('.rp-prescription-footer')?.getBoundingClientRect();

        return {
          width: w,
          overflow: Math.max(bodyScrollWidth, docScrollWidth) > w,
          scrollWidth: Math.max(bodyScrollWidth, docScrollWidth),
          formActions: formActions ? { left: formActions.left, right: formActions.right, width: formActions.width } : null,
          cancelBtn: cancelBtn ? {
            left: cancelBtn.left,
            right: cancelBtn.right,
            width: cancelBtn.width,
            visible: cancelBtn.left >= 0 && cancelBtn.right <= w
          } : null,
          primaryBtn: primaryBtn ? {
            left: primaryBtn.left,
            right: primaryBtn.right,
            width: primaryBtn.width,
            visible: primaryBtn.left >= 0 && primaryBtn.right <= w
          } : null,
          usageSelector: usageSelector ? { left: usageSelector.left, right: usageSelector.right, width: usageSelector.width } : null,
          selectUsageBtn: selectUsageBtn ? {
            left: selectUsageBtn.left,
            right: selectUsageBtn.right,
            width: selectUsageBtn.width,
            overflowsCard: rpFooter ? selectUsageBtn.right > rpFooter.right : false
          } : null
        };
      }, width);
      console.log(`[After Form ${width}px Metrics]:`, JSON.stringify(metrics, null, 2));
    }

    console.log('All after captures and measurements complete!');
  } finally {
    if (browser) await browser.close();
    if (server) await stopServer(server);
  }
}

run().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
