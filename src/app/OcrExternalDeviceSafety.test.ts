import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POST } from './api/external-integration/prescription-handoff/route.ts';
import { localPharmacyDeviceConnectorSimulator } from '../lib/pharmacy_device_connector_simulator.ts';

const ocrSource = readFileSync(new URL('./ocr/page.tsx', import.meta.url), 'utf8');
const printSource = readFileSync(new URL('./print/[visitId]/page.tsx', import.meta.url), 'utf8');
const routeSource = readFileSync(new URL('./api/external-integration/prescription-handoff/route.ts', import.meta.url), 'utf8');

const routePayload = {
  visitId: 'visit-route-001',
  prescriptionDate: '2026-07-01',
  dispensingDate: '2026-07-01',
  patient: {
    patientId: 'patient-route-001',
    name: '山田 太郎',
    birthDate: '1980-01-02'
  },
  provider: {
    institutionName: 'テスト医院'
  },
  items: [{
    itemId: 'item-route-001',
    rpNumber: 1,
    prescribedDrugCode: '620000001',
    dispensedDrugCode: '620000001',
    drugName: 'テスト錠10mg',
    amount: 1,
    usage: '1日1回 朝食後',
    days: 14
  }]
};

test('prescription save no longer writes an unverified NSIPS-like file automatically', () => {
  assert.doesNotMatch(ocrSource, /generateNsipsContent|NsipsRecord|rakCheDirHandle|showDirectoryPicker/);
  assert.doesNotMatch(ocrSource, /NSIPS連携ファイル/);
});

test('print page exposes explicit audited send, replace, and cancel operations', () => {
  assert.match(printSource, /data-testid="pharmacy-device-handoff-panel"/);
  assert.match(printSource, /data-testid="pharmacy-device-submit-button"/);
  assert.match(printSource, /data-testid="pharmacy-device-replace-button"/);
  assert.match(printSource, /data-testid="pharmacy-device-cancel-button"/);
  assert.match(printSource, /external_device_handoff/);
  assert.match(printSource, /\/api\/external-integration\/prescription-handoff/);
  assert.match(printSource, /pharmacyDeviceReadiness\?\.status !== 'ready'/);
});

test('pharmacy device route delegates validation and connector submission', () => {
  assert.match(routeSource, /submitPharmacyDeviceOperation/);
  assert.match(routeSource, /isPharmacyDeviceConnectorSimulatorEnabled/);
  assert.match(routeSource, /submitPharmacyDeviceSimulatorOperation/);
  assert.match(routeSource, /previousTransferId/);
  assert.match(routeSource, /invalid_request/);
});

test('pharmacy device route uses the local simulator when explicitly enabled', async () => {
  const envKeys = [
    'PHARMACY_DEVICE_CONNECTOR_SIMULATOR_ENABLED',
    'PHARMACY_DEVICE_CONNECTOR_KIND',
    'PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION'
  ] as const;
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  localPharmacyDeviceConnectorSimulator.reset();
  process.env.PHARMACY_DEVICE_CONNECTOR_SIMULATOR_ENABLED = 'true';
  process.env.PHARMACY_DEVICE_CONNECTOR_KIND = 'vendor_api';
  process.env.PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION = 'local-simulator-v1';

  try {
    const response = await POST(new Request('http://localhost/api/external-integration/prescription-handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'submit',
        payload: routePayload
      })
    }) as Parameters<typeof POST>[0]);
    const result = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.outcome, 'accepted');
    assert.strictEqual(result.transferId, 'sim-transfer-000001');
    assert.strictEqual(result.connectorKind, 'vendor_api');
    assert.strictEqual(result.interfaceVersion, 'local-simulator-v1');
  } finally {
    localPharmacyDeviceConnectorSimulator.reset();
    for (const key of envKeys) {
      const value = previousEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
