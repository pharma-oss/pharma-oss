import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildExternalConnectorReadinessCsv, buildExternalConnectorReadinessReport } from '../src/lib/external_connector_readiness.ts';
import {
  buildElectronicPrescriptionConnectorAuthSha256,
  runElectronicPrescriptionConnectorPreflight
} from '../src/lib/electronic_prescription_client.ts';

const outputDir = process.env.YAKUREKI_ELECTRONIC_PRESCRIPTION_PREFLIGHT_OUTPUT_DIR
  || 'artifacts/electronic-prescription-connector-preflight';

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function numberEnv(name: string): number | undefined {
  const text = process.env[name];
  if (text === undefined || text.trim() === '') return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

function buildLastAttemptEnvText(result: Awaited<ReturnType<typeof runElectronicPrescriptionConnectorPreflight>>): string {
  const authSha256 = buildElectronicPrescriptionConnectorAuthSha256(process.env.ELECTRONIC_PRESCRIPTION_BEARER_TOKEN);
  const lines = [
    `ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_OUTCOME=${result.lastAttempt.outcome || 'config_error'}`,
    `ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AT=${result.checkedAt}`,
    result.lastAttempt.statusCode === undefined
      ? ''
      : `ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_STATUS_CODE=${result.lastAttempt.statusCode}`,
    result.lastAttempt.durationMs === undefined
      ? ''
      : `ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_DURATION_MS=${result.lastAttempt.durationMs}`,
    `ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_RESPONSE_SHAPE=${result.responseShape}`,
    result.connectorEndpointSha256
      ? `ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_ENDPOINT_SHA256=${result.connectorEndpointSha256}`
      : '',
    result.connectorArtifactSha256
      ? `ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_ARTIFACT_SHA256=${result.connectorArtifactSha256}`
      : '',
    authSha256
      ? `ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AUTH_SHA256=${authSha256}`
      : '',
    result.connectorKind
      ? `ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND=${result.connectorKind}`
      : '',
    result.configuredCapabilities.length > 0
      ? `ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CAPABILITIES=${result.configuredCapabilities.join(',')}`
      : '',
    result.lastAttempt.errorCode
      ? `ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_ERROR_CODE=${result.lastAttempt.errorCode}`
      : ''
  ];
  return `${lines.filter(Boolean).join('\n')}\n`;
}

async function main() {
  const result = await runElectronicPrescriptionConnectorPreflight();
  const generatedAt = new Date(result.checkedAt);
  const artifactDir = join(outputDir, stamp(generatedAt));
  await mkdir(artifactDir, { recursive: true });

  const connectorReadiness = buildExternalConnectorReadinessReport({
    generatedAt,
    electronicPrescription: {
      mode: process.env.ELECTRONIC_PRESCRIPTION_MODE || 'off',
      endpoint: process.env.ELECTRONIC_PRESCRIPTION_ENDPOINT,
      bearerToken: process.env.ELECTRONIC_PRESCRIPTION_BEARER_TOKEN,
      timeoutMs: numberEnv('ELECTRONIC_PRESCRIPTION_TIMEOUT_MS'),
      connectorKind: process.env.ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND,
      connectorArtifactSha256: process.env.ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256,
      capabilities: process.env.ELECTRONIC_PRESCRIPTION_CAPABILITIES,
      csvMaxBytes: numberEnv('ELECTRONIC_PRESCRIPTION_CSV_MAX_BYTES'),
      requiredDisplayItems: process.env.ELECTRONIC_PRESCRIPTION_REQUIRED_DISPLAY_ITEMS,
      sharedFolderMode: process.env.ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_MODE,
      sharedFolderPollIntervalMs: numberEnv('ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_POLL_INTERVAL_MS'),
      sharedFolderStaleAfterMs: numberEnv('ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_STALE_AFTER_MS'),
      sharedFolderMaxPendingFiles: numberEnv('ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_MAX_PENDING_FILES'),
      sharedFolderPerformanceP95Ms: numberEnv('ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_PERFORMANCE_P95_MS'),
      sharedFolderRetryPolicyConfirmed: ['1', 'true', 'yes'].includes(String(process.env.ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_RETRY_POLICY_CONFIRMED || '').toLowerCase()),
      lastAttemptEndpointSha256: result.connectorEndpointSha256,
      lastAttemptAuthSha256: buildElectronicPrescriptionConnectorAuthSha256(process.env.ELECTRONIC_PRESCRIPTION_BEARER_TOKEN),
      lastAttemptConnectorKind: result.connectorKind,
      lastAttemptConnectorArtifactSha256: result.connectorArtifactSha256,
      lastAttemptCapabilities: result.configuredCapabilities,
      lastAttempt: result.lastAttempt
    }
  });

  const preflightPath = join(artifactDir, 'electronic-prescription-connector-preflight.json');
  const readinessJsonPath = join(artifactDir, 'electronic-prescription-connector-readiness.json');
  const readinessCsvPath = join(artifactDir, 'electronic-prescription-connector-readiness.csv');
  const lastAttemptEnvPath = join(artifactDir, 'electronic-prescription-last-attempt.env');

  await writeFile(preflightPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(readinessJsonPath, `${JSON.stringify(connectorReadiness, null, 2)}\n`, 'utf8');
  await writeFile(readinessCsvPath, `\ufeff${buildExternalConnectorReadinessCsv(connectorReadiness)}\n`, 'utf8');
  await writeFile(lastAttemptEnvPath, buildLastAttemptEnvText(result), 'utf8');

  console.log(JSON.stringify({
    ok: result.status === 'success',
    artifactDir,
    status: result.status,
    message: result.message,
    lastAttempt: result.lastAttempt,
    privacy: result.privacy,
    outputs: {
      preflightJson: preflightPath,
      connectorReadinessJson: readinessJsonPath,
      connectorReadinessCsv: readinessCsvPath,
      lastAttemptEnv: lastAttemptEnvPath
    }
  }, null, 2));

  if (result.status !== 'success') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
