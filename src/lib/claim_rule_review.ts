import type { CalculationResultItem } from './calculator.ts';
import type { ClaimValidationIssue, ClaimValidationSeverity } from './claim_validation.ts';
import type { FacilitySettings } from '@/db/types';
import { escapeCSVField } from './receipt/uke_generator.ts';

export type ClaimOfficialRuleCategory = 'prohibited' | 'monthly_count' | 'within_month';
export type ClaimOfficialRuleSourceKind = 'notification' | 'qa' | 'return_case';
export type ClaimOfficialRuleStatus = 'pass' | 'attention';

export interface ClaimOfficialRuleCase {
  /** Patient-free identifier used in exports, such as a random review case ID. */
  caseId: string;
  /** Internal key used only to group claims for the same patient. Never exported. */
  patientKey: string;
  serviceDate: string;
  baseFeeCategory?: FacilitySettings['baseFeeCategory'];
  calculatedFees: CalculationResultItem[];
  validationIssues?: ClaimValidationIssue[];
}

export interface BuildClaimOfficialRuleReviewInput {
  currentCase: ClaimOfficialRuleCase;
  monthCases?: ClaimOfficialRuleCase[];
}

export interface ClaimOfficialRuleReviewItem {
  ruleId:
    | 'diagnostic_drug_fee_only'
    | 'medical_dx_special_b_prohibited'
    | 'medical_dx_monthly_once'
    | 'insurance_effective_period';
  category: ClaimOfficialRuleCategory;
  categoryLabel: string;
  sourceKinds: ClaimOfficialRuleSourceKind[];
  sourceKindLabels: string[];
  title: string;
  plainExplanation: string;
  returnRisk: string;
  actionLabel: string;
  status: ClaimOfficialRuleStatus;
  statusLabel: string;
  severity: ClaimValidationSeverity;
  caseId: string;
  serviceMonth: string;
  relatedIssueCodes: string[];
  observedCount?: number;
  allowedCount?: number;
}

export interface ClaimOfficialRuleReviewReport {
  generatedAt: string;
  source: {
    label: string;
    url: string;
  };
  caseId: string;
  serviceMonth: string;
  ok: boolean;
  statusLabel: string;
  ruleCount: number;
  attentionCount: number;
  errorCount: number;
  warningCount: number;
  items: ClaimOfficialRuleReviewItem[];
}

export interface ClaimOfficialRuleBatchReviewReport {
  generatedAt: string;
  source: ClaimOfficialRuleReviewReport['source'];
  ok: boolean;
  statusLabel: string;
  caseCount: number;
  ruleCount: number;
  attentionCount: number;
  errorCount: number;
  warningCount: number;
  reports: ClaimOfficialRuleReviewReport[];
  items: ClaimOfficialRuleReviewItem[];
}

export const CLAIM_OFFICIAL_RULE_SOURCE = {
  label: '厚生労働省 令和8年度診療報酬改定（告示・通知・疑義解釈）',
  url: 'https://www.mhlw.go.jp/stf/newpage_67942.html'
} as const;

const MEDICAL_DX_ADDITION_NAME = '電子的調剤情報連携体制整備加算';
const DIAGNOSTIC_ISSUE_CODES = new Set([
  'diagnostic_drug_fee_disabled',
  'diagnostic_preparation_enabled',
  'diagnostic_management_enabled',
  'diagnostic_drug_fee_only_required'
]);
const EFFECTIVE_PERIOD_ISSUE_CODES = new Set([
  'insurance_valid_from_future',
  'insurance_expired',
  'public_insurance_start_future',
  'public_insurance_expired'
]);
const SEVERITY_ORDER: Record<ClaimValidationSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2
};
const SOURCE_KIND_LABELS: Record<ClaimOfficialRuleSourceKind, string> = {
  notification: '告示・通知',
  qa: '疑義解釈',
  return_case: '返戻事例'
};
const DIAGNOSTIC_SOURCE_KINDS: ClaimOfficialRuleSourceKind[] = ['qa', 'return_case'];

function serviceMonth(serviceDate: string): string {
  const matched = /^(\d{4})-(\d{2})-\d{2}/.exec(serviceDate.trim());
  return matched ? `${matched[1]}-${matched[2]}` : '未判定';
}

function uniqueIssueCodes(issues: ClaimValidationIssue[]): string[] {
  return [...new Set(issues.map((issue) => issue.code))].sort();
}

function highestSeverity(issues: ClaimValidationIssue[]): ClaimValidationSeverity {
  return issues.reduce<ClaimValidationSeverity>(
    (highest, issue) => SEVERITY_ORDER[issue.severity] > SEVERITY_ORDER[highest] ? issue.severity : highest,
    'info'
  );
}

function hasPositiveFee(claim: ClaimOfficialRuleCase, feeName: string): boolean {
  return claim.calculatedFees.some((fee) => fee.name === feeName && fee.points > 0);
}

function countMonthlyMedicalDxClaims(
  currentCase: ClaimOfficialRuleCase,
  monthCases: ClaimOfficialRuleCase[]
): number {
  const uniqueCases = new Map(monthCases.map((claim) => [claim.caseId, claim]));
  uniqueCases.set(currentCase.caseId, currentCase);
  const currentMonth = serviceMonth(currentCase.serviceDate);

  return [...uniqueCases.values()].filter((claim) =>
    claim.patientKey === currentCase.patientKey
    && serviceMonth(claim.serviceDate) === currentMonth
    && hasPositiveFee(claim, MEDICAL_DX_ADDITION_NAME)
  ).length;
}

function makeStatus(attention: boolean): Pick<ClaimOfficialRuleReviewItem, 'status' | 'statusLabel'> {
  return attention
    ? { status: 'attention', statusLabel: '要確認' }
    : { status: 'pass', statusLabel: 'OK' };
}

export function buildClaimOfficialRuleReview(
  input: BuildClaimOfficialRuleReviewInput,
  now = new Date()
): ClaimOfficialRuleReviewReport {
  const { currentCase, monthCases = [] } = input;
  const issues = currentCase.validationIssues ?? [];
  const month = serviceMonth(currentCase.serviceDate);
  const diagnosticIssues = issues.filter((issue) => DIAGNOSTIC_ISSUE_CODES.has(issue.code));
  const effectivePeriodIssues = issues.filter((issue) => EFFECTIVE_PERIOD_ISSUE_CODES.has(issue.code));
  const medicalDxInCurrentCase = hasPositiveFee(currentCase, MEDICAL_DX_ADDITION_NAME);
  const medicalDxSpecialBProhibited = currentCase.baseFeeCategory === 'special_b' && medicalDxInCurrentCase;
  const medicalDxClaimCount = countMonthlyMedicalDxClaims(currentCase, monthCases);
  const medicalDxOverLimit = medicalDxClaimCount > 1;

  const items: ClaimOfficialRuleReviewItem[] = [
    {
      ruleId: 'diagnostic_drug_fee_only',
      category: 'prohibited',
      categoryLabel: '算定しない項目',
      sourceKinds: DIAGNOSTIC_SOURCE_KINDS,
      sourceKindLabels: DIAGNOSTIC_SOURCE_KINDS.map((kind) => SOURCE_KIND_LABELS[kind]),
      title: '検査薬は薬剤料だけにする',
      plainExplanation: '検査薬だけを渡す処方では、薬剤調製料や薬学管理料を付けない設定になっているか確認します。',
      returnRisk: '薬剤料以外を付けたまま請求すると、算定対象外として返戻や査定になる可能性があります。',
      actionLabel: diagnosticIssues.length > 0 ? '検査薬の算定ON/OFFを直す' : '対応不要',
      ...makeStatus(diagnosticIssues.length > 0),
      severity: highestSeverity(diagnosticIssues),
      caseId: currentCase.caseId,
      serviceMonth: month,
      relatedIssueCodes: uniqueIssueCodes(diagnosticIssues)
    },
    {
      ruleId: 'medical_dx_special_b_prohibited',
      category: 'prohibited',
      categoryLabel: '算定しない項目',
      sourceKinds: ['notification'],
      sourceKindLabels: [SOURCE_KIND_LABELS.notification],
      title: '特別調剤基本料Bでは電子的調剤情報連携体制整備加算を付けない',
      plainExplanation: '薬局の基本料区分が特別調剤基本料Bの場合、この加算が請求に混ざっていないか確認します。',
      returnRisk: '対象外の基本料区分で加算を付けると、算定対象外として返戻や査定になる可能性があります。',
      actionLabel: medicalDxSpecialBProhibited ? '特別調剤基本料Bの加算を外す' : '対応不要',
      ...makeStatus(medicalDxSpecialBProhibited),
      severity: medicalDxSpecialBProhibited ? 'error' : 'info',
      caseId: currentCase.caseId,
      serviceMonth: month,
      relatedIssueCodes: medicalDxSpecialBProhibited ? ['medical_dx_special_b_prohibited'] : []
    },
    {
      ruleId: 'medical_dx_monthly_once',
      category: 'monthly_count',
      categoryLabel: '同じ月の回数',
      sourceKinds: ['notification'],
      sourceKindLabels: [SOURCE_KIND_LABELS.notification],
      title: '電子的調剤情報連携体制整備加算は同じ患者で月1回まで',
      plainExplanation: '同じ患者の同じ月の請求をまとめ、加算が2回以上付いていないか確認します。',
      returnRisk: '同じ月に2回以上請求すると、重複算定として返戻や査定になる可能性があります。',
      actionLabel: medicalDxOverLimit ? '同月の重複算定を外す' : '対応不要',
      ...makeStatus(medicalDxOverLimit),
      severity: medicalDxOverLimit ? 'error' : 'info',
      caseId: currentCase.caseId,
      serviceMonth: month,
      relatedIssueCodes: medicalDxOverLimit ? ['medical_dx_monthly_limit_exceeded'] : [],
      observedCount: medicalDxClaimCount,
      allowedCount: 1
    },
    {
      ruleId: 'insurance_effective_period',
      category: 'within_month',
      categoryLabel: '調剤日の有効期間',
      sourceKinds: ['return_case'],
      sourceKindLabels: [SOURCE_KIND_LABELS.return_case],
      title: '調剤日が保険・公費の有効期間内か確認する',
      plainExplanation: '調剤日が、保険資格や公費の開始日から終了日までの範囲に入っているか確認します。',
      returnRisk: '有効期間の外で請求すると、資格不一致として受付エラーや返戻になる可能性があります。',
      actionLabel: effectivePeriodIssues.length > 0 ? '保険・公費の有効期間を直す' : '対応不要',
      ...makeStatus(effectivePeriodIssues.length > 0),
      severity: highestSeverity(effectivePeriodIssues),
      caseId: currentCase.caseId,
      serviceMonth: month,
      relatedIssueCodes: uniqueIssueCodes(effectivePeriodIssues)
    }
  ];

  const attentionItems = items.filter((item) => item.status === 'attention');
  const errorCount = attentionItems.filter((item) => item.severity === 'error').length;
  const warningCount = attentionItems.filter((item) => item.severity === 'warning').length;
  const ok = attentionItems.length === 0;

  return {
    generatedAt: now.toISOString(),
    source: CLAIM_OFFICIAL_RULE_SOURCE,
    caseId: currentCase.caseId,
    serviceMonth: month,
    ok,
    statusLabel: ok ? '算定ルール確認OK' : '算定ルール要確認',
    ruleCount: items.length,
    attentionCount: attentionItems.length,
    errorCount,
    warningCount,
    items
  };
}

export function buildClaimOfficialRuleBatchReview(
  cases: ClaimOfficialRuleCase[],
  now = new Date()
): ClaimOfficialRuleBatchReviewReport {
  const reports = cases.map((currentCase) => buildClaimOfficialRuleReview({
    currentCase,
    monthCases: cases
  }, now));
  const items = reports.flatMap((report) => report.items);
  const attentionItems = items.filter((item) => item.status === 'attention');
  const errorCount = attentionItems.filter((item) => item.severity === 'error').length;
  const warningCount = attentionItems.filter((item) => item.severity === 'warning').length;
  const ok = attentionItems.length === 0;

  return {
    generatedAt: now.toISOString(),
    source: CLAIM_OFFICIAL_RULE_SOURCE,
    ok,
    statusLabel: ok ? '算定ルール確認OK' : '算定ルール要確認',
    caseCount: reports.length,
    ruleCount: items.length,
    attentionCount: attentionItems.length,
    errorCount,
    warningCount,
    reports,
    items
  };
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  const formulaSafeText = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return escapeCSVField(formulaSafeText);
}

export function buildClaimOfficialRuleReviewCsv(report: ClaimOfficialRuleReviewReport): string {
  const rows = [
    ['区分', 'ケースID', '対象月', '判定', '重要度', '確認分類', '確認項目', 'かみ砕いた説明', '返戻・査定リスク', '次の対応', '確認した回数', '上限回数', '根拠区分', '根拠', '根拠URL', '指摘コード'],
    [
      '総括',
      report.caseId,
      report.serviceMonth,
      report.statusLabel,
      report.errorCount > 0 ? 'エラー' : report.warningCount > 0 ? '警告' : '情報',
      '',
      `${report.ruleCount}項目を確認`,
      '患者名、患者ID、薬品名を含めない',
      report.ok ? '現在の確認項目に指摘なし' : `${report.attentionCount}項目を請求前に確認`,
      report.ok ? '対応不要' : '要確認項目を修正して再確認',
      '',
      '',
      '',
      report.source.label,
      report.source.url,
      ''
    ],
    ...report.items.map((item) => [
      '確認項目',
      item.caseId,
      item.serviceMonth,
      item.statusLabel,
      item.severity === 'error' ? 'エラー' : item.severity === 'warning' ? '警告' : '情報',
      item.categoryLabel,
      item.title,
      item.plainExplanation,
      item.returnRisk,
      item.actionLabel,
      item.observedCount ?? '',
      item.allowedCount ?? '',
      item.sourceKindLabels.join('・'),
      report.source.label,
      report.source.url,
      item.relatedIssueCodes.join('・')
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildClaimOfficialRuleBatchReviewCsv(report: ClaimOfficialRuleBatchReviewReport): string {
  const rows = [
    ['区分', 'ケースID', '対象月', '判定', '重要度', '確認分類', '確認項目', 'かみ砕いた説明', '返戻・査定リスク', '次の対応', '確認した回数', '上限回数', '根拠区分', '根拠', '根拠URL', '指摘コード'],
    [
      '総括',
      '',
      '',
      report.statusLabel,
      report.errorCount > 0 ? 'エラー' : report.warningCount > 0 ? '警告' : '情報',
      '',
      `${report.caseCount}件・${report.ruleCount}項目を確認`,
      '患者名、患者ID、薬品名、受付IDを含めない',
      report.ok ? '現在の確認項目に指摘なし' : `${report.attentionCount}項目を請求前に確認`,
      report.ok ? '対応不要' : '要確認項目を修正して再確認',
      '',
      '',
      '',
      report.source.label,
      report.source.url,
      ''
    ],
    ...report.items.map((item) => [
      '確認項目',
      item.caseId,
      item.serviceMonth,
      item.statusLabel,
      item.severity === 'error' ? 'エラー' : item.severity === 'warning' ? '警告' : '情報',
      item.categoryLabel,
      item.title,
      item.plainExplanation,
      item.returnRisk,
      item.actionLabel,
      item.observedCount ?? '',
      item.allowedCount ?? '',
      item.sourceKindLabels.join('・'),
      report.source.label,
      report.source.url,
      item.relatedIssueCodes.join('・')
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function formatClaimOfficialRuleReview(report: ClaimOfficialRuleReviewReport): string {
  if (report.ok) {
    return `${report.statusLabel}（${report.ruleCount}項目）`;
  }
  const titles = report.items
    .filter((item) => item.status === 'attention')
    .map((item) => item.title);
  return `${report.statusLabel}（${report.attentionCount}項目）: ${titles.join(' / ')}`;
}

export function formatClaimOfficialRuleBatchReview(report: ClaimOfficialRuleBatchReviewReport): string {
  if (report.ok) {
    return `${report.statusLabel}（${report.caseCount}件・${report.ruleCount}項目）`;
  }
  const titles = [...new Set(report.items
    .filter((item) => item.status === 'attention')
    .map((item) => item.title))];
  return `${report.statusLabel}（${report.attentionCount}項目）: ${titles.join(' / ')}`;
}

export function makeClaimOfficialRuleReviewFileName(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `算定ルール確認_${stamp}.csv`;
}
