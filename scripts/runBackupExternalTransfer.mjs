#!/usr/bin/env node
import { constants } from 'node:fs';
import { access, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ID = 'yakureki';
const MANIFEST_VERSION = 1;
const RECEIPT_VERSION = 1;

function usage() {
  return [
    'Usage: node scripts/runBackupExternalTransfer.mjs --manifest <path> [--backup <path>] [--destination <path|file://url>] [--receipt <path>] [--immutable-verified] [--allow-overwrite]',
    '',
    'Copies a pharma-oss backup JSON to a mounted external storage path, verifies SHA-256 by reading it back, and writes a receipt JSON.',
    'For cloud destinations such as s3:// or https://, use a connector-specific job and keep this script as the local verification gate.'
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    allowOverwrite: false,
    immutableVerified: false
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
    if (arg === '--immutable-verified') {
      args.immutableVerified = true;
      continue;
    }
    if (['--manifest', '--backup', '--destination', '--receipt'].includes(arg)) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value.\n${usage()}`);
      }
      args[arg.slice(2)] = value;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }

  return args;
}

function readJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
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
      throw new Error(`${label} must be a local path or file:// URL for this job. Got: ${text}`);
    }
    return fileURLToPath(text);
  }
  return isAbsolute(text) ? text : resolve(text);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function makeReceiptFileName(backupFileName, date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${backupFileName.replace(/\.json$/i, '')}_external_transfer_receipt_${stamp}.json`;
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
  const destinationRoot = resolveLocalPath(args.destination || manifest.destinationPathOrUrl, 'destinationPathOrUrl');
  const destinationBackupPath = join(destinationRoot, manifest.backupFileName);

  if (resolve(backupPath) === resolve(destinationBackupPath)) {
    throw new Error('Destination backup path must be different from the source backup path.');
  }
  if (!args.allowOverwrite && await exists(destinationBackupPath)) {
    throw new Error(`Destination backup already exists: ${destinationBackupPath}`);
  }

  const backupBuffer = await readFile(backupPath);
  const sourceStat = await stat(backupPath);
  const sourceSha256 = sha256(backupBuffer);
  if (sourceSha256 !== manifest.backupSha256) {
    throw new Error(`Backup SHA-256 mismatch. manifest=${manifest.backupSha256} actual=${sourceSha256}`);
  }
  if (typeof manifest.backupSizeBytes === 'number' && manifest.backupSizeBytes !== sourceStat.size) {
    throw new Error(`Backup size mismatch. manifest=${manifest.backupSizeBytes} actual=${sourceStat.size}`);
  }

  await mkdir(destinationRoot, { recursive: true });
  await copyFile(backupPath, destinationBackupPath);

  const destinationBuffer = await readFile(destinationBackupPath);
  const destinationStat = await stat(destinationBackupPath);
  const readBackSha256 = sha256(destinationBuffer);
  const readBackVerified = readBackSha256 === manifest.backupSha256 && destinationStat.size === sourceStat.size;
  if (!readBackVerified) {
    throw new Error(`Destination read-back verification failed: ${destinationBackupPath}`);
  }

  const immutableStorageVerified = Boolean(args.immutableVerified);
  const requiredActions = [];
  if (manifest.requireImmutableStorage && !immutableStorageVerified) {
    requiredActions.push('保存先のWORM、オブジェクトロック、読み取り専用設定を確認し、画面の外部保存確認へ記録する');
  }
  requiredActions.push('外部保存確認をpharma-ossの監査ログに記録する');

  const receipt = {
    app: APP_ID,
    receiptVersion: RECEIPT_VERSION,
    transferredAt: new Date().toISOString(),
    manifestFileName: basename(manifestPath),
    backupFileName: manifest.backupFileName,
    sourceBackupPath: backupPath,
    destinationName: manifest.destinationName,
    destinationBackupPath,
    destinationPathOrUrl: manifest.destinationPathOrUrl,
    backupSha256: manifest.backupSha256,
    bytesCopied: destinationStat.size,
    readBackVerified,
    immutableStorageVerified,
    retentionDays: manifest.retentionDays,
    status: immutableStorageVerified || !manifest.requireImmutableStorage ? 'pass' : 'attention',
    statusLabel: immutableStorageVerified || !manifest.requireImmutableStorage
      ? '保存ジョブOK'
      : '保存完了・上書き削除不可確認待ち',
    requiredActions
  };

  const receiptPath = args.receipt
    ? resolveLocalPath(args.receipt, '--receipt')
    : join(destinationRoot, makeReceiptFileName(manifest.backupFileName));
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeJsonOnce(receiptPath, receipt, args.allowOverwrite);

  console.log(JSON.stringify({
    ok: true,
    backupFileName: manifest.backupFileName,
    destinationBackupPath,
    receiptPath,
    backupSha256: manifest.backupSha256,
    statusLabel: receipt.statusLabel,
    requiredActions: receipt.requiredActions
  }, null, 2));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
