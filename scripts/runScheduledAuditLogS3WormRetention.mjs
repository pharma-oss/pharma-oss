#!/usr/bin/env node
import { constants } from 'node:fs';
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const APP_ID = 'yakureki';
const AUDIT_EXPORT_TYPE = 'audit-log-export';
const STATE_VERSION = 1;
const STATE_FILE_NAME = 'audit_log_s3_worm_retention_schedule_state.json';
const retentionScriptPath = fileURLToPath(new URL('./runAuditLogS3WormRetention.mjs', import.meta.url));

function usage() {
  return [
    'Usage: node scripts/runScheduledAuditLogS3WormRetention.mjs --audit-dir <path> --destination s3://bucket/prefix/ [--state-dir <path>] [--failure-notice <path>] [--failure-webhook-url <url>] [--failure-webhook-bearer-env <ENV>] [--failure-webhook-timeout-ms <ms>] [--storage-name <name>] [--retention-days <days>] [--aws-bin <aws>] [--profile <name>] [--region <name>] [--object-lock-mode GOVERNANCE|COMPLIANCE] [--allow-overwrite] [--force] [--dry-run] [--max-age-hours <hours>] [--skip-object-lock-check]',
    '',
    'Finds the newest pharma-oss audit-log export JSON in a directory and runs the S3 WORM retention job once.',
    'Use this from cron, launchd, Task Scheduler, or another job runner after pharma-oss has written the audit-log export JSON.'
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    allowOverwrite: false,
    dryRun: false,
    force: false,
    skipObjectLockCheck: false,
    awsBin: 'aws',
    objectLockMode: 'GOVERNANCE',
    retentionDays: 2555,
    storageName: 'S3 WORM'
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
    '--max-age-hours',
    '--aws-bin',
    '--profile',
    '--region',
    '--object-lock-mode'
  ]);

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
    if (arg === '--skip-object-lock-check') {
      args.skipObjectLockCheck = true;
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

  const lockMode = String(args.objectLockMode || '').toUpperCase();
  if (!['GOVERNANCE', 'COMPLIANCE'].includes(lockMode)) {
    throw new Error('--object-lock-mode must be GOVERNANCE or COMPLIANCE.');
  }
  args.objectLockMode = lockMode;

  const retentionDays = Number(args.retentionDays);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error('--retention-days must be a positive number.');
  }
  args.retentionDays = Math.ceil(retentionDays);
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
    throw new Error(`${label} must be a local path. Got: ${text}`);
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

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function getAuditLatestHash(payload) {
  return typeof payload?.integrity?.latestHash === 'string' && payload.integrity.latestHash.trim() !== ''
    ? payload.integrity.latestHash.trim()
    : undefined;
}

function readAuditCandidate(value, filePath, fileStat, fileBuffer) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.app !== APP_ID || value.type !== AUDIT_EXPORT_TYPE) return null;
  if (!Array.isArray(value.logs)) return null;
  const latestHash = getAuditLatestHash(value);
  if (!latestHash) return null;

  const exportedAtMs = typeof value.exportedAt === 'string' ? Date.parse(value.exportedAt) : NaN;
  return {
    fileName: basename(filePath),
    filePath,
    latestHash,
    sourceSha256: sha256(fileBuffer),
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
    const parsed = parseJson(fileBuffer.toString('utf8'), entry.name);
    const candidate = readAuditCandidate(parsed, filePath, fileStat, fileBuffer);
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
    auditLogFileName: auditExport.fileName,
    auditLogPath: auditExport.filePath,
    latestHash: auditExport.latestHash,
    sourceSha256: auditExport.sourceSha256,
    exportedAt: auditExport.exportedAt,
    storageName: args.storageName,
    destinationPathOrUrl: args.destination,
    destinationObjectPath: retentionSummary.destinationObjectPath,
    receiptPath: retentionSummary.receiptPath,
    readBackVerified: retentionSummary.readBackVerified === true,
    latestHashMatched: retentionSummary.latestHashMatched === true,
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
    type: 'audit-log-s3-worm-retention-failure-notice',
    failedAt: new Date().toISOString(),
    connector: 'aws-cli-s3-worm',
    statePath,
    auditLogFileName: auditExport.fileName,
    auditLogPath: auditExport.filePath,
    latestHash: auditExport.latestHash,
    sourceSha256: auditExport.sourceSha256,
    storageName: args.storageName,
    destinationPathOrUrl: args.destination,
    status: 'failed',
    statusLabel: '監査ログWORM保全失敗',
    errorMessage: message,
    requiredActions: [
      '監査ログS3 WORM保全ジョブを確認する',
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
        'user-agent': 'YakurekiAuditLogRetention/1.0',
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
    String(args.retentionDays),
    '--aws-bin',
    args.awsBin,
    '--object-lock-mode',
    args.objectLockMode
  ];
  if (args.profile) {
    retentionArgs.push('--profile', args.profile);
  }
  if (args.region) {
    retentionArgs.push('--region', args.region);
  }
  if (args.skipObjectLockCheck) {
    retentionArgs.push('--skip-object-lock-check');
  }
  if (args.allowOverwrite) {
    retentionArgs.push('--allow-overwrite');
  }

  try {
    const { stdout } = await execFileAsync(process.execPath, retentionArgs, { maxBuffer: 1024 * 1024 });
    return parseJson(stdout, 'Audit retention job output');
  } catch (error) {
    const detail = [
      error instanceof Error ? error.message : String(error),
      error?.stderr,
      error?.stdout
    ].filter(Boolean).join('\n');
    throw new Error(`Scheduled audit-log S3 WORM retention failed.\n${detail}`);
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

  const auditDir = resolveLocalPath(args.auditDir, '--audit-dir');
  const stateDir = args.stateDir
    ? resolveLocalPath(args.stateDir, '--state-dir')
    : join(auditDir, '.yakureki-audit-retention-state');
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
      auditLogFileName: auditExport.fileName,
      latestHash: auditExport.latestHash,
      sourceSha256: auditExport.sourceSha256,
      destinationObjectPath: state.destinationObjectPath,
      receiptPath: state.receiptPath,
      statusLabel: '監査ログWORM保全ジョブは実行済み',
      requiredActions: ['受領書JSONが保管され、保全台帳CSVへ最新ハッシュ照合結果が記録済みか確認する']
    }, null, 2));
    return;
  }

  if (args.dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      auditLogFileName: auditExport.fileName,
      latestHash: auditExport.latestHash,
      sourceSha256: auditExport.sourceSha256,
      storageName: args.storageName,
      destinationPathOrUrl: args.destination,
      statusLabel: '監査ログ定期WORM保全確認OK',
      requiredActions: ['AWS CLI認証とS3 Object Lock設定を確認し、スケジューラから同じコマンドを実行する']
    }, null, 2));
    return;
  }

  let retentionSummary;
  try {
    retentionSummary = await runRetention(auditExport, args);
  } catch (error) {
    const failureNotice = buildFailureNotice(auditExport, statePath, args, error);
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

  const nextState = await writeState(statePath, auditExport, retentionSummary, args);
  console.log(JSON.stringify({
    ok: true,
    scheduled: true,
    auditLogFileName: auditExport.fileName,
    latestHash: auditExport.latestHash,
    sourceSha256: auditExport.sourceSha256,
    destinationObjectPath: retentionSummary.destinationObjectPath,
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
