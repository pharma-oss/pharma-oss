import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildDrugStockCsvMigrationPreview,
  buildMigrationPackageReadinessReview,
  buildPatientCsvMigrationPreview,
  buildSoapCsvMigrationPreview,
  buildVisitCsvMigrationPreview,
  type MigrationPackageReadinessReview
} from '../src/lib/migration_csv.ts';
import {
  buildMigrationTrialAcceptanceChecklist,
  buildMigrationTrialAcceptanceCsv,
  buildMigrationTrialAcceptanceEvidenceTemplate,
  buildMigrationTrialAcceptanceReview,
  buildMigrationTrialAcceptanceSampleRequest,
  buildMigrationTrialAcceptanceSampleRequestChecklist,
  type MigrationTrialAcceptanceEvidenceInput
} from '../src/lib/migration_trial_acceptance.ts';

const evidencePath = process.env.YAKUREKI_MIGRATION_ACCEPTANCE_EVIDENCE || '';
const packageReviewPath = process.env.YAKUREKI_MIGRATION_PACKAGE_REVIEW_JSON || '';
const patientCsvPath = process.env.YAKUREKI_MIGRATION_PATIENT_CSV || '';
const visitCsvPath = process.env.YAKUREKI_MIGRATION_VISIT_CSV || '';
const drugStockCsvPath = process.env.YAKUREKI_MIGRATION_DRUG_STOCK_CSV || '';
const soapCsvPath = process.env.YAKUREKI_MIGRATION_SOAP_CSV || '';
const outputDir = process.env.YAKUREKI_MIGRATION_ACCEPTANCE_OUTPUT_DIR || 'artifacts/migration-trial-acceptance';
const acceptanceId = process.env.YAKUREKI_MIGRATION_ACCEPTANCE_ID || 'migration-trial-acceptance';

function stamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function readJsonFile<T>(path: string): Promise<T> {
  const text = await readFile(path, 'utf8');
  return JSON.parse(text) as T;
}

async function readTextFile(path: string): Promise<string | undefined> {
  return path ? readFile(path, 'utf8') : undefined;
}

async function buildPackageReviewFromCsvs(generatedAt: Date): Promise<MigrationPackageReadinessReview | undefined> {
  const [patientCsv, visitCsv, drugStockCsv, soapCsv] = await Promise.all([
    readTextFile(patientCsvPath),
    readTextFile(visitCsvPath),
    readTextFile(drugStockCsvPath),
    readTextFile(soapCsvPath)
  ]);

  if (!patientCsv && !visitCsv && !drugStockCsv && !soapCsv) {
    return undefined;
  }

  return buildMigrationPackageReadinessReview({
    generatedAt,
    patients: patientCsv ? buildPatientCsvMigrationPreview(patientCsv, { generatedAt }) : undefined,
    visits: visitCsv ? buildVisitCsvMigrationPreview(visitCsv, { generatedAt }) : undefined,
    drugStocks: drugStockCsv ? buildDrugStockCsvMigrationPreview(drugStockCsv, { generatedAt }) : undefined,
    soapRecords: soapCsv ? buildSoapCsvMigrationPreview(soapCsv, { generatedAt }) : undefined
  });
}

async function main() {
  const generatedAt = new Date();
  const artifactDir = join(outputDir, stamp(generatedAt));
  await mkdir(artifactDir, { recursive: true });

  const evidence = evidencePath
    ? await readJsonFile<MigrationTrialAcceptanceEvidenceInput>(evidencePath)
    : {};
  const packageReview = evidence.packageReview
    ?? (packageReviewPath ? await readJsonFile<MigrationPackageReadinessReview>(packageReviewPath) : undefined)
    ?? await buildPackageReviewFromCsvs(generatedAt);

  const review = buildMigrationTrialAcceptanceReview({
    generatedAt,
    evidence: {
      acceptanceId,
      ...evidence,
      packageReview
    }
  });
  const csv = buildMigrationTrialAcceptanceCsv(review);
  const template = buildMigrationTrialAcceptanceEvidenceTemplate({
    generatedAt,
    acceptanceId: review.acceptanceId,
    targets: review.targets
  });
  const checklist = buildMigrationTrialAcceptanceChecklist(review);
  const sampleRequest = buildMigrationTrialAcceptanceSampleRequest({
    generatedAt,
    acceptanceId: review.acceptanceId,
    targets: review.targets
  });
  const sampleRequestChecklist = buildMigrationTrialAcceptanceSampleRequestChecklist(sampleRequest);

  const reviewJsonPath = join(artifactDir, 'migration-trial-acceptance.json');
  const reviewCsvPath = join(artifactDir, 'migration-trial-acceptance.csv');
  const templatePath = join(artifactDir, 'migration-trial-acceptance-evidence-template.json');
  const checklistPath = join(artifactDir, 'migration-trial-acceptance-checklist.txt');
  const sampleRequestPath = join(artifactDir, 'migration-trial-acceptance-sample-request.json');
  const sampleRequestChecklistPath = join(artifactDir, 'migration-trial-acceptance-sample-request.txt');

  await writeFile(reviewJsonPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  await writeFile(reviewCsvPath, `\ufeff${csv}\n`, 'utf8');
  await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  await writeFile(checklistPath, `${checklist}\n`, 'utf8');
  await writeFile(sampleRequestPath, `${JSON.stringify(sampleRequest, null, 2)}\n`, 'utf8');
  await writeFile(sampleRequestChecklistPath, `${sampleRequestChecklist}\n`, 'utf8');

  const ok = review.status !== 'blocked';
  console.log(JSON.stringify({
    ok,
    artifactDir,
    status: review.status,
    statusLabel: review.statusLabel,
    actionLabel: review.actionLabel,
    readyForOneDayTrial: review.readyForOneDayTrial,
    operationalCoverageStatus: review.operationalCoverage.status,
    operationalCoverageStatusLabel: review.operationalCoverage.statusLabel,
    operationalReadyWorkflowCount: review.operationalCoverage.readyWorkflowCount,
    operationalTotalWorkflowCount: review.operationalCoverage.totalWorkflowCount,
    evidenceIntegrityStatus: review.evidenceIntegrity.status,
    evidenceIntegrityIssueCount: review.evidenceIntegrity.issues.length,
    metrics: review.metrics,
    passedGateCount: review.passedGateCount,
    attentionGateCount: review.attentionGateCount,
    blockedGateCount: review.blockedGateCount,
    outputs: {
      reviewJson: reviewJsonPath,
      reviewCsv: reviewCsvPath,
      evidenceTemplate: templatePath,
      checklist: checklistPath,
      sampleRequest: sampleRequestPath,
      sampleRequestChecklist: sampleRequestChecklistPath
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
