import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const mainEmrSource = readFileSync(new URL('./emr/page.tsx', import.meta.url), 'utf8');
const soapCompSource = readFileSync(new URL('./emr/components/SoapComponents.tsx', import.meta.url), 'utf8');
const structLibSource = readFileSync(new URL('../lib/soap_structured_assessment.ts', import.meta.url), 'utf8');
const emrSource = mainEmrSource + '\n' + soapCompSource + '\n' + structLibSource;

test('EMR SOAP editor stores structured medication guidance fields and warns on completion', () => {
  assert.match(emrSource, /SoapStructuredAssessmentPanel/);
  assert.match(emrSource, /structuredAssessment/);
  assert.match(emrSource, /getMissingSoapStructuredAssessmentFields/);
  assert.match(emrSource, /missingStructuredFields/);
  assert.match(emrSource, /薬歴の構造化チェックに未確認項目があります/);
  assert.match(emrSource, /服薬状況/);
  assert.match(emrSource, /残薬/);
  assert.match(emrSource, /副作用・有害事象/);
  assert.match(emrSource, /後発品変更意向/);
  assert.match(emrSource, /お薬手帳/);
});
