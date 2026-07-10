import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPharmacyDeviceIdempotencyKey,
  CURRENT_NSIPS_INTERFACE_VERSION,
  type PharmacyDevicePrescriptionPayload,
  validatePharmacyDeviceOperationInput
} from './pharmacy_device_connector.ts';
import {
  submitPharmacyDeviceOperation,
  type PharmacyDeviceConnectorEnv
} from './pharmacy_device_connector_client.ts';
import {
  createPharmacyDeviceConnectorSimulator,
  submitPharmacyDeviceSimulatorOperation
} from './pharmacy_device_connector_simulator.ts';

const payload: PharmacyDevicePrescriptionPayload = {
  visitId: 'visit-001',
  prescriptionDate: '2026-06-30',
  dispensingDate: '2026-06-30',
  patient: {
    patientId: 'patient-001',
    name: '山田 太郎',
    kana: 'ヤマダ タロウ',
    birthDate: '1980-01-02',
    gender: 'male'
  },
  provider: {
    institutionCode: '1312345678',
    institutionName: 'テスト医院',
    departmentName: '内科',
    doctorName: 'テスト 医師'
  },
  items: [{
    itemId: 'item-001',
    rpNumber: 1,
    prescribedDrugCode: '620000001',
    dispensedDrugCode: '620000001',
    drugName: 'テスト錠10mg',
    amount: 1,
    usage: '1日1回 朝食後',
    days: 14,
    unit: '錠'
  }]
};

const capabilities = [
  'prescription_submit',
  'prescription_replace',
  'prescription_cancel',
  'idempotent_submission',
  'status_response'
].join(',');

function readyEnv(overrides: Partial<PharmacyDeviceConnectorEnv> = {}): PharmacyDeviceConnectorEnv {
  return {
    PHARMACY_DEVICE_CONNECTOR_MODE: 'connector',
    PHARMACY_DEVICE_CONNECTOR_ENDPOINT: 'http://127.0.0.1:39300/handoff',
    PHARMACY_DEVICE_CONNECTOR_BEARER_TOKEN: 'facility-local-secret',
    PHARMACY_DEVICE_CONNECTOR_KIND: 'nsips_gateway',
    PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION: CURRENT_NSIPS_INTERFACE_VERSION,
    PHARMACY_DEVICE_CONNECTOR_FACILITY_LOCAL_ONLY: 'true',
    PHARMACY_DEVICE_CONNECTOR_NSIPS_LICENSE_CONFIRMED: 'true',
    PHARMACY_DEVICE_CONNECTOR_CAPABILITIES: capabilities,
    PHARMACY_DEVICE_CONNECTOR_LAST_ATTEMPT_OUTCOME: 'success',
    ...overrides
  };
}

test('pharmacy device operation validates submit, replace, and cancel lifecycle', () => {
  const submit = validatePharmacyDeviceOperationInput({ operation: 'submit', payload });
  assert.strictEqual(submit.ok, true);

  const replaceWithoutReason = validatePharmacyDeviceOperationInput({
    operation: 'replace',
    previousTransferId: 'transfer-001',
    payload
  });
  assert.strictEqual(replaceWithoutReason.ok, false);

  const cancel = validatePharmacyDeviceOperationInput({
    operation: 'cancel',
    previousTransferId: 'transfer-001',
    reason: '受付取消'
  });
  assert.strictEqual(cancel.ok, true);
});

test('pharmacy device operation rejects missing drug codes and unsafe identifiers', () => {
  const invalidCode = structuredClone(payload);
  invalidCode.items[0].dispensedDrugCode = '';
  const codeResult = validatePharmacyDeviceOperationInput({ operation: 'submit', payload: invalidCode });
  assert.strictEqual(codeResult.ok, false);

  const invalidId = structuredClone(payload);
  invalidId.visitId = 'visit\n001';
  const idResult = validatePharmacyDeviceOperationInput({ operation: 'submit', payload: invalidId });
  assert.strictEqual(idResult.ok, false);
});

test('pharmacy device idempotency key is stable for the same logical payload', async () => {
  const first = validatePharmacyDeviceOperationInput({ operation: 'submit', payload });
  const second = validatePharmacyDeviceOperationInput({
    payload: {
      ...payload,
      provider: {
        doctorName: payload.provider.doctorName,
        institutionName: payload.provider.institutionName,
        institutionCode: payload.provider.institutionCode,
        departmentName: payload.provider.departmentName
      }
    },
    operation: 'submit'
  });
  assert.ok(first.ok && second.ok);
  assert.strictEqual(await buildPharmacyDeviceIdempotencyKey(first.input), await buildPharmacyDeviceIdempotencyKey(second.input));
  assert.match(await buildPharmacyDeviceIdempotencyKey(first.input), /^[a-f0-9]{64}$/);
});

test('pharmacy device client blocks off mode, public endpoints, and unlicensed NSIPS use', async () => {
  const off = await submitPharmacyDeviceOperation(
    { operation: 'submit', payload },
    { env: readyEnv({ PHARMACY_DEVICE_CONNECTOR_MODE: 'off' }) }
  );
  assert.strictEqual(off.status, 'unconfigured');

  const publicEndpoint = await submitPharmacyDeviceOperation(
    { operation: 'submit', payload },
    { env: readyEnv({ PHARMACY_DEVICE_CONNECTOR_ENDPOINT: 'https://connector.example.test/handoff' }) }
  );
  assert.strictEqual(publicEndpoint.status, 'unconfigured');
  assert.match(publicEndpoint.message, /施設内接続先/);

  const unauthenticated = await submitPharmacyDeviceOperation(
    { operation: 'submit', payload },
    { env: readyEnv({ PHARMACY_DEVICE_CONNECTOR_BEARER_TOKEN: '' }) }
  );
  assert.strictEqual(unauthenticated.status, 'unconfigured');
  assert.match(unauthenticated.message, /認証トークン/);

  const unlicensed = await submitPharmacyDeviceOperation(
    { operation: 'submit', payload },
    { env: readyEnv({ PHARMACY_DEVICE_CONNECTOR_NSIPS_LICENSE_CONFIRMED: 'false' }) }
  );
  assert.strictEqual(unlicensed.status, 'unconfigured');
  assert.match(unlicensed.message, /利用許諾/);
});

test('pharmacy device client blocks stale NSIPS versions, missing capabilities, and failed preflight', async () => {
  const stale = await submitPharmacyDeviceOperation(
    { operation: 'submit', payload },
    { env: readyEnv({ PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION: '1.06.03' }) }
  );
  assert.strictEqual(stale.status, 'unconfigured');
  assert.match(stale.message, new RegExp(CURRENT_NSIPS_INTERFACE_VERSION.replaceAll('.', '\\.')));

  const missingCapability = await submitPharmacyDeviceOperation(
    { operation: 'submit', payload },
    { env: readyEnv({ PHARMACY_DEVICE_CONNECTOR_CAPABILITIES: 'prescription_submit' }) }
  );
  assert.strictEqual(missingCapability.status, 'unconfigured');

  const failedPreflight = await submitPharmacyDeviceOperation(
    { operation: 'submit', payload },
    { env: readyEnv({ PHARMACY_DEVICE_CONNECTOR_LAST_ATTEMPT_OUTCOME: 'timeout' }) }
  );
  assert.strictEqual(failedPreflight.status, 'unconfigured');
  assert.match(failedPreflight.message, /接続試行/);
});

test('pharmacy device client sends a facility-local idempotent envelope and normalizes acceptance', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({
      outcome: 'accepted',
      transferId: 'transfer-001',
      receivedAt: '2026-06-30T10:00:00.000Z'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await submitPharmacyDeviceOperation(
    { operation: 'submit', payload },
    { env: readyEnv(), fetchImpl }
  );

  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.outcome, 'accepted');
  assert.strictEqual(result.transferId, 'transfer-001');
  assert.strictEqual(result.connectorKind, 'nsips_gateway');
  assert.strictEqual(result.interfaceVersion, CURRENT_NSIPS_INTERFACE_VERSION);
  assert.strictEqual(capturedUrl, 'http://127.0.0.1:39300/handoff');
  const headers = new Headers(capturedInit?.headers);
  assert.match(headers.get('X-Yakureki-Idempotency-Key') || '', /^[a-f0-9]{64}$/);
  assert.strictEqual(headers.get('Authorization'), 'Bearer facility-local-secret');
  const body = JSON.parse(String(capturedInit?.body));
  assert.strictEqual(body.type, 'yakureki-pharmacy-device-handoff');
  assert.strictEqual(body.schemaVersion, 1);
  assert.strictEqual(body.patient, undefined);
  assert.strictEqual(body.payload.patient.name, '山田 太郎');
});

test('pharmacy device client treats connector duplicate response as a safe success', async () => {
  const result = await submitPharmacyDeviceOperation(
    { operation: 'submit', payload },
    {
      env: readyEnv({ PHARMACY_DEVICE_CONNECTOR_KIND: 'vendor_api' }),
      fetchImpl: async () => new Response(JSON.stringify({
        outcome: 'duplicate',
        transferId: 'transfer-existing'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  );

  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.outcome, 'duplicate');
  assert.match(result.message, /重複送信は行いませんでした/);
});

test('pharmacy device local simulator covers submit, duplicate submit, replace, and cancel', async () => {
  const simulator = createPharmacyDeviceConnectorSimulator({
    now: () => new Date('2026-07-01T09:00:00.000Z')
  });
  const simulatorEnv = {
    PHARMACY_DEVICE_CONNECTOR_KIND: 'vendor_api',
    PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION: 'local-simulator-v1'
  };

  const submitted = await submitPharmacyDeviceSimulatorOperation(
    { operation: 'submit', payload },
    { simulator, env: simulatorEnv }
  );
  assert.strictEqual(submitted.status, 'success');
  assert.strictEqual(submitted.outcome, 'accepted');
  assert.strictEqual(submitted.transferId, 'sim-transfer-000001');
  assert.strictEqual(submitted.receivedAt, '2026-07-01T09:00:00.000Z');

  const duplicateSubmit = await submitPharmacyDeviceSimulatorOperation(
    { operation: 'submit', payload },
    { simulator, env: simulatorEnv }
  );
  assert.strictEqual(duplicateSubmit.status, 'success');
  assert.strictEqual(duplicateSubmit.outcome, 'duplicate');
  assert.strictEqual(duplicateSubmit.transferId, submitted.transferId);
  assert.strictEqual(duplicateSubmit.payloadHash, submitted.payloadHash);

  const replacementPayload = structuredClone(payload);
  replacementPayload.items[0].amount = 2;
  const replaced = await submitPharmacyDeviceSimulatorOperation(
    {
      operation: 'replace',
      previousTransferId: submitted.transferId,
      reason: '用量修正',
      payload: replacementPayload
    },
    { simulator, env: simulatorEnv }
  );
  assert.strictEqual(replaced.status, 'success');
  assert.strictEqual(replaced.outcome, 'accepted');
  assert.strictEqual(replaced.transferId, 'sim-transfer-000002');
  assert.notStrictEqual(replaced.transferId, submitted.transferId);
  assert.notStrictEqual(replaced.payloadHash, submitted.payloadHash);

  const cancelled = await submitPharmacyDeviceSimulatorOperation(
    {
      operation: 'cancel',
      previousTransferId: replaced.transferId,
      reason: '受付取消'
    },
    { simulator, env: simulatorEnv }
  );
  assert.strictEqual(cancelled.status, 'success');
  assert.strictEqual(cancelled.outcome, 'cancelled');
  assert.strictEqual(cancelled.transferId, replaced.transferId);
  assert.strictEqual(cancelled.connectorKind, 'vendor_api');
  assert.strictEqual(cancelled.interfaceVersion, 'local-simulator-v1');

  assert.deepStrictEqual(
    simulator.snapshot().map((transfer) => [transfer.transferId, transfer.status]),
    [
      ['sim-transfer-000001', 'replaced'],
      ['sim-transfer-000002', 'cancelled']
    ]
  );
});
