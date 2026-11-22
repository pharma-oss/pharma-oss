import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIELD_EVIDENCE_STORAGE_POLICY,
  PHASE_C_EVIDENCE_SLOTS,
  buildFieldEvidenceBundleChecklist,
  buildFieldEvidenceBundleCsv,
  buildPhaseCEvidenceTemplates,
  evaluateFieldEvidenceBundle,
  isPathInsideDirectory
} from './field_evidence_bundle.ts';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx');
const cliPath = join(repoRoot, 'scripts', 'runFieldEvidenceBundle.ts');

const VALID_SHA256 = 'a'.repeat(64);

function makeValidFieldEvidence(slotId: string) {
  return {
    type: `yakureki-${slotId}-evidence`,
    schemaVersion: 1,
    capturedAt: '2026-11-22T01:00:00Z',
    operatorReviewId: `REV-STORE01-${slotId}`,
    sourceArtifactSha256: VALID_SHA256,
    noPatientDataConfirmed: true,
    operatorRecorded: true
  };
}

describe('I-2 / I-4: Phase C field-evidence bundle scaffold, storage guard, and integrity runner', () => {
  it('detects paths inside the git repository to enforce external evidence storage policy (I-2)', () => {
    assert.equal(isPathInsideDirectory(join(repoRoot, 'artifacts', 'evidence'), repoRoot), true);
    assert.equal(isPathInsideDirectory(repoRoot, repoRoot), true);
    assert.equal(isPathInsideDirectory(join(tmpdir(), 'yakureki-external-evidence'), repoRoot), false);
    assert.equal(FIELD_EVIDENCE_STORAGE_POLICY.minimumRetentionYears, 5);
  });

  it('rejects empty, unfilled template, synthetic/dummy, and patient-PII evidence while passing genuine anonymized field evidence', () => {
    const templates = buildPhaseCEvidenceTemplates(new Date('2026-11-22T01:00:00Z'));
    assert.equal(Object.keys(templates).length, PHASE_C_EVIDENCE_SLOTS.length);

    // 1. Unfilled templates MUST remain blocked
    const unfilledReport = evaluateFieldEvidenceBundle({
      submittedSlots: PHASE_C_EVIDENCE_SLOTS.map((slot) => ({
        slotId: slot.slotId,
        present: true,
        payload: templates[slot.slotId]
      }))
    });
    assert.equal(unfilledReport.status, 'blocked');
    assert.equal(unfilledReport.passedSlotCount, 0);
    assert.equal(unfilledReport.blockedSlotCount, PHASE_C_EVIDENCE_SLOTS.length);

    // 2. Patient PII or synthetic terms MUST block the bundle
    const piiAndDummyReport = evaluateFieldEvidenceBundle({
      submittedSlots: PHASE_C_EVIDENCE_SLOTS.map((slot, index) => ({
        slotId: slot.slotId,
        present: true,
        payload: index === 0
          ? { ...makeValidFieldEvidence(slot.slotId), patientName: '山田 太郎' }
          : index === 1
            ? { ...makeValidFieldEvidence(slot.slotId), note: 'dummy localhost result' }
            : makeValidFieldEvidence(slot.slotId)
      }))
    });
    assert.equal(piiAndDummyReport.status, 'blocked');
    assert.equal(piiAndDummyReport.slots[0].status, 'blocked');
    assert.equal(piiAndDummyReport.slots[1].status, 'blocked');
    assert.equal(piiAndDummyReport.passedSlotCount, PHASE_C_EVIDENCE_SLOTS.length - 2);

    // 3. Genuine anonymized real-world evidence across all 9 slots passes cleanly
    const passingReport = evaluateFieldEvidenceBundle({
      submittedSlots: PHASE_C_EVIDENCE_SLOTS.map((slot) => ({
        slotId: slot.slotId,
        present: true,
        payload: makeValidFieldEvidence(slot.slotId)
      }))
    });
    assert.equal(passingReport.status, 'pass');
    assert.equal(passingReport.passedSlotCount, PHASE_C_EVIDENCE_SLOTS.length);
    assert.equal(passingReport.blockedSlotCount, 0);

    const csv = buildFieldEvidenceBundleCsv(passingReport);
    assert.ok(csv.includes('01_print_media_field_evidence.json'));
    assert.ok(csv.includes('現物証跡OK'));
    const checklist = buildFieldEvidenceBundleChecklist(passingReport);
    assert.ok(checklist.includes('Phase C 現地証跡バンドル適合'));
    assert.ok(checklist.includes('YAKUREKI_ELIGIBILITY_FIELD_EVIDENCE'));
  });

  it('CLI scaffolds templates outside repo without overwriting existing evidence, blocks repo-internal paths, and exits 0 only when all slots pass', async () => {
    const externalRoot = await mkdtemp(join(tmpdir(), 'yakureki-field-evidence-'));
    const evidenceDir = join(externalRoot, 'store-01');
    const outputDir = join(externalRoot, 'out');
    try {
      // 1. Rejects repo-internal path by default
      await assert.rejects(
        execFileAsync(tsxBin, [cliPath, '--init', join(repoRoot, 'artifacts', 'forbidden-evidence')], {
          cwd: repoRoot,
          env: { ...process.env, YAKUREKI_FIELD_EVIDENCE_BUNDLE_OUTPUT_DIR: outputDir }
        }),
        /リポジトリ外を指定してください/
      );

      // 2. Scaffolds all 9 templates into external dir (exits 1 because templates are unfilled)
      let initCode = 0;
      let initStdout = '';
      try {
        const res = await execFileAsync(tsxBin, [cliPath, '--init', evidenceDir, '--evidence-dir', evidenceDir], {
          cwd: repoRoot,
          env: { ...process.env, YAKUREKI_FIELD_EVIDENCE_BUNDLE_OUTPUT_DIR: outputDir }
        });
        initStdout = res.stdout;
      } catch (error) {
        const errObj = error as { stdout?: string; code?: number };
        initCode = errObj.code ?? -1;
        initStdout = String(errObj.stdout || '');
      }
      assert.equal(initCode, 1);
      const initParsed = JSON.parse(initStdout || '{}');
      assert.equal(initParsed.status, 'blocked');
      assert.equal(initParsed.scaffold.createdFiles.length, PHASE_C_EVIDENCE_SLOTS.length);
      assert.equal(initParsed.passedSlotCount, 0);

      // 3. Fill all 9 files with genuine anonymized field evidence & verify re-init preserves them (never overwrites!)
      for (const slot of PHASE_C_EVIDENCE_SLOTS) {
        await writeFile(
          join(evidenceDir, slot.fileName),
          `${JSON.stringify(makeValidFieldEvidence(slot.slotId), null, 2)}\n`,
          'utf8'
        );
      }

      const passRun = await execFileAsync(tsxBin, [cliPath, '--init', evidenceDir, '--evidence-dir', evidenceDir], {
        cwd: repoRoot,
        env: { ...process.env, YAKUREKI_FIELD_EVIDENCE_BUNDLE_OUTPUT_DIR: outputDir }
      });
      const passParsed = JSON.parse(passRun.stdout);
      assert.equal(passParsed.ok, true);
      assert.equal(passParsed.status, 'pass');
      assert.equal(passParsed.passedSlotCount, PHASE_C_EVIDENCE_SLOTS.length);
      assert.equal(passParsed.scaffold.createdFiles.length, 0);
      assert.equal(passParsed.scaffold.skippedExistingFiles.length, PHASE_C_EVIDENCE_SLOTS.length);

      const savedReview = JSON.parse(await readFile(passParsed.outputs.reviewJson, 'utf8'));
      assert.equal(savedReview.status, 'pass');
    } finally {
      await rm(externalRoot, { recursive: true, force: true });
    }
  });
});
