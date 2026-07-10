import { test } from 'node:test';
import assert from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
const scriptPath = new URL('../../scripts/runBackupExternalTransfer.mjs', import.meta.url);
const scheduledScriptPath = new URL('../../scripts/runScheduledBackupExternalTransfer.mjs', import.meta.url);
const s3WormScriptPath = new URL('../../scripts/runBackupS3WormTransfer.mjs', import.meta.url);
const s3WormPreflightScriptPath = new URL('../../scripts/runS3WormPreflight.mjs', import.meta.url);
const packageJsonUrl = new URL('../../package.json', import.meta.url);

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function makeTransferFixture() {
  const root = await mkdtemp(join(tmpdir(), 'yakureki-backup-transfer-'));
  const sourceDir = join(root, 'source');
  const destinationDir = join(root, 'external-storage');
  const backupFileName = 'yakureki_backup_20260621_200000.json';
  const backupContent = JSON.stringify({
    app: 'yakureki',
    formatVersion: 1,
    encrypted: true,
    ciphertext: 'encrypted-backup-json',
    createdAt: '2026-06-21T11:00:00.000Z'
  }, null, 2);
  await mkdir(sourceDir, { recursive: true });
  const backupPath = join(sourceDir, backupFileName);
  const manifestPath = join(sourceDir, 'backup_external_transfer.json');
  const receiptPath = join(destinationDir, 'receipt.json');
  await writeFile(backupPath, backupContent, 'utf8');
  await writeFile(manifestPath, JSON.stringify({
    app: 'yakureki',
    manifestVersion: 1,
    generatedAt: '2026-06-21T11:05:00.000Z',
    backupCreatedAt: '2026-06-21T11:00:00.000Z',
    backupFileName,
    backupSha256: sha256(backupContent),
    backupSizeBytes: Buffer.byteLength(backupContent),
    encrypted: true,
    destinationName: '店舗バックアップWORM',
    destinationPathOrUrl: destinationDir,
    retentionDays: 30,
    requireEncrypted: true,
    requireReadBack: true,
    requireImmutableStorage: true,
    status: 'pass',
    statusLabel: '連携準備OK',
    requiredActions: []
  }, null, 2), 'utf8');

  return { root, sourceDir, destinationDir, backupFileName, backupPath, manifestPath, receiptPath, backupContent };
}

async function makeFakeAwsCli(root: string) {
  const fakeAwsPath = join(root, 'fake-aws.mjs');
  await writeFile(fakeAwsPath, `#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

const root = process.env.FAKE_AWS_ROOT;
if (!root) {
  console.error('FAKE_AWS_ROOT is required.');
  process.exit(2);
}

function takeOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function stripGlobalArgs(args) {
  const rest = [...args];
  while (['--profile', '--region'].includes(rest[0])) {
    rest.splice(0, 2);
  }
  return rest;
}

function s3ObjectPath(bucket, key) {
  return join(root, bucket, key);
}

function parseS3Url(value) {
  const url = new URL(value);
  return { bucket: url.hostname, key: url.pathname.replace(/^\\/+/, '') };
}

const args = stripGlobalArgs(process.argv.slice(2));
if (args[0] === 'sts' && args[1] === 'get-caller-identity') {
  console.log(JSON.stringify({
    Account: '123456789012',
    Arn: 'arn:aws:iam::123456789012:role/yakureki-worm-writer',
    UserId: 'fake-user'
  }));
} else if (args[0] === 's3api' && args[1] === 'get-bucket-versioning') {
  console.log(JSON.stringify({ Status: 'Enabled' }));
} else if (args[0] === 's3api' && args[1] === 'get-object-lock-configuration') {
  console.log(JSON.stringify({
    ObjectLockConfiguration: {
      ObjectLockEnabled: 'Enabled',
      Rule: {
        DefaultRetention: {
          Mode: 'GOVERNANCE',
          Days: 30
        }
      }
    }
  }));
} else if (args[0] === 's3api' && args[1] === 'head-object') {
  const bucket = takeOption(args, '--bucket');
  const key = takeOption(args, '--key');
  const objectPath = s3ObjectPath(bucket, key);
  try {
    const meta = JSON.parse(await readFile(objectPath + '.meta.json', 'utf8'));
    const objectStat = await stat(objectPath);
    console.log(JSON.stringify({ ContentLength: objectStat.size, ...meta }));
  } catch {
    process.exit(254);
  }
} else if (args[0] === 's3api' && args[1] === 'put-object') {
  const bucket = takeOption(args, '--bucket');
  const key = takeOption(args, '--key');
  const body = takeOption(args, '--body');
  const objectLockMode = takeOption(args, '--object-lock-mode');
  const retainUntil = takeOption(args, '--object-lock-retain-until-date');
  const objectPath = s3ObjectPath(bucket, key);
  const content = await readFile(body);
  await mkdir(dirname(objectPath), { recursive: true });
  await writeFile(objectPath, content);
  await writeFile(objectPath + '.meta.json', JSON.stringify({
    ContentLength: content.length,
    ObjectLockMode: objectLockMode,
    ObjectLockRetainUntilDate: retainUntil,
    VersionId: 'fake-version-1',
    ETag: createHash('md5').update(content).digest('hex')
  }));
  console.log(JSON.stringify({ VersionId: 'fake-version-1' }));
} else if (args[0] === 's3' && args[1] === 'cp' && args[3] === '-') {
  const { bucket, key } = parseS3Url(args[2]);
  process.stdout.write(await readFile(s3ObjectPath(bucket, key)));
} else {
  console.error('Unsupported fake aws command: ' + args.join(' '));
  process.exit(2);
}
`, 'utf8');
  await chmod(fakeAwsPath, 0o755);
  return fakeAwsPath;
}

test('backup external transfer job copies backup and writes a verified receipt', async () => {
  const fixture = await makeTransferFixture();
  const { stdout } = await execFileAsync(process.execPath, [
    scriptPath.pathname,
    '--manifest',
    fixture.manifestPath,
    '--receipt',
    fixture.receiptPath,
    '--immutable-verified'
  ]);
  const summary = JSON.parse(stdout);
  const destinationBackupPath = join(fixture.destinationDir, fixture.backupFileName);
  const copiedContent = await readFile(destinationBackupPath, 'utf8');
  const receipt = JSON.parse(await readFile(fixture.receiptPath, 'utf8'));

  assert.strictEqual(summary.ok, true);
  assert.strictEqual(copiedContent, fixture.backupContent);
  assert.strictEqual(receipt.statusLabel, '保存ジョブOK');
  assert.strictEqual(receipt.readBackVerified, true);
  assert.strictEqual(receipt.immutableStorageVerified, true);
  assert.strictEqual(receipt.backupSha256, sha256(fixture.backupContent));
  assert.ok(receipt.requiredActions.some((action: string) => action.includes('pharma-ossの監査ログ')));
});

test('backup external transfer job blocks checksum mismatches before copy', async () => {
  const fixture = await makeTransferFixture();
  const badManifestPath = join(fixture.sourceDir, 'bad_manifest.json');
  await writeFile(badManifestPath, JSON.stringify({
    app: 'yakureki',
    manifestVersion: 1,
    backupFileName: fixture.backupFileName,
    backupSha256: '0'.repeat(64),
    backupSizeBytes: Buffer.byteLength(fixture.backupContent),
    destinationName: '店舗バックアップWORM',
    destinationPathOrUrl: fixture.destinationDir,
    retentionDays: 30
  }, null, 2), 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [scriptPath.pathname, '--manifest', badManifestPath]),
    /Backup SHA-256 mismatch/
  );
  assert.strictEqual(existsSync(join(fixture.destinationDir, fixture.backupFileName)), false);
});

test('backup external transfer job refuses cloud URLs without a connector', async () => {
  const fixture = await makeTransferFixture();
  const cloudManifestPath = join(fixture.sourceDir, 'cloud_manifest.json');
  await writeFile(cloudManifestPath, JSON.stringify({
    app: 'yakureki',
    manifestVersion: 1,
    backupFileName: fixture.backupFileName,
    backupSha256: sha256(fixture.backupContent),
    backupSizeBytes: Buffer.byteLength(fixture.backupContent),
    destinationName: 'S3 WORM',
    destinationPathOrUrl: 's3://yakureki-backup/store-a/',
    retentionDays: 30
  }, null, 2), 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [scriptPath.pathname, '--manifest', cloudManifestPath]),
    /local path or file:\/\/ URL/
  );
});

test('scheduled backup external transfer job picks the latest manifest and writes state', async () => {
  const fixture = await makeTransferFixture();
  const stateDir = join(fixture.root, 'state');
  const { stdout } = await execFileAsync(process.execPath, [
    scheduledScriptPath.pathname,
    '--manifest-dir',
    fixture.sourceDir,
    '--state-dir',
    stateDir,
    '--immutable-verified'
  ]);
  const summary = JSON.parse(stdout);
  const destinationBackupPath = join(fixture.destinationDir, fixture.backupFileName);
  const state = JSON.parse(await readFile(join(stateDir, 'backup_external_transfer_schedule_state.json'), 'utf8'));

  assert.strictEqual(summary.ok, true);
  assert.strictEqual(summary.scheduled, true);
  assert.strictEqual(summary.backupFileName, fixture.backupFileName);
  assert.strictEqual(summary.destinationBackupPath, destinationBackupPath);
  assert.strictEqual(state.backupFileName, fixture.backupFileName);
  assert.strictEqual(state.backupSha256, sha256(fixture.backupContent));
  assert.strictEqual(state.connector, 'local');
  assert.ok(state.receiptPath.endsWith('.json'));
});

test('scheduled backup external transfer job skips an already completed manifest', async () => {
  const fixture = await makeTransferFixture();
  const stateDir = join(fixture.root, 'state');
  await execFileAsync(process.execPath, [
    scheduledScriptPath.pathname,
    '--manifest-dir',
    fixture.sourceDir,
    '--state-dir',
    stateDir,
    '--immutable-verified'
  ]);
  const { stdout } = await execFileAsync(process.execPath, [
    scheduledScriptPath.pathname,
    '--manifest-dir',
    fixture.sourceDir,
    '--state-dir',
    stateDir,
    '--immutable-verified'
  ]);
  const summary = JSON.parse(stdout);

  assert.strictEqual(summary.ok, true);
  assert.strictEqual(summary.skipped, true);
  assert.strictEqual(summary.backupFileName, fixture.backupFileName);
  assert.match(summary.requiredActions.join(' / '), /監査ログ/);
});

test('scheduled backup external transfer job writes a failure notice when transfer fails', async () => {
  const fixture = await makeTransferFixture();
  const badManifestPath = join(fixture.sourceDir, 'bad_scheduled_manifest.json');
  const stateDir = join(fixture.root, 'failure-state');
  const failureNoticePath = join(fixture.root, 'failure_notice.json');
  await writeFile(badManifestPath, JSON.stringify({
    app: 'yakureki',
    manifestVersion: 1,
    generatedAt: '2026-06-21T11:30:00.000Z',
    backupFileName: fixture.backupFileName,
    backupSha256: '0'.repeat(64),
    backupSizeBytes: Buffer.byteLength(fixture.backupContent),
    destinationName: '店舗バックアップWORM',
    destinationPathOrUrl: fixture.destinationDir,
    retentionDays: 30
  }, null, 2), 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [
      scheduledScriptPath.pathname,
      '--manifest-dir',
      fixture.sourceDir,
      '--state-dir',
      stateDir,
      '--failure-notice',
      failureNoticePath
    ]),
    /Scheduled local external transfer failed/
  );

  const notice = JSON.parse(await readFile(failureNoticePath, 'utf8'));
  assert.strictEqual(notice.type, 'backup-external-transfer-failure-notice');
  assert.strictEqual(notice.statusLabel, '外部保存ジョブ失敗');
  assert.strictEqual(notice.connector, 'local');
  assert.strictEqual(notice.manifestFileName, 'bad_scheduled_manifest.json');
  assert.strictEqual(notice.backupFileName, fixture.backupFileName);
  assert.match(notice.errorMessage, /Backup SHA-256 mismatch/);
  assert.ok(notice.requiredActions.some((action: string) => action.includes('再実行')));
});

test('scheduled backup external transfer job posts failure notices to webhook monitoring', async () => {
  const fixture = await makeTransferFixture();
  const badManifestPath = join(fixture.sourceDir, 'bad_webhook_manifest.json');
  await writeFile(badManifestPath, JSON.stringify({
    app: 'yakureki',
    manifestVersion: 1,
    generatedAt: '2026-06-21T11:45:00.000Z',
    backupFileName: fixture.backupFileName,
    backupSha256: '1'.repeat(64),
    backupSizeBytes: Buffer.byteLength(fixture.backupContent),
    destinationName: '店舗バックアップWORM',
    destinationPathOrUrl: fixture.destinationDir,
    retentionDays: 30
  }, null, 2), 'utf8');

  const received: Array<{ method?: string; url?: string; authorization?: string; body: any }> = [];
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      received.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
        body: JSON.parse(body)
      });
      res.writeHead(204);
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    await assert.rejects(
      execFileAsync(process.execPath, [
        scheduledScriptPath.pathname,
        '--manifest-dir',
        fixture.sourceDir,
        '--state-dir',
        join(fixture.root, 'webhook-state'),
        '--failure-webhook-url',
        `http://127.0.0.1:${address.port}/backup-failure`,
        '--failure-webhook-bearer-env',
        'YAKUREKI_TEST_WEBHOOK_TOKEN'
      ], {
        env: { ...process.env, YAKUREKI_TEST_WEBHOOK_TOKEN: 'test-token' }
      }),
      /Scheduled local external transfer failed/
    );

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].method, 'POST');
    assert.strictEqual(received[0].url, '/backup-failure');
    assert.strictEqual(received[0].authorization, 'Bearer test-token');
    assert.strictEqual(received[0].body.type, 'backup-external-transfer-failure-notice');
    assert.strictEqual(received[0].body.manifestFileName, 'bad_webhook_manifest.json');
    assert.match(received[0].body.errorMessage, /Backup SHA-256 mismatch/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('scheduled backup external transfer job routes S3 manifests to the S3 WORM connector', async () => {
  const fixture = await makeTransferFixture();
  const fakeAwsPath = await makeFakeAwsCli(fixture.root);
  const s3ManifestPath = join(fixture.sourceDir, 's3_manifest.json');
  const stateDir = join(fixture.root, 's3-state');
  await writeFile(s3ManifestPath, JSON.stringify({
    app: 'yakureki',
    manifestVersion: 1,
    generatedAt: '2026-06-21T11:10:00.000Z',
    backupFileName: fixture.backupFileName,
    backupSha256: sha256(fixture.backupContent),
    backupSizeBytes: Buffer.byteLength(fixture.backupContent),
    destinationName: 'S3 WORM',
    destinationPathOrUrl: 's3://yakureki-backup/store-a/',
    retentionDays: 30,
    requireImmutableStorage: true
  }, null, 2), 'utf8');

  const { stdout } = await execFileAsync(process.execPath, [
    scheduledScriptPath.pathname,
    '--manifest-dir',
    fixture.sourceDir,
    '--state-dir',
    stateDir,
    '--aws-bin',
    fakeAwsPath,
    '--object-lock-mode',
    'GOVERNANCE'
  ], {
    env: { ...process.env, FAKE_AWS_ROOT: join(fixture.root, 'fake-s3-scheduled') }
  });
  const summary = JSON.parse(stdout);
  const state = JSON.parse(await readFile(join(stateDir, 'backup_external_transfer_schedule_state.json'), 'utf8'));

  assert.strictEqual(summary.ok, true);
  assert.strictEqual(summary.scheduled, true);
  assert.strictEqual(summary.connector, 's3-worm');
  assert.strictEqual(summary.destinationBackupPath, `s3://yakureki-backup/store-a/${fixture.backupFileName}`);
  assert.strictEqual(state.connector, 's3-worm');
  assert.strictEqual(state.backupFileName, fixture.backupFileName);
  assert.strictEqual(state.destinationBackupPath, `s3://yakureki-backup/store-a/${fixture.backupFileName}`);
  assert.ok(state.receiptPath.endsWith('.json'));
});

test('S3 WORM transfer job uploads with object lock, verifies read-back, and writes a receipt', async () => {
  const fixture = await makeTransferFixture();
  const fakeAwsPath = await makeFakeAwsCli(fixture.root);
  const s3ManifestPath = join(fixture.sourceDir, 's3_manifest.json');
  const receiptPath = join(fixture.root, 's3_receipt.json');
  await writeFile(s3ManifestPath, JSON.stringify({
    app: 'yakureki',
    manifestVersion: 1,
    backupFileName: fixture.backupFileName,
    backupSha256: sha256(fixture.backupContent),
    backupSizeBytes: Buffer.byteLength(fixture.backupContent),
    destinationName: 'S3 WORM',
    destinationPathOrUrl: 's3://yakureki-backup/store-a/',
    retentionDays: 30,
    requireImmutableStorage: true
  }, null, 2), 'utf8');

  const { stdout } = await execFileAsync(process.execPath, [
    s3WormScriptPath.pathname,
    '--manifest',
    s3ManifestPath,
    '--receipt',
    receiptPath,
    '--aws-bin',
    fakeAwsPath,
    '--object-lock-mode',
    'GOVERNANCE'
  ], {
    env: { ...process.env, FAKE_AWS_ROOT: join(fixture.root, 'fake-s3') }
  });
  const summary = JSON.parse(stdout);
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));

  assert.strictEqual(summary.ok, true);
  assert.strictEqual(summary.destinationBackupPath, `s3://yakureki-backup/store-a/${fixture.backupFileName}`);
  assert.strictEqual(summary.readBackVerified, true);
  assert.strictEqual(summary.immutableStorageVerified, true);
  assert.strictEqual(receipt.connector, 'aws-cli-s3-worm');
  assert.strictEqual(receipt.statusLabel, '保存ジョブOK');
  assert.strictEqual(receipt.readBackVerified, true);
  assert.strictEqual(receipt.immutableStorageVerified, true);
  assert.strictEqual(receipt.backupSha256, sha256(fixture.backupContent));
  assert.strictEqual(receipt.destinationBackupPath, `s3://yakureki-backup/store-a/${fixture.backupFileName}`);
  assert.match(receipt.objectLockRetainUntilDate, /^\d{4}-\d{2}-\d{2}T/);
});

test('S3 WORM transfer job refuses non-S3 destinations', async () => {
  const fixture = await makeTransferFixture();

  await assert.rejects(
    execFileAsync(process.execPath, [s3WormScriptPath.pathname, '--manifest', fixture.manifestPath]),
    /destination must be an s3:\/\/ URL/
  );
});

test('S3 WORM preflight verifies caller, bucket lock, write probe, and receipt', async () => {
  const fixture = await makeTransferFixture();
  const fakeAwsPath = await makeFakeAwsCli(fixture.root);
  const receiptPath = join(fixture.root, 's3_preflight_receipt.json');

  const { stdout } = await execFileAsync(process.execPath, [
    s3WormPreflightScriptPath.pathname,
    '--destination',
    's3://yakureki-backup/store-a/',
    '--receipt',
    receiptPath,
    '--aws-bin',
    fakeAwsPath,
    '--retention-days',
    '7'
  ], {
    env: { ...process.env, FAKE_AWS_ROOT: join(fixture.root, 'fake-s3') }
  });
  const summary = JSON.parse(stdout);
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));

  assert.strictEqual(summary.ok, true);
  assert.strictEqual(summary.statusLabel, 'S3 WORM事前確認OK');
  assert.strictEqual(summary.readBackVerified, true);
  assert.strictEqual(summary.immutableStorageVerified, true);
  assert.strictEqual(receipt.type, 's3-worm-preflight-receipt');
  assert.strictEqual(receipt.connector, 'aws-cli-s3-worm');
  assert.strictEqual(receipt.callerArn, 'arn:aws:iam::123456789012:role/yakureki-worm-writer');
  assert.strictEqual(receipt.bucketVersioningStatus, 'Enabled');
  assert.strictEqual(receipt.objectLockEnabled, 'Enabled');
  assert.strictEqual(receipt.readBackVerified, true);
  assert.strictEqual(receipt.immutableStorageVerified, true);
  assert.match(receipt.probeObjectUrl, /^s3:\/\/yakureki-backup\/store-a\/\.yakureki-preflight\//);
  assert.match(receipt.objectLockRetainUntilDate, /^\d{4}-\d{2}-\d{2}T/);
});

test('S3 WORM preflight refuses non-S3 destinations', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      s3WormPreflightScriptPath.pathname,
      '--destination',
      '/tmp/not-s3'
    ]),
    /destination must be an s3:\/\/ URL/
  );
});

test('backup external transfer job is exposed as an npm script', async () => {
  const packageJson = JSON.parse(await readFile(packageJsonUrl, 'utf8'));
  assert.strictEqual(
    packageJson.scripts['backup:external-transfer'],
    'node scripts/runBackupExternalTransfer.mjs'
  );
  assert.strictEqual(
    packageJson.scripts['backup:external-transfer:scheduled'],
    'node scripts/runScheduledBackupExternalTransfer.mjs'
  );
  assert.strictEqual(
    packageJson.scripts['backup:s3-worm-transfer'],
    'node scripts/runBackupS3WormTransfer.mjs'
  );
  assert.strictEqual(
    packageJson.scripts['s3-worm:preflight'],
    'node scripts/runS3WormPreflight.mjs'
  );
});
