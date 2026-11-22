import { constants } from 'node:fs';
import { access, appendFile, chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ID = 'yakureki';
export const AUDIT_EXPORT_TYPE = 'audit-log-export';
export const LOCAL_WORM_CONNECTOR_ID = 'local-nas-append-only-worm';
export const LOCAL_WORM_RECEIPT_TYPE = 'audit-log-local-worm-retention-receipt';
export const LOCAL_WORM_FAILURE_NOTICE_TYPE = 'audit-log-local-worm-retention-failure-notice';
export const LOCAL_WORM_MANIFEST_FILE_NAME = 'audit_worm_manifest.jsonl';
export const LOCAL_WORM_RECEIPT_VERSION = 1;
export const DEFAULT_LOCAL_WORM_RETENTION_DAYS = 2555;

export function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

export function resolveLocalWormPath(value, label) {
  const text = assertNonEmptyString(value, label);
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)) {
    if (!text.startsWith('file://')) {
      throw new Error(`${label} must be a local/NAS directory path or file:// URL. Got: ${text}`);
    }
    return fileURLToPath(text);
  }
  return isAbsolute(text) ? text : resolve(text);
}

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function canonicalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) {
        sorted[key] = canonicalizeValue(value[key]);
      }
    }
    return sorted;
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalizeValue(value));
}

export function parseJsonStrict(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

export function getAuditExportLatestHash(payload) {
  return typeof payload?.integrity?.latestHash === 'string' && payload.integrity.latestHash.trim() !== ''
    ? payload.integrity.latestHash.trim()
    : undefined;
}

export function validateAuditExportPayload(payload, expectedLatestHash) {
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
  const latestHash = getAuditExportLatestHash(payload);
  if (!latestHash) {
    throw new Error('Audit log export integrity.latestHash is required.');
  }
  if (expectedLatestHash && latestHash !== expectedLatestHash) {
    throw new Error(`Audit latest hash mismatch. expected=${expectedLatestHash} actual=${latestHash}`);
  }
  return latestHash;
}

export function computeLocalWormManifestEntryHash(entryWithoutHash) {
  return sha256Buffer(Buffer.from(canonicalJson(entryWithoutHash), 'utf8'));
}

export function makeLocalWormReceiptFileName(auditLogFileName, date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${auditLogFileName.replace(/\.json$/i, '')}_local_worm_retention_receipt_${stamp}.json`;
}

export function makeRetainUntilDate(retentionDays, date = new Date()) {
  return new Date(date.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

async function pathExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function verifyLocalWormArchiveDirectory(destinationDir, options = {}) {
  const verifyFilesOnDisk = options.verifyFilesOnDisk !== false;
  const resolvedDir = resolveLocalWormPath(destinationDir, 'destination');
  const manifestPath = join(resolvedDir, LOCAL_WORM_MANIFEST_FILE_NAME);
  const errors = [];
  const entries = [];

  if (!await pathExists(manifestPath)) {
    return {
      destinationDir: resolvedDir,
      manifestPath,
      entryCount: 0,
      latestManifestHash: '',
      isValid: true,
      errors,
      entries
    };
  }

  const raw = await readFile(manifestPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== '');
  let previousManifestHash = '';

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    let parsed;
    try {
      parsed = JSON.parse(lines[i]);
    } catch {
      errors.push(`manifest line ${lineNo}: invalid JSON`);
      continue;
    }

    const { manifestEntryHash, ...rest } = parsed;
    if (typeof manifestEntryHash !== 'string' || !/^[0-9a-f]{64}$/.test(manifestEntryHash)) {
      errors.push(`manifest line ${lineNo}: missing or invalid manifestEntryHash`);
      continue;
    }
    if ((rest.previousManifestHash || '') !== previousManifestHash) {
      errors.push(`manifest line ${lineNo}: previousManifestHash chain broken`);
    }
    const expectedEntryHash = computeLocalWormManifestEntryHash(rest);
    if (manifestEntryHash !== expectedEntryHash) {
      errors.push(`manifest line ${lineNo}: manifestEntryHash mismatch`);
    }

    if (verifyFilesOnDisk) {
      const archivedPath = join(resolvedDir, String(rest.auditLogFileName || ''));
      if (!rest.auditLogFileName || !await pathExists(archivedPath)) {
        errors.push(`manifest line ${lineNo}: archived file missing (${rest.auditLogFileName || 'unknown'})`);
      } else {
        const diskBuffer = await readFile(archivedPath);
        const diskSha256 = sha256Buffer(diskBuffer);
        if (diskSha256 !== rest.sourceSha256) {
          errors.push(`manifest line ${lineNo}: SHA-256 mismatch for ${rest.auditLogFileName}`);
        }
        if (typeof rest.bytesCopied === 'number' && diskBuffer.length !== rest.bytesCopied) {
          errors.push(`manifest line ${lineNo}: byte size mismatch for ${rest.auditLogFileName}`);
        }
        try {
          const diskPayload = parseJsonStrict(diskBuffer.toString('utf8'), rest.auditLogFileName);
          const diskLatestHash = validateAuditExportPayload(diskPayload);
          if (diskLatestHash !== rest.latestHash) {
            errors.push(`manifest line ${lineNo}: integrity.latestHash mismatch for ${rest.auditLogFileName}`);
          }
        } catch (error) {
          errors.push(`manifest line ${lineNo}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    previousManifestHash = manifestEntryHash;
    entries.push(parsed);
  }

  return {
    destinationDir: resolvedDir,
    manifestPath,
    entryCount: entries.length,
    latestManifestHash: previousManifestHash,
    isValid: errors.length === 0,
    errors,
    entries
  };
}

export async function archiveAuditLogToLocalWorm(options) {
  const auditJsonPath = resolveLocalWormPath(options.auditJsonPath, '--audit-json');
  const destinationDir = resolveLocalWormPath(options.destinationDir, '--destination');
  const storageName = typeof options.storageName === 'string' && options.storageName.trim()
    ? options.storageName.trim()
    : 'ローカル/NAS 追記専用WORM';
  const retentionDays = Math.ceil(Number(options.retentionDays ?? DEFAULT_LOCAL_WORM_RETENTION_DAYS));
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error('retentionDays must be a positive number.');
  }
  const lockReadOnly = options.lockReadOnly !== false;
  const immutableStorageVerified = Boolean(options.immutableVerified);
  const dryRun = Boolean(options.dryRun);
  const now = options.now instanceof Date ? options.now : new Date();

  const auditLogFileName = basename(auditJsonPath);
  const destinationFilePath = join(destinationDir, auditLogFileName);
  if (resolve(auditJsonPath) === resolve(destinationFilePath)) {
    throw new Error('Destination archive path must be different from the source audit log path.');
  }

  const sourceBuffer = await readFile(auditJsonPath);
  const sourceStat = await stat(auditJsonPath);
  const sourceSha256 = sha256Buffer(sourceBuffer);
  const payload = parseJsonStrict(sourceBuffer.toString('utf8'), 'Audit log export');
  const latestHash = validateAuditExportPayload(payload, options.expectedLatestHash);
  const receiptPath = options.receiptPath
    ? resolveLocalWormPath(options.receiptPath, '--receipt')
    : join(dirname(auditJsonPath), makeLocalWormReceiptFileName(auditLogFileName, now));
  const retainUntilDate = makeRetainUntilDate(retentionDays, now);
  const manifestPath = join(destinationDir, LOCAL_WORM_MANIFEST_FILE_NAME);

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      connector: LOCAL_WORM_CONNECTOR_ID,
      auditLogFileName,
      latestHash,
      sourceSha256,
      destinationObjectPath: destinationFilePath,
      destinationPathOrUrl: destinationDir,
      manifestPath,
      receiptPath,
      storageName,
      retentionDays,
      retainUntilDate,
      lockReadOnly,
      immutableStorageVerified,
      statusLabel: '監査ログローカル/NAS WORM保全確認OK',
      requiredActions: [
        '保存先NASの追記専用/スナップショットWORM権限、受領書JSONの保管、保全台帳CSVへの最新ハッシュ照合結果記録を確認する'
      ]
    };
  }

  await mkdir(destinationDir, { recursive: true });

  // 追記前に既存マニフェストチェーンの健全性を検証する（改ざん済み保管先へ無自覚に追記しない）
  const beforeManifest = await verifyLocalWormArchiveDirectory(destinationDir, { verifyFilesOnDisk: false });
  if (!beforeManifest.isValid) {
    throw new Error(`Existing local WORM manifest verification failed: ${beforeManifest.errors.join('; ')}`);
  }

  // 厳格な追記専用書き込み (O_CREAT | O_EXCL = 'wx'): 既存アーカイブの上書きをカーネルレベルで拒否する
  try {
    await writeFile(destinationFilePath, sourceBuffer, { flag: 'wx' });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      throw new Error(`Archive already exists (append-only refusal, EEXIST): ${destinationFilePath}`);
    }
    throw error;
  }

  let readOnlyLockApplied = false;
  if (lockReadOnly) {
    await chmod(destinationFilePath, 0o444);
    const lockedStat = await stat(destinationFilePath);
    readOnlyLockApplied = (lockedStat.mode & 0o222) === 0;
  }

  // 書き戻し読み取り検証（受領書発行前に必ずディスク上のバイト列とSHA-256/latestHashを照合する）
  const readBackBuffer = await readFile(destinationFilePath);
  const readBackSha256 = sha256Buffer(readBackBuffer);
  const readBackPayload = parseJsonStrict(readBackBuffer.toString('utf8'), 'Read-back audit log export');
  const readBackLatestHash = validateAuditExportPayload(readBackPayload, latestHash);
  const readBackVerified = readBackSha256 === sourceSha256 && readBackBuffer.length === sourceStat.size;
  const latestHashMatched = latestHash === readBackLatestHash;
  if (!readBackVerified || !latestHashMatched) {
    throw new Error(`Local/NAS read-back audit verification failed: ${destinationFilePath}`);
  }

  const manifestEntryBody = {
    entryVersion: 1,
    archivedAt: now.toISOString(),
    auditLogFileName,
    sourceSha256,
    bytesCopied: sourceStat.size,
    latestHash,
    retentionDays,
    retainUntilDate,
    readOnlyLockApplied,
    immutableStorageVerified,
    previousManifestHash: beforeManifest.latestManifestHash
  };
  const manifestEntryHash = computeLocalWormManifestEntryHash(manifestEntryBody);
  const manifestEntry = {
    ...manifestEntryBody,
    manifestEntryHash
  };
  await appendFile(manifestPath, `${JSON.stringify(manifestEntry)}\n`, 'utf8');

  const afterManifest = await verifyLocalWormArchiveDirectory(destinationDir, { verifyFilesOnDisk: false });
  if (!afterManifest.isValid || afterManifest.latestManifestHash !== manifestEntryHash) {
    throw new Error(`Post-append manifest verification failed: ${afterManifest.errors.join('; ')}`);
  }

  const status = readBackVerified && latestHashMatched && afterManifest.isValid && immutableStorageVerified
    ? 'pass'
    : 'attention';
  const requiredActions = [];
  if (!immutableStorageVerified) {
    requiredActions.push('NAS側のWORM/追記専用共有または不変スナップショット設定を確認し、確認後に --immutable-verified 付きで運用する');
  }
  if (!readOnlyLockApplied && lockReadOnly) {
    requiredActions.push('ファイルシステムの読み取り専用属性（chmod 0444）の反映状況を確認する');
  }
  requiredActions.push('受領書JSONとマニフェスト（audit_worm_manifest.jsonl）を保管し、保全台帳CSVへ最新ハッシュ照合結果を記録する');

  const receipt = {
    app: APP_ID,
    receiptVersion: LOCAL_WORM_RECEIPT_VERSION,
    type: LOCAL_WORM_RECEIPT_TYPE,
    transferredAt: now.toISOString(),
    connector: LOCAL_WORM_CONNECTOR_ID,
    auditLogFileName,
    sourceAuditLogPath: auditJsonPath,
    storageName,
    destinationObjectPath: destinationFilePath,
    destinationPathOrUrl: destinationDir,
    manifestPath,
    manifestEntryHash,
    previousManifestHash: beforeManifest.latestManifestHash,
    latestHash,
    sourceSha256,
    bytesCopied: sourceStat.size,
    readBackVerified,
    latestHashMatched,
    readOnlyLockApplied,
    immutableStorageVerified,
    retentionDays,
    retainUntilDate,
    status,
    statusLabel: status === 'pass'
      ? '監査ログローカル/NAS WORM保存OK'
      : '監査ログ追記保存OK・NAS側WORM設定確認待ち',
    requiredActions
  };

  await mkdir(dirname(receiptPath), { recursive: true });
  try {
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx'
    });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      throw new Error(`Receipt already exists (append-only refusal, EEXIST): ${receiptPath}`);
    }
    throw error;
  }

  return {
    ok: true,
    connector: LOCAL_WORM_CONNECTOR_ID,
    auditLogFileName,
    destinationObjectPath: destinationFilePath,
    destinationPathOrUrl: destinationDir,
    manifestPath,
    manifestEntryHash,
    receiptPath,
    latestHash,
    sourceSha256,
    bytesCopied: sourceStat.size,
    readBackVerified,
    latestHashMatched,
    readOnlyLockApplied,
    immutableStorageVerified,
    status,
    statusLabel: receipt.statusLabel,
    requiredActions: receipt.requiredActions,
    receipt
  };
}
