import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildSupportCaseDrillCsv,
  buildSupportCaseDrillEvidenceTemplate,
  buildSupportCaseDrillReview,
  type SupportCaseDrillEvidenceInput
} from '../src/lib/support_case_drill.ts';
import type { SupportCaseTriage } from '../src/lib/support_case_triage.ts';

const triagePath = process.env.YAKUREKI_SUPPORT_TRIAGE_JSON || '';
const evidencePath = process.env.YAKUREKI_SUPPORT_DRILL_EVIDENCE || '';
const outputDir = process.env.YAKUREKI_SUPPORT_DRILL_OUTPUT_DIR || 'artifacts/support-case-drill';
const scenarioId = process.env.YAKUREKI_SUPPORT_DRILL_SCENARIO_ID || 'support-case-drill';

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
  const evidence = evidencePath
    ? await readJsonFile<SupportCaseDrillEvidenceInput>(evidencePath)
    : undefined;
  const review = buildSupportCaseDrillReview({
    generatedAt,
    triage,
    evidence: evidence ? { scenarioId, ...evidence } : { scenarioId }
  });
  const csv = buildSupportCaseDrillCsv(review);
  const template = buildSupportCaseDrillEvidenceTemplate({
    generatedAt,
    triage,
    scenarioId: review.scenarioId,
    responseTargetMinutes: review.responseTargetMinutes
  });

  const reviewJsonPath = join(artifactDir, 'support-case-drill-review.json');
  const reviewCsvPath = join(artifactDir, 'support-case-drill-review.csv');
  const templatePath = join(artifactDir, 'support-case-drill-evidence-template.json');

  await writeFile(reviewJsonPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  await writeFile(reviewCsvPath, `\ufeff${csv}\n`, 'utf8');
  await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: review.status !== 'blocked',
    artifactDir,
    status: review.status,
    statusLabel: review.statusLabel,
    priority: review.priority,
    priorityLabel: review.priorityLabel,
    focusAreaCount: review.focusAreaCount,
    passedFocusAreaCount: review.passedFocusAreaCount,
    blockedFocusAreaCount: review.blockedFocusAreaCount,
    evidenceIntegrityStatus: review.evidenceIntegrity.status,
    evidenceIntegrityIssueCount: review.evidenceIntegrity.issues.length,
    responseMinutes: review.responseMinutes,
    outputs: {
      reviewJson: reviewJsonPath,
      reviewCsv: reviewCsvPath,
      evidenceTemplate: templatePath
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
