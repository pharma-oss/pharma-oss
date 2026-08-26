import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 運用レビュー CLI 24 本の契約テスト。
//
// これまでは各 *.test.ts が scripts/run*.ts を readFileSync して
// 「この env 名が書いてある」「このファイル名が書いてある」を正規表現で見ていた。
// 文字列があることと、実際にその env を読んでそのファイルを書くことは別なので、
// ここでは package.json に登録されたコマンドをそのまま実行して、
// 標準出力の JSON と実際に書かれたファイルで判定する。
//
// 終了コードの意味は docs/ops_review_ledger.md §0 のとおり:
//   exit 0 = レビュー結果が pass / exit 1 = レビュー未達、または必須入力が未指定。
//   exit 1 はクラッシュではないので、ここでも失敗として扱わない。

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
  parsed: any;
}

function runNpmScript(npmScript: string, env: Record<string, string>): Promise<CliRun> {
  const command = packageJson.scripts[npmScript];
  assert.ok(command, `package.json に ${npmScript} が登録されていません`);
  const [bin, ...args] = String(command).split(' ');
  return new Promise((resolve) => {
    execFile(
      join(repoRoot, 'node_modules', '.bin', bin),
      args,
      { cwd: repoRoot, env: { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024 },
      (error: any, stdout, stderr) => {
        let parsed: any = null;
        try {
          parsed = JSON.parse(stdout);
        } catch {
          parsed = null;
        }
        resolve({ code: error?.code ?? 0, stdout, stderr, parsed });
      }
    );
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

interface OpsCliContract {
  /** package.json のスクリプト名 */
  npmScript: string;
  /** 成果物の出力先を差し替える env */
  outputDirEnv: string;
  /** 実行時に足す env (request_only モード等) */
  extraEnv?: Record<string, string>;
  /** 標準出力 outputs のキー → 実際に書かれるファイル名 */
  outputs: Record<string, string>;
  /** 標準出力に evidenceIntegrityStatus を含むか */
  reportsEvidenceIntegrity?: boolean;
  /** request_only 等のモード表記 */
  mode?: string;
}

// 入力なしで完走する CLI (台帳 Tier 1) と、request_only で完走する CLI。
const RUNNABLE_CLIS: OpsCliContract[] = [
  {
    npmScript: 'release:readiness',
    outputDirEnv: 'YAKUREKI_RELEASE_READINESS_OUTPUT_DIR',
    reportsEvidenceIntegrity: true,
    outputs: {
      reviewJson: 'release-update-readiness-review.json',
      reviewCsv: 'release-update-readiness-review.csv',
      evidenceTemplate: 'release-update-readiness-evidence-template.json',
      checklist: 'release-update-checklist.txt'
    }
  },
  {
    npmScript: 'release:post-review',
    outputDirEnv: 'YAKUREKI_RELEASE_POST_REVIEW_OUTPUT_DIR',
    reportsEvidenceIntegrity: true,
    outputs: {
      reviewJson: 'release-post-review.json',
      reviewCsv: 'release-post-review.csv',
      evidenceTemplate: 'release-post-review-evidence-template.json',
      checklist: 'release-post-review-checklist.txt'
    }
  },
  {
    npmScript: 'release:ops-acceptance',
    outputDirEnv: 'YAKUREKI_RELEASE_OPS_ACCEPTANCE_OUTPUT_DIR',
    reportsEvidenceIntegrity: true,
    outputs: {
      reviewJson: 'release-ops-acceptance.json',
      reviewCsv: 'release-ops-acceptance.csv',
      evidenceTemplate: 'release-ops-acceptance-evidence-template.json',
      checklist: 'release-ops-acceptance-checklist.txt'
    }
  },
  {
    npmScript: 'pilot:kpi-review',
    outputDirEnv: 'YAKUREKI_PILOT_KPI_OUTPUT_DIR',
    reportsEvidenceIntegrity: true,
    outputs: {
      reviewJson: 'pilot-kpi-review.json',
      reviewCsv: 'pilot-kpi-review.csv',
      evidenceTemplate: 'pilot-kpi-evidence-template.json',
      checklist: 'pilot-kpi-checklist.txt',
      evidenceRequest: 'pilot-kpi-evidence-request.json',
      evidenceRequestChecklist: 'pilot-kpi-evidence-request.txt'
    }
  },
  {
    npmScript: 'pilot:operational-readiness',
    outputDirEnv: 'YAKUREKI_PILOT_OPERATIONAL_READINESS_OUTPUT_DIR',
    reportsEvidenceIntegrity: true,
    outputs: {
      reviewJson: 'pilot-operational-readiness.json',
      reviewCsv: 'pilot-operational-readiness.csv',
      evidenceTemplate: 'pilot-operational-readiness-evidence-template.json',
      checklist: 'pilot-operational-readiness-checklist.txt',
      request: 'pilot-operational-readiness-request.json',
      requestChecklist: 'pilot-operational-readiness-request.txt'
    }
  },
  {
    npmScript: 'ai:clinical-review',
    outputDirEnv: 'YAKUREKI_AI_CLINICAL_REVIEW_OUTPUT_DIR',
    reportsEvidenceIntegrity: true,
    outputs: {
      reviewJson: 'ai-clinical-review.json',
      reviewCsv: 'ai-clinical-review.csv',
      evidenceTemplate: 'ai-clinical-review-evidence-template.json',
      checklist: 'ai-clinical-review-checklist.txt',
      checkRequest: 'ai-clinical-review-check-request.json',
      checkRequestChecklist: 'ai-clinical-review-check-request.txt'
    }
  },
  {
    npmScript: 'migration:trial-acceptance',
    outputDirEnv: 'YAKUREKI_MIGRATION_ACCEPTANCE_OUTPUT_DIR',
    reportsEvidenceIntegrity: true,
    outputs: {
      reviewJson: 'migration-trial-acceptance.json',
      reviewCsv: 'migration-trial-acceptance.csv',
      evidenceTemplate: 'migration-trial-acceptance-evidence-template.json',
      checklist: 'migration-trial-acceptance-checklist.txt',
      sampleRequest: 'migration-trial-acceptance-sample-request.json',
      sampleRequestChecklist: 'migration-trial-acceptance-sample-request.txt'
    }
  },
  {
    npmScript: 'staff:access-recovery-review',
    outputDirEnv: 'YAKUREKI_STAFF_ACCESS_RECOVERY_OUTPUT_DIR',
    reportsEvidenceIntegrity: true,
    outputs: {
      reviewJson: 'staff-access-recovery-review.json',
      reviewCsv: 'staff-access-recovery-review.csv',
      checklist: 'staff-access-recovery-checklist.txt',
      evidenceTemplate: 'staff-access-recovery-evidence-template.json',
      checkRequest: 'staff-access-recovery-check-request.json',
      checkRequestChecklist: 'staff-access-recovery-check-request.txt'
    }
  },
  {
    npmScript: 'electronic-prescription:connector-preflight',
    outputDirEnv: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_PREFLIGHT_OUTPUT_DIR',
    outputs: {
      preflightJson: 'electronic-prescription-connector-preflight.json',
      connectorReadinessJson: 'electronic-prescription-connector-readiness.json',
      connectorReadinessCsv: 'electronic-prescription-connector-readiness.csv',
      lastAttemptEnv: 'electronic-prescription-last-attempt.env'
    }
  },
  {
    npmScript: 'electronic-prescription:connector-contract',
    outputDirEnv: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_CONTRACT_OUTPUT_DIR',
    outputs: {
      reportJson: 'electronic-prescription-connector-contract.json',
      reportCsv: 'electronic-prescription-connector-contract.csv',
      template: 'electronic-prescription-connector-contract-template.json'
    }
  },
  {
    npmScript: 'drug-label:queue-review',
    outputDirEnv: 'YAKUREKI_DRUG_LABEL_QUEUE_REVIEW_OUTPUT_DIR',
    outputs: {
      reviewJson: 'official-drug-label-queue-review.json',
      reviewCsv: 'official-drug-label-queue-review.csv',
      checklist: 'official-drug-label-queue-checklist.txt'
    }
  },
  {
    npmScript: 'drug-label:no-candidate-review',
    outputDirEnv: 'YAKUREKI_DRUG_LABEL_NO_CANDIDATE_OUTPUT_DIR',
    reportsEvidenceIntegrity: true,
    outputs: {
      reviewJson: 'official-drug-label-no-candidate-review.json',
      reviewCsv: 'official-drug-label-no-candidate-review.csv',
      checklist: 'official-drug-label-no-candidate-checklist.txt',
      evidenceTemplate: 'official-drug-label-no-candidate-evidence-template.json'
    }
  },
  {
    npmScript: 'evidence:integrity',
    outputDirEnv: 'YAKUREKI_EVIDENCE_INTEGRITY_OUTPUT_DIR',
    outputs: {
      review: 'evidence-integrity-review.json',
      template: 'evidence-integrity-input-template.json'
    }
  },
  {
    npmScript: 'electronic-prescription:field-readiness',
    outputDirEnv: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_OUTPUT_DIR',
    extraEnv: { YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_REQUEST_ONLY: '1' },
    mode: 'request_only',
    outputs: {
      checkRequest: 'electronic-prescription-field-check-request.json',
      checkRequestChecklist: 'electronic-prescription-field-check-request.txt'
    }
  },
  {
    npmScript: 'eligibility:field-readiness',
    outputDirEnv: 'YAKUREKI_ELIGIBILITY_FIELD_OUTPUT_DIR',
    extraEnv: { YAKUREKI_ELIGIBILITY_FIELD_REQUEST_ONLY: '1' },
    mode: 'request_only',
    outputs: {
      checkRequest: 'online-eligibility-field-check-request.json',
      checkRequestChecklist: 'online-eligibility-field-check-request.txt'
    }
  },
  {
    npmScript: 'pharmacy-device:field-readiness',
    outputDirEnv: 'YAKUREKI_PHARMACY_DEVICE_FIELD_OUTPUT_DIR',
    extraEnv: { YAKUREKI_PHARMACY_DEVICE_FIELD_REQUEST_ONLY: '1' },
    mode: 'request_only',
    outputs: {
      checkRequest: 'pharmacy-device-field-check-request.json',
      checkRequestChecklist: 'pharmacy-device-field-check-request.txt'
    }
  },
  {
    npmScript: 'print:field-verification',
    outputDirEnv: 'YAKUREKI_PRINT_FIELD_OUTPUT_DIR',
    extraEnv: { YAKUREKI_PRINT_FIELD_REQUEST_ONLY: '1' },
    mode: 'request_only',
    outputs: {
      evidenceTemplate: 'print-media-field-evidence-template.json',
      checkRequest: 'print-media-field-check-request.json',
      checkRequestChecklist: 'print-media-field-check-request.txt'
    }
  }
];

// 必須入力が無いときは exit 1 で、どの env に何を渡せばよいかを名指しする。
// (台帳 §0「必須入力が未指定」)
const REQUIRED_INPUT_CLIS: Array<{ npmScript: string; outputDirEnv: string; env: string }> = [
  { npmScript: 'support:triage', outputDirEnv: 'YAKUREKI_SUPPORT_TRIAGE_OUTPUT_DIR', env: 'YAKUREKI_SUPPORT_DIAGNOSTIC_JSON' },
  { npmScript: 'support:drill', outputDirEnv: 'YAKUREKI_SUPPORT_DRILL_OUTPUT_DIR', env: 'YAKUREKI_SUPPORT_TRIAGE_JSON' },
  { npmScript: 'support:sla', outputDirEnv: 'YAKUREKI_SUPPORT_SLA_OUTPUT_DIR', env: 'YAKUREKI_SUPPORT_TRIAGE_JSON' },
  { npmScript: 'claim:official-submission-review', outputDirEnv: 'YAKUREKI_OFFICIAL_SUBMISSION_TRIAL_OUTPUT_DIR', env: 'YAKUREKI_OFFICIAL_SUBMISSION_TRIAL_JSON' },
  { npmScript: 'electronic-prescription:field-readiness', outputDirEnv: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_OUTPUT_DIR', env: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_READINESS' },
  { npmScript: 'eligibility:field-readiness', outputDirEnv: 'YAKUREKI_ELIGIBILITY_FIELD_OUTPUT_DIR', env: 'YAKUREKI_ELIGIBILITY_CONNECTOR_READINESS' },
  { npmScript: 'pharmacy-device:field-readiness', outputDirEnv: 'YAKUREKI_PHARMACY_DEVICE_FIELD_OUTPUT_DIR', env: 'YAKUREKI_PHARMACY_DEVICE_CONNECTOR_READINESS' },
  { npmScript: 'print:field-verification', outputDirEnv: 'YAKUREKI_PRINT_FIELD_OUTPUT_DIR', env: 'YAKUREKI_PRINT_LAYOUT_MANIFEST' }
];

// 任意入力の env。存在しないパスを渡したときに読みに行って落ちることで、
// その env 名を実際に読んでいることを確かめる (綴りを変えたら黙って既定値に戻る箇所)。
const OPTIONAL_INPUT_CLIS: Array<{ npmScript: string; outputDirEnv: string; env: string }> = [
  { npmScript: 'release:readiness', outputDirEnv: 'YAKUREKI_RELEASE_READINESS_OUTPUT_DIR', env: 'YAKUREKI_RELEASE_READINESS_EVIDENCE' },
  { npmScript: 'release:post-review', outputDirEnv: 'YAKUREKI_RELEASE_POST_REVIEW_OUTPUT_DIR', env: 'YAKUREKI_RELEASE_POST_REVIEW_EVIDENCE' },
  { npmScript: 'release:ops-acceptance', outputDirEnv: 'YAKUREKI_RELEASE_OPS_ACCEPTANCE_OUTPUT_DIR', env: 'YAKUREKI_RELEASE_OPS_ACCEPTANCE_EVIDENCE' },
  { npmScript: 'pilot:kpi-review', outputDirEnv: 'YAKUREKI_PILOT_KPI_OUTPUT_DIR', env: 'YAKUREKI_PILOT_KPI_EVIDENCE' },
  { npmScript: 'pilot:operational-readiness', outputDirEnv: 'YAKUREKI_PILOT_OPERATIONAL_READINESS_OUTPUT_DIR', env: 'YAKUREKI_PILOT_OPERATIONAL_READINESS_EVIDENCE' },
  { npmScript: 'ai:clinical-review', outputDirEnv: 'YAKUREKI_AI_CLINICAL_REVIEW_OUTPUT_DIR', env: 'YAKUREKI_AI_CLINICAL_REVIEW_EVIDENCE' },
  { npmScript: 'migration:trial-acceptance', outputDirEnv: 'YAKUREKI_MIGRATION_ACCEPTANCE_OUTPUT_DIR', env: 'YAKUREKI_MIGRATION_ACCEPTANCE_EVIDENCE' },
  { npmScript: 'migration:trial-acceptance', outputDirEnv: 'YAKUREKI_MIGRATION_ACCEPTANCE_OUTPUT_DIR', env: 'YAKUREKI_MIGRATION_PATIENT_CSV' },
  { npmScript: 'staff:access-recovery-review', outputDirEnv: 'YAKUREKI_STAFF_ACCESS_RECOVERY_OUTPUT_DIR', env: 'YAKUREKI_STAFF_ACCESS_RECOVERY_EVIDENCE' },
  { npmScript: 'drug-label:no-candidate-review', outputDirEnv: 'YAKUREKI_DRUG_LABEL_NO_CANDIDATE_OUTPUT_DIR', env: 'YAKUREKI_DRUG_LABEL_NO_CANDIDATE_EVIDENCE' },
  { npmScript: 'drug-label:queue-review', outputDirEnv: 'YAKUREKI_DRUG_LABEL_QUEUE_REVIEW_OUTPUT_DIR', env: 'YAKUREKI_DRUG_LABEL_QUEUE_JSON' },
  { npmScript: 'electronic-prescription:connector-contract', outputDirEnv: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_CONTRACT_OUTPUT_DIR', env: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_CONTRACT' },
  { npmScript: 'evidence:integrity', outputDirEnv: 'YAKUREKI_EVIDENCE_INTEGRITY_OUTPUT_DIR', env: 'YAKUREKI_EVIDENCE_INTEGRITY_JSON' }
];

let workDir = '';
const runnableRuns = new Map<string, CliRun>();
const requiredInputRuns = new Map<string, CliRun>();
const optionalInputRuns = new Map<string, CliRun>();

before(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'yakureki-ops-cli-'));
  const missingPath = join(workDir, 'this-file-does-not-exist.json');

  await Promise.all([
    ...RUNNABLE_CLIS.map(async (contract) => {
      const run = await runNpmScript(contract.npmScript, {
        [contract.outputDirEnv]: join(workDir, 'run', contract.npmScript.replace(/[:/]/g, '_')),
        ...(contract.extraEnv || {})
      });
      runnableRuns.set(contract.npmScript, run);
    }),
    ...REQUIRED_INPUT_CLIS.map(async ({ npmScript, outputDirEnv, env }) => {
      const run = await runNpmScript(npmScript, {
        [outputDirEnv]: join(workDir, 'missing-input', `${npmScript.replace(/[:/]/g, '_')}`)
      });
      requiredInputRuns.set(`${npmScript}|${env}`, run);
    }),
    ...OPTIONAL_INPUT_CLIS.map(async ({ npmScript, outputDirEnv, env }) => {
      const run = await runNpmScript(npmScript, {
        [outputDirEnv]: join(workDir, 'optional', `${npmScript.replace(/[:/]/g, '_')}-${env}`),
        [env]: missingPath
      });
      optionalInputRuns.set(`${npmScript}|${env}`, run);
    })
  ]);
}, { timeout: 300000 });

after(async () => {
  if (workDir) {
    await rm(workDir, { recursive: true, force: true });
  }
});

for (const contract of RUNNABLE_CLIS) {
  test(`${contract.npmScript} CLI writes the artifacts it reports`, async () => {
    const run = runnableRuns.get(contract.npmScript)!;
    assert.ok(run, `${contract.npmScript} が実行されていません`);

    // exit 1 は「レビュー未達」。クラッシュしていないことは標準出力の JSON で判定する。
    assert.ok([0, 1].includes(run.code), `想定外の終了コード ${run.code}: ${run.stderr.slice(0, 300)}`);
    assert.ok(run.parsed, `標準出力が JSON ではありません: ${run.stdout.slice(0, 200)}${run.stderr.slice(0, 300)}`);

    if (typeof run.parsed.ok === 'boolean') {
      assert.equal(run.code, run.parsed.ok ? 0 : 1, 'exit code は ok と一致すること (台帳 §0)');
    }
    if (contract.mode) {
      assert.equal(run.parsed.mode, contract.mode);
    }
    if (contract.reportsEvidenceIntegrity) {
      assert.equal(
        typeof run.parsed.evidenceIntegrityStatus,
        'string',
        '証跡の真正性ステータスを標準出力へ出すこと'
      );
    }

    const outputs = run.parsed.outputs || {};
    assert.deepEqual(
      Object.keys(outputs).sort(),
      Object.keys(contract.outputs).sort(),
      '標準出力が報告する成果物の顔ぶれ'
    );

    for (const [key, fileName] of Object.entries(contract.outputs)) {
      const reported = String(outputs[key]);
      assert.equal(basename(reported), fileName, `${key} のファイル名`);
      assert.ok(
        reported.startsWith(join(workDir, 'run')),
        `${key} は出力先 env で差し替えられること (実際: ${reported})`
      );
      assert.ok(await exists(reported), `${key} が実際に書かれていること: ${reported}`);
    }
  });
}

for (const { npmScript, env } of REQUIRED_INPUT_CLIS) {
  test(`${npmScript} CLI names ${env} when the required input is missing`, () => {
    const run = requiredInputRuns.get(`${npmScript}|${env}`)!;
    assert.ok(run, `${npmScript} が実行されていません`);
    assert.equal(run.code, 1, '必須入力が未指定なら exit 1 (台帳 §0)');
    assert.match(run.stderr, new RegExp(env), '不足している env を名指しすること');
  });
}

for (const { npmScript, env } of OPTIONAL_INPUT_CLIS) {
  test(`${npmScript} CLI reads ${env} when it is set`, () => {
    const run = optionalInputRuns.get(`${npmScript}|${env}`)!;
    assert.ok(run, `${npmScript} が実行されていません`);
    // 実在しないパスを渡している。env を読んでいれば必ず失敗する。
    // 綴りを変えると黙って既定値へ戻り、成功してしまうのでここで捕まえる。
    assert.equal(run.code, 1, `${env} を渡したのに完走した (env 名を読んでいない可能性)`);
    assert.match(run.stderr, /ENOENT|this-file-does-not-exist/, run.stderr.slice(0, 200));
  });
}

test('ops review ledger covers every CLI exercised here', () => {
  const ledger = readFileSync(new URL('../../docs/ops_review_ledger.md', import.meta.url), 'utf8');
  const covered = new Set([
    ...RUNNABLE_CLIS.map((c) => c.npmScript),
    ...REQUIRED_INPUT_CLIS.map((c) => c.npmScript)
  ]);
  for (const npmScript of covered) {
    assert.ok(ledger.includes(npmScript), `台帳に ${npmScript} の記載がありません`);
  }
});
