import { test } from 'node:test';
import assert from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
const scriptPath = new URL('../../scripts/runAuditLogS3WormRetention.mjs', import.meta.url);
const scheduledScriptPath = new URL('../../scripts/runScheduledAuditLogS3WormRetention.mjs', import.meta.url);
const packageJsonUrl = new URL('../../package.json', import.meta.url);

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function makeAuditExportFixture() {
  const root = await mkdtemp(join(tmpdir(), 'yakureki-audit-s3-worm-'));
  const sourceDir = join(root, 'source');
  await mkdir(sourceDir, { recursive: true });
  const latestHash = 'audit-integrity-hash-20260621';
  const auditLogFileName = 'yakureki_audit_logs_20260621_210000.json';
  const auditJsonPath = join(sourceDir, auditLogFileName);
  const receiptPath = join(root, 'audit_retention_receipt.json');
  const auditJson = JSON.stringify({
    app: 'yakureki',
    type: 'audit-log-export',
    version: 1,
    exportedAt: '2026-06-21T12:00:00.000Z',
    integrity: {
      total: 2,
      signed: 2,
      unsigned: 0,
      invalid: 0,
      isValid: true,
      latestHash
    },
    custody: {
      label: '責任者保全欄'
    },
    logs: [
      {
        logId: 'log_1',
        timestamp: '2026-06-21T11:00:00.000Z',
        actionType: 'audit_export',
        details: '監査ログJSONを書き出しました。'
      }
    ]
  }, null, 2);
  await writeFile(auditJsonPath, auditJson, 'utf8');

  return { root, auditJsonPath, receiptPath, auditLogFileName, auditJson, latestHash };
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
if (args[0] === 's3api' && args[1] === 'head-object') {
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
    VersionId: 'fake-audit-version-1',
    ETag: createHash('md5').update(content).digest('hex')
  }));
  console.log(JSON.stringify({ VersionId: 'fake-audit-version-1' }));
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

test('audit log S3 WORM retention job uploads, reads back, verifies latest hash, and writes receipt', async () => {
  const fixture = await makeAuditExportFixture();
  const fakeAwsPath = await makeFakeAwsCli(fixture.root);
  const { stdout } = await execFileAsync(process.execPath, [
    scriptPath.pathname,
    '--audit-json',
    fixture.auditJsonPath,
    '--destination',
    's3://yakureki-audit-retention/store-a/',
    '--receipt',
    fixture.receiptPath,
    '--expected-latest-hash',
    fixture.latestHash,
    '--storage-name',
    '監査ログS3 WORM',
    '--retention-days',
    '365',
    '--aws-bin',
    fakeAwsPath,
    '--object-lock-mode',
    'GOVERNANCE'
  ], {
    env: { ...process.env, FAKE_AWS_ROOT: join(fixture.root, 'fake-s3') }
  });
  const summary = JSON.parse(stdout);
  const receipt = JSON.parse(await readFile(fixture.receiptPath, 'utf8'));

  assert.strictEqual(summary.ok, true);
  assert.strictEqual(summary.auditLogFileName, fixture.auditLogFileName);
  assert.strictEqual(summary.destinationObjectPath, `s3://yakureki-audit-retention/store-a/${fixture.auditLogFileName}`);
  assert.strictEqual(summary.latestHash, fixture.latestHash);
  assert.strictEqual(summary.sourceSha256, sha256(fixture.auditJson));
  assert.strictEqual(summary.readBackVerified, true);
  assert.strictEqual(summary.latestHashMatched, true);
  assert.strictEqual(summary.immutableStorageVerified, true);
  assert.strictEqual(receipt.type, 'audit-log-s3-worm-retention-receipt');
  assert.strictEqual(receipt.statusLabel, '監査ログWORM保存OK');
  assert.strictEqual(receipt.storageName, '監査ログS3 WORM');
  assert.strictEqual(receipt.latestHash, fixture.latestHash);
  assert.strictEqual(receipt.latestHashMatched, true);
  assert.strictEqual(receipt.retentionDays, 365);
  assert.match(receipt.objectLockRetainUntilDate, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(receipt.requiredActions.some((action: string) => action.includes('保全台帳CSV')));
});

test('audit log S3 WORM retention job rejects an unexpected latest hash before upload', async () => {
  const fixture = await makeAuditExportFixture();
  const fakeAwsPath = await makeFakeAwsCli(fixture.root);

  await assert.rejects(
    execFileAsync(process.execPath, [
      scriptPath.pathname,
      '--audit-json',
      fixture.auditJsonPath,
      '--destination',
      's3://yakureki-audit-retention/store-a/',
      '--expected-latest-hash',
      'different-hash',
      '--aws-bin',
      fakeAwsPath
    ], {
      env: { ...process.env, FAKE_AWS_ROOT: join(fixture.root, 'fake-s3') }
    }),
    /Audit latest hash mismatch/
  );
});

test('scheduled audit log S3 WORM retention job picks the newest export and writes state', async () => {
  const fixture = await makeAuditExportFixture();
  const fakeAwsPath = await makeFakeAwsCli(fixture.root);
  const stateDir = join(fixture.root, 'scheduled-state');

  const { stdout } = await execFileAsync(process.execPath, [
    scheduledScriptPath.pathname,
    '--audit-dir',
    join(fixture.root, 'source'),
    '--destination',
    's3://yakureki-audit-retention/store-a/',
    '--state-dir',
    stateDir,
    '--storage-name',
    '監査ログS3 WORM',
    '--retention-days',
    '365',
    '--aws-bin',
    fakeAwsPath,
    '--object-lock-mode',
    'GOVERNANCE'
  ], {
    env: { ...process.env, FAKE_AWS_ROOT: join(fixture.root, 'fake-s3-scheduled') }
  });
  const summary = JSON.parse(stdout);
  const state = JSON.parse(await readFile(join(stateDir, 'audit_log_s3_worm_retention_schedule_state.json'), 'utf8'));

  assert.strictEqual(summary.ok, true);
  assert.strictEqual(summary.scheduled, true);
  assert.strictEqual(summary.auditLogFileName, fixture.auditLogFileName);
  assert.strictEqual(summary.latestHash, fixture.latestHash);
  assert.strictEqual(summary.sourceSha256, sha256(fixture.auditJson));
  assert.strictEqual(summary.destinationObjectPath, `s3://yakureki-audit-retention/store-a/${fixture.auditLogFileName}`);
  assert.strictEqual(state.auditLogFileName, fixture.auditLogFileName);
  assert.strictEqual(state.latestHash, fixture.latestHash);
  assert.strictEqual(state.readBackVerified, true);
  assert.strictEqual(state.latestHashMatched, true);
  assert.strictEqual(state.immutableStorageVerified, true);
  assert.ok(state.receiptPath.endsWith('.json'));
});

test('scheduled audit log S3 WORM retention job skips an already completed export', async () => {
  const fixture = await makeAuditExportFixture();
  const fakeAwsPath = await makeFakeAwsCli(fixture.root);
  const stateDir = join(fixture.root, 'skip-state');
  const args = [
    scheduledScriptPath.pathname,
    '--audit-dir',
    join(fixture.root, 'source'),
    '--destination',
    's3://yakureki-audit-retention/store-a/',
    '--state-dir',
    stateDir,
    '--aws-bin',
    fakeAwsPath
  ];

  await execFileAsync(process.execPath, args, {
    env: { ...process.env, FAKE_AWS_ROOT: join(fixture.root, 'fake-s3-skip') }
  });
  const { stdout } = await execFileAsync(process.execPath, args, {
    env: { ...process.env, FAKE_AWS_ROOT: join(fixture.root, 'fake-s3-skip') }
  });
  const summary = JSON.parse(stdout);

  assert.strictEqual(summary.ok, true);
  assert.strictEqual(summary.skipped, true);
  assert.strictEqual(summary.auditLogFileName, fixture.auditLogFileName);
  assert.match(summary.requiredActions.join(' / '), /保全台帳CSV/);
});

test('scheduled audit log S3 WORM retention job writes and posts failure notices', async () => {
  const fixture = await makeAuditExportFixture();
  const failureNoticePath = join(fixture.root, 'audit_retention_failure_notice.json');
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
        '--audit-dir',
        join(fixture.root, 'source'),
        '--destination',
        '/tmp/not-s3',
        '--state-dir',
        join(fixture.root, 'failure-state'),
        '--failure-notice',
        failureNoticePath,
        '--failure-webhook-url',
        `http://127.0.0.1:${address.port}/audit-retention-failure`,
        '--failure-webhook-bearer-env',
        'YAKUREKI_TEST_AUDIT_WEBHOOK_TOKEN'
      ], {
        env: { ...process.env, YAKUREKI_TEST_AUDIT_WEBHOOK_TOKEN: 'audit-token' }
      }),
      /Scheduled audit-log S3 WORM retention failed/
    );

    const notice = JSON.parse(await readFile(failureNoticePath, 'utf8'));
    assert.strictEqual(notice.type, 'audit-log-s3-worm-retention-failure-notice');
    assert.strictEqual(notice.statusLabel, '監査ログWORM保全失敗');
    assert.strictEqual(notice.auditLogFileName, fixture.auditLogFileName);
    assert.strictEqual(notice.latestHash, fixture.latestHash);
    assert.match(notice.errorMessage, /destination must be an s3:\/\/ URL/);
    assert.ok(notice.requiredActions.some((action: string) => action.includes('再実行')));

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].method, 'POST');
    assert.strictEqual(received[0].url, '/audit-retention-failure');
    assert.strictEqual(received[0].authorization, 'Bearer audit-token');
    assert.strictEqual(received[0].body.type, 'audit-log-s3-worm-retention-failure-notice');
    assert.strictEqual(received[0].body.latestHash, fixture.latestHash);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('audit log S3 WORM retention job is exposed as an npm script', async () => {
  const packageJson = JSON.parse(await readFile(packageJsonUrl, 'utf8'));

  assert.strictEqual(
    packageJson.scripts['audit:s3-worm-retention'],
    'node scripts/runAuditLogS3WormRetention.mjs'
  );
  assert.strictEqual(
    packageJson.scripts['audit:s3-worm-retention:scheduled'],
    'node scripts/runScheduledAuditLogS3WormRetention.mjs'
  );
});
