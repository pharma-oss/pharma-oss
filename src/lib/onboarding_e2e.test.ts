import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import type { AuditLog } from '../db/types.ts';
import {
  ONBOARDING_E2E_SCENARIOS,
  buildOnboardingE2EReport
} from './onboarding_e2e.ts';

const dashboardSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const printSource = readFileSync(new URL('../app/print/[visitId]/page.tsx', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../app/settings/page.tsx', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const onboardingE2EScript = readFileSync(new URL('../../scripts/runOnboardingE2E.mjs', import.meta.url), 'utf8');
const onboardingSources = [dashboardSource, printSource, settingsSource].join('\n');

function auditLog(actionType: AuditLog['actionType']): AuditLog {
  return {
    logId: `log_${actionType}`,
    timestamp: '2026-06-18T01:00:00.000Z',
    userId: 'admin',
    userName: '管理者',
    userRole: 'admin',
    actionType,
    details: `${actionType} test`
  };
}

test('ONBOARDING_E2E_SCENARIOS defines stable selectors for claim and print rehearsal', () => {
  const claimScenario = ONBOARDING_E2E_SCENARIOS.find((scenario) => scenario.id === 'claim_uke_export');
  const printScenario = ONBOARDING_E2E_SCENARIOS.find((scenario) => scenario.id === 'print_documents');

  assert.ok(claimScenario);
  assert.ok(printScenario);
  assert.deepStrictEqual(claimScenario.expectedAuditActions, ['claim_lifecycle', 'uke_export']);
  assert.deepStrictEqual(printScenario.expectedAuditActions, ['print']);
  assert.ok(claimScenario.stableSelectors.includes('[data-testid="print-uke-export-button"]'));
  assert.ok(printScenario.stableSelectors.includes('[data-testid="print-execute-button"]'));
});

test('ONBOARDING_E2E_SCENARIOS selectors exist in application source', () => {
  for (const scenario of ONBOARDING_E2E_SCENARIOS) {
    for (const selector of scenario.stableSelectors) {
      const testId = selector.match(/\[data-testid="([^"]+)"\]/)?.[1];
      assert.ok(testId, `selector must be a data-testid selector: ${selector}`);
      assert.ok(onboardingSources.includes(`data-testid="${testId}"`), `${scenario.id} selector ${selector} is missing from source`);
    }
  }
});

test('onboarding browser E2E runner is exposed as a package script', () => {
  assert.strictEqual(packageJson.scripts['test:e2e:onboarding'], 'node scripts/runOnboardingE2E.mjs');
  assert.match(onboardingE2EScript, /puppeteer\.launch/);
  assert.match(onboardingE2EScript, /YAKUREKI_E2E_BASE_URL/);
  assert.match(onboardingE2EScript, /YAKUREKI_E2E_VISIT_ID/);
  assert.match(onboardingE2EScript, /YAKUREKI_E2E_AUTO_SEED/);
  assert.match(onboardingE2EScript, /YAKUREKI_E2E_ARTIFACT_DIR/);
  assert.match(onboardingE2EScript, /__yakurekiSeedOnboardingE2E/);
  assert.match(onboardingE2EScript, /failure\.png/);
  assert.match(onboardingE2EScript, /browser-logs\.json/);
  assert.match(onboardingE2EScript, /initial-setup-panel/);
  assert.match(onboardingE2EScript, /monthly-claim-workbench/);
  assert.match(onboardingE2EScript, /print-uke-export-button/);
  assert.match(onboardingE2EScript, /print-execute-button/);
});

test('buildOnboardingE2EReport marks scenarios complete from audit evidence', () => {
  const report = buildOnboardingE2EReport([
    auditLog('claim_lifecycle'),
    auditLog('uke_export'),
    auditLog('print')
  ]);

  assert.strictEqual(report.status, 'complete');
  assert.strictEqual(report.statusLabel, '導入E2E完了');
  assert.strictEqual(report.completedCount, report.scenarioCount);
  assert.ok(report.scenarios.every((scenario) => scenario.missingEvidence.length === 0));
});

test('buildOnboardingE2EReport lists missing audit evidence', () => {
  const report = buildOnboardingE2EReport([auditLog('claim_lifecycle')]);
  const claimScenario = report.scenarios.find((scenario) => scenario.id === 'claim_uke_export');
  const printScenario = report.scenarios.find((scenario) => scenario.id === 'print_documents');

  assert.strictEqual(report.status, 'attention');
  assert.strictEqual(claimScenario?.status, 'attention');
  assert.deepStrictEqual(claimScenario?.missingEvidence, ['uke_export の監査ログを記録する']);
  assert.deepStrictEqual(printScenario?.missingEvidence, ['print の監査ログを記録する']);
});
