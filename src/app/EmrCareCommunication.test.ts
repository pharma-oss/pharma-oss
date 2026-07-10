import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert';

const emrSource = readFileSync(new URL('./emr/page.tsx', import.meta.url), 'utf8');

test('emr page records tracing reports and pending inquiry details', () => {
  assert.match(emrSource, /トレーシングレポート/);
  assert.match(emrSource, /handleAddTracingReport/);
  assert.match(emrSource, /careCommunication/);
  assert.match(emrSource, /tracingReports/);
  assert.match(emrSource, /inquiryStatus: input\.inquiryStatus/);
  assert.match(emrSource, /responseDueDate/);
  assert.match(emrSource, /初回質問表/);
  assert.match(emrSource, /OCR全文/);
  assert.match(emrSource, /data-testid="emr-initial-questionnaire-ocr-panel"/);
  assert.match(emrSource, /data-testid="emr-initial-questionnaire-camera-input"/);
  assert.match(emrSource, /compressQuestionnaireImage/);
  assert.match(emrSource, /imageDataUrl: questionnaireImageDataUrl/);
  assert.match(emrSource, /data-testid="myna-clinical-import-panel"/);
  assert.match(emrSource, /handleMynaClinicalImport/);
  assert.match(emrSource, /mynaClinicalImports/);
});
