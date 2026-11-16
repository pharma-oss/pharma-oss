import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DatabaseContext } from '@/db/DatabaseContext';
import {
  renderMarkupWithReactUseStateMock,
  renderWithReactUseStateMock,
  type UseStateOverrideSpec
} from '@/lib/test_support/react_use_state_mock';
import { SoapSaveStatusIndicator, type SoapProblem } from './emr/components/SoapComponents';
import { SoapEditor } from './emr/components/SoapEditor';

const SAMPLE_PROBLEMS: SoapProblem[] = [
  {
    id: 'prob-1',
    title: '#1 高血圧症フォロー',
    entries: [
      { id: 'e-s', type: 'S', text: '家庭血圧 128/78 mmHg' },
      { id: 'e-p', type: 'P', text: '次回血圧手帳を確認する', origin: 'ai_draft', aiStatus: 'unconfirmed' }
    ]
  }
];

function soapEditorHookAssertions(): Record<number, UseStateOverrideSpec> {
  return {
    0: { assertInitial: (v) => assert.strictEqual(v, null) },
    1: { assertInitial: (v) => assert.ok(Array.isArray(v) && v.length === 1) },
    2: { assertInitial: (v) => assert.strictEqual(v, null) },
    3: { assertInitial: (v) => assert.ok(Array.isArray(v) && v.length === 0) },
    4: { assertInitial: (v) => assert.strictEqual(v, false) },
    5: { assertInitial: (v) => assert.strictEqual(typeof v, 'function') },
    6: { assertInitial: (v) => assert.strictEqual(v, 'loading') },
    7: { assertInitial: (v) => assert.strictEqual(v, '') },
    8: { assertInitial: (v) => assert.strictEqual(v, false) }
  };
}

function renderSoapEditor(overrides: Record<number, UseStateOverrideSpec> = {}) {
  const base = soapEditorHookAssertions();
  const merged: Record<number, UseStateOverrideSpec> = { ...base };
  for (const [idx, spec] of Object.entries(overrides)) {
    const numIdx = Number(idx);
    merged[numIdx] = { ...base[numIdx], ...spec };
  }
  return renderWithReactUseStateMock(
    () =>
      React.createElement(
        DatabaseContext.Provider,
        { value: null },
        React.createElement(SoapEditor, { targetVisitId: 'V-001' })
      ),
    {
      componentName: 'SoapEditor',
      restoreAtCallIndex: 8,
      expectedCalls: 9,
      overrides: merged
    }
  );
}

test('SoapSaveStatusIndicator renders all save statuses with accessible role="status" and conditional saved timestamp', () => {
  const cases = [
    { status: 'loading' as const, label: '読込中', className: 'status-loading' },
    { status: 'saving' as const, label: '保存中', className: 'status-saving' },
    { status: 'dirty' as const, label: '未保存の変更あり', className: 'status-dirty' },
    { status: 'error' as const, label: '保存失敗', className: 'status-error' },
    { status: 'saved' as const, label: '自動保存済み', className: 'status-saved' }
  ];

  for (const c of cases) {
    const html = renderToStaticMarkup(
      React.createElement(SoapSaveStatusIndicator, {
        status: c.status,
        lastSavedAt: '2026-11-15T10:15:00+09:00'
      })
    );
    assert.ok(html.includes(`class="soap-save-status ${c.className}"`));
    assert.ok(html.includes('role="status"'));
    assert.ok(html.includes('aria-live="polite"'));
    assert.ok(html.includes(`<strong>${c.label}</strong>`));
    if (c.status === 'saved') {
      assert.ok(html.includes('<small>10:15</small>'));
    } else {
      assert.ok(!html.includes('<small>'));
    }
  }

  const savedWithoutTime = renderToStaticMarkup(
    React.createElement(SoapSaveStatusIndicator, { status: 'saved' })
  );
  assert.ok(!savedWithoutTime.includes('<small>'));
});

test('SoapEditor renders empty-visit guidance when hasResolvedVisit is false', () => {
  const html = renderMarkupWithReactUseStateMock(
    () =>
      React.createElement(
        DatabaseContext.Provider,
        { value: null },
        React.createElement(SoapEditor, { targetVisitId: null })
      ),
    {
      componentName: 'SoapEditor',
      restoreAtCallIndex: 8,
      expectedCalls: 9,
      overrides: {
        ...soapEditorHookAssertions(),
        0: { ...soapEditorHookAssertions()[0], value: false }
      }
    }
  );

  assert.ok(html.includes('class="soap-editor-empty"'));
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes('受付が選択されていません'));
  assert.ok(html.includes('href="/ocr"'));
  assert.ok(html.includes('href="/app"'));
  assert.doesNotMatch(html, /class="soap-editor-container"/);
});

test('SoapEditor renders toolbar, structured assessment, problem entries, and past problem menu when visit is active', () => {
  const { html, callCount } = renderSoapEditor({
    0: { value: true },
    1: { value: SAMPLE_PROBLEMS },
    3: { value: ['高血圧症', '脂質異常症'] },
    6: { value: 'saved' },
    7: { value: '2026-11-15T10:15:00+09:00' },
    8: { value: true }
  });

  assert.strictEqual(callCount, 9);
  assert.ok(html.includes('class="soap-editor-container"'));
  assert.ok(html.includes('Ctrl(⌘)+Enter で即時保存'));
  assert.ok(html.includes('自動保存済み'));
  assert.ok(html.includes('10:15'));
  assert.ok(html.includes('薬歴構造化チェック'));
  assert.match(html, /<input\b[^>]*value="#1 高血圧症フォロー"/);
  assert.ok(html.includes('家庭血圧 128/78 mmHg'));
  assert.ok(html.includes('AI下書き（未確認）'));
  assert.ok(html.includes('+ S'));
  assert.ok(html.includes('+ O'));
  assert.ok(html.includes('+ A'));
  assert.ok(html.includes('+ P'));
  assert.ok(html.includes('aria-haspopup="menu"'));
  assert.ok(html.includes('aria-expanded="true"'));
  assert.ok(html.includes('role="menu"'));
  assert.ok(html.includes('>高血圧症</button>'));
  assert.ok(html.includes('>脂質異常症</button>'));
});

test('SoapEditor disables past problem trigger when no suggestions and no error exist', () => {
  const { html } = renderSoapEditor({
    0: { value: true }
  });

  assert.match(
    html,
    /<button\b[^>]*class="past-problem-trigger"[^>]*\sdisabled=""(?=[\s/>]|$)/
  );
  assert.ok(!html.includes('role="menu"'));
});
