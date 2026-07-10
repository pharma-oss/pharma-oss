#!/usr/bin/env node
import { constants } from 'node:fs';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

const APP_ID = 'yakureki';
const BACKUP_FORMAT_VERSION = 1;
const MANIFEST_VERSION = 1;
const RECEIPT_VERSION = 1;
const DEFAULT_URL = 'http://127.0.0.1:3000/settings?tab=backup';
const DEFAULT_TIMEOUT_MS = 90000;

const selectors = {
  backupTab: '[data-testid="settings-tab-backup"]',
  backupSection: '[data-testid="backup-section"]',
  encryptionCheckbox: '[data-testid="backup-export-encryption-checkbox"]',
  passwordInput: '[data-testid="backup-export-password"]',
  manifestCheckbox: '[data-testid="backup-export-transfer-manifest-checkbox"]',
  retentionDaysInput: '[data-testid="backup-export-transfer-retention-days"]',
  destinationNameInput: '[data-testid="backup-external-destination-name"]',
  destinationPathInput: '[data-testid="backup-external-destination-path"]',
  notesInput: '[data-testid="backup-external-notes"]',
  exportButton: '[data-testid="backup-export-button"]'
};

function usage() {
  return [
    'Usage: node scripts/runBrowserBackupExport.mjs --user-data-dir <path> --download-dir <path> (--password <value>|--password-env <ENV>) [options]',
    '',
    'Opens pharma-oss with a logged-in browser profile, exports an encrypted backup JSON through the Settings backup screen, validates the downloaded file, and writes a browser export receipt.',
    '',
    'Options:',
    `  --url <url>                         pharma-oss settings URL. Default: ${DEFAULT_URL}`,
    '  --receipt <path>                    Receipt JSON path. Default: <download-dir>/<backup>_browser_export_receipt_<timestamp>.json',
    '  --export-transfer-manifest          Also enable and validate the external transfer manifest download.',
    '  --destination-name <name>           Required with --export-transfer-manifest.',
    '  --destination-path <path|url>       Required with --export-transfer-manifest.',
    '  --retention-days <days>             Retention days for the external transfer manifest. Default: current screen value.',
    '  --notes <text>                      Notes copied into the external transfer manifest.',
    '  --allow-plaintext                   Allow a plaintext backup export when no password is supplied.',
    '  --allow-overwrite                   Allow overwriting the receipt path.',
    '  --timeout-ms <ms>                   Download wait timeout. Default: 90000.',
    '  --headed                            Show Chromium while the job runs.',
    '',
    'The user-data-dir must already contain the pharma-oss IndexedDB data and a staff session with backup permission.'
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    headless: true,
    allowOverwrite: false,
    allowPlaintext: false,
    exportTransferManifest: false
  };
  const valueArgs = new Set([
    '--url',
    '--user-data-dir',
    '--download-dir',
    '--password',
    '--password-env',
    '--receipt',
    '--destination-name',
    '--destination-path',
    '--retention-days',
    '--notes',
    '--timeout-ms'
  ]);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--headed') {
      args.headless = false;
      continue;
    }
    if (arg === '--headless') {
      args.headless = true;
      continue;
    }
    if (arg === '--allow-overwrite') {
      args.allowOverwrite = true;
      continue;
    }
    if (arg === '--allow-plaintext') {
      args.allowPlaintext = true;
      continue;
    }
    if (arg === '--export-transfer-manifest') {
      args.exportTransferManifest = true;
      continue;
    }
    if (valueArgs.has(arg)) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value.\n${usage()}`);
      }
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      args[key] = value;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }

  args.timeoutMs = Math.max(1000, Number(args.timeoutMs) || DEFAULT_TIMEOUT_MS);
  if (args.retentionDays !== undefined) {
    args.retentionDays = Math.max(1, Math.floor(Number(args.retentionDays) || 1));
  }
  return args;
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required.\n${usage()}`);
  }
  return value.trim();
}

function resolveLocalPath(value, label) {
  const text = assertString(value, label);
  return isAbsolute(text) ? text : resolve(text);
}

function resolvePassword(args) {
  if (args.passwordEnv) {
    const envValue = process.env[args.passwordEnv];
    if (typeof envValue !== 'string' || envValue.trim() === '') {
      throw new Error(`Environment variable ${args.passwordEnv} is empty. Set it or pass --password.`);
    }
    return envValue;
  }
  return typeof args.password === 'string' ? args.password : '';
}

function readJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function makeReceiptFileName(backupFileName, date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${backupFileName.replace(/\.json$/i, '')}_browser_export_receipt_${stamp}.json`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonOnce(path, value, allowOverwrite) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: allowOverwrite ? 'w' : 'wx'
  });
}

async function allowDownloads(page, downloadDir) {
  const client = await page.target().createCDPSession();
  try {
    await client.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir
    });
  } catch {
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir
    });
  }
}

async function ensureBackupScreen(page, timeoutMs) {
  await page.waitForSelector('body', { timeout: timeoutMs });
  if (!await page.$(selectors.backupSection)) {
    const tab = await page.$(selectors.backupTab);
    if (!tab) {
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
      throw new Error(`Backup tab was not found. Use a logged-in browser profile with backup permission. Page text: ${bodyText}`);
    }
    const disabled = await page.$eval(selectors.backupTab, (node) => Boolean(node.disabled));
    if (disabled) {
      throw new Error('The logged-in staff account does not have backup permission.');
    }
    await tab.click();
  }
  await page.waitForSelector(selectors.backupSection, { visible: true, timeout: timeoutMs });
}

async function setCheckbox(page, selector, checked) {
  await page.waitForSelector(selector, { visible: true });
  const current = await page.$eval(selector, (node) => Boolean(node.checked));
  if (current !== checked) {
    await page.click(selector);
  }
}

async function setInputValue(page, selector, value) {
  await page.waitForSelector(selector, { visible: true });
  await page.focus(selector);
  await page.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control');
  await page.keyboard.press('Backspace');
  if (value) {
    await page.type(selector, String(value), { delay: 2 });
  }
}

async function currentFileSet(downloadDir) {
  try {
    return new Set(await readdir(downloadDir));
  } catch {
    return new Set();
  }
}

async function findDownloadedFile(downloadDir, beforeFiles, pattern) {
  const files = await readdir(downloadDir);
  const matches = [];
  for (const fileName of files) {
    if (beforeFiles.has(fileName) || fileName.endsWith('.crdownload') || !pattern.test(fileName)) {
      continue;
    }
    const path = join(downloadDir, fileName);
    const fileStat = await stat(path).catch(() => null);
    if (fileStat?.isFile()) {
      matches.push({ fileName, path, mtimeMs: fileStat.mtimeMs, size: fileStat.size });
    }
  }
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0];
}

async function waitForDownloadedFile(downloadDir, beforeFiles, pattern, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const candidate = await findDownloadedFile(downloadDir, beforeFiles, pattern);
    if (candidate) {
      await sleep(350);
      const after = await stat(candidate.path).catch(() => null);
      const tempStillExists = await exists(`${candidate.path}.crdownload`);
      if (after?.isFile() && after.size === candidate.size && !tempStillExists) {
        return { ...candidate, size: after.size };
      }
    }
    await sleep(500);
  }
  throw new Error(`${label} download did not finish within ${timeoutMs}ms.`);
}

function validateBackupPayload(payload, requireEncrypted) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Downloaded backup is not a JSON object.');
  }
  if (payload.app !== APP_ID) {
    throw new Error(`Downloaded backup app must be ${APP_ID}.`);
  }
  if (payload.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Unsupported backup formatVersion: ${payload.formatVersion}`);
  }
  if (typeof payload.createdAt !== 'string' || Number.isNaN(Date.parse(payload.createdAt))) {
    throw new Error('Downloaded backup createdAt is missing or invalid.');
  }

  const encrypted = payload.encrypted === true && typeof payload.ciphertext === 'string' && payload.ciphertext.length > 0;
  if (requireEncrypted && !encrypted) {
    throw new Error('Downloaded backup is plaintext. Pass --allow-plaintext only for exceptional migration or incident work.');
  }
  if (!encrypted && (!payload.collections || typeof payload.collections !== 'object' || Array.isArray(payload.collections))) {
    throw new Error('Plaintext backup collections are missing or invalid.');
  }
  return { encrypted, createdAt: payload.createdAt };
}

function validateManifestPayload(manifest, backupFile, backupSha256, backupSizeBytes, requireEncrypted) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Downloaded external transfer manifest is not a JSON object.');
  }
  if (manifest.app !== APP_ID) {
    throw new Error(`External transfer manifest app must be ${APP_ID}.`);
  }
  if (manifest.manifestVersion !== MANIFEST_VERSION) {
    throw new Error(`Unsupported external transfer manifestVersion: ${manifest.manifestVersion}`);
  }
  if (manifest.backupFileName !== backupFile) {
    throw new Error(`External transfer manifest backupFileName mismatch: ${manifest.backupFileName} !== ${backupFile}`);
  }
  if (manifest.backupSha256 !== backupSha256) {
    throw new Error('External transfer manifest SHA-256 does not match the downloaded backup.');
  }
  if (manifest.backupSizeBytes !== backupSizeBytes) {
    throw new Error('External transfer manifest size does not match the downloaded backup.');
  }
  if (requireEncrypted && manifest.encrypted !== true) {
    throw new Error('External transfer manifest must point to an encrypted backup.');
  }
  if (manifest.status !== 'pass') {
    const actions = Array.isArray(manifest.requiredActions) ? manifest.requiredActions.join(' / ') : 'required actions missing';
    throw new Error(`External transfer manifest is not ready: ${manifest.statusLabel || manifest.status}. ${actions}`);
  }
  return manifest;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const userDataDir = resolveLocalPath(args.userDataDir, '--user-data-dir');
  const downloadDir = resolveLocalPath(args.downloadDir, '--download-dir');
  const password = resolvePassword(args);
  const useEncryption = password.trim().length > 0;
  if (!useEncryption && !args.allowPlaintext) {
    throw new Error('--password or --password-env is required. Use --allow-plaintext only for exceptional migration or incident work.');
  }
  if (args.exportTransferManifest) {
    if (!useEncryption) {
      throw new Error('--export-transfer-manifest requires an encrypted backup password.');
    }
    assertString(args.destinationName, '--destination-name');
    assertString(args.destinationPath, '--destination-path');
  }

  await mkdir(downloadDir, { recursive: true });

  const { default: puppeteer } = await import('puppeteer');
  let browser;
  const logs = [];
  try {
    browser = await puppeteer.launch({
      headless: args.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      protocolTimeout: Math.max(args.timeoutMs, 90000),
      userDataDir
    });
    const page = await browser.newPage();
    page.on('pageerror', (error) => logs.push(`PAGEERROR ${error.message}`));
    page.on('console', (message) => {
      const text = message.text();
      if (/error|failed/i.test(text) && !/manifest\.webmanifest|favicon|RxDB dev-mode warning|RxDB Open Core RxStorage/i.test(text)) {
        logs.push(`CONSOLE ${message.type()} ${text.slice(0, 400)}`);
      }
    });
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'confirm' && args.allowPlaintext) {
        await dialog.accept();
      } else {
        await dialog.dismiss();
      }
    });

    await allowDownloads(page, downloadDir);
    await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: args.timeoutMs });
    await ensureBackupScreen(page, args.timeoutMs);

    await setCheckbox(page, selectors.encryptionCheckbox, useEncryption);
    if (useEncryption) {
      await setInputValue(page, selectors.passwordInput, password.trim());
    }

    await setCheckbox(page, selectors.manifestCheckbox, Boolean(args.exportTransferManifest));
    if (args.exportTransferManifest) {
      await setInputValue(page, selectors.destinationNameInput, args.destinationName);
      await setInputValue(page, selectors.destinationPathInput, args.destinationPath);
      if (args.notes !== undefined) {
        await setInputValue(page, selectors.notesInput, args.notes);
      }
      if (args.retentionDays !== undefined) {
        await setInputValue(page, selectors.retentionDaysInput, String(args.retentionDays));
      }
    }

    const exportDisabled = await page.$eval(selectors.exportButton, (node) => Boolean(node.disabled));
    if (exportDisabled) {
      throw new Error('Backup export button is disabled. Check staff permission and database initialization.');
    }

    const beforeFiles = await currentFileSet(downloadDir);
    await page.click(selectors.exportButton);

    const backupDownload = await waitForDownloadedFile(
      downloadDir,
      beforeFiles,
      /^yakureki_backup_\d{8}_\d{6}\.json$/,
      'Backup JSON',
      args.timeoutMs
    );
    const backupBuffer = await readFile(backupDownload.path);
    const backupPayload = readJson(backupBuffer.toString('utf8'), 'Backup JSON');
    const backupInfo = validateBackupPayload(backupPayload, !args.allowPlaintext);
    const backupSha256 = sha256(backupBuffer);

    let manifestDownload = null;
    let manifest = null;
    if (args.exportTransferManifest) {
      manifestDownload = await waitForDownloadedFile(
        downloadDir,
        beforeFiles,
        /^yakureki_backup_\d{8}_\d{6}_external_transfer_\d{8}_\d{6}\.json$/,
        'External transfer manifest JSON',
        args.timeoutMs
      );
      const manifestBuffer = await readFile(manifestDownload.path);
      manifest = validateManifestPayload(
        readJson(manifestBuffer.toString('utf8'), 'External transfer manifest JSON'),
        basename(backupDownload.path),
        backupSha256,
        backupDownload.size,
        !args.allowPlaintext
      );
    }

    if (logs.some((line) => line.startsWith('PAGEERROR'))) {
      throw new Error(`Browser page errors occurred: ${logs.join(' | ')}`);
    }

    const receipt = {
      app: APP_ID,
      receiptVersion: RECEIPT_VERSION,
      type: 'browser-backup-export-receipt',
      exportedAt: new Date().toISOString(),
      appUrl: args.url,
      browserUserDataDir: userDataDir,
      downloadDir,
      backupFileName: basename(backupDownload.path),
      backupPath: backupDownload.path,
      backupCreatedAt: backupInfo.createdAt,
      backupSha256,
      backupSizeBytes: backupDownload.size,
      encrypted: backupInfo.encrypted,
      externalTransferManifestFileName: manifestDownload ? basename(manifestDownload.path) : undefined,
      externalTransferManifestPath: manifestDownload?.path,
      externalTransferManifestStatus: manifest?.status,
      status: 'pass',
      statusLabel: backupInfo.encrypted ? '暗号化バックアップ書き出しOK' : '平文バックアップ書き出しOK',
      requiredActions: manifest
        ? [
          `外部保存ジョブへ ${basename(manifestDownload.path)} を渡す`,
          '外部保存ジョブの受領書JSONをpharma-ossの監査ログに記録する'
        ]
        : [
          '必要に応じて外部保存連携JSONを出力し、外部保存ジョブへ渡す',
          'バックアップを店舗で定めた保存先へ移し、外部保存確認をpharma-ossの監査ログに記録する'
        ]
    };

    const receiptPath = args.receipt
      ? resolveLocalPath(args.receipt, '--receipt')
      : join(downloadDir, makeReceiptFileName(basename(backupDownload.path)));
    await mkdir(dirname(receiptPath), { recursive: true });
    await writeJsonOnce(receiptPath, receipt, args.allowOverwrite);

    console.log(JSON.stringify({
      ok: true,
      backupFileName: receipt.backupFileName,
      backupPath: receipt.backupPath,
      backupSha256: receipt.backupSha256,
      encrypted: receipt.encrypted,
      externalTransferManifestFileName: receipt.externalTransferManifestFileName,
      receiptPath,
      statusLabel: receipt.statusLabel,
      requiredActions: receipt.requiredActions
    }, null, 2));
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
