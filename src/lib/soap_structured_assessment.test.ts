import { test } from 'node:test';
import assert from 'node:assert';
import {
  createDefaultSoapStructuredAssessment,
  getMissingSoapStructuredAssessmentFields,
  normalizeSoapStructuredAssessment
} from './soap_structured_assessment.ts';

test('createDefaultSoapStructuredAssessment marks every structured SOAP field unknown', () => {
  assert.deepStrictEqual(createDefaultSoapStructuredAssessment(), {
    adherence: 'unknown',
    leftoverMedicine: 'unknown',
    adverseEvent: 'unknown',
    genericChangePreference: 'unknown',
    medicationNotebook: 'unknown'
  });
});

test('normalizeSoapStructuredAssessment preserves valid values and repairs invalid ones', () => {
  const normalized = normalizeSoapStructuredAssessment({
    adherence: 'good',
    leftoverMedicine: 'has',
    adverseEvent: 'none',
    genericChangePreference: 'declined',
    medicationNotebook: 'issued',
    // Simulate a stale value from a future or imported source.
    unexpected: 'value'
  } as any);

  assert.deepStrictEqual(normalized, {
    adherence: 'good',
    leftoverMedicine: 'has',
    adverseEvent: 'none',
    genericChangePreference: 'declined',
    medicationNotebook: 'issued'
  });

  assert.strictEqual(normalizeSoapStructuredAssessment({ adherence: 'invalid' as any }).adherence, 'unknown');
});

test('getMissingSoapStructuredAssessmentFields returns labels for unknown fields', () => {
  assert.deepStrictEqual(
    getMissingSoapStructuredAssessmentFields({
      adherence: 'good',
      leftoverMedicine: 'none',
      adverseEvent: 'none',
      genericChangePreference: 'accepted',
      medicationNotebook: 'issued'
    }),
    []
  );

  assert.deepStrictEqual(
    getMissingSoapStructuredAssessmentFields({
      adherence: 'good',
      leftoverMedicine: 'unknown',
      adverseEvent: 'has',
      genericChangePreference: 'unknown',
      medicationNotebook: 'not_issued'
    }),
    ['残薬', '後発品変更意向']
  );
});
