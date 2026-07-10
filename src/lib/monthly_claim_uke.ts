import type { FacilitySettings, Patient, Visit } from '@/db/types';
import { calculateDispensingFees, type CalculationResultItem, type FeeCode } from '@/lib/calculator';
import { CLAIM_LIFECYCLE_STATUS_LABELS, getClaimLifecycleStatus, type ClaimLifecycleStatus } from '@/lib/claim_lifecycle';
import { buildDispensingUkeRecords, type DispensingUkeItem } from '@/lib/receipt/dispensing_uke';
import {
  buildDispensingUkeOfficialFile,
  DISPENSING_UKE_OFFICIAL_FILE_NAME,
  generateDispensingUkeOfficialContent,
  type DispensingUkeOfficialClaimInput
} from '@/lib/receipt/dispensing_uke_official';
import { buildDispensingUkeOfficialClaimBody, type DispensingUkeOfficialCodeCountPointInput, type DispensingUkeOfficialCodePointInput } from '@/lib/receipt/dispensing_uke_official_body';
import {
  DISPENSING_UKE_KNOWN_RECORD_SPEC,
  DISPENSING_UKE_RECORD_SPEC_SOURCE,
  buildDispensingUkeAllFieldValidationReport,
  validateDispensingUkeRecords,
  type DispensingUkeAllFieldValidationItem,
  type DispensingUkeAllFieldValidationReport,
  type DispensingUkeRecordSpec,
  type DispensingUkeValidationIssue
} from '@/lib/receipt/dispensing_uke_validation';
import { generateUkeContent, type UkeRecord } from '@/lib/receipt/uke_generator';
import {
  buildEvidenceIntegrityReview,
  type EvidenceIntegrityReview,
  type EvidenceIntegrityStatus
} from '@/lib/evidence_integrity';

export interface MonthlyClaimUkeCase {
  visit: Visit;
  patient: Patient;
  settings: FacilitySettings;
  items: DispensingUkeItem[];
  calculatedFees: CalculationResultItem[];
  interventions?: any[];
}

export interface MonthlyClaimUkeBuildResult {
  visitId: string;
  patientId: string;
  patientName: string;
  insuranceType?: string;
  insuranceProvider?: string;
  claimStatus: ClaimLifecycleStatus;
  rebillingReason?: string;
  totalPoints: number;
  records: UkeRecord[];
  issues: DispensingUkeValidationIssue[];
  allFieldValidationReport: DispensingUkeAllFieldValidationReport;
  officialReadinessReport: MonthlyClaimUkeOfficialReadinessReport;
}

export interface MonthlyClaimUkeBuildOptions {
  recordSpecs?: DispensingUkeRecordSpec[];
}

export interface MonthlyClaimUkeAllFieldIssue {
  sourceLabel: string;
  sourceUrl: string;
  visitId: string;
  patientId: string;
  patientName: string;
  recordIndex: number;
  recordType: string;
  itemNumber: number;
  label: string;
  required: boolean;
  format: DispensingUkeAllFieldValidationItem['format'];
  valuePresent: boolean;
  status: DispensingUkeAllFieldValidationItem['status'];
  statusLabel: string;
  issueCodes: string[];
  issueMessages: string[];
}

export interface MonthlyClaimUkeAllFieldSourceSummary {
  sourceLabel: string;
  sourceUrl: string;
  definedAllFieldCount: number;
  definedAllFieldRecordTypes: string[];
  checkedFieldCount: number;
  issueFieldCount: number;
  missingFieldCount: number;
  formatIssueFieldCount: number;
  recordTypes: string[];
  recordTypesWithIssues: string[];
}

export type MonthlyClaimUkeSampleCoverageKey =
  | 'social_insurance'
  | 'national_insurance'
  | 'public_expense'
  | 'returned'
  | 'rebilling';

export const MONTHLY_CLAIM_UKE_REQUIRED_SAMPLE_COVERAGE: MonthlyClaimUkeSampleCoverageKey[] = [
  'social_insurance',
  'national_insurance',
  'public_expense',
  'returned',
  'rebilling'
];

export const MONTHLY_CLAIM_UKE_SAMPLE_COVERAGE_LABELS: Record<MonthlyClaimUkeSampleCoverageKey, string> = {
  social_insurance: '社保',
  national_insurance: '国保',
  public_expense: '公費併用',
  returned: '返戻',
  rebilling: '再請求'
};

export interface MonthlyClaimUkeSampleCoverageReport {
  requiredSamples: MonthlyClaimUkeSampleCoverageKey[];
  coveredSamples: MonthlyClaimUkeSampleCoverageKey[];
  missingSamples: MonthlyClaimUkeSampleCoverageKey[];
  missingLabels: string[];
}

export type MonthlyClaimUkeBatchCheckSeverity = 'error' | 'warning';

export interface MonthlyClaimUkeBatchCheckIssue {
  severity: MonthlyClaimUkeBatchCheckSeverity;
  code: string;
  title: string;
  message: string;
  visitId?: string;
  patientName?: string;
}

export type MonthlyClaimUkeOfficialReadinessIssueCode =
  | 'official_uke_fee_code_missing'
  | 'official_uke_fee_code_invalid'
  | 'official_uke_drug_code_missing'
  | 'official_uke_drug_code_invalid'
  | 'official_uke_patient_gender_missing'
  | 'official_uke_prescription_date_missing'
  | 'official_uke_dispensing_date_missing'
  | 'official_uke_multiple_prescription_group_unconfirmed';

export interface MonthlyClaimUkeOfficialReadinessIssue {
  severity: MonthlyClaimUkeBatchCheckSeverity;
  code: MonthlyClaimUkeOfficialReadinessIssueCode;
  title: string;
  message: string;
  visitId: string;
  patientName: string;
  feeCode?: FeeCode;
  feeName?: string;
  expectedRecordType?: 'CZ' | 'KI';
  itemId?: string;
  drugName?: string;
  prescriptionGroupCount?: number;
  rpNumbers?: number[];
}

export interface MonthlyClaimUkeOfficialReadinessReport {
  ok: boolean;
  visitId: string;
  patientId: string;
  patientName: string;
  checkedFeeCount: number;
  readyFeeCount: number;
  checkedDrugItemCount: number;
  readyDrugItemCount: number;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  issues: MonthlyClaimUkeOfficialReadinessIssue[];
}

export interface MonthlyClaimUkeOfficialReadinessSummary {
  ok: boolean;
  totalClaims: number;
  readyClaims: number;
  issueClaims: number;
  checkedFeeCount: number;
  readyFeeCount: number;
  checkedDrugItemCount: number;
  readyDrugItemCount: number;
  issueCount: number;
  errorCount: number;
  warningCount: number;
}

export interface MonthlyClaimOfficialPrescriptionGroupPlanItem {
  visitId: string;
  patientId: string;
  patientName: string;
  rpNumber: number;
  officialPrescriptionNumber: string;
  receptionCount: number;
  prescriptionDate: string;
  dispensingDate: string;
  itemCount: number;
  itemIds: string[];
  drugNames: string[];
}

export interface MonthlyClaimOfficialPrescriptionGroupPlan {
  visitId: string;
  patientId: string;
  patientName: string;
  groupCount: number;
  items: MonthlyClaimOfficialPrescriptionGroupPlanItem[];
}

export interface MonthlyClaimUkePreflightReport {
  ok: boolean;
  totalClaims: number;
  errorResults: Array<MonthlyClaimUkeBuildResult & { filteredIssues: DispensingUkeValidationIssue[] }>;
  warningResults: Array<MonthlyClaimUkeBuildResult & { filteredIssues: DispensingUkeValidationIssue[] }>;
  batchIssues: MonthlyClaimUkeBatchCheckIssue[];
  batchErrorIssues: MonthlyClaimUkeBatchCheckIssue[];
  batchWarningIssues: MonthlyClaimUkeBatchCheckIssue[];
  officialSampleScopeReport: MonthlyClaimUkeOfficialSampleScopeReport;
  allFieldSourceSummary: MonthlyClaimUkeAllFieldSourceSummary;
  allFieldIssues: MonthlyClaimUkeAllFieldIssue[];
  allFieldIssueCsv: string;
  officialReadinessSummary: MonthlyClaimUkeOfficialReadinessSummary;
  officialReadinessIssues: MonthlyClaimUkeOfficialReadinessIssue[];
  officialReadinessIssueCsv: string;
  officialReadinessReviewCsv: string;
}

export interface MonthlyClaimUkeBundle {
  fileName: string;
  content: Uint8Array;
  totalClaims: number;
  totalPoints: number;
  records: UkeRecord[];
  results: MonthlyClaimUkeBuildResult[];
  batchIssues: MonthlyClaimUkeBatchCheckIssue[];
  officialSampleScopeReport: MonthlyClaimUkeOfficialSampleScopeReport;
  allFieldSourceSummary: MonthlyClaimUkeAllFieldSourceSummary;
  allFieldIssues: MonthlyClaimUkeAllFieldIssue[];
  allFieldIssueCsv: string;
  officialReadinessSummary: MonthlyClaimUkeOfficialReadinessSummary;
  officialReadinessIssues: MonthlyClaimUkeOfficialReadinessIssue[];
  officialReadinessIssueCsv: string;
  officialReadinessReviewCsv: string;
}

export type MonthlyClaimOfficialUkeReconciliationIssueCode =
  | 'official_uke_go_record_count_mismatch'
  | 'official_uke_go_claim_count_mismatch'
  | 'official_uke_go_total_points_mismatch'
  | 'official_uke_claim_count_mismatch'
  | 'official_uke_body_points_mismatch'
  | 'official_uke_insurance_prescription_count_mismatch'
  | 'official_uke_insurance_total_points_mismatch'
  | 'official_uke_public_prescription_count_mismatch'
  | 'official_uke_public_total_points_mismatch';

export interface MonthlyClaimOfficialUkeReconciliationIssue {
  severity: MonthlyClaimUkeBatchCheckSeverity;
  code: MonthlyClaimOfficialUkeReconciliationIssueCode;
  title: string;
  message: string;
  claimNumber?: number;
  visitId?: string;
  patientName?: string;
  expected?: number;
  actual?: number;
}

export interface MonthlyClaimOfficialUkeReconciliationItem {
  claimNumber: number;
  visitId: string;
  patientId: string;
  patientName: string;
  ok: boolean;
  supplementalRecordCount: number;
  dispensingDateRecordCount: number;
  prescriptionRecordCount: number;
  dispensingRecordCount: number;
  drugRecordCount: number;
  materialRecordCount: number;
  commentRecordCount: number;
  managementRecordCount: number;
  copaymentRecordCount: number;
  splitRecordCount: number;
  calculationItemCount: number;
  bodyPointTotal: number;
  expectedTotalPoints: number;
  insurancePrescriptionCounts: number[];
  insuranceTotalPoints: number[];
  publicPrescriptionCounts: number[];
  publicTotalPoints: number[];
  issueCount: number;
}

export interface MonthlyClaimOfficialUkeReconciliationReport {
  ok: boolean;
  totalClaims: number;
  expectedTotalClaims: number;
  goClaimCount: number | undefined;
  totalPoints: number;
  expectedTotalPoints: number;
  goTotalPoints: number | undefined;
  totalRecordCount: number;
  totalBodyRecordCount: number;
  totalSupplementalRecordCount: number;
  totalDispensingDateRecordCount: number;
  totalPrescriptionRecordCount: number;
  totalDispensingRecordCount: number;
  totalDrugRecordCount: number;
  totalMaterialRecordCount: number;
  totalCommentRecordCount: number;
  totalManagementRecordCount: number;
  totalCopaymentRecordCount: number;
  totalSplitRecordCount: number;
  totalCalculationItemCount: number;
  totalBodyPointTotal: number;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  items: MonthlyClaimOfficialUkeReconciliationItem[];
  issues: MonthlyClaimOfficialUkeReconciliationIssue[];
}

export interface MonthlyClaimOfficialUkeBundle {
  fileName: typeof DISPENSING_UKE_OFFICIAL_FILE_NAME;
  content: Uint8Array;
  totalClaims: number;
  totalPoints: number;
  records: UkeRecord[];
  results: MonthlyClaimUkeBuildResult[];
  officialReadinessSummary: MonthlyClaimUkeOfficialReadinessSummary;
  officialReconciliationReport: MonthlyClaimOfficialUkeReconciliationReport;
  officialReconciliationCsv: string;
}

export type MonthlyClaimOfficialSubmissionTrialPayer = 'social_insurance' | 'national_insurance';

export type MonthlyClaimOfficialSubmissionTrialResult =
  | 'not_submitted'
  | 'accepted'
  | 'accepted_with_warnings'
  | 'rejected';

export interface MonthlyClaimOfficialSubmissionTrialBundleSummary {
  fileName: string;
  totalClaims: number;
  totalPoints: number;
  goClaimCount?: number;
  goTotalPoints?: number;
  recordCount: number;
  reconciliationOk: boolean;
}

interface MonthlyClaimOfficialSubmissionTrialInputBase {
  submissionFileName?: string;
  submittedTo: string;
  checkedAt: string;
  result: MonthlyClaimOfficialSubmissionTrialResult;
  acceptanceId?: string;
  resultFileName?: string;
  checkedBy?: string;
  memo?: string;
  sourceArtifactSha256?: string;
  noPatientDataConfirmed?: boolean;
}

export type MonthlyClaimOfficialSubmissionTrialInput = MonthlyClaimOfficialSubmissionTrialInputBase & (
  | {
    bundle: MonthlyClaimOfficialUkeBundle;
    payer?: never;
    bundleSummary?: never;
  }
  | {
    bundle?: never;
    payer: MonthlyClaimOfficialSubmissionTrialPayer;
    bundleSummary: MonthlyClaimOfficialSubmissionTrialBundleSummary;
  }
);

export type MonthlyClaimOfficialSubmissionTrialIssueCode =
  | 'official_submission_trial_social_missing'
  | 'official_submission_trial_national_missing'
  | 'official_submission_trial_destination_missing'
  | 'official_submission_trial_checked_at_missing'
  | 'official_submission_trial_not_submitted'
  | 'official_submission_trial_rejected'
  | 'official_submission_trial_reconciliation_failed'
  | 'official_submission_trial_personal_info_detected'
  | 'official_submission_trial_evidence_integrity';

export interface MonthlyClaimOfficialSubmissionTrialIssue {
  severity: MonthlyClaimUkeBatchCheckSeverity;
  code: MonthlyClaimOfficialSubmissionTrialIssueCode;
  title: string;
  message: string;
  payer?: MonthlyClaimOfficialSubmissionTrialPayer;
  fileName?: string;
}

export interface MonthlyClaimOfficialSubmissionTrialItem {
  payer: MonthlyClaimOfficialSubmissionTrialPayer;
  payerLabel: string;
  payerOrganizationCode: '1' | '2';
  fileName: string;
  submittedTo: string;
  checkedAt: string;
  result: MonthlyClaimOfficialSubmissionTrialResult;
  resultLabel: string;
  acceptanceId: string;
  resultFileName: string;
  checkedBy: string;
  memo: string;
  totalClaims: number;
  totalPoints: number;
  goClaimCount: number | undefined;
  goTotalPoints: number | undefined;
  recordCount: number;
  reconciliationOk: boolean;
  issueCount: number;
  evidenceIntegrity: EvidenceIntegrityReview;
}

export interface MonthlyClaimOfficialSubmissionTrialReport {
  ok: boolean;
  totalTrials: number;
  requiredPayers: MonthlyClaimOfficialSubmissionTrialPayer[];
  coveredPayers: MonthlyClaimOfficialSubmissionTrialPayer[];
  missingPayers: MonthlyClaimOfficialSubmissionTrialPayer[];
  missingLabels: string[];
  acceptedTrialCount: number;
  rejectedTrialCount: number;
  notSubmittedTrialCount: number;
  totalClaims: number;
  totalPoints: number;
  totalGoClaimCount: number;
  totalGoPoints: number;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  evidenceIntegrityStatus: EvidenceIntegrityStatus;
  evidenceIntegrityIssueCount: number;
  items: MonthlyClaimOfficialSubmissionTrialItem[];
  issues: MonthlyClaimOfficialSubmissionTrialIssue[];
}

export interface MonthlyClaimOfficialSubmissionTrialTemplate {
  type: 'yakureki-official-submission-trial-input-template';
  schemaVersion: 1;
  guidance: string[];
  trials: Array<{
    payer: MonthlyClaimOfficialSubmissionTrialPayer;
    bundleSummary: MonthlyClaimOfficialSubmissionTrialBundleSummary;
    submissionFileName: string;
    submittedTo: string;
    checkedAt: string;
    result: 'not_submitted';
    acceptanceId: string;
    resultFileName: string;
    checkedBy: string;
    memo: string;
    sourceArtifactSha256: string;
    noPatientDataConfirmed: false;
  }>;
}

export type MonthlyClaimOfficialResubmissionRegressionTrigger =
  | 'acceptance_error'
  | 'returned_claim';

export type MonthlyClaimOfficialCorrectionCategory =
  | 'insurance'
  | 'public_expense'
  | 'prescription'
  | 'points'
  | 'record_shape'
  | 'other';

export interface MonthlyClaimOfficialResubmissionRegressionInput {
  caseId: string;
  trigger: MonthlyClaimOfficialResubmissionRegressionTrigger;
  originalBundle: MonthlyClaimOfficialUkeBundle;
  correctedBundle?: MonthlyClaimOfficialUkeBundle;
  payer?: MonthlyClaimOfficialSubmissionTrialPayer;
  errorCode: string;
  errorTitle: string;
  errorCause: string;
  correctionCategory: MonthlyClaimOfficialCorrectionCategory;
  correctionSummary: string;
  resultFileName?: string;
  resubmissionCheckedAt?: string;
  resubmissionResult?: MonthlyClaimOfficialSubmissionTrialResult;
  resubmissionAcceptanceId?: string;
  memo?: string;
}

export type MonthlyClaimOfficialResubmissionRegressionIssueCode =
  | 'official_resubmission_regression_error_code_missing'
  | 'official_resubmission_regression_corrected_uke_missing'
  | 'official_resubmission_regression_no_uke_diff'
  | 'official_resubmission_regression_checked_at_missing'
  | 'official_resubmission_regression_result_missing'
  | 'official_resubmission_regression_not_accepted'
  | 'official_resubmission_regression_personal_info_detected';

export interface MonthlyClaimOfficialResubmissionRegressionIssue {
  severity: MonthlyClaimUkeBatchCheckSeverity;
  code: MonthlyClaimOfficialResubmissionRegressionIssueCode;
  title: string;
  message: string;
  caseId?: string;
  payer?: MonthlyClaimOfficialSubmissionTrialPayer;
}

export interface MonthlyClaimOfficialUkeDiffSummary {
  beforeRecordCount: number;
  afterRecordCount: number;
  beforeGoClaimCount: number | undefined;
  beforeGoTotalPoints: number | undefined;
  afterGoClaimCount: number | undefined;
  afterGoTotalPoints: number | undefined;
  goPointDifference: number;
  addedRecordRefs: string[];
  removedRecordRefs: string[];
  changedRecordRefs: string[];
  changedRecordTypes: string[];
  changedFieldRefs: string[];
  changedFieldCount: number;
  hasDiff: boolean;
}

export interface MonthlyClaimOfficialResubmissionRegressionItem {
  caseId: string;
  payer: MonthlyClaimOfficialSubmissionTrialPayer;
  payerLabel: string;
  trigger: MonthlyClaimOfficialResubmissionRegressionTrigger;
  triggerLabel: string;
  originalFileName: string;
  correctedFileName: string;
  errorCode: string;
  errorTitle: string;
  errorCause: string;
  correctionCategory: MonthlyClaimOfficialCorrectionCategory;
  correctionCategoryLabel: string;
  correctionSummary: string;
  resultFileName: string;
  resubmissionCheckedAt: string;
  resubmissionResult: MonthlyClaimOfficialSubmissionTrialResult | undefined;
  resubmissionResultLabel: string;
  resubmissionAcceptanceId: string;
  memo: string;
  diffSummary: MonthlyClaimOfficialUkeDiffSummary;
  issueCount: number;
}

export interface MonthlyClaimOfficialResubmissionRegressionReport {
  ok: boolean;
  totalCases: number;
  completedCaseCount: number;
  acceptanceErrorCount: number;
  returnedClaimCount: number;
  totalChangedFieldCount: number;
  changedRecordTypes: string[];
  issueCount: number;
  errorCount: number;
  warningCount: number;
  items: MonthlyClaimOfficialResubmissionRegressionItem[];
  issues: MonthlyClaimOfficialResubmissionRegressionIssue[];
}

export interface MonthlyClaimUkeOfficialSampleScopeReport {
  ok: boolean;
  validationOnlyRecordTypes: string[];
  generatedRecordTypes: string[];
  generatedValidationOnlyRecordTypes: string[];
  suppressedRecordTypes: string[];
}

export function makeMonthlyClaimUkeFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `MONTHLY_CLAIM_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.uke`;
}

export function makeMonthlyClaimUkeAllFieldIssueFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `MONTHLY_CLAIM_ALL_FIELDS_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.csv`;
}

export function makeMonthlyClaimUkeOfficialReadinessIssueFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `MONTHLY_CLAIM_OFFICIAL_READINESS_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.csv`;
}

export function makeMonthlyClaimUkeOfficialReadinessReviewFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `MONTHLY_CLAIM_OFFICIAL_READINESS_REVIEW_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.csv`;
}

export function makeMonthlyClaimOfficialSubmissionTrialFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `MONTHLY_CLAIM_OFFICIAL_SUBMISSION_TRIAL_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.csv`;
}

export function makeMonthlyClaimOfficialResubmissionRegressionFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `MONTHLY_CLAIM_OFFICIAL_RESUBMISSION_REGRESSION_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.csv`;
}

const MONTHLY_CLAIM_UKE_OFFICIAL_FEE_RECORD_TYPES: Partial<Record<FeeCode, 'CZ' | 'KI'>> = {
  base_fee: 'KI',
  base_additions: 'KI',
  drug_preparation: 'CZ',
  dispensing_management: 'CZ',
  medication_guidance: 'KI',
  special_management: 'KI',
  ippoka: 'CZ',
  mixing: 'CZ'
};

function addOfficialReadinessIssue(
  issues: MonthlyClaimUkeOfficialReadinessIssue[],
  issue: MonthlyClaimUkeOfficialReadinessIssue
) {
  issues.push(issue);
}

function isReceiptCode(value: string | undefined): boolean {
  return /^\d{9}$/.test(String(value || '').trim());
}

function firstDateLike(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => /\d{4}-\d{2}-\d{2}/.test(String(value || '')));
}

function calendarDate(value: string | undefined, label: string): string {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) {
    throw new Error(`${label}をYYYY-MM-DD形式で確認してください。`);
  }
  return match[1];
}

function calendarMonth(value: string | undefined, label: string): string {
  const match = String(value || '').match(/^(\d{4})-(\d{2})/);
  if (!match) {
    throw new Error(`${label}をYYYY-MM形式で確認してください。`);
  }
  return `${match[1]}-${match[2]}`;
}

function digitsOnly(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function requireDigits(value: unknown, label: string, lengths: number[]): string {
  const digits = digitsOnly(value);
  if (!lengths.includes(digits.length)) {
    throw new Error(`${label}は${lengths.join('桁または')}桁の数字で確認してください。`);
  }
  return digits;
}

const PREFECTURE_CODES = new Map([
  ['北海道', '01'], ['青森県', '02'], ['岩手県', '03'], ['宮城県', '04'], ['秋田県', '05'],
  ['山形県', '06'], ['福島県', '07'], ['茨城県', '08'], ['栃木県', '09'], ['群馬県', '10'],
  ['埼玉県', '11'], ['千葉県', '12'], ['東京都', '13'], ['神奈川県', '14'], ['新潟県', '15'],
  ['富山県', '16'], ['石川県', '17'], ['福井県', '18'], ['山梨県', '19'], ['長野県', '20'],
  ['岐阜県', '21'], ['静岡県', '22'], ['愛知県', '23'], ['三重県', '24'], ['滋賀県', '25'],
  ['京都府', '26'], ['大阪府', '27'], ['兵庫県', '28'], ['奈良県', '29'], ['和歌山県', '30'],
  ['鳥取県', '31'], ['島根県', '32'], ['岡山県', '33'], ['広島県', '34'], ['山口県', '35'],
  ['徳島県', '36'], ['香川県', '37'], ['愛媛県', '38'], ['高知県', '39'], ['福岡県', '40'],
  ['佐賀県', '41'], ['長崎県', '42'], ['熊本県', '43'], ['大分県', '44'], ['宮崎県', '45'],
  ['鹿児島県', '46'], ['沖縄県', '47']
]);

function deriveOfficialPrefectureCode(settings: FacilitySettings): string {
  const explicit = digitsOnly((settings as FacilitySettings & { prefectureCode?: string }).prefectureCode);
  if (/^\d{2}$/.test(explicit)) return explicit;

  const address = String(settings.pharmacyAddress || '').trim();
  for (const [prefectureName, prefectureCode] of PREFECTURE_CODES) {
    if (address.startsWith(prefectureName)) {
      return prefectureCode;
    }
  }

  throw new Error('公式提出用の都道府県を薬局住所で確認してください。');
}

function deriveOfficialPayerOrganizationCode(patient: Patient): '1' | '2' {
  const insuranceType = patient.insuranceInfo?.insuranceType || '';
  const provider = digitsOnly(patient.insuranceInfo?.provider);
  if (/国保|国民健康保険|後期高齢/.test(insuranceType) || provider.length === 6) {
    return '2';
  }
  return '1';
}

function ageOnDate(birthDate: string, serviceDate: string): number {
  const birth = calendarDate(birthDate, '生年月日');
  const service = calendarDate(serviceDate, '調剤年月日');
  const birthYear = Number(birth.slice(0, 4));
  const serviceYear = Number(service.slice(0, 4));
  const birthday = birth.slice(5);
  const serviceMonthDay = service.slice(5);
  return serviceYear - birthYear - (serviceMonthDay < birthday ? 1 : 0);
}

function isPreschoolChild(birthDate: string, serviceDate: string): boolean {
  const birth = calendarDate(birthDate, '生年月日');
  const service = calendarDate(serviceDate, '調剤年月日');
  const birthYear = Number(birth.slice(0, 4));
  const birthMonthDay = birth.slice(5);
  const schoolStartYear = birthYear + 6 + (birthMonthDay > '04-01' ? 1 : 0);
  return service < `${schoolStartYear}-04-01`;
}

function deriveOfficialClaimTypeCode(claim: MonthlyClaimUkeCase): string {
  const patient = claim.patient;
  const insuranceInfo = patient.insuranceInfo;
  const publicExpenseCount = patient.publicInsurances?.length ?? 0;
  if (publicExpenseCount > 4) {
    throw new Error(`${patient.name} の公費は公式UKEで扱える4件以内にしてください。`);
  }

  if (!insuranceInfo?.provider) {
    if (publicExpenseCount < 1) {
      throw new Error(`${patient.name} の保険者または公費情報を確認してください。`);
    }
    return `42${publicExpenseCount}2`;
  }

  const dispensingDate = calendarDate(
    firstDateLike(claim.visit.dispensingDate, claim.visit.issueDate),
    '調剤年月日'
  );
  const patientAge = ageOnDate(patient.birthDate, dispensingDate);
  const insuranceType = insuranceInfo.insuranceType || '';
  const isLateElderly = /後期高齢/.test(insuranceType) || patientAge >= 75;
  const burdenRatio = insuranceInfo.burdenRatio;

  if (isLateElderly) {
    const benefitCode = burdenRatio !== undefined && burdenRatio >= 30 ? '0' : '8';
    return `43${publicExpenseCount + 1}${benefitCode}`;
  }

  let insuredPersonCode: '0' | '2' | '4' | '6' | '8';
  if (patientAge >= 70) {
    insuredPersonCode = burdenRatio !== undefined && burdenRatio >= 30 ? '0' : '8';
  } else if (isPreschoolChild(patient.birthDate, dispensingDate)) {
    insuredPersonCode = '4';
  } else {
    const relationship = String(insuranceInfo.relationship || '').trim();
    if (relationship === '本人' || relationship === '被保険者' || relationship === '世帯主') {
      insuredPersonCode = '2';
    } else if (relationship === '家族' || relationship === '被扶養者' || relationship === 'その他') {
      insuredPersonCode = '6';
    } else {
      throw new Error(`${patient.name} の本人・家族区分を確認してください。`);
    }
  }

  return `41${publicExpenseCount + 1}${insuredPersonCode}`;
}

function toOfficialGenderCode(patient: Patient): '1' | '2' {
  if (patient.gender === 'male') return '1';
  if (patient.gender === 'female') return '2';
  throw new Error(`${patient.name} の性別を男性または女性として確認してください。`);
}

function officialPrescriptionNumbers(claim: MonthlyClaimUkeCase): number[] {
  const rpNumbers = claim.items
    .filter((item) => item.claimDrugFee !== false || item.claimPreparation !== false)
    .map((item) => item.rpNumber ?? 1)
    .filter((value): value is number => Number.isSafeInteger(value));
  return Array.from(new Set(rpNumbers)).sort((left, right) => left - right);
}

function officialPrescriptionCount(claim: MonthlyClaimUkeCase): number {
  return Math.max(1, officialPrescriptionNumbers(claim).length);
}

export function buildMonthlyClaimOfficialPrescriptionGroupPlan(
  claim: MonthlyClaimUkeCase
): MonthlyClaimOfficialPrescriptionGroupPlan {
  const prescriptionDate = calendarDate(firstDateLike(claim.visit.prescriptionDate, claim.visit.issueDate), '処方年月日');
  const dispensingDate = calendarDate(firstDateLike(claim.visit.dispensingDate, claim.visit.issueDate), '調剤年月日');
  const groupedItems = new Map<number, DispensingUkeItem[]>();

  for (const item of claim.items.filter((entry) => entry.claimDrugFee !== false || entry.claimPreparation !== false)) {
    const rpNumber = Number.isSafeInteger(item.rpNumber) ? item.rpNumber! : 1;
    const group = groupedItems.get(rpNumber) ?? [];
    group.push(item);
    groupedItems.set(rpNumber, group);
  }

  const groups = Array.from(groupedItems.entries()).sort(([left], [right]) => left - right);
  const items = groups.map(([rpNumber, group], index): MonthlyClaimOfficialPrescriptionGroupPlanItem => ({
    visitId: claim.visit.visitId,
    patientId: claim.patient.patientId,
    patientName: claim.patient.name,
    rpNumber,
    officialPrescriptionNumber: String(index + 1).padStart(2, '0'),
    receptionCount: index + 1,
    prescriptionDate,
    dispensingDate,
    itemCount: group.length,
    itemIds: group.map((item) => item.itemId),
    drugNames: group.map((item) => item.dispensedDrug || item.drugName || item.drugId)
  }));

  return {
    visitId: claim.visit.visitId,
    patientId: claim.patient.patientId,
    patientName: claim.patient.name,
    groupCount: items.length,
    items
  };
}

export function formatMonthlyClaimOfficialPrescriptionGroupPlan(
  plan: MonthlyClaimOfficialPrescriptionGroupPlan
): string {
  const prescriptionNumbers = plan.items.map((item) => item.officialPrescriptionNumber).join('・') || 'なし';
  const receptionCounts = plan.items.map((item) => item.receptionCount).join('・') || 'なし';
  const rpNumbers = plan.items.map((item) => item.rpNumber).join('・') || 'なし';
  return `${plan.patientName}: 公式処方グループ ${plan.groupCount}件 / RP ${rpNumbers} / SH ${prescriptionNumbers} / 受付回 ${receptionCounts}`;
}

export function buildMonthlyClaimOfficialPrescriptionGroupPlanCsv(
  plans: MonthlyClaimOfficialPrescriptionGroupPlan | MonthlyClaimOfficialPrescriptionGroupPlan[]
): string {
  const planList = Array.isArray(plans) ? plans : [plans];
  const rows = [
    ['受付ID', '患者ID', '患者名', 'RP番号', '公式処方番号', '処方箋受付回', '処方箋交付年月日', '調剤年月日', '薬剤数', '薬剤ID', '薬剤名'],
    ...planList.flatMap((plan) => plan.items.map((item) => [
      item.visitId,
      item.patientId,
      item.patientName,
      item.rpNumber,
      item.officialPrescriptionNumber,
      item.receptionCount,
      item.prescriptionDate.replace(/-/g, ''),
      item.dispensingDate.replace(/-/g, ''),
      item.itemCount,
      item.itemIds.join('・'),
      item.drugNames.join('・')
    ]))
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function firstOfficialFee(claim: MonthlyClaimUkeCase, codes: FeeCode[]): CalculationResultItem | undefined {
  return claim.calculatedFees.find((fee) => fee.code !== undefined && codes.includes(fee.code) && isReceiptCode(fee.receiptFeeCode));
}

function officialFeeItems(claim: MonthlyClaimUkeCase, codes: FeeCode[]): CalculationResultItem[] {
  return claim.calculatedFees.filter((fee) => fee.code !== undefined && codes.includes(fee.code) && isReceiptCode(fee.receiptFeeCode));
}

function toOfficialCodePoint(fee: CalculationResultItem): DispensingUkeOfficialCodePointInput {
  return {
    burdenCategory: '1',
    code: String(fee.receiptFeeCode),
    points: fee.points
  };
}

function toOfficialCodeCountPoint(fee: CalculationResultItem): DispensingUkeOfficialCodeCountPointInput {
  return {
    ...toOfficialCodePoint(fee),
    count: 1
  };
}

function groupOfficialDrugItems(claim: MonthlyClaimUkeCase): Array<{ rpNumber: number; items: DispensingUkeItem[] }> {
  const groupedItems = new Map<number, DispensingUkeItem[]>();
  for (const item of claim.items.filter((entry) => entry.claimDrugFee !== false)) {
    const rpNumber = Number.isSafeInteger(item.rpNumber) ? item.rpNumber! : 1;
    const group = groupedItems.get(rpNumber) ?? [];
    group.push(item);
    groupedItems.set(rpNumber, group);
  }
  return Array.from(groupedItems.entries())
    .sort(([left], [right]) => left - right)
    .map(([rpNumber, items]) => ({ rpNumber, items }));
}

function allocatePointsByWeights(totalPoints: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  if (totalPoints <= 0) return weights.map(() => 0);

  const safeWeights = weights.map((weight) => Math.max(0, weight));
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal <= 0) {
    const base = Math.floor(totalPoints / weights.length);
    const remainder = totalPoints - base * weights.length;
    return weights.map((_, index) => base + (index < remainder ? 1 : 0));
  }

  const rawShares = safeWeights.map((weight) => (totalPoints * weight) / weightTotal);
  const allocated = rawShares.map(Math.floor);
  let remainder = totalPoints - allocated.reduce((sum, points) => sum + points, 0);
  const order = rawShares
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);

  for (const item of order) {
    if (remainder <= 0) break;
    allocated[item.index] += 1;
    remainder -= 1;
  }

  return allocated;
}

function calculateGroupFeeWeight(
  claim: MonthlyClaimUkeCase,
  groupItems: DispensingUkeItem[],
  dispensingDate: string,
  feeCode: FeeCode
): number {
  const results = calculateDispensingFees(
    claim.settings,
    groupItems,
    claim.patient,
    dispensingDate,
    feeCode === 'drug_fee' ? { drugFeeOnly: true } : undefined
  );
  return results.find((fee) => fee.code === feeCode)?.points ?? 0;
}

function allocateGroupFeePoints(
  claim: MonthlyClaimUkeCase,
  groups: Array<{ items: DispensingUkeItem[] }>,
  dispensingDate: string,
  totalPoints: number,
  feeCode: FeeCode
): number[] {
  const weights = groups.map((group) => calculateGroupFeeWeight(claim, group.items, dispensingDate, feeCode));
  return allocatePointsByWeights(totalPoints, weights);
}

function deriveOfficialDosageFormCode(items: DispensingUkeItem[]): string {
  if (items.some((item) => (item.days ?? 0) > 0)) return '1';
  if (items.some((item) => /外|塗|貼|軟膏|クリーム|ローション/.test(String(item.usage || item.drugName || item.dispensedDrug || '')))) return '3';
  return '1';
}

function getOfficialDispensingQuantity(items: DispensingUkeItem[]): number {
  return Math.max(1, ...items.map((item) => Number(item.days || item.amount || 1)).filter(Number.isFinite));
}

function hasOfficialPayerRecord(claim: MonthlyClaimUkeCase): boolean {
  return Boolean(claim.patient.insuranceInfo?.provider || (claim.patient.publicInsurances?.length ?? 0) > 0);
}

function buildOfficialDailyFields(values: Record<string, string | number> | undefined, padLength?: number): string[] {
  return Array.from({ length: 31 }, (_, index) => {
    const day = index + 1;
    const value = values?.[String(day).padStart(2, '0')] ?? values?.[String(day)];
    if (value === undefined || value === '') return '';
    const text = String(value);
    return padLength && /^\d+$/.test(text) ? text.padStart(padLength, '0') : text;
  });
}

function buildMonthlyClaimOfficialSupplementalRecords(claim: MonthlyClaimUkeCase): UkeRecord[] {
  const options = claim.visit.claimOptions;
  const records = options?.officialSupplementalRecords ?? [];
  if (records.length === 0) return [];
  if (!hasOfficialPayerRecord(claim)) {
    throw new Error(`${claim.patient.name} のSN補助情報はHOまたはKOがある受付でだけ公式提出できます。`);
  }

  return records.map((record) => ({
    type: 'SN',
    fields: [
      record.payerCategory,
      record.confirmationCategory,
      record.insurerNumber ?? '',
      record.symbol ?? '',
      record.number ?? '',
      record.branch ?? '',
      record.recipientNumber ?? '',
      record.reserve ?? ''
    ]
  }));
}

function buildMonthlyClaimOfficialDispensingDateRecords(claim: MonthlyClaimUkeCase): UkeRecord[] {
  const records = claim.visit.claimOptions?.officialDispensingDateRecords ?? [];
  if (records.length === 0) return [];
  if (!hasOfficialPayerRecord(claim)) {
    throw new Error(`${claim.patient.name} のJD調剤日情報はHOまたはKOがある受付でだけ公式提出できます。`);
  }

  return records.map((record) => ({
    type: 'JD',
    fields: [record.payerCategory, ...buildOfficialDailyFields(record.days)]
  }));
}

function buildMonthlyClaimOfficialCopaymentRecords(claim: MonthlyClaimUkeCase): UkeRecord[] {
  const records = claim.visit.claimOptions?.officialCopaymentRecords ?? [];
  if (records.length === 0) return [];
  if (!hasOfficialPayerRecord(claim)) {
    throw new Error(`${claim.patient.name} のMF窓口負担額情報はHOまたはKOがある受付でだけ公式提出できます。`);
  }

  return records.map((record) => ({
    type: 'MF',
    fields: [record.category, ...buildOfficialDailyFields(record.dailyAmounts, 9)]
  }));
}

function buildMonthlyClaimOfficialSplitDispensingRecords(
  claim: MonthlyClaimUkeCase,
  prescriptionDate: string,
  dispensingDate: string
): UkeRecord[] {
  return (claim.visit.claimOptions?.officialSplitDispensingRecords ?? []).map((record) => {
    const publicTargetPoints = record.publicTargetPoints ?? [];
    const publicAfterSplitPoints = record.publicAfterSplitPoints ?? [];
    return {
      type: 'ST',
      fields: [
        record.doctorNumber ?? String(claim.visit.doctorId || claim.visit.doctorName || '1'),
        calendarDate(record.prescriptionDate || prescriptionDate, 'ST処方月日').replace(/-/g, ''),
        calendarDate(record.dispensingDate || dispensingDate, 'ST調剤月日').replace(/-/g, ''),
        String(record.receptionCount ?? 1),
        String(record.splitCount),
        record.insuranceTargetPoints === undefined ? '' : String(record.insuranceTargetPoints),
        record.insuranceAfterSplitPoints === undefined ? '' : String(record.insuranceAfterSplitPoints),
        publicTargetPoints[0] === undefined ? '' : String(publicTargetPoints[0]),
        publicAfterSplitPoints[0] === undefined ? '' : String(publicAfterSplitPoints[0]),
        publicTargetPoints[1] === undefined ? '' : String(publicTargetPoints[1]),
        publicAfterSplitPoints[1] === undefined ? '' : String(publicAfterSplitPoints[1]),
        publicTargetPoints[2] === undefined ? '' : String(publicTargetPoints[2]),
        publicAfterSplitPoints[2] === undefined ? '' : String(publicAfterSplitPoints[2]),
        publicTargetPoints[3] === undefined ? '' : String(publicTargetPoints[3]),
        publicAfterSplitPoints[3] === undefined ? '' : String(publicAfterSplitPoints[3])
      ]
    };
  });
}

const MONTHLY_CLAIM_OFFICIAL_BODY_RECORD_TYPES = new Set(['SN', 'JD', 'MF', 'SH', 'CZ', 'IY', 'TO', 'CO', 'TK', 'KI', 'ST']);
const OFFICIAL_CZ_ADDITION_POINT_FIELD_INDICES = Array.from({ length: 10 }, (_, index) => 16 + index * 3);
const OFFICIAL_CZ_POINT_FIELD_INDICES = [
  9,
  12,
  ...OFFICIAL_CZ_ADDITION_POINT_FIELD_INDICES,
  55,
  60,
  63
];
const OFFICIAL_KI_MANAGEMENT_POINT_FIELD_INDICES = Array.from({ length: 12 }, (_, index) => 9 + index * 4);
const OFFICIAL_KI_SUMMARY_POINT_FIELD_INDICES = Array.from({ length: 3 }, (_, index) => 57 + index * 4);
const OFFICIAL_KI_BASE_ADDITION_POINT_FIELD_INDICES = Array.from({ length: 10 }, (_, index) => 71 + index * 4);
const OFFICIAL_KI_POINT_FIELD_INDICES = [
  4,
  ...OFFICIAL_KI_MANAGEMENT_POINT_FIELD_INDICES,
  ...OFFICIAL_KI_SUMMARY_POINT_FIELD_INDICES,
  ...OFFICIAL_KI_BASE_ADDITION_POINT_FIELD_INDICES
];

interface MonthlyClaimOfficialRecordGroup {
  claimNumber: number;
  records: UkeRecord[];
  insuranceRecords: UkeRecord[];
  publicExpenseRecords: UkeRecord[];
  bodyRecords: UkeRecord[];
}

function parseOfficialInteger(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  if (!/^-?\d+$/.test(value)) return undefined;
  return Number(value);
}

function sumOfficialIntegerFields(record: UkeRecord, indices: number[]): number {
  return indices.reduce((sum, index) => sum + (parseOfficialInteger(record.fields[index]) ?? 0), 0);
}

function countOfficialCzCalculationItems(record: UkeRecord): number {
  let count = 0;
  if (record.fields[8] || record.fields[9]) count += 1;
  if ((parseOfficialInteger(record.fields[12]) ?? 0) !== 0) count += 1;
  for (let index = 0; index < 10; index += 1) {
    const offset = 14 + index * 3;
    if (record.fields[offset + 1] || record.fields[offset + 2]) count += 1;
  }
  if (record.fields[54] || record.fields[55]) count += 1;
  if (record.fields[59] || record.fields[60]) count += 1;
  if (record.fields[62] || record.fields[63]) count += 1;
  return count;
}

function countOfficialKiCalculationItems(record: UkeRecord): number {
  let count = 0;
  if (record.fields[3] || record.fields[4]) count += 1;
  for (let index = 0; index < 12; index += 1) {
    const offset = 6 + index * 4;
    if (record.fields[offset + 1] || record.fields[offset + 3]) count += 1;
  }
  for (let index = 0; index < 3; index += 1) {
    const offset = 54 + index * 4;
    if (record.fields[offset + 1] || record.fields[offset + 3]) count += 1;
  }
  for (let index = 0; index < 10; index += 1) {
    const offset = 68 + index * 4;
    if (record.fields[offset + 1] || record.fields[offset + 3]) count += 1;
  }
  return count;
}

function getOfficialRecordPointTotal(record: UkeRecord): number {
  if (record.type === 'CZ') return sumOfficialIntegerFields(record, OFFICIAL_CZ_POINT_FIELD_INDICES);
  if (record.type === 'KI') return sumOfficialIntegerFields(record, OFFICIAL_KI_POINT_FIELD_INDICES);
  return 0;
}

function getOfficialCalculationItemCount(record: UkeRecord): number {
  if (record.type === 'CZ') return countOfficialCzCalculationItems(record);
  if (record.type === 'KI') return countOfficialKiCalculationItems(record);
  return 0;
}

function splitMonthlyClaimOfficialRecordGroups(records: UkeRecord[]): MonthlyClaimOfficialRecordGroup[] {
  const groups: MonthlyClaimOfficialRecordGroup[] = [];
  let current: MonthlyClaimOfficialRecordGroup | undefined;

  for (const record of records) {
    if (record.type === 'RE') {
      if (current) groups.push(current);
      current = {
        claimNumber: parseOfficialInteger(record.fields[0]) ?? groups.length + 1,
        records: [record],
        insuranceRecords: [],
        publicExpenseRecords: [],
        bodyRecords: []
      };
      continue;
    }

    if (record.type === 'GO') {
      if (current) {
        groups.push(current);
        current = undefined;
      }
      continue;
    }

    if (!current) continue;
    current.records.push(record);
    if (record.type === 'HO') {
      current.insuranceRecords.push(record);
    } else if (record.type === 'KO') {
      current.publicExpenseRecords.push(record);
    } else if (MONTHLY_CLAIM_OFFICIAL_BODY_RECORD_TYPES.has(record.type)) {
      current.bodyRecords.push(record);
    }
  }

  if (current) groups.push(current);
  return groups;
}

function addOfficialReconciliationIssue(
  issues: MonthlyClaimOfficialUkeReconciliationIssue[],
  issue: MonthlyClaimOfficialUkeReconciliationIssue
): void {
  issues.push(issue);
}

function buildMonthlyClaimOfficialUkeReconciliationReport(
  records: UkeRecord[],
  claimInputs: DispensingUkeOfficialClaimInput[],
  results: MonthlyClaimUkeBuildResult[]
): MonthlyClaimOfficialUkeReconciliationReport {
  const issues: MonthlyClaimOfficialUkeReconciliationIssue[] = [];
  const groups = splitMonthlyClaimOfficialRecordGroups(records);
  const goRecords = records.filter((record) => record.type === 'GO');
  const goRecord = goRecords[0];
  const expectedTotalClaims = claimInputs.length;
  const expectedTotalPoints = claimInputs.reduce((sum, claim) => sum + claim.totalPoints, 0);
  const goClaimCount = parseOfficialInteger(goRecord?.fields[0]);
  const goTotalPoints = parseOfficialInteger(goRecord?.fields[1]);

  if (goRecords.length !== 1) {
    addOfficialReconciliationIssue(issues, {
      severity: 'error',
      code: 'official_uke_go_record_count_mismatch',
      title: 'GOレコード数が一致しません',
      message: `GOレコードは1件必要ですが、${goRecords.length}件あります。`,
      expected: 1,
      actual: goRecords.length
    });
  }

  if (groups.length !== expectedTotalClaims) {
    addOfficialReconciliationIssue(issues, {
      severity: 'error',
      code: 'official_uke_claim_count_mismatch',
      title: '本文の請求件数が一致しません',
      message: `公式提出対象は${expectedTotalClaims}件ですが、REから読める本文請求は${groups.length}件です。`,
      expected: expectedTotalClaims,
      actual: groups.length
    });
  }

  if (goClaimCount !== undefined && goClaimCount !== expectedTotalClaims) {
    addOfficialReconciliationIssue(issues, {
      severity: 'error',
      code: 'official_uke_go_claim_count_mismatch',
      title: 'GO総件数が一致しません',
      message: `GO総件数は${goClaimCount}件ですが、公式提出対象は${expectedTotalClaims}件です。`,
      expected: expectedTotalClaims,
      actual: goClaimCount
    });
  }

  if (goTotalPoints !== undefined && goTotalPoints !== expectedTotalPoints) {
    addOfficialReconciliationIssue(issues, {
      severity: 'error',
      code: 'official_uke_go_total_points_mismatch',
      title: 'GO総合計点数が一致しません',
      message: `GO総合計点数は${goTotalPoints}点ですが、請求合計は${expectedTotalPoints}点です。`,
      expected: expectedTotalPoints,
      actual: goTotalPoints
    });
  }

  const items: MonthlyClaimOfficialUkeReconciliationItem[] = [];
  for (let index = 0; index < Math.max(claimInputs.length, groups.length); index += 1) {
    const claimInput = claimInputs[index];
    const result = results[index];
    const group = groups[index];
    const claimNumber = claimInput?.common.claimNumber ?? group?.claimNumber ?? index + 1;
    const bodyRecords = group?.bodyRecords ?? [];
    const expectedClaimTotalPoints = claimInput?.totalPoints ?? result?.totalPoints ?? 0;
    const supplementalRecordCount = bodyRecords.filter((record) => record.type === 'SN').length;
    const dispensingDateRecordCount = bodyRecords.filter((record) => record.type === 'JD').length;
    const prescriptionRecordCount = bodyRecords.filter((record) => record.type === 'SH').length;
    const dispensingRecordCount = bodyRecords.filter((record) => record.type === 'CZ').length;
    const drugRecordCount = bodyRecords.filter((record) => record.type === 'IY').length;
    const materialRecordCount = bodyRecords.filter((record) => record.type === 'TO').length;
    const commentRecordCount = bodyRecords.filter((record) => record.type === 'TK').length;
    const managementRecordCount = bodyRecords.filter((record) => record.type === 'KI').length;
    const copaymentRecordCount = bodyRecords.filter((record) => record.type === 'MF').length;
    const splitRecordCount = bodyRecords.filter((record) => record.type === 'ST').length;
    const bodyPointTotal = bodyRecords.reduce((sum, record) => sum + getOfficialRecordPointTotal(record), 0);
    const calculationItemCount = bodyRecords.reduce((sum, record) => sum + getOfficialCalculationItemCount(record), 0);
    const insurancePrescriptionCounts = (group?.insuranceRecords ?? []).map((record) => parseOfficialInteger(record.fields[3]) ?? 0);
    const insuranceTotalPoints = (group?.insuranceRecords ?? []).map((record) => parseOfficialInteger(record.fields[4]) ?? 0);
    const publicPrescriptionCounts = (group?.publicExpenseRecords ?? []).map((record) => parseOfficialInteger(record.fields[3]) ?? 0);
    const publicTotalPoints = (group?.publicExpenseRecords ?? []).map((record) => parseOfficialInteger(record.fields[4]) ?? 0);
    const itemIssueStart = issues.length;

    if (bodyPointTotal !== expectedClaimTotalPoints) {
      addOfficialReconciliationIssue(issues, {
        severity: 'error',
        code: 'official_uke_body_points_mismatch',
        title: '本文点数合計が請求点数と一致しません',
        message: `${result?.patientName ?? claimInput?.common.patientName ?? `レセプト${claimNumber}`} の本文点数は${bodyPointTotal}点ですが、請求点数は${expectedClaimTotalPoints}点です。`,
        claimNumber,
        visitId: result?.visitId,
        patientName: result?.patientName ?? claimInput?.common.patientName,
        expected: expectedClaimTotalPoints,
        actual: bodyPointTotal
      });
    }

    for (const count of insurancePrescriptionCounts) {
      if (count !== prescriptionRecordCount) {
        addOfficialReconciliationIssue(issues, {
          severity: 'error',
          code: 'official_uke_insurance_prescription_count_mismatch',
          title: 'HO処方箋受付回数がSH件数と一致しません',
          message: `${result?.patientName ?? claimInput?.common.patientName ?? `レセプト${claimNumber}`} のHO受付回数は${count}件ですが、SHは${prescriptionRecordCount}件です。`,
          claimNumber,
          visitId: result?.visitId,
          patientName: result?.patientName ?? claimInput?.common.patientName,
          expected: prescriptionRecordCount,
          actual: count
        });
      }
    }

    for (const points of insuranceTotalPoints) {
      if (points !== expectedClaimTotalPoints) {
        addOfficialReconciliationIssue(issues, {
          severity: 'error',
          code: 'official_uke_insurance_total_points_mismatch',
          title: 'HO保険総点数が請求点数と一致しません',
          message: `${result?.patientName ?? claimInput?.common.patientName ?? `レセプト${claimNumber}`} のHO保険総点数は${points}点ですが、請求点数は${expectedClaimTotalPoints}点です。`,
          claimNumber,
          visitId: result?.visitId,
          patientName: result?.patientName ?? claimInput?.common.patientName,
          expected: expectedClaimTotalPoints,
          actual: points
        });
      }
    }

    for (const count of publicPrescriptionCounts) {
      if (count !== prescriptionRecordCount) {
        addOfficialReconciliationIssue(issues, {
          severity: 'error',
          code: 'official_uke_public_prescription_count_mismatch',
          title: 'KO公費処方箋受付回数がSH件数と一致しません',
          message: `${result?.patientName ?? claimInput?.common.patientName ?? `レセプト${claimNumber}`} のKO受付回数は${count}件ですが、SHは${prescriptionRecordCount}件です。`,
          claimNumber,
          visitId: result?.visitId,
          patientName: result?.patientName ?? claimInput?.common.patientName,
          expected: prescriptionRecordCount,
          actual: count
        });
      }
    }

    for (const points of publicTotalPoints) {
      if (points !== expectedClaimTotalPoints) {
        addOfficialReconciliationIssue(issues, {
          severity: 'error',
          code: 'official_uke_public_total_points_mismatch',
          title: 'KO公費総点数が請求点数と一致しません',
          message: `${result?.patientName ?? claimInput?.common.patientName ?? `レセプト${claimNumber}`} のKO公費総点数は${points}点ですが、請求点数は${expectedClaimTotalPoints}点です。`,
          claimNumber,
          visitId: result?.visitId,
          patientName: result?.patientName ?? claimInput?.common.patientName,
          expected: expectedClaimTotalPoints,
          actual: points
        });
      }
    }

    const issueCount = issues.length - itemIssueStart;
    items.push({
      claimNumber,
      visitId: result?.visitId ?? '',
      patientId: result?.patientId ?? '',
      patientName: result?.patientName ?? claimInput?.common.patientName ?? '',
      ok: issueCount === 0,
      supplementalRecordCount,
      dispensingDateRecordCount,
      prescriptionRecordCount,
      dispensingRecordCount,
      drugRecordCount,
      materialRecordCount,
      commentRecordCount,
      managementRecordCount,
      copaymentRecordCount,
      splitRecordCount,
      calculationItemCount,
      bodyPointTotal,
      expectedTotalPoints: expectedClaimTotalPoints,
      insurancePrescriptionCounts,
      insuranceTotalPoints,
      publicPrescriptionCounts,
      publicTotalPoints,
      issueCount
    });
  }

  const totalBodyRecordCount = groups.reduce((sum, group) => sum + group.bodyRecords.length, 0);
  const totalSupplementalRecordCount = items.reduce((sum, item) => sum + item.supplementalRecordCount, 0);
  const totalDispensingDateRecordCount = items.reduce((sum, item) => sum + item.dispensingDateRecordCount, 0);
  const totalPrescriptionRecordCount = items.reduce((sum, item) => sum + item.prescriptionRecordCount, 0);
  const totalDispensingRecordCount = items.reduce((sum, item) => sum + item.dispensingRecordCount, 0);
  const totalDrugRecordCount = items.reduce((sum, item) => sum + item.drugRecordCount, 0);
  const totalMaterialRecordCount = items.reduce((sum, item) => sum + item.materialRecordCount, 0);
  const totalCommentRecordCount = items.reduce((sum, item) => sum + item.commentRecordCount, 0);
  const totalManagementRecordCount = items.reduce((sum, item) => sum + item.managementRecordCount, 0);
  const totalCopaymentRecordCount = items.reduce((sum, item) => sum + item.copaymentRecordCount, 0);
  const totalSplitRecordCount = items.reduce((sum, item) => sum + item.splitRecordCount, 0);
  const totalCalculationItemCount = items.reduce((sum, item) => sum + item.calculationItemCount, 0);
  const totalBodyPointTotal = items.reduce((sum, item) => sum + item.bodyPointTotal, 0);
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

  return {
    ok: errorCount === 0,
    totalClaims: groups.length,
    expectedTotalClaims,
    goClaimCount,
    totalPoints: expectedTotalPoints,
    expectedTotalPoints,
    goTotalPoints,
    totalRecordCount: records.length,
    totalBodyRecordCount,
    totalSupplementalRecordCount,
    totalDispensingDateRecordCount,
    totalPrescriptionRecordCount,
    totalDispensingRecordCount,
    totalDrugRecordCount,
    totalMaterialRecordCount,
    totalCommentRecordCount,
    totalManagementRecordCount,
    totalCopaymentRecordCount,
    totalSplitRecordCount,
    totalCalculationItemCount,
    totalBodyPointTotal,
    issueCount: issues.length,
    errorCount,
    warningCount,
    items,
    issues
  };
}

function buildMonthlyClaimOfficialBodyRecords(claim: MonthlyClaimUkeCase): UkeRecord[] {
  const prescriptionDate = calendarDate(firstDateLike(claim.visit.prescriptionDate, claim.visit.issueDate), '処方年月日');
  const dispensingDate = calendarDate(firstDateLike(claim.visit.dispensingDate, claim.visit.issueDate), '調剤年月日');
  const drugItemGroups = groupOfficialDrugItems(claim);
  const drugItems = drugItemGroups.flatMap((group) => group.items);
  const preparationFee = firstOfficialFee(claim, ['drug_preparation']);
  if (drugItems.length > 0 && !preparationFee) {
    throw new Error(`${claim.patient.name} の公式UKE本文に必要な薬剤調製料コードを確認してください。`);
  }
  const preparationAdditions = officialFeeItems(claim, ['ippoka', 'mixing']).map(toOfficialCodePoint);
  const dispensingManagementFee = firstOfficialFee(claim, ['dispensing_management']);
  const drugFee = claim.calculatedFees.find((fee) => fee.code === 'drug_fee');
  const baseFee = firstOfficialFee(claim, ['base_fee']);
  const baseFeeAdditions = officialFeeItems(claim, ['base_additions']).map(toOfficialCodeCountPoint);
  const managementFees = officialFeeItems(claim, ['medication_guidance', 'special_management']).map(toOfficialCodeCountPoint);
  const drugFeePointsByGroup = allocateGroupFeePoints(
    claim,
    drugItemGroups,
    dispensingDate,
    drugFee?.points ?? 0,
    'drug_fee'
  );
  const preparationFeePointsByGroup = allocateGroupFeePoints(
    claim,
    drugItemGroups,
    dispensingDate,
    preparationFee?.points ?? 0,
    'drug_preparation'
  );

  const prescriptions = preparationFee && drugItemGroups.length > 0
    ? drugItemGroups.map((group, index) => {
        const receptionCount = index + 1;
        return {
          basic: {
            dosageFormCode: deriveOfficialDosageFormCode(group.items),
            unitDrugPoints: drugFeePointsByGroup[index] ?? 0
          },
          dispensingGroups: [{
            dispensing: {
              prescriptionDate,
              dispensingDate,
              receptionCount,
              quantity: getOfficialDispensingQuantity(group.items),
              burdenCategory: '1',
              calculationCategory: '1',
              calculationDestinationNumber: receptionCount,
              dispensingFeeCode: String(preparationFee.receiptFeeCode),
              dispensingFeePoints: preparationFeePointsByGroup[index] ?? 0,
              drugPoints: drugFeePointsByGroup[index] ?? 0,
              additions: index === 0 ? preparationAdditions : [],
              dispensingManagement: index === 0 && dispensingManagementFee
                ? {
                    burdenCategory: '1',
                    calculationCategory: '1',
                    calculationDestinationNumber: 1,
                    code: String(dispensingManagementFee.receiptFeeCode),
                    points: dispensingManagementFee.points
                  }
                : undefined
            },
            drugs: group.items.map((item) => ({
              burdenCategory: '1',
              receiptDrugCode: requireDigits(item.dispensedDrugCode || item.drugId, `${item.drugName || item.dispensedDrug || item.drugId} のレセ電医薬品コード`, [9]),
              amount: item.amount
            }))
          }]
        };
      })
    : [];

  const managementFeeRecords = baseFee || managementFees.length > 0 || baseFeeAdditions.length > 0
    ? [{
        calculationDate: dispensingDate,
        dispensingMonth: calendarMonth(dispensingDate, 'KI調剤年月'),
        receptionCount: 1,
        baseFee: baseFee ? toOfficialCodePoint(baseFee) : undefined,
        managementFees,
        baseFeeAdditions
      }]
    : [];

  const bodyRecords = buildDispensingUkeOfficialClaimBody({
    prescriptions,
    managementFeeRecords
  });
  return [
    ...buildMonthlyClaimOfficialSupplementalRecords(claim),
    ...buildMonthlyClaimOfficialDispensingDateRecords(claim),
    ...bodyRecords,
    ...buildMonthlyClaimOfficialCopaymentRecords(claim),
    ...buildMonthlyClaimOfficialSplitDispensingRecords(claim, prescriptionDate, dispensingDate)
  ];
}

function buildMonthlyClaimOfficialClaimInput(
  claim: MonthlyClaimUkeCase,
  result: MonthlyClaimUkeBuildResult,
  claimNumber: number
): DispensingUkeOfficialClaimInput {
  const dispensingDate = calendarDate(firstDateLike(claim.visit.dispensingDate, claim.visit.issueDate), '調剤年月日');
  const insuranceInfo = claim.patient.insuranceInfo;
  const prescriptionCount = officialPrescriptionCount(claim);

  return {
    common: {
      claimNumber,
      claimTypeCode: deriveOfficialClaimTypeCode(claim),
      dispensingMonth: calendarMonth(dispensingDate, '調剤年月'),
      patientName: claim.patient.name,
      genderCode: toOfficialGenderCode(claim.patient),
      birthDate: calendarDate(claim.patient.birthDate, '生年月日')
    },
    insurances: insuranceInfo?.provider
      ? [{
          insurerNumber: requireDigits(insuranceInfo.provider, '保険者番号', [6, 8]),
          number: insuranceInfo.number || '',
          prescriptionCount,
          totalPoints: result.totalPoints
        }]
      : [],
    publicExpenses: (claim.patient.publicInsurances || []).map((insurance) => ({
      payerNumber: requireDigits(insurance.provider, '公費負担者番号', [8]),
      recipientNumber: requireDigits(insurance.recipient, '公費受給者番号', [7]),
      prescriptionCount,
      totalPoints: result.totalPoints
    })),
    bodyRecords: buildMonthlyClaimOfficialBodyRecords(claim),
    totalPoints: result.totalPoints
  };
}

export function buildMonthlyClaimUkeOfficialReadinessReport(
  claim: MonthlyClaimUkeCase
): MonthlyClaimUkeOfficialReadinessReport {
  const issues: MonthlyClaimUkeOfficialReadinessIssue[] = [];
  const visitId = claim.visit.visitId;
  const patientName = claim.patient.name;
  const prescriptionDateSource = firstDateLike(claim.visit.prescriptionDate, claim.visit.issueDate);
  const dispensingDateSource = firstDateLike(claim.visit.dispensingDate, claim.visit.issueDate);
  const checkedFees = claim.calculatedFees.filter((fee) => (
    fee.code !== undefined
    && fee.code !== 'drug_fee'
    && MONTHLY_CLAIM_UKE_OFFICIAL_FEE_RECORD_TYPES[fee.code] !== undefined
  ));
  const checkedDrugItems = claim.items.filter((item) => item.claimDrugFee !== false);

  if (claim.patient.gender !== 'male' && claim.patient.gender !== 'female') {
    addOfficialReadinessIssue(issues, {
      severity: 'error',
      code: 'official_uke_patient_gender_missing',
      title: '公式UKEの性別コードが確定できません',
      message: `${patientName} の性別を男性または女性として確認してください。公式REレコードでは性別コードが必要です。`,
      visitId,
      patientName
    });
  }

  if (!prescriptionDateSource) {
    addOfficialReadinessIssue(issues, {
      severity: 'error',
      code: 'official_uke_prescription_date_missing',
      title: '処方年月日が確定できません',
      message: `${patientName} の処方年月日を確認してください。公式CZレコードでは和暦の処方年月日が必要です。`,
      visitId,
      patientName
    });
  }

  if (!dispensingDateSource) {
    addOfficialReadinessIssue(issues, {
      severity: 'error',
      code: 'official_uke_dispensing_date_missing',
      title: '調剤年月日が確定できません',
      message: `${patientName} の調剤年月日を確認してください。公式CZ/KIレコードでは調剤日または算定日が必要です。`,
      visitId,
      patientName
    });
  }

  const prescriptionGroupPlan = prescriptionDateSource && dispensingDateSource
    ? buildMonthlyClaimOfficialPrescriptionGroupPlan(claim)
    : undefined;
  const prescriptionNumbers = prescriptionGroupPlan
    ? prescriptionGroupPlan.items.map((item) => item.rpNumber)
    : officialPrescriptionNumbers(claim);
  if (prescriptionNumbers.length > 1) {
    const planText = prescriptionGroupPlan
      ? `公式処方番号 ${prescriptionGroupPlan.items.map((item) => item.officialPrescriptionNumber).join('・')}、受付回 ${prescriptionGroupPlan.items.map((item) => item.receptionCount).join('・')}、処方箋交付 ${prescriptionGroupPlan.items[0]?.prescriptionDate.replace(/-/g, '')}、調剤 ${prescriptionGroupPlan.items[0]?.dispensingDate.replace(/-/g, '')}として確認します。`
      : '';
    addOfficialReadinessIssue(issues, {
      severity: 'warning',
      code: 'official_uke_multiple_prescription_group_unconfirmed',
      title: '複数処方グループの公式UKE配分を確認できます',
      message: `${patientName} はRP ${prescriptionNumbers.join('・')} の複数処方グループがあります。${planText}公式提出用UKEでは薬剤料と薬剤調製料を処方グループ別に配分し、TK/GO集計の確認事項として残します。`,
      visitId,
      patientName,
      prescriptionGroupCount: prescriptionNumbers.length,
      rpNumbers: prescriptionNumbers
    });
  }

  let readyFeeCount = 0;
  for (const fee of checkedFees) {
    const expectedRecordType = MONTHLY_CLAIM_UKE_OFFICIAL_FEE_RECORD_TYPES[fee.code!];
    const receiptFeeCode = String(fee.receiptFeeCode || '').trim();
    if (!receiptFeeCode) {
      addOfficialReadinessIssue(issues, {
        severity: 'error',
        code: 'official_uke_fee_code_missing',
        title: '公式算定コードが未設定です',
        message: `${patientName} の ${fee.name} に9桁の公式算定コードを紐づけてください。公式${expectedRecordType}レコードへ変換できません。`,
        visitId,
        patientName,
        feeCode: fee.code,
        feeName: fee.name,
        expectedRecordType
      });
      continue;
    }
    if (!isReceiptCode(receiptFeeCode)) {
      addOfficialReadinessIssue(issues, {
        severity: 'error',
        code: 'official_uke_fee_code_invalid',
        title: '公式算定コードの桁数が不正です',
        message: `${patientName} の ${fee.name} は9桁の公式算定コードで入力してください。現在の値: ${receiptFeeCode}`,
        visitId,
        patientName,
        feeCode: fee.code,
        feeName: fee.name,
        expectedRecordType
      });
      continue;
    }
    readyFeeCount += 1;
  }

  let readyDrugItemCount = 0;
  for (const item of checkedDrugItems) {
    const receiptDrugCode = String(item.dispensedDrugCode || item.drugId || '').trim();
    const drugName = item.drugName || item.dispensedDrug || item.drugId;
    if (!receiptDrugCode) {
      addOfficialReadinessIssue(issues, {
        severity: 'error',
        code: 'official_uke_drug_code_missing',
        title: 'レセ電医薬品コードが未設定です',
        message: `${patientName} の ${drugName} に9桁のレセ電医薬品コードを設定してください。公式IYレコードへ変換できません。`,
        visitId,
        patientName,
        itemId: item.itemId,
        drugName
      });
      continue;
    }
    if (!isReceiptCode(receiptDrugCode)) {
      addOfficialReadinessIssue(issues, {
        severity: 'error',
        code: 'official_uke_drug_code_invalid',
        title: 'レセ電医薬品コードの桁数が不正です',
        message: `${patientName} の ${drugName} は9桁のレセ電医薬品コードで入力してください。現在の値: ${receiptDrugCode}`,
        visitId,
        patientName,
        itemId: item.itemId,
        drugName
      });
      continue;
    }
    readyDrugItemCount += 1;
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

  return {
    ok: errorCount === 0,
    visitId,
    patientId: claim.patient.patientId,
    patientName,
    checkedFeeCount: checkedFees.length,
    readyFeeCount,
    checkedDrugItemCount: checkedDrugItems.length,
    readyDrugItemCount,
    issueCount: issues.length,
    errorCount,
    warningCount,
    issues
  };
}

export function buildMonthlyClaimUkeResults(
  claims: MonthlyClaimUkeCase[],
  generatedAt = new Date(),
  options: MonthlyClaimUkeBuildOptions = {}
): MonthlyClaimUkeBuildResult[] {
  return claims.map((claim) => {
    const records = buildDispensingUkeRecords({
      visit: claim.visit,
      patient: claim.patient,
      settings: claim.settings,
      items: claim.items,
      calculatedFees: claim.calculatedFees,
      interventions: claim.interventions || [],
      generatedAt
    });
    const validationOptions = { recordSpecs: options.recordSpecs };
    return {
      visitId: claim.visit.visitId,
      patientId: claim.patient.patientId,
      patientName: claim.patient.name,
      insuranceType: claim.patient.insuranceInfo?.insuranceType,
      insuranceProvider: claim.patient.insuranceInfo?.provider,
      claimStatus: getClaimLifecycleStatus(claim.visit.claimLifecycle),
      rebillingReason: claim.visit.claimLifecycle?.rebillingReason,
      totalPoints: claim.calculatedFees.reduce((sum, fee) => sum + fee.points, 0),
      records,
      issues: validateDispensingUkeRecords(records, validationOptions),
      allFieldValidationReport: buildDispensingUkeAllFieldValidationReport(records, validationOptions),
      officialReadinessReport: buildMonthlyClaimUkeOfficialReadinessReport(claim)
    };
  });
}

export function getMonthlyClaimUkeIssues(
  results: MonthlyClaimUkeBuildResult[],
  severity: DispensingUkeValidationIssue['severity']
): Array<MonthlyClaimUkeBuildResult & { filteredIssues: DispensingUkeValidationIssue[] }> {
  return results
    .map((result) => ({
      ...result,
      filteredIssues: result.issues.filter((issue) => issue.severity === severity)
    }))
    .filter((result) => result.filteredIssues.length > 0);
}

export function formatMonthlyClaimUkeIssues(
  results: Array<MonthlyClaimUkeBuildResult & { filteredIssues: DispensingUkeValidationIssue[] }>,
  limit = 8
): string {
  const lines: string[] = [];
  for (const result of results.slice(0, limit)) {
    const issueTitles = result.filteredIssues.slice(0, 3).map((issue) => issue.title).join(' / ');
    lines.push(`${result.patientName}: ${issueTitles}`);
  }
  if (results.length > limit) {
    lines.push(`ほか${results.length - limit}件`);
  }
  return lines.join('\n');
}

export function getMonthlyClaimUkeAllFieldIssues(
  results: MonthlyClaimUkeBuildResult[]
): MonthlyClaimUkeAllFieldIssue[] {
  return results.flatMap((result) => (
    result.allFieldValidationReport.items
      .filter((item) => item.status !== 'ok')
      .map((item) => ({
        sourceLabel: result.allFieldValidationReport.source.label,
        sourceUrl: result.allFieldValidationReport.source.url,
        visitId: result.visitId,
        patientId: result.patientId,
        patientName: result.patientName,
        recordIndex: item.recordIndex,
        recordType: item.recordType,
        itemNumber: item.itemNumber,
        label: item.label,
        required: item.required,
        format: item.format,
        valuePresent: item.valuePresent,
        status: item.status,
        statusLabel: item.statusLabel,
        issueCodes: [...item.issueCodes],
        issueMessages: [...item.issueMessages]
      }))
  ));
}

export function formatMonthlyClaimUkeAllFieldIssues(
  issues: MonthlyClaimUkeAllFieldIssue[],
  limit = 8
): string {
  const lines = issues.slice(0, limit).map((issue) => (
    `${issue.patientName}: ${issue.recordType} ${issue.itemNumber} ${issue.label} ${issue.statusLabel}`
  ));
  if (issues.length > limit) {
    lines.push(`ほか${issues.length - limit}件`);
  }
  return lines.join('\n');
}

export function buildMonthlyClaimUkeAllFieldSourceSummary(
  results: MonthlyClaimUkeBuildResult[]
): MonthlyClaimUkeAllFieldSourceSummary {
  const reports = results.map((result) => result.allFieldValidationReport);
  const firstReport = reports[0];

  return {
    sourceLabel: firstReport?.source.label ?? DISPENSING_UKE_RECORD_SPEC_SOURCE.label,
    sourceUrl: firstReport?.source.url ?? DISPENSING_UKE_RECORD_SPEC_SOURCE.url,
    definedAllFieldCount: Math.max(0, ...reports.map((report) => report.definedAllFieldCount)),
    definedAllFieldRecordTypes: sortedUnique(reports.flatMap((report) => report.definedAllFieldRecordTypes)),
    checkedFieldCount: reports.reduce((sum, report) => sum + report.checkedFieldCount, 0),
    issueFieldCount: reports.reduce((sum, report) => sum + report.issueFieldCount, 0),
    missingFieldCount: reports.reduce((sum, report) => sum + report.missingFieldCount, 0),
    formatIssueFieldCount: reports.reduce((sum, report) => sum + report.formatIssueFieldCount, 0),
    recordTypes: sortedUnique(reports.flatMap((report) => report.recordTypes)),
    recordTypesWithIssues: sortedUnique(reports.flatMap((report) => report.recordTypesWithIssues))
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text.trimStart())) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

const MONTHLY_CLAIM_OFFICIAL_SUBMISSION_TRIAL_PAYER_LABELS: Record<MonthlyClaimOfficialSubmissionTrialPayer, string> = {
  social_insurance: '社保系',
  national_insurance: '国保系'
};

const MONTHLY_CLAIM_OFFICIAL_SUBMISSION_TRIAL_RESULT_LABELS: Record<MonthlyClaimOfficialSubmissionTrialResult, string> = {
  not_submitted: '未提出',
  accepted: '受付済',
  accepted_with_warnings: '受付済（要確認あり）',
  rejected: '受付NG'
};

const MONTHLY_CLAIM_OFFICIAL_SUBMISSION_REQUIRED_PAYERS: MonthlyClaimOfficialSubmissionTrialPayer[] = [
  'social_insurance',
  'national_insurance'
];

function officialSubmissionTrialPayerFromCode(code: string | undefined): MonthlyClaimOfficialSubmissionTrialPayer {
  return code === '2' ? 'national_insurance' : 'social_insurance';
}

function officialSubmissionTrialPayerCode(payer: MonthlyClaimOfficialSubmissionTrialPayer): '1' | '2' {
  return payer === 'national_insurance' ? '2' : '1';
}

function addOfficialSubmissionTrialIssue(
  issues: MonthlyClaimOfficialSubmissionTrialIssue[],
  issue: MonthlyClaimOfficialSubmissionTrialIssue
): void {
  issues.push(issue);
}

function resolveOfficialSubmissionTrialSource(input: MonthlyClaimOfficialSubmissionTrialInput): {
  payer: MonthlyClaimOfficialSubmissionTrialPayer;
  fileName: string;
  totalClaims: number;
  totalPoints: number;
  goClaimCount: number | undefined;
  goTotalPoints: number | undefined;
  recordCount: number;
  reconciliationOk: boolean;
} {
  if (input.bundle) {
    return {
      payer: officialSubmissionTrialPayerFromCode(input.bundle.records.find((record) => record.type === 'YK')?.fields[0]),
      fileName: input.bundle.fileName,
      totalClaims: input.bundle.totalClaims,
      totalPoints: input.bundle.totalPoints,
      goClaimCount: input.bundle.officialReconciliationReport.goClaimCount,
      goTotalPoints: input.bundle.officialReconciliationReport.goTotalPoints,
      recordCount: input.bundle.records.length,
      reconciliationOk: input.bundle.officialReconciliationReport.ok
    };
  }

  return {
    payer: input.payer,
    fileName: input.bundleSummary.fileName,
    totalClaims: input.bundleSummary.totalClaims,
    totalPoints: input.bundleSummary.totalPoints,
    goClaimCount: input.bundleSummary.goClaimCount,
    goTotalPoints: input.bundleSummary.goTotalPoints,
    recordCount: input.bundleSummary.recordCount,
    reconciliationOk: input.bundleSummary.reconciliationOk
  };
}

function officialSubmissionTrialKnownPersonalValues(
  input: MonthlyClaimOfficialSubmissionTrialInput
): string[] {
  return input.bundle?.results.flatMap((result) => [
    result.patientId,
    result.patientName,
    result.visitId
  ]).map((value) => String(value ?? '').trim()).filter((value) => value.length >= 3) ?? [];
}

function containsKnownPersonalValue(value: string, knownPersonalValues: string[]): boolean {
  return knownPersonalValues.some((personalValue) => value.includes(personalValue));
}

function redactKnownPersonalValue(value: string, knownPersonalValues: string[]): string {
  return containsKnownPersonalValue(value, knownPersonalValues)
    ? '[患者情報を検出したため非表示]'
    : value;
}

function summarizeEvidenceIntegrityStatus(
  reviews: EvidenceIntegrityReview[]
): EvidenceIntegrityStatus {
  if (reviews.some((review) => review.status === 'blocked')) return 'blocked';
  if (reviews.some((review) => review.status === 'attention')) return 'attention';
  return 'pass';
}

export function buildMonthlyClaimOfficialSubmissionTrialReport(
  inputs: MonthlyClaimOfficialSubmissionTrialInput[],
  requiredPayers: MonthlyClaimOfficialSubmissionTrialPayer[] = MONTHLY_CLAIM_OFFICIAL_SUBMISSION_REQUIRED_PAYERS
): MonthlyClaimOfficialSubmissionTrialReport {
  const issues: MonthlyClaimOfficialSubmissionTrialIssue[] = [];
  const items = inputs.map((input): MonthlyClaimOfficialSubmissionTrialItem => {
    const source = resolveOfficialSubmissionTrialSource(input);
    const payer = source.payer;
    const payerLabel = MONTHLY_CLAIM_OFFICIAL_SUBMISSION_TRIAL_PAYER_LABELS[payer];
    const knownPersonalValues = officialSubmissionTrialKnownPersonalValues(input);
    const rawFileName = String(input.submissionFileName || source.fileName || '').trim();
    const rawSubmittedTo = String(input.submittedTo || '').trim();
    const rawCheckedAt = String(input.checkedAt || '').trim();
    const rawAcceptanceId = String(input.acceptanceId || '').trim();
    const rawResultFileName = String(input.resultFileName || '').trim();
    const rawCheckedBy = String(input.checkedBy || '').trim();
    const rawMemo = String(input.memo || '').trim();
    const fileName = redactKnownPersonalValue(rawFileName, knownPersonalValues);
    const submittedTo = redactKnownPersonalValue(rawSubmittedTo, knownPersonalValues);
    const checkedAt = redactKnownPersonalValue(rawCheckedAt, knownPersonalValues);
    const acceptanceId = redactKnownPersonalValue(rawAcceptanceId, knownPersonalValues);
    const resultFileName = redactKnownPersonalValue(rawResultFileName, knownPersonalValues);
    const checkedBy = redactKnownPersonalValue(rawCheckedBy, knownPersonalValues);
    const memo = redactKnownPersonalValue(rawMemo, knownPersonalValues);
    const containsKnownPersonalInfo = [
      rawFileName,
      rawSubmittedTo,
      rawCheckedAt,
      rawAcceptanceId,
      rawResultFileName,
      rawCheckedBy,
      rawMemo
    ].some((value) => containsKnownPersonalValue(value, knownPersonalValues));
    const evidenceMetadata = { ...input } as Record<string, unknown>;
    delete evidenceMetadata.bundle;
    const evidenceIntegrity = buildEvidenceIntegrityReview({
      evidenceId: acceptanceId || `${payer}-official-submission`,
      claimKind: 'official_claim_submission',
      evidence: {
        ...evidenceMetadata,
        submissionFileName: rawFileName
      },
      noPatientDataExpected: true,
      realWorldEvidenceRequired: true
    });
    const itemIssueStart = issues.length;

    if (!submittedTo) {
      addOfficialSubmissionTrialIssue(issues, {
        severity: 'error',
        code: 'official_submission_trial_destination_missing',
        title: '提出先が未入力です',
        message: `${payerLabel}の現物提出試験は提出先を記録してください。`,
        payer,
        fileName
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}/.test(checkedAt)) {
      addOfficialSubmissionTrialIssue(issues, {
        severity: 'error',
        code: 'official_submission_trial_checked_at_missing',
        title: '確認日が未入力です',
        message: `${payerLabel}の現物提出試験は確認日をYYYY-MM-DD形式で記録してください。`,
        payer,
        fileName
      });
    }

    if (input.result === 'not_submitted') {
      addOfficialSubmissionTrialIssue(issues, {
        severity: 'error',
        code: 'official_submission_trial_not_submitted',
        title: '受付結果が未提出です',
        message: `${payerLabel}の公式UKEは、受付結果が入るまで現物提出試験を完了扱いにできません。`,
        payer,
        fileName
      });
    }

    if (input.result === 'rejected') {
      addOfficialSubmissionTrialIssue(issues, {
        severity: 'error',
        code: 'official_submission_trial_rejected',
        title: '受付結果がNGです',
        message: `${payerLabel}の受付NGは、原因と修正後UKE差分をP1-06-02の回帰テストへ変換してください。`,
        payer,
        fileName
      });
    }

    if (!source.reconciliationOk) {
      addOfficialSubmissionTrialIssue(issues, {
        severity: 'error',
        code: 'official_submission_trial_reconciliation_failed',
        title: '公式UKE集計突合が未解決です',
        message: `${payerLabel}の現物提出試験前にGO件数、GO総合計点数、本文点数の突合を解消してください。`,
        payer,
        fileName
      });
    }

    if (containsKnownPersonalInfo) {
      addOfficialSubmissionTrialIssue(issues, {
        severity: 'error',
        code: 'official_submission_trial_personal_info_detected',
        title: '患者情報らしき値が含まれています',
        message: `${payerLabel}の提出試験メモやファイル名に、受付ID、患者ID、患者名を含めないでください。`,
        payer,
        fileName
      });
    }

    if (evidenceIntegrity.status !== 'pass') {
      addOfficialSubmissionTrialIssue(issues, {
        severity: 'error',
        code: 'official_submission_trial_evidence_integrity',
        title: evidenceIntegrity.status === 'blocked'
          ? '提出試験証跡を使用できません'
          : '提出試験証跡の出所が不足しています',
        message: evidenceIntegrity.requiredActions.join(' / ') || '提出試験証跡の出所と患者情報なし確認を見直してください。',
        payer,
        fileName
      });
    }

    return {
      payer,
      payerLabel,
      payerOrganizationCode: officialSubmissionTrialPayerCode(payer),
      fileName,
      submittedTo,
      checkedAt,
      result: input.result,
      resultLabel: MONTHLY_CLAIM_OFFICIAL_SUBMISSION_TRIAL_RESULT_LABELS[input.result],
      acceptanceId,
      resultFileName,
      checkedBy,
      memo,
      totalClaims: source.totalClaims,
      totalPoints: source.totalPoints,
      goClaimCount: source.goClaimCount,
      goTotalPoints: source.goTotalPoints,
      recordCount: source.recordCount,
      reconciliationOk: source.reconciliationOk,
      issueCount: issues.length - itemIssueStart,
      evidenceIntegrity
    };
  });

  const coveredPayers = requiredPayers.filter((payer) => items.some((item) => item.payer === payer));
  const missingPayers = requiredPayers.filter((payer) => !coveredPayers.includes(payer));
  for (const payer of missingPayers) {
    addOfficialSubmissionTrialIssue(issues, {
      severity: 'error',
      code: payer === 'social_insurance'
        ? 'official_submission_trial_social_missing'
        : 'official_submission_trial_national_missing',
      title: `${MONTHLY_CLAIM_OFFICIAL_SUBMISSION_TRIAL_PAYER_LABELS[payer]}の提出試験が未記録です`,
      message: `${MONTHLY_CLAIM_OFFICIAL_SUBMISSION_TRIAL_PAYER_LABELS[payer]}の公式UKEファイル、受付結果、確認メモを分けて残してください。`,
      payer
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  const acceptedTrialCount = items.filter((item) => item.result === 'accepted' || item.result === 'accepted_with_warnings').length;
  const rejectedTrialCount = items.filter((item) => item.result === 'rejected').length;
  const notSubmittedTrialCount = items.filter((item) => item.result === 'not_submitted').length;
  const evidenceIntegrityStatus = summarizeEvidenceIntegrityStatus(items.map((item) => item.evidenceIntegrity));
  const evidenceIntegrityIssueCount = items.reduce(
    (sum, item) => sum + item.evidenceIntegrity.issues.length,
    0
  );

  return {
    ok: errorCount === 0 && missingPayers.length === 0,
    totalTrials: items.length,
    requiredPayers,
    coveredPayers,
    missingPayers,
    missingLabels: missingPayers.map((payer) => MONTHLY_CLAIM_OFFICIAL_SUBMISSION_TRIAL_PAYER_LABELS[payer]),
    acceptedTrialCount,
    rejectedTrialCount,
    notSubmittedTrialCount,
    totalClaims: items.reduce((sum, item) => sum + item.totalClaims, 0),
    totalPoints: items.reduce((sum, item) => sum + item.totalPoints, 0),
    totalGoClaimCount: items.reduce((sum, item) => sum + (item.goClaimCount ?? 0), 0),
    totalGoPoints: items.reduce((sum, item) => sum + (item.goTotalPoints ?? 0), 0),
    issueCount: issues.length,
    errorCount,
    warningCount,
    evidenceIntegrityStatus,
    evidenceIntegrityIssueCount,
    items,
    issues
  };
}

export function buildMonthlyClaimOfficialSubmissionTrialTemplate(): MonthlyClaimOfficialSubmissionTrialTemplate {
  const trial = (payer: MonthlyClaimOfficialSubmissionTrialPayer): MonthlyClaimOfficialSubmissionTrialTemplate['trials'][number] => ({
    payer,
    bundleSummary: {
      fileName: '',
      totalClaims: 0,
      totalPoints: 0,
      goClaimCount: 0,
      goTotalPoints: 0,
      recordCount: 0,
      reconciliationOk: false
    },
    submissionFileName: '',
    submittedTo: '',
    checkedAt: '',
    result: 'not_submitted',
    acceptanceId: '',
    resultFileName: '',
    checkedBy: '',
    memo: '',
    sourceArtifactSha256: '',
    noPatientDataConfirmed: false
  });

  return {
    type: 'yakureki-official-submission-trial-input-template',
    schemaVersion: 1,
    guidance: [
      '患者名、患者ID、受付ID、生年月日、保険番号、UKE本文は入力しないでください。',
      '社保系と国保系を分け、患者情報なしの集計値と外部受付結果だけを記録してください。',
      '確認日、受付番号、受付結果ファイルのSHA-256、患者情報なし確認が揃わない限り合格しません。',
      'ダミー、モック、サンプル、検証用の受付結果を現物証跡として使わないでください。'
    ],
    trials: [trial('social_insurance'), trial('national_insurance')]
  };
}

export function buildMonthlyClaimOfficialSubmissionTrialCsv(
  report: MonthlyClaimOfficialSubmissionTrialReport
): string {
  const rows = [
    ['区分', '提出先区分', '提出先区分コード', '試験ファイル名', '提出先', '確認日', '受付結果', '受付番号', '受付結果ファイル', '請求件数', '合計点数', 'GO件数', 'GO総合計点数', 'レコード件数', '集計突合', '確認者', '確認メモ（患者情報なし）', '指摘コード', '指摘', '内容', '証跡品質'],
    [
      '総括',
      report.missingLabels.length > 0 ? `不足: ${report.missingLabels.join('・')}` : '社保系・国保系',
      report.coveredPayers.map(officialSubmissionTrialPayerCode).join('・'),
      '',
      '',
      '',
      report.ok ? 'OK' : '要確認',
      '',
      '',
      report.totalClaims,
      report.totalPoints,
      report.totalGoClaimCount,
      report.totalGoPoints,
      '',
      report.items.every((item) => item.reconciliationOk) ? 'OK' : '要確認',
      '',
      '患者名、患者ID、受付IDを含めない',
      '',
      report.ok ? '現物提出試験OK' : '現物提出試験を確認してください',
      '',
      report.evidenceIntegrityStatus
    ],
    ...report.items.map((item) => [
      '試験',
      item.payerLabel,
      item.payerOrganizationCode,
      item.fileName,
      item.submittedTo,
      item.checkedAt,
      item.resultLabel,
      item.acceptanceId,
      item.resultFileName,
      item.totalClaims,
      item.totalPoints,
      item.goClaimCount ?? '',
      item.goTotalPoints ?? '',
      item.recordCount,
      item.reconciliationOk ? 'OK' : '要確認',
      item.checkedBy,
      item.memo,
      '',
      item.issueCount === 0 ? '提出試験証跡OK' : '提出試験証跡を確認',
      '',
      item.evidenceIntegrity.statusLabel
    ]),
    ...report.issues.map((issue) => [
      '指摘',
      issue.payer ? MONTHLY_CLAIM_OFFICIAL_SUBMISSION_TRIAL_PAYER_LABELS[issue.payer] : '',
      issue.payer ? officialSubmissionTrialPayerCode(issue.payer) : '',
      issue.fileName ?? '',
      '',
      '',
      issue.severity === 'error' ? '要確認' : '確認',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      issue.code,
      issue.title,
      issue.message,
      ''
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function formatMonthlyClaimOfficialSubmissionTrialReport(
  report: MonthlyClaimOfficialSubmissionTrialReport
): string {
  const status = report.ok ? 'OK' : '要確認';
  const missingText = report.missingLabels.length > 0 ? ` / 不足 ${report.missingLabels.join('・')}` : '';
  const issueText = report.issueCount > 0 ? ` / 指摘 ${report.issueCount}` : '';
  return `公式UKE現物提出試験: ${status} / 試験 ${report.totalTrials} / 受付OK ${report.acceptedTrialCount}/${report.requiredPayers.length} / GO ${report.totalGoClaimCount}件 ${report.totalGoPoints}点 / 証跡品質 ${report.evidenceIntegrityStatus} / 患者情報なしCSV${missingText}${issueText}`;
}

const MONTHLY_CLAIM_OFFICIAL_RESUBMISSION_TRIGGER_LABELS: Record<MonthlyClaimOfficialResubmissionRegressionTrigger, string> = {
  acceptance_error: '受付NG',
  returned_claim: '返戻'
};

const MONTHLY_CLAIM_OFFICIAL_CORRECTION_CATEGORY_LABELS: Record<MonthlyClaimOfficialCorrectionCategory, string> = {
  insurance: '保険',
  public_expense: '公費',
  prescription: '処方',
  points: '点数',
  record_shape: 'UKE形状',
  other: 'その他'
};

function addOfficialResubmissionRegressionIssue(
  issues: MonthlyClaimOfficialResubmissionRegressionIssue[],
  issue: MonthlyClaimOfficialResubmissionRegressionIssue
): void {
  issues.push(issue);
}

function officialRecordRefEntries(records: UkeRecord[]): Array<{ ref: string; record: UkeRecord }> {
  const counts = new Map<string, number>();
  return records.map((record) => {
    const ordinal = (counts.get(record.type) ?? 0) + 1;
    counts.set(record.type, ordinal);
    return {
      ref: `${record.type}#${ordinal}`,
      record
    };
  });
}

function officialGoCounts(records: UkeRecord[]): {
  goClaimCount: number | undefined;
  goTotalPoints: number | undefined;
} {
  const goRecord = records.find((record) => record.type === 'GO');
  return {
    goClaimCount: parseOfficialInteger(goRecord?.fields[0]),
    goTotalPoints: parseOfficialInteger(goRecord?.fields[1])
  };
}

export function buildMonthlyClaimOfficialUkeDiffSummary(
  beforeRecords: UkeRecord[],
  afterRecords: UkeRecord[]
): MonthlyClaimOfficialUkeDiffSummary {
  const beforeEntries = officialRecordRefEntries(beforeRecords);
  const afterEntries = officialRecordRefEntries(afterRecords);
  const beforeByRef = new Map(beforeEntries.map((entry) => [entry.ref, entry.record]));
  const afterByRef = new Map(afterEntries.map((entry) => [entry.ref, entry.record]));
  const refs = sortedUnique([...beforeByRef.keys(), ...afterByRef.keys()]);
  const addedRecordRefs: string[] = [];
  const removedRecordRefs: string[] = [];
  const changedRecordRefs: string[] = [];
  const changedFieldRefs: string[] = [];

  for (const ref of refs) {
    const before = beforeByRef.get(ref);
    const after = afterByRef.get(ref);
    if (!before && after) {
      addedRecordRefs.push(ref);
      continue;
    }
    if (before && !after) {
      removedRecordRefs.push(ref);
      continue;
    }
    if (!before || !after) continue;

    const maxFieldCount = Math.max(before.fields.length, after.fields.length);
    const fieldDiffStart = changedFieldRefs.length;
    for (let index = 0; index < maxFieldCount; index += 1) {
      if ((before.fields[index] ?? '') !== (after.fields[index] ?? '')) {
        changedFieldRefs.push(`${ref}.${index + 1}`);
      }
    }
    if (changedFieldRefs.length > fieldDiffStart) {
      changedRecordRefs.push(ref);
    }
  }

  const beforeGo = officialGoCounts(beforeRecords);
  const afterGo = officialGoCounts(afterRecords);
  const changedRecordTypes = sortedUnique([
    ...addedRecordRefs,
    ...removedRecordRefs,
    ...changedRecordRefs
  ].map((ref) => ref.split('#')[0] || ref));

  return {
    beforeRecordCount: beforeRecords.length,
    afterRecordCount: afterRecords.length,
    beforeGoClaimCount: beforeGo.goClaimCount,
    beforeGoTotalPoints: beforeGo.goTotalPoints,
    afterGoClaimCount: afterGo.goClaimCount,
    afterGoTotalPoints: afterGo.goTotalPoints,
    goPointDifference: (afterGo.goTotalPoints ?? 0) - (beforeGo.goTotalPoints ?? 0),
    addedRecordRefs,
    removedRecordRefs,
    changedRecordRefs,
    changedRecordTypes,
    changedFieldRefs,
    changedFieldCount: changedFieldRefs.length,
    hasDiff: addedRecordRefs.length > 0 || removedRecordRefs.length > 0 || changedFieldRefs.length > 0
  };
}

function officialResubmissionRegressionIncludesKnownPersonalInfo(
  input: MonthlyClaimOfficialResubmissionRegressionInput
): boolean {
  const fieldsToCheck = [
    input.caseId,
    input.errorCode,
    input.errorTitle,
    input.errorCause,
    input.correctionSummary,
    input.resultFileName,
    input.resubmissionCheckedAt,
    input.resubmissionAcceptanceId,
    input.memo
  ].map((value) => String(value ?? ''));
  const knownPersonalValues = [
    ...input.originalBundle.results,
    ...(input.correctedBundle?.results ?? [])
  ].flatMap((result) => [
    result.patientId,
    result.patientName,
    result.visitId
  ]).filter((value) => String(value || '').length >= 3);

  return knownPersonalValues.some((value) => (
    fieldsToCheck.some((field) => field.includes(String(value)))
  ));
}

export function buildMonthlyClaimOfficialResubmissionRegressionReport(
  inputs: MonthlyClaimOfficialResubmissionRegressionInput[]
): MonthlyClaimOfficialResubmissionRegressionReport {
  const issues: MonthlyClaimOfficialResubmissionRegressionIssue[] = [];
  const items = inputs.map((input): MonthlyClaimOfficialResubmissionRegressionItem => {
    const payer = input.payer
      ?? officialSubmissionTrialPayerFromCode(input.originalBundle.records.find((record) => record.type === 'YK')?.fields[0]);
    const payerLabel = MONTHLY_CLAIM_OFFICIAL_SUBMISSION_TRIAL_PAYER_LABELS[payer];
    const diffSummary = buildMonthlyClaimOfficialUkeDiffSummary(
      input.originalBundle.records,
      input.correctedBundle?.records ?? []
    );
    const itemIssueStart = issues.length;
    const caseId = String(input.caseId || '').trim();

    if (!String(input.errorCode || '').trim()) {
      addOfficialResubmissionRegressionIssue(issues, {
        severity: 'error',
        code: 'official_resubmission_regression_error_code_missing',
        title: '受付/返戻コードが未入力です',
        message: '受付NGまたは返戻理由を、患者情報を含まないコードで記録してください。',
        caseId,
        payer
      });
    }

    if (!input.correctedBundle) {
      addOfficialResubmissionRegressionIssue(issues, {
        severity: 'error',
        code: 'official_resubmission_regression_corrected_uke_missing',
        title: '修正後UKEが未記録です',
        message: `${caseId || '未識別ケース'} の修正後UKEを指定し、修正前後の差分を残してください。`,
        caseId,
        payer
      });
    } else if (!diffSummary.hasDiff) {
      addOfficialResubmissionRegressionIssue(issues, {
        severity: 'error',
        code: 'official_resubmission_regression_no_uke_diff',
        title: '修正前後UKEの差分がありません',
        message: `${caseId || '未識別ケース'} は修正後UKEがありますが、修正前との差分がありません。返戻原因に対応する変更を確認してください。`,
        caseId,
        payer
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}/.test(String(input.resubmissionCheckedAt || ''))) {
      addOfficialResubmissionRegressionIssue(issues, {
        severity: 'error',
        code: 'official_resubmission_regression_checked_at_missing',
        title: '再提出確認日が未入力です',
        message: `${caseId || '未識別ケース'} の再提出確認日をYYYY-MM-DD形式で記録してください。`,
        caseId,
        payer
      });
    }

    if (!input.resubmissionResult) {
      addOfficialResubmissionRegressionIssue(issues, {
        severity: 'error',
        code: 'official_resubmission_regression_result_missing',
        title: '再提出結果が未入力です',
        message: `${caseId || '未識別ケース'} の再提出結果を記録してください。`,
        caseId,
        payer
      });
    } else if (!['accepted', 'accepted_with_warnings'].includes(input.resubmissionResult)) {
      addOfficialResubmissionRegressionIssue(issues, {
        severity: 'error',
        code: 'official_resubmission_regression_not_accepted',
        title: '再提出が受付済になっていません',
        message: `${caseId || '未識別ケース'} は再提出結果が${MONTHLY_CLAIM_OFFICIAL_SUBMISSION_TRIAL_RESULT_LABELS[input.resubmissionResult]}です。受付済になるまで回帰テストを完了扱いにしません。`,
        caseId,
        payer
      });
    }

    if (officialResubmissionRegressionIncludesKnownPersonalInfo(input)) {
      addOfficialResubmissionRegressionIssue(issues, {
        severity: 'error',
        code: 'official_resubmission_regression_personal_info_detected',
        title: '患者情報らしき値が含まれています',
        message: `${caseId || '未識別ケース'} のケースID、原因、修正メモ、結果ファイル名には、受付ID、患者ID、患者名を含めないでください。`,
        caseId,
        payer
      });
    }

    return {
      caseId,
      payer,
      payerLabel,
      trigger: input.trigger,
      triggerLabel: MONTHLY_CLAIM_OFFICIAL_RESUBMISSION_TRIGGER_LABELS[input.trigger],
      originalFileName: input.originalBundle.fileName,
      correctedFileName: input.correctedBundle?.fileName ?? '',
      errorCode: String(input.errorCode || '').trim(),
      errorTitle: String(input.errorTitle || '').trim(),
      errorCause: String(input.errorCause || '').trim(),
      correctionCategory: input.correctionCategory,
      correctionCategoryLabel: MONTHLY_CLAIM_OFFICIAL_CORRECTION_CATEGORY_LABELS[input.correctionCategory],
      correctionSummary: String(input.correctionSummary || '').trim(),
      resultFileName: String(input.resultFileName || '').trim(),
      resubmissionCheckedAt: String(input.resubmissionCheckedAt || '').trim(),
      resubmissionResult: input.resubmissionResult,
      resubmissionResultLabel: input.resubmissionResult
        ? MONTHLY_CLAIM_OFFICIAL_SUBMISSION_TRIAL_RESULT_LABELS[input.resubmissionResult]
        : '未記録',
      resubmissionAcceptanceId: String(input.resubmissionAcceptanceId || '').trim(),
      memo: String(input.memo || '').trim(),
      diffSummary,
      issueCount: issues.length - itemIssueStart
    };
  });

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  const completedCaseCount = items.filter((item) => (
    item.issueCount === 0
    && (item.resubmissionResult === 'accepted' || item.resubmissionResult === 'accepted_with_warnings')
  )).length;

  return {
    ok: errorCount === 0,
    totalCases: items.length,
    completedCaseCount,
    acceptanceErrorCount: items.filter((item) => item.trigger === 'acceptance_error').length,
    returnedClaimCount: items.filter((item) => item.trigger === 'returned_claim').length,
    totalChangedFieldCount: items.reduce((sum, item) => sum + item.diffSummary.changedFieldCount, 0),
    changedRecordTypes: sortedUnique(items.flatMap((item) => item.diffSummary.changedRecordTypes)),
    issueCount: issues.length,
    errorCount,
    warningCount,
    items,
    issues
  };
}

export function buildMonthlyClaimOfficialResubmissionRegressionCsv(
  report: MonthlyClaimOfficialResubmissionRegressionReport
): string {
  const rows = [
    ['区分', 'ケースID', '提出先区分', '発生種別', '修正前ファイル', '修正後ファイル', '受付/返戻コード', '指摘', '原因', '修正分類', '修正内容（患者情報なし）', '結果ファイル', '再提出確認日', '再提出結果', '再提出受付番号', '変更レコード種別', '変更項目数', '変更項目', '追加レコード', '削除レコード', 'GO点数差', '指摘コード', '指摘内容'],
    [
      '総括',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '患者名、患者ID、受付IDを含めない',
      '',
      '',
      report.ok ? 'OK' : '要確認',
      '',
      report.changedRecordTypes.join('・'),
      report.totalChangedFieldCount,
      '',
      '',
      '',
      '',
      '',
      report.ok ? '返戻・再提出回帰OK' : '返戻・再提出回帰を確認してください'
    ],
    ...report.items.map((item) => [
      '回帰',
      item.caseId,
      item.payerLabel,
      item.triggerLabel,
      item.originalFileName,
      item.correctedFileName,
      item.errorCode,
      item.errorTitle,
      item.errorCause,
      item.correctionCategoryLabel,
      item.correctionSummary,
      item.resultFileName,
      item.resubmissionCheckedAt,
      item.resubmissionResultLabel,
      item.resubmissionAcceptanceId,
      item.diffSummary.changedRecordTypes.join('・'),
      item.diffSummary.changedFieldCount,
      item.diffSummary.changedFieldRefs.join('・'),
      item.diffSummary.addedRecordRefs.join('・'),
      item.diffSummary.removedRecordRefs.join('・'),
      item.diffSummary.goPointDifference,
      '',
      item.issueCount === 0 ? '修正前後UKE差分と再提出結果OK' : '修正前後UKE差分と再提出結果を確認'
    ]),
    ...report.issues.map((issue) => [
      '指摘',
      issue.caseId ?? '',
      issue.payer ? MONTHLY_CLAIM_OFFICIAL_SUBMISSION_TRIAL_PAYER_LABELS[issue.payer] : '',
      '',
      '',
      '',
      '',
      issue.title,
      issue.message,
      '',
      '',
      '',
      '',
      issue.severity === 'error' ? '要確認' : '確認',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      issue.code,
      issue.message
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function formatMonthlyClaimOfficialResubmissionRegressionReport(
  report: MonthlyClaimOfficialResubmissionRegressionReport
): string {
  const status = report.ok ? 'OK' : '要確認';
  const recordTypes = report.changedRecordTypes.length > 0
    ? ` / 変更 ${report.changedRecordTypes.join('・')}`
    : '';
  const issueText = report.issueCount > 0 ? ` / 指摘 ${report.issueCount}` : '';
  return `公式UKE返戻・再提出回帰: ${status} / ケース ${report.totalCases} / 完了 ${report.completedCaseCount} / 受付NG ${report.acceptanceErrorCount} / 返戻 ${report.returnedClaimCount} / 変更項目 ${report.totalChangedFieldCount}${recordTypes}${issueText}`;
}

export function buildMonthlyClaimOfficialUkeReconciliationCsv(
  report: MonthlyClaimOfficialUkeReconciliationReport
): string {
  const rows = [
    ['区分', '受付ID', '患者ID', '患者名', '判定', 'レセプト番号', 'SN件数', 'JD件数', 'SH件数', 'CZ件数', 'IY件数', 'TO件数', 'TK件数', 'KI件数', 'MF件数', 'ST件数', '算定項目数', '本文点数', '請求点数', 'HO受付回', 'HO点数', 'KO受付回', 'KO点数', 'GO件数', 'GO総合計点数', '指摘コード', '指摘', '内容'],
    [
      '総括',
      '',
      '',
      '',
      report.ok ? 'OK' : '要確認',
      '',
      report.totalSupplementalRecordCount,
      report.totalDispensingDateRecordCount,
      report.totalPrescriptionRecordCount,
      report.totalDispensingRecordCount,
      report.totalDrugRecordCount,
      report.totalMaterialRecordCount,
      report.totalCommentRecordCount,
      report.totalManagementRecordCount,
      report.totalCopaymentRecordCount,
      report.totalSplitRecordCount,
      report.totalCalculationItemCount,
      report.totalBodyPointTotal,
      report.expectedTotalPoints,
      '',
      '',
      '',
      '',
      report.goClaimCount ?? '',
      report.goTotalPoints ?? '',
      '',
      report.ok ? '公式提出UKE集計OK' : '公式提出UKE集計を確認してください',
      ''
    ],
    ...report.items.map((item) => [
      '受付',
      item.visitId,
      item.patientId,
      item.patientName,
      item.ok ? 'OK' : '要確認',
      item.claimNumber,
      item.supplementalRecordCount,
      item.dispensingDateRecordCount,
      item.prescriptionRecordCount,
      item.dispensingRecordCount,
      item.drugRecordCount,
      item.materialRecordCount,
      item.commentRecordCount,
      item.managementRecordCount,
      item.copaymentRecordCount,
      item.splitRecordCount,
      item.calculationItemCount,
      item.bodyPointTotal,
      item.expectedTotalPoints,
      item.insurancePrescriptionCounts.join('・'),
      item.insuranceTotalPoints.join('・'),
      item.publicPrescriptionCounts.join('・'),
      item.publicTotalPoints.join('・'),
      '',
      '',
      '',
      item.ok ? '本文と点数が一致' : '本文と点数を確認',
      ''
    ]),
    ...report.issues.map((issue) => [
      '指摘',
      issue.visitId ?? '',
      '',
      issue.patientName ?? '',
      issue.severity === 'error' ? '要確認' : '確認',
      issue.claimNumber ?? '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      issue.actual ?? '',
      issue.expected ?? '',
      '',
      '',
      '',
      '',
      report.goClaimCount ?? '',
      report.goTotalPoints ?? '',
      issue.code,
      issue.title,
      issue.message
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildMonthlyClaimUkeAllFieldIssueCsv(
  issues: MonthlyClaimUkeAllFieldIssue[]
): string {
  const rows = [
    ['出典', '出典URL', '受付ID', '患者ID', '患者名', 'レコード位置', 'レコード種別', '項番', '項目名', '必須', '形式', '値あり', '判定', '指摘コード', '指摘内容'],
    ...issues.map((issue) => [
      issue.sourceLabel,
      issue.sourceUrl,
      issue.visitId,
      issue.patientId,
      issue.patientName,
      issue.recordIndex + 1,
      issue.recordType,
      issue.itemNumber,
      issue.label,
      issue.required ? '必須' : '任意',
      issue.format,
      issue.valuePresent ? 'あり' : 'なし',
      issue.statusLabel,
      issue.issueCodes.join(' / '),
      issue.issueMessages.join(' / ')
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function getMonthlyClaimUkeOfficialReadinessIssues(
  results: MonthlyClaimUkeBuildResult[]
): MonthlyClaimUkeOfficialReadinessIssue[] {
  return results.flatMap((result) => result.officialReadinessReport.issues);
}

export function buildMonthlyClaimUkeOfficialReadinessSummary(
  results: MonthlyClaimUkeBuildResult[]
): MonthlyClaimUkeOfficialReadinessSummary {
  const reports = results.map((result) => result.officialReadinessReport);
  const issueClaims = reports.filter((report) => !report.ok).length;
  const checkedFeeCount = reports.reduce((sum, report) => sum + report.checkedFeeCount, 0);
  const readyFeeCount = reports.reduce((sum, report) => sum + report.readyFeeCount, 0);
  const checkedDrugItemCount = reports.reduce((sum, report) => sum + report.checkedDrugItemCount, 0);
  const readyDrugItemCount = reports.reduce((sum, report) => sum + report.readyDrugItemCount, 0);
  const errorCount = reports.reduce((sum, report) => sum + report.errorCount, 0);
  const warningCount = reports.reduce((sum, report) => sum + report.warningCount, 0);

  return {
    ok: errorCount === 0,
    totalClaims: results.length,
    readyClaims: reports.length - issueClaims,
    issueClaims,
    checkedFeeCount,
    readyFeeCount,
    checkedDrugItemCount,
    readyDrugItemCount,
    issueCount: errorCount + warningCount,
    errorCount,
    warningCount
  };
}

export function formatMonthlyClaimUkeOfficialReadinessIssues(
  issues: MonthlyClaimUkeOfficialReadinessIssue[],
  limit = 8
): string {
  const lines = issues.slice(0, limit).map((issue) => {
    const target = issue.feeName || issue.drugName || issue.title;
    return `${issue.patientName}: ${target} / ${issue.title}`;
  });
  if (issues.length > limit) {
    lines.push(`ほか${issues.length - limit}件`);
  }
  return lines.join('\n');
}

export function buildMonthlyClaimUkeOfficialReadinessIssueCsv(
  issues: MonthlyClaimUkeOfficialReadinessIssue[]
): string {
  const rows = [
    ['受付ID', '患者名', '重要度', '指摘コード', '指摘', '内容', '算定区分', '算定名', '想定レコード', '薬剤ID', '薬剤名', '処方グループ数', 'RP番号'],
    ...issues.map((issue) => [
      issue.visitId,
      issue.patientName,
      issue.severity === 'error' ? '要修正' : '確認',
      issue.code,
      issue.title,
      issue.message,
      issue.feeCode ?? '',
      issue.feeName ?? '',
      issue.expectedRecordType ?? '',
      issue.itemId ?? '',
      issue.drugName ?? '',
      issue.prescriptionGroupCount ?? '',
      issue.rpNumbers?.join('・') ?? ''
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildMonthlyClaimUkeOfficialReadinessReviewCsv(
  results: MonthlyClaimUkeBuildResult[]
): string {
  const rows = [
    ['区分', '受付ID', '患者ID', '患者名', '判定', '算定確認', '薬剤確認', '要対応件数', '指摘コード', '指摘', '内容', '算定区分', '算定名', '想定レコード', '薬剤ID', '薬剤名', '処方グループ数', 'RP番号'],
    ...results.flatMap((result) => {
      const report = result.officialReadinessReport;
      return [
        [
          '受付サマリ',
          result.visitId,
          result.patientId,
          result.patientName,
          report.ok ? 'OK' : '要対応',
          `${report.readyFeeCount}/${report.checkedFeeCount}`,
          `${report.readyDrugItemCount}/${report.checkedDrugItemCount}`,
          report.errorCount,
          '',
          report.ok ? '公式提出準備OK' : '公式提出前に確認してください',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          ''
        ],
        ...report.issues.map((issue) => [
          '指摘',
          issue.visitId,
          result.patientId,
          issue.patientName,
          issue.severity === 'error' ? '要対応' : '確認',
          `${report.readyFeeCount}/${report.checkedFeeCount}`,
          `${report.readyDrugItemCount}/${report.checkedDrugItemCount}`,
          report.errorCount,
          issue.code,
          issue.title,
          issue.message,
          issue.feeCode ?? '',
          issue.feeName ?? '',
          issue.expectedRecordType ?? '',
          issue.itemId ?? '',
          issue.drugName ?? '',
          issue.prescriptionGroupCount ?? '',
          issue.rpNumbers?.join('・') ?? ''
        ])
      ];
    })
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

export function buildMonthlyClaimUkeOfficialSampleScopeReport(
  results: MonthlyClaimUkeBuildResult[],
  recordSpecs: DispensingUkeRecordSpec[] = DISPENSING_UKE_KNOWN_RECORD_SPEC
): MonthlyClaimUkeOfficialSampleScopeReport {
  const validationOnlyRecordTypes = sortedUnique(recordSpecs
    .filter((spec) => spec.implementationScope === 'official_sample_validation')
    .map((spec) => spec.type));
  const generatedRecordTypes = sortedUnique(results.flatMap((result) => result.records.map((record) => record.type)));
  const generatedRecordTypeSet = new Set(generatedRecordTypes);
  const generatedValidationOnlyRecordTypes = validationOnlyRecordTypes.filter((type) => generatedRecordTypeSet.has(type));
  const suppressedRecordTypes = validationOnlyRecordTypes.filter((type) => !generatedRecordTypeSet.has(type));

  return {
    ok: generatedValidationOnlyRecordTypes.length === 0,
    validationOnlyRecordTypes,
    generatedRecordTypes,
    generatedValidationOnlyRecordTypes,
    suppressedRecordTypes
  };
}

export function formatMonthlyClaimUkeOfficialSampleScopeReport(
  report: MonthlyClaimUkeOfficialSampleScopeReport
): string {
  const status = report.ok ? 'OK' : '要修正';
  const targetText = report.validationOnlyRecordTypes.length > 0
    ? ` / 対象 ${report.validationOnlyRecordTypes.join('・')}`
    : '';
  const mixedText = report.generatedValidationOnlyRecordTypes.length > 0
    ? ` / 混入 ${report.generatedValidationOnlyRecordTypes.join('・')}`
    : '';

  return `公式サンプルだけで見る種別: ${status} / 通常請求UKE外 ${report.suppressedRecordTypes.length}種別${mixedText}${targetText}`;
}

export function buildMonthlyClaimUkePreflightReport(
  results: MonthlyClaimUkeBuildResult[]
): MonthlyClaimUkePreflightReport {
  const errorResults = getMonthlyClaimUkeIssues(results, 'error');
  const warningResults = getMonthlyClaimUkeIssues(results, 'warning');
  const batchIssues = validateMonthlyClaimUkeBatch(results);
  const batchErrorIssues = getMonthlyClaimUkeBatchIssues(batchIssues, 'error');
  const batchWarningIssues = getMonthlyClaimUkeBatchIssues(batchIssues, 'warning');
  const officialSampleScopeReport = buildMonthlyClaimUkeOfficialSampleScopeReport(results);
  const allFieldIssues = getMonthlyClaimUkeAllFieldIssues(results);
  const allFieldSourceSummary = buildMonthlyClaimUkeAllFieldSourceSummary(results);
  const officialReadinessSummary = buildMonthlyClaimUkeOfficialReadinessSummary(results);
  const officialReadinessIssues = getMonthlyClaimUkeOfficialReadinessIssues(results);

  return {
    ok: errorResults.length === 0 && batchErrorIssues.length === 0,
    totalClaims: results.length,
    errorResults,
    warningResults,
    batchIssues,
    batchErrorIssues,
    batchWarningIssues,
    officialSampleScopeReport,
    allFieldSourceSummary,
    allFieldIssues,
    allFieldIssueCsv: buildMonthlyClaimUkeAllFieldIssueCsv(allFieldIssues),
    officialReadinessSummary,
    officialReadinessIssues,
    officialReadinessIssueCsv: buildMonthlyClaimUkeOfficialReadinessIssueCsv(officialReadinessIssues),
    officialReadinessReviewCsv: buildMonthlyClaimUkeOfficialReadinessReviewCsv(results)
  };
}

export function formatMonthlyClaimUkePreflightReport(
  report: MonthlyClaimUkePreflightReport
): string {
  const status = report.ok ? 'OK' : '要修正';
  const warningCount = report.warningResults.length + report.batchWarningIssues.length;
  const warningText = warningCount > 0 ? ` / 確認 ${warningCount}` : '';
  const allFieldText = report.allFieldIssues.length > 0 ? ` / allFields指摘 ${report.allFieldIssues.length}` : '';
  const allFieldSourceText = report.allFieldSourceSummary.definedAllFieldCount > 0
    ? ` / allFields根拠 ${report.allFieldSourceSummary.definedAllFieldCount}項目`
    : '';
  const officialReadinessText = report.officialReadinessSummary.ok
    ? ` / 公式提出準備OK`
    : ` / 公式提出準備 要対応 ${report.officialReadinessSummary.errorCount}`;
  const officialSampleText = report.officialSampleScopeReport.generatedValidationOnlyRecordTypes.length > 0
    ? ` / 公式サンプルだけで見る種別混入 ${report.officialSampleScopeReport.generatedValidationOnlyRecordTypes.length}`
    : ` / 公式サンプルだけで見る種別 ${report.officialSampleScopeReport.suppressedRecordTypes.length}種別確認`;

  return `一括UKE事前チェック: ${status} / 受付 ${report.totalClaims} / UKEエラー ${report.errorResults.length} / 受付前エラー ${report.batchErrorIssues.length}${warningText}${allFieldText}${allFieldSourceText}${officialReadinessText}${officialSampleText}`;
}

function getRecords(result: MonthlyClaimUkeBuildResult, type: string): UkeRecord[] {
  return result.records.filter((record) => record.type === type);
}

export function detectMonthlyClaimUkeSampleCoverage(
  result: MonthlyClaimUkeBuildResult
): MonthlyClaimUkeSampleCoverageKey[] {
  const covered = new Set<MonthlyClaimUkeSampleCoverageKey>();
  const insuranceType = result.insuranceType || '';
  const provider = result.insuranceProvider || getRecords(result, 'HO')[0]?.fields[0] || '';

  if (/社保|健康保険|協会|組合|共済|被用者/.test(insuranceType) || (!insuranceType && /^(06|07)/.test(provider))) {
    covered.add('social_insurance');
  }

  if (/国保|国民健康保険|後期高齢/.test(insuranceType) || (!insuranceType && /^\d{6}$/.test(provider))) {
    covered.add('national_insurance');
  }

  if (getRecords(result, 'KO').length > 0) {
    covered.add('public_expense');
  }

  if (result.claimStatus === 'returned') {
    covered.add('returned');
  }

  if (result.claimStatus === 'rebilling') {
    covered.add('rebilling');
  }

  return MONTHLY_CLAIM_UKE_REQUIRED_SAMPLE_COVERAGE.filter((sample) => covered.has(sample));
}

export function buildMonthlyClaimUkeSampleCoverageReport(
  results: MonthlyClaimUkeBuildResult[]
): MonthlyClaimUkeSampleCoverageReport {
  const covered = new Set<MonthlyClaimUkeSampleCoverageKey>();
  for (const result of results) {
    for (const sample of detectMonthlyClaimUkeSampleCoverage(result)) {
      covered.add(sample);
    }
  }

  const coveredSamples = MONTHLY_CLAIM_UKE_REQUIRED_SAMPLE_COVERAGE.filter((sample) => covered.has(sample));
  const missingSamples = MONTHLY_CLAIM_UKE_REQUIRED_SAMPLE_COVERAGE.filter((sample) => !covered.has(sample));

  return {
    requiredSamples: [...MONTHLY_CLAIM_UKE_REQUIRED_SAMPLE_COVERAGE],
    coveredSamples,
    missingSamples,
    missingLabels: missingSamples.map((sample) => MONTHLY_CLAIM_UKE_SAMPLE_COVERAGE_LABELS[sample])
  };
}

function addBatchIssue(
  issues: MonthlyClaimUkeBatchCheckIssue[],
  issue: MonthlyClaimUkeBatchCheckIssue
) {
  issues.push(issue);
}

export function validateMonthlyClaimUkeBatch(results: MonthlyClaimUkeBuildResult[]): MonthlyClaimUkeBatchCheckIssue[] {
  const issues: MonthlyClaimUkeBatchCheckIssue[] = [];
  if (results.length === 0) {
    addBatchIssue(issues, {
      severity: 'error',
      code: 'monthly_uke_empty',
      title: '一括UKEの受付がありません',
      message: '一括UKEに含める再請求準備の受付を選択してください。'
    });
    return issues;
  }

  const visitIds = new Map<string, string>();
  const claimMonths = new Set<string>();
  const pharmacyCodes = new Set<string>();
  const officialSampleScopeReport = buildMonthlyClaimUkeOfficialSampleScopeReport(results);

  if (!officialSampleScopeReport.ok) {
    addBatchIssue(issues, {
      severity: 'error',
      code: 'monthly_uke_official_sample_only_record_generated',
      title: '公式サンプルだけで見る種別が通常請求UKEに含まれています',
      message: `通常の請求UKEには ${officialSampleScopeReport.generatedValidationOnlyRecordTypes.join('、')} を含めず、公式サンプル確認用として扱ってください。`
    });
  }

  for (const result of results) {
    const headerRecords = getRecords(result, 'YK');
    const receiptRecords = getRecords(result, 'RE');
    const totalRecords = getRecords(result, 'TK');
    const trailerRecords = getRecords(result, 'ST');
    const claimStatus = result.claimStatus || 'draft';

    if (visitIds.has(result.visitId)) {
      addBatchIssue(issues, {
        severity: 'error',
        code: 'monthly_uke_duplicate_visit',
        title: '同じ受付が一括UKEに重複しています',
        message: `${result.patientName} の受付ID ${result.visitId} が複数回含まれています。`,
        visitId: result.visitId,
        patientName: result.patientName
      });
    }
    visitIds.set(result.visitId, result.patientName);

    if (claimStatus === 'returned') {
      addBatchIssue(issues, {
        severity: 'error',
        code: 'monthly_uke_returned_claim_mixed',
        title: '返戻対応のままの受付が含まれています',
        message: `${result.patientName} は返戻対応中です。修正内容を確認し、再請求/月遅れ準備へ切り替えてから一括UKEに含めてください。`,
        visitId: result.visitId,
        patientName: result.patientName
      });
    }

    if (claimStatus === 'exported' || claimStatus === 'accepted' || claimStatus === 'closed') {
      addBatchIssue(issues, {
        severity: 'error',
        code: 'monthly_uke_locked_claim_mixed',
        title: '再出力できない請求状態の受付が含まれています',
        message: `${result.patientName} は「${CLAIM_LIFECYCLE_STATUS_LABELS[claimStatus]}」です。再請求する場合は返戻登録または再請求/月遅れ準備に切り替えてください。`,
        visitId: result.visitId,
        patientName: result.patientName
      });
    }

    if (claimStatus === 'draft') {
      addBatchIssue(issues, {
        severity: 'error',
        code: 'monthly_uke_unprepared_claim_mixed',
        title: '再請求準備前の受付が含まれています',
        message: `${result.patientName} は請求前のままです。一括UKEに含める場合は、返戻登録または再請求/月遅れ準備へ切り替えてから作成してください。`,
        visitId: result.visitId,
        patientName: result.patientName
      });
    }

    if (claimStatus === 'rebilling' && !String(result.rebillingReason || '').trim()) {
      addBatchIssue(issues, {
        severity: 'warning',
        code: 'monthly_uke_rebilling_reason_missing',
        title: '再請求理由が未入力です',
        message: `${result.patientName} の再請求理由を記録しておくと、オンライン請求後の確認や返戻再対応が追いやすくなります。`,
        visitId: result.visitId,
        patientName: result.patientName
      });
    }

    if (result.issues.some((issue) => issue.severity === 'error')) {
      addBatchIssue(issues, {
        severity: 'error',
        code: 'monthly_uke_claim_has_error',
        title: 'UKE出力前エラーが残っています',
        message: `${result.patientName} の受付を修正してから一括UKEを作成してください。`,
        visitId: result.visitId,
        patientName: result.patientName
      });
    }

    if (headerRecords.length !== 1) {
      addBatchIssue(issues, {
        severity: 'error',
        code: 'monthly_uke_header_count',
        title: '薬局情報レコード数が不正です',
        message: `${result.patientName} の薬局情報レコードは1件である必要があります。`,
        visitId: result.visitId,
        patientName: result.patientName
      });
    } else if (headerRecords[0].fields[0]) {
      pharmacyCodes.add(headerRecords[0].fields[0]);
    }

    if (receiptRecords.length !== 1) {
      addBatchIssue(issues, {
        severity: 'error',
        code: 'monthly_uke_receipt_count',
        title: '患者・請求情報レコード数が不正です',
        message: `${result.patientName} のREレコードは1件である必要があります。`,
        visitId: result.visitId,
        patientName: result.patientName
      });
    } else {
      const receiptRecord = receiptRecords[0];
      const claimMonth = receiptRecord.fields[1] || '';
      if (/^\d{6}$/.test(claimMonth)) {
        claimMonths.add(claimMonth);
      } else {
        addBatchIssue(issues, {
          severity: 'error',
          code: 'monthly_uke_claim_month_invalid',
          title: '請求年月の形式が不正です',
          message: `${result.patientName} の請求年月を確認してください。`,
          visitId: result.visitId,
          patientName: result.patientName
        });
      }
      if (receiptRecord.fields[2] !== result.visitId) {
        addBatchIssue(issues, {
          severity: 'error',
          code: 'monthly_uke_visit_id_mismatch',
          title: '受付IDが一致しません',
          message: `${result.patientName} のRE受付IDと画面上の受付IDが一致しません。`,
          visitId: result.visitId,
          patientName: result.patientName
        });
      }
      if (receiptRecord.fields[3] !== result.patientId) {
        addBatchIssue(issues, {
          severity: 'error',
          code: 'monthly_uke_patient_id_mismatch',
          title: '患者IDが一致しません',
          message: `${result.patientName} のRE患者IDと画面上の患者IDが一致しません。`,
          visitId: result.visitId,
          patientName: result.patientName
        });
      }
      if (receiptRecord.fields[8] !== String(result.totalPoints)) {
        addBatchIssue(issues, {
          severity: 'error',
          code: 'monthly_uke_re_points_mismatch',
          title: 'RE点数が再計算結果と一致しません',
          message: `${result.patientName} のRE点数 ${receiptRecord.fields[8] || '未設定'} 点と再計算結果 ${result.totalPoints} 点が一致しません。`,
          visitId: result.visitId,
          patientName: result.patientName
        });
      }
    }

    if (totalRecords.length !== 1) {
      addBatchIssue(issues, {
        severity: 'error',
        code: 'monthly_uke_total_count',
        title: '合計情報レコード数が不正です',
        message: `${result.patientName} のTKレコードは1件である必要があります。`,
        visitId: result.visitId,
        patientName: result.patientName
      });
    } else if (totalRecords[0].fields[0] !== String(result.totalPoints)) {
      addBatchIssue(issues, {
        severity: 'error',
        code: 'monthly_uke_tk_points_mismatch',
        title: 'TK点数が再計算結果と一致しません',
        message: `${result.patientName} のTK点数 ${totalRecords[0].fields[0] || '未設定'} 点と再計算結果 ${result.totalPoints} 点が一致しません。`,
        visitId: result.visitId,
        patientName: result.patientName
      });
    }

    if (trailerRecords.length !== 1) {
      addBatchIssue(issues, {
        severity: 'error',
        code: 'monthly_uke_trailer_count',
        title: '出力情報レコード数が不正です',
        message: `${result.patientName} のSTレコードは1件である必要があります。`,
        visitId: result.visitId,
        patientName: result.patientName
      });
    }
  }

  if (pharmacyCodes.size > 1) {
    addBatchIssue(issues, {
      severity: 'error',
      code: 'monthly_uke_mixed_pharmacy',
      title: '薬局コードが混在しています',
      message: '一括UKEには同一薬局コードの受付だけを含めてください。'
    });
  }

  if (claimMonths.size > 1) {
    addBatchIssue(issues, {
      severity: 'warning',
      code: 'monthly_uke_mixed_claim_month',
      title: '複数の請求年月が含まれています',
      message: `一括UKEに ${Array.from(claimMonths).join(', ')} の請求年月が含まれています。月遅れ・再請求として意図した混在か確認してください。`
    });
  }

  return issues;
}

export function getMonthlyClaimUkeBatchIssues(
  issues: MonthlyClaimUkeBatchCheckIssue[],
  severity: MonthlyClaimUkeBatchCheckSeverity
): MonthlyClaimUkeBatchCheckIssue[] {
  return issues.filter((issue) => issue.severity === severity);
}

export function formatMonthlyClaimUkeBatchIssues(
  issues: MonthlyClaimUkeBatchCheckIssue[],
  limit = 8
): string {
  const lines = issues.slice(0, limit).map((issue) => {
    const prefix = issue.patientName ? `${issue.patientName}: ` : '';
    return `${prefix}${issue.title}`;
  });
  if (issues.length > limit) {
    lines.push(`ほか${issues.length - limit}件`);
  }
  return lines.join('\n');
}

function combineMonthlyClaimUkeRecords(results: MonthlyClaimUkeBuildResult[]): UkeRecord[] {
  if (results.length === 0) return [];
  const header = results[0].records.find((record) => record.type === 'YK');
  const trailer = results[0].records.find((record) => record.type === 'ST');
  const body = results.flatMap((result) => result.records.filter((record) => record.type !== 'YK' && record.type !== 'ST'));
  return [
    ...(header ? [header] : []),
    ...body,
    ...(trailer ? [trailer] : [])
  ];
}

export function buildMonthlyClaimUkeBundle(
  results: MonthlyClaimUkeBuildResult[],
  fileName = makeMonthlyClaimUkeFileName()
): MonthlyClaimUkeBundle {
  const preflightReport = buildMonthlyClaimUkePreflightReport(results);
  if (preflightReport.errorResults.length > 0) {
    throw new Error(`UKE出力前チェックで${preflightReport.errorResults.length}件の修正が必要です。`);
  }

  if (preflightReport.batchErrorIssues.length > 0) {
    throw new Error(`オンライン請求受付前チェックで${preflightReport.batchErrorIssues.length}件の修正が必要です。`);
  }

  const records = combineMonthlyClaimUkeRecords(results);
  return {
    fileName,
    content: generateUkeContent(records),
    totalClaims: results.length,
    totalPoints: results.reduce((sum, result) => sum + result.totalPoints, 0),
    records,
    results,
    batchIssues: preflightReport.batchIssues,
    officialSampleScopeReport: preflightReport.officialSampleScopeReport,
    allFieldSourceSummary: preflightReport.allFieldSourceSummary,
    allFieldIssues: preflightReport.allFieldIssues,
    allFieldIssueCsv: preflightReport.allFieldIssueCsv,
    officialReadinessSummary: preflightReport.officialReadinessSummary,
    officialReadinessIssues: preflightReport.officialReadinessIssues,
    officialReadinessIssueCsv: preflightReport.officialReadinessIssueCsv,
    officialReadinessReviewCsv: preflightReport.officialReadinessReviewCsv
  };
}

export function buildMonthlyClaimOfficialUkeBundle(
  claims: MonthlyClaimUkeCase[],
  results: MonthlyClaimUkeBuildResult[]
): MonthlyClaimOfficialUkeBundle {
  if (claims.length === 0 || results.length === 0 || claims.length !== results.length) {
    throw new Error('公式提出用UKEの受付と事前チェック結果が一致していません。');
  }

  const preflightReport = buildMonthlyClaimUkePreflightReport(results);
  if (preflightReport.errorResults.length > 0 || preflightReport.batchErrorIssues.length > 0) {
    throw new Error('公式提出用UKEを作成する前に、UKE出力前チェックの要修正項目を解消してください。');
  }
  if (!preflightReport.officialReadinessSummary.ok) {
    throw new Error(`公式提出準備に${preflightReport.officialReadinessSummary.errorCount}件の要対応があります。`);
  }

  const claimByVisitId = new Map(claims.map((claim) => [claim.visit.visitId, claim]));
  const orderedClaims = results.map((result) => {
    const claim = claimByVisitId.get(result.visitId);
    if (!claim) {
      throw new Error(`受付ID ${result.visitId} の公式提出用データがありません。`);
    }
    return claim;
  });
  const claimMonths = new Set(orderedClaims.map((claim) => (
    calendarMonth(firstDateLike(claim.visit.dispensingDate, claim.visit.issueDate), '調剤年月')
  )));
  if (claimMonths.size !== 1) {
    throw new Error('公式提出用UKEには同じ調剤年月の受付だけを含めてください。');
  }
  const payerOrganizationCodes = new Set(orderedClaims.map((claim) => deriveOfficialPayerOrganizationCode(claim.patient)));
  if (payerOrganizationCodes.size !== 1) {
    throw new Error('公式提出用UKEは社保系と国保系を分けて作成してください。');
  }

  const firstClaim = orderedClaims[0];
  const claimInputs = results.map((result, index) => (
    buildMonthlyClaimOfficialClaimInput(orderedClaims[index], result, index + 1)
  ));
  const officialFile = buildDispensingUkeOfficialFile({
    header: {
      payerOrganizationCode: deriveOfficialPayerOrganizationCode(firstClaim.patient),
      prefectureCode: deriveOfficialPrefectureCode(firstClaim.settings),
      pharmacyCode: requireDigits(firstClaim.settings.pharmacyCode, '保険薬局コード', [7]),
      pharmacyName: String(firstClaim.settings.pharmacyName || '').trim(),
      claimMonth: Array.from(claimMonths)[0],
      phone: firstClaim.settings.pharmacyPhone
    },
    claims: claimInputs
  });
  const officialReconciliationReport = buildMonthlyClaimOfficialUkeReconciliationReport(
    officialFile.records,
    claimInputs,
    results
  );
  if (!officialReconciliationReport.ok) {
    throw new Error(`公式提出UKE集計に${officialReconciliationReport.errorCount}件の要確認があります。`);
  }
  const officialReconciliationCsv = buildMonthlyClaimOfficialUkeReconciliationCsv(officialReconciliationReport);

  return {
    fileName: officialFile.fileName,
    content: generateDispensingUkeOfficialContent(officialFile.records),
    totalClaims: officialFile.totalClaims,
    totalPoints: officialFile.totalPoints,
    records: officialFile.records,
    results,
    officialReadinessSummary: preflightReport.officialReadinessSummary,
    officialReconciliationReport,
    officialReconciliationCsv
  };
}
