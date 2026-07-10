import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AnonymousDiagnosticExport } from '../src/lib/anonymous_diagnostic_export.ts';
import {
  buildSupportCaseReproductionMemo,
  buildSupportCaseTriage,
  buildSupportCaseTriageCsv
} from '../src/lib/support_case_triage.ts';

const diagnosticPath = process.env.YAKUREKI_SUPPORT_DIAGNOSTIC_JSON || '';
const outputDir = process.env.YAKUREKI_SUPPORT_TRIAGE_OUTPUT_DIR || 'artifacts/support-case-triage';

function stamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function readJsonFile<T>(path: string): Promise<T> {
  const text = await readFile(path, 'utf8');
  return JSON.parse(text) as T;
}

async function main() {
  if (!diagnosticPath) {
    throw new Error('YAKUREKI_SUPPORT_DIAGNOSTIC_JSON に個人情報なし診断JSONを指定してください。');
  }

  const generatedAt = new Date();
  const artifactDir = join(outputDir, stamp(generatedAt));
  await mkdir(artifactDir, { recursive: true });

  const diagnostic = await readJsonFile<AnonymousDiagnosticExport>(diagnosticPath);
  const triage = buildSupportCaseTriage(diagnostic, { generatedAt });
  const csv = buildSupportCaseTriageCsv(triage);
  const memo = buildSupportCaseReproductionMemo(triage);

  const triageJsonPath = join(artifactDir, 'support-case-triage.json');
  const triageCsvPath = join(artifactDir, 'support-case-triage.csv');
  const memoPath = join(artifactDir, 'support-case-reproduction-memo.txt');

  await writeFile(triageJsonPath, `${JSON.stringify(triage, null, 2)}\n`, 'utf8');
  await writeFile(triageCsvPath, `\ufeff${csv}\n`, 'utf8');
  await writeFile(memoPath, `${memo}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    artifactDir,
    status: triage.status,
    statusLabel: triage.statusLabel,
    priority: triage.priority,
    priorityLabel: triage.priorityLabel,
    focusAreaCount: triage.focusAreas.length,
    outputs: {
      triageJson: triageJsonPath,
      triageCsv: triageCsvPath,
      reproductionMemo: memoPath
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
