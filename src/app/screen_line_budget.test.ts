import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * 分割した主要画面ファイルが再び肥大化するのを防ぐための行数予算（P7）。
 * 機能追加等で上限を超える場合は、同じ変更内でヘルパーやコンポーネントの分割を行うこと。
 */
const SCREEN_LINE_BUDGETS: ReadonlyArray<{ relativePath: string; maxLines: number }> = [
  { relativePath: 'src/app/ocr/page.tsx', maxLines: 2194 },
  { relativePath: 'src/app/emr/page.tsx', maxLines: 2576 },
  { relativePath: 'src/app/print/[visitId]/page.tsx', maxLines: 2434 }
];

function countLines(filePath: string): number {
  const content = readFileSync(filePath, 'utf8');
  return content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
}

describe('Screen file line budget (P7)', () => {
  for (const { relativePath, maxLines } of SCREEN_LINE_BUDGETS) {
    test(`${relativePath} stays within ${maxLines} lines`, () => {
      const fullPath = path.resolve(process.cwd(), relativePath);
      const actualLines = countLines(fullPath);
      assert.ok(
        actualLines <= maxLines,
        `${relativePath} has ${actualLines} lines, exceeding budget of ${maxLines}. Extract helpers or components before adding more code.`
      );
    });
  }
});
