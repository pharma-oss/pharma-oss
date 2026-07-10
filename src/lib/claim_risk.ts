import type { ClaimValidationIssue } from './claim_validation.ts';

export type ClaimRiskPriority = 'high' | 'medium';

export interface ClaimRiskSummaryInput {
  issues: ClaimValidationIssue[];
  totalPoints: number;
}

export interface ClaimRiskSummary {
  priority: ClaimRiskPriority;
  riskScore: number;
  actionLabel: string;
  topIssueTitles: string[];
}

const INSURANCE_ISSUE_CODES = new Set([
  'patient_missing',
  'insurance_missing',
  'insurance_provider_missing',
  'insurance_number_missing',
  'insurance_provider_format_invalid',
  'burden_ratio_invalid',
  'public_insurance_provider_missing',
  'public_insurance_provider_format_invalid',
  'public_insurance_recipient_missing',
  'public_insurance_recipient_format_invalid'
]);

const MASTER_ISSUE_CODES = new Set([
  'drug_price_missing',
  'drug_fee_result_missing',
  'yj_code_missing',
  'base_fee_result_missing',
  'base_fee_category_missing',
  'settings_missing',
  'pharmacy_code_missing'
]);

const DIAGNOSTIC_ISSUE_CODES = new Set([
  'diagnostic_preparation_enabled',
  'diagnostic_management_enabled',
  'diagnostic_drug_fee_only_required',
  'diagnostic_drug_fee_disabled'
]);

const PATIENT_SAFETY_CODES = new Set([
  'patient_allergy_match',
  'patient_side_effect_match'
]);

function countBySeverity(issues: ClaimValidationIssue[], severity: ClaimValidationIssue['severity']): number {
  let count = 0;
  for (let i = 0; i < issues.length; i++) {
    if (issues[i].severity === severity) count++;
  }
  return count;
}

function hasIssueCode(issues: ClaimValidationIssue[], codes: Set<string>): boolean {
  for (let i = 0; i < issues.length; i++) {
    if (codes.has(issues[i].code)) return true;
  }
  return false;
}

export function summarizeClaimIssueTitles(issues: ClaimValidationIssue[], limit = 3): string[] {
  const titles: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < issues.length && titles.length < limit; i++) {
    const title = issues[i].title.trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    titles.push(title);
  }
  return titles;
}

export function getClaimRiskActionLabel(issues: ClaimValidationIssue[], totalPoints: number): string {
  if (hasIssueCode(issues, PATIENT_SAFETY_CODES)) return '患者アラートを薬剤師確認';
  if (hasIssueCode(issues, INSURANCE_ISSUE_CODES)) return '保険・公費情報を確認';
  if (hasIssueCode(issues, DIAGNOSTIC_ISSUE_CODES)) return '検査薬の算定ON/OFFを確認';
  if (hasIssueCode(issues, MASTER_ISSUE_CODES)) return '施設設定・薬品マスタを確認';
  if (issues.some((issue) => issue.code === 'high_risk_tokkan_missing')) return '特薬管と指導記録を確認';
  if (totalPoints <= 0) return '点数計算と算定設定を確認';
  if (issues.some((issue) => issue.severity === 'error')) return '請求前チェックの要修正を解消';
  return '請求前チェックの確認事項を処理';
}

export function getClaimRiskPriority(issues: ClaimValidationIssue[], totalPoints: number): ClaimRiskPriority {
  return issues.some((issue) => issue.severity === 'error') ||
    totalPoints <= 0 ||
    hasIssueCode(issues, PATIENT_SAFETY_CODES)
    ? 'high'
    : 'medium';
}

export function buildClaimRiskSummary(input: ClaimRiskSummaryInput): ClaimRiskSummary | null {
  const { issues, totalPoints } = input;
  const visibleIssues = issues.filter((issue) => issue.severity === 'error' || issue.severity === 'warning');
  if (visibleIssues.length === 0) return null;

  const errorCount = countBySeverity(visibleIssues, 'error');
  const warningCount = countBySeverity(visibleIssues, 'warning');
  const safetyBoost = hasIssueCode(visibleIssues, PATIENT_SAFETY_CODES) ? 30 : 0;
  const zeroPointBoost = totalPoints <= 0 ? 30 : 0;
  const riskScore = (errorCount * 50) + (warningCount * 18) + safetyBoost + zeroPointBoost;

  return {
    priority: getClaimRiskPriority(visibleIssues, totalPoints),
    riskScore,
    actionLabel: getClaimRiskActionLabel(visibleIssues, totalPoints),
    topIssueTitles: summarizeClaimIssueTitles(visibleIssues)
  };
}
