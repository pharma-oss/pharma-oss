import type { Patient } from '@/db/types';
import type { ClaimValidationSeverity } from './claim_validation';

export interface InsuranceEligibilityIssue {
  severity: ClaimValidationSeverity;
  code: string;
  title: string;
  message: string;
}

export interface EvaluateInsuranceEligibilityInput {
  patient?: Patient | null;
  serviceDate?: string;
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const fromDay = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.ceil((toDay - fromDay) / msPerDay);
}

function addIssue(issues: InsuranceEligibilityIssue[], issue: InsuranceEligibilityIssue) {
  issues.push(issue);
}

function normalizeIdentifier(value: unknown): string {
  return String(value ?? '').trim();
}

function hasDigitLength(value: unknown, lengths: number[]): boolean {
  const text = normalizeIdentifier(value);
  return /^\d+$/.test(text) && lengths.includes(text.length);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function evaluateInsuranceEligibility({
  patient,
  serviceDate
}: EvaluateInsuranceEligibilityInput): InsuranceEligibilityIssue[] {
  const issues: InsuranceEligibilityIssue[] = [];
  if (!patient?.insuranceInfo) return issues;

  const referenceDate = parseDate(serviceDate) || new Date();
  const insurance = patient.insuranceInfo;
  const eligibilityStatus = insurance.eligibilityStatus || 'unchecked';

  if (insurance.provider && !hasDigitLength(insurance.provider, [6, 8])) {
    addIssue(issues, {
      severity: 'error',
      code: 'insurance_provider_format_invalid',
      title: '保険者番号の形式が不正です',
      message: '保険者番号は半角数字6桁または8桁で登録してください。'
    });
  }

  const relationship = normalizeIdentifier(insurance.relationship);
  if (!relationship) {
    addIssue(issues, {
      severity: 'warning',
      code: 'insurance_relationship_missing',
      title: '本人・家族区分が未設定です',
      message: '本人か家族かが未記録です。保険証または資格確認結果に合わせて登録してください。'
    });
  } else if (!['本人', '家族', '被保険者', '被扶養者'].includes(relationship)) {
    addIssue(issues, {
      severity: 'warning',
      code: 'insurance_relationship_unrecognized',
      title: '本人・家族区分を確認してください',
      message: `本人・家族区分「${relationship}」はアプリの標準区分ではありません。請求前に保険証または資格確認結果と照合してください。`
    });
  }

  if (eligibilityStatus === 'unchecked') {
    addIssue(issues, {
      severity: 'warning',
      code: 'insurance_eligibility_unchecked',
      title: '資格確認が未実施です',
      message: 'オンライン資格確認または保険証確認日を記録してから請求してください。'
    });
  } else if (eligibilityStatus === 'invalid') {
    addIssue(issues, {
      severity: 'error',
      code: 'insurance_eligibility_invalid',
      title: '資格確認が無効です',
      message: '資格確認結果が無効です。保険者・記号番号・有効期間を確認してください。'
    });
  } else if (eligibilityStatus === 'warning' || eligibilityStatus === 'unavailable') {
    addIssue(issues, {
      severity: 'warning',
      code: `insurance_eligibility_${eligibilityStatus}`,
      title: eligibilityStatus === 'unavailable' ? '資格確認サービス未接続です' : '資格確認に確認事項があります',
      message: '資格確認結果に確認事項があります。請求前に保険証または資格確認結果を再確認してください。'
    });
  }

  const eligibilityCheckedAt = parseDate(insurance.eligibilityCheckedAt);
  if (!insurance.eligibilityCheckedAt) {
    addIssue(issues, {
      severity: 'warning',
      code: 'insurance_eligibility_checked_at_missing',
      title: '資格確認日が未記録です',
      message: 'いつ資格確認したかを残しておくと、月次請求前の確認漏れを減らせます。'
    });
  } else if (!eligibilityCheckedAt) {
    addIssue(issues, {
      severity: 'error',
      code: 'insurance_eligibility_checked_at_invalid',
      title: '資格確認日の形式が不正です',
      message: '資格確認日は日付として読める形式で登録してください。'
    });
  } else {
    const checkedDaysAgo = daysBetween(eligibilityCheckedAt, referenceDate);
    if (checkedDaysAgo < 0) {
      addIssue(issues, {
        severity: 'error',
        code: 'insurance_eligibility_checked_at_future',
        title: '資格確認日が未来日です',
        message: `資格確認日（${insurance.eligibilityCheckedAt}）が調剤日より後になっています。`
      });
    } else if (checkedDaysAgo > 30) {
      addIssue(issues, {
        severity: 'warning',
        code: 'insurance_eligibility_checked_at_stale',
        title: '資格確認日から時間が経っています',
        message: `資格確認日（${insurance.eligibilityCheckedAt}）から30日を超えています。月次請求前に資格を再確認してください。`
      });
    }
  }

  const validFrom = parseDate(insurance.validFrom);
  if (validFrom && daysBetween(referenceDate, validFrom) > 0) {
    addIssue(issues, {
      severity: 'error',
      code: 'insurance_valid_from_future',
      title: '保険資格の開始日前です',
      message: `調剤日が保険資格開始日（${insurance.validFrom}）より前です。`
    });
  }

  const validTo = parseDate(insurance.validTo);
  if (validTo) {
    const remainingDays = daysBetween(referenceDate, validTo);
    if (remainingDays < 0) {
      addIssue(issues, {
        severity: 'error',
        code: 'insurance_expired',
        title: '保険資格が期限切れです',
        message: `保険資格の有効期限（${insurance.validTo}）を過ぎています。`
      });
    } else if (remainingDays <= 30) {
      addIssue(issues, {
        severity: 'warning',
        code: 'insurance_expiring_soon',
        title: '保険資格の期限が近づいています',
        message: `保険資格の有効期限は${insurance.validTo}です。月次請求前に更新有無を確認してください。`
      });
    }
  }

  for (const [index, publicInsurance] of (patient.publicInsurances || []).entries()) {
    const publicLabel = `公費${index + 1}`;
    if (!normalizeIdentifier(publicInsurance.provider)) {
      addIssue(issues, {
        severity: 'error',
        code: 'public_insurance_provider_missing',
        title: `${publicLabel}の負担者番号が未設定です`,
        message: `${publicLabel}を請求に使う場合は、公費負担者番号8桁を登録してください。`
      });
    } else if (!hasDigitLength(publicInsurance.provider, [8])) {
      addIssue(issues, {
        severity: 'error',
        code: 'public_insurance_provider_format_invalid',
        title: `${publicLabel}の負担者番号の形式が不正です`,
        message: '公費負担者番号は半角数字8桁で登録してください。'
      });
    }

    if (!normalizeIdentifier(publicInsurance.recipient)) {
      addIssue(issues, {
        severity: 'error',
        code: 'public_insurance_recipient_missing',
        title: `${publicLabel}の受給者番号が未設定です`,
        message: `${publicLabel}を請求に使う場合は、公費受給者番号7桁を登録してください。`
      });
    } else if (!hasDigitLength(publicInsurance.recipient, [7])) {
      addIssue(issues, {
        severity: 'error',
        code: 'public_insurance_recipient_format_invalid',
        title: `${publicLabel}の受給者番号の形式が不正です`,
        message: '公費受給者番号は半角数字7桁で登録してください。'
      });
    }

    const startDate = parseDate(publicInsurance.startDate);
    if (startDate && daysBetween(referenceDate, startDate) > 0) {
      addIssue(issues, {
        severity: 'error',
        code: 'public_insurance_start_future',
        title: `${publicLabel}の開始日前です`,
        message: `調剤日が${publicLabel}の開始日（${publicInsurance.startDate}）より前です。`
      });
    }

    const endDate = parseDate(publicInsurance.endDate);
    if (endDate) {
      const remainingDays = daysBetween(referenceDate, endDate);
      if (remainingDays < 0) {
        addIssue(issues, {
          severity: 'error',
          code: 'public_insurance_expired',
          title: `${publicLabel}が期限切れです`,
          message: `${publicLabel}の有効期限（${publicInsurance.endDate}）を過ぎています。`
        });
      } else if (remainingDays <= 30) {
        addIssue(issues, {
          severity: 'warning',
          code: 'public_insurance_expiring_soon',
          title: `${publicLabel}の期限が近づいています`,
          message: `${publicLabel}の有効期限は${publicInsurance.endDate}です。負担上限と受給者証を確認してください。`
        });
      }
    }

    if (publicInsurance.monthlyLimitYen === undefined) {
      addIssue(issues, {
        severity: 'warning',
        code: 'public_insurance_monthly_limit_missing',
        title: `${publicLabel}の負担上限が未設定です`,
        message: '公費併用請求の自己負担上限を確認し、月次請求前に登録してください。'
      });
    } else if (publicInsurance.monthlyLimitYen < 0) {
      addIssue(issues, {
        severity: 'error',
        code: 'public_insurance_monthly_limit_invalid',
        title: `${publicLabel}の負担上限が不正です`,
        message: '公費の自己負担上限は0円以上で登録してください。'
      });
    }

    if (publicInsurance.burdenRatio === undefined) {
      addIssue(issues, {
        severity: 'warning',
        code: 'public_insurance_burden_ratio_missing',
        title: `${publicLabel}の負担割合が未設定です`,
        message: '公費併用請求の負担割合を確認し、受給者証に合わせて登録してください。'
      });
    } else if (!isFiniteNumber(publicInsurance.burdenRatio) || publicInsurance.burdenRatio < 0 || publicInsurance.burdenRatio > 100) {
      addIssue(issues, {
        severity: 'error',
        code: 'public_insurance_burden_ratio_invalid',
        title: `${publicLabel}の負担割合が不正です`,
        message: '公費の負担割合は0から100の範囲で登録してください。'
      });
    }
  }

  return issues;
}
