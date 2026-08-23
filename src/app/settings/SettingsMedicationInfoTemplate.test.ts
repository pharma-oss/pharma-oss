import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settingsSource = [
  './page.tsx',
  '../../components/settings/FacilitySettingsTab.tsx',
  '../../components/settings/ExternalConnectorSettingsTab.tsx',
  '../../components/settings/MedicationInfoTemplateSettingsTab.tsx',
  '../../components/settings/DrugMasterSettingsTab.tsx',
  '../../components/settings/BackupSettingsTab.tsx',
  '../../components/settings/OfficialAuditSettingsTab.tsx',
  '../../components/settings/AuditSettingsTab.tsx',
  '../../components/settings/StaffSettingsTab.tsx',
  '../../lib/medication_info_template_ui.ts',
  '../../lib/drug_master_update_ui.ts'
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

test('settings page exposes medication info template approval workflow', () => {
  assert.match(settingsSource, /data-testid="settings-tab-medication-info"/);
  assert.match(settingsSource, /data-testid="medication-info-template-section"/);
  assert.match(settingsSource, /data-testid="medication-info-template-approve"/);
  assert.match(settingsSource, /承認して保存/);
});

test('medication info template tab provides approval and readiness indicators', () => {
  assert.match(settingsSource, /data-testid="medication-info-invalid-approved-alert"/);
  assert.match(settingsSource, /data-testid="medication-info-template-approval-readiness"/);
  assert.match(settingsSource, /承認前に必要な項目があります/);
  assert.match(settingsSource, /承認条件を満たしています/);
  assert.match(settingsSource, /aria-describedby="medication-info-template-approval-readiness"/);
});

test('medication info template list supports status and readiness filtering UI', () => {
  assert.match(settingsSource, /data-testid=\{`medication-info-template-status-filter-\$\{status\}`\}/);
  assert.match(settingsSource, /data-testid=\{`medication-info-template-readiness-filter-\$\{readiness\}`\}/);
  assert.match(settingsSource, /data-testid="medication-info-template-result-count"/);
  assert.match(settingsSource, /先頭80件を表示/);
  assert.match(settingsSource, /条件に一致するテンプレはありません/);
});

test('medication info template editor provides protected revision UI', () => {
  assert.match(settingsSource, /data-testid="medication-info-template-revision-notice"/);
  assert.match(settingsSource, /新しいテンプレIDへ分岐/);
  assert.match(settingsSource, /data-testid="medication-info-template-current-status"/);
  assert.match(settingsSource, /副作用・使用上の注意案は下書き/);
  assert.doesNotMatch(settingsSource, /薬のしおりから取得/);
});

test('medication info template tab supports CSV bulk and safety draft operations', () => {
  assert.match(settingsSource, /data-testid="medication-info-template-csv-export"/);
  assert.match(settingsSource, /data-testid="medication-info-template-csv-input"/);
  assert.match(settingsSource, /data-testid="medication-info-template-csv-import-summary"/);
  assert.match(settingsSource, /data-testid="medication-info-template-safety-draft"/);
  assert.match(settingsSource, /data-testid="medication-info-template-safety-draft-csv-export"/);
  assert.match(settingsSource, /data-testid="medication-info-template-side-effect"/);
  assert.match(settingsSource, /data-testid="medication-info-template-usage-caution"/);
  assert.doesNotMatch(settingsSource, /data-testid="medication-info-template-effect"/);
  assert.doesNotMatch(settingsSource, /data-testid="medication-info-template-interaction"/);
  assert.doesNotMatch(settingsSource, /data-testid="medication-info-template-storage"/);
});
