#!/usr/bin/env node
import { constants } from 'node:fs';
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const APP_ID = 'yakureki';
const MANIFEST_VERSION = 1;
const STATE_VERSION = 1;
const STATE_FILE_NAME = 'backup_external_transfer_schedule_state.json';
const localTransferScriptPath = fileURLToPath(new URL('./runBackupExternalTransfer.mjs', import.meta.url));
const s3WormTransferScriptPath = fileURLToPath(new URL('./runBackupS3WormTransfer.mjs', import.meta.url));

function usage() {
  return [
    'Usage: node scripts/runScheduledBackupExternalTransfer.mjs --manifest-dir <path> [--connector auto|local|s3-worm] [--destination <path|file://url|s3://url>] [--state-dir <path>] [--failure-notice <path>] [--failure-webhook-url <url>] [--failure-webhook-bearer-env <ENV>] [--failure-webhook-timeout-ms <ms>] [--immutable-verified] [--allow-overwrite] [--force] [--dry-run] [--max-age-hours <hours>] [--aws-bin <aws>] [--profile <name>] [--region <name>] [--object-lock-mode GOVERNANCE|COMPLIANCE] [--skip-object-lock-check]',
    '',
    'Finds the newest pharma-oss external transfer manifest in a directory and runs the matching external storage transfer job once.',
    'Use this from cron, launchd, Task Scheduler, or another job runner after pharma-oss has written the backup and manifest files.'
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    allowOverwrite: false,
    dryRun: false,
    force: false,
    immutableVerified: false,
    skipObjectLockCheck: false,
    awsBin: 'aws',
    connector: 'auto',
    objectLockMode: 'GOVERNANCE'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--allow-overwrite') {
      args.allowOverwrite = true;
      continue;
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--force') {
      args.force = true;
      continue;
    }
    if (arg === '--immutable-verified') {
      args.immutableVerified = true;
      continue;
    }
    if (arg === '--skip-object-lock-check') {
      args.skipObjectLockCheck = true;
      continue;
    }
    if ([
      '--manifest-dir',
      '--connector',
      '--destination',
      '--state-dir',
      '--failure-notice',
      '--failure-webhook-url',
      '--failure-webhook-bearer-env',
      '--failure-webhook-timeout-ms',
      '--max-age-hours',
      '--aws-bin',
      '--profile',
      '--region',
      '--object-lock-mode'
    ].includes(arg)) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value.\n${usage()}`);
      }
      args[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }

  if (!['auto', 'local', 's3-worm'].includes(args.connector)) {
    throw new Error('--connector must be auto, local, or s3-worm.');
  }
  const lockMode = String(args.objectLockMode || '').toUpperCase();
  if (!['GOVERNANCE', 'COMPLIANCE'].includes(lockMode)) {
    throw new Error('--object-lock-mode must be GOVERNANCE or COMPLIANCE.');
  }
  args.objectLockMode = lockMode;
  return args;
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function resolveLocalPath(value, label) {
  const text = assertString(value, label);
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)) {
    if (!text.startsWith('file://')) {
      throw new Error(`${label} must be a local path or file:// URL for this scheduled job. Got: ${text}`);
    }
    return fileURLToPath(text);
  }
  return isAbsolute(text) ? text : resolve(text);
}

function normalizeWebhookUrl(value) {
  if (value === undefined) return undefined;
  const text = assertString(value, '--failure-webhook-url');
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('--failure-webhook-url must be a valid URL.');
  }
  const hostname = url.hostname.toLowerCase();
  const isLocalHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(hostname);
  if (url.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('--failure-webhook-url must use https://, except http://localhost for local monitoring tests.');
  }
  return url.toString();
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function readManifestCandidate(value, filePath, fileStat) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.app !== APP_ID || value.manifestVersion !== MANIFEST_VERSION) return null;
  if (typeof value.backupFileName !== 'string' || value.backupFileName.trim() === '') return null;
  if (typeof value.backupSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(value.backupSha256)) return null;

  const generatedAtMs = typeof value.generatedAt === 'string' ? Date.parse(value.generatedAt) : NaN;
  return {
    fileName: basename(filePath),
    filePath,
    backupFileName: value.backupFileName.trim(),
    backupSha256: value.backupSha256.toLowerCase(),
    destinationName: typeof value.destinationName === 'string' ? value.destinationName.trim() : '',
    destinationPathOrUrl: typeof value.destinationPathOrUrl === 'string' ? value.destinationPathOrUrl.trim() : '',
    generatedAt: Number.isFinite(generatedAtMs) ? new Date(generatedAtMs).toISOString() : fileStat.mtime.toISOString(),
    sortTime: Number.isFinite(generatedAtMs) ? generatedAtMs : fileStat.mtime.getTime()
  };
}

async function findNewestManifest(manifestDir) {
  const entries = await readdir(manifestDir, { withFileTypes: true });
  const candidates = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    const filePath = join(manifestDir, entry.name);
    const fileStat = await stat(filePath);
    const parsed = parseJson(await readFile(filePath, 'utf8'), entry.name);
    const candidate = readManifestCandidate(parsed, filePath, fileStat);
    if (candidate) candidates.push(candidate);
  }

  candidates.sort((a, b) => b.sortTime - a.sortTime || b.fileName.localeCompare(a.fileName));
  return candidates[0] || null;
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readState(statePath) {
  try {
    return parseJson(await readFile(statePath, 'utf8'), 'Schedule state');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function stateMatchesManifest(state, manifest, connector) {
  return Boolean(
    state &&
    state.app === APP_ID &&
    state.stateVersion === STATE_VERSION &&
    (state.connector === connector || (!state.connector && connector === 'local')) &&
    state.lastManifestFileName === manifest.fileName &&
    state.backupFileName === manifest.backupFileName &&
    state.backupSha256 === manifest.backupSha256
  );
}

function parseMaxAgeHours(value) {
  if (value === undefined) return undefined;
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error('--max-age-hours must be a positive number.');
  }
  return hours;
}

function getDestination(manifest, args) {
  return args.destination || manifest.destinationPathOrUrl;
}

function selectConnector(manifest, args) {
  if (args.connector !== 'auto') return args.connector;
  return /^s3:\/\//i.test(getDestination(manifest, args)) ? 's3-worm' : 'local';
}

async function writeState(statePath, manifest, transferSummary, connector) {
  const state = {
    app: APP_ID,
    stateVersion: STATE_VERSION,
    updatedAt: new Date().toISOString(),
    connector,
    lastManifestFileName: manifest.fileName,
    lastManifestPath: manifest.filePath,
    backupFileName: manifest.backupFileName,
    backupSha256: manifest.backupSha256,
    destinationName: manifest.destinationName,
    destinationPathOrUrl: manifest.destinationPathOrUrl,
    destinationBackupPath: transferSummary.destinationBackupPath,
    receiptPath: transferSummary.receiptPath,
    statusLabel: transferSummary.statusLabel,
    requiredActions: Array.isArray(transferSummary.requiredActions) ? transferSummary.requiredActions : []
  };

  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return state;
}

function buildFailureNotice(manifest, connector, statePath, error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    app: APP_ID,
    noticeVersion: 1,
    type: 'backup-external-transfer-failure-notice',
    failedAt: new Date().toISOString(),
    connector,
    statePath,
    manifestFileName: manifest.fileName,
    manifestPath: manifest.filePath,
    backupFileName: manifest.backupFileName,
    backupSha256: manifest.backupSha256,
    destinationName: manifest.destinationName,
    destinationPathOrUrl: manifest.destinationPathOrUrl,
    status: 'failed',
    statusLabel: '外部保存ジョブ失敗',
    errorMessage: message,
    requiredActions: [
      '閉店時バックアップの外部保存ジョブを確認する',
      '失敗原因を解消し、同じ連携JSONで定期実行ジョブを再実行する',
      '復旧後に受領書JSONをpharma-ossの監査ログへ記録する'
    ]
  };
}

async function writeFailureNotice(noticePath, notice) {
  await mkdir(dirname(noticePath), { recursive: true });
  await writeFile(noticePath, `${JSON.stringify(notice, null, 2)}\n`, 'utf8');
  return notice;
}

function resolveWebhookBearerToken(args) {
  if (!args.failureWebhookBearerEnv) return undefined;
  const envName = assertString(args.failureWebhookBearerEnv, '--failure-webhook-bearer-env');
  const token = process.env[envName];
  if (typeof token !== 'string' || token.trim() === '') {
    throw new Error(`Environment variable ${envName} is empty. It is required by --failure-webhook-bearer-env.`);
  }
  return token.trim();
}

function parseWebhookTimeoutMs(value) {
  if (value === undefined) return 10000;
  const timeoutMs = Number(value);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    throw new Error('--failure-webhook-timeout-ms must be at least 1000.');
  }
  return Math.floor(timeoutMs);
}

async function postFailureWebhook(args, notice) {
  const webhookUrl = normalizeWebhookUrl(args.failureWebhookUrl);
  if (!webhookUrl) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), parseWebhookTimeoutMs(args.failureWebhookTimeoutMs));
  const bearerToken = resolveWebhookBearerToken(args);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'YakurekiBackupExternalTransfer/1.0',
        ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {})
      },
      body: JSON.stringify(notice),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Failure webhook returned HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
    }
    return {
      ok: true,
      status: response.status,
      url: webhookUrl
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runTransfer(manifest, args, connector) {
  const scriptPath = connector === 's3-worm' ? s3WormTransferScriptPath : localTransferScriptPath;
  const transferArgs = [scriptPath, '--manifest', manifest.filePath];
  if (args.destination) {
    transferArgs.push('--destination', args.destination);
  }
  if (connector === 'local' && args.immutableVerified) {
    transferArgs.push('--immutable-verified');
  }
  if (connector === 's3-worm') {
    transferArgs.push('--aws-bin', args.awsBin, '--object-lock-mode', args.objectLockMode);
    if (args.profile) {
      transferArgs.push('--profile', args.profile);
    }
    if (args.region) {
      transferArgs.push('--region', args.region);
    }
    if (args.skipObjectLockCheck) {
      transferArgs.push('--skip-object-lock-check');
    }
  }
  if (args.allowOverwrite) {
    transferArgs.push('--allow-overwrite');
  }

  try {
    const { stdout } = await execFileAsync(process.execPath, transferArgs, { maxBuffer: 1024 * 1024 });
    return parseJson(stdout, 'Transfer job output');
  } catch (error) {
    const detail = [
      error instanceof Error ? error.message : String(error),
      error?.stderr,
      error?.stdout
    ].filter(Boolean).join('\n');
    throw new Error(`Scheduled ${connector} external transfer failed.\n${detail}`);
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.manifestDir) {
    throw new Error(`--manifest-dir is required.\n${usage()}`);
  }

  const manifestDir = resolveLocalPath(args.manifestDir, '--manifest-dir');
  const stateDir = args.stateDir
    ? resolveLocalPath(args.stateDir, '--state-dir')
    : join(manifestDir, '.yakureki-external-transfer-state');
  const statePath = join(stateDir, STATE_FILE_NAME);
  const manifest = await findNewestManifest(manifestDir);
  if (!manifest) {
    throw new Error(`No pharma-oss external transfer manifest found in ${manifestDir}`);
  }

  const maxAgeHours = parseMaxAgeHours(args.maxAgeHours);
  if (maxAgeHours !== undefined) {
    const ageHours = (Date.now() - manifest.sortTime) / (60 * 60 * 1000);
    if (ageHours > maxAgeHours) {
      throw new Error(`Newest manifest is older than ${maxAgeHours} hours: ${manifest.fileName}`);
    }
  }

  const connector = selectConnector(manifest, args);
  const state = await readState(statePath);
  if (!args.force && stateMatchesManifest(state, manifest, connector) && state.receiptPath && await exists(state.receiptPath)) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      connector,
      manifestPath: manifest.filePath,
      backupFileName: manifest.backupFileName,
      destinationBackupPath: state.destinationBackupPath,
      receiptPath: state.receiptPath,
      statusLabel: '外部保存ジョブは実行済み',
      requiredActions: ['受領書JSONがpharma-ossの監査ログへ記録済みか確認する']
    }, null, 2));
    return;
  }

  if (args.dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      connector,
      manifestPath: manifest.filePath,
      backupFileName: manifest.backupFileName,
      backupSha256: manifest.backupSha256,
      destinationName: manifest.destinationName,
      destinationPathOrUrl: getDestination(manifest, args),
      statusLabel: '定期実行確認OK',
      requiredActions: connector === 's3-worm'
        ? ['AWS CLI認証とS3 Object Lock設定を確認し、スケジューラから同じコマンドを実行する']
        : ['スケジューラから同じコマンドを実行し、受領書JSONを監査ログへ記録する']
    }, null, 2));
    return;
  }

  let transferSummary;
  try {
    transferSummary = await runTransfer(manifest, args, connector);
  } catch (error) {
    const failureNotice = buildFailureNotice(manifest, connector, statePath, error);
    if (args.failureNotice) {
      const noticePath = resolveLocalPath(args.failureNotice, '--failure-notice');
      await writeFailureNotice(noticePath, failureNotice).catch((noticeError) => {
        console.error(`Failed to write failure notice: ${noticeError instanceof Error ? noticeError.message : String(noticeError)}`);
      });
    }
    if (args.failureWebhookUrl) {
      await postFailureWebhook(args, failureNotice).catch((webhookError) => {
        console.error(`Failed to send failure webhook: ${webhookError instanceof Error ? webhookError.message : String(webhookError)}`);
      });
    }
    throw error;
  }
  const nextState = await writeState(statePath, manifest, transferSummary, connector);
  console.log(JSON.stringify({
    ok: true,
    scheduled: true,
    connector,
    manifestPath: manifest.filePath,
    backupFileName: manifest.backupFileName,
    destinationBackupPath: transferSummary.destinationBackupPath,
    receiptPath: transferSummary.receiptPath,
    statePath,
    statusLabel: transferSummary.statusLabel,
    requiredActions: nextState.requiredActions
  }, null, 2));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
