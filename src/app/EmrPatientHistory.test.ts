import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const emrSource = readFileSync(new URL('./emr/page.tsx', import.meta.url), 'utf8');

test('EMR renders patient history from visits, prescriptions, and SOAP records', () => {
  assert.match(emrSource, /buildPrescriptionTimeline/);
  assert.match(emrSource, /buildSoapHistoryTimeline/);
  assert.match(emrSource, /buildPastProblemSuggestions/);
  assert.match(emrSource, /setActiveEmrSection\('history'\)/);
  assert.match(emrSource, /history-panel/);
  assert.doesNotMatch(emrSource, /TimelineItem date="2024\/04\/10"/);
  assert.doesNotMatch(emrSource, /const pastProblemSuggestions = \[/);
});
