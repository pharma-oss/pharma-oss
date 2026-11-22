/**
 * H-1: ローカル / NAS 追記専用 WORM 監査ログ保全コネクタの TypeScript 公開窓口。
 * 実装本体は Node.js 素実行（cron / launchd / Task Scheduler）と完全に同一の
 * scripts/lib/audit_local_worm_core.mjs を単一正本として共有する（金科玉条 第八条）。
 */
export {
  APP_ID,
  AUDIT_EXPORT_TYPE,
  DEFAULT_LOCAL_WORM_RETENTION_DAYS,
  LOCAL_WORM_CONNECTOR_ID,
  LOCAL_WORM_FAILURE_NOTICE_TYPE,
  LOCAL_WORM_MANIFEST_FILE_NAME,
  LOCAL_WORM_RECEIPT_TYPE,
  LOCAL_WORM_RECEIPT_VERSION,
  archiveAuditLogToLocalWorm,
  assertNonEmptyString,
  canonicalJson,
  computeLocalWormManifestEntryHash,
  getAuditExportLatestHash,
  makeLocalWormReceiptFileName,
  makeRetainUntilDate,
  parseJsonStrict,
  resolveLocalWormPath,
  sha256Buffer,
  validateAuditExportPayload,
  verifyLocalWormArchiveDirectory,
  type AuditLogLocalWormArchiveOptions,
  type AuditLogLocalWormArchiveResult,
  type LocalWormArchiveVerificationResult,
  type LocalWormManifestEntry,
  type LocalWormManifestEntryBody,
  type LocalWormRetentionReceipt
} from '../../scripts/lib/audit_local_worm_core.mjs';
