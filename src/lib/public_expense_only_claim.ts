// 保険種別「公費単独」(医療保険なし・公費のみ) の患者。
//
// レセプト種別は保険者番号の有無で決まる(無ければ公費単独 42xx)。保険種別に「公費単独」と入れた患者は、
// 保険者番号が空でも保険者レコード(HO)を作らない。作ると「HO 保険者番号が未入力です」で出力前チェックが止まり、
// 公費単独のレセプトをいつまでも出せない。
//
// 保険種別が空や社保・国保の患者で保険者番号が空なのは入力漏れなので、これまでどおり HO を作ってエラーで止める。
// 「公費単独」なのに保険者番号が残っている食い違いは、公式UKEの出力前チェックで止める (monthly_claim_uke)。

const PUBLIC_EXPENSE_ONLY_INSURANCE_TYPE_PATTERN = /公費単独/;

export function isPublicExpenseOnlyInsuranceType(insuranceType: unknown): boolean {
  return PUBLIC_EXPENSE_ONLY_INSURANCE_TYPE_PATTERN.test(String(insuranceType ?? '').trim());
}

interface PublicExpenseOnlyPatientLike {
  insuranceInfo?: { insuranceType?: unknown; provider?: unknown } | null;
}

/** 保険種別が「公費単独」で、保険者番号も入っていない(= HO を作らない)患者か */
export function isPublicExpenseOnlyPatient(patient: PublicExpenseOnlyPatientLike | null | undefined): boolean {
  const insuranceInfo = patient?.insuranceInfo;
  return isPublicExpenseOnlyInsuranceType(insuranceInfo?.insuranceType)
    && String(insuranceInfo?.provider ?? '').replace(/\D/g, '').length === 0;
}

/** 保険種別が「公費単独」なのに保険者番号が残っている(医保併用として出てしまう)か */
export function hasPublicExpenseOnlyInsurerConflict(patient: PublicExpenseOnlyPatientLike | null | undefined): boolean {
  const insuranceInfo = patient?.insuranceInfo;
  return isPublicExpenseOnlyInsuranceType(insuranceInfo?.insuranceType)
    && String(insuranceInfo?.provider ?? '').replace(/\D/g, '').length > 0;
}
