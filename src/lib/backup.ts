import type { AuditLog, PharmacyDatabase } from '../db/types.ts';
import CryptoJS from 'crypto-js';

export const BACKUP_APP_ID = 'yakureki';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_EXTERNAL_TRANSFER_MANIFEST_VERSION = 1;
export const BACKUP_EXTERNAL_TRANSFER_RECEIPT_VERSION = 1;

export const BACKUP_COLLECTIONS = [
  'facility_settings',
  'patients',
  'visits',
  'prescription_items',
  'soap_records',
  'alerts',
  'interventions',
  'drugs',
  'drug_stocks',
  'locations',
  'medication_guidances',
  'patient_medication_info_templates',
  'users',
  'audit_logs'
] as const;

export type BackupCollectionName = (typeof BACKUP_COLLECTIONS)[number];
export type BackupCollections = Partial<Record<BackupCollectionName, Record<string, unknown>[]>>;

export interface YakurekiBackup {
  app: typeof BACKUP_APP_ID;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  createdAt: string;
  collections: BackupCollections;
}

export interface EncryptedYakurekiBackup {
  app: typeof BACKUP_APP_ID;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  encrypted: true;
  ciphertext: string;
  createdAt: string;
}

export type BackupPayload = YakurekiBackup | EncryptedYakurekiBackup;

export interface BackupValidationSuccess {
  ok: true;
  backup: YakurekiBackup;
}

export interface BackupValidationFailure {
  ok: false;
  reason: string;
}

export type BackupValidationResult = BackupValidationSuccess | BackupValidationFailure;

export interface BackupImportCollectionResult {
  collection: BackupCollectionName;
  rows: number;
}

export interface BackupImportResult {
  totalRows: number;
  collections: BackupImportCollectionResult[];
}

type ReadableCollection = {
  find: () => {
    exec: () => Promise<Array<{ toJSON: () => Record<string, unknown> }>>;
  };
};

type WritableCollection = {
  bulkUpsert: (rows: Record<string, unknown>[]) => Promise<BulkWriteResultLike | undefined>;
};

type BulkWriteResultLike = {
  error?: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertBackupCollectionName(name: string): name is BackupCollectionName {
  return (BACKUP_COLLECTIONS as readonly string[]).includes(name);
}

export function makeBackupFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const timestamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');

  return `yakureki_backup_${timestamp}.json`;
}

export function validateBackupPayload(value: unknown): BackupValidationResult {
  if (!isRecord(value)) {
    return { ok: false, reason: 'バックアップJSONの形式が不正です。' };
  }

  if (value.app !== BACKUP_APP_ID) {
    return { ok: false, reason: '薬歴アプリのバックアップファイルではありません。' };
  }

  if (value.formatVersion !== BACKUP_FORMAT_VERSION) {
    return { ok: false, reason: '対応していないバックアップ形式です。' };
  }

  if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) {
    return { ok: false, reason: 'バックアップ作成日時を確認できません。' };
  }

  if (!isRecord(value.collections)) {
    return { ok: false, reason: 'バックアップ内のデータ領域が不正です。' };
  }

  const collections: BackupCollections = {};
  for (const [collectionName, rows] of Object.entries(value.collections)) {
    if (!assertBackupCollectionName(collectionName)) {
      continue;
    }
    if (!Array.isArray(rows)) {
      return { ok: false, reason: `${collectionName} のバックアップ形式が不正です。` };
    }

    const sanitizedRows: Record<string, unknown>[] = [];
    for (const row of rows) {
      if (!isRecord(row)) {
        return { ok: false, reason: `${collectionName} に不正なレコードが含まれています。` };
      }
      sanitizedRows.push(row);
    }
    collections[collectionName] = sanitizedRows;
  }

  return {
    ok: true,
    backup: {
      app: BACKUP_APP_ID,
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAt: value.createdAt,
      collections
    }
  };
}

export function countBackupRows(backup: YakurekiBackup): number {
  return BACKUP_COLLECTIONS.reduce((total, collectionName) => {
    return total + (backup.collections[collectionName]?.length || 0);
  }, 0);
}

export async function buildDatabaseBackup(db: PharmacyDatabase): Promise<YakurekiBackup> {
  const collections: BackupCollections = {};

  for (const collectionName of BACKUP_COLLECTIONS) {
    const collection = db[collectionName] as unknown as ReadableCollection;
    const docs = await collection.find().exec();
    collections[collectionName] = docs.map((doc) => doc.toJSON());
  }

  return {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    collections
  };
}

export async function importDatabaseBackup(db: PharmacyDatabase, backup: YakurekiBackup): Promise<BackupImportResult> {
  const collections: BackupImportCollectionResult[] = [];
  let totalRows = 0;

  for (const collectionName of BACKUP_COLLECTIONS) {
    const rows = backup.collections[collectionName] || [];
    collections.push({ collection: collectionName, rows: rows.length });
    totalRows += rows.length;

    if (rows.length === 0) {
      continue;
    }

    const collection = db[collectionName] as unknown as WritableCollection;
    const result = await collection.bulkUpsert(rows);
    if (result?.error && result.error.length > 0) {
      throw new Error(`${collectionName} の復旧で ${result.error.length}件の書き込みに失敗しました。`);
    }
  }

  return { totalRows, collections };
}

export function isEncryptedBackup(value: unknown): value is EncryptedYakurekiBackup {
  return (
    isRecord(value) &&
    value.app === BACKUP_APP_ID &&
    value.formatVersion === BACKUP_FORMAT_VERSION &&
    value.encrypted === true &&
    typeof value.ciphertext === 'string'
  );
}

export function encryptBackupPayload(backup: YakurekiBackup, password: string): EncryptedYakurekiBackup {
  const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(backup), password).toString();
  return {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    encrypted: true,
    ciphertext,
    createdAt: backup.createdAt
  };
}

export function decryptBackupPayload(encrypted: EncryptedYakurekiBackup, password: string): YakurekiBackup {
  try {
    const bytes = CryptoJS.AES.decrypt(encrypted.ciphertext, password);
    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
    if (!decryptedText) {
      throw new Error('復号結果が空です。');
    }
    const decrypted = JSON.parse(decryptedText);
    return decrypted;
  } catch (error) {
    throw new Error('バックアップの復号に失敗しました。パスワードが正しいか確認してください。');
  }
}

const PRIMARY_KEYS: Record<BackupCollectionName, string> = {
  facility_settings: 'id',
  patients: 'patientId',
  visits: 'visitId',
  prescription_items: 'itemId',
  soap_records: 'soapId',
  alerts: 'alertId',
  interventions: 'interventionId',
  drugs: 'code',
  drug_stocks: 'id',
  locations: 'id',
  medication_guidances: 'id',
  patient_medication_info_templates: 'templateId',
  users: 'userId',
  audit_logs: 'logId'
};

function areObjectsEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!areObjectsEqual(a[key], b[key])) return false;
  }
  return true;
}

export interface CollectionDiff {
  collection: BackupCollectionName;
  added: number;
  updated: number;
  unchanged: number;
}

export type BackupRestoreDrillStatus = 'pass' | 'attention' | 'blocked';

export interface BackupRestoreDrillCheck {
  id: string;
  label: string;
  status: BackupRestoreDrillStatus;
  detail: string;
}

export interface BackupRestoreDrillReport {
  checkedAt: string;
  backupCreatedAt: string;
  totalRows: number;
  collectionCount: number;
  diffSummary: {
    added: number;
    updated: number;
    unchanged: number;
  };
  status: BackupRestoreDrillStatus;
  statusLabel: string;
  checks: BackupRestoreDrillCheck[];
  migrationDiagnostic: BackupMigrationDiagnosticReport;
}

export type BackupMigrationIssueSeverity = 'blocked' | 'attention';

export interface BackupMigrationIssue {
  id: string;
  severity: BackupMigrationIssueSeverity;
  collection?: BackupCollectionName;
  rowIndex?: number;
  primaryKey?: string;
  label: string;
  detail: string;
}

export interface BackupMigrationDiagnosticReport {
  generatedAt: string;
  backupCreatedAt: string;
  totalRows: number;
  collectionCount: number;
  missingPrimaryKeyCount: number;
  duplicatePrimaryKeyCount: number;
  mojibakeSuspectCount: number;
  missingRequiredCollectionCount: number;
  status: BackupRestoreDrillStatus;
  statusLabel: string;
  actionLabel: string;
  requiredActions: string[];
  issues: BackupMigrationIssue[];
}

export interface BackupMigrationDiagnosticOptions {
  requiredCollections?: readonly BackupCollectionName[];
}

export interface BackupRestoreDrillReportOptions {
  migrationRequiredCollections?: readonly BackupCollectionName[];
}

export interface BackupContinuityReport {
  generatedAt: string;
  latestBackupAt?: string;
  latestDrillAt?: string;
  latestExternalStorageAt?: string;
  backupAgeDays?: number;
  drillAgeDays?: number;
  externalStorageAgeDays?: number;
  status: BackupRestoreDrillStatus;
  statusLabel: string;
  detail: string;
  recommendation: string;
}

export interface BackupSchedulePolicy {
  enabled: boolean;
  scheduledTime: string;
  requireEncrypted: boolean;
  requireExternalStorage: boolean;
}

export interface BackupScheduleReview {
  generatedAt: string;
  scheduledTime: string;
  dueAt: string;
  dueAtLabel: string;
  isEnabled: boolean;
  isDue: boolean;
  status: BackupRestoreDrillStatus;
  statusLabel: string;
  actionLabel: string;
  detail: string;
  requiredActions: string[];
  latestBackup?: BackupGenerationRecord;
  latestExternalStorage?: BackupExternalStorageRecord;
}

export interface BackupExternalTransferManifestInput {
  fileName: string;
  fileContent: string;
  payload: BackupPayload;
  destinationName: string;
  destinationPathOrUrl: string;
  generatedAt?: Date;
  retentionDays?: number;
  requireEncrypted?: boolean;
  requireReadBack?: boolean;
  requireImmutableStorage?: boolean;
  notes?: string;
}

export interface BackupExternalTransferManifest {
  app: typeof BACKUP_APP_ID;
  manifestVersion: typeof BACKUP_EXTERNAL_TRANSFER_MANIFEST_VERSION;
  generatedAt: string;
  backupCreatedAt: string;
  backupFileName: string;
  backupSha256: string;
  backupSizeBytes: number;
  backupRowCount?: number;
  encrypted: boolean;
  destinationName: string;
  destinationPathOrUrl: string;
  retentionDays: number;
  requireEncrypted: boolean;
  requireReadBack: boolean;
  requireImmutableStorage: boolean;
  status: BackupRestoreDrillStatus;
  statusLabel: string;
  requiredActions: string[];
  notes?: string;
}

export interface BackupExternalTransferReceipt {
  app: typeof BACKUP_APP_ID;
  receiptVersion: typeof BACKUP_EXTERNAL_TRANSFER_RECEIPT_VERSION;
  transferredAt: string;
  manifestFileName: string;
  backupFileName: string;
  sourceBackupPath: string;
  destinationName: string;
  destinationBackupPath: string;
  destinationPathOrUrl: string;
  backupSha256: string;
  bytesCopied: number;
  readBackVerified: boolean;
  immutableStorageVerified: boolean;
  retentionDays: number;
  status: 'pass' | 'attention';
  statusLabel: string;
  requiredActions: string[];
}

export interface BackupExternalTransferReceiptValidationSuccess {
  ok: true;
  receipt: BackupExternalTransferReceipt;
}

export interface BackupExternalTransferReceiptValidationFailure {
  ok: false;
  reason: string;
}

export type BackupExternalTransferReceiptValidationResult =
  | BackupExternalTransferReceiptValidationSuccess
  | BackupExternalTransferReceiptValidationFailure;

export interface BackupGenerationRecord {
  logId: string;
  timestamp: string;
  dateLabel: string;
  fileName: string;
  rowCount?: number;
  isEncrypted: boolean;
}

export interface BackupExternalStorageEvidenceInput {
  fileName: string;
  destinationName: string;
  destinationPathOrUrl: string;
  verifierName: string;
  verifiedAt?: Date;
  readBackVerified: boolean;
  immutableStorageVerified: boolean;
  notes?: string;
}

export interface BackupExternalStorageEvidence {
  fileName: string;
  destinationName: string;
  destinationPathOrUrl: string;
  verifierName: string;
  verifiedAt: string;
  readBackVerified: boolean;
  immutableStorageVerified: boolean;
  notes?: string;
  status: BackupRestoreDrillStatus;
  statusLabel: string;
  requiredActions: string[];
}

export interface BackupExternalStorageRecord {
  logId: string;
  timestamp: string;
  dateLabel: string;
  fileName: string;
  destinationName: string;
  destinationPathOrUrl: string;
  verifierName: string;
  readBackVerified: boolean;
  immutableStorageVerified: boolean;
  status: BackupRestoreDrillStatus;
  statusLabel: string;
}

export interface BackupGenerationReview {
  generatedAt: string;
  retentionDays: number;
  requiredGenerationCount: number;
  generationCount: number;
  encryptedGenerationCount: number;
  latestBackup?: BackupGenerationRecord;
  oldestBackup?: BackupGenerationRecord;
  latestDrillAt?: string;
  drillAgeDays?: number;
  latestExternalStorage?: BackupExternalStorageRecord;
  externalStorageAgeDays?: number;
  externalStorageStatus: BackupRestoreDrillStatus;
  externalStorageStatusLabel: string;
  status: BackupRestoreDrillStatus;
  statusLabel: string;
  actionLabel: string;
  requiredActions: string[];
  generations: BackupGenerationRecord[];
}

export const DEFAULT_BACKUP_SCHEDULE_POLICY: BackupSchedulePolicy = {
  enabled: true,
  scheduledTime: '20:00',
  requireEncrypted: true,
  requireExternalStorage: true
};

export async function calculateBackupDiff(
  db: PharmacyDatabase,
  backup: YakurekiBackup
): Promise<CollectionDiff[]> {
  const diffs: CollectionDiff[] = [];

  for (const collectionName of BACKUP_COLLECTIONS) {
    const backupRows = backup.collections[collectionName] || [];
    const pk = PRIMARY_KEYS[collectionName];

    if (backupRows.length === 0) {
      diffs.push({ collection: collectionName, added: 0, updated: 0, unchanged: 0 });
      continue;
    }

    const collection = db[collectionName] as unknown as ReadableCollection;
    const existingDocs = await collection.find().exec();
    const existingMap = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < existingDocs.length; i++) {
      const docJson = existingDocs[i].toJSON();
      const id = String(docJson[pk] || '');
      if (id) {
        existingMap.set(id, docJson);
      }
    }

    let added = 0;
    let updated = 0;
    let unchanged = 0;

    for (const row of backupRows) {
      const id = String(row[pk] || '');
      if (!id) continue;

      const existingRow = existingMap.get(id);
      if (!existingRow) {
        added++;
      } else {
        if (areObjectsEqual(existingRow, row)) {
          unchanged++;
        } else {
          updated++;
        }
      }
    }

    diffs.push({ collection: collectionName, added, updated, unchanged });
  }

  return diffs;
}

function countCollectionRows(backup: YakurekiBackup, collectionName: BackupCollectionName): number {
  return backup.collections[collectionName]?.length || 0;
}

function chooseRestoreDrillStatus(checks: BackupRestoreDrillCheck[]): BackupRestoreDrillStatus {
  if (checks.some((check) => check.status === 'blocked')) return 'blocked';
  if (checks.some((check) => check.status === 'attention')) return 'attention';
  return 'pass';
}

export function backupRestoreDrillStatusLabel(status: BackupRestoreDrillStatus): string {
  if (status === 'pass') return 'テストOK';
  if (status === 'attention') return '要確認';
  return '復旧不可';
}

function backupMigrationStatusLabel(status: BackupRestoreDrillStatus): string {
  if (status === 'pass') return '移行OK';
  if (status === 'attention') return '移行要確認';
  return '移行不可';
}

const MIGRATION_REQUIRED_COLLECTIONS: BackupCollectionName[] = [
  'facility_settings',
  'users',
  'audit_logs'
];

function hasMojibakeSuspect(value: unknown): boolean {
  if (typeof value === 'string') {
    return /�|ã|Ã|Â|縺|繧|譁|蜷|逕|髮|荳/.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(hasMojibakeSuspect);
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasMojibakeSuspect);
  }
  return false;
}

export function buildBackupMigrationDiagnosticReport(
  backup: YakurekiBackup,
  generatedAt = new Date(),
  options: BackupMigrationDiagnosticOptions = {}
): BackupMigrationDiagnosticReport {
  const issues: BackupMigrationIssue[] = [];
  let missingPrimaryKeyCount = 0;
  let duplicatePrimaryKeyCount = 0;
  let mojibakeSuspectCount = 0;
  const requiredCollections = options.requiredCollections ?? MIGRATION_REQUIRED_COLLECTIONS;

  for (const collection of requiredCollections) {
    if (countCollectionRows(backup, collection) === 0) {
      issues.push({
        id: `missing-required-${collection}`,
        severity: 'attention',
        collection,
        label: '必須領域不足',
        detail: `${collection} が含まれていません。移行後に設定、スタッフ、監査証跡を確認してください。`
      });
    }
  }

  for (const collection of BACKUP_COLLECTIONS) {
    const rows = backup.collections[collection] || [];
    const primaryKey = PRIMARY_KEYS[collection];
    const seen = new Set<string>();

    rows.forEach((row, index) => {
      const primaryValue = String(row[primaryKey] ?? '').trim();
      if (!primaryValue) {
        missingPrimaryKeyCount += 1;
        issues.push({
          id: `missing-primary-${collection}-${index}`,
          severity: 'blocked',
          collection,
          rowIndex: index,
          label: 'ID欠落',
          detail: `${collection} の${index + 1}行目に ${primaryKey} がありません。移行前にIDを補正してください。`
        });
      } else if (seen.has(primaryValue)) {
        duplicatePrimaryKeyCount += 1;
        issues.push({
          id: `duplicate-primary-${collection}-${primaryValue}-${index}`,
          severity: 'blocked',
          collection,
          rowIndex: index,
          primaryKey: primaryValue,
          label: '同一ID重複',
          detail: `${collection} の ${primaryKey}=${primaryValue} が重複しています。移行前に統合または片方を除外してください。`
        });
      } else {
        seen.add(primaryValue);
      }

      if (hasMojibakeSuspect(row)) {
        mojibakeSuspectCount += 1;
        issues.push({
          id: `mojibake-${collection}-${primaryValue || index}`,
          severity: 'attention',
          collection,
          rowIndex: index,
          primaryKey: primaryValue || undefined,
          label: '文字化け疑い',
          detail: `${collection} の${index + 1}行目に文字化けらしい文字列があります。氏名、薬品名、住所、メモを確認してください。`
        });
      }
    });
  }

  const totalRows = countBackupRows(backup);
  const collectionCount = BACKUP_COLLECTIONS.filter((collectionName) => countCollectionRows(backup, collectionName) > 0).length;
  const missingRequiredCollectionCount = issues.filter((issue) => issue.id.startsWith('missing-required-')).length;
  const status: BackupRestoreDrillStatus = missingPrimaryKeyCount > 0 || duplicatePrimaryKeyCount > 0
    ? 'blocked'
    : mojibakeSuspectCount > 0 || missingRequiredCollectionCount > 0
      ? 'attention'
      : 'pass';
  const requiredActions = status === 'blocked'
    ? ['ID欠落または同一ID重複を修正してから移行してください。']
    : status === 'attention'
      ? ['必須領域不足または文字化け疑いを確認し、必要なら元データを再出力してください。']
      : ['移行前診断に重大な問題はありません。復旧前プレビューの差分を確認してください。'];

  return {
    generatedAt: generatedAt.toISOString(),
    backupCreatedAt: backup.createdAt,
    totalRows,
    collectionCount,
    missingPrimaryKeyCount,
    duplicatePrimaryKeyCount,
    mojibakeSuspectCount,
    missingRequiredCollectionCount,
    status,
    statusLabel: backupMigrationStatusLabel(status),
    actionLabel: status === 'pass' ? '移行可能' : status === 'attention' ? '責任者確認' : '修正必須',
    requiredActions,
    issues
  };
}

export function buildBackupRestoreDrillReport(
  backup: YakurekiBackup,
  diffs: CollectionDiff[],
  checkedAt = new Date(),
  options: BackupRestoreDrillReportOptions = {}
): BackupRestoreDrillReport {
  const totalRows = countBackupRows(backup);
  const collectionCount = BACKUP_COLLECTIONS.filter((collectionName) => countCollectionRows(backup, collectionName) > 0).length;
  const diffSummary = diffs.reduce(
    (summary, diff) => ({
      added: summary.added + diff.added,
      updated: summary.updated + diff.updated,
      unchanged: summary.unchanged + diff.unchanged
    }),
    { added: 0, updated: 0, unchanged: 0 }
  );
  const clinicalCollections: BackupCollectionName[] = [
    'patients',
    'visits',
    'prescription_items',
    'soap_records',
    'alerts',
    'interventions'
  ];
  const clinicalRows = clinicalCollections.reduce((sum, collectionName) => sum + countCollectionRows(backup, collectionName), 0);

  const checks: BackupRestoreDrillCheck[] = [
    {
      id: 'backup_rows',
      label: '復旧対象データ',
      status: totalRows > 0 ? 'pass' : 'blocked',
      detail: totalRows > 0 ? `${totalRows}件を検出` : '復旧対象データがありません'
    },
    {
      id: 'diff_preview',
      label: '差分プレビュー',
      status: diffs.length === BACKUP_COLLECTIONS.length ? 'pass' : 'attention',
      detail: `新規${diffSummary.added}件 / 上書き${diffSummary.updated}件 / 変更なし${diffSummary.unchanged}件`
    },
    {
      id: 'audit_logs',
      label: '監査ログ',
      status: countCollectionRows(backup, 'audit_logs') > 0 ? 'pass' : 'attention',
      detail: countCollectionRows(backup, 'audit_logs') > 0
        ? `${countCollectionRows(backup, 'audit_logs')}件を含む`
        : '監査ログが含まれていません'
    },
    {
      id: 'staff',
      label: 'スタッフ情報',
      status: countCollectionRows(backup, 'users') > 0 ? 'pass' : 'attention',
      detail: countCollectionRows(backup, 'users') > 0
        ? `${countCollectionRows(backup, 'users')}件を含む`
        : 'スタッフ情報が含まれていません'
    },
    {
      id: 'facility',
      label: '施設基準設定',
      status: countCollectionRows(backup, 'facility_settings') > 0 ? 'pass' : 'attention',
      detail: countCollectionRows(backup, 'facility_settings') > 0
        ? `${countCollectionRows(backup, 'facility_settings')}件を含む`
        : '施設基準設定が含まれていません'
    },
    {
      id: 'clinical_data',
      label: '業務データ',
      status: clinicalRows > 0 ? 'pass' : 'attention',
      detail: clinicalRows > 0 ? `${clinicalRows}件を含む` : '患者・受付・薬歴などの業務データが含まれていません'
    }
  ];
  const migrationDiagnostic = buildBackupMigrationDiagnosticReport(backup, checkedAt, {
    requiredCollections: options.migrationRequiredCollections
  });
  checks.push({
    id: 'migration_diagnostic',
    label: '移行前診断',
    status: migrationDiagnostic.status,
    detail: `ID欠落${migrationDiagnostic.missingPrimaryKeyCount}件 / 重複${migrationDiagnostic.duplicatePrimaryKeyCount}件 / 文字化け疑い${migrationDiagnostic.mojibakeSuspectCount}件`
  });
  const status = chooseRestoreDrillStatus(checks);

  return {
    checkedAt: checkedAt.toISOString(),
    backupCreatedAt: backup.createdAt,
    totalRows,
    collectionCount,
    diffSummary,
    status,
    statusLabel: backupRestoreDrillStatusLabel(status),
    checks,
    migrationDiagnostic
  };
}

export function buildBackupRestoreDrillAuditDetail(
  report: BackupRestoreDrillReport,
  sourceName = 'バックアップファイル'
): string {
  return [
    `復旧テスト（訓練）: ${sourceName}`,
    `判定 ${report.statusLabel}`,
    `対象 ${report.totalRows}件/${report.collectionCount}区分`,
    `差分 新規${report.diffSummary.added}件・上書き${report.diffSummary.updated}件・変更なし${report.diffSummary.unchanged}件`,
    `移行診断 ${report.migrationDiagnostic.statusLabel} ID欠落${report.migrationDiagnostic.missingPrimaryKeyCount}件・重複${report.migrationDiagnostic.duplicatePrimaryKeyCount}件・文字化け疑い${report.migrationDiagnostic.mojibakeSuspectCount}件`,
    `作成日時 ${report.backupCreatedAt}`
  ].join(' / ');
}

function latestAuditDate(logs: AuditLog[], actionType: AuditLog['actionType']): Date | undefined {
  return logs
    .filter((log) => log.actionType === actionType)
    .map((log) => new Date(log.timestamp))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];
}

function ageDaysSince(date: Date, basisDate: Date): number {
  const elapsedMs = Math.max(0, basisDate.getTime() - date.getTime());
  return Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
}

function formatBackupAuditDate(date: Date): string {
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function backupContinuityStatusLabel(status: BackupRestoreDrillStatus): string {
  if (status === 'pass') return '良好';
  if (status === 'attention') return '要確認';
  return '未実施';
}

function backupExternalStorageStatusLabel(status: BackupRestoreDrillStatus): string {
  if (status === 'pass') return '外部保存OK';
  if (status === 'attention') return '要確認';
  return '保存未確認';
}

function backupExternalTransferStatusLabel(status: BackupRestoreDrillStatus): string {
  if (status === 'pass') return '連携準備OK';
  if (status === 'attention') return '要確認';
  return '連携不可';
}

function yesNoLabel(value: boolean): string {
  return value ? '確認済み' : '未確認';
}

function normalizeRetentionDays(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 30;
  return Math.max(1, Math.floor(value));
}

function byteSize(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function backupPayloadRowCount(payload: BackupPayload): number | undefined {
  return isEncryptedBackup(payload) ? undefined : countBackupRows(payload);
}

function safeFileSegment(value: string): string {
  const segment = value
    .replace(/\.json$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return segment || 'backup';
}

function normalizeScheduledTime(value: string | undefined): string {
  const normalized = String(value || '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)
    ? normalized
    : DEFAULT_BACKUP_SCHEDULE_POLICY.scheduledTime;
}

export function normalizeBackupSchedulePolicy(value?: Partial<BackupSchedulePolicy> | null): BackupSchedulePolicy {
  return {
    enabled: typeof value?.enabled === 'boolean'
      ? value.enabled
      : DEFAULT_BACKUP_SCHEDULE_POLICY.enabled,
    scheduledTime: normalizeScheduledTime(value?.scheduledTime),
    requireEncrypted: typeof value?.requireEncrypted === 'boolean'
      ? value.requireEncrypted
      : DEFAULT_BACKUP_SCHEDULE_POLICY.requireEncrypted,
    requireExternalStorage: typeof value?.requireExternalStorage === 'boolean'
      ? value.requireExternalStorage
      : DEFAULT_BACKUP_SCHEDULE_POLICY.requireExternalStorage
  };
}

function backupScheduleDueAt(generatedAt: Date, scheduledTime: string): Date {
  const [hour, minute] = normalizeScheduledTime(scheduledTime).split(':').map(Number);
  return new Date(
    generatedAt.getFullYear(),
    generatedAt.getMonth(),
    generatedAt.getDate(),
    hour,
    minute,
    0,
    0
  );
}

function backupScheduleStatusLabel(
  status: BackupRestoreDrillStatus,
  reason: 'disabled' | 'before_due' | 'completed' | 'missing_backup' | 'unencrypted' | 'external_waiting'
): string {
  if (reason === 'disabled') return '予定なし';
  if (reason === 'before_due') return '予定前';
  if (reason === 'completed') return '本日済み';
  if (reason === 'missing_backup') return '未実施';
  if (reason === 'unencrypted') return '暗号化要確認';
  if (reason === 'external_waiting') return '外部保存待ち';
  return status === 'pass' ? '良好' : status === 'attention' ? '要確認' : '未実施';
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function describeBackupRecord(record?: BackupGenerationRecord): string {
  if (!record) return '未記録';
  return `${record.dateLabel} ${record.fileName || 'ファイル名未記録'}`;
}

function describeExternalStorageRecord(record?: BackupExternalStorageRecord): string {
  if (!record) return '未記録';
  return `${record.dateLabel} ${record.destinationName || '保存先未記録'}（${record.statusLabel}）`;
}

function findLatestExternalStorageForBackup(
  auditLogs: AuditLog[],
  backup?: BackupGenerationRecord
): BackupExternalStorageRecord | undefined {
  if (!backup) return undefined;
  return auditLogs
    .map(parseBackupExternalStorageRecord)
    .filter((record): record is BackupExternalStorageRecord => Boolean(record))
    .filter((record) => (
      record.fileName === backup.fileName &&
      new Date(record.timestamp).getTime() >= new Date(backup.timestamp).getTime()
    ))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .at(-1);
}

export function buildBackupSchedulePolicyAuditDetail(policy: BackupSchedulePolicy): string {
  const normalized = normalizeBackupSchedulePolicy(policy);
  return [
    'バックアップ予定設定',
    `状態 ${normalized.enabled ? '有効' : '無効'}`,
    `予定時刻 ${normalized.scheduledTime}`,
    `暗号化 ${normalized.requireEncrypted ? '必須' : '任意'}`,
    `外部保存 ${normalized.requireExternalStorage ? '必須' : '任意'}`
  ].join(' / ');
}

export function buildBackupScheduleReview(
  auditLogs: AuditLog[],
  policy: BackupSchedulePolicy = DEFAULT_BACKUP_SCHEDULE_POLICY,
  generatedAt = new Date()
): BackupScheduleReview {
  const normalizedPolicy = normalizeBackupSchedulePolicy(policy);
  const dueAt = backupScheduleDueAt(generatedAt, normalizedPolicy.scheduledTime);
  const dayStart = startOfLocalDay(generatedAt);
  const todayBackups = auditLogs
    .map(parseBackupExportRecord)
    .filter((record): record is BackupGenerationRecord => Boolean(record))
    .filter((record) => {
      const timestamp = new Date(record.timestamp).getTime();
      return timestamp >= dayStart.getTime() && timestamp <= generatedAt.getTime();
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const latestBackup = todayBackups.at(-1);
  const latestExternalStorage = findLatestExternalStorageForBackup(auditLogs, latestBackup);
  const isDue = generatedAt.getTime() >= dueAt.getTime();
  const dueAtLabel = formatBackupAuditDate(dueAt);
  const encryptionOk = !normalizedPolicy.requireEncrypted || latestBackup?.isEncrypted === true;
  const externalStorageOk = !normalizedPolicy.requireExternalStorage || latestExternalStorage?.status === 'pass';
  const requiredActions: string[] = [];
  let status: BackupRestoreDrillStatus = 'pass';
  let reason: Parameters<typeof backupScheduleStatusLabel>[1] = 'completed';
  let actionLabel = '予定を維持';

  if (!normalizedPolicy.enabled) {
    status = 'attention';
    reason = 'disabled';
    actionLabel = '時刻を設定';
    requiredActions.push('閉店時バックアップ予定を有効にする');
  } else if (!latestBackup && !isDue) {
    status = 'pass';
    reason = 'before_due';
    actionLabel = '予定時刻待ち';
    requiredActions.push(`${normalizedPolicy.scheduledTime}以降にバックアップを書き出す`);
  } else if (!latestBackup) {
    status = 'blocked';
    reason = 'missing_backup';
    actionLabel = '今すぐ書き出し';
    requiredActions.push('今日のバックアップを書き出す');
  } else if (!encryptionOk) {
    status = 'attention';
    reason = 'unencrypted';
    actionLabel = '暗号化で再保存';
    requiredActions.push('パスワード暗号化を有効にして今日のバックアップを書き出す');
  } else if (!externalStorageOk) {
    status = 'attention';
    reason = 'external_waiting';
    actionLabel = '外部保存確認';
    requiredActions.push('今日のバックアップの外部保存確認を記録する');
  } else {
    status = 'pass';
    reason = 'completed';
    actionLabel = '本日分完了';
    requiredActions.push('明日の予定時刻まで維持する');
  }

  return {
    generatedAt: generatedAt.toISOString(),
    scheduledTime: normalizedPolicy.scheduledTime,
    dueAt: dueAt.toISOString(),
    dueAtLabel,
    isEnabled: normalizedPolicy.enabled,
    isDue,
    status,
    statusLabel: backupScheduleStatusLabel(status, reason),
    actionLabel,
    detail: `予定 ${dueAtLabel} / 最新バックアップ ${describeBackupRecord(latestBackup)} / 外部保存 ${describeExternalStorageRecord(latestExternalStorage)}`,
    requiredActions,
    latestBackup,
    latestExternalStorage
  };
}

export function buildBackupExternalStorageEvidence(
  input: BackupExternalStorageEvidenceInput
): BackupExternalStorageEvidence {
  const fileName = input.fileName.trim();
  const destinationName = input.destinationName.trim();
  const destinationPathOrUrl = input.destinationPathOrUrl.trim();
  const verifierName = input.verifierName.trim();
  const notes = input.notes?.trim();
  const requiredActions: string[] = [];

  if (!fileName) requiredActions.push('バックアップファイル名を入力する');
  if (!destinationName) requiredActions.push('外部保存先名を入力する');
  if (!destinationPathOrUrl) requiredActions.push('保存先パスまたはURLを入力する');
  if (!verifierName) requiredActions.push('確認者を入力する');
  if (!input.readBackVerified) requiredActions.push('保存先からバックアップを開けることを確認する');
  if (!input.immutableStorageVerified) requiredActions.push('上書き・削除不可の保存設定を確認する');

  const hasRequiredFields = Boolean(fileName && destinationName && destinationPathOrUrl && verifierName);
  const status: BackupRestoreDrillStatus = !hasRequiredFields
    ? 'blocked'
    : input.readBackVerified && input.immutableStorageVerified
      ? 'pass'
      : 'attention';

  return {
    fileName,
    destinationName,
    destinationPathOrUrl,
    verifierName,
    verifiedAt: (input.verifiedAt || new Date()).toISOString(),
    readBackVerified: input.readBackVerified,
    immutableStorageVerified: input.immutableStorageVerified,
    notes: notes || undefined,
    status,
    statusLabel: backupExternalStorageStatusLabel(status),
    requiredActions
  };
}

export function buildBackupExternalStorageAuditDetail(evidence: BackupExternalStorageEvidence): string {
  return [
    `バックアップ外部保存確認: ${evidence.fileName || 'ファイル名未入力'}`,
    `保存先 ${evidence.destinationName || '未入力'}`,
    `保存先パス ${evidence.destinationPathOrUrl || '未入力'}`,
    `読取 ${yesNoLabel(evidence.readBackVerified)}`,
    `上書き削除不可 ${yesNoLabel(evidence.immutableStorageVerified)}`,
    `確認者 ${evidence.verifierName || '未入力'}`,
    `確認日時 ${evidence.verifiedAt}`,
    `判定 ${evidence.statusLabel}`,
    ...(evidence.notes ? [`備考 ${evidence.notes}`] : [])
  ].join(' / ');
}

export function buildBackupExternalTransferManifest(
  input: BackupExternalTransferManifestInput
): BackupExternalTransferManifest {
  const fileName = input.fileName.trim();
  const destinationName = input.destinationName.trim();
  const destinationPathOrUrl = input.destinationPathOrUrl.trim();
  const notes = input.notes?.trim();
  const generatedAt = input.generatedAt || new Date();
  const requireEncrypted = input.requireEncrypted ?? true;
  const requireReadBack = input.requireReadBack ?? true;
  const requireImmutableStorage = input.requireImmutableStorage ?? true;
  const retentionDays = normalizeRetentionDays(input.retentionDays);
  const encrypted = isEncryptedBackup(input.payload);
  const requiredActions: string[] = [];

  if (!fileName) requiredActions.push('バックアップファイル名を入力する');
  if (!input.fileContent) requiredActions.push('バックアップJSON本文を指定する');
  if (!destinationName) requiredActions.push('外部保存先名を入力する');
  if (!destinationPathOrUrl) requiredActions.push('保存先パスまたはURLを入力する');
  if (requireEncrypted && !encrypted) {
    requiredActions.push('パスワード暗号化したバックアップで外部保存連携JSONを作成する');
  }
  if (requireReadBack) {
    requiredActions.push('外部保存ジョブの完了後、保存先からバックアップを開けることを確認する');
  }
  if (requireImmutableStorage) {
    requiredActions.push('外部保存ジョブの完了後、上書き・削除不可の保存設定を確認する');
  }

  const hasBlockingIssue = !fileName || !input.fileContent || !destinationName || !destinationPathOrUrl || (requireEncrypted && !encrypted);
  const status: BackupRestoreDrillStatus = hasBlockingIssue ? 'blocked' : 'pass';
  const nextActions = status === 'pass'
    ? [
      `外部保存ジョブで ${fileName} を保存し、SHA-256を照合する`,
      ...requiredActions
    ]
    : requiredActions;

  return {
    app: BACKUP_APP_ID,
    manifestVersion: BACKUP_EXTERNAL_TRANSFER_MANIFEST_VERSION,
    generatedAt: generatedAt.toISOString(),
    backupCreatedAt: input.payload.createdAt,
    backupFileName: fileName,
    backupSha256: CryptoJS.SHA256(input.fileContent).toString(CryptoJS.enc.Hex),
    backupSizeBytes: byteSize(input.fileContent),
    backupRowCount: backupPayloadRowCount(input.payload),
    encrypted,
    destinationName,
    destinationPathOrUrl,
    retentionDays,
    requireEncrypted,
    requireReadBack,
    requireImmutableStorage,
    status,
    statusLabel: backupExternalTransferStatusLabel(status),
    requiredActions: nextActions,
    notes: notes || undefined
  };
}

export function buildBackupExternalTransferManifestJson(manifest: BackupExternalTransferManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function makeBackupExternalTransferManifestFileName(
  backupFileName: string,
  date = new Date()
): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const timestamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
  return `${safeFileSegment(backupFileName)}_external_transfer_${timestamp}.json`;
}

export function buildBackupExternalTransferManifestAuditDetail(
  manifest: BackupExternalTransferManifest,
  manifestFileName = '外部保存連携JSON'
): string {
  return [
    `バックアップ外部保存連携JSON: ${manifestFileName}`,
    `対象 ${manifest.backupFileName || 'ファイル名未入力'}`,
    `SHA-256 ${manifest.backupSha256}`,
    `サイズ ${manifest.backupSizeBytes}B`,
    `暗号化 ${manifest.encrypted ? 'あり' : 'なし'}`,
    `保存先 ${manifest.destinationName || '未入力'}`,
    `保存先パス ${manifest.destinationPathOrUrl || '未入力'}`,
    `保持 ${manifest.retentionDays}日`,
    `判定 ${manifest.statusLabel}`
  ].join(' / ');
}

function cleanStringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanNumberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function cleanBooleanField(value: unknown): boolean {
  return value === true;
}

export function validateBackupExternalTransferReceipt(value: unknown): BackupExternalTransferReceiptValidationResult {
  if (!isRecord(value)) {
    return { ok: false, reason: '外部保存ジョブ受領書JSONの形式が不正です。' };
  }
  if (value.app !== BACKUP_APP_ID) {
    return { ok: false, reason: 'pharma-ossの外部保存ジョブ受領書ではありません。' };
  }
  if (value.receiptVersion !== BACKUP_EXTERNAL_TRANSFER_RECEIPT_VERSION) {
    return { ok: false, reason: '対応していない外部保存ジョブ受領書です。' };
  }

  const transferredAt = cleanStringField(value.transferredAt);
  if (!transferredAt || Number.isNaN(Date.parse(transferredAt))) {
    return { ok: false, reason: '外部保存ジョブの実行日時を確認できません。' };
  }

  const backupFileName = cleanStringField(value.backupFileName);
  if (!backupFileName) {
    return { ok: false, reason: '受領書にバックアップファイル名がありません。' };
  }

  const destinationName = cleanStringField(value.destinationName);
  if (!destinationName) {
    return { ok: false, reason: '受領書に保存先名がありません。' };
  }

  const destinationPathOrUrl = cleanStringField(value.destinationPathOrUrl);
  const destinationBackupPath = cleanStringField(value.destinationBackupPath);
  if (!destinationPathOrUrl && !destinationBackupPath) {
    return { ok: false, reason: '受領書に保存先パスがありません。' };
  }

  const backupSha256 = cleanStringField(value.backupSha256).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(backupSha256)) {
    return { ok: false, reason: '受領書のSHA-256が不正です。' };
  }

  const bytesCopied = cleanNumberField(value.bytesCopied);
  if (bytesCopied <= 0) {
    return { ok: false, reason: '受領書のコピーサイズを確認できません。' };
  }

  const requiredActions = Array.isArray(value.requiredActions)
    ? value.requiredActions.map(cleanStringField).filter(Boolean)
    : [];
  const immutableStorageVerified = cleanBooleanField(value.immutableStorageVerified);
  const readBackVerified = cleanBooleanField(value.readBackVerified);
  const status = immutableStorageVerified && readBackVerified ? 'pass' : 'attention';

  return {
    ok: true,
    receipt: {
      app: BACKUP_APP_ID,
      receiptVersion: BACKUP_EXTERNAL_TRANSFER_RECEIPT_VERSION,
      transferredAt,
      manifestFileName: cleanStringField(value.manifestFileName),
      backupFileName,
      sourceBackupPath: cleanStringField(value.sourceBackupPath),
      destinationName,
      destinationBackupPath,
      destinationPathOrUrl: destinationPathOrUrl || destinationBackupPath,
      backupSha256,
      bytesCopied,
      readBackVerified,
      immutableStorageVerified,
      retentionDays: normalizeRetentionDays(
        typeof value.retentionDays === 'number' ? value.retentionDays : undefined
      ),
      status,
      statusLabel: status === 'pass' ? '保存ジョブOK' : '保存完了・上書き削除不可確認待ち',
      requiredActions
    }
  };
}

export function buildBackupExternalStorageEvidenceFromTransferReceipt(
  receipt: BackupExternalTransferReceipt,
  verifierName = '外部保存ジョブ'
): BackupExternalStorageEvidence {
  return buildBackupExternalStorageEvidence({
    fileName: receipt.backupFileName,
    destinationName: receipt.destinationName,
    destinationPathOrUrl: receipt.destinationPathOrUrl || receipt.destinationBackupPath,
    verifierName,
    verifiedAt: new Date(receipt.transferredAt),
    readBackVerified: receipt.readBackVerified,
    immutableStorageVerified: receipt.immutableStorageVerified,
    notes: [
      `外部保存ジョブ受領書 ${receipt.manifestFileName || '受領書'}`,
      `SHA-256 ${receipt.backupSha256}`,
      `コピー ${receipt.bytesCopied}B`,
      `保持 ${receipt.retentionDays}日`,
      ...(receipt.requiredActions.length > 0 ? [`残対応 ${receipt.requiredActions.join(' / ')}`] : [])
    ].join(' / ')
  });
}

function parseBackupExportRecord(log: AuditLog): BackupGenerationRecord | null {
  if (log.actionType !== 'backup_export') return null;
  if (!log.details.includes('バックアップ書き出し:')) return null;
  const timestamp = new Date(log.timestamp);
  if (Number.isNaN(timestamp.getTime())) return null;

  const fileName = log.details.match(/バックアップ書き出し:\s*([^\s]+)\s+に/)?.[1] || '';
  const rowCountMatch = log.details.match(/に\s*(\d+)件のローカルデータ/);
  return {
    logId: log.logId,
    timestamp: log.timestamp,
    dateLabel: formatBackupAuditDate(timestamp),
    fileName,
    rowCount: rowCountMatch ? Number(rowCountMatch[1]) : undefined,
    isEncrypted: log.details.includes('暗号化')
  };
}

function parseBackupExternalStorageRecord(log: AuditLog): BackupExternalStorageRecord | null {
  if (log.actionType !== 'backup_external_storage') return null;
  if (!log.details.includes('バックアップ外部保存確認:')) return null;
  const timestamp = new Date(log.timestamp);
  if (Number.isNaN(timestamp.getTime())) return null;

  const segments = log.details.split(' / ');
  const firstSegment = segments[0] || '';
  const fileName = firstSegment.match(/バックアップ外部保存確認:\s*(.+)$/)?.[1]?.trim() || '';
  const field = (label: string) => {
    const segment = segments.find((candidate) => candidate.startsWith(`${label} `));
    return segment ? segment.slice(label.length + 1).trim() : '';
  };
  const statusLabel = field('判定') || '保存未確認';
  const status: BackupRestoreDrillStatus = statusLabel === '外部保存OK'
    ? 'pass'
    : statusLabel === '保存未確認'
      ? 'blocked'
      : 'attention';

  return {
    logId: log.logId,
    timestamp: log.timestamp,
    dateLabel: formatBackupAuditDate(timestamp),
    fileName,
    destinationName: field('保存先'),
    destinationPathOrUrl: field('保存先パス'),
    verifierName: field('確認者'),
    readBackVerified: field('読取') === '確認済み',
    immutableStorageVerified: field('上書き削除不可') === '確認済み',
    status,
    statusLabel
  };
}

function backupGenerationStatusLabel(status: BackupRestoreDrillStatus): string {
  if (status === 'pass') return '世代OK';
  if (status === 'attention') return '要確認';
  return '世代不足';
}

export function buildBackupGenerationReview(
  auditLogs: AuditLog[],
  generatedAt = new Date(),
  options: { retentionDays?: number; requiredGenerationCount?: number } = {}
): BackupGenerationReview {
  const retentionDays = options.retentionDays ?? 7;
  const requiredGenerationCount = options.requiredGenerationCount ?? 3;
  const cutoffTime = generatedAt.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const generations = auditLogs
    .map(parseBackupExportRecord)
    .filter((record): record is BackupGenerationRecord => Boolean(record))
    .filter((record) => new Date(record.timestamp).getTime() >= cutoffTime)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const encryptedGenerationCount = generations.filter((record) => record.isEncrypted).length;
  const latestBackup = generations.at(-1);
  const oldestBackup = generations[0];
  const latestDrillDate = latestAuditDate(auditLogs, 'backup_drill');
  const drillAgeDays = latestDrillDate ? ageDaysSince(latestDrillDate, generatedAt) : undefined;
  const latestExternalStorage = findLatestExternalStorageForBackup(auditLogs, latestBackup);
  const externalStorageAgeDays = latestExternalStorage
    ? ageDaysSince(new Date(latestExternalStorage.timestamp), generatedAt)
    : undefined;
  const hasRequiredGenerations = generations.length >= requiredGenerationCount;
  const allGenerationsEncrypted = generations.length > 0 && encryptedGenerationCount === generations.length;
  const hasRecentDrill = drillAgeDays !== undefined && drillAgeDays <= 30;
  const hasVerifiedExternalStorage = latestExternalStorage?.status === 'pass';
  const requiredActions: string[] = [];

  if (!hasRequiredGenerations) {
    requiredActions.push(`${retentionDays}日以内に${requiredGenerationCount}世代以上のバックアップを保存する`);
  }
  if (!allGenerationsEncrypted) {
    requiredActions.push('バックアップ書き出し時にパスワード暗号化を有効にする');
  }
  if (!hasRecentDrill) {
    requiredActions.push('30日以内の復旧テスト（訓練）を記録する');
  }
  if (latestBackup && !latestExternalStorage) {
    requiredActions.push('最新バックアップの外部保存確認を記録する');
  } else if (latestExternalStorage && latestExternalStorage.status !== 'pass') {
    requiredActions.push('外部保存先からの読み取りと上書き削除不可設定を確認する');
  }
  if (requiredActions.length === 0) {
    requiredActions.push('世代数と保存先を閉店時に確認する');
  }

  const status: BackupRestoreDrillStatus = generations.length === 0
    ? 'blocked'
    : hasRequiredGenerations && allGenerationsEncrypted && hasRecentDrill && hasVerifiedExternalStorage
      ? 'pass'
      : 'attention';
  const externalStorageStatus: BackupRestoreDrillStatus = !latestBackup || !latestExternalStorage
    ? 'blocked'
    : latestExternalStorage.status;

  return {
    generatedAt: generatedAt.toISOString(),
    retentionDays,
    requiredGenerationCount,
    generationCount: generations.length,
    encryptedGenerationCount,
    latestBackup,
    oldestBackup,
    latestDrillAt: latestDrillDate?.toISOString(),
    drillAgeDays,
    latestExternalStorage,
    externalStorageAgeDays,
    externalStorageStatus,
    externalStorageStatusLabel: backupExternalStorageStatusLabel(externalStorageStatus),
    status,
    statusLabel: backupGenerationStatusLabel(status),
    actionLabel: status === 'pass' ? '世代を維持' : '責任者確認',
    requiredActions,
    generations
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text.trimStart())) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildBackupGenerationReviewCsv(review: BackupGenerationReview): string {
  const rows = [
    ['区分', '項目', '値', '補足'],
    ['世代管理', '判定', review.statusLabel, review.actionLabel],
    ['世代管理', '対象期間', `${review.retentionDays}日`, `必要世代 ${review.requiredGenerationCount}世代`],
    ['世代管理', '保存世代数', `${review.generationCount}世代`, `暗号化 ${review.encryptedGenerationCount}世代`],
    ['世代管理', '最新バックアップ', review.latestBackup?.dateLabel || '未記録', review.latestBackup?.fileName || ''],
    ['世代管理', '最古バックアップ', review.oldestBackup?.dateLabel || '未記録', review.oldestBackup?.fileName || ''],
    ['復旧テスト', '最新記録', review.latestDrillAt || '未記録', review.drillAgeDays === undefined ? '' : `${review.drillAgeDays}日前`],
    ['外部保存', '最新確認', review.latestExternalStorage?.dateLabel || '未記録', review.latestExternalStorage ? `${review.latestExternalStorage.destinationName} / ${review.latestExternalStorage.statusLabel}` : '最新バックアップの確認なし'],
    ['外部保存', '確認内容', review.latestExternalStorage ? `読取 ${yesNoLabel(review.latestExternalStorage.readBackVerified)}` : '', review.latestExternalStorage ? `上書き削除不可 ${yesNoLabel(review.latestExternalStorage.immutableStorageVerified)} / 確認者 ${review.latestExternalStorage.verifierName}` : ''],
    ['対応', '必要な対応', review.requiredActions.join(' / '), '責任者確認事項'],
    ...review.generations.map((generation, index) => [
      '保存世代',
      `${index + 1}`,
      generation.fileName || generation.logId,
      [
        generation.dateLabel,
        generation.rowCount === undefined ? '件数未記録' : `${generation.rowCount}件`,
        generation.isEncrypted ? '暗号化あり' : '暗号化なし'
      ].join(' / ')
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildBackupContinuityReport(
  auditLogs: AuditLog[],
  generatedAt = new Date(),
  options: { schedulePolicy?: BackupSchedulePolicy } = {}
): BackupContinuityReport {
  const latestBackupDate = latestAuditDate(auditLogs, 'backup_export');
  const latestDrillDate = latestAuditDate(auditLogs, 'backup_drill');
  const latestBackup = auditLogs
    .map(parseBackupExportRecord)
    .filter((record): record is BackupGenerationRecord => Boolean(record))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .at(-1);
  const latestExternalStorage = findLatestExternalStorageForBackup(auditLogs, latestBackup);
  const backupAgeDays = latestBackupDate ? ageDaysSince(latestBackupDate, generatedAt) : undefined;
  const drillAgeDays = latestDrillDate ? ageDaysSince(latestDrillDate, generatedAt) : undefined;
  const externalStorageAgeDays = latestExternalStorage
    ? ageDaysSince(new Date(latestExternalStorage.timestamp), generatedAt)
    : undefined;
  const hasFreshBackup = backupAgeDays !== undefined && backupAgeDays <= 1;
  const hasUsableBackup = backupAgeDays !== undefined && backupAgeDays <= 7;
  const hasRecentDrill = drillAgeDays !== undefined && drillAgeDays <= 30;
  const hasVerifiedExternalStorage = latestExternalStorage?.status === 'pass';
  const status: BackupRestoreDrillStatus = !latestBackupDate || !hasUsableBackup
    ? 'blocked'
    : hasFreshBackup && hasRecentDrill && hasVerifiedExternalStorage
      ? 'pass'
      : 'attention';
  const backupLabel = latestBackupDate
    ? `${formatBackupAuditDate(latestBackupDate)}（${backupAgeDays}日前）`
    : '未記録';
  const drillLabel = latestDrillDate
    ? `${formatBackupAuditDate(latestDrillDate)}（${drillAgeDays}日前）`
    : '未記録';
  const externalStorageLabel = latestExternalStorage
    ? `${latestExternalStorage.dateLabel}（${externalStorageAgeDays}日前 / ${latestExternalStorage.statusLabel}）`
    : '未記録';
  const recommendation = status === 'pass'
    ? '閉店後の保存先確認のみ'
    : !latestBackupDate || !hasUsableBackup
      ? '直ちにバックアップを書き出してください'
      : !hasFreshBackup
        ? '本日分の暗号化バックアップを保存してください'
        : !hasRecentDrill
          ? '復旧テストを記録してください'
          : '外部保存確認を記録してください';

  const scheduleReview = options.schedulePolicy
    ? buildBackupScheduleReview(auditLogs, options.schedulePolicy, generatedAt)
    : undefined;
  const scheduleRecommendation = scheduleReview?.requiredActions[0] || scheduleReview?.actionLabel;

  return {
    generatedAt: generatedAt.toISOString(),
    latestBackupAt: latestBackupDate?.toISOString(),
    latestDrillAt: latestDrillDate?.toISOString(),
    latestExternalStorageAt: latestExternalStorage?.timestamp,
    backupAgeDays,
    drillAgeDays,
    externalStorageAgeDays,
    status: scheduleReview?.status || status,
    statusLabel: scheduleReview?.statusLabel || backupContinuityStatusLabel(status),
    detail: scheduleReview
      ? `${scheduleReview.detail} / 復旧テスト ${drillLabel}`
      : `バックアップ保存 ${backupLabel} / 復旧テスト ${drillLabel} / 外部保存 ${externalStorageLabel}`,
    recommendation: scheduleRecommendation || recommendation
  };
}
