export const APP_ID: 'yakureki';
export const AUDIT_EXPORT_TYPE: 'audit-log-export';
export const LOCAL_WORM_CONNECTOR_ID: 'local-nas-append-only-worm';
export const LOCAL_WORM_RECEIPT_TYPE: 'audit-log-local-worm-retention-receipt';
export const LOCAL_WORM_FAILURE_NOTICE_TYPE: 'audit-log-local-worm-retention-failure-notice';
export const LOCAL_WORM_MANIFEST_FILE_NAME: 'audit_worm_manifest.jsonl';
export const LOCAL_WORM_RECEIPT_VERSION: 1;
export const DEFAULT_LOCAL_WORM_RETENTION_DAYS: 2555;

export interface LocalWormManifestEntryBody {
  entryVersion: 1;
  archivedAt: string;
  auditLogFileName: string;
  sourceSha256: string;
  bytesCopied: number;
  latestHash: string;
  retentionDays: number;
  retainUntilDate: string;
  readOnlyLockApplied: boolean;
  immutableStorageVerified: boolean;
  previousManifestHash: string;
}

export interface LocalWormManifestEntry extends LocalWormManifestEntryBody {
  manifestEntryHash: string;
}

export interface LocalWormArchiveVerificationResult {
  destinationDir: string;
  manifestPath: string;
  entryCount: number;
  latestManifestHash: string;
  isValid: boolean;
  errors: string[];
  entries: LocalWormManifestEntry[];
}

export interface LocalWormRetentionReceipt {
  app: 'yakureki';
  receiptVersion: 1;
  type: 'audit-log-local-worm-retention-receipt';
  transferredAt: string;
  connector: 'local-nas-append-only-worm';
  auditLogFileName: string;
  sourceAuditLogPath: string;
  storageName: string;
  destinationObjectPath: string;
  destinationPathOrUrl: string;
  manifestPath: string;
  manifestEntryHash: string;
  previousManifestHash: string;
  latestHash: string;
  sourceSha256: string;
  bytesCopied: number;
  readBackVerified: boolean;
  latestHashMatched: boolean;
  readOnlyLockApplied: boolean;
  immutableStorageVerified: boolean;
  retentionDays: number;
  retainUntilDate: string;
  status: 'pass' | 'attention';
  statusLabel: string;
  requiredActions: string[];
}

export interface AuditLogLocalWormArchiveOptions {
  auditJsonPath: string;
  destinationDir: string;
  receiptPath?: string;
  expectedLatestHash?: string;
  storageName?: string;
  retentionDays?: number;
  lockReadOnly?: boolean;
  immutableVerified?: boolean;
  dryRun?: boolean;
  now?: Date;
}

export interface AuditLogLocalWormArchiveResult {
  ok: true;
  dryRun?: boolean;
  connector: 'local-nas-append-only-worm';
  auditLogFileName: string;
  destinationObjectPath: string;
  destinationPathOrUrl: string;
  manifestPath: string;
  manifestEntryHash?: string;
  receiptPath: string;
  latestHash: string;
  sourceSha256: string;
  bytesCopied?: number;
  readBackVerified?: boolean;
  latestHashMatched?: boolean;
  readOnlyLockApplied?: boolean;
  immutableStorageVerified: boolean;
  status?: 'pass' | 'attention';
  statusLabel: string;
  requiredActions: string[];
  receipt?: LocalWormRetentionReceipt;
  storageName?: string;
  retentionDays?: number;
  retainUntilDate?: string;
  lockReadOnly?: boolean;
}

export function assertNonEmptyString(value: unknown, label: string): string;
export function resolveLocalWormPath(value: string, label: string): string;
export function sha256Buffer(buffer: Buffer | Uint8Array): string;
export function canonicalJson(value: unknown): string;
export function parseJsonStrict(text: string, label: string): unknown;
export function getAuditExportLatestHash(payload: unknown): string | undefined;
export function validateAuditExportPayload(payload: unknown, expectedLatestHash?: string): string;
export function computeLocalWormManifestEntryHash(entryWithoutHash: LocalWormManifestEntryBody): string;
export function makeLocalWormReceiptFileName(auditLogFileName: string, date?: Date): string;
export function makeRetainUntilDate(retentionDays: number, date?: Date): string;
export function verifyLocalWormArchiveDirectory(
  destinationDir: string,
  options?: { verifyFilesOnDisk?: boolean }
): Promise<LocalWormArchiveVerificationResult>;
export function archiveAuditLogToLocalWorm(
  options: AuditLogLocalWormArchiveOptions
): Promise<AuditLogLocalWormArchiveResult>;
