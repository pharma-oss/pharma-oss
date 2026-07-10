import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildPilotKpiReview,
  buildPilotKpiReviewChecklist,
  buildPilotKpiReviewCsv,
  buildPilotKpiEvidenceRequest,
  buildPilotKpiEvidenceRequestChecklist,
  buildPilotKpiReviewEvidenceTemplate,
  type PilotKpiReviewEvidenceInput
} from '../src/lib/pilot_kpi_review.ts';

const evidencePath = process.env.YAKUREKI_PILOT_KPI_EVIDENCE || '';
const outputDir = process.env.YAKUREKI_PILOT_KPI_OUTPUT_DIR || 'artifacts/pilot-kpi-review';
const pilotId = process.env.YAKUREKI_PILOT_ID || 'pilot-kpi-review';

function stamp(date = new Date()): string {
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

  const evidence = evidencePath
    ? await readJsonFile<PilotKpiReviewEvidenceInput>(evidencePath)
    : undefined;
  const review = buildPilotKpiReview({
    generatedAt,
    evidence: evidence ? { pilotId, ...evidence } : { pilotId }
  });
  const csv = buildPilotKpiReviewCsv(review);
  const template = buildPilotKpiReviewEvidenceTemplate({
    generatedAt,
    pilotId: review.pilotId,
    targets: review.targets
  });
  const checklist = buildPilotKpiReviewChecklist(review);
  const evidenceRequest = buildPilotKpiEvidenceRequest({
    generatedAt,
    pilotId: review.pilotId,
    targets: review.targets
  });
  const evidenceRequestChecklist = buildPilotKpiEvidenceRequestChecklist(evidenceRequest);

  const reviewJsonPath = join(artifactDir, 'pilot-kpi-review.json');
  const reviewCsvPath = join(artifactDir, 'pilot-kpi-review.csv');
  const templatePath = join(artifactDir, 'pilot-kpi-evidence-template.json');
  const checklistPath = join(artifactDir, 'pilot-kpi-checklist.txt');
  const evidenceRequestPath = join(artifactDir, 'pilot-kpi-evidence-request.json');
  const evidenceRequestChecklistPath = join(artifactDir, 'pilot-kpi-evidence-request.txt');

  await writeFile(reviewJsonPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  await writeFile(reviewCsvPath, `\ufeff${csv}\n`, 'utf8');
  await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  await writeFile(checklistPath, `${checklist}\n`, 'utf8');
  await writeFile(evidenceRequestPath, `${JSON.stringify(evidenceRequest, null, 2)}\n`, 'utf8');
  await writeFile(evidenceRequestChecklistPath, `${evidenceRequestChecklist}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: review.status !== 'blocked',
    artifactDir,
    status: review.status,
    statusLabel: review.statusLabel,
    coverage: review.coverage,
    summary: review.summary,
    trendStatus: review.trend.status,
    trendStatusLabel: review.trend.statusLabel,
    worseningStoreCount: review.trend.worseningStoreCount,
    insufficientTrendStoreCount: review.trend.insufficientStoreCount,
    passedGateCount: review.passedGateCount,
    attentionGateCount: review.attentionGateCount,
    blockedGateCount: review.blockedGateCount,
    evidenceIntegrityStatus: review.evidenceIntegrity.status,
    evidenceIntegrityIssueCount: review.evidenceIntegrity.issues.length,
    outputs: {
      reviewJson: reviewJsonPath,
      reviewCsv: reviewCsvPath,
      evidenceTemplate: templatePath,
      checklist: checklistPath,
      evidenceRequest: evidenceRequestPath,
      evidenceRequestChecklist: evidenceRequestChecklistPath
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
