export interface PatientMatchCandidate {
  patientId: string;
  name: string;
  birthDate: string;
  insuranceInfo?: {
    number?: string;
  };
  doc?: any;
}

export interface PatientMatchInput {
  name: string;
  insuranceNumber?: string;
  birthDate?: string;
}

export interface PatientMatchResult<T extends PatientMatchCandidate = PatientMatchCandidate> {
  patient: T;
  reason: 'insurance_and_name' | 'birthdate_and_name';
}

export type PatientCandidateMatchReason =
  | 'exact_name'
  | 'partial_name'
  | 'birthdate'
  | 'insurance_number';

export type PatientCandidateMatchRisk = 'low' | 'medium' | 'high';

export interface PatientCandidateMatch<T extends PatientMatchCandidate = PatientMatchCandidate> {
  patient: T;
  score: number;
  risk: PatientCandidateMatchRisk;
  reasons: PatientCandidateMatchReason[];
  reasonLabels: string[];
  warning?: string;
}

const PATIENT_CANDIDATE_REASON_LABELS: Record<PatientCandidateMatchReason, string> = {
  exact_name: '氏名一致',
  partial_name: '氏名候補',
  birthdate: '生年月日一致',
  insurance_number: '保険番号一致'
};

function toHalfWidth(value: string): string {
  return value.replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));
}

export function normalizePatientName(value: string): string {
  return toHalfWidth(value)
    .toLowerCase()
    .replace(/[　\s]/g, '')
    .trim();
}

export function normalizeInsuranceNumber(value?: string): string {
  if (!value) return '';
  return toHalfWidth(value).replace(/[^\d]/g, '');
}

export function findMatchingPatient<T extends PatientMatchCandidate>(
  candidates: T[],
  input: PatientMatchInput
): PatientMatchResult<T> | undefined {
  const normalizedName = normalizePatientName(input.name);
  const birthDate = input.birthDate || '';
  const normalizedInsuranceNumber = normalizeInsuranceNumber(input.insuranceNumber);

  if (!normalizedName) return undefined;

  for (const patient of candidates) {
    const patientName = normalizePatientName(patient.name);
    if (patientName !== normalizedName) continue;

    if (birthDate && patient.birthDate === birthDate) {
      return { patient, reason: 'birthdate_and_name' };
    }

    const patientInsuranceNumber = normalizeInsuranceNumber(patient.insuranceInfo?.number);
    if (normalizedInsuranceNumber && patientInsuranceNumber === normalizedInsuranceNumber) {
      return { patient, reason: 'insurance_and_name' };
    }
  }

  return undefined;
}

function addReason(reasons: PatientCandidateMatchReason[], reason: PatientCandidateMatchReason) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function buildPatientCandidateWarning(reasons: PatientCandidateMatchReason[], sameNameCount: number): string | undefined {
  if (sameNameCount > 1 && !reasons.includes('birthdate') && !reasons.includes('insurance_number')) {
    return '同姓同名候補が複数あります。生年月日か保険番号で確認してください。';
  }
  if (reasons.includes('insurance_number') && !reasons.includes('exact_name')) {
    return '保険番号は一致していますが、氏名が一致していません。入力内容と患者マスターを確認してください。';
  }
  if (reasons.includes('birthdate') && !reasons.includes('exact_name')) {
    return '生年月日は一致していますが、氏名が一致していません。別人登録ではないか確認してください。';
  }
  if (reasons.includes('partial_name') && !reasons.includes('birthdate') && !reasons.includes('insurance_number')) {
    return '氏名の一部だけが一致しています。選択前に生年月日と保険番号を確認してください。';
  }
  return undefined;
}

function classifyPatientCandidateRisk(reasons: PatientCandidateMatchReason[], sameNameCount: number): PatientCandidateMatchRisk {
  if (reasons.includes('exact_name') && reasons.includes('birthdate')) return 'low';
  if (reasons.includes('exact_name') && reasons.includes('insurance_number')) return 'low';
  if (reasons.includes('insurance_number') && !reasons.includes('exact_name') && !reasons.includes('partial_name')) {
    return 'high';
  }
  if (sameNameCount > 1 && reasons.includes('exact_name') && !reasons.includes('birthdate') && !reasons.includes('insurance_number')) {
    return 'high';
  }
  if (reasons.includes('insurance_number') || reasons.includes('birthdate')) return 'medium';
  return 'high';
}

export function buildPatientCandidateMatches<T extends PatientMatchCandidate>(
  candidates: T[],
  input: PatientMatchInput,
  limit = 6
): PatientCandidateMatch<T>[] {
  const normalizedName = normalizePatientName(input.name);
  const birthDate = input.birthDate || '';
  const normalizedInsuranceNumber = normalizeInsuranceNumber(input.insuranceNumber);
  if (!normalizedName && !birthDate && !normalizedInsuranceNumber) return [];

  const sameNameCount = candidates.filter((patient) => (
    normalizedName && normalizePatientName(patient.name) === normalizedName
  )).length;

  const matches: PatientCandidateMatch<T>[] = [];
  for (const patient of candidates) {
    const reasons: PatientCandidateMatchReason[] = [];
    const patientName = normalizePatientName(patient.name);
    const patientInsuranceNumber = normalizeInsuranceNumber(patient.insuranceInfo?.number);

    if (normalizedName && patientName === normalizedName) {
      addReason(reasons, 'exact_name');
    } else if (normalizedName && patientName.includes(normalizedName)) {
      addReason(reasons, 'partial_name');
    }

    if (birthDate && patient.birthDate === birthDate) {
      addReason(reasons, 'birthdate');
    }

    if (normalizedInsuranceNumber && patientInsuranceNumber === normalizedInsuranceNumber) {
      addReason(reasons, 'insurance_number');
    }

    if (reasons.length === 0) continue;

    const hasNameMismatch = normalizedName && patientName !== normalizedName && !patientName.includes(normalizedName);
    const score = (
      (reasons.includes('exact_name') ? 40 : 0)
      + (reasons.includes('partial_name') ? 12 : 0)
      + (reasons.includes('birthdate') ? 35 : 0)
      + (reasons.includes('insurance_number') ? 35 : 0)
      - (sameNameCount > 1 && reasons.includes('exact_name') && !reasons.includes('birthdate') && !reasons.includes('insurance_number') ? 20 : 0)
      - (hasNameMismatch ? 25 : 0)
    );
    const risk = classifyPatientCandidateRisk(reasons, sameNameCount);
    matches.push({
      patient,
      score,
      risk,
      reasons,
      reasonLabels: reasons.map((reason) => PATIENT_CANDIDATE_REASON_LABELS[reason]),
      warning: buildPatientCandidateWarning(reasons, sameNameCount)
    });
  }

  return matches
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.patient.name.localeCompare(b.patient.name, 'ja');
    })
    .slice(0, limit);
}
