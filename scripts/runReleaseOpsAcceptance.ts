import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildReleaseOpsAcceptanceChecklist,
  buildReleaseOpsAcceptanceCsv,
  buildReleaseOpsAcceptanceEvidenceTemplate,
  buildReleaseOpsAcceptanceReview,
  type ReleaseOpsAcceptanceEvidenceInput
} from '../src/lib/release_ops_acceptance.ts';
import type { ReleasePostReview } from '../src/lib/release_post_review.ts';
import type { ReleaseUpdateReadinessReview } from '../src/lib/release_update_readiness.ts';
import type { SupportCaseDrillReview } from '../src/lib/support_case_drill.ts';
import type { SupportIncidentSlaReview } from '../src/lib/support_incident_sla.ts';

const evidencePath = process.env.YAKUREKI_RELEASE_OPS_ACCEPTANCE_EVIDENCE || '';
const readinessPath = process.env.YAKUREKI_RELEASE_READINESS_REVIEW_JSON || '';
const postReviewPath = process.env.YAKUREKI_RELEASE_POST_REVIEW_JSON || '';
const slaReviewPath = process.env.YAKUREKI_SUPPORT_SLA_REVIEW_JSON || '';
const supportDrillPath = process.env.YAKUREKI_SUPPORT_DRILL_REVIEW_JSON || '';
const outputDir = process.env.YAKUREKI_RELEASE_OPS_ACCEPTANCE_OUTPUT_DIR || 'artifacts/release-ops-acceptance';
const acceptanceId = process.env.YAKUREKI_RELEASE_OPS_ACCEPTANCE_ID || 'release-ops-acceptance';

function stamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function readJsonFile<T>(path: string): Promise<T> {
  const text = await readFile(path, 'utf8');
  return JSON.parse(text) as T;
}

async function readOptionalJson<T>(path: string): Promise<T | undefined> {
  return path ? readJsonFile<T>(path) : undefined;
}

async function main() {
  const generatedAt = new Date();
  const artifactDir = join(outputDir, stamp(generatedAt));
  await mkdir(artifactDir, { recursive: true });

  const evidence = evidencePath
    ? await readJsonFile<ReleaseOpsAcceptanceEvidenceInput>(evidencePath)
    : {};
  const review = buildReleaseOpsAcceptanceReview({
    generatedAt,
    evidence: {
      acceptanceId,
      ...evidence,
      readinessReview: evidence.readinessReview ?? await readOptionalJson<ReleaseUpdateReadinessReview>(readinessPath),
      releasePostReview: evidence.releasePostReview ?? await readOptionalJson<ReleasePostReview>(postReviewPath),
      slaReview: evidence.slaReview ?? await readOptionalJson<SupportIncidentSlaReview>(slaReviewPath),
      supportDrillReview: evidence.supportDrillReview ?? await readOptionalJson<SupportCaseDrillReview>(supportDrillPath)
    }
  });
  const csv = buildReleaseOpsAcceptanceCsv(review);
  const template = buildReleaseOpsAcceptanceEvidenceTemplate({
    generatedAt,
    acceptanceId: review.acceptanceId
  });
  const checklist = buildReleaseOpsAcceptanceChecklist(review);

  const reviewJsonPath = join(artifactDir, 'release-ops-acceptance.json');
  const reviewCsvPath = join(artifactDir, 'release-ops-acceptance.csv');
  const templatePath = join(artifactDir, 'release-ops-acceptance-evidence-template.json');
  const checklistPath = join(artifactDir, 'release-ops-acceptance-checklist.txt');

  await writeFile(reviewJsonPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  await writeFile(reviewCsvPath, `\ufeff${csv}\n`, 'utf8');
  await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  await writeFile(checklistPath, `${checklist}\n`, 'utf8');

  const ok = review.status !== 'blocked';
  console.log(JSON.stringify({
    ok,
    artifactDir,
    status: review.status,
    statusLabel: review.statusLabel,
    evidenceIntegrityStatus: review.evidenceIntegrity.status,
    evidenceIntegrityIssueCount: review.evidenceIntegrity.issues.length,
    linkageStatus: review.linkage.status,
    linkageStatusLabel: review.linkage.statusLabel,
    releaseIdsMatch: review.linkage.releaseIdsMatch,
    sharedFocusAreaIds: review.linkage.sharedFocusAreaIds,
    sources: review.sources,
    passedGateCount: review.passedGateCount,
    attentionGateCount: review.attentionGateCount,
    blockedGateCount: review.blockedGateCount,
    metrics: review.metrics,
    outputs: {
      reviewJson: reviewJsonPath,
      reviewCsv: reviewCsvPath,
      evidenceTemplate: templatePath,
      checklist: checklistPath
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
