import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const port = 3337;
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

    // Verify .drug-info-claim-tools element and styles
    console.log('4. Inspecting .drug-info-claim-tools styles...');
    const styleReport = await page.evaluate(() => {
      const tools = document.querySelector('.drug-info-claim-tools');
      const agentInput = document.querySelector('.input-agent-group');
      const remarkInput = document.querySelector('.input-receipt-remark');
      const row = document.querySelector('.drug-info-claim-row');

      const getMatchedRules = (el) => {
        if (!el) return [];
        const rules = [];
        for (const sheet of document.styleSheets) {
          try {
            for (const r of sheet.cssRules || []) {
              if (r.selectorText && el.matches(r.selectorText)) {
                rules.push({ selector: r.selectorText, cssText: r.cssText });
              }
            }
          } catch {}
        }
        return rules;
      };

      return {
        hasTools: Boolean(tools),
        hasAgentInput: Boolean(agentInput),
        hasRemarkInput: Boolean(remarkInput),
        agentOuterHTML: agentInput ? agentInput.outerHTML : null,
        agentClassName: agentInput ? agentInput.className : null,
        agentRules: getMatchedRules(agentInput),
        agentInputWidth: agentInput ? window.getComputedStyle(agentInput).width : null,
        agentInputFontSize: agentInput ? window.getComputedStyle(agentInput).fontSize : null,
        agentInputPadding: agentInput ? window.getComputedStyle(agentInput).padding : null,
        remarkInputWidth: remarkInput ? window.getComputedStyle(remarkInput).width : null,
        remarkInputFontSize: remarkInput ? window.getComputedStyle(remarkInput).fontSize : null,
        remarkInputPadding: remarkInput ? window.getComputedStyle(remarkInput).padding : null,
        rowDisplay: row ? window.getComputedStyle(row).display : null,
        rowGridTemplateColumns: row ? window.getComputedStyle(row).gridTemplateColumns : null
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
    const outFullPageExpanded = join(artifactDir, 'pr2_drug_info_full_page.png');
    await page.screenshot({ path: outFullPageExpanded, fullPage: true });
    console.log(`Saved full page expanded screenshot: ${outFullPageExpanded}`);

    // Capture focused screenshot of .drug-info-claim-tools
    const toolsElement = await page.$('.drug-info-claim-tools');
    if (toolsElement) {
      const outTools = join(artifactDir, 'pr2_drug_info_claim_tools.png');
      await toolsElement.screenshot({ path: outTools });
      console.log(`Saved claim tools screenshot: ${outTools}`);
    }

    // Capture focused screenshot of .drug-info-doc
    const docElement = await page.$('.drug-info-doc');
    if (docElement) {
      const outDoc = join(artifactDir, 'pr2_drug_info_card.png');
      await docElement.screenshot({ path: outDoc });
      console.log(`Saved drug info card screenshot: ${outDoc}`);
    }

    if (styleReport.agentInputWidth !== '80px') {
      throw new Error(`Expected agentInputWidth to be 80px, got ${styleReport.agentInputWidth}`);
    }
    if (styleReport.remarkInputWidth !== '120px') {
      throw new Error(`Expected remarkInputWidth to be 120px, got ${styleReport.remarkInputWidth}`);
    }

    console.log('SUCCESS: All PR2 styles and screenshots verified!');
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error('Execution error:', err);
  process.exit(1);
});
