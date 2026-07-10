import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExternalConnectorReadinessReport } from '../src/lib/external_connector_readiness.ts';
import {
  buildPharmacyDeviceFieldCheckRequest,
  buildPharmacyDeviceFieldCheckRequestChecklist,
  buildPharmacyDeviceFieldChecklist,
  buildPharmacyDeviceFieldEvidenceTemplate,
  buildPharmacyDeviceFieldReadinessCsv,
  buildPharmacyDeviceFieldReadinessReport,
  type PharmacyDeviceFieldEvidenceInput
} from '../src/lib/pharmacy_device_field_readiness.ts';

const connectorPath = process.env.YAKUREKI_PHARMACY_DEVICE_CONNECTOR_READINESS || '';
const evidencePath = process.env.YAKUREKI_PHARMACY_DEVICE_FIELD_EVIDENCE || '';
const outputDir = process.env.YAKUREKI_PHARMACY_DEVICE_FIELD_OUTPUT_DIR || 'artifacts/pharmacy-device-field-readiness';
const requestOnly = ['1', 'true', 'yes'].includes((process.env.YAKUREKI_PHARMACY_DEVICE_FIELD_REQUEST_ONLY || '').toLowerCase());

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function main() {
  const generatedAt = new Date();
  const artifactDir = join(outputDir, stamp(generatedAt));
  await mkdir(artifactDir, { recursive: true });

  const checkRequest = buildPharmacyDeviceFieldCheckRequest({ generatedAt });
  const checkRequestChecklist = buildPharmacyDeviceFieldCheckRequestChecklist(checkRequest);
  const checkRequestPath = join(artifactDir, 'pharmacy-device-field-check-request.json');
  const checkRequestChecklistPath = join(artifactDir, 'pharmacy-device-field-check-request.txt');

  if (requestOnly) {
    await writeFile(checkRequestPath, `${JSON.stringify(checkRequest, null, 2)}\n`, 'utf8');
    await writeFile(checkRequestChecklistPath, `${checkRequestChecklist}\n`, 'utf8');
    console.log(JSON.stringify({
      ok: true,
      mode: 'request_only',
      artifactDir,
      outputs: {
        checkRequest: checkRequestPath,
        checkRequestChecklist: checkRequestChecklistPath
      }
    }, null, 2));
    return;
  }

  if (!connectorPath) {
    throw new Error('YAKUREKI_PHARMACY_DEVICE_CONNECTOR_READINESS に接続準備診断JSONを指定してください。');
  }
  const report = buildPharmacyDeviceFieldReadinessReport({
    generatedAt,
    connectorReadiness: await readJson<ExternalConnectorReadinessReport>(connectorPath),
    fieldEvidence: evidencePath ? await readJson<PharmacyDeviceFieldEvidenceInput>(evidencePath) : undefined
  });
  const outputs = {
    reportJson: join(artifactDir, 'pharmacy-device-field-readiness.json'),
    reportCsv: join(artifactDir, 'pharmacy-device-field-readiness.csv'),
    checklist: join(artifactDir, 'pharmacy-device-field-checklist.txt'),
    evidenceTemplate: join(artifactDir, 'pharmacy-device-field-evidence-template.json'),
    checkRequest: checkRequestPath,
    checkRequestChecklist: checkRequestChecklistPath
  };
  await writeFile(outputs.reportJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(outputs.reportCsv, `\ufeff${buildPharmacyDeviceFieldReadinessCsv(report)}\n`, 'utf8');
  await writeFile(outputs.checklist, `${buildPharmacyDeviceFieldChecklist(report)}\n`, 'utf8');
  await writeFile(outputs.evidenceTemplate, `${JSON.stringify(buildPharmacyDeviceFieldEvidenceTemplate(), null, 2)}\n`, 'utf8');
  await writeFile(checkRequestPath, `${JSON.stringify(checkRequest, null, 2)}\n`, 'utf8');
  await writeFile(checkRequestChecklistPath, `${checkRequestChecklist}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: report.status !== 'blocked',
    artifactDir,
    status: report.status,
    statusLabel: report.statusLabel,
    canStartFieldTrial: report.canStartFieldTrial,
    canDeclareStableOperation: report.canDeclareStableOperation,
    evidenceIntegrityStatus: report.evidenceIntegrity.status,
    outputs
  }, null, 2));
  if (report.status === 'blocked') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
