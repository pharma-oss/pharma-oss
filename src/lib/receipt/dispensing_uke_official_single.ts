import type { FacilitySettings, Patient, Visit } from '@/db/types';
import type { CalculationResultItem } from '@/lib/calculator';
import type { DispensingUkeItem } from './dispensing_uke';
import {
  buildMonthlyClaimOfficialUkeBundle,
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
  interventions?: any[];
  generatedAt?: Date;
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
  const claimCase: MonthlyClaimUkeCase = {
    visit: input.visit,
    patient: input.patient,
    settings: input.settings,
    items: input.items,
    calculatedFees: input.calculatedFees,
    interventions: input.interventions
  };

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
