import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const port = 3347;
const baseUrl = `http://127.0.0.1:${port}`;
const setupPassword = 'SetupPass123';
const artifactDir = '/Users/takeaki/.gemini/antigravity-ide/brain/7ad7cc77-8091-43b0-8626-4a614821a8f9';

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServerReady() {
  try {
    const res = await fetch(`${baseUrl}/settings`);
    return res.status < 500;
  } catch {
    return false;
  }
}

async function startServer() {
  const server = spawn('npx', ['next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) }
  });

  for (let i = 0; i < 40; i++) {
    if (await isServerReady()) {
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
    if (!(passwordInput instanceof HTMLInputElement) || !form) return;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    const setValue = (input, value) => {
      valueSetter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const nameInput = form.querySelector('input[type=text]');
    if (nameInput instanceof HTMLInputElement) {
      setValue(nameInput, name);
    }
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
      await window.__yakurekiSeedOnboardingE2E();
    }
  }).catch(() => {});
}

async function run() {
  let server;
  let browser;
  try {
    server = await startServer();
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 950 });

    await page.goto(`${baseUrl}/settings`, { waitUntil: 'domcontentloaded' });
    await wait(2000);
    await ensureInitialAdmin(page);
    await seedOnboardingData(page);
    await wait(2000);

    await page.goto(`${baseUrl}/emr?visitId=e2e_onboarding_visit`, { waitUntil: 'networkidle2' });
    await wait(3000);

    const html = await page.evaluate(() => {
      return {
        cards: Array.from(document.querySelectorAll('.insight-card, .soap-ai-draft, .soap-entry-box')).map(el => el.className),
        bodyText: document.body.innerText.slice(0, 500)
      };
    });
    console.log('DOM elements found:', JSON.stringify(html, null, 2));

    const outPath = join(artifactDir, 'emr_debug.png');
    await page.screenshot({ path: outPath });
    console.log('Saved debug screenshot to', outPath);
  } finally {
    if (browser) await browser.close();
    if (server) server.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
