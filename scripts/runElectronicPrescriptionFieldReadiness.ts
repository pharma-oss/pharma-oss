import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExternalConnectorReadinessReport } from '../src/lib/external_connector_readiness.ts';
import {
  buildElectronicPrescriptionFieldCheckRequest,
  buildElectronicPrescriptionFieldCheckRequestChecklist,
  buildElectronicPrescriptionFieldChecklist,
  buildElectronicPrescriptionFieldEvidenceTemplate,
  buildElectronicPrescriptionFieldReadinessCsv,
  buildElectronicPrescriptionFieldReadinessReport,
  type ElectronicPrescriptionFieldEvidenceInput
} from '../src/lib/electronic_prescription_field_readiness.ts';

const connectorReadinessPath = process.env.YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_READINESS || '';
const connectorContractPath = process.env.YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_CONTRACT_REPORT || '';
const fieldEvidencePath = process.env.YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_EVIDENCE || '';
const outputDir = process.env.YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_OUTPUT_DIR
  || 'artifacts/electronic-prescription-field-readiness';
const requestOnly = ['1', 'true', 'yes'].includes(
  (process.env.YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_REQUEST_ONLY || '').toLowerCase()
);

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function main() {
  const generatedAt = new Date();
  const artifactDir = join(outputDir, stamp(generatedAt));
  await mkdir(artifactDir, { recursive: true });

  const checkRequest = buildElectronicPrescriptionFieldCheckRequest({ generatedAt });
  const checkRequestChecklist = buildElectronicPrescriptionFieldCheckRequestChecklist(checkRequest);
  const checkRequestPath = join(artifactDir, 'electronic-prescription-field-check-request.json');
  const checkRequestChecklistPath = join(artifactDir, 'electronic-prescription-field-check-request.txt');

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

  if (!connectorReadinessPath) {
    throw new Error('YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_READINESS に接続準備診断JSONを指定してください。');
  }

  const connectorReadiness = await readJsonFile<ExternalConnectorReadinessReport>(connectorReadinessPath);
  const connectorContract = connectorContractPath
    ? await readJsonFile<unknown>(connectorContractPath)
    : undefined;
  const fieldEvidence = fieldEvidencePath
    ? await readJsonFile<ElectronicPrescriptionFieldEvidenceInput>(fieldEvidencePath)
    : undefined;
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness,
    connectorContract,
    fieldEvidence
  });
  const csv = buildElectronicPrescriptionFieldReadinessCsv(report);
  const checklist = buildElectronicPrescriptionFieldChecklist(report);
  const template = buildElectronicPrescriptionFieldEvidenceTemplate();

  const reportJsonPath = join(artifactDir, 'electronic-prescription-field-readiness.json');
  const reportCsvPath = join(artifactDir, 'electronic-prescription-field-readiness.csv');
  const checklistPath = join(artifactDir, 'electronic-prescription-field-checklist.txt');
  const templatePath = join(artifactDir, 'electronic-prescription-field-evidence-template.json');
  await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(reportCsvPath, `﻿${csv}\n`, 'utf8');
  await writeFile(checklistPath, `${checklist}\n`, 'utf8');
  await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  await writeFile(checkRequestPath, `${JSON.stringify(checkRequest, null, 2)}\n`, 'utf8');
  await writeFile(checkRequestChecklistPath, `${checkRequestChecklist}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: report.status !== 'blocked',
    artifactDir,
    status: report.status,
    statusLabel: report.statusLabel,
    canStartOfficialFieldTrial: report.canStartOfficialFieldTrial,
    canDeclareOperationalReadiness: report.canDeclareOperationalReadiness,
    connectorContractStatus: report.connectorContract?.status,
    evidenceIntegrityStatus: report.evidenceIntegrity.status,
    evidenceIntegrityIssueCount: report.evidenceIntegrity.issues.length,
    outputs: {
      reportJson: reportJsonPath,
      reportCsv: reportCsvPath,
      checklist: checklistPath,
      evidenceTemplate: templatePath,
      checkRequest: checkRequestPath,
      checkRequestChecklist: checkRequestChecklistPath
    }
  }, null, 2));

  if (report.status === 'blocked') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
