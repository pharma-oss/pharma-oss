import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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

test('SoapStructuredAssessmentPanel renders missing item count and radiogroup states for unconfirmed defaults', () => {
  const html = renderToStaticMarkup(
    React.createElement(SoapStructuredAssessmentPanel, {
      assessment: normalizeSoapStructuredAssessment(undefined),
      onChange: () => {}
    })
  );

  assert.ok(html.includes('aria-label="薬歴構造化チェック"'));
  assert.ok(html.includes('未確認 5項目'));
  assert.ok(!html.includes('全項目確認済み'));
  assert.match(html, /role="radiogroup"[^>]*aria-label="服薬コンプライアンス"/);
  assert.match(html, /role="radiogroup"[^>]*aria-label="お薬手帳持参"/);
  const checkedUnknownMatches =
    html.match(/aria-checked="true"[^>]*tabindex="0"[^>]*class="assessment-chip selected is-unknown"/g) ?? [];
  assert.strictEqual(checkedUnknownMatches.length, 5);
});

test('SoapStructuredAssessmentPanel renders done badge and confirmed chip selection when all 5 fields are set', () => {
  const html = renderToStaticMarkup(
    React.createElement(SoapStructuredAssessmentPanel, {
      assessment: {
        adherence: 'good',
        leftoverMedicine: 'none',
        adverseEvent: 'none',
        genericChangePreference: 'accepted',
        medicationNotebook: 'issued'
      },
      onChange: () => {}
    })
  );

  assert.ok(html.includes('<span class="structured-progress done">全項目確認済み</span>'));
  assert.doesNotMatch(html, /未確認 \d+項目/);
  assert.doesNotMatch(html, /class="soap-structured-field unconfirmed"/);
  assert.match(
    html,
    /aria-checked="true"[^>]*tabindex="0"[^>]*class="assessment-chip selected\s*">良好<\/button>/
  );
  assert.match(
    html,
    /aria-checked="true"[^>]*tabindex="0"[^>]*class="assessment-chip selected\s*">持参あり<\/button>/
  );
});

test('SoapStructuredAssessmentPanel updates remaining unconfirmed count dynamically for partial input', () => {
  const html = renderToStaticMarkup(
    React.createElement(SoapStructuredAssessmentPanel, {
      assessment: {
        adherence: 'good',
        leftoverMedicine: 'has',
        adverseEvent: 'unknown',
        genericChangePreference: 'unknown',
        medicationNotebook: 'unknown'
      },
      onChange: () => {}
    })
  );

  assert.match(html, /<span class="structured-progress\s*">未確認 3項目<\/span>/);
});
