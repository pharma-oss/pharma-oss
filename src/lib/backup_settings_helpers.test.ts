import { test } from 'node:test';
import assert from 'node:assert';
import encoding from 'encoding-japanese';
import {
  buildBackupScheduleReviewState,
  buildMigrationCsvPreview,
  decodeMigrationCsvBytes,
  describeMigrationPreviewResult,
  getMigrationCsvLabel,
  type MigrationCsvPreview,
  getBackupGenerationReviewDisplay,
  getBackupScheduleReviewDisplay,
  getBackupDrillStatusStyle
} from './backup_settings_helpers.ts';
import {
  DEFAULT_BACKUP_SCHEDULE_POLICY,
  buildBackupGenerationReview,
  type BackupGenerationReview,
  type BackupSchedulePolicy,
  type BackupScheduleReview
} from './backup.ts';
import type { AuditLog } from '../db/types.ts';

test('getBackupGenerationReviewDisplay formats good, attention, and missing status with labels', () => {
  // 1. Pass status
  const goodReview: BackupGenerationReview = {
    monthKey: '2026-08',
    monthLabel: '2026年08月',
    generatedAt: '2026-08-22T00:00:00.000Z',
    status: 'pass',
    statusLabel: '正常',
    latestBackup: {
      dateLabel: '2026/08/20',
      fileName: 'backup_20260820.json'
    },
    latestDrillAt: '2026/08/15',
    latestExternalStorage: {
      dateLabel: '2026/08/21',
      destinationName: 'S3-WORM'
    }
  } as any;
  const goodDisplay = getBackupGenerationReviewDisplay(goodReview);
  assert.strictEqual(goodDisplay.color, '#15803d');
  assert.strictEqual(goodDisplay.background, '#f0fdf4');
  assert.strictEqual(goodDisplay.latestBackupGenerationLabel, '2026/08/20 backup_20260820.json');
  assert.strictEqual(goodDisplay.latestBackupDrillLabel, '2026/08/15 実施済み');
  assert.strictEqual(goodDisplay.latestBackupExternalStorageLabel, '2026/08/21 S3-WORM');

  // 2. Missing data / empty
  const emptyReview: BackupGenerationReview = {
    monthKey: '2026-08',
    monthLabel: '2026年08月',
    generatedAt: '2026-08-22T00:00:00.000Z',
    status: 'attention',
    statusLabel: '要確認'
  } as any;
  const emptyDisplay = getBackupGenerationReviewDisplay(emptyReview);
  assert.strictEqual(emptyDisplay.color, '#b45309');
  assert.strictEqual(emptyDisplay.background, '#fffbeb');
  assert.strictEqual(emptyDisplay.latestBackupGenerationLabel, '未出力');
  assert.strictEqual(emptyDisplay.latestBackupDrillLabel, '未実施');
  assert.strictEqual(emptyDisplay.latestBackupExternalStorageLabel, '未確認');
});

test('getBackupScheduleReviewDisplay returns colors for configured and unconfigured states', () => {
  const configuredReview: BackupScheduleReview = {
    status: 'pass',
    statusLabel: '設定済み'
  } as any;
  const configuredDisplay = getBackupScheduleReviewDisplay(configuredReview);
  assert.strictEqual(configuredDisplay.color, '#15803d');
  assert.strictEqual(configuredDisplay.background, '#f0fdf4');

  const attentionReview: BackupScheduleReview = {
    status: 'attention',
    statusLabel: '注意'
  } as any;
  const attentionDisplay = getBackupScheduleReviewDisplay(attentionReview);
  assert.strictEqual(attentionDisplay.color, '#b45309');
  assert.strictEqual(attentionDisplay.background, '#fffbeb');
});

test('getBackupDrillStatusStyle provides CSS badge styling for pass, attention, and blocked', () => {
  const passStyle = getBackupDrillStatusStyle('pass');
  assert.strictEqual(passStyle.color, '#15803d');
  assert.strictEqual(passStyle.background, '#f0fdf4');

  const attentionStyle = getBackupDrillStatusStyle('attention');
  assert.strictEqual(attentionStyle.color, '#b45309');
  assert.strictEqual(attentionStyle.background, '#fffbeb');

  const blockedStyle = getBackupDrillStatusStyle('blocked');
  assert.strictEqual(blockedStyle.color, '#b91c1c');
  assert.strictEqual(blockedStyle.background, '#fef2f2');
});

// ---- buildBackupScheduleReviewState: 設定画面「閉店時バックアップ予定」の点検 ----
// 過去にフックが「世代管理の点検」を as any で流用し、予定時刻・詳細文が空になっていた。
// 本物のビルダーを通して、予定点検が policy から導かれることを固定する。

const policy = (overrides: Partial<BackupSchedulePolicy> = {}): BackupSchedulePolicy => ({
  ...DEFAULT_BACKUP_SCHEDULE_POLICY,
  scheduledTime: '20:00',
  ...overrides
});

// TZ=Asia/Tokyo(npm test)。ローカル時刻で組み立てる。
const at = (hour: number, minute = 0) => new Date(2026, 9, 7, hour, minute, 0);

function auditLog(overrides: Partial<AuditLog>): AuditLog {
  return {
    logId: 'log-1',
    timestamp: at(18).toISOString(),
    userId: 'u1',
    userName: '管理者',
    userRole: 'admin',
    actionType: 'backup_export',
    details: '',
    ...overrides
  } as AuditLog;
}

const backupExportLog = (when: Date, encrypted: boolean): AuditLog => auditLog({
  logId: `export-${when.getTime()}`,
  timestamp: when.toISOString(),
  actionType: 'backup_export',
  details: `バックアップ書き出し: yakureki_backup_20261007.json に 120件のローカルデータを書き出しました。${encrypted ? '（パスワード暗号化保護）' : ''}`
});

test('buildBackupScheduleReviewState reviews the schedule policy, not the generation history', () => {
  const state = buildBackupScheduleReviewState([], policy({ scheduledTime: '22:30' }), at(10));

  // 設定タブが描画する項目はすべてスケジュール点検の値でなければならない
  assert.equal(state.review.scheduledTime, '22:30');
  assert.equal(state.review.isDue, false);
  assert.equal(state.review.isEnabled, true);
  assert.equal(state.review.actionLabel, '予定時刻待ち');
  assert.match(state.review.detail, /^予定 .*22:30.* \/ 最新バックアップ .* \/ 外部保存 /);
  assert.deepEqual(state.review.requiredActions, ['22:30以降にバックアップを書き出す']);

  // 世代管理の点検は別の形をしており、これらのフィールドを持たない(as any で取り違えると空欄になる)
  const generationReview = buildBackupGenerationReview([], at(10)) as unknown as Record<string, unknown>;
  assert.equal(generationReview.scheduledTime, undefined);
  assert.equal(generationReview.detail, undefined);
});

test('buildBackupScheduleReviewState turns blocked (red) once the scheduled time has passed without a backup today', () => {
  const state = buildBackupScheduleReviewState([], policy({ scheduledTime: '20:00' }), at(21));

  assert.equal(state.review.isDue, true);
  assert.equal(state.review.status, 'blocked');
  assert.equal(state.review.actionLabel, '今すぐ書き出し');
  assert.deepEqual(state.review.requiredActions, ['今日のバックアップを書き出す']);
  assert.equal(state.color, '#b91c1c');
  assert.equal(state.background, '#fef2f2');
});

test('buildBackupScheduleReviewState follows the policy being edited: the same logs give different answers per scheduled time', () => {
  const now = at(15);
  const beforeDue = buildBackupScheduleReviewState([], policy({ scheduledTime: '23:59' }), now);
  const afterDue = buildBackupScheduleReviewState([], policy({ scheduledTime: '00:00' }), now);

  assert.equal(beforeDue.review.status, 'pass');
  assert.equal(beforeDue.color, '#15803d');
  assert.equal(afterDue.review.status, 'blocked');
});

test('buildBackupScheduleReviewState asks for attention when the schedule is disabled', () => {
  const state = buildBackupScheduleReviewState([], policy({ enabled: false }), at(21));

  assert.equal(state.review.isEnabled, false);
  assert.equal(state.review.status, 'attention');
  assert.equal(state.review.actionLabel, '時刻を設定');
  assert.equal(state.color, '#b45309');
  assert.equal(state.background, '#fffbeb');
});

test('buildBackupScheduleReviewState recognises today\'s encrypted backup and still requires external storage when the policy says so', () => {
  const logs = [backupExportLog(at(18, 30), true)];

  const needsExternal = buildBackupScheduleReviewState(logs, policy({ requireExternalStorage: true }), at(21));
  assert.equal(needsExternal.review.status, 'attention');
  assert.equal(needsExternal.review.actionLabel, '外部保存確認');

  const complete = buildBackupScheduleReviewState(logs, policy({ requireExternalStorage: false }), at(21));
  assert.equal(complete.review.status, 'pass');
  assert.equal(complete.review.actionLabel, '本日分完了');
  assert.equal(complete.review.latestBackup?.fileName, 'yakureki_backup_20261007.json');
  assert.equal(complete.color, '#15803d');
});

test('buildBackupScheduleReviewState flags a plaintext backup when the policy requires encryption', () => {
  const logs = [backupExportLog(at(18, 30), false)];

  const strict = buildBackupScheduleReviewState(logs, policy({ requireEncrypted: true, requireExternalStorage: false }), at(21));
  assert.equal(strict.review.status, 'attention');
  assert.equal(strict.review.actionLabel, '暗号化で再保存');

  const relaxed = buildBackupScheduleReviewState(logs, policy({ requireEncrypted: false, requireExternalStorage: false }), at(21));
  assert.equal(relaxed.review.status, 'pass');
});

test('buildBackupScheduleReviewState ignores backups from other days', () => {
  const yesterday = new Date(2026, 9, 6, 18, 30, 0);
  const state = buildBackupScheduleReviewState([backupExportLog(yesterday, true)], policy(), at(21));

  assert.equal(state.review.latestBackup, undefined);
  assert.equal(state.review.status, 'blocked');
});

// ---- 移行CSV: 文字コード判定・種別ごとのプレビュー・結果トースト ----

const csvBytes = (text: string, to: 'SJIS' | 'UTF8'): Uint8Array =>
  Uint8Array.from(encoding.convert(encoding.stringToCode(text), { to, from: 'UNICODE' }) as number[]);

const PATIENT_CSV = [
  '患者番号,氏名,フリガナ,生年月日,性別,保険者番号,記号番号,負担割合',
  'P001,山田 太郎,ヤマダ タロウ,1980/4/3,男,12345678,記号-123,3割'
].join('\r\n');
const VISIT_CSV = [
  '受付番号,患者番号,来局日,状態,処方日,医療機関名,診療科,医師名',
  'V001,P001,2026/6/18,受付中,2026/6/17,青空クリニック,内科,佐藤 一郎'
].join('\n');
const STOCK_CSV = [
  '在庫ID,薬品コード,JANコード,ロット番号,使用期限,在庫数,入庫日,仕入先',
  'S001,620001234,4987123456789,LOT-1,2027/3/31,"1,200",2026/6/1,東京卸'
].join('\n');
const SOAP_CSV = [
  '薬歴ID,受付ID,記録者ID,記録日時,問題名,S,O,A,P',
  'SOAP001,V001,user_1,202606181030,高血圧,眠気なし,血圧130/80,継続可,次回も確認'
].join('\n');

const DECODE_SAMPLES: Record<string, string> = {
  'header only': '患者番号,氏名',
  'typical patient csv': PATIENT_CSV,
  'rare kanji in names': '患者番号,氏名\nP001,髙橋 﨑山',
  'half-width kana': '患者番号,氏名\nP001,ﾔﾏﾀﾞ ﾀﾛｳ',
  'full-width drug names': '薬品コード,薬品名\n620001234,アムロジピン錠５ｍｇ「サワイ」',
  'very short': '氏名\n田中'
};

test('decodeMigrationCsvBytes restores Shift_JIS and UTF-8 text without mojibake', () => {
  for (const [name, text] of Object.entries(DECODE_SAMPLES)) {
    assert.strictEqual(decodeMigrationCsvBytes(csvBytes(text, 'SJIS')), text, `${name} (Shift_JIS)`);
    assert.strictEqual(decodeMigrationCsvBytes(csvBytes(text, 'UTF8')), text, `${name} (UTF-8)`);
  }
});

test('decodeMigrationCsvBytes handles ASCII-only, empty and BOM-prefixed input', () => {
  const ascii = 'id,name\n1,abc';
  assert.strictEqual(decodeMigrationCsvBytes(Uint8Array.from(Buffer.from(ascii, 'utf8'))), ascii);
  assert.strictEqual(decodeMigrationCsvBytes(new Uint8Array(0)), '');

  const withBom = Uint8Array.from([0xef, 0xbb, 0xbf, ...csvBytes(PATIENT_CSV, 'UTF8')]);
  // BOM は残る。取り除くのは各 build*CsvMigrationPreview の責務(先頭の \ufeff を除去する)
  assert.strictEqual(decodeMigrationCsvBytes(withBom).replace(/^\ufeff/, ''), PATIENT_CSV);
});

test('a Shift_JIS patient CSV survives decode and preview with the patient name intact', () => {
  const text = decodeMigrationCsvBytes(csvBytes(PATIENT_CSV, 'SJIS'));
  const preview = buildMigrationCsvPreview('patients', text, new Date('2026-06-18T10:00:00.000Z'));

  assert.strictEqual(preview.status, 'pass');
  const patients = preview.backup.collections.patients as Array<{ patientId: string; name: string; kana?: string }>;
  assert.strictEqual(patients[0].patientId, 'P001');
  assert.strictEqual(patients[0].name, '山田 太郎');
  assert.strictEqual(patients[0].kana, 'ヤマダ タロウ');
});

test('getMigrationCsvLabel names each CSV kind', () => {
  assert.strictEqual(getMigrationCsvLabel('patients'), '患者CSV');
  assert.strictEqual(getMigrationCsvLabel('visits'), '受付CSV');
  assert.strictEqual(getMigrationCsvLabel('drug_stocks'), '在庫CSV');
  assert.strictEqual(getMigrationCsvLabel('soap_records'), '薬歴CSV');
});

test('buildMigrationCsvPreview routes each kind to its own builder and stamps the generation time', () => {
  const generatedAt = new Date('2026-06-18T10:00:00.000Z');
  const cases = [
    ['patients', PATIENT_CSV, 'patients'],
    ['visits', VISIT_CSV, 'visits'],
    ['drug_stocks', STOCK_CSV, 'drug_stocks'],
    ['soap_records', SOAP_CSV, 'soap_records']
  ] as const;

  for (const [kind, csv, collection] of cases) {
    const preview = buildMigrationCsvPreview(kind, csv, generatedAt);
    assert.strictEqual(preview.status, 'pass', kind);
    assert.strictEqual(preview.rows.length, 1, kind);
    assert.strictEqual(preview.backup.createdAt, generatedAt.toISOString(), kind);
    assert.strictEqual(preview.backup.collections[collection]?.length, 1, `${kind} fills ${collection}`);
    for (const other of cases.filter(([, , c]) => c !== collection)) {
      assert.ok(!preview.backup.collections[other[2]]?.length, `${kind} must not fill ${other[2]}`);
    }
  }
});

test('choosing the wrong CSV kind is blocked instead of importing the file as something else', () => {
  const asVisits = buildMigrationCsvPreview('visits', PATIENT_CSV, new Date('2026-06-18T10:00:00.000Z'));
  assert.strictEqual(asVisits.status, 'blocked');
  assert.strictEqual(asVisits.rows.length, 0);
  assert.ok(!asVisits.backup.collections.visits?.length);
});

test('describeMigrationPreviewResult turns the preview status into a toast level and message', () => {
  const generatedAt = new Date('2026-06-18T10:00:00.000Z');

  const ok = buildMigrationCsvPreview('patients', PATIENT_CSV, generatedAt);
  assert.deepStrictEqual(describeMigrationPreviewResult('患者CSV', ok), {
    level: 'success',
    message: '患者CSVの移行プレビューを作成しました（1件）。'
  });

  const blocked = buildMigrationCsvPreview('patients', '品名,数量\n薬品A,10', generatedAt);
  assert.deepStrictEqual(describeMigrationPreviewResult('患者CSV', blocked), {
    level: 'error',
    message: '患者CSVの移行プレビューを作成しました（CSV修正必要）。指摘を修正してください。'
  });

  // 「要確認」を実際の CSV で再現するのは難しいため、メッセージ対応だけをスタンドインで確認する
  const attention = { status: 'attention', statusLabel: 'CSV要確認', rows: [] } as unknown as MigrationCsvPreview;
  assert.deepStrictEqual(describeMigrationPreviewResult('在庫CSV', attention), {
    level: 'warning',
    message: '在庫CSVの移行プレビューを作成しました（CSV要確認）。'
  });
});
