#!/usr/bin/env node
// Gemini 改善報告（§10 形式）の機械検証 CLI（提案書 P6-2 / ガイド §11）。
//
// 使い方:
//   node scripts/verify_gemini_report.mjs <報告.md> [コミットハッシュ]
//
// 終了コード:
//   0: 機械検証の失敗 0 件
//   1: 1 件以上の不整合・要確認事項を検出
//   2: 引数不足やファイル不在などの実行エラー

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  collectDeclaredTestNames,
  formatVerificationReportTable,
  parseImprovementReport,
  scanRefactorDiffForBehaviorChanges,
  verifyChangedFilesStat,
  verifyFileLineReferences,
  verifyGateOutputs,
  verifyMentionedTestNames
} from '../src/lib/improvement_report_verifier.ts';

function walkTestFiles(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTestFiles(fullPath, result);
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      result.push(fullPath);
    }
  }
  return result;
}

function readOptionalFile(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : undefined;
}

function runGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

export function runReportVerification({ reportPath, commitOverride, cwd = process.cwd() }) {
  const resolvedReport = path.resolve(cwd, reportPath);
  if (!fs.existsSync(resolvedReport)) {
    throw new Error(`報告ファイルが見つかりません: ${reportPath}`);
  }

  const markdown = fs.readFileSync(resolvedReport, 'utf8');
  const parsed = parseImprovementReport(markdown);
  const commitHash = commitOverride || parsed.commitHash;

  const lineCountCache = new Map();
  const getFileLineCount = (relativePath) => {
    if (lineCountCache.has(relativePath)) return lineCountCache.get(relativePath);
    const fullPath = path.resolve(cwd, relativePath);
    if (!fs.existsSync(fullPath)) {
      lineCountCache.set(relativePath, null);
      return null;
    }
    const count = fs.readFileSync(fullPath, 'utf8').split('\n').length;
    lineCountCache.set(relativePath, count);
    return count;
  };

  const declaredTests = new Set();
  for (const testFile of walkTestFiles(path.resolve(cwd, 'src'))) {
    const content = fs.readFileSync(testFile, 'utf8');
    for (const name of collectDeclaredTestNames(content)) {
      declaredTests.add(name);
    }
  }

  const results = [];
  results.push(verifyFileLineReferences(parsed.fileLineRefs, getFileLineCount));
  results.push(verifyMentionedTestNames(parsed.mutationTestNames, declaredTests));

  if (parsed.finalGateDir) {
    const gateDirPath = path.resolve(cwd, parsed.finalGateDir);
    results.push(verifyGateOutputs(parsed, {
      tscTxt: readOptionalFile(path.join(gateDirPath, 'tsc.txt')),
      lintTxt: readOptionalFile(path.join(gateDirPath, 'lint.txt')),
      testTxt: readOptionalFile(path.join(gateDirPath, 'test.txt')),
      buildTxt: readOptionalFile(path.join(gateDirPath, 'build.txt')),
      swfTxt: readOptionalFile(path.join(gateDirPath, 'swf.txt'))
    }));
  } else {
    results.push(verifyGateOutputs(parsed, {}));
  }

  if (commitHash) {
    const statOutput = runGit(['show', '--stat=200', '--format=', commitHash], cwd);
    results.push(verifyChangedFilesStat(parsed.statLines, parsed.statSummary, statOutput));

    const subject = runGit(['show', '-s', '--format=%s', commitHash], cwd).trim();
    const diffOutput = runGit(['show', '--unified=0', '--format=', commitHash], cwd);
    results.push(scanRefactorDiffForBehaviorChanges(subject, diffOutput));
  } else {
    results.push({
      id: 'git-show-stat',
      label: '変更ファイル（git show --stat 照合）',
      status: 'skip',
      detail: 'コミットハッシュ未指定',
      issues: []
    });
    results.push({
      id: 'refactor-diff-guard',
      label: 'refactor コミットの挙動変更混入検査',
      status: 'skip',
      detail: 'コミットハッシュ未指定',
      issues: []
    });
  }

  const hasFailures = results.some((item) => item.status === 'fail');
  const table = formatVerificationReportTable({
    reportPath,
    commitHash,
    results
  });
  return { hasFailures, results, table };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , reportPath, commitOverride] = process.argv;
  if (!reportPath) {
    console.error('usage: node scripts/verify_gemini_report.mjs <report.md> [commit-hash]');
    process.exit(2);
  }
  try {
    const { hasFailures, table } = runReportVerification({ reportPath, commitOverride });
    console.log(table);
    process.exit(hasFailures ? 1 : 0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}
