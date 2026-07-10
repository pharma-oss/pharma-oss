import { NextResponse } from 'next/server';
import { buildExternalConnectorReadinessReport, type ExternalConnectorLastAttemptInput } from '@/lib/external_connector_readiness';

function allowsMockFallback(value?: string) {
  return process.env.NODE_ENV !== 'production' || ['1', 'true', 'yes'].includes((value || '').toLowerCase());
}

function isConfirmed(value?: string) {
  return ['1', 'true', 'yes'].includes((value || '').toLowerCase());
}

function readLastAttempt(prefix: string): ExternalConnectorLastAttemptInput | undefined {
  const outcome = process.env[`${prefix}_LAST_ATTEMPT_OUTCOME`];
  if (!outcome) return undefined;
  const statusCode = Number(process.env[`${prefix}_LAST_ATTEMPT_STATUS_CODE`] || '');
  const durationMs = Number(process.env[`${prefix}_LAST_ATTEMPT_DURATION_MS`] || '');
  return {
    outcome: outcome as ExternalConnectorLastAttemptInput['outcome'],
    attemptedAt: process.env[`${prefix}_LAST_ATTEMPT_AT`],
    statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
    durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
    responseShape: process.env[`${prefix}_LAST_ATTEMPT_RESPONSE_SHAPE`] as ExternalConnectorLastAttemptInput['responseShape'],
    errorCode: process.env[`${prefix}_LAST_ATTEMPT_ERROR_CODE`]
  };
}

export async function GET() {
  const mynaTimeoutMs = Number(process.env.MYNA_CARD_READER_TIMEOUT_MS || 8000);
  const eligibilityTimeoutMs = Number(process.env.ONLINE_ELIGIBILITY_TIMEOUT_MS || 8000);
  const electronicPrescriptionTimeoutMs = Number(process.env.ELECTRONIC_PRESCRIPTION_TIMEOUT_MS || 10000);
  const pharmacyDeviceTimeoutMs = Number(process.env.PHARMACY_DEVICE_CONNECTOR_TIMEOUT_MS || 8000);

  return NextResponse.json(buildExternalConnectorReadinessReport({
    mynaCardReader: {
      mode: process.env.MYNA_CARD_READER_MODE || 'auto',
      endpoint: process.env.MYNA_CARD_READER_ENDPOINT,
      allowMockFallback: allowsMockFallback(process.env.MYNA_CARD_READER_ALLOW_MOCK),
      timeoutMs: Number.isFinite(mynaTimeoutMs) ? mynaTimeoutMs : undefined,
      lastAttempt: readLastAttempt('MYNA_CARD_READER')
    },
    onlineEligibility: {
      mode: process.env.ONLINE_ELIGIBILITY_MODE || 'auto',
      endpoint: process.env.ONLINE_ELIGIBILITY_ENDPOINT,
      allowMockFallback: allowsMockFallback(process.env.ONLINE_ELIGIBILITY_ALLOW_MOCK),
      bearerToken: process.env.ONLINE_ELIGIBILITY_BEARER_TOKEN,
      timeoutMs: Number.isFinite(eligibilityTimeoutMs) ? eligibilityTimeoutMs : undefined,
      lastAttempt: readLastAttempt('ONLINE_ELIGIBILITY')
    },
    electronicPrescription: {
      mode: process.env.ELECTRONIC_PRESCRIPTION_MODE || 'off',
      endpoint: process.env.ELECTRONIC_PRESCRIPTION_ENDPOINT,
      bearerToken: process.env.ELECTRONIC_PRESCRIPTION_BEARER_TOKEN,
      timeoutMs: Number.isFinite(electronicPrescriptionTimeoutMs) ? electronicPrescriptionTimeoutMs : undefined,
      connectorKind: process.env.ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND,
      connectorArtifactSha256: process.env.ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256,
      capabilities: process.env.ELECTRONIC_PRESCRIPTION_CAPABILITIES,
      csvMaxBytes: Number(process.env.ELECTRONIC_PRESCRIPTION_CSV_MAX_BYTES || ''),
      requiredDisplayItems: process.env.ELECTRONIC_PRESCRIPTION_REQUIRED_DISPLAY_ITEMS,
      sharedFolderMode: process.env.ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_MODE,
      sharedFolderPollIntervalMs: Number(process.env.ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_POLL_INTERVAL_MS || ''),
      sharedFolderStaleAfterMs: Number(process.env.ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_STALE_AFTER_MS || ''),
      sharedFolderMaxPendingFiles: Number(process.env.ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_MAX_PENDING_FILES || ''),
      sharedFolderPerformanceP95Ms: Number(process.env.ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_PERFORMANCE_P95_MS || ''),
      sharedFolderRetryPolicyConfirmed: isConfirmed(process.env.ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_RETRY_POLICY_CONFIRMED),
      lastAttemptEndpointSha256: process.env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_ENDPOINT_SHA256,
      lastAttemptAuthSha256: process.env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AUTH_SHA256,
      lastAttemptConnectorKind: process.env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND,
      lastAttemptConnectorArtifactSha256: process.env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_ARTIFACT_SHA256,
      lastAttemptCapabilities: process.env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CAPABILITIES,
      lastAttempt: readLastAttempt('ELECTRONIC_PRESCRIPTION')
    },
    pharmacyDevice: {
      mode: process.env.PHARMACY_DEVICE_CONNECTOR_MODE || 'off',
      endpoint: process.env.PHARMACY_DEVICE_CONNECTOR_ENDPOINT,
      bearerToken: process.env.PHARMACY_DEVICE_CONNECTOR_BEARER_TOKEN,
      timeoutMs: Number.isFinite(pharmacyDeviceTimeoutMs) ? pharmacyDeviceTimeoutMs : undefined,
      connectorKind: process.env.PHARMACY_DEVICE_CONNECTOR_KIND,
      interfaceVersion: process.env.PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION,
      facilityLocalOnlyConfirmed: isConfirmed(process.env.PHARMACY_DEVICE_CONNECTOR_FACILITY_LOCAL_ONLY),
      nsipsLicenseConfirmed: isConfirmed(process.env.PHARMACY_DEVICE_CONNECTOR_NSIPS_LICENSE_CONFIRMED),
      capabilities: process.env.PHARMACY_DEVICE_CONNECTOR_CAPABILITIES,
      lastAttempt: readLastAttempt('PHARMACY_DEVICE_CONNECTOR')
    }
  }));
}
