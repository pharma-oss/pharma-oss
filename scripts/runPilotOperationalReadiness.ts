import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildPilotOperationalReadinessChecklist,
  buildPilotOperationalReadinessCsv,
  buildPilotOperationalReadinessEvidenceTemplate,
  buildPilotOperationalReadinessRequest,
  buildPilotOperationalReadinessRequestChecklist,
  buildPilotOperationalReadinessReview,
  type PilotOperationalReadinessEvidenceInput
} from '../src/lib/pilot_operational_readiness.ts';

const evidencePath = process.env.YAKUREKI_PILOT_OPERATIONAL_READINESS_EVIDENCE || '';
const outputDir = process.env.YAKUREKI_PILOT_OPERATIONAL_READINESS_OUTPUT_DIR || 'artifacts/pilot-operational-readiness';
const readinessId = process.env.YAKUREKI_PILOT_OPERATIONAL_READINESS_ID || 'pilot-operational-readiness';

const artifactPaths = {
  pilotKpiReview: process.env.YAKUREKI_PILOT_KPI_REVIEW_JSON || '',
  releaseOpsAcceptance: process.env.YAKUREKI_RELEASE_OPS_ACCEPTANCE_JSON || '',
  migrationAcceptance: process.env.YAKUREKI_MIGRATION_ACCEPTANCE_JSON || '',
  printFieldVerification: process.env.YAKUREKI_PRINT_FIELD_REVIEW_JSON || '',
  aiClinicalReview: process.env.YAKUREKI_AI_CLINICAL_REVIEW_JSON || '',
  onlineEligibilityFieldReadiness: process.env.YAKUREKI_ELIGIBILITY_FIELD_READINESS_JSON || '',
  electronicPrescriptionFieldReadiness: process.env.YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_READINESS_JSON || ''
} as const;

function stamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function readJsonFile<T>(path: string): Promise<T> {
  const text = await readFile(path, 'utf8');
  return JSON.parse(text) as T;
}

async function readOptionalJson<T>(path: string): Promise<T | undefined> {
  if (!path) return undefined;
  return readJsonFile<T>(path);
}

async function main() {
  const generatedAt = new Date();
  const artifactDir = join(outputDir, stamp(generatedAt));
  await mkdir(artifactDir, { recursive: true });

  const evidence = evidencePath
    ? await readJsonFile<PilotOperationalReadinessEvidenceInput>(evidencePath)
    : {};
  const review = buildPilotOperationalReadinessReview({
    generatedAt,
    evidence: {
      readinessId,
      ...evidence,
      pilotKpiReview: await readOptionalJson(artifactPaths.pilotKpiReview) ?? evidence.pilotKpiReview,
      releaseOpsAcceptance: await readOptionalJson(artifactPaths.releaseOpsAcceptance) ?? evidence.releaseOpsAcceptance,
      migrationAcceptance: await readOptionalJson(artifactPaths.migrationAcceptance) ?? evidence.migrationAcceptance,
      printFieldVerification: await readOptionalJson(artifactPaths.printFieldVerification) ?? evidence.printFieldVerification,
      aiClinicalReview: await readOptionalJson(artifactPaths.aiClinicalReview) ?? evidence.aiClinicalReview,
      onlineEligibilityFieldReadiness: await readOptionalJson(artifactPaths.onlineEligibilityFieldReadiness) ?? evidence.onlineEligibilityFieldReadiness,
      electronicPrescriptionFieldReadiness: await readOptionalJson(artifactPaths.electronicPrescriptionFieldReadiness) ?? evidence.electronicPrescriptionFieldReadiness
    }
  });
  const csv = buildPilotOperationalReadinessCsv(review);
  const template = buildPilotOperationalReadinessEvidenceTemplate({
    generatedAt,
    readinessId: review.readinessId,
    targets: review.targets
  });
  const checklist = buildPilotOperationalReadinessChecklist(review);
  const request = buildPilotOperationalReadinessRequest({
    generatedAt,
    readinessId: review.readinessId,
    targets: review.targets
  });
  const requestChecklist = buildPilotOperationalReadinessRequestChecklist(request);

  const reviewJsonPath = join(artifactDir, 'pilot-operational-readiness.json');
  const reviewCsvPath = join(artifactDir, 'pilot-operational-readiness.csv');
  const templatePath = join(artifactDir, 'pilot-operational-readiness-evidence-template.json');
  const checklistPath = join(artifactDir, 'pilot-operational-readiness-checklist.txt');
  const requestPath = join(artifactDir, 'pilot-operational-readiness-request.json');
  const requestChecklistPath = join(artifactDir, 'pilot-operational-readiness-request.txt');

  await writeFile(reviewJsonPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  await writeFile(reviewCsvPath, `\ufeff${csv}\n`, 'utf8');
  await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  await writeFile(checklistPath, `${checklist}\n`, 'utf8');
  await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, 'utf8');
  await writeFile(requestChecklistPath, `${requestChecklist}\n`, 'utf8');

  const ok = review.status !== 'blocked';
  console.log(JSON.stringify({
    ok,
    artifactDir,
    status: review.status,
    statusLabel: review.statusLabel,
    actionLabel: review.actionLabel,
    pilot: review.pilot,
    artifactStatus: Object.fromEntries(review.artifacts.map((artifact) => [artifact.id, artifact.status])),
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
      request: requestPath,
      requestChecklist: requestChecklistPath
    }
  }, null, 2));
  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
