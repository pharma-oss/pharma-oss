import type { FacilitySettings, Patient, Visit } from '@/db/types';
import type { CalculationResultItem } from '@/lib/calculator';
import type { DispensingUkeInterventionLike, DispensingUkeItem } from './dispensing_uke';
import {
  buildMonthlyClaimOfficialUkeBundle,
  buildMonthlyClaimUkePreflightReport,
  buildMonthlyClaimUkeResults,
  type MonthlyClaimOfficialUkeBundle,
  type MonthlyClaimUkeCase,
  type MonthlyClaimUkeOfficialReadinessReport
} from '@/lib/monthly_claim_uke';
import type { UkeRecord } from './uke_generator';

export interface BuildSingleDispensingUkeOfficialInput {
  visit: Visit;
  patient: Patient;
  settings: FacilitySettings;
  items: DispensingUkeItem[];
  calculatedFees: CalculationResultItem[];
  interventions?: DispensingUkeInterventionLike[];
  generatedAt?: Date;
}

export interface SingleDispensingUkeOfficialIssueItem {
  code: string;
  title: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface SingleDispensingUkeOfficialResult {
  fileName: string;
  content: Uint8Array;
  text: string;
  records: UkeRecord[];
  totalClaims: 1;
  totalPoints: number;
  readinessReport: MonthlyClaimUkeOfficialReadinessReport;
  bundle: MonthlyClaimOfficialUkeBundle;
}

export interface SingleDispensingUkeOfficialInspection {
  result: SingleDispensingUkeOfficialResult | null;
  errorMessage: string | null;
  blockingIssues: SingleDispensingUkeOfficialIssueItem[];
  warningIssues: SingleDispensingUkeOfficialIssueItem[];
}

function toSingleClaimCase(input: BuildSingleDispensingUkeOfficialInput): MonthlyClaimUkeCase {
  return {
    visit: input.visit,
    patient: input.patient,
    settings: input.settings,
    items: input.items,
    calculatedFees: input.calculatedFees,
    interventions: input.interventions
  };
}

/**
 * 1件の受付データ（単票）の公式提出仕様適合を点検し、可能であれば公式 UKE（RECEIPTY.CYO）を生成する純粋関数。
 * 出力できない場合は、汎用エラーだけでなく具体的な不足コード・要修正項目の一覧を返す。
 */
export function inspectAndBuildSingleDispensingUkeOfficial(
  input: BuildSingleDispensingUkeOfficialInput
): SingleDispensingUkeOfficialInspection {
  const claimCase = toSingleClaimCase(input);
  const results = buildMonthlyClaimUkeResults([claimCase], input.generatedAt);
  const result = results[0];
  const preflightReport = buildMonthlyClaimUkePreflightReport(results);

  const blockingIssues: SingleDispensingUkeOfficialIssueItem[] = [];
  const warningIssues: SingleDispensingUkeOfficialIssueItem[] = [];
  const seenBlocking = new Set<string>();
  const seenWarning = new Set<string>();

  const pushIssue = (issue: SingleDispensingUkeOfficialIssueItem) => {
    const key = `${issue.code}::${issue.title}::${issue.message}`;
    if (issue.severity === 'error') {
      if (seenBlocking.has(key)) return;
      seenBlocking.add(key);
      blockingIssues.push(issue);
    } else {
      if (seenWarning.has(key)) return;
      seenWarning.add(key);
      warningIssues.push(issue);
    }
  };

  for (const issue of result.issues) {
    pushIssue({
      code: issue.code,
      title: issue.title,
      message: issue.message,
      severity: issue.severity
    });
  }
  for (const issue of preflightReport.batchErrorIssues) {
    pushIssue({
      code: issue.code,
      title: issue.title,
      message: issue.message,
      severity: 'error'
    });
  }
  for (const issue of result.officialReadinessReport.issues) {
    pushIssue({
      code: issue.code,
      title: issue.title,
      message: issue.message,
      severity: issue.severity
    });
  }

  try {
    const bundle = buildMonthlyClaimOfficialUkeBundle([claimCase], results);
    const text = bundle.records
      .map((record) => [record.type, ...record.fields].join(','))
      .join('\r\n') + '\r\n';
    return {
      result: {
        fileName: bundle.fileName,
        content: bundle.content,
        text,
        records: bundle.records,
        totalClaims: 1,
        totalPoints: bundle.totalPoints,
        readinessReport: result.officialReadinessReport,
        bundle
      },
      errorMessage: null,
      blockingIssues: [],
      warningIssues
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : '公式提出用UKEの生成に失敗しました。';
    return {
      result: null,
      errorMessage,
      blockingIssues,
      warningIssues
    };
  }
}

/**
 * 1件の受付データ（単票）から公式提出仕様の UKE ファイル（RECEIPTY.CYO）を生成する純粋関数
 * 
 * - 月次公式 UKE バンドル生成と同じエンジンを共有し、契約・集計・バリデーションの一貫性を担保する。
 * - 末尾に公式仕様の GO レコード（件数: 1、合計点数、99）および EOF (0x1A) を付与する。
 * - 条件付き補助レコード（SN, JD, MF, ST）を共通モジュール経由で正しく展開する。
 */
export function buildSingleDispensingUkeOfficial(
  input: BuildSingleDispensingUkeOfficialInput
): SingleDispensingUkeOfficialResult {
  const claimCase = toSingleClaimCase(input);

  const results = buildMonthlyClaimUkeResults([claimCase], input.generatedAt);
  const result = results[0];

  const bundle = buildMonthlyClaimOfficialUkeBundle([claimCase], results);

  const text = bundle.records
    .map((record) => [record.type, ...record.fields].join(','))
    .join('\r\n') + '\r\n';

  return {
    fileName: bundle.fileName,
    content: bundle.content,
    text,
    records: bundle.records,
    totalClaims: 1,
    totalPoints: bundle.totalPoints,
    readinessReport: result.officialReadinessReport,
    bundle
  };
}
