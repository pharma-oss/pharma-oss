import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  PrescriptionHistoryChange,
  PrescriptionHistoryTimelineEntry
} from '@/lib/prescription_history_compare';
import { findOpeningTag, stripStyleBlocks } from '@/lib/test_support/html_disabled_tags';
import {
  PRESCRIPTION_HISTORY_LOAD_ERROR_MESSAGE,
  PRESCRIPTION_HISTORY_LOAD_ERROR_TITLE,
  PrescriptionHistoryComparePanel
} from './PrescriptionHistoryComparePanel';

function makeEntry(
  visitId: string,
  dateLabel: string,
  changes: PrescriptionHistoryChange[],
  counts: { added?: number; stopped?: number; changed?: number; unchanged?: number } = {},
  institutionName?: string
): PrescriptionHistoryTimelineEntry {
  return {
    snapshot: {
      visitId,
      dateLabel,
      institutionName,
      items: []
    },
    comparison: {
      changes,
      addedCount: counts.added ?? changes.filter((c) => c.kind === 'added').length,
      stoppedCount: counts.stopped ?? changes.filter((c) => c.kind === 'stopped').length,
      changedCount: counts.changed ?? changes.filter((c) => c.kind === 'changed').length,
      unchangedCount: counts.unchanged ?? changes.filter((c) => c.kind === 'unchanged').length
    }
  };
}

function renderComparePanel(params: {
  timeline?: PrescriptionHistoryTimelineEntry[];
  isLoading?: boolean;
  hasError?: boolean;
  hasPatientContext?: boolean;
  hasCurrentInput?: boolean;
}): string {
  return stripStyleBlocks(
    renderToStaticMarkup(
      React.createElement(PrescriptionHistoryComparePanel, {
        timeline: params.timeline ?? [],
        isLoading: params.isLoading ?? false,
        hasError: params.hasError ?? false,
        hasPatientContext: params.hasPatientContext ?? true,
        hasCurrentInput: params.hasCurrentInput ?? true
      })
    )
  );
}

describe('PrescriptionHistoryComparePanel UI states and diff list', () => {
  it('returns empty markup when patient context or current input is missing', () => {
    const sampleTimeline = [
      makeEntry('V-0', '2026/05/01', [{ kind: 'added', label: '新規薬A', fieldChanges: [] }])
    ];

    assert.equal(
      renderComparePanel({
        timeline: sampleTimeline,
        hasPatientContext: false,
        hasCurrentInput: true
      }),
      ''
    );
    assert.equal(
      renderComparePanel({
        timeline: sampleTimeline,
        hasPatientContext: true,
        hasCurrentInput: false
      }),
      ''
    );
  });

  it('renders loading, alert error, and empty body states', () => {
    const loadingHtml = renderComparePanel({
      isLoading: true,
      hasError: true,
      timeline: [makeEntry('V-1', '2026/05/01', [{ kind: 'added', label: '薬A', fieldChanges: [] }])]
    });
    assert.ok(loadingHtml.includes('<strong>読み込み中</strong>'));
    assert.ok(loadingHtml.includes('過去2回分の処方を確認しています'));
    assert.ok(!loadingHtml.includes('role="alert"'));
    assert.ok(!loadingHtml.includes('history-error'));
    assert.ok(!loadingHtml.includes('history-snapshot-list'));

    const errorHtml = renderComparePanel({
      isLoading: false,
      hasError: true,
      timeline: []
    });
    assert.ok(errorHtml.includes(`<strong>${PRESCRIPTION_HISTORY_LOAD_ERROR_TITLE}</strong>`));
    const errorBox = findOpeningTag(errorHtml, PRESCRIPTION_HISTORY_LOAD_ERROR_MESSAGE, 'div');
    assert.match(errorBox, /\bhistory-empty\b/);
    assert.match(errorBox, /\bhistory-error\b/);
    assert.match(errorBox, /\brole="alert"/);
    assert.ok(!errorHtml.includes('history-snapshot-list'));

    const emptyHtml = renderComparePanel({
      isLoading: false,
      hasError: false,
      timeline: []
    });
    const emptySection = findOpeningTag(emptyHtml, 'aria-label="過去処方比較"', 'section');
    assert.match(emptySection, /\bstable\b/);
    assert.doesNotMatch(emptySection, /\bchanged\b/);
    assert.ok(emptyHtml.includes('<strong>過去処方なし</strong>'));
    assert.ok(emptyHtml.includes('この患者の過去処方はまだありません'));
    assert.ok(!emptyHtml.includes('role="alert"'));
    assert.ok(!emptyHtml.includes('history-snapshot-list'));
  });

  it('renders stable tone when only unchanged items exist and shows no-changes message', () => {
    const html = renderComparePanel({
      timeline: [
        makeEntry(
          'V-STABLE',
          '2026/04/10',
          [
            { kind: 'unchanged', label: '継続薬A', fieldChanges: [] },
            { kind: 'unchanged', label: '継続薬B', fieldChanges: [] }
          ],
          { unchanged: 2 }
        )
      ]
    });

    const section = findOpeningTag(html, 'aria-label="過去処方比較"', 'section');
    assert.match(section, /\bprescription-history-panel\b/);
    assert.match(section, /\bstable\b/);
    assert.doesNotMatch(section, /\bchanged\b/);
    assert.ok(html.includes('<strong>過去1回分を確認</strong>'));
    assert.ok(html.includes('<span>前回</span><strong>2026/04/10</strong>'));
    assert.ok(html.includes('aria-label="前回比較件数"'));
    assert.ok(html.includes('<span class="history-count unchanged">継続 2</span>'));
    assert.ok(html.includes('<div class="history-empty">この回からの処方変更はありません</div>'));
    assert.ok(!html.includes('history-change-list'));
    assert.ok(!html.includes('継続薬A'));
  });

  it('renders changed tone, snapshot indices, field diffs, added/stopped hints, and caps visible changes at 4 per snapshot', () => {
    const timeline: PrescriptionHistoryTimelineEntry[] = [
      makeEntry(
        'V-PREV-1',
        '2026/05/01',
        [
          { kind: 'unchanged', label: '継続除外薬', fieldChanges: [] },
          {
            kind: 'changed',
            label: '用量変更薬1',
            fieldChanges: [{ field: 'amount', label: '用量', before: '1錠', after: '2錠' }]
          },
          { kind: 'added', label: '新規追加薬2', fieldChanges: [] },
          { kind: 'stopped', label: '今回中止薬3', fieldChanges: [] },
          { kind: 'added', label: '新規追加薬4', fieldChanges: [] },
          { kind: 'stopped', label: '非表示枠薬5', fieldChanges: [] },
          { kind: 'added', label: '非表示枠薬6', fieldChanges: [] }
        ],
        { changed: 1, added: 3, stopped: 2, unchanged: 1 },
        'さくら総合病院'
      ),
      makeEntry(
        'V-PREV-2',
        '2026/04/01',
        [{ kind: 'added', label: '前々回追加薬', fieldChanges: [] }],
        { added: 1, stopped: 0, changed: 0, unchanged: 3 }
      )
    ];

    const html = renderComparePanel({ timeline });

    const section = findOpeningTag(html, 'aria-label="過去処方比較"', 'section');
    assert.match(section, /\bchanged\b/);
    assert.doesNotMatch(section, /\bstable\b/);
    assert.ok(html.includes('<strong>過去2回分を確認</strong>'));

    assert.ok(html.includes('<span>前回</span><strong>2026/05/01 / さくら総合病院</strong>'));
    assert.ok(html.includes('aria-label="前回比較件数"'));
    assert.ok(html.includes('<span>前々回</span><strong>2026/04/01</strong>'));
    assert.ok(html.includes('aria-label="前々回比較件数"'));

    assert.ok(html.includes('<span class="history-count changed">変更 1</span>'));
    assert.ok(html.includes('<span class="history-count added">追加 3</span>'));
    assert.ok(html.includes('<span class="history-count stopped">中止 2</span>'));
    assert.ok(html.includes('<span class="history-count unchanged">継続 1</span>'));

    assert.ok(html.includes('<li class="history-change changed"><span class="history-change-kind">変更</span>'));
    assert.ok(html.includes('<span>用量 1錠 -&gt; 2錠</span>'));
    assert.ok(html.includes('<li class="history-change added"><span class="history-change-kind">追加</span>'));
    assert.ok(html.includes('<p>過去処方から追加されています</p>'));
    assert.ok(html.includes('<li class="history-change stopped"><span class="history-change-kind">中止</span>'));
    assert.ok(html.includes('<p>今回入力から外れています</p>'));
    assert.ok(html.includes('新規追加薬4'));

    assert.ok(!html.includes('継続除外薬'));
    assert.ok(!html.includes('非表示枠薬5'));
    assert.ok(!html.includes('非表示枠薬6'));
    assert.ok(html.includes('<li class="history-more">他 2 件</li>'));
    assert.ok(html.includes('前々回追加薬'));
  });
});

