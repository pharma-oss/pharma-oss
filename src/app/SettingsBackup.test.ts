import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const backupTabSource = readFileSync(
  new URL('../components/settings/BackupSettingsTab.tsx', import.meta.url),
  'utf8'
);

test('settings backup UI displays encryption options and security warnings', () => {
  // UI 契約: 暗号化保護の表記と警告要素が存在すること
  assert.match(backupTabSource, /バックアップファイルをパスワードで暗号化する（推奨・既定）/);
  assert.match(backupTabSource, /backup-plain-warning/);
  assert.match(backupTabSource, /外部保存連携JSONも出力する/);
  assert.match(backupTabSource, /保存先保持日数/);
});

test('settings backup UI renders patient duplicate scan section and buttons', () => {
  // UI 契約: 患者重複点検・名寄せパネルの data-testid とボタン
  assert.match(backupTabSource, /data-testid="patient-duplicate-review-section"/);
  assert.match(backupTabSource, /data-testid="patient-duplicate-scan-button"/);
  assert.match(backupTabSource, /重複候補を確認/);
});

test('settings backup UI renders external storage receipt section', () => {
  // UI 契約: 外部保存受領書取込ボタン
  assert.match(backupTabSource, /受領書JSONを選択/);
  assert.match(backupTabSource, /受領書を監査ログへ記録/);
});
