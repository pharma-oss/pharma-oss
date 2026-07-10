import type { AuditLog } from '../db/types.ts';

export type OnboardingE2EScenarioId = 'claim_uke_export' | 'print_documents';
export type OnboardingE2EScenarioStatus = 'complete' | 'attention';

export interface OnboardingE2EScenarioDefinition {
  id: OnboardingE2EScenarioId;
  title: string;
  goal: string;
  routePattern: string;
  stableSelectors: string[];
  expectedAuditActions: AuditLog['actionType'][];
}

export interface OnboardingE2EScenarioResult extends OnboardingE2EScenarioDefinition {
  status: OnboardingE2EScenarioStatus;
  statusLabel: string;
  evidence: string;
  missingEvidence: string[];
}

export interface OnboardingE2EReport {
  status: OnboardingE2EScenarioStatus;
  statusLabel: string;
  completedCount: number;
  scenarioCount: number;
  scenarios: OnboardingE2EScenarioResult[];
}

export const ONBOARDING_E2E_SCENARIOS: OnboardingE2EScenarioDefinition[] = [
  {
    id: 'claim_uke_export',
    title: '導入時請求テスト',
    goal: 'テスト受付を請求確認画面へ送り、UKE出力と請求ロックの監査ログを残す（チュートリアルのデモ患者はUKE出力不可のため、導入確認用テストデータを使う）',
    routePattern: '/ -> /print/[visitId]',
    stableSelectors: [
      '[data-testid="claim-risk-queue"]',
      '[data-testid="claim-risk-open-print"]',
      '[data-testid="monthly-claim-workbench"]',
      '[data-testid="print-page"]',
      '[data-testid="pharmacist-check-panel"]',
      '[data-testid="claim-check-panel"]',
      '[data-testid="claim-lifecycle-panel"]',
      '[data-testid="print-uke-export-button"]'
    ],
    expectedAuditActions: ['claim_lifecycle', 'uke_export']
  },
  {
    id: 'print_documents',
    title: '導入時帳票印刷テスト',
    goal: 'テスト受付の調剤録、明細、薬袋、ラベルのプレビューを開き、印刷実行ログを残す',
    routePattern: '/print/[visitId]',
    stableSelectors: [
      '[data-testid="print-page"]',
      '[data-testid="print-execute-button"]',
      '[data-testid="dispensing-record-doc"]',
      '[data-testid="receipt-statement-doc"]'
    ],
    expectedAuditActions: ['print']
  }
];

function statusLabel(status: OnboardingE2EScenarioStatus): string {
  return status === 'complete' ? 'E2E証跡あり' : 'E2E未実施';
}

function hasAuditAction(auditLogs: AuditLog[], actionType: AuditLog['actionType']): boolean {
  return auditLogs.some((log) => log.actionType === actionType);
}

export function buildOnboardingE2EReport(auditLogs: AuditLog[]): OnboardingE2EReport {
  const scenarios = ONBOARDING_E2E_SCENARIOS.map((scenario): OnboardingE2EScenarioResult => {
    const missingAuditActions = scenario.expectedAuditActions.filter((actionType) => !hasAuditAction(auditLogs, actionType));
    const status: OnboardingE2EScenarioStatus = missingAuditActions.length === 0 ? 'complete' : 'attention';
    return {
      ...scenario,
      status,
      statusLabel: statusLabel(status),
      evidence: missingAuditActions.length === 0
        ? `${scenario.expectedAuditActions.join(' / ')} の監査ログあり`
        : `${missingAuditActions.join(' / ')} の監査ログなし`,
      missingEvidence: missingAuditActions.map((actionType) => `${actionType} の監査ログを記録する`)
    };
  });
  const completedCount = scenarios.filter((scenario) => scenario.status === 'complete').length;
  const status: OnboardingE2EScenarioStatus = completedCount === scenarios.length ? 'complete' : 'attention';

  return {
    status,
    statusLabel: status === 'complete' ? '導入E2E完了' : '導入E2E要確認',
    completedCount,
    scenarioCount: scenarios.length,
    scenarios
  };
}
