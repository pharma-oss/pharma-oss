import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settingsSource = readFileSync(new URL('./settings/page.tsx', import.meta.url), 'utf8');
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
  assert.match(settingsSource, /electronic_prescription: '電子処方箋受付'/);
  assert.match(settingsSource, /external_device_handoff: '調剤機器連携'/);
});

test('connector readiness route includes electronic prescription official connector metadata', () => {
  assert.match(readinessSource, /ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND/);
  assert.match(readinessSource, /ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256/);
  assert.match(readinessSource, /ELECTRONIC_PRESCRIPTION_CAPABILITIES/);
  assert.match(readinessSource, /ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_ENDPOINT_SHA256/);
  assert.match(readinessSource, /ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AUTH_SHA256/);
  assert.match(readinessSource, /ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND/);
  assert.match(readinessSource, /ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_ARTIFACT_SHA256/);
  assert.match(readinessSource, /ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CAPABILITIES/);
  assert.match(readinessSource, /PHARMACY_DEVICE_CONNECTOR_CAPABILITIES/);
  assert.doesNotMatch(readinessSource, /連携ブリッジ/);
});
