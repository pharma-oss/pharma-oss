import type { Alert, FacilitySettings, Patient, PrescriptionItem } from '@/db/types';
import {
  getDispensingFeeOffReasons,
  type CalculationResultItem,
  type FeeCalculationOptions,
  type FeeCode,
  type MonthlyFeeHistoryEntry
} from '@/lib/calculator';
import { evaluateInsuranceEligibility } from './insurance_eligibility.ts';
import { findPatientAlertDrugWarnings } from './patient_alerts.ts';

export type ClaimValidationSeverity = 'error' | 'warning' | 'info';

export interface ClaimValidationIssue {
  severity: ClaimValidationSeverity;
  code: string;
  title: string;
  message: string;
  itemId?: string;
  feeCode?: FeeCode;
}

export interface ClaimValidationItem extends PrescriptionItem {
  drugName?: string;
  drugPrice?: number;
  yjCode?: string;
  isHighRisk?: boolean;
  isAbolished?: boolean;
  prescribedIsAbolished?: boolean;
  dispensedIsAbolished?: boolean;
  genericName?: string;
}

export interface ValidateDispensingClaimInput {
  settings?: FacilitySettings | null;
  patient?: Patient | null;
  items: ClaimValidationItem[];
  calculatedFees: CalculationResultItem[];
  claimOptions?: FeeCalculationOptions;
  patientAlerts?: Alert[];
  totalPoints?: number;
  serviceDate?: string;
  currentVisitId?: string;
  monthlyFeeHistory?: MonthlyFeeHistoryEntry[];
}

const NON_DRUG_FEE_CODES: FeeCode[] = [
  'base_fee',
  'base_additions',
  'drug_preparation',
  'dispensing_management',
  'medication_guidance',
  'special_management',
  'ippoka',
  'mixing'
];

function isFeeEnabled(code: FeeCode, options?: FeeCalculationOptions): boolean {
  if (options?.drugFeeOnly) {
    return code === 'drug_fee';
  }
  return !(options?.disabledFeeCodes || []).includes(code);
}

function hasFeeResult(fees: CalculationResultItem[], code: FeeCode): boolean {
  return fees.some((fee) => fee.code === code && fee.points !== 0);
}

function hasPositiveFeeResult(fees: CalculationResultItem[], code: FeeCode): boolean {
  return fees.some((fee) => fee.code === code && fee.points > 0);
}

function hasPositiveFeeByKeyOrName(
  fees: CalculationResultItem[],
  feeKey: string,
  feeName: string
): boolean {
  return fees.some((fee) => fee.points > 0 && (fee.feeKey === feeKey || fee.name === feeName));
}

function getDrugLabel(item: ClaimValidationItem): string {
  return item.dispensedDrug || item.drugName || item.drugId || '薬品名未設定';
}

function getBillingDrugCode(item: ClaimValidationItem): string {
  return String(item.dispensedDrugCode || item.drugId || '').trim();
}

function getIngredientFormKey(item: ClaimValidationItem): string | undefined {
  if (!item.yjCode || item.yjCode.length < 8) return undefined;
  return `${item.yjCode.slice(0, 7)}_${item.yjCode.charAt(7).toUpperCase()}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function addIssue(
  issues: ClaimValidationIssue[],
  issue: ClaimValidationIssue
) {
  issues.push(issue);
}

export function validateDispensingClaim(input: ValidateDispensingClaimInput): ClaimValidationIssue[] {
  const issues: ClaimValidationIssue[] = [];
  const { settings, patient, items, calculatedFees, claimOptions, patientAlerts = [], serviceDate } = input;
  const effectiveClaimOptions: FeeCalculationOptions | undefined = claimOptions || input.currentVisitId || input.monthlyFeeHistory
    ? {
        ...(claimOptions || {}),
        currentVisitId: input.currentVisitId ?? claimOptions?.currentVisitId,
        monthlyFeeHistory: input.monthlyFeeHistory ?? claimOptions?.monthlyFeeHistory
      }
    : undefined;
  const totalPoints = input.totalPoints ?? calculatedFees.reduce((sum, fee) => sum + fee.points, 0);

  if (!settings) {
    addIssue(issues, {
      severity: 'error',
      code: 'settings_missing',
      title: '薬局設定が読み込めません',
      message: '調剤基本料の区分や薬局情報を確認できないため、UKE出力前に設定を保存してください。'
    });
  } else {
    if (!settings.baseFeeCategory) {
      addIssue(issues, {
        severity: 'error',
        code: 'base_fee_category_missing',
        title: '調剤基本料の区分が未設定です',
        message: '薬局の施設基準に応じた調剤基本料を設定画面で選択してください。',
        feeCode: 'base_fee'
      });
    }

    if (!settings.pharmacyCode) {
      addIssue(issues, {
        severity: 'warning',
        code: 'pharmacy_code_missing',
        title: '保険薬局コードが未設定です',
        message: '調剤録やUKEファイルに薬局コードが入らないため、提出前に設定画面で登録してください。'
      });
    }

    if (!settings.pharmacyName) {
      addIssue(issues, {
        severity: 'info',
        code: 'pharmacy_name_missing',
        title: '薬局名が未設定です',
        message: '帳票には仮の薬局名が表示されます。正式な薬局名を設定しておくと印字が安定します。'
      });
    }
  }

  if (!patient) {
    addIssue(issues, {
      severity: 'error',
      code: 'patient_missing',
      title: '患者情報が読み込めません',
      message: '患者情報がないため、保険請求に必要な記号番号や負担割合を確認できません。'
    });
  } else if (!patient.insuranceInfo) {
    addIssue(issues, {
      severity: 'error',
      code: 'insurance_missing',
      title: '保険情報が未設定です',
      message: '保険者、記号番号、負担割合を登録してから請求データを作成してください。'
    });
  } else {
    if (!patient.insuranceInfo.provider) {
      addIssue(issues, {
        severity: 'error',
        code: 'insurance_provider_missing',
        title: '保険者が未設定です',
        message: 'UKE出力前に患者の保険者情報を登録してください。'
      });
    }

    if (!patient.insuranceInfo.number) {
      addIssue(issues, {
        severity: 'error',
        code: 'insurance_number_missing',
        title: '記号番号が未設定です',
        message: 'UKE出力前に患者の記号番号を登録してください。'
      });
    }

    const burdenRatio = patient.insuranceInfo.burdenRatio;
    if (!isFiniteNumber(burdenRatio)) {
      addIssue(issues, {
        severity: 'warning',
        code: 'burden_ratio_missing',
        title: '負担割合が未設定です',
        message: '窓口負担は30%として仮計算されます。患者の保険証に合わせて負担割合を確認してください。'
      });
    } else if (burdenRatio < 0 || burdenRatio > 100) {
      addIssue(issues, {
        severity: 'error',
        code: 'burden_ratio_invalid',
        title: '負担割合が範囲外です',
        message: '負担割合は0から100の範囲で入力してください。'
      });
    }

    for (const eligibilityIssue of evaluateInsuranceEligibility({ patient, serviceDate })) {
      addIssue(issues, eligibilityIssue);
    }
  }

  if (items.length === 0) {
    addIssue(issues, {
      severity: 'error',
      code: 'items_missing',
      title: '処方薬がありません',
      message: '調剤録と請求データを作るため、処方薬を1件以上登録してください。'
    });
    return issues;
  }

  const sameIngredientFormGroups = new Map<string, ClaimValidationItem[]>();
  let hasDrugFeeTarget = false;
  let hasDiagnosticTest = false;

  for (const item of items) {
    const drugLabel = getDrugLabel(item);
    const claimsDrugFee = item.claimDrugFee !== false;
    const claimsPreparation = item.claimPreparation !== false;
    const claimsManagement = item.claimManagement !== false;

    if (!isFiniteNumber(item.amount) || item.amount <= 0) {
      addIssue(issues, {
        severity: 'error',
        code: 'amount_invalid',
        title: `${drugLabel} の分量が不正です`,
        message: '分量が0以下または数値ではないため、薬剤料やラベル印字を確認できません。',
        itemId: item.itemId
      });
    }

    if (!isFiniteNumber(item.days) || item.days < 0) {
      addIssue(issues, {
        severity: 'error',
        code: 'days_invalid',
        title: `${drugLabel} の日数が不正です`,
        message: '日数が負数または数値ではないため、内服薬の薬剤料や管理料を確認できません。',
        itemId: item.itemId
      });
    }

    if (item.isAbolished || item.prescribedIsAbolished || item.dispensedIsAbolished) {
      addIssue(issues, {
        severity: 'error',
        code: 'abolished_drug_claimed',
        title: `${drugLabel} は廃止薬品です`,
        message: '現行医薬品マスターで廃止扱いの薬品が含まれています。請求前に現行薬品へ置き換えるか、医薬品マスターを確認してください。',
        itemId: item.itemId,
        feeCode: 'drug_fee'
      });
    }

    if (claimsDrugFee) {
      hasDrugFeeTarget = true;
      if (!getBillingDrugCode(item)) {
        addIssue(issues, {
          severity: 'error',
          code: 'receipt_drug_code_missing',
          title: `${drugLabel} のレセ電コードが未設定です`,
          message: 'IYレコードに出力する医薬品コードがないため、薬品マスターを確認してからUKEを作成してください。',
          itemId: item.itemId,
          feeCode: 'drug_fee'
        });
      }

      if (!isFiniteNumber(item.drugPrice) || item.drugPrice <= 0) {
        addIssue(issues, {
          severity: 'error',
          code: 'drug_price_missing',
          title: `${drugLabel} の薬価が未設定です`,
          message: '薬剤料を算定する設定ですが、薬価がないため点数が正しく出ません。',
          itemId: item.itemId,
          feeCode: 'drug_fee'
        });
      }

      if (!item.yjCode) {
        addIssue(issues, {
          severity: 'warning',
          code: 'yj_code_missing',
          title: `${drugLabel} のYJコードが未設定です`,
          message: '同一成分・同一剤型の判定やUKE出力の精度が下がります。薬品マスタを確認してください。',
          itemId: item.itemId
        });
      }
    }

    if (item.isDiagnosticTest) {
      hasDiagnosticTest = true;

      if (!claimsDrugFee) {
        addIssue(issues, {
          severity: 'warning',
          code: 'diagnostic_drug_fee_disabled',
          title: `${drugLabel} は検査薬ですが薬剤料がOFFです`,
          message: '病院由来の検査薬として薬剤料のみ請求する場合は、薬剤料だけONにしてください。',
          itemId: item.itemId,
          feeCode: 'drug_fee'
        });
      }

      if (claimsPreparation) {
        addIssue(issues, {
          severity: 'error',
          code: 'diagnostic_preparation_enabled',
          title: `${drugLabel} は検査薬ですが薬剤調製料がONです`,
          message: '検査薬は薬剤料のみの扱いが基本です。処方薬ごとの薬剤調製料をOFFにしてください。',
          itemId: item.itemId,
          feeCode: 'drug_preparation'
        });
      }

      if (claimsManagement) {
        addIssue(issues, {
          severity: 'error',
          code: 'diagnostic_management_enabled',
          title: `${drugLabel} は検査薬ですが薬学管理がONです`,
          message: '検査薬は調剤管理料や服薬管理指導料を算定しない扱いにするため、処方薬ごとの薬学管理をOFFにしてください。',
          itemId: item.itemId,
          feeCode: 'dispensing_management'
        });
      }
    }

    if (
      item.isHighRisk &&
      claimsManagement &&
      isFeeEnabled('special_management', effectiveClaimOptions) &&
      item.tokkanType !== '1' &&
      item.tokkanType !== '3_i'
    ) {
      addIssue(issues, {
        severity: 'warning',
        code: 'high_risk_tokkan_missing',
        title: `${drugLabel} はハイリスク薬ですが特薬管が未選択です`,
        message: '算定しない判断でなければ、処方薬の特定薬剤管理指導加算を選択してください。',
        itemId: item.itemId,
        feeCode: 'special_management'
      });
    }

    const ingredientFormKey = getIngredientFormKey(item);
    if (ingredientFormKey) {
      const group = sameIngredientFormGroups.get(ingredientFormKey) || [];
      group.push(item);
      sameIngredientFormGroups.set(ingredientFormKey, group);
    }
  }

  // 同効薬重複チェック (YJコード上4桁一致)
  const yjCategoryMap = new Map<string, ClaimValidationItem[]>();
  for (const item of items) {
    if (item.yjCode && item.yjCode.length >= 4) {
      const cat = item.yjCode.substring(0, 4);
      const list = yjCategoryMap.get(cat) || [];
      list.push(item);
      yjCategoryMap.set(cat, list);
    }
  }

  for (const [cat, catItems] of yjCategoryMap.entries()) {
    const uniqueDrugs = new Map<string, ClaimValidationItem>();
    for (const it of catItems) {
      const key = it.drugId || it.dispensedDrug || it.drugName || '';
      if (key) uniqueDrugs.set(key, it);
    }

    if (uniqueDrugs.size > 1) {
      const matchedDrugs = Array.from(uniqueDrugs.values());
      const names = matchedDrugs.map(getDrugLabel).join('、');
      addIssue(issues, {
        severity: 'warning',
        code: 'duplicate_therapy_detected',
        title: '同効薬の重複投薬の疑いがあります',
        message: `${names} は同じ薬効群（YJコード分類 ${cat}）に属する異なる薬剤です。処方の意図を確認してください。`
      });
    }
  }

  const patientAlertWarnings = findPatientAlertDrugWarnings(patientAlerts, items);
  for (const warning of patientAlertWarnings) {
    addIssue(issues, {
      severity: warning.severity === 'danger' ? 'error' : 'warning',
      code: warning.alertType === 'allergy' ? 'patient_allergy_match' : 'patient_side_effect_match',
      title: warning.title,
      message: warning.message,
      itemId: warning.itemId
    });
  }

  const allItemsAreDiagnosticTests = hasDiagnosticTest && items.every((item) => item.isDiagnosticTest);
  const enabledNonDrugFees = NON_DRUG_FEE_CODES.filter((code) => isFeeEnabled(code, effectiveClaimOptions));
  if (allItemsAreDiagnosticTests && enabledNonDrugFees.length > 0) {
    addIssue(issues, {
      severity: 'error',
      code: 'diagnostic_drug_fee_only_required',
      title: '検査薬のみの処方で薬剤料以外がONです',
      message: '病院から出る検査薬のみの場合は、薬剤料のみ、または薬剤料以外の算定項目をOFFにしてください。'
    });
  }

  for (const group of sameIngredientFormGroups.values()) {
    const activeGroup = group.filter((item) => item.claimPreparation !== false || item.claimManagement !== false);
    if (activeGroup.length > 1) {
      addIssue(issues, {
        severity: 'info',
        code: 'same_ingredient_form_grouped',
        title: '同一成分・同一剤型の薬があります',
        message: `${activeGroup.map(getDrugLabel).join('、')} は同一成分・同一剤型としてまとめて計算されます。必要に応じて処方薬ごとの算定ON/OFFを確認してください。`,
        itemId: activeGroup[0].itemId
      });
    }
  }

  if (settings && patient && serviceDate) {
    const feeOffReasons = getDispensingFeeOffReasons(settings, patient, serviceDate, effectiveClaimOptions);
    for (const reason of feeOffReasons) {
      if (hasPositiveFeeByKeyOrName(calculatedFees, reason.feeKey, reason.feeName)) {
        addIssue(issues, {
          severity: 'error',
          code: reason.issueCode,
          title: `${reason.feeName}は算定対象外です`,
          message: reason.reason,
          feeCode: reason.feeCode
        });
      } else if (!effectiveClaimOptions?.disabledFeeRationales?.[reason.feeKey]) {
        addIssue(issues, {
          severity: 'info',
          code: 'monthly_fee_off_reason_available',
          title: `${reason.feeName}の算定OFF理由を残せます`,
          message: `${reason.reason}。必要に応じて算定OFF理由として保存してください。`,
          feeCode: reason.feeCode
        });
      }
    }
  }

  if (hasDrugFeeTarget && isFeeEnabled('drug_fee', effectiveClaimOptions) && !hasPositiveFeeResult(calculatedFees, 'drug_fee')) {
    addIssue(issues, {
      severity: 'error',
      code: 'drug_fee_result_missing',
      title: '薬剤料が算定されていません',
      message: '薬剤料ONの薬がありますが、算定結果に薬剤料が出ていません。薬価、分量、日数を確認してください。',
      feeCode: 'drug_fee'
    });
  }

  if (!isFeeEnabled('drug_fee', effectiveClaimOptions) && hasDrugFeeTarget) {
    addIssue(issues, {
      severity: 'warning',
      code: 'drug_fee_disabled_globally',
      title: '薬剤料が全体でOFFです',
      message: '処方薬側では薬剤料ONの薬がありますが、算定調整で薬剤料がOFFになっています。'
    });
  }

  if (!hasFeeResult(calculatedFees, 'base_fee') && isFeeEnabled('base_fee', effectiveClaimOptions) && !allItemsAreDiagnosticTests) {
    addIssue(issues, {
      severity: 'warning',
      code: 'base_fee_result_missing',
      title: '調剤基本料が算定結果にありません',
      message: '調剤基本料がONですが算定結果に出ていません。薬局設定と処方内容を確認してください。',
      feeCode: 'base_fee'
    });
  }

  if (items.length > 0 && totalPoints <= 0) {
    addIssue(issues, {
      severity: 'error',
      code: 'total_points_zero',
      title: '合計点数が0点です',
      message: 'このままでは請求点数が作成できません。算定調整、薬価、処方内容を確認してください。'
    });
  }

  return issues;
}
