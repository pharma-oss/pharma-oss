import { test } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workflow = readFileSync(new URL('../../.github/workflows/onboarding-e2e.yml', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
// 社内向けロードマップは公開リポジトリに含まれない(docs/internal/ はgit管理外)。
// 存在する環境(私有リポジトリ)でだけロードマップ側の整合を検査する。
const roadmapPath = fileURLToPath(new URL('../../docs/internal/industry_no1_roadmap.md', import.meta.url));
const roadmap = existsSync(roadmapPath) ? readFileSync(roadmapPath, 'utf8') : null;
const officialAudit = readFileSync(new URL('./official_audit.ts', import.meta.url), 'utf8');

test('onboarding E2E GitHub Actions workflow runs the full quality gate', () => {
  assert.match(workflow, /name: Onboarding E2E/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /node-version: '22'/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npx tsc --noEmit/);
  assert.match(workflow, /npx tsx --test \$\(find src -name "\*\.test\.ts"\)/);
  assert.match(workflow, /npm run build/);
});

test('onboarding E2E workflow seeds browser data and preserves failure artifacts', () => {
  assert.match(workflow, /npm run dev > dev_server\.log 2>&1 &/);
  assert.match(workflow, /YAKUREKI_E2E_AUTO_SEED: '1'/);
  assert.match(workflow, /YAKUREKI_E2E_BASE_URL: http:\/\/127\.0\.0\.1:3000/);
  assert.match(workflow, /npm run test:e2e:onboarding/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /artifacts\/onboarding-e2e/);
  assert.match(workflow, /dev_server\.log/);
});

test('return correction browser E2E is exposed to CI', () => {
  assert.strictEqual(packageJson.scripts['test:e2e:return-correction'], 'node scripts/runReturnCorrectionE2E.mjs');
  assert.match(workflow, /npm run test:e2e:return-correction/);
  assert.match(workflow, /artifacts\/return-correction-e2e/);
});

test('print layout screenshot regression is exposed to CI', () => {
  assert.strictEqual(packageJson.scripts['test:e2e:print-layout'], 'node scripts/runPrintLayoutRegression.mjs');
  assert.match(workflow, /Run print layout screenshot regression/);
  assert.match(workflow, /npm run test:e2e:print-layout/);
  assert.match(workflow, /artifacts\/print-layout-regression/);
});

test('roadmap and official audit no longer leave onboarding E2E CI as open work', () => {
  if (roadmap !== null) {
    assert.match(roadmap, /導入時E2EのCI常設があり/);
    assert.doesNotMatch(roadmap, /7\. 導入時E2EのCI常設/);
  }
  assert.match(officialAudit, /導入時E2EのCI常設/);
  assert.doesNotMatch(officialAudit, /remainingWork:[\s\S]*ブラウザE2EのCI常設/);
});
