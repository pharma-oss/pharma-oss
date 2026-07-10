import type { SoapStructuredAssessment } from '@/db/types';

export const SOAP_STRUCTURED_ASSESSMENT_FIELD_LABELS: Record<keyof SoapStructuredAssessment, string> = {
  adherence: '服薬状況',
  leftoverMedicine: '残薬',
  adverseEvent: '副作用・有害事象',
  genericChangePreference: '後発品変更意向',
  medicationNotebook: 'お薬手帳'
};

const VALID_VALUES = {
  adherence: new Set(['unknown', 'good', 'partial', 'poor']),
  leftoverMedicine: new Set(['unknown', 'none', 'has']),
  adverseEvent: new Set(['unknown', 'none', 'has']),
  genericChangePreference: new Set(['unknown', 'accepted', 'declined', 'consult']),
  medicationNotebook: new Set(['unknown', 'issued', 'not_issued'])
} satisfies Record<keyof SoapStructuredAssessment, Set<string>>;

export function createDefaultSoapStructuredAssessment(): SoapStructuredAssessment {
  return {
    adherence: 'unknown',
    leftoverMedicine: 'unknown',
    adverseEvent: 'unknown',
    genericChangePreference: 'unknown',
    medicationNotebook: 'unknown'
  };
}

function normalizeField<K extends keyof SoapStructuredAssessment>(
  field: K,
  value: SoapStructuredAssessment[K] | undefined
): NonNullable<SoapStructuredAssessment[K]> {
  return VALID_VALUES[field].has(String(value))
    ? value as NonNullable<SoapStructuredAssessment[K]>
    : 'unknown' as NonNullable<SoapStructuredAssessment[K]>;
}

export function normalizeSoapStructuredAssessment(
  value?: Partial<SoapStructuredAssessment> | null
): SoapStructuredAssessment {
  return {
    adherence: normalizeField('adherence', value?.adherence),
    leftoverMedicine: normalizeField('leftoverMedicine', value?.leftoverMedicine),
    adverseEvent: normalizeField('adverseEvent', value?.adverseEvent),
    genericChangePreference: normalizeField('genericChangePreference', value?.genericChangePreference),
    medicationNotebook: normalizeField('medicationNotebook', value?.medicationNotebook)
  };
}

export function getMissingSoapStructuredAssessmentFields(
  value?: Partial<SoapStructuredAssessment> | null
): string[] {
  const normalized = normalizeSoapStructuredAssessment(value);
  return (Object.keys(SOAP_STRUCTURED_ASSESSMENT_FIELD_LABELS) as Array<keyof SoapStructuredAssessment>)
    .filter((field) => normalized[field] === 'unknown')
    .map((field) => SOAP_STRUCTURED_ASSESSMENT_FIELD_LABELS[field]);
}
