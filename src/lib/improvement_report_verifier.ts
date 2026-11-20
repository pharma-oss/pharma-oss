// Gemini 改善報告（§10 形式）の機械検証ロジック（提案書 P6-2 / ガイド §11）。
// 純粋関数群として切り出し、scripts/verify_gemini_report.mjs（CLI）と単体テストの両方から直接使用する。
// 注意: 本検証が緑でも、§11 の 5〜7（独自変異の注入・diff の精読・実画面再現）は省略しない。

export interface FileLineRef {
  file: string;
  line: number;
}

export interface ReportedTestSummary {
  tests?: number;
  suites?: number;
  pass?: number;
  fail?: number;
  cancelled?: number;
  skipped?: number;
  durationMs?: string;
  exitCode?: number;
}

export interface ReportedBuildSummary {
  staticPagesCompleted?: number;
  staticPagesTotal?: number;
  exitCode?: number;
}

export interface ReportedSwfMetrics {
  inlineStyle?: number;
  processEnvFiles?: number;
  awaitLogAuditAction?: number;
  typeofFunctionTests?: number;
  tsIgnore?: number;
  colonAny?: number;
  asAny?: number;
}

export interface ParsedImprovementReport {
  guideVersion?: string;
  commitHash?: string;
  statLines: string[];
  statSummary?: string;
  baselineGateDir?: string;
  finalGateDir?: string;
  tscExitCode?: number;
  lintHasEslintHeader: boolean;
  lintExitCode?: number;
  testSummary: ReportedTestSummary;
  buildSummary: ReportedBuildSummary;
  swfFinal: ReportedSwfMetrics;
  mutationTestNames: string[];
  fileLineRefs: FileLineRef[];
}

export interface CheckItemResult {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
  issues: string[];
}

export interface RefactorBehaviorFinding {
  file: string;
  line: number;
  kind: 'nullish-coalescing' | 'logical-or' | 'optional-chaining' | 'type-assertion' | 'typeof-guard' | 'in-operator';
  excerpt: string;
}

function extractSection(markdown: string, headingPrefix: string): string {
  const escaped = headingPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}[^\\n]*\\n([\\s\\S]*?)(?=^### |^## |(?![\\s\\S]))`, 'm');
  const match = markdown.match(pattern);
  return match ? match[1] : '';
}

function extractLabeledCodeBlock(section: string, labelPrefix: string): string {
  const escaped = labelPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^-\\s*${escaped}[^\\n]*\\n\`\`\`[^\\n]*\\n([\\s\\S]*?)\\n\`\`\``, 'm');
  const match = section.match(pattern);
  return match ? match[1] : '';
}

function parseIntegerMatch(text: string, pattern: RegExp): number | undefined {
  const match = text.match(pattern);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseTestSummaryText(text: string): ReportedTestSummary {
  const durationMatch = text.match(/ℹ\s+duration_ms\s+([0-9]+(?:\.[0-9]+)?)/);
  return {
    tests: parseIntegerMatch(text, /ℹ\s+tests\s+(\d+)/),
    suites: parseIntegerMatch(text, /ℹ\s+suites\s+(\d+)/),
    pass: parseIntegerMatch(text, /ℹ\s+pass\s+(\d+)/),
    fail: parseIntegerMatch(text, /ℹ\s+fail\s+(\d+)/),
    cancelled: parseIntegerMatch(text, /ℹ\s+cancelled\s+(\d+)/),
    skipped: parseIntegerMatch(text, /ℹ\s+skipped\s+(\d+)/),
    durationMs: durationMatch ? durationMatch[1] : undefined,
    exitCode: parseIntegerMatch(text, /^exit\s+(\d+)\s*$/m)
  };
}

export function parseBuildSummaryText(text: string): ReportedBuildSummary {
  const pagesMatches = [...text.matchAll(/Generating static pages[^\n]*\((\d+)\/(\d+)\)/g)];
  const lastMatch = pagesMatches.length > 0 ? pagesMatches[pagesMatches.length - 1] : null;
  return {
    staticPagesCompleted: lastMatch ? Number(lastMatch[1]) : undefined,
    staticPagesTotal: lastMatch ? Number(lastMatch[2]) : undefined,
    exitCode: parseIntegerMatch(text, /^exit\s+(\d+)\s*$/m)
  };
}

export function parseSwfMetricsText(text: string): ReportedSwfMetrics {
  const readValue = (labelPattern: RegExp): number | undefined => {
    const lineMatch = text.match(labelPattern);
    if (!lineMatch) return undefined;
    const line = lineMatch[0];
    // "3 → 3" や "`inline-style (基準 3): 3` → `inline-style (基準 3): 4`" のどちらでも最終値（後）を取る
    const afterArrow = line.includes('→') ? line.split('→').slice(-1)[0] : line;
    const numMatch = afterArrow.match(/:\s*(\d+)/) ?? afterArrow.match(/(?:^|\s)(\d+)(?:\b|`|$)/);
    if (!numMatch) return undefined;
    const parsed = Number(numMatch[1]);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  return {
    inlineStyle: readValue(/^[^\n]*inline-style[^\n]*/m),
    processEnvFiles: readValue(/^[^\n]*process-env-files[^\n]*/m),
    awaitLogAuditAction: readValue(/^[^\n]*await-logAuditAction[^\n]*/m),
    typeofFunctionTests: readValue(/^[^\n]*typeof-function-tests[^\n]*/m),
    tsIgnore: readValue(/^[^\n]*ts-ignore[^\n]*/m),
    colonAny: readValue(/^[^\n]*colon-any[^\n]*/m),
    asAny: readValue(/^[^\n]*as-any[^\n]*/m)
  };
}

export function extractFileLineReferences(markdown: string): FileLineRef[] {
  const seen = new Set<string>();
  const refs: FileLineRef[] = [];
  const addRef = (file: string, line: number) => {
    if (!file.startsWith('src/') || !Number.isInteger(line) || line <= 0) return;
    const key = `${file}:${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ file, line });
  };

  // Markdown リンク [label](file:///.../src/path.ts#L12-L34)
  const linkRe = /file:\/\/[^)\s]*?\/(src\/[A-Za-z0-9_\-./[\]]+\.(?:tsx?|css))#L(\d+)(?:-L(\d+))?/g;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRe.exec(markdown))) {
    addRef(linkMatch[1], Number(linkMatch[2]));
    if (linkMatch[3]) {
      addRef(linkMatch[1], Number(linkMatch[3]));
    }
  }

  // 直接表記 src/path.ts:123 または src/path.ts:123-145
  const plainRe = /(?:^|[^A-Za-z0-9_./-])(src\/[A-Za-z0-9_\-./[\]]+\.(?:tsx?|css)):(\d+)(?:-(\d+))?/g;
  let plainMatch: RegExpExecArray | null;
  while ((plainMatch = plainRe.exec(markdown))) {
    addRef(plainMatch[1], Number(plainMatch[2]));
    if (plainMatch[3]) {
      addRef(plainMatch[1], Number(plainMatch[3]));
    }
  }

  return refs;
}

export function extractMutationTableTestNames(markdown: string): string[] {
  const mutationSection = extractSection(markdown, '### 変異');
  if (!mutationSection) return [];

  const names: string[] = [];
  const seen = new Set<string>();
  const addName = (candidate: string) => {
    const trimmed = candidate.trim();
    if (!trimmed || /^(?:なし|\(なし\)|（なし）|-|—)$/.test(trimmed)) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    names.push(trimmed);
  };

  for (const line of mutationSection.split('\n')) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    // コード列内のエスケープ済みパイプ `\|` で列分割しないようにする
    const cells = line.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, '|').trim());
    // | # | 変異 | 落ちたテスト名 | 落ちた件数 | 戻した後 |
    const testCell = cells[3] || '';
    if (!testCell) continue;

    const backtickMatches = [...testCell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    if (backtickMatches.length > 0) {
      for (const name of backtickMatches) addName(name);
    } else {
      for (const piece of testCell.split(/<br\s*\/?>/i)) {
        addName(piece);
      }
    }
  }
  return names;
}

export function parseImprovementReport(markdown: string): ParsedImprovementReport {
  const guideMatch = markdown.match(/^- 読んだガイドの版:\s*`?([0-9a-f]{7,40})`?/m);
  const commitMatch = markdown.match(/^- コミット:\s*`?([0-9a-f]{7,40})`?/m);

  const statBlock = extractLabeledCodeBlock(markdown, '変更ファイル:');
  const statLines = statBlock
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('|'));
  const statSummaryMatch = statBlock.match(/\d+\s+files?\s+changed[^\n]*/);

  const gateSection = extractSection(markdown, '### ゲート');
  const gateHeaderLine = markdown.match(/^### ゲート[^\n]*/m)?.[0] || '';
  const gateDirs = [...gateHeaderLine.matchAll(/(?:artifacts\/improvement\/)?(\d{8}-\d{4}-[A-Za-z0-9._-]+)/g)].map(
    (m) => `artifacts/improvement/${m[1].replace(/\/+$/, '')}`
  );
  const baselineGateDir = gateDirs.find((dir) => dir.includes('baseline'));
  const finalGateDir = [...gateDirs].reverse().find((dir) => dir.includes('final'));

  const tscBlock = extractLabeledCodeBlock(gateSection, 'npx tsc --noEmit:');
  const lintBlock = extractLabeledCodeBlock(gateSection, 'npm run lint:');
  const testBlock = extractLabeledCodeBlock(gateSection, 'npm test:');
  const buildBlock = extractLabeledCodeBlock(gateSection, 'npm run build:');
  const swfSection = extractSection(markdown, '### SW-F');

  return {
    guideVersion: guideMatch?.[1],
    commitHash: commitMatch?.[1],
    statLines,
    statSummary: statSummaryMatch?.[0]?.trim(),
    baselineGateDir,
    finalGateDir,
    tscExitCode: parseIntegerMatch(tscBlock, /^exit\s+(\d+)\s*$/m),
    lintHasEslintHeader: lintBlock.includes('> eslint src'),
    lintExitCode: parseIntegerMatch(lintBlock, /^exit\s+(\d+)\s*$/m),
    testSummary: parseTestSummaryText(testBlock),
    buildSummary: parseBuildSummaryText(buildBlock),
    swfFinal: parseSwfMetricsText(swfSection),
    mutationTestNames: extractMutationTableTestNames(markdown),
    fileLineRefs: extractFileLineReferences(markdown)
  };
}

export function verifyFileLineReferences(
  refs: readonly FileLineRef[],
  getFileLineCount: (relativePath: string) => number | null
): CheckItemResult {
  if (refs.length === 0) {
    return {
      id: 'file-line-refs',
      label: 'ファイルパス・行番号の実在',
      status: 'pass',
      detail: '参照 0 件',
      issues: []
    };
  }

  const issues: string[] = [];
  for (const ref of refs) {
    const lineCount = getFileLineCount(ref.file);
    if (lineCount === null) {
      issues.push(`ファイルが存在しません: ${ref.file}:${ref.line}`);
    } else if (ref.line > lineCount) {
      issues.push(`行番号が範囲外です: ${ref.file}:${ref.line}（全 ${lineCount} 行）`);
    }
  }

  return {
    id: 'file-line-refs',
    label: 'ファイルパス・行番号の実在',
    status: issues.length === 0 ? 'pass' : 'fail',
    detail: issues.length === 0
      ? `${refs.length} 件すべて実在・範囲内`
      : `${issues.length} / ${refs.length} 件に不整合`,
    issues
  };
}

export function collectDeclaredTestNames(sourceCode: string): Set<string> {
  const declared = new Set<string>();
  const pattern = /\b(?:test|it)\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sourceCode))) {
    const raw = match[2].replace(/\\(['"`\\])/g, '$1');
    declared.add(raw);
  }
  return declared;
}

function templateTestNameToRegex(templateName: string): RegExp | null {
  if (!templateName.includes('${')) return null;
  const parts = templateName.split(/\$\{[^}]+\}/g);
  if (parts.length <= 1) return null;
  const escaped = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${escaped.join('.+')}$`);
}

export function verifyMentionedTestNames(
  mentionedNames: readonly string[],
  declaredTestNames: ReadonlySet<string>
): CheckItemResult {
  if (mentionedNames.length === 0) {
    return {
      id: 'mutation-test-names',
      label: '変異表のテスト名実在',
      status: 'skip',
      detail: '変異表のテスト名記載なし',
      issues: []
    };
  }

  const templateRegexes: RegExp[] = [];
  for (const declared of declaredTestNames) {
    const regex = templateTestNameToRegex(declared);
    if (regex) templateRegexes.push(regex);
  }

  const issues: string[] = [];
  for (const name of mentionedNames) {
    const matched = declaredTestNames.has(name) || templateRegexes.some((regex) => regex.test(name));
    if (!matched) {
      issues.push(`宣言が見つからないテスト名: ${name}`);
    }
  }

  return {
    id: 'mutation-test-names',
    label: '変異表のテスト名実在',
    status: issues.length === 0 ? 'pass' : 'fail',
    detail: issues.length === 0
      ? `${mentionedNames.length} 件すべて実在`
      : `${issues.length} / ${mentionedNames.length} 件が未検出`,
    issues
  };
}

export interface SavedGateFiles {
  tscTxt?: string;
  lintTxt?: string;
  testTxt?: string;
  buildTxt?: string;
  swfTxt?: string;
}

export function verifyGateOutputs(
  report: ParsedImprovementReport,
  saved: SavedGateFiles
): CheckItemResult {
  const issues: string[] = [];
  let checked = 0;

  if (saved.tscTxt !== undefined) {
    checked++;
    const actualTscExit = parseIntegerMatch(saved.tscTxt, /^exit\s+(\d+)\s*$/m);
    if (report.tscExitCode !== actualTscExit) {
      issues.push(`tsc exit が不一致: 報告=${String(report.tscExitCode)} / 保存=${String(actualTscExit)}`);
    }
  }

  if (saved.lintTxt !== undefined) {
    checked++;
    const actualLintExit = parseIntegerMatch(saved.lintTxt, /^exit\s+(\d+)\s*$/m);
    if (report.lintExitCode !== actualLintExit) {
      issues.push(`lint exit が不一致: 報告=${String(report.lintExitCode)} / 保存=${String(actualLintExit)}`);
    }
    if (saved.lintTxt.includes('> eslint src') && !report.lintHasEslintHeader) {
      issues.push('lint 欄に保存出力の見出し `> eslint src` がありません');
    }
  }

  if (saved.testTxt !== undefined) {
    checked++;
    const actualTest = parseTestSummaryText(saved.testTxt);
    const fields: Array<[keyof ReportedTestSummary, string]> = [
      ['tests', 'tests'],
      ['suites', 'suites'],
      ['pass', 'pass'],
      ['fail', 'fail'],
      ['durationMs', 'duration_ms'],
      ['exitCode', 'test exit']
    ];
    for (const [key, label] of fields) {
      if (report.testSummary[key] !== actualTest[key]) {
        issues.push(
          `npm test の ${label} が不一致: 報告=${String(report.testSummary[key])} / 保存=${String(actualTest[key])}`
        );
      }
    }
  }

  if (saved.buildTxt !== undefined) {
    checked++;
    const actualBuild = parseBuildSummaryText(saved.buildTxt);
    if (report.buildSummary.staticPagesCompleted !== actualBuild.staticPagesCompleted
      || report.buildSummary.staticPagesTotal !== actualBuild.staticPagesTotal) {
      issues.push(
        `build ページ数が不一致: 報告=${String(report.buildSummary.staticPagesCompleted)}/${String(report.buildSummary.staticPagesTotal)} / 保存=${String(actualBuild.staticPagesCompleted)}/${String(actualBuild.staticPagesTotal)}`
      );
    }
    if (report.buildSummary.exitCode !== actualBuild.exitCode) {
      issues.push(`build exit が不一致: 報告=${String(report.buildSummary.exitCode)} / 保存=${String(actualBuild.exitCode)}`);
    }
  }

  if (saved.swfTxt !== undefined) {
    checked++;
    const actualSwf = parseSwfMetricsText(saved.swfTxt);
    const swfKeys: Array<[keyof ReportedSwfMetrics, string]> = [
      ['inlineStyle', 'inline-style'],
      ['processEnvFiles', 'process-env-files'],
      ['awaitLogAuditAction', 'await-logAuditAction'],
      ['typeofFunctionTests', 'typeof-function-tests'],
      ['tsIgnore', 'ts-ignore'],
      ['colonAny', 'colon-any'],
      ['asAny', 'as-any']
    ];
    for (const [key, label] of swfKeys) {
      if (report.swfFinal[key] !== undefined && report.swfFinal[key] !== actualSwf[key]) {
        issues.push(`SW-F ${label} が不一致: 報告=${String(report.swfFinal[key])} / 保存=${String(actualSwf[key])}`);
      }
    }
  }

  if (checked === 0) {
    return {
      id: 'gate-outputs',
      label: '保存済みゲート出力との照合',
      status: 'skip',
      detail: '保存済みゲートディレクトリ未指定または未検出',
      issues: []
    };
  }

  return {
    id: 'gate-outputs',
    label: '保存済みゲート出力との照合',
    status: issues.length === 0 ? 'pass' : 'fail',
    detail: issues.length === 0
      ? `${checked} ファイル（tsc/lint/test/build/swf）すべて一致`
      : `${issues.length} 件の数値・出力不一致`,
    issues
  };
}

function parseStatEntry(line: string): { pathSpec: string; delta: string } | null {
  const match = line.trim().match(/^(.+?)\s*\|\s*(\d+|Bin\b[^\n]*)/);
  if (!match) return null;
  return {
    pathSpec: match[1].trim(),
    delta: match[2].trim()
  };
}

export function verifyChangedFilesStat(
  reportedStatLines: readonly string[],
  reportedSummary: string | undefined,
  actualGitShowStat: string
): CheckItemResult {
  const actualLines = actualGitShowStat
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const actualEntries = actualLines
    .map(parseStatEntry)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const actualSummary = actualLines.find((line) => /\d+\s+files?\s+changed/.test(line));

  const issues: string[] = [];

  if (!reportedSummary) {
    issues.push('報告の「変更ファイル」欄に `N files changed...` の要約行がありません');
  } else if (actualSummary && reportedSummary !== actualSummary) {
    issues.push(`変更ファイル要約が不一致: 報告="${reportedSummary}" / 実測="${actualSummary}"`);
  }

  const reportedEntries = reportedStatLines
    .map(parseStatEntry)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (reportedEntries.length !== actualEntries.length) {
    issues.push(`変更ファイル行数が不一致: 報告=${reportedEntries.length} 行 / 実測=${actualEntries.length} 行`);
  } else {
    for (let i = 0; i < actualEntries.length; i++) {
      const rep = reportedEntries[i];
      const act = actualEntries[i];
      const pathMatches = rep.pathSpec.startsWith('...')
        ? act.pathSpec.endsWith(rep.pathSpec.slice(3))
        : rep.pathSpec === act.pathSpec;
      if (!pathMatches || rep.delta !== act.delta) {
        issues.push(
          `変更ファイル ${i + 1} 行目が不一致: 報告="${rep.pathSpec} | ${rep.delta}" / 実測="${act.pathSpec} | ${act.delta}"`
        );
      }
    }
  }

  return {
    id: 'git-show-stat',
    label: '変更ファイル（git show --stat 照合）',
    status: issues.length === 0 ? 'pass' : 'fail',
    detail: issues.length === 0
      ? `${actualEntries.length} ファイル・要約行が一致`
      : `${issues.length} 件の不整合`,
    issues
  };
}

function stripQuotedStringsAndComments(line: string): string {
  // 文字列リテラルの中身を空にして誤検出を防ぐ
  const withoutStrings = line.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
  const commentIndex = withoutStrings.indexOf('//');
  return commentIndex >= 0 ? withoutStrings.slice(0, commentIndex) : withoutStrings;
}

export function scanRefactorDiffForBehaviorChanges(
  commitSubject: string,
  unifiedDiff: string
): CheckItemResult & { findings: RefactorBehaviorFinding[] } {
  const isRefactor = /^refactor(?:\([^)]+\))?:/.test(commitSubject.trim());
  if (!isRefactor) {
    return {
      id: 'refactor-diff-guard',
      label: 'refactor コミットの挙動変更混入検査',
      status: 'skip',
      detail: 'refactor コミットではないため対象外',
      issues: [],
      findings: []
    };
  }

  const findings: RefactorBehaviorFinding[] = [];
  let currentFile = '';
  let currentNewLine = 0;

  for (const rawLine of unifiedDiff.split('\n')) {
    if (rawLine.startsWith('+++ b/')) {
      currentFile = rawLine.slice('+++ b/'.length).trim();
      continue;
    }
    const hunkMatch = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentNewLine = Number(hunkMatch[1]);
      continue;
    }
    if (rawLine.startsWith('---') || rawLine.startsWith('diff --git')) continue;
    if (rawLine.startsWith('-')) continue;
    if (!rawLine.startsWith('+')) {
      currentNewLine++;
      continue;
    }

    const lineNumber = currentNewLine;
    currentNewLine++;

    if (!currentFile || !/\.(?:tsx?)$/.test(currentFile) || /\.test\.tsx?$/.test(currentFile)) {
      continue;
    }

    const added = rawLine.slice(1);
    const trimmed = added.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      continue;
    }
    if (/^import\s+/.test(trimmed) || /^export\s+type\s+/.test(trimmed)) {
      continue;
    }

    const code = stripQuotedStringsAndComments(added);
    const checks: Array<{ kind: RefactorBehaviorFinding['kind']; pattern: RegExp }> = [
      { kind: 'nullish-coalescing', pattern: /\?\?/ },
      { kind: 'logical-or', pattern: /\|\|/ },
      { kind: 'optional-chaining', pattern: /\?\./ },
      { kind: 'type-assertion', pattern: /\bas\s+(?!const\b)[A-Za-z_][A-Za-z0-9_<>[\]]*/ },
      // 型注釈位置（: typeof / <typeof / ReturnType<typeof）を除いたランタイム typeof ガードを検出
      { kind: 'typeof-guard', pattern: /(?<![:<(,\s]\s*)\btypeof\b|\btypeof\s+[A-Za-z_$][A-Za-z0-9_$.]*\s*[!=]==?/ },
      // Mapped type ([K in ...])・for (... in ...) を除いたランタイム in 演算子を検出
      { kind: 'in-operator', pattern: /""\s+in\s+[A-Za-z_$]/ }
    ];

    for (const check of checks) {
      if (check.kind === 'typeof-guard') {
        // ランタイム比較（typeof x === / !==）または条件式内の typeof のみ検出
        if (!/\btypeof\s+[A-Za-z_$][A-Za-z0-9_$.]*\s*[!=]==?/.test(code)) continue;
      }
      if (check.pattern.test(code)) {
        findings.push({
          file: currentFile,
          line: lineNumber,
          kind: check.kind,
          excerpt: trimmed.slice(0, 90)
        });
      }
    }
  }

  const issues = findings.map(
    (f) => `${f.file}:${f.line} [${f.kind}] ${f.excerpt}`
  );

  return {
    id: 'refactor-diff-guard',
    label: 'refactor コミットの挙動変更混入検査',
    status: findings.length === 0 ? 'pass' : 'fail',
    detail: findings.length === 0
      ? '追加行に挙動変更演算子（?? / || / ?. / as / typeof / in）の混入なし'
      : `${findings.length} 件の要確認行を検出`,
    issues,
    findings
  };
}

export function formatVerificationReportTable(params: {
  reportPath: string;
  commitHash?: string;
  results: readonly CheckItemResult[];
}): string {
  const lines: string[] = [
    `# 改善報告 機械検証結果（P6-2）`,
    '',
    `- 対象報告: \`${params.reportPath}\``,
    `- 対象コミット: \`${params.commitHash || '未指定'}\``,
    '',
    '| 項目 | 判定 | 詳細 |',
    '|---|---|---|'
  ];

  for (const item of params.results) {
    const badge = item.status === 'pass' ? 'PASS' : item.status === 'fail' ? 'FAIL' : 'SKIP';
    lines.push(`| ${item.label} | ${badge} | ${item.detail} |`);
  }

  const failedItems = params.results.filter((item) => item.issues.length > 0);
  if (failedItems.length > 0) {
    lines.push('', '## 検出された不整合・要確認事項', '');
    for (const item of failedItems) {
      lines.push(`### ${item.label}`);
      for (const issue of item.issues) {
        lines.push(`- ${issue}`);
      }
    }
  }

  lines.push(
    '',
    '> 注意: 機械検証がすべて PASS でも、ガイド §11 の 5〜7（独自変異の注入・diff 精読・実画面確認）は省略しないでください。'
  );
  return lines.join('\n');
}
