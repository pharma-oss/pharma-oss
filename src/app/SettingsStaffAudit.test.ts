import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const staffTabSource = readFileSync(
  new URL('../components/settings/StaffSettingsTab.tsx', import.meta.url),
  'utf8'
);

test('スタッフタブは復旧・退職対応パネルと月次棚卸ボタンを描画する', () => {
  // UI 契約: 復旧・退職対応パネルと月次棚卸CSVボタン
  assert.match(staffTabSource, /data-testid="staff-recovery-panel"/);
  assert.match(staffTabSource, /data-testid="staff-access-recovery-monthly-review-csv"/);
  assert.match(staffTabSource, /復旧・退職対応/);
});

test('スタッフタブは権限ロール設定パネルを描画する', () => {
  // UI 契約: 権限ロール設定パネル
  assert.match(staffTabSource, /data-testid="role-permission-policy-panel"/);
  assert.match(staffTabSource, /権限ロール設定/);
});
