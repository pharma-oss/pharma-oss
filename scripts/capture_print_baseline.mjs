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
const localArtifactDir = join(process.cwd(), 'artifacts', 'print-design-before');

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
    console.log('Clicking demo start button...');
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

    // Wait for redirect to /emr?visitId=...
    console.log('Waiting for redirect to /emr...');
    await wait(4000);
    const emrUrl = page.url();
    console.log('Current URL after wait:', emrUrl);

    // Extract visitId
    const urlObj = new URL(emrUrl);
    const visitId = urlObj.searchParams.get('visitId') || 'v_demo_round1';
    console.log('Target visitId:', visitId);

    // Navigate to /print/[visitId]
    const printUrl = `${baseUrl}/print/${visitId}`;
    console.log('Visiting print page:', printUrl);
    await page.goto(printUrl, { waitUntil: 'networkidle2' });
    await wait(3000);

    // Close any lingering dialogs
    await page.evaluate(() => {
      const dialogs = document.querySelectorAll('dialog');
      dialogs.forEach(d => {
        try { d.close(); } catch {}
      });
    });

    for (const width of [1280, 768, 375]) {
      console.log(`Capturing print page at ${width}px...`);
      await page.setViewport({ width, height: 900 });
      await wait(800);

      await page.screenshot({ path: join(localArtifactDir, `before_print_${width}px.png`), fullPage: true });
      await page.screenshot({ path: join(artifactDir, `before_print_${width}px.png`), fullPage: true });

      const metrics = await page.evaluate((w) => {
        const bodyScrollWidth = document.body.scrollWidth;
        const docScrollWidth = document.documentElement.scrollWidth;
        const printHeader = document.querySelector('.print-header')?.getBoundingClientRect();
        const headerButtons = Array.from(document.querySelectorAll('.print-header button')).map(b => {
          const rect = b.getBoundingClientRect();
          return { text: b.textContent?.trim(), left: rect.left, right: rect.right, width: rect.width };
        });
        const consolePanel = document.querySelector('.receipt-console-panel')?.getBoundingClientRect();
        const flowGrid = document.querySelector('.receipt-flow-grid')?.getBoundingClientRect();
        const claimLifecycleGrid = document.querySelector('.claim-lifecycle-grid')?.getBoundingClientRect();
        const claimActions = document.querySelector('.claim-lifecycle-actions')?.getBoundingClientRect();
        const pharmacistPanel = document.querySelector('.pharmacist-check-panel')?.getBoundingClientRect();
        const pharmacistActions = document.querySelector('.claim-header-actions')?.getBoundingClientRect();
        const dispensingRecordCard = document.querySelector('.dispensing-record-card')?.getBoundingClientRect();
        const receiptCard = document.querySelector('.receipt-preview-card, .paper-preview-card')?.getBoundingClientRect();

        return {
          width: w,
          overflow: Math.max(bodyScrollWidth, docScrollWidth) > w,
          scrollWidth: Math.max(bodyScrollWidth, docScrollWidth),
          printHeader: printHeader ? { left: printHeader.left, right: printHeader.right, width: printHeader.width } : null,
          headerButtons,
          consolePanel: consolePanel ? { left: consolePanel.left, right: consolePanel.right, width: consolePanel.width } : null,
          flowGrid: flowGrid ? { left: flowGrid.left, right: flowGrid.right, width: flowGrid.width } : null,
          claimLifecycleGrid: claimLifecycleGrid ? { left: claimLifecycleGrid.left, right: claimLifecycleGrid.right, width: claimLifecycleGrid.width } : null,
          claimActions: claimActions ? { left: claimActions.left, right: claimActions.right, width: claimActions.width } : null,
          pharmacistPanel: pharmacistPanel ? { left: pharmacistPanel.left, right: pharmacistPanel.right, width: pharmacistPanel.width } : null,
          pharmacistActions: pharmacistActions ? { left: pharmacistActions.left, right: pharmacistActions.right, width: pharmacistActions.width } : null,
          dispensingRecordCard: dispensingRecordCard ? { left: dispensingRecordCard.left, right: dispensingRecordCard.right, width: dispensingRecordCard.width } : null,
          receiptCard: receiptCard ? { left: receiptCard.left, right: receiptCard.right, width: receiptCard.width } : null
        };
      }, width);

      console.log(`[Print ${width}px Metrics]:`, JSON.stringify(metrics, null, 2));
    }

    console.log('Capture completed successfully!');
  } finally {
    if (browser) await browser.close();
    if (server) await stopServer(server);
  }
}

run().catch((err) => {
  console.error('Fatal error in capture script:', err);
  process.exit(1);
});
