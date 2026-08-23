import { test } from 'node:test';
import assert from 'node:assert';
import { TracingReportModal } from './emr/components/TracingReportModal';
import { EmrInterventionModal } from './emr/components/EmrInterventionModal';
import { tracingStatusLabel } from '../lib/emr_helpers';

test('tracingStatusLabel handles standard tracing report statuses', () => {
  assert.strictEqual(tracingStatusLabel.draft, '下書き');
  assert.strictEqual(tracingStatusLabel.sent, '送付済');
  assert.strictEqual(tracingStatusLabel.closed, '完了');
});

test('TracingReportModal is exported as React component', () => {
  assert.strictEqual(typeof TracingReportModal, 'function');
});

test('EmrInterventionModal is exported as React component', () => {
  assert.strictEqual(typeof EmrInterventionModal, 'function');
});

