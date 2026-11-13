import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  PrescriptionInputAuditIssue,
  PrescriptionInputAuditResult,
  PrescriptionInputAuditSeverity
} from '@/lib/prescription_input_audit';
import { findOpeningTag, stripStyleBlocks } from '@/lib/test_support/html_disabled_tags';
import { PrescriptionAuditPanel } from './PrescriptionAuditPanel';

function makeIssue(
  index: number,
  severity: PrescriptionInputAuditSeverity = 'warning',
  overrides: Partial<PrescriptionInputAuditIssue> = {}
): PrescriptionInputAuditIssue {
  return {
    severity,
    code: `AUDIT_CODE_${index}`,
    title: `監査項目タイトル-${index}`,
    message: `監査詳細メッセージ-${index}`,
    ...overrides
  };
}

function makeAudit(overrides: Partial<PrescriptionInputAuditResult> = {}): PrescriptionInputAuditResult {
  return {
    issues: [],
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    ...overrides
  };
}

function renderPanel(audit: PrescriptionInputAuditResult, hasCurrentInput: boolean): string {
  return stripStyleBlocks(
    renderToStaticMarkup(
      React.createElement(PrescriptionAuditPanel, {
        audit,
        hasCurrentInput
      })
    )
  );
}

describe('PrescriptionAuditPanel UI states and markup pinning', () => {
  it('renders nothing when hasCurrentInput is false and renders ok tone, counts, and empty message when there are no issues', () => {
    const emptyHidden = renderPanel(
      makeAudit({
        issues: [makeIssue(1, 'error')],
        errorCount: 1
      }),
      false
    );
    assert.equal(emptyHidden, '');

    const okHtml = renderPanel(makeAudit(), true);
    const sectionTag = findOpeningTag(okHtml, 'aria-label="処方入力後チェック"', 'section');
    assert.match(sectionTag, /\bprescription-audit-panel\b/);
    assert.match(sectionTag, /\bok\b/);
    assert.doesNotMatch(sectionTag, /\b(error|warning)\b/);
    assert.ok(okHtml.includes('lucide-shield-check'));
    assert.ok(okHtml.includes('<strong>保存前チェックOK</strong>'));
    assert.ok(okHtml.includes('<span class="audit-count error">要修正 0</span>'));
    assert.ok(okHtml.includes('<span class="audit-count warning">要確認 0</span>'));
    assert.ok(okHtml.includes('<span class="audit-count info">確認 0</span>'));
    assert.ok(okHtml.includes('<div class="audit-ok-message">未解決の監査項目はありません</div>'));
    assert.ok(!okHtml.includes('audit-issue-list'));
    assert.ok(!okHtml.includes('audit-more'));
  });

  it('renders error tone with priority over warnings and displays all three severity badges', () => {
    const cases: Array<{ severity: PrescriptionInputAuditSeverity; label: string; issue: PrescriptionInputAuditIssue }> = [
      { severity: 'error', label: '要修正', issue: makeIssue(101, 'error') },
      { severity: 'warning', label: '要確認', issue: makeIssue(102, 'warning') },
      { severity: 'info', label: '確認', issue: makeIssue(103, 'info') }
    ];

    const html = renderPanel(
      makeAudit({
        issues: cases.map((item) => item.issue),
        errorCount: 2,
        warningCount: 3,
        infoCount: 1
      }),
      true
    );

    const sectionTag = findOpeningTag(html, 'aria-label="処方入力後チェック"', 'section');
    assert.match(sectionTag, /\berror\b/);
    assert.doesNotMatch(sectionTag, /\b(warning|ok)\b/);
    assert.ok(html.includes('lucide-triangle-alert'));
    assert.ok(html.includes('<strong>要修正 2件</strong>'));
    assert.ok(html.includes('<span class="audit-count error">要修正 2</span>'));
    assert.ok(html.includes('<span class="audit-count warning">要確認 3</span>'));
    assert.ok(html.includes('<span class="audit-count info">確認 1</span>'));
    assert.ok(!html.includes('未解決の監査項目はありません'));

    for (const item of cases) {
      const liTag = findOpeningTag(html, item.issue.title, 'li');
      assert.match(liTag, new RegExp(`\\baudit-issue\\s+${item.severity}\\b`));
      assert.ok(html.includes(`<span class="audit-severity">${item.label}</span>`));
      assert.ok(html.includes(`<strong>${item.issue.title}</strong>`));
      assert.ok(html.includes(`<p>${item.issue.message}</p>`));
    }
  });

  it('renders warning tone when errorCount is zero and keeps ok tone with issue list when only infoCount is positive', () => {
    const warningHtml = renderPanel(
      makeAudit({
        issues: [makeIssue(201, 'warning')],
        errorCount: 0,
        warningCount: 2,
        infoCount: 1
      }),
      true
    );

    const warningSection = findOpeningTag(warningHtml, 'aria-label="処方入力後チェック"', 'section');
    assert.match(warningSection, /\bwarning\b/);
    assert.doesNotMatch(warningSection, /\b(error|ok)\b/);
    assert.ok(warningHtml.includes('lucide-triangle-alert'));
    assert.ok(warningHtml.includes('<strong>要確認 2件</strong>'));
    assert.ok(warningHtml.includes('<span class="audit-count error">要修正 0</span>'));
    assert.ok(warningHtml.includes('<span class="audit-count warning">要確認 2</span>'));
    assert.ok(warningHtml.includes('<span class="audit-count info">確認 1</span>'));

    const infoOnlyHtml = renderPanel(
      makeAudit({
        issues: [makeIssue(202, 'info'), makeIssue(203, 'info')],
        errorCount: 0,
        warningCount: 0,
        infoCount: 2
      }),
      true
    );

    const infoSection = findOpeningTag(infoOnlyHtml, 'aria-label="処方入力後チェック"', 'section');
    assert.match(infoSection, /\bok\b/);
    assert.doesNotMatch(infoSection, /\b(error|warning)\b/);
    assert.ok(infoOnlyHtml.includes('lucide-shield-check'));
    assert.ok(infoOnlyHtml.includes('<strong>保存前チェックOK</strong>'));
    assert.ok(infoOnlyHtml.includes('<span class="audit-count info">確認 2</span>'));
    assert.ok(infoOnlyHtml.includes('監査項目タイトル-202'));
    assert.ok(!infoOnlyHtml.includes('未解決の監査項目はありません'));
  });

  it('caps visible issues at 5 items and renders hidden count strictly when issues exceed 5', () => {
    const fiveIssues = Array.from({ length: 5 }, (_, idx) => makeIssue(idx + 1, 'warning'));
    const fiveHtml = renderPanel(
      makeAudit({ issues: fiveIssues, warningCount: 5 }),
      true
    );

    for (let idx = 1; idx <= 5; idx += 1) {
      assert.ok(fiveHtml.includes(`監査項目タイトル-${idx}`));
    }
    assert.ok(!fiveHtml.includes('audit-more'));
    assert.ok(!fiveHtml.includes('他 '));

    const sevenIssues = Array.from({ length: 7 }, (_, idx) => makeIssue(idx + 1, 'warning'));
    const sevenHtml = renderPanel(
      makeAudit({ issues: sevenIssues, warningCount: 7 }),
      true
    );

    for (let idx = 1; idx <= 5; idx += 1) {
      assert.ok(sevenHtml.includes(`監査項目タイトル-${idx}`));
    }
    assert.ok(!sevenHtml.includes('監査項目タイトル-6'));
    assert.ok(!sevenHtml.includes('監査項目タイトル-7'));
    assert.ok(sevenHtml.includes('<li class="audit-more">他 2 件</li>'));
  });
});

