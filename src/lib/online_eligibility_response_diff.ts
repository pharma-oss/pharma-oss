import type { InsuranceEligibilityStatus } from '@/db/types';
import { normalizeOnlineEligibilityResponse } from './online_eligibility';

export type OnlineEligibilitySampleDiffStatus = 'pass' | 'fail' | 'empty';

export interface OnlineEligibilityExpectedNormalization {
  patientStatus?: InsuranceEligibilityStatus;
  insurerNumber?: string;
  insuredNumber?: string;
  burdenRatio?: number;
  validFrom?: string;
  validTo?: string;
  publicInsuranceCount?: number;
}

export interface OnlineEligibilityOfficialSample {
  sampleId: string;
  sourceLabel: string;
  capturedAt?: string;
  containsPersonalData: false;
  response: unknown;
  expected: OnlineEligibilityExpectedNormalization;
}

export interface OnlineEligibilitySampleDiffIssue {
  sampleId: string;
  field: keyof OnlineEligibilityExpectedNormalization;
  expected: string;
  actual: string;
}

export interface OnlineEligibilitySampleDiffResult {
  sampleId: string;
  sourceLabel: string;
  status: Exclude<OnlineEligibilitySampleDiffStatus, 'empty'>;
  issueCount: number;
  issues: OnlineEligibilitySampleDiffIssue[];
  recognizedFieldCount: number;
  missingFieldCount: number;
}

export interface OnlineEligibilitySamplePrivacyIssue {
  sampleId: string;
  code: 'contains_personal_data_flag' | 'sample_id_too_specific' | 'source_label_too_specific';
  message: string;
}

export interface OnlineEligibilityResponseDiffReport {
  status: OnlineEligibilitySampleDiffStatus;
  sampleCount: number;
  failedSampleCount: number;
  issueCount: number;
  results: OnlineEligibilitySampleDiffResult[];
  privacyIssueCount: number;
  privacyIssues: OnlineEligibilitySamplePrivacyIssue[];
}

export interface OnlineEligibilitySampleRegistryReport {
  status: 'ready' | 'attention' | 'blocked';
  sampleCount: number;
  privacyIssueCount: number;
  privacyIssues: OnlineEligibilitySamplePrivacyIssue[];
  summary: string;
}

const CSV_HEADER = [
  'sampleId',
  'sourceLabel',
  'status',
  'issueCount',
  'field',
  'expected',
  'actual',
  'recognizedFieldCount',
  'missingFieldCount'
];

const TOO_SPECIFIC_SAMPLE_TEXT = [
  /患者名/,
  /氏名/,
  /保険番号/,
  /記号番号/,
  /\d{7,}/
];

function asComparableText(value: unknown): string {
  return String(value ?? '').trim();
}

function addIssue(
  issues: OnlineEligibilitySampleDiffIssue[],
  sampleId: string,
  field: keyof OnlineEligibilityExpectedNormalization,
  expected: unknown,
  actual: unknown
) {
  if (expected === undefined) return;
  const expectedText = asComparableText(expected);
  const actualText = asComparableText(actual);
  if (expectedText === actualText) return;
  issues.push({
    sampleId,
    field,
    expected: expectedText,
    actual: actualText
  });
}

function escapeCsvValue(value: unknown): string {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildOnlineEligibilitySamplePrivacyIssues(
  sample: OnlineEligibilityOfficialSample
): OnlineEligibilitySamplePrivacyIssue[] {
  const issues: OnlineEligibilitySamplePrivacyIssue[] = [];
  if (sample.containsPersonalData !== false) {
    issues.push({
      sampleId: sample.sampleId,
      code: 'contains_personal_data_flag',
      message: 'containsPersonalData は false にしてください。実患者情報を含むレスポンスは登録できません。'
    });
  }

  if (TOO_SPECIFIC_SAMPLE_TEXT.some((pattern) => pattern.test(sample.sampleId))) {
    issues.push({
      sampleId: sample.sampleId,
      code: 'sample_id_too_specific',
      message: 'sampleId に患者名、保険番号、長い番号などを含めないでください。'
    });
  }

  if (TOO_SPECIFIC_SAMPLE_TEXT.some((pattern) => pattern.test(sample.sourceLabel))) {
    issues.push({
      sampleId: sample.sampleId,
      code: 'source_label_too_specific',
      message: 'sourceLabel に患者名、保険番号、長い番号などを含めないでください。'
    });
  }

  return issues;
}

export function buildOnlineEligibilitySampleRegistryReport(
  samples: OnlineEligibilityOfficialSample[]
): OnlineEligibilitySampleRegistryReport {
  const privacyIssues = samples.flatMap(buildOnlineEligibilitySamplePrivacyIssues);
  const status = privacyIssues.length > 0 ? 'blocked' : samples.length > 0 ? 'ready' : 'attention';
  return {
    status,
    sampleCount: samples.length,
    privacyIssueCount: privacyIssues.length,
    privacyIssues,
    summary: samples.length === 0
      ? 'オンライン資格確認サンプル: 未登録'
      : `オンライン資格確認サンプル: ${samples.length}件 / 個人情報チェック ${privacyIssues.length}件`
  };
}

export function buildOnlineEligibilitySampleDiff(
  sample: OnlineEligibilityOfficialSample
): OnlineEligibilitySampleDiffResult {
  const normalized = normalizeOnlineEligibilityResponse(sample.response);
  const issues: OnlineEligibilitySampleDiffIssue[] = [];
  const patch = normalized.insuranceInfoPatch;

  addIssue(issues, sample.sampleId, 'patientStatus', sample.expected.patientStatus, normalized.patientStatus);
  addIssue(issues, sample.sampleId, 'insurerNumber', sample.expected.insurerNumber, patch.provider);
  addIssue(issues, sample.sampleId, 'insuredNumber', sample.expected.insuredNumber, patch.number);
  addIssue(issues, sample.sampleId, 'burdenRatio', sample.expected.burdenRatio, patch.burdenRatio);
  addIssue(issues, sample.sampleId, 'validFrom', sample.expected.validFrom, patch.validFrom);
  addIssue(issues, sample.sampleId, 'validTo', sample.expected.validTo, patch.validTo);
  addIssue(issues, sample.sampleId, 'publicInsuranceCount', sample.expected.publicInsuranceCount, normalized.publicInsurances?.length ?? 0);

  return {
    sampleId: sample.sampleId,
    sourceLabel: sample.sourceLabel,
    status: issues.length > 0 ? 'fail' : 'pass',
    issueCount: issues.length,
    issues,
    recognizedFieldCount: Object.keys(normalized.fieldMapping.recognized).length,
    missingFieldCount: normalized.fieldMapping.missing.length
  };
}

export function buildOnlineEligibilityResponseDiffReport(
  samples: OnlineEligibilityOfficialSample[]
): OnlineEligibilityResponseDiffReport {
  const privacyIssues = samples.flatMap(buildOnlineEligibilitySamplePrivacyIssues);
  if (samples.length === 0) {
    return {
      status: 'empty',
      sampleCount: 0,
      failedSampleCount: 0,
      issueCount: 0,
      results: [],
      privacyIssueCount: privacyIssues.length,
      privacyIssues
    };
  }

  const results = samples.map(buildOnlineEligibilitySampleDiff);
  const failedSampleCount = results.filter((result) => result.status === 'fail').length;
  const issueCount = results.reduce((sum, result) => sum + result.issueCount, 0);
  return {
    status: failedSampleCount > 0 ? 'fail' : 'pass',
    sampleCount: samples.length,
    failedSampleCount,
    issueCount,
    results,
    privacyIssueCount: privacyIssues.length,
    privacyIssues
  };
}

export function formatOnlineEligibilityResponseDiffSummary(report: OnlineEligibilityResponseDiffReport): string {
  if (report.status === 'empty') {
    return 'オンライン資格確認レスポンス差分: 実レスポンスサンプル未登録';
  }
  return `オンライン資格確認レスポンス差分: ${report.sampleCount}件中${report.failedSampleCount}件不一致 / 差分${report.issueCount}件`;
}

export function buildOnlineEligibilityResponseDiffCsv(report: OnlineEligibilityResponseDiffReport): string {
  const rows = [CSV_HEADER];
  for (const result of report.results) {
    if (result.issues.length === 0) {
      rows.push([
        result.sampleId,
        result.sourceLabel,
        result.status,
        String(result.issueCount),
        '',
        '',
        '',
        String(result.recognizedFieldCount),
        String(result.missingFieldCount)
      ]);
      continue;
    }

    for (const issue of result.issues) {
      rows.push([
        result.sampleId,
        result.sourceLabel,
        result.status,
        String(result.issueCount),
        issue.field,
        issue.expected,
        issue.actual,
        String(result.recognizedFieldCount),
        String(result.missingFieldCount)
      ]);
    }
  }

  return rows
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\n');
}
