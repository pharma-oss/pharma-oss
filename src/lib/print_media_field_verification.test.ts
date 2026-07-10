import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  buildPrintMediaFieldCheckRequest,
  buildPrintMediaFieldCheckRequestChecklist,
  buildPrintMediaFieldEvidenceTemplate,
  buildPrintMediaFieldVerificationCsv,
  buildPrintMediaFieldVerificationReview,
  type PrintDocumentId,
  type PrintLayoutRegressionManifestInput,
  type PrintMediaFieldEvidenceInput
} from './print_media_field_verification.ts';

const generatedAt = new Date('2026-06-23T15:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const printFieldVerificationScript = readFileSync(new URL('../../scripts/runPrintMediaFieldVerification.ts', import.meta.url), 'utf8');

const manifest: PrintLayoutRegressionManifestInput = {
  ok: true,
  captureCount: 8,
  captures: [
    { label: 'dispensing-record', selector: '[data-testid="dispensing-record-doc"]', fileName: 'secret-patient-dispensing.png', width: 920, height: 1280, bytes: 12000 },
    { label: 'receipt-statement', selector: '[data-testid="receipt-statement-doc"]', fileName: 'receipt-statement.png', width: 920, height: 1280, bytes: 12000 },
    { label: 'receipt', selector: '[data-testid="receipt-doc"]', fileName: 'receipt.png', width: 920, height: 1280, bytes: 12000 },
    { label: 'drug-info', selector: '[data-testid="drug-info-doc"]', fileName: 'drug-info.png', width: 920, height: 1280, bytes: 12000 },
    { label: 'medicine-bag', selector: '[data-testid="medicine-bag-doc"]', fileName: 'medicine-bag.png', width: 760, height: 1080, bytes: 12000 },
    { label: 'medicine-notebook-sticker', selector: '[data-testid="medicine-notebook-sticker-doc"]', fileName: 'sticker.png', width: 760, height: 760, bytes: 12000 },
    { label: 'liquid-label-sheet', selector: '[data-testid="liquid-label-sheet-doc"]', fileName: 'liquid-label.png', width: 640, height: 420, bytes: 12000 },
    { label: 'ointment-label-sheet', selector: '[data-testid="ointment-label-sheet-doc"]', fileName: 'ointment-label.png', width: 640, height: 420, bytes: 12000 }
  ]
};

const requiredDocumentIds: PrintDocumentId[] = [
  'dispensing_record',
  'receipt_statement',
  'receipt',
  'drug_info',
  'medicine_bag',
  'medicine_notebook_sticker',
  'liquid_label_sheet',
  'ointment_label_sheet'
];

function expectedDimensionsFor(documentId: PrintDocumentId): { widthMm: number; heightMm: number } {
  if (documentId === 'receipt' || documentId === 'medicine_bag') {
    return { widthMm: 148, heightMm: 210 };
  }
  return { widthMm: 210, heightMm: 297 };
}

function evidenceFor(documentId: PrintDocumentId): PrintMediaFieldEvidenceInput {
  const dimensions = expectedDimensionsFor(documentId);
  const mediaType = documentId === 'medicine_bag'
    ? 'medicine_bag'
    : documentId === 'receipt'
      ? 'pdf'
    : documentId === 'medicine_notebook_sticker'
      ? 'notebook_sticker'
      : documentId === 'liquid_label_sheet'
        ? 'liquid_label'
        : documentId === 'ointment_label_sheet'
          ? 'ointment_label'
          : 'a4';
  return {
    documentId,
    checkedAt: '2026-06-23T14:00:00.000Z',
    operatorReviewId: 'print-field-review-20260623',
    sourceArtifactSha256: 'f'.repeat(64),
    noPatientDataConfirmed: true,
    mediaType,
    printerChecked: true,
    paperMatched: true,
    noClipping: true,
    textReadable: true,
    marginWithinTolerance: true,
    operatorRecorded: true,
    expectedWidthMm: dimensions.widthMm,
    expectedHeightMm: dimensions.heightMm,
    measuredWidthMm: dimensions.widthMm + 0.5,
    measuredHeightMm: dimensions.heightMm - 0.5
  };
}

test('buildPrintMediaFieldVerificationReview passes when screenshots and field paper evidence are complete', () => {
  const review = buildPrintMediaFieldVerificationReview({
    generatedAt,
    layoutManifest: manifest,
    fieldEvidence: requiredDocumentIds.map(evidenceFor)
  });

  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.evidenceIntegrity?.status, 'pass');
  assert.strictEqual(review.evidenceIntegrity?.realWorldEvidenceRequired, true);
  assert.strictEqual(review.requiredDocumentCount, 8);
  assert.strictEqual(review.screenshotDocumentCount, 8);
  assert.strictEqual(review.fieldEvidenceDocumentCount, 8);
  assert.strictEqual(review.passedDocumentCount, 8);
  assert.ok(review.documents.every((document) => document.status === 'pass'));
});

test('buildPrintMediaFieldVerificationReview blocks patient data inside field evidence', () => {
  const review = buildPrintMediaFieldVerificationReview({
    generatedAt,
    layoutManifest: manifest,
    fieldEvidence: [
      ...requiredDocumentIds.filter((id) => id !== 'receipt').map(evidenceFor),
      {
        ...evidenceFor('receipt'),
        patientId: 'pt-secret-001'
      } as PrintMediaFieldEvidenceInput
    ]
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.evidenceIntegrity?.status, 'blocked');
  assert.ok(review.evidenceIntegrity?.issues.some((issue) => issue.code === 'privacy_patient_data_signal'));
});

test('buildPrintMediaFieldVerificationReview blocks dummy evidence claiming real paper completion', () => {
  const review = buildPrintMediaFieldVerificationReview({
    generatedAt,
    layoutManifest: manifest,
    fieldEvidence: [
      ...requiredDocumentIds.filter((id) => id !== 'drug_info').map(evidenceFor),
      {
        ...evidenceFor('drug_info'),
        sourceLabel: 'dummy printer fixture'
      } as PrintMediaFieldEvidenceInput
    ]
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.evidenceIntegrity?.status, 'blocked');
  assert.ok(review.evidenceIntegrity?.issues.some((issue) => issue.code === 'synthetic_evidence_claims_real'));
});

test('buildPrintMediaFieldVerificationReview stays attention when real paper evidence is missing', () => {
  const review = buildPrintMediaFieldVerificationReview({
    generatedAt,
    layoutManifest: manifest,
    fieldEvidence: requiredDocumentIds.slice(0, 4).map(evidenceFor)
  });

  assert.strictEqual(review.status, 'attention');
  assert.strictEqual(review.screenshotDocumentCount, 8);
  assert.strictEqual(review.fieldEvidenceDocumentCount, 4);
  assert.ok(review.documents.some((document) => (
    document.documentId === 'medicine_bag'
    && document.status === 'attention'
    && document.nextAction.includes('実プリンタ')
  )));
});

test('buildPrintMediaFieldVerificationReview blocks when a required screenshot target is missing', () => {
  const review = buildPrintMediaFieldVerificationReview({
    generatedAt,
    layoutManifest: {
      ...manifest,
      captures: manifest.captures?.filter((capture) => capture.label !== 'ointment-label-sheet')
    },
    fieldEvidence: requiredDocumentIds.map(evidenceFor)
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.blockedDocumentCount, 1);
  assert.ok(review.documents.some((document) => (
    document.documentId === 'ointment_label_sheet'
    && document.status === 'blocked'
  )));
});

test('buildPrintMediaFieldVerificationReview flags clipping and size mismatch as attention', () => {
  const review = buildPrintMediaFieldVerificationReview({
    generatedAt,
    layoutManifest: manifest,
    fieldEvidence: [
      ...requiredDocumentIds.filter((id) => id !== 'liquid_label_sheet').map(evidenceFor),
      {
        ...evidenceFor('liquid_label_sheet'),
        noClipping: false,
        measuredWidthMm: 80
      }
    ]
  });

  assert.strictEqual(review.status, 'attention');
  const liquid = review.documents.find((document) => document.documentId === 'liquid_label_sheet');
  assert.ok(liquid);
  assert.strictEqual(liquid.status, 'attention');
  assert.strictEqual(liquid.noClipping, false);
  assert.strictEqual(liquid.sizeWithinTolerance, false);
});

test('buildPrintMediaFieldVerificationCsv omits paths, screenshot file names, printer names, and patient-like labels', () => {
  const review = buildPrintMediaFieldVerificationReview({
    generatedAt,
    layoutManifest: {
      ...manifest,
      captures: manifest.captures?.map((capture) => ({
        ...capture,
        fileName: `/Users/store-a/患者秘密/${capture.fileName}`
      }))
    },
    fieldEvidence: requiredDocumentIds.map(evidenceFor)
  });
  const csv = buildPrintMediaFieldVerificationCsv(review);

  assert.match(csv, /実紙検証OK/);
  assert.match(csv, /患者情報なし/);
  assert.match(csv, /証跡品質/);
  assert.match(csv, /証跡OK/);
  assert.doesNotMatch(csv, /\/Users|患者秘密|secret-patient|Canon|EPSON|operator|fileName/);
});

test('buildPrintMediaFieldVerificationCsv surfaces incomplete field evidence provenance', () => {
  const review = buildPrintMediaFieldVerificationReview({
    generatedAt,
    layoutManifest: manifest,
    fieldEvidence: requiredDocumentIds.map((documentId) => ({
      ...evidenceFor(documentId),
      operatorReviewId: '',
      sourceArtifactSha256: '',
      noPatientDataConfirmed: false
    }))
  });
  const csv = buildPrintMediaFieldVerificationCsv(review);

  assert.strictEqual(review.status, 'attention');
  assert.strictEqual(review.evidenceIntegrity?.status, 'attention');
  assert.match(csv, /証跡品質/);
  assert.match(csv, /証跡を確認/);
  assert.match(csv, /現物証跡の出所情報が不足/);
});

test('buildPrintMediaFieldEvidenceTemplate provides field check rows without device or operator names', () => {
  const template = buildPrintMediaFieldEvidenceTemplate({ generatedAt });
  const json = JSON.stringify(template);

  assert.strictEqual(template.type, 'yakureki-print-media-field-evidence-template');
  assert.strictEqual(template.documents.length, 8);
  assert.ok(template.documents.every((document) => document.operatorReviewId === ''));
  assert.ok(template.documents.every((document) => document.sourceArtifactSha256 === ''));
  assert.ok(template.documents.every((document) => document.noPatientDataConfirmed === false));
  assert.ok(template.documents.some((document) => (
    document.documentId === 'receipt'
    && document.mediaType === 'pdf'
    && document.expectedWidthMm === 148
    && document.expectedHeightMm === 210
  )));
  assert.ok(template.documents.every((document) => document.printerChecked === false));
  assert.doesNotMatch(json, /Canon|EPSON|operatorName|printerName|\/Users|fileName|患者/);
});

test('buildPrintMediaFieldCheckRequest describes real paper checks without raw evidence details', () => {
  const request = buildPrintMediaFieldCheckRequest({
    generatedAt,
    requiredDocumentIds,
    dimensionToleranceMm: 1.5
  });
  const checklist = buildPrintMediaFieldCheckRequestChecklist(request);
  const combined = `${JSON.stringify(request)}\n${checklist}`;

  assert.strictEqual(request.type, 'yakureki-print-media-field-check-request');
  assert.strictEqual(request.schemaVersion, 1);
  assert.strictEqual(request.dimensionToleranceMm, 1.5);
  assert.strictEqual(request.documents.length, 8);
  assert.ok(request.documents.some((document) => (
    document.documentId === 'medicine_bag'
    && document.mediaType === 'medicine_bag'
    && document.expectedWidthMm === 148
  )));
  assert.match(checklist, /帳票・実紙検証依頼/);
  assert.match(checklist, /YAKUREKI_PRINT_LAYOUT_MANIFEST/);
  assert.match(checklist, /実プリンタまたはPDF出力/);
  assert.match(checklist, /ダミー、モック、練習用紙/);
  assert.doesNotMatch(combined, /Canon|EPSON|\/Users|secret-patient|operatorName|printerName/);
});

test('print media field verification CLI is exposed as a package script', () => {
  assert.strictEqual(packageJson.scripts['print:field-verification'], 'tsx scripts/runPrintMediaFieldVerification.ts');
  assert.match(printFieldVerificationScript, /YAKUREKI_PRINT_LAYOUT_MANIFEST/);
  assert.match(printFieldVerificationScript, /YAKUREKI_PRINT_FIELD_EVIDENCE/);
  assert.match(printFieldVerificationScript, /YAKUREKI_PRINT_FIELD_REQUEST_ONLY/);
  assert.match(printFieldVerificationScript, /mode: 'request_only'/);
  assert.match(printFieldVerificationScript, /buildPrintMediaFieldCheckRequest/);
  assert.match(printFieldVerificationScript, /print-media-field-verification-review\.csv/);
  assert.match(printFieldVerificationScript, /print-media-field-evidence-template\.json/);
  assert.match(printFieldVerificationScript, /print-media-field-check-request\.json/);
  assert.match(printFieldVerificationScript, /print-media-field-check-request\.txt/);
  assert.match(printFieldVerificationScript, /evidenceIntegrityStatus/);
  assert.match(printFieldVerificationScript, /ok: review\.status !== 'blocked'/);
  assert.match(printFieldVerificationScript, /if \(review\.status === 'blocked'\)/);
});
