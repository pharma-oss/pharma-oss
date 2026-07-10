import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildStaffAccessRecoveryCheckRequest,
  buildStaffAccessRecoveryCheckRequestChecklist,
  buildStaffAccessRecoveryChecklist,
  buildStaffAccessRecoveryCsv,
  buildStaffAccessRecoveryEvidenceTemplate,
  buildStaffAccessRecoveryReview,
  type StaffAccessRecoveryEvidenceInput
} from '../src/lib/staff_access_recovery_review.ts';

const evidencePath = process.env.YAKUREKI_STAFF_ACCESS_RECOVERY_EVIDENCE || '';
const outputDir = process.env.YAKUREKI_STAFF_ACCESS_RECOVERY_OUTPUT_DIR || 'artifacts/staff-access-recovery-review';
const reviewId = process.env.YAKUREKI_STAFF_ACCESS_RECOVERY_REVIEW_ID || 'staff-access-recovery-review';
const requestOnly = ['1', 'true', 'yes'].includes((process.env.YAKUREKI_STAFF_ACCESS_RECOVERY_REQUEST_ONLY || '').toLowerCase());

function stamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function main() {
  const generatedAt = new Date();
  const artifactDir = join(outputDir, stamp(generatedAt));
  await mkdir(artifactDir, { recursive: true });

  const checkRequest = buildStaffAccessRecoveryCheckRequest({ generatedAt, reviewId });
  const checkRequestChecklist = buildStaffAccessRecoveryCheckRequestChecklist(checkRequest);
  const checkRequestPath = join(artifactDir, 'staff-access-recovery-check-request.json');
  const checkRequestChecklistPath = join(artifactDir, 'staff-access-recovery-check-request.txt');

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
    ? await readJsonFile<StaffAccessRecoveryEvidenceInput>(evidencePath)
    : undefined;
  const review = buildStaffAccessRecoveryReview({
    generatedAt,
    evidence: evidence ? { reviewId, ...evidence } : { reviewId }
  });
  const csv = buildStaffAccessRecoveryCsv(review);
  const checklist = buildStaffAccessRecoveryChecklist(review);
  const template = buildStaffAccessRecoveryEvidenceTemplate({ generatedAt, reviewId: review.reviewId });

  const reviewJsonPath = join(artifactDir, 'staff-access-recovery-review.json');
  const reviewCsvPath = join(artifactDir, 'staff-access-recovery-review.csv');
  const checklistPath = join(artifactDir, 'staff-access-recovery-checklist.txt');
  const templatePath = join(artifactDir, 'staff-access-recovery-evidence-template.json');

  await writeFile(reviewJsonPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  await writeFile(reviewCsvPath, `﻿${csv}\n`, 'utf8');
  await writeFile(checklistPath, `${checklist}\n`, 'utf8');
  await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  await writeFile(checkRequestPath, `${JSON.stringify(checkRequest, null, 2)}\n`, 'utf8');
  await writeFile(checkRequestChecklistPath, `${checkRequestChecklist}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: review.status !== 'blocked',
    artifactDir,
    status: review.status,
    statusLabel: review.statusLabel,
    readyForStaffAccessChange: review.readyForStaffAccessChange,
    evidenceIntegrityStatus: review.evidenceIntegrity.status,
    evidenceIntegrityIssueCount: review.evidenceIntegrity.issues.length,
    caseCount: review.caseCount,
    passCaseCount: review.passCaseCount,
    attentionCaseCount: review.attentionCaseCount,
    blockedCaseCount: review.blockedCaseCount,
    missingReasons: review.missingReasons,
    outputs: {
      reviewJson: reviewJsonPath,
      reviewCsv: reviewCsvPath,
      checklist: checklistPath,
      evidenceTemplate: templatePath,
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
