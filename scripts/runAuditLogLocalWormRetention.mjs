#!/usr/bin/env node
import {
  DEFAULT_LOCAL_WORM_RETENTION_DAYS,
  archiveAuditLogToLocalWorm,
  verifyLocalWormArchiveDirectory
} from './lib/audit_local_worm_core.mjs';

function usage() {
  return [
    'Usage: node scripts/runAuditLogLocalWormRetention.mjs --audit-json <path> --destination <dir|file://dir> [--receipt <path>] [--expected-latest-hash <hash>] [--storage-name <name>] [--retention-days <days>] [--no-read-only-lock] [--immutable-verified] [--dry-run]',
    '   or: node scripts/runAuditLogLocalWormRetention.mjs --verify-only --destination <dir|file://dir>',
    '',
    'Archives an exported pharma-oss audit-log JSON into an append-only local/NAS WORM directory.',
    'Refuses overwrites (EEXIST), optionally locks the archive read-only (0444), verifies SHA-256 and integrity.latestHash by reading back from disk, appends to audit_worm_manifest.jsonl, and writes a retention receipt JSON.'
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    verifyOnly: false,
    lockReadOnly: true,
    immutableVerified: false,
    retentionDays: DEFAULT_LOCAL_WORM_RETENTION_DAYS,
    storageName: 'ローカル/NAS 追記専用WORM'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--verify-only') {
      args.verifyOnly = true;
      continue;
    }
    if (arg === '--no-read-only-lock') {
      args.lockReadOnly = false;
      continue;
    }
    if (arg === '--immutable-verified') {
      args.immutableVerified = true;
      continue;
    }
    if ([
      '--audit-json',
      '--destination',
      '--receipt',
      '--expected-latest-hash',
      '--storage-name',
      '--retention-days'
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

  const retentionDays = Number(args.retentionDays);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error('--retention-days must be a positive number.');
  }
  args.retentionDays = Math.ceil(retentionDays);
  return args;
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

  if (args.verifyOnly) {
    const verification = await verifyLocalWormArchiveDirectory(args.destination, { verifyFilesOnDisk: true });
    console.log(JSON.stringify({
      ok: verification.isValid,
      verifyOnly: true,
      destinationDir: verification.destinationDir,
      manifestPath: verification.manifestPath,
      entryCount: verification.entryCount,
      latestManifestHash: verification.latestManifestHash,
      isValid: verification.isValid,
      errors: verification.errors
    }, null, 2));
    if (!verification.isValid) {
      process.exitCode = 1;
    }
    return;
  }

  if (!args.auditJson) {
    throw new Error(`--audit-json is required.\n${usage()}`);
  }

  const result = await archiveAuditLogToLocalWorm({
    auditJsonPath: args.auditJson,
    destinationDir: args.destination,
    receiptPath: args.receipt,
    expectedLatestHash: args.expectedLatestHash,
    storageName: args.storageName,
    retentionDays: args.retentionDays,
    lockReadOnly: args.lockReadOnly,
    immutableVerified: args.immutableVerified,
    dryRun: args.dryRun
  });

  const { receipt: _receipt, ...stdoutSummary } = result;
  console.log(JSON.stringify(stdoutSummary, null, 2));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
