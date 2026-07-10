import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildReleaseUpdateChecklist,
  buildReleaseUpdateEvidenceTemplate,
  buildReleaseUpdateReadinessCsv,
  buildReleaseUpdateReadinessReview,
  type ReleaseUpdateEvidenceInput
} from '../src/lib/release_update_readiness.ts';

const evidencePath = process.env.YAKUREKI_RELEASE_READINESS_EVIDENCE || '';
const outputDir = process.env.YAKUREKI_RELEASE_READINESS_OUTPUT_DIR || 'artifacts/release-update-readiness';
const releaseId = process.env.YAKUREKI_RELEASE_ID || 'release-update-readiness';

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
    ? await readJsonFile<ReleaseUpdateEvidenceInput>(evidencePath)
    : undefined;
  const review = buildReleaseUpdateReadinessReview({
    generatedAt,
    evidence: evidence ? { releaseId, ...evidence } : { releaseId }
  });
  const csv = buildReleaseUpdateReadinessCsv(review);
  const template = buildReleaseUpdateEvidenceTemplate({
    generatedAt,
    releaseId: review.releaseId,
    kind: review.kind,
    risk: review.risk
  });
  const checklist = buildReleaseUpdateChecklist(review);

  const reviewJsonPath = join(artifactDir, 'release-update-readiness-review.json');
  const reviewCsvPath = join(artifactDir, 'release-update-readiness-review.csv');
  const templatePath = join(artifactDir, 'release-update-readiness-evidence-template.json');
  const checklistPath = join(artifactDir, 'release-update-checklist.txt');

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
    kind: review.kind,
    kindLabel: review.kindLabel,
    risk: review.risk,
    riskLabel: review.riskLabel,
    passedGateCount: review.passedGateCount,
    attentionGateCount: review.attentionGateCount,
    blockedGateCount: review.blockedGateCount,
    rollbackTargetMinutes: review.rollbackTargetMinutes,
    expectedDowntimeMinutes: review.expectedDowntimeMinutes,
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
