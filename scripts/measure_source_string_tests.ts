import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function findTestFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...findTestFiles(fullPath));
    } else if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

const testFiles = findTestFiles('/Users/takeaki/pharma-oss/src');

interface TestStat {
  file: string;
  relPath: string;
  hasReadFileSync: boolean;
  matchAssertCount: number;
  totalAssertCount: number;
  testCount: number;
}

const stats: TestStat[] = [];

for (const file of testFiles) {
  const content = readFileSync(file, 'utf8');
  const relPath = path.relative('/Users/takeaki/pharma-oss', file);
  const hasReadFileSync = content.includes('readFileSync');

  // match assert count (assert.match, assert.doesNotMatch, section, indexOf on source)
  const matchAssertMatches = content.match(/assert\.(match|doesNotMatch|ok\([^)]*index|ok\([^)]*includes|ok\([^)]*indexOf)/g) || [];
  const allAssertMatches = content.match(/assert\.[a-zA-Z0-9_]+/g) || [];
  const testMatches = content.match(/test\(/g) || [];

  if (hasReadFileSync || matchAssertMatches.length > 0) {
    stats.push({
      file,
      relPath,
      hasReadFileSync,
      matchAssertCount: matchAssertMatches.length,
      totalAssertCount: allAssertMatches.length,
      testCount: testMatches.length
    });
  }
}

stats.sort((a, b) => b.matchAssertCount - a.matchAssertCount);

console.log('| ファイル | readFileSync | match/文字列 assert | 全 assert | テスト数 |');
console.log('| :--- | :---: | :---: | :---: | :---: |');
let sumMatch = 0;
let sumTotal = 0;
for (const s of stats) {
  sumMatch += s.matchAssertCount;
  sumTotal += s.totalAssertCount;
  console.log(`| \`${s.relPath}\` | ${s.hasReadFileSync ? 'Yes' : 'No'} | **${s.matchAssertCount}** | ${s.totalAssertCount} | ${s.testCount} |`);
}
console.log(`| **合計** | - | **${sumMatch}** | **${sumTotal}** | - |`);
