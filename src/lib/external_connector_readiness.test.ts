import { test } from 'node:test';
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import {
  buildElectronicPrescriptionReadiness,
  buildExternalConnectorReadinessCsv,
  buildExternalConnectorReadinessReport,
  buildMynaCardReaderReadiness,
  buildOnlineEligibilityReadiness,
  buildPharmacyDeviceReadiness
} from './external_connector_readiness.ts';
import { CURRENT_NSIPS_INTERFACE_VERSION } from './pharmacy_device_connector.ts';

const generatedAt = new Date('2026-06-18T09:00:00.000Z');
const recentAttemptAt = () => new Date(Date.now() - 5 * 60 * 1000).toISOString();
const endpointSha256 = (endpoint: string) => createHash('sha256').update(new URL(endpoint).href).digest('hex');
const authSha256 = (token: string) => createHash('sha256')
  .update(`yakureki-electronic-prescription-auth\0${token.trim()}`)
  .digest('hex');
const connectorArtifactSha256 = 'a'.repeat(64);
const artifactVerificationId = (sha256: string) => createHash('sha256')
  .update(`yakureki-electronic-prescription-connector-artifact\0${sha256}`)
  .digest('hex');
const electronicPrescriptionCapabilities = [
  'prescription_fetch',
  'signature_verification',
  'hpki_verification',
  'duplicate_check',
  'reception_cancel',
  'dispensing_result',
  'dispensing_result_search',
  'dispensing_result_cancel',
  'dispensing_result_change',
  'refill_prescription',
  'paper_prescription'
];
const electronicPrescriptionRequiredDisplayItems = [
  'prescription_id',
  'exchange_number',
  'patient_birth_date',
  'provider',
  'doctor',
  'issued_at',
  'valid_until',
  'document_kind',
  'signature_status',
  'duplicate_check_status',
  'drug_code',
  'drug_name',
  'amount',
  'unit',
  'usage',
  'days',
  'unit_conversion',
  'usage_supplement',
  'prescription_comment',
  'laboratory_result',
  'narcotic_administration'
];

test('buildExternalConnectorReadinessReport keeps endpoint URLs and tokens out of the report', () => {
  const report = buildExternalConnectorReadinessReport({
    generatedAt,
    mynaCardReader: {
      mode: 'bridge',
      endpoint: 'http://127.0.0.1:39100/myna/read',
      timeoutMs: 5000,
      lastAttempt: {
        outcome: 'success',
        attemptedAt: generatedAt,
        statusCode: 200,
        durationMs: 120,
        responseShape: 'json_object'
      }
    },
    onlineEligibility: {
      mode: 'external',
      endpoint: 'https://eligibility.example.test/check?tenant=secret',
      bearerToken: 'secret-token-value',
      timeoutMs: 7000,
      lastAttempt: {
        outcome: 'success',
        attemptedAt: generatedAt,
        statusCode: 200,
        durationMs: 450,
        responseShape: 'json_object'
      }
    }
  });
  const json = JSON.stringify(report);

  assert.strictEqual(report.schemaVersion, 9);
  assert.strictEqual(report.overallStatus, 'ready');
  assert.strictEqual(report.privacy.containsEndpointUrl, false);
  assert.strictEqual(report.privacy.containsBearerToken, false);
  assert.doesNotMatch(json, /39100\/myna/);
  assert.doesNotMatch(json, /eligibility\.example\.test/);
  assert.doesNotMatch(json, /secret-token-value/);
  assert.strictEqual(report.checks[0].config.endpointHostKind, 'localhost');
  assert.strictEqual(report.checks[0].config.mockFallbackAllowed, true);
  assert.strictEqual(report.checks[1].config.endpointHostKind, 'external');
  assert.strictEqual(report.checks[1].config.bearerTokenConfigured, true);
  assert.strictEqual(report.checks[1].config.mockFallbackAllowed, true);
  assert.strictEqual(report.checks[1].lastAttempt.outcome, 'success');
  assert.strictEqual(report.checks[1].lastAttempt.statusCodeClass, '2xx');
});

test('buildExternalConnectorReadinessReport can include electronic prescription without leaking secrets', () => {
  const report = buildExternalConnectorReadinessReport({
    generatedAt,
    mynaCardReader: { mode: 'bridge', endpoint: 'http://127.0.0.1:39100/myna/read' },
    onlineEligibility: { mode: 'mock' },
    electronicPrescription: {
      mode: 'connector',
      endpoint: 'https://eprescription.example.test/fetch?tenant=secret',
      bearerToken: 'electronic-secret-token',
      timeoutMs: 9000,
      connectorKind: 'qualification_terminal',
      connectorArtifactSha256,
      capabilities: electronicPrescriptionCapabilities,
      csvMaxBytes: 1048576,
      requiredDisplayItems: electronicPrescriptionRequiredDisplayItems,
      sharedFolderMode: 'polling',
      sharedFolderPollIntervalMs: 3000,
      sharedFolderStaleAfterMs: 120000,
      sharedFolderMaxPendingFiles: 100,
      sharedFolderPerformanceP95Ms: 1800,
      sharedFolderRetryPolicyConfirmed: true,
      lastAttemptEndpointSha256: endpointSha256('https://eprescription.example.test/fetch?tenant=secret'),
      lastAttemptAuthSha256: authSha256('electronic-secret-token'),
      lastAttemptConnectorKind: 'qualification_terminal',
      lastAttemptConnectorArtifactSha256: connectorArtifactSha256,
      lastAttemptCapabilities: electronicPrescriptionCapabilities,
      lastAttempt: {
        outcome: 'success',
        attemptedAt: recentAttemptAt(),
        statusCode: 200,
        durationMs: 700,
        responseShape: 'json_object'
      }
    }
  });
  const json = JSON.stringify(report);
  const electronicCheck = report.checks.find((check) => check.id === 'electronic_prescription');

  assert.ok(electronicCheck);
  assert.strictEqual(electronicCheck.status, 'ready');
  assert.strictEqual(electronicCheck.config.endpointHostKind, 'external');
  assert.strictEqual(electronicCheck.config.bearerTokenConfigured, true);
  assert.strictEqual(electronicCheck.electronicPrescription?.connectorKind, 'qualification_terminal');
  assert.strictEqual(
    electronicCheck.electronicPrescription?.connectorArtifactVerificationId,
    artifactVerificationId(connectorArtifactSha256)
  );
  assert.deepStrictEqual(electronicCheck.electronicPrescription?.missingCapabilities, []);
  assert.strictEqual(electronicCheck.electronicPrescription?.csvMaxBytes, 1048576);
  assert.deepStrictEqual(electronicCheck.electronicPrescription?.requiredDisplayItems.missing, []);
  assert.strictEqual(electronicCheck.electronicPrescription?.sharedFolder.mode, 'polling');
  assert.strictEqual(electronicCheck.electronicPrescription?.sharedFolder.performanceP95Ms, 1800);
  assert.doesNotMatch(json, /eprescription\.example\.test|electronic-secret-token|tenant=secret/);
  assert.doesNotMatch(json, new RegExp(connectorArtifactSha256));
  assert.match(json, new RegExp(artifactVerificationId(connectorArtifactSha256)));
});

test('buildElectronicPrescriptionReadiness blocks disabled production connector and requires attempts for connector mode', () => {
  const disabled = buildElectronicPrescriptionReadiness({ mode: 'off' });
  assert.strictEqual(disabled.status, 'blocked');
  assert.ok(disabled.requiredActions.some((action) => action.includes('ELECTRONIC_PRESCRIPTION_MODE=connector')));

  const connector = buildElectronicPrescriptionReadiness({
    mode: 'connector',
    endpoint: 'https://eprescription.example.test/fetch',
    connectorKind: 'web_api',
    connectorArtifactSha256,
    capabilities: electronicPrescriptionCapabilities,
    csvMaxBytes: 1048576,
    requiredDisplayItems: electronicPrescriptionRequiredDisplayItems,
    sharedFolderMode: 'not_applicable'
  });
  assert.strictEqual(connector.status, 'attention');
  assert.ok(connector.requiredActions.some((action) => action.includes('LAST_ATTEMPT_OUTCOME')));
});

test('buildElectronicPrescriptionReadiness flags stale or future preflight timestamps', () => {
  const base = {
    mode: 'connector',
    endpoint: 'https://eprescription.example.test/fetch',
    bearerToken: 'configured',
    connectorKind: 'web_api',
    connectorArtifactSha256,
    capabilities: electronicPrescriptionCapabilities,
    csvMaxBytes: 1048576,
    requiredDisplayItems: electronicPrescriptionRequiredDisplayItems,
    sharedFolderMode: 'not_applicable',
    lastAttemptEndpointSha256: endpointSha256('https://eprescription.example.test/fetch'),
    lastAttemptAuthSha256: authSha256('configured'),
    lastAttemptConnectorKind: 'web_api',
    lastAttemptConnectorArtifactSha256: connectorArtifactSha256,
    lastAttemptCapabilities: electronicPrescriptionCapabilities,
    lastAttempt: {
      outcome: 'success' as const,
      statusCode: 200,
      responseShape: 'json_object' as const
    }
  };
  const stale = buildElectronicPrescriptionReadiness({
    ...base,
    lastAttempt: {
      ...base.lastAttempt,
      attemptedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    }
  });
  const future = buildElectronicPrescriptionReadiness({
    ...base,
    lastAttempt: {
      ...base.lastAttempt,
      attemptedAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    }
  });

  assert.strictEqual(stale.status, 'attention');
  assert.ok(stale.requiredActions.some((action) => action.includes('24時間以内')));
  assert.strictEqual(future.status, 'attention');
  assert.ok(future.requiredActions.some((action) => action.includes('端末時刻')));
});

test('buildElectronicPrescriptionReadiness flags preflight connector metadata mismatches', () => {
  const base = {
    mode: 'connector',
    endpoint: 'https://eprescription.example.test/fetch',
    bearerToken: 'configured',
    connectorKind: 'web_api',
    connectorArtifactSha256,
    capabilities: electronicPrescriptionCapabilities,
    csvMaxBytes: 1048576,
    requiredDisplayItems: electronicPrescriptionRequiredDisplayItems,
    sharedFolderMode: 'not_applicable',
    lastAttemptAuthSha256: authSha256('configured'),
    lastAttemptConnectorArtifactSha256: connectorArtifactSha256,
    lastAttempt: {
      outcome: 'success' as const,
      attemptedAt: recentAttemptAt(),
      statusCode: 200,
      responseShape: 'json_object' as const
    }
  };
  const endpointMismatch = buildElectronicPrescriptionReadiness({
    ...base,
    lastAttemptEndpointSha256: endpointSha256('https://other-connector.example.test/fetch'),
    lastAttemptConnectorKind: 'web_api',
    lastAttemptCapabilities: electronicPrescriptionCapabilities
  });
  const kindMismatch = buildElectronicPrescriptionReadiness({
    ...base,
    lastAttemptEndpointSha256: endpointSha256('https://eprescription.example.test/fetch'),
    lastAttemptConnectorKind: 'qualification_terminal',
    lastAttemptCapabilities: electronicPrescriptionCapabilities
  });
  const authMismatch = buildElectronicPrescriptionReadiness({
    ...base,
    lastAttemptEndpointSha256: endpointSha256('https://eprescription.example.test/fetch'),
    lastAttemptAuthSha256: authSha256('old-configured'),
    lastAttemptConnectorKind: 'web_api',
    lastAttemptCapabilities: electronicPrescriptionCapabilities
  });
  const artifactMismatch = buildElectronicPrescriptionReadiness({
    ...base,
    lastAttemptEndpointSha256: endpointSha256('https://eprescription.example.test/fetch'),
    lastAttemptConnectorArtifactSha256: 'b'.repeat(64),
    lastAttemptConnectorKind: 'web_api',
    lastAttemptCapabilities: electronicPrescriptionCapabilities
  });
  const missingCapabilities = buildElectronicPrescriptionReadiness({
    ...base,
    lastAttemptEndpointSha256: endpointSha256('https://eprescription.example.test/fetch'),
    lastAttemptConnectorKind: 'web_api',
    lastAttemptCapabilities: ['prescription_fetch']
  });

  assert.strictEqual(endpointMismatch.status, 'attention');
  assert.ok(endpointMismatch.requiredActions.some((action) => action.includes('現在の接続先')));
  assert.strictEqual(kindMismatch.status, 'attention');
  assert.ok(kindMismatch.requiredActions.some((action) => action.includes('現在の接続方式')));
  assert.strictEqual(authMismatch.status, 'attention');
  assert.ok(authMismatch.requiredActions.some((action) => action.includes('現在の認証情報')));
  assert.strictEqual(artifactMismatch.status, 'attention');
  assert.ok(artifactMismatch.requiredActions.some((action) => action.includes('現在の接続モジュール成果物')));
  assert.strictEqual(missingCapabilities.status, 'attention');
  assert.ok(missingCapabilities.requiredActions.some((action) => action.includes('LAST_ATTEMPT_CAPABILITIES')));
});

test('buildElectronicPrescriptionReadiness requires CSV, display, and shared-folder contract evidence', () => {
  const check = buildElectronicPrescriptionReadiness({
    mode: 'connector',
    endpoint: 'https://eprescription.example.test/fetch',
    bearerToken: 'configured',
    connectorKind: 'web_api',
    capabilities: electronicPrescriptionCapabilities,
    lastAttempt: {
      outcome: 'success',
      attemptedAt: generatedAt,
      statusCode: 200,
      responseShape: 'json_object'
    }
  });

  assert.strictEqual(check.status, 'attention');
  assert.ok(check.requiredActions.some((action) => action.includes('CSV_MAX_BYTES')));
  assert.ok(check.requiredActions.some((action) => action.includes('必須表示項目')));
  assert.ok(check.requiredActions.some((action) => action.includes('SHARED_FOLDER_MODE')));
  assert.ok(check.electronicPrescription?.requiredDisplayItems.missing.includes('signature_status'));
});

test('buildElectronicPrescriptionReadiness requires official connection kind and full pharmacy capabilities', () => {
  const check = buildElectronicPrescriptionReadiness({
    mode: 'connector',
    endpoint: 'http://127.0.0.1:39200/electronic-prescription',
    capabilities: ['prescription_fetch', 'duplicate_check']
  });

  assert.strictEqual(check.status, 'attention');
  assert.strictEqual(check.electronicPrescription?.connectorKind, 'unspecified');
  assert.ok(check.electronicPrescription?.missingCapabilities.includes('signature_verification'));
  assert.ok(check.requiredActions.some((action) => action.includes('ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND')));
  assert.ok(check.requiredActions.some((action) => action.includes('未確認の必須機能')));
});

test('buildElectronicPrescriptionReadiness blocks plaintext non-loopback endpoints', () => {
  const check = buildElectronicPrescriptionReadiness({
    mode: 'connector',
    endpoint: 'http://192.168.1.10/electronic-prescription',
    bearerToken: 'configured',
    connectorKind: 'qualification_terminal',
    capabilities: electronicPrescriptionCapabilities,
    lastAttempt: {
      outcome: 'success',
      attemptedAt: generatedAt,
      statusCode: 200,
      responseShape: 'json_object'
    }
  });

  assert.strictEqual(check.status, 'blocked');
  assert.ok(check.requiredActions.some((action) => action.includes('https')));
});

test('buildMynaCardReaderReadiness marks auto without endpoint as demo operation', () => {
  const check = buildMynaCardReaderReadiness({ mode: 'auto' });

  assert.strictEqual(check.status, 'demo');
  assert.strictEqual(check.config.endpointConfigured, false);
  assert.ok(check.requiredActions.some((action) => action.includes('MYNA_CARD_READER_ENDPOINT')));
});

test('buildMynaCardReaderReadiness blocks auto without endpoint when mock fallback is disabled', () => {
  const check = buildMynaCardReaderReadiness({ mode: 'auto', allowMockFallback: false });

  assert.strictEqual(check.status, 'blocked');
  assert.strictEqual(check.config.mockFallbackAllowed, false);
  assert.strictEqual(check.config.endpointConfigured, false);
  assert.ok(check.requiredActions.some((action) => action.includes('MYNA_CARD_READER_ENDPOINT')));
  assert.ok(check.requiredActions.some((action) => action.includes('MYNA_CARD_READER_ALLOW_MOCK')));
});

test('buildMynaCardReaderReadiness blocks explicit mock mode when mock fallback is disabled', () => {
  const check = buildMynaCardReaderReadiness({ mode: 'mock', allowMockFallback: false });

  assert.strictEqual(check.status, 'blocked');
  assert.strictEqual(check.config.mockFallbackAllowed, false);
  assert.ok(check.requiredActions.some((action) => action.includes('MYNA_CARD_READER_ALLOW_MOCK')));
});

test('buildMynaCardReaderReadiness blocks bridge mode without endpoint', () => {
  const check = buildMynaCardReaderReadiness({ mode: 'bridge' });

  assert.strictEqual(check.status, 'blocked');
  assert.ok(check.requiredActions.some((action) => action.includes('MYNA_CARD_READER_ENDPOINT')));
});

test('buildOnlineEligibilityReadiness flags missing bearer token as attention', () => {
  const check = buildOnlineEligibilityReadiness({
    mode: 'external',
    endpoint: 'https://eligibility.example.test/check'
  });

  assert.strictEqual(check.status, 'attention');
  assert.strictEqual(check.config.endpointConfigured, true);
  assert.strictEqual(check.config.bearerTokenConfigured, false);
  assert.ok(check.requiredActions.some((action) => action.includes('ONLINE_ELIGIBILITY_BEARER_TOKEN')));
});

test('buildOnlineEligibilityReadiness requires a recorded connection attempt for external operation', () => {
  const check = buildOnlineEligibilityReadiness({
    mode: 'external',
    endpoint: 'https://eligibility.example.test/check',
    bearerToken: 'configured'
  });

  assert.strictEqual(check.status, 'attention');
  assert.strictEqual(check.lastAttempt.outcome, 'not_run');
  assert.ok(check.requiredActions.some((action) => action.includes('LAST_ATTEMPT_OUTCOME')));
});

test('buildOnlineEligibilityReadiness blocks recorded authentication failures', () => {
  const check = buildOnlineEligibilityReadiness({
    mode: 'external',
    endpoint: 'https://eligibility.example.test/check',
    bearerToken: 'configured',
    lastAttempt: {
      outcome: 'auth_error',
      statusCode: 401,
      durationMs: 300,
      responseShape: 'json_object',
      errorCode: 'unauthorized'
    }
  });

  assert.strictEqual(check.status, 'blocked');
  assert.strictEqual(check.lastAttempt.statusCodeClass, '4xx');
  assert.ok(check.requiredActions.some((action) => action.includes('認証方式')));
});

test('buildExternalConnectorReadinessCsv summarizes retry actions without endpoints or tokens', () => {
  const report = buildExternalConnectorReadinessReport({
    generatedAt,
    onlineEligibility: {
      mode: 'external',
      endpoint: 'https://eligibility.example.test/check?tenant=secret',
      bearerToken: 'secret-token-value',
      lastAttempt: {
        outcome: 'timeout',
        durationMs: 9000,
        responseShape: 'unknown'
      }
    }
  });
  const csv = buildExternalConnectorReadinessCsv(report);

  assert.match(csv, /^"connector","status","mode","endpointConfigured"/);
  assert.match(csv, /オンライン資格確認/);
  assert.doesNotMatch(csv, /電子処方箋/);
  assert.match(csv, /タイムアウト/);
  assert.match(csv, /slow/);
  assert.doesNotMatch(csv, /eligibility\.example\.test|secret-token-value/);
});

test('buildOnlineEligibilityReadiness blocks auto without endpoint when mock fallback is disabled', () => {
  const check = buildOnlineEligibilityReadiness({ mode: 'auto', allowMockFallback: false });

  assert.strictEqual(check.status, 'blocked');
  assert.strictEqual(check.config.mockFallbackAllowed, false);
  assert.strictEqual(check.config.endpointConfigured, false);
  assert.ok(check.requiredActions.some((action) => action.includes('ONLINE_ELIGIBILITY_ENDPOINT')));
  assert.ok(check.requiredActions.some((action) => action.includes('ONLINE_ELIGIBILITY_ALLOW_MOCK')));
});

test('buildOnlineEligibilityReadiness blocks explicit mock mode when mock fallback is disabled', () => {
  const check = buildOnlineEligibilityReadiness({ mode: 'mock', allowMockFallback: false });

  assert.strictEqual(check.status, 'blocked');
  assert.strictEqual(check.config.mockFallbackAllowed, false);
  assert.ok(check.requiredActions.some((action) => action.includes('ONLINE_ELIGIBILITY_ALLOW_MOCK')));
});

test('buildOnlineEligibilityReadiness blocks invalid endpoints and timeout values', () => {
  const check = buildOnlineEligibilityReadiness({
    mode: 'external',
    endpoint: 'file:///tmp/eligibility.json',
    bearerToken: 'configured',
    timeoutMs: 100
  });

  assert.strictEqual(check.status, 'blocked');
  assert.strictEqual(check.config.endpointHostKind, 'invalid');
  assert.strictEqual(check.config.timeoutValid, false);
});

test('buildPharmacyDeviceReadiness requires a facility-local approved connector lifecycle', () => {
  const check = buildPharmacyDeviceReadiness({
    mode: 'connector',
    endpoint: 'http://127.0.0.1:39300/handoff',
    bearerToken: 'facility-local-secret',
    connectorKind: 'nsips_gateway',
    interfaceVersion: CURRENT_NSIPS_INTERFACE_VERSION,
    facilityLocalOnlyConfirmed: true,
    nsipsLicenseConfirmed: true,
    capabilities: [
      'prescription_submit',
      'prescription_replace',
      'prescription_cancel',
      'idempotent_submission',
      'status_response'
    ],
    lastAttempt: {
      outcome: 'success',
      attemptedAt: generatedAt,
      statusCode: 200,
      responseShape: 'json_object'
    }
  });

  assert.strictEqual(check.status, 'ready');
  assert.strictEqual(check.pharmacyDevice?.connectorKind, 'nsips_gateway');
  assert.deepStrictEqual(check.pharmacyDevice?.missingCapabilities, []);
});

test('buildPharmacyDeviceReadiness blocks public endpoints, unlicensed NSIPS, and stale versions', () => {
  const check = buildPharmacyDeviceReadiness({
    mode: 'connector',
    endpoint: 'https://connector.example.test/handoff',
    connectorKind: 'nsips_gateway',
    interfaceVersion: '1.06.03',
    facilityLocalOnlyConfirmed: false,
    nsipsLicenseConfirmed: false,
    capabilities: ['prescription_submit']
  });

  assert.strictEqual(check.status, 'blocked');
  assert.ok(check.requiredActions.some((action) => action.includes('施設内コネクタ')));
  assert.ok(check.requiredActions.some((action) => action.includes('利用申込')));
  assert.ok(check.requiredActions.some((action) => action.includes(CURRENT_NSIPS_INTERFACE_VERSION)));
  assert.ok(check.pharmacyDevice?.missingCapabilities.includes('prescription_cancel'));
});

test('buildPharmacyDeviceReadiness blocks unauthenticated and plain-http LAN connectors', () => {
  const check = buildPharmacyDeviceReadiness({
    mode: 'connector',
    endpoint: 'http://192.168.1.20:39300/handoff',
    connectorKind: 'vendor_api',
    interfaceVersion: 'vendor-v2',
    facilityLocalOnlyConfirmed: true,
    capabilities: [
      'prescription_submit',
      'prescription_replace',
      'prescription_cancel',
      'idempotent_submission',
      'status_response'
    ],
    lastAttempt: { outcome: 'success', responseShape: 'json_object' }
  });

  assert.strictEqual(check.status, 'blocked');
  assert.ok(check.requiredActions.some((action) => action.includes('https')));
  assert.ok(check.requiredActions.some((action) => action.includes('BEARER_TOKEN')));
});
