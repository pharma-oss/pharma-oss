import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExternalConnectorReadinessReport } from '../src/lib/external_connector_readiness.ts';
import {
  buildOnlineEligibilityAuthEvidenceTemplate,
  buildOnlineEligibilityFieldCheckRequest,
  buildOnlineEligibilityFieldCheckRequestChecklist,
  buildOnlineEligibilityFieldReadinessCsv,
  buildOnlineEligibilityFieldReadinessReport,
  type OnlineEligibilityAuthEvidenceInput
} from '../src/lib/online_eligibility_field_readiness.ts';
import type { OnlineEligibilityResponseDiffReport } from '../src/lib/online_eligibility_response_diff.ts';

const connectorReadinessPath = process.env.YAKUREKI_ELIGIBILITY_CONNECTOR_READINESS || '';
const responseDiffPath = process.env.YAKUREKI_ELIGIBILITY_RESPONSE_DIFF || '';
const fieldEvidencePath = process.env.YAKUREKI_ELIGIBILITY_FIELD_EVIDENCE || '';
const outputDir = process.env.YAKUREKI_ELIGIBILITY_FIELD_OUTPUT_DIR
  || 'artifacts/online-eligibility-field-readiness';
const requestOnly = ['1', 'true', 'yes'].includes((process.env.YAKUREKI_ELIGIBILITY_FIELD_REQUEST_ONLY || '').toLowerCase());

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function readJsonFile<T>(path: string): Promise<T> {
  const text = await readFile(path, 'utf8');
  return JSON.parse(text) as T;
}

async function main() {
  const generatedAt = new Date();
  const artifactDir = join(outputDir, stamp(generatedAt));
  await mkdir(artifactDir, { recursive: true });

  const checkRequest = buildOnlineEligibilityFieldCheckRequest({ generatedAt });
  const checkRequestChecklist = buildOnlineEligibilityFieldCheckRequestChecklist(checkRequest);
  const checkRequestPath = join(artifactDir, 'online-eligibility-field-check-request.json');
  const checkRequestChecklistPath = join(artifactDir, 'online-eligibility-field-check-request.txt');

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
    throw new Error('YAKUREKI_ELIGIBILITY_CONNECTOR_READINESS に接続準備診断JSONを指定してください。');
  }
  if (!responseDiffPath) {
    throw new Error('YAKUREKI_ELIGIBILITY_RESPONSE_DIFF に公式レスポンス差分JSONを指定してください。');
  }

  const connectorReadiness = await readJsonFile<ExternalConnectorReadinessReport>(connectorReadinessPath);
  const responseDiff = await readJsonFile<OnlineEligibilityResponseDiffReport>(responseDiffPath);
  const authEvidence = fieldEvidencePath
    ? await readJsonFile<OnlineEligibilityAuthEvidenceInput>(fieldEvidencePath)
    : undefined;
  const report = buildOnlineEligibilityFieldReadinessReport({
    generatedAt,
    connectorReadiness,
    responseDiff,
    authEvidence
  });
  const csv = buildOnlineEligibilityFieldReadinessCsv(report);
  const template = buildOnlineEligibilityAuthEvidenceTemplate();

  const reportJsonPath = join(artifactDir, 'online-eligibility-field-readiness.json');
  const reportCsvPath = join(artifactDir, 'online-eligibility-field-readiness.csv');
  const templatePath = join(artifactDir, 'online-eligibility-field-evidence-template.json');
  await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(reportCsvPath, `﻿${csv}\n`, 'utf8');
  await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  await writeFile(checkRequestPath, `${JSON.stringify(checkRequest, null, 2)}\n`, 'utf8');
  await writeFile(checkRequestChecklistPath, `${checkRequestChecklist}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: report.status !== 'blocked',
    artifactDir,
    status: report.status,
    statusLabel: report.statusLabel,
    canRunFieldSuccessTrial: report.canRunFieldSuccessTrial,
    canAcceptOfficialResponseSample: report.canAcceptOfficialResponseSample,
    evidenceIntegrityStatus: report.evidenceIntegrity.status,
    evidenceIntegrityIssueCount: report.evidenceIntegrity.issues.length,
    outputs: {
      reportJson: reportJsonPath,
      reportCsv: reportCsvPath,
      evidenceTemplate: templatePath,
      checkRequest: checkRequestPath,
      checkRequestChecklist: checkRequestChecklistPath
    }
  }, null, 2));

  if (report.status === 'blocked') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
