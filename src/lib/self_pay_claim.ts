// 保険種別に「自費」と入れた患者は、請求 (UKE) の対象外にする。
//
// 除外するのは「保険種別に自費と入れた」患者だけ。保険種別が空で保険者番号からも国保・社保を
// 判定できない患者 (領収証のバーコードでは「自費扱い」になる) は、これまでどおり請求の対象で、
// ここでは除外しない。保険種別が空の患者の扱いまで変えると、いま請求できている患者が
// 請求から落ちるおそれがあるため。

const SELF_PAY_INSURANCE_TYPE_PATTERN = /自費/;

/** 保険種別に「自費」と入れてあるか。領収証のバーコードの自費判定と、請求の除外判定で共通。 */
export function isExplicitSelfPayInsuranceType(insuranceType: unknown): boolean {
  return SELF_PAY_INSURANCE_TYPE_PATTERN.test(String(insuranceType ?? '').trim());
}

/** 保険種別だけを読む。画面ごとに少しずつ違う患者の型 (insuranceInfo に任意の項目を持つもの) を受けられる緩い型。 */
export interface SelfPayPatientLike {
  insuranceInfo?: object | null;
}

export function isSelfPayPatient(patient: SelfPayPatientLike | null | undefined): boolean {
  const insuranceInfo = patient?.insuranceInfo as { insuranceType?: unknown } | null | undefined;
  return isExplicitSelfPayInsuranceType(insuranceInfo?.insuranceType);
}

export const SELF_PAY_CLAIM_EXCLUSION_NOTE =
  '保険種別が「自費」の患者は、請求（UKE出力・請求ロック・月次請求）の対象外です。領収証は、これまでどおり保険点数×負担割合で計算されます。';

export const SELF_PAY_UKE_BLOCKED_MESSAGE =
  '保険種別が「自費」の患者は請求（UKE）の対象外のため、UKEを出力できません。保険を使う請求なら、患者の保険種別を設定し直してください。';

export interface SelfPayExcludedClaim {
  visitId: string;
  patientId: string;
  patientName: string;
}

export interface ClaimCandidate {
  visit: { visitId: string };
  patient: SelfPayPatientLike & { patientId: string; name?: string };
}

/** 請求の候補から、保険種別が「自費」の患者の受付を外す。外した受付は excluded に残す。 */
export function partitionSelfPayClaims<T extends ClaimCandidate>(
  candidates: readonly T[]
): { claimable: T[]; excluded: SelfPayExcludedClaim[] } {
  const claimable: T[] = [];
  const excluded: SelfPayExcludedClaim[] = [];
  for (const candidate of candidates) {
    if (isSelfPayPatient(candidate.patient)) {
      excluded.push({
        visitId: candidate.visit.visitId,
        patientId: candidate.patient.patientId,
        patientName: candidate.patient.name || '氏名未設定'
      });
    } else {
      claimable.push(candidate);
    }
  }
  return { claimable, excluded };
}

/** 請求の画面に出す、除外した件数のお知らせ。除外が無ければ null。 */
export function describeSelfPayExclusion(excluded: readonly SelfPayExcludedClaim[], remainingCount: number): string | null {
  if (excluded.length === 0) return null;
  const base = `保険種別が「自費」の患者 ${excluded.length}件は請求の対象外のため、除外しました。`;
  return remainingCount === 0
    ? `${base}請求の対象はありません（すべて自費の患者でした）。`
    : base;
}
