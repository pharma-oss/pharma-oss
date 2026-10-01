/**
 * 高額療養費・一部負担金減免（別表7・別表8・別表10）の入力・表示・事前点検純粋モジュール
 * 
 * 厚生労働省・支払基金・国保連の公的電算処理仕様（RECEIPTY.CYO）に準拠し、
 * 患者の限度額適用認定証、高額療養費多数回該当、一部負担金区分、
 * および一部負担金減免（減額・免除・支払猶予）のデータ整合性と画面表示を調停する。
 */

import type { Patient } from '@/db/types';
import {
  DISPENSING_UKE_COPAYMENT_CATEGORY_CODES,
  DISPENSING_UKE_REDUCTION_CODES,
  HIGH_COST_LIMIT_CATEGORIES,
  type HighCostLimitCategory,
  findDispensingUkeCodeTableEntry,
  buildHighCostSpecialNoteCode
} from '@/lib/receipt/dispensing_uke_code_tables';
import { sanitizeDigits } from '@/lib/patient_public_insurance';

export interface EditableCopaymentSupport {
  highCostLimitCategory: '' | HighCostLimitCategory;
  highCostMultipleOccurrence: boolean;
  copaymentCategoryCode: '' | '1' | '3';
  reductionCode: '' | '1' | '2' | '3';
  reductionRatioPercent: string;
  reductionReducedYen: string;
  reductionCertificateNumber: string;
}

export interface CopaymentSupportBadge {
  type: 'high_cost' | 'reduction' | 'category';
  label: string;
  title: string;
  severity: 'teal' | 'orange' | 'red';
}

export type CopaymentSupportIssueCode =
  | 'copayment_invalid_high_cost_category'
  | 'copayment_high_cost_special_note_error'
  | 'copayment_invalid_category_code'
  | 'copayment_invalid_reduction_code'
  | 'copayment_reduction_amount_missing'
  | 'copayment_reduction_ratio_invalid'
  | 'copayment_reduction_cert_number_invalid';

export interface CopaymentSupportIssue {
  severity: 'error' | 'warning';
  code: CopaymentSupportIssueCode;
  title: string;
  message: string;
}

/**
 * 空の編集用高額療養費・減免ステートを生成する
 */
export function createEmptyEditableCopaymentSupport(): EditableCopaymentSupport {
  return {
    highCostLimitCategory: '',
    highCostMultipleOccurrence: false,
    copaymentCategoryCode: '',
    reductionCode: '',
    reductionRatioPercent: '',
    reductionReducedYen: '',
    reductionCertificateNumber: ''
  };
}

/**
 * 患者保険情報から編集用フォームステートへ変換する
 */
export function toEditableCopaymentSupport(insuranceInfo?: Patient['insuranceInfo']): EditableCopaymentSupport {
  if (!insuranceInfo) return createEmptyEditableCopaymentSupport();

  const reduction = insuranceInfo.copaymentReduction;
  return {
    highCostLimitCategory: insuranceInfo.highCostLimitCategory || '',
    highCostMultipleOccurrence: Boolean(insuranceInfo.highCostMultipleOccurrence),
    copaymentCategoryCode: (insuranceInfo.copaymentCategoryCode as any) || '',
    reductionCode: (reduction?.code as any) || '',
    reductionRatioPercent: reduction?.ratioPercent !== undefined ? String(reduction.ratioPercent) : '',
    reductionReducedYen: reduction?.reducedYen !== undefined ? String(reduction.reducedYen) : '',
    reductionCertificateNumber: reduction?.certificateNumber || ''
  };
}

/**
 * 編集用フォームステートから Patient['insuranceInfo'] へのパッチオブジェクトを生成する
 */
export function fromEditableCopaymentSupport(
  editable: EditableCopaymentSupport
): Pick<
  NonNullable<Patient['insuranceInfo']>,
  'highCostLimitCategory' | 'highCostMultipleOccurrence' | 'copaymentCategoryCode' | 'copaymentReduction'
> {
  const highCostLimitCategory = editable.highCostLimitCategory || undefined;
  const highCostMultipleOccurrence = editable.highCostLimitCategory ? editable.highCostMultipleOccurrence : undefined;
  const copaymentCategoryCode = editable.copaymentCategoryCode || undefined;

  let copaymentReduction: NonNullable<Patient['insuranceInfo']>['copaymentReduction'] | undefined = undefined;
  if (editable.reductionCode) {
    const ratioNum = editable.reductionRatioPercent.trim() !== '' ? Number(sanitizeDigits(editable.reductionRatioPercent)) : undefined;
    const yenNum = editable.reductionReducedYen.trim() !== '' ? Number(sanitizeDigits(editable.reductionReducedYen)) : undefined;
    const certNum = sanitizeDigits(editable.reductionCertificateNumber).slice(0, 3) || undefined;

    copaymentReduction = {
      code: editable.reductionCode,
      ...(ratioNum !== undefined && !Number.isNaN(ratioNum) ? { ratioPercent: ratioNum } : {}),
      ...(yenNum !== undefined && !Number.isNaN(yenNum) ? { reducedYen: yenNum } : {}),
      ...(certNum ? { certificateNumber: certNum } : {})
    };
  }

  return {
    highCostLimitCategory,
    highCostMultipleOccurrence,
    copaymentCategoryCode,
    copaymentReduction
  };
}

/**
 * 患者情報から高額療養費・減免の表示用バッジリストを生成する
 */
export function buildHighCostCopaymentBadges(insuranceInfo?: Patient['insuranceInfo']): CopaymentSupportBadge[] {
  if (!insuranceInfo) return [];
  const badges: CopaymentSupportBadge[] = [];

  // 1. 高額療養費限度額適用認定証
  if (insuranceInfo.highCostLimitCategory) {
    const isMultiple = insuranceInfo.highCostMultipleOccurrence;
    const label = isMultiple
      ? `限度額: 多${insuranceInfo.highCostLimitCategory}（多数回）`
      : `限度額: 区${insuranceInfo.highCostLimitCategory}`;
    badges.push({
      type: 'high_cost',
      label,
      title: `高額療養費限度額適用認定証【区分${insuranceInfo.highCostLimitCategory}】${isMultiple ? '（多数回該当）' : ''}。レセプト特記事項に記録されます。`,
      severity: isMultiple ? 'orange' : 'teal'
    });
  }

  // 2. 一部負担金区分コード（別表8）
  if (insuranceInfo.copaymentCategoryCode) {
    const entry = findDispensingUkeCodeTableEntry(
      DISPENSING_UKE_COPAYMENT_CATEGORY_CODES,
      insuranceInfo.copaymentCategoryCode
    );
    badges.push({
      type: 'category',
      label: `一部負担区分: ${insuranceInfo.copaymentCategoryCode}`,
      title: entry ? `${entry.name}（別表8コード: ${entry.code}）` : `一部負担金区分コード: ${insuranceInfo.copaymentCategoryCode}`,
      severity: 'teal'
    });
  }

  // 3. 一部負担金減免（別表10）
  if (insuranceInfo.copaymentReduction?.code) {
    const entry = findDispensingUkeCodeTableEntry(
      DISPENSING_UKE_REDUCTION_CODES,
      insuranceInfo.copaymentReduction.code
    );
    const reduction = insuranceInfo.copaymentReduction;
    let detail = entry ? entry.name : `減免区分${reduction.code}`;
    if (reduction.code === '1') {
      if (reduction.ratioPercent !== undefined) detail += `（${reduction.ratioPercent}%減額）`;
      else if (reduction.reducedYen !== undefined) detail += `（${reduction.reducedYen}円減額）`;
    }
    badges.push({
      type: 'reduction',
      label: `減免: ${detail}`,
      title: `国民健康保険一部負担金減免【${detail}】（証明書番号: ${reduction.certificateNumber || '未登録'}）。窓口徴収額をご確認ください。`,
      severity: reduction.code === '2' ? 'orange' : 'teal'
    });
  }

  return badges;
}

/**
 * 印刷画面（`/print/[visitId]`）の一部負担金入力ブロック用ガイダンスメッセージを生成する
 */
export function buildVisitCopaymentGuidance(
  patient?: Patient,
  insuranceAmounts?: { patientCopayYen: number; burdenRatio: number }
): { hasGuidance: boolean; items: string[]; alertType: 'info' | 'warning' } {
  if (!patient?.insuranceInfo) {
    return { hasGuidance: false, items: [], alertType: 'info' };
  }

  const items: string[] = [];
  const info = patient.insuranceInfo;
  let alertType: 'info' | 'warning' = 'info';

  if (info.highCostLimitCategory) {
    const isMultiple = info.highCostMultipleOccurrence;
    items.push(
      `高額療養費限度額適用認定証【区分${info.highCostLimitCategory}】${isMultiple ? '（多数回該当）' : ''}が登録されています。窓口での一部負担金徴収額をご確認の上、入力してください。`
    );
    alertType = 'warning';
  }

  if (info.copaymentCategoryCode) {
    const entry = findDispensingUkeCodeTableEntry(DISPENSING_UKE_COPAYMENT_CATEGORY_CODES, info.copaymentCategoryCode);
    items.push(`一部負担金区分【${entry?.name || info.copaymentCategoryCode}】が適用されています。`);
  }

  if (info.copaymentReduction?.code) {
    const entry = findDispensingUkeCodeTableEntry(DISPENSING_UKE_REDUCTION_CODES, info.copaymentReduction.code);
    const red = info.copaymentReduction;
    let detail = entry?.name || `減免区分${red.code}`;
    if (red.code === '1') {
      if (red.ratioPercent !== undefined) detail += `（${red.ratioPercent}%減額）`;
      else if (red.reducedYen !== undefined) detail += `（${red.reducedYen}円減額）`;
    }
    items.push(
      `一部負担金減免【${detail}】（証明書番号: ${red.certificateNumber || '未登録'}）が登録されています。${red.code === '2' ? '免除のため窓口徴収額が0円であることを確認してください。' : '減額後の徴収額を入力してください。'}`
    );
    alertType = 'warning';
  }

  return {
    hasGuidance: items.length > 0,
    items,
    alertType
  };
}

/**
 * 高額療養費・減免設定の公的提出事前点検を行う（Readiness Check）
 */
export function validateCopaymentSupportReadiness(
  patient: Patient,
  dispensingDateLike?: string
): CopaymentSupportIssue[] {
  const issues: CopaymentSupportIssue[] = [];
  const info = patient.insuranceInfo;
  if (!info) return issues;

  // 1. 高額療養費適用区分の検証
  if (info.highCostLimitCategory) {
    if (!HIGH_COST_LIMIT_CATEGORIES.includes(info.highCostLimitCategory)) {
      issues.push({
        severity: 'error',
        code: 'copayment_invalid_high_cost_category',
        title: '高額療養費適用区分が不正です',
        message: `適用区分「${info.highCostLimitCategory}」は別表7の規定（ア〜キ）に存在しません。`
      });
    } else if (dispensingDateLike) {
      const dateDigits = dispensingDateLike.replace(/[^0-9]/g, '');
      const dispensingMonth = dateDigits.length >= 6 ? dateDigits.slice(0, 6) : '';
      if (dispensingMonth) {
        const specialNote = buildHighCostSpecialNoteCode({
          category: info.highCostLimitCategory,
          multipleOccurrence: info.highCostMultipleOccurrence,
          dispensingMonth,
          lateElderly: info.insuranceType === '後期高齢者医療'
        });
        if (!specialNote.ok) {
          issues.push({
            severity: 'error',
            code: 'copayment_high_cost_special_note_error',
            title: '高額療養費特記事項の記録条件を満たしていません',
            message: specialNote.reason
          });
        }
      }
    }
  }

  // 2. 一部負担金区分コード（別表8）の検証
  if (info.copaymentCategoryCode) {
    const entry = findDispensingUkeCodeTableEntry(DISPENSING_UKE_COPAYMENT_CATEGORY_CODES, info.copaymentCategoryCode);
    if (!entry) {
      issues.push({
        severity: 'error',
        code: 'copayment_invalid_category_code',
        title: '一部負担金区分コードが別表8にありません',
        message: `一部負担金区分コード「${info.copaymentCategoryCode}」は別表8に存在しません（有効な値: 1 または 3）。`
      });
    }
  }

  // 3. 減免区分コード（別表10）の検証
  if (info.copaymentReduction) {
    const red = info.copaymentReduction;
    const entry = findDispensingUkeCodeTableEntry(DISPENSING_UKE_REDUCTION_CODES, red.code);
    if (!entry) {
      issues.push({
        severity: 'error',
        code: 'copayment_invalid_reduction_code',
        title: '減免区分コードが別表10にありません',
        message: `減免区分コード「${red.code}」は別表10に存在しません（有効な値: 1=減額, 2=免除, 3=支払猶予）。`
      });
    } else {
      if (red.code === '1') {
        if (red.ratioPercent === undefined && red.reducedYen === undefined) {
          issues.push({
            severity: 'error',
            code: 'copayment_reduction_amount_missing',
            title: '減額割合または減額金額が未設定です',
            message: '減免区分が「1:減額」の場合、減額割合(%)または減額金額(円)のいずれかを設定してください。'
          });
        }
        if (red.ratioPercent !== undefined && (red.ratioPercent <= 0 || red.ratioPercent > 100)) {
          issues.push({
            severity: 'error',
            code: 'copayment_reduction_ratio_invalid',
            title: '減額割合の範囲が不正です',
            message: `減額割合は 1〜100% の範囲で入力してください（現在: ${red.ratioPercent}%）。`
          });
        }
      }
      if (red.certificateNumber !== undefined && red.certificateNumber !== '') {
        const cleanedCert = sanitizeDigits(red.certificateNumber);
        if (cleanedCert.length !== 3) {
          issues.push({
            severity: 'error',
            code: 'copayment_reduction_cert_number_invalid',
            title: '減免証明書番号の桁数が不正です',
            message: `国保減額・免除証明書番号は3桁の数字で入力してください（現在: ${red.certificateNumber}）。`
          });
        }
      }
    }
  }

  return issues;
}
