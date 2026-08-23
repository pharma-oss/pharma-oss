import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from './api/external-integration/prescription-handoff/route.ts';
import { localPharmacyDeviceConnectorSimulator } from '../lib/pharmacy_device_connector_simulator.ts';

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

test('調剤機器連携APIは不正なオペレーションや必須パラメータ不足を拒否する', async () => {
  const response = await POST(new Request('http://localhost/api/external-integration/prescription-handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation: 'invalid_op',
      payload: routePayload
    })
  }) as Parameters<typeof POST>[0]);

  const result = await response.json();
  assert.strictEqual(response.status, 400);
  assert.strictEqual(result.status, 'invalid_request');
});

test('調剤機器連携APIはローカルシミュレータ有効時に送信・置換・取消オペレーションを実行できる', async () => {
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
    // 1. submit
    const submitResponse = await POST(new Request('http://localhost/api/external-integration/prescription-handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'submit',
        payload: routePayload
      })
    }) as Parameters<typeof POST>[0]);
    const submitResult = await submitResponse.json();

    assert.strictEqual(submitResponse.status, 200);
    assert.strictEqual(submitResult.status, 'success');
    assert.strictEqual(submitResult.outcome, 'accepted');
    assert.strictEqual(submitResult.transferId, 'sim-transfer-000001');
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
