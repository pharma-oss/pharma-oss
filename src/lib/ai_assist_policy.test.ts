import { test } from 'node:test';
import assert from 'node:assert';
import {
  compareAiAssistModeStrictness,
  filterAiAssistItemsByMode,
  isAiAssistItemVisible,
  normalizeAiAssistMode
} from './ai_assist_policy.ts';

test('normalizeAiAssistMode preserves known modes and defaults legacy values to enabled', () => {
  assert.strictEqual(normalizeAiAssistMode('limited'), 'limited');
  assert.strictEqual(normalizeAiAssistMode('disabled'), 'disabled');
  assert.strictEqual(normalizeAiAssistMode(undefined), 'enabled');
  assert.strictEqual(normalizeAiAssistMode('unexpected'), 'enabled');
});

test('filterAiAssistItemsByMode limits suggestions consistently by severity', () => {
  const items = [
    { id: 'critical', severity: 'critical' as const },
    { id: 'warning', severity: 'warning' as const },
    { id: 'info', severity: 'info' as const }
  ];

  assert.deepStrictEqual(filterAiAssistItemsByMode(items, 'enabled').map((item) => item.id), [
    'critical',
    'warning',
    'info'
  ]);
  assert.deepStrictEqual(filterAiAssistItemsByMode(items, 'limited').map((item) => item.id), [
    'critical'
  ]);
  assert.deepStrictEqual(filterAiAssistItemsByMode(items, 'disabled'), []);
  assert.strictEqual(isAiAssistItemVisible('limited', 'warning'), false);
});

test('compareAiAssistModeStrictness distinguishes aligned, stricter, and unsafe modes', () => {
  assert.strictEqual(compareAiAssistModeStrictness('limited', 'limited'), 'aligned');
  assert.strictEqual(compareAiAssistModeStrictness('disabled', 'limited'), 'stricter');
  assert.strictEqual(compareAiAssistModeStrictness('enabled', 'disabled'), 'change_required');
});
