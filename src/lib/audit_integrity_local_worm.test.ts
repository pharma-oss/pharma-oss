import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LOCAL_WORM_CONNECTOR_ID,
  LOCAL_WORM_MANIFEST_FILE_NAME,
  LOCAL_WORM_RECEIPT_TYPE,
  archiveAuditLogToLocalWorm,
  verifyLocalWormArchiveDirectory
} from './audit_integrity_local_worm.ts';

const execFileAsync = promisify(execFile);
const scriptPath = new URL('../../scripts/runAuditLogLocalWormRetention.mjs', import.meta.url);
const scheduledScriptPath = new URL('../../scripts/runScheduledAuditLogLocalWormRetention.mjs', import.meta.url);
const packageJsonUrl = new URL('../../package.json', import.meta.url);

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function makeAuditExportFixture(suffix = '20261122_100000', latestHash = 'audit-integrity-hash-20261122') {
  const root = await mkdtemp(join(tmpdir(), 'yakureki-audit-local-worm-'));
  const sourceDir = join(root, 'source');
  const wormDir = join(root, 'nas-worm');
  await mkdir(sourceDir, { recursive: true });
  const auditLogFileName = `yakureki_audit_logs_${suffix}.json`;
  const auditJsonPath = join(sourceDir, auditLogFileName);
  const receiptPath = join(root, `receipt_${suffix}.json`);
  const auditJson = JSON.stringify({
    app: 'yakureki',
    type: 'audit-log-export',
    version: 1,
    exportedAt: '2026-11-22T01:00:00.000Z',
    integrity: {
      total: 1,
      signed: 1,
      unsigned: 0,
      invalid: 0,
      isValid: true,
      latestHash
    },
    logs: [
      {
        logId: `log_${suffix}`,
        timestamp: '2026-11-22T00:55:00.000Z',
        actionType: 'audit_export',
        details: '監査ログJSONを書き出しました。'
      }
    ]
  }, null, 2);
  await writeFile(auditJsonPath, auditJson, 'utf8');
  return { root, sourceDir, wormDir, auditJsonPath, receiptPath, auditLogFileName, auditJson, latestHash };
}

async function cleanupDir(dir: string) {
  // chmod 0444 されたファイルがあっても確実に削除できるよう権限を戻してから消す
  try {
    const wormDir = join(dir, 'nas-worm');
    await chmod(wormDir, 0o755).catch(() => {});
  } catch {}
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

describe('H-1: local/NAS append-only WORM audit-log retention connector', () => {
  it('archives with wx exclusive create, chmod 0444 read-only lock, SHA-256 read-back verification, chained manifest, and receipt', async () => {
    const fixture = await makeAuditExportFixture();
    try {
      const result = await archiveAuditLogToLocalWorm({
        auditJsonPath: fixture.auditJsonPath,
        destinationDir: fixture.wormDir,
        receiptPath: fixture.receiptPath,
        expectedLatestHash: fixture.latestHash,
        storageName: '院内NAS WORM共有',
        retentionDays: 2555,
        lockReadOnly: true,
        immutableVerified: false
      });

      assert.equal(result.ok, true);
      assert.equal(result.connector, LOCAL_WORM_CONNECTOR_ID);
      assert.equal(result.sourceSha256, sha256(fixture.auditJson));
      assert.equal(result.readBackVerified, true);
      assert.equal(result.latestHashMatched, true);
      assert.equal(result.readOnlyLockApplied, true);
      assert.equal(result.immutableStorageVerified, false);
      // NAS-level WORM未確認時は正直に attention を返す（金科玉条 第四条）
      assert.equal(result.status, 'attention');
      assert.match(result.statusLabel, /NAS側WORM設定確認待ち/);

      const archivedStat = await stat(result.destinationObjectPath);
      assert.equal(archivedStat.mode & 0o222, 0, 'archived file must be read-only (0444)');

      const receipt = JSON.parse(await readFile(fixture.receiptPath, 'utf8'));
      assert.equal(receipt.type, LOCAL_WORM_RECEIPT_TYPE);
      assert.equal(receipt.manifestEntryHash, result.manifestEntryHash);
      assert.equal(receipt.sourceSha256, sha256(fixture.auditJson));

      const verified = await verifyLocalWormArchiveDirectory(fixture.wormDir);
      assert.equal(verified.isValid, true);
      assert.equal(verified.entryCount, 1);
      assert.equal(verified.latestManifestHash, result.manifestEntryHash);

      // Append-only refusal (EEXIST) when attempting to overwrite the same filename
      await assert.rejects(
        archiveAuditLogToLocalWorm({
          auditJsonPath: fixture.auditJsonPath,
          destinationDir: fixture.wormDir,
          receiptPath: join(fixture.root, 'receipt_second.json')
        }),
        /append-only refusal, EEXIST/
      );

      // Second distinct archive chains previousManifestHash cleanly and marks pass with immutableVerified
      const secondPath = join(fixture.sourceDir, 'yakureki_audit_logs_20261123_100000.json');
      const secondJson = fixture.auditJson.replace(fixture.latestHash, 'audit-integrity-hash-20261123');
      await writeFile(secondPath, secondJson, 'utf8');
      const secondResult = await archiveAuditLogToLocalWorm({
        auditJsonPath: secondPath,
        destinationDir: fixture.wormDir,
        receiptPath: join(fixture.root, 'receipt_2.json'),
        immutableVerified: true
      });
      assert.equal(secondResult.status, 'pass');
      assert.equal(secondResult.receipt?.previousManifestHash, result.manifestEntryHash);

      const verifiedTwo = await verifyLocalWormArchiveDirectory(fixture.wormDir);
      assert.equal(verifiedTwo.isValid, true);
      assert.equal(verifiedTwo.entryCount, 2);

      // Tampering with an archived file on disk MUST be detected by verifyLocalWormArchiveDirectory
      await chmod(result.destinationObjectPath, 0o644);
      await writeFile(result.destinationObjectPath, `${fixture.auditJson}\n// tampered`, 'utf8');
      const tamperedCheck = await verifyLocalWormArchiveDirectory(fixture.wormDir);
      assert.equal(tamperedCheck.isValid, false);
      assert.ok(tamperedCheck.errors.some((e) => e.includes('SHA-256 mismatch')));
    } finally {
      await cleanupDir(fixture.root);
    }
  });

  it('rejects non-local destinations and mismatched expectedLatestHash before writing any file', async () => {
    const fixture = await makeAuditExportFixture();
    try {
      await assert.rejects(
        archiveAuditLogToLocalWorm({
          auditJsonPath: fixture.auditJsonPath,
          destinationDir: 's3://bucket/prefix/'
        }),
        /must be a local\/NAS directory path/
      );

      await assert.rejects(
        archiveAuditLogToLocalWorm({
          auditJsonPath: fixture.auditJsonPath,
          destinationDir: fixture.wormDir,
          expectedLatestHash: 'wrong-hash'
        }),
        /Audit latest hash mismatch/
      );

      const verification = await verifyLocalWormArchiveDirectory(fixture.wormDir);
      assert.equal(verification.entryCount, 0);
    } finally {
      await cleanupDir(fixture.root);
    }
  });

  it('runs local WORM CLI (--dry-run, archive, --verify-only) and scheduled CLI (run, skip, failure webhook)', async () => {
    const fixture = await makeAuditExportFixture();
    try {
      // 1. CLI --dry-run
      const dryRunOut = await execFileAsync(process.execPath, [
        scriptPath.pathname,
        '--audit-json', fixture.auditJsonPath,
        '--destination', fixture.wormDir,
        '--dry-run'
      ]);
      const drySummary = JSON.parse(dryRunOut.stdout);
      assert.equal(drySummary.ok, true);
      assert.equal(drySummary.dryRun, true);

      // 2. Scheduled CLI archives newest export and records state
      const stateDir = join(fixture.root, 'state');
      const schedOut = await execFileAsync(process.execPath, [
        scheduledScriptPath.pathname,
        '--audit-dir', fixture.sourceDir,
        '--destination', fixture.wormDir,
        '--state-dir', stateDir,
        '--immutable-verified'
      ]);
      const schedSummary = JSON.parse(schedOut.stdout);
      assert.equal(schedSummary.ok, true);
      assert.equal(schedSummary.scheduled, true);
      assert.equal(schedSummary.statusLabel, '監査ログローカル/NAS WORM保存OK');

      // 3. Scheduled CLI skips duplicate export cleanly
      const skipOut = await execFileAsync(process.execPath, [
        scheduledScriptPath.pathname,
        '--audit-dir', fixture.sourceDir,
        '--destination', fixture.wormDir,
        '--state-dir', stateDir
      ]);
      const skipSummary = JSON.parse(skipOut.stdout);
      assert.equal(skipSummary.ok, true);
      assert.equal(skipSummary.skipped, true);

      // 4. CLI --verify-only confirms manifest + archived disk file integrity
      const verifyOut = await execFileAsync(process.execPath, [
        scriptPath.pathname,
        '--verify-only',
        '--destination', fixture.wormDir
      ]);
      const verifySummary = JSON.parse(verifyOut.stdout);
      assert.equal(verifySummary.ok, true);
      assert.equal(verifySummary.isValid, true);
      assert.equal(verifySummary.entryCount, 1);
      assert.ok(verifySummary.manifestPath.endsWith(LOCAL_WORM_MANIFEST_FILE_NAME));

      // 5. Scheduled CLI failure writes failure notice and posts webhook
      const failureNoticePath = join(fixture.root, 'local_worm_failure.json');
      const received: Array<{ authorization?: string; body: Record<string, unknown> }> = [];
      const server = createServer((req, res) => {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          received.push({ authorization: req.headers.authorization, body: JSON.parse(body) });
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
            '--audit-dir', fixture.sourceDir,
            '--destination', 'https://not-a-local-path.example.com/worm',
            '--state-dir', join(fixture.root, 'fail-state'),
            '--failure-notice', failureNoticePath,
            '--failure-webhook-url', `http://127.0.0.1:${address.port}/local-worm-fail`,
            '--failure-webhook-bearer-env', 'YAKUREKI_TEST_LOCAL_WORM_TOKEN'
          ], {
            env: { ...process.env, YAKUREKI_TEST_LOCAL_WORM_TOKEN: 'local-worm-secret' }
          }),
          /Scheduled audit-log local\/NAS WORM retention failed/
        );

        const notice = JSON.parse(await readFile(failureNoticePath, 'utf8'));
        assert.equal(notice.type, 'audit-log-local-worm-retention-failure-notice');
        assert.equal(notice.statusLabel, '監査ログローカル/NAS WORM保全失敗');
        assert.equal(received.length, 1);
        assert.equal(received[0].authorization, 'Bearer local-worm-secret');
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
      }
    } finally {
      await cleanupDir(fixture.root);
    }
  });

  it('exposes local WORM retention scripts in package.json', async () => {
    const pkg = JSON.parse(await readFile(packageJsonUrl, 'utf8'));
    assert.equal(pkg.scripts['audit:local-worm-retention'], 'node scripts/runAuditLogLocalWormRetention.mjs');
    assert.equal(pkg.scripts['audit:local-worm-retention:scheduled'], 'node scripts/runScheduledAuditLogLocalWormRetention.mjs');
  });
});
