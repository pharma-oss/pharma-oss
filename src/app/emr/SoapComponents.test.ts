import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SoapHistoryTimelineEntry } from '@/lib/emr_patient_history';
import {
  computeNextStructuredAssessmentValue,
  isSoapEntryType,
  SoapEntryBox,
  SoapHistoryPanel,
  SoapHistoryQuickCard,
  SoapStructuredAssessmentPanel
} from './components/SoapComponents';
import { soapStructuredAssessmentControls } from '@/lib/soap_structured_assessment';

const SAMPLE_HISTORY: SoapHistoryTimelineEntry[] = [
  {
    visitId: 'V-003',
    dateLabel: '2026/11/10',
    visitLabel: '受付 #3',
    problems: [
      {
        title: '#1 高血圧',
        snippets: [
          { type: 'S', text: 'めまいなし' },
          { type: 'P', text: '継続フォロー' }
        ]
      }
    ]
  },
  {
    visitId: 'V-002',
    dateLabel: '2026/10/15',
    visitLabel: '受付 #2',
    problems: [
      {
        title: '#1 高血圧',
        snippets: [{ type: 'O', text: '血圧 132/80' }]
      }
    ]
  },
  {
    visitId: 'V-001',
    dateLabel: '2026/09/20',
    visitLabel: '受付 #1',
    problems: [
      {
        title: '#2 副作用確認',
        snippets: [{ type: 'A', text: '空咳なし' }]
      }
    ]
  }
];

const stripStyles = (html: string): string =>
  html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '');

test('isSoapEntryType accepts S/O/A/P and rejects invalid entry types', () => {
  assert.strictEqual(isSoapEntryType('S'), true);
  assert.strictEqual(isSoapEntryType('O'), true);
  assert.strictEqual(isSoapEntryType('A'), true);
  assert.strictEqual(isSoapEntryType('P'), true);
  assert.strictEqual(isSoapEntryType('X'), false);
  assert.strictEqual(isSoapEntryType(null), false);
});

test('SoapEntryBox renders manual, unconfirmed AI draft, approved/modified AI draft, and legacy badges', () => {
  const manualHtml = renderToStaticMarkup(
    React.createElement(SoapEntryBox, {
      entry: { id: 'e-1', type: 'S', text: '体調良好' },
      onChange: () => {},
      onRemove: () => {}
    })
  );
  const manualBody = stripStyles(manualHtml);
  assert.ok(manualBody.includes('type-s'));
  assert.ok(manualBody.includes('>S</span>'));
  assert.ok(manualBody.includes('主訴・患者の発言'));
  assert.ok(manualBody.includes('aria-label="S エントリを削除"'));
  assert.ok(manualBody.includes('体調良好</textarea>'));
  assert.ok(!manualBody.includes('ai-unconfirmed-badge'));
  assert.ok(!manualBody.includes('btn-approve-ai'));
  assert.ok(!manualBody.includes('legacy-badge'));

  const unconfirmedHtml = renderToStaticMarkup(
    React.createElement(SoapEntryBox, {
      entry: {
        id: 'e-2',
        type: 'P',
        text: '次回残薬確認',
        origin: 'ai_draft',
        aiStatus: 'unconfirmed'
      },
      onChange: () => {},
      onRemove: () => {},
      onApprove: () => {}
    })
  );
  assert.ok(unconfirmedHtml.includes('entry-ai-unconfirmed'));
  assert.ok(unconfirmedHtml.includes('AI下書き（未確認）'));
  assert.ok(unconfirmedHtml.includes('class="btn-approve-ai"'));
  assert.ok(unconfirmedHtml.includes('この内容で承認'));
  assert.ok(unconfirmedHtml.includes('textarea-ai-unconfirmed'));
  assert.ok(unconfirmedHtml.includes('class="ai-unconfirmed-hint"'));

  const unconfirmedNoHandlerHtml = renderToStaticMarkup(
    React.createElement(SoapEntryBox, {
      entry: {
        id: 'e-2b',
        type: 'P',
        text: '下書き',
        origin: 'ai_draft',
        aiStatus: 'unconfirmed'
      },
      onChange: () => {},
      onRemove: () => {}
    })
  );
  const unconfirmedNoHandlerBody = stripStyles(unconfirmedNoHandlerHtml);
  assert.ok(!unconfirmedNoHandlerBody.includes('btn-approve-ai'));

  const approvedHtml = renderToStaticMarkup(
    React.createElement(SoapEntryBox, {
      entry: {
        id: 'e-3',
        type: 'A',
        text: 'コンプライアンス良好',
        origin: 'ai_draft',
        aiStatus: 'approved'
      },
      onChange: () => {},
      onRemove: () => {}
    })
  );
  assert.ok(approvedHtml.includes('entry-ai-approved'));
  assert.ok(approvedHtml.includes('AI下書き（承認済）'));

  const modifiedHtml = renderToStaticMarkup(
    React.createElement(SoapEntryBox, {
      entry: {
        id: 'e-4',
        type: 'O',
        text: '手直し済み',
        origin: 'ai_draft',
        aiStatus: 'modified'
      },
      onChange: () => {},
      onRemove: () => {}
    })
  );
  assert.ok(modifiedHtml.includes('AI下書き（修正済）'));

  const legacyHtml = renderToStaticMarkup(
    React.createElement(SoapEntryBox, {
      entry: {
        id: 'e-5',
        type: 'S',
        text: '移行データ',
        origin: 'legacy_unspecified'
      },
      onChange: () => {},
      onRemove: () => {}
    })
  );
  assert.ok(legacyHtml.includes('class="legacy-badge"'));
  assert.ok(legacyHtml.includes('由来記録なし'));
});

test('SoapHistoryQuickCard caps preview at 2 visits, opens only the latest entry, and shows total count button', () => {
  const readyHtml = renderToStaticMarkup(
    React.createElement(SoapHistoryQuickCard, {
      entries: SAMPLE_HISTORY,
      isLoading: false,
      hasError: false,
      onOpenFullHistory: () => {}
    })
  );
  assert.ok(readyHtml.includes('前回までの薬歴'));
  assert.ok(readyHtml.includes('受付 #3'));
  assert.ok(readyHtml.includes('受付 #2'));
  assert.ok(!readyHtml.includes('受付 #1'));
  assert.ok(readyHtml.includes('経過タブで全て見る（3回分）'));

  const openDetailsMatches = readyHtml.match(/<details class="quick-entry" open=""/g) ?? [];
  assert.strictEqual(openDetailsMatches.length, 1);

  const emptyHtml = renderToStaticMarkup(
    React.createElement(SoapHistoryQuickCard, {
      entries: [],
      isLoading: false,
      hasError: false,
      onOpenFullHistory: () => {}
    })
  );
  const emptyBody = stripStyles(emptyHtml);
  assert.ok(emptyBody.includes('class="quick-empty"'));
  assert.ok(!emptyBody.includes('quick-open-full'));

  const errorHtml = renderToStaticMarkup(
    React.createElement(SoapHistoryQuickCard, {
      entries: [],
      isLoading: false,
      hasError: true,
      onOpenFullHistory: () => {}
    })
  );
  assert.ok(errorHtml.includes('class="quick-empty"'));
});

test('SoapHistoryPanel renders tabpanel attributes, hidden flag, and full history without truncation', () => {
  const html = renderToStaticMarkup(
    React.createElement(SoapHistoryPanel, {
      entries: SAMPLE_HISTORY,
      isLoading: false,
      hasError: false,
      hidden: false
    })
  );
  assert.ok(html.includes('role="tabpanel"'));
  assert.ok(html.includes('id="history-panel"'));
  assert.ok(html.includes('aria-labelledby="tab-history"'));
  assert.doesNotMatch(html, /<div\b[^>]*class="soap-history-panel"[^>]*\shidden=""(?=[\s/>]|$)/);
  assert.ok(html.includes('受付 #3'));
  assert.ok(html.includes('受付 #2'));
  assert.ok(html.includes('受付 #1'));

  const hiddenLoadingHtml = renderToStaticMarkup(
    React.createElement(SoapHistoryPanel, {
      entries: [],
      isLoading: true,
      hasError: false,
      hidden: true
    })
  );
  assert.match(
    hiddenLoadingHtml,
    /<div\b[^>]*class="soap-history-panel"[^>]*\shidden=""(?=[\s/>]|$)/
  );
  assert.ok(hiddenLoadingHtml.includes('class="soap-history-empty"'));
});

test('SoapStructuredAssessmentPanel renders radiogroup chips inside component scope and cycles options cleanly', () => {
  const unconfirmedHtml = renderToStaticMarkup(
    React.createElement(SoapStructuredAssessmentPanel, {
      assessment: {},
      onChange: () => {}
    })
  );
  const unconfirmedBody = stripStyles(unconfirmedHtml);
  assert.ok(unconfirmedBody.includes('薬歴構造化チェック'));
  assert.ok(unconfirmedBody.includes('未確認 5項目'));
  assert.ok(unconfirmedBody.includes('class="soap-structured-field unconfirmed"'));
  assert.ok(unconfirmedBody.includes('role="radiogroup"'));
  assert.ok(unconfirmedBody.includes('role="radio"'));
  assert.ok(unconfirmedBody.includes('assessment-chip selected is-unknown'));

  const confirmedHtml = renderToStaticMarkup(
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
  const confirmedBody = stripStyles(confirmedHtml);
  assert.ok(confirmedBody.includes('全項目確認済み'));
  assert.ok(confirmedBody.includes('class="soap-structured-field confirmed"'));
  assert.ok(!confirmedBody.includes('class="soap-structured-field unconfirmed"'));

  const adherenceControl = soapStructuredAssessmentControls[0];
  assert.strictEqual(adherenceControl.field, 'adherence');
  if (adherenceControl.field === 'adherence') {
    const firstOpt = adherenceControl.options[0][0];
    const secondOpt = adherenceControl.options[1][0];
    const lastOpt = adherenceControl.options[adherenceControl.options.length - 1][0];
    assert.strictEqual(computeNextStructuredAssessmentValue(adherenceControl, firstOpt, 1), secondOpt);
    assert.strictEqual(computeNextStructuredAssessmentValue(adherenceControl, firstOpt, -1), lastOpt);
  }
});
