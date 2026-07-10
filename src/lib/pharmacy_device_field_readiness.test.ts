import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildExternalConnectorReadinessReport } from './external_connector_readiness.ts';
import { CURRENT_NSIPS_INTERFACE_VERSION } from './pharmacy_device_connector.ts';
import {
  buildPharmacyDeviceFieldCheckRequest,
  buildPharmacyDeviceFieldCheckRequestChecklist,
  buildPharmacyDeviceFieldChecklist,
  buildPharmacyDeviceFieldEvidenceTemplate,
  buildPharmacyDeviceFieldReadinessCsv,
  buildPharmacyDeviceFieldReadinessReport,
  type PharmacyDeviceFieldEvidenceInput
} from './pharmacy_device_field_readiness.ts';

const generatedAt = new Date('2026-06-30T09:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const capabilities = [
  'prescription_submit',
  'prescription_replace',
  'prescription_cancel',
  'idempotent_submission',
  'status_response'
];

function readyConnector() {
  return buildExternalConnectorReadinessReport({
    generatedAt,
    pharmacyDevice: {
      mode: 'connector',
      endpoint: 'https://192.168.1.20/handoff',
      bearerToken: 'secret-token',
      connectorKind: 'nsips_gateway',
      interfaceVersion: CURRENT_NSIPS_INTERFACE_VERSION,
      facilityLocalOnlyConfirmed: true,
      nsipsLicenseConfirmed: true,
      capabilities,
      lastAttempt: {
        outcome: 'success',
        attemptedAt: '2026-06-30T08:30:00.000Z',
        statusCode: 200,
        durationMs: 210,
        responseShape: 'json_object'
      }
    }
  });
}

function completeEvidence(): PharmacyDeviceFieldEvidenceInput {
  return {
    capturedAt: '2026-06-30T08:45:00.000Z',
    operatorReviewId: 'device-field-review-001',
    sourceArtifactSha256: 'a'.repeat(64),
    noPatientDataConfirmed: true,
    officialSpecificationAndLicenseConfirmed: true,
    operationalOwnerAssigned: true,
    outageProcedureConfirmed: true,
    productionDeviceConnected: true,
    successfulSubmissionConfirmed: true,
    prescriptionContentMatched: true,
    duplicatePreventionConfirmed: true,
    replacementConfirmed: true,
    cancellationConfirmed: true,
    restartRecoveryConfirmed: true,
    auditTrailConfirmed: true,
    noFacilityExternalTransmissionConfirmed: true,
    operatingBusinessDays: 20,
    successfulTransferCount: 100,
    failedTransferCount: 2,
    unresolvedIncidentCount: 0
  };
}

test('pharmacy device field readiness passes only after real lifecycle and stable operation', () => {
  const report = buildPharmacyDeviceFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    fieldEvidence: completeEvidence()
  });

  assert.strictEqual(report.status, 'pass');
  assert.strictEqual(report.statusLabel, '安定運用OK');
  assert.strictEqual(report.gateCount, 8);
  assert.strictEqual(report.passedGateCount, 8);
  assert.strictEqual(report.canStartFieldTrial, true);
  assert.strictEqual(report.canDeclareStableOperation, true);
  assert.ok(report.transferMetrics.failureRate <= 0.02);
});

test('pharmacy device field readiness blocks missing lifecycle checks and short operation', () => {
  const report = buildPharmacyDeviceFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    fieldEvidence: {
      ...completeEvidence(),
      replacementConfirmed: false,
      operatingBusinessDays: 19,
      successfulTransferCount: 19,
      failedTransferCount: 2,
      unresolvedIncidentCount: 1
    }
  });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.canDeclareStableOperation, false);
  assert.ok(report.gates.some((gate) => gate.id === 'lifecycle' && gate.status === 'blocked'));
  assert.ok(report.gates.some((gate) => gate.id === 'stable_operation' && gate.status === 'blocked'));
});

test('pharmacy device field readiness requires the real production connector check', () => {
  const connector = buildExternalConnectorReadinessReport({
    generatedAt,
    pharmacyDevice: { mode: 'off' }
  });
  const report = buildPharmacyDeviceFieldReadinessReport({
    generatedAt,
    connectorReadiness: connector,
    fieldEvidence: completeEvidence()
  });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.canStartFieldTrial, false);
  assert.ok(report.gates.some((gate) => gate.id === 'production_connector' && gate.status === 'blocked'));
});

test('pharmacy device field readiness does not accept provenance-free claims as complete', () => {
  const evidence = completeEvidence();
  delete evidence.capturedAt;
  delete evidence.operatorReviewId;
  delete evidence.sourceArtifactSha256;
  const report = buildPharmacyDeviceFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    fieldEvidence: evidence
  });

  assert.strictEqual(report.status, 'attention');
  assert.strictEqual(report.evidenceIntegrity.status, 'attention');
  assert.strictEqual(report.canDeclareStableOperation, false);
});

test('pharmacy device field readiness blocks dummy evidence and patient data without exposing values', () => {
  const report = buildPharmacyDeviceFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    fieldEvidence: {
      ...completeEvidence(),
      sourceLabel: 'dummy fixture',
      patientName: '患者 太郎',
      patientId: 'pat-secret-001'
    } as PharmacyDeviceFieldEvidenceInput
  });
  const serialized = JSON.stringify(report);

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.evidenceIntegrity.status, 'blocked');
  assert.ok(report.evidenceIntegrity.privacy.containsPatientDataSignals);
  assert.doesNotMatch(serialized, /患者 太郎|pat-secret-001|secret-token|192\.168\.1\.20/);
});

test('pharmacy device field exports a safe template, metrics, and CLI contract', () => {
  const report = buildPharmacyDeviceFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    fieldEvidence: completeEvidence()
  });
  const csv = buildPharmacyDeviceFieldReadinessCsv(report);
  const checklist = buildPharmacyDeviceFieldChecklist(report);
  const template = buildPharmacyDeviceFieldEvidenceTemplate();
  const script = readFileSync(new URL('../../scripts/runPharmacyDeviceFieldReadiness.ts', import.meta.url), 'utf8');

  assert.match(csv, /20営業日/);
  assert.match(csv, /失敗率2\.0%/);
  assert.match(checklist, /二重送信/);
  assert.strictEqual(template.productionDeviceConnected, false);
  assert.strictEqual(template.successfulTransferCount, 0);
  assert.match(template.guidance, /デモ、ダミー、サンプル/);
  assert.strictEqual(packageJson.scripts['pharmacy-device:field-readiness'], 'tsx scripts/runPharmacyDeviceFieldReadiness.ts');
  assert.match(script, /YAKUREKI_PHARMACY_DEVICE_CONNECTOR_READINESS/);
  assert.match(script, /YAKUREKI_PHARMACY_DEVICE_FIELD_EVIDENCE/);
  assert.match(script, /pharmacy-device-field-check-request\.json/);
  assert.match(script, /pharmacy-device-field-check-request\.txt/);
  assert.match(script, /YAKUREKI_PHARMACY_DEVICE_FIELD_REQUEST_ONLY/);
});

test('pharmacy device field check request lists governance, lifecycle and stable operation evidence without free text', () => {
  const request = buildPharmacyDeviceFieldCheckRequest({ generatedAt });

  assert.strictEqual(request.type, 'yakureki-pharmacy-device-field-check-request');
  assert.strictEqual(request.items.length, 3);
  assert.ok(request.items.every((item) => item.required));
  const ids = request.items.map((item) => item.id);
  assert.deepStrictEqual(ids, ['governance_and_connector', 'content_and_lifecycle', 'stable_operation_metrics']);

  const checklist = buildPharmacyDeviceFieldCheckRequestChecklist(request);
  assert.match(checklist, /証跡提出依頼/);
  assert.match(checklist, /二重送信防止/);
  assert.match(checklist, /20営業日/);

  const serialized = JSON.stringify(request) + checklist;
  for (const sensitiveValue of ['患者 太郎', '秘密薬局', '/Users/secret', 'bearer-token-secret', 'https://pharmacy.example.com']) {
    assert.doesNotMatch(serialized, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
