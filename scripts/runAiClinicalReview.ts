import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildAiClinicalReview,
  buildAiClinicalReviewCheckRequest,
  buildAiClinicalReviewCheckRequestChecklist,
  buildAiClinicalReviewChecklist,
  buildAiClinicalReviewCsv,
  buildAiClinicalReviewEvidenceTemplate,
  type AiClinicalReviewEvidenceInput
} from '../src/lib/ai_clinical_review.ts';

const evidencePath = process.env.YAKUREKI_AI_CLINICAL_REVIEW_EVIDENCE || '';
const outputDir = process.env.YAKUREKI_AI_CLINICAL_REVIEW_OUTPUT_DIR || 'artifacts/ai-clinical-review';
const reviewId = process.env.YAKUREKI_AI_CLINICAL_REVIEW_ID || 'ai-clinical-review';
const requestOnly = ['1', 'true', 'yes'].includes((process.env.YAKUREKI_AI_CLINICAL_REVIEW_REQUEST_ONLY || '').toLowerCase());

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

  const checkRequest = buildAiClinicalReviewCheckRequest({ generatedAt, reviewId });
  const checkRequestChecklist = buildAiClinicalReviewCheckRequestChecklist(checkRequest);
  const checkRequestPath = join(artifactDir, 'ai-clinical-review-check-request.json');
  const checkRequestChecklistPath = join(artifactDir, 'ai-clinical-review-check-request.txt');

  if (requestOnly) {
    await writeFile(checkRequestPath, `${JSON.stringify(checkRequest, null, 2)}\n`, 'utf8');
    await writeFile(checkRequestChecklistPath, `${checkRequestChecklist}\n`, 'utf8');
    console.log(JSON.stringify({
      ok: true,
      mode: 'request_only',
      artifactDir,
      reviewId: checkRequest.reviewId,
      outputs: {
        checkRequest: checkRequestPath,
        checkRequestChecklist: checkRequestChecklistPath
      }
    }, null, 2));
    return;
  }

  const evidence = evidencePath
    ? await readJsonFile<AiClinicalReviewEvidenceInput>(evidencePath)
    : {};
  const review = buildAiClinicalReview({
    generatedAt,
    evidence: {
      reviewId,
      ...evidence
    }
  });
  const csv = buildAiClinicalReviewCsv(review);
  const template = buildAiClinicalReviewEvidenceTemplate({
    generatedAt,
    reviewId: review.reviewId,
    targets: review.targets
  });
  const checklist = buildAiClinicalReviewChecklist(review);

  const reviewJsonPath = join(artifactDir, 'ai-clinical-review.json');
  const reviewCsvPath = join(artifactDir, 'ai-clinical-review.csv');
  const templatePath = join(artifactDir, 'ai-clinical-review-evidence-template.json');
  const checklistPath = join(artifactDir, 'ai-clinical-review-checklist.txt');

  await writeFile(reviewJsonPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  await writeFile(reviewCsvPath, `﻿${csv}\n`, 'utf8');
  await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  await writeFile(checklistPath, `${checklist}\n`, 'utf8');
  await writeFile(checkRequestPath, `${JSON.stringify(checkRequest, null, 2)}\n`, 'utf8');
  await writeFile(checkRequestChecklistPath, `${checkRequestChecklist}\n`, 'utf8');

  const ok = review.status !== 'blocked';
  console.log(JSON.stringify({
    ok,
    artifactDir,
    status: review.status,
    statusLabel: review.statusLabel,
    actionLabel: review.actionLabel,
    evidenceIntegrityStatus: review.evidenceIntegrity.status,
    evidenceIntegrityIssueCount: review.evidenceIntegrity.issues.length,
    summary: review.summary,
    passedGateCount: review.passedGateCount,
    attentionGateCount: review.attentionGateCount,
    blockedGateCount: review.blockedGateCount,
    outputs: {
      reviewJson: reviewJsonPath,
      reviewCsv: reviewCsvPath,
      evidenceTemplate: templatePath,
      checklist: checklistPath,
      checkRequest: checkRequestPath,
      checkRequestChecklist: checkRequestChecklistPath
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
