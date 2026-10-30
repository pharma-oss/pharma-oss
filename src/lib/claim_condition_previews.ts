import { calculateInsuranceAmounts } from './billing.ts';
import {
  getTotalPoints,
  getUnsetPointFees,
  type CalculationResultItem,
  type FeeCalculationOptions
} from './calculator.ts';
import type { AfterHoursCategory, MedicationNotebookCondition, TokkanOverride } from './claim_conditions.ts';

// 領収証の横で「この条件にしたら金額はいくらか」を、選ぶ前に見せるための試算。
// 別の計算は作らず、画面と同じ calculateDispensingFees (calculate として渡す) と
// calculateInsuranceAmounts を、条件を差し替えて呼ぶだけにしている。

export interface ConditionChoicePreview {
  totalPoints: number;
  /** 窓口負担額 (円)。点数未設定の項目があって確定しないときは null */
  copayYen: number | null;
  /** 点数が決められない項目の名前。空なら金額は確定している */
  unsetFeeNames: string[];
}

export interface ConditionChoicePreviews {
  medicationNotebook: Record<MedicationNotebookCondition, ConditionChoicePreview>;
  afterHoursCategory: Record<AfterHoursCategory, ConditionChoicePreview>;
  /** 'item' は来局単位の指定なし (処方明細ごとの設定) */
  tokkanOverride: Record<TokkanOverride | 'item', ConditionChoicePreview>;
}

export function previewClaimOptions(
  calculate: (options: FeeCalculationOptions) => CalculationResultItem[],
  options: FeeCalculationOptions,
  burdenRatio: number
): ConditionChoicePreview {
  const fees = calculate(options);
  const totalPoints = getTotalPoints(fees);
  const unsetFeeNames = getUnsetPointFees(fees).map((fee) => fee.name);
  return {
    totalPoints,
    copayYen: unsetFeeNames.length > 0 ? null : calculateInsuranceAmounts(totalPoints, burdenRatio).patientCopayYen,
    unsetFeeNames
  };
}

export function previewConditionChoices(params: {
  calculate: (options: FeeCalculationOptions) => CalculationResultItem[];
  options: FeeCalculationOptions;
  burdenRatio: number;
}): ConditionChoicePreviews {
  const { calculate, options, burdenRatio } = params;
  const preview = (patch: Partial<FeeCalculationOptions>) =>
    previewClaimOptions(calculate, { ...options, ...patch }, burdenRatio);
  return {
    medicationNotebook: {
      carried: preview({ medicationNotebook: 'carried' }),
      not_carried: preview({ medicationNotebook: 'not_carried' })
    },
    afterHoursCategory: {
      none: preview({ afterHoursCategory: 'none' }),
      after_hours: preview({ afterHoursCategory: 'after_hours' }),
      holiday: preview({ afterHoursCategory: 'holiday' }),
      late_night: preview({ afterHoursCategory: 'late_night' })
    },
    tokkanOverride: {
      item: preview({ tokkanOverride: undefined }),
      none: preview({ tokkanOverride: 'none' }),
      '1': preview({ tokkanOverride: '1' }),
      '3_i': preview({ tokkanOverride: '3_i' })
    }
  };
}
