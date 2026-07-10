import { test } from 'node:test';
import assert from 'node:assert';
import { formatDrugDisplayName } from './drug_display.ts';

test('formatDrugDisplayName removes ingredient labels from display text', () => {
  assert.strictEqual(formatDrugDisplayName('成分: アムロジピン錠5mg'), 'アムロジピン錠5mg');
  assert.strictEqual(formatDrugDisplayName('薬品名：ロキソニン錠60mg'), 'ロキソニン錠60mg');
  assert.strictEqual(formatDrugDisplayName('カロナール錠200（成分: アセトアミノフェン）'), 'カロナール錠200');
});

test('formatDrugDisplayName keeps regular drug names unchanged', () => {
  assert.strictEqual(formatDrugDisplayName('【般】アムロジピン錠5mg'), '【般】アムロジピン錠5mg');
  assert.strictEqual(formatDrugDisplayName(''), '');
});
