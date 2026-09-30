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
const localArtifactDir = join(process.cwd(), 'artifacts', 'inventory-design-before');

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

    // 1. 在庫一覧画面 (/inventory)
    console.log('Visiting /inventory...');
    await page.goto(`${baseUrl}/inventory`, { waitUntil: 'networkidle2' });
    await wait(2500);

    for (const width of [1280, 768, 375]) {
      console.log(`Capturing inventory (drugs tab) at ${width}px...`);
      await page.setViewport({ width, height: 900 });
      await wait(800);

      await page.screenshot({ path: join(localArtifactDir, `before_inventory_drugs_${width}px.png`), fullPage: true });
      await page.screenshot({ path: join(artifactDir, `before_inventory_drugs_${width}px.png`), fullPage: true });

      const metrics = await page.evaluate((w) => {
        const bodyScrollWidth = document.body.scrollWidth;
        const docScrollWidth = document.documentElement.scrollWidth;
        const pageHeader = document.querySelector('.page-header')?.getBoundingClientRect();
        const tabs = document.querySelector('.tabs')?.getBoundingClientRect();
        const searchBar = document.querySelector('.search-bar')?.getBoundingClientRect();
        const drugList = document.querySelector('.drug-list')?.getBoundingClientRect();
        const dataTable = document.querySelector('.data-table')?.getBoundingClientRect();
        const alertBox = document.querySelector('.inventory-alert')?.getBoundingClientRect();

        return {
          tab: 'drugs',
          width: w,
          overflow: Math.max(bodyScrollWidth, docScrollWidth) > w,
          scrollWidth: Math.max(bodyScrollWidth, docScrollWidth),
          pageHeader: pageHeader ? { left: pageHeader.left, right: pageHeader.right, width: pageHeader.width } : null,
          tabs: tabs ? { left: tabs.left, right: tabs.right, width: tabs.width } : null,
          searchBar: searchBar ? { left: searchBar.left, right: searchBar.right, width: searchBar.width } : null,
          drugList: drugList ? { left: drugList.left, right: drugList.right, width: drugList.width } : null,
          dataTable: dataTable ? { left: dataTable.left, right: dataTable.right, width: dataTable.width } : null,
          alertBox: alertBox ? { left: alertBox.left, right: alertBox.right, width: alertBox.width } : null
        };
      }, width);

      console.log(`[Inventory Drugs ${width}px Metrics]:`, JSON.stringify(metrics, null, 2));
    }

    // 2. 発注ワークベンチ (/inventory?tab=order-workbench)
    console.log('Visiting /inventory?tab=order-workbench...');
    await page.goto(`${baseUrl}/inventory?tab=order-workbench`, { waitUntil: 'networkidle2' });
    await wait(2500);

    for (const width of [1280, 768, 375]) {
      console.log(`Capturing inventory (order-workbench tab) at ${width}px...`);
      await page.setViewport({ width, height: 900 });
      await wait(800);

      await page.screenshot({ path: join(localArtifactDir, `before_inventory_order_${width}px.png`), fullPage: true });
      await page.screenshot({ path: join(artifactDir, `before_inventory_order_${width}px.png`), fullPage: true });

      const metrics = await page.evaluate((w) => {
        const bodyScrollWidth = document.body.scrollWidth;
        const docScrollWidth = document.documentElement.scrollWidth;
        const workbenchHeader = document.querySelector('.order-workbench-header')?.getBoundingClientRect();
        const workbenchActions = document.querySelector('.order-workbench-actions')?.getBoundingClientRect();
        const actionButtons = Array.from(document.querySelectorAll('.order-workbench-actions button')).map(b => {
          const rect = b.getBoundingClientRect();
          return { text: b.textContent?.trim(), left: rect.left, right: rect.right, width: rect.width };
        });
        const summaryGrid = document.querySelector('.order-summary-grid')?.getBoundingClientRect();
        const candidateRows = Array.from(document.querySelectorAll('.order-candidate-row')).map(r => {
          const rect = r.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width };
        });

        return {
          tab: 'order-workbench',
          width: w,
          overflow: Math.max(bodyScrollWidth, docScrollWidth) > w,
          scrollWidth: Math.max(bodyScrollWidth, docScrollWidth),
          workbenchHeader: workbenchHeader ? { left: workbenchHeader.left, right: workbenchHeader.right, width: workbenchHeader.width } : null,
          workbenchActions: workbenchActions ? { left: workbenchActions.left, right: workbenchActions.right, width: workbenchActions.width } : null,
          actionButtons,
          summaryGrid: summaryGrid ? { left: summaryGrid.left, right: summaryGrid.right, width: summaryGrid.width } : null,
          candidateRowsCount: candidateRows.length,
          firstCandidateRow: candidateRows[0] || null
        };
      }, width);

      console.log(`[Inventory Order ${width}px Metrics]:`, JSON.stringify(metrics, null, 2));
    }

    console.log('Baseline capture completed successfully!');
  } finally {
    if (browser) await browser.close();
    if (server) await stopServer(server);
  }
}

run().catch((err) => {
  console.error('Fatal error in capture script:', err);
  process.exit(1);
});
