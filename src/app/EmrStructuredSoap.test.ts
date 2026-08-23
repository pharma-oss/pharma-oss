import { test } from 'node:test';
import assert from 'node:assert';
import {
  createDefaultSoapStructuredAssessment,
  normalizeSoapStructuredAssessment,
  getMissingSoapStructuredAssessmentFields
} from '../lib/soap_structured_assessment';
import { SoapStructuredAssessmentPanel } from './emr/components/SoapComponents';

test('createDefaultSoapStructuredAssessment creates expected defaults', () => {
  const assessment = createDefaultSoapStructuredAssessment();
  assert.strictEqual(assessment.adherence, 'unknown');
  assert.strictEqual(assessment.leftoverMedicine, 'unknown');
  assert.strictEqual(assessment.adverseEvent, 'unknown');
  assert.strictEqual(assessment.genericChangePreference, 'unknown');
  assert.strictEqual(assessment.medicationNotebook, 'unknown');
});

test('getMissingSoapStructuredAssessmentFields identifies unchecked fields', () => {
  const assessment = createDefaultSoapStructuredAssessment();
  const missing = getMissingSoapStructuredAssessmentFields(assessment);
  assert.ok(missing.length >= 5);
  assert.ok(missing.includes('服薬状況'));
  assert.ok(missing.includes('残薬'));
  assert.ok(missing.includes('副作用・有害事象'));
  assert.ok(missing.includes('後発品変更意向'));
  assert.ok(missing.includes('お薬手帳'));
});

test('SoapStructuredAssessmentPanel is exported as React component', () => {
  assert.ok(SoapStructuredAssessmentPanel);
});

