import { NextResponse } from 'next/server';
import { buildExternalConnectorReadinessReport, type ExternalConnectorLastAttemptInput } from '@/lib/external_connector_readiness';
import { getAppEnv } from '@/lib/env';

export async function GET() {
  const env = getAppEnv();

  return NextResponse.json(buildExternalConnectorReadinessReport({
    mynaCardReader: {
      mode: env.mynaCardReaderMode,
      endpoint: env.mynaCardReaderEndpoint || undefined,
      allowMockFallback: env.nodeEnv !== 'production' && env.mynaCardReaderAllowMock,
      timeoutMs: env.mynaCardReaderTimeoutMs,
      lastAttempt: env.mynaCardReaderLastAttemptOutcome ? {
        outcome: env.mynaCardReaderLastAttemptOutcome as ExternalConnectorLastAttemptInput['outcome'],
        attemptedAt: env.mynaCardReaderLastAttemptAt,
        statusCode: env.mynaCardReaderLastAttemptStatusCode,
        durationMs: env.mynaCardReaderLastAttemptDurationMs,
        responseShape: env.mynaCardReaderLastAttemptResponseShape as ExternalConnectorLastAttemptInput['responseShape'],
        errorCode: env.mynaCardReaderLastAttemptErrorCode,
      } : undefined
    },
    onlineEligibility: {
      mode: env.onlineEligibilityMode,
      endpoint: env.onlineEligibilityEndpoint || undefined,
      allowMockFallback: env.nodeEnv !== 'production' && env.onlineEligibilityAllowMock,
      bearerToken: env.onlineEligibilityBearerToken || undefined,
      timeoutMs: env.onlineEligibilityTimeoutMs,
      lastAttempt: env.onlineEligibilityLastAttemptOutcome ? {
        outcome: env.onlineEligibilityLastAttemptOutcome as ExternalConnectorLastAttemptInput['outcome'],
        attemptedAt: env.onlineEligibilityLastAttemptAt,
        statusCode: env.onlineEligibilityLastAttemptStatusCode,
        durationMs: env.onlineEligibilityLastAttemptDurationMs,
        responseShape: env.onlineEligibilityLastAttemptResponseShape as ExternalConnectorLastAttemptInput['responseShape'],
        errorCode: env.onlineEligibilityLastAttemptErrorCode,
      } : undefined
    },
    electronicPrescription: {
      mode: env.electronicPrescriptionMode,
      endpoint: env.electronicPrescriptionEndpoint || undefined,
      bearerToken: env.electronicPrescriptionBearerToken || undefined,
      timeoutMs: env.electronicPrescriptionTimeoutMs,
      connectorKind: env.electronicPrescriptionConnectorKind,
      connectorArtifactSha256: env.electronicPrescriptionConnectorArtifactSha256,
      capabilities: env.electronicPrescriptionCapabilities,
      csvMaxBytes: env.electronicPrescriptionCsvMaxBytes,
      requiredDisplayItems: env.electronicPrescriptionRequiredDisplayItems,
      sharedFolderMode: env.electronicPrescriptionSharedFolderMode,
      sharedFolderPollIntervalMs: env.electronicPrescriptionSharedFolderPollIntervalMs,
      sharedFolderStaleAfterMs: env.electronicPrescriptionSharedFolderStaleAfterMs,
      sharedFolderMaxPendingFiles: env.electronicPrescriptionSharedFolderMaxPendingFiles,
      sharedFolderPerformanceP95Ms: env.electronicPrescriptionSharedFolderPerformanceP95Ms,
      sharedFolderRetryPolicyConfirmed: env.electronicPrescriptionSharedFolderRetryPolicyConfirmed,
      lastAttemptEndpointSha256: env.electronicPrescriptionLastAttemptEndpointSha256,
      lastAttemptAuthSha256: env.electronicPrescriptionLastAttemptAuthSha256,
      lastAttemptConnectorKind: env.electronicPrescriptionLastAttemptConnectorKind,
      lastAttemptConnectorArtifactSha256: env.electronicPrescriptionLastAttemptConnectorArtifactSha256,
      lastAttemptCapabilities: env.electronicPrescriptionLastAttemptCapabilities,
      lastAttempt: env.electronicPrescriptionLastAttemptOutcome ? {
        outcome: env.electronicPrescriptionLastAttemptOutcome as ExternalConnectorLastAttemptInput['outcome'],
        attemptedAt: env.electronicPrescriptionLastAttemptAt,
        statusCode: env.electronicPrescriptionLastAttemptStatusCode,
        durationMs: env.electronicPrescriptionLastAttemptDurationMs,
        responseShape: env.electronicPrescriptionLastAttemptResponseShape as ExternalConnectorLastAttemptInput['responseShape'],
        errorCode: env.electronicPrescriptionLastAttemptErrorCode,
      } : undefined
    },
    pharmacyDevice: {
      mode: env.pharmacyDeviceConnectorMode,
      endpoint: env.pharmacyDeviceConnectorEndpoint || undefined,
      bearerToken: env.pharmacyDeviceConnectorBearerToken || undefined,
      timeoutMs: env.pharmacyDeviceConnectorTimeoutMs,
      connectorKind: env.pharmacyDeviceConnectorKind,
      interfaceVersion: env.pharmacyDeviceConnectorInterfaceVersion,
      facilityLocalOnlyConfirmed: env.pharmacyDeviceConnectorFacilityLocalOnly,
      nsipsLicenseConfirmed: env.pharmacyDeviceConnectorNsipsLicenseConfirmed,
      capabilities: env.pharmacyDeviceConnectorCapabilities,
      lastAttempt: env.pharmacyDeviceConnectorLastAttemptOutcome ? {
        outcome: env.pharmacyDeviceConnectorLastAttemptOutcome as ExternalConnectorLastAttemptInput['outcome'],
        attemptedAt: env.pharmacyDeviceConnectorLastAttemptAt,
        statusCode: env.pharmacyDeviceConnectorLastAttemptStatusCode,
        durationMs: env.pharmacyDeviceConnectorLastAttemptDurationMs,
        responseShape: env.pharmacyDeviceConnectorLastAttemptResponseShape as ExternalConnectorLastAttemptInput['responseShape'],
        errorCode: env.pharmacyDeviceConnectorLastAttemptErrorCode,
      } : undefined
    }
  }));
}
