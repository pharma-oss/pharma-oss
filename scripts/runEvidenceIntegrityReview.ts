import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildEvidenceIntegrityReview,
  buildEvidenceIntegrityTemplate
} from '../src/lib/evidence_integrity.ts';

const evidencePath = process.env.YAKUREKI_EVIDENCE_INTEGRITY_JSON || '';
const outputDir = process.env.YAKUREKI_EVIDENCE_INTEGRITY_OUTPUT_DIR || 'artifacts/evidence-integrity';
const evidenceId = process.env.YAKUREKI_EVIDENCE_INTEGRITY_ID || 'evidence-integrity-review';
const claimKind = process.env.YAKUREKI_EVIDENCE_INTEGRITY_CLAIM_KIND || 'general';
const noPatientDataExpected = process.env.YAKUREKI_EVIDENCE_PRIVACY_EXPECTED !== 'false';
const realWorldEvidenceRequired = process.env.YAKUREKI_EVIDENCE_REAL_WORLD_REQUIRED === 'true';
const allowSyntheticEvidence = process.env.YAKUREKI_EVIDENCE_ALLOW_SYNTHETIC === 'true';

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function readJsonFile(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8');
  return JSON.parse(text);
}

async function main() {
  const generatedAt = new Date();
  const artifactDir = join(outputDir, stamp(generatedAt));
  await mkdir(artifactDir, { recursive: true });

  const evidence = evidencePath ? await readJsonFile(evidencePath) : {};
  const review = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId,
    claimKind,
    evidence,
    noPatientDataExpected,
    realWorldEvidenceRequired,
    allowSyntheticEvidence
  });

  if (!evidencePath) {
    review.issues.push({
      severity: 'error',
      code: 'evidence_input_missing',
      path: 'YAKUREKI_EVIDENCE_INTEGRITY_JSON',
      message: '証跡JSONのパスを指定してください。'
    });
    review.requiredActions.push('証跡JSONのパスを指定してください。');
    review.status = 'blocked';
    review.statusLabel = '証跡を保留';
  }

  const reviewJsonPath = join(artifactDir, 'evidence-integrity-review.json');
  const templatePath = join(artifactDir, 'evidence-integrity-input-template.json');

  await writeFile(reviewJsonPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  await writeFile(
    templatePath,
    `${JSON.stringify(buildEvidenceIntegrityTemplate(), null, 2)}\n`,
    'utf8'
  );

  console.log(JSON.stringify({
    status: review.status,
    statusLabel: review.statusLabel,
    artifactDir,
    outputs: {
      review: reviewJsonPath,
      template: templatePath
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
