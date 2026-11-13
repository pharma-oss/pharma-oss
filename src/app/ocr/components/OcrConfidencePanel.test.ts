import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OcrConfidenceReport, OcrConfidenceSeverity, OcrReviewPoint } from '@/lib/ocr_confidence';
import { findOpeningTag, stripStyleBlocks } from '@/lib/test_support/html_disabled_tags';
import { OcrConfidencePanel, OcrRawTextArea } from './OcrConfidencePanel';

function makePoint(
  index: number,
  severity: OcrConfidenceSeverity = 'warning',
  overrides: Partial<OcrReviewPoint> = {}
): OcrReviewPoint {
  return {
    field: `field_${index}`,
    label: `項目-${index}`,
    severity,
    message: `確認メッセージ-${index}`,
    suggestedAction: `推奨アクション-${index}`,
    ...overrides
  };
}

function makeReport(overrides: Partial<OcrConfidenceReport> = {}): OcrConfidenceReport {
  return {
    score: 92,
    label: '高信頼',
    tone: 'green',
    reviewPoints: [],
    evidence: ['証拠1', '証拠2'],
    ...overrides
  };
}

function renderRawTextArea(isProcessing: boolean, ocrResult: string): string {
  return stripStyleBlocks(
    renderToStaticMarkup(
      React.createElement(OcrRawTextArea, {
        isProcessing,
        ocrResult
      })
    )
  );
}

function renderConfidencePanel(
  report: OcrConfidenceReport,
  options: { isProcessing?: boolean; hasImage?: boolean } = {}
): string {
  return stripStyleBlocks(
    renderToStaticMarkup(
      React.createElement(OcrConfidencePanel, {
        report,
        isProcessing: options.isProcessing ?? false,
        hasImage: options.hasImage ?? true
      })
    )
  );
}

describe('OcrRawTextArea UI states', () => {
  it('renders readonly textarea with maxLength=10000 and switches text between processing, empty, and loaded states', () => {
    const processingHtml = renderRawTextArea(true, '既存のOCRテキスト');
    const textareaTag = findOpeningTag(processingHtml, 'id="ocrRawText"', 'textarea');
    assert.match(textareaTag, /\breadonly\b/i);
    assert.match(textareaTag, /\bmaxlength="10000"/i);
    assert.ok(processingHtml.includes('<label for="ocrRawText">OCR RAW テキスト</label>'));
    assert.ok(processingHtml.includes('>解析中...</textarea>'));
    assert.ok(!processingHtml.includes('既存のOCRテキスト'));

    const emptyHtml = renderRawTextArea(false, '');
    assert.ok(emptyHtml.includes('>データがありません</textarea>'));
    assert.ok(!emptyHtml.includes('解析中...'));

    const loadedHtml = renderRawTextArea(false, '処方箋OCR読取結果ABC');
    assert.ok(loadedHtml.includes('>処方箋OCR読取結果ABC</textarea>'));
    assert.ok(!loadedHtml.includes('データがありません'));
    assert.ok(!loadedHtml.includes('解析中...'));
  });
});

describe('OcrConfidencePanel UI states and caps', () => {
  it('returns empty markup when hasImage is false regardless of report or processing state', () => {
    const htmlIdle = renderConfidencePanel(
      makeReport({
        tone: 'red',
        reviewPoints: [makePoint(1, 'critical')]
      }),
      { isProcessing: false, hasImage: false }
    );
    assert.equal(htmlIdle, '');

    const htmlBusy = renderConfidencePanel(makeReport(), {
      isProcessing: true,
      hasImage: false
    });
    assert.equal(htmlBusy, '');
  });

  it('shows processing placeholders while hiding score, report evidence, review points, and empty banner', () => {
    const html = renderConfidencePanel(
      makeReport({
        score: 48,
        label: '要重点確認',
        tone: 'red',
        evidence: ['通常証拠A', '通常証拠B'],
        reviewPoints: [makePoint(10, 'critical')]
      }),
      { isProcessing: true, hasImage: true }
    );

    const sectionTag = findOpeningTag(html, 'aria-label="OCR信頼度と人手確認ポイント"', 'section');
    assert.match(sectionTag, /\bocr-confidence-panel\b/);
    assert.match(sectionTag, /\btone-red\b/);
    assert.doesNotMatch(sectionTag, /\btone-(green|amber)\b/);

    assert.ok(html.includes('<strong>解析中</strong>'));
    assert.ok(!html.includes('48%'));
    assert.ok(html.includes('<span class="status-chip compact warning">読取中</span>'));
    assert.ok(!html.includes('要重点確認'));
    assert.ok(html.includes('<div class="ocr-confidence-evidence"><span>OCR解析を実行中</span></div>'));
    assert.ok(!html.includes('通常証拠A'));
    assert.ok(!html.includes('ocr-review-point-list'));
    assert.ok(!html.includes('確認メッセージ-10'));
    assert.ok(!html.includes('ocr-review-empty'));
  });

  it('maps green vs amber/red tones to confirmed vs warning chip classes and caps evidence at 3 items', () => {
    const greenHtml = renderConfidencePanel(
      makeReport({
        score: 95,
        label: '確認良好',
        tone: 'green',
        evidence: ['証拠-1', '証拠-2', '証拠-3', '証拠-4'],
        reviewPoints: []
      })
    );

    const greenSection = findOpeningTag(greenHtml, 'aria-label="OCR信頼度と人手確認ポイント"', 'section');
    assert.match(greenSection, /\btone-green\b/);
    assert.ok(greenHtml.includes('<strong>95%</strong>'));
    assert.ok(greenHtml.includes('<span class="status-chip compact confirmed">確認良好</span>'));
    assert.ok(!greenHtml.includes('status-chip compact warning'));
    assert.ok(greenHtml.includes('<span>証拠-1</span><span>証拠-2</span><span>証拠-3</span>'));
    assert.ok(!greenHtml.includes('証拠-4'));
    assert.ok(
      greenHtml.includes(
        '<div class="ocr-review-empty">主要項目に大きな確認ポイントはありません。保存前に処方箋原本との最終確認を行ってください。</div>'
      )
    );
    assert.ok(!greenHtml.includes('ocr-review-point-list'));

    const amberHtml = renderConfidencePanel(
      makeReport({
        score: 74,
        label: '一部要確認',
        tone: 'amber',
        evidence: ['根拠A'],
        reviewPoints: [makePoint(1, 'info')]
      })
    );
    const amberSection = findOpeningTag(amberHtml, 'aria-label="OCR信頼度と人手確認ポイント"', 'section');
    assert.match(amberSection, /\btone-amber\b/);
    assert.doesNotMatch(amberSection, /\btone-(green|red)\b/);
    assert.ok(amberHtml.includes('<span class="status-chip compact warning">一部要確認</span>'));
    assert.ok(!amberHtml.includes('status-chip compact confirmed'));
    assert.ok(!amberHtml.includes('ocr-review-empty'));
  });

  it('renders severity classes and caps reviewPoints at 5 items while excluding the 6th', () => {
    const points: OcrReviewPoint[] = [
      makePoint(1, 'critical'),
      makePoint(2, 'warning'),
      makePoint(3, 'info'),
      makePoint(4, 'warning'),
      makePoint(5, 'critical'),
      makePoint(6, 'info')
    ];

    const html = renderConfidencePanel(
      makeReport({
        score: 42,
        label: '要精密確認',
        tone: 'red',
        evidence: ['根拠1', '根拠2'],
        reviewPoints: points
      })
    );

    const pointDivMatches = html.match(/class="ocr-review-point severity-(critical|warning|info)"/g) ?? [];
    assert.equal(pointDivMatches.length, 5);
    assert.ok(html.includes('<div class="ocr-review-point severity-critical">'));
    assert.ok(html.includes('<div class="ocr-review-point severity-warning">'));
    assert.ok(html.includes('<div class="ocr-review-point severity-info">'));

    for (let i = 1; i <= 5; i += 1) {
      assert.ok(html.includes(`<span class="ocr-review-point-label">項目-${i}</span>`));
      assert.ok(html.includes(`<span class="ocr-review-point-message">確認メッセージ-${i}</span>`));
      assert.ok(html.includes(`<span class="ocr-review-point-action">推奨アクション-${i}</span>`));
    }
    assert.ok(!html.includes('項目-6'));
    assert.ok(!html.includes('確認メッセージ-6'));
    assert.ok(!html.includes('推奨アクション-6'));
    assert.ok(!html.includes('ocr-review-empty'));
  });
});

