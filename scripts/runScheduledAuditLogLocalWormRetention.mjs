#!/usr/bin/env node
import { constants } from 'node:fs';
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_ID,
  AUDIT_EXPORT_TYPE,
  DEFAULT_LOCAL_WORM_RETENTION_DAYS,
  LOCAL_WORM_CONNECTOR_ID,
  LOCAL_WORM_FAILURE_NOTICE_TYPE,
  assertNonEmptyString,
  getAuditExportLatestHash,
  parseJsonStrict,
  resolveLocalWormPath,
  sha256Buffer
} from './lib/audit_local_worm_core.mjs';

const execFileAsync = promisify(execFile);

const STATE_VERSION = 1;
const STATE_FILE_NAME = 'audit_log_local_worm_retention_schedule_state.json';
const retentionScriptPath = fileURLToPath(new URL('./runAuditLogLocalWormRetention.mjs', import.meta.url));

function usage() {
  return [
    'Usage: node scripts/runScheduledAuditLogLocalWormRetention.mjs --audit-dir <path> --destination <dir|file://dir> [--state-dir <path>] [--failure-notice <path>] [--failure-webhook-url <url>] [--failure-webhook-bearer-env <ENV>] [--failure-webhook-timeout-ms <ms>] [--storage-name <name>] [--retention-days <days>] [--max-age-hours <hours>] [--no-read-only-lock] [--immutable-verified] [--force] [--dry-run]',
    '',
    'Finds the newest pharma-oss audit-log export JSON in a directory and archives it once into an append-only local/NAS WORM directory.',
    'Use this from cron, launchd, Task Scheduler, or another job runner after pharma-oss has written the audit-log export JSON.'
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    lockReadOnly: true,
    immutableVerified: false,
    retentionDays: DEFAULT_LOCAL_WORM_RETENTION_DAYS,
    storageName: 'ローカル/NAS 追記専用WORM'
  };
  const valueArgs = new Set([
    '--audit-dir',
    '--destination',
    '--state-dir',
    '--failure-notice',
    '--failure-webhook-url',
    '--failure-webhook-bearer-env',
    '--failure-webhook-timeout-ms',
    '--storage-name',
    '--retention-days',
    '--max-age-hours'
  ]);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
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
    if (arg === '--no-read-only-lock') {
      args.lockReadOnly = false;
      continue;
    }
    if (arg === '--immutable-verified') {
      args.immutableVerified = true;
      continue;
    }
    if (valueArgs.has(arg)) {
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

  const retentionDays = Number(args.retentionDays);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error('--retention-days must be a positive number.');
  }
  args.retentionDays = Math.ceil(retentionDays);
  return args;
}

function normalizeWebhookUrl(value) {
  if (value === undefined) return undefined;
  const text = assertNonEmptyString(value, '--failure-webhook-url');
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

function readAuditCandidate(value, filePath, fileStat, fileBuffer) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.app !== APP_ID || value.type !== AUDIT_EXPORT_TYPE) return null;
  if (!Array.isArray(value.logs)) return null;
  const latestHash = getAuditExportLatestHash(value);
  if (!latestHash) return null;

  const exportedAtMs = typeof value.exportedAt === 'string' ? Date.parse(value.exportedAt) : NaN;
  return {
    fileName: basename(filePath),
    filePath,
    latestHash,
    sourceSha256: sha256Buffer(fileBuffer),
    sizeBytes: fileBuffer.length,
    exportedAt: Number.isFinite(exportedAtMs) ? new Date(exportedAtMs).toISOString() : fileStat.mtime.toISOString(),
    sortTime: Number.isFinite(exportedAtMs) ? exportedAtMs : fileStat.mtime.getTime()
  };
}

async function findNewestAuditExport(auditDir) {
  const entries = await readdir(auditDir, { withFileTypes: true });
  const candidates = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    const filePath = join(auditDir, entry.name);
    const fileStat = await stat(filePath);
    const fileBuffer = await readFile(filePath);
    let parsed;
    try {
      parsed = JSON.parse(fileBuffer.toString('utf8'));
    } catch {
      continue;
    }
    const candidate = readAuditCandidate(parsed, filePath, fileStat, fileBuffer);
    if (candidate) candidates.push(candidate);
  }

  candidates.sort((a, b) => b.sortTime - a.sortTime || b.fileName.localeCompare(a.fileName));
  return candidates[0] || null;
}

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readState(statePath) {
  try {
    return parseJsonStrict(await readFile(statePath, 'utf8'), 'Schedule state');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function stateMatchesAuditExport(state, auditExport, destination) {
  return Boolean(
    state &&
    state.app === APP_ID &&
    state.stateVersion === STATE_VERSION &&
    state.auditLogFileName === auditExport.fileName &&
    state.latestHash === auditExport.latestHash &&
    state.sourceSha256 === auditExport.sourceSha256 &&
    state.destinationPathOrUrl === destination
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

async function writeState(statePath, auditExport, retentionSummary, args) {
  const state = {
    app: APP_ID,
    stateVersion: STATE_VERSION,
    updatedAt: new Date().toISOString(),
    connector: LOCAL_WORM_CONNECTOR_ID,
    auditLogFileName: auditExport.fileName,
    auditLogPath: auditExport.filePath,
    latestHash: auditExport.latestHash,
    sourceSha256: auditExport.sourceSha256,
    exportedAt: auditExport.exportedAt,
    storageName: args.storageName,
    destinationPathOrUrl: args.destination,
    destinationObjectPath: retentionSummary.destinationObjectPath,
    manifestPath: retentionSummary.manifestPath,
    manifestEntryHash: retentionSummary.manifestEntryHash,
    receiptPath: retentionSummary.receiptPath,
    readBackVerified: retentionSummary.readBackVerified === true,
    latestHashMatched: retentionSummary.latestHashMatched === true,
    readOnlyLockApplied: retentionSummary.readOnlyLockApplied === true,
    immutableStorageVerified: retentionSummary.immutableStorageVerified === true,
    statusLabel: retentionSummary.statusLabel,
    requiredActions: Array.isArray(retentionSummary.requiredActions) ? retentionSummary.requiredActions : []
  };

  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return state;
}

function buildFailureNotice(auditExport, statePath, args, error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    app: APP_ID,
    noticeVersion: 1,
    type: LOCAL_WORM_FAILURE_NOTICE_TYPE,
    failedAt: new Date().toISOString(),
    connector: LOCAL_WORM_CONNECTOR_ID,
    statePath,
    auditLogFileName: auditExport.fileName,
    auditLogPath: auditExport.filePath,
    latestHash: auditExport.latestHash,
    sourceSha256: auditExport.sourceSha256,
    storageName: args.storageName,
    destinationPathOrUrl: args.destination,
    status: 'failed',
    statusLabel: '監査ログローカル/NAS WORM保全失敗',
    errorMessage: message,
    requiredActions: [
      '監査ログローカル/NAS WORM保全ジョブとマウント先を確認する',
      '失敗原因を解消し、同じ監査ログJSONで定期実行ジョブを再実行する',
      '復旧後に受領書JSONを保管し、保全台帳CSVへ最新ハッシュ照合結果を記録する'
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
  const envName = assertNonEmptyString(args.failureWebhookBearerEnv, '--failure-webhook-bearer-env');
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
        'user-agent': 'YakurekiAuditLogLocalWormRetention/1.0',
        ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {})
      },
      body: JSON.stringify(notice),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Failure webhook returned HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
    }
    return { ok: true, status: response.status, url: webhookUrl };
  } finally {
    clearTimeout(timeout);
  }
}

async function runRetention(auditExport, args) {
  const retentionArgs = [
    retentionScriptPath,
    '--audit-json',
    auditExport.filePath,
    '--destination',
    args.destination,
    '--expected-latest-hash',
    auditExport.latestHash,
    '--storage-name',
    args.storageName,
    '--retention-days',
    String(args.retentionDays)
  ];
  if (!args.lockReadOnly) {
    retentionArgs.push('--no-read-only-lock');
  }
  if (args.immutableVerified) {
    retentionArgs.push('--immutable-verified');
  }

  try {
    const { stdout } = await execFileAsync(process.execPath, retentionArgs, { maxBuffer: 1024 * 1024 });
    return parseJsonStrict(stdout, 'Audit local WORM retention job output');
  } catch (error) {
    const detail = [
      error instanceof Error ? error.message : String(error),
      error?.stderr,
      error?.stdout
    ].filter(Boolean).join('\n');
    throw new Error(`Scheduled audit-log local/NAS WORM retention failed.\n${detail}`);
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.auditDir) {
    throw new Error(`--audit-dir is required.\n${usage()}`);
  }
  if (!args.destination) {
    throw new Error(`--destination is required.\n${usage()}`);
  }

  const auditDir = resolveLocalWormPath(args.auditDir, '--audit-dir');
  const stateDir = args.stateDir
    ? resolveLocalWormPath(args.stateDir, '--state-dir')
    : join(auditDir, '.yakureki-audit-local-worm-state');
  const statePath = join(stateDir, STATE_FILE_NAME);
  const auditExport = await findNewestAuditExport(auditDir);
  if (!auditExport) {
    throw new Error(`No pharma-oss audit-log export JSON found in ${auditDir}`);
  }

  const maxAgeHours = parseMaxAgeHours(args.maxAgeHours);
  if (maxAgeHours !== undefined) {
    const ageHours = (Date.now() - auditExport.sortTime) / (60 * 60 * 1000);
    if (ageHours > maxAgeHours) {
      throw new Error(`Newest audit-log export is older than ${maxAgeHours} hours: ${auditExport.fileName}`);
    }
  }

  const state = await readState(statePath);
  if (!args.force && stateMatchesAuditExport(state, auditExport, args.destination) && state.receiptPath && await exists(state.receiptPath)) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      connector: LOCAL_WORM_CONNECTOR_ID,
      auditLogFileName: auditExport.fileName,
      latestHash: auditExport.latestHash,
      sourceSha256: auditExport.sourceSha256,
      destinationObjectPath: state.destinationObjectPath,
      receiptPath: state.receiptPath,
      statusLabel: '監査ログローカル/NAS WORM保全ジョブは実行済み',
      requiredActions: ['受領書JSONが保管され、保全台帳CSVへ最新ハッシュ照合結果が記録済みか確認する']
    }, null, 2));
    return;
  }

  if (args.dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      connector: LOCAL_WORM_CONNECTOR_ID,
      auditLogFileName: auditExport.fileName,
      latestHash: auditExport.latestHash,
      sourceSha256: auditExport.sourceSha256,
      storageName: args.storageName,
      destinationPathOrUrl: args.destination,
      statusLabel: '監査ログ定期ローカル/NAS WORM保全確認OK',
      requiredActions: ['NASマウント先とWORM設定を確認し、スケジューラから同じコマンドを実行する']
    }, null, 2));
    return;
  }

  let retentionSummary;
  try {
    retentionSummary = await runRetention(auditExport, args);
  } catch (error) {
    const failureNotice = buildFailureNotice(auditExport, statePath, args, error);
    if (args.failureNotice) {
      const noticePath = resolveLocalWormPath(args.failureNotice, '--failure-notice');
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

  const nextState = await writeState(statePath, auditExport, retentionSummary, args);
  console.log(JSON.stringify({
    ok: true,
    scheduled: true,
    connector: LOCAL_WORM_CONNECTOR_ID,
    auditLogFileName: auditExport.fileName,
    latestHash: auditExport.latestHash,
    sourceSha256: auditExport.sourceSha256,
    destinationObjectPath: retentionSummary.destinationObjectPath,
    manifestPath: retentionSummary.manifestPath,
    manifestEntryHash: retentionSummary.manifestEntryHash,
    receiptPath: retentionSummary.receiptPath,
    statePath,
    statusLabel: retentionSummary.statusLabel,
    requiredActions: nextState.requiredActions
  }, null, 2));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
