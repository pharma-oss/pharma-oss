import { test } from 'node:test';
import assert from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
const scriptPath = new URL('../../scripts/runScheduledOpsDrill.mjs', import.meta.url);
const packageJsonUrl = new URL('../../package.json', import.meta.url);

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function makeDrillFixture() {
  const root = await mkdtemp(join(tmpdir(), 'yakureki-scheduled-ops-drill-'));
  const evidenceDir = join(root, 'evidence');
  const browserProfilePath = join(root, 'chrome-profile');
  await mkdir(evidenceDir, { recursive: true });
  await mkdir(browserProfilePath, { recursive: true });

  const backupReceiptPath = join(evidenceDir, 'backup_transfer_receipt.json');
  const auditReceiptPath = join(evidenceDir, 'audit_retention_receipt.json');
  const browserExportReceiptPath = join(evidenceDir, 'browser_export_receipt.json');
  const s3PreflightReceiptPath = join(evidenceDir, 's3_preflight_receipt.json');
  const backupStatePath = join(evidenceDir, 'backup_external_transfer_schedule_state.json');
  const auditStatePath = join(evidenceDir, 'audit_log_s3_worm_retention_schedule_state.json');
  const schedulerEvidencePath = join(evidenceDir, 'yakureki-nightly.launchd.plist');
  const receiptPath = join(evidenceDir, 'scheduled_ops_drill_receipt.json');
  const now = new Date().toISOString();
  const backupSha = sha256('encrypted backup body');
  const auditSha = sha256('audit log export body');

  await writeFile(backupReceiptPath, JSON.stringify({
    app: 'yakureki',
    receiptVersion: 1,
    type: 'backup-external-transfer-receipt',
    status: 'pass'
  }, null, 2), 'utf8');
  await writeFile(auditReceiptPath, JSON.stringify({
    app: 'yakureki',
    receiptVersion: 1,
    type: 'audit-log-s3-worm-retention-receipt',
    status: 'pass'
  }, null, 2), 'utf8');
  await writeFile(backupStatePath, JSON.stringify({
    app: 'yakureki',
    stateVersion: 1,
    updatedAt: now,
    connector: 's3-worm',
    lastManifestFileName: 'yakureki_backup_external_transfer.json',
    backupFileName: 'yakureki_backup_20260621_210000.json',
    backupSha256: backupSha,
    destinationName: 'S3 WORM',
    destinationPathOrUrl: 's3://yakureki-backup/store-a/',
    destinationBackupPath: 's3://yakureki-backup/store-a/yakureki_backup_20260621_210000.json',
    receiptPath: backupReceiptPath,
    statusLabel: '保存ジョブOK'
  }, null, 2), 'utf8');
  await writeFile(auditStatePath, JSON.stringify({
    app: 'yakureki',
    stateVersion: 1,
    updatedAt: now,
    auditLogFileName: 'yakureki_audit_log_20260621.json',
    latestHash: 'audit-latest-hash',
    sourceSha256: auditSha,
    destinationPathOrUrl: 's3://yakureki-audit/store-a/',
    destinationObjectPath: 's3://yakureki-audit/store-a/yakureki_audit_log_20260621.json',
    receiptPath: auditReceiptPath,
    statusLabel: '監査ログWORM保存OK'
  }, null, 2), 'utf8');
  await writeFile(browserExportReceiptPath, JSON.stringify({
    app: 'yakureki',
    receiptVersion: 1,
    type: 'browser-backup-export-receipt',
    exportedAt: now,
    backupFileName: 'yakureki_backup_20260621_210000.json',
    backupSha256: backupSha,
    encrypted: true,
    status: 'pass',
    statusLabel: '暗号化バックアップ書き出しOK'
  }, null, 2), 'utf8');
  await writeFile(s3PreflightReceiptPath, JSON.stringify({
    app: 'yakureki',
    receiptVersion: 1,
    type: 's3-worm-preflight-receipt',
    checkedAt: now,
    destinationPathOrUrl: 's3://yakureki-backup/store-a/',
    readBackVerified: true,
    immutableStorageVerified: true,
    status: 'pass',
    statusLabel: 'S3 WORM事前確認OK'
  }, null, 2), 'utf8');
  await writeFile(schedulerEvidencePath, '<plist><string>yakureki-nightly</string></plist>\n', 'utf8');

  return {
    root,
    backupStatePath,
    auditStatePath,
    browserExportReceiptPath,
    s3PreflightReceiptPath,
    browserProfilePath,
    schedulerEvidencePath,
    receiptPath
  };
}

test('scheduled ops drill posts a no-patient-data webhook and writes a receipt', async () => {
  const fixture = await makeDrillFixture();
  const received: Array<{ authorization?: string; body: any }> = [];
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      received.push({
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

    const { stdout } = await execFileAsync(process.execPath, [
      scriptPath.pathname,
      '--scheduler-name',
      'yakureki-nightly',
      '--environment-name',
      'store-a',
      '--operator',
      'ops-checker',
      '--backup-state',
      fixture.backupStatePath,
      '--audit-state',
      fixture.auditStatePath,
      '--browser-export-receipt',
      fixture.browserExportReceiptPath,
      '--s3-preflight-receipt',
      fixture.s3PreflightReceiptPath,
      '--browser-profile-path',
      fixture.browserProfilePath,
      '--scheduler-evidence',
      fixture.schedulerEvidencePath,
      '--receipt',
      fixture.receiptPath,
      '--webhook-url',
      `http://127.0.0.1:${address.port}/ops-drill`,
      '--webhook-bearer-env',
      'YAKUREKI_TEST_OPS_WEBHOOK_TOKEN',
      '--require-backup-state',
      '--require-audit-state',
      '--require-browser-profile',
      '--require-s3-preflight',
      '--require-scheduler-evidence'
    ], {
      env: { ...process.env, YAKUREKI_TEST_OPS_WEBHOOK_TOKEN: 'drill-token' }
    });
    const summary = JSON.parse(stdout);
    const receipt = JSON.parse(await readFile(fixture.receiptPath, 'utf8'));

    assert.strictEqual(summary.ok, true);
    assert.strictEqual(summary.webhookDelivered, true);
    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].authorization, 'Bearer drill-token');
    assert.strictEqual(received[0].body.type, 'scheduled-ops-webhook-drill');
    assert.strictEqual(received[0].body.schedulerName, 'yakureki-nightly');
    assert.strictEqual(received[0].body.backup.backupFileName, 'yakureki_backup_20260621_210000.json');
    assert.strictEqual(received[0].body.auditLog.auditLogFileName, 'yakureki_audit_log_20260621.json');
    assert.strictEqual(received[0].body.schedulerEvidence[0].fileName, 'yakureki-nightly.launchd.plist');
    assert.strictEqual(received[0].body.backup.statePath, undefined);
    assert.strictEqual(received[0].body.auditLog.statePath, undefined);
    assert.match(received[0].body.note, /No patient/);
    assert.strictEqual(receipt.type, 'scheduled-ops-drill-receipt');
    assert.strictEqual(receipt.webhook.delivered, true);
    assert.strictEqual(receipt.backupState.backupFileName, 'yakureki_backup_20260621_210000.json');
    assert.strictEqual(receipt.auditState.latestHash, 'audit-latest-hash');
    assert.ok(receipt.checks.every((check: { status: string }) => check.status === 'pass'));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('scheduled ops drill enforces required evidence flags', async () => {
  const fixture = await makeDrillFixture();

  await assert.rejects(
    execFileAsync(process.execPath, [
      scriptPath.pathname,
      '--scheduler-name',
      'yakureki-nightly',
      '--receipt',
      fixture.receiptPath,
      '--webhook-url',
      'http://127.0.0.1:9/ops-drill',
      '--require-backup-state'
    ]),
    /Backup schedule state is required/
  );
});

test('scheduled ops drill rejects stale schedule state when max age is set', async () => {
  const fixture = await makeDrillFixture();
  await writeFile(fixture.backupStatePath, JSON.stringify({
    app: 'yakureki',
    stateVersion: 1,
    updatedAt: '2020-01-01T00:00:00.000Z',
    connector: 'local',
    lastManifestFileName: 'old_manifest.json',
    backupFileName: 'yakureki_backup_20200101_000000.json',
    backupSha256: '0'.repeat(64),
    receiptPath: join(fixture.root, 'old_receipt.json')
  }, null, 2), 'utf8');
  await writeFile(join(fixture.root, 'old_receipt.json'), '{}\n', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [
      scriptPath.pathname,
      '--scheduler-name',
      'yakureki-nightly',
      '--backup-state',
      fixture.backupStatePath,
      '--receipt',
      fixture.receiptPath,
      '--webhook-url',
      'http://127.0.0.1:9/ops-drill',
      '--max-age-hours',
      '24'
    ]),
    /Backup schedule state is older than 24 hours/
  );
});

test('scheduled ops drill is exposed as an npm script', async () => {
  const packageJson = JSON.parse(await readFile(packageJsonUrl, 'utf8'));
  assert.strictEqual(
    packageJson.scripts['ops:schedule-drill'],
    'node scripts/runScheduledOpsDrill.mjs'
  );
});
