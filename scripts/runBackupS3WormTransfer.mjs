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
const MANIFEST_VERSION = 1;
const RECEIPT_VERSION = 1;
const DEFAULT_OBJECT_LOCK_MODE = 'GOVERNANCE';

function usage() {
  return [
    'Usage: node scripts/runBackupS3WormTransfer.mjs --manifest <path> [--backup <path>] [--destination s3://bucket/prefix/] [--receipt <path>] [--aws-bin <aws>] [--profile <name>] [--region <name>] [--object-lock-mode GOVERNANCE|COMPLIANCE] [--allow-overwrite] [--skip-object-lock-check] [--dry-run]',
    '',
    'Uploads a pharma-oss backup JSON to S3 with Object Lock retention, downloads it back for SHA-256 verification, and writes a receipt JSON.',
    'This script expects AWS CLI credentials and an Object Lock enabled bucket to be configured outside pharma-oss.'
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    allowOverwrite: false,
    dryRun: false,
    skipObjectLockCheck: false,
    awsBin: 'aws',
    objectLockMode: DEFAULT_OBJECT_LOCK_MODE
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
      '--manifest',
      '--backup',
      '--destination',
      '--receipt',
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
  return args;
}

function readJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
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

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Manifest must be a JSON object.');
  }
  if (manifest.app !== APP_ID) {
    throw new Error(`Manifest app must be ${APP_ID}.`);
  }
  if (manifest.manifestVersion !== MANIFEST_VERSION) {
    throw new Error(`Unsupported manifestVersion: ${manifest.manifestVersion}`);
  }
  const backupFileName = assertString(manifest.backupFileName, 'manifest.backupFileName');
  const backupSha256 = assertString(manifest.backupSha256, 'manifest.backupSha256').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(backupSha256)) {
    throw new Error('manifest.backupSha256 must be a 64-character hex SHA-256 value.');
  }

  return {
    ...manifest,
    backupFileName,
    backupSha256,
    destinationPathOrUrl: assertString(manifest.destinationPathOrUrl, 'manifest.destinationPathOrUrl'),
    destinationName: assertString(manifest.destinationName, 'manifest.destinationName'),
    retentionDays: Math.max(1, Number(manifest.retentionDays) || 1),
    requireImmutableStorage: manifest.requireImmutableStorage !== false
  };
}

function parseS3Destination(destination, backupFileName) {
  const text = assertString(destination, 'destination');
  if (!text.startsWith('s3://')) {
    throw new Error(`destination must be an s3:// URL for this connector. Got: ${text}`);
  }
  const url = new URL(text);
  if (url.protocol !== 's3:') {
    throw new Error(`destination must be an s3:// URL for this connector. Got: ${text}`);
  }
  const bucket = assertString(url.hostname, 'S3 bucket');
  const prefix = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  const key = prefix ? `${prefix}/${backupFileName}` : backupFileName;
  return {
    bucket,
    key,
    objectUrl: `s3://${bucket}/${key}`
  };
}

function makeReceiptFileName(backupFileName, date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${backupFileName.replace(/\.json$/i, '')}_s3_worm_transfer_receipt_${stamp}.json`;
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
  } catch (error) {
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
  if (!args.manifest) {
    throw new Error(`--manifest is required.\n${usage()}`);
  }

  const manifestPath = resolveLocalPath(args.manifest, '--manifest');
  const manifest = validateManifest(readJson(await readFile(manifestPath, 'utf8'), 'Manifest'));
  const backupPath = args.backup
    ? resolveLocalPath(args.backup, '--backup')
    : join(dirname(manifestPath), manifest.backupFileName);
  const destination = parseS3Destination(args.destination || manifest.destinationPathOrUrl, manifest.backupFileName);
  const receiptPath = args.receipt
    ? resolveLocalPath(args.receipt, '--receipt')
    : join(dirname(manifestPath), makeReceiptFileName(manifest.backupFileName));
  const retainUntilDate = makeRetainUntilDate(manifest.retentionDays);

  const backupBuffer = await readFile(backupPath);
  const sourceStat = await stat(backupPath);
  const sourceSha256 = sha256(backupBuffer);
  if (sourceSha256 !== manifest.backupSha256) {
    throw new Error(`Backup SHA-256 mismatch. manifest=${manifest.backupSha256} actual=${sourceSha256}`);
  }
  if (typeof manifest.backupSizeBytes === 'number' && manifest.backupSizeBytes !== sourceStat.size) {
    throw new Error(`Backup size mismatch. manifest=${manifest.backupSizeBytes} actual=${sourceStat.size}`);
  }

  if (args.dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      backupFileName: manifest.backupFileName,
      destinationBackupPath: destination.objectUrl,
      retentionDays: manifest.retentionDays,
      objectLockMode: manifest.requireImmutableStorage ? args.objectLockMode : 'not-required',
      retainUntilDate,
      receiptPath,
      statusLabel: 'S3 WORM連携確認OK',
      requiredActions: ['AWS CLI認証、S3 Object Lock有効化、受領書JSONの監査ログ記録を確認する']
    }, null, 2));
    return;
  }

  const beforeHead = await headObject(args, destination.bucket, destination.key);
  if (beforeHead && !args.allowOverwrite) {
    throw new Error(`S3 object already exists: ${destination.objectUrl}`);
  }

  const putCommand = [
    's3api',
    'put-object',
    '--bucket',
    destination.bucket,
    '--key',
    destination.key,
    '--body',
    backupPath
  ];
  if (manifest.requireImmutableStorage) {
    putCommand.push(
      '--object-lock-mode',
      args.objectLockMode,
      '--object-lock-retain-until-date',
      retainUntilDate
    );
  }
  await runAws(args, putCommand);

  const { stdout: readBackBuffer } = await runAws(
    args,
    ['s3', 'cp', destination.objectUrl, '-'],
    { encoding: 'buffer', maxBuffer: Math.max(sourceStat.size * 2, 1024 * 1024 * 64) }
  );
  const readBackSha256 = sha256(readBackBuffer);
  const readBackVerified = readBackSha256 === manifest.backupSha256 && readBackBuffer.length === sourceStat.size;
  if (!readBackVerified) {
    throw new Error(`S3 read-back verification failed: ${destination.objectUrl}`);
  }

  const afterHead = await headObject(args, destination.bucket, destination.key);
  const contentLength = Number(afterHead?.ContentLength);
  const sizeVerified = Number.isFinite(contentLength) ? contentLength === sourceStat.size : true;
  const immutableStorageVerified = manifest.requireImmutableStorage
    ? !args.skipObjectLockCheck && objectLockIsVerified(afterHead)
    : true;
  const status = readBackVerified && sizeVerified && immutableStorageVerified ? 'pass' : 'attention';
  const requiredActions = [];
  if (!immutableStorageVerified && manifest.requireImmutableStorage) {
    requiredActions.push('S3 Object Lockの保持期限またはリーガルホールドを確認する');
  }
  if (!sizeVerified) {
    requiredActions.push('S3のContentLengthとバックアップサイズを確認する');
  }
  requiredActions.push('外部保存確認をpharma-ossの監査ログに記録する');

  const receipt = {
    app: APP_ID,
    receiptVersion: RECEIPT_VERSION,
    transferredAt: new Date().toISOString(),
    connector: 'aws-cli-s3-worm',
    manifestFileName: basename(manifestPath),
    backupFileName: manifest.backupFileName,
    sourceBackupPath: backupPath,
    destinationName: manifest.destinationName,
    destinationBackupPath: destination.objectUrl,
    destinationPathOrUrl: args.destination || manifest.destinationPathOrUrl,
    backupSha256: manifest.backupSha256,
    bytesCopied: sourceStat.size,
    readBackVerified,
    immutableStorageVerified,
    retentionDays: manifest.retentionDays,
    objectLockMode: afterHead?.ObjectLockMode || (manifest.requireImmutableStorage ? args.objectLockMode : undefined),
    objectLockRetainUntilDate: afterHead?.ObjectLockRetainUntilDate || retainUntilDate,
    objectVersionId: afterHead?.VersionId,
    status,
    statusLabel: status === 'pass' ? '保存ジョブOK' : '保存完了・S3保持設定確認待ち',
    requiredActions
  };

  await mkdir(dirname(receiptPath), { recursive: true });
  if (!args.allowOverwrite && await exists(receiptPath)) {
    throw new Error(`Receipt already exists: ${receiptPath}`);
  }
  await writeJsonOnce(receiptPath, receipt, args.allowOverwrite);

  console.log(JSON.stringify({
    ok: true,
    backupFileName: manifest.backupFileName,
    destinationBackupPath: destination.objectUrl,
    receiptPath,
    backupSha256: manifest.backupSha256,
    readBackVerified,
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
