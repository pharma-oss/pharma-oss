import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildMonthlyClaimOfficialSubmissionTrialCsv,
  buildMonthlyClaimOfficialSubmissionTrialReport,
  buildMonthlyClaimOfficialSubmissionTrialTemplate,
  formatMonthlyClaimOfficialSubmissionTrialReport,
  type MonthlyClaimOfficialSubmissionTrialInput
} from '../src/lib/monthly_claim_uke.ts';

const inputPath = process.env.YAKUREKI_OFFICIAL_SUBMISSION_TRIAL_JSON || '';
const outputDir = process.env.YAKUREKI_OFFICIAL_SUBMISSION_TRIAL_OUTPUT_DIR
  || 'artifacts/official-submission-trial-review';

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function normalizeTrials(value: unknown): MonthlyClaimOfficialSubmissionTrialInput[] {
  if (Array.isArray(value)) return value as MonthlyClaimOfficialSubmissionTrialInput[];
  if (value && typeof value === 'object' && Array.isArray((value as { trials?: unknown }).trials)) {
    return (value as { trials: MonthlyClaimOfficialSubmissionTrialInput[] }).trials;
  }
  throw new Error('入力JSONは提出試験の配列、または trials 配列を持つオブジェクトにしてください。');
}

async function main() {
  if (!inputPath) {
    throw new Error('YAKUREKI_OFFICIAL_SUBMISSION_TRIAL_JSON に患者情報なし提出試験JSONを指定してください。');
  }

  const generatedAt = new Date();
  const artifactDir = join(outputDir, stamp(generatedAt));
  await mkdir(artifactDir, { recursive: true });
  const input = JSON.parse(await readFile(inputPath, 'utf8')) as unknown;
  const report = buildMonthlyClaimOfficialSubmissionTrialReport(normalizeTrials(input));
  const csv = buildMonthlyClaimOfficialSubmissionTrialCsv(report);
  const summary = formatMonthlyClaimOfficialSubmissionTrialReport(report);
  const template = buildMonthlyClaimOfficialSubmissionTrialTemplate();

  const reportPath = join(artifactDir, 'official-submission-trial-review.json');
  const csvPath = join(artifactDir, 'official-submission-trial-review.csv');
  const summaryPath = join(artifactDir, 'official-submission-trial-review.txt');
  const templatePath = join(artifactDir, 'official-submission-trial-input-template.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(csvPath, `\ufeff${csv}\n`, 'utf8');
  await writeFile(summaryPath, `${summary}\n`, 'utf8');
  await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: report.ok,
    artifactDir,
    totalTrials: report.totalTrials,
    acceptedTrialCount: report.acceptedTrialCount,
    missingPayers: report.missingPayers,
    issueCount: report.issueCount,
    evidenceIntegrityStatus: report.evidenceIntegrityStatus,
    evidenceIntegrityIssueCount: report.evidenceIntegrityIssueCount,
    outputs: {
      report: reportPath,
      csv: csvPath,
      summary: summaryPath,
      template: templatePath
    }
  }, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
