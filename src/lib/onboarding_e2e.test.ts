import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AuditLog } from '../db/types';
import {
  ONBOARDING_E2E_SCENARIOS,
  buildOnboardingE2EReport
} from './onboarding_e2e';
import packageJson from '../../package.json' with { type: 'json' };

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

describe('Onboarding E2E scenario definitions and report contracts', () => {
  it('ONBOARDING_E2E_SCENARIOS defines stable selectors for claim and print rehearsal', () => {
    const claimScenario = ONBOARDING_E2E_SCENARIOS.find((scenario) => scenario.id === 'claim_uke_export');
    const printScenario = ONBOARDING_E2E_SCENARIOS.find((scenario) => scenario.id === 'print_documents');

    assert.ok(claimScenario);
    assert.ok(printScenario);
    assert.deepEqual(claimScenario.expectedAuditActions, ['claim_lifecycle', 'uke_export']);
    assert.deepEqual(printScenario.expectedAuditActions, ['print']);
    assert.ok(claimScenario.stableSelectors.includes('[data-testid="print-uke-export-button"]'));
    assert.ok(printScenario.stableSelectors.includes('[data-testid="print-execute-button"]'));
  });

  it('all onboarding scenarios define non-empty valid testid selectors and titles', () => {
    for (const scenario of ONBOARDING_E2E_SCENARIOS) {
      assert.ok(scenario.id.length > 0);
      assert.ok(scenario.title.length > 0);
      assert.ok(scenario.stableSelectors.length > 0);
      for (const selector of scenario.stableSelectors) {
        assert.match(selector, /^\[data-testid="[a-zA-Z0-9_-]+"\]$/);
      }
    }
  });

  it('onboarding browser E2E runner is exposed as a package script', () => {
    assert.equal(packageJson.scripts['test:e2e:onboarding'], 'node scripts/runOnboardingE2E.mjs');
  });

  it('buildOnboardingE2EReport marks scenarios complete from audit evidence', () => {
    const report = buildOnboardingE2EReport([
      auditLog('claim_lifecycle'),
      auditLog('uke_export'),
      auditLog('print')
    ]);

    assert.equal(report.status, 'complete');
    assert.equal(report.statusLabel, '導入E2E完了');
    assert.equal(report.completedCount, report.scenarioCount);
    assert.ok(report.scenarios.every((scenario) => scenario.missingEvidence.length === 0));
  });

  it('buildOnboardingE2EReport lists missing audit evidence', () => {
    const report = buildOnboardingE2EReport([auditLog('claim_lifecycle')]);
    const claimScenario = report.scenarios.find((scenario) => scenario.id === 'claim_uke_export');
    const printScenario = report.scenarios.find((scenario) => scenario.id === 'print_documents');

    assert.equal(report.status, 'attention');
    assert.equal(claimScenario?.status, 'attention');
    assert.deepEqual(claimScenario?.missingEvidence, ['uke_export の監査ログを記録する']);
    assert.deepEqual(printScenario?.missingEvidence, ['print の監査ログを記録する']);
  });
});
