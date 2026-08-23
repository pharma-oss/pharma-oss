import { test } from 'node:test';
import assert from 'node:assert/strict';
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
const readinessSource = readFileSync(new URL('./api/system/connector-readiness/route.ts', import.meta.url), 'utf8');

test('settings exposes sanitized external connector readiness for yakureki as the receipt computer', () => {
  assert.match(settingsSource, /data-testid="settings-tab-external-connectors"/);
  assert.match(settingsSource, /data-testid="external-connector-settings"/);
  assert.match(settingsSource, /data-testid=\{`external-connector-check-\$\{check\.id\}`\}/);
  assert.match(settingsSource, /data-testid="electronic-prescription-connector-capabilities"/);
  assert.match(settingsSource, /data-testid="pharmacy-device-connector-capabilities"/);
  assert.match(settingsSource, /資格確認端末経由/);
  assert.match(settingsSource, /Web API/);
  assert.match(settingsSource, /秘密情報/);
  assert.match(settingsSource, /非表示/);
});

test('connector readiness route includes electronic prescription official connector metadata', () => {
  assert.match(readinessSource, /electronicPrescriptionConnectorKind/);
  assert.match(readinessSource, /electronicPrescriptionConnectorArtifactSha256/);
  assert.match(readinessSource, /electronicPrescriptionCapabilities/);
  assert.match(readinessSource, /electronicPrescriptionLastAttemptEndpointSha256/);
  assert.match(readinessSource, /electronicPrescriptionLastAttemptAuthSha256/);
  assert.match(readinessSource, /electronicPrescriptionLastAttemptConnectorKind/);
  assert.match(readinessSource, /electronicPrescriptionLastAttemptConnectorArtifactSha256/);
  assert.match(readinessSource, /electronicPrescriptionLastAttemptCapabilities/);
  assert.match(readinessSource, /pharmacyDeviceConnectorCapabilities/);
  assert.doesNotMatch(readinessSource, /連携ブリッジ/);
});
