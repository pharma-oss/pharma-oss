import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  buildDrugStockCsvMigrationPreview,
  buildMigrationPackageReadinessReview,
  buildPatientCsvMigrationPreview,
  buildSoapCsvMigrationPreview,
  buildVisitCsvMigrationPreview
} from './migration_csv.ts';
import {
  buildMigrationTrialAcceptanceAuditDetail,
  buildMigrationTrialAcceptanceChecklist,
  buildMigrationTrialAcceptanceCsv,
  buildMigrationTrialAcceptanceEvidenceTemplate,
  buildMigrationTrialAcceptanceReview,
  buildMigrationTrialAcceptanceSampleRequest,
  buildMigrationTrialAcceptanceSampleRequestChecklist,
  type MigrationTrialAcceptanceTargets
} from './migration_trial_acceptance.ts';

const generatedAt = new Date('2026-06-23T17:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const realWorldProof = {
  capturedAt: '2026-06-23T17:00:00.000Z',
  operatorReviewId: 'migration-review-20260623',
  sourceArtifactSha256: 'a'.repeat(64)
};

function buildCsvLines(header: string, rows: string[]): string {
  return [header, ...rows].join('\n');
}

function packageReviewFixture(options: { orphan?: boolean; omitInventoryAndHistory?: boolean } = {}) {
  const patientRows: string[] = [];
  const visitRows: string[] = [];
  const soapRows: string[] = [];
  for (let i = 1; i <= 12; i += 1) {
    const id = String(i).padStart(3, '0');
    patientRows.push(`P${id},患者 ${id},1980/1/${String((i % 27) + 1).padStart(2, '0')}`);
    visitRows.push(`V${id},${options.orphan && i === 12 ? 'P999' : `P${id}`},2026/6/${String((i % 27) + 1).padStart(2, '0')}`);
    soapRows.push(`SOAP${id},V${id},20260623,服薬状況 ${id}`);
  }

  const patients = buildPatientCsvMigrationPreview(
    buildCsvLines('患者番号,氏名,生年月日', patientRows),
    { generatedAt }
  );
  const visits = buildVisitCsvMigrationPreview(
    buildCsvLines('受付番号,患者番号,来局日', visitRows),
    { generatedAt }
  );
  const drugStocks = buildDrugStockCsvMigrationPreview([
    '在庫ID,薬品コード,在庫数',
    'S001,620001234,10',
    'S002,620009999,5'
  ].join('\n'), { generatedAt });
  const soapRecords = buildSoapCsvMigrationPreview(
    buildCsvLines('薬歴ID,受付ID,記録日,薬歴本文', soapRows),
    { generatedAt }
  );

  return buildMigrationPackageReadinessReview({
    generatedAt,
    patients,
    visits,
    drugStocks: options.omitInventoryAndHistory ? undefined : drugStocks,
    soapRecords: options.omitInventoryAndHistory ? undefined : soapRecords
  });
}

const relaxedTargets: MigrationTrialAcceptanceTargets = {
  minPatientRows: 10,
  minVisitRows: 10,
  minDrugStockRows: 1,
  minSoapRows: 1
};

test('buildMigrationTrialAcceptanceReview passes for real-data-equivalent safe migration package', () => {
  const review = buildMigrationTrialAcceptanceReview({
    generatedAt,
    evidence: {
      acceptanceId: 'migration-20260623',
      ...realWorldProof,
      noPatientDataInArtifactsConfirmed: true,
      realDataEquivalentConfirmed: true,
      sourceSystemExportedByCustomerConfirmed: true,
      fieldMappingReviewed: true,
      restorePreviewCompleted: true,
      firstDayTrialPlanReady: true,
      ownerReviewCompleted: true,
      packageReview: packageReviewFixture(),
      targets: relaxedTargets
    }
  });

  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.schemaVersion, 3);
  assert.strictEqual(review.evidenceIntegrity.status, 'pass');
  assert.strictEqual(review.statusLabel, '移行受入OK');
  assert.strictEqual(review.actionLabel, '1日テスト開始OK');
  assert.strictEqual(review.readyForOneDayTrial, true);
  assert.strictEqual(review.operationalCoverage.status, 'pass');
  assert.strictEqual(review.operationalCoverage.readyWorkflowCount, 3);
  assert.strictEqual(review.operationalCoverage.patientReceptionReady, true);
  assert.strictEqual(review.operationalCoverage.inventoryReady, true);
  assert.strictEqual(review.operationalCoverage.medicationHistoryReady, true);
  assert.strictEqual(review.metrics.patientRows, 12);
  assert.strictEqual(review.metrics.visitRows, 12);
  assert.strictEqual(review.blockedGateCount, 0);
  assert.ok(review.gates.every((gate) => gate.status === 'pass'));
  assert.ok(review.gates.some((gate) => gate.id === 'evidence_integrity' && gate.status === 'pass'));
  assert.ok(review.gates.some((gate) => gate.id === 'first_day_operational_flow' && gate.status === 'pass'));
});

test('buildMigrationTrialAcceptanceReview blocks missing package review and privacy confirmation', () => {
  const review = buildMigrationTrialAcceptanceReview({
    generatedAt,
    evidence: {
      acceptanceId: 'missing-package',
      noPatientDataInArtifactsConfirmed: false
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.operationalCoverage.status, 'blocked');
  assert.strictEqual(review.operationalCoverage.readyWorkflowCount, 0);
  assert.ok(review.gates.some((gate) => gate.id === 'package_review_attached' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'privacy' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'first_day_operational_flow' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'one_day_trial' && gate.status === 'blocked'));
});

test('buildMigrationTrialAcceptanceReview blocks reference issues from package readiness', () => {
  const review = buildMigrationTrialAcceptanceReview({
    generatedAt,
    evidence: {
      acceptanceId: 'orphan-package',
      ...realWorldProof,
      noPatientDataInArtifactsConfirmed: true,
      realDataEquivalentConfirmed: true,
      sourceSystemExportedByCustomerConfirmed: true,
      fieldMappingReviewed: true,
      restorePreviewCompleted: true,
      firstDayTrialPlanReady: true,
      ownerReviewCompleted: true,
      packageReview: packageReviewFixture({ orphan: true }),
      targets: relaxedTargets
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.metrics.referenceIssueCount, 1);
  assert.strictEqual(review.operationalCoverage.status, 'blocked');
  assert.strictEqual(review.operationalCoverage.patientReceptionReady, false);
  assert.ok(review.operationalCoverage.workflows.some(
    (workflow) => workflow.id === 'patient_reception' && workflow.status === 'blocked'
  ));
  assert.ok(review.gates.some((gate) => gate.id === 'package_readiness' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'first_day_operational_flow' && gate.status === 'blocked'));
});

test('buildMigrationTrialAcceptanceReview calls out missing inventory and medication-history workflows', () => {
  const review = buildMigrationTrialAcceptanceReview({
    generatedAt,
    evidence: {
      acceptanceId: 'partial-first-day-flow',
      ...realWorldProof,
      noPatientDataInArtifactsConfirmed: true,
      realDataEquivalentConfirmed: true,
      sourceSystemExportedByCustomerConfirmed: true,
      fieldMappingReviewed: true,
      restorePreviewCompleted: true,
      firstDayTrialPlanReady: true,
      ownerReviewCompleted: true,
      packageReview: packageReviewFixture({ omitInventoryAndHistory: true }),
      targets: relaxedTargets
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.operationalCoverage.status, 'attention');
  assert.strictEqual(review.operationalCoverage.patientReceptionReady, true);
  assert.strictEqual(review.operationalCoverage.inventoryReady, false);
  assert.strictEqual(review.operationalCoverage.medicationHistoryReady, false);
  assert.strictEqual(review.operationalCoverage.readyWorkflowCount, 1);
  assert.ok(review.operationalCoverage.workflows.some(
    (workflow) => workflow.id === 'inventory_check' && workflow.status === 'attention'
  ));
  assert.ok(review.operationalCoverage.workflows.some(
    (workflow) => workflow.id === 'medication_history' && workflow.status === 'attention'
  ));
  assert.ok(review.gates.some((gate) => gate.id === 'first_day_operational_flow' && gate.status === 'attention'));
});

test('buildMigrationTrialAcceptanceReview keeps weak unconfirmed evidence as attention', () => {
  const review = buildMigrationTrialAcceptanceReview({
    generatedAt,
    evidence: {
      acceptanceId: 'weak-review',
      ...realWorldProof,
      noPatientDataInArtifactsConfirmed: true,
      realDataEquivalentConfirmed: false,
      sourceSystemExportedByCustomerConfirmed: false,
      fieldMappingReviewed: false,
      restorePreviewCompleted: true,
      firstDayTrialPlanReady: true,
      ownerReviewCompleted: false,
      packageReview: packageReviewFixture(),
      targets: relaxedTargets
    }
  });

  assert.strictEqual(review.status, 'attention');
  assert.strictEqual(review.blockedGateCount, 0);
  assert.ok(review.gates.some((gate) => gate.id === 'real_data_equivalent' && gate.status === 'attention'));
  assert.ok(review.gates.some((gate) => gate.id === 'owner_review' && gate.status === 'attention'));
});

test('buildMigrationTrialAcceptanceReview blocks dummy migration acceptance evidence', () => {
  const review = buildMigrationTrialAcceptanceReview({
    generatedAt,
    evidence: {
      acceptanceId: 'dummy-migration',
      ...realWorldProof,
      noPatientDataInArtifactsConfirmed: true,
      realDataEquivalentConfirmed: true,
      sourceSystemExportedByCustomerConfirmed: true,
      fieldMappingReviewed: true,
      restorePreviewCompleted: true,
      firstDayTrialPlanReady: true,
      ownerReviewCompleted: true,
      packageReview: packageReviewFixture(),
      targets: relaxedTargets
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.evidenceIntegrity.status, 'blocked');
  assert.ok(review.evidenceIntegrity.issues.some((issue) => issue.code === 'synthetic_evidence_claims_real'));
  assert.ok(review.gates.some((gate) => gate.id === 'evidence_integrity' && gate.status === 'blocked'));
});

test('migration trial acceptance exports privacy-safe template, CSV, checklist and audit detail', () => {
  const review = buildMigrationTrialAcceptanceReview({
    generatedAt,
    evidence: {
      acceptanceId: '=migration',
      ...realWorldProof,
      noPatientDataInArtifactsConfirmed: true,
      realDataEquivalentConfirmed: true,
      sourceSystemExportedByCustomerConfirmed: true,
      fieldMappingReviewed: true,
      restorePreviewCompleted: true,
      firstDayTrialPlanReady: true,
      ownerReviewCompleted: true,
      packageReview: packageReviewFixture(),
      targets: relaxedTargets
    }
  });
  const template = buildMigrationTrialAcceptanceEvidenceTemplate({ generatedAt, acceptanceId: '=migration' });
  const sampleRequest = buildMigrationTrialAcceptanceSampleRequest({
    generatedAt,
    acceptanceId: '=migration',
    targets: relaxedTargets
  });
  const sampleRequestChecklist = buildMigrationTrialAcceptanceSampleRequestChecklist(sampleRequest);
  const csv = buildMigrationTrialAcceptanceCsv(review);
  const checklist = buildMigrationTrialAcceptanceChecklist(review);
  const auditDetail = buildMigrationTrialAcceptanceAuditDetail(review);
  const combined = [
    JSON.stringify(review),
    JSON.stringify(template),
    JSON.stringify(sampleRequest),
    csv,
    checklist,
    sampleRequestChecklist,
    auditDetail
  ].join('\n');

  assert.match(csv, /"'=migration/);
  assert.match(csv, /初日業務/);
  assert.match(csv, /患者と受付/);
  assert.match(checklist, /CSV原文/);
  assert.match(checklist, /初日業務/);
  assert.strictEqual(sampleRequest.schemaVersion, 1);
  assert.strictEqual(sampleRequest.items.length, 5);
  assert.ok(sampleRequest.items.some((item) => item.id === 'patients_csv' && item.minimumRows === 10));
  assert.ok(sampleRequest.items.some((item) => item.id === 'evidence_json' && item.acceptedFormats.includes('JSON')));
  assert.match(sampleRequestChecklist, /提出してほしいもの/);
  assert.match(sampleRequestChecklist, /YAKUREKI_MIGRATION_PATIENT_CSV/);
  assert.match(sampleRequestChecklist, /ダミー、モック、練習データ/);
  assert.match(auditDetail, /実データ相当移行受入/);
  assert.match(auditDetail, /初日業務OK/);
  assert.strictEqual(template.schemaVersion, 3);
  assert.strictEqual(template.capturedAt, '');
  assert.strictEqual(template.operatorReviewId, '');
  assert.strictEqual(template.sourceArtifactSha256, '');
  assert.strictEqual(template.noPatientDataInArtifactsConfirmed, false);
  assert.strictEqual(template.privacy.containsPatientData, false);

  for (const sensitiveValue of ['患者 001', '服薬状況 001', 'P001', 'V001', 'SOAP001', '/Users/secret', 'import.csv']) {
    assert.doesNotMatch(combined, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('migration trial acceptance CLI is exposed and writes artifacts', () => {
  const script = readFileSync(new URL('../../scripts/runMigrationTrialAcceptance.ts', import.meta.url), 'utf8');

  assert.strictEqual(packageJson.scripts['migration:trial-acceptance'], 'tsx scripts/runMigrationTrialAcceptance.ts');
  assert.match(script, /YAKUREKI_MIGRATION_ACCEPTANCE_EVIDENCE/);
  assert.match(script, /YAKUREKI_MIGRATION_PATIENT_CSV/);
  assert.match(script, /YAKUREKI_MIGRATION_VISIT_CSV/);
  assert.match(script, /YAKUREKI_MIGRATION_DRUG_STOCK_CSV/);
  assert.match(script, /YAKUREKI_MIGRATION_SOAP_CSV/);
  assert.match(script, /ok = review\.status !== 'blocked'/);
  assert.match(script, /evidenceIntegrityStatus/);
  assert.match(script, /operationalCoverageStatus/);
  assert.match(script, /buildMigrationTrialAcceptanceSampleRequest/);
  assert.match(script, /migration-trial-acceptance\.json/);
  assert.match(script, /migration-trial-acceptance\.csv/);
  assert.match(script, /migration-trial-acceptance-evidence-template\.json/);
  assert.match(script, /migration-trial-acceptance-checklist\.txt/);
  assert.match(script, /migration-trial-acceptance-sample-request\.json/);
  assert.match(script, /migration-trial-acceptance-sample-request\.txt/);
});
