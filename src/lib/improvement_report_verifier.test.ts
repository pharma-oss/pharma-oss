import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectDeclaredTestNames,
  extractFileLineReferences,
  extractMutationTableTestNames,
  formatVerificationReportTable,
  parseImprovementReport,
  scanRefactorDiffForBehaviorChanges,
  verifyChangedFilesStat,
  verifyFileLineReferences,
  verifyGateOutputs,
  verifyMentionedTestNames
} from './improvement_report_verifier.ts';

const SAMPLE_REPORT = `## T-93: サンプル報告

- 読んだガイドの版: e732423
- コミット: 947ce7b（\`fix(emr): sample commit\`）
- 変更ファイル:
\`\`\`text
 src/app/emr/TracingReportModal.test.ts        | 137 +++++++++++++++++++-
 src/app/emr/components/TracingReportModal.tsx |  47 ++++++-
 2 files changed, 180 insertions(+), 4 deletions(-)
\`\`\`

### ゲート（出力ファイル: [20261116-2228-T-93-baseline](file:///repo/artifacts/improvement/20261116-2228-T-93-baseline) と [20261116-2255-T-93-final](file:///repo/artifacts/improvement/20261116-2255-T-93-final)）
- npx tsc --noEmit:
\`\`\`text
exit 0
\`\`\`
- npm run lint:
\`\`\`text

> pharma-oss@1.0.0 lint
> eslint src

exit 0
\`\`\`
- npm test:
\`\`\`text
ℹ tests 3079
ℹ suites 196
ℹ pass 3079
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 78343.266916
exit 0
\`\`\`
- npm run build:
\`\`\`text
✓ Generating static pages using 7 workers (32/32) in 274ms
exit 0
\`\`\`

### 変異（実測）
| # | 変異（ファイル:行 と置換内容） | 落ちたテスト名（実在を grep 確認済み） | 落ちた件数 | 戻した後 |
|---|---|---|---|---|
| 1 | [TracingReportModal.tsx:32](file:///repo/src/app/emr/components/TracingReportModal.tsx#L32) | \`keeps modal open on failure\` | 1/10 fail | 通過 |
| 2 | src/app/emr/TracingReportModal.test.ts:10-20 | \`pins save button as disabled\` | 1/10 fail | 通過 |

### SW-F 回帰ガード（前 → 後）
- inline-style (基準 3): 3 → 3
- process-env-files (基準 4): 4 → 4
- await-logAuditAction (基準 5): 5 → 5
- typeof-function-tests (基準 0): 0 → 0
- ts-ignore (基準 0): 0 → 0
- colon-any: 67 → 67
- as-any: 32 → 32
`;

describe('improvement_report_verifier (P6-2)', () => {
  it('parses §10 report metadata, gate metrics, mutation test names, and file:line refs', () => {
    const parsed = parseImprovementReport(SAMPLE_REPORT);
    assert.strictEqual(parsed.guideVersion, 'e732423');
    assert.strictEqual(parsed.commitHash, '947ce7b');
    assert.strictEqual(parsed.baselineGateDir, 'artifacts/improvement/20261116-2228-T-93-baseline');
    assert.strictEqual(parsed.finalGateDir, 'artifacts/improvement/20261116-2255-T-93-final');
    assert.strictEqual(parsed.tscExitCode, 0);
    assert.strictEqual(parsed.lintHasEslintHeader, true);
    assert.strictEqual(parsed.lintExitCode, 0);
    assert.strictEqual(parsed.testSummary.tests, 3079);
    assert.strictEqual(parsed.testSummary.suites, 196);
    assert.strictEqual(parsed.testSummary.durationMs, '78343.266916');
    assert.strictEqual(parsed.buildSummary.staticPagesCompleted, 32);
    assert.strictEqual(parsed.buildSummary.staticPagesTotal, 32);
    assert.strictEqual(parsed.swfFinal.colonAny, 67);
    assert.strictEqual(parsed.swfFinal.asAny, 32);
    assert.deepStrictEqual(parsed.mutationTestNames, [
      'keeps modal open on failure',
      'pins save button as disabled'
    ]);
    assert.deepStrictEqual(parsed.fileLineRefs, [
      { file: 'src/app/emr/components/TracingReportModal.tsx', line: 32 },
      { file: 'src/app/emr/TracingReportModal.test.ts', line: 10 },
      { file: 'src/app/emr/TracingReportModal.test.ts', line: 20 }
    ]);
  });

  it('flags missing files and out-of-range line numbers', () => {
    const refs = extractFileLineReferences('see src/a.ts:15 and src/b.ts:99 and src/missing.ts:3');
    const result = verifyFileLineReferences(refs, (file) => {
      if (file === 'src/a.ts') return 20;
      if (file === 'src/b.ts') return 40;
      return null;
    });
    assert.strictEqual(result.status, 'fail');
    assert.strictEqual(result.issues.length, 2);
    assert.match(result.issues[0], /src\/b\.ts:99/);
    assert.match(result.issues[1], /src\/missing\.ts:3/);
  });

  it('verifies mutation test names against test()/it() declarations including parameterized templates', () => {
    const declared = collectDeclaredTestNames(`
      test('keeps modal open on failure', () => {});
      it("pins save button as disabled", () => {});
      it(\`pins disabled state for \${target.name} button when \${target.propKey} is false\`, () => {});
    `);
    const okResult = verifyMentionedTestNames(
      [
        ...extractMutationTableTestNames(SAMPLE_REPORT),
        'pins disabled state for 重複確認 button when canRunElectronicPrescriptionDuplicateCheck is false'
      ],
      declared
    );
    assert.strictEqual(okResult.status, 'pass');

    const failResult = verifyMentionedTestNames(['keeps modal open on failure', 'fabricated test name'], declared);
    assert.strictEqual(failResult.status, 'fail');
    assert.match(failResult.issues[0], /fabricated test name/);
  });

  it('detects gate output mismatches against saved tsc/lint/test/build/swf files', () => {
    const parsed = parseImprovementReport(SAMPLE_REPORT);
    const matchingSaved = {
      tscTxt: 'exit 0\n',
      lintTxt: '\n> pharma-oss@1.0.0 lint\n> eslint src\n\nexit 0\n',
      testTxt: 'ℹ tests 3079\nℹ suites 196\nℹ pass 3079\nℹ fail 0\nℹ duration_ms 78343.266916\nexit 0\n',
      buildTxt: '✓ Generating static pages using 7 workers (32/32) in 274ms\nexit 0\n',
      swfTxt: [
        'inline-style (基準 3): 3',
        'process-env-files (基準 4): 4',
        'await-logAuditAction (基準 5): 5',
        'typeof-function-tests (基準 0): 0',
        'ts-ignore (基準 0): 0',
        'colon-any: 67',
        'as-any: 32',
        'exit 0'
      ].join('\n')
    };
    assert.strictEqual(verifyGateOutputs(parsed, matchingSaved).status, 'pass');

    const mismatched = verifyGateOutputs(parsed, {
      ...matchingSaved,
      testTxt: 'ℹ tests 3079\nℹ suites 196\nℹ pass 3079\nℹ fail 0\nℹ duration_ms 99999.0\nexit 0\n',
      swfTxt: matchingSaved.swfTxt.replace('colon-any: 67', 'colon-any: 68')
    });
    assert.strictEqual(mismatched.status, 'fail');
    assert.strictEqual(mismatched.issues.length, 2);
    assert.match(mismatched.issues[0], /duration_ms/);
    assert.match(mismatched.issues[1], /colon-any/);
  });

  it('verifies reported stat block against git show --stat including ellipsis paths', () => {
    const actualStat = [
      ' src/app/print/components/ElectronicPrescriptionPrintPanel.test.ts | 419 ++++++++++++++++++++-',
      ' 1 file changed, 410 insertions(+), 9 deletions(-)'
    ].join('\n');

    const ok = verifyChangedFilesStat(
      ['.../ElectronicPrescriptionPrintPanel.test.ts | 419 ++++++++++++++++++++-'],
      '1 file changed, 410 insertions(+), 9 deletions(-)',
      actualStat
    );
    assert.strictEqual(ok.status, 'pass');

    const mismatch = verifyChangedFilesStat(
      ['.../ElectronicPrescriptionPrintPanel.test.ts | 999 ++++++++++++++++++++-'],
      '1 file changed, 410 insertions(+), 9 deletions(-)',
      actualStat
    );
    assert.strictEqual(mismatch.status, 'fail');
  });

  it('flags added behavior-changing operators in refactor commits and skips non-refactor commits', () => {
    const nonRefactor = scanRefactorDiffForBehaviorChanges('fix(emr): handle missing visit', '+const x = a ?? b;');
    assert.strictEqual(nonRefactor.status, 'skip');

    const cleanRefactor = scanRefactorDiffForBehaviorChanges(
      'refactor(emr): replace any annotations',
      [
        'diff --git a/src/lib/sample.ts b/src/lib/sample.ts',
        '+++ b/src/lib/sample.ts',
        '@@ -1,2 +1,3 @@',
        '-const x: any = value;',
        '+const x: Partial<Drug> = value;',
        '+// comment with ?? || ?. should be ignored'
      ].join('\n')
    );
    assert.strictEqual(cleanRefactor.status, 'pass');

    const leakyRefactor = scanRefactorDiffForBehaviorChanges(
      'refactor(emr): replace any annotations',
      [
        'diff --git a/src/lib/sample.ts b/src/lib/sample.ts',
        '+++ b/src/lib/sample.ts',
        '@@ -10,1 +10,5 @@',
        '+const name = input?.name ?? fallback || "";',
        '+const casted = data as Drug;',
        '+if (typeof value === "string" && "code" in data) {}'
      ].join('\n')
    );
    assert.strictEqual(leakyRefactor.status, 'fail');
    const kinds = new Set(leakyRefactor.findings.map((f) => f.kind));
    assert.ok(kinds.has('nullish-coalescing'));
    assert.ok(kinds.has('logical-or'));
    assert.ok(kinds.has('optional-chaining'));
    assert.ok(kinds.has('type-assertion'));
    assert.ok(kinds.has('typeof-guard'));
    assert.ok(kinds.has('in-operator'));
  });

  it('formats a readable Markdown table with manual review reminder', () => {
    const table = formatVerificationReportTable({
      reportPath: 'artifacts/improvement/sample/T-93.md',
      commitHash: '947ce7b',
      results: [
        { id: 'a', label: 'ファイルパス・行番号の実在', status: 'pass', detail: '3 件一致', issues: [] }
      ]
    });
    assert.match(table, /\| ファイルパス・行番号の実在 \| PASS \| 3 件一致 \|/);
    assert.match(table, /§11 の 5〜7/);
  });

  it('handles escaped pipes in mutation tables, shorthand final gate dirs, (なし) probe rows, and backticked SW-F lines', () => {
    const trickyReport = `## T-88: サンプル
### ゲート（出力ファイル: artifacts/improvement/20261116-1536-T-89-baseline/ と 20261116-1614-T-89-final-rerun/）
### 変異（実測）
| # | 変異 | 落ちたテスト名 | 落ちた件数 | 戻した後 |
|---|---|---|---|---|
| 1 | \`a \\|\\| b\` → \`true \\|\\| b\` | \`detects or mutation\` | 1/2 | 通過 |
| 2 | \`probe\` | (なし) | 0/2 | 通過 |
### SW-F 回帰ガード（前 → 後）
- \`inline-style (基準 3): 3\` → \`inline-style (基準 3): 4\`
- \`colon-any: 69\` → \`colon-any: 67\`（\`-2\`）
- \`as-any: 32\` → \`as-any: 32\`
`;
    const parsed = parseImprovementReport(trickyReport);
    assert.strictEqual(parsed.baselineGateDir, 'artifacts/improvement/20261116-1536-T-89-baseline');
    assert.strictEqual(parsed.finalGateDir, 'artifacts/improvement/20261116-1614-T-89-final-rerun');
    assert.deepStrictEqual(parsed.mutationTestNames, ['detects or mutation']);
    assert.strictEqual(parsed.swfFinal.inlineStyle, 4);
    assert.strictEqual(parsed.swfFinal.colonAny, 67);
    assert.strictEqual(parsed.swfFinal.asAny, 32);
  });
});
