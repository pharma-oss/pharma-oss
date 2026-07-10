import type { Patient, PublicInsurance } from '@/db/types';

export interface PatientMasterUpdateInput {
  name: string;
  birthDate: string;
  insuranceInfo?: Patient['insuranceInfo'];
  publicInsurances?: ReadonlyArray<PublicInsurance>;
}

type PatientMasterBefore = Pick<Patient, 'name' | 'birthDate' | 'insuranceInfo'> & {
  publicInsurances?: ReadonlyArray<PublicInsurance>;
};

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

function addChange(changes: string[], label: string, before: unknown, after: unknown) {
  const beforeText = normalize(before);
  const afterText = normalize(after);
  if (beforeText === afterText) return;
  changes.push(`${label}: 「${beforeText || '未設定'}」→「${afterText || '未設定'}」`);
}

function summarizePublicInsurances(publicInsurances?: ReadonlyArray<PublicInsurance>): string {
  if (!publicInsurances || publicInsurances.length === 0) return '';
  return publicInsurances
    .map((insurance) => [
      insurance.provider,
      insurance.recipient,
      insurance.burdenRatio !== undefined ? `${insurance.burdenRatio}%` : '',
      insurance.startDate,
      insurance.endDate,
      insurance.monthlyLimitYen !== undefined ? `${insurance.monthlyLimitYen}円` : ''
    ].filter(Boolean).join('/'))
    .join(', ');
}

export function describePatientMasterChanges(
  before: PatientMasterBefore,
  after: PatientMasterUpdateInput
): string[] {
  const changes: string[] = [];
  addChange(changes, '患者名', before.name, after.name);
  addChange(changes, '生年月日', before.birthDate, after.birthDate);
  addChange(changes, '保険者番号', before.insuranceInfo?.provider, after.insuranceInfo?.provider);
  addChange(changes, '保険記号番号', before.insuranceInfo?.number, after.insuranceInfo?.number);
  addChange(changes, '負担割合', before.insuranceInfo?.burdenRatio, after.insuranceInfo?.burdenRatio);
  addChange(changes, '保険種別', before.insuranceInfo?.insuranceType, after.insuranceInfo?.insuranceType);
  addChange(changes, '本人家族', before.insuranceInfo?.relationship, after.insuranceInfo?.relationship);
  addChange(changes, '保険有効開始日', before.insuranceInfo?.validFrom, after.insuranceInfo?.validFrom);
  addChange(changes, '保険有効期限', before.insuranceInfo?.validTo, after.insuranceInfo?.validTo);
  addChange(changes, '資格確認日', before.insuranceInfo?.eligibilityCheckedAt, after.insuranceInfo?.eligibilityCheckedAt);
  addChange(changes, '資格確認状態', before.insuranceInfo?.eligibilityStatus, after.insuranceInfo?.eligibilityStatus);
  addChange(changes, '公費情報', summarizePublicInsurances(before.publicInsurances), summarizePublicInsurances(after.publicInsurances));
  return changes;
}
