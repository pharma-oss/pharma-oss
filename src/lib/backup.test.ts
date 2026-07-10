import { test } from 'node:test';
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import {
  BACKUP_APP_ID,
  BACKUP_COLLECTIONS,
  BACKUP_FORMAT_VERSION,
  countBackupRows,
  importDatabaseBackup,
  makeBackupFileName,
  validateBackupPayload,
  isEncryptedBackup,
  encryptBackupPayload,
  decryptBackupPayload,
  calculateBackupDiff,
  buildBackupMigrationDiagnosticReport,
  buildBackupRestoreDrillReport,
  buildBackupRestoreDrillAuditDetail,
  buildBackupContinuityReport,
  buildBackupGenerationReview,
  buildBackupGenerationReviewCsv,
  buildBackupExternalStorageEvidence,
  buildBackupExternalStorageAuditDetail,
  buildBackupExternalStorageEvidenceFromTransferReceipt,
  buildBackupExternalTransferManifest,
  buildBackupExternalTransferManifestAuditDetail,
  buildBackupExternalTransferManifestJson,
  buildBackupSchedulePolicyAuditDetail,
  buildBackupScheduleReview,
  makeBackupExternalTransferManifestFileName,
  normalizeBackupSchedulePolicy,
  validateBackupExternalTransferReceipt,
  type BackupPayload,
  type YakurekiBackup
} from './backup.ts';

test('makeBackupFileName creates a stable timestamped JSON name', () => {
  const date = new Date(2026, 5, 4, 9, 8, 7);
  assert.strictEqual(makeBackupFileName(date), 'yakureki_backup_20260604_090807.json');
});

test('validateBackupPayload accepts the current backup format', () => {
  const result = validateBackupPayload({
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: '2026-06-04T00:00:00.000Z',
    collections: {
      patients: [{ patientId: 'p1', name: '山田 太郎' }],
      audit_logs: [{ logId: 'log1', actionType: 'backup_export' }],
      unexpected_collection: [{ id: 'ignored' }]
    }
  });

  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.backup.collections.patients?.length, 1);
    assert.strictEqual((result.backup.collections as any).unexpected_collection, undefined);
  }
});

test('validateBackupPayload rejects invalid app and row shapes', () => {
  assert.deepStrictEqual(
    validateBackupPayload({
      app: 'another-app',
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAt: '2026-06-04T00:00:00.000Z',
      collections: {}
    }),
    { ok: false, reason: '薬歴アプリのバックアップファイルではありません。' }
  );

  const result = validateBackupPayload({
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: '2026-06-04T00:00:00.000Z',
    collections: {
      patients: ['not-a-row']
    }
  });

  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /不正なレコード/);
  }
});

test('countBackupRows counts only known backup collections', () => {
  const result = validateBackupPayload({
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: '2026-06-04T00:00:00.000Z',
    collections: {
      patients: [{ patientId: 'p1' }, { patientId: 'p2' }],
      visits: [{ visitId: 'v1' }],
      unknown: [{ id: 'u1' }, { id: 'u2' }]
    }
  });

  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(countBackupRows(result.backup), 3);
  }
});

test('isEncryptedBackup correctly identifies encrypted payloads', () => {
  assert.strictEqual(isEncryptedBackup(null), false);
  assert.strictEqual(isEncryptedBackup({ app: BACKUP_APP_ID }), false);
  assert.strictEqual(
    isEncryptedBackup({
      app: BACKUP_APP_ID,
      formatVersion: BACKUP_FORMAT_VERSION,
      encrypted: true,
      ciphertext: 'some-encrypted-text',
      createdAt: '2026-06-04T00:00:00.000Z'
    }),
    true
  );
});

test('encryptBackupPayload and decryptBackupPayload roundtrip with password', () => {
  const originalBackup: YakurekiBackup = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: '2026-06-04T00:00:00.000Z',
    collections: {
      patients: [{ patientId: 'p1', name: '山田 太郎' }]
    }
  };

  const password = 'secure-password123';
  const encrypted = encryptBackupPayload(originalBackup, password);

  assert.strictEqual(encrypted.encrypted, true);
  assert.ok(typeof encrypted.ciphertext === 'string');

  // Successful decryption
  const decrypted = decryptBackupPayload(encrypted, password);
  assert.deepStrictEqual(decrypted, originalBackup);

  // Failed decryption with bad password
  assert.throws(() => {
    decryptBackupPayload(encrypted, 'wrong-password');
  }, /復号に失敗しました/);
});

test('importDatabaseBackup rejects bulk upsert write errors', async () => {
  const backup: YakurekiBackup = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: '2026-06-04T00:00:00.000Z',
    collections: {
      patients: [{ patientId: 'p1', name: '山田 太郎' }]
    }
  };
  const db = Object.fromEntries(BACKUP_COLLECTIONS.map((collectionName) => [
    collectionName,
    {
      bulkUpsert: async () => ({ error: collectionName === 'patients' ? [new Error('write failed')] : [] })
    }
  ])) as any;

  await assert.rejects(
    () => importDatabaseBackup(db, backup),
    /patients の復旧で 1件の書き込みに失敗しました。/
  );
});

test('calculateBackupDiff computes diffs accurately', async () => {
  const originalBackup: YakurekiBackup = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: '2026-06-04T00:00:00.000Z',
    collections: {
      patients: [
        { patientId: 'p1', name: '山田 太郎' }, // Unchanged
        { patientId: 'p2', name: '佐藤 花子 (更新)' }, // Updated
        { patientId: 'p3', name: '新規 患者' } // Added
      ],
      visits: []
    }
  };

  const mockDb = {
    patients: {
      find: () => ({
        exec: async () => [
          { toJSON: () => ({ patientId: 'p1', name: '山田 太郎' }) },
          { toJSON: () => ({ patientId: 'p2', name: '佐藤 次郎' }) }
        ]
      })
    },
    visits: {
      find: () => ({
        exec: async () => []
      })
    },
    prescription_items: { find: () => ({ exec: async () => [] }) },
    soap_records: { find: () => ({ exec: async () => [] }) },
    alerts: { find: () => ({ exec: async () => [] }) },
    interventions: { find: () => ({ exec: async () => [] }) },
    drugs: { find: () => ({ exec: async () => [] }) },
    drug_stocks: { find: () => ({ exec: async () => [] }) },
    locations: { find: () => ({ exec: async () => [] }) },
    facility_settings: { find: () => ({ exec: async () => [] }) },
    medication_guidances: { find: () => ({ exec: async () => [] }) },
    patient_medication_info_templates: { find: () => ({ exec: async () => [] }) },
    users: { find: () => ({ exec: async () => [] }) },
    audit_logs: { find: () => ({ exec: async () => [] }) }
  } as any;

  const diffs = await calculateBackupDiff(mockDb, originalBackup);
  
  const patientDiff = diffs.find(d => d.collection === 'patients');
  assert.ok(patientDiff);
  assert.strictEqual(patientDiff.added, 1);     // p3
  assert.strictEqual(patientDiff.updated, 1);   // p2
  assert.strictEqual(patientDiff.unchanged, 1); // p1

  const visitDiff = diffs.find(d => d.collection === 'visits');
  assert.ok(visitDiff);
  assert.strictEqual(visitDiff.added, 0);
  assert.strictEqual(visitDiff.updated, 0);
  assert.strictEqual(visitDiff.unchanged, 0);
});

test('buildBackupRestoreDrillReport summarizes restore readiness without importing data', () => {
  const backup: YakurekiBackup = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: '2026-06-04T00:00:00.000Z',
    collections: {
      facility_settings: [{ id: 'default' }],
      patients: [{ patientId: 'p1' }],
      visits: [{ visitId: 'v1' }],
      users: [{ userId: 'admin_1' }],
      audit_logs: [{ logId: 'log1', actionType: 'backup_export' }]
    }
  };

  const report = buildBackupRestoreDrillReport(backup, [
    { collection: 'facility_settings', added: 0, updated: 0, unchanged: 1 },
    { collection: 'patients', added: 1, updated: 0, unchanged: 0 },
    { collection: 'visits', added: 0, updated: 1, unchanged: 0 },
    { collection: 'prescription_items', added: 0, updated: 0, unchanged: 0 },
    { collection: 'soap_records', added: 0, updated: 0, unchanged: 0 },
    { collection: 'alerts', added: 0, updated: 0, unchanged: 0 },
    { collection: 'interventions', added: 0, updated: 0, unchanged: 0 },
    { collection: 'drugs', added: 0, updated: 0, unchanged: 0 },
    { collection: 'drug_stocks', added: 0, updated: 0, unchanged: 0 },
    { collection: 'locations', added: 0, updated: 0, unchanged: 0 },
    { collection: 'medication_guidances', added: 0, updated: 0, unchanged: 0 },
    { collection: 'patient_medication_info_templates', added: 0, updated: 0, unchanged: 0 },
    { collection: 'users', added: 0, updated: 0, unchanged: 1 },
    { collection: 'audit_logs', added: 0, updated: 0, unchanged: 1 }
  ], new Date('2026-06-04T01:00:00.000Z'));

  assert.strictEqual(report.statusLabel, 'テストOK');
  assert.strictEqual(report.totalRows, 5);
  assert.strictEqual(report.collectionCount, 5);
  assert.deepStrictEqual(report.diffSummary, { added: 1, updated: 1, unchanged: 3 });
  assert.ok(report.checks.every((check) => check.status === 'pass'));
  assert.match(buildBackupRestoreDrillAuditDetail(report, 'sample.json'), /復旧テスト（訓練）: sample\.json/);
  assert.match(buildBackupRestoreDrillAuditDetail(report, 'sample.json'), /判定 テストOK/);
  assert.match(buildBackupRestoreDrillAuditDetail(report, 'sample.json'), /移行診断 移行OK/);
});

test('buildBackupMigrationDiagnosticReport detects duplicate IDs, missing keys, and mojibake suspects', () => {
  const backup: YakurekiBackup = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: '2026-06-04T00:00:00.000Z',
    collections: {
      facility_settings: [{ id: 'default' }],
      users: [{ userId: 'admin_1', name: '管理者' }],
      audit_logs: [{ logId: 'log1', actionType: 'backup_export' }],
      patients: [
        { patientId: 'p1', name: '山田 太郎' },
        { patientId: 'p1', name: '重複 患者' },
        { name: 'IDなし 患者' },
        { patientId: 'p4', name: '譁ｰ螳ｿ 薬局' }
      ]
    }
  };

  const report = buildBackupMigrationDiagnosticReport(backup, new Date('2026-06-04T01:00:00.000Z'));

  assert.strictEqual(report.statusLabel, '移行不可');
  assert.strictEqual(report.missingPrimaryKeyCount, 1);
  assert.strictEqual(report.duplicatePrimaryKeyCount, 1);
  assert.strictEqual(report.mojibakeSuspectCount, 1);
  assert.strictEqual(report.missingRequiredCollectionCount, 0);
  assert.ok(report.issues.some((issue) => issue.label === 'ID欠落' && issue.collection === 'patients'));
  assert.ok(report.issues.some((issue) => issue.label === '同一ID重複' && issue.primaryKey === 'p1'));
  assert.ok(report.issues.some((issue) => issue.label === '文字化け疑い'));
  assert.ok(report.requiredActions.some((action) => action.includes('ID欠落')));
});

test('buildBackupMigrationDiagnosticReport passes complete migration payloads', () => {
  const backup: YakurekiBackup = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: '2026-06-04T00:00:00.000Z',
    collections: {
      facility_settings: [{ id: 'default' }],
      users: [{ userId: 'admin_1', name: '管理者' }],
      audit_logs: [{ logId: 'log1', actionType: 'backup_export' }],
      patients: [{ patientId: 'p1', name: '山田 太郎' }],
      visits: [{ visitId: 'v1', patientId: 'p1' }]
    }
  };

  const report = buildBackupMigrationDiagnosticReport(backup, new Date('2026-06-04T01:00:00.000Z'));

  assert.strictEqual(report.statusLabel, '移行OK');
  assert.strictEqual(report.actionLabel, '移行可能');
  assert.strictEqual(report.issues.length, 0);
});

test('buildBackupRestoreDrillReport warns for partial backups and blocks empty backups', () => {
  const partialBackup: YakurekiBackup = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: '2026-06-04T00:00:00.000Z',
    collections: {
      patients: [{ patientId: 'p1' }]
    }
  };

  const partialReport = buildBackupRestoreDrillReport(partialBackup, [
    { collection: 'patients', added: 1, updated: 0, unchanged: 0 }
  ]);

  assert.strictEqual(partialReport.statusLabel, '要確認');
  assert.ok(partialReport.checks.some((check) => check.id === 'audit_logs' && check.status === 'attention'));
  assert.ok(partialReport.checks.some((check) => check.id === 'diff_preview' && check.status === 'attention'));

  const emptyReport = buildBackupRestoreDrillReport({
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: '2026-06-04T00:00:00.000Z',
    collections: {}
  }, []);

  assert.strictEqual(emptyReport.statusLabel, '復旧不可');
  assert.ok(emptyReport.checks.some((check) => check.id === 'backup_rows' && check.status === 'blocked'));
});

test('buildBackupExternalStorageEvidence records external backup custody checks', () => {
  const evidence = buildBackupExternalStorageEvidence({
    fileName: 'yakureki_backup_20260615_200000.json',
    destinationName: '店舗バックアップ保管庫',
    destinationPathOrUrl: 's3://pharmacy-backup/yakureki/',
    verifierName: '管理者',
    verifiedAt: new Date('2026-06-15T20:30:00.000Z'),
    readBackVerified: true,
    immutableStorageVerified: true,
    notes: 'オブジェクトロック30日'
  });
  const detail = buildBackupExternalStorageAuditDetail(evidence);

  assert.strictEqual(evidence.statusLabel, '外部保存OK');
  assert.deepStrictEqual(evidence.requiredActions, []);
  assert.match(detail, /バックアップ外部保存確認: yakureki_backup_20260615_200000\.json/);
  assert.match(detail, /保存先 店舗バックアップ保管庫/);
  assert.match(detail, /読取 確認済み/);
  assert.match(detail, /上書き削除不可 確認済み/);
  assert.match(detail, /判定 外部保存OK/);
});

test('buildBackupExternalStorageEvidence blocks missing custody fields', () => {
  const evidence = buildBackupExternalStorageEvidence({
    fileName: '',
    destinationName: '',
    destinationPathOrUrl: '',
    verifierName: '',
    readBackVerified: false,
    immutableStorageVerified: false
  });

  assert.strictEqual(evidence.statusLabel, '保存未確認');
  assert.ok(evidence.requiredActions.some((action) => action.includes('バックアップファイル名')));
  assert.ok(evidence.requiredActions.some((action) => action.includes('外部保存先名')));
  assert.ok(evidence.requiredActions.some((action) => action.includes('上書き・削除不可')));
});

test('buildBackupExternalTransferManifest records checksum and external job instructions', () => {
  const payload: BackupPayload = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    encrypted: true as const,
    ciphertext: 'encrypted-backup-json',
    createdAt: '2026-06-15T20:00:00.000Z'
  };
  const fileContent = JSON.stringify(payload, null, 2);
  const manifest = buildBackupExternalTransferManifest({
    fileName: 'yakureki_backup_20260615_200000.json',
    fileContent,
    payload,
    destinationName: '店舗バックアップWORM',
    destinationPathOrUrl: 's3://pharmacy-backup/yakureki/',
    retentionDays: 30,
    generatedAt: new Date(2026, 5, 15, 20, 5, 0),
    notes: 'オブジェクトロック30日'
  });
  const manifestJson = buildBackupExternalTransferManifestJson(manifest);
  const auditDetail = buildBackupExternalTransferManifestAuditDetail(
    manifest,
    'yakureki_backup_20260615_200000_external_transfer_20260615_200500.json'
  );

  assert.strictEqual(manifest.statusLabel, '連携準備OK');
  assert.strictEqual(manifest.backupFileName, 'yakureki_backup_20260615_200000.json');
  assert.strictEqual(manifest.encrypted, true);
  assert.strictEqual(manifest.retentionDays, 30);
  assert.strictEqual(manifest.backupSha256, createHash('sha256').update(fileContent).digest('hex'));
  assert.ok(manifest.requiredActions.some((action) => action.includes('SHA-256を照合')));
  assert.match(manifestJson, /"backupSha256"/);
  assert.match(auditDetail, /バックアップ外部保存連携JSON/);
  assert.match(auditDetail, /SHA-256 [0-9a-f]{64}/);
  assert.strictEqual(
    makeBackupExternalTransferManifestFileName(
      'yakureki_backup_20260615_200000.json',
      new Date(2026, 5, 15, 20, 5, 0)
    ),
    'yakureki_backup_20260615_200000_external_transfer_20260615_200500.json'
  );
});

test('buildBackupExternalTransferManifest blocks plaintext or missing destination manifests', () => {
  const plainBackup: YakurekiBackup = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: '2026-06-15T20:00:00.000Z',
    collections: {
      patients: [{ patientId: 'p1', name: '山田 太郎' }]
    }
  };
  const manifest = buildBackupExternalTransferManifest({
    fileName: 'yakureki_backup_20260615_200000.json',
    fileContent: JSON.stringify(plainBackup),
    payload: plainBackup,
    destinationName: '',
    destinationPathOrUrl: ''
  });

  assert.strictEqual(manifest.statusLabel, '連携不可');
  assert.strictEqual(manifest.encrypted, false);
  assert.strictEqual(manifest.backupRowCount, 1);
  assert.ok(manifest.requiredActions.some((action) => action.includes('外部保存先名')));
  assert.ok(manifest.requiredActions.some((action) => action.includes('パスワード暗号化')));
});

test('backup external transfer receipt converts to external storage audit evidence', () => {
  const receipt = {
    app: BACKUP_APP_ID,
    receiptVersion: 1,
    transferredAt: '2026-06-15T20:10:00.000Z',
    manifestFileName: 'yakureki_backup_20260615_200000_external_transfer.json',
    backupFileName: 'yakureki_backup_20260615_200000.json',
    sourceBackupPath: '/tmp/source/yakureki_backup_20260615_200000.json',
    destinationName: '店舗バックアップWORM',
    destinationBackupPath: '/mnt/worm/yakureki_backup_20260615_200000.json',
    destinationPathOrUrl: '/mnt/worm',
    backupSha256: 'a'.repeat(64),
    bytesCopied: 1234,
    readBackVerified: true,
    immutableStorageVerified: true,
    retentionDays: 30,
    status: 'pass',
    statusLabel: '保存ジョブOK',
    requiredActions: ['外部保存確認をpharma-ossの監査ログに記録する']
  };
  const validation = validateBackupExternalTransferReceipt(receipt);

  assert.strictEqual(validation.ok, true);
  if (!validation.ok) return;

  const evidence = buildBackupExternalStorageEvidenceFromTransferReceipt(validation.receipt);
  const auditDetail = buildBackupExternalStorageAuditDetail(evidence);

  assert.strictEqual(evidence.statusLabel, '外部保存OK');
  assert.strictEqual(evidence.fileName, 'yakureki_backup_20260615_200000.json');
  assert.strictEqual(evidence.destinationName, '店舗バックアップWORM');
  assert.strictEqual(evidence.readBackVerified, true);
  assert.strictEqual(evidence.immutableStorageVerified, true);
  assert.match(evidence.notes || '', /外部保存ジョブ受領書/);
  assert.match(evidence.notes || '', /SHA-256 a{64}/);
  assert.match(auditDetail, /判定 外部保存OK/);
});

test('backup external transfer receipt validation rejects unsafe or incomplete receipts', () => {
  assert.deepStrictEqual(
    validateBackupExternalTransferReceipt({
      app: BACKUP_APP_ID,
      receiptVersion: 1,
      transferredAt: '2026-06-15T20:10:00.000Z',
      backupFileName: 'yakureki_backup.json',
      destinationName: '店舗バックアップWORM',
      destinationPathOrUrl: '/mnt/worm',
      backupSha256: 'bad-hash',
      bytesCopied: 1234,
      readBackVerified: true,
      immutableStorageVerified: true
    }),
    { ok: false, reason: '受領書のSHA-256が不正です。' }
  );

  assert.deepStrictEqual(
    validateBackupExternalTransferReceipt({
      app: 'other',
      receiptVersion: 1
    }),
    { ok: false, reason: 'pharma-ossの外部保存ジョブ受領書ではありません。' }
  );
});

test('buildBackupContinuityReport summarizes latest backup and restore drill audit logs', () => {
  const report = buildBackupContinuityReport([
    {
      logId: 'backup_1',
      timestamp: '2026-06-15T10:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_export',
      details: 'バックアップ書き出し: yakureki_backup_20260615_100000.json に 100件のローカルデータを書き出しました。（パスワード暗号化保護）'
    },
    {
      logId: 'drill_1',
      timestamp: '2026-06-10T10:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_drill',
      details: '復旧テスト'
    },
    {
      logId: 'external_1',
      timestamp: '2026-06-15T10:30:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_external_storage',
      details: 'バックアップ外部保存確認: yakureki_backup_20260615_100000.json / 保存先 店舗バックアップ保管庫 / 保存先パス s3://pharmacy-backup/yakureki/ / 読取 確認済み / 上書き削除不可 確認済み / 確認者 管理者 / 確認日時 2026-06-15T10:30:00.000Z / 判定 外部保存OK'
    }
  ], new Date('2026-06-15T20:00:00.000Z'));

  assert.strictEqual(report.statusLabel, '良好');
  assert.strictEqual(report.backupAgeDays, 0);
  assert.strictEqual(report.drillAgeDays, 5);
  assert.strictEqual(report.externalStorageAgeDays, 0);
  assert.match(report.detail, /バックアップ保存/);
  assert.match(report.detail, /復旧テスト/);
  assert.match(report.detail, /外部保存/);
  assert.strictEqual(report.recommendation, '閉店後の保存先確認のみ');
});

test('buildBackupContinuityReport escalates stale or missing backup evidence', () => {
  const staleBackup = buildBackupContinuityReport([
    {
      logId: 'backup_1',
      timestamp: '2026-06-10T10:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_export',
      details: 'バックアップ書き出し'
    }
  ], new Date('2026-06-15T20:00:00.000Z'));

  assert.strictEqual(staleBackup.statusLabel, '要確認');
  assert.strictEqual(staleBackup.recommendation, '本日分の暗号化バックアップを保存してください');

  const missingBackup = buildBackupContinuityReport([], new Date('2026-06-15T20:00:00.000Z'));

  assert.strictEqual(missingBackup.statusLabel, '未実施');
  assert.strictEqual(missingBackup.recommendation, '直ちにバックアップを書き出してください');
});

test('normalizeBackupSchedulePolicy falls back to safe daily backup defaults', () => {
  const policy = normalizeBackupSchedulePolicy({
    enabled: false,
    scheduledTime: '99:99',
    requireEncrypted: false,
    requireExternalStorage: false
  });
  const detail = buildBackupSchedulePolicyAuditDetail(policy);

  assert.strictEqual(policy.enabled, false);
  assert.strictEqual(policy.scheduledTime, '20:00');
  assert.strictEqual(policy.requireEncrypted, false);
  assert.strictEqual(policy.requireExternalStorage, false);
  assert.match(detail, /予定時刻 20:00/);
  assert.match(detail, /外部保存 任意/);
});

test('buildBackupScheduleReview waits before the scheduled time and blocks after it', () => {
  const beforeDue = buildBackupScheduleReview([], {
    enabled: true,
    scheduledTime: '20:00',
    requireEncrypted: true,
    requireExternalStorage: true
  }, new Date('2026-06-15T19:30:00+09:00'));
  const afterDue = buildBackupScheduleReview([], {
    enabled: true,
    scheduledTime: '20:00',
    requireEncrypted: true,
    requireExternalStorage: true
  }, new Date('2026-06-15T20:30:00+09:00'));

  assert.strictEqual(beforeDue.statusLabel, '予定前');
  assert.strictEqual(beforeDue.actionLabel, '予定時刻待ち');
  assert.ok(beforeDue.requiredActions.some((action) => action.includes('20:00以降')));
  assert.strictEqual(afterDue.statusLabel, '未実施');
  assert.strictEqual(afterDue.actionLabel, '今すぐ書き出し');
  assert.ok(afterDue.requiredActions.some((action) => action.includes('今日のバックアップ')));
});

test('buildBackupScheduleReview requires encrypted backup and external storage for today', () => {
  const logs = [
    {
      logId: 'backup_1',
      timestamp: '2026-06-15T20:05:00+09:00',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_export',
      details: 'バックアップ書き出し: yakureki_backup_20260615_200500.json に 120件のローカルデータを書き出しました。（パスワード暗号化保護）'
    },
    {
      logId: 'external_1',
      timestamp: '2026-06-15T20:10:00+09:00',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_external_storage',
      details: 'バックアップ外部保存確認: yakureki_backup_20260615_200500.json / 保存先 店舗バックアップ保管庫 / 保存先パス s3://pharmacy-backup/yakureki/ / 読取 確認済み / 上書き削除不可 確認済み / 確認者 管理者 / 確認日時 2026-06-15T20:10:00+09:00 / 判定 外部保存OK'
    }
  ] as any;

  const review = buildBackupScheduleReview(logs, {
    enabled: true,
    scheduledTime: '20:00',
    requireEncrypted: true,
    requireExternalStorage: true
  }, new Date('2026-06-15T20:30:00+09:00'));

  assert.strictEqual(review.statusLabel, '本日済み');
  assert.strictEqual(review.actionLabel, '本日分完了');
  assert.strictEqual(review.latestBackup?.fileName, 'yakureki_backup_20260615_200500.json');
  assert.strictEqual(review.latestExternalStorage?.statusLabel, '外部保存OK');
  assert.match(review.detail, /予定/);
  assert.match(review.detail, /外部保存/);
});

test('buildBackupContinuityReport can use the closing-time backup schedule', () => {
  const report = buildBackupContinuityReport([], new Date('2026-06-15T20:30:00+09:00'), {
    schedulePolicy: {
      enabled: true,
      scheduledTime: '20:00',
      requireEncrypted: true,
      requireExternalStorage: true
    }
  });

  assert.strictEqual(report.statusLabel, '未実施');
  assert.strictEqual(report.recommendation, '今日のバックアップを書き出す');
  assert.match(report.detail, /予定/);
});

test('buildBackupGenerationReview confirms encrypted backup generations and recent drill', () => {
  const logs = [
    {
      logId: 'backup_1',
      timestamp: '2026-06-12T20:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_export',
      details: 'バックアップ書き出し: yakureki_backup_20260612_200000.json に 100件のローカルデータを書き出しました。（パスワード暗号化保護）'
    },
    {
      logId: 'backup_2',
      timestamp: '2026-06-13T20:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_export',
      details: 'バックアップ書き出し: yakureki_backup_20260613_200000.json に 110件のローカルデータを書き出しました。（パスワード暗号化保護）'
    },
    {
      logId: 'backup_3',
      timestamp: '2026-06-14T20:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_export',
      details: 'バックアップ書き出し: yakureki_backup_20260614_200000.json に 120件のローカルデータを書き出しました。（パスワード暗号化保護）'
    },
    {
      logId: 'drill_1',
      timestamp: '2026-06-10T20:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_drill',
      details: '復旧テスト（訓練）'
    },
    {
      logId: 'external_1',
      timestamp: '2026-06-14T20:10:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_external_storage',
      details: 'バックアップ外部保存確認: yakureki_backup_20260614_200000.json / 保存先 店舗バックアップ保管庫 / 保存先パス s3://pharmacy-backup/yakureki/ / 読取 確認済み / 上書き削除不可 確認済み / 確認者 管理者 / 確認日時 2026-06-14T20:10:00.000Z / 判定 外部保存OK'
    }
  ] as any;

  const review = buildBackupGenerationReview(logs, new Date('2026-06-15T20:00:00.000Z'));
  const csv = buildBackupGenerationReviewCsv(review);

  assert.strictEqual(review.statusLabel, '世代OK');
  assert.strictEqual(review.generationCount, 3);
  assert.strictEqual(review.encryptedGenerationCount, 3);
  assert.strictEqual(review.latestBackup?.fileName, 'yakureki_backup_20260614_200000.json');
  assert.strictEqual(review.drillAgeDays, 5);
  assert.strictEqual(review.externalStorageStatusLabel, '外部保存OK');
  assert.strictEqual(review.latestExternalStorage?.destinationName, '店舗バックアップ保管庫');
  assert.match(csv, /"世代管理","保存世代数","3世代","暗号化 3世代"/);
  assert.match(csv, /"外部保存","最新確認".*"店舗バックアップ保管庫 \/ 外部保存OK"/);
  assert.match(csv, /"保存世代","3","yakureki_backup_20260614_200000\.json"/);
});

test('buildBackupGenerationReview flags missing generations and unencrypted backups', () => {
  const logs = [
    {
      logId: 'backup_1',
      timestamp: '2026-06-14T20:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_export',
      details: 'バックアップ書き出し: yakureki_backup_20260614_200000.json に 120件のローカルデータを書き出しました。'
    },
    {
      logId: 'older_backup',
      timestamp: '2026-05-01T20:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_export',
      details: 'バックアップ書き出し: yakureki_backup_20260501_200000.json に 90件のローカルデータを書き出しました。（パスワード暗号化保護）'
    }
  ] as any;

  const review = buildBackupGenerationReview(logs, new Date('2026-06-15T20:00:00.000Z'));

  assert.strictEqual(review.statusLabel, '要確認');
  assert.strictEqual(review.generationCount, 1);
  assert.strictEqual(review.encryptedGenerationCount, 0);
  assert.ok(review.requiredActions.some((action) => action.includes('3世代以上')));
  assert.ok(review.requiredActions.some((action) => action.includes('パスワード暗号化')));
  assert.ok(review.requiredActions.some((action) => action.includes('復旧テスト')));
  assert.ok(review.requiredActions.some((action) => action.includes('外部保存確認')));
});

test('buildBackupGenerationReview requires external storage evidence for latest backup', () => {
  const logs = [
    {
      logId: 'backup_1',
      timestamp: '2026-06-12T20:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_export',
      details: 'バックアップ書き出し: yakureki_backup_20260612_200000.json に 100件のローカルデータを書き出しました。（パスワード暗号化保護）'
    },
    {
      logId: 'backup_2',
      timestamp: '2026-06-13T20:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_export',
      details: 'バックアップ書き出し: yakureki_backup_20260613_200000.json に 110件のローカルデータを書き出しました。（パスワード暗号化保護）'
    },
    {
      logId: 'backup_3',
      timestamp: '2026-06-14T20:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_export',
      details: 'バックアップ書き出し: yakureki_backup_20260614_200000.json に 120件のローカルデータを書き出しました。（パスワード暗号化保護）'
    },
    {
      logId: 'drill_1',
      timestamp: '2026-06-10T20:00:00.000Z',
      userId: 'admin_1',
      userName: '管理者',
      userRole: 'admin',
      actionType: 'backup_drill',
      details: '復旧テスト（訓練）'
    }
  ] as any;

  const review = buildBackupGenerationReview(logs, new Date('2026-06-15T20:00:00.000Z'));

  assert.strictEqual(review.statusLabel, '要確認');
  assert.strictEqual(review.externalStorageStatusLabel, '保存未確認');
  assert.ok(review.requiredActions.some((action) => action.includes('外部保存確認')));
});
