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

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('TracingReportModal is exported as React component and renders closed/opened static markup', () => {
  assert.strictEqual(typeof TracingReportModal, 'function');
  const closedHtml = renderToStaticMarkup(
    React.createElement(TracingReportModal, {
      isOpen: false,
      onClose: () => {},
      patientName: '患者 太郎',
      onSaveReport: async () => {}
    })
  );
  assert.strictEqual(closedHtml, '');

  const openHtml = renderToStaticMarkup(
    React.createElement(TracingReportModal, {
      isOpen: true,
      onClose: () => {},
      patientName: '患者 太郎',
      onSaveReport: async () => {}
    })
  );
  assert.ok(openHtml.includes('服薬情報提供書 (トレーシングレポート) 作成'));
});

test('EmrInterventionModal is exported as React component and renders intervention form correctly', () => {
  assert.strictEqual(typeof EmrInterventionModal, 'function');
  const closedHtml = renderToStaticMarkup(
    React.createElement(EmrInterventionModal, {
      isOpen: false,
      onClose: () => {},
      intDoctor: '',
      setIntDoctor: () => {},
      intReason: '',
      setIntReason: () => {},
      intBefore: '',
      setIntBefore: () => {},
      intAfter: '',
      setIntAfter: () => {},
      intResult: '',
      setIntResult: () => {},
      intStatus: 'completed',
      setIntStatus: () => {},
      intMethod: 'phone',
      setIntMethod: () => {},
      intResponseDueDate: '',
      setIntResponseDueDate: () => {},
      intNote: '',
      setIntNote: () => {},
      intConsented: true,
      setIntConsented: () => {},
      onSave: async () => {},
      resetForm: () => {}
    })
  );
  assert.strictEqual(closedHtml, '');

  const openHtml = renderToStaticMarkup(
    React.createElement(EmrInterventionModal, {
      isOpen: true,
      onClose: () => {},
      intDoctor: '山田 医師',
      setIntDoctor: () => {},
      intReason: '用量過多の疑義',
      setIntReason: () => {},
      intBefore: '1回2錠',
      setIntBefore: () => {},
      intAfter: '1回1錠',
      setIntAfter: () => {},
      intResult: '疑義照会の上、1回1錠へ減量合意',
      setIntResult: () => {},
      intStatus: 'completed',
      setIntStatus: () => {},
      intMethod: 'phone',
      setIntMethod: () => {},
      intResponseDueDate: '',
      setIntResponseDueDate: () => {},
      intNote: '',
      setIntNote: () => {},
      intConsented: true,
      setIntConsented: () => {},
      onSave: async () => {},
      resetForm: () => {}
    })
  );
  assert.ok(openHtml.includes('疑義照会・処方変更を記録'));
  assert.ok(openHtml.includes('value="山田 医師"'));
  assert.ok(openHtml.includes('用量過多の疑義'));
  assert.ok(openHtml.includes('1回2錠'));
  assert.ok(openHtml.includes('1回1錠'));
});

