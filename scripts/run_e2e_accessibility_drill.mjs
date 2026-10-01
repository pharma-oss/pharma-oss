import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NEXT_BIN = join(__dirname, '..', 'node_modules', '.bin', 'next');

const port = 3480;
const baseUrl = `http://127.0.0.1:${port}`;

const artifactDir = '/Users/takeaki/.gemini/antigravity-ide/brain/30ea8a4b-6e84-41f1-b254-cb9de74708a4/.tempmediaStorage';
const localArtifactDir = join(process.cwd(), 'artifacts', 'accessibility-e2e-drill');

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

async function checkOverflow(page, expectedWidth) {
  return await page.evaluate((w) => {
    const docWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body.scrollWidth;
    const actualWidth = Math.max(docWidth, bodyWidth);
    return {
      expectedWidth: w,
      actualWidth,
      overflowPx: Math.max(0, actualWidth - w),
      hasOverflow: actualWidth > w
    };
  }, expectedWidth);
}

async function run() {
  await mkdir(localArtifactDir, { recursive: true });
  await mkdir(artifactDir, { recursive: true });

  const results = {
    timestamp: new Date().toISOString(),
    viewports: [1280, 768, 375],
    screens: {},
    keyboardFlow: {},
    summary: { passed: true, overflowErrors: 0, keyboardErrors: 0 }
  };

  let server;
  let browser;

  try {
    console.log('[E2E Drill] Starting Next.js server on port', port);
    server = startServer(port);
    await waitForServerReady(baseUrl);
    console.log('[E2E Drill] Server ready!');

    browser = await puppeteer.launch({
      executablePath: findChromePath(),
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=ja-JP']
    });

    const page = await browser.newPage();
    page.on('pageerror', err => console.error('[Page Error]:', err.message));

    // Suppress tutorial modals and pre-populate onboarding
    await page.evaluateOnNewDocument(() => {
      ['input', 'picking', 'medication'].forEach(kind => {
        ['demo-pharmacist', 'anonymous', 'default', 'admin', 'user-1'].forEach(uid => {
          localStorage.setItem(`yakureki:workflow-tutorial:v1:${uid}:${kind}`, 'seen');
        });
      });
      localStorage.setItem('yakureki:onboarding-completed', 'true');
      localStorage.setItem('pharma-oss:first-time-modal-dismissed', 'true');
    });

    // 0. Seed Demo Data at Root and Obtain Valid visitId
    console.log('[E2E Drill] Seeding demo data at / and obtaining valid visitId...');
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2' });
    await wait(2000);

    const demoStartClicked = await page.evaluate(() => {
      const demoBtn = document.querySelector('button[data-testid="pre-login-tour-start-guest-demo"]') ||
                      document.querySelector('.btn-resume-demo');
      if (demoBtn) {
        demoBtn.click();
        return true;
      }
      return false;
    });
    console.log('[E2E Drill] Demo start clicked:', demoStartClicked);

    // Wait for redirect to /emr?visitId=...
    await wait(4000);
    const redirectUrl = page.url();
    console.log('[E2E Drill] Current URL after demo start:', redirectUrl);

    let visitId = 'v_demo_round1';
    try {
      const urlObj = new URL(redirectUrl);
      const extractedId = urlObj.searchParams.get('visitId');
      if (extractedId) visitId = extractedId;
    } catch {}
    console.log('[E2E Drill] Verified active visitId for flow:', visitId);

    // Dismiss any residual dialogs
    const dismissDialogs = async () => {
      await page.evaluate(() => {
        document.querySelectorAll('dialog').forEach(d => { try { d.close(); } catch {} });
        const closeButtons = Array.from(document.querySelectorAll('.workflow-demo-close, button'));
        const closeBtn = closeButtons.find(b =>
          (b.textContent || '').includes('あとで見る') ||
          (b.textContent || '').includes('閉じる')
        );
        if (closeBtn) closeBtn.click();
      });
      await wait(500);
    };

    // 1. Screen: /ocr (Prescription Reception)
    console.log('[E2E Drill] 1. Testing /ocr (Prescription Intake)...');
    results.screens.ocr = {};
    for (const width of [1280, 768, 375]) {
      await page.setViewport({ width, height: 900 });
      await page.goto(`${baseUrl}/ocr`, { waitUntil: 'networkidle2' });
      await wait(2000);
      await dismissDialogs();

      const overflow = await checkOverflow(page, width);
      results.screens.ocr[`${width}px`] = overflow;
      if (overflow.hasOverflow) {
        results.summary.passed = false;
        results.summary.overflowErrors++;
      }

      const shotName = `e2e_drill_ocr_${width}px.png`;
      await page.screenshot({ path: join(localArtifactDir, shotName), fullPage: true });
      await page.screenshot({ path: join(artifactDir, shotName), fullPage: true });
      console.log(`  - /ocr @ ${width}px: overflow = ${overflow.overflowPx}px (Shot: ${shotName})`);
    }

    // Keyboard check on /ocr: Tab navigation reaching interactive elements
    console.log('[E2E Drill] Testing keyboard focus on /ocr...');
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${baseUrl}/ocr`, { waitUntil: 'networkidle2' });
    await wait(1500);
    await dismissDialogs();

    let tabCount = 0;
    let focusedTag = '';
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      await wait(100);
      focusedTag = await page.evaluate(() => document.activeElement ? document.activeElement.tagName : 'NONE');
      if (focusedTag !== 'BODY' && focusedTag !== 'NONE') tabCount++;
    }
    if (tabCount === 0) {
      results.summary.passed = false;
      results.summary.keyboardErrors++;
    }
    results.keyboardFlow.ocr = { tabNavigableElements: tabCount, activeTagSample: focusedTag };
    console.log(`  - Keyboard Tab focus on /ocr reached ${tabCount} interactive elements.`);

    // 2. Screen: /emr (Medication History & SOAP)
    console.log('[E2E Drill] 2. Testing /emr (EMR & SOAP)...');
    results.screens.emr = {};
    for (const width of [1280, 768, 375]) {
      await page.setViewport({ width, height: 900 });
      await page.goto(`${baseUrl}/emr?visitId=${encodeURIComponent(visitId)}`, { waitUntil: 'networkidle2' });
      await wait(2000);
      await dismissDialogs();

      const overflow = await checkOverflow(page, width);
      results.screens.emr[`${width}px`] = overflow;
      if (overflow.hasOverflow) {
        results.summary.passed = false;
        results.summary.overflowErrors++;
      }

      const shotName = `e2e_drill_emr_${width}px.png`;
      await page.screenshot({ path: join(localArtifactDir, shotName), fullPage: true });
      await page.screenshot({ path: join(artifactDir, shotName), fullPage: true });
      console.log(`  - /emr @ ${width}px: overflow = ${overflow.overflowPx}px (Shot: ${shotName})`);
    }

    // Keyboard check on /emr
    console.log('[E2E Drill] Testing keyboard focus on /emr...');
    await page.goto(`${baseUrl}/emr?visitId=${encodeURIComponent(visitId)}`, { waitUntil: 'networkidle2' });
    await wait(1500);
    await dismissDialogs();

    tabCount = 0;
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      await wait(100);
      focusedTag = await page.evaluate(() => document.activeElement ? document.activeElement.tagName : 'NONE');
      if (focusedTag !== 'BODY' && focusedTag !== 'NONE') tabCount++;
    }
    if (tabCount === 0) {
      results.summary.passed = false;
      results.summary.keyboardErrors++;
    }
    results.keyboardFlow.emr = { tabNavigableElements: tabCount, activeTagSample: focusedTag };
    console.log(`  - Keyboard Tab focus on /emr reached ${tabCount} interactive elements.`);

    // 3. Screen: /print/[visitId] (Printing, Dispensing Record & Official UKE)
    console.log('[E2E Drill] 3. Testing /print (Print & Official UKE)...');
    results.screens.print = {};
    for (const width of [1280, 768, 375]) {
      await page.setViewport({ width, height: 900 });
      await page.goto(`${baseUrl}/print/${encodeURIComponent(visitId)}`, { waitUntil: 'networkidle2' });
      await wait(2000);
      await dismissDialogs();

      // Verify that this is not an error / not found screen
      const notFoundMessage = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        return bodyText.includes('印刷対象の受付が見つかりませんでした');
      });
      if (notFoundMessage) {
        console.error(`[E2E Drill] ERROR: Print page showed 'not found' for visitId: ${visitId}`);
        results.summary.passed = false;
        results.summary.overflowErrors++;
      }

      const overflow = await checkOverflow(page, width);
      results.screens.print[`${width}px`] = overflow;
      if (overflow.hasOverflow) {
        results.summary.passed = false;
        results.summary.overflowErrors++;
      }

      const shotName = `e2e_drill_print_${width}px.png`;
      await page.screenshot({ path: join(localArtifactDir, shotName), fullPage: true });
      await page.screenshot({ path: join(artifactDir, shotName), fullPage: true });
      console.log(`  - /print/${visitId} @ ${width}px: overflow = ${overflow.overflowPx}px (Shot: ${shotName})`);
    }

    // Modal check on /print: Open SingleOfficialUkeModal via Official UKE button
    console.log('[E2E Drill] Testing Official UKE Modal display on /print...');
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${baseUrl}/print/${encodeURIComponent(visitId)}`, { waitUntil: 'networkidle2' });
    await wait(2000);
    await dismissDialogs();

    const officialUkeBtn = await page.$('button[data-testid="print-official-uke-button"]');
    if (!officialUkeBtn) {
      console.error('[E2E Drill] ERROR: button[data-testid="print-official-uke-button"] not found on print page!');
      results.summary.passed = false;
      results.summary.keyboardErrors++;
      throw new Error('Official UKE button not found on /print page');
    }

    const btnDiag = await page.evaluate(() => {
      const btn = document.querySelector('button[data-testid="print-official-uke-button"]');
      const errNodes = Array.from(document.querySelectorAll('.claim-validation-badge, .claim-issue, .alert, .badge-error')).map(e => e.textContent?.trim());
      return {
        disabled: btn ? btn.disabled : null,
        className: btn ? btn.className : '',
        title: btn ? btn.title : '',
        text: btn ? btn.textContent?.trim() : '',
        visibleErrors: errNodes.slice(0, 5)
      };
    });
    console.log('[E2E Drill] Button diagnostics:', btnDiag);

    // If disabled, check why and handle click accordingly
    if (btnDiag.disabled) {
      console.warn('[E2E Drill] Official UKE button is disabled due to:', btnDiag.title, btnDiag.visibleErrors);
    }

    await officialUkeBtn.click();
    await wait(2000);

    const modalCheck = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="single-official-uke-modal"]') ||
                    document.querySelector('.single-official-uke-modal') ||
                    document.querySelector('.official-uke-modal');
      return {
        exists: !!modal,
        hasCyoHeader: !!(modal && modal.textContent && modal.textContent.includes('RECEIPTY.CYO'))
      };
    });

    if (!modalCheck.exists) {
      console.error('[E2E Drill] ERROR: SingleOfficialUkeModal did not open on click!');
      results.summary.passed = false;
      results.summary.keyboardErrors++;
      throw new Error('SingleOfficialUkeModal failed to open');
    }

    const modalShotName = 'e2e_drill_print_official_uke_modal.png';
    await page.screenshot({ path: join(localArtifactDir, modalShotName), fullPage: false });
    await page.screenshot({ path: join(artifactDir, modalShotName), fullPage: false });
    console.log(`  - Official UKE modal opened: visible = true, hasCyoHeader = ${modalCheck.hasCyoHeader} (Shot: ${modalShotName})`);

    // Keyboard Tab focus check inside modal
    let modalTabCount = 0;
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      await wait(100);
      focusedTag = await page.evaluate(() => document.activeElement ? document.activeElement.tagName : 'NONE');
      if (focusedTag !== 'BODY' && focusedTag !== 'NONE') modalTabCount++;
    }

    // Close modal with Escape key
    console.log('[E2E Drill] Closing Official UKE Modal with Escape key...');
    await page.keyboard.press('Escape');
    await wait(800);

    const modalClosed = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="single-official-uke-modal"]') ||
                    document.querySelector('.single-official-uke-modal');
      return !modal;
    });

    if (!modalClosed) {
      console.error('[E2E Drill] ERROR: Modal did not close on Escape key!');
      results.summary.passed = false;
      results.summary.keyboardErrors++;
      throw new Error('SingleOfficialUkeModal failed to close on Escape');
    }

    results.screens.print.officialUkeModal = {
      visible: true,
      hasCyoHeader: modalCheck.hasCyoHeader,
      closedOnEscape: modalClosed,
      shot: modalShotName
    };
    results.keyboardFlow.officialUkeModal = {
      tabNavigableElements: modalTabCount,
      closedWithEscape: modalClosed
    };
    console.log(`  - Official UKE modal closed on Escape: ${modalClosed}`);

    // 4. Screen: /inventory (Inventory & Order Workbench)
    console.log('[E2E Drill] 4. Testing /inventory (Inventory & Reorder)...');
    results.screens.inventory = {};
    for (const width of [1280, 768, 375]) {
      await page.setViewport({ width, height: 900 });
      await page.goto(`${baseUrl}/inventory`, { waitUntil: 'networkidle2' });
      await wait(2000);
      await dismissDialogs();

      const overflow = await checkOverflow(page, width);
      results.screens.inventory[`${width}px`] = overflow;
      if (overflow.hasOverflow) {
        results.summary.passed = false;
        results.summary.overflowErrors++;
      }

      const shotName = `e2e_drill_inventory_${width}px.png`;
      await page.screenshot({ path: join(localArtifactDir, shotName), fullPage: true });
      await page.screenshot({ path: join(artifactDir, shotName), fullPage: true });
      console.log(`  - /inventory @ ${width}px: overflow = ${overflow.overflowPx}px (Shot: ${shotName})`);
    }

    // Order workbench reason tab switch check on /inventory
    console.log('[E2E Drill] Testing Order Workbench tabs on /inventory...');
    const orderTabClicked = await page.evaluate(() => {
      const orderTab = Array.from(document.querySelectorAll('button, .tab-item')).find(b => (b.textContent || '').includes('発注ワークベンチ'));
      if (orderTab) {
        orderTab.click();
        return true;
      }
      return false;
    });
    if (orderTabClicked) {
      await wait(1000);
      const orderWorkbenchShot = 'e2e_drill_inventory_order_workbench.png';
      await page.screenshot({ path: join(localArtifactDir, orderWorkbenchShot), fullPage: true });
      await page.screenshot({ path: join(artifactDir, orderWorkbenchShot), fullPage: true });
      console.log(`  - Order Workbench tab activated (Shot: ${orderWorkbenchShot})`);
    }

    // Save final report JSON
    const reportPath = join(localArtifactDir, 'e2e_accessibility_drill_report.json');
    await writeFile(reportPath, JSON.stringify(results, null, 2), 'utf8');
    console.log('[E2E Drill] Report saved to:', reportPath);

  } finally {
    if (browser) {
      console.log('[E2E Drill] Closing browser...');
      await browser.close();
    }
    if (server) {
      console.log('[E2E Drill] Stopping Next.js server...');
      await stopServer(server);
    }
  }

  console.log('[E2E Drill] Drill finished with summary:', results.summary);
  return results;
}

run().catch(err => {
  console.error('[E2E Drill] Fatal error:', err);
  process.exit(1);
});
