import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildPrintMediaFieldCheckRequest,
  buildPrintMediaFieldCheckRequestChecklist,
  buildPrintMediaFieldEvidenceTemplate,
  buildPrintMediaFieldVerificationCsv,
  buildPrintMediaFieldVerificationReview,
  type PrintDocumentId,
  type PrintLayoutRegressionManifestInput,
  type PrintMediaFieldEvidenceInput
} from '../src/lib/print_media_field_verification.ts';

const manifestPath = process.env.YAKUREKI_PRINT_LAYOUT_MANIFEST || '';
const evidencePath = process.env.YAKUREKI_PRINT_FIELD_EVIDENCE || '';
const outputDir = process.env.YAKUREKI_PRINT_FIELD_OUTPUT_DIR || 'artifacts/print-media-field-verification';
const requiredDocumentsText = process.env.YAKUREKI_PRINT_REQUIRED_DOCUMENTS || '';
const toleranceText = process.env.YAKUREKI_PRINT_DIMENSION_TOLERANCE_MM || '';
const requestOnly = ['1', 'true', 'yes'].includes((process.env.YAKUREKI_PRINT_FIELD_REQUEST_ONLY || '').toLowerCase());

function parseRequiredDocumentIds(value: string): PrintDocumentId[] | undefined {
  const ids = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids as PrintDocumentId[] : undefined;
}

async function readJsonFile<T>(path: string): Promise<T> {
  const text = await readFile(path, 'utf8');
  return JSON.parse(text) as T;
}

function normalizeEvidence(value: unknown): PrintMediaFieldEvidenceInput[] {
  if (Array.isArray(value)) return value as PrintMediaFieldEvidenceInput[];
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.fieldEvidence)) return record.fieldEvidence as PrintMediaFieldEvidenceInput[];
    if (Array.isArray(record.documents)) return record.documents as PrintMediaFieldEvidenceInput[];
  }
  return [];
}

function stamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function main() {
  if (!manifestPath && !requestOnly) {
    throw new Error('YAKUREKI_PRINT_LAYOUT_MANIFEST に runPrintLayoutRegression の manifest.json を指定してください。');
  }

  const generatedAt = new Date();
  const artifactDir = join(outputDir, stamp(generatedAt));
  await mkdir(artifactDir, { recursive: true });

  const requiredDocumentIds = parseRequiredDocumentIds(requiredDocumentsText);
  const dimensionToleranceMm = Number.isFinite(Number(toleranceText)) && Number(toleranceText) > 0
    ? Number(toleranceText)
    : undefined;
  const template = buildPrintMediaFieldEvidenceTemplate({ generatedAt, requiredDocumentIds });
  const checkRequest = buildPrintMediaFieldCheckRequest({
    generatedAt,
    requiredDocumentIds,
    dimensionToleranceMm
  });
  const checkRequestChecklist = buildPrintMediaFieldCheckRequestChecklist(checkRequest);

  const reviewJsonPath = join(artifactDir, 'print-media-field-verification-review.json');
  const reviewCsvPath = join(artifactDir, 'print-media-field-verification-review.csv');
  const templatePath = join(artifactDir, 'print-media-field-evidence-template.json');
  const checkRequestPath = join(artifactDir, 'print-media-field-check-request.json');
  const checkRequestChecklistPath = join(artifactDir, 'print-media-field-check-request.txt');

  if (requestOnly) {
    await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
    await writeFile(checkRequestPath, `${JSON.stringify(checkRequest, null, 2)}\n`, 'utf8');
    await writeFile(checkRequestChecklistPath, `${checkRequestChecklist}\n`, 'utf8');
    console.log(JSON.stringify({
      ok: true,
      mode: 'request_only',
      artifactDir,
      requiredDocumentCount: template.documents.length,
      outputs: {
        evidenceTemplate: templatePath,
        checkRequest: checkRequestPath,
        checkRequestChecklist: checkRequestChecklistPath
      }
    }, null, 2));
    return;
  }

  const layoutManifest = await readJsonFile<PrintLayoutRegressionManifestInput>(manifestPath);
  const fieldEvidence = evidencePath
    ? normalizeEvidence(await readJsonFile<unknown>(evidencePath))
    : [];
  const review = buildPrintMediaFieldVerificationReview({
    generatedAt,
    layoutManifest,
    fieldEvidence,
    requiredDocumentIds,
    dimensionToleranceMm
  });
  const csv = buildPrintMediaFieldVerificationCsv(review);

  await writeFile(reviewJsonPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  await writeFile(reviewCsvPath, `\ufeff${csv}\n`, 'utf8');
  if (!evidencePath || review.status !== 'pass') {
    await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  }
  await writeFile(checkRequestPath, `${JSON.stringify(checkRequest, null, 2)}\n`, 'utf8');
  await writeFile(checkRequestChecklistPath, `${checkRequestChecklist}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: review.status !== 'blocked',
    artifactDir,
    status: review.status,
    statusLabel: review.statusLabel,
    requiredDocumentCount: review.requiredDocumentCount,
    passedDocumentCount: review.passedDocumentCount,
    attentionDocumentCount: review.attentionDocumentCount,
    blockedDocumentCount: review.blockedDocumentCount,
    evidenceIntegrityStatus: review.evidenceIntegrity?.status,
    evidenceIntegrityIssueCount: review.evidenceIntegrity?.issues.length,
    outputs: {
      reviewJson: reviewJsonPath,
      reviewCsv: reviewCsvPath,
      evidenceTemplate: (!evidencePath || review.status !== 'pass') ? templatePath : undefined,
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
