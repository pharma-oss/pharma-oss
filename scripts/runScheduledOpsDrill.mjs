#!/usr/bin/env node
import { constants } from 'node:fs';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ID = 'yakureki';
const RECEIPT_VERSION = 1;

function usage() {
  return [
    'Usage: node scripts/runScheduledOpsDrill.mjs --scheduler-name <name> --receipt <path> --webhook-url <url> [--backup-state <path>] [--audit-state <path>] [--browser-export-receipt <path>] [--s3-preflight-receipt <path>] [--browser-profile-path <path>] [--scheduler-evidence <path>] [--operator <name>] [--environment-name <name>] [--webhook-bearer-env <ENV>] [--webhook-timeout-ms <ms>] [--max-age-hours <hours>] [--require-backup-state] [--require-audit-state] [--require-browser-profile] [--require-s3-preflight] [--require-scheduler-evidence] [--allow-plaintext-backup] [--allow-overwrite] [--dry-run]',
    '',
    'Checks no-patient-data operational evidence for scheduled backup/audit-log jobs and sends a harmless webhook delivery drill event.',
    'Use this after registering cron, launchd, Task Scheduler, or another production job runner.'
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    allowOverwrite: false,
    allowPlaintextBackup: false,
    dryRun: false,
    requireAuditState: false,
    requireBackupState: false,
    requireBrowserProfile: false,
    requireS3Preflight: false,
    requireSchedulerEvidence: false,
    schedulerEvidence: []
  };
  const valueArgs = new Set([
    '--audit-state',
    '--backup-state',
    '--browser-export-receipt',
    '--browser-profile-path',
    '--environment-name',
    '--max-age-hours',
    '--operator',
    '--receipt',
    '--s3-preflight-receipt',
    '--scheduler-name',
    '--webhook-bearer-env',
    '--webhook-timeout-ms',
    '--webhook-url'
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
    if (arg === '--allow-plaintext-backup') {
      args.allowPlaintextBackup = true;
      continue;
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--require-audit-state') {
      args.requireAuditState = true;
      continue;
    }
    if (arg === '--require-backup-state') {
      args.requireBackupState = true;
      continue;
    }
    if (arg === '--require-browser-profile') {
      args.requireBrowserProfile = true;
      continue;
    }
    if (arg === '--require-s3-preflight') {
      args.requireS3Preflight = true;
      continue;
    }
    if (arg === '--require-scheduler-evidence') {
      args.requireSchedulerEvidence = true;
      continue;
    }
    if (arg === '--scheduler-evidence') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value.\n${usage()}`);
      }
      args.schedulerEvidence.push(value);
      i += 1;
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

  const timeoutMs = args.webhookTimeoutMs === undefined ? 10000 : Number(args.webhookTimeoutMs);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    throw new Error('--webhook-timeout-ms must be at least 1000.');
  }
  args.webhookTimeoutMs = Math.floor(timeoutMs);

  if (args.maxAgeHours !== undefined) {
    const hours = Number(args.maxAgeHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new Error('--max-age-hours must be a positive number.');
    }
    args.maxAgeHours = hours;
  }
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
      throw new Error(`${label} must be a local path or file:// URL. Got: ${text}`);
    }
    return fileURLToPath(text);
  }
  return isAbsolute(text) ? text : resolve(text);
}

function normalizeWebhookUrl(value) {
  const text = assertString(value, '--webhook-url');
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('--webhook-url must be a valid URL.');
  }
  const hostname = url.hostname.toLowerCase();
  const isLocalHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(hostname);
  if (url.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('--webhook-url must use https://, except http://localhost for local monitoring tests.');
  }
  return url.toString();
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

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(path, label) {
  return readJson(await readFile(path, 'utf8'), label);
}

function requireIsoDate(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO date string.`);
  }
  return value;
}

function assertFresh(isoDate, label, maxAgeHours) {
  if (maxAgeHours === undefined) return;
  const ageHours = (Date.now() - Date.parse(isoDate)) / (60 * 60 * 1000);
  if (ageHours > maxAgeHours) {
    throw new Error(`${label} is older than ${maxAgeHours} hours.`);
  }
}

function requireHexSha256(value, label) {
  const text = assertString(value, label).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(text)) {
    throw new Error(`${label} must be a 64-character hex SHA-256 value.`);
  }
  return text;
}

async function summarizeEvidenceFile(path) {
  const fileStat = await stat(path);
  if (!fileStat.isFile()) {
    throw new Error(`Scheduler evidence must be a file: ${path}`);
  }
  const buffer = await readFile(path);
  return {
    fileName: basename(path),
    path,
    sizeBytes: buffer.length,
    sha256: sha256(buffer)
  };
}

async function summarizeBackupState(path, maxAgeHours) {
  const state = await readJsonFile(path, 'Backup schedule state');
  if (state?.app !== APP_ID || state.stateVersion !== 1) {
    throw new Error('Backup schedule state must be a pharma-oss stateVersion 1 JSON.');
  }
  const updatedAt = requireIsoDate(state.updatedAt, 'backup state updatedAt');
  assertFresh(updatedAt, 'Backup schedule state', maxAgeHours);
  const backupSha = requireHexSha256(state.backupSha256, 'backup state backupSha256');
  const receiptPath = assertString(state.receiptPath, 'backup state receiptPath');
  if (!await exists(receiptPath)) {
    throw new Error(`Backup schedule receipt does not exist: ${receiptPath}`);
  }
  return {
    statePath: path,
    stateFileName: basename(path),
    updatedAt,
    connector: assertString(state.connector || 'local', 'backup state connector'),
    manifestFileName: assertString(state.lastManifestFileName, 'backup state lastManifestFileName'),
    backupFileName: assertString(state.backupFileName, 'backup state backupFileName'),
    backupSha256: backupSha,
    destinationName: typeof state.destinationName === 'string' ? state.destinationName : undefined,
    receiptFileName: basename(receiptPath),
    receiptPath,
    statusLabel: typeof state.statusLabel === 'string' ? state.statusLabel : undefined
  };
}

async function summarizeAuditState(path, maxAgeHours) {
  const state = await readJsonFile(path, 'Audit-log schedule state');
  if (state?.app !== APP_ID || state.stateVersion !== 1) {
    throw new Error('Audit-log schedule state must be a pharma-oss stateVersion 1 JSON.');
  }
  const updatedAt = requireIsoDate(state.updatedAt, 'audit state updatedAt');
  assertFresh(updatedAt, 'Audit-log schedule state', maxAgeHours);
  const sourceSha = requireHexSha256(state.sourceSha256, 'audit state sourceSha256');
  const receiptPath = assertString(state.receiptPath, 'audit state receiptPath');
  if (!await exists(receiptPath)) {
    throw new Error(`Audit-log retention receipt does not exist: ${receiptPath}`);
  }
  return {
    statePath: path,
    stateFileName: basename(path),
    updatedAt,
    auditLogFileName: assertString(state.auditLogFileName, 'audit state auditLogFileName'),
    latestHash: assertString(state.latestHash, 'audit state latestHash'),
    sourceSha256: sourceSha,
    destinationPathOrUrl: typeof state.destinationPathOrUrl === 'string' ? state.destinationPathOrUrl : undefined,
    receiptFileName: basename(receiptPath),
    receiptPath,
    statusLabel: typeof state.statusLabel === 'string' ? state.statusLabel : undefined
  };
}

async function summarizeBrowserExportReceipt(path, allowPlaintextBackup) {
  const receipt = await readJsonFile(path, 'Browser backup export receipt');
  if (receipt?.app !== APP_ID || receipt.type !== 'browser-backup-export-receipt') {
    throw new Error('Browser export receipt must be a pharma-oss browser-backup-export-receipt JSON.');
  }
  if (receipt.status !== 'pass') {
    throw new Error(`Browser export receipt status must be pass. Got: ${receipt.status}`);
  }
  if (!allowPlaintextBackup && receipt.encrypted !== true) {
    throw new Error('Browser export receipt must be encrypted. Pass --allow-plaintext-backup only for exceptional migration or incident work.');
  }
  return {
    receiptPath: path,
    receiptFileName: basename(path),
    exportedAt: requireIsoDate(receipt.exportedAt, 'browser export receipt exportedAt'),
    backupFileName: assertString(receipt.backupFileName, 'browser export receipt backupFileName'),
    backupSha256: requireHexSha256(receipt.backupSha256, 'browser export receipt backupSha256'),
    encrypted: receipt.encrypted === true,
    statusLabel: typeof receipt.statusLabel === 'string' ? receipt.statusLabel : undefined
  };
}

async function summarizeS3PreflightReceipt(path) {
  const receipt = await readJsonFile(path, 'S3 WORM preflight receipt');
  if (receipt?.app !== APP_ID || receipt.type !== 's3-worm-preflight-receipt') {
    throw new Error('S3 preflight receipt must be a pharma-oss s3-worm-preflight-receipt JSON.');
  }
  if (receipt.status !== 'pass' || receipt.readBackVerified !== true || receipt.immutableStorageVerified !== true) {
    throw new Error('S3 preflight receipt must have pass status, readBackVerified=true, and immutableStorageVerified=true.');
  }
  return {
    receiptPath: path,
    receiptFileName: basename(path),
    checkedAt: requireIsoDate(receipt.checkedAt, 'S3 preflight receipt checkedAt'),
    destinationPathOrUrl: assertString(receipt.destinationPathOrUrl, 'S3 preflight destinationPathOrUrl'),
    readBackVerified: true,
    immutableStorageVerified: true,
    statusLabel: typeof receipt.statusLabel === 'string' ? receipt.statusLabel : undefined
  };
}

async function summarizeBrowserProfile(path) {
  const profileStat = await stat(path);
  if (!profileStat.isDirectory()) {
    throw new Error(`Browser profile path must be a directory: ${path}`);
  }
  return {
    path,
    directoryName: basename(path),
    exists: true
  };
}

function addCheck(checks, id, label, passed, detail) {
  checks.push({
    id,
    label,
    status: passed ? 'pass' : 'missing',
    detail
  });
}

function requireIfMissing(value, required, label, optionName) {
  if (required && !value) {
    throw new Error(`${label} is required. Pass ${optionName}.`);
  }
}

function webhookBearerToken(args) {
  if (!args.webhookBearerEnv) return undefined;
  const envName = assertString(args.webhookBearerEnv, '--webhook-bearer-env');
  const token = process.env[envName];
  if (typeof token !== 'string' || token.trim() === '') {
    throw new Error(`Environment variable ${envName} is empty. It is required by --webhook-bearer-env.`);
  }
  return token.trim();
}

function buildWebhookPayload(receipt) {
  return {
    app: APP_ID,
    type: 'scheduled-ops-webhook-drill',
    drillVersion: RECEIPT_VERSION,
    generatedAt: receipt.checkedAt,
    schedulerName: receipt.schedulerName,
    environmentName: receipt.environmentName,
    operator: receipt.operator,
    backup: receipt.backupState
      ? {
        connector: receipt.backupState.connector,
        manifestFileName: receipt.backupState.manifestFileName,
        backupFileName: receipt.backupState.backupFileName,
        backupSha256: receipt.backupState.backupSha256,
        receiptFileName: receipt.backupState.receiptFileName,
        updatedAt: receipt.backupState.updatedAt
      }
      : undefined,
    auditLog: receipt.auditState
      ? {
        auditLogFileName: receipt.auditState.auditLogFileName,
        latestHash: receipt.auditState.latestHash,
        sourceSha256: receipt.auditState.sourceSha256,
        receiptFileName: receipt.auditState.receiptFileName,
        updatedAt: receipt.auditState.updatedAt
      }
      : undefined,
    schedulerEvidence: receipt.schedulerEvidence.map((item) => ({
      fileName: item.fileName,
      sizeBytes: item.sizeBytes,
      sha256: item.sha256
    })),
    checks: receipt.checks.map((check) => ({
      id: check.id,
      label: check.label,
      status: check.status
    })),
    note: 'No patient, prescription, or audit-log body data is included.'
  };
}

async function postWebhook(args, receipt) {
  if (args.dryRun) {
    return {
      delivered: false,
      dryRun: true,
      status: null,
      url: args.webhookUrl ? normalizeWebhookUrl(args.webhookUrl) : undefined
    };
  }
  const webhookUrl = normalizeWebhookUrl(args.webhookUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.webhookTimeoutMs);
  const bearerToken = webhookBearerToken(args);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'YakurekiScheduledOpsDrill/1.0',
        ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {})
      },
      body: JSON.stringify(buildWebhookPayload(receipt)),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Webhook drill returned HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
    }
    return {
      delivered: true,
      dryRun: false,
      status: response.status,
      url: webhookUrl
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function writeJsonOnce(path, value, allowOverwrite) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: allowOverwrite ? 'w' : 'wx'
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const schedulerName = assertString(args.schedulerName, '--scheduler-name');
  const receiptPath = resolveLocalPath(args.receipt, '--receipt');
  if (!args.dryRun) {
    normalizeWebhookUrl(args.webhookUrl);
  }

  requireIfMissing(args.backupState, args.requireBackupState, 'Backup schedule state', '--backup-state <path>');
  requireIfMissing(args.auditState, args.requireAuditState, 'Audit-log schedule state', '--audit-state <path>');
  requireIfMissing(args.browserProfilePath, args.requireBrowserProfile, 'Browser profile path', '--browser-profile-path <path>');
  requireIfMissing(args.s3PreflightReceipt, args.requireS3Preflight, 'S3 preflight receipt', '--s3-preflight-receipt <path>');
  if (args.requireSchedulerEvidence && args.schedulerEvidence.length === 0) {
    throw new Error('Scheduler evidence is required. Pass --scheduler-evidence <path>.');
  }

  const checks = [];
  const schedulerEvidence = [];
  for (const evidencePathValue of args.schedulerEvidence) {
    schedulerEvidence.push(await summarizeEvidenceFile(resolveLocalPath(evidencePathValue, '--scheduler-evidence')));
  }
  addCheck(checks, 'scheduler-name', 'OSスケジューラ名', true, schedulerName);
  addCheck(checks, 'scheduler-evidence', 'スケジューラ登録証跡ファイル', schedulerEvidence.length > 0, schedulerEvidence.length > 0 ? `${schedulerEvidence.length} file(s)` : 'not provided');

  const backupState = args.backupState
    ? await summarizeBackupState(resolveLocalPath(args.backupState, '--backup-state'), args.maxAgeHours)
    : null;
  addCheck(checks, 'backup-state', 'バックアップ定期外部保存の状態JSON', Boolean(backupState), backupState?.stateFileName || 'not provided');

  const auditState = args.auditState
    ? await summarizeAuditState(resolveLocalPath(args.auditState, '--audit-state'), args.maxAgeHours)
    : null;
  addCheck(checks, 'audit-state', '監査ログWORM定期保全の状態JSON', Boolean(auditState), auditState?.stateFileName || 'not provided');

  const browserExportReceipt = args.browserExportReceipt
    ? await summarizeBrowserExportReceipt(resolveLocalPath(args.browserExportReceipt, '--browser-export-receipt'), args.allowPlaintextBackup)
    : null;
  addCheck(checks, 'browser-export-receipt', 'ブラウザ外バックアップ書き出し受領書', Boolean(browserExportReceipt), browserExportReceipt?.receiptFileName || 'not provided');

  const s3PreflightReceipt = args.s3PreflightReceipt
    ? await summarizeS3PreflightReceipt(resolveLocalPath(args.s3PreflightReceipt, '--s3-preflight-receipt'))
    : null;
  addCheck(checks, 's3-preflight-receipt', 'S3 WORM事前確認受領書', Boolean(s3PreflightReceipt), s3PreflightReceipt?.receiptFileName || 'not provided');

  const browserProfile = args.browserProfilePath
    ? await summarizeBrowserProfile(resolveLocalPath(args.browserProfilePath, '--browser-profile-path'))
    : null;
  addCheck(checks, 'browser-profile', 'ログイン済みブラウザプロファイル', Boolean(browserProfile), browserProfile?.directoryName || 'not provided');

  const receipt = {
    app: APP_ID,
    receiptVersion: RECEIPT_VERSION,
    type: 'scheduled-ops-drill-receipt',
    checkedAt: new Date().toISOString(),
    schedulerName,
    environmentName: typeof args.environmentName === 'string' ? args.environmentName.trim() : undefined,
    operator: typeof args.operator === 'string' ? args.operator.trim() : undefined,
    backupState,
    auditState,
    browserExportReceipt,
    s3PreflightReceipt,
    browserProfile,
    schedulerEvidence,
    checks,
    webhook: null,
    status: 'pass',
    statusLabel: args.dryRun ? '定期ジョブ点検ドライランOK' : '定期ジョブ点検・通知訓練OK',
    requiredActions: [
      'この受領書JSONを導入・月次運用の証跡として保管する',
      'バックアップと監査ログWORM保全の受領書JSONがpharma-ossの監査ログへ記録済みか確認する',
      'Webhook監視側で到達訓練イベントを確認し、未達時の連絡先を更新する'
    ]
  };

  receipt.webhook = await postWebhook(args, receipt);
  if (!args.dryRun && !receipt.webhook.delivered) {
    throw new Error('Webhook drill was not delivered.');
  }
  await writeJsonOnce(receiptPath, receipt, args.allowOverwrite);

  console.log(JSON.stringify({
    ok: true,
    receiptPath,
    schedulerName,
    webhookDelivered: receipt.webhook.delivered,
    dryRun: receipt.webhook.dryRun,
    checks: receipt.checks,
    statusLabel: receipt.statusLabel,
    requiredActions: receipt.requiredActions
  }, null, 2));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
