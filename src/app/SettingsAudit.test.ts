import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const settingsSource = [
  './settings/page.tsx',
  '../components/settings/FacilitySettingsTab.tsx',
  '../components/settings/ExternalConnectorSettingsTab.tsx',
  '../components/settings/MedicationInfoTemplateSettingsTab.tsx',
  '../components/settings/DrugMasterSettingsTab.tsx',
  '../components/settings/BackupSettingsTab.tsx',
  '../components/settings/OfficialAuditSettingsTab.tsx',
  '../components/settings/AuditSettingsTab.tsx',
  '../components/settings/StaffSettingsTab.tsx',
  '../lib/medication_info_template_ui.ts',
  '../lib/drug_master_update_ui.ts'
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

test('settings audit tab exposes key UI panels and integration testids', () => {
  assert.match(settingsSource, /data-testid="audit-retention-manager-review-button"/);
  assert.match(settingsSource, /data-testid="daily-closing-field-kpis"/);
  assert.match(settingsSource, /data-testid="store-field-kpi-benchmark"/);
  assert.match(settingsSource, /data-testid="ai-quality-gate"/);
  assert.match(settingsSource, /監査ログ整合性/);
  assert.match(settingsSource, /日次締め月次レビュー/);
  assert.match(settingsSource, /店舗別KPIベンチマーク/);
  assert.match(settingsSource, /AI補助フィードバック月次レビュー/);
});

test('settings components include backup, migration, and drug master operations', () => {
  assert.match(settingsSource, /data-testid="initial-setup-panel"/);
  assert.match(settingsSource, /data-testid="initial-setup-next-step-button"/);
  assert.match(settingsSource, /data-testid="initial-setup-checklist-csv-button"/);
  assert.match(settingsSource, /data-testid="initial-setup-handoff-memo-button"/);
  assert.match(settingsSource, /復旧テスト（訓練）レポート/);
  assert.match(settingsSource, /バックアップ世代管理/);
  assert.match(settingsSource, /閉店時バックアップ予定/);
  assert.match(settingsSource, /導入移行診断/);
  assert.match(settingsSource, /支払基金ページHTML/);
  assert.match(settingsSource, /医薬品マスター仕様PDF本文照合/);
  assert.match(settingsSource, /公式PDFを取得して照合/);
  assert.match(settingsSource, /支払基金マスター更新候補一覧/);
});

test('settings labels official source checks as specification review', () => {
  assert.match(settingsSource, /公式仕様点検/);
  assert.match(settingsSource, /公開資料に照らした/);
  assert.doesNotMatch(settingsSource, /公式監査/);
});

test('settings renders the dispensing UKE PDF all-field review panels', () => {
  assert.match(settingsSource, /公式提出UKE allFields完了ゲート/);
  assert.match(settingsSource, /data-testid="dispensing-uke-official-all-fields-gate"/);
  assert.match(settingsSource, /data-testid="dispensing-uke-official-all-fields-gate-status"/);
  assert.match(settingsSource, /data-testid="dispensing-uke-official-all-fields-gate-csv-button"/);
  assert.match(settingsSource, /完了ゲートCSV/);
  assert.match(settingsSource, /UKE仕様PDF 全項目確認/);
  assert.match(settingsSource, /data-testid="dispensing-uke-spec-review"/);
  assert.match(settingsSource, /data-testid="dispensing-uke-spec-fetch-button"/);
  assert.match(settingsSource, /data-testid="dispensing-uke-spec-review-button"/);
  assert.match(settingsSource, /data-testid="dispensing-uke-spec-review-csv-button"/);
  assert.match(settingsSource, /data-testid="dispensing-uke-spec-implementation-pack-button"/);
  assert.match(settingsSource, /実装パック/);
  assert.match(settingsSource, /<option value="official_spec_review">公式仕様点検<\/option>/);
});
