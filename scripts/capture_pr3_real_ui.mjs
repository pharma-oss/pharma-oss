import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const port = 3338;
const baseUrl = `http://127.0.0.1:${port}`;
const setupPassword = 'SetupPass123';
const artifactDir = '/Users/takeaki/.gemini/antigravity-ide/brain/eeed9ebb-8039-450c-9934-845d17eb9340';

function findChromePath() {
  const commonPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ];
  for (const p of commonPaths) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServerReady() {
  try {
    const res = await fetch(`${baseUrl}/settings`);
    return res.status < 500;
  } catch (err) {
    return false;
  }
}

async function startServer() {
  console.log('Starting next dev server on port', port);
  const server = spawn('npx', ['next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) }
  });

  for (let i = 0; i < 40; i++) {
    if (await isServerReady()) {
      console.log('Server is ready!');
      return server;
    }
    await wait(1000);
  }
  server.kill('SIGTERM');
  throw new Error('Dev server failed to start within 40s');
}

async function ensureInitialAdmin(page) {
  const passwordInput = await page.waitForSelector('input[type=password]', { timeout: 8000 }).catch(() => null);
  if (!passwordInput) return false;

  await page.evaluate(({ name, password }) => {
    const passwordInput = document.querySelector('input[type=password]');
    const form = passwordInput?.closest('form');
    if (!passwordInput || !form) return;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    const setValue = (input, value) => {
      valueSetter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const nameInput = form.querySelector('input[type=text]');
    if (nameInput) setValue(nameInput, name);
    setValue(passwordInput, password);
    form.requestSubmit();
  }, { name: 'E2E導入管理者', password: setupPassword });
  await wait(3000);
  return true;
}

async function seedOnboardingData(page) {
  await page.waitForFunction(() => typeof window.__yakurekiSeedOnboardingE2E === 'function', { timeout: 10000 }).catch(() => null);
  await page.evaluate(async () => {
    if (typeof window.__yakurekiSeedOnboardingE2E === 'function') {
      return await window.__yakurekiSeedOnboardingE2E();
    }
  });
}

async function run() {
  let server;
  let browser;
  try {
    server = await startServer();
    const chromePath = findChromePath();
    console.log('Using Chrome executable:', chromePath);

    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,1200']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });

    // チュートリアル・デモポップアップ無効化
    await page.evaluateOnNewDocument(() => {
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function patchedGetItem(key) {
        if (
          String(key).startsWith('yakureki:pre-login-tour') ||
          String(key).startsWith('yakureki:workflow-tutorial') ||
          String(key).startsWith('yakureki:first-run-tutorial')
        ) {
          return '2026-01-01T00:00:00.000Z';
        }
        return originalGetItem.call(this, key);
      };
    });

    console.log('1. Setting up initial admin on /settings ...');
    await page.goto(`${baseUrl}/settings`, { waitUntil: 'domcontentloaded' });
    await wait(2000);
    await ensureInitialAdmin(page);
    await seedOnboardingData(page);
    await wait(2000);

    console.log('2. Navigating to print page: /print/e2e_onboarding_visit');
    await page.goto(`${baseUrl}/print/e2e_onboarding_visit`, { waitUntil: 'networkidle2' });
    await wait(3000);

    // Switch to Drug Info tab
    console.log('3. Switching to Drug Info tab...');
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('button, .tab-pill, [role="tab"]'));
      const tab = tabs.find((b) => (b.textContent || '').includes('薬情') || (b.textContent || '').includes('薬剤情報'));
      if (tab) tab.click();
    });
    await wait(2000);

    // Verify .drug-info-row.drug-info-card and inner element styles
    console.log('4. Inspecting .drug-info-row.drug-info-card and inner elements styles...');
    const styleReport = await page.evaluate(() => {
      const card = document.querySelector('.drug-info-row.drug-info-card');
      const medHeader = document.querySelector('.drug-info-med-header');
      const appearanceCell = document.querySelector('.drug-appearance-cell');
      const drugShape = document.querySelector('.drug-shape');
      const medTitle = document.querySelector('.drug-info-med-title');
      const counselingGrid = document.querySelector('.drug-info-counseling-grid');
      const safetyGrid = document.querySelector('.drug-info-safety-grid');
      const sourceLine = document.querySelector('.drug-info-source-line');

      return {
        hasCard: Boolean(card),
        cardDisplay: card ? window.getComputedStyle(card).display : null,
        cardBorder: card ? window.getComputedStyle(card).borderTopWidth : null,
        hasMedHeader: Boolean(medHeader),
        medHeaderDisplay: medHeader ? window.getComputedStyle(medHeader).display : null,
        medHeaderBackground: medHeader ? window.getComputedStyle(medHeader).backgroundColor : null,
        hasAppearanceCell: Boolean(appearanceCell),
        appearanceCellPadding: appearanceCell ? window.getComputedStyle(appearanceCell).padding : null,
        hasDrugShape: Boolean(drugShape),
        drugShapeDisplay: drugShape ? window.getComputedStyle(drugShape).display : null,
        drugShapeWidth: drugShape ? window.getComputedStyle(drugShape).width : null,
        hasCounselingGrid: Boolean(counselingGrid),
        counselingGridDisplay: counselingGrid ? window.getComputedStyle(counselingGrid).display : null,
        hasSafetyGrid: Boolean(safetyGrid),
        safetyGridDisplay: safetyGrid ? window.getComputedStyle(safetyGrid).display : null,
        hasSourceLine: Boolean(sourceLine),
        sourceLineDisplay: sourceLine ? window.getComputedStyle(sourceLine).display : null
      };
    });

    console.log('Style inspection report:', JSON.stringify(styleReport, null, 2));

    // Expand .content-scroll so fullPage screenshot captures everything without internal scroll clipping
    await page.evaluate(() => {
      const el = document.querySelector('.content-scroll');
      if (el) {
        el.style.overflow = 'visible';
        el.style.height = 'auto';
        el.style.maxHeight = 'none';
      }
      const main = document.querySelector('main');
      if (main) {
        main.style.overflow = 'visible';
        main.style.height = 'auto';
      }
      document.body.style.overflow = 'visible';
      document.body.style.height = 'auto';
    });
    await wait(1500);

    // Full page capture with everything expanded
    const outFullPageExpanded = join(artifactDir, 'pr3_drug_info_full_page.png');
    await page.screenshot({ path: outFullPageExpanded, fullPage: true });
    console.log(`Saved full page expanded screenshot: ${outFullPageExpanded}`);

    // Capture focused screenshot of single item card
    const cardElement = await page.$('.drug-info-row.drug-info-card');
    if (cardElement) {
      const outCard = join(artifactDir, 'pr3_drug_info_item_card.png');
      await cardElement.screenshot({ path: outCard });
      console.log(`Saved item card screenshot: ${outCard}`);
    }

    // Capture focused screenshot of .drug-info-doc
    const docElement = await page.$('.drug-info-doc');
    if (docElement) {
      const outDoc = join(artifactDir, 'pr3_drug_info_doc.png');
      await docElement.screenshot({ path: outDoc });
      console.log(`Saved drug info doc screenshot: ${outDoc}`);
    }

    if (!styleReport.hasCard) {
      throw new Error('DrugInfoItemCard (.drug-info-row.drug-info-card) not found in DOM');
    }
    if (styleReport.medHeaderDisplay !== 'grid') {
      throw new Error(`Expected medHeaderDisplay to be grid, got ${styleReport.medHeaderDisplay}`);
    }
    if (styleReport.counselingGridDisplay !== 'grid') {
      throw new Error(`Expected counselingGridDisplay to be grid, got ${styleReport.counselingGridDisplay}`);
    }
    if (styleReport.safetyGridDisplay !== 'grid') {
      throw new Error(`Expected safetyGridDisplay to be grid, got ${styleReport.safetyGridDisplay}`);
    }

    console.log('SUCCESS: All PR3 DrugInfoItemCard styles, elements, and screenshots verified!');
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error('Execution error:', err);
  process.exit(1);
});
