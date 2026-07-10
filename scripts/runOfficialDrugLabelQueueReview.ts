import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildOfficialDrugLabelQueueChecklist,
  buildOfficialDrugLabelQueueReview,
  buildOfficialDrugLabelQueueReviewCsv,
  collectOfficialDrugLabelDataMetrics,
  type OfficialDrugLabelQueueEntry
} from '../src/lib/official_drug_label_queue_review.ts';

const outputDir = process.env.YAKUREKI_DRUG_LABEL_QUEUE_REVIEW_OUTPUT_DIR
  || 'artifacts/official-drug-label-queue-review';
const queuePath = process.env.YAKUREKI_DRUG_LABEL_QUEUE_JSON
  || 'src/scripts/officialDrugInteractionIngredientQueue.json';
const drugInfosPath = process.env.YAKUREKI_DRUG_INFOS_JSON
  || 'src/lib/data/drug_infos.json';

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function stamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function main() {
  const generatedAt = new Date();
  const artifactDir = join(outputDir, stamp(generatedAt));
  await mkdir(artifactDir, { recursive: true });

  const [queueEntries, drugInfos] = await Promise.all([
    readJsonFile<OfficialDrugLabelQueueEntry[]>(queuePath),
    readJsonFile<unknown[]>(drugInfosPath)
  ]);

  const review = buildOfficialDrugLabelQueueReview({
    generatedAt,
    queueEntries,
    dataMetrics: collectOfficialDrugLabelDataMetrics(drugInfos)
  });
  const csv = buildOfficialDrugLabelQueueReviewCsv(review);
  const checklist = buildOfficialDrugLabelQueueChecklist(review);

  const reviewJsonPath = join(artifactDir, 'official-drug-label-queue-review.json');
  const reviewCsvPath = join(artifactDir, 'official-drug-label-queue-review.csv');
  const checklistPath = join(artifactDir, 'official-drug-label-queue-checklist.txt');

  await writeFile(reviewJsonPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  await writeFile(reviewCsvPath, `\ufeff${csv}\n`, 'utf8');
  await writeFile(checklistPath, `${checklist}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: review.status !== 'blocked',
    artifactDir,
    status: review.status,
    statusLabel: review.statusLabel,
    canCloseP401InternalGate: review.canCloseP401InternalGate,
    totalIngredientCount: review.totalIngredientCount,
    pendingCount: review.pendingCount,
    fetchErrorCount: review.fetchErrorCount,
    transientFetchFailureCount: review.fetchErrorSummary.transientFetchFailureCount,
    noOfficialCandidateCount: review.fetchErrorSummary.noOfficialCandidateCount,
    otherFetchErrorCount: review.fetchErrorSummary.otherFetchErrorCount,
    needsReviewCount: review.needsReviewCount,
    oldTargetDrugSchemaCount: review.dataMetrics.oldTargetDrugSchemaCount,
    keggSignalCount: review.dataMetrics.keggSignalCount,
    outputs: {
      reviewJson: reviewJsonPath,
      reviewCsv: reviewCsvPath,
      checklist: checklistPath
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
