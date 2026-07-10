import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildReleasePostReview,
  buildReleasePostReviewChecklist,
  buildReleasePostReviewCsv,
  buildReleasePostReviewEvidenceTemplate,
  type ReleasePostReviewEvidenceInput
} from '../src/lib/release_post_review.ts';

const evidencePath = process.env.YAKUREKI_RELEASE_POST_REVIEW_EVIDENCE || '';
const outputDir = process.env.YAKUREKI_RELEASE_POST_REVIEW_OUTPUT_DIR || 'artifacts/release-post-review';
const releaseId = process.env.YAKUREKI_RELEASE_ID || 'release-post-review';

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
    ? await readJsonFile<ReleasePostReviewEvidenceInput>(evidencePath)
    : undefined;
  const review = buildReleasePostReview({
    generatedAt,
    evidence: evidence ? { releaseId, ...evidence } : { releaseId }
  });
  const csv = buildReleasePostReviewCsv(review);
  const template = buildReleasePostReviewEvidenceTemplate({
    generatedAt,
    releaseId: review.releaseId,
    risk: review.risk
  });
  const checklist = buildReleasePostReviewChecklist(review);

  const reviewJsonPath = join(artifactDir, 'release-post-review.json');
  const reviewCsvPath = join(artifactDir, 'release-post-review.csv');
  const templatePath = join(artifactDir, 'release-post-review-evidence-template.json');
  const checklistPath = join(artifactDir, 'release-post-review-checklist.txt');

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
    risk: review.risk,
    riskLabel: review.riskLabel,
    observationHours: review.observationHours,
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
