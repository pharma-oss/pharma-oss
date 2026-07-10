import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildOfficialDrugLabelNoCandidateChecklist,
  buildOfficialDrugLabelNoCandidateEvidenceTemplate,
  buildOfficialDrugLabelNoCandidateReview,
  buildOfficialDrugLabelNoCandidateReviewCsv,
  collectOfficialDrugLabelNoCandidateEntries,
  type OfficialDrugLabelNoCandidateEvidenceInput
} from '../src/lib/official_drug_label_no_candidate_review.ts';
import type { OfficialDrugLabelQueueEntry } from '../src/lib/official_drug_label_queue_review.ts';

const outputDir = process.env.YAKUREKI_DRUG_LABEL_NO_CANDIDATE_OUTPUT_DIR
  || 'artifacts/official-drug-label-no-candidate-review';
const queuePath = process.env.YAKUREKI_DRUG_LABEL_QUEUE_JSON
  || 'src/scripts/officialDrugInteractionIngredientQueue.json';
const evidencePath = process.env.YAKUREKI_DRUG_LABEL_NO_CANDIDATE_EVIDENCE || '';

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

  const queueEntries = await readJsonFile<OfficialDrugLabelQueueEntry[]>(queuePath);
  const evidence = evidencePath
    ? await readJsonFile<OfficialDrugLabelNoCandidateEvidenceInput>(evidencePath)
    : undefined;
  const review = buildOfficialDrugLabelNoCandidateReview({
    generatedAt,
    noCandidateEntries: collectOfficialDrugLabelNoCandidateEntries(queueEntries),
    evidence
  });
  const csv = buildOfficialDrugLabelNoCandidateReviewCsv(review);
  const checklist = buildOfficialDrugLabelNoCandidateChecklist(review);
  const template = buildOfficialDrugLabelNoCandidateEvidenceTemplate({ generatedAt });

  const reviewJsonPath = join(artifactDir, 'official-drug-label-no-candidate-review.json');
  const reviewCsvPath = join(artifactDir, 'official-drug-label-no-candidate-review.csv');
  const checklistPath = join(artifactDir, 'official-drug-label-no-candidate-checklist.txt');
  const templatePath = join(artifactDir, 'official-drug-label-no-candidate-evidence-template.json');

  await writeFile(reviewJsonPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  await writeFile(reviewCsvPath, `\ufeff${csv}\n`, 'utf8');
  await writeFile(checklistPath, `${checklist}\n`, 'utf8');
  if (!evidencePath || review.status !== 'pass') {
    await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify({
    ok: review.status !== 'blocked',
    artifactDir,
    status: review.status,
    statusLabel: review.statusLabel,
    readyForNoOfficialLabelFoundClosure: review.readyForNoOfficialLabelFoundClosure,
    candidateCount: review.candidateCount,
    totalProductCount: review.totalProductCount,
    highProductCountCandidateCount: review.highProductCountCandidateCount,
    missingRepresentativeDocumentUrlCount: review.missingRepresentativeDocumentUrlCount,
    evidenceIntegrityStatus: review.evidenceIntegrity.status,
    outputs: {
      reviewJson: reviewJsonPath,
      reviewCsv: reviewCsvPath,
      checklist: checklistPath,
      evidenceTemplate: (!evidencePath || review.status !== 'pass') ? templatePath : undefined
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
