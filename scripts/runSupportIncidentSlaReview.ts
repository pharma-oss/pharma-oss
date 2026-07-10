import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildSupportIncidentNoticeChecklist,
  buildSupportIncidentSlaCheckRequest,
  buildSupportIncidentSlaCheckRequestChecklist,
  buildSupportIncidentSlaCsv,
  buildSupportIncidentSlaEvidenceTemplate,
  buildSupportIncidentSlaReview,
  type SupportIncidentSlaEvidenceInput
} from '../src/lib/support_incident_sla.ts';
import type { SupportCaseTriage } from '../src/lib/support_case_triage.ts';

const triagePath = process.env.YAKUREKI_SUPPORT_TRIAGE_JSON || '';
const evidencePath = process.env.YAKUREKI_SUPPORT_SLA_EVIDENCE || '';
const outputDir = process.env.YAKUREKI_SUPPORT_SLA_OUTPUT_DIR || 'artifacts/support-incident-sla';
const incidentId = process.env.YAKUREKI_SUPPORT_INCIDENT_ID || 'support-incident-sla';
const requestOnly = ['1', 'true', 'yes'].includes((process.env.YAKUREKI_SUPPORT_SLA_REQUEST_ONLY || '').toLowerCase());

function stamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function readJsonFile<T>(path: string): Promise<T> {
  const text = await readFile(path, 'utf8');
  return JSON.parse(text) as T;
}

async function main() {
  if (!triagePath) {
    throw new Error('YAKUREKI_SUPPORT_TRIAGE_JSON にサポートトリアージJSONを指定してください。');
  }

  const generatedAt = new Date();
  const artifactDir = join(outputDir, stamp(generatedAt));
  await mkdir(artifactDir, { recursive: true });

  const triage = await readJsonFile<SupportCaseTriage>(triagePath);
  const checkRequest = buildSupportIncidentSlaCheckRequest({ generatedAt, triage, incidentId });
  const checkRequestChecklist = buildSupportIncidentSlaCheckRequestChecklist(checkRequest);
  const checkRequestPath = join(artifactDir, 'support-incident-sla-check-request.json');
  const checkRequestChecklistPath = join(artifactDir, 'support-incident-sla-check-request.txt');

  if (requestOnly) {
    await writeFile(checkRequestPath, `${JSON.stringify(checkRequest, null, 2)}\n`, 'utf8');
    await writeFile(checkRequestChecklistPath, `${checkRequestChecklist}\n`, 'utf8');
    console.log(JSON.stringify({
      ok: true,
      mode: 'request_only',
      artifactDir,
      severity: checkRequest.severity,
      severityLabel: checkRequest.severityLabel,
      outputs: {
        checkRequest: checkRequestPath,
        checkRequestChecklist: checkRequestChecklistPath
      }
    }, null, 2));
    return;
  }

  const evidence = evidencePath
    ? await readJsonFile<SupportIncidentSlaEvidenceInput>(evidencePath)
    : undefined;
  const review = buildSupportIncidentSlaReview({
    generatedAt,
    triage,
    evidence: evidence ? { incidentId, ...evidence } : { incidentId }
  });
  const csv = buildSupportIncidentSlaCsv(review);
  const template = buildSupportIncidentSlaEvidenceTemplate({
    generatedAt,
    triage,
    incidentId: review.incidentId
  });
  const checklist = buildSupportIncidentNoticeChecklist(review);

  const reviewJsonPath = join(artifactDir, 'support-incident-sla-review.json');
  const reviewCsvPath = join(artifactDir, 'support-incident-sla-review.csv');
  const templatePath = join(artifactDir, 'support-incident-sla-evidence-template.json');
  const checklistPath = join(artifactDir, 'support-incident-notice-checklist.txt');

  await writeFile(reviewJsonPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  await writeFile(reviewCsvPath, `\ufeff${csv}\n`, 'utf8');
  await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  await writeFile(checklistPath, `${checklist}\n`, 'utf8');
  await writeFile(checkRequestPath, `${JSON.stringify(checkRequest, null, 2)}\n`, 'utf8');
  await writeFile(checkRequestChecklistPath, `${checkRequestChecklist}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: review.status !== 'blocked',
    artifactDir,
    status: review.status,
    statusLabel: review.statusLabel,
    priority: review.priority,
    priorityLabel: review.priorityLabel,
    severity: review.severity,
    severityLabel: review.severityLabel,
    passedGateCount: review.passedGateCount,
    attentionGateCount: review.attentionGateCount,
    blockedGateCount: review.blockedGateCount,
    evidenceIntegrityStatus: review.evidenceIntegrity.status,
    evidenceIntegrityIssueCount: review.evidenceIntegrity.issues.length,
    acknowledgeMinutes: review.elapsed.acknowledgeMinutes,
    firstNoticeMinutes: review.elapsed.firstNoticeMinutes,
    recoveryMinutes: review.elapsed.recoveryMinutes,
    outputs: {
      reviewJson: reviewJsonPath,
      reviewCsv: reviewCsvPath,
      evidenceTemplate: templatePath,
      noticeChecklist: checklistPath,
      checkRequest: checkRequestPath,
      checkRequestChecklist: checkRequestChecklistPath
    }
  }, null, 2));
  if (review.status === 'blocked') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
