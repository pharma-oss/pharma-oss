import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIELD_EVIDENCE_STORAGE_POLICY,
  PHASE_C_EVIDENCE_SLOTS,
  buildEvidenceStorageReadme,
  buildFieldEvidenceBundleChecklist,
  buildFieldEvidenceBundleCsv,
  buildPhaseCEvidenceTemplates,
  evaluateFieldEvidenceBundle,
  isPathInsideDirectory,
  type SubmittedFieldEvidenceSlot
} from '../src/lib/field_evidence_bundle.ts';
import { opsReviewStatusExitCode } from '../src/lib/ops_review_status.ts';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const outputDir = process.env.YAKUREKI_FIELD_EVIDENCE_BUNDLE_OUTPUT_DIR || 'artifacts/field-evidence-bundle';
const bundleId = process.env.YAKUREKI_FIELD_EVIDENCE_BUNDLE_ID || 'phase-c-field-evidence-bundle';

function parseCliArgs(argv: string[]) {
  let evidenceDir = process.env.YAKUREKI_FIELD_EVIDENCE_DIR || '';
  let initDir = process.env.YAKUREKI_FIELD_EVIDENCE_INIT_DIR || '';
  let allowRepoPath = process.env.YAKUREKI_FIELD_EVIDENCE_ALLOW_REPO_PATH === '1';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--evidence-dir' && argv[i + 1]) {
      evidenceDir = argv[++i];
    } else if (arg === '--init' && argv[i + 1]) {
      initDir = argv[++i];
    } else if (arg === '--allow-repo-path') {
      allowRepoPath = true;
    }
  }
  return { evidenceDir, initDir, allowRepoPath };
}

function stamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function scaffoldEvidenceDir(targetDir: string, generatedAt: Date, allowRepoPath: boolean) {
  const resolvedTarget = resolve(targetDir);
  if (!allowRepoPath && isPathInsideDirectory(resolvedTarget, repoRoot)) {
    throw new Error(
      `証跡保管ディレクトリはリポジトリ外を指定してください (I-2 保管ルール違反: ${resolvedTarget})。テスト目的の場合のみ --allow-repo-path を指定できます。`
    );
  }
  await mkdir(resolvedTarget, { recursive: true });
  const templates = buildPhaseCEvidenceTemplates(generatedAt);
  const createdFiles: string[] = [];
  const skippedExistingFiles: string[] = [];

  for (const slot of PHASE_C_EVIDENCE_SLOTS) {
    const filePath = join(resolvedTarget, slot.fileName);
    try {
      await writeFile(filePath, `${JSON.stringify(templates[slot.slotId], null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx'
      });
      createdFiles.push(slot.fileName);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
        skippedExistingFiles.push(slot.fileName);
      } else {
        throw error;
      }
    }
  }

  const readmePath = join(resolvedTarget, 'README_EVIDENCE_STORAGE.txt');
  if (!await fileExists(readmePath)) {
    await writeFile(readmePath, `${buildEvidenceStorageReadme(resolvedTarget)}\n`, 'utf8');
  }

  return { resolvedTarget, createdFiles, skippedExistingFiles, readmePath };
}

async function main() {
  const generatedAt = new Date();
  const { evidenceDir, initDir, allowRepoPath } = parseCliArgs(process.argv.slice(2));

  let scaffoldSummary: Awaited<ReturnType<typeof scaffoldEvidenceDir>> | null = null;
  if (initDir) {
    scaffoldSummary = await scaffoldEvidenceDir(initDir, generatedAt, allowRepoPath);
  }

  const activeEvidenceDir = evidenceDir ? resolve(evidenceDir) : '';
  if (activeEvidenceDir && !allowRepoPath && isPathInsideDirectory(activeEvidenceDir, repoRoot)) {
    throw new Error(
      `証跡ディレクトリはリポジトリ外を指定してください (I-2 保管ルール違反: ${activeEvidenceDir})。`
    );
  }

  const submittedSlots: SubmittedFieldEvidenceSlot[] = [];
  if (activeEvidenceDir) {
    // 存在しないディレクトリが明示指定された場合は黙って空扱いにせず失敗させる（ops_review_cli.test.ts 契約準拠）
    await stat(activeEvidenceDir);

    for (const slot of PHASE_C_EVIDENCE_SLOTS) {
      const filePath = join(activeEvidenceDir, slot.fileName);
      if (!await fileExists(filePath)) {
        submittedSlots.push({ slotId: slot.slotId, present: false });
        continue;
      }
      try {
        const raw = await readFile(filePath, 'utf8');
        submittedSlots.push({ slotId: slot.slotId, present: true, payload: JSON.parse(raw) });
      } catch (error) {
        submittedSlots.push({
          slotId: slot.slotId,
          present: true,
          parseError: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  const review = evaluateFieldEvidenceBundle({
    bundleId,
    submittedSlots,
    generatedAt
  });

  const artifactDir = join(outputDir, stamp(generatedAt));
  await mkdir(artifactDir, { recursive: true });

  const reviewJsonPath = join(artifactDir, 'field-evidence-bundle-review.json');
  const reviewCsvPath = join(artifactDir, 'field-evidence-bundle-review.csv');
  const checklistPath = join(artifactDir, 'field-evidence-bundle-checklist.txt');
  const storagePolicyPath = join(artifactDir, 'field-evidence-storage-policy.json');

  await writeFile(reviewJsonPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  await writeFile(reviewCsvPath, `\ufeff${buildFieldEvidenceBundleCsv(review)}\n`, 'utf8');
  await writeFile(checklistPath, `${buildFieldEvidenceBundleChecklist(review)}\n`, 'utf8');
  await writeFile(storagePolicyPath, `${JSON.stringify(FIELD_EVIDENCE_STORAGE_POLICY, null, 2)}\n`, 'utf8');

  const exitCode = opsReviewStatusExitCode(review.status);
  console.log(JSON.stringify({
    ok: exitCode === 0,
    artifactDir,
    status: review.status,
    statusLabel: review.statusLabel,
    evidenceIntegrityStatus: review.evidenceIntegrityStatus,
    totalSlotCount: review.totalSlotCount,
    presentSlotCount: review.presentSlotCount,
    passedSlotCount: review.passedSlotCount,
    attentionSlotCount: review.attentionSlotCount,
    blockedSlotCount: review.blockedSlotCount,
    ...(scaffoldSummary ? { scaffold: scaffoldSummary } : {}),
    outputs: {
      reviewJson: reviewJsonPath,
      reviewCsv: reviewCsvPath,
      checklist: checklistPath,
      storagePolicy: storagePolicyPath
    }
  }, null, 2));

  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
