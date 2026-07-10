#!/usr/bin/env node
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

const APP_ID = 'yakureki';
const RECEIPT_VERSION = 1;
const DEFAULT_OBJECT_LOCK_MODE = 'GOVERNANCE';
const DEFAULT_RETENTION_DAYS = 7;

function usage() {
  return [
    'Usage: node scripts/runS3WormPreflight.mjs --destination s3://bucket/prefix/ [--receipt <path>] [--storage-name <name>] [--retention-days <days>] [--probe-key <key>] [--aws-bin <aws>] [--profile <name>] [--region <name>] [--object-lock-mode GOVERNANCE|COMPLIANCE] [--allow-overwrite]',
    '',
    'Runs a no-patient-data S3 WORM preflight: AWS caller check, bucket versioning, Object Lock configuration, locked probe upload, read-back SHA-256 verification, and receipt JSON output.',
    'Use this before enabling backup or audit-log WORM retention jobs in a production pharmacy environment.'
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    allowOverwrite: false,
    awsBin: 'aws',
    objectLockMode: DEFAULT_OBJECT_LOCK_MODE,
    retentionDays: DEFAULT_RETENTION_DAYS,
    storageName: 'S3 WORM'
  };
  const valueArgs = new Set([
    '--destination',
    '--receipt',
    '--storage-name',
    '--retention-days',
    '--probe-key',
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
  return isAbsolute(text) ? text : resolve(text);
}

function readJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function parseJsonOutput(stdout, label) {
  const text = Buffer.isBuffer(stdout) ? stdout.toString('utf8') : stdout;
  if (!text || text.trim() === '') return {};
  return readJson(text, label);
}

function parseS3Destination(destination) {
  const text = assertString(destination, 'destination');
  if (!text.startsWith('s3://')) {
    throw new Error(`destination must be an s3:// URL for S3 WORM preflight. Got: ${text}`);
  }
  const url = new URL(text);
  if (url.protocol !== 's3:') {
    throw new Error(`destination must be an s3:// URL for S3 WORM preflight. Got: ${text}`);
  }
  const bucket = assertString(url.hostname, 'S3 bucket');
  const prefix = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  return {
    bucket,
    prefix,
    rootUrl: prefix ? `s3://${bucket}/${prefix}/` : `s3://${bucket}/`
  };
}

function makeProbeKey(prefix, date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const key = `.yakureki-preflight/yakureki_s3_worm_preflight_${stamp}.json`;
  return prefix ? `${prefix}/${key}` : key;
}

function makeReceiptFileName(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `yakureki_s3_worm_preflight_receipt_${stamp}.json`;
}

function makeRetainUntilDate(retentionDays, date = new Date()) {
  return new Date(date.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
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

function objectLockIsVerified(head, now = new Date()) {
  if (!head || typeof head !== 'object') return false;
  if (head.ObjectLockLegalHoldStatus === 'ON') return true;
  if (!['GOVERNANCE', 'COMPLIANCE'].includes(head.ObjectLockMode)) return false;
  const retainUntil = Date.parse(head.ObjectLockRetainUntilDate || '');
  return Number.isFinite(retainUntil) && retainUntil > now.getTime();
}

function requireBucketVersioning(versioning) {
  const status = typeof versioning?.Status === 'string' ? versioning.Status : '';
  if (status !== 'Enabled') {
    throw new Error(`S3 bucket versioning must be Enabled for Object Lock. Current Status: ${status || 'not configured'}`);
  }
  return status;
}

function requireObjectLockConfiguration(configuration) {
  const objectLockConfig = configuration?.ObjectLockConfiguration || configuration;
  const enabled = objectLockConfig?.ObjectLockEnabled;
  if (enabled !== 'Enabled') {
    throw new Error(`S3 Object Lock must be Enabled. Current ObjectLockEnabled: ${enabled || 'not configured'}`);
  }
  return objectLockConfig;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.destination) {
    throw new Error(`--destination is required.\n${usage()}`);
  }

  const destination = parseS3Destination(args.destination);
  const probeKey = args.probeKey ? assertString(args.probeKey, '--probe-key').replace(/^\/+/, '') : makeProbeKey(destination.prefix);
  const probeObjectUrl = `s3://${destination.bucket}/${probeKey}`;
  const retainUntilDate = makeRetainUntilDate(args.retentionDays);
  const receiptPath = args.receipt
    ? resolveLocalPath(args.receipt, '--receipt')
    : resolve(makeReceiptFileName());

  const { stdout: callerStdout } = await runAws(args, ['sts', 'get-caller-identity']);
  const caller = parseJsonOutput(callerStdout, 'AWS caller identity output');

  const { stdout: versioningStdout } = await runAws(args, [
    's3api',
    'get-bucket-versioning',
    '--bucket',
    destination.bucket
  ]);
  const bucketVersioning = parseJsonOutput(versioningStdout, 'S3 bucket versioning output');
  const bucketVersioningStatus = requireBucketVersioning(bucketVersioning);

  const { stdout: objectLockStdout } = await runAws(args, [
    's3api',
    'get-object-lock-configuration',
    '--bucket',
    destination.bucket
  ]);
  const objectLockConfiguration = requireObjectLockConfiguration(
    parseJsonOutput(objectLockStdout, 'S3 Object Lock configuration output')
  );

  const tempDir = await mkdtemp(join(tmpdir(), 'yakureki-s3-worm-preflight-'));
  const probePath = join(tempDir, 'probe.json');
  const probePayload = {
    app: APP_ID,
    type: 's3-worm-preflight-probe',
    generatedAt: new Date().toISOString(),
    destinationPathOrUrl: destination.rootUrl,
    storageName: args.storageName,
    note: 'No patient, pharmacy, staff, prescription, or audit-log data is included.'
  };

  try {
    const probeBuffer = Buffer.from(`${JSON.stringify(probePayload, null, 2)}\n`, 'utf8');
    const probeSha256 = sha256(probeBuffer);
    await writeFile(probePath, probeBuffer);

    await runAws(args, [
      's3api',
      'put-object',
      '--bucket',
      destination.bucket,
      '--key',
      probeKey,
      '--body',
      probePath,
      '--object-lock-mode',
      args.objectLockMode,
      '--object-lock-retain-until-date',
      retainUntilDate
    ]);

    const { stdout: headStdout } = await runAws(args, [
      's3api',
      'head-object',
      '--bucket',
      destination.bucket,
      '--key',
      probeKey
    ]);
    const head = parseJsonOutput(headStdout, 'S3 head-object output');
    const immutableStorageVerified = objectLockIsVerified(head);
    if (!immutableStorageVerified) {
      throw new Error('S3 probe object was uploaded, but Object Lock retention was not verified by head-object.');
    }

    const { stdout: readBackBuffer } = await runAws(
      args,
      ['s3', 'cp', probeObjectUrl, '-'],
      { encoding: 'buffer', maxBuffer: 1024 * 1024 }
    );
    const readBackSha256 = sha256(readBackBuffer);
    const readBackVerified = readBackSha256 === probeSha256 && readBackBuffer.length === probeBuffer.length;
    if (!readBackVerified) {
      throw new Error(`S3 preflight read-back verification failed: ${probeObjectUrl}`);
    }

    const receipt = {
      app: APP_ID,
      receiptVersion: RECEIPT_VERSION,
      type: 's3-worm-preflight-receipt',
      checkedAt: new Date().toISOString(),
      connector: 'aws-cli-s3-worm',
      storageName: args.storageName,
      destinationPathOrUrl: destination.rootUrl,
      bucket: destination.bucket,
      prefix: destination.prefix,
      callerAccount: caller.Account,
      callerArn: caller.Arn,
      callerUserId: caller.UserId,
      bucketVersioningStatus,
      objectLockEnabled: objectLockConfiguration.ObjectLockEnabled,
      objectLockDefaultRetention: objectLockConfiguration.Rule?.DefaultRetention,
      probeObjectUrl,
      probeSha256,
      probeSizeBytes: probeBuffer.length,
      readBackVerified,
      immutableStorageVerified,
      objectLockMode: head.ObjectLockMode || args.objectLockMode,
      objectLockRetainUntilDate: head.ObjectLockRetainUntilDate || retainUntilDate,
      objectVersionId: head.VersionId,
      status: 'pass',
      statusLabel: 'S3 WORM事前確認OK',
      requiredActions: [
        'この受領書JSONを店舗の導入・監査資料として保管する',
        '同じAWS profile/region/destinationでバックアップまたは監査ログWORMジョブを実行する'
      ]
    };

    await mkdir(dirname(receiptPath), { recursive: true });
    if (!args.allowOverwrite && await exists(receiptPath)) {
      throw new Error(`Receipt already exists: ${receiptPath}`);
    }
    await writeJsonOnce(receiptPath, receipt, args.allowOverwrite);

    console.log(JSON.stringify({
      ok: true,
      destinationPathOrUrl: receipt.destinationPathOrUrl,
      callerArn: receipt.callerArn,
      probeObjectUrl: receipt.probeObjectUrl,
      receiptPath,
      readBackVerified,
      immutableStorageVerified,
      statusLabel: receipt.statusLabel,
      requiredActions: receipt.requiredActions
    }, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
