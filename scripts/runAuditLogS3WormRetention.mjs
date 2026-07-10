#!/usr/bin/env node
import { constants } from 'node:fs';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const APP_ID = 'yakureki';
const AUDIT_EXPORT_TYPE = 'audit-log-export';
const RECEIPT_VERSION = 1;
const DEFAULT_RETENTION_DAYS = 2555;
const DEFAULT_OBJECT_LOCK_MODE = 'GOVERNANCE';

function usage() {
  return [
    'Usage: node scripts/runAuditLogS3WormRetention.mjs --audit-json <path> --destination s3://bucket/prefix/ [--receipt <path>] [--expected-latest-hash <hash>] [--storage-name <name>] [--retention-days <days>] [--aws-bin <aws>] [--profile <name>] [--region <name>] [--object-lock-mode GOVERNANCE|COMPLIANCE] [--allow-overwrite] [--skip-object-lock-check] [--dry-run]',
    '',
    'Uploads an exported pharma-oss audit-log JSON to S3 with Object Lock retention, reads it back, verifies SHA-256 and integrity.latestHash, and writes a retention receipt JSON.',
    'AWS CLI credentials and an Object Lock enabled bucket must be configured outside pharma-oss.'
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    allowOverwrite: false,
    dryRun: false,
    skipObjectLockCheck: false,
    awsBin: 'aws',
    objectLockMode: DEFAULT_OBJECT_LOCK_MODE,
    retentionDays: DEFAULT_RETENTION_DAYS,
    storageName: 'S3 WORM'
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
    if (arg === '--skip-object-lock-check') {
      args.skipObjectLockCheck = true;
      continue;
    }
    if ([
      '--audit-json',
      '--destination',
      '--receipt',
      '--expected-latest-hash',
      '--storage-name',
      '--retention-days',
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
    if (!text.startsWith('file://')) {
      throw new Error(`${label} must be a local path or file:// URL. Got: ${text}`);
    }
    return fileURLToPath(text);
  }
  return isAbsolute(text) ? text : resolve(text);
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

function parseS3Destination(destination, fileName) {
  const text = assertString(destination, 'destination');
  if (!text.startsWith('s3://')) {
    throw new Error(`destination must be an s3:// URL for audit-log WORM retention. Got: ${text}`);
  }
  const url = new URL(text);
  if (url.protocol !== 's3:') {
    throw new Error(`destination must be an s3:// URL for audit-log WORM retention. Got: ${text}`);
  }
  const bucket = assertString(url.hostname, 'S3 bucket');
  const prefix = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  const key = prefix ? `${prefix}/${fileName}` : fileName;
  return {
    bucket,
    key,
    objectUrl: `s3://${bucket}/${key}`
  };
}

function getAuditLatestHash(payload) {
  return typeof payload?.integrity?.latestHash === 'string' && payload.integrity.latestHash.trim() !== ''
    ? payload.integrity.latestHash.trim()
    : undefined;
}

function validateAuditExportPayload(payload, expectedLatestHash) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Audit log export must be a JSON object.');
  }
  if (payload.app !== APP_ID) {
    throw new Error(`Audit log export app must be ${APP_ID}.`);
  }
  if (payload.type !== AUDIT_EXPORT_TYPE) {
    throw new Error(`Audit log export type must be ${AUDIT_EXPORT_TYPE}.`);
  }
  if (!Array.isArray(payload.logs)) {
    throw new Error('Audit log export logs must be an array.');
  }
  const latestHash = getAuditLatestHash(payload);
  if (!latestHash) {
    throw new Error('Audit log export integrity.latestHash is required.');
  }
  if (expectedLatestHash && latestHash !== expectedLatestHash) {
    throw new Error(`Audit latest hash mismatch. expected=${expectedLatestHash} actual=${latestHash}`);
  }
  return latestHash;
}

function makeReceiptFileName(auditLogFileName, date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${auditLogFileName.replace(/\.json$/i, '')}_s3_worm_retention_receipt_${stamp}.json`;
}

function makeRetainUntilDate(retentionDays, date = new Date()) {
  return new Date(date.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

function awsArgs(args, command) {
  const base = [];
  if (args.profile) base.push('--profile', args.profile);
  if (args.region) base.push('--region', args.region);
  return [...base, ...command];
}

async function runAws(args, command, options = {}) {
  return execFileAsync(args.awsBin, awsArgs(args, command), {
    encoding: options.encoding || 'utf8',
    maxBuffer: options.maxBuffer || 1024 * 1024 * 64
  });
}

function parseJsonOutput(stdout, label) {
  const text = Buffer.isBuffer(stdout) ? stdout.toString('utf8') : stdout;
  if (!text || text.trim() === '') return {};
  return readJson(text, label);
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function headObject(args, bucket, key) {
  try {
    const { stdout } = await runAws(args, ['s3api', 'head-object', '--bucket', bucket, '--key', key]);
    return parseJsonOutput(stdout, 'S3 head-object output');
  } catch {
    return null;
  }
}

function objectLockIsVerified(head, now = new Date()) {
  if (!head || typeof head !== 'object') return false;
  if (head.ObjectLockLegalHoldStatus === 'ON') return true;
  if (!['GOVERNANCE', 'COMPLIANCE'].includes(head.ObjectLockMode)) return false;
  const retainUntil = Date.parse(head.ObjectLockRetainUntilDate || '');
  return Number.isFinite(retainUntil) && retainUntil > now.getTime();
}

async function writeJsonOnce(path, value, allowOverwrite) {
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
  if (!args.auditJson) {
    throw new Error(`--audit-json is required.\n${usage()}`);
  }
  if (!args.destination) {
    throw new Error(`--destination is required.\n${usage()}`);
  }

  const auditJsonPath = resolveLocalPath(args.auditJson, '--audit-json');
  const auditLogFileName = basename(auditJsonPath);
  const auditBuffer = await readFile(auditJsonPath);
  const auditStat = await stat(auditJsonPath);
  const sourceSha256 = sha256(auditBuffer);
  const payload = readJson(auditBuffer.toString('utf8'), 'Audit log export');
  const latestHash = validateAuditExportPayload(payload, args.expectedLatestHash);
  const destination = parseS3Destination(args.destination, auditLogFileName);
  const receiptPath = args.receipt
    ? resolveLocalPath(args.receipt, '--receipt')
    : join(dirname(auditJsonPath), makeReceiptFileName(auditLogFileName));
  const retainUntilDate = makeRetainUntilDate(args.retentionDays);

  if (args.dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      auditLogFileName,
      latestHash,
      sourceSha256,
      destinationObjectPath: destination.objectUrl,
      storageName: args.storageName,
      retentionDays: args.retentionDays,
      objectLockMode: args.objectLockMode,
      retainUntilDate,
      receiptPath,
      statusLabel: '監査ログS3 WORM保全確認OK',
      requiredActions: ['AWS CLI認証、S3 Object Lock有効化、受領書JSONの保管、保全台帳CSVへの最新ハッシュ照合結果記録を確認する']
    }, null, 2));
    return;
  }

  const beforeHead = await headObject(args, destination.bucket, destination.key);
  if (beforeHead && !args.allowOverwrite) {
    throw new Error(`S3 object already exists: ${destination.objectUrl}`);
  }

  await runAws(args, [
    's3api',
    'put-object',
    '--bucket',
    destination.bucket,
    '--key',
    destination.key,
    '--body',
    auditJsonPath,
    '--object-lock-mode',
    args.objectLockMode,
    '--object-lock-retain-until-date',
    retainUntilDate
  ]);

  const { stdout: readBackBuffer } = await runAws(
    args,
    ['s3', 'cp', destination.objectUrl, '-'],
    { encoding: 'buffer', maxBuffer: Math.max(auditStat.size * 2, 1024 * 1024 * 64) }
  );
  const readBackSha256 = sha256(readBackBuffer);
  const readBackPayload = readJson(readBackBuffer.toString('utf8'), 'Read-back audit log export');
  const readBackLatestHash = validateAuditExportPayload(readBackPayload, latestHash);
  const readBackVerified = readBackSha256 === sourceSha256 && readBackBuffer.length === auditStat.size;
  const latestHashMatched = latestHash === readBackLatestHash;
  if (!readBackVerified || !latestHashMatched) {
    throw new Error(`S3 read-back audit verification failed: ${destination.objectUrl}`);
  }

  const afterHead = await headObject(args, destination.bucket, destination.key);
  const contentLength = Number(afterHead?.ContentLength);
  const sizeVerified = Number.isFinite(contentLength) ? contentLength === auditStat.size : true;
  const immutableStorageVerified = !args.skipObjectLockCheck && objectLockIsVerified(afterHead);
  const status = readBackVerified && latestHashMatched && sizeVerified && immutableStorageVerified ? 'pass' : 'attention';
  const requiredActions = [];
  if (!immutableStorageVerified) {
    requiredActions.push('S3 Object Lockの保持期限またはリーガルホールドを確認する');
  }
  if (!sizeVerified) {
    requiredActions.push('S3のContentLengthと監査ログJSONサイズを確認する');
  }
  requiredActions.push('受領書JSONを保管し、保全台帳CSVへ最新ハッシュ照合結果を記録する');

  const receipt = {
    app: APP_ID,
    receiptVersion: RECEIPT_VERSION,
    type: 'audit-log-s3-worm-retention-receipt',
    transferredAt: new Date().toISOString(),
    connector: 'aws-cli-s3-worm',
    auditLogFileName,
    sourceAuditLogPath: auditJsonPath,
    storageName: args.storageName,
    destinationObjectPath: destination.objectUrl,
    destinationPathOrUrl: args.destination,
    latestHash,
    sourceSha256,
    bytesCopied: auditStat.size,
    readBackVerified,
    latestHashMatched,
    immutableStorageVerified,
    retentionDays: args.retentionDays,
    objectLockMode: afterHead?.ObjectLockMode || args.objectLockMode,
    objectLockRetainUntilDate: afterHead?.ObjectLockRetainUntilDate || retainUntilDate,
    objectVersionId: afterHead?.VersionId,
    status,
    statusLabel: status === 'pass' ? '監査ログWORM保存OK' : '監査ログ保存完了・S3保持設定確認待ち',
    requiredActions
  };

  await mkdir(dirname(receiptPath), { recursive: true });
  if (!args.allowOverwrite && await exists(receiptPath)) {
    throw new Error(`Receipt already exists: ${receiptPath}`);
  }
  await writeJsonOnce(receiptPath, receipt, args.allowOverwrite);

  console.log(JSON.stringify({
    ok: true,
    auditLogFileName,
    destinationObjectPath: destination.objectUrl,
    receiptPath,
    latestHash,
    sourceSha256,
    readBackVerified,
    latestHashMatched,
    immutableStorageVerified,
    objectLockMode: receipt.objectLockMode,
    statusLabel: receipt.statusLabel,
    requiredActions: receipt.requiredActions
  }, null, 2));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
